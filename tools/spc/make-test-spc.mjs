// Builds a tiny synthetic SPC: our own SPC700 driver plays C4 E4 G4 C5
// (quarter notes at 120 bpm, looping) on voice 0 with a BRR-encoded sine
// whose root we KNOW (64 samples per period at 32 kHz = 500 Hz), so the
// whole pipeline — CPU, timers, DSP log, BRR decode, root estimation,
// pitch relative to root — is testable end to end without copyrighted data.
import { encodeBRR } from "./brr.mjs";

export const TEST_ROOT_HZ = 500;                    // 32000 / 64
export const TEST_MELODY_MIDI = [60, 64, 67, 72];   // C4 E4 G4 C5
export const TEST_TICK_TARGET = 250;                // timer 0: 8000 / 250 = 32 ticks/s
export const TEST_TICKS_PER_NOTE = 16;              // 500 ms = a quarter at 120 bpm

export function makeTestSPC() {
  const ram = new Uint8Array(0x10000);
  const CODE = 0x0200, DIR_PAGE = 0x03, SAMPLE = 0x0400;

  // ---- sample: one period of a sine in 64 samples, looped whole
  const pcm = new Int16Array(64);
  for (let i = 0; i < 64; i++) pcm[i] = Math.round(12000 * Math.sin(2 * Math.PI * i / 64));
  const brr = encodeBRR(pcm, {loopStart: 0});
  ram.set(brr, SAMPLE);
  const dir = DIR_PAGE << 8;
  ram[dir] = SAMPLE & 0xFF; ram[dir + 1] = SAMPLE >> 8; ram[dir + 2] = SAMPLE & 0xFF; ram[dir + 3] = SAMPLE >> 8;

  // ---- PITCH per note: 4096 × f / root
  const pitches = TEST_MELODY_MIDI.map(m => Math.round(4096 * 440 * 2 ** ((m - 69) / 12) / TEST_ROOT_HZ));

  const code = [];
  const emit = (...b) => code.push(...b);
  const here = () => CODE + code.length;
  const lohi = a => [a & 0xFF, a >> 8];

  // ---- init: stack, timer 0, DSP registers from a table
  emit(0xCD, 0xEF, 0xBD);                 // MOV X,#$EF / MOV SP,X
  emit(0x8F, TEST_TICK_TARGET, 0xFA);     // MOV $FA,#target
  emit(0x8F, 0x01, 0xF1);                 // MOV $F1,#$01  (timer 0 on, IPL off)
  emit(0xCD, 0x00);                       // MOV X,#0
  const initLoop = here();
  const tblRef1 = code.length; emit(0xF5, 0, 0);   // MOV A,tbl+X (patched)
  const bmi = code.length; emit(0x30, 0);          // BMI done (terminator $FF)
  emit(0xC4, 0xF2);                       // MOV $F2,A
  emit(0x3D);                             // INC X
  const tblRef2 = code.length; emit(0xF5, 0, 0);   // MOV A,tbl+X
  emit(0xC4, 0xF3);                       // MOV $F3,A
  emit(0x3D);                             // INC X
  emit(0x2F, (initLoop - (here() + 2)) & 0xFF); // BRA initLoop
  const initDone = here();
  code[bmi + 1] = (initDone - (CODE + bmi + 2)) & 0xFF;

  // ---- main: forever { for each note: PITCH, KON, wait 15, KOFF, wait 1, clear KOFF }
  const main = here();
  emit(0xCD, 0x00);                       // MOV X,#0
  const note = here();
  const loRef = code.length; emit(0xF5, 0, 0);     // MOV A,pitchLo+X
  emit(0x8F, 0x02, 0xF2, 0xC4, 0xF3);     // MOV $F2,#$02 / MOV $F3,A
  const hiRef = code.length; emit(0xF5, 0, 0);     // MOV A,pitchHi+X
  emit(0x8F, 0x03, 0xF2, 0xC4, 0xF3);     // MOV $F2,#$03 / MOV $F3,A
  emit(0x8F, 0x4C, 0xF2, 0x8F, 0x01, 0xF3); // KON voice 0
  emit(0x8D, TEST_TICKS_PER_NOTE - 1);    // MOV Y,#15
  const call1 = code.length; emit(0x3F, 0, 0);     // CALL wait
  emit(0x8F, 0x5C, 0xF2, 0x8F, 0x01, 0xF3); // KOFF voice 0
  emit(0x8D, 0x01);                       // MOV Y,#1
  const call2 = code.length; emit(0x3F, 0, 0);     // CALL wait
  emit(0x8F, 0x00, 0xF3);                 // MOV $F3,#0 (KOFF clear; $F2 still $5C)
  emit(0x3D);                             // INC X
  emit(0xC8, 0x04);                       // CMP X,#4
  emit(0xD0, (note - (here() + 2)) & 0xFF); // BNE note
  emit(0x2F, (main - (here() + 2)) & 0xFF); // BRA main
  // wait: Y timer-0 ticks
  const wait = here();
  emit(0xE4, 0xFD);                       // MOV A,$FD
  emit(0xF0, 0xFC);                       // BEQ wait  (-4)
  emit(0xFE, (wait - (here() + 2)) & 0xFF); // DBNZ Y,wait
  emit(0x6F);                             // RET
  code[call1 + 1] = wait & 0xFF; code[call1 + 2] = wait >> 8;
  code[call2 + 1] = wait & 0xFF; code[call2 + 2] = wait >> 8;

  // ---- tables
  const tbl = here();
  emit(0x6C, 0x20, 0x0C, 0x7F, 0x1C, 0x7F, 0x2C, 0x00, 0x3C, 0x00, // FLG, MVOL, EVOL
       0x5D, DIR_PAGE, 0x3D, 0x00, 0x2D, 0x00, 0x4D, 0x00, 0x5C, 0x00, // DIR, NON, PMON, EON, KOFF
       0x00, 0x7F, 0x01, 0x7F, 0x04, 0x00, 0x05, 0xFF, 0x06, 0xE0, 0x07, 0x00, // v0: VOL, SRCN, ADSR (AR15 DR7 SL7 SR0), GAIN
       0xFF);
  const pitchLo = here(); emit(...pitches.map(p => p & 0xFF));
  const pitchHi = here(); emit(...pitches.map(p => p >> 8));
  for (const [ref, addr] of [[tblRef1, tbl], [tblRef2, tbl], [loRef, pitchLo], [hiRef, pitchHi]]) {
    [code[ref + 1], code[ref + 2]] = lohi(addr);
  }
  ram.set(code, CODE);

  // ---- SPC file
  const out = new Uint8Array(0x10200);
  const put = (off, s) => { for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i); };
  put(0, "SNES-SPC700 Sound File Data v0.30");
  out[0x21] = 26; out[0x22] = 26; out[0x23] = 26; out[0x24] = 30;
  out[0x25] = CODE & 0xFF; out[0x26] = CODE >> 8;   // PC
  out[0x2A] = 0x00; out[0x2B] = 0xEF;               // PSW, SP
  put(0x2E, "Night Roll test tune"); put(0x4E, "Night Roll"); put(0x6E, "make-test-spc");
  put(0xA9, "3"); put(0xAC, "0"); put(0xB1, "synthetic");
  out.set(ram, 0x100);
  out[0x10100 + 0x6C] = 0xE0; // DSP FLG as a fresh chip: reset + mute (our init clears it)
  return out;
}
