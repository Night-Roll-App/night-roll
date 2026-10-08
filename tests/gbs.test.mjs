// End-to-end test of the GBS pipeline against a synthetic, self-assembled
// GBS (no copyrighted data): SM83 emulation -> APU write log -> note
// reconstruction -> .notes.txt / MIDI emission -> APU render. Twin of
// tests/nsf.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { makeTestGBS, makeScriptGBS } from "../tools/gbs/make-test-gbs.mjs";
import { existsSync, readFileSync } from "node:fs";
import { readSmf, captureDiff } from "../tools/capture-diff.mjs";
import { parseGBS, runGBS } from "../tools/gbs/gbs.mjs";
import { SM83 } from "../tools/gbs/cpu-sm83.mjs";
import { reconstruct, toNotesTxt, pitchName, makeMidi, waveCycles, GB_CHANNELS, gbNoiseDrum, GB_SHAPE } from "../tools/gbs/notes.mjs";
import { renderApu } from "../tools/gbs/apu-render.mjs";

test("GBS pipeline: synthetic tune comes back note-perfect with channel identity", () => {
  const gbs = parseGBS(makeTestGBS().buffer);
  assert.equal(gbs.songs, 1);
  assert.equal(gbs.name, "Night Roll test tune");
  assert.equal(gbs.timerMode, false);
  assert.ok(Math.abs(gbs.playRateHz - 59.7275) < 0.001, "v-blank rate");

  const {apuLog, frames, frameSec} = runGBS(gbs, 1, 3); // 3 seconds ≈ 179 frames
  assert.ok(apuLog.length > 0, "APU writes were logged");
  assert.ok(apuLog.every(w => w.addr >= 0xFF10 && w.addr <= 0xFF3F), "only APU registers are logged");

  const events = reconstruct(apuLog, frames, frameSec);
  const pulse1 = events.filter(e => e.channel === "pulse1");
  assert.deepEqual(pulse1.map(e => pitchName(e.midi)), ["C4", "E4", "G4", "C5"]);
  assert.deepEqual(pulse1.map(e => e.duty), [2, 2, 2, 2], "50% duty rides on every note");
  assert.deepEqual(pulse1.map(e => e.vol), [15, 15, 15, 15]);

  const wave = events.filter(e => e.channel === "wave");
  assert.equal(wave.length, 1);
  assert.equal(pitchName(wave[0].midi), "C3");
  assert.equal(wave[0].waveCycles, 1, "one triangle cycle in wave RAM");
  assert.ok(wave[0].startFrame <= 1, "wave pedal starts at init");
  assert.equal(wave[0].endFrame, frames, "pedal holds to the end");

  // quarter notes at ~120bpm = 30 frames each
  for (const e of pulse1.slice(0, 3)) {
    const d = e.endFrame - e.startFrame;
    assert.ok(Math.abs(d - 30) <= 1, "note duration ≈ 30 frames, got " + d);
  }
  assert.deepEqual(pulse1.map(e => e.startFrame), [1, 31, 61, 91]);

  // noise: one hit per note, hardware envelope 15 -> 0 at pace 1 = 15 ticks
  // of 64 Hz = 0.234 s ≈ 14 frames; the reconstructor ends it at silence
  const noise = events.filter(e => e.channel === "noise");
  assert.equal(noise.length, 4);
  assert.deepEqual(noise.map(e => e.startFrame), [1, 31, 61, 91]);
  for (const e of noise) {
    assert.equal(e.midi, 4, "noise index = clock shift");
    assert.equal(e.lfsr7, 0);
    assert.equal(e.vol, 15);
    assert.equal(e.volEnd, 1, "envelope decayed to its last audible step");
    const d = e.endFrame - e.startFrame;
    assert.ok(d >= 13 && d <= 15, "envelope-to-zero ends the hit at ≈14 frames, got " + d);
  }

  const txt = toNotesTxt(events, {frames, frameSec, bpm: 120, title: "test"});
  assert.match(txt, /## channel pulse1/);
  assert.match(txt, /## channel wave/);
  assert.match(txt, /## channel noise/);
  assert.match(txt, /from GBS capture/);
  assert.match(txt, /C4 1 v15/);
  assert.match(txt, /no key is stated/);

  // MIDI: the wave channel gets its own named track; noise lands on channel 10
  const bytes = makeMidi(events, {bpm: 120, frameSec});
  const s = String.fromCharCode(...bytes);
  assert.ok(s.includes("wave"), "wave track named");
  assert.ok(s.includes("pulse1"), "pulse1 track named");
  let drumOn = false;
  for (let i = 0; i + 2 < bytes.length; i++) if (bytes[i] === 0x99 && bytes[i + 1] === 38) drumOn = true; // shift 4 -> snare
  assert.ok(drumOn, "noise hits are drum notes on channel 10");
});

test("GBS header: timer-mode play rate follows TAC/TMA, double speed doubles it", () => {
  const h = new Uint8Array(0x70 + 1);
  h[0] = 0x47; h[1] = 0x42; h[2] = 0x53; h[3] = 1; h[4] = 3; h[5] = 2;
  h[0x06] = 0x00; h[0x07] = 0x40; // load $4000
  h[0x0E] = 0xC0; h[0x0F] = 0x04 | 0x03; // timer, 16384 Hz / (256 - 192) = 256 Hz
  let g = parseGBS(h.buffer);
  assert.equal(g.timerMode, true);
  assert.equal(g.playRateHz, 256);
  assert.equal(g.startSong, 2);
  h[0x0F] |= 0x80; // CGB double speed
  g = parseGBS(h.buffer);
  assert.equal(g.playRateHz, 512);
  h[0x0F] = 0x00; // v-blank
  g = parseGBS(h.buffer);
  assert.ok(Math.abs(g.playRateHz - 4194304 / 70224) < 1e-9);
  assert.throws(() => parseGBS(new Uint8Array(0x80).buffer), /not a GBS/);
});

// ---- SM83 core: flag rules and the Game-Boy-specific opcodes -------------
function cpuWith(bytes, at = 0x100) {
  const mem = new Uint8Array(0x10000);
  mem.set(bytes, at);
  const cpu = new SM83({read: a => mem[a], write: (a, v) => { mem[a] = v; }});
  cpu.pc = at;
  return {cpu, mem, run: n => { for (let i = 0; i < n; i++) cpu.step(); }};
}

test("SM83: DAA after BCD add, and the Z/C outcome of $99 + $01", () => {
  let {cpu, run} = cpuWith([0x3E, 0x45, 0xC6, 0x38, 0x27]); // LD A,$45 / ADD A,$38 / DAA
  run(3);
  assert.equal(cpu.a, 0x83);
  assert.equal(cpu.cf, 0);
  ({cpu, run} = cpuWith([0x3E, 0x99, 0xC6, 0x01, 0x27]));
  run(3);
  assert.equal(cpu.a, 0x00);
  assert.ok(cpu.zf, "Z set");
  assert.equal(cpu.cf, 1, "C set by the $60 adjust");
});

test("SM83: ADD SP,e and LD HL,SP+e take flags from the low-byte add, Z clear", () => {
  const {cpu, run} = cpuWith([0x31, 0xF8, 0xFF, 0xE8, 0xFE, 0xF8, 0x02]); // LD SP,$FFF8 / ADD SP,-2 / LD HL,SP+2
  run(2);
  assert.equal(cpu.sp, 0xFFF6);
  assert.equal(cpu.f, 0x30, "H and C from $F8 + $FE, Z and N clear");
  run(1);
  assert.equal(cpu.hl, 0xFFF8);
  assert.equal(cpu.f, 0x00, "$F6 + $02: no half carry (6+2), no carry");
});

test("SM83: CB page — SWAP, BIT, RES, SET, and (HL) operands", () => {
  const {cpu, mem, run} = cpuWith([
    0x3E, 0xF0, 0xCB, 0x37,       // LD A,$F0 / SWAP A -> $0F
    0xCB, 0x7F,                   // BIT 7,A -> Z=1 (bit clear), H=1
    0xCB, 0x47,                   // BIT 0,A -> Z=0
    0x21, 0x00, 0xC0, 0x36, 0x00, // LD HL,$C000 / LD (HL),0
    0xCB, 0xDE,                   // SET 3,(HL) -> $08
    0xCB, 0x9E,                   // RES 3,(HL) -> $00
    0x3E, 0x81, 0x07,             // LD A,$81 / RLCA -> $03, C=1, Z=0
    0xAF, 0x07,                   // XOR A / RLCA -> Z stays CLEAR on the accumulator rotates
  ]);
  run(2); assert.equal(cpu.a, 0x0F); assert.ok(!cpu.zf);
  run(1); assert.ok(cpu.zf); assert.equal(cpu.f & 0x20, 0x20);
  run(1); assert.ok(!cpu.zf);
  run(3); assert.equal(mem[0xC000], 0x08);
  run(1); assert.equal(mem[0xC000], 0x00);
  run(2); assert.equal(cpu.a, 0x03); assert.equal(cpu.cf, 1); assert.ok(!cpu.zf);
  run(2); assert.equal(cpu.a, 0x00); assert.ok(!cpu.zf, "RLCA never sets Z");
});

test("SM83: JR loop, INC/DEC keep carry, ADD HL half-carry from bit 11, SUB borrow", () => {
  const {cpu, run} = cpuWith([
    0x37,                   // SCF (C=1)
    0x06, 0x03,             // LD B,3
    0x05, 0x20, 0xFD,       // loop: DEC B / JR NZ,loop (-3)
    0x21, 0xFF, 0x0F, 0x11, 0x01, 0x00, 0x19, // LD HL,$0FFF / LD DE,1 / ADD HL,DE
    0x3E, 0x10, 0xD6, 0x20, // LD A,$10 / SUB $20
  ]);
  run(2 + 6); // SCF, LD B, then 3x(DEC, JR)
  assert.equal(cpu.b, 0);
  assert.ok(cpu.zf);
  assert.equal(cpu.cf, 1, "DEC leaves C");
  assert.equal(cpu.pc, 0x106, "fell through after the third DEC");
  run(3);
  assert.equal(cpu.hl, 0x1000);
  assert.equal(cpu.f & 0x20, 0x20, "H from bit 11");
  assert.equal(cpu.cf, 0);
  assert.ok(cpu.zf, "ADD HL leaves Z");
  run(2);
  assert.equal(cpu.a, 0xF0);
  assert.equal(cpu.f, 0x50, "N and C (borrow), no H");
});

test("SM83: unconditional JR lands past its own operand, forward and back", () => {
  // Josh's FFL rip derailed here: `pc + rel()` read PC before the operand
  // fetch, so every JR e landed a byte short and the driver hit RST 38.
  const {cpu, run} = cpuWith([
    0x18, 0x03,             // $100: JR +3   -> $105 (skips the three bytes)
    0x3E, 0xFF, 0x00,       //      LD A,$FF / NOP  (jumped over)
    0x3C,                   // $105: INC A
    0x18, 0xFA,             // $106: JR -6   -> $102
  ]);
  run(1);
  assert.equal(cpu.pc, 0x105, "forward JR: target = address after the operand + e");
  run(1);
  assert.equal(cpu.a, 1, "landed on INC A, not on the skipped LD A,$FF");
  run(1);
  assert.equal(cpu.pc, 0x102, "backward JR from $106 with e=-6");
});

test("SM83: HL+/HL- loads, LDH ports, LD (C),A, PUSH/POP AF masks the low nibble", () => {
  const {cpu, mem, run} = cpuWith([
    0x21, 0x00, 0xC0, 0x3E, 0x11, 0x22, 0x3E, 0x22, 0x32, // LD HL,$C000 / LD A,$11 / LD (HL+),A / LD A,$22 / LD (HL-),A
    0x2A,                                                 // LD A,(HL+) -> $11, HL=$C001
    0xE0, 0x80,                                           // LDH ($80),A -> $FF80
    0x0E, 0x81, 0xE2,                                     // LD C,$81 / LD (C),A -> $FF81
    0xF0, 0x81,                                           // LDH A,($81)
    0x01, 0xFF, 0x12, 0xC5, 0xF1,                         // LD BC,$12FF / PUSH BC / POP AF
    0xF5, 0xD1,                                           // PUSH AF / POP DE
  ]);
  run(5);
  assert.equal(mem[0xC000], 0x11); assert.equal(mem[0xC001], 0x22); assert.equal(cpu.hl, 0xC000);
  run(1); assert.equal(cpu.a, 0x11); assert.equal(cpu.hl, 0xC001);
  run(1); assert.equal(mem[0xFF80], 0x11);
  run(2); assert.equal(mem[0xFF81], 0x11);
  run(1); assert.equal(cpu.a, 0x11);
  run(3); assert.equal(cpu.a, 0x12); assert.equal(cpu.f, 0xF0, "F low nibble reads 0");
  run(2); assert.equal(cpu.de, 0x12F0);
});

test("SM83: RST relocates to rstBase, EI takes effect one instruction late, HALT and illegals", () => {
  const {cpu, mem, run} = cpuWith([0xCF, 0x00, 0xFB, 0x00, 0x00, 0x76, 0xDD], 0x200); // RST $08 / NOP / EI / NOP / NOP / HALT / (illegal)
  cpu.sp = 0xFFFE;
  cpu.rstBase = 0x400;
  mem[0x408] = 0xC9; // RET at the relocated vector
  run(1);
  assert.equal(cpu.pc, 0x408);
  assert.equal(mem[0xFFFC] | (mem[0xFFFD] << 8), 0x201, "return address pushed");
  run(1); assert.equal(cpu.pc, 0x201); assert.equal(cpu.sp, 0xFFFE);
  run(2); assert.equal(cpu.ime, false, "not yet: EI is delayed");
  run(1); assert.equal(cpu.ime, true, "after the instruction following EI");
  run(2); assert.equal(cpu.halted, true);
  cpu.halted = false; cpu.pc = 0x206;
  assert.throws(() => cpu.step(), /illegal opcode \$dd/);
});

// ---- period → pitch through the real reconstruct() path -------------------
// Expected values from first principles (A440 equal temperament), never from
// the code under test — the same table the NSF test uses.
const FREQ4 = [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00,
               415.30, 440.00, 466.16, 493.88];
const freqOfMidi = m => FREQ4[m % 12] * 2 ** (Math.floor(m / 12) - 5);
function nearestMidi(f) {
  let best = 0, bestD = Infinity;
  for (let m = 0; m < 144; m++) {
    const d = Math.abs(Math.log2(f / freqOfMidi(m)));
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}
const FS = 1 / 59.7275;
// one isolated note per period value: trigger, hold 3 frames, DAC off, gap
function pulseLog(xs) {
  let frame = 0;
  const log = [{frame, addr: 0xFF26, value: 0x80}, {frame, addr: 0xFF25, value: 0xFF}];
  frame++;
  for (const x of xs) {
    log.push({frame, addr: 0xFF12, value: 0xF0});          // volume 15, no envelope
    log.push({frame, addr: 0xFF13, value: x & 0xFF});
    log.push({frame, addr: 0xFF14, value: 0x80 | (x >> 8)}); // trigger
    frame += 3;
    log.push({frame: frame++, addr: 0xFF12, value: 0x00}); // DAC off: silence
  }
  return {log, frames: frame + 1};
}
function waveLog(xs, ram = null) {
  let frame = 0;
  const log = [{frame, addr: 0xFF26, value: 0x80}, {frame, addr: 0xFF25, value: 0xFF}];
  const table = ram || [0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, 0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10];
  table.forEach((b, i) => log.push({frame, addr: 0xFF30 + i, value: b}));
  frame++;
  for (const x of xs) {
    log.push({frame, addr: 0xFF1A, value: 0x80});          // DAC on
    log.push({frame, addr: 0xFF1C, value: 0x20});          // level 100%
    log.push({frame, addr: 0xFF1D, value: x & 0xFF});
    log.push({frame, addr: 0xFF1E, value: 0x80 | (x >> 8)});
    frame += 3;
    log.push({frame: frame++, addr: 0xFF1A, value: 0x00}); // DAC off
  }
  return {log, frames: frame + 1};
}

test("period → pitch: canonical Pan Docs anchors derive from the same physics", () => {
  assert.equal(2048 - Math.round(131072 / 440), 1750);     // A4 on a pulse
  assert.equal(2048 - Math.round(65536 / 440), 1899);      // A4 on the wave channel
  assert.equal(Math.round(131072 / (2048 - 1750)), 440);
});

test("period → pitch: every pulse period value maps to the nearest tempered note", () => {
  const xs = [];
  for (let x = 0; x <= 2037; x++) xs.push(x);              // 64 Hz .. 11.9 kHz
  const {log, frames} = pulseLog(xs);
  const events = reconstruct(log, frames, FS);
  assert.equal(events.length, xs.length, "one note per period value");
  events.forEach((e, i) => {
    const f = 131072 / (2048 - xs[i]);
    assert.equal(e.midi, nearestMidi(f), `pulse x=${xs[i]} (${f.toFixed(2)} Hz)`);
  });
});

test("period → pitch: the wave channel sits an octave below the same period value", () => {
  const xs = [];
  for (let x = 0; x <= 2037; x++) xs.push(x);
  const {log, frames} = waveLog(xs);
  const events = reconstruct(log, frames, FS);
  assert.equal(events.length, xs.length, "one note per period value");
  events.forEach((e, i) => {
    const f = 65536 / (2048 - xs[i]);
    assert.equal(e.midi, nearestMidi(f), `wave x=${xs[i]} (${f.toFixed(2)} Hz)`);
  });
  // landmarks: x=1750 is A4 on a pulse, A3 on the wave
  assert.equal(pitchName(reconstruct(pulseLog([1750]).log, 10, FS)[0].midi), "A4");
  assert.equal(pitchName(reconstruct(waveLog([1750]).log, 10, FS)[0].midi), "A3");
});

test("wave RAM holding two or four cycles raises the reported pitch by octaves", () => {
  const one = [0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, 0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10];
  const two = [0x02, 0x46, 0x8A, 0xCE, 0xEC, 0xA8, 0x64, 0x20, 0x02, 0x46, 0x8A, 0xCE, 0xEC, 0xA8, 0x64, 0x20];
  const four = [0x04, 0x8C, 0xC8, 0x40, 0x04, 0x8C, 0xC8, 0x40, 0x04, 0x8C, 0xC8, 0x40, 0x04, 0x8C, 0xC8, 0x40];
  const nib = t => t.flatMap(b => [b >> 4, b & 15]);
  assert.equal(waveCycles(nib(one)), 1);
  assert.equal(waveCycles(nib(two)), 2);
  assert.equal(waveCycles(nib(four)), 4);
  assert.equal(waveCycles(new Array(32).fill(7)), 1, "a flat table is silence, not a high note");
  const x = 0x60B; // C3 for one cycle
  assert.equal(pitchName(reconstruct(waveLog([x], one).log, 10, FS)[0].midi), "C3");
  const e2 = reconstruct(waveLog([x], two).log, 10, FS)[0];
  assert.equal(pitchName(e2.midi), "C4");
  assert.equal(e2.waveCycles, 2);
  assert.equal(pitchName(reconstruct(waveLog([x], four).log, 10, FS)[0].midi), "C5");
});

test("note boundaries: retrigger, software fade, length timer, DAC off, unrouting", () => {
  const A4 = [0xFF13, 1750 & 0xFF, 0xFF14, 0x80 | (1750 >> 8)];
  const trig = (log, frame, vol) => {
    log.push({frame, addr: 0xFF12, value: vol << 4});
    log.push({frame, addr: A4[0], value: A4[1]});
    log.push({frame, addr: A4[2], value: A4[3]});
  };
  // repeated notes at the same pitch and volume: two events
  let log = [{frame: 0, addr: 0xFF26, value: 0x80}, {frame: 0, addr: 0xFF25, value: 0xFF}];
  trig(log, 1, 15); trig(log, 11, 15);
  let ev = reconstruct(log, 20, FS);
  assert.deepEqual(ev.map(e => [e.startFrame, e.endFrame]), [[1, 11], [11, 20]]);
  // a driver fading by rewriting NR12 + retrigger: one note, volEnd records the fade
  log = [{frame: 0, addr: 0xFF26, value: 0x80}, {frame: 0, addr: 0xFF25, value: 0xFF}];
  trig(log, 1, 15); trig(log, 4, 12); trig(log, 7, 9); trig(log, 10, 6);
  ev = reconstruct(log, 20, FS);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].vol, 15);
  assert.equal(ev[0].volEnd, 6);
  // length timer: 8 ticks of 256 Hz (31 ms ≈ 2 frames) with length enabled
  // ends the note by itself — nothing else is written for a whole second.
  // (A 1-tick note lives and dies inside one frame and is dropped, the same
  // frame granularity the NSF path has.)
  log = [{frame: 0, addr: 0xFF26, value: 0x80}, {frame: 0, addr: 0xFF25, value: 0xFF},
         {frame: 1, addr: 0xFF11, value: 64 - 8}, {frame: 1, addr: 0xFF12, value: 0xF0},
         {frame: 1, addr: 0xFF13, value: A4[1]}, {frame: 1, addr: 0xFF14, value: 0xC0 | (1750 >> 8)}];
  ev = reconstruct(log, 60, FS);
  assert.equal(ev.length, 1);
  const dl = ev[0].endFrame - ev[0].startFrame;
  assert.ok(dl >= 1 && dl <= 3, "length expiry silenced it after ≈2 frames, got " + dl);
  // ...and with length DISABLED the same note holds to the end
  log[5] = {frame: 1, addr: 0xFF14, value: 0x80 | (1750 >> 8)};
  ev = reconstruct(log, 60, FS);
  assert.deepEqual(ev.map(e => [e.startFrame, e.endFrame]), [[1, 60]]);
  // unrouting via NR51 ends the note; rerouting starts a new one
  log = [{frame: 0, addr: 0xFF26, value: 0x80}, {frame: 0, addr: 0xFF25, value: 0xFF}];
  trig(log, 1, 15);
  log.push({frame: 8, addr: 0xFF25, value: 0xEE}); // pulse1 out of both sides
  log.push({frame: 12, addr: 0xFF25, value: 0xFF});
  ev = reconstruct(log, 20, FS);
  assert.deepEqual(ev.map(e => [e.startFrame, e.endFrame]), [[1, 8], [12, 20]]);
  // power off ends everything
  log = [{frame: 0, addr: 0xFF26, value: 0x80}, {frame: 0, addr: 0xFF25, value: 0xFF}];
  trig(log, 1, 15);
  log.push({frame: 5, addr: 0xFF26, value: 0x00});
  ev = reconstruct(log, 20, FS);
  assert.deepEqual(ev.map(e => [e.startFrame, e.endFrame]), [[1, 5]]);
});

test("APU renderer: a pulse register log becomes audio at the written pitch", async () => {
  const x = 1750; // A4
  const log = [
    {frame: 0, addr: 0xFF26, value: 0x80},
    {frame: 0, addr: 0xFF24, value: 0x77},
    {frame: 0, addr: 0xFF25, value: 0xFF},
    {frame: 1, addr: 0xFF11, value: 0x80},          // 50% duty
    {frame: 1, addr: 0xFF12, value: 0xF0},          // volume 15, no envelope
    {frame: 1, addr: 0xFF13, value: x & 0xFF},
    {frame: 1, addr: 0xFF14, value: 0x80 | (x >> 8)},
  ];
  const r = await renderApu(log, 60, FS, {sampleRate: 44100});
  let sum = 0;
  for (let i = 0; i < r.pulse1.length; i++) sum += r.pulse1[i] * r.pulse1[i];
  assert.ok(Math.sqrt(sum / r.pulse1.length) > 0.01, "pulse1 makes sound");
  const seg = r.pulse1.subarray(11025, 33075); // steady middle half-second
  let cross = 0;
  for (let i = 1; i < seg.length; i++) if (seg[i - 1] < 0 && seg[i] >= 0) cross++;
  const hz = cross * 2;
  assert.ok(Math.abs(hz - 440) < 15, "period 1750 renders near A440, got " + hz);
  // wave and noise produce sound; an unpowered log is silent
  const wl = waveLog([1899]).log; // A4 on the wave
  const rw = await renderApu(wl, 10, FS, {sampleRate: 22050});
  let sw = 0;
  for (const v of rw.wave) sw += Math.abs(v);
  assert.ok(sw > 1, "wave channel makes sound");
  const nl = [{frame: 0, addr: 0xFF26, value: 0x80}, {frame: 0, addr: 0xFF24, value: 0x77}, {frame: 0, addr: 0xFF25, value: 0xFF},
              {frame: 1, addr: 0xFF21, value: 0xF0}, {frame: 1, addr: 0xFF22, value: 0x40}, {frame: 1, addr: 0xFF23, value: 0x80}];
  const rn = await renderApu(nl, 10, FS, {sampleRate: 22050});
  let sn = 0;
  for (const v of rn.noise) sn += Math.abs(v);
  assert.ok(sn > 1, "noise channel makes sound");
  const r2 = await renderApu([{frame: 0, addr: 0xFF26, value: 0}], 30, FS, {});
  let s2 = 0;
  for (const v of r2.pulse1) s2 += Math.abs(v);
  assert.ok(s2 < 1e-6, "powered-off APU is silent");
});

test("GBS runner: the player powers the APU before INIT, so a driver that never writes NR52 still sounds", () => {
  const bytes = new Uint8Array(makeTestGBS());
  let i = -1; for (let k = 0x70; k < bytes.length - 3; k++) if (bytes[k] === 0x3E && bytes[k + 1] === 0x80 && bytes[k + 2] === 0xE0 && bytes[k + 3] === 0x26) { i = k; break; } // the init's LD A,$80 / LDH ($26),A
  assert.ok(i > 0, "the test tune's NR52 write is where the assembler put it");
  bytes.fill(0x00, i, i + 4); // NOPs: the driver no longer powers anything
  const gbs = parseGBS(bytes.buffer);
  const {apuLog, frames, frameSec} = runGBS(gbs, 1, 3);
  assert.deepEqual(apuLog.slice(0, 3).map(w => [w.addr, w.value]), [[0xFF26, 0x80], [0xFF24, 0x77], [0xFF25, 0xFF]], "the player's init leads the log");
  assert.ok(!apuLog.slice(3).some(w => w.addr === 0xFF26), "the patched driver writes none");
  const pulse1 = reconstruct(apuLog, frames, frameSec).filter(e => e.channel === "pulse1").map(e => pitchName(e.midi));
  assert.deepEqual(pulse1, ["C4", "E4", "G4", "C5"]);
});

// ---------------------------------------------------------------- capture v2
// NIGHT-ROLL.md "Game Boy capture v2": each feature from a register script
// played through the real SM83 (makeScriptGBS), then makeMidi + readSmf.
const P1 = {vol: 0xFF12, lo: 0xFF13, hi: 0xFF14, duty: 0xFF11, sweep: 0xFF10};
const P2 = {vol: 0xFF17, lo: 0xFF18, hi: 0xFF19, duty: 0xFF16};
const note = (ch, f, x, {vol = 0xF0, trig = true} = {}) => [[f, ch.vol, vol], [f, ch.lo, x & 0xFF], [f, ch.hi, (trig ? 0x80 : 0) | (x >> 8)]];
const pitchTo = (ch, f, x) => [[f, ch.lo, x & 0xFF], [f, ch.hi, x >> 8]]; // no trigger bit
const TRI = [0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, 0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10];
const SQR = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
const waveNote = (f, x, table, level = 0x20) => [[f, 0xFF1A, 0x00], ...table.map((b, i) => [f, 0xFF30 + i, b]), [f, 0xFF1A, 0x80], [f, 0xFF1C, level], [f, 0xFF1D, x & 0xFF], [f, 0xFF1E, 0x80 | (x >> 8)]];
const capScript = (writes, secs = 3) => {
  const r = runGBS(parseGBS(makeScriptGBS(writes).buffer), 1, secs);
  return {...r, events: reconstruct(r.apuLog, r.frames, r.frameSec)};
};
const V2_FIELDS = ["volSeries", "bendSeries", "dutySeries", "panSeries", "prog", "lg"];
const v1View = evs => evs.map(e => { const o = {...e}; for (const k of V2_FIELDS) delete o[k]; return o; });
const smfOf = (events, frameSec) => readSmf(Buffer.from(makeMidi(events, {bpm: 120, frameSec})));
const kinds = (smf, name, kind) => smf.tracks.find(t => t.name === name).other.filter(e => e.kind === kind);
const A4 = 1750, C5 = 1797, D5 = 1825, C3W = 0x60B;

test("GB capture v2: an envelope going UP is a rising shape; a steady fall stays v1's `ve` alone, byte for byte", () => {
  const {events, frameSec} = capScript([
    ...note(P1, 1, A4, {vol: 0x1D}),  // level 1, up, pace 5: 1 → 15
    [100, P1.vol, 0x00],
    ...note(P2, 1, C5, {vol: 0xF3}),  // level 15, down, pace 3: falls to silence at a steady rate
  ]);
  const up = events.find(e => e.channel === "pulse1"), down = events.find(e => e.channel === "pulse2");
  assert.equal(up.vol, 1, "v1: the note opens at the envelope's first audible level");
  assert.ok(up.volSeries && up.volSeries.at(-1)[1] === 15, "the series climbs to 15: " + JSON.stringify(up.volSeries));
  assert.equal(down.volSeries, undefined, "a hardware fall at its steady rate is what `ve` already plays");
  const smf = smfOf(events, frameSec);
  const shape = kinds(smf, "pulse1", "shape").map(e => +e.key.split(":")[2]);
  assert.ok(shape.length >= 1 && shape.every((v, k) => !k || v >= shape[k - 1]) && shape.at(-1) > 100, "rising in-note aftertouch: " + shape);
  assert.ok(smf.tracks.find(t => t.name === "pulse1").notes[0].v < 16, "from the quiet attack (velocity = level 1)");
  const fallOnly = capScript(note(P2, 1, C5, {vol: 0xF3}));
  assert.deepEqual([...makeMidi(fallOnly.events, {bpm: 120, frameSec})], [...makeMidi(v1View(fallOnly.events), {bpm: 120, frameSec})], "nothing v2 adds to a plain decaying note");
});

test("GB capture v2: a software fade's steps and an NR32 level walk are falling shapes", () => {
  const {events, frameSec} = capScript([
    ...note(P1, 1, A4, {vol: 0xF0}), ...note(P1, 20, A4, {vol: 0xA0}), ...note(P1, 40, A4, {vol: 0x50}), [60, P1.vol, 0x00],
    ...waveNote(1, C3W, TRI), [30, 0xFF1C, 0x40], [60, 0xFF1C, 0x60], [90, 0xFF1A, 0x00],
  ]);
  const p1 = events.filter(e => e.channel === "pulse1"), w = events.filter(e => e.channel === "wave");
  assert.equal(p1.length, 1, "v1: a same-pitch retrigger at a lower level is a fade, one note");
  assert.deepEqual(p1[0].volSeries.map(q => q[1]), [15, 10, 5]);
  assert.equal(w.length, 1);
  assert.deepEqual(w[0].volSeries.map(q => q[1]), [15, 8, 4], "NR32 100% → 50% → 25%");
  const smf = smfOf(events, frameSec);
  const lv = name => kinds(smf, name, "shape").map(e => +e.key.split(":")[2]);
  assert.deepEqual(lv("pulse1").filter((v, k, a) => !k || v !== a[k - 1]).slice(-2), [85, 42], "10/15 and 5/15 of the attack");
  assert.ok(lv("wave").includes(68) && lv("wave").includes(34), "8/15 and 4/15: " + lv("wave"));
});

test("GB capture v2: NR51 left/right is CC10 — one still side is one event, a move is a timeline, centre writes none", () => {
  const {events, frameSec} = capScript([
    [1, 0xFF25, 0xFE],                 // pulse1 left only
    ...note(P1, 1, A4), ...note(P2, 1, C5), ...note(P1, 60, C5),
    [30, 0xFF25, 0xDE],                // pulse2 right only, mid-note
    ...waveNote(1, C3W, TRI),
  ]);
  const smf = smfOf(events, frameSec);
  assert.deepEqual(kinds(smf, "pulse1", "cc10").map(e => e.key), ["0:1"], "left = 1, written once at tick 0");
  const p2 = kinds(smf, "pulse2", "cc10");
  assert.deepEqual(p2.map(e => e.key), ["1:64", "1:127"], "centre, then right inside the held note");
  assert.ok(p2[1].t > 0);
  assert.deepEqual(kinds(smf, "wave", "cc10"), [], "a centred channel writes nothing");
  assert.equal(events.filter(e => e.channel === "pulse2").length, 1, "a pan move is not a new note");
});

test("GB capture v2: each wave RAM table is a program, numbered in first use; `wave:` is not written (parseMidi reads no such meta)", () => {
  const {events, frameSec} = capScript([
    ...waveNote(1, C3W, TRI), ...waveNote(21, C3W, SQR), ...waveNote(41, C3W, TRI), [60, 0xFF1A, 0x00],
  ]);
  const w = events.filter(e => e.channel === "wave");
  assert.deepEqual(w.map(e => e.prog), [0, 1, 0]);
  const smf = smfOf(events, frameSec);
  assert.deepEqual(kinds(smf, "wave", "program").map(e => e.key), ["2:0", "2:1", "2:0"]);
  assert.ok(!smf.tracks.some(t => t.other.some(e => e.kind === "meta01" && /^wave:/.test(e.key))));
});

test("GB capture v2: pulse 1's sweep (NR10) is pitch bend on the ONE note v1 wrote, up and down", () => {
  for (const [nr10, sign] of [[0x27, 1], [0x2F, -1]]) { // pace 2, shift 7, add / subtract
    const {events, frameSec} = capScript([[1, P1.sweep, nr10], ...note(P1, 1, 1024), [40, P1.vol, 0x00]]);
    const p1 = events.filter(e => e.channel === "pulse1");
    assert.equal(p1.length, 1, "v1 judges the written period: still one note");
    const cents = p1[0].bendSeries.map(q => q[1]);
    assert.ok(cents.every((c, k) => !k || sign * (c - cents[k - 1]) >= 0), "monotonic: " + cents);
    assert.ok(sign * cents.at(-1) > 150, "the sweep moved it: " + cents.at(-1));
    const smf = smfOf(events, frameSec);
    assert.ok(kinds(smf, "pulse1", "bend").length >= 3, "written as pitch bend");
  }
  const flat = capScript([[1, P1.sweep, 0x00], ...note(P1, 1, 1024), [40, P1.vol, 0x00]]);
  assert.equal(flat.events[0].bendSeries, undefined, "NR10 off: no bend");
});

test("GB capture v2: a period move with no trigger is a glide link (CC84); a trigger is not; a trigger's same-frame setup is not either", () => {
  const vib = [];
  for (let f = 2; f < 20; f++) vib.push(...pitchTo(P1, f, A4 + (f % 4 < 2 ? 2 : -2))); // ±~20 cents: inside the note
  const {events, frameSec} = capScript([
    ...note(P1, 1, A4), ...vib, [20, P1.lo, A4 & 0xFF],
    ...pitchTo(P1, 21, C5),                                      // no trigger: the chip plays on
    ...note(P1, 41, D5),                                         // trigger
    [61, P1.vol, 0xF0], [61, P1.hi, 0x80 | (A4 >> 8)], [61, P1.lo, C5 & 0xFF], [61, P1.hi, C5 >> 8], // FFL's order: trigger on the stale period, then the new one
    [70, P1.vol, 0x90], [70, P1.lo, 0x39], [70, P1.hi, 0x87],  // Pokémon's order: NR13 to E5 first, then a trigger at a lower level (v1 reads it as a fade, one note)
    [80, P1.vol, 0x00],
  ]);
  const p1 = events.filter(e => e.channel === "pulse1");
  assert.deepEqual(p1.map(e => pitchName(e.midi)), ["A4", "C5", "D5", "C5", "E5"], "slides stay separate notes on screen");
  assert.deepEqual(p1.map(e => !!e.lg), [false, true, false, false, false], "a trigger in the frame a note opened is a restart");
  assert.ok(p1[0].bendSeries && p1[0].bendSeries.length > 4, "the vibrato rides as bend");
  const smf = smfOf(events, frameSec), tr = smf.tracks.find(t => t.name === "pulse1");
  const links = kinds(smf, "pulse1", "cc84");
  assert.equal(links.length, 1);
  assert.equal(links[0].key, "0:69", "CC84 = the key it continues from");
  assert.equal(links[0].t, tr.notes[1].t, "at the continuation's own tick");
  const noise = capScript([[1, 0xFF21, 0xF0], [1, 0xFF22, 0x40], [1, 0xFF23, 0x80], [10, 0xFF22, 0x10], [30, 0xFF21, 0]]);
  assert.ok(noise.events.length === 2 && !noise.events.some(e => e.lg), "noise never links");
});

test("GB capture v2: a duty change inside a held pulse note is CC70 there; the first frame's write is setup", () => {
  const {events, frameSec} = capScript([[1, P1.duty, 0x40], ...note(P1, 1, A4), [1, P1.duty, 0x80], [20, P1.duty, 0xC0], [40, P1.vol, 0x00]]);
  const p1 = events.filter(e => e.channel === "pulse1");
  assert.equal(p1.length, 1);
  assert.equal(p1[0].duty, 1, "the duty at the trigger (v1); the same-frame rewrite is setup");
  assert.deepEqual(p1[0].dutySeries, [[0, 1], [19, 3]]);
  const cc70 = kinds(smfOf(events, frameSec), "pulse1", "cc70");
  assert.deepEqual(cc70.map(e => e.key), ["0:1", "0:3"]);
  assert.ok(cc70[1].t > 0);
});

test("GB capture v2: every feature at once moves no note — capture-diff against the v1 view says VELOCITY, with the gains", () => {
  const vib = [];
  for (let f = 2; f < 20; f++) vib.push(...pitchTo(P2, f, C5 + (f % 4 < 2 ? 2 : -2)));
  const {events, frameSec} = capScript([
    [1, 0xFF25, 0xDE], [1, P1.sweep, 0x27], ...note(P1, 1, 1024), [10, P1.duty, 0xC0], [20, P1.duty, 0x40], [29, P1.sweep, 0x00], ...note(P1, 30, A4, {vol: 0x1D}), [70, P1.vol, 0],
    ...note(P2, 1, C5), ...vib, ...pitchTo(P2, 21, D5), [50, 0xFF25, 0xFF], [60, P2.vol, 0],
    ...waveNote(1, C3W, TRI), ...waveNote(30, C3W, SQR), [30, 0xFF1C, 0x20], [45, 0xFF1C, 0x40], [70, 0xFF1A, 0],
    [1, 0xFF21, 0xF1], [1, 0xFF22, 0x40], [1, 0xFF23, 0x80],
  ]);
  const before = smfOf(v1View(events), frameSec), after = smfOf(events, frameSec);
  const r = captureDiff(before, after);
  assert.equal(r.verdict, "VELOCITY", r.reasons.join("; "));
  for (const k of ["cc84", "bend", "cc10", "program", "shape", "cc70"]) assert.ok(r.gained[k] > 0, k + " gained: " + JSON.stringify(r.gained));
  assert.deepEqual(r.lost, {});
});

// real rip, when the dry-run cache has it (GB_RIPS=<dir> or tools/recapture.mjs's
// /tmp/recap/rips/game-boy); the guard checks the FILE, so an empty cache skips
const GB_RIP_DIR = process.env.GB_RIPS || "/tmp/recap/rips/game-boy";
const laRip = GB_RIP_DIR + "/links-awakening.gbs";
test("GB capture v2 on Link's Awakening \"Main Theme\" (real rip): shapes, bends and the wave program, notes as v1", {skip: !existsSync(laRip) && "no Link's Awakening rip cached"}, () => {
  const gbs = parseGBS(readFileSync(laRip).buffer);
  const r = runGBS(gbs, 2, 20); // album.json: main-theme = song 2
  const events = reconstruct(r.apuLog, r.frames, r.frameSec);
  assert.ok(events.length > 50);
  assert.ok(events.some(e => e.bendSeries), "vibrato/slides as bend");
  assert.ok(events.some(e => e.volSeries), "envelope shapes");
  assert.ok(events.some(e => e.prog !== undefined), "the wave table as a program");
  const res = captureDiff(smfOf(v1View(events), r.frameSec), smfOf(events, r.frameSec));
  assert.equal(res.verdict, "VELOCITY", res.reasons.join("; "));
});

test("GB capture v2 in the app's own capture (captureChipTrack + parseMidi + the publish re-encode): links, bends, pan, programs, shapes and duty all arrive", async () => {
  const { createApp } = await import("./harness.mjs");
  const mods = await Promise.all(["gbs/gbs", "gbs/notes", "nsf/notes", "nsf/midi-write"].map(f => import("../tools/" + f + ".mjs")));
  const gb = mods[1];
  const app = await createApp();
  const C = app.context;
  C.setTimeout = setTimeout; C.clearTimeout = clearTimeout;
  C.__M = Object.assign({}, ...mods, {reconstruct: gb.reconstruct, toNotesTxt: gb.toNotesTxt}); // the browser's merge (chipModules)
  const vib = [];
  for (let f = 2; f < 30; f++) vib.push(...pitchTo(P2, f, C5 + (f % 4 < 2 ? 2 : -2)));
  const bar = [];
  for (let k = 0; k < 4; k++) { // four bars of quarter notes, so the tempo fit and the loop-less path see music
    const f0 = 1 + k * 120;
    bar.push(...note(P1, f0, A4, {vol: 0x1D}), [f0 + 15, P1.duty, 0xC0], [f0 + 29, P1.duty, 0x80], ...note(P1, f0 + 30, C5), ...pitchTo(P1, f0 + 60, D5), ...note(P1, f0 + 90, A4));
    bar.push(...waveNote(f0, C3W, k % 2 ? SQR : TRI), [f0 + 60, 0xFF1C, 0x40]);
  }
  C.__gbs = parseGBS(makeScriptGBS([[1, 0xFF25, 0xDE], ...bar, ...note(P2, 1, C5), ...vib, [200, 0xFF25, 0xFF], [470, P1.vol, 0], [470, P2.vol, 0], [470, 0xFF1A, 0]]).buffer);
  const cap = await app.run("captureChipTrack('gbs', __M, __gbs, 1, 10, null)");
  C.__b = cap.bytes;
  const got = JSON.parse(app.run(`JSON.stringify((() => {
    const a = parseMidi(__b.buffer);
    const b = parseMidi(writeMidi({ppq: a.ppq, timesig: a.timesig, tempos: a.tempos, tracks: a.tracks.map(t => ({...t}))}).buffer);
    const sum = s => s.tracks.map(t => ({name: t.name, midiPan: t.midiPan, ctl: (t.ctl || []).map(c => c.c),
      lg: t.notes.filter(n => n.lg).length, env: t.notes.filter(n => n.env).length, duties: t.notes.filter(n => n.duties).length, notes: t.notes.map(n => [n.t, n.d, n.p, n.v])}));
    return {a: sum(a), b: sum(b)};
  })())`));
  const tr = (s, n) => s.find(t => t.name === n);
  assert.deepEqual(got.b, got.a, "the publish hop keeps every v2 event");
  const p1 = tr(got.a, "pulse1"), p2 = tr(got.a, "pulse2"), w = tr(got.a, "wave");
  assert.ok(p1.lg >= 3, "glide links read back as n.lg: " + p1.lg);
  assert.ok(p1.env >= 3, "the rising envelope as n.env: " + p1.env);
  assert.ok(p1.duties >= 3, "duty inside a note as n.duties: " + p1.duties);
  assert.ok(p2.ctl.includes("pb"), "the vibrato as bend in tr.ctl");
  assert.ok(p2.ctl.filter(c => c === 10).length >= 2, "pan moving → CC10 events in tr.ctl: " + p2.ctl);
  assert.ok(w.ctl.filter(c => c === "pg").length >= 2, "wave tables → program changes: " + w.ctl);
  assert.ok(w.env >= 1, "the NR32 level walk as a shape");
  // and the notes are exactly what the same capture writes with v2's fields taken away
  const stripped = Object.assign({}, C.__M, {reconstruct: (...a) => v1View(gb.reconstruct(...a))});
  C.__M1 = stripped;
  const cap1 = await app.run("captureChipTrack('gbs', __M1, __gbs, 1, 10, null)");
  C.__b1 = cap1.bytes;
  const notes1 = JSON.parse(app.run("JSON.stringify(parseMidi(__b1.buffer).tracks.map(t => ({name: t.name, notes: t.notes.map(n => [n.t, n.d, n.p, n.v])})))"));
  assert.deepEqual(got.a.map(t => ({name: t.name, notes: t.notes})), notes1, "same tracks, ticks, lengths, pitches, velocities");
  assert.equal(cap.bpm, cap1.bpm);
});
