// End-to-end test of the NSF pipeline against a synthetic, self-assembled
// NSF (no copyrighted data): 6502 emulation -> APU write log -> note
// reconstruction -> .notes.txt emission.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeTestNSF, makeTestNSFLoopingArpeggio, makeTestNSFVibratoPad } from "../tools/nsf/make-test-nsf.mjs";
import { parseNSF, runNSF } from "../tools/nsf/nsf.mjs";
import { reconstruct, toNotesTxt, pitchName, backportTiming,
         detectLoop, lastRegisterChangeFrame, trimSustainedTail } from "../tools/nsf/notes.mjs";
import { makeMidi } from "../tools/nsf/midi-write.mjs";
import { renderApu } from "../tools/nsf/apu-render.mjs";
import { gatherFiles, importSet } from "../tools/import-set.mjs";
import { createApp } from "./harness.mjs";

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

test("trimSustainedTail: a same-pitch volume-only re-trigger after F is a ghost note, dropped — the note it continues rings to its OWN conclusion (F), not F+ring", () => {
  // Zelda (NES) tracks 5-7 (Josh, 2026-09-29): the driver's last real
  // register change is releasing the final note (e.g. pulse v7 -> v4) via a
  // write that also touches the length-counter register, which reconstruct()
  // treats as a note boundary regardless of pitch — splitting the SAME note
  // into a real half and a same-pitch "ghost" tail. "delete that ghost note
  // and just let that note before it ring until its own conclusion."
  const events = [
    {channel: "pulse2", startFrame: 0, endFrame: 40, midi: 60, vol: 7},
    {channel: "pulse2", startFrame: 40, endFrame: 300, midi: 60, vol: 4}, // ghost: same pitch continuation
  ];
  const {events: kept, frames} = trimSustainedTail(events, 300, 40, 30); // F = 40
  assert.equal(kept.length, 1, "the ghost is dropped, not just shortened");
  assert.equal(kept[0].startFrame, 0, "the real note's onset is untouched");
  assert.equal(kept[0].endFrame, 40, "it rings to F, its own conclusion — no ghost, no extra ring");
  assert.equal(frames, 40, "nothing rings past F when the only later event was a ghost");
});

test("trimSustainedTail: a NEW pitch struck at/near F is a true final note — it keeps its short ring-out", () => {
  const events = [
    {channel: "pulse2", startFrame: 0, endFrame: 40, midi: 60, vol: 7},
    {channel: "pulse2", startFrame: 40, endFrame: 300, midi: 64, vol: 7}, // a real attack, different pitch
  ];
  const {events: kept, frames} = trimSustainedTail(events, 300, 40, 30); // F = 40, ring = 30
  assert.equal(kept.length, 2, "a genuine new note is never dropped");
  assert.equal(kept[1].midi, 64);
  assert.equal(kept[1].endFrame, 70, "F + ring: the short ring-out, not the rest of the capture");
  assert.equal(frames, 70);
});

test("trimSustainedTail: ghosts are per-channel — one channel's ghost doesn't touch another channel's real ring-out", () => {
  const events = [
    {channel: "pulse2", startFrame: 0, endFrame: 40, midi: 60, vol: 7},
    {channel: "pulse2", startFrame: 40, endFrame: 300, midi: 60, vol: 4}, // ghost on pulse2
    {channel: "pulse1", startFrame: 0, endFrame: 40, midi: 72, vol: 7},
    {channel: "pulse1", startFrame: 40, endFrame: 300, midi: 76, vol: 7}, // real final note on pulse1
  ];
  const {events: kept, frames} = trimSustainedTail(events, 300, 40, 30);
  const pulse2 = kept.filter(e => e.channel === "pulse2"), pulse1 = kept.filter(e => e.channel === "pulse1");
  assert.equal(pulse2.length, 1, "pulse2's ghost is dropped");
  assert.equal(pulse2[0].endFrame, 40, "pulse2's real note ends at F");
  assert.equal(pulse1.length, 2, "pulse1's real final note survives");
  assert.equal(pulse1[1].endFrame, 70, "and keeps its own ring-out");
  assert.equal(frames, 70, "the song's end follows the true final note that actually rings");
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
      const {events: trimmed, frames: kept} = trimSustainedTail(shifted, frames - t0, changedAt, ring);
      const keptSec = kept * frameSec, rawSec = (frames - t0) * frameSec;
      assert.ok(keptSec < rawSec * 0.6, "track " + track + " trims meaningfully off the " + rawSec.toFixed(1) + "s ceiling, got " + keptSec.toFixed(2) + "s");
      assert.ok(keptSec < 10, "track " + track + " keeps a short capture, not a padded one, got " + keptSec.toFixed(2) + "s");
      // ghost notes (2026-09-29): the same pitch must never split into two
      // consecutive events at/after the trim's own boundary — that split IS
      // the ghost (a volume-only re-trigger), and it must be gone
      const byCh = {};
      for (const e of trimmed) (byCh[e.channel] = byCh[e.channel] || []).push(e);
      for (const list of Object.values(byCh)) {
        list.sort((a, b) => a.startFrame - b.startFrame);
        for (let i = 1; i < list.length; i++) {
          assert.ok(!(list[i].startFrame >= changedAt && list[i].midi === list[i - 1].midi),
            "track " + track + " channel " + list[i].channel + ": a ghost survived the trim");
        }
      }
    }
  });

