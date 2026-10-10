// AKAO sequence reader — Square's PS1 house format across the driver's
// generations. Not SEQ: a tracker-style byte code, one stream per voice, note
// pitch as octave × 12 + degree, lengths from an 11-entry table at 48 ticks
// per quarter. This reads the score and simulates just enough of the driver
// (octave, transpose, loop stack, jumps, patterns, drum mode, key splits) to
// emit notes; it does not play anything.
//
// Which generation a file is comes from the file, never from the game
// (CLAUDE.md "No one-time hacks"):
//   - the header's SHAPE names the layout — VGMTrans's versions 1, 2, 3 are
//     the 0x14-, 0x20- and 0x40-byte headers (voice mask at 0x10/0x10/0x20,
//     track offsets after it, relative to the byte after the field in 1 and
//     2, to the field itself in 3);
//   - the DRIVER CODE in the same RAM image names the tick clock: the root-
//     counter target it loads as an immediate (0x43D1 or 0x44E8; a version-1
//     header alone cannot tell — one 1997 set with the 0x14 header runs on
//     0x44E8);
//   - the instrument data is whatever the image holds: INSTR.DAT records
//     found by shape (instr.mjs), or AKAO-headered sample sets (below).
// Layout and opcode sets: VGMTrans AkaoSeq.cpp / AkaoInstr.cpp and the Qhimm
// wiki "FF7/PSX/Sound/AKAO sequence", checked against real sets
// (INTEGRATION.md §6, §7). The three layouts' opcode maps differ above 0xDF:
// layout 1 has direct opcodes there; layouts 2 and 3 move them behind an
// escape byte (0xFC, 0xFE) and layout 3 spends 0xF0..0xFD on notes with an
// explicit length byte.
import { readInstr, adsrRecord } from "./instr.mjs";

export const AKAO_PPQ = 48;
// index = opcode % 11: whole, half, quarter, 8th, 16th, 32nd, 64th, then
// triplet half, quarter, 8th, 16th (VGMTrans DELTA_TIME_TABLE)
export const DELTA = [192, 96, 48, 24, 12, 6, 3, 32, 16, 8, 4];
// Root-counter targets the driver runs its tick accumulator on (sysclock / 8
// counted to the target; each interrupt adds the u16 tempo to a 16.16
// counter, one tick per overflow). Ticks per second = (33868800 / 8 / div) ×
// tempo / 65536. The two constants Square's drivers are known to load.
export const TIMER_DIV_FF7 = 0x43D1;
export const TIMER_DIV_LATER = 0x44E8;
export const TIMER_DIVS = [TIMER_DIV_FF7, TIMER_DIV_LATER];
export const timerHz = div => 33868800 / 8 / div;
export function akaoBpm(tempo, div = TIMER_DIV_FF7) {
  return tempo * timerHz(div) / 65536 * 60 / AKAO_PPQ;
}

// The driver's clock, read from its code: the root-counter set-up call
// `li a1, DIV` (`ori`/`addiu a1, zero, imm`) immediately followed by a `jal`
// (libapi SetRCnt(spec, target, mode); every set seen — FF7, SaGa Frontier,
// Parasite Eve, FF8, FF9, Chrono Cross — has exactly this pair, then `li a2,
// 0x1000`). The call context matters: a bare immediate scan also hits score
// bytes (an FF8 image holds a stray 0x43D1 in its data). A driver that loads
// exactly one of TIMER_DIVS this way has said which. -> {div | null, counts}
export function detectTimerDiv(bytes) {
  const d = new Uint8Array(bytes);
  const counts = {};
  for (const t of TIMER_DIVS) counts[t] = 0;
  for (let i = 0; i + 8 <= d.length; i += 4) {
    const op = d[i + 3];
    if ((op !== 0x34 && op !== 0x24) || d[i + 2] !== 0x05) continue; // rs = $zero, rt = $a1
    if ((d[i + 7] & 0xFC) !== 0x0C) continue;                          // next: jal
    const imm = d[i] | (d[i + 1] << 8);
    if (imm in counts) counts[imm]++;
  }
  const hit = TIMER_DIVS.filter(t => counts[t] > 0);
  return {div: hit.length === 1 ? hit[0] : null, counts};
}

const u16 = (d, o) => d[o] | (d[o + 1] << 8);
const u32 = (d, o) => (u16(d, o) | (u16(d, o + 2) << 16)) >>> 0;
const popcount = m => { let c = 0; for (m >>>= 0; m; m >>>= 1) c += m & 1; return c; };
const isMagic = (d, o) => d[o] === 0x41 && d[o + 1] === 0x4B && d[o + 2] === 0x41 && d[o + 3] === 0x4F; // "AKAO"

// The header layout a block has, by shape: the voice mask where the layout
// keeps it, every track offset landing inside the block. Layout 3 is tried
// first (its header has four zero words no score would leave), then 2 (a
// zero word at 0x1C), then 1. A sample set ("AKAO" with no length) matches
// none. -> {version, headerSize, maskAt, tableAt, base, mask, length} | null
export function akaoLayout(buf, off = 0) {
  const d = new Uint8Array(buf);
  if (off + 0x14 > d.length || !isMagic(d, off)) return null;
  const tryLayout = (version, headerSize, maskAt, tableAt, base, length) => {
    if (off + headerSize > d.length) return null;
    const mask = u32(d, off + maskAt);
    // layouts 1/2 drive the SPU's 24 voices; layout 3 names up to 32 score
    // channels (FF8: 0x3FFFFFFF) that the driver assigns to voices itself
    if (!mask || (version < 3 && mask > 0xFFFFFF)) return null;
    const k = popcount(mask), tableEnd = tableAt + 2 * k;
    if (tableEnd > length || off + tableEnd > d.length) return null;
    for (let i = 0; i < k; i++) {
      const p = tableAt + 2 * i, dest = p + base + u16(d, off + p);
      if (dest < tableEnd || dest >= length) return null;
    }
    return {version, headerSize, maskAt, tableAt, base, mask, length};
  };
  const len16 = u16(d, off + 6);
  // layout 3: zero words at 0x2C, 0x38, 0x3C; 0x24 and 0x28 hold voice
  // masks inside the one at 0x20 or zero (Chrono Cross's ambiences and 312
  // fill 0x28, which VGMTrans's test rejects)
  const sub = at => { const m = u32(d, off + at); return !m || (m & ~u32(d, off + 0x20)) === 0; };
  if (off + 0x40 <= d.length && sub(0x24) && sub(0x28) && !u32(d, off + 0x2C) && !u32(d, off + 0x38) && !u32(d, off + 0x3C)) {
    const v3 = tryLayout(3, 0x40, 0x20, 0x40, 0, len16); // layout 3 counts the whole block
    if (v3) return v3;
  }
  if (off + 0x20 <= d.length && !u32(d, off + 0x1C)) {
    const v2 = tryLayout(2, 0x20, 0x10, 0x20, 2, 0x10 + len16);
    if (v2) return v2;
  }
  return tryLayout(1, 0x14, 0x10, 0x14, 2, 0x10 + len16);
}

export function isAKAO(buf, off = 0) { return !!akaoLayout(buf, off); }

// every "AKAO" that is a sequence block in some layout (sample sets excluded)
export function scanAKAO(bytes) {
  const d = new Uint8Array(bytes), out = [];
  for (let i = 0; i + 0x14 <= d.length; i++) if (d[i] === 0x41 && isMagic(d, i) && akaoLayout(d, i)) out.push(i);
  return out;
}

