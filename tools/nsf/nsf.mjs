// NSF loader + playback driver: runs a song's init routine, then calls the
// play routine at the header's rate, logging every APU register write with
// a (frame, order-within-frame) timestamp. No audio is rendered — the log
// IS the output.
import { CPU6502 } from "./cpu6502.mjs";

// Expansion sound chips (header byte 0x7B, one bit each): the 2A03 pipeline
// captures none of them, and a file that uses one keeps its lead voices
// there — the Lagrange Point rip came back with 12 of 31 tracks silent and
// the rest a few seconds of accompaniment (2026-09-27). Half a song
// published is worse than none, so the parser refuses such a file by the
// chip's name and the import panel shows that; {expansion: true} parses it
// anyway (research, the header byte is still reported as `expansion`).
export const NSF_EXPANSION = [[0x01, "VRC6"], [0x02, "VRC7"], [0x04, "FDS"], [0x08, "MMC5"], [0x10, "Namco 163"], [0x20, "Sunsoft 5B"]];
export function nsfExpansion(mask) { return {mask, names: NSF_EXPANSION.filter(([bit]) => mask & bit).map(([, name]) => name)}; }
export function parseNSF(buf, opts = {}) {
  const d = new Uint8Array(buf);
  const magic = String.fromCharCode(...d.subarray(0, 5));
  if (magic !== "NESM\x1a") throw new Error("not an NSF file");
  const expansion = nsfExpansion(d[0x7B] & 0x3F);
  if (expansion.names.length && !opts.expansion) throw new Error("expansion sound chip " + expansion.names.join(" + ") + " not supported");
  const str = (off, len) => {
    let s = "";
    for (let i = off; i < off + len && d[i]; i++) s += String.fromCharCode(d[i]);
    return s;
  };
  const u16 = o => d[o] | (d[o + 1] << 8);
  const banks = [...d.subarray(0x70, 0x78)];
  return {
    version: d[5],
    songs: d[6],
    startSong: d[7],           // 1-based
    loadAddr: u16(0x08),
    initAddr: u16(0x0A),
    playAddr: u16(0x0C),
    name: str(0x0E, 32),
    artist: str(0x2E, 32),
    copyright: str(0x4E, 32),
    playSpeedNTSC: u16(0x6E) || 16639, // microseconds between play calls
    banks,
    banked: banks.some(b => b !== 0),
    expansion,
    data: d.subarray(0x80),
  };
}

function makeRun(nsf) { // shared machine state for the sync and async runners
  const ram = new Uint8Array(0x800);
  const sram = new Uint8Array(0x2000);        // $6000-$7FFF
  const rom = new Uint8Array(0x8000);         // $8000-$FFFF (non-banked view)
  const bankRegs = new Uint8Array(8);
  const apuLog = [];                          // {frame, order, addr, value}
  // $5FF8-$5FFF bank switches, for the DPCM render (apu-render.mjs reads its
  // samples from PRG): kept OUT of apuLog so the note reconstructor and every
  // log consumer see exactly what they always did. order = the next APU
  // write's order - 0.5: it sorts between the writes it fell between.
  const bankLog = [];
  let frame = 0, order = 0;
  // The NSF player, not the driver, enables the channels before INIT ($4015 =
  // $0F per the spec's player-side init). Castlevania's driver never writes
  // $4015 itself, so without this every track reconstructed silent (2026-09-27);
  // drivers that do write it (FF1, MM2) see the same log after their own write.
  apuLog.push({frame: 0, order: order++, addr: 0x4015, value: 0x0F});

  if (nsf.banked) {
    for (let i = 0; i < 8; i++) bankRegs[i] = nsf.banks[i];
  } else {
    rom.set(nsf.data.subarray(0, Math.min(nsf.data.length, 0x10000 - nsf.loadAddr)), nsf.loadAddr - 0x8000);
  }
  const bankRead = a => { // banked: $8000+ divided into 8 x 4K banks
    const slot = (a - 0x8000) >> 12;
    const off = bankRegs[slot] * 0x1000 + (a & 0xFFF);
    // banked data is offset by loadAddr's low 12 bits (padding convention)
    const idx = off - (nsf.loadAddr & 0xFFF) >= 0 ? off - (nsf.loadAddr & 0xFFF) : -1;
    return idx >= 0 && idx < nsf.data.length ? nsf.data[idx] : 0;
  };

  const bus = {
    read(a) {
      if (a < 0x2000) return ram[a & 0x7FF];
      if (a === 0x4015) return 0x0F; // all channels report active
      if (a >= 0x6000 && a < 0x8000) return sram[a - 0x6000];
      if (a >= 0x8000) return nsf.banked ? bankRead(a) : rom[a - 0x8000];
      return 0;
    },
    write(a, v) {
      if (a < 0x2000) { ram[a & 0x7FF] = v; return; }
      if (a >= 0x4000 && a <= 0x4017) { apuLog.push({frame, order: order++, addr: a, value: v}); return; }
      if (a >= 0x5FF8 && a <= 0x5FFF) { bankRegs[a - 0x5FF8] = v; bankLog.push({frame, order: order - 0.5, addr: a, value: v}); return; }
      if (a >= 0x6000 && a < 0x8000) { sram[a - 0x6000] = v; return; }
      // writes to ROM space ignored
    },
  };

  const cpu = new CPU6502(bus);
  const SENTINEL = 0x5555; // return address that halts execution
  const callsub = (addr, a, x) => {
    cpu.halted = false;
    cpu.a = a; cpu.x = x; cpu.y = 0;
    cpu.sp = 0xFD;
    const ret = (SENTINEL - 1) & 0xFFFF;
    cpu.push(ret >> 8); cpu.push(ret & 0xFF);
    cpu.pc = addr;
    let guard = 0;
    while (cpu.pc !== SENTINEL && !cpu.halted && guard++ < 2_000_000) cpu.step();
    if (guard >= 2_000_000) throw new Error("runaway subroutine at frame " + frame);
  };

  // the program image the capture ran — what a DPCM sample fetch reads (plain data: survives structuredClone)
  const prg = {banked: nsf.banked, loadAddr: nsf.loadAddr, data: nsf.data, banks: [...nsf.banks], bankLog};
  return {apuLog, prg, callsub, setFrame(f) { frame = f; order = 0; }};
}

