// Super Nintendo instruments: every .spc of an album run through the same
// S-DSP capture the pipeline already trusts (tools/spc/spc.mjs runSPC),
// then every key-on the DSP register log holds grouped into an
// instrument — so an instrument here is exactly what apu-render.mjs plays.
//
// SNES has no game-exposed instrument table (unlike PS1's INSTR.DAT or
// N64's tuning float): the SPC snapshot is only the sound chip's state —
// 64 KB ARAM plus DSP registers. A voice plays sample directory entry
// SRCN at pitch register P (P = 4096 is the sample's own 32 kHz rate)
// through envelope ADSR1/ADSR2 or GAIN. Per Josh's brief (2026-09-28): DO
// NOT parse the driver that maps its own instrument numbers to these —
// every game's driver differs. Instead, derive the instrument from what
// the DSP actually does: an instrument is one SAMPLE — identified by its
// decoded BRR content hash (`sampleKeyOf`), not by the per-song SRCN
// number that happened to point at it (a USF-style shared ROM/RAM this
// is not: each .spc is its own song's independent ARAM snapshot, so the
// SRCN a sample loads at is only ever a per-song accident of that
// driver's own memory layout — merging by content, the same job the
// sample table itself is deduped by, is what turns "the same guitar
// pluck at slot 12 in one song and slot 40 in the next" back into one
// instrument instead of two). Every song is captured first
// (`snesSong`, offering samples and collecting key-ons into a shared
// `bucket` keyed by that hash — see `finishSnesAlbum`); only once the
// whole album's key-ons are in one place per sample does an instrument
// get built, so a sample only three songs ever touch is judged on all
// three songs' key-ons together, not one at a time. A driver rewriting
// ADSR/GAIN per note (Rare's DKC engine does this constantly) is
// performance shaping, the same rule as vibrato or a volume ramp
// (NIGHT-ROLL.md: it stays with the song, not the instrument), so it is
// NOT part of the instrument's identity either: its envelope is the
// (ADSR1, ADSR2, GAIN) the MOST of its key-ons used across the WHOLE
// album (ties -> the most total note-seconds, `chooseEnvelope`); every
// other combination it was ever keyed on with travels as
// `raw.envelopeVariants: [{adsr1, adsr2, gain, noteCount}]` — nothing is
// lost, and verify.mjs can hold a variant note to its OWN variant rather
// than the instrument's chosen envelope (Josh, 2026-09-28, after seeing
// (SRCN, ADSR/GAIN) grouping produce 703 instruments from 59 samples on
// Donkey Kong Country — merging envelopes but still keying by a song's
// own SRCN only got that to 274; keying by sample hash instead is what
// gets DKC down near its actual 59). A drum use and a melodic use of the
// SAME sample stay separate instruments (kind keeps them apart, ids
// `spc:<hash8>:drum` / `spc:<hash8>:inst`, hash8 = the sample hash's
// first 8 hex digits) — see "Percussion" below for how they're told
// apart. `raw.srcnBySong: {songTitle: [srcn, ...]}` keeps the per-song
// slot numbers this merge discards from the identity, for anyone
// tracing a specific song's own driver back to this instrument. A
// sample that differs between songs (loop points included — a
// DIFFERENT loop is a different hash, by design) is simply never the
// same instrument; there is no reload/collision case left to handle.
//
// Pitch: rootKey is the sample's OWN measured pitch (tools/spc/notes.mjs
// estimateRoot: loop-period + NSDF autocorrelation on the decoded BRR
// audio — the only ground truth available, since the driver's intended
// note is never exposed). Per key-on, P implies a played note
// (round(rootKey + 12·log2(P/4096))); averaging that note's own implied
// root back out over every key-on of the sample's melodic use (across
// every song that plays it) refines rootKey beyond one sample's single
// estimate, and the spread across key-ons (cents) is the consistency
// check the brief asks for — > 10¢ is flagged (root estimate likely
// wrong octave, or genuinely retuned per note). Percussion: a sample
// keyed on with one exact P over >= 8 of its key-ons (album-wide) never
// varies pitch there — a drum hit, not a played note; those key-ons
// (only) become a "drum-kit" instrument, one fixedPitch region at the
// key P implies (exact, not rounded: fixedKey carries the fraction so
// playback matches P exactly) — the sample's other key-ons, if any, are
// its melodic instrument.
//
// Level: no velocity register exists on the S-DSP; a key-on's own VOL
// L/R (0..127, the same 7-bit range as MIDI velocity) stands in for it
// 1:1 — instrument gain is left at 1, velocityCurve "linear", so
// `play.mjs`'s vel/127 reproduces the captured VOL/127 exactly. Pan
// (also VOL L vs R) is a performance fact per song, not an instrument
// property (NIGHT-ROLL.md: "performance stays with the song") — left out.
// Envelope: dsp-state.mjs's own DspVoices stepped in isolation (the same
// class apu-render.mjs steps for real playback), so the shape matches
// exactly; release is the chip's fixed −8/2048 ramp from key-off,
// independent of ADSR/GAIN, ~8 ms to silence from full scale.
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { parseSPC, runSPC } from "../spc/spc.mjs";
import { DspVoices, ENV_MAX, OFF, ATTACK } from "../spc/dsp-state.mjs";
import { resolveRoots } from "../spc/notes.mjs";
import { simplify, summarize, round, sigOf } from "./model.mjs";

