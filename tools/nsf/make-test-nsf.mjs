// Builds a tiny synthetic NSF: pulse 1 plays C4 E4 G4 C5 (quarter notes at
// 120bpm = one note per 30 NTSC frames) over a constant C3 triangle pedal.
// Hand-assembled 6502 — our own code, no copyrighted data — so the whole
// pipeline can be tested end-to-end.
export function makeTestNSF() {
  const LOAD = 0x8000;
  const code = [];
  const emit = (...bytes) => code.push(...bytes);

  // ---- init ($8000): enable pulse1+triangle, set counters, start triangle C3
  emit(0xA9, 0x0F, 0x8D, 0x15, 0x40); // LDA #$0F / STA $4015
  emit(0xA9, 29, 0x85, 0x00);         // LDA #29  / STA $00 (frame ctr, fires next frame)
  emit(0xA9, 0, 0x85, 0x01);          // LDA #0   / STA $01 (note index)
  emit(0xA9, 0x7F, 0x8D, 0x08, 0x40); // LDA #$7F / STA $4008 (triangle linear on)
  emit(0xA9, 0xAB, 0x8D, 0x0A, 0x40); // period $1AB -> C3
  emit(0xA9, 0x01, 0x8D, 0x0B, 0x40);
  emit(0x60);                         // RTS
  const playOff = code.length;

  // ---- play: every 30 frames, advance through the 4-note table
  emit(0xE6, 0x00);                   // INC $00
  emit(0xA5, 0x00, 0xC9, 30);        // LDA $00 / CMP #30
  const bne1 = code.length; emit(0xD0, 0x00); // BNE done (patched)
  emit(0xA9, 0, 0x85, 0x00);          // reset frame ctr
  emit(0xA5, 0x01, 0xC9, 4);          // LDA $01 / CMP #4
  const beq1 = code.length; emit(0xF0, 0x00); // BEQ done (patched)
  emit(0xAA);                         // TAX
  const loRef = code.length; emit(0xBD, 0x00, 0x00); // LDA lo,X (patched)
  emit(0x8D, 0x02, 0x40);             // STA $4002
  const hiRef = code.length; emit(0xBD, 0x00, 0x00); // LDA hi,X (patched)
  emit(0x8D, 0x03, 0x40);             // STA $4003
  emit(0xA9, 0x3F, 0x8D, 0x00, 0x40); // LDA #$3F / STA $4000 (duty 0, vol 15)
  emit(0xE6, 0x01);                   // INC $01
  const done = code.length;
  emit(0x60);                         // RTS

  // note tables: periods for C4 E4 G4 C5
  const loTab = code.length; emit(0xAB, 0x52, 0x1C, 0xD5);
  const hiTab = code.length; emit(0x01, 0x01, 0x01, 0x00);

  // patch branches (relative to the byte after the branch operand)
  code[bne1 + 1] = done - (bne1 + 2);
  code[beq1 + 1] = done - (beq1 + 2);
  // patch table addresses
  code[loRef + 1] = (LOAD + loTab) & 0xFF; code[loRef + 2] = (LOAD + loTab) >> 8;
  code[hiRef + 1] = (LOAD + hiTab) & 0xFF; code[hiRef + 2] = (LOAD + hiTab) >> 8;

  // ---- NSF header
  const header = new Uint8Array(0x80);
  const magic = "NESM\x1a";
  for (let i = 0; i < 5; i++) header[i] = magic.charCodeAt(i);
  header[5] = 1;  // version
  header[6] = 1;  // songs
  header[7] = 1;  // start song
  header[0x08] = LOAD & 0xFF; header[0x09] = LOAD >> 8;
  header[0x0A] = LOAD & 0xFF; header[0x0B] = LOAD >> 8;           // init
  header[0x0C] = (LOAD + playOff) & 0xFF; header[0x0D] = (LOAD + playOff) >> 8; // play
  const name = "Night Roll test tune";
  for (let i = 0; i < name.length; i++) header[0x0E + i] = name.charCodeAt(i);
  header[0x6E] = 16639 & 0xFF; header[0x6F] = 16639 >> 8; // NTSC play speed

  const out = new Uint8Array(0x80 + code.length);
  out.set(header, 0);
  out.set(code, 0x80);
  return out;
}

