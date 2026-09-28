// Nintendo 64 captures with the console's own sound: the game's bank
// samples (VADPCM in the rip's Audiotable), pitched as the sequence player
// pitches them, shaped by the bank's envelopes, one mono channel per
// capture track named exactly as notes.mjs names the MIDI tracks — the
// contract tools/psx/spu-render.mjs and tools/spc/apu-render.mjs keep, so
// the app's chip-audio path and tools/chip-worker.mjs play it unchanged.
//
// What is real here (sm64 decomp, JP/US paths — INTEGRATION.md §9): the
// samples and their loops, the pitch (gNoteFrequencies[semitone] ×
// sound.tuning × the channel's pitch scale; a drum is its tuning alone),
// the key regions, the ADSR as adsr_update runs it in 16.16 fixed point at
// 4 updates per 60 Hz frame, the gate-end decay at releaseRate × 24 per
// update, the volume law velocity² × channel volume × (envelope/23000)²,
// the choice of envelope (note_init: the layer's unless its release rate
// is 0, then the channel's), and the reverb: SM64's is one feedback delay
// line (synthesis.c synthesis_do_one_audio_update: the ring buffer's
// oldest samples become the update's starting sound, are scaled by the
// preset's gain, take the notes' wet sends — dry × reverbVol/128, D4 —
// and go back into the ring), i.e. out = dry + ring[t − W], ring[t] =
// gain·ring[t − W] + wet[t], W and the gain read from the rip's own RAM
// (the engine's gSynthesisReverb — ead-usf.mjs findSynthesisReverb): the
// state the game was in when ripped, one state for every song of a USF
// set. No per-song table (Josh's rule: game identity only says where to
// look); a rip without those RAM pages renders dry and says so. Each track
// is a stereo pair {l, r}: the note's pan is the channel's (DD /128) mixed
// with the layer's or the drum's by the channel's pan weight (DC /128) —
// effects.c JP/US `notePan = layer->pan * (1 − weight) + seqChannel->pan *
// weight` — and synthesis.c JP/US note_set_vel_pan_reverb turns it into
// `panIndex = (s32)(pan * 127.5f) & 127; volLeft = gDefaultPanVolume[panIndex];
// volRight = gDefaultPanVolume[127 − panIndex]`, gDefaultPanVolume[i] being
// cos(π/2 · i/127) (data.c) — the equal-power law, so a centred note sits
// −3 dB in each side. The pan is the value at note-on; a DD under a held
// note is not followed. The wet send is panned with the dry (the env mixer
// splits both). Not here:
// portamento, the RSP's resampler (linear interpolation
// instead), the synth waveforms of instrument ids >= 0x80 (skipped,
// listed in `warnings`), and volume changes during a note (the value at
// note-on).
import { tickSeconds } from "./seq-libultra.mjs";
import { channelGroups } from "./notes.mjs";
import { findAudioFiles, readBank, DEFAULT_ENVELOPE, DEFAULT_RELEASE_RATE } from "./bank.mjs";
import { rdramOf } from "./usf.mjs";
import { findSynthesisReverb } from "./ead-usf.mjs";
import { renderRare } from "./rare.mjs";

export const N64_RATE = 32000;          // freqScale 1.0 plays a sample at the output rate (32006 Hz on the US console)
export const UPDATES_PER_SECOND = 240;  // gAudioUpdatesPerFrame = ALIGN16(32006 / 60) / 160 + 1 = 4, per 60 Hz frame (heap.c)
const ADSR_DISABLE = 0, ADSR_HANG = -1, ADSR_GOTO = -2, ADSR_RESTART = -3;
const DISABLED = 0, INITIAL = 1, LOOP = 3, FADE = 4, HANG = 5, DECAY = 6;
const FREQ_CAP = 3.99992;               // process_notes: the resampler's ceiling
const VOL_SCALE = 4.3498e-5;            // process_notes: adsr level → ~1/23000

