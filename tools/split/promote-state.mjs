// tools/split/promote-state.mjs --file <module> --state <state.js> (--names a,b | --all) [--dry-run]
// Step 1's codemod (docs/split-plan.md §2.1, §4 step 1): every targeted
// top-level `let`/`var` becomes a property of `export const S` in state.js,
// and every reference to it in --file becomes `S.name` — a scope-aware
// rename, so a local or parameter of the same name is left alone. A literal/
// browser-global/null initializer goes straight into state.js; an
// initializer that calls app code or reads another module's binding becomes
// `null` in state.js plus `S.name = <init>;` left at the original spot.
// Node-only tooling, never shipped.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseModule, leadingComments, declaredNames, freeIdentifiers,
  topLevelImports, patternNames, hoistedNames, blockScopedNames,
} from "./scope.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(path.dirname(HERE));

// ---- pass 1: scope-aware rename of free references to `S.<name>` --------

function collectUses(ast, targetNames) {
  const edits = [];
  function walk(n, bound) {
    if (!n || typeof n.type !== "string") return;
    switch (n.type) {
      case "Identifier":
        if (targetNames.has(n.name) && !bound.has(n.name)) edits.push({ start: n.start, end: n.end, name: n.name, shorthand: false });
        return;
      case "MemberExpression":
        walk(n.object, bound);
        if (n.computed) walk(n.property, bound);
        return;
      case "Property":
        if (n.computed) walk(n.key, bound);
        if (n.value && !n.computed && n.shorthand && n.value.type === "Identifier" && targetNames.has(n.value.name) && !bound.has(n.value.name))
          edits.push({ start: n.value.start, end: n.value.end, name: n.value.name, shorthand: true });
        else if (n.value) walk(n.value, bound);
        return;
      case "MethodDefinition":
        if (n.computed) walk(n.key, bound);
        if (n.value) walk(n.value, bound);
        return;
      case "ImportDeclaration":
        return;
      case "ExportNamedDeclaration":
        if (n.declaration) walk(n.declaration, bound);
        return;
      case "ExportDefaultDeclaration":
        walk(n.declaration, bound);
        return;
      case "VariableDeclarator":
        if (n.init) walk(n.init, bound);
        return;
      case "FunctionDeclaration":
      case "FunctionExpression": {
        const inner = new Set(bound);
        if (n.id) inner.add(n.id.name);
        n.params.forEach(p => { patternNames(p).forEach(nm => inner.add(nm)); if (p.type === "AssignmentPattern") walk(p.right, bound); });
        hoistedNames(n.body).forEach(nm => inner.add(nm));
        walk(n.body, inner);
        return;
      }
      case "ArrowFunctionExpression": {
        const inner = new Set(bound);
        n.params.forEach(p => { patternNames(p).forEach(nm => inner.add(nm)); if (p.type === "AssignmentPattern") walk(p.right, bound); });
        if (n.body.type === "BlockStatement") hoistedNames(n.body).forEach(nm => inner.add(nm));
        walk(n.body, inner);
        return;
      }
      case "ClassDeclaration":
      case "ClassExpression": {
        const inner = new Set(bound);
        if (n.id) inner.add(n.id.name);
        if (n.superClass) walk(n.superClass, bound);
        walk(n.body, inner);
        return;
      }
      case "CatchClause": {
        const inner = new Set(bound);
        patternNames(n.param).forEach(nm => inner.add(nm));
        walk(n.body, inner);
        return;
      }
      case "BlockStatement": {
        const inner = new Set(bound);
        blockScopedNames(n).forEach(nm => inner.add(nm));
        n.body.forEach(s => walk(s, inner));
        return;
      }
      case "ForStatement": {
        const inner = new Set(bound);
        // docs/split-plan.md §4 step 1 deviation: same fix as scope.mjs's
        // freeIdentifiers — `for (let i = EXPR; ...)`'s own EXPR was never
        // walked here either, so a reference to a promoted name inside it
        // (e.g. `song` in `for (let ti = song.tracks.length - 1; ...)`)
        // was silently left un-renamed, a real ReferenceError at runtime
        // once `song` stopped being a top-level binding. The initializer
        // runs in the OUTER scope, same as the VariableDeclarator case above.
        if (n.init?.type === "VariableDeclaration") n.init.declarations.forEach(d => {
          patternNames(d.id).forEach(nm => inner.add(nm));
          if (d.init) walk(d.init, bound);
        });
        else if (n.init) walk(n.init, bound);
        if (n.test) walk(n.test, inner);
        if (n.update) walk(n.update, inner);
        walk(n.body, inner);
        return;
      }
      case "ForInStatement":
      case "ForOfStatement": {
        const inner = new Set(bound);
        if (n.left.type === "VariableDeclaration") n.left.declarations.forEach(d => patternNames(d.id).forEach(nm => inner.add(nm)));
        else walk(n.left, bound);
        walk(n.right, inner);
        walk(n.body, inner);
        return;
      }
      default:
        break;
    }
    for (const key of Object.keys(n)) {
      if (key === "type" || key === "loc" || key === "start" || key === "end" || key === "range") continue;
      const v = n[key];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c, bound));
      else if (v && typeof v.type === "string") walk(v, bound);
    }
  }
  // No Program-level pre-seeding: every top-level reference to a target name
  // is therefore "free" (collected), while a nested scope that shadows the
  // same name (a param, a local, a catch binding, …) adds it back to `bound`
  // as `walk` descends, so that scope's own uses are correctly left alone.
  walk(ast, new Set());
  return edits;
}

