// End-to-end test of the VGM pipeline against a synthetic, self-built VGM
// (no copyrighted data): parse -> register log -> note reconstruction ->
// .notes.txt and MIDI emission. Expected values come from first principles
// (A440 equal temperament, the chips' published formulas), never from the
// code under test.
import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { makeTestVGM, TEST_NOTES, TEST_TIMING, TEST_PSG_PERIOD, TEST_TL, TEST_DAC_PEAK } from "../tools/vgm/make-test-vgm.mjs";
import { parseVGM, inflateVGM, isGzip, YM2612_NTSC, SN76489_NTSC } from "../tools/vgm/vgm.mjs";
import { reconstruct, toNotesTxt, pitchName, fmVelocity, psgVelocity, FRAME_SEC } from "../tools/vgm/notes.mjs";
import { makeMidi, MIDI_CHANNELS } from "../tools/vgm/midi-write.mjs";

const FREQ4 = [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00,
               415.30, 440.00, 466.16, 493.88]; // C4..B4
const freqOfMidi = m => FREQ4[((m % 12) + 12) % 12] * 2 ** (Math.floor(m / 12) - 5);
function nearestMidi(f) {
  let best = 0, bestD = Infinity;
  for (let m = -12; m < 160; m++) { // the chips reach past both MIDI edges; the pipeline doesn't clamp
    const d = Math.abs(Math.log2(f / freqOfMidi(m)));
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}
const onsetOf = k => TEST_TIMING.setup + k * (TEST_TIMING.hold + TEST_TIMING.gap);

// a bare log for unit tests that skip the file container
const fakeVgm = (log, endSample) => ({
  clocks: {ym2612: YM2612_NTSC, psg: SN76489_NTSC}, log, endSample,
  dac: {t: new Float64Array(0), v: new Uint8Array(0)}, dacStreams: [],
});
const ym = (t, addr, value, port = 0) => ({t, chip: "ym", port, addr, value});
const psg = (t, value) => ({t, chip: "psg", value});

test("VGM container: header, GD3, loop point, both wait families", () => {
  const vgm = parseVGM(makeTestVGM());
  assert.equal(vgm.version, 0x150);
  assert.equal(vgm.clocks.ym2612, YM2612_NTSC);
  assert.equal(vgm.clocks.psg, SN76489_NTSC);
  assert.equal(vgm.gd3.track, "Night Roll test tune");
  assert.equal(vgm.gd3.system, "Sega Mega Drive / Genesis");
  const loopLen = 4 * (TEST_TIMING.hold + TEST_TIMING.gap) + TEST_TIMING.tail;
  assert.equal(vgm.totalSamples, TEST_TIMING.setup + loopLen);
  assert.equal(vgm.endSample, vgm.totalSamples, "waits add up to the header's total");
  assert.equal(vgm.loopSample, TEST_TIMING.setup, "loop returns to the first note");
  assert.equal(vgm.loopSamples, loopLen);
  assert.equal(vgm.pcm.length, 64, "type-0 data block became the DAC bank");
  assert.equal(vgm.dac.t.length, 64, "one DAC write per 0x8n command");
  assert.ok(vgm.log.some(w => w.chip === "ym" && w.addr === 0x28), "key-on writes logged");
});

test("VGM container: .vgz inflates to the same log; the sync parser refuses gzip", async () => {
  const plain = makeTestVGM();
  const gz = gzipSync(plain);
  assert.ok(isGzip(gz));
  assert.throws(() => parseVGM(gz), /inflate/);
  const a = parseVGM(plain), b = parseVGM(await inflateVGM(gz));
  assert.equal(b.log.length, a.log.length);
  assert.equal(b.loopSample, a.loopSample);
  assert.deepEqual(b.gd3, a.gd3);
});

test("VGM pipeline: synthetic tune comes back note-perfect with channel identity", () => {
  const vgm = parseVGM(makeTestVGM());
  const events = reconstruct(vgm);

  const fm1 = events.filter(e => e.channel === "fm1");
  assert.deepEqual(fm1.map(e => pitchName(e.midi)), ["C4", "E4", "G4", "C5"]);
  fm1.forEach((e, k) => {
    assert.equal(e.startFrame, onsetOf(k), "onset " + k);
    assert.equal(e.endFrame - e.startFrame, TEST_TIMING.hold, "duration " + k);
    assert.equal(e.alg, 4);
  });
  // velocity from the carriers of algorithm 4 (op2 + op4), amplitudes summed,
  // square-law curve: 10^(-0.75*8/20) + 10^(-0.75*16/20)
  const amp = 10 ** (-0.75 * TEST_TL.op2 / 20) + 10 ** (-0.75 * TEST_TL.op4 / 20);
  assert.equal(fm1[0].vel, Math.round(127 * Math.sqrt(amp)));
  assert.equal(fm1[0].tl, TEST_TL.op2, "lowest carrier TL reported");
  assert.ok(events.every(e => e.channel !== "fm6"), "DAC mode never keys fm6");

  const psg1 = events.filter(e => e.channel === "psg1");
  assert.equal(psg1.length, 1, "the pedal is one note");
  assert.equal(pitchName(psg1[0].midi), "C3");
  assert.equal(psg1[0].period, TEST_PSG_PERIOD);
  assert.equal(psg1[0].startFrame, 0);
  assert.equal(psg1[0].endFrame, vgm.totalSamples - TEST_TIMING.tail);
  assert.equal(psg1[0].vel, 127);

  const noise = events.filter(e => e.channel === "noise");
  assert.equal(noise.length, 1, "the decay steps are one hit, not three");
  assert.equal(noise[0].startFrame, onsetOf(2));
  assert.equal(noise[0].endFrame - noise[0].startFrame, 3 * 2205);
  assert.equal(noise[0].label, "N0w");
  assert.equal(noise[0].vel, 127);
  assert.equal(noise[0].velEnd, psgVelocity(8), "decay target = last audible attenuation");

  const dac = events.filter(e => e.channel === "dac");
  assert.equal(dac.length, 1, "one burst = one hit");
  assert.equal(dac[0].startFrame, onsetOf(3) + 5, "sin(0) is 0x80: the hit begins at the first audible sample, one write (wait 5) later");
  // the bank is a decaying sine: its loudest sample is the first crest (i=4), already scaled by the envelope
  const peak = Math.max(...Array.from({length: 64}, (_, i) => Math.abs(Math.round(TEST_DAC_PEAK * Math.sin(2 * Math.PI * i / 16) * (1 - i / 64)))));
  assert.equal(dac[0].peak, peak);
  assert.equal(dac[0].vel, Math.round(127 * Math.sqrt(peak / 127)));

  const txt = toNotesTxt(events, {frames: vgm.totalSamples, bpm: 120, title: "test", loopSample: vgm.loopSample, gd3: vgm.gd3});
  assert.match(txt, /## channel fm1\nbar 1: 1 C4 1 tl8, 2 E4 1 tl8, 3 G4 1 tl8, 4 C5 1 tl8/);
  assert.match(txt, /## channel psg1\nbar 1: 1 C3 4 a0/);
  assert.match(txt, /## channel noise\nbar 1: 3 N0w 0\.33 a0/, "0.3 beats snaps to the triplet slot, as the NSF writer does");
  assert.match(txt, /## channel dac\nbar 1: 4 DAC 0\.25 p\d+/, "a 5 ms burst still prints (floored to a 16th)");
  assert.ok(txt.indexOf("## channel fm1") < txt.indexOf("## channel psg1") && txt.indexOf("## channel psg1") < txt.indexOf("## channel dac"), "chip order");
  assert.match(txt, /# loop: returns to bar 1 beat 1/);
  assert.match(txt, /no key is stated/);
});

test("Fnum/block → pitch: A440 anchor and a sweep over every block", () => {
  // anchor by hand: A4 at block 4 is Fnum 1082.7 (Sega2 lists 1081)
  assert.equal(Math.round(440 * 144 * 2 ** 17 / YM2612_NTSC), 1083);
  const log = [], cases = [];
  let t = 0;
  log.push(ym(t, 0xB0, 0), ym(t, 0x4C, 0));
  for (let block = 0; block < 8; block++) {
    for (let fnum = 300; fnum < 2048; fnum += 37) {
      log.push(ym(t, 0xA4, (block << 3) | (fnum >> 8)), ym(t, 0xA0, fnum & 0xFF), ym(t, 0x28, 0xF0));
      t += 100;
      log.push(ym(t, 0x28, 0x00));
      t += 10;
      cases.push(fnum * YM2612_NTSC / (144 * 2 ** (21 - block)));
    }
  }
  const events = reconstruct(fakeVgm(log, t + 1));
  assert.equal(events.length, cases.length, "one note per key-on");
  events.forEach((e, i) => assert.equal(e.midi, nearestMidi(cases[i]), `Fnum case ${i} (${cases[i].toFixed(2)} Hz)`));
});

test("Fnum latch: the low byte commits the block/high bits written BEFORE it", () => {
  const seq = (order) => {
    const log = [ym(0, 0xB0, 0), ym(0, 0x4C, 0)];
    if (order === "wrong") log.push(ym(0, 0xA0, 644 & 0xFF), ym(0, 0xA4, (4 << 3) | (644 >> 8)));
    else log.push(ym(0, 0xA4, (4 << 3) | (644 >> 8)), ym(0, 0xA0, 644 & 0xFF));
    log.push(ym(0, 0x28, 0xF0), ym(500, 0x28, 0x00));
    return reconstruct(fakeVgm(log, 600));
  };
  const right = seq("right");
  assert.equal(pitchName(right[0].midi), "C4");
  assert.deepEqual([right[0].block, right[0].fnum], [4, 644]);
  const wrong = seq("wrong");
  assert.deepEqual([wrong[0].block, wrong[0].fnum], [0, 644 & 0xFF], "stale latch: block 0, high bits 0");
});

test("FM key-on: port 1 channels, re-key at the same sample, vibrato guard, legato step", () => {
  const log = [];
  // fm5 (port 1, ch code 5): setup on port 1, key on via port 0 reg 0x28
  log.push(ym(0, 0xB1, 0, 1), ym(0, 0x4D, 0, 1), ym(0, 0xA5, (4 << 3) | (1083 >> 8), 1), ym(0, 0xA1, 1083 & 0xFF, 1));
  log.push(ym(0, 0x28, 0xF5));
  // vibrato: ±30 cents of wobble each tick must not split the note
  for (let i = 1; i <= 10; i++) {
    const f = 1083 + (i % 2 ? 19 : -19);
    log.push(ym(i * 735, 0xA5, (4 << 3) | (f >> 8), 1), ym(i * 735, 0xA1, f & 0xFF, 1));
  }
  // legato step up a fourth without a key-off: a new note, flagged
  log.push(ym(11 * 735, 0xA5, (4 << 3) | (1445 >> 8), 1), ym(11 * 735, 0xA1, 1445 & 0xFF, 1));
  // re-key at one sample: off then on = two notes abutting
  log.push(ym(15 * 735, 0x28, 0x05), ym(15 * 735, 0x28, 0xF5));
  log.push(ym(20 * 735, 0x28, 0x05));
  const ev = reconstruct(fakeVgm(log, 21 * 735)).filter(e => e.channel === "fm5");
  assert.deepEqual(ev.map(e => pitchName(e.midi)), ["A4", "D5", "D5"]);
  assert.deepEqual(ev.map(e => e.startFrame), [0, 11 * 735, 15 * 735]);
  assert.equal(ev[1].legato, true);
  assert.equal(ev[2].legato, undefined);
});

test("PSG period → pitch: every audible period maps to the nearest tempered note", () => {
  const log = [];
  let t = 0;
  const periods = [];
  for (let p = 8; p < 1024; p++) periods.push(p);
  for (const p of periods) {
    log.push(psg(t, 0x80 | (p & 0x0F)), psg(t, p >> 4), psg(t, 0x90)); // latch, data, attenuation 0
    t += 100;
    log.push(psg(t, 0x9F));
    t += 10;
  }
  const events = reconstruct(fakeVgm(log, t + 1));
  assert.equal(events.length, periods.length, "one note per period");
  events.forEach((e, i) => assert.equal(e.midi, nearestMidi(SN76489_NTSC / (32 * periods[i])), `period ${periods[i]}`));
  // landmarks: A4 = 254, C3 = 855
  assert.equal(pitchName(events[254 - 8].midi), "A4");
  assert.equal(pitchName(events[855 - 8].midi), "C3");
});

test("PSG: the latch/data pair is judged once; a nibble-crossing vibrato holds; re-attack via noise control", () => {
  // period 255 -> 256 crosses the low-nibble boundary: the latch byte alone
  // would read 240 (105 cents off) and shred the note — the pair must be
  // evaluated together
  const log = [psg(0, 0x80 | (255 & 15)), psg(0, 255 >> 4), psg(0, 0x90)];
  for (let i = 1; i <= 6; i++) {
    const p = i % 2 ? 256 : 255;
    log.push(psg(i * 735, 0x80 | (p & 15)), psg(i * 735, p >> 4));
  }
  log.push(psg(8 * 735, 0x9F));
  // noise: two hits, the second by rewriting the control register while audible
  log.push(psg(0, 0xE4), psg(0, 0xF2), psg(3 * 735, 0xE4), psg(6 * 735, 0xFF));
  const ev = reconstruct(fakeVgm(log, 9 * 735));
  const tone = ev.filter(e => e.channel === "psg1");
  assert.equal(tone.length, 1, "one held note");
  assert.equal(tone[0].endFrame, 8 * 735);
  const noise = ev.filter(e => e.channel === "noise");
  assert.deepEqual(noise.map(e => e.startFrame), [0, 3 * 735]);
  assert.equal(noise[0].vel, psgVelocity(2));
});

test("velocity curves: TL and attenuation map monotonically, carriers add per algorithm", () => {
  assert.equal(fmVelocity([0, 0, 0, 0], 0), 127);
  assert.equal(fmVelocity([127, 127, 127, 127], 7), 1);
  assert.ok(fmVelocity([0, 0, 0, 40], 0) < fmVelocity([0, 0, 0, 20], 0));
  // alg 0: only op4 carries — a loud op1 changes nothing
  assert.equal(fmVelocity([0, 127, 127, 40], 0), fmVelocity([127, 127, 127, 40], 0));
  // alg 4: op2 joins op4
  assert.ok(fmVelocity([127, 40, 127, 40], 4) > fmVelocity([127, 127, 127, 40], 4));
  assert.equal(psgVelocity(15), 0);
  assert.equal(psgVelocity(0), 127);
  assert.ok(psgVelocity(4) > psgVelocity(8));
});

// a minimal SMF reader: our writer emits full status bytes, so no running status
function readMidi(bytes) {
  const u32 = o => (bytes[o] << 24 | bytes[o + 1] << 16 | bytes[o + 2] << 8 | bytes[o + 3]) >>> 0;
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), "MThd");
  const nTracks = bytes[10] << 8 | bytes[11];
  const tracks = [];
  let o = 14;
  for (let n = 0; n < nTracks; n++) {
    assert.equal(String.fromCharCode(...bytes.subarray(o, o + 4)), "MTrk");
    const len = u32(o + 4);
    let i = o + 8, t = 0, name = "";
    const notes = [];
    const end = i + len;
    while (i < end) {
      let d = 0, b;
      do { b = bytes[i++]; d = (d << 7) | (b & 0x7F); } while (b & 0x80);
      t += d;
      const s = bytes[i++];
      if (s === 0xFF) {
        const type = bytes[i++], l = bytes[i++];
        if (type === 3) name = String.fromCharCode(...bytes.subarray(i, i + l));
        if (type === 6) notes.push({marker: String.fromCharCode(...bytes.subarray(i, i + l)), t});
        i += l;
      } else if ((s & 0xF0) === 0x90) { notes.push({t, ch: s & 15, p: bytes[i], v: bytes[i + 1]}); i += 2; }
      else i += 2; // 0x80 off, 0xA0 aftertouch, 0xB0 CC — all two data bytes
    }
    tracks.push({name, notes});
    o = end;
  }
  return tracks;
}

test("MIDI: one track per channel, channel map, quantized onsets, loop marker", () => {
  const vgm = parseVGM(makeTestVGM());
  const events = reconstruct(vgm);
  const tracks = readMidi(makeMidi(events, {bpm: 120, loopSample: vgm.loopSample}));
  assert.deepEqual(tracks.map(t => t.name), ["conductor", "fm1", "psg1", "noise", "dac"]);
  const fm1 = tracks[1].notes;
  assert.deepEqual(fm1.map(n => n.p), [60, 64, 67, 72]);
  assert.deepEqual(fm1.map(n => n.t), [0, 480, 960, 1440], "quarter notes on the grid");
  assert.ok(fm1.every(n => n.ch === MIDI_CHANNELS.fm1));
  assert.equal(tracks[2].notes[0].p, 48, "C3 pedal");
  assert.equal(tracks[3].notes[0].ch, 9, "noise on channel 10");
  assert.equal(tracks[4].notes[0].ch, 9, "DAC on channel 10");
  assert.equal(tracks[0].notes.find(n => n.marker)?.marker, "loop");
  assert.throws(() => makeMidi([{channel: "fm1", midi: 60, startFrame: -50000, endFrame: 5, vel: 100}], {bpm: 120}),
                /negative MIDI delta/);
  assert.equal(FRAME_SEC, 1 / 44100);
});
