// tools/split/check-controls.mjs — docs/split-plan.md §4 step 2's controls
// registry rule, enforced statically (node-only, never shipped, same
// vendored-acorn technique as check.mjs/check-e2e-globals.mjs): a
// registered control (a key of CONTROLS, src/ui/controls.js) may have its
// .textContent/.innerHTML/aria-label written ONLY from src/ui/controls.js
// (via setControl). Every other src/**/*.js file is scanned for:
//   - `X.innerHTML = …` / `X.textContent = …` where X is (a) a direct
//     `document.getElementById("id")` chain, or (b) a local variable whose
//     declarator's init is `document.getElementById("id")` anywhere in the
//     same file (a file-wide map, not scope-precise — a false positive here
//     just means an extra, harmless finding; the actual codebase convention
//     is one `const b = document.getElementById(id)` per function, so this
//     is accurate in practice).
//   - `X.setAttribute("aria-label", …)` the same way.
// "id" must be a registered CONTROLS key for either to count as a violation.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { full } from "../vendor/acorn-walk.mjs";
import { parseModule } from "./scope.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(path.dirname(HERE));

/** Every key of `export const CONTROLS = {...}` in controls.js's source. */
export function controlIdsFrom(controlsSource) {
  const { ast } = parseModule(controlsSource, "ui/controls.js");
  const ids = [];
  full(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier" && node.id.name === "CONTROLS" &&
        node.init?.type === "ObjectExpression") {
      for (const p of node.init.properties) {
        if (p.type !== "Property") continue;
        const key = p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : null;
        if (key) ids.push(key);
      }
    }
  });
  return ids;
}

function isGetElementByIdCall(node) {
  return node?.type === "CallExpression" && node.callee?.type === "MemberExpression" &&
    node.callee.object?.type === "Identifier" && node.callee.object.name === "document" &&
    node.callee.property?.type === "Identifier" && node.callee.property.name === "getElementById" &&
    node.arguments[0]?.type === "Literal" && typeof node.arguments[0].value === "string";
}

/** name -> control id, from every `const X = document.getElementById("id")`
 *  (or `let`/`var`) within `node`'s own subtree — scoped to one top-level
 *  statement (see checkControls: each bucket is one ast.body entry), not
 *  the whole file, so two unrelated functions naming a local `b` for two
 *  different buttons don't get conflated into one file-wide binding. */
function localIdMap(node, controlIds) {
  const map = new Map();
  const idSet = new Set(controlIds);
  full(node, (n) => {
    if (n.type !== "VariableDeclarator" || n.id?.type !== "Identifier") return;
    if (!isGetElementByIdCall(n.init)) return;
    const id = n.init.arguments[0].value;
    if (idSet.has(id)) map.set(n.id.name, id);
  });
  return map;
}

/** Resolves the control id a MemberExpression's object refers to, or null. */
function resolveControlId(objNode, idMap, controlIds) {
  if (isGetElementByIdCall(objNode)) {
    const id = objNode.arguments[0].value;
    return controlIds.includes(id) ? id : null;
  }
  if (objNode?.type === "Identifier" && idMap.has(objNode.name)) return idMap.get(objNode.name);
  return null;
}

/** Violations: [{file, line, id, kind}]. `controlIds`: CONTROLS' own keys. */
export function checkControls(srcRoot, controlIds, { exempt = ["ui/controls.js"] } = {}) {
  const violations = [];
  const files = [];
  (function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".js")) files.push(p);
    }
  })(srcRoot);

  for (const abs of files) {
    const rel = path.relative(srcRoot, abs).split(path.sep).join("/");
    if (exempt.includes(rel)) continue;
    const source = readFileSync(abs, "utf8");
    let ast;
    try { ast = parseModule(source, rel).ast; } catch { continue; } // a syntax error is check.mjs rule 0's job, not this rule's
    // Each top-level statement is its own bucket (own local-id map): the
    // codebase's actual pattern is one `const b = document.getElementById(id)`
    // per function, and top-level statements are where those functions live
    // (module scope), so this avoids the file-wide false positives a single
    // shared map would produce from two unrelated functions both naming a
    // local `b`.
    for (const top of ast.body) {
      const idMap = localIdMap(top, controlIds);
      full(top, (node) => {
        if (node.type === "AssignmentExpression" && node.left.type === "MemberExpression" &&
            (node.left.property?.name === "innerHTML" || node.left.property?.name === "textContent") && !node.left.computed) {
          const id = resolveControlId(node.left.object, idMap, controlIds);
          if (id) violations.push({ file: rel, line: node.loc.start.line, id, kind: node.left.property.name });
        }
        if (node.type === "CallExpression" && node.callee.type === "MemberExpression" &&
            node.callee.property?.name === "setAttribute" &&
            node.arguments[0]?.type === "Literal" && node.arguments[0].value === "aria-label") {
          const id = resolveControlId(node.callee.object, idMap, controlIds);
          if (id) violations.push({ file: rel, line: node.loc.start.line, id, kind: "aria-label" });
        }
      });
    }
  }
  return violations;
}

function isMain() {
  try { return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]); }
  catch { return false; }
}

if (isMain()) {
  const srcRoot = path.join(REPO_ROOT, "src");
  const controlIds = controlIdsFrom(readFileSync(path.join(srcRoot, "ui", "controls.js"), "utf8"));
  const violations = checkControls(srcRoot, controlIds);
  if (!violations.length) console.log("check-controls: ok (" + controlIds.length + " registered controls)");
  else { for (const v of violations) console.error(v.file + ":" + v.line + ": " + v.kind + " on #" + v.id + " outside ui/controls.js"); process.exitCode = 1; }
}
