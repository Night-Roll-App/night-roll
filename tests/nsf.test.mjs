// End-to-end test of the NSF pipeline against a synthetic, self-assembled
// NSF (no copyrighted data): 6502 emulation -> APU write log -> note
// reconstruction -> .notes.txt emission.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeTestNSF, makeTestNSFLoopingArpeggio, makeTestNSFVibratoPad, makeTestNSFDpcm, makeScriptNSF } from "../tools/nsf/make-test-nsf.mjs";
import { parseNSF, runNSF } from "../tools/nsf/nsf.mjs";
import { reconstruct, toNotesTxt, pitchName, backportTiming, fitBpm, dpcmHits,
         detectLoop, lastRegisterChangeFrame, trimSustainedTail } from "../tools/nsf/notes.mjs";
import { makeMidi } from "../tools/nsf/midi-write.mjs";
import { renderApu, DMC_RATES, makeDmc, dmcWrite, dmcRun, dmcUsed } from "../tools/nsf/apu-render.mjs";
import { createHash } from "node:crypto";
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
  const app = await createApp();
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

// ---- volume shape inside a held note (docs/plans/2026-10-06-in-note-dynamics.md):
// the whole $4004 series per note, thinned to corners, written as poly
// aftertouch INSIDE the note — only when it rises after the attack (a fall
// alone stays the one-number ve, same bytes as before)
function swellLog() { // FF1 Shop's pulse2 shape: vol 8, +1 every 2 frames to 15, hold, -1 every 2 frames back to 8, held to frame 54
  const log = [{frame: 0, addr: 0x4015, value: 0x02}];
  log.push({frame: 1, addr: 0x4004, value: 0x30 | 8}, {frame: 1, addr: 0x4006, value: 0xFD}, {frame: 1, addr: 0x4007, value: 0});
  let f = 1;
  for (let v = 9; v <= 15; v++) log.push({frame: f += 2, addr: 0x4004, value: 0x30 | v});
  f += 2;
  for (let v = 14; v >= 8; v--) log.push({frame: f += 2, addr: 0x4004, value: 0x30 | v});
  log.push({frame: 55, addr: 0x4004, value: 0x30}); // silence ends it
  return log;
}
test("volume shape capture: a swell inside one held note becomes a 3-corner shape (no per-game table — read from the register writes)", async () => {
  const events = reconstruct(swellLog(), 60, 1 / 60);
  assert.equal(events.length, 1, "one note, not split at the volume changes");
  assert.equal(events[0].vol, 8);
  assert.deepEqual(events[0].volSeries.slice(0, 3), [[0, 8], [2, 9], [4, 10]], "the series is relative to the note's start");
  // 200 bpm 3/4 at 60 fps: 18 frames a beat, 26.67 ticks a frame
  const bytes = makeMidi(events, {bpm: 200, tsNum: 3, tsDen: 4, frameSec: 1 / 60, snap: true});
  const app = await createApp();
  app.context._swellBytes = [...bytes];
  const n = JSON.parse(app.run(`JSON.stringify((() => { const n = parseMidi(new Uint8Array(_swellBytes).buffer).tracks[0].notes[0]; return {v: n.v, ve: n.ve, env: n.env.map(q => [+(q.t / 480).toFixed(2), Math.round(q.r * n.v)])}; })())`));
  assert.equal(n.v, 68, "velocity = the attack's 8");
  assert.equal(n.ve, undefined, "nothing fell below the attack: no ve");
  assert.deepEqual(n.env, [[0.78, 127], [0.94, 127], [1.67, 68]], "8 → 15 by +0.78 beat, held to +0.94, back to 8 by +1.67 beats, then flat");
});
async function shapeNotesOf(bytes) { // [{v, ve, env}] per note, through the app's own parser
  const app = await createApp();
  app.context._capBytes = [...bytes];
  return JSON.parse(app.run(`JSON.stringify(parseMidi(new Uint8Array(_capBytes).buffer).tracks.flatMap(t => t.notes.map(n => ({v: n.v, ve: n.ve === undefined ? null : n.ve, env: n.env ? n.env.length : 0}))))`));
}
test("volume shape capture: a decay-only note keeps its one-number ve and gets no shape (decaying captures write the same bytes as before)", async () => {
  let frame = 0;
  const log = [{frame: frame++, addr: 0x4015, value: 0x01}];
  log.push({frame, addr: 0x4000, value: 0x5F}, {frame, addr: 0x4002, value: 0xFD}, {frame, addr: 0x4003, value: 0});
  for (const v of [13, 11, 9, 7]) log.push({frame: frame += 3, addr: 0x4000, value: 0x50 | v});
  log.push({frame: frame += 3, addr: 0x4000, value: 0x50});
  const events = reconstruct(log, frame + 2, 1 / 60);
  assert.deepEqual(await shapeNotesOf(makeMidi(events, {bpm: 120, frameSec: 1 / 60, snap: true})),
    [{v: 127, ve: Math.max(8, Math.round(7 / 15 * 127)), env: 0}], "the decay target only — no shape");
});
test("volume shape capture: a write in the frame a note ends is the next note's setup, never this note's shape", async () => {
  const log = [{frame: 0, addr: 0x4015, value: 0x02}];
  log.push({frame: 1, addr: 0x4004, value: 0x38}, {frame: 1, addr: 0x4006, value: 0xFD}, {frame: 1, addr: 0x4007, value: 0});
  log.push({frame: 20, addr: 0x4004, value: 0x3F}, {frame: 20, addr: 0x4006, value: 0x7E}, {frame: 20, addr: 0x4007, value: 0}); // next note: louder, same frame
  log.push({frame: 40, addr: 0x4004, value: 0x30});
  const events = reconstruct(log, 45, 1 / 60);
  assert.equal(events.length, 2);
  assert.deepEqual((await shapeNotesOf(makeMidi(events, {bpm: 120, frameSec: 1 / 60, snap: true}))).map(n => [n.ve, n.env]),
    [[null, 0], [null, 0]], "neither note has a shape or a decay");
});
const FF1_NSF_SHAPE = process.env.FF1_NSF || new URL("../albums/nes/final-fantasy-i/reference/ff1.nsf", import.meta.url);
test("volume shape capture (real rip): FF1 Shop (NSF track 15) — pulse2 bars 25–28 each carry the 8→15→8 shape", { skip: !existsSync(FF1_NSF_SHAPE) && "ff1.nsf not present (vault-only; set FF1_NSF to run)" }, async () => {
  const nsf = parseNSF(readFileSync(FF1_NSF_SHAPE));
  const {apuLog, frames, frameSec} = runNSF(nsf, 15, 55);
  let events = reconstruct(apuLog, frames, frameSec);
  const t0 = Math.min(...events.map(e => e.startFrame));
  events = events.map(e => ({...e, startFrame: e.startFrame - t0, endFrame: e.endFrame - t0}));
  const loop = detectLoop(events, frames - t0, null);
  events = backportTiming(events, loop.period).filter(e => e.startFrame < loop.onsets - 3).map(e => ({...e, endFrame: Math.min(e.endFrame, loop.keep)}));
  const bpm = +(60 * 3 / (loop.period * frameSec / 28)).toFixed(2); // tools/nsf/dump-all.mjs's own calibration: 28 bars of 3/4
  const bytes = makeMidi(events, {bpm, tsNum: 3, tsDen: 4, frameSec, snap: true}); // in memory only — nothing under albums/ is written
  const app = await createApp();
  app.context._shopBytes = [...bytes];
  const bars = JSON.parse(app.run(`JSON.stringify((() => { const r = parseMidi(new Uint8Array(_shopBytes).buffer); const bt = r.ppq * 3;
    return r.tracks.find(t => t.name === "pulse2").notes.filter(n => n.t >= 24 * bt && n.t < 28 * bt)
      .map(n => ({bar: Math.floor(n.t / bt) + 1, v: n.v, env: (n.env || []).map(q => [+(q.t / r.ppq).toFixed(2), Math.round(q.r * n.v)])})); })())`));
  assert.deepEqual(bars.map(b => b.bar), [25, 26, 27, 28]);
  for (const b of bars) {
    assert.equal(b.v, 68, "bar " + b.bar + ": attack at chip volume 8");
    assert.deepEqual(b.env, [[0.78, 127], [0.94, 127], [1.67, 68]], "bar " + b.bar + ": up to 15 by beat 1.78, back to 8 by 2.67");
  }
});
// ---- DPCM (the NES sample channel) in the console voice: capture fidelity
// audit step 1 (docs/plans/2026-10-06-capture-fidelity-audit.md §3/§6).
// The renderer reads samples from the capture's program image (runNSF's
// `prg`) and adds a `dpcm` part only for a log that uses the channel.