// Same 4-note pulse1 phrase, but the index WRAPS instead of stopping: the
// arpeggio cycles C4 E4 G4 C5 forever, never settling on one held register
// state. Exercises the "still live, don't trim" side of the no-loop tail
// rule (tools/nsf/notes.mjs's trimSustainedTail) against a real capture,
// the same way makeTestNSF()'s tune (which DOES stop, holding C5 forever
// after the 4th note) exercises the "held forever, trim it" side.
export function makeTestNSFLoopingArpeggio() {
  const LOAD = 0x8000;
  const code = [];
  const emit = (...bytes) => code.push(...bytes);

  emit(0xA9, 0x0F, 0x8D, 0x15, 0x40); // LDA #$0F / STA $4015
  emit(0xA9, 29, 0x85, 0x00);         // LDA #29  / STA $00 (frame ctr)
  emit(0xA9, 0, 0x85, 0x01);          // LDA #0   / STA $01 (note index)
  emit(0x60);                         // RTS
  const playOff = code.length;

  // ---- play: every 30 frames, advance through the 4-note table, wrapping
  emit(0xE6, 0x00);                   // INC $00
  emit(0xA5, 0x00, 0xC9, 30);        // LDA $00 / CMP #30
  const bne1 = code.length; emit(0xD0, 0x00); // BNE done (patched)
  emit(0xA9, 0, 0x85, 0x00);          // reset frame ctr
  emit(0xA5, 0x01, 0xC9, 4);          // LDA $01 / CMP #4
  const bne2 = code.length; emit(0xD0, 0x00); // BNE cont (patched) — index < 4, keep it
  emit(0xA9, 0, 0x85, 0x01);          // index == 4: wrap to 0
  const cont = code.length;
  emit(0xA5, 0x01, 0xAA);             // LDA $01 / TAX
  const loRef = code.length; emit(0xBD, 0x00, 0x00); // LDA lo,X (patched)
  emit(0x8D, 0x02, 0x40);             // STA $4002
  const hiRef = code.length; emit(0xBD, 0x00, 0x00); // LDA hi,X (patched)
  emit(0x8D, 0x03, 0x40);             // STA $4003
  emit(0xA9, 0x3F, 0x8D, 0x00, 0x40); // LDA #$3F / STA $4000 (duty 0, vol 15)
  emit(0xE6, 0x01);                   // INC $01
  const done = code.length;
  emit(0x60);                         // RTS

  // note tables: periods for C4 E4 G4 C5
  const loTab = code.length; emit(0xAB, 0x52, 0x1C, 0xD5);
  const hiTab = code.length; emit(0x01, 0x01, 0x01, 0x00);

  code[bne1 + 1] = done - (bne1 + 2);
  code[bne2 + 1] = cont - (bne2 + 2);
  code[loRef + 1] = (LOAD + loTab) & 0xFF; code[loRef + 2] = (LOAD + loTab) >> 8;
  code[hiRef + 1] = (LOAD + hiTab) & 0xFF; code[hiRef + 2] = (LOAD + hiTab) >> 8;

  const header = new Uint8Array(0x80);
  const magic = "NESM\x1a";
  for (let i = 0; i < 5; i++) header[i] = magic.charCodeAt(i);
  header[5] = 1; header[6] = 1; header[7] = 1;
  header[0x08] = LOAD & 0xFF; header[0x09] = LOAD >> 8;
  header[0x0A] = LOAD & 0xFF; header[0x0B] = LOAD >> 8;
  header[0x0C] = (LOAD + playOff) & 0xFF; header[0x0D] = (LOAD + playOff) >> 8;
  const name = "Night Roll test tune (looping)";
  for (let i = 0; i < name.length; i++) header[0x0E + i] = name.charCodeAt(i);
  header[0x6E] = 16639 & 0xFF; header[0x6F] = 16639 >> 8;

  const out = new Uint8Array(0x80 + code.length);
  out.set(header, 0);
  out.set(code, 0x80);
  return out;
}

