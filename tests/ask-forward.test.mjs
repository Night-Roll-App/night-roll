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

const OPEN = "albums/snes/final-fantasy-4/fight-1.mid", OTHER = "albums/snes/final-fantasy-4/red-wings.mid", THIRD = "albums/snes/final-fantasy-4/prelude.mid";
const chat = (id, song, text, extra) => ({id, t: 1758000000000 + id, from: "terminal", kind: "chat", text, song, songTitle: song === OPEN ? "Fight 1" : "Red Wings", ...(extra || {})});

async function mkApp() {
  const app = await createApp({ storage: { "ff1roll-mode": "learning" } });
  app.run(`song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}], tracks: [{name: "melody", notes: [{t: 0, d: 480, p: 60, v: 80}]}]};
           songKey = ${JSON.stringify(OPEN)}; songEndTick = 4 * 480; playCursor = 0; trackState = [{muted: false, solo: false}]; rollnotes = []; keyRegions = []; finalizeNotes();
           CATALOG = {"Final Fantasy IV": [["Fight 1", ${JSON.stringify(OPEN)}], ["Red Wings", ${JSON.stringify(OTHER)}], ["Prelude", ${JSON.stringify(THIRD)}]]};
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

test("Send now opens the song (the message waits until it is really in, then goes out); Dismiss forgets it; a hand-off tagged for the native app is not this device's", async () => {
  const app = await mkApp();
  app.run(`globalThis.__opened = []; openRecentSong = async path => { globalThis.__opened.push(path); songKey = path; return true; };`); // the stub stands for loadSong + setSong: the real one also fires askForwardOnSong
  app.run(`askNotesArrived([${JSON.stringify(chat(7, OTHER, "a second voice under the tune"))}, ${JSON.stringify(chat(8, THIRD, "slower, 90 bpm", {songTitle: "Prelude"}))}, ${JSON.stringify(chat(9, OPEN, "for the iPad", {tag: "NR Native"}))}, ${JSON.stringify(chat(10, THIRD, "a same-named song is not this one", {songTitle: "Fight 1"}))}]);`);
  await settle(app);
  assert.deepEqual(val(app, `askForwardPending().map(p => p.id)`), [7, 8, 10], "the tagged one is another client's: neither waiting nor a note; a path that is not the open song's waits even under the open song's title");
  assert.deepEqual(val(app, `askStore(ASK_TERMINAL_KEY).msgs`), []);
  assert.deepEqual(val(app, `globalThis.__sent`), []);
  app.run(`asksheet.classList.add("on"); askSetMode("terminal"); askRender();`); tap(app, 7, 1);
  await settle(app);
  assert.deepEqual(val(app, `globalThis.__opened`), [OTHER], "Send now opened the song");
  assert.deepEqual(val(app, `globalThis.__sent`), [{text: "a second voice under the tune", key: "ff1roll-ask-" + OTHER, hop: "ff1roll-ask-" + OTHER}]);
  assert.deepEqual(val(app, `askForwardPending().map(p => p.id)`), [8, 10]);
  app.run(`askSetMode("terminal"); askRender();`); tap(app, 10, 2);
  app.run(`askSetMode("terminal"); askRender();`); tap(app, 8, 2);
  assert.deepEqual(val(app, `askForwardPending()`), []);
  assert.deepEqual(chips(app), [], "the chip row is redrawn without it");
  assert.deepEqual(val(app, `JSON.parse(localStorage.getItem("ff1roll-ask-forward")).done`), [7, 10, 8]);
  app.run(`askNotesArrived([${JSON.stringify(chat(8, THIRD, "slower, 90 bpm", {songTitle: "Prelude"}))}]);`);
  assert.deepEqual(val(app, `askForwardPending()`), [], "a dismissed note does not come back");
});

test("Send now on a song that will not load keeps the chip (the words are never lost); a busy chat, a load or a take in progress makes the message wait and it goes out on the retry", async () => {
  const app = await mkApp();
  app.run(`globalThis.__opened = []; openRecentSong = async path => { globalThis.__opened.push(path); return false; };`); // a renamed or deleted song: the load says no
  app.run(`askNotesArrived([${JSON.stringify(chat(11, OTHER, "a second voice under the tune"))}]);`);
  await settle(app);
  app.run(`asksheet.classList.add("on"); askSetMode("terminal"); askRender();`); tap(app, 11, 1);
  await settle(app);
  assert.deepEqual(val(app, `globalThis.__opened`), [OTHER]);
  assert.deepEqual(val(app, `globalThis.__sent`), [], "nothing went anywhere");
  assert.deepEqual(val(app, `askForwardPending().map(p => p.id)`), [11], "still waiting, with its chip");
  assert.match(val(app, `statusHistory.at(-1).text`), /couldn't open Red Wings/);
  // the open song's chat is busy (a reply streaming): the hand-off waits, then goes out once the chat is free
  app.run(`askBusy = true; askNotesArrived([${JSON.stringify(chat(12, OPEN, "put a C in bar 4"))}]);`);
  await settle(app);
  assert.deepEqual(val(app, `globalThis.__sent`), []);
  assert.deepEqual(val(app, `askForwardPending().map(p => p.id)`), [11, 12]);
  assert.ok(val(app, `!!askForwardTimer`), "a retry is armed");
  app.run(`askBusy = false;`);
  await settle(app); await settle(app);
  assert.deepEqual(val(app, `globalThis.__sent.map(x => x.text)`), ["put a C in bar 4"]);
  assert.deepEqual(val(app, `askForwardPending().map(p => p.id)`), [11]);
  // a take in progress is never interrupted by a chat that may edit the song
  app.run(`recording = true; askNotesArrived([${JSON.stringify(chat(13, OPEN, "slower, 90 bpm"))}]);`);
  await settle(app);
  assert.deepEqual(val(app, `globalThis.__sent.length`), 1);
  app.run(`recording = false;`);
  await settle(app); await settle(app);
  assert.deepEqual(val(app, `globalThis.__sent.map(x => x.text)`), ["put a C in bar 4", "slower, 90 bpm"]);
});

test("two browsers on one inbox: a hand-off that names the sending device runs only there; this device's own id is kept in storage", async () => {
  const app = await mkApp();
  app.run(`askNotesArrived([${JSON.stringify(chat(21, OPEN, "from the Mac's browser", {device: "w0000000000other"}))}]);`);
  await settle(app);
  assert.deepEqual(val(app, `globalThis.__sent`), [], "another browser's message: not run here");
  assert.deepEqual(val(app, `askForwardPending()`), [], "nor waiting here");
  const me = val(app, `localStorage.getItem("ff1roll-ask-device")`);
  assert.match(me, /^[\w.-]{8,64}$/, "this browser's id, made on first use and kept");
  app.run(`askNotesArrived([${JSON.stringify(chat(22, OPEN, "from this browser"))}.__proto__ === Object.prototype ? Object.assign(${JSON.stringify(chat(22, OPEN, "from this browser"))}, {device: localStorage.getItem("ff1roll-ask-device")}) : null]);`);
  await settle(app);
  assert.deepEqual(val(app, `globalThis.__sent.map(x => x.text)`), ["from this browser"]);
  assert.equal(val(app, `localStorage.getItem("ff1roll-ask-device")`), me);
});
