// tools/instruments/extract.mjs <ripdir> --slug <slug> [--out <dir>] [--title "Game"]
//                               [--no-unused] [--only <regex>] [--publish] [--quiet]
//
// Every instrument an imported game's songs play, as a sampler library: the
// PlayStation (AKAO, SEQ/VAB) and Nintendo 64 (EAD sm64/oot generations,
// Rare) drivers' own banks, read by their capture/render readers
// (psx.mjs, n64.mjs), put in the neutral form model.mjs documents, named by
// measurement (name.mjs). Writes <out>/<slug>/instruments/instruments.json
// and one <hash>.wav per distinct sample (16-bit mono at its native rate,
// loop in a `smpl` chunk) — the paths the archive holds them at.
//
// --publish uploads that folder to the archive (joshcough/nsf-archive,
// <slug>/instruments/…) through `gh api`, message "instruments: <slug>":
// check before each PUT (a file already there at the same size is left;
// instruments.json at another size is updated with its sha), then read each
// upload back and compare its size. Nothing is downloaded; nothing is written
// under the repo unless --out points there.
import { writeFileSync, mkdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Library, wavBytes } from "./model.mjs";
import { psxSong, psxFiles } from "./psx.mjs";
import { n64Song, usfFiles } from "./n64.mjs";
import { nameAll } from "./name.mjs";
import { samplesFromLibrary } from "./play.mjs";

export function parseArgs(argv) {
  const o = {dir: null, slug: null, out: "scratch/instruments/out", title: "", unused: true, only: null, publish: false, quiet: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") o.slug = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--title") o.title = argv[++i];
    else if (a === "--no-unused") o.unused = false;
    else if (a === "--only") o.only = new RegExp(argv[++i], "i");
    else if (a === "--publish") o.publish = true;
    else if (a === "--quiet") o.quiet = true;
    else if (!o.dir) o.dir = a;
    else throw new Error("unexpected argument " + a);
  }
  return o;
}

// -> the finished, named Library (lib.instruments, lib.samples, lib.toJSON())
export async function extractAlbum(dir, {slug = path.basename(dir), title = "", unused = true, only = null, log = () => {}} = {}) {
  const lib = new Library({slug, title});
  const fails = [];
  const psfs = psxFiles(dir);
  if (psfs.length) {
    for (const f of psfs) {
      if (only && !only.test(f)) continue;
      try { await psxSong(lib, dir, f, {unused}); } catch (e) { fails.push({file: f, why: e.message}); }
    }
  } else {
    const {minis, libs} = usfFiles(dir);
    if (!minis.length) throw new Error("no .psf/.minipsf or .miniusf files in " + dir);
    for (const f of minis) {
      if (only && !only.test(f)) continue;
      try { n64Song(lib, dir, f, libs); } catch (e) { fails.push({file: f, why: e.message}); }
    }
    if (!unused) for (const [id, rec] of lib.inst) if (!rec.used) lib.inst.delete(id);
  }
  if (!unused) for (const [id, rec] of lib.inst) if (!rec.used) lib.inst.delete(id);
  lib.finish();
  nameAll(lib, samplesFromLibrary(lib));
  lib.fails = fails;
  for (const x of fails) log(`# skipped ${x.file}: ${x.why}`);
  return lib;
}

export function writeAlbum(lib, root) {
  const dir = path.join(root, lib.slug, "instruments");
  mkdirSync(dir, {recursive: true});
  const doc = lib.toJSON();
  const written = [];
  for (const [h, s] of Object.entries(lib.samples)) {
    const first = lib.instruments.flatMap(i => i.keyRegions).find(r => r.sample === h);
    const b = wavBytes(s._i16, s.rate, {loop: s.loop, rootKey: first ? first.rootKey : 60});
    writeFileSync(path.join(dir, h + ".wav"), b);
    doc.samples[h].bytes = b.length;
    written.push(h + ".wav");
  }
  writeFileSync(path.join(dir, "instruments.json"), JSON.stringify(doc, null, 1) + "\n");
  written.push("instruments.json");
  return {dir, files: written, doc};
}

