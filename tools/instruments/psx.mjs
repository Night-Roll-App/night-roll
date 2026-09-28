// PlayStation instruments: every song of a PSF set through the capture's own
// song finder (tools/psx/capture.mjs psfSong), then its bank read with the
// renderer's readers — so an instrument here is exactly what renderSpu plays.
//
// AKAO (Square: FF7, SaGa Frontier, Parasite Eve, FF8, FF9, Chrono Cross):
//  - melodic: one instrument per articulation — INSTR.DAT slot (FF7: 64-byte
//    records, twelve base pitches, the sample in the bank findSampleBank
//    finds) or a sample-set articulation (akaoRecord: 0x10 {offset, loop,
//    fine, unity, ADSR1/2}, or the 0x40 INSTR-shaped / base-pitch shapes).
//    id akao:instr:<slot> | akao:set<id>:<art>.
//  - key-split programs (a program of regions, each an articulation): layout
//    3 reads the header's table (all 16); layouts 1.1/2 keep their regions
//    inline in the score, so the regions are the keys the songs played,
//    widened to meet their neighbours (raw.inferredBounds). id akao:split:<sig>.
//  - drum kits: layout 3's header table (every key with an entry); layouts
//    1/2's twelve-degree maps as the songs played them. A region per key
//    (the slot), fixed pitch = the articulation at the entry's key.
//    id akao:kit:<sig> (the first song's map). Maps that agree on every slot both
//    played are one map heard twice, and merge.
// Sony SEQ/VAB: one instrument per program, a region per tone (layers
// overlap; the player takes the first). id vab:<vabId>:<program>.
//
// Pitch in the neutral form: rootKey = the key at which the sample plays at
// 44100 Hz (SPU pitch 0x1000). INSTR.DAT's twelve base pitches give one
// root per degree; when they agree within a cent it is one region, else a
// region per key (raw.perDegree). Level: 0.5 × tone volume (renderSpu's
// output scale), velocity linear. Envelope: the SPU ADSR run by
// spu-render.mjs's own Envelope, sampled per output sample and simplified.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { loadPSFChain, assembleRam, parsePSF } from "../psx/psf.mjs";
import { psfSong } from "../psx/capture.mjs";
import { pickAKAO, parseAKAO, akaoRecord, akaoArtOf, readRegions } from "../psx/akao.mjs";
import { readInstr, adsrRecord } from "../psx/instr.mjs";
import { Envelope, decodeAt } from "../psx/spu-render.mjs";
import { vagPcm } from "../psx/vab.mjs";
import { secondsAt } from "../psx/seq.mjs";
import { simplify, summarize, round, sigOf } from "./model.mjs";
import { createHash } from "node:crypto";

const SPU_RATE = 44100;

// ---- the SPU envelope, as the renderer runs it ------------------------------------
const envCache = new Map();
export function spuEnvelope(rec, {maxHold = 10} = {}) {
  const key = [rec.ar, rec.am, rec.dr, rec.sl, rec.sr, rec.sm, rec.rr, rec.rm].join(",");
  if (envCache.has(key)) return envCache.get(key);
  const env = new Envelope(rec);
  const pts = [[0, 0]];
  const N = Math.round(maxHold * SPU_RATE);
  let last = -1, steady = 0;
  for (let i = 0; i < N; i++) {
    const lv = env.next() / 0x7FFF;
    pts.push([(i + 1) / SPU_RATE, lv]);
    // settled: a held sustain (sr 0x7f) or silence, for a second
    if (lv === last) { if (++steady > SPU_RATE) break; } else steady = 0;
    last = lv;
  }
  const rel = new Envelope(rec);
  rel.level = 0x7FFF; rel.phase = 3; rel.on = false;
  const rpts = [[0, 1]];
  for (let i = 0; i < SPU_RATE * 30; i++) { const lv = rel.next() / 0x7FFF; rpts.push([(i + 1) / SPU_RATE, lv]); if (lv <= 0) break; }
  const points = simplify(pts, 0.002), releaseCurve = {mode: "follow", points: simplify(rpts, 0.002)};
  const out = {...summarize(points, releaseCurve), points, repeat: null, releaseCurve,
    raw: {kind: "spu-adsr", ar: rec.ar, am: rec.am, dr: rec.dr, sl: rec.sl, sr: rec.sr, sm: rec.sm, rr: rec.rr, rm: rec.rm}};
  envCache.set(key, out);
  return out;
}

