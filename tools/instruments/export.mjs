// tools/instruments/export.mjs <libraryDir> --sf2 <out.sf2> --sfz <outDir> [--used-only]
//
// A game instrument library (instruments.json + <hash>.wav, model.mjs) as two
// formats any DAW/sampler already reads: SoundFont 2 (one file, one preset
// per instrument) and SFZ (one .sfz per instrument, next to the WAVs it
// uses). Neither format can express what model.mjs actually carries —
// exact multi-point envelopes (attack/decay/release as dozens of driver-
// measured breakpoints), the release curve's "resume from whatever level
// the key was at" behaviour (play.mjs's `timeAtLevel`), or a looping
// envelope's repeat window. Both formats get the ADSR summary
// (envelope.attack/decay/sustain/release) as their real envelope; SFZ also
// gets the exact `envelope.points` shape through ARIA's flex EG (eg1_*),
// which most SFZ players ignore but ARIA/Sforzando honour, so it is a
// bonus there, not a guarantee. `velocityCurve: "square"` is not expressed
// either — both formats use their own default linear velocity-to-volume
// mapping. Levels are normalised per library (maxZoneGain): SF2's
// initialAttenuation can only attenuate, so a raw driver gain > 1 (drivers
// use their own scales) would clamp to 0 cB and the library's own balance
// between instruments would be lost; the loudest zone becomes 0 cB / 0 dB
// in both formats and every other zone keeps its ratio to it.
//
// <libraryDir> is the folder holding instruments.json (what extract.mjs
// calls <out>/<slug>/instruments/) — or its parent, if that's easier to
// type; either resolves.
//
// --used-only drops instruments no captured song plays from BOTH formats
// (smaller export, only what's proven to sound like something). Without
// it, every instrument the rip could build a playable region for is
// still written as an SF2 instrument / its own .sfz file (so nothing is
// lost if Josh later finds a use for one), but the SF2 *preset* list —
// what a DAW actually browses — is always used-only; an unused instrument
// is reachable only by a sampler that lets you pick an instrument
// directly, not a program number. A region with no sample in this rip
// (`missing`, or `sample: null`) is skipped; an instrument left with no
// playable region is skipped entirely.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readWav } from "./model.mjs";

// ---- loading -----------------------------------------------------------------
// <dir>/instruments.json, or <dir>/instruments/instruments.json
export function resolveLibraryDir(dir) {
  if (existsSync(path.join(dir, "instruments.json"))) return dir;
  if (existsSync(path.join(dir, "instruments", "instruments.json"))) return path.join(dir, "instruments");
  throw new Error("no instruments.json in " + dir + " or " + path.join(dir, "instruments"));
}
export function loadLibrary(dir) {
  const libDir = resolveLibraryDir(dir);
  const lib = JSON.parse(readFileSync(path.join(libDir, "instruments.json"), "utf8"));
  const samples = {};
  for (const [hash, s] of Object.entries(lib.samples)) {
    const {rate, pcm, loop} = readWav(readFileSync(path.join(libDir, s.file)));
    samples[hash] = {rate, pcm, loop};
  }
  return {lib, samples, libDir};
}

// ---- shared pitch/level math ---------------------------------------------------
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
// rootKey (fractional MIDI key) -> {key: floor 0..127, cents: -99..99}
export function splitPitch(rootKey) {
  let key = Math.floor(rootKey), cents = Math.round((rootKey - key) * 100);
  if (cents >= 100) { key += 1; cents -= 100; }
  if (cents <= -100) { key -= 1; cents += 100; }
  return {key: clamp(key, 0, 127), cents: clamp(cents, -99, 99)};
}
export const attenuationCb = gain => gain > 0 ? Math.round(clamp(-200 * Math.log10(gain), 0, 1440)) : 1440;
export const gainToDb = gain => gain > 0 ? clamp(20 * Math.log10(gain), -144, 12) : -144;
export function secondsToTimecents(s, min = -12000, max = 8000) { return s > 0 ? Math.round(clamp(1200 * Math.log2(s), min, max)) : min; }

