// Nintendo 64 instruments: every mini of a USF set through the capture's own
// sequence finder (tools/n64/capture.mjs sequenceOfSet), then the banks that
// sequence names read with the renderer's readers — so an instrument here is
// what renderN64 plays.
//
// EAD, sm64 generation (Super Mario 64): readBank per bank id the sequence
//   uses. An instrument = its three key regions (low / normal / high AudioBankSound,
//   split at normalRangeLo/Hi, semitone + 21 = MIDI), its envelope and release
//   rate. The kit = the bank's drums, a region per drum index (the slot the
//   sequence plays), each at its own fixed tuning, pan and envelope.
//   ids ead-sm64:bank<b>:inst<i>, ead-sm64:bank<b>:drums.
// EAD, oot generation (Ocarina of Time, Majora's Mask): readFont per font id,
//   the same shape with the font's decay index for the release.
//   ids ead-oot:font<f>:inst<i>, ead-oot:font<f>:drums.
// Rare (GoldenEye, Banjo-Kazooie, DK64, Diddy Kong Racing, Jet Force Gemini):
//   readRareBank on the bank the song plays (libaudio ALBank in RAM). An
//   instrument = its ALSounds, each a key/velocity region with its own
//   envelope; a kit is an instrument whose every key map is one key
//   (isKitInstrument). id rare:bank@<RAM address>:prog<p>.
//
// A USF rip keeps only the bytes the game read while that song was ripped:
// a sample may be whole in one mini and absent in another. Samples are keyed
// by their ROM address and the most complete copy over the album wins; a
// region whose sample no mini carries says `missing`. Unused instruments of a
// used bank are kept only when their samples are whole somewhere.
//
// Neutral form: rootKey = 60 − 12·log2(tuning) (EAD: gNoteFrequencies ×
// tuning, native rate 32000 Hz), keyBase − detune/100 (Rare, native rate =
// the bank's). Level: EAD velocity² with the envelope's own level squared
// (sm64: (level × 4.3498e-5)², oot: the ADSR's float), Rare velocity × the
// sound's and instrument's volumes × its envelope.
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { loadUSF, rdramOf } from "../n64/usf.mjs";
import { sequenceOfSet } from "../n64/capture.mjs";
import { tickSeconds } from "../n64/seq-libultra.mjs";
import { findAudioFiles, readBank, readFont, ootMemory, DEFAULT_RELEASE_RATE, OOT_DEFAULT_DECAY_INDEX } from "../n64/bank.mjs";
import { Adsr, OotAdsr, ootDecayRate, UPDATES_PER_SECOND, OOT_UPDATES_PER_SECOND, N64_RATE } from "../n64/render.mjs";
import { findRareBanks, readRareBank, isKitInstrument, envelopeGain, ENV_FLOOR } from "../n64/rare.mjs";
import { simplify, summarize, round, sigOf } from "./model.mjs";

const VOL_SCALE = 4.3498e-5; // render.mjs process_notes: adsr level → ~1/23000 (the render's constant)
const SM64_CAP = 3.99992, OOT_CAP = 3.99996;

