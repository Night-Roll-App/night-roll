// What the real PS1 rips taught the pipeline (Final Fantasy VII PSF set,
// Zophar's Domain, 2026-09-27 — INTEGRATION.md "Real rips"). No rip bytes
// live here: fixtures are the TEXT the files carried (tags, names, header
// numbers) and synthetic reproductions of the container paths they
// exercised (minipsf → psflib chain, EXE overlay into RAM, the AKAO score
// byte code), built by tools/psx/make-test-seq.mjs from our own bytes.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestAKAO, makeTestMiniPSF, makeExe, makePSF, TEST_LIB_NAME } from "../tools/psx/make-test-seq.mjs";
import { parsePSF, loadPSFChain, assembleRam, scanMagic } from "../tools/psx/psf.mjs";
import { isAKAO, scanAKAO, parseAKAO, akaoNotes, akaoBpm, AKAO_PPQ, DELTA, TIMER_DIV_FF7, TIMER_DIV_LATER } from "../tools/psx/akao.mjs";
import { toNotesTxt, makeMidi } from "../tools/psx/notes.mjs";
import { bpmOf, secondsAt } from "../tools/psx/seq.mjs";
import { pitchName } from "../tools/nsf/notes.mjs";

const ASSUMED_V1 = "AKAO header layout 1 (0x14 bytes); tick clock 0x43d1 (243.86 Hz) assumed — the driver code is not in this image";

// ---- text fixtures from the real set ----

// "101 The Prelude.minipsf" [TAG] block, keys in the order Corlett wrote them
const PRELUDE_TAGS = {utf8: "1", _lib: "Final Fantasy 7.psflib", game: "Final Fantasy 7", artist: "Nobuo Uematsu",
  psfby: "Neill Corlett", year: "1997", copyright: "Squaresoft", volume: "1", title: "The Prelude", length: "4:19", fade: "9",
  genre: "RPG", comment: "Opening Credits"};
// "Final Fantasy 7.psflib": the comment is two `comment=` lines
const LIB_TAG_TEXT = "[TAG]comment=Driver and soundbank data for Final Fantasy 7.\ncomment=Not playable as an individual file.\ncopyright=Square\npsfby=Neill Corlett\nyear=1997-01-31\ngame=Final Fantasy VII\n";
// AKAO header facts read off the four tracks Josh asked for
const FF7_TRACKS = [
  {file: "101 The Prelude", id: 0x60, len: 0x14b0, reverb: 3, ts: "1996-12-18T22:46:34", mask: 0x1fff, tempoRaw: 0x4470, ticks: 10048, tag: "4:19"},
  {file: "105 Tifa's Theme", id: 0x23, len: 0x0b24, reverb: 1, ts: "1996-12-18T22:45:31", mask: 0x1fff, tempoRaw: 0x4470, ticks: 9408, tag: "4:48"},
  {file: "201 Main Theme of Final Fantasy VII", id: 0x0e, len: 0x2470, reverb: 4, ts: "1996-12-18T22:45:12", mask: 0xffff, tempoRaw: 0x48b7, ticks: 23808, tag: "11:22"},
  {file: "416 One-Winged Angel", id: 0x52, len: 0x2f24, reverb: 4, ts: "1996-12-18T22:46:19", mask: 0xffff, tempoRaw: 0x6910, ticks: 23208, tag: "6:53"},
];

test("real tag text: minipsf keys (utf8, _lib, length/fade) and the lib's two-line comment", () => {
  const exe = makeExe({textStart: 0x801D0000, text: new Uint8Array(16)});
  const mini = parsePSF(makePSF(exe, PRELUDE_TAGS));
  assert.equal(mini.version, 1);
  assert.equal(mini.reserved.length, 0, "PSF1: no reserved area");
  assert.equal(mini.crcOk, true);
  assert.deepEqual(mini.libs, ["Final Fantasy 7.psflib"]);
  assert.equal(mini.tags.title, "The Prelude");
  assert.equal(mini.tags.length, "4:19");
  assert.equal(mini.tags.fade, "9");
  assert.equal(mini.tags.utf8, "1");
  // lib: repeated key joins with a newline; no _lib of its own
  const lib = parsePSF(makePSF(exe, LIB_TAG_TEXT.slice(5)));
  assert.equal(lib.tags.comment, "Driver and soundbank data for Final Fantasy 7.\nNot playable as an individual file.");
  assert.deepEqual(lib.libs, []);
  assert.equal(lib.tags.game, "Final Fantasy VII");
});

