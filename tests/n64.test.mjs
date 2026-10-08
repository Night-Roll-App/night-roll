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
import { SparseImage, loadUSF } from "../tools/n64/usf.mjs";
import { parkedPlayerIo, sequenceOfSet } from "../tools/n64/capture.mjs";

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

// ---- oot generation: the game-steered opcodes (docs/plans/2026-10-07-empty-captures.md)
// a piece the way OoT's Hyrule Field pieces are loaded: channel script at its own offset 0, its layer at
// `at` + 0x10 (absolute, so the test places it where it lands), one note of `note`
function ootPiece(at, note = 0x27) {
  const b = new Uint8Array(0x20);
  b.set([0xC1, 0x05, 0x88, (at + 0x10) >> 8, (at + 0x10) & 0xFF, 0xFD, 0x7F, 0xFF], 0);
  b.set([note, 0x60, 0x40, 0xFF], 0x10);
  return b;
}
const ootBuf = (n, parts) => { const b = new Uint8Array(n); for (const [at, bytes] of parts) b.set(bytes, at); return b; };

test("oot ldseq (B0): sequence id is copied into this one at dst and io port n reads 1; a sequence the rip lacks reads 0, with a warning", () => {
  // initchan 0; ldseq io0 <- seq 5 @0x80; ldio 0; rbeqz +3 (skip the ldchan when the load failed); ldchan 0 @0x80; delay; end
  const ctl = ootBuf(0xA0, [[0, [0xD7, 0x00, 0x01, 0xB0, 0x05, 0x00, 0x80, 0x80, 0xF3, 0x03, 0x90, 0x00, 0x80, 0xFD, 0x60, 0xFF]]]);
  const present = new Uint8Array(0xA0); present.fill(1, 0, 0x10); // 0x80.. is a load buffer: not in the rip
  const asked = [];
  const r = parseSequence(ctl, {abi: "oot", present, loadSeq: id => { asked.push(id); return id === 5 ? {bytes: ootPiece(0x80, 0x29), present: null} : null; }});
  assert.deepEqual(asked, [5]);
  assert.equal(r.notes.length, 1, JSON.stringify(r.stubbed));
  assert.equal(r.notes[0].ch, 0); assert.equal(r.notes[0].inst, 5);
  assert.deepEqual(r.loads, [{tick: 0, op: "ldseq", id: 5, dst: 0x80}]);
  const none = parseSequence(ctl, {abi: "oot", present, loadSeq: () => null});
  assert.equal(none.notes.length, 0, "io0 = 0: the script took its failed-load branch");
  assert.ok(none.warnings.some(w => /sequence 0x05, which is not in the rip/.test(w)), JSON.stringify(none.warnings));
  assert.ok(none.stubbed.includes("sequence ldseq 0xBn"));
});

test("oot testchan (0x0n) reads 'channel not enabled' (enabled ^ 1): an initchan'd channel never started and an unallocated one both read 1", () => {
  // initchan 0,1; testchan 1 → rbeqz +3 skips the ldchan when it reads 0; then testchan 5 (unallocated) the same way on channel 1
  const b = ootBuf(0x60, [[0, [0xD7, 0x00, 0x03, 0x01, 0xF3, 0x03, 0x90, 0x00, 0x20, 0x05, 0xF3, 0x03, 0x91, 0x00, 0x20, 0xFD, 0x60, 0xFF]],
                          [0x20, ootPiece(0x20)]]);
  const r = parseSequence(b, {abi: "oot"});
  assert.deepEqual(r.channels, [0, 1], "both tests read 1 (the old rule read `finished`: 0 for an initchan'd channel, no change for an empty one)");
  // a running channel reads 0: start channel 0 (a long note), wait a tick, testchan 0 → rbeqz branches over the ldchan of channel 1
  const c = ootBuf(0x60, [[0, [0xD7, 0x00, 0x03, 0x90, 0x00, 0x20, 0xFE, 0x00, 0xF3, 0x03, 0x91, 0x00, 0x20, 0xFD, 0x60, 0xFF]], [0x20, ootPiece(0x20)]]);
  assert.deepEqual(parseSequence(c, {abi: "oot"}).channels, [0], "channel 0 is enabled: testchan 0 reads 0 and the branch skips channel 1");
});

