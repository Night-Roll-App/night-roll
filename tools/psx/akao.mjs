// AKAO sequence reader — Square's PS1 house format (Final Fantasy VII
// flavour: VGMTrans's "version 1.0"). Not SEQ: a tracker-style byte code,
// one stream per voice, note pitch as octave × 12 + degree, lengths from an
// 11-entry table at 48 ticks per quarter. This reads the score and
// simulates just enough of the driver (octave, transpose, loop stack,
// jumps, drum mode) to emit notes; it does not play anything.
//
// Layout and opcode set: VGMTrans AkaoSeq.cpp (event map for VERSION_1_0/1_1)
// and the Qhimm wiki "FF7/PSX/Sound/AKAO sequence" page, both checked
// against the real FF7 PSF set (RESEARCH.md §6, INTEGRATION.md "Real rips").
// Where the two sources disagree (the tempo constant) the driver bytes in
// the FF7 psflib decided.

export const AKAO_PPQ = 48;
// index = opcode % 11: whole, half, quarter, 8th, 16th, 32nd, 64th, then
// triplet half, quarter, 8th, 16th (VGMTrans DELTA_TIME_TABLE)
export const DELTA = [192, 96, 48, 24, 12, 6, 3, 32, 16, 8, 4];
// Root-counter target the driver runs its tick accumulator on. FF7's driver
// loads 0x43D1 (found as `li a1, 0x43D1` in the psflib; 0x44E8 does not
// occur); later AKAO games use 0x44E8 = exactly 240 Hz. Ticks per second =
// (33868800 / 8 / div) × tempo / 65536.
export const TIMER_DIV_FF7 = 0x43D1;
export const TIMER_DIV_LATER = 0x44E8;
export function akaoBpm(tempo, div = TIMER_DIV_FF7) {
  return tempo * (33868800 / 8 / div) / 65536 * 60 / AKAO_PPQ;
}

export function isAKAO(buf, off = 0) {
  const d = new Uint8Array(buf);
  if (off + 0x14 > d.length) return false;
  if (d[off] !== 0x41 || d[off + 1] !== 0x4B || d[off + 2] !== 0x41 || d[off + 3] !== 0x4F) return false; // "AKAO"
  // version 1/2 headers keep the voice mask at 0x10 with no bits above 24;
  // version 3 (FF8/9) keeps it at 0x20 — not handled here
  return d[off + 0x13] === 0;
}

// every "AKAO" whose header shape passes isAKAO
export function scanAKAO(bytes) {
  const d = new Uint8Array(bytes), out = [];
  for (let i = 0; i + 0x14 <= d.length; i++) if (d[i] === 0x41 && isAKAO(d, i)) out.push(i);
  return out;
}

const bcd = b => (b >> 4) * 10 + (b & 15);

// -> {id, length, reverbType, timestamp, mask, tracks: [{voice, offset}], bytes}
// offsets are relative to `bytes`, which is the sequence alone
// (header + length bytes) so callers can keep it apart from the RAM image
export function parseAKAO(buf, off = 0) {
  const d = new Uint8Array(buf);
  if (!isAKAO(d, off)) throw new Error("not an AKAO sequence");
  const u16 = o => d[o] | (d[o + 1] << 8);
  const u32 = o => (u16(o) | (u16(o + 2) << 16)) >>> 0;
  const length = u16(off + 6);
  const bytes = d.subarray(off, Math.min(d.length, off + 0x10 + length));
  const mask = u32(off + 0x10);
  const tracks = [];
  let p = 0x14;
  for (let voice = 0; voice < 24; voice++) {
    if (!(mask & (1 << voice))) continue;
    // relative to the byte after the offset field (Qhimm: "based on the
    // address next to the offset itself"; VGMTrans: base = p + 2)
    tracks.push({voice, offset: p + 2 + u16(off + p)});
    p += 2;
  }
  const ts = [...bytes.subarray(0x0A, 0x10)].map(bcd);
  const pad = n => String(n).padStart(2, "0");
  return {
    id: u16(off + 4), length, reverbType: u16(off + 8),
    timestamp: `19${pad(ts[0])}-${pad(ts[1])}-${pad(ts[2])}T${pad(ts[3])}:${pad(ts[4])}:${pad(ts[5])}`,
    mask, tracks, bytes,
  };
}

