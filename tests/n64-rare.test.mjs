// Rare's GoldenEye driver (tools/n64/rare.mjs) on bytes assembled here, no
// game data: the 1172 container (raw DEFLATE), the ALCSeq reader with its
// 0xFE replay blocks and per-track loops, the RAM song table and the
// mini's selector word, an SDK ALBankFile laid out in a save state, and one
// note rendered through renderN64's dispatch under notes.mjs's track name.
// What the real rip verified is in tests/n64-real.test.mjs (guarded).
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { inflateRaw, decompress1172, is1172, parseCSeq, cseqNotes, unrollTracks, findMusicTable, miniOverrideWords, miniRareTrack,
         findRareBankFile, readRareBank, isKitInstrument, envelopeGain, renderRare, rareSequenceOfSet, ENV_FLOOR, panGains,
         findFxParams, SdkFx, SMALLROOM_FX, attachGains, parse1172, findRamSequences, miniRamSequence, findSeqFileInRam,
         miniOverrideRegs, findRareBanks, sampleDecay, attachVoiceShapes, SHAPE_LEVELS } from "../tools/n64/rare.mjs";
import { readSmf } from "../tools/capture-diff.mjs";
import { SparseImage, PJ64_RDRAM, rdramOf } from "../tools/n64/usf.mjs";
import { sequenceOfSet } from "../tools/n64/capture.mjs";
import { renderN64 } from "../tools/n64/render.mjs";
import { toMidi, channelGroups, splitSlides, toNotesTxt } from "../tools/n64/notes.mjs";
import { TICKS_PER_BEAT } from "../tools/n64/constants.mjs";

const be32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const be16 = v => [(v >> 8) & 255, v & 255];
const le32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
const cat = (...xs) => Uint8Array.from(xs.flatMap(x => x instanceof Uint8Array ? [...x] : x));
const varlen = v => { const out = [v & 0x7F]; while ((v >>= 7) > 0) out.unshift((v & 0x7F) | 0x80); return out; };

// ---- 1172 -----------------------------------------------------------------
test("1172: the magic then a raw DEFLATE stream — stored, fixed and dynamic blocks round-trip; a truncated final block is caught", () => {
  const text = new TextEncoder().encode("GoldenEye 007 ".repeat(200) + "Dam Facility Runway".repeat(37));
  for (const level of [0, 1, 6, 9]) {
    const packed = cat([0x11, 0x72], zlib.deflateRawSync(text, {level}));
    assert.ok(is1172(packed));
    assert.deepEqual([...decompress1172(packed, text.length)], [...text], "level " + level);
    assert.deepEqual([...decompress1172(packed)], [...text], "level " + level + " without the size");
  }
  // an unmarked end: the stream ends without a final block — the stated size ends the decode
  const stream = zlib.deflateRawSync(text, {level: 6});
  const noEnd = stream.subarray(0, stream.length - 1);
  assert.equal(inflateRaw(noEnd, text.length).length <= text.length, true);
  assert.throws(() => inflateRaw(Uint8Array.from([0x07]), 100), /DEFLATE/);
  assert.throws(() => decompress1172(Uint8Array.from([0x12, 0x72, 0x03, 0x00])), /1172/);
});

// ---- ALCSeq builder ---------------------------------------------------------
// tracks: arrays of byte arrays; returns the sequence with its 0x44 header
function cseq(tracks, division = 96) {
  const offsets = [], body = [];
  let at = 0x44;
  for (let i = 0; i < 16; i++) { const t = tracks[i]; if (!t) { offsets.push(0); continue; } offsets.push(at); body.push(t); at += t.length; }
  return cat(...offsets.map(be32), be32(division), ...body);
}
const tempo = us => [0, 0xFF, 0x51, (us >> 16) & 255, (us >> 8) & 255, us & 255];
const note = (delta, ch, key, vel, dur) => [...varlen(delta), 0x90 | ch, key, vel, ...varlen(dur)];
const LOOPSTART = [0xFF, 0x2E, 0x00, 0xFF];
// loop end whose offset lands right after the loop start: bytesSinceStart = bytes between the loop start's end and this event's delta
const loopEnd = (delta, count, bytesSinceStart) => { const d = varlen(delta); return [...d, 0xFF, 0x2D, count, count, ...be32(bytesSinceStart + d.length + 8)]; };
const END = [0, 0xFF, 0x2F];

test("ALCSeq: header, delta/duration varlens, running status, tempo, program, cc7, per-track forever loop → notes at 48/beat with the loop as a fact", () => {
  // division 96: 96 = one quarter. ch0: program 5, volume 100, C4 for a quarter, E4 (running status) for a quarter,
  // then the loop: G4 quarter, loop end back to after the loop start
  const body = [...note(0, 0, 67, 90, 96)];
  const t0 = [...tempo(500000), 0, 0xC0, 5, 0, 0xB0, 7, 100, ...note(0, 0, 60, 100, 96), ...[96, 64, 100, ...varlen(96)],
              96, ...LOOPSTART, ...body, ...loopEnd(96, 0xFF, body.length)];
  const cs = parseCSeq(cseq([t0]));
  assert.equal(cs.division, 96);
  assert.equal(cs.tracks.filter(t => t).length, 1);
  const res = cseqNotes(cs);
  assert.equal(res.driver, "rare");
  assert.equal(res.ticksPerBeat, TICKS_PER_BEAT);
  assert.deepEqual(res.tempos, [{tick: 0, bpm: 120}]);
  assert.deepEqual(res.notes.map(n => [n.ch, n.inst, n.midi, n.tick, n.dur, n.vel, +n.vol.toFixed(3)]),
                   [[0, 5, 60, 0, 48, 100, +(100 / 127).toFixed(3)], [0, 5, 64, 48, 48, 100, +(100 / 127).toFixed(3)], [0, 5, 67, 96, 48, 90, +(100 / 127).toFixed(3)]]);
  assert.deepEqual(res.loop, {tick: 96, at: 144});
  assert.equal(res.endTick, 144);
  assert.equal(res.seconds, 1.5);
  assert.ok(res.notes.every(n => n.drum === false && n.bank === 0 && n.semitone === n.midi));
  // the MIDI writer and the grouping take it as they take an EAD result
  assert.ok(toMidi(res).length > 60);
  assert.deepEqual(channelGroups(res).map(g => g.name), ["ch 0 inst 5"]);
});

