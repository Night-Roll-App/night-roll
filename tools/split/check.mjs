// tools/split/check.mjs — the 8 static rules of docs/split-plan.md §3.6, plus
// rules 9-10 (docs/split-phase2-plan.md §1 M1/M4: every import specifier
// actually exports the name it claims; src/hooks.js's upcall ports are
// well-formed, each has exactly one correctly-layered XImpl, and nothing at
// module-eval time calls one early) — run by tests/modules.test.mjs
// (npm test) and by `node tools/split/check.mjs` directly. Node-only, never
// shipped. Until step 0b creates src/, there is nothing under src/ to check:
// checkSrc() then reports zero files and ok:true rather than erroring, so
// npm test stays green through 0a.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseModule, declaredNames, exportedNames, freeIdentifiers, topLevelImports,
  topLevelMutableNames, isDeclaration,
} from "./scope.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(path.dirname(HERE));

// ---- the layer table (docs/split-plan.md §1) ---------------------------
// A module may import only from its own layer or a lower one.
// docs/split-phase2-plan.md §1 M1/M4: hooks.js (layer 0 — a port is a 1:1
// synchronous forward, no heavier than state.js itself) and wire.js (layer
// 5 — the composition root, alongside app.js/main.js) and the new
// session/ directory (layer 4, song-lifecycle orchestration) are added to
// the table now, ahead of docs/split-phase2-plan.md's own step 1/6 — rules
// 5/9/10 must not fail just because neither file exists in src/ yet (every
// rule below is a per-FILE check that simply never runs for a file that
// isn't there).
export const LAYERS = [
  // docs/split-phase2-plan.md §1 M2: ui/controls.js moved here (it imports
  // only ui/icons.js, same as ui/icons.js itself) so setPlayBtn/setControl
  // are reachable from audio/* without a port. Checked ahead of "ui" (layer
  // 4, below) since layerOf() returns the FIRST matching entry, lowest
  // layer first.
  ["state.js", "edition.js", "ui/icons.js", "ui/controls.js", "midi", "theory", "hooks.js"],
  ["platform"],
  ["model", "gen"],
  ["audio", "render"],
  ["input", "ui", "ask", "import", "sync", "session"],
  ["main.js", "devtools.js", "app.js", "wire.js"],
];

// app.js (docs/split-plan.md §4 step 0b's cutover; deleted in step 15) is the
// whole pre-split app, so it doesn't fit the layer table like a real module
// does — it's layered alongside main.js/devtools.js (the two other things
// that are allowed to see the whole app) so that main.js importing it, and
// it importing any real module as steps 1-14 carve pieces out, both pass
// rule 5. LEGACY_CONTAINER is also exempt from rule 3 (top-level mutable):
// it still holds ~203 top-level `let`s until step 1's promote-state.mjs
// moves them to `S`. This is the one check.mjs concession to the fact that
// app.js is scaffolding, not a finished module — it shrinks to nothing by
// step 15, at which point LEGACY_CONTAINER (and this comment) should go too.
export const LEGACY_CONTAINER = "app.js";

/** 0-5 layer number for a module's path relative to src/, or null if it
 *  matches no entry (check.mjs then flags it as unplaced, a stronger
 *  failure than silently allowing anything). */
export function layerOf(relPath) {
  const norm = relPath.split(path.sep).join("/");
  const top = norm.split("/")[0];
  for (let i = 0; i < LAYERS.length; i++) {
    for (const entry of LAYERS[i]) {
      if (entry === norm || entry === top || norm.startsWith(entry + "/")) return i;
    }
  }
  return null;
}

// §2.4: functions shipped to a Worker via .toString() must have no free
// identifier besides a JS builtin — the S-codemod (step 1) must never
// rewrite inside one of these to `S.x`, and the mover must never partially
// move one's dependencies out from under it.
export const SERIALIZED = ["wsolaStretch"];

