// tests/ai.test.mjs — integration tests for ✦ Ask: real node:http servers on
// 127.0.0.1 random ports, speaking each backend's actual wire shape, with the
// APP's real aiUrl() pointed at them — no fetch stubbing. Drives the app
// through the harness (askSend/askTerminalSend/askShotUpload) and asserts
// BOTH sides: what the fake server received (method, path, headers, JSON
// body) and what lands back in the app (chat store, rendered bubble,
// rollnotes, status line).
//
// Backend coverage, and why some things aren't separate tests here:
//  - LM Studio / any OpenAI-compatible server: aiRemote() (src/ask/backend.js) is the
//    app's ONE adapter — GET /v1/models, POST /v1/chat/completions
//    (stream:true, SSE deltas). Covered below.
//  - Ollama: the app never speaks Ollama's native API. tools/claude-bridge.mjs
//    probes Ollama's own OpenAI-compatible endpoint and relists its ids
//    (DEFAULT_UPSTREAMS) — from the app's side it's indistinguishable from
//    "another OpenAI-compatible server", and from the bridge's side it's
//    already covered by tests/bridge.test.mjs's upstream-merge test (a fake
//    upstream in the same shape). Nothing app-specific to add here.
//  - Night Roll bridge: the same two routes PLUS /v1/jobs (the job-support
//    probe + x-nr-job/x-nr-song headers), /v1/terminal, and /v1/shot — the
//    only bridge routes askJobsSupported/askRun/askTerminalSend/
//    askShotUpload actually call. Covered below. (/v1/inbox, /v1/status,
//    /v1/sessions, /v1/backup, /v1/deploy, /v1/terminal-prefs exist on the
//    real bridge too, but nothing in the Send path calls them — their
//    SERVER-side behavior is tests/bridge.test.mjs's job, not this file's.)
//  - A cloud backend reached directly: there isn't one. LM Studio, Ollama,
//    and Claude-via-the-bridge are all reached through the same aiUrl() +
//    aiRemote() adapter — "point the base URL at the fake" IS the strategy,
//    not a workaround for one.
//  - WebLLM (in-browser, P3): can't run in node — no navigator.gpu, no
//    @mlc-ai/web-llm. Its selection/fallback (aiProvider() dispatch,
//    aiBrowserTest's no-WebGPU message) is covered without any network.
//  - askPickFiles (🖼 Photos/Files picker): its first step, askPrepImage,
//    decodes through `new Image()` and a `<canvas>` — real browser APIs this
//    harness doesn't stub (same reasoning as the WebGPU gap: NIGHT-ROLL.md
//    "new web APIs are referenced only inside functions"). Covered from
//    askShotUpload downward instead (same upload/attach/send code every
//    screenshot and picked photo shares) — see the 📷 test below.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "./harness.mjs";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function sendJson(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}
function sse(res, obj) { res.write("data: " + JSON.stringify(obj) + "\n\n"); }
function sseDone(res) { res.write("data: [DONE]\n\n"); res.end(); }

// Every request it sees (method, path, headers, raw+parsed body) is recorded
// BEFORE the handler runs, so a test can assert on it even if the handler
// itself 404s. `handler(req, res, rec)` does the actual responding.
function startServer(handler) {
  const requests = [];
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const raw = await readBody(req);
    let json = null;
    if (raw.length) { try { json = JSON.parse(raw.toString("utf8")); } catch (err) { /* not JSON, e.g. an uploaded image */ } }
    const rec = { method: req.method, path: url.pathname, headers: req.headers, raw, json };
    requests.push(rec);
    try { await handler(req, res, rec); } catch (err) { if (!res.headersSent) sendJson(res, 500, { error: String(err && err.message || err) }); else res.end(); }
  });
  return new Promise(resolve => srv.listen(0, "127.0.0.1", () => resolve({
    requests, url: "http://127.0.0.1:" + srv.address().port,
    close: () => new Promise(r => srv.close(r)),
  })));
}

