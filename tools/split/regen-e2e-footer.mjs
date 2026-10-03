#!/usr/bin/env node
// tools/split/regen-e2e-footer.mjs — regenerates src/app.js's generated e2e
// accessor footer (docs/split-plan.md §4 step 0b deviation; shared logic in
// ./e2e-footer.mjs) from app.js's CURRENT top-level names. Run this after
// ANY change to app.js's top-level declarations — promote-state.mjs moving
// `let`s to `S` (step 1), a future move.mjs carving a module out of app.js
// (steps 2-14) — so the footer never drifts from the file it describes.
// Idempotent: strips any existing footer first, so running it twice is a
// no-op the second time. Node-only tooling, never shipped.
//
//   node tools/split/regen-e2e-footer.mjs --file src/app.js [--dry-run]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addAccessorFooter } from "./e2e-footer.mjs";

function parseArgv(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") opts.file = argv[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else throw new Error("unknown arg " + a);
  }
  if (!opts.file) throw new Error("usage: regen-e2e-footer.mjs --file <module> [--dry-run]");
  return opts;
}

function isMain() {
  try { return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]); }
  catch { return false; }
}

if (isMain()) {
  const opts = parseArgv(process.argv.slice(2));
  const fileAbs = path.resolve(opts.file);
  const before = readFileSync(fileAbs, "utf8");
  const after = addAccessorFooter(before);
  if (opts.dryRun) {
    console.log(after === before ? "regen-e2e-footer: no change" : "regen-e2e-footer: would rewrite " + opts.file);
  } else {
    writeFileSync(fileAbs, after);
    console.log(after === before ? "regen-e2e-footer: no change" : "regen-e2e-footer: rewrote " + opts.file);
  }
}
