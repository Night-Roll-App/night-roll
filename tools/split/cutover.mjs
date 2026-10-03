#!/usr/bin/env node
// tools/split/cutover.mjs — docs/split-plan.md §4 step 0b: the one-time
// cutover from "the whole app is index.html's inline <script>" to "the whole
// app is src/app.js, loaded as an ES module". Deterministic and re-runnable
// (ground rule §0): if main moved underneath you, reset index.html/src/ to
// main and re-run this script — it always starts from the CURRENT
// index.html, never from a diff.
//
//   node tools/split/cutover.mjs            # writes index.html + src/
//   node tools/split/cutover.mjs --dry-run   # prints what would change
//
// What it does, in order:
//   1. Extracts the inline <script> (the one right after vendor/vexflow.js)
//      out of index.html, verbatim, as src/app.js's body.
//   2. Swaps the EDITION block for an import from the new src/edition.js
//      (the packager's one-line change moves with it — tools/package.mjs
//      now rewrites src/edition.js instead of index.html).
//   3. Inserts the boot-watchdog clear as the first statement inside the
//      boot() IIFE (the dangerous "modules never loaded" window has passed
//      the moment boot() starts running — clearing any later risks a false
//      alarm from a slow catalog fetch, a deviation from "end of boot()"
//      recorded in docs/split-plan.md's Deviations section).
//   4. Appends a generated e2e accessor footer (`export const __nrExpose$ = {get,
//      set}`) covering every one of app.js's top-level bindings — the same
//      mechanism tests/harness.mjs's module-mode footer already uses (§3.2),
//      reused here because app.js is the legacy container: none of its
//      ~203 top-level names are `export`ed (step 1 hasn't moved them to `S`
//      yet), so without this devtools.js's window mirror would have nothing
//      to mirror and every Playwright spec's bare-name page.evaluate() would
//      throw ReferenceError. Never exported by production unless
//      window.__NR_EXPOSE is set (src/devtools.js, tests/e2e/helpers.mjs).
//   5. Writes src/app.js, src/edition.js, src/main.js, src/devtools.js,
//      src/package.json.
//   6. Replaces index.html's script tags with modulepreload links + the
//      module entry script.
// Node-only tooling, never shipped (same family as move.mjs/check.mjs).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addAccessorFooter } from "./e2e-footer.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(path.dirname(HERE));
const INDEX = path.join(REPO_ROOT, "index.html");
const SRC = path.join(REPO_ROOT, "src");
const DRY_RUN = process.argv.includes("--dry-run");

const VEXFLOW_TAG = '<script src="vendor/vexflow.js"></script>';
const SCRIPT_OPEN = "<script>\n";
const SCRIPT_CLOSE = "\n</script>\n</body>";

const EDITION_BLOCK = `// EDITION: "web" is this site; the packager (tools/package.mjs) rewrites this
// ONE line to "app" for the store build. The app edition hides what only makes
// sense on the public study site (class="webonly"), nothing else changes.
const EDITION = "web";`;

const EDITION_IMPORT = `// EDITION moved to src/edition.js (docs/split-plan.md §1): the packager
// (tools/package.mjs) now rewrites THAT file's one line to "app" for the
// store build. The app edition hides what only makes sense on the public
// study site (class="webonly"), nothing else changes.
import { EDITION } from "./edition.js";`;

const BOOT_OPEN = "(async function boot() {\n";
const BOOT_WATCHDOG_CLEAR = `  // boot watchdog (docs/split-plan.md §4 step 0b): the inline classic
  // script in index.html's <head> arms a 10s failsafe before any module
  // runs, for a module 404/syntax error that would otherwise leave a blank
  // screen. Reaching here proves the module graph loaded and boot() is
  // running, so the dangerous window has passed — clear it now, not at the
  // end of boot(), so a slow catalog fetch can never trip a false alarm.
  if (typeof window !== "undefined" && window.__nrBoot) { clearTimeout(window.__nrBoot); window.__nrBoot = null; }
`;