// ---- sample sets: "AKAO" blocks that carry articulations and SPU-ADPCM ----
// Header (0x40): u16 id at 4, u32 SPU destination at 0x10, u32 sample section
// size at 0x14, u32 first articulation id at 0x18, u32 count (layout 3) or
// last id (layouts 1.1/2) at 0x1C. Articulations from 0x40, the sample bytes
// after them. Two articulation shapes: 0x40 bytes shaped exactly like an
// INSTR.DAT record with ABSOLUTE SPU addresses (the first one's address is
// the destination), or 0x10 bytes — sample offset, loop offset (both relative
// to the section), s16 fine tune, u16 unity key, ADSR1, ADSR2 — the first
// one's offset being 0. A third shape (0x40 with twelve base pitches at +8,
// VGMTrans's 3.0) is recognised and left unread.
export function akaoSampleSet(buf, off) {
  const d = new Uint8Array(buf);
  if (off + 0x50 > d.length || !isMagic(d, off) || u16(d, off + 6)) return null; // a sequence has its length here
  const dest = u32(d, off + 0x10), size = u32(d, off + 0x14), a = u32(d, off + 0x18), b = u32(d, off + 0x1C);
  if (!size || dest < 0x1000 || dest >= 0x80000 || dest + size > 0x80000 || (dest & 7) || (size & 7)) return null;
  const first = u32(d, off + 0x40);
  let shape, artSize, startArt = a, nArts;
  if (first === 0) {
    nArts = b;
    if (!nArts || nArts > 300 || a > 0x100) return null;
    // 0x10-byte articulations keep a unity key below 128 at +0x0A (VGMTrans's
    // test: the key's high byte is 0); a 0x40 record has base-pitch bytes there
    let narrow = true;
    for (let i = 0; i < nArts && narrow; i++) {
      const o = off + 0x40 + i * 0x10;
      if (o + 0x10 > d.length) return null;
      if (d[o + 0x0B] !== 0 || d[o + 0x0A] >= 0x80) narrow = false;
    }
    shape = narrow ? "art16" : "art64pitch"; artSize = narrow ? 0x10 : 0x40;
  } else if (first === dest) {
    shape = "instr"; artSize = 0x40;
    const end = b || (a ? 0x100 : 0x80);
    nArts = end - startArt;
    if (nArts <= 0 || nArts > 300) return null;
  } else return null;
  const artsAt = off + 0x40, sectionAt = artsAt + nArts * artSize;
  if (sectionAt > d.length) return null;
  return {offset: off, id: u16(d, off + 4), shape, dest, size, startArt, nArts, artSize, artsAt, sectionAt};
}
export function scanAkaoSampleSets(bytes) {
  const d = new Uint8Array(bytes), out = [];
  for (let i = 0; i + 0x50 <= d.length; i += 4) if (d[i] === 0x41 && isMagic(d, i)) { const s = akaoSampleSet(d, i); if (s) out.push(s); }
  return out;
}
// one articulation as the envelope/render record instr.mjs's readInstr
// yields ({addr, loop, ar, dr, sl, sr, rr, am, sm, rm, pitches}) plus where
// its bytes are in this image (ramAddr) and, for the 0x10 shape, the unity
// key and fine-tune multiplier in place of the twelve base pitches
export function akaoSetRecord(buf, set, artId) {
  const d = new Uint8Array(buf);
  const i = artId - set.startArt;
  if (i < 0 || i >= set.nArts) return null;
  const o = set.artsAt + i * set.artSize;
  if (o + set.artSize > d.length) return null;
  if (set.shape === "art16") {
    const so = u32(d, o), lp = u32(d, o + 4), fine = (u16(d, o + 8) << 16) >> 16, unity = u16(d, o + 10), adsr1 = u16(d, o + 12), adsr2 = u16(d, o + 14);
    if (!so && !lp && !adsr1 && !adsr2) return null;
    if (so >= set.size || set.sectionAt + so >= d.length) return null;
    // fine tune as VGMTrans reads it: a positive value is 1 + n/32768, a negative one (n & 0xFFFF)/65536
    const fineMult = fine >= 0 ? 1 + fine / 32768 : (fine & 0xFFFF) / 65536;
    return {slot: artId, set: set.id, addr: set.dest + so, loop: set.dest + lp, ramAddr: set.sectionAt + so, unity, fineMult, pitches: null, ...adsrRecord(adsr1, adsr2)};
  }
  if (set.shape === "art64pitch") {
    // sample and loop offsets (section-relative) at 0 and 4, a base pitch at
    // 8 (0x100000 = the sample at 44100 Hz sounding key 72), the ADSR as
    // bytes at 0x38..0x3F with the modes in bit 2 (exponential) and bit 1
    // (sustain decreasing) — VGMTrans AkaoInstr.cpp, its version 3.0
    const so = u32(d, o), lp = u32(d, o + 4), base = u32(d, o + 8);
    if (!base || so >= set.size || set.sectionAt + so >= d.length) return null;
    const am = d[o + 0x3D], sm = d[o + 0x3E], rm = d[o + 0x3F];
    return {slot: artId, set: set.id, addr: set.dest + so, loop: set.dest + lp, ramAddr: set.sectionAt + so, unity: 72, fineMult: base / 0x100000, pitches: null,
      ar: d[o + 0x38] & 0x7F, dr: d[o + 0x39] & 15, sl: d[o + 0x3A] & 15, sr: d[o + 0x3B] & 0x7F, rr: d[o + 0x3C] & 31,
      am: (am >> 2) & 1, sm: (sm & 2) | ((sm >> 2) & 1), rm: (rm >> 2) & 1};
  }
  if (set.shape !== "instr") return null;
  const rec = readInstr(d, set.artsAt, i);
  if (!rec || rec.addr < set.dest || rec.addr >= set.dest + set.size) return null;
  return {...rec, slot: artId, set: set.id, ramAddr: set.sectionAt + (rec.addr - set.dest)};
}

const bcd = b => (b >> 4) * 10 + (b & 15);

