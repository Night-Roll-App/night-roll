// The driver-neutral instrument library (Josh, 2026-09-28: use the
// instruments of any imported game in his own songs). Each driver family's
// extractor (psx.mjs, n64.mjs) reads its own bank with the readers the
// capture and render already use and hands observations to a Library; the
// Library merges them across the album's songs, deduplicates samples by
// content, and writes instruments.json + one WAV per sample.
//
// instruments.json (format "night-roll-instruments", version 1):
//   {format, version, slug, title, drivers: [..], songs: N,
//    notes: "...",                       what the numbers mean (below)
//    instruments: [Instrument], samples: {hash: Sample}}
//   Instrument = {id, driver, bank, program, kind: "melodic" | "drum-kit",
//     used, usedIn: [song titles], noteCount, keysPlayed: {lo, hi, median} | null,
//     nameGuess, features: {...numbers}, pan: -1..1 | null, gain,
//     velocityCurve: "linear" | "square", maxRatio | null,
//     envelope: Envelope, keyRegions: [Region], raw: {driver record}}
//   Region = {keyLo, keyHi, velLo?, velHi?, rootKey, sample: hash | null,
//     loop: {start, end} | null, gain?, pan?, envelope?, fixedPitch?,
//     nameGuess?, features?, raw?}
//   Envelope = {attack, decay, sustain, release   (seconds / level 0..1: a summary for any sampler),
//     points: [[t, level], ...]  the driver's own held-key shape, amplitude, piecewise linear, t from key-on,
//     repeat: {from, to} | null  a looping envelope cycles between these times,
//     releaseCurve: {mode: "follow" | "exp-time", seconds, points?, floor?},
//     raw: the driver's envelope record}
//   Sample = {rate, length, loop: {start, end} | null, bytes, file: "<hash>.wav", partial?}
//
// Pitch: a region plays its sample at the sample's native rate on key
// `rootKey` (fractional = the driver's fine tune) — ratio 2^((key − rootKey)/12).
// A fixedPitch region (a kit slot) sounds its one pitch whatever key plays it.
// Level: sample (−1..1) × region gain (else the instrument's) × velocity
// (v/127, or (v/127)² for "square") × the envelope. Gains are the driver
// renderer's own output scale, so the extracted note matches that renderer.
// Loops are sample indices, end exclusive (the WAV's smpl chunk stores end − 1,
// which is that format's inclusive convention).
import { createHash } from "node:crypto";

export const FORMAT = "night-roll-instruments";
export const VERSION = 1;

// ---- envelope shapes ---------------------------------------------------------
// Ramer–Douglas–Peucker on [t, level] points: keeps the shape within `tol`
// near full level and within 2% (0.17 dB) of the level below that, so an
// exponential tail keeps its shape in dB, with a few dozen breakpoints
// instead of one per update.
export function simplify(points, tol = 0.002) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ta, la] = points[a], [tb, lb] = points[b];
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const [t, l] = points[i];
      const lin = tb > ta ? la + (lb - la) * (t - ta) / (tb - ta) : la;
      const d = Math.abs(l - lin) / Math.min(tol, Math.max(0.02 * Math.max(l, lin), 1e-6));
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > 1) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]).map(([t, l]) => [round(t, 5), l < 0.01 ? +l.toPrecision(4) : round(l, 5)]);
}
export const round = (x, d = 4) => { const k = Math.pow(10, d); return Math.round(x * k) / k; };

// piecewise-linear level at t (after the last point: the last level; inside a
// repeat window past its end: wrapped)
export function levelAt(points, t, repeat = null) {
  if (!points.length) return 1;
  if (repeat && repeat.to > repeat.from && t > repeat.to) t = repeat.from + ((t - repeat.from) % (repeat.to - repeat.from));
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, l1] = points[i];
    if (t <= t1) { const [t0, l0] = points[i - 1]; return t1 > t0 ? l0 + (l1 - l0) * (t - t0) / (t1 - t0) : l1; }
  }
  return points[points.length - 1][1];
}