// the key an articulation sounds at 44100 Hz: the renderer's ratio law, inverted
function ratioOf(rec, key) {
  if (rec.pitches) return (rec.pitches[((key % 12) + 12) % 12] || 0x1000) / 0x1000 * Math.pow(2, Math.floor(key / 12) - 6);
  return (rec.fineMult || 1) * Math.pow(2, (key - (rec.unity != null ? rec.unity : 60)) / 12);
}
const rootFor = (rec, key) => key - 12 * Math.log2(ratioOf(rec, key));
// melodic regions for one articulation: one when every degree agrees, else one per key
function artRegions(rec, extra = {}) {
  if (!rec.pitches) return [{keyLo: 0, keyHi: 127, rootKey: round(rootFor(rec, 60), 4), ...extra}];
  const roots = []; for (let d = 0; d < 12; d++) roots.push(rootFor(rec, 72 + d));
  const spread = (Math.max(...roots) - Math.min(...roots)) * 100;
  if (spread <= 1) return [{keyLo: 0, keyHi: 127, rootKey: round(roots.reduce((a, b) => a + b) / 12, 4), ...extra}];
  const out = [];
  for (let k = 0; k < 128; k++) out.push({keyLo: k, keyHi: k, rootKey: round(rootFor(rec, k), 4), ...extra});
  return out;
}
const rawRec = rec => { const {ramAddr, ...r} = rec; return {kind: rec.pitches ? "instr-dat" : "akao-art", ...r}; };
// the record's identity wherever the set was loaded: SPU addresses move between songs, the loop's offset does not
const recSig = rec => { const {ramAddr, addr, loop, ...r} = rec; return {...r, loopOff: loop - addr}; };

// a decoded SPU sample, keyed by its bytes (a PSF image is whole: no partial copies)
function sampleKeyAt(d, o, rec) {
  let len = 16;
  while (o + len + 16 <= d.length && !(d[o + len - 16 + 1] & 1) && len < 0x80000) len += 16;
  const h = createHash("sha1").update(d.subarray(o, o + len)).update("|" + (rec && rec.loop > rec.addr ? rec.loop - rec.addr : "-")).digest("hex").slice(0, 16);
  return "spu:" + h;
}
function offerSpu(lib, d, o, rec) {
  const key = sampleKeyAt(d, o, rec);
  lib.offerSample(key, () => {
    const s = decodeAt(d, o, rec);
    return {pcm: s.pcm, rate: SPU_RATE, loop: s.oneShot || s.loopStart == null ? null : {start: s.loopStart, end: s.loopEnd}};
  }, 1);
  return key;
}

function panOf(p) { return p == null ? null : round((Math.max(0, Math.min(127, p)) - 64) / 64, 3); }

// one articulation -> a melodic instrument (and its sample)
function artInstrument(lib, song, rec, sampleAt) {
  const isInstr = !!rec.pitches && rec.set == null;
  const id = isInstr ? `akao:instr:${rec.slot}` : `akao:set${rec.set}:${rec.slot}`;
  const src = sampleAt(rec);
  const env = spuEnvelope(rec);
  const regions = artRegions(rec, {src});
  const inst = lib.addInstrument({id, driver: "akao", bank: isInstr ? "instr" : "set" + rec.set, program: rec.slot, kind: "melodic",
    pan: null, gain: 0.5, velocityCurve: "linear", maxRatio: null, envelope: env, keyRegions: regions,
    raw: {...rawRec(rec), ...(regions.length > 1 ? {perDegree: true} : {})}}, sigOf([recSig(rec), src]));
  return inst;
}