test("DMC unit: NTSC rate table, $4012/$4013 address and length, $FFFF wraps to $8000", () => {
  assert.equal(DMC_RATES.length, 16);
  assert.deepEqual([DMC_RATES[0], DMC_RATES[8], DMC_RATES[15]], [428, 190, 54], "Nesdev NTSC periods");
  const reads = [];
  const d = makeDmc(a => { reads.push(a); return 0; });
  dmcWrite(d, 0x4010, 0x0F); assert.equal(d.rate, 54); assert.equal(d.loop, false);
  dmcWrite(d, 0x4012, 0xFF); assert.equal(d.sampleAddr, 0xFFC0, "$C000 + 255 * 64");
  dmcWrite(d, 0x4013, 0x04); assert.equal(d.sampleLen, 65, "4 * 16 + 1 bytes");
  dmcWrite(d, 0x4015, 0x10);
  assert.deepEqual(reads, [0xFFC0], "enabling fetches the first byte at once");
  dmcRun(d, 54 * 8 * 80); // drain every byte
  assert.equal(reads.length, 65);
  assert.deepEqual(reads.slice(62), [0xFFFE, 0xFFFF, 0x8000], "the address wraps $FFFF -> $8000");
  assert.equal(d.remaining, 0, "no loop: the sample ends");
});

