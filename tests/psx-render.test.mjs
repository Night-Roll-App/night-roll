// The PlayStation renderer on a synthetic rip: an instrument table found by
// shape, a one-sample bank (a square wave in SPU-ADPCM), one note — the
// channel is named as the MIDI track, sounds while held, and is silent
// after its release.
import test from "node:test";
import assert from "node:assert/strict";
import { INSTR_STRIDE, findInstrDat } from "../tools/psx/instr.mjs";
import { findSampleBank, renderSpu } from "../tools/psx/spu-render.mjs";
import { channelGroups, splitSlides, makeMidi, notePan } from "../tools/psx/notes.mjs";
// a track is a stereo pair {l, r}; the older checks read the mono sum
const mono = p => { if (!p || !p.l) return p; const m = new Float32Array(p.l.length); for (let i = 0; i < m.length; i++) m[i] = p.l[i] + p.r[i]; return m; };

const le32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
function record(addr, loop, adsr) { // 64 bytes: addr, loop, 8 adsr, twelve base pitches (0x1000 for C, semitone steps up)
  const p = []; for (let i = 0; i < 12; i++) p.push(...le32(Math.round(0x1000 * Math.pow(2, i / 12))));
  return [...le32(addr), ...le32(loop), ...adsr, ...p];
}
// SPU-ADPCM: shift 0 filter 0 → sample = nibble << 12; a 28-sample square wave block (7 = +28672, 9 = −28672 sign-extended)
function block(flags, nibbles) { const b = [0x00, flags]; for (let i = 0; i < 28; i += 2) b.push((nibbles[i] & 15) | ((nibbles[i + 1] & 15) << 4)); return b; }
const square = []; for (let i = 0; i < 28; i++) square.push(i < 14 ? 7 : 9);

test("renderSpu: table by shape, bank by end flags, a held note sounds at the track's name and stops after release", async () => {
  const ram = new Uint8Array(0x20000);
  const tableAt = 0x8000, bankAt = 0x10000, spuAddr = 0x1010; // bank base B = bankAt − spuAddr
  for (let i = 0; i < 20; i++) ram.set(record(spuAddr + i * 0x30, spuAddr + i * 0x30, [0, 0x0f, 0x0f, 0x7f, 0x05, 1, 3, 3]), tableAt + i * INSTR_STRIDE);
  for (let i = 0; i < 20; i++) { // each instrument: three looping square blocks back to back, loop start on the first, loop end + repeat on the last
    const o = bankAt + i * 0x30;
    ram.set(block(4, square), o); ram.set(block(0, square), o + 16); ram.set(block(3, square), o + 32);
  }
  const table = findInstrDat(ram);
  assert.deepEqual(table, {offset: tableAt, count: 20});
  const bank = findSampleBank(ram, table);
  assert.ok(bank && bank.base === bankAt - spuAddr, "bank base from the end flags: " + JSON.stringify(bank));
  // one note on channel 4, program 2, key 72 (C5): the sample's own pitch (0x1000 at C, octave 6)
  const seq = {ppq: 48, tempoMap: [{tick: 0, usq: 500000}], timeSigs: [{tick: 0, num: 4, den: 4}], loop: null, warnings: []};
  const result = {notes: [{tick: 0, endTick: 48, ch: 4, key: 72, vel: 100, program: 2, pitch: 72, cents: 0, drum: false, tone: null}], seq};
  assert.equal(channelGroups(result)[0].name, "ch 5 prog 2");
  const r = await renderSpu(result, {ram, table, bank, sampleRate: 22050});
  assert.ok(r["ch 5 prog 2"] && r["ch 5 prog 2"].l instanceof Float32Array && r["ch 5 prog 2"].r.length === r["ch 5 prog 2"].l.length, "the channel carries the track's name, as a stereo pair");
  const buf = mono(r["ch 5 prog 2"]);
  const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += buf[i] * buf[i]; return Math.sqrt(s / (b - a)); };
  assert.ok(rms(1000, 9000) > 0.05, "sounds while held: " + rms(1000, 9000));       // 0.5 s note at 22050 = 11025 samples
  assert.ok(rms(11025 + 4000, 11025 + 8000) < 0.005, "silent after the release: " + rms(15025, 19025));
});

