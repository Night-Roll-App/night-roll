// End-to-end test of the SPC pipeline against a synthetic, self-assembled
// SPC (no copyrighted data): SPC700 emulation -> DSP write log -> BRR
// decode + root estimation -> note reconstruction -> .notes.txt / MIDI.
// Run: perl -e 'alarm 120; exec @ARGV' node --test tests/spc.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { makeTestSPC, TEST_ROOT_HZ, TEST_MELODY_MIDI, TEST_TICKS_PER_NOTE, TEST_TICK_TARGET } from "../tools/spc/make-test-spc.mjs";
import { parseSPC, runSPC, parseXid6, parseTrackName } from "../tools/spc/spc.mjs";
import { reconstruct, toNotesTxt, estimateRoot, pitchName, TICK_SEC, SAMPLE_RATE, DRUM_MIN_HITS, DRUM_MAX_MEDIAN_DUR_SEC, spcRebin, SPC_SHAPE, PAN_STEP, rootFallback } from "../tools/spc/notes.mjs";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp } from "./harness.mjs";
import { decodeBRR, encodeBRR } from "../tools/spc/brr.mjs";
import { SPC700 } from "../tools/spc/cpu-spc700.mjs";
import { DspVoices, RATE_PERIOD, OFF } from "../tools/spc/dsp-state.mjs";
import { makeMidi } from "../tools/nsf/midi-write.mjs";

const rootMidiExpected = 69 + 12 * Math.log2(TEST_ROOT_HZ / 440); // 500 Hz ≈ B4 + 21 cents
const noteSec = TEST_TICKS_PER_NOTE * TEST_TICK_TARGET / 8000;     // 16 ticks × 31.25 ms = 0.5 s
const noteFrames = noteSec / TICK_SEC;                              // 250

test("BRR codec: a sine survives encode -> decode with the hardware arithmetic", () => {
  const pcm = new Int16Array(128);
  for (let i = 0; i < 128; i++) pcm[i] = Math.round(12000 * Math.sin(2 * Math.PI * i / 32));
  const brr = encodeBRR(pcm, {loopStart: 64});
  assert.equal(brr.length, 8 * 9, "16 samples per 9-byte block");
  assert.equal(brr[7 * 9] & 3, 3, "last block carries LOOP+END");
  assert.equal(brr[4 * 9] >> 2 & 3, 0, "loop-start block is filter 0 (decodes the same every pass)");
  const ram = new Uint8Array(0x10000);
  ram.set(brr, 0x1000);
  const dec = decodeBRR(ram, 0x1000, 0x1000 + 4 * 9);
  assert.equal(dec.pcm.length, 128);
  assert.equal(dec.looped, true);
  assert.equal(dec.loopStart, 64);
  assert.equal(dec.loopLength, 64);
  let err = 0, energy = 0;
  for (let i = 0; i < 128; i++) { err += (dec.pcm[i] - pcm[i]) ** 2; energy += pcm[i] ** 2; }
  assert.ok(Math.sqrt(err / energy) < 0.05, "reconstruction error under 5% RMS, got " + Math.sqrt(err / energy));
  // one-shot: END without LOOP silences instead of looping
  const one = encodeBRR(pcm);
  assert.equal(one[7 * 9] & 3, 1);
  ram.set(one, 0x2000);
  assert.equal(decodeBRR(ram, 0x2000, 0).looped, false);
});

test("root estimation: known-period samples come back within a semitone, with confidence", () => {
  const ram = new Uint8Array(0x10000);
  // looped single-cycle sine, period 64 (the test instrument)
  const sine = new Int16Array(64);
  for (let i = 0; i < 64; i++) sine[i] = Math.round(12000 * Math.sin(2 * Math.PI * i / 64));
  ram.set(encodeBRR(sine, {loopStart: 0}), 0x1000);
  const a = estimateRoot(decodeBRR(ram, 0x1000, 0x1000));
  assert.ok(Math.abs(a.rootMidi - rootMidiExpected) < 0.5, "looped sine root " + a.rootMidi + " vs " + rootMidiExpected);
  assert.equal(a.confidence, "high");
  // a 16-sample square wave loop (the classic SNES synth patch): 2000 Hz at $1000
  const sq = Int16Array.from({length: 16}, (_, i) => i < 8 ? 8000 : -8000);
  ram.set(encodeBRR(sq, {loopStart: 0}), 0x2000);
  const b = estimateRoot(decodeBRR(ram, 0x2000, 0x2000));
  assert.ok(Math.abs(b.rootHz - 2000) < 1, "square root Hz " + b.rootHz);
  // a one-shot sawtooth with a 100-sample period (320 Hz): NSDF alone, no loop help
  const saw = new Int16Array(2400);
  for (let i = 0; i < 2400; i++) saw[i] = Math.round(((i % 100) / 100 * 2 - 1) * 9000);
  ram.set(encodeBRR(saw), 0x3000);
  const c = estimateRoot(decodeBRR(ram, 0x3000, 0));
  assert.ok(Math.abs(12 * Math.log2(c.rootHz / 320)) < 0.5, "one-shot saw root " + c.rootHz);
  assert.notEqual(c.confidence, "none");
  // white-ish noise: no root, and says so
  let seed = 12345;
  const noise = Int16Array.from({length: 1024}, () => { seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF; return (seed >> 8 & 0x3FFF) - 0x2000; });
  ram.set(encodeBRR(noise), 0x5000);
  const d = estimateRoot(decodeBRR(ram, 0x5000, 0));
  assert.ok(d.confidence === "none" || d.confidence === "low", "noise confidence " + d.confidence);
});