test("DMC unit: the delta counter steps by 2 and clamps at 0..127; $4011 loads it directly", () => {
  const up = makeDmc(() => 0xFF), down = makeDmc(() => 0x00);
  for (const d of [up, down]) { dmcWrite(d, 0x4010, 0x0F); dmcWrite(d, 0x4013, 0x0F); } // 241 bytes, plenty of bits
  dmcWrite(up, 0x4011, 120); dmcWrite(down, 0x4011, 5);
  assert.equal(up.level, 120);
  dmcWrite(up, 0x4011, 0xFF); assert.equal(up.level, 127, "7 bits: bit 7 is ignored");
  dmcWrite(up, 0x4011, 120);
  dmcWrite(up, 0x4015, 0x10); dmcWrite(down, 0x4015, 0x10);
  const seen = [];
  for (let i = 0; i < 40; i++) { dmcRun(up, 54); dmcRun(down, 54); seen.push(up.level); }
  assert.ok(seen.includes(122) && seen.includes(124) && seen.includes(126), "climbs by 2: " + seen.slice(0, 16).join(","));
  assert.equal(up.level, 126, "a counter at 126 can't take +2: it stays");
  assert.ok(Math.max(...seen) <= 127);
  assert.equal(down.level, 1, "5 -> 3 -> 1, and 1 can't take -2");
});

test("DMC unit: the loop flag restarts the sample; $4015 bit 4 clear stops it; a playing sample isn't restarted", () => {
  const reads = [];
  const d = makeDmc(a => { reads.push(a); return 0x55; });
  dmcWrite(d, 0x4010, 0x4F); dmcWrite(d, 0x4012, 0x00); dmcWrite(d, 0x4013, 0x00); // loop, 1 byte at $C000
  dmcWrite(d, 0x4015, 0x10);
  dmcRun(d, 54 * 8 * 5);
  assert.ok(reads.length >= 5 && reads.every(a => a === 0xC000), "loops the one byte: " + reads.length + " fetches");
  const n = reads.length;
  dmcWrite(d, 0x4015, 0x10); // already playing
  assert.equal(reads.length, n, "no restart while bytes remain");
  dmcWrite(d, 0x4015, 0x00);
  dmcRun(d, 54 * 8 * 5);
  assert.ok(reads.length <= n + 1, "stopped (at most the byte already due)");
  const once = makeDmc(() => 0xFF);
  dmcWrite(once, 0x4010, 0x0F); dmcWrite(once, 0x4013, 0x00); dmcWrite(once, 0x4015, 0x10);
  dmcRun(once, 54 * 8 * 10);
  assert.equal(once.level, 16, "one byte of 1s, no loop: 8 steps up from 0, then silence holds the level");
});

test("DPCM render: a banked NSF's sample plays from the bank its driver switched in, as a dpcm part", () => {
  const nsf = parseNSF(makeTestNSFDpcm().buffer);
  assert.equal(nsf.banked, true);
  const res = runNSF(nsf, 1, 1);
  assert.ok(!res.apuLog.some(w => w.addr >= 0x5FF8), "bank switches stay out of the APU log the notes are read from");
  assert.deepEqual(res.prg.bankLog.map(w => [w.frame, w.addr, w.value]), [[0, 0x5FFC, 2]]);
  const r = renderApu(res.apuLog, res.frames, res.frameSec, {sampleRate: 44100, prg: res.prg});
  assert.ok(r.dpcm instanceof Float32Array && r.dpcm.length === r.pulse1.length);
  const seg = r.dpcm.subarray(11025, 33075);
  let e = 0, mean = 0; for (const x of seg) { e += x * x; mean += x; }
  mean /= seg.length;
  assert.ok(Math.sqrt(e / seg.length) > 0.005, "the sample sounds");
  let cross = 0; for (let i = 1; i < seg.length; i++) if (seg[i - 1] - mean < 0 && seg[i] - mean >= 0) cross++;
  const hz = cross * 2; // half-second window
  assert.ok(Math.abs(hz - 2071) < 40, "rate 15, a 16-bit cycle: ~2071 Hz, got " + hz);
  // the header's bank (zeros) is what a render blind to the switch would read: no tone
  const blind = renderApu(res.apuLog, res.frames, res.frameSec, {sampleRate: 44100, prg: {...res.prg, bankLog: []}});
  let eb = 0; for (const x of blind.dpcm.subarray(11025, 33075)) eb += x * x;
  assert.ok(Math.sqrt(eb / 22050) < 1e-4, "bank 1 is zeros: the counter falls to 0 and holds");
});

test("DPCM render: a log that never uses the channel gets no dpcm part and the same four parts as before", () => {
  const nsf = parseNSF(makeTestNSF().buffer);
  const res = runNSF(nsf, 1, 2);
  const a = renderApu(res.apuLog, res.frames, res.frameSec, {sampleRate: 22050, prg: res.prg});
  const b = renderApu(res.apuLog, res.frames, res.frameSec, {sampleRate: 22050});
  assert.equal(a.dpcm, undefined);
  for (const k of ["pulse1", "pulse2", "triangle", "noise"]) assert.deepEqual(a[k], b[k], k);
  assert.equal(dmcUsed([{addr: 0x4015, value: 0x0F}, {addr: 0x4011, value: 0}, {addr: 0x4011, value: 0}]), false, "one constant level is not use");
  assert.equal(dmcUsed([{addr: 0x4011, value: 0}, {addr: 0x4011, value: 0x40}]), true, "the level moved by hand (raw PCM)");
  assert.equal(dmcUsed([{addr: 0x4015, value: 0x1F}]), true, "a sample started");
});

