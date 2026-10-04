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
// the EDITION line; the manifest lists only what is in the output; every
// vendor/ai/web/*.js file shipped is reachable (docs/ai-library-plan.md §1);
// vendor/ai/bridge/** (the library's Node-only Mac server) never ships.
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
const TOP_DIRS = ["vendor", "icons", "src"];
// Runtime modules: the browser imports these from tools/ (chip captures, chip
// audio in the Worker). Only what the app's entry points reach, transitively —
// the node-only scripts in the same folders (dumps, tests, bridges) stay home.
// Keep in step with CHIPS[].files/shared in index.html and RUNNERS in chip-worker.
const RUNTIME_ENTRIES = ["chip-worker.mjs",
  "nsf/nsf.mjs", "nsf/notes.mjs", "nsf/midi-write.mjs", "nsf/apu-render.mjs",
  "gbs/gbs.mjs", "gbs/notes.mjs", "gbs/apu-render.mjs",
  "spc/spc.mjs", "spc/notes.mjs", "spc/apu-render.mjs",
  "vgm/vgm.mjs", "vgm/notes.mjs",
  "psx/psf.mjs", "psx/akao.mjs", "psx/seq.mjs", "psx/vab.mjs", "psx/notes.mjs", "psx/spu-render.mjs", "psx/capture.mjs",
  "ps2/psf2.mjs", "ps2/sq.mjs", "ps2/hd.mjs", "ps2/bgm.mjs", "ps2/wd.mjs", "ps2/capture.mjs",
  "n64/usf.mjs", "n64/ead-usf.mjs", "n64/seq-libultra.mjs", "n64/notes.mjs", "n64/capture.mjs", "n64/vadpcm.mjs", "n64/bank.mjs", "n64/render.mjs", "n64/rare.mjs", "instruments/play.mjs", "instruments/sf2.mjs"];
