// Instruction-accurate SPC700 core for SPC playback logging — the SNES twin
// of tools/nsf/cpu6502.mjs. All 256 opcodes (the SPC700 has no illegal
// ones). Cycle counts are the standard per-opcode table so the driver's
// timers tick at the right rate relative to its code; nothing finer — the
// pipeline needs the ORDER and timestamps of DSP writes, not cycle-exact
// audio. Reads/writes go through a bus that owns RAM, I/O ($F0-$FF) and
// the IPL ROM window; the core never touches memory directly.
export class SPC700 {
  constructor(bus) {
    this.bus = bus; // {read(addr) -> byte, write(addr, byte)}
    this.a = 0; this.x = 0; this.y = 0; this.sp = 0xEF; this.pc = 0;
    // PSW bits: N V P B H I Z C
    this.n = 0; this.v = 0; this.p = 0; this.b = 0; this.h = 0; this.i = 0; this.z = 0; this.c = 0;
    this.halted = false; // SLEEP/STOP — no interrupt source in an SPC dump can wake it
    this.cycles = 0;
  }
  psw() { return (this.n << 7) | (this.v << 6) | (this.p << 5) | (this.b << 4) | (this.h << 3) | (this.i << 2) | (this.z << 1) | this.c; }
  setPsw(w) {
    this.n = (w >> 7) & 1; this.v = (w >> 6) & 1; this.p = (w >> 5) & 1; this.b = (w >> 4) & 1;
    this.h = (w >> 3) & 1; this.i = (w >> 2) & 1; this.z = (w >> 1) & 1; this.c = w & 1;
  }

  rd(a) { return this.bus.read(a & 0xFFFF) & 0xFF; }
  wr(a, v) { this.bus.write(a & 0xFFFF, v & 0xFF); }
  rd16(a) { return this.rd(a) | (this.rd(a + 1) << 8); }
  // direct page: P selects $00xx or $01xx; dp+X / dp+1 wrap INSIDE the page
  dp(off) { return (this.p << 8) | (off & 0xFF); }
  rdDp(off) { return this.rd(this.dp(off)); }
  wrDp(off, v) { this.wr(this.dp(off), v); }
  rdDp16(off) { return this.rdDp(off) | (this.rdDp(off + 1) << 8); }
  wrDp16(off, v) { this.wrDp(off, v & 0xFF); this.wrDp(off + 1, v >> 8); }
  imm() { return this.rd(this.pc++); }
  abs() { const a = this.rd16(this.pc); this.pc += 2; return a; }
  push(v) { this.wr(0x100 | this.sp, v); this.sp = (this.sp - 1) & 0xFF; }
  pop() { this.sp = (this.sp + 1) & 0xFF; return this.rd(0x100 | this.sp); }
  nz(v) { v &= 0xFF; this.z = v === 0 ? 1 : 0; this.n = v >> 7; return v; }
  nz16(v) { v &= 0xFFFF; this.z = v === 0 ? 1 : 0; this.n = v >> 15; return v; }

  // operand fetchers for the indirect modes (each consumes its operand bytes)
  indX() { return this.dp(this.imm() + this.x); }                    // [dp+X]: pointer at dp+X
  ptrX() { const o = this.imm() + this.x; return this.rdDp(o) | (this.rdDp(o + 1) << 8); }
  ptrY() { const o = this.imm(); return ((this.rdDp(o) | (this.rdDp(o + 1) << 8)) + this.y) & 0xFFFF; }
  membit() { const w = this.abs(); return {addr: w & 0x1FFF, bit: w >> 13}; }
  rel(cond) { // branch: +2 cycles when taken
    const off = this.imm();
    if (cond) { this.pc = (this.pc + (off < 0x80 ? off : off - 0x100)) & 0xFFFF; this.cycles += 2; }
  }