test("track 21 (real rip): a whole-song range of two very high notes (C#7, G#7 — MIDI 97/104) both survive reconstruct, the no-loop trim, and the MIDI round trip",
  {skip: !existsSync(ZELDA_ZIP) && "no rip at " + ZELDA_ZIP},
  () => {
    const files = gatherFiles(ZELDA_ZIP);
    const nsf = parseNSF(files.find(f => /\.nsf$/i.test(f.name)).bytes.buffer);
    const {apuLog, frames, frameSec} = runNSF(nsf, 21, 8);
    let events = reconstruct(apuLog, frames, frameSec);
    assert.equal(events.length, 2, "two raw notes: C#7 0.33 beats, then G#7 0.83 beats");
    assert.deepEqual(events.map(e => e.midi).sort((a, b) => a - b), [97, 104]);
    const t0 = Math.min(...events.map(e => e.startFrame));
    events = events.map(e => ({...e, startFrame: e.startFrame - t0, endFrame: e.endFrame - t0}));
    const loop = detectLoop(events, frames - t0, null);
    assert.equal(loop, null, "track 21 is a real single hit, not a loop");
    const changedAt = Math.max(0, lastRegisterChangeFrame(apuLog, frames) - t0);
    const {events: trimmed} = trimSustainedTail(events, frames - t0, changedAt, Math.round(1 / frameSec));
    assert.equal(trimmed.length, 2, "the no-loop trim keeps both — G#7 is a true final note (new pitch), not a ghost");
    const bytes = makeMidi(trimmed, {bpm: 150, tsNum: 4, tsDen: 4, frameSec});
    const onPitches = [];
    for (let i = 0; i + 2 < bytes.length; i++)
      if ((bytes[i] & 0xF0) === 0x90 && bytes[i + 2] > 0) onPitches.push(bytes[i + 1]); // note-on, velocity > 0
    assert.equal(onPitches.length, 2, "both note-ons survive the MIDI write — no pitch cap silently drops G#7");
    assert.deepEqual(onPitches.slice().sort((a, b) => a - b), [97, 104]);
  });

test("track 37 (real rip): a real single D6 stays one note", {skip: !existsSync(ZELDA_ZIP) && "no rip at " + ZELDA_ZIP}, () => {
  const files = gatherFiles(ZELDA_ZIP);
  const nsf = parseNSF(files.find(f => /\.nsf$/i.test(f.name)).bytes.buffer);
  const {apuLog, frames, frameSec} = runNSF(nsf, 37, 8);
  const events = reconstruct(apuLog, frames, frameSec);
  assert.equal(events.length, 1, "one real note, not split into a note + a ghost");
  assert.equal(pitchName(events[0].midi), "D6");
});