export const SPC_RATE = 32000;

// ---- the envelope, run by the DSP's own class (isolated: one voice, no BRR) ----------
const envCache = new Map();
export function spcEnvelope(adsr1, adsr2, gain, {maxHold = 10} = {}) {
  const key = [adsr1, adsr2, gain].join(",");
  if (envCache.has(key)) return envCache.get(key);
  const ram = new Uint8Array(0x10000); // header byte 0 everywhere: BRR position logic never trips (harmless; envelope alone is read)
  const regs = new Uint8Array(128);
  regs[5] = adsr1; regs[6] = adsr2; regs[7] = gain;
  const dsp = new DspVoices(ram, regs);
  const vc = dsp.voices[0];
  vc.stage = ATTACK; vc.env = 0; vc.counter = 0;
  const pts = [[0, 0]];
  const N = Math.round(maxHold * SPC_RATE);
  let last = -1, steady = 0, i = 0;
  for (; i < N; i++) {
    dsp.stepVoice(vc, 0);
    const lv = vc.env / ENV_MAX;
    pts.push([(i + 1) / SPC_RATE, lv]);
    if (vc.stage === OFF) break;
    if (lv === last) { if (++steady > SPC_RATE) break; } else steady = 0;
    last = lv;
  }
  // release: KOFF held from the start (regs[0x5C] bit 0), env starts full —
  // the chip's release ramp is the same −8/sample regardless of ADSR/GAIN
  const rregs = new Uint8Array(128);
  rregs[5] = adsr1; rregs[6] = adsr2; rregs[7] = gain; rregs[0x5C] = 1;
  const rdsp = new DspVoices(ram, rregs);
  const rv = rdsp.voices[0];
  rv.stage = ATTACK; rv.env = ENV_MAX;
  const rpts = [[0, 1]];
  for (let k = 0; k < SPC_RATE; k++) {
    rdsp.stepVoice(rv, 0);
    rpts.push([(k + 1) / SPC_RATE, rv.env / ENV_MAX]);
    if (rv.env <= 0) break;
  }
  const points = simplify(pts, 0.002), releaseCurve = {mode: "follow", points: simplify(rpts, 0.002)};
  const out = {...summarize(points, releaseCurve), points, repeat: null, releaseCurve,
    raw: {kind: (adsr1 & 0x80) ? "spc-adsr" : "spc-gain", adsr1, adsr2, gain}};
  envCache.set(key, out);
  return out;
}

