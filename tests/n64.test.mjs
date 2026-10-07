// N64 EAD sequence parser against a synthetic, self-assembled sequence
// (no game data): bytecode -> note events -> .notes.txt / .mid.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestSeq } from "../tools/n64/make-test-seq.mjs";
import { parseSequence, tickSeconds, TICKS_PER_BEAT } from "../tools/n64/seq-libultra.mjs";
import { toNotesTxt, toMidi } from "../tools/n64/notes.mjs";
import { pitchName } from "../tools/nsf/notes.mjs";

const Q = TICKS_PER_BEAT;

function expectMelody(res) {
  const ch0 = res.notes.filter(n => n.ch === 0);
  assert.deepEqual(ch0.map(n => pitchName(n.midi)), ["C4", "E4", "G4", "C5", "C4", "C4"]);
  assert.deepEqual(ch0.map(n => n.tick), [0, Q, 2 * Q, 3 * Q, 5 * Q, 5 * Q + 24]);
  // gate 0 = full length; gate 0x40 on a 24-tick note releases 6 ticks early
  assert.deepEqual(ch0.map(n => n.dur), [Q, Q, Q, Q, 18, 18]);
  assert.deepEqual(ch0.map(n => n.vel), [100, 100, 100, 100, 80, 80]);
  assert.ok(ch0.every(n => n.inst === 5 && !n.drum));

  const ch1 = res.notes.filter(n => n.ch === 1);
  assert.equal(ch1.length, 1);
  assert.equal(pitchName(ch1[0].midi), "C3"); // 39 transposed -12, +21 root convention
  assert.equal(ch1[0].tick, 0);
  assert.equal(ch1[0].dur, 8 * Q);
  assert.equal(ch1[0].vel, 76); // default short-note velocity table, entry 7
}

test("sm64 ABI: pitches, onsets, gates and velocities come back exactly", () => {
  const res = parseSequence(makeTestSeq());
  expectMelody(res);
  assert.deepEqual(res.tempos, [{tick: 0, bpm: 120}]);
  assert.equal(res.endTick, 8 * Q);
  assert.equal(res.loop, null);
  assert.equal(res.truncated, false);
  assert.deepEqual(res.channels, [0, 1]);
  assert.deepEqual(res.stubbed, [], "DF volume and DD pan are recorded now, not stubbed");
  // the sound facts the renderer reads, as the channel script set them: DF 0x64 / 127, DD 0x40 / 128, seq DB 0x7F / 127
  const n0 = res.notes.find(n => n.ch === 0);
  assert.ok(Math.abs(n0.vol - 100 / 127) < 1e-9 && n0.pan === 0.5 && n0.freq === 1 && n0.bank === 0, JSON.stringify(n0));
  assert.equal(n0.chInst, 5, "the channel's adsr comes from instrument 5 (C1)");
  assert.equal(n0.chEnv, null); assert.equal(n0.chRel, null); assert.equal(n0.lyAdsr, null);
  assert.ok(Math.abs(tickSeconds(res.tempos, res.endTick) - 4) < 1e-9, "8 beats at 120 = 4 s");
  assert.ok(Math.abs(res.seconds - 4) < 1e-9);
});

test("a channel bend under a held note (D3) is kept for the render as n.freqChanges; the note-on value stays n.freq", () => {
  const res = parseSequence(makeTestSeq({bend: true}));
  expectMelody(res);
  const pedal = res.notes.find(n => n.ch === 1);
  assert.equal(pedal.freq, 1, "unbent at the note-on");
  assert.deepEqual(pedal.freqChanges, [{t: 4 * Q, f: 2}], "an octave up halfway, while it holds");
  assert.ok(res.notes.filter(n => n.ch === 0).every(n => !n.freqChanges), "the other channel's notes are untouched");
  assert.equal(parseSequence(makeTestSeq()).notes.find(n => n.ch === 1).freqChanges, undefined, "no bend, no field");
});