// ---- terminal vs app capture parity (2026-09-29, Josh: "are the imports the
// terminal runs identical to the imports the app runs? I sure hope it's just
// running the same code.") It is: tools/import-set.mjs runs index.html's own
// inline script in this same vm harness (tests/harness.mjs) and calls
// openPickedFiles / captureJobStart / commitImports — not a second pipeline
// (see that file's own header comment). This test drives those same two
// entry points completely independently of one another — the real terminal
// tool (importSet) on one side, and the app's own capture function driven
// directly through the harness (openPickedFiles -> captureJobStart, exactly
// what tapping "Capture all" runs) on the other — and asserts the captured
// notes agree, so a future edit to either side can't silently drift without
// this test catching it. Fixture: the repo's own synthetic looping NSF (no
// albums/compositions file is ever touched; the terminal path writes its
// output to a scratch tmp directory).
test("terminal import (tools/import-set.mjs) and the app's own capture (captureJobStart) agree note-for-note on a synthetic NSF", async () => {
  const nsfBytes = makeTestNSFLoopingArpeggio(); // one track (pulse1), loops well inside the capture window
  const SLUG = "captest", SECS = 10; // impCapture clamps the window to a 10s floor regardless of what's asked (index.html's impCapture) — requesting less proves nothing extra

  // ---- path A: the real terminal entry point, unmodified, writing to a scratch dir (never the repo tree)
  const tmp = mkdtempSync(path.join(tmpdir(), "nr-nsf-parity-"));
  const nsfPath = path.join(tmp, "test-song.nsf");
  writeFileSync(nsfPath, Buffer.from(nsfBytes));
  const outA = path.join(tmp, "out");
  const resA = await importSet({src: nsfPath, slug: SLUG, secs: SECS, out: outA}, () => {});
  assert.ok(resA.files.some(f => f.endsWith("track-01.mid")), "the terminal published track-01.mid: " + resA.files.join(", "));
  const midPathA = path.join(outA, "albums", "nes", SLUG, "track-01.mid");

  // ---- path B: the app's own capture function, driven directly through the
  // vm harness — NOT through import-set.mjs. The only stand-ins are what a
  // real browser supplies natively and the vm can't: real timers (impCapture
  // yields on a bare setTimeout) and the chip modules (chipModules() dynamic-
  // imports them off Pages; there's no fetch/module loader in the vm) —
  // loaded here from the SAME files on disk, assembled the SAME way
  // chipModules() does for a chip with no `shared`/`own` entries (nsf has
  // neither, so this is just Object.assign of the four files, in order).
  const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const modUrls = ["nsf/nsf", "nsf/notes", "nsf/midi-write", "nsf/apu-render"]
    .map(f => pathToFileURL(path.join(ROOT, "tools", f + ".mjs")).href);
  const mods = await Promise.all(modUrls.map(u => import(u)));
  const app = createApp();
  const C = app.context;
  C.setTimeout = setTimeout; C.clearTimeout = clearTimeout;
  C.__M = Object.assign({}, ...mods);
  C.__loaded = [{name: "test-song.nsf", bytes: new Uint8Array(nsfBytes)}];
  app.run("chipModules.cache = {nsf: __M}");
  app.el("impslug").value = SLUG;
  app.el("impsecs").value = String(SECS);
  await app.run("openPickedFiles(__loaded)");
  assert.ok(app.run("!!nsfSess"), "the app opened an import session");
  const jobId = app.run("(() => { const j = captureJobStart(nsfSess.trackList.map(x => x.n), () => {}); return j ? j.id : null; })()");
  assert.ok(jobId, "capture job started");
  while (app.run("jobs.find(j => j.id === " + JSON.stringify(jobId) + ").state") === "running")
    await new Promise(r => setTimeout(r, 20));
  const keyB = app.run("nsfSess.rows[1].key");
  assert.ok(keyB, "track 1 captured a draft");
  const draftB = JSON.parse(app.store.get("ff1roll-draft-" + keyB));
  assert.ok(draftB && draftB.tracks && draftB.tracks.some(t => t.notes.length), "sanity: the app's own path actually captured notes");

  // ---- compare: parse the terminal's PUBLISHED .mid with the app's own
  // parseMidi (the same function either way — used here only as a reader,
  // not part of what's being compared)
  C.__midA = new Uint8Array(readFileSync(midPathA));
  const parsedA = JSON.parse(app.run("JSON.stringify(parseMidi(__midA.buffer, {trust: true}))"));
  const simplify = notes => notes.map(n => ({t: n.t, d: n.d, p: n.p, v: n.v})).sort((a, b) => a.t - b.t || a.p - b.p);
  assert.equal(parsedA.tracks.length, draftB.tracks.length, "same track count");
  assert.deepEqual(parsedA.tracks.map(t => t.name).sort(), draftB.tracks.map(t => t.name).sort(), "same track names");
  for (const name of draftB.tracks.map(t => t.name)) {
    const a = simplify(parsedA.tracks.find(t => t.name === name).notes);
    const b = simplify(draftB.tracks.find(t => t.name === name).notes);
    assert.deepEqual(a, b, "track " + name + ": pitch/start/duration/velocity identical between the terminal's import and the app's own capture");
  }

  // FIXED (open-items.md "FORMATS AUDIT" #1-2, closed on branch
  // shared-midi-writer): commitImports' publish step used to re-encode every
  // draft through index.html's OWN partial writeMidi, which had no CC70
  // (duty) / CC10 (pan) / aftertouch (decay) support — so the per-note duty
  // that tools/nsf/midi-write.mjs's makeMidi wrote into the CAPTURE
  // (trackBytes, ~L48-53) survived in the pre-publish draft but was silently
  // dropped from the committed .mid. writeMidi is now a faithful, tested hand
  // port of tools/nsf/midi-write.mjs's writeSongMidi (the ONE writer's logic,
  // duplicated because writeMidi must stay synchronous — see writeMidi's own
  // comment in index.html) and the draft-building call sites carry duty/ve/ch
  // through to it, so duty now survives publish on both paths identically.
  for (const tr of draftB.tracks) assert.ok(tr.notes.every(n => n.duty !== undefined),
    "pre-publish draft keeps per-note duty (captured via tools/nsf/midi-write.mjs)");
  for (const tr of parsedA.tracks) assert.ok(tr.notes.every(n => n.duty !== undefined),
    "published .mid keeps per-note duty too — writeMidi now emits CC70 (index.html's writeMidi)");
});