test("SPC pipeline: synthetic tune comes back within a semitone, with onsets on the timer grid", () => {
  const spc = parseSPC(makeTestSPC().buffer);
  assert.equal(spc.name, "Night Roll test tune");
  assert.equal(spc.pc, 0x200);
  assert.equal(spc.tags.seconds, 3);

  const cap = runSPC(spc, 4.2); // 8 quarter notes + a bit: two passes of the melody
  assert.ok(cap.dspLog.some(w => w.addr === 0x4C && w.value === 1), "KON writes were logged");
  assert.equal(cap.instruments.size, 1, "one sample captured");
  const inst = [...cap.instruments.values()][0];
  assert.equal(inst.srcn, 0);
  assert.equal(inst.pcm.length, 64);
  assert.equal(inst.looped, true);

  const r = reconstruct(cap);
  assert.equal(r.instruments[0].root.confidence, "high");
  assert.ok(Math.abs(r.instruments[0].root.rootMidi - rootMidiExpected) < 0.5, "root within half a semitone");
  const v0 = r.events.filter(e => e.channel === "voice0");
  assert.ok(v0.length >= 8, "two passes of the melody, got " + v0.length);
  // pitches: within a semitone of the melody (the root estimate is the only
  // approximation in the chain; the PITCH values were computed from the true root)
  v0.slice(0, 4).forEach((e, i) => {
    assert.ok(Math.abs(e.midi - TEST_MELODY_MIDI[i]) <= 1, `note ${i}: ${pitchName(e.midi)} vs ${pitchName(TEST_MELODY_MIDI[i])}`);
  });
  assert.deepEqual(v0.slice(0, 4).map(e => pitchName(e.midi)), ["C4", "E4", "G4", "C5"]);
  assert.deepEqual(v0.slice(4, 8).map(e => pitchName(e.midi)), ["C4", "E4", "G4", "C5"], "the melody loops");
  // onsets every 16 timer ticks (500 ms = 250 frames of 2 ms), duration 15 ticks (KOFF)
  for (let i = 1; i < 4; i++) {
    const gap = v0[i].startFrame - v0[i - 1].startFrame;
    assert.ok(Math.abs(gap - noteFrames) <= 3, "onset spacing ≈ " + noteFrames + " frames, got " + gap);
  }
  for (const e of v0.slice(0, 4)) {
    const d = e.endFrame - e.startFrame;
    assert.ok(Math.abs(d - noteFrames * 15 / 16) <= 3, "duration ≈ 15 ticks, got " + d + " frames");
  }
  assert.ok(v0.every(e => e.vol === 127), "VOL 7F with full ADSR peak = level 127");
  assert.ok(v0.every(e => !e.legato), "KON per note, no legato splits");

  const txt = toNotesTxt(r, {bpm: 120, title: "test"});
  assert.match(txt, /## voice 0 — instrument 0/);
  assert.match(txt, /# instrument 0: sample #0 @\$0400, 64 samples, loop 64 @0, root ≈ B4\+2\dc \(50\d\.\d Hz, high\)/);
  assert.match(txt, /bar 1: 1 C4 1 v127, 2 E4 1 v127, 3 G4 1 v127, 4 C5 1 v127/);
  assert.match(txt, /no key is stated/);

  // MIDI: voice0 lands on channel 0 with velocity 127
  const bytes = makeMidi(r.events, {bpm: 120, frameSec: r.frameSec, volMax: 127});
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), "MThd");
  let ons = 0;
  for (let i = 0; i + 2 < bytes.length; i++) if (bytes[i] === 0x90 && bytes[i + 1] === 60 && bytes[i + 2] === 127) ons++;
  assert.ok(ons >= 2, "C4 note-ons on channel 0 at velocity 127");
});

test("root override: --root moves every note on that instrument together", () => {
  const cap = runSPC(parseSPC(makeTestSPC().buffer), 2.2);
  const base = reconstruct(cap).events.filter(e => e.channel === "voice0").map(e => e.midi);
  const key = [...cap.instruments.keys()][0];
  const up = reconstruct(cap, {roots: {[key]: rootMidiExpected + 12}}).events.filter(e => e.channel === "voice0").map(e => e.midi);
  assert.deepEqual(up, base.map(m => m + 12));
  // by srcn number works too (what the CLI's --root 0=C6 resolves to)
  const bySrcn = reconstruct(cap, {roots: {0: rootMidiExpected + 12}}).events.filter(e => e.channel === "voice0").map(e => e.midi);
  assert.deepEqual(bySrcn, up);
});

test("SPC700 core: arithmetic and control-flow spot checks against known results", () => {
  const ram = new Uint8Array(0x10000);
  const cpu = new SPC700({read: a => ram[a], write: (a, v) => { ram[a] = v; }});
  const run = (bytes, steps) => { ram.set(bytes, 0x200); cpu.pc = 0x200; for (let i = 0; i < steps; i++) cpu.step(); };
  run([0x8D, 0x03, 0xE8, 0x40, 0xCF], 3);                 // MOV Y,#3 / MOV A,#$40 / MUL YA
  assert.equal(cpu.a, 0xC0); assert.equal(cpu.y, 0);
  run([0x8D, 0x01, 0xE8, 0x23, 0xCD, 0x07, 0x9E], 4);     // YA = 291, X = 7 / DIV YA,X
  assert.equal(cpu.a, 41); assert.equal(cpu.y, 4);
  run([0x60, 0xE8, 0x7F, 0x88, 0x01], 3);                 // CLRC / MOV A,#$7F / ADC A,#1
  assert.equal(cpu.a, 0x80); assert.equal(cpu.v, 1); assert.equal(cpu.h, 1);
  run([0xE8, 0x00, 0x8D, 0x05, 0xBC, 0xFE, 0xFD], 12);    // loop: INC A / DBNZ Y ×5
  assert.equal(cpu.a, 5);
  ram[0x40] = 0x04; ram[0x30] = 0xAB;
  run([0x09, 0x30, 0x40], 1);                             // OR dp,dp (src first)
  assert.equal(ram[0x40], 0xAF);
  run([0xE8, 0x5A, 0x40, 0xC4, 0x05, 0x20], 4);           // SETP: MOV $05,A -> $0105
  assert.equal(ram[0x105], 0x5A);
  for (let op = 0; op < 256; op++) {                      // every opcode dispatches
    const r2 = new Uint8Array(0x10000); r2[0x200] = op;
    const c2 = new SPC700({read: a => r2[a], write: (a, v) => { r2[a] = v; }});
    c2.pc = 0x200; c2.step();
  }
});