function extractScript(html) {
  const tagStart = html.indexOf(VEXFLOW_TAG + "\n" + SCRIPT_OPEN);
  if (tagStart === -1) throw new Error("vendor/vexflow.js + inline <script> anchor not found in index.html");
  const bodyStart = tagStart + (VEXFLOW_TAG + "\n" + SCRIPT_OPEN).length;
  const bodyEnd = html.indexOf(SCRIPT_CLOSE, bodyStart);
  if (bodyEnd === -1) throw new Error("closing </script></body> not found after the inline script");
  return { tagStart, bodyStart, bodyEnd, body: html.slice(bodyStart, bodyEnd) };
}

function swapEdition(body) {
  if ((body.match(/const EDITION = "[a-z]+";/g) || []).length !== 1) throw new Error("expected exactly one EDITION line in the inline script");
  const i = body.indexOf(EDITION_BLOCK);
  if (i === -1) throw new Error("EDITION_BLOCK text not found verbatim — index.html's comment drifted; update cutover.mjs's EDITION_BLOCK constant");
  return body.slice(0, i) + EDITION_IMPORT + body.slice(i + EDITION_BLOCK.length);
}

function addWatchdogClear(body) {
  const i = body.indexOf(BOOT_OPEN);
  if (i === -1) throw new Error("boot() IIFE not found verbatim — update cutover.mjs's BOOT_OPEN constant");
  const after = i + BOOT_OPEN.length;
  return body.slice(0, after) + BOOT_WATCHDOG_CLEAR + body.slice(after);
}

// topLevelAccessorNames/addAccessorFooter moved to ./e2e-footer.mjs (step 1,
// docs/split-plan.md §4 step 1 deviation): once promote-state.mjs starts
// changing app.js's top-level names, the footer must be regenerated from
// the file's CURRENT body, not only generated once here at 0b — see
// tools/split/regen-e2e-footer.mjs. cutover.mjs still calls the same
// function for its own one-shot write.

const MAIN_JS = `// src/main.js — entry point (docs/split-plan.md §1, step 0b). Imports
// app.js, which still holds nearly the whole app pre-split (later steps move
// pieces out of it into their own modules). Wires the e2e devtools mirror,
// gated so production never pays for it (§3.4).
import "./app.js";
import { exposeGlobals } from "./devtools.js";

if (typeof window !== "undefined" && window.__NR_EXPOSE) exposeGlobals();
`;

