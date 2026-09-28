// The SM64-generation sound bank ("Audiobank" ctl + "Audiotable" tbl) as
// the game loads it (sm64 decomp load.c bank_load_immediate /
// patch_audio_bank), read straight from the rip's sparse ROM.
//
// A ctl entry is 16 bytes {u32 numInstruments; u32 numDrums; u32 ×2
// (a 1 and a date on the real ROM, unread)} then the bank body; every
// pointer inside the body is an offset from the body's start (the game
// adds the RAM address at load; here they stay offsets). Body layout:
//   +0   u32 drums            -> Drum*[numDrums] (each an offset, 0 = none)
//   +4   u32 instruments[n]   -> Instrument (offset, 0 = none)
//   Instrument (0x20): u8 loaded, normalRangeLo, normalRangeHi, releaseRate;
//                      u32 envelope; AudioBankSound low, normal, high
//   Drum (0x10):       u8 releaseRate, pan, loaded, pad; AudioBankSound; u32 envelope
//   AudioBankSound (8): u32 sample (0 = none); f32 tuning
//   AudioBankSample (0x14): u8 unused, loaded, pad[2]; u32 sampleAddr
//                      (offset into this bank's tbl slice); u32 loop; u32 book;
//                      u32 sampleSize (never read by the game)
//   AdpcmLoop:  u32 start, end, count, pad; s16 state[16] only when count != 0
//   AdpcmBook:  s32 order, npredictors; s16 book[8·order·npredictors]
//   AdsrEnvelope: {s16 delay, s16 arg} pairs, ended by delay 0 (disable),
//                 -1 (hang), -2 (goto: arg = index), -3 (restart)
// All verified on the Super Mario 64 US rip (INTEGRATION.md §9).
//
// The tbl slice for bank i is entry i of the sample table, an ALSeqFile
// header whose entries REPEAT (several banks share one sample set), so
// ead-usf's monotonic scan skips it: findSampleTable looks for it by count.
//
// A USF rip carries only the bytes that mattered to the output, so fields
// the game never reads (sampleSize, pads, `loaded`) and unused instruments
// are absent; reads here fill with 0 (which is what the ripper zeroed) and
// each record says how much of it is really present.
import { findALSeqFiles, readALSeqFile, readAudioTable, findSoundFontList } from "./ead-usf.mjs";
import { expandBook, decodeSample } from "./vadpcm.mjs";
import { rdramOf } from "./usf.mjs";

// SM64 US: gDefaultEnvelope (data.c) and sequence_channel_init's release
// rate — what a channel plays with before any instrument is set.
export const DEFAULT_ENVELOPE = [[4, 32000], [1000, 32000], [-1, 0]];
export const DEFAULT_RELEASE_RATE = 0x20;

// big-endian readers over a SparseImage (usf.mjs) or a plain Uint8Array
export function byteView(img) {
  if (img instanceof Uint8Array) {
    const d = img;
    const read = (o, n) => { const out = new Uint8Array(n); if (o < d.length) out.set(d.subarray(Math.max(0, o), Math.min(d.length, o + n)), Math.max(0, -o)); return out; };
    const coverage = (o, n) => n <= 0 ? 1 : Math.max(0, Math.min(d.length, o + n) - Math.max(0, o)) / n;
    return mk(read, coverage);
  }
  return mk((o, n) => img.read(o, n), (o, n) => img.coverage(o, n));
  function mk(read, coverage) {
    const u8 = o => read(o, 1)[0];
    const u16 = o => { const b = read(o, 2); return (b[0] << 8) | b[1]; };
    const u32 = o => { const b = read(o, 4); return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0; };
    const s16 = o => (u16(o) << 16) >> 16;
    const s32 = o => u32(o) | 0;
    const f32 = o => new DataView(read(o, 4).buffer).getFloat32(0);
    return {read, coverage, u8, u16, u32, s16, s32, f32};
  }
}