test("envelope model: KOFF releases in 8 ms, ADSR decays to the sustain level, one-shot END silences", () => {
  const ram = new Uint8Array(0x10000), regs = new Uint8Array(128);
  // directory at $0200: sample 0 = a looping silence block at $0300 (END+LOOP back to itself)
  regs[0x5D] = 0x02; ram[0x200] = 0x00; ram[0x201] = 0x03; ram[0x202] = 0x00; ram[0x203] = 0x03; ram[0x300] = 0x03;
  regs[0x02] = 0x00; regs[0x03] = 0x10;                                       // PITCH $1000
  regs[0x05] = 0x8F; regs[0x06] = 0x60;                                        // ADSR: AR 15, DR 0, SL 3, SR 0
  const dsp = new DspVoices(ram, regs);
  dsp.write(0x4C, 0x01);
  for (let i = 0; i < 4; i++) dsp.tick();
  assert.equal(dsp.voices[0].env, 0x7FF, "AR 15 reaches full scale in 2 samples");
  while (dsp.voices[0].stage !== 3 && dsp.sample < 20000) dsp.tick();
  assert.equal(dsp.voices[0].env >> 8, 3, "decay stops at SL");
  regs[0x5C] = 0x01;
  const t0 = dsp.sample;
  while (dsp.voices[0].stage !== OFF && dsp.sample < t0 + 1000) dsp.tick();
  assert.ok(dsp.sample - t0 <= 256, "release: -8/sample from ≤ $7FF is ≤ 256 samples");
  // one-shot END: point sample 0 at a block with END only — 16 samples at $1000 then silence, ENDX set
  regs[0x5C] = 0; ram[0x300] = 0x01;
  dsp.write(0x4C, 0x01);
  for (let i = 0; i < 20; i++) dsp.tick();
  assert.equal(dsp.voices[0].stage, OFF);
  assert.equal(regs[0x7C] & 1, 1, "ENDX bit set");
  assert.equal(RATE_PERIOD[31], 1); assert.equal(RATE_PERIOD[1], 2048);
});

// ---- regressions from the real rips (Zophar SPC sets, 2026-09-27) ---------
// Each reproduces a bug the FF4/FF5/FF6/Chrono Trigger/ALttP dumps exposed,
// on synthetic bytes — no rip data.

test("root estimation: a long multi-period loop names the cycle, not the loop grid", () => {
  const ram = new Uint8Array(0x10000);
  // 100 cycles of a 40-sample wave (800 Hz) in one 4000-sample loop, with a
  // slow amplitude swell across the loop as real string samples have. The
  // old picker capped k at 64, so the shortest period it could return was
  // L/64 = 62.5 -> it chose 80 (an octave low) at "high" confidence.
  const long = new Int16Array(4000);
  for (let i = 0; i < 4000; i++) {
    const ph = 2 * Math.PI * i / 40;
    long[i] = Math.round((1 + 0.3 * Math.sin(2 * Math.PI * i / 4000)) * 7000 * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)));
  }
  ram.set(encodeBRR(long, {loopStart: 0}), 0x1000);
  const a = estimateRoot(decodeBRR(ram, 0x1000, 0x1000));
  assert.ok(Math.abs(a.rootHz - 800) < 8, "long loop root " + a.rootHz + " Hz (expected 800)");
  assert.equal(a.confidence, "high");
  // a loop cut as two identical halves (3600 = 2 x 1800, 120 cycles of 30):
  // the tiled loop correlates perfectly at L/2, and the old "tallest peak"
  // rule took that lag's grid instead of the fundamental
  const halves = new Int16Array(3600);
  for (let i = 0; i < 3600; i++) { const ph = 2 * Math.PI * i / 30; halves[i] = Math.round(8000 * (Math.sin(ph) + 0.4 * Math.sin(2 * ph))); }
  ram.set(encodeBRR(halves, {loopStart: 0}), 0x3000);
  const b = estimateRoot(decodeBRR(ram, 0x3000, 0x3000));
  assert.ok(Math.abs(b.rootHz - 32000 / 30) < 10, "two-halves loop root " + b.rootHz + " Hz (expected 1066.7)");
  // a loop that is NOT a whole number of cycles (4480 samples of a 25-sample
  // wave = 179.2 cycles, Terra's lead sample): the estimate must stay on the
  // NSDF peak, not snap to a nearby L/k grid point (that bias read a semitone sharp)
  const seam = new Int16Array(4480);
  for (let i = 0; i < 4480; i++) { const ph = 2 * Math.PI * i / 25; seam[i] = Math.round(8000 * (Math.sin(ph) + 0.3 * Math.sin(3 * ph))); }
  ram.set(encodeBRR(seam, {loopStart: 0}), 0x5000);
  const c = estimateRoot(decodeBRR(ram, 0x5000, 0x5000));
  assert.ok(Math.abs(c.periodSamples - 25) < 0.15, "seamed loop period " + c.periodSamples + " (expected 25)");
  // the short single-cycle cases still resolve to the loop length itself
  const sq = Int16Array.from({length: 16}, (_, i) => i < 8 ? 8000 : -8000);
  ram.set(encodeBRR(sq, {loopStart: 0}), 0x7000);
  assert.ok(Math.abs(estimateRoot(decodeBRR(ram, 0x7000, 0x7000)).rootHz - 2000) < 1);
});

test("dumped KON register is a pending key-on; dumped ENVX alone is not a note", () => {
  // Every real set is dumped at the song's first KON write: the register
  // file holds KON bits with ENVX still 0. SPC players (blargg's
  // SPC_DSP::load) key those voices on at start and zero every envelope;
  // we used to do the reverse, so single-KON tracks never sounded.
  const out = makeTestSPC();
  out[0x100 + 0x200] = 0x2F; out[0x100 + 0x201] = 0xFE;   // driver = BRA -2: never touches the DSP
  const r = 0x10100, pitch = Math.round(4096 * 440 * 2 ** ((60 - 69) / 12) / TEST_ROOT_HZ); // C4 on the 500 Hz sine
  out[r + 0x6C] = 0x20; out[r + 0x0C] = 0x7F; out[r + 0x1C] = 0x7F; out[r + 0x5D] = 0x03; // FLG, MVOL, DIR page 3
  for (const v of [0, 1, 2]) {
    out[r + v * 16 + 0] = 0x7F; out[r + v * 16 + 1] = 0x7F; out[r + v * 16 + 2] = pitch & 0xFF; out[r + v * 16 + 3] = pitch >> 8;
    out[r + v * 16 + 4] = 0x00; out[r + v * 16 + 5] = 0xFF; out[r + v * 16 + 6] = 0xE0;
  }
  out[r + 0x4C] = 0x05;      // KON: voices 0 and 2 pending
  out[r + 0x5C] = 0x04;      // KOFF: voice 2 is being released — KOFF wins, as on the chip
  out[r + 0x18] = 0x40;      // voice 1: ENVX says "sounding", but no KON bit
  const spc = parseSPC(out.buffer);
  const cap = runSPC(spc, 1);
  assert.deepEqual(cap.dspLog.filter(w => w.addr === 0x4C).map(w => [w.sample, w.value]), [[0, 0x01]], "one KON, at sample 0, voice 0 only");
  assert.equal(cap.instruments.size, 1);
  const ev = reconstruct(cap).events;
  assert.equal(ev.length, 1, "exactly one note: " + JSON.stringify(ev.map(e => [e.channel, e.startFrame, e.endFrame])));
  assert.equal(ev[0].channel, "voice0");
  assert.equal(ev[0].startFrame, 0);
  assert.equal(pitchName(ev[0].midi), "C4");
  assert.equal(ev[0].endFrame, Math.round(1 / TICK_SEC), "held to the end (ADSR SR = 0)");
});

