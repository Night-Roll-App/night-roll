// Minimal instruction-accurate Sharp SM83 (Game Boy CPU, "LR35902") core for
// GBS playback logging — the sibling of tools/nsf/cpu6502.mjs. All official
// opcodes including the CB page; the eleven unused opcodes throw. Cycle
// counts are the opcode table's T-states, kept only so the register log has
// sub-frame timestamps (the APU's 512 Hz frame sequencer sits between
// writes) and DIV advances plausibly; nothing here is cycle-exact.
//
// Interrupts are tracked (IME, EI delay, RETI) but never dispatched: a GBS
// player calls PLAY itself at the header's rate, so no interrupt ever needs
// to fire. HALT/STOP therefore have nothing to wait for and halt the core,
// which the driver reads as "this call is over" — cpu6502.mjs's BRK rule.
//
// Register encodings (Pan Docs / gbdev optable): 8-bit index B C D E H L
// (HL) A = 0..7; 16-bit BC DE HL SP (AF replaces SP in PUSH/POP). The
// $40-$BF block and the whole CB page decode by field, not by case.
const FZ = 0x80, FN = 0x40, FH = 0x20, FC = 0x10;

// T-state cost per opcode (untaken branch cost for conditionals; the taken
// extra is added in place). Rows are the 16 x 16 opcode grid.
const CYC = [
  4,12, 8, 8, 4, 4, 8, 4,20, 8, 8, 8, 4, 4, 8, 4,
  4,12, 8, 8, 4, 4, 8, 4,12, 8, 8, 8, 4, 4, 8, 4,
  8,12, 8, 8, 4, 4, 8, 4, 8, 8, 8, 8, 4, 4, 8, 4,
  8,12, 8, 8,12,12,12, 4, 8, 8, 8, 8, 4, 4, 8, 4,
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4,
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4,
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4,
  8, 8, 8, 8, 8, 8, 4, 8, 4, 4, 4, 4, 4, 4, 8, 4,
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4,
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4,
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4,
  4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 8, 4,
  8,12,12,16,12,16, 8,16, 8,16,12, 0,12,24, 8,16, // $CB: cb() supplies the cost
  8,12,12, 0,12,16, 8,16, 8,16,12, 0,12, 0, 8,16,
 12,12, 8, 0, 0,16, 8,16,16, 4,16, 0, 0, 0, 8,16,
 12,12, 8, 4, 0,16, 8,16,12, 8,16, 4, 0, 0, 8,16,
];

export class SM83 {
  constructor(bus) {
    this.bus = bus; // {read(addr) -> byte, write(addr, byte)}
    this.a = 0; this.f = 0;
    this.b = 0; this.c = 0; this.d = 0; this.e = 0; this.h = 0; this.l = 0;
    this.sp = 0xFFFE; this.pc = 0;
    this.ime = false; this.eiPending = false;
    this.halted = false;
    this.cycles = 0;   // T-states since construction (DIV = cycles >> 8)
    this.rstBase = 0;  // GBS relocates RST vectors to the load address
  }
  get bc() { return (this.b << 8) | this.c; } set bc(v) { this.b = (v >> 8) & 0xFF; this.c = v & 0xFF; }
  get de() { return (this.d << 8) | this.e; } set de(v) { this.d = (v >> 8) & 0xFF; this.e = v & 0xFF; }
  get hl() { return (this.h << 8) | this.l; } set hl(v) { this.h = (v >> 8) & 0xFF; this.l = v & 0xFF; }
  get af() { return (this.a << 8) | this.f; } set af(v) { this.a = (v >> 8) & 0xFF; this.f = v & 0xF0; } // low nibble of F is wired to 0
  get zf() { return (this.f & FZ) !== 0; }
  get cf() { return (this.f & FC) ? 1 : 0; }
  setF(z, n, h, c) { this.f = (z ? FZ : 0) | (n ? FN : 0) | (h ? FH : 0) | (c ? FC : 0); }

