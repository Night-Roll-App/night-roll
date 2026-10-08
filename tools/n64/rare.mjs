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
import { decodeLiA1, miniSequenceId } from "./ead-usf.mjs";
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

// Rare's "1172" container, two flavours seen: GoldenEye's is the two magic
// bytes then the DEFLATE stream (the song table carries the unpacked size);
// Banjo-Kazooie's is the magic, a big-endian u32 unpacked size, then the
// stream. parse1172 tells them apart by trying the sized form first (its
// size word must come out exactly), then the bare one.
export const MAGIC_1172 = [0x11, 0x72];
export function is1172(bytes, at = 0) { return bytes.length >= at + 2 && bytes[at] === 0x11 && bytes[at + 1] === 0x72; }
export function parse1172(bytes, expected = 0) {
  if (!is1172(bytes)) throw new Error("not a 1172 block (magic 11 72 missing)");
  if (expected > 0) return {data: inflateRaw(bytes.subarray(2), expected), flavour: "bare"};
  const size = bytes.length >= 6 ? ((bytes[2] << 24) | (bytes[3] << 16) | (bytes[4] << 8) | bytes[5]) >>> 0 : 0;
  if (size >= 8 && size <= 0x400000) { try { const d = inflateRaw(bytes.subarray(6), size); if (d.length === size) return {data: d, flavour: "sized"}; } catch { /* not that flavour */ } }
  return {data: inflateRaw(bytes.subarray(2)), flavour: "bare"};
}
export function decompress1172(bytes, expected = 0) { return parse1172(bytes, expected).data; }

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
// `walk` is for a song read out of a rip's RAM: alCSeqNew reads the offset
// table once, before the state was taken, so the rip need not keep the
// song's own words there — Donkey Kong 64's DK Rap mini holds only slots
// 10–14; slots 0–5 are the library's words for another song. The tracks
// are found instead by walking from the first (at 0x44) through each one's
// FF 2F to the next, up to 16, stopping at the first that does not parse
// (the zeros after the song). Walked tracks take the slots in byte order.
export function parseCSeq(seq, {maxEvents = 200000, walk = false} = {}) {
  if (seq.length < 0x44) throw new Error("ALCSeq: shorter than its header");
  const u32 = o => ((seq[o] << 24) | (seq[o + 1] << 16) | (seq[o + 2] << 8) | seq[o + 3]) >>> 0;
  const division = u32(0x40);
  if (!(division > 0 && division <= 0x10000)) throw new Error("ALCSeq: division " + division);
  let offsets = [];
  if (walk) {
    let loc = 0x44;
    while (loc < seq.length && offsets.length < CSEQ_TRACKS) {
      let t; try { t = readTrack(seq, loc, offsets.length, maxEvents, {scan: true}); } catch (e) { if (!offsets.length) throw e; break; }
      offsets.push(loc); loc = t.next;
    }
    while (offsets.length < CSEQ_TRACKS) offsets.push(0);
  } else {
    for (let i = 0; i < CSEQ_TRACKS; i++) offsets.push(u32(i * 4));
    for (const o of offsets) if (o !== 0 && (o < 0x44 || o >= seq.length)) throw new Error("ALCSeq: track offset 0x" + o.toString(16) + " outside the sequence");
  }
  const tracks = offsets.map((offset, index) => offset === 0 ? null : readTrack(seq, offset, index, maxEvents, {scan: walk}));
  return {division, offsets, tracks};
}