test("renderSpu: a volume change inside a held note is followed sample by sample (the note's gain breakpoints)", async () => {
  // the same rig; one note whose channel swells from silence to full while it
  // holds — Anxious Heart's pad (Josh, 2026-09-27: bar 1 quiet, bar 2 "way
  // louder"): the old render froze each note at its note-on volume
  const ram = new Uint8Array(0x20000);
  const tableAt = 0x8000, bankAt = 0x10000, spuAddr = 0x1010;
  for (let i = 0; i < 20; i++) ram.set(record(spuAddr + i * 0x30, spuAddr + i * 0x30, [0, 0x0f, 0x0f, 0x7f, 0x05, 1, 3, 3]), tableAt + i * INSTR_STRIDE);
  for (let i = 0; i < 20; i++) { const o = bankAt + i * 0x30; ram.set(block(4, square), o); ram.set(block(0, square), o + 16); ram.set(block(3, square), o + 32); }
  const table = findInstrDat(ram), bank = findSampleBank(ram, table);
  const seq = {ppq: 48, tempoMap: [{tick: 0, usq: 500000}], timeSigs: [{tick: 0, num: 4, den: 4}], loop: null, warnings: []};
  const note = {tick: 0, endTick: 96, ch: 0, key: 72, vel: 4, program: 2, pitch: 72, cents: 0, drum: false, tone: null,
                gain: [{t: 0, l: 0.03}, {t: 96, l: 1}]};
  const r = await renderSpu({notes: [note], seq}, {ram, table, bank, sampleRate: 22050});
  const buf = mono(r["ch 1 prog 2"]);
  const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += buf[i] * buf[i]; return Math.sqrt(s / (b - a)); };
  const early = rms(1000, 4000), late = rms(18000, 21000); // a 1 s note at 22050
  assert.ok(late > early * 5, "swells while held: early " + early.toFixed(4) + " late " + late.toFixed(4));
  const flat = await renderSpu({notes: [{...note, gain: undefined}], seq}, {ram, table, bank, sampleRate: 22050});
  const fb = mono(flat["ch 1 prog 2"]); let s = 0; for (let i = 18000; i < 21000; i++) s += fb[i] * fb[i];
  assert.ok(Math.sqrt(s / 3000) < late / 5, "without the curve the note stays at its note-on volume (vel 4)");
});

test("pitch slides: the roll gets one note per landed pitch; the render bends the one voice", async () => {
  // Cry of the Planet's melody is a held D slid +7 +5 −4 −3 +2 −7 every
  // eighth (Josh, 2026-09-27: the motif was missing entirely)
  const note = {tick: 0, endTick: 144, ch: 0, key: 38, vel: 63, program: 2, pitch: 38, cents: 0, drum: false, tone: null,
                slide: [{t: 24, len: 3, to: 7}, {t: 48, len: 3, to: 12}, {t: 72, len: 3, to: 8}, {t: 96, len: 3, to: 5}, {t: 120, len: 3, to: 7}]};
  const split = splitSlides([note]);
  assert.deepEqual(split.map(n => [n.tick, n.endTick, n.pitch]), [[0, 24, 38], [24, 48, 45], [48, 72, 50], [72, 96, 46], [96, 120, 43], [120, 144, 45]]);
  assert.ok(split.every(n => n.slid && n.slide === undefined && n.vel === 63 && n.program === 2));
  assert.deepEqual(splitSlides([{...note, slide: undefined}]).map(n => n.pitch), [38], "a note without slides passes through untouched");
  // render: one voice, higher pitch in the second eighth — count zero crossings per segment
  const ram = new Uint8Array(0x20000);
  const tableAt = 0x8000, bankAt = 0x10000, spuAddr = 0x1010;
  for (let i = 0; i < 20; i++) ram.set(record(spuAddr + i * 0x30, spuAddr + i * 0x30, [0, 0x0f, 0x0f, 0x7f, 0x05, 1, 3, 3]), tableAt + i * INSTR_STRIDE);
  for (let i = 0; i < 20; i++) { const o = bankAt + i * 0x30; ram.set(block(4, square), o); ram.set(block(0, square), o + 16); ram.set(block(3, square), o + 32); }
  const table = findInstrDat(ram), bank = findSampleBank(ram, table);
  const seq = {ppq: 48, tempoMap: [{tick: 0, usq: 500000}], timeSigs: [{tick: 0, num: 4, den: 4}], loop: null, warnings: []};
  const one = {...note, key: 72, pitch: 72, endTick: 96, slide: [{t: 48, len: 3, to: 12}]}; // an octave up at the half
  const r = await renderSpu({notes: [one], seq}, {ram, table, bank, sampleRate: 22050});
  const buf = mono(r["ch 1 prog 2"]);
  const zc = (a, b) => { let c = 0; for (let i = a + 1; i < b; i++) if ((buf[i] >= 0) !== (buf[i - 1] >= 0)) c++; return c; };
  const first = zc(2000, 9000), second = zc(13000, 20000); // 0.5 s per half at 22050
  assert.ok(second > first * 1.8 && second < first * 2.2, "an octave up doubles the zero crossings: " + first + " → " + second);
});

