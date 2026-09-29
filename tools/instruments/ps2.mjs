// PlayStation 2 instruments: every PSF2 song (Sony's stock SQ/HD/BD driver,
// or Square Enix's own BGM/WD driver — tools/ps2/capture.mjs's own song
// finder, ps2Song()) through the exact vab.mjs/instr.mjs/spu-render.mjs
// readers tools/instruments/psx.mjs's own VAB path already uses: both
// HD/BD's and WD's toBank() (tools/ps2/hd.mjs, tools/ps2/wd.mjs) reshape
// into vab.mjs's own {programs, vags, body} bank shape, so an instrument
// here is exactly what tools/psx/spu-render.mjs's renderSpu() plays for
// either driver — no PS2-specific render math anywhere in this module.
//
// Unlike PS1 SEQ/VAB (one bank shared by the whole game, so a stable
// vabId:program pair is a fine instrument identity — see psx.mjs's own
// vabSong), PS2's bank is per-SONG: Sony's driver loads a fresh HD/BD pair
// per mini (Dark Cloud's own psf2.ini), and even Square's own WD, though
// often shared by several BGMs, is never one album-wide table. A program
// NUMBER is therefore only ever a per-song accident of that bank's own
// layout — the same piano can sit at program 4 in one dungeon's bank and
// program 9 in another's, exactly the problem SNES's own per-song ARAM
// snapshot has (snes.mjs's header). So an instrument here is identified by
// CONTENT — its region set's sample hashes, key ranges, gains, pan — not
// by (bank, program): the id itself carries that signature (`sigOf`), so
// the exact same instrument met in two different songs' banks is one
// library entry, not two.
//
// Percussion: tools/psx/notes.mjs's own isDrumProgram (several one- or
// near-one-key tones on different samples) — reused unmodified, exactly
// the rule seqNotes() already applies per note (n.drum) for any VAB-shaped
// bank, PS1 or PS2. A drum program's tones become kind "drum-kit", one
// region per KEY the tone's own range covers (not one region per tone —
// tools/instruments/psx.mjs's own addKit() builds AKAO's drum table the
// same way, one region per slot, so the per-slot note counts name.mjs's
// nameAll() keys by `region.keyLo` line up), fixedPitch at the tone's own
// center/fine-tune (no pitch change whatever key of its range triggers
// it — read straight from the bank's own key splits, no driver table
// needed the way AKAO's drum table is).
//
// Sample rate: Sony's HD/BD carries each sample's own real rate (hd.mjs's
// vagInfos[].sampleRate, 22050-44100 Hz seen in real Dark Cloud files);
// Square's WD has no such field (its VAGs always play at the PS2's fixed
// 44100 Hz, same as PS1) — tools/ps2/hd.mjs's toBank() carries the field
// through as vags[].rate, tools/ps2/wd.mjs's toBank() never sets it, and
// this module — like tools/psx/spu-render.mjs's own vabVoices() — falls
// back to 44100 when it's absent, so a sample's `rate` in the library is
// exactly what the renderer used.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { loadPSF2Chain, mergePSF2, parsePSF2 } from "../ps2/psf2.mjs";
import { ps2Song as ps2CaptureSong } from "../ps2/capture.mjs";
import { isDrumProgram } from "../psx/notes.mjs";
import { adsrRecord } from "../psx/instr.mjs";
import { decodeAdpcm } from "../psx/vab.mjs";
import { secondsAt } from "../psx/seq.mjs";
import { renderSpu } from "../psx/spu-render.mjs";
import { spuEnvelope } from "./psx.mjs";
import { round, sigOf } from "./model.mjs";
import { playNote, samplesFromLibrary } from "./play.mjs";

const SPU_RATE = 44100;

function panOf(p) { return p == null ? null : round((Math.max(0, Math.min(127, p)) - 64) / 64, 3); }

// content key of one VAG: raw SPU-ADPCM bytes up to its own end-flagged
// block (the same self-terminating walk tools/psx/vab.mjs's decodeAdpcm()
// stops at) — a VAG loaded at a different offset/program in another song,
// byte-identical, hashes the same (loop points are in-band, part of these
// same bytes, so no separate loop tag is needed the way psx.mjs's own AKAO
// sampleKeyAt() adds one for its out-of-band loop field).
function vagContentKey(body, offset) {
  let len = 16;
  while (offset + len + 16 <= body.length && !(body[offset + len - 16 + 1] & 1) && len < 0x80000) len += 16;
  const h = createHash("sha1").update(body.subarray(offset, offset + len)).digest("hex").slice(0, 16);
  return "ps2vag:" + h;
}

