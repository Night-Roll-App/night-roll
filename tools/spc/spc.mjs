// SPC loader + playback driver: restores the dumped SPC700/DSP state, runs
// the CPU for N seconds of emulated time, and logs every DSP register
// write with a cycle timestamp — the "apuLog" of the NES pipeline. Also
// decodes every BRR sample a voice is keyed on with, because a note's
// pitch cannot be named without the sample it played (see RESEARCH.md §3.3).
import { SPC700 } from "./cpu-spc700.mjs";
import { DspVoices } from "./dsp-state.mjs";
import { decodeBRR } from "./brr.mjs";
import { microYield } from "../nsf/nsf.mjs";

export const CPU_HZ = 1_024_000;
export const SAMPLE_RATE = 32_000;
const CYCLES_PER_SAMPLE = CPU_HZ / SAMPLE_RATE; // 32

export function parseSPC(buf) {
  const d = new Uint8Array(buf);
  const magic = "SNES-SPC700 Sound File Data";
  for (let i = 0; i < magic.length; i++) if (d[i] !== magic.charCodeAt(i)) throw new Error("not an SPC file");
  if (d.length < 0x10180) throw new Error("SPC file truncated (" + d.length + " bytes)");
  const str = (off, len) => {
    let s = "";
    for (let i = off; i < off + len && d[i]; i++) s += String.fromCharCode(d[i]);
    return s.trim();
  };
  const hasTags = d[0x23] === 26;
  // text vs binary ID666 has no flag: digits in the seconds field mean text
  const textTags = hasTags && [0xA9, 0xAA, 0xAB].every(o => d[o] === 0 || (d[o] >= 0x30 && d[o] <= 0x39));
  const tags = !hasTags ? {} : {
    title: str(0x2E, 32), game: str(0x4E, 32), dumper: str(0x6E, 16), comment: str(0x7E, 32),
    date: textTags ? str(0x9E, 11) : (d[0x9E] | (d[0x9F] << 8) | (d[0xA0] << 16) | (d[0xA1] << 24)),
    seconds: textTags ? +str(0xA9, 3) || 0 : (d[0xA9] | (d[0xAA] << 8) | (d[0xAB] << 16)),
    fadeMs: textTags ? +str(0xAC, 5) || 0 : (d[0xAC] | (d[0xAD] << 8) | (d[0xAE] << 16) | (d[0xAF] << 24)),
    artist: str(0xB1, 32), channelDisables: d[0xD1], emulator: d[0xD2], textFormat: textTags,
  };
  return {
    version: d[0x24],
    pc: d[0x25] | (d[0x26] << 8), a: d[0x27], x: d[0x28], y: d[0x29], psw: d[0x2A], sp: d[0x2B],
    tags, hasTags,
    ram: d.slice(0x100, 0x10100),
    dsp: d.slice(0x10100, 0x10180),
    extraRam: d.slice(0x101C0, 0x10200),
    xid6: d.length > 0x10200 ? d.slice(0x10200) : null,
    name: tags.title || "", game: tags.game || "", artist: tags.artist || "",
  };
}