// FF1 never touches the DMC: its console voice must render bit for bit as it
// did before DPCM existed (hashes taken from the pre-DPCM renderer, 12 s at
// 44.1 kHz). Vault-only file, so CI skips, like the FF1 import test.
const FF1_NSF_FILE = new URL("../albums/nes/final-fantasy-i/reference/ff1.nsf", import.meta.url);
test("DPCM render: FF1 renders byte-identical to the pre-DPCM renderer, with no dpcm part",
     {skip: !existsSync(FF1_NSF_FILE) && "ff1.nsf not present (vault-only)"}, () => {
  const nsf = parseNSF(readFileSync(FF1_NSF_FILE));
  const pinned = {
    3: {pulse1: "67e10beb16", pulse2: "fe28fa693a", triangle: "a17771d7cf", noise: "e0ef40c437"},
    17: {pulse1: "7f6128dfc6", pulse2: "0b9857b40b", triangle: "0ec47fd2e0", noise: "e0ef40c437"},
  };
  for (const [t, want] of Object.entries(pinned)) {
    const res = runNSF(nsf, +t, 12);
    const r = renderApu(res.apuLog, res.frames, res.frameSec, {sampleRate: 44100, prg: res.prg});
    assert.equal(r.dpcm, undefined, "track " + t + ": no dpcm part");
    for (const [k, h] of Object.entries(want))
      assert.equal(createHash("sha1").update(Buffer.from(r[k].buffer)).digest("hex").slice(0, 10), h, "track " + t + " " + k);
  }
});

// A real DPCM rip: Super Mario Bros. 3's drums are samples. The archive's rip,
// fetched by hand to albums/nes/super-mario-bros-3/reference/ (gitignored).
const SMB3_NSF = new URL("../albums/nes/super-mario-bros-3/reference/super-mario-bros-3.nsf", import.meta.url);
test("DPCM render: Super Mario Bros. 3 track 1 has a sounding dpcm part read from its own banks",
     {skip: !existsSync(SMB3_NSF) && "super-mario-bros-3.nsf not present (vault-only)"}, () => {
  const nsf = parseNSF(readFileSync(SMB3_NSF));
  const res = runNSF(nsf, 1, 8);
  assert.ok(res.apuLog.some(w => w.addr === 0x4015 && (w.value & 0x10)), "the driver starts samples");
  const r = renderApu(res.apuLog, res.frames, res.frameSec, {sampleRate: 44100, prg: res.prg});
  let e = 0; for (const x of r.dpcm) e += x * x;
  const rms = Math.sqrt(e / r.dpcm.length);
  assert.ok(rms > 0.01, "the drums sound: rms " + rms.toFixed(4));
  const blind = renderApu(res.apuLog, res.frames, res.frameSec, {sampleRate: 44100});
  let eb = 0; for (const x of blind.dpcm) eb += x * x;
  assert.ok(Math.sqrt(eb / blind.dpcm.length) < rms / 2, "without the program image there are no samples to play");
});

// ---- NES capture v2 (docs/plans/2026-10-06-capture-fidelity-audit.md §4.1,
// §8): vibrato as pitch bend, duty changes inside a note as CC70, DPCM hits
// on a LAST "dpcm" track only when the song uses the channel — and the notes
// themselves exactly as before. Scripts are register writes replayed by
// makeScriptNSF's own 6502 play routine, run through the real emulator.
const capture = (writes, secs = 4) => {
  const r = runNSF(parseNSF(makeScriptNSF(writes).buffer), 1, secs);
  return {...r, events: reconstruct(r.apuLog, r.frames, r.frameSec)};
};
const strip = events => events.map(e => { const o = {...e}; delete o.bendSeries; delete o.dutySeries; return o; }); // what v1 handed makeMidi
async function parsedOf(bytes) { // the app's own parser, then its own writer and parser again (the publish hop)
  const app = await createApp();
  app.context._v2 = [...bytes];
  return JSON.parse(app.run(`JSON.stringify((() => {
    const a = parseMidi(new Uint8Array(_v2).buffer, {trust: true});
    const b = parseMidi(writeMidi({ppq: a.ppq, timesig: a.timesig, tempos: a.tempos, tracks: a.tracks.map(t => ({...t}))}).buffer, {trust: true});
    return {a, b, drums: a.tracks.map((t, ti) => { S.song = a; return trackIsDrums(ti); })};
  })())`));
}
const A4 = [[1, 0x4015, 0x01], [1, 0x4000, 0xBF], [1, 0x4002, 0xFD], [1, 0x4003, 0x00]]; // pulse1 A4 (period 253), duty 2, vol 15

