// End-to-end test of the PS1 SEQ/VAB pipeline against synthetic files
// (tools/psx/make-test-seq.mjs — our own bytes): SEQ parse -> notes ->
// .notes.txt / MIDI, with and without a bank; ADPCM decode + root pitch;
// SEP and PSF containers; the dump CLI.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestSEQ, makeTestSEP, makeTestVAB, makeTestPSF, encodeAdpcm, sine, TEST_MELODY, TEST_KIT, TEST_END } from "../tools/psx/make-test-seq.mjs";
import { parseSEQ, isSEQ, secondsAt, barBeat, bpmOf } from "../tools/psx/seq.mjs";
import { parseVAB, isVAB, decodeAdpcm, estimateRoot, tonesFor } from "../tools/psx/vab.mjs";
import { seqNotes, trimSeconds, toNotesTxt, makeMidi, isDrumProgram } from "../tools/psx/notes.mjs";
import { parsePSF, isPSF, inflatePSF, parseExe, scanMagic } from "../tools/psx/psf.mjs";
import { pitchName } from "../tools/nsf/notes.mjs";

const names = ns => ns.map(n => pitchName(n.pitch));

test("SEQ header + score: tempo map, meter change, loop, running status through a meta", () => {
  const bytes = makeTestSEQ();
  assert.ok(isSEQ(bytes));
  const {kind, sequences} = parseSEQ(bytes);
  assert.equal(kind, "seq");
  const seq = sequences[0];
  assert.equal(seq.ppq, 480);
  assert.equal(bpmOf(seq.tempo), 120);
  assert.deepEqual([seq.tsNum, seq.tsDen], [3, 4]);
  assert.deepEqual(seq.tempoMap, [{tick: 0, usq: 500000}, {tick: 1440, usq: 666667}]);
  assert.deepEqual(seq.timeSigs, [{tick: 0, num: 3, den: 4}, {tick: 1440, num: 4, den: 4}]);
  assert.deepEqual(seq.loop, {start: 0, end: TEST_END, count: 127});
  assert.equal(seq.endTick, TEST_END);
  assert.deepEqual(seq.warnings, []);
  assert.equal(seq.events.filter(e => e.type === "program").length, 2);
  // seconds: bar 1 = 3 beats at 120 (1.5 s), bar 2 = 4 beats at 90 (2.667 s)
  assert.ok(Math.abs(secondsAt(seq, 1440) - 1.5) < 1e-9);
  assert.ok(Math.abs(secondsAt(seq, TEST_END) - (1.5 + 4 * 60 / 90)) < 1e-3);
  // bars follow the meter map: tick 1440 opens bar 2, tick 2880 is its beat 4
  assert.deepEqual(barBeat(seq, 0), {bar: 1, beat: 1, beatsPerBar: 3});
  assert.deepEqual(barBeat(seq, 1440), {bar: 2, beat: 1, beatsPerBar: 4});
  assert.deepEqual(barBeat(seq, 2880), {bar: 2, beat: 4, beatsPerBar: 4});
  assert.equal(barBeat(seq, TEST_END).bar, 3);
});