test("stereo: the SPU's linear pan — left (127 − p)/127, right p/127 — hard left renders silent right, centre renders equal; makeMidi carries CC10 per change", async () => {
  const ram = new Uint8Array(0x20000);
  const tableAt = 0x8000, bankAt = 0x10000, spuAddr = 0x1010;
  for (let i = 0; i < 20; i++) ram.set(record(spuAddr + i * 0x30, spuAddr + i * 0x30, [0, 0x0f, 0x0f, 0x7f, 0x05, 1, 3, 3]), tableAt + i * INSTR_STRIDE);
  for (let i = 0; i < 20; i++) { const o = bankAt + i * 0x30; ram.set(block(4, square), o); ram.set(block(0, square), o + 16); ram.set(block(3, square), o + 32); }
  const table = findInstrDat(ram), bank = findSampleBank(ram, table);
  const seq = {ppq: 48, tempoMap: [{tick: 0, usq: 500000}], timeSigs: [{tick: 0, num: 4, den: 4}], loop: null, warnings: [], endTick: 192};
  // three different keys, and the kit hit on another program: the one-pitch-program kit rule must not fire here
  const mk = (tick, pan, key = 72) => ({tick, endTick: tick + 48, ch: 1, key, vel: 100, program: 2, pitch: key, cents: 0, drum: false, tone: null, pan});
  const result = {notes: [mk(0, 0), mk(48, 64, 74), mk(96, 127, 76), {...mk(144, 20), program: 3, drum: true, table: true, tone: {instrument: 3, key: 72, vol: 127, pan: 110}}], seq};
  const r = await renderSpu(result, {ram, table, bank, sampleRate: 22050});
  const names = Object.keys(r).filter(k => r[k] && r[k].l); assert.ok(names.length >= 1);
  const rmsAt = (a, t0, t1) => { let s = 0; for (let i = Math.floor(t0 * 22050); i < Math.floor(t1 * 22050); i++) s += a[i] * a[i]; return Math.sqrt(s / ((t1 - t0) * 22050)); };
  const mel = r["ch 2 prog 2"];
  assert.ok(rmsAt(mel.l, 0.05, 0.45) > 0.05 && rmsAt(mel.r, 0.05, 0.45) === 0, "pan 0: right silent");
  const cl = rmsAt(mel.l, 0.55, 0.95), cr = rmsAt(mel.r, 0.55, 0.95);
  assert.ok(Math.abs(20 * Math.log10(cl / cr)) < 0.2, "pan 64: equal within 0.2 dB (63/127 vs 64/127)");
  const sum = new Float32Array(mel.l.length); for (let i = 0; i < sum.length; i++) sum[i] = mel.l[i] + mel.r[i];
  assert.ok(Math.abs(20 * Math.log10((cl + cr) / rmsAt(sum, 0.55, 0.95))) < 0.1, "linear: the sides add back to the mono level (l + r is level-neutral at any pan)");
  assert.ok(rmsAt(mel.r, 1.05, 1.45) > 0.05 && rmsAt(mel.l, 1.05, 1.45) === 0, "pan 127: left silent");
  assert.equal(notePan(result.notes[3]), 110, "a kit entry pans by its drum-map pan");
  const hex = [...makeMidi(result)].map(b => b.toString(16).padStart(2, "0")).join(" ");
  assert.ok(hex.indexOf("b1 0a 00") >= 0 && hex.indexOf("b1 0a 00") < hex.indexOf("91 48 64"), "CC10 0 at tick 0 before the first note on channel 1 (SEQ channel 2; the name meta sits between)");
  assert.match(hex, /b1 0a 40/); assert.match(hex, /b1 0a 7f/);
});