export function summary(lib) {
  const used = lib.instruments.filter(i => i.used);
  const wav = Object.values(lib.samples).reduce((n, s) => n + 44 + 44 + s.length * 2 + (s.loop ? 24 : 0), 0);
  return {songs: lib.songs.length, skipped: (lib.fails || []).length, used: used.length, total: lib.instruments.length,
    kits: lib.instruments.filter(i => i.kind === "drum-kit").length, samples: Object.keys(lib.samples).length,
    partialSamples: Object.values(lib.samples).filter(s => s.partial).length,
    missingRegions: lib.instruments.reduce((n, i) => n + i.keyRegions.filter(r => r.missing).length, 0),
    wavBytes: wav, collisions: lib.collisions, droppedUnused: lib.droppedUnused || 0, drivers: [...lib.drivers]};
}

const REPO = "joshcough/nsf-archive";
function ghSize(p) {
  const r = spawnSync("gh", ["api", "repos/" + REPO + "/contents/" + p, "--jq", "[.size, .sha] | @tsv"], {encoding: "utf8"});
  if (r.status !== 0) return null; // 404 (or no access): not there
  const [size, sha] = r.stdout.trim().split("\t");
  return {size: +size, sha};
}
export function publish(slug, dir, files, log = console.log) {
  const out = [];
  for (const f of files) {
    const p = `${slug}/instruments/${f}`;
    const bytes = readFileSync(path.join(dir, f));
    const have = ghSize(p);
    if (have && have.size === bytes.length) { out.push({file: p, st: "already there"}); continue; }
    const body = {message: "instruments: " + slug, branch: "main", content: bytes.toString("base64")};
    if (have) body.sha = have.sha; // a newer instruments.json replaces the old
    const put = spawnSync("gh", ["api", "--method", "PUT", "repos/" + REPO + "/contents/" + p, "--input", "-"], {input: JSON.stringify(body), encoding: "utf8", maxBuffer: 1 << 28});
    if (put.status !== 0) { out.push({file: p, st: "FAILED: " + (put.stderr || put.stdout).trim().split("\n")[0]}); continue; }
    const back = ghSize(p);
    out.push({file: p, st: back && back.size === bytes.length ? (have ? "updated" : "uploaded") + ` (${bytes.length} bytes, read back)` : `FAILED: read back ${back ? back.size + " bytes" : "nothing"}, expected ${bytes.length}`});
  }
  for (const x of out) log(`# archive ${x.file}: ${x.st}`);
  return out;
}

export function printSummary(lib, log = console.log) {
  const s = summary(lib);
  log(`# ${lib.slug}: ${s.songs} songs read (${s.skipped} skipped) · ${s.drivers.join(", ")} · instruments used ${s.used} / ${s.total} (${s.kits} kits) · ${s.samples} samples (${s.partialSamples} partial) · ${(s.wavBytes / 1048576).toFixed(2)} MB WAV${s.missingRegions ? ` · ${s.missingRegions} regions with no sample in the rip` : ""}${s.collisions ? ` · ${s.collisions} slot reloads` : ""}`);
  for (const i of lib.instruments.filter(x => x.used).sort((a, b) => b.noteCount - a.noteCount)) {
    const kp = i.keysPlayed ? `keys ${i.keysPlayed.lo}–${i.keysPlayed.hi}` : "";
    const slots = i.kind === "drum-kit" ? " [" + i.keyRegions.filter(r => r.features && r.features.notes).map(r => r.keyLo + ":" + r.nameGuess).join(", ") + "]" : "";
    log(`  ${i.nameGuess.padEnd(18)} ${i.id.padEnd(34)} ${String(i.noteCount).padStart(6)} notes  ${kp.padEnd(12)} in ${i.usedIn.length} song${i.usedIn.length === 1 ? "" : "s"}${slots}`);
  }
  return s;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parseArgs(process.argv.slice(2));
  if (!o.dir || !o.slug) { console.error("usage: extract.mjs <ripdir> --slug <slug> [--out <dir>] [--title T] [--no-unused] [--only re] [--publish]"); process.exit(2); }
  const t0 = Date.now();
  extractAlbum(o.dir, {slug: o.slug, title: o.title, unused: o.unused, only: o.only, log: o.quiet ? () => {} : console.log}).then(lib => {
    const w = writeAlbum(lib, o.out);
    printSummary(lib, o.quiet ? () => {} : console.log);
    console.log(`# wrote ${w.files.length} files to ${w.dir} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (o.publish) { const r = publish(o.slug, w.dir, w.files); if (r.some(x => /FAILED/.test(x.st))) process.exitCode = 1; }
    else console.log(`# archive: ${w.files.length} files to upload with --publish (${o.slug}/instruments/…)`);
  }, e => { console.error("extract: " + (e && e.stack || e)); process.exit(1); });
}