// ---- envelopes, run by the renderer's own classes -------------------------------------
const envCache = new Map();
// sm64: Adsr per update (240/s); the render's gain reaches update k's value at (k+1)/240
export function sm64Envelope(pairs, releaseRate, {maxHold = 12} = {}) {
  const key = "s" + JSON.stringify(pairs) + "/" + releaseRate;
  if (envCache.has(key)) return envCache.get(key);
  const amp = e => Math.min(32767, 127 * 127 * (e * VOL_SCALE) * (e * VOL_SCALE)) / 32767;
  const {points, repeat} = runUpdates(new Adsr(pairs), UPDATES_PER_SECOND, maxHold, amp);
  const rel = [[0, 1]];
  if (releaseRate > 0) {
    let e = 32767; const fade = releaseRate * 24;
    for (let k = 1; k < UPDATES_PER_SECOND * 60; k++) { e -= fade; if (e < 100) { rel.push([k / UPDATES_PER_SECOND, 0]); break; } rel.push([k / UPDATES_PER_SECOND, amp(e)]); }
  } else rel.push([60, 1]);
  const releaseCurve = {mode: "follow", points: simplify(rel, 0.002)};
  const out = {...summarize(points, releaseCurve, repeat), points, repeat, releaseCurve, raw: {kind: "ead-adsr", pairs, releaseRate}};
  envCache.set(key, out);
  return out;
}
export function ootEnvelope(pairs, decayIndex, {maxHold = 12} = {}) {
  const key = "o" + JSON.stringify(pairs) + "/" + decayIndex;
  if (envCache.has(key)) return envCache.get(key);
  const {points, repeat} = runUpdates(new OotAdsr(pairs), OOT_UPDATES_PER_SECOND, maxHold, a => a);
  const fade = ootDecayRate(decayIndex);
  const rel = fade > 0 ? [[0, 1], [round(1 / (fade * OOT_UPDATES_PER_SECOND), 5), 0]] : [[0, 1], [60, 1]];
  const releaseCurve = {mode: "follow", points: rel};
  const out = {...summarize(points, releaseCurve, repeat), points, repeat, releaseCurve, raw: {kind: "ead-oot-adsr", pairs, decayIndex}};
  envCache.set(key, out);
  return out;
}
function runUpdates(adsr, ups, maxHold, amp) {
  const pts = [[0, 0]];
  const firstAt = new Map();
  let repeat = null, steady = 0, last = -1, prevIndex = adsr.index;
  for (let k = 0; k < ups * maxHold; k++) {
    const lv = amp(adsr.update());
    const t = (k + 1) / ups;
    pts.push([t, lv]);
    if (!firstAt.has(adsr.index)) firstAt.set(adsr.index, k / ups);
    if (adsr.index < prevIndex && firstAt.has(adsr.index)) { repeat = {from: round(firstAt.get(adsr.index), 5), to: round(t, 5)}; break; } // a goto: the shape cycles
    prevIndex = adsr.index;
    if (adsr.done) { pts.push([t + 1 / ups, 0]); break; }
    if (lv === last) { if (++steady > ups) break; } else steady = 0;
    last = lv;
  }
  return {points: simplify(pts, 0.002), repeat};
}
// Rare: envelopeGain (the SDK's exponential alSynSetVol ramps), sampled at 2 kHz
export function rareEnvelope(env) {
  const e = env || {attackTime: 0, decayTime: -1, releaseTime: 0, attackVolume: 127, decayVolume: 127};
  const key = "r" + JSON.stringify([e.attackTime, e.decayTime, e.releaseTime, e.attackVolume, e.decayVolume]);
  if (envCache.has(key)) return envCache.get(key);
  const R = 2000, hold = R * 12, buf = new Float32Array(hold + R * 12);
  envelopeGain(e, R, hold, buf);
  const pts = []; // envelopeGain's value k is the gain AT output sample k (a 0 attack starts at full level)
  let steady = 0;
  for (let i = 0; i < hold; i++) { pts.push([i / R, buf[i]]); if (i && buf[i] === buf[i - 1]) { if (++steady > R) break; } else steady = 0; }
  const releaseCurve = {mode: "exp-time", seconds: round(Math.max(1, Math.round((e.releaseTime || 0) / 1e6 * R)) / R, 5), floor: ENV_FLOOR};
  const points = simplify(pts, 0.002);
  const out = {...summarize(points, releaseCurve), points, repeat: null, releaseCurve,
    raw: {kind: "libaudio-alenvelope", attackTime: e.attackTime, decayTime: e.decayTime, releaseTime: e.releaseTime, attackVolume: e.attackVolume, decayVolume: e.decayVolume}};
  envCache.set(key, out);
  return out;
}

// an envelope the rip never held reads as zeros: its first pair ends it at once
const envWhole = pairs => pairs && pairs.length && pairs[0][0] !== 0 ? 1 : 0;
const rootOfTuning = t => round(60 - 12 * Math.log2(t), 4);
const slotRoot = (slot, t) => round(slot - 12 * Math.log2(t), 4);

