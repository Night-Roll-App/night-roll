// tools/measure-loudness.mjs — measures each published capture song's console
// render and stores the facts the app's song gain is built from
// (docs/plans/2026-10-07-console-loudness.md §4A; src/audio/loudness.js).
//
//   node tools/measure-loudness.mjs [--console nes] [--album <console>/<slug>|<slug>] [--songs a,b] [--limit N] [--secs S] [--cache /tmp/recap/rips] [--jsonl out.jsonl]
//       dry run (the default): fetch (cached), render, measure, print a table —
//       before (today's fixed 0.22 master) and after (the song gain) for the
//       console voice and the synth ("Hear the MIDI"). Writes nothing in the repo.
//   node tools/measure-loudness.mjs --apply --album <console>/<slug>
//       the same for ONE album, then writes nsf.tracks[base].loud =
//       {v, lufs, peak, synth} into that album's album.json and nothing else.
//
// The render is the app's own: RUNNERS from tools/chip-worker.mjs (the exact
// worker pipeline) on the rip from the public archive (recapture.mjs
// fetchVault — status, size and magic checked), the song's own track number
// and length (chipSource's: n, ⌈secs+1⌉), trimmed at the capture's lead and
// mixed the way the app's graph mixes it (loudMix). The synth figure is
// tools/loudness-synth.mjs on the published .mid. Facts of the file only: a
// game's identity never enters a number (CLAUDE.md, capture engines).
//
// Hard allowlist: --apply writes only albums/{nes,game-boy,snes,ps1,ps2,n64}/<slug>/album.json,
// one album per run; never compositions/ or starters/, never a .mid.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listAlbums, fetchVault, vaultFilesOf, CONSOLES } from "./recapture.mjs";
import { measureLoudness, loudMix, songGainDb, synthMatchDb, LOUD_VERSION } from "../src/audio/loudness.js";
import { synthMix } from "./loudness-synth.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SELF = fileURLToPath(import.meta.url);
export const OLD_MASTER_DB = 20 * Math.log10(0.22); // the fixed MASTER_VOL every source went through before this change

// The app's CHIPS[kind] module lists (src/audio/chip.js) — a test keeps them equal.
export const LOUD_CHIP_FILES = {
  nsf: {files: ["nsf/nsf", "nsf/notes", "nsf/midi-write", "nsf/apu-render"], shared: [], own: []},
  gbs: {files: ["gbs/gbs", "gbs/notes", "gbs/apu-render"], shared: ["nsf/notes", "nsf/midi-write"], own: ["reconstruct", "toNotesTxt"]},
  spc: {files: ["spc/spc", "spc/notes", "?spc/apu-render"], shared: ["nsf/notes", "nsf/midi-write"], own: ["reconstruct", "toNotesTxt"]},
  psf: {files: ["psx/psf", "psx/akao", "psx/seq", "psx/vab", "psx/notes", "psx/spu-render", "psx/capture"], shared: ["sounding", "note-preview"], own: []},
  psf2: {files: ["ps2/psf2", "ps2/sq", "ps2/hd", "ps2/bgm", "ps2/wd", "ps2/capture", "psx/vab", "psx/notes", "psx/spu-render"], shared: ["sounding", "note-preview"], own: []},
  usf: {files: ["n64/usf", "n64/ead-usf", "n64/seq-libultra", "n64/notes", "n64/capture", "n64/vadpcm", "n64/bank", "n64/render", "n64/rare"], shared: ["sounding", "note-preview"], own: []},
};
const RENDER_RATE = {spc: 32000}; // CHIPS[kind].renderRate; everything else renders at the device rate (44.1k here)
const EXT = {nsf: ".nsf", gbs: ".gbs", spc: ".spc", psf: ".psf", psf2: ".psf2", usf: ".usf"};
const PERFILE = new Set(["spc", "psf", "psf2", "usf"]);