test("ALCSeq: 0xFE hi lo len replays bytes measured back from the 0xFE itself; 0xFE 0xFE is a literal", () => {
  // literal version: two identical bars
  const bar = [...note(0, 1, 62, 80, 48), ...note(48, 1, 65, 80, 48)];
  const lit = [...tempo(500000), ...bar, ...note(48, 1, 62, 80, 48), ...note(48, 1, 65, 80, 48), ...END];
  // replayed version: the second bar is "FE 00 <back> <len>" reaching to the first bar's bytes
  const head = [...tempo(500000), ...bar];
  const second = [...note(48, 1, 62, 80, 48), ...note(48, 1, 65, 80, 48)];
  // the replayed bytes must be byte-identical: the first bar starts with delta 0, the second with delta 48, so replay from the key byte on
  const tail = second.slice(1); // everything after the first delta byte
  const fePos = head.length + 1, target = tempo(500000).length + 1; // where the first bar's key byte sits
  const fe = [...head, 48, 0xFE, (fePos - target) >> 8, (fePos - target) & 255, tail.length, ...END];
  const a = cseqNotes(parseCSeq(cseq([null, lit]))), b = cseqNotes(parseCSeq(cseq([null, fe])));
  assert.deepEqual(b.notes.map(n => [n.tick, n.midi, n.dur]), a.notes.map(n => [n.tick, n.midi, n.dur]));
  assert.equal(b.notes.length, 4);
  // a literal 0xFE data byte: velocity 0xFE is not MIDI, so as a duration: 0xFE 0xFE → varlen byte 0xFE (cont) then 0x00 = 126*128 = 16128 ticks
  const esc = [...tempo(500000), 0, 0x90, 60, 100, 0xFE, 0xFE, 0x00, ...END];
  const r = cseqNotes(parseCSeq(cseq([esc])));
  assert.equal(r.notes[0].dur, 16128 / 2);
  assert.throws(() => parseCSeq(cseq([[0, 0xFE, 0x7F, 0xFF, 5, ...END]])), /block/);
});

test("ALCSeq: a finite loop end (count n) plays its body n+1 times, a forever loop ends the pass; a shorter forever loop is unrolled to the song's end", () => {
  // track 0: riff of one quarter looped 2 → 3 plays, then a note, then end
  const riff = [...note(0, 0, 48, 100, 48)];
  const t0 = [...tempo(500000), 0, ...LOOPSTART, ...riff, ...loopEnd(48, 2, riff.length), ...note(0, 0, 50, 100, 48), ...END];
  const r0 = cseqNotes(parseCSeq(cseq([t0])));
  assert.deepEqual(r0.notes.map(n => [n.midi, n.tick]), [[48, 0], [48, 24], [48, 48], [50, 72]]);
  assert.equal(r0.loop, null);
  assert.equal(r0.endTick, 72);
  // track 1 loops forever every quarter from tick 0; track 2 loops forever after two quarters: one pass = 2 quarters, track 1 unrolled
  const b1 = [...note(0, 1, 36, 100, 24)], t1 = [0, ...LOOPSTART, ...b1, ...loopEnd(96, 0xFF, b1.length)];
  const b2 = [...note(0, 2, 60, 100, 96), ...note(96, 2, 62, 100, 96)], t2 = [0, ...LOOPSTART, ...b2, ...loopEnd(96, 0xFF, b2.length)];
  const cs = parseCSeq(cseq([null, t1, t2]));
  assert.equal(cs.tracks[1].end.tick, 96);
  assert.equal(cs.tracks[2].end.tick, 192);
  const un = unrollTracks(cs);
  assert.equal(un[1].events.filter(e => e.type === "note").length, 2);
  const res = cseqNotes(cs);
  assert.deepEqual(res.notes.filter(n => n.ch === 1).map(n => n.tick), [0, 48]);
  assert.deepEqual(res.loop, {tick: 0, at: 96});
  assert.match(res.warnings.join(" "), /loop at different points/);
});

test("ALCSeq: malformed data is an error, not notes", () => {
  assert.throws(() => parseCSeq(new Uint8Array(0x20)), /header/);
  assert.throws(() => parseCSeq(cseq([[0, 0xFF, 0x7E, ...END]])), /meta/);
  assert.throws(() => parseCSeq(cseq([[0, 0x60, ...END]])), /data byte before any status/);
  assert.throws(() => parseCSeq(cseq([[0, 0x90, 60]])), /runs off the end/);
});

// ---- a save state with RAM words -------------------------------------------
// RAM is little-endian words in the PJ64 image; `words` = {addr: u32} (big-endian values), `bytes` = {addr: Uint8Array} (word-aligned, length a multiple of 4)
function state({words = {}, bytes = {}} = {}) {
  const st = new SparseImage();
  st.write(0, Uint8Array.from([...le32(0x23D8A6C8), ...le32(0x400000)]));
  for (const [a, v] of Object.entries(words)) st.write(PJ64_RDRAM + +a, Uint8Array.from(le32(v)));
  for (const [a, b] of Object.entries(bytes)) for (let i = 0; i < b.length; i += 4) st.write(PJ64_RDRAM + +a + i, Uint8Array.from([b[i + 3], b[i + 2], b[i + 1], b[i]]));
  return st;
}

test("song table: the chain of {rom, u16 unpacked, u16 packed} entries in RAM whose ROM addresses tile; the mini's overridden word picks the song", () => {
  const song = cat([0x11, 0x72], zlib.deflateRawSync(cseq([[...tempo(500000), ...note(0, 0, 60, 100, 48), ...END]])));
  const rom = new SparseImage();
  const base = 0x419000;
  const entries = [];
  let at = base;
  for (let i = 0; i < 10; i++) { rom.write(at, song); entries.push(...be32(at), ...be16(0x44 + 20), ...be16(song.length)); at += song.length; }
  const st = state({bytes: {0x2d1c00: Uint8Array.from(entries)}, words: {0x603C: 7, 0x100: 0xDEADBEEF}});
  const {ram} = rdramOf(st);
  const t = findMusicTable(ram, rom);
  assert.ok(t, "table found");
  assert.equal(t.at, 0x2d1c00);
  assert.equal(t.count, 10);
  assert.equal(t.entries[3].rom, base + 3 * song.length);
  assert.equal(t.entries[3].packed, song.length);
  assert.equal(t.entries[3].coverage, 1);
  assert.equal(t.entries[3].magic, true);
  // a present song that is not 1172-packed disqualifies the chain
  const rom2 = new SparseImage(); rom2.write(base, new Uint8Array(song.length * 10).fill(0x33));
  assert.equal(findMusicTable(ram, rom2), null);
  // the mini's own state chunk inside RDRAM is the selector; a manifest rule reads the address directly
  const set = {state: st, top: {state: [{offset: 0x3E0, bytes: Uint8Array.from(le32(1))}, {offset: PJ64_RDRAM + 0x603C, bytes: Uint8Array.from(le32(7))}]}};
  assert.deepEqual(miniOverrideWords(set), [{addr: 0x603C, value: 7}]);
  assert.equal(miniRareTrack(set, t), 7);
  assert.equal(miniRareTrack({state: st, top: {state: []}}, t, {kind: "ram", addr: 0x603C}), 7);
  assert.equal(miniRareTrack({state: st, top: {state: []}}, t), null, "nothing overridden, no rule");
});