test("minipsf → psflib: lib loads first, mini overlays inside the lib's span, PC comes from the lib", async () => {
  const akao = makeTestAKAO({voices: {0: [0xA5, 5, 0x02, 0xA0]}});
  const {lib, mini, libName} = makeTestMiniPSF(akao);
  assert.equal(libName, TEST_LIB_NAME);
  const asked = [];
  const chain = await loadPSFChain(mini, n => { asked.push(n); return n === libName ? lib : null; }, {name: "tune.minipsf"});
  assert.deepEqual(asked, [libName]);
  assert.deepEqual(chain.map(c => c.name), [libName, "tune.minipsf"], "load order: lib, then the mini on top");
  const {ram, pc, sp, ranges} = assembleRam(chain);
  assert.equal(pc, 0x800110C0, "entry is the lib's, not the mini's placeholder 0x80010000");
  assert.equal(sp, 0x801FFFF0);
  assert.deepEqual(ranges.map(r => [r.start, r.size]), [[0x80010000, 0x1C0800], [0x801D0000, 0x800]]);
  // the lib wrote LIBHERE! at 0x801D0000; the mini's page replaced it
  assert.equal(new TextDecoder().decode(ram.subarray(0x1D0000, 0x1D0004)), "AKAO");
  assert.equal(new TextDecoder().decode(ram.subarray(0x10000 + 0x10C0, 0x10000 + 0x10C6)), "DRIVER");
  assert.deepEqual(scanAKAO(ram), [0x1D0000]);
  assert.deepEqual(scanMagic(ram), {seq: [], vab: []}, "Square's driver: no SEQ, no VAB anywhere in RAM");
  // the parsed sequence is the one the mini carries
  const seq = parseAKAO(ram, 0x1D0000);
  assert.equal(seq.id, 0x60);
  // failure modes a picker must name: missing lib, self-referential lib
  await assert.rejects(loadPSFChain(mini, () => null, {name: "tune.minipsf"}), /missing library Test Game\.psflib/);
  const selfLib = makePSF(makeExe({textStart: 0x80010000, text: new Uint8Array(16)}), {_lib: "loop.psflib"});
  await assert.rejects(loadPSFChain(selfLib, () => selfLib, {name: "loop.psflib"}), /_lib cycle/);
});

test("AKAO header: magic, id, length, reverb, BCD timestamp, gapped voice mask, offsets relative to the next byte", () => {
  const bytes = makeTestAKAO({id: 0x1234, reverb: 4, voices: {0: [0xA0], 1: [0xA0, 0xA0], 3: [0xA0]}});
  assert.ok(isAKAO(bytes));
  const a = parseAKAO(bytes);
  assert.equal(a.id, 0x1234);
  assert.equal(a.reverbType, 4);
  assert.equal(a.length, bytes.length - 0x10, "length excludes the 16-byte header");
  assert.equal(a.timestamp, "1996-12-18T22:46:34");
  assert.equal(a.mask, 0b1011);
  assert.deepEqual(a.tracks.map(t => t.voice), [0, 1, 3]);
  // three offset fields at 0x14; each is relative to the byte after itself
  assert.deepEqual(a.tracks.map(t => t.offset), [0x1A, 0x1B, 0x1D]);
  assert.equal(bytes[0x14] + 0x16, 0x1A);
  // not AKAO: FF8/9-shaped header (mask above 24 bits at 0x10..0x13), or the word in text
  const v3 = Uint8Array.from(bytes); v3[0x13] = 0x80;
  assert.equal(isAKAO(v3), false);
  assert.equal(isAKAO(new TextEncoder().encode("AKAO is the composer's initials, said the wiki")), false);
  assert.deepEqual(scanAKAO(new Uint8Array([...new Uint8Array(7), ...bytes])), [7]);
});

// hand-assembled voice programs. Note opcodes: degree × 11 + length index
// (DELTA: 192 96 48 24 12 6 3 | 32 16 8 4); ties 0x84+i, rests 0x8F+i.
const N = (deg, i) => deg * 11 + i, TIE = i => 0x84 + i, REST = i => 0x8F + i;
// relative s16 for a jump at `at` (opcode position, 3 bytes) to `dest`
const rel = (at, dest) => { const r = dest - (at + 3); return [r & 255, (r >> 8) & 255]; };

