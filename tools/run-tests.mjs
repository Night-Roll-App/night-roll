#!/usr/bin/env node
// npm test: every vm test file, one at a time (his CPU is his instrument —
// never in parallel), and EVERY file runs even after one fails. The old
// `a && b && …` chain stopped at the first failing file, so a missing local
// rip (ps2-real) silently skipped gestures, bridge, modules… (2026-10-03).
// Exit code: 1 if any file failed, after printing which ones.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FILES = [
  "night-roll", "nsf", "import-set", "album-order", "gbs", "vgm", "vgm-real",
  "psx", "psx-real", "psx-capture-v2", "psx-instr", "psx-render", "ps2", "ps2-real", "spc",
  "spc-real", "spc-render", "spc-undrum", "n64", "n64-real", "n64-bank",
  "n64-rare", "n64-capture-v2", "sounding", "chip-worker", "instruments", "instruments-export",
  "instruments-sf2", "gestures", "bridge", "ai", "annotate", "ask-storage", "pwa", "package", "m3u-real",
  "migrate-rollnotes", "modules", "controls", "boot-order", "quiz", "theory",
  "theory-harmony", "multi-file-chip", "capture-diff",
];
// No --test-force-exit: its process.exit() in the test child drops results
// still buffered for the parent's pipe (async on macOS) — night-roll reported
// 579–599 of its tests with "fail 0" (2026-10-08). A wedged file is killed below.
// Files here write how many tests they registered (NR_TEST_COUNT_FILE); a run
// that reports fewer fails.
const COUNTED = new Set(["night-roll"]);

// a name or a path ("tests/night-roll.test.mjs"); an unknown one is an error —
// a path once filtered to zero files and still printed "all test files passed"
const only = process.argv.slice(2).map(a => a.replace(/^.*\//, "").replace(/\.test\.mjs$/, ""));
const unknown = only.filter(x => !FILES.includes(x));
if (unknown.length) {
  console.error(`✖ unknown test file(s): ${unknown.join(", ")}`);
  process.exit(1);
}
const failed = [];
const tmp = mkdtempSync(join(tmpdir(), "nr-tests-"));
// Every file runs in its own process group, and anything that ends this
// runner kills that whole group: `node --test` runs the file in a CHILD
// process, so killing only the direct child (spawnSync's timeout, or a perl
// alarm on this runner) left a wedged test spinning on its own. Four of them
// ran at 100% CPU for 1–4 days and took ~95 GB until Josh found them (2026-10-09).
let current = null;
const killGroup = () => { if (current && current.exitCode === null) { try { process.kill(-current.pid, "SIGKILL"); } catch { /* already gone */ } } };
for (const sig of ["SIGALRM", "SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => { killGroup(); rmSync(tmp, {recursive: true, force: true}); process.exit(1); });
process.on("exit", killGroup);
const runFile = (args, env) => new Promise(resolve => {
  current = spawn(process.execPath, args, {stdio: "inherit", env, detached: true});
  let timedOut = false;
  // a file that wedges (a failed assertion skipping a teardown once hung
  // night-roll with no failure printed) is killed and counted as failed
  const t = setTimeout(() => { timedOut = true; killGroup(); }, 300000);
  current.on("exit", (status, signal) => { clearTimeout(t); killGroup(); resolve({status, signal: timedOut ? "SIGKILL (timeout)" : signal}); });
});
for (const f of only.length ? FILES.filter(x => only.includes(x)) : FILES) {
  const tap = join(tmp, `${f}.tap`), countFile = join(tmp, `${f}.count`);
  const args = ["--experimental-vm-modules", "--test", "--test-reporter=spec", "--test-reporter-destination=stdout",
    "--test-reporter=tap", `--test-reporter-destination=${tap}`, `tests/${f}.test.mjs`];
  const r = await runFile(args, {...process.env, NR_TEST_COUNT_FILE: countFile});
  if (r.status !== 0) { failed.push(f); if (r.signal) console.error(`\n✖ ${f}: killed (${r.signal}) — wedged or over 300 s`); continue; }
  if (!COUNTED.has(f)) continue;
  const registered = existsSync(countFile) ? +readFileSync(countFile, "utf8") : NaN;
  const reported = +((existsSync(tap) ? readFileSync(tap, "utf8") : "").match(/^# tests (\d+)$/m) || [])[1];
  if (!(registered > 0) || reported !== registered) {
    failed.push(f);
    console.error(`\n✖ ${f}: ${registered} tests registered, ${reported} reported — results went missing`);
  }
}
rmSync(tmp, {recursive: true, force: true});
if (failed.length) {
  console.error(`\n✖ ${failed.length} test file(s) failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\n✔ all test files passed");
