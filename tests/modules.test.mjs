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
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { createApp, appSource } from "./harness.mjs";
import {
  parseModule, declaredNames, exportedNames, freeIdentifiers, topLevelImports,
  topLevelMutableNames, leadingComments,
} from "../tools/split/scope.mjs";
import {
  checkSrc, ruleFreeIdentifiers, ruleNoAssignToImport, ruleTopLevelMutable,
  ruleTopLevelInitLayerZero, ruleLayerTable, ruleUniqueNames, ruleSerializedSelfContained,
  ruleManifestsEqual, ruleImportsResolve, ruleHooksShape, ruleHooksPorts,
  ruleNoTopLevelPortCalls, forwarderPortName, loadBrowserGlobals, layerOf, LAYERS,
} from "../tools/split/check.mjs";
import { planMove } from "../tools/split/move.mjs";
import { promoteState } from "../tools/split/promote-state.mjs";
import { classifyDiff, findSelfImports } from "../tools/split/verbatim.mjs";
import { computeBlockers } from "../tools/split/blockers.mjs";

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

test("scope.leadingComments: a trailing same-line comment belongs to the PRECEDING statement, never to the node that follows it", () => {
  // docs/split-phase2-plan.md §1 M4(d)/M1's move.mjs fix: before this, a
  // comment with only whitespace between its end and the next node's start
  // was unconditionally treated as that next node's leading comment, even
  // when the comment itself sat on the SAME line as unrelated preceding
  // code — the exact shape that silently dropped a `?perf=1` attribution
  // comment and joined two statements onto one line (Deviations 9-11).
  const src = `x = prof("x", x); // ?perf=1 attribution\nfunction next() {}\n`;
  const parsed = parseModule(src, "f.js");
  const nextNode = parsed.ast.body[1];
  const lc = leadingComments(parsed, nextNode);
  assert.deepEqual(lc.comments, []); // the comment is NOT next()'s leading comment
  assert.equal(lc.start, nextNode.start);
});

test("scope.leadingComments: a comment on its OWN line (nothing but whitespace before it) is still a real leading comment", () => {
  const src = `// a real banner\nfunction f() {}\n`;
  const parsed = parseModule(src, "f.js");
  const lc = leadingComments(parsed, parsed.ast.body[0]);
  assert.equal(lc.comments.length, 1);
});

