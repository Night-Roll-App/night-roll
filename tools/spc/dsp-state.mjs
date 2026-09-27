// S-DSP voice-state tracker: envelopes and BRR read positions for the 8
// voices, stepped at the 32 kHz output rate — everything the DSP does
// EXCEPT produce audio (no interpolation, mixing, echo or noise LFSR).
// Two consumers share it so they cannot disagree: spc.mjs feeds it live
// so the driver's ENVX/ENDX polls read something real (drivers wait on
// ENDX for one-shot samples and on ENVX for fades), and notes.mjs replays
// the write log through it to find where fading notes become inaudible
// and where one-shot samples run out.
//
// Approximation, deliberate: each voice steps its rate counter from its
// own KON rather than the hardware's shared phase counter, so an envelope
// step can land up to one rate period (≤ 2048 samples = 64 ms at the
// slowest rate, ≤ 1 ms at musical rates) off the real chip's.

export const RATE_PERIOD = [
  0, 2048, 1536, 1280, 1024, 768, 640, 512, 384, 320, 256, 192, 160, 128, 96, 80,
  64, 48, 40, 32, 24, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1,
];
export const ENV_MAX = 0x7FF;
export const OFF = 0, ATTACK = 1, DECAY = 2, SUSTAIN = 3, RELEASE = 4;

export class DspVoices {
  constructor(ram, regs) {
    this.ram = ram;                  // the 64 KB the DSP reads BRR from
    this.regs = regs;                // Uint8Array(128) register shadow (owned by the caller; we update read-only regs in it)
    this.voices = [];
    for (let v = 0; v < 8; v++) this.voices.push({
      v, stage: OFF, env: 0, counter: 0,
      addr: 0, nib: 0, frac: 0,       // current BRR block, sample within it, 12-bit pitch accumulator
      start: 0, loop: 0, srcn: 0,
      konSample: -1, endSample: -1,   // when it was keyed on / ran out (one-shot END) in output samples
    });
    this.sample = 0;
  }

  // Voices already sounding when the dump was taken: ENVX > 0 in the file.
  // Position in the sample is unknowable; we start them at the sample head
  // in sustain at that level — enough for the driver's polls and for
  // notes.mjs to see "sounding since t = 0".
  restoreFromRegs() {
    for (const vc of this.voices) {
      const envx = this.regs[vc.v * 16 + 8] & 0x7F;
      if (!envx) continue;
      const {start, loop} = this.dirEntry(this.regs[vc.v * 16 + 4]);
      Object.assign(vc, {stage: SUSTAIN, env: envx << 4, addr: start, start, loop, nib: 0, frac: 0, counter: 0, konSample: 0});
    }
  }

  dirEntry(srcn) {
    const base = ((this.regs[0x5D] << 8) + srcn * 4) & 0xFFFF;
    const r = this.ram;
    return {start: r[base] | (r[(base + 1) & 0xFFFF] << 8), loop: r[(base + 2) & 0xFFFF] | (r[(base + 3) & 0xFFFF] << 8)};
  }

  keyOn(vc) {
    const srcn = this.regs[vc.v * 16 + 4];
    const {start, loop} = this.dirEntry(srcn);
    Object.assign(vc, {stage: ATTACK, env: 0, counter: 0, addr: start, start, loop, srcn, nib: 0, frac: 0, konSample: this.sample, endSample: -1});
    this.regs[0x7C] &= ~(1 << vc.v); // KON clears the voice's ENDX bit
  }

  // A DSP register write, AFTER the caller stored it in regs. KON/KOFF/FLG
  // have side effects; ENDX write clears; the rest are plain state.
  write(reg, value) {
    if (reg === 0x4C) {          // KON: every set bit is a fresh onset (simplification: no 2-sample latch)
      for (const vc of this.voices) if (value & (1 << vc.v)) this.keyOn(vc);
      return;
    }
    if (reg === 0x6C && (value & 0x80)) { // soft reset: silence everything
      for (const vc of this.voices) { vc.stage = OFF; vc.env = 0; }
      this.regs[0x4C] = 0; this.regs[0x5C] = 0;
      return;
    }
    if (reg === 0x7C) { this.regs[0x7C] = 0; return; } // any write clears ENDX
  }

  envx(v) { return this.voices[v].env >> 4; }
  sounding(v) { return this.voices[v].stage !== OFF; }

  tick() { // one output sample (32 CPU cycles)
    const regs = this.regs, koff = regs[0x5C];
    for (const vc of this.voices) {
      if (vc.stage === OFF) continue;
      const b = vc.v * 16;
      // ---- envelope
      if (koff & (1 << vc.v)) vc.stage = RELEASE; // held in release while the bit stays set
      if (vc.stage === RELEASE) {
        vc.env -= 8;
        if (vc.env <= 0) { vc.env = 0; vc.stage = OFF; }
      } else if (regs[b + 5] & 0x80) { // ADSR
        const adsr1 = regs[b + 5], adsr2 = regs[b + 6];
        if (vc.stage === ATTACK) {
          const rate = ((adsr1 & 0x0F) << 1) | 1;
          if (this.due(vc, rate)) {
            vc.env += rate === 31 ? 1024 : 32;
            if (vc.env >= ENV_MAX) { vc.env = ENV_MAX; vc.stage = DECAY; vc.counter = 0; }
          }
        } else if (vc.stage === DECAY) {
          const rate = ((adsr1 >> 4) & 7) * 2 + 16;
          if (this.due(vc, rate)) vc.env -= ((vc.env - 1) >> 8) + 1;
          if ((vc.env >> 8) <= (adsr2 >> 5)) { vc.stage = SUSTAIN; vc.counter = 0; }
        } else { // SUSTAIN
          const rate = adsr2 & 0x1F;
          if (this.due(vc, rate)) vc.env -= ((vc.env - 1) >> 8) + 1;
        }
      } else { // GAIN
        const g = regs[b + 7];
        if (!(g & 0x80)) vc.env = (g & 0x7F) << 4;
        else if (this.due(vc, g & 0x1F)) {
          switch ((g >> 5) & 3) {
            case 0: vc.env -= 32; break;
            case 1: vc.env -= ((vc.env - 1) >> 8) + 1; break;
            case 2: vc.env += 32; break;
            case 3: vc.env += vc.env < 0x600 ? 32 : 8; break;
          }
        }
        if (vc.stage === ATTACK) vc.stage = SUSTAIN; // GAIN has no ADSR stages; keep "sounding"
      }
      if (vc.env < 0) vc.env = 0;
      if (vc.env > ENV_MAX) vc.env = ENV_MAX;
      regs[b + 8] = vc.env >> 4;
      // ---- sample position (noise voices still advance; harmless)
      const pitch = regs[b + 2] | ((regs[b + 3] & 0x3F) << 8);
      vc.frac += pitch;
      while (vc.frac >= 0x1000) {
        vc.frac -= 0x1000;
        if (++vc.nib === 16) {
          vc.nib = 0;
          const hdr = this.ram[vc.addr];
          if (hdr & 1) {
            regs[0x7C] |= 1 << vc.v;
            if (hdr & 2) vc.addr = vc.loop;
            else { vc.env = 0; vc.stage = OFF; vc.endSample = this.sample; regs[b + 8] = 0; break; }
          } else vc.addr = (vc.addr + 9) & 0xFFFF;
        }
      }
    }
    this.sample++;
  }

  due(vc, rate) { // one envelope step per RATE_PERIOD[rate] samples; rate 0 never
    const p = RATE_PERIOD[rate];
    if (!p) return false;
    if (++vc.counter >= p) { vc.counter = 0; return true; }
    return false;
  }
}
