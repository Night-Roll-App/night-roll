// tools/split/move.mjs --from <file> --to <file> [--range "<banner text>|<a-b>"] [--names f,g] [--dry-run]
// The re-runnable mover (docs/split-plan.md §1, §4 step 0a). Cuts whole
// top-level nodes (with their leading comment) out of --from and appends
// them, exported, to --to. A non-declaration top-level statement (listener
// wiring, an IIFE, a first render) is wrapped in `export function
// init<Module><N>()` in --to, with the call `init<Module><N>();` left at the
// exact original spot in --from — order is preserved exactly (§2.2). Adds
// the import lines each side now needs for names that crossed the cut
// ("imports both ways"). Node-only tooling, never shipped.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseModule, leadingComments, isBanner, declaredNames, isDeclaration,
  freeIdentifiers, topLevelImports,
} from "./scope.mjs";
import { loadBrowserGlobals } from "./check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(path.dirname(HERE));

// ---- selecting nodes ------------------------------------------------------

function findBannerSection(parsed, bannerText) {
  const { ast, comments } = parsed;
  const bannerComment = comments.find(c => c.value.includes(bannerText));
  if (!bannerComment) throw new Error(`no comment containing "${bannerText}"`);
  const startIdx = ast.body.findIndex(n => n.start > bannerComment.start);
  if (startIdx === -1) throw new Error(`banner "${bannerText}" has no code after it`);
  let endIdx = ast.body.length;
  for (let i = startIdx + 1; i < ast.body.length; i++) {
    const lc = leadingComments(parsed, ast.body[i]);
    if (lc.comments.some(c => c.start > bannerComment.start && isBanner(c))) { endIdx = i; break; }
  }
  return ast.body.slice(startIdx, endIdx);
}

function selectNodes(parsed, range, names) {
  let selected = [];
  if (range) {
    const numeric = /^(\d+)\s*-\s*(\d+)$/.exec(range.trim());
    if (numeric) {
      const a = +numeric[1], b = +numeric[2];
      selected = parsed.ast.body.filter(n => n.loc.start.line >= a && n.loc.start.line <= b);
      if (!selected.length) throw new Error(`no top-level node starts within lines ${a}-${b}`);
    } else {
      selected = findBannerSection(parsed, range.trim());
    }
  }
  if (names?.length) {
    const nameSet = new Set(names);
    const already = new Set(selected);
    for (const node of parsed.ast.body) {
      if (already.has(node)) continue;
      if (declaredNames(node).some(n => nameSet.has(n))) { selected.push(node); already.add(node); }
    }
  }
  if (!selected.length) throw new Error("nothing selected: pass --range and/or --names");
  return [...selected].sort((a, b) => a.start - b.start);
}

// ---- text surgery ----------------------------------------------------------

function cutRange(parsed, node) {
  const { start } = leadingComments(parsed, node);
  let end = node.end;
  if (parsed.source[end] === "\r") end++;
  if (parsed.source[end] === "\n") end++;
  return { start, end };
}

function declText(parsed, node) {
  const lc = leadingComments(parsed, node);
  const commentPart = parsed.source.slice(lc.start, node.start);
  const declPart = parsed.source.slice(node.start, node.end);
  const alreadyExported = node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration";
  return commentPart + (alreadyExported ? "" : "export ") + declPart;
}

function indent(text) {
  return text.split("\n").map(l => (l ? "  " + l : l)).join("\n");
}

function initGroupText(parsed, nodes, initName) {
  const lc = leadingComments(parsed, nodes[0]);
  const leadingText = parsed.source.slice(lc.start, nodes[0].start);
  const body = nodes.map(n => parsed.source.slice(n.start, n.end)).join("\n");
  return `${leadingText}export function ${initName}() {\n${indent(body)}\n}\n`;
}

function partitionGroups(selected) {
  const groups = [];
  let pending = null;
  for (const node of selected) {
    if (isDeclaration(node)) {
      if (pending) { groups.push(pending); pending = null; }
      groups.push({ kind: "decl", node });
    } else {
      if (!pending) pending = { kind: "init", nodes: [] };
      pending.nodes.push(node);
    }
  }
  if (pending) groups.push(pending);
  return groups;
}