// ---- one PSF song -----------------------------------------------------------------
export async function psxSong(lib, dir, file, {unused = true} = {}) {
  const bytes = readFileSync(join(dir, file));
  const tags = parsePSF(bytes).tags || {};
  const title = tags.title || basename(file).replace(/\.(mini)?psf$/i, "");
  const chain = await loadPSFChain(bytes, n => { const p = join(dir, n); return existsSync(p) ? readFileSync(p) : null; }, {name: file});
  const {ram, ranges} = assembleRam(chain);
  const song = psfSong(ram, ranges, file);
  if (!song.renderable) throw new Error(song.why);
  const r = song.result;
  lib.songs.push(title);
  const secs = n => secondsAt(r.seq, n.endTick) - secondsAt(r.seq, n.tick);
  if (song.kind === "seq") return vabSong(lib, title, r, secs);
  lib.drivers.add("akao");
  const ctx = r.instr;
  let d, sampleAt;
  if (ctx.kind === "akao-sets") { d = ctx.ram; sampleAt = rec => offerSpu(lib, d, rec.ramAddr, rec); }
  else { d = new Uint8Array(ram); const B = song.bank.base; sampleAt = rec => offerSpu(lib, d, B + rec.addr, rec); }
  const recOf = art => ctx.kind === "akao-sets" ? akaoRecord(ctx, art) : readInstr(d, ctx.offset, art);
  const akao = parseAKAO(ram, pickAKAO(ram, ranges, file).offset);
  const played = r.notes.filter(n => !n.unrolled);
  const fact = (n, key) => ({key, secs: secs(n), vel: n.vel});

  // melodic articulations
  const byArt = new Map(), splits = new Map(), kitNotes = [];
  for (const n of played) {
    if (n.drum) { if (n.tone) kitNotes.push(n); continue; }
    if (n.program >= 0x80 && n.tone) { (splits.get(n.program) || splits.set(n.program, []).get(n.program)).push(n); continue; }
    const a = akaoArtOf(n);
    (byArt.get(a) || byArt.set(a, []).get(a)).push(n);
  }
  for (const [art, notes] of byArt) {
    const rec = recOf(art);
    if (!rec) { lib.warn(`${title}: articulation ${art} is not in the image (renders silent)`); continue; }
    lib.use(artInstrument(lib, title, rec, sampleAt), title, notes.map(n => fact(n, n.key)));
  }
  // the bank's other articulations, flagged unused — INSTR.DAT only: it is the
  // game's one table, where a sample set is loaded per song and its unplayed
  // slots would repeat in every song that loads it
  if (unused) {
    if (ctx.kind === "akao-sets") { /* per-song sets: played articulations only */ }
    else for (let a = 0; a < (song.table ? song.table.count : 0); a++) { const rec = readInstr(d, ctx.offset, a); if (rec && rec.addr) { try { artInstrument(lib, title, rec, sampleAt); } catch { /* a slot outside the bank */ } } }
  }

  // key-split programs
  const splitDefs = new Map(); // program -> regions [{art, lo, hi, vol, ...}], inferred?
  if (akao.version >= 3 && akao.instrTable != null) {
    const b = akao.bytes;
    for (let a = 0; a < 16; a++) {
      const ptr = b[akao.instrTable + a * 2] | (b[akao.instrTable + a * 2 + 1] << 8);
      if (ptr === 0xFFFF || (!ptr && a)) continue;
      const regs = readRegions(b, akao.instrTable + 0x20 + ptr, 3);
      if (regs.length) splitDefs.set(0x80 + a, {regs, inferred: false});
    }
  }
  for (const [prog, notes] of splits) {
    if (splitDefs.has(prog)) continue;
    // inline regions (layouts 1.1/2): the keys played, grouped by articulation, widened to meet
    const byKey = new Map(); for (const n of notes) byKey.set(n.key, {art: n.tone.instrument, vol: n.tone.vol});
    const keys = [...byKey.keys()].sort((a, b) => a - b), regs = [];
    for (const k of keys) { const e = byKey.get(k), last = regs[regs.length - 1]; if (last && last.art === e.art && last.vol === e.vol) last.hi = k; else regs.push({art: e.art, lo: k, hi: k, vol: e.vol}); }
    for (let i = 0; i < regs.length; i++) { regs[i].lo = i ? Math.floor((regs[i - 1].hi + regs[i].lo) / 2) + 1 : 0; if (i + 1 === regs.length) regs[i].hi = 127; else regs[i].hi = Math.floor((regs[i].hi + regs[i + 1].lo) / 2); }
    splitDefs.set(prog, {regs, inferred: true});
  }
  for (const [prog, def] of splitDefs) {
    const regions = [];
    const raws = [];
    for (let i = 0; i < def.regs.length; i++) {
      const g = def.regs[i];
      const rec = recOf(g.art);
      if (!rec) continue;
      const src = sampleAt(rec);
      // the driver covers the keyboard: below the first region plays it, past the last the last
      const keyLo = i === 0 ? 0 : g.lo, keyHi = i === def.regs.length - 1 ? 127 : g.hi;
      for (const x of artRegions(rec, {src})) {
        const lo = Math.max(keyLo, x.keyLo), hi = Math.min(keyHi, x.keyHi);
        if (lo <= hi) regions.push({...x, keyLo: lo, keyHi: hi, gain: round(0.5 * Math.min(1, g.vol / 127), 5), envelope: spuEnvelope(rec), raw: {art: g.art, region: g}});
      }
      raws.push({...g, rec: recSig(rec), src});
    }
    if (!regions.length) continue;
    const sig = sigOf(raws);
    const inst = lib.addInstrument({id: "akao:split:" + sig, driver: "akao", bank: "split", program: prog, kind: "melodic", pan: null, gain: 0.5,
      velocityCurve: "linear", maxRatio: null, envelope: regions[0].envelope, keyRegions: regions,
      raw: {kind: "akao-key-split", regions: def.regs, inferredBounds: def.inferred}}, sig);
    // the first region's envelope is the instrument's; regions carry their own only where it differs
    for (const x of inst.keyRegions) if (x.envelope === inst.envelope) delete x.envelope;
    lib.use(inst, title, (splits.get(prog) || []).map(n => fact(n, n.key)));
  }

  // drum kits: layout 3's table, else the maps as played
  if (kitNotes.length) {
    const entries = new Map(); // key -> {art, toneKey, vol, pan}
    if (akao.version >= 3 && akao.drumTable != null) {
      const b = akao.bytes;
      for (let k = 0; k < 128; k++) {
        const o = akao.drumTable + k * 8;
        if (o + 8 > b.length) break;
        const w0 = b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24, w1 = b[o + 4] | b[o + 5] << 8 | b[o + 6] << 16 | b[o + 7] << 24;
        if (!w0 && !w1) continue; // runTrack's drumEntry: an all-zero entry is none
        entries.set(k, {art: b[o], toneKey: b[o + 1], vol: b[o + 6] ? Math.round(b[o + 6] * 127 / 128) : 127, pan: b[o + 7] & 0x7F});
      }
    }
    for (const n of kitNotes) if (!entries.has(n.key) || !(akao.version >= 3)) entries.set(n.key, {art: n.tone.instrument, toneKey: n.tone.key, vol: n.tone.vol, pan: n.tone.pan});
    addKit(lib, title, entries, recOf, sampleAt, kitNotes.map(n => ({...fact(n, n.key), slot: n.key})), akao.version >= 3 ? "header table" : "as played");
  }
  return {title, notes: played.length};
}

