// Parsed N64 sequence -> the repo's .notes.txt and a type-1 MIDI.
// Ticks are exact 48ths of a beat, so nothing is quantized here (the NSF
// path snaps because frame counts drift; sequence data has no drift).
// Meter is the caller's assumption: the format carries none.
import { pitchName } from "../nsf/notes.mjs";
import { makeMidiTracks, PPQ } from "../nsf/midi-write.mjs";
import { TICKS_PER_BEAT } from "./constants.mjs";
import { guessKit } from "../kit-guess.mjs";

const label = n => n.drum ? "D" + n.semitone : pitchName(n.midi);

// A note with pitch bends inside it (n.slide, from the Rare driver: [{t, to}]
// — t ticks after the note-on, `to` semitones from the note-on pitch) becomes
// one note per landed pitch, so the roll shows where the bend went. The
// PS1 path's splitSlides (tools/psx/notes.mjs) does the same on its own
// note shape (endTick/pitch, whole-semitone targets); this one rounds the
// wheel's fractional targets to the nearest semitone and merges runs that
// land on the same one, on the N64 shape (tick/dur, midi/semitone/key).
export function splitSlides(notes) {
  const out = [];
  for (const n of notes) {
    if (!n.slide || !n.slide.length || n.drum) { out.push(n); continue; }
    const end = n.tick + n.dur;
    let at = n.tick, off = 0;
    for (const sl of n.slide) {
      const r = Math.round(sl.to);
      if (r === off) continue;
      const t = n.tick + sl.t;
      if (t > at) out.push({...n, tick: at, dur: t - at, midi: n.midi + off, semitone: n.semitone + off, key: n.key != null ? n.key + off : undefined, slide: undefined, slid: true, env: pieceEnv(n, at, t)});
      at = t; off = r;
    }
    if (end > at) out.push({...n, tick: at, dur: end - at, midi: n.midi + off, semitone: n.semitone + off, key: n.key != null ? n.key + off : undefined, slide: undefined, slid: true, env: pieceEnv(n, at, end)});
  }
  return out;
}
// a piece's share of the note's volume shape (rare.mjs attachOneShotShapes), from the piece's own start
function pieceEnv(n, from, to) {
  if (!n.env) return undefined;
  const e = n.env.filter(q => n.tick + q.t > from && n.tick + q.t < to).map(q => ({t: n.tick + q.t - from, r: q.r}));
  return e.length ? e : undefined;
}

export function toNotesTxt(res, {title = "n64", tsNum = 4, tsDen = 4} = {}) {
  const beatsPerBar = tsNum * 4 / tsDen;
  const ticksPerBar = beatsPerBar * TICKS_PER_BEAT;
  const bars = Math.ceil(res.endTick / ticksPerBar);
  const tempo = res.tempos.map(t => t.bpm).join("→");
  const L = [];
  L.push(`# ${title} — ${tsNum}/${tsDen} (assumed; the sequence carries no meter), ${tempo}bpm, ${bars} bars (from N64 sequence, ${res.abi} ABI)`);
  L.push("# Format: bar N: beat pitch duration-in-quarter-notes vN [velocity 0-127 from the note command]. Drums are D<index> (bank not read; index is not a pitch).");
  L.push("# Channel identity is sequence fact. Pitches use sharp spelling and the +21 root convention (bank tuning not applied); no key is stated.");
  if (res.loop) L.push(`# loop: returns to tick ${res.loop.tick} (beat ${(res.loop.tick / TICKS_PER_BEAT + 1).toFixed(2)}) after tick ${res.loop.at}`);
  const split = splitSlides(res.notes);
  if (split.length !== res.notes.length) L.push("# pitch bends inside notes: each landed pitch is written as its own note");
  const byCh = new Map();
  for (const n of split) { if (!byCh.has(n.ch)) byCh.set(n.ch, []); byCh.get(n.ch).push(n); }
  for (const ch of [...byCh.keys()].sort((a, b) => a - b)) {
    const evs = byCh.get(ch);
    const insts = [...new Set(evs.map(n => n.inst))].map(i => i === 0x7F ? "drums" : i == null ? "none" : i).join(",");
    L.push("");
    L.push(`## channel ${ch} (instrument ${insts})`);
    const rows = {};
    for (const n of evs) {
      const bar = Math.floor(n.tick / ticksPerBar) + 1;
      const beat = (n.tick - (bar - 1) * ticksPerBar) / TICKS_PER_BEAT + 1;
      (rows[bar] = rows[bar] || []).push(`${+beat.toFixed(2)} ${label(n)} ${+(n.dur / TICKS_PER_BEAT).toFixed(2)} v${n.vel}`);
    }
    for (const bar of Object.keys(rows).map(Number).sort((a, b) => a - b)) L.push("bar " + bar + ": " + rows[bar].join(", "));
  }
  return L.join("\n") + "\n";
}

