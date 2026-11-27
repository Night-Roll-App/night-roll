// Pickup bar (Josh #1190–#1192, docs/plans/2026-11-27-pickup-bar.md + its
// review): a `pickup: P` directive puts bar 1 P counted beats into the song;
// every anchor is stored in that frame (bar 0 = the pickup), converted through
// absolute time with the two-tap warning, one undo step, version 4. The shared
// fixture tests/fixtures/pickup.rollnotes.json is byte-identical to native's
// copy (PickupTests.testSharedFixture): both suites assert the same ticks,
// labels and bytes.
import nodeTest from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "./harness.mjs";

const app = await createApp();
const run = (c) => app.run(c);
const val = (c) => JSON.parse(run(`JSON.stringify(${c})`));
const test = nodeTest;
const FIXTURE = readFileSync(new URL("./fixtures/pickup.rollnotes.json", import.meta.url), "utf8");
const KEY = "albums/compositions/nightroll/pickup-scratch.mid"; // a scratch composition, never one of his

// a 4/4 scratch song, ppq 480, four bars of quarter notes on one track; the
// first note sits a beat in (a one-beat pickup is what he would mark)
function installSong(opts = {}) {
  run(`
    S.song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}],
      tracks: [{name: "pulse1", notes: Array.from({length: 16}, (_, i) => ({t: i * 480, d: 400, p: 60 + (i % 7), v: 90}))}]};
    S.song.rawNotes = null; S.chopS = 0; S.chopE = null; S.appliedChop = null;
    S.songKey = ${JSON.stringify(opts.key || KEY)}; localStorage.setItem("ff1roll-draft-" + S.songKey, "{}");
    S.trackState = S.song.tracks.map(() => ({muted: false, solo: false}));
    S.editUndo = []; S.editRedo = []; S.playCursor = 0; S.rebarArmed = false; S.editingNote = null;
    S.rollnotesReadOnly = false; S.rollnotesLockReason = null;
    localStorage.removeItem(notesStoreKey()); localStorage.removeItem(tombKey());
    S.rollnotes = []; S.declaredTs = null; S.declaredPickup = null; finalizeNotes();
  `);
}
function teardown() {
  run(`localStorage.removeItem("ff1roll-draft-" + S.songKey); localStorage.removeItem(notesStoreKey()); localStorage.removeItem(tombKey());
       S.rollnotes = []; S.declaredPickup = null; S.declaredTs = null; finalizeNotes(); S.songKey = null;`);
}
const loadList = (list) => run(`S.rollnotes = deriveNoteTypes(${JSON.stringify(list)}).map(resolveNote); finalizeNotes();`);
const anchors = () => val(`S.rollnotes.map(n => [n.text, n.b1, n.q1, n.b2, n.q2, n.until ?? null, n.start, n.end])`);

test("format identity: `pickup: 1` text → object → JSON → object, version 4 only when a pickup exists", () => {
  installSong();
  try {
    const parsed = val(`parseRollnotes("[1.1]\\npickup: 1\\nheard the downbeat on the bass entry").map(n => ({text: n.text, pickup: n.pickup, cnote: n.cnote, b1: n.b1}))`);
    assert.deepEqual(parsed, [{text: "pickup: 1", pickup: 1, cnote: "heard the downbeat on the bass entry", b1: 1}]);
    assert.equal(run(`JSON.stringify(noteToJSON(parseRollnotes("[1.1]\\npickup: 1.5")[0]))`), '{"at":[1,1],"type":"pickup","pickup":1.5}');
    assert.deepEqual(val(`parseRollnotesJSON('{"version":4,"format":"night-roll-annotations","notes":[{"at":[1,1],"type":"pickup","pickup":1,"note":"x"}]}').map(n => [n.text, n.pickup, n.cnote])`), [["pickup: 1", 1, "x"]]);
    assert.deepEqual(val(`parseRollnotesJSON('{"version":4,"format":"night-roll-annotations","notes":[{"at":[1,1],"type":"pickup","pickup":"junk"}]}').length`), 0, "a junk length is no directive");
    assert.equal(val(`rollnotesVersionFor([{text: "x"}])`), 2);
    assert.equal(val(`rollnotesVersionFor([{chord: true, text: "C", layer: 1}])`), 3);
    assert.equal(val(`rollnotesVersionFor([{text: "pickup: 1", pickup: 1}])`), 4);
    assert.equal(val(`rollnotesVersionFor([{text: "pickup: 1", pickup: 1}, {chord: true, text: "C", layer: 1}])`), 4, "pickup outranks layer");
    assert.equal(val(`ROLLNOTES_MAX_VERSION`), 4);
    const v5 = JSON.stringify({format: "night-roll-annotations", version: 5, song: "menu", notes: [{at: [1, 1], text: "x"}]});
    assert.equal(run(`parseRollnotesJSON(${JSON.stringify(v5)}).readOnly`), true, "the future still locks");
    assert.ok(val(`ROLLNOTES_TYPES.has("pickup") && ROLLNOTES_FIELDS.has("pickup")`));
    assert.ok(val(`isSongLevelAnno({pickup: 1}) && isUndrawnAnno({pickup: 1}) && isDirective({text: "pickup: 1", pickup: 1})`));
  } finally { teardown(); }
});

test("readers accept bar 0 (review C1): a [0,4] chord with until [0,4.5] parses and writes back exactly", () => {
  installSong();
  try {
    const one = '{"format":"night-roll-annotations","version":4,"notes":[{"at":[0,4],"to":[0,4],"until":[0,4.5],"type":"chord","chord":"G"}]}';
    assert.deepEqual(val(`parseRollnotesJSON(${JSON.stringify(one)}).map(n => [n.b1, n.q1, n.b2, n.q2, n.until])`), [[0, 4, 0, 4, [0, 4.5]]]);
    assert.equal(run(`JSON.stringify(noteToJSON(parseRollnotesJSON(${JSON.stringify(one)})[0]))`), '{"at":[0,4],"to":[0,4],"until":[0,4.5],"type":"chord","chord":"G"}');
    assert.equal(val(`hasEnd({b2: 0})`), true, "an end in bar 0 is an end");
    assert.equal(val(`hasEnd({b2: null})`), false);
  } finally { teardown(); }
});