test("AKAO score: notes, ties (after a note, after a rest), octaves, transpose, tuning, repeats, one-time length, loop by jump; drum mode; nested periods unrolled", () => {
  const v0 = [
    0xE8, 0xB7, 0x48,          // tempo raw 0x48B7 (Main Theme's value)
    0xFD, 0x30, 0x04,          // 48 ticks per beat, 4 beats: 4/4
    0xFE, 0x01, 0x00,          // measure 1
    0xA1, 0x2E,                // instrument 46
    0xA3, 0x7F, 0xA8, 0x64,    // master 127, volume 100 -> v100
    0xA5, 0x05,                // octave 5: C = 60
    /* 17 */ N(0, 2),          // C4 quarter        0..48
    N(4, 2),                   // E4 quarter        48..96
    N(7, 1),                   // G4 half           96..192
    TIE(2),                    // ... + quarter     ->240
    REST(2),                   // rest quarter      240..288
    TIE(2),                    // tie after a rest: silence goes on  288..336
    0xA6,                      // octave 6
    0xA2, 100, N(0, 2),        // one-time length 100: C5   336..436
    0xA7, 0xC0, 0x02,          // octave 5, transpose +2
    0xC8, N(0, 3), 0xC9, 0x02, // repeat twice: D4 eighth  436..460, 460..484
    0xC0, 0x00, 0xD8, 0x40,    // transpose 0, tuning +64/128 = ×1.5 = +702 cents
    N(0, 2),                   // C4 written, sounds G4 (+2c)  484..532
    0xD8, 0x00,
    0xEE, 0, 0,                // jump back to the first note (patched below)
  ];
  const jumpAt = v0.length - 3;
  v0.splice(jumpAt + 1, 2, ...rel(jumpAt, 17));
  const v1 = [
    0xA5, 0x03, 0xA8, 0x7F,
    0xEC, 0, 0,                // drum mode on; map lives after the score (patched below)
    N(0, 2), N(1, 2),          // degrees 0 and 1 -> keys 24, 25 whatever the octave
    0xED, 0xA5, 0x04, N(0, 2), // drum mode off: C3
    0xA0,                      // this voice ends (no loop)
  ];
  const v3 = [0xA5, 0x04, /* 2 */ N(0, 2), N(7, 2), 0xEE, 0, 0]; // C3 G3 quarters, jump to 2: period 96
  v3.splice(5, 2, ...rel(4, 2));
  const drumMap = [0x10, 0x24, 0x00, 0x7F, 0x40, 0x11, 0x26, 0x00, 0x70, 0x40];
  // absolute layout: header 0x14 + 3 fields, then v0, v1, v3, tail
  const base = 0x14 + 6, v1At = base + v0.length, tailAt = v1At + v1.length + v3.length;
  v1.splice(5, 2, ...rel(v1At + 4, tailAt));
  const akao = parseAKAO(makeTestAKAO({voices: {0: v0, 1: v1, 3: v3}, tail: drumMap}));
  const r = akaoNotes(akao);
  const {seq} = r;
  assert.equal(seq.ppq, 48);
  assert.equal(bpmOf(seq.tempo), 86.58);
  assert.deepEqual(seq.timeSigs, [{tick: 0, num: 4, den: 4}]);
  assert.deepEqual(seq.tempoMap, [{tick: 0, usq: Math.round(6e7 / akaoBpm(0x48B7))}]);
  const v0n = r.notes.filter(n => n.ch === 0);
  assert.deepEqual(v0n.map(n => [n.tick, n.endTick, pitchName(n.pitch), n.cents, n.vel, n.program]), [
    [0, 48, "C4", 0, 100, 46], [48, 96, "E4", 0, 100, 46], [96, 240, "G4", 0, 100, 46],
    [336, 436, "C5", 0, 100, 46], [436, 460, "D4", 0, 100, 46], [460, 484, "D4", 0, 100, 46],
    [484, 532, "G4", 2, 100, 46],
  ]);
  assert.equal(v0n[6].key, 60, "the written key stays on the note");
  // drums: octave ignored, program and played key from the map
  const v1n = r.notes.filter(n => n.ch === 1);
  assert.deepEqual(v1n.map(n => [n.tick, n.key, n.drum, n.program, n.tone && n.tone.key]), [
    [0, 24, true, 0x10, 0x24], [48, 25, true, 0x11, 0x26], [96, 48, false, 0, null],
  ]);
  assert.equal(v1n[2].pitch, 48);
  assert.equal(r.tracks[1].voice, 1);
  assert.equal(r.tracks[2].voice, 3);
  // v3 repeats every 96 ticks; the song loop is v0's 532: v3 is unrolled to it
  assert.deepEqual(seq.loop, {start: 0, end: 532, count: 127});
  assert.equal(seq.endTick, 532);
  const v3n = r.notes.filter(n => n.ch === 2);
  assert.deepEqual(v3n.map(n => n.tick), [0, 48, 96, 144, 192, 240, 288, 336, 384, 432, 480, 528]);
  assert.equal(v3n[11].endTick, 532, "the last copy is clipped at the loop end");
  assert.ok(v3n[2].unrolled && !v3n[1].unrolled);
  assert.deepEqual(seq.warnings, [
    ASSUMED_V1, // a synthetic block with no driver beside it: the clock is the layout's assumption, said so
    "tracks repeat with different periods (96, 532 ticks); shorter ones are unrolled to the longest",
    "1 track(s) with notes end without looping",
  ]);
  assert.deepEqual(r.channels, [0, 1, 2]);
  assert.deepEqual(r.programs.map(p => p.program), [46, 0x10, 0, 0x11]);

  // the text and the MIDI say where they came from
  const txt = toNotesTxt(r, {title: "akao"});
  assert.match(txt, /^# akao — 4\/4, 86\.58bpm, 3 bars, 48 ticks\/quarter \(from PS1 AKAO\)\n# loop: bar 1 beat 1 → bar 3 beat 4\.083 \(forever\)\n# note: AKAO header layout 1 \(0x14 bytes\); tick clock 0x43d1 \(243\.86 Hz\) assumed[^\n]*\n# note: tracks repeat with different periods/);
  assert.match(txt, /# Pitch is the AKAO key as written/);
  assert.match(txt, /## channel 1 program 46\nbar 1: 1 C4 1 v100, 2 E4 1 v100, 3 G4 3 v100\nbar 2: 4 C5 2\.083 v100\nbar 3: 2\.083 D4 0\.5 v100, 2\.583 D4 0\.5 v100, 3\.083 G4\+2c 1 v100/);
  assert.match(txt, /## channel 2 program 16,17,0 \(kit\)\nbar 1: 1 K24 1 v127, 2 K25 1 v127, 3 C3 1 v127/);
  assert.match(txt, /## channel 3 \(voice 3\) program 0\nbar 1: 1 C3 1 v127, 2 G3 1 v127, 3 C3 1 v127, 4 G3 1 v127\nbar 2: 1 C3 1 v127/);
  const mid = makeMidi(r);
  const hex = [...mid].map(b => b.toString(16).padStart(2, "0")).join(" ");
  assert.match(hex, /^4d 54 68 64 00 00 00 06 00 01 00 05 01 e0/, "type 1, conductor + 3 voices + voice 2's kit split off, PPQ 480");
  assert.match(hex, /63 68 20 32 20 70 72 6f 67 20 31 36 2c 31 37 20 6b 69 74/, "track named 'ch 2 prog 16,17 kit'");
  const usq = seq.tempoMap[0].usq;
  assert.ok(usq > 692000 && usq < 694000, "86.58bpm is about 693 ms per quarter: " + usq);
  assert.match(hex, new RegExp(`ff 51 03 ${[(usq >> 16) & 255, (usq >> 8) & 255, usq & 255].map(b => b.toString(16).padStart(2, "0")).join(" ")}`));
  assert.match(hex, /00 90 3c 64 83 60 80 3c 40/, "C4 on channel 1 for 480 ticks");
  // drum-mode degree 24 lands on channel 10 with a GM kit key (a raw 24 would
  // play as a kick in any GM player; the rhythm guess picks the voice)
  assert.doesNotMatch(hex, /99 18 7f/, "degree 24 is not written raw");
  assert.match(hex, /99 (24|26|2a|2e|33|29|2d|2f|30|32|31) 7f/, "one GM kit key on channel 10");
  assert.ok(r.kitGuess && r.kitGuess.some(g => g.key === 24), "the guess names the degree");
});

test("AKAO: tempo and meter stated after an opening rest belong to tick 0 (316, 414); later ones are changes", () => {
  const late = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: [0xA2, 4, REST(2), 0xE8, 0x70, 0x44, 0xFD, 0x18, 0x06, 0xA5, 5, N(0, 2), 0xA0]}})));
  assert.deepEqual(late.seq.tempoMap, [{tick: 0, usq: Math.round(6e7 / akaoBpm(0x4470))}]);
  assert.deepEqual(late.seq.timeSigs, [{tick: 0, num: 6, den: 8}]);
  assert.deepEqual(late.seq.warnings, [ASSUMED_V1]);
  assert.equal(late.notes[0].tick, 4);
  const change = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: [0xA5, 5, N(0, 2), 0xE8, 0x70, 0x44, N(0, 2), 0xA0]}})));
  assert.deepEqual(change.seq.tempoMap.map(t => t.tick), [0, 48]);
  assert.deepEqual(change.seq.warnings, [ASSUMED_V1, "no tempo at tick 0; 120bpm assumed until the first tempo event", "no time signature at tick 0; 4/4 assumed"]);
});

