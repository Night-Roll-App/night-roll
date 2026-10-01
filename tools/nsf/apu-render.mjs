// APU sample renderer: the captured register log (the same apuLog the note
// reconstructor reads) played through the NES 2A03's actual DSP state
// machines — duty sequencers, hardware envelope units, length counters,
// sweep, triangle linear counter, noise LFSR, Nesdev output curves. This is
// the chip's own sound, not an oscillator approximation: a 33ms arpeggio
// run is ONE pulse wave changing period, exactly as on hardware.
//
// renderApu(apuLog, frames, frameSec, {sampleRate, keepFrames, onProgress})
//   -> {pulse1, pulse2, triangle, noise: Float32Array, sampleRate, seconds}
// Per-channel buffers so the app's mute/solo gain nodes keep working; the
// cross-channel mixer nonlinearity is approximated per channel (audibly
// negligible next to timbre/envelope truth).

// microYield: shared with ./nsf.mjs (not a local copy — a local MessageChannel
// with no ref/unref, 2026-09-30, kept tools/chip-bench.mjs hanging after a
// render long enough to yield once; nsf.mjs's own copy already carries the
// Node ref/unref fix this one lacked).
import { microYield } from "./nsf.mjs";

const CPU = 1789773; // NTSC 2A03 CPU clock, Hz

const DUTY = [
  [0, 1, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 0, 0, 0],
  [1, 0, 0, 1, 1, 1, 1, 1],
];
const LENGTH_TABLE = [10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
                      12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30];
const NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
// 32-step triangle sequence 15..0 0..15
const TRI_SEQ = [];
for (let i = 15; i >= 0; i--) TRI_SEQ.push(i);
for (let i = 0; i <= 15; i++) TRI_SEQ.push(i);

function makeEnvelope() { // shared by pulses + noise
  return {start: false, loop: false, constVol: false, period: 0, divider: 0, decay: 0, vol: 0};
}
function clockEnvelope(env) { // quarter-frame
  if (env.start) { env.start = false; env.decay = 15; env.divider = env.period; }
  else if (env.divider > 0) env.divider--;
  else {
    env.divider = env.period;
    if (env.decay > 0) env.decay--;
    else if (env.loop) env.decay = 15;
  }
}
const envOut = env => env.constVol ? env.vol : env.decay;

