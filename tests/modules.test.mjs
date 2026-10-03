// tests/modules.test.mjs — docs/split-plan.md §0a/0b: the harness's module
// mode (tested here against a small fixture app for its own mechanics — see
// tests/split-fixtures/tiny-app/ — AND, once 0b lands, against the real
// app), tools/split/{scope,check,move,promote-state}.mjs unit-tested on
// small in-memory fixtures, and (post-0b) checkSrc()/rule 8 run against the
// real src/ tree.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp, appSource } from "./harness.mjs";
import { parseModule, declaredNames, freeIdentifiers, topLevelImports, topLevelMutableNames } from "../tools/split/scope.mjs";
import {
  checkSrc, ruleFreeIdentifiers, ruleNoAssignToImport, ruleTopLevelMutable,
  ruleTopLevelInitLayerZero, ruleLayerTable, ruleUniqueNames, ruleSerializedSelfContained,
  ruleManifestsEqual, loadBrowserGlobals, layerOf, LAYERS,
} from "../tools/split/check.mjs";
import { planMove } from "../tools/split/move.mjs";
import { promoteState } from "../tools/split/promote-state.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIXTURE = path.join(ROOT, "tests/split-fixtures/tiny-app");

// ---- harness module mode ---------------------------------------------------

test("harness module mode: S state, cross-module calls, const protection, DOM fallthrough", async () => {
  const app = await createApp({ root: FIXTURE });
  assert.equal(app.run("S.count"), 1); // initMain1() ran bump() once at boot
  assert.equal(app.run("S.label"), "web"); // set from EDITION via main.js
  assert.equal(app.run("bump()"), 2);
  app.run("S.count = 50");
  assert.equal(app.run("S.count"), 50);
  assert.equal(app.run("pi()"), 3);
  assert.throws(() => app.run("PI_ISH = 5"), /is const in foo\.js/);
  assert.equal(app.run("touchDom().id"), "marker");
  assert.equal(typeof app.run("document"), "object"); // fallthrough to the real vm context global
});

test("harness module mode: opts.edition swaps src/edition.js's text", async () => {
  const app = await createApp({ root: FIXTURE, edition: "ipad" });
  assert.equal(app.run("EDITION"), "ipad");
});

test("harness: legacy mode is still reachable (the real repo hasn't cut over)", async () => {
  const app = await createApp();
  assert.equal(app.run("1+1"), 2);
});

test("appSource(): index.html alone when src/ doesn't exist; concatenated when it does", () => {
  assert.doesNotMatch(appSource(ROOT), /export function bump/); // real repo: no src/ yet
  const withSrc = appSource(FIXTURE);
  assert.match(withSrc, /<html>/);
  assert.match(withSrc, /export function bump/);
});

// ---- scope.mjs --------------------------------------------------------------

test("scope.parseModule + declaredNames: unwraps export, covers fn/class/var kinds", () => {
  const src = `export function f(){}\nexport class C {}\nexport const a = 1, b = 2;\nlet c;\n`;
  const parsed = parseModule(src, "fixture.js");
  const names = parsed.ast.body.flatMap(declaredNames);
  assert.deepEqual(names.sort(), ["a", "b", "c", "f", "C"].sort());
});

test("scope.freeIdentifiers: locals, params, and shadowing are excluded; outer refs included", () => {
  const src = `
    function outer(x) {
      let y = x + g();
      function inner(x) { return x + z; } // x shadows the param; z is free
      return y + inner(1);
    }
  `;
  const free = freeIdentifiers(parseModule(src, "f.js").ast.body[0]);
  assert.ok(free.has("g"));
  assert.ok(free.has("z"));
  assert.ok(!free.has("x")); // shadowed everywhere it's used
  assert.ok(!free.has("y")); // local
  assert.ok(!free.has("inner")); // the function's own name, bound in its own scope
});

test("scope.freeIdentifiers: property keys aren't uses; shorthand values and computed keys are", () => {
  const src = `function f(a, obj) { return { a, [a]: 1, plain: a }; }`;
  const free = freeIdentifiers(parseModule(src, "f.js").ast.body[0]);
  assert.ok(!free.has("plain")); // non-computed key, never a reference
  assert.ok(!free.has("a")); // every use of `a` here is the param, not free
});