test("AKAO: staggered loop starts (echo voices) take the latest start, one period long; 0xCA forever-repeat is a loop", () => {
  const v0 = [0xE8, 0x70, 0x44, 0xFD, 0x30, 0x04, 0xA5, 5, /* 8 */ N(0, 2), N(4, 2), 0xEE, 0, 0]; v0.splice(11, 2, ...rel(10, 8));
  const v1 = [0xA2, 32, REST(2), 0xA5, 5, /* 5 */ N(0, 2), N(4, 2), 0xEE, 0, 0]; v1.splice(8, 2, ...rel(7, 5));
  const r = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: v0, 1: v1}})));
  assert.deepEqual(r.seq.loop, {start: 32, end: 128, count: 127});
  assert.equal(r.seq.endTick, 128);
  assert.deepEqual(r.notes.filter(n => n.ch === 0).map(n => [n.tick, n.endTick]), [[0, 48], [48, 96], [96, 128]]);
  assert.deepEqual(r.notes.filter(n => n.ch === 1).map(n => [n.tick, n.endTick]), [[32, 80], [80, 128]]);
  assert.deepEqual(r.seq.warnings, [ASSUMED_V1, "tracks start their loop at different ticks (0, 32); loop start is the latest"]);
  const forever = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: [0xA5, 5, 0xC8, N(0, 2), N(2, 3), 0xCA]}})));
  assert.deepEqual(forever.seq.loop, {start: 0, end: 72, count: 127});
  assert.deepEqual(forever.notes.map(n => [n.tick, n.endTick, n.pitch]), [[0, 48, 60], [48, 72, 62]]);
  // an unimplemented opcode stops that track and says so; the others go on
  const broken = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: [0xA5, 5, N(0, 2), 0xFA, N(0, 2), 0xA0], 1: [0xA5, 5, N(0, 2), 0xA0]}})));
  assert.equal(broken.notes.filter(n => n.ch === 0).length, 1);
  assert.equal(broken.notes.filter(n => n.ch === 1).length, 1);
  assert.match(broken.seq.warnings[1], /unimplemented opcode 0xfa at 0x1b; track stopped/);
});

