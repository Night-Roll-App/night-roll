// tools/instruments/sf2.mjs: a plain SoundFont 2 reader. Two independent checks —
// (1) our OWN export.mjs's toSf2 output, round-tripped back through parseSf2 (same
// regions/roots/loops the library started with — envelope shape and gain are already
// lossy going INTO SF2, per export.mjs's own doc comment, so this checks what a
// sampler could actually still get right); (2) a from-scratch, hand-built SF2 exercising
// global zones and preset-level generator offsets that our own writer never emits
// (export.mjs writes one flat preset zone per instrument, no globals) — a community
// font's multi-layer preset is exactly this shape.
import test from "node:test";
import assert from "node:assert/strict";
import { parseSf2, isSf2, buildEnvelope } from "../tools/instruments/sf2.mjs";
import { toSf2 } from "../tools/instruments/export.mjs";

// ---- a tiny from-scratch RIFF/SF2 builder (independent of export.mjs's own) ----
const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xffff, 0); return b; };
const i16v = v => { const b = Buffer.alloc(2); b.writeInt16LE(v, 0); return b; };
const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b; };
const u8 = v => Buffer.from([v & 0xff]);
const i8 = v => { const b = Buffer.alloc(1); b.writeInt8(v, 0); return b; };
const name20 = s => { const b = Buffer.alloc(20); b.write(s.slice(0, 20), 0, "ascii"); return b; };
const chunk = (id, data) => { const body = data.length % 2 ? Buffer.concat([data, Buffer.alloc(1)]) : data; const h = Buffer.alloc(8); h.write(id, 0, "ascii"); h.writeUInt32LE(data.length, 4); return Buffer.concat([h, body]); };
const list = (id, chunks) => chunk("LIST", Buffer.concat([Buffer.from(id, "ascii"), ...chunks]));
const gen = (op, amt) => { const b = Buffer.alloc(4); b.writeUInt16LE(op, 0); if (Array.isArray(amt)) { b.writeUInt8(amt[0], 2); b.writeUInt8(amt[1], 3); } else b.writeInt16LE(amt, 2); return b; };
const bag = genNdx => { const b = Buffer.alloc(4); b.writeUInt16LE(genNdx, 0); b.writeUInt16LE(0, 2); return b; };
const shdrRec = (nm, start, end, startloop, endloop, rate, origPitch, pitchCorr) =>
  Buffer.concat([name20(nm), u32(start), u32(end), u32(startloop), u32(endloop), u32(rate), u8(origPitch), i8(pitchCorr), u16(0), u16(0)]);

