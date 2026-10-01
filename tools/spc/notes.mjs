// Stage 2 for SNES: DSP register log -> note events per voice. Same
// discovery-mode rules as tools/nsf/notes.mjs (pitch, time, duration,
// channel; nothing interpretive) with one unavoidable extra: a PITCH value
// is a playback rate, so every note is RELATIVE to its sample's root, and
// the root is an ESTIMATE (or the user's override). Events carry the
// instrument so a corrected root moves every note on it together.
import { snapBeat } from "../nsf/midi-write.mjs";
import { pitchName } from "../nsf/notes.mjs";
import { DspVoices, OFF, ATTACK } from "./dsp-state.mjs";

export { pitchName };
export const SAMPLE_RATE = 32000;
// "frame" for the SNES log: 2 ms ticks. Below any driver's timer grid (the
// fastest common timer-0 targets run ~2 ms), fine enough that the NSF loop
// detector's ±3-frame fuzz stays musically small (6 ms).
export const TICK_SEC = 0.002;
const SAMPLES_PER_TICK = SAMPLE_RATE * TICK_SEC; // 64
const SILENCE_ENV = 0x20;   // ~-36 dB: a sustain/GAIN fade below this is the note ending
const VIBRATO_CENTS = 70;   // as in the NSF pipeline: within this of the note's start pitch = the same note singing

const DEFAULT_ROOT_MIDI = 72; // the "PITCH $1000 = C5" folklore, used only when estimation fails