// The reverb the engine was running: {window, gain} from opts.reverb (null =
// dry), else the rip's RAM (opts.set, or what sequenceOfSet stamped on the
// result as result.reverb), else nothing — and the render says why.
export function reverbFor(opts, result) {
  if (opts.reverb === null || opts.reverb === false) return {reverb: null, why: null};
  if (opts.reverb) return {reverb: {window: opts.reverb.window, gain: opts.reverb.gain}, why: null};
  let st = result && result.reverb !== undefined ? result.reverb : undefined;
  if (st === undefined && opts.set && opts.set.state) { try { st = findSynthesisReverb(rdramOf(opts.set.state).ram); } catch { st = null; } }
  if (!st) return {reverb: null, why: "reverb state not in this rip"};
  if (st.useReverb === 0) return {reverb: null, why: null};
  return {reverb: {window: st.window, gain: st.gain}, why: null};
}

// adsr_update, JP/US: the level is an s16 0..32767 stepped once per audio
// update; a fade moves (target − current) << 16 over `delay` updates in a
// 32-bit accumulator; a decay subtracts fadeOutVel each update and ends
// below 100. Envelope pairs: [delay, level] or a marker delay (0 disable,
// −1 hang, −2 goto index, −3 restart). Sustain is left at 0 (the JP/US
// arithmetic makes chan_setsustain all but inert).
export class Adsr {
  constructor(envelope) { this.env = envelope; this.state = INITIAL; this.current = 0; this.hiRes = 0; this.velocity = 0; this.delay = 0; this.index = 0; this.fadeOutVel = 0; }
  decay(releaseRate) { this.fadeOutVel = releaseRate * 24; this.state = DECAY; }
  update() {
    switch (this.state) {
      case DISABLED: return 0;
      case INITIAL: this.current = 0; this.index = 0; this.hiRes = 0; this.state = LOOP; // fallthrough
      case LOOP: {
        const e = this.env[this.index] || [ADSR_DISABLE, 0];
        this.delay = e[0];
        if (this.delay === ADSR_DISABLE) { this.state = DISABLED; break; }
        if (this.delay === ADSR_HANG) { this.state = HANG; break; }
        if (this.delay === ADSR_GOTO) { this.index = e[1]; break; }
        if (this.delay === ADSR_RESTART) { this.state = INITIAL; break; }
        if (this.delay < 0) { this.state = DISABLED; break; }
        this.velocity = Math.trunc(((e[1] - this.current) * 65536) / this.delay);
        this.state = FADE; this.index++;
      } // fallthrough
      case FADE:
        this.hiRes = (this.hiRes + this.velocity) | 0;
        this.current = this.hiRes >> 16;
        if (--this.delay <= 0) this.state = LOOP;
        break;
      case HANG: break;
      case DECAY:
        this.current -= this.fadeOutVel;
        if (this.current < 100) { this.current = 0; this.state = DISABLED; }
        break;
    }
    return this.current < 0 ? 0 : this.current;
  }
  get done() { return this.state === DISABLED; }
}