test("scope.topLevelMutableNames: let/var only, not const", () => {
  const src = `let a = 1; var b = 2; const c = 3;`;
  assert.deepEqual(topLevelMutableNames(parseModule(src, "f.js").ast).sort(), ["a", "b"]);
});

test("scope.topLevelImports: default, named, and namespace forms", () => {
  const src = `import d from "./d.js"; import { x, y as z } from "./xy.js"; import * as ns from "./ns.js";`;
  const imports = topLevelImports(parseModule(src, "f.js").ast);
  assert.deepEqual(imports.get("d"), { specifier: "./d.js", imported: "default" });
  assert.deepEqual(imports.get("z"), { specifier: "./xy.js", imported: "y" });
  assert.deepEqual(imports.get("ns"), { specifier: "./ns.js", imported: "*" });
});

// ---- check.mjs rules (unit, on small fixtures) ------------------------------

test("check rule 1: free identifiers not local/imported/global are flagged", () => {
  const src = `import { a } from "./a.js";\nexport function f() { return a + unknownThing + document; }\n`;
  const parsed = parseModule(src, "f.js");
  const allowed = new Set(["document"]);
  const v = ruleFreeIdentifiers(parsed, allowed);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /unknownThing/);
});

test("check rule 1: a real browser-globals.txt allows document/window/fetch/etc.", () => {
  const globals = loadBrowserGlobals();
  for (const g of ["document", "window", "fetch", "Math", "JSON", "requestAnimationFrame", "Capacitor"]) assert.ok(globals.has(g), g);
});

test("check rule 2: assignment or update to an imported binding is flagged", () => {
  const src = `import { a } from "./a.js";\nexport function f() { a = 1; a++; return a; }\n`;
  const v = ruleNoAssignToImport(parseModule(src, "f.js"));
  assert.equal(v.length, 2);
});

test("check rule 3: top-level let/var outside state.js is flagged; state.js is exempt", () => {
  const src = `let x = 1;`;
  assert.equal(ruleTopLevelMutable(parseModule(src, "app.js")).length, 1);
  assert.equal(ruleTopLevelMutable(parseModule(src, "state.js"), { isStateFile: true }).length, 0);
});

test("check rule 4: a top-level initializer may only reference layer-0 imports", () => {
  const src = `import { helper } from "../audio/engine.js";\nexport const cache = helper();\n`;
  const parsed = parseModule(src, "ui/chrome.js");
  const v = ruleTopLevelInitLayerZero(parsed, (name) => (name === "helper" ? 3 : null)); // audio = layer 3
  assert.equal(v.length, 1);
  assert.match(v[0].message, /helper/);
});

test("check rule 4: a literal/function/class initializer is never flagged, even referencing a higher layer", () => {
  const src = `import { Thing } from "../audio/engine.js";\nexport const factory = () => new Thing();\n`;
  const parsed = parseModule(src, "ui/chrome.js");
  const v = ruleTopLevelInitLayerZero(parsed, () => 3);
  assert.equal(v.length, 0); // arrow function body only runs when CALLED, not at module-eval time
});

test("layerOf + check rule 5: an importer may use its own layer or lower, never higher", () => {
  assert.equal(layerOf("state.js"), 0);
  assert.equal(layerOf("platform/base.js"), 1);
  assert.equal(layerOf("audio/engine.js"), 3);
  assert.equal(layerOf("ui/chrome.js"), 4);
  assert.equal(layerOf("nonsense/thing.js"), null);

  const okSrc = `import { x } from "../platform/base.js";\nexport const y = 1;\n`;
  assert.equal(ruleLayerTable("audio/engine.js", parseModule(okSrc, "audio/engine.js").ast).length, 0);

  const badSrc = `import { x } from "../ui/chrome.js";\nexport const y = 1;\n`;
  const v = ruleLayerTable("audio/engine.js", parseModule(badSrc, "audio/engine.js").ast);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /layer 4.*layer 3|higher layers/);
});