// ECMAScript builtins only (stricter than browser-globals.txt, which also
// allows DOM/window — a serialized function runs inside a Worker's own
// global scope, with no access to this app's other modules).
const SERIALIZED_GLOBALS = new Set([
  "globalThis", "undefined", "NaN", "Infinity", "Object", "Function", "Array",
  "String", "Number", "Boolean", "Symbol", "BigInt", "Date", "RegExp", "Error",
  "EvalError", "RangeError", "ReferenceError", "SyntaxError", "TypeError",
  "URIError", "AggregateError", "Math", "JSON", "Promise", "Map", "Set",
  "WeakMap", "WeakSet", "Proxy", "Reflect", "ArrayBuffer", "SharedArrayBuffer",
  "DataView", "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array",
  "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array",
  "BigInt64Array", "BigUint64Array", "isNaN", "isFinite", "parseInt",
  "parseFloat", "encodeURI", "decodeURI", "encodeURIComponent",
  "decodeURIComponent", "structuredClone", "queueMicrotask",
  "self", "postMessage", "console", // a worker's own scope
]);

export function loadBrowserGlobals(file = path.join(HERE, "browser-globals.txt")) {
  const set = new Set();
  if (!existsSync(file)) return set;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) set.add(t);
  }
  return set;
}

// ---- individual rules, each (parsed, ...) -> [{rule, message}] ----------

/** Rule 1: every free identifier is a local, an import, or a browser global. */
export function ruleFreeIdentifiers(parsed, allowed) {
  const free = freeIdentifiers(parsed.ast);
  const out = [];
  for (const name of free) if (!allowed.has(name))
    out.push({ rule: 1, message: `free identifier "${name}" is not a local, an import, or in browser-globals.txt` });
  return out;
}

/** Rule 2: no assignment to an imported binding (ES import bindings are
 *  read-only; this is a TypeError at runtime, caught here statically). */
export function ruleNoAssignToImport(parsed) {
  const imports = topLevelImports(parsed.ast);
  const out = [];
  (function walk(n) {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "AssignmentExpression" && n.left.type === "Identifier" && imports.has(n.left.name))
      out.push({ rule: 2, message: `assignment to imported binding "${n.left.name}"` });
    if ((n.type === "UpdateExpression") && n.argument.type === "Identifier" && imports.has(n.argument.name))
      out.push({ rule: 2, message: `update of imported binding "${n.argument.name}"` });
    for (const key of Object.keys(n)) {
      if (key === "type" || key === "loc" || key === "start" || key === "end" || key === "range") continue;
      const v = n[key];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c));
      else if (v && typeof v.type === "string") walk(v);
    }
  })(parsed.ast);
  return out;
}

/** Rule 3: no top-level let/var anywhere except state.js. */
export function ruleTopLevelMutable(parsed, { isStateFile = false } = {}) {
  if (isStateFile) return [];
  return topLevelMutableNames(parsed.ast).map(name =>
    ({ rule: 3, message: `top-level mutable binding "${name}" outside state.js` }));
}

function isPureLiteralish(node) {
  if (!node) return true;
  switch (node.type) {
    case "FunctionExpression": case "ArrowFunctionExpression": case "ClassExpression":
    case "Literal": case "Identifier": case "TemplateLiteral":
      return true;
    // An object/array literal built only from pure-literalish parts (docs/
    // split-phase2-plan.md step 2 surfaced this: CHIPS, a plain `{nsf: {...},
    // ...}` table of closures, moving out of app.js — the legacy container's
    // own rule-4/rule-10d exemption — into a real module for the first time).
    // Same reasoning the FunctionExpression/ArrowFunctionExpression case
    // above already rests on: a function's BODY isn't inspected here because
    // it only runs when CALLED, never at module-eval time; building the
    // ENCLOSING object/array is equally side-effect-free when every property/
    // element is itself one of these safely-deferred shapes — nothing
    // executes constructing the literal, regardless of what a nested
    // closure's own body later references.
    case "ObjectExpression":
      return node.properties.every(p => p.type === "SpreadElement" ? isPureLiteralish(p.argument)
        : (!p.computed || isPureLiteralish(p.key)) && isPureLiteralish(p.value));
    case "ArrayExpression":
      return node.elements.every(e => e === null || isPureLiteralish(e.type === "SpreadElement" ? e.argument : e));
    default:
      return false;
  }
}