// A pulse1 pad on A4 that never re-triggers ($4003 is written exactly once,
// at init) but whose period gets nudged by 1 unit every 30 frames — real
// vibrato: reconstruct()'s vibrato guard (< 70 cents) keeps it ONE long
// note, while the register log genuinely differs on every such write. This
// is the OTHER "must not cut" case tools/nsf/notes.mjs's trimSustainedTail
// has to respect: not just still-changing pitch (makeTestNSFLoopingArpeggio)
// but a held note whose envelope/vibrato keeps moving right to the end of
// the capture, the way a real driver's pad voice would.
export function makeTestNSFVibratoPad() {
  const LOAD = 0x8000;
  const code = [];
  const emit = (...bytes) => code.push(...bytes);

  emit(0xA9, 0x01, 0x8D, 0x15, 0x40); // LDA #$01 / STA $4015 (pulse1 only)
  emit(0xA9, 29, 0x85, 0x00);         // LDA #29  / STA $00 (frame ctr)
  emit(0xA9, 0, 0x85, 0x01);          // LDA #0   / STA $01 (toggle flag)
  emit(0xA9, 0x3F, 0x8D, 0x00, 0x40); // LDA #$3F / STA $4000 (duty 0, const vol 15) — written ONCE
  emit(0xA9, 0xFD, 0x8D, 0x02, 0x40); // LDA #$FD / STA $4002 (period lo, A4)
  emit(0xA9, 0x00, 0x8D, 0x03, 0x40); // LDA #$00 / STA $4003 (period hi 0 + trigger) — written ONCE
  emit(0x60);                         // RTS
  const playOff = code.length;

  // ---- play: every 30 frames, nudge the period lo by ±1 (vibrato — never
  // rewrites $4003, so this stays the SAME note to reconstruct())
  emit(0xE6, 0x00);                   // INC $00
  emit(0xA5, 0x00, 0xC9, 30);        // LDA $00 / CMP #30
  const bne1 = code.length; emit(0xD0, 0x00); // BNE done (patched)
  emit(0xA9, 0, 0x85, 0x00);          // reset frame ctr
  emit(0xA5, 0x01, 0x49, 0x01, 0x85, 0x01); // LDA $01 / EOR #1 / STA $01 (flip)
  emit(0xAA);                         // TAX
  const tabRef = code.length; emit(0xBD, 0x00, 0x00); // LDA periodTab,X (patched)
  emit(0x8D, 0x02, 0x40);             // STA $4002
  const done = code.length;
  emit(0x60);                         // RTS

  const periodTab = code.length; emit(0xFD, 0xFE); // A4 and one unit sharp — < 70 cents, same note

  code[bne1 + 1] = done - (bne1 + 2);
  code[tabRef + 1] = (LOAD + periodTab) & 0xFF; code[tabRef + 2] = (LOAD + periodTab) >> 8;

  const header = new Uint8Array(0x80);
  const magic = "NESM\x1a";
  for (let i = 0; i < 5; i++) header[i] = magic.charCodeAt(i);
  header[5] = 1; header[6] = 1; header[7] = 1;
  header[0x08] = LOAD & 0xFF; header[0x09] = LOAD >> 8;
  header[0x0A] = LOAD & 0xFF; header[0x0B] = LOAD >> 8;
  header[0x0C] = (LOAD + playOff) & 0xFF; header[0x0D] = (LOAD + playOff) >> 8;
  const name = "Night Roll test tune (vibrato pad)";
  for (let i = 0; i < name.length; i++) header[0x0E + i] = name.charCodeAt(i);
  header[0x6E] = 16639 & 0xFF; header[0x6F] = 16639 >> 8;

  const out = new Uint8Array(0x80 + code.length);
  out.set(header, 0);
  out.set(code, 0x80);
  return out;
}

// DPCM: a banked NSF whose init maps bank 2 into $C000 ($5FFC) and starts the
// longest sample (4081 bytes, ~1 s) there — bytes $FF,$00 alternating, so the delta counter
// climbs 8 steps and falls 8: a 16-bit cycle at rate 15 (54 CPU cycles a
// bit) = 1789773 / 864 ≈ 2071 Hz. The header maps bank 1 (all zeros) at
// $C000, so a render that ignored the bank switch would play a falling
// ramp, then nothing. Play does nothing. Our own bytes, no ROM data.
export function makeTestNSFDpcm() {
  const LOAD = 0x8000, BANK = 0x1000;
  const code = [
    0xA9, 0x02, 0x8D, 0xFC, 0x5F, // LDA #2 / STA $5FFC: bank 2 at $C000
    0xA9, 0x0F, 0x8D, 0x10, 0x40, // $4010 = rate 15, no loop
    0xA9, 0x40, 0x8D, 0x11, 0x40, // $4011 = 64
    0xA9, 0x00, 0x8D, 0x12, 0x40, // $4012 = 0 -> $C000
    0xA9, 0xFF, 0x8D, 0x13, 0x40, // $4013 = 255 -> 4081 bytes, inside the 4 KB bank
    0xA9, 0x1F, 0x8D, 0x15, 0x40, // $4015 = all five channels
    0x60,                         // RTS
  ];
  const playOff = code.length;
  code.push(0x60);
  const data = new Uint8Array(3 * BANK);
  data.set(code, 0);
  for (let i = 0; i < BANK; i++) data[2 * BANK + i] = (i & 1) ? 0x00 : 0xFF;
  const header = new Uint8Array(0x80);
  const magic = "NESM\x1a";
  for (let i = 0; i < 5; i++) header[i] = magic.charCodeAt(i);
  header[5] = 1; header[6] = 1; header[7] = 1;
  header[0x08] = LOAD & 0xFF; header[0x09] = LOAD >> 8;
  header[0x0A] = LOAD & 0xFF; header[0x0B] = LOAD >> 8;
  header[0x0C] = (LOAD + playOff) & 0xFF; header[0x0D] = (LOAD + playOff) >> 8;
  const name = "Night Roll DPCM test";
  for (let i = 0; i < name.length; i++) header[0x0E + i] = name.charCodeAt(i);
  header[0x6E] = 16639 & 0xFF; header[0x6F] = 16639 >> 8;
  header.set([0, 0, 0, 0, 1, 1, 1, 1], 0x70); // $8000-$BFFF bank 0 (code), $C000-$FFFF bank 1 (zeros)
  const out = new Uint8Array(0x80 + data.length);
  out.set(header, 0);
  out.set(data, 0x80);
  return out;
}