test("check rule 6: the same top-level name in two files is flagged", () => {
  const byFile = new Map([["a.js", ["shared", "onlyA"]], ["b.js", ["shared", "onlyB"]]]);
  const v = ruleUniqueNames(byFile);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /"shared"/);
});

test("check rule 7: a SERIALIZED function referencing another module's name is flagged; self-contained is not", () => {
  const bad = parseModule(`export function wsolaStretch(buf) { return helper(buf); }`, "audio/clips.js");
  const badFn = bad.ast.body[0].declaration;
  let v = ruleSerializedSelfContained(new Map([["wsolaStretch", badFn]]));
  assert.equal(v.length, 1);

  const good = parseModule(`export function wsolaStretch(buf) { return new Float32Array(buf.length); }`, "audio/clips.js");
  const goodFn = good.ast.body[0].declaration;
  v = ruleSerializedSelfContained(new Map([["wsolaStretch", goodFn]]));
  assert.equal(v.length, 0);
});

test("check rule 8: manifests (modulepreload / sw.js / devtools / src listing) must describe the same set", () => {
  const v = ruleManifestsEqual({
    "index.html modulepreload": ["a.js", "b.js"],
    "sw.js APP_MODULES": ["a.js", "b.js"],
    "devtools.js imports": ["a.js"],
  });
  assert.equal(v.length, 1);
  assert.match(v[0].message, /"b\.js"/);
});

test("checkSrc: the real repo, post-step-2 (ui/icons.js + ui/controls.js) — app.js (the legacy container, exempt from rules 3/5 until step 15 deletes it) is clean; the one real finding is a pre-existing app bug (oldBpb), not a checker false positive", () => {
  const result = checkSrc(path.join(ROOT, "src"));
  assert.equal(result.fileCount, 7, "app.js, edition.js, main.js, devtools.js, state.js, ui/icons.js, ui/controls.js");
  assert.deepEqual(result.violations.map(v => v.message), [
    'free identifier "oldBpb" is not a local, an import, or in browser-globals.txt',
  ], "convertAnchors() references an undeclared oldBpb (src/app.js ~line 13996) — a real latent ReferenceError bug in the app that predates the split, surfaced here for the first time by rule 1's static scan; out of scope for the cutover itself (a verbatim move), flagged in open-items.md instead of silently fixed");
});

// ---- check.mjs rule 8, wired against the real repo (docs/split-plan.md's
// 0a Deviations note: "0b should call ruleManifestsEqual() ... once it
// creates those four things, and keep it there for every later step") ------

function realModuleManifests() {
  const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const devtools = readFileSync(path.join(ROOT, "src/devtools.js"), "utf8");
  const modulepreload = [...html.matchAll(/<link rel="modulepreload" href="src\/([^"]+)">/g)].map(m => m[1]);
  const appModules = JSON.parse(sw.match(/const APP_MODULES = (\[[\s\S]*?\]);/)[1]).map(p => p.replace(/^src\//, ""));
  // devtools.js only imports the modules it actually mirrors (app.js,
  // edition.js, state.js — main.js has no exports worth mirroring, and a
  // module can't import itself), so its real import list is 2 short of the
  // full set by design. "+ itself + main.js" accounts for exactly that gap,
  // not a bug. Any import STYLE counts (`import * as X` for app.js/edition.js's
  // whole-namespace mirror, `import { S }` for state.js's two-way per-field
  // mirror, docs/split-plan.md §4 step 1) — the rule cares which modules are
  // pulled in, not how.
  const devtoolsImports = [...devtools.matchAll(/^import .* from "\.\/([^"]+)";/gm)].map(m => m[1]).concat(["devtools.js", "main.js"]);
  // Recursive (docs/split-plan.md §4 step 2: src/ui/ is the first
  // subdirectory) — a plain readdirSync would silently stop seeing every
  // module under it, the same gap check.mjs's own listJsFiles() and
  // package.mjs's srcModules() already walk around.
  const srcListing = [];
  (function walk(dir, prefix) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) walk(path.join(dir, ent.name), prefix + ent.name + "/");
      else if (ent.name.endsWith(".js")) srcListing.push(prefix + ent.name);
    }
  })(path.join(ROOT, "src"), "");
  return { "index.html modulepreload": modulepreload, "sw.js APP_MODULES": appModules, "devtools.js imports (+ itself, main.js)": devtoolsImports, "src/ listing": srcListing };
}

