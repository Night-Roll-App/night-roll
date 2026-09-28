// Nintendo EAD audio tables inside a USF set (usf.mjs gives the sparse ROM
// and RDRAM). Two table generations, both located by structure, not by
// hard-coded addresses, then cross-checked:
//
// sm64 generation — each of the three ROM blobs starts with an ALSeqFile
//   header {s16 revision; s16 count; {u32 offset, u32 len}[count]} (sm64
//   decomp load.c / libaudio.h). The sequence blob is the one followed by
//   the bank-set table, whose first u16 offset is 2*count (gAlBankSets:
//   u16 offset[seq] then {count, bankIds...}).
// oot generation — the tables live in the `code` overlay, i.e. in RDRAM,
//   not in the sparse ROM (code is Yaz0-compressed on the cartridge). Each
//   is {u16 count; s16 medium; u32 romAddr; pad[8]} then 16-byte entries
//   {u32 romAddr, u32 size, u8 medium, u8 cachePolicy, u16 x3}
//   (oot decomp audio_load.c: AudioTable). After AudioLoad_InitTable the
//   entries hold absolute ROM addresses and entry 0's equals the header's.
//   gSoundFontTable, gSequenceFontTable (u16 offsets then {count, ids}),
//   gSequenceTable lie in that order, so the u16 right after the font
//   table equals 2 * (number of sequences) — that identifies both.
//
// USF rips only carry the ROM bytes the game read while the ripper played
// every track, so a sequence is "present" when its whole ROM range is in
// the image; sm64's sequence 0 (the sound-effect player) never is.
import { PJ64_RDRAM, rdramOf } from "./usf.mjs";

const align16 = v => (v + 15) & ~15;

export function readALSeqFile(img, at) {
  const revision = img.u16(at), count = img.u16(at + 2);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const offset = img.u32(at + 4 + i * 8), len = img.u32(at + 8 + i * 8);
    entries.push({offset, len, rom: at + offset});
  }
  const last = entries[entries.length - 1];
  return {at, revision, count, entries, end: at + align16(last.offset + last.len)};
}

function plausibleALSeqFile(img, p) {
  if (img.coverage(p, 12) < 1) return null;
  const rev = img.u16(p), count = img.u16(p + 2);
  if (rev > 3 || count < 2 || count > 0x100) return null;
  const hdr = 4 + 8 * count;
  if (img.coverage(p, hdr) < 1) return null;
  let f;
  try { f = readALSeqFile(img, p); } catch { return null; }
  if (f.entries[0].offset !== align16(hdr) && f.entries[0].offset !== hdr) return null;
  let prev = 0;
  for (const e of f.entries) {
    if (e.offset < hdr || e.offset < prev || e.len === 0 || e.len > 0x400000) return null;
    prev = e.offset + e.len;
  }
  return f;
}

// every ALSeqFile header in the sparse ROM, and which one is the sequence file
export function findALSeqFiles(rom) {
  const files = [];
  for (const r of rom.runs()) {
    for (let p = r.offset; p + 12 <= r.offset + r.length; p += 4) {
      const f = plausibleALSeqFile(rom, p);
      if (!f) continue;
      files.push(f);
      p = f.at + 4 + 8 * f.count - 4;
    }
  }
  let seqFile = null, bankSets = null;
  for (const f of files) {
    if (!rom.has(f.end, 2) || rom.u16(f.end) !== 2 * f.count) continue;
    seqFile = f; bankSets = f.end;
    break;
  }
  return {files, seqFile, bankSets};
}

// sm64: bank ids for sequence n — u16 offset into a byte table of
// {count, ids...}, ids listed last-first (load.c's 0xC6 handler counts down)
export function sm64BankSet(rom, bankSets, n) {
  const off = rom.u16(bankSets + n * 2);
  const count = rom.u8(bankSets + off);
  const ids = [];
  for (let i = 0; i < count; i++) ids.push(rom.u8(bankSets + off + 1 + i));
  return ids.reverse();
}

// oot: table headers whose entry 0 matches the header's romAddr
export function findAudioTables(ram) {
  const out = [];
  for (const r of ram.runs()) {
    // header and entry 0 may sit in different runs (only the words the game
    // read are in the rip), so bound the loop by the header alone
    for (let p = align16(r.offset); p + 8 <= r.offset + r.length; p += 16) {
      if (ram.coverage(p, 8) < 1 || ram.coverage(p + 16, 12) < 1) continue;
      const count = ram.u16(p), medium = ram.u16(p + 2), romAddr = ram.u32(p + 4);
      if (count < 2 || count > 0x200 || medium > 3 || romAddr === 0 || romAddr > 0x4000000) continue;
      if (ram.u32(p + 16) !== romAddr || ram.u32(p + 20) === 0 || ram.u8(p + 24) > 3) continue;
      out.push({at: p, count, medium, romAddr, entriesAt: p + 16, end: p + 16 + count * 16});
    }
  }
  return out;
}