/** Every expression that actually RUNS at module-evaluation time, across a
 *  module's whole top level: a non-declaration statement's own expression,
 *  or a const/let declarator's init when it isn't a side-effect-free
 *  literal/function/class/arrow (shared by rule 4 and rule 10's "no
 *  top-level initializer calls a port" check — both ask the identical
 *  question, just against a different disallowed set). */
export function topLevelEffectExpressions(ast) {
  const effectNodes = [];
  for (const raw of ast.body) {
    // unwrap `export` the same way scope.declaredNames does — every top-level
    // declaration the mover produces is exported, so this is the common case.
    const node = (raw.type === "ExportNamedDeclaration" || raw.type === "ExportDefaultDeclaration") && raw.declaration ? raw.declaration : raw;
    if (node.type === "VariableDeclaration") {
      for (const d of node.declarations) if (d.init && !isPureLiteralish(d.init)) effectNodes.push(d.init);
    } else if (!isDeclaration(node) && node.type !== "ImportDeclaration" && node.type !== "ExportDefaultDeclaration" && node.type !== "ExportNamedDeclaration") {
      effectNodes.push(node);
    }
  }
  return effectNodes;
}

/** Rule 4: a top-level initializer (anything that runs at module-evaluation
 *  time — a non-declaration statement, or a const/let declarator whose init
 *  isn't a side-effect-free literal/function/class/arrow expression) may
 *  reference only layer-0 imports. `importLayer(name)` maps an imported
 *  local name to its source module's layer (or null if unresolved/external). */
export function ruleTopLevelInitLayerZero(parsed, importLayer) {
  const out = [];
  for (const en of topLevelEffectExpressions(parsed.ast)) {
    for (const name of freeIdentifiers(en)) {
      const layer = importLayer(name);
      if (layer !== undefined && layer !== null && layer !== 0)
        out.push({ rule: 4, message: `top-level initializer references "${name}" from layer ${layer}, not layer 0` });
    }
  }
  return out;
}

/** Rule 5: the layer table — an importer may only import its own layer or lower. */
export function ruleLayerTable(relPath, ast) {
  const out = [];
  const selfLayer = layerOf(relPath);
  const selfDir = path.posix.dirname(relPath.split(path.sep).join("/"));
  if (selfLayer === null) return [{ rule: 5, message: `${relPath} matches no entry in the layer table` }];
  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration") continue;
    const spec = node.source.value;
    if (!spec.startsWith(".")) continue; // external/bare specifier (vendor) — not layered
    const target = path.posix.normalize(path.posix.join(selfDir, spec));
    // a relative import that resolves OUTSIDE src/ entirely (e.g.
    // src/ask/backend.js's "../../vendor/ai/web/sse.js") leaves Night Roll's
    // own layer system by construction — nothing under src/ can ever be
    // "above" or "below" a file that was never placed in the layer table in
    // the first place, so it's not this rule's concern (checkSrc's
    // extraRoots param runs its own, separate rules 1-3/7 over it).
    if (target.startsWith("../")) continue;
    const targetLayer = layerOf(target);
    if (targetLayer === null) { out.push({ rule: 5, message: `${relPath}: import "${spec}" resolves outside the layer table` }); continue; }
    if (targetLayer > selfLayer)
      out.push({ rule: 5, message: `${relPath} (layer ${selfLayer}) imports "${spec}" (layer ${targetLayer}) — higher layers may not be imported` });
  }
  return out;
}

/** Rule 6: top-level names unique across src/. `declaredByFile`: Map<relPath, string[]>. */
export function ruleUniqueNames(declaredByFile) {
  const owner = new Map(); // name -> relPath
  const out = [];
  for (const [file, names] of declaredByFile) for (const name of names) {
    if (owner.has(name) && owner.get(name) !== file)
      out.push({ rule: 6, message: `top-level name "${name}" declared in both ${owner.get(name)} and ${file}` });
    else owner.set(name, file);
  }
  return out;
}

/** Rule 7: SERIALIZED functions are self-contained (no free identifier
 *  besides a JS/worker builtin). `functionsByName`: Map<name, FunctionNode>. */