function offerVag(lib, body, v, rate) {
  const src = vagContentKey(body, v.offset);
  lib.offerSample(src, () => {
    const dec = decodeAdpcm(body, v.offset, Math.max(0, Math.min(v.size, body.length - v.offset)));
    if (!dec.pcm.length) return null;
    return {pcm: dec.pcm, rate, loop: dec.oneShot || dec.loopStart == null ? null : {start: dec.loopStart, end: dec.loopEnd != null ? dec.loopEnd : dec.pcm.length}};
  }, 1);
  return src;
}

// one VAB-shaped bank (tools/ps2/hd.mjs / tools/ps2/wd.mjs toBank()) ->
// its instruments, one per non-empty program. -> Map(program -> {inst, drum})
export function bankInstruments(lib, driverTag, vab) {
  const body = vab.body;
  const master = (vab.masterVol != null ? vab.masterVol : 127) / 127;
  const out = new Map();
  if (!body) return out;
  vab.programs.forEach((prog, p) => {
    if (!prog || !prog.tones.length) return;
    const drum = isDrumProgram(prog);
    const regions = [], raws = [];
    for (const t of prog.tones) {
      if (!(t.vag > 0)) continue;
      const v = vab.vags[t.vag];
      if (!v) continue;
      const rate = v.rate || SPU_RATE;
      const src = offerVag(lib, body, v, rate);
      const rootKey = round(t.center - t.shift / 128, 4);
      const gain = round(0.5 * Math.min(1, t.vol / 127 * (prog.mvol != null ? prog.mvol : 127) / 127 * master), 5);
      const pan = panOf(64 + (t.pan - 64) + ((prog.mpan != null ? prog.mpan : 64) - 64));
      const env = spuEnvelope(adsrRecord(t.adsr1, t.adsr2));
      const raw = {tone: t.index, vag: t.vag, min: t.min, max: t.max, center: t.center, shift: t.shift};
      if (drum) {
        const hi = Math.max(t.min, t.max);
        for (let k = t.min; k <= hi; k++) {
          regions.push({keyLo: k, keyHi: k, rootKey, fixedPitch: true, fixedKey: rootKey, src, gain, pan, envelope: env, raw});
          raws.push([k, rootKey, src, gain, pan]);
        }
      } else {
        regions.push({keyLo: t.min, keyHi: t.max, rootKey, src, gain, pan, envelope: env, raw});
        raws.push([t.min, t.max, rootKey, src, gain, pan]);
      }
    }
    if (!regions.length) return;
    const sig = sigOf([driverTag, drum, raws]);
    const id = `ps2:${drum ? "kit" : "inst"}:${sig}`;
    const inst = lib.addInstrument({id, driver: driverTag, bank: driverTag, program: p, kind: drum ? "drum-kit" : "melodic",
      pan: null, gain: 0.5, velocityCurve: "linear", maxRatio: null, envelope: regions[0].envelope, keyRegions: regions,
      raw: {kind: driverTag === "ps2-bgm" ? "ps2-bgm-program" : "ps2-sq-program", mvol: prog.mvol, mpan: prog.mpan}}, sig);
    for (const x of inst.keyRegions) if (x.envelope === inst.envelope) delete x.envelope;
    out.set(p, {inst, drum});
  });
  return out;
}

// the merged PSF2 filesystem + this file's own source entry, from a
// minipsf2/psf2 on disk and its sibling .psf2lib(s) — mirrors
// tools/ps2/dump.mjs's own loadPSF2Chain/mergePSF2 call.
async function loadOne(dir, file) {
  const bytes = readFileSync(join(dir, file));
  const name = basename(file);
  const readLib = async n => { const p = join(dir, n); return existsSync(p) ? readFileSync(p) : null; };
  const chain = await loadPSF2Chain(bytes, readLib, {name});
  const mini = chain.find(s => s.name === name);
  return {tags: parsePSF2(bytes).tags || {}, mini, files: mergePSF2(chain)};
}

// -> {title, kind, r (the seqNotes()-shaped result), vab}
async function songOf(dir, file) {
  const {tags, mini, files} = await loadOne(dir, file);
  const title = tags.title || basename(file).replace(/\.(mini)?psf2$/i, "");
  const song = await ps2CaptureSong(files, mini);
  if (!song.renderable) throw new Error(`${title}: ${song.why}`);
  return {title, kind: song.kind, r: song.result, vab: song.result.vab};
}