// ---- later AKAO (sample sets in the image) and libsnd SEQ+VAB (2026-09-28) ----
import { adsrRecord } from "../tools/psx/instr.mjs";
import { makeTestAKAO, makeTestSampleSet, makeTestSEQ, makeTestVAB, encodeAdpcm, sine } from "../tools/psx/make-test-seq.mjs";
import { parseAKAO, akaoNotes, scanAkaoSampleSets, akaoInstrContext, akaoRecord } from "../tools/psx/akao.mjs";
import { parseSEQ, secondsAt } from "../tools/psx/seq.mjs";
const N = (deg, i) => deg * 11 + i; // AKAO note: degree × 11 + length index (1 = half note)
import { parseVAB } from "../tools/psx/vab.mjs";
import { seqNotes } from "../tools/psx/notes.mjs";

// Hz of a stretch of a buffer by upward zero crossings
function hzOf(buf, rate, t0, t1) {
  const a = Math.floor(t0 * rate), b = Math.floor(t1 * rate);
  let first = -1, last = -1, n = 0;
  for (let i = a + 1; i < b; i++) if (buf[i - 1] < 0 && buf[i] >= 0) { if (first < 0) first = i; last = i; n++; }
  return n > 1 ? (n - 1) * rate / (last - first) : 0;
}

test("adsrRecord unpacks the SPU's two ADSR words as the table records keep them", () => {
  assert.deepEqual(adsrRecord(0x80FF, 0x5FC0), {ar: 0, am: 1, dr: 15, sl: 15, sr: 0x7F, sm: 2, rr: 0, rm: 0});
  assert.deepEqual(adsrRecord(0x3A2F, 0xC4A5), {ar: 0x3A, am: 0, dr: 2, sl: 15, sr: 0x12, sm: 3, rr: 5, rm: 1});
});

test("AKAO sample set (0x10 articulations): a note sounds at its key through the unity key and fine tune, with no INSTR.DAT and no bank search", async () => {
  const adpcm = encodeAdpcm(sine(261.63, 6748));                    // C4 at 44100 Hz, looped
  const set = makeTestSampleSet({id: 7, dest: 0x20000, arts: [{adpcm, unity: 60}, {adpcm, unity: 60, fine: 0x4000}]}); // art 1: ×1.5
  const ram = new Uint8Array(0x40000);
  ram.set(set, 0x8000);
  // the sequence in the same image: layout 3, naming set 7; art 0 plays C4 then C5, art 1 plays C4 (sounding G4)
  ram.set(makeTestAKAO({layout: 3, sampleSetId: 7, voices: {0: [0xFE, 0x00, 0x00, 0x40, 0xA5, 4, 0xA1, 0, N(0, 1), 0xA5, 5, N(0, 1), 0xA1, 1, 0xA5, 4, N(0, 1), 0xA0]}}), 0x100);
  const sets = scanAkaoSampleSets(ram);
  assert.equal(sets.length, 1); assert.equal(sets[0].shape, "art16"); assert.equal(sets[0].id, 7);
  const r = akaoNotes(parseAKAO(ram, 0x100));
  assert.equal(r.instr.kind, "akao-sets", "the image the block came from supplies the sets");
  assert.equal(akaoRecord(r.instr, r.notes[0]).unity, 60);
  const out = await renderSpu(r, {sampleRate: 44100});
  const buf = mono(out[channelGroups(r)[0].name]);
  const sec = t => secondsAt(r.seq, t);
  assert.ok(Math.abs(hzOf(buf, 44100, sec(0) + 0.1, sec(96) - 0.1) - 130.8) < 2, "key 48 (C3) on a C4 sample with unity 60 sounds an octave down");
  assert.ok(Math.abs(hzOf(buf, 44100, sec(96) + 0.1, sec(192) - 0.1) - 261.6) < 3, "key 60 sounds the sample's own pitch");
  assert.ok(Math.abs(hzOf(buf, 44100, sec(192) + 0.1, sec(288) - 0.1) - 196.2) < 3, "fine tune 0x4000 = ×1.5: key 48 sounds G3");
});

