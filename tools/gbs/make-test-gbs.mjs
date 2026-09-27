// Builds a tiny synthetic GBS: pulse 1 plays C4 E4 G4 C5 (quarter notes at
// ~120bpm = one note per 30 v-blank frames) over a constant C3 wave-channel
// pedal (one triangle cycle in wave RAM), with a decaying noise hit on each
// note. Hand-assembled SM83 — our own code, no copyrighted data — so the
// whole pipeline can be tested end-to-end. Twin of tools/nsf/make-test-nsf.mjs.
export function makeTestGBS() {
  const LOAD = 0x0400;
  const code = [];
  const emit = (...bytes) => code.push(...bytes);
  const ldhA = (n, port) => emit(0x3E, n, 0xE0, port); // LD A,n / LDH (port),A

  // ---- init ($0400): power the APU, load wave RAM, start the C3 pedal
  ldhA(0x80, 0x26);                    // NR52: audio on
  ldhA(0x77, 0x24);                    // NR50: full volume both sides
  ldhA(0xFF, 0x25);                    // NR51: every channel left+right
  emit(0xAF, 0xE0, 0x1A);              // XOR A / LDH ($1A),A — wave DAC off while the table is written
  emit(0x21, 0x30, 0xFF);              // LD HL,$FF30
  const waveRef = code.length; emit(0x11, 0x00, 0x00); // LD DE,wavetab (patched)
  emit(0x06, 16);                      // LD B,16
  emit(0x1A, 0x22, 0x13, 0x05, 0x20, 0xFA); // LD A,(DE) / LD (HL+),A / INC DE / DEC B / JR NZ,-6
  ldhA(0x80, 0x1A);                    // NR30: DAC on
  ldhA(0x20, 0x1C);                    // NR32: output level 100%
  ldhA(0x0B, 0x1D);                    // NR33: period low  — x = $60B -> 65536/501 = C3
  ldhA(0x86, 0x1E);                    // NR34: trigger + period high 6
  emit(0x3E, 29, 0xEA, 0x00, 0xC0);    // LD A,29 / LD ($C000),A  (frame ctr, fires next frame)
  emit(0xAF, 0xEA, 0x01, 0xC0);        // XOR A / LD ($C001),A    (note index)
  emit(0xC9);                          // RET
  const playOff = code.length;

  // ---- play: every 30 frames, advance through the 4-note table
  emit(0xFA, 0x00, 0xC0, 0x3C, 0xEA, 0x00, 0xC0); // LD A,($C000) / INC A / LD ($C000),A
  emit(0xFE, 30, 0xC0);                // CP 30 / RET NZ
  emit(0xAF, 0xEA, 0x00, 0xC0);        // reset frame ctr
  emit(0xFA, 0x01, 0xC0, 0xFE, 4, 0xC8); // LD A,($C001) / CP 4 / RET Z
  emit(0x4F, 0x06, 0x00);              // LD C,A / LD B,0
  const tabRef = code.length; emit(0x21, 0x00, 0x00); // LD HL,notetab (patched)
  emit(0x09, 0x09);                    // ADD HL,BC twice: 2 bytes per entry
  ldhA(0x80, 0x11);                    // NR11: duty 50%, length 0
  ldhA(0xF0, 0x12);                    // NR12: volume 15, no envelope
  emit(0x2A, 0xE0, 0x13);              // LD A,(HL+) / LDH ($13),A  period low
  emit(0x7E, 0xF6, 0x80, 0xE0, 0x14);  // LD A,(HL) / OR $80 / LDH ($14),A  trigger + period high
  ldhA(0xF1, 0x21);                    // NR42: volume 15, decreasing, pace 1 (silent after 15 ticks of 64 Hz)
  ldhA(0x40, 0x22);                    // NR43: shift 4, 15-bit, divider 0
  ldhA(0x80, 0x23);                    // NR44: trigger
  emit(0xFA, 0x01, 0xC0, 0x3C, 0xEA, 0x01, 0xC0); // note index++
  emit(0xC9);                          // RET

  // note table: 11-bit period values (lo, hi) for C4 E4 G4 C5
  const noteTab = code.length; emit(0x0B, 0x06, 0x72, 0x06, 0xB2, 0x06, 0x06, 0x07);
  // wave table: one triangle cycle across all 32 samples (period 32 -> waveCycles 1)
  const waveTab = code.length;
  emit(0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, 0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10);

  code[waveRef + 1] = (LOAD + waveTab) & 0xFF; code[waveRef + 2] = (LOAD + waveTab) >> 8;
  code[tabRef + 1] = (LOAD + noteTab) & 0xFF; code[tabRef + 2] = (LOAD + noteTab) >> 8;

  // ---- GBS header
  const header = new Uint8Array(0x70);
  header[0] = 0x47; header[1] = 0x42; header[2] = 0x53; // "GBS"
  header[3] = 1;  // version
  header[4] = 1;  // songs
  header[5] = 1;  // first song
  header[0x06] = LOAD & 0xFF; header[0x07] = LOAD >> 8;
  header[0x08] = LOAD & 0xFF; header[0x09] = LOAD >> 8;                         // init
  header[0x0A] = (LOAD + playOff) & 0xFF; header[0x0B] = (LOAD + playOff) >> 8; // play
  header[0x0C] = 0xFE; header[0x0D] = 0xFF; // SP = $FFFE
  header[0x0E] = 0; header[0x0F] = 0;       // TMA/TAC 0: v-blank rate
  const name = "Night Roll test tune";
  for (let i = 0; i < name.length; i++) header[0x10 + i] = name.charCodeAt(i);

  const out = new Uint8Array(0x70 + code.length);
  out.set(header, 0);
  out.set(code, 0x70);
  return out;
}
