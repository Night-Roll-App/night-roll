// tests/annotate.test.mjs — "✦ Annotate this song…" (src/ask/annotate.js,
// docs/plans/2026-10-04-annotate-song.md). tests/ai.test.mjs's shape: a real
// node:http server on 127.0.0.1 speaking the OpenAI SSE wire, the app's own
// aiUrl() pointed at it, assertions on BOTH what the fake server received
// and what landed in the app (rollnotes, tags, undo, status).
//
// The law first (CLAUDE.md): in Learning mode the feature does not exist —
// no menu item, the runner refuses, no request leaves the device, and the
// chat's own surface (ASK_TOOLS, askToolsNow, askSys) is untouched because
// this job never goes through it. Then Normal mode: estimates tagged `ai`,
// one undo per run, the user's own annotations never overwritten, Clear in
// one step, windowed runs for long songs, nothing written on any bad reply.
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
function sendJson(res, status, obj) { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); }
function sse(res, obj) { res.write("data: " + JSON.stringify(obj) + "\n\n"); }
function sseDone(res) { res.write("data: [DONE]\n\n"); res.end(); }
function startServer(handler) {
  const requests = [];
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const raw = await readBody(req);
    let json = null;
    if (raw.length) { try { json = JSON.parse(raw.toString("utf8")); } catch (err) { /* not JSON */ } }
    const rec = { method: req.method, path: url.pathname, headers: req.headers, raw, json };
    requests.push(rec);
    try { await handler(req, res, rec); } catch (err) { if (!res.headersSent) sendJson(res, 500, { error: String(err && err.message || err) }); else res.end(); }
  });
  return new Promise(resolve => srv.listen(0, "127.0.0.1", () => resolve({
    requests, url: "http://127.0.0.1:" + srv.address().port,
    close: () => new Promise(r => srv.close(r)),
  })));
}
// a model that answers every completion with `replyFor(rec)` as streamed
// text (a JSON object, or prose when a test wants a useless reply)
function modelServer(replyFor, before) {
  return startServer(async (req, res, rec) => {
    if (rec.method === "GET" && rec.path === "/v1/models") return sendJson(res, 200, { data: [{ id: "m" }] });
    if (rec.method === "POST" && rec.path === "/v1/chat/completions") {
      if (before) await before(rec);
      const text = replyFor(rec);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const mid = Math.floor(text.length / 2);
      sse(res, { choices: [{ delta: { content: text.slice(0, mid) } }] });
      sse(res, { choices: [{ delta: { content: text.slice(mid) } }] });
      sse(res, { choices: [{ delta: {}, finish_reason: "stop" }] });
      return sseDone(res);
    }
    res.writeHead(404); res.end();
  });
}
const ROOTS = [60, 65, 67, 60], SYMS = ["C", "F", "G", "C"]; // C F G C, one bar each
// a 4/4 song of `bars` bars: a melody arpeggio per bar (quarters, or eighths
// when dense) over a whole-note bass root
function songScript(bars, { dense = false } = {}) {
  const bt = 1920, mel = [], bass = [];
  for (let b = 0; b < bars; b++) {
    const r = ROOTS[b % 4];
    const line = dense ? [r, r + 4, r + 7, r + 12, r + 7, r + 4, r, r + 4] : [r, r + 4, r + 7, r + 12];
    const d = dense ? 240 : 480;
    line.forEach((p, i) => mel.push({ t: b * bt + i * d, d, p, v: 80 }));
    bass.push({ t: b * bt, d: bt, p: r - 24, v: 70 });
  }
  return `
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}],
            tracks: [{name: "melody", notes: ${JSON.stringify(mel)}}, {name: "bass", notes: ${JSON.stringify(bass)}}]};
    songKey = "albums/test/annot.mid"; songEndTick = ${bars * bt}; playCursor = 0; playing = false; playRate = 1; viewMode = "roll";
    trackState = [{muted: false, solo: false}, {muted: false, solo: false}]; rollnotes = []; keyRegions = []; declaredTs = null; previewSf = null; multiSel = [];
    editUndo = []; editRedo = []; jobs = [];
    askAppState = () => "app: stub";
    finalizeNotes(); renderViewMenu();
  `;
}
async function mkApp(mode, bars, opts) {
  const app = await createApp({ storage: { "ff1roll-mode": mode } });
  app.context.fetch = fetch; // these ARE network tests (tests/ai.test.mjs's reasoning)
  app.run(songScript(bars, opts));
  return app;
}
const run = (app, code) => app.run(code);
const val = (app, code) => JSON.parse(app.run(`JSON.stringify(${code})`));
const caught = (app, code) => app.run(`(() => { try { ${code}; return null; } catch (e) { return e.message; } })()`);
// the reply a well-behaved model gives for bars from–to of the C F G C song
function goodReply(from, to) {
  const chords = [];
  for (let b = from; b <= to; b++) chords.push({ bar: b, beat: 1, end_bar: b, end_beat: 4, symbol: SYMS[(b - 1) % 4] });
  const mid = from + Math.floor((to - from) / 2);
  return { sections: [{ from_bar: from, to_bar: mid, label: "A" }, { from_bar: mid + 1, to_bar: to, label: "B" }], chords, keys: [{ bar: from, name: "C major" }] };
}
const barsOf = rec => rec.json.messages.at(-1).content.match(/^bars (\d+)–(\d+) of (\d+)/m).slice(1).map(Number);