  rd(a) { return this.bus.read(a & 0xFFFF) & 0xFF; }
  wr(a, v) { this.bus.write(a & 0xFFFF, v & 0xFF); }
  rd16(a) { return this.rd(a) | (this.rd(a + 1) << 8); }
  imm8() { return this.rd(this.pc++); }
  imm16() { const v = this.rd16(this.pc); this.pc = (this.pc + 2) & 0xFFFF; return v; }
  rel() { const v = this.imm8(); return v < 0x80 ? v : v - 0x100; }
  push16(v) { this.sp = (this.sp - 1) & 0xFFFF; this.wr(this.sp, v >> 8); this.sp = (this.sp - 1) & 0xFFFF; this.wr(this.sp, v & 0xFF); }
  pop16() { const lo = this.rd(this.sp); this.sp = (this.sp + 1) & 0xFFFF; const hi = this.rd(this.sp); this.sp = (this.sp + 1) & 0xFFFF; return (hi << 8) | lo; }

  // 8-bit register file by encoding index; 6 is memory at HL
  r8(i) {
    switch (i) {
      case 0: return this.b; case 1: return this.c; case 2: return this.d; case 3: return this.e;
      case 4: return this.h; case 5: return this.l; case 6: return this.rd(this.hl); default: return this.a;
    }
  }
  w8(i, v) {
    v &= 0xFF;
    switch (i) {
      case 0: this.b = v; break; case 1: this.c = v; break; case 2: this.d = v; break; case 3: this.e = v; break;
      case 4: this.h = v; break; case 5: this.l = v; break; case 6: this.wr(this.hl, v); break; default: this.a = v;
    }
  }
  rp(i) { return i === 0 ? this.bc : i === 1 ? this.de : i === 2 ? this.hl : this.sp; }
  setRp(i, v) { v &= 0xFFFF; if (i === 0) this.bc = v; else if (i === 1) this.de = v; else if (i === 2) this.hl = v; else this.sp = v; }
  cond(i) { // NZ Z NC C
    switch (i) { case 0: return !this.zf; case 1: return this.zf; case 2: return !this.cf; default: return !!this.cf; }
  }

  // ---- ALU (flags per RGBDS gbz80(7))
  alu(op, v) {
    const a = this.a, c = this.cf;
    switch (op) {
      case 0: { const r = a + v; this.setF((r & 0xFF) === 0, 0, (a & 0xF) + (v & 0xF) > 0xF, r > 0xFF); this.a = r & 0xFF; break; }           // ADD
      case 1: { const r = a + v + c; this.setF((r & 0xFF) === 0, 0, (a & 0xF) + (v & 0xF) + c > 0xF, r > 0xFF); this.a = r & 0xFF; break; } // ADC
      case 2: { const r = a - v; this.setF((r & 0xFF) === 0, 1, (a & 0xF) < (v & 0xF), r < 0); this.a = r & 0xFF; break; }                 // SUB
      case 3: { const r = a - v - c; this.setF((r & 0xFF) === 0, 1, (a & 0xF) < (v & 0xF) + c, r < 0); this.a = r & 0xFF; break; }         // SBC
      case 4: this.a = a & v; this.setF(this.a === 0, 0, 1, 0); break;                                                                    // AND
      case 5: this.a = a ^ v; this.setF(this.a === 0, 0, 0, 0); break;                                                                    // XOR
      case 6: this.a = a | v; this.setF(this.a === 0, 0, 0, 0); break;                                                                    // OR
      default: { const r = a - v; this.setF((r & 0xFF) === 0, 1, (a & 0xF) < (v & 0xF), r < 0); break; }                                  // CP
    }
  }
  inc8(v) { const r = (v + 1) & 0xFF; this.f = (this.f & FC) | (r === 0 ? FZ : 0) | ((v & 0xF) === 0xF ? FH : 0); return r; }
  dec8(v) { const r = (v - 1) & 0xFF; this.f = (this.f & FC) | FN | (r === 0 ? FZ : 0) | ((v & 0xF) === 0 ? FH : 0); return r; }
  addHL(v) {
    const hl = this.hl, r = hl + v;
    this.f = (this.f & FZ) | (((hl & 0xFFF) + (v & 0xFFF)) > 0xFFF ? FH : 0) | (r > 0xFFFF ? FC : 0);
    this.hl = r & 0xFFFF;
  }
  spPlusE() { // ADD SP,e / LD HL,SP+e: flags from the unsigned low-byte add, Z always 0
    const e = this.rel(), sp = this.sp, u = e & 0xFF;
    this.setF(0, 0, (sp & 0xF) + (u & 0xF) > 0xF, (sp & 0xFF) + u > 0xFF);
    return (sp + e) & 0xFFFF;
  }
  daa() {
    let a = this.a, adj = 0, c = this.cf;
    const n = (this.f & FN) !== 0, h = (this.f & FH) !== 0;
    if (n) {
      if (h) adj |= 0x06;
      if (c) adj |= 0x60;
      a = (a - adj) & 0xFF;
    } else {
      if (h || (a & 0xF) > 9) adj |= 0x06;
      if (c || a > 0x99) { adj |= 0x60; c = 1; }
      a = (a + adj) & 0xFF;
    }
    this.a = a;
    this.setF(a === 0, n, 0, c);
  }
  // CB page rotates/shifts (Z from result) and the four accumulator rotates (Z cleared)
  rot(op, v) {
    let c = this.cf, r;
    switch (op) {
      case 0: c = v >> 7; r = ((v << 1) | c) & 0xFF; break;          // RLC
      case 1: c = v & 1; r = (v >> 1) | (c << 7); break;             // RRC
      case 2: r = ((v << 1) | c) & 0xFF; c = v >> 7; break;          // RL
      case 3: r = (v >> 1) | (c << 7); c = v & 1; break;             // RR
      case 4: c = v >> 7; r = (v << 1) & 0xFF; break;                // SLA
      case 5: c = v & 1; r = (v >> 1) | (v & 0x80); break;           // SRA
      case 6: c = 0; r = ((v << 4) | (v >> 4)) & 0xFF; break;        // SWAP
      default: c = v & 1; r = v >> 1; break;                         // SRL
    }
    this.setF(r === 0, 0, 0, c);
    return r;
  }