// ---- an ALBankFile in RAM -----------------------------------------------------
// one bank at 0x3000: envelope, two key maps, two sounds on one wavetable (ROM 0x2000: 4 VADPCM frames, zero book → square wave), one instrument
function bankState(extra = {}) {
  const P = a => (0x80000000 | a) >>> 0;
  const words = {...extra.words};
  const put = (a, ...vals) => { vals.forEach((v, i) => { words[a + i * 4] = v >>> 0; }); };
  put(0x3000, 0x42310001, P(0x3010));                                  // ALBankFile: 'B1', 1 bank, bank ptr
  put(0x3010, (2 << 16) | (1 << 8), 22050, 0, P(0x3100), P(0x3140));   // ALBank: 2 instruments, flags 1, 22050 Hz, no percussion, instArray
  // instrument 0: vol 127 pan 64 pri 5 flags 0; trem/vib absent (not written); bendRange 200, 2 sounds
  put(0x3100, 0x7F400500); put(0x310C, (200 << 16) | 2, P(0x3200), P(0x3210));
  // instrument 1: a kit — two single-key sounds
  put(0x3140, 0x7F400500); put(0x314C, (200 << 16) | 2, P(0x3220), P(0x3230));
  put(0x3300, 0, 0xFFFFFFFF, 20000, 0x7F7F0000);                      // envelope: attack 0 (absent on the rip; 0 here), decay hold, release 20 ms, 127/127
  put(0x3400, 0x007F003B, 0x3C000000);                                 // keymap A: vel 0..127, keys 0..59, keyBase 60, detune 0
  put(0x3408, 0x007F3C7F, 0x3C000000);                                 // keymap B: keys 60..127, keyBase 60
  put(0x3410, 0x007F2424, 0x3C000000);                                 // keymap C: key 36 only
  put(0x3418, 0x007F2626, 0x3C000000);                                 // keymap D: key 38 only
  put(0x3200, P(0x3300), P(0x3400), P(0x3500), 0x407F0100);            // sound 0: env, keymap A, wavetable, pan 64 vol 127 flags 1
  put(0x3210, P(0x3300), P(0x3408), P(0x3500), 0x407F0100);            // sound 1: keymap B
  put(0x3220, P(0x3300), P(0x3410), P(0x3500), 0x407F0100);            // kit sounds
  put(0x3230, P(0x3300), P(0x3418), P(0x3500), 0x407F0100);
  put(0x3500, 0x2000, 36, 0x00010000, P(0x3520), P(0x3540));           // wavetable: ROM 0x2000, 36 bytes = 4 frames, type 0 ADPCM, loop, book
  put(0x3520, 8, 64, 0xFFFFFFFF);                                      // loop 8..64 forever (state words absent, as on the rip)
  put(0x3540, 2, 1); for (let i = 0; i < 8; i++) put(0x3548 + i * 4, 0); // book order 2, 1 predictor, zero coefficients
  return state({words});
}
// 4 frames, scale 11 (residual × 2048), nibbles +7 ×4 / −7 ×4 → a square wave of period 8 samples, amplitude 14336/32768
function squareRom() {
  const rom = new SparseImage();
  const frame = [(11 << 4) | 0]; const nib = []; for (let i = 0; i < 16; i++) nib.push((i >> 2) & 1 ? 9 : 7); // 7 = +7, 9 = −7 (signed nibble)
  for (let i = 0; i < 16; i += 2) frame.push((nib[i] << 4) | nib[i + 1]);
  rom.write(0x2000, Uint8Array.from([...frame, ...frame, ...frame, ...frame]));
  return rom;
}

test("ALBankFile in RAM: found by its 'B1' header, read through its pointers; single-key instruments are kits", () => {
  const st = bankState(), {ram} = rdramOf(st), rom = squareRom();
  const files = findRareBankFile(ram);
  assert.equal(files.length, 1);
  assert.deepEqual(files[0], {at: 0x3000, count: 1, banks: [{at: 0x3010, instCount: 2, sampleRate: 22050}]});
  const bank = readRareBank(ram, rom, 0x3010);
  assert.equal(bank.sampleRate, 22050);
  assert.equal(bank.instruments.length, 2);
  const inst = bank.instrument(0);
  assert.equal(inst.bendRange, 200);
  assert.equal(inst.soundCount, 2);
  assert.equal(inst.sounds[0].keymap.keyMax, 59);
  assert.equal(inst.sounds[1].keymap.keyMin, 60);
  assert.equal(inst.sounds[0].envelope.decayTime, -1);
  assert.equal(inst.sounds[0].envelope.releaseTime, 20000);
  assert.equal(inst.sounds[0].envelope.attackTime, 0);
  assert.equal(inst.sounds[0].wave.base, 0x2000);
  assert.equal(inst.sounds[0].wave.loop.end, 64);
  assert.equal(inst.sounds[0].wave.book.order, 2);
  assert.equal(bank.sound(inst, 48, 100), inst.sounds[0]);
  assert.equal(bank.sound(inst, 72, 100), inst.sounds[1]);
  assert.equal(bank.sound(inst, 72, 200), null, "velocity outside every map");
  assert.equal(isKitInstrument(inst), false);
  assert.equal(isKitInstrument(bank.instrument(1)), true);
  const pcm = bank.pcm(inst.sounds[0].wave);
  assert.equal(pcm.pcm.length, 64);
  assert.equal(pcm.looping, true);
  assert.equal(pcm.loopStart, 8);
  assert.ok(Math.abs(pcm.pcm[0] - 14336 / 32768) < 1e-6 && Math.abs(pcm.pcm[4] + 14336 / 32768) < 1e-6, "square wave decoded");
  assert.equal(bank.instrument(2), null);
});

test("envelopeGain: exponential ramps between the SDK's endpoints — instant attack, held decay, release to the floor", () => {
  const out = new Float32Array(400);
  const n = envelopeGain({attackTime: 0, decayTime: -1, releaseTime: 100000, attackVolume: 127, decayVolume: 127}, 1000, 200, out);
  assert.equal(n, 300);
  assert.ok(Math.abs(out[0] - 1) < 1e-6 && Math.abs(out[199] - 1) < 1e-6, "held at the attack volume");
  assert.ok(out[250] < out[200] && out[250] > out[299], "release falls");
  assert.ok(Math.abs(out[299] - ENV_FLOOR) < 1e-4, "reaches the floor at the release time");
  // decay to half over 100 ms: geometric, so the midpoint is 1/sqrt(2)
  const d = new Float32Array(400);
  envelopeGain({attackTime: 0, decayTime: 100000, releaseTime: 1000, attackVolume: 127, decayVolume: 64}, 1000, 300, d);
  assert.ok(Math.abs(d[49] - Math.pow(64 / 127, 0.5)) < 0.02, "geometric midpoint " + d[49]);
  assert.ok(Math.abs(d[150] - 64 / 127) < 1e-3, "holds the decay volume");
  // an attack of 50 ms rises from the floor to 1
  const a = new Float32Array(400);
  envelopeGain({attackTime: 50000, decayTime: -1, releaseTime: 1000, attackVolume: 127, decayVolume: 127}, 1000, 300, a);
  assert.ok(a[0] < 0.001 && a[49] > 0.99 && Math.abs(a[100] - 1) < 1e-6);
});