// ---- root estimation ------------------------------------------------------
// Period of the decoded sample in source samples -> the pitch it plays at
// PITCH = $1000 (32 kHz). Two estimators, combined:
//  - loop constraint: a looped sample's loop holds an integer number of
//    periods, so period = loopLength / k — a short discrete candidate set;
//  - NSDF autocorrelation (McLeod & Wyvill 2005) on the steady state,
//    which ranks those candidates and stands alone for one-shot samples.
// Confidence is reported, never hidden: "high" when both agree, "medium"
// for a clean single estimate, "low" for a weak peak, "none" for noise.
export function estimateRoot(inst) {
  const pcm = inst.pcm;
  const none = {periodSamples: null, rootHz: null, rootMidi: DEFAULT_ROOT_MIDI, confidence: "none", clarity: 0};
  if (!pcm || pcm.length < 16) return none; // one block: the 16-sample single-cycle synth patch is legitimate
  // analysis segment: the loop (tiled if short — exact for a loop) or the
  // body of a one-shot after its attack
  let seg;
  if (inst.looped && inst.loopLength >= 2) {
    const loop = Array.from(pcm.subarray(inst.loopStart, inst.loopStart + inst.loopLength));
    seg = [];
    while (seg.length < 4096) seg.push(...loop);
    seg = seg.slice(0, Math.max(4096, loop.length));
  } else {
    const skip = Math.floor(pcm.length * 0.1);
    seg = Array.from(pcm.subarray(skip, Math.min(pcm.length, skip + 8192)));
  }
  const N = seg.length;
  let mean = 0;
  for (const s of seg) mean += s;
  mean /= N;
  const x = new Float64Array(N);
  let energy = 0;
  for (let i = 0; i < N; i++) { x[i] = seg[i] - mean; energy += x[i] * x[i]; }
  if (energy < 1e-3) return none; // digital silence
  const maxLag = Math.min(Math.floor(N / 2), 2000); // 16 Hz floor
  if (maxLag < 2) return none;
  const nsdf = new Float64Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let acf = 0, m = 0;
    for (let i = 0; i + tau < N; i++) { acf += x[i] * x[i + tau]; m += x[i] * x[i] + x[i + tau] * x[i + tau]; }
    nsdf[tau] = m > 0 ? 2 * acf / m : 0;
  }
  const at = (lag) => { // nsdf at a fractional lag
    const lo = Math.floor(lag), hi = Math.ceil(lag);
    if (lo < 1 || hi > maxLag) return -1;
    return lo === hi ? nsdf[lo] : nsdf[lo] + (nsdf[hi] - nsdf[lo]) * (lag - lo);
  };
  // free estimate: McLeod's peak picking — first peak above 0.8 × the tallest
  const peaks = [];
  let i = 1;
  while (i < maxLag && nsdf[i] > 0) i++;      // leave the zero-lag lobe
  while (i < maxLag) {
    while (i < maxLag && nsdf[i] <= 0) i++;    // wait for a positive crossing
    let best = -1, bi = -1;
    while (i < maxLag && nsdf[i] > 0) { if (nsdf[i] > best) { best = nsdf[i]; bi = i; } i++; }
    if (bi > 0) peaks.push({lag: bi, val: best});
  }
  const refine = (p) => { // parabolic refinement around the integer peak
    const a = nsdf[p.lag - 1] ?? p.val, b = p.val, c = nsdf[p.lag + 1] ?? p.val;
    const denom = a - 2 * b + c;
    const shift = denom ? 0.5 * (a - c) / denom : 0;
    return p.lag + (Math.abs(shift) < 1 ? shift : 0);
  };
  let free = null;
  if (peaks.length) {
    const tallest = Math.max(...peaks.map(p => p.val));
    const p = peaks.find(p => p.val >= 0.8 * tallest);
    free = {period: refine(p), clarity: p.val};
  }
  // loop-constrained estimate: a peak counts only if the loop holds a whole
  // number k of it (period = L/k within tolerance) — a smooth wave
  // correlates ~1 at any tiny lag, so "high NSDF" alone would pick lag 2
  // for a sine. Two lessons from real rips (FF4/FF5/FF6/CT/ALttP,
  // 2026-09-27): (1) the long multi-period loops of string/choir samples
  // (4-15k samples) hold HUNDREDS of cycles, so k is bounded by the peak,
  // never by a fixed count — a cap of 64 forced the period up to L/64, a
  // twelfth or more too low at "high" confidence; (2) once k² > L the grid
  // of L/k is finer than a sample and says nothing about the period, so
  // the refined peak lag is the estimate (snapping to the grid biased
  // Terra's lead sample a semitone sharp). Among the candidates the pick is
  // McLeod's: the SHORTEST period whose peak reaches 0.8 of the tallest. A
  // tiled loop correlates perfectly with itself at L and at L/2 (a loop cut
  // as two identical halves), so "tallest peak" alone names the loop, not
  // the note.
  let looped = null;
  if (inst.looped && inst.loopLength >= 2 && peaks.length) {
    const L = inst.loopLength;
    const cands = [];
    for (const p of peaks) {
      const k = Math.round(L / p.lag);
      if (k < 1) continue;
      const grid = L / k;
      if (Math.abs(grid - p.lag) > Math.max(1.5, p.lag * 0.02)) continue;
      cands.push({period: k * k > L ? refine(p) : grid, k, val: Math.max(p.val, at(grid))});
    }
    if (cands.length) {
      const top = Math.max(...cands.map(c => c.val));
      const pick = cands.filter(c => c.val >= 0.8 * top && c.val >= 0.5).sort((a, b) => a.period - b.period)[0];
      if (pick) looped = {period: pick.period, clarity: pick.val, k: pick.k};
    }
  }
  let period, clarity, confidence;
  if (looped && free && Math.abs(Math.log2(looped.period / free.period)) < 0.043) { // within ~3%
    period = looped.period; clarity = Math.max(looped.clarity, free.clarity); confidence = "high";
  } else if (looped) {
    period = looped.period; clarity = looped.clarity; confidence = looped.clarity >= 0.9 ? "high" : "medium";
  } else if (free) {
    period = free.period; clarity = free.clarity;
    confidence = free.clarity >= 0.9 ? "medium" : free.clarity >= 0.6 ? "low" : "none";
  } else return none;
  // Two measurements that are real but rarely a NOTE, so their confidence is
  // capped (the estimate is still reported and used — the person decides):
  //  - a k = 1 pick on a loop longer than 1024 samples says only "the loop
  //    repeats itself" — every tiled loop correlates 1.0 at lag L — and a
  //    root under 31 Hz is a wind/cymbal loop, not a bass (FF5 "Fate in
  //    Haze": 24.4 Hz at "high", ALttP pads at 17.7 Hz);
  //  - a period under 12 samples (> 2.7 kHz) is a bright or metallic sample
  //    whose fundamental is not what the ear calls its pitch (FF5's 3.5 kHz
  //    shaker loop): the octave will be off.
  if (looped && looped.k === 1 && inst.loopLength > 1024) confidence = "low";
  if (period < 12 && confidence === "high") confidence = "medium";
  if (confidence === "none") return {...none, clarity};
  const rootHz = SAMPLE_RATE / period;
  return {periodSamples: period, rootHz, rootMidi: 69 + 12 * Math.log2(rootHz / 440), confidence, clarity};
}

