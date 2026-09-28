// NES + Game Boy instruments: both are pure synthesis chips — pulse, wave
// (triangle on NES, a 32-sample wavetable on Game Boy) and noise — so there
// is no sample bank to read at all (unlike PS1/N64's INSTR.DAT/tuning
// float) and no per-song ARAM snapshot to bucket by content hash (unlike
// SNES). Per Josh's brief (2026-09-28) and the NIGHT-ROLL.md "No one-time
// hacks in capture engines" rule: NOTHING here is per-game. An instrument
// is derived purely from the 2A03/DMG's own register facts the existing,
// tested note reconstructors already expose (tools/nsf/notes.mjs and
// tools/gbs/notes.mjs `reconstruct()` — channel, duty, pitch, timing,
// `vol`/`volEnd` for a software (constant-volume) envelope, `waveCycles`/
// `lfsr7` for GB wave/noise) PLUS one small supplementary scan of the SAME
// register log this module owns (`traceReg`, below) to recover what
// `reconstruct()` deliberately leaves out because it's ambiguous for a
// human reading .notes.txt: the hardware envelope's own (period, loop)
// bits, and — for GB wave — the 32-nibble wavetable actually in RAM at
// trigger time (a REAL sample, unlike every other channel here).
//
// Instrument identity: channel type + duty (pulses) + the SHAPE of the
// volume-over-time curve. A curve is measured directly (not read from a
// driver table): every note's level 0..1 for its first ~16 frames,
// normalised so its own onset = 1 (this is what makes a chip's accent
// data — the note's absolute starting volume — a performance fact, not
// part of the instrument, exactly the same separation PSX/N64/SNES make
// between an instrument's envelope and a note's velocity). Two notes with
// the same channel/duty and a close-enough curve are the SAME instrument,
// however loud either one was played; a different decay speed (a different
// hardware envelope period, or a driver that fades one kind of note but
// not another) is a DIFFERENT instrument. "Close enough" is a similarity
// merge, not exact match (`clusterByShape`, near `finishChipAlbum`, below):
// a frame of chip/emulation jitter shifts a decay step earlier or later far
// more often than a driver program genuinely changes, so exact-matching the
// curve fragmented real albums into hundreds of one- and two-note
// "instruments" (Josh, 2026-09-28, after reviewing the first numbers) —
// two curves join the same instrument at Pearson correlation ≥ 0.97 and
// mean absolute difference ≤ 0.08, and the cluster's own envelope comes
// from its true medoid once merging is done, not whichever note happened
// to seed it. Clustered album-wide, the same two-phase shape as snes.mjs
// (every song's facts collected into one `bucket` first; `finishChipAlbum`
// clusters and builds instruments only once every song is in, so a shape
// only three songs ever play is judged on all three together). Because
// this is a similarity merge rather than a pure function of one note's own
// facts, verify.mjs can't recompute a note's expected instrument id the
// way SNES's verify recomputes sampleKeyOf's — instead it finds the best-
// matching instrument by curve (`curveFromEnvelope` resamples a stored
// instrument's envelope back to the same 16-frame shape), the same rule
// clustering itself used. NES noise and GB noise are always kind
// "drum-kit" (one fixedPitch region at the period/shift the album played
// it at, keyed additionally by mode/width — a driver's drum kit is a
// handful of fixed periods, not a scale); every other channel is
// "melodic", one region spanning the whole key range (a pulse/triangle/
// wave's pitch is a pure resampling ratio — no native-pitch ambiguity the
// way a recorded sample has, so no per-instrument root-fitting is needed:
// see ROOT_KEY below).
//
// The "sample": ONE cycle-accurate loop so play.mjs needs no new code.
// Pulse: a single-cycle square at the duty's exact on-fraction (12.5/25/
// 50/75%), 32 samples so the loop interpolates smoothly at any pitch.
// Triangle: the chip's own 32-step 15..0,0..15 staircase. Both share
// ROOT_KEY (below) and SAMPLE_RATE: a synthesized oscillator has no
// "native" pitch to get wrong, so rather than fit a root per instrument
// (SNES's job, because ITS samples are real recordings) every 32-sample
// loop here uses the exact key at which SAMPLE_RATE/32 IS that key's
// frequency — resampling by 2^((key−ROOT_KEY)/12) then reproduces any
// target frequency exactly (up to the semitone `event.midi` was already
// rounded to upstream), not approximately. GB wave reuses the same
// ROOT_KEY/SAMPLE_RATE relationship for the same reason — its 32-sample
// table is a wavetable readout clocked exactly like a pulse's duty
// sequencer, not a recording either — but its 32 samples ARE the real
// captured nibbles, content-hashed like a SNES BRR sample (see
// `waveHash`), because two Game Boy songs can and do reuse the same
// wavetable bytes. Noise is different again: one-shot, `fixedPitch`, its
// LFSR literally simulated at the captured period/width for a short burst
// — rootKey = fixedKey so playback never resamples it (it is already
// generated at the exact rate it plays back at).
//
// Envelope points: the observed level curve of the cluster's own
// longest-held representative note (raw driver writes for a software
// envelope, the simulated hardware-envelope decay otherwise), amplitude
// through the same DAC law apu-render.mjs's renderer applies (`pulseLevel`/
// `noiseLevel`: NES's mixer is a concave nonlinearity, not linear vol/15;
// `gbEnvLevel`'s normalised output IS linear — the DMG's DAC is linear in
// the 4-bit level, `dac(v) = v/7.5 − 1`) so verify.mjs's shape correlation
// holds against the real renderer, not an approximation of it. Release:
// every one of these channels is cut essentially at once at key-off (no
// chip here has a release phase; a driver just disables the channel or
// zeroes its volume) — `releaseCurve: {mode: "exp-time", seconds: 0.005}`
// throughout, "immediate cut" per Josh's brief.
//
// What this leaves out: NES DPCM (a genuine sample channel, $4011/$4012-
// $4015 bit4) — the 2A03 capture pipeline (tools/nsf/nsf.mjs) never reads
// $4015 bit 4 nor logs $4010-$4013 in the first place, so no NSF this
// module has seen carries any DPCM facts to extract; if a future capture
// adds that, DPCM hits would need real sample extraction (like PSX/N64),
// not the synthesis this module does — noted, not implemented, see
// open-items.md.
import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseNSF, runNSF } from "../nsf/nsf.mjs";
import { reconstruct as nesReconstruct } from "../nsf/notes.mjs";
import { parseGBS, runGBS, GB_CLOCK } from "../gbs/gbs.mjs";
import { reconstruct as gbReconstruct, gbNoiseDrum } from "../gbs/notes.mjs";
import { simplify, summarize, round, sigOf, sampleHash, levelAt } from "./model.mjs";

