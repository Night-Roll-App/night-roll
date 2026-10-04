#!/usr/bin/env node
// npm test: every vm test file, one at a time (his CPU is his instrument —
// never in parallel), and EVERY file runs even after one fails. The old
// `a && b && …` chain stopped at the first failing file, so a missing local
// rip (ps2-real) silently skipped gestures, bridge, modules… (2026-10-03).
// Exit code: 1 if any file failed, after printing which ones.
import { spawnSync } from "node:child_process";

const FILES = [
  "night-roll", "nsf", "import-set", "album-order", "gbs", "vgm", "vgm-real",
  "psx", "psx-real", "psx-instr", "psx-render", "ps2", "ps2-real", "spc",
  "spc-real", "spc-render", "spc-undrum", "n64", "n64-real", "n64-bank",
  "n64-rare", "sounding", "chip-worker", "instruments", "instruments-export",
  "instruments-sf2", "gestures", "bridge", "ai", "pwa", "package", "m3u-real",
  "migrate-rollnotes", "modules", "controls", "boot-order", "quiz",
];
const FORCE_EXIT = new Set(["night-roll"]); // its harness leaves timers behind

const only = process.argv.slice(2);
const failed = [];
for (const f of only.length ? FILES.filter(x => only.includes(x)) : FILES) {
  const args = ["--experimental-vm-modules", "--test", ...(FORCE_EXIT.has(f) ? ["--test-force-exit"] : []), `tests/${f}.test.mjs`];
  const r = spawnSync(process.execPath, args, {stdio: "inherit"});
  if (r.status !== 0) failed.push(f);
}
if (failed.length) {
  console.error(`\n✖ ${failed.length} test file(s) failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\n✔ all test files passed");