test("renderN64 dispatches a rare result to renderRare: one note at the bank's rate is the sample at keyBase, an octave up doubles the step; track named as notes.mjs names it", async () => {
  const st = bankState(), rom = squareRom();
  const set = {rom, state: st, top: {state: []}};
  const res = {driver: "rare", ticksPerBeat: 48, tempos: [{tick: 0, bpm: 120}], endTick: 96, loop: null, warnings: [],
               notes: [{ch: 0, inst: 0, drum: false, key: 60, semitone: 60, midi: 60, tick: 0, dur: 48, vel: 127, bank: 0, vol: 1, pan: 0.5, rev: 0, bend: 0},
                       {ch: 3, inst: 0, drum: false, key: 72, semitone: 72, midi: 72, tick: 48, dur: 48, vel: 127, bank: 0, vol: 1, pan: 0.5, rev: 0, bend: 0},
                       {ch: 5, inst: 9, drum: false, key: 60, semitone: 60, midi: 60, tick: 0, dur: 48, vel: 100, bank: 0, vol: 1, pan: 0.5, rev: 0, bend: 0}]};
  const r = await renderN64(res, {set, banks: [0], sampleRate: 22050, stereo: false});
  assert.equal(r.sampleRate, 22050);
  assert.equal(r.bankRate, 22050);
  assert.ok(r["ch 0 inst 0"] instanceof Float32Array && r["ch 3 inst 0"] instanceof Float32Array, "stereo: false keeps the mono buffers");
  assert.deepEqual(r.silent, ["ch 5 inst 9"]);
  assert.match(r.warnings.join(" "), /program 9 .* not in the bank/);
  const a = r["ch 0 inst 0"], b = r["ch 3 inst 0"];
  // ch 0: key 60 = keyBase → the square's own period, 8 samples; amplitude 14336/32768
  assert.ok(Math.abs(a[1] - 14336 / 32768) < 1e-3 && Math.abs(a[5] + 14336 / 32768) < 1e-3, "sample plays at unity " + a[1] + " " + a[5]);
  const zeroCrossings = (x, from, to) => { let n = 0; for (let i = from + 1; i < to; i++) if ((x[i] >= 0) !== (x[i - 1] >= 0)) n++; return n; };
  const half = 22050 * 0.5; // each note lasts one beat = 0.5 s
  const za = zeroCrossings(a, 1000, 1000 + 800), zb = zeroCrossings(b, half + 1000, half + 1800);
  assert.ok(Math.abs(za - 200) <= 2, "period 8 → 200 crossings in 800 samples, got " + za);
  assert.ok(Math.abs(zb - 400) <= 4, "an octave up → period 4, got " + zb);
  // release: 20 ms after the note ends the track is (near) silent
  assert.ok(Math.abs(a[Math.floor(half + 22050 * 0.03)]) < 1e-3);
  // the direct entry point is the same function
  const direct = await renderRare(res, {set, sampleRate: 22050, stereo: false});
  assert.equal(direct["ch 0 inst 0"].length, a.length);
});

test("sequenceOfSet: a set without EAD tables goes to the Rare driver and comes back in the EAD shape, kits flagged from the bank", () => {
  const seqBytes = cseq([[...tempo(500000), 0, 0xC0, 1, ...note(0, 0, 36, 100, 48), ...note(48, 0, 38, 100, 48), ...END],
                         [0, 0xC1, 0, ...note(0, 1, 60, 100, 96), ...END]]);
  const packed = cat([0x11, 0x72], zlib.deflateRawSync(seqBytes));
  const rom = squareRom();
  const base = 0x419000, entries = [];
  for (let i = 0; i < 8; i++) { rom.write(base + i * packed.length, packed); entries.push(...be32(base + i * packed.length), ...be16(seqBytes.length), ...be16(packed.length)); }
  const st = bankState({words: {0x603C: 5}});
  for (let i = 0; i < entries.length; i += 4) st.write(PJ64_RDRAM + 0x2d1c00 + i, Uint8Array.from([entries[i + 3], entries[i + 2], entries[i + 1], entries[i]]));
  const set = {rom, state: st, top: {state: [{offset: PJ64_RDRAM + 0x603C, bytes: Uint8Array.from(le32(5))}]}, order: ["x.miniusf"]};
  const out = sequenceOfSet(set);
  assert.equal(out.driver, "rare");
  assert.equal(out.id, 5);
  assert.equal(out.loc.gen, "rare");
  assert.equal(out.loc.sequences.length, 8);
  assert.deepEqual(out.seq.banks, [0]);
  assert.equal(out.seq.rom, base + 5 * packed.length);
  assert.equal(out.present.length, packed.length);
  const res = out.res;
  assert.equal(res.driver, "rare");
  assert.equal(res.sequenceId, 5);
  assert.equal(res.notes.length, 3);
  assert.deepEqual(res.kits, [1]);
  assert.deepEqual(res.notes.map(n => [n.ch, n.inst, n.drum, n.midi]), [[0, 1, true, 36], [1, 0, false, 60], [0, 1, true, 38]]);
  assert.deepEqual(res.channels, [0, 1]);
  assert.equal(res.reverb, null);
  assert.deepEqual(res.ducked, []);
  // the kit lands on the roll's kit lane with a guessed GM key; the melodic channel keeps its name
  const groups = channelGroups(res);
  assert.deepEqual(groups.map(g => [g.name, g.kit]), [["ch 0 drums", true], ["ch 1 inst 0", false]]);
  assert.ok(toMidi(res).length > 60);
  const direct = rareSequenceOfSet(set);
  assert.equal(direct.res.notes.length, 3);
});