test("frame math: tick(0,4) = 0, tick(1,1) = T, bar(T−1) = 0, bar(T) = 1; a whole-bar pickup puts bar 0 beat 1 at tick 0", () => {
  installSong();
  try {
    run(`S.declaredPickup = 1;`);
    assert.equal(val(`pickupTicks()`), 480);
    assert.equal(val(`barStartTick(1)`), 480);
    assert.equal(val(`barStartTick(0)`), 480 - 1920);
    assert.deepEqual(val(`barBeatAt(0)`), [0, 4]);
    assert.deepEqual(val(`barBeatAt(480)`), [1, 1]);
    assert.equal(val(`barAtTick(479)`), 0);
    assert.equal(val(`barAtTick(480)`), 1);
    assert.deepEqual(val(`frameBQ(240, 480, 1920, 480)`), [0, 4.5], "half a beat into the pickup beat");
    assert.deepEqual(val(`frameBQ(1920 * 3 + 480 + 480, 480, 1920, 480)`), [4, 2]);
    run(`S.declaredPickup = 4;`);
    assert.deepEqual(val(`barBeatAt(0)`), [0, 1], "a whole-bar pickup: bar 0 beat for beat the old bar 1");
    assert.deepEqual(val(`barBeatAt(1920)`), [1, 1]);
    run(`S.declaredPickup = null;`);
    assert.deepEqual(val(`barBeatAt(0)`), [1, 1], "no pickup: today's formulas");
    assert.equal(val(`barStartTick(3)`), 3840);
  } finally { teardown(); }
});

test("shared fixture: reads to the same ticks as native, writes back byte for byte, LCD and All notes read bar 0, the loop returns to the pickup", () => {
  installSong();
  try {
    run(`S.rollnotes = parseRollnotesJSON(${JSON.stringify(FIXTURE)}).map(resolveNote); finalizeNotes();`);
    assert.equal(val(`S.declaredPickup`), 1);
    assert.equal(val(`pickupTicks()`), 480);
    // [text, start, end] — the web's start order (finalizeNotes sorts); native keeps file order and asserts the same ticks per entry
    // plain entries (not section/chord) end where the next plain entry starts (finalizeNotes' rule), so the pickup's own `end` is the text note's start
    assert.deepEqual(val(`S.rollnotes.map(n => [n.text, n.start, n.end])`), [
      ["G", 0, 240],                                  // [0,4] until [0,4.5]: the half-beat chord inside the pickup
      ["E7", 0, 480],                                 // [0,4] to [0,4]: the pickup beat, inclusive end
      ["pickup: 1", 480, 3120],                       // anchored at [1,1] like the song-level entries
      ["A", 480, 480 + 7 * 1920 + 4 * 480],           // bar 1 beat 1 through bar 8 beat 4
      ["the bass enters", 480 + 1920 + 1.5 * 480, 480 + 2 * 1920],
      ["future-thing: kept whole", 480 + 2 * 1920, 480 + 8 * 1920], // the opaque entry at [3,1]
      ["loop: 0.4", 480 + 8 * 1920, 480 + 9 * 1920]],
      "every anchor's tick in the pickup frame");
    assert.equal(val(`S.rollnotes.find(n => n.loopTo !== undefined).loopTo`), 0, "`loop: 0.4` returns to tick 0 — the pickup note (C8)");
    // the writer reproduces the file's bytes from the parsed list (file order)
    assert.equal(run(`serializeNotesList(parseRollnotesJSON(${JSON.stringify(FIXTURE)}), 4, "pickup")`), FIXTURE, "parse → serialize is byte-identical (native RollnotesWriter writes the same)");
    // readouts: the LCD at tick 0 and the All-notes row of a bar-0 chord
    assert.deepEqual(val(`(p => [p.bar, p.beat, p.syl, p.pct])(posParts(0))`), [0, 4, "", 0], "LCD at tick 0: bar 0 beat 4");
    assert.equal(run(`posText(480)`), "bar 1 beat 1");
    assert.equal(run(`posText(240)`), "bar 0 beat 4&");
    assert.equal(run(`posAnchorText(S.rollnotes.find(n => n.text === "G"))`), "bar 0 beat 4 until bar 0 beat 4&", "All notes never clamps bar 0 to 1 (C5)");
    assert.equal(run(`posAnchorText(S.rollnotes.find(n => n.text === "E7"))`), "bar 0 beat 4–0 beat 4");
    assert.equal(val(`S.songEndTick`), 480 + 4 * 1920, "16 quarter notes from tick 0 with a one-beat pickup end in bar 4: the song ends on a bar line of the frame");
    assert.equal(val(`fullBarsCount()`), 4, "four full bars and a pickup");
  } finally { teardown(); }
});

test("setEndUnits inside bar 0 writes until [0, q] (C5); setAnchorBQ places a tick before T in bar 0", () => {
  installSong();
  try {
    run(`S.declaredPickup = 1;`);
    const n = val(`(() => { const n = {chord: true}; setEndUnits(n, 240, 1920, 480, 480); return n; })()`);
    assert.deepEqual([n.b2, n.q2, n.until], [0, 4, [0, 4.5]]);
    const m = val(`(() => { const n = {chord: true}; setEndBQ(n, 480); return n; })()`);
    assert.deepEqual([m.b2, m.q2, m.until ?? null], [0, 4, null], "an end exactly at T: through bar 0 beat 4, no until");
    const a = val(`(() => { const n = {}; setAnchorBQ(n, 0); return n; })()`);
    assert.deepEqual([a.b1, a.q1], [0, 4]);
    const b = val(`(() => { const n = {}; setAnchorBQ(n, 480 + 1920 + 720); return n; })()`);
    assert.deepEqual([b.b1, b.q1], [2, 2.5]);
  } finally { teardown(); }
});