// ---- pure pieces -----------------------------------------------------------
test("annotateValidate: a good reply normalizes — sections to whole-bar spans, chords with the app's symbols, keys by name; kinds not asked for are dropped", async () => {
  const app = await mkApp("normal", 8);
  const items = val(app, `annotateValidate(${JSON.stringify(goodReply(1, 8))}, {nBars: 8, bpb: 4, kinds: {sections: true, chords: true, keys: true}})`);
  assert.deepEqual(items.filter(i => i.kind === "section"), [
    { kind: "section", bar: 1, beat: 1, endBar: 4, endBeat: null, text: "A" }, { kind: "section", bar: 5, beat: 1, endBar: 8, endBeat: null, text: "B" }]);
  assert.equal(items.filter(i => i.kind === "chord").length, 8);
  assert.deepEqual(items.find(i => i.kind === "chord"), { kind: "chord", bar: 1, beat: 1, endBar: 1, endBeat: 4, text: "C" });
  assert.deepEqual(items.filter(i => i.kind === "key"), [{ kind: "key", bar: 1, beat: 1, endBar: null, endBeat: null, text: "C major" }]);
  // a chord with no end: the rest of its bar; a fractional beat is a beat
  const c = val(app, `annotateValidate({chords: [{bar: 3, beat: 2.5, symbol: "Bb/D"}]}, {nBars: 8, bpb: 4, kinds: {chords: true}})`);
  assert.deepEqual(c, [{ kind: "chord", bar: 3, beat: 2.5, endBar: 3, endBeat: null, text: "Bb/D" }]);
  // only the kinds asked for land
  const onlyKeys = val(app, `annotateValidate(${JSON.stringify(goodReply(1, 8))}, {nBars: 8, bpb: 4, kinds: {sections: false, chords: false, keys: true}})`);
  assert.deepEqual(onlyKeys.map(i => i.kind), ["key"]);
});

test("annotateValidate: every failure is named — a bar past the song, a beat past the meter, an unparsable chord, an unknown key, overlapping sections, a long label — and the whole reply is refused", async () => {
  const app = await mkApp("normal", 8);
  const bad = { sections: [{ from_bar: 1, to_bar: 5, label: "A" }, { from_bar: 5, to_bar: 8, label: "B" }, { from_bar: 2, to_bar: 3, label: "x".repeat(41) }],
                chords: [{ bar: 9, beat: 1, symbol: "C" }, { bar: 1, beat: 5, symbol: "C" }, { bar: 2, beat: 1, end_bar: 1, end_beat: 4, symbol: "C" }, { bar: 2, beat: 1, symbol: "H7" }],
                keys: [{ bar: 1, name: "Z sharp" }, { bar: 0, name: "C major" }] };
  const msg = caught(app, `annotateValidate(${JSON.stringify(bad)}, {nBars: 8, bpb: 4, kinds: {sections: true, chords: true, keys: true}})`);
  assert.ok(msg, "refused");
  for (const want of ["sections overlap: A (1–5) and B (5–8)", "sections[2]: label longer than 40", "chords[0].bar: bar 9 is not a bar of this song (1–8)",
    "chords[1]: beat 5 is not a beat of a 4-beat bar", "chords[2]: ends (1.4) before it starts (2.1)", "chords[3]: \"H7\" is not a chord symbol", "keys[0]: \"Z sharp\" is not a key name", "keys[1].bar: bar 0 is not a bar"])
    assert.ok(msg.includes(want), "names: " + want + "\n got: " + msg);
  assert.equal(caught(app, `annotateValidate({chords: "nope"}, {nBars: 8, bpb: 4, kinds: {chords: true}})`), "chords is not a list");
});

