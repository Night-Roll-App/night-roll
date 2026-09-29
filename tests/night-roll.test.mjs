// Unit tests for Night Roll's pure logic (index.html inline script).
// Run: node --test tests/
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { createApp } from "./harness.mjs";

const app = createApp();
const run = (code) => app.run(code);
// vm results live in another realm (different Array prototype breaks deepEqual);
// JSON round-trip localizes them
const val = (code) => JSON.parse(run(`JSON.stringify(${code})`));

// A minimal 4/4 song so functions that read `song` work. ppq 480; second
// tempo doubles the speed at tick 960 (sec computed the way parseMidi does).
function installSong() {
  run(`
    song = {ppq: 480, timesig: [4, 4],
            tempos: [{tick: 0, usq: 500000, sec: 0}, {tick: 960, usq: 250000, sec: 1}],
            tracks: []};
    songKey = "midi/test.mid";
    keyRegions = [];
    previewSf = null;
    playCursor = 0;
  `);
}

test("script loads: core functions exist", () => {
  for (const fn of ["parseMidi", "parseRollnotes", "serializeRollnotes", "keyNameToSf",
                    "nameChord", "durationPieces", "tickToSec", "secToTick", "sfAt"]) {
    assert.equal(run(`typeof ${fn}`), "function", fn);
  }
});

test("keyNameToSf: majors, minors map to relative major, invalid → null", () => {
  const cases = {C: 0, G: 1, D: 2, F: -1, Bb: -2, "F#": 6, Db: -5,
                 Am: 0, Em: 1, Bbm: -5, Dm: -1};
  for (const [name, sf] of Object.entries(cases)) {
    assert.equal(run(`keyNameToSf(${JSON.stringify(name)})`), sf, name);
  }
  assert.equal(run(`keyNameToSf("H")`), null);
  assert.equal(run(`keyNameToSf("")`), null);
});

test("parseRollnotes: anchors, ranges, sections, key directives, comments dropped", () => {
  const text = [
    "# header comment", "",
    "[3.1]", "hello", "world", "",
    "[7.1 - 8.4]", "range note", "",
    "[1.1 - 4.4]", "section: A — G home", "",
    "[9.1]", "key: Bb", "",
    "[2.5]", "fractional beat", "",
  ].join("\n");
  const notes = val(`parseRollnotes(${JSON.stringify(text)})`);
  assert.equal(notes.length, 5);
  const [a, b, c, d, e] = notes;
  assert.deepEqual([a.b1, a.q1, a.b2, a.text], [3, 1, null, "hello\nworld"]);
  assert.deepEqual([b.b1, b.q1, b.b2, b.q2], [7, 1, 8, 4]);
  assert.equal(c.section, true);
  assert.equal(c.text, "A — G home");
  assert.equal(d.keydir, -2);
  assert.equal(d.text, "key: Bb");
  assert.deepEqual([e.b1, e.q1], [2, 5]);
  assert.ok(!notes.some(n => n.text.includes("comment")));
});

test("rollnotes round-trip: parse → serialize → parse is stable", () => {
  installSong();
  const text = [
    "[1.1 - 4.4]", "section: A", "",
    "[3.1]", "a note", "",
    "[5.1]", "key: G", "",
    "[6.1]", "key: Gm", "",
    "[6.2.5]", "off-beat", "",
  ].join("\n");
  run(`rollnotes = parseRollnotes(${JSON.stringify(text)}).map(resolveNote);`);
  const once = run(`serializeRollnotes()`);
  run(`rollnotes = parseRollnotes(${JSON.stringify(once)}).map(resolveNote);`);
  const twice = run(`serializeRollnotes()`);
  assert.equal(twice, once);
  const doc = JSON.parse(once);
  assert.equal(doc.version, 1);
  const secN = doc.notes.find(x => x.type === "section");
  assert.deepEqual([secN.at, secN.to, secN.label.startsWith("A")], [[1, 1], [4, 4], true]);
  assert.ok(doc.notes.some(x => x.type === "key" && x.key === "G" && x.at[0] === 5));
  assert.ok(doc.notes.some(x => x.type === "key" && x.key === "Gm" && x.at[0] === 6)); // minor tonic survives
  assert.equal(run(`rollnotes.find(n => n.text === "key: Gm").keydir`), -2); // Gm = 2 flats
});

test("chop: start/end directives trim the displayed song and renumber", () => {
  installSong();
  run(`
    song.tracks = [{name: "t", notes: []}];
    song.rawNotes = [[
      {t: 0,    d: 480, p: 60},   // bar 1 (chopped)
      {t: 1920, d: 480, p: 62},   // bar 2 → displayed bar 1
      {t: 1680, d: 480, p: 63},   // straddles the cut: clipped to start
      {t: 5760, d: 480, p: 64},   // bar 4 (chopped by end)
    ]];
    chopS = 0; chopE = null; appliedChop = null;
    declaredTs = null;
    rollnotes = parseRollnotes("[2.1]\\nchop: start\\n\\n[4.1]\\nchop: end\\n\\n[1.1 - 1.4]\\nchord: C\\n").map(resolveNote);
    finalizeNotes();
  `);
  assert.equal(run(`chopS`), 1920);
  assert.equal(run(`chopE`), 5760);
  const notes = val(`song.tracks[0].notes.map(n => ({t: n.t, d: n.d, p: n.p}))`);
  assert.deepEqual(notes, [
    {t: 0, d: 480, p: 62},        // slid left by one bar
    {t: 0, d: 240, p: 63},        // straddler clipped at the cut
  ]);
  assert.equal(run(`songEndTick`), 1920); // one displayed bar survives
  // the chord annotation stays in displayed coords: bar 1 as written
  assert.equal(val(`rollnotes.find(n => n.chord)`).start, 0);
  // round-trip: directives serialize verbatim in raw coords
  const once = run(`serializeRollnotes()`);
  const chops = JSON.parse(once).notes.filter(x => x.type === "chop");
  assert.deepEqual(chops.map(x => [x.at[0], x.chop]), [[2, "start"], [4, "end"]]);
  // shiftAnchors: removing the start chop moves displayed anchors right one bar
  run(`shiftAnchors(1920); rollnotes = rollnotes.filter(n => n.chopdir !== "start"); finalizeNotes();`);
  const c = val(`rollnotes.find(n => n.chord)`);
  assert.deepEqual([c.b1, c.b2], [2, 2]);
  assert.equal(run(`chopS`), 0);
  assert.equal(val(`song.tracks[0].notes.length`), 3); // bar-1 note restored
});

test("6/8: beats are eighths — anchors, defaults, re-bar conversion", () => {
  installSong();
  const text = [
    "[1.1]", "timesig: 6/8", "",
    "[1.1 - 1.3]", "chord: Bb", "",
    "[1.4 - 1.6]", "chord: F7", "",
    "[2.1]", "a note", "",
  ].join("\n");
  run(`declaredTs = null; rollnotes = parseRollnotes(${JSON.stringify(text)}).map(resolveNote); finalizeNotes();`);
  assert.deepEqual(val(`effTs()`), [6, 8]);
  assert.equal(run(`beatTicks()`), 240);           // eighth at ppq 480
  assert.equal(run(`barTicks()`), 1440);           // 6 eighths = 3 quarters
  const bb = val(`rollnotes.find(n => n.text === "Bb")`);
  assert.equal(bb.start, 0);
  assert.equal(bb.end, 720);                       // first half of the bar (3 eighths)
  const f7 = val(`rollnotes.find(n => n.text === "F7")`);
  assert.equal(f7.start, 720);                     // second half starts mid-bar
  assert.equal(f7.end, 1440);
  assert.equal(val(`rollnotes.find(n => n.text === "a note")`).start, 1440); // bar 2 = one 6/8 bar in
  // serialize keeps eighth-counted anchors
  assert.ok(JSON.parse(run(`serializeRollnotes()`)).notes.some(x =>
    x.type === "chord" && x.chord === "F7" && x.at[1] === 4 && x.to[1] === 6));
  // re-bar 6/8 → 4/4 preserves absolute positions: eighth 4 of bar 1 = quarter 2.5
  run(`convertAnchors([6, 8], [4, 4]); declaredTs = null;
       rollnotes = rollnotes.filter(n => !n.tsdir); finalizeNotes();`);
  const f74 = val(`rollnotes.find(n => n.text === "F7")`);
  assert.equal(f74.b1, 1);
  assert.equal(f74.q1, 2.5);
  assert.equal(f74.start, 720); // same tick as before
});

test("chord directives: parse, attached note, round-trip", () => {
  installSong();
  const text = [
    "[1.1 - 4.4]", "section: A", "",
    "[1.1 - 1.2]", "chord: C", "",
    "[1.3 - 1.4]", "chord: G7/B", "no 5th — the bass supplies it", "",
    "[2.1]", "plain note", "",
  ].join("\n");
  run(`rollnotes = parseRollnotes(${JSON.stringify(text)}).map(resolveNote); finalizeNotes();`);
  assert.equal(run(`rollnotes.filter(n => n.chord).length`), 2);
  assert.equal(run(`rollnotes.find(n => n.chord && n.b1 === 1 && n.q1 === 1).text`), "C");
  const g7 = val(`rollnotes.find(n => n.text === "G7/B")`);
  assert.equal(g7.chord, true);
  assert.equal(g7.cnote, "no 5th — the bass supplies it");
  assert.equal(run(`rollnotes.find(n => n.text === "C").cnote`), undefined);
  // lane groups (2026-08-19 redesign): chords stack in their OWN group below
  // the sections group — depth is within-type, lane is the display row
  assert.equal(g7.depth, 0);
  assert.equal(g7.lane, 1); // one section row above, chords start below it
  assert.equal(val(`rollnotes.find(n => n.section).lane`), 0);
  // sections stay sections, chords stay chords
  assert.ok(!g7.section);
  const once = run(`serializeRollnotes()`);
  const cN = JSON.parse(once).notes.find(x => x.chord === "G7/B");
  assert.equal(cN.note, "no 5th — the bass supplies it");
  assert.ok(JSON.parse(once).notes.some(x => x.chord === "C"));
  run(`rollnotes = parseRollnotes(${JSON.stringify(once)}).map(resolveNote); finalizeNotes();`);
  assert.equal(run(`serializeRollnotes()`), once);
});

test("modal keys: tonic + mode names map to the relative major's signature", () => {
  installSong();
  assert.equal(run(`keyNameToSf("D dorian")`), 0);   // D dorian shares C major's signature
  assert.equal(run(`keyNameToSf("F dorian")`), -3);  // F dorian shares Eb major's
  assert.equal(run(`keyNameToSf("Bb lydian")`), -1); // Bb lydian shares F major's
  assert.equal(run(`keyNameToSf("E phrygian")`), 0);
  assert.equal(run(`keyNameToSf("G mixolydian")`), 0);
  assert.equal(run(`keyNameToSf("Gm")`), -2);        // legacy minor suffix still works
  // tonic-first naming (2026-08-07 rework): pc + mode -> spelled name + true signature
  assert.deepEqual(val(`keyNameFor(2, "dorian")`), {name: "D dorian", sf: 0, tonic: "D"});
  assert.deepEqual(val(`keyNameFor(5, "dorian")`), {name: "F dorian", sf: -3, tonic: "F"});
  assert.deepEqual(val(`keyNameFor(7, "minor")`), {name: "Gm", sf: -2, tonic: "G"});
  assert.deepEqual(val(`keyNameFor(7, "major")`), {name: "G", sf: 1, tonic: "G"});
  // enharmonic choice lands on the real signature: G#m (5#) not Abm (7b), Db (5b) not C# (7#)
  assert.deepEqual(val(`keyNameFor(8, "minor")`), {name: "G#m", sf: 5, tonic: "G#"});
  assert.deepEqual(val(`keyNameFor(1, "major")`), {name: "Db", sf: -5, tonic: "Db"});
  assert.deepEqual(val(`keyNameFor(10, "major")`), {name: "Bb", sf: -2, tonic: "Bb"});
  assert.equal(val(`keyNameFor(6, "major")`).name, "F#"); // 6#/6b tie: sharp side wins
  // round-trip through rollnotes: the modal name survives and carries its signature
  run(`rollnotes = parseRollnotes("[1.1]\\nkey: D dorian\\n").map(resolveNote); finalizeNotes();`);
  assert.equal(run(`rollnotes[0].keydir`), 0);
  assert.ok(JSON.parse(run(`serializeRollnotes()`)).notes.some(x => x.key === "D dorian"));
});

test("tickToSec/secToTick: piecewise tempo map, mutual inverses", () => {
  installSong();
  assert.equal(run(`tickToSec(song, 480)`), 0.5);
  assert.equal(run(`tickToSec(song, 960)`), 1);
  assert.equal(run(`tickToSec(song, 1440)`), 1.25); // after the tempo doubles
  for (const tick of [0, 100, 480, 960, 1440, 5000]) {
    assert.ok(Math.abs(run(`secToTick(song, tickToSec(song, ${tick}))`) - tick) < 1e-6, "tick " + tick);
  }
});

test("parseMidi: header, tempo, notes, running status", () => {
  // MThd (fmt 0, 1 track, ppq 480) + one track:
  // tempo 500000; C4 on; D4 on via running status; both off (off also running)
  const bytes = [
    0x4D,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1, 0x01,0xE0,
    0x4D,0x54,0x72,0x6B, 0,0,0,26,
    0x00, 0xFF,0x51,0x03, 0x07,0xA1,0x20,
    0x00, 0x90,0x3C,0x64,
    0x00, 0x3E,0x64,
    0x83,0x60, 0x80,0x3C,0x40,
    0x00, 0x3E,0x40,
    0x00, 0xFF,0x2F,0x00,
  ];
  const s = val(`parseMidi(new Uint8Array([${bytes}]).buffer)`);
  assert.equal(s.ppq, 480);
  assert.equal(s.tempos[0].usq, 500000);
  assert.equal(s.tracks.length, 1);
  const notes = s.tracks[0].notes;
  assert.equal(notes.length, 2);
  assert.deepEqual(notes.map(n => [n.t, n.d, n.p, n.v]), [[0, 480, 60, 100], [0, 480, 62, 100]]);
});

test("durationPieces: whole, dotted, composite splits", () => {
  const P = 480;
  const pieces = (t) => val(`durationPieces(${t}, ${P})`).map(p => p.dur + ".".repeat(p.dots));
  assert.deepEqual(pieces(4 * P), ["w"]);
  assert.deepEqual(pieces(1.5 * P), ["q."]);
  assert.deepEqual(pieces(P), ["q"]);
  assert.deepEqual(pieces(1.25 * P), ["q", "16"]);
  assert.deepEqual(pieces(0.5 * P), ["8"]);
});

test("nameChord: triads, sevenths, inversions, dyads, missing 5th, flat keys", () => {
  installSong();
  const chord = (ps, sf) => run(`nameChord([${ps}], ${sf})`);
  assert.equal(chord([60, 64, 67], 0), "C");
  assert.equal(chord([64, 67, 72], 0), "C/E");
  assert.equal(chord([57, 60, 64, 67], 0), "Am7");
  assert.equal(chord([60, 67], 0), "C5");
  assert.equal(chord([60, 64, 70], 0), "C7 (no 5th)");
  assert.equal(chord([61, 65, 68], -2), "Db"); // spelled per key: Db, not C#
});

test("keySpelling via spellPc: signature notes and chromatic defaults", () => {
  installSong();
  assert.equal(run(`spellPc(6, 1)`), "F#");   // G major's sharp
  assert.equal(run(`spellPc(10, -1)`), "Bb"); // F major's flat
  assert.equal(run(`spellPc(1, 0)`), "C#");   // chromatic: leading-tone-ish → sharp
  assert.equal(run(`spellPc(3, 0)`), "Eb");   // chromatic: borrowed → flat
});

test("sfAt: open keys, ranged keys revert, preview overrides", () => {
  installSong();
  run(`keyRegions = [
    {start: 0, sf: 1, end: null},
    {start: 960, sf: -2, end: 1920},
  ];`);
  assert.equal(run(`sfAt(0)`), 1);
  assert.equal(run(`sfAt(1000)`), -2); // inside the ranged key
  assert.equal(run(`sfAt(2000)`), 1);  // ranged key ended: surrounding key resumes
  run(`previewSf = 3;`);
  assert.equal(run(`sfAt(1000)`), 3);  // dial preview wins
  run(`previewSf = null;`);
});

test("beatLabel: 1e&a counting with fractional fallback", () => {
  const label = (b) => run(`beatLabel(${b})`);
  assert.equal(label(1), "1");
  assert.equal(label(2.25), "2e");
  assert.equal(label(3.5), "3&");
  assert.equal(label(4.75), "4a");
  assert.equal(label(1.33), "1.33");
});

test("loop directive: anchor past target = jump point; else song end; whole song without one", () => {
  installSong();
  run(`rollnotes = parseRollnotes("[25.1]\\nloop: 2.1\\n").map(resolveNote); finalizeNotes();`);
  assert.equal(run(`rollnotes[0].loopTo`), 1920); // bar 2 beat 1 at ppq 480
  run(`songEndTick = 26 * 4 * 480;`);
  const seg = val(`currentLoop()`);
  assert.ok(Math.abs(seg.start - run(`tickToSec(song, 1920)`)) < 1e-9);
  // fires at the [25.1] anchor, not at the song end a bar later
  assert.ok(Math.abs(seg.end - run(`tickToSec(song, 24 * 4 * 480)`)) < 1e-9);
  // anchor at/before the target (auto-written [1.1] files): jump at song end
  run(`rollnotes = parseRollnotes("[1.1]\\nloop: 2.1\\n").map(resolveNote); finalizeNotes();`);
  const seg2 = val(`currentLoop()`);
  assert.ok(Math.abs(seg2.end - run(`tickToSec(song, songEndTick)`)) < 1e-9);
  run(`rollnotes = []; finalizeNotes();`);
  const whole = val(`currentLoop()`);
  assert.equal(whole.start, 0);
  assert.ok(Math.abs(whole.end - run(`tickToSec(song, songEndTick)`)) < 1e-9);
});

test("saveEdits: an added note that was erased is not persisted (regression)", () => {
  installSong();
  run(`
    song.tracks = [{name: "t", notes: [
      {t: 0, d: 480, p: 60, v: 80, added: true, gone: true},
      {t: 480, d: 480, p: 62, v: 80, added: true},
      {t: 960, d: 480, p: 64, v: 80, gone: true},
    ]}];
    saveEdits();
  `);
  const saved = JSON.parse(app.store.get("ff1roll-edits-midi/test.mid"));
  assert.deepEqual(saved.added.map(n => n.p), [62]); // erased added note dropped
  assert.deepEqual(saved.removed, ["0:2"]);          // erased original tracked
});

test("meter: neutral 4/4 until a timesig directive declares one; anchors convert", () => {
  installSong();
  run(`song.timesig = [6, 8];`); // the MIDI's claim
  run(`rollnotes = []; finalizeNotes();`);
  assert.equal(run(`barTicks()`), 4 * 480); // MIDI meter drives nothing: neutral 4/4
  run(`rollnotes = parseRollnotes("[1.1]\\ntimesig: 6/8\\n").map(resolveNote); finalizeNotes();`);
  assert.deepEqual(val(`declaredTs`), [6, 8]);
  assert.equal(run(`barTicks()`), 3 * 480); // declared: 6/8 = 3 quarter-beats per bar
  const once = run(`serializeRollnotes()`);
  assert.ok(JSON.parse(once).notes.some(x => x.timesig === "6/8")); // round-trips like any directive
  // conversion: [2.1] under 6/8 (tick 1440 = 3 quarters) re-expressed in 4/4 = bar 1 beat 4
  run(`rollnotes.push(resolveNote({b1: 2, q1: 1, b2: null, q2: null, text: "hi", added: true})); finalizeNotes();`);
  run(`convertAnchors([6, 8], [4, 4]);`);
  const n = val(`rollnotes.find(x => x.text === "hi")`);
  assert.deepEqual([n.b1, n.q1], [1, 4]);
});

test("instrument panel: degrees vs the recorded tonic, guitar/piano hit maps", () => {
  installSong();
  // degree labels follow the tonic letter of the recorded name (mode-agnostic)
  assert.equal(run(`degreeOf(3, "Bb")`), "4");    // Eb in Bb major
  assert.equal(run(`degreeOf(10, "Gm")`), "♭3");  // Bb in G minor
  assert.equal(run(`degreeOf(11, "Bb")`), "♭2");  // the B natural Josh flagged in menu
  assert.equal(run(`degreeOf(0, null)`), null);   // no declared key → no degrees
  // keyNameAt: ranged key wins inside its span, surrounding key resumes
  run(`keyRegions = [{start: 0, end: null, sf: -2, name: "Bb"},
                     {start: 960, end: 1920, sf: 1, name: "Em"}];`);
  assert.equal(run(`keyNameAt(0)`), "Bb");
  assert.equal(run(`keyNameAt(1000)`), "Em");
  assert.equal(run(`keyNameAt(2000)`), "Bb");
  run(`keyRegions = [];`);
  // guitar: y rows are strings high-e→low-E, x left of the nut = open string
  assert.deepEqual(val(`guitarHit(10, 14, 800, 168)`), {p: 64, si: 0, f: 0});   // open high e
  assert.deepEqual(val(`guitarHit(10, 168, 800, 168)`), {p: 40, si: 5, f: 0});  // open low E
  const g5 = val(`guitarHit(44 + ((800 - 50) / 24) * 2.5, 14, 800, 168)`);      // 3rd fret, high e
  assert.deepEqual(g5, {p: 67, si: 0, f: 3});
  // piano: no song range set here → default C4..B4 octave-aligned keyboard
  run(`song = null;`);
  assert.deepEqual(val(`instRange()`), [60, 71]);
  assert.equal(run(`pianoHit(1, 160, 700, 168)`), 60);          // bottom-left = middle C
  assert.equal(run(`pianoHit(700 / 7 - 2, 10, 700, 168)`), 61); // black-key zone over the C/D seam = C#
});

test("roll zoom-out clamp: floors flush to song extents, fitView lands on them", () => {
  installSong();
  run(`
    RULER_H = 24;
    song.tracks = [{name: "t", notes: [{t: 0, d: 480, p: 60, v: 80},
                                       {t: 7200, d: 480, p: 72, v: 80}]}];
    songEndTick = 16 * 480;
  `);
  // stub viewport 800x600, RULER_W 46: 16 quarters + a ruler-width of right pad = 708/16
  assert.equal(run(`pxqFloor()`), (800 - 92) / 16);
  // 13 pitch rows + 6 rows of air (ROLL_AIR above and below) in 552px = 29.05
  assert.equal(run(`rowHFloor()`), 552 / 19);
  run(`fitView();`);
  assert.equal(run(`view.pxq`), (800 - 92) / 16);
  assert.equal(run(`view.x`), 0);
  assert.equal(run(`view.y`), (96 - 72 - 3) * (552 / 19)); // top pitch sits ROLL_AIR rows below the ruler
  run(`view.pxq = 2; view.rowH = 3; clampView();`); // zoomed out too far → floors
  assert.equal(run(`view.pxq`), (800 - 92) / 16);
  assert.equal(run(`view.rowH`), 552 / 19);
  run(`song = null;`);
  assert.equal(run(`pxqFloor()`), 8); // no song: permissive defaults
  assert.equal(run(`rowHFloor()`), 6);
});

test("guitar octave fold: off-the-neck pitches fold in, shift records the move", () => {
  // 24-fret neck: E2 (40) .. E6 (88)
  assert.deepEqual(val(`gtrFold(60)`), {p: 60, shift: 0});   // middle C: on the neck
  assert.deepEqual(val(`gtrFold(93)`), {p: 81, shift: -1});  // A6 → A5, true pitch above
  assert.deepEqual(val(`gtrFold(36)`), {p: 48, shift: 1});   // C2 → C3, true pitch below
  assert.deepEqual(val(`gtrFold(101)`), {p: 77, shift: -2}); // two octaves over
});

test("chord challenge: evidence report — present/missing/extra vs the label, pedal shows as extra", () => {
  installSong();
  run(`
    trackState = [{muted: false, solo: false}];
    song.tracks = [{name: "t", notes: [
      {t: 0, d: 960, p: 65, v: 80},   // F4
      {t: 0, d: 960, p: 69, v: 80},   // A4
      {t: 0, d: 960, p: 72, v: 80},   // C5
      {t: 0, d: 960, p: 75, v: 80},   // Eb5
      {t: 0, d: 960, p: 58, v: 80},   // Bb3 — the tonic pedal
    ]}];
    keyRegions = [{start: 0, end: null, sf: -2, name: "Bb"}];
  `);
  const ev = val(`(() => { const e = chordEvidence({text: "F7", start: 0, end: 960});
    return {missing: e.missing, extra: e.extra, namer: e.namer}; })()`);
  assert.deepEqual(ev.missing, []);        // all four F7 tones sound
  assert.deepEqual(ev.extra, [10]);        // the Bb pedal — evidence, not verdict
  // wrong label: F named where the seventh sounds → Eb is "extra", nothing missing
  const ev2 = val(`(() => { const e = chordEvidence({text: "F", start: 0, end: 960});
    return {missing: e.missing, extra: e.extra}; })()`);
  assert.deepEqual(ev2.missing, []);
  assert.deepEqual(ev2.extra.sort((a, b) => a - b), [3, 10]); // Eb + the pedal
  // label with a slash bass: bass pc joins the expected set
  const ev3 = val(`(() => { const e = chordEvidence({text: "F7/A", start: 0, end: 960});
    return {missing: e.missing}; })()`);
  assert.deepEqual(ev3.missing, []);
  // label outside the vocabulary → no tone check, namer still reports
  assert.equal(val(`chordEvidence({text: "Fzzz", start: 0, end: 960}).expected`), null);
  // empty span
  assert.equal(run(`chordEvidence({text: "F7", start: 5000, end: 6000}).err`), "no notes sound in this span");
  run(`keyRegions = [];`);
});

test("chord challenge roles: menu's F7 case — guide tones present, root/5th missing, pedal extra", () => {
  installSong();
  run(`
    trackState = [{muted: false, solo: false}];
    song.tracks = [{name: "t", notes: [
      {t: 0, d: 960, p: 58, v: 80},   // Bb3 — tonic pedal
      {t: 0, d: 960, p: 63, v: 80},   // Eb4 — the 7th
      {t: 0, d: 960, p: 69, v: 80},   // A4  — the 3rd
      {t: 0, d: 960, p: 75, v: 80},   // Eb5
      {t: 0, d: 960, p: 81, v: 80},   // A5
    ]}];
    keyRegions = [{start: 0, end: null, sf: -2, name: "Bb"}];
  `);
  const ev = val(`(() => { const e = chordEvidence({text: "F7", start: 0, end: 960});
    return {missing: e.missing.sort((a,b)=>a-b), extra: e.extra, roles: e.roles, namer: e.namer}; })()`);
  assert.deepEqual(ev.missing, [0, 5]);              // C (5th) and F (root) never sound
  assert.deepEqual(ev.extra, [10]);                  // the Bb pedal
  assert.equal(ev.roles[9], "3rd");                  // A
  assert.equal(ev.roles[3], "7th");                  // Eb
  assert.equal(ev.roles[5], "root");
  assert.equal(ev.roles[0], "5th");
  assert.equal(ev.namer, "no standard chord match"); // honest: a bare tritone + pedal names nothing
  run(`keyRegions = [];`);
});

test("lasso toggle: tap adds, tap again removes, empty selection hides Chord?", () => {
  installSong();
  run(`
    trackState = [{muted: false, solo: false}];
    song.tracks = [{name: "t", notes: [
      {t: 0, d: 480, p: 60, v: 80}, {t: 480, d: 480, p: 64, v: 80}]}];
    multiSel = []; multiSelKey = new Set();
    previewNote = async () => {}; // no AudioContext in the vm
    toggleSel({ti: 0, ni: 0});
    toggleSel({ti: 0, ni: 1});
  `);
  assert.equal(run(`multiSel.length`), 2);
  assert.equal(run(`multiSelKey.has("0:1")`), true);
  run(`toggleSel({ti: 0, ni: 0});`); // tap the first one back out
  assert.equal(run(`multiSel.length`), 1);
  assert.equal(run(`multiSelKey.has("0:0")`), false);
  run(`toggleSel({ti: 0, ni: 1});`);
  assert.equal(run(`multiSel.length`), 0);
});

test("partial keys: tonic stored, never applied — round-trips with the ? marker", () => {
  installSong();
  run(`rollnotes = parseRollnotes("[1.1]\\nkey: G#/Ab?\\n").map(resolveNote); finalizeNotes();`);
  assert.equal(run(`rollnotes[0].keypartial`), "G#/Ab");
  assert.equal(run(`rollnotes[0].keydir`), undefined); // not applied:
  assert.equal(run(`keyRegions.length`), 0);           // no region, no signature
  assert.equal(run(`sfDeclaredAt(0)`), null);          // staff renders as unkeyed
  assert.ok(JSON.parse(run(`serializeRollnotes()`)).notes.some(x => x.key === "G#/Ab?")); // survives Sync
  run(`rollnotes = []; finalizeNotes();`);
});

test("asserted tonic spellings: Bb?, A#?, and fused A#/Bb? all round-trip as partials", () => {
  installSong();
  for (const form of ["Bb", "A#", "A#/Bb"]) {
    run(`rollnotes = parseRollnotes(${JSON.stringify("[1.1]\nkey: " + form + "?\n")}).map(resolveNote); finalizeNotes();`);
    assert.equal(run(`rollnotes[0].keypartial`), form, form);
    assert.equal(run(`rollnotes[0].keydir`), undefined, form + " not applied");
    assert.ok(JSON.parse(run(`serializeRollnotes()`)).notes.some(x => x.key === form + "?"), form);
  }
  // option-value mapping: stored name -> the dropdown option that wrote it
  assert.equal(run(`tonicOptionValue("Bb")`), "10:Bb");
  assert.equal(run(`tonicOptionValue("A#")`), "10:A#");
  assert.equal(run(`tonicOptionValue("A#/Bb")`), "10:");
  assert.equal(run(`tonicOptionValue("C")`), "0:");
  run(`rollnotes = []; finalizeNotes();`);
});

test("composition: writeMidi round-trips through the app's own parser", () => {
  installSong();
  const back = val(`(() => {
    const s = {ppq: 480, timesig: [6, 8],
      tempos: [{tick: 0, usq: 500000, sec: 0}],
      tracks: [
        {name: "pulse1", notes: [{t: 0, d: 240, p: 70, v: 96}, {t: 240, d: 480, p: 74, v: 52}]},
        {name: "triangle", notes: [{t: 0, d: 960, p: 46, v: 80}, {t: 960, d: 240, p: 53, v: 112, gone: true}]},
      ]};
    const parsed = parseMidi(writeMidi(s).buffer);
    return {ppq: parsed.ppq, timesig: parsed.timesig, usq: parsed.tempos[0].usq,
            names: parsed.tracks.map(t => t.name),
            notes: parsed.tracks.map(t => t.notes.map(n => [n.t, n.d, n.p, n.v]))};
  })()`);
  assert.equal(back.ppq, 480);
  assert.deepEqual(back.timesig, [6, 8]);
  assert.equal(back.usq, 500000);
  assert.deepEqual(back.names, ["pulse1", "triangle"]);
  assert.deepEqual(back.notes[0], [[0, 240, 70, 96], [240, 480, 74, 52]]);
  assert.deepEqual(back.notes[1], [[0, 960, 46, 80]]); // gone note not written
});

test("document title names the song first: '<Song> · Night Roll', bare app otherwise", () => {
  installSong();
  run(`setDocTitle("Threnody")`);
  assert.equal(val(`document.title`), "Threnody · Night Roll");
  run(`setDocTitle(null)`);
  assert.equal(val(`document.title`), "Night Roll");
  // the breadcrumb refresh is the one writer once a song is open
  run(`CATALOG["My Compositions"] = [["Threnody", "albums/compositions/threnody.mid"]]; currentPath = "albums/compositions/threnody.mid"; updateSongBtn();`);
  assert.equal(val(`document.title`), "Threnody · Night Roll");
  run(`currentPath = null; updateSongBtn();`);
  assert.equal(val(`document.title`), "Night Roll");
});

test("track delete/add are undo steps: delete → ⟲ restores at the same index with its notes; redo removes again", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/track-undo.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}]},
               {name: "pulse2", notes: [{t: 0, d: 480, p: 64, v: 80}, {t: 480, d: 480, p: 65, v: 80}]},
               {name: "triangle", notes: [{t: 0, d: 480, p: 40, v: 80}]}]};
    song.rawNotes = null; chopS = 0; selTrack = 1; editUndo = []; editRedo = [];
    trackState = song.tracks.map(() => ({muted: false, solo: false}));
    multiSel = []; multiSelKey = new Set(); selNote = null;
    // what the ✕ Delete track handler does, minus the DOM
    pushUndo({kind: "trackInsert", ti: 1, track: song.tracks[1], raw: null, state: trackState[1]});
    song.tracks.splice(1, 1); trackState.splice(1, 1);
  `);
  assert.deepEqual(val(`song.tracks.map(t => t.name)`), ["pulse1", "triangle"]);
  run(`editUndoPop()`);
  assert.deepEqual(val(`song.tracks.map(t => t.name)`), ["pulse1", "pulse2", "triangle"]);
  assert.equal(val(`song.tracks[1].notes.length`), 2);
  assert.equal(val(`trackState.length`), 3);
  run(`editRedoPop()`);
  assert.deepEqual(val(`song.tracks.map(t => t.name)`), ["pulse1", "triangle"]);
  run(`editUndoPop()`);
  assert.deepEqual(val(`song.tracks.map(t => t.name)`), ["pulse1", "pulse2", "triangle"]);
  // a generator that created its track: one step removes the notes AND the track
  run(`
    editUndo = []; editRedo = [];
    const lenBefore = editUndo.length;
    const ti = addTrackUndoable({name: "bass", notes: []});
    song.tracks[ti].notes.push({t: 0, d: 480, p: 45, v: 80});
    pushUndo({kind: "addBatch", items: [{ti, ni: 0}]}); // what bsGenerate pushes
    undoTrackAdd(ti, lenBefore);
  `);
  assert.deepEqual(val(`song.tracks.map(t => t.name)`), ["pulse1", "pulse2", "triangle", "bass"]);
  assert.equal(val(`editUndo.length`), 1);
  run(`editUndoPop()`);
  assert.deepEqual(val(`song.tracks.map(t => t.name)`), ["pulse1", "pulse2", "triangle"]);
  run(`editRedoPop()`);
  assert.deepEqual(val(`song.tracks.map(t => t.name)`), ["pulse1", "pulse2", "triangle", "bass"]);
  assert.equal(val(`song.tracks[3].notes.filter(n => !n.gone).length`), 1);
  run(`songKey = null; editUndo = []; editRedo = []; trackState = [];`);
});

test("pencil: a second tap on the same tick+pitch adds nothing (no twins, no undo entry)", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/twin-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}], tracks: [{name: "pulse1", notes: []}]};
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = []; pencilVel = 80;
    trackState = [{muted: false, solo: false}];
  `);
  const first = val(`placePencilNote({t: 480, pitch: 64, snap: 240})`);
  assert.equal(first.ni, 0);
  const again = val(`placePencilNote({t: 480, pitch: 64, snap: 240})`);
  assert.equal(again.ni, 0); // the existing note, not a new one
  assert.equal(again.existing, true);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 1);
  assert.equal(val(`editUndo.length`), 1); // nothing to undo for the second tap
  run(`song.tracks[0].notes[0].gone = true;`); // an erased note doesn't block the spot
  assert.equal(val(`placePencilNote({t: 480, pitch: 64, snap: 240})`).ni, 1);
  run(`songKey = null; editUndo = []; editRedo = [];`);
});

test("pencilCellAt: under a custom grid a pencil tap is one cell, anywhere it's placed", () => {
  installSong();
  run(`song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}], tracks: [{name: "pulse1", notes: []}]};
       gridDiv = 6; gridAnchor = {b: 1, q: 1}; pencilDur = 0.5;`);
  assert.deepEqual(val(`pencilCellAt(700)`), {t: 640, snap: 320}); // 6/bar: quarter-note triplets, cell floor
  run(`gridDiv = 12;`);
  assert.deepEqual(val(`pencilCellAt(700)`), {t: 640, snap: 160}); // 12/bar: eighth triplets
  run(`gridDiv = null;`);
  assert.deepEqual(val(`pencilCellAt(700)`), {t: 720, snap: 240}); // no grid: the chip duration, nearest line
});

test("gridFollowNote: the move grid follows the note you touch", () => {
  installSong();
  run(`song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}], tracks: [{name: "pulse1", notes: []}]};
       gridDiv = null; pencilNV = 8; pencilMod = 1; pencilDur = 0.5;`);
  assert.equal(val(`moveSnapTicks()`), 120); // 16ths with a straight duration
  assert.equal(val(`gridFollowNote({t: 160, d: 160})`), true); // triplet-8th position + length
  assert.equal(val(`pencilDur`), 1 / 3);
  assert.equal(val(`moveSnapTicks()`), 160);
  assert.equal(val(`gridFollowNote({t: 480, d: 160})`), false); // on the beat but triplet-long: stays triplet
  assert.equal(val(`gridFollowNote({t: 480, d: 240})`), true); // straight note: back to 16ths
  assert.equal(val(`pencilDur`), 0.25);
  assert.equal(val(`moveSnapTicks()`), 120);
  assert.equal(val(`gridFollowNote({t: 80, d: 80})`), true); // triplet 16th
  assert.equal(val(`pencilDur`), 1 / 6);
  run(`gridDiv = 10;`);
  assert.equal(val(`gridFollowNote({t: 480, d: 240})`), false); // a custom grid outranks the note
  run(`gridDiv = null; pencilNV = 8; pencilMod = 1; pencilDur = 0.5;`);
});

test("copy/paste carries the annotations under the selection: bands re-anchor, labels transpose, directives stay", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/anno-copy.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [{name: "pulse1", notes: [{t: 1920, d: 480, p: 64, v: 80}, {t: 2400, d: 480, p: 67, v: 80}, {t: 2880, d: 960, p: 71, v: 80}]}]};
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = []; annoClipboard = [];
    trackState = [{muted: false, solo: false}];
    rollnotes = parseRollnotes(JSON.stringify({version: 1, notes: [
      {at: [1, 1], type: "key", key: "Em"},
      {at: [2, 1], to: [2, 4], type: "section", label: "A"},
      {at: [2, 1], to: [2, 4], type: "chord", chord: "Em"},
      {at: [2, 3], text: "the sigh"},
      {at: [3, 1], to: [3, 4], type: "chord", chord: "C"}]})).map(resolveNote);
    finalizeNotes();
    multiSel = [{ti: 0, ni: 0}, {ti: 0, ni: 1}, {ti: 0, ni: 2}]; multiSelKey = new Set(["0:0", "0:1", "0:2"]); selNote = null;
    lassoAnno = null;
  `);
  assert.equal(run(`copySelection()`), 3);
  assert.deepEqual(val(`annoClipboard.length`), 0); // no lasso into the ruler: notes only (Josh's rule)
  // lanes: sections sit in lane 0, chords below — a box that reaches only the chord row takes chords alone
  const laneOf = t => val(`(() => { const n = rollnotes.find(x => x.text === ${JSON.stringify(t)}); return n.lane; })()`);
  const rowY = lane => val(`BASE_RULER_H + ${lane} * LANE_H`);
  const chordY = rowY(laneOf("Em")), sectY = rowY(laneOf("A"));
  run(`lassoAnno = {t0: 1920, t1: 3840, y0: ${chordY + 2}, y1: 400};`); // box top inside the chord row only
  assert.equal(run(`copySelection()`), 4); // 3 notes + 1 band
  assert.deepEqual(val(`annoClipboard.map(a => a.json.type || "text")`), ["chord"]);
  run(`lassoAnno = {t0: 1920, t1: 3840, y0: ${sectY + 2}, y1: 400};`); // up into the section row: both bands, no flag
  assert.equal(run(`copySelection()`), 5);
  assert.deepEqual(val(`annoClipboard.map(a => a.json.type || "text")`), ["section", "chord"]);
  run(`lassoAnno = {t0: 1920, t1: 3840, y0: 0, y1: 400};`); // the box reached the ruler across bar 2, all the way up
  assert.equal(run(`copySelection()`), 6);
  assert.deepEqual(val(`annoClipboard.map(a => [a.dt, a.len, a.json.type || "text"])`),
    [[0, 1920, "section"], [0, 1920, "chord"], [960, null, "text"]]); // bar 2's bands + note; bar 3's chord and the key stay out
  const before = val(`rollnotes.length`);
  assert.equal(run(`pasteClipboard(3840 * 2)`), 6); // bar 5: 3 notes + 3 annotations
  assert.deepEqual(val(`rollnotes.filter(n => n.added).map(n => [n.b1, n.q1, n.b2, n.q2, n.text])`),
    [[5, 1, 5, 4, "A"], [5, 1, 5, 4, "Em"], [5, 3, null, null, "the sigh"]]);
  assert.equal(val(`rollnotes.filter(n => n.keydir !== undefined).length`), 1); // the key directive did not duplicate
  run(`editUndoPop()`); // one step takes notes and bands together
  assert.equal(val(`rollnotes.length`), before);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 3);
  // Paste to… up a minor third: the chord label follows, the section and note don't change
  assert.equal(run(`pasteClipboard(3840 * 2, {ti: 0, dP: 3})`), 6);
  assert.deepEqual(val(`rollnotes.filter(n => n.added).map(n => n.text)`), ["A", "Gm", "the sigh"]);
  run(`editUndoPop();`);
  // ✂ with a lasso'd SYNCED band: the band goes, a tombstone is written, undo brings it back and prunes the tombstone
  run(`rollnotes.forEach(n => { n.added = false; }); localStorage.removeItem("ff1roll-tombs-" + songKey);
       multiSel = [{ti: 0, ni: 0}, {ti: 0, ni: 1}, {ti: 0, ni: 2}]; multiSelKey = new Set(["0:0", "0:1", "0:2"]); lassoAnno = {t0: 1920, t1: 3840, y0: 0, y1: 400};`);
  const nBefore = val(`rollnotes.length`);
  assert.equal(run(`cutSelection()`), 6);
  assert.equal(val(`rollnotes.length`), nBefore - 3);
  assert.equal(val(`rollnotes.some(n => n.chord && n.text === "Em")`), false);
  assert.equal(val(`JSON.parse(localStorage.getItem("ff1roll-tombs-" + songKey) || "[]").length`), 3);
  run(`editUndoPop()`);
  assert.equal(val(`rollnotes.length`), nBefore);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 3);
  assert.equal(val(`JSON.parse(localStorage.getItem("ff1roll-tombs-" + songKey) || "[]").length`), 0); // pruned: they're alive again
  // 🗑 on a lasso that holds bands: notes AND bands go, one undo brings both back
  run(`multiSel = [{ti: 0, ni: 0}]; multiSelKey = new Set(["0:0"]); lassoAnno = {t0: 1920, t1: 3840, y0: 0, y1: 400};`);
  const n0 = val(`rollnotes.length`);
  assert.equal(run(`deleteSelection()`), 4); // 1 note + 3 annotations
  assert.equal(val(`rollnotes.length`), n0 - 3);
  assert.equal(val(`lassoAnno`), null);
  run(`editUndoPop()`);
  assert.equal(val(`rollnotes.length`), n0);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 3);
  // bands alone: ⧉ copies them, 📋 lands them elsewhere, one undo
  run(`multiSel = []; multiSelKey = new Set(); lassoAnno = {t0: 1920, t1: 3840, y0: 0, y1: 400};`);
  assert.equal(run(`copySelection()`), 3);
  assert.equal(val(`noteClipboard.length`), 0);
  assert.equal(val(`annoClipboard.length`), 3);
  const nA = val(`rollnotes.length`);
  assert.equal(run(`pasteClipboard(3840 * 3)`), 3); // bar 7
  assert.equal(val(`rollnotes.length`), nA + 3);
  assert.deepEqual(val(`rollnotes.filter(n => n.added && n.b1 === 7).map(n => n.text)`), ["A", "Em", "the sigh"]);
  assert.equal(val(`playCursor`), 3840 * 3 + 1920); // cursor at the pasted bands' end
  run(`editUndoPop()`);
  assert.equal(val(`rollnotes.length`), nA);
  // a lasso over bands alone (no notes) still deletes them
  run(`multiSel = []; multiSelKey = new Set(); lassoAnno = {t0: 1920, t1: 3840, y0: 0, y1: 400};`);
  assert.equal(run(`deleteSelection()`), 3);
  assert.equal(val(`rollnotes.length`), n0 - 3);
  run(`editUndoPop()`);
  assert.equal(val(`rollnotes.length`), n0);
  // renaming a synced annotation retires the original with a tombstone (the "new one over the old one" bug)
  run(`retireEdited(rollnotes.find(n => n.chord && n.text === "C"))`);
  assert.equal(val(`rollnotes.some(n => n.chord && n.text === "C")`), false);
  assert.equal(val(`JSON.parse(localStorage.getItem("ff1roll-tombs-" + songKey) || "[]").length`), 1);
  run(`localStorage.removeItem("ff1roll-tombs-" + songKey); songKey = null; multiSel = []; multiSelKey = new Set(); editUndo = []; editRedo = []; noteClipboard = null; annoClipboard = []; lassoAnno = null; rollnotes = []; trackState = [];`);
});

test("Paste to…: the clipboard lands on a chosen track, shifted, same rhythm", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/paste-to.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [{name: "pulse1", notes: []}, {name: "pulse2", notes: []},
               {name: "triangle", notes: [{t: 0, d: 240, p: 45, v: 100}, {t: 240, d: 120, p: 45, v: 90}, {t: 360, d: 120, p: 45, v: 90}]}]};
    song.rawNotes = null; chopS = 0; selTrack = 2; editUndo = []; editRedo = [];
    trackState = song.tracks.map(() => ({muted: false, solo: false}));
    multiSel = [{ti: 2, ni: 0}, {ti: 2, ni: 1}, {ti: 2, ni: 2}]; multiSelKey = new Set(["2:0", "2:1", "2:2"]); selNote = null;
  `);
  assert.equal(run(`copySelection()`), 3);
  assert.equal(run(`pasteClipboard(0, {ti: 1, dP: 12})`), 3); // the gallop onto pulse2, an octave up
  assert.deepEqual(val(`song.tracks[1].notes.map(n => [n.t, n.d, n.p])`), [[0, 240, 57], [240, 120, 57], [360, 120, 57]]);
  assert.equal(val(`song.tracks[2].notes.length`), 3); // source untouched
  assert.equal(val(`playCursor`), 480); // cursor at the pasted end, as any paste
  assert.equal(run(`pasteClipboard(0, {ti: 1, dP: 15})`), 3); // a third above that: harmony
  assert.deepEqual(val(`song.tracks[1].notes.slice(3).map(n => n.p)`), [60, 60, 60]);
  assert.equal(run(`pasteClipboard(0, {ti: 0, dP: 200})`), 0); // off the roll: nothing lands
  run(`editUndoPop();`); // one step per paste
  assert.equal(val(`song.tracks[1].notes.filter(n => !n.gone).length`), 3);
  run(`songKey = null; multiSel = []; multiSelKey = new Set(); editUndo = []; editRedo = []; noteClipboard = null; trackState = [];`);
});

test("song links: path form in, ?song= form in (either), path form out", () => {
  installSong();
  run(`APP_BASE = "https://joshcough.github.io/night-roll/";`); // the harness has no location; pin the base
  const from = href => val(`songPathFromURL(${JSON.stringify(href)})`);
  assert.equal(from("https://joshcough.github.io/night-roll/albums/compositions/nightroll/ambush"), "albums/compositions/nightroll/ambush.mid");
  assert.equal(from("https://joshcough.github.io/night-roll/albums/compositions/nightroll/ambush.mid"), "albums/compositions/nightroll/ambush.mid");
  assert.equal(from("https://joshcough.github.io/night-roll/?song=albums%2Fcompositions%2Fnightroll%2Fambush.mid"), "albums/compositions/nightroll/ambush.mid"); // old links
  assert.equal(from("https://joshcough.github.io/night-roll/?song=albums/compositions/nightroll/ambush&perf=1"), "albums/compositions/nightroll/ambush.mid");
  assert.equal(from("https://joshcough.github.io/night-roll/"), null);
  assert.equal(from("https://joshcough.github.io/night-roll/?song=../etc/passwd"), null);
  assert.equal(from("https://joshcough.github.io/night-roll/vendor/x"), null); // only albums/ is a song
  assert.equal(val(`songShareURL("albums/compositions/nightroll/ambush.mid")`), "https://joshcough.github.io/night-roll/albums/compositions/nightroll/ambush");
  assert.equal(val(`songShareURL("albums/nes/final-fantasy-i/songs/town.mid", "http://localhost:8735/")`), "http://localhost:8735/albums/nes/final-fantasy-i/songs/town");
});

test("album play: pass math, album lookup, and no dialog mid-run", async () => {
  installSong();
  // pass 1 = intro + loop body, each further pass = the body again; nothing looping = once; capped
  assert.equal(val(`albumEndSec({start: 10, end: 40}, 50, true, 2, 300)`), 70);
  assert.equal(val(`albumEndSec({start: 10, end: 40}, 50, true, 1, 300)`), 40);
  assert.equal(val(`albumEndSec({start: 10, end: 40}, 50, true, 3, 300)`), 100);
  assert.equal(val(`albumEndSec({start: 0, end: 50}, 50, true, 2, 300)`), 100); // whole-song wrap: twice through
  assert.equal(val(`albumEndSec({start: 10, end: 40}, 50, false, 2, 300)`), 50); // nothing inside the segment: play once
  assert.equal(val(`albumEndSec({start: 0, end: 200}, 200, true, 2, 300)`), 300); // the cap
  // the list wraps both ways, always
  assert.equal(val(`albumNextIdx(1, 2)`), 1);
  assert.equal(val(`albumNextIdx(2, 2)`), 0);
  assert.equal(val(`albumPrevIdx(1, 2)`), 0);
  assert.equal(val(`albumPrevIdx(0, 2)`), 1);
  run(`for (const k of Object.keys(CATALOG)) delete CATALOG[k];
       CATALOG["Test Album"] = [["First", "albums/t/first.mid"], ["Second", "albums/t/second.mid"]];`);
  assert.deepEqual(val(`(() => { const p = albumPos("albums/t/second.mid"); return [p.album, p.idx, p.list.length]; })()`), ["Test Album", 1, 2]);
  assert.equal(val(`albumPos("local/x.mid")`), null);
  // a dirty draft with a newer repo save: outside a run the app asks; inside a run it keeps the draft silently
  run(`
    fetch = async () => ({ok: true, text: async () => JSON.stringify({saved: 9e12})});
    appConfirm = () => { throw new Error("dialog during album play"); };
    localStorage.setItem("ff1roll-draft-albums/t/first.mid", JSON.stringify({savedStamp: 1, dirty: true, ppq: 480, timesig: [4, 4],
      tempos: [{tick: 0, usq: 500000}], tracks: [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}]}]}));
    albumRun = {album: "Test Album", list: CATALOG["Test Album"], idx: 0, passes: 2, gen: 0};
  `);
  await run(`loadSongInner("albums/t/first.mid")`); // a real promise from the vm realm — awaitable
  assert.equal(val(`songKey`), "albums/t/first.mid"); // the draft opened, no throw
  assert.equal(val(`song.tracks[0].notes.length`), 1);
  run(`albumRun = null; localStorage.removeItem("ff1roll-draft-albums/t/first.mid"); for (const k of Object.keys(CATALOG)) delete CATALOG[k]; songKey = null;`);
});

test("midiStatusLine: names the reason ● hears nothing", () => {
  installSong();
  assert.match(run(`midiStatusLine()`), /no Web MIDI/); // harness navigator has no requestMIDIAccess
  run(`navigator.requestMIDIAccess = () => Promise.resolve(); midiErr = new Error("Permission denied");`);
  assert.match(run(`midiStatusLine()`), /MIDI blocked: Permission denied/);
  run(`midiErr = null; midiAccess = null;`);
  assert.match(run(`midiStatusLine()`), /not ready/);
  run(`midiAccess = {inputs: new Map()};`);
  assert.match(run(`midiStatusLine()`), /no MIDI inputs found/);
  run(`midiAccess = {inputs: new Map([["a", {name: "MPK mini 3", state: "connected"}]])};`);
  assert.match(run(`midiStatusLine()`), /MIDI in: MPK mini 3 — play/);
  run(`midiAccess = null; delete navigator.requestMIDIAccess;`);
});

test("composition helpers: slugify, isComposition gate, draft store round-trip", () => {
  installSong();
  assert.equal(run(`slugify("  My New Song! ")`), "my-new-song");
  assert.equal(run(`slugify("")`), "untitled");
  run(`songKey = "albums/nes/final-fantasy-i/songs/town.mid";`);
  assert.equal(run(`isComposition()`), false); // chip capture: Save locked
  run(`songKey = "albums/compositions/nightroll/test-tune.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */`);
  assert.equal(run(`isComposition()`), true);
  // promoted out of nightroll/ with no local draft on this device: a provenance
  // note is history, not a key — the song stays a published copy until Edit
  // here makes the local one (2026-09-27)
  run(`songKey = "albums/compositions/promoted.mid"; rollnotes = [];`);
  assert.equal(run(`isComposition()`), false);
  run(`rollnotes = parseRollnotes('{"version":1,"notes":[{"at":[1,1],"text":"moved from albums/compositions/nightroll/promoted.mid"}]}').map(resolveNote);`);
  assert.equal(run(`isComposition()`), false);
  run(`localStorage.setItem(draftStoreKey(songKey), "{}");`);
  assert.equal(run(`isComposition()`), true, "the local copy is the key");
  run(`localStorage.removeItem(draftStoreKey(songKey));`);
  assert.equal(run(`isComposition()`), false); // anchored at line start, not a substring
  run(`rollnotes = []; songKey = "albums/compositions/nightroll/test-tune.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */`);
  run(`
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}],
            tracks: [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80},
                                              {t: 480, d: 480, p: 62, v: 80, gone: true}]}]};
    saveDraft();
  `);
  const d = JSON.parse(app.store.get("ff1roll-draft-albums/compositions/nightroll/test-tune.mid"));
  assert.deepEqual(d.tracks[0].notes, [{t: 0, d: 480, p: 60, v: 80}]); // gone filtered
  assert.deepEqual(d.timesig, [4, 4]);
  run(`songKey = null;`);
});

test("manifest placement: save adds, move relocates, albums resolve by dir", () => {
  installSong();
  assert.equal(run(`albumTitleFor("albums/compositions/nightroll/x.mid")`), "Night Roll Sketches");
  assert.equal(run(`albumTitleFor("albums/compositions/x.mid")`), "My Compositions");
  assert.equal(run(`albumTitleFor("albums/nes/final-fantasy-i/songs/town.mid")`), "Final Fantasy I"); // every albums/ folder titles by its leaf now
  const out = val(`(() => {
    const albums = [{title: "My Compositions", songs: [{title: "Old", path: "albums/compositions/old.mid"}]}];
    manifestPlace(albums, null, "albums/compositions/nightroll/test-tune.mid"); // first save
    manifestPlace(albums, "albums/compositions/nightroll/test-tune.mid",
                          "albums/compositions/test-tune.mid");                 // promote
    return albums;
  })()`);
  const sketches = out.find(a => a.title === "Night Roll Sketches");
  assert.deepEqual(sketches.songs, []); // moved out
  const mine = out.find(a => a.title === "My Compositions");
  assert.deepEqual(mine.songs.map(s => s.path).sort(),
    ["albums/compositions/old.mid", "albums/compositions/test-tune.mid"]);
  assert.equal(mine.songs.find(s => s.path.includes("test-tune")).title, "Test Tune");
});

test("NSF import helpers: track keys, album titles, manifest, Sync exclusion", () => {
  assert.equal(run(`impTrackKey("solstice", 7)`), "albums/imports/solstice/track-07.mid");
  assert.equal(run(`albumTitleFor("albums/imports/solstice/track-07.mid")`), "Solstice");
  run(`
    localStorage.setItem("ff1roll-draft-albums/imports/solstice/track-07.mid", "{}");
    localStorage.setItem("ff1roll-notes-albums/imports/solstice/track-07.mid", "[]");
  `);
  assert.deepEqual(val(`importDraftKeys()`), ["albums/imports/solstice/track-07.mid"]);
  // uncommitted captures ride Commit import, not the Sync badge…
  assert.equal(val(`dirtySongs()`).includes("albums/imports/solstice/track-07.mid"), false);
  // …but once the draft is gone (committed), local notes sync normally again
  run(`localStorage.removeItem("ff1roll-draft-albums/imports/solstice/track-07.mid");`);
  assert.equal(val(`dirtySongs()`).includes("albums/imports/solstice/track-07.mid"), true);
  run(`localStorage.removeItem("ff1roll-notes-albums/imports/solstice/track-07.mid");`);
  const out = val(`(() => {
    const albums = [];
    manifestPlace(albums, null, "albums/imports/solstice/track-07.mid");
    return albums;
  })()`);
  assert.equal(out[0].title, "Solstice"); // commit self-creates the album
  assert.deepEqual(out[0].songs, [{title: "Track 07", path: "albums/imports/solstice/track-07.mid"}]);
});

test("sampled voices: every menu entry has its soundfont file; pitch names map to sample keys", () => {
  const sf = val(`SF_VOICES`);
  assert.ok(sf.length >= 8);
  for (const [id, , file] of sf) {
    assert.ok(id.startsWith("sf-"), id);
    const path = new URL("../vendor/soundfonts/" + file + ".json", import.meta.url);
    const map = JSON.parse(readFileSync(path, "utf8")); // missing/corrupt file throws
    assert.ok(map.A4 && map.A4.startsWith("data:audio"), file + " has A4");
    assert.equal(Object.keys(map).length, 88, file + " covers the 88 keys");
  }
  assert.equal(run(`sfNoteName(69)`), "A4");
  assert.equal(run(`sfNoteName(60)`), "C4");
  assert.equal(run(`sfNoteName(61)`), "Db4"); // FluidR3 names use flats
  assert.equal(run(`sfNoteName(21)`), "A0");
  assert.equal(run(`sfNoteName(108)`), "C8");
  // menu carries the sampled set; the retired synth patches are gone from it
  const voices = val(`VOICES`).map(v => v[0]);
  assert.ok(voices.includes("sf-piano") && voices.includes("sf-violin"));
  assert.ok(!voices.includes("pluck") && !voices.includes("bell"));
});

test("data-location config: defaults are legacy-identical; bases and repos route", () => {
  // defaults: relative reads (today's behavior), night-roll writes
  run(`localStorage.removeItem("ff1roll-cfg"); cfg.c = null;`);
  assert.equal(run(`songsURL("albums/manifest.json")`), "albums/manifest.json");
  assert.equal(run(`analysisURL("albums/x/songs/y.rollnotes.json")`), "albums/x/songs/y.rollnotes.json");
  assert.equal(run(`repoApi("songs")`), "https://api.github.com/repos/joshcough/night-roll/contents/");
  assert.equal(run(`repoApi("analysis")`), "https://api.github.com/repos/joshcough/night-roll/contents/");
  assert.equal(run(`repoName("nsf")`), "joshcough/nsf-archive");
  assert.equal(run(`nsfURL("ff1.nsf")`), "https://raw.githubusercontent.com/joshcough/nsf-archive/main/ff1.nsf");
  // configured: any base URL prepends (trailing slashes normalized); writes retarget
  run(`saveCfg({songsBase: "https://raw.githubusercontent.com/other/corpus/main/",
                analysisBase: "http://localhost:8001",
                analysisRepo: "other/my-analysis"});`);
  assert.equal(run(`songsURL("albums/a.mid")`), "https://raw.githubusercontent.com/other/corpus/main/albums/a.mid");
  assert.equal(run(`analysisURL("albums/a.rollnotes.json")`), "http://localhost:8001/albums/a.rollnotes.json");
  assert.equal(run(`repoApi("analysis")`), "https://api.github.com/repos/other/my-analysis/contents/");
  assert.equal(run(`repoApi("songs")`), "https://api.github.com/repos/joshcough/night-roll/contents/"); // unset field keeps default
  // scope-shaped API failures name the repo and the fix
  const msg = run(`apiError("analysis", {status: 404}, "x.rollnotes.json").message`);
  assert.match(msg, /other\/my-analysis/);
  assert.match(msg, /token can't see/);
  run(`localStorage.removeItem("ff1roll-cfg"); cfg.c = null;`); // restore defaults for later tests
});

// In-memory FileSystemDirectoryHandle: the subset the folder backend uses
// (getDirectoryHandle/getFileHandle with {create}, getFile, createWritable,
// removeEntry, entries). Cross-realm is fine — the app only calls methods.
function fakeDir(name = "root") {
  const dirs = new Map(), files = new Map();
  const nf = () => Object.assign(new Error("not found"), { name: "NotFoundError" });
  const enc = new TextEncoder(), dec = new TextDecoder();
  return {
    kind: "directory", name,
    async getDirectoryHandle(n, o) {
      if (!dirs.has(n)) { if (!o || !o.create) throw nf(); dirs.set(n, fakeDir(n)); }
      return dirs.get(n);
    },
    async getFileHandle(n, o) {
      if (!files.has(n)) { if (!o || !o.create) throw nf(); files.set(n, { data: "" }); }
      const f = files.get(n);
      return {
        kind: "file", name: n,
        async getFile() {
          const bytes = typeof f.data === "string" ? enc.encode(f.data) : new Uint8Array(f.data);
          return { size: bytes.length, text: async () => dec.decode(bytes), arrayBuffer: async () => bytes.buffer };
        },
        async createWritable() { return { async write(d) { f.data = d; }, async close() {} }; },
      };
    },
    async removeEntry(n) { if (!files.delete(n) && !dirs.delete(n)) throw nf(); },
    async *entries() {
      for (const [k, v] of dirs) yield [k, v];
      for (const [k] of files) yield [k, { kind: "file", name: k }];
    },
  };
}

test("local folder mode: reads fall back to the site, writes need no token, catalog scans the folder", async () => {
  // off by default: readData is a plain fetch (earlier tests may have stubbed
  // the sandbox's fetch — own it here, restore at the end)
  run(`globalThis.__prevFetch = fetch; fetch = () => Promise.reject(new Error("no network"));`);
  run(`fsRoot.handle = null; fsRoot.needsGrant = false;`);
  assert.equal(run(`folderActive()`), false);
  await assert.rejects(() => run(`readData("analysis", "albums/x.rollnotes.json")`), /no network/);
  assert.equal(run(`writeToken()`), null);
  // a folder: text and bytes round-trip, directories are created on the way
  app.context.fakeRoot = fakeDir("Night Roll");
  run(`fsRoot.handle = fakeRoot; fsRoot.name = fakeRoot.name; fsRoot.mode = "picker"; fsRoot.needsGrant = false;`);
  assert.equal(run(`folderActive()`), true);
  assert.equal(run(`writeToken()`), "folder");
  await run(`folderWrite("albums/compositions/nightroll/a.rollnotes.json", '{"version":1,"saved":5,"notes":[]}')`);
  const r = await run(`readData("analysis", "albums/compositions/nightroll/a.rollnotes.json", true)`);
  assert.equal(r.ok, true);
  assert.equal(r.fromFolder, true);
  assert.equal(JSON.parse(await r.text()).saved, 5);
  // absent in the folder → the site (still no network here)
  await assert.rejects(() => run(`readData("songs", "albums/nes/final-fantasy-i/songs/overworld.mid")`), /no network/);
  // the write helpers route to the folder and answer ok without touching GitHub
  installSong();
  run(`song.tracks = [{name: "v1", notes: [{t: 0, d: 480, p: 60, v: 80}]}];`);
  const r1 = await run(`putMidAt("albums/compositions/nightroll/a.mid", ghHeaders("folder"))`);
  const r2 = await run(`putSongsText("albums/compositions/nightroll/a.notes.txt", "hello", ghHeaders("folder"))`);
  const r3 = await run(`putRollnotes("albums/compositions/other/b.rollnotes.json", "{}", ghHeaders("folder"))`);
  assert.deepEqual([r1.ok, r2.ok, r3.ok], [true, true, true]);
  const mid = await run(`folderRead("albums/compositions/nightroll/a.mid")`);
  assert.ok(mid && mid.size > 20, "the .mid landed as bytes");
  assert.equal(await (await run(`folderRead("albums/compositions/nightroll/a.notes.txt")`)).text(), "hello");
  assert.equal(await run(`updateManifest(null, () => { throw new Error("must not run"); })`), undefined);
  // the folder scan has the manifest's shape; album.json titles win; a
  // subdirectory with its own album.json is its own album
  await run(`folderWrite("albums/compositions/album.json", '{"title":"My Compositions","order":2,"songs":{"c":"Third Song"}}')`);
  await run(`folderWrite("albums/compositions/c.mid", new Uint8Array([77, 84, 104, 100]))`);
  // nightroll/ has NO album.json in a fresh folder: the app's own name applies by path
  const scan = JSON.parse(JSON.stringify(await run(`folderScanAlbums()`)));
  assert.deepEqual(scan.map(a => a.title), ["My Compositions", "Night Roll Sketches"]);
  assert.deepEqual(scan[0].songs, [{ title: "Third Song", path: "albums/compositions/c.mid" }]);
  assert.deepEqual(scan[1].songs, [{ title: "A", path: "albums/compositions/nightroll/a.mid" }]);
  // initCatalog: the site is unreachable, the folder alone still lists
  await run(`initCatalog()`);
  assert.deepEqual(val(`CATALOG["Night Roll Sketches"]`), [["A", "albums/compositions/nightroll/a.mid"]]);
  // "my folder only": with the site reachable, its albums are merged in — unless the pref is on
  run(`fetch = () => Promise.resolve({ok: true, json: async () => [{title: "Final Fantasy I", songs: [{title: "Overworld", path: "albums/nes/final-fantasy-i/songs/overworld.mid"}]}]});`);
  await run(`initCatalog()`);
  assert.ok(val(`Object.keys(CATALOG)`).includes("Final Fantasy I"));
  run(`localStorage.setItem("ff1roll-folderonly", "1");`);
  assert.equal(run(`folderOnly()`), true);
  await run(`initCatalog()`);
  assert.deepEqual(val(`Object.keys(CATALOG)`).sort(), ["My Compositions", "Night Roll Sketches"]);
  run(`localStorage.removeItem("ff1roll-folderonly"); fetch = () => Promise.reject(new Error("no network"));`);
  assert.equal(run(`folderOnly()`), false);
  // delete: gone is true, and true again when already gone
  assert.equal(await run(`deleteRepoFile("albums/compositions/c.mid", null)`), true);
  assert.equal(await run(`deleteRepoFile("albums/compositions/c.mid", null)`), true);
  assert.equal(await run(`folderRead("albums/compositions/c.mid")`), null);
  // off again: back to the network path
  run(`fsRoot.handle = null; fsRoot.name = ""; fsRoot.mode = null; CATALOG = {}; fetch = globalThis.__prevFetch;`);
  assert.equal(run(`folderActive()`), false);
  assert.equal(run(`writeToken()`), null);
});

test("audio tracks: the audio: annotation round-trips and derives kind/clip onto a named track", () => {
  // text ⇄ JSON identity, like every other type
  const j = val(`noteToJSON(parseRollnotes("[5.1]\\naudio: guitar file=take-2.m4a offset=0.25 len=3.5 local=1\\n")[0])`);
  assert.deepEqual(j, {at: [5, 1], type: "audio", track: "guitar", file: "take-2.m4a", offset: 0.25, len: 3.5, local: true});
  const back = val(`jsonToRawNote(${JSON.stringify(j)})`);
  assert.equal(back.text, "audio: guitar file=take-2.m4a offset=0.25 len=3.5 local=1");
  assert.equal(run(`deriveNoteTypes([{b1: 1, q1: 1, b2: null, q2: null, text: "audio: g file=a.wav"}])[0].audiodir.offset`), 0);
  // a composition with two MIDI tracks and an empty "guitar" track
  run(`
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}],
            tracks: [{name: "lead", notes: [{t: 0, d: 480, p: 72, v: 80}]},
                     {name: "bass", notes: [{t: 0, d: 480, p: 48, v: 80}]},
                     {name: "guitar", notes: []}]};
    song.baseTempos = null; song.rawNotes = song.tracks.map(tr => tr.notes.map(n => ({...n})));
    songKey = "albums/compositions/nightroll/audio-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    trackState = song.tracks.map(() => ({muted: false, solo: false}));
    keyRegions = []; previewSf = null; playCursor = 0; playRate = 1; rangeSel = null; loopSeg = null;
    rollnotes = parseRollnotes("[3.1]\\naudio: Guitar file=take.wav offset=0.5\\n").map(resolveNote);
    finalizeNotes();
  `);
  assert.equal(run(`song.tracks[2].kind`), "audio");
  assert.equal(run(`song.tracks[2].clips.length`), 1);
  assert.equal(run(`song.tracks[2].clips[0].file`), "take.wav");
  assert.equal(run(`song.tracks[2].clips[0].at`), 2 * 4 * 480); // bar 3 (case-insensitive name match)
  assert.equal(run(`song.tracks[2].clips[0].offset`), 0.5);
  assert.equal(run(`song.tracks[0].kind`), undefined);
  // guards: the audio track never becomes the "last = triangle" bass, never a kit, never a bass to follow
  assert.equal(run(`voiceType(1)`), "triangle");
  assert.equal(run(`voiceType(2)`), "sine");
  run(`song.tracks[2].name = "drums-di";`);
  assert.equal(run(`trackIsDrums(2)`), false);
  run(`song.tracks[2].name = "guitar";`);
  assert.equal(run(`moveSelectionToTrack(2)`), 0);
  // a decoded file (faked) makes the piece one wall-second event starting AT its anchor,
  // playing the rest of the file after the offset, and stretches the song end
  run(`
    const e = audioBufCache.get(audioCacheKey("take.wav")); e.dur = 10; e.status = "ready"; e.where = "device";
    e.buffer = {duration: 10, sampleRate: 48000};
    Object.assign(song.tracks[2].clips[0], {dur: 10, status: "ready", buffer: e.buffer, where: "device"});
    computeSongEnd(); buildSchedule();
  `);
  const ev = val(`schedEvents.filter(e => e.n._clip).map(e => ({sec: e.sec, dur: e.dur, ti: e.ti}))`);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].ti, 2);
  assert.ok(Math.abs(ev[0].sec - 4) < 1e-9, "bar 3 at 120bpm = 4s: the piece starts at its anchor");
  assert.ok(Math.abs(ev[0].dur - 9.5) < 1e-9, "plays the file from 0.5s to its end");
  assert.ok(run(`songEndTick`) >= run(`clipEndTick(song.tracks[2].clips[0])`), "song end covers the piece");
  assert.equal(run(`songEndTick`) % (4 * 480), 0);
  // at double speed the event halves in wall time
  run(`playRate = 2; buildSchedule();`);
  const ev2 = val(`schedEvents.filter(e => e.n._clip).map(e => ({sec: e.sec, dur: e.dur}))`);
  assert.ok(Math.abs(ev2[0].sec - 2) < 1e-9);
  assert.ok(Math.abs(ev2[0].dur - 4.75) < 1e-9);
  run(`playRate = 1;`);
  // no staff for the clip (the vm has no VexFlow, so the model may be null; when it exists, track 2 is absent)
  run(`buildScoreModel();`);
  if (run(`!!scoreModel`)) assert.equal(val(`scoreModel.staves.map(s => s.ti)`).includes(2), false);
  // moving the piece rewrites the annotation (fresh added note, one anno undo entry); it keeps knowing where its bytes are
  const before = run(`editUndo.length`);
  run(`setClipDir(2, 0, {at: 4 * 480});`);
  assert.equal(run(`editUndo.length`), before + 1);
  assert.equal(run(`song.tracks[2].clips[0].at`), 4 * 480);
  assert.equal(run(`song.tracks[2].clips[0].where`), "device");
  assert.equal(val(`rollnotes.filter(n => n.audiodir).map(n => n.text)`).length, 1);
  assert.equal(run(`rollnotes.find(n => n.audiodir).text`), "audio: guitar file=take.wav offset=0.5");
  assert.equal(run(`rollnotes.find(n => n.audiodir).b1`), 2);
  // split at bar 4 (2s into the piece): two pieces, one undo; the right one starts at the cut and picks up the file there
  const undoBeforeSplit = run(`editUndo.length`);
  assert.equal(run(`splitClipAt(2, 0, 3 * 4 * 480)`), true);
  assert.equal(run(`editUndo.length`), undoBeforeSplit + 1);
  assert.equal(run(`song.tracks[2].clips.length`), 2);
  assert.deepEqual(val(`song.tracks[2].clips.map(c => [c.at, c.offset, c.len])`), [[4 * 480, 0.5, 4], [12 * 480, 4.5, 5.5]]);
  assert.equal(val(`rollnotes.filter(n => n.audiodir).map(n => n.text)`).length, 2);
  assert.equal(run(`serializeRollnotes()`).match(/"type":"audio"/g).length, 2); // both pieces serialize
  run(`buildSchedule();`);
  assert.deepEqual(val(`schedEvents.filter(e => e.n._clip).map(e => [e.sec, e.dur])`), [[2, 4], [6, 5.5]]);
  // a split outside the piece is refused
  assert.equal(run(`splitClipAt(2, 0, 100 * 480)`), false);
  // trim: right edge shortens; left edge keeps the sound in place (anchor + offset move together)
  run(`trimClip(2, 1, "R", -2 * 480);`); // one second at 120bpm
  assert.deepEqual(val(`song.tracks[2].clips.map(c => [c.at, c.offset, c.len])`), [[4 * 480, 0.5, 4], [12 * 480, 4.5, 4.5]]);
  run(`trimClip(2, 0, "L", 2 * 480);`);
  assert.deepEqual(val(`song.tracks[2].clips.map(c => [c.at, c.offset, c.len])`), [[6 * 480, 1.5, 3], [12 * 480, 4.5, 4.5]]);
  // remove a piece: the other stands, the track stays
  run(`deleteClip(2, 0);`);
  assert.deepEqual(val(`song.tracks[2].clips.map(c => [c.at, c.offset, c.len])`), [[12 * 480, 4.5, 4.5]]);
  assert.equal(run(`song.tracks[2].kind`), "audio");
  // deleting every annotation returns the track to an ordinary empty lane
  run(`rollnotes = rollnotes.filter(n => !n.audiodir); finalizeNotes();`);
  assert.equal(run(`song.tracks[2].kind`), undefined);
  assert.equal(run(`song.tracks[2].clips`), undefined);
  run(`editUndo = []; song = null; songKey = null; rollnotes = [];`);
});

test("loadNotes: the repo file's saved stamp becomes the song's base, so another device's first draft is not 'older than a newer save'", async () => {
  run(`globalThis.__prevFetchS = fetch; fetch = async () => ({ok: true, status: 200, text: async () => JSON.stringify({saved: 1790440274161, notes: [{b1: 1, q1: 1, b2: null, q2: null, text: "section: A"}]})});`);
  run(`
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}], tracks: [{name: "lead", notes: [{t: 0, d: 480, p: 72, v: 80}]}]};
    song.baseTempos = null; song.rawNotes = song.tracks.map(tr => tr.notes.map(n => ({...n})));
    songKey = "albums/compositions/nightroll/stamp-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    trackState = song.tracks.map(() => ({muted: false, solo: false}));
    keyRegions = []; previewSf = null; playCursor = 0; playRate = 1; rangeSel = null; loopSeg = null; rollnotes = [];
    localStorage.removeItem("ff1roll-notes-" + songKey); localStorage.removeItem("ff1roll-lastsync-" + songKey);
  `);
  await run(`loadNotes()`);
  assert.equal(run(`song.savedStamp`), 1790440274161, "the file's stamp is the draft's base");
  assert.equal(run(`rollnotes.some(n => n.section)`), true, "notes still load");
  run(`fetch = globalThis.__prevFetchS;`);
});

test("audio tracks: an unsynced audio: note survives a reload — local notes re-derive from text", async () => {
  run(`globalThis.__prevFetch2 = fetch; fetch = () => Promise.reject(new Error("no network"));`);
  run(`
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}],
            tracks: [{name: "lead", notes: [{t: 0, d: 480, p: 72, v: 80}]}, {name: "take", notes: []}]};
    song.baseTempos = null; song.rawNotes = song.tracks.map(tr => tr.notes.map(n => ({...n})));
    songKey = "albums/compositions/nightroll/audio-reload.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    trackState = song.tracks.map(() => ({muted: false, solo: false}));
    keyRegions = []; previewSf = null; playCursor = 0; playRate = 1; rangeSel = null; loopSeg = null;
    rollnotes = [];
    // what saveLocalNotes writes: text only, no derived fields
    localStorage.setItem("ff1roll-notes-" + songKey, JSON.stringify([
      {b1: 2, q1: 1, b2: null, q2: null, text: "audio: take file=take.wav offset=0.1"},
      {b1: 1, q1: 1, b2: null, q2: null, text: "track: lead voice=sf-piano"}]));
  `);
  await run(`loadNotes()`);
  assert.equal(run(`song.tracks[1].kind`), "audio");
  assert.equal(run(`song.tracks[1].clips[0].file`), "take.wav");
  assert.equal(run(`song.tracks[1].clips[0].at`), 4 * 480);
  assert.equal(run(`song.tracks[0].voice`), "sf-piano"); // track: directives came back too
  // the saved .mid comes back WITHOUT the note-less track (parseMidi keeps
  // only tracks with notes): the directive recreates it by name, once
  run(`song.tracks.splice(1, 1); song.rawNotes.splice(1, 1); trackState.splice(1, 1); finalizeNotes(); finalizeNotes();`);
  assert.equal(run(`song.tracks.length`), 2);
  assert.equal(run(`song.tracks[1].name`), "take");
  assert.equal(run(`song.tracks[1].kind`), "audio");
  assert.equal(run(`trackState.length`), 2);
  assert.equal(run(`song.rawNotes.length`), 2);
  run(`localStorage.removeItem("ff1roll-notes-" + songKey); song = null; songKey = null; rollnotes = []; fetch = globalThis.__prevFetch2;`);
});

test("audio import helpers: byte sniff, file slugs, mono WAV encoder", () => {
  const wav = new Uint8Array(12); wav.set([82, 73, 70, 70], 0); wav.set([87, 65, 86, 69], 8);
  app.context.__wav = wav;
  assert.equal(run(`audioMagic(__wav)`), true);
  const mid = new Uint8Array(12); mid.set([77, 84, 104, 100], 0);
  app.context.__mid = mid;
  assert.equal(run(`audioMagic(__mid)`), false);
  const m4a = new Uint8Array(12); m4a.set([102, 116, 121, 112], 4);
  app.context.__m4a = m4a;
  assert.equal(run(`audioMagic(__m4a)`), true);
  assert.equal(run(`slugFile("Guitar Take 2.M4A")`), "guitar-take-2.m4a");
  assert.equal(run(`slugFile("noext")`), "noext");
  app.context.__buf = {sampleRate: 8000, getChannelData: () => new Float32Array([0, 1, -1, 0.5])};
  const bytes = run(`monoWavBytes(__buf)`);
  assert.equal(bytes.length, 44 + 8);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...bytes.slice(8, 12)), "WAVE");
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  assert.equal(dv.getUint16(22, true), 1);      // mono
  assert.equal(dv.getUint32(24, true), 8000);   // sample rate
  assert.equal(dv.getInt16(46, true), 32767);   // +1.0
  assert.equal(dv.getInt16(48, true), -32768);  // −1.0
  app.context.__wavProbe = bytes;
  assert.equal(run(`audioMagic(__wavProbe)`), true);
  // onset: first peak bucket over the floor → seconds (256 samples per bucket)
  const peaks = new Float32Array(20 * 2); // 20 buckets, silence until bucket 8
  for (let k = 8; k < 20; k++) { peaks[k * 2] = -0.5; peaks[k * 2 + 1] = 0.5; }
  peaks[3 * 2 + 1] = 0.01; // sub-floor noise does not count
  app.context.__clip = { peaks, buffer: { sampleRate: 25600 }, dur: 1 };
  assert.equal(run(`clipOnsetSec(__clip)`), 0.08); // 8 × 256 / 25600
  assert.equal(run(`clipOnsetSec({peaks: null, buffer: null})`), null);
  // tempo from peaks: a synthetic take with a hit every 0.5s (120 BPM), decaying, ~12s long
  const bucketSec = 256 / 48000, nbk = Math.round(12 / bucketSec);
  const pk = new Float32Array(nbk * 2);
  for (let k = 0; k < nbk; k++) {
    const t = k * bucketSec, since = t % 0.5;
    const a = since < 0.02 ? 0.9 : 0.05 + 0.4 * Math.exp(-since * 8) * (0.9 + 0.2 * Math.sin(k)); // attack, tail, a little texture
    pk[k * 2] = -a; pk[k * 2 + 1] = a;
  }
  app.context.__pk = pk;
  const t120 = run(`tempoFromPeaks(__pk, ${bucketSec}, 0, 12)`);
  assert.ok(Math.abs(t120.bpm - 120) < 1.5, "read " + t120.bpm);
  assert.ok(t120.conf > 0.18, "confidence " + t120.conf);
  assert.equal(Array.from(t120.alts).map(Math.round).join(","), "60,240"); // cross-realm array: compare by value
  // the same take through a piece window of 6s reads the same
  const half = run(`tempoFromPeaks(__pk, ${bucketSec}, 3, 9)`);
  assert.ok(Math.abs(half.bpm - 120) < 1.5, "windowed read " + half.bpm);
  // too short, and silence, both say why instead of guessing
  assert.match(run(`tempoFromPeaks(__pk, ${bucketSec}, 0, 2).err`), /too short/);
  app.context.__flat = new Float32Array(nbk * 2);
  assert.match(run(`tempoFromPeaks(__flat, ${bucketSec}, 0, 12).err`), /no beats/);
});

test("wsolaStretch: half speed doubles the length and keeps the pitch; double speed halves it", () => {
  const sr = 8000, n = sr * 1, sine = new Float32Array(n);
  for (let i = 0; i < n; i++) sine[i] = Math.sin(2 * Math.PI * 440 * i / sr);
  const crossings = a => { let c = 0; for (let i = 1; i < a.length; i++) if ((a[i - 1] < 0) !== (a[i] < 0)) c++; return c; };
  const rms = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); };
  app.context.__sine = sine;
  const half = run(`wsolaStretch(__sine, 0.5)`);
  assert.ok(Math.abs(half.length - 2 * n) <= 2, "length " + half.length);
  const zc = crossings(half); // 440 Hz over 2 s = 1760 zero crossings; tape-style would give 880
  assert.ok(zc > 1650 && zc < 1850, "zero crossings at half speed: " + zc);
  assert.ok(Math.abs(rms(half) - rms(sine)) < 0.08, "level kept: " + rms(half));
  const dbl = run(`wsolaStretch(__sine, 2)`);
  assert.ok(Math.abs(dbl.length - n / 2) <= 2, "length " + dbl.length);
  const zc2 = crossings(dbl); // 0.5 s of 440 Hz = 440 crossings
  assert.ok(zc2 > 400 && zc2 < 480, "zero crossings at double speed: " + zc2);
  assert.equal(run(`wsolaStretch(__sine, 1).length`), n); // rate 1 = a copy
  assert.equal(run(`keepPitch()`), true); // default: pitch kept
});

test("beat map: a take that speeds up 100→112 BPM over 16 bars gets a rising tempo per bar", () => {
  // synthetic 4/4 take: beats whose spacing shrinks steadily; downbeats accented; ~4 ms peak buckets
  const sr = 48000, bucketSec = 256 / sr;
  const beats = []; let t = 0.0, bpm = 100;
  for (let i = 0; i < 16 * 4 + 1; i++) { beats.push(t); t += 60 / bpm; bpm += 12 / 64; }
  const total = t + 0.5, nbk = Math.ceil(total / bucketSec);
  const pk = new Float32Array(nbk * 2);
  for (let k = 0; k < nbk; k++) {
    const tt = k * bucketSec;
    let a = 0.04;
    for (let i = 0; i < beats.length; i++) { const d = tt - beats[i]; if (d >= 0 && d < 0.25) a = Math.max(a, (i % 4 === 0 ? 0.95 : 0.6) * Math.exp(-d * 10)); }
    pk[k * 2] = -a; pk[k * 2 + 1] = a;
  }
  app.context.__bpk = pk;
  run(`
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}], tracks: [{name: "lead", notes: [{t: 0, d: 480, p: 60, v: 80}]}, {name: "take", notes: []}]};
    song.baseTempos = null; song.rawNotes = song.tracks.map(tr => tr.notes.map(n => ({...n})));
    songKey = "albums/compositions/nightroll/beatmap-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    trackState = song.tracks.map(() => ({muted: false, solo: false}));
    keyRegions = []; previewSf = null; playCursor = 0; playRate = 1; rangeSel = null; loopSeg = null; editUndo = [];
    rollnotes = parseRollnotes("[1.1]\\naudio: take file=t.wav\\n").map(resolveNote); finalizeNotes();
    { // block: top-level const would persist in the vm's global lexical scope and collide with other tests
      const bme = audioBufCache.get(audioCacheKey("t.wav")); bme.dur = ${total}; bme.status = "ready"; bme.peaks = __bpk; bme.buffer = {duration: ${total}, sampleRate: ${sr}};
      Object.assign(song.tracks[1].clips[0], {dur: ${total}, status: "ready", peaks: __bpk, buffer: bme.buffer});
    }
  `);
  const m = run(`clipBeatMap(song.tracks[1].clips[0])`);
  assert.ok(!m.err, "map error: " + m.err);
  assert.ok(m.bars.length >= 14 && m.bars.length <= 16, "bars found: " + m.bars.length);
  assert.ok(m.firstBeatSec < 0.05, "first downbeat at the start: " + m.firstBeatSec);
  const bpms = Array.from(m.bars).map(b => b.bpm);
  assert.ok(Math.abs(bpms[0] - 100.7) < 2.5, "first bar ≈ 100–101: " + bpms[0]);
  assert.ok(Math.abs(bpms[bpms.length - 1] - 111) < 3, "last bar ≈ 111: " + bpms[bpms.length - 1]);
  assert.ok(bpms[bpms.length - 1] > bpms[0] + 6, "it rises");
  assert.equal(m.offBars, 0);
  // apply: one tempo: per bar from the piece's bar, one undo; the map has that many segments
  assert.equal(run(`applyBeatMap(1, 0, clipBeatMap(song.tracks[1].clips[0]))`), null);
  assert.equal(val(`rollnotes.filter(n => n.tempodir !== undefined).length`), m.bars.length);
  assert.equal(run(`song.tempos.length`), m.bars.length);
  assert.equal(run(`editUndo.length`), 1);
  // bar 2's line lands where the take's second downbeat is (within a peak bucket or two)
  const bar2sec = run(`tickToSec(song, 4 * 480)`);
  assert.ok(Math.abs(bar2sec - beats[4]) < 0.015, "bar 2 at " + bar2sec + " vs downbeat " + beats[4]);
  const bar9sec = run(`tickToSec(song, 8 * 4 * 480)`);
  assert.ok(Math.abs(bar9sec - beats[32]) < 0.04, "bar 9 at " + bar9sec + " vs downbeat " + beats[32]);
  // a piece off the bar line is refused with a reason
  run(`song.tracks[1].clips[0].at = 480;`);
  assert.match(run(`applyBeatMap(1, 0, clipBeatMap(song.tracks[1].clips[0]))`), /bar line/);
  run(`song = null; songKey = null; rollnotes = []; editUndo = []; audioBufCache.clear();`);
});

test("setSongTempo writes the 1.1 tempo annotation on a composition, one undo, captures refused", () => {
  run(`
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}], tracks: [{name: "lead", notes: [{t: 0, d: 480, p: 60, v: 80}]}]};
    song.baseTempos = null; song.rawNotes = song.tracks.map(tr => tr.notes.map(n => ({...n})));
    songKey = "albums/compositions/nightroll/tempo-from-take.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    trackState = song.tracks.map(() => ({muted: false, solo: false}));
    keyRegions = []; previewSf = null; playCursor = 0; playRate = 1; rangeSel = null; loopSeg = null; editUndo = [];
    rollnotes = parseRollnotes("[1.1]\\ntempo: 100\\n").map(resolveNote); finalizeNotes();
  `);
  assert.equal(run(`song.tempos[0].usq`), 600000);
  assert.equal(run(`setSongTempo(92.3)`), true);
  assert.equal(run(`song.tempos[0].usq`), Math.round(6e7 / 92.3));
  assert.equal(val(`rollnotes.filter(n => n.tempodir !== undefined).map(n => n.text)`).length, 1); // replaced, not stacked
  assert.equal(run(`rollnotes.find(n => n.tempodir !== undefined).text`), "tempo: 92.3");
  assert.equal(run(`editUndo.length`), 1);
  run(`songKey = "albums/nes/final-fantasy-i/songs/overworld.mid";`);
  assert.equal(run(`setSongTempo(120)`), false); // measured captures keep their tempo
  run(`song = null; songKey = null; rollnotes = []; editUndo = [];`);
});

test("local MIDI imports persist as device drafts: editable, drums intact, never synced", () => {
  installSong();
  run(`
    songKey = "local/some-song.mid";
    song.tracks = [{name: "kit", notes: [{t: 0, d: 480, p: 38, v: 90, ch: 9}]}];
    saveDraft();
  `);
  const d = JSON.parse(app.store.get("ff1roll-draft-local/some-song.mid"));
  assert.equal(d.tracks[0].notes[0].ch, 9); // drum channel survives the draft round-trip
  assert.equal(run(`isLocalDraft()`), true); // pencil editing allowed
  assert.equal(run(`isComposition()`), false); // but Save (commit) stays locked
  run(`localStorage.setItem("ff1roll-notes-local/some-song.mid", "[]");`);
  assert.equal(val(`dirtySongs()`).includes("local/some-song.mid"), false); // no repo path — never syncs
  run(`
    songKey = null;
    localStorage.removeItem("ff1roll-draft-local/some-song.mid");
    localStorage.removeItem("ff1roll-notes-local/some-song.mid");
  `);
});

test("NSF import rename: draft moves, typed title survives, collisions refused", () => {
  run(`
    localStorage.setItem("ff1roll-draft-albums/imports/mm2/track-15.mid", JSON.stringify({title: "track-15", tracks: []}));
    localStorage.setItem("ff1roll-notes-albums/imports/mm2/track-15.mid", "[]");
    localStorage.setItem("ff1roll-draft-albums/imports/mm2/track-16.mid", JSON.stringify({title: "track-16", tracks: []}));
  `);
  assert.equal(run(`renameImportDraft("albums/imports/mm2/track-15.mid", "Dr. Wily's Castle")`),
               "albums/imports/mm2/dr-wily-s-castle.mid");
  const d = JSON.parse(app.store.get("ff1roll-draft-albums/imports/mm2/dr-wily-s-castle.mid"));
  assert.equal(d.title, "Dr. Wily's Castle"); // punctuation intact for the dropdown
  assert.equal(app.store.get("ff1roll-draft-albums/imports/mm2/track-15.mid"), undefined);
  assert.equal(app.store.get("ff1roll-notes-albums/imports/mm2/dr-wily-s-castle.mid"), "[]"); // stash rides along
  // display titles: typed names verbatim, bare slugs prettified
  assert.equal(run(`impDisplayTitle({title: "Dr. Wily's Castle"}, "dr-wily-s-castle")`), "Dr. Wily's Castle");
  assert.equal(run(`impDisplayTitle({title: "airship"}, "airship")`), "Airship");
  assert.equal(run(`impDisplayTitle(null, "track-07")`), "Track 07");
  // collision: another captured track already owns the name
  assert.equal(run(`renameImportDraft("albums/imports/mm2/track-16.mid", "dr wily s castle")`), null);
  run(`
    for (const k of Object.keys(localStorage).filter(k => k.includes("albums/imports/mm2/")))
      localStorage.removeItem(k);
  `);
});

// ff1.nsf lives in the private vault, not this repo — CI runners skip; the
// full pipeline still runs on any checkout that has fetched it (the planned
// existsSync gate from the data-locations work)
const FF1_NSF = new URL("../albums/nes/final-fantasy-i/reference/ff1.nsf", import.meta.url);
test("NSF import: in-app capture runs the real pipeline and round-trips through parseMidi",
     { skip: !existsSync(FF1_NSF) && "ff1.nsf not present (vault-only)" }, async () => {
  // same modules the browser dynamically imports, wired into the vm realm
  const M = {
    ...(await import("../tools/nsf/nsf.mjs")),
    ...(await import("../tools/nsf/notes.mjs")),
    ...(await import("../tools/nsf/midi-write.mjs")),
  };
  const nsf = M.parseNSF(readFileSync(FF1_NSF));
  app.context.__M = M;
  app.context.__nsf = nsf;
  // track 17 = menu: known 8-bar loop, quick to run. captureNsfTrack is
  // async (the runner yields so iOS Safari's watchdog doesn't kill the tab);
  // the vm shares node's event loop, so await its promise from out here
  run(`__capP = captureChipTrack("nsf", __M, __nsf, 17, 35).then(cap => {
    const parsed = parseMidi(new Uint8Array(cap.bytes).buffer);
    __cap = {looped: cap.looped, bpm: cap.bpm, secs: cap.secs,
             anchor: cap.loopAnchor, target: cap.loopTarget,
             tracks: parsed.tracks.length,
             notes: parsed.tracks.reduce((a, t) => a + t.notes.length, 0)};
  })`);
  await app.context.__capP;
  const got = val(`__cap`);
  assert.equal(got.looped, true, "menu loops on hardware");
  assert.ok(got.bpm > 60 && got.bpm < 300, "grid fit found a sane tempo: " + got.bpm);
  assert.ok(got.secs > 5 && got.secs < 35, "trimmed to intro + one pass");
  assert.ok(got.tracks >= 3, "conductor + chip voices"); // conductor + pulses/triangle
  assert.ok(got.notes > 50, "melody actually captured: " + got.notes + " notes");
});

test("chip render: a silent render is detected; a render for a song no longer open is not published", () => {
  assert.equal(val(`chipSilent([new Float32Array(48000), new Float32Array(1000)])`), true);
  const loud = new Float32Array(48000); loud[13 * 7] = 0.2; // on the subsampling stride
  assert.equal(val(`(() => { const a = new Float32Array(48000); a[91] = 0.2; return chipSilent([new Float32Array(100), a]); })()`), false);
  void loud;
  // the source reads the song it started for: chipRender stamps forKey, never the song current at the end
  const src = val(`chipRender.toString() + chipPublish.toString()`);
  assert.ok(/const forKey = songKey/.test(src) && /chip\.key = forKey/.test(src) && !/chip\.key = songKey/.test(src), "chip.key comes from forKey");
  assert.ok(/songKey !== forKey/.test(src), "a stale render is discarded");
  assert.equal(val(`chipWorkerAvailable()`), false, "the vm has no Worker: the inline path stays"); // the browser path is verified in Chrome
});

test("big drafts: an import's notes go to IndexedDB behind a stub; reads restore them; a full localStorage never throws out of saveDraft", async () => {
  // the vm has no indexedDB: stand one in, and fake the store the helpers use
  run(`globalThis.indexedDB = {}; __idb = {};
       idbDraftPut = (k, t) => { __idb[k] = t; return Promise.resolve(); };
       idbDraftGet = k => Promise.resolve(__idb[k] || null);
       idbDraftDelete = k => { delete __idb[k]; return Promise.resolve(); };
       idbDraftMove = (a, b) => { if (__idb[a]) { __idb[b] = __idb[a]; delete __idb[a]; } return Promise.resolve(); };`);
  const doc = {savedStamp: 0, dirty: true, title: "Frog's Theme", ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}], tracks: [{name: "voice0", notes: [{t: 0, d: 480, p: 60, v: 100}]}]};
  run(`draftWrite("albums/snes/chrono-trigger/frog-s-theme.mid", ${JSON.stringify(doc)});`);
  const stub = JSON.parse(val(`localStorage.getItem(draftStoreKey("albums/snes/chrono-trigger/frog-s-theme.mid"))`));
  assert.equal(stub.tracksRef, 1); assert.equal(stub.tracks, undefined, "no notes in localStorage"); assert.equal(stub.title, "Frog's Theme");
  assert.equal(val(`__idb["albums/snes/chrono-trigger/frog-s-theme.mid"][0].notes.length`), 1);
  run(`__rd = null; draftRead("albums/snes/chrono-trigger/frog-s-theme.mid").then(d => { __rd = d; });`);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(val(`__rd.tracks[0].notes[0].p`), 60, "draftRead restores the notes");
  // his own compositions stay whole in localStorage
  run(`draftWrite("albums/compositions/nightroll/x.mid", ${JSON.stringify(doc)});`);
  assert.equal(JSON.parse(val(`localStorage.getItem(draftStoreKey("albums/compositions/nightroll/x.mid"))`)).tracks.length, 1);
  // an old inline import draft still reads
  run(`localStorage.setItem(draftStoreKey("albums/imports/old/a.mid"), ${JSON.stringify(JSON.stringify(doc))}); __rd2 = null; draftRead("albums/imports/old/a.mid").then(d => { __rd2 = d; });`);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(val(`__rd2.tracks.length`), 1);
  // rename moves the notes; delete drops them
  run(`renameImportDraft("albums/snes/chrono-trigger/frog-s-theme.mid", "Frog");`);
  assert.equal(val(`!!__idb["albums/snes/chrono-trigger/frog.mid"]`), true, "notes followed the rename");
  assert.equal(val(`!!__idb["albums/snes/chrono-trigger/frog-s-theme.mid"]`), false);
  // saveDraft with a full store: says so, does not throw
  installSong();
  run(`songKey = "albums/compositions/nightroll/full.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */ const realSet = localStorage.setItem.bind(localStorage);
       localStorage.setItem = (k, v) => { if (k.startsWith("ff1roll-draft-")) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } return realSet(k, v); };
       __threw = false; try { saveDraft(); } catch (e) { __threw = true; } localStorage.setItem = realSet;`);
  assert.equal(val(`__threw`), false, "saveDraft swallowed the quota error");
  assert.match(val(`appErrors.map(e => e.msg).join(" ")`), /storage is full/);
  run(`delete globalThis.indexedDB; localStorage.removeItem(draftStoreKey("albums/compositions/nightroll/x.mid")); localStorage.removeItem(draftStoreKey("albums/imports/old/a.mid")); localStorage.removeItem(draftStoreKey("albums/snes/chrono-trigger/frog.mid"));`);
});

test("VGM import: a Genesis log goes through the capture path; gz sniff by name; the header's loop point becomes the loop annotation", async () => {
  const vg = await import("../tools/vgm/notes.mjs");
  const M = {...(await import("../tools/vgm/vgm.mjs")), ...vg, ...(await import("../tools/nsf/notes.mjs")), ...(await import("../tools/nsf/midi-write.mjs")), reconstruct: vg.reconstruct, toNotesTxt: vg.toNotesTxt};
  const {makeTestVGM} = await import("../tools/vgm/make-test-vgm.mjs");
  const bytes = makeTestVGM();
  assert.equal(val(`chipKindOf(new Uint8Array(${JSON.stringify([...bytes.subarray(0, 16)])}), "01 - Title.vgm")`), "vgm");
  assert.equal(val(`chipKindOf(new Uint8Array([0x1F, 0x8B, 8, 0, 0, 0, 0, 0, 0, 3, 1, 2]), "02 - Green Hill Zone.vgz")`), "vgm", "a gzipped .vgz is recognised by its name");
  assert.equal(val(`chipKindOf(new Uint8Array([0x1F, 0x8B, 8, 0, 0, 0, 0, 0, 0, 3, 1, 2]), "notes.gz")`), null);
  assert.equal(val(`CHIPS.vgm.perFile && CHIPS.vgm.tagged`), true);
  app.context.__M = M;
  app.context.__vgm = await (async () => { const v = M.parseVGM(await M.inflateVGM(bytes)); v.name = ""; v.tags = {seconds: Math.round(v.endSample / 44100)}; return v; })();
  run(`__capP = captureChipTrack("vgm", __M, __vgm, 1, 30).then(cap => {
    const parsed = parseMidi(new Uint8Array(cap.bytes).buffer);
    __cap = {bpm: cap.bpm, secs: cap.secs, looped: cap.looped, anchor: cap.loopAnchor, target: cap.loopTarget, names: parsed.tracks.map(t => t.name),
             notes: parsed.tracks.reduce((a, t) => a + t.notes.length, 0), pitches: parsed.tracks.flatMap(t => t.notes.map(n => n.p))};
  })`);
  await app.context.__capP;
  const got = val(`__cap`);
  assert.ok(got.names.some(n => /^fm1$/.test(n)), "FM channels are tracks: " + got.names.join(","));
  assert.ok([60, 64, 67, 72].every(p => got.pitches.includes(p)), "the C4 E4 G4 C5 line: " + got.pitches.join(","));
  assert.ok(got.bpm > 60 && got.bpm < 300, "sane tempo: " + got.bpm);
});

test("PSF import: a minipsf + psflib set captures through the sequence reader; a missing lib is named; trusted MIDI keeps long rests", async () => {
  const M = {...(await import("../tools/psx/capture.mjs")), ...(await import("../tools/psx/psf.mjs")), ...(await import("../tools/psx/akao.mjs")), ...(await import("../tools/psx/seq.mjs")), ...(await import("../tools/psx/vab.mjs")), ...(await import("../tools/psx/notes.mjs")), ...(await import("../tools/sounding.mjs")), ...(await import("../tools/note-preview.mjs"))};
  const T = await import("../tools/psx/make-test-seq.mjs");
  const akao = T.makeTestAKAO({voices: {0: [0xA5, 5, 0x02, 0xA0]}}); // one voice: octave, a note, end
  const {lib, mini} = T.makeTestMiniPSF(akao, {title: "Test Tune"});
  assert.equal(val(`chipKindOf(new Uint8Array(${JSON.stringify([...mini.subarray(0, 12)])}), "101 Test.minipsf")`), "psf");
  assert.equal(val(`CHIPS.psf.libFile("Final Fantasy 7.psflib") && !CHIPS.psf.libFile("101 The Prelude.minipsf")`), true);
  app.context.__M = M;
  app.context.__mini = mini; app.context.__lib = lib; app.context.__libName = T.TEST_LIB_NAME;
  run(`__pP = CHIPS.psf.parseAsync(__M)(__mini, "101 Test.minipsf").then(p => { __parsed = p; });`);
  await app.context.__pP;
  assert.equal(val(`__parsed.name`), "Test Tune"); assert.deepEqual(val(`__parsed.libs`), [T.TEST_LIB_NAME]);
  // without the lib: a named error, no crash
  run(`__e1 = null; CHIPS.psf.capture(__M, __parsed, 0, () => {}, {libs: {}}).catch(e => { __e1 = String(e.message); });`);
  await new Promise(r => setTimeout(r, 200));
  assert.match(val(`__e1`), /needs its library file Test Game\.psflib/);
  // with the lib: a MIDI with the melody
  run(`__cap = null; __e2 = null; CHIPS.psf.capture(__M, __parsed, 0, () => {}, {libs: {[__libName.toLowerCase()]: {bytes: __lib}}}).then(c => { const parsed = parseMidi(new Uint8Array(c.bytes).buffer, {trust: true}); __cap = {bpm: c.bpm, secs: c.secs, looped: c.looped, notes: parsed.tracks.reduce((a, t) => a + t.notes.length, 0), tracks: parsed.tracks.length}; }).catch(e => { __e2 = String(e.stack || e); });`);
  await new Promise(r => setTimeout(r, 1500));
  assert.equal(val(`__e2`), null, "capture threw: " + val(`__e2`));
  const got = val(`__cap`);
  assert.ok(got && got.notes > 0, "notes from the AKAO sequence: " + JSON.stringify(got));
  assert.ok(got.bpm > 30 && got.bpm < 300, "tempo from the sequence: " + got.bpm);
  // the trust flag keeps a 41-bar rest that the corrupt-file guard would cut
  const ppq = 480; const far = 41 * 4 * ppq;
  const smf = (() => { const vlq = n => { const b = [n & 0x7F]; while ((n >>= 7) > 0) b.unshift((n & 0x7F) | 0x80); return b; }; const body = [0, 0x90, 60, 100, ...vlq(240), 0x80, 60, 0, ...vlq(far), 0x90, 64, 100, ...vlq(240), 0x80, 64, 0, 0, 0xFF, 0x2F, 0]; const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255]; return [0x4D, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, ppq >> 8, ppq & 255, 0x4D, 0x54, 0x72, 0x6B, ...u32(body.length), ...body]; })();
  assert.equal(val(`parseMidi(new Uint8Array(${JSON.stringify(smf)}).buffer).tracks[0].notes.length`), 1, "the guard cuts after a 41-bar rest by default");
  assert.equal(val(`parseMidi(new Uint8Array(${JSON.stringify(smf)}).buffer, {trust: true}).tracks[0].notes.length`), 2, "trusted: both notes survive");
});

test("PS2 import: a minipsf2 + psf2lib set (Sony's stock SQ/HD/BD driver) captures through ps2Song; a missing lib is named; Square's own BGM/WD driver captures too (milestone 3)", async () => {
  const M = {
    ...(await import("../tools/ps2/capture.mjs")), ...(await import("../tools/ps2/psf2.mjs")),
    ...(await import("../tools/ps2/sq.mjs")), ...(await import("../tools/ps2/hd.mjs")),
    ...(await import("../tools/ps2/bgm.mjs")), ...(await import("../tools/ps2/wd.mjs")),
    ...(await import("../tools/psx/vab.mjs")), ...(await import("../tools/psx/notes.mjs")),
    ...(await import("../tools/sounding.mjs")), ...(await import("../tools/note-preview.mjs")),
  };
  const T = await import("../tools/ps2/make-test-sq.mjs");
  const sq = T.makeTestSQ();
  const hd = T.makeTestHD();
  const bd = new Uint8Array(32);
  const LIB_NAME = "test.psf2lib";
  const lib = T.makePSF2(T.buildPSF2Fs([T.fileNode("TESTSEQ.SQ", sq), T.fileNode("TESTBANK.HD", hd), T.fileNode("TESTBANK.BD", bd)]), {game: "Test"});
  const ini = "sq.irx -r=3 -d=4096 -s=TESTSEQ.SQ -h=TESTBANK.HD -b=TESTBANK.BD\r\n";
  const mini = T.makePSF2(T.buildPSF2Fs([T.fileNode("psf2.ini", new TextEncoder().encode(ini))]), {_lib: LIB_NAME, title: "Test Tune 2", length: "0:04"});
  assert.equal(val(`chipKindOf(new Uint8Array(${JSON.stringify([...mini.subarray(0, 12)])}), "song.psf2")`), "psf2");
  assert.equal(val(`chipKindOf(new Uint8Array([0x50, 0x53, 0x46, 0x01, 0, 0, 0, 0, 0, 0, 0, 0]), "x.minipsf")`), "psf", "PS1 stays PS1 (version byte 0x01)");
  assert.equal(val(`CONSOLE_OF.psf2`), "ps2");
  assert.equal(val(`CHIPS.psf2.libFile(${JSON.stringify(LIB_NAME)}) && !CHIPS.psf2.libFile("song.psf2")`), true);
  assert.equal(val(`CHIPS.psf2.renderRate`), 48000);
  assert.equal(run(`typeof CHIPS.psf2.render`), "function", "PS2 renders through the same renderSpu as PS1 — no PS2-specific chip audio code");
  app.context.__M = M;
  app.context.__mini = mini; app.context.__lib = lib;
  run(`__pP = CHIPS.psf2.parseAsync(__M)(__mini, "song.psf2").then(p => { __parsed = p; });`);
  await app.context.__pP;
  assert.equal(val(`__parsed.name`), "Test Tune 2");
  assert.deepEqual(val(`__parsed.libs`), [LIB_NAME]);
  // without the lib: a named error, no crash
  run(`__e1 = null; CHIPS.psf2.capture(__M, __parsed, 0, () => {}, {libs: {}}).catch(e => { __e1 = String(e.message); });`);
  await new Promise(r => setTimeout(r, 200));
  assert.match(val(`__e1`), new RegExp(`needs its library file ${LIB_NAME.replace(".", "\\.")}`));
  // with the lib: a MIDI with the melody, through the SQ/HD/BD path exactly as a real Dark Cloud song
  app.context.__libName = LIB_NAME;
  run(`__cap = null; __e2 = null; CHIPS.psf2.capture(__M, __parsed, 0, () => {}, {libs: {[__libName.toLowerCase()]: {bytes: __lib}}}).then(c => { const parsed = parseMidi(new Uint8Array(c.bytes).buffer); __cap = {bpm: c.bpm, secs: c.secs, looped: c.looped, notes: parsed.tracks.reduce((a, t) => a + t.notes.length, 0), tracks: parsed.tracks.length}; }).catch(e => { __e2 = String(e.stack || e); });`);
  await new Promise(r => setTimeout(r, 1500));
  assert.equal(val(`__e2`), null, "capture threw: " + val(`__e2`));
  const got = val(`__cap`);
  assert.ok(got && got.notes === T.TEST_SQ_NOTES.length, "notes from the SQ sequence: " + JSON.stringify(got));
  assert.equal(got.bpm, 120);
  assert.equal(got.looped, true, "cc99 0/1 loop points became the loop");
  // Square Enix's own driver (a .bgm + .wd pair, found directly in the mini's
  // own filesystem, no ini needed) — milestone 3: captures through the SAME
  // app path, no PS2-specific branch beyond driver detection
  const TB = await import("../tools/ps2/make-test-bgm.mjs");
  const bgmMini = T.makePSF2(T.buildPSF2Fs([
    T.fileNode("song007.bgm", TB.makeTestBGM()), T.fileNode("bank007.wd", TB.makeTestWD()),
  ]), {title: "FFX Song"});
  app.context.__bgmMini = bgmMini;
  run(`__pP2 = CHIPS.psf2.parseAsync(__M)(__bgmMini, "ffx.psf2").then(p => { __bgmParsed = p; });`);
  await app.context.__pP2;
  run(`__cap2 = null; __e3 = null; CHIPS.psf2.capture(__M, __bgmParsed, 0, () => {}, {libs: {}}).then(c => { const parsed = parseMidi(new Uint8Array(c.bytes).buffer); __cap2 = {bpm: c.bpm, looped: c.looped, notes: parsed.tracks.reduce((a, t) => a + t.notes.length, 0)}; }).catch(e => { __e3 = String(e.stack || e); });`);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(val(`__e3`), null, "capture threw: " + val(`__e3`));
  const got2 = val(`__cap2`);
  // +1: the fixture's pitch bend lands inside its third note, and
  // splitSlides() (tools/psx/notes.mjs, reused unmodified) writes a bent
  // note as one MIDI note per landed pitch — the SAME mechanism AKAO's own
  // pitch slides already use, honoring BGM's 0x5C exactly as intended
  assert.ok(got2 && got2.notes === TB.TEST_BGM_NOTES.length + 1, "notes from the BGM sequence (raw notes + 1 for the pitch-bend split): " + JSON.stringify(got2));
  assert.equal(got2.bpm, 100);
  assert.equal(got2.looped, true, "0x02/0x03 loop markers became the loop");
});

test("PS2: streamed-audio containers (Ico's GENH, XIII's SShd) are recognised by name, not offered to the MIDI/chip parsers", () => {
  const genh = new Uint8Array([0x47, 0x45, 0x4E, 0x48, 2, 0, 0, 0]); // "GENH"
  const sshd = new Uint8Array([0x53, 0x53, 0x68, 0x64, 0x18, 0, 0, 0]); // "SShd"
  assert.equal(val(`streamedAudioMagic(new Uint8Array(${JSON.stringify([...genh])}))`), true);
  assert.equal(val(`streamedAudioMagic(new Uint8Array(${JSON.stringify([...sshd])}))`), true);
  assert.equal(val(`streamedAudioMagic(new Uint8Array(${JSON.stringify([...genh])}).subarray(0, 3))`), false, "too short to carry the magic");
  assert.equal(val(`chipKindOf(new Uint8Array(${JSON.stringify([...genh])}), "03 - Impression.GENH")`), null, "not any chip format — the streamed-audio check runs first in openPickedFiles");
});

test("USF import: the N64 chip is a sequence chip with its own capture; PSF 0x21 sniff; lib file", () => {
  assert.equal(val(`chipKindOf(new Uint8Array([0x50, 0x53, 0x46, 0x21, 0, 0, 0, 0, 0, 0, 0, 0]), "01 Title.miniusf")`), "usf");
  assert.equal(val(`chipKindOf(new Uint8Array([0x50, 0x53, 0x46, 0x01, 0, 0, 0, 0, 0, 0, 0, 0]), "x.minipsf")`), "psf", "PS1 stays PS1");
  assert.equal(val(`CHIPS.usf.libFile("NUS-NSME-USA.usflib") && !CHIPS.usf.libFile("01 Title.miniusf")`), true);
  assert.equal(val(`typeof CHIPS.usf.capture`), "function");
  assert.equal(val(`CHIPS.usf.keepBytes`), true, "the mini per track persists: chip audio outlives the session");
  assert.equal(run(`typeof CHIPS.usf.render`), "function", "the N64 renders the game's bank");
  assert.equal(val(`CHIPS.usf.renderRate`), 32000);
});

test("chip vault meta: one file per album for NSF/GBS, a folder of per-track files for SNES", () => {
  assert.deepEqual(val(`chipVaultMeta("tmnt", "nsf")`), {vault: "tmnt.nsf", tracks: {}});
  assert.deepEqual(val(`chipVaultMeta("ffl", "gbs")`), {vault: "ffl.gbs", tracks: {}, chip: "gbs"});
  assert.deepEqual(val(`chipVaultMeta("chrono-trigger", "spc")`), {vault: "chrono-trigger/", tracks: {}, chip: "spc", perFile: true});
  assert.equal(val(`chipVaultFile({vault: "chrono-trigger/", chip: "spc", perFile: true}, "frog-s-theme")`), "chrono-trigger/frog-s-theme.spc");
  assert.equal(val(`chipVaultFile({vault: "tmnt.nsf"}, "x")`), "tmnt.nsf");
  assert.deepEqual(val(`CHIPS.spc.channels`), ["voice0", "voice1", "voice2", "voice3", "voice4", "voice5", "voice6", "voice7"]);
});

test("SPC import: a Super Nintendo set (one file per track) goes through the capture path; rows order by disc/track", async () => {
  const sp = await import("../tools/spc/notes.mjs");
  const M = {...(await import("../tools/spc/spc.mjs")), ...sp, ...(await import("../tools/nsf/notes.mjs")), ...(await import("../tools/nsf/midi-write.mjs")), reconstruct: sp.reconstruct, toNotesTxt: sp.toNotesTxt};
  const {makeTestSPC} = await import("../tools/spc/make-test-spc.mjs");
  const bytes = makeTestSPC();
  assert.equal(val(`chipKindOf(new Uint8Array(${JSON.stringify([...bytes.subarray(0, 40)])}))`), "spc");
  assert.equal(val(`CHIPS.spc.perFile`), true);
  app.context.__M = M;
  app.context.__spc = M.parseSPC(bytes);
  run(`chipModules.cache = Object.assign(chipModules.cache || {}, {spc: __M});`); // what the browser would have loaded
  const order = JSON.parse(val(`JSON.stringify(chipTrackOrder([{name: "999 Unused.spc"}, {name: "216 Frog's Theme.spc"}, {name: "101a Presentiment.spc"}, {name: "105 Peaceful Days.spc"}, {name: "101b Presentiment (part 2).spc"}]).map(f => f.name))`));
  assert.deepEqual(order, ["101a Presentiment.spc", "101b Presentiment (part 2).spc", "105 Peaceful Days.spc", "216 Frog's Theme.spc", "999 Unused.spc"]);
  run(`__capP = captureChipTrack("spc", __M, __spc, 1, 10).then(cap => {
    const parsed = parseMidi(new Uint8Array(cap.bytes).buffer);
    __cap = {bpm: cap.bpm, secs: cap.secs, names: parsed.tracks.map(t => t.name), notes: parsed.tracks.reduce((a, t) => a + t.notes.length, 0),
             pitches: parsed.tracks.flatMap(t => t.notes.map(n => n.p))};
  })`);
  await app.context.__capP;
  const got = val(`__cap`);
  assert.ok(got.names.includes("voice0"), "SNES voices are tracks: " + got.names.join(","));
  assert.ok(got.notes >= 4, "the C4 E4 G4 C5 line: " + got.notes);
  assert.ok([60, 64, 67, 72].every(p => got.pitches.includes(p)), "pitches from the root estimate: " + got.pitches.join(","));
  assert.ok(got.bpm > 60 && got.bpm < 300, "sane tempo: " + got.bpm);
});

test("GBS import: the Game Boy chip goes through the same capture path (synthetic GBS, wave track, chip descriptor)", async () => {
  const gb = await import("../tools/gbs/notes.mjs");
  const M = { // the browser's merge: shared NSF stages win, the chip keeps its own reconstruct
    ...(await import("../tools/gbs/gbs.mjs")), ...gb,
    ...(await import("../tools/nsf/notes.mjs")), ...(await import("../tools/nsf/midi-write.mjs")),
    reconstruct: gb.reconstruct, toNotesTxt: gb.toNotesTxt,
  };
  const {makeTestGBS} = await import("../tools/gbs/make-test-gbs.mjs");
  const bytes = makeTestGBS();
  assert.equal(val(`chipKindOf(new Uint8Array(${JSON.stringify([...bytes.subarray(0, 16)])}))`), "gbs");
  assert.equal(val(`chipKindOf(new Uint8Array([0x4E,0x45,0x53,0x4D,0x1A,1,1,1,0,0,0,0]))`), "nsf");
  assert.equal(val(`chipKindOf(new Uint8Array([0x4D,0x54,0x68,0x64,0,0,0,6,0,1,0,2]))`), null, "a MIDI is not a chip file");
  assert.equal(val(`chipExt("gbs")`), ".gbs"); assert.equal(val(`chipExt(undefined)`), ".nsf");
  assert.deepEqual(val(`CHIPS.gbs.channels`), ["pulse1", "pulse2", "wave", "noise"]);
  app.context.__M = M;
  app.context.__gbs = M.parseGBS(bytes);
  run(`__capP = captureChipTrack("gbs", __M, __gbs, 1, 12).then(cap => {
    const parsed = parseMidi(new Uint8Array(cap.bytes).buffer);
    __cap = {bpm: cap.bpm, secs: cap.secs, names: parsed.tracks.map(t => t.name),
             notes: parsed.tracks.reduce((a, t) => a + t.notes.length, 0)};
  })`);
  await app.context.__capP;
  const got = val(`__cap`);
  assert.ok(got.names.includes("pulse1") && got.names.includes("wave"), "GB tracks named for the chip audio matcher: " + got.names.join(","));
  assert.ok(got.notes >= 5, "the C4 E4 G4 C5 line plus the pedal: " + got.notes);
  assert.ok(got.bpm > 60 && got.bpm < 300, "sane tempo: " + got.bpm);
});

test("help sheet covers every shipped feature (drift guard — extend this list when you ship)", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const help = html.match(/id="helpsheet"[\s\S]*?id="viewsheet"/)[0]; // the sheet ends where the View menu begins (its Close button is gone; the pinned ✕ closes it)
  // one recognizable keyword per shipped feature; a missing one means the
  // help sheet silently drifted from the app (it happened to the key dial)
  const FEATURES = [
    "Metronome", "Speed slider", "Lasso", "Chord?", "Challenge?",
    "find:", "Circle of fifths", "key: picker", "mode?", "Instrument panel",
    "Fall", "💬", "Chop", "Loop points", "Sections", "Chords", "expansion sound chip",
    "Roll zoom-out limit", "Score zoom limit", "Pencil", "undo",
    "New song", "Save As", "Move to…", "moved from", "Download .mid", "Open…", "Score entry", "inbox",
    "Share a song", "link preview", "type your own", "minor scale", "no MIDI inputs found", "MIDI blocked",
    "⌘Z", "Delete track is one ⟲ away", "chains straight on", "picks up its grid", "quarter-note triplets", "▦N", "turns the grid off", "Paste to…", "ride along", "reaches up into the ruler", "gold outline", "lane by lane", "Backspace) deletes them", "Add .mid to the end",
    "Web session", "Repo ↗", "Sync", "Silent Mode", "copy chip", "tap it to copy that message", "keeps going if you leave the menu", "Drag any sheet by its title line", "Play album", "⏭ Next", "✕</b> to leave",
    "follow song", "trial meter", "Count-in", "LCD readout", "Tempo change", "voice &amp; color", "Pan</b>", "re-reads the published list", "names the open song's album after the fact", "create mine</b>", "🎛 Instruments…</b>", "game's own instrument for that track", "Game instruments ›</b>", "Instruments in this song", "SoundFont", "Soundfonts ›",
    "Import…", "NSF", "Game Boy", "Super Nintendo", "Genesis", "PlayStation", "PlayStation 2", "Nintendo 64", "General chat", "Files on this iPad", "Share → Night Roll", "Publish import", "LOCAL", "PUBLISHED", "Edit locally", "⏳", "color picker", "sampled", "Rename…", "Chip audio", "Data locations", "Settings…", "Create album", "⚠", ".m3u", "real copy", "grayed", "moving TOGETHER pan", "hold to grab", "Revert to repo copy", "8va", "Divide", "magnetic", "never clears your note selection", "note value × modifier", "CELL you touch", "normal → solo → mute", "working trio", "⋯ row", "busy", "hard", "follow", "feel", "share their groove", "metal tier", "▸ chevron", "reroll just the kick", "parts</b> chips", "de-fill", "in key ▲", "folds the rest behind", "View ▾ menu", "STAYS OPEN", "Bassist", "✂</b> cuts", "Download audio", "Listener mode", "lines per bar", "Play / stop, Logic-style", "Insert bars", "Tracks view", "another lane", "master volume", "SOUNDING notes get the same treatment", "extensions row STACKS", "🎲 Drummer", "Pencil drag", "cycles", "Attached notes", "RENAMES the track", "＋ drums", "?song=", "Drum fill", "Delete track", "● Record", "Drum chart", "Edit ▾", "⟳ Redo", "parks", "re-arm", "entire annotation layer", "triangle handle", "left edge", "band by its", "all move-handle", "Insert chord", "organized by emotion", "splits at that exact spot", "merge into one note", "helptabs", 'data-hsec="editor"', "HELP.md", "Closing a sheet", "pinned to its top-right", "No accidental duplicates",
    "Tap a note", "nothing to double", "Folder on this computer", "Reconnect folder",
    "Audio tracks", "＋∿", "Align first sound", "someone else's recording", "tap again to play from its start",
    "Tempo from this take", "Split at cursor", "Remove piece", "Map the bars to this take", "downbeat ▶",
    "✦ Ask", 'data-hsec="ask"', "✦ Fill", ".ask.md", "Publish song", "Publish all", "NSF repo", "saves itself", "Auto-save", "Restore unsaved copy", "Compare with repo", "chord annotation on 21.1", "leave the app while a slow reply cooks", "Add to Home Screen", "✦ reply</b> badge", "songs=owner/repo", "your songs repo", "song list in the repo's README",
  ];
  const missing = FEATURES.filter(k => !help.includes(k));
  assert.deepEqual(missing, [], "features with no help entry: " + missing.join(", "));
});

test("tempo: directives rebuild the map from the song's base; removal restores", () => {
  installSong();
  // ANALYSIS song (not under compositions/): the directive is a pure
  // observation — the measured map must not move (Josh's ruling)
  run(`
    song.baseTempos = null;
    song.tempos = [{tick: 0, usq: 500000, sec: 0}];
    rollnotes = parseRollnotes("[3.1]\\ntempo: 60\\n").map(resolveNote);
    finalizeNotes();
  `);
  assert.deepEqual(val(`song.tempos`), [{tick: 0, usq: 500000, sec: 0}]);
  assert.equal(run(`rollnotes[0].tempodir`), 60); // but the observation is recorded
  // CREATED song: the same annotation authors the tempo
  run(`
    songKey = "albums/compositions/nightroll/tempo-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.baseTempos = null;
    rollnotes = parseRollnotes("[1.1]\\ntimesig: 4/4\\n\\n[3.1]\\ntempo: 60\\n").map(resolveNote);
    finalizeNotes();
  `);
  const map = val(`song.tempos`);
  assert.equal(map.length, 2);
  assert.equal(map[0].usq, 500000);            // base 120bpm until bar 3
  assert.equal(map[1].tick, 2 * 4 * 480);      // directive lands at bar 3
  assert.equal(map[1].usq, 1000000);           // 60bpm
  assert.equal(map[1].sec, 4);                 // 8 quarters at 120bpm = 4s
  run(`rollnotes = rollnotes.filter(n => n.tempodir === undefined); finalizeNotes();`);
  assert.deepEqual(val(`song.tempos`), [{tick: 0, usq: 500000, sec: 0}]); // base restored
  // round-trips like any directive
  run(`rollnotes = parseRollnotes("[1.1]\\ntempo: 90\\n").map(resolveNote); finalizeNotes();`);
  assert.ok(JSON.parse(run(`serializeRollnotes()`)).notes.some(x => x.type === "tempo" && x.bpm === 90));
  assert.equal(val(`song.tempos`)[0].usq, Math.round(6e7 / 90));
  run(`rollnotes = []; finalizeNotes(); song.baseTempos = null; songKey = "midi/test.mid";`);
});

test("track: directive — voice & color as synced annotations, round-tripping", () => {
  installSong();
  run(`
    trackState = [{muted: false, solo: false}, {muted: false, solo: false}];
    song.tracks = [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}]},
                   {name: "triangle", notes: [{t: 0, d: 480, p: 48, v: 80}]}];
    rollnotes = parseRollnotes("[1.1]\\ntrack: pulse1 voice=sine color=#0aa2c0\\n").map(resolveNote);
    finalizeNotes();
  `);
  assert.equal(run(`song.tracks[0].voice`), "sine");
  assert.equal(run(`song.tracks[0].color`), "#0aa2c0");
  assert.equal(run(`trackVoice(0)`), "sine");
  assert.equal(run(`trackColor(0)`), "#0aa2c0");
  assert.equal(run(`song.tracks[1].voice`), undefined); // untouched track
  assert.ok(JSON.parse(run(`serializeRollnotes()`)).notes.some(x =>
    x.type === "track" && x.track === "pulse1" && x.voice === "sine" && x.color === "#0aa2c0"));
  // removing the directive reverts to the NES defaults
  run(`rollnotes = []; finalizeNotes();`);
  assert.equal(run(`song.tracks[0].voice`), undefined);
  assert.equal(run(`trackVoice(0)`), "square");
  run(`song = null; songKey = "midi/test.mid";`);
});

test("format identity: text → object → JSON → object yields the SAME object (Josh's spec)", () => {
  installSong();
  const textFile = `# legacy header comment (dropped by design)
[1.1]
timesig: 6/8

[1.1]
key: Bb

[2.1]
key: A#/Bb?

[1.1 - 4.6]
section: A — home

[5.3 - 5.4]
chord: G7/B
no 5th — the bass supplies it
second attached line

[3.1]
tempo: 90

[1.1]
track: pulse1 voice=sine color=#0aa2c0

[2.1]
chop: start

[25.1]
loop: 2.1

[6.2.5]
Plain prose observation,
across two lines.
`;
  const out = val(`(() => {
    const A = parseRollnotes(${JSON.stringify(textFile)});          // text → object
    const json = serializeNotesList(A, 6, "identity-test");         // object → JSON
    const B = parseRollnotes(json);                                 // JSON → object
    const json2 = serializeNotesList(B, 6, "identity-test");        // and once more
    return {A, B, stable: json === json2, isJson: json.trimStart().startsWith("{")};
  })()`);
  assert.equal(out.isJson, true);
  assert.equal(out.stable, true);                 // JSON round-trip is a fixed point
  assert.equal(out.A.length, 10);
  assert.deepEqual(out.B, out.A);                 // the objects are IDENTICAL
  // spot-check the interesting ones survived with full fidelity
  const chord = out.B.find(n => n.chord);
  assert.equal(chord.cnote, "no 5th — the bass supplies it\nsecond attached line");
  assert.equal(out.B.find(n => n.keypartial)?.keypartial, "A#/Bb");
  assert.equal(out.B.find(n => n.tempodir)?.tempodir, 90);
  assert.deepEqual(out.B.find(n => n.trackdir)?.trackdir, {name: "pulse1", voice: "sine", color: "#0aa2c0"});
  assert.equal(out.B.find(n => n.q1 === 2.5)?.text.startsWith("Plain prose"), true); // fractional beat
});

test("cross-device freshness: stamps ride saves, drafts remember their base", () => {
  installSong();
  run(`rollnotes = parseRollnotes("[1.1]\\ntimesig: 4/4\\n");`);
  const stamped = run(`serializeRollnotesStamped(1234567)`);
  assert.equal(JSON.parse(stamped).saved, 1234567);
  const unstamped = run(`serializeRollnotes()`);
  assert.equal(JSON.parse(unstamped).saved, undefined); // pure serialization: no stamp
  // draft carries base stamp + dirty flag; clean save flips dirty off
  run(`
    songKey = "albums/compositions/nightroll/fresh-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.savedStamp = 1234567;
    saveDraft();      // an edit: dirty
  `);
  let d = JSON.parse(app.store.get("ff1roll-draft-albums/compositions/nightroll/fresh-test.mid"));
  assert.deepEqual([d.savedStamp, d.dirty], [1234567, true]);
  run(`saveDraft(true);`); // post-save: clean
  d = JSON.parse(app.store.get("ff1roll-draft-albums/compositions/nightroll/fresh-test.mid"));
  assert.deepEqual([d.savedStamp, d.dirty], [1234567, false]);
  run(`songKey = "midi/test.mid"; rollnotes = [];`);
  app.store.delete("ff1roll-draft-albums/compositions/nightroll/fresh-test.mid");
});

test("parseMidi: MThd found anywhere — RIFF-wrapped and junk-prefixed files parse", () => {
  installSong();
  const out = val(`(() => {
    const s = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}],
      tracks: [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}]}]};
    const clean = writeMidi(s);
    // fake an .rmi-style prefix: 20 bytes of RIFF-ish junk before MThd
    const prefix = Uint8Array.from("RIFF....RMIDdata....", c => c.charCodeAt(0));
    const wrapped = new Uint8Array(prefix.length + clean.length);
    wrapped.set(prefix, 0);
    wrapped.set(clean, prefix.length);
    const p = parseMidi(wrapped.buffer);
    return {ppq: p.ppq, notes: p.tracks[0].notes.map(n => [n.t, n.p])};
  })()`);
  assert.equal(out.ppq, 480);
  assert.deepEqual(out.notes, [[0, 60]]);
});

test("m3u playlists: track names parse from the emu-scene format", () => {
  const text = [
    "# Mega Man II",
    "mm2.nsf::NSF,3,Mega Man II - Ogeretsu Kun\\, Manami Matsumae - Flash Man,0:01:17,,0:00:06",
    "mm2.nsf::NSF,11,Mega Man II - Ogeretsu Kun\\, Manami Matsumae - Dr. Wily's Castle,0:02:30,,0:00:11",
    "mm2.nsf::NSF,12,Game - Artist - Dr. Wily's Castle II,0:01:16,,0:00:07",
    "not a track line",
  ].join("\n");
  const list = val(`parseM3u(${JSON.stringify(text)})`);
  assert.deepEqual(list.map(e => [e.n, e.title]), [
    [3, "Flash Man"],
    [11, "Dr. Wily's Castle"], // escaped commas in artist survive; order = playlist order
    [12, "Dr. Wily's Castle II"],
  ]);
  // Zophar's NES lengths are H:MM:SS(.fff): read as M:SS, "0:01:17" was 1 s and every track a 12 s "jingle" (the Castlevania batch, 2026-09-27)
  assert.deepEqual(list.map(e => e.len), [77, 150, 76]);
  assert.equal(val(`parseM3u("a.nsf::NSF,1,Game - Artist - Opening,0:00:52.393,,0:00:00")[0].len`), 52.393);
  assert.equal(val(`parseM3u("a.nsf::NSF,1,Game - Artist - Long,1:02:03,,0")[0].len`), 3723);
  // a Game Boy rip's line (Zophar: one such file per track, so the picker merges them)
  // Game Boy rips (the real FFL1 lines, 2026-09-27): "Title - Artist - Game - ©year", tracks 0-BASED → title first, row n+1
  const gb = val(`parseM3u(${JSON.stringify(["DMG-SAJ.gbs::GBS,0,Prologue - Nobuo Uematsu - Final Fantasy Legend - ©1989-12-15 Square,01:56,,10", "DMG-SAJ.gbs::GBS,7,Town Theme - Nobuo Uematsu - Final Fantasy Legend - ©1989-12-15 Square,01:00,,10", "DMG-SAJ.gbs::GBS,15,Jingle #01 - Nobuo Uematsu - Final Fantasy Legend - ©1989-12-15 Square,00:04,,1"].join("\n"))})`);
  assert.deepEqual(gb.map(e => [e.n, e.title, e.len]), [[1, "Prologue", 116], [8, "Town Theme", 60], [16, "Jingle #01", 4]]);
  // an NSF line with a dash in the title keeps the NSF rule
  assert.deepEqual(val(`parseM3u(${JSON.stringify("a.nsf::NSF,4,Game - Artist - Stage 1 - Intro,0:01:00,,0:00:05")})`).map(e => e.title), ["Stage 1 - Intro"]);
});

test("m3u: latin-1 playlist bytes decode, and GBS lines land on 1-based rows", () => {
  // Zophar's real files are latin-1: © is the single byte 0xA9, so a plain
  // UTF-8 decode replaced it and every FFL row read "Final Fantasy Legend -
  // <?>1989-12-15 Square" (Josh's iPad import, 2026-09-27).
  const line = "DMG-SAJ.gbs::GBS,0,Prologue - Nobuo Uematsu - Final Fantasy Legend - \xA91989-12-15 Square,01:56,,10";
  const bytes = Uint8Array.from([...line].map(c => c.charCodeAt(0)));
  assert.throws(() => new TextDecoder("utf-8", {fatal: true}).decode(bytes), "the fixture really is not UTF-8");
  const titles = val(`parseM3u(decodeM3u(Uint8Array.from(${JSON.stringify([...bytes])})))`);
  assert.deepEqual(titles.map(e => [e.n, e.title]), [[1, "Prologue"]]); // 0-based in the file, row 1 in the app
  // UTF-8 playlists still decode as UTF-8
  const utf8 = new TextEncoder().encode("a.gbs::GBS,1,Main Theme - Nobuo Uematsu - Final Fantasy Legend - ©1989-12-15 Square,01:28,,10");
  assert.deepEqual(val(`parseM3u(decodeM3u(Uint8Array.from(${JSON.stringify([...utf8])})))`).map(e => e.title), ["Main Theme"]);
  // NSF playlists start at 1 and must not move
  assert.deepEqual(val(`parseM3u(${JSON.stringify("mm2.nsf::NSF,3,Mega Man II - Artist - Flash Man,0:01:17,,0:00:06")})`).map(e => e.n), [3]);
});

test("split at cursor / split in half / join — one undo step each", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/split-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.tracks = [{name: "pulse1", notes: [
      {t: 0, d: 960, p: 60, v: 80}, {t: 0, d: 960, p: 64, v: 80}, {t: 1920, d: 480, p: 60, v: 80}]}];
    song.rawNotes = null; chopS = 0;
    multiSel = [{ti: 0, ni: 0}, {ti: 0, ni: 1}]; multiSelKey = new Set(["0:0", "0:1"]);
    selNote = null; editUndo = []; pencilDur = 1; pencilVel = 80; selTrack = 0; playCursor = 480;
  `);
  // cursor at 480 crosses both selected notes; the note at 1920 is unselected and untouched
  assert.equal(run(`splitSelectionAt(playCursor)`), 2);
  assert.deepEqual(val(`song.tracks[0].notes.filter(n => !n.gone).map(n => [n.t, n.d, n.p]).sort((a,b)=>a[0]-b[0]||a[2]-b[2])`),
    [[0, 480, 60], [0, 480, 64], [480, 480, 60], [480, 480, 64], [1920, 480, 60]]);
  assert.equal(val(`editUndo.length`), 1);
  assert.equal(val(`editUndo[0].kind`), "group");
  // join everything on pitch 60 back into one note
  run(`multiSel = [{ti:0,ni:0},{ti:0,ni:3}]; multiSelKey = new Set(["0:0","0:3"]);`);
  assert.equal(run(`joinSelection()`), 2);
  assert.deepEqual(val(`song.tracks[0].notes.filter(n => !n.gone && n.p === 60).map(n => [n.t, n.d]).sort((a,b)=>a[0]-b[0])`),
    [[0, 960], [1920, 480]]);
  // undo the join (one step), then undo the split (one step) — original three notes back
  run(`editUndoPop()`);
  run(`editUndoPop()`);
  assert.deepEqual(val(`song.tracks[0].notes.filter(n => !n.gone).map(n => [n.t, n.d, n.p])`),
    [[0, 960, 60], [0, 960, 64], [1920, 480, 60]]);
  // cursor outside the selection: halves mode
  run(`multiSel = [{ti:0,ni:2}]; multiSelKey = new Set(["0:2"]); playCursor = 0;`);
  assert.equal(run(`splitSelectionAt(playCursor) || splitSelectionHalves()`), 1);
  assert.deepEqual(val(`song.tracks[0].notes.filter(n => !n.gone && n.t >= 1920).map(n => [n.t, n.d])`),
    [[1920, 240], [2160, 240]]);
  run(`songKey = null; multiSel = []; multiSelKey = new Set(); editUndo = [];`);
});

test("insert chord: triad and seventh at the cursor, cursor walks, one undo", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/chord-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.tracks = [{name: "pulse1", notes: []}];
    song.rawNotes = null; chopS = 0; selTrack = 0;
    multiSel = []; multiSelKey = new Set(); selNote = null;
    editUndo = []; pencilDur = 1; pencilVel = 80; playCursor = 0;
  `);
  // Am triad at the cursor (A4=69), quarter note
  assert.equal(run(`insertChordAt(playCursor, 9, "m", 4)`), 3);
  assert.deepEqual(val(`song.tracks[0].notes.map(n => [n.t, n.d, n.p])`),
    [[0, 480, 69], [0, 480, 72], [0, 480, 76]]);
  assert.equal(val(`playCursor`), 480);
  // next insert lands right after: Fmaj7 = four notes
  assert.equal(run(`insertChordAt(playCursor, 5, "maj7", 4)`), 4);
  assert.deepEqual(val(`song.tracks[0].notes.slice(3).map(n => [n.t, n.p])`),
    [[480, 65], [480, 69], [480, 72], [480, 76]]);
  // inserted notes are the selection; one undo removes the whole chord
  assert.equal(val(`multiSel.length`), 4);
  run(`editUndoPop()`);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 3);
  run(`songKey = null; multiSel = []; multiSelKey = new Set(); editUndo = [];`);
});

test("insert progression: numerals resolve, chords land in slots, one undo", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/prog-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.tracks = [{name: "pulse1", notes: []}];
    song.rawNotes = null; chopS = 0; selTrack = 0;
    multiSel = []; multiSelKey = new Set(); selNote = null;
    editUndo = []; pencilDur = 0.5; pencilVel = 80; playCursor = 0;
  `);
  // "i – ♭VI – ♭III – ♭VII" in A minor (tonic pc 9, octave 4): Am, F, C, G — eighths
  assert.equal(run(`insertProgressionAt(0, "i – ♭VI – ♭III – ♭VII", 9, 4)`), 12);
  assert.deepEqual(val(`song.tracks[0].notes.map(n => [n.t, n.p])`), [
    [0, 69], [0, 72], [0, 76],        // Am
    [240, 65], [240, 69], [240, 72],  // F
    [480, 60], [480, 64], [480, 67],  // C
    [720, 67], [720, 71], [720, 74],  // G
  ]);
  assert.deepEqual(val(`song.tracks[0].notes.map(n => n.d)`).every(d => d === 240), true);
  assert.equal(val(`playCursor`), 960);
  assert.equal(val(`multiSel.length`), 12);
  // sevenths + diminished parse: "Imaj7 – vi7 – ♯iv°" in C
  const bands = () => val(`rollnotes.filter(n => n.chord || /^chord:/i.test(n.text)).length`);
  const b0 = bands();
  assert.equal(run(`insertProgressionAt(playCursor, "Imaj7 – vi7 – ♯iv°", 0, 4)`), 11);
  // one undo removes the whole second progression — notes AND its ruler bands
  // (Josh, 2026-09-12: undo took the notes and left the annotations)
  assert.equal(bands(), b0 + 3); // one band per chord
  run(`editUndoPop()`);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 12);
  assert.equal(bands(), b0);
  run(`editRedoPop()`);
  assert.equal(bands(), b0 + 3);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 23);
  run(`editUndoPop()`);
  assert.equal(bands(), b0);
  // typed minor-key progression (Josh, 2026-09-12): hyphens, no ♭ — in E minor
  // with the minor scale, i–VI–VII–V is Em C D B; the same string read against
  // the major scale would give C♯ and D♯
  run(`playCursor = 0; song.tracks[0].notes = [];`);
  assert.equal(run(`insertProgressionAt(0, "i-VI-VII-V", 4, 4, 0.5, true)`), 12);
  assert.deepEqual(val(`song.tracks[0].notes.map(n => n.p % 12)`), [
    4, 7, 11,   // Em
    0, 4, 7,    // C
    2, 6, 9,    // D
    11, 3, 6,   // B major — uppercase V keeps the leading tone
  ]);
  run(`song.tracks[0].notes = [];`);
  assert.equal(run(`insertProgressionAt(0, "i, VI VII → V", 4, 4, 0.5, false)`), 12);
  assert.deepEqual(val(`song.tracks[0].notes.slice(3, 9).map(n => n.p % 12)`), [1, 5, 8, 3, 7, 10]); // C♯, D♯ major-relative
  assert.deepEqual(val(`splitProgression("i – ♭VI – ♭III – ♭VII")`), ["i", "♭VI", "♭III", "♭VII"]);
  assert.equal(run(`insertProgressionAt(0, "i - VIII", 4, 4, 0.5, true)`), 0); // one bad numeral: nothing inserted
  // bar-long chords get bar-long bands, end to end, no overlap (Josh, 2026-09-12:
  // each band came out a quarter note long and they overlapped)
  run(`song.tracks[0].notes = []; rollnotes = []; editUndo = []; playCursor = 0;`);
  assert.equal(run(`insertProgressionAt(0, "i-VI-VII-V", 4, 4, 4, true)`), 12);
  assert.deepEqual(val(`rollnotes.filter(n => n.chord).map(b => [b.b1, b.q1, b.b2, b.q2, b.start, b.end])`), [
    [1, 1, 1, 4, 0, 1920], [2, 1, 2, 4, 1920, 3840], [3, 1, 3, 4, 3840, 5760], [4, 1, 4, 4, 5760, 7680]]);
  run(`song.tracks[0].notes = []; editUndo = [];`);
  // explicit duration overrides the pencil: half-note chords
  run(`playCursor = 0;`);
  assert.equal(run(`insertChordAt(0, 0, "maj", 4, 2)`), 3);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).slice(-1)[0].d`), 960);
  assert.equal(val(`playCursor`), 960);
  const b1 = bands();
  run(`editUndoPop()`); // single chord: its band goes too
  assert.equal(bands(), b1 - 1);
  run(`songKey = null; multiSel = []; multiSelKey = new Set(); editUndo = [];`);
});

test("writeMidi: drum tracks export on channel 10, others skip it", () => {
  installSong();
  const bytes = val(`Array.from(writeMidi({ppq: 480, tempos: [{tick: 0, usq: 500000}], timesig: [4, 4],
    tracks: [{name: "pulse1", notes: [{t: 0, d: 240, p: 60, v: 80}]},
             {name: "drums", notes: [{t: 0, d: 120, p: 36, v: 100}]}]}))`);
  const hex = bytes.map(b => b.toString(16).padStart(2, "0")).join(" ");
  assert.ok(hex.includes("99 24 64"), "drum note-on on channel 9 (0x99, kick 36, vel 100)");
  assert.ok(hex.includes("90 3c 50"), "melodic note-on stays channel 0");
});

test("redo: replays undone edits; a fresh edit clears redo history", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/redo-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.tracks = [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}]}];
    song.rawNotes = null; chopS = 0; selTrack = 0;
    multiSel = [{ti: 0, ni: 0}]; multiSelKey = new Set(["0:0"]);
    selNote = null; editUndo = []; editRedo = []; pencilDur = 1; pencilVel = 80; playCursor = 0;
  `);
  // move up a third, undo, redo — the move comes back
  assert.equal(run(`nudgeSelection(0, 4)`), true);
  run(`editUndoPop()`);
  assert.equal(val(`song.tracks[0].notes[0].p`), 60);
  run(`editRedoPop()`);
  assert.equal(val(`song.tracks[0].notes[0].p`), 64);
  // undo again, then a FRESH edit forks history: redo stack clears
  run(`editUndoPop()`);
  assert.equal(run(`nudgeSelection(480, 0)`), true);
  assert.equal(val(`editRedo.length`), 0);
  run(`editRedoPop()`); // no-op
  assert.deepEqual(val(`[song.tracks[0].notes[0].t, song.tracks[0].notes[0].p]`), [480, 60]);
  // delete → undo → redo round-trip through batch kinds
  run(`multiSel = [{ti: 0, ni: 0}]; multiSelKey = new Set(["0:0"]);`);
  assert.equal(run(`deleteSelection()`), 1);
  run(`editUndoPop()`);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 1);
  run(`editRedoPop()`);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 0);
  run(`songKey = null; multiSel = []; multiSelKey = new Set(); editUndo = []; editRedo = [];`);
});

test("paste never stacks an identical note; unisons across tracks untouched", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/stack-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.tracks = [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}]},
                   {name: "pulse2", notes: [{t: 0, d: 480, p: 60, v: 80}]}];
    song.rawNotes = null; chopS = 0; selTrack = 0;
    multiSel = [{ti: 0, ni: 0}]; multiSelKey = new Set(["0:0"]);
    selNote = null; editUndo = []; editRedo = []; pencilDur = 1; pencilVel = 80; playCursor = 0;
  `);
  // paste right back onto itself: nothing stacks
  assert.equal(run(`copySelection()`), 1);
  assert.equal(run(`pasteClipboard(0)`), 0);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 1);
  // paste one beat later works
  assert.equal(run(`pasteClipboard(480)`), 1);
  // chord insert over an existing root only adds the missing tones
  run(`playCursor = 0;`);
  assert.equal(run(`insertChordAt(0, 0, "maj", 4, 1)`), 2); // C4 exists — only E4+G4 land
  // the cross-track unison (pulse2's C4) was never touched
  assert.equal(val(`song.tracks[1].notes.filter(n => !n.gone).length`), 1);
  run(`songKey = null; multiSel = []; multiSelKey = new Set(); editUndo = []; rollnotes = [];`);
});

test("stranded ⧉ clones evaporate; dragged clones survive", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/sweep-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.tracks = [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}]}];
    song.rawNotes = null; chopS = 0; selTrack = 0;
    multiSel = [{ti: 0, ni: 0}]; multiSelKey = new Set(["0:0"]);
    selNote = null; editUndo = []; editRedo = []; dupPending = null; pencilDur = 1; pencilVel = 80;
  `);
  // ⧉ then wander off: the untouched clone evaporates, with its undo entry
  assert.equal(run(`duplicateSelectionInPlace()`), true);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 2);
  run(`clearMultiSel()`);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 1);
  assert.equal(val(`editUndo.length`), 0);
  // ⧉ then MOVE: the clone is a real note and stays
  run(`multiSel = [{ti: 0, ni: 0}]; multiSelKey = new Set(["0:0"]);`);
  assert.equal(run(`duplicateSelectionInPlace()`), true);
  assert.equal(run(`nudgeSelection(480, 0)`), true);
  run(`clearMultiSel()`);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 2);
  run(`songKey = null; multiSel = []; multiSelKey = new Set(); editUndo = []; dupPending = null;`);
});

test("notesTxtFor: text dump matches the pipeline format", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/dump-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.timesig = [4, 4];
    song.tempos = [{tick: 0, usq: 500000}];
    song.tracks = [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}, {t: 480, d: 240, p: 64, v: 80}]}];
  `);
  const txt = val(`notesTxtFor()`);
  assert.ok(txt.startsWith("# dump-test.mid — 4/4, 120bpm, 1 bars"), txt.split("\n")[0]);
  assert.ok(txt.includes("## track 1 (pulse1)"));
  assert.ok(txt.includes("bar 1: 1 C4 1, 2 E4 0.5"));
  run(`songKey = null;`);
});

test("renameTrack: directives migrate (dupes included), name collisions refused", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/rn-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.tracks = [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}]},
                   {name: "pulse2", notes: []}];
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = [];
    rollnotes = deriveNoteTypes([
      {b1: 1, q1: 1, b2: null, q2: null, text: "track: pulse1 voice=sawtooth", added: false},
      {b1: 1, q1: 1, b2: null, q2: null, text: "track: pulse1 voice=sawtooth vol=1.1", added: true},
    ]).map(resolveNote);
    finalizeNotes();
  `);
  assert.equal(run(`renameTrack(0, "pulse2")`), "another track is already called that");
  assert.equal(run(`renameTrack(0, "top")`), null);
  assert.equal(val(`song.tracks[0].name`), "top");
  // every directive migrated (load-time dedupe may collapse them, but none may point at the old name)
  assert.equal(val(`rollnotes.filter(n => n.trackdir && n.trackdir.name === "pulse1").length`), 0);
  assert.ok(val(`rollnotes.some(n => n.trackdir && n.trackdir.name === "top")`));
  // settings survived the migration
  assert.equal(val(`song.tracks[0].voice`), "sawtooth");
  run(`songKey = null; rollnotes = [];`);
});

test("attached notes on all annotation types round-trip", () => {
  installSong();
  run(`song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}], tracks: [{name: "t", notes: []}]};
    songKey = "albums/compositions/nightroll/attach-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */`);
  run(`rollnotes = deriveNoteTypes([
    {b1: 1, q1: 1, b2: null, q2: null, text: "key: Bb?\\nwhole-tone material", added: true},
    {b1: 2, q1: 1, b2: null, q2: null, text: "tempo: 75\\nfelt right slower", added: true},
    {b1: 3, q1: 1, b2: null, q2: null, text: "loop: 2.4\\nseam = drum entry", added: true},
    {b1: 4, q1: 1, b2: null, q2: null, text: "plain note\\nsecond line stays", added: true},
  ]).map(resolveNote); finalizeNotes();`);
  assert.equal(val(`rollnotes.find(n => n.keypartial).cnote`), "whole-tone material");
  assert.equal(val(`rollnotes.find(n => n.tempodir).cnote`), "felt right slower");
  assert.equal(val(`rollnotes.find(n => n.loopTo !== undefined).cnote`), "seam = drum entry");
  assert.equal(run(`String(rollnotes.find(n => n.text.startsWith("plain")).cnote)`), "undefined");
  assert.ok(val(`rollnotes.find(n => n.text.startsWith("plain")).text`).includes("second line"));
  const json = JSON.parse(run(`serializeRollnotes()`));
  assert.equal(json.notes.find(n => n.type === "key").note, "whole-tone material");
  assert.equal(json.notes.find(n => n.type === "tempo").note, "felt right slower");
  assert.equal(json.notes.find(n => n.type === "loop").note, "seam = drum entry");
  run(`rollnotes = parseRollnotesJSON(serializeRollnotes()).map(resolveNote); finalizeNotes();`);
  assert.equal(val(`rollnotes.find(n => n.tempodir).cnote`), "felt right slower");
  run(`rollnotes = [];`);
});

test("chord bands ride rigid moves; stale flag when notes stop matching", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/band-ride.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [{name: "pulse1", notes: [
        {t: 0, d: 480, p: 60, v: 80}, {t: 0, d: 480, p: 64, v: 80}, {t: 0, d: 480, p: 67, v: 80}]}]};
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = []; dupPending = null;
    rollnotes = deriveNoteTypes([
      {b1: 1, q1: 1, b2: 1, q2: 2, text: "chord: C", added: true},
    ]).map(resolveNote);
    finalizeNotes();
    multiSel = [{ti: 0, ni: 0}, {ti: 0, ni: 1}, {ti: 0, ni: 2}];
    multiSelKey = new Set(["0:0", "0:1", "0:2"]);
  `);
  // rigid move up 2 semitones and one beat right: band slides AND transposes
  assert.equal(run(`nudgeSelection(480, 2)`), true);
  const band = val(`(() => { const b = rollnotes.find(n => n.chord); return {text: b.text, b1: b.b1, q1: b.q1}; })()`);
  assert.equal(band.text, "D");
  assert.equal(band.b1, 1);
  assert.equal(band.q1, 2);
  // the band keeps its two-beat length: [1.1–1.2] slid one beat is [1.2–1.3]
  // (the last-tick math used to grow it a beat per move)
  assert.deepEqual(val(`(() => { const b = rollnotes.find(n => n.chord); return [b.b2, b.q2, b.end]; })()`), [1, 3, 1440]);
  // now move ONE note out from under the band: no ride — and no unsolicited
  // flag either (label review is on-demand only; Josh's rule)
  run(`multiSel = [{ti: 0, ni: 1}]; multiSelKey = new Set(["0:1"]);`);
  assert.equal(run(`nudgeSelection(0, 1)`), true); // E→F over a D label
  assert.equal(val(`rollnotes.find(n => n.chord).stale || null`), null); // silent until asked
  run(`updateChordStale()`); // the Check-labels button's path
  const after = val(`(() => { const b = rollnotes.find(n => n.chord); return {text: b.text, stale: b.stale || null}; })()`);
  assert.equal(after.text, "D"); // never rewritten
  assert.ok(after.stale); // flagged because we ASKED
  run(`nudgeSelection(0, 1)`); // any note edit retires review flags
  assert.equal(val(`rollnotes.find(n => n.chord).stale || null`), null);
  run(`songKey = null; rollnotes = []; multiSel = []; multiSelKey = new Set();`);
});

test("full-song move carries the whole annotation layer (intro-cut workflow)", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/carry-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [{name: "pulse1", notes: [
        {t: 1920, d: 480, p: 60, v: 80}, {t: 3840, d: 480, p: 64, v: 80}]}]};
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = []; dupPending = null;
    rollnotes = deriveNoteTypes([
      {b1: 2, q1: 1, b2: 3, q2: 4, text: "section: A", added: true},
      {b1: 2, q1: 1, b2: 2, q2: 4, text: "chord: C", added: true},
      {b1: 3, q1: 2, text: "loop: 2.1", added: true},
      {b1: 1, q1: 1, text: "track: pulse1 voice=square50", added: true},
    ]).map(resolveNote);
    finalizeNotes();
    multiSel = [{ti: 0, ni: 0}, {ti: 0, ni: 1}];
    multiSelKey = new Set(["0:0", "0:1"]);
  `);
  // every note moved one bar left: sections, chords, and the loop (anchor AND
  // target) slide with them; the track directive keeps its bar-1 anchor
  assert.equal(run(`nudgeSelection(-1920, 0)`), true);
  const rn = val(`rollnotes.map(n => ({text: n.text, b1: n.b1, q1: n.q1, b2: n.b2 || null,
    section: !!n.section, chord: !!n.chord, loop: n.loopTo !== undefined, track: !!n.trackdir}))`);
  const sec = rn.find(n => n.section);
  assert.equal(sec.b1, 1); assert.equal(sec.b2, 2);
  assert.equal(rn.find(n => n.chord && !n.section).b1, 1);
  const loop = rn.find(n => n.loop);
  assert.equal(loop.text, "loop: 1.1"); // target followed the move
  assert.equal(loop.b1, 2); assert.equal(loop.q1, 2);
  assert.equal(rn.find(n => n.track).b1, 1); // pinned
  // vertical whole-song move transposes chord labels (time anchors untouched)
  assert.equal(run(`nudgeSelection(0, 2)`), true);
  assert.equal(val(`rollnotes.find(n => n.chord && !n.section).text`), "D");
  // ⟲ restores notes AND annotations together (the half-undo bug, 2026-08-20)
  run(`editUndoPop()`);
  assert.equal(val(`rollnotes.find(n => n.chord && !n.section).text`), "C"); // label back
  assert.equal(val(`song.tracks[0].notes[0].p`), 60); // note back with it
  run(`editUndoPop()`);
  const back = val(`rollnotes.map(n => ({b1: n.b1, text: n.text, loop: n.loopTo !== undefined, added: !!n.added}))`);
  assert.equal(back.find(n => n.loop).text, "loop: 2.1"); // loop target restored
  assert.equal(back.find(n => n.text === "A" || n.text.startsWith("section") || n.b1 === 2 && !n.loop).b1, 2);
  assert.ok(back.every(n => n.added)); // added flags survive the round-trip
  // and ⟳ replays the carry
  run(`editRedoPop()`);
  assert.equal(val(`rollnotes.find(n => n.loopTo !== undefined).text`), "loop: 1.1");
  run(`songKey = null; rollnotes = []; multiSel = []; multiSelKey = new Set(); editUndo = []; editRedo = [];`);
});

test("chord quality parse/compose: bases + stacked extensions round-trip", () => {
  installSong();
  const cases = [["", "maj", []], ["m7add9", "m", ["7", "add9"]], ["7b9", "maj", ["7", "b9"]],
                 ["dim7", "dim", ["7"]], ["m7b5", "m", ["7", "b5"]], ["maj9", "maj", ["maj9"]],
                 ["sus4", "sus4", []], ["5", "5", []], ["6", "maj", ["6"]],
                 ["madd13", "m", ["add13"]], ["7#5b9", "maj", ["7", "#5", "b9"]],
                 ["maj13", "maj", ["maj13"]], ["69", "maj", ["6", "9"]],
                 ["7b13", "maj", ["7", "b13"]]];
  for (const [q, base, exts] of cases) {
    const got = val(`chordQualParse(${JSON.stringify(q)})`);
    assert.deepEqual(got, {base, exts}, q);
    assert.equal(val(`chordQualCompose(${JSON.stringify(base)}, ${JSON.stringify(exts)})`), q);
  }
  assert.equal(val(`chordQualParse("weird") || null`), null); // unknown: chips stand down
});

test("transposeTrack: whole track ±12, one undo step, drums refuse", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/oct-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [
        {name: "bass", notes: [{t: 0, d: 480, p: 40, v: 90}, {t: 480, d: 480, p: 43, v: 90}]},
        {name: "drums", notes: [{t: 0, d: 60, p: 36, v: 100}]}]};
    song.tracks[1].drums = true;
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = []; dupPending = null;
    rollnotes = []; finalizeNotes();
  `);
  assert.equal(val(`transposeTrack(0, 12)`), 2);
  assert.deepEqual(val(`song.tracks[0].notes.map(n => n.p)`), [52, 55]);
  assert.equal(val(`transposeTrack(0, 12)`), 2); // stacking taps stack octaves
  assert.deepEqual(val(`song.tracks[0].notes.map(n => n.p)`), [64, 67]);
  run(`editUndoPop()`); // each tap is exactly one step
  assert.deepEqual(val(`song.tracks[0].notes.map(n => n.p)`), [52, 55]);
  run(`editUndoPop()`);
  assert.deepEqual(val(`song.tracks[0].notes.map(n => n.p)`), [40, 43]);
  assert.equal(val(`transposeTrack(1, 12)`), 0); // kit pitches are instruments
  run(`songKey = null; rollnotes = [];`);
});

test("divideSelection: N equal parts, triplet math exact, one undo", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/div-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.tracks = [{name: "pulse1", notes: [{t: 0, d: 960, p: 60, v: 90}]}]; // a half note
    song.rawNotes = null; chopS = 0; editUndo = []; editRedo = []; dupPending = null;
    multiSel = [{ti: 0, ni: 0}]; multiSelKey = new Set(["0:0"]);
  `);
  assert.equal(val(`divideSelection(3)`), 1); // quarter-note triplets: 1, 1.667, 2.333
  const parts = val(`song.tracks[0].notes.filter(n => !n.gone).map(n => ({t: n.t, d: n.d, p: n.p, v: n.v}))`);
  assert.deepEqual(parts.map(n => n.t).sort((a, b) => a - b), [0, 320, 640]);
  assert.ok(parts.every(n => n.d === 320 && n.p === 60 && n.v === 90)); // inherit everything
  assert.equal(val(`multiSel.length`), 3); // the pieces are the new selection
  run(`editUndoPop()`); // one step back to the whole note
  assert.deepEqual(val(`song.tracks[0].notes.filter(n => !n.gone).map(n => n.d)`), [960]);
  // 5 into a quarter distributes the remainder without gaps
  run(`multiSel = [{ti: 0, ni: 0}]; multiSelKey = new Set(["0:0"]); song.tracks[0].notes[0].d = 480;`);
  assert.equal(val(`divideSelection(5)`), 1);
  const five = val(`song.tracks[0].notes.filter(n => !n.gone).map(n => ({t: n.t, d: n.d})).sort((a, b) => a.t - b.t)`);
  assert.equal(five.length, 5);
  for (let i = 1; i < 5; i++) assert.equal(five[i].t, five[i - 1].t + five[i - 1].d); // seamless
  assert.equal(five[4].t + five[4].d, 480); // total span unchanged
  run(`songKey = null; multiSel = []; multiSelKey = new Set();`);
});

test("rulerSnapX: bar lines are magnetic in pixels; 16ths elsewhere", () => {
  installSong();
  run(`view.pxq = 200; view.x = 0;`); // 1 bar = 800px, 14px magnet ≈ 33 ticks
  const at = x => val(`rulerSnapX(RULER_W + ${x})`);
  assert.equal(at(800), 1920); // dead on bar 2
  assert.equal(at(790), 1920); // 10px shy: magnet grabs it
  assert.equal(at(812), 1920); // 12px past: magnet grabs it
  assert.equal(at(760), 1800); // 40px shy: a 16th, not the bar
  run(`view.pxq = 60;`); // zoomed out: same 14px radius = more ticks
  assert.equal(at(233), 1920); // ~7px shy of bar 2 (240px)
  run(`songKey = null;`);
});

test("Drummer: deterministic, skeleton fixed, breaks silent, one group undo", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/drummer-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [
        {name: "pulse1", notes: [ // melody sounds in bars 1-2; bar 3 is bass-only (a break)
          {t: 0, d: 1920, p: 72, v: 80}, {t: 1920, d: 1920, p: 74, v: 80}]},
        {name: "triangle", notes: [ // bass: offbeat onset + a LONG note (agogic target)
          {t: 0, d: 960, p: 45, v: 90}, {t: 1200, d: 240, p: 43, v: 90},
          {t: 1920, d: 1440, p: 41, v: 90}, {t: 3840, d: 1920, p: 40, v: 90}]}]};
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = []; dupPending = null;
    rollnotes = deriveNoteTypes([
      {b1: 2, q1: 1, b2: 2, q2: 4, text: "section: B", added: true},
    ]).map(resolveNote);
    finalizeNotes();
    computeSongEnd();
  `);
  const gen = seed => val(`(() => {
    const k = drGenerate(${seed}, 3, 1, 3);
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return {k, hits: song.tracks[di].notes.filter(n => !n.gone).map(n => ({t: n.t, p: n.p, v: n.v}))};
  })()`);
  const a = gen(12345), b = gen(12345);
  assert.deepEqual(a.hits, b.hits); // same seed, same everything — and idempotent (replaces itself)
  const kick1 = a.hits.find(h => h.t === 0 && h.p === 36);
  assert.ok(kick1, "kick on beat 1"); // fixed skeleton
  assert.ok(a.hits.find(h => h.t === 480 && h.p === 38), "backbeat snare on 2");
  assert.ok(a.hits.find(h => h.t === 1920 && h.p === 49), "crash on the section boundary downbeat");
  assert.ok(!a.hits.some(h => h.t >= 3840), "bar 3 is a break (bass only) — the drummer lays out");
  const hats = a.hits.filter(h => h.p === 42), snares = a.hits.filter(h => h.p === 38 && h.v >= 100);
  assert.ok(hats.length && snares.length && Math.max(...hats.map(h => h.v)) < Math.min(...snares.map(h => h.v)),
    "hats stay under the backbeat snares");
  const c = gen(99999);
  assert.notDeepEqual(c.hits.map(h => h.v), a.hits.map(h => h.v)); // different seed, different take
  // one ⟲ restores what was there: hand-place a hit, generate over it, undo
  run(`(() => {
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    song.tracks[di].notes.push({t: 240, d: 60, p: 51, v: 77, added: false}); // a hand-placed ride
  })()`);
  const before = val(`editUndo.length`);
  assert.ok(val(`drGenerate(555, 3, 1, 3)`) > 0);
  assert.equal(val(`editUndo.length`), before + 1); // ONE step
  assert.equal(val(`(() => {
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return song.tracks[di].notes.filter(n => !n.gone && n.p === 51).length;
  })()`), 0); // replaced
  run(`editUndoPop()`);
  assert.equal(val(`(() => {
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return song.tracks[di].notes.filter(n => !n.gone && n.p === 51 && n.v === 77).length;
  })()`), 1); // the hand-placed ride came back
  // meter change inside the range refuses honestly
  run(`rollnotes.push(resolveNote(deriveNoteTypes([{b1: 2, q1: 1, text: "timesig: 3/4", added: true}])[0])); finalizeNotes();`);
  assert.equal(val(`drGenerate(1, 3, 1, 3)`), 0);
  run(`songKey = null; rollnotes = []; multiSel = []; multiSelKey = new Set();`);
});

test("Drummer v2: hard bit-identity, follow modes, feel tables", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/drv2-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [
        {name: "pulse1", notes: [{t: 0, d: 3840, p: 72, v: 80}]},
        {name: "triangle", notes: [
          {t: 0, d: 960, p: 45, v: 90}, {t: 1200, d: 240, p: 43, v: 90}, {t: 1920, d: 1440, p: 41, v: 90}]}]};
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = []; dupPending = null;
    rollnotes = deriveNoteTypes([
      {b1: 1, q1: 3, b2: 1, q2: 4, text: "chord: A", added: true},
    ]).map(resolveNote);
    finalizeNotes(); computeSongEnd();
  `);
  const gen = args => val(`(() => {
    const k = drGenerate(4242, ${args});
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return song.tracks[di].notes.filter(n => !n.gone).map(n => ({t: n.t, p: n.p, v: n.v}));
  })()`);
  // hard=3 opts call is bit-identical to the legacy positional call
  const legacy = gen(`3, 1, 2`);
  const opts3 = gen(`{busy: 3, hard: 3, fillAmt: 3, fromBar: 1, toBar: 2}`);
  assert.deepEqual(opts3, legacy);
  // hard shifts every non-floored velocity uniformly; positions identical
  const hard5 = gen(`{busy: 3, hard: 5, fillAmt: 3, fromBar: 1, toBar: 2}`);
  assert.deepEqual(hard5.map(h => h.t + ":" + h.p), legacy.map(h => h.t + ":" + h.p));
  assert.ok(hard5.some((h, i) => h.v > legacy[i].v));
  // follow off: no bass-follow kicks, no agogic snares, no chord accents
  const off = gen(`{busy: 3, hard: 3, fillAmt: 0, follow: "off", fromBar: 1, toBar: 2}`);
  assert.ok(!off.some(h => h.p === 36 && h.t === 1200)); // the offbeat bass onset
  // follow chords: deterministic kick on the declared off-downbeat chord start (1.3 = 960)
  const ch = gen(`{busy: 1, hard: 3, fillAmt: 0, follow: "chords", fromBar: 1, toBar: 2}`);
  assert.ok(ch.some(h => h.p === 36 && h.t === 960));
  // half feel: exactly one snare per bar, on beat 3 in 4/4
  const half = gen(`{busy: 3, hard: 3, fillAmt: 0, follow: "off", feel: "half", fromBar: 1, toBar: 2}`);
  const halfSnares = half.filter(h => h.p === 38);
  assert.equal(halfSnares.length, 2);
  assert.ok(halfSnares.every(h => h.t % 1920 === 960));
  // double feel: kick on every beat, snare on every offbeat 8th
  const dbl = gen(`{busy: 3, hard: 3, fillAmt: 0, follow: "off", feel: "double", fromBar: 1, toBar: 2}`);
  assert.equal(dbl.filter(h => h.p === 36).length, 8);
  assert.equal(dbl.filter(h => h.p === 38).length, 8);
  assert.ok(dbl.filter(h => h.p === 38).every(h => h.t % 480 === 240));
  // a ONE-VOICE passage is not a wall of breaks: following the only track
  // that plays still generates (Josh's pulse1-solo tail, 2026-08-22)
  run(`song.tracks[0].notes.push({t: 3840, d: 1920, p: 76, v: 80}); computeSongEnd();`);
  const solo = val(`(() => {
    const k = drGenerate(9, {busy: 3, hard: 3, fillAmt: 0, follow: "bass", followTi: 0, fromBar: 3, toBar: 3});
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return song.tracks[di].notes.filter(n => !n.gone && n.t >= 3840).length;
  })()`);
  assert.ok(solo > 0, "one-voice bar generated drums");
  run(`songKey = null; rollnotes = []; multiSel = []; multiSelKey = new Set();`);
});

test("Drummer: same section label = same groove, bar for bar", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/label-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [
        {name: "pulse1", notes: [ // identical melodic content in bars 1-2 and 3-4
          {t: 0, d: 960, p: 72, v: 80}, {t: 1920, d: 960, p: 74, v: 80},
          {t: 3840, d: 960, p: 72, v: 80}, {t: 5760, d: 960, p: 74, v: 80}]},
        {name: "triangle", notes: [
          {t: 0, d: 1920, p: 45, v: 90}, {t: 1920, d: 1920, p: 43, v: 90},
          {t: 3840, d: 1920, p: 45, v: 90}, {t: 5760, d: 1920, p: 43, v: 90}]}]};
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = []; dupPending = null;
    rollnotes = deriveNoteTypes([
      {b1: 1, q1: 1, b2: 2, q2: 4, text: "section: A1", added: true},
      {b1: 3, q1: 1, b2: 4, q2: 4, text: "section: A1", added: true},
    ]).map(resolveNote);
    finalizeNotes(); computeSongEnd();
  `);
  const gen = () => val(`(() => {
    const k = drGenerate(31337, {busy: 4, hard: 3, fillAmt: 0, follow: "bass", followTi: 1, fromBar: 1, toBar: 4});
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return song.tracks[di].notes.filter(n => !n.gone).map(n => ({t: n.t, p: n.p, v: n.v}));
  })()`);
  const hits = gen();
  const bt = 1920;
  const groove = h => h.p !== 49; // arrival crashes stay absolute-keyed by design
  const half1 = hits.filter(h => groove(h) && h.t < 2 * bt).map(h => (h.t) + ":" + h.p + ":" + h.v);
  const half2 = hits.filter(h => groove(h) && h.t >= 2 * bt).map(h => (h.t - 2 * bt) + ":" + h.p + ":" + h.v);
  assert.deepEqual(half2, half1); // same label restates bar-for-bar
  // different labels diverge (the manual signal is the label itself)
  run(`rollnotes = deriveNoteTypes([
      {b1: 1, q1: 1, b2: 2, q2: 4, text: "section: A1", added: true},
      {b1: 3, q1: 1, b2: 4, q2: 4, text: "section: A2", added: true},
    ]).map(resolveNote); finalizeNotes();`);
  const hits2 = gen();
  const h2b = hits2.filter(h => h.p !== 49 && h.t >= 2 * bt).map(h => (h.t - 2 * bt) + ":" + h.p + ":" + h.v);
  assert.notDeepEqual(h2b, hits2.filter(h => h.p !== 49 && h.t < 2 * bt).map(h => h.t + ":" + h.p + ":" + h.v));
  // max fills produce toms now: a boundary + fills 5 rolls from the weighted pool
  run(`rollnotes = deriveNoteTypes([
      {b1: 3, q1: 1, b2: 4, q2: 4, text: "section: B", added: true},
    ]).map(resolveNote); finalizeNotes();`);
  let toms = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const hh = val(`(() => {
      const k = drGenerate(${seed}, {busy: 5, hard: 3, fillAmt: 5, follow: "off", fromBar: 1, toBar: 4});
      const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
      return song.tracks[di].notes.filter(n => !n.gone && [48, 47, 45, 43, 41].includes(n.p)).length;
    })()`);
    toms += hh;
  }
  assert.ok(toms > 10, "weighted metal-tier fills produce toms (got " + toms + ")");
  run(`songKey = null; rollnotes = []; multiSel = []; multiSelKey = new Set();`);
});

test("diatonicShift: scale-degree steps in the declared key", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/dia-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.tracks = [{name: "pulse1", notes: [
      {t: 0, d: 480, p: 64, v: 80},   // E in F#m/A-major scale
      {t: 480, d: 480, p: 66, v: 80}, // F#
      {t: 960, d: 480, p: 63, v: 80}]}]; // D# — NOT in the scale
    song.rawNotes = null; chopS = 0; editUndo = []; editRedo = []; dupPending = null;
    rollnotes = deriveNoteTypes([{b1: 1, q1: 1, text: "key: F#m", added: true}]).map(resolveNote);
    finalizeNotes();
    multiSel = song.tracks[0].notes.map((_, ni) => ({ti: 0, ni}));
    multiSelKey = new Set(multiSel.map(x => "0:" + x.ni));
  `);
  assert.ok(val(`diatonicShift(1)`)); // up one scale degree of A major / F# minor
  // E->F# (whole step), F#->G# (whole step), D# (chromatic, out of scale) -> E
  assert.deepEqual(val(`song.tracks[0].notes.map(n => n.p)`), [66, 68, 64]);
  assert.ok(val(`diatonicShift(-1)`)); // and back down
  assert.deepEqual(val(`song.tracks[0].notes.map(n => n.p)`), [64, 66, 62]);
  run(`songKey = null; rollnotes = []; multiSel = []; multiSelKey = new Set();`);
});

test("tracks view: retrack with time offset, lane math, pencil inert", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/tracks-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.tracks = [
      {name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}, {t: 480, d: 480, p: 64, v: 80}]},
      {name: "pulse2", notes: []}];
    song.rawNotes = null; chopS = 0; editUndo = []; editRedo = []; dupPending = null;
    multiSel = [{ti: 0, ni: 0}, {ti: 0, ni: 1}]; multiSelKey = new Set(["0:0", "0:1"]);
    mvFromFilter = null;
  `);
  // retrack with a time slide: the tracks-view ghost commit path
  assert.equal(val(`moveSelectionToTrack(1, 960)`), 2);
  const moved = val(`song.tracks[1].notes.filter(n => !n.gone).map(n => ({t: n.t, p: n.p}))`);
  assert.deepEqual(moved, [{t: 960, p: 60}, {t: 1440, p: 64}]); // pitch kept, time slid
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 0);
  run(`editUndoPop()`); // one step restores both sides
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 2);
  assert.equal(val(`song.tracks[1].notes.filter(n => !n.gone).length`), 0);
  // lane geometry: fit-to-count, clamped
  run(`viewMode = "tracks"; RULER_W = TRACKS_GUTTER; view.y = 0;`);
  assert.ok(val(`tracksLaneH() >= 44 && tracksLaneH() <= 88`));
  assert.equal(val(`trackLaneAt(RULER_H + 2)`), 0);
  run(`viewMode = "roll"; RULER_W = RULER_W_ROLL; songKey = null; multiSel = []; multiSelKey = new Set();`);
});

test("Drummer parts: scoped reroll touches only its piece group", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/parts-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [
        {name: "pulse1", notes: [{t: 0, d: 3840, p: 72, v: 80}]},
        {name: "triangle", notes: [{t: 0, d: 3840, p: 45, v: 90}]}]};
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = []; dupPending = null;
    rollnotes = []; finalizeNotes(); computeSongEnd();
  `);
  // array parts === legacy string parts, and all-four === "all", bit for bit
  const legacyAll = val(`(() => { drGenerate(4242, {busy: 3, hard: 3, fillAmt: 3, follow: "off", parts: "all", fromBar: 1, toBar: 2});
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return song.tracks[di].notes.filter(n => !n.gone).map(n => n.t + ":" + n.p + ":" + n.v); })()`);
  const arrAll = val(`(() => { drGenerate(4242, {busy: 3, hard: 3, fillAmt: 3, follow: "off", parts: ["kick","snare","hats","fills"], fromBar: 1, toBar: 2});
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return song.tracks[di].notes.filter(n => !n.gone).map(n => n.t + ":" + n.p + ":" + n.v); })()`);
  assert.deepEqual(arrAll, legacyAll);
  run(`drGenerate(11, {busy: 3, hard: 3, fillAmt: 0, follow: "off", fromBar: 1, toBar: 2})`);
  const before = val(`(() => {
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return song.tracks[di].notes.filter(n => !n.gone).map(n => n.t + ":" + n.p + ":" + n.v);
  })()`);
  run(`drGenerate(999, {busy: 5, hard: 5, fillAmt: 0, follow: "off", parts: "kick", fromBar: 1, toBar: 2})`);
  const after = val(`(() => {
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return song.tracks[di].notes.filter(n => !n.gone).map(n => n.t + ":" + n.p + ":" + n.v);
  })()`);
  const nonKick = a => a.filter(x => !x.endsWith === false).filter(x => { const p = +x.split(":")[1]; return p !== 36 && p !== 35; });
  assert.deepEqual(nonKick(after).sort(), nonKick(before).sort()); // snares + hats byte-identical
  assert.notDeepEqual(after.sort(), before.sort()); // kicks actually rerolled
  run(`songKey = null; rollnotes = [];`);
});

test("Bassist: chord-driven, monophonic, one undo; melody-only infers", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/bass-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [
        {name: "pulse1", notes: [{t: 0, d: 1920, p: 69, v: 80}, {t: 1920, d: 1920, p: 64, v: 80}]},
        {name: "bass", notes: []}]};
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = []; dupPending = null;
    rollnotes = deriveNoteTypes([
      {b1: 1, q1: 1, b2: 1, q2: 4, text: "chord: A", added: true},
      {b1: 2, q1: 1, b2: 2, q2: 4, text: "chord: E/G#", added: true},
    ]).map(resolveNote);
    finalizeNotes(); computeSongEnd();
  `);
  const gen = args => val(`(() => {
    const k = bsGenerate(777, ${args});
    return {k, notes: song.tracks[1].notes.filter(n => !n.gone).map(n => ({t: n.t, p: n.p, d: n.d}))};
  })()`);
  const a = gen(`{style: "chug", busy: 3, oct: 2, follow: "chords", targetTi: 1, fromBar: 1, toBar: 2}`);
  assert.ok(a.k >= 12); // straight 8ths over two bars
  assert.ok(a.notes.filter(n => n.t < 1920).every(n => n.p % 12 === 9), "bar 1 rides A");
  assert.ok(a.notes.filter(n => n.t >= 1920).every(n => n.p % 12 === 8), "bar 2 honors the slash bass G#");
  for (let i = 0; i < a.notes.length - 1; i++)
    assert.ok(a.notes[i].t + a.notes[i].d <= a.notes[i + 1].t + 1, "strictly monophonic");
  const b = gen(`{style: "chug", busy: 3, oct: 2, follow: "chords", targetTi: 1, fromBar: 1, toBar: 2}`);
  assert.deepEqual(b.notes, a.notes); // deterministic + idempotent replace
  run(`editUndoPop()`); // undoes generation b -> generation a's notes return
  assert.equal(val(`song.tracks[1].notes.filter(n => !n.gone).length`), a.k);
  run(`editUndoPop()`); // undoes generation a -> empty again
  assert.equal(val(`song.tracks[1].notes.filter(n => !n.gone).length`), 0);
  // melody-only: no chords -> internal inference still produces bass
  run(`rollnotes = []; finalizeNotes();`);
  const c = gen(`{style: "walk", busy: 3, oct: 2, follow: "chords", targetTi: 1, fromBar: 1, toBar: 2}`);
  assert.ok(c.k > 0, "melody-only inference generates");
  run(`songKey = null; rollnotes = []; multiSel = []; multiSelKey = new Set();`);
});

test("Bassist inference: minor-key V, pedal stability, no wrong-root guesses", () => {
  installSong();
  // scratch fixture ONLY (never Josh's music): F#m declared, melody spans
  // the failure classes his graveyard-ending report exposed — a harmonic-
  // minor V bar, solo pedal bars, an out-of-vocabulary chromatic bar
  run(`
    songKey = "albums/compositions/nightroll/infer-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [
        {name: "pulse1", notes: [
          {t: 0, d: 640, p: 61, v: 80}, {t: 640, d: 640, p: 65, v: 80}, {t: 1280, d: 640, p: 68, v: 80},
          {t: 1920, d: 960, p: 61, v: 80}, {t: 2880, d: 480, p: 62, v: 80}, {t: 3360, d: 480, p: 61, v: 80},
          {t: 3840, d: 960, p: 61, v: 80}, {t: 4800, d: 480, p: 60, v: 80}, {t: 5280, d: 480, p: 61, v: 80},
          {t: 5760, d: 1440, p: 61, v: 80}, {t: 7200, d: 480, p: 66, v: 80},
          {t: 7680, d: 480, p: 60, v: 80}, {t: 8160, d: 480, p: 63, v: 80},
          {t: 8640, d: 480, p: 67, v: 80}, {t: 9120, d: 480, p: 70, v: 80}]},
        {name: "bass", notes: []}]};
    song.rawNotes = null; chopS = 0; selTrack = 0; editUndo = []; editRedo = [];
    rollnotes = deriveNoteTypes([{b1: 1, q1: 1, text: "key: F#m", added: true}]).map(resolveNote);
    finalizeNotes(); computeSongEnd();
  `);
  let sawV = false;
  for (const seed of [1, 2, 3, 4, 5]) {
    const tl = val(`bsInferTimeline(0, 9600, [0], drumRng(${seed}, 0xB055))`);
    const bar = t => tl.find(e => e.t === t);
    // bar 1 arpeggiates C#-E#-G#: every seed must land the root on C# (the
    // old diatonic-only candidate set had NO home for E#, so seeds shuffled
    // equally-wrong roots — Josh's "not a single one fit"); the V-major
    // reading holding E# must exist among the takes
    assert.equal(bar(0).rootPc, 1, "seed " + seed + ": root lands on C#");
    if (bar(0).tones.includes(5)) sawV = true;
    // bars 2-4 prolong a C# pedal with neighbor tones: a solo line must not
    // read as a new root every bar (the per-bar random walk)
    const roots = [bar(1920), bar(3840), bar(5760)].map(e => e.rootPc);
    assert.ok(new Set(roots).size <= 2, "seed " + seed + ": pedal stays put, got " + roots);
    // bar 5 is a chromatic cluster no triad holds: ride the previous chord,
    // never commit to a confident wrong root
    assert.equal(bar(7680).rootPc, bar(5760).rootPc, "seed " + seed + ": all-negative bar rides");
  }
  assert.ok(sawV, "some take reads the harmonic-minor V (E# among its tones)");
  // multi-voice census: harmony readable only from the UNION of voices
  run(`song.tracks[0].notes = [{t: 0, d: 1920, p: 61, v: 80}];
       song.tracks.splice(1, 0, {name: "pulse2", notes: [{t: 0, d: 1920, p: 65, v: 80}]});`);
  const both = val(`bsInferTimeline(0, 1920, [0, 1], drumRng(1, 0xB055))`);
  const one = val(`bsInferTimeline(0, 1920, [0], drumRng(1, 0xB055))`);
  assert.ok(both[0].tones.includes(5), "union census sees the second voice's E#");
  assert.ok(one[0].tones.includes(1), "single-index call still works (back-compat shape)");
  run(`songKey = null; rollnotes = []; multiSel = []; multiSelKey = new Set();`);
});

// Josh's rule (2026-08-25): never two key annotations at the same point in a
// song — setting a key where one already sits is an edit, not an insert. He
// hit this on airship: "F mixolydian" over a committed "key F" left both.
test("dropLocalKeyAt replaces synced keys, both key forms, at the exact anchor", () => {
  installSong();
  // a SYNCED key carries no `added` flag — that was the whole bug
  run(`rollnotes = [
    {b1: 1, q1: 1, text: "key: F", keydir: -1},
    {b1: 2, q1: 1, text: "F?", keypartial: "F"},
    {b1: 3, q1: 1, text: "key: G", keydir: 1, added: true},
    {b1: 3, q1: 3, text: "key: D", keydir: 2, added: true},
    {b1: 3, q1: 1, text: "a plain note at the same bar"}
  ];`);
  run(`dropLocalKeyAt(1, 1)`);
  assert.equal(val(`rollnotes.filter(n => n.b1 === 1).length`), 0,
    "a key loaded from a committed .rollnotes.json is replaceable (no `added` flag)");
  run(`dropLocalKeyAt(2, 1)`);
  assert.equal(val(`rollnotes.filter(n => n.b1 === 2).length`), 0,
    "the tonic-only form (keypartial, no keydir) is dropped too");
  run(`dropLocalKeyAt(3, 3)`);
  assert.deepEqual(val(`rollnotes.filter(n => n.b1 === 3).map(n => n.q1 + ":" + n.text)`),
    ["1:key: G", "1:a plain note at the same bar"],
    "anchor-level: 3.3 goes, 3.1's key survives, and non-key notes are never touched");
  run(`songKey = null; rollnotes = [];`);
});

// Josh, 2026-08-26: a chord band replaces one on the identical span, but he
// may legitimately want several DIFFERENT text notes at one anchor — only a
// byte-identical repeat is a duplicate.
test("dropSupersededBy: chords replace by span, notes only when the text repeats", () => {
  installSong();
  run(`rollnotes = [
    {b1: 15, q1: 1, b2: 15, q2: 4, text: "Cm7", chord: true},
    {b1: 15, q1: 1, b2: 15, q2: 2, text: "Bb",  chord: true},
    {b1: 16, q1: 1, b2: 16, q2: 4, text: "C",   chord: true}
  ];`);
  run(`dropSupersededBy({b1: 15, q1: 1, b2: 15, q2: 4, text: "C7", chord: true})`);
  assert.deepEqual(val(`rollnotes.map(n => n.text)`), ["Bb", "C"],
    "same span goes whatever its label; a shorter band at the same start survives");

  run(`rollnotes = [
    {b1: 14, q1: 3, text: "tritone here"},
    {b1: 14, q1: 3, text: "a different thought"},
    {b1: 15, q1: 3, text: "tritone here"}
  ];`);
  run(`dropSupersededBy({b1: 14, q1: 3, text: "  tritone here  "})`);
  assert.deepEqual(val(`rollnotes.map(n => n.b1 + "." + n.q1 + " " + n.text)`),
    ["14.3 a different thought", "15.3 tritone here"],
    "identical text at the anchor goes (trimmed); a different note there stays, as does the same text elsewhere");

  // a chord must never eat a plain note that happens to share its span
  run(`rollnotes = [{b1: 15, q1: 1, b2: 15, q2: 4, text: "C7", chord: true},
                    {b1: 15, q1: 1, b2: 15, q2: 4, text: "C7"}];`);
  run(`dropSupersededBy({b1: 15, q1: 1, b2: 15, q2: 4, text: "C7", chord: true})`);
  assert.equal(val(`rollnotes.length`), 1, "only the chord went");
  assert.equal(val(`!!rollnotes[0].chord`), false, "the plain note with the same text survived");
  run(`songKey = null; rollnotes = [];`);
});

// Josh, 2026-08-29: tapping a note in an FF1 or Mega Man song made no sound.
// All three views call previewNote, but scheduleNote's chip guard swallowed it
// on exactly the chip-backed corpus he analyzes. Silent failure — worth a test,
// because nothing about it is visible.
test("a note preview sounds on a chip song; playback notes still don't double", () => {
  installSong();
  // a chip-active song: NSF buffers keyed by track name, track on the auto voice
  run(`song.tracks = [{name: "pulse1", notes: []}];
       trackState = [{muted: false, solo: false}];
       songKey = "albums/nes/final-fantasy-i/songs/overworld.mid";
       chip.key = songKey; chip.buffers = {pulse1: {}}; chip.srcs = [{stop() {}}]; // chipStart made a source: the chip is sounding
       ensureAudio(); playing = false;`);
  assert.equal(val(`chipActive()`), true, "chip is active for this song");
  // the guard returns BEFORE the first createGain, so counting gains says
  // exactly whether a note got past it
  run(`_gains = 0; const _cg = audio.createGain.bind(audio);
       audio.createGain = () => { _gains++; return _cg(); };`);

  run(`_gains = 0; scheduleNote(0, {p: 60, v: 90, ch: 0, _preview: true}, audio.currentTime + 0.01, 0.3)`);
  assert.ok(val(`_gains`) > 0, "a preview sounds on a chip-backed track");
  run(`_gains = 0; playing = true; chip.srcs = []; scheduleNote(0, {p: 60, v: 90, ch: 0}, audio.currentTime + 0.01, 0.3); chip.srcs = [{stop() {}}]; playing = false;`);
  assert.ok(val(`_gains`) > 0, "no chip source running (a render landed mid-play): the synth plays, never silence");

  run(`_gains = 0; playing = true;
       scheduleNote(0, {p: 60, v: 90, ch: 0}, audio.currentTime + 0.01, 0.3)`);
  assert.equal(val(`_gains`), 0, "a playback note stays suppressed — the chip buffer IS the sound");

  run(`_gains = 0; song.tracks[0].voice = "strings";
       scheduleNote(0, {p: 60, v: 90, ch: 0}, audio.currentTime + 0.01, 0.3)`);
  assert.ok(val(`_gains`) > 0, "an explicit voice pick still overrides the chip, as before");

  // tests share one vm context: leave trackState at least as long as any
  // tracks a later test installs, or trackAudible() indexes undefined
  run(`playing = false; chip.key = null; chip.buffers = null; songKey = null;
       song.tracks[0].voice = undefined;`);
});

// Josh, 2026-09-06: hit live. clampView runs during the load window, so being
// in Tracks view when a load starts threw on null song — and viewMode is
// restored from localStorage, so reloading put him right back in Tracks. It
// presents as a broken song file. Self-perpetuating, so it gets a test.
test("clampView survives a null song in every view mode", () => {
  installSong();
  run(`song = null; scoreModel = null;`);
  for (const vm of ["roll", "tracks", "score"]) {
    run(`viewMode = ${JSON.stringify(vm)}`);
    assert.doesNotThrow(() => run(`clampView()`), `clampView throws in ${vm} view with no song`);
  }
  run(`viewMode = "roll";`);
  installSong();
});

// Josh, 2026-09-06: pulse2 carried both sf-organ2 and square25 in the committed
// file. Read-side dedup has existed since 08-18 and the file kept accumulating,
// so the guarantee moves to the write side — whatever list a writer hands over,
// what lands on disk has one track: directive per track.
test("serialization never writes duplicate track: directives (last wins)", () => {
  installSong();
  run(`rollnotes = [
    {b1:1,q1:1,text:"track: pulse2 voice=sf-organ2", trackdir:{name:"pulse2",voice:"sf-organ2"}},
    {b1:1,q1:1,text:"a plain note"},
    {b1:1,q1:1,text:"track: pulse2 voice=square25", trackdir:{name:"pulse2",voice:"square25"}},
    {b1:1,q1:1,text:"track: PULSE1 voice=triangle", trackdir:{name:"PULSE1",voice:"triangle"}},
    {b1:1,q1:1,text:"track: pulse1 voice=square", trackdir:{name:"pulse1",voice:"square"}}
  ];`);
  const out = val(`serializeRollnotes()`);
  const notes = JSON.parse(out).notes;
  const dirs = notes.filter(n => n.type === "track");
  assert.equal(dirs.length, 2, "one directive per track name, not four");
  assert.deepEqual(dirs.map(d => d.voice), ["square25", "square"], "last one wins for each");
  assert.equal(notes.filter(n => n.text === "a plain note").length, 1,
    "ordinary notes are untouched");
  // name matching is case-insensitive: PULSE1 and pulse1 are one track
  assert.equal(dirs.filter(d => d.track.toLowerCase() === "pulse1").length, 1,
    "PULSE1 and pulse1 collapse to one");
  run(`rollnotes = [];`);
});

test("HELP.md matches the help sheet (regenerate with node tools/build_help.mjs)", async () => {
  const { buildHelp } = await import("../tools/build_help.mjs");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const md = readFileSync(new URL("../HELP.md", import.meta.url), "utf8");
  assert.equal(md, buildHelp(html), "HELP.md is stale — run: node tools/build_help.mjs");
});

test("selection editing: move, resize, copy/paste, delete — with undo restoring", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/edit-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song.tracks = [{name: "pulse1", notes: [
      {t: 0, d: 480, p: 60, v: 80}, {t: 0, d: 480, p: 64, v: 80}, {t: 0, d: 480, p: 67, v: 80}]}];
    song.rawNotes = null; chopS = 0;
    multiSel = [{ti: 0, ni: 0}, {ti: 0, ni: 1}, {ti: 0, ni: 2}];
    multiSelKey = new Set(["0:0", "0:1", "0:2"]);
    selNote = null; editUndo = []; pencilDur = 1; pencilVel = 80; selTrack = 0; playCursor = 0;
  `);
  // move the whole chord up a third and one beat right
  assert.equal(run(`nudgeSelection(480, 4)`), true);
  assert.deepEqual(val(`song.tracks[0].notes.map(n => [n.t, n.p])`),
    [[480, 64], [480, 68], [480, 71]]);
  // shrink every note by half (the chord shortens as one)
  assert.equal(run(`resizeSelection(-240)`), true);
  assert.deepEqual(val(`song.tracks[0].notes.map(n => n.d)`), [240, 240, 240]);
  // copy, paste at beat 3 (tick 960): a progression from one pencil pass
  assert.equal(run(`copySelection()`), 3);
  run(`playCursor = 960;`);
  assert.equal(run(`pasteClipboard(playCursor)`), 3);
  assert.deepEqual(val(`song.tracks[0].notes.filter(n => !n.gone).map(n => [n.t, n.p, n.d]).slice(3)`),
    [[960, 64, 240], [960, 68, 240], [960, 71, 240]]);
  assert.equal(val(`playCursor`), 1200); // cursor sits at the end of the pasted notes: ⌘V again chains
  assert.equal(run(`pasteClipboard(playCursor)`), 3);
  assert.deepEqual(val(`song.tracks[0].notes.filter(n => !n.gone).map(n => n.t).slice(6)`), [1200, 1200, 1200]);
  assert.equal(val(`playCursor`), 1440);
  run(`editUndoPop(); playCursor = 960; multiSel = [{ti: 0, ni: 3}, {ti: 0, ni: 4}, {ti: 0, ni: 5}]; multiSelKey = new Set(["0:3", "0:4", "0:5"]);`); // back to the first paste, selected
  // paste selected the clones — nudge them down to a new chord
  assert.equal(run(`nudgeSelection(0, -2)`), true);
  assert.deepEqual(val(`song.tracks[0].notes.filter(n => !n.gone).map(n => n.p).slice(3)`), [62, 66, 69]);
  // undo the nudge, then undo the paste
  run(`document.getElementById("undobtn").click ? null : null;`);
  run(`(() => { const u = editUndo.pop(); for (const it of u.items) { const nn = song.tracks[it.ti].notes[it.ni]; nn.t = it.t; nn.d = it.d; nn.p = it.p; } })()`);
  assert.deepEqual(val(`song.tracks[0].notes.filter(n => !n.gone).map(n => n.p).slice(3)`), [64, 68, 71]);
  // delete the pasted chord
  assert.equal(run(`deleteSelection()`), 3);
  assert.equal(val(`song.tracks[0].notes.filter(n => !n.gone).length`), 3);
  run(`songKey = null; multiSel = []; multiSelKey = new Set(); song.rawNotes = null;`);
});

// The silent-switch bypass is gone (Josh, 2026-08-25). It looped a 2.0s silent
// <audio> forever so iOS would classify the tab as media playback, which the
// hardware mute switch does not silence. Every WebKit loop wrap is a seek, and
// his perf recordings put stall bursts on exactly that 2.0s beat. This test
// guards the removal: no looping media element may come back.
test("no looping keepalive media element (the 2.0s seek beat stays gone)", () => {
  assert.equal(run(`typeof makeSilentWav`), "undefined", "silent wav generator is gone");
  assert.equal(run(`typeof silentUnlock`), "undefined", "keepalive element is gone");
  // AudioBufferSourceNode.loop is fine (chip playback uses it) — the banned
  // thing is an HTMLMediaElement, whose loop wraps are seeks on WebKit
  const src = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(!/new Audio\s*\(/.test(src), "no HTMLAudioElement is constructed");
});

// ---- ✦ Ask (in-app AI): local-llm-design.md. The parser takes strings, the
// context builder reports the RULER's frame, storage never crowds drafts.
test("Ask: SSE parser takes string chunks split anywhere, skips [DONE] and junk", () => {
  const out = val(`(() => {
    const st = {buf: ""};
    const a = aiSSE(st, 'data: {"choices":[{"delta":{"content":"Hel"}}]}\\n\\ndata: {"choices":[{"del');
    const b = aiSSE(st, 'ta":{"content":"lo"}}]}\\n\\n: keepalive\\ndata: {"choices":[{"delta":{"role":"assistant"}}]}\\ndata: [DONE]\\n');
    const c = aiSSE(st, 'data: {"choices":[{"delta":{"reasoning_content":"let me think about this"}}]}\\n');
    return {a, b, c, done: !!st.done, think: st.think};
  })()`);
  assert.deepEqual(out.a, ["Hel"]);
  assert.deepEqual(out.b, ["lo"]);
  assert.deepEqual(out.c, []); // reasoning is never text
  assert.equal(out.think, "let me think about this".length);
  assert.equal(out.done, true);
});

test("Ask: span notes use the DECLARED meter's counted beat, one speller, key line by declaration", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/ask-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [{name: "pulse1", notes: [{t: 480, d: 240, p: 61, v: 80}, {t: 0, d: 480, p: 60, v: 80}]}]};
    song.rawNotes = null; chopS = 0; rollnotes = []; keyRegions = []; previewSf = null; multiSel = [];
    declaredTs = [6, 8]; computeSongEnd();
    trackState = [{muted: false, solo: false}];
  `);
  const txt = val(`askSpanNotes(0, barTicks())`);
  assert.match(txt, /6\/8: 6 beats per bar/);
  // 480 ticks = one quarter = beat 3 in 6/8 (eighths); 240 ticks = 1 beat
  assert.match(txt, /bar 1: 1 C4 2, 3 C#4 1/);
  assert.match(txt, /the true key is the user's to discover/);
  // declared flat key → flat spelling and the declared-key line
  run(`keyRegions = [{start: 0, end: null, sf: -3, name: "Eb"}]; previewSf = 4;`); // preview must NOT leak
  const txt2 = val(`askSpanNotes(0, barTicks())`);
  assert.match(txt2, /spelled by the user's declared key \(Eb\)/);
  assert.match(txt2, /3 Db4 1/);
  // ONE frame: a 4/4 song reports quarters as beats
  run(`declaredTs = null; keyRegions = []; previewSf = null; computeSongEnd();`);
  assert.match(val(`askSpanNotes(0, barTicks())`), /bar 1: 1 C4 1, 2 C#4 0\.5/);
  // context: composition flag, declared meter, cursor in the ruler's frame
  run(`playCursor = 720;`);
  const ctx = val(`askContext(askSpan(), askBudget())`);
  assert.match(ctx, /the user's own composition \(editable\)/);
  assert.match(ctx, /meter: 4\/4 \(beat = quarter\)/);
  assert.match(ctx, /cursor: bar 1 beat 2\.5/);
  assert.match(ctx, /notes in bars 1–1:/);
  run(`songKey = null; rollnotes = []; declaredTs = null; keyRegions = [];`);
});

test("Ask: history is whole until saved; only repo-held messages are shed; never throws on quota; budget trims history first", () => {
  installSong();
  run(`songKey = "albums/compositions/nightroll/ask-cap.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */`);
  const KEY = "ff1roll-ask-albums/compositions/nightroll/ask-cap.mid";
  const big = "x".repeat(5000); // 60 × 5 KB = 300 KB: over the 256 KB soft cap, under nothing else
  const sixty = `(() => { const msgs = [];
    for (let i = 0; i < 60; i++) msgs.push({role: i % 2 ? "assistant" : "user", content: "<context>\\nsecret\\n</context>\\n\\n" + ${JSON.stringify(big)} + i, t: 1758000000000 + i, at: "bars 1–4 (view)"});
    return msgs; })()`;
  // nothing saved yet: all 60 stay, no matter the size (300 KB > the old 64 KB cap)
  run(`askSave(${sixty});`);
  let st = JSON.parse(app.store.get(KEY));
  assert.equal(st.msgs.length, 60, "unsaved messages are never dropped");
  assert.equal(st.saved, 0);
  assert.ok(!JSON.stringify(st).includes("secret"), "context stripped at save");
  assert.equal(val(`askUnsavedCount()`), 60);
  // 40 already in the repo file: the soft cap sheds from the saved front only, and says so
  run(`askSave(${sixty}, {saved: 40});`);
  st = JSON.parse(app.store.get(KEY));
  assert.ok(st.trimmed, "trimmed flag set");
  assert.ok(st.msgs.length < 60 && st.msgs.length >= 20, "some saved messages shed: " + st.msgs.length);
  assert.equal(st.msgs.length - st.saved, 20, "the 20 unsaved survive intact");
  assert.match(st.msgs[st.msgs.length - 1].content, /59$/);
  // the file text Save appends: one heading per question, the reply under it
  const md = val(`askLogMarkdown([{role: "user", content: "<context>\\nctx\\n</context>\\n\\nwhat key?", t: 1758000000000, at: "bars 5–8 (ruler)"}, {role: "assistant", content: "listen to bar 6", m: "qwen/test"}])`);
  assert.match(md, /^\n### \d{4}-\d{2}-\d{2} \d{2}:\d{2} · bars 5–8 \(ruler\)\n\n\*\*Josh:\*\* what key\?\n\n\*\*AI \(qwen\/test\):\*\* listen to bar 6\n$/);
  assert.ok(!md.includes("ctx"), "log strips context too");
  // a note from the Mac (bridge inbox) is stored as its own role, rendered as a ✉ bubble, and logged as the Mac's line
  run(`asklog.innerHTML = ""; asksheet.classList.remove("on"); askNotesArrived([{id: 7, t: 1758000000000, from: "terminal", text: "pushed gbs-import"}]);`);
  assert.equal(val(`askLoad().slice(-1)[0].role`), "note");
  assert.equal(val(`askLoad().slice(-1)[0].content`), "pushed gbs-import");
  assert.ok(val(`document.getElementById("askbtn").classList.contains("hasnote")`), "✉ lights on the Ask button while the sheet is closed");
  run(`asksheet.classList.add("on"); askRender();`); // openAsk itself needs the target <select> the harness lacks
  assert.ok(val(`[...asklog.children].some(d => d.className === "askmsg note" && /from the Mac: pushed gbs-import/.test(d.textContent))`), "note bubble rendered");
  assert.match(val(`askLogMarkdown([{role: "note", content: "pushed gbs-import", m: "terminal"}])`), /\*\*Mac \(terminal\):\*\* pushed gbs-import/);
  // the general chat: its own key, session name, log path, no song context, no annotation tool; back to the song afterwards
  run(`askSetMode(true);`);
  assert.equal(val(`askStoreKey()`), "ff1roll-ask-general");
  assert.equal(val(`askSessionName()`), "general");
  assert.equal(val(`askLogPath()`), "ask/general.ask.md");
  assert.match(val(`askContext({t0: 0, t1: 1920, from: 1, to: 1}, {win: 8192})`), /^general chat — no song attached/);
  assert.ok(!val(`askToolsNow().some(t => t.function.name === "add_annotation")`), "no annotation tool in the general chat");
  assert.ok(val(`askToolsNow().some(t => t.function.name === "read_song")`), "reading songs still allowed");
  assert.match(val(`askLogHeader()`), /^# ✦ Ask log — general/);
  run(`{ const g = askLoad(); g.push({role: "user", content: "hello general", t: 1}); askSave(g); }`);
  assert.ok(val(`JSON.stringify(pendingSongs())`).includes('"general"'), "unsaved general chat shows in the Publish list");
  assert.equal(val(`askLogPath("ff1roll-ask-" + songKey)`), "albums/compositions/nightroll/ask-cap.ask.md", "a song's log path is untouched by the mode");
  run(`askSetMode(false); localStorage.removeItem("ff1roll-ask-general");`);
  assert.equal(val(`askStoreKey()`), "ff1roll-ask-albums/compositions/nightroll/ask-cap.mid");
  assert.equal(val(`askSessionName()`), "albums/compositions/nightroll/ask-cap.mid");
  assert.equal(val(`askLogPath()`), "albums/compositions/nightroll/ask-cap.ask.md");
  // other songs' logs: a clean one is evicted for space, one with unsaved messages never
  run(`localStorage.setItem("ff1roll-ask-a/clean.mid", JSON.stringify({lastUsed: 1, saved: 2, msgs: [{role: "user", content: "q".repeat(300000)}, {role: "assistant", content: "a"}]}));
       localStorage.setItem("ff1roll-ask-a/dirty.mid", JSON.stringify({lastUsed: 2, saved: 0, msgs: [{role: "user", content: "q".repeat(300000)}, {role: "assistant", content: "a"}]}));
       askSave([{role: "user", content: "hi"}, {role: "assistant", content: "yo"}]);`);
  assert.deepEqual(JSON.parse(app.store.get("ff1roll-ask-a/clean.mid")), {lastUsed: 1, msgs: [], saved: 0, trimmed: true}, "clean log evicted, but marked: the repo file holds it");
  assert.ok(app.store.get("ff1roll-ask-a/dirty.mid"), "log with unsaved messages kept");
  // quota: a throwing setItem must not propagate
  run(`(() => { const real = localStorage.setItem; localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
    try { askSave([{role: "user", content: "hi"}]); } finally { localStorage.setItem = real; } })()`);
  // budget: with a tiny history budget, the newest turn survives and the context rides only on the last message
  const built = val(`askBuildMessages([{role: "user", content: "a".repeat(3000)}, {role: "assistant", content: "b".repeat(100)}], "now", "CTX", {hist: 100})`);
  assert.equal(built.length, 2);
  assert.equal(built[0].content, "b".repeat(100));
  assert.match(built[1].content, /^<context>\nCTX\n<\/context>\n\nnow$/);
  run(`for (const k of ["${KEY}", "ff1roll-ask-a/clean.mid", "ff1roll-ask-a/dirty.mid"]) localStorage.removeItem(k); songKey = null;`);
});

test("Save & Commit: pendingSongs unions music edits, unsynced annotations and unsaved chat, open song first", () => {
  installSong();
  run(`songKey = "albums/compositions/nightroll/p-open.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
       localStorage.setItem("ff1roll-draft-albums/compositions/nightroll/p-music.mid", JSON.stringify({savedStamp: 5, dirty: true, notes: []}));
       localStorage.setItem("ff1roll-draft-albums/compositions/nightroll/p-clean.mid", JSON.stringify({savedStamp: 5, dirty: false, notes: []}));
       localStorage.setItem("ff1roll-notes-albums/nes/final-fantasy-i/songs/p-notes.mid", JSON.stringify([{b1: 1, q1: 1, text: "x", added: true}]));
       localStorage.setItem("ff1roll-ask-albums/compositions/nightroll/p-open.mid", JSON.stringify({saved: 0, msgs: [{role: "user", content: "q"}, {role: "assistant", content: "a"}]}));
       localStorage.setItem("ff1roll-ask-albums/compositions/nightroll/p-saved.mid", JSON.stringify({saved: 2, msgs: [{role: "user", content: "q"}, {role: "assistant", content: "a"}]}));
       localStorage.setItem("ff1roll-ask-local/p.mid", JSON.stringify({saved: 0, msgs: [{role: "user", content: "q"}]}));`);
  const all = JSON.parse(val(`JSON.stringify(pendingSongs())`)); // earlier tests leave their own dirty drafts behind: look only at ours
  assert.equal(all[0], "albums/compositions/nightroll/p-open.mid", "the open song comes first");
  const got = all.filter(k => /\/p-[a-z]+\.mid$/.test(k));
  assert.deepEqual(got, ["albums/compositions/nightroll/p-open.mid", "albums/compositions/nightroll/p-music.mid", "albums/nes/final-fantasy-i/songs/p-notes.mid"]);
  assert.equal(val(`draftDirtyState("albums/compositions/nightroll/p-music.mid")`), "edited");
  assert.equal(val(`draftDirtyState("albums/compositions/nightroll/p-clean.mid")`), null);
  run(`for (const k of ["ff1roll-draft-albums/compositions/nightroll/p-music.mid", "ff1roll-draft-albums/compositions/nightroll/p-clean.mid",
       "ff1roll-notes-albums/nes/final-fantasy-i/songs/p-notes.mid", "ff1roll-ask-albums/compositions/nightroll/p-open.mid",
       "ff1roll-ask-albums/compositions/nightroll/p-saved.mid", "ff1roll-ask-local/p.mid"]) localStorage.removeItem(k); songKey = null;`);
});

test("Compare with repo: cmpDiff — by track name, tick+pitch identity, tombstones ignored, unnamed tracks by position", () => {
  const repo = [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 100}, {t: 480, d: 480, p: 64, v: 100}, {t: 960, d: 480, p: 67, v: 100}]},
                {name: "", notes: [{t: 0, d: 240, p: 36, v: 90}]}];
  const cur = [{name: "", notes: [{t: 0, d: 240, p: 36, v: 90}]}, // unnamed, now first: matched by position "#1" vs "#0" — a rename, so it diffs
               {name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 100}, {t: 480, d: 960, p: 64, v: 100}, {t: 960, d: 480, p: 67, v: 100, gone: true}, {t: 1440, d: 480, p: 72, v: 80}]}];
  const d = JSON.parse(val(`JSON.stringify(cmpDiff(${JSON.stringify(repo)}, ${JSON.stringify(cur)}))`));
  const p1 = d.tracks.find(t => t.name === "pulse1");
  assert.equal(p1.ti, 1, "current track index, for drawing");
  assert.deepEqual(p1.added.map(n => n.p), [72]);
  assert.deepEqual(p1.removed.map(n => n.p), [67], "a tombstoned note counts as removed");
  assert.equal(p1.changed.length, 1); assert.equal(p1.changed[0].was.d, 480); assert.equal(p1.changed[0].now.d, 960);
  assert.equal(d.added, 1 + 1); assert.equal(d.removed, 1 + 1); assert.equal(d.changed, 1);
  // identical → nothing
  assert.equal(val(`cmpDiff(${JSON.stringify(repo)}, ${JSON.stringify(repo)}).tracks.length`), 0);
  // hearing the saved copy makes the song read-only; the draft writer refuses
  installSong();
  run(`songKey = "albums/compositions/nightroll/cmp-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */ cmp = {showing: "repo", diff: {tracks: [], added: 0, removed: 0, changed: 0}};`);
  assert.equal(val(`editableSong()`), false);
  run(`localStorage.removeItem("ff1roll-draft-albums/compositions/nightroll/cmp-test.mid"); saveDraft(false);`);
  assert.equal(app.store.get("ff1roll-draft-albums/compositions/nightroll/cmp-test.mid"), undefined, "no draft written while the saved copy is swapped in");
  run(`cmp = null; songKey = null;`);
});

test("dictation: micJoin spaces Safari's pause-split segments and closes sentences before a capitalized one", () => {
  assert.equal(val(`micJoin(["I'm gonna pause right now", "And then I'm gonna continue"])`), "I'm gonna pause right now. And then I'm gonna continue");
  assert.equal(val(`micJoin(["so it needs, ", "some modifications"])`), "so it needs, some modifications");
  assert.equal(val(`micJoin(["Is that right?", "Yes"])`), "Is that right? Yes");
  assert.equal(val(`micJoin(["", "hello", "", "world"])`), "hello world");
  assert.equal(val(`micJoin(["typed already ", "Dictated next"])`), "typed already. Dictated next");
});

test("dictation: a tapped Stop keeps onresult for Safari's late transcript; Send/close discard it; Ask box grows on input", () => {
  // iPad Safari delivers most of the words AFTER stop(): a plain stop must let them land
  run(`var _rec = {stopped: false, stop() { this.stopped = true; }, onresult: () => {}, onend: () => {}, onerror: () => {}};
       micRec = _rec; micBtn = null; micStop();`);
  assert.equal(val(`_rec.stopped`), true, "recognizer stopped");
  assert.equal(val(`typeof _rec.onresult`), "function", "result handler stays for the late transcript");
  assert.equal(val(`_rec.onend`), null, "end handler detached");
  assert.equal(val(`micRec`), null);
  assert.equal(val(`micPrev === _rec`), true, "remembered so a new session can silence it");
  // Send clears the box: its late result must NOT land
  run(`var _rec2 = {stopped: false, stop() { this.stopped = true; }, onresult: () => {}, onend: () => {}, onerror: () => {}};
       micRec = _rec2; micBtn = document.getElementById("askmic"); askMicOff();`);
  assert.equal(val(`_rec2.stopped`), true);
  assert.equal(val(`_rec2.onresult`), null, "Send discards the late result");
  assert.equal(val(`micPrev === _rec`), true, "a discarded stop does not replace the remembered one");
  run(`micPrev = null;`);
  run(`askinput.scrollHeight = 90; askinput.value = "a b c";`);
  app.dispatch("askinput", { type: "input" });
  assert.equal(val(`askinput.style.height`), "90px", "box sized to its text");
  assert.equal(val(`askinput.scrollTop`), 90, "end kept in view");
});

test("Ask stream: a whole bridge step becomes the visible note; thinking fragments do not", () => {
  const st = JSON.parse(val(`(() => { const st = {buf: ""}; aiSSE(st, 'data: {"choices":[{"delta":{"reasoning_content":"using Bash npm test… "}}]}\\n'); aiSSE(st, 'data: {"choices":[{"delta":{"reasoning_content":"Let me th"}}]}\\n'); return JSON.stringify({note: st.note, think: st.think}); })()`));
  assert.equal(st.note, "Bash npm test", "the step, without its 'using' and ellipsis");
  assert.ok(st.think > 0, "fragments still count toward the LM Studio wait");
});

test("Ask tools: SSE tool_calls accumulate per index; add_annotation writes through the text grammar as unsynced; read helpers", () => {
  // streamed tool call: name in one chunk, arguments split across chunks, finish_reason at the end
  const chunks = [
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"add_annotation","arguments":"{\\"kind\\":\\"chord\\","}}]}}]}\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"text\\":\\"F#m\\",\\"bar\\":21,\\"beat\\":1}"}}]}}]}\n',
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n', 'data: [DONE]\n'];
  const st = JSON.parse(val(`(() => { const st = {buf: ""}; for (const c of ${JSON.stringify(chunks)}) aiSSE(st, c); return JSON.stringify(st); })()`));
  assert.equal(st.tools[0].id, "call_1"); assert.equal(st.tools[0].name, "add_annotation");
  assert.deepEqual(JSON.parse(st.tools[0].args), {kind: "chord", text: "F#m", bar: 21, beat: 1});
  assert.equal(st.finish, "tool_calls");
  // add_annotation: chord with a range and a comment; section; loop replaces a local loop
  installSong();
  run(`rollnotes = []; songKey = "albums/compositions/nightroll/tool-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */`);
  const r1 = JSON.parse(val(`JSON.stringify(askAddAnnotation({kind: "chord", text: "F#m", bar: 21, beat: 1, end_bar: 21, end_beat: 4, comment: "his call"}))`));
  assert.equal(r1.ok, true); assert.equal(r1.at, "[21.1 - 21.4]");
  const n1 = JSON.parse(val(`JSON.stringify(rollnotes.map(n => ({b1: n.b1, q1: n.q1, b2: n.b2, q2: n.q2, text: n.text, chord: !!n.chord, section: !!n.section, added: !!n.added, cnote: n.cnote})))`));
  assert.equal(n1.length, 1);
  assert.equal(n1[0].chord, true); assert.equal(n1[0].text, "F#m"); assert.equal(n1[0].added, true); assert.equal(n1[0].b2, 21); assert.equal(n1[0].q2, 4); assert.equal(n1[0].cnote, "his call");
  run(`askAddAnnotation({kind: "section", text: "A", bar: 6, beat: 1, end_bar: 12}); askAddAnnotation({kind: "loop", text: "5.1", bar: 25, beat: 1}); askAddAnnotation({kind: "loop", text: "6.1", bar: 25, beat: 1}); askAddAnnotation({kind: "note", text: "plain prose", bar: 3, beat: 2.5});`);
  const n2 = JSON.parse(val(`JSON.stringify(rollnotes.map(n => ({text: n.text, section: !!n.section, loop: n.loopTo !== undefined, q1: n.q1})))`));
  assert.equal(n2.filter(n => n.section).length, 1, "one section");
  assert.equal(n2.filter(n => n.loop).length, 1, "the second loop replaced the first");
  assert.ok(n2.some(n => n.text === "plain prose" && n.q1 === 2.5));
  assert.throws(() => run(`askAddAnnotation({kind: "chord", text: "", bar: 1, beat: 1})`), /empty text/);
  // read helpers
  const txt = val(`notesTxtForDoc({ppq: 480, timesig: [4, 4], tempos: [{usq: 500000}], tracks: [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 100}, {t: 1920, d: 240, p: 64, v: 100}]}]}, "Probe", 2, 2)`);
  assert.match(txt, /^# Probe — 4\/4, 120bpm, 2 bars \(bars 2–2 shown\)/);
  assert.match(txt, /bar 2: 1 E4 0\.5/); assert.ok(!txt.includes("bar 1:"));
  run(`CATALOG["Probe Album"] = [["Ambush", "albums/x/ambush.mid"]];`);
  assert.equal(val(`askSongPath("ambush")`), "albums/x/ambush.mid");
  assert.equal(val(`askSongPath("Ambush")`), "albums/x/ambush.mid");
  assert.throws(() => val(`askSongPath("nothing-here")`), /list_songs/);
  run(`delete CATALOG["Probe Album"]; rollnotes = []; localStorage.removeItem("ff1roll-notes-albums/compositions/nightroll/tool-test.mid"); songKey = null;`);
});

test("Ask jobs: a pending question is stored at send time; finish/fail replace the marker; history skips it", () => {
  installSong();
  run(`songKey = "albums/compositions/nightroll/job-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
       askSave([{role: "user", content: "earlier q"}, {role: "assistant", content: "earlier a"}, {role: "user", content: "in flight", t: 1, at: "bars 1–4 (view)", pending: "nr_abc"}]);`);
  const built = JSON.parse(val(`JSON.stringify(askBuildMessages(askLoad(), "in flight", "CTX", {hist: 100000}))`));
  assert.equal(built.length, 3, "history + the live question, the pending copy skipped");
  assert.equal(built[0].content, "earlier q"); assert.match(built[2].content, /in flight$/);
  run(`askFinish("nr_abc", "the answer");`);
  let st = JSON.parse(app.store.get("ff1roll-ask-albums/compositions/nightroll/job-test.mid"));
  assert.equal(st.msgs.length, 4); assert.equal(st.msgs[2].pending, undefined); assert.equal(st.msgs[3].role, "assistant"); assert.equal(st.msgs[3].content, "the answer");
  run(`askFinish("nr_abc", "again");`); // idempotent: no marker, nothing added
  st = JSON.parse(app.store.get("ff1roll-ask-albums/compositions/nightroll/job-test.mid")); assert.equal(st.msgs.length, 4);
  run(`const m = askLoad(); m.push({role: "user", content: "second", pending: "nr_def"}); askSave(m); askFail("nr_def", "stopped");`);
  st = JSON.parse(app.store.get("ff1roll-ask-albums/compositions/nightroll/job-test.mid"));
  assert.equal(st.msgs.length, 6); assert.equal(st.msgs[5].content, "⚠ stopped"); assert.equal(st.msgs[4].pending, undefined);
  assert.equal(val(`askUnsavedCount()`), 6);
  run(`localStorage.removeItem("ff1roll-ask-albums/compositions/nightroll/job-test.mid"); songKey = null;`);
});

test("Ask reply badge: a reply landing with the sheet closed lights ✦ reply and the info strip; open sheet redraws instead; the reply follows its song", () => {
  installSong();
  run(`songKey = "albums/compositions/nightroll/job-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */ asksheet.classList.remove("on"); askBadgeOff();
       askSave([{role: "user", content: "q", t: 1, at: "bars 1–4 (view)", pending: "nr_one"}]);
       askFinish("nr_one", "the answer");`);
  assert.equal(val(`document.getElementById("askreplybtn").style.display`), "", "badge shows when the sheet is closed");
  assert.match(val(`document.getElementById("noteinfo").textContent`), /✦ Ask replied/);
  run(`askBadgeOff(); asksheet.classList.add("on"); askRender();`); // what openAsk does (its target picker needs a real <select>)
  assert.equal(val(`document.getElementById("askreplybtn").style.display`), "none", "opening Ask clears the badge");
  assert.equal(val(`asklog.children.filter(c => c.className === "askmsg ai").pop().textContent`), "the answer", "the sheet shows the landed reply");
  run(`{ const mm = askLoad(); mm.push({role: "user", content: "q2", pending: "nr_two"}); askSave(mm); } asklog.innerHTML = ""; asklog.children.length = 0; askFinish("nr_two", "second");`);
  assert.equal(val(`document.getElementById("askreplybtn").style.display`), "none", "sheet open on this song: no badge");
  assert.equal(val(`asklog.children.filter(c => c.className === "askmsg ai").pop().textContent`), "second", "sheet open: redrawn with the reply");
  // the song changed while the job cooked: the reply lands in the asking song's log, the badge names it
  run(`{ const mm = askLoad(); mm.push({role: "user", content: "q3", pending: "nr_three"}); askSave(mm); }
       songKey = "albums/compositions/nightroll/other.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */ askFinish("nr_three", "third", "ff1roll-ask-albums/compositions/nightroll/job-test.mid");`);
  assert.equal(val(`askLoad().length`), 0, "the open song's log is untouched");
  let st = JSON.parse(app.store.get("ff1roll-ask-albums/compositions/nightroll/job-test.mid"));
  assert.equal(st.msgs[st.msgs.length - 1].content, "third"); assert.equal(st.msgs[st.msgs.length - 2].pending, undefined);
  assert.equal(val(`document.getElementById("askreplybtn").style.display`), "", "another song is open: badge");
  assert.match(val(`document.getElementById("noteinfo").textContent`), / in /);
  run(`asksheet.classList.remove("on"); askBadgeOff(); localStorage.removeItem("ff1roll-ask-albums/compositions/nightroll/job-test.mid"); localStorage.removeItem("ff1roll-ask-albums/compositions/nightroll/other.mid"); songKey = null;`);
});

test("Ask resume: pending questions are found across every chat; a tool round moves the marker; eviction leaves the repo marker; Publish stops at a pending question", () => {
  installSong();
  run(`songKey = "albums/compositions/nightroll/pend-a.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
       askSave([{role: "user", content: "a", t: 5, pending: "nr_a"}]);
       askSave([{role: "user", content: "g", t: 2, pending: "nr_g"}], undefined, ASK_GENERAL_KEY);
       askSave([{role: "user", content: "old q"}, {role: "assistant", content: "old a"}], {saved: 2}, "ff1roll-ask-albums/compositions/nightroll/pend-b.mid");`);
  const all = JSON.parse(val(`JSON.stringify(askPendingAll().map(p => [p.key, p.jobId]))`));
  assert.deepEqual(all, [["ff1roll-ask-general", "nr_g"], ["ff1roll-ask-albums/compositions/nightroll/pend-a.mid", "nr_a"]], "oldest first, the general chat and other songs included");
  assert.equal(val(`askRepending("ff1roll-ask-albums/compositions/nightroll/pend-a.mid", "nr_a", "nr_a-r1")`), true);
  assert.equal(val(`askLoad()[0].pending`), "nr_a-r1", "the marker follows the tool round's job id");
  assert.equal(val(`askRepending(askStoreKey(), "nr_zzz", "x")`), false);
  // eviction: a clean log (all in the repo) gives way, but keeps the marker that says so
  run(`askEvictOthers(ASK_TOTAL_CAP + 1);`);
  const b = JSON.parse(app.store.get("ff1roll-ask-albums/compositions/nightroll/pend-b.mid"));
  assert.equal(b.trimmed, true); assert.deepEqual(b.msgs, []); assert.equal(b.saved, 0);
  assert.ok(app.store.get("ff1roll-ask-general"), "a log with an unanswered question is never evicted");
  // the publish watermark never passes a pending question: the reply that lands after it stays unsaved
  run(`askSave([{role: "user", content: "q1"}, {role: "assistant", content: "a1"}, {role: "user", content: "q2", t: 9, pending: "nr_p"}, {role: "note", content: "hi", m: "terminal"}]);`);
  const st = JSON.parse(val(`JSON.stringify(askStore())`));
  const stop = st.msgs.findIndex((m, k) => k >= st.saved && m.pending);
  assert.equal(st.msgs.slice(st.saved, stop).length, 2, "what Publish would append: up to the pending question only");
  run(`askFinish("nr_p", "a2");`);
  assert.equal(val(`askUnsavedCount()`), 5);
  run(`localStorage.removeItem("ff1roll-ask-albums/compositions/nightroll/pend-a.mid"); localStorage.removeItem("ff1roll-ask-albums/compositions/nightroll/pend-b.mid"); localStorage.removeItem(ASK_GENERAL_KEY); songKey = null;`);
});

test("Share link: songs= parses owner/repo or a base URL; the link carries it only for songs that live elsewhere", () => {
  assert.equal(val(`linkSongsBase("alice/tunes")`), "https://raw.githubusercontent.com/alice/tunes/main");
  assert.equal(val(`linkSongsBase("https://example.com/songs/")`), "https://example.com/songs");
  assert.equal(val(`linkSongsBase("not a repo!")`), null);
  assert.equal(val(`linkSongsBase("")`), null);
  assert.equal(val(`linkRepoLabel("https://raw.githubusercontent.com/alice/tunes/main")`), "alice/tunes");
  assert.equal(val(`linkRepoLabel("https://example.com/songs")`), "https://example.com/songs");
  installSong();
  run(`APP_BASE = "https://joshcough.github.io/night-roll/"; saveCfg({songsBase: ""});`);
  assert.equal(val(`shareLinkFor("albums/compositions/nightroll/ambush.mid")`), "https://joshcough.github.io/night-roll/albums/compositions/nightroll/ambush");
  run(`saveCfg({songsBase: "https://raw.githubusercontent.com/alice/tunes/main/"});`);
  assert.equal(val(`shareLinkFor("albums/test/scratch.mid")`), "https://joshcough.github.io/night-roll/albums/test/scratch?songs=alice%2Ftunes");
  run(`saveCfg({songsBase: ""}); songKey = null;`);
});

test("Connect GitHub: annotations follow the songs repo unless split on purpose; Check messages name the fix", () => {
  run(`localStorage.removeItem("ff1roll-cfg"); cfg.c = null;`);
  assert.equal(val(`cfg().analysisRepo`), "joshcough/night-roll");
  run(`document.getElementById("cfgsongsrepo").value = "alice/tunes"; settingsPersist("cfgsongsrepo");`); // a new user types their repo: both were the default
  assert.equal(val(`cfg().songsRepo`), "alice/tunes");
  assert.equal(val(`cfg().analysisRepo`), "alice/tunes", "annotations follow");
  run(`saveCfg({analysisRepo: "alice/notes"}); document.getElementById("cfgsongsrepo").value = "alice/music"; settingsPersist("cfgsongsrepo");`);
  assert.equal(val(`cfg().analysisRepo`), "alice/notes", "a deliberate split stays split");
  assert.match(val(`ghCheckMessage("a/b", 200, {permissions: {push: true}})`), /^✓ connected — a\/b/);
  assert.match(val(`ghCheckMessage("a/b", 200, {permissions: {push: false}})`), /Contents: Read and write/);
  assert.match(val(`ghCheckMessage("a/b", 404, null)`), /no access to a\/b/);
  assert.match(val(`ghCheckMessage("a/b", 401, null)`), /rejected the token/);
  // NSF repo: Josh's archive only when the songs repo is this site's; anyone else starts device-only
  run(`localStorage.removeItem("ff1roll-cfg"); cfg.c = null;`);
  assert.equal(val(`cfg().nsfRepo`), "joshcough/nsf-archive");
  run(`localStorage.setItem("ff1roll-cfg", JSON.stringify({songsRepo: "alice/tunes"})); cfg.c = null;`);
  assert.equal(val(`cfg().nsfRepo`), "");
  run(`document.getElementById("cfgnsfrepo").value = "alice/nsf"; settingsPersist("cfgnsfrepo");`);
  assert.equal(val(`cfg().nsfRepo`), "alice/nsf"); assert.equal(val(`cfg().nsfBase`), "https://raw.githubusercontent.com/alice/nsf/main");
  run(`localStorage.removeItem("ff1roll-cfg"); cfg.c = null;`);
});

test("Songs README: the block lists every song as a player link; splice creates, appends, or replaces between markers only", () => {
  installSong();
  run(`APP_BASE = "https://joshcough.github.io/night-roll/"; saveCfg({songsBase: ""});`);
  const albums = [{title: "Tunes", songs: [{title: "One", path: "albums/tunes/one.mid"}, {title: "Two", path: "albums/tunes/two.mid"}]}, {title: "Empty", songs: []}];
  const block = val(`songsReadmeBlock(${JSON.stringify(albums)}, "alice/tunes")`);
  assert.match(block, /^<!-- night-roll:songs -->\n## Songs — open in Night Roll/);
  assert.match(block, /- \[One\]\(https:\/\/joshcough\.github\.io\/night-roll\/albums\/tunes\/one\?songs=alice%2Ftunes\)/);
  assert.ok(!block.includes("Empty"), "albums with no songs are skipped");
  assert.match(block, /<!-- \/night-roll:songs -->$/);
  const own = val(`songsReadmeBlock(${JSON.stringify(albums)}, "joshcough/night-roll")`);
  assert.match(own, /\(https:\/\/joshcough\.github\.io\/night-roll\/albums\/tunes\/one\)/, "the site's own repo needs no songs=");
  assert.equal(val(`spliceReadme("", "B")`), "B\n");
  assert.equal(val(`spliceReadme("# Mine\\n\\nprose\\n", "B")`), "# Mine\n\nprose\n\nB\n");
  assert.equal(val(`spliceReadme("# Mine\\n\\n<!-- night-roll:songs -->old<!-- /night-roll:songs -->\\n\\ntail\\n", "<!-- night-roll:songs -->new<!-- /night-roll:songs -->")`), "# Mine\n\n<!-- night-roll:songs -->new<!-- /night-roll:songs -->\n\ntail\n");
  run(`saveCfg({songsBase: ""}); songKey = null;`);
});

test("Local Save: auto-save off by default; Save is the checkpoint the ● and Compare use; Revert stashes, Restore brings it back", () => {
  installSong();
  run(`songKey = "albums/compositions/nightroll/save-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */ song.tracks = [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 100}]}]; song.baseTempos = song.tempos;
       localStorage.removeItem("ff1roll-autosave"); for (const k of ["ff1roll-save-", "ff1roll-stash-", "ff1roll-notes-"]) localStorage.removeItem(k + songKey);`);
  assert.equal(val(`autosaveOn()`), false, "off by default");
  run(`saveDraft(false);`); // an edit: working copy, dirty vs publish (the draft IS the local copy that makes it editable)
  assert.equal(val(`songUnsaved()`), true, "never saved locally: unsaved = unpublished");
  assert.equal(val(`saveCheckpoint(true)`), true);
  assert.equal(val(`songUnsaved()`), false, "right after Save: clean");
  assert.ok(val(`lastSaveDoc().savedAt > 0`));
  run(`song.tracks[0].notes.push({t: 480, d: 480, p: 64, v: 100}); saveDraft(false);`);
  assert.equal(val(`songUnsaved()`), true, "an edit after Save: unsaved");
  assert.equal(val(`songDocSig(lastSaveDoc()) === songDocSig(draftDoc(false))`), false);
  // Revert to last save = stash the working copy, restore the checkpoint
  run(`stashWorking(songKey); localStorage.setItem(draftStoreKey(songKey), JSON.stringify(lastSaveDoc()));`);
  assert.equal(val(`hasStash()`), true);
  assert.equal(val(`JSON.parse(localStorage.getItem(draftStoreKey(songKey))).tracks[0].notes.length`), 1);
  assert.equal(val(`restoreStash(songKey)`), true);
  assert.equal(val(`JSON.parse(localStorage.getItem(draftStoreKey(songKey))).tracks[0].notes.length`), 2, "the stashed working copy is back");
  assert.equal(val(`hasStash()`), false);
  // auto-save on: the ● means unpublished, the checkpoint is ignored
  run(`localStorage.setItem("ff1roll-autosave", "1"); saveDraft(true);`);
  assert.equal(val(`songUnsaved()`), false);
  run(`saveDraft(false);`); assert.equal(val(`songUnsaved()`), true);
  run(`localStorage.removeItem("ff1roll-autosave"); for (const k of ["ff1roll-draft-", "ff1roll-save-", "ff1roll-stash-", "ff1roll-notes-"]) localStorage.removeItem(k + songKey); songKey = null;`);
});

test("Recording: ● opens the loop end so a take past bar 2 grows the song instead of wrapping", () => {
  const seg = JSON.parse(val(`JSON.stringify(recOpenEnded({start: 0, end: 4}))`));
  assert.equal(seg.start, 0); assert.equal(seg.end, null, "Infinity serializes as null: the end is open");
  assert.equal(val(`isFinite(recOpenEnded({start: 1.5, end: 4}).end)`), false);
  assert.equal(val(`recOpenEnded({start: 1.5, end: 4}).start`), 1.5, "a cycle's start is kept; only the end opens");
  // playSec's wrap math is a no-op on an open segment
  assert.equal(val(`(() => { const s = 9.75, l = recOpenEnded({start: 0, end: 4}); return s < l.end ? s : l.start + (s - l.end) % (l.end - l.start); })()`), 9.75);
});

test("Publish all: isCompositionKey mirrors isComposition for a closed song; notesTxtFor renders a passed document", () => {
  run(`localStorage.setItem("ff1roll-draft-albums/compositions/other.mid", JSON.stringify({dirty: true, tracks: []}));`);
  assert.equal(val(`isCompositionKey("albums/compositions/nightroll/x.mid")`), false, "a Sketches song with no local copy is a published copy like any other (2026-09-27)");
  assert.equal(val(`isCompositionKey("albums/compositions/other.mid")`), true, "a draft marks it as ours");
  assert.equal(val(`isCompositionKey("albums/compositions/stranger.mid")`), false);
  assert.equal(val(`isCompositionKey("albums/nes/final-fantasy-i/songs/airship.mid")`), false);
  run(`localStorage.removeItem("ff1roll-draft-albums/compositions/other.mid");`);
  const txt = val(`notesTxtFor({ppq: 480, timesig: [3, 4], tempos: [{usq: 600000}], tracks: [{name: "lead", notes: [{t: 0, d: 480, p: 67, v: 100}]}]}, "albums/x/waltz.mid")`);
  assert.match(txt, /^# waltz\.mid — 3\/4, 100bpm, 1 bars/);
  assert.match(txt, /## track 1 \(lead\)\nbar 1: 1 G4 1/);
  assert.equal(val(`askLogPath("albums/x/waltz.mid")`), "albums/x/waltz.ask.md");
});

test("Ask: host consent — localhost never prompts, other hosts once", () => {
  assert.equal(val(`aiHostKind("http://localhost:1234")`), "local");
  assert.equal(val(`aiHostKind("http://127.0.0.1:1234")`), "local");
  assert.equal(val(`aiHostKind("https://mac.tail.ts.net")`), "other");
  assert.equal(val(`aiHostKind("not a url")`), "bad");
});

test("Bassist golden fixture: applyTake extraction is byte-stable (notes, velocities, order, rawNotes mirror, undo shape)", () => {
  const golden = JSON.parse(readFileSync(new URL("./fixtures/bassist-golden.json", import.meta.url), "utf8"));
  run(`
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}], tracks: [
      {name: "pulse1", notes: [{t: 0, d: 1920, p: 69, v: 80}, {t: 1920, d: 1920, p: 64, v: 80}, {t: 3840, d: 960, p: 67, v: 80}]},
      {name: "bass", notes: [{t: 480, d: 240, p: 45, v: 70}, {t: 4000, d: 200, p: 40, v: 70}]}]};
    songKey = "albums/compositions/nightroll/golden.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */ keyRegions = []; previewSf = null; playCursor = 0;
    song.rawNotes = [[{t: 0, d: 1920, p: 69, v: 80}, {t: 1920, d: 1920, p: 64, v: 80}, {t: 3840, d: 960, p: 67, v: 80}], [{t: 480, d: 240, p: 45, v: 70, ri: 0}, {t: 4000, d: 200, p: 40, v: 70, ri: 1}]];
    song.tracks[1].notes[0].ri = 0; song.tracks[1].notes[1].ri = 1;
    chopS = 0; selTrack = 0; editUndo = []; editRedo = []; dupPending = null;
    rollnotes = deriveNoteTypes([
      {b1: 1, q1: 1, b2: 1, q2: 4, text: "chord: A", added: true},
      {b1: 2, q1: 1, b2: 2, q2: 4, text: "chord: E/G#", added: true},
    ]).map(resolveNote);
    finalizeNotes(); computeSongEnd();
  `);
  const cases = [
    `{style: "chug", busy: 3, oct: 2, follow: "chords", targetTi: 1, fromBar: 1, toBar: 2}`,
    `{style: "walk", busy: 4, oct: 1, follow: "t0", targetTi: 1, fromBar: 1, toBar: 3}`,
    `{style: "riff", busy: 2, oct: 3, follow: "chords", targetTi: 1, fromBar: 2, toBar: 2}`,
  ];
  cases.forEach((c, i) => {
    const r = val(`(() => { const k = bsGenerate(${1000 + i}, ${c});
      const u = editUndo[editUndo.length - 1];
      return {k, notes: song.tracks[1].notes.map(n => [n.t, n.d, n.p, n.v, !!n.gone, !!n.added, n.ri]), raw: song.rawNotes[1].map(n => [n.t, n.d, n.p, n.v, !!n.gone, !!n.added]),
        undo: {kind: u.kind, kinds: u.entries.map(e => e.kind), counts: u.entries.map(e => e.items.length)}, undoLen: editUndo.length}; })()`);
    assert.deepEqual(r, golden[i], "case " + i);
    run(`editUndoPop()`);
  });
  run(`songKey = null; rollnotes = []; song.rawNotes = null;`);
});

test("Fill: parsePitch pins pitchName's octave (C4 = 60), double accidentals, MIDI numbers", () => {
  assert.equal(val(`parsePitch("C4")`), 60);
  assert.equal(val(`parsePitch("C3")`), 48);
  assert.equal(val(`parsePitch("F#3")`), 54);
  assert.equal(val(`parsePitch("Bb2")`), 46);
  assert.equal(val(`parsePitch("F##3")`), 55);
  assert.equal(val(`parsePitch("Cbb4")`), 58);
  assert.equal(val(`parsePitch("60")`), 60);
  assert.equal(val(`parsePitch("H4")`), null);
  assert.equal(val(`parsePitch("C")`), null);
  // round-trip through the app's own speller
  for (const p of [36, 47, 61, 70, 84]) assert.equal(val(`parsePitch(pitchName(${p}, null))`), p);
  assert.equal(val(`parsePitch(pitchName(70, -3))`), 70); // Bb spelled flat under Eb
});

test("Fill: validator — one failing fixture per rule; 6/8 beats and a chop map to the right ticks", () => {
  installSong();
  run(`
    songKey = "albums/compositions/nightroll/fill-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */
    song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}],
      tracks: [{name: "pulse1", notes: [{t: 0, d: 480, p: 60, v: 80}]}, {name: "pulse2", notes: []}]};
    song.rawNotes = [[{t: 100, d: 480, p: 60, v: 80}], []]; song.tracks[0].notes[0].ri = 0;
    chopS = 100; rollnotes = []; keyRegions = []; previewSf = null; declaredTs = [6, 8]; editUndo = []; editRedo = []; dupPending = null;
    trackState = [{muted: false, solo: false}, {muted: false, solo: false}];
    computeSongEnd();
  `);
  const sp = val(`(() => { const bt = barTicks(); return {t0: bt, t1: 3 * bt, from: 2, to: 3}; })()`);
  const v = take => val(`askValidateTake(${JSON.stringify(take)}, ${JSON.stringify(sp)})`);
  const good = {span: {fromBar: 2, toBar: 3}, notes: [{bar: 2, beat: 1, dur: 3, pitch: "C4"}, {bar: 3, beat: 4.5, dur: 1, pitch: "G3"}], why: "", question: ""};
  const ok = v(good);
  assert.ok(ok.hits, ok.error);
  // 6/8: beat = eighth (240 ticks); bar 2 starts at 6*240 = 1440; beat 4.5 = 3.5 eighths in
  assert.deepEqual(ok.hits.map(h => [h.t, h.d, h.p]), [[1440, 720, 60], [2880 + 840, 240, 55]]);
  assert.deepEqual(ok.hits.map(h => h.v), [96, 78]); // downbeat 96; off-beat 78
  assert.match(v({...good, notes: [{bar: 1, beat: 1, dur: 1, pitch: "C4"}]}).error, /bar must be within 2–3/);
  assert.match(v({...good, notes: [{bar: 2, beat: 7, dur: 1, pitch: "C4"}]}).error, /beat must be ≥ 1 and < 7/);
  assert.match(v({...good, notes: [{bar: 2, beat: 1, dur: 0, pitch: "C4"}]}).error, /dur must be > 0/);
  assert.match(v({...good, notes: [{bar: 2, beat: 1, dur: 1, pitch: "Q4"}]}).error, /pitch must be like/);
  assert.match(v({...good, notes: [{bar: 2, beat: 1, dur: 1, pitch: "C0"}]}).error, /out of range/);
  assert.match(v({...good, notes: new Array(257).fill({bar: 2, beat: 1, dur: 1, pitch: "C4"})}).error, /256/);
  assert.match(v({...good, notes: "nope"}).error, /array/);
  assert.equal(v({...good, notes: [], question: "Stacked chords or one note at a time?"}).question, "Stacked chords or one note at a time?");
  assert.match(val(`askValidateTake(askParseTake('<think>hmm</think> Sure! {"span":{"fromBar":2,"toBar":3},"notes":[],"why":"","question":""} done'), ${JSON.stringify(sp)})`).error || "", /^$/);
  // applyTake with a chop: rawNotes mirror lands at + chopS; one group undo; the pulse1 note before the range survives
  const r = val(`(() => { const k = applyTake(1, ${sp.t0}, ${sp.t1}, ${JSON.stringify(ok.hits)});
    return {k, raw: song.rawNotes[1].map(n => n.t), undo: editUndo.length, kind: editUndo[0].kind, p1: song.tracks[0].notes.filter(n => !n.gone).length}; })()`);
  assert.equal(r.k, 2);
  assert.deepEqual(r.raw, [1540, 3820]);
  assert.equal(r.undo, 1); assert.equal(r.kind, "group"); assert.equal(r.p1, 1);
  run(`editUndoPop()`);
  assert.equal(val(`song.tracks[1].notes.filter(n => !n.gone).length`), 0);
  // target rule: pulse2 is empty in the span → default onto it; pulse1 has a note at 0 only → also empty in bars 2–3, and it comes first
  assert.equal(val(`askDefaultTarget(${JSON.stringify(sp)})`), "0");
  run(`song.tracks[0].notes.push({t: ${sp.t0}, d: 100, p: 60, v: 80});`);
  assert.equal(val(`askDefaultTarget(${JSON.stringify(sp)})`), "1");
  assert.match(val(`askTargetStatus(${JSON.stringify(sp)}, "0")`), /replaces 1 note on pulse1 in bars 2–3/);
  run(`song.tracks[1].notes.push({t: ${sp.t0}, d: 100, p: 60, v: 80});`);
  assert.equal(val(`askDefaultTarget(${JSON.stringify(sp)})`), "new");
  run(`songKey = null; rollnotes = []; declaredTs = null; chopS = 0; song.rawNotes = null;`);
});

test("Ask: backend selection from cfg; browser backend forces the 4k budget tier", () => {
  run(`saveCfg({aiBackend: "remote", aiWindow: 8192})`);
  assert.equal(val(`aiProvider().id`), "remote");
  assert.deepEqual(val(`(({anno, span, hist}) => [anno, span, hist])(askBudget())`), [1000, 2000, 1000]);
  run(`saveCfg({aiBackend: "browser", aiWindow: 32768})`);
  assert.equal(val(`aiProvider().id`), "browser");
  assert.deepEqual(val(`(({win, anno, span, hist}) => [win, anno, span, hist])(askBudget())`), [4096, 500, 1200, 300]);
  assert.ok(val(`AI_BROWSER_MODELS.every(m => /-MLC$/.test(m[0]) && / GB/.test(m[1]))`));
  // the bridge's Claude Code: a large window whatever the field says, and no "small window" warning
  run(`saveCfg({aiBackend: "remote", aiWindow: 8192, aiModel: "claude-code"})`);
  assert.deepEqual(val(`(({win, small, span}) => [win, small, span])(askBudget())`), [200000, false, 8000]);
  run(`saveCfg({aiBackend: "remote", aiWindow: 8192, aiModel: ""})`);
});

test("homeSong: Overworld when shipped, else the first catalog song (the app edition)", () => {
  const ow = "albums/nes/final-fantasy-i/songs/overworld.mid";
  const home = (all) => val(`homeSong(${JSON.stringify(all)})`);
  assert.equal(home(["albums/starters/songs/a.mid", ow]), ow);
  assert.equal(home(["albums/starters/songs/a.mid", "albums/starters/songs/b.mid"]), "albums/starters/songs/a.mid");
  assert.equal(home([]), ow);
});

// In-memory @capacitor/filesystem: stat/mkdir/readFile/writeFile/readdir/
// deleteFile over base64 strings, the way the iOS plugin moves bytes.
function fakeCapacitorFs() {
  const files = new Map(), dirs = new Set([""]);
  const parent = p => p.split("/").slice(0, -1).join("/");
  const missing = () => new Error("File does not exist");
  return {
    files, dirs,
    async stat({path}) {
      if (files.has(path)) return {type: "file", size: files.get(path).length};
      if (dirs.has(path)) return {type: "directory", size: 0};
      throw missing();
    },
    async mkdir({path, recursive}) {
      const parts = path.split("/");
      for (let i = 1; i <= parts.length; i++) {
        const d = parts.slice(0, i).join("/");
        if (!dirs.has(d) && i < parts.length && !recursive) throw new Error("Parent directory does not exist");
        dirs.add(d);
      }
    },
    async readFile({path}) { if (!files.has(path)) throw missing(); return {data: files.get(path)}; },
    async writeFile({path, data, recursive}) {
      if (!dirs.has(parent(path))) { if (!recursive) throw new Error("Parent directory does not exist"); await this.mkdir({path: parent(path), recursive: true}); }
      files.set(path, data); return {uri: "file:///Documents/" + path};
    },
    async readdir({path}) {
      if (!dirs.has(path)) throw missing();
      const out = [];
      const under = n => (path ? n.startsWith(path + "/") : true) && !n.slice(path ? path.length + 1 : 0).includes("/") && n !== path;
      for (const d of dirs) if (under(d)) out.push({name: d.split("/").pop(), type: "directory", size: 0, mtime: 0});
      for (const f of files.keys()) if (under(f)) out.push({name: f.split("/").pop(), type: "file", size: 0, mtime: 0});
      return {files: out};
    },
    async deleteFile({path}) { if (!files.delete(path)) throw missing(); },
  };
}

test("iPad app: every Save also writes the song into Files (a mirror, never read back); the web writes nothing", async () => {
  run(`globalThis.__prevFetch2 = fetch; fetch = () => Promise.reject(new Error("no network"));`);
  run(`fsRoot.handle = null; fsRoot.mode = null; fsRoot.needsGrant = false;`);
  installSong();
  run(`song.tracks = [{name: "v1", notes: [{t: 0, d: 480, p: 60, v: 80}]}]; songKey = "albums/compositions/nightroll/mirror-me.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */ currentPath = songKey; rollnotes = [];
       localStorage.setItem(draftStoreKey(songKey), JSON.stringify({dirty: true, savedStamp: 0, tracks: []}));`);
  assert.equal(run(`nativeFs()`), null);
  assert.equal(await run(`filesMirror()`), false, "the web has no Files");
  app.context.capFs = fakeCapacitorFs();
  run(`window.Capacitor = {isNativePlatform: () => true, Plugins: {Filesystem: capFs}};`);
  assert.equal(run(`folderActive()`), false, "Files is not a folder mode: reads and Publish are untouched");
  assert.equal(run(`writeToken()`), null);
  assert.equal(await run(`filesMirror()`), true);
  const files = [...app.context.capFs.files.keys()].sort();
  assert.deepEqual(files, ["albums/compositions/nightroll/mirror-me.mid", "albums/compositions/nightroll/mirror-me.notes.txt", "albums/compositions/nightroll/mirror-me.rollnotes.json"]);
  const midB64 = app.context.capFs.files.get("albums/compositions/nightroll/mirror-me.mid");
  assert.equal(Buffer.from(midB64, "base64").subarray(0, 4).toString("latin1"), "MThd");
  // Save writes it; a read-only song never does
  assert.equal(run(`saveCheckpoint(true)`), true);
  run(`songKey = "albums/nes/final-fantasy-i/songs/overworld.mid";`);
  assert.equal(await run(`filesMirror()`), false);
  run(`songKey = "albums/compositions/nightroll/mirror-me.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable (2026-09-27) */ localStorage.removeItem(draftStoreKey(songKey)); localStorage.removeItem(saveStoreKey(songKey));
       delete window.Capacitor; fetch = globalThis.__prevFetch2;`);
});

test("iPad app: a file handed over by Files/share sheet opens as a local draft; the Inbox copy goes", async () => {
  installSong();
  run(`song.tracks = [{name: "v1", notes: [{t: 0, d: 480, p: 60, v: 80}, {t: 480, d: 480, p: 64, v: 80}]}];`);
  const b64 = run(`midiBase64(writeMidi(song))`);
  const calls = [];
  app.context.capOpen = {
    listeners: {},
    App: {addListener(name, fn) { app.context.capOpen.listeners[name] = fn; return Promise.resolve({remove() {}}); },
          getLaunchUrl: async () => undefined},
    Filesystem: {async readFile({path}) { calls.push(["read", path]); return {data: b64}; },
                 async deleteFile({path}) { calls.push(["delete", path]); }},
  };
  run(`window.Capacitor = {isNativePlatform: () => true, Plugins: {Filesystem: capOpen.Filesystem, App: capOpen.App}};`);
  run(`nativeOpenHook()`);
  assert.equal(typeof app.context.capOpen.listeners.appUrlOpen, "function", "listens for hand-overs");
  const url = "file:///private/var/mobile/Containers/Data/Application/X/Documents/Inbox/Test%20Song.mid";
  assert.equal(await run(`nativeOpenUrl(${JSON.stringify(url)})`), true);
  assert.equal(run(`songKey`), "local/test-song.mid");
  assert.equal(run(`song.tracks.length`), 1);
  assert.deepEqual(calls, [["read", url], ["delete", url]]);
  // not a file URL, or the web: nothing happens
  assert.equal(await run(`nativeOpenUrl("https://example.com/x.mid")`), false);
  run(`delete window.Capacitor;`);
  assert.equal(await run(`nativeOpenUrl(${JSON.stringify(url)})`), false);
});

test("Settings tabs: one pane at a time, the last one remembered on this device", () => {
  run(`cfgShowPane("ai")`);
  assert.equal(run(`document.getElementById("cfgpane-ai").classList.contains("on")`), true);
  assert.equal(run(`document.getElementById("cfgpane-saving").classList.contains("on")`), false);
  assert.equal(run(`document.getElementById("cfgtab-ai").classList.contains("on")`), true);
  assert.equal(run(`localStorage.getItem("ff1roll-cfgpane")`), "ai");
  run(`cfgShowPane("nope")`); // unknown → Saving
  assert.equal(run(`localStorage.getItem("ff1roll-cfgpane")`), "saving");
  run(`localStorage.removeItem("ff1roll-cfgpane")`);
});

test("app edition: reads come from the configured repo; bundled starters list and load without it", async () => {
  const app2 = createApp({edition: "app"});
  const run2 = app2.run;
  run2(`APP_BASE = "capacitor://localhost/"; localStorage.removeItem("ff1roll-cfg"); cfg.c = null;`);
  assert.equal(run2(`EDITION`), "app");
  assert.equal(run2(`readBase("songs")`), "https://raw.githubusercontent.com/joshcough/night-roll/main");
  assert.equal(run2(`cfg().songsBase`), "", "derived, never stored");
  assert.equal(run2(`songsURL("albums/compositions/nightroll/a.mid")`), "https://raw.githubusercontent.com/joshcough/night-roll/main/albums/compositions/nightroll/a.mid");
  run2(`saveCfg({songsRepo: "someone/songs", analysisRepo: "someone/songs"}); cfg.c = null;`); // Settings keeps the pair together (settingsPersist)
  assert.equal(run2(`readBase("analysis")`), "https://raw.githubusercontent.com/someone/songs/main", "annotations follow the songs repo");
  // the catalog: repo manifest ∪ bundled manifest; the repo alone, or the bundle alone, suffices
  const seen = [];
  app2.context.fakeFetch = (url) => {
    seen.push(String(url));
    if (/raw\.githubusercontent\.com.*manifest/.test(url)) return Promise.resolve({ok: true, json: async () => [{title: "My Songs", songs: [{title: "One", path: "albums/mine/one.mid"}]}]});
    if (/^albums\/manifest\.json/.test(url)) return Promise.resolve({ok: true, json: async () => [{title: "Starters", songs: [{title: "Prelude", path: "albums/starters/p.mid"}]}]});
    if (/raw\.githubusercontent\.com.*starters\/p\.mid/.test(url)) return Promise.resolve({ok: false, status: 404});
    if (/^albums\/starters\/p\.mid/.test(url)) return Promise.resolve({ok: true, status: 200, text: async () => "bundle"});
    return Promise.reject(new Error("no network"));
  };
  run2(`fetch = fakeFetch;`);
  await run2(`initCatalog()`);
  assert.deepEqual(val2(`Object.keys(CATALOG).sort()`), ["My Songs", "Starters"]);
  // a starter the repo lacks falls back to the bundle; a repo copy wins when it exists
  const r = await run2(`readData("songs", "albums/starters/p.mid")`);
  assert.equal(await r.text(), "bundle");
  assert.ok(seen.some(u => /raw\.githubusercontent\.com.*starters\/p\.mid/.test(u)), "the repo was asked first");
  // repo unreachable: the starters still list (offline launch)
  run2(`fetch = (url) => String(url).startsWith("albums/manifest.json") ? fakeFetch(url) : Promise.reject(new Error("offline"));`);
  await run2(`initCatalog()`);
  assert.deepEqual(val2(`Object.keys(CATALOG)`), ["Starters"]);
  function val2(code) { return JSON.parse(run2(`JSON.stringify(${code})`)); }
});

test("folders: a song's folder and its title come from its path; LOCAL rows say where the song stands", () => {
  run(`CATALOG = {"My Compositions": [["Threnody", "albums/compositions/threnody.mid"]],
                 "Night Roll Sketches": [["Ambush", "albums/compositions/nightroll/ambush.mid"]],
                 "Mega Man 2": [["Air Man", "albums/nes/mega-man-2/air-man.mid"]],
                 "Final Fantasy I": [["Overworld", "albums/nes/final-fantasy-i/songs/overworld.mid"]]};`);
  assert.equal(run(`folderOf("albums/compositions/nightroll/ambush.mid")`), "compositions/nightroll");
  assert.equal(run(`folderOf("albums/nes/final-fantasy-i/songs/overworld.mid")`), "nes/final-fantasy-i", "FF1's songs/ level collapses");
  assert.equal(run(`folderOf("local/test-song.mid")`), "local");
  assert.equal(run(`folderTitle("compositions/nightroll")`), "My Compositions › Night Roll Sketches");
  assert.equal(run(`folderTitle("imports/mega-man-2")`), "Imports › Mega Man 2");
  assert.equal(run(`folderTitle("snes/chrono-trigger")`), "SNES › Chrono Trigger", "console parents by their own names");
  assert.equal(run(`folderTitle("local")`), "Not saved yet");
  // status words
  run(`localStorage.setItem(draftStoreKey("albums/compositions/nightroll/ambush.mid"), JSON.stringify({dirty: true, savedStamp: 5, tracks: []}));
       localStorage.setItem(draftStoreKey("albums/compositions/nightroll/ambush-3.mid"), JSON.stringify({dirty: true, savedStamp: 0, tracks: []}));
       localStorage.setItem(draftStoreKey("albums/compositions/threnody.mid"), JSON.stringify({dirty: false, savedStamp: 5, tracks: []}));`);
  assert.equal(run(`songStatus("albums/compositions/nightroll/ambush.mid")`), "changed since publish");
  assert.equal(run(`songStatus("albums/compositions/nightroll/ambush-3.mid")`), "not published");
  assert.equal(run(`songStatus("albums/compositions/threnody.mid")`), "published");
  const folders = val(`Object.keys(localFolders()).sort()`);
  assert.deepEqual(folders.filter(f => f.startsWith("compositions")), ["compositions", "compositions/nightroll"]);
  // the publish button names its destination, or what to do
  run(`localStorage.removeItem("ff1roll-ghtoken"); fsRoot.handle = null; fsRoot.mode = null;`);
  assert.equal(run(`publishDest()`), null);
  assert.equal(run(`publishLabel("folder")`), "Connect GitHub to publish");
  run(`localStorage.setItem("ff1roll-ghtoken", "t");`);
  assert.equal(run(`publishLabel("kept tracks")`), "⇪ Publish kept tracks");
  run(`localStorage.removeItem("ff1roll-ghtoken");`);
  for (const k of ["albums/compositions/nightroll/ambush.mid", "albums/compositions/nightroll/ambush-3.mid", "albums/compositions/threnody.mid"]) run(`localStorage.removeItem(draftStoreKey(${JSON.stringify(k)}))`);
});

test("save names the song: New makes Untitled N under local/; Save picks folder + name; Move of an unpublished song stays local", async () => {
  run(`CATALOG = {"Night Roll Sketches": [["Ambush", "albums/compositions/nightroll/ambush.mid"]], "Final Fantasy I": [["Overworld", "albums/nes/final-fantasy-i/songs/overworld.mid"]]};
       for (const k of Object.keys(localStorage)) if (/untitled|graveyard/.test(k)) localStorage.removeItem(k);
       localStorage.removeItem("ff1roll-lastfolder"); rollnotes = []; fsRoot.handle = null; fsRoot.mode = null;`);
  run(`createComposition(120, 4, 4)`);
  assert.equal(run(`songKey`), "local/untitled-1.mid");
  assert.equal(run(`songTitleOf(songKey)`), "Untitled 1");
  assert.equal(run(`isUnsaved(songKey)`), true);
  assert.equal(run(`editableSong()`), true, "editable before it has a name");
  assert.equal(run(`isComposition()`), false, "not publishable yet");
  assert.equal(run(`songStatus(songKey)`), "never saved");
  assert.equal(run(`saveCheckpoint(true)`), false, "a quiet Save cannot name it");
  // a second New song numbers up
  run(`createComposition(100, 3, 4)`);
  assert.equal(run(`songKey`), "local/untitled-2.mid");
  // the folder choices: own folders only, never the corpora
  const choices = val(`folderChoices()`);
  assert.ok(choices.includes("compositions/nightroll"));
  assert.ok(!choices.includes("final-fantasy-i") && !choices.includes("local"));
  assert.equal(run(`folderFromInput("NES/My Covers")`), "nes/my-covers");
  assert.equal(run(`folderFromInput("imports")`), null, "reserved");
  // Save: folder + name → the key moves, the title sticks, it is now a composition in that folder
  assert.equal(await run(`saveSongAs("graveyard-stuff", "Ambush 3")`), true);
  assert.equal(run(`songKey`), "albums/graveyard-stuff/ambush-3.mid");
  assert.equal(run(`songTitleOf(songKey)`), "Ambush 3");
  assert.equal(run(`isComposition()`), true);
  assert.equal(run(`localStorage.getItem("ff1roll-lastfolder")`), "graveyard-stuff");
  assert.equal(run(`songStatus(songKey)`), "not published");
  assert.equal(run(`folderTitle(folderOf(songKey))`), "Graveyard Stuff");
  assert.equal(run(`albumTitleFor(songKey)`), "Graveyard Stuff", "the manifest album a Publish would create");
  assert.equal(run(`localStorage.getItem(draftStoreKey("local/untitled-2.mid"))`), null, "the Untitled key is gone");
  assert.ok(app.store.has("ff1roll-save-albums/graveyard-stuff/ambush-3.mid"), "checkpointed");
  // Move of a never-published song: this device only, no token needed
  run(`localStorage.setItem("ff1roll-ghtoken", "t");`);
  await run(`moveComposition("albums/nes/covers/")`);
  assert.equal(run(`songKey`), "albums/nes/covers/ambush-3.mid");
  assert.equal(run(`folderTitle(folderOf(songKey))`), "NES › Covers");
  run(`localStorage.removeItem("ff1roll-ghtoken");`);
  // read-only folders never become compositions, even with a draft
  run(`localStorage.setItem(draftStoreKey("albums/nes/final-fantasy-i/songs/overworld.mid"), "{}"); songKey = "albums/nes/final-fantasy-i/songs/overworld.mid";`);
  assert.equal(run(`isComposition()`), false);
  run(`localStorage.removeItem(draftStoreKey("albums/nes/final-fantasy-i/songs/overworld.mid"));
       for (const k of Object.keys(localStorage)) if (k.includes("untitled") || k.includes("graveyard") || k.includes("nes/covers")) localStorage.removeItem(k);`);
});

test("console folders: old links and keys redirect; captures are read-only by marker, not by folder name", () => {
  assert.equal(run(`movedPath("albums/final-fantasy-i/songs/overworld.mid")`), "albums/nes/final-fantasy-i/songs/overworld.mid");
  assert.equal(run(`movedPath("albums/imports/chrono-trigger/corridors-of-time.mid")`), "albums/snes/chrono-trigger/corridors-of-time.mid");
  assert.equal(run(`movedPath("albums/compositions/nightroll/ambush.mid")`), null);
  run(`APP_BASE = "https://joshcough.github.io/night-roll/";`);
  assert.equal(run(`songPathFromURL("https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/overworld")`), "albums/nes/final-fantasy-i/songs/overworld.mid", "an old link opens the moved song");
  assert.equal(run(`songPathFromURL("https://joshcough.github.io/night-roll/?song=albums/imports/mega-man-2/air-man.mid")`), "albums/nes/mega-man-2/air-man.mid");
  // where new captures land
  assert.equal(run(`impDirFor("spc")`), "albums/snes/");
  assert.equal(run(`impDirFor("gbs")`), "albums/game-boy/");
  assert.equal(run(`impDirFor(undefined)`), "albums/imports/", "unknown kind: the legacy folder");
  // a capture is read-only by its draft's stamp (this device) or album.json's nsf block (any device)
  run(`localStorage.setItem(draftStoreKey("albums/nes/mega-man-2/air-man.mid"), JSON.stringify({capture: true, dirty: false, tracks: []}));
       localStorage.setItem(draftStoreKey("albums/nes/my-covers/air-man.mid"), JSON.stringify({dirty: true, tracks: []}));
       albumMetaCache["albums/snes/chrono-trigger"] = {title: "Chrono Trigger", nsf: {vault: "chrono-trigger.spc"}};`);
  assert.equal(run(`isCaptureKey("albums/nes/mega-man-2/air-man.mid")`), true);
  assert.equal(run(`isCaptureKey("albums/snes/chrono-trigger/corridors-of-time.mid")`), true, "by album.json");
  assert.equal(run(`isCaptureKey("albums/nes/my-covers/air-man.mid")`), false, "Josh's own folder beside the captures");
  assert.equal(run(`ownFolderPath("albums/nes/my-covers/air-man.mid")`), true);
  assert.equal(run(`ownFolderPath("albums/nes/mega-man-2/air-man.mid")`), false);
  assert.equal(run(`ownFolderPath("albums/nes/final-fantasy-i/songs/overworld.mid")`), false);
  assert.deepEqual(val(`importDraftKeys()`).filter(k => k.includes("air-man")), ["albums/nes/mega-man-2/air-man.mid"]);
  assert.equal(run(`albumTitleFor("albums/nes/mega-man-2/air-man.mid")`), "Mega Man 2");
  assert.equal(run(`albumTitleFor("albums/nes/final-fantasy-i/songs/overworld.mid")`), "Final Fantasy I");
  assert.equal(run(`folderTitle("nes/mega-man-2")`), "NES › Mega Man 2");
  run(`localStorage.removeItem(draftStoreKey("albums/nes/mega-man-2/air-man.mid")); localStorage.removeItem(draftStoreKey("albums/nes/my-covers/air-man.mid")); delete albumMetaCache["albums/snes/chrono-trigger"];`);
});

test("chip source: an unpublished capture under a console folder finds its record by the folder name", async () => {
  // no album.json yet (never published), no live import session, key not under
  // the legacy imports/ prefix — the device record is keyed by the set's slug,
  // which is the capture's own folder (Josh, 2026-09-27: every FF7 song fell
  // to synth after a relaunch)
  run(`nsfSess = null; songKey = "albums/ps1/final-fantasy-7/bombing-mission.mid";
       localStorage.setItem(draftStoreKey(songKey), JSON.stringify({capture: true, dirty: true, tracks: []}));
       albumMetaFor = async () => null;
       idbNsfGet = async slug => slug === "final-fantasy-7"
         ? {chip: "psf", tracks: {"bombing-mission": {n: 1, secs: 12, bytes: new Uint8Array([80, 83, 70])}}, libs: {"final fantasy 7.psflib": new Uint8Array([1])}}
         : null;`);
  const src = await run(`chipSource()`);
  assert.ok(src, "the record resolves without album.json or a session");
  assert.equal(src.chip, "psf");
  assert.equal(src.n, 1);
  assert.deepEqual(Object.keys(src.libs), ["final fantasy 7.psflib"]);
  run(`songKey = "albums/ps1/my-own-folder/tune.mid";`);
  assert.equal(await run(`chipSource()`), null, "a song that is not a capture never guesses a record");
  run(`localStorage.removeItem(draftStoreKey("albums/ps1/final-fantasy-7/bombing-mission.mid")); songKey = null;`);
});

test("boot with old keys: the folder migration runs before a handler attaches — and must not crash the page", () => {
  // the fourth-wave migration moves a capture's draft in IndexedDB through
  // the idb queue; that queue used to be declared 11,000 lines later, so a
  // device holding an albums/imports/ draft died at boot (Josh, 2026-09-27,
  // the Mac and its installed app: "nothing happens anywhere when I click")
  const seeded = createApp({storage: {
    "ff1roll-draft-albums/imports/mega-man-2/air-man.mid": JSON.stringify({dirty: true, tracks: [], tracksRef: true}),
    "ff1roll-notes-albums/final-fantasy-i/songs/overworld.mid": "[]",
  }});
  const r = code => seeded.run(code);
  assert.equal(r(`localStorage.getItem("ff1roll-draft-albums/imports/mega-man-2/air-man.mid")`), null, "old key gone");
  const moved = JSON.parse(r(`localStorage.getItem("ff1roll-draft-albums/nes/mega-man-2/air-man.mid")`));
  assert.equal(moved.capture, true, "a draft from imports/ is stamped as a capture");
  assert.equal(r(`localStorage.getItem("ff1roll-notes-albums/nes/final-fantasy-i/songs/overworld.mid")`), "[]");
  assert.equal(r(`typeof _idbQueue`), "object", "the idb queue exists once boot is through");
});

test("archive fetch: a file over 1 MB comes through the blobs API when the contents API inlines nothing", async () => {
  // Mario 64's library is 1.2 MB: the contents API answers with an empty
  // content + sha, and every other device rendered synth (2026-09-28)
  const calls = [];
  run(`localStorage.setItem("ff1roll-ghtoken", "t"); saveCfg({nsfRepo: "someone/archive", nsfBase: "https://raw.githubusercontent.com/someone/archive/main"}); cfg.c = null;`);
  app.context.fakeFetch2 = (url) => {
    calls.push(String(url));
    if (/raw\.githubusercontent/.test(url)) return Promise.resolve({ok: false, status: 404});
    if (/\/contents\/big\/lib\.usflib/.test(url)) return Promise.resolve({ok: true, json: async () => ({content: "", encoding: "none", sha: "abc123", size: 1200000})});
    if (/\/git\/blobs\/abc123$/.test(url)) return Promise.resolve({ok: true, json: async () => ({content: btoa("BIGLIB"), encoding: "base64"})});
    return Promise.reject(new Error("unexpected " + url));
  };
  run(`fetch = fakeFetch2;`);
  const bytes = await run(`vaultFetch("big/lib.usflib")`);
  assert.equal(String.fromCharCode(...bytes), "BIGLIB");
  assert.ok(calls.some(u => /git\/blobs\/abc123/.test(u)), "fell through to the blob");
  run(`localStorage.removeItem("ff1roll-ghtoken"); localStorage.removeItem("ff1roll-cfg"); cfg.c = null;`);
});

test("pan: the track: directive and the .mid's CC10 place a track; the directive wins; stereo chip pairs become 2-channel buffers", () => {
  run(`createComposition(120, 4, 4); song.tracks[0].midiPan = -0.5;
       rollnotes = parseRollnotes("[1.1]\\ntrack: " + song.tracks[0].name + " vol=0.8 pan=0.25\\n").map(resolveNote); finalizeNotes();`);
  assert.equal(val(`song.tracks[0].pan`), 0.25, "the directive's pan");
  assert.equal(val(`trackPan(0)`), 0.25, "the directive wins over the .mid");
  assert.equal(run(`rollnotes[0].text`), "track: " + run(`song.tracks[0].name`) + " vol=0.8 pan=0.25", "normalized text keeps pan");
  run(`rollnotes = []; finalizeNotes();`);
  assert.equal(val(`song.tracks[0].pan === undefined`), true);
  assert.equal(val(`trackPan(0)`), -0.5, "no directive: the .mid's own pan");
  // a chip render may hand back a stereo pair per track
  run(`audio = new window.AudioContext(); chip.pcm = {"ch 1": {l: new Float32Array(10), r: new Float32Array(10)}, "ch 2": new Float32Array(10)}; chip.pcmRate = 44100; chip.buffers = null; chip.buffersCtx = null;`);
  assert.equal(val(`chipBuffers()["ch 1"].numberOfChannels`), 2);
  assert.equal(val(`chipBuffers()["ch 2"].numberOfChannels`), 1);
  assert.equal(val(`chipSilent([{l: new Float32Array(30), r: (() => { const a = new Float32Array(30); a[13] = 0.5; return a; })()}])`), false, "a live right side counts (the check samples every 13th value)");
  assert.equal(val(`chipIsPcm({l: new Float32Array(2), r: new Float32Array(2)}) && chipIsPcm(new Float32Array(2)) && !chipIsPcm({l: 1})`), true);
  run(`chip.pcm = null; chip.buffers = null; audio = null;`);
});

test("Open re-reads the published list each time it opens (once per 20 s) and redraws only when it changed", async () => {
  // Josh, 2026-09-28: "I have to completely close the app and restart it in
  // order for it to get new songs in the open menu"
  let manifestFetches = 0, draws = 0;
  run(`CATALOG = {"Starters": [["Prelude", "albums/starters/p.mid"]]}; catalogRefreshedAt = 0; currentPath = null;
       fetch = (url) => { if (/manifest\.json/.test(String(url))) { globalThis.__mf = (globalThis.__mf || 0) + 1; return Promise.resolve({ok: true, json: async () => [{title: "Starters", songs: [{title: "Prelude", path: "albums/starters/p.mid"}]}, {title: "New Album", songs: [{title: "One", path: "albums/nes/new-album/one.mid"}]}]}); } return Promise.reject(new Error("no network")); };
       globalThis.__mf = 0; globalThis.__draws = 0; renderSongGroups = ((orig) => () => { globalThis.__draws++; return orig(); })(renderSongGroups);`);
  run(`openSongPicker();`);
  await new Promise(r => setTimeout(r, 30));
  manifestFetches = val(`globalThis.__mf`);
  assert.equal(manifestFetches, 1, "opening the sheet re-reads the manifest");
  assert.ok(val(`Object.keys(CATALOG).includes("New Album")`), "the new album is in the catalog");
  run(`openSongPicker();`);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(val(`globalThis.__mf`), 1, "a second open within 20 s does not re-read");
  run(`songsheet.classList.remove("on");`);
});

test("tap a note on a chip song: the live worker renders that one note through the game's instrument; the synth is the fallback", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`)); // its own app: an earlier test no-ops previewNote for the shared one
  run(`createComposition(120, 4, 4); ensureAudio(); globalThis.__srcs = 0; globalThis.__sched = 0;
       audio.createBufferSource = () => { globalThis.__srcs++; return {connect() {}, start() {}, stop() {}, buffer: null}; };
       scheduleNote = () => { globalThis.__sched++; };
       chip.key = songKey; chip.pcm = {}; chip.pcm[song.tracks[0].name] = new Float32Array(10);
       chipWorker = {__key: songKey, postMessage(m) { const req = m.preview.req; setTimeout(() => this.onmessage({data: {preview: {req, pcm: new Float32Array(50), sampleRate: 44100}}}), 0); }, terminate() {}};
       chipWorker.onmessage = null;`);
  // the page's onmessage lives on the real worker; emulate the routing the page installs
  run(`chipWorker.onmessage = e => { const m = e.data; const cb = chipPreviewPending.get(m.preview.req); chipPreviewPending.delete(m.preview.req); if (cb) cb(m.preview); };`);
  const settle = async p => { for (let i = 0; i < 40; i++) { await Promise.resolve(); app2.tick(20); await Promise.resolve(); await Promise.resolve(); } return p; }; // the harness clock is fake: fire the worker's reply and the 400 ms guard
  await settle(run(`previewNote(0, 60)`));
  assert.equal(val(`chipPreviewCache.size`), 1, "the game's note came back and was kept (the app may rebuild the audio context under a tap, so the buffer, not the context, is the witness)");
  assert.equal(val(`globalThis.__sched`), 0, "no synth note");
  run(`chipWorker.postMessage = () => { throw new Error("no worker call expected: the cache answers"); };`);
  await settle(run(`previewNote(0, 60)`));
  assert.equal(val(`globalThis.__sched`), 0, "a repeat comes from the cache, still no synth");
  run(`chipWorker = null;`);
  await settle(run(`previewNote(0, 60)`));
  assert.equal(val(`globalThis.__sched`), 1, "no live worker: the synth voice");
  run(`chip.key = null; chip.pcm = null; audio = null; chipPreviewCache.clear();`);
});

test("a playlist picked after the import names the open song's published album by chip slot, in one album.json write", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  run(`CATALOG = {"Zelda": [["track-01", "albums/nes/legend-of-zelda/track-01.mid"], ["track-02", "albums/nes/legend-of-zelda/track-02.mid"], ["track-03", "albums/nes/legend-of-zelda/track-03.mid"]]};
       songKey = "albums/nes/legend-of-zelda/track-02.mid"; currentPath = songKey;
       albumMetaCache["albums/nes/legend-of-zelda"] = {title: "The Legend of Zelda", nsf: {vault: "legend-of-zelda.nsf", tracks: {"track-01": {n: 1, secs: 10}, "track-02": {n: 2, secs: 10}, "track-03": {n: 3, secs: 10}}}};
       localStorage.setItem("ff1roll-ghtoken", "t"); appConfirm = async () => true;
       globalThis.__puts = [];
       fetch = (url, init) => {
         const u = String(url);
         if (init && init.method === "PUT") { globalThis.__puts.push({u, body: JSON.parse(init.body)}); return Promise.resolve({ok: true, json: async () => ({content: {sha: "x"}})}); }
         if (/album\.json/.test(u)) return Promise.resolve({ok: false, status: 404});
         if (/manifest\.json/.test(u)) return Promise.resolve({ok: true, json: async () => ({sha: "m", content: btoa(JSON.stringify([{title: "Zelda", songs: [{title: "track-01", path: "albums/nes/legend-of-zelda/track-01.mid"}, {title: "track-02", path: "albums/nes/legend-of-zelda/track-02.mid"}]}]))})});
         return Promise.reject(new Error("unexpected " + u));
       };`);
  const n = await run(`applyM3uToAlbum([{n: 1, title: "Title"}, {n: 2, title: "Overworld"}, {n: 9, title: "Nothing here"}])`);
  assert.equal(n, 2, "two songs matched by slot; a slot the album lacks is skipped");
  const puts = val(`globalThis.__puts`);
  const album = puts.filter(p => /album\.json/.test(p.u));
  assert.equal(album.length, 1, "one album.json write for both titles");
  const meta = JSON.parse(Buffer.from(album[0].body.content, "base64").toString("utf8"));
  assert.deepEqual(meta.songs, {"track-01": "Title", "track-02": "Overworld"});
  assert.equal(puts.filter(p => /manifest\.json/.test(p.u)).length, 1, "one manifest write");
  assert.deepEqual(val(`CATALOG["Zelda"].map(e => e[0])`), ["Title", "Overworld", "track-03"], "the in-memory catalog shows the names at once");
});

test("create mine: a public night-roll-archive under the user's account becomes their game files & instruments repo", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  run(`saveCfg({aiBackend: "remote"}); cfg.c = null;`); // any first save freezes the defaults, Josh's archive included
  assert.equal(val(`cfg().nsfRepo`), "joshcough/nsf-archive");
  run(`document.getElementById("cfgsongsrepo").value = "someone/songs"; settingsPersist("cfgsongsrepo"); cfg.c = null;`);
  run(`localStorage.setItem("ff1roll-ghtoken", "t"); globalThis.__posts = [];
       fetch = (url, init) => { const u = String(url);
         if (u === "https://api.github.com/user") return Promise.resolve({ok: true, json: async () => ({login: "someone"})});
         if (u.endsWith("/repos/someone/night-roll-archive")) return Promise.resolve({ok: false, status: 404});
         if (u.endsWith("/user/repos") && init && init.method === "POST") { globalThis.__posts.push(JSON.parse(init.body)); return Promise.resolve({ok: true, status: 201, json: async () => ({})}); }
         return Promise.reject(new Error("unexpected " + u)); };`);
  assert.equal(val(`cfg().nsfRepo`), "", "a user on their own songs repo starts with none");
  const said = [];
  app2.context.__say = t => said.push(t);
  const full = await run(`createGameFilesRepo(__say)`);
  assert.equal(full, "someone/night-roll-archive");
  assert.equal(val(`cfg().nsfRepo`), "someone/night-roll-archive");
  assert.equal(val(`cfg().nsfBase`), "https://raw.githubusercontent.com/someone/night-roll-archive/main");
  assert.deepEqual(val(`globalThis.__posts.map(p => [p.name, p.private])`), [["night-roll-archive", false]]);
  assert.match(said.at(-1), /created/);
});

test("instruments: the sheet lists games with a library; a game's menu is All instruments (A–Z, natural sort) then its songs; a song view lists only that song's instruments; the open-song shortcut is conditional; a tap plays one", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  app2.context.__play = await import("../tools/instruments/play.mjs");
  const wav = (() => { const n = 64, b = new Uint8Array(44 + n * 2), dv = new DataView(b.buffer); const w = (o, t) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0));
    w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 32000, true); dv.setUint32(28, 64000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, "data"); dv.setUint32(40, n * 2, true); for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, i % 8 < 4 ? 16000 : -16000, true); return b; })();
  app2.context.__wav = wav;
  // "a" and "b" both used in Dam only, natural-sort into Soft pad, Soft pad 2, Soft pad 10 (Josh, 2026-09-28:
  // FF7's list, most-used-first, "is just a giant list"); "c" used in Facility only, so the two songs' own
  // views differ; "d" is unused and never shown anywhere
  run(`instPlayModule = Promise.resolve(__play);
       CATALOG = {"GoldenEye": [["Dam", "albums/n64/goldeneye-007/dam.mid"], ["Facility", "albums/n64/goldeneye-007/facility.mid"]], "Starters": [["Prelude", "albums/starters/p.mid"]]};
       albumMetaCache["albums/n64/goldeneye-007"] = {title: "GoldenEye 007", nsf: {vault: "goldeneye-007/", chip: "usf", tracks: {}}};
       albumMetaCache["albums/starters"] = {title: "Starters"};
       globalThis.__fetched = [];
       vaultFetch = async f => { globalThis.__fetched.push(f);
         if (f.endsWith("instruments.json")) return new TextEncoder().encode(JSON.stringify({format: "night-roll-instruments", version: 1, samples: {h1: {rate: 32000, length: 64, loop: {start: 0, end: 64}, file: "h1.wav"}},
           instruments: [
             {id: "c", nameGuess: "Soft pad 10", kind: "melodic", used: true, usedIn: ["Facility"], program: 3, keysPlayed: {lo: 55, hi: 70, median: 62}, gain: 1, velocityCurve: "linear", envelope: {points: [[0, 1]], releaseCurve: {mode: "follow", points: [[0, 1], [0.05, 0]]}}, keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 60, sample: "h1", loop: {start: 0, end: 64}}]},
             {id: "b", nameGuess: "Soft pad 2", kind: "melodic", used: true, usedIn: ["Dam"], program: 2, keysPlayed: {lo: 55, hi: 70, median: 62}, gain: 1, velocityCurve: "linear", envelope: {points: [[0, 1]], releaseCurve: {mode: "follow", points: [[0, 1], [0.05, 0]]}}, keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 60, sample: "h1", loop: {start: 0, end: 64}}]},
             {id: "a", nameGuess: "Soft pad", kind: "melodic", used: true, usedIn: ["Dam", "Facility"], program: 1, keysPlayed: {lo: 55, hi: 70, median: 62}, gain: 1, velocityCurve: "linear", envelope: {points: [[0, 1]], releaseCurve: {mode: "follow", points: [[0, 1], [0.05, 0]]}}, keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 60, sample: "h1", loop: {start: 0, end: 64}}]},
             {id: "d", nameGuess: "Unused thing", kind: "melodic", used: false, usedIn: [], keyRegions: []}]}));
         if (f.endsWith("h1.wav")) return __wav; throw new Error("unexpected " + f); };
       globalThis.__srcs = 0;`);
  // the harness's innerHTML = "" keeps old children (a browser clears them) — each check reads only the
  // rows appended SINCE it last checked, by count
  let seen = 0;
  const rowLabels = () => {
    const all = val(`[...document.getElementById("instrows").children].map(r => (r.children[0] || r).textContent)`);
    const fresh = all.slice(seen); seen = all.length; return fresh;
  };
  // no song open: no shortcut
  run(`songKey = null; instNav = {game: null, sub: null};`);
  await run(`renderInstSheet()`);
  assert.deepEqual(rowLabels(), ["GoldenEye 007 ›"], "only games with a PS1/N64 library; no shortcut without an open game song");
  // a game song open: the shortcut leads
  run(`songKey = "albums/n64/goldeneye-007/dam.mid"; instNav = {game: null, sub: null};`);
  await run(`renderInstSheet()`);
  assert.deepEqual(rowLabels(), ["Instruments in this song ›", "GoldenEye 007 ›"], "the shortcut appears only for a game song, and leads");
  run(`songKey = null;`);
  // the game's menu: All instruments (A–Z, natural sort — not most-used-first), then its songs in album order
  await run(`instAlbums().then(gs => { globalThis.__g = gs[0]; })`);
  run(`instNav = {game: globalThis.__g, sub: null};`);
  await run(`renderInstSheet()`);
  assert.deepEqual(rowLabels(), ["‹ All games", "All instruments (A–Z) ›", "Dam ›", "Facility ›"], "All instruments first, then every song with a used instrument, album order");
  run(`instNav = {game: globalThis.__g, sub: "all"};`);
  await run(`renderInstSheet()`);
  assert.deepEqual(rowLabels(), ["‹ GoldenEye 007", "▶ Soft pad  · in 2 songs", "▶ Soft pad 2  · in 1 song", "▶ Soft pad 10  · in 1 song"],
    "natural sort: Soft pad, Soft pad 2, Soft pad 10 — not Soft pad 10 before Soft pad 2");
  // a song view lists only that song's instruments
  run(`instNav = {game: globalThis.__g, sub: {title: "Dam", path: "albums/n64/goldeneye-007/dam.mid"}};`);
  await run(`renderInstSheet()`);
  assert.deepEqual(rowLabels(), ["‹ GoldenEye 007", "▶ Soft pad", "▶ Soft pad 2"], "Dam: its two instruments only, not Facility's");
  run(`instNav = {game: globalThis.__g, sub: {title: "Facility", path: "albums/n64/goldeneye-007/facility.mid"}};`);
  await run(`renderInstSheet()`);
  assert.deepEqual(rowLabels(), ["‹ GoldenEye 007", "▶ Soft pad", "▶ Soft pad 10"], "Facility: its two instruments only, not Dam's");
  run(`ensureAudio(); audio.createBufferSource = () => { globalThis.__srcs++; return {connect() {}, start() {}, buffer: null}; };`);
  const settle = async p => { for (let i = 0; i < 40; i++) { await Promise.resolve(); app2.tick(20); await Promise.resolve(); await Promise.resolve(); } return p; }; // the audio clock check waits on the harness's fake timers
  await settle(run(`instLibrary("goldeneye-007/").then(lib => instAudition("goldeneye-007/", lib, lib.instruments.find(i => i.id === "a")))`));
  assert.equal(val(`globalThis.__srcs`), 3, "root, fifth, octave");
  assert.equal(val(`globalThis.__fetched.filter(f => f.endsWith(".wav")).length`), 1, "each sample fetched once");
});
test("instruments: a song view labels by the open song's own track (ch/prog match), leftover instruments alphabetical", () => {
  installSong();
  run(`song.tracks = [{name: "ch 1 prog 2", notes: []}, {name: "ch 2 prog 1", notes: []}, {name: "lead (renamed)", notes: []}];
       songKey = "albums/n64/goldeneye-007/dam.mid";`);
  const lib = {instruments: [
    {id: "a", nameGuess: "Soft pad", used: true, usedIn: ["Dam"], program: 1},
    {id: "b", nameGuess: "Bell", used: true, usedIn: ["Dam"], program: 2},
    {id: "c", nameGuess: "Zither", used: true, usedIn: ["Dam"], program: 9}, // no track claims prog 9 — falls to the leftover bucket
    {id: "spc:deadbeef:inst", nameGuess: "Pluck", used: true, usedIn: ["Dam"], program: null}, // a SNES instrument: no program at all — must not crash the ch/prog match, just fall to the leftover bucket too
  ]};
  run(`globalThis.__lib = ${JSON.stringify(lib)};`);
  const rows = val(`songInstrumentRows(globalThis.__lib, "Dam", "albums/n64/goldeneye-007/dam.mid").map(r => r.label)`);
  assert.deepEqual(rows, ["ch 1 prog 2 · Bell", "ch 2 prog 1 · Soft pad", "Pluck", "Zither"], "track order for the matched pair, then the unmatched ones plain and alphabetical — a null-program instrument included, not thrown on");
  run(`songKey = null;`);
});

test("instAlbums: lists published albums whose game files carry an instrument library — NES, Game Boy, SNES, PS1, N64; a Genesis (vgm) album is excluded", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  run(`CATALOG = {"GoldenEye": [["Dam", "albums/n64/goldeneye-007/dam.mid"]],
               "Final Fantasy VII": [["Bombing Mission", "albums/ps1/final-fantasy-vii/bombing-mission.mid"]],
               "Chrono Trigger": [["Corridors of Time", "albums/snes/chrono-trigger/corridors-of-time.mid"]],
               "Mega Man 2": [["Dr. Wily", "albums/nes/mega-man-2/dr-wily.mid"]],
               "Tetris": [["Type A", "albums/game-boy/tetris/type-a.mid"]],
               "Sonic": [["Green Hill", "albums/genesis/sonic/green-hill.mid"]]};
       albumMetaCache["albums/n64/goldeneye-007"] = {title: "GoldenEye 007", nsf: {vault: "goldeneye-007/", chip: "usf"}};
       albumMetaCache["albums/ps1/final-fantasy-vii"] = {title: "Final Fantasy VII", nsf: {vault: "final-fantasy-vii/", chip: "psf"}};
       albumMetaCache["albums/snes/chrono-trigger"] = {title: "Chrono Trigger", nsf: {vault: "chrono-trigger/", chip: "spc"}};
       albumMetaCache["albums/nes/mega-man-2"] = {title: "Mega Man 2", nsf: {vault: "mega-man-2.nsf"}};
       albumMetaCache["albums/game-boy/tetris"] = {title: "Tetris", nsf: {vault: "tetris.gbs", chip: "gbs"}};
       albumMetaCache["albums/genesis/sonic"] = {title: "Sonic", nsf: {vault: "sonic/", chip: "vgm"}};`);
  await run(`instAlbums().then(gs => { globalThis.__titles = gs.map(g => g.title); })`);
  assert.deepEqual(val(`globalThis.__titles`), ["Chrono Trigger", "Final Fantasy VII", "GoldenEye 007", "Mega Man 2", "Tetris"],
    "every console with an extractor lists (alphabetical; an NES album names no chip); Genesis does not");
  // the folder rule matches the extractor's (tools/instruments/model.mjs)
  const { instrumentsFolder } = await import("../tools/instruments/model.mjs");
  for (const v of ["goldeneye-007/", "tetris.nsf", "tetris.gbs"]) assert.equal(val(`instFolder(${JSON.stringify(v)})`), instrumentsFolder(v), v);
});

test("game instrument voice: a voice id gives back its album's vault — folder vaults regain the slash, NES/GB single files stay whole", () => {
  for (const v of ["goldeneye-007/", "tetris.nsf", "tetris.gbs"])
    assert.equal(run(`gameVoiceVault(parseGameVoice(gameVoiceId({vault: ${JSON.stringify(v)}}, {id: "a:b"})).vault)`), v, v);
});

test("game instrument voice: the track: directive round-trips a colon-heavy id, and the rename rewrite keeps it intact", () => {
  installSong();
  run(`song.tracks = [{name: "lead", notes: []}];
       songKey = "albums/compositions/nightroll/gv-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}"); /* the local copy: editable */
       rollnotes = parseRollnotes("[1.1]\\ntrack: lead voice=game:goldeneye-007:rare:bank@0x2D1AB8:prog63\\n").map(resolveNote);
       finalizeNotes();`);
  assert.equal(val(`song.tracks[0].voice`), "game:goldeneye-007:rare:bank@0x2D1AB8:prog63", "the text directive keeps the colons");
  assert.equal(run(`rollnotes[0].text`), "track: lead voice=game:goldeneye-007:rare:bank@0x2D1AB8:prog63", "serialized text round-trips them too");
  // the JSON grammar round-trips the same id
  run(`rollnotes = parseRollnotesJSON(JSON.stringify({version: 1, notes: [{at: [1, 1], type: "track", track: "lead", voice: "game:goldeneye-007:rare:bank@0x2D1AB8:prog63"}]})).map(resolveNote); finalizeNotes();`);
  assert.equal(val(`song.tracks[0].voice`), "game:goldeneye-007:rare:bank@0x2D1AB8:prog63", "the JSON grammar keeps them too");
  // the rename rewrite keeps the id intact (colons and all)
  assert.equal(run(`renameTrack(0, "lead guitar")`), null);
  const dir = val(`rollnotes.find(n => n.trackdir && n.trackdir.name === "lead guitar")`);
  assert.equal(dir.trackdir.voice, "game:goldeneye-007:rare:bank@0x2D1AB8:prog63");
  assert.match(run(`rollnotes.find(n => n.trackdir && n.trackdir.name === "lead guitar").text`), /voice=game:goldeneye-007:rare:bank@0x2D1AB8:prog63/);
  run(`songKey = null; rollnotes = [];`);
});

test("game instrument voice: the voice & color menu's Game instruments picker (games -> a game's All instruments/songs -> a leaf list) writes voice=game:… and previews once", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  const wav = (() => { const n = 64, b = new Uint8Array(44 + n * 2), dv = new DataView(b.buffer); const w = (o, t) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0));
    w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 32000, true); dv.setUint32(28, 64000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, "data"); dv.setUint32(40, n * 2, true); for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, i % 8 < 4 ? 16000 : -16000, true); return b; })();
  app2.context.__wav = wav;
  app2.context.__play = { regionFor: (inst) => inst.keyRegions[0], playNote: () => new Float32Array(10).fill(0.4) }; // audition doesn't need real driver math for this test
  run(`instPlayModule = Promise.resolve(__play);
       CATALOG = {"GoldenEye": [["Dam", "albums/n64/goldeneye-007/dam.mid"]]};
       albumMetaCache["albums/n64/goldeneye-007"] = {title: "GoldenEye 007", nsf: {vault: "goldeneye-007/", chip: "usf", tracks: {}}};
       vaultFetch = async f => {
         if (f.endsWith("instruments.json")) return new TextEncoder().encode(JSON.stringify({format: "night-roll-instruments", version: 1,
           samples: {h1: {rate: 32000, loop: null, file: "h1.wav"}},
           instruments: [{id: "rare:bank@0x2D1AB8:prog63", nameGuess: "Soft pad", kind: "melodic", used: true, usedIn: ["Dam"],
             keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 60, sample: "h1"}]}]}));
         if (f.endsWith("h1.wav")) return __wav;
         throw new Error("unexpected " + f);
       };
       createComposition(120, 4, 4);
       ensureAudio(); globalThis.__srcs = 0;
       audio.createBufferSource = () => { globalThis.__srcs++; return {connect() {}, start() {}, buffer: null}; };`);
  const settle = async () => { for (let i = 0; i < 40; i++) { await Promise.resolve(); app2.tick(20); await Promise.resolve(); await Promise.resolve(); } };
  const clickByText = async (text) => { // finds the button/row whose OWN textContent is `text` and clicks it, then lets any async fill settle
    run(`(() => { const row = [...document.getElementById("voicemenu").children].find(r => r.textContent === ${JSON.stringify(text)}); if (!row) throw new Error("no row " + ${JSON.stringify(text)}); row.click(); })();`);
    await settle();
  };
  run(`voiceMenuTi = 0; voiceMenuGroup = "Game instruments"; voiceMenuGameVault = null; voiceMenuGameSub = null; buildVoiceMenu(0);`);
  await settle();
  await clickByText("GoldenEye 007 ›");
  await clickByText("All instruments (A–Z) ›");
  await clickByText("   Soft pad  · in 1 song");
  assert.equal(val(`song.tracks[0].voice`), "game:goldeneye-007:rare:bank@0x2D1AB8:prog63", "the picker wrote the game: voice, id colons and all");
  assert.match(val(`rollnotes.find(n => n.trackdir).text`), /voice=game:goldeneye-007:rare:bank@0x2D1AB8:prog63/, "synced as the track: directive");
  assert.ok(val(`globalThis.__srcs`) > 0, "assigning auditions it once");
});

test("game instrument voice: scheduleNote renders each note through playNote and caches a repeat", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  const wav = (() => { const n = 64, b = new Uint8Array(44 + n * 2), dv = new DataView(b.buffer); const w = (o, t) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0));
    w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 32000, true); dv.setUint32(28, 64000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, "data"); dv.setUint32(40, n * 2, true); for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, i % 8 < 4 ? 16000 : -16000, true); return b; })();
  app2.context.__wav = wav;
  // playNote is a closure from THIS (outer) realm, so it must count on an outer variable — a
  // globalThis write inside it lands on the outer Node globalThis, not the vm sandbox's
  let playNoteCalls = 0;
  app2.context.__play = { regionFor: inst => inst.keyRegions[0], playNote: () => { playNoteCalls++; return new Float32Array(20).fill(0.3); } };
  run(`instPlayModule = Promise.resolve(__play);
       vaultFetch = async f => {
         if (f.endsWith("instruments.json")) return new TextEncoder().encode(JSON.stringify({format: "night-roll-instruments", version: 1,
           samples: {h1: {rate: 32000, loop: null, file: "h1.wav"}},
           instruments: [{id: "lead", nameGuess: "Lead", kind: "melodic", used: true, usedIn: [], keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 60, sample: "h1"}]}]}));
         if (f.endsWith("h1.wav")) return __wav;
         throw new Error("unexpected " + f);
       };
       createComposition(120, 4, 4);
       song.tracks[0].notes = [{t: 0, d: 480, p: 64, v: 90}];
       rollnotes = parseRollnotes("[1.1]\\ntrack: " + song.tracks[0].name + " voice=game:goldeneye-007:lead\\n").map(resolveNote);
       finalizeNotes();
       ensureAudio(); playing = true;
       globalThis.__srcs = 0;
       audio.createBufferSource = () => { globalThis.__srcs++; return {connect() {}, start() {}, stop() {}, buffer: null}; };`);
  const settle = async () => { for (let i = 0; i < 40; i++) { await Promise.resolve(); app2.tick(20); await Promise.resolve(); await Promise.resolve(); } };
  await settle(); // gamePreloadForSong (triggered by finalizeNotes) fetches the library + this note's sample
  run(`scheduleNote(0, {p: 64, v: 90, ch: 0}, audio.currentTime + 0.01, 0.3);`);
  assert.equal(val(`globalThis.__srcs`), 1, "the note played a buffer source");
  assert.equal(playNoteCalls, 1, "rendered through playNote");
  run(`scheduleNote(0, {p: 64, v: 90, ch: 0}, audio.currentTime + 0.01, 0.3);`);
  assert.equal(val(`globalThis.__srcs`), 2, "a second source plays the repeat");
  assert.equal(playNoteCalls, 1, "the repeat came from the cache — no second render");
  run(`playing = false;`);
});

test("game instrument voice: a missing library falls back to the track's synth voice and logs one ⚠ line", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  run(`vaultFetch = async f => { throw new Error("404 " + f); };
       createComposition(120, 4, 4);
       song.tracks[0].notes = [{t: 0, d: 480, p: 64, v: 90}];
       rollnotes = parseRollnotes("[1.1]\\ntrack: " + song.tracks[0].name + " voice=game:no-such-game:lead\\n").map(resolveNote);
       finalizeNotes();
       ensureAudio(); playing = true;
       globalThis.__srcs = 0; globalThis.__oscs = 0;
       audio.createBufferSource = () => { globalThis.__srcs++; return {connect() {}, start() {}, stop() {}, buffer: null}; };
       const _co = audio.createOscillator.bind(audio);
       audio.createOscillator = () => { globalThis.__oscs++; return _co(); };
       appErrors.length = 0;`);
  const settle = async () => { for (let i = 0; i < 40; i++) { await Promise.resolve(); app2.tick(20); await Promise.resolve(); await Promise.resolve(); } };
  await settle(); // the preload's fetch rejects — never populates gameLibSync for this vault
  run(`scheduleNote(0, {p: 64, v: 90, ch: 0}, audio.currentTime + 0.01, 0.3);`);
  assert.equal(val(`globalThis.__srcs`), 0, "no game-instrument buffer played");
  assert.ok(val(`globalThis.__oscs`) > 0, "the note still sounds — the track's own synth voice, never silence");
  assert.match(val(`appErrors.map(e => e.msg).join(" ")`), /⚠ game instrument no-such-game · lead/, "one ⚠ line naming the game and instrument");
  const before = val(`appErrors.filter(e => /no-such-game/.test(e.msg)).length`);
  run(`scheduleNote(0, {p: 64, v: 90, ch: 0}, audio.currentTime + 0.01, 0.3);`);
  assert.equal(val(`appErrors.filter(e => /no-such-game/.test(e.msg)).length`), before, "a repeated miss doesn't spam more ⚠ lines this session");
  run(`playing = false;`);
});

test("soundfont: File → Import… routes a .sf2 (RIFF/sfbk sniff), keeps a device copy + registers it, and reports its preset count", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  const bytes = new Uint8Array(24);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([0x73, 0x66, 0x62, 0x6b], 8); // "sfbk" — parseSf2 itself is mocked below; only sf2Magic's sniff reads real bytes
  app2.context.__sf2bytes = bytes;
  app2.context.__sf2 = {parseSf2: () => ({name: "Community Piano", presets: [{name: "Grand", bank: 0, program: 0}, {name: "Bright", bank: 0, program: 1}], samples: {}})};
  run(`sf2PlayModule = Promise.resolve(__sf2);
       globalThis.__idbPut = [];
       idbSf2Put = (slug, b) => { globalThis.__idbPut.push([slug, b.length]); return Promise.resolve(true); };
       localStorage.removeItem("ff1roll-sf2-index");
       localStorage.setItem("ff1roll-ghtoken", "t"); // a repo IS configured by default (cfg().nsfRepo) — check-before-PUT says it's already there, so no further status line overwrites the result
       // some unrelated ambient fetch (catalog/manifest polling) may also be in flight in
       // this sandbox; only the soundfonts/ check matters to this test, so anything else
       // just hangs (never resolves) rather than completing with an error that would
       // overwrite noteinfo with an unrelated message
       fetch = async url => String(url).includes("soundfonts/") ? {ok: true, arrayBuffer: async () => new ArrayBuffer(0)} : new Promise(() => {});`);
  await run(`openPickedFiles([{name: "Community Piano.sf2", bytes: __sf2bytes}])`);
  assert.deepEqual(val(`globalThis.__idbPut`), [["community-piano", 24]], "the raw bytes are kept on this device (IndexedDB), not just parsed and dropped");
  assert.deepEqual(val(`sf2Registry()`), [{slug: "community-piano", name: "Community Piano"}], "the on-device index the voice menu's Soundfonts list reads");
  assert.equal(val(`document.getElementById("noteinfo").textContent`), "✓ Community Piano: 2 presets — pick them in a track's voice menu under Soundfonts");
  // a soundfont a song opens with resolves straight from the in-memory cache filled at import — no re-fetch
  assert.equal(val(`sf2Fonts.has("community-piano")`), true);
});

test("soundfont: with no game files & instruments repo configured, the import still stores locally and says so, without failing", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  const bytes = new Uint8Array(16);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); bytes.set([0x73, 0x66, 0x62, 0x6b], 8);
  app2.context.__sf2bytes = bytes;
  app2.context.__sf2 = {parseSf2: () => ({name: "Loose Font", presets: [{name: "P", bank: 0, program: 0}], samples: {}})};
  run(`sf2PlayModule = Promise.resolve(__sf2);
       idbSf2Put = () => Promise.resolve(true);
       localStorage.removeItem("ff1roll-sf2-index");
       document.getElementById("cfgnsfrepo").value = ""; settingsPersist("cfgnsfrepo"); cfg.c = null;`);
  assert.equal(val(`cfg().nsfRepo`), "");
  await run(`openPickedFiles([{name: "Loose Font.sf2", bytes: __sf2bytes}])`);
  assert.deepEqual(val(`sf2Registry().map(f => f.slug)`), ["loose-font"], "still usable on this device even with nowhere to share it");
  assert.match(val(`document.getElementById("noteinfo").textContent`), /stays on this device.*game files.*instruments repo/);
});

test("soundfont: a garbled .sf2 (parseSf2 throws) reports the error and never reaches storage", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  const bytes = new Uint8Array(12);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); bytes.set([0x73, 0x66, 0x62, 0x6b], 8);
  app2.context.__sf2bytes = bytes;
  app2.context.__sf2 = {parseSf2: () => { throw new Error("SF3/compressed samples aren't supported"); }};
  run(`sf2PlayModule = Promise.resolve(__sf2);
       globalThis.__idbPut = [];
       idbSf2Put = (slug, b) => { globalThis.__idbPut.push([slug, b.length]); return Promise.resolve(true); };
       localStorage.removeItem("ff1roll-sf2-index");`);
  await run(`openPickedFiles([{name: "bad.sf2", bytes: __sf2bytes}])`);
  assert.match(val(`document.getElementById("noteinfo").textContent`), /⚠ bad\.sf2 didn't load: SF3\/compressed samples aren't supported/);
  assert.deepEqual(val(`globalThis.__idbPut`), [], "nothing unparseable gets stored");
  assert.deepEqual(val(`sf2Registry()`), []);
});

test("soundfont voice: the track: directive round-trips an sf2:<slug>:<bank>:<program> voice id", () => {
  installSong();
  run(`song.tracks = [{name: "lead", notes: []}];
       songKey = "albums/compositions/nightroll/sf2-test.mid"; localStorage.setItem("ff1roll-draft-" + songKey, "{}");
       rollnotes = parseRollnotes("[1.1]\\ntrack: lead voice=sf2:community-piano:0:1\\n").map(resolveNote);
       finalizeNotes();`);
  assert.equal(val(`song.tracks[0].voice`), "sf2:community-piano:0:1");
  assert.equal(run(`rollnotes[0].text`), "track: lead voice=sf2:community-piano:0:1");
  run(`rollnotes = parseRollnotesJSON(JSON.stringify({version: 1, notes: [{at: [1, 1], type: "track", track: "lead", voice: "sf2:community-piano:0:1"}]})).map(resolveNote); finalizeNotes();`);
  assert.equal(val(`song.tracks[0].voice`), "sf2:community-piano:0:1", "the JSON grammar keeps it too");
  assert.deepEqual(val(`parseSf2Voice(song.tracks[0].voice)`), {slug: "community-piano", bank: 0, program: 1});
  run(`songKey = null; rollnotes = [];`);
});

test("soundfont voice: scheduleNote renders each note through playNote (a preset doubles as a play.mjs inst) and caches a repeat", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  let playNoteCalls = 0;
  app2.context.__play = {regionFor: inst => inst.keyRegions[0], playNote: () => { playNoteCalls++; return new Float32Array(20).fill(0.3); }};
  run(`instPlayModule = Promise.resolve(__play);
       sf2Fonts.set("myfont", Promise.resolve({name: "My Font", presets: [{name: "Lead", bank: 0, program: 5,
         zones: [{keyLo: 0, keyHi: 127, rootKey: 60, sample: "h1"}], keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 60, sample: "h1"}],
         gain: 1, velocityCurve: "linear"}], samples: {h1: {rate: 32000, loop: null, pcm: new Float32Array(20)}}}));
       createComposition(120, 4, 4);
       song.tracks[0].notes = [{t: 0, d: 480, p: 64, v: 90}];
       rollnotes = parseRollnotes("[1.1]\\ntrack: " + song.tracks[0].name + " voice=sf2:myfont:0:5\\n").map(resolveNote);
       finalizeNotes();
       ensureAudio(); playing = true;
       globalThis.__srcs = 0;
       audio.createBufferSource = () => { globalThis.__srcs++; return {connect() {}, start() {}, stop() {}, buffer: null}; };`);
  const settle = async () => { for (let i = 0; i < 40; i++) { await Promise.resolve(); app2.tick(20); await Promise.resolve(); await Promise.resolve(); } };
  await settle(); // gamePreloadForSong (triggered by finalizeNotes) resolves the font from the in-memory cache + warms instPlaySync
  run(`scheduleNote(0, {p: 64, v: 90, ch: 0}, audio.currentTime + 0.01, 0.3);`);
  assert.equal(val(`globalThis.__srcs`), 1, "the note played a buffer source");
  assert.equal(playNoteCalls, 1, "rendered through playNote — the preset object itself, as a play.mjs inst");
  run(`scheduleNote(0, {p: 64, v: 90, ch: 0}, audio.currentTime + 0.01, 0.3);`);
  assert.equal(val(`globalThis.__srcs`), 2, "a second source plays the repeat");
  assert.equal(playNoteCalls, 1, "the repeat came from the cache — no second render");
  run(`playing = false;`);
});

test("soundfont voice: a missing/unreachable soundfont falls back to the track's synth voice and logs one ⚠ line", async () => {
  const app2 = createApp(); const run = c => app2.run(c), val = c => JSON.parse(run(`JSON.stringify(${c})`));
  run(`vaultFetch = async f => { throw new Error("404 " + f); };
       createComposition(120, 4, 4);
       song.tracks[0].notes = [{t: 0, d: 480, p: 64, v: 90}];
       rollnotes = parseRollnotes("[1.1]\\ntrack: " + song.tracks[0].name + " voice=sf2:no-such-font:0:0\\n").map(resolveNote);
       finalizeNotes();
       ensureAudio(); playing = true;
       globalThis.__srcs = 0; globalThis.__oscs = 0;
       audio.createBufferSource = () => { globalThis.__srcs++; return {connect() {}, start() {}, stop() {}, buffer: null}; };
       const _co = audio.createOscillator.bind(audio);
       audio.createOscillator = () => { globalThis.__oscs++; return _co(); };
       appErrors.length = 0;`);
  const settle = async () => { for (let i = 0; i < 40; i++) { await Promise.resolve(); app2.tick(20); await Promise.resolve(); await Promise.resolve(); } };
  await settle(); // the preload's fetch rejects — never populates sf2Sync for this slug
  run(`scheduleNote(0, {p: 64, v: 90, ch: 0}, audio.currentTime + 0.01, 0.3);`);
  assert.equal(val(`globalThis.__srcs`), 0, "no soundfont buffer played");
  assert.ok(val(`globalThis.__oscs`) > 0, "the note still sounds — the track's own synth voice, never silence");
  assert.match(val(`appErrors.map(e => e.msg).join(" ")`), /⚠ soundfont no-such-font 0:0/, "one ⚠ line naming the font and preset");
  const before = val(`appErrors.filter(e => /no-such-font/.test(e.msg)).length`);
  run(`scheduleNote(0, {p: 64, v: 90, ch: 0}, audio.currentTime + 0.01, 0.3);`);
  assert.equal(val(`appErrors.filter(e => /no-such-font/.test(e.msg)).length`), before, "a repeated miss doesn't spam more ⚠ lines this session");
  run(`playing = false;`);
});

test("folder tree: one level per tap — NES › Mega Man 2 › songs; album titles name the leaves", () => {
  run(`CATALOG = {"Final Fantasy I": [["Overworld", "albums/nes/final-fantasy-i/songs/overworld.mid"]],
                 "Mega Man 2": [["Air Man", "albums/nes/mega-man-2/air-man.mid"]],
                 "Chrono Trigger": [["Corridors of Time", "albums/snes/chrono-trigger/corridors-of-time.mid"]],
                 "My Compositions": [["Threnody", "albums/compositions/threnody.mid"]],
                 "Night Roll Sketches": [["Ambush", "albums/compositions/nightroll/ambush.mid"]],
                 "Starters": [["Prelude", "albums/starters/bach-prelude-in-c.mid"]]};`);
  const top = val(`subfolderKeys(folderTree(publishedPaths()))`);
  assert.deepEqual(top, ["compositions", "nes", "snes", "starters"], "top level sorted by title: My Compositions, NES, SNES, Starters");
  assert.deepEqual(val(`subfolderKeys(nodeAt(folderTree(publishedPaths()), "nes"))`), ["final-fantasy-i", "mega-man-2"]);
  assert.equal(run(`nodeCount(nodeAt(folderTree(publishedPaths()), "nes"))`), 2);
  assert.equal(run(`segTitle("nes")`), "NES");
  assert.equal(run(`segTitle("nes/mega-man-2")`), "Mega Man 2");
  assert.equal(run(`segTitle("compositions/nightroll")`), "Night Roll Sketches");
  assert.deepEqual(val(`nodeAt(folderTree(publishedPaths()), "compositions").songs`), ["albums/compositions/threnody.mid"], "a folder holds its own songs beside its subfolders");
  assert.equal(run(`parentFolder("nes/mega-man-2")`), "nes");
  assert.equal(run(`parentFolder("nes")`), "");
  assert.equal(run(`groupOf("albums/nes/mega-man-2/air-man.mid")`), "Mega Man 2");
});

test("jobs: a job is a plain record mirrored to this device — progress, done, cancel, and interrupted at boot", async () => {
  run(`jobs = []; localStorage.removeItem("ff1roll-jobs"); JOB_KINDS.test = {label: j => "Test · " + j.title, open() {}, retry() {}};
       globalThis.__api = null; globalThis.__gate = new Promise(res => { globalThis.__open = res; });
       jobStart("test", "three tracks", [{label: "a"}, {label: "b"}, {label: "c"}], async api => {
         __api = api; api.update(0, {st: "running", pct: 0.4}); await __gate;
         api.update(0, {st: "done"});
         if (api.aborted) { api.cancel(); return; }
         api.update(1, {st: "done"}); api.update(2, {st: "silent"});
       }, {slug: "x"});`);
  await run(`Promise.resolve()`);
  assert.equal(val(`jobs.length`), 1);
  assert.equal(run(`jobs[0].state`), "running");
  assert.equal(run(`jobProgress(jobs[0])`), "0/3 · a 40%");
  assert.equal(run(`jobsFind("test", "x", true).title`), "three tracks");
  assert.equal(run(`jobsFind("test", "y", true)`), null);
  assert.equal(run(`document.getElementById("jobsbtn").textContent`), "⏳ 1");
  assert.equal(run(`document.getElementById("jobsbtn").style.display`), "");
  app.tick(300); // the throttled mirror lands
  assert.equal(JSON.parse(app.store.get("ff1roll-jobs"))[0].items[0].pct, 0.4);
  run(`__open();`);
  await run(`__gate`); await run(`Promise.resolve()`); await run(`Promise.resolve()`);
  assert.equal(run(`jobs[0].state`), "done");
  assert.deepEqual(val(`jobs[0].items.map(i => i.st)`), ["done", "done", "silent"]);
  assert.equal(run(`jobProgress(jobs[0])`), "3/3");
  assert.equal(run(`document.getElementById("jobsbtn").textContent`), "⏳", "finished: no count, dim");
  // cancel: ✕ flips aborted; the runner ends the job as cancelled
  run(`globalThis.__gate = new Promise(res => { globalThis.__open = res; });
       jobStart("test", "cancel me", [{label: "a"}, {label: "b"}], async api => { api.update(0, {st: "running"}); await __gate; if (api.aborted) { api.update(0, {st: "cancelled"}); api.cancel(); return; } api.update(0, {st: "done"}); }, {slug: "c"});`);
  await run(`Promise.resolve()`);
  run(`jobCancel(jobs[1].id); __open();`);
  await run(`__gate`); await run(`Promise.resolve()`); await run(`Promise.resolve()`);
  assert.equal(run(`jobs[1].state`), "cancelled");
  // clear finished
  run(`jobsClearFinished()`);
  assert.equal(val(`jobs.length`), 0);
  assert.equal(run(`document.getElementById("jobsbtn").style.display`), "none");
  // boot after a mid-run death: the mirror's running job is interrupted, with its last counts
  app.store.set("ff1roll-jobs", JSON.stringify([{id: "z", kind: "test", title: "died", state: "running", slug: "d",
    items: [{label: "a", st: "done"}, {label: "b", st: "running", pct: 0.7}, {label: "c", st: "queued"}], note: "", started: 1, ended: 0, err: ""}]));
  const hit = val(`(() => { const j = jobsLoad(); return j && {state: j.state, sts: j.items.map(i => i.st)}; })()`);
  assert.deepEqual(hit, {state: "interrupted", sts: ["done", "interrupted", "queued"]});
  assert.equal(run(`jobProgress(jobs[0])`), "1/3 · b 70%");
  run(`jobs = []; localStorage.removeItem("ff1roll-jobs"); delete JOB_KINDS.test;`);
});

test("album play: loads that keep failing stop the album after ALBUM_MAX_FAILS, instead of skipping through every song", async () => {
  run(`CATALOG = {"Test Album": [1,2,3,4,5,6,7,8].map(i => ["Song " + i, "albums/test/s" + i + ".mid"])};
       globalThis.__loads = 0;
       globalThis.__realLoad = loadSong;
       loadSong = async () => { globalThis.__loads++; throw new Error("HTTP 403"); };`);
  try {
    await run(`albumStart("Test Album", 0)`);
    assert.equal(val(`globalThis.__loads`), 3, "three tries, then stop — not all eight");
    assert.equal(val(`albumRun`), null, "the album run is over");
    assert.match(run(`document.getElementById("noteinfo").textContent`), /album stopped: 3 songs in a row wouldn't load/);
  } finally { run(`loadSong = globalThis.__realLoad`); }
});

test("chip render: published PCM becomes AudioBuffers at once and the Float32 copy is dropped (a 137 s N64 song crashed a phone holding both)", () => {
  run(`globalThis.AudioBuffer = class { constructor(o) { this.numberOfChannels = o.numberOfChannels; this.length = o.length; this.sampleRate = o.sampleRate; this.ch = []; }
         copyToChannel(a, i) { this.ch[i] = a; } getChannelData(i) { return this.ch[i]; } };
       globalThis.__key = songKey;
       chipPublish(songKey, "usf", {lead: {l: new Float32Array(8), r: new Float32Array(8)}, bass: new Float32Array(8)}, 32000, 0);`);
  try {
    assert.equal(val(`chip.pcm`), null, "no Float32 copy kept");
    assert.deepEqual(val(`Object.keys(chip.buffers).sort()`), ["bass", "lead"]);
    assert.equal(val(`chip.buffers.lead.numberOfChannels`), 2);
    assert.equal(val(`chip.buffers.bass.sampleRate`), 32000);
    assert.equal(val(`chipActive() && chipHas("lead")`), true);
    // a constructor that fails part-way leaves every track as PCM, for the tap to build
    run(`let n = 0; globalThis.AudioBuffer = class extends AudioBuffer { constructor(o) { if (n++) throw new Error("nope"); super(o); } };
         chipPublish(songKey, "usf", {a: new Float32Array(4), b: new Float32Array(4)}, 32000, 0);`);
    assert.equal(val(`chip.buffers`), null);
    assert.deepEqual(val(`Object.keys(chip.pcm).sort()`), ["a", "b"], "the converted track is put back");
  } finally { run(`delete globalThis.AudioBuffer; chip.pcm = null; chip.buffers = null; chip.key = null;`); }
});