function addKit(lib, title, entries, recOf, sampleAt, facts, how) {
  const regions = [], raws = [];
  for (const [k, e] of [...entries].sort((a, b) => a[0] - b[0])) {
    const rec = recOf(e.art);
    if (!rec) continue;
    const src = sampleAt(rec);
    const root = rootFor(rec, e.toneKey);
    regions.push({keyLo: k, keyHi: k, rootKey: round(k - (e.toneKey - root), 4), fixedPitch: true, src,
      gain: round(0.5 * Math.min(1, (e.vol != null ? e.vol : 127) / 127), 5), pan: panOf(e.pan), envelope: spuEnvelope(rec),
      raw: {slot: k, art: e.art, key: e.toneKey, vol: e.vol, pan: e.pan, rec: rawRec(rec)}});
    raws.push([k, e.art, e.toneKey, e.vol, e.pan, src, recSig(rec)]);
  }
  if (!regions.length) return;
  // maps as played are partial: one that agrees with a kit already found on every shared slot is that kit
  const mine = new Map(raws.map(x => [x[0], JSON.stringify(x)]));
  let host = null;
  for (const rec of lib.inst.values()) {
    if (rec.driver !== "akao" || rec.kind !== "drum-kit") continue;
    const theirs = new Map(rec._entries);
    // the same map heard in two songs: every slot both played is the same entry
    const shared = [...mine.keys()].filter(k => theirs.has(k));
    if (!shared.length || shared.some(k => theirs.get(k) !== mine.get(k))) continue;
    const fresh = regions.filter(x => !theirs.has(x.keyLo));
    if (fresh.length) { rec.keyRegions = [...rec.keyRegions, ...fresh].sort((a, b) => a.keyLo - b.keyLo); rec._entries = [...theirs, ...[...mine].filter(([k]) => !theirs.has(k))]; }
    host = rec; break;
  }
  if (!host) {
    const sig = sigOf(raws);
    host = lib.addInstrument({id: "akao:kit:" + sig, driver: "akao", bank: "kit", program: null, kind: "drum-kit", pan: null, gain: 0.5,
      velocityCurve: "linear", maxRatio: null, envelope: regions[0].envelope, keyRegions: regions, raw: {kind: "akao-drum-map", entries: how}}, sig);
    host._entries = [...mine];
  }
  lib.use(host, title, facts);
}