function moduleIdent(toPath) {
  const base = path.posix.basename(toPath).replace(/\.js$/, "");
  return base.split(/[-_]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join("");
}

function nextInitNumber(toSource, ident) {
  const re = new RegExp(`\\binit${ident}(\\d+)\\s*\\(`, "g");
  let max = 0, m;
  while ((m = re.exec(toSource))) max = Math.max(max, parseInt(m[1], 10));
  return max + 1;
}

function importLine(name, specifier, imported = name) {
  if (imported === "default") return `import ${name} from "${specifier}";`;
  if (imported === "*") return `import * as ${name} from "${specifier}";`;
  return imported === name ? `import { ${name} } from "${specifier}";` : `import { ${imported} as ${name} } from "${specifier}";`;
}

function relSpecifier(fromDir, targetPath) {
  let rel = path.posix.relative(fromDir, targetPath);
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

// a leading contiguous run of top-level ImportDeclarations — the normal ESM
// convention this app's generated files follow; new imports are inserted
// right after it (or at the very top if there are none yet).
function importInsertPoint(ast, source) {
  let last = null;
  for (const node of ast.body) { if (node.type === "ImportDeclaration") last = node; else break; }
  if (!last) return 0;
  let end = last.end;
  if (source[end] === "\n") end++;
  return end;
}

function applyFromEdits(source, edits, newImportLines, parsed) {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = "", cursor = 0;
  for (const e of sorted) { out += source.slice(cursor, e.start) + e.replacement; cursor = e.end; }
  out += source.slice(cursor);
  if (newImportLines.length) {
    const insertAt = importInsertPoint(parsed.ast, source); // positions are pre-edit; safe because edits never precede the leading import run
    out = out.slice(0, insertAt) + newImportLines.join("\n") + "\n" + out.slice(insertAt);
  }
  return out;
}

function assembleTo(toSource, newImportLines, chunks) {
  let header = "", body = toSource || "";
  if (toSource) {
    const parsedTo = parseModule(toSource, "<to>");
    const insertAt = importInsertPoint(parsedTo.ast, toSource);
    header = toSource.slice(0, insertAt);
    body = toSource.slice(insertAt);
  }
  const importBlock = newImportLines.length ? newImportLines.join("\n") + "\n" : "";
  const prefix = (header + importBlock + body).trimEnd();
  const suffix = chunks.join("\n").trimEnd();
  return (prefix ? prefix + "\n\n" : "") + suffix + "\n";
}

// ---- the plan (pure: strings in, strings out — no file I/O) --------------

export function planMove({ fromPath, fromSource, toPath, toSource = "", range, names = [] }) {
  const parsed = parseModule(fromSource, fromPath);
  const selected = selectNodes(parsed, range, names);
  const selectedSet = new Set(selected);

  const movedDeclNames = selected.flatMap(n => (isDeclaration(n) ? declaredNames(n) : []));
  const movedNameSet = new Set(movedDeclNames);
  const remainingBody = parsed.ast.body.filter(n => !selectedSet.has(n));
  const remainingDeclaredNames = new Set(remainingBody.flatMap(declaredNames));
  const fromImports = topLevelImports(parsed.ast);
  const browserGlobals = loadBrowserGlobals();

  const referenced = new Set();
  for (const node of selected) for (const name of freeIdentifiers(node)) referenced.add(name);
  for (const name of movedNameSet) referenced.delete(name);
  for (const name of browserGlobals) referenced.delete(name);

  const toDir = path.posix.dirname(toPath);
  const fromDir = path.posix.dirname(fromPath);
  const existingToImports = toSource ? topLevelImports(parseModule(toSource, toPath).ast) : new Map();
  const newToImports = [];
  const unresolved = [];
  for (const name of referenced) {
    if (existingToImports.has(name)) continue;
    if (remainingDeclaredNames.has(name)) {
      newToImports.push(importLine(name, relSpecifier(toDir, fromPath)));
    } else if (fromImports.has(name)) {
      const info = fromImports.get(name);
      const spec = info.specifier.startsWith(".")
        ? relSpecifier(toDir, path.posix.normalize(path.posix.join(fromDir, info.specifier)))
        : info.specifier;
      newToImports.push(importLine(name, spec, info.imported));
    } else {
      unresolved.push(name);
    }
  }

  const backReferenced = new Set();
  for (const node of remainingBody) for (const name of freeIdentifiers(node)) if (movedNameSet.has(name)) backReferenced.add(name);
  const newFromImports = [];
  for (const name of backReferenced) {
    if (fromImports.has(name)) continue;
    newFromImports.push(importLine(name, relSpecifier(fromDir, toPath)));
  }

  const ident = moduleIdent(toPath);
  let nextN = nextInitNumber(toSource, ident);
  const groups = partitionGroups(selected);
  const toChunks = [];
  const fromEdits = [];
  let initCount = 0;
  for (const group of groups) {
    if (group.kind === "decl") {
      toChunks.push(declText(parsed, group.node));
      fromEdits.push({ ...cutRange(parsed, group.node), replacement: "" });
    } else {
      const initName = `init${ident}${nextN++}`;
      initCount++;
      toChunks.push(initGroupText(parsed, group.nodes, initName));
      const [first, ...rest] = group.nodes;
      fromEdits.push({ ...cutRange(parsed, first), replacement: `${initName}();\n` });
      for (const n of rest) fromEdits.push({ ...cutRange(parsed, n), replacement: "" });
    }
  }

  return {
    fromSource: applyFromEdits(fromSource, fromEdits, newFromImports, parsed),
    toSource: assembleTo(toSource, newToImports, toChunks),
    movedNames: movedDeclNames,
    initCount,
    unresolved,
  };
}

// ---- CLI -------------------------------------------------------------------

function parseArgv(argv) {
  const opts = { names: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") opts.from = argv[++i];
    else if (a === "--to") opts.to = argv[++i];
    else if (a === "--range") opts.range = argv[++i];
    else if (a === "--names") opts.names = argv[++i].split(",").map(s => s.trim()).filter(Boolean);
    else if (a === "--dry-run") opts.dryRun = true;
    else throw new Error("unknown arg " + a);
  }
  if (!opts.from || !opts.to) throw new Error('usage: move.mjs --from <file> --to <file> [--range "<banner text>|<a-b>"] [--names f,g] [--dry-run]');
  return opts;
}

function isMain() {
  try { return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]); }
  catch { return false; }
}