test("SEQ + VAB render: each tone's VAG at 0x1000 × 2^((key − center + shift/128)/12), its ADSR, tone × program × bank volume, pan offsets summed", async () => {
  const seq = parseSEQ(makeTestSEQ()).sequences[0];
  const render = async (patch) => {
    const {vab: bytes} = makeTestVAB({center: 60});
    patch && patch(bytes);
    const result = seqNotes(seq, {vab: parseVAB(bytes)});
    return {result, out: await renderSpu(result, {sampleRate: 44100})};
  };
  const {result, out} = await render();
  const names = channelGroups(result).map(g => g.name);
  assert.deepEqual(Object.keys(out).filter(k => out[k] && out[k].l), names, "one stereo pair per MIDI track, named alike");
  const mel = mono(out[names[0]]);
  // C4 (key 60 = center) for the first 0.5 s, E4 next, G4 after
  assert.ok(Math.abs(hzOf(mel, 44100, 0.05, 0.45) - 261.6) < 3, "key = center plays the sample as recorded: " + hzOf(mel, 44100, 0.05, 0.45));
  assert.ok(Math.abs(hzOf(mel, 44100, 0.55, 0.95) - 329.6) < 4, "E4");
  const kit = mono(out[names[1]]); let pk = 0; for (const v of kit.subarray(0, 4410)) pk = Math.max(pk, Math.abs(v));
  assert.ok(pk > 0.01, "the kit's noise tones sound");
  // shift 64 = half a semitone up; tone pan 127 = right only
  const tone0 = 0x820 + 5;
  const {out: out2} = await render(b => { b[tone0] = 64; b[0x820 + 3] = 127; });
  const m2 = out2[names[0]];
  assert.ok(Math.abs(hzOf(mono(m2), 44100, 0.05, 0.45) - 261.63 * Math.pow(2, 0.5 / 12)) < 3, "shift/128 of a semitone");
  let l = 0, r = 0; for (let i = 0; i < 22050; i++) { l += Math.abs(m2.l[i]); r += Math.abs(m2.r[i]); }
  assert.ok(l < r * 1e-6 && r > 0, "pan 127 is all right channel");
  // half the program volume halves the level
  const {out: out3} = await render(b => { b[0x20 + 1] = 64; });
  let a3 = 0, a1 = 0; const m3 = mono(out3[names[0]]); for (let i = 0; i < 22050; i++) { a3 += Math.abs(m3[i]); a1 += Math.abs(mel[i]); }
  assert.ok(Math.abs(a3 / a1 - 64 / 127) < 0.02, "program volume is linear: " + (a3 / a1));
});