// Attach a root to every captured instrument: user override first
// (roots: {key -> midi} or {srcn -> midi}), estimate otherwise.
export function resolveRoots(instruments, roots = {}) {
  const out = [];
  for (const inst of instruments.values()) {
    const override = roots[inst.key] ?? roots[inst.srcn] ?? roots[inst.id];
    const est = estimateRoot(inst);
    inst.root = override != null
      ? {...est, rootMidi: +override, rootHz: 440 * 2 ** ((+override - 69) / 12), confidence: "user"}
      : est;
    out.push(inst);
  }
  return out.sort((a, b) => a.id - b.id);
}

// noise clock (FLG bits 0-4, 0 slow .. 31 fast) -> GM drum: kick / snare / hat
function noiseDrum(clock) { return clock < 12 ? 35 : clock < 22 ? 38 : 42; }

// A NON (hardware noise generator) voice is not automatically a drum: FF4
// "Main Theme (Ocean)" keys voice 6's NOISE bit once at init and plays it as
// a ~4 s, near-silent "ocean wash" swell — a texture voice, not percussion.
// Classified the same way tools/kit-guess.mjs reads a sequence chip's drum
// channel: many hits, short relative to a beat, is a kit; few and/or long is
// a sustained/melodic voice. Named and documented here (and in
// tools/spc/INTEGRATION.md / NIGHT-ROLL.md) so the thresholds are a fact to
// check, not a buried magic number.
export const DRUM_MIN_HITS = 8;            // tools/kit-guess.mjs's own busiest-voice (hat/ride) threshold
export const DRUM_MAX_MEDIAN_DUR_SEC = 0.5; // a kit hit decays well under a beat; FF4 voice 6's median is 4.0s
// Classify every NON voice's events after the fact (needs every onset/duration
// for the voice, not just the one in hand): voices below the threshold keep
// their onset-time `drum` GM number (unchanged); voices that read as a swell
// or texture lose it — `e.drum` goes back to undefined, so toNotesTxt prints
// the pitch (same clock-derived note the drum path already computed — "pitch
// from the noise clock", per spec) and makeMidi keeps the voice on its own
// voiceN track/channel instead of folding it into a merged "drums" track.
function classifyNoiseVoices(events) {
  const byVoice = new Map();
  for (const e of events) {
    if (e.drum === undefined) continue; // not a NON voice
    (byVoice.get(e.voice) || byVoice.set(e.voice, []).get(e.voice)).push(e);
  }
  for (const evs of byVoice.values()) {
    const durs = evs.map(e => (e.endSample - e.startSample) / SAMPLE_RATE).sort((a, b) => a - b);
    const median = durs[Math.floor(durs.length / 2)];
    const percussive = evs.length >= DRUM_MIN_HITS && median < DRUM_MAX_MEDIAN_DUR_SEC;
    if (!percussive) for (const e of evs) e.drum = undefined;
  }
}

