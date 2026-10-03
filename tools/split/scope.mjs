// Scope analysis over a src/ module's top level, shared by move.mjs,
// check.mjs and promote-state.mjs (docs/split-plan.md §0a). Built on the
// vendored acorn (tools/vendor/acorn.mjs) — node-only, never shipped.
import * as acorn from "../vendor/acorn.mjs";

const ECMA = 2023;

/** Parse a module's source text. Throws with a filename-prefixed message on
 *  a syntax error (every src/ file must parse as a strict-mode ES module). */
export function parseModule(source, filename = "<module>") {
  const comments = [];
  let ast;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: ECMA, sourceType: "module", locations: true, ranges: true,
      onComment: comments,
    });
  } catch (e) {
    throw new Error(`${filename}: parse error: ${e.message}`);
  }
  return { ast, comments, source, filename };
}

/** The contiguous leading comment block directly above `node` — a banner or
 *  doc-comment, with nothing but whitespace between it and the node (or
 *  between consecutive comments in the block). Returns {start, comments};
 *  `start` is node.start when there is no leading block. */
export function leadingComments(parsed, node) {
  const { comments, source } = parsed;
  let cut = node.start;
  const block = [];
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.end > cut) continue;
    if (!/^[ \t]*\r?\n?[ \t]*$/.test(source.slice(c.end, cut)) &&
        !/^\s*$/.test(source.slice(c.end, cut))) break;
    block.unshift(c);
    cut = c.start;
  }
  return { start: block.length ? block[0].start : node.start, comments: block };
}

/** True when `comment` reads as one of this repo's section banners
 *  (`// ---- text ----` or `// ==== text ====`, per docs/split-plan.md's
 *  "find a section by its `// ----` banner text" convention). */
export function isBanner(comment) {
  const text = comment.value; // acorn's onComment-array shape: {type, value, start, end}, NOT .text
  return /^[ \t]*(-{2,}|={2,})/.test(text) || /(-{2,}|={2,})[ \t]*$/.test(text.trim());
}

function patternNames(pat) {
  if (!pat) return [];
  switch (pat.type) {
    case "Identifier": return [pat.name];
    case "ArrayPattern": return pat.elements.flatMap(e => e ? patternNames(e.type === "RestElement" ? e.argument : e) : []);
    case "ObjectPattern": return pat.properties.flatMap(p => p.type === "RestElement" ? patternNames(p.argument) : patternNames(p.value));
    case "AssignmentPattern": return patternNames(pat.left);
    case "RestElement": return patternNames(pat.argument);
    default: return [];
  }
}
export { patternNames };

/** Names a single top-level node declares at module scope (empty for a
 *  non-declaration statement). Unwraps `export`/`export default`. */
export function declaredNames(node) {
  switch (node.type) {
    case "FunctionDeclaration":
    case "ClassDeclaration":
      return node.id ? [node.id.name] : [];
    case "VariableDeclaration":
      return node.declarations.flatMap(d => patternNames(d.id));
    case "ExportNamedDeclaration":
      return node.declaration ? declaredNames(node.declaration)
        : node.specifiers.map(s => s.local.name); // export { x } with no `from`
    case "ExportDefaultDeclaration":
      return node.declaration?.id ? [node.declaration.id.name] : [];
    default:
      return [];
  }
}

export function isDeclaration(node) {
  return node.type === "FunctionDeclaration" || node.type === "ClassDeclaration"
    || node.type === "VariableDeclaration" || node.type === "ExportNamedDeclaration"
    || node.type === "ExportDefaultDeclaration";
}

/** local name -> {specifier, imported} for every top-level import. */
export function topLevelImports(ast) {
  const map = new Map();
  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration") continue;
    for (const s of node.specifiers) {
      map.set(s.local.name, {
        specifier: node.source.value,
        imported: s.type === "ImportSpecifier" ? s.imported.name
          : s.type === "ImportDefaultSpecifier" ? "default" : "*",
      });
    }
  }
  return map;
}

/** `var` (and function-declaration) names that hoist to the function whose
 *  body is `block` — recurses into nested non-function blocks (if/for/
 *  while/switch/try/labeled), since `var` hoists through all of them to the
 *  nearest function, not just the top level of the function's own body.
 *  Does NOT recurse into a nested function/arrow's own body (new scope). */
