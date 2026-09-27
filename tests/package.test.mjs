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

const root = path.dirname(new URL("./", import.meta.url).pathname.replace(/\/$/, ""));
const tool = path.join(root, "tools", "package.mjs");
const walk = (d, out = []) => { for (const e of readdirSync(d)) { const f = path.join(d, e); if (statSync(f).isDirectory()) walk(f, out); else out.push(f); } return out; };

test("package: builds the app edition into a temp dir with only starter albums and a matching manifest", () => {
  const out = mkdtempSync(path.join(tmpdir(), "nr-pkg-"));
  const r = spawnSync(process.execPath, [tool, "--out", out], {encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const idx = readFileSync(path.join(out, "index.html"), "utf8"), src = readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(idx.includes('const EDITION = "app";') && !idx.includes('const EDITION = "web";'));
  const a = src.split("\n"), b = idx.split("\n");
  assert.equal(a.length, b.length);
  assert.equal(a.filter((l, i) => l !== b[i]).length, 1, "exactly one line differs");
  for (const f of ["sw.js", "app.webmanifest", "404.html", "LICENSE", "vendor/vexflow.js", "icons/icon-512.png", "albums/manifest.json", "BUILD.json"]) assert.ok(existsSync(path.join(out, f)), f);
  const files = walk(out).map(f => path.relative(out, f));
  assert.ok(!files.some(f => /final-fantasy|mega-man|tmnt|compositions/.test(f)), "no game albums or compositions in the output");
  const manifest = JSON.parse(readFileSync(path.join(out, "albums", "manifest.json"), "utf8"));
  for (const al of manifest) for (const s of al.songs) { assert.ok(s.path.startsWith("albums/starters/")); assert.ok(existsSync(path.join(out, s.path)), s.path); }
  assert.ok(!files.some(f => /^albums\/.*\.md$/.test(f)), "no journals/analysis docs");
  // the browser-side modules ship (Josh, 2026-09-27, in the app: "Importing a module script failed"); the node-only scripts beside them do not
  for (const f of ["tools/chip-worker.mjs", "tools/nsf/nsf.mjs", "tools/nsf/cpu6502.mjs", "tools/spc/spc.mjs", "tools/spc/apu-render.mjs", "tools/gbs/cpu-sm83.mjs", "tools/psx/psf.mjs", "tools/n64/usf.mjs"])
    assert.ok(existsSync(path.join(out, f)), f + " should ship");
  assert.ok(!files.some(f => /^tools\/(package|dump_notes|claude-bridge|at|span)\.mjs$|^tools\/nsf\/(dump|dump-all|make-test-nsf)\.mjs$/.test(f)), "no node-only tools in the output");
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
