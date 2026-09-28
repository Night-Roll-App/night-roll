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
         findRareBankFile, readRareBank, isKitInstrument, envelopeGain, renderRare, rareSequenceOfSet, ENV_FLOOR } from "../tools/n64/rare.mjs";
import { SparseImage, PJ64_RDRAM, rdramOf } from "../tools/n64/usf.mjs";
import { sequenceOfSet } from "../tools/n64/capture.mjs";
import { renderN64 } from "../tools/n64/render.mjs";
import { toMidi, channelGroups } from "../tools/n64/notes.mjs";
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
  const r = await renderN64(res, {set, banks: [0], sampleRate: 22050});
  assert.equal(r.sampleRate, 22050);
  assert.equal(r.bankRate, 22050);
  assert.ok(r["ch 0 inst 0"] instanceof Float32Array && r["ch 3 inst 0"] instanceof Float32Array);
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
  const direct = await renderRare(res, {set, sampleRate: 22050});
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