test("ID666 text format: the emulator byte is an ASCII digit; xid6 supplies the untruncated game name", () => {
  // Header text as the ALttP set carries it (32-byte game field cuts the name)
  const out = makeTestSPC();
  const put = (off, s) => { for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i); };
  out.fill(0, 0x2E, 0xD3);
  put(0x2E, "Hyrule Field Main Theme"); put(0x4E, "Legend of Zelda: A Link to the P"); put(0x6E, "Datschge");
  put(0x7E, "Overworld"); put(0xA9, "77"); put(0xAC, "7000"); put(0xB1, "Koji Kondo"); put(0xD2, "0");
  const plain = parseSPC(out.buffer);
  assert.equal(plain.tags.textFormat, true);
  assert.equal(plain.tags.seconds, 77); assert.equal(plain.tags.fadeMs, 7000);
  assert.equal(plain.tags.emulator, 0, "'0' means unknown, not 48");
  assert.equal(plain.game, "Legend of Zelda: A Link to the P");
  // the set's real xid6 block (tag text only): game name, year, publisher, intro + fade ticks
  const hex = "786964364c000000020124004c6567656e64206f66205a656c64613a2041204c696e6b20746f207468652050617374001400c707130109004e696e74656e646f000000003004040000324b003304040000d60600";
  const xid6 = Uint8Array.from(hex.match(/../g).map(h => parseInt(h, 16)));
  const withExt = new Uint8Array(out.length + xid6.length); withExt.set(out); withExt.set(xid6, out.length);
  const spc = parseSPC(withExt.buffer);
  assert.equal(spc.game, "Legend of Zelda: A Link to the Past");
  assert.deepEqual(spc.ext, {game: "Legend of Zelda: A Link to the Past", year: 1991, publisher: "Nintendo",
    introTicks: 4928000, fadeTicks: 448000, introSec: 77, fadeSec: 7});
  // FF4 "07a Main Theme": OST title/disc/track (track packs number << 8 | suffix char)
  const ff4 = "78696436600000001001330046696e616c2046616e746173792034204f726967696e616c20536f756e642056657273696f6e20285053434e2d3530313429000011000100120000071400c70713010700537175617265000030040400006496003304040000dc0500";
  const e = parseXid6(Uint8Array.from(ff4.match(/../g).map(h => parseInt(h, 16))));
  assert.equal(e.ostTitle, "Final Fantasy 4 Original Sound Version (PSCN-5014)");
  assert.equal(e.ostDisc, 1); assert.equal(e.ostTrack, 7); assert.equal(e.ostTrackChar, "");
  assert.equal(e.year, 1991); assert.equal(e.publisher, "Square");
  assert.equal(e.introSec, 154); assert.equal(e.fadeSec, 6);
  assert.deepEqual(parseXid6(null), {});
  assert.deepEqual(parseXid6(new Uint8Array(8)), {}, "no magic -> nothing");
});

test("set file names: <disc><track><part> Title.spc, all-nines = not on the soundtrack", () => {
  assert.deepEqual(parseTrackName("07a Main Theme.spc"), {disc: null, track: 7, part: "a", unlisted: false, title: "Main Theme"});
  assert.deepEqual(parseTrackName("314c Dancing Mad (part 3).spc"), {disc: 3, track: 14, part: "c", unlisted: false, title: "Dancing Mad (part 3)"});
  assert.deepEqual(parseTrackName("101 Ahead on our Way.spc"), {disc: 1, track: 1, part: "", unlisted: false, title: "Ahead on our Way"});
  assert.deepEqual(parseTrackName("999 Time Vortex.spc"), {disc: null, track: 99, part: "", unlisted: true, title: "Time Vortex"});
  assert.deepEqual(parseTrackName("99 Unused Sound.spc"), {disc: null, track: 99, part: "", unlisted: true, title: "Unused Sound"});
  assert.equal(parseTrackName("/sets/zelda/05b Majestic Castle (Storm).spc").part, "b");
  assert.equal(parseTrackName("random.spc"), null);
});

// ---- NON-voice classification (percussive kit hit vs sustained noise
// texture) — a hand-built capture, not a run SPC: reconstruct() is a pure
// function of {dspLog, dsp0, samples, instruments, ram}, and the driver
// bytecode needed to make a real CPU-emulated capture toggle NON/KON/KOFF on
// a schedule would test the SPC700 core, not the classifier. One voice's
// writes: VOLL + ADSR1 bit7 once (so settle()'s zero-volume auto-close never
// fires), NON + FLG(clock) once, then a KON/KOFF pair per hit (KOFF cleared
// one sample later so a later KON's envelope doesn't see a stale release bit
// — real drivers pulse it the same way).
function noiseVoiceCapture(voice, clock, hits) {
  const dspLog = [
    {sample: 0, addr: voice * 16 + 0, value: 100},
    {sample: 0, addr: voice * 16 + 5, value: 0x80},
    {sample: 0, addr: 0x3D, value: 1 << voice},
    {sample: 0, addr: 0x6C, value: clock & 0x1F},
  ];
  let last = 0;
  for (const h of hits) {
    const onset = Math.round(h.start * SAMPLE_RATE), end = Math.round((h.start + h.dur) * SAMPLE_RATE);
    dspLog.push({sample: onset, addr: 0x4C, value: 1 << voice});
    dspLog.push({sample: end, addr: 0x5C, value: 1 << voice});
    dspLog.push({sample: end + 1, addr: 0x5C, value: 0});
    last = Math.max(last, end + 1);
  }
  dspLog.sort((a, b) => a.sample - b.sample);
  return {dspLog, dsp0: new Uint8Array(128), samples: last + SAMPLE_RATE, instruments: new Map(), ram: new Uint8Array(0x10000)};
}

