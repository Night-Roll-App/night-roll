// End-to-end test of the GBS pipeline against a synthetic, self-assembled
// GBS (no copyrighted data): SM83 emulation -> APU write log -> note
// reconstruction -> .notes.txt / MIDI emission -> APU render. Twin of
// tests/nsf.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { makeTestGBS } from "../tools/gbs/make-test-gbs.mjs";
import { parseGBS, runGBS } from "../tools/gbs/gbs.mjs";
import { SM83 } from "../tools/gbs/cpu-sm83.mjs";
import { reconstruct, toNotesTxt, pitchName, makeMidi, waveCycles } from "../tools/gbs/notes.mjs";
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