const DEVTOOLS_JS = `// src/devtools.js — e2e mirror (docs/split-plan.md §3.4). page.evaluate
// reads/calls bare names (song, draw(), …) that lived in the global lexical
// scope of the old classic <script>; a module's top-level bindings are NOT
// window properties, so without this an e2e spec written against the old
// app would throw ReferenceError on every one of those. exposeGlobals()
// defines a window accessor for every export of every real module (as new
// modules are carved out of app.js in later steps, add their "import * as"
// line here too — tests/modules.test.mjs's rule-8 check enforces this list
// stays complete).
//
// Plain named exports (edition.js, and any real module carved out of app.js
// in later steps) are GET only (§3.4): an ES module's exported \`let\` binding
// is a live READ reference to importers, but importers cannot assign it —
// only the declaring module can. Two-way access (window.x = …) returns once
// a name moves to \`S\` (step 1's promote-state.mjs); S's own fields get both
// get and set, same as the test harness's scopeProxy (tests/harness.mjs).
//
// app.js is different TODAY (docs/split-plan.md §4 step 0b deviation): it is
// the legacy container, so none of its ~203 top-level names are \`export\`ed
// at all — the plain loop below would see nothing for it. cutover.mjs
// appends a generated \`export const __nrExpose$ = {get, set}\` to app.js (same
// mechanism tests/harness.mjs's own per-module footer already uses), which
// this file mirrors onto window with BOTH get and set — real e2e specs
// assign bare names too (\`song = …\`, \`mode = …\`), which a GET-only mirror
// could never support. Deleted in step 15 along with app.js itself.
//
// Never touches production unless window.__NR_EXPOSE is set
// (tests/e2e/helpers.mjs sets it before navigation) — left off by default
// so an un-imported name fails loudly instead of silently resolving through
// window.
import * as app from "./app.js";
import * as edition from "./edition.js";

export function exposeGlobals() {
  // built inside the function, not as a top-level initializer (check.mjs
  // rule 4): app.js is layer 5, same as this file, and nothing here is
  // actually evaluation-order-sensitive — but keeping the object literal
  // out of top-level init code is the same discipline §2.2 asks of every
  // other module, free to apply here too.
  const MODULES = { app, edition };
  for (const ns of Object.values(MODULES)) {
    for (const name of Object.keys(ns)) {
      if (name === "__nrExpose$") continue; // the accessor object itself, not a global
      if (name in window) continue; // never shadow a real browser global
      Object.defineProperty(window, name, { configurable: true, enumerable: true, get: () => ns[name] });
    }
  }
  // app.js's generated accessor mirror (see the file-header comment above) —
  // read AND write every one of its top-level bindings.
  if (app.__nrExpose$) {
    for (const name of Object.keys(app.__nrExpose$.get)) {
      if (name in window) continue; // never shadow a real browser global
      const setter = app.__nrExpose$.set[name];
      const desc = { configurable: true, enumerable: true, get: app.__nrExpose$.get[name] };
      if (setter) desc.set = setter;
      Object.defineProperty(window, name, desc);
    }
  }
}
`;

const PACKAGE_JSON = `{
  "type": "module"
}
`;

const MODULEPRELOAD_AND_SCRIPT = `<link rel="modulepreload" href="src/edition.js">
<link rel="modulepreload" href="src/app.js">
<link rel="modulepreload" href="src/devtools.js">
<link rel="modulepreload" href="src/main.js">
<script src="vendor/vexflow.js"></script>
<script type="module" src="src/main.js"></script>
`;

function run() {
  const html = readFileSync(INDEX, "utf8");
  const { tagStart, bodyEnd, body } = extractScript(html);
  const appJsBody = addAccessorFooter(addWatchdogClear(swapEdition(body)));
  const newIndex = html.slice(0, tagStart) + MODULEPRELOAD_AND_SCRIPT + html.slice(bodyEnd + SCRIPT_CLOSE.length - "</body>".length);

  if (DRY_RUN) {
    console.log("--- src/app.js (" + appJsBody.length + " bytes) ---");
    console.log("--- index.html diff point ---\n" + html.slice(Math.max(0, tagStart - 40), tagStart) + "[[[CUT]]]" + newIndex.slice(tagStart, tagStart + 400));
    return;
  }
  mkdirSync(SRC, { recursive: true });
  writeFileSync(path.join(SRC, "app.js"), appJsBody);
  writeFileSync(path.join(SRC, "edition.js"), `// src/edition.js — EDITION: "web" is this site; the packager
// (tools/package.mjs) rewrites this ONE line to "app" for the store build.
// The app edition hides what only makes sense on the public study site
// (class="webonly"), nothing else changes. docs/split-plan.md §1: this is
// the packager's one-line change.
export const EDITION = "web";
`);
  writeFileSync(path.join(SRC, "main.js"), MAIN_JS);
  writeFileSync(path.join(SRC, "devtools.js"), DEVTOOLS_JS);
  writeFileSync(path.join(SRC, "package.json"), PACKAGE_JSON);
  writeFileSync(INDEX, newIndex);
  console.log("cutover: wrote src/{app,edition,main,devtools}.js + src/package.json; index.html now loads src/main.js as a module");
}

run();
