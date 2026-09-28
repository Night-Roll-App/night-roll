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

test("tap preview: the one-note copy carries the tapped pitch in every field a renderer reads", async () => {
  // Rare's renderer pitches from `key`, EAD's from `semitone`, the MIDI from
  // `midi`: a copy that set only some of them played every tap on a Rare
  // song at the track's first pitch (Josh, 2026-09-28: taps "all sounded
  // exactly the same, like the lowest note"). previewOne now delegates the
  // one-note-copy recipe to tools/note-preview.mjs (M.renderOneNote) — the
  // shared helper tools/sounding.mjs's capture-time probe also uses.
  const { previewOne } = await import("../tools/chip-worker.mjs");
  const { renderOneNote } = await import("../tools/note-preview.mjs");
  let seen = null;
  const t = {ch: 5, inst: 63, drum: false, key: 41, midi: 41, semitone: 20, tick: 96, dur: 48, vel: 90};
  const live = {kind: "usf", rate: 32000,
    M: {channelGroups: () => [{name: "ch 5 inst 63", notes: [t], kit: false}], renderOneNote},
    R: {render: async (M, r) => { seen = r.result.notes[0]; return {"ch 5 inst 63": new Float32Array(4)}; }},
    res: {result: {notes: [t], tempos: [], endTick: 144}, seconds: 1}};
  await previewOne(live, {track: "ch 5 inst 63", midi: 72, vel: 100});
  assert.equal(seen.key, 72); assert.equal(seen.midi, 72); assert.equal(seen.semitone, 51);
  assert.equal(seen.tick, 0);
});

test("tap preview: a shifted track's offset converts the roll's pitch back to the renderer's key", async () => {
  // tools/sounding.mjs shifts a track's roll pitch away from the renderer's
  // own key (e.g. −12: the roll shows the sounding pitch, an octave above
  // what the console plays). A tap sends the ROLL's pitch — previewOne must
  // feed the renderer roll_pitch − offset, or the tap sounds an octave wrong.
  const { previewOne } = await import("../tools/chip-worker.mjs");
  const { renderOneNote } = await import("../tools/note-preview.mjs");
  let seen = null;
  const t = {ch: 0, inst: 0, drum: false, key: 60, midi: 60, semitone: 39, tick: 0, dur: 48, vel: 90};
  const live = {kind: "usf", rate: 32000,
    M: {channelGroups: () => [{name: "ch 0 inst 0", notes: [t], kit: false}], renderOneNote},
    R: {render: async (M, r) => { seen = r.result.notes[0]; return {"ch 0 inst 0": new Float32Array(4)}; }},
    res: {result: {notes: [t], tempos: [], endTick: 48}, seconds: 1}};
  await previewOne(live, {track: "ch 0 inst 0", midi: 72, offset: -12, vel: 100}); // roll shows 72 (sounding); the console's own key is 84
  assert.equal(seen.midi, 84); assert.equal(seen.key, 84); assert.equal(seen.semitone, 63);
});