  // ---- ALU ----------------------------------------------------------------
  adc(a, b) {
    const r = a + b + this.c;
    this.v = (~(a ^ b) & (a ^ r) & 0x80) ? 1 : 0;
    this.h = ((a ^ b ^ r) & 0x10) ? 1 : 0;
    this.c = r > 0xFF ? 1 : 0;
    return this.nz(r);
  }
  sbc(a, b) { return this.adc(a, b ^ 0xFF); }
  cmp(a, b) { const r = a - b; this.c = r >= 0 ? 1 : 0; this.nz(r & 0xFF); }
  or(a, b) { return this.nz(a | b); }
  and(a, b) { return this.nz(a & b); }
  eor(a, b) { return this.nz(a ^ b); }
  asl(v) { this.c = v >> 7; return this.nz(v << 1); }
  lsr(v) { this.c = v & 1; return this.nz(v >> 1); }
  rol(v) { const c = this.c; this.c = v >> 7; return this.nz((v << 1) | c); }
  ror(v) { const c = this.c; this.c = v & 1; return this.nz((v >> 1) | (c << 7)); }
  // read-modify-write on a direct-page offset / absolute address
  rmwDp(off, fn) { const a = this.dp(off); this.wr(a, fn.call(this, this.rd(a))); }
  rmwAbs(a, fn) { this.wr(a, fn.call(this, this.rd(a))); }
  // "A op operand" and "dest op src" shapes shared by the six ALU rows
  aluA(fn, v) { const r = fn.call(this, this.a, v); if (fn !== this.cmp) this.a = r; }
  aluMem(fn, addr, v) { const r = fn.call(this, this.rd(addr), v); if (fn !== this.cmp) this.wr(addr, r); }

  addw(sub) { // ADDW/SUBW YA,dp: 16-bit with N V H Z C (H = half-carry of the high byte)
    const off = this.imm();
    const m = this.rdDp16(off);
    const ya = (this.y << 8) | this.a;
    const b = sub ? (m ^ 0xFFFF) : m;
    this.c = sub ? 1 : 0;
    const r = ya + b + this.c;
    this.v = (~(ya ^ b) & (ya ^ r) & 0x8000) ? 1 : 0;
    this.h = ((ya ^ b ^ r) & 0x1000) ? 1 : 0;
    this.c = r > 0xFFFF ? 1 : 0;
    this.nz16(r);
    this.a = r & 0xFF; this.y = (r >> 8) & 0xFF;
  }
  call(target) { this.push(this.pc >> 8); this.push(this.pc & 0xFF); this.pc = target; }