// -> {version, id, length, reverbType, timestamp, mask, tracks: [{voice,
// offset}], bytes, sampleSetId, instrTable, drumTable, timer, sampleSets}
// offsets are relative to `bytes`, the block alone (header + score), so
// callers can keep it apart from the RAM image. Given a RAM image (anything
// well past the block), the driver's clock and its sample sets are read
// from it too.
export function parseAKAO(buf, off = 0) {
  const d = new Uint8Array(buf);
  const L = akaoLayout(d, off);
  if (!L) throw new Error("not an AKAO sequence");
  const bytes = d.subarray(off, Math.min(d.length, off + L.length));
  const tracks = [];
  let p = L.tableAt;
  for (let voice = 0; voice < 32; voice++) {
    if (!((L.mask >>> voice) & 1)) continue;
    tracks.push({voice, offset: p + L.base + u16(d, off + p)});
    p += 2;
  }
  // BCD yy mm dd hh mm ss at 0x0A in layouts 1 and 2 (2 fills year and month
  // only); layout 3 keeps zeros there
  let timestamp = null;
  if (L.version < 3) {
    const ts = [...bytes.subarray(0x0A, 0x10)].map(bcd);
    const pad = n => String(n).padStart(2, "0");
    if (ts.some(Boolean)) timestamp = `19${pad(ts[0])}-${pad(ts[1])}-${pad(ts[2])}T${pad(ts[3])}:${pad(ts[4])}:${pad(ts[5])}`;
  }
  const out = {
    version: L.version, headerSize: L.headerSize, id: u16(d, off + 4), length: u16(d, off + 6), blockSize: L.length, reverbType: u16(d, off + 8),
    timestamp, mask: L.mask, tracks, bytes,
    sampleSetId: L.version >= 3 ? u16(d, off + 0x14) : null,
    instrTable: L.version >= 3 && u32(d, off + 0x30) ? 0x30 + u32(d, off + 0x30) : null, // key-split instruments: 16 u16 pointers, each + 0x20
    drumTable: L.version >= 3 && u32(d, off + 0x34) ? 0x34 + u32(d, off + 0x34) : null,  // 8 bytes per key
    timer: null, sampleSets: [],
  };
  if (d.length >= L.length + 0x10000) {
    out.timer = detectTimerDiv(d); out.sampleSets = scanAkaoSampleSets(d);
    Object.defineProperty(out, "image", {value: d, enumerable: false}); // the RAM the block came from: its sample sets, for akaoInstrContext
  }
  return out;
}

// Operand byte counts. Layout 1 (VGMTrans's version 1.0/1.1 map plus the
// Qhimm table): 0xFC is the key-split program of the 1.1 driver (unused by
// the 1.0 one, so no conflict). Layouts 2 and 3 keep 0xA0..0xDF and move the
// rest behind an escape byte; layout 3 adds 0xE1/0xE4..0xE6. Unlisted
// opcodes are "unimplemented" in that driver: the reader stops the track
// and says so.
const OPLEN_COMMON = {
  0xA0: 0, 0xA1: 1, 0xA2: 1, 0xA3: 1, 0xA4: 2, 0xA5: 1, 0xA6: 0, 0xA7: 0, 0xA8: 1, 0xA9: 2, 0xAA: 1, 0xAB: 2,
  0xAC: 1, 0xAD: 1, 0xAE: 1, 0xAF: 1, 0xB0: 2, 0xB1: 1, 0xB2: 1, 0xB3: 0, 0xB4: 3, 0xB5: 1, 0xB6: 0, 0xB7: 1,
  0xB8: 3, 0xB9: 1, 0xBA: 0, 0xBB: 1, 0xBC: 2, 0xBD: 1, 0xBE: 0, 0xBF: 1, 0xC0: 1, 0xC1: 1, 0xC2: 0, 0xC3: 0,
  0xC4: 0, 0xC5: 0, 0xC6: 0, 0xC7: 0, 0xC8: 0, 0xC9: 1, 0xCA: 0, 0xCB: 0, 0xCC: 0, 0xCD: 0, 0xCE: 1, 0xCF: 1,
  0xD0: 0, 0xD1: 0, 0xD2: 1, 0xD3: 1, 0xD4: 0, 0xD5: 0, 0xD6: 0, 0xD7: 0, 0xD8: 1, 0xD9: 1, 0xDA: 1, 0xDB: 0,
  0xDC: 1, 0xDD: 2, 0xDE: 2, 0xDF: 2,
};
const OPLEN_1 = {...OPLEN_COMMON,
  0xE8: 2, 0xE9: 3, 0xEA: 2, 0xEB: 3, 0xEC: 2, 0xED: 0, 0xEE: 2, 0xEF: 3, 0xF0: 3, 0xF1: 3, 0xF2: 1, 0xF3: 0,
  0xF4: 2, 0xF5: 0, 0xF6: 1, 0xF7: 2, 0xF8: 1, 0xF9: 0, 0xFC: 2, 0xFD: 2, 0xFE: 2,
};
const OPLEN_2 = {...OPLEN_COMMON, 0xE0: 0};
const OPLEN_3 = {...OPLEN_COMMON, 0xE0: 0, 0xE1: 1, 0xE2: 0, 0xE4: 2, 0xE5: 2, 0xE6: 2};
export const AKAO_OPLEN = OPLEN_1;
const OPLEN = {1: OPLEN_1, 2: OPLEN_2, 3: OPLEN_3};
const ESCAPE = {2: 0xFC, 3: 0xFE};
// escaped sub-opcode -> [operand bytes, what it is]: a layout-1 opcode
// number when the meaning is the same, a name when it is new, null when
// it has no note effect (or is unknown in VGMTrans too)
const SUB_2 = {
  0x00: [2, 0xE8], 0x01: [3, 0xE9], 0x02: [2, 0xEA], 0x03: [3, 0xEB], 0x04: [2, 0xEC], 0x05: [0, 0xED],
  0x06: [2, 0xEE], 0x07: [3, 0xEF], 0x08: [3, 0xF0], 0x09: [3, 0xF1], 0x0A: [1, 0xF2],
  0x0B: [0, null], 0x0C: [2, null], 0x0D: [0, null], 0x0E: [1, null], 0x0F: [2, null], 0x10: [1, null], 0x11: [0, null],
  0x12: [2, "volfade"], 0x13: [0, null], 0x14: [2, "split"], 0x15: [2, 0xFD], 0x16: [2, 0xFE], 0x17: [0, null], 0x18: [0, null],
};
const SUB_3 = {...SUB_2,
  // 0x0B: one operand byte in every use seen (Chrono Cross: `FE 0B a3 97`,
  // `FE 0B a7 97` … 122 times — read with none, the operand would run as a
  // volume opcode eating the rest after it). VGMTrans leaves it unimplemented.
  0x0B: [1, null],
  0x04: [0, "drum3"], 0x0E: [2, "pattern"], 0x0F: [0, "endpattern"], 0x10: [1, null], 0x14: [1, "split3"],
  0x19: [2, "exprfade"], 0x1A: [0, null], 0x1B: [0, null], 0x1C: [1, null], 0x1D: [0, null], 0x1E: [0, null],
};
const SUBS = {2: SUB_2, 3: SUB_3};

const s8 = b => (b << 24) >> 24;
const s16 = (lo, hi) => ((lo | (hi << 8)) << 16) >> 16;

// key-split instrument regions at `at`: 8 bytes {articulation, low key, high
// key, ar, sr, sustain mode, rr, volume} until a terminator (layout 3: a zero
// word; earlier: a first byte ≥ 0x80)
export function readRegions(d, at, version) {
  const out = [];
  for (let o = at; o + 8 <= d.length; o += 8) {
    if (version >= 3 ? !u32(d, o) : d[o] >= 0x80) break;
    out.push({art: d[o], lo: d[o + 1], hi: d[o + 2], ar: d[o + 3], sr: d[o + 4], sm: d[o + 5], rr: d[o + 6], vol: d[o + 7] ? Math.round(d[o + 7] * 127 / 128) : 127});
    if (out.length > 64) break;
  }
  return out;
}