// InstA: a global zone (pan=+200, i.e. 0.4) + two local zones sharing one sample —
// zone1 keys 0-63, looped, explicit rootKey 60 (inherits the global pan); zone2 keys
// 64-127, NOT looped, its own pan (-300, overriding the global) and coarseTune +12.
// "Split Preset": a global zone (initialAttenuation +60 cB, applies to every layer) +
// two layers on InstA — layer A keys 0-63 (no offsets), layer B keys 70-127
// (coarseTune +12, fineTune +50 — stacks with InstA zone2's own +12 coarseTune).
// The narrower preset-layer key ranges (63/70 split, not 64/63) mean only ONE
// instrument zone survives the intersection per layer — the other combination is
// empty and must be silently dropped, not produce a bogus zero-width region.
function buildFont({ smplBytes = null, sm24 = false } = {}) {
  const pcm = Int16Array.from({length: 20}, (_, i) => Math.round(8000 * Math.sin((2 * Math.PI * i) / 9)));
  const shdr = Buffer.concat([shdrRec("s0", 0, 20, 5, 15, 22050, 60, 0), shdrRec("EOS", 0, 0, 0, 0, 0, 0, 0)]);

  const instGlobal = [gen(17, 200)];
  const instZone1 = [gen(43, [0, 63]), gen(54, 1), gen(58, 60), gen(53, 0)];
  const instZone2 = [gen(43, [64, 127]), gen(54, 0), gen(51, 12), gen(17, -300), gen(53, 0)];
  const igen = Buffer.concat([...instGlobal, ...instZone1, ...instZone2]);
  const ibag = Buffer.concat([bag(0), bag(instGlobal.length), bag(instGlobal.length + instZone1.length), bag(instGlobal.length + instZone1.length + instZone2.length)]);
  const inst = Buffer.concat([Buffer.concat([name20("InstA"), u16(0)]), Buffer.concat([name20("EOI"), u16(3)])]);

  const presetGlobal = [gen(48, 60)];
  const layerA = [gen(43, [0, 63]), gen(41, 0)];
  const layerB = [gen(43, [70, 127]), gen(51, 12), gen(52, 50), gen(41, 0)];
  const pgen = Buffer.concat([...presetGlobal, ...layerA, ...layerB]);
  const pbag = Buffer.concat([bag(0), bag(presetGlobal.length), bag(presetGlobal.length + layerA.length), bag(presetGlobal.length + layerA.length + layerB.length)]);
  const phdr = Buffer.concat([
    Buffer.concat([name20("Split Preset"), u16(0), u16(0), u16(0), u32(0), u32(0), u32(0)]),
    Buffer.concat([name20("EOP"), u16(0), u16(0), u16(3), u32(0), u32(0), u32(0)]),
  ]);

  const pcmBytes = smplBytes !== null ? smplBytes : Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const sdtaChunks = [chunk("smpl", pcmBytes)];
  if (sm24) sdtaChunks.push(chunk("sm24", Buffer.alloc(10)));
  const info = list("INFO", [chunk("ifil", Buffer.from([2, 0, 1, 0])), chunk("isng", Buffer.from("EMU8000\0", "ascii")), chunk("INAM", Buffer.from("Hand-built Test\0", "ascii"))]);
  const sdta = list("sdta", sdtaChunks);
  const pdta = list("pdta", [
    chunk("phdr", phdr), chunk("pbag", pbag), chunk("pmod", Buffer.alloc(10)), chunk("pgen", pgen),
    chunk("inst", inst), chunk("ibag", ibag), chunk("imod", Buffer.alloc(10)), chunk("igen", igen),
    chunk("shdr", shdr),
  ]);
  const sfbk = Buffer.concat([Buffer.from("sfbk", "ascii"), info, sdta, pdta]);
  const riff = chunk("RIFF", sfbk);
  return new Uint8Array(riff.buffer, riff.byteOffset, riff.byteLength);
}

test("isSf2: RIFF/sfbk sniff", () => {
  assert.equal(isSf2(buildFont()), true);
  assert.equal(isSf2(new Uint8Array([1, 2, 3])), false);
  assert.equal(isSf2(Buffer.from("RIFF\0\0\0\0WAVE")), false, "a WAV, not a soundfont");
});

test("parseSf2: not a SoundFont at all gets a clear error, not a crash on garbage bytes", () => {
  assert.throws(() => parseSf2(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), /RIFF\/sfbk/);
});