test("notes without a bank: keys as written, exact onsets and durations", () => {
  const seq = parseSEQ(makeTestSEQ()).sequences[0];
  const r = seqNotes(seq);
  const mel = r.notes.filter(n => n.ch === 0);
  assert.deepEqual(names(mel), ["C4", "E4", "G4", "D4", "F4", "G4"]);
  assert.deepEqual(mel.map(n => [n.tick, n.key, n.endTick - n.tick]), TEST_MELODY);
  assert.deepEqual(mel.map(n => n.vel), [100, 100, 100, 100, 100, 100]);
  const kit = r.notes.filter(n => n.ch === 1);
  assert.deepEqual(kit.map(n => [n.tick, n.key, n.endTick - n.tick]), TEST_KIT);
  assert.ok(kit.every(n => !n.drum), "no bank: nothing is called a kit");
  assert.deepEqual(r.channels, [0, 1]);

  const txt = toNotesTxt(r, {title: "test"});
  assert.match(txt, /^# test — 3\/4, 120bpm, 2 bars, 480 ticks\/quarter \(from PS1 SEQ\)/);
  assert.match(txt, /# tempo 90bpm from bar 2 beat 1/);
  assert.match(txt, /# meter 4\/4 from bar 2/);
  assert.match(txt, /# loop: bar 1 beat 1 → bar 3 beat 1 \(forever\)/);
  assert.match(txt, /## channel 1 program 0\nbar 1: 1 C4 1 v100, 2 E4 1 v100, 3 G4 1 v100\nbar 2: 1 D4 2 v100, 3 F4 1 v100, 4 G4 1 v100/);
  assert.match(txt, /## channel 2 program 1\nbar 1: 1 C2 0.5 v127, 2 D2 0.5 v127/);
  assert.match(txt, /no key is stated/);
  assert.match(txt, /SEQ key as written/);
});

test("--seconds trims by the tempo map", () => {
  const seq = parseSEQ(makeTestSEQ()).sequences[0];
  const r = trimSeconds(seqNotes(seq), 2);
  // D4 starts at 1.5 s and stays; F4 at 1.5 + 2×0.667 = 2.83 s goes
  assert.deepEqual(names(r.notes.filter(n => n.ch === 0)), ["C4", "E4", "G4", "D4"]);
});

test("VAB: header tables, tone lookup, kit detection", () => {
  const {vh, vb, vab: whole} = makeTestVAB();
  assert.ok(isVAB(vh));
  const v = parseVAB(vh, vb);
  assert.equal(v.version, 7);
  assert.deepEqual([v.numPrograms, v.numTones, v.numVags], [2, 3, 3]);
  assert.deepEqual(v.warnings, []);
  assert.equal(v.programs.filter(Boolean).length, 2);
  assert.equal(v.programs[0].tones.length, 1);
  assert.equal(v.programs[0].tones[0].center, 53);
  assert.equal(v.programs[1].tones.length, 2);
  assert.deepEqual(v.programs[1].tones.map(t => [t.min, t.max, t.vag]), [[36, 36, 2], [38, 38, 3]]);
  assert.deepEqual(v.vags.slice(1).map(x => x.offset), [0, v.vags[1].size, v.vags[1].size + v.vags[2].size]);
  assert.equal(v.vags[1].size + v.vags[2].size + v.vags[3].size, vb.length);
  assert.equal(tonesFor(v, 0, 72)[0].vag, 1);
  assert.deepEqual(tonesFor(v, 1, 37), []);
  assert.equal(tonesFor(v, 1, 38)[0].vag, 3);
  assert.equal(isDrumProgram(v.programs[0]), false);
  assert.equal(isDrumProgram(v.programs[1]), true);
  // a whole .VAB parses identically and finds its own body
  const w = parseVAB(whole);
  assert.equal(w.body.length, vb.length);
  assert.equal(w.headerSize, vh.length);
  assert.equal(w.programs[0].tones[0].center, 53);
});

test("SPU-ADPCM decode is exact for a filter-0 stream; loop flags; root pitch", () => {
  const src = sine(261.63, 6748);
  const enc = encodeAdpcm(src);
  const dec = decodeAdpcm(enc);
  assert.equal(dec.pcm.length, (Math.ceil(6748 / 28) + 1) * 28);
  for (let i = 0; i < 28; i++) assert.equal(dec.pcm[i], 0, "Sony's zero first block");
  for (let i = 0; i < 6748; i++) {
    const want = Math.max(-8, Math.min(7, Math.round(src[i] / 4096))) * 4096 + 0; // +0: no -0
    assert.equal(dec.pcm[28 + i], want, "sample " + i);
  }
  assert.equal(dec.loopStart, 28);
  assert.equal(dec.loopEnd, dec.pcm.length);
  assert.equal(dec.oneShot, false);
  const root = estimateRoot(dec);
  assert.ok(root, "a sine has a root");
  assert.equal(root.midi, 60);
  assert.ok(Math.abs(root.cents) <= 10, "cents " + root.cents);
  assert.ok(root.confidence > 0.9);
  // one-shot flag, and noise has no root
  const one = decodeAdpcm(encodeAdpcm(sine(440, 200), {loop: false}));
  assert.equal(one.oneShot, true);
  assert.equal(one.loopStart, null);
  const {vh, vb} = makeTestVAB();
  const v = parseVAB(vh, vb);
  assert.equal(estimateRoot(decodeAdpcm(vb, v.vags[2].offset, v.vags[2].size)), null);
});

test("notes with a bank: center 53 lifts the melody a fifth; kit keeps keys and goes to channel 10", () => {
  const seq = parseSEQ(makeTestSEQ()).sequences[0];
  const {vh, vb} = makeTestVAB({center: 53});
  const r = seqNotes(seq, {vab: parseVAB(vh, vb)});
  const mel = r.notes.filter(n => n.ch === 0);
  assert.deepEqual(names(mel), ["G4", "B4", "D5", "A4", "C5", "D5"]);
  assert.deepEqual(mel.map(n => n.key), TEST_MELODY.map(m => m[1]), "raw keys kept");
  assert.ok(mel.every(n => Math.abs(n.cents) <= 10));
  assert.equal(mel[0].root.midi, 60);
  const kit = r.notes.filter(n => n.ch === 1);
  assert.ok(kit.every(n => n.drum));
  assert.deepEqual(kit.map(n => n.pitch), [36, 38]);

  const txt = toNotesTxt(r, {title: "test"});
  assert.match(txt, /# program 0: tone center F3, sample root C4 \(detected, r=(1|0\.\d+)\)/);
  assert.match(txt, /bar 1: 1 G4 1 v100, 2 B4 1 v100, 3 D5 1 v100/);
  assert.match(txt, /## channel 2 program 1 \(kit\)\nbar 1: 1 K36 0.5 v127, 2 K38 0.5 v127/);

  // center 60 = no transposition; a header-only bank (no body) assumes C4
  const same = seqNotes(seq, {vab: parseVAB(makeTestVAB({center: 60}).vh)});
  assert.deepEqual(names(same.notes.filter(n => n.ch === 0)), ["C4", "E4", "G4", "D4", "F4", "G4"]);
  assert.match(toNotesTxt(same), /sample root C4 assumed/);
  // forced kit program without a bank
  const forced = seqNotes(seq, {drums: [1]});
  assert.ok(forced.notes.filter(n => n.ch === 1).every(n => n.drum));
});

test("MIDI: PPQ 480, conductor carries both tempi and both meters, kit on channel 10", () => {
  const seq = parseSEQ(makeTestSEQ()).sequences[0];
  const {vh, vb} = makeTestVAB();
  const mid = makeMidi(seqNotes(seq, {vab: parseVAB(vh, vb)}));
  const hex = [...mid].map(b => b.toString(16).padStart(2, "0")).join(" ");
  assert.equal(hex.slice(0, 41), "4d 54 68 64 00 00 00 06 00 01 00 03 01 e0"); // MThd, type 1, 3 tracks, 480
  assert.match(hex, /ff 58 04 03 02 18 08/);
  assert.match(hex, /ff 58 04 04 02 18 08/);
  assert.match(hex, /ff 51 03 07 a1 20/);
  assert.match(hex, /ff 51 03 0a 2c 2b/);
  assert.match(hex, /90 43 64/, "G4 on channel 1 (0x90)");
  assert.match(hex, /99 24 7f/, "kick on channel 10 (0x99)");
  assert.ok(!/91 24/.test(hex), "kit left channel 2");
  // channel-1 track: first note-on at delta 0, first note-off 480 ticks later (0x83 0x60)
  assert.match(hex, /00 90 43 64 83 60 80 43 40/);
});

test("SEP: two sequences with their own tempo and meter", () => {
  const {kind, sequences} = parseSEQ(makeTestSEP());
  assert.equal(kind, "sep");
  assert.equal(sequences.length, 2);
  assert.deepEqual(sequences.map(s => s.id), [0, 1]);
  assert.equal(sequences[0].endTick, TEST_END);
  assert.equal(bpmOf(sequences[1].tempo), 100);
  assert.deepEqual([sequences[1].tsNum, sequences[1].tsDen], [4, 4]);
  const r = seqNotes(sequences[1]);
  assert.deepEqual(r.notes.map(n => [n.tick, n.key, n.endTick - n.tick]), [[0, 69, 480]]);
});

test("PSF container: tags, CRC, EXE header, embedded SEQ + VAB found by scan", async () => {
  const bytes = makeTestPSF();
  assert.ok(isPSF(bytes));
  const psf = parsePSF(bytes);
  assert.equal(psf.version, 1);
  assert.equal(psf.crcOk, true);
  assert.equal(psf.tags.title, "Night Roll test tune");
  assert.deepEqual(psf.libs, []);
  const exe = await inflatePSF(psf);
  const hdr = parseExe(exe);
  assert.equal(hdr.pc, 0x80010000);
  assert.match(hdr.region, /North America/);
  const found = scanMagic(exe);
  assert.equal(found.seq.length, 1);
  assert.equal(found.vab.length, 1);
  const seq = parseSEQ(exe.subarray(found.seq[0])).sequences[0];
  const vab = parseVAB(exe.subarray(found.vab[0]));
  assert.ok(vab.body.length >= vab.vags[3].offset + vab.vags[3].size);
  assert.deepEqual(names(seqNotes(seq, {vab}).notes.filter(n => n.ch === 0)), ["G4", "B4", "D5", "A4", "C5", "D5"]);
});

test("dump CLI writes .notes.txt and .mid (SEQ+VH/VB, and PSF)", () => {
  const dir = mkdtempSync(join(tmpdir(), "psx-"));
  const {vh, vb} = makeTestVAB();
  writeFileSync(join(dir, "tune.seq"), makeTestSEQ());
  writeFileSync(join(dir, "bank.vh"), vh);
  writeFileSync(join(dir, "bank.vb"), vb);
  writeFileSync(join(dir, "tune.psf"), makeTestPSF());
  const run = (...a) => execFileSync(process.execPath, ["tools/psx/dump.mjs", ...a], {stdio: ["ignore", "pipe", "pipe"]});
  run(join(dir, "tune.seq"), "--vh", join(dir, "bank.vh"), "--vb", join(dir, "bank.vb"), "--title", "cli");
  const txt = readFileSync(join(dir, "tune.notes.txt"), "utf8");
  assert.match(txt, /^# cli — 3\/4, 120bpm/);
  assert.match(txt, /bar 1: 1 G4 1 v100/);
  assert.ok(existsSync(join(dir, "tune.mid")));
  run(join(dir, "tune.seq"), "--seconds", "2", "--out", join(dir, "short"));
  assert.match(readFileSync(join(dir, "short.notes.txt"), "utf8"), /bar 2: 1 D4 2 v100\n/);
  run(join(dir, "tune.psf"));
  assert.match(readFileSync(join(dir, "tune.notes.txt"), "utf8"), /bar 1: 1 G4 1 v100/);
});
