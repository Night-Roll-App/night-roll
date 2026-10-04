// tools/split/move.mjs --from <file> --to <file> [--range "<banner text>|<a-b>"] [--names f,g] [--init <InitName>] [--dry-run]
// The re-runnable mover (docs/split-plan.md §1, §4 step 0a; tooling fixes
// §4 step 0/M4). Cuts whole top-level nodes (with their leading comment,
// and a moved name's own `X = prof("X", X);` wrap statement, if any) out of
// --from and appends them, exported, to --to. A non-declaration top-level
// statement (listener wiring, an IIFE, a first render) is wrapped in
// `export function init<Module><N>()` in --to (or `export function
// <InitName>()` with --init, which requires the selection to contain
// exactly one such run), with the call `init<Module><N>();` (or
// `<InitName>();`) left at the exact original spot in --from — order is
// preserved exactly (§2.2). Adds the import lines each side now needs for
// names that crossed the cut ("imports both ways"), including the
// synthesized init call's own import, and never adds an import of a file
// into itself. Node-only tooling, never shipped.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseModule, leadingComments, trailingCommentEnd, isBanner, declaredNames,
  isDeclaration, freeIdentifiers, topLevelImports,
} from "./scope.mjs";
import { loadBrowserGlobals } from "./check.mjs";
import { FOOTER_MARKER } from "./e2e-footer.mjs";

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

// `X = prof("X", X);` (step 7's self-profiler wrap, §2.4) — a plain top-level
// assignment with no declared name, invisible to --names/--range selection
// on its own. Returns "X" when `node` is exactly this shape for SOME name,
// else null.
function profWrapName(node) {
  if (node.type !== "ExpressionStatement") return null;
  const e = node.expression;
  if (!e || e.type !== "AssignmentExpression" || e.operator !== "=") return null;
  if (e.left.type !== "Identifier") return null;
  const name = e.left.name;
  if (e.right.type !== "CallExpression") return null;
  if (e.right.callee.type !== "Identifier" || e.right.callee.name !== "prof") return null;
  const args = e.right.arguments;
  if (!args || args.length < 2) return null;
  if (args[0].type !== "Literal" || args[0].value !== name) return null;
  if (args[1].type !== "Identifier" || args[1].name !== name) return null;
  return name;
}

function cutRange(parsed, node) {
  const { start } = leadingComments(parsed, node);
  let end = trailingCommentEnd(parsed, node);
  if (parsed.source[end] === "\r") end++;
  if (parsed.source[end] === "\n") end++;
  return { start, end };
}

// Same text a plain `source.slice(node.start, node.end)` would give, but
// extended through a trailing same-line comment (step 11's "?perf=1
// attribution" comment, silently dropped by the old slice).
function nodeTextWithTrailingComment(parsed, node) {
  return parsed.source.slice(node.start, trailingCommentEnd(parsed, node));
}

function declText(parsed, node) {
  const lc = leadingComments(parsed, node);
  const commentPart = parsed.source.slice(lc.start, node.start);
  const declPart = nodeTextWithTrailingComment(parsed, node);
  const alreadyExported = node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration";
  return commentPart + (alreadyExported ? "" : "export ") + declPart;
}

