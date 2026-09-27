#!/usr/bin/env node
// tools/package.mjs — assemble the PRODUCT build of Night Roll (Phase 1, step 5
// of the iPad app plan, 2026-09-26) and refuse to ship anything that is not
// ours. No build step in the usual sense: index.html is copied byte-for-byte
// except ONE line (EDITION "web" → "app"); vendor/, sw.js, the manifest and
// icons come along; albums/ is reduced to the starter albums and a manifest
// listing only them.
//
//   node tools/package.mjs                 # → dist/night-roll-app/
//   node tools/package.mjs --out /some/dir # elsewhere (tests use a temp dir)
//   node tools/package.mjs --check         # guards only, write nothing
//
// The ship guard (exit 1 on any hit): no album but albums/starters/** in the
// output; no file anywhere in it whose path or text mentions a game we do not
// own (final-fantasy, mega-man, tmnt, nintendo, capcom, konami, square) except
// index.html's own prose about the site; nothing from albums/compositions/,
// journals or analysis docs; index.html identical to the repo's apart from
// the EDITION line; the manifest lists only what is in the output.
// The same shape is the Capacitor webDir later.

import {readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, copyFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {execSync} from "node:child_process";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = path.resolve(flag("--out", path.join(ROOT, "dist", "night-roll-app")));
const CHECK_ONLY = argv.includes("--check");
const ALLOWED_ALBUM_DIRS = ["albums/starters"];
const FORBIDDEN = /final[-_ ]?fantasy|mega[-_ ]?man|tmnt|teenage mutant|nintendo|capcom|konami|square ?enix|castlevania|zelda|metroid/i;
const TOP_FILES = ["index.html", "sw.js", "app.webmanifest", "404.html", "LICENSE"];
const TOP_DIRS = ["vendor", "icons"];
// Runtime modules: the browser imports these from tools/ (chip captures, chip
// audio in the Worker). Only what the app's entry points reach, transitively —
// the node-only scripts in the same folders (dumps, tests, bridges) stay home.
// Keep in step with CHIPS[].files/shared in index.html and RUNNERS in chip-worker.
const RUNTIME_ENTRIES = ["chip-worker.mjs",
  "nsf/nsf.mjs", "nsf/notes.mjs", "nsf/midi-write.mjs", "nsf/apu-render.mjs",
  "gbs/gbs.mjs", "gbs/notes.mjs", "gbs/apu-render.mjs",
  "spc/spc.mjs", "spc/notes.mjs", "spc/apu-render.mjs",
  "vgm/vgm.mjs", "vgm/notes.mjs",
  "psx/psf.mjs", "psx/akao.mjs", "psx/seq.mjs", "psx/vab.mjs", "psx/notes.mjs", "psx/spu-render.mjs",
  "n64/usf.mjs", "n64/ead-usf.mjs", "n64/seq-libultra.mjs", "n64/notes.mjs"];
function runtimeModules() { // tools-relative paths, entry points plus every static relative import under tools/
  const seen = new Set(), todo = [...RUNTIME_ENTRIES];
  while (todo.length) {
    const m = todo.pop();
    if (seen.has(m)) continue;
    const abs = path.join(ROOT, "tools", m);
    if (!existsSync(abs)) continue; // an optional module (spc/apu-render lands separately) may be absent
    seen.add(m);
    const src = readFileSync(abs, "utf8");
    for (const im of src.matchAll(/(?:from|import)\s*\(?\s*"(\.\.?\/[^"]+\.mjs)"/g)) {
      const t = path.posix.normalize(path.posix.join(path.posix.dirname(m), im[1]));
      if (!t.startsWith("..")) todo.push(t); // imports that leave tools/ (tests/harness) are node-only
    }
  }
  return [...seen].sort();
}
const RUNTIME = runtimeModules();

const rel = p => path.relative(OUT, p).split(path.sep).join("/");
function walk(dir, out = []) { for (const e of readdirSync(dir)) { const f = path.join(dir, e); if (statSync(f).isDirectory()) walk(f, out); else out.push(f); } return out; }
function copyDir(src, dst) { mkdirSync(dst, {recursive: true}); for (const e of readdirSync(src)) { const a = path.join(src, e), b = path.join(dst, e); if (statSync(a).isDirectory()) copyDir(a, b); else copyFileSync(a, b); } }

const problems = [];
const fail = m => problems.push(m);

// 1. index.html: one line changes
const srcIndex = readFileSync(path.join(ROOT, "index.html"), "utf8");
const EDITION_LINE = 'const EDITION = "web";';
if ((srcIndex.match(/const EDITION = "[a-z]+";/g) || []).length !== 1) fail("index.html must declare EDITION exactly once");
const appIndex = srcIndex.replace(EDITION_LINE, 'const EDITION = "app";');
if (appIndex === srcIndex) fail("EDITION line not found in index.html: " + EDITION_LINE);
{ // byte-identical apart from that line
  const a = srcIndex.split("\n"), b = appIndex.split("\n");
  const diff = a.map((l, i) => l !== b[i] ? i : -1).filter(i => i >= 0);
  if (a.length !== b.length || diff.length !== 1) fail("index.html differs from the repo's in " + diff.length + " lines (expected 1)");
}

// 2. which albums ship
const albumsRoot = path.join(ROOT, "albums");
const shipAlbums = ALLOWED_ALBUM_DIRS.map(d => path.join(ROOT, d)).filter(existsSync);
const manifest = JSON.parse(readFileSync(path.join(albumsRoot, "manifest.json"), "utf8"));
const shipManifest = manifest.filter(a => (a.songs || []).every(s => ALLOWED_ALBUM_DIRS.some(d => s.path.startsWith(d + "/"))) && (a.songs || []).length);

if (!CHECK_ONLY) {
  rmSync(OUT, {recursive: true, force: true});
  mkdirSync(OUT, {recursive: true});
  for (const f of TOP_FILES) if (existsSync(path.join(ROOT, f))) copyFileSync(path.join(ROOT, f), path.join(OUT, f));
  writeFileSync(path.join(OUT, "index.html"), appIndex);
  for (const d of TOP_DIRS) if (existsSync(path.join(ROOT, d))) copyDir(path.join(ROOT, d), path.join(OUT, d));
  for (const m of RUNTIME) { const dst = path.join(OUT, "tools", m); mkdirSync(path.dirname(dst), {recursive: true}); copyFileSync(path.join(ROOT, "tools", m), dst); }
  mkdirSync(path.join(OUT, "albums"), {recursive: true});
  for (const d of shipAlbums) copyDir(d, path.join(OUT, path.relative(ROOT, d)));
  writeFileSync(path.join(OUT, "albums", "manifest.json"), JSON.stringify(shipManifest, null, 1) + "\n");
  let commit = "unknown"; try { commit = execSync("git rev-parse --short HEAD", {cwd: ROOT}).toString().trim(); } catch (err) { /* no git */ }
  writeFileSync(path.join(OUT, "BUILD.json"), JSON.stringify({edition: "app", commit, built: new Date().toISOString(), albums: shipManifest.map(a => a.title)}, null, 2) + "\n");
}

// 3. the guard, over the OUTPUT (or a dry list in --check mode)
const files = CHECK_ONLY ? [] : walk(OUT);
for (const f of files) {
  const r = rel(f);
  if (r.startsWith("albums/") && r !== "albums/manifest.json" && !ALLOWED_ALBUM_DIRS.some(d => r.startsWith(d + "/"))) fail("album not allowed in the product: " + r);
  if (r.startsWith("tools/") ? !RUNTIME.includes(r.slice(6)) : /^(journals|handoffs|tests)\//.test(r) || /\.(ask|rollnotes)\.md$/.test(r)) fail("not a product file: " + r);
  if (FORBIDDEN.test(r)) fail("forbidden name in path: " + r);
  if (/\.(json|md|txt|webmanifest|js)$/.test(r) && r !== "index.html" && !r.startsWith("vendor/")) {
    const t = readFileSync(f, "utf8");
    if (FORBIDDEN.test(t)) fail("forbidden text in " + r + ": " + t.match(FORBIDDEN)[0]);
  }
}
if (!CHECK_ONLY) {
  const listed = new Set(shipManifest.flatMap(a => a.songs.map(s => s.path)));
  for (const p of listed) if (!existsSync(path.join(OUT, p))) fail("manifest lists a song that is not in the output: " + p);
  for (const f of files) { const r = rel(f); if (/^albums\/.*\.midi?$/i.test(r) && !listed.has(r)) fail("song in the output but not in the manifest: " + r); }
}
for (const a of manifest) for (const s of a.songs || []) if (/^albums\/compositions\//.test(s.path) && shipManifest.includes(a)) fail("Josh's compositions must not ship: " + s.path);

if (problems.length) {
  console.error("SHIP GUARD FAILED:\n  " + problems.join("\n  "));
  process.exit(1);
}
const size = files.reduce((n, f) => n + statSync(f).size, 0);
console.log((CHECK_ONLY ? "ship guard: clean (check only)" : "packaged → " + OUT) + "\n  runtime modules: " + RUNTIME.length + "\n  albums: " + (shipManifest.map(a => a.title).join(", ") || "(none yet — add albums/starters/)") + "\n  songs: " + shipManifest.reduce((n, a) => n + a.songs.length, 0) + (CHECK_ONLY ? "" : "\n  files: " + files.length + ", " + (size / 1048576).toFixed(1) + " MB"));