export function runNSF(nsf, songIndex1Based, seconds) {
  const state = makeRun(nsf);
  state.callsub(nsf.initAddr, songIndex1Based - 1, 0); // A = song, X = 0 (NTSC)
  const frames = Math.round(seconds * 1_000_000 / nsf.playSpeedNTSC);
  for (let f = 1; f <= frames; f++) {
    state.setFrame(f);
    state.callsub(nsf.playAddr, 0, 0);
  }
  return {apuLog: state.apuLog, frames, frameSec: nsf.playSpeedNTSC / 1_000_000, prg: state.prg};
}

// Unthrottled yield: background tabs clamp setTimeout to ~1/sec, which turned
// a 1s loop scan into minutes; MessageChannel messages are macrotasks with no
// background throttling. Node (no MessageChannel pre-15? has it) falls back.
// In Node a port with a handler keeps the process alive forever (a render
// that yielded once hung `node --test` and every CLI after it), so the port
// is ref'd only while a yield is pending; browsers have no ref/unref.
let _mc = null;
export function microYield() {
  if (typeof MessageChannel === "undefined") return new Promise(r => setTimeout(r, 0));
  if (!_mc) { _mc = new MessageChannel(); if (_mc.port1.unref) _mc.port1.unref(); }
  return new Promise(r => {
    if (_mc.port1.ref) _mc.port1.ref();
    _mc.port1.onmessage = () => { if (_mc.port1.unref) _mc.port1.unref(); r(); };
    _mc.port2.postMessage(0);
  });
}

// Browser-friendly twin of runNSF: identical emulation, but yields to the
// event loop every `chunkFrames` so a long capture can't freeze the tab —
// iOS Safari's watchdog force-reloads a page that blocks too long (Josh's
// MM2 300s retry killed the whole import, 2026-08-16). onProgress(0..1)
// optional. Node/offline callers keep the sync runNSF.
export async function runNSFAsync(nsf, songIndex1Based, seconds, onProgress, budgetMs = 35) {
  // TIME-based yielding, not count-based: a fixed chunk size tuned on a fast
  // machine is seconds per chunk on an iPad — and iOS Safari's watchdog kills
  // the tab anyway (the 2026-08-16 crash chain). ~35ms keeps any device fluid.
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const state = makeRun(nsf);
  state.callsub(nsf.initAddr, songIndex1Based - 1, 0);
  const frames = Math.round(seconds * 1_000_000 / nsf.playSpeedNTSC);
  let last = now();
  for (let f = 1; f <= frames; f++) {
    state.setFrame(f);
    state.callsub(nsf.playAddr, 0, 0);
    if (now() - last >= budgetMs) {
      if (onProgress) onProgress(f / frames);
      await microYield(); // breathe: let the UI paint, keep the watchdog calm
      last = now();
    }
  }
  return {apuLog: state.apuLog, frames, frameSec: nsf.playSpeedNTSC / 1_000_000, prg: state.prg};
}
