// tests/ask-forward.test.mjs — a Worker message that belongs in a song's ♪
// chat (Josh #1189): the bridge answers the Worker row with a kind:"chat"
// note {text, song, songTitle}; this device runs the words in that song's
// chat as the user's own message, under a "↪ from the Worker tab" line, once
// per note (across reloads); a message for another song waits as a chip in
// the Worker tab (Send now / Dismiss) and goes out when that song opens.
// src/ask/forward.js over vendor/ai/web/forward.js.
import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./harness.mjs";

const OPEN = "albums/snes/final-fantasy-4/fight-1.mid", OTHER = "albums/snes/final-fantasy-4/red-wings.mid";
const chat = (id, song, text, extra) => ({id, t: 1758000000000 + id, from: "terminal", kind: "chat", text, song, songTitle: song === OPEN ? "Fight 1" : "Red Wings", ...(extra || {})});

async function mkApp() {
  const app = await createApp({ storage: { "ff1roll-mode": "learning" } });
  app.run(`song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}], tracks: [{name: "melody", notes: [{t: 0, d: 480, p: 60, v: 80}]}]};
           songKey = ${JSON.stringify(OPEN)}; songEndTick = 4 * 480; playCursor = 0; trackState = [{muted: false, solo: false}]; rollnotes = []; keyRegions = []; finalizeNotes();
           CATALOG = {"Final Fantasy IV": [["Fight 1", ${JSON.stringify(OPEN)}], ["Red Wings", ${JSON.stringify(OTHER)}]]};
           aiUrl = () => "http://localhost:8788"; // "local": askInboxAllowed needs no host allow-listing
           globalThis.__sent = []; askSend = async text => { globalThis.__sent.push({text, key: askStoreKey(), hop: askHopKey}); };
           asklog.innerHTML = ""; asksheet.classList.remove("on"); askSetMode("song");`);
  return app;
}
const val = (app, code) => JSON.parse(app.run(`JSON.stringify(${code})`));
const chips = app => val(app, `[...asklog.children].filter(d => d.className === "askfwd").map(d => [d.dataset.note, d.children[0].textContent, d.children.slice(1).map(b => b.textContent)])`); // the harness DOM has no selectors: walk the log's children
const tap = (app, note, which) => app.run(`[...asklog.children].find(d => d.className === "askfwd" && d.dataset.note === "${note}").children[${which}].dispatchEvent({type: "click"});`);
const settle = async app => { for (let i = 0; i < 4; i++) { app.tick(300); await new Promise(r => setTimeout(r, 0)); } };

test("open song: the chat note is never a note — the song chat gets the ↪ line and the words go out as the user's message there, once per note id", async () => {
  const app = await mkApp();
  app.run(`askNotesArrived([{id: 1, t: 1758000000000, from: "terminal", text: "→ sent to the ♪ chat for Fight 1"}, ${JSON.stringify(chat(2, OPEN, "Next harmony for two bars is A minor, then C for two bars"))}]);`);
  await settle(app);
  assert.deepEqual(val(app, `askStore(ASK_TERMINAL_KEY).msgs.map(m => [m.role, m.content])`), [["note", "→ sent to the ♪ chat for Fight 1"]], "the plain note lands in the Worker chat; the hand-off does not");
  const song = val(app, `askStore("ff1roll-ask-" + ${JSON.stringify(OPEN)}).msgs`);
  assert.deepEqual(song.map(m => [m.role, m.content, m.m]), [["note", "↪ from the Worker tab", "handoff"]], "the marker line, then askSend (stubbed) carries the words");
  assert.deepEqual(val(app, `globalThis.__sent`), [{text: "Next harmony for two bars is A minor, then C for two bars", key: "ff1roll-ask-" + OPEN, hop: "ff1roll-ask-" + OPEN}]);
  assert.equal(val(app, `askTerminal`), false, "the ♪ tab shows the chat it ran in");
  assert.deepEqual(val(app, `JSON.parse(localStorage.getItem("ff1roll-ask-forward"))`), {pending: [], done: [2]});
  // the same note again (a second poll, a reload): nothing more
  app.run(`askNotesArrived([${JSON.stringify(chat(2, OPEN, "Next harmony for two bars is A minor, then C for two bars"))}]);`);
  await settle(app);
  assert.equal(val(app, `globalThis.__sent.length`), 1);
  assert.equal(val(app, `askStore("ff1roll-ask-" + ${JSON.stringify(OPEN)}).msgs.length`), 1);
});

