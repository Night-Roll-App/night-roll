// The instrument library (tools/instruments): a synthetic PlayStation rip
// (an AKAO sample set + a layout-3 score, built with the repo's own test
// builders) goes through extract → names → play and is held against the
// driver's renderer; the envelope samplers against the N64 engines' own
// classes; the WAV writer round-trips; the naming rules and the library's
// merge rules on made-up facts. With the rips in /tmp/claude-501/rips (or
// INSTRUMENT_RIPS) the five reference songs are checked too; CI has none
// and skips those.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestAKAO, makeTestSampleSet, encodeAdpcm, sine, makeExe, makePSF } from "../tools/psx/make-test-seq.mjs";
import { Adsr, OotAdsr, UPDATES_PER_SECOND, OOT_UPDATES_PER_SECOND } from "../tools/n64/render.mjs";
import { envelopeGain } from "../tools/n64/rare.mjs";
import { Library, simplify, levelAt, wavBytes, readWav, summarize, FORMAT } from "../tools/instruments/model.mjs";
import { sm64Envelope, ootEnvelope, rareEnvelope } from "../tools/instruments/n64.mjs";
import { spuEnvelope } from "../tools/instruments/psx.mjs";
import { extractAlbum, writeAlbum, summary } from "../tools/instruments/extract.mjs";
import { playNote, regionFor, envLevel } from "../tools/instruments/play.mjs";
import { label } from "../tools/instruments/name.mjs";
import { verifySong } from "../tools/instruments/verify.mjs";

const N = (deg, i) => deg * 11 + i; // AKAO note: degree × 11 + length index (1 = half, 3 = eighth)
function noise(n, seed = 5) { const s = new Int16Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7FFFFFFF; s[i] = (x % 56000) - 28000; } return s; }

// one .psf: a sample set (art 0: a looped C4 sine, held; art 1: the same at ×1.5;
// art 2: a short one-shot noise) and a layout-3 score naming it
function syntheticRip() {
  const dir = mkdtempSync(join(tmpdir(), "nr-instr-"));
  const sineAdpcm = encodeAdpcm(sine(261.63, 6748));
  const noiseAdpcm = encodeAdpcm(noise(2800), {loop: false});
  const set = makeTestSampleSet({id: 7, dest: 0x20000, arts: [
    {adpcm: sineAdpcm, unity: 60},
    {adpcm: sineAdpcm, unity: 60, fine: 0x4000},
    {adpcm: noiseAdpcm, unity: 60, adsr1: 0x00F0, adsr2: 0x5FC0}]});
  const hits = []; for (let i = 0; i < 12; i++) hits.push(N(0, 3));
  const akao = makeTestAKAO({layout: 3, sampleSetId: 7, voices: {
    0: [0xFE, 0x00, 0x00, 0x40, 0xA5, 4, 0xA1, 0, N(0, 1), 0xA5, 5, N(0, 1), N(4, 1), 0xA1, 1, 0xA5, 4, N(0, 1), 0xA0],
    1: [0xA5, 5, 0xA1, 2, ...hits, 0xA0]}});
  const text = new Uint8Array(0x10000);
  text.set(akao, 0x100); text.set(set, 0x8000);
  writeFileSync(join(dir, "01 Synthetic Tune.psf"), makePSF(makeExe({textStart: 0x80010000, text}), {title: "Synthetic Tune", game: "Test Game"}));
  return dir;
}

