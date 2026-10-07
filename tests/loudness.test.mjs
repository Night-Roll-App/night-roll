// tests/loudness.test.mjs — the loudness model (src/audio/loudness.js) and its
// measuring tool (tools/measure-loudness.mjs): docs/plans/2026-10-07-console-loudness.md.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync, readFileSync } from "node:fs";
import { measureLoudness, loudMix, songGainDb, synthMatchDb, migrateMasterVol, dbToLin, loudFileHash,
  SYNTH_MATCH_DB, LOUD_TARGET, LOUD_PEAK_CAP, LOUD_GAIN_MAX } from "../src/audio/loudness.js";

const sine = (amp, secs, fs = 44100, f = 997) => { const x = new Float32Array(Math.round(secs * fs)); for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * f * i / fs); return x; };

test("measureLoudness: BS.1770 — a 997 Hz sine at amplitude 0.1 on both sides is −20 LUFS, peak −20 dBFS; a mono-panned copy reads 3 dB lower; silence is −∞", () => {
  const x = sine(0.1, 5);
  const m = measureLoudness(x, x, 44100);
  assert.ok(Math.abs(m.lufs - -20) <= 0.2, "lufs " + m.lufs);
  assert.equal(m.peak, -20);
  const half = x.map(v => v * Math.SQRT1_2);
  assert.ok(Math.abs(measureLoudness(half, half, 44100).lufs - -23) <= 0.2);
  assert.equal(measureLoudness(new Float32Array(44100), new Float32Array(44100), 44100).lufs, -Infinity);
  // the rate is the K-weighting's, not the number's: 32 kHz (the SNES/N64 renders) reads the same
  const y = sine(0.1, 5, 32000);
  assert.ok(Math.abs(measureLoudness(y, y, 32000).lufs - -20) <= 0.2);
});

test("measureLoudness: the relative gate — a quiet intro under a loud body does not drag the song down", () => {
  const fs = 44100, loud = sine(0.1, 10, fs), quiet = sine(0.001, 10, fs);
  const both = new Float32Array(loud.length + quiet.length); both.set(quiet); both.set(loud, quiet.length);
  assert.ok(Math.abs(measureLoudness(both, both, fs).lufs - -20) <= 0.3);
});

test("loudMix: a mono track is centred like the app's StereoPanner (0.707 per side), a stereo pair passes through, the lead is trimmed", () => {
  const fs = 10;
  const mono = new Float32Array([0, 0, 1, 1, 1]), st = {l: new Float32Array([0, 0, 0.5, 0.5, 0.5]), r: new Float32Array([0, 0, 0, 0, 0])};
  const {L, R} = loudMix({mono, st}, fs, {lead: 0.2});
  assert.equal(L.length, 3);
  assert.ok(Math.abs(L[0] - (Math.SQRT1_2 + 0.5)) < 1e-6);
  assert.ok(Math.abs(R[0] - Math.SQRT1_2) < 1e-6);
  assert.equal(loudMix({mono}, fs, {secs: 0.3}).L.length, 3, "secs trims the tail");
});

test("songGainDb: to the −16 LUFS target, never past the −1 dBFS peak cap, clamped, 0 without a measurement", () => {
  assert.equal(LOUD_TARGET, -16); assert.equal(LOUD_PEAK_CAP, -1);
  assert.ok(Math.abs(songGainDb({lufs: -24.2, peak: -12.8}) - 8.2) < 1e-9, "the target wins (the peak lands at −4.6)");
  assert.ok(Math.abs(songGainDb({lufs: -24.6, peak: -5}) - 4) < 1e-9, "a hot peak caps the gain: −5 + 4 = −1 dBFS");
  assert.ok(Math.abs(songGainDb({lufs: -12, peak: -2}) - -4) < 1e-9, "a song already louder than the target comes down");
  assert.equal(songGainDb({lufs: -90, peak: -80}), LOUD_GAIN_MAX, "a near-silent render never gets more than the clamp");
  assert.equal(songGainDb(null), 0);
  assert.equal(songGainDb({lufs: -Infinity, peak: -Infinity}), 0);
});