// one PSF2 song -> its instruments, merged into `lib` by content.
export async function ps2Song(lib, dir, file, {unused = true} = {}) {
  const {title, kind, r, vab} = await songOf(dir, file);
  lib.songs.push(title);
  const driverTag = kind === "bgm" ? "ps2-bgm" : "ps2-sq";
  lib.drivers.add(driverTag);
  const secs = n => secondsAt(r.seq, n.endTick) - secondsAt(r.seq, n.tick);
  const built = bankInstruments(lib, driverTag, vab);
  const byProg = new Map();
  for (const n of r.notes) (byProg.get(n.program) || byProg.set(n.program, []).get(n.program)).push(n);
  for (const [p, notes] of byProg) {
    const b = built.get(p);
    if (!b) continue; // a program the score names that the bank has no tones for (renders silent — nothing to extract)
    const facts = notes.map(n => ({key: n.key, secs: secs(n), vel: n.vel, ...(b.drum ? {slot: n.key} : {})}));
    lib.use(b.inst, title, facts);
  }
  return {title, notes: r.notes.length};
}

export function ps2Files(dir) {
  return readdirSync(dir).filter(f => /\.(mini)?psf2$/i.test(f)).sort();
}

// ---- verify.mjs-style check: the library's play.mjs render against the
// driver's own renderSpu(), reused unmodified (see module header) ---------
// A handful of real notes, one per (program, drum?) group actually played,
// each rendered twice — by renderSpu() (the note alone, dry, centred) and
// by play.mjs from the extracted library — and compared the same way
// tools/instruments/verify.mjs's compare() does (period-pitch cents,
// 5 ms-RMS envelope shape correlation, RMS level in dB). Kept in this
// module rather than added to verify.mjs's own driver dispatch (a large,
// already-tested file another agent may be mid-change on): same math,
// smaller surface.
function pickPs2Notes(notes, max) {
  const by = new Map();
  for (const n of notes) { const k = (n.drum ? "kit" : "p") + n.program; (by.get(k) || by.set(k, []).get(k)).push(n); }
  const groups = [...by.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, max);
  return groups.map(([k, ns]) => { const s = ns.slice().sort((a, b) => (a.endTick - a.tick) - (b.endTick - b.tick)); return {group: k, n: s[s.length >> 1]}; });
}
function rmsFrames(x, rate, ms = 5) {
  const F = Math.max(1, Math.round(rate * ms / 1000)), out = [];
  for (let i = 0; i < x.length; i += F) { let s = 0, n = 0; for (let k = i; k < Math.min(x.length, i + F); k++) { s += x[k] * x[k]; n++; } out.push(Math.sqrt(s / Math.max(1, n))); }
  return out;
}
function correlation(a, b) {
  const n = Math.max(a.length, b.length);
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i] || 0; mb += b[i] || 0; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = (a[i] || 0) - ma, y = (b[i] || 0) - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : (saa === sbb ? 1 : 0);
}
const rms = x => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); };
function periodOf(x, rate, at, W = 4096) {
  const minLag = Math.floor(rate / 3000), maxLag = Math.min(Math.ceil(rate / 30), x.length - at - 2);
  W = Math.min(W, x.length - at - maxLag - 1);
  if (W < 256 || maxLag <= minLag) return null;
  let e0 = 0; for (let i = 0; i < W; i++) e0 += x[at + i] * x[at + i];
  if (e0 < 1e-9) return null;
  let best = 0, bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0, e1 = 0;
    for (let i = 0; i < W; i++) { const b = x[at + i + lag]; s += x[at + i] * b; e1 += b * b; }
    const r = e1 > 0 ? s / Math.sqrt(e0 * e1) : 0;
    if (r > best) { best = r; bestLag = lag; }
  }
  return best >= 0.5 ? bestLag : null;
}