function applyRenames(source, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = "", cursor = 0;
  for (const e of sorted) {
    out += source.slice(cursor, e.start) + (e.shorthand ? `${e.name}: S.${e.name}` : `S.${e.name}`);
    cursor = e.end;
  }
  return out + source.slice(cursor);
}

// ---- pass 2: lift the (now renamed-inside) declarations ------------------

function cutRange(parsed, node) {
  const { start } = leadingComments(parsed, node);
  let end = node.end;
  if (parsed.source[end] === "\r") end++;
  if (parsed.source[end] === "\n") end++;
  return { start, end };
}

function isSafeInit(initNode, offLimitsNames) {
  if (!initNode) return true; // `let x;` -> undefined
  for (const name of freeIdentifiers(initNode)) if (offLimitsNames.has(name)) return false;
  return true;
}

function importInsertPoint(ast, source) {
  let last = null;
  for (const node of ast.body) { if (node.type === "ImportDeclaration") last = node; else break; }
  if (!last) return 0;
  let end = last.end;
  if (source[end] === "\n") end++;
  return end;
}

function relSpecifier(fromDir, targetPath) {
  let rel = path.posix.relative(fromDir, targetPath);
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

function addStateProperties(stateSource, entries) {
  const lines = entries.map(e => `  ${e.name}: ${e.initText},`).join("\n");
  if (!stateSource) {
    return `// src/state.js — every piece of mutable app state (docs/split-plan.md §2.1).\n// No imports: this file evaluates first, so every S field exists before any\n// app code runs (removes the boot-path TDZ class of bug for state).\nexport const S = {\n${lines}\n};\n`;
  }
  const parsed = parseModule(stateSource, "state.js");
  let objNode = null;
  for (const node of parsed.ast.body) {
    const decl = node.type === "ExportNamedDeclaration" ? node.declaration : node;
    if (decl?.type !== "VariableDeclaration") continue;
    for (const d of decl.declarations) if (d.id.type === "Identifier" && d.id.name === "S" && d.init?.type === "ObjectExpression") objNode = d.init;
  }
  if (!objNode) throw new Error("state.js has no `export const S = {...}` object to extend");
  const insertAt = objNode.end - 1; // right before the closing "}"
  const sep = objNode.properties.length ? "\n" : "\n";
  return stateSource.slice(0, insertAt) + sep + lines + "\n" + stateSource.slice(insertAt);
}

// ---- the plan (pure: strings in, strings out) -----------------------------

export function promoteState({ filePath, fileSource, statePath, stateSource = "", names, all = false }) {
  const firstPass = parseModule(fileSource, filePath);
  const mutableDecls = [];
  for (const node of firstPass.ast.body) {
    if (node.type === "VariableDeclaration" && node.kind !== "const")
      for (const d of node.declarations) {
        if (d.id.type !== "Identifier") throw new Error(`destructured top-level ${node.kind} in ${filePath} — not supported by promote-state.mjs; rewrite it to simple bindings first`);
        mutableDecls.push({ declNode: node, declarator: d, name: d.id.name });
      }
  }
  const allNames = mutableDecls.map(d => d.name);
  const targetNames = new Set(all ? allNames : names);
  for (const n of targetNames) if (!allNames.includes(n)) throw new Error(`"${n}" is not a top-level let/var in ${filePath}`);
  if (!targetNames.size) throw new Error("nothing to promote: pass --names or --all");

  // pass 1: rename every free reference (including inside the declarations
  // about to move, so a kept initializer's own text already reads S.foo)
  const renameEdits = collectUses(firstPass.ast, targetNames);
  const renamedSource = applyRenames(fileSource, renameEdits);

  // pass 2: re-parse the renamed text and lift the declarations
  const parsed = parseModule(renamedSource, filePath);
  const otherTopLevel = new Set(parsed.ast.body.flatMap(declaredNames).filter(n => !targetNames.has(n)));
  const importedNames = new Set(topLevelImports(parsed.ast).keys());
  const offLimits = new Set([...otherTopLevel, ...importedNames]);

  const targetDeclNodes = parsed.ast.body.filter(node =>
    node.type === "VariableDeclaration" && node.kind !== "const" &&
    node.declarations.some(d => targetNames.has(d.id.name)));

  const entries = [];
  const edits = [];
  for (const declNode of targetDeclNodes) {
    const allTargeted = declNode.declarations.every(d => targetNames.has(d.id.name));
    const unsafeStmts = [];
    for (const d of declNode.declarations) {
      if (!targetNames.has(d.id.name)) continue;
      const safe = isSafeInit(d.init, offLimits);
      if (safe) {
        entries.push({ name: d.id.name, initText: d.init ? renamedSource.slice(d.init.start, d.init.end) : "undefined" });
      } else {
        entries.push({ name: d.id.name, initText: "null" });
        unsafeStmts.push(`S.${d.id.name} = ${renamedSource.slice(d.init.start, d.init.end)};`);
      }
    }
    const { start, end } = cutRange(parsed, declNode);
    if (allTargeted) {
      edits.push({ start, end, replacement: unsafeStmts.length ? unsafeStmts.join("\n") + "\n" : "" });
    } else {
      const kept = declNode.declarations.filter(d => !targetNames.has(d.id.name)).map(d => renamedSource.slice(d.start, d.end)).join(", ");
      edits.push({ start, end, replacement: `${declNode.kind} ${kept};\n` + (unsafeStmts.length ? unsafeStmts.join("\n") + "\n" : "") });
    }
  }

  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let finalSource = "", cursor = 0;
  for (const e of sorted) { finalSource += renamedSource.slice(cursor, e.start) + e.replacement; cursor = e.end; }
  finalSource += renamedSource.slice(cursor);

  // add `import { S } from "state.js"` if this file doesn't already have it
  if (entries.length && !importedNames.has("S")) {
    const insertAt = importInsertPoint(parsed.ast, renamedSource);
    const spec = relSpecifier(path.posix.dirname(filePath), statePath);
    finalSource = finalSource.slice(0, insertAt) + `import { S } from "${spec}";\n` + finalSource.slice(insertAt);
  }

  return {
    fileSource: finalSource,
    stateSource: addStateProperties(stateSource, entries),
    promoted: entries.map(e => e.name),
  };
}

// ---- CLI -------------------------------------------------------------------

function parseArgv(argv) {
  const opts = { names: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") opts.file = argv[++i];
    else if (a === "--state") opts.state = argv[++i];
    else if (a === "--names") opts.names = argv[++i].split(",").map(s => s.trim()).filter(Boolean);
    else if (a === "--all") opts.all = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else throw new Error("unknown arg " + a);
  }
  if (!opts.file || !opts.state) throw new Error("usage: promote-state.mjs --file <module> --state <state.js> (--names a,b | --all) [--dry-run]");
  return opts;
}

function isMain() {
  try { return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]); }
  catch { return false; }
}

if (isMain()) {
  const opts = parseArgv(process.argv.slice(2));
  const fileAbs = path.resolve(opts.file), stateAbs = path.resolve(opts.state);
  const fileSource = readFileSync(fileAbs, "utf8");
  const stateSource = existsSync(stateAbs) ? readFileSync(stateAbs, "utf8") : "";
  const filePath = path.relative(REPO_ROOT, fileAbs).split(path.sep).join("/");
  const statePath = path.relative(REPO_ROOT, stateAbs).split(path.sep).join("/");
  const result = promoteState({ filePath, fileSource, statePath, stateSource, names: opts.names, all: opts.all });
  console.log(`promoted ${result.promoted.length}: ${result.promoted.join(", ")}`);
  if (opts.dryRun) {
    console.log("--- " + filePath + " ---\n" + result.fileSource);
    console.log("--- " + statePath + " ---\n" + result.stateSource);
  } else {
    writeFileSync(fileAbs, result.fileSource);
    writeFileSync(stateAbs, result.stateSource);
  }
}
