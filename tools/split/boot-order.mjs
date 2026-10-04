#!/usr/bin/env node
// tools/split/boot-order.mjs [--write]
// docs/split-phase2-plan.md §3's L-commit check: "a boot-order test
// recording the init order before/after". The app's boot order IS the
// sequence of top-level statements main.js runs — before phase 2 step 12
// they sit in src/app.js (reached through main.js's bare `import "./app.js"`),
// during it each run becomes an `init<Module><N>()` (or `boot()`) stub at
// the same spot, after step 13 main.js is the stub list itself. This walks
// main.js in order, expands every bare side-effect import of a src/ file
// and every `initX();`/`boot();` stub into the statements it stands for,
// and prints one normalized first line per statement. The snapshot in
// tests/split-fixtures/boot-order.txt was captured with --write BEFORE the
// first init move; tests/boot-order.test.mjs fails the moment any later
// commit reorders, drops or duplicates a statement. Node-only, never
// shipped.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseModule, isDeclaration, topLevelImports } from "./scope.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(path.dirname(HERE));
export const SNAPSHOT = path.join(REPO_ROOT, "tests/split-fixtures/boot-order.txt");

const STUB = /^(init[A-Z][\w$]*|boot)$/;

/** A statement's first source line, trimmed, trailing `// …` dropped —
 *  what survives a move.mjs re-indent and the odd lost trailing comment. */
function firstLine(source, node) {
  return source.slice(node.start, node.end).split("\n")[0].trim().replace(/\s+\/\/\s.*$/, "");
}

function stubName(node) {
  if (node.type !== "ExpressionStatement") return null;
  const e = node.expression;
  if (e.type !== "CallExpression" || e.callee.type !== "Identifier" || e.arguments.length) return null;
  return STUB.test(e.callee.name) ? e.callee.name : null;
}

export function bootOrder(srcDir = path.join(REPO_ROOT, "src"), entry = "main.js") {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(srcDir, rel);
    const source = readFileSync(abs, "utf8");
    const parsed = parseModule(source, rel);
    const imports = topLevelImports(parsed.ast);
    for (const node of parsed.ast.body) {
      if (node.type === "ImportDeclaration") {
        // a bare side-effect import of a src/ file (main.js's `import "./app.js"`): its statements run here, in order
        if (!node.specifiers.length && node.source.value.startsWith(".")) walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), node.source.value)));
        continue;
      }
      if (isDeclaration(node)) continue;
      const stub = stubName(node);
      const info = stub && imports.get(stub);
      if (stub && info && info.specifier.startsWith(".")) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), info.specifier));
        const tSource = readFileSync(path.join(srcDir, target), "utf8");
        const tParsed = parseModule(tSource, target);
        const fn = tParsed.ast.body.map(n => (n.type === "ExportNamedDeclaration" ? n.declaration : n)).find(n => n && n.type === "FunctionDeclaration" && n.id && n.id.name === stub);
        if (!fn) throw new Error(`${rel}: stub ${stub}() has no function declaration in ${target}`);
        for (const s of fn.body.body) out.push(firstLine(tSource, s));
        continue;
      }
      out.push(firstLine(source, node));
    }
  };
  walk(entry);
  return out;
}

function isMain() {
  try { return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]); }
  catch { return false; }
}

if (isMain()) {
  const lines = bootOrder();
  if (process.argv.includes("--write")) { writeFileSync(SNAPSHOT, lines.join("\n") + "\n"); console.log(`wrote ${lines.length} statements to ${path.relative(REPO_ROOT, SNAPSHOT)}`); }
  else for (const l of lines) console.log(l);
}