test("NON voice classification: sparse multi-second notes are not a drum", () => {
  // FF4 "Main Theme (Ocean)" voice 6, shrunk: 8 hits (meets DRUM_MIN_HITS on
  // its own, so duration — not count — is what has to disqualify it), each
  // well over DRUM_MAX_MEDIAN_DUR_SEC.
  const hits = Array.from({length: DRUM_MIN_HITS}, (_, i) => ({start: i * 5, dur: 4.0}));
  const cap = noiseVoiceCapture(6, 20, hits);
  const r = reconstruct(cap);
  const evs = r.events.filter(e => e.voice === 6);
  assert.equal(evs.length, DRUM_MIN_HITS);
  assert.ok(evs.every(e => e.drum === undefined), "a sustained noise voice is not flagged as a GM drum");
  assert.ok(evs.every(e => e.channel === "voice6"), "stays its own voice track, never folded into a merged drum track");
  assert.ok(evs.every(e => e.midi != null), "still carries a pitch (the noise clock, same as the drum path used)");
});

test("NON voice classification: dense short hits are a drum", () => {
  const hits = Array.from({length: 16}, (_, i) => ({start: i * 0.25, dur: 0.1}));
  const cap = noiseVoiceCapture(0, 10, hits);
  const r = reconstruct(cap);
  const evs = r.events.filter(e => e.voice === 0);
  assert.equal(evs.length, 16);
  assert.ok(evs.every(e => e.drum !== undefined), "a busy, short-hit noise voice stays a GM drum");
  assert.ok(evs.every(e => e.noiseClock === 10));
});

test("NON voice classification: too few hits to call a kit, even if short", () => {
  const hits = Array.from({length: 3}, (_, i) => ({start: i * 0.3, dur: 0.1}));
  const cap = noiseVoiceCapture(2, 15, hits);
  const r = reconstruct(cap);
  const evs = r.events.filter(e => e.voice === 2);
  assert.equal(evs.length, 3);
  assert.ok(evs.every(e => e.drum === undefined), "below DRUM_MIN_HITS — not enough evidence to call it a kit");
});

// ---- SNES capture v2 (NIGHT-ROLL.md "SNES capture v2"): what the DSP did to
// a note while it sounded — loudness (VOL × the envelope) as its shape, L/R as
// pan, SRCN as the program, small PITCH moves as bend, EON × EVOL as the
// reverb send. Hand-built logs as above: [seconds, register, value] in order.
const atS = s => Math.round(s * SAMPLE_RATE);
function dspCapture(writes, secs) {
  const dspLog = writes.map(([s, addr, value], i) => ({sample: atS(s), addr, value, i}))
    .sort((a, b) => a.sample - b.sample || a.i - b.i).map(({sample, addr, value}) => ({sample, addr, value}));
  return {dspLog, dsp0: new Uint8Array(128), samples: atS(secs), instruments: new Map(), ram: new Uint8Array(0x10000)};
}
// a voice's registers: VOL L/R, PITCH, SRCN, ADSR (default AR 15, SL 7, SR 0:
// full level held — no envelope movement unless a test asks for one), GAIN
const voiceRegs = (v, s, {l = 100, r = 100, pitch = 0x1000, srcn = 0, adsr1 = 0x8F, adsr2 = 0xE0, gain = 0} = {}) =>
  [[s, v * 16, l & 255], [s, v * 16 + 1, r & 255], [s, v * 16 + 2, pitch & 0xFF], [s, v * 16 + 3, pitch >> 8], [s, v * 16 + 4, srcn], [s, v * 16 + 5, adsr1], [s, v * 16 + 6, adsr2], [s, v * 16 + 7, gain]];
const kon = (v, s) => [[s, 0x4C, 1 << v]];
const koff = (v, s) => [[s, 0x5C, 1 << v], [s + 0.001, 0x5C, 0]];
const appEvents = cap => spcRebin(reconstruct(cap).events, 5); // what CHIPS.spc.run hands captureChipTrack
const midiOf = ev => makeMidi(ev, {bpm: 120, frameSec: TICK_SEC * 5, snap: true, volMax: 127, shape: SPC_SHAPE});
const stripV2 = ev => ev.map(e => { const o = {...e}; for (const k of ["volSeries", "bendSeries", "panSeries", "echoSeries", "srcn"]) delete o[k]; return o; }); // what v1 handed makeMidi
async function publishHop(bytes) { // the app's parser, then its writer and parser again (what a publish re-encodes)
  const app = await createApp();
  app.context._b = [...bytes];
  return JSON.parse(app.run(`JSON.stringify((() => {
    const a = parseMidi(new Uint8Array(_b).buffer, {trust: true});
    const b = parseMidi(writeMidi({ppq: a.ppq, timesig: a.timesig, tempos: a.tempos, tracks: a.tracks.map(t => ({...t}))}).buffer, {trust: true});
    return {a, b};
  })())`));
}
const ctlOf = (tr, c) => (tr.ctl || []).filter(e => e.c === c);
const noteRows = song => song.tracks.map(t => [t.name, t.notes.map(n => [n.t, n.d, n.p, n.v])]);

