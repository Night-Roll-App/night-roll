// Synthetic tests for tools/sounding.mjs — the sounding-pitch offset
// measurement CHIPS.psf/usf.capture applies at capture time (2026-09-28).
// Real-rip verification (Cave Dungeon, Title Theme, Cry of the Planet, Main
// Theme, Dire Dire Docks, Bombing Mission) lives in tests/n64-real.test.mjs
// and tests/psx-real.test.mjs (guarded by N64_USF_DIR / PSX_PSF_DIR).
import test from "node:test";
import assert from "node:assert/strict";
import { soundingOffsets, applySoundingOffsets } from "../tools/sounding.mjs";

const midiToHz = midi => 440 * Math.pow(2, (midi - 69) / 12);
function sineAt(midi, {seconds = 1, sampleRate = 44100} = {}) {
  const hz = midiToHz(midi), n = Math.round(seconds * sampleRate), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin(2 * Math.PI * hz * i / sampleRate);
  return out;
}
function noise(seconds = 1, sampleRate = 44100) { // a small deterministic PRNG — no Math.random in a test
  let seed = 12345, out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF; out[i] = (seed / 0x7FFFFFFF) * 2 - 1; }
  return out;
}

test("soundingOffsets: a sine at key+12 measures +12 (correlation ≥ 0.8)", async () => {
  const groups = [{name: "ch 0 inst 0", kit: false, notes: [{midi: 60, drum: false}, {midi: 60, drum: false}]}];
  const offsets = await soundingOffsets(groups, (g, key) => sineAt(key + 12), {sampleRate: 44100});
  const o = offsets["ch 0 inst 0"];
  assert.equal(o.offset, 12);
  assert.ok(o.corr >= 0.8, "corr " + o.corr);
  assert.equal(o.reason, null);
});

test("soundingOffsets: a sine at key-24 (two octaves down) measures -24", async () => {
  const groups = [{name: "ch 1 inst 4", kit: false, notes: [{midi: 72, drum: false}]}];
  const offsets = await soundingOffsets(groups, (g, key) => sineAt(key - 24), {sampleRate: 44100});
  assert.equal(offsets["ch 1 inst 4"].offset, -24);
});

test("soundingOffsets: a sine exactly at the written key measures offset 0", async () => {
  const groups = [{name: "ch 2 inst 5", kit: false, notes: [{midi: 55, drum: false}]}];
  const offsets = await soundingOffsets(groups, (g, key) => sineAt(key), {sampleRate: 44100});
  assert.equal(offsets["ch 2 inst 5"].offset, 0);
  assert.equal(offsets["ch 2 inst 5"].reason, null); // a clear pitch that agrees, not "unclear"
});

test("soundingOffsets: noise measures offset 0 with a reason (unclear pitch)", async () => {
  const groups = [{name: "ch 3 inst 6", kit: false, notes: [{midi: 50, drum: false}]}];
  const offsets = await soundingOffsets(groups, () => noise(), {sampleRate: 44100});
  const o = offsets["ch 3 inst 6"];
  assert.equal(o.offset, 0);
  assert.ok(o.reason, "expected a reason for an unclear render");
});

test("soundingOffsets: a silent (null) render measures offset 0, reason 'silent'", async () => {
  const groups = [{name: "ch 4 inst 7", kit: false, notes: [{midi: 48, drum: false}]}];
  const offsets = await soundingOffsets(groups, () => null, {sampleRate: 44100});
  assert.equal(offsets["ch 4 inst 7"].offset, 0);
  assert.equal(offsets["ch 4 inst 7"].reason, "silent");
});

test("soundingOffsets: kit groups are never rendered or measured", async () => {
  const groups = [{name: "ch 9 kit", kit: true, notes: [{midi: 38, drum: true}]}];
  const offsets = await soundingOffsets(groups, () => { throw new Error("must not render a kit group"); }, {sampleRate: 44100});
  assert.deepEqual(offsets, {});
});

