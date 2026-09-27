// PlayStation captures with the console's own sound: the driver's samples
// (INSTR.ALL, SPU-ADPCM in the rip's RAM image), pitched per the instrument
// table's base pitches, shaped by each instrument's SPU envelope, one mono
// channel per sequence voice named exactly as the capture's MIDI tracks —
// the same contract tools/spc/apu-render.mjs keeps for the SNES, so the app's
// chip-audio path (and tools/chip-worker.mjs) plays it unchanged.
//
// What is real here: the samples, their loop points (block flags, or the
// table's loop address), the pitch (base pitch per degree × 2^octave, the
// key's octave 6 = the table's), the ADSR as psx-spx states it, the per-note
// volume from the score. What is not: pan and reverb (mono, dry), the
// SPU's 4-tap interpolation (linear here), volume slides within a note.
// Josh, 2026-09-27, FF7 Opening ~ Bombing Mission: "they just don't sound
// like the same instrument … hopefully the information should be there."
import { decodeAdpcm } from "./vab.mjs";
import { readInstr, INSTR_STRIDE } from "./instr.mjs";
import { secondsAt } from "./seq.mjs";
import { channelGroups } from "./notes.mjs";

const SPU_RATE = 44100;

// The bank: INSTR.ALL loaded contiguously into SPU RAM; find the RAM offset B
// with ram[B + addr] = each instrument's first block, by the end flags that
// sit just before the next instrument's start (92 of FF7's 93 line up).
export function findSampleBank(ram, table, {maxSlots = 128} = {}) {
  const d = new Uint8Array(ram);
  const recs = [];
  for (let i = 0; i < maxSlots; i++) { const r = readInstr(d, table.offset, i); if (r) recs.push(r); }
  recs.sort((a, b) => a.addr - b.addr);
  if (recs.length < 4) return null;
  const blockOk = o => o >= 0 && o + 16 <= d.length && (d[o] & 15) <= 12 && (d[o] >> 4) <= 4 && (d[o + 1] & 0xF8) === 0;
  const score = B => { // each instrument starts on a valid block and ends (an end flag) just before the next one starts
    let s = 0, hits = 0;
    for (let i = 0; i < recs.length; i++) {
      const a = B + recs[i].addr;
      if (!blockOk(a)) continue;
      const last = i + 1 === recs.length;
      const next = last ? a + 0x4000 : B + recs[i + 1].addr;
      const from = last ? a : Math.max(a, next - 64);
      for (let p = next - 16; p >= from; p -= 16) if (p + 1 < d.length && (d[p + 1] & 1)) { hits++; s += p === next - 16 ? 3 : 2; break; } // the end block right before the next start counts most: it breaks the tie with a base one block early
    }
    return {s, hits};
  };
  let best = {B: 0, s: -1, hits: 0};
  for (let B = -recs[0].addr; B + recs[recs.length - 1].addr < d.length; B += 16) { const r = score(B); if (r.s > best.s) best = {B, s: r.s, hits: r.hits}; }
  return best.hits >= recs.length * 0.6 ? {base: best.B, matched: best.hits, of: recs.length} : null;
}

// SPU envelope, streamed per output sample. Rates as psx-spx: shift = r >> 2,
// step = r & 3; the level moves every 1 << max(0, shift − 11) samples by
// (7 − step) << max(0, 11 − shift) up, (−8 + step) << … down; exponential
// decrease scales the step by level / 0x8000, exponential increase runs at
// a quarter speed above 0x6000.
class Envelope {
  constructor(rec) { this.rec = rec; this.level = 0; this.phase = 0; this.cycle = 0; this.on = true; }
  static rate(r, up, exp, level) {
    const shift = r >> 2, stepBits = r & 3;
    let cyc = 1 << Math.max(0, shift - 11);
    let step = (up ? 7 - stepBits : -8 + stepBits) << Math.max(0, 11 - shift);
    if (exp && up && level > 0x6000) cyc *= 4;
    if (exp && !up) step = Math.round(step * level / 0x8000);
    return {cyc, step};
  }
  release() { this.on = false; this.phase = 3; }
  next() { // -> level 0..0x7FFF after one output sample
    const r = this.rec;
    if (this.cycle > 0) { this.cycle--; return this.level; }
    let cyc = 1, step = 0;
    if (this.phase === 0) { // attack
      ({cyc, step} = Envelope.rate(r.ar, true, !!(r.am & 1), this.level));
      if (r.ar === 0) { this.level = 0x7FFF; this.phase = 1; return this.level; }
      this.level += step;
      if (this.level >= 0x7FFF) { this.level = 0x7FFF; this.phase = 1; }
    } else if (this.phase === 1) { // decay, always exponential decrease, to the sustain level
      const target = Math.min(0x7FFF, (r.sl + 1) * 0x800 - 1);
      if (this.level <= target) { this.phase = 2; return this.next(); }
      ({cyc, step} = Envelope.rate(r.dr << 2, false, true, this.level));
      this.level += step;
      if (this.level <= target) { this.level = target; this.phase = 2; }
    } else if (this.phase === 2) { // sustain: mode bit1 = decrease, bit0 = exponential; sr 0x7f = hold
      if (r.sr >= 0x7F) return this.level;
      const down = !!(r.sm & 2);
      ({cyc, step} = Envelope.rate(r.sr, !down, !!(r.sm & 1), this.level));
      this.level = Math.max(0, Math.min(0x7FFF, this.level + step));
    } else { // release: rr (5-bit shift, step −8), mode bit0 exponential
      ({cyc, step} = Envelope.rate(r.rr << 2, false, !!(r.rm & 1), this.level));
      if (step === 0) step = -1;
      this.level = Math.max(0, this.level + step);
    }
    this.cycle = cyc - 1;
    return this.level;
  }
}