// The summary a plain sampler takes (SFZ's ampeg_attack/decay/sustain/release):
// attack = time to the peak; sustain = where the held shape settles (the last
// point; a shape still falling at the end of the sampled window settles at 0);
// decay = peak → within 1% of that sustain (or −60 dB when it falls to 0);
// release = full level → −60 dB along the release curve.
export function summarize(points, releaseCurve, repeat = null) {
  let peak = 0, tPeak = 0;
  for (const [t, l] of points) if (l > peak + 1e-9) { peak = l; tPeak = t; }
  const last = points.length ? points[points.length - 1] : [0, 1];
  const prev = points.length > 1 ? points[points.length - 2] : last;
  const falling = !repeat && last[1] < prev[1] - 1e-6;
  const sustain = falling ? 0 : peak > 0 ? last[1] / peak : 0;
  const floor = sustain > 0 ? sustain * peak * 1.01 : peak * 0.001;
  let tDecay = null;
  for (const [t, l] of points) if (t >= tPeak && l <= floor) { tDecay = t; break; }
  if (tDecay == null) tDecay = falling ? extrapolateTo(points, peak * 0.001) : last[0];
  const release = releaseSeconds(releaseCurve);
  return {attack: round(tPeak, 4), decay: round(Math.max(0, tDecay - tPeak), 4), sustain: round(Math.min(1, sustain), 4), release: round(release, 4)};
}
function extrapolateTo(points, target) {
  // a shape cut off while falling: continue its last segment's rate in dB
  const n = points.length;
  const [t0, l0] = points[Math.max(0, n - 2)], [t1, l1] = points[n - 1];
  if (!(l1 > 0) || !(l0 > l1) || t1 <= t0) return t1;
  const dbPerSec = 20 * Math.log10(l0 / l1) / (t1 - t0);
  return t1 + 20 * Math.log10(l1 / target) / dbPerSec;
}
export function releaseSeconds(rc) {
  if (!rc) return 0;
  if (rc.mode === "exp-time") return rc.seconds;
  const pts = rc.points || [];
  for (const [t, l] of pts) if (l <= 0.001) return t;
  return pts.length ? pts[pts.length - 1][0] : 0;
}

// ---- samples -----------------------------------------------------------------
// 16-bit PCM from floats (−1..1) or Int16Array; exact for decoded ADPCM
export function toInt16(pcm) {
  if (pcm instanceof Int16Array) return pcm;
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32768)));
  return out;
}
export function toFloat(pcm) {
  if (pcm instanceof Float32Array) return pcm;
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
}
export function sampleHash(i16, rate, loop) {
  const h = createHash("sha256");
  h.update(Buffer.from(i16.buffer, i16.byteOffset, i16.byteLength));
  h.update(`|${rate}|${loop ? loop.start + "-" + loop.end : "-"}`);
  return h.digest("hex").slice(0, 16);
}
export const sigOf = x => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 8);

