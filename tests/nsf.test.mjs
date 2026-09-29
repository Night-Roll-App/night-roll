// End-to-end test of the NSF pipeline against a synthetic, self-assembled
// NSF (no copyrighted data): 6502 emulation -> APU write log -> note
// reconstruction -> .notes.txt emission.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { makeTestNSF, makeTestNSFLoopingArpeggio, makeTestNSFVibratoPad } from "../tools/nsf/make-test-nsf.mjs";
import { parseNSF, runNSF } from "../tools/nsf/nsf.mjs";
import { reconstruct, toNotesTxt, pitchName, backportTiming,
         detectLoop, lastRegisterChangeFrame, trimSustainedTail } from "../tools/nsf/notes.mjs";
import { makeMidi } from "../tools/nsf/midi-write.mjs";
import { renderApu } from "../tools/nsf/apu-render.mjs";
import { gatherFiles } from "../tools/import-set.mjs";

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
  log.push({frame, addr: 0x4001, value: 0x08}); // sweep negate: the whole period range sounds (drivers set this for low notes; without it the sweep unit mutes from $400 up)
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

test("sweep mute: a pulse whose target period passes $7FF is silent in the roll and the render, sweep enabled or not; negate lifts it", () => {
  // Tetris slot 1 writes C2 on pulse 2: period $6B3 with $4005 = 0 — the
  // console plays nothing (the roll showed 1.6 s drones, Josh 2026-09-27)
  const mk = sweep => [
    {frame: 0, addr: 0x4015, value: 0x03},
    {frame: 1, addr: 0x4005, value: sweep},
    {frame: 1, addr: 0x4004, value: 0xB8},          // duty 50%, halt, const vol 8
    {frame: 1, addr: 0x4006, value: 0xB3},
    {frame: 1, addr: 0x4007, value: 0x0E},          // period $6B3 + length load
  ];
  const silent = reconstruct(mk(0x00), 60, 1 / 60).filter(e => e.channel === "pulse2");
  assert.equal(silent.length, 0, "no note for a sweep-muted pitch");
  const heard = reconstruct(mk(0x08), 60, 1 / 60).filter(e => e.channel === "pulse2");
  assert.equal(heard.length, 1, "negate mode: the same period is a note");
  assert.equal(heard[0].midi, 36, "C2");
  const rms = log => { const r = renderApu(log, 60, 1 / 60, {sampleRate: 22050}); let s = 0; for (const x of r.pulse2) s += x * x; return Math.sqrt(s / r.pulse2.length); };
  assert.ok(rms(mk(0x00)) < 1e-6, "render: silent with the sweep off");
  assert.ok(rms(mk(0x08)) > 0.01, "render: sounds in negate mode");
});

// ---- no-loop tail trim (Josh, 2026-09-29: Zelda NES tracks 5-7 are jingles
// under a bar, but with no loop found the capture held the last note out to
// the 300s ceiling — 1 beat of music, then a re-attack at lower volume that
// just sat there while the driver rewrote the SAME register values every
// frame). lastRegisterChangeFrame/trimSustainedTail (tools/nsf/notes.mjs)
// are chip-agnostic: address + value, not notes — GBS shares them unmodified
// (tools/gbs/notes.mjs re-exports both from here).

test("lastRegisterChangeFrame: identical rewrites don't move it; a genuinely different value does", () => {
  const log = [
    {frame: 0, addr: 0x4015, value: 0x01},
    {frame: 1, addr: 0x4000, value: 0x3F},
    {frame: 1, addr: 0x4002, value: 0xAB},
    {frame: 1, addr: 0x4003, value: 0x01},
  ];
  // the driver keeps calling PLAY, rewriting the identical values every frame
  for (let f = 2; f < 200; f++) log.push({frame: f, addr: 0x4000, value: 0x3F});
  assert.equal(lastRegisterChangeFrame(log, 300), 1, "100+ identical rewrites carry no new information");
  const withChange = [...log, {frame: 150, addr: 0x4000, value: 0x3E}]; // one real change late in the tail
  assert.equal(lastRegisterChangeFrame(withChange, 300), 150, "a differing value at the same address updates it");
});

test("trimSustainedTail: cuts a held tail to the ring, leaves a still-live window untouched", () => {
  const events = [
    {channel: "pulse1", startFrame: 0, endFrame: 10, midi: 60},
    {channel: "pulse1", startFrame: 10, endFrame: 300, midi: 64}, // holds the rest of the way
  ];
  const cut = trimSustainedTail(events, 300, 10, 30); // last real change at frame 10, 30-frame ring
  assert.equal(cut.frames, 40, "kept = changedAt + ring");
  assert.equal(cut.events.length, 2, "no event dropped, just shortened");
  assert.equal(cut.events[1].endFrame, 40, "the held note rings for 30 frames, not the remaining 290");
  assert.equal(cut.events[1].startFrame, 10, "the note's real onset is untouched");
  // still changing close to the end: nothing to trim
  const untouched = trimSustainedTail(events, 300, 280, 30);
  assert.equal(untouched.frames, 300);
  assert.deepEqual(untouched.events, events);
});