// A library instrument's playable zones: one per keyRegion with a sample,
// missing/null-sample regions dropped. A fixedPitch region spanning more
// than one key (a kit slot mapped to a key range rather than one key, none
// of the 14 real libraries do this but model.mjs allows it) is split one
// zone per key so every key still sounds at the region's one fixed pitch —
// a single SF2/SFZ zone can only vary pitch by key, not hold it fixed
// across a range.
export function zonesForInstrument(inst) {
  const zones = [];
  for (const r of inst.keyRegions || []) {
    if (!r.sample || r.missing) continue;
    const gain = r.gain != null ? r.gain : inst.gain != null ? inst.gain : 1;
    const pan = r.pan != null ? r.pan : inst.pan;
    const envelope = r.envelope || inst.envelope;
    const base = {sample: r.sample, loop: r.loop, velLo: r.velLo, velHi: r.velHi, gain, pan, envelope, kind: inst.kind};
    if (r.fixedPitch && r.keyHi > r.keyLo) {
      const target = r.fixedKey != null ? r.fixedKey : r.keyLo;
      for (let k = r.keyLo; k <= r.keyHi; k++) zones.push({...base, keyLo: k, keyHi: k, rootKey: r.rootKey + (k - target)});
    } else {
      zones.push({...base, keyLo: r.keyLo, keyHi: r.keyHi, rootKey: r.rootKey});
    }
  }
  return zones;
}
// instruments with >=1 playable zone, in the library's own order (used first)
export function playableInstruments(lib, {usedOnly = false} = {}) {
  const out = [];
  for (const inst of lib.instruments || []) {
    if (usedOnly && !inst.used) continue;
    const zones = zonesForInstrument(inst);
    if (zones.length) out.push({inst, zones});
  }
  return out;
}
// truncate to 20 chars, unique among names already assigned
export function shortName(name, taken) {
  let base = (name || "Instrument").slice(0, 20), n = base, i = 2;
  while (taken.has(n)) { const suffix = " " + i++; n = base.slice(0, 20 - suffix.length) + suffix; }
  taken.add(n);
  return n;
}
export const slugify = s => (s || "instrument").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "instrument";

// Driver gains run on each driver's own scale (many exceed 1; SF2's
// initialAttenuation cannot boost, only attenuate, so a raw gain > 1 would
// clamp to 0 cB and the library's own balance between instruments would be
// lost). Normalise so the loudest zone in the export is 0 cB / 0 dB and
// every other zone keeps its ratio to it.
export function maxZoneGain(records) {
  let m = 0;
  for (const {zones} of records) for (const z of zones) if (z.gain > m) m = z.gain;
  return m > 0 ? m : 1;
}

// ============================================================================
// SoundFont 2.01 (RIFF 'sfbk')
// ============================================================================
function riffChunk(id, data) {
  const body = data.length % 2 ? Buffer.concat([data, Buffer.alloc(1)]) : data;
  const head = Buffer.alloc(8);
  head.write(id, 0, "ascii"); head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, body]);
}
const riffList = (id, chunks) => riffChunk("LIST", Buffer.concat([Buffer.from(id, "ascii"), ...chunks]));
const zstr = s => Buffer.from(s + "\0", "ascii");
const nameField = (s, n = 20) => { const b = Buffer.alloc(n); b.write((s || "").slice(0, n), 0, "ascii"); return b; };
const GEN = {keyRange: 43, velRange: 44, instrument: 41, overridingRootKey: 58, fineTune: 52, pan: 17,
  initialAttenuation: 48, sampleModes: 54, attackVolEnv: 34, decayVolEnv: 36, sustainVolEnv: 37, releaseVolEnv: 38, sampleID: 53};
function genRec(op, amount) {
  const b = Buffer.alloc(4);
  b.writeUInt16LE(op, 0);
  if (Array.isArray(amount)) { b.writeUInt8(clamp(amount[0], 0, 127), 2); b.writeUInt8(clamp(amount[1], 0, 127), 3); }
  else b.writeInt16LE(Math.round(amount), 2);
  return b;
}
const bagRec = (genNdx, modNdx = 0) => { const b = Buffer.alloc(4); b.writeUInt16LE(genNdx, 0); b.writeUInt16LE(modNdx, 2); return b; };
const MOD_TERMINAL = Buffer.alloc(10);