function browserStubs() { // parse.js and the pipelines touch a few browser globals at import
  if (!globalThis.localStorage) globalThis.localStorage = {getItem() { return null; }, setItem() {}, removeItem() {}};
  if (!globalThis.window) globalThis.window = globalThis;
  if (!globalThis.document) globalThis.document = {addEventListener() {}};
  if (!globalThis.location) globalThis.location = {search: "", href: "http://localhost/"};
}
const modCache = {};
async function loadModules(kind) {
  if (modCache[kind]) return modCache[kind];
  const c = LOUD_CHIP_FILES[kind];
  const one = f => import(pathToFileURL(path.join(ROOT, "tools", f.replace(/^\?/, "") + ".mjs")).href).catch(e => { if (f[0] === "?") return {}; throw e; });
  const parts = await Promise.all(c.files.map(one)), sh = await Promise.all(c.shared.map(one));
  const M = Object.assign({}, ...parts, ...sh);
  for (const k of c.own) for (const p of parts) if (p[k]) M[k] = p[k];
  return (modCache[kind] = M);
}

// {lufs, peak} of one song's console voice as the app plays it, at unity
export async function measureConsole(kind, bytes, libs, n, secs) {
  browserStubs();
  const { RUNNERS } = await import("./chip-worker.mjs");
  const R = RUNNERS[kind], M = await loadModules(kind);
  const res = await R.run(M, R.parse(M)(bytes, libs), n, secs, () => {});
  const lead = R.lead ? R.lead(M, res) : 0;
  const r = await R.render(M, res, {sampleRate: RENDER_RATE[kind] || 44100, onProgress: () => {}});
  const fs = r.sampleRate || RENDER_RATE[kind] || 44100;
  const isPcm = x => x instanceof Float32Array || !!(x && x.l instanceof Float32Array);
  const names = R.channels || Object.keys(r).filter(k => isPcm(r[k]));
  const tracks = {}; for (const nm of names) if (isPcm(r[nm])) tracks[nm] = r[nm];
  const {L, R: Rr} = loudMix(tracks, fs, {lead, secs});
  return measureLoudness(L, Rr, fs);
}
export async function measureSynth(midPath, secs) {
  browserStubs();
  const { parseMidi, tickToSec } = await import("../src/midi/parse.js");
  const song = parseMidi(new Uint8Array(readFileSync(midPath)));
  const s = synthMix(song, tickToSec, secs);
  return measureLoudness(s.L, s.R, s.fs).lufs;
}

function parseArgs(argv) {
  const o = {apply: false, console: null, album: null, songs: null, limit: 0, secs: 0, cache: "/tmp/recap/rips", jsonl: null};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], nx = () => argv[++i];
    if (a === "--apply") o.apply = true;
    else if (a === "--console") o.console = nx();
    else if (a === "--album") o.album = nx();
    else if (a === "--songs") o.songs = nx().split(",");
    else if (a === "--limit") o.limit = +nx();
    else if (a === "--secs") o.secs = +nx();
    else if (a === "--cache") o.cache = nx();
    else if (a === "--jsonl") o.jsonl = nx();
    else { console.error("unknown argument " + a); process.exit(1); }
  }
  return o;
}
const f1 = x => Number.isFinite(x) ? (x >= 0 ? " " : "") + x.toFixed(1) : "   —";

