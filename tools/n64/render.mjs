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
import { findAudioFiles, readBank, DEFAULT_ENVELOPE, DEFAULT_RELEASE_RATE, readFont, ootMemory, OOT_DEFAULT_ENVELOPE, OOT_DEFAULT_DECAY_INDEX } from "./bank.mjs";
import { rdramOf } from "./usf.mjs";
import { findSynthesisReverb, findOotReverbs, locateEAD } from "./ead-usf.mjs";
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
    return this.scale((this.time >> 10) & 0x3F);
  }
  scale(index) {
    let pc;
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
  if (result && result.gen === "oot") return renderOotGen(result, opts);  // Ocarina of Time / Majora's Mask: sound fonts, float ADSR
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
      let baseStep = Math.min(FREQ_CAP, freq * (n.freq != null ? n.freq : 1)) * N64_RATE / sampleRate;
      let step = baseStep;
      // the channel bend while the note holds (n.freqChanges, D3/DE): noteFreqScale is recomputed every update
      const bends = n.freqChanges ? n.freqChanges.map(c => ({i: Math.floor(tickSeconds(tempos, n.tick + c.t) * sampleRate), f: c.f})) : null;
      let bi = 0;
      const i0 = Math.floor(t0 * sampleRate), iOff = Math.floor(tickSeconds(tempos, n.tick + n.dur) * sampleRate);
      const env = new Adsr(envelope);
      let pos = 0, nextUpdate = i0, gPrev = 0, gNext = 0;
      for (let i = i0; i < N; i++) {
        if (i >= nextUpdate) {
          if (i >= iOff && env.state !== DECAY && !env.done) env.decay(releaseRate);
          const level = env.update() * VOL_SCALE;
          if (steps) { while (gi + 1 < steps.length && i >= steps[gi + 1].i) gi++; base = vel * vel * steps[gi].l; }
          if (bends && bi < bends.length && i >= bends[bi].i) {
            while (bi + 1 < bends.length && i >= bends[bi + 1].i) bi++;
            baseStep = Math.min(FREQ_CAP, freq * bends[bi++].f) * N64_RATE / sampleRate;
            step = baseStep;
          }
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

// ---- the oot generation (Ocarina of Time, Majora's Mask) -------------------
//
// The same engine family with its own rules, each from the oot decomp (mm's
// agrees wherever quoted): heap.c AudioHeap_Init / playback.c / effects.c /
// synthesis.c. What differs from sm64:
// - updates: ticksPerUpdate = (ALIGN16(32000/60) + 16)/0xD0 + 1 = 3 per 60 Hz
//   frame (180/s, not 240); Audio_ProcessNotes runs once per update.
// - ADSR in floats (Audio_AdsrUpdate): an envelope point's target is
//   (arg/32767)², reached linearly over delay × ticksPerUpdate/4 updates (the
//   sm64-rate delays kept in seconds); the gate-end decay subtracts
//   adsrDecayTable[decayIndex] = 1/(ticksPerUpdate × scaleInv) per update
//   (AudioHeap_InitAdsrDecayTable: index 1..15 → 60(23−i), 16..127 → 4(143−i),
//   128..250 → 251−i, 251..255 → 0.75, 0.66, 0.5, 0.33, 0.25; 0 never decays)
//   down to the channel's sustain × level/256 (D2), held 128 updates, then on.
// - which envelope: the layer's (a drum's own) unless its decay index is 0,
//   then the channel's (Audio_NoteInit, Audio_SeqLayerDecayRelease).
// - pitch: gPitchFrequencies[semitone] = 2^((s − 39)/12) for s < 0x75 and
//   2^((s − 167)/12) above (the table's last 11 entries wrap below A0).
// - level: velocity²/127² × (volume × volumeScale × fade)² × ADSR, clamped to
//   1 (Audio_SequenceChannelProcessSound, Audio_InitSampleState).
// - pan: integer — notePan = (newPan × weight + layerPan × (128 − weight)) >> 7,
//   gDefaultPanVolume[pan & 127] / [127 − pan] (the same cos table as sm64).
// - vibrato: a sine (gWaveSamples[2]) and scale = 1/((d − 1/d)·(sin + 32768)/65536 + 1/d), d = 1 + depth/4096.
// - reverb: one of the engine's SynthesisReverbs (the channel's E5 index), read
//   from RAM (ead-usf findOotReverbs): each update the ring's oldest block is
//   mixed into the output × volume, scaled by decayRatio, leaked between
//   sides (leakRtl, leakLtr), the notes' sends (reverbVol/128) added, the
//   8-tap Q15 low-pass run when the reverb has one, and the block saved back —
//   out = dry + V·ring[t − W], ring[t] = filter(G·ring[t − W] + leak + wet[t]),
//   W = windowSize × downsampleRate. Not modelled: the downsampling's own
//   filtering, sub-delays and cross-reverb mixing (warned when a rip uses them).
export const OOT_UPDATES_PER_SECOND = 180;
const OOT_TICKS_PER_UPDATE = 3;
export const ootPitch = s => Math.pow(2, ((s < 0x75 ? s : s - 128) - 39) / 12);
export function ootDecayRate(i, tpu = OOT_TICKS_PER_UPDATE) {
  if (!i) return 0;
  const scaleInv = i >= 251 ? [0.75, 0.66, 0.5, 0.33, 0.25][i - 251] : i >= 128 ? 251 - i : i >= 16 ? 4 * (143 - i) : 60 * (23 - i);
  return 1 / (tpu * scaleInv);
}
const O_DISABLED = 0, O_INITIAL = 1, O_START_LOOP = 2, O_LOOP = 3, O_FADE = 4, O_HANG = 5, O_DECAY = 6, O_RELEASE = 7, O_SUSTAIN = 8;
export class OotAdsr {
  constructor(envelope, tpu = OOT_TICKS_PER_UPDATE) { this.env = envelope; this.scaled = tpu / 4; this.state = O_INITIAL; this.current = 0; this.velocity = 0; this.delay = 0; this.index = 0; this.fadeOutVel = 0; this.sustain = 0; this.decayFlag = false; }
  // Audio_SeqLayerDecayRelease(ADSR_STATE_DECAY): the rate and sustain now, the state at the end of the next update
  decay(fadeOutVel, chanSustain = 0) { this.fadeOutVel = fadeOutVel; this.sustain = chanSustain * this.current / 256; this.decayFlag = true; }
  update() {
    const st = this.state;
    switch (st) {
      case O_DISABLED: return 0;
      case O_INITIAL: case O_START_LOOP:
        this.index = 0; this.state = O_LOOP; // fallthrough
      case O_LOOP:
        for (;;) {
          const e = this.env[this.index] || [0, 0];
          this.delay = e[0];
          if (this.delay === 0) { this.state = O_DISABLED; break; }
          if (this.delay === -1) { this.state = O_HANG; break; }
          if (this.delay === -2) { this.index = e[1]; continue; }
          if (this.delay === -3) { this.state = O_INITIAL; break; }
          if (this.delay < 0) { this.state = O_DISABLED; break; }
          this.delay = Math.trunc(this.delay * this.scaled) || 1;  // s16 *= f32, at least one update
          const t = e[1] / 32767;
          this.velocity = (t * t - this.current) / this.delay;
          this.state = O_FADE; this.index++;
          break;
        }
        if (this.state !== O_FADE) break;
        // fallthrough
      case O_FADE:
        this.current += this.velocity;
        if (--this.delay <= 0) this.state = O_LOOP;
        break;
      case O_HANG: break;
      case O_DECAY: case O_RELEASE:
        this.current -= this.fadeOutVel;
        if (this.sustain !== 0 && st === O_DECAY) {
          if (this.current < this.sustain) { this.current = this.sustain; this.delay = 128; this.state = O_SUSTAIN; }
          break;
        }
        if (this.current < 0.00001) { this.current = 0; this.state = O_DISABLED; }
        break;
      case O_SUSTAIN:
        if (--this.delay === 0) this.state = O_RELEASE;
        break;
    }
    if (this.decayFlag) { this.state = O_DECAY; this.decayFlag = false; }
    return this.current < 0 ? 0 : this.current > 1 ? 1 : this.current;
  }
  get done() { return this.state === O_DISABLED; }
  get decaying() { return this.decayFlag || this.state === O_DECAY || this.state === O_RELEASE || this.state === O_SUSTAIN; }
}
// Audio_GetVibratoFreqScale: the sm64 timers (depth ↔ extent), a sine curve and the reciprocal law
// gSineWaveSample (data.c): a quarter wave of 17 points, mirrored and negated to 64
const SINE_Q = [0, 3211, 6392, 9511, 12539, 15446, 18204, 20787, 23169, 25329, 27244, 28897, 30272, 31356, 32137, 32609, 32767];
const SINE64 = Array.from({length: 64}, (_, i) => { const q = i & 31; return (q <= 16 ? SINE_Q[q] : SINE_Q[32 - q]) * (i < 32 ? 1 : -1); });
export class OotVibrato extends Vibrato {
  scale(index) {
    const d = 1 + this.ext / 4096, inv = 1 / d;
    return 1 / ((d - inv) * (SINE64[index] + 32768) / 65536 + inv);
  }
}
// Audio_GetPortamentoFreqScale: cur += speed (8.8), v = min(cur >> 8, 127), 1 + extent·(2^(v/127) − 1);
// plain speed = 0x20000 / (time × ticksPerUpdate); special modes take the capture's glide length
export class OotPortamento {
  constructor(p, ups = OOT_UPDATES_PER_SECOND) {
    this.extent = Math.pow(2, (p.end - p.start) / 12) - 1; this.cur = 0;
    const sp = !p.special && p.time ? 0x20000 / (p.time * OOT_TICKS_PER_UPDATE) : 127 * 256 / Math.max(1e-9, p.updates * ups / UPDATES_PER_SECOND);
    this.speed = Math.max(1, Math.min(0x7FFF, Math.trunc(sp)));
  }
  update() { this.cur += this.speed; const v = Math.min((this.cur >> 8) & 0xFF, 127); return 1 + this.extent * (Math.pow(2, v / 127) - 1); }
}
export function ootPanGains(n, drum = null) {
  const newPan = Math.round((n.pan != null ? n.pan : 0.5) * 128), weight = Math.round((n.panWeight != null ? n.panWeight : 1) * 128);
  const lyPan = drum && !n.noDrumPan ? drum.pan : Math.round((n.lyPan != null ? n.lyPan : 0.5) * 128);
  const pan = ((newPan * weight + lyPan * (128 - weight)) >> 7) & 0x7F;
  return [panVolume(pan), panVolume(127 - pan)];
}
// the 8-tap Q15 FIR the RSP's aFilter runs on a reverb's wet signal
function firState(taps) { return taps ? {taps: taps.map(t => t / 32768), hist: new Float32Array(8), p: 0} : null; }
function fir(f, x) { f.hist[f.p] = x; let y = 0; for (let k = 0; k < 8; k++) y += f.taps[k] * f.hist[(f.p - k + 8) & 7]; f.p = (f.p + 1) & 7; return y; }

export async function renderOotGen(result, opts = {}) {
  const set = opts.set;
  if (!set) throw new Error("renderN64 (oot generation) needs the USF set: its fonts are read from the ROM pages or RDRAM");
  const loc = opts.loc && opts.loc.gen === "oot" ? opts.loc : locateEAD(set);
  if (loc.gen !== "oot") throw new Error("this set has no oot-generation audio tables");
  const fontIds = opts.banks && opts.banks.length ? opts.banks : null;
  if (!fontIds) throw new Error("renderN64 needs the sequence's font ids");
  const sampleRate = opts.sampleRate || N64_RATE;
  const mem = ootMemory(set);
  const fonts = new Map();
  const out = {sampleRate, seconds: 0, silent: [], warnings: [], reverb: null, reverbs: []};
  const warned = new Set();
  const warn = w => { if (!warned.has(w)) { warned.add(w); out.warnings.push(w); } };
  const fontOf = i => { const id = fontIds[i] != null ? fontIds[i] : fontIds[0]; if (!fonts.has(id)) { try { fonts.set(id, readFont(set, loc, id, {mem})); } catch (e) { warn(e.message); fonts.set(id, null); } } return fonts.get(id); };
  const groups = channelGroups(result, opts.meter || {});
  // the synthesis reverbs: opts.reverbs (null = dry), else the capture's, else the rip's RAM
  let reverbs = opts.reverbs !== undefined ? opts.reverbs : opts.reverb === null || opts.reverb === false ? null : result.reverbs;
  if (reverbs === undefined) { try { reverbs = findOotReverbs(mem.ram); } catch { reverbs = []; } }
  if (reverbs && !reverbs.length && opts.reverb !== null && opts.reverb !== false) warn("reverb state not in this rip");
  reverbs = reverbs || [];
  for (const r of reverbs) {
    if (r.subDelay) warn(`reverb ${r.index}: sub-delay ${r.subDelay} not modelled`);
    if (r.mixIndex !== -1 && r.mixIndex != null) warn(`reverb ${r.index}: mixing from reverb ${r.mixIndex} not modelled`);
  }
  out.reverbs = reverbs.map(r => ({index: r.index, window: r.window * r.downsampleRate, decayRatio: r.decayRatio, volume: r.volume, leakRtl: r.leakRtl, leakLtr: r.leakLtr, filtered: !!(r.filterLeft || r.filterRight)}));
  out.reverb = out.reverbs[0] || null;
  const {tempos, notes} = result;
  const endTick = Math.max(result.endTick || 0, ...notes.map(n => n.tick + n.dur));
  const seconds = Math.min(opts.keepSeconds || Infinity, tickSeconds(tempos, endTick) + 2.5);
  out.seconds = seconds;
  const N = Math.ceil(seconds * sampleRate);
  const updateEvery = sampleRate / OOT_UPDATES_PER_SECOND;
  const CAP = 3.99996;                                                   // Audio_NoteSetResamplingRate
  let done = 0, total = 0;
  for (const g of groups) total += g.notes.length;
  for (const g of groups) {
    let bufL = null, bufR = null;
    const wet = new Map();                                               // reverb index -> {l, r}
    for (const n of g.notes) {
      done++;
      if (opts.onProgress && (done & 31) === 0) { opts.onProgress(done / total); await new Promise(r => setTimeout(r, 0)); }
      const t0 = tickSeconds(tempos, n.tick);
      if (t0 >= seconds) continue;
      const font = fontOf(n.bank || 0);
      if (!font) continue;
      // AudioSeq_SeqLayerProcessScriptStep4: the tuned sample, its frequency, the layer's adsr
      let sound = null, freq = 0, layerEnv = null, layerDecay = 0, drum = null;
      if (n.drum) {
        drum = font.drum(n.semitone);
        if (!drum) { warn(`drum ${n.semitone} is not in font ${font.id}`); continue; }
        sound = drum.sound; freq = sound ? sound.tuning : 0; layerEnv = drum.envelope; layerDecay = drum.decayIndex;
      } else {
        if (n.inst == null) { warn(`channel ${n.ch} plays before any instrument is set (silent, as the game skips it)`); continue; }
        if (n.inst >= 0x80) { warn(`instrument ${n.inst} on channel ${n.ch} is a synth waveform, not rendered`); continue; }
        if (n.inst === 0x7E) { warn(`channel ${n.ch} plays the font's sound effects, not rendered`); continue; }
        const inst = font.instrument(n.inst);
        if (!inst) { warn(`instrument ${n.inst} is not in font ${font.id}`); continue; }
        sound = font.sound(inst, n.porta ? Math.max(n.porta.start, n.porta.end) : n.semitone);
        freq = sound ? ootPitch(n.porta ? n.porta.start : n.semitone) * sound.tuning : 0;
        if (n.lyAdsr) {
          if (n.lyAdsr.inst != null) { const li = font.instrument(n.lyAdsr.inst); if (li) { layerEnv = li.envelope; layerDecay = li.decayIndex; } }
          else { layerEnv = n.lyAdsr.envelope; layerDecay = n.lyAdsr.releaseRate; }
        }
      }
      if (!sound || !sound.sample || !(freq > 0)) continue;
      if (sound.sample.codec !== 0) { warn(`a sample in font ${font.id} is codec ${sound.sample.codec}, not VADPCM — not rendered`); continue; }
      // a few absent bytes are zeros the rip left out; a sample mostly absent was never read by the ripper's game
      if (sound.sample.dataPresent < 0.9) warn(`font ${font.id}: a sample's data is mostly not in the rip (silence where it is missing)`);
      const chInst = n.chInst != null ? font.instrument(n.chInst) : null;
      const chEnv = n.chEnv || (chInst ? chInst.envelope : OOT_DEFAULT_ENVELOPE);
      const chDecay = n.chRel != null ? n.chRel : chInst ? chInst.decayIndex : OOT_DEFAULT_DECAY_INDEX;
      const envelope = layerDecay === 0 || !layerEnv ? chEnv : layerEnv;
      const fadeOut = ootDecayRate(layerDecay === 0 ? chDecay : layerDecay);
      const vel = Math.max(0, Math.min(127, n.vel || 0)) / 127;
      const velSq = vel * vel;
      let vol = n.vol != null ? n.vol : 1, level = velSq * vol * vol;
      if (level <= 0 && !(n.gain && n.gain.some(x => x.l > 0))) continue;
      const steps = n.gain ? n.gain.map(x => ({i: Math.floor(tickSeconds(tempos, n.tick + x.t) * sampleRate), l: x.l})) : null;
      let gi = 0;
      const vibChanges = n.vib && n.vibChanges ? n.vibChanges.map(c => ({...c, i: Math.floor(tickSeconds(tempos, n.tick + c.t) * sampleRate)})) : [];
      const vib = n.vib ? new OotVibrato(n.vib, vibChanges) : null;
      const porta = n.porta ? new OotPortamento(n.porta) : null;
      const rv = reverbs.find(r => r.index === (n.revIdx || 0) % 4) || null;
      const send = rv && n.rev ? (n.rev & 0x7F) / 128 : 0;
      const [gL, gR] = ootPanGains(n, drum);
      // the send's bit 7 reaches aEnvMixer as its swap flag: the wet sides trade places
      const [wL, wR] = n.rev & 0x80 ? [gR, gL] : [gL, gR];
      let smp;
      try { smp = font.pcm(sound.sample); } catch (e) { warn(e.message); continue; }
      const pcm = smp.pcm, L = smp.loopEnd, loopStart = smp.loopStart;
      let baseStep = Math.min(CAP, freq * (n.freq != null ? n.freq : 1)) * N64_RATE / sampleRate;
      let step = baseStep;
      // the channel bend while the note holds (n.freqChanges, D3/DE): AudioEffects_SequenceChannelProcessSound
      const bends = n.freqChanges ? n.freqChanges.map(c => ({i: Math.floor(tickSeconds(tempos, n.tick + c.t) * sampleRate), f: c.f})) : null;
      let bi = 0;
      const i0 = Math.floor(t0 * sampleRate), iOff = Math.floor(tickSeconds(tempos, n.tick + n.dur) * sampleRate);
      const env = new OotAdsr(envelope);
      let pos = 0, nextUpdate = i0, gPrev = 0, gNext = 0;
      let W = null;
      // AudioSynth_ProcessNote after the resampler: HiLoGain (UQ4.4, below 1.0 lifted to 1.0), the channel's
      // 8-tap filter, the comb filter y[n] = x[n − size/2] + gain/0x8000 · x[n]; all at the output rate
      const pre = n.chGain ? Math.max(0x10, n.chGain) / 16 : 1;
      const filt = n.filter ? firState(n.filter) : null;
      const comb = n.comb ? {d: Math.max(1, Math.round(n.comb.size / 2 * sampleRate / N64_RATE)), g: n.comb.gain / 0x8000, hist: null, p: 0} : null;
      if (comb) comb.hist = new Float32Array(comb.d);
      for (let i = i0; i < N; i++) {
        if (i >= nextUpdate) {
          if (i >= iOff && !env.decaying && !env.done) env.decay(fadeOut, n.chSustain || 0);
          const a = env.update();
          if (steps) { while (gi + 1 < steps.length && i >= steps[gi + 1].i) gi++; vol = steps[gi].l; level = velSq * vol * vol; }
          if (bends && bi < bends.length && i >= bends[bi].i) {
            while (bi + 1 < bends.length && i >= bends[bi + 1].i) bi++;
            baseStep = Math.min(CAP, freq * bends[bi++].f) * N64_RATE / sampleRate;
            step = baseStep;
          }
          if (vib || porta) {
            let f = 1;
            if (vib) { while (vib.ci < vibChanges.length && i >= vibChanges[vib.ci].i) vib.retarget(vibChanges[vib.ci++]); f *= vib.update(); }
            if (porta) f *= porta.update();
            step = Math.min(CAP * N64_RATE / sampleRate, baseStep * f);
          }
          gPrev = gNext; gNext = Math.min(1, level * a);
          if (env.done && gNext <= 0 && i > i0) break;
          nextUpdate += updateEvery;
        }
        if (pos >= L) { if (!smp.looping) break; pos = loopStart + (pos - loopStart) % (L - loopStart); }
        const p0 = pos | 0, f = pos - p0, a = pcm[p0], b = p0 + 1 < L ? pcm[p0 + 1] : smp.looping ? pcm[loopStart] : 0;
        const gain = gNext + (gPrev - gNext) * ((nextUpdate - i) / updateEvery);
        let x = (a + (b - a) * f) * pre;
        if (filt) x = fir(filt, x);
        if (comb) { const old = comb.hist[comb.p]; comb.hist[comb.p] = x; if (++comb.p === comb.d) comb.p = 0; x = old + comb.g * x; }
        const v = x * gain;
        if (v !== 0) {
          if (!bufL) { bufL = new Float32Array(N); bufR = new Float32Array(N); }
          bufL[i] += v * gL; bufR[i] += v * gR;
          if (send) { if (!W) { W = wet.get(rv.index); if (!W) wet.set(rv.index, W = {l: new Float32Array(N), r: new Float32Array(N)}); } W.l[i] += v * send * wL; W.r[i] += v * send * wR; }
        }
        pos += step;
      }
    }
    if (bufL) for (const [idx, w] of wet) {
      const r = reverbs.find(x => x.index === idx);
      const Wn = Math.max(1, Math.round(r.window * r.downsampleRate * sampleRate / N64_RATE));
      const G = r.decayRatio / 0x8000, V = r.volume / 0x8000, lr = r.leakRtl / 0x8000, ll = r.leakLtr / 0x8000;
      const fL = firState(r.filterLeft), fR = firState(r.filterRight);
      const ringL = new Float32Array(Wn), ringR = new Float32Array(Wn);
      for (let i = 0, p = 0; i < N; i++) {
        const rl = ringL[p], rr = ringR[p];
        bufL[i] += rl * V; bufR[i] += rr * V;
        let wl = rl * G, wr = rr * G;
        const wl0 = wl; wl += wr * lr; wr += wl0 * ll;               // AudioSynth_LeakReverb
        wl += w.l[i]; wr += w.r[i];
        ringL[p] = fL ? fir(fL, wl) : wl; ringR[p] = fR ? fir(fR, wr) : wr;
        if (++p === Wn) p = 0;
      }
    }
    if (bufL) out[g.name] = {l: bufL, r: bufR}; else out.silent.push(g.name);
  }
  if (opts.onProgress) opts.onProgress(1);
  return out;
}

// ---- the envelope a note is held under, for the .mid (N64 capture v2) -------
// noteEnvelopes(result, {set, banks}) → Map(note → {amp: Float32Array(dur), peak}), EAD only: per
// sequence tick of the note (k = 0 … dur − 1, the loudest the voice gets inside that tick, so an attack
// that lands within one tick is no shape), the voice's envelope level as an amplitude — sm64
// (adsr/32767)² (the volume law squares it), the oot generation's float ADSR as is. `peak` = the
// envelope's own highest level held (no release), so a note whose envelope never moves after its attack
// writes no shape. The envelope is the one the render picks, by the same rules (renderN64 /
// renderOotGen: the layer's unless its release is 0, then the channel's; a drum's own). Only the note's
// held span: the release after the note-off is the instrument's own (the .mid has no place for it). A
// note the render cannot voice (no bank, no instrument, a synth waveform) has no entry. A Rare result
// gets none: its notes carry their own n.env from the capture.
export function noteEnvelopes(result, opts = {}) {
  const out = new Map();
  if (!result || !result.notes || !result.notes.length) return out;
  const {tempos} = result;
  const set = opts.set;
  // the tick windows of one note, in seconds from its start: [k] = [start of tick k, start of tick k + 1)
  const windows = n => { const t0 = tickSeconds(tempos, n.tick), w = new Float64Array(n.dur + 1); for (let k = 0; k <= n.dur; k++) w[k] = tickSeconds(tempos, n.tick + k) - t0; return w; };
  const perTick = (n, ups, step) => { // step(): the next update's amplitude; the update at j sits at j/ups s
    const w = windows(n), amp = new Float32Array(n.dur);
    let j = 0, last = 0;
    for (let k = 0; k < n.dur; k++) {
      let best = -1;
      while (j / ups < w[k + 1]) { last = step(); j++; if (last > best) best = last; if (j > 4e6) break; }
      amp[k] = best < 0 ? last : best;
    }
    return amp;
  };
  const peaks = new Map(); // envelope → its highest held level over 4 s (or until it hangs / ends)
  const peakOf = (key, make, ups) => {
    if (peaks.has(key)) return peaks.get(key);
    const env = make();
    let p = 0;
    for (let j = 0; j < 4 * ups; j++) { const a = env.update(); if (a > p) p = a; if (env.done || env.state === HANG) break; } // HANG = O_HANG: both generations hold there
    peaks.set(key, p);
    return p;
  };
  // Rare: the capture already shapes its notes (rare.mjs attachVoiceShapes: the sound's envelope × a
  // one-shot sample's fade, as n.env) — a second shape here would fade them twice
  if (result.driver === "rare") return out;
  const oot = result.gen === "oot";
  const rom = opts.rom || (set && set.rom);
  const bankIds = opts.banks && opts.banks.length ? opts.banks : null;
  if (!bankIds || (oot ? !set : !rom)) return out;
  const cache = new Map();
  let loc = null, mem = null, files = null;
  const bankOf = i => {
    const id = bankIds[i] != null ? bankIds[i] : bankIds[0];
    if (!cache.has(id)) {
      let b = null;
      try {
        if (oot) { if (!loc) { loc = opts.loc && opts.loc.gen === "oot" ? opts.loc : locateEAD(set); mem = ootMemory(set); } b = readFont(set, loc, id, {mem}); }
        else { if (!files) files = opts.files || findAudioFiles(rom, opts.loc || null); b = readBank(rom, files, id); }
      } catch { b = null; }
      cache.set(id, b);
    }
    return cache.get(id);
  };
  for (const n of result.notes) {
    const bank = bankOf(n.bank || 0);
    if (!bank) continue;
    let layerEnv = null, layerRel = 0;
    if (n.drum) {
      const d = bank.drum(n.semitone);
      if (!d) continue;
      layerEnv = d.envelope; layerRel = oot ? d.decayIndex : d.releaseRate;
    } else {
      if (n.inst == null || n.inst >= 0x80 || (oot && n.inst === 0x7E)) continue;
      if (!bank.instrument(n.inst)) continue;
      if (n.lyAdsr) {
        if (n.lyAdsr.inst != null) { const li = bank.instrument(n.lyAdsr.inst); if (li) { layerEnv = li.envelope; layerRel = oot ? li.decayIndex : li.releaseRate; } }
        else { layerEnv = n.lyAdsr.envelope; layerRel = n.lyAdsr.releaseRate; }
      }
    }
    const chInst = n.chInst != null ? bank.instrument(n.chInst) : null;
    const chEnv = n.chEnv || (chInst ? chInst.envelope : oot ? OOT_DEFAULT_ENVELOPE : DEFAULT_ENVELOPE);
    const envelope = layerRel === 0 || !layerEnv ? chEnv : layerEnv;
    if (!envelope) continue;
    const ups = oot ? OOT_UPDATES_PER_SECOND : UPDATES_PER_SECOND;
    const make = oot ? () => new OotAdsr(envelope) : () => { const a = new Adsr(envelope); return {update: () => { const v = a.update() / 32767; return v * v; }, get done() { return a.done; }, get state() { return a.state; }}; };
    const peak = peakOf(envelope, make, ups);
    if (!(peak > 0)) continue;
    const env = make();
    out.set(n, {amp: perTick(n, ups, () => env.update()), peak});
  }
  return out;
}