function makeRun(spc) {
  const ram = new Uint8Array(spc.ram);          // copy: the emulation mutates it
  const regs = new Uint8Array(spc.dsp);
  const dsp = new DspVoices(ram, regs);
  dsp.restoreFromRegs();
  const dspLog = [];                            // {cycle, sample, addr, value}
  const instruments = new Map();                // "srcn@start" -> decoded sample + usage
  const voiceInstruments = Array.from({length: 8}, () => new Set());
  const portOut = new Uint8Array(4);            // what the driver says to the (absent) main CPU
  let dspAddr = ram[0xF2];
  let control = ram[0xF1];

  // timers: 0/1 at 8 kHz, 2 at 64 kHz; 8-bit stage counter, 4-bit output
  const timers = [128, 128, 16].map((div, i) => ({div, acc: 0, stage: 0, out: 0, target: ram[0xFA + i]}));
  const enabled = t => (control >> t) & 1;

  const capture = (v) => { // decode the sample voice v just keyed on, once per (srcn, start)
    const srcn = regs[v * 16 + 4];
    const base = ((regs[0x5D] << 8) + srcn * 4) & 0xFFFF;
    const start = ram[base] | (ram[(base + 1) & 0xFFFF] << 8);
    const loop = ram[(base + 2) & 0xFFFF] | (ram[(base + 3) & 0xFFFF] << 8);
    const key = srcn + "@" + start.toString(16);
    let inst = instruments.get(key);
    if (!inst) {
      inst = {id: instruments.size, key, srcn, ...decodeBRR(ram, start, loop), uses: 0, voices: new Set()};
      instruments.set(key, inst);
    }
    inst.uses++; inst.voices.add(v);
    voiceInstruments[v].add(key);
    return key;
  };

  const bus = {
    read(a) {
      if (a >= 0xF0 && a <= 0xFF) {
        if (a === 0xF2) return dspAddr;
        if (a === 0xF3) return regs[dspAddr & 0x7F];
        if (a >= 0xFD) { const t = timers[a - 0xFD]; const v = t.out; t.out = 0; return v; }
        // $F4-$F7: the main CPU's last words, frozen in the dump; $F0/$F1/$FA-$FC write-only, $F8/$F9 RAM
        return ram[a];
      }
      // IPL ROM window ($FFC0+) is not modelled: a dumped driver never runs from it
      return ram[a];
    },
    write(a, v) {
      if (a >= 0xF0 && a <= 0xFF) {
        if (a === 0xF1) {
          for (let t = 0; t < 3; t++) if ((v >> t) & 1 && !enabled(t)) { timers[t].stage = 0; timers[t].out = 0; }
          if (v & 0x10) { ram[0xF4] = 0; ram[0xF5] = 0; }
          if (v & 0x20) { ram[0xF6] = 0; ram[0xF7] = 0; }
          control = v; ram[a] = v; return;
        }
        if (a === 0xF2) { dspAddr = v; ram[a] = v; return; }
        if (a === 0xF3) {
          if (dspAddr < 0x80) {
            const reg = dspAddr;
            dspLog.push({cycle: cpu.cycles, sample: (cpu.cycles / CYCLES_PER_SAMPLE) | 0, addr: reg, value: v});
            if ((reg & 0x0F) !== 8 && (reg & 0x0F) !== 9 && reg !== 0x7C) regs[reg] = v; // ENVX/OUTX/ENDX are the DSP's to write
            if (reg === 0x4C) for (let vv = 0; vv < 8; vv++) if (v & (1 << vv)) capture(vv);
            dsp.write(reg, v);
          }
          return;
        }
        if (a >= 0xF4 && a <= 0xF7) { portOut[a - 0xF4] = v; return; } // input latch (what we read) stays
        if (a >= 0xFA && a <= 0xFC) { timers[a - 0xFA].target = v; ram[a] = v; return; }
        if (a >= 0xFD) return; // counters are read-only
        ram[a] = v; return;
      }
      ram[a] = v;
    },
  };

  const cpu = new SPC700(bus);
  cpu.pc = spc.pc; cpu.a = spc.a; cpu.x = spc.x; cpu.y = spc.y; cpu.sp = spc.sp; cpu.setPsw(spc.psw);
  // voices mid-note at dump time never get a KON we could see: capture their samples now
  for (let v = 0; v < 8; v++) if (regs[v * 16 + 8] & 0x7F) capture(v);

  let dspAcc = 0;
  const advance = (dt) => { // clocks timers and the DSP tracker for dt CPU cycles
    for (let t = 0; t < 3; t++) {
      const tm = timers[t];
      tm.acc += dt;
      while (tm.acc >= tm.div) {
        tm.acc -= tm.div;
        if (!enabled(t)) continue;
        tm.stage = (tm.stage + 1) & 0xFF;
        if (tm.stage === tm.target) { tm.stage = 0; tm.out = (tm.out + 1) & 0x0F; }
      }
    }
    dspAcc += dt;
    while (dspAcc >= CYCLES_PER_SAMPLE) { dspAcc -= CYCLES_PER_SAMPLE; dsp.tick(); }
  };

  const runUntil = (cycleTarget) => { // -> true while the CPU is still alive
    while (cpu.cycles < cycleTarget) {
      if (cpu.halted) { advance(cycleTarget - cpu.cycles); cpu.cycles = cycleTarget; return false; }
      advance(cpu.step());
    }
    return true;
  };

  const result = (seconds) => ({
    dspLog, dsp0: spc.dsp, ram, sampleRate: SAMPLE_RATE, seconds,
    samples: Math.round(seconds * SAMPLE_RATE),
    instruments, voiceInstruments, portOut, halted: cpu.halted, cycles: cpu.cycles,
  });
  return {cpu, runUntil, result};
}

export function runSPC(spc, seconds) {
  const st = makeRun(spc);
  st.runUntil(Math.round(seconds * CPU_HZ));
  return st.result(seconds);
}

// Browser twin: same emulation, yields to the event loop on a time budget
// (see runNSFAsync — iOS Safari's watchdog kills a tab that blocks).
export async function runSPCAsync(spc, seconds, onProgress, budgetMs = 35) {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const st = makeRun(spc);
  const total = Math.round(seconds * CPU_HZ);
  const chunk = CPU_HZ / 20; // 50 ms of emulated time per slice
  let last = now();
  for (let c = chunk; c <= total; c += chunk) {
    if (!st.runUntil(Math.min(c, total))) break;
    if (now() - last >= budgetMs) {
      if (onProgress) onProgress(c / total);
      await microYield();
      last = now();
    }
  }
  st.runUntil(total);
  return st.result(seconds);
}