test("capture v2: vibrato inside a held note is pitch bend on that note's channel — still one note", async () => {
  const w = [...A4];
  const wob = [0xFD, 0xFB, 0xF9, 0xFB, 0xFD, 0xFF]; // period 249…255: +28…−14 cents, inside the 70-cent guard, low byte only (no $4003 retrigger)
  for (let f = 20, k = 0; f < 100; f += 2, k++) w.push([f, 0x4002, wob[k % wob.length]]);
  const ev = capture(w, 2).events;
  assert.equal(ev.length, 1, "one held note");
  assert.ok(ev[0].bendSeries.some(([, c]) => c > 10) && ev[0].bendSeries.some(([, c]) => c < -10), "the series goes both ways: " + JSON.stringify(ev[0].bendSeries.slice(0, 6)));
  const p = await parsedOf(makeMidi(ev, {bpm: 120, frameSec: 1 / 60}));
  for (const s of [p.a, p.b]) {
    assert.equal(s.tracks.length, 1);
    assert.equal(s.tracks[0].notes.length, 1, "still one note");
    const pb = (s.tracks[0].ctl || []).filter(e => e.c === "pb");
    assert.ok(pb.length >= 4, "bends written: " + pb.length);
    assert.ok(pb.every(e => e.ch === 0), "on the pulse1 channel");
    assert.ok(pb.some(e => e.v > 0) && pb.some(e => e.v < 0), "up and down");
    assert.ok(!(s.tracks[0].ctl || []).some(e => e.c === 101), "under ±2 semitones: no RPN range");
    assert.ok(pb.every(e => e.t > s.tracks[0].notes[0].t && e.t < s.tracks[0].notes[0].t + s.tracks[0].notes[0].d), "inside the note");
  }
});

test("capture v2: a duty change inside a held note is CC70 at the change; the next note's attack duty is unchanged", async () => {
  const w = [...A4, [40, 0x4000, 0x7F], [80, 0x4000, 0xFF], [120, 0x4002, 0xD5], [120, 0x4003, 0x00], [160, 0x4000, 0x30]];
  const ev = capture(w, 3).events;
  assert.deepEqual(ev.map(e => [e.midi, e.duty]), [[69, 2], [72, 3]], "two notes, attack duties as v1 read them");
  assert.deepEqual(ev[0].dutySeries, [[0, 2], [39, 1], [79, 3]]);
  const p = await parsedOf(makeMidi(ev, {bpm: 120, frameSec: 1 / 60}));
  for (const s of [p.a, p.b]) {
    const [n1, n2] = s.tracks[0].notes;
    assert.equal(n1.duty, 2);
    assert.deepEqual(n1.duties.map(q => q.v), [1, 3], "both changes, in order, survive parse and the app's writer");
    assert.ok(n1.duties.every(q => q.t > 0 && q.t < n1.d));
    assert.equal(n2.duty, 3);
    assert.equal(n2.duties, undefined);
  }
});

test("capture v2: a CC70 that is the next note's attack is never read as a change inside an overlapping note", async () => {
  // a 40-tick minimum stretches a short note over its successor's start
  const bytes = makeMidi([{channel: "pulse1", startFrame: 0, endFrame: 1, midi: 60, vol: 15, duty: 1},
                          {channel: "pulse1", startFrame: 1, endFrame: 30, midi: 62, vol: 15, duty: 2}], {bpm: 120, frameSec: 1 / 60, snap: false});
  const p = await parsedOf(bytes);
  assert.deepEqual(p.a.tracks[0].notes.map(n => [n.duty, n.duties || null]), [[1, null], [2, null]]);
});

test("capture v2: a slide that lands on a new pitch stays a new note; a 1-frame step into it rides as bend on the target", async () => {
  // A4 held, one frame of B4, then C5 held — no $4003, so only the period moves
  const w = [...A4, [40, 0x4002, 0xE1], [41, 0x4002, 0xD5], [80, 0x4000, 0x30]];
  const ev = capture(w, 2).events.sort((a, b) => a.startFrame - b.startFrame);
  assert.deepEqual(ev.map(e => pitchName(e.midi)), ["A4", "C5"], "start and target pitch both visible");
  assert.equal(ev[1].startFrame, 40, "the target absorbs the 1-frame step (v1's rule, unchanged)");
  assert.ok(ev[1].bendSeries[0][1] < -80, "…and starts bent down a semitone, where the B4 step sounded: " + JSON.stringify(ev[1].bendSeries));
  const p = await parsedOf(makeMidi(ev, {bpm: 120, frameSec: 1 / 60, snap: false}));
  const pb = p.a.tracks[0].ctl.filter(e => e.c === "pb");
  const c5 = p.a.tracks[0].notes[1];
  assert.equal(p.a.tracks[0].notes.length, 2);
  assert.ok(pb.some(e => e.t === c5.t && e.v < 0), "bent at the target's own onset");
  assert.ok(pb.some(e => e.t > c5.t && e.v === 0), "back to centre after the step");
});

