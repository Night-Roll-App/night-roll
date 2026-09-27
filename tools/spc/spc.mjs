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
  // the emulator byte follows the field's format too: real text-format dumps
  // (every Zophar set checked) carry ASCII '0'..'2' there, not 0..2
  const emu = d[0xD2];
  const tags = !hasTags ? {} : {
    title: str(0x2E, 32), game: str(0x4E, 32), dumper: str(0x6E, 16), comment: str(0x7E, 32),
    date: textTags ? str(0x9E, 11) : (d[0x9E] | (d[0x9F] << 8) | (d[0xA0] << 16) | (d[0xA1] << 24)),
    seconds: textTags ? +str(0xA9, 3) || 0 : (d[0xA9] | (d[0xAA] << 8) | (d[0xAB] << 16)),
    fadeMs: textTags ? +str(0xAC, 5) || 0 : (d[0xAC] | (d[0xAD] << 8) | (d[0xAE] << 16) | (d[0xAF] << 24)),
    artist: str(0xB1, 32), channelDisables: d[0xD1],
    emulator: textTags && emu >= 0x30 && emu <= 0x39 ? emu - 0x30 : emu, textFormat: textTags,
  };
  const xid6 = d.length > 0x10200 ? d.slice(0x10200) : null;
  const ext = parseXid6(xid6);
  return {
    version: d[0x24],
    pc: d[0x25] | (d[0x26] << 8), a: d[0x27], x: d[0x28], y: d[0x29], psw: d[0x2A], sp: d[0x2B],
    tags, hasTags,
    ram: d.slice(0x100, 0x10100),
    dsp: d.slice(0x10100, 0x10180),
    extraRam: d.slice(0x101C0, 0x10200),
    xid6, ext,
    // ID666 text fields are 32 bytes: "Legend of Zelda: A Link to the P" is
    // what the header holds; the extended tag carries the whole name
    name: ext.title || tags.title || "", game: ext.game || tags.game || "", artist: ext.artist || tags.artist || "",
  };
}

// Extended ID666 ("xid6"): a RIFF-style chunk after the DSP/extra-RAM
// block, sub-chunks of {id, type, length} + 32-bit-aligned data. Type 0
// keeps the value IN the length field, 1 is a NUL-terminated string, 4 a
// 32-bit integer. Ids per the SNESAmp spec (spc_file_format.txt): 01-07
// long versions of the header fields, 10-14 OST metadata, 30-36 playback
// lengths in ticks of 1/64000 s. Absent or malformed -> {} (the header
// tags stand on their own).
const XID6_IDS = {
  0x01: "title", 0x02: "game", 0x03: "artist", 0x04: "dumper", 0x05: "date", 0x06: "emulator", 0x07: "comment",
  0x10: "ostTitle", 0x11: "ostDisc", 0x12: "ostTrack", 0x13: "publisher", 0x14: "year",
  0x30: "introTicks", 0x31: "loopTicks", 0x32: "endTicks", 0x33: "fadeTicks", 0x34: "muted", 0x35: "loopCount", 0x36: "amp",
};
export function parseXid6(x) {
  const out = {};
  if (!x || x.length < 8 || String.fromCharCode(x[0], x[1], x[2], x[3]) !== "xid6") return out;
  const size = x[4] | (x[5] << 8) | (x[6] << 16) | (x[7] << 24);
  const end = Math.min(x.length, 8 + size);
  let p = 8;
  while (p + 4 <= end) {
    const id = x[p], type = x[p + 1], len = x[p + 2] | (x[p + 3] << 8);
    p += 4;
    let val;
    if (type === 0) val = len;
    else {
      if (p + len > end) break;
      if (type === 1) { let s = ""; for (let i = 0; i < len && x[p + i]; i++) s += String.fromCharCode(x[p + i]); val = s.trim(); }
      else if (len === 4) val = (x[p] | (x[p + 1] << 8) | (x[p + 2] << 16) | (x[p + 3] << 24)) >>> 0;
      else val = Array.from(x.subarray(p, p + len));
      p += (len + 3) & ~3;
    }
    const key = XID6_IDS[id];
    if (key) out[key] = val;
    else (out.unknown = out.unknown || {})[id] = val;
  }
  // OST track packs "number << 8 | optional ASCII suffix" ("7a" -> 0x0761)
  if (out.ostTrack != null) {
    const n = out.ostTrack;
    out.ostTrack = n >> 8;
    out.ostTrackChar = (n & 0xFF) ? String.fromCharCode(n & 0xFF) : "";
  }
  if (out.introTicks != null) out.introSec = out.introTicks / 64000;
  if (out.fadeTicks != null) out.fadeSec = out.fadeTicks / 64000;
  if (out.loopTicks != null) out.loopSec = out.loopTicks / 64000;
  return out;
}

// Set naming as the Zophar/snesmusic rips use it: "<number><part> <title>.spc"
// where a 3-digit number is <disc><track><track> ("314c" = disc 3, track
// 14, part c), a 2-digit one is the track, a letter suffix splits one OST
// track into parts, and all-nines (99 / 999) marks a track that is not on
// the soundtrack. The title in the file name has '?' and '"' mangled to
// '_' — the ID666 title is the real one; this is for ORDER only.
export function parseTrackName(name) {
  // one separator char: "216 ____.spc" is a title of four underscores (a mangled "??")
  const m = /^(\d{2,3})([a-z]?)[ _-](.*?)(\.spc)?$/i.exec(name.replace(/^.*[\/\\]/, ""));
  if (!m) return null;
  const num = m[1], unlisted = /^9+$/.test(num);
  return {
    disc: num.length === 3 && !unlisted ? +num[0] : null,
    track: +num.slice(-2), part: m[2].toLowerCase(),
    unlisted, title: m[3],
  };
}

function makeRun(spc) {
  const ram = new Uint8Array(spc.ram);          // copy: the emulation mutates it
  const regs = new Uint8Array(spc.dsp);
  const dsp = new DspVoices(ram, regs);
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
  // Voices at t = 0 follow the SPC-player convention (blargg's SPC_DSP::load:
  // new_kon = REG(kon), every voice envelope zeroed): the dumped KON register
  // is a PENDING key-on, not history — dumpers hook the first KON write, so
  // the file holds KON bits with ENVX still 0 — and a voice that was sounding
  // without its KON bit stays silent until the driver keys it again. Logged
  // as a KON write at cycle 0 so the note builder sees an ordinary onset.
  // Without it a single-KON track (CT "Strong Wind"/"Time Vortex", FF4 "Down
  // the Well", ALttP "Unused Sound") never sounds and every song loses its
  // opening chord. KOFF bits win, as on the chip.
  const kon0 = regs[0x4C] & ~regs[0x5C];
  if (kon0) {
    dspLog.push({cycle: 0, sample: 0, addr: 0x4C, value: kon0});
    for (let v = 0; v < 8; v++) if (kon0 & (1 << v)) capture(v);
    dsp.write(0x4C, kon0);
  }

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
