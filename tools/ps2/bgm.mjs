// Square Enix's own PS2 sequenced-audio format: BGM (the sequence) + WD (the
// instrument bank, tools/ps2/wd.mjs) — Final Fantasy X/X-2/XII, Kingdom
// Hearts and kin (docs/plans/ps2.md milestone 3; a SEPARATE opcode table
// from Sony's stock SQ, confirmed by reading VGMTrans's own
// SquarePS2Seq.cpp/SquarePS2Scanner.cpp — NOT AKAO-descended despite the
// family name: no degree/length-index encoding at all, just small discrete
// byte opcodes, closer in spirit to a cut-down MIDI than to AKAO's tracker
// commands). This module produces a `seq` object in the SAME shape
// tools/psx/seq.mjs (SEQ) and tools/ps2/sq.mjs (SQ) do — {ppq, tempo, tsNum,
// tsDen, events, endTick, tempoMap, timeSigs, loop, warnings} — so the PS1
// note pipeline (tools/psx/notes.mjs's seqNotes/toNotesTxt/makeMidi) and the
// chip-audio renderer (tools/psx/spu-render.mjs's renderSpu) run over it
// completely unmodified; `bgmNotes()` below is this module's own thin
// wrapper around seqNotes() (exactly the shape of tools/psx/akao.mjs's own
// post-processing step for AKAO's pitch slides — notes.mjs itself is never
// touched) that additionally honors BGM's pitch-bend opcode.
//
// Byte layout, cross-checked against every one of 92 real Final Fantasy X
// .bgm files (tests/ps2-real.test.mjs) by parsing each one to its own
// declared end and confirming zero bytes are left over and zero opcodes are
// unrecognized:
//   Header (0x20 bytes): "BGM " (4) + seqID u16 LE (0x04) + associated WD id
//   u16 LE (0x06) + track count u8 (0x08) + ppqn u16 LE (0x0E) + file length
//   u32 LE (0x10); 0x14/0x18/0x1C are reserved zero words (VGMTrans's own
//   scanner heuristic checks them; this reader doesn't need to).
//   Tracks, back to back starting at 0x20: a u32 LE byte-count, then that
//   many bytes of event stream, no gap. Every track shares ONE tick clock
//   (tick 0 = the song's own start, same as a type-1 MIDI file's tracks) —
//   not per-channel-nibble like SEQ/SQ: a BGM "channel" IS its track index.
//   Every event: a MIDI-style variable-length delta tick, then ONE status
//   byte (no running status — every event names its own opcode), then a
//   fixed number of operand bytes fully determined by the opcode alone (no
//   length prefix, no per-song variation — VGMTrans's own reader assumes
//   this too). Two opcodes VGMTrans's table doesn't document at all (0x29,
//   found in "Victory!", and 0x41, found in "Yuna's Theme") were found by
//   testing every candidate operand length against these two real files
//   until the WHOLE file parsed to its declared end with zero leftover
//   bytes and zero further unknown opcodes: both take zero operand bytes.
// Two more real-file facts VGMTrans's own C++ reader effectively skips
// (its "Loop Begin"/"Loop End" events are cosmetic UI labels only — the
// code that would have used them to loop is commented out): 0x02/0x03
// carry NO loop-count field at all (unlike SQ's CC99/CC38), so a found
// loop is assumed to repeat forever, the same sentinel PS1 SEQ/SQ use; loop
// markers were found on exactly one track per song across the corpus (not
// necessarily track 0), so this reader scans every track for them rather
// than assuming one.
import { seqNotes } from "../psx/notes.mjs";

function tagAt(d, o, str) {
  if (d.length < o + str.length) return false;
  for (let i = 0; i < str.length; i++) if (d[o + i] !== str.charCodeAt(i)) return false;
  return true;
}

export function isBGM(buf) {
  const d = new Uint8Array(buf);
  return d.length >= 0x20 && tagAt(d, 0, "BGM ");
}

function readVL(d, pos) {
  let v = 0, b;
  do { b = d[pos++]; v = v * 128 + (b & 0x7F); } while (b & 0x80);
  return [v, pos];
}

