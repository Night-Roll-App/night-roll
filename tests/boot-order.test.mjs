// tests/boot-order.test.mjs — docs/split-phase2-plan.md §3 (L commits: "a
// boot-order test recording the init order before/after"). The snapshot
// was written by `node tools/split/boot-order.mjs --write` from src/app.js
// BEFORE phase 2 step 12's first init move; every later commit must walk
// to the identical statement sequence through main.js's init stubs (and,
// after step 13, through main.js's own ordered call list). A reordered,
// dropped or duplicated top-level statement fails here, whichever file it
// now lives in.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootOrder, SNAPSHOT } from "../tools/split/boot-order.mjs";

test("boot order: main.js's expanded top-level statement sequence equals the pre-step-12 snapshot, statement for statement", () => {
  const expected = readFileSync(SNAPSHOT, "utf8").split("\n").filter(Boolean);
  const actual = bootOrder();
  assert.equal(actual.length, expected.length, "statement count changed");
  for (let i = 0; i < expected.length; i++) {
    assert.equal(actual[i], expected[i], `boot statement #${i + 1} differs (previous: ${expected[i - 1] || "(start)"})`);
  }
});

test("boot order: the first statement is installHooks() and the last is the devtools gate, with boot() just before it", () => {
  const actual = bootOrder();
  assert.equal(actual[0], "installHooks();");
  assert.equal(actual[actual.length - 1], 'if (typeof window !== "undefined" && window.__NR_EXPOSE) exposeGlobals();');
  assert.equal(actual[actual.length - 2], "(async function boot() {");
});