export function ruleSerializedSelfContained(functionsByName) {
  const out = [];
  for (const name of SERIALIZED) {
    const fn = functionsByName.get(name);
    if (!fn) continue; // not present yet (pre-0b) or lives elsewhere — nothing to check
    for (const free of freeIdentifiers(fn))
      if (!SERIALIZED_GLOBALS.has(free))
        out.push({ rule: 7, message: `SERIALIZED function "${name}" references "${free}", not self-contained` });
  }
  return out;
}

/** Rule 8: named lists that must all describe the same set of modules
 *  (the index.html modulepreload list, sw.js APP_MODULES, devtools.js's
 *  `import * as` list, and the real src/ file listing). */
export function ruleManifestsEqual(listsByLabel) {
  const entries = Object.entries(listsByLabel).map(([label, list]) => [label, new Set(list)]);
  if (entries.length < 2) return [];
  const [firstLabel, firstSet] = entries[0];
  const out = [];
  for (const [label, set] of entries.slice(1)) {
    for (const f of firstSet) if (!set.has(f)) out.push({ rule: 8, message: `${firstLabel} has "${f}" but ${label} doesn't` });
    for (const f of set) if (!firstSet.has(f)) out.push({ rule: 8, message: `${label} has "${f}" but ${firstLabel} doesn't` });
  }
  return out;
}

/** Rule 9 (docs/split-phase2-plan.md §1 M4): every named import specifier
 *  actually resolves to a module that exports that name. check.mjs's rule 1
 *  (free identifiers) only checks that a bare name resolves to SOME import
 *  at a legal layer — not that the TARGET file still exports it under that
 *  name after a relocation. A stale specifier (the import line wasn't
 *  updated when the name moved again) or a lost `export` keyword (two
 *  declarations briefly shared one physical line during a `verbatim.mjs`
 *  fixup, and only one kept its `export`) both pass rule 1 and `verbatim.mjs`
 *  clean — only `npm test`'s real module linking caught either, per
 *  docs/split-plan.md's Deviations (14). `moduleExports`: Map<relPath,
 *  string[]> (see scope.exportedNames) for every file in this scan. */
export function ruleImportsResolve(relPath, ast, moduleExports) {
  const out = [];
  const selfDir = path.posix.dirname(relPath.split(path.sep).join("/"));
  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration") continue;
    const spec = node.source.value;
    if (!spec.startsWith(".")) continue; // external/vendor specifier — not this scan's to resolve
    const target = path.posix.normalize(path.posix.join(selfDir, spec));
    const exported = moduleExports.get(target);
    if (!exported) continue; // target isn't part of this scan (rule 5 already flags "resolves outside the layer table" for a src/-relative miss)
    if (exported.has("*")) continue; // target itself does `export * from ...` — would need to follow the chain to verify; not this rule's concern
    for (const s of node.specifiers) {
      const name = s.type === "ImportDefaultSpecifier" ? "default"
        : s.type === "ImportNamespaceSpecifier" ? null // `import * as ns` always resolves structurally
        : s.imported.name;
      if (name === null) continue;
      if (!exported.has(name))
        out.push({ rule: 9, message: `${relPath}: import "${name}" from "${spec}" — ${target} does not export "${name}"` });
    }
  }
  return out;
}

// ---- Rule 10 (docs/split-phase2-plan.md §1 M1/M4): src/hooks.js's upcall
// ports. A port is a one-line synchronous forwarder — `export function
// X(...a) { return (S.hooks.X || need("X"))(...a); }` — that keeps the
// original name so call sites never change; the real body, renamed `XImpl`,
// lives at whichever module actually needs it, strictly above every module
// that still imports the port from hooks.js (the plan's own M1 rule: "a name
// may be a port only if its body lives at a higher layer than every port
// caller"). Checked only `if (src/hooks.js exists)` — none of this runs
// before docs/split-phase2-plan.md's own step 1 creates it.

/** `export function X(...a) { return (S.hooks.X || need("X"))(...a); }` —
 *  returns "X" when `node` is exactly this shape, else null. */