test("pitch bends: wheel events inside a note ride it as slides; the roll splits per landed pitch; the render bends the one voice", async () => {
  // ch0 program 0: C4 for two quarters, the wheel to +8191 (= +2 semitones at the SDK's 200-cent range) halfway; then
  // a note that starts already bent (wheel at note-on → n.bend, no slide) and a kit note under a bend (no slide)
  const bendTo = (v, ch = 0) => { const w = v + 8192; return [0xE0 | ch, w & 0x7F, (w >> 7) & 0x7F]; };
  const t0 = [...tempo(500000), 0, 0xC0, 0, ...note(0, 0, 60, 100, 192), 96, ...bendTo(8191), 96, ...bendTo(0), ...note(0, 0, 64, 100, 96), 96, ...bendTo(-8192), ...note(0, 0, 64, 100, 96), ...END];
  const t1 = [0, 0xC1, 1, ...note(0, 1, 36, 100, 192), 96, ...bendTo(8191, 1), ...END];
  const cs = parseCSeq(cseq([t0, t1]));
  const res = cseqNotes(cs, {bendRangeOf: p => p === 1 ? 1200 : 200});
  const [a, b, c] = res.notes.filter(n => n.ch === 0), k = res.notes.find(n => n.ch === 1);
  assert.deepEqual(a.slide, [{t: 48, len: 1, to: 8191 / 8192 * 2}]);
  assert.equal(a.bend, 0);
  assert.equal(b.slide, undefined, "the wheel returned to 0 at the note-on: no slide");
  assert.ok(Math.abs(c.bend + 1) < 1e-9 && c.slide === undefined, "starts bent a whole tone down, nothing inside");
  assert.deepEqual(k.slide, [{t: 48, len: 1, to: 8191 / 8192 * 12}], "range from the instrument (1200 cents)");
  assert.match(res.warnings.join(" "), /2 notes carry pitch bends/);
  // the roll: the first note becomes C4 then D4; the kit note keeps its slot when flagged drum
  const split = splitSlides(res.notes);
  assert.deepEqual(split.filter(n => n.ch === 0).map(n => [n.midi, n.tick, n.dur, !!n.slid]), [[60, 0, 48, true], [62, 48, 48, true], [64, 96, 48, false], [64, 144, 48, false]]);
  k.drum = true;
  assert.equal(splitSlides([k]).length, 1);
  assert.ok(toMidi(res).length > 100);
  assert.match(toNotesTxt(res), /D4 1 v100/);
  // the render: one voice, its period shortening by 2^(2/12) after the bend — no second attack
  const st = bankState(), rom = squareRom(), set = {rom, state: st, top: {state: []}};
  const one = {...res, notes: [a]};
  const r = await renderN64(one, {set, banks: [0], sampleRate: 22050, stereo: false});
  const x = r["ch 0 inst 0"];
  const zc = (from, to) => { let n = 0; for (let i = from + 1; i < to; i++) if ((x[i] >= 0) !== (x[i - 1] >= 0)) n++; return n; };
  const before = zc(2000, 2800), after = zc(11025 + 2000, 11025 + 2800);
  assert.ok(Math.abs(before - 200) <= 2, "period 8 before: " + before);
  assert.ok(Math.abs(after - 200 * Math.pow(2, 2 / 12)) <= 3, "a whole tone up after: " + after);
  let peak = 0; for (let i = 11025 - 50; i < 11025 + 50; i++) peak = Math.max(peak, Math.abs(x[i]));
  assert.ok(peak > 0.9 * 14336 / 32768 * 100 / 127, "the voice carries through the bend at its level (velocity 100; interpolated, so a hair under the square peak): " + peak);
});

test("stereo: a track is {l, r}; the voice pan is samplePan + cc10 − 64 through libaudio's equal-power table; the mono option keeps the old buffers", async () => {
  assert.deepEqual(panGains(0), {l: 1, r: Math.cos(127 * Math.PI / 254)});
  assert.ok(Math.abs(panGains(0).r) < 1e-9 && Math.abs(panGains(127).l) < 1e-9 && panGains(127).r === 1);
  const c = panGains(64); assert.ok(Math.abs(c.l - c.r) < 0.03 && Math.abs(c.l * c.l + c.r * c.r - 1) < 1e-9, "centre: equal power");
  const st = bankState(), rom = squareRom(), set = {rom, state: st, top: {state: []}};
  const mk = (ch, pan) => ({ch, inst: 0, drum: false, key: 60, semitone: 60, midi: 60, tick: 0, dur: 48, vel: 127, bank: 0, vol: 1, pan, rev: 0, bend: 0});
  const res = {driver: "rare", ticksPerBeat: 48, tempos: [{tick: 0, bpm: 120}], endTick: 48, loop: null, warnings: [], notes: [mk(0, 0), mk(1, 64), mk(2, 127), mk(3, undefined)]};
  const r = await renderN64(res, {set, banks: [0], sampleRate: 22050});
  const rms = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); };
  for (const k of ["ch 0 inst 0", "ch 1 inst 0", "ch 2 inst 0", "ch 3 inst 0"]) { assert.ok(r[k].l instanceof Float32Array && r[k].r instanceof Float32Array && r[k].l.length === r[k].r.length, k); }
  assert.ok(rms(r["ch 0 inst 0"].r) < 1e-9 && rms(r["ch 0 inst 0"].l) > 0.1, "cc10 0: hard left");
  assert.ok(rms(r["ch 2 inst 0"].l) < 1e-9 && rms(r["ch 2 inst 0"].r) > 0.1, "cc10 127: hard right");
  const mid = r["ch 1 inst 0"]; assert.ok(Math.abs(rms(mid.l) / rms(mid.r) - 1) < 0.03, "cc10 64: centred");
  assert.ok(Math.abs(rms(r["ch 3 inst 0"].l) - rms(mid.l)) < 1e-6, "no cc10 = centre");
  // pans reported per track: the channel's cc10 and the voice pans used
  assert.deepEqual(r.pans["ch 0 inst 0"], {cc10: 0, voice: [{pan: 0, notes: 1}]});
  assert.deepEqual(r.pans["ch 1 inst 0"].voice, [{pan: 64, notes: 1}]);
  // the centred voice's power equals the mono render's
  const mono = await renderN64(res, {set, banks: [0], sampleRate: 22050, stereo: false});
  assert.ok(mono["ch 1 inst 0"] instanceof Float32Array);
  const m = rms(mono["ch 1 inst 0"]), sPow = Math.sqrt(rms(mid.l) ** 2 + rms(mid.r) ** 2);
  assert.ok(Math.abs(20 * Math.log10(sPow / m)) < 0.1, "power sum of L and R = the mono level");
});

// the effect block as GoldenEye's RAM holds it (s32: sections, length, then 8 per section), with the zeros the rip drops
const GE_FX = [6, 6400, 0, 160, 9830, -9830, 0, 0, 0, 0, 160, 320, 9830, -9830, 11140, 0, 0, 0x2500, 800, 2560, 16384, -16384, 4587, 0, 0, 0x3000,
               3200, 5600, 16384, -16384, 4587, 0, 0, 0x3500, 3360, 4800, 8192, -8192, 0, 0, 0, 0x4000, 0, 5920, 13000, -13000, 0, 380, 10, 0x4500];