test("oot runseq (C4 ff): this player swaps to the target sequence at its first byte, the io ports stay, the player resets (120 bpm); another player is a stub + warning", () => {
  // A: tempo 96; ldi 1; stio 4; runseq ff 0x06; end
  const A = Uint8Array.from([0xDD, 0x60, 0xCC, 0x01, 0x74, 0xC4, 0xFF, 0x06, 0xFF]);
  // B: ldio 4; sub 1; rbeqz +1 (io4 == 1 → play), else end; initchan 0; ldchan 0 @0x20; delay; end
  const B = ootBuf(0x40, [[0, [0x84, 0xC8, 0x01, 0xF3, 0x01, 0xFF, 0xD7, 0x00, 0x01, 0x90, 0x00, 0x20, 0xFD, 0x60, 0xFF]], [0x20, ootPiece(0x20)]]);
  const r = parseSequence(A, {abi: "oot", loadSeq: id => id === 6 ? {bytes: B, present: null} : null});
  assert.equal(r.notes.length, 1, "B saw io port 4 = 1, written by A before the swap");
  assert.deepEqual(r.loads, [{tick: 0, op: "runseq", id: 6}]);
  assert.equal(r.tempos[r.tempos.length - 1].bpm, 120, "AudioSeq_ResetSequencePlayer: 120 bpm");
  assert.equal(r.notes[0].tick, 1, "B starts on the next tick");
  // the same id on player 2, from player 0: not this player
  const other = parseSequence(Uint8Array.from([0xC4, 0x02, 0x06, 0xFD, 0x10, 0xFF]), {abi: "oot", player: 0, loadSeq: () => ({bytes: B, present: null})});
  assert.equal(other.notes.length, 0);
  assert.ok(other.stubbed.includes("sequence runseq C4") && other.warnings.some(w => /another player/.test(w)));
  // pp = this player's own index works like ff
  assert.equal(parseSequence(Uint8Array.from([0xCC, 0x01, 0x74, 0xC4, 0x01, 0x06, 0xFF]), {abi: "oot", player: 1, loadSeq: () => ({bytes: B, present: null})}).notes.length, 1);
});

test("oot rand (CE n): each site returns 0, 1, 2, … in turn (every choice once, in order) and the capture says the game picks at random", () => {
  // initchan 0-2; loop 6: rand 3; dyncall table @0x40 → ldchan 0/1/2 @0x80; delay 0x30; loopend; end
  const b = ootBuf(0xC0, [[0, [0xD7, 0x00, 0x07, 0xF8, 0x06, 0xCE, 0x03, 0xCD, 0x00, 0x40, 0xFD, 0x30, 0xF7, 0xFF]],
                          [0x40, [0x00, 0x50, 0x00, 0x54, 0x00, 0x58]],
                          [0x50, [0x90, 0x00, 0x80, 0xFF]], [0x54, [0x91, 0x00, 0x80, 0xFF]], [0x58, [0x92, 0x00, 0x80, 0xFF]],
                          [0x80, ootPiece(0x80)]]);
  const r = parseSequence(b, {abi: "oot"});
  // (a channel started again cuts its last note to a 1-tick stub: only the full notes say who was picked)
  assert.deepEqual(r.notes.filter(n => n.dur > 1).map(n => [n.tick, n.ch]), [[0, 0], [48, 1], [96, 2], [144, 0], [192, 1], [240, 2]]);
  assert.ok(r.warnings.some(w => /picks sections at random in the game; the capture plays each choice in turn/.test(w)));
  assert.ok(!r.stubbed.includes("sequence random CE"));
});

test("a game-steered script's loop is where its deciding state repeats (the sequence it loads + each rand site's place in its cycle), not its first backward jump", () => {
  // initchan 0; L: rand 2; stseq: the ldseq's id byte = value + 5; ldseq io0 <- ?? @0x80; ldchan 0 @0x80; delay 64; rjump L
  const ctl = ootBuf(0xA0, [[0, [0xD7, 0x00, 0x01, 0xCE, 0x02, 0xC7, 0x05, 0x00, 0x0A, 0xB0, 0x00, 0x00, 0x80, 0x90, 0x00, 0x80, 0xFD, 0x40, 0xF4, 0xEF]]]);
  const pieces = {5: ootPiece(0x80, 0x27), 6: ootPiece(0x80, 0x2B)};
  const r = parseSequence(ctl, {abi: "oot", loadSeq: id => pieces[id] ? {bytes: pieces[id], present: null} : null});
  assert.deepEqual(r.loads.map(l => [l.tick, l.id]), [[0, 5], [64, 6], [128, 5]]);
  assert.deepEqual([r.loop.tick, r.loop.at, r.loop.steered], [0, 128, true], "piece 5 with the rand cycle back where it was: the music repeats from tick 0");
  assert.equal(r.endTick, 128);
  assert.equal(r.notes.length, 2);
  assert.notEqual(r.notes[0].semitone, r.notes[1].semitone, "both pieces played");
});