test("annotateParse: JSON inside a fence or a sentence is read; prose with no object, or broken JSON, is 'no usable reply'", async () => {
  const app = await mkApp("normal", 4);
  assert.deepEqual(val(app, `annotateParse('Sure! \`\`\`json\\n{"keys":[{"bar":1,"name":"C major"}]}\\n\`\`\` hope that helps')`), { keys: [{ bar: 1, name: "C major" }] });
  assert.deepEqual(val(app, `annotateParse('<think>hmm {not this}</think>{"sections":[]}')`), { sections: [] });
  assert.match(caught(app, `annotateParse("I cannot tell from here.")`), /^no usable reply — the model did not answer with JSON/);
  assert.match(caught(app, `annotateParse('{"chords": [}')`), /^no usable reply — the model's JSON did not parse/);
  assert.match(caught(app, `annotateParse('[1, 2]')`), /^no usable reply/);
});

test("annotateOverlaps: the user's own band of the same kind skips an estimate; an earlier AI estimate does not; a key at the user's key bar is skipped; a duplicate inside one run is merged", async () => {
  const app = await mkApp("normal", 8);
  run(app, `
    rollnotes = parseRollnotes("[1.1 - 1.4]\\nchord: Dm\\n\\n[3.1 - 4]\\nsection: Intro\\n\\n[5.1]\\nkey: G\\n\\n[2.1 - 2.4]\\nchord: Em").map(resolveNote);
    rollnotes[3].ai = {model: "m", at: "t"}; // an earlier run's estimate at bar 2
    finalizeNotes();
  `);
  const items = [
    { kind: "chord", bar: 1, beat: 3, endBar: 1, endBeat: 4, text: "G7" }, // touches his Dm → skipped
    { kind: "chord", bar: 2, beat: 1, endBar: 2, endBeat: 4, text: "Em7" }, // over an AI estimate → accepted (the write replaces it)
    { kind: "section", bar: 1, beat: 1, endBar: 3, endBeat: null, text: "A" }, // bars 1–3 overlap his Intro (3–4) → skipped
    { kind: "section", bar: 5, beat: 1, endBar: 8, endBeat: null, text: "B" },
    { kind: "section", bar: 7, beat: 1, endBar: 8, endBeat: null, text: "B'" }, // overlaps the accepted B → merged
    { kind: "key", bar: 5, beat: 1, endBar: null, endBeat: null, text: "G major" }, // his key sits at bar 5 → skipped
    { kind: "key", bar: 1, beat: 1, endBar: null, endBeat: null, text: "D minor" },
  ];
  const r = val(app, `annotateOverlaps(${JSON.stringify(items)}, rollnotes, 4)`);
  assert.deepEqual(r.accepted.map(i => i.text), ["Em7", "B", "D minor"]);
  assert.deepEqual(r.skipped.map(i => i.text), ["G7", "A", "G major"]);
  assert.deepEqual(r.merged.map(i => i.text), ["B'"]);
});

test("annotateWindows: bars are split into runs whose rows fit the cap, in order, covering every bar once; a lone oversized bar still gets a window", async () => {
  const app = await mkApp("normal", 4);
  assert.deepEqual(val(app, `annotateWindows([10, 10, 10, 10, 10], 25)`), [[1, 2], [3, 4], [5, 5]]);
  assert.deepEqual(val(app, `annotateWindows([50, 5, 5], 20)`), [[1, 1], [2, 3]]);
  assert.deepEqual(val(app, `annotateWindows([1, 1, 1], 1000)`), [[1, 3]]);
  const costs = val(app, `annotateBarCosts()`);
  assert.equal(costs.length, 4);
  assert.ok(costs.every(c => c > 10), "every bar of the fixture has rows on both tracks: " + costs);
});

// ---- Learning mode: the feature does not exist ----------------------------
test("Learning mode: no menu item, the hidden button opens nothing, the runner refuses before any request, and the chat's tools/system prompt know nothing of it", async () => {
  const srv = await modelServer(() => JSON.stringify(goodReply(1, 8)));
  const app = await mkApp("learning", 8);
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "m", aiBackend: "remote"});`);
    assert.equal(run(app, `document.getElementById("vwAnnotate").style.display`), "none", "Learning: the View ▾ item is absent, not dimmed");
    run(app, `document.getElementById("vwAnnotate").click();`);
    assert.equal(run(app, `document.getElementById("annotatesheet").classList.contains("on")`), false, "a stray tap on the hidden button opens no sheet");
    run(app, `openAnnotateSheet();`);
    assert.equal(run(app, `document.getElementById("annotatesheet").classList.contains("on")`), false, "even a direct call opens nothing in Learning");
    assert.match(run(app, `annotateGate()`), /^Normal mode only/);
    await assert.rejects(run(app, `annotateRun()`), /Normal mode only/);
    assert.equal(srv.requests.length, 0, "nothing left the device");
    assert.equal(val(app, `rollnotes.length`), 0);
    assert.equal(val(app, `editUndo.length`), 0);
    // the chat surface is untouched by construction: no tool, no prompt text
    const tools = val(app, `askActList(!!askGeneral).map(d => d.name)`);
    assert.ok(!tools.some(n => /annot/i.test(n) && !/annotation$/.test(n)), "no annotate tool in askToolsNow: " + tools.join(", "));
    assert.doesNotMatch(run(app, `JSON.stringify(ASK_TOOLS)`), /Annotate this song|annotate_song|ANNOTATE_SYS|AI estimate/, "ASK_TOOLS carries no such tool");
    assert.doesNotMatch(run(app, `askSys()`), /annotate|estimate/i, "the Learning system prompt is unchanged");
    assert.doesNotMatch(run(app, `askContext(askSpan(), askBudget())`), /annotate this song|AI estimate/i, "the Learning context block is unchanged");
    // flipping to Normal makes the item appear; back to Learning removes it again
    run(app, `setAppMode("normal"); renderViewMenu();`);
    assert.equal(run(app, `document.getElementById("vwAnnotate").style.display`), "");
    run(app, `setAppMode("learning"); renderViewMenu();`);
    assert.equal(run(app, `document.getElementById("vwAnnotate").style.display`), "none");
  } finally { await srv.close(); }
});

// ---- Normal mode: the run --------------------------------------------------
test("Normal mode: one run — the request carries the song's bars and the FACTS, no chat <context>, no tools; estimates land tagged ai as ONE undo step; undo restores the exact layer", async () => {
  const srv = await modelServer(() => JSON.stringify(goodReply(1, 16)));
  const app = await mkApp("normal", 16);
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "m", aiBackend: "remote"}); renderViewMenu();`);
    assert.equal(run(app, `document.getElementById("vwAnnotate").style.display`), "", "Normal: the item is present");
    run(app, `document.getElementById("vwAnnotate").click();`);
    assert.equal(run(app, `document.getElementById("annotatesheet").classList.contains("on")`), true, "the item opens the sheet");
    assert.match(run(app, `document.getElementById("annotatestatus").textContent`), /nothing written yet/, "opening writes nothing");
    assert.equal(val(app, `rollnotes.length`), 0);
    const before = run(app, `annoSnapshot()`);

    const r = await run(app, `annotateRun({kinds: {sections: true, chords: true, keys: true}})`);
    assert.equal(r.written, 19, "2 sections + 16 chords + 1 key");
    assert.equal(r.skipped, 0);
    assert.equal(r.windows, 1);

    const reqs = srv.requests.filter(x => x.path === "/v1/chat/completions");
    assert.equal(reqs.length, 1, "one window, one request");
    const body = reqs[0].json;
    assert.equal(body.tools, undefined, "no tools on the wire");
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.messages[0].content, run(app, `ANNOTATE_SYS`), "its own system prompt, not the tutor's");
    assert.doesNotMatch(body.messages[0].content, /THE RULE: discoveries are the user's|Answer music questions directly/, "askSys never enters this request");
    const user = body.messages.at(-1).content;
    assert.doesNotMatch(user, /<context>/, "no chat context block");
    assert.match(user, /^bars 1–16 of 16 · meter: 4 beats per bar$/m);
    assert.match(user, /^wanted: sections, chords, keys$/m);
    assert.match(user, /^FACTS \(computed from the notes\):$/m);
    assert.match(user, /^## form$/m); assert.match(user, /^bars:\s+a a′ a′ a a a′ a′ a/m, "formFacts's bar string grounds the request (F and G bars are transposed statements of the C bar)");
    assert.match(user, /^## bass$/m); assert.match(user, /lowest per beat/);
    assert.match(user, /^## melody$/m); assert.match(user, /^## rhythm$/m);
    assert.match(user, /^NOTES:$/m);
    assert.match(user, /^T1 melody$/m); assert.match(user, /^1\|1C4\/1 2E 3G 4C5$/m, "the compact rows, bar 1");
    assert.match(user, /^16\|/m, "…through bar 16");

    assert.equal(val(app, `rollnotes.length`), 19);
    assert.equal(val(app, `rollnotes.every(n => n.ai && n.ai.model === "m" && /^\\d{4}-\\d\\d-\\d\\dT/.test(n.ai.at) && n.added)`), true, "every estimate tagged ai {model, at} and unsynced like a typed one");
    assert.deepEqual(val(app, `rollnotes.filter(n => n.section).map(n => [n.text, n.b1, n.b2])`), [["A", 1, 8], ["B", 9, 16]]);
    assert.deepEqual(val(app, `rollnotes.filter(n => n.chord).slice(0, 4).map(n => [n.text, n.b1, n.q1, n.b2, n.q2])`), [["C", 1, 1, 1, 4], ["F", 2, 1, 2, 4], ["G", 3, 1, 3, 4], ["C", 4, 1, 4, 4]]);
    assert.deepEqual(val(app, `rollnotes.filter(n => n.keydir !== undefined).map(n => [n.text, n.b1, n.keydir])`), [["key: C major", 1, 0]]);
    assert.equal(val(app, `jobs.filter(j => j.kind === "annotate").length`), 1, "ran as a footer job");
    assert.equal(val(app, `jobs.find(j => j.kind === "annotate").state`), "done");

    // ONE undo step for the whole run; redo brings it all back, tags included
    assert.equal(val(app, `editUndo.length`), 1, "one ⟲ step, not 19");
    run(app, `editUndoPop();`);
    assert.equal(val(app, `rollnotes.length`), 0);
    assert.equal(run(app, `annoSnapshot()`), before, "the exact previous layer");
    run(app, `editRedoPop();`);
    assert.equal(val(app, `rollnotes.length`), 19);
    assert.equal(val(app, `rollnotes.every(n => n.ai && n.ai.model === "m")`), true, "the tag survives undo/redo (annoSnapshot → noteToJSON → jsonToRawNote)");
  } finally { await srv.close(); }
});

test("Normal mode: the user's own annotations are never overwritten — a second run skips estimates over his band (reported), replaces its own earlier estimates instead of stacking twins; Clear removes only tagged notes in one undo", async () => {
  const srv = await modelServer(() => JSON.stringify(goodReply(1, 16)));
  const app = await mkApp("normal", 16);
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "m", aiBackend: "remote"});`);
    await run(app, `annotateRun()`);
    assert.equal(val(app, `rollnotes.length`), 19);
    // his own chord band over bar 1 and his own section over bars 9–12 (not ai)
    run(app, `askAddAnnotation({kind: "chord", text: "Dm", bar: 1, beat: 1, end_bar: 1, end_beat: 4}); askAddAnnotation({kind: "section", text: "Chorus", bar: 9, beat: 1, end_bar: 12}); editUndo = [];`);
    assert.equal(val(app, `rollnotes.filter(n => !n.ai).length`), 2);
    const r = await run(app, `annotateRun()`);
    assert.equal(r.skipped, 2, "the chord over his Dm and the section over his Chorus");
    assert.equal(r.written, 17);
    assert.equal(val(app, `rollnotes.filter(n => !n.ai).map(n => n.text).sort().join(",")`), "Chorus,Dm", "his two are untouched");
    assert.equal(val(app, `rollnotes.filter(n => n.chord && n.b1 === 1).map(n => n.text).join(",")`), "Dm", "his Dm on the AI C's exact span REPLACED it when he wrote it (dropSupersededBy — the editor's own same-span rule); the re-run's C over his band was skipped, not re-added");
    assert.equal(val(app, `rollnotes.filter(n => n.ai && n.chord).length`), 15, "15 AI chords (bars 2–16), not 30 — a re-run replaces its own earlier estimate on the same span");
    assert.equal(val(app, `rollnotes.filter(n => n.section).map(n => n.text).sort().join(",")`), "A,B,Chorus", "B (9–16) from the first run stays; the second run's B over his Chorus was skipped");
    assert.match(run(app, `annotateSummary(annotateLast)`), /^wrote 17 \(15 chords, 1 section, 1 key\) · skipped 2 \(yours\)/);
    assert.equal(val(app, `editUndo.length`), 1, "the second run is one undo step too");

    // the All notes list marks them
    run(app, `renderNoteList();`);
    const tags = val(app, `(function count(el) { let n = (el.className === "aitag") ? 1 : 0; for (const c of (el.children || [])) n += count(c); return n; })(document.getElementById("notelistrows"))`);
    assert.equal(tags, 18, "a ✦ AI badge per tagged row (18 tagged: A, B, 15 chords, the key; 2 his)");

    // Clear: every tagged note, none of his, one undo
    const beforeClear = run(app, `annoSnapshot()`);
    assert.equal(run(app, `annotateClear()`), 18);
    assert.equal(val(app, `rollnotes.map(n => n.text).sort().join(",")`), "Chorus,Dm");
    assert.equal(val(app, `editUndo.length`), 2);
    run(app, `editUndoPop();`);
    assert.equal(run(app, `annoSnapshot()`), beforeClear, "one undo brings all 18 back");
    assert.equal(run(app, `annotateClear()`), 18);
    assert.equal(run(app, `annotateClear()`), 0, "nothing tagged left");
  } finally { await srv.close(); }
});

test("Normal mode: the sheet's own Run and Clear taps — checkboxes pick the kinds, the status line reports, Clear asks first (appConfirm) and never a native dialog", async () => {
  const srv = await modelServer(() => JSON.stringify(goodReply(1, 8)));
  const app = await mkApp("normal", 8);
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "m", aiBackend: "remote"});
      document.getElementById("annotatesections").checked = false; document.getElementById("annotatechords").checked = true; document.getElementById("annotatekeys").checked = false;`);
    await run(app, `annotateRunTap()`);
    assert.match(run(app, `document.getElementById("annotatestatus").textContent`), /^✓ wrote 8 \(8 chords\) — one undo takes it back$/);
    assert.equal(val(app, `rollnotes.length`), 8);
    assert.equal(val(app, `rollnotes.every(n => n.chord && n.ai)`), true, "chords only — the unticked kinds were not written even though the model offered them");
    assert.match(srv.requests.at(-1).json.messages.at(-1).content, /^wanted: chords$/m);
    assert.match(run(app, `document.getElementById("annotateclear").textContent`), /\(8\)$/);
    run(app, `document.getElementById("annotatesections").checked = false; document.getElementById("annotatechords").checked = false;`);
    await run(app, `annotateRunTap()`);
    assert.match(run(app, `document.getElementById("annotatestatus").textContent`), /^⚠ pick at least one/);
    // Clear: declined → nothing; accepted → gone
    run(app, `globalThis.__confirms = []; appConfirmImpl = async (title) => { globalThis.__confirms.push(title); return globalThis.__confirms.length > 1; };`);
    await run(app, `annotateClearTap()`);
    assert.equal(val(app, `rollnotes.length`), 8, "declined: nothing removed");
    await run(app, `annotateClearTap()`);
    assert.equal(val(app, `rollnotes.length`), 0);
    assert.deepEqual(val(app, `globalThis.__confirms`), ["Clear AI annotations?", "Clear AI annotations?"]);
    assert.match(run(app, `document.getElementById("annotatestatus").textContent`), /^✓ removed 8 AI annotations/);
  } finally { await srv.close(); }
});