test("tempo constant: FF7's driver runs on 0x43D1 (Tifa's tag length agrees), later AKAO games on 0x44E8", () => {
  assert.equal(TIMER_DIV_FF7, 0x43D1);
  assert.equal(TIMER_DIV_LATER, 0x44E8);
  assert.equal(Math.round(akaoBpm(0x48B7) * 100) / 100, 86.58);
  assert.equal(Math.round(akaoBpm(0x48B7, TIMER_DIV_LATER) * 100) / 100, 85.21);
  assert.equal(Math.round(akaoBpm(0x4470) * 100) / 100, 81.49);
  assert.equal(Math.round(0x4470 / akaoBpm(0x4470)), 215, "Qhimm's 'bpm = tempo / 214.998' is the 0x43D1 figure");
  // Tifa's Theme: 9408 ticks at raw 0x4470 loops from the top; Corlett's
  // length tag 4:48 is two passes. With 0x44E8 it would be 4:44.
  const tifa = FF7_TRACKS[1];
  const secs = tifa.ticks / AKAO_PPQ * 60 / akaoBpm(tifa.tempoRaw);
  assert.ok(Math.abs(secs * 2 - 288) < 1.5, `two passes = ${secs * 2}s, tag ${tifa.tag}`);
  assert.ok(Math.abs(tifa.ticks / AKAO_PPQ * 60 / akaoBpm(tifa.tempoRaw, TIMER_DIV_LATER) * 2 - 288) > 3);
  assert.deepEqual(DELTA, [192, 96, 48, 24, 12, 6, 3, 32, 16, 8, 4]);
  for (const t of FF7_TRACKS) assert.ok(t.mask <= 0xFFFFFF && t.len > 0 && t.ts.startsWith("1996-12-18"));
});

