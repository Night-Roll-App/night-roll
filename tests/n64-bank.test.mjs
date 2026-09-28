// The N64 console voice on synthetic data (no game bytes): the VADPCM
// decoder against hand-built codebooks and frames, the JP/US envelope
// state machine, a bank read from a hand-laid ctl/tbl pair, and one note
// rendered through renderN64 under the track name notes.mjs gives it.
// The real-ROM checks (loop states bit-exact, pitch) are in
// tests/n64-real.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { expandBook, decodeFrames, decodeSample } from "../tools/n64/vadpcm.mjs";
import { readBank, readEnvelope, byteView, findAudioFiles, DEFAULT_ENVELOPE } from "../tools/n64/bank.mjs";
import { readALSeqFile } from "../tools/n64/ead-usf.mjs";
import { SparseImage } from "../tools/n64/usf.mjs";
import { Adsr, renderN64, noteFrequency, UPDATES_PER_SECOND, reverbFor, panGains, notePan, Vibrato, Portamento } from "../tools/n64/render.mjs";
import { toMidi } from "../tools/n64/notes.mjs";
// a track is a stereo pair {l, r}; the old checks read the mono sum
const mono = p => { if (!p || !p.l) return p; const m = new Float32Array(p.l.length); for (let i = 0; i < m.length; i++) m[i] = p.l[i] + p.r[i]; return m; };
import { findSynthesisReverb } from "../tools/n64/ead-usf.mjs";
import { channelGroups } from "../tools/n64/notes.mjs";
import { TICKS_PER_BEAT } from "../tools/n64/constants.mjs";

const be32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const be16 = v => [(v >> 8) & 255, v & 255];
const f32 = v => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v); return [...new Uint8Array(d.buffer)]; };
// a frame: header scale<<4 | predictor, then 16 nibbles (signed, -8..7)
const frame = (scale, pred, nib) => { const f = [(scale << 4) | pred]; for (let i = 0; i < 16; i += 2) f.push(((nib[i] & 15) << 4) | (nib[i + 1] & 15)); return f; };

test("VADPCM: a zero book passes residuals through; an integrator book carries history across frames; scale and sign apply", () => {
  // zero coefficients: out = residual × 2^scale (the table's 2048 column is the residual's own weight, excluded from the sum)
  const zero = expandBook(2, 1, new Int16Array(16));
  const out = new Int16Array(32);
  const nib = []; for (let i = 0; i < 16; i++) nib.push(i < 8 ? 7 : -7);
  decodeFrames(Uint8Array.from([...frame(11, 0, nib), ...frame(0, 0, nib)]), 0, 2, zero, out, 0);
  assert.deepEqual([...out.subarray(0, 16)], nib.map(v => v * 2048));
  assert.deepEqual([...out.subarray(16, 32)], nib);
  // integrator: book[j=1][k] = 2048 for every output k (the newest history sample, weight 1.0): out[n] = out[n-1] + r[n]
  const book = new Int16Array(16); for (let k = 0; k < 8; k++) book[8 + k] = 2048;
  const integ = expandBook(2, 1, book);
  const ones = new Array(16).fill(1);
  const ramp = new Int16Array(32);
  decodeFrames(Uint8Array.from([...frame(0, 0, ones), ...frame(4, 0, ones)]), 0, 2, integ, ramp, 0);
  assert.deepEqual([...ramp.subarray(0, 16)], ones.map((_, i) => i + 1));
  assert.deepEqual([...ramp.subarray(16, 32)], ones.map((_, i) => 16 + 16 * (i + 1)), "the second frame starts from the first's last output; scale 4 = ×16");
  // decodeSample: Float32 in -1..1 to the loop's end, loop bounds through
  const smp = decodeSample(Uint8Array.from([...frame(11, 0, nib), ...frame(11, 0, nib)]), 0, 32, zero, {start: 16, end: 32, count: 0xFFFFFFFF});
  assert.equal(smp.pcm.length, 32);
  assert.ok(Math.abs(smp.pcm[0] - 14336 / 32768) < 1e-6);
  assert.deepEqual([smp.loopStart, smp.loopEnd, smp.looping], [16, 32, true]);
  assert.deepEqual([decodeSample(new Uint8Array(18), 0, 20, zero, {start: 0, end: 20, count: 0}).looping], [false]);
  assert.throws(() => expandBook(9, 1, new Int16Array(72)), /not a codebook/);
});

// The unit question, settled from the decomp (re-read 2026-09-27 after Josh's
// "notes cut off early" on Dire, Dire Docks). JP/US effects.c adsr_update,
// ADSR_STATE_LOOP default branch — the ONLY scaling of adsr->delay is EU/SH:
//   #if defined(VERSION_EU) || defined(VERSION_SH) || defined(VERSION_CN)
//       if (adsr->delay >= 4) { adsr->delay = adsr->delay * gAudioBufferParameters.updatesPerFrame / 4; }
//       ...
//   #else
//       adsr->target = BSWAP16(adsr->envelope[adsr->envIndex].arg);
//       adsr->velocity = ((adsr->target - adsr->current) << 0x10) / adsr->delay;
//   #endif
//   case ADSR_STATE_FADE:  adsr->currentHiRes += adsr->velocity; adsr->current = adsr->currentHiRes >> 0x10;
//                          if (--adsr->delay <= 0) adsr->state = ADSR_STATE_LOOP;
// One call per audio update: seqplayer.c process_sequences() ends in
// process_notes() (which calls adsr_update per note), and synthesis.c
// synthesis_execute runs `for (i = gAudioUpdatesPerFrame; i > 0; i--) { ...
// process_sequences(i - 1); ... }` once per 60 Hz audio frame; heap.c:
// gSamplesPerFrameTarget = ALIGN16(gAiFrequency / 60) = 544, gAudioUpdatesPerFrame
// = 544 / 160 + 1 = 4 → 240 updates/s (data.c agrees: gDefaultEnvelope's
// "[1000, 32000] stay there for 4.16 seconds"). Gate end, playback.c JP/US
// seq_channel_layer_decay_release_internal: fadeOutVel = (layer release
// rate, or the channel's when the layer's is 0) * 24, subtracted from the
// 0..32767 level per update (DECAY); RELEASE (0x8000 / gAudioUpdatesPerFrame)
// only when a layer is freed. Amplitude, playback.c process_notes JP/US:
// scale = adsrVolScale * 4.3498e-5f; velocity = velocity * scale * scale.
test("ADSR (JP/US adsr_update): linear fades in 16.16, hang, disable, goto, and the gate-end decay at releaseRate × 24 per update", () => {
  const a = new Adsr([[2, 32700], [1, 32700], [32700, 29430], [-1, 0]]);
  assert.equal(a.update(), 16350, "half way after one of two updates");
  assert.equal(a.update(), 32700);
  a.update(); // the 1-update hold
  const l3 = a.update();
  assert.ok(l3 < 32700 && l3 > 29430, "the long fade has begun: " + l3);
  a.decay(208); // gate end with the instrument's release rate
  const steps = []; for (let i = 0; i < 10; i++) steps.push(a.update());
  assert.equal(steps[0], l3 - 208 * 24);
  assert.ok(steps.some(v => v === 0) && a.done, "decays to 0 within 7 updates at 4992 per update: " + steps);
  // a disable-terminated envelope ends the note by itself
  const b = new Adsr([[4, 32000], [2, 0], [0, 0]]);
  for (let i = 0; i < 6; i++) b.update();
  assert.equal(b.update(), 0); assert.ok(b.done);
  // goto: index 1 loops back to index 0
  const c = new Adsr([[1, 1000], [-2, 0]]);
  assert.equal(c.update(), 1000); c.update(); // goto (no level change)
  assert.equal(c.update(), 1000, "restarted at index 0 from level 1000 (a no-op fade)");
  // hang holds
  const d = new Adsr(DEFAULT_ENVELOPE);
  for (let i = 0; i < 4; i++) d.update();
  assert.equal(d.update(), 32000); for (let i = 0; i < 1000; i++) d.update();
  assert.equal(d.update(), 32000, "hang after the 1000-update hold");
  assert.equal(UPDATES_PER_SECOND, 240);
  assert.ok(Math.abs(noteFrequency(39) - 1) < 1e-12 && Math.abs(noteFrequency(51) - 2) < 1e-12);
});