test("the tag persists: noteToJSON/jsonToRawNote round-trip `ai`, the v2 file keeps it, the local unsynced store keeps it", async () => {
  const srv = await modelServer(() => JSON.stringify(goodReply(1, 4)));
  const app = await mkApp("normal", 4);
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "m", aiBackend: "remote"});`);
    await run(app, `annotateRun({kinds: {keys: true, sections: false, chords: false}})`);
    const j = val(app, `noteToJSON(rollnotes[0])`);
    assert.deepEqual(Object.keys(j).sort(), ["ai", "at", "key", "type"]);
    assert.equal(j.ai.model, "m");
    assert.deepEqual(val(app, `jsonToRawNote(${JSON.stringify(j)}).ai`), j.ai);
    assert.equal(run(app, `"ai" in noteToJSON(parseRollnotes("[1.1]\\nkey: G")[0])`), false, "a typed note carries no tag");
    const file = run(app, `serializeRollnotes()`);
    assert.match(file, /"ai":\{"model":"m","at":"/);
    assert.deepEqual(val(app, `parseRollnotes(${JSON.stringify(file)}).map(n => n.ai)`), [j.ai], "the file round-trips the tag");
    const local = JSON.parse(run(app, `localStorage.getItem("ff1roll-notes-albums/test/annot.mid")`));
    assert.deepEqual(local.map(n => n.ai), [j.ai], "the device's unsynced store keeps it for the reload merge");
  } finally { await srv.close(); }
});

test("nothing is written on a bad reply: prose → 'no usable reply'; one bad item in a window → the window named, no window written; the song changing mid-run → nothing written", async () => {
  let mode = "prose";
  const app = await mkApp("normal", 8);
  const srv = await modelServer(rec => {
    if (mode === "prose") return "This piece seems to be in C major with an A B form.";
    if (mode === "bad") { const r = goodReply(...barsOf(rec).slice(0, 2)); r.chords[0].symbol = "Qm"; return JSON.stringify(r); }
    return JSON.stringify(goodReply(...barsOf(rec).slice(0, 2)));
  }, async () => { if (mode === "swap") run(app, `songKey = "albums/test/other.mid";`); });
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "m", aiBackend: "remote"});`);
    await assert.rejects(run(app, `annotateRun()`), /no usable reply/);
    assert.equal(val(app, `rollnotes.length`), 0); assert.equal(val(app, `editUndo.length`), 0);
    assert.equal(val(app, `jobs.find(j => j.kind === "annotate").state`), "failed", "the job says so too");
    mode = "bad";
    await assert.rejects(run(app, `annotateRun()`), /chords\[0\]: "Qm" is not a chord symbol/);
    assert.equal(val(app, `rollnotes.length`), 0); assert.equal(val(app, `editUndo.length`), 0);
    mode = "swap";
    await assert.rejects(run(app, `annotateRun()`), /the song changed while the model was thinking — nothing written/);
    assert.equal(val(app, `rollnotes.length`), 0);
    run(app, `songKey = "albums/test/annot.mid";`);
    assert.equal(val(app, `annotateBusy`), false, "a failed run frees the next one");
    mode = "good";
    const r = await run(app, `annotateRun()`);
    assert.equal(r.written, 11);
  } finally { await srv.close(); }
});

