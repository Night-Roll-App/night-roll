// tests/ask-history.test.mjs — Earlier chats (Josh #1203, "what do I need to
// do to get my chat history back for the Ex Ex Battle Theme"): the song's
// published <song>.ask.md shown read-only, folded at the top of its ♪ chat
// (src/ask/history.js). The log is fetched the way the song's other repo files
// are (readData), parsed tolerantly, and never written, never stored, never
// sent. The sample below is the shape askLogMarkdown writes, including the
// "⚠ the Mac no longer has this reply" line and a block with no reply at all.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp, appCss } from "./harness.mjs";

const SONG = "albums/compositions/nightroll/ex-ex-battle-theme.mid";
const LOG = `# ✦ AI log — Ex Ex Battle Theme

One file per song. Night Roll appends the chat since the last Save each time the song is saved; Clear chat starts a new session on the device without touching this file.

### 2026-10-13 20:06 · bars 1–18 (in view)

**Josh:** Compare this song to the other file in the directory with the same name

**AI (claude-code-sonnet):** ⚠ the Mac no longer has this reply (its bridge restarted, or the question never reached it) — ask again

### 2026-10-13 20:07 · bars 1–26 (in view)

**Josh:** Compare this song to the other file in the directory with the same name

**AI (claude-code-sonnet):** The two songs share the same material, so ex-ex looks like a reworked ex.

The big change is structure. In ex-battle-theme, pulse1 plays the 8-bar arpeggio tune alone for bars 1–8.
See https://example.com/x for **bold** words and a ### fake heading inside a line.

**Mac (terminal):** QUESTION: do you want the B part moved?

### 2026-10-14 09:00

**Josh:** a question that never got its reply
`;

async function mkApp(storage = {}) {
  const app = await createApp({ storage: { "ff1roll-mode": "learning", ...storage } });
  app.run(`song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}], tracks: [{name: "melody", notes: [{t: 0, d: 480, p: 60, v: 80}]}]};
           songKey = ${JSON.stringify(SONG)}; songEndTick = 4 * 480; playCursor = 0; trackState = [{muted: false, solo: false}]; rollnotes = []; keyRegions = []; finalizeNotes();`);
  return app;
}
const val = (app, code) => JSON.parse(app.run(`JSON.stringify(${code})`));
const settle = () => new Promise(r => setImmediate(r)); // the readData promise chain (fetch → text → parse → redraw)
function stubFetch(app, reply) {
  app.context.__fetches = [];
  app.context.fetch = async (url) => { app.context.__fetches.push(String(url)); return reply(String(url)); };
}
const ok = text => ({ok: true, status: 200, text: async () => text});
const miss = () => ({ok: false, status: 404, text: async () => "Not found"});

test("askLogParse: a heading per exchange, the labelled paragraphs under it; odd content (the ⚠ line, a missing reply, bold and ### inside a reply, CRLF, an empty or header-only file) never throws", async () => {
  const app = await mkApp();
  const blocks = val(app, `askLogParse(${JSON.stringify(LOG)})`);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].date, "2026-10-13 20:06 · bars 1–18 (in view)");
  assert.deepEqual(blocks[0].msgs.map(m => m.role), ["user", "ai"]);
  assert.match(blocks[0].msgs[1].text, /^⚠ the Mac no longer has this reply/);
  assert.equal(blocks[0].msgs[1].who, "AI (claude-code-sonnet)");
  assert.deepEqual(blocks[1].msgs.map(m => m.role), ["user", "ai", "note"]);
  assert.match(blocks[1].msgs[1].text, /reworked ex\.\n\nThe big change is structure\./, "a reply keeps its paragraphs");
  assert.match(blocks[1].msgs[1].text, /\*\*bold\*\* words and a ### fake heading/, "bold and ### inside a line are words, not structure");
  assert.match(blocks[1].msgs[2].text, /^QUESTION: do you want/);
  assert.deepEqual(blocks[2].msgs.map(m => m.role), ["user"], "a question with no reply is one message, not a crash");
  assert.equal(val(app, `askLogParse(${JSON.stringify(LOG.replace(/\n/g, "\r\n"))}).length`), 3, "CRLF");
  assert.deepEqual(val(app, `askLogParse("")`), []);
  assert.deepEqual(val(app, `askLogParse(${JSON.stringify(LOG.split("### ")[0])})`), [], "header only");
  assert.deepEqual(val(app, `askLogParse(null)`), []);
  assert.deepEqual(val(app, `askLogParse("### odd\\n\\nno label here\\n")`), [{date: "odd", msgs: [{role: "ai", who: "", text: "no label here"}]}], "a line with no label still shows");
});