// Simulate one track. Returns its notes and the timing facts it stated.
// The loop is the first backward jump into a visited byte (a song loop is
// one per track in AKAO; c8/c9/ca repeats are unrolled).
function runTrack(akao, ti, {condition, maxEvents}) {
  const d = akao.bytes, v = akao.version;
  const {voice} = akao.tracks[ti];
  let pc = akao.tracks[ti].offset;
  // a jump's target is the byte after its s16 operand plus the operand in
  // layouts 1 and 2, the s16's own byte plus the operand in layout 3
  const jumpBase = v >= 3 ? -2 : 0;
  const oplen = OPLEN[v], subs = SUBS[v], escape = ESCAPE[v];
  const visited = new Uint8Array(d.length);
  const firstTickAt = new Map();   // offset -> tick of first visit (loop start lookup)
  const notes = [], tempos = [], timeSigs = [], warnings = [], bendsOut = [];
  let tick = 0, octave = 0, transpose = 0, program = 0, vol = 127, expr = 127, tuning = 0, drum = null, pan = 64;
  let split = null;                 // regions of a key-split program (the articulation per key)
  let patternReturn = null;
  let legato = false, slur = false;
  // The re-key rule, read from the driver's own code (FF7, SaGa Frontier,
  // FF8, FF9, Chrono Cross and Parasite Eve all carry it; NIGHT-ROLL.md "PS1
  // capture v2"): a channel word holds 1 (slur: 0xCC, and 0xDA portamento)
  // or 4 (legato: 0xD0) — a store, so the last one wins. Each note or tie
  // copies bit 1 into a "no key-on" bit; the NEXT note then changes pitch on
  // the sounding voice without keying it on (a continuation). Legato only
  // cancels the 2-tick early key-off: those notes re-key. Before each note
  // the driver looks ahead to the next one and clears both modes when a
  // rest, 0xCB/0xCD/0xD1/0xDB or a stop comes first — so the note before
  // the rest or the "off" opcode already keys the next one on.
  let mode = 0, carry = false;      // mode: 1 slur, 4 legato, 0 neither; carry: the last note/tie had slur
  let porta = 0, portaKey = null;   // 0xDA portamento: glide length (ticks) and the last note's key (0 = none yet)
  // ADSR overrides (0xAD–0xB2, 0xB7/0xBB/0xBF; 0xB3 and a program change
  // restore the instrument's own): the fields readInstr names
  let adsr = {};
  let revOn = false;                // 0xC2/0xC3: this voice's reverb send on/off
  const revs = [];                  // [{tick, on}]
  const depths = [];                // 0xEA/0xEB: song-wide reverb depth, [{tick, len, to}]
  const pans = [];                  // 0xAA/0xAB: [{tick, len, to}] (len 0 = a set)
  let slideNext = 0, portaNote = null; // 0xA4's step for the next note/tie (it moves the portamento's "last key"); the note whose glide a clear may still cancel
  let panFade = null;
  const panNow = () => Math.floor(fadeAt(panFade, pan));
  // the look-ahead runs before the note before it sets its pitch, so a clear
  // also takes that note's own portamento glide away
  const unkey = () => { mode = 0; carry = false; porta = 0; if (portaNote) { delete portaNote.porta; portaNote = null; } };
  let oneTime = null, fixedDelta = 0, lastDelta = 0;
  const loopBegin = [0, 0, 0, 0], loopCount = [0, 0, 0, 0];
  let layer = 0;
  let last = null;                  // note a tie extends
  let loop = null, ended = false, events = 0;
  let volFade = null, exprFade = null;
  const fadeAt = (f, base) => !f ? base : tick >= f.end ? f.to : f.from + (f.to - f.from) * (tick - f.start) / (f.end - f.start);
  const curVol = () => Math.max(1, Math.min(127, Math.round(fadeAt(volFade, vol) * fadeAt(exprFade, expr) / 127)));
  // the channel's loudness over time, as breakpoints (tick, 0..1): a set is a
  // step, a fade a ramp. The driver applies these to the SOUNDING voice, so a
  // pad that swells inside one held note must swell in the render too — a
  // note-on snapshot (vel) made Anxious Heart's intro a stair: bar 1 at 4,
  // bar 2 at 31 (Josh, 2026-09-27: "way louder … every other bar")
  const gains = [{tick: 0, level: 1}];
  const level = () => fadeAt(volFade, vol) * fadeAt(exprFade, expr) / (127 * 127);
  const gainStep = before => { gains.push({tick, level: before}); gains.push({tick, level: level()}); };
  const tuningCents = () => tuning === 0 ? 0 : 1200 * Math.log2(1 + tuning / (tuning >= 0 ? 128 : 256));
  const drumEntry = key => {
    if (!drum) return null;
    if (drum.entries) return drum.entries[key - 24] || null;                 // layouts 1/2: twelve degrees
    const o = drum.offset + key * 8;                                          // layout 3: a region per key
    if (key < 0 || key > 127 || o + 8 > d.length || (!u32(d, o) && !u32(d, o + 4))) return null;
    return {instrument: d[o], key: d[o + 1], vol: d[o + 6] ? Math.round(d[o + 6] * 127 / 128) : 127, pan: d[o + 7] & 0x7F};
  };

  while (!ended) {
    if (pc >= d.length) { warnings.push(`track ${ti + 1} (voice ${voice}) ran off the end at 0x${pc.toString(16)}`); break; }
    if (++events > maxEvents) { warnings.push(`track ${ti + 1} (voice ${voice}) exceeded the event budget; a repeat never exits`); break; }
    const at = pc;
    if (!visited[at]) firstTickAt.set(at, tick);
    visited[at] = 1;
    const op = d[pc++];
    const lengthNote = v >= 3 && op >= 0xF0 && op <= 0xFD; // layout 3: degree = op − 0xF0 (12 = tie, 13 = rest), then a length byte
    if (op <= 0x99 || lengthNote) {
      const noteByte = lengthNote ? (op - 0xF0) * 11 : op;
      const explicit = lengthNote ? d[pc++] : 0;
      const rest = noteByte >= 0x8F, tie = !rest && noteByte >= 0x84;
      let delta = explicit || DELTA[noteByte % 11];
      if (oneTime !== null) { delta = oneTime; oneTime = null; }
      if (fixedDelta) delta = fixedDelta;
      lastDelta = delta;
      if (tie) {
        // a tie after a rest, or first thing in a repeat body (the
        // real files do both), just lets time pass — no note to extend
        if (last) last.endTick = tick + delta;
        carry = !!(mode & 1);
        if (portaKey !== null) portaKey += slideNext;
        slideNext = 0; portaNote = null;
      } else if (rest) {
        last = null;
        unkey();
      } else {
        const rel = Math.floor(noteByte / 11);
        // drum mode: layouts 1/2 play the map's twelve entries regardless of
        // octave (key 24 + degree); layout 3 keys its kit by the real key
        let key = drum ? (drum.entries ? 24 + rel : octave * 12 + rel) : octave * 12 + rel + transpose;
        const cents = tuningCents();
        const exact = key + cents / 100;
        const n = {tick, endTick: tick + delta, ch: ti, voice, key, vel: curVol(), program, pitch: Math.round(exact), cents: Math.round((exact - Math.round(exact)) * 100), drum: !!drum, tone: null, root: null, legato: legato || slur, pan: panNow()};
        if (!drum) {
          // no key-on: the voice sounding the last note just changes pitch
          if (carry && last && !last.drum) n.lg = true;
          if (porta && portaKey !== null && portaKey !== key) { n.porta = {from: portaKey - key, len: porta}; portaNote = n; }
          for (const k in adsr) { n.adsr = {...adsr}; break; }
        }
        carry = !!(mode & 1);
        portaKey = key + slideNext;
        slideNext = 0;
        if (drum) {
          // n.table: the note plays its drum-table entry (instrument, key,
          // pan) whatever kitify later decides it is — the renderer reads
          // this, not n.drum, so a drum table used as a melodic bank still
          // sounds as the driver plays it
          // An all-zero layout-3 entry (drumEntry null) is not skipped by the
          // driver — Chrono Cross's key-on reads it unchecked: instrument 0
          // at key 0. Not modelled: such a note keeps the channel program and
          // stays a kit note.
          const e = drumEntry(key);
          if (e) { n.program = e.instrument; n.art = e.instrument; n.table = true; n.tone = {instrument: e.instrument, key: e.key, vol: e.vol, pan: e.pan}; }
        } else if (split) {
          // a key outside every region plays the nearest one above it, the
          // last beyond the top (the driver covers the whole keyboard; FF9 and
          // Chrono Cross play keys past their regions' written ranges)
          const r = split.find(r => key >= r.lo && key <= r.hi) || split.find(r => key <= r.hi) || split[split.length - 1];
          if (r) { n.art = r.art; n.tone = {instrument: r.art, key, vol: r.vol}; }
        } else n.art = program;
        notes.push(n);
        last = n;
      }
      if (!rest && !tie) portaNote = portaNote && portaNote.tick === tick ? portaNote : null;
      tick += delta;
      continue;
    }
    let vop = op, n;
    if (escape && op === escape) {
      if (pc >= d.length) { warnings.push(`track ${ti + 1}: truncated escape at 0x${at.toString(16)}`); break; }
      const sub = d[pc++], e = subs[sub];
      if (!e) { warnings.push(`track ${ti + 1} (voice ${voice}): unimplemented opcode 0x${op.toString(16)} 0x${sub.toString(16)} at 0x${at.toString(16)}; track stopped`); break; }
      n = e[0]; vop = e[1];
    } else {
      if (!(op in oplen)) { warnings.push(`track ${ti + 1} (voice ${voice}): unimplemented opcode 0x${op.toString(16)} at 0x${at.toString(16)}; track stopped`); break; }
      n = oplen[op];
      if (v === 1 && op === 0xFC) vop = "split";
    }
    if (pc + n > d.length) { warnings.push(`track ${ti + 1}: truncated operand for 0x${op.toString(16)}`); break; }
    const a = d[pc], b = d[pc + 1], c = d[pc + 2];
    pc += n;
    switch (vop) {
      case 0xA0: ended = true; break;
      case 0xA1: case 0xF2: program = a; split = null; adsr = {}; break;
      case 0xF4: program = a; split = null; adsr = {}; break;            // overlay voice: primary instrument
      case "split": {                                                   // key-split program at a relative address (layouts 1.1 and 2)
        adsr = {};
        const dest = pc + s16(a, b);
        split = dest >= 0 && dest < d.length ? readRegions(d, dest, v) : null;
        program = 0x80 + ((dest >> 3) & 0x7F);
        if (!split || !split.length) { warnings.push(`track ${ti + 1}: key-split program at 0x${dest.toString(16)} has no regions`); split = null; }
        break;
      }
      case "split3": {                                                  // key-split program by index into the header's table
        split = null; adsr = {}; program = 0x80 + a;
        if (akao.instrTable != null && a < 16) {
          const ptr = u16(d, akao.instrTable + a * 2);
          if (ptr !== 0xFFFF && (ptr || a === 0)) split = readRegions(d, akao.instrTable + 0x20 + ptr, v);
        }
        if (!split || !split.length) { warnings.push(`track ${ti + 1}: key-split program ${a} is not in this sequence's instrument table`); split = null; }
        break;
      }
      case 0xA2: oneTime = a; lastDelta = a; break;
      case 0xA3: { const was = level(); vol = a; volFade = null; gainStep(was); break; }
      case "volfade": { const len = a || 256; const from = fadeAt(volFade, vol); volFade = {start: tick, end: tick + len, from, to: b}; vol = b;
                   gains.push({tick, level: from * fadeAt(exprFade, expr) / (127 * 127)}); gains.push({tick: tick + len, level: b * fadeAt(exprFade, expr) / (127 * 127)}); break; }
      case 0xAA: pan = a & 0x7F; panFade = null; pans.push({tick, len: 0, to: pan}); break; // voice pan, 0 left .. 127 right (the SPU's linear L/R volumes)
      case 0xAB: { const len = a || 256; panFade = {start: tick, end: tick + len, from: panNow(), to: b & 0x7F}; pan = b & 0x7F; pans.push({tick, len, to: pan}); break; } // pan fade: a straight line in the driver's 8.8 pan
      case 0xA8: { const was = level(); expr = a; exprFade = null; gainStep(was); break; }
      case 0xA9: case "exprfade": { const len = a || 256; const from = fadeAt(exprFade, expr); exprFade = {start: tick, end: tick + len, from, to: b}; expr = b;
                   gains.push({tick, level: fadeAt(volFade, vol) * from / (127 * 127)}); gains.push({tick: tick + len, level: fadeAt(volFade, vol) * b / (127 * 127)}); break; }
      case 0xA4: bendsOut.push({tick, len: a || 256, semitones: s8(b)}); slideNext = s8(b); break;
      case 0xA5: octave = a & 15; break;
      case 0xA6: octave = (octave + 1) & 15; break;
      case 0xA7: octave = (octave - 1) & 15; break;
      case 0xC0: transpose = s8(a); break;
      case 0xC1: transpose += s8(a); break;
      case 0xD8: tuning = s8(a); break;
      case 0xD9: tuning = s8(tuning + s8(a)); break;
      case 0xCC: slur = true; mode = 1; break;
      case 0xCD: slur = false; unkey(); break;
      case 0xD0: legato = true; mode = 4; break;
      case 0xD1: legato = false; unkey(); break;
      case 0xCB: unkey(); break;
      case 0xDA: porta = a || 256; portaKey = null; mode = 1; break; // portamento: slur, each note gliding from the last over `a` ticks
      case 0xDB: unkey(); break;
      case 0xAD: adsr.ar = a; break;
      case 0xAE: adsr.dr = a; break;
      case 0xAF: adsr.sl = a; break;
      case 0xB0: adsr.dr = a; adsr.sl = b; break;
      case 0xB1: adsr.sr = a; break;
      case 0xB2: adsr.rr = a; break;
      case 0xB3: adsr = {}; break;
      case 0xB7: adsr.am = a; break;
      case 0xBB: adsr.sm = a; break;
      case 0xBF: adsr.rm = a; break;
      case 0xC2: if (!revOn) { revOn = true; revs.push({tick, on: true}); } break;
      case 0xC3: if (revOn) { revOn = false; revs.push({tick, on: false}); } break;
      case 0xEA: depths.push({tick, len: 0, to: s16(a, b)}); break;               // reverb depth (song-wide, any voice sets it)
      case 0xEB: depths.push({tick, len: a || 256, to: s16(b, c)}); break;        // …faded over `a` ticks
      case 0xDC: fixedDelta = Math.min(255, Math.max(1, lastDelta + s8(a))); break;
      case 0xC8: layer = (layer + 1) & 3; loopBegin[layer] = pc; loopCount[layer] = 0; break;
      case 0xC9: { const count = a || 256; loopCount[layer]++; if (loopCount[layer] === count) layer = (layer - 1) & 3; else pc = loopBegin[layer]; break; }
      case 0xCA:
        // repeat with no count: only 0xF0/0xF1 inside can leave it. None of
        // FF7's 90 songs ends this way (they jump with 0xEE), but a stream
        // that does is a loop, not an event-budget overrun
        loopCount[layer]++;
        if (loopCount[layer] > 256) {
          const start = firstTickAt.get(loopBegin[layer]) ?? 0, period = (tick - start) / loopCount[layer];
          loop = {start, end: start + period};
          while (notes.length && notes[notes.length - 1].tick >= loop.end) notes.pop();
          tick = loop.end; ended = true; break;
        }
        pc = loopBegin[layer];
        break;
      // a branch/break that jumps back to before the repeat it leaves, into
      // bytes already played, is the song's loop (SaGa Frontier's Koorong ends
      // a voice that way instead of with 0xEE)
      case 0xF0: { const count = a || 256, dest = pc + jumpBase + s16(b, c);
        if (loopCount[layer] + 1 === count) { if (visited[dest] && dest < loopBegin[layer]) { loop = {start: firstTickAt.get(dest) ?? 0, end: tick}; ended = true; break; } pc = dest; }
        break; }
      // loop break: on the pass that leaves, jump out and drop the layer. The
      // layer drops ONLY when leaving (VGMTrans drops it every pass, which
      // pops a still-running repeat: SaGa Frontier's Koorong, FF8's Mods de
      // Chocobo then hit an unmatched 0xC9 and ran into the header)
      case 0xF1: { const count = a || 256, dest = pc + jumpBase + s16(b, c);
        if (loopCount[layer] + 1 === count) { if (visited[dest] && dest < loopBegin[layer]) { loop = {start: firstTickAt.get(dest) ?? 0, end: tick}; ended = true; break; } pc = dest; layer = (layer - 1) & 3; }
        break; }
      case 0xEE: {
        const dest = pc + jumpBase + s16(a, b);
        if (dest < 0 || dest >= d.length) { warnings.push(`track ${ti + 1}: jump outside the sequence at 0x${at.toString(16)}`); ended = true; break; }
        if (visited[dest]) { loop = {start: firstTickAt.get(dest) ?? 0, end: tick}; ended = true; break; }
        pc = dest;
        break;
      }
      case 0xEF: { const dest = pc + jumpBase + s16(b, c); if (a === condition) pc = dest; break; } // game-set variable; VGMTrans's default too
      case "pattern": {                                                 // layout 3: play a phrase, return at its end
        const dest = pc + jumpBase + s16(a, b);
        if (dest < 0 || dest >= d.length) { warnings.push(`track ${ti + 1}: pattern outside the sequence at 0x${at.toString(16)}`); ended = true; break; }
        patternReturn = pc; pc = dest;
        break;
      }
      case "endpattern": if (patternReturn != null) { pc = patternReturn; patternReturn = null; } else warnings.push(`track ${ti + 1}: pattern end with no pattern at 0x${at.toString(16)}`); break;
      case 0xE8: tempos.push({tick, raw: a | (b << 8)}); break;
      case 0xE9: {
        // the driver slides the raw value linearly over `len` ticks; stepping
        // it every 6 ticks keeps the bar clock within a few ms of that
        const len = a || 256, to = b | (c << 8), from = tempos.length ? tempos[tempos.length - 1].raw : to;
        for (let t = 6; t < len; t += 6) tempos.push({tick: tick + t, raw: Math.round(from + (to - from) * t / len)});
        tempos.push({tick: tick + len, raw: to});
        break;
      }
      case 0xFD: if (a && b) timeSigs.push({tick, num: b, den: Math.round(AKAO_PPQ * 4 / a), ticksPerBeat: a}); break;
      case 0xEC: {
        // drum map follows the sequence: per degree {instrument, key, vol u16,
        // pan} (Qhimm) — 5 bytes, 6 with layout 2's reverb flag; the octave is
        // ignored while drum mode is on
        const dest = pc + s16(a, b), stride = v >= 2 ? 6 : 5;
        const entries = [];
        for (let k = 0; k < 12 && dest + k * stride + stride <= d.length; k++) {
          const o = dest + k * stride;
          entries.push({instrument: d[o], key: d[o + 1], vol: d[o + 3], pan: d[o + 4]});
        }
        drum = {offset: dest, entries};
        break;
      }
      case "drum3":
        if (akao.drumTable == null) { warnings.push(`track ${ti + 1}: drum mode with no drum table in the header`); break; }
        drum = {offset: akao.drumTable, entries: null};
        break;
      case 0xED: drum = null; break;
      default: break; // ADSR, LFOs, reverb, noise, side-chains, reserved voices: no note fact
    }
  }
  // each note carries the slice of the automation it sounds through, relative
  // to its own start — an unrolled copy then keeps the same shape
  gains.sort((a, b) => a.tick - b.tick);
  const levelAt = t => {
    let l = gains[0].level;
    for (let i = 0; i < gains.length; i++) {
      const g = gains[i], nx = gains[i + 1];
      if (g.tick > t) break;
      l = nx && nx.tick > t && nx.tick > g.tick ? g.level + (nx.level - g.level) * (t - g.tick) / (nx.tick - g.tick) : g.level;
    }
    return l;
  };
  for (const n of notes) {
    const inside = gains.filter(g => g.tick > n.tick && g.tick < n.endTick);
    if (!inside.length) continue; // constant through the note: vel says it all
    n.gain = [{t: 0, l: levelAt(n.tick)}, ...inside.map(g => ({t: g.tick - n.tick, l: g.level})), {t: n.endTick - n.tick, l: levelAt(n.endTick)}];
  }
  // a pan fade under a held note: the pan at every tick its value changes,
  // relative to the note's start (the note's own `pan` is the start)
  if (pans.some(p => p.len)) {
    const panAt = t => { // the last event at or before t: a set, or a fade from where the pan was
      let k = -1; for (let i = 0; i < pans.length && pans[i].tick <= t; i++) k = i;
      if (k < 0) return 64;
      const p = pans[k];
      return !p.len || t >= p.tick + p.len ? p.to : Math.floor(p.from + (p.to - p.from) * (t - p.tick) / p.len);
    };
    for (let i = 0; i < pans.length; i++) pans[i].from = i ? panAt(pans[i].tick - 1e-9) : 64;
    for (const n of notes) {
      if (n.drum || !pans.some(p => p.len && p.tick < n.endTick && p.tick + p.len > n.tick)) continue;
      const pts = [];
      let was = n.pan;
      for (let t = n.tick + 1; t < n.endTick; t++) { const v = panAt(t); if (v !== was) { pts.push({t: t - n.tick, v}); was = v; } }
      if (pts.length) n.panPts = pts;
    }
  }
  return {notes, tempos, timeSigs, warnings, bends: bendsOut, endTick: tick, loop, voice, revs, depths};
}