test("another song: the message waits as a chip in the Worker tab, the ✉ light says so, and it goes out when that song opens (setSong → askForwardOnSong)", async () => {
  const app = await mkApp();
  app.run(`askNotesArrived([${JSON.stringify(chat(5, OTHER, "bars 9 through 12 in E minor"))}]);`);
  await settle(app);
  assert.deepEqual(val(app, `globalThis.__sent`), []);
  assert.deepEqual(val(app, `askForwardPending().map(p => [p.id, p.song, p.songTitle, p.text])`), [[5, OTHER, "Red Wings", "bars 9 through 12 in E minor"]]);
  assert.ok(val(app, `document.getElementById("askbtn").classList.contains("hasnote")`), "the light");
  assert.deepEqual(val(app, `askStore("ff1roll-ask-" + ${JSON.stringify(OTHER)}).msgs`), [], "nothing is written into the other song's chat yet");
  // the Worker tab draws the chip
  app.run(`asksheet.classList.add("on"); askSetMode("terminal"); askRender();`);
  assert.deepEqual(chips(app), [["5", "Waiting for Red Wings: \u201Cbars 9 through 12 in E minor\u201D", ["Send now", "Dismiss"]]]);
  app.run(`askSetMode("song"); askRender();`);
  assert.deepEqual(chips(app), [], "only in the Worker tab");
  // that song opens: the message runs there
  app.run(`songKey = ${JSON.stringify(OTHER)}; askForwardOnSong();`);
  await settle(app);
  assert.deepEqual(val(app, `globalThis.__sent`), [{text: "bars 9 through 12 in E minor", key: "ff1roll-ask-" + OTHER, hop: "ff1roll-ask-" + OTHER}]);
  assert.deepEqual(val(app, `askStore("ff1roll-ask-" + ${JSON.stringify(OTHER)}).msgs.map(m => m.content)`), ["↪ from the Worker tab"]);
  assert.deepEqual(val(app, `askForwardPending()`), []);
  assert.deepEqual(val(app, `JSON.parse(localStorage.getItem("ff1roll-ask-forward")).done`), [5]);
});

test("Send now opens the song through the open_song switch and sends; Dismiss forgets it; a hand-off tagged for the native app is not this device's", async () => {
  const app = await mkApp();
  app.run(`globalThis.__opened = []; openRecentSong = async path => { globalThis.__opened.push(path); songKey = path; return true; };`);
  app.run(`askNotesArrived([${JSON.stringify(chat(7, OTHER, "a second voice under the tune"))}, ${JSON.stringify(chat(8, OTHER, "slower, 90 bpm"))}, ${JSON.stringify(chat(9, OPEN, "for the iPad", {tag: "NR Native"}))}]);`);
  await settle(app);
  assert.deepEqual(val(app, `askForwardPending().map(p => p.id)`), [7, 8], "the tagged one is another client's: neither waiting nor a note");
  assert.deepEqual(val(app, `askStore(ASK_TERMINAL_KEY).msgs`), []);
  app.run(`asksheet.classList.add("on"); askSetMode("terminal"); askRender();`); tap(app, 7, 1);
  await settle(app);
  assert.deepEqual(val(app, `globalThis.__opened`), [OTHER], "Send now opened the song");
  assert.deepEqual(val(app, `globalThis.__sent`), [{text: "a second voice under the tune", key: "ff1roll-ask-" + OTHER, hop: "ff1roll-ask-" + OTHER}]);
  assert.deepEqual(val(app, `askForwardPending().map(p => p.id)`), [8]);
  app.run(`askSetMode("terminal"); askRender();`); tap(app, 8, 2);
  assert.deepEqual(val(app, `askForwardPending()`), []);
  assert.deepEqual(chips(app), [], "the chip row is redrawn without it");
  assert.deepEqual(val(app, `JSON.parse(localStorage.getItem("ff1roll-ask-forward")).done`), [7, 8]);
  app.run(`askNotesArrived([${JSON.stringify(chat(8, OTHER, "slower, 90 bpm"))}]);`);
  assert.deepEqual(val(app, `askForwardPending()`), [], "a dismissed note does not come back");
});
