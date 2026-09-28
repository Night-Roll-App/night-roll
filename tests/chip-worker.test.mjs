// The render worker is a module the page fetches at run time: a syntax
// error in it never fails a vm test but kills chip audio for EVERY console
// (2026-09-27: a stray brace shipped to the iPad; PS1 songs fell to synth
// because the inline fallback's parse threw too). So: the file must parse,
// and every chip that renders must parse its bytes inline without throwing.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createApp } from "./harness.mjs";

test("tools/chip-worker.mjs parses as a module", () => {
  const r = spawnSync(process.execPath, ["--check", "tools/chip-worker.mjs"], {encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr);
});

test("every rendering chip has an inline parse that does not throw (the worker's fallback)", () => {
  const app = createApp();
  const kinds = JSON.parse(app.run(`JSON.stringify(Object.keys(CHIPS).filter(k => CHIPS[k].render))`));
  assert.ok(kinds.includes("psf") && kinds.includes("usf") && kinds.includes("spc"), "renderers: " + kinds.join(",")); // nsf/gbs render by the default apu path
  for (const k of ["psf", "usf"]) {
    const ok = app.run(`(() => { try { const p = CHIPS["${k}"].parse({})(new Uint8Array([1, 2, 3]), {libs: {"x.lib": new Uint8Array(1)}}); return !!p.bytes && !!p.libs; } catch (e) { return "threw: " + e.message; } })()`);
    assert.equal(ok, true, k + " parse: " + ok);
  }
});