test("io ports from the save state: the parked call's a0 (lbu a0,1(s0)) picks the player; the player array is found by its 16 stepped channel pointers, 0x160 apart", () => {
  const ram = new SparseImage(), w32 = (img, a, v) => img.write(a, Uint8Array.from([v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]));
  const base = 0x100000;
  for (let p = 0; p < 3; p++) for (let k = 0; k < 16; k++) w32(ram, base + p * 0x160 + 0x38 + 4 * k, (0x80200000 + p * 0x1000 + k * 0xE0) >>> 0);
  ram.write(base + 0x160 + 0x158, Uint8Array.from([0, 0xFF, 1, 0xFF, 0xFF, 0xFF, 0, 3]));  // player 1: io = 0,-1,1,-1,-1,-1,0,3
  w32(ram, 0x1000, 0x92040001);                       // lbu a0, 1(s0)
  ram.write(0x3000, Uint8Array.from([0x82, 0x01, 0x22, 0x00]));
  const state = new SparseImage(), le = (a, v) => state.write(a, Uint8Array.from([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24]));
  le(0x4c, 0x80001000); le(0x50 + 8 * 16, 0x80003000); le(0x50 + 8 * 4, 0x12345678);
  const got = parkedPlayerIo({state}, ram);
  assert.equal(got.player, 1);
  assert.deepEqual(Object.values(got.io), [0, -1, 1, -1, -1, -1, 0, 3]);
  assert.equal(got.at, base + 0x160 + 0x158);
  // parked elsewhere (an exception vector, a0 a pointer): no player, nothing read
  w32(ram, 0x1000, 0x3c1a8009); le(0x50 + 8 * 4, 0x125);
  assert.equal(parkedPlayerIo({state}, ram), null);
});

// the real OoT / MM sets, where the investigation and the recapture cache keep them (skipped without)
const USF_RIPS = [process.env.N64_USF_DIR, "/tmp/recap/rips/n64"].find(d => d && existsSync(join(d, "ocarina-of-time", "nus-czle-usa.usflib")));
const MM_RIPS = USF_RIPS && existsSync(join(USF_RIPS, "majoras-mask", "nus-nzse-usa.usflib"));
const realSet = (album, lib, song) => loadUSF([{name: song + ".usf", bytes: new Uint8Array(readFileSync(join(USF_RIPS, album, song + ".usf")))},
                                               {name: lib, bytes: new Uint8Array(readFileSync(join(USF_RIPS, album, lib)))}]);
test("OoT Hyrule Field (real set): the controller loads its pieces, battle and waiting from the rip's io port 2, each round once in turn", {skip: !USF_RIPS}, () => {
  const want = {"hyrule-field-main-theme": [0, [3, 4, 5, 6], 153.9, 13.0], "hyrule-field-battle": [1, [3, 0x0F, 0x10, 0x11], 77.1, 25.8], "hyrule-field-waiting": [2, [3, 0x14, 0x15, 0x16], 68.7, 26.8]};
  for (const [song, [port2, first, end, back]] of Object.entries(want)) {
    const {res} = sequenceOfSet(realSet("ocarina-of-time", "nus-czle-usa.usflib", song));
    assert.equal(res.io.player, 1, song);
    assert.equal(res.io.io[2], port2, song);
    assert.deepEqual(res.loads.slice(0, 4).map(l => l.id), first, song);
    assert.ok(res.notes.length > 500 && !res.truncated, song + ": " + res.notes.length);
    assert.ok(Math.abs(res.seconds - end) < 0.1, song + " ends " + res.seconds);
    assert.ok(Math.abs(tickSeconds(res.tempos, res.loop.tick) - back) < 0.1, song + " loops back to " + tickSeconds(res.tempos, res.loop.tick));
    assert.ok(res.warnings.some(w => /each choice in turn/.test(w)), song);
  }
});
test("MM New Wave Bossa Nova (real set): runseq to 0x4D keeps port 4 = 1, so channel 1 stops; Staff Roll runs on into 0x7F", {skip: !MM_RIPS}, () => {
  const {res} = sequenceOfSet(realSet("majoras-mask", "nus-nzse-usa.usflib", "new-wave-bossa-nova-with-lulu"));
  assert.deepEqual(res.loads, [{tick: 0, op: "runseq", id: 0x4D}]);
  assert.equal(res.notes.length, 190);
  assert.deepEqual(res.channels, [0, 2, 3, 4, 5, 13, 14]);
  const staff = sequenceOfSet(realSet("majoras-mask", "nus-nzse-usa.usflib", "staff-roll")).res;
  assert.deepEqual(staff.loads.map(l => [l.op, l.id]), [["runseq", 0x7F]]);
  assert.ok(staff.seconds > 370 && staff.notes.length > 6000, staff.seconds + " s, " + staff.notes.length);
});
