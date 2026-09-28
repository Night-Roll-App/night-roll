// End-to-end test of the NSF pipeline against a synthetic, self-assembled
// NSF (no copyrighted data): 6502 emulation -> APU write log -> note
// reconstruction -> .notes.txt emission.
import test from "node:test";
import assert from "node:assert/strict";
import { makeTestNSF } from "../tools/nsf/make-test-nsf.mjs";
import { parseNSF, runNSF } from "../tools/nsf/nsf.mjs";
import { reconstruct, toNotesTxt, pitchName, backportTiming } from "../tools/nsf/notes.mjs";
import { makeMidi } from "../tools/nsf/midi-write.mjs";
import { renderApu } from "../tools/nsf/apu-render.mjs";

test("NSF pipeline: synthetic tune comes back note-perfect with channel identity", () => {
  const nsf = parseNSF(makeTestNSF().buffer);
  assert.equal(nsf.songs, 1);
  assert.equal(nsf.name, "Night Roll test tune");

  const {apuLog, frames, frameSec} = runNSF(nsf, 1, 3); // 3 seconds ≈ 180 frames
  assert.ok(apuLog.length > 0, "APU writes were logged");

  const events = reconstruct(apuLog, frames, frameSec);
  const pulse1 = events.filter(e => e.channel === "pulse1").map(e => pitchName(e.midi));
  assert.deepEqual(pulse1, ["C4", "E4", "G4", "C5"]);

  const tri = events.filter(e => e.channel === "triangle");
  assert.equal(tri.length, 1);
  assert.equal(pitchName(tri[0].midi), "C3");
  assert.ok(tri[0].startFrame <= 1, "triangle pedal starts at init");

  // quarter notes at 120bpm = 30 frames each
  const durations = events.filter(e => e.channel === "pulse1")
    .map(e => e.endFrame - e.startFrame);
  for (const d of durations.slice(0, 3)) {
    assert.ok(Math.abs(d - 30) <= 1, "note duration ≈ 30 frames, got " + d);
  }

  const txt = toNotesTxt(events, {frames, frameSec, bpm: 120, title: "test"});
  assert.match(txt, /## channel pulse1/);
  assert.match(txt, /## channel triangle/);
  assert.match(txt, /C4 1/);
  assert.match(txt, /no key is stated/);
});

// ---- period → pitch, tested through the real reconstruct() path ----------
// Expected values come from first principles, never from the code under test:
// A440 equal temperament, octave 4 written out to two decimals so a human can
// check it against any tuning chart, other octaves by doubling/halving.
const CLOCK = 1789773; // NTSC 2A03 CPU clock, Hz
const FREQ4 = [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00,
               415.30, 440.00, 466.16, 493.88]; // C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4
const freqOfMidi = m => FREQ4[m % 12] * 2 ** (Math.floor(m / 12) - 5); // 69 → 440
function nearestMidi(f) { // closest tempered note by log distance
  // range extends past MIDI 127: ultrasonic triangle periods (2-6, ~9-18kHz)
  // legitimately derive numbers up to ~134 — the pipeline doesn't clamp, and
  // no FF1 capture goes there, but the sweep must agree on those edges too
  let best = 0, bestD = Infinity;
  for (let m = 0; m < 144; m++) {
    const d = Math.abs(Math.log2(f / freqOfMidi(m)));
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}
// one isolated note per period: set period, sound it, silence, next
function pulseLog(periods) {
  let frame = 0;
  const log = [{frame: frame++, addr: 0x4015, value: 0x01}];
  for (const p of periods) {
    log.push({frame, addr: 0x4000, value: 0x1F});            // constant volume, level 15
    log.push({frame, addr: 0x4002, value: p & 0xFF});
    log.push({frame, addr: 0x4003, value: (p >> 8) & 7});
    frame += 2;
    log.push({frame: frame++, addr: 0x4000, value: 0x10});   // level 0: silence
  }
  return {log, frames: frame + 1};
}
function triLog(periods) {
  let frame = 0;
  const log = [{frame: frame++, addr: 0x4015, value: 0x04}];
  for (const p of periods) {
    log.push({frame, addr: 0x4008, value: 0x7F});            // linear counter on
    log.push({frame, addr: 0x400A, value: p & 0xFF});
    log.push({frame, addr: 0x400B, value: (p >> 8) & 7});
    frame += 2;
    log.push({frame: frame++, addr: 0x4008, value: 0x00});   // linear 0: silence
  }
  return {log, frames: frame + 1};
}

test("period → pitch: canonical Nesdev anchor periods derive from the same physics", () => {
  // hand-checkable against the standard NTSC period table
  assert.equal(Math.round(CLOCK / (16 * 440)) - 1, 0x0FD);    // A4 (pulse)
  assert.equal(Math.round(CLOCK / (16 * 110)) - 1, 0x3F8);    // A2 (pulse)
  assert.equal(Math.round(CLOCK / (16 * 55)) - 1, 0x7F1);     // A1 (pulse)
});

test("period → pitch: every pulse period in the audible range maps to the nearest tempered note", () => {
  const periods = [];
  for (let p = 8; p < 0x800; p++) periods.push(p);            // the guard's own range
  const {log, frames} = pulseLog(periods);
  const events = reconstruct(log, frames, 1 / 60);
  assert.equal(events.length, periods.length, "one note per period");
  events.forEach((e, i) => {
    const f = CLOCK / (16 * (periods[i] + 1));
    assert.equal(e.midi, nearestMidi(f), `pulse period ${periods[i]} (${f.toFixed(2)} Hz)`);
  });
});

test("period → pitch: every triangle period maps an octave below the same pulse period", () => {
  const periods = [];
  for (let p = 2; p < 0x800; p++) periods.push(p);            // triangle guard: period > 1
  const {log, frames} = triLog(periods);
  const events = reconstruct(log, frames, 1 / 60);
  assert.equal(events.length, periods.length, "one note per period");
  events.forEach((e, i) => {
    const f = CLOCK / (32 * (periods[i] + 1));                // triangle divisor: 32, not 16
    assert.equal(e.midi, nearestMidi(f), `triangle period ${periods[i]} (${f.toFixed(2)} Hz)`);
  });
  // known landmark: pulse $0FD is A4, triangle $0FD is A3
  const {log: l2, frames: f2} = triLog([0x0FD]);
  assert.equal(pitchName(reconstruct(l2, f2, 1 / 60)[0].midi), "A3");
});

test("period → pitch boundaries: guard floors and ceilings", () => {
  // pulse floor: period 7 is silent, 8 sounds
  assert.equal(reconstruct(pulseLog([7]).log, 10, 1 / 60).length, 0);
  assert.equal(reconstruct(pulseLog([8]).log, 10, 1 / 60).length, 1);
  // pulse ceiling: $7FF (the deepest reachable period) → 54.63 Hz → A1
  const low = reconstruct(pulseLog([0x7FF]).log, 10, 1 / 60);
  assert.equal(pitchName(low[0].midi), "A1");
  // triangle floor: period 1 is silent, 2 sounds
  assert.equal(reconstruct(triLog([1]).log, 10, 1 / 60).length, 0);
  assert.equal(reconstruct(triLog([2]).log, 10, 1 / 60).length, 1);
  // triangle depth: $7FF → 27.32 Hz → A0, the bass floor Josh reads
  const deep = reconstruct(triLog([0x7FF]).log, 10, 1 / 60);
  assert.equal(pitchName(deep[0].midi), "A0");
});

test("duty rides the pipeline: APU bits -> events -> CC70 in the MIDI bytes", () => {
  // two notes, duty 25% (0x40 bits) then 12.5% — reconstruct must tag them
  let frame = 0;
  const log = [{frame: frame++, addr: 0x4015, value: 0x01}];
  for (const [duty, p] of [[1, 0x0FD], [0, 0x1FC]]) {
    log.push({frame, addr: 0x4000, value: (duty << 6) | 0x1F});
    log.push({frame, addr: 0x4002, value: p & 0xFF});
    log.push({frame, addr: 0x4003, value: (p >> 8) & 7});
    frame += 6;
    log.push({frame: frame++, addr: 0x4000, value: 0x10});
  }
  const events = reconstruct(log, frame + 1, 1 / 60);
  assert.deepEqual(events.map(e => e.duty), [1, 0]);
  assert.deepEqual(events.map(e => e.volEnd), [15, 15]); // no decay in this log
  const bytes = makeMidi(events, {bpm: 120, frameSec: 1 / 60, snap: true});
  // CC70 (0xB0, 70, duty) appears for both duty values
  let cc = [];
  for (let i = 0; i + 2 < bytes.length; i++)
    if ((bytes[i] & 0xF0) === 0xB0 && bytes[i + 1] === 70) cc.push(bytes[i + 2]);
  assert.deepEqual(cc, [1, 0], "one CC70 per duty change");
});

test("software envelope: intra-note decay lands as aftertouch in the MIDI", () => {
  // one note whose vol steps 15 -> 7 while it sounds
  let frame = 0;
  const log = [{frame: frame++, addr: 0x4015, value: 0x01}];
  log.push({frame, addr: 0x4000, value: 0x5F}); // duty 25%, constVol 15
  log.push({frame, addr: 0x4002, value: 0xFD});
  log.push({frame, addr: 0x4003, value: 0});
  for (const v of [13, 11, 9, 7]) log.push({frame: frame += 3, addr: 0x4000, value: 0x50 | v});
  log.push({frame: frame += 3, addr: 0x4000, value: 0x50}); // silence ends it
  const events = reconstruct(log, frame + 2, 1 / 60);
  assert.equal(events.length, 1);
  assert.equal(events[0].vol, 15);
  assert.equal(events[0].volEnd, 7);
  const bytes = makeMidi(events, {bpm: 120, frameSec: 1 / 60, snap: true});
  let aft = null;
  for (let i = 0; i + 2 < bytes.length; i++)
    if ((bytes[i] & 0xF0) === 0xA0) aft = bytes[i + 2];
  assert.equal(aft, Math.max(8, Math.round(7 / 15 * 127)), "aftertouch carries the decay target");
});

test("backportTiming never births a negative time; makeMidi refuses one loudly", () => {
  // the MM2-track-3 tab-killer (2026-08-16): an event in the first ~3 frames
  // fuzzy-matches a twin whose backported start lands before frame 0; the
  // negative MIDI delta then ran the varint writer's loop unbounded
  const P = 100;
  const events = [
    {channel: "noise", midi: 7, startFrame: 1, endFrame: 4, vol: 8},     // early event…
    {channel: "noise", midi: 7, startFrame: 98, endFrame: 101, vol: 8},  // …fuzzy twin at +P-3 → s2 = -2
    {channel: "pulse1", midi: 60, startFrame: 10, endFrame: 20, vol: 8},
    {channel: "pulse1", midi: 60, startFrame: 110, endFrame: 120, vol: 8},
  ];
  const back = backportTiming(events, P);
  assert.ok(back.every(e => e.startFrame >= 0), "no negative startFrames");
  assert.deepEqual(back.find(e => e.startFrame === 1 && e.channel === "noise"),
                   events[0], "hazardous match keeps raw timing");
  // the exact-twin pulse still backports normally
  assert.equal(back.filter(e => e.channel === "pulse1")[0].startFrame, 10);
  // and the writer now fails loudly instead of allocating forever
  assert.throws(() => makeMidi([{channel: "pulse1", midi: 60, startFrame: -50, endFrame: 5, vol: 8}],
                               {bpm: 150, frameSec: 1 / 60, snap: true}),
                /negative MIDI delta/); // (a -2 rounds to grid zero; a real negative must throw, not hang)
});

test("APU renderer: a pulse register log becomes audio at the written pitch", () => {
  // A4 on pulse1 (period $0FD), constant vol, 1 second
  const log = [
    {frame: 0, addr: 0x4015, value: 0x01},
    {frame: 1, addr: 0x4000, value: 0x7F},          // duty 25%, halt length, const vol 15
    {frame: 1, addr: 0x4002, value: 0xFD},
    {frame: 1, addr: 0x4003, value: 0x08},          // period high 0 + length load
  ];
  const r = renderApu(log, 60, 1 / 60, {sampleRate: 44100});
  let sum = 0;
  for (let i = 0; i < r.pulse1.length; i++) sum += r.pulse1[i] * r.pulse1[i];
  assert.ok(Math.sqrt(sum / r.pulse1.length) > 0.01, "pulse1 makes sound");
  // dominant frequency by rising zero crossings in the steady middle
  const seg = r.pulse1.subarray(11025, 33075);
  let mean = 0;
  for (const x of seg) mean += x;
  mean /= seg.length;
  let cross = 0;
  for (let i = 1; i < seg.length; i++)
    if (seg[i - 1] - mean < 0 && seg[i] - mean >= 0) cross++;
  const hz = cross * 2; // half-second window
  assert.ok(Math.abs(hz - 440) < 15, "pulse period $0FD renders near A440, got " + hz);
  // silence when disabled
  const r2 = renderApu([{frame: 0, addr: 0x4015, value: 0}], 30, 1 / 60, {});
  let s2 = 0;
  for (const x of r2.pulse1) s2 += Math.abs(x);
  assert.ok(s2 < 1e-6, "disabled channel is silent");
});

test("NSF runner: the player enables the channels before INIT, so a driver that never writes $4015 still sounds", () => {
  const bytes = new Uint8Array(makeTestNSF());
  const i = bytes.indexOf(0x8D, 0x80); // the init's STA $4015 (A9 0F 8D 15 40) → NOPs: the driver no longer enables anything
  assert.equal(bytes[i + 1], 0x15); assert.equal(bytes[i + 2], 0x40);
  bytes[i] = 0xEA; bytes[i + 1] = 0xEA; bytes[i + 2] = 0xEA;
  const nsf = parseNSF(bytes.buffer);
  const {apuLog, frames, frameSec} = runNSF(nsf, 1, 3);
  assert.deepEqual(apuLog[0], {frame: 0, order: 0, addr: 0x4015, value: 0x0F}, "the player's own $4015 write leads the log");
  assert.ok(!apuLog.slice(1).some(w => w.addr === 0x4015), "the patched driver writes none");
  const pulse1 = reconstruct(apuLog, frames, frameSec).filter(e => e.channel === "pulse1").map(e => pitchName(e.midi));
  assert.deepEqual(pulse1, ["C4", "E4", "G4", "C5"]);
});
