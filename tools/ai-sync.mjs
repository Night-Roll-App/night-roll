#!/usr/bin/env node
// tools/ai-sync.mjs — vendor the AI library (Night-Roll-App/claude-bridge,
// private) into vendor/ai/ as a plain copy, per docs/ai-library-plan.md §1.
// No submodule, no CDN/raw-URL import map (both break Pages/offline/
// package.mjs's reachability guard for a private repo) — a committed,
// hash-checked copy is the one shape that's identical on Pages, in the
// Capacitor package and in the vm harness.
//
//   node tools/ai-sync.mjs --ref v0.1.0                       # clone the default remote at that tag/sha
//   node tools/ai-sync.mjs --ref v0.1.0 --repo <path-or-url>   # from a specific repo instead
//   node tools/ai-sync.mjs --from ../claude-bridge             # a local working copy (dev loop) — marks VERSION dirty
//   node tools/ai-sync.mjs --check                             # npm test: hashes match, not dirty
//
// Copies only web/, bridge/ (if present), LICENSE, README.md — never the
// library's own tests/tools. Writes vendor/ai/VERSION (`<ref> <full sha>`,
// ref "dirty" for --from) and vendor/ai/files.json (path → sha256), and
// rewrites sw.js's `const AI_LIB = "<sha7>";` line so the SW cache name
// (CACHE = "night-roll-" + SW_VERSION + "-" + AI_LIB) turns over whenever
// the library does. Hand edits to vendor/ai fail --check: "edit in
// claude-bridge, then sync" — the whole point of vendoring instead of a
// submodule is that nothing here is ever edited directly.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync,
  statSync, copyFileSync, mkdtempSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VENDOR_DIR = path.join(ROOT, "vendor", "ai");
const SW_PATH = path.join(ROOT, "sw.js");
const DEFAULT_REMOTE = "git@github.com:Night-Roll-App/claude-bridge.git";
const INCLUDE = ["web", "bridge", "LICENSE", "README.md"]; // never tests/, tools/, package.json

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const REF = flag("--ref");
const FROM = flag("--from");
const REPO = flag("--repo") || DEFAULT_REMOTE;
const CHECK = argv.includes("--check");