export function forwarderPortName(node) {
  if (node.type !== "ExportNamedDeclaration" || !node.declaration) return null;
  const fn = node.declaration;
  if (fn.type !== "FunctionDeclaration" || !fn.id) return null;
  const name = fn.id.name;
  if (fn.params.length !== 1 || fn.params[0].type !== "RestElement" || fn.params[0].argument.type !== "Identifier") return null;
  const argName = fn.params[0].argument.name;
  if (fn.body.type !== "BlockStatement" || fn.body.body.length !== 1) return null;
  const ret = fn.body.body[0];
  if (ret.type !== "ReturnStatement" || !ret.argument || ret.argument.type !== "CallExpression") return null;
  const call = ret.argument;
  if (call.arguments.length !== 1 || call.arguments[0].type !== "SpreadElement"
    || call.arguments[0].argument.type !== "Identifier" || call.arguments[0].argument.name !== argName) return null;
  const callee = call.callee;
  if (callee.type !== "LogicalExpression" || callee.operator !== "||") return null;
  const { left, right } = callee;
  if (left.type !== "MemberExpression" || left.computed || left.object.type !== "MemberExpression" || left.object.computed) return null;
  if (left.object.object.type !== "Identifier" || left.object.object.name !== "S") return null;
  if (left.object.property.type !== "Identifier" || left.object.property.name !== "hooks") return null;
  if (left.property.type !== "Identifier" || left.property.name !== name) return null;
  if (right.type !== "CallExpression" || right.callee.type !== "Identifier" || right.callee.name !== "need") return null;
  if (right.arguments.length !== 1 || right.arguments[0].type !== "Literal" || right.arguments[0].value !== name) return null;
  return name;
}

/** `const need = n => { ... };` (or a plain function) — the fail-loud
 *  helper every forwarder falls back to. Only the name/shape is load-bearing
 *  for this rule; the exact thrown message isn't. */
function isNeedHelper(node) {
  if (node.type !== "VariableDeclaration" || node.kind !== "const" || node.declarations.length !== 1) return false;
  const d = node.declarations[0];
  if (d.id.type !== "Identifier" || d.id.name !== "need") return false;
  return !!d.init && (d.init.type === "ArrowFunctionExpression" || d.init.type === "FunctionExpression");
}

/** Rule 10a: hooks.js contains only forwarder functions of the exact plan
 *  shape, the `need` helper, and its own `S` import — nothing else. */
export function ruleHooksShape(ast) {
  const out = [];
  for (const node of ast.body) {
    if (node.type === "ImportDeclaration") {
      const names = node.specifiers.map(s => s.local.name);
      if (node.source.value !== "./state.js" || names.length !== 1 || names[0] !== "S")
        out.push({ rule: 10, message: `src/hooks.js: unexpected import (only "import { S } from \\"./state.js\\";" is allowed)` });
      continue;
    }
    if (isNeedHelper(node)) continue;
    if (forwarderPortName(node) !== null) continue;
    out.push({ rule: 10, message: `src/hooks.js: top-level statement is not the S import, the need() helper, or a port forwarder of the exact plan shape` });
  }
  return out;
}

/** Rule 10b/10c: every port named by a hooks.js forwarder has EXACTLY one
 *  `XImpl` declared somewhere in src/, and that impl's layer is strictly
 *  above every module that still imports the port (bare name `X`) from
 *  hooks.js — a port exists ONLY to let a genuinely LOWER layer reach a
 *  higher one; a same-layer (or scaffolding-tier) caller never needed
 *  porting in the first place (§2.3: cycles inside layers 3-5 are legal
 *  without one) and belongs on a direct, aliased import of `XImpl` from
 *  the impl's own file instead (docs/split-phase2-plan.md §1 M1's "only
 *  the import line changes" — an import SPECIFIER/alias change is always
 *  free, verbatim.mjs skips every import line unconditionally), not on the
 *  port. `declaredByFile`: Map<relPath, string[]>; `importersOf(name)`:
 *  relPath[] of files importing `name` from hooks.js; `layerOfFn`: relPath
 *  -> layer number or null. Two kinds of caller are exempt from the layer
 *  check entirely, same reasoning as rule 4/5's existing LEGACY_CONTAINER
 *  treatment above: (a) the impl's OWN home file (self-reference — the
 *  plan's own "internal callers import the port" pattern, for call sites
 *  that keep the bare, pre-rename name — never a layer crossing, since
 *  it's the identical file at the identical layer); (b) app.js/main.js,
 *  the scaffolding tier that may always import any layer. */