export const SAMPLE_RATE = 32000; // every synthesized loop/burst's native rate
const LOOP_LEN = 32; // samples per pulse/triangle/GB-wave cycle
// the key at which SAMPLE_RATE/32 IS that key's own frequency: see header
export const ROOT_KEY = 69 + 12 * Math.log2((SAMPLE_RATE / LOOP_LEN) / 440);
const CPU = 1_789_773; // NTSC 2A03 clock, Hz — tools/nsf/notes.mjs's CLOCK
const keyFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);
// the period register that plays exactly the given (already-rounded) MIDI
// key — the inverse of notes.mjs's freqOf. A captured note's OWN period
// almost never lands on an exact semitone of A440 (the register is an
// integer, and reconstruct() rounds the result to the nearest key for the
// roll regardless), so replaying it raw and comparing to a key-quantized
// instrument would report up to 50¢ of pure rounding noise, not a real
// pitch error — verify.mjs uses these to compare driver and library at the
// SAME intended frequency instead (the "vibrato ±70¢" rule in notes.mjs is
// the same discrepancy, decided the other way: kept as one note there,
// isolated as its own key here)
export function nesPeriodForKey(midi, kind) {
  const div = kind === "triangle" ? 32 : 16;
  return Math.max(0, Math.min(0x7FF, Math.round(CPU / (div * keyFreq(midi)) - 1)));
}
export function gbPulsePeriodForKey(midi) {
  return Math.max(0, Math.min(2047, Math.round(2048 - 131072 / keyFreq(midi))));
}
export function gbWavePeriodForKey(midi, cycles = 1) {
  return Math.max(0, Math.min(2047, Math.round(2048 - 65536 * cycles / keyFreq(midi))));
}
export const NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
export const DUTY_FRAC = [0.125, 0.25, 0.5, 0.75]; // $4000/NRx1 duty index (0-3) -> on-fraction; shared NES/GB hardware convention
const HOLD_CAP = 2; // seconds of envelope simulated/recorded per note (matches name.mjs's HOLD)
const RELEASE = {mode: "exp-time", seconds: 0.005, floor: 1 / 32767}; // every channel here cuts ~at once at key-off

// ---- DAC laws (apu-render.mjs's own per-channel output curves, duplicated
// read-only here as pure math — not imported, so this module stays
// independent the same way snes.mjs steps its own isolated DspVoices
// rather than reaching into the renderer's internals) -----------------------
const pulseOutRaw = v => v ? 95.88 / (8128 / v + 100) : 0;
const triOutRaw = v => 159.79 / (1 / (v / 8227) + 100);
const noiseOutRaw = v => v ? 159.79 / (1 / (v / 12241) + 100) : 0;
const PULSE_PEAK = pulseOutRaw(15), NOISE_PEAK = noiseOutRaw(15);
export const pulseLevel = v => pulseOutRaw(v) / PULSE_PEAK;
export const noiseLevel = v => noiseOutRaw(v) / NOISE_PEAK;
const dcRemove = pcm => { let m = 0; for (const x of pcm) m += x; m /= pcm.length; for (let i = 0; i < pcm.length; i++) pcm[i] -= m; return pcm; };