// generators for one instrument zone (a keyRegion), keyRange/velRange first, sampleID last.
// `maxGain`: the loudest zone gain in this export (maxZoneGain) — attenuation
// is from z.gain / maxGain, not z.gain alone (see maxZoneGain).
function zoneGenerators(z, sampleIndex, maxGain) {
  const gens = [genRec(GEN.keyRange, [z.keyLo, z.keyHi])];
  if (z.velLo != null || z.velHi != null) gens.push(genRec(GEN.velRange, [z.velLo != null ? z.velLo : 0, z.velHi != null ? z.velHi : 127]));
  const {key, cents} = splitPitch(z.rootKey);
  gens.push(genRec(GEN.overridingRootKey, key));
  if (cents) gens.push(genRec(GEN.fineTune, cents));
  if (z.pan != null) gens.push(genRec(GEN.pan, Math.round(clamp(z.pan, -1, 1) * 500)));
  const atten = attenuationCb((z.gain != null ? z.gain : 1) / maxGain);
  if (atten) gens.push(genRec(GEN.initialAttenuation, atten));
  if (z.loop && z.loop.end > z.loop.start) gens.push(genRec(GEN.sampleModes, 1));
  if (z.envelope) {
    const e = z.envelope;
    gens.push(genRec(GEN.attackVolEnv, secondsToTimecents(e.attack)));
    gens.push(genRec(GEN.decayVolEnv, secondsToTimecents(e.decay)));
    gens.push(genRec(GEN.sustainVolEnv, Math.round(clamp(-200 * Math.log10(Math.max(e.sustain, 1e-4)), 0, 1440))));
    gens.push(genRec(GEN.releaseVolEnv, secondsToTimecents(e.release)));
  }
  gens.push(genRec(GEN.sampleID, sampleIndex));
  return gens;
}

// lib: parsed instruments.json; samples: {hash: {pcm: Int16Array, rate, loop}} (loadLibrary)
export function toSf2(lib, samples, {usedOnly = false} = {}) {
  const records = playableInstruments(lib, {usedOnly});
  if (!records.length) throw new Error("no playable instruments (every region's sample is missing?)");
  const maxGain = maxZoneGain(records);

  // ---- samples: one shdr per hash actually used, in a deterministic order
  const hashes = [...new Set(records.flatMap(r => r.zones.map(z => z.sample)))].sort();
  const rootOf = new Map(); // hash -> floor(rootKey) of the first region using it
  for (const {zones} of records) for (const z of zones) if (!rootOf.has(z.sample)) rootOf.set(z.sample, Math.floor(z.rootKey));
  const sampleIndex = new Map(hashes.map((h, i) => [h, i]));
  const PAD = 46; // silent sample points required after each sample (SF2 spec)
  const pcmChunks = [], shdrRecs = [];
  let point = 0;
  for (const h of hashes) {
    const s = samples[h];
    if (!s || !s.pcm) throw new Error("sample " + h + " referenced but not loaded (missing WAV?)");
    const pcm = s.pcm;
    const start = point, end = start + pcm.length;
    pcmChunks.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    pcmChunks.push(Buffer.alloc(PAD * 2));
    point = end + PAD;
    const loop = s.loop && s.loop.end > s.loop.start ? s.loop : null;
    const startloop = loop ? start + loop.start : start, endloop = loop ? start + loop.end : start;
    const rec = Buffer.concat([nameField(h), u32(start), u32(end), u32(startloop), u32(endloop), u32(s.rate || 44100),
      Buffer.from([clamp(rootOf.get(h) != null ? rootOf.get(h) : 60, 0, 127), 0]), u16(0), u16(1)]);
    shdrRecs.push(rec);
  }
  shdrRecs.push(Buffer.concat([nameField("EOS"), u32(0), u32(0), u32(0), u32(0), u32(0), Buffer.from([0, 0]), u16(0), u16(0)]));

  // ---- instruments: one per playable library instrument, one zone per region.
  // Named by the same short, unique nameGuess a preset gets (its own taken-set,
  // separate from the preset list's) — not inst.id: SF2 has no other field to
  // keep the id in, so a sampler's instrument list would otherwise read a
  // truncated driver address instead of a name. The id survives only in the
  // SFZ index.txt (toSfz).
  const instRecs = [], ibagRecs = [], igenRecs = [];
  const instIndex = new Map(); // library instrument -> its index in the `inst` chunk
  const instNames = new Set();
  for (const {inst, zones} of records) {
    instIndex.set(inst, instRecs.length);
    instRecs.push(Buffer.concat([nameField(shortName(inst.nameGuess, instNames)), u16(ibagRecs.length)]));
    for (const z of zones) {
      ibagRecs.push(bagRec(igenRecs.length));
      for (const g of zoneGenerators(z, sampleIndex.get(z.sample), maxGain)) igenRecs.push(g);
    }
  }
  instRecs.push(Buffer.concat([nameField("EOI"), u16(ibagRecs.length)]));
  ibagRecs.push(bagRec(igenRecs.length));

  // ---- presets: used instruments only, bank 0 programs 0..127 then bank 1…
  const presetRecords = records.filter(r => r.inst.used);
  const presetNames = new Set();
  const phdrRecs = [], pbagRecs = [], pgenRecs = [];
  presetRecords.forEach(({inst}, i) => {
    const bank = Math.floor(i / 128), program = i % 128;
    phdrRecs.push(Buffer.concat([nameField(shortName(inst.nameGuess, presetNames)), u16(program), u16(bank), u16(pbagRecs.length), u32(0), u32(0), u32(0)]));
    pbagRecs.push(bagRec(pgenRecs.length));
    pgenRecs.push(genRec(GEN.instrument, instIndex.get(inst)));
  });
  phdrRecs.push(Buffer.concat([nameField("EOP"), u16(0), u16(0), u16(pbagRecs.length), u32(0), u32(0), u32(0)]));
  pbagRecs.push(bagRec(pgenRecs.length));

  // ---- assemble
  const title = (lib.title || lib.slug || "instruments").slice(0, 255);
  const info = riffList("INFO", [
    riffChunk("ifil", Buffer.from([2, 0, 1, 0])), // wMajor=2, wMinor=1
    riffChunk("isng", zstr("EMU8000")),
    riffChunk("INAM", zstr(title)),
    riffChunk("ICMT", zstr("Extracted by Night Roll. Envelopes are the driver's ADSR summary, not the exact multi-point shape; the release curve's resume-from-level behaviour and any envelope repeat are not represented. Levels are normalised so the loudest zone in this file is 0 cB; ratios between instruments are kept. velocityCurve \"square\" is not expressed (SF2's default linear velocity-to-volume mapping applies to every zone).")),
  ]);
  const sdta = riffList("sdta", [riffChunk("smpl", Buffer.concat(pcmChunks))]);
  const pdta = riffList("pdta", [
    riffChunk("phdr", Buffer.concat(phdrRecs)), riffChunk("pbag", Buffer.concat(pbagRecs)),
    riffChunk("pmod", MOD_TERMINAL), riffChunk("pgen", Buffer.concat(pgenRecs)),
    riffChunk("inst", Buffer.concat(instRecs)), riffChunk("ibag", Buffer.concat(ibagRecs)),
    riffChunk("imod", MOD_TERMINAL), riffChunk("igen", Buffer.concat(igenRecs)),
    riffChunk("shdr", Buffer.concat(shdrRecs)),
  ]);
  const sfbk = Buffer.concat([Buffer.from("sfbk", "ascii"), info, sdta, pdta]);
  const riff = riffChunk("RIFF", sfbk);
  return new Uint8Array(riff.buffer, riff.byteOffset, riff.byteLength);
}
function u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b; }
function u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v, 0); return b; }