// RIFF WAVE, 16-bit mono, with a `smpl` chunk (unity note + one forward loop)
export function wavBytes(i16, rate, {loop = null, rootKey = 60} = {}) {
  const dataLen = i16.length * 2;
  const smplLen = 36 + (loop ? 24 : 0);
  const total = 4 + (8 + 16) + (8 + dataLen + (dataLen & 1)) + (8 + smplLen);
  const b = Buffer.alloc(8 + total);
  let o = 0;
  const str = s => { b.write(s, o, "ascii"); o += 4; };
  const u32 = v => { b.writeUInt32LE(v >>> 0, o); o += 4; };
  const u16 = v => { b.writeUInt16LE(v, o); o += 2; };
  str("RIFF"); u32(total); str("WAVE");
  str("fmt "); u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16);
  str("data"); u32(dataLen);
  for (let i = 0; i < i16.length; i++) { b.writeInt16LE(i16[i], o); o += 2; }
  if (dataLen & 1) o++;
  const unity = Math.max(0, Math.min(127, Math.floor(rootKey)));
  const frac = Math.min(0xFFFFFFFF, Math.max(0, Math.round((rootKey - unity) * 0x100000000))) >>> 0; // MIDIPitchFraction: the sample sounds this far above the unity note
  str("smpl"); u32(smplLen);
  u32(0); u32(0); u32(Math.round(1e9 / rate)); u32(unity); u32(frac); u32(0); u32(0);
  u32(loop ? 1 : 0); u32(0);
  if (loop) { u32(0); u32(0); u32(loop.start); u32(Math.max(loop.start, loop.end - 1)); u32(0); u32(0); }
  return b;
}
// -> {rate, pcm: Int16Array, loop: {start, end} | null, rootKey}
export function readWav(buf) {
  const b = Buffer.from(buf);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV");
  let o = 12, rate = 0, pcm = null, loop = null, rootKey = null;
  while (o + 8 <= b.length) {
    const id = b.toString("ascii", o, o + 4), len = b.readUInt32LE(o + 4), p = o + 8;
    if (id === "fmt ") rate = b.readUInt32LE(p + 4);
    else if (id === "data") { pcm = new Int16Array(len >> 1); for (let i = 0; i < pcm.length; i++) pcm[i] = b.readInt16LE(p + i * 2); }
    else if (id === "smpl") {
      const unity = b.readUInt32LE(p + 12), frac = b.readUInt32LE(p + 16);
      rootKey = unity + frac / 0x100000000;
      if (b.readUInt32LE(p + 28) > 0) loop = {start: b.readUInt32LE(p + 36 + 8), end: b.readUInt32LE(p + 36 + 12) + 1};
    }
    o = p + len + (len & 1);
  }
  return {rate, pcm, loop, rootKey};
}