function git(args, cwd) { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }
function isLocalPath(p) { return !/^[a-z+]+:\/\//i.test(p) && !p.includes("@") && existsSync(p); }

function sha256(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }

function walkFiles(dir, base = dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(abs, base, out);
    else out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out;
}

function copyIncluded(srcRoot, destRoot) {
  rmSync(destRoot, { recursive: true, force: true });
  mkdirSync(destRoot, { recursive: true });
  for (const name of INCLUDE) {
    const src = path.join(srcRoot, name);
    if (!existsSync(src)) continue; // bridge/ is optional (not in v0.1.0)
    const dest = path.join(destRoot, name);
    if (statSync(src).isDirectory()) {
      for (const rel of walkFiles(src)) {
        const d = path.join(dest, rel);
        mkdirSync(path.dirname(d), { recursive: true });
        copyFileSync(path.join(src, rel), d);
      }
    } else { mkdirSync(path.dirname(dest), { recursive: true }); copyFileSync(src, dest); }
  }
}

function writeManifests(destRoot, ref, sha) {
  writeFileSync(path.join(destRoot, "VERSION"), `${ref} ${sha}\n`);
  const files = {};
  for (const rel of walkFiles(destRoot).filter((r) => r !== "VERSION" && r !== "files.json").sort())
    files[rel] = sha256(path.join(destRoot, rel));
  writeFileSync(path.join(destRoot, "files.json"), JSON.stringify(files, null, 2) + "\n");
  return files;
}

function rewriteServiceWorkerAiLib(sha7) {
  const sw = readFileSync(SW_PATH, "utf8");
  const LINE = `const AI_LIB = "${sha7}"; // vendor/ai's library sha, set by tools/ai-sync.mjs — turns the SW cache over whenever the library does`;
  if (/^const AI_LIB = "[0-9a-f]+";.*$/m.test(sw)) {
    writeFileSync(SW_PATH, sw.replace(/^const AI_LIB = "[0-9a-f]+";.*$/m, LINE));
  } else {
    // first sync: insert right after the SW_VERSION line (which carries its
    // own trailing `//` comment, so match the whole line, not just up to
    // its `;`), ahead of every other use
    writeFileSync(SW_PATH, sw.replace(/^(const SW_VERSION = .*\n)/m, `$1${LINE}\n`));
  }
}

function doCheck() {
  const versionFile = path.join(VENDOR_DIR, "VERSION");
  const filesJsonPath = path.join(VENDOR_DIR, "files.json");
  if (!existsSync(versionFile) || !existsSync(filesJsonPath)) {
    console.error("ai-sync --check: vendor/ai/ is missing VERSION or files.json — edit in claude-bridge, then sync");
    process.exit(1);
  }
  const version = readFileSync(versionFile, "utf8").trim();
  if (/^dirty\s/.test(version)) {
    console.error("ai-sync --check: vendor/ai/VERSION is dirty (synced with --from) — edit in claude-bridge, then sync");
    process.exit(1);
  }
  const files = JSON.parse(readFileSync(filesJsonPath, "utf8"));
  const problems = [];
  for (const [rel, want] of Object.entries(files)) {
    const abs = path.join(VENDOR_DIR, rel);
    if (!existsSync(abs)) { problems.push(`missing: ${rel}`); continue; }
    const got = sha256(abs);
    if (got !== want) problems.push(`hash mismatch: ${rel}`);
  }
  // the reverse: a file present under vendor/ai/ but absent from files.json
  // (e.g. a hand edit that added a file) must fail too
  const onDisk = new Set(walkFiles(VENDOR_DIR).filter((r) => r !== "VERSION" && r !== "files.json"));
  for (const rel of onDisk) if (!(rel in files)) problems.push(`not in files.json: ${rel}`);
  if (problems.length) {
    console.error("ai-sync --check FAILED — edit in claude-bridge, then sync\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log(`ai-sync --check: clean (${version})`);
}

if (CHECK) {
  doCheck();
} else if (FROM) {
  const srcRoot = path.resolve(FROM);
  if (!existsSync(srcRoot)) { console.error(`ai-sync: --from ${FROM} does not exist`); process.exit(1); }
  let sha = "unknown";
  try { sha = git(["rev-parse", "HEAD"], srcRoot); } catch (err) { /* not a git repo / no commits yet */ }
  copyIncluded(srcRoot, VENDOR_DIR);
  writeManifests(VENDOR_DIR, "dirty", sha);
  rewriteServiceWorkerAiLib(sha.slice(0, 7));
  console.log(`ai-sync: vendored from ${srcRoot} (dirty, ${sha.slice(0, 7)}) — do not commit/push until a real --ref sync replaces this`);
} else if (REF) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ai-sync-"));
  try {
    let sha;
    if (isLocalPath(REPO)) {
      // local repo: `git archive` needs no network and works regardless of
      // whether the remote host supports git-upload-archive (GitHub doesn't)
      sha = git(["rev-parse", `${REF}^{commit}`], REPO);
      execFileSync("sh", ["-c", `git archive "${REF}" | tar -x -C "${tmp}"`], { cwd: REPO });
    } else {
      git(["clone", "--quiet", REPO, tmp]);
      git(["checkout", "--quiet", REF], tmp);
      sha = git(["rev-parse", "HEAD"], tmp);
    }
    copyIncluded(tmp, VENDOR_DIR);
    writeManifests(VENDOR_DIR, REF, sha);
    rewriteServiceWorkerAiLib(sha.slice(0, 7));
    console.log(`ai-sync: vendored ${REPO}@${REF} (${sha.slice(0, 7)}) → vendor/ai/`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
} else {
  console.error("ai-sync: pass --ref <tag|sha> [--repo <path-or-url>], --from <dir>, or --check");
  process.exit(1);
}