test("a synthetic PS1 rip: every played articulation extracted, tuned, sampled once, named, and played back as the driver plays it", async () => {
  const dir = syntheticRip();
  try {
    const lib = await extractAlbum(dir, {slug: "test-game"});
    const used = lib.instruments.filter(i => i.used).map(i => i.id).sort();
    assert.deepEqual(used, ["akao:set7:0", "akao:set7:1", "akao:set7:2"]);
    const a0 = lib.instruments.find(i => i.id === "akao:set7:0"), a1 = lib.instruments.find(i => i.id === "akao:set7:1"), a2 = lib.instruments.find(i => i.id === "akao:set7:2");
    assert.equal(a0.keyRegions.length, 1);
    assert.equal(a0.keyRegions[0].rootKey, 60, "unity 60, no fine tune: the sample's own pitch is key 60");
    assert.ok(Math.abs(a1.keyRegions[0].rootKey - (60 - 12 * Math.log2(1.5))) < 1e-3, "fine 0x4000 = ×1.5 moves the root down a fifth: " + a1.keyRegions[0].rootKey);
    assert.equal(a0.keyRegions[0].sample, a1.keyRegions[0].sample, "one sample, two instruments: stored once");
    assert.equal(Object.keys(lib.samples).length, 2);
    assert.ok(a0.keyRegions[0].loop && a0.keyRegions[0].loop.end > a0.keyRegions[0].loop.start, "the sine loops");
    assert.equal(a2.keyRegions[0].loop, null, "the noise is one-shot");
    assert.deepEqual(a0.usedIn, ["Synthetic Tune"]);
    assert.deepEqual(a0.keysPlayed, {lo: 48, hi: 64, median: 60});
    assert.equal(a2.noteCount, 12);
    assert.equal(a0.velocityCurve, "linear"); assert.equal(a0.gain, 0.5);
    assert.equal(a0.envelope.raw.kind, "spu-adsr"); assert.equal(a0.envelope.sustain, 1, "sr 0x7f holds");
    // names: a guess from the numbers, kept beside them
    assert.ok(typeof a0.nameGuess === "string" && a0.features && a0.features.measured);
    assert.ok(["Kick", "Snare", "Hi-hat", "Cymbal", "Tom", "Mallet", "Noise/FX"].includes(a2.nameGuess.replace(/ \d+$/, "")), "the one-key noise hit is named as percussion: " + a2.nameGuess);
    assert.ok(!["Kick", "Snare", "Hi-hat", "Cymbal", "Noise/FX"].includes(a0.nameGuess.replace(/ \d+$/, "")), "the held sine is pitched: " + a0.nameGuess);
    assert.ok(a0.features.harmonicity > 0.95 && a2.features.harmonicity < a0.features.harmonicity);
    // the files: instruments.json + one WAV per sample, loop and root in the smpl chunk
    const out = mkdtempSync(join(tmpdir(), "nr-instr-out-"));
    const w = writeAlbum(lib, out);
    const doc = JSON.parse(readFileSync(join(w.dir, "instruments.json"), "utf8"));
    assert.equal(doc.format, FORMAT); assert.equal(doc.slug, "test-game"); assert.equal(doc.songs, 1);
    for (const inst of doc.instruments) {
      for (const k of ["id", "driver", "kind", "used", "usedIn", "keysPlayed", "nameGuess", "features", "envelope", "keyRegions", "raw", "gain", "velocityCurve"]) assert.ok(k in inst, "instrument field " + k);
      for (const k of ["attack", "decay", "sustain", "release", "points", "releaseCurve", "raw"]) assert.ok(k in inst.envelope, "envelope field " + k);
      for (const r of inst.keyRegions) assert.ok(existsSync(join(w.dir, r.sample + ".wav")), "each region's sample is a file");
    }
    const h = a0.keyRegions[0].sample, wav = readWav(readFileSync(join(w.dir, h + ".wav")));
    assert.equal(wav.rate, 44100); assert.deepEqual(wav.loop, lib.samples[h].loop); assert.equal(wav.rootKey, 60);
    assert.deepEqual([...wav.pcm], [...lib.samples[h]._i16]);
    assert.equal(doc.samples[h].bytes, readFileSync(join(w.dir, h + ".wav")).length);
    rmSync(out, {recursive: true, force: true});
    // the library's note against renderSpu's, note for note
    const {rows} = await verifySong(dir, /Synthetic/);
    assert.ok(rows.length >= 4, "notes checked: " + rows.length);
    for (const r of rows) {
      assert.ok(!r.error, r.group + ": " + r.error);
      assert.ok(Math.abs(r.pitch) <= 5, `${r.group} pitch ${r.pitch} cents`);
      assert.ok(r.shape > 0.95, `${r.group} shape ${r.shape}`);
      assert.ok(Math.abs(r.level) <= 1, `${r.group} level ${r.level} dB`);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("envelopes: the neutral points follow each engine's own ADSR", () => {
  // sm64: Adsr per update, amplitude (level × 4.3498e-5)² at full velocity, reached one update late
  const pairs = [[2, 32700], [60, 16000], [120, 8000], [-1, 0]];
  const e = sm64Envelope(pairs, 0x20);
  const adsr = new Adsr(pairs);
  for (let k = 0; k < 240; k++) {
    const lv = adsr.update(), amp = Math.min(32767, 127 * 127 * (lv * 4.3498e-5) ** 2) / 32767;
    const t = (k + 1) / UPDATES_PER_SECOND;
    assert.ok(Math.abs(levelAt(e.points, t) - amp) <= Math.max(0.0021, 0.021 * amp), `sm64 at update ${k}: ${levelAt(e.points, t)} vs ${amp}`);
  }
  assert.equal(e.releaseCurve.mode, "follow");
  // a goto loop repeats
  const looped = sm64Envelope([[10, 32000], [10, 10000], [-2, 0]], 0x20);
  assert.ok(looped.repeat && looped.repeat.to > looped.repeat.from, "goto: " + JSON.stringify(looped.repeat));
  // oot: OotAdsr at 180 updates/s, its float level as the amplitude
  const op = [[1, 32000], [50, 20000], [-1, 0]], oe = ootEnvelope(op, 0xF0), oa = new OotAdsr(op);
  for (let k = 0; k < 180; k++) { const a = oa.update(); assert.ok(Math.abs(levelAt(oe.points, (k + 1) / OOT_UPDATES_PER_SECOND) - a) <= Math.max(0.0021, 0.021 * a), "oot update " + k); }
  // Rare: envelopeGain's exponential ramps, sample k at t = k / rate; release by time
  const env = {attackTime: 0, decayTime: 300000, releaseTime: 50000, attackVolume: 127, decayVolume: 20};
  const re = rareEnvelope(env), buf = new Float32Array(2000 * 3);
  envelopeGain(env, 2000, 4000, buf);
  for (const k of [0, 10, 100, 300, 599, 1000, 3999]) assert.ok(Math.abs(levelAt(re.points, k / 2000) - buf[k]) <= Math.max(0.0021, 0.021 * buf[k]), `rare at ${k}: ${levelAt(re.points, k / 2000)} vs ${buf[k]}`);
  assert.deepEqual([re.releaseCurve.mode, re.releaseCurve.seconds], ["exp-time", 0.05]);
  // PS1: a held sustain vs a falling one (FF7's bell: sr 0x3b, exponential decrease)
  const hold = spuEnvelope({ar: 0, am: 1, dr: 15, sl: 15, sr: 0x7F, sm: 3, rr: 5, rm: 1});
  const bell = spuEnvelope({ar: 0, am: 1, dr: 15, sl: 15, sr: 0x3B, sm: 3, rr: 5, rm: 1});
  assert.equal(hold.sustain, 1);
  // spu-render's exponential decrease rounds its step to 0 near 10% and holds there: the extraction keeps what the renderer plays
  assert.ok(bell.sustain < 0.15, "the bell falls: " + bell.sustain);
  assert.ok(levelAt(bell.points, 2.5) > 0.05 && levelAt(bell.points, 2.5) < 0.25, "the bell's 2.5 s level matches instr.mjs envelopeAt's range");
});

test("simplify keeps an exponential tail within 2% of its level; summarize reads A/D/S/R off the points", () => {
  const pts = []; for (let i = 0; i <= 4000; i++) pts.push([i / 1000, Math.exp(-i / 400)]);
  const s = simplify(pts);
  assert.ok(s.length < 200, "few points: " + s.length);
  for (const [t, l] of pts) assert.ok(Math.abs(levelAt(s, t) - l) <= Math.max(0.0021, 0.021 * l), `t ${t}: ${levelAt(s, t)} vs ${l}`);
  const sum = summarize([[0, 0], [0.01, 1], [0.21, 0.5], [2, 0.5]], {mode: "follow", points: [[0, 1], [0.3, 0]]});
  assert.deepEqual(sum, {attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3});
});

test("playNote: the region for the key, 2^((key − root)/12), the loop, the release from the held level", () => {
  const rate = 8000, n = 800, pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.sin(2 * Math.PI * 100 * i / rate); // 100 Hz, 80 samples a period: loops whole
  const samples = {s: {rate, pcm, loop: {start: 0, end: n}}};
  const inst = {kind: "melodic", gain: 1, velocityCurve: "linear", envelope: {points: [[0, 1]], repeat: null, releaseCurve: {mode: "follow", points: [[0, 1], [0.1, 0]]}},
    keyRegions: [{keyLo: 0, keyHi: 59, rootKey: 43, sample: "s"}, {keyLo: 60, keyHi: 127, rootKey: 55, sample: "s"}]};
  assert.equal(regionFor(inst, 50).rootKey, 43); assert.equal(regionFor(inst, 70).rootKey, 55);
  const x = playNote(inst, samples, {key: 67, vel: 127, hold: 1, sampleRate: rate});
  let zc = 0; for (let i = 1001; i < 7000; i++) if (x[i - 1] < 0 && x[i] >= 0) zc++;
  assert.ok(Math.abs(zc / (6000 / rate) - 200) < 3, "an octave above the root: " + zc / 0.75 + " Hz");
  assert.ok(x.length >= rate * 1.1 - 1 && Math.abs(x[Math.floor(rate * 1.12)] || 0) < 1e-6, "silent after the release curve");
  const half = playNote({...inst, velocityCurve: "square"}, samples, {key: 55, vel: 64, hold: 0.5, sampleRate: rate});
  let pk = 0; for (const v of half.subarray(0, 3000)) pk = Math.max(pk, Math.abs(v));
  assert.ok(Math.abs(pk - (64 / 127) ** 2) < 0.01, "square velocity: " + pk);
  assert.equal(envLevel([[0, 0], [1, 1]], 0.25), 0.25);
  assert.equal(envLevel([[0, 1], [1, 0.5], [2, 1]], 5, {from: 1, to: 2}), 0.5, "a repeat window wraps");
});

test("names: the rules on made-up measurements", () => {
  const base = {measured: true, attack: 0.005, t20: null, sustain: 1, centroid: 1000, brightness: 3, harmonicity: 0.99, flatness: 0.001, keyMedian: 64, keyHi: 72, medianNote: 0.5, release: 0.05, loopSeconds: 0.2, kit: false};
  assert.equal(label({...base, kit: true, centroid: 90, t20: 0.1, sustain: 0}), "Kick");
  assert.equal(label({...base, harmonicity: 0.2, flatness: 0.4, centroid: 7000, t20: 0.05, sustain: 0}), "Hi-hat");
  assert.equal(label({...base, harmonicity: 0.2, flatness: 0.4, centroid: 6000, t20: 0.9, sustain: 0.1}), "Cymbal");
  assert.equal(label({...base, harmonicity: 0.3, flatness: 0.2, centroid: 2500, t20: 0.2, sustain: 0}), "Snare");
  assert.equal(label({...base, kit: true, centroid: 400, t20: 0.2, sustain: 0}), "Tom");
  assert.equal(label({...base, harmonicity: 0.2, flatness: 0.5, sustain: 0.9}), "Noise/FX");
  assert.equal(label({...base, keyMedian: 36, keyHi: 48, sustain: 0.1, t20: 0.3}), "Plucked bass");
  assert.equal(label({...base, keyMedian: 36, keyHi: 48}), "Synth bass");
  assert.equal(label({...base, sustain: 0.1, t20: 0.15}), "Pluck");
  assert.equal(label({...base, sustain: 0.1, t20: 1.5, harmonicity: 0.7}), "Bell");
  assert.equal(label({...base, sustain: 0.1, t20: 0.5, brightness: 2}), "Mallet");
  assert.equal(label({...base, sustain: 0.1, t20: 0.5, brightness: 5}), "Piano-like");
  assert.equal(label({...base, attack: 0.2, brightness: 2}), "Soft pad");
  assert.equal(label({...base, attack: 0.2, brightness: 8}), "String pad");
  assert.equal(label({...base, attack: 0.2, brightness: 4, harmonicity: 0.85}), "Choir-like");
  assert.equal(label({...base, loopSeconds: 0.01}), "Organ-like");
  assert.equal(label({...base, medianNote: 0.2, brightness: 7}), "Brass stab");
  assert.equal(label(base), "Lead");
  assert.equal(label({...base, keyMedian: 84, keyHi: 96}), "High lead");
  assert.equal(label({...base, keyMedian: 46, keyHi: 70, attack: 0.2, brightness: 2}), "Low soft pad");
});

test("the library: one id per driver slot; a reloaded slot gets its own; an incomplete copy yields to the whole one", () => {
  const lib = new Library({slug: "x"});
  const inst = (extra = {}) => ({id: "d:b1:p3", driver: "d", kind: "melodic", keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 60, src: "s"}], envelope: {}, ...extra});
  const a = lib.addInstrument(inst(), "aaaa");
  assert.equal(lib.addInstrument(inst(), "aaaa"), a, "same record: same instrument");
  const b = lib.addInstrument(inst(), "bbbb");
  assert.equal(b.id, "d:b1:p3~bbbb", "another record in the slot: a second instrument"); assert.equal(lib.collisions, 1);
  const lib2 = new Library();
  const part = lib2.addInstrument(inst({raw: "partial"}), "p", 0.5);
  const whole = lib2.addInstrument(inst({raw: "whole"}), "w", 1);
  assert.equal(part, whole); assert.equal(whole.raw, "whole"); assert.equal(lib2.inst.size, 1);
  lib2.offerSample("s", () => ({pcm: new Float32Array([0, 0, 0]), rate: 32000, loop: null}), 0.3);
  lib2.offerSample("s", () => ({pcm: new Float32Array([0.5, -0.5, 0.25]), rate: 32000, loop: null}), 1);
  lib2.use(whole, "Song", [{key: 60, secs: 1, vel: 100}]);
  lib2.finish();
  const h = whole.keyRegions[0].sample;
  assert.equal(lib2.samples[h]._i16[0], 16384, "the whole copy of the sample won");
  const doc = lib2.toJSON();
  assert.ok(!("_sig" in doc.instruments[0]) && !("_i16" in doc.samples[h]), "helper fields stay out of the file");
});

test("WAV: 16-bit mono, the loop and a fractional root in the smpl chunk", () => {
  const pcm = Int16Array.from([0, 1000, -1000, 32767, -32768, 5]);
  const b = wavBytes(pcm, 22050, {loop: {start: 2, end: 6}, rootKey: 58.91});
  const w = readWav(b);
  assert.equal(w.rate, 22050); assert.deepEqual([...w.pcm], [...pcm]); assert.deepEqual(w.loop, {start: 2, end: 6});
  assert.ok(Math.abs(w.rootKey - 58.91) < 1e-6);
  assert.equal(readWav(wavBytes(pcm, 44100)).loop, null);
});

// ---- the real rips -------------------------------------------------------------------
const RIPS = process.env.INSTRUMENT_RIPS || "/tmp/claude-501/rips";
const REF = [["ff7", /102b Bombing/], ["final-fantasy-ix", /105 Vivi/], ["sm64", /09a Dire, Dire Docks/], ["oot", /06 Kokiri/], ["n64-ge", /101 Dam/]];
for (const [dir, re] of REF) {
  test(`real rip ${dir} ${re.source}: the library plays its notes as the driver does (5 cents, shape 0.95, 1 dB)`, {skip: !existsSync(join(RIPS, dir)) && "no rip at " + join(RIPS, dir)}, async () => {
    const {rows} = await verifySong(join(RIPS, dir), re);
    assert.ok(rows.length >= 2);
    for (const r of rows) {
      assert.ok(!r.error, r.group + ": " + r.error);
      assert.ok(Math.abs(r.pitch) <= 5 && r.shape > 0.95 && Math.abs(r.level) <= 1, `${r.id} key ${r.key} hold ${r.hold}: pitch ${r.pitch} shape ${r.shape} level ${r.level}`);
    }
  });
}
test("real rip sm64: every played instrument is in the library with its samples", {skip: !existsSync(join(RIPS, "sm64")) && "no rip"}, async () => {
  const lib = await extractAlbum(join(RIPS, "sm64"), {slug: "sm64"});
  const s = summary(lib);
  assert.equal(s.skipped, 0);
  assert.ok(s.used >= 150, "used instruments: " + s.used);
  for (const i of lib.instruments.filter(x => x.used)) assert.ok(i.keyRegions.some(r => r.sample), i.id + " has a playable region");
  const ddd = lib.instruments.filter(i => i.usedIn.includes("Dire, Dire Docks")).map(i => i.id);
  assert.ok(ddd.includes("ead-sm64:bank19:inst14"), "used in: " + ddd.join(", "));
});