  step() { // executes one instruction; returns its cycle count (branch-taken bonus included)
    if (this.halted) { this.cycles += 2; return 2; }
    const start = this.cycles;
    const op = this.rd(this.pc++);
    this.cycles += CYCLES[op];
    const ALU = [this.or, this.and, this.eor, this.cmp, this.adc, this.sbc];
    const col = op & 0x0F, row = op >> 4;

    // ---- the regular ALU block: rows 0-B, columns 4-9 (OR AND EOR CMP ADC SBC)
    if (row < 0xC && col >= 4 && col <= 9) {
      const fn = ALU[row >> 1], odd = row & 1;
      switch (col) {
        case 4: this.aluA(fn, this.rdDp(this.imm() + (odd ? this.x : 0))); break;          // A,dp / A,dp+X
        case 5: this.aluA(fn, this.rd(this.abs() + (odd ? this.x : 0))); break;             // A,!abs / A,!abs+X
        case 6: this.aluA(fn, odd ? this.rd(this.abs() + this.y) : this.rdDp(this.x)); break; // A,(X) / A,!abs+Y
        case 7: this.aluA(fn, this.rd(odd ? this.ptrY() : this.ptrX())); break;             // A,[dp+X] / A,[dp]+Y
        case 8: if (odd) { const v = this.imm(); this.aluMem(fn, this.dp(this.imm()), v); }  // dp,#imm (imm byte first)
                else this.aluA(fn, this.imm()); break;                                       // A,#imm
        case 9: if (odd) this.aluMem(fn, this.dp(this.x), this.rdDp(this.y));                // (X),(Y)
                else { const v = this.rdDp(this.imm()); this.aluMem(fn, this.dp(this.imm()), v); } // dp,dp (src first)
                break;
      }
      return this.cycles - start;
    }
    // ---- column 1: TCALL n; column 2: SET1/CLR1; column 3: BBS/BBC (bit = row>>1)
    if (col === 1) { this.call(this.rd16(0xFFDE - 2 * row)); return this.cycles - start; }
    if (col === 2) {
      const bit = 1 << (row >> 1);
      this.rmwDp(this.imm(), v => (row & 1) ? (v & ~bit) : (v | bit));
      return this.cycles - start;
    }
    if (col === 3) {
      const v = this.rdDp(this.imm()), set = (v >> (row >> 1)) & 1;
      this.rel((row & 1) ? !set : set);
      return this.cycles - start;
    }

    switch (op) {
      // ---- column 0: flags and branches
      case 0x00: break; // NOP
      case 0x10: this.rel(!this.n); break;
      case 0x20: this.p = 0; break;
      case 0x30: this.rel(!!this.n); break;
      case 0x40: this.p = 1; break;
      case 0x50: this.rel(!this.v); break;
      case 0x60: this.c = 0; break;
      case 0x70: this.rel(!!this.v); break;
      case 0x80: this.c = 1; break;
      case 0x90: this.rel(!this.c); break;
      case 0xA0: this.i = 1; break; // EI
      case 0xB0: this.rel(!!this.c); break;
      case 0xC0: this.i = 0; break; // DI
      case 0xD0: this.rel(!this.z); break;
      case 0xE0: this.v = 0; this.h = 0; break; // CLRV
      case 0xF0: this.rel(!!this.z); break;

      // ---- rows C-F, columns 4-9: MOV traffic
      case 0xC4: this.wrDp(this.imm(), this.a); break;
      case 0xC5: this.wr(this.abs(), this.a); break;
      case 0xC6: this.wrDp(this.x, this.a); break;
      case 0xC7: this.wr(this.ptrX(), this.a); break;
      case 0xC8: this.cmp(this.x, this.imm()); break;
      case 0xC9: this.wr(this.abs(), this.x); break;
      case 0xD4: this.wrDp(this.imm() + this.x, this.a); break;
      case 0xD5: this.wr(this.abs() + this.x, this.a); break;
      case 0xD6: this.wr(this.abs() + this.y, this.a); break;
      case 0xD7: this.wr(this.ptrY(), this.a); break;
      case 0xD8: this.wrDp(this.imm(), this.x); break;
      case 0xD9: this.wrDp(this.imm() + this.y, this.x); break;
      case 0xE4: this.a = this.nz(this.rdDp(this.imm())); break;
      case 0xE5: this.a = this.nz(this.rd(this.abs())); break;
      case 0xE6: this.a = this.nz(this.rdDp(this.x)); break;
      case 0xE7: this.a = this.nz(this.rd(this.ptrX())); break;
      case 0xE8: this.a = this.nz(this.imm()); break;
      case 0xE9: this.x = this.nz(this.rd(this.abs())); break;
      case 0xF4: this.a = this.nz(this.rdDp(this.imm() + this.x)); break;
      case 0xF5: this.a = this.nz(this.rd(this.abs() + this.x)); break;
      case 0xF6: this.a = this.nz(this.rd(this.abs() + this.y)); break;
      case 0xF7: this.a = this.nz(this.rd(this.ptrY())); break;
      case 0xF8: this.x = this.nz(this.rdDp(this.imm())); break;
      case 0xF9: this.x = this.nz(this.rdDp(this.imm() + this.y)); break;

      // ---- column A: carry-bit ops and word ops
      case 0x0A: { const {addr, bit} = this.membit(); this.c |= (this.rd(addr) >> bit) & 1; break; }   // OR1 C,m.b
      case 0x2A: { const {addr, bit} = this.membit(); this.c |= ((this.rd(addr) >> bit) & 1) ^ 1; break; } // OR1 C,/m.b
      case 0x4A: { const {addr, bit} = this.membit(); this.c &= (this.rd(addr) >> bit) & 1; break; }   // AND1
      case 0x6A: { const {addr, bit} = this.membit(); this.c &= ((this.rd(addr) >> bit) & 1) ^ 1; break; } // AND1 /
      case 0x8A: { const {addr, bit} = this.membit(); this.c ^= (this.rd(addr) >> bit) & 1; break; }   // EOR1
      case 0xAA: { const {addr, bit} = this.membit(); this.c = (this.rd(addr) >> bit) & 1; break; }    // MOV1 C,m.b
      case 0xCA: { const {addr, bit} = this.membit(); const v = this.rd(addr);                         // MOV1 m.b,C
                   this.wr(addr, this.c ? (v | (1 << bit)) : (v & ~(1 << bit))); break; }
      case 0xEA: { const {addr, bit} = this.membit(); this.wr(addr, this.rd(addr) ^ (1 << bit)); break; } // NOT1
      case 0x1A: { const o = this.imm(); this.wrDp16(o, this.nz16(this.rdDp16(o) - 1)); break; } // DECW
      case 0x3A: { const o = this.imm(); this.wrDp16(o, this.nz16(this.rdDp16(o) + 1)); break; } // INCW
      case 0x5A: { const m = this.rdDp16(this.imm()); const ya = (this.y << 8) | this.a;        // CMPW YA,dp
                   const r = ya - m; this.c = r >= 0 ? 1 : 0; this.nz16(r); break; }
      case 0x7A: this.addw(false); break;
      case 0x9A: this.addw(true); break;
      case 0xBA: { const m = this.nz16(this.rdDp16(this.imm())); this.a = m & 0xFF; this.y = m >> 8; break; } // MOVW YA,dp
      case 0xDA: this.wrDp16(this.imm(), (this.y << 8) | this.a); break;                          // MOVW dp,YA
      case 0xFA: { const v = this.rdDp(this.imm()); this.wrDp(this.imm(), v); break; }           // MOV dp,dp

      // ---- column B: shifts / inc / dec on dp, dp+X; MOV Y traffic
      case 0x0B: this.rmwDp(this.imm(), this.asl); break;
      case 0x1B: this.rmwDp(this.imm() + this.x, this.asl); break;
      case 0x2B: this.rmwDp(this.imm(), this.rol); break;
      case 0x3B: this.rmwDp(this.imm() + this.x, this.rol); break;
      case 0x4B: this.rmwDp(this.imm(), this.lsr); break;
      case 0x5B: this.rmwDp(this.imm() + this.x, this.lsr); break;
      case 0x6B: this.rmwDp(this.imm(), this.ror); break;
      case 0x7B: this.rmwDp(this.imm() + this.x, this.ror); break;
      case 0x8B: this.rmwDp(this.imm(), v => this.nz(v - 1)); break;
      case 0x9B: this.rmwDp(this.imm() + this.x, v => this.nz(v - 1)); break;
      case 0xAB: this.rmwDp(this.imm(), v => this.nz(v + 1)); break;
      case 0xBB: this.rmwDp(this.imm() + this.x, v => this.nz(v + 1)); break;
      case 0xCB: this.wrDp(this.imm(), this.y); break;
      case 0xDB: this.wrDp(this.imm() + this.x, this.y); break;
      case 0xEB: this.y = this.nz(this.rdDp(this.imm())); break;
      case 0xFB: this.y = this.nz(this.rdDp(this.imm() + this.x)); break;

      // ---- column C: shifts / inc / dec on !abs and A; MOV Y,!abs
      case 0x0C: this.rmwAbs(this.abs(), this.asl); break;
      case 0x1C: this.a = this.asl(this.a); break;
      case 0x2C: this.rmwAbs(this.abs(), this.rol); break;
      case 0x3C: this.a = this.rol(this.a); break;
      case 0x4C: this.rmwAbs(this.abs(), this.lsr); break;
      case 0x5C: this.a = this.lsr(this.a); break;
      case 0x6C: this.rmwAbs(this.abs(), this.ror); break;
      case 0x7C: this.a = this.ror(this.a); break;
      case 0x8C: this.rmwAbs(this.abs(), v => this.nz(v - 1)); break;
      case 0x9C: this.a = this.nz(this.a - 1); break;
      case 0xAC: this.rmwAbs(this.abs(), v => this.nz(v + 1)); break;
      case 0xBC: this.a = this.nz(this.a + 1); break;
      case 0xCC: this.wr(this.abs(), this.y); break;
      case 0xDC: this.y = this.nz(this.y - 1); break;
      case 0xEC: this.y = this.nz(this.rd(this.abs())); break;
      case 0xFC: this.y = this.nz(this.y + 1); break;

      // ---- column D: stack, register moves
      case 0x0D: this.push(this.psw()); break;
      case 0x1D: this.x = this.nz(this.x - 1); break;
      case 0x2D: this.push(this.a); break;
      case 0x3D: this.x = this.nz(this.x + 1); break;
      case 0x4D: this.push(this.x); break;
      case 0x5D: this.x = this.nz(this.a); break;
      case 0x6D: this.push(this.y); break;
      case 0x7D: this.a = this.nz(this.x); break;
      case 0x8D: this.y = this.nz(this.imm()); break;
      case 0x9D: this.x = this.nz(this.sp); break;
      case 0xAD: this.cmp(this.y, this.imm()); break;
      case 0xBD: this.sp = this.x; break;
      case 0xCD: this.x = this.nz(this.imm()); break;
      case 0xDD: this.a = this.nz(this.y); break;
      case 0xED: this.c ^= 1; break; // NOTC
      case 0xFD: this.y = this.nz(this.a); break;

      // ---- column E: TSET1/TCLR1, CMP X/Y, CBNE, DBNZ, POP, DIV, DAS
      case 0x0E: { const a = this.abs(), v = this.rd(a); this.nz(this.a - v); this.wr(a, v | this.a); break; }
      case 0x1E: this.cmp(this.x, this.rd(this.abs())); break;
      case 0x2E: { const v = this.rdDp(this.imm()); this.rel(this.a !== v); break; }           // CBNE dp,rel
      case 0x3E: this.cmp(this.x, this.rdDp(this.imm())); break;
      case 0x4E: { const a = this.abs(), v = this.rd(a); this.nz(this.a - v); this.wr(a, v & ~this.a); break; }
      case 0x5E: this.cmp(this.y, this.rd(this.abs())); break;
      case 0x6E: { const o = this.imm(), v = (this.rdDp(o) - 1) & 0xFF; this.wrDp(o, v); this.rel(v !== 0); break; } // DBNZ dp
      case 0x7E: this.cmp(this.y, this.rdDp(this.imm())); break;
      case 0x8E: this.setPsw(this.pop()); break;
      case 0x9E: { // DIV YA,X — the hardware's overflow path when Y >= X (blargg's formulation)
        const ya = (this.y << 8) | this.a, x = this.x;
        this.h = ((this.y & 15) >= (x & 15)) ? 1 : 0;
        this.v = this.y >= x ? 1 : 0;
        if (this.y < (x << 1)) {
          this.a = Math.floor(ya / x) & 0xFF; this.y = (ya - Math.floor(ya / x) * x) & 0xFF;
        } else {
          this.a = (255 - Math.floor((ya - (x << 9)) / (256 - x))) & 0xFF;
          this.y = (x + ((ya - (x << 9)) % (256 - x))) & 0xFF;
        }
        this.nz(this.a); break;
      }
      case 0xAE: this.a = this.pop(); break;
      case 0xBE: { // DAS
        if (!this.c || this.a > 0x99) { this.a = (this.a - 0x60) & 0xFF; this.c = 0; }
        if (!this.h || (this.a & 15) > 9) this.a = (this.a - 6) & 0xFF;
        this.nz(this.a); break;
      }
      case 0xCE: this.x = this.pop(); break;
      case 0xDE: { const v = this.rdDp(this.imm() + this.x); this.rel(this.a !== v); break; } // CBNE dp+X,rel
      case 0xEE: this.y = this.pop(); break;
      case 0xFE: this.y = (this.y - 1) & 0xFF; this.rel(this.y !== 0); break;               // DBNZ Y,rel

      // ---- column F: control flow, misc
      case 0x0F: { // BRK: push PC, PSW; B=1, I=0; vector $FFDE
        this.push(this.pc >> 8); this.push(this.pc & 0xFF); this.push(this.psw());
        this.b = 1; this.i = 0; this.pc = this.rd16(0xFFDE); break;
      }
      case 0x1F: this.pc = this.rd16((this.abs() + this.x) & 0xFFFF); break;                 // JMP [!abs+X]
      case 0x2F: this.rel(true); break;                                                      // BRA
      case 0x3F: this.call(this.abs()); break;                                               // CALL
      case 0x4F: this.call(0xFF00 | this.imm()); break;                                      // PCALL
      case 0x5F: this.pc = this.abs(); break;                                                // JMP !abs
      case 0x6F: { const lo = this.pop(); this.pc = lo | (this.pop() << 8); break; }         // RET
      case 0x7F: { this.setPsw(this.pop()); const lo = this.pop(); this.pc = lo | (this.pop() << 8); break; } // RET1
      case 0x8F: { const v = this.imm(); this.wrDp(this.imm(), v); break; }                  // MOV dp,#imm
      case 0x9F: this.a = this.nz(((this.a << 4) | (this.a >> 4)) & 0xFF); break;           // XCN
      case 0xAF: this.wrDp(this.x, this.a); this.x = (this.x + 1) & 0xFF; break;             // MOV (X)+,A
      case 0xBF: this.a = this.nz(this.rdDp(this.x)); this.x = (this.x + 1) & 0xFF; break;   // MOV A,(X)+
      case 0xCF: { const r = this.y * this.a; this.a = r & 0xFF; this.y = this.nz(r >> 8); break; } // MUL YA (N/Z on Y)
      case 0xDF: { // DAA
        if (this.c || this.a > 0x99) { this.a = (this.a + 0x60) & 0xFF; this.c = 1; }
        if (this.h || (this.a & 15) > 9) this.a = (this.a + 6) & 0xFF;
        this.nz(this.a); break;
      }
      case 0xEF: case 0xFF: this.halted = true; break; // SLEEP / STOP
      default:
        throw new Error("SPC700: unhandled opcode $" + op.toString(16) + " at $" + (this.pc - 1).toString(16));
    }
    return this.cycles - start;
  }
}