// $4000/$4004/$400C byte: bits7-6 duty (pulses only), bit5 loop/halt,
// bit4 constant-volume, bits3-0 volume (constVol) or envelope period
export function decodeVolReg(v) {
  return {duty: (v >> 6) & 3, loop: !!(v & 0x20), constVol: !!(v & 0x10), val: v & 0x0F};
}

// ---- pulse/triangle/noise "samples": pure synthesis, no driver involved ----
// apu-render.mjs's mixer never outputs a bipolar signal directly — a pulse
// sits at 2×pulseOut(vol) while "on" and 0 while "off" until the console's
// own AC-coupling (a ~90 Hz high-pass) removes the DC a per-duty on/off
// square carries; reproducing THAT shape (not a plain symmetric ±1 square)
// keeps a narrow duty's real asymmetry (louder peaks, quieter RMS) instead
// of flattening every duty to the same loudness
export function pulseSample(duty) { // duty: 0.125/0.25/0.5/0.75
  const on = Math.round(duty * LOOP_LEN), hi = 2 * PULSE_PEAK * (1 - duty), lo = -2 * PULSE_PEAK * duty;
  const pcm = new Float32Array(LOOP_LEN);
  for (let i = 0; i < LOOP_LEN; i++) pcm[i] = i < on ? hi : lo;
  return {pcm, rate: SAMPLE_RATE, loop: {start: 0, end: LOOP_LEN}};
}
// Game Boy pulse: gbs/apu-render.mjs's dac() is linear and its "off" state
// is dac(0) = −1 exactly (not 0 like the NES mixer) whatever the duty is —
// so, unlike NES, this shape is a plain symmetric ±1 square; the console's
// own AC-coupling would shift a narrow duty off-centre same as NES's does,
// but removing that DC here risks pushing a 12.5%-duty peak past ±1 for
// 16-bit storage, so it's left uncorrected (documented simplification)
// gbs/apu-render.mjs's mixer scales every channel's dac() by gain(bit) =
// 0.25×(Lroute×Lvol + Rroute×Rvol)/16 — NR50/NR51 facts, i.e. a song's own
// master volume and panning, not this instrument's. Full stereo routing at
// max master volume (both sides' NR50 = 7) is the constant every driver
// effectively defaults to and is what a plain sampler will play back at,
// so it's the reference this module bakes in (0.25×(8+8)/16 = 0.25) — a
// song that actually turns the master volume down is a performance fact
// this library has no register for, same as PSX/N64 reverb or filters
const GB_REF_GAIN = 0.25;
export function gbPulseSample(duty) {
  const on = Math.round(duty * LOOP_LEN);
  const pcm = new Float32Array(LOOP_LEN);
  for (let i = 0; i < LOOP_LEN; i++) pcm[i] = (i < on ? 1 : -1) * GB_REF_GAIN;
  return {pcm, rate: SAMPLE_RATE, loop: {start: 0, end: LOOP_LEN}};
}
const TRI_SEQ = []; // the chip's own 32-step staircase: 15..0, 0..15
for (let i = 15; i >= 0; i--) TRI_SEQ.push(i);
for (let i = 0; i <= 15; i++) TRI_SEQ.push(i);
export function triangleSample() {
  // triOut is itself nonlinear in the 0-15 step value — a plain linear
  // ramp through it would understate the compression the real DAC applies
  const pcm = dcRemove(Float32Array.from(TRI_SEQ, v => 2 * triOutRaw(v)));
  return {pcm, rate: SAMPLE_RATE, loop: {start: 0, end: LOOP_LEN}};
}
// a short one-shot burst of the REAL 15/7-bit LFSR at its captured period —
// clocked at CPU/period Hz so the burst already IS the chip's own rate;
// rootKey = fixedKey (below) keeps playback from resampling it further
export function noiseSample({period, mode}) {
  const rate = Math.max(200, Math.round(CPU / period));
  const N = Math.min(4096, Math.round(rate * 0.3));
  const pcm = new Float32Array(N);
  let lfsr = 1;
  for (let i = 0; i < N; i++) {
    pcm[i] = (lfsr & 1) ? 0 : 2 * NOISE_PEAK;
    const fb = (lfsr & 1) ^ ((lfsr >> (mode ? 6 : 1)) & 1);
    lfsr = (lfsr >> 1) | (fb << 14);
  }
  return {pcm: dcRemove(pcm), rate, loop: null};
}
export function gbNoiseSample({shift, width, div}) {
  const per = (div ? 16 * div : 8) << shift;
  const rate = Math.max(200, Math.round(GB_CLOCK / Math.max(1, per)));
  const N = Math.min(4096, Math.round(rate * 0.3));
  const pcm = new Float32Array(N);
  let lfsr = 0;
  for (let i = 0; i < N; i++) {
    pcm[i] = ((lfsr & 1) ? 1 : -1) * GB_REF_GAIN; // gbs/apu-render.mjs: dac(15) when the LFSR's bit0 is set, dac(0) otherwise
    const x = ((lfsr ^ (lfsr >> 1)) & 1) ^ 1;
    lfsr = (lfsr & 0x7FFF) | (x << 15);
    if (width) lfsr = (lfsr & ~0x80) | (x << 7);
    lfsr >>= 1;
  }
  return {pcm: dcRemove(pcm), rate, loop: null};
}
// the real captured wavetable (32 4-bit nibbles) — a genuine sample, hashed
// like a SNES BRR sample so two songs reusing the same table share one instrument
export function waveSample(nibbles) {
  // gbs/apu-render.mjs AC-couples every channel, wave included, so a table
  // whose 32 nibbles don't average to 7.5 (most don't) loses that offset too
  const pcm = dcRemove(Float32Array.from(nibbles, v => (v - 7.5) / 7.5 * GB_REF_GAIN));
  return {pcm, rate: SAMPLE_RATE, loop: {start: 0, end: LOOP_LEN}};
}
export function waveHashOf(nibbles) { return "wave:" + sampleHash(Int16Array.from(nibbles), 1, null); }

