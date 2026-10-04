#!/usr/bin/env node
// tools/split/blockers.mjs <name,name,...> --to <file>
// docs/split-phase2-plan.md §1 M4.4: before trying a move, ask what's
// actually stopping it. From src/app.js, computes the transitive closure of
// free identifiers the named declarations need that are STILL declared in
// app.js (today's real blockers — everything else is already an import or
// a browser global) and lists any of their already-resolved imports that
// would land ABOVE --to's own layer in check.mjs's LAYERS table (an illegal
// move even once nothing is left in app.js). Read-only: never writes
// anything. Node-only tooling, never shipped.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseModule, declaredNames, freeIdentifiers, topLevelImports } from "./scope.mjs";
import { layerOf } from "./check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(path.dirname(HERE));

function stripSrc(rel) {
  return rel.replace(/^\.?\/*src\//, "");
}

/** Pure: string(s) in, data out. `fromPath`/`toPath` are REPO_ROOT-relative
 *  (move.mjs's own convention, e.g. "src/app.js", "src/model/song.js").
 *  `layerOfFn`: relPath (relative to src/, no "src/" prefix) -> layer number
 *  or null — defaults to check.mjs's real LAYERS table. */
export function computeBlockers({ fromSource, fromPath = "src/app.js", names, toPath, layerOfFn = layerOf }) {
  const parsed = parseModule(fromSource, fromPath);
  const declaredByName = new Map(); // name -> its top-level node, for every name app.js still declares
  for (const node of parsed.ast.body) for (const n of declaredNames(node)) declaredByName.set(n, node);
  const imports = topLevelImports(parsed.ast);
  const fromDir = path.posix.dirname(fromPath);
  const toLayer = layerOfFn(stripSrc(toPath));

  const seen = new Set(names);
  const queue = [...names];
  const closure = new Set(); // app.js-declared names the move still depends on (excludes the input names themselves)
  const illegal = new Map(); // free identifier -> {specifier, layer} — an import that would cross above --to's layer

  while (queue.length) {
    const name = queue.shift();
    const node = declaredByName.get(name);
    if (!node) continue; // not declared in app.js (already an import, or a browser global) — nothing further to chase
    for (const free of freeIdentifiers(node)) {
      if (free === name) continue; // a function's own recursive call
      if (declaredByName.has(free)) {
        if (!seen.has(free)) { seen.add(free); queue.push(free); closure.add(free); }
        continue;
      }
      const info = imports.get(free);
      if (!info || !info.specifier.startsWith(".")) continue; // unresolved/vendor — not this tool's concern (check.mjs rule 1 covers unresolved)
      const targetRel = stripSrc(path.posix.normalize(path.posix.join(fromDir, info.specifier)));
      const targetLayer = layerOfFn(targetRel);
      if (targetLayer !== null && toLayer !== null && targetLayer > toLayer) illegal.set(free, { specifier: info.specifier, layer: targetLayer });
    }
  }

  const verdict = closure.size === 0 && illegal.size === 0
    ? `clean: ${names.join(", ")} can move to ${toPath} today`
    : `blocked: ${closure.size} name(s) still in app.js${closure.size ? ` (${[...closure].join(", ")})` : ""}` +
      (illegal.size ? `; ${illegal.size} illegal-layer import(s) (${[...illegal.keys()].join(", ")})` : "");

  return { closure: [...closure], illegalImports: [...illegal].map(([name, v]) => ({ name, ...v })), verdict };
}

// ---- CLI -------------------------------------------------------------------

function isMain() {
  try { return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]); }
  catch { return false; }
}

if (isMain()) {
  const argv = process.argv.slice(2);
  let toPath = null;
  const names = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--to") toPath = argv[++i];
    else names.push(...argv[i].split(",").map(s => s.trim()).filter(Boolean));
  }
  if (!toPath || !names.length) throw new Error("usage: blockers.mjs <name,name,...> --to <file>");
  const fromPath = "src/app.js";
  const fromSource = readFileSync(path.join(REPO_ROOT, fromPath), "utf8");
  const result = computeBlockers({ fromSource, fromPath, names, toPath });
  console.log("closure (still in app.js): " + (result.closure.length ? result.closure.join(", ") : "(none)"));
  console.log("illegal-layer imports: " + (result.illegalImports.length ? result.illegalImports.map(i => `${i.name} (layer ${i.layer}, "${i.specifier}")`).join(", ") : "(none)"));
  console.log(result.verdict);
  process.exit(result.closure.length || result.illegalImports.length ? 1 : 0);
}
