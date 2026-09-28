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
import { Adsr, renderN64, noteFrequency, UPDATES_PER_SECOND } from "../tools/n64/render.mjs";
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
  const r = await renderN64(res, {rom, banks: [0], sampleRate: 32000, onProgress: p => progress.push(p)});
  assert.equal(r.sampleRate, 32000);
  assert.ok(Math.abs(r.seconds - 4.5) < 1e-9, "one pass + 2.5 s tail: " + r.seconds);
  assert.deepEqual(progress[progress.length - 1], 1);
  const mel = r["ch 4 inst 0"], kit = r["ch 9 drums"];
  assert.ok(mel instanceof Float32Array && kit instanceof Float32Array);
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
  const r2 = await renderN64(res, {rom: one.rom, banks: [0]});
  assert.ok(rms(r2["ch 4 inst 0"], 0, 64) > 0.02 && rms(r2["ch 4 inst 0"], 64, 4000) === 0, "64 samples (still in the 2-update attack) then nothing");
  // notes the renderer cannot voice are reported, not thrown
  const r3 = await renderN64({...res, notes: [{...res.notes[0], inst: 0x80}]}, {rom, banks: [0]});
  assert.deepEqual(r3.silent, ["ch 4 inst 128"]);
  assert.match(r3.warnings[0], /synth waveform/);
});