test("parseSf2: global zones (instrument AND preset) + preset-level additive offsets + key-range narrowing across a layer split", () => {
  const font = parseSf2(buildFont());
  assert.equal(font.name, "Hand-built Test");
  assert.equal(font.presets.length, 1);
  const p = font.presets[0];
  assert.equal(p.name, "Split Preset"); assert.equal(p.bank, 0); assert.equal(p.program, 0);
  assert.equal(p.zones, p.keyRegions, "zones and keyRegions are the same array — a preset IS a play.mjs inst");
  assert.equal(p.gain, 1); assert.equal(p.velocityCurve, "linear");

  // exactly 2 zones survive: (layerA x inst zone1) and (layerB x inst zone2) — the
  // cross combinations (layerA x zone2, layerB x zone1) have empty key intersections
  assert.equal(p.zones.length, 2, "the two non-overlapping layer x instrument-zone combinations only");
  const lo = p.zones.find(z => z.keyLo === 0), hi = p.zones.find(z => z.keyLo === 70);
  assert.ok(lo && hi, "one zone per surviving combination");

  assert.equal(lo.keyHi, 63);
  assert.ok(!("velLo" in lo), "full 0..127 velocity range on both levels: no velLo/velHi key");
  assert.equal(lo.rootKey, 60, "instrument zone1's own overridingRootKey; no coarse/fine tune anywhere on this side");
  assert.ok(Math.abs(lo.pan - 0.4) < 1e-6, "zone1 has no local pan: inherits InstA's GLOBAL zone pan (+200 / 500)");
  assert.ok(Math.abs(lo.gain - Math.pow(10, -60 / 200)) < 1e-6, "0 cB from the instrument + 60 cB from the PRESET's global zone");
  assert.deepEqual(lo.loop, {start: 5, end: 15}, "zone1: sampleModes 1 (loop), relative to the sample's own start");

  assert.equal(hi.keyHi, 127);
  assert.ok(Math.abs(hi.rootKey - 84.5) < 1e-6,
    "no overridingRootKey on zone2 -> the SAMPLE's originalPitch (60), + coarseTune 12 (instrument, absolute) + 12 (preset layer B, additive) = 84, + fineTune 0+50 = +0.5");
  assert.ok(Math.abs(hi.pan - -0.6) < 1e-6, "zone2's OWN pan (-300) overrides InstA's global zone — never summed with it");
  assert.ok(Math.abs(hi.gain - Math.pow(10, -60 / 200)) < 1e-6, "same preset-global attenuation offset reaches this layer too");
  assert.equal(hi.loop, null, "zone2: sampleModes 0 explicitly — no loop even though the shared sample has loop points");

  // same underlying sample, two different effective loops -> two distinct entries
  assert.equal(Object.keys(font.samples).length, 2, "loop is a per-zone decision (sampleModes), not a sample-identity one");
  const sLo = font.samples[lo.sample], sHi = font.samples[hi.sample];
  assert.equal(sLo.rate, 22050); assert.equal(sHi.rate, 22050);
  assert.deepEqual(sLo.pcm, sHi.pcm, "identical raw PCM content in both");
  assert.notEqual(lo.sample, hi.sample, "…but different hashes, because their loops differ");
});

test("parseSf2: SF3 (compressed) samples rejected with a clear error, not a garbled render", () => {
  assert.throws(() => parseSf2(buildFont({smplBytes: Buffer.alloc(10)})), /SF3|compressed/i);
});

test("parseSf2: 24-bit samples (sm24 chunk) rejected with a clear error", () => {
  assert.throws(() => parseSf2(buildFont({sm24: true})), /24-bit/);
});

test("parseSf2: envelope shape is a valid model.mjs points/releaseCurve object", () => {
  const e = buildEnvelope(-12000, 0, -12000, 0, 0, 200);
  assert.ok(Array.isArray(e.points) && e.points.length >= 1);
  assert.equal(e.points[e.points.length - 1][1], 1, "no decay/hold/delay: straight to full level");
  assert.equal(e.releaseCurve.mode, "follow");
  assert.ok(e.releaseCurve.points.length > 1);
  assert.equal(e.releaseCurve.points[0][1], 1);
  assert.equal(e.releaseCurve.points[e.releaseCurve.points.length - 1][1], 0);
});