test("soundingOffsets: a tone with a strong 2nd harmonic at the written key measures offset 0, not +12", async () => {
  // the coordinator's ask (2026-09-28): a bright sample's autocorrelation
  // can peak at HALF the true period (the 2nd harmonic) — a fundamental at
  // key with a LOUDER 2nd harmonic on top must not read as "an octave
  // above what sounds" just because the harmonic's own period correlates
  // cleanly too.
  const sampleRate = 44100;
  function fundamentalPlus2nd(midi, {seconds = 1} = {}) {
    const hz = midiToHz(midi), n = Math.round(seconds * sampleRate), out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = 0.3 * Math.sin(2 * Math.PI * hz * i / sampleRate) + 0.7 * Math.sin(2 * Math.PI * 2 * hz * i / sampleRate);
    return out;
  }
  const groups = [{name: "ch 6 inst 3", kit: false, notes: [{midi: 57, drum: false}]}];
  const offsets = await soundingOffsets(groups, (g, key) => fundamentalPlus2nd(key), {sampleRate});
  const o = offsets["ch 6 inst 3"];
  assert.equal(o.offset, 0, JSON.stringify(o));
});

test("soundingOffsets: a stereo {l, r} render is measured the same as mono", async () => {
  const groups = [{name: "ch 5 inst 2", kit: false, notes: [{midi: 45, drum: false}]}];
  const offsets = await soundingOffsets(groups, (g, key) => { const m = sineAt(key + 12); return {l: m, r: m}; }, {sampleRate: 44100});
  assert.equal(offsets["ch 5 inst 2"].offset, 12);
});

test("soundingOffsets: a PS1-shaped group (n.pitch, not n.midi) picks the median written pitch", async () => {
  const groups = [{name: "ch 1 prog 5", kit: false, notes: [{pitch: 40, drum: false}, {pitch: 60, drum: false}, {pitch: 62, drum: false}]}];
  let askedKey = null;
  const offsets = await soundingOffsets(groups, (g, key) => { askedKey = key; return sineAt(key); }, {sampleRate: 44100});
  assert.equal(askedKey, 60); // the median of [40, 60, 62]
  assert.equal(offsets["ch 1 prog 5"].offset, 0);
});

test("applySoundingOffsets: shifts a shifted group's notes and writes a Josh-legible warning", () => {
  const notes = [{midi: 60}, {midi: 64}];
  const groups = [{name: "ch 0 inst 0", kit: false, notes}];
  const warnings = applySoundingOffsets(groups, {"ch 0 inst 0": {offset: -12}}, "midi");
  assert.equal(notes[0].midi, 48);
  assert.equal(notes[1].midi, 52);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^ch 0 inst 0: written an octave above what sounds — the roll shows the sounding pitch \(-12\)$/);
});

test("applySoundingOffsets: two octaves reads \"two octaves\", a positive offset reads \"below\" with a + sign", () => {
  const notes = [{pitch: 30}];
  const groups = [{name: "ch 2 prog 9", kit: false, notes}];
  const warnings = applySoundingOffsets(groups, {"ch 2 prog 9": {offset: 24}}, "pitch");
  assert.equal(notes[0].pitch, 54);
  assert.match(warnings[0], /written two octaves below what sounds.*\(\+24\)$/);
});

test("applySoundingOffsets: an unshifted or kit group is left alone and gets no warning", () => {
  const kitNotes = [{midi: 38}], flatNotes = [{midi: 61}];
  const groups = [{name: "ch 9 kit", kit: true, notes: kitNotes}, {name: "ch 1 inst 1", kit: false, notes: flatNotes}];
  const warnings = applySoundingOffsets(groups, {"ch 9 kit": {offset: -12}, "ch 1 inst 1": {offset: 0}}, "midi");
  assert.equal(kitNotes[0].midi, 38);
  assert.equal(flatNotes[0].midi, 61);
  assert.equal(warnings.length, 0);
});