test("capture v2: a no-DPCM, no-wobble tune writes exactly the bytes v1 wrote", () => {
  const nsf = parseNSF(makeTestNSF().buffer);
  const r = runNSF(nsf, 1, 3);
  const ev = reconstruct(r.apuLog, r.frames, r.frameSec);
  assert.deepEqual(dpcmHits(r.apuLog, r.frames, r.frameSec), [], "no sample channel, no hits");
  const opts = {bpm: 120, frameSec: r.frameSec};
  assert.deepEqual([...makeMidi(ev, opts)], [...makeMidi(strip(ev), opts)], "byte-identical");
});

// the drum script: two samples (kick-ish on the beat, another on the backbeat) under a pulse line
function dpcmWrites({withDpcm = true} = {}) {
  const w = [[1, 0x4015, 0x01], [1, 0x4010, 0x0F]];
  for (let k = 0; k < 8; k++) { // 8 quarter notes at 120 bpm = 30 frames each
    const f = 10 + k * 30;
    w.push([f, 0x4000, 0xBF], [f, 0x4002, k % 2 ? 0xD5 : 0xFD], [f, 0x4003, 0x00]);
    if (!withDpcm) continue;
    w.push([f, 0x4015, 0x01], [f, 0x4012, k % 2 ? 0x10 : 0x00], [f, 0x4013, k % 2 ? 0x08 : 0x10], [f, 0x4015, 0x11]);
  }
  w.push([260, 0x4000, 0x30]);
  return w;
}
test("capture v2: DPCM hits become a LAST 'dpcm' track on the drum channel, one key per distinct sample", async () => {
  const r = capture(dpcmWrites(), 5);
  const hits = dpcmHits(r.apuLog, r.frames, r.frameSec);
  assert.equal(hits.length, 8, "every trigger is a hit");
  assert.equal(new Set(hits.map(h => h.sample)).size, 2, "two samples (address + length + rate)");
  assert.ok(hits.every(h => h.endFrame - h.startFrame >= 1 && h.endFrame - h.startFrame <= 5), "a short sample lasts its own length");
  const p = await parsedOf(makeMidi(r.events.concat(hits), {bpm: 120, frameSec: r.frameSec}));
  for (const s of [p.a, p.b]) {
    assert.deepEqual(s.tracks.map(t => t.name), ["pulse1", "dpcm"], "appended after every existing track");
    const d = s.tracks[1].notes;
    assert.equal(d.length, 8);
    assert.ok(d.every(n => n.ch === 9), "channel 10, the drum channel, through the app's writer too");
    assert.equal(new Set(d.map(n => n.p)).size, 2, "a key per sample");
    assert.ok(d.every(n => n.p >= 35 && n.p <= 81), "General MIDI percussion keys");
  }
  assert.deepEqual(p.drums, [false, true], "the roll treats it as a kit");
  // the same tune without the sample channel: no dpcm track at all
  const r0 = capture(dpcmWrites({withDpcm: false}), 5);
  assert.deepEqual(dpcmHits(r0.apuLog, r0.frames, r0.frameSec), []);
  assert.deepEqual([...makeMidi(r0.events, {bpm: 120, frameSec: r0.frameSec})], [...makeMidi(r.events, {bpm: 120, frameSec: r.frameSec})],
    "the pulse track is byte-identical with or without the drums");
});

test("capture v2: the hardware does not restart a playing sample; bit 4 clear stops it; a 1-byte sample is no hit", () => {
  const log = [{frame: 0, addr: 0x4015, value: 0x0F}, {frame: 1, addr: 0x4010, value: 0x00}, // slowest rate: 428 cycles a bit
    {frame: 1, addr: 0x4013, value: 0x10}, {frame: 1, addr: 0x4015, value: 0x1F}, // 257 bytes ≈ 0.49 s ≈ 30 frames
    {frame: 5, addr: 0x4015, value: 0x1F},                                         // still playing: ignored
    {frame: 10, addr: 0x4015, value: 0x0F},                                        // stopped at 10
    {frame: 20, addr: 0x4013, value: 0x00}, {frame: 20, addr: 0x4015, value: 0x1F}]; // 1 byte: a driver's stop
  const hits = dpcmHits(log, 60, 1 / 60);
  assert.deepEqual(hits.map(h => [h.startFrame, h.endFrame]), [[1, 10]]);
});