const mkNote = (tick, ch, key, vel) => vel ? {tick, type: "on", ch, key, vel} : {tick, type: "off", ch, key, vel: 0};

// operand byte counts for opcodes with a fixed-length operand and no other
// side effect worth a dedicated case below (VGMTrans's own comments: "no
// idea", "part of init", found once or twice per corpus and never explained
// even by the community's own reverse-engineering)
const SKIP_1 = new Set([0x0A, 0x0D, 0x28, 0x31, 0x34, 0x35, 0x3E, 0x58, 0x3C, 0x5D]);
const SKIP_2 = new Set([0x19, 0x47]);
const SKIP_3 = new Set([0x40, 0x48, 0x50]);
const SKIP_0 = new Set([0x04, 0x60, 0x61, 0x7F, 0x29 /* found in "Victory!" */, 0x41 /* found in "Yuna's Theme" */]);

// One track's event stream -> this track's own final tick (its end-of-track
// opcode, or wherever it ran out). Pushes into the shared arrays on `ctx`.
function parseTrack(d, start, end, ch, ctx) {
  const {events, tempoEvents, timeSigEvents, loopMarks, bends, warnings} = ctx;
  // seqNotes()'s own `program` array (tools/psx/notes.mjs) is a fixed
  // `new Array(16).fill(0)`: a channel beyond 15 (BGM tracks run past that —
  // "Other World (Alternate 1)" has 37) that never sends its own 0x20 stays
  // `undefined` forever instead of defaulting to 0 like channels 0-15 do,
  // and an undefined program renders silent (vabVoices()'s `vab.programs
  // [undefined]` is always falsy — found by rendering every real FFX song
  // and catching an unexplained silent track, "410 Challenge"'s channels 30
  // and 31). notes.mjs stays unmodified (per this milestone's contract), so
  // this is fixed here instead: every track starts with an implicit program
  // 0, exactly the default channels 0-15 already get; a real 0x20 later in
  // the same track still overrides it at its own tick, as normal.
  events.push({tick: 0, type: "program", ch, program: 0});
  let pos = start, tick = 0, prevKey = 60, prevVel = 100; // real files never reference either before an explicit 0x11 sets it (checked across the corpus); these are an inert fallback
  const need = n => { if (pos + n > end) throw new Error(`BGM: track ${ch + 1} truncated at byte ${pos}`); };
  while (pos < end) {
    const [delta, p2] = readVL(d, pos); pos = p2; tick += delta;
    if (pos >= end) { warnings.push(`track ${ch + 1}: ran out of data at tick ${tick} (no end-of-track opcode)`); return tick; }
    const op = d[pos++];
    if (op === 0x00) return tick; // end of track
    if (SKIP_0.has(op)) continue;
    if (SKIP_1.has(op)) { need(1); pos += 1; continue; }
    if (SKIP_2.has(op)) { need(2); pos += 2; continue; }
    if (SKIP_3.has(op)) { need(3); pos += 3; continue; }
    switch (op) {
      case 0x02: loopMarks.push({tick, kind: "start"}); break;
      case 0x03: loopMarks.push({tick, kind: "end"}); break;
      case 0x08: { need(1); const bpm = d[pos++]; if (bpm > 0) tempoEvents.push({tick, usq: Math.round(6e7 / bpm)}); break; } // one raw BPM byte, not a 3-byte microseconds field like SEQ/SQ's FF51
      case 0x0C: { need(2); const num = d[pos++], den = d[pos++]; timeSigEvents.push({tick, num, den}); break; }
      case 0x10: events.push(mkNote(tick, ch, prevKey, prevVel)); break; // repeat the previous key+velocity
      case 0x11: { need(2); const key = d[pos++], vel = d[pos++]; events.push(mkNote(tick, ch, key, vel)); prevKey = key; prevVel = vel; break; }
      case 0x12: { need(1); const key = d[pos++]; events.push(mkNote(tick, ch, key, prevVel)); prevKey = key; break; } // new key, previous velocity
      case 0x13: { need(1); const vel = d[pos++]; events.push(mkNote(tick, ch, prevKey, vel)); prevVel = vel; break; } // previous key, new velocity
      case 0x18: events.push({tick, type: "off", ch, key: prevKey, vel: 0}); break; // note off, previous key (does not change prevKey)
      case 0x1A: { need(1); const key = d[pos++]; events.push({tick, type: "off", ch, key, vel: 0}); prevKey = key; break; } // note off names its key AND remembers it (VGMTrans's own reader does this too)
      case 0x20: { need(1); const program = d[pos++]; events.push({tick, type: "program", ch, program}); break; }
      case 0x22: { need(1); const value = d[pos++]; events.push({tick, type: "cc", ch, ctl: 7, value}); break; } // channel volume — notes.mjs's generic CC7 handling
      case 0x24: { need(1); const value = d[pos++]; events.push({tick, type: "cc", ch, ctl: 11, value}); break; } // expression — CC11
      case 0x26: { need(1); const value = d[pos++]; events.push({tick, type: "cc", ch, ctl: 10, value}); break; } // pan — CC10
      case 0x5C: { // pitch bend: lsb then msb, standard MIDI order (SQ's 0xE0 too — tools/ps2/sq.mjs)
        need(2); const lsb = d[pos++], msb = d[pos++];
        const value = ((msb << 7) | lsb) - 8192;
        events.push({tick, type: "bend", ch, value});
        bends.push({tick, ch, value});
        break;
      }
      default:
        warnings.push(`track ${ch + 1}: unknown opcode 0x${op.toString(16)} at tick ${tick}: track ends here`);
        return tick;
    }
  }
  warnings.push(`track ${ch + 1}: no end-of-track opcode; data ran out at tick ${tick}`);
  return tick;
}