test("reframeAnchors: setting a pickup re-expresses every anchor so its tick is unchanged, bar 0 appears, the loop text is rewritten, opaque entries move; removing converts back exactly", () => {
  installSong();
  try {
    loadList([
      {b1: 1, q1: 1, b2: 1, q2: 4, text: "chord: G"},                       // 0 … 1920
      {b1: 1, q1: 2, b2: 1, q2: 2, until: [1, 2.5], text: "chord: Am"},      // 480 … 720
      {b1: 2, q1: 1, b2: 5, q2: 4, text: "section: A"},
      {b1: 3, q1: 2.5, b2: null, q2: null, text: "the bass enters"},
      {b1: 9, q1: 1, b2: null, q2: null, text: "loop: 2.1"},
      {b1: 1, q1: 1, b2: null, q2: null, text: "analysis: form.sections done=1", study: {item: "form.sections", done: true}},
      {b1: 4, q1: 1, b2: null, q2: null, text: "future-thing: x", opaque: {at: [4, 1], type: "future-thing", "future-thing": "x"}},
    ]);
    const before = anchors();
    const ticks = rows => rows.filter(r => !/^analysis:/.test(r[0])).map(r => [r[0].replace(/^loop: .*/, "loop"), r[6], r[3] === null ? null : r[7]]); // the loop text is rewritten by design // [text, start, end-if-ranged]; the song-level entry has no place in the music
    run(`reframeAnchors(S.rollnotes, 0, 480, barTicks(), beatTicks()); S.declaredPickup = 1; S.rollnotes.forEach(resolveNote);`);
    const after = anchors();
    assert.deepEqual(ticks(after), ticks(before), "no entry moved by a tick");
    assert.deepEqual(after.find(r => r[0] === "G").slice(1, 6), [0, 4, 1, 3, null], "[1,1]–[1,4] becomes [0,4]–[1,3]");
    assert.deepEqual(after.find(r => r[0] === "Am").slice(1, 6), [1, 1, 1, 1, [1, 1.5]], "the exact end slides with it");
    assert.deepEqual(after.find(r => r[0] === "A").slice(1, 5), [1, 4, 5, 3]);
    assert.deepEqual(after.find(r => r[0] === "the bass enters").slice(1, 3), [3, 1.5]);
    assert.deepEqual(after.find(r => r[0] === "future-thing: x").slice(1, 3), [3, 4], "an opaque entry is a thing at a place: it moves (C10)");
    assert.deepEqual(after.find(r => r[0] === "analysis: form.sections done=1").slice(1, 3), [1, 1], "song-level entries stay at 1.1");
    assert.equal(run(`noteToJSON(S.rollnotes.find(n => n.opaque)).at.join()`), "3,4", "the opaque entry is written back at its new anchor");
    run(`reframeAnchors(S.rollnotes, 480, 0, barTicks(), beatTicks()); S.declaredPickup = null; S.rollnotes.forEach(resolveNote);`);
    assert.deepEqual(anchors().map(r => r.slice(0, 7)), before.map(r => r.slice(0, 7)), "round trip is exact");
  } finally { teardown(); }
});

test("applyPickup: replaces the one entry, refuses more than a bar in plain words, snaps to the 16th grid, counts the others for the warning", () => {
  installSong();
  try {
    loadList([{b1: 1, q1: 1, b2: 1, q2: 4, text: "chord: G"}, {b1: 2, q1: 1, b2: null, q2: null, text: "loop: 1.1"}, {b1: 1, q1: 1, text: "songnote: Sway", songnote: {title: "Sway"}}]);
    assert.equal(val(`pickupOthersCount()`), 2, "N excludes the song-level entries (C11)");
    assert.throws(() => run(`applyPickup(5)`), /a pickup is less than a bar — for a longer intro, label it a section/);
    assert.throws(() => run(`applyPickup(-1)`), /a length in beats/);
    assert.deepEqual(anchors().map(r => r.slice(0, 3)), [["G", 1, 1], ["songnote: Sway", 1, 1], ["loop: 1.1", 2, 1]], "a refusal changed nothing");
    run(`applyPickup(1.1, "heard it on the bass");`);
    assert.equal(val(`S.declaredPickup`), 1, "snapped to the 16th grid");
    assert.deepEqual(val(`S.rollnotes.filter(n => n.pickup !== undefined).map(n => [n.text, n.cnote, n.added, n.b1, n.q1])`), [["pickup: 1", "heard it on the bass", true, 1, 1]]);
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.b2, n.q2, n.start])`), [[0, 4, 1, 3, 0]]);
    assert.equal(val(`S.rollnotes.find(n => /^loop:/.test(n.text)).text`), "loop: 0.4");
    run(`applyPickup(4);`); // a whole-bar pickup: every number drops by one, bar for bar
    assert.equal(val(`S.rollnotes.filter(n => n.pickup !== undefined).length`), 1, "one per song");
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.b2, n.q2, n.start])`), [[0, 1, 0, 4, 0]]);
    assert.equal(val(`S.rollnotes.find(n => /^loop:/.test(n.text)).text`), "loop: 0.1");
    run(`applyPickup(0);`);
    assert.equal(val(`S.declaredPickup`), null);
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.b2, n.q2])`), [[1, 1, 1, 4]], "removing converts back");
    assert.equal(val(`S.rollnotes.find(n => /^loop:/.test(n.text)).text`), "loop: 1.1");
  } finally { teardown(); }
});

test("a meter change keeps T in ticks: the pickup value is rewritten; a pickup longer than the new bar refuses the re-bar", () => {
  installSong();
  try {
    loadList([{b1: 1, q1: 1, text: "pickup: 2"}, {b1: 1, q1: 1, b2: 2, q2: 4, text: "chord: G"}]); // T = 960; the G from T through bar 2 beat 4 = ticks 960 … 4800
    assert.equal(val(`pickupTicks()`), 960);
    assert.equal(val(`meterFitsPickup([6, 8])`), null);
    assert.match(val(`meterFitsPickup([3, 8])`), /longer than a 3\/8 bar/, "960 ticks = four eighths, more than a 3/8 bar");
    run(`convertAnchors([4, 4], [6, 8]); S.rollnotes = S.rollnotes.filter(n => !n.tsdir); S.rollnotes.push(resolveNote({b1: 1, q1: 1, text: "timesig: 6/8", tsdir: [6, 8], added: true})); finalizeNotes();`);
    assert.equal(val(`S.declaredPickup`), 4, "two quarters = four eighths");
    assert.equal(val(`pickupTicks()`), 960, "the downbeat did not move because he renamed the meter");
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.b2, n.q2, n.start, n.end])`), [[1, 1, 3, 4, 960, 4800]], "the band's ticks are unchanged: 1.1 through 3.4 in 6/8");
    assert.deepEqual(val(`songStartAnchor()`), {b1: 0, q1: 3}, "\"the song start\" is tick 0 = [0, beats − P + 1] (C3)");
  } finally { teardown(); }
});

