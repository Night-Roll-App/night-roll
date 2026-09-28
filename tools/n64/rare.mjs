// Rare's GoldenEye 007 music, as a USF set carries it (INTEGRATION.md §10).
// Not Nintendo's EAD engine: the game plays the N64 SDK's own sequence
// player format — a "compressed MIDI" ALCSeq (libaudio cseq.c) through an
// SDK sound bank (ALBankFile, revision 'B1') — and stores every song 1172-
// packed (bytes 0x11 0x72, then a raw DEFLATE stream). Everything here is
// located by structure in the rip's RAM and ROM at run time: the song table
// is the chain of {rom, sizes} entries whose ROM addresses tile, the bank
// is the 'B1' header whose bank pointer lands on an ALBank, the mini's song
// is the one RAM word the mini itself overrides. Browser-clean: typed
// arrays only, no Node imports (the inflater is here because the app's
// capture is synchronous and DecompressionStream is not).
import { rdramOf, PJ64_RDRAM } from "./usf.mjs";
import { TICKS_PER_BEAT } from "./constants.mjs";
import { expandBook, decodeSample } from "./vadpcm.mjs";
import { channelGroups } from "./notes.mjs";
import { tickSeconds } from "./seq-libultra.mjs";

// ---- DEFLATE (RFC 1951), raw stream, no zlib header --------------------------
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// canonical Huffman table from code lengths: count per length, symbols in code order
function huffman(lengths) {
  const count = new Uint16Array(16), offs = new Uint16Array(16), symbol = new Uint16Array(lengths.length);
  for (const l of lengths) count[l]++;
  count[0] = 0;
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
  for (let s = 0; s < lengths.length; s++) if (lengths[s]) symbol[offs[lengths[s]]++] = s;
  return {count, symbol};
}