// Base cycle count per opcode (branch-taken +2 is added in rel()).
export const CYCLES = [
  2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 4, 6, 8,
  2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 6, 5, 2, 2, 4, 6,
  2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 4, 5, 4,
  2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 6, 5, 2, 2, 3, 8,
  2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 4, 6, 6,
  2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 4, 5, 2, 2, 4, 3,
  2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 4, 5, 5,
  2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 3, 6,
  2, 8, 4, 5, 3, 4, 3, 6, 2, 6, 5, 4, 5, 2, 4, 5,
  2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 12, 5,
  3, 8, 4, 5, 3, 4, 3, 6, 2, 6, 4, 4, 5, 2, 4, 4,
  2, 8, 4, 5, 4, 5, 5, 6, 5, 5, 5, 5, 2, 2, 3, 4,
  3, 8, 4, 5, 4, 5, 4, 7, 2, 5, 6, 4, 5, 2, 4, 9,
  2, 8, 4, 5, 5, 6, 6, 7, 4, 5, 5, 5, 2, 2, 6, 3,
  2, 8, 4, 5, 3, 4, 3, 6, 2, 4, 5, 3, 4, 3, 4, 3,
  2, 8, 4, 5, 4, 5, 5, 6, 3, 4, 5, 4, 2, 2, 4, 3,
];