// A ctl entry (16-byte header + relocatable body) and a tbl slice with one
// 2000 Hz square-wave sample (16-sample period at 32 kHz, zero book), one
// instrument on it and one drum at half tuning.
function synthRom({looping = true} = {}) {
  const body = new Uint8Array(0x100);
  const put = (at, bytes) => body.set(bytes, at);
  put(0x00, be32(0xC0));                                   // drums list
  put(0x04, be32(0x20)); put(0x08, be32(0));               // instruments 0, 1 (none)
  put(0x20, [0, 0, 127, 208, ...be32(0xB0), ...be32(0), ...f32(0), ...be32(0x40), ...f32(1.0), ...be32(0), ...f32(0)]);
  put(0x40, [0, 0, 0, 0, ...be32(0), ...be32(0x60), ...be32(0x80), ...be32(36)]);   // sample: tbl offset 0, loop, book, size
  put(0x60, [...be32(looping ? 16 : 0), ...be32(64), ...be32(looping ? 0xFFFFFFFF : 0), ...be32(0), ...new Array(32).fill(0)]);
  put(0x80, [...be32(2), ...be32(1), ...new Array(32).fill(0)]);      // 16 zero coefficients: 0x88..0xA8
  put(0xB0, [...be16(2), ...be16(32700), ...be16(1), ...be16(32700), ...be16(32700), ...be16(29430), ...be16(0xFFFF), ...be16(0)]);
  put(0xC0, be32(0xD0));
  put(0xD0, [10, 64, 0, 0, ...be32(0x40), ...f32(0.5), ...be32(0xB0)]);
  const entry = Uint8Array.from([...be32(2), ...be32(1), ...be32(1), ...be32(0x19960319), ...body]);
  const nib = []; for (let i = 0; i < 16; i++) nib.push(i < 8 ? 7 : -7);
  const tblData = Uint8Array.from([...frame(11, 0, nib), ...frame(11, 0, nib), ...frame(11, 0, nib), ...frame(11, 0, nib)]);
  const rom = new SparseImage();
  const ctlAt = 0x1000, tblAt = 0x3000;
  const hdr = (rev, entries) => Uint8Array.from([...be16(rev), ...be16(entries.length), ...entries.flatMap(e => [...be32(e[0]), ...be32(e[1])])]);
  const second = (0x20 + entry.length + 15) & ~15;
  rom.write(ctlAt, hdr(1, [[0x20, entry.length], [second, entry.length]])); // two banks (the locator wants >= 2 ascending entries), the same bytes
  rom.write(ctlAt + 0x20, entry); rom.write(ctlAt + second, entry);
  rom.write(tblAt, hdr(2, [[0x20, tblData.length], [0x20, tblData.length]]));
  rom.write(tblAt + 0x20, tblData);
  return {rom, ctlAt, tblAt};
}

test("bank: header counts, relocatable offsets, key regions, envelope pairs, loop/book records, decoded PCM cached per sample", () => {
  const {rom, ctlAt, tblAt} = synthRom();
  const files = findAudioFiles(rom);
  assert.equal(files.ctl.at, ctlAt); assert.equal(files.tbl.at, tblAt, "the sample table is found by count after the ctl file");
  const bank = readBank(rom, files, 0);
  assert.equal(bank.numInstruments, 2); assert.equal(bank.numDrums, 1);
  assert.equal(bank.instruments[1], null);
  const inst = bank.instruments[0];
  assert.deepEqual([inst.normalRangeLo, inst.normalRangeHi, inst.releaseRate], [0, 127, 208]);
  assert.deepEqual(inst.envelope, [[2, 32700], [1, 32700], [32700, 29430], [-1, 0]]);
  assert.equal(inst.low, null); assert.equal(inst.high, null);
  assert.equal(inst.normal.tuning, 1);
  assert.equal(bank.sound(inst, 39), inst.normal);
  const rec = inst.normal.sample;
  assert.deepEqual([rec.addr, rec.rom, rec.samples, rec.frames, rec.loop.start, rec.loop.end, rec.loop.count, rec.book.order, rec.book.npredictors], [0, tblAt + 0x20, 64, 4, 16, 64, 0xFFFFFFFF, 2, 1]);
  assert.equal(bank.instrument(7), inst, "an id past the end plays the last instrument (get_instrument)");
  assert.equal(bank.drum(0).sound.sample, rec, "the drum shares the sample");
  assert.equal(bank.drum(0).sound.tuning, 0.5);
  const pcm = bank.pcm(rec);
  assert.equal(pcm, bank.pcm(rec), "decoded once");
  assert.equal(pcm.pcm.length, 64);
  assert.ok(Math.abs(pcm.pcm[3] - 14336 / 32768) < 1e-6 && Math.abs(pcm.pcm[11] + 14336 / 32768) < 1e-6);
  assert.deepEqual(readEnvelope(byteView(Uint8Array.from([...be16(3), ...be16(5), ...be16(0xFFFE), ...be16(0)])), 0), [[3, 5], [-2, 0]]);
  assert.throws(() => readBank(rom, files, 5), /ctl table has 2 entries/);
  assert.equal(readALSeqFile(rom, tblAt).count, 2);
});