test("reverb: the effect parameter block is found by shape in RAM (zeros absent, as the rip leaves them); a section is an all-pass with a delayed, filtered tap", () => {
  const words = {}; GE_FX.forEach((v, i) => { if (v !== 0) words[0x23100 + i * 4] = v >>> 0; });
  const st = state({words: {...words, 0x100: 5, 0x104: 0x2000}}), {ram} = rdramOf(st);
  const fx = findFxParams(ram);
  assert.ok(fx, "found");
  assert.equal(fx.at, 0x23100); assert.equal(fx.sections, 6); assert.equal(fx.length, 6400);
  assert.deepEqual(fx.delays[1], {input: 160, output: 320, fbcoef: 9830, ffcoef: -9830, gain: 11140, chorusRate: 0, chorusDepth: 0, lpfilter: 0x2500});
  assert.deepEqual(fx.delays[5], {input: 0, output: 5920, fbcoef: 13000, ffcoef: -13000, gain: 0, chorusRate: 380, chorusDepth: 10, lpfilter: 0x4500});
  assert.equal(findFxParams(rdramOf(state({words: {0x100: 5, 0x104: 0x2000}})).ram), null, "a header with no sections behind it is not a block");
  // one gained all-pass section: an impulse comes out ff-scaled at once, then at the tap delay (output − input) at (1 − ff²)…
  const one = {sections: 1, length: 1024, delays: [{input: 0, output: 100, fbcoef: 0x4000, ffcoef: -0x4000, gain: 0x7FFF, chorusRate: 0, chorusDepth: 0, lpfilter: 0}]};
  const fx1 = new SdkFx(one, 22050, 22050);
  const y = []; for (let i = 0; i < 400; i++) y.push(fx1.step(i === 0 ? 1 : 0));
  assert.ok(Math.abs(y[0] + 0.5 * (0x7FFF / 32768)) < 1e-3, "direct path −ff: " + y[0]);
  assert.ok(y.slice(1, 100).every(v => Math.abs(v) < 1e-9), "silent until the tap");
  assert.ok(Math.abs(y[100] - 0.75 * (0x7FFF / 32768)) < 1e-3, "first echo at the tap delay: " + y[100]);
  assert.ok(Math.abs(y[200] - 0.375 * (0x7FFF / 32768)) < 1e-3, "second echo through the feedback: " + y[200]);
  // the game's block at the output rate: a tap at 320 samples through two all-passes, and energy keeps arriving past 5600
  const fxG = new SdkFx({sections: 6, length: 6400, delays: findFxParams(ram).delays}, 22050, 22050);
  const z = []; for (let i = 0; i < 6400; i++) z.push(fxG.step(i === 0 ? 1 : 0));
  assert.ok(Math.abs(z[0]) > 1e-3, "the feedforward path is instant through the cascade (section 2 reads what section 1 just wrote at 160)");
  assert.ok(z.slice(30, 160).every(v => Math.abs(v) < 1e-4) && Math.abs(z[160]) > 1e-2 && Math.abs(z[320]) > 1e-2, "then (past the low-pass's smear) section 1's tap at 160 and section 2's at 320");
  assert.ok(z.slice(5600, 6400).some(v => Math.abs(v) > 1e-4), "the long taps ring past 5600 samples");
  // SMALLROOM stands in only when nothing is found
  assert.equal(SMALLROOM_FX(22050).sections, 3);
});

test("reverb + held volume in the render: cc91 sends the voice into the effect (a tail after the release, the same in both channels); off when asked; cc7 under the note steps its level", async () => {
  const st = bankState(), rom = squareRom(), set = {rom, state: st, top: {state: []}};
  const mk = (ch, rev, extra = {}) => ({ch, inst: 0, drum: false, key: 60, semitone: 60, midi: 60, tick: 0, dur: 24, vel: 127, bank: 0, vol: 1, pan: 64, rev, bend: 0, ...extra});
  const res = {driver: "rare", ticksPerBeat: 48, tempos: [{tick: 0, bpm: 120}], endTick: 96, loop: null, warnings: [],
               notes: [mk(0, 127), mk(1, 0), mk(2, 0, {dur: 48, vol: 1, gain: [{t: 0, l: 1}, {t: 24, l: 0.5}]})]};
  const one = {sections: 1, length: 4096, delays: [{input: 0, output: 2205, fbcoef: 0, ffcoef: 0, gain: 0x7FFF, chorusRate: 0, chorusDepth: 0, lpfilter: 0}]}; // a plain 100 ms echo
  const r = await renderN64(res, {set, banks: [0], sampleRate: 22050, fx: one});
  const rms = (a, from, to) => { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return Math.sqrt(s / (to - from)); };
  const wet = r["ch 0 inst 0"], dry = r["ch 1 inst 0"];
  // the note lasts 0.25 s (5512 samples) + 20 ms release; the echo of its start lands 100 ms after each moment
  assert.ok(rms(dry.l, 6500, 7500) < 1e-4, "no send: silent after the release");
  assert.ok(rms(wet.l, 6500, 7500) > 0.1, "sent at 127: the echo carries on 100 ms past the release: " + rms(wet.l, 6500, 7500));
  let same = true; for (let i = 6500; i < 7500; i++) if (Math.abs(wet.l[i] - wet.r[i]) > 1e-9) same = false;
  assert.ok(same, "the return is the same in both channels");
  assert.deepEqual(r.reverb, {at: undefined, sections: 1, length: 4096});
  const off = await renderN64(res, {set, banks: [0], sampleRate: 22050, reverb: null});
  assert.ok(rms(off["ch 0 inst 0"].l, 6500, 7500) < 1e-4, "reverb: null renders dry");
  assert.equal(off.reverb, null);
  // cc7 halves the channel volume halfway through the third note
  const g = r["ch 2 inst 0"];
  const first = rms(g.l, 1000, 4000), second = rms(g.l, 6500, 9500);
  assert.ok(Math.abs(second / first - 0.5) < 0.02, "half the level after the breakpoint: " + (second / first));
  // attachGains from the sequence: a cc7 change inside the note, none outside
  const notes = [{ch: 0, tick: 0, dur: 96, vol: 100 / 127}, {ch: 0, tick: 96, dur: 48, vol: 60 / 127}];
  assert.equal(attachGains(notes, new Map([[0, [{tick: 48, value: 60}, {tick: 96, value: 60}]]])), 1);
  assert.deepEqual(notes[0].gain, [{t: 0, l: 100 / 127}, {t: 48, l: 60 / 127}]);
  assert.equal(notes[1].gain, undefined);
  // the whole path: a cc7 inside a note from the bytes
  const t0 = [...tempo(500000), 0, 0xC0, 0, 0, 0xB0, 7, 127, ...note(0, 0, 60, 100, 192), 96, 0xB0, 7, 64, ...END];
  const seqRes = cseqNotes(parseCSeq(cseq([t0])));
  assert.deepEqual(seqRes.notes[0].gain, [{t: 0, l: 1}, {t: 48, l: 64 / 127}]);
  assert.match(seqRes.warnings.join(" "), /1 notes change volume while held/);
});