// the sample table: an ALSeqFile header with the ctl's count whose entries
// may repeat; searched after the ctl file (SM64 lays the three blobs out
// seq-independent: ctl, then tbl) and, failing that, anywhere in the image
export function findSampleTable(rom, ctl) {
  const v = byteView(rom);
  const ok = p => {
    if (rom.coverage(p, 4 + 8 * ctl.count) < 1) return false;
    if (v.u16(p) > 3 || v.u16(p + 2) !== ctl.count) return false;
    const hdr = 4 + 8 * ctl.count;
    for (let i = 0; i < ctl.count; i++) {
      const off = v.u32(p + 4 + i * 8), len = v.u32(p + 8 + i * 8);
      if (off < hdr || len === 0 || off + len > 0x4000000) return false;
    }
    return true;
  };
  const tryFrom = (from, to) => { for (let p = from; p + 12 <= to; p += 16) if (p !== ctl.at && ok(p)) return readALSeqFile(rom, p); return null; };
  return tryFrom(ctl.end, ctl.end + 0x1000) || (() => { for (const r of rom.runs()) { const f = tryFrom(r.offset, r.offset + r.length); if (f) return f; } return null; })();
}

// -> {ctl, tbl} for a sparse ROM (sm64 generation); `loc` is locateEAD's
// result when the caller has it (its seqFile is excluded)
export function findAudioFiles(rom, loc = null) {
  const found = findALSeqFiles(rom);
  const seqFile = loc && loc.seqFile ? loc.seqFile : found.seqFile;
  const ctl = found.files.find(f => !seqFile || f.at !== seqFile.at);
  if (!ctl) throw new Error("no Audiobank (ctl) ALSeqFile in this ROM image");
  const tbl = findSampleTable(rom, ctl);
  if (!tbl) throw new Error("no Audiotable (tbl) header with " + ctl.count + " entries in this ROM image");
  return {ctl, tbl};
}

// AdsrEnvelope pairs from a byte view; the terminator pair is kept (its
// delay says how the envelope ends)
export function readEnvelope(v, at, max = 64) {
  const pairs = [];
  for (let i = 0; i < max; i++) {
    const delay = v.s16(at + i * 4), arg = v.s16(at + i * 4 + 2);
    pairs.push([delay, arg]);
    if (delay <= 0) break;
  }
  return pairs;
}

