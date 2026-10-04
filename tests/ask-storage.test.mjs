// tests/ask-storage.test.mjs — NO LOST CHATS (AI library step 4,
// docs/ai-library-plan.md §4). Josh's chat history lives in localStorage
// under the ff1roll-ask-* / ff1roll-askdraft-* keys; the fixture captures
// every shape a device held on 2026-10-04 (chat stores with saved/trimmed/
// lastUsed, a pending question, a legacy message without a mode tag, seen
// cursors, the sent-context hashes, a session epoch, a draft in both its
// shapes, the mode and inbox cursors) and what today's code reads back from
// them. Moving the store into the library (vendor/ai/web/store.js, read
// through src/ask/host.js's key names) must leave every one of these
// identical — and eviction must never touch a cursor or an unsaved chat.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "./harness.mjs";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/ask-storage-2026-10-04.json", import.meta.url), "utf8"));
const SONG = "albums/compositions/nightroll/threnody.mid";
const SONG_KEY = "ff1roll-ask-" + SONG;

async function mkApp() {
  const app = await createApp({ storage: { "ff1roll-mode": "learning", ...FIXTURE.storage } });
  app.run(`song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}], tracks: [{name: "melody", notes: [{t: 0, d: 480, p: 60, v: 80}]}]};
           songKey = ${JSON.stringify(SONG)}; songEndTick = 4 * 480; playCursor = 0; trackState = [{muted: false, solo: false}]; rollnotes = []; keyRegions = []; finalizeNotes();`);
  return app;
}
const val = (app, code) => JSON.parse(app.run(`JSON.stringify(${code})`));

test("every stored chat loads identically: askStore(key) → {msgs, saved (capped to msgs.length), trimmed, lastUsed}; a corrupt or missing key is an empty chat, never a throw", async () => {
  const app = await mkApp();
  for (const [key, want] of Object.entries(FIXTURE.expect.stores)) assert.deepEqual(val(app, `askStore(${JSON.stringify(key)})`), want, key);
  for (const [key, n] of Object.entries(FIXTURE.expect.unsaved)) assert.equal(val(app, `askUnsavedCount(${JSON.stringify(key)})`), n, "unsaved " + key);
  // the open chat by tab: ♪ song / ✦ general / ⌨ terminal each read their own store
  app.run(`askSetMode("song")`);
  assert.deepEqual(val(app, `askLoad()`), FIXTURE.expect.stores[SONG_KEY].msgs);
  app.run(`askSetMode("general")`);
  assert.deepEqual(val(app, `askLoad()`), FIXTURE.expect.stores["ff1roll-ask-general"].msgs);
  app.run(`askSetMode("terminal")`);
  assert.deepEqual(val(app, `askLoad()`), FIXTURE.expect.stores["ff1roll-ask-terminal"].msgs);
  app.run(`askSetMode("song")`);
});

test("cursors and caches read back byte for byte: seen cursors (missing fields default to 0), the seen-max watermark, the sent-context hashes (bars map included), the session epoch, the inbox cursor", async () => {
  const app = await mkApp();
  for (const [key, want] of Object.entries(FIXTURE.expect.seen)) assert.deepEqual(val(app, `askSeenGet(${JSON.stringify(key)})`), want, "seen " + key);
  assert.deepEqual(val(app, `askSeenMax()`), FIXTURE.expect.seenMax);
  for (const [key, want] of Object.entries(FIXTURE.expect.sentctx)) assert.deepEqual(val(app, `askSentGet(${JSON.stringify(key)})`), want, "sentctx " + key);
  for (const [key, want] of Object.entries(FIXTURE.expect.epoch)) assert.equal(val(app, `askEpochGet(${JSON.stringify(key)})`), want, "epoch " + key);
  assert.equal(val(app, `localStorage.getItem(askInboxSeenKey())`), FIXTURE.expect.inboxSeen);
  assert.deepEqual(val(app, `askPendingAll().map(p => ({key: p.key, jobId: p.jobId, i: p.i}))`), FIXTURE.expect.pending);
});