test("renderN64: the note sounds under notes.mjs's track name at the sample's pitch, holds through the loop, decays after the gate; the drum at half tuning", async () => {
  const {rom} = synthRom();
  const B = TICKS_PER_BEAT;
  const res = {abi: "sm64", tempos: [{tick: 0, bpm: 120}], endTick: 4 * B, warnings: [],
               notes: [{tick: 0, dur: 2 * B, ch: 4, layer: 0, semitone: 39, drum: false, midi: 60, vel: 127, inst: 0, bank: 0, vol: 1, pan: 0.5, freq: 1, chInst: 0},
                       {tick: 0, dur: B, ch: 9, layer: 0, semitone: 0, drum: true, midi: null, vel: 127, inst: 0x7F, bank: 0, vol: 1, pan: 0.5, freq: 1},
                       {tick: 3 * B, dur: B / 2, ch: 4, layer: 0, semitone: 27, drum: false, midi: 48, vel: 64, inst: 0, bank: 0, vol: 1, pan: 0.5, freq: 1, chInst: 0}]};
  assert.deepEqual(channelGroups(res).map(g => g.name), ["ch 4 inst 0", "ch 9 drums"]);
  const progress = [];
  const r = await renderN64(res, {rom, banks: [0], sampleRate: 32000, reverb: null, onProgress: p => progress.push(p)}); // a synthetic bank carries no engine state: dry, on purpose
  assert.equal(r.sampleRate, 32000);
  assert.ok(Math.abs(r.seconds - 4.5) < 1e-9, "one pass + 2.5 s tail: " + r.seconds);
  assert.deepEqual(progress[progress.length - 1], 1);
  assert.ok(r["ch 4 inst 0"].l instanceof Float32Array && r["ch 4 inst 0"].r instanceof Float32Array && r["ch 9 drums"].l.length === r["ch 9 drums"].r.length, "stereo pairs");
  const mel = mono(r["ch 4 inst 0"]), kit = mono(r["ch 9 drums"]);
  const rms = (a, s0, s1) => { let s = 0; for (let i = s0; i < s1; i++) s += a[i] * a[i]; return Math.sqrt(s / (s1 - s0)); };
  assert.ok(rms(mel, 8000, 30000) > 0.2, "held through the loop: " + rms(mel, 8000, 30000));       // 1 s note at 120 bpm = 32000 samples
  assert.ok(rms(mel, 32000 + 3200, 32000 + 6400) < 0.01, "quiet 0.1 s after the gate (208 × 24 per update)");
  // pitch: a 16-sample period at semitone 39 (tuning 1) = 2000 Hz; semitone 27 = 1000 Hz (32 samples)
  const period = (a, from, n) => { let best = 0, bv = -1; for (let lag = 4; lag < 200; lag++) { let s = 0; for (let i = from; i < from + n; i++) s += a[i] * a[i + lag]; if (s > bv) { bv = s; best = lag; } } return best; };
  assert.equal(period(mel, 8000, 4000), 16);
  assert.equal(period(mel, Math.floor(1.5 * 32000) + 800, 2000), 32);
  assert.equal(period(kit, 800, 2000), 32, "the drum's tuning 0.5 halves the pitch");
  assert.ok(rms(kit, 0, 16000) > 0.2 && rms(kit, 17000, 20000) > 0.1 && rms(kit, 36000, 40000) < 0.001,
            "the drum holds to its gate at 0.5 s, then decays at release 10 → 240 per update (0.57 s): gone by 1.1 s");
  assert.deepEqual(r.silent, []); assert.deepEqual(r.warnings, []);
  // a one-shot sample stops at its end even while the note holds
  const one = synthRom({looping: false});
  const r2 = await renderN64(res, {rom: one.rom, banks: [0], reverb: null});
  assert.ok(rms(mono(r2["ch 4 inst 0"]), 0, 64) > 0.02 && rms(mono(r2["ch 4 inst 0"]), 64, 4000) === 0, "64 samples (still in the 2-update attack) then nothing");
  // notes the renderer cannot voice are reported, not thrown
  const r3 = await renderN64({...res, notes: [{...res.notes[0], inst: 0x80}]}, {rom, banks: [0], reverb: null});
  assert.deepEqual(r3.silent, ["ch 4 inst 128"]);
  assert.match(r3.warnings[0], /synth waveform/);
});

test("reverb: the note's send comes back one window later at unity, then again scaled by the gain; off when asked; the engine's state read from RAM, never a table", async () => {
  const {rom} = synthRom({looping: false});
  const B = TICKS_PER_BEAT;
  const note = {tick: 0, dur: B, ch: 4, layer: 0, semitone: 39, drum: false, midi: 60, vel: 127, inst: 0, bank: 0, vol: 1, pan: 0.5, freq: 1, chInst: 0, rev: 127};
  const res = {abi: "sm64", tempos: [{tick: 0, bpm: 120}], endTick: B, warnings: [], notes: [note]};
  const dry = mono((await renderN64(res, {rom, banks: [0], reverb: null}))["ch 4 inst 0"]);
  const r = await renderN64(res, {rom, banks: [0], reverb: {window: 1000, gain: 0x4000}});
  const wet = mono(r["ch 4 inst 0"]);
  assert.deepEqual(r.reverb, {window: 1000, gain: 0x4000});
  let peak = 0; for (let i = 0; i < 64; i++) peak = Math.max(peak, Math.abs(dry[i]));
  assert.ok(peak > 0.05, "the one-shot sounds: " + peak);
  for (let i = 0; i < 64; i++) {
    assert.ok(Math.abs(wet[i] - dry[i]) < 1e-6, "dry part unchanged");
    assert.ok(Math.abs(wet[1000 + i] - dry[i] * 127 / 128) < 1e-6, "first echo at W: reverbVol/128 of the dry signal");
    assert.ok(Math.abs(wet[2000 + i] - dry[i] * 127 / 128 * 0.5) < 1e-6, "second echo: × gain/0x8000");
    assert.ok(Math.abs(wet[3000 + i] - dry[i] * 127 / 128 * 0.25) < 1e-6);
  }
  assert.equal(dry[1000] + dry[2000], 0, "no echo without reverb");
  // a note without a send (D4 0) adds nothing to the ring
  const r0 = await renderN64({...res, notes: [{...note, rev: 0}]}, {rom, banks: [0], reverb: {window: 1000, gain: 0x4000}});
  assert.equal(mono(r0["ch 4 inst 0"])[1000], 0);
  // the engine's SynthesisReverb (JP/US layout) found by shape in a RAM image: {u8 resampleFlags, useReverb,
  // framesLeftToIgnore, curFrame; u16 reverbGain; u16 resampleRate; s32 ×2; s32 bufSizePerChannel; s16 *left, *right}
  const ram = new SparseImage();
  ram.write(0x220DB0, Uint8Array.from([0, 8, 2, 0, 0x2F, 0xFF, 0, 0]));
  ram.write(0x220DC0, Uint8Array.from([...be32(0x0C00), ...be32(0x801D8E00), ...be32(0x801DA600)]));
  ram.write(0x1000, Uint8Array.from([0, 8, 0, 0, 0x3F, 0xFF, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...be32(0x0E00), ...be32(0x80100000), ...be32(0x80101000)])); // ring pointers not window*2 apart: not it
  assert.deepEqual(findSynthesisReverb(ram), {at: 0x220DB0, useReverb: 8, gain: 0x2FFF, window: 0x0C00});
  assert.deepEqual(reverbFor({}, {reverb: {at: 0x220DB0, useReverb: 8, gain: 0x2FFF, window: 0x0C00}}), {reverb: {window: 0x0C00, gain: 0x2FFF}, why: null});
  assert.deepEqual(reverbFor({}, {reverb: {at: 0, useReverb: 0, gain: 0x2FFF, window: 0x0C00}}), {reverb: null, why: null}, "useReverb 0 = the engine had it off");
  assert.deepEqual(reverbFor({}, {reverb: null}), {reverb: null, why: "reverb state not in this rip"});
  assert.deepEqual(reverbFor({}, {}), {reverb: null, why: "reverb state not in this rip"});
  assert.deepEqual(reverbFor({reverb: null}, {reverb: {useReverb: 8, gain: 1, window: 1}}), {reverb: null, why: null});
  const dryByDefault = await renderN64({...res, reverb: null}, {rom, banks: [0]});
  assert.equal(mono(dryByDefault["ch 4 inst 0"])[1000], 0);
  assert.deepEqual(dryByDefault.warnings, ["reverb state not in this rip"]);
});