// The instrument handle a capture carries (result.instr): plain data (it
// may cross a worker boundary), read through akaoRecord(ctx, note) so
// notes.mjs's envelopes and spu-render.mjs's voices need no idea which
// generation the rip is.
//   sample sets in the image → by articulation id, the header-named set
//   first, then the set loaded highest in SPU RAM (a song's own set sits
//   above the common one), falling through empty slots;
//   else INSTR.DAT at instr.offset (the 0x40-byte records found by shape).
// The image is instr.ram, or the RAM parseAKAO read the block from.
export function akaoInstrContext(akao, instr) {
  const ram = instr && instr.ram ? new Uint8Array(instr.ram) : akao.image || null;
  if (!ram) return null;
  const sets = akao.sampleSets && akao.sampleSets.length ? akao.sampleSets : scanAkaoSampleSets(ram);
  if (sets.length) {
    const order = sets.slice().sort((a, b) => (b.id === akao.sampleSetId) - (a.id === akao.sampleSetId) || b.dest - a.dest);
    return {ram, offset: order[0].offset, kind: "akao-sets", sets: order};
  }
  if (!instr || instr.offset == null) return null;
  return {ram, offset: instr.offset, kind: "instr-dat", sets: []};
}
// the articulation a note plays: its key-split/drum region's, else its program
export const akaoArtOf = n => n.art != null ? n.art : n.tone && n.tone.instrument != null ? n.tone.instrument : n.program;
const recCache = new WeakMap();
// -> the note's record ({addr, loop, ar..rm, pitches | unity+fineMult,
// ramAddr?}) or null. INSTR.DAT records carry no ramAddr: the renderer finds
// their bank (spu-render.mjs findSampleBank).
export function akaoRecord(ctx, n) {
  if (!ctx) return null;
  let cache = recCache.get(ctx);
  if (!cache) recCache.set(ctx, cache = new Map());
  const id = typeof n === "number" ? n : akaoArtOf(n);
  if (cache.has(id)) return cache.get(id);
  let rec = null;
  if (ctx.kind === "akao-sets") { for (const s of ctx.sets) { rec = akaoSetRecord(ctx.ram, s, id); if (rec) break; } }
  else rec = readInstr(ctx.ram, ctx.offset, id);
  cache.set(id, rec);
  return rec;
}

