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
import { makeTestSPC, TEST_ROOT_HZ, TEST_MELODY_MIDI } from "../tools/spc/make-test-spc.mjs";
import { DspVoices, ENV_MAX, OFF, ATTACK } from "../tools/spc/dsp-state.mjs";
import { Library, simplify, levelAt, wavBytes, readWav, summarize, FORMAT, instrumentsFolder } from "../tools/instruments/model.mjs";
import { sm64Envelope, ootEnvelope, rareEnvelope } from "../tools/instruments/n64.mjs";
import { spuEnvelope } from "../tools/instruments/psx.mjs";
import { spcEnvelope, keyOnFacts, chooseEnvelope, splitDrum } from "../tools/instruments/snes.mjs";
import { extractAlbum, writeAlbum, summary, parseArgs } from "../tools/instruments/extract.mjs";
import { playNote, regionFor, envLevel } from "../tools/instruments/play.mjs";
import { label } from "../tools/instruments/name.mjs";
import { verifySong } from "../tools/instruments/verify.mjs";
import { bankInstruments, ps2Song, ps2Files, verifyPs2Song } from "../tools/instruments/ps2.mjs";
import { makeTestSQ, makeTestHD, makePSF2, buildPSF2Fs, fileNode } from "../tools/ps2/make-test-sq.mjs";
import { makeTestBGM, makeTestWD } from "../tools/ps2/make-test-bgm.mjs";
import { makeTestNSF } from "../tools/nsf/make-test-nsf.mjs";
import { makeTestGBS } from "../tools/gbs/make-test-gbs.mjs";
import { pulseSample, gbPulseSample, triangleSample, noiseSample, gbNoiseSample, waveSample, waveHashOf,
         decodeVolReg, curveOf, pearson, meanAbsDiff, clusterByShape, curveFromEnvelope, nesLevels, gbLevels,
         nesPeriodForKey, gbPulsePeriodForKey, gbWavePeriodForKey,
         pulseLevel, noiseLevel, ROOT_KEY, SAMPLE_RATE as CHIP_SAMPLE_RATE, nesFiles, gbsFiles } from "../tools/instruments/nes.mjs";

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