export function renderApu(apuLog, frames, frameSec, opts = {}) {
  const sampleRate = opts.sampleRate || 44100;
  const keepFrames = opts.keepFrames || frames;
  const seconds = keepFrames * frameSec;
  const N = Math.ceil(seconds * sampleRate);
  const out = {
    pulse1: new Float32Array(N), pulse2: new Float32Array(N),
    triangle: new Float32Array(N), noise: new Float32Array(N),
    sampleRate, seconds,
  };

  // ---- channel states
  const p = [0, 1].map(() => ({
    env: makeEnvelope(), lenHalt: false, length: 0, duty: 0, phase: 0, seq: 0,
    timer: 0, enabled: false,
    sweep: {on: false, period: 0, negate: false, shift: 0, divider: 0, reload: false},
  }));
  const tri = {linear: 0, linReload: 0, linReloadFlag: false, control: false,
               length: 0, timer: 0, phase: 0, seq: 0, enabled: false};
  const noi = {env: makeEnvelope(), lenHalt: false, length: 0, mode: false,
               period: NOISE_PERIODS[0], lfsr: 1, phase: 0, enabled: false};

  const sweepTarget = (ch, i) => {
    const delta = ch.timer >> ch.sweep.shift;
    return ch.sweep.negate ? ch.timer - delta - (i === 0 ? 1 : 0) : ch.timer + delta;
  };

  // ---- register writes sorted and indexed by sample position
  const writes = [];
  for (const w of apuLog) if (w.frame <= keepFrames + 2) writes.push(w);
  writes.sort((a, b) => a.frame - b.frame || a.order - b.order);
  let wi = 0;

  const applyWrite = (addr, v) => {
    if (addr === 0x4015) {
      p[0].enabled = !!(v & 1); p[1].enabled = !!(v & 2);
      tri.enabled = !!(v & 4); noi.enabled = !!(v & 8);
      if (!p[0].enabled) p[0].length = 0;
      if (!p[1].enabled) p[1].length = 0;
      if (!tri.enabled) tri.length = 0;
      if (!noi.enabled) noi.length = 0;
      return;
    }
    if (addr >= 0x4000 && addr <= 0x4007) {
      const i = addr < 0x4004 ? 0 : 1, r = addr & 3, ch = p[i];
      if (r === 0) {
        ch.duty = (v >> 6) & 3;
        ch.lenHalt = ch.env.loop = !!(v & 0x20);
        ch.env.constVol = !!(v & 0x10);
        ch.env.vol = ch.env.period = v & 0x0F;
      } else if (r === 1) {
        ch.sweep.on = !!(v & 0x80);
        ch.sweep.period = (v >> 4) & 7;
        ch.sweep.negate = !!(v & 8);
        ch.sweep.shift = v & 7;
        ch.sweep.reload = true;
      } else if (r === 2) ch.timer = (ch.timer & 0x700) | v;
      else {
        ch.timer = (ch.timer & 0xFF) | ((v & 7) << 8);
        if (ch.enabled) ch.length = LENGTH_TABLE[(v >> 3) & 31];
        ch.env.start = true;
        ch.seq = 0; // sequencer phase resets on $4003 — the chip's attack click
      }
      return;
    }
    if (addr >= 0x4008 && addr <= 0x400B) {
      const r = addr & 3;
      if (r === 0) { tri.control = !!(v & 0x80); tri.linReload = v & 0x7F; }
      else if (r === 2) tri.timer = (tri.timer & 0x700) | v;
      else if (r === 3) {
        tri.timer = (tri.timer & 0xFF) | ((v & 7) << 8);
        if (tri.enabled) tri.length = LENGTH_TABLE[(v >> 3) & 31];
        tri.linReloadFlag = true;
      }
      return;
    }
    if (addr >= 0x400C && addr <= 0x400F) {
      const r = addr & 3;
      if (r === 0) {
        noi.lenHalt = noi.env.loop = !!(v & 0x20);
        noi.env.constVol = !!(v & 0x10);
        noi.env.vol = noi.env.period = v & 0x0F;
      } else if (r === 2) { noi.mode = !!(v & 0x80); noi.period = NOISE_PERIODS[v & 15]; }
      else if (r === 3) { if (noi.enabled) noi.length = LENGTH_TABLE[(v >> 3) & 31]; noi.env.start = true; }
    }
  };

  const quarterFrame = () => {
    clockEnvelope(p[0].env); clockEnvelope(p[1].env); clockEnvelope(noi.env);
    if (tri.linReloadFlag) tri.linear = tri.linReload;
    else if (tri.linear > 0) tri.linear--;
    if (!tri.control) tri.linReloadFlag = false;
  };
  const halfFrame = () => {
    for (let i = 0; i < 2; i++) {
      const ch = p[i], s = ch.sweep;
      if (s.divider === 0 && s.on && s.shift > 0 && ch.timer >= 8) {
        const t = sweepTarget(ch, i);
        if (t <= 0x7FF && t >= 0) ch.timer = t;
      }
      if (s.divider === 0 || s.reload) { s.divider = s.period; s.reload = false; }
      else s.divider--;
      if (!ch.lenHalt && ch.length > 0) ch.length--;
    }
    if (!tri.control && tri.length > 0) tri.length--;
    if (!noi.lenHalt && noi.length > 0) noi.length--;
  };

  // per-channel Nesdev output curves (single-channel view of the mixer)
  const pulseOut = lvl => lvl ? 95.88 / (8128 / lvl + 100) : 0;
  const triOut = lvl => 159.79 / (1 / (lvl / 8227) + 100);
  const noiOut = lvl => lvl ? 159.79 / (1 / (lvl / 12241) + 100) : 0;

  // 4x internal oversampling: fast pitch zaps (MM2 title sweeps the triangle
  // to period 0 = 56kHz — 40 sequencer steps per 44.1k sample) alias into
  // harsh garbage at 1x; rendered at 4x, the ultrasonic content exists
  // honestly and the output lowpass removes it, like the hardware chain
  const OS = 4;
  const iRate = sampleRate * OS;
  const cpuPerSample = CPU / iRate;
  const samplesPerFrame = frameSec * iRate;
  const qfSamples = iRate / 240; // quarter-frame cadence
  let nextQF = qfSamples, qfCount = 0;
  const chunk = (opts.chunk || 65536) * OS;
  const acc = {pulse1: 0, pulse2: 0, triangle: 0, noise: 0};

  const run = (from, to) => { // from/to in INTERNAL samples
    for (let s = from; s < to; s++) {
      const frameNow = s / samplesPerFrame;
      while (wi < writes.length && writes[wi].frame <= frameNow) {
        applyWrite(writes[wi].addr, writes[wi].value);
        wi++;
      }
      if (s >= nextQF) {
        quarterFrame();
        if (qfCount % 2 === 1) halfFrame();
        qfCount++;
        nextQF += qfSamples;
      }
      // pulses: sequencer steps at CPU/2 / (timer+1)
      for (let i = 0; i < 2; i++) {
        const ch = p[i];
        let lvl = 0;
        // the sweep unit's mute holds whether or not the sweep is enabled
        // (Nesdev): a target period past $7FF silences the pulse — with shift 0
        // that is every period from $400 up unless negate is set
        if (ch.enabled && ch.length > 0 && ch.timer >= 8 && ch.timer <= 0x7FF &&
            !(!ch.sweep.negate && sweepTarget(ch, i) > 0x7FF)) {
          ch.phase += cpuPerSample / (2 * (ch.timer + 1));
          if (ch.phase >= 1) { ch.seq = (ch.seq + Math.floor(ch.phase)) & 7; ch.phase %= 1; }
          if (DUTY[ch.duty][ch.seq]) lvl = envOut(ch.env);
        }
        acc[i === 0 ? "pulse1" : "pulse2"] += pulseOut(lvl) * 2;
      }
      // triangle: sequencer at CPU / (timer+1); holds last value when gated
      if (tri.enabled && tri.length > 0 && tri.linear > 0 && tri.timer >= 2) {
        tri.phase += cpuPerSample / (tri.timer + 1);
        if (tri.phase >= 1) { tri.seq = (tri.seq + Math.floor(tri.phase)) & 31; tri.phase %= 1; }
      }
      acc.triangle += triOut(TRI_SEQ[tri.seq]) * 2;
      // noise: LFSR clocks every noi.period CPU cycles
      if (noi.enabled && noi.length > 0) {
        noi.phase += cpuPerSample / noi.period;
        while (noi.phase >= 1) {
          const fb = (noi.lfsr & 1) ^ ((noi.lfsr >> (noi.mode ? 6 : 1)) & 1);
          noi.lfsr = (noi.lfsr >> 1) | (fb << 14);
          noi.phase--;
        }
        acc.noise += (noi.lfsr & 1) ? 0 : noiOut(envOut(noi.env)) * 2;
      }
      if ((s + 1) % OS === 0) { // decimate: mean of the OS internal samples
        const o = ((s + 1) / OS) - 1;
        if (o < N) {
          out.pulse1[o] = acc.pulse1 / OS; out.pulse2[o] = acc.pulse2 / OS;
          out.triangle[o] = acc.triangle / OS; out.noise[o] = acc.noise / OS;
        }
        acc.pulse1 = acc.pulse2 = acc.triangle = acc.noise = 0;
      }
    }
  };

  // the console's output filters: ~90Hz high-pass (kills the triangle's DC
  // hold between notes) + ~14kHz low-pass (tames the stepped edges), per
  // Nesdev's RC measurements
  const filter = (buf) => {
    const hp = Math.exp(-2 * Math.PI * 90 / sampleRate);
    const lp = 1 - Math.exp(-2 * Math.PI * 14000 / sampleRate);
    let hpPrevIn = 0, hpPrevOut = 0, lpOut = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i];
      hpPrevOut = hp * (hpPrevOut + x - hpPrevIn);
      hpPrevIn = x;
      lpOut += lp * (hpPrevOut - lpOut);
      buf[i] = lpOut;
    }
  };
  const finish = () => { filter(out.pulse1); filter(out.pulse2); filter(out.triangle); filter(out.noise); return out; };

  const Ni = N * OS;
  if (opts.onProgress) { // chunked async
    return (async () => {
      for (let s = 0; s < Ni; s += chunk) {
        run(s, Math.min(Ni, s + chunk));
        opts.onProgress(Math.min(1, (s + chunk) / Ni));
        await microYield();
      }
      return finish();
    })();
  }
  run(0, Ni);
  return finish();
}