// ---- key-on facts: a walk of the DSP write log, ADSR/GAIN/P/VOL at each KON ----------
// Mirrors tools/spc/notes.mjs's reconstruct() onset/close rules (KON, KOFF,
// next KON on the same voice, soft reset) but plain: no legato pitch-bend
// splitting, no ENVX-fade auto-close — this is "what the driver told the
// chip", not a score. `dir` (the DIR register at KON time) travels with
// each fact so verify.mjs's synthetic single-note render reads the same
// sample directory the real capture used.
export function keyOnFacts(cap) {
  const {dspLog, dsp0, ram, samples} = cap;
  const regs = Uint8Array.from(dsp0);
  const helper = new DspVoices(ram, regs); // dirEntry() only; no state stepped
  const open = new Array(8).fill(null);
  const facts = [];
  const closeAt = (v, sample) => { if (open[v]) { open[v].endSample = sample; facts.push(open[v]); open[v] = null; } };
  for (const w of dspLog) {
    const {addr: reg, value} = w, col = reg & 0x0F;
    if (col !== 8 && col !== 9 && reg !== 0x7C) regs[reg] = value;
    if (reg === 0x4C) {
      for (let v = 0; v < 8; v++) if (value & (1 << v)) {
        closeAt(v, w.sample);
        if (regs[0x3D] & (1 << v)) continue; // NON (noise): no SRCN sample backs it — not an instrument here
        const srcn = regs[v * 16 + 4];
        const {start, loop} = helper.dirEntry(srcn);
        open[v] = {
          voice: v, startSample: w.sample, endSample: null, dir: regs[0x5D],
          srcn, start, loop,
          adsr1: regs[v * 16 + 5], adsr2: regs[v * 16 + 6], gain: regs[v * 16 + 7],
          pitch: regs[v * 16 + 2] | ((regs[v * 16 + 3] & 0x3F) << 8),
          volL: (regs[v * 16] << 24) >> 24, volR: (regs[v * 16 + 1] << 24) >> 24,
        };
      }
      continue;
    }
    if (reg === 0x5C) { for (let v = 0; v < 8; v++) if (value & (1 << v)) closeAt(v, w.sample); continue; }
    if (reg === 0x6C && (value & 0x80)) { for (let v = 0; v < 8; v++) closeAt(v, w.sample); continue; }
  }
  for (let v = 0; v < 8; v++) closeAt(v, samples);
  return facts.filter(f => f.endSample > f.startSample && f.pitch > 0);
}

// content hash of a decoded BRR instrument's PCM (dedupes across songs
// whatever ARAM address it loaded at — most of an album's samples repeat).
// This IS the instrument identity (see the header) as well as the sample's
// own key in the library, so verify.mjs reuses it to find which instrument
// a note it captured independently belongs to.
export function sampleKeyOf(inst) {
  const h = createHash("sha1");
  h.update(Buffer.from(inst.pcm.buffer, inst.pcm.byteOffset, inst.pcm.byteLength));
  h.update("|" + (inst.looped ? inst.loopStart + "-" + inst.loopLength : "-"));
  return "spc:" + h.digest("hex").slice(0, 16);
}

// the (adsr1, adsr2, gain) most of a key-on set used — ties broken by total note-seconds
// held; the rest travel as `envelopeVariants` (Josh, 2026-09-28: a driver rewriting ADSR
// per note is performance shaping, same rule as vibrato/volume ramps — it doesn't belong
// on the instrument. Nothing is lost: a variant note's own envelope is still on the fact,
// and verify.mjs can render it against its own variant instead of the instrument's chosen one).
export function chooseEnvelope(keyons) {
  const byEnv = new Map();
  for (const k of keyons) {
    const ek = k.adsr1 + "," + k.adsr2 + "," + k.gain;
    const e = byEnv.get(ek) || byEnv.set(ek, {adsr1: k.adsr1, adsr2: k.adsr2, gain: k.gain, noteCount: 0, secs: 0}).get(ek);
    e.noteCount++; e.secs += (k.endSample - k.startSample) / SPC_RATE;
  }
  const ranked = [...byEnv.values()].sort((a, b) => b.noteCount - a.noteCount || b.secs - a.secs);
  return {main: ranked[0], variants: ranked.slice(1).map(({secs, ...v}) => v)};
}