// Every module the page's CHIPS table names (files: and shared: lists) — the
// worker dynamic-imports them by these names, so a static scan never sees
// them. Read from index.html itself: sounding/note-preview were missing from
// the hand list above and every console render on the iPad fell to synth.
// (docs/split-plan.md §4 step 0b: the CHIPS table is JS, so it moved with
// everything else into src/app.js — index.html no longer has it.)
function chipTableModules() {
  const html = readFileSync(path.join(ROOT, "src", "app.js"), "utf8");
  const out = new Set();
  for (const m of html.matchAll(/\b(?:files|shared):\s*\[([^\]]*)\]/g))
    for (const q of m[1].matchAll(/"\??([\w/-]+)"/g)) out.add(q[1] + ".mjs");
  return [...out];
}
function runtimeModules() { // tools-relative paths, entry points plus every static relative import under tools/
  const seen = new Set(), todo = [...RUNTIME_ENTRIES, ...chipTableModules()];
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

// src/ reachability (docs/split-plan.md §4 step 0b): every static import and
// literal import() in src/ must resolve to a real file, and every file under
// src/ must be reachable from src/main.js — a module present on disk but
// never imported would silently NOT ship if this guard didn't exist (the
// copy step below copies the whole tree regardless, so today the two always
// agree; this guard is what keeps them agreeing as later steps add and wire
// up dozens of modules).
// reachableAbs also follows an import OUT of src/ (docs/ai-library-plan.md
// §1: src/ask/backend.js's `from "../../vendor/ai/web/sse.js"`) to its real
// absolute path, so the vendor/ai/web reachability guard below can reuse
// this same trace instead of re-walking imports a second way.
function srcModules() {
  const root = path.join(ROOT, "src");
  if (!existsSync(root)) return { all: [], reachable: [], reachableAbs: new Set(), unresolved: [] };
  const all = [];
  (function walk(dir) { for (const e of readdirSync(dir)) { const f = path.join(dir, e); if (statSync(f).isDirectory()) walk(f); else if (e.endsWith(".js")) all.push(path.relative(root, f).split(path.sep).join("/")); } })(root);
  const unresolved = [];
  const seen = new Set(), reachableAbs = new Set(), todo = ["main.js"];
  while (todo.length) {
    const m = todo.pop();
    if (seen.has(m)) continue;
    seen.add(m);
    const abs = path.join(root, m);
    reachableAbs.add(abs);
    if (!existsSync(abs)) { unresolved.push(m); continue; }
    const text = readFileSync(abs, "utf8");
    for (const im of text.matchAll(/(?:from\s*|import\s*\(\s*)"(\.\.?\/[^"]+)"/g)) {
      const t = path.posix.normalize(path.posix.join(path.posix.dirname(m), im[1]));
      todo.push(t);
    }
  }
  return { all, reachable: [...seen], reachableAbs, unresolved };
}
const SRC = srcModules();

const rel = p => path.relative(OUT, p).split(path.sep).join("/");
function walk(dir, out = []) { for (const e of readdirSync(dir)) { const f = path.join(dir, e); if (statSync(f).isDirectory()) walk(f, out); else out.push(f); } return out; }
// `skip`: absolute paths to leave out entirely (vendor/ai/bridge/** below —
// never copied, not just scrubbed after the fact).
function copyDir(src, dst, skip = []) { mkdirSync(dst, {recursive: true}); for (const e of readdirSync(src)) { const a = path.join(src, e), b = path.join(dst, e); if (skip.includes(a)) continue; if (statSync(a).isDirectory()) copyDir(a, b, skip); else copyFileSync(a, b); } }

// vendor/ai/web/ reachability (docs/ai-library-plan.md §4 step 1): every
// file tools/ai-sync.mjs vendored under web/ must either be reached by a
// real src/ import — SRC.reachableAbs above already follows one straight
// out of src/ — or be the library's own public entry point, web/index.js:
// its job IS being imported from OUTSIDE this repo (a second iPad app), so
// nothing inside Night Roll importing it yet is not a bug.
const AI_WEB_DIR = path.join(ROOT, "vendor", "ai", "web");
const AI_WEB_INDEX = path.join(AI_WEB_DIR, "index.js");
const AI_WEB = existsSync(AI_WEB_DIR) ? walk(AI_WEB_DIR).filter(f => f.endsWith(".js")) : [];

const problems = [];
const fail = m => problems.push(m);

// 1. src/edition.js: one line changes (docs/split-plan.md §4 step 0b moved
// this out of index.html, which is now copied byte-identical — checked below
// alongside the other TOP_FILES/TOP_DIRS, nothing special left to verify here).
const srcEdition = readFileSync(path.join(ROOT, "src", "edition.js"), "utf8");
const EDITION_LINE = 'export const EDITION = "web";';
if ((srcEdition.match(/export const EDITION = "[a-z]+";/g) || []).length !== 1) fail("src/edition.js must declare EDITION exactly once");
const appEdition = srcEdition.replace(EDITION_LINE, 'export const EDITION = "app";');
if (appEdition === srcEdition) fail("EDITION line not found in src/edition.js: " + EDITION_LINE);
{ // byte-identical apart from that line
  const a = srcEdition.split("\n"), b = appEdition.split("\n");
  const diff = a.map((l, i) => l !== b[i] ? i : -1).filter(i => i >= 0);
  if (a.length !== b.length || diff.length !== 1) fail("src/edition.js differs from the repo's in " + diff.length + " lines (expected 1)");
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
  for (const d of TOP_DIRS) if (existsSync(path.join(ROOT, d))) copyDir(path.join(ROOT, d), path.join(OUT, d), d === "vendor" ? [path.join(ROOT, "vendor", "ai", "bridge")] : []);
  writeFileSync(path.join(OUT, "src", "edition.js"), appEdition); // the one src/ file that isn't a byte-for-byte copy
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
  if (r.startsWith("vendor/ai/bridge/")) fail("vendor/ai/bridge/** (Node-only) must never ship: " + r); // defense in depth — copyDir already skips it
  if (FORBIDDEN.test(r)) fail("forbidden name in path: " + r);
  // src/**/*.js is exempt from the text scan, like index.html (docs/
  // split-plan.md §4 step 0b): it's the whole app's prose-heavy source
  // (comments quoting Josh, feature names, …), the same reason index.html
  // always was — the PATH scan two lines up and the album/compositions
  // guards below still apply to it.
  if (/\.(json|md|txt|webmanifest|js)$/.test(r) && r !== "index.html" && !r.startsWith("vendor/") && !r.startsWith("src/")) {
    const t = readFileSync(f, "utf8");
    if (FORBIDDEN.test(t)) fail("forbidden text in " + r + ": " + t.match(FORBIDDEN)[0]);
  }
}
for (const m of SRC.unresolved) fail("src/" + m + " is imported but does not exist");
for (const m of SRC.all) if (!SRC.reachable.includes(m)) fail("src/" + m + " exists but is not reachable from src/main.js");
for (const abs of AI_WEB) if (abs !== AI_WEB_INDEX && !SRC.reachableAbs.has(abs)) fail("vendor/ai/web/" + path.relative(AI_WEB_DIR, abs).split(path.sep).join("/") + " is vendored but not reachable from src/main.js (nor the library's own index.js)");
if (!CHECK_ONLY) for (const m of SRC.all) if (!existsSync(path.join(OUT, "src", m))) fail("src/" + m + " is not in the output");
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