// last write to `addr` at or before each event's startFrame, plus every
// subsequent write to that SAME address within [startFrame, endFrame) — the
// supplementary register fact reconstruct() leaves out (see header)
export function traceReg(apuLog, events, addrOf) {
  const byAddr = new Map();
  for (const w of apuLog) (byAddr.get(w.addr) || byAddr.set(w.addr, []).get(w.addr)).push(w);
  return events.map(e => {
    const ws = byAddr.get(addrOf(e)) || [];
    let onset = 0, idx = -1;
    for (let i = 0; i < ws.length; i++) { if (ws[i].frame <= e.startFrame) { onset = ws[i].value; idx = i; } else break; }
    const during = [];
    for (let i = idx + 1; i < ws.length && ws[i].frame < e.endFrame; i++) during.push([ws[i].frame - e.startFrame, ws[i].value]);
    return {onset, during};
  });
}

// per-frame level 0..1 for a NES pulse/noise note, from its onset byte +
// any explicit mid-note writes (software envelope) or the simulated
// hardware-envelope decay (240 Hz quarter-frame clock, 4 per NES frame)
export function nesLevels(kind, onset, during, nFrames) {
  const {loop, constVol, val} = decodeVolReg(onset);
  const law = kind === "noise" ? noiseLevel : pulseLevel;
  const levels = new Float64Array(nFrames);
  if (constVol) {
    const pts = [[0, val], ...during.map(([f, v]) => [f, v & 0x0F])];
    let pi = 0;
    for (let f = 0; f < nFrames; f++) { while (pi + 1 < pts.length && pts[pi + 1][0] <= f) pi++; levels[f] = law(pts[pi][1]); }
  } else {
    for (let f = 0; f < nFrames; f++) {
      const steps = Math.floor((f * 4) / (val + 1));
      levels[f] = law(loop ? 15 - (steps % 16) : Math.max(0, 15 - steps));
    }
  }
  return levels;
}
// Game Boy pulse/noise: NRx2 = initVol(4) dir(1) pace(3); dir/pace clocked
// at 64 Hz (gbs/apu-render.mjs's clockEnv); DMG DAC is linear, so level = v/15
export function gbLevels(onset, nFrames, frameSec) {
  const initVol = onset >> 4, dir = (onset >> 3) & 1, pace = onset & 7;
  const levels = new Float64Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    if (!pace) { levels[f] = initVol / 15; continue; }
    const steps = Math.floor((f * frameSec * 64) / pace);
    levels[f] = (dir ? Math.min(15, initVol + steps) : Math.max(0, initVol - steps)) / 15;
  }
  return levels;
}