// ---- Sony SEQ/VAB -----------------------------------------------------------------
function vabSong(lib, title, r, secs) {
  lib.drivers.add("vab");
  const vab = r.vab;
  const master = (vab.masterVol != null ? vab.masterVol : 127) / 127;
  const byProg = new Map();
  for (const n of r.notes) (byProg.get(n.program) || byProg.set(n.program, []).get(n.program)).push(n);
  vab.programs.forEach((prog, p) => {
    if (!prog) return;
    const regions = [];
    for (const t of prog.tones) {
      if (!(t.vag > 0)) continue;
      const src = "vab:" + vab.vabId + ":" + t.vag;
      lib.offerSample(src, () => { const s = vagPcm(vab, t.vag); return s && {pcm: s.pcm, rate: SPU_RATE, loop: s.oneShot || s.loopStart == null ? null : {start: s.loopStart, end: s.loopEnd != null ? s.loopEnd : s.pcm.length}}; }, 1);
      regions.push({keyLo: t.min, keyHi: t.max, rootKey: round(t.center - t.shift / 128, 4), src,
        gain: round(0.5 * Math.min(1, t.vol / 127 * (prog.mvol != null ? prog.mvol : 127) / 127 * master), 5),
        pan: panOf(64 + (t.pan - 64) + ((prog.mpan != null ? prog.mpan : 64) - 64)), envelope: spuEnvelope(adsrRecord(t.adsr1, t.adsr2)), raw: {tone: t.index, ...t}});
    }
    if (!regions.length) return;
    const inst = lib.addInstrument({id: `vab:${vab.vabId}:${p}`, driver: "vab", bank: vab.vabId, program: p, kind: "melodic", pan: null, gain: 0.5,
      velocityCurve: "linear", maxRatio: null, envelope: regions[0].envelope, keyRegions: regions, raw: {kind: "vab-program", mvol: prog.mvol, mpan: prog.mpan}},
      sigOf(regions.map(x => [x.keyLo, x.keyHi, x.rootKey, x.src, x.gain])));
    for (const x of inst.keyRegions) if (x.envelope === inst.envelope) delete x.envelope;
    lib.use(inst, title, (byProg.get(p) || []).map(n => ({key: n.key, secs: secs(n), vel: n.vel})));
  });
  return {title, notes: r.notes.length};
}

export function psxFiles(dir) { return readdirSync(dir).filter(f => /\.(mini)?psf$/i.test(f)).sort(); }