// The note's pan in 0..1 as effects.c JP/US computes notePan: the channel's
// pan × its weight + the layer's pan × (1 − weight), the layer's being the
// drum's own unless the layer said CC. Facts default to the game's
// (weight 1, layer 0.5) when a note lacks them.
export function notePan(n, drum = null) {
  const w = n.panWeight != null ? n.panWeight : 1;
  const chan = n.pan != null ? n.pan : 0.5;
  const layer = drum && !n.noDrumPan ? drum.pan / 128 : n.lyPan != null ? n.lyPan : 0.5;
  return Math.max(0, Math.min(1, chan * w + layer * (1 - w)));
}
// synthesis.c JP/US: panIndex = (s32)(pan * 127.5f) & 127; gDefaultPanVolume[i] = cos(π/2 · i/127)
const panVolume = i => i >= 127 ? 0 : i <= 0 ? 1 : Math.cos(Math.PI / 2 * i / 127); // gDefaultPanVolume[i], its ends exact
export function panGains(pan) {
  const idx = Math.trunc(pan * 127.5) & 127;
  return [panVolume(idx), panVolume(127 - idx)];
}
export const panIndex = pan => Math.trunc(pan * 127.5) & 127;
// Vibrato as effects.c JP/US runs it per update (note_vibrato_init /
// get_vibrato_freq_scale / get_vibrato_pitch_change): `delay` updates of
// nothing; the extent and rate each ramp from their start to the channel's
// target over a change timer and follow later target changes the same way;
// then `time += rate; index = (time >> 10) & 0x3F` walks a 64-step triangle
// folded from gVibratoCurve (s8 k·8, k = 0..15: 0..120 up, back down, then
// the same below zero), and `scale = 1 + extent/4096 ·
// (gPitchBendFrequencyScale[pitchChange + 127] − 1)` with that table
// 0.5·2^(k/127), i.e. 1 + extent/4096 · (2^(pitchChange/127) − 1). A note
// born with no extent never vibrates.
export class Vibrato {
  constructor(vib, changes = []) {
    this.tgt = {rateTarget: vib.rateTarget, rateDelay: vib.rateDelay, extTarget: vib.extTarget, extDelay: vib.extDelay};
    this.extTimer = vib.extDelay; this.ext = this.extTimer === 0 ? vib.extTarget : vib.extStart;
    this.rateTimer = vib.rateDelay; this.rate = this.rateTimer === 0 ? vib.rateTarget : vib.rateStart;
    this.delay = vib.delay; this.time = 0; this.changes = changes; this.ci = 0;
  }
  // the channel's targets change while the note holds: seen at the update after their tick
  retarget(t) { this.tgt = {rateTarget: t.rateTarget, rateDelay: t.rateDelay, extTarget: t.extTarget, extDelay: t.extDelay}; }
  update() {
    if (this.delay !== 0) { this.delay--; return 1; }
    const T = this.tgt;
    if (this.extTimer) { if (this.extTimer === 1) this.ext = T.extTarget; else this.ext += Math.trunc((T.extTarget - this.ext) / this.extTimer); this.extTimer--; }
    else if (T.extTarget !== this.ext) { if ((this.extTimer = T.extDelay) === 0) this.ext = T.extTarget; }
    if (this.rateTimer) { if (this.rateTimer === 1) this.rate = T.rateTarget; else this.rate += Math.trunc((T.rateTarget - this.rate) / this.rateTimer); this.rateTimer--; }
    else if (T.rateTarget !== this.rate) { if ((this.rateTimer = T.rateDelay) === 0) this.rate = T.rateTarget; }
    if (this.ext === 0) return 1;
    this.time = (this.time + this.rate) >>> 0;
    let index = (this.time >> 10) & 0x3F, pc;
    switch (index & 0x30) {
      case 0x10: index = 31 - index; // fallthrough
      case 0x00: pc = index * 8; break;
      case 0x20: pc = -(index - 0x20) * 8; break;
      default: pc = -(63 - index) * 8; break;
    }
    return 1 + this.ext / 4096 * (Math.pow(2, pc / 127) - 1);
  }
}
// Portamento as effects.c JP/US get_portamento_freq_scale runs it per update:
// cur += speed; v = min((u32)cur, 127); scale = 1 + extent · (gPitchBendFrequencyScale[v + 127] − 1)
// = 1 + extent · (2^(v/127) − 1), extent = f(end)/f(start) − 1, on a voice that starts at f(start).
export class Portamento {
  constructor(p) { this.extent = Math.pow(2, (p.end - p.start) / 12) - 1; this.speed = 127 / p.updates; this.cur = 0; }
  update() { this.cur += this.speed; const v = Math.min(Math.floor(this.cur), 127); return 1 + this.extent * (Math.pow(2, v / 127) - 1); }
}
export const noteFrequency = semitone => Math.pow(2, (semitone - 39) / 12) * (semitone >= 117 ? 0.5 : 1); // gNoteFrequencies