// first `n` frames, normalised so onset = 1 — the instrument's identity
// (see header); a driver's own accent (how loud THIS note started) is
// deliberately divided out here and carried instead as the note's velocity.
// A note shorter than `n` frames pads by holding its last observed level —
// a fair proxy for what the register would keep reading if the note hadn't
// been cut there, and it keeps every curve the same length so a short
// staccato note and a long held one with the same shape still compare.
export function curveOf(levels, n = 16) {
  const peak = levels[0] || 1;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = round((levels[Math.min(i, levels.length - 1)] || 0) / peak, 4);
  return out;
}
// Pearson correlation of two equal-length curves. A flat (zero-variance)
// curve has no defined correlation against ANYTHING — including a curve
// that's merely CLOSE to flat (a chip envelope that barely moves in 16
// frames, e.g. the driver's first decay step landing just past the
// window), so "one side is flat" defers entirely to `meanAbsDiff` (scored
// 1 here, not 0: an early version scored this 0, which refused to merge a
// held constant-volume note with a barely-decaying one even at MAD as low
// as 0.03 — the WHOLE reason both tests exist together is so degenerate
// variance doesn't block a merge two numbers both agree looks the same).
export function pearson(a, b) {
  const n = a.length;
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  if (saa > 1e-9 && sbb > 1e-9) return sab / Math.sqrt(saa * sbb);
  return 1;
}
export function meanAbsDiff(a, b) {
  let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}
// an instrument's own stored envelope, resampled back to the same 16-frame
// curve shape curveOf produces from raw facts — so verify.mjs can find
// which instrument a freshly-picked note belongs to by the SAME similarity
// rule extraction clustered with, not by recomputing an id string (the
// clustering below is a similarity merge, not a pure function of one
// note's own facts, so there is no id to independently re-derive any more)
export function curveFromEnvelope(envelope, frameSec, n = 16) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = levelAt(envelope.points, i * frameSec, envelope.repeat);
  return out;
}

// normalised to 1 at onset — same rule as `curveOf`: the representative
// note's own accent is a performance fact (it rides on `vel`, computed
// through the same DAC law in nesSong/gbsSong), not part of the shape, so
// the envelope play.mjs multiplies vel/gain against must start at 1 too,
// or a quiet representative note would double-count its own quietness
function pointsFor(levels, frameSec) {
  const peak = levels[0] || 1;
  const pts = [];
  for (let f = 0; f < levels.length; f++) pts.push([round(f * frameSec, 5), levels[f] / peak]);
  return simplify(pts, 0.01);
}
function envelopeFor(levels, frameSec, raw) {
  const points = pointsFor(levels, frameSec);
  return {...summarize(points, RELEASE), points, repeat: null, releaseCurve: RELEASE, raw};
}

// ---- one .nsf: every track's facts collected into the album's shared bucket ----
export function nesFiles(dir) { return readdirSync(dir).filter(f => /\.nsf$/i.test(f)).sort(); }

export function nesSong(lib, dir, file, bucket, {seconds = 50, maxTracks = 40} = {}) {
  const nsf = parseNSF(readFileSync(join(dir, file)));
  lib.drivers.add("nes");
  const tracks = Math.min(nsf.songs, maxTracks);
  const results = [];
  for (let t = 1; t <= tracks; t++) {
    const title = (nsf.name || basename(file).replace(/\.nsf$/i, "")) + (nsf.songs > 1 ? " #" + t : "");
    let cap;
    try { cap = runNSF(nsf, t, seconds); } catch (e) { continue; }
    const events = nesReconstruct(cap.apuLog, cap.frames, cap.frameSec);
    lib.songs.push(title);
    collectNesFacts(bucket, cap.apuLog, events, cap.frameSec, title);
    results.push({title, notes: events.length});
  }
  return {file, tracks: results.length};
}