test("SNES capture v2: the DSP's own envelope × VOL becomes the note's shape — an ADSR decay, a VOL fade — read from the registers, no per-game table", async () => {
  const cap = dspCapture([
    ...voiceRegs(0, 0, {adsr1: 0xAF, adsr2: 0x4A}), ...kon(0, 0.01), ...koff(0, 1.0),       // AR 15, DR 2 to SL 2, then SR 10: an exponential fall
    ...voiceRegs(1, 0, {adsr1: 0x00, gain: 0x7F}), ...kon(1, 0.01), [0.5, 0x10, 50], [0.5, 0x11, 50], ...koff(1, 1.0), // direct GAIN, VOL halved mid-note
    ...voiceRegs(2, 0), ...kon(2, 0.01), ...koff(2, 1.0)], 1.2);                           // held flat: no shape
  const {a, b} = await publishHop(midiOf(appEvents(cap)));
  const tr = name => b.tracks.find(t => t.name === name);
  const decay = tr("voice0").notes[0];
  assert.ok(decay.env && decay.env.length >= 2 && decay.env.length <= 16, "a decay thinned to its corners: " + JSON.stringify(decay.env));
  assert.ok(decay.env.every((q, k) => k === 0 || q.r <= decay.env[k - 1].r + 1e-9), "never rises");
  assert.ok(decay.env[decay.env.length - 1].r < 0.4, "falls well below the attack: " + decay.env[decay.env.length - 1].r);
  const fade = tr("voice1").notes[0];
  assert.equal(fade.env.length, 2, "a step is two corners — held to the frame before, then the new level (a glide between points would smear it): " + JSON.stringify(fade.env));
  assert.ok(Math.abs(fade.env[0].r - 1) < 0.01 && Math.abs(fade.env[1].r - 0.5) < 0.03 && Math.abs(fade.env[1].t - 470) <= 12, "half level at the write (0.5 s ≈ tick 470): " + JSON.stringify(fade.env));
  assert.equal(tr("voice2").notes[0].env, undefined, "a flat note has no shape");
  assert.deepEqual(noteRows(b), noteRows(a), "the shapes survive the publish hop unchanged in notes");
  assert.deepEqual(b.tracks.map(t => t.notes.map(n => n.env)), a.tracks.map(t => t.notes.map(n => n.env)), "and in the shapes");
});

test("SNES capture v2: VOL L vs R is a CC10 pan timeline — only moves, a still voice keeps one pan (midiPan), centre writes none", async () => {
  const cap = dspCapture([
    ...voiceRegs(0, 0, {l: 100, r: 20}), ...kon(0, 0.01), [0.5, 0x00, 20], [0.5, 0x01, 100], ...koff(0, 1.0),
    [0.6, 0x00, 22], ...kon(0, 1.1), ...koff(0, 1.4),                                         // a rounding wobble (pan 104 vs 106): no event
    ...voiceRegs(1, 0, {l: 100, r: 0}), ...kon(1, 0.01), ...koff(1, 1.0),                      // hard left, still
    ...voiceRegs(2, 0), ...kon(2, 0.01), ...koff(2, 1.0)], 1.6);                               // centre
  const ev = appEvents(cap);
  assert.deepEqual(ev.filter(e => e.voice === 0)[0].panSeries.map(p => p[1]), [22, 106]);
  const {a, b} = await publishHop(midiOf(ev));
  const tr = name => b.tracks.find(t => t.name === name);
  assert.deepEqual(ctlOf(tr("voice0"), 10).map(e => e.v), [22, 106], "start pan, then the move; the second note's wobble under PAN_STEP (" + PAN_STEP + ") adds nothing");
  assert.ok(ctlOf(tr("voice0"), 10)[1].t > 400 && ctlOf(tr("voice0"), 10)[1].t < 480, "the move lands inside the note");
  assert.equal(tr("voice1").midiPan, -1, "one CC10 is the track's pan");
  assert.equal(ctlOf(tr("voice1"), 10).length, 0);
  assert.equal(tr("voice2").midiPan, undefined, "centre: nothing written");
  assert.deepEqual(b.tracks.map(t => [t.midiPan, ctlOf(t, 10)]), a.tracks.map(t => [t.midiPan, ctlOf(t, 10)]), "the publish hop keeps them");
});

test("SNES capture v2: SRCN is the note's program — at tick 0, then only where a voice changes sample; a noise kit gets none", async () => {
  const cap = dspCapture([
    ...voiceRegs(0, 0, {srcn: 3}), ...kon(0, 0.01), ...koff(0, 0.4),
    [0.45, 0x04, 5], ...kon(0, 0.5), ...koff(0, 0.9),
    ...kon(0, 1.0), ...koff(0, 1.4),
    ...voiceRegs(1, 0, {srcn: 7}), ...kon(1, 0.01), ...koff(1, 0.4), ...kon(1, 0.5), ...koff(1, 0.9)], 1.6);
  const {b} = await publishHop(midiOf(appEvents(cap)));
  const tr = name => b.tracks.find(t => t.name === name);
  const pg0 = ctlOf(tr("voice0"), "pg");
  assert.deepEqual(pg0.map(e => e.v), [3, 5]);
  assert.equal(pg0[0].t, 0);
  assert.equal(pg0[1].t, tr("voice0").notes[1].t, "the change sits on the note that changed sample");
  assert.deepEqual(ctlOf(tr("voice1"), "pg").map(e => [e.t, e.v]), [[0, 7]], "one sample: one program, first");
  const kit = await publishHop(midiOf(appEvents(noiseVoiceCapture(0, 10, Array.from({length: 16}, (_, i) => ({start: i * 0.25, dur: 0.1}))))));
  assert.equal(kit.b.tracks.length, 1);
  assert.equal(ctlOf(kit.b.tracks[0], "pg").length, 0, "the noise generator is no sample: no program");
});

test("SNES capture v2: a PITCH wobble under the 70-cent guard is pitch bend inside the one note; a move past it is still a NEW note", async () => {
  const up30 = Math.round(0x1000 * 2 ** (30 / 1200)), up100 = Math.round(0x1000 * 2 ** (100 / 1200));
  const cap = dspCapture([
    ...voiceRegs(0, 0), ...kon(0, 0.01),
    [0.3, 0x02, up30 & 0xFF], [0.3, 0x03, up30 >> 8],
    [0.5, 0x02, 0x00], [0.5, 0x03, 0x10],
    [0.7, 0x02, up100 & 0xFF], [0.7, 0x03, up100 >> 8], ...koff(0, 1.0)], 1.2);
  const ev = appEvents(cap);
  assert.deepEqual(ev.map(e => e.midi), [72, 73], "the step to a new pitch splits the note, as v1 did");
  assert.deepEqual(ev[0].bendSeries.map(p => p[1]), [0, 30, 0]);
  const {a, b} = await publishHop(midiOf(ev));
  const v0 = b.tracks[0];
  assert.deepEqual(v0.notes.map(n => n.p), [72, 73]);
  const pb = ctlOf(v0, "pb");
  assert.deepEqual(pb.map(e => e.v), [Math.round(30 / 200 * 8192), 0], "+30 cents on the default ±2 range, then back to centre");
  assert.ok(pb[0].t > v0.notes[0].t && pb[1].t < v0.notes[1].t, "inside the first note");
  assert.equal(ctlOf(v0, 101).length, 0, "no RPN: the default ±2 holds every SNES bend (the guard keeps them under 70 cents)");
  assert.deepEqual(ctlOf(b.tracks[0], "pb"), ctlOf(a.tracks[0], "pb"), "the publish hop keeps them");
});