// -> {sampleRate, seconds, [trackName]: {l: Float32Array, r: Float32Array}, silent: [names], warnings: [...]}
export async function renderN64(result, opts = {}) {
  if (result && result.driver === "rare") return renderRare(result, opts); // GoldenEye: the SDK synthesizer's rules, same output shape
  const rom = opts.rom || (opts.set && opts.set.rom);
  if (!rom) throw new Error("renderN64 needs the set's ROM image");
  const bankIds = opts.banks && opts.banks.length ? opts.banks : null;
  if (!bankIds) throw new Error("renderN64 needs the sequence's bank ids");
  const sampleRate = opts.sampleRate || N64_RATE;
  const files = opts.files || findAudioFiles(rom, opts.loc || null);
  const banks = new Map();
  const bankOf = i => { const id = bankIds[i] != null ? bankIds[i] : bankIds[0]; if (!banks.has(id)) banks.set(id, readBank(rom, files, id)); return banks.get(id); };
  const groups = channelGroups(result, opts.meter || {});
  const {reverb, why: reverbWhy} = reverbFor(opts, result);
  const W = reverb ? Math.max(1, Math.round(reverb.window * sampleRate / N64_RATE)) : 0, G = reverb ? reverb.gain / 0x8000 : 0;
  const {tempos, notes} = result;
  const endTick = Math.max(result.endTick || 0, ...notes.map(n => n.tick + n.dur));
  const seconds = Math.min(opts.keepSeconds || Infinity, tickSeconds(tempos, endTick) + 2.5);
  const N = Math.ceil(seconds * sampleRate);
  const out = {sampleRate, seconds, silent: [], warnings: [], reverb: reverb ? {window: reverb.window, gain: reverb.gain} : null};
  const warned = new Set();
  const warn = w => { if (!warned.has(w)) { warned.add(w); out.warnings.push(w); } };
  if (reverbWhy) warn(reverbWhy);
  const updateEvery = sampleRate / UPDATES_PER_SECOND;
  let done = 0, total = 0;
  for (const g of groups) total += g.notes.length;
  for (const g of groups) {
    let bufL = null, bufR = null, wetL = null, wetR = null; // allocated by the first note that sounds (wet: its reverb send, freed after the comb)
    for (const n of g.notes) {
      done++;
      if (opts.onProgress && (done & 31) === 0) { opts.onProgress(done / total); await new Promise(r => setTimeout(r, 0)); }
      const t0 = tickSeconds(tempos, n.tick);
      if (t0 >= seconds) continue;
      const bank = bankOf(n.bank || 0);
      // the sound and the layer's adsr, as seq_channel_layer_process_script picks them
      let sound = null, freq = 0, layerEnv = null, layerRel = 0;
      if (n.drum) {
        const drum = bank.drum(n.semitone);
        if (!drum) continue;
        sound = drum.sound; freq = sound ? sound.tuning : 0; layerEnv = drum.envelope; layerRel = drum.releaseRate;
      } else {
        if (n.inst == null || n.inst >= 0x80) { warn(`instrument ${n.inst} on channel ${n.ch} is a synth waveform, not rendered`); continue; }
        const inst = bank.instrument(n.inst);
        if (!inst) { warn(`instrument ${n.inst} is not in bank ${bank.id}`); continue; }
        sound = bank.sound(inst, n.semitone);
        // with a portamento the voice starts on the glide's start semitone (part4: freqScale = gNoteFrequencies[start] × tuning)
        freq = sound ? noteFrequency(n.porta ? n.porta.start : n.semitone) * sound.tuning : 0;
        if (n.lyAdsr) {
          if (n.lyAdsr.inst != null) { const li = bank.instrument(n.lyAdsr.inst); if (li) { layerEnv = li.envelope; layerRel = li.releaseRate; } }
          else { layerEnv = n.lyAdsr.envelope; layerRel = n.lyAdsr.releaseRate; }
        }
      }
      if (!sound || !sound.sample || !(freq > 0)) continue;
      // note_init / decay: the layer's envelope and release unless the layer's release rate is 0, then the channel's
      const chInst = n.chInst != null ? bank.instrument(n.chInst) : null;
      const chEnv = n.chEnv || (chInst ? chInst.envelope : DEFAULT_ENVELOPE);
      const chRel = n.chRel != null ? n.chRel : chInst ? chInst.releaseRate : DEFAULT_RELEASE_RATE;
      const envelope = layerRel === 0 || !layerEnv ? chEnv : layerEnv;
      const releaseRate = layerRel === 0 ? chRel : layerRel;
      // process_notes: velocity² × channel volume, × (level × 4.3498e-5)², capped at 32767 → 0..1
      const vel = Math.max(0, Math.min(127, n.vel || 0));
      let base = vel * vel * (n.vol != null ? n.vol : 1);
      if (base <= 0 && !(n.gain && n.gain.some(g => g.l > 0))) continue;
      // level steps under the note (n.gain: {t ticks from the start, l}): the channel's volume ×
      // scale × the player's, re-read by the game every update — followed here per update
      const steps = n.gain ? n.gain.map(g => ({i: Math.floor(tickSeconds(tempos, n.tick + g.t) * sampleRate), l: g.l})) : null;
      let gi = 0;
      const vibChanges = n.vib && n.vibChanges ? n.vibChanges.map(c => ({...c, i: Math.floor(tickSeconds(tempos, n.tick + c.t) * sampleRate)})) : [];
      const vib = n.vib ? new Vibrato(n.vib, vibChanges) : null;
      const porta = n.porta ? new Portamento(n.porta) : null;
      const send = reverb && n.rev ? Math.min(127, n.rev) / 128 : 0; // aSetVolume(A_AUX, reverbVol << 8): wet = dry × reverbVol/128
      const [gL, gR] = panGains(notePan(n, n.drum ? bank.drum(n.semitone) : null));
      const smp = bank.pcm(sound.sample);
      const pcm = smp.pcm, L = smp.loopEnd, loopStart = smp.loopStart;
      const baseStep = Math.min(FREQ_CAP, freq * (n.freq != null ? n.freq : 1)) * N64_RATE / sampleRate;
      let step = baseStep;
      const i0 = Math.floor(t0 * sampleRate), iOff = Math.floor(tickSeconds(tempos, n.tick + n.dur) * sampleRate);
      const env = new Adsr(envelope);
      let pos = 0, nextUpdate = i0, gPrev = 0, gNext = 0;
      for (let i = i0; i < N; i++) {
        if (i >= nextUpdate) {
          if (i >= iOff && env.state !== DECAY && !env.done) env.decay(releaseRate);
          const level = env.update() * VOL_SCALE;
          if (steps) { while (gi + 1 < steps.length && i >= steps[gi + 1].i) gi++; base = vel * vel * steps[gi].l; }
          if (vib || porta) { // process_notes: frequency ×= vibratoFreqScale × portamentoFreqScale
            let f = 1;
            if (vib) { while (vib.ci < vibChanges.length && i >= vibChanges[vib.ci].i) vib.retarget(vibChanges[vib.ci++]); f *= vib.update(); }
            if (porta) f *= porta.update();
            step = Math.min(FREQ_CAP * N64_RATE / sampleRate, baseStep * f);
          }
          gPrev = gNext; gNext = Math.min(32767, base * level * level) / 32767;
          if (env.done && gNext <= 0 && i > i0) break;
          nextUpdate += updateEvery;
        }
        if (pos >= L) { if (!smp.looping) break; pos = loopStart + (pos - loopStart) % (L - loopStart); }
        const p0 = pos | 0, f = pos - p0, a = pcm[p0], b = p0 + 1 < L ? pcm[p0 + 1] : smp.looping ? pcm[loopStart] : 0;
        const gain = gNext + (gPrev - gNext) * ((nextUpdate - i) / updateEvery);
        const v = (a + (b - a) * f) * gain;
        if (v !== 0) {
          if (!bufL) { bufL = new Float32Array(N); bufR = new Float32Array(N); }
          bufL[i] += v * gL; bufR[i] += v * gR;
          if (send) { if (!wetL) { wetL = new Float32Array(N); wetR = new Float32Array(N); } wetL[i] += v * send * gL; wetR[i] += v * send * gR; }
        }
        pos += step;
      }
    }
    if (bufL && wetL) { // the ring, one per side: what went in W samples ago comes back at unity and, scaled by the gain, goes round again
      for (const [buf, wet] of [[bufL, wetL], [bufR, wetR]]) {
        const ring = new Float32Array(W);
        for (let i = 0, p = 0; i < N; i++) { const r = ring[p]; buf[i] += r; ring[p] = r * G + wet[i]; if (++p === W) p = 0; }
      }
      wetL = wetR = null;
    }
    if (bufL) out[g.name] = {l: bufL, r: bufR}; else out.silent.push(g.name);
  }
  if (opts.onProgress) opts.onProgress(1);
  return out;
}