if (isMain()) {
  const opts = parseArgv(process.argv.slice(2));
  const fromAbs = path.resolve(opts.from);
  const toAbs = path.resolve(opts.to);
  const fromSource = readFileSync(fromAbs, "utf8");
  const toSource = existsSync(toAbs) ? readFileSync(toAbs, "utf8") : "";
  const fromPath = path.relative(REPO_ROOT, fromAbs).split(path.sep).join("/");
  const toPath = path.relative(REPO_ROOT, toAbs).split(path.sep).join("/");
  const result = planMove({ fromPath, fromSource, toPath, toSource, range: opts.range, names: opts.names });
  console.log(`moved ${result.movedNames.length} declaration(s)${result.initCount ? ` + ${result.initCount} init group(s)` : ""}: ${fromPath} -> ${toPath}`);
  if (result.movedNames.length) console.log("  " + result.movedNames.join(", "));
  if (result.unresolved.length) console.warn("  unresolved free identifier(s) (left as-is; check.mjs flags if truly missing): " + result.unresolved.join(", "));
  if (opts.dryRun) {
    console.log("--- " + fromPath + " ---\n" + result.fromSource);
    console.log("--- " + toPath + " ---\n" + result.toSource);
  } else {
    mkdirSync(path.dirname(toAbs), { recursive: true });
    writeFileSync(fromAbs, result.fromSource);
    writeFileSync(toAbs, result.toSource);
  }
}