// ---- other Rare games: the same SDK formats, kept differently -----------------
test("1172, two flavours: GoldenEye's bare stream, Banjo-Kazooie's u32 unpacked size before it", () => {
  const seq = cseq([[...tempo(500000), ...note(0, 0, 60, 100, 48), ...END]]);
  const stream = zlib.deflateRawSync(seq);
  const sized = parse1172(cat([0x11, 0x72], be32(seq.length), stream)), bare = parse1172(cat([0x11, 0x72], stream));
  assert.equal(sized.flavour, "sized"); assert.deepEqual([...sized.data], [...seq]);
  assert.equal(bare.flavour, "bare"); assert.deepEqual([...bare.data], [...seq]);
  assert.equal(parse1172(cat([0x11, 0x72], stream), seq.length).flavour, "bare", "a size from the table means the bare form");
});

test("ALCSeq: a loop end's operands are raw bytes (cseq.c reads them off curLoc) — an FE in its offset is not a back-reference", () => {
  const body = [];
  for (let i = 0; i < 99; i++) body.push(...note(0, 0, 60, 100, 1));
  body.push(...note(0, 0, 62, 100, 200)); // 501 bytes: the loop end reaches back 0x1FE
  const t0 = [...tempo(500000), 0, ...LOOPSTART, ...body, ...loopEnd(0, 0xFF, body.length), ...END];
  const cs = parseCSeq(cseq([t0]));
  const tr = cs.tracks[0];
  assert.equal(tr.loopEnd.back, 0x1FE);
  assert.equal(tr.end.how, "loop");
  assert.equal(cseqNotes(cs).notes.length, 100);
});

test("a song unpacked in RAM: found by its division and first track with the header absent or stale; tracks walked back to back; the mini's own chunks pick among several", () => {
  const P = n => { const a = [...n]; while (a.length % 4) a.push(0); return Uint8Array.from(a); };
  const t0 = [...tempo(500000), ...note(0, 0, 60, 100, 48), ...END], t1 = [0, 0xC1, 3, ...note(0, 1, 64, 90, 96), ...END];
  const songA = cseq([t0, t1]), songB = cseq([[...tempo(400000), ...note(0, 2, 67, 80, 24), ...END]]);
  // A at 0x10000 with no header word in the rip (division onward only); B at 0x20000 whole, its offset table stale (points at 0x100)
  const staleB = cat(be32(0x44), be32(0x100), songB.subarray(8));
  const st = state({bytes: {[0x10040]: P(songA.subarray(0x40)), [0x20000]: P(staleB)}});
  const {ram} = rdramOf(st);
  const songs = findRamSequences(ram);
  assert.deepEqual(songs.map(s => [s.addr, s.cs.division, s.cs.tracks.filter(t => t).length]), [[0x10000, 96, 2], [0x20000, 96, 1]]);
  assert.deepEqual(songs[0].cs.offsets.slice(0, 3), [0x44, 0x44 + t0.length, 0], "walked, not read from the header");
  assert.equal(songs[1].cs.tracks[0].events.filter(e => e.type === "note").length, 1, "the stale slot is ignored; the walk stops at the zeros after the song");
  assert.equal(songs[0].present[0], 0, "the absent header is marked absent");
  // the mini that wrote B's bytes plays B; one that wrote nothing gets the first, flagged
  const chunk = (addr, n) => ({offset: PJ64_RDRAM + addr, bytes: new Uint8Array(n)});
  assert.equal(miniRamSequence({state: st, top: {state: [chunk(0x20044, 12)]}}, ram).addr, 0x20000);
  const none = miniRamSequence({state: st, top: {state: []}}, ram);
  assert.deepEqual([none.addr, none.written, none.of], [0x10000, 0, 2]);
  const out = rareSequenceOfSet({rom: new SparseImage(), state: st, top: {state: []}});
  assert.equal(out.seq.ram, 0x10000);
  assert.equal(out.res.notes.length, 2);
  assert.match(out.res.warnings.join(" "), /writes none of the 2 songs/);
  assert.match(out.res.warnings.join(" "), /no sound bank/);
});

test("the SDK sequence file in RAM ('S1', absolute ROM offsets) with the song passed in a0", () => {
  const rom = new SparseImage(), entries = [], base = 0x100000;
  const songs = [0, 1, 2, 3].map(k => cseq([[...tempo(500000), ...note(0, 0, 60 + k, 100, 48), ...END]]));
  let at = base;
  for (const sg of songs) { rom.write(at, sg); entries.push(...be32(at), ...be32(sg.length)); at += sg.length + 4; }
  const header = [0x53, 0x31, ...be16(songs.length)];
  const st = state({bytes: {0x5000: Uint8Array.from([...header, ...entries, 0, 0, 0, 0])}});
  const {ram} = rdramOf(st);
  const t = findSeqFileInRam(ram, rom);
  assert.deepEqual([t.kind, t.at, t.count, t.entries[2].rom, t.entries[2].size], ["S1", 0x5000, 4, base + songs[0].length + songs[1].length + 8, songs[2].length]);
  const set = {rom, state: st, top: {state: [{offset: 0x70, bytes: Uint8Array.from(le32(2))}]}};
  assert.deepEqual(miniOverrideRegs(set), [{reg: 4, value: 2}]);
  const out = rareSequenceOfSet(set);
  assert.equal(out.id, 2);
  assert.deepEqual(out.res.notes.map(n => n.midi), [62]);
  // a mini that sets nothing: the manifest names the register, read from the lib's own state
  st.write(0x70, Uint8Array.from(le32(3)));
  assert.equal(rareSequenceOfSet({rom, state: st, top: {state: []}}, {game: {seqId: {kind: "reg", reg: 4}}}).id, 3);
});

test("every ALBank in RAM: the 'B1' file's first, then any of the bank's own shape (the rip may not keep the file header)", () => {
  const P = a => (0x80000000 | a) >>> 0;
  const st = bankState({words: {0x2000: (1 << 16), 0x2004: 32000, 0x2008: 0, 0x200C: P(0x3100)}});
  const {ram} = rdramOf(st);
  assert.deepEqual(findRareBanks(ram).map(b => [b.at, b.how, b.instCount, b.sampleRate]), [[0x3010, "B1", 2, 22050], [0x2000, "shape", 1, 32000]]);
});

