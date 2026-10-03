// tests/controls.test.mjs — docs/split-plan.md §4 step 2: src/ui/controls.js
// is the ONLY place that writes a registered control's .innerHTML/
// .textContent/aria-label. Enforced two ways:
//   1. a static scan (tools/split/check-controls.mjs, same vendored-acorn
//      technique as check.mjs/check-e2e-globals.mjs) over the real src/ tree,
//      against a shrinking ALLOWLIST of not-yet-migrated offenders (empty
//      today — step 2 converted every writer it touched).
//   2. a behavioral proof that setControl() itself produces the right DOM
//      for a representative control of each kind (icon, glyph, checkbox
//      prefix, aria-only patch, partial-patch independence).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./harness.mjs";
import { controlIdsFrom, checkControls } from "../tools/split/check-controls.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Grows only by shrinking (docs/split-plan.md §4 step 2): a control not yet
// migrated to setControl lists its known offending sites here; converting a
// site removes its line, and nothing may be ADDED back once a control is
// registered and converted. Empty today.
const ALLOWLIST = [];

test("controls: every registered control's innerHTML/textContent/aria-label is written only from src/ui/controls.js", () => {
  const controlsSource = readFileSync(path.join(ROOT, "src/ui/controls.js"), "utf8");
  const controlIds = controlIdsFrom(controlsSource);
  assert.ok(controlIds.length > 20, "CONTROLS should have picked up every registered id");
  const violations = checkControls(path.join(ROOT, "src"), controlIds);
  const unexpected = violations.filter(v => !ALLOWLIST.some(a => a.file === v.file && a.line === v.line));
  assert.deepEqual(unexpected, [], "new/unallowlisted writer(s) outside ui/controls.js: " + JSON.stringify(unexpected));
  // the allowlist may only shrink: every entry must still be a real finding,
  // never a stale leftover once the real site is converted.
  for (const a of ALLOWLIST) assert.ok(violations.some(v => v.file === a.file && v.line === a.line), "stale allowlist entry: " + JSON.stringify(a));
});

test("controls: setControl() builds icon/glyph + checkmark prefix + label, and a partial patch leaves other fields alone", async () => {
  const app = await createApp();
  // icon control: label-only patch keeps the registered icon
  app.run(`setControl("playbtn", {label: "Play"})`);
  assert.equal(app.run(`document.getElementById("playbtn").textContent`), "Play");
  app.run(`setControl("playbtn", {icon: "stopIcon", label: "Stop"})`);
  assert.equal(app.run(`document.getElementById("playbtn").innerHTML`).includes('data-name="stopIcon"'), true);
  // glyph control + checkbox prefix (the glyph itself is a text node, unlike
  // an icon svg's <path> children, so it's part of textContent too)
  app.run(`setControl("vwScore", {prefix: "✓ "})`);
  assert.equal(app.run(`document.getElementById("vwScore").textContent`), "✓ 𝄞  Score view");
  app.run(`setControl("vwScore", {prefix: "   "})`);
  assert.equal(app.run(`document.getElementById("vwScore").textContent`), "   𝄞  Score view");
  // aria-only patch does not touch content; content-only patch does not touch aria-label
  app.run(`setControl("askbtn", {label: "AI · 5"})`);
  app.run(`setControl("askbtn", {aria: "Talk to the AI tutor — Claude Code is working: x"})`);
  assert.equal(app.run(`document.getElementById("askbtn").textContent`), "AI · 5", "the aria-only call didn't touch the label");
  assert.equal(app.run(`document.getElementById("askbtn").getAttribute("aria-label")`), "Talk to the AI tutor — Claude Code is working: x");
  app.run(`setControl("askbtn", {label: "AI · 4"})`);
  assert.equal(app.run(`document.getElementById("askbtn").getAttribute("aria-label")`), "Talk to the AI tutor — Claude Code is working: x", "the label-only call didn't touch the aria-label");
});

test("controls: setControl() throws on an unregistered id (CONTROLS is the one source of truth)", async () => {
  const app = await createApp();
  assert.throws(() => app.run(`setControl("not-a-real-control", {label: "x"})`), /unknown control/);
});