// The tracks a capture has, shared by the MIDI writer and the console
// renderer (render.mjs) so both name them identically: one per N64
// channel, melodic and kit apart. Percussion is drum notes plus any
// instrument that only ever plays ONE pitch, many times (a percussion
// sample on a melodic channel — the PS1 path's rule). Drum indexes name a
// slot in a bank the MIDI cannot carry, so their GM keys are guessed from
// rhythm (tools/kit-guess.mjs) — before this they sat at 35 + index, an
// arbitrary offset that played toms and cymbals for every hit (Josh, Mario
// 64's Title Theme, 2026-09-27: "a disaster"). The guess lands on each note
// as `gm`, on res.kitGuess, and once in res.warnings so the capture row can
// say so. Returns [{name, ch, kit, notes, first}] with the original note
// objects; a note the MIDI cannot hold (a pitch outside 0..127) is left out.
export function channelGroups(res, {tsNum = 4, tsDen = 4} = {}) {
  const notes = res.notes.filter(n => n.drum ? n.semitone >= 0 : n.midi >= 0 && n.midi <= 127);
  const byInst = new Map();
  for (const n of notes) if (!n.drum && n.inst != null) (byInst.get(n.inst) || byInst.set(n.inst, []).get(n.inst)).push(n);
  const percInst = new Set();
  for (const [inst, evs] of byInst) if (evs.length >= 12 && new Set(evs.map(n => n.midi)).size === 1) percInst.add(inst);
  const isPerc = n => n.drum || percInst.has(n.inst);
  // voices for the guess: a drum index, or a promoted instrument's one pitch
  const voices = new Map();
  for (const n of notes) {
    if (!isPerc(n)) continue;
    const k = n.drum ? "D" + n.semitone : "I" + n.inst;
    (voices.get(k) || voices.set(k, {id: k, key: n.drum ? n.semitone : n.midi, drum: !!n.drum, inst: n.inst, notes: []}).get(k)).notes.push(n);
  }
  const guess = [];
  if (voices.size) {
    const list = guessKit([...voices.values()], {beatTicks: TICKS_PER_BEAT * 4 / tsDen, barBeats: tsNum});
    for (const v of list) { for (const n of v.notes) n.gm = v.gm; guess.push({id: v.id, key: v.key, gm: v.gm, label: v.label, notes: v.count}); }
    guess.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
    const w = "kit guessed from rhythm: " + guess.map(g => g.id + " → " + g.label).join(", ");
    if (!(res.warnings || (res.warnings = [])).includes(w)) res.warnings.push(w);
  }
  res.kitGuess = guess;
  const groups = new Map(); // "<ch>" melodic, "<ch>k" kit
  for (const n of notes) {
    const g = n.ch + (isPerc(n) ? "k" : "");
    if (!groups.has(g)) groups.set(g, {ch: n.ch, kit: isPerc(n), notes: [], first: n});
    groups.get(g).notes.push(n);
  }
  return [...groups.values()].sort((a, b) => a.ch - b.ch || (a.kit ? 1 : 0) - (b.kit ? 1 : 0)).map(g => {
    const first = g.first;
    const inst = first.drum ? "drums" : first.inst == null ? "" : "inst " + first.inst + (g.kit ? " kit" : "");
    return {name: `ch ${g.ch}${inst ? " " + inst : ""}`, ch: g.ch, kit: g.kit, notes: g.notes, first};
  });
}

// One MIDI track per group, MIDI channel = N64 channel (identity over GM
// conventions), with percussion the one exception: the player treats MIDI
// channel 9 as the kit, so every kit group lands there and a melodic N64
// channel 9 moves to a free channel.
// offsets: {[group.name]: {offset, ...}} from tools/sounding.mjs, already
// APPLIED to res.notes' `midi` by applySoundingOffsets — toMidi only needs
// it here to write the per-track meta event that says by how much
// (offsetMetaEvent, tools/nsf/midi-write.mjs), for the tap preview to read back.
export function toMidi(res, {tsNum = 4, tsDen = 4, offsets} = {}) {
  const scale = PPQ / TICKS_PER_BEAT;
  // slid notes become one note per landed pitch here (the render keeps the one voice); warnings/kitGuess land on `res`
  const view = {...res, notes: splitSlides(res.notes)};
  const groups = channelGroups(view, {tsNum, tsDen});
  res.kitGuess = view.kitGuess;
  const melodicChs = new Set(groups.filter(g => !g.kit).map(g => g.ch));
  let spare = null; // where a melodic N64 channel 9 goes: the first MIDI channel no melodic track uses
  for (let c = 0; c < 16 && spare === null; c++) if (c !== 9 && !melodicChs.has(c)) spare = c;
  // the track's pan as CC10 (0..127, 64 centre): the first note's at tick 0, then one at each note whose pan differs.
  // A note's pan is what the sequence set (channel pan × weight + layer pan × the rest); a drum's own bank pan is not
  // known here, so a kit with DC 0 shows the layer default (centre) — the render pans it from the bank.
  const panOf = n => { const w = n.panWeight != null ? n.panWeight : 1, c = n.pan != null ? n.pan : 0.5, l = n.lyPan != null ? n.lyPan : 0.5; return Math.max(0, Math.min(127, Math.round((c * w + l * (1 - w)) * 127))); };
  const tracks = groups.map(g => {
    const cc = []; let lastPan = null;
    for (const n of g.notes) { const p = panOf(n); if (p !== lastPan) { if (lastPan !== null) cc.push({t: n.tick * scale, cc: 10, v: p}); lastPan = p; } }
    return {
      name: g.name, ch: g.kit ? 9 : g.ch === 9 ? (spare === null ? 9 : spare) : g.ch,
      notes: g.notes.map(n => ({t: n.tick * scale, d: Math.max(1, n.dur * scale), p: g.kit ? n.gm : n.midi, v: Math.max(1, Math.min(127, n.vel)),
                                ...(!g.kit && n.env ? {env: n.env.map(q => ({t: q.t * scale, r: q.r}))} : {})})),
      program: g.kit || g.first.inst == null ? undefined : g.first.inst & 0x7F,
      pan: g.notes.length ? panOf(g.notes[0]) : undefined, cc,
      offset: !g.kit && offsets && offsets[g.name] ? offsets[g.name].offset : 0,
    };
  });
  return makeMidiTracks(tracks, {tempos: res.tempos.map(t => ({t: t.tick * scale, bpm: t.bpm})), tsNum, tsDen});
}