function collectNesFacts(bucket, apuLog, events, frameSec, title) {
  const capFrames = Math.round(HOLD_CAP / frameSec);
  const pulseEvs = events.filter(e => e.channel === "pulse1" || e.channel === "pulse2");
  const pulseTr = traceReg(apuLog, pulseEvs, e => e.channel === "pulse1" ? 0x4000 : 0x4004);
  pulseEvs.forEach((e, i) => {
    const n = capFrames; const dur = Math.max(1, e.endFrame - e.startFrame);
    const levels = nesLevels("pulse", pulseTr[i].onset, pulseTr[i].during, n);
    const {duty} = decodeVolReg(pulseTr[i].onset);
    bucket.push({console: "nes", channel: e.channel, kind: "melodic", groupKey: "duty" + DUTY_FRAC[duty], duty: DUTY_FRAC[duty],
      levels, frameSec, freq0: e.freq0, midi: e.midi, vel: velOf("pulse", decodeVolReg(pulseTr[i].onset)), title, dur});
  });
  const triEvs = events.filter(e => e.channel === "triangle");
  triEvs.forEach(e => {
    const n = capFrames; const dur = Math.max(1, e.endFrame - e.startFrame);
    bucket.push({console: "nes", channel: "triangle", kind: "melodic", groupKey: "tri",
      levels: new Float64Array(n).fill(1), frameSec, freq0: e.freq0, midi: e.midi, vel: 127, title, dur});
  });
  const noiseEvs = events.filter(e => e.channel === "noise");
  const noiseCtl = traceReg(apuLog, noiseEvs, () => 0x400E);
  const noiseVol = traceReg(apuLog, noiseEvs, () => 0x400C);
  noiseEvs.forEach((e, i) => {
    const n = capFrames; const dur = Math.max(1, e.endFrame - e.startFrame);
    const mode = (noiseCtl[i].onset >> 7) & 1, period = NOISE_PERIODS[e.midi & 0x0F];
    const levels = nesLevels("noise", noiseVol[i].onset, noiseVol[i].during, n);
    bucket.push({console: "nes", channel: "noise", kind: "drum", groupKey: "p" + period + "m" + mode,
      period, mode, levels, frameSec, midi: e.midi, vel: velOf("noise", decodeVolReg(noiseVol[i].onset)), title, dur});
  });
}
// vel conveys the note's own accent (its starting level, divided back out
// of the envelope's normalised shape — see `curveOf`'s header): through
// the SAME nonlinear DAC law as the envelope itself, not a plain regVal/15
// scale — the mixer is concave, so a plain linear vel would understate a
// quiet accent's real loudness relative to a loud one by several dB
const velOf = (kind, reg) => Math.max(1, Math.min(127, Math.round((reg.constVol ? (kind === "noise" ? noiseLevel(reg.val) : pulseLevel(reg.val)) : 1) * 127)));

// ---- one .gbs: same shape as nesSong ----------------------------------------
export function gbsFiles(dir) { return readdirSync(dir).filter(f => /\.gbs$/i.test(f)).sort(); }

export function gbsSong(lib, dir, file, bucket, {seconds = 50, maxTracks = 40} = {}) {
  const gbs = parseGBS(readFileSync(join(dir, file)));
  lib.drivers.add("gb");
  const tracks = Math.min(gbs.songs, maxTracks);
  const results = [];
  for (let t = 1; t <= tracks; t++) {
    const title = (gbs.name || basename(file).replace(/\.gbs$/i, "")) + (gbs.songs > 1 ? " #" + t : "");
    let cap;
    try { cap = runGBS(gbs, t, seconds); } catch (e) { continue; }
    const events = gbReconstruct(cap.apuLog, cap.frames, cap.frameSec);
    lib.songs.push(title);
    collectGbFacts(bucket, cap.apuLog, events, cap.frameSec, title);
    results.push({title, notes: events.length});
  }
  return {file, tracks: results.length};
}

function waveRamTimeline(apuLog) { // [{frame, ram: Uint8Array(32)}] — usually written once at init
  const ram = new Uint8Array(32);
  const snaps = [{frame: -1, ram: ram.slice()}];
  for (const w of apuLog) {
    if (w.addr < 0xFF30 || w.addr > 0xFF3F) continue;
    const i = (w.addr - 0xFF30) * 2;
    ram[i] = w.value >> 4; ram[i + 1] = w.value & 0x0F;
    snaps.push({frame: w.frame, ram: ram.slice()});
  }
  return snaps;
}
function waveRamAt(snaps, frame) {
  let ram = snaps[0].ram;
  for (const s of snaps) { if (s.frame <= frame) ram = s.ram; else break; }
  return ram;
}

function collectGbFacts(bucket, apuLog, events, frameSec, title) {
  const capFrames = Math.round(HOLD_CAP / frameSec);
  for (const kind of ["pulse1", "pulse2"]) {
    const evs = events.filter(e => e.channel === kind);
    const tr = traceReg(apuLog, evs, () => (kind === "pulse1" ? 0xFF12 : 0xFF17));
    evs.forEach((e, i) => {
      const n = capFrames; const dur = Math.max(1, e.endFrame - e.startFrame);
      const levels = gbLevels(tr[i].onset, n, frameSec);
      const duty = DUTY_FRAC[e.duty ?? 2];
      bucket.push({console: "gb", channel: kind, kind: "melodic", groupKey: "duty" + duty, duty,
        levels, frameSec, freq0: e.freq0, midi: e.midi, vel: Math.max(1, Math.min(127, Math.round((e.vol ?? 15) / 15 * 127))), title, dur});
    });
  }
  const waveEvs = events.filter(e => e.channel === "wave");
  if (waveEvs.length) {
    const snaps = waveRamTimeline(apuLog);
    for (const e of waveEvs) {
      const n = capFrames; const dur = Math.max(1, e.endFrame - e.startFrame);
      const ram = waveRamAt(snaps, e.startFrame);
      bucket.push({console: "gb", channel: "wave", kind: "melodic", groupKey: "wave:" + waveHashOf(ram), waveNibbles: ram,
        levels: new Float64Array(n).fill(1), frameSec, freq0: e.freq0, midi: e.midi,
        vel: Math.max(1, Math.min(127, Math.round((e.vol ?? 15) / 15 * 127))), title, dur});
    }
  }
  const noiseEvs = events.filter(e => e.channel === "noise");
  const tr = traceReg(apuLog, noiseEvs, () => 0xFF21);
  noiseEvs.forEach((e, i) => {
    const n = capFrames; const dur = Math.max(1, e.endFrame - e.startFrame);
    const levels = gbLevels(tr[i].onset, n, frameSec);
    bucket.push({console: "gb", channel: "noise", kind: "drum", groupKey: "s" + e.midi + "w" + (e.lfsr7 || 0),
      shift: e.midi, width: e.lfsr7 || 0, levels, frameSec, midi: e.midi,
      vel: Math.max(1, Math.min(127, Math.round((e.vol ?? 15) / 15 * 127))), title, dur});
  });
}