// A register script as an NSF: writes = [[frame, addr, value], …] (frame ≥ 1,
// any order), replayed by a hand-assembled play routine — each PLAY call
// performs every write whose frame equals its own 16-bit frame counter, so
// runNSF logs them at exactly those frames. Lets a test state the driver
// behaviour it needs (a vibrato, a duty change, a DPCM trigger) as the
// register writes themselves. Our own bytes, no ROM data.
export function makeScriptNSF(writes, name = "Night Roll script test") {
  const LOAD = 0x8000;
  const code = [];
  const emit = (...bytes) => code.push(...bytes);
  // ---- init: frame counter $00/$01 = 1, table pointer $02/$03 (patched)
  emit(0xA9, 1, 0x85, 0x00, 0xA9, 0, 0x85, 0x01);
  const ptrLo = code.length; emit(0xA9, 0x00, 0x85, 0x02);
  const ptrHi = code.length; emit(0xA9, 0x00, 0x85, 0x03);
  emit(0x60);
  const playOff = code.length;
  // ---- play: while the entry's frame == the counter, STA (addr) value; advance 5
  const loop = code.length;
  emit(0xA0, 0x00, 0xB1, 0x02, 0xC5, 0x00);       // LDY #0 / LDA ($02),Y / CMP $00
  const bne1 = code.length; emit(0xD0, 0x00);
  emit(0xC8, 0xB1, 0x02, 0xC5, 0x01);             // INY / LDA ($02),Y / CMP $01
  const bne2 = code.length; emit(0xD0, 0x00);
  emit(0xC8, 0xB1, 0x02, 0x85, 0x04);             // addr lo -> $04
  emit(0xC8, 0xB1, 0x02, 0x85, 0x05);             // addr hi -> $05
  emit(0xC8, 0xB1, 0x02, 0xA0, 0x00, 0x91, 0x04); // value -> STA ($04),Y
  emit(0x18, 0xA5, 0x02, 0x69, 5, 0x85, 0x02, 0xA5, 0x03, 0x69, 0, 0x85, 0x03); // pointer += 5
  emit(0x4C, (LOAD + loop) & 0xFF, (LOAD + loop) >> 8); // JMP loop
  const done = code.length;
  emit(0xE6, 0x00, 0xD0, 0x02, 0xE6, 0x01, 0x60); // INC $00 / BNE +2 / INC $01 / RTS
  code[bne1 + 1] = done - (bne1 + 2);
  code[bne2 + 1] = done - (bne2 + 2);
  const table = code.length;
  for (const [f, a, v] of [...writes].sort((x, y) => x[0] - y[0])) emit(f & 0xFF, f >> 8, a & 0xFF, a >> 8, v);
  emit(0xFF, 0xFF, 0, 0, 0); // a frame the counter never reaches
  code[ptrLo + 1] = (LOAD + table) & 0xFF;
  code[ptrHi + 1] = (LOAD + table) >> 8;
  const header = new Uint8Array(0x80);
  const magic = "NESM\x1a";
  for (let i = 0; i < 5; i++) header[i] = magic.charCodeAt(i);
  header[5] = 1; header[6] = 1; header[7] = 1;
  header[0x08] = LOAD & 0xFF; header[0x09] = LOAD >> 8;
  header[0x0A] = LOAD & 0xFF; header[0x0B] = LOAD >> 8;
  header[0x0C] = (LOAD + playOff) & 0xFF; header[0x0D] = (LOAD + playOff) >> 8;
  for (let i = 0; i < Math.min(31, name.length); i++) header[0x0E + i] = name.charCodeAt(i);
  header[0x6E] = 16639 & 0xFF; header[0x6F] = 16639 >> 8;
  const out = new Uint8Array(0x80 + code.length);
  out.set(header, 0);
  out.set(code, 0x80);
  return out;
}