test("stereo: the console's pan law (equal-power, panIndex = (s32)(pan × 127.5) & 127) — hard left leaves the right side silent, centre sits −3 dB in each; toMidi writes the pan as CC10", async () => {
  const {rom} = synthRom();
  const B = TICKS_PER_BEAT;
  const base = {tick: 0, dur: B, ch: 4, layer: 0, semitone: 39, drum: false, midi: 60, vel: 127, inst: 0, bank: 0, vol: 1, freq: 1, chInst: 0};
  const res = {abi: "sm64", tempos: [{tick: 0, bpm: 120}], endTick: 4 * B, warnings: [], notes: [
    {...base, pan: 0},                                                    // DD 0: hard left
    {...base, tick: B, pan: 0.5},                                         // DD 0x40: centre
    {...base, tick: 2 * B, pan: 127 / 128},                               // DD 0x7F: hard right
    {...base, tick: 3 * B, pan: 0, panWeight: 0, lyPan: 1},               // DC 0 + CA 0x80: the layer's pan, right
  ]};
  const r = await renderN64(res, {rom, banks: [0], reverb: null});
  const p = r["ch 4 inst 0"], sr = r.sampleRate;
  const rmsAt = (a, t0, t1) => { let s = 0; for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) s += a[i] * a[i]; return Math.sqrt(s / ((t1 - t0) * sr)); };
  assert.ok(rmsAt(p.l, 0.05, 0.4) > 0.1 && rmsAt(p.r, 0.05, 0.4) === 0, "hard left: right silent");
  const cl = rmsAt(p.l, 0.55, 0.9), cr = rmsAt(p.r, 0.55, 0.9);
  assert.ok(Math.abs(20 * Math.log10(cl / cr)) < 0.2, "centre: equal within 0.2 dB: " + cl.toFixed(4) + " " + cr.toFixed(4));
  assert.ok(Math.abs(20 * Math.log10(cl / rmsAt(p.l, 0.05, 0.4))) < 3.3 && Math.abs(20 * Math.log10(cl / rmsAt(p.l, 0.05, 0.4))) > 2.7, "centre is −3 dB per side against hard left");
  assert.ok(rmsAt(p.r, 1.05, 1.4) > 0.1 && rmsAt(p.l, 1.05, 1.4) < 0.02 * rmsAt(p.r, 1.05, 1.4) && rmsAt(p.l, 1.05, 1.4) > 0, "DD 0x7F: index 126, left down to cos(π/2·126/127) = 1.2 % of the right");
  assert.ok(rmsAt(p.r, 1.55, 1.9) > 0.1 && rmsAt(p.l, 1.55, 1.9) === 0, "pan weight 0: the layer's pan (CA 0x80 = 1.0 → index 127) wins");
  assert.deepEqual(panGains(0), [1, 0]); assert.deepEqual(panGains(1).map(v => +v.toFixed(6)), [0, 1]);
  assert.deepEqual(panGains(0.5).map(v => +v.toFixed(4)), [+Math.cos(Math.PI / 2 * 63 / 127).toFixed(4), +Math.cos(Math.PI / 2 * 64 / 127).toFixed(4)]);
  assert.equal(notePan({pan: 0.25, panWeight: 0.5, lyPan: 0.75}), 0.5, "notePan = chan × w + layer × (1 − w)");
  assert.equal(notePan({pan: 0.25, panWeight: 0}, {pan: 0x60}), 0.75, "a drum brings its own pan unless CC said otherwise");
  assert.equal(notePan({pan: 0.25, panWeight: 0, lyPan: 0.5, noDrumPan: true}, {pan: 0x60}), 0.5);
  // the MIDI: CC10 at tick 0 (the first note's 0 → 0), then at each note whose pan differs (64, 126, 127)
  const mid = toMidi(res), hex = [...mid].map(b => b.toString(16).padStart(2, "0")).join(" ");
  assert.ok(hex.indexOf("b4 0a 00") >= 0 && hex.indexOf("b4 0a 00") < hex.indexOf("94 3c 7f"), "CC10 0 before the first note-on (channel 4: 94; the track name meta sits between)");
  assert.match(hex, /b4 0a 40/); assert.match(hex, /b4 0a 7e/); assert.match(hex, /b4 0a 7f/);
  assert.equal((hex.match(/b4 0a /g) || []).length, 4, "one per change, not per note");
});

test("level steps under a held note (n.gain) are followed per update: a 1 → 0.1 step halfway drops the level 20 dB; vel stays the note-on value for the MIDI", async () => {
  const {rom} = synthRom();
  const B = TICKS_PER_BEAT;
  const note = {tick: 0, dur: 2 * B, ch: 4, layer: 0, semitone: 39, drum: false, midi: 60, vel: 127, inst: 0, bank: 0, vol: 1, pan: 0.5, freq: 1, chInst: 0,
                gain: [{t: 0, l: 1}, {t: B, l: 0.1}]}; // DF halfway: the channel's level steps to a tenth
  const res = {abi: "sm64", tempos: [{tick: 0, bpm: 120}], endTick: 2 * B, warnings: [], notes: [note]};
  const r = await renderN64(res, {rom, banks: [0], reverb: null}), p = r["ch 4 inst 0"];
  const rmsAt = (a, t0, t1) => { let s = 0; for (let i = Math.floor(t0 * 32000); i < Math.floor(t1 * 32000); i++) s += a[i] * a[i]; return Math.sqrt(s / ((t1 - t0) * 32000)); };
  const before = rmsAt(p.l, 0.1, 0.45), after = rmsAt(p.l, 0.55, 0.9);
  assert.ok(Math.abs(20 * Math.log10(after / before) + 20) < 0.7, "−20 dB after the step: " + (20 * Math.log10(after / before)).toFixed(2));
  const flat = (await renderN64({...res, notes: [{...note, gain: undefined}]}, {rom, banks: [0], reverb: null}))["ch 4 inst 0"];
  assert.ok(Math.abs(20 * Math.log10(rmsAt(flat.l, 0.55, 0.9) / rmsAt(flat.l, 0.1, 0.45))) < 0.7, "without the step the second half holds");
  const mid = toMidi(res), hex = [...mid].map(b => b.toString(16).padStart(2, "0")).join(" ");
  assert.match(hex, /94 3c 7f/, "the MIDI keeps velocity 127: the step is the render's");
});

