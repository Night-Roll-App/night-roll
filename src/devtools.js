// src/devtools.js — e2e mirror (docs/split-plan.md §3.4). page.evaluate
// reads/calls bare names (song, draw(), …) that lived in the global lexical
// scope of the old classic <script>; a module's top-level bindings are NOT
// window properties, so without this an e2e spec written against the old
// app would throw ReferenceError on every one of those. exposeGlobals()
// defines a window accessor for every export of every real module (as new
// modules are carved out of app.js in later steps, add their "import * as"
// line here too — tests/modules.test.mjs's rule-8 check enforces this list
// stays complete).
//
// GET only, by design (§3.4): an ES module's exported `let` binding is a
// live READ reference to importers, but importers cannot assign it — only
// the declaring module can. Two-way access (window.x = …) returns once a
// name moves to `S` (step 1's promote-state.mjs); S's own fields get both
// get and set, same as the test harness's scopeProxy (tests/harness.mjs).
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
      if (name in window) continue; // never shadow a real browser global
      Object.defineProperty(window, name, { configurable: true, enumerable: true, get: () => ns[name] });
    }
  }
}