export function hoistedNames(block) {
  const names = [];
  function walk(node) {
    if (!node) return;
    switch (node.type) {
      case "VariableDeclaration":
        if (node.kind === "var") node.declarations.forEach(d => names.push(...patternNames(d.id)));
        return;
      case "FunctionDeclaration":
        if (node.id) names.push(node.id.name);
        return;
      case "BlockStatement":
        node.body.forEach(walk);
        return;
      case "IfStatement":
        walk(node.consequent);
        walk(node.alternate);
        return;
      case "ForStatement":
        walk(node.init);
        walk(node.body);
        return;
      case "ForInStatement":
      case "ForOfStatement":
        walk(node.left);
        walk(node.body);
        return;
      case "WhileStatement":
      case "DoWhileStatement":
        walk(node.body);
        return;
      case "TryStatement":
        walk(node.block);
        if (node.handler) walk(node.handler.body);
        walk(node.finalizer);
        return;
      case "SwitchStatement":
        node.cases.forEach(c => c.consequent.forEach(walk));
        return;
      case "LabeledStatement":
        walk(node.body);
        return;
      default:
        return; // expressions, return/throw, etc. — nothing to hoist
    }
  }
  (block.body || []).forEach(walk);
  return names;
}
export function blockScopedNames(block) {
  const names = [];
  for (const s of block.body || []) {
    if (s.type === "VariableDeclaration" && s.kind !== "var") s.declarations.forEach(d => names.push(...patternNames(d.id)));
    if (s.type === "ClassDeclaration" && s.id) names.push(s.id.name);
  }
  return names;
}

/** Every identifier referenced under `node` that isn't bound somewhere
 *  inside it (params, locals, destructuring, catch params, for-loop
 *  bindings, nested function/class names). A conservative whole-subtree
 *  walk, not a full scope resolver: a name shadowed anywhere in a nested
 *  function is treated as bound for that function's whole body, which only
 *  risks OMITTING an import that isn't needed there anyway (the name
 *  resolves to the local). check.mjs rule 1 is the static ground truth;
 *  this is move.mjs's heuristic for which imports to add. */
export function freeIdentifiers(node) {
  const free = new Set();

  function walk(n, bound) {
    if (!n || typeof n.type !== "string") return;
    switch (n.type) {
      case "Identifier":
        if (!bound.has(n.name)) free.add(n.name);
        return;
      case "MemberExpression":
        walk(n.object, bound);
        if (n.computed) walk(n.property, bound);
        return;
      // labels (`outer: for (...) { break outer; }`) are their own namespace,
      // never a variable reference — the generic fallback below would
      // otherwise walk into BreakStatement/ContinueStatement's `label` and
      // LabeledStatement's `label` as if they were Identifier uses.
      case "LabeledStatement":
        walk(n.body, bound);
        return;
      case "BreakStatement":
      case "ContinueStatement":
        return;
      case "Property":
      case "MethodDefinition":
        if (n.computed) walk(n.key, bound);
        if (n.value) walk(n.value, bound);
        return;
      case "ImportDeclaration":
        return; // Program handles bound names; specifiers are not uses
      case "ExportNamedDeclaration":
        if (n.declaration) walk(n.declaration, bound);
        if (!n.source) for (const s of n.specifiers) if (!bound.has(s.local.name)) free.add(s.local.name);
        return;
      case "ExportDefaultDeclaration":
        walk(n.declaration, bound);
        return;
      case "ExportSpecifier":
        return;
      case "VariableDeclarator":
        if (n.init) walk(n.init, bound); // the id is a binding, not a use
        return;
      case "FunctionDeclaration":
      case "FunctionExpression": {
        const inner = new Set(bound);
        if (n.id) inner.add(n.id.name);
        inner.add("arguments"); // every non-arrow function has its own implicit `arguments` — not free, and NOT a browser global (an arrow or module top level has none)
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
        if (n.init?.type === "VariableDeclaration") n.init.declarations.forEach(d => patternNames(d.id).forEach(nm => inner.add(nm)));
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
      case "Program": {
        const inner = new Set(bound);
        for (const s of n.body) {
          declaredNames(s).forEach(nm => inner.add(nm));
          if (s.type === "ImportDeclaration") s.specifiers.forEach(sp => inner.add(sp.local.name));
        }
        n.body.forEach(s => walk(s, inner));
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

  walk(node, new Set());
  return free;
}

/** Top-level `let`/`var` names (check.mjs rule 3; promote-state.mjs's input). */
export function topLevelMutableNames(ast) {
  const names = [];
  for (const node of ast.body) {
    if (node.type === "VariableDeclaration" && node.kind !== "const")
      node.declarations.forEach(d => names.push(...patternNames(d.id)));
  }
  return names;
}
