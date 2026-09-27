// GBS loader + playback driver — tools/nsf/nsf.mjs for the Game Boy: runs a
// song's INIT, then calls PLAY at the header's rate (timer or v-blank),
// logging every APU register write ($FF10-$FF3F) with a (frame, order,
// cycle) timestamp. No audio is rendered — the log IS the output.
// Format facts: tools/gbs/RESEARCH.md §1.
import { SM83 } from "./cpu-sm83.mjs";
import { microYield } from "../nsf/nsf.mjs";

export const GB_CLOCK = 4194304;            // DMG master clock, Hz
const VBLANK_HZ = GB_CLOCK / 70224;         // 59.7275 Hz, one LCD frame
const TIMER_HZ = [4096, 262144, 65536, 16384]; // TAC bits 1-0

export function parseGBS(buf) {
  const d = new Uint8Array(buf);
  if (String.fromCharCode(d[0], d[1], d[2]) !== "GBS") throw new Error("not a GBS file");
  const str = (off, len) => {
    let s = "";
    for (let i = off; i < off + len && d[i]; i++) s += String.fromCharCode(d[i]);
    return s;
  };
  const u16 = o => d[o] | (d[o + 1] << 8);
  const tma = d[0x0E], tac = d[0x0F];
  // play rate: TAC bit 2 picks the timer, else v-blank; bit 7 = CGB double speed
  let playRateHz = VBLANK_HZ;
  if (tac & 0x04) {
    playRateHz = TIMER_HZ[tac & 3] / (256 - tma);
    if (tac & 0x80) playRateHz *= 2;
  }
  return {
    version: d[3],
    songs: d[4],
    startSong: d[5],           // 1-based (INIT wants it 0-based)
    loadAddr: u16(0x06),
    initAddr: u16(0x08),
    playAddr: u16(0x0A),
    sp: u16(0x0C),
    tma, tac,
    timerMode: !!(tac & 0x04),
    playRateHz,
    name: str(0x10, 32),
    artist: str(0x30, 32),
    copyright: str(0x50, 32),
    data: d.subarray(0x70),
  };
}

function makeRun(gbs) { // shared machine state for the sync and async runners
  // ROM is a flat image with the file's data laid at loadAddr; 16K pages
  // are cut from that image ("aligned relative to the load address")
  const end = gbs.loadAddr + gbs.data.length;
  const rom = new Uint8Array(Math.max(0x8000, Math.ceil(end / 0x4000) * 0x4000));
  rom.set(gbs.data, gbs.loadAddr);
  const pages = rom.length >> 14;
  let page = 1;                             // the switchable slot ($4000-$7FFF)
  const vram = new Uint8Array(0x2000), xram = new Uint8Array(0x2000);
  const wram = new Uint8Array(0x2000), oam = new Uint8Array(0xA0);
  const io = new Uint8Array(0x80), hram = new Uint8Array(0x7F);
  let ie = 0;
  const apuLog = [];                        // {frame, order, cycle, addr, value}
  let frame = 0, order = 0, frameStart = 0;

  let cpu; // assigned below; the bus reads its cycle counter for DIV/LY
  const bus = {
    read(a) {
      if (a < 0x4000) return rom[a];
      if (a < 0x8000) { const i = (page % pages) * 0x4000 + (a - 0x4000); return i < rom.length ? rom[i] : 0xFF; }
      if (a < 0xA000) return vram[a - 0x8000];
      if (a < 0xC000) return xram[a - 0xA000];
      if (a < 0xE000) return wram[a - 0xC000];
      if (a < 0xFE00) return wram[a - 0xE000];  // echo RAM
      if (a < 0xFEA0) return oam[a - 0xFE00];
      if (a < 0xFF00) return 0xFF;
      if (a === 0xFF04) return (cpu.cycles >> 8) & 0xFF;              // DIV: 16384 Hz off the master clock
      if (a === 0xFF44) return Math.floor(cpu.cycles / 456) % 154;    // LY: a rolling scanline so wait loops terminate
      if (a === 0xFF26) return (io[0x26] & 0x80) | 0x0F;              // NR52: power bit + "all channels active" (nsf.mjs's $4015 rule)
      if (a < 0xFF80) return io[a - 0xFF00];
      if (a < 0xFFFF) return hram[a - 0xFF80];
      return ie;
    },
    write(a, v) {
      if (a < 0x2000) return;                                  // RAM enable
      if (a < 0x4000) { page = v || 1; return; }               // MBC1 page select (0 reads as 1)
      if (a < 0x8000) return;                                  // upper-bank / mode selects: spec says ignore
      if (a < 0xA000) { vram[a - 0x8000] = v; return; }
      if (a < 0xC000) { xram[a - 0xA000] = v; return; }
      if (a < 0xE000) { wram[a - 0xC000] = v; return; }
      if (a < 0xFE00) { wram[a - 0xE000] = v; return; }
      if (a < 0xFEA0) { oam[a - 0xFE00] = v; return; }
      if (a < 0xFF00) return;
      if (a === 0xFFFF) { ie = v; return; }
      if (a >= 0xFF80) { hram[a - 0xFF80] = v; return; }
      if (a >= 0xFF10 && a <= 0xFF3F) apuLog.push({frame, order: order++, cycle: cpu.cycles - frameStart, addr: a, value: v});
      io[a - 0xFF00] = v; // other I/O (timer, LCD, joypad) is write-and-forget
    },
  };

  cpu = new SM83(bus);
  cpu.rstBase = gbs.loadAddr; // "a GBS player vectors RSTs relative to the load address"
  const SENTINEL = 0xFEA0;    // return address in the unusable region: halts execution
  const callsub = (addr, a) => {
    cpu.halted = false;
    cpu.a = a;
    cpu.sp = gbs.sp;
    cpu.push16(SENTINEL);
    cpu.pc = addr;
    frameStart = cpu.cycles;
    let guard = 0;
    while (cpu.pc !== SENTINEL && !cpu.halted && guard++ < 4_000_000) cpu.step();
    if (guard >= 4_000_000) throw new Error("runaway subroutine at frame " + frame);
  };

  return {apuLog, callsub, setFrame(f) { frame = f; order = 0; }};
}

export function runGBS(gbs, songIndex1Based, seconds) {
  const state = makeRun(gbs);
  state.callsub(gbs.initAddr, songIndex1Based - 1); // A = song, zero-based
  const frameSec = 1 / gbs.playRateHz;
  const frames = Math.round(seconds / frameSec);
  for (let f = 1; f <= frames; f++) {
    state.setFrame(f);
    state.callsub(gbs.playAddr, 0);
  }
  return {apuLog: state.apuLog, frames, frameSec};
}

// Browser twin of runGBS: identical emulation, yields to the event loop on a
// time budget so a long capture can't trip iOS Safari's watchdog (the NSF
// pipeline's 2026-08-16 lesson; see runNSFAsync). onProgress(0..1) optional.
export async function runGBSAsync(gbs, songIndex1Based, seconds, onProgress, budgetMs = 35) {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const state = makeRun(gbs);
  state.callsub(gbs.initAddr, songIndex1Based - 1);
  const frameSec = 1 / gbs.playRateHz;
  const frames = Math.round(seconds / frameSec);
  let last = now();
  for (let f = 1; f <= frames; f++) {
    state.setFrame(f);
    state.callsub(gbs.playAddr, 0);
    if (now() - last >= budgetMs) {
      if (onProgress) onProgress(f / frames);
      await microYield();
      last = now();
    }
  }
  return {apuLog: state.apuLog, frames, frameSec};
}