test("scope.exportedNames: declared, renamed, re-exported, default, and star-export forms", () => {
  const src = `export function f(){}\nexport { f as g };\nexport { h } from "./h.js";\nexport default class C {}\nexport * from "./all.js";\n`;
  assert.deepEqual(exportedNames(parseModule(src, "f.js").ast).sort(), ["*", "default", "f", "g", "h"].sort());
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

test("check rule 4/10d: an object/array literal built only from pure-literalish parts is never flagged, even when a nested closure references a higher layer or a port (docs/split-phase2-plan.md step 2 — CHIPS, moving out of app.js for the first time)", () => {
  const src = `import { Thing } from "../audio/engine.js";\nexport const TABLE = {nsf: {capture: () => { if (typeof logErr === "function") logErr("x"); return new Thing(); }}, list: [1, 2, () => logErr("y")]};\n`;
  const parsed = parseModule(src, "ui/chrome.js");
  assert.equal(ruleTopLevelInitLayerZero(parsed, () => 3).length, 0); // building the table itself never calls Thing()
  assert.equal(ruleNoTopLevelPortCalls(parsed.ast, new Set(["logErr"])).length, 0); // nor logErr — both closures only run when CALLED
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

// ---- check.mjs rule 9 (every import specifier resolves to a name the
// target actually exports) and rule 10 (hooks.js's upcall ports) ------------

test("check rule 9: a stale specifier (imports a name a sibling file moved away from) is flagged; a correct one is not", () => {
  const moduleExports = new Map([
    ["a.js", new Set(["helper"])],
    ["b.js", new Set([])], // helper moved away from b.js; the importer's specifier was never updated
  ]);
  const staleSrc = `import { helper } from "./b.js";\nexport function f() { return helper(); }\n`;
  const badV = ruleImportsResolve("app.js", parseModule(staleSrc, "app.js").ast, moduleExports);
  assert.equal(badV.length, 1);
  assert.match(badV[0].message, /does not export "helper"/);

  const okSrc = `import { helper } from "./a.js";\nexport function f() { return helper(); }\n`;
  const okV = ruleImportsResolve("app.js", parseModule(okSrc, "app.js").ast, moduleExports);
  assert.deepEqual(okV, []);
});

test("check rule 9: a lost export keyword (two declarations briefly shared one physical line) is flagged", () => {
  // docs/split-plan.md's Deviations (14): rejoining two statements onto one
  // line to satisfy verbatim.mjs left only the FIRST one `export`ed.
  const moduleExports = new Map([["ui/sheets.js", new Set(["pubCheck"])]]); // pubCompareDraft lost its export
  const src = `import { pubCompareDraft } from "./ui/sheets.js";\n`;
  const v = ruleImportsResolve("app.js", parseModule(src, "app.js").ast, moduleExports);
  assert.equal(v.length, 1);
  assert.match(v[0].message, /"pubCompareDraft"/);
});

test("check rule 9: a target doing `export * from` is unverifiable and never flagged; a default import checks against \"default\"", () => {
  const moduleExports = new Map([["star.js", new Set(["*"])], ["def.js", new Set(["default"])]]);
  const starSrc = `import { anything } from "./star.js";\n`;
  assert.deepEqual(ruleImportsResolve("app.js", parseModule(starSrc, "app.js").ast, moduleExports), []);
  const okDefault = `import X from "./def.js";\n`;
  assert.deepEqual(ruleImportsResolve("app.js", parseModule(okDefault, "app.js").ast, moduleExports), []);
  const badDefault = `import X from "./star.js";\n`; // star.js's exports are unverifiable too — still not flagged
  assert.deepEqual(ruleImportsResolve("app.js", parseModule(badDefault, "app.js").ast, moduleExports), []);
});

const HOOKS_SHAPE_SRC = `import { S } from "./state.js";
const need = n => { throw new Error(\`hook \${n} not installed\`); };
export function setInfo(...a) { return (S.hooks.setInfo || need("setInfo"))(...a); }
`;

test("check rule 10a (ruleHooksShape): the exact forwarder shape is accepted; anything else in hooks.js is flagged", () => {
  const good = parseModule(HOOKS_SHAPE_SRC, "hooks.js");
  assert.deepEqual(ruleHooksShape(good.ast), []);

  const bad = parseModule(`export function setInfo(...a) { return S.hooks.setInfo(...a); }\n`, "hooks.js"); // no need() fallback — not the plan's exact shape
  assert.equal(ruleHooksShape(bad.ast).length, 1);

  const extra = parseModule(HOOKS_SHAPE_SRC + `export const EXTRA = 1;\n`, "hooks.js");
  assert.equal(ruleHooksShape(extra.ast).length, 1);
});

test("check rule 10a (forwarderPortName): recognizes the exact shape and nothing looser", () => {
  const ok = parseModule(`export function draw(...a) { return (S.hooks.draw || need("draw"))(...a); }`, "hooks.js");
  assert.equal(forwarderPortName(ok.ast.body[0]), "draw");
  const wrongLiteral = parseModule(`export function draw(...a) { return (S.hooks.draw || need("notDraw"))(...a); }`, "hooks.js");
  assert.equal(forwarderPortName(wrongLiteral.ast.body[0]), null);
});

test("check rule 10b/10c (ruleHooksPorts): exactly one XImpl, strictly above every port caller's layer", () => {
  const hooksAst = parseModule(`export function draw(...a) { return (S.hooks.draw || need("draw"))(...a); }\n`, "hooks.js").ast;

  // missing impl
  assert.match(
    ruleHooksPorts(hooksAst, new Map([["ui/chrome.js", ["somethingElse"]]]), () => ["audio/engine.js"], () => 4)[0].message,
    /no "drawImpl" declared/,
  );

  // duplicate impl
  const dup = ruleHooksPorts(hooksAst, new Map([["ui/chrome.js", ["drawImpl"]], ["render/roll.js", ["drawImpl"]]]), () => [], () => 4);
  assert.match(dup[0].message, /more than one file/);

  // impl layer not above a real caller's layer (the step-11 mistake: draw() tried to live at render's OWN layer 3)
  const declaredByFile = new Map([["render/roll.js", ["drawImpl"]]]);
  const layerOfFn = (f) => (f === "render/roll.js" ? 3 : f === "audio/engine.js" ? 3 : null);
  const tooLow = ruleHooksPorts(hooksAst, declaredByFile, () => ["audio/engine.js"], layerOfFn);
  assert.equal(tooLow.length, 1);
  assert.match(tooLow[0].message, /is not above caller/);

  // impl strictly above every caller — clean
  const okLayerOfFn = (f) => (f === "ui/chrome.js" ? 4 : f === "audio/engine.js" ? 3 : null);
  const okDeclared = new Map([["ui/chrome.js", ["drawImpl"]]]);
  assert.deepEqual(ruleHooksPorts(hooksAst, okDeclared, () => ["audio/engine.js"], okLayerOfFn), []);
});

test("check rule 10d (ruleNoTopLevelPortCalls): a top-level initializer calling a port is flagged; inside a function body is fine", () => {
  const portNames = new Set(["draw"]);
  const bad = parseModule(`import { draw } from "./hooks.js";\ndraw();\n`, "app.js");
  assert.equal(ruleNoTopLevelPortCalls(bad.ast, portNames).length, 1);

  const ok = parseModule(`import { draw } from "./hooks.js";\nexport function onClick() { draw(); }\n`, "app.js");
  assert.deepEqual(ruleNoTopLevelPortCalls(ok.ast, portNames), []);
});

test("checkSrc: rules 9/10 don't fail when hooks.js doesn't exist yet (pre-step-1 of docs/split-phase2-plan.md)", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const os = await import("node:os");
  const dir = mkdtempSync(path.join(os.tmpdir(), "nr-check-nohooks-"));
  writeFileSync(path.join(dir, "state.js"), `export function f() { return 1; }\n`); // layer 0 — a name the real LAYERS table actually places, so only rule 9/10's own absence-handling is under test here
  const result = checkSrc(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.ok, true);
});

test("checkSrc: the real repo's LAYERS table already has room for hooks.js (layer 0), wire.js (layer 5), and session (layer 4) ahead of docs/split-phase2-plan.md's own step 1/6", () => {
  assert.equal(layerOf("hooks.js"), 0);
  assert.equal(layerOf("wire.js"), 5);
  assert.equal(layerOf("session/boot.js"), 4);
});

test("checkSrc: the real repo, post-step-14 (ui/{chrome,trackbar,mixer,voice-menu,notes,note-editor,sheets,wm}.js) — app.js (the legacy container, exempt from rules 3/5 until step 15 deletes it) is clean; the one real finding is a pre-existing app bug (oldBpb), not a checker false positive", () => {
  const result = checkSrc(path.join(ROOT, "src"));
  assert.equal(result.fileCount, 64, "app.js, edition.js, main.js, devtools.js, state.js, ui/icons.js, ui/controls.js, midi/parse.js, midi/write.js, theory/chords.js, theory/key.js, model/catalog.js, model/grid.js, model/edits.js, model/rollnotes.js, platform/base.js, platform/mode.js, platform/storage.js, platform/folder.js, platform/native.js, audio/engine.js, audio/voices.js, audio/transport.js, audio/chip.js, audio/chip-stream.js, audio/clips.js, audio/metronome.js, audio/bounce.js, model/song.js, model/selection.js, model/provenance.js, model/album-order.js, model/versions.js, model/jobs.js, import/hub.js, import/capture.js, sync/publish.js, gen/drummer.js, gen/bassist.js, gen/analysis.js, render/roll.js, render/tracks.js, render/score.js, render/instrument.js, render/cof.js, render/compare.js, input/gestures.js, input/record.js, ask/backend.js, ask/tools.js, ask/context.js, ask/bridge.js, ask/shots.js, ask/sheet.js, ui/chrome.js, ui/trackbar.js, ui/mixer.js, ui/voice-menu.js, ui/notes.js, ui/note-editor.js, ui/sheets.js, ui/wm.js, hooks.js, wire.js (docs/split-phase2-plan.md step 1)");
  assert.deepEqual(result.violations.map(v => v.message), [
    'free identifier "oldBpb" is not a local, an import, or in browser-globals.txt',
  ], "convertAnchors() references an undeclared oldBpb (src/app.js ~line 13996) — a real latent ReferenceError bug in the app that predates the split, surfaced here for the first time by rule 1's static scan; out of scope for the cutover itself (a verbatim move), flagged in open-items.md instead of silently fixed");
});

// ---- docs/split-phase2-plan.md §1 M1, step 1: src/hooks.js's real ports,
// verified against the real repo (not a synthetic fixture) — §3's own
// "Each adds tests" list for an H commit.

/** Loads ONLY src/hooks.js + src/state.js into a throwaway vm context —
 *  deliberately NOT going through tests/harness.mjs's createApp() (which
 *  always runs src/wire.js's installHooks() as app.js's first statement) —
 *  so a port's `need()` fallback is reachable at all. state.js's top-level
 *  initializers touch `localStorage` (several fields) and `location`
 *  (APP_BASE, already try/caught) — a minimal stub sandbox, not the full
 *  tests/harness.mjs buildRuntime(), is enough for a two-file graph that
 *  never reads window/document. */
async function loadHooksWithoutInstall() {
  const context = vm.createContext({ localStorage: { getItem: () => null } });
  const mods = new Map();
  const load = (relName) => {
    const abs = path.join(ROOT, "src", relName);
    if (mods.has(abs)) return mods.get(abs);
    const mod = new vm.SourceTextModule(readFileSync(abs, "utf8"), { context, identifier: "file://" + abs });
    mods.set(abs, mod);
    return mod;
  };
  const entry = load("hooks.js");
  await entry.link((specifier) => load(path.basename(specifier)));
  await entry.evaluate();
  return entry.namespace;
}

// docs/split-phase2-plan.md step 3 added 16 more ports (draw, playbackFrame,
// clampView, fitView, buildScoreModel, renderTrackbar, updateEditBtnVis,
// updateChipBtn, updateSongBtn, updateSyncBtn, updateSubtitle, askRender,
// finalizeNotes, recFinish, albumAdvance, songTitleOf — the last is step 2's
// chipRender/etc. blocker) alongside step 1's original five. Step 4b adds
// srAnnounce/scheduleBackupFlush/setAnchorBQ — step 4's own three genuinely
// layer-4 blockers (screen-reader strip, off-device backup timer,
// anchor-quantize setter) behind the clips/transport clusters.
const ALL_PORTS = [
  "setInfo", "logErr", "logDebug", "appConfirm", "updateJobsBtn",
  "draw", "playbackFrame", "clampView", "fitView", "buildScoreModel",
  "renderTrackbar", "updateEditBtnVis", "updateChipBtn", "updateSongBtn",
  "updateSyncBtn", "updateSubtitle", "askRender", "finalizeNotes",
  "recFinish", "albumAdvance", "songTitleOf", "srAnnounce",
  "scheduleBackupFlush", "setAnchorBQ",
];

test("hooks.js: every port throws `hook X not installed` before src/wire.js's installHooks() ever runs", async () => {
  const hooks = await loadHooksWithoutInstall();
  for (const name of ALL_PORTS)
    assert.throws(() => hooks[name]("x"), new RegExp(`hook ${name} not installed`));
});

test("wire.js installHooks(): every hooks.js port is installed, as a function, once the real app boots (createApp() -> app.js's first statement)", async () => {
  const app = await createApp();
  // JSON round-trip (tests/ai.test.mjs's own pattern): app.run() executes in
  // a separate vm realm, so a plain array/object result fails assert's
  // strict cross-realm identity checks even when its contents match.
  const installed = JSON.parse(app.run("JSON.stringify(Object.keys(S.hooks).sort())"));
  assert.deepEqual(installed, [...ALL_PORTS].sort());
  for (const name of installed) assert.equal(app.run(`typeof S.hooks.${name}`), "function");
});

test("hooks.js rebinding: reassigning the bare port name (run(\"setInfo = …\"), the vm harness's own e2e-devtools-mirror mechanism) replaces what every importer of the port calls — the real app.js caller included, with its own prior behavior (the ui/chrome.js setInfoImpl path) bypassed", async () => {
  const app = await createApp();
  app.run('setInfo = (s) => { S.__testHookSeen = s; };'); // reassigns hooks.js's OWN top-level binding — every bare "setInfo" import (app.js's included) is a live reference to it
  app.run('setInfo("intercepted")');
  assert.equal(app.run("S.__testHookSeen"), "intercepted");
  assert.equal(app.run("S.infoFull"), "tap a note"); // setInfoImpl (ui/chrome.js) never ran — it would have overwritten S.infoFull's literal initial value
});

test("hooks.js rebinding: same for draw() — a lower-layer caller (simulated here: a model mutator reaching up through the port) gets the rebound body, the real drawImpl (ui/chrome.js) bypassed (docs/split-phase2-plan.md step 3)", async () => {
  const app = await createApp();
  app.run("S.sceneValid = true;"); // drawImpl unconditionally sets this false — the tell that it ran
  app.run('draw = () => { S.__testDrawSeen = true; };'); // reassigns hooks.js's OWN top-level binding, same mechanism as setInfo above
  app.run('draw()'); // a model mutator would call this bare name once it's reachable from a lower layer
  assert.equal(app.run("S.__testDrawSeen"), true);
  assert.equal(app.run("S.sceneValid"), true); // drawImpl never ran
});

test("hooks.js rebinding: same for srAnnounce() (docs/split-phase2-plan.md step 4b) — a lower-layer caller (simulated: the play-gate transport) gets the rebound body, the real srAnnounceImpl (ui/chrome.js) bypassed", async () => {
  const app = await createApp();
  app.run("S.srLastText = null;"); // srAnnounceImpl sets this on every real call — the tell that it ran
  app.run('srAnnounce = (text) => { S.__testSrSeen = text; };'); // reassigns hooks.js's OWN top-level binding
  app.run('srAnnounce("Playing")');
  assert.equal(app.run("S.__testSrSeen"), "Playing");
  assert.equal(app.run("S.srLastText"), null); // srAnnounceImpl never ran
});

test("hooks.js rebinding: same for scheduleBackupFlush() (docs/split-phase2-plan.md step 4b) — saveDraft/saveLocalNotes call this bare name; a lower-layer caller gets the rebound body, the real scheduleBackupFlushImpl (ui/chrome.js) bypassed", async () => {
  const app = await createApp();
  app.run("S.askCaps.bridge = true;"); // scheduleBackupFlushImpl only arms the timer when this is set — the tell that it ran
  app.run('scheduleBackupFlush = () => { S.__testBackupFlushSeen = true; };'); // reassigns hooks.js's OWN top-level binding
  app.run('scheduleBackupFlush()');
  assert.equal(app.run("S.__testBackupFlushSeen"), true);
  assert.equal(app.run("S.backupFlushTimer"), null); // scheduleBackupFlushImpl never ran — no timer armed
});

test("hooks.js rebinding: same for setAnchorBQ() (docs/split-phase2-plan.md step 4b) — the clips cluster's writeClips/setClipDir call this bare name; a lower-layer caller gets the rebound body, the real setAnchorBQImpl (ui/note-editor.js) bypassed", async () => {
  const app = await createApp();
  app.run("S.__testAnchorArg = {};"); // setAnchorBQImpl always writes .b1/.q1 onto its first arg — the tell that it ran
  app.run('setAnchorBQ = (n, tick) => { S.__testAnchorSeen = tick; };'); // reassigns hooks.js's OWN top-level binding
  app.run('setAnchorBQ(S.__testAnchorArg, 480)');
  assert.equal(app.run("S.__testAnchorSeen"), 480);
  assert.equal(app.run("S.__testAnchorArg.b1"), undefined); // setAnchorBQImpl never ran
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

// ---- AI library vendoring (docs/ai-library-plan.md §1, §4 step 1) --------
// tools/ai-sync.mjs vendors Night-Roll-App/claude-bridge into vendor/ai/;
// these are that step's own oracles, alongside tests/ai.test.mjs (unchanged
// — the real-request/real-reply round trip — proving aiSSE still works once
// imported rather than declared in src/ask/backend.js).

test("checkSrc: vendor/ai/web (checkSrc's extraRoots) is clean against rules 1-3/6/7 — no top-level let, every free identifier resolved, no top-level name collides with src/'s", () => {
  const result = checkSrc(path.join(ROOT, "src"), { extraRoots: [{ root: path.join(ROOT, "vendor/ai/web"), prefix: "vendor/ai/web" }] });
  assert.equal(result.fileCount, 66, "64 src/ files (see the checkSrc test above) + 2 vendor/ai/web files (index.js, sse.js)");
  assert.deepEqual(result.violations.map(v => v.message), [
    'free identifier "oldBpb" is not a local, an import, or in browser-globals.txt',
  ], "the one pre-existing src/ finding, unchanged by adding vendor/ai/web to the scan");
});

function aiLibraryManifests() {
  const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const files = JSON.parse(readFileSync(path.join(ROOT, "vendor/ai/files.json"), "utf8"));
  const modulepreload = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m => m[1]);
  const modulepreloadVendor = modulepreload.filter(p => p.startsWith("vendor/ai/web/"));
  const aiModules = JSON.parse(sw.match(/const AI_MODULES = (\[[\s\S]*?\]);/)[1]);
  const webEntries = Object.keys(files).filter(p => p.startsWith("web/")).map(p => "vendor/ai/" + p);
  return { "index.html modulepreload ∩ vendor/ai/web": modulepreloadVendor, "sw.js AI_MODULES": aiModules, "vendor/ai/files.json web/ entries": webEntries };
}

test("AI library wiring: index.html modulepreload ∩ vendor/ai/web = sw.js AI_MODULES = vendor/ai/files.json's web/ entries", () => {
  const v = ruleManifestsEqual(aiLibraryManifests());
  assert.deepEqual(v, []);
});

test("AI library wiring: sw.js's AI_LIB equals vendor/ai/VERSION's sha7", () => {
  const version = readFileSync(path.join(ROOT, "vendor/ai/VERSION"), "utf8").trim();
  const sha = version.split(/\s+/)[1];
  const sw = readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const aiLib = sw.match(/const AI_LIB = "([0-9a-f]+)";/)[1];
  assert.equal(aiLib, sha.slice(0, 7));
});

test("AI library wiring: `node tools/ai-sync.mjs --check` passes — vendor/ai/'s hashes match files.json and VERSION isn't dirty", () => {
  const r = spawnSync(process.execPath, ["tools/ai-sync.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, "stdout: " + r.stdout + "\nstderr: " + r.stderr);
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

test("move.mjs: a non-declaration top-level statement is wrapped in init<Module><N>() at its original spot, and --from gets an import for the call stub", () => {
  const fromSource = `// ---- wiring ----\nconsole.log("boot");\nel.addEventListener("click", onClick);\n\n// ---- next ----\nfunction onClick() {}\n`;
  const result = planMove({ fromPath: "app.js", fromSource, toPath: "ui/chrome.js", range: "wiring" });
  assert.match(result.fromSource, /^initChrome1\(\);\s*$/m);
  assert.match(result.toSource, /export function initChrome1\(\) \{/);
  assert.match(result.toSource, /console\.log\("boot"\)/);
  // docs/split-phase2-plan.md §1 M4(e): the gap step 12 hit — without this
  // import, `initChrome1();` left in --from is a ReferenceError.
  assert.match(result.fromSource, /import \{ initChrome1 \} from ".\/ui\/chrome\.js";/);
  parseModule(result.fromSource, "app.js");
  parseModule(result.toSource, "ui/chrome.js");
});

test("move.mjs --init <InitName>: an explicit name instead of the auto-numbered init<Module><N>", () => {
  const fromSource = `// ---- wiring ----\nconsole.log("boot");\nel.addEventListener("click", onClick);\n\n// ---- next ----\nfunction onClick() {}\n`;
  const result = planMove({ fromPath: "app.js", fromSource, toPath: "input/gestures.js", range: "wiring", initName: "initGestures1" });
  assert.match(result.fromSource, /^initGestures1\(\);\s*$/m);
  assert.match(result.toSource, /export function initGestures1\(\) \{/);
  assert.match(result.fromSource, /import \{ initGestures1 \} from ".\/input\/gestures\.js";/);
  parseModule(result.fromSource, "app.js");
  parseModule(result.toSource, "input/gestures.js");
});

test("move.mjs --init: throws when more than one non-declaration group is selected (ambiguous which gets the name)", () => {
  const fromSource = `// ---- wiring ----\nfoo();\nfunction kept() {}\nbar();\n`;
  assert.throws(() => planMove({ fromPath: "app.js", fromSource, toPath: "input/gestures.js", range: "wiring", initName: "initGestures1" }), /more than one/);
});

test("move.mjs --init: throws when nothing non-declaration was selected", () => {
  const fromSource = `// ---- wiring ----\nexport function onlyADecl() {}\n`;
  assert.throws(() => planMove({ fromPath: "app.js", fromSource, toPath: "input/gestures.js", range: "wiring", initName: "initGestures1" }), /nothing non-declaration/);
});

test("move.mjs (a): never emits an import of a file into itself — a name already declared in --to is used locally, not re-imported from --from's stale import of --to", () => {
  // docs/split-plan.md's Deviations (8)/(9)/(10): app.js already imports
  // MODE_OFFSET from theory/key.js (moved there in an earlier step); moving
  // a function that references MODE_OFFSET INTO theory/key.js itself used
  // to resolve the reference via that stale --from import and add a bogus
  // `import { MODE_OFFSET } from "./key.js";` inside key.js.
  const fromSource = `import { MODE_OFFSET } from "./theory/key.js";\nexport function modeOfName(x) { return MODE_OFFSET[x]; }\n`;
  const toSource = `export const MODE_OFFSET = { major: 0 };\n`;
  const result = planMove({ fromPath: "app.js", fromSource, toPath: "theory/key.js", toSource, names: ["modeOfName"] });
  assert.doesNotMatch(result.toSource, /import.*MODE_OFFSET.*from/);
  parseModule(result.toSource, "theory/key.js"); // would throw "already declared" on the old bug
  assert.doesNotMatch(result.fromSource, /function modeOfName/);
});

test("move.mjs (b): a moved name's own `X = prof(\"X\", X);` statement travels WITH its declaration, comment included, and only for that name", () => {
  const fromSource = `import { prof } from "./state.js";\nfunction computeSongEnd() { return 1; }\ncomputeSongEnd = prof("computeSongEnd", computeSongEnd); // ?perf=1 attribution\nfunction sfShownAt() { return 2; }\n`;
  const result = planMove({ fromPath: "app.js", fromSource, toPath: "model/song.js", names: ["computeSongEnd"] });
  assert.match(result.toSource, /export function computeSongEnd\(\) \{ return 1; \}\ncomputeSongEnd = prof\("computeSongEnd", computeSongEnd\); \/\/ \?perf=1 attribution/);
  assert.doesNotMatch(result.fromSource, /computeSongEnd/); // the wrap left with it, not orphaned
  assert.match(result.fromSource, /function sfShownAt\(\) \{ return 2; \}/); // untouched, own line intact
  parseModule(result.fromSource, "app.js");
  parseModule(result.toSource, "model/song.js");
});

test("move.mjs (b): moving an UNRELATED name near a prof-wrapped one never joins lines or drops the wrap's comment (docs/split-plan.md's Deviations 9-11)", () => {
  const fromSource = `import { prof } from "./state.js";\nfunction computeSongEnd() { return 1; }\ncomputeSongEnd = prof("computeSongEnd", computeSongEnd); // ?perf=1 attribution\nfunction sfShownAt() { return 2; }\nfunction annoSnapshot() { return 3; }\n`;
  const result = planMove({ fromPath: "app.js", fromSource, toPath: "model/song.js", names: ["sfShownAt"] });
  assert.match(result.fromSource, /computeSongEnd = prof\("computeSongEnd", computeSongEnd\); \/\/ \?perf=1 attribution\nfunction annoSnapshot/);
  assert.doesNotMatch(result.fromSource, /computeSongEnd\(\);\s*function annoSnapshot/); // never joined onto one line
  parseModule(result.fromSource, "app.js");
});

test("move.mjs (c): moving content back INTO app.js lands BEFORE the generated e2e footer, never after (docs/split-plan.md's Deviations 14 — regen-e2e-footer.mjs used to delete it)", async () => {
  const { addAccessorFooter, FOOTER_MARKER } = await import("../tools/split/e2e-footer.mjs");
  const appBody = `export function kept() { return 1; }\n`;
  const toSource = addAccessorFooter(appBody); // simulates app.js's real generated footer
  assert.match(toSource, new RegExp(FOOTER_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const fromSource = `export function reverted() { return 2; }\n`;
  const result = planMove({ fromPath: "ui/chrome.js", fromSource, toPath: "app.js", toSource, names: ["reverted"] });
  const markerIdx = result.toSource.indexOf(FOOTER_MARKER);
  const revertedIdx = result.toSource.indexOf("function reverted");
  assert.ok(revertedIdx !== -1 && markerIdx !== -1 && revertedIdx < markerIdx, "moved content must sit before the footer marker");
  // regen-e2e-footer.mjs's stripFooter() must not delete the reverted content
  const { stripFooter } = await import("../tools/split/e2e-footer.mjs");
  assert.match(stripFooter(result.toSource), /function reverted/);
  parseModule(result.toSource, "app.js");
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

// ---- verbatim.mjs ------------------------------------------------------------

function fakeDiff(fileRemAdd) {
  // fileRemAdd: [{ file, rem: string[], add: string[] }] — builds a minimal
  // unified diff classifyDiff() can parse (it only reads the `diff --git`
  // file header and +/- lines; hunk headers/context lines are irrelevant).
  let out = "";
  for (const { file, rem = [], add = [] } of fileRemAdd) {
    out += `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,${rem.length} +1,${add.length} @@\n`;
    for (const l of rem) out += `-${l}\n`;
    for (const l of add) out += `+${l}\n`;
  }
  return out;
}

test("verbatim.classifyDiff: a plain move (removed text reappears added, same file set) is clean", () => {
  const diff = fakeDiff([{ file: "src/app.js", rem: ["function helper() { return 1; }"] }, { file: "src/util.js", add: ["export function helper() { return 1; }"] }]);
  const { lost, extra } = classifyDiff(diff);
  assert.deepEqual(lost, []);
  assert.deepEqual(extra, []);
});

test("verbatim.classifyDiff: real lost/dropped text is still flagged", () => {
  const diff = fakeDiff([{ file: "src/app.js", rem: ["function helper() { return 1; }", "function other() { return 2; }"] }]);
  const { lost } = classifyDiff(diff);
  assert.equal(lost.length, 2);
});

test("verbatim.classifyDiff: tolerates move.mjs --init's structural lines (header, closing brace, call stub) unconditionally", () => {
  const diff = fakeDiff([
    { file: "src/app.js", rem: ["console.log(\"boot\");"], add: ["initChrome1();"] },
    { file: "src/ui/chrome.js", add: ["export function initChrome1() {", "  console.log(\"boot\");", "}"] },
  ]);
  const { lost, extra } = classifyDiff(diff);
  assert.deepEqual(lost, []);
  assert.deepEqual(extra, []);
});

test("verbatim.classifyDiff: the init-wrapper's closing brace tolerance is budgeted — a genuinely unmatched extra brace elsewhere is still flagged", () => {
  const diff = fakeDiff([
    { file: "src/app.js", rem: ["console.log(\"boot\");"], add: ["initChrome1();"] },
    { file: "src/ui/chrome.js", add: ["export function initChrome1() {", "  console.log(\"boot\");", "}", "}"] }, // one extra, unbudgeted "}"
  ]);
  const { extra } = classifyDiff(diff);
  assert.deepEqual(extra, ["}"]);
});

test("verbatim.classifyDiff --hook: new lines in hooks.js/wire.js are always allowed", () => {
  const diff = fakeDiff([{ file: "src/hooks.js", add: ["import { S } from \"./state.js\";", "export function draw(...a) { return (S.hooks.draw || need(\"draw\"))(...a); }"] }]);
  const { lost, extra } = classifyDiff(diff, { hookNames: ["draw"] });
  assert.deepEqual(lost, []);
  assert.deepEqual(extra, []);
});

test("verbatim.classifyDiff --hook: function X( -> function XImpl( rename is tolerated for a listed name, not for an unlisted one", () => {
  const renameDiff = fakeDiff([{ file: "src/ui/chrome.js", rem: ["export function draw() { return 1; }"], add: ["export function drawImpl() { return 1; }"] }]);
  assert.deepEqual(classifyDiff(renameDiff, { hookNames: ["draw"] }), { lost: [], extra: [] });

  const unlisted = fakeDiff([{ file: "src/ui/chrome.js", rem: ["export function setInfo() { return 1; }"], add: ["export function setInfoImpl() { return 1; }"] }]);
  const v = classifyDiff(unlisted, { hookNames: ["draw"] }); // "setInfo" isn't in --hook's list
  assert.ok(v.lost.length && v.extra.length);
});

test("verbatim.classifyDiff --hook: the prof-wrap rename keeps its label string unchanged", () => {
  const diff = fakeDiff([{
    file: "src/ui/chrome.js",
    rem: [`draw = prof("draw", draw); // ?perf=1 attribution`],
    add: [`drawImpl = prof("draw", drawImpl); // ?perf=1 attribution`],
  }]);
  assert.deepEqual(classifyDiff(diff, { hookNames: ["draw"] }), { lost: [], extra: [] });
});

test("verbatim.classifyDiff --hook: a single installHooks(); call stub is tolerated", () => {
  const diff = fakeDiff([{ file: "src/app.js", add: ["installHooks();"] }]);
  assert.deepEqual(classifyDiff(diff, { hookNames: ["draw"] }), { lost: [], extra: [] });
});

test("verbatim.classifyDiff --hook: src/state.js's new `hooks: {},` literal is tolerated — genuinely new text, not a move", () => {
  const diff = fakeDiff([{ file: "src/state.js", add: ["hooks: {},"] }]);
  assert.deepEqual(classifyDiff(diff, { hookNames: ["draw"] }), { lost: [], extra: [] });
});

test("verbatim.findSelfImports: a bare file importing its own basename is flagged; a normal import is not", () => {
  const files = new Map([
    ["src/theory/key.js", `import { MODE_OFFSET } from "./key.js";\nexport const x = 1;\n`],
    ["src/model/song.js", `import { S } from "../state.js";\nexport const y = 1;\n`],
  ]);
  const v = findSelfImports(files);
  assert.equal(v.length, 1);
  assert.match(v[0], /key\.js/);
});

test("verbatim.mjs CLI: still prints ✔ for real module-split commits (868beff8, b92ec10d)", () => {
  for (const rev of ["868beff8", "b92ec10d"]) {
    const r = spawnSync(process.execPath, ["tools/split/verbatim.mjs", rev], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 0, `${rev}: stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stdout, /✔/);
  }
});

// ---- blockers.mjs -------------------------------------------------------------

test("blockers.computeBlockers: a clean name (no app.js-declared dependency, no illegal-layer import) reports empty closure and a clean verdict", () => {
  const fromSource = `import { helper } from "./model/song.js";\nexport function pureLeaf() { return helper(); }\n`;
  const layerOfFn = (rel) => (rel === "model/song.js" ? 2 : rel === "audio/chip.js" ? 3 : null);
  const result = computeBlockers({ fromSource, names: ["pureLeaf"], toPath: "src/audio/chip.js", layerOfFn });
  assert.deepEqual(result.closure, []);
  assert.deepEqual(result.illegalImports, []);
  assert.match(result.verdict, /^clean:/);
});

test("blockers.computeBlockers: follows the transitive closure of names still declared in app.js", () => {
  const fromSource = `function chipSource() { return chipVaultFile(); }\nfunction chipVaultFile() { return chipExt(); }\nfunction chipExt() { return 1; }\n`;
  const layerOfFn = () => 3;
  const result = computeBlockers({ fromSource, names: ["chipSource"], toPath: "src/audio/chip.js", layerOfFn });
  assert.deepEqual(result.closure.sort(), ["chipExt", "chipVaultFile"]);
  assert.match(result.verdict, /^blocked:/);
  assert.match(result.verdict, /chipVaultFile/);
});

test("blockers.computeBlockers: lists an already-resolved import that would cross above --to's layer", () => {
  const fromSource = `import { logErr } from "./ui/chrome.js";\nfunction chipSource() { return logErr(); }\n`;
  const layerOfFn = (rel) => (rel === "ui/chrome.js" ? 4 : rel === "audio/chip.js" ? 3 : null);
  const result = computeBlockers({ fromSource, names: ["chipSource"], toPath: "src/audio/chip.js", layerOfFn });
  assert.deepEqual(result.closure, []);
  assert.equal(result.illegalImports.length, 1);
  assert.equal(result.illegalImports[0].name, "logErr");
  assert.equal(result.illegalImports[0].layer, 4);
  assert.match(result.verdict, /illegal-layer/);
});

test("blockers.mjs CLI: real repo — chipSource -> audio/chip.js is CLEAN, post-docs/split-phase2-plan.md step 2: chipSource/CHIPS/etc. actually moved there, and step 1's logErr port means computeBlockers never even needs to chase it (chipSource isn't declared in app.js at all any more)", () => {
  const r = spawnSync(process.execPath, ["tools/split/blockers.mjs", "chipSource", "--to", "src/audio/chip.js"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /clean/);
});

test("blockers.mjs CLI: real repo — chipRender/chipRenderInWorker/chipPublish/chipStreamOpen/chipRenderAuto are no longer declared in app.js at all, post-docs/split-phase2-plan.md step 4: step 2's songTitleOf illegal-layer blocker dissolved by step 3's port, and step 4 actually moved the whole cluster (audio/chip.js, audio/chip-stream.js) — blockers.mjs now has nothing to chase (not even an empty closure, since the name isn't in app.js to begin with)", () => {
  for (const [name, toPath] of [
    ["chipRender", "src/audio/chip.js"], ["chipRenderInWorker", "src/audio/chip.js"],
    ["chipPublish", "src/audio/chip.js"], ["chipStreamOpen", "src/audio/chip-stream.js"],
    ["chipRenderAuto", "src/audio/chip-stream.js"],
  ]) {
    const r = spawnSync(process.execPath, ["tools/split/blockers.mjs", name, "--to", toPath], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 0, `${name}: ${r.stdout}`);
    assert.match(r.stdout, /clean/);
  }
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