test("vibrato as effects.c JP/US: delay, triangle over 64 steps of the k·8 curve, scale = 1 + extent/4096·(2^(pc/127) − 1); a D8 note wobbles in the render, a note born without extent does not", async () => {
  // rate 0x800: one triangle per 32 updates; extent 8·127 = 1016 → peak +23 % / −13.4 % (the game's asymmetric bend)
  const v = new Vibrato({rateStart: 0x800, rateTarget: 0x800, rateDelay: 0, extStart: 0, extTarget: 1016, extDelay: 0, delay: 2});
  assert.equal(v.update(), 1); assert.equal(v.update(), 1, "two updates of delay");
  const seq = []; for (let i = 0; i < 32; i++) seq.push(v.update());
  const peak = Math.max(...seq), trough = Math.min(...seq);
  assert.ok(Math.abs(peak - (1 + 1016 / 4096 * (Math.pow(2, 120 / 127) - 1))) < 1e-9, "peak at pitchChange 120: " + peak);
  assert.ok(Math.abs(trough - (1 + 1016 / 4096 * (Math.pow(2, -120 / 127) - 1))) < 1e-9, "trough at −120: " + trough);
  assert.equal(seq.indexOf(peak), 7, "rate 0x800 advances the index 2 per update: pitchChange 120 (index 16, folded to the curve's 15) on the 8th update");
  // extent ramp E2: start 0 → target 1016 over 4 updates, then steady
  const e = new Vibrato({rateStart: 0x800, rateTarget: 0x800, rateDelay: 0, extStart: 0, extTarget: 1016, extDelay: 4, delay: 0});
  const ramp = []; for (let i = 0; i < 6; i++) { e.update(); ramp.push(e.ext); }
  assert.deepEqual(ramp, [254, 508, 762, 1016, 1016, 1016]);
  // live retarget (a D8 while held) is followed at once when the channel has no change delay
  e.retarget({rateTarget: 0x800, rateDelay: 0, extTarget: 0, extDelay: 0}); e.update(); assert.equal(e.ext, 0);
  // in the render: zero crossings per 100 ms window swing with the pitch
  const {rom} = synthRom();
  const B = TICKS_PER_BEAT, base = {tick: 0, dur: 4 * B, ch: 4, layer: 0, semitone: 39, drum: false, midi: 60, vel: 127, inst: 0, bank: 0, vol: 1, pan: 0.5, freq: 1, chInst: 0};
  const vib = {rateStart: 256, rateTarget: 256, rateDelay: 0, extStart: 0, extTarget: 1016, extDelay: 0, delay: 0}; // rate 256: one cycle per 256 updates ≈ 1.07 s
  const r = await renderN64({abi: "sm64", tempos: [{tick: 0, bpm: 120}], endTick: 4 * B, warnings: [], notes: [{...base, vib}]}, {rom, banks: [0], reverb: null});
  const zc = (a, t0, t1) => { let c = 0; for (let i = Math.floor(t0 * 32000) + 1; i < Math.floor(t1 * 32000); i++) if ((a[i - 1] < 0) !== (a[i] < 0)) c++; return c; };
  const l = r["ch 4 inst 0"].l, up = zc(l, 0.2, 0.3), down = zc(l, 0.75, 0.85); // +23 % at ~0.27 s, −13 % at ~0.8 s
  assert.ok(up > 2000 * 0.1 * 2 * 1.15 && down < 2000 * 0.1 * 2 * 0.92, "2 kHz wobbles up then down: " + up + " / " + down);
  const flat = (await renderN64({abi: "sm64", tempos: [{tick: 0, bpm: 120}], endTick: 4 * B, warnings: [], notes: [{...base, vib: null}]}, {rom, banks: [0], reverb: null}))["ch 4 inst 0"].l;
  assert.ok(Math.abs(zc(flat, 0.2, 0.3) - 400) <= 2 && Math.abs(zc(flat, 0.75, 0.85) - 400) <= 2, "no extent: 2 kHz steady");
});

test("portamento in the render: the voice starts on the glide's start semitone and reaches the written pitch after `updates` updates (cur += 127/updates, 2^(cur/127))", async () => {
  const p = new Portamento({start: 27, end: 39, updates: 48}); // an octave below, 48 updates
  const seq = []; for (let i = 0; i < 60; i++) seq.push(p.update());
  assert.ok(Math.abs(seq[0] - (1 + (2 - 1) * (Math.pow(2, 2 / 127) - 1))) < 1e-12, "the first update is already one step in (cur = 2.6 → v 2)");
  assert.ok(Math.abs(seq[48] - 2) < 1e-12 && seq[59] === 2 && seq[47] < 2, "an octave up on the 49th update ((u32)cur truncates 126.99), then held");
  const {rom} = synthRom();
  const B = TICKS_PER_BEAT, base = {tick: 0, dur: 2 * B, ch: 4, layer: 0, semitone: 39, drum: false, midi: 60, vel: 127, inst: 0, bank: 0, vol: 1, pan: 0.5, freq: 1, chInst: 0};
  const glide = {mode: 1, start: 27, end: 39, updates: 120, special: false, time: 120}; // 0.5 s glide from an octave below
  const r = await renderN64({abi: "sm64", tempos: [{tick: 0, bpm: 120}], endTick: 2 * B, warnings: [], notes: [{...base, porta: glide}]}, {rom, banks: [0], reverb: null});
  const zc = (a, t0, t1) => { let c = 0; for (let i = Math.floor(t0 * 32000) + 1; i < Math.floor(t1 * 32000); i++) if ((a[i - 1] < 0) !== (a[i] < 0)) c++; return c; };
  const l = r["ch 4 inst 0"].l;
  assert.ok(Math.abs(zc(l, 0.02, 0.12) - 200) < 25, "starts an octave down (1 kHz): " + zc(l, 0.02, 0.12));
  assert.ok(Math.abs(zc(l, 0.6, 0.7) - 400) <= 2, "lands on the written 2 kHz: " + zc(l, 0.6, 0.7));
  const mid = zc(l, 0.22, 0.32); assert.ok(mid > 240 && mid < 360, "and is between at a quarter of the way: " + mid);
});

// ---- the oot generation (Ocarina of Time / Majora's Mask layout) -----------
// A set whose tables live in RDRAM like OoT's: gSoundFontTable (4 fonts),
// gSequenceFontTable, gSequenceTable, gSampleBankTable (bank 1 a zero row =
// alias of 0, the way the rips carry it); font 0 unrelocated in the ROM
// pages, font 1 relocated in RDRAM at soundFontList[1].instruments − 8 —
// and font 0's soundFontList record left pointing at font 1's slot (stale),
// as a real rip leaves it; two SynthesisReverbs with the unread fields absent.
import { readFont, ootFontSource, OOT_DEFAULT_ENVELOPE } from "../tools/n64/bank.mjs";
import { locateEAD, findSoundFontList, findOotReverbs } from "../tools/n64/ead-usf.mjs";
import { PJ64_RDRAM, swapWords } from "../tools/n64/usf.mjs";
import { OotAdsr, ootDecayRate, ootPitch, ootPanGains, OOT_UPDATES_PER_SECOND } from "../tools/n64/render.mjs";
import { parseSequence, ootFilterTaps } from "../tools/n64/seq-libultra.mjs";

