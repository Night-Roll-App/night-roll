// Game Boy APU sample renderer: the captured register log (the same apuLog
// the note reconstructor reads) played through the DMG's actual DSP state
// machines — duty sequencers, hardware envelopes, length counters, the
// pulse-1 sweep, the 32-sample wave channel, the 15/7-bit noise LFSR, the
// 512 Hz frame sequencer. Twin of tools/nsf/apu-render.mjs: the chip's own
// sound, not an oscillator approximation.
//
// renderApu(apuLog, frames, frameSec, {sampleRate, keepFrames, onProgress})
//   -> {pulse1, pulse2, wave, noise: Float32Array, sampleRate, seconds}
// Per-channel buffers so the app's mute/solo gain nodes keep working; the
// stereo mix is folded to mono per channel (NR51 routes, NR50 scales).
import { microYield } from "../nsf/nsf.mjs";
import { GB_CLOCK } from "./gbs.mjs";

const DUTY = [
  [0, 0, 0, 0, 0, 0, 0, 1],
  [0, 0, 0, 0, 0, 0, 1, 1],
  [0, 0, 0, 0, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 0, 0],
];
const SEQ_CYCLES = GB_CLOCK / 512; // frame-sequencer period in T-states

export async function renderApu(apuLog, frames, frameSec, opts = {}) {
  const sampleRate = opts.sampleRate || 44100;
  const keepFrames = opts.keepFrames || frames;
  const seconds = keepFrames * frameSec;
  const N = Math.ceil(seconds * sampleRate);
  const out = {
    pulse1: new Float32Array(N), pulse2: new Float32Array(N),
    wave: new Float32Array(N), noise: new Float32Array(N),
    sampleRate, seconds,
  };
  const cps = GB_CLOCK / sampleRate; // T-states per output sample

  // ---- channel states
  const mkEnv = () => ({init: 0, dir: 0, pace: 0, timer: 0, vol: 0});
  const p = [0, 1].map(() => ({
    dac: false, on: false, duty: 0, pos: 0, timer: 0, period: 0,
    len: 0, lenEnable: false, env: mkEnv(),
    sweep: {pace: 0, dir: 0, shift: 0, timer: 0, shadow: 0, enabled: false},
  }));
  const w = {dac: false, on: false, level: 0, period: 0, timer: 0, pos: 0, len: 0, lenEnable: false, ram: new Uint8Array(32)};
  const n = {dac: false, on: false, shift: 0, width: 0, div: 0, timer: 0, lfsr: 0, len: 0, lenEnable: false, env: mkEnv()};
  let power = false, nr50 = 0, nr51 = 0;

  const sweepCalc = (ch) => { // returns the new period or -1 on overflow (which silences the channel)
    const s = ch.sweep, delta = s.shadow >> s.shift;
    const f = s.dir ? s.shadow - delta : s.shadow + delta;
    if (f > 2047) { ch.on = false; return -1; }
    return f;
  };
  const trigger = (ch, kind) => {
    if (!ch.dac) return;
    ch.on = true;
    if (ch.len === 0) ch.len = kind === "wave" ? 256 : 64;
    if (kind === "pulse") {
      ch.timer = (2048 - ch.period) * 4;
      ch.env.vol = ch.env.init; ch.env.timer = ch.env.pace || 8;
      const s = ch.sweep;
      s.shadow = ch.period; s.timer = s.pace || 8; s.enabled = !!(s.pace || s.shift);
      if (s.shift) sweepCalc(ch); // the immediate overflow check
    } else if (kind === "wave") {
      ch.timer = (2048 - ch.period) * 2; ch.pos = 0;
    } else {
      ch.timer = (ch.div ? 16 * ch.div : 8) << ch.shift;
      ch.env.vol = ch.env.init; ch.env.timer = ch.env.pace || 8;
      ch.lfsr = 0;
    }
  };
  const powerOff = () => {
    for (const ch of [p[0], p[1], w, n]) { ch.on = false; ch.dac = false; ch.len = 0; ch.lenEnable = false; ch.period = 0; }
    for (const ch of [p[0], p[1], n]) { Object.assign(ch.env, mkEnv()); }
    p[0].duty = p[1].duty = 0; w.level = 0; n.shift = n.width = n.div = 0;
    Object.assign(p[0].sweep, {pace: 0, dir: 0, shift: 0}); nr50 = 0; nr51 = 0;
  };
  const write = (addr, v) => {
    if (addr === 0xFF26) { const was = power; power = !!(v & 0x80); if (was && !power) powerOff(); return; }
    if (!power) return;
    if (addr === 0xFF24) { nr50 = v; return; }
    if (addr === 0xFF25) { nr51 = v; return; }
    if (addr >= 0xFF30 && addr <= 0xFF3F) { const i = (addr - 0xFF30) * 2; w.ram[i] = v >> 4; w.ram[i + 1] = v & 0xF; return; }
    if (addr >= 0xFF10 && addr <= 0xFF19) { // pulses
      const ch = addr < 0xFF15 ? p[0] : p[1];
      switch (addr - (addr < 0xFF15 ? 0xFF10 : 0xFF15)) {
        case 0: ch.sweep.pace = (v >> 4) & 7; ch.sweep.dir = (v >> 3) & 1; ch.sweep.shift = v & 7; break;
        case 1: ch.duty = v >> 6; ch.len = 64 - (v & 0x3F); break;
        case 2: ch.env.init = v >> 4; ch.env.dir = (v >> 3) & 1; ch.env.pace = v & 7; ch.dac = (v & 0xF8) !== 0; if (!ch.dac) ch.on = false; break;
        case 3: ch.period = (ch.period & 0x700) | v; break;
        case 4: ch.period = (ch.period & 0xFF) | ((v & 7) << 8); ch.lenEnable = !!(v & 0x40); if (v & 0x80) trigger(ch, "pulse"); break;
      }
      return;
    }
    if (addr >= 0xFF1A && addr <= 0xFF1E) {
      switch (addr - 0xFF1A) {
        case 0: w.dac = !!(v & 0x80); if (!w.dac) w.on = false; break;
        case 1: w.len = 256 - v; break;
        case 2: w.level = (v >> 5) & 3; break;
        case 3: w.period = (w.period & 0x700) | v; break;
        case 4: w.period = (w.period & 0xFF) | ((v & 7) << 8); w.lenEnable = !!(v & 0x40); if (v & 0x80) trigger(w, "wave"); break;
      }
      return;
    }
    if (addr >= 0xFF20 && addr <= 0xFF23) {
      switch (addr - 0xFF1F) {
        case 1: n.len = 64 - (v & 0x3F); break;
        case 2: n.env.init = v >> 4; n.env.dir = (v >> 3) & 1; n.env.pace = v & 7; n.dac = (v & 0xF8) !== 0; if (!n.dac) n.on = false; break;
        case 3: n.shift = v >> 4; n.width = (v >> 3) & 1; n.div = v & 7; break;
        case 4: n.lenEnable = !!(v & 0x40); if (v & 0x80) trigger(n, "noise"); break;
      }
    }
  };

  // ---- frame sequencer
  let seqAcc = 0, seqStep = 0;
  const clockLen = (ch) => { if (ch.lenEnable && ch.len > 0 && --ch.len === 0) ch.on = false; };
  const clockEnv = (ch) => {
    const e = ch.env;
    if (!e.pace || --e.timer > 0) return;
    e.timer = e.pace;
    const v = e.vol + (e.dir ? 1 : -1);
    if (v >= 0 && v <= 15) e.vol = v; // envelope reaching 0 does NOT turn the channel off
  };
  const clockSweep = () => {
    const ch = p[0], s = ch.sweep;
    if (--s.timer > 0) return;
    s.timer = s.pace || 8;
    if (!s.enabled || !s.pace) return;
    const f = sweepCalc(ch);
    if (f >= 0 && s.shift) { s.shadow = f; ch.period = f; sweepCalc(ch); }
  };
  const seqTick = () => {
    seqStep = (seqStep + 1) & 7;
    if ((seqStep & 1) === 0) { clockLen(p[0]); clockLen(p[1]); clockLen(w); clockLen(n); }
    if (seqStep === 2 || seqStep === 6) clockSweep();
    if (seqStep === 7) { clockEnv(p[0]); clockEnv(p[1]); clockEnv(n); }
  };

  // ---- register writes sorted and indexed by sample position
  const writes = [];
  for (const wr of apuLog) {
    const t = wr.frame * frameSec + (wr.cycle || 0) / GB_CLOCK;
    writes.push({i: Math.floor(t * sampleRate), addr: wr.addr, value: wr.value, order: writes.length});
  }
  writes.sort((a, b) => a.i - b.i || a.order - b.order);

  // DAC: 0-15 -> -1..+1 while on, 0 when off. Panning folds to mono: both
  // sides 1, one side ½, unrouted 0; NR50 scales by (L+1 + R+1)/16.
  const dac = v => v / 7.5 - 1;
  const gain = (bit) => {
    const l = (nr51 >> (bit + 4)) & 1, r = (nr51 >> bit) & 1;
    const lv = ((nr50 >> 4) & 7) + 1, rv = (nr50 & 7) + 1;
    return 0.25 * (l * lv + r * rv) / 16; // 0.25: four channels sum inside ±1
  };

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let last = now(), wi = 0;
  for (let i = 0; i < N; i++) {
    while (wi < writes.length && writes[wi].i <= i) { write(writes[wi].addr, writes[wi].value); wi++; }
    seqAcc += cps;
    while (seqAcc >= SEQ_CYCLES) { seqAcc -= SEQ_CYCLES; seqTick(); }
    // pulses: duty step every (2048 - period) * 4 T-states
    for (let k = 0; k < 2; k++) {
      const ch = p[k];
      if (ch.dac && power) {
        ch.timer -= cps;
        while (ch.timer <= 0) { ch.timer += (2048 - ch.period) * 4; ch.pos = (ch.pos + 1) & 7; }
        const v = ch.on ? DUTY[ch.duty][ch.pos] * ch.env.vol : 0;
        out[k ? "pulse2" : "pulse1"][i] = dac(v) * gain(k);
      }
    }
    // wave: one 4-bit sample every (2048 - period) * 2 T-states, 32 per pass
    if (w.dac && power) {
      w.timer -= cps;
      while (w.timer <= 0) { w.timer += (2048 - w.period) * 2; w.pos = (w.pos + 1) & 31; }
      const s = w.on && w.level ? w.ram[w.pos] >> (w.level - 1) : 0;
      out.wave[i] = dac(s) * gain(2);
    }
    // noise: LFSR clocked every (div ? 16*div : 8) << shift T-states
    if (n.dac && power) {
      if (n.shift < 14) {
        n.timer -= cps;
        const per = (n.div ? 16 * n.div : 8) << n.shift;
        while (n.timer <= 0) {
          n.timer += per;
          const x = ((n.lfsr ^ (n.lfsr >> 1)) & 1) ^ 1; // XNOR of bits 0,1 feeds bit 15 (and 7 in short mode)
          n.lfsr = (n.lfsr & 0x7FFF) | (x << 15);
          if (n.width) n.lfsr = (n.lfsr & ~0x80) | (x << 7);
          n.lfsr >>= 1;
        }
      }
      const v = n.on && (n.lfsr & 1) ? n.env.vol : 0;
      out.noise[i] = dac(v) * gain(3);
    }
    if ((i & 0x3FFF) === 0 && now() - last >= 35) {
      if (opts.onProgress) opts.onProgress(i / N);
      await microYield();
      last = now();
    }
  }
  // the console's output stage is AC-coupled: strip the DAC's DC step (a
  // silent channel sits at -1 otherwise, and that pops on mute/solo)
  const hp = Math.exp(-2 * Math.PI * 20 / sampleRate);
  for (const name of ["pulse1", "pulse2", "wave", "noise"]) {
    const buf = out[name];
    let prevIn = 0, prevOut = 0;
    for (let i = 0; i < N; i++) {
      const x = buf[i];
      const y = x - prevIn + hp * prevOut;
      prevIn = x; prevOut = y; buf[i] = y;
    }
  }
  return out;
}
