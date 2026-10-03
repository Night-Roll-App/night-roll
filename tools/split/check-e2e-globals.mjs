#!/usr/bin/env node
// tools/split/check-e2e-globals.mjs — a node-only (NOT Playwright) proof
// that the e2e devtools mirror actually covers what the specs need, ahead
// of ever running a browser. docs/split-plan.md §4 step 0b's cutover moved
// app.js's ~203 top-level bindings out of the classic-script global lexical
// scope into an ES module's own scope — invisible to a bare identifier in
// a page.evaluate()/waitForFunction() callback unless src/devtools.js's
// exposeGlobals() mirrors it onto window (gated on window.__NR_EXPOSE,
// set by tests/e2e/helpers.mjs and every spec that navigates on its own —
// see each file's own addInitScript). Without the mirror, or if a spec
// references a name the mirror doesn't cover, CI fails with a
// ReferenceError thrown deep inside a headless browser — slow and opaque.
// This instead statically parses every tests/e2e/*.mjs file (the same
// vendored acorn tools/split/scope.mjs uses) and cross-checks every bare
// identifier referenced inside a page.evaluate()/evaluateHandle()/
// waitForFunction() callback against: (1) every top-level declared name in
// src/**/*.js (what the __nrExpose$ footer mirrors for app.js, and what a real
// module's exports mirror for the rest), and (2) tools/split/
// browser-globals.txt (real browser/ECMAScript globals — check.mjs's own
// allowlist, reused here since the same app surface is in play).
//
//   node tools/split/check-e2e-globals.mjs
//
// Exit 0 ("ok") when every reference resolves; exit 1 with a violation list
// (file:line: "name") otherwise. Wired into tests/modules.test.mjs so
// `npm test` catches drift without ever starting a browser.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseModule, declaredNames, freeIdentifiers } from "./scope.mjs";
import { loadBrowserGlobals } from "./check.mjs";

/** Property names of `export const S = {...}` in src/state.js (step 1's
 *  promote-state.mjs moved ~257 former top-level `let`/`var` names there as
 *  object properties, not top-level declarations) — declaredNames() can't
 *  see these at all, since they're ObjectExpression properties, not
 *  declarations, but src/devtools.js's exposeGlobals() mirrors every one of
 *  them onto window (get AND set), so a bare `song`/`mode = …` reference in
 *  an e2e spec resolves through S exactly like a real module's export. */
function stateFieldNames(srcDir) {
  const names = new Set();
  const stateFile = path.join(srcDir, "state.js");
  let source;
  try { source = readFileSync(stateFile, "utf8"); } catch { return names; }
  const { ast } = parseModule(source, stateFile);
  for (const raw of ast.body) {
    const node = raw.type === "ExportNamedDeclaration" && raw.declaration ? raw.declaration : raw;
    if (node.type !== "VariableDeclaration") continue;
    for (const d of node.declarations) {
      if (d.id.type === "Identifier" && d.id.name === "S" && d.init?.type === "ObjectExpression") {
        for (const prop of d.init.properties) {
          if (prop.type === "Property" && !prop.computed) {
            if (prop.key.type === "Identifier") names.add(prop.key.name);
            else if (prop.key.type === "Literal") names.add(String(prop.key.value));
          }
        }
      }
    }
  }
  return names;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(path.dirname(HERE));
const SRC_DIR = path.join(REPO_ROOT, "src");
const E2E_DIR = path.join(REPO_ROOT, "tests/e2e");
const EVAL_METHODS = /^(evaluate|evaluateHandle|waitForFunction)$/;

/** Every top-level declared name across every src/**\/*.js file — the
 *  union of what src/devtools.js's exposeGlobals() can mirror onto window
 *  once __NR_EXPOSE is set: app.js's names (via the generated __nrExpose$
 *  footer, docs/split-plan.md §4 step 0b deviation) plus every other
 *  module's real exports. A name declared in a real (non-legacy-container)
 *  module but NOT exported wouldn't actually be mirrored — a slight
 *  over-approximation, harmless while app.js (export-everything via
 *  __nrExpose$) is the only module e2e specs reach into; revisit once a spec
 *  reaches a carved-out module that keeps some top-level names private. */
export function appGlobalNames(srcDir = SRC_DIR) {
  const names = new Set();
  (function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".js")) {
        const { ast } = parseModule(readFileSync(p, "utf8"), p);
        for (const node of ast.body) declaredNames(node).forEach(n => names.add(n));
      }
    }
  })(srcDir);
  return names;
}

/** Bare identifiers referenced inside every page.evaluate(...)/
 *  evaluateHandle(...)/waitForFunction(...) callback's first argument,
 *  across every tests/e2e/*.mjs file — name -> [{file, line}]. The
 *  callback runs inside the BROWSER (Playwright serializes it via
 *  Function#toString() and re-evaluates it there), so it has no access to
 *  the Node-side closure except through its own declared parameters —
 *  already treated as bound by scope.mjs's freeIdentifiers, the same way
 *  it treats a function's own params anywhere else. */
export function e2eEvaluateIdentifiers(e2eDir = E2E_DIR) {
  const uses = new Map();
  for (const file of readdirSync(e2eDir)) {
    if (!file.endsWith(".mjs")) continue;
    const abs = path.join(e2eDir, file);
    const { ast } = parseModule(readFileSync(abs, "utf8"), abs);
    (function walk(n) {
      if (!n || typeof n.type !== "string") return;
      if (n.type === "CallExpression" && n.callee.type === "MemberExpression"
          && !n.callee.computed && EVAL_METHODS.test(n.callee.property.name)) {
        const fn = n.arguments[0];
        if (fn && (fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression")) {
          for (const name of freeIdentifiers(fn)) {
            if (!uses.has(name)) uses.set(name, []);
            uses.get(name).push({ file, line: fn.loc.start.line });
          }
        }
      }
      for (const key of Object.keys(n)) {
        if (key === "type" || key === "loc" || key === "start" || key === "end" || key === "range") continue;
        const v = n[key];
        if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c));
        else if (v && typeof v.type === "string") walk(v);
      }
    })(ast);
  }
  return uses;
}

export function checkE2eGlobals({ srcDir = SRC_DIR, e2eDir = E2E_DIR } = {}) {
  const allowed = new Set([...appGlobalNames(srcDir), ...stateFieldNames(srcDir), ...loadBrowserGlobals()]);
  const uses = e2eEvaluateIdentifiers(e2eDir);
  const violations = [];
  for (const [name, sites] of uses) {
    if (allowed.has(name)) continue;
    for (const site of sites) violations.push({ name, ...site });
  }
  return { ok: violations.length === 0, violations, checkedNames: uses.size, allowedCount: allowed.size };
}

function main() {
  const result = checkE2eGlobals();
  if (result.ok) {
    console.log(`check-e2e-globals: ok — ${result.checkedNames} distinct bare identifiers referenced inside tests/e2e/*.mjs page.evaluate()/evaluateHandle()/waitForFunction() callbacks, all resolve via src/devtools.js's window mirror or tools/split/browser-globals.txt (${result.allowedCount} names known).`);
    return;
  }
  console.log(`check-e2e-globals: ${result.violations.length} violation(s)`);
  for (const v of result.violations) console.log(`  ${v.file}:${v.line}: "${v.name}" is not an app global, a src/ export, or in browser-globals.txt`);
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