const AUDIOBANK = 0xD390, AUDIOTABLE = 0x79470, AUDIOSEQ = 0x29DE0, FONT1_RAM = 0x1C43D0, SFLIST = 0x190F60;
// the font blob: header words, one instrument (0), a drum list with one drum, a square-wave sample
function ootFontBlob(reloc) {
  const b = new Uint8Array(0x100), put = (at, bytes) => b.set(bytes, at);
  const P = off => reloc == null ? off : (0x80000000 + reloc + off) >>> 0;       // relocated: a RAM pointer
  put(0x00, be32(P(0xC0))); put(0x04, be32(0)); put(0x08, be32(P(0x20))); put(0x0C, be32(0));
  put(0x20, [reloc == null ? 0 : 1, 0, 127, 240, ...be32(P(0xB0)), ...be32(0), ...f32(0), ...be32(P(0x40)), ...f32(1.0), ...be32(0), ...f32(0)]);
  // Sample: {codec 0, medium 0 (bank 1) / relocated: medium 2 (cart), isRelocated 1; size 36}; sampleAddr; loop; book
  put(0x40, [...be32(reloc == null ? 36 : (2 << 26 | 1 << 24 | 36) >>> 0), ...be32(reloc == null ? 0 : AUDIOTABLE), ...be32(P(0x60)), ...be32(P(0x80))]);
  put(0x60, [...be32(16), ...be32(64), ...be32(0xFFFFFFFF), ...be32(0), ...new Array(32).fill(0)]);
  put(0x80, [...be32(2), ...be32(1)]);
  put(0xB0, [...be16(2), ...be16(32700), ...be16(1), ...be16(32700), ...be16(32700), ...be16(29430), ...be16(0xFFFF), ...be16(0)]);
  put(0xC0, be32(P(0xD0)));
  put(0xD0, [0, 100, reloc == null ? 0 : 1, 0, ...be32(P(0x40)), ...f32(0.5), ...be32(P(0xB0))]);
  return b;
}
function ootSet() {
  const ram = new SparseImage(), rom = new SparseImage();
  const table = (count, romAddr, rows) => Uint8Array.from([...be16(count), ...be16(0), ...be32(romAddr), ...new Array(8).fill(0),
    ...rows.flatMap(r => [...be32(r.rom), ...be32(r.size), r.medium ?? 2, r.cp ?? 2, ...be16(r.s1 ?? 0), ...be16(r.s2 ?? 0), ...be16(r.s3 ?? 0)])]);
  // fonts: sample banks 1/none, 1 instrument, 1 drum (short1 = bank1<<8 | bank2, short2 = numInst<<8 | numDrums)
  const fontRow = i => ({rom: AUDIOBANK + i * 0x100, size: 0x100, s1: 0x01FF, s2: 0x0101, s3: 0});
  const fonts = table(4, AUDIOBANK, [0, 1, 2, 3].map(fontRow));
  const seqFonts = Uint8Array.from([...be16(4), ...be16(6), 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);   // seq 0 -> [0], seq 1 -> [1]
  const seqs = table(2, AUDIOSEQ, [{rom: AUDIOSEQ, size: 0x40}, {rom: AUDIOSEQ + 0x40, size: 0x40}]);
  const at = 0x113740; ram.write(at, fonts); ram.write(at + fonts.length, seqFonts);
  const seqAt = at + fonts.length + seqFonts.length; ram.write(seqAt, seqs);
  const banksAt = seqAt + seqs.length;
  ram.write(banksAt, Uint8Array.from([...be16(2), ...be16(0), ...be32(AUDIOTABLE), ...new Array(8).fill(0), ...be32(AUDIOTABLE), ...be32(0x1000), 2, 4, 0, 0]));
  ram.write(banksAt + 0x20 + 8, Uint8Array.from([2, 4, 0, 0]));                                     // bank 1: only the medium/cache bytes (address and size are zeros the rip left out)
  // soundFontList: records for all four fonts; font 0's pointer is stale (font 1's slot)
  for (let i = 0; i < 4; i++) ram.write(SFLIST + i * 0x14, Uint8Array.from([1, 1, 1, 0xFF, 0, 0, 0, 0, ...be32(0x80000000 + FONT1_RAM + 8)]));
  ram.write(FONT1_RAM, ootFontBlob(FONT1_RAM));
  rom.write(AUDIOBANK, ootFontBlob(null));                                                            // font 0: in the ROM pages
  const nib = []; for (let i = 0; i < 16; i++) nib.push(i < 8 ? 7 : -7);
  rom.write(AUDIOTABLE, Uint8Array.from([...frame(11, 0, nib), ...frame(11, 0, nib), ...frame(11, 0, nib), ...frame(11, 0, nib)]));
  // SynthesisReverb ×2 (oot stride 0x2C8): prefix, the ring pointers, reverb 1's filter taps; the rest absent
  const rv = (p, decay, filt) => {
    ram.write(p, Uint8Array.from([0, 8, 0, 1, 1, 0xFF, ...be16(0x0C00), ...be16(0x3000), ...be16(0x7FFF), ...be16(decay), 0, 0]));
    ram.write(p + 0x24, Uint8Array.from([...be32(0x0C00), ...be32(0x801A7D40 + (p & 0xFFFF)), ...be32(0x801A7D40 + (p & 0xFFFF) + 0x1800)]));
    if (filt) { ram.write(p + 0x270, Uint8Array.from([...be32(0x801ADD80), ...be32(0x801ADD80)])); ram.write(0x1ADD80, Uint8Array.from(ootFilterTaps(1, 0).flatMap(be16))); }
  };
  rv(0x125648, 0x3000, false); rv(0x125648 + 0x2C8, 0x1800, true);
  const state = new SparseImage();
  const hdr = new Uint8Array(0x50); hdr.set([0xC8, 0xA6, 0xD8, 0x23], 0); hdr.set([0, 0, 0x40, 0], 4); state.write(0, hdr);
  for (const r of ram.ranges) { const a = r.offset & ~3, bytes = new Uint8Array(((r.offset + r.bytes.length + 3) & ~3) - a); bytes.set(ram.read(a, bytes.length)); state.write(PJ64_RDRAM + a, swapWords(bytes)); }
  return {rom, state};
}

test("oot fonts: counts from the table's shorts, the ROM copy unrelocated (sample bank 1 = its zero row, an alias of 0), the resident copy relocated in RDRAM; a stale soundFontList pointer never wins", () => {
  const set = ootSet(), loc = locateEAD(set);
  assert.equal(loc.gen, "oot");
  assert.deepEqual(loc.sequences.map(s => s.banks), [[0], [1]]);
  assert.ok(loc.sampleBankTable && loc.audiotable === AUDIOTABLE, "the sample bank table follows the sequence table");
  assert.equal(findSoundFontList(ootMemoryRam(set), loc.fontTable), SFLIST);
  const f0 = readFont(set, loc, 0), f1 = readFont(set, loc, 1);
  assert.deepEqual([f0.source, f0.base], ["rom", AUDIOBANK], "ROM pages first: font 0's RAM record is stale");
  assert.deepEqual([f1.source, f1.base], ["ram", 0x80000000 + FONT1_RAM], "font 1 was resident: relocated in RDRAM");
  for (const f of [f0, f1]) {
    assert.deepEqual([f.numInstruments, f.numDrums, f.numSfx, ...f.sampleBankIds], [1, 1, 0, 1, 0xFF]);
    const inst = f.instruments[0];
    assert.deepEqual([inst.normalRangeLo, inst.normalRangeHi, inst.decayIndex], [0, 127, 240]);
    assert.deepEqual(inst.envelope, [[2, 32700], [1, 32700], [32700, 29430], [-1, 0]]);
    assert.equal(inst.low, null, "low only when normalRangeLo != 0"); assert.equal(inst.high, null, "high only when normalRangeHi != 0x7F");
    assert.equal(f.instrument(1), null, "no fallback past the count (Audio_GetInstrumentInner)");
    const s = inst.normal.sample;
    assert.deepEqual([s.codec, s.rom, s.samples, s.loop.start, s.loop.end, s.book.order, s.book.npredictors], [0, AUDIOTABLE, 64, 16, 64, 2, 1]);
    assert.equal(f.drum(0).pan, 100); assert.equal(f.drum(0).sound.tuning, 0.5); assert.equal(f.drum(0).sound.sample, s, "shared sample record");
    const pcm = f.pcm(s);
    assert.equal(pcm.pcm.length, 64); assert.ok(pcm.looping);
    assert.ok(Math.abs(pcm.pcm[3] - 14336 / 32768) < 1e-6 && Math.abs(pcm.pcm[11] + 14336 / 32768) < 1e-6);
  }
  assert.deepEqual([f0.instruments[0].normal.sample.relocated, f0.instruments[0].normal.sample.bankId], [false, 1]);
  assert.deepEqual([f1.instruments[0].normal.sample.relocated, f1.instruments[0].normal.sample.medium], [true, 2]);
  assert.throws(() => ootFontSource(set, loc, 9), /table entry/);
});
function ootMemoryRam(set) { return rdramOfState(set.state); }
import { rdramOf as rdramOfFn } from "../tools/n64/usf.mjs";
function rdramOfState(state) { return rdramOfFn(state).ram; }

test("oot reverbs: SynthesisReverb found by shape with its unread fields absent; the array's stride gives the indices; the filter's taps read from RAM", () => {
  const set = ootSet(), rv = findOotReverbs(rdramOfState(set.state));
  assert.deepEqual(rv.map(r => [r.index, r.at, r.downsampleRate, r.window, r.volume, r.decayRatio, r.leakRtl, r.mixIndex]),
                   [[0, 0x125648, 1, 3072, 0x7FFF, 0x3000, 0, -1], [1, 0x125648 + 0x2C8, 1, 3072, 0x7FFF, 0x1800, 0, -1]]);
  assert.equal(rv[0].filterLeft, null);
  assert.deepEqual(rv[1].filterLeft, [3854, 4188, 4398, 4469, 4398, 4188, 3854, 3416]);
});

test("oot ADSR (Audio_AdsrUpdate): targets (arg/32767)², delays × ticksPerUpdate/4, the decay table 1/(3·scaleInv), sustain holds 128 updates", () => {
  assert.equal(OOT_UPDATES_PER_SECOND, 180);
  const a = new OotAdsr([[4, 32767], [8, 16384], [-1, 0]]);
  const lv = []; for (let i = 0; i < 12; i++) lv.push(a.update());
  assert.ok(Math.abs(lv[2] - 1) < 1e-9, "4 × 0.75 = 3 updates to full: " + lv[2]);
  assert.ok(Math.abs(lv[8] - (16384 / 32767) ** 2) < 1e-9, "then 8 × 0.75 = 6 updates to the squared target: " + lv[8]);
  assert.equal(lv[11], lv[8], "hang");
  assert.ok(Math.abs(ootDecayRate(239) - 1 / 36) < 1e-12 && Math.abs(ootDecayRate(100) - 1 / 516) < 1e-12 && Math.abs(ootDecayRate(5) - 1 / 3240) < 1e-12 && Math.abs(ootDecayRate(255) - 1 / 0.75) < 1e-12);
  assert.equal(ootDecayRate(0), 0, "index 0 never decays");
  a.decay(ootDecayRate(239)); a.update();                  // the flag lands at the end of this update
  const d0 = a.update(); assert.ok(Math.abs(d0 - ((16384 / 32767) ** 2 - 1 / 36)) < 1e-9);
  let n = 1; while (!a.done && n < 100) { a.update(); n++; } assert.ok(a.done && n < 20, "gone in " + n);
  // sustain: decay stops at channel sustain × level/256 for 128 updates, then releases
  const b = new OotAdsr([[1, 32767], [-1, 0]]); b.update(); b.update();
  b.decay(ootDecayRate(250), 128); b.update();
  let held = 0; for (let i = 0; i < 200; i++) { const v = b.update(); if (Math.abs(v - 0.5) < 1e-9) held++; }
  assert.ok(held >= 128 && held <= 130, "held at 0.5 for " + held);
  assert.deepEqual(OOT_DEFAULT_ENVELOPE, [[1, 32000], [1000, 32000], [-1, 0]]);
});

test("oot pitch, pan, filter taps: gPitchFrequencies wraps its last 11 entries below A0; notePan in integers; AudioHeap_LoadFilter rows", () => {
  assert.equal(ootPitch(39), 1); assert.equal(ootPitch(3), 0.125);
  assert.ok(Math.abs(ootPitch(0x74) - 85.42976) < 1e-3 && Math.abs(ootPitch(0x75) - 0.055681) < 1e-5 && Math.abs(ootPitch(0x7F) - 0.099213) < 1e-5);
  // weight 128: the channel's pan alone; weight 0: the layer's (a drum's own); centre = index 64 of the cos table
  const [l, r] = ootPanGains({pan: 0.5, panWeight: 1});
  assert.ok(Math.abs(l - Math.cos(Math.PI / 2 * 64 / 127)) < 1e-9 && Math.abs(r - Math.cos(Math.PI / 2 * 63 / 127)) < 1e-9);
  assert.deepEqual(ootPanGains({pan: 0.5, panWeight: 0}, {pan: 0}), [1, 0], "drum hard left");
  assert.deepEqual(ootPanGains({pan: 0.5, panWeight: 0, noDrumPan: true, lyPan: 127 / 128}, {pan: 0}), [0, 1], "CC: the layer's pan instead");
  assert.deepEqual(ootFilterTaps(0, 0), [0, 0, 0, 32767, 0, 0, 0, 0]);
  assert.deepEqual(ootFilterTaps(0, 1), [-289, -291, -289, 30736, -289, -291, -289, -290]);
  assert.deepEqual(ootFilterTaps(1, 1), [1782, 1948, 2054, 17602, 2054, 1948, 1782, 1563]);
});

// the oot channel ops the renderer needs, on a one-note song (channel at 0x20, layer at 0x40)
function ootSong(chan, ly = [0x27, 0x60, 0x40, 0xFF], after = []) {
  const b = new Uint8Array(0x80);
  b.set([0xD7, 0x00, 0x01, 0x90, 0x00, 0x20, 0xFD, 0x7F, 0xFF], 0);
  b.set([0xC1, 0x05, ...chan, 0x88, 0x00, 0x40, ...after, 0xFD, 0x7F, 0xFF], 0x20);
  b.set(ly, 0x40);
  return b;
}
test("oot capture: a short channel delay (0x0n) ends the tick's run, so volume steps under a note land n ticks apart; E5/D2/E8/ED/B0/B3/BB reach the note", () => {
  // DF 7F, then 0x04 (cdelay 4) DF 40: the step lands 4 ticks into the note, not at its start (the fix that brought Kokiri Forest's intro fade back)
  const res = parseSequence(ootSong([0xDF, 0x7F], [0x27, 0x60, 0x40, 0xFF], [0x04, 0xDF, 0x40]), {abi: "oot"});
  const n = res.notes[0];
  assert.deepEqual(n.gain.map(g => g.t), [0, 4]);
  assert.ok(Math.abs(n.gain[1].l - 0x40 / 127) < 1e-9);
  const p = parseSequence(ootSong([0xE5, 0x01, 0xD2, 0x80, 0xED, 0x20, 0xB0, 0x00, 0x70, 0xB3, 0x10, 0xBB, 0x08, 0x40, 0x00]), {abi: "oot"}).notes[0];
  assert.deepEqual([p.revIdx, p.chSustain, p.chGain], [1, 0x80, 0x20]);
  assert.deepEqual(p.filter, ootFilterTaps(1, 0), "B3 rewrote the taps B0 pointed at");
  assert.deepEqual(p.comb, {size: 8, gain: 0x4000});
  // E8: 3 bytes (mute, alloc, priority) then transposition, pan, pan weight, reverb, reverb index
  const q = parseSequence(ootSong([0xE8, 0, 0, 5, 2, 0x20, 0x40, 0x30, 1]), {abi: "oot"}).notes[0];
  assert.deepEqual([q.semitone, q.pan, q.panWeight, q.rev, q.revIdx], [41, 0.25, 0.5, 0x30, 1]);
});

test("renderN64 on the oot generation: the font's voice at gPitchFrequencies × tuning, (vel/127)²·vol²·ADSR, integer pan, the note filter, and the RAM reverb's echo", async () => {
  const set = ootSet(), loc = locateEAD(set);
  const B = TICKS_PER_BEAT;
  const note = {tick: 0, dur: 2 * B, ch: 4, layer: 0, semitone: 39, drum: false, midi: 60, vel: 127, inst: 0, bank: 0, vol: 1, pan: 0.5, panWeight: 1, freq: 1, chInst: 0};
  const res = {abi: "oot", gen: "oot", tempos: [{tick: 0, bpm: 120}], endTick: 4 * B, warnings: [], notes: [note, {...note, ch: 9, drum: true, inst: 0x7F, semitone: 0, dur: B, panWeight: 0}]};
  const r = await renderN64(res, {set, loc, banks: [0], sampleRate: 32000, reverbs: null});
  assert.deepEqual(Object.keys(r).filter(k => r[k] && r[k].l), ["ch 4 inst 0", "ch 9 drums"]);
  assert.deepEqual(r.warnings, []);
  const mel = r["ch 4 inst 0"], kit = r["ch 9 drums"];
  const rms = (a, s0, s1) => { let s = 0; for (let i = s0; i < s1; i++) s += a[i] * a[i]; return Math.sqrt(s / (s1 - s0)); };
  const period = (a, from, n) => { let best = 0, bv = -1; for (let lag = 4; lag < 200; lag++) { let s = 0; for (let i = from; i < from + n; i++) s += a[i] * a[i + lag]; if (s > bv) { bv = s; best = lag; } } return best; };
  assert.equal(period(mel.l, 8000, 4000), 16, "semitone 39 × tuning 1 = 2000 Hz");
  assert.equal(period(kit.l, 800, 2000), 32, "the drum: its tuning 0.5 alone");
  // level: the square's RMS 0.4375 × ADSR (32700/32767)² (the 32700-update fade toward 29430 has barely begun) × the centre pan's cos(π/2·64/127)
  const want = 14336 / 32768 * (32700 / 32767) ** 2 * Math.cos(Math.PI / 2 * 64 / 127);
  assert.ok(Math.abs(rms(mel.l, 16000, 24000) / want - 1) < 0.03, rms(mel.l, 16000, 24000) + " vs " + want);
  const ratio = rms(kit.r, 1000, 8000) / rms(kit.l, 1000, 8000), law = Math.cos(Math.PI / 2 * 27 / 127) / Math.cos(Math.PI / 2 * 100 / 127);
  assert.ok(Math.abs(ratio / law - 1) < 0.01, "drum pan 100 (panWeight 0): gDefaultPanVolume[27] / [100] = " + law + ", got " + ratio);
  // the channel filter: the strongest low-pass (row 1, near an 8-sample boxcar) keeps ~0.64 of a 2 kHz fundamental and
  // drops the square's upper harmonics (−4.6 dB in all); the identity row (tap 3 = 32767) leaves the level alone
  const withTaps = async taps => rms((await renderN64({...res, notes: [{...note, filter: taps}]}, {set, loc, banks: [0], sampleRate: 32000, reverbs: null}))["ch 4 inst 0"].l, 16000, 24000) / rms(mel.l, 16000, 24000);
  const lp = await withTaps(ootFilterTaps(1, 0)), id = await withTaps(ootFilterTaps(0, 0));
  assert.ok(lp > 0.5 && lp < 0.65, "low-pass row 1: " + lp);
  assert.ok(Math.abs(id - 1) < 0.001, "identity row: " + id);
  // reverb 0 from RAM: a 100 ms one-shot's send comes back 3072 samples later at volume 0x7FFF, then × decayRatio 0x3000
  const short = {...note, dur: 2, rev: 127, chRel: 255};                 // decay index 255: gone one update after its 20 ms gate
  const rr = await renderN64({...res, notes: [short]}, {set, loc, banks: [0], sampleRate: 32000});
  assert.equal(rr.reverbs.length, 2);
  const dry = await renderN64({...res, notes: [short]}, {set, loc, banks: [0], sampleRate: 32000, reverbs: null});
  const w = rr["ch 4 inst 0"].l, d = dry["ch 4 inst 0"].l, echo = new Float32Array(w.length); for (let i = 0; i < w.length; i++) echo[i] = w[i] - d[i];
  assert.ok(rms(echo, 0, 3072) === 0, "nothing before one window");
  const e1 = rms(echo, 3072, 3072 + 1500), e2 = rms(echo, 6144, 6144 + 1500), s0 = rms(d, 0, 1500);
  assert.ok(Math.abs(e1 / s0 - 127 / 128) < 0.02, "first echo at the send × volume: " + e1 / s0);
  assert.ok(Math.abs(e2 / e1 - 0x3000 / 0x8000) < 0.02, "second × decayRatio: " + e2 / e1);
});