export function readBank(rom, files, bankId) {
  const {ctl, tbl} = files;
  if (bankId < 0 || bankId >= ctl.count) throw new Error(`bank ${bankId}: the ctl table has ${ctl.count} entries`);
  const v = byteView(rom);
  const ce = ctl.entries[bankId], te = tbl.entries[bankId];
  const body = ce.rom + 0x10;
  const numInstruments = v.u32(ce.rom), numDrums = v.u32(ce.rom + 4);
  if (numInstruments > 128 || numDrums > 256) throw new Error(`bank ${bankId}: ${numInstruments} instruments / ${numDrums} drums is not a bank header`);
  const samples = new Map(), books = new Map(), loops = new Map(), envelopes = new Map(), pcmCache = new Map();
  const bookAt = off => {
    if (!books.has(off)) {
      const order = v.s32(body + off), npredictors = v.s32(body + off + 4);
      const n = 8 * Math.max(0, order) * Math.max(0, npredictors);
      const book = new Int16Array(Math.min(n, 8 * 8 * 16));
      for (let i = 0; i < book.length; i++) book[i] = v.s16(body + off + 8 + i * 2);
      books.set(off, {at: body + off, order, npredictors, book, present: v.coverage(body + off, 8 + book.length * 2)});
    }
    return books.get(off);
  };
  const loopAt = off => {
    if (!loops.has(off)) {
      const start = v.u32(body + off), end = v.u32(body + off + 4), count = v.u32(body + off + 8);
      let state = null;
      if (count !== 0) { state = new Int16Array(16); for (let i = 0; i < 16; i++) state[i] = v.s16(body + off + 16 + i * 2); }
      loops.set(off, {at: body + off, start, end, count, state, present: v.coverage(body + off, count ? 48 : 16)});
    }
    return loops.get(off);
  };
  const envelopeAt = off => {
    if (!envelopes.has(off)) envelopes.set(off, readEnvelope(v, body + off));
    return envelopes.get(off);
  };
  const sampleAt = off => {
    if (!samples.has(off)) {
      const at = body + off;
      const addr = v.u32(at + 4), loop = loopAt(v.u32(at + 8)), book = bookAt(v.u32(at + 12)), size = v.u32(at + 16);
      const frames = Math.ceil(loop.end / 16);
      samples.set(off, {at, addr, rom: te.rom + addr, loop, book, size, frames, samples: loop.end,
                        present: v.coverage(at, 16), dataPresent: v.coverage(te.rom + addr, frames * 9)});
    }
    return samples.get(off);
  };
  const soundAt = at => { const s = v.u32(at); return s ? {sample: sampleAt(s), tuning: v.f32(at + 4)} : null; };
  const instruments = [];
  for (let i = 0; i < numInstruments; i++) {
    const off = v.u32(body + 4 + i * 4);
    if (!off) { instruments.push(null); continue; }
    const at = body + off;
    instruments.push({index: i, at, present: v.coverage(at, 0x20),
                      normalRangeLo: v.u8(at + 1), normalRangeHi: v.u8(at + 2), releaseRate: v.u8(at + 3),
                      envelope: envelopeAt(v.u32(at + 4)), low: soundAt(at + 8), normal: soundAt(at + 16), high: soundAt(at + 24)});
  }
  const drums = [];
  const dp = v.u32(body);
  for (let i = 0; i < (dp ? numDrums : 0); i++) {
    const off = v.u32(body + dp + i * 4);
    if (!off) { drums.push(null); continue; }
    const at = body + off;
    drums.push({index: i, at, present: v.coverage(at, 0x10), releaseRate: v.u8(at), pan: v.u8(at + 1),
                sound: soundAt(at + 4), envelope: envelopeAt(v.u32(at + 12))});
  }
  const bank = {
    id: bankId, ctl: {rom: ce.rom, len: ce.len, present: v.coverage(ce.rom, ce.len)}, tbl: {rom: te.rom, len: te.len},
    numInstruments, numDrums, instruments, drums,
    samples: () => [...samples.values()],
    // decoded PCM per sample record, once
    pcm(rec) {
      if (!pcmCache.has(rec.addr)) {
        const data = v.read(rec.rom, rec.frames * 9);
        pcmCache.set(rec.addr, decodeSample(data, 0, rec.samples, expandBook(rec.book.order, rec.book.npredictors, rec.book.book), rec.loop));
      }
      return pcmCache.get(rec.addr);
    },
    // get_instrument (JP/US): an id past the end plays the last one, a
    // missing slot the nearest lower one; nothing = null
    instrument(id) {
      if (!numInstruments) return null;
      let i = Math.min(id, numInstruments - 1);
      while (i >= 0 && !instruments[i]) i--;
      return i >= 0 ? instruments[i] : null;
    },
    // the layer's drum lookup: an index past the end plays the last drum
    drum(id) {
      if (!drums.length) return null;
      return drums[Math.min(id, drums.length - 1)] || null;
    },
    // instrument_get_audio_bank_sound: the key region for a semitone
    sound(inst, semitone) {
      return semitone < inst.normalRangeLo ? inst.low : semitone <= inst.normalRangeHi ? inst.normal : inst.high;
    },
  };
  return bank;
}

// ---- the oot generation (Ocarina of Time, Majora's Mask) -------------------
//
// A sound font (oot include/audio.h, mm include/audio/soundfont.h;
// load.c AudioLoad_RelocateFont) is a blob whose words are offsets from its
// own start until the game relocates them into RAM pointers:
//   +0  u32 drums      -> u32 drumOffsets[numDrums] (0 = none)
//   +4  u32 sfx        -> SoundEffect[numSfx] (TunedSample each)
//   +8  u32 instruments[numInstruments] (0 = none)
//   Instrument (0x20): u8 isRelocated, normalRangeLo, normalRangeHi, adsrDecayIndex;
//                      EnvelopePoint* envelope; TunedSample low, normal, high
//                      (low only when normalRangeLo != 0, high only when normalRangeHi != 0x7F)
//   Drum (0x10):       u8 adsrDecayIndex, pan, isRelocated, pad; TunedSample; EnvelopePoint*
//   TunedSample (8):   Sample* sample; f32 tuning
//   Sample (0x10):     u32 {codec:4 (mm: unk:1 codec:3), medium:2, unk_bit26:1, isRelocated:1,
//                      size:24}; u8* sampleAddr; AdpcmLoop* loop; AdpcmBook* book
// The counts are not in the blob: the font table entry's three shorts carry
// them (bank ids, instruments<<8 | drums, sfx — AudioLoad_InitSoundFontMeta).
// An unrelocated sample's sampleAddr is an offset into sample bank
// sampleBankId1 (medium field 0) or sampleBankId2 (1) — entries of
// gSampleBankTable, absolute ROM after AudioLoad_InitTable; relocated, it is
// the absolute address and the medium field says where (cart, or RAM).
//
// Where the rip has the font: a font the game loaded while the ripper
// listened is in the ROM pages (unrelocated); a font already resident when
// the state was saved never touches the ROM again, and sits relocated in
// RDRAM at soundFontList[id].instruments − 8. Both are read through one
// address space here: addresses with the KSEG0 bit are RDRAM, the rest ROM,
// and a pointer without it is an offset from the font's start — which is
// what relocation does, undone. The ROM copy wins when both exist: the
// soundFontList pointer of a font that is not loaded is stale (it still
// points at whatever font last used that cache slot).
export const OOT_DEFAULT_ENVELOPE = [[1, 32000], [1000, 32000], [-1, 0]]; // gDefaultEnvelope (oot/mm data.c)
export const OOT_DEFAULT_DECAY_INDEX = 0xF0;                              // AudioSeq_InitSequenceChannel: adsr.decayIndex