// ---- one USF mini -----------------------------------------------------------------------
export function n64Song(lib, dir, file, libFiles) {
  const mini = {name: file, bytes: new Uint8Array(readFileSync(join(dir, file)))};
  const set = loadUSF([mini, ...libFiles]);
  const title = (set.tags && set.tags.title) || basename(file).replace(/\.miniusf$/i, "");
  const {seq, res, loc} = sequenceOfSet(set);
  lib.songs.push(title);
  const secs = n => tickSeconds(res.tempos, n.tick + n.dur) - tickSeconds(res.tempos, n.tick);
  if (res.driver === "rare" || loc.gen === "rare") return rareSong(lib, title, set, seq, res, secs);
  if (loc.gen === "oot") return eadSong(lib, title, set, seq, res, secs, "oot", loc);
  return eadSong(lib, title, set, seq, res, secs, "sm64", loc);
}

function eadSong(lib, title, set, seq, res, secs, gen, loc) {
  const driver = "ead-" + gen;
  lib.drivers.add(driver);
  const mem = gen === "oot" ? ootMemory(set) : null;
  const files = gen === "sm64" ? findAudioFiles(set.rom, loc) : null;
  const banks = new Map();
  const bankOf = i => {
    const id = seq.banks[i] != null ? seq.banks[i] : seq.banks[0];
    if (!banks.has(id)) { try { banks.set(id, gen === "oot" ? readFont(set, loc, id, {mem}) : readBank(set.rom, files, id)); } catch (e) { lib.warn(`${title}: ${gen === "oot" ? "font" : "bank"} ${id}: ${e.message}`); banks.set(id, null); } }
    return banks.get(id);
  };
  const cap = gen === "oot" ? OOT_CAP : SM64_CAP;
  const envOf = (pairs, rel) => gen === "oot" ? ootEnvelope(pairs, rel) : sm64Envelope(pairs, rel);
  const where = gen === "oot" ? "font" : "bank";
  // a sample, offered by ROM address; unused instruments only offer whole ones
  const offer = (bank, rec, minCov) => {
    if (!rec || rec.rom == null) return null;
    if (gen === "oot" && rec.codec !== 0) return null;
    const key = `${gen}:${rec.rom}:${rec.samples}`;
    const cov = rec.dataPresent || 0;
    // a sample the renderer cannot decode (its codebook not in the rip) plays silent there; here it is left out, the rest of the song kept
    if (cov >= minCov && cov > 0) lib.offerSample(key, () => { try { const s = bank.pcm(rec); return {pcm: s.pcm, rate: N64_RATE, loop: s.looping ? {start: s.loopStart, end: s.loopEnd} : null}; } catch (e) { lib.warn(`${driver}: sample at ROM 0x${rec.rom.toString(16)}: ${e.message} (left out, as the render leaves it silent)`); return null; } }, cov);
    return key;
  };
  const soundRaw = s => s && s.sample ? {tuning: s.tuning, rom: s.sample.rom, samples: s.sample.samples, loop: s.sample.loop ? [s.sample.loop.start, s.sample.loop.end, s.sample.loop.count] : null} : null;
  const instOf = (bank, inst, minCov) => {
    const relField = gen === "oot" ? inst.decayIndex : inst.releaseRate;
    const regions = [];
    const parts = [[inst.low, 0, inst.normalRangeLo - 1], [inst.normal, inst.normalRangeLo, inst.normalRangeHi], [inst.high, inst.normalRangeHi + 1, 127]];
    for (const [snd, lo, hi] of parts) {
      if (!snd || !snd.sample || lo > hi) continue;
      const keyLo = Math.max(0, lo + 21), keyHi = Math.min(127, hi + 21);
      if (keyLo > keyHi) continue;
      regions.push({keyLo, keyHi, rootKey: rootOfTuning(snd.tuning), src: offer(bank, snd.sample, minCov), raw: {tuning: snd.tuning, semitones: [lo, hi]}});
    }
    const raw = {kind: gen === "oot" ? "oot-instrument" : "sm64-instrument", index: inst.index, normalRangeLo: inst.normalRangeLo, normalRangeHi: inst.normalRangeHi,
      [gen === "oot" ? "decayIndex" : "releaseRate"]: relField, envelope: inst.envelope, sounds: [inst.low, inst.normal, inst.high].map(soundRaw)};
    // the release as the render picks it: the instrument's own rate (the channel's
    // instrument is the note's own); a 0 would take the channel's — the engine default here
    const rel = relField || (gen === "oot" ? OOT_DEFAULT_DECAY_INDEX : DEFAULT_RELEASE_RATE);
    const complete = Math.min(inst.present, envWhole(inst.envelope), ...[inst.low, inst.normal, inst.high].filter(x => x && x.sample).map(x => x.sample.present));
    return lib.addInstrument({id: `${driver}:${where}${bank.id}:inst${inst.index}`, driver, bank: bank.id, program: inst.index, kind: "melodic", pan: null, gain: 1,
      velocityCurve: "square", maxRatio: cap, envelope: envOf(inst.envelope, rel), keyRegions: regions, raw}, sigOf(raw), complete);
  };
  const kitOf = (bank, minCov) => {
    const regions = [], raws = [];
    let complete = 1;
    bank.drums.forEach((dr, i) => {
      if (!dr || !dr.sound || !dr.sound.sample) return;
      const relField = gen === "oot" ? dr.decayIndex : dr.releaseRate;
      const rel = relField || (gen === "oot" ? OOT_DEFAULT_DECAY_INDEX : DEFAULT_RELEASE_RATE);
      const raw = {slot: i, pan: dr.pan, [gen === "oot" ? "decayIndex" : "releaseRate"]: relField, envelope: dr.envelope, sound: soundRaw(dr.sound)};
      regions.push({keyLo: i, keyHi: i, rootKey: slotRoot(i, dr.sound.tuning), fixedPitch: true, src: offer(bank, dr.sound.sample, minCov),
        pan: round(dr.pan / 128 * 2 - 1, 3), envelope: envOf(dr.envelope, rel), raw});
      raws.push(raw);
      complete = Math.min(complete, dr.present, envWhole(dr.envelope), dr.sound.sample.present);
    });
    if (!regions.length) return null;
    return lib.addInstrument({id: `${driver}:${where}${bank.id}:drums`, driver, bank: bank.id, program: "drums", kind: "drum-kit", pan: null, gain: 1,
      velocityCurve: "square", maxRatio: cap, envelope: regions[0].envelope, keyRegions: regions, raw: {kind: gen + "-drums", count: bank.drums.length}}, sigOf(raws), complete);
  };
  // what this song played, per (bank, instrument | drums)
  const played = new Map();
  let skipped = 0;
  for (const n of res.notes) {
    const bank = bankOf(n.bank || 0);
    if (!bank) continue;
    if (n.drum) {
      const dr = bank.drum(n.semitone);
      if (!dr) continue;
      const k = bank.id + ":drums";
      (played.get(k) || played.set(k, {bank, drums: true, notes: []}).get(k)).notes.push({key: n.semitone, slot: dr.index, secs: secs(n), vel: n.vel});
      continue;
    }
    if (n.inst == null || n.inst >= 0x7E) { skipped++; continue; } // synth waveforms (>= 0x80) and the font's sound effects (0x7E): not sample instruments
    const inst = bank.instrument(n.inst);
    if (!inst) continue;
    const k = bank.id + ":" + inst.index;
    (played.get(k) || played.set(k, {bank, inst, notes: []}).get(k)).notes.push({key: n.midi, secs: secs(n), vel: n.vel});
  }
  if (skipped) lib.warn(`${driver}: notes on synth-waveform or sound-effect instruments are not sample instruments (not extracted)`);
  for (const p of played.values()) {
    const rec = p.drums ? kitOf(p.bank, 0) : instOf(p.bank, p.inst, 0);
    if (rec) lib.use(rec, title, p.notes);
  }
  // the rest of each bank the song used, flagged unused (whole samples only)
  for (const bank of banks.values()) {
    if (!bank) continue;
    for (const inst of bank.instruments) if (inst && !played.has(bank.id + ":" + inst.index)) instOf(bank, inst, 0.999);
    if (!played.has(bank.id + ":drums")) kitOf(bank, 0.999);
  }
  return {title, notes: res.notes.length};
}