test("the ♪ chat gets an 'Earlier chats (N)' fold once the song's log arrives: fetched like the song's repo files, closed by default (one summary row), the live store untouched; the general/Claude tab has no fold", async () => {
  const app = await mkApp();
  stubFetch(app, url => /ex-ex-battle-theme\.ask\.md/.test(url) ? ok(LOG) : miss());
  app.run(`askSetMode("song"); askRender();`);
  assert.equal(val(app, `S.askHistory.state`), "loading");
  await settle(); await settle();
  assert.equal(val(app, `S.askHistory.state`), "ok");
  assert.ok(app.context.__fetches.some(u => /albums\/compositions\/nightroll\/ex-ex-battle-theme\.ask\.md/.test(u)), "the published .ask.md path, beside the song: " + app.context.__fetches.join(" "));
  const det = app.run(`asklog.children[0]`);
  assert.equal(det.className, "askhist");
  assert.equal(det.open, false, "closed by default");
  assert.equal(det.children.length, 1, "closed: the summary only, nothing drawn yet");
  assert.match(det.children[0].textContent, /^Earlier chats \(3\)/);
  assert.equal(val(app, `askLoad().length`), 0, "nothing from the file enters the live chat store");
  assert.equal(val(app, `localStorage.getItem("ff1roll-ask-" + songKey)`), null, "no store was written");
  assert.equal(app.context.__fetches.filter(u => /ask\.md/.test(u)).length, 1, "one fetch per song, not one per redraw");
  app.run(`askRender()`);
  assert.equal(app.context.__fetches.filter(u => /ask\.md/.test(u)).length, 1);
  // the other tabs: no fold
  app.run(`S.askCaps = {bridge: true, terminal: true, sessions: true}; askSetMode("terminal"); askRender();`);
  assert.ok(!app.run(`asklog.children`).some(c => c.className === "askhist"), "the Claude tab shows no song log");
  app.run(`askSetMode("song")`);
});