export function readAudioTable(ram, t) {
  const entries = [];
  for (let i = 0; i < t.count; i++) {
    const e = t.entriesAt + i * 16;
    if (ram.coverage(e, 12) < 1) { entries.push(null); continue; } // never read by the game during the rip
    entries.push({rom: ram.u32(e), size: ram.u32(e + 4), medium: ram.u8(e + 8), cachePolicy: ram.u8(e + 9)});
  }
  // size 0 = alias of entry `rom` (oot AudioLoad_GetRealTableIndex)
  return entries.map(e => e && e.size === 0 && e.rom < t.count ? {...entries[e.rom], aliasOf: e.rom} : e);
}

// oot: gSequenceFontTable — u16 offset per sequence into {count, fontIds}
export function ootFontsOf(ram, tableAt, n) {
  if (ram.coverage(tableAt + n * 2, 2) < 1) return null;
  const off = ram.u16(tableAt + n * 2);
  if (ram.coverage(tableAt + off, 1) < 1) return null;
  const count = ram.u8(tableAt + off);
  const ids = [];
  for (let i = 0; i < count; i++) ids.push(ram.u8(tableAt + off + 1 + i));
  return ids;
}

// The whole picture for one loaded set: generation, tables, and one row
// per sequence with its ROM range and how much of it the rip carries.
export function locateEAD(set) {
  const {rom} = set;
  const sm = findALSeqFiles(rom);
  if (sm.seqFile) {
    const f = sm.seqFile;
    const sequences = f.entries.map((e, id) => ({id, rom: e.rom, size: e.len, coverage: rom.coverage(e.rom, e.len),
                                                 banks: sm64BankSet(rom, sm.bankSets, id)}));
    return {gen: "sm64", abi: "sm64", sequences, seqFile: f, bankSets: sm.bankSets,
            otherFiles: sm.files.filter(x => x !== f).map(x => ({at: x.at, revision: x.revision, count: x.count, end: x.end}))};
  }
  const {ram} = rdramOf(set.state);
  const tables = findAudioTables(ram);
  for (const font of tables) {
    if (ram.coverage(font.end, 2) < 1) continue;
    const n = ram.u16(font.end);
    if (n & 1) continue;
    const seqTable = tables.find(t => t !== font && t.count === n / 2);
    if (!seqTable) continue;
    const entries = readAudioTable(ram, seqTable);
    const sequences = entries.map((e, id) => e
      ? {id, rom: e.rom, size: e.size, coverage: rom.coverage(e.rom, e.size), aliasOf: e.aliasOf, cachePolicy: e.cachePolicy, fonts: ootFontsOf(ram, font.end, id)}
      : {id, rom: null, size: 0, coverage: 0, fonts: ootFontsOf(ram, font.end, id)});
    return {gen: "oot", abi: "oot", sequences, seqTable, fontTable: font, seqFontTable: font.end,
            audioseq: seqTable.romAddr, audiobank: font.romAddr,
            otherTables: tables.filter(t => t !== font && t !== seqTable).map(t => ({at: t.at, count: t.count, romAddr: t.romAddr}))};
  }
  return {gen: null, abi: null, sequences: [], tables, alseq: sm.files};
}

// oot: sequences the game had already loaded when the ripper took the
// state never touch the ROM again, so the rip carries them in RDRAM. The
// audio heap's caches record them as AudioCacheEntry {u8* ramAddr; u32
// size; s16 tableType; s16 id} (oot include/audio.h; SEQUENCE_TABLE = 0).
export function findCachedSequences(ram, sequences) {
  const out = new Map();
  for (const r of ram.runs()) {
    for (let p = r.offset & ~3; p + 12 <= r.offset + r.length; p += 4) {
      const addr = ram.u32(p);
      if ((addr >>> 24) !== 0x80 || (addr & 3)) continue;
      const size = ram.u32(p + 4), type = ram.u16(p + 8), id = ram.u16(p + 10);
      if (type !== 0 || id >= sequences.length || size === 0) continue;
      const seq = sequences[id];
      if (!seq || seq.size !== size) continue;
      const phys = addr & 0x1FFFFFFF;
      if (!out.has(id)) out.set(id, {id, entryAt: p, ram: phys, size, coverage: ram.coverage(phys, size)});
    }
  }
  return out;
}