test("MIDI channels: a melodic source channel 9 leaves the GM drum channel; voices past 15 take free channels, then share", () => {
  const voices = {};
  for (let v = 0; v < 18; v++) voices[v] = [0xA5, 5, N(v % 12, 2), 0xA0];
  const r = akaoNotes(parseAKAO(makeTestAKAO({voices})));
  const mid = makeMidi(r);
  // split into MTrk chunks and read the first note-on status of each
  const status = [];
  for (let p = 14; p < mid.length;) {
    const len = ((mid[p + 4] << 24) | (mid[p + 5] << 16) | (mid[p + 6] << 8) | mid[p + 7]) >>> 0;
    const t = mid.subarray(p + 8, p + 8 + len);
    const on = [...t].findIndex((b, i) => (b & 0xF0) === 0x90 && i > 0);
    status.push(on >= 0 ? t[on] & 0x0F : null);
    p += 8 + len;
  }
  assert.equal(status.length, 19, "conductor + 18 voices");
  const chans = status.slice(1);
  assert.deepEqual(chans.slice(0, 9), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.notEqual(chans[9], 9, "voice 10 is melodic: not on the drum channel");
  assert.deepEqual(chans.slice(10, 16), [10, 11, 12, 13, 14, 15]);
  assert.ok(!chans.includes(9));
  assert.ok(chans.every(c => c >= 0 && c <= 15), "no status byte overflowed into 0xA0..");
  assert.equal(new Set(chans).size, 15, "15 melodic channels exist; 18 voices share");
});

test("dump CLI: a minipsf finds its lib beside it (or via --lib), titles from the tag, refuses a missing lib", () => {
  const dir = mkdtempSync(join(tmpdir(), "psx-real-"));
  const v0 = [0xE8, 0x70, 0x44, 0xFD, 0x30, 0x04, 0xA5, 5, N(0, 2), N(4, 2), N(7, 1), 0xEE, 0, 0];
  v0.splice(12, 2, ...rel(11, 8));
  const {lib, mini, libName} = makeTestMiniPSF(makeTestAKAO({voices: {0: v0}}), {title: "Tune From Tag"});
  writeFileSync(join(dir, "101 Tune.minipsf"), mini);
  writeFileSync(join(dir, libName), lib);
  const run = (...a) => execFileSync(process.execPath, ["tools/psx/dump.mjs", ...a], {stdio: ["ignore", "pipe", "pipe"]});
  run(join(dir, "101 Tune.minipsf"));
  const txt = readFileSync(join(dir, "101 Tune.notes.txt"), "utf8");
  assert.match(txt, /^# Tune From Tag — 4\/4, 81\.49bpm, 1 bars, 48 ticks\/quarter \(from PS1 AKAO\)\n# loop: bar 1 beat 1 → bar 2 beat 1 \(forever\)/);
  assert.match(txt, /## channel 1 program 0\nbar 1: 1 C4 1 v127, 2 E4 1 v127, 3 G4 2 v127/);
  const mid = readFileSync(join(dir, "101 Tune.mid"));
  assert.equal(mid.subarray(0, 4).toString("latin1"), "MThd");
  // lib elsewhere: --lib names it
  const other = join(dir, "elsewhere"); mkdirSync(other);
  writeFileSync(join(other, "solo.minipsf"), mini);
  run(join(other, "solo.minipsf"), "--lib", join(dir, libName), "--out", join(other, "solo"));
  assert.match(readFileSync(join(other, "solo.notes.txt"), "utf8"), /from PS1 AKAO/);
  // no lib anywhere: a named refusal, not a silent scan of half the RAM
  const alone = join(dir, "alone"); mkdirSync(alone);
  writeFileSync(join(alone, "solo.minipsf"), mini);
  const res = spawnSync(process.execPath, ["tools/psx/dump.mjs", join(alone, "solo.minipsf")], {encoding: "utf8"});
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /missing library Test Game\.psflib/);
});

// ---- AKAO driver generations (2026-09-28): the file says which ----
// Layout from the header's shape, tick clock from the driver code beside it
// (`li a1, DIV; jal SetRCnt`), "assumed" when the image has no driver.
import { akaoLayout, detectTimerDiv, pickAKAO, akaoInstrContext, akaoRecord } from "../tools/psx/akao.mjs";
import { existsSync as exists, readdirSync } from "node:fs";

test("AKAO layout 3 (0x40 header): voice mask at 0x20 past 24 bits, offsets from the field, length notes, FE-escaped tempo/meter, FE 0B's operand", () => {
  const v0 = [
    0xFE, 0x00, 0x00, 0x40,     // tempo 0x4000
    0xFE, 0x15, 48, 4,          // 4/4
    0xA5, 4,
    0xF0, 24,                   // C, explicit length 24
    N(4, 2),                    // E quarter
    0xFE, 0x0B, 0xA3,           // one operand byte (Chrono Cross): 0xA3 is not a volume opcode here
    REST(2),                    // rest 48
    0xF7, 0,                    // G, length 0 -> the table's (whole note)
    0xA0,
  ];
  const bytes = makeTestAKAO({layout: 3, sampleSetId: 5, voices: {0: v0, 28: [0xA0]}});
  const L = akaoLayout(bytes);
  assert.equal(L.version, 3); assert.equal(L.headerSize, 0x40);
  const a = parseAKAO(bytes);
  assert.equal(a.mask, 0x10000001);
  assert.deepEqual(a.tracks.map(t => t.voice), [0, 28]);
  assert.equal(a.tracks[0].offset, 0x44, "relative to the offset field itself");
  assert.equal(a.sampleSetId, 5); assert.equal(a.timestamp, null);
  const r = akaoNotes(a);
  assert.deepEqual(r.notes.map(n => [n.tick, n.endTick, n.key]), [[0, 24, 48], [24, 72, 52], [120, 312, 55]]);
  assert.equal(r.seq.warnings[0], "AKAO header layout 3 (0x40 bytes); tick clock 0x44e8 (240.00 Hz) assumed — the driver code is not in this image");
  assert.equal(r.seq.tempoDiv, TIMER_DIV_LATER);
  assert.equal(bpmOf(r.seq.tempoMap[0].usq), 75, "0x4000 at 240 Hz = 60 ticks/s = 75bpm");
});

test("AKAO layout 2 (0x20 header): FC-escaped ops, 6-byte drum map entries, year-month stamp", () => {
  const v = [0xFC, 0x00, 0x00, 0x40, 0xFC, 0x15, 48, 3, 0xA5, 5, N(0, 2), 0xFC, 0x12, 0x10, 0x40, N(2, 2), 0xA0];
  const a = parseAKAO(makeTestAKAO({layout: 2, voices: {0: v}}));
  assert.equal(a.version, 2);
  assert.equal(a.timestamp, "1998-02-00T00:00:00");
  const r = akaoNotes(a);
  assert.deepEqual(r.notes.map(n => [n.tick, n.key]), [[0, 60], [48, 62]]);
  assert.deepEqual(r.seq.timeSigs, [{tick: 0, num: 3, den: 4}]);
  assert.match(r.seq.warnings[0], /^AKAO header layout 2 \(0x20 bytes\); tick clock 0x44e8 \(240\.00 Hz\) assumed/);
  assert.ok(r.notes[1].gain, "FC 12 is a volume fade under the held note");
});

test("tick clock from the driver code: `li a1, DIV` then `jal`; a bare immediate in data does not count", () => {
  const ram = new Uint8Array(0x30000);
  const block = makeTestAKAO({layout: 3, voices: {0: [0xFE, 0x00, 0x00, 0x40, 0xA5, 5, N(0, 2), 0xA0]}});
  ram.set(block, 0x20000);
  ram.set([0xE8, 0x44, 0x08, 0x34], 0x1000);                          // ori t0, zero, 0x44E8 — not the call
  ram.set([0xE8, 0x44, 0x05, 0x34, 0, 0, 0, 0x08], 0x1100);           // ori a1, zero, 0x44E8; j (not jal)
  assert.equal(detectTimerDiv(ram).div, null);
  ram.set([0xD1, 0x43, 0x05, 0x24, 0x39, 0x2E, 0x01, 0x0C], 0x2000);  // addiu a1, zero, 0x43D1; jal
  assert.equal(detectTimerDiv(ram).div, TIMER_DIV_FF7);
  const r = akaoNotes(parseAKAO(ram, 0x20000));
  assert.equal(r.seq.warnings[0], "AKAO header layout 3 (0x40 bytes); tick clock 0x43d1 (243.86 Hz) read from the driver code");
  assert.equal(r.seq.tempoDiv, TIMER_DIV_FF7, "the file's clock beats the layout's assumption");
  assert.equal(akaoNotes(parseAKAO(ram, 0x20000), {tempoDiv: TIMER_DIV_LATER}).seq.tempoDiv, TIMER_DIV_LATER, "a caller may still say");
});

test("pickAKAO: the song's own block; else a patched `li a0, N` names index N in header-id order", () => {
  const ram = new Uint8Array(0x40000);
  const blk = id => makeTestAKAO({id, voices: {0: [0xA5, 5, N(0, 2), 0xA0]}});
  ram.set(blk(3), 0x10000); ram.set(blk(1), 0x10100); ram.set(blk(2), 0x10200);
  ram.set([0x01, 0x00, 0x04, 0x24], 0x30000);                          // addiu a0, zero, 1
  const lib = {name: "x.psflib", start: 0x80010000, size: 0x20000}, mini = {name: "s.psf", start: 0x80030000, size: 4};
  const p = pickAKAO(ram, [lib, mini], "s.psf");
  assert.equal(p.offset, 0x10200, "song number 1 = the second block by id (id 2)");
  assert.match(p.how, /song number 1 loaded by the song's file: block id 2/);
  ram.set(blk(9), 0x30100);
  assert.deepEqual(pickAKAO(ram, [lib, {...mini, size: 0x200}], "s.psf"), {offset: 0x30100, how: "the song's own file"});
  assert.match(pickAKAO(ram, [lib], "other.psf").how, /^the first of 4 blocks/);
});

test("loop break (0xF1) drops the repeat layer only on the pass that leaves: a first/second ending; a break back into played bytes is the song loop", () => {
  const v = [0xA5, 5, /* 2 */ 0xC8, N(0, 2), 0xF1, 2, 3, 0, N(2, 2), 0xC9, 2, /* 11 */ N(4, 2), 0xA0];
  const r = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: v}})));
  assert.deepEqual(r.notes.map(n => [n.tick, n.key]), [[0, 60], [48, 62], [96, 60], [144, 64]], "C D, C (break) E");
  const back = [0xA5, 5, /* 2 */ 0xC8, N(0, 2), 0xF1, 2, 0xFA, 0xFF, N(2, 2), 0xC9, 2, 0xA0];
  const b = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: back}})));
  assert.deepEqual(b.seq.loop, {start: 0, end: 144, count: 127});
  assert.deepEqual(b.notes.map(n => n.key), [60, 62, 60]);
});

