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

// FF7 (PS1) "You Can Hear the Cry of the Planet" (Josh's ear, 2026-09-30):
// choir/voice tracks sound right in playback, but TAPPING a note plays the
// WRONG instrument. Several of this song's tracks change program mid-track
// ("ch 1 prog 51,46", "ch 2 prog 50,31", ...) — findTemplateNote always took
// the group's FIRST non-drum note, so a tap anywhere in such a track was
// rendered with the FIRST program forever, however far into the track the
// tapped note actually fell.
test("findTemplateNote: without `at`, the group's first note; with `at` in a later program's span, THAT note", async () => {
  const { findTemplateNote } = await import("../tools/note-preview.mjs");
  const early = {ch: 0, program: 51, drum: false, tick: 0, endTick: 400, key: 60, pitch: 60, vel: 90};
  const late  = {ch: 0, program: 46, drum: false, tick: 500, endTick: 900, key: 64, pitch: 64, vel: 90};
  const M = {channelGroups: () => [{name: "ch 1 prog 51,46", notes: [early, late], ch: 0, kit: false}]};
  const first = findTemplateNote(M, "psf", {}, "ch 1 prog 51,46");
  assert.equal(first.program, 51, "no `at`: unchanged — the group's first note");
  const inSecond = findTemplateNote(M, "psf", {}, "ch 1 prog 51,46", 600); // inside `late`'s [500,900) span
  assert.equal(inSecond.program, 46, "`at` inside the SECOND note's span: its program, not the first");
  const nearFirst = findTemplateNote(M, "psf", {}, "ch 1 prog 51,46", 50); // inside `early`'s span
  assert.equal(nearFirst.program, 51, "`at` inside the first note's own span still finds it (not just nearest-by-distance)");
});

test("seqTickOf: a roll tick converts to the sequence's own tick space — PS1 by seq.ppq, N64 by the fixed TICKS_PER_BEAT", async () => {
  const { seqTickOf } = await import("../tools/note-preview.mjs");
  // PS1: makeMidi writes T(tick) = round(tick * 480 / seq.ppq); inverted here
  assert.equal(seqTickOf("psf", {seq: {ppq: 48}}, 6000, 480), 600, "480-ppq roll tick 6000 at a 48-ppq sequence: tick 600");
  assert.equal(seqTickOf("psf", {seq: {}}, 6000, 480), undefined, "no seq.ppq to convert with: undefined, not a guess");
  assert.equal(seqTickOf("psf", {seq: {ppq: 48}}, undefined, 480), undefined, "no tick given: undefined");
  // N64: toMidi writes tick * 480 / TICKS_PER_BEAT (48, fixed) — same scale, no seq.ppq needed
  assert.equal(seqTickOf("usf", {}, 4800, 480), 480, "480-ppq roll tick 4800 at TICKS_PER_BEAT=48: tick 480");
});

test("tap preview: previewOne resolves the template's program/instrument for the page's cache key, from the tapped tick", async () => {
  const { previewOne } = await import("../tools/chip-worker.mjs");
  const { renderOneNote, findTemplateNote, seqTickOf } = await import("../tools/note-preview.mjs");
  const early = {ch: 0, program: 51, drum: false, tick: 0, endTick: 400, key: 60, pitch: 60, cents: 0, vel: 90};
  const late  = {ch: 0, program: 46, drum: false, tick: 500, endTick: 900, key: 64, pitch: 64, cents: 0, vel: 90};
  const live = {kind: "psf", rate: 44100,
    M: {channelGroups: () => [{name: "ch 1 prog 51,46", notes: [early, late], ch: 0, kit: false}], renderOneNote, findTemplateNote, seqTickOf},
    R: {render: async () => ({"ch 1 prog 51,46": new Float32Array(4)})},
    res: {result: {notes: [early, late], seq: {ppq: 48}, tempos: [], endTick: 900}, seconds: 1}};
  // roll tick 6000 at song ppq 480, seq.ppq 48 -> sequence tick 600, inside `late`'s span
  const reply = await previewOne(live, {track: "ch 1 prog 51,46", midi: 64, vel: 100, tick: 6000, ppq: 480});
  assert.ok(reply.pcm, "still renders audio");
  assert.equal(reply.prog, 46, "resolves the SECOND program from the tapped tick, not the first");
  const noTick = await previewOne(live, {track: "ch 1 prog 51,46", midi: 64, vel: 100}); // no tick: e.g. a piano-strip key press
  assert.equal(noTick.prog, undefined, "no tick given: no program resolved either (today's behavior)");
});