test("check rule 8: the real repo's four module manifests (modulepreload, sw.js precache, devtools mirror, src/ listing) describe the same set", () => {
  const v = ruleManifestsEqual(realModuleManifests());
  assert.deepEqual(v, []);
});

// ---- e2e devtools mirror, proven without a browser (docs/split-plan.md §3.4,
// §4 step 0b deviation: app.js exports nothing on its own — none of its
// top-level bindings survive the classic-script-to-module cutover as a
// window property — so without the generated __nr$ accessor footer AND
// tests/e2e/helpers.mjs setting window.__NR_EXPOSE, every bare-name
// page.evaluate() in tests/e2e/*.mjs would throw ReferenceError only once a
// real headless browser ran it. This statically proves the mirror covers
// every real spec's references instead, via tools/split/check-e2e-globals.mjs
// (reused here, same pattern as check.mjs's rule 8 above). ----------------

test("check-e2e-globals: every bare identifier referenced inside tests/e2e/*.mjs page.evaluate()/evaluateHandle()/waitForFunction() callbacks resolves via src/devtools.js's window mirror (app.js's generated __nrExpose$ footer + other src/ exports) or tools/split/browser-globals.txt", async () => {
  const { checkE2eGlobals } = await import("../tools/split/check-e2e-globals.mjs");
  const result = checkE2eGlobals();
  assert.deepEqual(result.violations, []);
  assert.ok(result.checkedNames > 50, "sanity: this should be checking dozens of real bare app names, not an empty/broken scan");
});

test("checkSrc: catches a real violation across two fixture files on disk", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const os = await import("node:os");
  const dir = mkdtempSync(path.join(os.tmpdir(), "nr-check-"));
  writeFileSync(path.join(dir, "a.js"), `let leaked = 1;\nexport function f() { return leaked + notReal; }\n`);
  const result = checkSrc(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.fileCount, 1);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.rule === 3)); // top-level let outside state.js
  assert.ok(result.violations.some(v => v.rule === 1 && v.message.includes("notReal")));
});

// ---- move.mjs ---------------------------------------------------------------

test("move.mjs: --range by banner text moves a function, exports it, and imports it back where still used", () => {
  const fromSource = `// ---- section A ----\nexport function keep() { return helper() + 1; }\n\n// ---- section B ----\nfunction helper() { return 41; }\n`;
  const result = planMove({ fromPath: "app.js", fromSource, toPath: "util/helper.js", range: "section B" });
  assert.equal(result.movedNames.join(), "helper");
  assert.doesNotMatch(result.fromSource, /function helper/);
  assert.match(result.fromSource, /import \{ helper \} from ".\/util\/helper\.js";/);
  assert.match(result.toSource, /export function helper/);
  // both halves still parse as valid modules
  parseModule(result.fromSource, "app.js");
  parseModule(result.toSource, "util/helper.js");
});

test("move.mjs: --names pulls a specific declaration out of band from the range", () => {
  const fromSource = `// ---- keep this ----\nexport function a() { return 1; }\nexport function scheduleNote() { return 2; }\nexport function z() { return 3; }\n`;
  const result = planMove({ fromPath: "app.js", fromSource, toPath: "audio/voices.js", names: ["scheduleNote"] });
  assert.deepEqual(result.movedNames, ["scheduleNote"]);
  assert.match(result.fromSource, /function a/);
  assert.match(result.fromSource, /function z/);
  assert.doesNotMatch(result.fromSource, /function scheduleNote/);
});