export function ootMemory(set) {
  const {ram} = rdramOf(set.state), rom = set.rom;
  const img = a => (a >>> 0) >= 0x80000000 ? [ram, (a >>> 0) & 0x1FFFFFFF] : [rom, a >>> 0];
  return {ram, rom, view: byteView({read: (o, n) => { const [m, x] = img(o); return m.read(x, n); },
                                    coverage: (o, n) => { const [m, x] = img(o); return m.coverage(x, n); }})};
}

// -> where font `fontId`'s blob is: {base (in ootMemory's address space), source: "rom" | "ram", present}
export function ootFontSource(set, loc, fontId, mem = ootMemory(set)) {
  const {ram, rom} = mem;
  const fonts = readAudioTable(ram, loc.fontTable), e = fonts[fontId];
  if (!e) throw new Error(`font ${fontId}: its table entry is not in the rip`);
  const romCov = rom.coverage(e.rom, e.size);
  if (romCov > 0) return {base: e.rom, size: e.size, source: "rom", present: romCov};
  const list = loc.soundFontList !== undefined ? loc.soundFontList : (loc.soundFontList = findSoundFontList(ram, loc.fontTable));
  if (list != null && ram.coverage(list + fontId * 0x14 + 8, 4) === 1) {
    const ip = ram.u32(list + fontId * 0x14 + 8);
    if ((ip >>> 24) === 0x80) { const base = (ip - 8) >>> 0; return {base, size: e.size, source: "ram", present: ram.coverage(base & 0x1FFFFFFF, e.size)}; }
  }
  throw new Error(`font ${fontId}: neither in the rip's ROM pages nor resident in its RDRAM`);
}