test("capture v2 in the app's own capture (captureChipTrack): the dpcm track is appended and every other track is what a capture without it writes", async () => {
  const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const mods = await Promise.all(["nsf/nsf", "nsf/notes", "nsf/midi-write", "nsf/apu-render"].map(f => import(pathToFileURL(path.join(ROOT, "tools", f + ".mjs")).href)));
  const app = await createApp();
  const C = app.context;
  C.setTimeout = setTimeout; C.clearTimeout = clearTimeout;
  C.__M = Object.assign({}, ...mods);
  C.__nsf = parseNSF(makeScriptNSF(dpcmWrites()).buffer);
  const run = async () => {
    const cap = await app.run("captureChipTrack('nsf', __M, __nsf, 1, 8, null)");
    C.__b = cap.bytes;
    return JSON.parse(app.run("JSON.stringify(parseMidi(__b.buffer, {trust: true}).tracks.map(t => ({name: t.name, notes: t.notes.map(n => [n.t, n.d, n.p, n.v])})))"));
  };
  const v2 = await run();
  const hits = app.run("CHIPS.nsf.hits");
  app.run("CHIPS.nsf.hits = null");
  const v1 = await run();
  C.__h = hits; app.run("CHIPS.nsf.hits = __h");
  assert.deepEqual(v2.map(t => t.name), ["pulse1", "dpcm"]);
  assert.deepEqual(v1.map(t => t.name), ["pulse1"]);
  assert.deepEqual(v2[0], v1[0], "pulse1: same ticks, lengths, pitches, velocities");
  assert.ok(v2[1].notes.length >= 4, "the hits are there: " + v2[1].notes.length);
});

test("capture v2: every published NES .mid not yet re-captured with v2 reads exactly as before — no in-note duty changes appear in an old file", async () => {
  const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const files = [];
  // a song re-captured with v2 is stamped in its album.json (nsf.tracks[base].cap.v ≥ 2) and may carry duties
  const v2 = new Set();
  const walk = d => {
    if (existsSync(path.join(d, "album.json"))) {
      const tracks = JSON.parse(readFileSync(path.join(d, "album.json"), "utf8")).nsf?.tracks || {};
      for (const [base, t] of Object.entries(tracks)) if (t && t.cap && t.cap.v >= 2) v2.add(path.join(d, base));
    }
    for (const e of readdirSync(d, {withFileTypes: true})) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".mid")) files.push(f); }
  };
  walk(path.join(ROOT, "albums", "nes"));
  const old = files.filter(f => ![...v2].some(b => f === b + ".mid" || f === path.join(path.dirname(b), "songs", path.basename(b)) + ".mid"));
  assert.ok(files.length > 100, "the NES catalog is there: " + files.length);
  files.length = 0; files.push(...old);
  const app = await createApp();
  let duties = 0;
  for (const f of files) {
    app.context.__f = new Uint8Array(readFileSync(f));
    duties += app.run("parseMidi(__f.buffer).tracks.reduce((s, t) => s + t.notes.filter(n => n.duties).length, 0)");
  }
  assert.equal(duties, 0);
});

// real rips (the archive's, cached outside the repo by tools/recapture.mjs or fetched by hand)
const ripAt = name => [process.env.NES_RIPS && path.join(process.env.NES_RIPS, name), "/tmp/recap/rips/nes/" + name].find(p => p && existsSync(p));
const SMB3_RIP = ripAt("super-mario-bros-3.nsf") || (existsSync(SMB3_NSF) ? fileURLToPath(SMB3_NSF) : null);
test("capture v2 (real rip): Super Mario Bros. 3 track 1 gains a dpcm track of several samples; its other tracks are unchanged",
     {skip: !SMB3_RIP && "super-mario-bros-3.nsf not present (vault-only; NES_RIPS=<dir>)"}, async () => {
  const r = runNSF(parseNSF(readFileSync(SMB3_RIP)), 1, 30);
  const ev = reconstruct(r.apuLog, r.frames, r.frameSec);
  const hits = dpcmHits(r.apuLog, r.frames, r.frameSec);
  assert.ok(hits.length > 40, "drum hits: " + hits.length);
  assert.ok(new Set(hits.map(h => h.sample)).size >= 3, "several samples");
  const bpm = fitBpm(ev, r.frameSec, 120);
  const a = await parsedOf(makeMidi(strip(ev), {bpm, frameSec: r.frameSec})), b = await parsedOf(makeMidi(ev.concat(hits), {bpm, frameSec: r.frameSec}));
  const notes = s => s.tracks.map(t => [t.name, t.notes.map(n => [n.t, n.d, n.p, n.v, n.duty])]);
  assert.deepEqual(b.b.tracks.map(t => t.name), [...a.b.tracks.map(t => t.name), "dpcm"], "one track appended, last");
  assert.deepEqual(notes(b.b).slice(0, -1), notes(a.b), "every other track's notes as before, through the publish hop");
  assert.ok(b.b.tracks.some(t => t.notes.some(n => n.duties)), "duty changes inside notes carried");
});
const MM2_RIP = ripAt("mega-man-2.nsf");
test("capture v2 (real rip): Mega Man 2 has no DPCM track, and its held notes carry bends without a note added or lost",
     {skip: !MM2_RIP && "mega-man-2.nsf not present (vault-only; NES_RIPS=<dir>)"}, async () => {
  const r = runNSF(parseNSF(readFileSync(MM2_RIP)), 1, 30);
  const ev = reconstruct(r.apuLog, r.frames, r.frameSec);
  assert.deepEqual(dpcmHits(r.apuLog, r.frames, r.frameSec), []);
  const bpm = fitBpm(ev, r.frameSec, 120);
  const a = await parsedOf(makeMidi(strip(ev), {bpm, frameSec: r.frameSec})), b = await parsedOf(makeMidi(ev, {bpm, frameSec: r.frameSec}));
  const notes = s => s.tracks.map(t => [t.name, t.notes.map(n => [n.t, n.d, n.p, n.v])]);
  assert.deepEqual(notes(b.b), notes(a.b), "same notes after the publish hop");
  assert.ok(b.a.tracks.some(t => (t.ctl || []).some(e => e.c === "pb")), "bends present");
});

