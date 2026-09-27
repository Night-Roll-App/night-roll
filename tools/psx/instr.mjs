// FF7's INSTR.DAT — the AKAO driver's instrument table, 64 bytes per slot:
//   u32 SPU sample address, u32 loop address,
//   u8 ar, dr, sl, sr, rr, a_mode, s_mode, r_mode   (the SPU ADSR, unpacked),
//   12 × u32 base pitch (0x1000 = the sample at 44100 Hz), one per degree.
// It sits in the psflib's text (RESEARCH.md "Where the data sits in a PSF");
// no header names it, so it is found by shape: a run of records whose
// sample addresses fit SPU RAM and whose base pitches look like pitches.
// What the app takes from it: the ENVELOPE — how a held note's level falls
// while the key is down — so a bell rings and fades and a pad sustains,
// each as its instrument says (Josh, 2026-09-27: "why isn't it looking at
// the instrument table?"). Envelope math follows the SPU as psx-spx states
// it: a rate r is shift = r >> 2, step = r & 3; the envelope moves every
// 1 << max(0, shift − 11) samples by (step-derived) << max(0, 11 − shift);
// exponential decrease scales the step by level / 0x8000. Attack is taken
// as instant (FF7's table has ar = 0 throughout), release is after the key.
export const INSTR_STRIDE = 64;
const SPU_RAM = 0x80000;

function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }
function plausibleRecord(d, o) {
  if (o + INSTR_STRIDE > d.length) return false;
  const a = u32(d, o), l = u32(d, o + 4);
  if (a >= SPU_RAM || l >= SPU_RAM || (a & 7)) return false;
  for (let i = 0; i < 12; i++) { const p = u32(d, o + 16 + i * 4); if (p < 0x200 || p > 0x8000) return false; }
  return true; // all twelve base pitches in range: a record read 16 bytes early fails on the ADSR words
}
// -> {offset, count} of the first table-shaped run (≥ 16 plausible records
// in a row), or null. count is the run length; slots may be empty later.
export function findInstrDat(ram, {minRun = 16, maxSlots = 128} = {}) {
  const d = new Uint8Array(ram);
  for (let o = 0; o + INSTR_STRIDE <= d.length; o += 16) {
    if (!plausibleRecord(d, o)) continue;
    let n = 0;
    while (n < maxSlots && plausibleRecord(d, o + n * INSTR_STRIDE)) n++;
    if (n >= minRun) return {offset: o, count: n};
    o += Math.max(0, n * INSTR_STRIDE - 16);
  }
  return null;
}
// one slot -> {addr, loop, ar, dr, sl, sr, rr, am, sm, rm, pitches} or null when empty
export function readInstr(ram, tableOffset, slot) {
  const d = new Uint8Array(ram), o = tableOffset + slot * INSTR_STRIDE;
  if (o + INSTR_STRIDE > d.length) return null;
  const addr = u32(d, o);
  if (!addr && !u32(d, o + 16)) return null;
  const pitches = []; for (let i = 0; i < 12; i++) pitches.push(u32(d, o + 16 + i * 4));
  return {slot, addr, loop: u32(d, o + 4), ar: d[o + 8], dr: d[o + 9], sl: d[o + 10], sr: d[o + 11], rr: d[o + 12], am: d[o + 13], sm: d[o + 14], rm: d[o + 15], pitches};
}
const SAMPLE_RATE = 44100;
// level fraction (0..1 of the peak) `seconds` after key-on, key still held
export function envelopeAt(rec, seconds) {
  if (!rec) return 1;
  let level = 0x7FFF, t = 0;
  // decay: exponential decrease from the peak to the sustain level
  const target = Math.min(0x7FFF, (rec.sl + 1) * 0x800 - 1);
  if (target < level) {
    const shift = rec.dr & 15, cyc = 1 << Math.max(0, shift - 11), step = -8 << Math.max(0, 11 - shift);
    const k = step / 0x8000 * (SAMPLE_RATE / cyc); // per-second exponent (continuous form of the per-cycle step × level / 0x8000)
    const tDecay = k ? Math.log(target / level) / k : 0;
    if (tDecay >= seconds) return Math.exp(k * seconds);
    t = tDecay; level = target;
  }
  // sustain: mode bit1 = decrease, bit0 = exponential (psx-spx: 2 = linear dec, 3 = exp dec)
  const decrease = !!(rec.sm & 2), exponential = !!(rec.sm & 1);
  if (!decrease || rec.sr >= 0x7F) return level / 0x7FFF;
  const shift = rec.sr >> 2, stepBits = rec.sr & 3, cyc = 1 << Math.max(0, shift - 11);
  const step = (-8 + stepBits) << Math.max(0, 11 - shift);
  const rem = seconds - t;
  let frac;
  if (exponential) frac = Math.exp(step / 0x8000 * (SAMPLE_RATE / cyc) * rem);
  else frac = Math.max(0, 1 + step * (SAMPLE_RATE / cyc) * rem / level);
  return Math.max(0, Math.min(1, level / 0x7FFF * frac));
}