test("oot ABI: same music through the remapped ldlayer opcode", () => {
  expectMelody(parseSequence(makeTestSeq({abi: "oot"}), {abi: "oot"}));
  // and the sm64 table refuses OoT bytes loudly rather than guessing
  assert.throws(() => parseSequence(makeTestSeq({abi: "oot"})), /channel opcode 0x88/);
});

test("song loop: detected at the backward jump, dump stops after one pass", () => {
  const res = parseSequence(makeTestSeq({loop: true}));
  assert.deepEqual(res.loop, {tick: 0, at: 8 * Q, offset: 5});
  assert.equal(res.notes.length, 7);
  assert.equal(res.endTick, 8 * Q);
  // running on plays the second pass
  const two = parseSequence(makeTestSeq({loop: true}), {stopAtLoop: false, maxTicks: 16 * Q});
  assert.equal(two.notes.length, 14);
  assert.equal(two.notes.filter(n => n.ch === 0)[6].tick, 8 * Q);
  assert.equal(two.truncated, true);
  // a wall-clock cap works the same way (12 beats at 120 = 6 s)
  const capped = parseSequence(makeTestSeq({loop: true}), {stopAtLoop: false, maxSeconds: 6});
  assert.equal(capped.endTick, 12 * Q);
});

test("notes.txt: exact beats, no snapping, meter declared as an assumption", () => {
  const txt = toNotesTxt(parseSequence(makeTestSeq()), {title: "test"});
  assert.match(txt, /^# test — 4\/4 \(assumed; the sequence carries no meter\), 120bpm, 2 bars/);
  assert.match(txt, /## channel 0 \(instrument 5\)\nbar 1: 1 C4 1 v100, 2 E4 1 v100, 3 G4 1 v100, 4 C5 1 v100\nbar 2: 2 C4 0.38 v80, 2.5 C4 0.38 v80/);
  assert.match(txt, /## channel 1 \(instrument 1\)\nbar 1: 1 C3 8 v76/);
  assert.match(txt, /no key is stated/);
});

test("MIDI: type 1, conductor + one track per channel, tempo and program set", () => {
  const mid = toMidi(parseSequence(makeTestSeq()));
  const s = String.fromCharCode(...mid.subarray(0, 4));
  assert.equal(s, "MThd");
  assert.equal(mid[9], 1, "type 1");
  assert.equal(mid[11], 3, "conductor + ch0 + ch1");
  assert.equal((mid[12] << 8) | mid[13], 480, "PPQ 480 (48 ticks x 10)");
  const hex = [...mid].map(b => b.toString(16).padStart(2, "0")).join(" ");
  assert.match(hex, /ff 51 03 07 a1 20/, "500000 us per beat = 120 bpm");
  assert.match(hex, /c0 05/, "program 5 on channel 0");
  assert.match(hex, /90 3c 64/, "C4 on, velocity 100");
  assert.match(hex, /91 30 4c/, "C3 on channel 1, velocity 76");
});

test("MIDI percussion: drum indexes get GM keys by rhythm on channel 9; a one-pitch instrument joins the kit; a melodic channel 9 moves off", () => {
  // a hand-built result: 8 bars of 4/4 at 48 ticks a beat — drum index 3 on
  // the downbeats, index 7 on the backbeats, index 1 on every 8th; N64
  // channel 9 plays a melody (must not land on MIDI 9); instrument 20 on
  // channel 2 hits one pitch 32 times (a percussion sample by the rule)
  const B = TICKS_PER_BEAT, notes = [];
  for (let bar = 0; bar < 8; bar++) {
    const t0 = bar * 4 * B;
    for (const b of [0, 2]) notes.push({ch: 5, inst: 0x7F, drum: true, semitone: 3, tick: t0 + b * B, dur: B / 2, vel: 100});
    for (const b of [1, 3]) notes.push({ch: 5, inst: 0x7F, drum: true, semitone: 7, tick: t0 + b * B, dur: B / 2, vel: 100});
    for (let e = 0; e < 8; e++) notes.push({ch: 5, inst: 0x7F, drum: true, semitone: 1, tick: t0 + e * B / 2, dur: B / 4, vel: 80});
    for (let e = 0; e < 4; e++) notes.push({ch: 2, inst: 20, drum: false, midi: 70, tick: t0 + e * B + B / 2, dur: B / 4, vel: 90});
    notes.push({ch: 9, inst: 4, drum: false, midi: 60 + bar, tick: t0, dur: B, vel: 100});
  }
  const res = {notes, tempos: [{tick: 0, bpm: 120}], endTick: 32 * B, warnings: []};
  const mid = toMidi(res);
  const byId = Object.fromEntries(res.kitGuess.map(g => [g.id, g]));
  assert.equal(byId.D3.label, "kick"); assert.equal(byId.D3.gm, 36);
  assert.equal(byId.D7.label, "snare"); assert.equal(byId.D7.gm, 38);
  assert.equal(byId.D1.label, "closed hat"); assert.equal(byId.D1.gm, 42);
  assert.equal(byId.I20.label, "open hat", "the one-pitch instrument is percussion; the next-busiest voice");
  assert.match(res.warnings.join("\n"), /kit guessed from rhythm: D1 → closed hat, D3 → kick, D7 → snare, I20 → open hat/);
  const hex = [...mid].map(b => b.toString(16).padStart(2, "0")).join(" ");
  assert.match(hex, /99 24 64/, "kick on MIDI channel 9 at GM 36");
  assert.match(hex, /99 26 64/, "snare on channel 9 at GM 38");
  assert.match(hex, /99 2e 5a/, "the promoted instrument on channel 9 at its guessed key");
  assert.doesNotMatch(hex, /99 3c 64/, "the melody that was on N64 channel 9 is not on MIDI channel 9");
  assert.match(hex, /90 3c 64/, "…it took the first free channel, 0");
  const names = [...mid].map(b => String.fromCharCode(b)).join("");
  assert.match(names, /ch 2 inst 20 kit/); assert.match(names, /ch 5 drums/); assert.match(names, /ch 9 inst 4/);
});

test("dump CLI writes .notes.txt and .mid next to the input", () => {
  const dir = mkdtempSync(join(tmpdir(), "n64-"));
  const file = join(dir, "seq.bin");
  writeFileSync(file, makeTestSeq({loop: true}));
  const r = spawnSync(process.execPath, ["tools/n64/dump.mjs", file, "--title", "cli"], {encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /7 notes on channels \[0 1\].*loop -> tick 0 after 384/);
  assert.ok(existsSync(join(dir, "seq.mid")));
  assert.match(readFileSync(join(dir, "seq.notes.txt"), "utf8"), /# loop: returns to tick 0/);
});

test("guards: unknown opcode and a delay-less spin fail with an offset", () => {
  // 0xCE is an OoT-generation channel op; the sm64 table must not guess at it
  assert.throws(() => parseSequence(Uint8Array.from([0xD7, 0x00, 0x01, 0x90, 0x00, 0x09, 0xFD, 0x10, 0xFF, 0xC4, 0xCE])),
    /channel opcode 0xce at 0x0a/);
  // a delay-less self-jump is a zero-length song loop: the detector stops it by default...
  assert.equal(parseSequence(Uint8Array.from([0xFB, 0x00, 0x00])).endTick, 0);
  // ...and the spin guard catches it when asked to run on
  assert.throws(() => parseSequence(Uint8Array.from([0xFB, 0x00, 0x00]), {stopAtLoop: false}), /spins without a delay/);
});

test("sequence variation: 0x80 reads seqVariation (0 for a plain id, the s8 -128 with SEQ_VARIATION); a script branches on it to pick its section", () => {
  // `80` getvariation, `FA addr` beqz: a plain id (variation 0) jumps to the section at 0x20 (one note),
  // a "| SEQ_VARIATION" id (0x80 → −128) falls through to the section at 0x10 (two channels).
  // SM64's Title Theme does exactly this (fd 01 | 80 | f5 00 76): the plain id skips its ritardando intro.
  const b = new Uint8Array(0x60);
  b.set([0xD7, 0x00, 0x03, 0x80, 0xFA, 0x00, 0x20, 0x90, 0x00, 0x30, 0x91, 0x00, 0x40, 0xFD, 0x30, 0xFF], 0);
  b.set([0x90, 0x00, 0x30, 0xFD, 0x30, 0xFF], 0x20);
  b.set([0xC1, 0x05, 0x90, 0x00, 0x50, 0xFD, 0x30, 0xFF], 0x30);
  b.set([0xC1, 0x06, 0x90, 0x00, 0x50, 0xFD, 0x30, 0xFF], 0x40);
  b.set([0x27, 0x30, 0xFF], 0x50);
  assert.deepEqual(parseSequence(b).channels, [0], "default: the game's 0 for a plain id");
  assert.deepEqual(parseSequence(b, {variation: 0}).channels, [0]);
  assert.deepEqual(parseSequence(b, {variation: 0x80}).channels, [0, 1], "the variation bit reads back negative (s8)");
  assert.deepEqual(parseSequence(b, {variation: -1}).channels, [0, 1], "the old default (2026-09-27) played every such intro");
});

test("portamento (layer C7): modes 1/3/5 glide from the target to the written note, 2/4 from the note to the target; 1/2 are one-shot, 3/4/5 persist, 5 retargets to each note; special time is a fraction of the note", () => {
  // one channel, one layer; the layer: C7 mode target time, then notes (large notes off: short form, 0x27 = semitone 39 + delay)
  const song = layer => { const b = new Uint8Array(0x60);
    b.set([0xD7, 0x00, 0x01, 0x90, 0x00, 0x20, 0xFD, 0x81, 0x00, 0xFF], 0);   // init ch 0, channel script at 0x20, wait 256
    b.set([0xC1, 0x05, 0x90, 0x00, 0x30, 0xFD, 0x81, 0x00, 0xFF], 0x20);         // inst 5, layer at 0x30
    b.set([...layer, 0xFF], 0x30); return parseSequence(b); };
  // mode 2 (plain time 24 updates): the note starts at 39 and glides to 46; the next note has no portamento (one-shot)
  let r = song([0xC7, 0x02, 0x2E, 0x18, 0x27, 0x30, 0x27, 0x30]);
  assert.deepEqual(r.notes.map(n => n.porta && [n.porta.mode, n.porta.start, n.porta.end, n.porta.updates]), [[2, 39, 46, 24], null]);
  assert.deepEqual(r.notes[0].slide, [{t: 0, len: Math.round(24 * 120 * 48 / 14360), to: 7}], "lands 7 semitones up: the roll's note is the landed pitch");
  // mode 1: from the target (46) down to the written 39 — returns to the written pitch, so no slide for the roll
  r = song([0xC7, 0x01, 0x2E, 0x18, 0x27, 0x30]);
  assert.deepEqual([r.notes[0].porta.start, r.notes[0].porta.end, r.notes[0].slide], [46, 39, undefined]);
  // mode 3 persists over notes; mode 5 persists and glides from the previous note
  r = song([0xC7, 0x03, 0x2E, 0x18, 0x27, 0x30, 0x2A, 0x30, 0xC8, 0x27, 0x30]);
  assert.deepEqual(r.notes.map(n => n.porta && [n.porta.start, n.porta.end]), [[46, 39], [46, 42], null], "C8 ends it");
  r = song([0xC7, 0x05, 0x2E, 0x18, 0x27, 0x30, 0x2A, 0x30, 0x2E, 0x30]);
  assert.deepEqual(r.notes.map(n => [n.porta.start, n.porta.end]), [[46, 39], [39, 42], [42, 46]], "mode 5: each note glides from the one before");
  // special (0x80): the time byte is a fraction of the note's delay in updates (48 ticks at 120 bpm = 160.5 updates; 0x80/256 = half)
  r = song([0xC7, 0x82, 0x2E, 0x80, 0x27, 0x30]);
  assert.ok(Math.abs(r.notes[0].porta.updates - 48 * 14360 / (120 * 48) / 2) < 1e-9 && r.notes[0].porta.special);
  assert.equal(r.stubbed.length, 0, "C7 is a fact now");
});