function rareSong(lib, title, set, seq, res, secs) {
  lib.drivers.add("rare");
  const {ram} = rdramOf(set.state);
  const list = findRareBanks(ram);
  if (!list.length) throw new Error("no sound bank in this rip's memory");
  const want = seq.banks && seq.banks.length ? seq.banks[0] : 0;
  const entry = list[want] || list[0];
  const bank = readRareBank(ram, set.rom, entry.at);
  const bankId = "0x" + entry.at.toString(16);
  const offer = (w, minCov) => {
    if (!w) return null;
    const key = `rare:${w.base}:${w.len}:${w.type}`;
    let s = null; try { s = bank.pcm(w); } catch (e) { lib.warn(`rare: wave at ROM 0x${w.base.toString(16)}: ${e.message} (left out)`); }
    if (s && s.coverage >= minCov && s.coverage > 0) lib.offerSample(key, () => ({pcm: s.pcm, rate: bank.sampleRate, loop: s.looping ? {start: s.loopStart, end: s.loopEnd} : null}), s.coverage);
    return key;
  };
  const instOf = (inst, minCov) => {
    const kit = isKitInstrument(inst);
    const regions = [], raws = [];
    for (const s of inst.sounds) {
      if (!s || !s.keymap || !s.wave) continue;
      const k = s.keymap;
      const env = rareEnvelope(s.envelope);
      const velHi = k.velocityMax || 127;
      regions.push({keyLo: k.keyMin, keyHi: k.keyMax, ...(k.velocityMin > 0 || velHi < 127 ? {velLo: k.velocityMin, velHi} : {}),
        rootKey: round(k.keyBase - k.detune / 100, 4), ...(kit ? {fixedPitch: true} : {}), src: offer(s.wave, minCov),
        gain: round(s.sampleVolume / 127 * inst.volume / 127, 5), pan: round((s.samplePan - 64) / 64, 3), envelope: env,
        raw: {keymap: {velocityMin: k.velocityMin, velocityMax: k.velocityMax, keyMin: k.keyMin, keyMax: k.keyMax, keyBase: k.keyBase, detune: k.detune},
              samplePan: s.samplePan, sampleVolume: s.sampleVolume, wave: {base: s.wave.base, len: s.wave.len, type: s.wave.type}}});
      raws.push([k.keyMin, k.keyMax, k.velocityMin, k.velocityMax, k.keyBase, k.detune, s.wave.base, s.wave.len, s.sampleVolume, s.samplePan, env.raw]);
    }
    if (!regions.length) return null;
    const rec = lib.addInstrument({id: `rare:bank@${bankId}:prog${inst.index}`, driver: "rare", bank: bankId, program: inst.index, kind: kit ? "drum-kit" : "melodic",
      pan: null, gain: round(inst.volume / 127, 5), velocityCurve: "linear", maxRatio: null, envelope: regions[0].envelope, keyRegions: regions,
      raw: {kind: "libaudio-alinstrument", volume: inst.volume, pan: inst.pan, priority: inst.priority, bendRange: inst.bendRange, soundCount: inst.soundCount, bankSampleRate: bank.sampleRate}},
      sigOf([raws, inst.volume]), Math.min(...inst.sounds.filter(Boolean).map(s => Math.min(s.present, s.keymap ? s.keymap.present : 0, s.envelope ? s.envelope.present : 0))));
    for (const x of rec.keyRegions) if (x.envelope === rec.envelope) delete x.envelope;
    return rec;
  };
  const played = new Map();
  for (const n of res.notes) {
    const inst = bank.instrument(n.inst);
    if (!inst) continue;
    (played.get(inst.index) || played.set(inst.index, {inst, notes: []}).get(inst.index)).notes.push({key: n.key, ...(n.drum ? {slot: n.key} : {}), secs: secs(n), vel: n.vel});
  }
  for (const p of played.values()) { const rec = instOf(p.inst, 0); if (rec) lib.use(rec, title, p.notes); }
  for (const inst of bank.instruments) if (inst && !played.has(inst.index)) instOf(inst, 0.999);
  return {title, notes: res.notes.length};
}

export function usfFiles(dir) {
  const all = readdirSync(dir);
  return {minis: all.filter(f => /\.miniusf$/i.test(f)).sort(), libs: all.filter(f => /\.usflib$/i.test(f)).map(n => ({name: n, bytes: new Uint8Array(readFileSync(join(dir, n)))}))};
}