// ---- AKAO drum table used as a melodic bank (docs/plans/2026-10-09-percussion-detection.md §13) ----
// A layout-3 block whose header table (0x34) maps key 36+i to instrument i at
// table key 60; sample set 7 holds the instruments (unity 60, so each plays
// its sample as recorded). ch 1 plays instruments 0–2, ch 2 plays 2–5 (joined
// by 2: one bank of 6), ch 3 plays 6 and 7 (a bank of 2).
function drumBankRip(samples) {
  const set = makeTestSampleSet({id: 7, dest: 0x20000, arts: samples.map(s => ({adpcm: encodeAdpcm(s), unity: 60}))});
  const table = new Uint8Array(44 * 8);
  for (let i = 0; i < 8; i++) table.set([i, 60, 0, 0, 0, 0, 127, 64], (36 + i) * 8);
  const on = [0xFE, 0x04, 0xA5, 3];
  const akao = makeTestAKAO({layout: 3, sampleSetId: 7, tail: table, voices: {
    0: [...on, N(0, 1), N(1, 1), N(2, 1), 0xA0],
    1: [...on, N(2, 1), N(3, 1), N(4, 1), N(5, 1), 0xA0],
    2: [...on, N(6, 3), N(6, 3), N(7, 3), N(6, 3), 0xA0]}});
  const tableAt = akao.length - table.length - 0x34;
  akao.set([tableAt & 255, (tableAt >> 8) & 255, 0, 0], 0x34);
  const ram = new Uint8Array(0x40000);
  ram.set(set, 0x8000); ram.set(akao, 0x100);
  return akaoNotes(parseAKAO(ram, 0x100));
}
const midiSine = m => sine(440 * Math.pow(2, (m - 69) / 12), 28 * 240);
function noiseSamples(n, seed) { const s = new Int16Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7FFFFFFF; s[i] = (x % 56000) - 28000; } return s; }

test("kitify: a drum table of ≥ 6 rooted, harmonic samples is a melodic bank — each note at its sample's measured pitch; 1–2-instrument tables stay kits; the render is the same", async () => {
  const r = drumBankRip([57, 59, 60, 62, 64, 76, 48, 50].map(midiSine));
  assert.ok(r.notes.every(n => n.table && n.drum), "every note plays a table entry, flagged drum by the driver");
  const before = await renderSpu({...r, notes: r.notes.map(n => ({...n})), kitGuess: [], seq: {...r.seq, warnings: []}}, {sampleRate: 44100}); // kitify skipped: every note as the driver flags it
  const groups = channelGroups(r);
  assert.deepEqual(groups.map(g => [g.name, g.kit]), [["ch 1 prog 0,1,2", false], ["ch 2 prog 2,3,4,5", false], ["ch 3 prog 6,7", true]]);
  const mel = r.notes.filter(n => !n.drum).sort((a, b) => a.tone.instrument - b.tone.instrument || a.ch - b.ch);
  assert.deepEqual(mel.map(n => [n.tone.instrument, n.key, n.pitch]), [[0, 36, 57], [1, 37, 59], [2, 38, 60], [2, 38, 60], [3, 39, 62], [4, 40, 64], [5, 41, 64]],
    "the sample's pitch, not the slot key; instrument 5 (E5) sits over a tritone above the bank's middle and is written an octave down");
  assert.ok(mel.every(n => Math.abs(n.cents) <= 10), "cents carry the remainder: " + mel.map(n => n.cents));
  assert.ok(r.seq.warnings.some(w => /^drum-table bank prog 0–5: 6 samples, all pitched → melodic.*prog 5 measured over a tritone/.test(w)), r.seq.warnings.join("\n"));
  assert.ok(r.notes.filter(n => n.ch === 2).every(n => n.drum), "the two-instrument table stays a kit");
  // the MIDI: the bank's channels are melodic tracks with a program per entry; the kit keeps channel 10
  const hex = [...makeMidi(r)].map(b => b.toString(16).padStart(2, "0")).join(" ");
  assert.match(hex, /c0 00/); assert.match(hex, /c1 05/);
  assert.match(hex, /99 [0-9a-f]{2} /);
  // the console render is unchanged: n.table, not n.drum, picks the entry
  const after = await renderSpu(r, {sampleRate: 44100});
  for (const g of groups) assert.deepEqual(after[g.name], before[g.name], g.name + " renders the same before and after kitify");

  // one unpitched sample keeps the whole bank a kit, said as a fact
  const k = drumBankRip([57, 59, 60, 62, 64].map(midiSine).concat([noiseSamples(28 * 240, 7), midiSine(48), midiSine(50)]));
  const kg = channelGroups(k);
  assert.ok(kg.every(g => g.kit), kg.map(g => g.name).join(", "));
  assert.ok(k.seq.warnings.includes("drum-table bank prog 0–5: 6 samples, 1 unpitched → kit"), k.seq.warnings.join("\n"));
});
