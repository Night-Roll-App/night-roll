#!/usr/bin/env node
// npm test: every vm test file, one at a time (his CPU is his instrument —
// never in parallel), and EVERY file runs even after one fails. The old
// `a && b && …` chain stopped at the first failing file, so a missing local
// rip (ps2-real) silently skipped gestures, bridge, modules… (2026-10-03).
// Exit code: 1 if any file failed, after printing which ones.
import { spawnSync } from "node:child_process";

const FILES = [
  "night-roll", "nsf", "import-set", "album-order", "gbs", "vgm", "vgm-real",
  "psx", "psx-real", "psx-capture-v2", "psx-instr", "psx-render", "ps2", "ps2-real", "spc",
  "spc-real", "spc-render", "spc-undrum", "n64", "n64-real", "n64-bank",
  "n64-rare", "n64-capture-v2", "sounding", "chip-worker", "instruments", "instruments-export",
  "instruments-sf2", "gestures", "bridge", "ai", "annotate", "ask-storage", "pwa", "package", "m3u-real",
  "migrate-rollnotes", "modules", "controls", "boot-order", "quiz", "theory",
  "theory-harmony", "multi-file-chip", "capture-diff",
];
const FORCE_EXIT = new Set(["night-roll"]); // its harness leaves timers behind

// a name or a path ("tests/night-roll.test.mjs"); an unknown one is an error —
// a path once filtered to zero files and still printed "all test files passed"
const only = process.argv.slice(2).map(a => a.replace(/^.*\//, "").replace(/\.test\.mjs$/, ""));
const unknown = only.filter(x => !FILES.includes(x));
if (unknown.length) {
  console.error(`✖ unknown test file(s): ${unknown.join(", ")}`);
  process.exit(1);
}
const failed = [];
for (const f of only.length ? FILES.filter(x => only.includes(x)) : FILES) {
  const args = ["--experimental-vm-modules", "--test", ...(FORCE_EXIT.has(f) ? ["--test-force-exit"] : []), `tests/${f}.test.mjs`];
  // a file that wedges (a failed assertion skipping a teardown once hung
  // night-roll with no failure printed) is killed and counted as failed
  const r = spawnSync(process.execPath, args, {stdio: "inherit", timeout: 300000, killSignal: "SIGKILL"});
  if (r.status !== 0) { failed.push(f); if (r.signal) console.error(`\n✖ ${f}: killed (${r.signal}) — wedged or over 300 s`); }
}
if (failed.length) {
  console.error(`\n✖ ${failed.length} test file(s) failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\n✔ all test files passed");