// node tools/instruments/ps2.mjs verify <ripdir> <song regex> [--notes N]
export async function verifyPs2Song(dir, songRe, {maxNotes = 4} = {}) {
  const files = ps2Files(dir).filter(f => songRe.test(f));
  if (!files.length) throw new Error("no song matching " + songRe + " in " + dir);
  const file = files[0];
  const {title, kind, r, vab} = await songOf(dir, file);
  const driverTag = kind === "bgm" ? "ps2-bgm" : "ps2-sq";
  const lib = new (await import("./model.mjs")).Library({slug: "verify", title});
  const built = bankInstruments(lib, driverTag, vab);
  lib.songs.push(title);
  const byProg = new Map();
  for (const n of r.notes) (byProg.get(n.program) || byProg.set(n.program, []).get(n.program)).push(n);
  for (const [p, notes] of byProg) {
    const b = built.get(p); if (!b) continue;
    lib.use(b.inst, title, notes.map(n => ({key: n.key, secs: 0.1, vel: n.vel, ...(b.drum ? {slot: n.key} : {})})));
  }
  lib.finish();
  const samples = samplesFromLibrary(lib);
  const picks = pickPs2Notes(r.notes.filter(n => n.endTick - n.tick >= 6), maxNotes);
  const seq = {...r.seq, loop: null};
  const rows = [];
  for (const {group, n} of picks) {
    const note = {...n, tick: 0, endTick: n.endTick - n.tick, gain: undefined, slide: undefined};
    const one = {...r, notes: [note], seq};
    const hold = secondsAt(seq, note.endTick);
    const out = await renderSpu(one, {sampleRate: SPU_RATE, keepSeconds: hold + 4});
    const trk = Object.values(out).find(x => x && x.l);
    if (!trk) { rows.push({group, error: "the driver rendered nothing"}); continue; }
    const drv = new Float32Array(trk.l.length); for (let i = 0; i < drv.length; i++) drv[i] = trk.l[i] + trk.r[i];
    const b = built.get(n.program);
    if (!b) { rows.push({group, error: "not in the library"}); continue; }
    // the note's own channel volume/expression (n.chVol) is a performance
    // fact, deliberately left out of the instrument's own gain (model.mjs's
    // header: "Performance ... stays with the song, not the instrument") —
    // renderSpu's vabVoices() applies it to the driver's render regardless,
    // so it's folded into play.mjs's own `volume` factor here too, for a
    // fair level comparison (same note, same channel automation, not a
    // library defect: a real player would apply the track's own volume
    // the same way).
    const mine = playNote(b.inst, samples, {key: n.key, vel: n.vel, hold: Math.floor(hold * SPU_RATE) / SPU_RATE, sampleRate: SPU_RATE, tail: 8, volume: n.chVol != null ? n.chVol : 1});
    const fa = rmsFrames(drv, SPU_RATE), fb = rmsFrames(mine, SPU_RATE);
    const pk = Math.max(...fa, ...fb, 1e-9), lastAbove = f => { for (let i = f.length - 1; i >= 0; i--) if (f[i] > pk * 1e-3) return i; return 0; };
    const end = Math.max(lastAbove(fa), lastAbove(fb)) + 1;
    const shape = correlation(fa.slice(0, end), fb.slice(0, end));
    const F = Math.round(SPU_RATE * 0.005), len = end * F;
    const level = 20 * Math.log10(rms(drv.subarray(0, len)) / Math.max(1e-12, rms(mine.subarray(0, len))));
    const at = Math.min(Math.round(Math.max(0.03, Math.min(0.12, hold * 0.4)) * SPU_RATE), Math.max(0, len - 4096));
    const pa = periodOf(drv, SPU_RATE, at), pb = periodOf(mine, SPU_RATE, at);
    const pitch = pa && pb ? 1200 * Math.log2(pa / pb) : null;
    rows.push({group, id: b.inst.id, name: b.inst.nameGuess, key: n.key, vel: n.vel, hold: +hold.toFixed(3), pitch, shape, level});
  }
  return {file, title, rows};
}

if (process.argv[1] && process.argv[1].endsWith("ps2.mjs") && process.argv[2] === "verify") {
  const [, , , dir, re, ...rest] = process.argv;
  const maxNotes = (() => { const i = rest.indexOf("--notes"); return i >= 0 ? +rest[i + 1] : 4; })();
  verifyPs2Song(dir, new RegExp(re, "i"), {maxNotes}).then(({file, rows}) => {
    console.log(`## ${file}`);
    for (const row of rows) {
      if (row.error) { console.log(`  ${row.group}: ${row.error}`); continue; }
      console.log(`  ${row.group.padEnd(8)} ${(row.name || "").padEnd(16)} ${row.id.padEnd(24)} key ${String(row.key).padStart(3)} vel ${String(row.vel).padStart(3)} hold ${row.hold}s  pitch ${row.pitch == null ? "n/a" : row.pitch.toFixed(2) + "¢"}  shape ${row.shape.toFixed(4)}  level ${row.level.toFixed(2)} dB`);
    }
  }, e => { console.error(e.stack || e); process.exit(1); });
}
