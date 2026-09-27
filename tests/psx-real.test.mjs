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
    "tracks repeat with different periods (96, 532 ticks); shorter ones are unrolled to the longest",
    "1 track(s) with notes end without looping",
  ]);
  assert.deepEqual(r.channels, [0, 1, 2]);
  assert.deepEqual(r.programs.map(p => p.program), [46, 0x10, 0, 0x11]);

  // the text and the MIDI say where they came from
  const txt = toNotesTxt(r, {title: "akao"});
  assert.match(txt, /^# akao — 4\/4, 86\.58bpm, 3 bars, 48 ticks\/quarter \(from PS1 AKAO\)\n# loop: bar 1 beat 1 → bar 3 beat 4\.083 \(forever\)\n# note: tracks repeat with different periods/);
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
  assert.deepEqual(late.seq.warnings, []);
  assert.equal(late.notes[0].tick, 4);
  const change = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: [0xA5, 5, N(0, 2), 0xE8, 0x70, 0x44, N(0, 2), 0xA0]}})));
  assert.deepEqual(change.seq.tempoMap.map(t => t.tick), [0, 48]);
  assert.deepEqual(change.seq.warnings, ["no tempo at tick 0; 120bpm assumed until the first tempo event", "no time signature at tick 0; 4/4 assumed"]);
});

test("AKAO: staggered loop starts (echo voices) take the latest start, one period long; 0xCA forever-repeat is a loop", () => {
  const v0 = [0xE8, 0x70, 0x44, 0xFD, 0x30, 0x04, 0xA5, 5, /* 8 */ N(0, 2), N(4, 2), 0xEE, 0, 0]; v0.splice(11, 2, ...rel(10, 8));
  const v1 = [0xA2, 32, REST(2), 0xA5, 5, /* 5 */ N(0, 2), N(4, 2), 0xEE, 0, 0]; v1.splice(8, 2, ...rel(7, 5));
  const r = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: v0, 1: v1}})));
  assert.deepEqual(r.seq.loop, {start: 32, end: 128, count: 127});
  assert.equal(r.seq.endTick, 128);
  assert.deepEqual(r.notes.filter(n => n.ch === 0).map(n => [n.tick, n.endTick]), [[0, 48], [48, 96], [96, 128]]);
  assert.deepEqual(r.notes.filter(n => n.ch === 1).map(n => [n.tick, n.endTick]), [[32, 80], [80, 128]]);
  assert.deepEqual(r.seq.warnings, ["tracks start their loop at different ticks (0, 32); loop start is the latest"]);
  const forever = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: [0xA5, 5, 0xC8, N(0, 2), N(2, 3), 0xCA]}})));
  assert.deepEqual(forever.seq.loop, {start: 0, end: 72, count: 127});
  assert.deepEqual(forever.notes.map(n => [n.tick, n.endTick, n.pitch]), [[0, 48, 60], [48, 72, 62]]);
  // an unimplemented opcode stops that track and says so; the others go on
  const broken = akaoNotes(parseAKAO(makeTestAKAO({voices: {0: [0xA5, 5, N(0, 2), 0xF3, N(0, 2), 0xA0], 1: [0xA5, 5, N(0, 2), 0xA0]}})));
  assert.equal(broken.notes.filter(n => n.ch === 0).length, 1);
  assert.equal(broken.notes.filter(n => n.ch === 1).length, 1);
  assert.match(broken.seq.warnings[0], /unimplemented opcode 0xf3 at 0x1b; track stopped/);
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
