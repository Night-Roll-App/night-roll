// tools/instruments/export.mjs: instruments.json (+ decoded WAVs) -> SF2 and
// SFZ. A tiny hand-built library — one looped melodic instrument, one
// one-shot drum-kit instrument with a missing region, one unused instrument
// — through toSf2/toSfz, then a minimal RIFF/SF2 reader (this file's own,
// on purpose: the point is to check what export.mjs actually wrote, not to
// reuse its own chunk builders) walks the SoundFont back and checks chunk
// structure, counts, sample points and the per-zone generators; the SFZ
// output is checked by its region lines.
import test from "node:test";
import assert from "node:assert/strict";
import { toSf2, toSfz, splitPitch, zonesForInstrument, playableInstruments, shortName, slugify } from "../tools/instruments/export.mjs";

function i16(vals) { return Int16Array.from(vals); }
function sine(n, period, amp = 8000) { const a = new Int16Array(n); for (let i = 0; i < n; i++) a[i] = Math.round(amp * Math.sin((2 * Math.PI * i) / period)); return a; }

// loopy: 40 points, loop [10, 30) — melodic, fine tune 0.3 (30 cents)
// kick: 20 points, no loop — drum-kit, fixedPitch, exact semitone (no fine tune)
// extra: 12 points, no loop — the unused instrument's only sample
function library() {
  return {
    format: "night-roll-instruments", version: 1, slug: "synth-test", title: "Synth Test",
    instruments: [
      {
        id: "test:pad", driver: "test", kind: "melodic", used: true, usedIn: ["Song A"], noteCount: 4,
        nameGuess: "Test Pad", gain: 0.5, pan: -0.4, velocityCurve: "linear",
        envelope: {
          attack: 0.01, decay: 0.02, sustain: 0.6, release: 0.3,
          points: [[0, 0], [0.01, 1], [0.03, 0.6]], repeat: null,
          releaseCurve: {mode: "exp-time", seconds: 0.3},
        },
        keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 60.3, sample: "loopy", loop: {start: 10, end: 30}}],
      },
      {
        id: "test:kit", driver: "test", kind: "drum-kit", used: true, usedIn: ["Song A"], noteCount: 9,
        nameGuess: "Test Kit", gain: 1, pan: null, velocityCurve: "linear",
        envelope: {
          attack: 0, decay: 0.05, sustain: 0, release: 0.05,
          points: [[0, 1], [0.05, 0]], repeat: null,
          releaseCurve: {mode: "follow", points: [[0, 1], [0.02, 0.3], [0.05, 0]]},
        },
        keyRegions: [
          {keyLo: 0, keyHi: 0, rootKey: 36, sample: "kick", loop: null, fixedPitch: true, nameGuess: "Kick"},
          {keyLo: 1, keyHi: 1, rootKey: 38, sample: null, loop: null, fixedPitch: true, missing: true, nameGuess: "Snare (missing)"},
        ],
      },
      {
        id: "test:unused", driver: "test", kind: "melodic", used: false, usedIn: [], noteCount: 0,
        nameGuess: "Unused Voice", gain: 1, pan: null, velocityCurve: "linear",
        envelope: {attack: 0, decay: 0, sustain: 1, release: 0.1, points: [[0, 1]], repeat: null, releaseCurve: {mode: "exp-time", seconds: 0.1}},
        keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 72, sample: "extra", loop: null}],
      },
    ],
    samples: {
      loopy: {rate: 22050, length: 40, loop: {start: 10, end: 30}, bytes: 0, file: "loopy.wav"},
      kick: {rate: 22050, length: 20, loop: null, bytes: 0, file: "kick.wav"},
      extra: {rate: 22050, length: 12, loop: null, bytes: 0, file: "extra.wav"},
    },
  };
}
function samplesFor(lib) {
  return {
    loopy: {pcm: sine(lib.samples.loopy.length, 16), rate: lib.samples.loopy.rate, loop: lib.samples.loopy.loop},
    kick: {pcm: i16([9000, 7000, 5000, 3000, 2000, 1000, 500, 200, 100, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), rate: lib.samples.kick.rate, loop: null},
    extra: {pcm: sine(lib.samples.extra.length, 12, 4000), rate: lib.samples.extra.rate, loop: null},
  };
}

// ---- a from-scratch RIFF/SF2 reader (independent of export.mjs's own writer) ----
function readSf2(buf) {
  const b = Buffer.from(buf);
  assert.equal(b.toString("ascii", 0, 4), "RIFF");
  assert.equal(b.toString("ascii", 8, 12), "sfbk");
  const chunks = {};
  function walk(o, end) {
    while (o < end) {
      const id = b.toString("ascii", o, o + 4), len = b.readUInt32LE(o + 4);
      if (id === "LIST") { walk(o + 12, o + 8 + len); }
      else chunks[id] = b.subarray(o + 8, o + 8 + len);
      o += 8 + len + (len % 2);
    }
  }
  walk(12, b.length);
  const recs = (name, size) => { const c = chunks[name]; assert.ok(c, name + " chunk present"); assert.equal(c.length % size, 0, name + " length is a multiple of " + size); const out = []; for (let o = 0; o < c.length; o += size) out.push(c.subarray(o, o + size)); return out; };
  const gen = r => { const op = r.readUInt16LE(0); return {op, lo: r.readUInt8(2), hi: r.readUInt8(3), amt: r.readInt16LE(2)}; };
  return {
    chunks,
    phdr: recs("phdr", 38).map(r => ({name: r.toString("ascii", 0, 20).replace(/\0.*/s, ""), program: r.readUInt16LE(20), bank: r.readUInt16LE(22), bagNdx: r.readUInt16LE(24)})),
    pbag: recs("pbag", 4).map(r => ({genNdx: r.readUInt16LE(0), modNdx: r.readUInt16LE(2)})),
    pgen: recs("pgen", 4).map(gen),
    inst: recs("inst", 22).map(r => ({name: r.toString("ascii", 0, 20).replace(/\0.*/s, ""), bagNdx: r.readUInt16LE(20)})),
    ibag: recs("ibag", 4).map(r => ({genNdx: r.readUInt16LE(0), modNdx: r.readUInt16LE(2)})),
    igen: recs("igen", 4).map(gen),
    shdr: recs("shdr", 46).map(r => ({
      name: r.toString("ascii", 0, 20).replace(/\0.*/s, ""), start: r.readUInt32LE(20), end: r.readUInt32LE(24),
      startloop: r.readUInt32LE(28), endloop: r.readUInt32LE(32), rate: r.readUInt32LE(36), originalPitch: r.readUInt8(40),
    })),
    smplPoints: chunks.smpl.length / 2,
  };
}
// generators of instrument zone `zi` (0-based, excluding the global/terminal slot)
function zoneGens(sf, instIdx, zoneIdx) {
  const inst = sf.inst[instIdx], nextInst = sf.inst[instIdx + 1];
  assert.ok(nextInst, "instrument has a following (possibly terminal) record");
  const bagStart = inst.bagNdx + zoneIdx, bag = sf.ibag[bagStart], nextBag = sf.ibag[bagStart + 1];
  return sf.igen.slice(bag.genNdx, nextBag.genNdx);
}

test("toSf2: RIFF/sfbk structure, sample points, key/vel ranges, rootKey/fineTune, loop mode", () => {
  const lib = library(), samples = samplesFor(lib);
  const bytes = toSf2(lib, samples);
  assert.ok(bytes instanceof Uint8Array);
  const sf = readSf2(bytes);

  // INFO: present, isng is the fixed EMU8000 string
  assert.ok(sf.chunks.ifil && sf.chunks.ifil.length === 4);
  assert.equal(sf.chunks.isng.toString("ascii").replace(/\0.*/s, ""), "EMU8000");
  assert.equal(sf.chunks.INAM.toString("ascii").replace(/\0.*/s, ""), "Synth Test");

  // 3 instruments (pad, kit, unused — all have >=1 playable region) + terminal,
  // named by the same short nameGuess a preset gets — never inst.id (a
  // sampler's instrument list should read "Test Pad", not "test:pad")
  assert.equal(sf.inst.length, 4, "3 instruments + terminal EOI");
  assert.equal(sf.inst[0].name, "Test Pad");
  assert.equal(sf.inst[1].name, "Test Kit");
  assert.equal(sf.inst[2].name, "Unused Voice");
  assert.equal(sf.inst[3].name, "EOI");
  // presets: used-only regardless of the default (no --used-only) — pad + kit, not "unused"
  assert.equal(sf.phdr.length, 3, "2 used presets + terminal EOP");
  assert.deepEqual(sf.phdr.slice(0, 2).map(p => [p.bank, p.program]), [[0, 0], [0, 1]]);
  assert.ok(sf.phdr[0].name.startsWith("Test Pad"));
  assert.equal(sf.phdr[2].name, "EOP");

  // 3 samples (loopy, kick, extra — "unused" is still an SF2 instrument by default) + terminal
  assert.equal(sf.shdr.length, 4, "3 samples + terminal EOS");
  const byName = Object.fromEntries(sf.shdr.map(s => [s.name, s]));
  assert.equal(byName.loopy.end - byName.loopy.start, 40);
  assert.equal(byName.loopy.startloop - byName.loopy.start, 10, "dwStartloop is relative loop.start");
  assert.equal(byName.loopy.endloop - byName.loopy.start, 30, "dwEndloop is exclusive, same as model.mjs's loop.end (no -1)");
  assert.equal(byName.loopy.originalPitch, 60, "floor(rootKey) of the region that plays it");
  assert.equal(byName.kick.end - byName.kick.start, 20);
  assert.equal(byName.kick.originalPitch, 36);
  // smpl carries every sample plus 46 zero points after each
  assert.equal(sf.smplPoints, 40 + 46 + 20 + 46 + 12 + 46);

  // pad's one zone: full key range, rootKey 60 + 30 cents fine tune, looped
  const padGens = zoneGens(sf, 0, 0), padByOp = Object.fromEntries(padGens.map(g => [g.op, g]));
  assert.equal(padGens[0].op, 43, "keyRange is the first generator");
  assert.deepEqual([padByOp[43].lo, padByOp[43].hi], [0, 127]);
  assert.equal(padByOp[58].amt, 60, "overridingRootKey = floor(60.3)");
  assert.equal(padByOp[52].amt, 30, "fineTune = round(0.3 * 100)");
  assert.equal(padByOp[54].amt, 1, "sampleModes 1: loop continuous");
  assert.equal(padGens[padGens.length - 1].op, 53, "sampleID is the last generator");
  assert.ok(padByOp[48].amt > 0, "gain 0.5 -> positive initialAttenuation (cB)");
  assert.equal(padByOp[17].amt, -200, "pan -0.4 -> -200 (of -500..500)");
  // envelope timecents present and ordered attack/decay/sustain/release
  assert.ok(34 in padByOp && 36 in padByOp && 37 in padByOp && 38 in padByOp);

  // kit: only ONE zone (the missing region is skipped), fixed pitch, no loop -> no sampleModes generator
  assert.equal(sf.inst[1].bagNdx + 1, sf.inst[2].bagNdx, "kit instrument has exactly one zone");
  const kickGens = zoneGens(sf, 1, 0), kickByOp = Object.fromEntries(kickGens.map(g => [g.op, g]));
  assert.deepEqual([kickByOp[43].lo, kickByOp[43].hi], [0, 0]);
  assert.equal(kickByOp[58].amt, 36);
  assert.ok(!(52 in kickByOp), "no fine tune generator when the fraction is exactly 0");
  assert.ok(!(54 in kickByOp), "no sampleModes generator when there is no loop");

  // --used-only: the unused instrument and its sample are dropped entirely
  const trimmed = readSf2(toSf2(lib, samples, {usedOnly: true}));
  assert.equal(trimmed.inst.length, 3, "2 instruments + terminal");
  assert.equal(trimmed.shdr.length, 3, "2 samples + terminal");
  assert.equal(trimmed.phdr.length, 3, "same 2 presets — presets were already used-only");
});

test("toSfz: region opcodes, loop vs one-shot, fine tune, ARIA flex EG, index.txt", () => {
  const lib = library();
  const files = toSfz(lib);
  assert.equal(Object.keys(files).length, 4, "3 instrument files + index.txt");
  assert.match(files["index.txt"], /^0\t0\t0-test-pad\.sfz\ttest:pad\tTest Pad$/m, "program, file, and the id -> name map SF2 has no room for");
  assert.match(files["index.txt"], /^0\t1\t1-test-kit\.sfz\ttest:kit\tTest Kit$/m);
  assert.match(files["index.txt"], /^-\t-\t2-unused-voice\.sfz\ttest:unused\tUnused Voice$/m, "the unused instrument is still in the id -> name map, with no program");

  const pad = files["0-test-pad.sfz"];
  assert.match(pad, /default_path=\.\//);
  assert.match(pad, /sample=loopy\.wav/);
  assert.match(pad, /lokey=0 hikey=127/);
  assert.match(pad, /pitch_keycenter=60 tune=30/);
  assert.match(pad, /loop_mode=loop_continuous loop_start=10 loop_end=29/, "SFZ loop_end is inclusive (loop.end - 1)");
  assert.match(pad, /volume=-6\.02/);
  assert.match(pad, /ampeg_attack=0\.01 ampeg_decay=0\.02 ampeg_sustain=60 ampeg_release=0\.3/);
  assert.match(pad, /eg1_ampeg=1/);
  assert.match(pad, /eg1_sustain=3/, "sustain node = the 3rd (last) envelope.points node");

  const kit = files["1-test-kit.sfz"];
  const regions = kit.split("<region>").slice(1);
  assert.equal(regions.length, 1, "the missing snare region produced no zone");
  assert.match(regions[0], /sample=kick\.wav/);
  assert.match(regions[0], /lokey=0 hikey=0/);
  assert.match(regions[0], /pitch_keycenter=36/);
  assert.ok(!/tune=/.test(regions[0]), "no fine tune opcode for an exact semitone");
  assert.match(regions[0], /loop_mode=one_shot/, "drum-kit, unlooped -> one_shot, not no_loop");

  assert.ok(files["2-unused-voice.sfz"], "unused instruments still get their own file (no --used-only)");
  assert.equal(Object.keys(toSfz(lib, {usedOnly: true})).length, 3, "--used-only: 2 instrument files + index.txt");
});

test("gain normalisation: the loudest zone in the library is 0 cB / 0 dB, others keep their ratio", () => {
  // driver gains run on the driver's own scale, not 0..1 — two instruments
  // at gain 4 and 1 (a 4x, +12 dB ratio) should land at 0 cB/dB and
  // ~120 cB/-12 dB, not clamp both to silence-adjacent attenuation.
  const lib = {
    format: "night-roll-instruments", version: 1, slug: "gains", title: "Gains",
    instruments: [
      {id: "g:loud", driver: "test", kind: "melodic", used: true, usedIn: ["S"], noteCount: 1, nameGuess: "Loud", gain: 4, pan: null, velocityCurve: "linear", envelope: null, keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 60, sample: "s", loop: null}]},
      {id: "g:quiet", driver: "test", kind: "melodic", used: true, usedIn: ["S"], noteCount: 1, nameGuess: "Quiet", gain: 1, pan: null, velocityCurve: "linear", envelope: null, keyRegions: [{keyLo: 0, keyHi: 127, rootKey: 60, sample: "s", loop: null}]},
    ],
    samples: {s: {rate: 22050, length: 8, loop: null, bytes: 0, file: "s.wav"}},
  };
  const samples = {s: {pcm: i16([1000, 2000, 3000, 4000, 3000, 2000, 1000, 0]), rate: 22050, loop: null}};

  const sf = readSf2(toSf2(lib, samples));
  const loudAtten = zoneGens(sf, 0, 0).find(g => g.op === 48), quietAtten = zoneGens(sf, 1, 0).find(g => g.op === 48);
  assert.ok(!loudAtten, "the loudest zone gets 0 cB attenuation (omitted — 0 is the SF2 default)");
  assert.ok(quietAtten && Math.abs(quietAtten.amt - 120) <= 1, "gain 1 vs loudest gain 4 -> ~120 cB: " + (quietAtten && quietAtten.amt));

  const files = toSfz(lib);
  const loudVol = files["0-loud.sfz"].match(/volume=(-?[\d.]+)/)[1], quietVol = files["1-quiet.sfz"].match(/volume=(-?[\d.]+)/)[1];
  assert.ok(Math.abs(+loudVol - 0) < 0.01, "loudest zone -> 0 dB: " + loudVol);
  assert.ok(Math.abs(+quietVol - -12.04) < 0.1, "gain 1 vs loudest gain 4 -> ~-12 dB: " + quietVol);

  // both file headers say the normalisation happened
  assert.match(Buffer.from(toSf2(lib, samples)).toString("ascii"), /normalised/);
  assert.match(files["0-loud.sfz"], /normalised/);
});

