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
// volume from the score, including a volume/expression change inside a
// held note (the note's gain breakpoints), pitch slides inside a note (the
// note's slide targets), the pan (each track is a stereo pair {l, r}: the
// SPU's two volume registers are linear, so a note at pan p (0..127) has
// left (127 − p)/127 and right p/127 of its level — the pan at note-on,
// a pan change under a held note is not followed). What is not: reverb (dry), the SPU's
// 4-tap interpolation (linear here).
// Josh, 2026-09-27, FF7 Opening ~ Bombing Mission: "they just don't sound
// like the same instrument … hopefully the information should be there."
import { decodeAdpcm, tonesFor, vagPcm } from "./vab.mjs";
import { readInstr, adsrRecord, INSTR_STRIDE } from "./instr.mjs";
import { akaoRecord } from "./akao.mjs";
import { secondsAt } from "./seq.mjs";
import { channelGroups, notePan } from "./notes.mjs";

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
export class Envelope {
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

// A decoded sample: loop from the block flags, else from the record's loop
// address (INSTR.DAT / sample-set records), else one-shot.
export function decodeAt(d, o, rec) {
  let len = 16;
  while (o + len + 16 <= d.length && !(d[o + len - 16 + 1] & 1) && len < 0x80000) len += 16;
  const dec = decodeAdpcm(d, o, len);
  let loopStart = dec.loopStart;
  if (loopStart == null && !dec.oneShot && rec && rec.loop > rec.addr) loopStart = Math.floor((rec.loop - rec.addr) / 16) * 28;
  return {pcm: dec.pcm, loopStart, loopEnd: dec.loopEnd != null ? dec.loopEnd : dec.pcm.length, oneShot: dec.oneShot || loopStart == null};
}
const fromVag = dec => dec && {pcm: dec.pcm, loopStart: dec.loopStart, loopEnd: dec.loopEnd != null ? dec.loopEnd : dec.pcm.length, oneShot: dec.oneShot || dec.loopStart == null};
const clampPan = p => Math.max(0, Math.min(127, p));

// The AKAO voices of one note -> [{smp, ratio, env, gain, pan}] (one layer).
// Records come from the capture's instrument handle (result.instr — INSTR.DAT
// or the image's AKAO sample sets, akao.mjs) or from the table the caller
// found; pitch from the record's twelve base pitches (× 2^(octave − 6)) or,
// for the 0x10-byte articulations, its unity key and fine tune.
export function akaoVoices(result, opts, sampleRate) {
  const {ram, table, bank} = opts;
  const ctx = result.instr && result.instr.kind === "akao-sets" ? result.instr : null;
  let d, recOf, B = null;
  if (ctx) {
    d = ctx.ram;
    recOf = n => akaoRecord(ctx, n);
  } else {
    if (!ram || !table) throw new Error("renderSpu needs the RAM image and the instrument table");
    d = new Uint8Array(ram);
    B = bank && bank.base != null ? bank.base : (findSampleBank(ram, table) || {}).base;
    if (B == null) throw new Error("no sample bank found for this driver");
    const recs = new Map();
    // a drum-table note plays its entry's instrument (n.table: kitify may call
    // it melodic); a kit-promoted key-split note keeps its region's
    recOf = n => { const p = (n.table || n.drum) && n.tone && n.tone.instrument != null ? n.tone.instrument : n.program; if (!recs.has(p)) recs.set(p, readInstr(d, table.offset, p)); return recs.get(p); };
  }
  const samples = new Map();
  const sampleOf = rec => {
    const o = rec.ramAddr != null ? rec.ramAddr : B + rec.addr;
    if (!samples.has(o)) samples.set(o, decodeAt(d, o, rec));
    return samples.get(o);
  };
  return n => {
    const rec = recOf(n);
    if (!rec) return [];
    const key = n.table && n.tone && n.tone.key != null ? n.tone.key : n.key;
    let ratio;
    if (rec.pitches) ratio = (rec.pitches[((key % 12) + 12) % 12] || 0x1000) / 0x1000 * Math.pow(2, Math.floor(key / 12) - 6);
    else ratio = (rec.fineMult || 1) * Math.pow(2, (key - (rec.unity != null ? rec.unity : 60)) / 12);
    const gain = n.tone && n.tone.vol != null ? Math.min(1, n.tone.vol / 127) : 1;
    return [{smp: sampleOf(rec), ratio: ratio * (SPU_RATE / sampleRate), env: rec, gain, pan: notePan(n)}];
  };
}

// The libsnd voices of one note (a SEQ note through its VAB) -> every tone
// of the program whose key range holds the key (tones layer). Per tone:
// its VAG sample (the VAB body), its two ADSR words (instr.mjs adsrRecord:
// the SPU envelope), pitch 0x1000 × 2^((key − center + shift/128)/12) — the
// tone's center plays the sample at 44100 Hz, shift is fine tune in 1/128
// semitone (VGMTrans Vab.cpp: cents = shift × 100 / 128) — and the SPU's
// linear volumes: velocity × tone vol × program vol × bank master vol × the
// channel's CC7·CC11; pan = the tone's, the program's and the channel's CC10
// offsets from centre, summed.
export function vabVoices(result, sampleRate) {
  const vab = result.vab;
  const envs = new Map();
  const envOf = t => { const k = t.adsr1 + ":" + t.adsr2; if (!envs.has(k)) envs.set(k, adsrRecord(t.adsr1, t.adsr2)); return envs.get(k); };
  const master = (vab.masterVol != null ? vab.masterVol : 127) / 127;
  return n => {
    const prog = vab.programs[n.program];
    if (!prog) return [];
    const out = [];
    for (const t of tonesFor(vab, n.program, n.key)) {
      const smp = fromVag(vagPcm(vab, t.vag));
      if (!smp || !smp.pcm.length) continue;
      // PS2's HD/BD bank (tools/ps2/hd.mjs toBank()) carries each VAG's own
      // native sample rate (read from the file, not assumed) — real Dark
      // Cloud samples run 22050-44100 Hz, not all at PS1's fixed 44100.
      // PS1 VABs have no such field (vagPcm/vab.vags never set `.rate`), so
      // this falls back to SPU_RATE and PS1 renders are unchanged.
      const vagRate = (vab.vags[t.vag] && vab.vags[t.vag].rate) || SPU_RATE;
      const ratio = Math.pow(2, (n.key - t.center + t.shift / 128) / 12) * (vagRate / sampleRate);
      const gain = Math.min(1, t.vol / 127 * (prog.mvol != null ? prog.mvol : 127) / 127 * master * (n.chVol != null ? n.chVol : 1));
      const pan = clampPan(64 + (t.pan - 64) + ((prog.mpan != null ? prog.mpan : 64) - 64) + ((n.pan != null ? n.pan : 64) - 64));
      out.push({smp, ratio, env: envOf(t), gain, pan});
    }
    return out;
  };
}

// Streaming core (step 1c, docs/streamed-render-plan.md). This chip's own
// renderer carries NO cross-note state at all — no reverb (the header
// comment above says so: dry), no voice stealing, no shared filter — every
// voice is an independent sum into l/r, so "stream" only needs a per-chunk
// active-voice list; nothing needs to be shared between voices beyond the
// group's l/r output. PS2 (Challenge's BGM/WD path, tools/ps2/wd.mjs
// toBank() → this same renderSpu with result.vab set) goes through the
// identical vabVoices() branch below — same contract, confirmed no reverb
// there either (tools/ps2/INTEGRATION.md: "same as PS1's own reverb gap").
//
// A "job" is everything about one note+layer that's fixed before any sample
// is produced (exactly the per-note/per-layer setup the old renderSpu did
// inline, unchanged formulas); a "voice" is a job plus its live, mutating
// playback state (Envelope, pos, ri/si cursors, step, vol). Jobs within a
// group stay in g.notes order (tick-ascending; i0 is therefore
// non-decreasing within a group) with each note's layers contiguous, in the
// order voicesOf(n) returns them — the SAME order the old code's nested
// note/layer loop produced. The active list only ever appends in that order
// and filters dead voices out in place, so summation order into l/r (and so
// float rounding) is identical to the old whole-buffer render for any chunk
// size.
function buildJobs(g, voicesOf, seq, sampleRate) {
  const jobs = [];
  for (const n of g.notes) {
    for (const layer of voicesOf(n)) {
      const {smp, ratio, env: rec} = layer;
      const pan = layer.pan, gL = (127 - pan) / 127, gR = pan / 127;
      const t0 = secondsAt(seq, n.tick), t1 = secondsAt(seq, n.endTick);
      const i0 = Math.floor(t0 * sampleRate), iOff = Math.floor(t1 * sampleRate);
      const toneVol = layer.gain;
      let vol0 = Math.max(0, Math.min(1, (n.vel || 0) / 127)) * toneVol;
      // a volume/expression change while the note sounds (n.gain: breakpoints
      // in ticks from the note's start) — the driver moves the voice's volume,
      // so the render follows it sample by sample; vel was that curve's start
      let ramp = null;
      if (n.gain && n.gain.length > 1) {
        ramp = n.gain.map(g2 => ({i: Math.floor(secondsAt(seq, n.tick + g2.t) * sampleRate), l: g2.l * toneVol}));
        vol0 = ramp[0].l;
      }
      // pitch slides (n.slide: semitone targets at tick offsets, each reached
      // over len ticks) bend the ONE voice — no new attack, as the driver does
      let slide = null;
      if (n.slide && n.slide.length) {
        slide = [{i: i0, s: 0}];
        for (const sl of n.slide) {
          const a = Math.floor(secondsAt(seq, n.tick + sl.t) * sampleRate), z = Math.floor(secondsAt(seq, n.tick + sl.t + Math.max(1, sl.len)) * sampleRate);
          slide.push({i: a, s: slide[slide.length - 1].s}); slide.push({i: Math.max(z, a + 1), s: sl.to});
        }
      }
      const pcm = smp.pcm, L = pcm.length;
      jobs.push({pcm, L, oneShot: smp.oneShot, loopStart: smp.loopStart, loopEnd: smp.loopEnd, gL, gR, i0, iOff, rec, ratio, vol0, ramp, slide});
    }
  }
  return jobs; // i0-ascending: g.notes is tick-ascending within a channel
}

// One output sample for one live voice at absolute index i: exactly the old
// inner-loop body, used by fastForwardVoice() (seek() only calls this —
// it's not the hot path, so staying a small shared function here is worth
// it for correctness). render()'s own per-chunk loop below is the SAME
// arithmetic, duplicated and hoisted into plain locals — calling this once
// per sample cost ~2x the old whole-buffer render on a synthetic 8-channel/
// 60-note fixture (property lookups on `job`/`v` every sample, and — before
// the boolean-return change below — a "number | null" return that kept V8
// from unboxing the float math). The tests that compare chunked/seeked
// output against the frozen whole-render oracle are what keeps these two
// copies honest; if you change one, change the other. When `l` is given,
// writes the panned value into l[oi]/r[oi]; omitted (seek), the sample is
// computed and discarded. -> true while the voice is still live, false the
// instant it dies (envelope reached silence after release, or ran off a
// non-looping sample — no sample was produced).
function advanceVoice(job, v, i, l, r, oi) {
  if (i >= job.iOff && v.env.on) v.env.release();
  const lv = v.env.next();
  if (!v.env.on && lv <= 0) return false;
  if (v.pos >= job.L) {
    if (job.oneShot || job.loopStart == null || job.loopEnd <= job.loopStart) return false;
    v.pos = job.loopStart + ((v.pos - job.loopStart) % (job.loopEnd - job.loopStart));
  }
  if (job.ramp) {
    while (v.ri + 1 < job.ramp.length && i >= job.ramp[v.ri + 1].i) v.ri++;
    const g = job.ramp[v.ri], nx = job.ramp[v.ri + 1];
    v.vol = nx && nx.i > g.i && i < nx.i ? g.l + (nx.l - g.l) * (i - g.i) / (nx.i - g.i) : g.l;
  }
  if (job.slide) {
    while (v.si + 1 < job.slide.length && i >= job.slide[v.si + 1].i) v.si++;
    const g = job.slide[v.si], nx = job.slide[v.si + 1];
    const semis = nx && nx.i > g.i && i < nx.i ? g.s + (nx.s - g.s) * (i - g.i) / (nx.i - g.i) : g.s;
    v.step = job.ratio * Math.pow(2, semis / 12);
  }
  const p0 = Math.floor(v.pos), f = v.pos - p0, a = job.pcm[p0], b = p0 + 1 < job.L ? job.pcm[p0 + 1] : (job.oneShot ? a : job.pcm[job.loopStart != null ? job.loopStart : 0]);
  const val = (a + (b - a) * f) / 32768 * (lv / 0x7FFF) * v.vol * 0.5;
  v.pos += v.step;
  if (l !== undefined) { l[oi] += val * job.gL; r[oi] += val * job.gR; }
  return true;
}

const freshVoice = (job) => ({job, env: new Envelope(job.rec), pos: 0, ri: 0, si: 0, step: job.ratio, vol: job.vol0, i: job.i0});

// How long (in samples, at the stream's rate) a release could possibly last:
// simulate Envelope from the loudest possible start (0x7FFF) — a real voice
// releases at or below whatever level it actually reached, so its true
// release is never longer than this; caching it per ADSR record (shared by
// every note on the same instrument) makes seek()'s liveness test O(1) for
// the common case instead of re-simulating per note. Capped at `cap` samples
// (the stream's own total length) — beyond that, nothing is ever queried, so
// "still releasing past the whole song" and "still releasing at sample N"
// are the same fact for every purpose seek() uses this for.
function releaseLenFor(rec, cache, cap) {
  let n = cache.get(rec);
  if (n != null) return n;
  const e = new Envelope(rec);
  e.level = 0x7FFF; e.phase = 3; e.on = false; e.cycle = 0;
  n = 0;
  while (n < cap) { n++; if (e.next() <= 0) break; }
  cache.set(rec, n);
  return n;
}

// Run a voice from its own start (job.i0) to `target` with no output — used
// only by seek(), only for notes the liveness bound says might still be
// live; same advanceVoice() calls in the same order a real render would
// have made, so the state hand-off is exact. -> the live voice at `target`,
// or null if it died first (also correct: seek() then just drops it).
function fastForwardVoice(job, target) {
  const v = freshVoice(job);
  while (v.i < target) {
    if (!advanceVoice(job, v, v.i)) return null;
    v.i++;
  }
  return v;
}

// -> {sampleRate, seconds, frames, tracks, render(nFrames), seek(frame),
// snapshot(), restore(s)}. Same inputs as renderSpu (below), which is now
// just "stream the whole thing in one chunk". render(nFrames) returns
// {[trackName]: {l, r}} for the NEXT nFrames from the stream's current
// position (starting at 0); concatenating render() calls of any chunk sizes
// reproduces renderSpu()'s whole-song arrays bit-for-bit, because every
// voice's own arithmetic only ever depends on its own job and its own prior
// state (see the comment above buildJobs) — chunk boundaries are invisible
// to it.
export function createSpuStream(result, opts = {}) {
  const sampleRate = opts.sampleRate || SPU_RATE;
  const voicesOf = result.vab ? vabVoices(result, sampleRate) : akaoVoices(result, opts, sampleRate);
  const {notes, seq} = result;
  const groups = channelGroups(result); // [{name, notes}] exactly as makeMidi names its tracks
  let endTick = seq.loop ? seq.loop.end : 0; for (const n of notes) endTick = Math.max(endTick, n.endTick || n.tick);
  const seconds = Math.min(opts.keepSeconds || Infinity, secondsAt(seq, endTick) + 2.5);
  const N = Math.ceil(seconds * sampleRate);
  const tracks = groups.map(g => g.name);
  const jobsByGroup = groups.map(g => buildJobs(g, voicesOf, seq, sampleRate));
  const relCache = new Map(); // ADSR record -> worst-case release length (samples)

  let frame = 0;
  let active = jobsByGroup.map(() => []);     // per group: live voices, job order
  let nextJobIdx = jobsByGroup.map(() => 0);  // per group: jobs with i0 < current frame are all decided

  function activateUpTo(gi, end) {
    const jobs = jobsByGroup[gi];
    let idx = nextJobIdx[gi];
    while (idx < jobs.length && jobs[idx].i0 < end) { active[gi].push(freshVoice(jobs[idx])); idx++; }
    nextJobIdx[gi] = idx;
  }

  function render(nFrames) {
    const end = Math.min(frame + nFrames, N);
    const out = {};
    for (let gi = 0; gi < groups.length; gi++) {
      activateUpTo(gi, end);
      const l = new Float32Array(nFrames), r = new Float32Array(nFrames);
      const kept = [];
      for (const v of active[gi]) {
        // Hoisted out of advanceVoice() into plain locals for this chunk —
        // same arithmetic (advanceVoice/fastForwardVoice's shared copy is
        // the correctness reference the tests check this against), but as
        // a per-call object-property lookup inside a per-SAMPLE loop this
        // was ~2x the old whole-buffer render on a synthetic 8-channel/60-
        // note fixture; hoisting the job's static fields and the voice's
        // mutable ones to locals once per voice per chunk (not per sample)
        // got it back under the 1.2x budget. Write back to `v` once, after.
        const job = v.job, env = v.env;
        const iOff = job.iOff, L = job.L, oneShot = job.oneShot, loopStart = job.loopStart, loopEnd = job.loopEnd,
          pcm = job.pcm, gL = job.gL, gR = job.gR, ramp = job.ramp, slide = job.slide, ratio = job.ratio;
        let pos = v.pos, ri = v.ri, si = v.si, step = v.step, vol = v.vol, i = v.i, dead = false;
        while (i < end) {
          if (i >= iOff && env.on) env.release();
          const lv = env.next();
          if (!env.on && lv <= 0) { dead = true; break; }
          if (pos >= L) {
            if (oneShot || loopStart == null || loopEnd <= loopStart) { dead = true; break; }
            pos = loopStart + ((pos - loopStart) % (loopEnd - loopStart));
          }
          if (ramp) {
            while (ri + 1 < ramp.length && i >= ramp[ri + 1].i) ri++;
            const g = ramp[ri], nx = ramp[ri + 1];
            vol = nx && nx.i > g.i && i < nx.i ? g.l + (nx.l - g.l) * (i - g.i) / (nx.i - g.i) : g.l;
          }
          if (slide) {
            while (si + 1 < slide.length && i >= slide[si + 1].i) si++;
            const g = slide[si], nx = slide[si + 1];
            const semis = nx && nx.i > g.i && i < nx.i ? g.s + (nx.s - g.s) * (i - g.i) / (nx.i - g.i) : g.s;
            step = ratio * Math.pow(2, semis / 12);
          }
          const p0 = Math.floor(pos), f = pos - p0, a = pcm[p0], b = p0 + 1 < L ? pcm[p0 + 1] : (oneShot ? a : pcm[loopStart != null ? loopStart : 0]);
          const val = (a + (b - a) * f) / 32768 * (lv / 0x7FFF) * vol * 0.5;
          const oi = i - frame;
          l[oi] += val * gL; r[oi] += val * gR;
          pos += step;
          i++;
        }
        v.pos = pos; v.ri = ri; v.si = si; v.step = step; v.vol = vol; v.i = i;
        if (!dead) kept.push(v);
      }
      active[gi] = kept;
      out[tracks[gi]] = {l, r};
    }
    frame += nFrames;
    return out;
  }

  function seek(target) {
    frame = Math.max(0, target);
    for (let gi = 0; gi < groups.length; gi++) {
      const jobs = jobsByGroup[gi];
      const kept = [];
      let idx = 0;
      while (idx < jobs.length && jobs[idx].i0 < frame) {
        const job = jobs[idx];
        if (frame <= job.iOff + releaseLenFor(job.rec, relCache, N)) {
          const v = fastForwardVoice(job, frame);
          if (v) kept.push(v);
        }
        idx++;
      }
      active[gi] = kept;
      nextJobIdx[gi] = idx;
    }
  }

  function snapshot() {
    return {
      frame, nextJobIdx: nextJobIdx.slice(),
      active: active.map(list => list.map(v => ({
        job: v.job, pos: v.pos, ri: v.ri, si: v.si, step: v.step, vol: v.vol, i: v.i,
        env: {level: v.env.level, phase: v.env.phase, cycle: v.env.cycle, on: v.env.on},
      }))),
    };
  }

  function restore(s) {
    frame = s.frame;
    nextJobIdx = s.nextJobIdx.slice();
    active = s.active.map(list => list.map(sv => {
      const env = new Envelope(sv.job.rec);
      env.level = sv.env.level; env.phase = sv.env.phase; env.cycle = sv.env.cycle; env.on = sv.env.on;
      return {job: sv.job, env, pos: sv.pos, ri: sv.ri, si: sv.si, step: sv.step, vol: sv.vol, i: sv.i};
    }));
  }

  return {sampleRate, seconds, frames: N, tracks, render, seek, snapshot, restore};
}

// -> {sampleRate, seconds, [trackName]: {l: Float32Array, r: Float32Array}}
// result: an AKAO capture (akao.mjs akaoNotes; opts {ram, table, bank} when
// its instruments are INSTR.DAT) or a SEQ capture with its VAB (notes.mjs
// seqNotes(seq, {vab}) — result.vab carries the bank and its samples, so no
// RAM, table or bank is needed). Streams the whole thing in one pass over
// createSpuStream — this is the only renderSpu implementation; every caller
// (chip-worker's planChipRender/tally path, tools/psx sounding/preview
// helpers, the PS2 BGM/WD path) is unaffected, same signature and shape.
export async function renderSpu(result, opts = {}) {
  const stream = createSpuStream(result, opts);
  const out = {sampleRate: stream.sampleRate, seconds: stream.seconds};
  const bufs = {};
  for (const name of stream.tracks) bufs[name] = {l: new Float32Array(stream.frames), r: new Float32Array(stream.frames)};
  // one second per chunk: each chunk yields to the event loop when onProgress is set, and a
  // browser clamps setTimeout to >= 4 ms — 4096-frame chunks added ~8 s to a 163 s song (FFX Challenge)
  const CHUNK = Math.max(4096, Math.round(stream.sampleRate));
  let filled = 0;
  while (filled < stream.frames) {
    const n = Math.min(CHUNK, stream.frames - filled);
    const chunk = stream.render(n);
    for (const name of stream.tracks) { bufs[name].l.set(chunk[name].l, filled); bufs[name].r.set(chunk[name].r, filled); }
    filled += n;
    if (opts.onProgress) { opts.onProgress(filled / Math.max(1, stream.frames)); await new Promise(r => setTimeout(r, 0)); }
  }
  for (const name of stream.tracks) out[name] = bufs[name];
  if (opts.onProgress) opts.onProgress(1);
  return out;
}