export function ruleHooksPorts(hooksAst, declaredByFile, importersOf, layerOfFn) {
  const out = [];
  const ports = hooksAst.body.map(forwarderPortName).filter(Boolean);
  for (const name of ports) {
    const implName = `${name}Impl`;
    const owners = [];
    for (const [file, names] of declaredByFile) if (names.includes(implName)) owners.push(file);
    if (owners.length === 0) { out.push({ rule: 10, message: `hooks.js port "${name}" has no "${implName}" declared anywhere in src/` }); continue; }
    if (owners.length > 1) { out.push({ rule: 10, message: `hooks.js port "${name}": "${implName}" is declared in more than one file (${owners.join(", ")})` }); continue; }
    const implLayer = layerOfFn(owners[0]);
    for (const callerFile of importersOf(name)) {
      if (callerFile === owners[0] || callerFile === "main.js" || callerFile === LEGACY_CONTAINER) continue;
      const callerLayer = layerOfFn(callerFile);
      if (implLayer === null || callerLayer === null) continue;
      if (!(implLayer > callerLayer))
        out.push({ rule: 10, message: `hooks.js port "${name}": its impl (${owners[0]}, layer ${implLayer}) is not above caller ${callerFile} (layer ${callerLayer})` });
    }
  }
  return out;
}

/** Rule 10d: no top-level initializer (module-evaluation-time code, same
 *  definition rule 4 uses) anywhere in src/ may call a port — hooks aren't
 *  installed yet at that point in boot order (main.js calls
 *  `installHooks()` before any `init*()`, but a module's OWN top level runs
 *  the instant it's imported, which can be earlier). `portNames`: Set<string>. */
export function ruleNoTopLevelPortCalls(ast, portNames) {
  const out = [];
  for (const en of topLevelEffectExpressions(ast)) {
    for (const name of freeIdentifiers(en)) if (portNames.has(name))
      out.push({ rule: 10, message: `top-level initializer calls port "${name}" before hooks are installed` });
  }
  return out;
}

// ---- walking a real src/ tree -------------------------------------------

function listJsFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  (function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".js")) out.push(p);
    }
  })(root);
  return out;
}

/** Check every src/**\/*.js file against rules 1-7 (rule 8 needs manifests
 *  from elsewhere — see ruleManifestsEqual, called separately once index.html
 *  and sw.js carry module lists, from step 0b on).
 *
 *  `opts.extraRoots`: additional flat JS trees (docs/ai-library-plan.md §4
 *  step 1 — vendor/ai/web, the vendored AI library) checked by rules 1-3/7
 *  (no top-level let outside state.js, no assigning an import, every free
 *  identifier resolved, no self-referencing SERIALIZED function) and folded
 *  into rule 6's uniqueness map alongside src/ (the library's `ai`-prefixed
 *  names and Night Roll's `ask`-prefixed ones must never collide, since the
 *  vm harness's scopeProxy resolves a bare name by owning module, same as a
 *  real `with` scope would). Each entry is `{ root, prefix }` (prefix e.g.
 *  "vendor/ai/web" — turns its files' rel paths into "vendor/ai/web/sse.js"
 *  so they can never collide with a real src/ rel path, which never starts
 *  with "vendor/"). Exempt from rule 5 (the layer table) and rule 4 (every
 *  top-level initializer effect must be layer-0): neither concept applies to
 *  a library that isn't part of Night Roll's own src/ layer system. */