// ============================================================================
// SFZ v2 (+ ARIA flex EG for the exact envelope shape)
// ============================================================================
// ARIA flex EG nodes from envelope.points ([t, level] from key-on) plus the
// release curve's own points/seconds appended after the sustain node — a
// straight concatenation, not a reproduction of play.mjs's "resume the
// canonical release curve from whatever level release found" behaviour.
function flexEg(envelope) {
  const pts = envelope.points && envelope.points.length ? envelope.points : [[0, 1]];
  const lines = ["eg1_ampeg=1"];
  let prevT = 0, node = 0;
  for (const [t, l] of pts) { node++; lines.push(`eg1_time${node}=${round(t - prevT)} eg1_level${node}=${round(l)}`); prevT = t; }
  const sustainNode = node;
  const rc = envelope.releaseCurve;
  if (rc && rc.mode === "exp-time") {
    node++; lines.push(`eg1_time${node}=${round(rc.seconds)} eg1_level${node}=0`);
  } else if (rc && rc.points && rc.points.length > 1) {
    let relPrev = rc.points[0][0];
    for (const [t, l] of rc.points.slice(1)) { node++; lines.push(`eg1_time${node}=${round(t - relPrev)} eg1_level${node}=${round(l)}`); relPrev = t; }
  }
  lines.push(`eg1_sustain=${sustainNode}`);
  return lines.join(" ");
}
const round = x => Math.round(x * 100000) / 100000;

// `maxGain`: the loudest zone gain in this export (maxZoneGain) — volume is
// from z.gain / maxGain, so it matches the SF2 side's normalisation.
function regionLines(z, maxGain) {
  const {key, cents} = splitPitch(z.rootKey);
  const lines = [`sample=${z.sample}.wav`, `lokey=${z.keyLo} hikey=${z.keyHi}`];
  if (z.velLo != null || z.velHi != null) lines.push(`lovel=${z.velLo != null ? z.velLo : 0} hivel=${z.velHi != null ? z.velHi : 127}`);
  lines.push(`pitch_keycenter=${key}${cents ? ` tune=${cents}` : ""}`);
  if (z.loop && z.loop.end > z.loop.start) lines.push(`loop_mode=loop_continuous loop_start=${z.loop.start} loop_end=${z.loop.end - 1}`);
  else lines.push(z.kind === "drum-kit" ? "loop_mode=one_shot" : "loop_mode=no_loop");
  if (z.pan != null) lines.push(`pan=${Math.round(clamp(z.pan, -1, 1) * 100)}`);
  if (z.gain != null) lines.push(`volume=${round(gainToDb(z.gain / maxGain))}`);
  if (z.envelope) {
    const e = z.envelope;
    lines.push(`ampeg_attack=${round(e.attack)} ampeg_decay=${round(e.decay)} ampeg_sustain=${round(e.sustain * 100)} ampeg_release=${round(e.release)}`);
    lines.push(flexEg(e));
  }
  return "<region>\n" + lines.join("\n") + "\n";
}