// Operand byte counts for everything that is not a note (0x00..0x99) —
// VGMTrans LoadEventMap for VERSION_1_0 plus the Qhimm table. Unlisted
// opcodes (0x9A..0x9F, 0xE0..0xE7, 0xF3, 0xFA..0xFC, 0xFF) are
// "unimplemented" in the FF7 driver; the reader stops the track and says so.
const OPLEN = {
  0xA0: 0, 0xA1: 1, 0xA2: 1, 0xA3: 1, 0xA4: 2, 0xA5: 1, 0xA6: 0, 0xA7: 0, 0xA8: 1, 0xA9: 2, 0xAA: 1, 0xAB: 2,
  0xAC: 1, 0xAD: 1, 0xAE: 1, 0xAF: 1, 0xB0: 2, 0xB1: 1, 0xB2: 1, 0xB3: 0, 0xB4: 3, 0xB5: 1, 0xB6: 0, 0xB7: 1,
  0xB8: 3, 0xB9: 1, 0xBA: 0, 0xBB: 1, 0xBC: 2, 0xBD: 1, 0xBE: 0, 0xBF: 1, 0xC0: 1, 0xC1: 1, 0xC2: 0, 0xC3: 0,
  0xC4: 0, 0xC5: 0, 0xC6: 0, 0xC7: 0, 0xC8: 0, 0xC9: 1, 0xCA: 0, 0xCB: 0, 0xCC: 0, 0xCD: 0, 0xCE: 1, 0xCF: 1,
  0xD0: 0, 0xD1: 0, 0xD2: 1, 0xD3: 1, 0xD4: 0, 0xD5: 0, 0xD6: 0, 0xD7: 0, 0xD8: 1, 0xD9: 1, 0xDA: 1, 0xDB: 0,
  0xDC: 1, 0xDD: 2, 0xDE: 2, 0xDF: 2,
  0xE8: 2, 0xE9: 3, 0xEA: 2, 0xEB: 3, 0xEC: 2, 0xED: 0, 0xEE: 2, 0xEF: 3, 0xF0: 3, 0xF1: 3, 0xF2: 1,
  0xF4: 2, 0xF5: 0, 0xF6: 1, 0xF7: 2, 0xF8: 1, 0xF9: 0, 0xFD: 2, 0xFE: 2,
};
export const AKAO_OPLEN = OPLEN;

const s8 = b => (b << 24) >> 24;
const s16 = (lo, hi) => ((lo | (hi << 8)) << 16) >> 16;