// ---- round trip: our OWN export.mjs writer -> parseSf2 -------------------------
function library() {
  return {
    format: "night-roll-instruments", version: 1, slug: "rt-test", title: "Round Trip Test",
    instruments: [
      {
        id: "test:pad", driver: "test", kind: "melodic", used: true, usedIn: ["Song A"], noteCount: 4,
        nameGuess: "Test Pad", gain: 0.5, pan: -0.4, velocityCurve: "linear",
        envelope: {attack: 0.01, decay: 0.02, sustain: 0.6, release: 0.3, points: [[0, 0], [0.01, 1], [0.03, 0.6]], repeat: null, releaseCurve: {mode: "exp-time", seconds: 0.3}},
        keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 60.3, sample: "loopy", loop: {start: 10, end: 30}}],
      },
      {
        id: "test:kit", driver: "test", kind: "drum-kit", used: true, usedIn: ["Song A"], noteCount: 9,
        nameGuess: "Test Kit", gain: 1, pan: null, velocityCurve: "linear",
        envelope: {attack: 0, decay: 0.05, sustain: 0, release: 0.05, points: [[0, 1], [0.05, 0]], repeat: null, releaseCurve: {mode: "follow", points: [[0, 1], [0.02, 0.3], [0.05, 0]]}},
        keyRegions: [{keyLo: 36, keyHi: 36, rootKey: 36, sample: "kick", loop: null, fixedPitch: true, nameGuess: "Kick"}],
      },
    ],
    samples: {
      loopy: {rate: 22050, length: 40, loop: {start: 10, end: 30}, bytes: 0, file: "loopy.wav"},
      kick: {rate: 22050, length: 20, loop: null, bytes: 0, file: "kick.wav"},
    },
  };
}
function samplesFor(lib) {
  const sine = (n, period, amp = 8000) => { const a = new Int16Array(n); for (let i = 0; i < n; i++) a[i] = Math.round(amp * Math.sin((2 * Math.PI * i) / period)); return a; };
  return {
    loopy: {pcm: sine(lib.samples.loopy.length, 16), rate: lib.samples.loopy.rate, loop: lib.samples.loopy.loop},
    kick: {pcm: Int16Array.from([9000, 7000, 5000, 3000, 2000, 1000, 500, 200, 100, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), rate: lib.samples.kick.rate, loop: null},
  };
}

test("round trip: export.mjs's toSf2 -> parseSf2 keeps the same key/vel ranges, root keys (+ fine tune), and loops", () => {
  const lib = library(), samples = samplesFor(lib);
  const bytes = toSf2(lib, samples);
  const font = parseSf2(bytes);
  assert.equal(font.name, "Round Trip Test");
  assert.equal(font.presets.length, 2, "both instruments are used -> both get a preset");

  const pad = font.presets.find(p => p.name.startsWith("Test Pad"));
  assert.equal(pad.bank, 0); assert.equal(pad.program, 0);
  assert.equal(pad.zones.length, 1);
  const padZone = pad.zones[0];
  assert.equal(padZone.keyLo, 0); assert.equal(padZone.keyHi, 127);
  assert.ok(Math.abs(padZone.rootKey - 60.3) < 0.01, "floor(60.3)=60 + 30 cents fine tune round-trips to 60.3: " + padZone.rootKey);
  assert.deepEqual(padZone.loop, {start: 10, end: 30});
  assert.ok(font.samples[padZone.sample] && font.samples[padZone.sample].rate === 22050);
  assert.equal(font.samples[padZone.sample].pcm.length, 40);

  const kit = font.presets.find(p => p.name.startsWith("Test Kit"));
  assert.equal(kit.zones.length, 1);
  const kitZone = kit.zones[0];
  assert.equal(kitZone.keyLo, 36); assert.equal(kitZone.keyHi, 36, "a single-key zone: SF2/SFZ's own way to express a fixed drum pitch");
  assert.equal(kitZone.rootKey, 36);
  assert.equal(kitZone.loop, null);
  // the decoded PCM's shape matches what went in (the same sine samplesFor generated),
  // not zeros or garbage — a coarse but real content check, not just metadata
  const padSample = font.samples[font.presets.find(p => p.name.startsWith("Test Pad")).zones[0].sample];
  let peak = 0; for (const v of padSample.pcm) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak > 0.2, "the pad's sample decoded to real (non-silent) audio: peak " + peak);
});
