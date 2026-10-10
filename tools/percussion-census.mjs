// tools/percussion-census.mjs — what the PS1/PS2 capture marks as kit, and
// what its samples measure (docs/plans/2026-10-09-percussion-detection.md
// §6 step 3). Facts only: it prints, it never decides and never writes a
// song file.
//
//   node tools/percussion-census.mjs --album ps1/final-fantasy-7 [--out /tmp/census] [--kit-only] [--json]
//       every song of a published album, its rips fetched the way
//       tools/recapture.mjs fetches them (the public archive, checked by
//       status, size and magic) and cached under --out/rips/
//   node tools/percussion-census.mjs <song.minipsf|song.minipsf2> … [--kit-only] [--json]
//       explicit files; each one's _lib is read from its own directory
//
// The capture is the app's own: psfSong (tools/psx/capture.mjs) or ps2Song
// (tools/ps2/capture.mjs), then channelGroups/kitify (tools/psx/notes.mjs) —
// the same calls src/audio/chip.js makes. The drum flags are read BEFORE
// kitify rewrites them, so each kit group says which rule put it there:
//   drum mode      an AKAO note in drum mode
//   drum-mode prog a program that is in drum mode elsewhere in the song
//   VAB kit        a VAB/HD program of 1–3-key tones on ≥ 2 samples (isDrumProgram)
//   one pitch ≥12  a program held at one pitch over ≥ 12 notes
// A group that is NOT kit but whose notes were in drum mode says `melodic
// bank`: kitify's drum-table bank rule took it out of the kit (§13).
// Per program, each sample a note plays (the renderer's own lookup:
// spu-render.mjs akaoVoices, vab.mjs tonesFor/vagPcm), measured once:
//   os/lp          one-shot vs looped (ADPCM end flag; AKAO record's loop offset)
//   r<conf>|r-     vab.mjs estimateRoot's confidence, "-" = no clear period
//   f / h          spectral flatness and harmonicity (tools/instruments/name.mjs
//                  measure) over the sample held 1 s, loop tiled
//   <n>s           the sample's own length (to its end flag)
// One line per channel group:
//   song | group | kit? rule | notes | keys | progs | per-program samples
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPSFChain, assembleRam } from "./psx/psf.mjs";
import { psfSong } from "./psx/capture.mjs";
import { loadPSF2Chain, mergePSF2 } from "./ps2/psf2.mjs";
import { ps2Song } from "./ps2/capture.mjs";
import { channelGroups, sampleFacts } from "./psx/notes.mjs";
import { tonesFor, vagPcm } from "./psx/vab.mjs";
import { akaoVoices } from "./psx/spu-render.mjs";

const SPU_RATE = 44100;

// kitify's rules, read from the notes as the capture left them (pre-kitify):
// program -> the rule that would mark it, or null
export function kitRules(notes, {vab = null} = {}) {
  const out = new Map();
  const drumProgs = new Set(notes.filter(n => n.drum).map(n => n.program));
  const byProg = new Map();
  for (const n of notes) (byProg.get(n.program) || byProg.set(n.program, []).get(n.program)).push(n);
  for (const [p, evs] of byProg) {
    if (drumProgs.has(p)) out.set(p, evs.every(n => n.drum) ? (vab ? "VAB kit" : "drum mode") : "drum-mode prog");
    else if (evs.length >= 12 && new Set(evs.map(n => n.pitch)).size === 1) out.set(p, "one pitch ≥12");
    else out.set(p, null);
  }
  return out;
}

// one decoded sample ({pcm, loopStart, loopEnd, oneShot}) -> its facts (the
// capture's own measurement: kitify's drum-table bank rule reads the same)
export { sampleFacts };

// the sample each note plays, as the console render picks it -> n => {id, smp, rate} | null
export function sampleLookup(result, song = {}) {
  if (result.vab) {
    const vab = result.vab;
    return n => {
      const t = tonesFor(vab, n.program, n.key)[0];
      if (!t) return null;
      const dec = vagPcm(vab, t.vag);
      if (!dec) return null;
      return {id: "v" + t.vag, smp: dec, rate: (vab.vags[t.vag] && vab.vags[t.vag].rate) || SPU_RATE};
    };
  }
  let voices;
  try { voices = akaoVoices(result, {ram: song.ram, table: song.table, bank: song.bank}, SPU_RATE); } catch { return () => null; }
  const ids = new Map();
  return n => {
    const v = voices(n)[0];
    if (!v || !v.smp) return null;
    if (!ids.has(v.smp)) ids.set(v.smp, "s" + ids.size);
    return {id: ids.get(v.smp), smp: v.smp, rate: SPU_RATE};
  };
}

// the song's channel groups with their facts. `result` must not have been
// through kitify yet (its drum flags are what the rules read).
export function censusRows(result, {song = "", lookup = () => null} = {}) {
  if (result.kitGuess) throw new Error("censusRows needs the capture before kitify");
  const pre = new Map(result.notes.map(n => [n, n.drum]));
  const rules = kitRules(result.notes, {vab: result.vab});
  const groups = channelGroups(result);
  const facts = new Map(); // sample id -> facts
  const rows = [];
  for (const g of groups) {
    const byProg = new Map();
    for (const n of g.notes) (byProg.get(n.program) || byProg.set(n.program, []).get(n.program)).push(n);
    const progs = [];
    const why = new Set();
    for (const [p, evs] of [...byProg].sort((a, b) => a[0] - b[0])) {
      if (g.kit) {
        if (evs.some(n => pre.get(n))) why.add(result.vab ? "VAB kit" : "drum mode");
        if (evs.some(n => !pre.get(n))) why.add(rules.get(p) || "?");
      }
      const samples = new Map();
      for (const n of evs) {
        const s = lookup(n);
        if (!s || samples.has(s.id)) continue;
        if (!facts.has(s.id)) facts.set(s.id, sampleFacts(s.smp, s.rate));
        samples.set(s.id, facts.get(s.id));
      }
      progs.push({program: p, notes: evs.length, keys: [...new Set(evs.map(n => n.key))].sort((a, b) => a - b), samples: [...samples].map(([id, f]) => ({id, ...f}))});
    }
    const keys = [...new Set(g.notes.map(n => n.key))].sort((a, b) => a - b);
    rows.push({song, group: g.name, kit: !!g.kit, rule: g.kit ? [...why].join("+") : g.notes.some(n => pre.get(n)) ? "melodic bank" : null, notes: g.notes.length, keys, programs: progs});
  }
  return rows;
}