  call(target) { this.push16(this.pc); this.pc = target; }

  // Interrupt entry, for completeness (the GBS driver never calls it):
  // vectors $40 $48 $50 $58 $60 for VBlank, STAT, Timer, Serial, Joypad.
  interrupt(vector) { this.ime = false; this.halted = false; this.call(vector); this.cycles += 20; }

  step() { // executes one instruction; returns its T-state cost
    if (this.halted) { this.cycles += 4; return 4; }
    const enable = this.eiPending; // EI takes effect after the instruction that follows it
    const op = this.imm8();
    let cyc = CYC[op];
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
    switch (x) {
      case 0:
        switch (z) {
          case 0:
            if (y === 0) break;                                                    // NOP
            if (y === 1) { const a = this.imm16(); this.wr(a, this.sp & 0xFF); this.wr(a + 1, this.sp >> 8); break; } // LD (a16),SP
            if (y === 2) { this.halted = true; this.pc++; break; }                  // STOP (skips its padding byte)
            if (y === 3) { this.pc = (this.pc + this.rel()) & 0xFFFF; break; }      // JR e
            { const e = this.rel(); if (this.cond(y - 4)) { this.pc = (this.pc + e) & 0xFFFF; cyc += 4; } break; } // JR cc,e
          case 1:
            if (q === 0) this.setRp(p, this.imm16());                              // LD rp,d16
            else this.addHL(this.rp(p));                                           // ADD HL,rp
            break;
          case 2: {
            const addr = p === 0 ? this.bc : p === 1 ? this.de : this.hl;
            if (q === 0) this.wr(addr, this.a); else this.a = this.rd(addr);       // LD (rp),A / LD A,(rp), rp = BC DE HL+ HL-
            if (p === 2) this.hl = (this.hl + 1) & 0xFFFF;
            else if (p === 3) this.hl = (this.hl - 1) & 0xFFFF;
            break;
          }
          case 3: this.setRp(p, this.rp(p) + (q === 0 ? 1 : -1)); break;           // INC/DEC rp
          case 4: this.w8(y, this.inc8(this.r8(y))); break;                        // INC r
          case 5: this.w8(y, this.dec8(this.r8(y))); break;                        // DEC r
          case 6: this.w8(y, this.imm8()); break;                                  // LD r,d8
          default:
            switch (y) {
              case 0: case 1: case 2: case 3: this.a = this.rot(y, this.a); this.f &= FC; break; // RLCA RRCA RLA RRA: Z N H cleared
              case 4: this.daa(); break;
              case 5: this.a ^= 0xFF; this.f |= FN | FH; break;                     // CPL
              case 6: this.f = (this.f & FZ) | FC; break;                           // SCF
              default: this.f = (this.f & FZ) | ((this.f & FC) ^ FC); break;        // CCF
            }
        }
        break;
      case 1:
        if (op === 0x76) { this.halted = true; break; }                            // HALT
        this.w8(y, this.r8(z));                                                    // LD r,r'
        break;
      case 2: this.alu(y, this.r8(z)); break;                                      // ALU A,r
      default:
        switch (z) {
          case 0:
            if (y < 4) { if (this.cond(y)) { this.pc = this.pop16(); cyc += 12; } break; } // RET cc
            if (y === 4) { this.wr(0xFF00 + this.imm8(), this.a); break; }         // LDH (a8),A
            if (y === 5) { this.sp = this.spPlusE(); break; }                      // ADD SP,e
            if (y === 6) { this.a = this.rd(0xFF00 + this.imm8()); break; }        // LDH A,(a8)
            this.hl = this.spPlusE(); break;                                       // LD HL,SP+e
          case 1:
            if (q === 0) { const v = this.pop16(); if (p === 3) this.af = v; else this.setRp(p, v); break; } // POP rp2
            if (p === 0) { this.pc = this.pop16(); break; }                        // RET
            if (p === 1) { this.pc = this.pop16(); this.ime = true; break; }       // RETI
            if (p === 2) { this.pc = this.hl; break; }                             // JP HL
            this.sp = this.hl; break;                                              // LD SP,HL
          case 2:
            if (y < 4) { const a = this.imm16(); if (this.cond(y)) { this.pc = a; cyc += 4; } break; } // JP cc,a16
            if (y === 4) { this.wr(0xFF00 + this.c, this.a); break; }              // LD (C),A
            if (y === 5) { this.wr(this.imm16(), this.a); break; }                 // LD (a16),A
            if (y === 6) { this.a = this.rd(0xFF00 + this.c); break; }             // LD A,(C)
            this.a = this.rd(this.imm16()); break;                                 // LD A,(a16)
          case 3:
            if (y === 0) { this.pc = this.imm16(); break; }                        // JP a16
            if (y === 1) { cyc += this.cb(); break; }                              // CB prefix
            if (y === 6) { this.ime = false; this.eiPending = false; break; }      // DI
            if (y === 7) { this.eiPending = true; break; }                         // EI
            this.illegal(op);
            break;
          case 4:
            if (y < 4) { const a = this.imm16(); if (this.cond(y)) { this.call(a); cyc += 12; } break; } // CALL cc,a16
            this.illegal(op);
            break;
          case 5:
            if (q === 0) { this.push16(p === 3 ? this.af : this.rp(p)); break; }   // PUSH rp2
            if (p === 0) { this.call(this.imm16()); break; }                       // CALL a16
            this.illegal(op);
            break;
          case 6: this.alu(y, this.imm8()); break;                                 // ALU A,d8
          default: this.call((this.rstBase + y * 8) & 0xFFFF); break;              // RST — relocated for GBS
        }
    }
    if (enable && this.eiPending) { this.ime = true; this.eiPending = false; }
    this.cycles += cyc;
    return cyc;
  }
  cb() { // returns the T-state cost of the CB-prefixed instruction
    const op = this.imm8();
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
    const v = this.r8(z);
    switch (x) {
      case 0: this.w8(z, this.rot(y, v)); break;                                              // RLC..SRL
      case 1: this.f = (this.f & FC) | FH | ((v >> y) & 1 ? 0 : FZ); return z === 6 ? 12 : 8; // BIT b,r
      case 2: this.w8(z, v & ~(1 << y)); break;                                                // RES b,r
      default: this.w8(z, v | (1 << y)); break;                                                // SET b,r
    }
    return z === 6 ? 16 : 8;
  }
  illegal(op) {
    throw new Error("illegal opcode $" + op.toString(16) + " at $" + ((this.pc - 1) & 0xFFFF).toString(16));
  }
}