// A fresh app + a minimal editable-enough song, mirroring night-roll.test.mjs's
// own mkAsk helper (P4 ASK_SYS/askContext tests) — same fields, proven
// sufficient for askContext/askSend's own needs.
async function mkApp(mode, extra) {
  const app = await createApp({ storage: { "ff1roll-mode": mode || "learning" } });
  // the harness's default fetch rejects ("no network in tests" — every other
  // suite stubs it inline per-test); these ARE network tests, so point the
  // app's real fetch at Node's real one — `app.context` is the same
  // contextified object vm.createContext handed back, so this reaches every
  // bare `fetch(...)` call in src/ exactly like any other global.
  app.context.fetch = fetch;
  app.run(`
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}],
            tracks: [{name: "melody", notes: [{t: 0, d: 480, p: 60, v: 80}, {t: 480, d: 480, p: 64, v: 80}]}]};
    songKey = "midi/test.mid"; songEndTick = 4 * 480; playCursor = 0; playing = false; playRate = 1; viewMode = "roll";
    trackState = [{muted: false, solo: false}]; rollnotes = []; keyRegions = []; declaredTs = null; previewSf = null; multiSel = [];
    askAppState = () => "app: stub";
    finalizeNotes();
    ${extra || ""}
  `);
  return app;
}
const run = (app, code) => app.run(code);
const val = (app, code) => JSON.parse(app.run(`JSON.stringify(${code})`));

test("Ask round trip: OpenAI-compatible server (LM Studio shape) — the real request reaches the fake server; the reply lands in the chat", async () => {
  const srv = await startServer((req, res, rec) => {
    if (rec.method === "GET" && rec.path === "/v1/models") return sendJson(res, 200, { data: [{ id: "qwen-test" }] });
    if (rec.method === "POST" && rec.path === "/v1/chat/completions") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const w of ["It ", "looks ", "like ", "a ", "ii–V."]) sse(res, { choices: [{ delta: { content: w } }] });
      sse(res, { choices: [{ delta: {}, finish_reason: "stop" }] });
      return sseDone(res);
    }
    res.writeHead(404); res.end();
  });
  const app = await mkApp("learning");
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "qwen-test", aiBackend: "remote"});`);
    run(app, `askinput.value = "what chord is on beat 1?";`);
    await run(app, `askSend()`);

    const reqs = srv.requests.filter(r => r.path === "/v1/chat/completions");
    assert.equal(reqs.length, 1, "one POST to /v1/chat/completions");
    const r = reqs[0];
    assert.equal(r.headers["content-type"], "application/json");
    assert.equal(r.headers["x-nr-job"], undefined, "no job header — this server never advertised /v1/jobs");
    assert.equal(r.headers.authorization, undefined, "no key saved: no Authorization header");
    assert.equal(r.json.model, "qwen-test");
    assert.equal(r.json.stream, true);
    assert.equal(r.json.messages[0].role, "system");
    const last = r.json.messages.at(-1);
    assert.equal(last.role, "user");
    assert.match(last.content, /^<context>\n[\s\S]*\n<\/context>\n\nwhat chord is on beat 1\?$/);
    assert.match(last.content, /song: test — a locked capture the user is studying/);

    assert.equal(val(app, `askLoad().slice(-1)[0].content`), "It looks like a ii–V.", "the streamed reply landed in the stored chat");
    assert.equal(val(app, `asklog.children.length >= 2`), true, "a user bubble and an ai bubble were rendered");

    // the API key, when saved, rides as a real Authorization header
    run(app, `localStorage.setItem("ff1roll-aikey", "secret123"); askinput.value = "and the next one?";`);
    await run(app, `askSend()`);
    const reqs2 = srv.requests.filter(x => x.path === "/v1/chat/completions");
    assert.equal(reqs2[1].headers.authorization, "Bearer secret123");
    run(app, `localStorage.removeItem("ff1roll-aikey");`);
  } finally { await srv.close(); }
});

test("Night Roll bridge wire format: x-nr-job/x-nr-song headers, and a streamed tool call runs the REAL app tool (not just echoed)", async () => {
  let round = 0;
  const srv = await startServer((req, res, rec) => {
    if (rec.method === "GET" && rec.path === "/v1/models") return sendJson(res, 200, { data: [{ id: "claude-code" }] });
    if (rec.method === "GET" && rec.path === "/v1/jobs") return sendJson(res, 200, { ok: true, running: 0, inbox: true, terminal: true, terminalLive: true, sessions: true });
    if (rec.method === "POST" && rec.path === "/v1/chat/completions") {
      round++;
      res.writeHead(200, { "content-type": "text/event-stream" });
      if (round === 1) {
        // the model proposes an annotation via a streamed tool call, split
        // across chunks the same way a real OpenAI-protocol server does
        sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "act", arguments: "{\"do\":[{\"action\":\"add_annotation\",\"kind\":\"chord\"," } }] } }] });
        sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "\"text\":\"ii-V\",\"bar\":1,\"beat\":1}]}" } }] } }] });
        sse(res, { choices: [{ delta: {}, finish_reason: "tool_calls" }] });
      } else {
        for (const w of ["noted ", "— ii–V at bar 1."]) sse(res, { choices: [{ delta: { content: w } }] });
        sse(res, { choices: [{ delta: {}, finish_reason: "stop" }] });
      }
      return sseDone(res);
    }
    res.writeHead(404); res.end();
  });
  const app = await mkApp("learning");
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "claude-code", aiBackend: "remote"}); songKey = "albums/test/bridge.mid"; rollnotes = []; finalizeNotes();`);
    run(app, `askinput.value = "mark bar 1 as a ii-V, chord-wise";`);
    await run(app, `askSend()`);

    const reqs = srv.requests.filter(r => r.path === "/v1/chat/completions");
    assert.equal(reqs.length, 2, "two rounds: the tool call, then the words");
    assert.match(reqs[0].headers["x-nr-job"], /^nr_/, "a job id rides with a bridge-capable backend");
    assert.equal(reqs[0].headers["x-nr-song"], "albums/test/bridge.mid");
    assert.equal(reqs[1].headers["x-nr-job"], reqs[0].headers["x-nr-job"] + "-r1", "round 2 gets its own job id — the pending marker follows it");
    const toolMsg = reqs[1].json.messages.find(m => m.role === "tool");
    assert.ok(toolMsg, "round 2 carries the tool's result back to the model");
    assert.match(toolMsg.content, /written \[1\.1\] ii-V — on this device until Publish/, "the action's own line (batch 3: add_annotation is an act action)");

    // the app actually ran the tool against live state — not a stub
    assert.equal(val(app, `rollnotes.length`), 1);
    assert.equal(val(app, `rollnotes[0].text`), "ii-V");
    assert.equal(val(app, `!!rollnotes[0].chord`), true);
    assert.equal(val(app, `!!rollnotes[0].added`), true, "landed as an unsynced annotation, like a typed one");

    assert.equal(val(app, `askLoad().slice(-1)[0].content`), "noted — ii–V at bar 1.");
  } finally { await srv.close(); }
});