// counts of the four (loop, root) shapes over a row's distinct samples:
// lpR looped + clear root, lp- looped no root, osR one-shot + root, os- one-shot no root
export function sampleShape(row) {
  const c = {"lpR": 0, "lp-": 0, "osR": 0, "os-": 0, none: 0};
  const seen = new Set();
  for (const p of row.programs) for (const s of p.samples) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    if (s.oneShot == null) c.none++;
    else c[(s.oneShot ? "os" : "lp") + (s.root ? "R" : "-")]++;
  }
  if (!seen.size) c.none = 1;
  return c;
}

const f2 = x => x == null ? "?" : x.toFixed(2).replace(/^0/, "");
export function formatSample(s) {
  if (s.oneShot == null) return s.id + ":?";
  return `${s.oneShot ? "os" : "lp"} r${s.root ? f2(s.root.confidence) : "-"} f${f2(s.flatness)} h${f2(s.harmonicity)} ${s.seconds}s`;
}
const keyList = ks => ks.length <= 8 ? ks.join(",") : ks.slice(0, 4).join(",") + "…" + ks.slice(-2).join(",");
export function formatRow(r) {
  const progs = r.programs.map(p => {
    const sm = p.samples.slice(0, 4).map(formatSample).join(" ");
    return `p${p.program}[${p.notes}n ${p.keys.length}k: ${sm || "no sample"}${p.samples.length > 4 ? " +" + (p.samples.length - 4) : ""}]`;
  }).join(" ");
  return [r.song, r.group, r.kit ? "KIT " + r.rule : r.rule ? "mel " + r.rule : "mel", r.notes + "n", r.keys.length + "k {" + keyList(r.keys) + "}", r.programs.length + "p", progs].join(" | ");
}

// ---------------------------------------------------------------- capture one file
const libReader = dir => {
  let names = null;
  return n => {
    const p = path.join(dir, n);
    if (existsSync(p)) return readFileSync(p);
    names = names || readdirSync(dir);
    const hit = names.find(x => x.toLowerCase() === n.toLowerCase());
    return hit ? readFileSync(path.join(dir, hit)) : null;
  };
};
export async function captureFile(file, {readLib = libReader(path.dirname(file)), name = path.basename(file)} = {}) {
  const bytes = new Uint8Array(readFileSync(file));
  if (bytes[3] === 0x02) {
    const chain = await loadPSF2Chain(bytes, readLib, {name});
    const files = mergePSF2(chain);
    const mini = chain.find(s => s.name === name);
    const song = await ps2Song(files, mini, {});
    return {result: song.result, song};
  }
  const chain = await loadPSFChain(bytes, readLib, {name});
  const {ram, ranges} = assembleRam(chain);
  const song = psfSong(ram, ranges, name);
  return {result: song.result, song: {...song, ram}};
}

// ---------------------------------------------------------------- CLI
async function main(argv) {
  const o = {album: null, out: "/tmp/percussion-census", kitOnly: false, json: false, files: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--album") o.album = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--kit-only") o.kitOnly = true;
    else if (a === "--json") o.json = true;
    else o.files.push(a);
  }
  const jobs = []; // {song, file, readLib, name}
  if (o.album) {
    const R = await import("./recapture.mjs");
    const [a] = R.listAlbums({album: o.album});
    if (!a || !/^psf2?$/.test(a.chip)) throw new Error("no PS1/PS2 capture album " + o.album);
    const cache = path.join(o.out, "rips");
    const byName = new Map();
    for (const f of R.vaultFilesOf(a)) {
      const got = await R.fetchVault(f.vault, cache, f.lib ? null : f.kind);
      if (!got.ok) { console.error(`# ${f.vault}: ${got.why}`); continue; }
      byName.set(f.name.toLowerCase(), got.path);
      if (!f.lib) jobs.push({song: f.base, file: got.path, name: f.name});
    }
    const readLib = n => byName.has(n.toLowerCase()) ? readFileSync(byName.get(n.toLowerCase())) : null;
    for (const j of jobs) j.readLib = readLib;
  } else for (const f of o.files) jobs.push({song: path.basename(f).replace(/\.mini.*$|\.psf2?$/i, ""), file: f});
  const all = [];
  for (const j of jobs) {
    let rows;
    try {
      const {result, song} = await captureFile(j.file, {...(j.readLib ? {readLib: j.readLib} : {}), ...(j.name ? {name: j.name} : {})});
      rows = censusRows(result, {song: j.song, lookup: sampleLookup(result, song)});
    } catch (err) { console.error(`# ${j.song}: ${err && err.message || err}`); continue; }
    for (const r of rows) {
      if (o.kitOnly && !r.kit) continue;
      all.push(r);
      if (!o.json) console.log(formatRow(r));
    }
  }
  if (o.json) console.log(JSON.stringify(all.map(r => ({...r, shape: sampleShape(r)}))));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(() => process.exit(0), err => { console.error(err && err.stack || err); process.exit(1); });
}