export function sequenceBytes(set, seq) {
  if (seq.rom == null) throw new Error(`sequence ${seq.id}: table entry not in the rip`);
  return set.rom.read(seq.rom, seq.size, {strict: true});
}

// Which sequence a mini plays. Two rip styles seen (INTEGRATION.md):
//  "li-a1": the ripper parked the CPU just before the play call and
//           patched `addiu a1, zero, <seq>` at PC+4 (SM64, OoT sets);
//  "ram":   the id sits in a RAM word (MM set; address is per set).
export function decodeLiA1(word) {
  if (word >>> 26 !== 9 || ((word >>> 21) & 31) !== 0 || ((word >>> 16) & 31) !== 5) return null; // addiu a1, zero, imm
  return word & 0xFFFF;
}
export function miniSequenceId(set, rule = {kind: "li-a1"}) {
  const {ram} = rdramOf(set.state);
  if (rule.kind === "ram") return ram.coverage(rule.addr, 4) < 1 ? null : ram.u32(rule.addr);
  const pcb = set.state.read(0x4c, 4, {strict: true});
  const pc = (pcb[0] | (pcb[1] << 8) | (pcb[2] << 16) | (pcb[3] << 24)) >>> 0;
  const at = (pc & 0x1FFFFFFF) + 4;
  if (ram.coverage(at, 4) < 1) return null;
  return decodeLiA1(ram.u32(at));
}

// Sets are told apart by the usflib the minis name (the ROM header page is
// never in the rip: nothing reads it while music plays). Names are the
// rippers' NUS-<game code>-<region> convention; the game code is the
// cartridge's, so a manifest keyed on it stays valid for other rips.
export const USF_GAMES = {
  "nus-nsme-usa.usflib": {code: "NSME", title: "Super Mario 64", abi: "sm64", seqId: {kind: "li-a1"}},
  "nus-czle-usa.usflib": {code: "CZLE", title: "The Legend of Zelda: Ocarina of Time", abi: "oot", seqId: {kind: "li-a1"}},
  "nus-nzse-usa.usflib": {code: "NZSE", title: "The Legend of Zelda: Majora's Mask", abi: "mm", seqId: {kind: "ram", addr: 0x1F9B24}},
};
export function gameOfSet(set) {
  const lib = (set.order || []).find(n => /\.usflib$/i.test(n));
  return lib ? USF_GAMES[lib.split(/[\\/]/).pop().toLowerCase()] || null : null;
}

// The synthesis reverb the game was running when the rip's state was taken:
// sm64's `struct SynthesisReverb` (synthesis.h, JP/US layout) {u8
// resampleFlags, useReverb, framesLeftToIgnore, curFrame; u16 reverbGain;
// u16 resampleRate; s32 nextRingBufferPos; s32 unkC; s32 bufSizePerChannel;
// s16 *ringBuffer.left, *right; ...}, filled by heap.c audio_reset_session
// from the level's gAudioSessionPresets row (bufSizePerChannel =
// reverbWindowSize, reverbGain = preset->reverbGain, useReverb = 8, the two
// ring buffers allocated windowSize*2 bytes apart). Found by that shape, not
// by address: useReverb 8 or 0, gain 1..0x7FFF, window 0x100..0x8000, both
// ring pointers in RDRAM and exactly window*2 apart. The SM64 US set holds
// it at 0x80220DB0. Returns {at, useReverb, gain, window} or null when the
// rip's RAM pages do not carry it.
export function findSynthesisReverb(ram) {
  for (const r of ram.runs()) {
    for (let p = r.offset & ~3; p + 8 <= r.offset + r.length; p += 4) {
      const use = ram.u8(p + 1);
      if ((use !== 8 && use !== 0) || ram.u8(p + 2) > 2 || ram.u8(p + 3) > 1) continue;
      const gain = ram.u16(p + 4);
      if (gain === 0 || gain > 0x7FFF || ram.coverage(p + 0x10, 12) < 1) continue;
      const window = ram.u32(p + 0x10), left = ram.u32(p + 0x14), right = ram.u32(p + 0x18);
      if (window < 0x100 || window > 0x8000 || (left >>> 24) !== 0x80 || (right >>> 24) !== 0x80 || right - left !== window * 2) continue;
      return {at: p, useReverb: use, gain, window};
    }
  }
  return null;
}
