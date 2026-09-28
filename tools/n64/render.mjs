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
// is 0, then the channel's). Not here: pan (mono), reverb, vibrato,
// portamento, the RSP's resampler (linear interpolation instead), the
// synth waveforms of instrument ids >= 0x80 (skipped, listed in
// `warnings`), and volume changes during a note (the value at note-on).
import { tickSeconds } from "./seq-libultra.mjs";
import { channelGroups } from "./notes.mjs";
import { findAudioFiles, readBank, DEFAULT_ENVELOPE, DEFAULT_RELEASE_RATE } from "./bank.mjs";

export const N64_RATE = 32000;          // freqScale 1.0 plays a sample at the output rate (32006 Hz on the US console)
export const UPDATES_PER_SECOND = 240;  // gAudioUpdatesPerFrame = ALIGN16(32006 / 60) / 160 + 1 = 4, per 60 Hz frame (heap.c)
const ADSR_DISABLE = 0, ADSR_HANG = -1, ADSR_GOTO = -2, ADSR_RESTART = -3;
const DISABLED = 0, INITIAL = 1, LOOP = 3, FADE = 4, HANG = 5, DECAY = 6;
const FREQ_CAP = 3.99992;               // process_notes: the resampler's ceiling
const VOL_SCALE = 4.3498e-5;            // process_notes: adsr level → ~1/23000

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

export const noteFrequency = semitone => Math.pow(2, (semitone - 39) / 12) * (semitone >= 117 ? 0.5 : 1); // gNoteFrequencies

// -> {sampleRate, seconds, [trackName]: Float32Array, silent: [names], warnings: [...]}
export async function renderN64(result, opts = {}) {
  const rom = opts.rom || (opts.set && opts.set.rom);
  if (!rom) throw new Error("renderN64 needs the set's ROM image");
  const bankIds = opts.banks && opts.banks.length ? opts.banks : null;
  if (!bankIds) throw new Error("renderN64 needs the sequence's bank ids");
  const sampleRate = opts.sampleRate || N64_RATE;
  const files = opts.files || findAudioFiles(rom, opts.loc || null);
  const banks = new Map();
  const bankOf = i => { const id = bankIds[i] != null ? bankIds[i] : bankIds[0]; if (!banks.has(id)) banks.set(id, readBank(rom, files, id)); return banks.get(id); };
  const groups = channelGroups(result, opts.meter || {});
  const {tempos, notes} = result;
  const endTick = Math.max(result.endTick || 0, ...notes.map(n => n.tick + n.dur));
  const seconds = Math.min(opts.keepSeconds || Infinity, tickSeconds(tempos, endTick) + 2.5);
  const N = Math.ceil(seconds * sampleRate);
  const out = {sampleRate, seconds, silent: [], warnings: []};
  const warned = new Set();
  const warn = w => { if (!warned.has(w)) { warned.add(w); out.warnings.push(w); } };
  const updateEvery = sampleRate / UPDATES_PER_SECOND;
  let done = 0, total = 0;
  for (const g of groups) total += g.notes.length;
  for (const g of groups) {
    let buf = null; // allocated by the first note that sounds
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
        freq = sound ? noteFrequency(n.semitone) * sound.tuning : 0;
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
      const base = vel * vel * (n.vol != null ? n.vol : 1);
      if (base <= 0) continue;
      const smp = bank.pcm(sound.sample);
      const pcm = smp.pcm, L = smp.loopEnd, loopStart = smp.loopStart;
      const step = Math.min(FREQ_CAP, freq * (n.freq != null ? n.freq : 1)) * N64_RATE / sampleRate;
      const i0 = Math.floor(t0 * sampleRate), iOff = Math.floor(tickSeconds(tempos, n.tick + n.dur) * sampleRate);
      const env = new Adsr(envelope);
      let pos = 0, nextUpdate = i0, gPrev = 0, gNext = 0;
      for (let i = i0; i < N; i++) {
        if (i >= nextUpdate) {
          if (i >= iOff && env.state !== DECAY && !env.done) env.decay(releaseRate);
          const level = env.update() * VOL_SCALE;
          gPrev = gNext; gNext = Math.min(32767, base * level * level) / 32767;
          if (env.done && gNext <= 0 && i > i0) break;
          nextUpdate += updateEvery;
        }
        if (pos >= L) { if (!smp.looping) break; pos = loopStart + (pos - loopStart) % (L - loopStart); }
        const p0 = pos | 0, f = pos - p0, a = pcm[p0], b = p0 + 1 < L ? pcm[p0 + 1] : smp.looping ? pcm[loopStart] : 0;
        const gain = gNext + (gPrev - gNext) * ((nextUpdate - i) / updateEvery);
        const v = (a + (b - a) * f) * gain;
        if (v !== 0) { if (!buf) buf = new Float32Array(N); buf[i] += v; }
        pos += step;
      }
    }
    if (buf) out[g.name] = buf; else out.silent.push(g.name);
  }
  if (opts.onProgress) opts.onProgress(1);
  return out;
}