export function checkSrc(srcRoot = path.join(REPO_ROOT, "src"), opts = {}) {
  const extraRoots = opts.extraRoots || [];
  const files = listJsFiles(srcRoot);
  const violations = [];
  if (!files.length && !extraRoots.length) return { ok: true, fileCount: 0, violations: [] };

  const browserGlobals = loadBrowserGlobals();
  const parsedByFile = new Map(); // relPath -> parsed
  const declaredByFile = new Map(); // relPath -> string[]
  const exportsByFile = new Map(); // relPath -> Set<string> (rule 9)
  const functionsByName = new Map(); // name -> FunctionDeclaration node (for rule 7)
  const vendorRels = new Set(); // rel keys from extraRoots — rule 4/5 skip these

  function collect(abs, rel) {
    const source = readFileSync(abs, "utf8");
    let parsed;
    try { parsed = parseModule(source, rel); }
    catch (e) { violations.push({ rule: 0, message: e.message }); return; }
    parsedByFile.set(rel, parsed);
    // rule 6's uniqueness map wants names this file ITSELF declares, not one
    // it merely forwards — `export { x } from "y"` (a pure re-export, e.g.
    // vendor/ai/web/index.js forwarding sse.js's aiSSE) creates no local
    // binding at all (scope.declaredNames doesn't special-case `node.source`,
    // so it would otherwise count as "declared" here), and `export { x };`
    // where `x` is a top-level IMPORT in this same file (e.g.
    // src/ask/backend.js forwarding vendor/ai/web/sse.js's aiSSE so every
    // existing `import { aiSSE } from "./ask/backend.js"` keeps working) is
    // forwarding too, just via a local binding instead of a direct re-export.
    const imports = topLevelImports(parsed.ast);
    const names = parsed.ast.body.flatMap(n => (n.type === "ExportNamedDeclaration" && n.source) ? [] : declaredNames(n))
      .filter(n => !imports.has(n));
    declaredByFile.set(rel, names);
    exportsByFile.set(rel, new Set(exportedNames(parsed.ast)));
    for (const node of parsed.ast.body) {
      const decl = node.type === "ExportNamedDeclaration" ? node.declaration : node;
      if (decl?.type === "FunctionDeclaration" && decl.id) functionsByName.set(decl.id.name, decl);
    }
  }
  for (const abs of files) collect(abs, path.relative(srcRoot, abs).split(path.sep).join("/"));
  for (const { root, prefix } of extraRoots) for (const abs of listJsFiles(root)) {
    const rel = prefix + "/" + path.relative(root, abs).split(path.sep).join("/");
    vendorRels.add(rel);
    collect(abs, rel);
  }

  for (const [rel, parsed] of parsedByFile) {
    const isStateFile = rel === "state.js" || rel === LEGACY_CONTAINER;
    const isVendor = vendorRels.has(rel);
    violations.push(...ruleFreeIdentifiers(parsed, browserGlobals));
    violations.push(...ruleNoAssignToImport(parsed));
    violations.push(...ruleTopLevelMutable(parsed, { isStateFile }));
    violations.push(...ruleImportsResolve(rel, parsed.ast, exportsByFile)); // rule 9 — runs for vendor files too, same as rules 1-3
    if (isVendor) continue; // rules 4/5 need Night Roll's own layer table, which a vendored library isn't part of
    violations.push(...ruleLayerTable(rel, parsed.ast));

    const imports = topLevelImports(parsed.ast); // name -> {specifier, imported}
    const selfDir = path.posix.dirname(rel.split(path.sep).join("/"));
    const importLayer = (name) => {
      const info = imports.get(name);
      if (!info) return undefined; // not an import — rule 4 ignores it (rule 1 already covers unresolved frees)
      if (!info.specifier.startsWith(".")) return null; // vendor/external — not layered
      return layerOf(path.posix.normalize(path.posix.join(selfDir, info.specifier)));
    };
    // main.js (docs/split-plan.md §1) IS the ordered top-level call list —
    // "calls init*() in original file order, then boot()" — so by design its
    // top-level statements reference every layer, not just layer 0. ES
    // module evaluation order (dependencies before dependents) already
    // guarantees everything it calls has finished evaluating; rule 4 exists
    // to stop an ORDINARY module from depending on not-yet-ready state, and
    // main.js, always the last thing evaluated, can't hit that hazard.
    //
    // app.js (LEGACY_CONTAINER) is exempt the same way, for a narrower
    // reason specific to it (docs/split-plan.md §4 step 2's first real hit:
    // the volume-button boot code calling the newly-imported setVolBtn,
    // src/ui/controls.js, at app.js's own top level): app.js sits at the
    // SAME layer tier as main.js (the layer table, above), meaning nothing
    // it can import — now or as later steps carve more of it out — imports
    // app.js back (that would be a layer-table violation on the OTHER
    // module, caught by rule 5). With no cycle possible into app.js from
    // anything it statically imports, ES module evaluation order alone
    // (every static import finishes evaluating before the importing
    // module's own top-level code runs, full stop) already guarantees a
    // name app.js imports — at ANY layer — is ready by the time app.js's
    // top level references it. Rule 4's layer-0-only restriction exists to
    // catch exactly the case this can't be: a reference that MIGHT be part
    // of an unresolved cycle. Narrower than main.js's exemption (app.js
    // still can't read not-yet-initialized STATE from a sibling at its own
    // tier — there are none to read from), but the same underlying
    // guarantee. Deleted with LEGACY_CONTAINER itself in step 15.
    if (rel !== "main.js" && rel !== LEGACY_CONTAINER) violations.push(...ruleTopLevelInitLayerZero(parsed, importLayer));
  }
  violations.push(...ruleUniqueNames(declaredByFile));
  violations.push(...ruleSerializedSelfContained(functionsByName));

  // Rule 10 (docs/split-phase2-plan.md §1 M1/M4) — only once hooks.js
  // exists; "rules must not fail on absence" (this task's own instruction)
  // means every piece of it is gated behind this single check.
  const hooksParsed = parsedByFile.get("hooks.js");
  if (hooksParsed) {
    violations.push(...ruleHooksShape(hooksParsed.ast));
    const ports = hooksParsed.ast.body.map(forwarderPortName).filter(Boolean);
    const portSet = new Set(ports);
    const importersOf = (name) => {
      const out = [];
      for (const [rel, parsed] of parsedByFile) {
        if (rel === "hooks.js") continue;
        const selfDir = path.posix.dirname(rel.split(path.sep).join("/"));
        for (const node of parsed.ast.body) {
          if (node.type !== "ImportDeclaration" || !node.source.value.startsWith(".")) continue;
          const target = path.posix.normalize(path.posix.join(selfDir, node.source.value));
          if (target !== "hooks.js") continue;
          if (node.specifiers.some(s => s.type === "ImportSpecifier" && s.imported.name === name)) { out.push(rel); break; }
        }
      }
      return out;
    };
    violations.push(...ruleHooksPorts(hooksParsed.ast, declaredByFile, importersOf, layerOf));
    // app.js/main.js excluded, same as rule 4's own call above and for the
    // same reason: a "top-level" reference inside one of app.js's ~326
    // listener/IIFE blocks is frequently a callback body that runs on a
    // later event, not at module-evaluation time — topLevelEffectExpressions
    // can't tell the two apart (by design, same as rule 4), and app.js's
    // own `installHooks();` (its first statement) already runs before any
    // of those callbacks ever could.
    if (portSet.size) for (const [rel, parsed] of parsedByFile) {
      if (rel === "main.js" || rel === LEGACY_CONTAINER) continue;
      violations.push(...ruleNoTopLevelPortCalls(parsed.ast, portSet));
    }
  }

  const vendorFileCount = extraRoots.reduce((n, { root }) => n + listJsFiles(root).length, 0);
  return { ok: violations.length === 0, fileCount: files.length + vendorFileCount, violations };
}

// ---- CLI -----------------------------------------------------------------
function isMain() {
  try { return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]); }
  catch { return false; }
}
if (isMain()) {
  const defaultRoot = path.join(REPO_ROOT, "src");
  const srcRoot = process.argv[2] ? path.resolve(process.argv[2]) : defaultRoot;
  // the default (whole-repo) run also covers the vendored AI library — a
  // custom root (test fixtures) opts out by not being the real src/ tree.
  const aiWeb = path.join(REPO_ROOT, "vendor", "ai", "web");
  const extraRoots = srcRoot === defaultRoot && existsSync(aiWeb) ? [{ root: aiWeb, prefix: "vendor/ai/web" }] : [];
  const result = checkSrc(srcRoot, { extraRoots });
  if (!result.fileCount) console.log(`check.mjs: no .js files under ${path.relative(REPO_ROOT, srcRoot) || "src"} yet — nothing to check (pre-0b)`);
  else console.log(`check.mjs: ${result.fileCount} file(s), ${result.violations.length} violation(s)`);
  for (const v of result.violations) console.error(`  rule ${v.rule}: ${v.message}`);
  process.exit(result.ok ? 0 : 1);
}