// ---- the library a run builds ----------------------------------------------------
// Samples arrive keyed by where the driver keeps them (`srcKey`, e.g. a ROM
// address): a USF rip holds only the bytes the game read while that song was
// ripped, so the same sample may be partial in one song and whole in another;
// the best copy wins, and content hashes are taken once everything is in.
export class Library {
  constructor({slug = "", title = ""} = {}) {
    this.slug = slug; this.title = title;
    this.inst = new Map();   // id -> instrument (with region.src = sample srcKey until finish())
    this.src = new Map();    // srcKey -> {pcm, rate, loop, coverage}
    this.songs = [];
    this.drivers = new Set();
    this.warnings = [];
    this.collisions = 0;
  }
  warn(w) { if (!this.warnings.includes(w)) this.warnings.push(w); }
  // offer a sample: kept when it is the first, or more complete than the one held
  offerSample(srcKey, getter, coverage = 1) {
    const cur = this.src.get(srcKey);
    if (cur && cur.coverage >= coverage) return;
    const s = getter();
    if (!s || !s.pcm || !s.pcm.length) return;
    this.src.set(srcKey, {...s, coverage});
  }
  // an instrument as one song's bank describes it. `sig` is the driver
  // record's identity: the same id with a different record (a bank slot
  // reloaded with another instrument between songs) becomes a separate
  // instrument, id suffixed with the record's signature.
  // `complete` (0..1): how much of the record the rip really holds — a USF
  // rip reads absent bytes as zeros, so an incomplete copy differs from the
  // whole one without being another instrument; the most complete copy wins.
  addInstrument(inst, sig, complete = 1) {
    let id = inst.id;
    const cur = this.inst.get(id);
    if (cur && cur._sig !== sig) {
      if (complete < 1 || cur._complete < 1) {
        if (complete > cur._complete) { const {usedIn, noteCount, used, ...content} = inst; Object.assign(cur, content, {id, _sig: sig, _complete: complete}); }
        return cur;
      }
      id = inst.id + "~" + sig;
      if (!this.inst.has(id)) this.collisions++;
    }
    if (!this.inst.has(id)) this.inst.set(id, {...inst, id, _sig: sig, _complete: complete, usedIn: [], noteCount: 0, _keys: [], _durs: [], _vels: [], used: false});
    return this.inst.get(id);
  }
  // a song played notes on an instrument: keys (MIDI), seconds held, velocities
  use(rec, song, notes) {
    if (!notes.length) return;
    rec.used = true;
    if (!rec.usedIn.includes(song)) rec.usedIn.push(song);
    rec.noteCount += notes.length;
    for (const n of notes) { rec._keys.push(n.key); rec._durs.push(n.secs); rec._vels.push(n.vel); if (n.slot != null) (rec._slots || (rec._slots = new Map())).set(n.slot, ((rec._slots.get(n.slot)) || 0) + 1); }
  }
  // content hashes, sample table, played-key facts; drops helper fields
  finish() {
    const bySrc = new Map(), samples = {};
    for (const [key, s] of this.src) {
      const i16 = toInt16(s.pcm);
      const loop = s.loop && s.loop.end > s.loop.start ? {start: s.loop.start, end: Math.min(s.loop.end, i16.length)} : null;
      const hash = sampleHash(i16, s.rate, loop);
      bySrc.set(key, hash);
      if (!samples[hash]) samples[hash] = {rate: s.rate, length: i16.length, loop, bytes: 0, file: hash + ".wav", _i16: i16, _f32: toFloat(s.pcm), ...(s.coverage < 0.999 ? {partial: round(s.coverage, 3)} : {})};
    }
    const instruments = [];
    for (const rec of this.inst.values()) {
      for (const r of rec.keyRegions) {
        r.sample = r.src != null && bySrc.has(r.src) ? bySrc.get(r.src) : null;
        const smp = r.sample ? samples[r.sample] : null;
        r.loop = smp ? smp.loop : null;
        delete r.src;
        if (!r.sample) r.missing = true; else delete r.missing;
      }
      // a region repeats the instrument's envelope only where it differs
      const envSig = JSON.stringify(rec.envelope);
      for (const r of rec.keyRegions) if (r.envelope && (r.envelope === rec.envelope || JSON.stringify(r.envelope) === envSig)) delete r.envelope;
      // an unused slot whose samples no song carries has nothing to play
      if (!rec.used && !rec.keyRegions.some(r => r.sample)) { this.droppedUnused = (this.droppedUnused || 0) + 1; continue; }
      const ks = rec._keys.slice().sort((a, b) => a - b);
      rec.keysPlayed = ks.length ? {lo: ks[0], hi: ks[ks.length - 1], median: ks[ks.length >> 1]} : null;
      const ds = rec._durs.slice().sort((a, b) => a - b), vs = rec._vels.slice().sort((a, b) => a - b);
      rec._stats = {medianSeconds: ds.length ? ds[ds.length >> 1] : null, medianVel: vs.length ? vs[vs.length >> 1] : null, slots: rec._slots ? [...rec._slots] : []};
      instruments.push(rec);
    }
    const refd = new Set(instruments.flatMap(r => r.keyRegions.map(x => x.sample).filter(Boolean)));
    for (const h of Object.keys(samples)) if (!refd.has(h)) delete samples[h];
    instruments.sort((a, b) => (b.used - a.used) || a.id.localeCompare(b.id, undefined, {numeric: true}));
    this.instruments = instruments; this.samples = samples;
    return this;
  }
  // the JSON document (samples referenced by hash; `bytes` = the WAV's size)
  toJSON() {
    const samples = {};
    for (const [h, s] of Object.entries(this.samples)) {
      const {_i16, _f32, ...rest} = s;
      samples[h] = {...rest, bytes: 44 + 8 + 36 + (s.loop ? 24 : 0) + _i16.length * 2 + (_i16.length * 2 & 1)};
    }
    const clean = rec => {
      const {_sig, _complete, _keys, _durs, _vels, _slots, _stats, _entries, ...rest} = rec;
      return rest;
    };
    return {format: FORMAT, version: VERSION, slug: this.slug, title: this.title, drivers: [...this.drivers], songs: this.songs.length,
      notes: "rootKey: the key that plays the sample at its native rate (fractional = fine tune). Level = sample × gain × velocity curve × envelope, in the driver renderer's own scale. Envelope points are amplitude while the key is held; releaseCurve 'follow' continues along its points from the level at key-off, 'exp-time' falls exponentially to its floor over its seconds. Kit regions are keyed by the driver's own slot number. nameGuess is a measured guess, never a fact; features are the measurements.",
      instruments: this.instruments.map(clean), samples, ...(this.warnings.length ? {warnings: this.warnings} : {})};
  }
}

// the plain summary: seconds of a note's pieces, from tick facts
export function median(xs) { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[s.length >> 1]; }