async function measureAlbum(a, o) {
  const nsf = a.meta.nsf, kind = a.chip;
  const songDir = existsSync(path.join(a.dir, "songs")) ? path.join(a.dir, "songs") : a.dir;
  const files = vaultFilesOf(a), libs = {}, rips = {};
  for (const f of files) {
    if (f.base && o.songs && !o.songs.includes(f.base)) continue;
    const got = await fetchVault(f.vault, o.cache, f.lib ? null : f.kind);
    if (!got.ok) { console.log(`  ✗ ${f.vault}: ${got.why}`); continue; }
    const b = new Uint8Array(readFileSync(got.path));
    if (f.lib) libs[f.name.toLowerCase()] = b; else rips[f.vault] = b;
  }
  const out = [];
  let count = 0;
  for (const [base, tr0] of Object.entries(nsf.tracks)) {
    if (o.songs && !o.songs.includes(base)) continue;
    if (o.limit && count >= o.limit) break;
    const tr = typeof tr0 === "number" ? {n: tr0} : tr0;
    const mid = path.join(songDir, base + ".mid");
    if (!tr || !existsSync(mid)) continue;
    const own = !!tr.vault, perFile = !own && (PERFILE.has(kind) || !!nsf.perFile);
    const vault = own ? tr.vault : perFile ? nsf.vault + (tr.rip || base) + EXT[kind] : nsf.vault; // tr.rip: a "(re-capture)" copy's source song
    const bytes = rips[vault];
    if (!bytes) { out.push({base, error: "rip not available"}); continue; }
    count++;
    const secs = o.secs || Math.ceil((tr.secs || 75) + 1);
    const t0 = Date.now();
    try {
      const c = await measureConsole(kind, bytes, libs, perFile ? 1 : tr.n, secs);
      const synth = await measureSynth(mid, secs);
      const loud = {v: LOUD_VERSION, lufs: c.lufs, peak: c.peak, synth: Number.isFinite(synth) ? synth : undefined};
      const g = songGainDb(loud), m = synthMatchDb(kind, loud), mConst = synthMatchDb(kind, {lufs: loud.lufs});
      const row = {album: a.id, base, kind, secs, ...loud, gain: +g.toFixed(1),
        before: {console: +(c.lufs + OLD_MASTER_DB).toFixed(1), synth: +(synth + OLD_MASTER_DB).toFixed(1)},
        after: {console: +(c.lufs + g).toFixed(1), peak: +(c.peak + g).toFixed(1), synth: +(synth + g + m).toFixed(1), synthByConst: +(synth + g + mConst).toFixed(1)},
        ms: Date.now() - t0};
      out.push(row);
      console.log(`  ${base.slice(0, 34).padEnd(34)} ${f1(c.lufs)} LUFS ${f1(c.peak)} pk  synth ${f1(synth)} │ gain ${f1(g)} dB │ console ${f1(row.before.console)} → ${f1(row.after.console)} (pk ${f1(row.after.peak)}) │ synth ${f1(row.before.synth)} → ${f1(row.after.synth)} (const ${f1(row.after.synthByConst)})  ${(row.ms / 1000).toFixed(1)}s`);
      if (o.jsonl) appendFileSync(o.jsonl, JSON.stringify(row) + "\n");
    } catch (err) {
      out.push({base, error: String(err && err.message || err)});
      console.log(`  ${base.slice(0, 34).padEnd(34)} ✗ ${err && err.message || err}`);
    }
  }
  return out;
}

// --apply's only write: album.json's nsf.tracks[base].loud, inside the allowlist
export function applyLoudness(albumDir, rows) {
  const rel = path.relative(path.join(ROOT, "albums"), albumDir).split(path.sep);
  if (rel.length !== 2 || !CONSOLES.includes(rel[0])) throw new Error("not a capture album: " + albumDir);
  const aj = path.join(albumDir, "album.json");
  const text = readFileSync(aj, "utf8"), meta = JSON.parse(text);
  let n = 0;
  for (const r of rows) {
    if (r.error || !Number.isFinite(r.lufs)) continue;
    const tr = meta.nsf.tracks[r.base];
    if (!tr || typeof tr !== "object") continue;
    tr.loud = {v: r.v, lufs: r.lufs, peak: r.peak, ...(Number.isFinite(r.synth) ? {synth: r.synth} : {})};
    n++;
  }
  const indent = (text.match(/\n( +)"/) || [, " "])[1];
  writeFileSync(aj, JSON.stringify(meta, null, indent.length) + "\n");
  return n;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  const o = parseArgs(process.argv.slice(2));
  if (o.apply && !o.album) { console.error("--apply needs --album <console>/<slug> (one album per run)"); process.exit(1); }
  if (o.apply && (o.limit || o.secs || o.songs)) { console.error("--apply measures the whole album as the app plays it: no --limit/--secs/--songs"); process.exit(1); }
  const albums = listAlbums({consoleName: o.console, album: o.album});
  if (!albums.length) { console.error("no capture album matches"); process.exit(1); }
  for (const a of albums) {
    console.log(`# ${a.id} (${a.chip})`);
    const rows = await measureAlbum(a, o);
    if (o.apply) console.log(`# wrote loud for ${applyLoudness(a.dir, rows)} song(s) to ${path.relative(ROOT, path.join(a.dir, "album.json"))}`);
  }
}