// lib: parsed instruments.json -> {"<i>-<slug>.sfz": text, "index.txt": text}
export function toSfz(lib, {usedOnly = false} = {}) {
  const records = playableInstruments(lib, {usedOnly});
  const maxGain = maxZoneGain(records);
  const title = lib.title || lib.slug || "instruments";
  const out = {};
  // index.txt is also where the library's driver id survives (SF2 has no
  // free field per instrument): every instrument's id -> name, plus the
  // bank/program a DAW would load it under — assigned to used instruments
  // only, in the same order toSf2 assigns SF2 presets.
  const indexLines = [
    `# ${title}: bank/program -> file, and every instrument's id -> name.`,
    `# bank/program is "-" for an instrument no captured song plays (no preset in the matching .sf2 either).`,
    `bank\tprogram\tfile\tid\tname`,
  ];
  let program = 0, bank = 0;
  records.forEach(({inst, zones}, i) => {
    const file = `${i}-${slugify(inst.nameGuess)}.sfz`;
    const header = `// ${inst.nameGuess} (${inst.id}) from ${title}. eg1_* is the driver's exact envelope shape ` +
      `(ARIA flex EG); ampeg_* is the ADSR summary, for players without flex EGs. Levels are normalised so the ` +
      `loudest zone in this library is 0 dB; ratios between instruments are kept. velocityCurve "square" is not ` +
      `expressed (SFZ's default linear velocity-to-volume mapping applies).\n` +
      `<control>\ndefault_path=./\n\n`;
    out[file] = header + zones.map(z => regionLines(z, maxGain)).join("\n");
    if (inst.used) {
      indexLines.push(`${bank}\t${program}\t${file}\t${inst.id}\t${inst.nameGuess}`);
      program++; if (program === 128) { program = 0; bank++; }
    } else {
      indexLines.push(`-\t-\t${file}\t${inst.id}\t${inst.nameGuess}`);
    }
  });
  out["index.txt"] = indexLines.join("\n") + "\n";
  return out;
}

// ============================================================================
// CLI
// ============================================================================
export function parseArgs(argv) {
  const o = {dir: null, sf2: null, sfz: null, usedOnly: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sf2") o.sf2 = argv[++i];
    else if (a === "--sfz") o.sfz = argv[++i];
    else if (a === "--used-only") o.usedOnly = true;
    else if (!o.dir) o.dir = a;
    else throw new Error("unexpected argument " + a);
  }
  return o;
}

export function runCli(argv, log = console.log) {
  const o = parseArgs(argv);
  if (!o.dir || (!o.sf2 && !o.sfz)) throw new Error("usage: export.mjs <libraryDir> --sf2 <out.sf2> --sfz <outDir> [--used-only]");
  const {lib, samples, libDir} = loadLibrary(o.dir);
  if (o.sf2) {
    const bytes = toSf2(lib, samples, {usedOnly: o.usedOnly});
    mkdirSync(path.dirname(path.resolve(o.sf2)) || ".", {recursive: true});
    writeFileSync(o.sf2, bytes);
    log(`# sf2: ${o.sf2} (${(bytes.length / 1048576).toFixed(2)} MB)`);
  }
  if (o.sfz) {
    mkdirSync(o.sfz, {recursive: true});
    const files = toSfz(lib, {usedOnly: o.usedOnly});
    const usedHashes = new Set();
    for (const {zones} of playableInstruments(lib, {usedOnly: o.usedOnly})) for (const z of zones) usedHashes.add(z.sample);
    for (const h of usedHashes) copyFileSync(path.join(libDir, h + ".wav"), path.join(o.sfz, h + ".wav"));
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(o.sfz, name), text);
    log(`# sfz: ${o.sfz} (${Object.keys(files).length - 1} instruments, ${usedHashes.size} samples)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runCli(process.argv.slice(2)); }
  catch (e) { console.error("export: " + (e && e.stack || e)); process.exit(e && e.message && e.message.startsWith("usage:") ? 2 : 1); }
}