test("windowed runs: a long dense song on a small model window goes in bar windows that partition the song; each request carries only its bars; the replies merge into one write, one undo", async () => {
  const srv = await modelServer(rec => {
    const [from, to] = barsOf(rec);
    const chords = [];
    for (let b = from; b <= to; b++) chords.push({ bar: b, beat: 1, end_bar: b, end_beat: 4, symbol: SYMS[(b - 1) % 4] });
    return JSON.stringify({ sections: [{ from_bar: from, to_bar: to, label: "W" + from }], chords, keys: [{ bar: from, name: "C major" }] });
  });
  const app = await mkApp("normal", 48, { dense: true });
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "m", aiBackend: "remote", aiWindow: 4096});`);
    assert.equal(val(app, `askBudget().span`), 1200, "the 4k profile: 1200 chars of notes per request");
    const r = await run(app, `annotateRun()`);
    const reqs = srv.requests.filter(x => x.path === "/v1/chat/completions");
    assert.ok(reqs.length >= 2, "more than one window: " + reqs.length);
    assert.equal(r.windows, reqs.length);
    const spans = reqs.map(barsOf);
    assert.equal(spans[0][0], 1); assert.equal(spans.at(-1)[1], 48);
    for (let i = 1; i < spans.length; i++) assert.equal(spans[i][0], spans[i - 1][1] + 1, "windows abut: " + JSON.stringify(spans));
    for (const [i, rec] of reqs.entries()) {
      const [from, to] = spans[i];
      const rows = [...rec.json.messages.at(-1).content.matchAll(/^(\d+)\|/gm)].map(m => +m[1]);
      assert.ok(rows.length, "window " + i + " has rows");
      assert.ok(Math.min(...rows) === from && Math.max(...rows) === to, "window " + i + " carries exactly bars " + from + "–" + to + ": " + Math.min(...rows) + "–" + Math.max(...rows));
      assert.doesNotMatch(rec.json.messages.at(-1).content, /cut at bar/, "a window never overflows the cap");
      assert.match(rec.json.messages.at(-1).content, /^FACTS/m, "facts for every window");
    }
    assert.equal(val(app, `rollnotes.filter(n => n.chord).length`), 48);
    assert.equal(val(app, `rollnotes.filter(n => n.section).length`), reqs.length, "one section per window, none duplicated");
    assert.equal(val(app, `rollnotes.filter(n => n.keydir !== undefined).length`), reqs.length);
    assert.equal(val(app, `editUndo.length`), 1, "every window's estimates land as ONE undo step");
    assert.match(run(app, `annotateSummary(annotateLast)`), new RegExp(" · " + reqs.length + " windows — one undo takes it back$"));
  } finally { await srv.close(); }
});

test("gate: no song, a locked (newer-format) annotation file, an audio/drum-only song, a link to another repo — each refused with its reason, nothing sent", async () => {
  const srv = await modelServer(() => "{}");
  const app = await mkApp("normal", 4);
  try {
    run(app, `saveCfg({aiUrl: ${JSON.stringify(srv.url)}, aiModel: "m", aiBackend: "remote"});`);
    run(app, `rollnotesReadOnly = true; rollnotesLockReason = "⚠ locked for the test";`);
    assert.equal(run(app, `annotateGate()`), "⚠ locked for the test");
    await assert.rejects(run(app, `annotateRun()`), /locked for the test/);
    run(app, `rollnotesReadOnly = false; rollnotesLockReason = null;`);
    run(app, `song.tracks[0].kind = "audio"; song.tracks[1].drums = true;`); // trackIsDrums caches its answer on the track, so the flag is set directly
    assert.match(run(app, `annotateGate()`), /^no pitched notes to read/);
    run(app, `song.tracks[0].kind = undefined; song.tracks[1].drums = false;`);
    assert.equal(run(app, `annotateGate()`), null);
    run(app, `globalThis.__s = song; song = null;`);
    assert.equal(run(app, `annotateGate()`), "no song open");
    run(app, `song = globalThis.__s;`);
    assert.equal(srv.requests.filter(x => x.path === "/v1/chat/completions").length, 0);
  } finally { await srv.close(); }
});

// ---- Learning hides what Normal wrote --------------------------------------
// CLAUDE.md: "nothing from Normal mode may leak into Learning mode's UI, AI
// context, or repo files". AI-tagged annotations are song state (they ride
// the file, the local store and undo), so Learning HIDES them — one choke
// point, visibleNotes()/annoShown (model/rollnotes.js) — and never deletes
// them: flip back to Normal and they are all there, byte for byte.
test("Learning mode hides ✦ AI-tagged annotations from every reader that shows or forwards them (bands, All notes, LCD/subtitle lookups, ✦ Ask context + tools, generators) — the user's own still show, storage keeps both, Normal shows all, flipping loses nothing", async () => {
  const app = await mkApp("normal", 8);
  const AI = `{model: "m", at: "2026-10-04T00:00:00.000Z"}`;
  run(app, `
    view.pxq = 20; // every bar of the 8 on the 800 px stub canvas
    CATALOG = {test: [["annot", "albums/test/annot.mid"], ["other", "albums/test/other.mid"]]};
    const seed = deriveNoteTypes([
      {b1: 1, q1: 1, b2: 4, q2: 4, text: "section: Intro"},
      {b1: 1, q1: 1, b2: 1, q2: 4, text: "chord: C"},
      {b1: 5, q1: 1, b2: 8, q2: 4, text: "section: Verse", ai: ${AI}},
      {b1: 2, q1: 1, b2: 2, q2: 4, text: "chord: Fmaj7", ai: ${AI}}, // Fmaj7, not F: the piano's own key labels draw an F too
      {b1: 1, q1: 1, b2: null, q2: null, text: "key: C major", ai: ${AI}},
    ]);
    for (const n of seed) { n.added = true; rollnotes.push(resolveNote(n)); }
    finalizeNotes(); saveLocalNotes();
    globalThis.__drawn = [];
    ctx.fillText = t => globalThis.__drawn.push(String(t));
  `);
  const bt = 1920, bar5 = 4 * bt;
  const drawn = () => { run(app, `globalThis.__drawn.length = 0; draw();`); return val(app, `globalThis.__drawn`).join("|"); };
  const txt = el => (el.textContent || "") + " " + (el.children || []).map(txt).join(" ");
  const listed = () => { run(app, `renderNoteList();`); return txt(app.run(`document.getElementById("notelistrows")`)); };
  const snapshot = run(app, `annoSnapshot()`);
  const stored = () => val(app, `JSON.parse(localStorage.getItem(notesStoreKey())).map(n => [n.text, !!n.ai])`);
  const otherNotes = JSON.stringify({version: 2, format: "night-roll-annotations", song: "other", notes: [
    {at: [1, 1], to: [2, 4], type: "section", label: "Head"},
    {at: [3, 1], to: [4, 4], type: "section", label: "Guess", ai: {model: "m", at: "2026-10-04T00:00:00.000Z"}},
  ]});
  app.context.fetch = async () => ({ok: true, status: 200, text: async () => otherNotes, json: async () => JSON.parse(otherNotes), arrayBuffer: async () => new ArrayBuffer(0)});

  // Normal: everything shows, tags included
  assert.equal(val(app, `rollnotes.length`), 5);
  assert.equal(val(app, `visibleNotes().length`), 5);
  assert.match(drawn(), /Intro/); assert.match(drawn(), /Verse/); assert.match(drawn(), /Fmaj7/);
  assert.match(listed(), /Verse/); assert.match(listed(), /✦ AI/);
  assert.equal(val(app, `keyRegions.length`), 1);
  assert.equal(run(app, `sectionPathAt(${bar5})`), "Verse", "the subtitle's breadcrumb");
  run(app, `playCursor = 0; lcdCache = null; updateLCD();`);
  assert.equal(run(app, `document.getElementById("lcdkey").textContent`), "C major", "Normal: the AI key reads on the LCD");
  assert.match(run(app, `keyLabelState().text`), /C major/);
  assert.match(run(app, `askContext(askSpan(), askBudget())`), /Verse/);
  assert.match(run(app, `askAnnotationsText()`), /Verse/); assert.match(run(app, `askAnnotationsTextCompact()`), /Verse/);
  assert.equal(run(app, `askFindAnnotation({bar: 5, beat: 1}).text`), "Verse");
  assert.match(await run(app, `askRunTool("act", {do: [{action: "read_notes", path: "other"}]})`), /Guess/, "Normal: read_notes lists another song's AI estimates too");
  assert.equal(val(app, `factsDocFromState().rollnotes.length`), 5);
  assert.deepEqual(val(app, `bsChordTimeline(0, ${8 * bt}).map(c => c.t / ${bt})`), [0, 1], "Normal: the Bassist follows the AI chord in bar 2");
  assert.deepEqual(val(app, `[...drBoundaries(0, ${8 * bt})]`), [1, 5], "Normal: the Drummer sees the AI section start");

  // Learning: the same song, the AI layer gone from every surface — not from the data
  run(app, `setAppMode("learning"); applyMode();`);
  assert.equal(val(app, `rollnotes.length`), 5, "hidden, not deleted");
  assert.deepEqual(val(app, `visibleNotes().map(n => n.text)`), ["Intro", "C"]);
  assert.equal(val(app, `rollnotes.filter(n => n.ai).every(n => n.lane === null)`), true, "hidden bands hold no row");
  const d = drawn();
  assert.match(d, /Intro/); assert.match(d, /\bC\b/);
  assert.doesNotMatch(d, /Verse/); assert.doesNotMatch(d, /Fmaj7/);
  const l = listed();
  assert.match(l, /Intro/); assert.doesNotMatch(l, /Verse/); assert.doesNotMatch(l, /✦ AI/); assert.doesNotMatch(l, /C major/);
  assert.equal(val(app, `keyRegions.length`), 0, "the AI key never reaches the staff");
  assert.equal(run(app, `sectionPathAt(${bar5})`), "", "no breadcrumb from a hidden section");
  run(app, `lcdCache = null; updateLCD();`);
  assert.equal(run(app, `document.getElementById("lcdkey").textContent`), "C?", "Learning: the LCD shows the undeclared default");
  assert.equal(run(app, `keyLabelState().text`), "key: not set (C)");
  const ctxText = run(app, `askContext(askSpan(), askBudget())`);
  assert.match(ctxText, /Intro/); assert.doesNotMatch(ctxText, /Verse|C major/);
  assert.match(ctxText, /key state: key: not set/);
  for (const fn of ["askAnnotationsText()", "askAnnotationsTextCompact()"]) {
    const t = run(app, fn);
    assert.match(t, /Intro/); assert.doesNotMatch(t, /Verse|C major|"ai"/, fn);
  }
  assert.match(caught(app, `askFindAnnotation({bar: 5, beat: 1})`), /no annotation at bar 5 beat 1/);
  const verseId = val(app, `rollnotes.findIndex(n => n.text === "Verse")`);
  assert.match(caught(app, `askFindAnnotation({id: ${verseId}})`), /no annotation with id/);
  assert.equal(run(app, `askFindAnnotation({bar: 1, beat: 1, match_text: "Intro"}).text`), "Intro", "his own stay addressable");
  const rn = await run(app, `askRunTool("act", {do: [{action: "read_notes", path: "other"}]})`);
  assert.match(rn, /Head/); assert.doesNotMatch(rn, /Guess/, "read_notes drops another song's AI estimates in Learning");
  assert.doesNotMatch(run(app, `notesTxtFor()`), /Verse|C major|key:/, "the notes.txt dump states no key and no AI label");
  assert.equal(val(app, `factsDocFromState().rollnotes.length`), 2, "the FACTS/Analyze/Ask grounding never see them");
  assert.deepEqual(val(app, `bsChordTimeline(0, ${8 * bt}).map(c => c.t / ${bt})`), [0]);
  assert.deepEqual(val(app, `[...drBoundaries(0, ${8 * bt})]`), [1]);
  run(app, `lassoAnno = {t0: 0, t1: ${8 * bt}, y0: 0, y1: 10000};`);
  assert.deepEqual(val(app, `lassoedAnnos().map(n => n.text).sort()`), ["C", "Intro"], "the lasso grabs only what is shown");
  run(app, `lassoAnno = null;`);
  // storage still holds both, untouched
  assert.equal(run(app, `annoSnapshot()`), snapshot, "the annotation layer is byte-identical");
  assert.deepEqual(stored().filter(([, ai]) => ai).map(([t]) => t).sort(), ["Fmaj7", "Verse", "key: C major"], "the local store keeps the tagged ones");
  assert.equal(val(app, `JSON.parse(serializeRollnotes()).notes.filter(e => e.ai).length`), 3, "the file writer keeps them too");
  assert.equal(val(app, `editUndo.length`), 0, "no edit happened");

  // flip back: all five again; flip twice more: still five, still identical
  run(app, `setAppMode("normal"); applyMode();`);
  assert.equal(val(app, `visibleNotes().length`), 5);
  assert.equal(val(app, `keyRegions.length`), 1);
  assert.match(drawn(), /Verse/); assert.match(listed(), /✦ AI/);
  assert.equal(run(app, `sectionPathAt(${bar5})`), "Verse");
  run(app, `setAppMode("learning"); applyMode(); setAppMode("normal"); applyMode();`);
  assert.equal(val(app, `rollnotes.length`), 5);
  assert.equal(run(app, `annoSnapshot()`), snapshot);
});
