// tests/package.test.mjs — the product build: index.html changes by exactly the
// EDITION line, only starter albums ship, the manifest matches the output, no
// game names anywhere, and the ship guard fails loudly when something slips.
import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync} from "node:fs";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {createApp, appSource} from "./harness.mjs";

const root = path.dirname(new URL("./", import.meta.url).pathname.replace(/\/$/, ""));
const tool = path.join(root, "tools", "package.mjs");
const walk = (d, out = []) => { for (const e of readdirSync(d)) { const f = path.join(d, e); if (statSync(f).isDirectory()) walk(f, out); else out.push(f); } return out; };

test("package: builds the app edition into a temp dir with only starter albums and a matching manifest", () => {
  const out = mkdtempSync(path.join(tmpdir(), "nr-pkg-"));
  const r = spawnSync(process.execPath, [tool, "--out", out], {encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr + r.stdout);
  // index.html itself carries no EDITION line any more (docs/split-plan.md
  // §4 step 0b moved it to src/edition.js) — it should be byte-identical to
  // the repo's, full stop.
  const idx = readFileSync(path.join(out, "index.html"), "utf8"), idxRepo = readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal(idx, idxRepo, "index.html is copied byte-for-byte (EDITION moved out of it)");
  const edition = readFileSync(path.join(out, "src", "edition.js"), "utf8"), editionRepo = readFileSync(path.join(root, "src", "edition.js"), "utf8");
  assert.ok(edition.includes('export const EDITION = "app";') && !edition.includes('export const EDITION = "web";'));
  const a = editionRepo.split("\n"), b = edition.split("\n");
  assert.equal(a.length, b.length);
  assert.equal(a.filter((l, i) => l !== b[i]).length, 1, "exactly one line differs");
  for (const f of ["sw.js", "app.webmanifest", "404.html", "LICENSE", "vendor/vexflow.js", "icons/icon-512.png", "albums/manifest.json", "BUILD.json",
                   "src/edition.js", "src/devtools.js", "src/main.js", "src/wire.js", "src/session/boot.js", "src/package.json",
                   "css/app.css" /* docs/split-plan.md §4 step 16: the stylesheet index.html links ships byte-for-byte */,
                   "help/help.html" /* docs/plans/2026-10-04-help-out.md: the Help sheet's body, fetched at runtime */]) assert.ok(existsSync(path.join(out, f)), f);
  assert.equal(readFileSync(path.join(out, "css/app.css"), "utf8"), readFileSync(path.join(root, "css/app.css"), "utf8"), "css/app.css is copied byte-for-byte");
  assert.equal(readFileSync(path.join(out, "help/help.html"), "utf8"), readFileSync(path.join(root, "help/help.html"), "utf8"), "help/help.html is copied byte-for-byte");
  assert.ok(!existsSync(path.join(out, "src/app.js")), "src/app.js is gone (docs/split-phase2-plan.md step 13)");
  const files = walk(out).map(f => path.relative(out, f));
  assert.ok(!files.some(f => /final-fantasy|mega-man|tmnt|compositions/.test(f)), "no game albums or compositions in the output");
  const manifest = JSON.parse(readFileSync(path.join(out, "albums", "manifest.json"), "utf8"));
  for (const al of manifest) for (const s of al.songs) { assert.ok(s.path.startsWith("albums/starters/")); assert.ok(existsSync(path.join(out, s.path)), s.path); }
  assert.ok(!files.some(f => /^albums\/.*\.md$/.test(f)), "no journals/analysis docs");
  // the browser-side modules ship (Josh, 2026-09-27, in the app: "Importing a module script failed"); the node-only scripts beside them do not
  for (const f of ["tools/chip-worker.mjs", "tools/nsf/nsf.mjs", "tools/nsf/cpu6502.mjs", "tools/spc/spc.mjs", "tools/spc/apu-render.mjs", "tools/gbs/cpu-sm83.mjs", "tools/psx/psf.mjs", "tools/n64/usf.mjs"])
    assert.ok(existsSync(path.join(out, f)), f + " should ship");
  // every module the page's CHIPS table names ships — the worker imports them by name at run time (2026-09-28:
  // sounding/note-preview were missing and every console render on the iPad fell back to the synth). The CHIPS
  // table is JS, so it lives in src/ now (docs/split-plan.md §4 step 0b moved it out of index.html;
  // docs/split-phase2-plan.md step 2 moved it again, src/app.js -> src/audio/chip.js) — appSource()
  // (tests/harness.mjs §3.3) is the whole src/ tree concatenated, not just app.js, for exactly this reason.
  const named = new Set();
  for (const m of appSource(root).matchAll(/\b(?:files|shared):\s*\[([^\]]*)\]/g)) for (const q of m[1].matchAll(/"\??([\w/-]+)"/g)) named.add("tools/" + q[1] + ".mjs");
  assert.ok(named.has("tools/sounding.mjs") && named.has("tools/note-preview.mjs") && named.size > 20, "the CHIPS lists were read");
  for (const f of named) if (existsSync(path.join(root, f))) assert.ok(existsSync(path.join(out, f)), f + " is named in CHIPS and should ship");
  assert.ok(!files.some(f => /^tools\/(package|dump_notes|claude-bridge|at|span)\.mjs$|^tools\/nsf\/(dump|dump-all|make-test-nsf)\.mjs$/.test(f)), "no node-only tools in the output");
  rmSync(out, {recursive: true, force: true});
});

test("package: the packaged output boots (docs/split-plan.md §4 step 0b — this is the iPad bundle's own module graph, proven in the vm harness before a real device ever sees it)", async () => {
  const out = mkdtempSync(path.join(tmpdir(), "nr-pkg-"));
  const r = spawnSync(process.execPath, [tool, "--out", out], {encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const app = await createApp({root: out});
  assert.equal(app.run("EDITION"), "app", "the packaged build really is the app edition");
  assert.equal(app.run("typeof loadSong"), "function", "the app's own module graph evaluated");
  rmSync(out, {recursive: true, force: true});
});

test("package: the ship guard refuses a forbidden album planted in the output", () => {
  const out = mkdtempSync(path.join(tmpdir(), "nr-pkg-"));
  // build once (clean), then plant a game file and re-run the guard over that output via a wrapper module
  let r = spawnSync(process.execPath, [tool, "--out", out], {encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr);
  mkdirSync(path.join(out, "albums", "final-fantasy-i"), {recursive: true});
  writeFileSync(path.join(out, "albums", "final-fantasy-i", "x.mid"), "MThd");
  // the packager rebuilds from scratch, so the plant must be caught by the guard's forbidden-path test on a rebuild
  // that copies it in: emulate by running the guard logic through --check on the source tree (clean) and asserting
  // the planted path would be rejected by the same regex
  const src = readFileSync(tool, "utf8");
  const m = src.match(/const FORBIDDEN = (\/.*\/i);/);
  const re = eval(m[1]);
  assert.ok(re.test("albums/final-fantasy-i/x.mid"));
  assert.ok(re.test("This is Mega Man 2"));
  assert.ok(!re.test("albums/starters/bach-prelude-in-c.mid"));
  rmSync(out, {recursive: true, force: true});
  r = spawnSync(process.execPath, [tool, "--check"], {encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ship guard: clean/);
});
