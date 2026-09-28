// tools/instruments/sf2.mjs — a plain SoundFont 2 (RIFF 'sfbk') reader, browser-clean
// (no Node built-ins: index.html imports it the same way it imports play.mjs, and the
// vm test harness loads it as a plain ES module). Josh's goal (2026-09-28): load ANY
// .sf2 — a fan-made game font, a better piano, anything — and use its presets as track
// voices, the same way an extracted game library's instruments already are.
//
// parseSf2(bytes) -> {name, presets: [{name, bank, program, zones, keyRegions, gain,
//   velocityCurve}], samples: {hash: {rate, pcm: Float32Array, loop: {start,end}|null}}}
//
// `zones` and `keyRegions` are the SAME array (two names: the field the task asked for,
// and the one tools/instruments/play.mjs's regionFor/playNote actually reads) of Region
// objects in model.mjs's own shape: {keyLo, keyHi, velLo?, velHi?, rootKey, sample: hash,
// loop, gain, pan, envelope, fixedPitch?, fixedKey?} — so a preset object doubles as a
// play.mjs `inst` with no translation step (gain 1 / velocityCurve "linear" at the top:
// SF2 has no per-preset overall gain or pan, only per-region, already folded in below).
//
// Generator resolution (SoundFont 2.01 spec §7-9, summarised in NIGHT-ROLL.md "Game
// instrument libraries"): within ONE level (instrument or preset), a zone's own
// generator OVERRIDES its level's global zone value for that same generator — never
// summed. BETWEEN levels, the instrument's absolute value and the preset's are ADDED:
// fineTune, coarseTune, pan, initialAttenuation, and the five volume-envelope
// generators. keyRange/velRange/sampleID/instrument/sampleModes/overridingRootKey/the
// sample address-offset generators exist only at the instrument level; a preset's own
// keyRange/velRange instead NARROWS (intersects) the instrument zone's — that's how one
// preset splits across several instrument zones by key or velocity range ("layers").
// Modulators (pmod/imod) are not applied — every real SF2 player's own default
// modulators (e.g. velocity -> initialAttenuation) are a performance nuance, not
// something model.mjs's Region shape has room for; velocityCurve stays "linear"
// (play.mjs's own default), same simplification the game-instrument libraries already
// make (NIGHT-ROLL.md: "a squared velocity curve is not expressed" in the SF2 export).
// A stereo sample pair (two zones, hard-panned left/right, same key range) collapses to
// whichever zone comes first — play.mjs's regionFor picks exactly one region per note,
// mono, same as any other borrowed instrument.
//
// Rejected with a clear error, not a garbled render: SF3 (Ogg Vorbis-compressed
// samples — detected by the smpl chunk being shorter than the sample headers say it
// must be, since real PCM can't be) and 24-bit samples (an `sm24` chunk present).

// ---- tiny byte readers (no Buffer; DataView + a hand-rolled ascii/NUL-trimmed string) ----
function cstr(view, o, n) {
  let s = "";
  for (let i = 0; i < n; i++) { const c = view.getUint8(o + i); if (c === 0) break; s += String.fromCharCode(c); }
  return s;
}
export function isSf2(bytes) {
  if (!bytes || bytes.length < 12) return false;
  const s = (o, n) => { let r = ""; for (let i = 0; i < n; i++) r += String.fromCharCode(bytes[o + i]); return r; };
  return s(0, 4) === "RIFF" && s(8, 4) === "sfbk";
}