const DEFAULT_USQ = 500000; // 120bpm: assumed until the first 0x08 (BGM carries no header tempo field, same as SQ)

export function parseBGM(buf) {
  const d = new Uint8Array(buf);
  if (!isBGM(d)) throw new Error('not a BGM file (no "BGM " signature)');
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const seqID = view.getUint16(4, true);
  const assocWDID = view.getUint16(6, true);
  const numTracks = d[8];
  const ppq = view.getUint16(0xE, true);

  const warnings = [];
  const events = [], tempoEvents = [], timeSigEvents = [], loopMarks = [], bends = [];
  const ctx = {events, tempoEvents, timeSigEvents, loopMarks, bends, warnings};
  let pos = 0x20, endTick = 0;
  for (let t = 0; t < numTracks; t++) {
    if (pos + 4 > d.length) { warnings.push(`track ${t + 1}: this BGM's declared track count runs past the file's end (a truncated rip); stopping here`); break; }
    const trackSize = view.getUint32(pos, true);
    const trackStart = pos + 4, trackEnd = trackStart + trackSize;
    if (trackEnd > d.length) { warnings.push(`track ${t + 1}: declared size runs past the file's end (a truncated rip); reading what's there`); }
    const end = Math.min(trackEnd, d.length);
    endTick = Math.max(endTick, parseTrack(d, trackStart, end, t, ctx));
    if (trackEnd > d.length) break;
    pos = trackEnd;
  }
  events.sort((a, b) => a.tick - b.tick); // stable: same-track ties keep file order (a program/CC before the note it affects)

  tempoEvents.sort((a, b) => a.tick - b.tick);
  const tempoMap = [{tick: 0, usq: DEFAULT_USQ}];
  let sawTempoAtZero = false;
  for (const t of tempoEvents) {
    if (t.tick === 0 && !sawTempoAtZero) { tempoMap[0] = {tick: 0, usq: t.usq}; sawTempoAtZero = true; }
    else tempoMap.push(t);
  }

  timeSigEvents.sort((a, b) => a.tick - b.tick);
  const timeSigs = [{tick: 0, num: 4, den: 4}];
  let sawTimeSigAtZero = false;
  for (const ts of timeSigEvents) {
    if (ts.tick === 0 && !sawTimeSigAtZero) { timeSigs[0] = ts; sawTimeSigAtZero = true; }
    else timeSigs.push(ts);
  }
  if (!timeSigEvents.length) warnings.push("no time-signature meta found in this BGM: 4/4 assumed");

  loopMarks.sort((a, b) => a.tick - b.tick);
  let loop = null;
  const loopStart = loopMarks.find(m => m.kind === "start");
  const loopEnd = loopStart ? loopMarks.find(m => m.kind === "end" && m.tick > loopStart.tick) : null;
  if (loopStart && loopEnd) loop = {start: loopStart.tick, end: loopEnd.tick, count: 127}; // no count is ever encoded (unlike SQ's CC38): assumed forever, same sentinel

  return {
    id: seqID, ppq, tempo: tempoMap[0].usq, tsNum: timeSigs[0].num, tsDen: timeSigs[0].den,
    events, endTick, tempoMap, timeSigs, loop, warnings,
    assocWDID, numTracks,
    _bends: bends, // private: consumed only by bgmNotes() below, not part of the SEQ-shape contract
  };
}