test("a start chop keeps the bar-1 line on the same music (C4): the pickup shrinks with the shift, and is removed when the chop eats it", () => {
  installSong();
  try {
    run(`S.song.rawNotes = S.song.tracks.map(tr => tr.notes.map(n => ({...n})));`);
    loadList([{b1: 1, q1: 1, text: "pickup: 2"}, {b1: 2, q1: 1, b2: 2, q2: 4, text: "chord: G"}]); // T = 960; G at bar 2 = tick 960 + 1920
    assert.equal(val(`S.rollnotes.find(n => n.text === "G").start`), 2880);
    assert.equal(val(`pickupAfterShift(-480)`), 1, "chopping one beat off the start leaves a one-beat pickup");
    assert.equal(val(`pickupAfterShift(-960)`), 0, "chopping exactly the pickup removes it");
    assert.equal(val(`pickupAfterShift(-1200)`), 0);
    run(`shiftAnchors(-480);`);
    assert.equal(val(`S.declaredPickup`), 1);
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.b2, n.q2])`), [[2, 1, 2, 4]], "bar 2 is still the same music: the downbeat moved with every anchor");
    assert.equal(val(`S.rollnotes.find(n => n.pickup !== undefined).text`), "pickup: 1");
    run(`shiftAnchors(-480);`);
    assert.equal(val(`S.declaredPickup`), null, "the chop ate the pickup: removed, bar 1 at the new start");
    assert.equal(val(`S.rollnotes.filter(n => n.pickup !== undefined).length`), 0);
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.b2, n.q2])`), [[2, 1, 2, 4]]);
    run(`shiftAnchors(960);`); // removing the chop restores the hidden beats: no pickup comes back (a length he set is gone, not re-derived)
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.b2, n.q2])`), [[2, 3, 3, 2]]);
  } finally { teardown(); }
});

test("merge (C2): a pickup set locally on synced notes survives a reload from the OLD published file WITHOUT publishing — no twin stands beside its old-frame self; publish, reload → identical again", () => {
  installSong();
  try {
    const published = '{ "format": "night-roll-annotations", "version": 2, "song": "pickup-scratch", "notes": [\n' +
      '  {"at":[1,1],"to":[1,4],"type":"chord","chord":"G"},\n  {"at":[2,1],"to":[3,4],"type":"section","label":"A"},\n  {"at":[9,1],"type":"loop","loop":"2.1"},\n  {"at":[1,1],"type":"songnote","title":"Sway","note":"long-short-long"}\n] }\n';
    // the published list lands (synced, no `added`), then he sets a one-beat pickup
    run(`S.rollnotes = parseRollnotesJSON(${JSON.stringify(published)}).map(resolveNote); finalizeNotes(); applyPickup(1); finalizeNotes(); saveLocalNotes();`);
    const inMemory = val(`S.rollnotes.map(n => [n.text, n.b1, n.q1, n.b2, n.q2, n.start, n.end])`);
    assert.deepEqual(inMemory.filter(r => r[0] === "G" || r[0] === "A"), [["G", 0, 4, 1, 3, 0, 1920], ["A", 1, 4, 3, 3, 1920, 3 * 1920]]);
    assert.deepEqual(val(`JSON.parse(localStorage.getItem(notesStoreKey())).map(n => n.text)`), ["pickup: 1"], "the local store holds only the pickup entry — synced notes were reframed in memory");
    // reload: the published file (old frame) + tombstones + the local store, as loadNotes does — the published layer must be reframed before the dedup
    run(`const parsed = parseRollnotesJSON(${JSON.stringify(published)}); const fp = declaredPickupOf(parsed) || 0; S.rollnotes = parsed.map(resolveNote); S.rollnotes = subtractTombstones(S.rollnotes, S.songKey); S.rollnotes = mergeLocalAdditions(S.rollnotes, S.songKey, fp); S.rollnotes.forEach(resolveNote); finalizeNotes();`);
    const reloaded = val(`S.rollnotes.map(n => [n.text, n.b1, n.q1, n.b2, n.q2, n.start, n.end])`);
    assert.deepEqual(reloaded, inMemory, "the in-memory list equals the pre-reload list to the tick");
    assert.equal(val(`S.rollnotes.filter(n => n.text === "G").length`), 1, "no duplicates");
    assert.equal(val(`S.rollnotes.filter(n => n.pickup !== undefined).length`), 1);
    // publish (serialize), reload from the new file + the same local store → identical
    const written = run(`serializeRollnotes()`);
    assert.match(written, /"version": 4/);
    run(`const parsed = parseRollnotesJSON(${JSON.stringify(written)}); const fp = declaredPickupOf(parsed) || 0; S.rollnotes = parsed.map(resolveNote); S.rollnotes = subtractTombstones(S.rollnotes, S.songKey); S.rollnotes = mergeLocalAdditions(S.rollnotes, S.songKey, fp); S.rollnotes.forEach(resolveNote); finalizeNotes();`);
    assert.deepEqual(val(`S.rollnotes.map(n => [n.text, n.b1, n.q1, n.b2, n.q2, n.start, n.end])`), inMemory, "published, reloaded: identical");
    assert.equal(val(`S.rollnotes.filter(n => n.pickup !== undefined).length`), 1);
    // the mirror: a SYNCED pickup deleted locally (tombstone) — the reload must convert the published layer back
    run(`S.rollnotes.forEach(n => { n.added = false; }); localStorage.removeItem(notesStoreKey()); applyPickup(0); finalizeNotes(); saveLocalNotes();`);
    const removed = val(`S.rollnotes.map(n => [n.text, n.b1, n.q1, n.b2, n.q2, n.start])`);
    assert.deepEqual(removed.filter(r => r[0] === "G"), [["G", 1, 1, 1, 4, 0]]);
    run(`const parsed = parseRollnotesJSON(${JSON.stringify(written)}); const fp = declaredPickupOf(parsed) || 0; S.rollnotes = parsed.map(resolveNote); S.rollnotes = subtractTombstones(S.rollnotes, S.songKey); S.rollnotes = mergeLocalAdditions(S.rollnotes, S.songKey, fp); S.rollnotes.forEach(resolveNote); finalizeNotes();`);
    assert.deepEqual(val(`S.rollnotes.map(n => [n.text, n.b1, n.q1, n.b2, n.q2, n.start])`), removed, "a deleted pickup: the file's frame is read before the tombstone drops its entry, and the anchors come back converted");
  } finally { teardown(); }
});

test("old-build simulation: a version-4 file with ROLLNOTES_MAX_VERSION forced to 3 opens read-only and every write path refuses", () => {
  installSong();
  try {
    const lockMsg = val(`ROLLNOTES_LOCK_MSG`);
    const v4 = FIXTURE.replace('"version": 4', '"version": 5'); // the same lock a 3-reader would raise on 4
    run(`S.rollnotes = parseRollnotesJSON(${JSON.stringify(v4)}).map(resolveNote); S.rollnotesReadOnly = true; S.rollnotesLockReason = ROLLNOTES_LOCK_MSG;`);
    assert.equal(val(`parseRollnotesJSON(${JSON.stringify(v4)}).readOnly`), true);
    assert.throws(() => run(`applyPickup(1)`), new RegExp(lockMsg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.throws(() => run(`askAddAnnotation({kind: "pickup", text: "1"})`), /newer Night Roll/);
    assert.throws(() => run(`putSongNote(null, {title: "x", text: "y"})`), /newer Night Roll/);
  } finally { run(`S.rollnotesReadOnly = false; S.rollnotesLockReason = null;`); teardown(); }
});

test("the note editor: + Note → Pickup prefills the length from the cursor, a cursor at tick 0 refuses and writes nothing, the first Save warns, the second re-expresses every anchor — one undo step restores the JSON byte for byte; Delete converts back", () => {
  installSong();
  try {
    loadList([{b1: 1, q1: 1, b2: 1, q2: 4, text: "chord: G"}, {b1: 2, q1: 1, b2: 5, q2: 4, text: "section: A"}, {b1: 9, q1: 1, text: "loop: 2.1"}]);
    const before = run(`serializeRollnotes()`);
    // Learning mode (review R9): the only input is the cursor he placed; at tick 0 nothing is guessed
    run(`S.playCursor = 0; editorFill(null, "pickup");`);
    assert.equal(val(`document.getElementById("npickup").value`), "0");
    assert.match(val(`document.getElementById("npickupat").textContent`), /put the cursor on the first full bar's downbeat/);
    run(`document.getElementById("nsave").click();`);
    assert.match(val(`document.getElementById("nstatus").textContent`), /put the cursor on the first full bar's downbeat/);
    assert.equal(val(`S.declaredPickup`), null, "nothing written");
    assert.equal(run(`serializeRollnotes()`), before);
    // the cursor on the first full bar's downbeat, one beat in
    run(`S.playCursor = 480; editorFill(null, "pickup");`);
    assert.equal(val(`document.getElementById("npickup").value`), "1");
    assert.equal(val(`document.getElementById("npickupat").textContent`), "bar 1 starts at bar 1 beat 2", "the live line reads in the CURRENT frame");
    assert.equal(val(`document.getElementById("nfromrow").style.display`), "none", "no bar row: the pickup is the frame");
    run(`document.getElementById("nsave").click();`);
    assert.match(val(`document.getElementById("nstatus").textContent`), /⚠ Bar 1 starts here\? Bars renumber and 3 annotation\(s\) are re-expressed/, "first Save: the warning, nothing changed");
    assert.equal(val(`S.declaredPickup`), null);
    assert.equal(val(`S.rollnotes.length`), 3);
    run(`document.getElementById("nsave").click();`);
    assert.equal(val(`S.declaredPickup`), 1, "second Save applies");
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.b2, n.q2, n.start, n.end])`), [[0, 4, 1, 3, 0, 1920]], "the G stays on its music, now written from bar 0");
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "A").map(n => [n.b1, n.q1, n.b2, n.q2, n.start])`), [[1, 4, 5, 3, 1920]]);
    assert.equal(val(`S.rollnotes.find(n => n.loopTo !== undefined).text`), "loop: 1.4");
    assert.deepEqual(val(`S.rollnotes.filter(n => n.pickup !== undefined).map(n => [n.text, n.added])`), [["pickup: 1", true]]);
    assert.equal(val(`S.editUndo.length`), 1, "one undo step");
    assert.equal(val(`S.editUndo[0].kind`), "anno");
    assert.match(val(`S.editUndo[0].what`), /pickup: 1 \(saved\)/);
    assert.match(run(`serializeRollnotes()`), /"version": 4/);
    run(`editUndoPop();`);
    assert.equal(run(`serializeRollnotes()`), before, "undo restores the JSON byte for byte");
    assert.equal(val(`S.declaredPickup`), null);
    run(`editRedoPop();`);
    assert.equal(val(`S.declaredPickup`), 1);
    // Delete through the editor: two taps, then everything converts back
    run(`editorFill(S.rollnotes.find(n => n.pickup !== undefined));`);
    assert.equal(val(`document.getElementById("npickup").value`), "1");
    run(`document.getElementById("ndelete").click();`);
    assert.match(val(`document.getElementById("nstatus").textContent`), /⚠ Removing the pickup renumbers from the first note again; 3 annotation\(s\)/);
    assert.equal(val(`S.declaredPickup`), 1);
    run(`document.getElementById("ndelete").click();`);
    assert.equal(val(`S.declaredPickup`), null);
    assert.equal(run(`serializeRollnotes()`), before, "round trip: the file is what it was");
    assert.equal(val(`S.editUndo.length`), 2);
  } finally { teardown(); }
});

test("the editor offers bar 0 while a pickup exists, a changed meter sits at the song start (C3) and refuses when the pickup would not fit, and the chop warning names the pickup's fate (C4)", () => {
  installSong();
  try {
    loadList([{b1: 1, q1: 1, text: "pickup: 1"}, {b1: 1, q1: 1, b2: 1, q2: 4, text: "chord: G"}]);
    run(`fillBarBeatSelects();`);
    assert.equal(val(`document.getElementById("nb1").options[0].value`), "0", "bar 0 first in the bar select");
    assert.equal(val(`document.getElementById("nlb").options[0].value`), "0", "a loop may return to bar 0 (C8)");
    // a meter declared with a pickup present: the directive sits at tick 0 = [0, 4], so bakeMeter writes one event at tick 0
    run(`editorFill(null, "timesig"); document.getElementById("ntsnum").value = "3"; document.getElementById("ntsden").value = "4"; document.getElementById("nsave").click(); document.getElementById("nsave").click();`);
    assert.deepEqual(val(`S.rollnotes.filter(n => n.tsdir).map(n => [n.b1, n.q1, n.start])`), [[0, 3, 0]], "3/4 with a one-beat pickup: the song start is bar 0 beat 3");
    assert.deepEqual(val(`bakeMeter([{tick: 0, num: 4, den: 4}], S.rollnotes).map(e => [e.tick, e.num, e.den])`), [[0, 3, 4]], "one meter event at tick 0 — the published .mid is unchanged by the pickup (Q4)");
    assert.equal(val(`S.declaredPickup`), 1, "the length in quarters is the same in 3/4");
    assert.equal(val(`pickupTicks()`), 480);
    // a bar the pickup does not fit: refused in one line, nothing moves
    const snap = run(`serializeRollnotes()`);
    run(`applyPickup(3); finalizeNotes(); saveLocalNotes();`); // three quarters = a whole 3/4 bar
    run(`editorFill(null, "timesig"); document.getElementById("ntsnum").value = "2"; document.getElementById("ntsden").value = "4"; document.getElementById("nsave").click();`);
    assert.match(val(`document.getElementById("nstatus").textContent`), /the pickup is longer than a 2\/4 bar — remove the pickup first/);
    assert.deepEqual(val(`effTs()`), [3, 4]);
    run(`applyPickup(1); finalizeNotes(); saveLocalNotes();`);
    // the chop's warning: cutting the start past the downbeat removes the pickup
    run(`S.song.rawNotes = S.song.tracks.map(tr => tr.notes.map(n => ({...n}))); editorFill(null, "chop"); document.getElementById("nchopmode").value = "start"; document.getElementById("nb1").value = "1"; setBeatPair("nq1", "ns1", 2); document.getElementById("nsave").click();`);
    assert.match(val(`document.getElementById("nstatus").textContent`), /and the pickup is removed: bar 1 would start before the chop/);
    assert.equal(val(`S.declaredPickup`), 1, "a warning, not yet applied");
    assert.equal(val(`S.rollnotesReadOnly`), false);
    assert.ok(snap.length > 0);
  } finally { run(`S.song.rawNotes = null; S.appliedChop = null; S.chopS = 0;`); teardown(); }
});

test("Ask: add_annotation kind pickup by bar+beat and by length, the refusals, go_to bar 0, insert_bars at 0 refused, edit/delete through the kind; context rows start at bar 0 and the rule blocks forbid suggesting one", () => {
  installSong();
  try {
    loadList([{b1: 2, q1: 1, b2: 2, q2: 4, text: "chord: G"}]);
    const r = val(`askAddAnnotation({kind: "pickup", bar: 2, beat: 1})`); // "bar 1 starts at bar 2 beat 1" → a whole-bar pickup
    assert.equal(val(`S.declaredPickup`), 4);
    assert.match(r.note, /bar 1 now starts 4 beats in.*1 annotation re-expressed/);
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.b2, n.q2, n.start])`), [[1, 1, 1, 4, 1920]], "the chord is now bar 1, on the same music");
    assert.equal(val(`S.editUndo.length`), 1, "one undo step");
    run(`askAddAnnotation({kind: "pickup", text: "1"});`);
    assert.equal(val(`S.declaredPickup`), 1);
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.start])`), [[1, 4, 1920]]);
    assert.throws(() => run(`askAddAnnotation({kind: "pickup", text: "5"})`), /a pickup is less than a bar — for a longer intro, label it a section/);
    assert.throws(() => run(`askAddAnnotation({kind: "pickup", bar: 0, beat: 4})`), /cannot start at the song's very start/);
    assert.equal(val(`askActBarBeat({bar: 0, beat: 4}, "bar", "beat", 20).tick`), 0, "go_to bar 0 lands on tick 0");
    assert.equal(val(`askActBarBeat({bar: 0}, "bar", "beat", 20).tick`), 0, "bar 0 beat 1 lies before the song: its start");
    assert.equal(val(`askActBarBeat({bar: 1}, "bar", "beat", 20).tick`), 480);
    assert.equal(val(`askActPosText(0)`), "0.4");
    assert.equal(val(`askActPosText(480)`), "1.1");
    assert.throws(() => run(`askBarsValidate({at_bar: 0})`), /at_bar must be between 1 and/, "bar 0 is partial — never an insert target (Q6)");
    assert.equal(val(`askBarsCount()`), 4, "full bars after the pickup");
    // context: the song line, the pickup line, rows from bar 0, the legend sentence, both rule blocks
    const ctxText = run(`askContext(askSpan(), {anno: 2000, span: 4000})`);
    assert.match(ctxText, /4 bars and a pickup/);
    assert.match(ctxText, /pickup: 1 beat — bar 0 is the pickup, bar 1 the first full bar/);
    assert.match(run(`askSpanNotes(0, S.songEndTick)`), /\nbar 0: 4 C4 0\.83/, "the pickup note reads bar 0 beat 4");
    assert.match(run(`askSpanNotesCompact(0, S.songEndTick)`), /\n0\|4C4\/0\.83(\n|$)/);
    assert.match(run(`askLegendText()`), /bar 0, when present, is the pickup/);
    assert.match(val(`RULE_LEARNING`), /never suggest that a song has a pickup or where its bar 1 should be/);
    assert.match(val(`RULE_NORMAL`), /never suggest that a song has a pickup or where its bar 1 should be/);
    assert.deepEqual(val(`(sp => [sp.from, sp.to])(askSpan())`), [0, 4], "the span floors to the frame's bar lines and starts at bar 0");
    // the annotations list names it, edit changes the length, delete removes it
    assert.match(run(`askAnnotationsTextCompact()`), /pickup: 1/);
    const id = val(`dedupedNotesWithIndex(S.rollnotes).find(({n}) => n.pickup !== undefined).i`);
    run(`askEditAnnotation({id: ${id}, text: "2"});`);
    assert.equal(val(`S.declaredPickup`), 2);
    const id2 = val(`dedupedNotesWithIndex(S.rollnotes).find(({n}) => n.pickup !== undefined).i`);
    const d = val(`askDeleteAnnotation({id: ${id2}})`);
    assert.match(d.note, /bars count from the first note again/);
    assert.equal(val(`S.declaredPickup`), null);
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.start])`), [[2, 1, 1920]], "back where he wrote it");
  } finally { teardown(); }
});