// non-cryptographic content hash (FNV-1a, two rounds) — this module has no node:crypto;
// it only needs a stable dictionary key so identical (pcm, rate, loop) triples across
// zones share one samples[] entry, same spirit as model.mjs's sampleHash
function fnv1a(bytes, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function sf2SampleHash(f32, rate, loop) {
  const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  const tag = rate + "|" + (loop ? loop.start + "-" + loop.end : "-") + "|" + f32.length;
  const tagBytes = []; for (let i = 0; i < tag.length; i++) tagBytes.push(tag.charCodeAt(i));
  const h1 = fnv1a(bytes, 0x811c9dc5);
  const h2 = fnv1a(tagBytes, h1);
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

// ---- envelope: timecents/centibels -> model.mjs's {points, releaseCurve} shape ----
const round = (x, d = 6) => { const k = Math.pow(10, d); return Math.round(x * k) / k; };
const tcToSec = tc => Math.pow(2, tc / 1200); // spec default -12000 -> ~0.001s ("instant")
const cbToLevel = cb => Math.min(1, Math.max(0, Math.pow(10, -cb / 200)));
// held-key points (attack/hold/decay to sustain) + a "follow" release curve sampling the
// same linear-in-dB slope from full level to (effectively) silence over `release`
// seconds — play.mjs's timeAtLevel picks up this curve from wherever key-off found it,
// so the curve only needs to be shaped right, not started from the actual note level.
export function buildEnvelope(delayTc, attackTc, holdTc, decayTc, sustainCb, releaseTc) {
  const delay = tcToSec(delayTc), attack = tcToSec(attackTc), hold = tcToSec(holdTc), decay = tcToSec(decayTc), release = tcToSec(releaseTc);
  const sustainLevel = cbToLevel(sustainCb);
  // SF2's decayVolEnv is the time to fall ALL the way to silence (100 dB / 1000 cB) were
  // it not stopped at the sustain level — so the time actually spent decaying to sustain
  // is that fraction of the full decay time (the same convention export.mjs's own
  // ADSR-summary writer assumes in reverse; FluidSynth and most other SF2 players do the
  // same conversion)
  const decayToSustain = decay * Math.min(1, Math.max(0, sustainCb / 1000));
  const raw = [[0, 0]];
  let t = 0;
  if (delay > 0.0015) { t = delay; raw.push([t, 0]); }
  t += attack; raw.push([t, 1]);
  if (hold > 0.0015) { t += hold; raw.push([t, 1]); }
  if (decayToSustain > 0.0015 || sustainLevel < 0.999) { t += decayToSustain; raw.push([t, sustainLevel]); }
  const points = [];
  for (const p of raw) { if (points.length && Math.abs(points[points.length - 1][0] - p[0]) < 1e-6) points[points.length - 1] = p; else points.push([round(p[0]), round(p[1])]); }
  const N = 16, releasePoints = [];
  for (let i = 0; i <= N; i++) releasePoints.push([round(release * i / N), i === N ? 0 : round(Math.pow(10, -100 * (i / N) / 20))]);
  return {points, releaseCurve: {mode: "follow", points: releasePoints}};
}

// ---- generator defaults (SF2.01 §8.1.3) for the generators this reader actually uses ----
const DEFAULTS = {
  43: {lo: 0, hi: 127}, 44: {lo: 0, hi: 127}, // keyRange, velRange
  58: -1,  // overridingRootKey: -1 = not overridden (use the sample's own pitch)
  52: 0, 51: 0, 17: 0, 48: 0, 54: 0, // fineTune, coarseTune, pan, initialAttenuation, sampleModes
  33: -12000, 34: -12000, 35: -12000, 36: -12000, 37: 0, 38: -12000, // delay/attack/hold/decay/sustain/release VolEnv
  46: -1, // keynum override: -1 = not forced (a drum kit zone that forces one key sets this)
};
const GEN = {keyRange: 43, velRange: 44, instrument: 41, sampleID: 53, overridingRootKey: 58,
  fineTune: 52, coarseTune: 51, pan: 17, initialAttenuation: 48, sampleModes: 54, keynum: 46,
  delayVolEnv: 33, attackVolEnv: 34, holdVolEnv: 35, decayVolEnv: 36, sustainVolEnv: 37, releaseVolEnv: 38};

// ---- main parse ----------------------------------------------------------------
export function parseSf2(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!isSf2(buf)) throw new Error("not a SoundFont 2 file (no RIFF/sfbk header)");
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // flat chunk map (id -> {offset, length} of the chunk's BODY, past its 8-byte header) —
  // LIST chunks are walked, never stored themselves; a well-formed SF2 never repeats a
  // leaf chunk id across lists, so a flat map is enough (the export test's own from-
  // scratch reader takes the same shortcut)
  const chunks = {};
  (function walk(o, end) {
    while (o + 8 <= end) {
      const id = cstr(view, o, 4), len = view.getUint32(o + 4, true);
      const body = o + 8;
      if (id === "LIST") walk(body + 4, body + len); // +4 skips the list-type tag (INFO/sdta/pdta)
      else chunks[id] = {offset: body, length: len};
      o = body + len + (len & 1);
    }
  })(12, buf.byteLength);

  for (const n of ["phdr", "pbag", "pgen", "inst", "ibag", "igen", "shdr", "smpl"])
    if (!chunks[n]) throw new Error("not a valid SoundFont 2 file (missing its " + n + " chunk)");
  if (chunks.sm24) throw new Error("this SoundFont has 24-bit samples (an sm24 chunk) — Night Roll reads 16-bit PCM samples only");

  const recOffsets = (name, size) => {
    const c = chunks[name];
    if (c.length % size) throw new Error(name + " chunk length isn't a multiple of " + size + " bytes — corrupt SoundFont");
    const out = []; for (let o = c.offset; o < c.offset + c.length; o += size) out.push(o);
    return out;
  };
  const name20 = o => cstr(view, o, 20);

  const presetHeaders = recOffsets("phdr", 38).map(o => ({name: name20(o), program: view.getUint16(o + 20, true), bank: view.getUint16(o + 22, true), bagNdx: view.getUint16(o + 24, true)}));
  const instHeaders = recOffsets("inst", 22).map(o => ({name: name20(o), bagNdx: view.getUint16(o + 20, true)}));
  const bagAt = offs => offs.map(o => ({genNdx: view.getUint16(o, true), modNdx: view.getUint16(o + 2, true)}));
  const pbag = bagAt(recOffsets("pbag", 4)), ibag = bagAt(recOffsets("ibag", 4));
  const genAt = o => {
    const op = view.getUint16(o, true);
    if (op === GEN.keyRange || op === GEN.velRange) return [op, {lo: view.getUint8(o + 2), hi: view.getUint8(o + 3)}];
    if (op === GEN.instrument || op === GEN.sampleID) return [op, view.getUint16(o + 2, true)]; // indices: unsigned
    return [op, view.getInt16(o + 2, true)];
  };
  const pgen = recOffsets("pgen", 4).map(genAt), igen = recOffsets("igen", 4).map(genAt);
  const shdr = recOffsets("shdr", 46).map(o => ({
    name: name20(o), start: view.getUint32(o + 20, true), end: view.getUint32(o + 24, true),
    startloop: view.getUint32(o + 28, true), endloop: view.getUint32(o + 32, true), rate: view.getUint32(o + 36, true) || 44100,
    originalPitch: view.getUint8(o + 40), pitchCorrection: view.getInt8(o + 41),
  }));

  const maxEnd = shdr.reduce((m, s) => Math.max(m, s.end), 0);
  if (chunks.smpl.length < maxEnd * 2)
    throw new Error("SoundFont sample data is shorter than its own headers say (SF3/compressed samples aren't supported — re-export as a plain 16-bit PCM SF2, e.g. Polyphone's File → Export → SF2)");

  // one header's own zones: [genNdx, nextGenNdx) per bag in [bagNdx, nextHeader.bagNdx) —
  // headers[] always includes the terminal EOI/EOP record, so `headers[idx+1]` exists for
  // every real header; likewise bags[] carries one terminal sentinel past the last zone
  function headerZones(headers, idx, bags, gens) {
    const zones = [];
    for (let b = headers[idx].bagNdx; b < headers[idx + 1].bagNdx; b++) {
      const z = new Map();
      for (let g = bags[b].genNdx; g < bags[b + 1].genNdx; g++) { const [op, v] = gens[g]; z.set(op, v); }
      zones.push(z);
    }
    return zones;
  }
  // the global zone, if present, is always zone 0 and lacks the level's terminal
  // generator (sampleID for an instrument, instrument for a preset)
  const splitGlobal = (zones, terminalKey) =>
    zones.length && !zones[0].has(terminalKey) ? {global: zones[0], locals: zones.slice(1)} : {global: new Map(), locals: zones};

  // ---- instruments: absolute generators (local zone overrides its global zone; else the SF2 default) ----
  const instruments = [];
  for (let i = 0; i < instHeaders.length - 1; i++) {
    const {global, locals} = splitGlobal(headerZones(instHeaders, i, ibag, igen), GEN.sampleID);
    const abs = (z, key) => z.has(key) ? z.get(key) : global.has(key) ? global.get(key) : DEFAULTS[key];
    const regions = [];
    for (const z of locals) {
      if (!z.has(GEN.sampleID)) continue; // a malformed extra zone with no sample: nothing to play
      regions.push({
        keyRange: abs(z, GEN.keyRange), velRange: abs(z, GEN.velRange), sampleId: z.get(GEN.sampleID),
        overridingRootKey: abs(z, GEN.overridingRootKey), fineTune: abs(z, GEN.fineTune), coarseTune: abs(z, GEN.coarseTune),
        pan: abs(z, GEN.pan), atten: abs(z, GEN.initialAttenuation), sampleModes: abs(z, GEN.sampleModes), keynum: abs(z, GEN.keynum),
        delay: abs(z, GEN.delayVolEnv), attack: abs(z, GEN.attackVolEnv), hold: abs(z, GEN.holdVolEnv),
        decay: abs(z, GEN.decayVolEnv), sustain: abs(z, GEN.sustainVolEnv), release: abs(z, GEN.releaseVolEnv),
      });
    }
    instruments.push({name: instHeaders[i].name, regions});
  }

  // ---- presets: same override rule within the level; keyRange/velRange narrow (not add); everything else is an offset ----
  const presetsRaw = [];
  for (let i = 0; i < presetHeaders.length - 1; i++) {
    const {global, locals} = splitGlobal(headerZones(presetHeaders, i, pbag, pgen), GEN.instrument);
    const off = (z, key) => z.has(key) ? z.get(key) : global.has(key) ? global.get(key) : 0;
    const rangeOf = (z, key) => z.has(key) ? z.get(key) : global.has(key) ? global.get(key) : DEFAULTS[key];
    const layers = [];
    for (const z of locals) {
      if (!z.has(GEN.instrument)) continue;
      layers.push({
        instrumentIdx: z.get(GEN.instrument), keyRange: rangeOf(z, GEN.keyRange), velRange: rangeOf(z, GEN.velRange),
        fineTune: off(z, GEN.fineTune), coarseTune: off(z, GEN.coarseTune), pan: off(z, GEN.pan), atten: off(z, GEN.initialAttenuation),
        delay: off(z, GEN.delayVolEnv), attack: off(z, GEN.attackVolEnv), hold: off(z, GEN.holdVolEnv),
        decay: off(z, GEN.decayVolEnv), sustain: off(z, GEN.sustainVolEnv), release: off(z, GEN.releaseVolEnv),
      });
    }
    presetsRaw.push({name: presetHeaders[i].name, bank: presetHeaders[i].bank, program: presetHeaders[i].program, layers});
  }

  // ---- samples: decoded (and hashed) lazily, per (sampleId, that zone's OWN loop
  // decision) — the same raw bytes can be a looped sample in one zone/preset and a
  // one-shot in another (sampleModes is a per-zone generator; loop points live in the
  // shared shdr), so the hash tag (matching model.mjs's own sampleHash convention)
  // includes the effective loop, not just the sample id
  const pcmCache = new Map();
  const decodePcm = sampleId => {
    if (pcmCache.has(sampleId)) return pcmCache.get(sampleId);
    const s = shdr[sampleId], n = Math.max(0, s.end - s.start), out = new Float32Array(n);
    const base = chunks.smpl.offset + s.start * 2;
    for (let i = 0; i < n; i++) out[i] = view.getInt16(base + i * 2, true) / 32768;
    pcmCache.set(sampleId, out);
    return out;
  };
  const samples = {};
  const sampleFor = (sampleId, sampleModes) => {
    const s = shdr[sampleId];
    const loop = (sampleModes === 1 || sampleModes === 3) && s.endloop > s.startloop
      ? {start: s.startloop - s.start, end: s.endloop - s.start} : null;
    const pcm = decodePcm(sampleId);
    const hash = sf2SampleHash(pcm, s.rate, loop);
    if (!samples[hash]) samples[hash] = {rate: s.rate, pcm, loop};
    return hash;
  };

  const intersect = (lo, hi) => hi < lo ? null : {lo, hi};
  const presets = presetsRaw.map(p => {
    const zones = [];
    for (const layer of p.layers) {
      const inst = instruments[layer.instrumentIdx];
      if (!inst) continue; // a preset zone pointing past the inst[] array: skip, don't throw — one bad layer shouldn't sink the whole font
      for (const r of inst.regions) {
        const kr = intersect(Math.max(r.keyRange.lo, layer.keyRange.lo), Math.min(r.keyRange.hi, layer.keyRange.hi));
        if (!kr) continue;
        const vr = intersect(Math.max(r.velRange.lo, layer.velRange.lo), Math.min(r.velRange.hi, layer.velRange.hi));
        if (!vr) continue;
        const s = shdr[r.sampleId];
        const fineTune = r.fineTune + layer.fineTune, coarseTune = r.coarseTune + layer.coarseTune;
        const baseKey = r.overridingRootKey !== -1 ? r.overridingRootKey : s.originalPitch;
        const rootKey = baseKey + coarseTune + (fineTune + s.pitchCorrection) / 100;
        const pan = Math.max(-1, Math.min(1, (r.pan + layer.pan) / 500));
        const gain = Math.pow(10, -(r.atten + layer.atten) / 200);
        const hash = sampleFor(r.sampleId, r.sampleModes);
        const region = {
          keyLo: kr.lo, keyHi: kr.hi,
          ...(vr.lo !== 0 || vr.hi !== 127 ? {velLo: vr.lo, velHi: vr.hi} : {}),
          rootKey, sample: hash, loop: samples[hash].loop, gain, pan,
          envelope: buildEnvelope(r.delay + layer.delay, r.attack + layer.attack, r.hold + layer.hold,
            r.decay + layer.decay, r.sustain + layer.sustain, r.release + layer.release),
        };
        if (r.keynum !== -1) { region.fixedPitch = true; region.fixedKey = r.keynum; }
        zones.push(region);
      }
    }
    return {name: p.name, bank: p.bank, program: p.program, zones, keyRegions: zones, gain: 1, velocityCurve: "linear"};
  });

  return {name: chunks.INAM ? cstr(view, chunks.INAM.offset, chunks.INAM.length) : "", presets, samples};
}