test("act: a call made only of quiet actions ends the exchange on the tool's own line — exactly ONE request to the server, the line is the stored reply (docs/ai-parity.md §2 'quiet actions'; the library's {final} protocol)", async () => {
  const srv = await startServer((req, res, rec) => {
    if (rec.method === "GET" && rec.path === "/v1/models") return sendJson(res, 200, { data: [{ id: "claude-code" }] });
    if (rec.method === "GET" && rec.path === "/v1/jobs") return sendJson(res, 200, { ok: true, running: 0, inbox: true, terminal: true, terminalLive: true, sessions: true });
    if (rec.method === "POST" && rec.path === "/v1/chat/completions") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "act", arguments: "{\"do\":[{\"action\":\"go_to\",\"bar\":3},{\"action\":\"select\",\"from_bar\":2,\"to_bar\":3}]}" } }] } }] });
      sse(res, { choices: [{ delta: {}, finish_reason: "tool_calls" }] });
      return sseDone(res);
    }
    res.writeHead(404); res.end();
  });
  const app = await mkApp("learning");
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "claude-code", aiBackend: "remote"}); songKey = "albums/test/act.mid"; rollnotes = []; finalizeNotes(); songEndTick = 8 * 1920; rangeSel = null;`); // songEndTick after finalizeNotes (it recomputes the end from the notes): 8 bars for go_to to land in
    assert.ok(val(app, `askToolsNow().some(t => t.function.name === "act")`), "act rides in the request's tools");
    run(app, `askinput.value = "go to bar 3 and loop bars 2 to 3";`);
    await run(app, `askSend()`);
    const reqs = srv.requests.filter(r => r.path === "/v1/chat/completions");
    assert.equal(reqs.length, 1, "one round: the quiet result is the reply, no second model call");
    assert.ok(reqs[0].json.tools.some(t => t.function.name === "act"));
    assert.equal(val(app, `playCursor`), 2 * 1920, "the app really moved");
    assert.deepEqual(val(app, `rangeSel`), {a: 1920, b: 3 * 1920, cycle: true});
    const last = val(app, `askLoad().slice(-1)[0]`);
    assert.equal(last.role, "assistant");
    assert.equal(last.content, "1. cursor at 3.1\n2. selected bars 2–3 — ▶ loops them");
    assert.equal(val(app, `askLoad().some(m => m.pending)`), false, "the marker is dropped");
  } finally { await srv.close(); }
});

test("open_song end to end: the switch waits until the reply has landed (one request in the old chat, nothing opened mid-exchange), then the song opens and the follow-on is a NEW request in the new song's chat — its own session, the ↪ line in its history, the carried words as the user message (docs/ai-parity.md §4)", async () => {
  let round = 0;
  const srv = await startServer((req, res, rec) => {
    if (rec.method === "GET" && rec.path === "/v1/models") return sendJson(res, 200, { data: [{ id: "claude-code" }] });
    if (rec.method === "GET" && rec.path === "/v1/jobs") return sendJson(res, 200, { ok: true, running: 0, inbox: true, terminal: true, terminalLive: true, sessions: true });
    if (rec.method === "POST" && rec.path === "/v1/chat/completions") {
      round++;
      res.writeHead(200, { "content-type": "text/event-stream" });
      if (round === 1) {
        sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "act", arguments: "{\"do\":[{\"action\":\"open_song\",\"song\":\"Night Rain\",\"then\":\"play it from bar 9\"}]}" } }] } }] });
        sse(res, { choices: [{ delta: {}, finish_reason: "tool_calls" }] });
      } else {
        sse(res, { choices: [{ delta: { content: "bar 9 it is." } }] });
        sse(res, { choices: [{ delta: {}, finish_reason: "stop" }] });
      }
      return sseDone(res);
    }
    res.writeHead(404); res.end();
  });
  const app = await mkApp("learning");
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "claude-code", aiBackend: "remote"}); songKey = "albums/test/from.mid"; rollnotes = []; finalizeNotes(); songEndTick = 8 * 1920;
      localStorage.setItem(draftStoreKey("local/night-rain.mid"), JSON.stringify({ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}], dirty: false, tracks: [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}]}]}));`);
    run(app, `askinput.value = "open night rain and play it from bar 9";`);
    await run(app, `askSend()`);
    let reqs = srv.requests.filter(r => r.path === "/v1/chat/completions");
    assert.equal(reqs.length, 1, "the asking chat: one round — open_song is quiet, nothing else was asked of the model there");
    assert.equal(reqs[0].headers["x-nr-song"], "albums/test/from.mid");
    assert.equal(val(app, `songKey`), "albums/test/from.mid", "nothing opened inside the exchange");
    const old = val(app, `askStore("ff1roll-ask-albums/test/from.mid").msgs`);
    assert.equal(old.at(-1).role, "assistant"); assert.match(old.at(-1).content, /^opening Night Rain · then: play it from bar 9$/);
    assert.equal(val(app, `askSwitch`), null, "taken at the landing");
    for (let i = 0; i < 40 && srv.requests.filter(r => r.path === "/v1/chat/completions").length < 2; i++) { app.tick(300); await new Promise(r => setTimeout(r, 25)); }
    reqs = srv.requests.filter(r => r.path === "/v1/chat/completions");
    assert.equal(reqs.length, 2, "the follow-on is a new request");
    assert.equal(val(app, `songKey`), "local/night-rain.mid", "the song opened first");
    assert.equal(reqs[1].headers["x-nr-song"], "local/night-rain.mid", "in the NEW song's session");
    const last = reqs[1].json.messages.at(-1);
    assert.equal(last.role, "user"); assert.match(last.content, /\n\nplay it from bar 9$/, "the carried words, as the user's own message, with the new song's context block");
    assert.match(last.content, /night-rain|Night Rain/, "the context block is the new song's");
    assert.ok(!reqs[1].json.messages.some(m => /open night rain and play it/.test(m.content) && m.role === "user" && !/↪/.test(m.content)), "the old chat's turn is not carried as history");
    assert.ok(reqs[1].json.messages.some(m => /^↪ from From: open night rain and play it from bar 9$/.test(m.content)), "the ↪ line is the one thing the new chat knows of the old one");
    for (let i = 0; i < 40 && !/bar 9 it is/.test(JSON.stringify(val(app, `askStore("ff1roll-ask-local/night-rain.mid").msgs`))); i++) { app.tick(300); await new Promise(r => setTimeout(r, 25)); }
    const neu = val(app, `askStore("ff1roll-ask-local/night-rain.mid").msgs`);
    assert.deepEqual(neu.map(m => m.role), ["note", "user", "assistant"]);
    assert.equal(neu[1].content, "play it from bar 9"); assert.equal(neu[2].content, "bar 9 it is.");
    assert.equal(val(app, `askHopKey`), "ff1roll-ask-local/night-rain.mid", "one hop: this chat's carried message may not open another song");
    assert.equal(val(app, `askStoreKey()`), "ff1roll-ask-local/night-rain.mid", "the window's ♪ tab is the new song's");
  } finally { await srv.close(); }
});