test("move.mjs: a non-declaration top-level statement is wrapped in init<Module><N>() at its original spot", () => {
  const fromSource = `// ---- wiring ----\nconsole.log("boot");\nel.addEventListener("click", onClick);\n\n// ---- next ----\nfunction onClick() {}\n`;
  const result = planMove({ fromPath: "app.js", fromSource, toPath: "ui/chrome.js", range: "wiring" });
  assert.match(result.fromSource, /^initChrome1\(\);\s*$/m);
  assert.match(result.toSource, /export function initChrome1\(\) \{/);
  assert.match(result.toSource, /console\.log\("boot"\)/);
  parseModule(result.fromSource, "app.js");
  parseModule(result.toSource, "ui/chrome.js");
});

test("move.mjs: re-running against an existing --to file continues the init numbering and doesn't collide", () => {
  const fromSource1 = `// ---- one ----\nfoo();\nfunction foo() {}\n`;
  const r1 = planMove({ fromPath: "app.js", fromSource: fromSource1, toPath: "ui/chrome.js", range: "one" });
  assert.match(r1.toSource, /initChrome1/);
  const fromSource2 = `// ---- two ----\nbar();\nfunction bar() {}\n`;
  const r2 = planMove({ fromPath: "app.js", fromSource: fromSource2, toPath: "ui/chrome.js", toSource: r1.toSource, range: "two" });
  assert.match(r2.toSource, /initChrome2/);
  assert.doesNotMatch(r2.toSource, /initChrome1\(\) \{[\s\S]*initChrome1\(\) \{/); // not duplicated
});

test("move.mjs: numeric --range selects by current line numbers", () => {
  const fromSource = `const a = 1;\nconst b = 2;\nconst c = 3;\n`;
  const result = planMove({ fromPath: "app.js", fromSource, toPath: "other.js", range: "2-2" });
  assert.deepEqual(result.movedNames, ["b"]);
});

// ---- promote-state.mjs -------------------------------------------------------

test("promote-state.mjs: a literal-init let becomes an S field; references become S.name, shadows don't", () => {
  const fileSource = `let count = 0;\nexport function bump() { count++; return count; }\nexport function withShadow() { let count = 99; return count; }\n`;
  const result = promoteState({ filePath: "app.js", fileSource, statePath: "state.js", names: ["count"] });
  assert.deepEqual(result.promoted, ["count"]);
  assert.match(result.stateSource, /count: 0,/);
  assert.match(result.fileSource, /import \{ S \} from "\.\/state\.js";/);
  assert.match(result.fileSource, /S\.count\+\+/);
  assert.match(result.fileSource, /let count = 99; return count;/); // shadowed local untouched
  parseModule(result.fileSource, "app.js");
  parseModule(result.stateSource, "state.js");
});

test("promote-state.mjs: an initializer that calls app code becomes null in state.js + S.name = <init> at the spot", () => {
  const fileSource = `function wmLoad() { return {}; }\nlet wm = wmLoad();\nexport function useWm() { return wm; }\n`;
  const result = promoteState({ filePath: "app.js", fileSource, statePath: "state.js", names: ["wm"] });
  assert.match(result.stateSource, /wm: null,/);
  assert.match(result.fileSource, /S\.wm = wmLoad\(\);/);
  assert.match(result.fileSource, /return S\.wm;/);
  parseModule(result.fileSource, "app.js");
});

test("promote-state.mjs: a mixed declarator list keeps the non-targeted binding as a plain let", () => {
  const fileSource = `let a = 1, b = 2;\nexport function f() { return a + b; }\n`;
  const result = promoteState({ filePath: "app.js", fileSource, statePath: "state.js", names: ["a"] });
  assert.match(result.fileSource, /let b = 2;/);
  assert.match(result.fileSource, /return S\.a \+ b;/);
  parseModule(result.fileSource, "app.js");
});

test("promote-state.mjs: shorthand object property use is rewritten to key: S.value", () => {
  const fileSource = `let tally = 0;\nexport function snapshot() { return { tally }; }\n`;
  const result = promoteState({ filePath: "app.js", fileSource, statePath: "state.js", names: ["tally"] });
  assert.match(result.fileSource, /\{ tally: S\.tally \}/);
  parseModule(result.fileSource, "app.js");
});

test("promote-state.mjs: --all promotes every top-level let/var in the file", () => {
  const fileSource = `let a = 1;\nvar b = 2;\nconst c = 3;\n`;
  const result = promoteState({ filePath: "app.js", fileSource, statePath: "state.js", all: true });
  assert.deepEqual(result.promoted.sort(), ["a", "b"]);
});
