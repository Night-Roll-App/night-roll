#!/usr/bin/env node
// tools/split/fix-port-imports.mjs <src-relative file> [...] [--dry-run]
// check.mjs rule 10's alias rewrite, applied mechanically (docs/split-phase2-
// plan.md step 6 finding (b), the rule every layer-4 move since has applied
// by hand): a module may import a port's bare name from src/hooks.js only
// when the port's `XImpl` body lives STRICTLY ABOVE the module's own layer —
// a same-or-lower-layer caller imports `XImpl as X` straight from the body's
// home instead (an import-line-only change, free under verbatim.mjs). The
// impl's own home file keeps its bare-name hooks import (the self-reference
// pattern rule 10 exempts). move.mjs copies app.js's `./hooks.js` imports
// verbatim into every --to, so a run of this after each ui/session/input/
// ask/import/sync move replaces the hand edit. Node-only tooling, never
// shipped.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseModule, declaredNames } from "./scope.mjs";
import { layerOf } from "./check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(path.dirname(HERE));
const SRC = path.join(REPO_ROOT, "src");

function listJs(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) listJs(p, out); else if (ent.name.endsWith(".js")) out.push(p);
  }
  return out;
}

/** rel (src-relative, posix) -> Set of declared top-level names, whole tree. */
export function declaredByFile(srcDir = SRC) {
  const out = new Map();
  for (const abs of listJs(srcDir)) {
    const rel = path.relative(srcDir, abs).split(path.sep).join("/");
    const { ast } = parseModule(readFileSync(abs, "utf8"), rel);
    out.set(rel, new Set(ast.body.flatMap(declaredNames)));
  }
  return out;
}

function relSpecifier(fromRel, toRel) {
  let r = path.posix.relative(path.posix.dirname(fromRel), toRel);
  if (!r.startsWith(".")) r = "./" + r;
  return r;
}

/** Pure: {rel, source, declared} -> {source, changes}. `declared`: the map
 *  declaredByFile() builds. Rewrites each offending `hooks.js` specifier;
 *  a multi-name hooks import line keeps its legal names and gains one
 *  alias line per rewritten name, right after it. */
export function fixPortImports(rel, source, declared) {
  const { ast } = parseModule(source, rel);
  const myLayer = layerOf(rel);
  const changes = [];
  const edits = [];
  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration" || !node.source.value.startsWith(".")) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), node.source.value));
    if (target !== "hooks.js") continue;
    const keep = [], aliases = [];
    for (const sp of node.specifiers) {
      if (sp.type !== "ImportSpecifier") { keep.push(sp); continue; }
      const name = sp.imported.name;
      const impl = name + "Impl";
      const owner = [...declared].find(([, names]) => names.has(impl))?.[0];
      if (!owner || owner === rel) { keep.push(sp); continue; } // no body yet (still app.js) or the body's own home
      const ownerLayer = layerOf(owner);
      if (ownerLayer === null || myLayer === null || ownerLayer > myLayer) { keep.push(sp); continue; } // a genuine upcall
      aliases.push(`import { ${impl} as ${sp.local.name} } from "${relSpecifier(rel, owner)}";`);
      changes.push(`${name}: hooks.js -> ${owner}`);
    }
    if (!aliases.length) continue;
    const keptLine = keep.length ? `import { ${keep.map(sp => sp.imported.name === sp.local.name ? sp.local.name : `${sp.imported.name} as ${sp.local.name}`).join(", ")} } from "${node.source.value}";` : null;
    edits.push({ start: node.start, end: node.end, replacement: [keptLine, ...aliases].filter(Boolean).join("\n") });
  }
  let out = "", cursor = 0;
  for (const e of edits.sort((a, b) => a.start - b.start)) { out += source.slice(cursor, e.start) + e.replacement; cursor = e.end; }
  out += source.slice(cursor);
  return { source: out, changes };
}

function isMain() {
  try { return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]); }
  catch { return false; }
}

if (isMain()) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const files = argv.filter(a => a !== "--dry-run");
  if (!files.length) throw new Error("usage: fix-port-imports.mjs <src-relative file> [...] [--dry-run]");
  const declared = declaredByFile();
  for (const f of files) {
    const rel = f.replace(/^\.?\/*src\//, "").split(path.sep).join("/");
    const abs = path.join(SRC, rel);
    const { source, changes } = fixPortImports(rel, readFileSync(abs, "utf8"), declared);
    if (!changes.length) { console.log(`${rel}: nothing to rewrite`); continue; }
    console.log(`${rel}: ${changes.join("; ")}`);
    if (!dryRun) writeFileSync(abs, source);
  }
}