// ---- glide (CC84; NIGHT-ROLL.md "Glide (CC84)", docs/plans/2026-10-07-capture-
// audit-2-and-glide.md §2): a continuation (`lg`) carries CC84 = the key it
// continues from, just before its note-on; captures mark `e.lg` from the
// chip's own no-re-key signal and makeMidi makes the bend chain-relative.
test("glide: trackBytes writes CC84 = the predecessor's key right before a linked note-on; a link with nothing ending there writes none", async () => {
  const { trackBytes } = await import("../tools/nsf/midi-write.mjs");
  const b = trackBytes("pulse1", [{t: 0, d: 240, p: 60, v: 100}, {t: 240, d: 240, p: 62, v: 90, lg: 1}, {t: 600, d: 100, p: 64, v: 80, lg: 1}], 2);
  const hex = b.map(x => x.toString(16).padStart(2, "0")).join(" ");
  assert.ok(hex.includes("b2 54 3c 00 92 3e 5a"), "CC84 60 on channel 3, then (delta 0) the on of 62: " + hex);
  assert.equal(hex.split("b2 54").length - 1, 1, "only the touching note is linked");
  const plain = trackBytes("pulse1", [{t: 0, d: 240, p: 60, v: 100}, {t: 240, d: 240, p: 62, v: 90}], 2);
  assert.ok(!plain.map(x => x.toString(16)).join(" ").includes("b2 54"), "no lg: no CC84");
});

test("glide: chainBends shifts each continuation by (its detune − the chain head's), with a t 0 point; the head keeps v2's rule", async () => {
  const { chainBends } = await import("../tools/nsf/midi-write.mjs");
  const ns = chainBends([
    {t: 0, c0: 10, bend: [{t: 240, c: -30}]},
    {t: 480, c0: 60, lg: 1},
    {t: 960, c0: -5, lg: 1, bend: [{t: 240, c: -100}]},
    {t: 1440, c0: 30},                 // a new head
    {t: 1920, c0: 30, lg: 1},          // same detune as its head: nothing to add
  ]);
  assert.deepEqual(ns.map(n => n.bend), [[{t: 240, c: -30}], [{t: 0, c: 50}], [{t: 0, c: -15}, {t: 240, c: -115}], undefined, undefined]);
  assert.ok(ns.every(n => !("c0" in n)), "c0 is the helper's input only");
});

test("glide: makeMidi links capture events marked lg (CC84 + chain-relative bend) and stays a VELOCITY re-capture; unmarked events write what they always did", async () => {
  const { readSmf, captureDiff } = await import("../tools/capture-diff.mjs");
  const fOf = cents => 440 * Math.pow(2, (cents - 6900) / 1200);
  const ev = [
    {channel: "pulse1", startFrame: 0, endFrame: 24, midi: 60, vol: 15, duty: 2, freq0: fOf(6010), bendSeries: [[0, 0], [12, -30]]},
    {channel: "pulse1", startFrame: 24, endFrame: 48, midi: 59, vol: 12, duty: 2, freq0: fOf(5960), lg: true},
    {channel: "pulse1", startFrame: 48, endFrame: 72, midi: 57, vol: 12, duty: 2, cents: -5, bendSeries: [[0, 0], [12, -100]], lg: true},
  ];
  const opts = {bpm: 150, frameSec: 1 / 60};
  const plain = ev.map(e => { const o = {...e}; delete o.lg; return o; });
  const linked = readSmf(makeMidi(ev, opts)), before = readSmf(makeMidi(plain, opts));
  const tr = linked.tracks[0];
  assert.deepEqual(tr.other.filter(e => e.kind === "cc84").map(e => [e.t, e.key]), [[480, "0:60"], [960, "0:59"]], "a link at each continuation, valued with the key before it");
  const pb = tr.other.filter(e => e.kind === "bend").map(e => [e.t, +e.key.split(":")[1] - 8192]);
  assert.deepEqual(pb, [[240, -1229], [480, 2048], [960, -614], [1200, -4710]], "head −30 at its middle; then +50, −15, −115 cents from the chain head (±2 range)");
  assert.ok(!before.tracks[0].other.some(e => e.kind === "cc84"), "no lg: no CC84");
  const r = captureDiff(before, linked);
  assert.equal(r.verdict, "VELOCITY", "same notes: " + r.reasons.join("; "));
  assert.equal(r.gained.cc84, 2, "capture-diff lists the links as a gain");
  const p = await parsedOf(makeMidi(ev, opts));
  for (const s of [p.a, p.b]) assert.deepEqual(s.tracks[0].notes.map(n => !!n.lg), [false, true, true], "the app reads the links back, through the publish hop");
});