// Plain (never exported) statement text, comment included both ends — used
// for a decl's own carried-along `X = prof(...)` statement (never itself a
// declaration, never itself exported).
function stmtText(parsed, node) {
  const lc = leadingComments(parsed, node);
  const commentPart = parsed.source.slice(lc.start, node.start);
  return commentPart + nodeTextWithTrailingComment(parsed, node);
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

// `profNodesByName`: Map<name, node> — the `X = prof("X", X);` statement for
// each name in THIS selection that has one (built by the caller, only for
// names actually being moved — "and only then", docs/split-plan.md §4 step
// 0's M4(b)). Such a node is never its own group: it attaches to the decl
// group for its own name, wherever that group already landed, so it's
// emitted right after the declaration in --to and cut (separately, own
// line) from --from — never swept into a neighboring init() wrapper.
function partitionGroups(selected, profNodesByName = new Map()) {
  const nameOfProfNode = new Map();
  for (const [name, node] of profNodesByName) nameOfProfNode.set(node, name);
  const groups = [];
  let pending = null;
  for (const node of selected) {
    const profFor = nameOfProfNode.get(node);
    if (profFor !== undefined) {
      const g = groups.find(gr => gr.kind === "decl" && declaredNames(gr.node).includes(profFor));
      if (g) { g.profNode = node; continue; }
      // no matching decl group found (shouldn't happen: profNodesByName is only
      // ever built from names with a decl in this same selection) — fall
      // through rather than silently drop it.
    }
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
  // app.js's own body ends with a GENERATED e2e accessor footer
  // (tools/split/e2e-footer.mjs) — appending new content after it, as a
  // plain append always did, put a reverse move's (`--to src/app.js`)
  // content physically past the footer marker; the next
  // regen-e2e-footer.mjs run then deleted it along with the stale footer it
  // was regenerating (docs/split-plan.md's Deviations (14), the step's own
  // "silent, total data loss" finding). Split the footer off first and
  // always reattach it at the true end, never in the middle and never
  // before new content.
  const footerIdx = body.indexOf(FOOTER_MARKER);
  let bodyMain = body, footerText = "";
  if (footerIdx !== -1) { bodyMain = body.slice(0, footerIdx); footerText = body.slice(footerIdx); }
  const prefix = (header + importBlock + bodyMain).trimEnd();
  const suffix = chunks.join("\n").trimEnd();
  const assembled = (prefix ? prefix + "\n\n" : "") + suffix + "\n";
  return footerText ? assembled.trimEnd() + footerText : assembled;
}

// ---- the plan (pure: strings in, strings out — no file I/O) --------------

export function planMove({ fromPath, fromSource, toPath, toSource = "", range, names = [], initName }) {
  const parsed = parseModule(fromSource, fromPath);
  let selected = selectNodes(parsed, range, names);
  const selectedSet = new Set(selected);

  // Carry a profiled name's `X = prof("X", X);` statement along with X's OWN
  // declaration, and only then (docs/split-plan.md §4 step 0's M4(b)): the
  // statement has no declared name, so --names/--range never selects it on
  // its own — left behind, it silently drops (or gets misattributed as a
  // trailing comment onto) the next kept statement (Deviations 9/10/11).
  const movedDeclNamesForProf = new Set(selected.flatMap(n => (isDeclaration(n) ? declaredNames(n) : [])));
  const profNodesByName = new Map();
  for (const node of parsed.ast.body) {
    if (selectedSet.has(node)) continue;
    const name = profWrapName(node);
    if (name && movedDeclNamesForProf.has(name)) { profNodesByName.set(name, node); selectedSet.add(node); selected.push(node); }
  }
  if (profNodesByName.size) selected = [...selected].sort((a, b) => a.start - b.start);

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
  // Names ALREADY declared in --to (e.g. a prior step moved MODE_OFFSET into
  // theory/key.js; this move now carries a function into key.js that itself
  // references MODE_OFFSET) must never be imported — not from --from, and
  // especially not from --to itself. Checking this BEFORE falling through to
  // `fromImports` is the actual fix for the self-import bug (a): the old code
  // resolved such a name via --from's own (possibly stale, possibly
  // --to-pointing) import instead of noticing it's already local to --to.
  const toDeclaredNames = toSource ? new Set(parseModule(toSource, toPath).ast.body.flatMap(declaredNames)) : new Set();
  const existingToImports = toSource ? topLevelImports(parseModule(toSource, toPath).ast) : new Map();
  const newToImports = [];
  const unresolved = [];
  for (const name of referenced) {
    if (existingToImports.has(name)) continue;
    if (toDeclaredNames.has(name)) continue; // already local to --to
    if (remainingDeclaredNames.has(name)) {
      newToImports.push(importLine(name, relSpecifier(toDir, fromPath)));
    } else if (fromImports.has(name)) {
      const info = fromImports.get(name);
      const resolvedAbs = info.specifier.startsWith(".") ? path.posix.normalize(path.posix.join(fromDir, info.specifier)) : null;
      // (a) never emit an import of a file into itself: if --from's own
      // import of `name` already points at --to, importing it INTO --to
      // would self-reference — drop it (the name is necessarily already
      // declared there, caught by toDeclaredNames above in the normal case;
      // this is the defensive backstop for any order check.mjs's rule 1 would
      // otherwise have to catch as a parse error).
      if (resolvedAbs === toPath) continue;
      const spec = resolvedAbs ? relSpecifier(toDir, resolvedAbs) : info.specifier;
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
    if (fromPath === toPath) continue; // never emit an import of a file into itself
    newFromImports.push(importLine(name, relSpecifier(fromDir, toPath)));
  }

  const ident = moduleIdent(toPath);
  let nextN = nextInitNumber(toSource, ident);
  const groups = partitionGroups(selected, profNodesByName);
  const toChunks = [];
  const fromEdits = [];
  let initCount = 0;
  for (const group of groups) {
    if (group.kind === "decl") {
      let text = declText(parsed, group.node);
      fromEdits.push({ ...cutRange(parsed, group.node), replacement: "" });
      if (group.profNode) {
        text += "\n" + stmtText(parsed, group.profNode);
        fromEdits.push({ ...cutRange(parsed, group.profNode), replacement: "" });
      }
      toChunks.push(text);
    } else {
      // (e) --init <InitName>: an explicit name for a single synthesized
      // init() wrapper (docs/split-plan.md §4 step 0's M4(e)) instead of the
      // auto-numbered init<Module><N>. --init requires exactly one
      // non-declaration group in this invocation — ambiguous otherwise.
      if (initName && initCount > 0) throw new Error(`--init ${initName}: more than one non-declaration group was selected; narrow --range to a single contiguous run of statements`);
      const thisInitName = initName || `init${ident}${nextN++}`;
      initCount++;
      toChunks.push(initGroupText(parsed, group.nodes, thisInitName));
      const [first, ...rest] = group.nodes;
      fromEdits.push({ ...cutRange(parsed, first), replacement: `${thisInitName}();\n` });
      for (const n of rest) fromEdits.push({ ...cutRange(parsed, n), replacement: "" });
      // (e) the gap step 12 hit: the call stub left in --from references
      // `thisInitName`, a name that now lives ONLY in --to — without this,
      // the stub is a ReferenceError. The stub text is pure string surgery,
      // invisible to the AST-based backReferenced scan above, so it needs
      // its own import unconditionally, not by that scan finding it.
      if (fromPath !== toPath) newFromImports.push(importLine(thisInitName, relSpecifier(fromDir, toPath)));
    }
  }
  if (initName && initCount === 0) throw new Error(`--init ${initName}: nothing non-declaration was selected to wrap`);

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
    else if (a === "--init") opts.initName = argv[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else throw new Error("unknown arg " + a);
  }
  if (!opts.from || !opts.to) throw new Error('usage: move.mjs --from <file> --to <file> [--range "<banner text>|<a-b>"] [--names f,g] [--init <InitName>] [--dry-run]');
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
  const result = planMove({ fromPath, fromSource, toPath, toSource, range: opts.range, names: opts.names, initName: opts.initName });
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
