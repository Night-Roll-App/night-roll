// tools/chip-bench.mjs <kind> <file> [lib...] [--seconds N] [--rate N] [--budget N] [--n N] [--json]
//
// Runs the SAME per-chip pipeline tools/chip-worker.mjs runs in the browser
// (parse -> run -> planChipRender -> render -> tallyChipRender) in plain
// Node, for ONE song, and prints: parse/render seconds, a SAMPLED peak of
// process.memoryUsage().arrayBuffers (Node has no running-peak counter of its
// own, so this polls while the render runs), and the tally's own peak/kept
// MB (docs/streamed-render-plan.md step 0 — "before" numbers for the
// streamed-render work; RUNNERS/planChipRender/chipEstimateTracksW/
// tallyChipRender are imported straight from chip-worker.mjs, not copied).
//
// Usage:
//   node tools/chip-bench.mjs nsf path/to/song.nsf --seconds 30
//   node tools/chip-bench.mjs gbs path/to/song.gbs --seconds 30
//   node tools/chip-bench.mjs spc path/to/song.spc --seconds 20
//   node tools/chip-bench.mjs psf path/to/song.minipsf path/to/song.psflib --seconds 60
//   node tools/chip-bench.mjs psf2 path/to/song.minipsf2 path/to/song.psf2lib --seconds 60
//   node tools/chip-bench.mjs usf path/to/song.miniusf path/to/song.usflib --seconds 90 --budget 600000000
//
// kind: nsf | gbs | spc | psf | psf2 | usf — the same CHIPS keys index.html
// uses. psf/psf2/usf take their set's .psflib/.psf2lib/.usflib as extra
// positional file args (keyed by filename, lowercased — the same way a
// song's own _lib tag names it; see parsed.libs in chip-worker.mjs's RUNNERS).
// --budget defaults to the worker's own fallback (2 GB); pass the iPad's
// (CHIP_BUDGET_APP, index.html, 600_000_000) to reproduce an app-side plan.
//
// Do NOT run this on a large/real set yourself — Josh's CPU is his
// instrument (CLAUDE.md: no local Playwright; same spirit applies here). A
// small synthetic fixture (tools/nsf/make-test-nsf.mjs and its gbs/spc/psf/
// usf kin — see tests/*.test.mjs for how they're built) or a short --seconds
// window on something tiny only. This script does no capacity planning of
// its own, and nothing it does is shipped.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RUNNERS, planChipRender, chipEstimateTracksW, tallyChipRender } from "./chip-worker.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Mirrors CHIPS[kind].files/shared/own in index.html (a worker/this script
// can't import from the page's inline script, same reason planChipRender
// itself is duplicated there — keep the two in step).
const CHIP_FILES = {
  nsf: {files: ["nsf/nsf", "nsf/notes", "nsf/midi-write", "nsf/apu-render"], shared: [], own: []},
  gbs: {files: ["gbs/gbs", "gbs/notes", "gbs/apu-render"], shared: ["nsf/notes", "nsf/midi-write"], own: ["reconstruct", "toNotesTxt"]},
  spc: {files: ["spc/spc", "spc/notes", "?spc/apu-render"], shared: ["nsf/notes", "nsf/midi-write"], own: ["reconstruct", "toNotesTxt"]},
  psf: {files: ["psx/psf", "psx/akao", "psx/seq", "psx/vab", "psx/notes", "psx/spu-render", "psx/capture"], shared: ["sounding", "note-preview"], own: []},
  psf2: {files: ["ps2/psf2", "ps2/sq", "ps2/hd", "ps2/bgm", "ps2/wd", "ps2/capture", "psx/vab", "psx/notes", "psx/spu-render"], shared: ["sounding", "note-preview"], own: []},
  usf: {files: ["n64/usf", "n64/ead-usf", "n64/seq-libultra", "n64/notes", "n64/capture", "n64/vadpcm", "n64/bank", "n64/render", "n64/rare"], shared: ["sounding", "note-preview"], own: []},
};
const DEFAULT_RATE = {nsf: 44100, gbs: 44100, spc: 32000, psf: 44100, psf2: 48000, usf: 32000}; // CHIPS[kind].renderRate, index.html

async function loadModules(kind) {
  const c = CHIP_FILES[kind];
  if (!c) throw new Error("no file list for chip kind " + kind + " (tools/chip-bench.mjs's CHIP_FILES, mirrors index.html's CHIPS) — known kinds: " + Object.keys(CHIP_FILES).join(", "));
  const loadOne = (f, opt) => { const p = path.join(HERE, (opt ? f.slice(1) : f) + ".mjs");
    return import(pathToFileURL(p).href).catch(err => { if (opt) return {}; throw new Error("couldn't load module tools/" + (opt ? f.slice(1) : f) + ".mjs: " + (err && err.message || err)); }); };
  const parts = await Promise.all(c.files.map(f => loadOne(f, f.startsWith("?"))));
  const sh = await Promise.all(c.shared.map(f => loadOne(f, false)));
  const M = Object.assign({}, ...parts, ...sh);
  for (const k of c.own) for (const p of parts) if (p[k]) M[k] = p[k];
  return M;
}