// -> {sampleRate, seconds, [trackName]: Float32Array}
export async function renderSpu(result, opts = {}) {
  const {ram, table, bank} = opts;
  if (!ram || !table) throw new Error("renderSpu needs the RAM image and the instrument table");
  const sampleRate = opts.sampleRate || SPU_RATE;
  const B = bank && bank.base != null ? bank.base : (findSampleBank(ram, table) || {}).base;
  if (B == null) throw new Error("no sample bank found for this driver");
  const d = new Uint8Array(ram);
  const {notes, seq} = result;
  const recs = new Map(), samples = new Map();
  const recOf = p => { if (!recs.has(p)) recs.set(p, readInstr(d, table.offset, p)); return recs.get(p); };
  const sampleOf = rec => {
    if (samples.has(rec.slot)) return samples.get(rec.slot);
    const o = B + rec.addr;
    let len = 16;
    while (o + len + 16 <= d.length && !(d[o + len - 16 + 1] & 1) && len < 0x80000) len += 16;
    const dec = decodeAdpcm(d, o, len);
    let loopStart = dec.loopStart;
    if (loopStart == null && !dec.oneShot && rec.loop > rec.addr) loopStart = Math.floor((rec.loop - rec.addr) / 16) * 28; // the table's loop address
    const s = {pcm: dec.pcm, loopStart, loopEnd: dec.loopEnd != null ? dec.loopEnd : dec.pcm.length, oneShot: dec.oneShot || loopStart == null};
    samples.set(rec.slot, s);
    return s;
  };
  const groups = channelGroups(result); // [{name, notes}] exactly as makeMidi names its tracks
  const endTick = Math.max(seq.loop ? seq.loop.end : 0, ...notes.map(n => n.endTick || n.tick));
  const seconds = Math.min(opts.keepSeconds || Infinity, secondsAt(seq, endTick) + 2.5);
  const N = Math.ceil(seconds * sampleRate);
  const out = {sampleRate, seconds};
  let done = 0, total = notes.length;
  for (const g of groups) {
    const buf = new Float32Array(N);
    for (const n of g.notes) {
      const rec = recOf(n.drum && n.tone && n.tone.instrument != null ? n.tone.instrument : n.program);
      if (rec) {
        const smp = sampleOf(rec);
        const key = n.drum && n.tone && n.tone.key != null ? n.tone.key : n.key;
        const base = rec.pitches[((key % 12) + 12) % 12] || 0x1000;
        const ratio = base / 0x1000 * Math.pow(2, Math.floor(key / 12) - 6) * (SPU_RATE / sampleRate);
        const t0 = secondsAt(seq, n.tick), t1 = secondsAt(seq, n.endTick);
        const i0 = Math.floor(t0 * sampleRate), iOff = Math.floor(t1 * sampleRate);
        const vol = Math.max(0, Math.min(1, (n.vel || 0) / 127)) * (n.drum && n.tone && n.tone.vol != null ? Math.min(1, n.tone.vol / 127) : 1);
        const env = new Envelope(rec);
        let pos = 0;
        const pcm = smp.pcm, L = pcm.length;
        for (let i = i0; i < N; i++) {
          if (i >= iOff && env.on) env.release();
          const lv = env.next();
          if (!env.on && lv <= 0) break;
          if (pos >= L) { if (smp.oneShot || smp.loopStart == null || smp.loopEnd <= smp.loopStart) break; pos = smp.loopStart + ((pos - smp.loopStart) % (smp.loopEnd - smp.loopStart)); }
          const p0 = Math.floor(pos), f = pos - p0, a = pcm[p0], b = p0 + 1 < L ? pcm[p0 + 1] : (smp.oneShot ? a : pcm[smp.loopStart != null ? smp.loopStart : 0]);
          buf[i] += (a + (b - a) * f) / 32768 * (lv / 0x7FFF) * vol * 0.5;
          pos += ratio;
        }
      }
      done++;
      if (opts.onProgress && (done & 63) === 0) { opts.onProgress(done / total); await new Promise(r => setTimeout(r, 0)); }
    }
    out[g.name] = buf;
  }
  if (opts.onProgress) opts.onProgress(1);
  return out;
}