export function readFont(set, loc, fontId, {mem = ootMemory(set)} = {}) {
  const {ram} = mem, v = mem.view;
  const src = ootFontSource(set, loc, fontId, mem);
  const e = loc.fontTable.entriesAt + fontId * 16;
  const bank1 = ram.u8(e + 10), bank2 = ram.u8(e + 11), numInstruments = ram.u8(e + 12), numDrums = ram.u8(e + 13), numSfx = ram.u16(e + 14);
  const sampleBanks = loc.sampleBankTable ? readAudioTable(ram, loc.sampleBankTable) : [];
  const base = src.base;
  const R = p => ((p >>> 0) >= 0x80000000 ? p : base + p) >>> 0;   // relocation, done or undone
  const samples = new Map(), books = new Map(), loops = new Map(), envelopes = new Map(), pcmCache = new Map();
  const bookAt = at => {
    if (!books.has(at)) {
      const order = v.s32(at), npredictors = v.s32(at + 4);
      const n = 8 * Math.max(0, order) * Math.max(0, npredictors);
      const book = new Int16Array(Math.min(n, 8 * 8 * 16));
      for (let i = 0; i < book.length; i++) book[i] = v.s16(at + 8 + i * 2);
      books.set(at, {at, order, npredictors, book, present: v.coverage(at, 8 + book.length * 2)});
    }
    return books.get(at);
  };
  const loopAt = at => {
    if (!loops.has(at)) {
      const start = v.u32(at), end = v.u32(at + 4), count = v.u32(at + 8);
      let state = null;
      if (count !== 0) { state = new Int16Array(16); for (let i = 0; i < 16; i++) state[i] = v.s16(at + 16 + i * 2); }
      loops.set(at, {at, start, end, count, state, present: v.coverage(at, count ? 48 : 16)});
    }
    return loops.get(at);
  };
  const envelopeAt = at => { if (!envelopes.has(at)) envelopes.set(at, readEnvelope(v, at)); return envelopes.get(at); };
  const sampleAt = at => {
    if (!samples.has(at)) {
      const w0 = v.u32(at), codec = (w0 >>> 28) & 7, medium = (w0 >>> 26) & 3, relocated = (w0 >>> 24) & 1, size = w0 & 0xFFFFFF;
      const addr = v.u32(at + 4);
      let dataAt = addr, bankId = null;
      if (!relocated) {
        bankId = medium === 0 ? bank1 : medium === 1 ? bank2 : null;
        const sb = bankId != null ? sampleBanks[bankId] : null;
        dataAt = sb ? (sb.rom + addr) >>> 0 : null;                  // AudioLoad_RelocateSample; media 2/3 stay unrelocated
      }
      const loop = loopAt(R(v.u32(at + 8))), book = bookAt(R(v.u32(at + 12)));
      const frames = Math.ceil(loop.end / 16);
      samples.set(at, {at, codec, medium, relocated: !!relocated, bankId, addr, rom: dataAt, size, loop, book, frames, samples: loop.end,
                       present: v.coverage(at, 16), dataPresent: dataAt == null ? 0 : v.coverage(dataAt, Math.min(size || frames * 9, frames * 9))});
    }
    return samples.get(at);
  };
  const tuned = at => { const s = v.u32(at); return s ? {sample: sampleAt(R(s)), tuning: v.f32(at + 4)} : null; };
  const instruments = [];
  for (let i = 0; i < Math.min(numInstruments, 126); i++) {         // RelocateFont: ids 126, 127 are reserved
    const off = v.u32(base + 8 + i * 4);
    if (!off) { instruments.push(null); continue; }
    const at = R(off);
    const lo = v.u8(at + 1), hi = v.u8(at + 2);
    instruments.push({index: i, at, present: v.coverage(at, 0x20), normalRangeLo: lo, normalRangeHi: hi, decayIndex: v.u8(at + 3),
                      envelope: envelopeAt(R(v.u32(at + 4))), low: lo !== 0 ? tuned(at + 8) : null, normal: tuned(at + 16), high: hi !== 0x7F ? tuned(at + 24) : null});
  }
  const drums = [];
  const dl = v.u32(base);
  for (let i = 0; i < (dl ? numDrums : 0); i++) {
    const off = v.u32(R(dl) + i * 4);
    if (!off) { drums.push(null); continue; }
    const at = R(off);
    drums.push({index: i, at, present: v.coverage(at, 0x10), decayIndex: v.u8(at), pan: v.u8(at + 1), sound: tuned(at + 4), envelope: envelopeAt(R(v.u32(at + 12)))});
  }
  const sl = v.u32(base + 4), sfx = [];
  for (let i = 0; i < (sl ? numSfx : 0); i++) sfx.push(tuned(R(sl) + i * 8));
  return {
    id: fontId, gen: "oot", source: src.source, base, size: src.size, present: src.present, sampleBankIds: [bank1, bank2],
    numInstruments, numDrums, numSfx, instruments, drums, sfx,
    samples: () => [...samples.values()],
    pcm(rec) {
      if (!pcmCache.has(rec.at)) {
        if (rec.codec !== 0) throw new Error(`sample @${rec.at.toString(16)}: codec ${rec.codec} is not VADPCM`);
        if (rec.rom == null) throw new Error(`sample @${rec.at.toString(16)}: medium ${rec.medium} was never relocated`);
        const data = v.read(rec.rom, rec.frames * 9);
        pcmCache.set(rec.at, decodeSample(data, 0, rec.samples, expandBook(rec.book.order, rec.book.npredictors, rec.book.book), rec.loop));
      }
      return pcmCache.get(rec.at);
    },
    // Audio_GetInstrumentInner / Audio_GetDrum: an id past the count, or an empty slot, is no voice (no fallback, unlike sm64)
    instrument(id) { return id >= 0 && id < instruments.length ? instruments[id] : null; },
    drum(id) { return id >= 0 && id < drums.length ? drums[id] : null; },
    soundEffect(id) { return id >= 0 && id < sfx.length ? sfx[id] : null; },
    // Audio_GetInstrumentTunedSample
    sound(inst, semitone) { return semitone < inst.normalRangeLo ? inst.low : semitone <= inst.normalRangeHi ? inst.normal : inst.high; },
  };
}