async function bench({kind, bytes, libs, n, secs, rate, budget}) {
  const R = RUNNERS[kind];
  if (!R) throw new Error("no worker runner for " + kind + " — known kinds: " + Object.keys(RUNNERS).join(", "));
  const M = await loadModules(kind);
  if (!M.renderApu && !M.renderSpu && !M.renderN64) throw new Error("no renderer loaded for " + kind + " (a synth-only chip, or a module failed to load) — nothing to bench");

  let memPeak = process.memoryUsage().arrayBuffers;
  const poll = setInterval(() => { memPeak = Math.max(memPeak, process.memoryUsage().arrayBuffers); }, 20);
  let res, r;
  const t0 = process.hrtime.bigint();
  try {
    const parsed = R.parse(M)(bytes, {libs});
    res = await R.run(M, parsed, n, secs, () => {});
    const tParsed = process.hrtime.bigint();
    const tracks = chipEstimateTracksW(R, res, M);
    const plan = planChipRender({tracks, seconds: secs, sampleRate: rate, channels: R.stereo ? 2 : 1, budget});
    if (plan.refuse) throw new Error("too big for the given budget: ~" + Math.round(plan.bytes / 1e6) + " MB (raise --budget or shorten --seconds)");
    r = await R.render(M, res, {sampleRate: plan.rate, onProgress: () => {}});
    const tRendered = process.hrtime.bigint();
    const isPcm = x => x instanceof Float32Array || !!(x && x.l instanceof Float32Array && x.r instanceof Float32Array);
    const names = R.channels || Object.keys(r).filter(k => isPcm(r[k]));
    const {peakBytes, keptBytes} = tallyChipRender(r, names, plan);
    memPeak = Math.max(memPeak, process.memoryUsage().arrayBuffers);
    return {
      kind, tracks, groups: names.length, plan,
      peakBytes, keptBytes, memArrayBuffersPeak: memPeak,
      parseSeconds: Number(tParsed - t0) / 1e9,
      renderSeconds: Number(tRendered - tParsed) / 1e9,
    };
  } finally { clearInterval(poll); }
}

function parseArgs(argv) {
  const opt = {seconds: 10, rate: null, budget: 2_000_000_000, n: 0, json: false};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opt.json = true;
    else if (a === "--seconds") opt.seconds = Number(argv[++i]);
    else if (a === "--rate") opt.rate = Number(argv[++i]);
    else if (a === "--budget") opt.budget = Number(argv[++i]);
    else if (a === "--n") opt.n = Number(argv[++i]);
    else pos.push(a);
  }
  return {opt, pos};
}

async function main() {
  const {opt, pos} = parseArgs(process.argv.slice(2));
  const [kind, file, ...libFiles] = pos;
  if (!kind || !file) {
    console.error("usage: node tools/chip-bench.mjs <kind> <file> [lib...] [--seconds N] [--rate N] [--budget N] [--n N] [--json]");
    process.exit(1);
  }
  const bytes = new Uint8Array(readFileSync(file));
  const libs = {};
  for (const lf of libFiles) libs[path.basename(lf).toLowerCase()] = new Uint8Array(readFileSync(lf));
  const rate = opt.rate || DEFAULT_RATE[kind] || 44100;
  const out = await bench({kind, bytes, libs, n: opt.n, secs: opt.seconds, rate, budget: opt.budget});
  if (opt.json) { console.log(JSON.stringify(out)); return; }
  const mb = x => (x / 1e6).toFixed(1);
  console.log(`${file} (${kind}): ${out.tracks} tracks estimated, ${out.groups} groups rendered`);
  console.log(`  plan: ${out.plan.rate / 1000} kHz${out.plan.mono ? " mono" : ""}${out.plan.refuse ? " REFUSED" : ""}`);
  console.log(`  parse+emulate: ${out.parseSeconds.toFixed(2)}s · render: ${out.renderSeconds.toFixed(2)}s`);
  console.log(`  tally: peak ${mb(out.peakBytes)} MB · kept ${mb(out.keptBytes)} MB (${(out.peakBytes / out.keptBytes).toFixed(2)}×)`);
  console.log(`  process.memoryUsage().arrayBuffers peak (sampled): ${mb(out.memArrayBuffersPeak)} MB`);
}
main().catch(err => { console.error("chip-bench: " + (err && err.message || err)); process.exit(1); });