function readTrack(seq, offset, index, maxEvents, {scan = false} = {}) {
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
  let end = null, loopStart = null, loopEnd = null, passOver = false, steps = 0;
  const push = e => { if (!passOver) events.push(e); };
  while (events.length < maxEvents && steps++ < maxEvents * 4) {
    tick += varlen();
    const st = get();
    if (st === 0xFF) {
      const type = get();
      // loop metas' operands are read straight from the track pointer (cseq.c touches curLoc, never
      // __getTrackByte), so an FE among them is a plain byte, not a back-reference (Banjo-Kazooie's
      // Click Clock Wood Spring ends its loop 0x1FE bytes back)
      const raw = () => bu >= 0 ? get() : seq[loc++];
      if (type === 0x51) { const us = (get() << 16) | (get() << 8) | get(); push({tick, type: "tempo", us}); }
      else if (type === 0x2E) { const num = raw(), b = raw(); push({tick, type: "loopStart", num, b, at: loc}); if (!passOver && (!loopStart || num === 0)) loopStart = {tick, num, at: loc, index: events.length - 1}; }
      else if (type === 0x2D) {
        const count = raw(), current = raw();
        const back = ((raw() << 24) | (raw() << 16) | (raw() << 8) | raw()) >>> 0;
        const here = loc;
        if (count === 0xFF) { // one pass; the loop is a fact on the result (scan mode walks on to the track's FF 2F)
          if (!passOver) { loopEnd = {tick, count, back, at: here}; events.push({tick, type: "loopEnd", count, back}); end = {tick, how: "loop"}; }
          if (!scan) break;
          passOver = true; continue;
        }
        // finite: jump while the running count is not 0 (the body plays count+1 times)
        if (!remaining.has(here)) remaining.set(here, current);
        const left = remaining.get(here);
        if (left > 0) {
          remaining.set(here, left - 1);
          if (back === 0 || here - back < offset) throw new Error(`ALCSeq track ${index}: loop end at ${here} jumps ${back} back`);
          loc = here - back; bu = -1; buLen = 0;
        } else remaining.set(here, current); // reset for an outer pass
      }
      else if (type === 0x2F) { if (!passOver) { events.push({tick, type: "end"}); end = {tick, how: "end"}; } break; }
      else throw new Error(`ALCSeq track ${index}: meta 0x${type.toString(16)} at tick ${tick}`);
      continue;
    }
    let status, d1;
    if (st & 0x80) { status = st; lastStatus = st; d1 = get(); }
    else { if (!lastStatus) throw new Error(`ALCSeq track ${index}: data byte before any status`); status = lastStatus; d1 = st; }
    const kind = status & 0xF0, ch = status & 0x0F;
    if (kind === 0x90) { const vel = get(), dur = varlen(); if (d1 > 127 || vel > 127) throw new Error(`ALCSeq track ${index}: note ${d1} velocity ${vel}`); push({tick, type: "note", ch, key: d1, vel, dur}); }
    else if (kind === 0xC0) push({tick, type: "program", ch, program: d1});
    else if (kind === 0xD0) push({tick, type: "pressure", ch, value: d1});
    else if (kind === 0xB0) { const v = get(); push({tick, type: "control", ch, controller: d1, value: v}); }
    else if (kind === 0xE0) { const msb = get(); push({tick, type: "bend", ch, value: ((msb << 7) | d1) - 8192}); }
    else if (kind === 0x80) { const v = get(); push({tick, type: "noteOff", ch, key: d1, vel: v}); }
    else if (kind === 0xA0) { const v = get(); push({tick, type: "polyPressure", ch, key: d1, value: v}); }
    else throw new Error(`ALCSeq track ${index}: status 0x${status.toString(16)} at tick ${tick}`);
  }
  if (!end) throw new Error(`ALCSeq track ${index}: ${maxEvents} events without an end`);
  return {index, offset, events, end, loopStart, loopEnd, next: loc};
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
// dur, vel, bank 0, vol (cc7/127 at note-on), pan (cc10 as written, 0..127, 64
// centre, at note-on), rev (cc91),
// bend (cents at note-on, from the wheel × the instrument's range later)}.
// The song loop: every track carries its own loop-start/loop-end pair; the
// pair most tracks share is the song's (a disagreement is a warning).
// Pitch bends move the SOUNDING voice: each note carries the wheel events
// that fall inside it as `slide` [{t, len: 1, to}] — t ticks after the
// note-on, `to` semitones from the pitch the note started on (the wheel
// at note-on stays `bend`, so a bend is a step and a run of events a
// staircase, as the SDK player steps the voice on each event). The range
// is the bank's ALInstrument.bendRange (cents) — the SDK's only source; no
// GoldenEye song carries an RPN (cc 100/101/6/38 never occur; only cc 7,
// 10, 91 do). The MIDI writer splits a slid note per landed pitch, the
// renderer bends the voice.
export function attachSlides(notes, bendsByCh, bendRangeOf = () => 200) {
  let slid = 0;
  for (const n of notes) {
    if (n.drum) continue;
    const bends = bendsByCh.get(n.ch);
    if (!bends || !bends.length) continue;
    const range = (bendRangeOf(n.inst) || 200) / 100, on = n.bend || 0;
    const inside = bends.filter(b => b.tick > n.tick && b.tick < n.tick + n.dur);
    if (!inside.length) continue;
    const slide = [];
    for (const b of inside) {
      const t = b.tick - n.tick, to = (b.value / 8192 - on) * range;
      if (slide.length && slide[slide.length - 1].t === t) slide[slide.length - 1].to = to; else slide.push({t, len: 1, to});
    }
    if (slide.some(x => Math.abs(x.to) > 1e-9)) { n.slide = slide; slid++; }
  }
  return slid;
}

// Volume under a held note: cc7 changes while the note sounds ride it as
// `gain` breakpoints [{t, l}] — t ticks after the note-on, l the channel
// volume (cc7/127) from then on; the first is the note-on's own level (the
// PS1 path's shape, tools/psx/akao.mjs). The player sets the voice volume
// on the event (a step), and so does the render. cc11 never occurs in the set.
export function attachGains(notes, volsByCh) {
  let n = 0;
  for (const note of notes) {
    const vols = volsByCh.get(note.ch);
    if (!vols || !vols.length) continue;
    const inside = vols.filter(v => v.tick > note.tick && v.tick < note.tick + note.dur);
    if (!inside.length) continue;
    const gain = [{t: 0, l: note.vol}];
    for (const v of inside) { const t = v.tick - note.tick, l = v.value / 127; if (gain[gain.length - 1].t === t) gain[gain.length - 1].l = l; else gain.push({t, l}); }
    if (gain.some(g => Math.abs(g.l - note.vol) > 1e-9)) { note.gain = gain; n++; }
  }
  return n;
}

// N64 capture v2 (the .mid only; the render reads n.pan/n.rev at the note-on): the SDK player
// sets every voice of the channel on a cc10 / cc91 (seqp.c __handleMIDIMsg: alSynSetPan /
// alSynSetFXMix per voice), so the changes that land while a note sounds ride it as
// n.panChanges [{t, pan}] / n.revChanges [{t, rev}] (t ticks after the note-on, raw 0..127);
// n.bendC0 = the wheel at the note-on in cents (bend × the instrument's bendRange).
export function attachHeldControls(notes, ctlByCh, bendRangeOf = () => 200) {
  for (const n of notes) {
    if (n.bend) n.bendC0 = n.bend * (bendRangeOf(n.inst) || 200);
    const evs = ctlByCh.get(n.ch);
    if (!evs) continue;
    let pan = n.pan, rev = n.rev;
    const pc = [], rc = [];
    for (const e of evs) {
      if (e.tick <= n.tick || e.tick >= n.tick + n.dur) continue;
      const t = e.tick - n.tick;
      if (e.pan !== undefined && e.pan !== pan) { if (pc.length && pc[pc.length - 1].t === t) pc[pc.length - 1].pan = e.pan; else pc.push({t, pan: e.pan}); pan = e.pan; }
      if (e.rev !== undefined && e.rev !== rev) { if (rc.length && rc[rc.length - 1].t === t) rc[rc.length - 1].rev = e.rev; else rc.push({t, rev: e.rev}); rev = e.rev; }
    }
    if (pc.length) n.panChanges = pc;
    if (rc.length) n.revChanges = rc;
  }
}

export function cseqNotes(cs, {maxSeconds = 600, bendRangeOf = () => 200} = {}) {
  const scale = TICKS_PER_BEAT / cs.division;
  const T = t => Math.round(t * scale);
  const notes = [], tempoMap = new Map(), warnings = [];
  const chan = [];
  for (let c = 0; c < 16; c++) chan.push({program: null, vol: 127, pan: 64, rev: 0, bend: 0});
  const loops = new Map(), bendsByCh = new Map(), volsByCh = new Map(), ctlByCh = new Map(); // ctlByCh: cc10/cc91 for the held-note timelines
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
        if (e.controller === 7) { C.vol = e.value; (volsByCh.get(e.ch) || volsByCh.set(e.ch, []).get(e.ch)).push({tick: T(e.tick), value: e.value}); }
        else if (e.controller === 10) { C.pan = e.value; (ctlByCh.get(e.ch) || ctlByCh.set(e.ch, []).get(e.ch)).push({tick: T(e.tick), pan: e.value}); }
        else if (e.controller === 91) { C.rev = e.value; (ctlByCh.get(e.ch) || ctlByCh.set(e.ch, []).get(e.ch)).push({tick: T(e.tick), rev: e.value}); }
        break;
      case "bend": C.bend = e.value / 8192; (bendsByCh.get(e.ch) || bendsByCh.set(e.ch, []).get(e.ch)).push({tick: T(e.tick), value: e.value}); break;
      case "noteOff": offs++; break;
      case "polyPressure": poly++; break;
      case "pressure": pressure++; break;
      case "note": {
        const tick = T(e.tick), dur = Math.max(1, T(e.tick + e.dur) - tick);
        notes.push({ch: e.ch, inst: C.program, drum: false, key: e.key, semitone: e.key, midi: e.key, tick, dur, vel: e.vel,
                    bank: 0, vol: C.vol / 127, pan: C.pan, rev: C.rev, bend: C.bend});
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
  const slid = attachSlides(notes, bendsByCh, bendRangeOf);
  if (slid) warnings.push(slid + " notes carry pitch bends (the roll writes each landed pitch as its own note; the render bends the voice)");
  const gained = attachGains(notes, volsByCh);
  if (gained) warnings.push(gained + " notes change volume while held (cc7; the render follows)");
  attachHeldControls(notes, ctlByCh, bendRangeOf);
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

// Diddy Kong Racing keeps the SDK's own sequence file, as alSeqFileNew left
// it in RAM: 'S1', u16 count, then {u32 offset, u32 len} per song with the
// offsets made absolute ROM addresses. Each song is a plain ALCSeq (or a
// 1172 block). Found by shape: the header, then entries whose present ROM
// bytes parse — at least three, so a stray 'S1' cannot pass.
export function findSeqFileInRam(ram, rom) {
  for (const r of ram.runs()) {
    for (let p = (r.offset + 3) & ~3; p + 16 <= r.offset + r.length; p += 4) {
      if (ram.u8(p) !== 0x53 || ram.u8(p + 1) !== 0x31) continue;
      const count = ram.u16(p + 2);
      if (count < 3 || count > 1024) continue;
      const entries = [];
      let parsed = 0, bad = 0;
      for (let i = 0; i < count; i++) {
        const q = p + 4 + i * 8;
        if (ram.coverage(q, 8) < 1) { entries.push(null); continue; }
        const at = ram.u32(q), len = ram.u32(q + 4);
        if (!len || len > 0x40000 || at >= 0x4000000) { bad++; entries.push(null); continue; }
        const coverage = rom.coverage(at, len);
        entries.push({id: i, rom: at, size: len, packed: len, coverage, magic: is1172(rom.read(at, 2))});
        if (coverage === 1 && parsed < 3) { try { const b = rom.read(at, len); parseCSeq(is1172(b) ? decompress1172(b) : b); parsed++; } catch { bad++; } }
      }
      if (parsed >= 3 && bad <= count / 4) return {kind: "S1", at: p, count, entries};
    }
  }
  return null;
}

// Banjo-Kazooie keeps its songs as sized 1172 blocks among the game's assets,
// and the asset directory in RAM: 8-byte entries {u32 flags; u32 offset}
// whose offset plus one base (the assets' ROM start, found by matching the
// entries against the blocks) is a block. The song id counts from the first
// entry whose block the rip carries; that is where the ripper's ids landed
// (Main Title 8, Logo 50, Game Selection 110 — checked against lazyusf2's
// renders). An entry whose word the game never read is absent: null.
export function findSizedSeqBlocks(rom) {
  const out = [];
  for (const r of rom.runs()) {
    for (let p = r.offset; p + 8 <= r.offset + r.length; p++) {
      const b = rom.read(p, 6);
      if (b[0] !== 0x11 || b[1] !== 0x72) continue;
      const size = ((b[2] << 24) | (b[3] << 16) | (b[4] << 8) | b[5]) >>> 0;
      if (size < 0x48 || size > 0x100000) continue;
      let data; try { data = inflateRaw(rom.read(p + 6, Math.min(0x40000, r.offset + r.length - p - 6)), size); } catch { continue; }
      if (data.length !== size) continue;
      const u32 = o => ((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) >>> 0;
      let seq = false; for (let i = 0; i < CSEQ_TRACKS; i++) if (u32(i * 4) === 0x44) { seq = true; break; }
      if (seq) out.push({rom: p, size});
    }
  }
  return out;
}
export function findAssetSongTable(ram, rom) {
  const blocks = findSizedSeqBlocks(rom);
  if (blocks.length < 3) return null;
  const starts = new Map(blocks.map(b => [b.rom, b]));
  const sorted = blocks.map(b => b.rom).sort((a, b) => a - b).slice(0, 4);
  let best = null;
  for (const r of ram.runs()) {
    for (let p = r.offset & ~3; p + 8 <= r.offset + r.length; p += 4) {
      const w = ram.u32(p);
      if (w >= 0x4000000) continue;
      for (const b of sorted) {
        const base = b - w;
        if (base < 0 || base > 0x1000000) continue;
        let n = 0, q = p, last = -1;
        while (q + 4 <= r.offset + r.length && ram.u32(q) > last && starts.has(ram.u32(q) + base)) { last = ram.u32(q); n++; q += 8; } // offsets ascend: a constant flags word cannot chain
        if (n >= 3 && (!best || n > best.n)) best = {p, base, n};
      }
    }
  }
  if (!best) return null;
  let first = best.p;
  while (ram.coverage(first - 8, 4) === 1 && ram.u32(first - 8) < ram.u32(first) && starts.has(ram.u32(first - 8) + best.base)) first -= 8;
  const at = first; // the entry begins with its offset word (its flags word follows)
  const entries = [];
  let gap = 0;
  for (let i = 0; i < 4096 && gap < 64; i++) {
    const q = at + i * 8;
    if (ram.coverage(q, 4) < 1) { entries.push(null); gap++; continue; }
    const blk = starts.get(ram.u32(q) + best.base);
    if (!blk) { entries.push(null); gap++; continue; }
    gap = 0;
    entries.push({id: i, rom: blk.rom, size: blk.size, packed: null, coverage: 1, magic: true});
  }
  while (entries.length && !entries[entries.length - 1]) entries.pop();
  return {kind: "asset", at, base: best.base, count: entries.length, entries};
}

// A song already unpacked in RAM (Donkey Kong 64's rip keeps no song table,
// only the songs the game had loaded): a division word (1..0x10000) whose
// header word 0 is 0x44 (the first track right after the header) or not in
// the rip at all, followed by a track (a delta, then a status or FF), read
// by walking its tracks (parseCSeq's `walk`: the offset words may be
// absent or another song's — DK64's Mini-Boss keeps no header word). RAM
// may hold several (music slots, jingles); the one the mini plays is the
// one its own state chunks write most of, else the only one.
const RAM_SEQ_SPAN = 0x10000;
export function findRamSequences(ram) {
  const out = [];
  for (const r of ram.runs()) {
    for (let d = (r.offset + 3) & ~3; d + 8 <= r.offset + r.length; d += 4) {
      const p = d - 0x40;
      if (p < 0 || ram.u8(d) || ram.u8(d + 1) > 1) continue; // division ≤ 0x1FFFF: two zero-ish high bytes
      const div = ram.u32(d);
      if (!(div > 0 && div <= 0x10000)) continue;
      if (ram.coverage(p, 4) === 1 && ram.u32(p) !== 0x44) continue;
      let q = d + 4; while (q < d + 8 && ram.u8(q) & 0x80) q++; // the first delta (a short varlen)
      const st = ram.u8(q + 1 > d + 7 ? d + 7 : q + 1);
      if (!(st === 0xFF || (st >= 0x80 && st < 0xF0))) continue;
      const bytes = ram.read(p, RAM_SEQ_SPAN);
      let cs; try { cs = parseCSeq(bytes, {walk: true}); } catch { continue; }
      if (!cs.tracks.some(t => t && t.events.some(e => e.type === "note"))) continue;
      const end = Math.max(...cs.tracks.filter(t => t).map(t => t.next)), present = new Uint8Array(end);
      for (let i = 0; i < end; i++) present[i] = ram.coverage(p + i, 1);
      out.push({addr: p, size: end, bytes: bytes.subarray(0, end), present, cs});
      d = p + end - 4 & ~3; // past this song
    }
  }
  return out;
}
// ---- the SDK sequence players (RAM) ------------------------------------------
// libultra's ALCSeqPlayer (libaudio.h) — the SDK's own struct, the same in every
// game built on it, not a table about any one game:
//   +0x00 ALPlayer node {next, clientData (the player itself), handler, callTime, samplesLeft}
//   +0x14 drvr   +0x18 target (ALCSeq*; the ALCSeq's first word is its song's address)
//   +0x20 bank   +0x2c state (1 = playing)   +0x30 u16 chanMask (bit k: MIDI channel k sounds), s16 vol
//   +0x34 u8 maxChannels   +0x50 evtq.allocList: the events waiting to run,
//         ALEventListItem {next, prev, delta, s16 type, payload…} (a play/seq event's payload: an ALCSeq*)
// Found by shape: the self pointer, then handler, driver and bank all KSEG0 pointers and
// 1..16 channels. GoldenEye's runs its code mapped (handler 0x7xxxxxxx) and keeps no
// bank word there, so its look-alikes fail; Donkey Kong 64 (lazyusf2: the player whose
// ALCSeq advances is the one with state 1, or the one a queued event names) and Diddy
// Kong Racing (its per-racer variants differ only in chanMask; lazyusf2 renders differ
// with it) pass. A word the rip never read is absent: null.
const kseg0 = v => v != null && (v >>> 24) === 0x80;
export function findSeqPlayers(ram) {
  const g = a => ram.has(a, 4) ? ram.u32(a) : null;
  const out = [];
  for (const r of ram.ranges) for (let o = (r.offset + 3) & ~3; o + 4 <= r.offset + r.bytes.length; o += 4) {
    const at = o - 4;
    if (at < 0 || ram.u32(o) !== ((0x80000000 | at) >>> 0)) continue;
    const mc = g(at + 0x34);
    if (!kseg0(g(at + 8)) || !kseg0(g(at + 0x14)) || !kseg0(g(at + 0x20)) || mc == null || !(mc >>> 24) || (mc >>> 24) > 16) continue;
    const seqAt = p => kseg0(p) ? g(p & 0x1FFFFFFF) : null; // an ALCSeq* → its song's address
    const tgt = g(at + 0x18), song = seqAt(tgt), w30 = g(at + 0x30);
    const queued = [], head = at + 0x50;
    for (let q = g(head), n = 0; kseg0(q) && (q & 0x1FFFFFFF) !== head && n < 64; q = g(q & 0x1FFFFFFF), n++) {
      const s = seqAt(g((q & 0x1FFFFFFF) + 0x10));
      if (kseg0(s) && !queued.includes(s & 0x1FFFFFFF)) queued.push(s & 0x1FFFFFFF);
    }
    out.push({at, state: g(at + 0x2c), song: kseg0(song) ? song & 0x1FFFFFFF : null, queued,
              mask: w30 == null ? null : w30 >>> 16, vol: w30 == null ? null : w30 & 0xFFFF});
  }
  return out;
}

// A tag's "m:ss(.f)" or seconds, as seconds (null when absent)
export function tagSeconds(v) {
  if (v == null || v === "") return null;
  const n = String(v).trim().split(":").reduce((a, x) => a * 60 + Number(x), 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Which of the RAM songs the mini plays, in this order: the sequence player playing
// one (state 1, its target's song); else the songs queued players' waiting events name
// (Donkey Kong 64 starts most songs just after the rip's state was taken); among several,
// the one whose own pass is nearest the tag's length (100 Bananas: its 2 s jingle over a
// ducked level song, tag 4 s); else the song the mini's own state chunks write most of,
// else the first by address — with a warning, since nothing in the rip then says which.
export function miniRamSequence(set, ram) {
  const songs = findRamSequences(ram);
  if (!songs.length) return null;
  const chunks = ((set.top && set.top.state) || []).filter(c => c.offset >= PJ64_RDRAM).map(c => [c.offset - PJ64_RDRAM, c.bytes.length]);
  const written = s => chunks.reduce((n, [a, len]) => n + Math.max(0, Math.min(a + len, s.addr + s.size) - Math.max(a, s.addr)), 0);
  const all = songs.map(s => ({...s, of: songs.length, written: written(s)}));
  const byAddr = new Map(all.map(s => [s.addr, s]));
  const players = findSeqPlayers(ram);
  const nearestTag = list => {
    if (list.length === 1) return list[0];
    const tag = tagSeconds(set.tags && set.tags.length);
    if (!tag) return null;
    const pass = c => { try { const r = cseqNotes(c.song.cs); return Math.max(r.seconds, ...r.notes.map(n => tickSeconds(r.tempos, n.tick + n.dur))); } catch { return 0; } }; // one pass, to its last note's end
    return list.map(c => ({c, d: Math.abs(Math.log(Math.max(0.1, pass(c)) / tag))})).sort((a, b) => a.d - b.d)[0].c;
  };
  const playing = [], queued = [];
  for (const p of players) {
    if (p.state === 1 && byAddr.has(p.song) && !playing.some(c => c.song === byAddr.get(p.song))) playing.push({song: byAddr.get(p.song), player: p});
    for (const a of p.queued) if (byAddr.has(a) && !queued.some(c => c.song === byAddr.get(a))) queued.push({song: byAddr.get(a), player: p});
  }
  for (const [list, how] of [[playing, "playing"], [queued, "queued"]]) {
    const pick = list.length ? nearestTag(list) : null;
    if (pick) return {...pick.song, how, player: pick.player, among: list.length};
  }
  const ranked = all.sort((a, b) => b.written - a.written || a.addr - b.addr);
  if (ranked.length > 1 && ranked[0].written && ranked[0].written === ranked[1].written) throw new Error("this rip's memory holds " + songs.length + " songs and the mini writes as much of two of them (at 0x" + ranked[0].addr.toString(16) + " and 0x" + ranked[1].addr.toString(16) + ")");
  return {...ranked[0], how: ranked[0].written ? "written" : "first", player: null};
}

// The channels a sequence player's chanMask silences, of those the song plays (bit k = MIDI
// channel k: lazyusf2 with one Tag Barrel's state and another's mask renders the other).
// None when the mask is unknown, full, or would silence everything.
export function maskedChannels(player, channels) {
  if (!player || player.mask == null || player.mask === 0xFFFF) return [];
  const off = channels.filter(c => !(player.mask & (1 << c)));
  return off.length < channels.length ? off : [];
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
// The GPRs the mini's state sets (PJ64 keeps GPR n's low word at 0x50 + 8n):
// Diddy Kong Racing's ripper passes the song in a0 and overrides nothing else.
export function miniOverrideRegs(set) {
  const out = [];
  for (const c of (set.top && set.top.state) || []) {
    if (c.offset < 0x50 || c.offset >= 0x150 || (c.offset - 0x50) % 8 || c.bytes.length !== 4) continue;
    const b = c.bytes;
    out.push({reg: (c.offset - 0x50) / 8, value: (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0});
  }
  return out;
}
// `addiu a1, zero, n` after the saved PC (the SM64-style patch; Banjo-Kazooie's
// ripper used it) counts too — an override word that decodes as that instruction.
export function miniRareTrack(set, table, rule = null) {
  const {ram} = rdramOf(set.state);
  const words = miniOverrideWords(set);
  const li = words.map(w => decodeLiA1(w.value)).filter(v => v != null && v < table.count);
  if (li.length === 1) return li[0];
  const small = words.filter(w => w.value < table.count);
  if (small.length === 1) return small[0].value;
  const regs = miniOverrideRegs(set).filter(g => g.reg >= 4 && g.reg <= 7 && g.value < table.count); // an argument register
  if (regs.length === 1) return regs[0].value;
  // a mini that overrides nothing plays the lib's own patch: the li-a1 at the saved PC + 4
  if (!words.length) { let v = null; try { v = miniSequenceId(set, {kind: "li-a1"}); } catch { /* no saved PC in this state */ } if (v != null && v < table.count) return v; }
  // a mini that overrides nothing plays the lib's own value, which only the manifest can point at
  // (GoldenEye's Bunker 1: the word itself; Banjo-Kazooie's beta: the li-a1 there; Diddy Kong Racing: a register)
  if (rule && rule.kind === "ram" && ram.coverage(rule.addr, 4) === 1) { const w = ram.u32(rule.addr), li = decodeLiA1(w); return li != null ? li : w; }
  if (rule && rule.kind === "reg") { const b = set.state.read(0x50 + 8 * rule.reg, 4), v = (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0; if (v < table.count) return v; }
  return null;
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

// Every ALBank in RAM, with or without its file header: the 'B1' file's
// banks, plus any struct of the bank's own shape — {u16 instCount 1..256;
// u8 flags ≤ 3; u8 0; u32 sampleRate 8000..48000; percussion 0 or a RAM
// pointer; instCount ascending RAM pointers, each at an instrument whose
// first sound pointer is a RAM pointer} — because a rip keeps only the
// words the game read after the state was taken, and alBnkfNew's
// one-time read of the header is before that (Banjo-Kazooie's has none).
// A song's bank index (seq.banks[0]) is an index into this list.
export function findRareBanks(ram) {
  const found = new Map();
  for (const f of findRareBankFile(ram)) for (const b of f.banks) found.set(b.at, {...b, fileAt: f.at, how: "B1"});
  const word = q => { const x = ram.read(q, 4); return ((x[0] << 24) | (x[1] << 16) | (x[2] << 8) | x[3]) >>> 0; }; // absent = 0 (the percussion word often is)
  for (const r of ram.runs()) {
    for (let p = r.offset & ~3; p + 8 <= r.offset + r.length; p += 4) {
      if (found.has(p)) continue;
      const n = ram.u16(p), flags = ram.u8(p + 2), pad = ram.u8(p + 3), rate = ram.u32(p + 4), perc = word(p + 8);
      if (n < 1 || n > 256 || flags > 3 || pad || rate < 8000 || rate > 48000 || (perc && (perc >>> 24) !== 0x80)) continue;
      let valid = 0, prev = 0, bad = false;
      for (let i = 0; i < n && !bad; i++) {
        if (ram.coverage(p + 12 + i * 4, 4) < 1) continue;
        const v = word(p + 12 + i * 4);
        if ((v >>> 24) !== 0x80 || v <= prev) { bad = true; break; }
        const ia = v & 0x1FFFFFFF;
        if (ram.coverage(ia + 16, 4) === 1 && (word(ia + 16) >>> 24) !== 0x80) { bad = true; break; }
        prev = v; valid++;
      }
      if (bad || valid < Math.min(n, 3)) continue;
      found.set(p, {at: p, instCount: n, sampleRate: rate, fileAt: null, how: "shape"});
    }
  }
  // header-found banks first (a file header is certain; a shape match is a guess), each group by address
  return [...found.values()].sort((a, b) => (a.how === "B1" ? 0 : 1) - (b.how === "B1" ? 0 : 1) || a.at - b.at);
}
// the bank a song plays through: the one holding every program it names, else the biggest
export function pickBank(banks, programs) {
  if (!banks.length) return -1;
  const covers = banks.map((b, i) => [i, programs.every(p => p < b.instCount)]).filter(([, ok]) => ok).map(([i]) => i);
  const pool = covers.length ? covers : banks.map((_, i) => i);
  return pool.sort((a, b) => banks[b].instCount - banks[a].instCount)[0];
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
        const velMax = k.velocityMax || 127; // Banjo-Kazooie's maps say 0: no velocity limit (a real one is 1..127)
        if (key >= k.keyMin && key <= k.keyMax && vel >= k.velocityMin && vel <= velMax) return s;
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

// A note's loudness over time, as the bank plays it: the envelope's
// attack/decay ramps (envelopeGain's alSynSetVol law — exponential from the
// attack volume to the decay volume over decayTime, then held) times, for a
// one-shot sample (no loop), the sample's own decay — and silence where it
// runs out (renderRare's `if (!smp.looping) break`), however long the
// sequence holds the note. A MIDI note carries neither, so the synth held
// every note at full level to its written length — a 0.4 s bongo hit
// written as two beats sounded as a two-beat tone (Josh, DK64 Logo,
// 2026-10-07). The note keeps its pitch and length; its loudness carries
// the bank's shape as a volume shape (n.env, NIGHT-ROLL.md "Volume shape
// inside a note"): the times it falls to each of SHAPE_LEVELS, then where
// it stops (0 for a one-shot's end, the held decay level for a loop) — the
// sample at the note's playback rate (key − keyBase, detune; bends
// ignored), in ticks under the tempo map. A held envelope on a looping
// sample, a drum and a sound the rip lacks get none. Everything is read
// from the bank; nothing says which instrument is a drum.
export const SHAPE_LEVELS = [0.5, 0.25, 0.125, 0.0625];
const SHAPE_STEP = 0.005, SHAPE_MAX_S = 8; // seconds: the scan's resolution and its reach
// a one-shot sample's running loudness from its peak: {at(sec) → level ÷ peak, end (sec)} at the sample's own rate
function sampleLoudness(pcm, rate) {
  const hop = Math.max(1, Math.floor(rate * SHAPE_STEP)), env = [];
  for (let i = 0; i < pcm.length; i += hop) {
    let s = 0; const e = Math.min(pcm.length, i + hop);
    for (let k = i; k < e; k++) s += pcm[k] * pcm[k];
    env.push(Math.sqrt(s / (e - i)));
  }
  if (!env.length) return null;
  let pk = 0; for (let k = 1; k < env.length; k++) if (env[k] > env[pk]) pk = k;
  if (!(env[pk] > 0)) return null;
  for (let k = env.length - 2; k >= pk; k--) env[k] = Math.max(env[k], env[k + 1]); // what is still to come: monotone from the peak
  const peak = env[pk];
  return {end: pcm.length / rate, at: sec => { const k = Math.floor(sec * rate / hop); return k <= pk ? 1 : k < env.length ? env[k] / peak : 0; }};
}
// the envelope's level τ seconds after the note-on, ÷ the attack volume (the note's velocity is the attack); null = it never moves
function envelopeLevel(env) {
  if (!env) return null;
  const A = Math.max(ENV_FLOOR, (env.attackVolume || 0) / 127), D = Math.max(ENV_FLOOR, (env.decayVolume || 0) / 127);
  const ta = Math.max(0, (env.attackTime || 0) / 1e6);
  const hold = env.decayTime == null || env.decayTime < 0 || env.decayTime === 0x7FFFFFFF;
  if (hold || D >= A) return null; // the attack is never in the rip (attackTime 0): a held or rising decay is a flat note
  const td = Math.max(0, env.decayTime / 1e6);
  return {end: ta + td, at: t => t <= ta ? 1 : t >= ta + td ? D / A : td > 0 ? Math.pow(D / A, (t - ta) / td) : D / A};
}
// [{s, r}] in seconds after the note-on (level ÷ the note's attack), or null for a flat note
export function voiceShape(env, loud, ratio = 1) {
  const E = envelopeLevel(env);
  if (!E && !loud) return null;
  const end = Math.min(SHAPE_MAX_S, loud ? loud.end / ratio : E.end);
  const f = t => (E ? E.at(t) : 1) * (loud ? loud.at(t * ratio) : 1);
  const out = [];
  let t = 0, prev = 1, i = 0;
  // a late peak (a swell, a slow attack): full level until it falls
  for (; t < end; t += SHAPE_STEP) { const v = f(t); if (v < 1) break; prev = v; }
  if (t >= 0.02 && t < end) out.push({s: t - SHAPE_STEP, r: 1});
  for (; t < end && i < SHAPE_LEVELS.length; t += SHAPE_STEP) {
    const v = f(t);
    while (i < SHAPE_LEVELS.length && v < SHAPE_LEVELS[i]) { if (i + 1 >= SHAPE_LEVELS.length || v >= SHAPE_LEVELS[i + 1]) out.push({s: t, r: SHAPE_LEVELS[i]}); i++; }
    prev = v;
  }
  const last = loud ? 0 : f(end);
  if (!out.length || out[out.length - 1].s < end) out.push({s: end, r: Math.min(last, out.length ? out[out.length - 1].r : 1)});
  return out;
}
// a one-shot sample's shape at its own rate, the envelope held: [{s, r}], the last r = 0 at the sample's end
export function sampleDecay(pcm, rate) { const l = sampleLoudness(pcm, rate); return l && voiceShape(null, l, 1); }
// the tick (fractional) at `sec` seconds under a tempo map [{tick, bpm}] — tickSeconds' inverse
function secondsTick(tempos, sec) {
  let at = 0;
  for (let i = 0; i < tempos.length; i++) {
    const per = 60 / (tempos[i].bpm * TICKS_PER_BEAT), next = i + 1 < tempos.length ? tempos[i + 1].tick : Infinity;
    const span = (next - tempos[i].tick) * per;
    if (sec <= at + span) return tempos[i].tick + (sec - at) / per;
    at += span;
  }
  return Infinity;
}
// sets n.env on every melodic note whose sound decays (a falling envelope, a one-shot sample); returns how many
export function attachVoiceShapes(notes, bank, tempos) {
  const louds = new Map(), shapes = new Map();
  let shaped = 0;
  for (const n of notes) {
    if (n.drum) continue;
    const inst = bank.instrument(n.inst), s = inst && bank.sound(inst, n.key, n.vel);
    const w = s && s.wave;
    if (!w) continue;
    const looping = w.loop && w.loop.count !== 0 && w.loop.end > w.loop.start;
    if (!looping && !louds.has(w.at)) { const p = bank.pcm(w); louds.set(w.at, p && !p.looping ? sampleLoudness(p.pcm, bank.sampleRate) : null); }
    const loud = looping ? null : louds.get(w.at);
    const km = s.keymap || {keyBase: 60, detune: 0};
    const ratio = Math.pow(2, ((n.key - km.keyBase) * 100 + (km.detune || 0)) / 1200);
    const key = w.at + ":" + (s.envelope ? s.envelope.at : "-") + ":" + ratio;
    if (!shapes.has(key)) shapes.set(key, voiceShape(s.envelope, loud, ratio));
    const d = shapes.get(key);
    if (!d) continue;
    const s0 = tickSeconds(tempos, n.tick), env = [];
    for (const q of d) {
      const t = Math.round(secondsTick(tempos, s0 + q.s) - n.tick);
      if (t < 1) continue;
      if (t >= n.dur) break;
      if (env.length && env[env.length - 1].t === t) env[env.length - 1].r = q.r; else env.push({t, r: q.r});
    }
    if (env.length) { n.env = env; shaped++; }
  }
  return shaped;
}

// ---- the driver --------------------------------------------------------------
// sequenceOfSet's fallback: the same shape it returns for EAD sets.
export function rareSequenceOfSet(set, {game = null, maxSeconds = 600} = {}) {
  const {ram} = rdramOf(set.state);
  let id = null, e = null, cs = null, present = null, seqInfo = null, table = null;
  let own = null;
  table = findMusicTable(ram, set.rom) || findAssetSongTable(ram, set.rom) || findSeqFileInRam(ram, set.rom);
  if (!table) {
    own = miniRamSequence(set, ram); // no table: the song the game had unpacked into RAM (Donkey Kong 64)
    if (!own) throw new Error("no Rare music table and no unpacked song in this rip's memory — a driver Night Roll cannot read yet");
    cs = own.cs; present = own.present;
    const got = own.present.reduce((n, x) => n + x, 0);
    seqInfo = {id: null, rom: null, ram: own.addr, size: own.size, unpacked: own.size, coverage: got / own.size};
  } else {
    id = miniRareTrack(set, table, game && game.seqId);
    if (id == null) throw new Error("this mini does not say which of the game's " + table.count + " songs it plays");
    e = table.entries[id];
    if (!e) throw new Error(id < table.count ? "song " + id + " of the game's " + table.count + " is not in this rip (its ROM pages were never read: the mini may play sound effects only)" : "song " + id + " is past the game's table (" + table.count + " songs)");
    if (e.coverage === 0) throw new Error("song " + id + "'s bytes are not in this rip's ROM pages");
    const packedLen = e.packed != null ? e.packed : Math.min(0x40000, set.rom.runs().filter(r => r.offset <= e.rom && e.rom < r.offset + r.length).map(r => r.offset + r.length - e.rom)[0] || 0);
    if (!packedLen) throw new Error("song " + id + "'s bytes are not in this rip's ROM pages");
    const packed = set.rom.read(e.rom, packedLen);
    present = new Uint8Array(packedLen);
    for (let i = 0; i < packedLen; i++) present[i] = set.rom.coverage(e.rom + i, 1) ? 1 : 0;
    // a packed song needs every byte (DEFLATE); a plain one plays what the rip kept (bytes the
    // game never read while the rip ran: a tail past the loop, a branch not taken)
    if (e.packed != null && e.coverage < 1 && is1172(packed)) throw new Error("song " + id + ": only " + Math.floor(e.coverage * 100) + "% of its bytes are in the rip");
    const bytes = is1172(packed) ? decompress1172(packed, e.packed != null && e.size !== e.packed ? e.size : 0) : packed; // an S1 file's songs may be plain
    try { cs = parseCSeq(bytes); } catch (err) { if (e.coverage < 1) throw new Error("song " + id + ": only " + Math.floor(e.coverage * 100) + "% of its bytes are in the rip, and what is there does not read (" + err.message + ")"); throw err; }
    seqInfo = {id, rom: e.rom, size: e.packed != null ? e.packed : packedLen, unpacked: e.size, coverage: e.coverage};
  }
  const banks = findRareBanks(ram);
  const programs = [...new Set(cs.tracks.filter(t => t).flatMap(t => t.events.filter(ev => ev.type === "program").map(ev => ev.program)))];
  const bankIndex = pickBank(banks, programs);
  const bank = bankIndex >= 0 ? readRareBank(ram, set.rom, banks[bankIndex].at) : null;
  const res = cseqNotes(cs, {maxSeconds, bendRangeOf: p => { const i = bank && bank.instrument(p); return i ? i.bendRange : 200; }});
  if (e && e.coverage < 1 && !is1172(set.rom.read(e.rom, 2))) res.warnings.push(Math.round((1 - e.coverage) * e.packed) + " of the song's " + e.packed + " bytes are not in the rip (the game never read them while it was ripped); the roll plays what is there");
  if (table) { // a word the mini sets beside its song number (Banjo-Kazooie's Normal/Aquatic, Diddy Kong Racing's per-racer Player Select)
    const rest = miniOverrideWords(set).filter(w => w.value !== id && decodeLiA1(w.value) !== id);
    if (rest.length && rest.length <= 4) res.warnings.push("this mini also sets " + rest.length + " memory word" + (rest.length > 1 ? "s" : "") + " the roll does not use (" + rest.map(w => "0x" + w.addr.toString(16) + " = 0x" + w.value.toString(16)).join(", ") + "): the roll plays every track of the song");
  }
  if (own && own.how === "first" && own.of > 1) res.warnings.push("CHECK BY EAR: no sequence player in the rip's memory plays or queues any of its " + own.of + " songs, and this mini writes none of them; the roll is the first (0x" + own.addr.toString(16) + "), the library's own — a mini of sound effects looks the same");
  else if (own && own.how === "written" && own.of > 1) res.warnings.push("CHECK BY EAR: no sequence player in the rip's memory plays or queues any of its " + own.of + " songs; the roll is the one this mini writes most of (0x" + own.addr.toString(16) + ")");
  else if (own && own.among > 1) res.warnings.push(own.among + " songs " + own.how + " in the rip's memory; the roll is the one whose length is nearest the tag's (0x" + own.addr.toString(16) + ")");
  res.sequenceId = id; res.variation = 0; res.reverb = null; res.ducked = [];
  // the player's channel mask: the channels it silences leave the capture (DK64's Tag Barrels, one per Kong;
  // DKR's per-racer Player Select). A song from the table: only when one player in the rip carries a mask.
  let player = own ? own.player : null;
  if (table) { const masked = findSeqPlayers(ram).filter(p => p.mask != null && p.mask !== 0xFFFF && p.mask !== 0); player = masked.length === 1 ? masked[0] : null; }
  const muted = maskedChannels(player, res.channels);
  if (muted.length) {
    res.ducked = muted;
    res.notes = res.notes.filter(n => !muted.includes(n.ch));
    res.channels = res.channels.filter(c => !muted.includes(c));
    res.warnings.push("channels " + muted.join(",") + " muted by the sequence player's channel mask (0x" + player.mask.toString(16) + ")");
  }
  if (bank) { // programs that are kits in this bank: their notes are slots
    const kits = new Set(bank.instruments.filter(isKitInstrument).map(i => i.index));
    if (kits.size) {
      for (const n of res.notes) if (kits.has(n.inst)) { n.drum = true; delete n.slide; }
      res.kits = [...kits].sort((a, b) => a - b);
    }
    const shaped = attachVoiceShapes(res.notes, bank, res.tempos);
    if (shaped) res.warnings.push(shaped + " notes fade as the bank plays them (a one-shot sample's end, a falling envelope): the MIDI carries each as a volume shape; pitches and lengths are the sequence's");
  } else res.warnings.push("no sound bank in this rip's memory (the roll is fine; the console render will not be)");
  const loc = {gen: "rare", abi: "rare",
               sequences: table ? table.entries.map((x, i) => x ? {id: i, rom: x.rom, size: x.packed, unpacked: x.size, coverage: x.coverage, banks: [bankIndex]} : {id: i, rom: null, size: 0, coverage: 0, banks: [bankIndex]}) : [],
               table: table ? {kind: table.kind || "rom", at: table.at, count: table.count} : {kind: "mini", at: own.addr, count: 1},
               banks: banks.map(b => ({at: b.at, instCount: b.instCount, sampleRate: b.sampleRate, how: b.how})), bankFile: banks.length ? {at: banks[bankIndex].fileAt, count: 1, banks: [banks[bankIndex]]} : null};
  const seq = {...seqInfo, banks: [Math.max(0, bankIndex)]};
  return {game, loc, id, seq, res, present, ducked: res.ducked, driver: "rare"};
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

// Stereo: the SDK synthesizer pans each voice with libaudio's equal-power
// table (syn/eqpower.c, `s16 eqpower[128]` = 32767·cos(i·π/254); env.c's
// _pullSubFrame sets the mixer's left volume to eqpower[pan] and the right
// to eqpower[127 − pan]) — i.e. gainL = cos(pan·π/254), gainR = cos((127 −
// pan)·π/254), the same law as equal-power on p = pan/63.5 − 1. The voice's
// pan is the sequence player's __vsPan: the sound's samplePan + the
// channel's cc10 − 64, clamped to 0..127, taken at note-on (a cc10 change
// during a note is not followed). Each track is {l, r}; opts.stereo ===
// false gives the old mono buffers (the two summed with the centre law, so
// a centred voice keeps its level).
export const PAN_CENTER = 64;

// ---- the reverb: the SDK's delay-line effect --------------------------------
// alSynNew takes the effect as an s32 parameter block {sections, length
// (delay-line samples), then per section: input, output (tap offsets from
// the line's head, in samples), fbcoef, ffcoef, gain (s16, 0x7FFF = 1),
// chorusrate, chorusdepth, lpfilter} (libaudio alFxNew's custom format,
// which the built-in SMALLROOM/BIGROOM tables use too). GoldenEye's block is
// in RAM (twice, 0x23100 and 0x3B3744 on the US rip; words the game never
// read are absent and read 0): 6 sections over 6400 samples, all of them
// all-passes (ffcoef = −fbcoef): 0→160 (0.3), 160→320 (0.3, gain 0.34, lp
// 0x2500), 800→2560 (0.5, gain 0.14, lp 0x3000), 3200→5600 (0.5, gain 0.14,
// lp 0x3500), 3360→4800 (0.25, lp 0x4000), 0→5920 (0.397, chorus 380/10, lp
// 0x4500). Found by that shape: findFxParams.
//
// How a section runs (libaudio reverb.c as remembered — the structure, not
// a verified transcription): the wet input is saved at the line's head each
// sample; a section reads x at head+input and y at head+output, feeds back
// x += fbcoef·y into the line at the input tap, feeds forward y += ffcoef·x,
// low-passes y (a one-pole, coefficient lpfilter/0x8000, assumed), writes y
// back at the output tap and adds gain·y to the effect's output. The head
// moves so a sample written at offset j is read at offset k after k − j
// samples. Chorus (a resampled output tap) is not modelled — the one
// section with it has gain 0 and nothing reads past it. The effect output
// goes to both channels at equal power. Per track (linear, so the sum of
// per-track returns is the return of the sum).
export function findFxParams(ram) {
  const s32 = p => ram.read(p, 4).reduce((a, b) => (a << 8) | b, 0) | 0;
  let best = null;
  for (const r of ram.runs()) {
    for (let p = r.offset & ~3; p + 8 <= r.offset + r.length; p += 4) {
      const sections = s32(p), length = s32(p + 4);
      if (sections < 1 || sections > 8 || length < 0x100 || length > 0x40000 || length % 16) continue;
      const list = [];
      let ok = true, present = 0;
      for (let i = 0; i < sections && ok; i++) {
        const q = p + 8 + i * 32;
        const [input, output, fbcoef, ffcoef, gain, chorusRate, chorusDepth, lpfilter] = [0, 4, 8, 12, 16, 20, 24, 28].map(o => s32(q + o));
        for (let o = 0; o < 32; o += 4) if (ram.coverage(q + o, 4) === 1) present++;
        if (input < 0 || input >= length || output <= 0 || output > length || input === output) ok = false;
        if ([fbcoef, ffcoef, gain, lpfilter].some(v => Math.abs(v) > 0x7FFF) || chorusRate < 0 || chorusRate > 0x10000 || chorusDepth < 0 || chorusDepth > 0x1000) ok = false;
        if (!fbcoef && !ffcoef && !gain) ok = false;
        list.push({input, output, fbcoef, ffcoef, gain, chorusRate, chorusDepth, lpfilter});
      }
      if (!ok || !list.some(d => d.gain)) continue;
      if (!best || present > best.present) best = {at: p, sections, length, delays: list, present};
    }
  }
  return best;
}

// libaudio's SMALLROOM table as remembered (100 ms line, an all-pass, a
// gained all-pass, a filtered comb), only for a rip without a block of its own
export const SMALLROOM_FX = rate => ({at: null, sections: 3, length: Math.round(0.1 * rate) & ~15, delays: [
  {input: 0, output: Math.round(0.054 * rate), fbcoef: 9830, ffcoef: -9830, gain: 0, chorusRate: 0, chorusDepth: 0, lpfilter: 0},
  {input: Math.round(0.035 * rate), output: Math.round(0.073 * rate), fbcoef: 3276, ffcoef: -3276, gain: 0x3FFF, chorusRate: 0, chorusDepth: 0, lpfilter: 0},
  {input: 0, output: Math.round(0.06 * rate), fbcoef: 5000, ffcoef: 0, gain: 0, chorusRate: 0, chorusDepth: 0, lpfilter: 0x5000}]});

export class SdkFx {
  constructor(params, rate, fxRate) {
    const k = rate / fxRate; // the block's samples are at the game's output rate; scale the taps to the render's
    this.length = Math.max(16, Math.round(params.length * k));
    this.line = new Float32Array(this.length);
    this.head = 0;
    this.sections = params.delays.map(d => ({input: Math.round(d.input * k), output: Math.round(d.output * k), fb: d.fbcoef / 32768, ff: d.ffcoef / 32768, gain: d.gain / 32768, lp: d.lpfilter ? d.lpfilter / 32768 : 0, lpState: 0}));
  }
  // one input sample in, the effect's output sample out
  step(x) {
    const line = this.line, L = this.length, head = this.head;
    line[head] = x;
    let out = 0;
    for (const d of this.sections) {
      const pi = (head + d.input) % L, po = (head + d.output) % L;
      let a = line[pi], y = line[po];
      if (d.fb) { a += d.fb * y; line[pi] = a; }
      if (d.ff) y += d.ff * a;
      if (d.lp) { d.lpState += d.lp * (y - d.lpState); y = d.lpState; }
      if (d.ff || d.lp) line[po] = y;
      if (d.gain) out += d.gain * y;
    }
    this.head = head === 0 ? L - 1 : head - 1;
    return out;
  }
}
export function panGains(pan) {
  const p = Math.max(0, Math.min(127, Math.round(pan)));
  return {l: Math.cos(p * Math.PI / 254), r: Math.cos((127 - p) * Math.PI / 254)};
}

export async function renderRare(result, opts = {}) {
  const stereo = opts.stereo !== false;
  const reverbOn = opts.reverb !== null && opts.reverb !== false;
  const set = opts.set;
  if (!set || !set.rom || !set.state) throw new Error("renderRare needs the set (its ROM pages and save state)");
  const {ram} = rdramOf(set.state);
  const list = findRareBanks(ram);
  if (!list.length) throw new Error("no sound bank in this rip's memory");
  const want = opts.banks && opts.banks.length ? opts.banks[0] : 0;
  const bank = readRareBank(ram, set.rom, (list[want] || list[0]).at);
  const sampleRate = opts.sampleRate || bank.sampleRate;
  const groups = channelGroups(result, opts.meter || {});
  const {tempos, notes} = result;
  const endTick = Math.max(result.endTick || 0, ...notes.map(n => n.tick + n.dur));
  const seconds = Math.min(opts.keepSeconds || Infinity, tickSeconds(tempos, endTick) + 2.5);
  const N = Math.ceil(seconds * sampleRate);
  const out = {sampleRate, seconds, silent: [], warnings: [], reverb: null, bankRate: bank.sampleRate};
  const warned = new Set();
  const warn = w => { if (!warned.has(w)) { warned.add(w); out.warnings.push(w); } };
  let fxParams = null;
  if (reverbOn) {
    fxParams = opts.fx || findFxParams(ram);
    if (!fxParams) { fxParams = SMALLROOM_FX(bank.sampleRate); warn("no effect parameter block in this rip's memory: libaudio's SMALLROOM (as remembered) stands in"); }
    out.reverb = {at: fxParams.at, sections: fxParams.sections, length: fxParams.length};
  }
  let done = 0, total = 0;
  for (const g of groups) total += g.notes.length;
  let envBuf = new Float32Array(sampleRate * 8);
  out.pans = {};
  const fxGain = Math.SQRT1_2; // the effect's return into each channel
  for (const g of groups) {
    let bufL = null, bufR = null, wet = null;
    const pans = new Map();
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
      const base = (Math.max(0, Math.min(127, n.vel)) / 127) * (snd.sampleVolume / 127) * (n.gain ? 1 : n.vol != null ? n.vol : 1) * (inst.volume / 127);
      if (base <= 0) continue;
      const send = reverbOn && n.rev ? Math.min(127, n.rev) / 127 : 0; // alSynSetFXMix: the voice into the effect at cc91/127
      const pan = Math.max(0, Math.min(127, (snd.samplePan != null ? snd.samplePan : PAN_CENTER) + (n.pan != null ? n.pan : PAN_CENTER) - PAN_CENTER));
      const {l: gL, r: gR} = stereo ? panGains(pan) : {l: 1, r: 0};
      pans.set(pan, (pans.get(pan) || 0) + 1);
      const env = snd.envelope || {attackTime: 0, decayTime: -1, releaseTime: 0, attackVolume: 127, decayVolume: 127};
      const i0 = Math.floor(t0 * sampleRate), iOff = Math.floor(tickSeconds(tempos, n.tick + n.dur) * sampleRate);
      const holdSamples = Math.max(1, iOff - i0);
      const need = holdSamples + Math.round(((env.releaseTime || 0) / 1e6) * sampleRate) + 2;
      if (envBuf.length < need) envBuf = new Float32Array(need);
      const len = envelopeGain(env, sampleRate, holdSamples, envBuf);
      const pcm = smp.pcm, L = smp.loopEnd, loopStart = smp.loopStart;
      // volume changes under the note (n.gain: the channel volume from t ticks in) step the voice's level
      let gain = null, gi = 0, gNow = 1;
      if (n.gain) gain = n.gain.map(x => ({i: Math.floor(tickSeconds(tempos, n.tick + x.t) * sampleRate), l: x.l}));
      // pitch bends inside the note (n.slide: semitones from the note-on pitch, t ticks in) step the ONE voice — no new attack
      let slide = null, si = 0, stepNow = step;
      if (n.slide && n.slide.length) {
        slide = [{i: i0, s: 0}];
        for (const sl of n.slide) { const a = Math.floor(tickSeconds(tempos, n.tick + sl.t) * sampleRate); slide.push({i: a, s: slide[slide.length - 1].s}, {i: a + 1, s: sl.to}); }
      }
      let pos = 0;
      for (let k = 0; k < len; k++) {
        const i = i0 + k;
        if (i >= N) break;
        if (pos >= L) { if (!smp.looping) break; pos = loopStart + (pos - loopStart) % (L - loopStart); }
        if (slide) {
          while (si + 1 < slide.length && i >= slide[si + 1].i) si++;
          const g = slide[si], nx = slide[si + 1];
          const semis = nx && nx.i > g.i && i < nx.i ? g.s + (nx.s - g.s) * (i - g.i) / (nx.i - g.i) : g.s;
          stepNow = step * Math.pow(2, semis / 12);
        }
        const p0 = pos | 0, f = pos - p0, a = pcm[p0], b = p0 + 1 < L ? pcm[p0 + 1] : smp.looping ? pcm[loopStart] : 0;
        if (gain) { while (gi + 1 < gain.length && i >= gain[gi + 1].i) gi++; gNow = gain[gi].l; }
        const v = (a + (b - a) * f) * base * envBuf[k] * gNow;
        if (v !== 0) {
          if (!bufL) { bufL = new Float32Array(N); if (stereo) bufR = new Float32Array(N); }
          bufL[i] += v * gL; if (stereo) bufR[i] += v * gR;
          if (send) { if (!wet) wet = new Float32Array(N); wet[i] += v * send; }
        }
        pos += stepNow;
      }
    }
    if (bufL && wet) { // the effect's return, one line per track (linear: the sum of returns is the return of the sum)
      const fx = new SdkFx(fxParams, sampleRate, bank.sampleRate);
      for (let i = 0; i < N; i++) { const y = fx.step(wet[i]); if (y !== 0) { if (stereo) { bufL[i] += y * fxGain; bufR[i] += y * fxGain; } else bufL[i] += y; } }
      wet = null;
    }
    if (bufL) {
      out[g.name] = stereo ? {l: bufL, r: bufR} : bufL;
      // the pans the track's voices used (voice pan = samplePan + cc10 − 64), most-used first, and the channel's cc10 at its first note
      out.pans[g.name] = {cc10: g.first.pan != null ? g.first.pan : PAN_CENTER, voice: [...pans].sort((a, b) => b[1] - a[1]).map(([p, k]) => ({pan: p, notes: k}))};
    } else out.silent.push(g.name);
  }
  if (opts.onProgress) opts.onProgress(1);
  return out;
}