test("open, the fold draws each block's date line and the chat's own bubbles (.askmsg user/ai/note), oldest first; the open/closed choice is remembered on the device; long logs show the last 25 with a 'Show earlier' button", async () => {
  const app = await mkApp({ "ff1roll-ask-history-open": "1" });
  stubFetch(app, () => ok(LOG));
  app.run(`askSetMode("song"); askRender();`);
  await settle(); await settle();
  let det = app.run(`asklog.children[0]`);
  assert.equal(det.className, "askhist");
  assert.equal(det.open, true, "remembered open");
  assert.deepEqual(det.children.slice(1).map(c => c.className), ["askhistdate", "askmsg hist user", "askmsg hist ai", "askhistdate", "askmsg hist user", "askmsg hist ai", "askmsg hist note", "askhistdate", "askmsg hist user"]);
  assert.equal(det.children[1].textContent, "2026-10-13 20:06 · bars 1–18 (in view)");
  assert.match(det.children[3].textContent, /^⚠ the Mac no longer has this reply/);
  assert.equal(det.children[3].title, "AI (claude-code-sonnet)", "which model answered, on hover");
  // the toggle writes the device pref only — never the store or the file
  det.open = false; det.dispatchEvent({type: "toggle"});
  assert.equal(val(app, `localStorage.getItem("ff1roll-ask-history-open")`), "0");
  assert.equal(val(app, `askLoad().length`), 0);
  // a long log: 60 exchanges → the last 25 drawn, "Show earlier (35 more)" above them; a tap draws 25 more
  app.run(`localStorage.setItem("ff1roll-ask-history-open", "1")`);
  let big = LOG.split("### ")[0];
  for (let i = 1; i <= 60; i++) big += `### 2026-11-${String(1 + (i % 28)).padStart(2, "0")} 10:${String(i % 60).padStart(2, "0")}\n\n**Josh:** q${i}\n\n**AI:** a${i}\n\n`;
  stubFetch(app, () => ok(big));
  app.run(`songKey = "albums/compositions/nightroll/other.mid"; askRender();`);
  await settle(); await settle();
  det = app.run(`asklog.children[0]`);
  assert.match(det.children[0].textContent, /^Earlier chats \(60\)/);
  assert.equal(det.children[1].className, "askhistmore");
  assert.equal(det.children[1].textContent, "Show earlier (35 more)");
  assert.equal(det.children.filter(c => c.className === "askhistdate").length, 25);
  assert.equal(det.children.filter(c => c.className === "askhistdate")[0].textContent.slice(0, 7), "2026-11", "oldest of the drawn page first");
  assert.match(det.children[det.children.length - 1].textContent, /^a60$/, "…down to the newest exchange, nearest the live chat");
  det.children[1].dispatchEvent({type: "click"});
  det = app.run(`asklog.children[0]`);
  assert.equal(det.children[1].textContent, "Show earlier (10 more)");
  assert.equal(det.children.filter(c => c.className === "askhistdate").length, 50);
  app.run(`songKey = ${JSON.stringify(SONG)}`);
});

test("no fold for a song with no published log (404 or offline), for a local-only song (no fetch at all), or for a song still loading; the fetch is retried for the next song, not the same one", async () => {
  const app = await mkApp();
  stubFetch(app, miss);
  app.run(`askSetMode("song"); askRender();`);
  await settle(); await settle();
  assert.equal(val(app, `S.askHistory.state`), "missing");
  assert.ok(!app.run(`asklog.children`).some(c => c.className === "askhist"), "404: no fold");
  app.run(`askRender()`);
  assert.equal(app.context.__fetches.length, 1, "a miss is not re-asked on every redraw");
  // offline: the fetch throws
  app.context.fetch = async () => { throw new Error("offline"); };
  app.run(`songKey = "albums/compositions/nightroll/other.mid"; askRender();`);
  await settle(); await settle();
  assert.equal(val(app, `S.askHistory.state`), "missing");
  assert.ok(!app.run(`asklog.children`).some(c => c.className === "askhist"), "offline: no fold, no throw");
  // local-only songs never have a repo log
  for (const k of ["local", "local/my-import.mid"]) {
    app.context.__fetches = []; app.context.fetch = async (u) => { app.context.__fetches.push(String(u)); return ok(LOG); };
    app.run(`songKey = ${JSON.stringify(k)}; askRender();`);
    await settle(); await settle();
    assert.equal(val(app, `S.askHistory.state`), "none", k);
    assert.deepEqual(app.context.__fetches.filter(u => /ask\.md/.test(u)), [], k + ": no fetch");
  }
  app.run(`songKey = ${JSON.stringify(SONG)}`);
});

test("wiring: the module is in every manifest (modulepreload, sw.js APP_MODULES, devtools), the SW cache version moved, the CSS styles the fold, and the help sheet names it", () => {
  const html = readFileSync("index.html", "utf8"), sw = readFileSync("sw.js", "utf8");
  assert.match(html, /modulepreload" href="src\/ask\/history\.js"/);
  assert.match(sw, /"src\/ask\/history\.js"/);
  assert.match(sw, /SW_VERSION = "nr-v58"/);
  assert.match(readFileSync("src/devtools.js", "utf8"), /ask\/history\.js/);
  const css = appCss();
  assert.match(css, /details\.askhist \{/); assert.match(css, /\.askhistdate/); assert.match(css, /\.askhistmore/);
  assert.match(readFileSync("help/help.html", "utf8"), /Earlier chats \(N\)/);
});