// ---- one-shot samples: the note ends with its sample ----------------------------
// instrument 0's upper key map (60..127) re-pointed at a one-shot raw 16-bit wavetable: 0.1 s at
// 22050 Hz, a 441 Hz tone falling as exp(−t / 20 ms) — a hit. The lower map keeps the looping square.
function oneShotSet() {
  const P = a => (0x80000000 | a) >>> 0, N = 2205;
  const st = bankState({words: {0x3600: 0x8000, 0x3604: N * 2, 0x3608: 0x01000000, 0x360C: 0, 0x3610: 0}});
  st.write(PJ64_RDRAM + 0x3218, Uint8Array.from(le32(P(0x3600))));
  const rom = squareRom(), pcm = new Uint8Array(N * 2);
  for (let i = 0; i < N; i++) { const v = Math.round(0.8 * 32767 * Math.exp(-i / 22050 / 0.02) * Math.sin(2 * Math.PI * 441 * i / 22050)); pcm[i * 2] = (v >> 8) & 255; pcm[i * 2 + 1] = v & 255; }
  rom.write(0x8000, pcm);
  return {st, rom};
}
test("one-shot samples: a note on a non-looping sample carries the sample's decay as a volume shape at its playback rate; a looping sound and a drum get none", () => {
  const {st, rom} = oneShotSet(), {ram} = rdramOf(st);
  const bank = readRareBank(ram, rom, 0x3010);
  const d = sampleDecay(bank.pcm(bank.instrument(0).sounds[1].wave).pcm, 22050);
  assert.deepEqual(d.map(q => q.r), [...SHAPE_LEVELS, 0], "half, quarter, eighth, sixteenth, then silence");
  assert.ok(Math.abs(d[0].s - 0.0139) < 0.006 && Math.abs(d[3].s - 0.0555) < 0.006, "−6 dB at 20 ms × ln 2, −24 dB at 4 × that: " + d.map(q => q.s.toFixed(4)));
  assert.ok(Math.abs(d[4].s - 0.1) < 1e-9, "silent where the sample ends");
  const tempos = [{tick: 0, bpm: 120}]; // 96 ticks a second
  const mk = (key, tick, dur, extra = {}) => ({ch: 0, inst: 0, drum: false, key, semitone: key, midi: key, tick, dur, vel: 100, ...extra});
  const notes = [mk(60, 0, 96), mk(72, 96, 96), mk(48, 192, 96), mk(60, 288, 4), {...mk(36, 300, 96), inst: 1, drum: true}];
  assert.equal(attachVoiceShapes(notes, bank, tempos), 3);
  const [atKey, octaveUp, looping, short, drum] = notes;
  assert.equal(atKey.env.at(-1).r, 0);
  assert.ok(Math.abs(atKey.env.at(-1).t - 10) <= 1, "0.1 s = ~10 ticks at key 60 (= keyBase): " + JSON.stringify(atKey.env));
  assert.ok(Math.abs(octaveUp.env.at(-1).t - 5) <= 1, "an octave up plays the sample twice as fast: " + JSON.stringify(octaveUp.env));
  assert.equal(looping.env, undefined, "a looping sample sustains: no shape");
  assert.ok(short.env.every(q => q.t < 4), "points past a short note's end are not kept");
  assert.equal(drum.env, undefined, "a kit hit is the drum lane's, no shape");
  // the MIDI carries it as aftertouch inside the note; pitch and length untouched
  const res = {notes, tempos, endTick: 400, warnings: []};
  const smf = readSmf(toMidi(res));
  const tr = smf.tracks.find(t => t.name === "ch 0 inst 0");
  assert.deepEqual(tr.notes.map(n => [n.t, n.d, n.p]), [[0, 960, 60], [960, 960, 72], [1920, 960, 48], [2880, 40, 60]]);
  const at = tr.other.filter(o => o.kind === "shape");
  assert.equal(at.length, atKey.env.length + octaveUp.env.length + short.env.length);
  assert.equal(at.find(o => o.t === atKey.env.at(-1).t * 10).key, "0:60:0", "the last point is silence");
});
test("one-shot samples through sequenceOfSet: the capture says how many notes end with their sample", () => {
  const seqBytes = cseq([[...tempo(500000), 0, 0xC0, 0, ...note(0, 0, 72, 100, 96), ...note(96, 0, 48, 100, 96), ...END]]);
  const packed = cat([0x11, 0x72], zlib.deflateRawSync(seqBytes));
  const {st, rom} = oneShotSet();
  const base = 0x419000, entries = [];
  for (let i = 0; i < 8; i++) { rom.write(base + i * packed.length, packed); entries.push(...be32(base + i * packed.length), ...be16(seqBytes.length), ...be16(packed.length)); }
  st.write(PJ64_RDRAM + 0x603C, Uint8Array.from(le32(5)));
  for (let i = 0; i < entries.length; i += 4) st.write(PJ64_RDRAM + 0x2d1c00 + i, Uint8Array.from([entries[i + 3], entries[i + 2], entries[i + 1], entries[i]]));
  const out = sequenceOfSet({rom, state: st, top: {state: [{offset: PJ64_RDRAM + 0x603C, bytes: Uint8Array.from(le32(5))}]}, order: ["x.miniusf"]});
  const [hit, held] = out.res.notes;
  assert.ok(hit.env && hit.env.at(-1).r === 0, "key 72: the one-shot ends inside the note");
  assert.equal(held.env, undefined, "key 48: the looping square holds");
  assert.ok(out.res.warnings.some(w => /^1 notes fade as the bank plays them/.test(w)), out.res.warnings.join(" | "));
});
test("one-shot samples + pitch bends: each landed pitch keeps its share of the shape, timed from its own start", () => {
  const n = {ch: 0, inst: 0, drum: false, key: 60, semitone: 60, midi: 60, tick: 0, dur: 96, vel: 100,
             slide: [{t: 48, len: 1, to: 2}], env: [{t: 10, r: 0.5}, {t: 60, r: 0.25}, {t: 90, r: 0}]};
  const [a, b] = splitSlides([n]);
  assert.deepEqual(a.env, [{t: 10, r: 0.5}]);
  assert.deepEqual(b.env, [{t: 12, r: 0.25}, {t: 42, r: 0}]);
});
test("envelope decays: a looping sound whose envelope falls (decayTime, decayVolume < attack) fades to the held decay level; a held envelope stays flat", () => {
  const st = bankState();
  st.write(PJ64_RDRAM + 0x3304, Uint8Array.from(le32(100000)));      // decay over 100 ms…
  st.write(PJ64_RDRAM + 0x330C, Uint8Array.from(le32(0x7F200000)));  // …from 127 to 32
  const {ram} = rdramOf(st), bank = readRareBank(ram, squareRom(), 0x3010);
  const n = {ch: 0, inst: 0, drum: false, key: 48, semitone: 48, midi: 48, tick: 0, dur: 96, vel: 100};
  assert.equal(attachVoiceShapes([n], bank, [{tick: 0, bpm: 120}]), 1);
  assert.equal(n.env.length, 2, JSON.stringify(n.env));
  assert.ok(Math.abs(n.env[0].t - 5) <= 1 && n.env[0].r === 0.5, "half way down the geometric ramp at 50 ms: " + JSON.stringify(n.env));
  assert.ok(Math.abs(n.env[1].t - 10) <= 1 && Math.abs(n.env[1].r - 32 / 127) < 1e-9, "then held at 32/127 from 100 ms");
  const flat = {...n, env: undefined}, held = readRareBank(rdramOf(bankState()).ram, squareRom(), 0x3010);
  assert.equal(attachVoiceShapes([flat], held, [{tick: 0, bpm: 120}]), 0);
});