test("Learning mode: no key/chord estimate or lasso chord name leaves the device in the wire request; Normal mode sends them", async () => {
  const srv = await startServer((req, res, rec) => {
    if (rec.method === "GET" && rec.path === "/v1/models") return sendJson(res, 200, { data: [{ id: "m" }] });
    if (rec.method === "POST" && rec.path === "/v1/chat/completions") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      sse(res, { choices: [{ delta: { content: "ok" } }] });
      sse(res, { choices: [{ delta: {}, finish_reason: "stop" }] });
      return sseDone(res);
    }
    res.writeHead(404); res.end();
  });
  const app = await mkApp("learning", `multiSel = [{ti: 0, ni: 0}, {ti: 0, ni: 1}]; multiSelSf = 0;`);
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "m", aiBackend: "remote"});`);
    run(app, `askinput.value = "is this a I chord?";`);
    await run(app, `askSend()`);
    const learnCtx = srv.requests.find(r => r.path === "/v1/chat/completions").json.messages.at(-1).content;
    assert.match(learnCtx, /do not name this chord unless the user has guessed or insists/);
    assert.doesNotMatch(learnCtx, /chord: C\b/i, "no chord name crosses the wire in Learning mode");
    assert.doesNotMatch(learnCtx, /key state: (estimated|declared)/i, "key state stays 'not set' — never estimated/declared over the wire in Learning");

    run(app, `setAppMode("normal"); finalizeNotes();`);
    run(app, `askinput.value = "is this a I chord?";`);
    await run(app, `askSend()`);
    const reqs = srv.requests.filter(r => r.path === "/v1/chat/completions");
    const normalCtx = reqs.at(-1).json.messages.at(-1).content;
    assert.match(normalCtx, /lasso-selected notes: C4 E4 — chord: C/, "Normal mode names the chord over the wire");
    assert.match(normalCtx, /^mode: normal$/m);
  } finally { await srv.close(); }
});

test("backend errors: HTTP 500 keeps the user's question in the song chat; a refused connection returns the typed text to the Terminal tab's box", async () => {
  const srv = await startServer((req, res, rec) => {
    if (rec.method === "GET" && rec.path === "/v1/models") return sendJson(res, 200, { data: [{ id: "m" }] });
    if (rec.method === "POST" && rec.path === "/v1/chat/completions") { res.writeHead(500); return res.end("boom"); }
    res.writeHead(404); res.end();
  });
  const app = await mkApp("learning");
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "m", aiBackend: "remote"});`);
    run(app, `askinput.value = "why did that break?";`);
    await run(app, `askSend()`);
    const msgs = val(app, `askLoad()`);
    assert.equal(msgs[0].role, "user");
    assert.equal(msgs[0].content, "why did that break?", "the question is kept, not lost");
    assert.match(msgs[1].content, /^⚠ HTTP 500/, "the error lands as the reply, not silently");
    assert.equal(val(app, `askinput.value`), "", "the song chat clears the box at Send regardless of the outcome");

    // Terminal tab against a server that refuses the connection outright
    await srv.close();
    run(app, `askSetMode("terminal"); localStorage.removeItem(ASK_TERMINAL_KEY); askinput.value = "build it";`);
    await run(app, `askSend()`);
    assert.equal(val(app, `askinput.value`), "build it", "not sent: the words come back");
    assert.equal(val(app, `askStore(ASK_TERMINAL_KEY).msgs.length`), 0, "never landed: not kept as a sent message either");
    assert.match(val(app, `askstatus.textContent`), /⚠ not sent/);
    run(app, `clearInterval(askTerminalTimer); askTerminalTimer = null; askSetMode("song");`);
  } finally { /* srv already closed above */ }
});