// Which AKAO block a rip plays, from where its files put bytes (no game
// names): the block the song's own file landed in; else, when that file only
// patched the driver with a load immediate (SaGa Frontier's 4-byte minis
// write `li a0, N` into the start-up code), the N-th block counting from 0
// in header-id order — the driver's song number is 0-based where the ids
// count from 1 (checked on SaGa Frontier: N-th by id matches 75 of 82 tag
// lengths within 10%; id == N matches a scatter); else the first block in
// the image, said so. -> {offset, how} | null
export function pickAKAO(ram, ranges, fileName) {
  const d = new Uint8Array(ram);
  const akaos = scanAKAO(d);
  if (!akaos.length) return null;
  const own = (ranges || []).find(r => r.name === fileName);
  const lo = own ? own.start & 0x1FFFFF : 0, hi = own ? lo + own.size : 0;
  const inOwn = own ? akaos.filter(o => o >= lo && o < hi) : [];
  if (inOwn.length) return {offset: inOwn[0], how: "the song's own file"};
  if (own && own.size <= 64) {
    const byId = akaos.slice().sort((a, b) => u16(d, a + 4) - u16(d, b + 4));
    const imms = new Set();
    for (let i = lo & ~3; i + 4 <= hi; i += 4) {
      const op = d[i + 3];
      if ((op === 0x24 || op === 0x34) && !(d[i + 2] & 0xE0)) imms.add(u16(d, i)); // addiu/ori rt, zero, imm
    }
    if (imms.size === 1) {
      const n = [...imms][0];
      if (n < byId.length) return {offset: byId[n], how: `song number ${n} loaded by the song's file: block id ${u16(d, byId[n] + 4)}, index ${n} in header-id order`};
    }
  }
  return {offset: akaos[0], how: `the first of ${akaos.length} blocks in the image (the song's file names none)`};
}