test("key-split program (0xFC, layout 1.1): a key outside every region plays the nearest region above, the last beyond the top", () => {
  // regions after the score: {art, lo, hi, ar, sr, sm, rr, vol}, then a terminator ≥ 0x80
  const body = [0xA5, 5, 0xFC, 0, 0, N(0, 2), N(11, 2), 0xA5, 7, N(0, 2), 0xA0];
  body.splice(3, 2, body.length - 5, 0);
  const tail = [10, 50, 70, 0, 0, 0, 0, 0, 11, 72, 80, 0, 0, 0, 0, 0, 0xFF];
  const r = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: body}, tail})));
  assert.deepEqual(r.notes.map(n => [n.key, n.art]), [[60, 10], [71, 11], [84, 11]]);
});

// ---- real sets (PSX_PSF_DIR: a folder holding one folder per game, as
// downloaded; CI has none and skips). Numbers recorded 2026-09-28. ----
const PSX = process.env.PSX_PSF_DIR;
const psxGame = d => PSX && exists(join(PSX, d)) ? join(PSX, d) : null;
async function realCapture(dir, file) {
  const chain = await loadPSFChain(readFileSync(join(dir, file)), n => { const p = join(dir, n); return exists(p) ? readFileSync(p) : null; }, {name: file});
  const {ram, ranges} = assembleRam(chain);
  return {ram, ranges, psf: parsePSF(readFileSync(join(dir, file)))};
}
const twoPass = s => { const e = s.loop ? s.loop.end : s.endTick, one = secondsAt(s, e); return s.loop ? secondsAt(s, s.loop.start) + 2 * (one - secondsAt(s, s.loop.start)) : one; };
const tagSecs = t => { const m = /^(\d+):(\d+(?:\.\d+)?)/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
const REAL_AKAO = [
  {dir: "ff7", file: "105 Tifa's Theme.minipsf", layout: 1, clock: "0x43d1", instr: "instr-dat", notes: 536},
  {dir: "final-fantasy-viii", file: "103 Blue Fields.psf", layout: 3, clock: "0x44e8", instr: "akao-sets", notes: 1010},
  {dir: "final-fantasy-ix", file: "105 Vivi's Theme.psf", layout: 3, clock: "0x44e8", instr: "akao-sets", notes: 902},
  {dir: "parasite-eve", file: "103 Overture.psf", layout: 2, clock: "0x44e8", instr: "akao-sets", notes: 826},
  {dir: "saga-frontier", file: "103 Blue's Theme.psf", layout: 1, clock: "0x44e8", instr: "akao-sets", notes: 593, id: 9},
];
for (const g of REAL_AKAO) {
  test(`real AKAO (${g.dir}, ${g.file}): layout ${g.layout}, clock ${g.clock} from the driver code, two passes = the tag, every note has an articulation`, {skip: !psxGame(g.dir)}, async () => {
    const {ram, ranges, psf} = await realCapture(psxGame(g.dir), g.file);
    const p = pickAKAO(ram, ranges, g.file);
    const a = parseAKAO(ram, p.offset);
    if (g.id != null) assert.equal(a.id, g.id, p.how);
    const table = (await import("../tools/psx/instr.mjs")).findInstrDat(ram);
    const r = akaoNotes(a, {instr: table ? {ram, offset: table.offset} : null});
    assert.equal(a.version, g.layout);
    assert.match(r.seq.warnings[0], new RegExp(`tick clock ${g.clock} .* read from the driver code`));
    assert.equal(r.notes.length, g.notes);
    assert.equal(r.instr.kind, g.instr);
    assert.equal(r.notes.filter(n => !akaoRecord(r.instr, n)).length, 0);
    const ratio = tagSecs(psf.tags.length) / twoPass(r.seq);
    assert.ok(Math.abs(ratio - 1) < 0.03, `tag ${psf.tags.length} vs two passes ${twoPass(r.seq).toFixed(1)}s`);
  });
}
test("real sets: the drivers Night Roll does not read say so (FFT smds, Suikoden II KCET, Wild Arms' pQES that is not a SEQ); SotN's PSFs are SEQ+VAB", {skip: !PSX}, async () => {
  const has = (ram, s) => { const b = new TextEncoder().encode(s); outer: for (let i = 0; i + b.length <= ram.length; i++) { for (let k = 0; k < b.length; k++) if (ram[i + k] !== b[k]) continue outer; return true; } return false; };
  const firstPsf = d => readdirSync(d).filter(f => /\.psf$/i.test(f)).sort()[0];
  if (psxGame("final-fantasy-tactics")) { const d = psxGame("final-fantasy-tactics"); const {ram} = await realCapture(d, firstPsf(d)); assert.equal(scanAKAO(ram).length, 0); assert.deepEqual(scanMagic(ram).seq, []); assert.ok(has(ram, "smds")); }
  if (psxGame("suikoden-2")) { const d = psxGame("suikoden-2"); const {ram} = await realCapture(d, "1104 Suspicion.psf"); assert.deepEqual(scanMagic(ram).seq, []); assert.ok(scanMagic(ram).vab.length > 0); assert.ok(has(ram, "KCET")); }
  if (psxGame("wild-arms")) { const d = psxGame("wild-arms"); const {ram} = await realCapture(d, "102 Hope.psf"); const {parseSEQ} = await import("../tools/psx/seq.mjs"); const s = scanMagic(ram).seq; assert.ok(s.length > 0); assert.throws(() => parseSEQ(ram.subarray(s[0])), /SEQ: unknown version ebf00101/); }
  if (psxGame("castlevania-symphony-of-the-night")) { const d = psxGame("castlevania-symphony-of-the-night"); const {ram} = await realCapture(d, "Master Librarian.psf"); const f = scanMagic(ram); assert.equal(f.seq.length, 1); assert.equal(f.vab.length, 1); }
});