test("no-loop tail trim, synthetic NSF: a phrase held forever gets cut to a ring-out", () => {
  const nsf = parseNSF(makeTestNSF().buffer); // C4 E4 G4 C5, then C5 holds — nothing written again
  const {apuLog, frames, frameSec} = runNSF(nsf, 1, 10); // 10s — the phrase itself is over well inside 4s
  const events = reconstruct(apuLog, frames, frameSec);
  const changedAt = lastRegisterChangeFrame(apuLog, frames);
  const ring = Math.round(1 / frameSec); // ~1s
  const {events: trimmed, frames: kept} = trimSustainedTail(events, frames, changedAt, ring);
  assert.ok(kept < frames, "the dead tail was cut");
  const keptSec = kept * frameSec;
  assert.ok(keptSec > 1.4 && keptSec < 3, "kept the phrase plus a short ring, got " + keptSec.toFixed(2) + "s");
  const lastPulse = trimmed.filter(e => e.channel === "pulse1").pop();
  assert.ok(lastPulse, "the final note survives the trim");
  assert.equal(pitchName(lastPulse.midi), "C5", "it's still the real final note, not a different one");
  assert.ok(lastPulse.endFrame - lastPulse.startFrame <= ring + 1, "held only a short ring, not the full silence");
});

test("no-loop tail trim, synthetic NSF: a phrase that keeps changing is left alone", () => {
  const nsf = parseNSF(makeTestNSFLoopingArpeggio().buffer); // C4 E4 G4 C5 cycling forever
  const {apuLog, frames, frameSec} = runNSF(nsf, 1, 10);
  const events = reconstruct(apuLog, frames, frameSec);
  const changedAt = lastRegisterChangeFrame(apuLog, frames);
  const ring = Math.round(1 / frameSec);
  const {events: trimmed, frames: kept} = trimSustainedTail(events, frames, changedAt, ring);
  assert.equal(kept, frames, "still-live music at the end of the window is never trimmed");
  assert.deepEqual(trimmed, events, "no event touched");
});

test("no-loop tail trim, synthetic NSF: a held note with real vibrato (period nudged, never re-triggered) is left alone", () => {
  const nsf = parseNSF(makeTestNSFVibratoPad().buffer); // one A4 pad, ±1-unit period wobble every 30 frames
  const {apuLog, frames, frameSec} = runNSF(nsf, 1, 20);
  const events = reconstruct(apuLog, frames, frameSec);
  assert.equal(events.length, 1, "reconstruct's vibrato guard keeps this ONE note, not a chain");
  const changedAt = lastRegisterChangeFrame(apuLog, frames);
  const ring = Math.round(1 / frameSec);
  const {events: trimmed, frames: kept} = trimSustainedTail(events, frames, changedAt, ring);
  assert.equal(kept, frames, "the vibrato writes are genuinely different values every 30 frames — never a frozen tail");
  assert.deepEqual(trimmed, events);
});

const ZELDA_ZIP = "/tmp/claude-501/rips/nes/legend-of-zelda.zip";
test("no-loop tail trim, real rip: Legend of Zelda (NES) jingles under a bar don't ride the capture out to its ceiling",
  {skip: !existsSync(ZELDA_ZIP) && "no rip at " + ZELDA_ZIP},
  () => {
    const files = gatherFiles(ZELDA_ZIP);
    const nsfFile = files.find(f => /\.nsf$/i.test(f.name));
    assert.ok(nsfFile, "a .nsf in the zip");
    const nsf = parseNSF(nsfFile.bytes.buffer);
    // Josh's ear report (2026-09-29): tracks 5, 6, 7 (and more) held their
    // last note out to the 300s ceiling instead of ending with the music.
    // Measured here: track 5 is ~1 beat then a 37-beat held tail (2.4s kept
    // of 20s raw); track 7 similarly (4.1s of 20s); track 6 is a real ~4-bar
    // fanfare, NOT under a bar — its own tail still gets cut (8.4s of 20s),
    // proving the rule preserves genuine music and only removes dead air.
    for (const track of [5, 6, 7]) {
      const {apuLog, frames, frameSec} = runNSF(nsf, track, 20); // same window the ear report measured with
      const events = reconstruct(apuLog, frames, frameSec);
      assert.ok(events.length, "track " + track + " isn't silent");
      const t0 = Math.min(...events.map(e => e.startFrame));
      const shifted = events.map(e => ({...e, startFrame: e.startFrame - t0, endFrame: e.endFrame - t0}));
      const loop = detectLoop(shifted, frames - t0, null);
      assert.equal(loop, null, "track " + track + " is confirmed non-looping (a jingle, not through-composed music)");
      const changedAt = Math.max(0, lastRegisterChangeFrame(apuLog, frames) - t0);
      const ring = Math.round(1 / frameSec);
      const {frames: kept} = trimSustainedTail(shifted, frames - t0, changedAt, ring);
      const keptSec = kept * frameSec, rawSec = (frames - t0) * frameSec;
      assert.ok(keptSec < rawSec * 0.6, "track " + track + " trims meaningfully off the " + rawSec.toFixed(1) + "s ceiling, got " + keptSec.toFixed(2) + "s");
      assert.ok(keptSec < 10, "track " + track + " keeps a short capture, not a padded one, got " + keptSec.toFixed(2) + "s");
    }
  });