// MIDI's own default pitch-bend range when nothing else says otherwise (BGM
// has no RPN0/registered-parameter mechanism to encode a real range — this
// is an assumption, flagged in the warnings, not a fact read from the file).
const BEND_RANGE_SEMITONES = 2;

// seqNotes() only counts "bend" events (seq.bends[ch]++, for the summary
// line toNotesTxt already prints); it does not bend any note's pitch — that
// PS1 behavior lives in tools/psx/akao.mjs's own post-processing of its
// pitch-slide opcode (0xA4) into `note.slide`, which splitSlides()/makeMidi/
// renderSpu already know how to play. This mirrors that exact step for
// BGM's 0x5C, entirely outside notes.mjs (which stays unmodified): each raw
// bend is already an ABSOLUTE offset from centre (not a delta to accumulate,
// unlike AKAO's slide-BY-N-semitones opcode), so `to` is set directly and
// the ramp is instantaneous (len: 1) — a real pitch-wheel glide is simply
// many bend events in a row, which this naturally reconstructs as a chain
// of snap points.
function attachBendSlides(result, bendsRaw) {
  if (!bendsRaw || !bendsRaw.length) return;
  const byCh = new Map();
  for (const b of bendsRaw) (byCh.get(b.ch) || byCh.set(b.ch, []).get(b.ch)).push(b);
  for (const arr of byCh.values()) arr.sort((a, b) => a.tick - b.tick);
  let attached = 0;
  for (const n of result.notes) {
    if (n.drum) continue;
    const chBends = byCh.get(n.ch);
    if (!chBends) continue;
    // the wheel's position when the note starts counts too: a bend held from
    // before this note bends it from its first tick
    let held = null;
    for (const b of chBends) { if (b.tick > n.tick) break; held = b; }
    const inside = chBends.filter(b => b.tick > n.tick && b.tick < n.endTick);
    const slide = inside.map(b => ({t: b.tick - n.tick, len: 1, to: b.value / 8192 * BEND_RANGE_SEMITONES}));
    if (held && held.value) slide.unshift({t: 0, len: 1, to: held.value / 8192 * BEND_RANGE_SEMITONES});
    if (!slide.length) continue;
    n.slide = slide;
    attached++;
  }
  if (attached) (result.seq.warnings || (result.seq.warnings = [])).push(
    `${attached} note(s) carry a pitch bend (0x5C): rendered as pitch slides, bend range assumed ±${BEND_RANGE_SEMITONES} semitones (not encoded in the file)`);
}

// seq: parseBGM()'s result. opts: {vab} — a bank from tools/ps2/wd.mjs's
// toBank(), same as SQ's HD/BD bank. -> the shape toNotesTxt/makeMidi/
// channelGroups/renderSpu already take (tools/psx/notes.mjs's seqNotes()
// result, with pitch-bend slides attached).
export function bgmNotes(seq, opts = {}) {
  const result = seqNotes(seq, opts);
  attachBendSlides(result, seq._bends);
  return result;
}