// Simulate one track. Returns its notes and the timing facts it stated.
// The loop is the first backward 0xEE jump into a visited byte (a song
// loop is one per track in AKAO; c8/c9/ca repeats are unrolled).
function runTrack(akao, ti, {tempoDiv, condition, maxEvents}) {
  const d = akao.bytes;
  const {voice} = akao.tracks[ti];
  let pc = akao.tracks[ti].offset;
  const visited = new Uint8Array(d.length);
  const firstTickAt = new Map();   // offset -> tick of first visit (loop start lookup)
  const notes = [], tempos = [], timeSigs = [], warnings = [], bendsOut = [];
  let tick = 0, octave = 0, transpose = 0, program = 0, vol = 127, expr = 127, tuning = 0, drum = null;
  let legato = false, slur = false;
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

  while (!ended) {
    if (pc >= d.length) { warnings.push(`track ${ti + 1} (voice ${voice}) ran off the end at 0x${pc.toString(16)}`); break; }
    if (++events > maxEvents) { warnings.push(`track ${ti + 1} (voice ${voice}) exceeded the event budget; a repeat never exits`); break; }
    const at = pc;
    if (!visited[at]) firstTickAt.set(at, tick);
    visited[at] = 1;
    const op = d[pc++];
    if (op <= 0x99) {
      const rest = op >= 0x8F, tie = !rest && op >= 0x84;
      let delta = DELTA[op % 11];
      if (oneTime !== null) { delta = oneTime; oneTime = null; }
      if (fixedDelta) delta = fixedDelta;
      lastDelta = delta;
      if (tie) {
        // a tie after a rest, or first thing in a repeat body (the
        // real files do both), just lets time pass — no note to extend
        if (last) last.endTick = tick + delta;
      } else if (rest) {
        last = null;
      } else {
        const rel = Math.floor(op / 11);
        let key = drum ? 24 + rel : octave * 12 + rel + transpose;
        const cents = tuningCents();
        const exact = key + cents / 100;
        const n = {tick, endTick: tick + delta, ch: ti, voice, key, vel: curVol(), program, pitch: Math.round(exact), cents: Math.round((exact - Math.round(exact)) * 100), drum: !!drum, tone: null, root: null, legato: legato || slur};
        if (drum) {
          const e = drum.entries[rel];
          if (e) { n.program = e.instrument; n.tone = {instrument: e.instrument, key: e.key, vol: e.vol, pan: e.pan}; }
        }
        notes.push(n);
        last = n;
      }
      tick += delta;
      continue;
    }
    if (!(op in OPLEN)) { warnings.push(`track ${ti + 1} (voice ${voice}): unimplemented opcode 0x${op.toString(16)} at 0x${at.toString(16)}; track stopped`); break; }
    const n = OPLEN[op];
    if (pc + n > d.length) { warnings.push(`track ${ti + 1}: truncated operand for 0x${op.toString(16)}`); break; }
    const a = d[pc], b = d[pc + 1], c = d[pc + 2];
    pc += n;
    switch (op) {
      case 0xA0: ended = true; break;
      case 0xA1: case 0xF2: program = a; break;
      case 0xF4: program = a; break;                       // overlay voice: primary instrument
      case 0xA2: oneTime = a; lastDelta = a; break;
      case 0xA3: { const was = level(); vol = a; volFade = null; gainStep(was); break; }
      case 0xA8: { const was = level(); expr = a; exprFade = null; gainStep(was); break; }
      case 0xA9: { const len = a || 256; const from = fadeAt(exprFade, expr); exprFade = {start: tick, end: tick + len, from, to: b}; expr = b;
                   gains.push({tick, level: fadeAt(volFade, vol) * from / (127 * 127)}); gains.push({tick: tick + len, level: fadeAt(volFade, vol) * b / (127 * 127)}); break; }
      case 0xA4: bendsOut.push({tick, len: a || 256, semitones: s8(b)}); break;
      case 0xA5: octave = a & 15; break;
      case 0xA6: octave = (octave + 1) & 15; break;
      case 0xA7: octave = (octave - 1) & 15; break;
      case 0xC0: transpose = s8(a); break;
      case 0xC1: transpose += s8(a); break;
      case 0xD8: tuning = s8(a); break;
      case 0xD9: tuning = s8(tuning + s8(a)); break;
      case 0xCC: slur = true; break;
      case 0xCD: slur = false; break;
      case 0xD0: legato = true; break;
      case 0xD1: legato = false; break;
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
      case 0xF0: { const count = a || 256, dest = pc + s16(b, c); if (loopCount[layer] + 1 === count) pc = dest; break; }
      case 0xF1: { const count = a || 256, dest = pc + s16(b, c); if (loopCount[layer] + 1 === count) pc = dest; layer = (layer - 1) & 3; break; }
      case 0xEE: {
        const dest = pc + s16(a, b);
        if (dest < 0 || dest >= d.length) { warnings.push(`track ${ti + 1}: jump outside the sequence at 0x${at.toString(16)}`); ended = true; break; }
        if (visited[dest]) { loop = {start: firstTickAt.get(dest) ?? 0, end: tick}; ended = true; break; }
        pc = dest;
        break;
      }
      case 0xEF: { const dest = pc + s16(b, c); if (a === condition) pc = dest; break; } // game-set variable; VGMTrans's default too
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
        // drum map follows the sequence: 5-byte {instrument, key, vol u16, pan}
        // per degree (Qhimm); the octave is ignored while drum mode is on
        const dest = pc + s16(a, b);
        const entries = [];
        for (let k = 0; k < 12 && dest + k * 5 + 5 <= d.length; k++) {
          const o = dest + k * 5;
          entries.push({instrument: d[o], key: d[o + 1], vol: d[o + 3], pan: d[o + 4]});
        }
        drum = {offset: dest, entries};
        break;
      }
      case 0xED: drum = null; break;
      default: break; // ADSR, LFOs, pan, reverb, noise, side-chains: no note fact
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
  return {notes, tempos, timeSigs, warnings, bends: bendsOut, endTick: tick, loop, voice};
}

// -> the shape notes.mjs's toNotesTxt/makeMidi/trimSeconds take: {notes,
// channels, programs, bends, seq, vab: null, source}
export function akaoNotes(akao, {tempoDiv = TIMER_DIV_FF7, condition = 0, maxEvents = 200000, instr = null} = {}) { // instr: {ram, offset} of INSTR.DAT (tools/psx/instr.mjs), for envelopes
  const runs = akao.tracks.map((_, i) => runTrack(akao, i, {tempoDiv, condition, maxEvents}));
  const warnings = runs.flatMap(r => r.warnings);
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
  const firstNote = Math.min(Infinity, ...runs.flatMap(r => r.notes.map(n => n.tick)));
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
    id: akao.id, reverbType: akao.reverbType, timestamp: akao.timestamp};
  const channels = [...new Set(notes.map(n => n.ch))].sort((a, b) => a - b);
  const programInfo = new Map();
  for (const n of notes) if (!programInfo.has(n.program)) programInfo.set(n.program, {program: n.program, drum: n.drum});
  const bends = new Array(akao.tracks.length).fill(0);
  runs.forEach((r, i) => { bends[i] = r.bends.length; });
  return {notes, channels, programs: [...programInfo.values()], bends, seq, vab: null, instr,
    source: {kind: "akao", label: "PS1 AKAO", pitchNote: "Pitch is the AKAO key as written (octave × 12 + degree + transpose; FF7 articulations are tuned so this is the sounding note for melodic instruments). Kits keep their key numbers. Notes are shown at written length; the driver keys off 2 ticks early unless legato."},
    tracks: runs.map((r, i) => ({ch: i, voice: r.voice, notes: r.notes.length, endTick: r.endTick, loop: r.loop}))};
}