// A drum use vs a melodic use of the same SRCN: the SRCN's most-played exact P (a driver's
// PITCH literal for a fixed-rate hit does not drift, so exact equality is the right test) —
// if it accounts for a clear MAJORITY of the SRCN's key-ons (>= half) and was played >= 8
// times, that's percussion (never varies there, whatever else the sample gets used for);
// everything else on the SRCN is its melodic use. The share test matters: a 4-note melodic
// loop repeats each note ~1/4 of the time — no single pitch dominates, so nothing splits off.
export function splitDrum(keyons) {
  const byPitch = new Map();
  for (const k of keyons) (byPitch.get(k.pitch) || byPitch.set(k.pitch, []).get(k.pitch)).push(k);
  let drumPitch = null, drumCount = 0;
  for (const [p, ks] of byPitch) if (ks.length > drumCount) { drumPitch = p; drumCount = ks.length; }
  const isDrum = drumCount >= 8 && drumCount / keyons.length >= 0.5;
  return {drumKeyons: isDrum ? byPitch.get(drumPitch) : [], melodicKeyons: isDrum ? keyons.filter(k => k.pitch !== drumPitch) : keyons};
}

// ---- one .spc: capture + offer samples + collect key-ons into the album's shared bucket ----
// `bucket` (owned by the caller, one per album — extractAlbum's snesFiles loop makes it and
// passes the SAME Map to every song, then calls finishSnesAlbum once after the loop) maps
// sample hash -> {sample, keyons: [{...fact, title}]}, so a sample used across many songs
// collects every song's key-ons before any instrument is built from them.
export function snesSong(lib, dir, file, bucket, {maxSeconds = 90} = {}) {
  const bytes = readFileSync(join(dir, file));
  const spc = parseSPC(bytes);
  const title = spc.name || (spc.tags && spc.tags.title) || basename(file).replace(/\.spc$/i, "");
  const seconds = Math.max(20, Math.min((spc.tags.seconds || 45) + (spc.tags.fadeMs || 0) / 1000, maxSeconds));
  const cap = runSPC(spc, seconds);
  lib.songs.push(title);
  lib.drivers.add("spc");

  const insts = resolveRoots(cap.instruments); // attaches .root {rootMidi, rootHz, confidence, ...} per (srcn, start)
  const byKey = new Map(insts.map(i => [i.key, i]));
  const facts = keyOnFacts(cap);
  if (cap.instruments.size && !facts.length) lib.warn(`${title}: every key-on played a noise-generator voice (FLG/NON) — no sample instrument to extract`);

  for (const f of facts) {
    const sample = byKey.get(f.srcn + "@" + f.start.toString(16));
    if (!sample) continue; // a key-on the capture never decoded (should not happen: same log, same dirEntry math)
    const hash = sampleKeyOf(sample);
    lib.offerSample(hash, () => ({pcm: sample.pcm, rate: SPC_RATE,
      loop: sample.looped && sample.loopLength ? {start: sample.loopStart, end: sample.loopStart + sample.loopLength} : null}), 1);
    let b = bucket.get(hash);
    if (!b) { b = {sample, keyons: []}; bucket.set(hash, b); }
    b.keyons.push({...f, title});
  }
  return {title, notes: facts.length};
}

// ---- once every song is captured: one instrument per (sample hash, kind) ------------------
export function finishSnesAlbum(lib, bucket) {
  for (const [hash, {sample, keyons}] of bucket) {
    const {drumKeyons, melodicKeyons} = splitDrum(keyons);
    buildInstrument(lib, hash, sample, drumKeyons, "drum-kit");
    buildInstrument(lib, hash, sample, melodicKeyons, "melodic");
  }
}