// ---- once every song is in: within each (console, channel, groupKey) bucket,
// merge notes whose curve is near-identical, not just identical ------------------
export const CORR_MIN = 0.97, MAD_MAX = 0.08;

// Two same-length curves "the same instrument" — a real driver's own note-to-
// note jitter (a decay step landing a frame earlier/later, a slightly different
// accent) shouldn't fragment one voicing into dozens; a genuinely different
// decay rate should still stay its own instrument. Exact-curve dedup first
// (cheap, and gives the "how common is this exact shape" count the greedy pass
// below needs), then greedy: in DESCENDING count order (the most common shapes
// seed clusters first, so a common voicing's own jitter merges into it rather
// than the reverse), a shape joins the FIRST existing cluster whose seed curve
// it matches at correlation >= 0.97 and mean absolute difference <= 0.08, else
// starts a new cluster. Once every shape is placed, each cluster's envelope
// comes from its TRUE medoid — the distinct curve, among those that made it up
// (weighted by how many notes each represents), with the least total distance
// to every other — not "whichever note happened to seed the cluster or hold
// longest", so a cluster's own outliers can't skew the shape it exports.
export function clusterByShape(facts, n = 16) {
  const dedup = new Map();
  for (const f of facts) {
    const curve = curveOf(f.levels, n), key = curve.join(",");
    let g = dedup.get(key);
    if (!g) { g = {curve, facts: []}; dedup.set(key, g); }
    g.facts.push(f);
  }
  const shapes = [...dedup.values()].sort((a, b) => b.facts.length - a.facts.length);
  const clusters = [];
  for (const g of shapes) {
    const home = clusters.find(c => pearson(c.seedCurve, g.curve) >= CORR_MIN && meanAbsDiff(c.seedCurve, g.curve) <= MAD_MAX);
    if (home) home.shapes.push(g);
    else clusters.push({seedCurve: g.curve, shapes: [g]});
  }
  for (const c of clusters) {
    let bestIdx = 0, bestScore = Infinity;
    for (let i = 0; i < c.shapes.length; i++) {
      let score = 0;
      for (let j = 0; j < c.shapes.length; j++) if (i !== j) score += (1 - pearson(c.shapes[i].curve, c.shapes[j].curve)) * c.shapes[j].facts.length;
      if (score < bestScore) { bestScore = score; bestIdx = i; }
    }
    c.facts = c.shapes.flatMap(s => s.facts);
    // the medoid shape's own longest-held member: most real driver data to build the full envelope from
    c.medoidFact = c.shapes[bestIdx].facts.slice().sort((a, b) => b.dur - a.dur)[0];
  }
  return clusters;
}

export function finishChipAlbum(lib, bucket) {
  const byGroup = new Map();
  for (const f of bucket) {
    const key = f.console + "|" + f.channel + "|" + f.groupKey;
    (byGroup.get(key) || byGroup.set(key, []).get(key)).push(f);
  }
  for (const facts of byGroup.values()) {
    const {console: console_, channel, groupKey, kind, waveNibbles} = facts[0];
    if (channel === "wave") { // identity is sample content (see header), not envelope shape — one cluster, the whole group
      const medoidFact = facts.slice().sort((a, b) => b.dur - a.dur)[0];
      buildChipInstrument(lib, {console: console_, channel, groupKey, kind, facts, waveNibbles, medoidFact});
      continue;
    }
    for (const cluster of clusterByShape(facts)) {
      buildChipInstrument(lib, {console: console_, channel, groupKey, kind, facts: cluster.facts, medoidFact: cluster.medoidFact});
    }
  }
}