// Inflate a raw DEFLATE stream. `expected` (the decompressed size, when the
// container states it) ends the decode there: the game's streams do not
// always mark a final block, so "input exhausted with `expected` bytes out"
// is a normal end too. Throws on a malformed stream.
export function inflateRaw(src, expected = 0) {
  let pos = 0, bitBuf = 0, bitCnt = 0;
  let out = new Uint8Array(expected > 0 ? expected : Math.max(1024, src.length * 4)), n = 0;
  const grow = need => { if (need > out.length) { const o = new Uint8Array(Math.max(need, out.length * 2)); o.set(out.subarray(0, n)); out = o; } };
  const done = () => expected > 0 && n >= expected;
  const bits = k => {
    while (bitCnt < k) { if (pos >= src.length) throw new Error("DEFLATE: stream ends inside a code"); bitBuf |= src[pos++] << bitCnt; bitCnt += 8; }
    const v = bitBuf & ((1 << k) - 1); bitBuf >>>= k; bitCnt -= k; return v;
  };
  const decode = h => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const c = h.count[len];
      if (code - c < first) return h.symbol[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw new Error("DEFLATE: code not in the table");
  };
  let fixedLit = null, fixedDist = null;
  for (;;) {
    if (done()) break;
    if (pos >= src.length && bitCnt === 0) { if (expected > 0) throw new Error(`DEFLATE: input ends after ${n} of ${expected} bytes`); break; }
    const final = bits(1), type = bits(2);
    if (type === 0) {
      bitBuf = 0; bitCnt = 0; // stored block: byte-aligned
      if (pos + 4 > src.length) throw new Error("DEFLATE: stored block header missing");
      const len = src[pos] | (src[pos + 1] << 8); pos += 4;
      grow(n + len);
      for (let i = 0; i < len && pos < src.length; i++) out[n++] = src[pos++];
    } else {
      let lit, dist;
      if (type === 1) {
        if (!fixedLit) {
          const l = new Uint8Array(288); for (let i = 0; i < 288; i++) l[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
          fixedLit = huffman(l); fixedDist = huffman(new Uint8Array(30).fill(5));
        }
        lit = fixedLit; dist = fixedDist;
      } else if (type === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
        const clh = huffman(cl);
        const lengths = new Uint8Array(hlit + hdist);
        for (let i = 0; i < hlit + hdist;) {
          const sym = decode(clh);
          if (sym < 16) lengths[i++] = sym;
          else if (sym === 16) { if (i === 0) throw new Error("DEFLATE: repeat with no previous length"); const prev = lengths[i - 1], r = 3 + bits(2); for (let k = 0; k < r; k++) lengths[i++] = prev; }
          else if (sym === 17) { const r = 3 + bits(3); for (let k = 0; k < r; k++) lengths[i++] = 0; }
          else { const r = 11 + bits(7); for (let k = 0; k < r; k++) lengths[i++] = 0; }
        }
        lit = huffman(lengths.subarray(0, hlit)); dist = huffman(lengths.subarray(hlit));
      } else throw new Error("DEFLATE: block type 3");
      for (;;) {
        if (done()) break;
        const sym = decode(lit);
        if (sym < 256) { grow(n + 1); out[n++] = sym; continue; }
        if (sym === 256) break;
        const li = sym - 257;
        if (li >= 29) throw new Error("DEFLATE: length code " + sym);
        const len = LEN_BASE[li] + bits(LEN_EXTRA[li]);
        const di = decode(dist);
        if (di >= 30) throw new Error("DEFLATE: distance code " + di);
        const d = DIST_BASE[di] + bits(DIST_EXTRA[di]);
        if (d > n) throw new Error("DEFLATE: distance " + d + " reaches before the output");
        grow(n + len);
        for (let k = 0; k < len; k++) { out[n] = out[n - d]; n++; }
      }
    }
    if (final) break;
  }
  return out.subarray(0, n);
}

// Rare's "1172" container: the two magic bytes, then the DEFLATE stream.
export const MAGIC_1172 = [0x11, 0x72];
export function is1172(bytes, at = 0) { return bytes.length >= at + 2 && bytes[at] === 0x11 && bytes[at + 1] === 0x72; }
export function decompress1172(bytes, expected = 0) {
  if (!is1172(bytes)) throw new Error("not a 1172 block (magic 11 72 missing)");
  return inflateRaw(bytes.subarray(2), expected);
}

// ---- ALCSeq (libaudio cseq.c) ------------------------------------------------
// Header: u32 trackOffset[16] (0 = no track), u32 division (ticks per
// quarter). A track is MIDI-like: varlen delta, then a status byte or a
// running-status data byte. Note-on carries key, velocity and a varlen
// DURATION (no note-offs). Metas (0xFF): 0x51 tempo (3 bytes, µs per
// quarter, no length byte), 0x2E loop start (loop number, 0xFF), 0x2D loop
// end (loopCount, currentCount, u32 offset: from the end of this 8-byte
// event back to the byte after the loop start; 0xFF = forever, else the
// body plays count+1 times — cseq.c decrements the current count in place
// and jumps while it is not 0), 0x2F end of track. Compression is
// 0xFE hi lo len: re-read `len` bytes from `hi:lo` bytes before the 0xFE
// byte itself (measured on Dam: the two blocks in track 0 only make
// musical sense from the 0xFE's own position); 0xFE 0xFE is a literal
// 0xFE. Bytes replayed from a block are taken verbatim.
// Every offset above was checked on the rip: Dam track 0's loop end
// (offset 624) lands one byte after its loop start, Runway track 0's
// finite loop (19, offset 16) likewise.
export const CSEQ_TRACKS = 16;
export function parseCSeq(seq, {maxEvents = 200000} = {}) {
  if (seq.length < 0x44) throw new Error("ALCSeq: shorter than its header");
  const u32 = o => ((seq[o] << 24) | (seq[o + 1] << 16) | (seq[o + 2] << 8) | seq[o + 3]) >>> 0;
  const offsets = []; for (let i = 0; i < CSEQ_TRACKS; i++) offsets.push(u32(i * 4));
  const division = u32(0x40);
  if (!(division > 0 && division <= 0x10000)) throw new Error("ALCSeq: division " + division);
  for (const o of offsets) if (o !== 0 && (o < 0x44 || o >= seq.length)) throw new Error("ALCSeq: track offset 0x" + o.toString(16) + " outside the sequence");
  const tracks = offsets.map((offset, index) => offset === 0 ? null : readTrack(seq, offset, index, maxEvents));
  return {division, offsets, tracks};
}

function readTrack(seq, offset, index, maxEvents) {
  let loc = offset, bu = -1, buLen = 0, lastStatus = 0, tick = 0;
  const get = () => {
    if (bu >= 0) { const b = seq[bu++]; if (--buLen === 0) bu = -1; return b; }
    if (loc >= seq.length) throw new Error(`ALCSeq track ${index}: runs off the end`);
    const feAt = loc;
    let b = seq[loc++];
    if (b === 0xFE) {
      if (seq[loc] === 0xFE) { loc++; return 0xFE; }
      const hi = seq[loc++], lo = seq[loc++], len = seq[loc++];
      const back = (hi << 8) | lo;
      if (len === 0 || back === 0 || feAt - back < 0x44) throw new Error(`ALCSeq track ${index}: block at ${feAt} reaches ${back} back (${len} bytes)`);
      bu = feAt - back; buLen = len;
      b = seq[bu++]; if (--buLen === 0) bu = -1;
    }
    return b;
  };
  const varlen = () => { let v = 0, b, k = 0; do { b = get(); v = (v * 128) + (b & 0x7F); if (++k > 4) throw new Error(`ALCSeq track ${index}: varlen over 4 bytes`); } while (b & 0x80); return v; };
  const events = [];
  const remaining = new Map(); // finite loop ends still to jump, by their byte position
  let end = null, loopStart = null, loopEnd = null;
  while (events.length < maxEvents) {
    tick += varlen();
    const st = get();
    if (st === 0xFF) {
      const type = get();
      if (type === 0x51) { const us = (get() << 16) | (get() << 8) | get(); events.push({tick, type: "tempo", us}); }
      else if (type === 0x2E) { const num = get(), b = get(); events.push({tick, type: "loopStart", num, b, at: loc}); if (!loopStart || num === 0) loopStart = {tick, num, at: loc, index: events.length - 1}; }
      else if (type === 0x2D) {
        const count = get(), current = get();
        const back = ((get() << 24) | (get() << 16) | (get() << 8) | get()) >>> 0;
        const here = loc;
        if (count === 0xFF) { loopEnd = {tick, count, back, at: here}; events.push({tick, type: "loopEnd", count, back}); end = {tick, how: "loop"}; break; } // one pass; the loop is a fact on the result
        // finite: jump while the running count is not 0 (the body plays count+1 times)
        if (!remaining.has(here)) remaining.set(here, current);
        const left = remaining.get(here);
        if (left > 0) {
          remaining.set(here, left - 1);
          if (back === 0 || here - back < offset) throw new Error(`ALCSeq track ${index}: loop end at ${here} jumps ${back} back`);
          loc = here - back; bu = -1; buLen = 0;
        } else remaining.set(here, current); // reset for an outer pass
      }
      else if (type === 0x2F) { events.push({tick, type: "end"}); end = {tick, how: "end"}; break; }
      else throw new Error(`ALCSeq track ${index}: meta 0x${type.toString(16)} at tick ${tick}`);
      continue;
    }
    let status, d1;
    if (st & 0x80) { status = st; lastStatus = st; d1 = get(); }
    else { if (!lastStatus) throw new Error(`ALCSeq track ${index}: data byte before any status`); status = lastStatus; d1 = st; }
    const kind = status & 0xF0, ch = status & 0x0F;
    if (kind === 0x90) { const vel = get(), dur = varlen(); events.push({tick, type: "note", ch, key: d1, vel, dur}); }
    else if (kind === 0xC0) events.push({tick, type: "program", ch, program: d1});
    else if (kind === 0xD0) events.push({tick, type: "pressure", ch, value: d1});
    else if (kind === 0xB0) { const v = get(); events.push({tick, type: "control", ch, controller: d1, value: v}); }
    else if (kind === 0xE0) { const msb = get(); events.push({tick, type: "bend", ch, value: ((msb << 7) | d1) - 8192}); }
    else if (kind === 0x80) { const v = get(); events.push({tick, type: "noteOff", ch, key: d1, vel: v}); }
    else if (kind === 0xA0) { const v = get(); events.push({tick, type: "polyPressure", ch, key: d1, value: v}); }
    else throw new Error(`ALCSeq track ${index}: status 0x${status.toString(16)} at tick ${tick}`);
  }
  if (!end) throw new Error(`ALCSeq track ${index}: ${maxEvents} events without an end`);
  return {index, offset, events, end, loopStart, loopEnd};
}

// One pass of the whole song. Each track loops on its own; the song's pass
// ends where the last track's loop (or end) does, and a track whose forever-
// loop closes earlier is unrolled to there, so the capture holds every part
// through the first pass (the ambient songs layer loops of different lengths).
export function unrollTracks(cs, {maxEvents = 400000} = {}) {
  const songEnd = Math.max(0, ...cs.tracks.filter(t => t).map(t => t.end.tick));
  return cs.tracks.map(t => {
    if (!t || t.end.how !== "loop" || !t.loopStart || t.end.tick >= songEnd) return t;
    const from = t.loopStart.tick, len = t.end.tick - from;
    if (len <= 0) return t;
    const body = t.events.slice(t.loopStart.index + 1).filter(e => e.type !== "loopEnd");
    const events = t.events.slice();
    for (let k = 1; from + k * len < songEnd && events.length < maxEvents; k++) for (const e of body) { const tick = e.tick + k * len; if (tick < songEnd) events.push({...e, tick}); }
    return {...t, events, unrolledTo: songEnd};
  });
}

// The parsed tracks as the app's capture result (the shape tools/n64/
// seq-libultra.mjs returns; capture.mjs documents the fields). Ticks are
// rescaled to TICKS_PER_BEAT per quarter (the division is kept as a fact);
// a note is {ch, inst (program), key/semitone/midi (the MIDI key), tick,
// dur, vel, bank 0, vol (cc7/127 at note-on), pan (cc10/128), rev (cc91),
// bend (cents at note-on, from the wheel × the instrument's range later)}.
// The song loop: every track carries its own loop-start/loop-end pair; the
// pair most tracks share is the song's (a disagreement is a warning).
export function cseqNotes(cs, {maxSeconds = 600} = {}) {
  const scale = TICKS_PER_BEAT / cs.division;
  const T = t => Math.round(t * scale);
  const notes = [], tempoMap = new Map(), warnings = [];
  const chan = [];
  for (let c = 0; c < 16; c++) chan.push({program: null, vol: 127, pan: 64, rev: 0, bend: 0});
  const loops = new Map();
  let endTick = 0, offs = 0, poly = 0, pressure = 0;
  const tracks = unrollTracks(cs);
  const all = [];
  for (const t of tracks) if (t) for (const e of t.events) all.push(e);
  all.sort((a, b) => a.tick - b.tick || (a.type === "note" ? 1 : 0) - (b.type === "note" ? 1 : 0)); // controls before notes at the same tick
  for (const e of all) {
    const C = e.ch != null ? chan[e.ch] : null;
    switch (e.type) {
      case "tempo": if (e.us > 0) tempoMap.set(T(e.tick), 6e7 / e.us); break;
      case "program": C.program = e.program; break;
      case "control":
        if (e.controller === 7) C.vol = e.value;
        else if (e.controller === 10) C.pan = e.value;
        else if (e.controller === 91) C.rev = e.value;
        break;
      case "bend": C.bend = e.value / 8192; break;
      case "noteOff": offs++; break;
      case "polyPressure": poly++; break;
      case "pressure": pressure++; break;
      case "note": {
        const tick = T(e.tick), dur = Math.max(1, T(e.tick + e.dur) - tick);
        notes.push({ch: e.ch, inst: C.program, drum: false, key: e.key, semitone: e.key, midi: e.key, tick, dur, vel: e.vel,
                    bank: 0, vol: C.vol / 127, pan: C.pan / 128, rev: C.rev, bend: C.bend});
        break;
      }
    }
  }
  for (const t of cs.tracks) if (t) {
    endTick = Math.max(endTick, T(t.end.tick));
    if (t.loopEnd) { const k = (t.loopStart ? T(t.loopStart.tick) : 0) + ":" + T(t.loopEnd.tick); loops.set(k, (loops.get(k) || 0) + 1); }
  }
  // the song's loop: the pass ends where the last track's forever-loop does; its start is
  // the one most tracks that end there share (short riff loops inside it are not the song's)
  let loop = null;
  if (loops.size) {
    const atEnd = [...loops].filter(([k]) => Number(k.split(":")[1]) === endTick).sort((a, b) => b[1] - a[1]);
    const [best] = atEnd.length ? atEnd : [...loops].sort((a, b) => b[1] - a[1]);
    const [from, at] = best[0].split(":").map(Number);
    loop = {tick: from, at};
    if (loops.size > 1) warnings.push("tracks loop at different points: " + [...loops].map(([k, n]) => k.replace(":", "→") + "×" + n).join(", ") + " (the roll's loop is the song's)");
  }
  const tempos = [...tempoMap].map(([tick, bpm]) => ({tick, bpm: Math.round(bpm * 100) / 100})).sort((a, b) => a.tick - b.tick);
  if (!tempos.length || tempos[0].tick !== 0) tempos.unshift({tick: 0, bpm: 120});
  if (offs) warnings.push(offs + " note-off events (unused by this player, ignored)");
  if (poly || pressure) warnings.push("aftertouch ignored (" + (poly + pressure) + " events)");
  const seconds = tickSeconds(tempos, endTick);
  const truncated = seconds > maxSeconds; // a fact for the row; the pass is kept whole
  return {abi: "rare", driver: "rare", ticksPerBeat: TICKS_PER_BEAT, division: cs.division, notes, tempos, endTick, seconds, loop,
          truncated, selfModified: false, ioReads: 0, stubbed: [], warnings,
          channels: [...new Set(notes.map(n => n.ch))].sort((a, b) => a - b)};
}

// ---- the song table (RAM) ----------------------------------------------------
// The game keeps its music directory in RAM: 8-byte entries {u32 romAddr;
// u16 unpackedSize; u16 packedSize}, songs stored back to back in ROM so
// each entry's address is the previous one's plus its packed size. Found
// as the longest such chain (a real one has dozens of links); the packed
// bytes, where the rip has them, start with 11 72.
export function findMusicTable(ram, rom = null, {minEntries = 8} = {}) {
  let best = null;
  for (const r of ram.runs()) {
    for (let p = r.offset & ~3; p + 16 <= r.offset + r.length; p += 4) {
      let q = p, count = 0;
      while (q + 8 <= r.offset + r.length) {
        const addr = ram.u32(q), sizes = ram.u32(q + 4), packed = sizes & 0xFFFF, unpacked = sizes >>> 16;
        if (addr < 0x1000 || addr >= 0x4000000 || packed < 4 || unpacked < 0x44) break;
        if (q + 16 <= r.offset + r.length && ram.u32(q + 8) !== addr + packed) { count++; break; }
        count++; q += 8;
      }
      if (count >= minEntries && (!best || count > best.count)) best = {at: p, count};
      if (count > 1) p = q - 4; // skip what the chain covered
    }
  }
  if (!best) return null;
  const entries = [];
  for (let i = 0; i < best.count; i++) {
    const q = best.at + i * 8, addr = ram.u32(q), sizes = ram.u32(q + 4);
    const packed = sizes & 0xFFFF, size = sizes >>> 16;
    const coverage = rom ? rom.coverage(addr, packed) : 0;
    entries.push({id: i, rom: addr, packed, size, coverage, magic: rom && rom.coverage(addr, 2) === 1 ? is1172(rom.read(addr, 2)) : null});
  }
  if (rom && entries.some(e => e.magic === false)) return null; // a present song that is not 1172-packed: not this table
  return {at: best.at, count: best.count, entries};
}

// Which song a mini plays: the RAM word the mini's own save-state chunk
// overrides (the whole difference between two minis of a set), or a
// manifest rule {kind: "ram", addr} when the set names one. Returns the
// index or null.
export function miniOverrideWords(set) {
  const out = [];
  for (const c of (set.top && set.top.state) || []) {
    if (c.offset < PJ64_RDRAM || c.bytes.length !== 4) continue;
    const b = c.bytes; // little-endian words in the state file
    out.push({addr: c.offset - PJ64_RDRAM, value: (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0});
  }
  return out;
}
export function miniRareTrack(set, table, rule = null) {
  const {ram} = rdramOf(set.state);
  if (rule && rule.kind === "ram" && ram.coverage(rule.addr, 4) === 1) return ram.u32(rule.addr);
  const words = miniOverrideWords(set).filter(w => w.value < table.count);
  return words.length === 1 ? words[0].value : null;
}

// ---- the bank (RAM) ----------------------------------------------------------
// SDK ALBankFile as the game left it after alBnkfNew: every offset already
// a RAM pointer (0x80xxxxxx), wavetable bases patched to absolute ROM
// addresses. Layouts (libaudio.h):
//   ALBankFile  {s16 revision 'B1'; s16 bankCount; ALBank* bankArray[]}
//   ALBank      {s16 instCount; u8 flags; u8 pad; s32 sampleRate; ALInstrument* percussion; ALInstrument* instArray[]}
//   ALInstrument{u8 volume, pan, priority, flags; u8 tremType, tremRate, tremDepth, tremDelay;
//                u8 vibType, vibRate, vibDepth, vibDelay; s16 bendRange (cents); s16 soundCount; ALSound* soundArray[]}
//   ALSound     {ALEnvelope*; ALKeyMap*; ALWaveTable*; u8 samplePan, sampleVolume, flags}
//   ALEnvelope  {s32 attackTime, decayTime, releaseTime (µs; decay -1 = hold); u8 attackVolume, decayVolume}
//   ALKeyMap    {u8 velocityMin, velocityMax, keyMin, keyMax, keyBase; s8 detune (cents)}
//   ALWaveTable {u8* base; s32 len; u8 type (0 = ADPCM); u8 flags; ALADPCMloop* loop; ALADPCMBook* book}
//   ALADPCMloop {u32 start, end, count; s16 state[16]}   ALADPCMBook {s32 order, npredictors; s16 book[]}
// The rip holds only the words the game read: instrument bytes 4..11
// (tremolo/vibrato) and the percussion pointer are never there, and
// neither is an envelope's attackTime (the player evidently never reads
// it: INTEGRATION.md §10) — reads of absent words fall back to 0 and each
// record says what was present.
export function findRareBankFile(ram) {
  const out = [];
  for (const r of ram.runs()) {
    for (let p = r.offset & ~1; p + 8 <= r.offset + r.length; p += 2) {
      if (ram.u16(p) !== 0x4231) continue;
      const count = ram.u16(p + 2);
      if (count < 1 || count > 16 || ram.coverage(p + 4, 4 * count) < 1) continue;
      const banks = [];
      for (let i = 0; i < count; i++) {
        const ptr = ram.u32(p + 4 + i * 4);
        if ((ptr >>> 24) !== 0x80) break;
        const b = ptr & 0x1FFFFFFF;
        if (ram.coverage(b, 8) < 1) break;
        const instCount = ram.u16(b), sampleRate = ram.u32(b + 4);
        if (instCount < 1 || instCount > 256 || sampleRate < 4000 || sampleRate > 96000) break;
        banks.push({at: b, instCount, sampleRate});
      }
      if (banks.length === count) out.push({at: p, count, banks});
    }
  }
  return out;
}

const ptr = (ram, p) => { if (ram.coverage(p, 4) < 1) return null; const v = ram.u32(p); return (v >>> 24) === 0x80 ? v & 0x1FFFFFFF : null; };
const u8or = (ram, p, d) => ram.coverage(p, 1) === 1 ? ram.u8(p) : d;

export function readRareBank(ram, rom, bankAt) {
  // lenient readers: a word the game never read is absent from the rip and reads as 0 (each record carries `present`)
  const u8 = p => ram.read(p, 1)[0], u16 = p => { const x = ram.read(p, 2); return (x[0] << 8) | x[1]; }, u32 = p => { const x = ram.read(p, 4); return ((x[0] << 24) | (x[1] << 16) | (x[2] << 8) | x[3]) >>> 0; };
  const instCount = u16(bankAt), sampleRate = u32(bankAt + 4);
  const envelopes = new Map(), keymaps = new Map(), waves = new Map(), sounds = new Map(), pcm = new Map();
  const envelope = p => {
    if (!envelopes.has(p)) {
      const have = o => ram.coverage(p + o, 4) === 1;
      const s32 = o => have(o) ? u32(p + o) | 0 : null;
      envelopes.set(p, {at: p, attackTime: s32(0), decayTime: s32(4), releaseTime: s32(8),
                        attackVolume: u8or(ram, p + 12, 127), decayVolume: u8or(ram, p + 13, 127), present: ram.coverage(p, 14)});
    }
    return envelopes.get(p);
  };
  const keymap = p => {
    if (!keymaps.has(p)) {
      const b = ram.read(p, 6);
      keymaps.set(p, {at: p, velocityMin: b[0], velocityMax: b[1], keyMin: b[2], keyMax: b[3], keyBase: b[4], detune: (b[5] << 24) >> 24, present: ram.coverage(p, 6)});
    }
    return keymaps.get(p);
  };
  const wave = p => {
    if (!waves.has(p)) {
      const base = u32(p), len = u32(p + 4) | 0, type = u8(p + 8), flags = u8(p + 9);
      const loopAt = ptr(ram, p + 12), bookAt = ptr(ram, p + 16);
      let loop = null, book = null;
      if (loopAt) {
        const start = u32(loopAt), end = u32(loopAt + 4), count = u32(loopAt + 8);
        const state = new Int16Array(16); for (let i = 0; i < 16; i++) state[i] = (u16(loopAt + 12 + i * 2) << 16) >> 16;
        loop = {at: loopAt, start, end, count, state, present: ram.coverage(loopAt, 12)};
      }
      if (bookAt) {
        const order = u32(bookAt) | 0, npredictors = u32(bookAt + 4) | 0;
        const n = 8 * Math.max(0, Math.min(8, order)) * Math.max(0, Math.min(16, npredictors));
        const coef = new Int16Array(n); for (let i = 0; i < n; i++) coef[i] = (u16(bookAt + 8 + i * 2) << 16) >> 16;
        book = {at: bookAt, order, npredictors, book: coef, present: ram.coverage(bookAt, 8 + n * 2)};
      }
      waves.set(p, {at: p, base, len, type, flags, loop, book, present: ram.coverage(p, 20)});
    }
    return waves.get(p);
  };
  const sound = p => {
    if (!sounds.has(p)) {
      const e = ptr(ram, p), k = ptr(ram, p + 4), w = ptr(ram, p + 8);
      sounds.set(p, {at: p, envelope: e ? envelope(e) : null, keymap: k ? keymap(k) : null, wave: w ? wave(w) : null,
                     samplePan: u8or(ram, p + 12, 64), sampleVolume: u8or(ram, p + 13, 127), flags: u8or(ram, p + 14, 0), present: ram.coverage(p, 12)});
    }
    return sounds.get(p);
  };
  const instruments = [];
  for (let i = 0; i < instCount; i++) {
    const p = ptr(ram, bankAt + 12 + i * 4);
    if (!p) { instruments.push(null); continue; }
    const next = i + 1 < instCount ? ptr(ram, bankAt + 16 + i * 4) : bankAt;
    // soundCount from the field when the rip has it, else from the struct's extent (the next instrument follows it)
    const fieldPresent = ram.coverage(p + 14, 2) === 1;
    const soundCount = fieldPresent ? u16(p + 14) : next && next > p + 16 ? (next - p - 16) >> 2 : 0;
    const bendRange = ram.coverage(p + 12, 2) === 1 ? u16(p + 12) : 200;
    const list = [];
    for (let s = 0; s < Math.min(soundCount, 128); s++) { const sp = ptr(ram, p + 16 + s * 4); list.push(sp ? sound(sp) : null); }
    instruments.push({index: i, at: p, volume: u8or(ram, p, 127), pan: u8or(ram, p + 1, 64), priority: u8or(ram, p + 2, 5), flags: u8or(ram, p + 3, 0),
                      bendRange, soundCount, sounds: list});
  }
  return {
    at: bankAt, instCount, sampleRate, instruments,
    flags: u8or(ram, bankAt + 2, 0),
    instrument(i) { return i != null && i >= 0 && i < instruments.length ? instruments[i] : null; },
    // the SDK's lookup: the first sound whose key map holds the key and velocity
    sound(inst, key, vel) {
      if (!inst) return null;
      for (const s of inst.sounds) {
        if (!s || !s.keymap) continue;
        const k = s.keymap;
        if (key >= k.keyMin && key <= k.keyMax && vel >= k.velocityMin && vel <= k.velocityMax) return s;
      }
      return null;
    },
    // decoded sample for a wavetable: {pcm, loopStart, loopEnd, looping, coverage}
    // decoded sample for a wavetable: {pcm, loopStart, loopEnd, looping, coverage}; type 0 = VADPCM,
    // type 1 = AL_RAW16_WAVE (big-endian s16, its loop struct {start, end, count} where the ADPCM loop sits)
    pcm(w) {
      if (!w) return null;
      if (!pcm.has(w.at)) {
        const loop = w.loop && w.loop.count !== 0 && w.loop.end > w.loop.start ? w.loop : null;
        if (w.type === 1) {
          const total = w.len >> 1, samples = loop ? Math.min(loop.end, total) : total;
          const bytes = rom.read(w.base, samples * 2), out = new Float32Array(samples);
          for (let i = 0; i < samples; i++) out[i] = (((bytes[i * 2] << 8) | bytes[i * 2 + 1]) << 16 >> 16) / 32768;
          pcm.set(w.at, {pcm: out, loopStart: loop ? loop.start : null, loopEnd: loop ? samples : samples, looping: !!loop, coverage: rom.coverage(w.base, samples * 2)});
        } else if (w.type !== 0 || !w.book) { pcm.set(w.at, null); return null; }
        else {
          const frames = Math.floor(w.len / 9);
          const samples = loop ? Math.min(loop.end, frames * 16) : frames * 16;
          const bytes = rom.read(w.base, Math.ceil(samples / 16) * 9);
          const coverage = rom.coverage(w.base, Math.ceil(samples / 16) * 9);
          const book = expandBook(w.book.order, w.book.npredictors, w.book.book);
          pcm.set(w.at, {...decodeSample(bytes, 0, samples, book, loop), coverage});
        }
      }
      return pcm.get(w.at);
    },
  };
}

// A drum kit, as this bank spells one: an instrument of two or more sounds
// whose every key map is a single key (keyMin == keyMax — one sample per
// slot, no pitch range). The sequence's key is then a slot, not a pitch,
// and the capture says so (drum: true), which is what puts the part on the
// roll's kit lane with a rhythm-guessed GM key (notes.mjs) instead of as
// C2/E2 melody. A fact of the bank, not a guess about the music.
export function isKitInstrument(inst) {
  if (!inst || inst.sounds.length < 2) return false;
  let seen = 0;
  for (const s of inst.sounds) { if (!s || !s.keymap) continue; seen++; if (s.keymap.keyMin !== s.keymap.keyMax) return false; }
  return seen >= 2;
}

// ---- the driver --------------------------------------------------------------
// sequenceOfSet's fallback: the same shape it returns for EAD sets.
export function rareSequenceOfSet(set, {game = null, maxSeconds = 600} = {}) {
  const {ram} = rdramOf(set.state);
  const table = findMusicTable(ram, set.rom);
  if (!table) throw new Error("no Rare music table in this rip's memory — a driver Night Roll cannot read yet");
  const id = miniRareTrack(set, table, game && game.seqId);
  if (id == null) throw new Error("this mini does not say which of the game's " + table.count + " songs it plays");
  const e = table.entries[id];
  if (!e) throw new Error("song " + id + " is past the game's table (" + table.count + " songs)");
  if (e.coverage === 0) throw new Error("song " + id + "'s bytes are not in this rip's ROM pages");
  const packed = set.rom.read(e.rom, e.packed);
  const present = new Uint8Array(e.packed);
  for (let i = 0; i < e.packed; i++) present[i] = set.rom.coverage(e.rom + i, 1) ? 1 : 0;
  if (e.coverage < 1) throw new Error("song " + id + ": only " + Math.round(e.coverage * 100) + "% of its bytes are in the rip");
  const bytes = decompress1172(packed, e.size);
  const cs = parseCSeq(bytes);
  const res = cseqNotes(cs, {maxSeconds});
  res.sequenceId = id; res.variation = 0; res.reverb = null; res.ducked = [];
  const banks = findRareBankFile(ram);
  if (banks.length) { // programs that are kits in this bank: their notes are slots
    const bank = readRareBank(ram, set.rom, banks[0].banks[0].at);
    const kits = new Set(bank.instruments.filter(isKitInstrument).map(i => i.index));
    if (kits.size) {
      for (const n of res.notes) if (kits.has(n.inst)) n.drum = true;
      res.kits = [...kits].sort((a, b) => a - b);
    }
  }
  const loc = {gen: "rare", abi: "rare", sequences: table.entries.map(x => ({id: x.id, rom: x.rom, size: x.packed, unpacked: x.size, coverage: x.coverage, banks: [0]})),
               table: {at: table.at, count: table.count}, bankFile: banks.length ? {at: banks[0].at, count: banks[0].count, banks: banks[0].banks} : null};
  const seq = {id, rom: e.rom, size: e.packed, unpacked: e.size, coverage: e.coverage, banks: [0]};
  return {game, loc, id, seq, res, present, ducked: [], driver: "rare"};
}

// ---- the render --------------------------------------------------------------
// The SDK synthesizer's voice as the sequence player drives it (libaudio
// seqp/cseqp + syn): pitch = 2^(((key − keyBase)·100 + detune + bend·bendRange)/1200)
// at the bank's sampleRate (the game's output rate: ratio 1 plays a
// sample at that rate); volume = velocity/127 × sampleVolume/127 ×
// channel volume/127 × envelope, the envelope being alSynSetVol ramps:
// to attackVolume over attackTime, to decayVolume over decayTime (−1 =
// hold), to silence over releaseTime at the note's end. The envelope
// mixer moves volume by a per-8-sample multiplier, so each ramp is
// exponential between its endpoints (floor 1/32767). attackTime is never
// in the rip (§10) — a 0 attack is what the data leaves; verified by ear
// against the lazyusf2 renders, not proven. Dry: cc91 is kept as a fact
// on each note, no reverb is rendered. Mono per track, pan ignored.
export const ENV_FLOOR = 1 / 32767;
export function envelopeGain(env, rate, holdSamples, out) {
  // out: Float32Array to fill (length ≥ holdSamples + release); returns samples written
  const A = Math.max(ENV_FLOOR, (env.attackVolume || 0) / 127), D = Math.max(ENV_FLOOR, (env.decayVolume || 0) / 127);
  const ta = Math.max(0, Math.round(((env.attackTime || 0) / 1e6) * rate));
  const hold = env.decayTime == null || env.decayTime < 0 || env.decayTime === 0x7FFFFFFF;
  const td = hold ? Infinity : Math.max(0, Math.round((env.decayTime / 1e6) * rate));
  const tr = Math.max(1, Math.round(((env.releaseTime || 0) / 1e6) * rate));
  let i = 0, level = ENV_FLOOR;
  // attack
  if (ta > 0) { const r = Math.pow(A / level, 1 / ta); for (let k = 0; k < ta && i < holdSamples && i < out.length; k++, i++) { level *= r; out[i] = level; } }
  level = i >= ta ? A : level;
  // decay
  if (i < holdSamples) {
    if (td === Infinity) { for (; i < holdSamples && i < out.length; i++) out[i] = level; }
    else {
      const r = td > 0 ? Math.pow(D / A, 1 / td) : 1;
      let k = 0;
      for (; i < holdSamples && i < out.length; i++) { if (k < td) { level *= r; k++; } else level = D; out[i] = level; }
    }
  }
  // release from wherever the note was
  const r = Math.pow(ENV_FLOOR / level, 1 / tr);
  for (let k = 0; k < tr && i < out.length; k++, i++) { level *= r; out[i] = level; }
  return i;
}

export async function renderRare(result, opts = {}) {
  const set = opts.set;
  if (!set || !set.rom || !set.state) throw new Error("renderRare needs the set (its ROM pages and save state)");
  const {ram} = rdramOf(set.state);
  const files = opts.bankFile || findRareBankFile(ram)[0];
  if (!files) throw new Error("no sound bank in this rip's memory");
  const bank = readRareBank(ram, set.rom, files.banks[0].at);
  const sampleRate = opts.sampleRate || bank.sampleRate;
  const groups = channelGroups(result, opts.meter || {});
  const {tempos, notes} = result;
  const endTick = Math.max(result.endTick || 0, ...notes.map(n => n.tick + n.dur));
  const seconds = Math.min(opts.keepSeconds || Infinity, tickSeconds(tempos, endTick) + 2.5);
  const N = Math.ceil(seconds * sampleRate);
  const out = {sampleRate, seconds, silent: [], warnings: [], reverb: null, bankRate: bank.sampleRate};
  const warned = new Set();
  const warn = w => { if (!warned.has(w)) { warned.add(w); out.warnings.push(w); } };
  let done = 0, total = 0;
  for (const g of groups) total += g.notes.length;
  let envBuf = new Float32Array(sampleRate * 8);
  for (const g of groups) {
    let buf = null;
    for (const n of g.notes) {
      done++;
      if (opts.onProgress && (done & 31) === 0) { opts.onProgress(done / total); await new Promise(r => setTimeout(r, 0)); }
      const t0 = tickSeconds(tempos, n.tick);
      if (t0 >= seconds) continue;
      const inst = bank.instrument(n.inst);
      if (!inst) { warn(`program ${n.inst} on channel ${n.ch} is not in the bank (${bank.instCount} instruments)`); continue; }
      const snd = bank.sound(inst, n.key, n.vel);
      if (!snd) { warn(`program ${n.inst}: no sound for key ${n.key} at velocity ${n.vel}`); continue; }
      if (!snd.wave) { warn(`program ${n.inst}: sound at 0x${snd.at.toString(16)} has no wavetable in the rip`); continue; }
      const smp = bank.pcm(snd.wave);
      if (!smp) { warn(`program ${n.inst}: wavetable type ${snd.wave.type} is neither ADPCM nor raw 16-bit, not rendered`); continue; }
      if (smp.coverage < 0.999) warn(`program ${n.inst}: sample at rom 0x${snd.wave.base.toString(16)} is ${Math.floor(smp.coverage * 100)}% present`);
      const km = snd.keymap || {keyBase: 60, detune: 0};
      const cents = (n.key - km.keyBase) * 100 + km.detune + (n.bend || 0) * inst.bendRange;
      const ratio = Math.pow(2, cents / 1200);
      const step = ratio * bank.sampleRate / sampleRate;
      const base = (Math.max(0, Math.min(127, n.vel)) / 127) * (snd.sampleVolume / 127) * (n.vol != null ? n.vol : 1) * (inst.volume / 127);
      if (base <= 0) continue;
      const env = snd.envelope || {attackTime: 0, decayTime: -1, releaseTime: 0, attackVolume: 127, decayVolume: 127};
      const i0 = Math.floor(t0 * sampleRate), iOff = Math.floor(tickSeconds(tempos, n.tick + n.dur) * sampleRate);
      const holdSamples = Math.max(1, iOff - i0);
      const need = holdSamples + Math.round(((env.releaseTime || 0) / 1e6) * sampleRate) + 2;
      if (envBuf.length < need) envBuf = new Float32Array(need);
      const len = envelopeGain(env, sampleRate, holdSamples, envBuf);
      const pcm = smp.pcm, L = smp.loopEnd, loopStart = smp.loopStart;
      let pos = 0;
      for (let k = 0; k < len; k++) {
        const i = i0 + k;
        if (i >= N) break;
        if (pos >= L) { if (!smp.looping) break; pos = loopStart + (pos - loopStart) % (L - loopStart); }
        const p0 = pos | 0, f = pos - p0, a = pcm[p0], b = p0 + 1 < L ? pcm[p0 + 1] : smp.looping ? pcm[loopStart] : 0;
        const v = (a + (b - a) * f) * base * envBuf[k];
        if (v !== 0) { if (!buf) buf = new Float32Array(N); buf[i] += v; }
        pos += step;
      }
    }
    if (buf) out[g.name] = buf; else out.silent.push(g.name);
  }
  if (opts.onProgress) opts.onProgress(1);
  return out;
}