function buildInstrument(lib, hash, sample, keyons, kind) {
  if (!keyons.length) return;
  const src = hash;
  const {main, variants} = chooseEnvelope(keyons);
  const env = spcEnvelope(main.adsr1, main.adsr2, main.gain);
  const root = sample.root; // the sample's own measured native pitch
  const id = `spc:${hash.slice(4, 12)}:${kind === "drum-kit" ? "drum" : "inst"}`; // hash is "spc:<16 hex>"; hash8 = its first 8
  const pitches = keyons.map(k => k.pitch);
  const srcnBySong = {};
  for (const k of keyons) { const a = srcnBySong[k.title] || (srcnBySong[k.title] = []); if (!a.includes(k.srcn)) a.push(k.srcn); }
  for (const t of Object.keys(srcnBySong)) srcnBySong[t].sort((a, b) => a - b);

  let regions, notesFor;
  if (kind === "drum-kit") {
    const pMed = pitches.slice().sort((a, b) => a - b)[pitches.length >> 1];
    const fixedKey = root.rootMidi + 12 * Math.log2(pMed / 4096);
    const slot = Math.max(0, Math.min(127, Math.round(fixedKey)));
    regions = [{keyLo: slot, keyHi: slot, rootKey: round(root.rootMidi, 4), fixedPitch: true, fixedKey: round(fixedKey, 4), src,
      raw: {pitch: pMed, rootConfidence: root.confidence}}];
    notesFor = k => ({key: slot, slot, secs: (k.endSample - k.startSample) / SPC_RATE, vel: velOf(k)});
  } else {
    // each key-on's own implied root: round(rootMidi + 12log2(P/4096)) − 12log2(P/4096); averaging refines rootMidi, the spread is the consistency check
    const impliedRoots = pitches.map(p => Math.round(root.rootMidi + 12 * Math.log2(p / 4096)) - 12 * Math.log2(p / 4096));
    const rootKey = round(impliedRoots.reduce((a, b) => a + b, 0) / impliedRoots.length, 4);
    const spreadCents = (Math.max(...impliedRoots) - Math.min(...impliedRoots)) * 100;
    if (spreadCents > 10) lib.warn(`instrument ${id} key-ons disagree on root by ${spreadCents.toFixed(1)}¢ across ${Object.keys(srcnBySong).length} song(s) (sample root ${root.rootHz ? root.rootHz.toFixed(1) + " Hz" : "unknown"}, confidence ${root.confidence})`);
    if (root.confidence === "none" || root.confidence === "low") lib.warn(`instrument ${id}'s root pitch is a weak measurement (confidence ${root.confidence}) — its tuning may be off`);
    regions = [{keyLo: 0, keyHi: 127, rootKey, src, raw: {rootConfidence: root.confidence, rootHz: root.rootHz ? round(root.rootHz, 2) : null}}];
    notesFor = k => ({key: Math.round(rootKey + 12 * Math.log2(k.pitch / 4096)), secs: (k.endSample - k.startSample) / SPC_RATE, vel: velOf(k)});
  }
  const rec = lib.addInstrument({id, driver: "spc", bank: null, program: null, kind, pan: null, gain: 1, velocityCurve: "linear",
    maxRatio: null, envelope: env, keyRegions: regions,
    raw: {kind: "spc-instrument", srcnBySong, adsr1: main.adsr1, adsr2: main.adsr2, gain: main.gain, sampleLooped: sample.looped,
      ...(variants.length ? {envelopeVariants: variants} : {})}},
    sigOf([hash, kind, main.adsr1, main.adsr2, main.gain]), 1);
  const bySong = new Map();
  for (const k of keyons) (bySong.get(k.title) || bySong.set(k.title, []).get(k.title)).push(k);
  for (const [title, ks] of bySong) lib.use(rec, title, ks.map(notesFor));
}
const velOf = k => Math.max(1, Math.min(127, Math.round((Math.abs(k.volL) + Math.abs(k.volR)) / 2)));

export function snesFiles(dir) { return readdirSync(dir).filter(f => /\.spc$/i.test(f)).sort(); }