// the instrument id + sample src key a (console, channel, groupKey, hash8)
// cluster resolves to. Since a cluster is now a similarity merge (its
// membership isn't a pure function of any one note), verify.mjs can't
// recompute this id independently the way SNES's verify recomputes
// sampleKeyOf's — instead it finds the best-matching instrument by curve
// (`curveFromEnvelope`), the same rule extraction itself clusters with.
export function idFor(console_, channel, groupKey, hash8, rep) {
  if (channel === "pulse1" || channel === "pulse2") {
    const dutyFrac = +groupKey.replace("duty", ""), pct = Math.round(dutyFrac * 1000) / 10;
    return {id: `${console_}:pulse:duty${pct}:env${hash8}`, src: `${console_}-pulse-duty${dutyFrac}`, kind: "melodic"};
  }
  if (channel === "triangle") return {id: `nes:triangle:env${hash8}`, src: "nes-triangle", kind: "melodic"};
  if (channel === "wave") return {id: `gb:wave:${sigOf(groupKey)}`, src: groupKey, kind: "melodic"};
  if (channel === "noise" && console_ === "nes") {
    const {period, mode} = rep;
    return {id: `nes:noise:p${period}:m${mode}:env${hash8}`, src: `nes-noise-p${period}-m${mode}`, kind: "drum-kit"};
  }
  const {shift, width} = rep; // gb noise
  return {id: `gb:noise:s${shift}:w${width}:env${hash8}`, src: `gb-noise-s${shift}-w${width}`, kind: "drum-kit"};
}

function buildChipInstrument(lib, c) {
  const facts = c.facts;
  const rep = c.medoidFact; // the cluster's medoid note — see clusterByShape's header
  const hash8 = sigOf([c.console, c.channel, c.groupKey, curveOf(rep.levels)]);
  const isNes = c.console === "nes";
  const {id, src, kind: idKind} = idFor(c.console, c.channel, c.groupKey, hash8, rep);
  let region, kind = c.kind, gain = 1;
  if (c.channel === "pulse1" || c.channel === "pulse2") {
    const dutyFrac = +c.groupKey.replace("duty", ""), pct = Math.round(dutyFrac * 1000) / 10;
    lib.offerSample(src, () => isNes ? pulseSample(dutyFrac) : gbPulseSample(dutyFrac));
    region = {keyLo: 0, keyHi: 127, rootKey: round(ROOT_KEY, 4), src, raw: {duty: pct + "%"}};
  } else if (c.channel === "triangle") {
    lib.offerSample(src, () => triangleSample());
    region = {keyLo: 0, keyHi: 127, rootKey: round(ROOT_KEY, 4), src};
  } else if (c.channel === "wave") {
    lib.offerSample(src, () => waveSample(c.waveNibbles));
    region = {keyLo: 0, keyHi: 127, rootKey: round(ROOT_KEY, 4), src};
  } else if (c.channel === "noise" && isNes) {
    const slot = Math.max(0, Math.min(127, nesNoiseSlot(rep.period)));
    lib.offerSample(src, () => noiseSample({period: rep.period, mode: rep.mode}));
    region = {keyLo: slot, keyHi: slot, rootKey: slot, fixedPitch: true, fixedKey: slot, src, raw: {period: rep.period, mode: rep.mode}};
    kind = "drum-kit";
  } else { // gb noise
    const slot = Math.max(0, Math.min(127, gbNoiseDrum(rep.shift)));
    lib.offerSample(src, () => gbNoiseSample({shift: rep.shift, width: rep.width, div: 0}));
    region = {keyLo: slot, keyHi: slot, rootKey: slot, fixedPitch: true, fixedKey: slot, src, raw: {shift: rep.shift, width: rep.width}};
    kind = "drum-kit";
  }
  const envelope = envelopeFor(rep.levels, rep.frameSec, {kind: c.console + "-" + c.channel + "-envelope", groupKey: c.groupKey, sampleCount: facts.length});
  const rec = lib.addInstrument({id, driver: c.console, bank: null, program: null, kind, pan: null, gain, velocityCurve: "linear",
    maxRatio: null, envelope, keyRegions: [region], raw: {kind: c.console + "-chip", channel: c.channel, groupKey: c.groupKey, clusterNotes: facts.length}},
    sigOf([c.console, c.channel, c.groupKey, hash8]), 1);
  const bySong = new Map();
  for (const f of facts) (bySong.get(f.title) || bySong.set(f.title, []).get(f.title)).push(f);
  for (const [title, fs] of bySong) {
    lib.use(rec, title, fs.map(f => ({key: kind === "drum-kit" ? region.keyLo : Math.round(f.midi ?? region.keyLo), secs: f.dur * f.frameSec, vel: f.vel})));
  }
}
// matches tools/nsf/midi-write.mjs's local noiseDrum: period index -> GM drum note
function nesNoiseSlot(period) {
  const idx = NOISE_PERIODS.indexOf(period);
  const i = idx < 0 ? 8 : idx;
  return i < 6 ? 42 : i < 12 ? 38 : 35;
}