// Reconstruct per-voice note events from a capture (runSPC's result).
// onset = a KON bit (the dump's own KON register included, at sample 0); end = KOFF bit, the next KON, volume zeroed, one-shot
// sample END, or the envelope model fading below SILENCE_ENV; pitch =
// PITCH at onset relative to the instrument's root; velocity = VOL level
// × the envelope's peak (ADSR peaks at full scale; direct GAIN at its
// level). A PITCH move beyond ±70 cents mid-note splits it (legato).
export function reconstruct(capture, {roots = {}} = {}) {
  const {dspLog, dsp0, samples, instruments, ram} = capture;
  const insts = resolveRoots(instruments, roots);
  const byKey = new Map(insts.map(i => [i.key, i]));
  const regs = Uint8Array.from(dsp0);
  const dsp = new DspVoices(ram, regs);
  const events = [];
  const open = new Array(8).fill(null);
  const pending = new Array(8).fill(false); // voice had PITCH/VOL writes this sample: settle at the next sample
  const toTick = s => Math.round(s / SAMPLES_PER_TICK);

  const pitchOf = v => regs[v * 16 + 2] | ((regs[v * 16 + 3] & 0x3F) << 8);
  const levelOf = v => Math.max(Math.abs((regs[v * 16] << 24) >> 24), Math.abs((regs[v * 16 + 1] << 24) >> 24));
  const peakOf = v => (regs[v * 16 + 5] & 0x80) ? 1 : (regs[v * 16 + 7] & 0x80) ? 1 : ((regs[v * 16 + 7] & 0x7F) << 4) / 0x7FF;
  const instOf = v => {
    const srcn = regs[v * 16 + 4];
    const base = ((regs[0x5D] << 8) + srcn * 4) & 0xFFFF;
    const start = ram[base] | (ram[(base + 1) & 0xFFFF] << 8);
    return byKey.get(srcn + "@" + start.toString(16)) || null;
  };
  const midiOf = (v, pitch) => {
    const inst = instOf(v);
    const root = inst ? inst.root.rootMidi : DEFAULT_ROOT_MIDI;
    return pitch > 0 ? root + 12 * Math.log2(pitch / 4096) : null;
  };

  const close = (v, sample) => {
    const e = open[v];
    if (!e) return;
    e.endSample = sample;
    open[v] = null;
  };
  const start = (v, sample, legato) => {
    const inst = instOf(v);
    const noise = !!(regs[0x3D] & (1 << v));
    const pitch = pitchOf(v);
    const exact = noise ? null : midiOf(v, pitch);
    const level = Math.round(levelOf(v) * peakOf(v));
    const e = {
      channel: "voice" + v, voice: v,
      startSample: sample, endSample: null,
      pitch, midi: exact == null ? (noise ? noiseDrum(regs[0x6C] & 0x1F) : null) : Math.round(exact),
      cents: exact == null ? 0 : Math.round((exact - Math.round(exact)) * 100),
      instrument: inst ? inst.key : null, instrumentId: inst ? inst.id : null, srcn: regs[v * 16 + 4],
      vol: level, volEnd: level, legato,
      drum: noise ? noiseDrum(regs[0x6C] & 0x1F) : undefined, noiseClock: noise ? (regs[0x6C] & 0x1F) : undefined,
      confidence: inst ? inst.root.confidence : "none",
      // a one-shot sample with no usable root is a drum hit for every
      // practical purpose (FF6 Strago's voice 7 read as MIDI 117): the pitch
      // stays relative to the default root, and this flag lets an import
      // route the voice to the drum channel instead
      unpitched: !!inst && !inst.looped && (inst.root.confidence === "none" || inst.root.confidence === "low"),
    };
    open[v] = e;
    events.push(e);
  };
  // no ENVX-based "already sounding" pass: the dumped KON register arrives
  // as a logged KON at sample 0 (spc.mjs), the player convention

  const settle = (v) => { // PITCH/VOL writes landed: same-sample-as-onset = setup, later = vibrato/slide/fade
    pending[v] = false;
    const e = open[v];
    if (!e) return;
    const pitch = pitchOf(v);
    if (e.drum === undefined && pitch !== e.pitch) {
      if (e.pitch === 0 || e.startSample === lastSample) { // setup: adopt
        const exact = midiOf(v, pitch);
        e.pitch = pitch; e.midi = Math.round(exact); e.cents = Math.round((exact - Math.round(exact)) * 100);
      } else if (Math.abs(1200 * Math.log2(pitch / e.pitch)) >= VIBRATO_CENTS) {
        close(v, lastSample); start(v, lastSample, true);
      }
    }
    const level = Math.round(levelOf(v) * peakOf(v));
    if (level === 0) { close(v, lastSample); return; }
    if (e.startSample === lastSample) { e.vol = level; e.volEnd = level; }
    else if (level < e.volEnd) e.volEnd = level; // software fade during the note
  };

  let lastSample = 0, nextPoll = SAMPLES_PER_TICK;
  const advanceTo = (sample) => {
    for (let v = 0; v < 8; v++) if (pending[v]) settle(v);
    while (dsp.sample < sample) {
      dsp.tick();
      if (dsp.sample >= nextPoll) {
        nextPoll += SAMPLES_PER_TICK;
        for (let v = 0; v < 8; v++) {
          const e = open[v];
          if (!e) continue;
          const vc = dsp.voices[v];
          if (vc.stage === OFF) close(v, vc.endSample >= 0 ? vc.endSample : dsp.sample);
          else if (vc.stage !== ATTACK && vc.env < SILENCE_ENV && dsp.sample - e.startSample > SAMPLES_PER_TICK) close(v, dsp.sample);
        }
      }
    }
    lastSample = sample;
  };

  for (const w of dspLog) {
    if (w.sample > lastSample) advanceTo(w.sample);
    const {addr: reg, value} = w;
    const col = reg & 0x0F, v = reg >> 4;
    if (col !== 8 && col !== 9 && reg !== 0x7C) regs[reg] = value;
    if (reg === 0x4C) {
      for (let vv = 0; vv < 8; vv++) if (value & (1 << vv)) { close(vv, w.sample); }
      dsp.write(reg, value);
      for (let vv = 0; vv < 8; vv++) if (value & (1 << vv)) { start(vv, w.sample, false); pending[vv] = true; }
      continue;
    }
    if (reg === 0x5C) { for (let vv = 0; vv < 8; vv++) if (value & (1 << vv)) close(vv, w.sample); continue; }
    if (reg === 0x6C && (value & 0x80)) { for (let vv = 0; vv < 8; vv++) close(vv, w.sample); dsp.write(reg, value); continue; }
    if (reg === 0x7C) { dsp.write(reg, value); continue; }
    if (v < 8 && (col <= 3)) pending[v] = true; // VOL L/R, PITCH L/H
  }
  advanceTo(samples);
  for (let v = 0; v < 8; v++) close(v, samples);

  classifyNoiseVoices(events);

  for (const e of events) {
    e.startFrame = toTick(e.startSample);
    e.endFrame = toTick(e.endSample);
  }
  return {
    events: events.filter(e => e.midi != null && e.endFrame > e.startFrame),
    instruments: insts,
    frames: toTick(samples),
    frameSec: TICK_SEC,
  };
}