test("SNES capture v2: the echo send (EON bit × the louder EVOL side, 0 while FLG disables echo writes) is a CC91 timeline per track", async () => {
  const cap = dspCapture([
    [0, 0x2C, 40], [0, 0x3C, (-60) & 255], [0, 0x4D, 0x01],                                   // EVOL 40 / −60, echo on voice 0 only
    ...voiceRegs(0, 0), ...kon(0, 0.01), [0.5, 0x6C, 0x20], ...koff(0, 1.0),                  // echo writes disabled mid-note
    ...voiceRegs(1, 0), ...kon(1, 0.01), ...koff(1, 1.0)], 1.2);
  const ev = appEvents(cap);
  assert.deepEqual(ev.find(e => e.voice === 0).echoSeries.map(p => p[1]), [60, 0]);
  const {a, b} = await publishHop(midiOf(ev));
  const tr = name => b.tracks.find(t => t.name === name);
  assert.deepEqual(ctlOf(tr("voice0"), 91).map(e => e.v), [60, 0]);
  assert.equal(ctlOf(tr("voice0"), 91)[0].t, 0);
  assert.equal(ctlOf(tr("voice1"), 91).length, 0, "a voice outside EON sends nothing — nothing written");
  assert.deepEqual(ctlOf(tr("voice0"), 91), ctlOf(a.tracks.find(t => t.name === "voice0"), 91));
});

test("SNES capture v2 changes no note: every feature at once writes the same notes, tracks, tempo and meter as v1 (capture-diff: not MOVED)", async () => {
  const { readSmf, captureDiff } = await import("../tools/capture-diff.mjs");
  const up30 = Math.round(0x1000 * 2 ** (30 / 1200));
  const cap = dspCapture([
    [0, 0x2C, 40], [0, 0x3C, 40], [0, 0x4D, 0x03],
    ...voiceRegs(0, 0, {l: 100, r: 20, srcn: 3, adsr1: 0xAF, adsr2: 0x4A}), ...kon(0, 0.01),
    [0.3, 0x02, up30 & 0xFF], [0.3, 0x03, up30 >> 8], [0.5, 0x00, 20], [0.5, 0x01, 100], ...koff(0, 1.0),
    [1.05, 0x04, 4], ...kon(0, 1.1), ...koff(0, 1.4),
    ...voiceRegs(1, 0, {srcn: 9, adsr1: 0x00, gain: 0x7F}), ...kon(1, 0.01), [0.6, 0x10, 30], [0.6, 0x4D, 0x01], ...koff(1, 1.4)], 1.6);
  const ev = appEvents(cap);
  const v1 = midiOf(stripV2(ev)), v2 = midiOf(ev);
  const d = captureDiff(readSmf(v1), readSmf(v2));
  assert.equal(d.verdict, "VELOCITY", d.reasons.join("; "));
  for (const k of ["shape", "cc10", "cc91", "program", "bend"]) assert.ok(d.gained[k] > 0, "gained " + k + ": " + JSON.stringify(d.gained));
  const A = await publishHop(v1), B = await publishHop(v2);
  assert.deepEqual(noteRows(B.b), noteRows(A.b), "same notes after the publish hop");
  assert.deepEqual([B.b.tempos.map(t => t.usq), B.b.timesig], [A.b.tempos.map(t => t.usq), A.b.timesig]);
});

test("SNES capture v2 in the app's own capture (captureChipTrack on the synthetic SPC): v2 notes are v1's notes", async () => {
  const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const load = f => import(pathToFileURL(path.join(ROOT, "tools", f + ".mjs")).href);
  const parts = await Promise.all(["spc/spc", "spc/notes", "spc/apu-render"].map(load)), shared = await Promise.all(["nsf/notes", "nsf/midi-write"].map(load));
  const app = await createApp();
  const C = app.context;
  C.setTimeout = setTimeout; C.clearTimeout = clearTimeout;
  C.__M = Object.assign({}, ...parts, ...shared, {reconstruct: parts[1].reconstruct, toNotesTxt: parts[1].toNotesTxt}); // chipModules' merge: the chip's own reconstruct wins
  C.__spc = parseSPC(makeTestSPC().buffer);
  const run = async () => {
    const cap = await app.run("captureChipTrack('spc', __M, __spc, 1, 4, null)");
    C.__b = cap.bytes;
    return JSON.parse(app.run("JSON.stringify(parseMidi(__b.buffer, {trust: true}).tracks.map(t => ({name: t.name, notes: t.notes.map(n => [n.t, n.d, n.p, n.v]), ctl: t.ctl || []})))"));
  };
  const v2 = await run();
  C.__v1 = M => async (spc, n, seconds) => { // v1's adapter: the same rebin, no series, no shape options
    const cap = await M.runSPCAsync(spc, seconds);
    const r = M.reconstruct(cap, {});
    const events = r.events.map(e => { const a = Math.round(e.startFrame / 5); return {channel: e.channel, voice: e.voice, midi: Math.round(e.midi), vol: e.vol, volEnd: e.volEnd, drum: e.drum, startFrame: a, endFrame: Math.max(a + 1, Math.round(e.endFrame / 5))}; });
    return {apuLog: cap, frames: Math.round(r.frames / 5), frameSec: r.frameSec * 5, events};
  };
  C.__keep = app.run("[CHIPS.spc.run, CHIPS.spc.midiOpts]");
  app.run("CHIPS.spc.run = __v1; CHIPS.spc.midiOpts = () => ({volMax: 127})");
  let v1;
  try { v1 = await run(); } finally { app.run("CHIPS.spc.run = __keep[0]; CHIPS.spc.midiOpts = __keep[1]"); }
  assert.deepEqual(v2.map(t => [t.name, t.notes]), v1.map(t => [t.name, t.notes]));
  assert.deepEqual(v2[0].ctl.filter(e => e.c === "pg").map(e => e.v), [0], "SRCN 0 as the program");
  assert.equal(v1[0].ctl.length, 0);
});