test("synth match: the album's own synth loudness gives exact equal loudness; without it, a per-console constant — NES and GB from the chip's full scale", () => {
  const loud = {lufs: -17.6, peak: -5.8, synth: -10.3};
  const g = songGainDb(loud), m = synthMatchDb("nsf", loud);
  assert.ok(Math.abs((loud.synth + g + m) - (loud.lufs + g)) < 1e-9, "Hear the MIDI lands where the console voice does");
  assert.equal(synthMatchDb("nsf", {lufs: -17.6}), SYNTH_MATCH_DB.nsf);
  for (const k of ["nsf", "gbs", "spc", "psf", "psf2", "usf"]) assert.ok(Number.isFinite(SYNTH_MATCH_DB[k]), "a constant for every console with a renderer: " + k);
  // the derivation, from the renderers' own scale (tools/nsf/apu-render.mjs, tools/gbs/apu-render.mjs)
  // against one full-velocity default synth voice (±0.5 square, voices.js VOICE_AMP)
  const nesPulse = 95.88 / (8128 / 15 + 100) * 2 / 2; // ×2 in the renderer, ± half after the high-pass
  assert.ok(Math.abs(SYNTH_MATCH_DB.nsf - 20 * Math.log10(nesPulse / 0.5)) < 0.05);
  const gbChannel = 0.25 * (8 + 8) / 16;
  assert.ok(Math.abs(SYNTH_MATCH_DB.gbs - 20 * Math.log10(gbChannel / 0.5)) < 0.05);
  assert.equal(synthMatchDb("vgm", {lufs: -20}), 0, "a chip with no renderer has no offset");
});

test("migrateMasterVol: a stored 200% resets to 100% once; a later choice above 100% is left alone; ≤100% is untouched", () => {
  const store = new Map([["ff1roll-mastervol", "2"]]);
  const get = k => store.has(k) ? store.get(k) : null, set = (k, v) => store.set(k, v);
  assert.equal(migrateMasterVol(get, set), true);
  assert.equal(store.get("ff1roll-mastervol"), "1");
  store.set("ff1roll-mastervol", "1.5");
  assert.equal(migrateMasterVol(get, set), false, "once only");
  assert.equal(store.get("ff1roll-mastervol"), "1.5");
  const s2 = new Map([["ff1roll-mastervol", "0.8"]]);
  assert.equal(migrateMasterVol(k => s2.get(k) ?? null, (k, v) => s2.set(k, v)), false);
  assert.equal(s2.get("ff1roll-mastervol"), "0.8");
});

test("loudFileHash: same bytes same key, one byte different a different key", () => {
  const a = new Uint8Array([1, 2, 3, 4]), b = new Uint8Array([1, 2, 3, 5]);
  assert.equal(loudFileHash(a), loudFileHash(new Uint8Array([1, 2, 3, 4])));
  assert.notEqual(loudFileHash(a), loudFileHash(b));
  assert.equal(dbToLin(-6.0206).toFixed(3), "0.500");
});

test("measure-loudness: the tool's module lists are the app's CHIPS lists (the same pipeline the worker loads)", async () => {
  const { LOUD_CHIP_FILES } = await import("../tools/measure-loudness.mjs");
  const src = readFileSync(new URL("../src/audio/chip.js", import.meta.url), "utf8");
  for (const [kind, c] of Object.entries(LOUD_CHIP_FILES)) {
    const m = src.match(new RegExp("\\n  " + kind + ": \\{[\\s\\S]*?\\n        files: (\\[[^\\]]*\\]), shared: (\\[[^\\]]*\\]), own: (\\[[^\\]]*\\])"));
    assert.ok(m, "CHIPS." + kind + " found");
    assert.deepEqual([c.files, c.shared, c.own], [JSON.parse(m[1]), JSON.parse(m[2]), JSON.parse(m[3])], kind);
  }
});

test("measure-loudness --apply's write: only loud, only into a capture album's album.json (never compositions/ or starters/)", async () => {
  const { applyLoudness } = await import("../tools/measure-loudness.mjs");
  assert.throws(() => applyLoudness(new URL("../albums/compositions/nightroll", import.meta.url).pathname, []), /not a capture album/);
  assert.throws(() => applyLoudness(new URL("../albums/starters", import.meta.url).pathname, []), /not a capture album/);
});

// real rip: only when the archive file is actually on this machine (a cached
// download from tools/recapture.mjs / measure-loudness.mjs), never a directory
const FF1 = "/tmp/recap/rips/nes/ff1.nsf";
const haveFF1 = existsSync(FF1) && statSync(FF1).isFile() && statSync(FF1).size > 0;
test("real rip: FF1 Battle's console render measures near the plan's −17.7 LUFS / −5.8 dBFS, and the song gain lands it at the target", {skip: !haveFF1 && "no " + FF1}, async () => {
  const { measureConsole } = await import("../tools/measure-loudness.mjs");
  const album = JSON.parse(readFileSync(new URL("../albums/nes/final-fantasy-i/album.json", import.meta.url), "utf8"));
  const tr = album.nsf.tracks.battle;
  const m = await measureConsole("nsf", new Uint8Array(readFileSync(FF1)), {}, tr.n, Math.ceil(tr.secs + 1));
  assert.ok(m.lufs > -19 && m.lufs < -16.5, "lufs " + m.lufs);
  assert.ok(m.peak > -8 && m.peak < -4, "peak " + m.peak);
  const g = songGainDb(m);
  assert.ok(Math.abs(m.lufs + g - LOUD_TARGET) < 1e-9 && m.peak + g <= LOUD_PEAK_CAP + 1e-9);
});