test("the unsent draft comes back per chat — today's {text, shots} and the pre-2026-10-02 {shot} shape both; the saved tab (ff1roll-ask-mode) is honoured at boot", async () => {
  const app = await mkApp();
  assert.equal(val(app, `askTerminal ? "terminal" : askGeneral ? "general" : "song"`), FIXTURE.expect.mode, "initSheet1 read ff1roll-ask-mode");
  for (const [mode, key] of [["song", SONG_KEY], ["general", "ff1roll-ask-general"], ["terminal", "ff1roll-ask-terminal"]]) {
    app.run(`askSetMode(${JSON.stringify(mode)}); askDraftKey = null; askDraftLoad();`);
    const want = FIXTURE.expect.drafts[key];
    assert.equal(val(app, `askinput.value`), want.text, "draft text " + key);
    assert.deepEqual(val(app, `askShotPending.map(s => s.path)`), want.shots, "draft shots " + key);
  }
  app.run(`askSetMode("song"); askShotClearAll(); askinput.value = ""; askDraftKey = null;`);
});

test("askRevertToSaved keeps exactly `saved` messages from the front and leaves saved/trimmed alone; a chat with nothing unsaved is untouched (same stored string)", async () => {
  const app = await mkApp();
  const before = val(app, `localStorage.getItem("ff1roll-ask-general")`);
  app.run(`askRevertToSaved("ff1roll-ask-general")`);
  assert.equal(val(app, `localStorage.getItem("ff1roll-ask-general")`), before, "nothing unsaved: not rewritten");
  app.run(`askRevertToSaved(${JSON.stringify(SONG_KEY)})`);
  const after = val(app, `askStore(${JSON.stringify(SONG_KEY)})`);
  assert.deepEqual(after.msgs, FIXTURE.expect.stores[SONG_KEY].msgs.slice(0, 2));
  assert.equal(after.saved, 2);
  assert.equal(after.trimmed, false);
});

test("eviction over the total cap: never a chat with unsaved messages, never a cursor/cache/draft/other key — only clean ff1roll-ask-* chat stores, LRU first, each left as a `trimmed` marker (the repo file has them)", async () => {
  const app = await mkApp();
  app.run(`askSetMode("song")`); // the song chat is the open one (this itself rewrites ff1roll-ask-mode, so before the snapshot)
  const untouched = Object.keys(FIXTURE.storage).filter(k => !(k in FIXTURE.expect.stores) || k === SONG_KEY || k === "ff1roll-ask-terminal");
  const snapshot = Object.fromEntries(untouched.map(k => [k, val(app, `localStorage.getItem(${JSON.stringify(k)})`)]));
  app.run(`askEvictOthers(ASK_TOTAL_CAP + 1);`);
  for (const k of untouched) assert.equal(val(app, `localStorage.getItem(${JSON.stringify(k)})`), snapshot[k], "untouched: " + k);
  // the clean, older chats were let go — as markers, never deleted outright when they held messages
  assert.deepEqual(val(app, `askStore("ff1roll-ask-albums/nes/ff1/town.mid")`), {msgs: [], saved: 0, trimmed: true, lastUsed: 1758000000000});
  assert.deepEqual(val(app, `askStore("ff1roll-ask-general")`), {msgs: [], saved: 0, trimmed: true, lastUsed: 1759590000000});
  assert.equal(val(app, `localStorage.getItem("ff1roll-ask-albums/nes/ff1/matoya.mid")`), null, "an already-empty marker (no messages to lose) is removed outright — today's behaviour, kept");
  assert.equal(val(app, `askUnsavedCount("ff1roll-ask-terminal")`), 2, "unsaved: kept whole");
  assert.equal(val(app, `askUnsavedCount(${JSON.stringify(SONG_KEY)})`), 4, "the open chat: kept whole");
});

test("askSave round trip: what askSave writes, askStore reads back the same — the <context> block is stripped at save time, `saved` and `trimmed` carry over, lastUsed is stamped", async () => {
  const app = await mkApp();
  const t0 = Date.now();
  app.run(`askSetMode("song"); { const m = askLoad(); m.push({role: "user", content: "<context>\\nctx\\n</context>\\n\\nnext?", t: 1759500400000, at: "bars 9–12 (ruler)", mode: "learning"}); askSave(m); }`);
  const st = val(app, `askStore(${JSON.stringify(SONG_KEY)})`);
  assert.equal(st.msgs.length, 7);
  assert.equal(st.msgs[6].content, "next?", "context stripped at save");
  assert.equal(st.saved, 2); assert.equal(st.trimmed, false);
  assert.ok(st.lastUsed >= t0);
  assert.deepEqual(st.msgs.slice(0, 6), FIXTURE.expect.stores[SONG_KEY].msgs, "the earlier messages are byte-identical after a save");
});