test("export.mjs helpers: splitPitch, zone expansion, name/slug uniqueness", () => {
  assert.deepEqual(splitPitch(60), {key: 60, cents: 0});
  assert.deepEqual(splitPitch(60.3), {key: 60, cents: 30});
  assert.deepEqual(splitPitch(59.999), {key: 60, cents: 0}, "rounds up into the next key rather than emitting cents=100");

  // a fixedPitch region spanning a key range (none of the real libraries do this)
  // still plays one fixed pitch at every key: split into one zone per key.
  const kit = {kind: "drum-kit", gain: 1, keyRegions: [{keyLo: 10, keyHi: 12, rootKey: 40, sample: "s", fixedPitch: true, fixedKey: 10}]};
  const zones = zonesForInstrument(kit);
  assert.equal(zones.length, 3);
  assert.deepEqual(zones.map(z => [z.keyLo, z.rootKey]), [[10, 40], [11, 41], [12, 42]], "rootKey shifts with key so key - rootKey stays constant");

  const names = new Set();
  assert.equal(shortName("Organ-like", names), "Organ-like");
  assert.equal(shortName("Organ-like", names), "Organ-like 2", "collisions get a unique suffix");
  assert.equal(slugify("Snare (missing)"), "snare-missing");

  // playableInstruments drops instruments with zero non-missing regions
  const dead = {used: true, keyRegions: [{keyLo: 0, keyHi: 1, sample: null, missing: true}]};
  const lib = {instruments: [dead]};
  assert.equal(playableInstruments(lib).length, 0);
});