test("⌨ Terminal tab: Send round trip against a fake bridge — real <context> wrapper over real HTTP, now: status line from the real response", async () => {
  const srv = await startServer((req, res, rec) => {
    if (rec.method === "POST" && rec.path === "/v1/terminal") return sendJson(res, 200, { id: 1, now: { text: "reading the file" } });
    res.writeHead(404); res.end();
  });
  const app = await mkApp("learning");
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}}); askSetMode("terminal"); localStorage.removeItem(ASK_TERMINAL_KEY); askinput.value = "what's the Ask token plan status?";`);
    await run(app, `askSend()`);
    const r = srv.requests.find(x => x.path === "/v1/terminal");
    assert.ok(r, "POSTed to /v1/terminal");
    assert.match(r.json.text, /^<context>\n[\s\S]*\n<\/context>\n\nwhat's the Ask token plan status\?$/);
    assert.match(val(app, `askstatus.textContent`), /the terminal is working: reading the file/, "the real response's now.text reached the status line");
    assert.equal(val(app, `askStore(ASK_TERMINAL_KEY).msgs.slice(-1)[0].content`), "what's the Ask token plan status?", "stored WITHOUT the context block");
  } finally {
    await srv.close();
    run(app, `clearInterval(askTerminalTimer); askTerminalTimer = null; askSetMode("song");`);
  }
});

test("📷 screenshot: askShotUpload hits the fake bridge's upload route; the returned path rides as a '(screenshot: path)' line in the sent text", async () => {
  const srv = await startServer((req, res, rec) => {
    if (rec.method === "GET" && rec.path === "/v1/models") return sendJson(res, 200, { data: [{ id: "m" }] });
    if (rec.method === "POST" && rec.path === "/v1/shot") return sendJson(res, 200, { path: "/shots/abc123.png" });
    if (rec.method === "POST" && rec.path === "/v1/chat/completions") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      sse(res, { choices: [{ delta: { content: "I can see it." } }] });
      sse(res, { choices: [{ delta: {}, finish_reason: "stop" }] });
      return sseDone(res);
    }
    res.writeHead(404); res.end();
  });
  const app = await mkApp("learning");
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "m", aiBackend: "remote"});`);
    const path = await run(app, `askShotUpload(new Uint8Array([1, 2, 3]), "image/png")`);
    assert.equal(path, "/shots/abc123.png");
    const up = srv.requests.find(r => r.path === "/v1/shot");
    assert.equal(up.headers["content-type"], "image/png");
    assert.deepEqual([...up.raw], [1, 2, 3], "the raw bytes went over uninterpreted");

    run(app, `askShotAdd(${JSON.stringify(path)}, {mime: "image/png"}); askinput.value = "what's wrong here?";`);
    await run(app, `askSend()`);
    const chat = srv.requests.find(r => r.path === "/v1/chat/completions").json;
    const sentText = chat.messages.at(-1).content;
    assert.match(sentText, /\(screenshot: \/shots\/abc123\.png\)$/, "the upload's own path rides in the sent text");
    assert.equal(val(app, `askLoad()[0].content`), "what's wrong here?\n(screenshot: /shots/abc123.png)", "stored the same way, not just shown that way");
  } finally { await srv.close(); }
});

test("in-browser backend (WebLLM): aiProvider() dispatches by cfg().aiBackend; aiBrowserTest reports clearly with no WebGPU (this environment, like a browser without it)", async () => {
  const app = await mkApp("learning");
  run(app, `saveCfg({aiBackend: "remote"});`);
  assert.equal(val(app, `aiProvider().id`), "remote");
  run(app, `saveCfg({aiBackend: "browser", aiBrowserModel: "SmolLM2-360M-Instruct-q4f16_1-MLC"});`);
  assert.equal(val(app, `aiProvider().id`), "browser");

  run(app, `globalThis.__statusEl = {textContent: "", classList: {toggle(){}}};`);
  await run(app, `aiBrowserTest("SmolLM2-360M-Instruct-q4f16_1-MLC", globalThis.__statusEl)`);
  assert.match(val(app, `globalThis.__statusEl.textContent`), /no WebGPU in this browser/, "navigator.gpu is absent here exactly as in a browser lacking WebGPU — the real device-capability probe, not a stub");

  run(app, `saveCfg({aiBackend: "remote"});`);
});