// real rips: the archive's .spc files, cached outside the repo by
// tools/recapture.mjs (/tmp/recap/rips/snes/<album>/) or SNES_RIPS=<dir>
// holding <album>/<file>.spc. Guarded on the FILE: an empty cache dir skips.
const snesRip = rel => [process.env.SNES_RIPS && path.join(process.env.SNES_RIPS, rel), "/tmp/recap/rips/snes/" + rel]
  .find(p => p && existsSync(p) && statSync(p).isFile() && statSync(p).size >= 0x10100);
const FF4_MAIN = snesRip("final-fantasy-4/main-theme.spc");
test("SNES capture v2 (real rip): FF4 Main Theme — echo on its voices, ADSR shapes, programs; the notes exactly v1's after the publish hop",
     {skip: !FF4_MAIN && "final-fantasy-4/main-theme.spc not cached (tools/recapture.mjs --album snes/final-fantasy-4, or SNES_RIPS=<dir>)"}, async () => {
  const cap = runSPC(parseSPC(readFileSync(FF4_MAIN)), 30);
  const ev = appEvents(cap);
  const A = await publishHop(midiOf(stripV2(ev))), B = await publishHop(midiOf(ev));
  assert.deepEqual(noteRows(B.b), noteRows(A.b), "every note where v1 put it");
  const pitched = B.b.tracks.filter(t => !/drum/.test(t.name));
  assert.ok(pitched.filter(t => ctlOf(t, 91).some(e => e.v > 0)).length >= 4, "echo send on most voices");
  assert.ok(pitched.every(t => ctlOf(t, "pg").length >= 1), "every pitched voice names its sample");
  const shaped = pitched.reduce((s, t) => s + t.notes.filter(n => n.env).length, 0);
  assert.ok(shaped > 20, "ADSR shapes where v1 wrote no ve: " + shaped);
});

// ---- empty captures (docs/plans/2026-10-07-empty-captures.md §3): a low-confidence root that pushes
// notes off the MIDI range falls back to the default root, and the writer never drops a note silently
test("a low-confidence root that puts notes outside MIDI 0–127 falls back to the default root (72), re-pitching from PITCH, with a warning", () => {
  const inst = (id, conf, rootMidi) => ({id, key: id + "@0", srcn: 24 + id, root: {rootMidi, rootHz: 440 * 2 ** ((rootMidi - 69) / 12), confidence: conf, clarity: 0.7}});
  const giy = 69 + 12 * Math.log2(28.6 / 440); // EarthBound sample #24's estimate
  const low = inst(0, "low", giy), high = inst(1, "high", giy), fine = inst(2, "low", 60);
  const ev = (i, pitch) => { const exact = i.root.rootMidi + 12 * Math.log2(pitch / 4096); return {instrument: i.key, pitch, midi: Math.round(exact), cents: 0}; };
  const events = [ev(low, 993), ev(low, 937), ev(high, 993), ev(fine, 993)];
  assert.ok(events[0].midi < 0 && events[2].midi < 0, "the fixture starts below MIDI 0");
  const warnings = rootFallback([low, high, fine], events);
  assert.deepEqual(events.map(e => e.midi), [47, 46, events[2].midi, events[3].midi], "only the low-confidence, out-of-range instrument moves");
  assert.equal(events[0].cents, Math.round((72 + 12 * Math.log2(993 / 4096) - 47) * 100));
  assert.equal(low.root.rootMidi, 72); assert.equal(low.root.confidence, "none"); assert.ok(Math.abs(low.root.estimateHz - 28.6) < 0.1);
  assert.equal(high.root.rootMidi, giy, "a high-confidence root is a measurement: kept");
  assert.equal(fine.root.rootMidi, 60, "in range: kept");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /instrument 0 \(sample #24\): its root estimate \(28\.6 Hz, low\) put notes outside MIDI 0–127, so it uses the default root/);
});

test("makeMidi reports every note it cannot hold (pitch outside 0–127): into opts.warnings, else console.warn — never silently", () => {
  const events = [{channel: "voice2", startFrame: 0, endFrame: 100, midi: -3, vol: 100}, {channel: "voice3", startFrame: 0, endFrame: 100, midi: 60, vol: 100},
                  {channel: "voice3", startFrame: 100, endFrame: 200, midi: 130, vol: 100}];
  const warnings = [];
  makeMidi(events, {bpm: 120, frameSec: 0.01, volMax: 127, warnings});
  assert.deepEqual(warnings, ["2 notes dropped: pitch outside MIDI 0–127 (voice2 ×1, voice3 ×1)"]);
  const said = [], keep = console.warn; console.warn = m => said.push(m);
  try { makeMidi(events, {bpm: 120, frameSec: 0.01, volMax: 127}); } finally { console.warn = keep; }
  assert.equal(said.length, 1); assert.match(said[0], /2 notes dropped/);
  const quiet = []; makeMidi([events[1]], {bpm: 120, frameSec: 0.01, volMax: 127, warnings: quiet});
  assert.deepEqual(quiet, [], "nothing dropped, nothing said");
});

const GIYGAS = ["/tmp/recap/rips/snes/earthbound/giygas-static.spc"].find(f => existsSync(f));
test("EarthBound Giygas' Static (real SPC): its two held voices land in MIDI range, ~1 semitone apart, with the fallback named", {skip: !GIYGAS}, () => {
  const r = reconstruct(runSPC(parseSPC(new Uint8Array(readFileSync(GIYGAS))), 12), {});
  assert.deepEqual(r.events.map(e => e.voice).sort(), [2, 3]);
  for (const e of r.events) assert.ok(e.midi >= 0 && e.midi <= 127 && e.endFrame - e.startFrame > 5000, JSON.stringify([e.midi, e.startFrame, e.endFrame]));
  const [a, b] = [...r.events].sort((x, y) => x.voice - y.voice).map(e => e.midi + e.cents / 100);
  assert.ok(Math.abs(a - b - 12 * Math.log2(993 / 937)) < 0.02);
  assert.ok(r.warnings.some(w => /default root/.test(w)));
  const warnings = []; makeMidi(r.events, {bpm: 120, frameSec: r.frameSec, volMax: 127, shape: SPC_SHAPE, warnings});
  assert.deepEqual(warnings, [], "nothing dropped now");
});