// -> the shape notes.mjs's toNotesTxt/makeMidi/trimSeconds take: {notes,
// channels, programs, bends, seq, vab: null, source}
// tempoDiv: given, or read from the driver code in the image parseAKAO saw
// (akao.timer), or assumed by layout with a warning. instr: {ram, offset} —
// the image and the INSTR.DAT offset (tools/psx/instr.mjs), for envelopes.
export function akaoNotes(akao, {tempoDiv = null, condition = 0, maxEvents = 200000, instr = null} = {}) {
  const runs = akao.tracks.map((_, i) => runTrack(akao, i, {condition, maxEvents}));
  const warnings = runs.flatMap(r => r.warnings);
  let clock;
  if (tempoDiv != null) clock = `tick clock 0x${tempoDiv.toString(16)} (${timerHz(tempoDiv).toFixed(2)} Hz) as given`;
  else if (akao.timer && akao.timer.div) { tempoDiv = akao.timer.div; clock = `tick clock 0x${tempoDiv.toString(16)} (${timerHz(tempoDiv).toFixed(2)} Hz) read from the driver code`; }
  else { tempoDiv = akao.version >= 2 ? TIMER_DIV_LATER : TIMER_DIV_FF7; clock = `tick clock 0x${tempoDiv.toString(16)} (${timerHz(tempoDiv).toFixed(2)} Hz) assumed — the driver code is not in this image`; }
  warnings.unshift(`AKAO header layout ${akao.version} (0x${akao.headerSize.toString(16)} bytes); ${clock}`);
  // pitch slides (0xA4: by N semitones over L ticks) move the SOUNDING voice —
  // a whole melody can ride one held note (Cry of the Planet: a D held 37
  // bars, slid +7 +5 −4 −3 +2 −7 every eighth; Josh, 2026-09-27: "the most
  // important part of this song" was missing). Each note carries the slides
  // that fall inside it, relative to its start and to its own pitch (a
  // key-on sets the pitch fresh, so the offset restarts at 0 per note); the
  // MIDI writer splits them into notes, the renderer bends the voice.
  // Attached BEFORE the loop unroll so every copy keeps them.
  // Reverb send per note (`rev`, [{t from its start, v 0..127}]): the voice's
  // 0xC2/0xC3 switch × the song-wide depth (0xEA sets it, 0xEB fades it — a
  // signed 16-bit level the driver hands the SPU's reverb volume, |0x7FFF| =
  // full). A song that switches reverb on but never states a depth plays at
  // whatever the driver was left with: written as full, said in the warnings.
  const depthEv = runs.flatMap(r => r.depths).sort((a, b) => a.tick - b.tick);
  const anyRev = runs.some(r => r.revs.some(x => x.on));
  if (anyRev && !depthEv.length) warnings.push("reverb is switched on but no depth is set: its send is written at full");
  {
    let cur = depthEv.length ? 0 : 0x7FFF;
    for (const e of depthEv) { e.from = cur; cur = e.to; }
  }
  const depthAt = t => {
    let k = -1; for (let i = 0; i < depthEv.length && depthEv[i].tick <= t; i++) k = i;
    if (k < 0) return depthEv.length ? 0 : 0x7FFF;
    const e = depthEv[k];
    return !e.len || t >= e.tick + e.len ? e.to : e.from + (e.to - e.from) * (t - e.tick) / e.len;
  };
  const send = (on, t) => on ? Math.min(127, Math.round(Math.abs(depthAt(t)) / 0x7FFF * 127)) : 0;
  if (anyRev) for (const r of runs) {
    const onAt = t => { let on = false; for (const x of r.revs) { if (x.tick > t) break; on = x.on; } return on; };
    for (const n of r.notes) {
      const pts = [{t: 0, v: send(onAt(n.tick), n.tick)}];
      const moves = r.revs.some(x => x.tick > n.tick && x.tick < n.endTick) ||
        depthEv.some(e => e.tick < n.endTick && (e.len ? e.tick + e.len > n.tick : e.tick > n.tick));
      if (moves) for (let t = n.tick + 1; t < n.endTick; t++) { const v = send(onAt(t), t); if (v !== pts[pts.length - 1].v) pts.push({t: t - n.tick, v}); }
      n.rev = pts;
    }
  }
  for (const r of runs) {
    if (!r.bends.length) continue;
    const bends = r.bends.slice().sort((a, b) => a.tick - b.tick);
    for (const n of r.notes) {
      if (n.drum) continue;
      const inside = bends.filter(b => b.tick >= n.tick && b.tick < n.endTick);
      if (!inside.length) continue;
      let cum = 0;
      n.slide = inside.map(b => { cum += b.semitones; return {t: b.tick - n.tick, len: b.len, to: cum}; }); // to: semitones from the note's pitch once the slide lands
    }
  }
  // tempo: any track may state it; the driver has one clock
  const tempoEvents = runs.flatMap(r => r.tempos).sort((a, b) => a.tick - b.tick);
  const tempoMap = [];
  for (const t of tempoEvents) {
    const usq = Math.round(6e7 / akaoBpm(t.raw, tempoDiv));
    const prev = tempoMap[tempoMap.length - 1];
    if (prev && prev.tick === t.tick) prev.usq = usq;
    else if (!prev || prev.usq !== usq) tempoMap.push({tick: t.tick, usq});
  }
  // a few songs state tempo/meter after an opening rest (316: tick 4, 414:
  // tick 72); the driver's tempo before that is whatever the last song
  // left. While nothing has sounded yet it is the song's tempo, not a change
  let firstNote = Infinity; for (const r of runs) for (const n of r.notes) if (n.tick < firstNote) firstNote = n.tick;
  if (tempoMap.length && tempoMap[0].tick > 0 && tempoMap[0].tick <= firstNote) tempoMap[0].tick = 0;
  if (!tempoMap.length || tempoMap[0].tick !== 0) {
    warnings.push("no tempo at tick 0; 120bpm assumed until the first tempo event");
    tempoMap.unshift({tick: 0, usq: 500000});
  }
  const sigEvents = runs.flatMap(r => r.timeSigs).sort((a, b) => a.tick - b.tick);
  const timeSigs = [];
  for (const s of sigEvents) {
    const prev = timeSigs[timeSigs.length - 1];
    if (prev && prev.num === s.num && prev.den === s.den) continue;
    if (prev && prev.tick === s.tick) { prev.num = s.num; prev.den = s.den; continue; }
    timeSigs.push({tick: s.tick, num: s.num, den: s.den});
  }
  if (timeSigs.length && timeSigs[0].tick > 0 && timeSigs[0].tick <= firstNote) timeSigs[0].tick = 0;
  if (!timeSigs.length || timeSigs[0].tick !== 0) { warnings.push("no time signature at tick 0; 4/4 assumed"); timeSigs.unshift({tick: 0, num: 4, den: 4}); }

  // Each AKAO track loops on its own. The real files stagger loop starts
  // (echo voices 32 ticks late; an intro some voices sit out) and nest a
  // short ostinato under a long form. One song loop for the app: start at
  // the latest track start, one longest period long; tracks with shorter
  // periods are unrolled up to that end, as the driver would play them.
  const looping = runs.filter(r => r.loop);
  let loop = null, endTick;
  if (looping.length) {
    const periods = looping.map(r => r.loop.end - r.loop.start);
    const period = Math.max(...periods), start = Math.max(...looping.map(r => r.loop.start));
    loop = {start, end: start + period, count: 127};
    endTick = Math.max(loop.end, ...runs.filter(r => !r.loop).map(r => r.endTick));
    for (const r of looping) {
      const p = r.loop.end - r.loop.start;
      const body = r.notes.filter(n => n.tick >= r.loop.start && n.tick < r.loop.end);
      const copies = [];
      for (let k = 1; r.loop.start + k * p < endTick; k++) {
        for (const n of body) {
          const t = n.tick + k * p;
          if (t >= endTick) break;
          copies.push({...n, tick: t, endTick: Math.min(endTick, n.endTick + k * p), unrolled: true});
        }
      }
      r.notes.push(...copies);
    }
    const distinctPeriods = [...new Set(periods)].sort((a, b) => a - b);
    if (distinctPeriods.length > 1) warnings.push(`tracks repeat with different periods (${distinctPeriods.join(", ")} ticks); shorter ones are unrolled to the longest`);
    const starts = [...new Set(looping.map(r => r.loop.start))].sort((a, b) => a - b);
    if (starts.length > 1) warnings.push(`tracks start their loop at different ticks (${starts.join(", ")}); loop start is the latest`);
    const withNotes = runs.filter(r => r.notes.length).length;
    if (looping.length < withNotes) warnings.push(`${withNotes - looping.length} track(s) with notes end without looping`);
  } else {
    endTick = Math.max(0, ...runs.map(r => r.endTick), ...runs.flatMap(r => r.notes.map(n => n.endTick)));
  }
  const notes = runs.flatMap(r => r.notes).sort((a, b) => a.tick - b.tick || a.ch - b.ch || a.key - b.key);
  const seq = {ppq: AKAO_PPQ, tempo: tempoMap[0].usq, tempoMap, timeSigs, tsNum: timeSigs[0].num, tsDen: timeSigs[0].den, loop, endTick, warnings,
    id: akao.id, reverbType: akao.reverbType, timestamp: akao.timestamp, version: akao.version, tempoDiv};
  const channels = [...new Set(notes.map(n => n.ch))].sort((a, b) => a - b);
  const programInfo = new Map();
  for (const n of notes) if (!programInfo.has(n.program)) programInfo.set(n.program, {program: n.program, drum: n.drum});
  const bends = new Array(akao.tracks.length).fill(0);
  runs.forEach((r, i) => { bends[i] = r.bends.length; });
  const bendEvents = runs.map(r => r.bends);
  const revEvents = runs.map(r => r.revs); // per track: {tick, on} — 0xC2/0xC3
  const depthEvents = depthEv;             // song-wide: {tick, len, from, to} — 0xEA/0xEB // per track: {tick, len, semitones} — the renderer bends the sounding note
  const ctx = akaoInstrContext(akao, instr);
  if (ctx && ctx.kind === "akao-sets") {
    const missing = new Set();
    for (const n of notes) if (!akaoRecord(ctx, n)) missing.add(akaoArtOf(n));
    if (missing.size) warnings.push(`${missing.size} articulation(s) not in the image's sample sets (${[...missing].slice(0, 8).join(", ")}${missing.size > 8 ? ", …" : ""}); those notes render silent`);
  }
  return {notes, channels, programs: [...programInfo.values()], bends, bendEvents, revEvents, depthEvents, seq, vab: null, instr: ctx,
    source: {kind: "akao", label: "PS1 AKAO", pitchNote: "Pitch is the AKAO key as written (octave × 12 + degree + transpose; the articulation table is tuned so this is the sounding note for melodic instruments). Kits keep their key numbers. Notes are shown at written length; the driver keys off 2 ticks early unless legato."},
    tracks: runs.map((r, i) => ({ch: i, voice: r.voice, notes: r.notes.length, endTick: r.endTick, loop: r.loop}))};
}