test("the ruler labels the pickup span 0, puts bar 1's line at T and keeps the beat ticks' phase; the Go to bar sheet counts \"of N (+ pickup)\" and its button sets and removes the pickup from the cursor with the two-tap", () => {
  installSong();
  try {
    loadList([{b1: 1, q1: 1, text: "pickup: 1"}]);
    run(`S.view.x = 0; globalThis.__cv = []; ctx.fillText = (...a) => globalThis.__cv.push(a); draw(); drawRuler(800, 100);`);
    const labels = val(`globalThis.__cv.filter(a => /^[0-9]+$/.test(String(a[0])) && a[2] === 15).map(a => [a[0], Math.round((a[1] - S.RULER_W - 4 + S.view.x) / pxPerTick())])`); // the ruler's bar numbers: [label, tick]
    assert.ok(labels.length, "the ruler drew numbers: " + run(`JSON.stringify(globalThis.__cv.slice(0, 6))`));
    assert.deepEqual(labels.slice(0, 3), [["1", 480], ["2", 480 + 1920], ["3", 480 + 2 * 1920]], "bar lines at T + k·bt");
    assert.ok(labels.some(l => l[0] === "0" && l[1] === 0), "the pickup bar's 0 at the song's start");
    run(`delete ctx.fillText; delete globalThis.__cv;`);
    run(`S.playCursor = 0; openBarJump();`);
    assert.equal(val(`document.getElementById("bjbar").value`), "0");
    assert.equal(val(`document.getElementById("bjbar").min`), "0");
    assert.equal(val(`document.getElementById("bjof").textContent`), "of 4 (+ pickup)");
    assert.equal(val(`document.getElementById("bjpickup").textContent`), "Remove pickup");
    run(`document.getElementById("bjbar").value = "0"; barJumpGo();`);
    assert.equal(val(`S.playCursor`), 0, "Go to bar 0 lands on the pickup's first tick");
    run(`document.getElementById("bjbar").value = "2"; barJumpGo();`);
    assert.equal(val(`S.playCursor`), 480 + 1920);
    // remove through the sheet: no other annotations → no two-tap needed; then set again from the cursor with the two-tap
    run(`openBarJump(); barJumpPickup();`);
    assert.equal(val(`S.declaredPickup`), null);
    assert.equal(val(`S.editUndo.length`), 1);
    run(`S.rollnotes.push(resolveNote({b1: 1, q1: 1, b2: 1, q2: 4, text: "G", chord: true, added: true})); finalizeNotes(); S.playCursor = 960; openBarJump();`);
    assert.equal(val(`document.getElementById("bjpickup").textContent`), "Bar 1 starts at the cursor");
    assert.equal(val(`barJumpPickup()`), false, "first tap: the warning");
    assert.match(val(`document.getElementById("bjstatus").textContent`), /⚠ Bar 1 starts here\? Bars renumber and 1 annotation\(s\)/);
    assert.equal(val(`barJumpPickup()`), true);
    assert.equal(val(`S.declaredPickup`), 2);
    assert.deepEqual(val(`S.rollnotes.filter(n => n.text === "G").map(n => [n.b1, n.q1, n.start])`), [[0, 3, 0]]);
    run(`S.playCursor = 0; openBarJump(); applyPickup(0); finalizeNotes(); openBarJump();`);
    assert.equal(val(`barJumpPickup()`), false);
    assert.match(val(`document.getElementById("bjstatus").textContent`), /put the cursor on the first full bar's downbeat first/, "a cursor at tick 0 never guesses (Learning)");
  } finally { run(`document.getElementById("barjumpsheet").classList.remove("on");`); teardown(); }
});

test("score, MusicXML and tab: measure 0 spans [0, T) and is engraved short; <measure number=\"0\" implicit=\"yes\"> with its durations summing to T; the tab's first measure is narrower and numbered 0", () => {
  installSong();
  try {
    loadList([{b1: 1, q1: 1, text: "pickup: 1"}]);
    const m = val(`(m => ({n: m.nMeasures, T: m.T, s: [m.mStart(0), m.mStart(1), m.mStart(2)], l: [m.mLen(0), m.mLen(1)], i: [m.mIndex(0), m.mIndex(479), m.mIndex(480), m.mIndex(480 + 1920)]}))(buildScoreModelFor(null))`);
    assert.deepEqual(m, {n: 5, T: 480, s: [0, 480, 480 + 1920], l: [480, 1920], i: [0, 0, 1, 2]});
    const ms0 = val(`buildScoreModelFor(null).staves[0].measures[0].map(e => [e.start, e.rest])`), m1 = val(`buildScoreModelFor(null).staves[0].measures[1].map(e => e.start)`);
    assert.ok(ms0.length >= 1 && ms0.every(e => e[0] < 480) && ms0[0][0] === 0 && ms0[0][1] === false, "measure 0 holds the pickup note (and its rest), nothing past T: " + JSON.stringify(ms0));
    assert.equal(m1[0], 480, "measure 1 starts at T");
    run(`buildScoreModel(); S.scoreCache.clear();`);
    const xml = run(`musicXmlDocument({title: "t", ppq: 480, bt: 1920, pickup: 480, ts: [4, 4], declaredTs: null, staves: buildScoreModelFor(null).staves, trackNames: ["pulse1"], tempos: S.song.tempos, keyAt: () => null, spellAt: () => SHARP_SPELL, tab: {tracks: new Set()}})`);
    assert.match(xml, /<measure number="0" implicit="yes">/);
    assert.match(xml, /<measure number="1">/);
    assert.doesNotMatch(xml, /<measure number="5">/, "four full bars after the pickup");
    const m0 = xml.slice(xml.indexOf('<measure number="0"'), xml.indexOf('<measure number="1">'));
    const sum = [...m0.matchAll(/<duration>(\d+)<\/duration>/g)].reduce((a, x) => a + +x[1], 0);
    assert.equal(sum, 480 / 480 * val(`MXL_DIVISIONS`), "measure 0's durations sum to T");
    assert.match(m0, /<time print-object="no"><beats>4<\/beats>/, "the time signature stays in the first measure's attributes");
    const tab = run(`(() => { const st = buildScoreModelFor(null).staves[0]; return asciiTab({title: "t", track: "pulse1", measures: st.measures, bt: 1920, ppq: 480, pickup: 480}); })()`);
    const lines = tab.split("\n");
    const numLine = lines.find(l => /^  0/.test(l));
    assert.ok(numLine, "bar numbers start at 0: " + lines.slice(0, 5).join(" | "));
    const row = lines[lines.indexOf(numLine) + 1];
    assert.equal(row.indexOf("|", 2) - 2, 4, "measure 0 is four 16ths wide (" + row + ")");
  } finally { teardown(); }
});

test("generators and the count-in: the Drummer's first kick lands on T (bar 1's real downbeat), bar 0 is never a target; the count-in is one full bar plus the empty whole beats of bar 0", async () => {
  installSong();
  try {
    run(`S.song.tracks.push({name: "bass", notes: [{t: 480, d: 1920, p: 45, v: 90}, {t: 480 + 1920, d: 1920, p: 43, v: 90}]}); S.trackState.push({muted: false, solo: false}); S.selTrack = 0; S.dupPending = null;`);
    loadList([{b1: 1, q1: 1, text: "pickup: 1"}, {b1: 1, q1: 1, b2: 2, q2: 4, text: "section: A"}]);
    run(`computeSongEnd();`);
    const hits = val(`(() => { const k = drGenerate(555, 3, 1, 2); const di = S.song.tracks.findIndex((_, ti) => trackIsDrums(ti)); return {k, ts: S.song.tracks[di].notes.filter(n => !n.gone).map(n => n.t)}; })()`);
    assert.ok(hits.k > 0, "the Drummer wrote something");
    assert.equal(Math.min(...hits.ts), 480, "the first hit is bar 1's downbeat at T, nothing in the pickup");
    assert.ok(Math.max(...hits.ts) < 480 + 2 * 1920, "bars 1 through 2 only");
  } finally { teardown(); }
  // the count-in: a separate app with timers (the pattern of the main suite's count-in test)
  const app2 = await createApp({intervals: true}); const run2 = c => app2.run(c), val2 = c => JSON.parse(run2(`JSON.stringify(${c})`));
  run2(`S.song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}], tracks: [{name: "t", notes: [{t: 0, d: 480, p: 60, v: 80}]}]}; S.songKey = "midi/test.mid"; S.keyRegions = []; S.previewSf = null; S.playCursor = 0;
        S.trackState = [{muted: false, solo: false}]; S.songEndTick = 32 * 480; met.countIn = true;
        S.rollnotes = deriveNoteTypes([{b1: 1, q1: 1, text: "pickup: 1"}]).map(resolveNote); finalizeNotes(); S.songEndTick = 32 * 480;`);
  const lead = async () => {
    run2(`globalThis.__p = 0; play(0, {}).then(() => __p++);`);
    for (let i = 0; i < 100 && val2(`globalThis.__p`) < 1; i++) { app2.tick(20); await new Promise(r => setImmediate(r)); }
    const got = val2(`playT0 - audio.currentTime`);
    run2(`stop();`);
    return got;
  };
  try {
    const withPickup = await lead();
    assert.ok(Math.abs(withPickup - 3.5) < 0.3, "one bar (4 beats) + the three empty beats of bar 0 at 120 bpm = 3.5 s, not 2 (" + withPickup + ")");
    run2(`S.rollnotes = []; finalizeNotes(); S.songEndTick = 32 * 480;`);
    const plain = await lead();
    assert.ok(Math.abs(plain - 2) < 0.3, "no pickup: one bar of clicks (" + plain + ")");
  } finally { run2(`met.countIn = false;`); }
});