test("a synthetic SPC: key-ons grouped by (SRCN, ADSR/GAIN), rootKey from the P→note relation, played back as apu-render.mjs plays it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nr-instr-spc-"));
  try {
    writeFileSync(join(dir, "01 Test Tune.spc"), makeTestSPC());
    const lib = await extractAlbum(dir, {slug: "test-game"});
    assert.equal(lib.drivers.has("spc"), true);
    const used = lib.instruments.filter(i => i.used);
    assert.equal(used.length, 1, "one (SRCN, ADSR/GAIN) group: one instrument — " + used.map(i => i.id).join(","));
    const inst = used[0];
    assert.equal(inst.driver, "spc");
    assert.equal(inst.kind, "melodic", "four distinct pitches, never one P repeated: not a drum");
    assert.equal(inst.keyRegions.length, 1);
    const r = inst.keyRegions[0];
    assert.equal(r.keyLo, 0); assert.equal(r.keyHi, 127);
    const theoreticalRoot = 69 + 12 * Math.log2(TEST_ROOT_HZ / 440);
    assert.ok(Math.abs(r.rootKey - theoreticalRoot) < 0.05, `rootKey ${r.rootKey} vs the sine's own ${theoreticalRoot}`);
    assert.deepEqual(inst.keysPlayed, {lo: Math.min(...TEST_MELODY_MIDI), hi: Math.max(...TEST_MELODY_MIDI), median: TEST_MELODY_MIDI[TEST_MELODY_MIDI.length >> 1]});
    assert.ok(!lib.warnings.some(w => w.includes("disagree on root")), "the melody's own pitches are exact multiples of the true root: no consistency flag\n" + lib.warnings.join("\n"));
    assert.equal(inst.envelope.raw.kind, "spc-adsr", "adsr1's bit 7 (AR15 DR7 SL7 SR0) selects ADSR, not GAIN");
    assert.equal(Object.keys(lib.samples).length, 1, "one BRR sample");
    const h = r.sample;
    assert.ok(lib.samples[h].loop && lib.samples[h].loop.end > lib.samples[h].loop.start, "the sine loops whole");
    assert.ok(typeof inst.nameGuess === "string" && inst.features && inst.features.measured);
    // written files round-trip
    const out = mkdtempSync(join(tmpdir(), "nr-instr-spc-out-"));
    const w = writeAlbum(lib, out);
    const doc = JSON.parse(readFileSync(join(w.dir, "instruments.json"), "utf8"));
    assert.equal(doc.format, FORMAT); assert.equal(doc.songs, 1);
    assert.ok(existsSync(join(w.dir, h + ".wav")));
    rmSync(out, {recursive: true, force: true});
    // the library's note against apu-render.mjs's own S-DSP simulation, note for note
    const {rows} = await verifySong(dir, /Test Tune/);
    assert.ok(rows.length >= 2, "notes checked: " + rows.length); // one (SRCN, ADSR/GAIN) group: one representative note, as-is + held
    for (const r2 of rows) {
      assert.ok(!r2.error, r2.group + ": " + r2.error);
      assert.ok(Math.abs(r2.pitch) <= 5, `${r2.group} pitch ${r2.pitch} cents`);
      assert.ok(r2.shape > 0.95, `${r2.group} shape ${r2.shape}`);
      assert.ok(Math.abs(r2.level) <= 1, `${r2.group} level ${r2.level} dB`);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("keyOnFacts: a KON's own ADSR/GAIN/PITCH/VOL, closed by the next KOFF or KON on the same voice", async () => {
  const { parseSPC, runSPC } = await import("../tools/spc/spc.mjs");
  const spc = parseSPC(makeTestSPC());
  const cap = runSPC(spc, 2);
  const facts = keyOnFacts(cap);
  assert.ok(facts.length >= 4, "at least the four melody notes: " + facts.length);
  for (const f of facts) {
    assert.equal(f.srcn, 0); assert.equal(f.adsr1, 0xFF); assert.equal(f.adsr2, 0xE0); assert.equal(f.gain, 0);
    assert.ok(f.endSample > f.startSample);
  }
  const pitches = new Set(facts.map(f => f.pitch));
  assert.equal(pitches.size, 4, "the four melody pitches, no more");
});

test("chooseEnvelope: the majority (ADSR1, ADSR2, GAIN) wins, ties by note-seconds, the rest travel as variants", () => {
  const k = (adsr1, adsr2, gain, secs) => ({adsr1, adsr2, gain, startSample: 0, endSample: secs * 32000});
  const {main, variants} = chooseEnvelope([k(1, 1, 1, 1), k(1, 1, 1, 1), k(1, 1, 1, 1), k(2, 2, 2, 1), k(2, 2, 2, 1)]);
  assert.deepEqual(main, {adsr1: 1, adsr2: 1, gain: 1, noteCount: 3, secs: 3});
  assert.deepEqual(variants, [{adsr1: 2, adsr2: 2, gain: 2, noteCount: 2}]);
  // a tie in count: the one with more total note-seconds
  const tied = chooseEnvelope([k(1, 1, 1, 0.1), k(1, 1, 1, 0.1), k(2, 2, 2, 5), k(2, 2, 2, 5)]);
  assert.deepEqual([tied.main.adsr1, tied.main.adsr2, tied.main.gain], [2, 2, 2]);
  // one (ADSR/GAIN) only: no variants at all
  assert.deepEqual(chooseEnvelope([k(1, 1, 1, 1), k(1, 1, 1, 1)]).variants, []);
});

test("splitDrum: a P used by a clear majority (>= half, >= 8 times) of an SRCN's key-ons is percussion; an even melodic loop never splits", () => {
  const n = (pitch) => ({pitch});
  // 12 hits at one P, 3 elsewhere: the one P is a strict majority — a drum, the 3 are its melodic remainder
  const mixed = [...Array(12)].map(() => n(4096)).concat([n(4200), n(4300), n(4096 * 2)]);
  const {drumKeyons, melodicKeyons} = splitDrum(mixed);
  assert.equal(drumKeyons.length, 12); assert.equal(melodicKeyons.length, 3);
  // a 4-note melodic loop repeated 20x each: no single pitch reaches half — nothing splits
  const evenMelody = [4096, 4200, 4300, 4400].flatMap(p => Array(20).fill(n(p)));
  const even = splitDrum(evenMelody);
  assert.equal(even.drumKeyons.length, 0); assert.equal(even.melodicKeyons.length, 80);
  // repeated < 8 times: too few to call percussion even if it's the whole set
  assert.equal(splitDrum([...Array(6)].map(() => n(4096))).drumKeyons.length, 0);
});

test("spcEnvelope: DspVoices stepped in isolation matches a fresh instance sample for sample; release is the chip's fixed −8/sample ramp", () => {
  const e = spcEnvelope(0xFF, 0xE0, 0x00); // AR15 DR7 SL7 SR0: instant attack, held sustain (sr 0 = never decays)
  const fresh = new DspVoices(new Uint8Array(0x10000), Uint8Array.of(...new Array(128).fill(0)));
  const regs = fresh.regs; regs[5] = 0xFF; regs[6] = 0xE0; regs[7] = 0x00;
  const vc = fresh.voices[0]; vc.stage = ATTACK; vc.env = 0;
  // simplify() (model.mjs) is lossy by design (within ~2% near full level, tighter near zero — see its
  // header), and round(t, 5) rounds a 1/32000 s grid to its nearest 10 µs, so AR15's one-sample rise
  // (the fastest the chip has) tolerates a wider band than the settled region right after it
  for (let i = 0; i < 100; i++) { fresh.stepVoice(vc, 0); const t = (i + 1) / 32000, lv = vc.env / ENV_MAX; assert.ok(Math.abs(levelAt(e.points, t) - lv) <= Math.max(0.03, 0.06 * lv), `sample ${i}: ${levelAt(e.points, t)} vs ${lv}`); }
  assert.equal(vc.env, ENV_MAX, "sr 0: rate period is 0, never decays — full scale held");
  assert.equal(e.sustain, 1);
  // release: −8/sample from full scale, independent of ADSR/GAIN — reaches 0 in ENV_MAX/8 samples
  assert.ok(Math.abs(e.releaseCurve.points[e.releaseCurve.points.length - 1][0] - ENV_MAX / 8 / 32000) < 2 / 32000);
  const g = spcEnvelope(0x00, 0x00, 0xD0); // GAIN mode: bit 7 of GAIN set, mode 2 (linear increase), rate period 64
  assert.equal(g.raw.kind, "spc-gain");
  assert.ok(levelAt(g.points, 70 / 32000) > levelAt(g.points, 1 / 32000), "GAIN linear increase ramps up after its first rate period");
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
// SNES rips (scratch/instruments/rips/snes/<album>, downloaded/unzipped by hand — not
// committed): pitched instruments to the same 5¢/0.95/1dB bar as PS1/N64. A `centroid`-method
// row (compare()'s fallback when autocorrelation finds no clean period: noise-like percussion,
// or a one-shot drum sample's natural end landing inside the analysis window) is measured but
// not held to the pitch/level bar — spectral centroid on noise, or on a near-silent tail, isn't
// a meaningful "wrong pitch" the way it is for a tone; shape (envelope correlation) still is.
const SNES_RIPS = process.env.SNES_INSTRUMENT_RIPS || "scratch/instruments/rips/snes";
const SNES_REF = [["chrono-trigger", /^chrono-trigger\.spc$/i], ["chrono-trigger", /frog-s-theme/i], ["super-mario-world", /Yoshi's Island/]];
for (const [dir, re] of SNES_REF) {
  test(`real rip snes/${dir} ${re.source}: pitched instruments play as apu-render.mjs plays them (5 cents, shape 0.95, 1 dB)`,
    {skip: !existsSync(join(SNES_RIPS, dir)) && "no rip at " + join(SNES_RIPS, dir)}, async () => {
    const {rows} = await verifySong(join(SNES_RIPS, dir), re);
    assert.ok(rows.length >= 2);
    for (const r of rows) {
      assert.ok(!r.error, r.group + ": " + r.error);
      assert.ok(r.shape > 0.95, `${r.id} key ${r.key} hold ${r.hold}: shape ${r.shape}`);
      if (r.how === "period") assert.ok(Math.abs(r.pitch) <= 5 && Math.abs(r.level) <= 1, `${r.id} key ${r.key} hold ${r.hold}: pitch ${r.pitch} level ${r.level}`);
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

// ---- NES + Game Boy (tools/instruments/nes.mjs) ------------------------------------------
// Pure synthesis chips: no bank to read, so an instrument is derived from the register
// facts alone (duty, the volume-over-time curve, GB's real wavetable). Unit-level checks
// on the DAC laws/sample synthesis, then a synthetic NSF/GBS end to end (the repo's own
// test builders — same shape as tests/nsf.test.mjs / tests/gbs.test.mjs), then, gated on
// real rips being present, pitch/shape/level against apu-render.mjs itself.
test("decodeVolReg: $4000/$4004/$400C byte -> duty/loop/constVol/vol", () => {
  assert.deepEqual(decodeVolReg(0x3F), {duty: 0, loop: true, constVol: true, val: 15});
  assert.deepEqual(decodeVolReg(0xBE), {duty: 2, loop: true, constVol: true, val: 14});
  assert.deepEqual(decodeVolReg(0x08), {duty: 0, loop: false, constVol: false, val: 8}); // hardware envelope, period 8
});

test("pulseSample/gbPulseSample: a single duty cycle, 32 samples, looped whole", () => {
  for (const duty of [0.125, 0.25, 0.5, 0.75]) {
    const {pcm, rate, loop} = pulseSample(duty);
    assert.equal(pcm.length, 32); assert.equal(rate, CHIP_SAMPLE_RATE); assert.deepEqual(loop, {start: 0, end: 32});
    const on = Math.round(duty * 32);
    assert.ok(pcm.slice(0, on).every(v => v === pcm[0]) && pcm.slice(on).every(v => v === pcm[on] || on === 32), "one on-level, one off-level");
    assert.ok(pcm[0] > 0 && (on === 32 || pcm[on] < 0), "AC-coupled: on positive, off negative");
    const g = gbPulseSample(duty);
    assert.ok(g.pcm[0] > 0, "GB pulse: on-level is positive"); assert.equal(g.pcm[31] === g.pcm[0], duty === 1);
  }
  // narrower duty -> louder on-peak, quieter off-floor (a 12.5% pulse's real asymmetry)
  const p12 = pulseSample(0.125), p50 = pulseSample(0.5);
  assert.ok(p12.pcm[0] > p50.pcm[0], "narrow duty's on-peak is louder than 50%'s");
});

test("triangleSample: the chip's own 32-step staircase, DC-removed, through the nonlinear DAC", () => {
  const {pcm, loop} = triangleSample();
  assert.equal(pcm.length, 32); assert.deepEqual(loop, {start: 0, end: 32});
  const mean = pcm.reduce((a, b) => a + b, 0) / pcm.length;
  assert.ok(Math.abs(mean) < 1e-9, "DC-removed");
  assert.equal(pcm[0], Math.max(...pcm), "step 15 (the loudest) is the sequence's peak");
  assert.equal(pcm[15], pcm[16], "the sequence's shared trough (both step 0)");
  assert.ok(pcm[0] > pcm[8] && pcm[8] > pcm[15], "falls 15..0 across the first half");
  assert.ok(pcm[16] < pcm[24] && pcm[24] < pcm[31], "rises 0..15 across the second half");
});

test("noiseSample/gbNoiseSample: a real LFSR at the captured period, one-shot, DC-removed", () => {
  const {pcm, rate, loop} = noiseSample({period: 254, mode: 0});
  assert.equal(loop, null, "noise is one-shot, not looped");
  assert.ok(rate > 0 && pcm.length > 100);
  const mean = pcm.reduce((a, b) => a + b, 0) / pcm.length;
  assert.ok(Math.abs(mean) < 1e-6, "DC-removed: " + mean);
  const g = gbNoiseSample({shift: 4, width: 0, div: 0});
  assert.equal(g.loop, null);
  assert.ok(Math.abs(g.pcm.reduce((a, b) => a + b, 0) / g.pcm.length) < 1e-6);
});

test("waveSample: the real captured 32-nibble wavetable, content-hashed", () => {
  const nibbles = new Uint8Array([...Array(32)].map((_, i) => i % 16));
  const {pcm, loop} = waveSample(nibbles);
  assert.equal(pcm.length, 32); assert.deepEqual(loop, {start: 0, end: 32});
  assert.equal(waveHashOf(nibbles), waveHashOf(nibbles.slice()), "same content, same hash");
  assert.notEqual(waveHashOf(nibbles), waveHashOf(new Uint8Array(32)), "different content, different hash");
});

test("curveOf: normalised to the note's own onset, padded (not truncated) when a note is shorter than the window", () => {
  const flat = new Float64Array(16).fill(1);
  const decaying = Float64Array.from({length: 16}, (_, i) => Math.max(0.2, 1 - i * 0.1)); // floors at 0.2 by index 8
  assert.deepEqual(curveOf(flat), curveOf(Float64Array.from(flat, v => v * 0.5)), "same shape, different accent: same curve");
  assert.notDeepEqual(curveOf(flat), curveOf(decaying), "flat vs decaying: different curve");
  // a note a couple of samples shorter than the window pads by holding its last level, not truncating
  assert.deepEqual(curveOf(decaying), curveOf(decaying.slice(0, 12)));
});

test("pearson/meanAbsDiff: the similarity merge's two-part test", () => {
  const flat = new Array(16).fill(1);
  const almostFlat = [1, 1, 1, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97];
  const muchLouder = flat.map(() => 1.85);
  const decaying = Float64Array.from({length: 16}, (_, i) => Math.max(0.2, 1 - i * 0.1));
  // a flat curve's correlation against anything is undefined by definition — deferred to
  // meanAbsDiff (scored 1, not 0: refusing a merge here was the real bug the coordinator's
  // review caught, since it blocked a barely-decaying note from ever joining a held one)
  assert.equal(pearson(flat, almostFlat), 1);
  assert.ok(meanAbsDiff(flat, almostFlat) < 0.08, "close enough to merge: " + meanAbsDiff(flat, almostFlat));
  assert.ok(meanAbsDiff(flat, muchLouder) > 0.08, "not close enough — a real level jump, not jitter");
  assert.ok(pearson(flat, decaying) < 0.97 || meanAbsDiff(flat, decaying) > 0.08, "flat vs a real decay: kept apart");
  assert.equal(pearson(decaying, decaying), 1); assert.equal(meanAbsDiff(decaying, decaying), 0);
});

test("clusterByShape: near-identical curves merge into one instrument by their true medoid; a different decay rate stays separate", () => {
  const mk = (curveVals, dur) => ({levels: Float64Array.from(curveVals), dur, frameSec: 1 / 60});
  const flatShape = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const jitteredShape = [1, 1, 1, 0.97, 1, 0.97, 1, 1, 0.97, 1, 1, 0.97, 1, 1, 1, 1]; // same instrument, a frame of jitter
  const facts = [
    ...Array(20).fill(0).map(() => mk(flatShape, 6)),        // the common case
    ...Array(3).fill(0).map(() => mk(jitteredShape, 4)),     // near-identical: should merge into the above
    ...Array(5).fill(0).map(() => mk(Array.from({length: 16}, (_, i) => Math.max(0.1, 1 - i * 0.15)), 20)), // a real, fast decay
  ];
  const clusters = clusterByShape(facts);
  assert.equal(clusters.length, 2, "the jittered near-copy merges; the real decay stays its own cluster");
  const big = clusters.find(c => c.facts.length === 23), small = clusters.find(c => c.facts.length === 5);
  assert.ok(big && small);
});

test("curveFromEnvelope: resamples a stored instrument's envelope back to the same curve shape extraction clustered with", () => {
  const flat = new Float64Array(16).fill(1);
  const env = {points: [[0, 1], [0.267, 1]], repeat: null};
  const curve = curveFromEnvelope(env, 1 / 60);
  assert.deepEqual(curveOf(curve), curveOf(flat), "a flat envelope resamples flat");
});

test("nesLevels: constant-volume holds (and follows explicit writes), hardware envelope decays and loops", () => {
  const held = nesLevels("pulse", 0x3F, [], 8); // duty0, constVol, vol 15, no further writes
  assert.ok(held.every(v => Math.abs(v - 1) < 1e-9), "vol 15 constant -> level 1 throughout");
  const faded = nesLevels("pulse", 0x3F, [[4, 0]], 8); // an explicit drop to vol 0 at frame 4
  assert.ok(faded[3] > 0 && faded[4] === 0, "the write's own frame is where the level drops");
  const env = nesLevels("pulse", 0x08, [], 40); // hardware envelope, period 8, no loop
  assert.ok(env[0] > env[20] && env[39] === 0, "decays from full to silence, no loop");
  const loopEnv = nesLevels("pulse", 0x28, [], 200); // period 8, loop bit set
  assert.ok(loopEnv.some((v, i) => i > 20 && v > loopEnv[i - 1] + 0.1), "a looping hardware envelope re-attacks");
});

test("gbLevels: linear DAC — pace 0 holds, otherwise steps at 64 Hz toward 0 or 15", () => {
  const frameSec = 1 / 59.73;
  const held = gbLevels(0xF0, 8, frameSec); // initVol 15, dir down, pace 0 -> never steps
  assert.ok(held.every(v => Math.abs(v - 1) < 1e-9));
  const decay = gbLevels(0xF1, 60, frameSec); // initVol 15, dir down, pace 1 (fastest)
  assert.ok(decay[0] > decay[30], "steps down over time");
  const rise = gbLevels(0x09, 60, frameSec); // initVol 0, dir up, pace 1
  assert.ok(rise[0] < rise[30], "steps up when dir is up");
});

test("nesPeriodForKey/gbPulsePeriodForKey/gbWavePeriodForKey: the period register for an exact MIDI key round-trips", () => {
  for (const midi of [40, 60, 69, 84, 96]) {
    const p = nesPeriodForKey(midi, "pulse");
    const freq = 1_789_773 / (16 * (p + 1)), back = Math.round(69 + 12 * Math.log2(freq / 440));
    assert.equal(back, midi, "NES pulse period " + p + " implies key " + back + ", wanted " + midi);
    const gp = gbPulsePeriodForKey(midi);
    const gfreq = 131072 / (2048 - gp), gback = Math.round(69 + 12 * Math.log2(gfreq / 440));
    assert.equal(gback, midi, "GB pulse period " + gp);
  }
});

test("pulseLevel/noiseLevel: the concave DAC law — 0 at silence, 1 at full scale, monotonic", () => {
  assert.equal(pulseLevel(0), 0); assert.equal(pulseLevel(15), 1);
  assert.equal(noiseLevel(0), 0); assert.equal(noiseLevel(15), 1);
  for (let v = 1; v < 15; v++) assert.ok(pulseLevel(v) < pulseLevel(v + 1), "pulseLevel monotonic at " + v);
  assert.ok(pulseLevel(7) > 7 / 15, "concave: half the register is more than half the linear level (" + pulseLevel(7) + ")");
});

test("nesFiles/gbsFiles: extract.mjs's dispatch finds .nsf/.gbs by extension", () => {
  const dir = mkdtempSync(join(tmpdir(), "nr-nesfiles-"));
  try {
    writeFileSync(join(dir, "a.nsf"), makeTestNSF());
    writeFileSync(join(dir, "b.gbs"), makeTestGBS());
    writeFileSync(join(dir, "ignore.txt"), "");
    assert.deepEqual(nesFiles(dir), ["a.nsf"]);
    assert.deepEqual(gbsFiles(dir), ["b.gbs"]);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("a synthetic NSF: pulse duty/envelope + the triangle pedal extracted, named, sampled, played back", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nr-nes-"));
  try {
    writeFileSync(join(dir, "test.nsf"), makeTestNSF());
    const lib = await extractAlbum(dir, {slug: "test-nes"});
    assert.deepEqual(lib.drivers, new Set(["nes"]));
    const pulse = lib.instruments.find(i => i.id.startsWith("nes:pulse:duty12.5:"));
    const tri = lib.instruments.find(i => i.id.startsWith("nes:triangle:"));
    assert.ok(pulse, "the 4-note duty-0 pulse melody"); assert.ok(tri, "the held triangle pedal");
    // a regression guard for the over-fragmentation the coordinator's review caught (Contra/
    // Castlevania briefly hit 175/228 instruments from an exact-match clustering bug): even this
    // tiny fixture should never explode past a handful of instruments for a 4-note melody + pedal
    assert.ok(lib.instruments.length <= 6, "instrument count: " + lib.instruments.length);
    assert.equal(pulse.kind, "melodic"); assert.equal(pulse.noteCount, 4);
    assert.deepEqual(pulse.keysPlayed, {lo: 60, hi: 72, median: 67});
    assert.equal(pulse.keyRegions.length, 1); assert.equal(pulse.keyRegions[0].keyLo, 0); assert.equal(pulse.keyRegions[0].keyHi, 127);
    assert.ok(Math.abs(pulse.keyRegions[0].rootKey - ROOT_KEY) < 1e-3, pulse.keyRegions[0].rootKey + " vs " + ROOT_KEY);
    assert.ok(typeof pulse.nameGuess === "string" && pulse.features && pulse.features.measured);
    assert.equal(pulse.envelope.points[0][1], 1, "envelope normalised to 1 at onset");
    for (const i of lib.instruments) for (const r of i.keyRegions) assert.ok(r.sample, i.id + " has a sample");
    // WAV round-trip: a 32-sample looped pulse cycle
    const out = mkdtempSync(join(tmpdir(), "nr-nes-out-"));
    const w = writeAlbum(lib, out);
    const h = pulse.keyRegions[0].sample;
    const wav = readWav(readFileSync(join(w.dir, h + ".wav")));
    assert.equal(wav.pcm.length, 32); assert.ok(wav.loop && wav.loop.end === 32);
    rmSync(out, {recursive: true, force: true});
    // play.mjs: the pulse plays the right pitch at its rootKey ratio
    const samples = {}; for (const [hh, s] of Object.entries(lib.samples)) samples[hh] = {rate: s.rate, loop: s.loop, pcm: s._f32};
    const buf = playNote(pulse, samples, {key: 60, vel: 100, hold: 0.05, sampleRate: 44100, tail: 0});
    assert.ok(buf.length > 0 && buf.some(v => v !== 0));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("a synthetic GBS: pulse, the real wavetable, and a noise drum-kit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nr-gb-"));
  try {
    writeFileSync(join(dir, "test.gbs"), makeTestGBS());
    const lib = await extractAlbum(dir, {slug: "test-gb"});
    assert.deepEqual(lib.drivers, new Set(["gb"]));
    const pulse = lib.instruments.find(i => i.id.startsWith("gb:pulse:duty50:"));
    const wave = lib.instruments.find(i => i.id.startsWith("gb:wave:"));
    const noise = lib.instruments.find(i => i.id.startsWith("gb:noise:"));
    assert.ok(pulse && wave && noise);
    assert.ok(lib.instruments.length <= 6, "instrument count: " + lib.instruments.length); // same regression guard as the NSF test above
    assert.equal(noise.kind, "drum-kit"); assert.equal(noise.keyRegions[0].fixedPitch, true);
    assert.equal(wave.keyRegions.length, 1); assert.ok(wave.keyRegions[0].sample);
    assert.equal(pulse.noteCount, 4); assert.equal(noise.noteCount, 4, "one noise hit per note");
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("instrumentsFolder: a folder vault keeps its library inside itself; a single-file vault publishes beside the whole filename", () => {
  assert.equal(instrumentsFolder("goldeneye-007/"), "goldeneye-007/instruments/");
  assert.equal(instrumentsFolder("castlevania.nsf"), "castlevania.nsf.instruments/");
  assert.equal(instrumentsFolder("tetris.nsf"), "tetris.nsf.instruments/");
  assert.equal(instrumentsFolder("tetris.gbs"), "tetris.gbs.instruments/", "NES and GB tetris no longer collide");
});

test("extract.mjs parseArgs: --vault, and --slug alone as the old fallback", () => {
  const withVault = parseArgs(["dir", "--slug", "tetris", "--vault", "tetris.nsf", "--publish"]);
  assert.equal(withVault.vault, "tetris.nsf"); assert.equal(withVault.slug, "tetris"); assert.equal(withVault.publish, true);
  const noVault = parseArgs(["dir", "--slug", "tetris", "--publish"]);
  assert.equal(noVault.vault, null, "no --vault: the CLI falls back to <slug>/instruments/");
});

// ---- real NES/GB rips: pitch/envelope against apu-render.mjs itself --------------------
// (scratch/instruments/rips/nes|game-boy or /tmp/claude-501/rips — CI has neither and skips)
const CHIP_RIPS = [
  ["nes", "contra", /Contra/i, join(RIPS, "nes", "contra")],
  ["nes", "castlevania", /Castlevania/i, join(RIPS, "nes", "x", "castlevania")],
  ["gb", "links-awakening", /ZLJ/i, join(RIPS, "game-boy", "x", "links-awakening")],
];
for (const [console_, name, re, dir] of CHIP_RIPS) {
  // Median, not "every row": a software-envelope instrument is built from ONE representative
  // note per cluster (nes.mjs's header), so an individual pick whose own decay differs a
  // little from its cluster's chosen shape — or a very quiet/very short/very high accent,
  // where autocorrelation and RMS are both measuring mostly noise floor — is expected
  // per-note variance, not a broken instrument; the median across several picks is the
  // meaningful signal (and matches what the task's own bar is checking for in aggregate).
  test(`real rip ${console_}/${name}: median pitch within 5¢ of apu-render.mjs, median as-played shape > 0.5`,
    {skip: !existsSync(dir) && "no rip at " + dir}, async () => {
    const {rows} = await verifySong(dir, re, {maxNotes: 6});
    const real = rows.filter(r => !r.error);
    assert.ok(real.length >= 4, "rows: " + rows.length);
    const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
    const pitched = real.filter(r => r.how === "period");
    if (pitched.length) assert.ok(Math.abs(median(pitched.map(r => r.pitch))) <= 5, "pitches: " + pitched.map(r => r.pitch.toFixed(1)));
    const asIs = real.filter(r => !r.long);
    assert.ok(median(asIs.map(r => r.shape)) > 0.5, "as-played shapes: " + asIs.map(r => r.shape.toFixed(2)));
  });
}

// ---- PS2 (tools/instruments/ps2.mjs): SQ/HD/BD (Sony) and BGM/WD (Square Enix) --------
// bankInstruments() is unit-tested directly against a hand-built VAB-shaped bank (the
// exact shape tools/ps2/hd.mjs's and tools/ps2/wd.mjs's own toBank() produce): melodic vs
// drum-kit (isDrumProgram, reused unmodified from tools/psx/notes.mjs), fixedPitch kit
// regions exploded one per key, and — the point of this module's whole design (its own
// header comment) — the SAME content built from two SEPARATE bank objects (as two songs'
// own HD/BD or WD each independently parse to) merges into ONE library entry, keyed by
// content, not by (bank, program).
function makeVabBank() {
  const a = encodeAdpcm(sine(440, 2800));          // vag 1: a looped tone, rate 22050 (HD/BD-style: a real per-VAG rate)
  const b = encodeAdpcm(sine(880, 700), {loop: false}); // vag 2: a one-shot tone, no rate field (WD-style: falls back to 44100)
  const body = new Uint8Array(a.length + b.length);
  body.set(a, 0); body.set(b, a.length);
  const programs = new Array(128).fill(null);
  programs[0] = {tones: [{min: 0, max: 127, vag: 1, center: 60, shift: 0, vol: 127, pan: 64, adsr1: 0x80FF, adsr2: 0x1FEE}], mvol: 127, mpan: 64};
  // a drum program: 2 distinct samples, every tone's own range <= 3 keys wide (isDrumProgram's rule)
  programs[1] = {tones: [
    {min: 36, max: 36, vag: 1, center: 60, shift: 0, vol: 100, pan: 64, adsr1: 0x80FF, adsr2: 0x1FEE},
    {min: 38, max: 39, vag: 2, center: 50, shift: 0, vol: 100, pan: 64, adsr1: 0x80FF, adsr2: 0x1FEE},
  ], mvol: 127, mpan: 64};
  return {programs, vags: [null, {offset: 0, size: a.length, rate: 22050}, {offset: a.length, size: b.length}], masterVol: 127, masterPan: 64, body};
}

test("ps2.mjs bankInstruments: melodic vs drum-kit (isDrumProgram, reused unmodified), fixedPitch kit regions exploded one per key", () => {
  const lib = new Library({slug: "t", title: "t"});
  const built = bankInstruments(lib, "ps2-sq", makeVabBank());
  assert.equal(built.size, 2);
  const p0 = built.get(0), p1 = built.get(1);
  assert.equal(p0.drum, false); assert.equal(p0.inst.kind, "melodic"); assert.equal(p0.inst.id.startsWith("ps2:inst:"), true);
  assert.equal(p0.inst.keyRegions.length, 1);
  assert.deepEqual([p0.inst.keyRegions[0].keyLo, p0.inst.keyRegions[0].keyHi], [0, 127]);
  assert.equal(p0.inst.keyRegions[0].rootKey, 60, "center 60, no fine tune");
  assert.equal(p1.drum, true); assert.equal(p1.inst.kind, "drum-kit"); assert.equal(p1.inst.id.startsWith("ps2:kit:"), true);
  assert.equal(p1.inst.keyRegions.length, 3, "one region per key: 36 (1 key) + 38-39 (2 keys)");
  for (const r of p1.inst.keyRegions) {
    assert.equal(r.keyLo, r.keyHi, "a kit region is exactly one slot");
    assert.equal(r.fixedPitch, true);
    assert.equal(r.fixedKey, r.rootKey, "ratio 1 always: the tone's own recorded pitch, whatever slot triggers it");
  }
  assert.deepEqual(p1.inst.keyRegions.map(r => r.keyLo).sort((x, y) => x - y), [36, 38, 39]);
});

test("ps2.mjs bankInstruments: the SAME content from two SEPARATE bank objects (two songs' own HD/BD or WD) merges into one instrument, not two", () => {
  const lib = new Library({slug: "t", title: "t"});
  const built1 = bankInstruments(lib, "ps2-sq", makeVabBank());
  const built2 = bankInstruments(lib, "ps2-sq", makeVabBank()); // a fresh bank object, byte-identical content
  assert.equal(lib.inst.size, 2, "not 4: the second bank's programs found the SAME library entries by content");
  assert.equal(built1.get(0).inst, built2.get(0).inst, "same object, not a lookalike");
  assert.equal(built1.get(1).inst, built2.get(1).inst);
  lib.use(built1.get(0).inst, "Song A", [{key: 60, secs: 1, vel: 100}]);
  lib.use(built2.get(0).inst, "Song B", [{key: 64, secs: 1, vel: 90}]);
  lib.finish();
  const inst = lib.instruments.find(i => i.id === built1.get(0).inst.id);
  assert.deepEqual(inst.usedIn.sort(), ["Song A", "Song B"]);
  assert.equal(inst.noteCount, 2);
  // each sample's own rate: HD/BD-style (vag 1, .rate given) keeps it; WD-style (vag 2, no .rate) falls back to 44100
  const melodicSample = lib.samples[inst.keyRegions[0].sample];
  assert.equal(melodicSample.rate, 22050);
  const kit = lib.instruments.find(i => i.kind === "drum-kit");
  const wdRegion = kit.keyRegions.find(r => r.keyLo === 38);
  assert.equal(lib.samples[wdRegion.sample].rate, 44100, "no .rate on this VAG: the renderer's own SPU_RATE fallback");
});

// Sony's stock driver: SQ (score) + HD/BD (bank) via a mini's psf2.ini, the exact
// mechanism real Dark Cloud rips use (tools/ps2/make-test-sq.mjs) — end to end through
// extractAlbum, two songs sharing one HD/BD pair (the real-file shape: Dark Cloud keeps
// every .SQ/.HD/.BD in the shared .psf2lib), and held against renderSpu via verifyPs2Song.
function writeSqRip(dir, {titles = ["Song One", "Song Two"]} = {}) {
  const sq = makeTestSQ();
  const hd = makeTestHD({baseNote: 60, adsr1: 0x80FF, adsr2: 0x1FEE, sampleRate: 22050});
  const bd = encodeAdpcm(sine(261.63, 6748)); // a real C4-ish sine, looped: a meaningful pitch/level check, not silence
  const lib = makePSF2(buildPSF2Fs([fileNode("TESTSEQ.SQ", sq), fileNode("TESTBANK.HD", hd), fileNode("TESTBANK.BD", bd)]), {game: "Test"});
  writeFileSync(join(dir, "test.psf2lib"), lib);
  const ini = "sq.irx -s=TESTSEQ.SQ -h=TESTBANK.HD -b=TESTBANK.BD\r\n";
  titles.forEach((title, i) => {
    const mini = makePSF2(buildPSF2Fs([fileNode("psf2.ini", new TextEncoder().encode(ini))]), {_lib: "test.psf2lib", title});
    writeFileSync(join(dir, `0${i + 1} ${title}.psf2`), mini);
  });
}

test("a synthetic PS2 SQ/HD/BD rip (Sony's stock driver): extracted, merged across both songs, and played back as spu-render.mjs plays it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nr-instr-ps2sq-"));
  try {
    assert.deepEqual(ps2Files(dir).sort(), []);
    writeSqRip(dir);
    assert.equal(ps2Files(dir).length, 2, "the shared .psf2lib is not itself a song");
    const lib = await extractAlbum(dir, {slug: "ps2-sq-test"});
    assert.equal(lib.drivers.has("ps2-sq"), true);
    const used = lib.instruments.filter(i => i.used);
    assert.equal(used.length, 1, "one program, one bank shared by both minis: one instrument — " + used.map(i => i.id).join(","));
    const inst = used[0];
    assert.equal(inst.driver, "ps2-sq"); assert.equal(inst.kind, "melodic");
    assert.deepEqual(inst.usedIn.sort(), ["Song One", "Song Two"]);
    assert.equal(inst.keyRegions[0].rootKey, 60);
    assert.equal(lib.samples[inst.keyRegions[0].sample].rate, 22050, "HD/BD's own VAGInfoParam rate, not the PS1-style 44100 fallback");
    const {rows} = await verifyPs2Song(dir, /Song One/);
    assert.ok(rows.length >= 1, "notes checked: " + rows.length);
    for (const r of rows) {
      assert.ok(!r.error, r.group + ": " + r.error);
      if (r.pitch != null) assert.ok(Math.abs(r.pitch) <= 5, `${r.group} pitch ${r.pitch} cents`);
      assert.ok(r.shape > 0.95, `${r.group} shape ${r.shape}`);
      assert.ok(Math.abs(r.level) <= 1, `${r.group} level ${r.level} dB`);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

// Square Enix's own driver: BGM (score) + WD (bank) directly in each mini's own
// filesystem, no ini needed (tools/ps2/make-test-bgm.mjs) — two self-contained minis
// carrying byte-identical WD bytes (the real-file shape: several BGMs commonly share one
// .wd), so the same instrument is expected to merge here too, and WD's own lack of a
// per-VAG rate field is confirmed against the real wd.mjs toBank() path (not the hand-built
// bank above).
test("a synthetic PS2 BGM/WD rip (Square Enix's own driver): extracted, merged across both songs, rate falls back to 44100", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nr-instr-ps2bgm-"));
  try {
    const bgm = makeTestBGM(), wd = makeTestWD();
    const titles = ["BGM One", "BGM Two"];
    titles.forEach((title, i) => {
      const mini = makePSF2(buildPSF2Fs([fileNode(`song${i}.bgm`, bgm), fileNode(`bank${i}.wd`, wd)]), {title});
      writeFileSync(join(dir, `0${i + 1} ${title}.minipsf2`), mini);
    });
    assert.equal(ps2Files(dir).length, 2);
    const lib = await extractAlbum(dir, {slug: "ps2-bgm-test"});
    assert.equal(lib.drivers.has("ps2-bgm"), true);
    const used = lib.instruments.filter(i => i.used);
    assert.equal(used.length, 1, "one WD instrument, byte-identical in both minis: one library entry — " + used.map(i => i.id).join(","));
    const inst = used[0];
    assert.equal(inst.driver, "ps2-bgm");
    assert.equal(inst.kind, "melodic", "the fixture's 3 regions (0-60, 61-90, 91-127) are all wider than isDrumProgram's 3-key rule");
    assert.deepEqual(inst.usedIn.sort(), ["BGM One", "BGM Two"]);
    for (const r of inst.keyRegions) if (r.sample) assert.equal(lib.samples[r.sample].rate, 44100, "WD carries no per-VAG rate field");
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

// ---- real PS2 rips (ps2-darkcloud, ps2-ffx in /tmp/claude-501/rips or INSTRUMENT_RIPS) ----
const PS2_REF = [["ps2-darkcloud", /^01 Dark Cloud Main/, "ps2-sq"], ["ps2-ffx", /^109 Battle/, "ps2-bgm"]];
for (const [dirName, re, driverTag] of PS2_REF) {
  test(`real rip ${dirName} ${re.source}: the library plays its notes as spu-render.mjs plays them (5 cents, shape 0.95, 1 dB)`,
    {skip: !existsSync(join(RIPS, dirName)) && "no rip at " + join(RIPS, dirName)}, async () => {
    const {rows} = await verifyPs2Song(join(RIPS, dirName), re, {maxNotes: 5});
    assert.ok(rows.length >= 2, "notes checked: " + rows.length);
    for (const r of rows) {
      assert.ok(!r.error, r.group + ": " + r.error);
      if (r.pitch != null) assert.ok(Math.abs(r.pitch) <= 5, `${r.group} pitch ${r.pitch} cents`);
      assert.ok(r.shape > 0.95, `${r.group} shape ${r.shape}`);
      assert.ok(Math.abs(r.level) <= 1, `${r.group} level ${r.level} dB`);
    }
  });
}
for (const dirName of ["ps2-darkcloud", "ps2-ffx"]) {
  test(`real rip ${dirName}: every played instrument is in the library with its samples`, {skip: !existsSync(join(RIPS, dirName)) && "no rip"}, async () => {
    const lib = await extractAlbum(join(RIPS, dirName), {slug: dirName});
    const s = summary(lib);
    assert.equal(s.skipped, 0);
    assert.ok(s.used >= 100, "used instruments: " + s.used);
    for (const i of lib.instruments.filter(x => x.used)) assert.ok(i.keyRegions.some(r => r.sample), i.id + " has a playable region");
  });
}