export function rootLabel(root) {
  if (!root || root.rootHz == null) return "root unknown (" + (root ? root.confidence : "none") + ")";
  const m = Math.round(root.rootMidi), c = Math.round((root.rootMidi - m) * 100);
  return `root ≈ ${pitchName(m)}${c ? (c > 0 ? "+" : "") + c + "c" : ""} (${root.rootHz.toFixed(1)} Hz, ${root.confidence})`;
}

// Stage 3: the repo's .notes.txt, with a per-instrument header so a root can
// be checked and corrected (--root k=NOTE re-dumps with every note on that
// sample shifted together).
export function toNotesTxt({events, instruments, frames, frameSec}, {bpm, tsNum = 4, tsDen = 4, title = "spc", snap = true}) {
  const beatSec = 60 / bpm;
  const beatsPerBar = tsNum * 4 / tsDen;
  const q = snap ? snapBeat : (x => Math.round(x * 100) / 100);
  const L = [];
  L.push(`# ${title} — ${tsNum}/${tsDen}, ${bpm}bpm, ${Math.ceil(frames * frameSec / (beatSec * beatsPerBar))} bars (from SPC capture)`);
  L.push("# Format: bar N: beat pitch duration-in-quarter-notes [vN = voice level 0-127 (VOL × envelope peak); iN = instrument when a voice uses several]");
  L.push("# Pitches are RELATIVE to each instrument's estimated root (the sample's own pitch at PITCH=$1000).");
  L.push("# A wrong root moves every note on that instrument by the same interval — correct it with --root <instrument>=<NOTE>.");
  L.push("# Voice identity is hardware fact. Pitches use sharp spelling; no key is stated.");
  for (const inst of instruments) {
    const loop = inst.looped ? `loop ${inst.loopLength} @${inst.loopStart}` : "one-shot";
    L.push(`# instrument ${inst.id}: sample #${inst.srcn} @$${inst.start.toString(16).padStart(4, "0")}, ${inst.pcm.length} samples, ${loop}, ${rootLabel(inst.root)}, used by voice ${[...inst.voices].sort().join(",")}`);
  }
  const byVoice = {};
  for (const e of events) (byVoice[e.channel] = byVoice[e.channel] || []).push(e);
  for (const name of Object.keys(byVoice).sort()) {
    const evs = byVoice[name];
    const used = [...new Set(evs.map(e => e.instrumentId).filter(x => x != null))].sort((a, b) => a - b);
    L.push("");
    L.push(`## ${name.replace("voice", "voice ")} — instrument${used.length === 1 ? " " + used[0] : "s " + used.join(", ")}`);
    const rows = {};
    for (const e of evs) {
      const qb = q(e.startFrame * frameSec / beatSec);
      const durBeats = q((e.endFrame - e.startFrame) * frameSec / beatSec);
      if (durBeats <= 0) continue;
      const bar = Math.floor(qb / beatsPerBar + 1e-9) + 1;
      const beat = qb - (bar - 1) * beatsPerBar + 1;
      const label = e.drum !== undefined ? "N" + e.noiseClock : pitchName(e.midi);
      (rows[bar] = rows[bar] || []).push(
        (+beat.toFixed(2)) + " " + label + " " + (+durBeats.toFixed(2)) +
        (e.vol != null ? " v" + e.vol : "") +
        (used.length > 1 && e.instrumentId != null ? " i" + e.instrumentId : ""));
    }
    for (const bar of Object.keys(rows).map(Number).sort((a, b) => a - b)) L.push("bar " + bar + ": " + rows[bar].join(", "));
  }
  return L.join("\n") + "\n";
}
