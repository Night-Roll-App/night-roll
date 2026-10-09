// SEQ events (+ optional VAB) -> note events per channel/program, then
// .notes.txt and MIDI. Discovery-mode rules as tools/nsf/notes.mjs: pitch,
// time, duration, channel, program. Nothing interpretive.
//
// Pitch has two readings. Without a bank the SEQ key is reported as-is:
// it is what the composer played, and banks are built so that key 60
// sounds C4 more often than not. With a bank the key goes through the
// tone: sounding = root + (key − center), root being the note the sample
// sounds at 44100 Hz — estimated from the decoded sample, assumed C4 when
// the sample has no clear period. Both readings are kept on the note.
import { secondsAt, barBeat, bpmOf } from "./seq.mjs";
import { guessKit } from "../kit-guess.mjs";
import { findInstrDat, readInstr, envelopeAt } from "./instr.mjs";
export { findInstrDat, readInstr, envelopeAt }; // the app reaches them through this module
import { tonesFor, vagPcm, estimateRoot } from "./vab.mjs";
import { akaoRecord, akaoArtOf } from "./akao.mjs";
import { pitchName } from "../nsf/notes.mjs";
import { trackBytes, offsetMetaEvent, kitMetaEvent, chainBends, shapeFromSeries, bendRangeMetas } from "../nsf/midi-write.mjs";

const PPQ = 480; // Night Roll's MIDI resolution; SEQ ticks are rescaled to it

// A kit: several one-key (or near) tones on different samples. A single
// sample spread across the keyboard is an instrument even if it is a drum.
export function isDrumProgram(prog) {
  if (!prog || prog.tones.length < 2) return false;
  const vags = new Set(prog.tones.map(t => t.vag));
  return vags.size >= 2 && prog.tones.every(t => t.max - t.min <= 3);
}

// -> {notes, channels, programs, seq, vab}
// notes: {tick, endTick, ch, key, vel, program, pitch, cents, drum, tone, root}
export function seqNotes(seq, {vab = null, drums = []} = {}) {
  const notes = [];
  const open = new Map();          // "ch:key" -> note
  const program = new Array(16).fill(0);
  const bends = new Array(16).fill(0);
  const chVol = new Array(16).fill(127), chExpr = new Array(16).fill(127), chPan = new Array(16).fill(null);
  const roots = new Map();         // vag -> estimateRoot() | null
  const rootOf = vag => {
    if (!roots.has(vag)) roots.set(vag, estimateRoot(vagPcm(vab, vag)));
    return roots.get(vag);
  };
  const drumSet = new Set(drums);
  const programInfo = new Map();   // program -> {drum, tones seen}

  for (const e of seq.events) {
    // a channel past 15 (PS2 BGM: a channel IS a track, and FFX songs run to
    // 37) starts with the same defaults 0-15 get. Unset, its volume was
    // undefined × undefined = NaN: the note's gain went NaN and the render
    // wrote NaN samples ("109 Battle" channels 17-20 — Josh, 2026-09-29,
    // "obviously not using the right instruments").
    if (e.ch != null && chVol[e.ch] === undefined) { chVol[e.ch] = 127; chExpr[e.ch] = 127; chPan[e.ch] = null; if (program[e.ch] === undefined) program[e.ch] = 0; if (bends[e.ch] === undefined) bends[e.ch] = 0; }
    if (e.type === "program") { program[e.ch] = e.program; continue; }
    if (e.type === "cc") { // channel volume, pan, expression: what the SPU voice's two linear volumes are set from
      if (e.ctl === 7) chVol[e.ch] = e.value; else if (e.ctl === 11) chExpr[e.ch] = e.value; else if (e.ctl === 10) chPan[e.ch] = e.value;
      continue;
    }
    if (e.type === "bend") { bends[e.ch]++; continue; }
    if (e.type !== "on" && e.type !== "off") continue;
    const id = e.ch + ":" + e.key;
    const prev = open.get(id);
    if (prev) { prev.endTick = e.tick; open.delete(id); } // retrigger closes the old one
    if (e.type === "off") continue;
    const p = program[e.ch];
    const n = {tick: e.tick, endTick: null, ch: e.ch, key: e.key, vel: e.vel, program: p, pitch: e.key, cents: 0, drum: false, tone: null, root: null,
      chVol: chVol[e.ch] * chExpr[e.ch] / (127 * 127)};
    if (chPan[e.ch] != null) n.pan = chPan[e.ch];
    if (vab) {
      const prog = vab.programs[p];
      n.drum = drumSet.has(p) || isDrumProgram(prog);
      const tone = tonesFor(vab, p, e.key)[0] || null;
      if (tone) {
        n.tone = {center: tone.center, shift: tone.shift, vag: tone.vag};
        if (!n.drum) {
          const root = rootOf(tone.vag);
          n.root = root;
          // shift direction follows VGMTrans (+ = sharper); see RESEARCH.md §3
          const exact = (root ? root.midi + root.cents / 100 : 60) + (e.key - tone.center) + tone.shift / 128;
          n.pitch = Math.round(exact);
          n.cents = Math.round((exact - n.pitch) * 100);
        }
      }
      if (!programInfo.has(p)) programInfo.set(p, {program: p, drum: n.drum, tones: prog ? prog.tones.length : 0, missing: !prog});
    } else if (drumSet.has(p)) n.drum = true;
    open.set(id, n);
    notes.push(n);
  }
  for (const n of open.values()) n.endTick = seq.endTick;
  notes.sort((a, b) => a.tick - b.tick || a.ch - b.ch || a.key - b.key);
  const channels = [...new Set(notes.map(n => n.ch))].sort((a, b) => a - b);
  return {notes, channels, programs: [...programInfo.values()], bends, seq, vab};
}

// keep notes that start before `seconds`; clip the rest
export function trimSeconds(result, seconds) {
  if (!(seconds > 0)) return result;
  const {seq} = result;
  const notes = result.notes.filter(n => secondsAt(seq, n.tick) < seconds);
  return {...result, notes};
}

const fmt = x => +x.toFixed(3);

// result.source (set by akao.mjs) names the format and its pitch caveat;
// absent, the result is a SEQ
// A note with pitch slides becomes one note per landed pitch: the slide's
// start is the split (a 3-tick slide is a step; a long glide shows its
// target from the moment it begins — the roll has no bend). Pitch and key
// move together; cents stay. A target between semitones (a pitch-wheel bend,
// tools/ps2/bgm.mjs) lands on the nearest one, and steps that land on the
// same semitone stay one note — the roll holds whole MIDI pitches; the
// console render reads n.slide itself and keeps the exact bend. Each piece
// keeps `whole` (the note it came from) and `off` (its semitones from it).
export function splitSlides(notes) {
  const out = [];
  for (const n of notes) {
    if (!n.slide || !n.slide.length) { out.push(n); continue; }
    let at = n.tick, off = 0;
    for (const sl of n.slide) {
      const t = n.tick + sl.t, to = Math.round(sl.to);
      if (to === off) continue;
      if (t > at) out.push({...n, tick: at, endTick: t, pitch: n.pitch + off, key: n.key + off, slide: undefined, slid: true, whole: n, off});
      at = t; off = to;
    }
    if (n.endTick > at) out.push({...n, tick: at, endTick: n.endTick, pitch: n.pitch + off, key: n.key + off, slide: undefined, slid: true, whole: n, off});
  }
  return out;
}

// A note's pitch path (PS1 capture v2): t (ticks from its start) →
// semitones from its own pitch. A portamento note starts at the last note's
// pitch; each slide runs from wherever the voice is to its landing, a
// straight line in the SPU pitch register (linear in frequency) over `len`.
function pitchPath(n) {
  const R = st => 2 ** (st / 12), ramps = [];
  const at = t => {
    let v = n.porta ? n.porta.from : 0;
    for (const r of ramps) {
      if (r.t > t) break;
      v = t >= r.t + r.len ? r.to : 12 * Math.log2(R(r.from) + (R(r.to) - R(r.from)) * (t - r.t) / r.len);
    }
    return v;
  };
  if (n.porta) ramps.push({t: 0, len: n.porta.len, from: n.porta.from, to: 0});
  for (const sl of n.slide || []) ramps.push({t: sl.t, len: sl.len, from: at(sl.t), to: sl.to});
  return {at, ramps};
}
// bend points [{t, c}] thinned to their corners (RDP within 2 cents; the
// first and last kept)
function rdpCents(pts) {
  if (pts.length < 3) return pts;
  const keep = new Set([0, pts.length - 1]);
  const rdp = (a, b) => {
    let best = -1, bestD = 2;
    for (let i = a + 1; i < b; i++) {
      const dv = Math.abs(pts[i].c - (pts[a].c + (pts[b].c - pts[a].c) * (pts[i].t - pts[a].t) / (pts[b].t - pts[a].t || 1)));
      if (dv > bestD) { best = i; bestD = dv; }
    }
    if (best < 0) return;
    keep.add(best); rdp(a, best); rdp(best, b);
  };
  rdp(0, pts.length - 1);
  return pts.filter((_, i) => keep.has(i));
}
// n.gain ([{t, l}], akao.mjs: vol × expression breakpoints from the note's
// start) at t; 1 without a series
function gainAt(g, t) {
  if (!g) return 1;
  let l = g[0].l;
  for (let i = 0; i < g.length; i++) {
    const a = g[i], b = g[i + 1];
    if (a.t > t) break;
    l = b && b.t > t && b.t > a.t ? a.l + (b.l - a.l) * (t - a.t) / (b.t - a.t) : a.l;
  }
  return l;
}
// the 0xAD–0xBF ADSR overrides on an instrument record: the rates as the SPU
// takes them; the mode bytes only where the record is INSTR.DAT's, whose mode
// bytes are the ones the override writes over (FF7's driver keeps both in one
// field) — a sample set's modes are unpacked from the SPU registers instead
function adsrOver(a, instr) {
  const o = {};
  for (const k of ["ar", "dr", "sl", "sr", "rr"]) if (a[k] !== undefined) o[k] = a[k];
  if (instr && instr.kind === "instr-dat") for (const k of ["am", "sm", "rm"]) if (a[k] !== undefined) o[k] = a[k];
  return o;
}

export function toNotesTxt(result, {title = "seq"} = {}) {
  const {notes, seq, vab, bends, source} = result;
  const {num, den} = seq.timeSigs[0];
  const lastTick = notes.reduce((m, n) => Math.max(m, n.endTick), seq.endTick);
  const bars = barBeat(seq, Math.max(0, lastTick - 1)).bar;
  const L = [];
  L.push(`# ${title} — ${num}/${den}, ${bpmOf(seq.tempo)}bpm, ${bars} bars, ${seq.ppq} ticks/quarter (from ${source ? source.label : "PS1 SEQ"})`);
  // a tempo slide is many small steps; one line per distinct bar keeps it readable
  let lastTempoBar = -1;
  for (const t of seq.tempoMap.slice(1)) {
    const {bar, beat} = barBeat(seq, t.tick);
    if (bar === lastTempoBar) { L[L.length - 1] = L[L.length - 1].replace(/ → .*$|$/, ` → ${bpmOf(t.usq)}bpm by beat ${fmt(beat)}`); continue; }
    L.push(`# tempo ${bpmOf(t.usq)}bpm from bar ${bar} beat ${fmt(beat)}`);
    lastTempoBar = bar;
  }
  for (const t of seq.timeSigs.slice(1)) { const {bar} = barBeat(seq, t.tick); L.push(`# meter ${t.num}/${t.den} from bar ${bar}`); }
  if (seq.loop) {
    const a = barBeat(seq, seq.loop.start), b = barBeat(seq, seq.loop.end);
    L.push(`# loop: bar ${a.bar} beat ${fmt(a.beat)} → bar ${b.bar} beat ${fmt(b.beat)}${seq.loop.count === 127 ? " (forever)" : " ×" + seq.loop.count}`);
  }
  for (const w of seq.warnings || []) L.push(`# note: ${w}`);
  L.push("# Format: bar N: beat pitch duration-in-quarter-notes vN [= MIDI velocity 1-127]");
  L.push(source ? `# ${source.pitchNote}` : vab
    ? "# Pitch = sample root + (key − tone center); root detected from the sample, or C4 assumed where marked. Kits keep their key numbers."
    : "# Pitch is the SEQ key as written (no bank given: tone center notes unknown).");
  L.push("# Channel identity is file fact. Pitches use sharp spelling; no key is stated.");
  const byCh = new Map();
  for (const n of splitSlides(notes)) (byCh.get(n.ch) || byCh.set(n.ch, []).get(n.ch)).push(n);
  for (const [ch, evs] of [...byCh].sort((a, b) => a[0] - b[0])) {
    L.push("");
    const progs = [...new Set(evs.map(n => n.program))];
    const voice = evs[0].voice !== undefined && evs[0].voice !== ch ? ` (voice ${evs[0].voice})` : "";
    L.push(`## channel ${ch + 1}${voice} program ${progs.join(",")}${evs.some(n => n.drum) ? " (kit)" : ""}`);
    if (bends[ch]) L.push(evs.some(n => n.slid) ? `# ${bends[ch]} pitch slides on this channel: each landed pitch is written as its own note` : `# ${bends[ch]} pitch-bend events on this channel, none inside a note`);
    if (vab) for (const p of progs) {
      const sample = evs.find(n => n.program === p && n.tone);
      if (!sample) { L.push(`# program ${p}: no tone answers these keys`); continue; }
      if (sample.drum) continue;
      const r = sample.root;
      L.push(`# program ${p}: tone center ${pitchName(sample.tone.center)}, sample root ${r ? `${pitchName(r.midi)}${r.cents ? (r.cents > 0 ? "+" : "") + r.cents + "c" : ""} (detected, r=${r.confidence})` : "C4 assumed (no clear period)"}`);
    }
    const rows = {};
    for (const n of evs) {
      const {bar, beat} = barBeat(seq, n.tick);
      const dur = (n.endTick - n.tick) / seq.ppq;
      if (dur <= 0) continue;
      const label = n.drum ? "K" + n.key : pitchName(n.pitch) + (n.cents ? (n.cents > 0 ? "+" : "") + n.cents + "c" : "");
      (rows[bar] = rows[bar] || []).push(`${fmt(beat)} ${label} ${fmt(dur)} v${n.vel}`);
    }
    for (const bar of Object.keys(rows).map(Number).sort((a, b) => a - b)) L.push("bar " + bar + ": " + rows[bar].join(", "));
  }
  return L.join("\n") + "\n";
}

// Percussion on the PS1 has no flag: AKAO's drum mode names a sample per
// degree (keys 24–35, which a GM player reads as twelve kicks), and many
// kit sounds are ordinary programs played at one or two "pitches" (FF7's
// hi-hat is program 36 at 72–79, in 24 songs). Night Roll plays MIDI channel
// 10 through a GM-keyed kit, so a capture needs GM keys. The rules, per
// song, nothing game-specific:
//   1. a note in drum mode is percussion; so is every note of a program that
//      appears in drum mode anywhere in the song;
//   2. a program played at exactly one pitch over ≥ 12 notes is percussion
//      (two pitches is an ostinato — Bombing Mission's bass runs on two);
//   3. each percussion voice (program + source key) gets a GM key from its
//      rhythm: the voice that sits on beats 2 and 4 is the snare, the one on
//      1 and 3 the kick, the busiest remaining one the closed hat, then open
//      hat, ride, toms by source pitch; a sparse voice mostly on beat 1 is a
//      crash. The guess is reported in result.kitGuess (and the warnings).
// (Josh, 2026-09-27, FF7 Bombing Mission: "all the correct notes are there
// in the right timing but there's some other noise going on".)
export function kitify(result) {
  const {notes, seq} = result;
  if (result.kitGuess) return result.kitGuess; // idempotent
  const drumProgs = new Set(notes.filter(n => n.drum).map(n => n.program));
  const byProg = new Map();
  for (const n of notes) (byProg.get(n.program) || byProg.set(n.program, []).get(n.program)).push(n);
  for (const [p, evs] of byProg) {
    if (drumProgs.has(p)) continue;
    const pitches = new Set(evs.map(n => n.pitch));
    if (evs.length >= 12 && pitches.size === 1) drumProgs.add(p);
  }
  const perc = notes.filter(n => n.drum || drumProgs.has(n.program));
  const guess = [];
  if (!perc.length) { result.kitGuess = guess; return guess; }
  // a kit that already speaks GM (a VAB kit keyed 35+) keeps its keys; drum-mode
  // degrees (24–35) and promoted programs need a GM key
  const needs = perc.filter(n => !n.drum || n.key < 35);
  for (const n of perc) n.drum = true;
  if (!needs.length) { result.kitGuess = guess; return guess; }
  // voices: program + the key as written (drum mode: the degree key; else the pitch)
  const voices = new Map();
  for (const n of needs) { const k = n.program + ":" + n.key; (voices.get(k) || voices.set(k, {program: n.program, key: n.key, notes: []}).get(k)).notes.push(n); }
  const ts = seq.timeSigs && seq.timeSigs[0] || {num: 4, den: 4};
  const list = guessKit([...voices.values()], {beatTicks: seq.ppq * 4 / ts.den, barBeats: ts.num}); // tools/kit-guess.mjs: the rhythm rules, shared with the N64 path
  for (const v of list) { for (const n of v.notes) n.gm = v.gm; guess.push({program: v.program, key: v.key, gm: v.gm, label: v.label, notes: v.count}); }
  guess.sort((a, b) => a.program - b.program || a.key - b.key);
  result.kitGuess = guess;
  (seq.warnings || (seq.warnings = [])).push("kit guessed from rhythm: " + guess.map(g => "prog " + g.program + (drumProgs.size ? "" : "") + " K" + g.key + " → " + g.label).join(", "));
  return guess;
}

// The MIDI's tracks, before bytes: one per source channel, a channel's kit
// notes split off — the names the renderer (spu-render.mjs) must match, so
// the app can pair each rendered channel with its track
export function channelGroups(result) {
  kitify(result);
  const byCh = new Map();
  for (const n of result.notes) (byCh.get(n.ch) || byCh.set(n.ch, []).get(n.ch)).push(n);
  const progsOf = evs => [...new Set(evs.map(n => n.program))].join(",");
  const out = [];
  for (const [ch, evs] of [...byCh].sort((a, b) => a[0] - b[0])) {
    const kit = evs.filter(n => n.drum), mel = evs.filter(n => !n.drum);
    if (mel.length) out.push({name: `ch ${ch + 1} prog ${progsOf(mel)}`, notes: mel, ch, kit: false});
    if (kit.length) out.push({name: `ch ${ch + 1} prog ${progsOf(kit)}${mel.length ? " kit" : ""}`, notes: kit, ch, kit: true});
  }
  return out;
}
// type-1 MIDI: conductor (tempo map + meters) then one track per SEQ
// channel; kit programs land on MIDI channel 10 (index 9)
// A note's pan, 0..127 (64 centre): the voice's 0xAA value at note-on; a kit
// entry's own pan from the drum map. 64 when the score never says.
export function notePan(n) {
  const p = n.drum && n.tone && n.tone.pan != null ? n.tone.pan : n.pan;
  return p == null ? 64 : Math.max(0, Math.min(127, p));
}
// offsets: {[group.name]: {offset, ...}} from tools/sounding.mjs, already
// APPLIED to result.notes' `pitch` by applySoundingOffsets — makeMidi only
// needs it here to write the per-track meta event that says by how much
// (offsetMetaEvent), for the tap preview to read back.
export function makeMidi(result, {offsets} = {}) {
  kitify(result);
  const {notes, seq} = result;
  const scale = PPQ / seq.ppq;
  const T = tick => Math.round(tick * scale);
  // envelopes: from the instrument table when the capture found one (each
  // note's level at its own end, per its instrument's SPU ADSR); a generic
  // decay for long notes only when no table is known, said in the warnings
  const instr = result.instr || null;
  const recs = new Map();
  // a capture's instrument handle (akao.mjs akaoInstrContext: INSTR.DAT or
  // the image's sample sets, by the note's articulation), or a bare {ram, offset}
  const recOf = n => {
    if (!instr) return null;
    if (instr.kind) return akaoRecord(instr, n);
    if (!recs.has(n.program)) recs.set(n.program, readInstr(instr.ram, instr.offset, n.program));
    return recs.get(n.program);
  };
  const akao = !!(result.source && result.source.kind === "akao");
  const ps2 = !akao && result.ps2 && (result.ps2.kind === "sq" || result.ps2.kind === "bgm") ? result.ps2 : null;
  const veOf = n => {
    const t0 = T(n.tick), d = Math.max(1, T(n.endTick) - t0), v = Math.max(1, Math.min(127, n.vel));
    if (n.drum) return undefined;
    if (instr) {
      const rec = recOf(n);
      if (!rec) return undefined;
      const frac = envelopeAt(rec, secondsAt(seq, n.endTick) - secondsAt(seq, n.tick));
      return frac < 0.97 ? Math.max(1, Math.round(v * Math.max(frac, 0.01))) : undefined;
    }
    return d >= PPQ * 2 ? Math.max(1, Math.round(v * 0.12)) : undefined;
  };
  if (!instr && notes.some(n => !n.drum && T(n.endTick) - T(n.tick) >= PPQ * 2) && !(seq.warnings || []).some(w => /no instrument table/.test(w)))
    (seq.warnings || (seq.warnings = [])).push("no instrument table found: long notes decay to 12% by their end (a guess)");
  const metas = [];
  for (const ts of seq.timeSigs) metas.push({t: T(ts.tick), d: [0xFF, 0x58, 4, ts.num, Math.round(Math.log2(ts.den)), 24, 8]});
  for (const tm of seq.tempoMap) metas.push({t: T(tm.tick), d: [0xFF, 0x51, 3, (tm.usq >> 16) & 255, (tm.usq >> 8) & 255, tm.usq & 255]});
  const tracks = [trackBytes("conductor", [], 0, metas)];
  const byCh = new Map();
  for (const n of notes) (byCh.get(n.ch) || byCh.set(n.ch, []).get(n.ch)).push(n);
  // MIDI channel per source channel: SEQ channels 0..15 keep their number
  // (file fact), except that a melodic channel 9 would land on GM drums;
  // AKAO voices run to 24, so those beyond 15 take free channels and then
  // share — a type-1 file keeps them apart as tracks either way
  const used = new Set([9]);
  const order = [...byCh].sort((a, b) => a[0] - b[0]);
  const midiCh = new Map();
  for (const [ch, evs] of order) if (!evs.every(n => n.drum) && ch < 16 && ch !== 9) { midiCh.set(ch, ch); used.add(ch); }
  let spare = 0;
  for (const [ch, evs] of order) {
    if (evs.every(n => n.drum)) midiCh.set(ch, 9);
    else if (!midiCh.has(ch)) {
      let c = [...Array(16).keys()].find(k => !used.has(k));
      if (c === undefined) { c = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15][spare++ % 15]; }
      midiCh.set(ch, c); used.add(c);
    }
  }
  // an AKAO voice can switch drum mode on and off mid-track; its kit notes
  // go to a second MIDI track on channel 10 so neither side lies about
  // what it is
  const emit = (name, evs, ch, offset, kit) => {
    if (akao) return emitAkao(name, evs, ch, offset, kit);
    if (ps2) return emitPs2(name, evs, ch, offset, kit);
    const out = [], cc = [];
    if (offset) cc.push(offsetMetaEvent(offset));
    if (kit) cc.push(kitMetaEvent()); // channel 10 survives the app's re-write whatever the group's name
    // the track's pan as CC10: the first note's at tick 0, then one at every note whose pan differs from the last written
    let lastPan = null;
    for (const n of splitSlides(evs)) {
      const p = n.drum ? (n.gm || n.key) : n.pitch;
      if (p < 0 || p > 127) continue;
      const t = T(n.tick);
      const d = Math.max(1, T(n.endTick) - t), v = Math.max(1, Math.min(127, n.vel));
      const ve = veOf(n); // the note's level at its end, from its instrument's envelope (the app's ve, as chip captures carry)
      out.push(ve !== undefined ? {t, d, p, v, ve} : {t, d, p, v});
      const pan = notePan(n);
      if (pan !== lastPan) { cc.push({t: lastPan === null ? 0 : t, o: -0.5, d: [0xB0 | ch, 10, pan]}); lastPan = pan; }
    }
    tracks.push(trackBytes(name, out, ch, cc));
  };
  // PS1 capture v2 (AKAO only; a SEQ or PS2 capture writes the bytes it
  // always did): what the driver does to the sounding voice, from the score
  // (NIGHT-ROLL.md "PS1 capture v2") —
  //   lg     a note the driver does not key on (slur's next note, a slide's
  //          landed pitch, a portamento note) → CC84 (trackBytes);
  //   bend   the voice's pitch path, chain-relative (chainBends): a slide
  //          (0xA4) or portamento glide (0xDA) is a straight line in the SPU
  //          pitch register over its length (the driver adds (target − now)
  //          / len every tick), measured from the piece's own key;
  //   level  vel, ve and the in-note shape from vol × expression (n.gain)
  //          and the ADSR (the instrument's, with the 0xAD–0xBF overrides),
  //          timed from the chain's key-on — a continuation does not
  //          restart the envelope, so its velocity is the level it has;
  //   prog   the articulation each melodic note plays;
  //   rev    CC91: the voice's reverb switch × the song's depth;
  //   pan    CC10 at each note-on (as before) and along a 0xAB fade.
  const emitAkao = (name, evs, ch, offset, kit) => {
    const out = [], cc = [];
    if (offset) cc.push(offsetMetaEvent(offset));
    if (kit) cc.push(kitMetaEvent());
    let lastPan = null, head = null, prevEnd = null;
    const sec = tick => secondsAt(seq, tick);
    const paths = new Map();
    for (const n of splitSlides(evs)) {
      const n0 = n.whole || n, rel = n.tick - n0.tick, len = n.endTick - n0.tick;
      const p = n.drum ? (n.gm || n.key) : n.pitch;
      if (p < 0 || p > 127) continue;
      const t = T(n.tick), d = Math.max(1, T(n.endTick) - t);
      // a link the writer could not make (nothing ends here) is a key-on
      const lg = !n.drum && (rel > 0 || !!n0.lg) && !!head && prevEnd === n.tick;
      if (!lg) head = n;
      prevEnd = n.endTick;
      const o = {t, d, p, v: Math.max(1, Math.min(127, n.vel))};
      if (!n.drum) {
        // the level in velocity units: vol × expression against the
        // note-on's, × the envelope since the chain's key-on (no instrument
        // table: the old guessed decay for long notes, no envelope)
        const g = n0.gain, rec = instr ? recOf(n0) : null;
        const rec1 = rec && n0.adsr ? {...rec, ...adsrOver(n0.adsr, instr)} : rec;
        const G = tt => gainAt(g, tt) / (gainAt(g, 0) || 1);
        const L = tt => n0.vel * G(tt) * (rec1 ? envelopeAt(rec1, sec(n0.tick + tt) - sec(head.tick)) : 1);
        const v = Math.max(1, Math.min(127, Math.round(L(rel))));
        o.v = v;
        const end = L(len);
        if (!instr) { const ve = veOf(n); if (ve !== undefined) o.ve = ve; }
        else if (rec1 && end / v < 0.97) o.ve = Math.max(1, Math.round(Math.max(end, v * 0.01)));
        if (g && g.some(q => q.t > rel && q.t < len)) {
          const k1 = n.endTick - n.tick, series = [];
          for (let k = 0; k <= k1; k++) series.push([k, L(rel + k)]);
          const env = shapeFromSeries({volSeries: series, startFrame: 0, endFrame: k1, vol: v}, v, d, PPQ / seq.ppq, 127, {falls: true, tol: 2, floor: 0});
          if (env) o.env = env;
        }
      }
      if (lg) o.lg = 1;
      if (!n.drum) {
        // the piece's pitch from its own key, in cents, along the note's path
        if (!paths.has(n0)) paths.set(n0, pitchPath(n0));
        const {at, ramps} = paths.get(n0), off = n.off || 0, pts = [];
        const add = tt => {
          const c = Math.round((at(tt) - off) * 100), q = {t: T(n0.tick + tt) - t, c}, last = pts[pts.length - 1];
          if (last && last.t === q.t) last.c = c; else if (last ? last.c !== c : c !== 0) pts.push(q);
        };
        add(rel);
        for (const r of ramps) for (let k = 0; k <= r.len; k++) { const tt = r.t + k; if (tt > rel && tt < len) add(tt); }
        const thin = rdpCents(pts);
        if (thin.length) o.bend = thin;
        o.c0 = n0.cents || 0;
        const art = akaoArtOf(n0);
        if (art >= 0 && art <= 127) o.prog = art;
      }
      if (n0.rev) {
        let first = n0.rev[0].v;
        for (const q of n0.rev) if (q.t <= rel) first = q.v;
        o.rev = [{t: 0, v: first}];
        for (const q of n0.rev) if (q.t > rel && q.t < len) o.rev.push({t: T(n0.tick + q.t) - t, v: q.v});
      }
      out.push(o);
      // pan: the note-on's (as before), then along a fade under it
      let pan = notePan(n);
      const pp = !n.drum && n0.panPts;
      if (pp) for (const q of pp) if (q.t <= rel) pan = q.v;
      if (pan !== lastPan) { cc.push({t: lastPan === null ? 0 : t, o: -0.5, d: [0xB0 | ch, 10, pan]}); lastPan = pan; }
      if (pp) for (const q of pp) if (q.t > rel && q.t < len && q.v !== lastPan) { cc.push({t: T(n0.tick + q.t), o: 1.25, d: [0xB0 | ch, 10, q.v]}); lastPan = q.v; }
    }
    chainBends(out);
    let most = 0; // a loop, not a spread: an unrolled ambience carries more points than the stack holds
    for (const q of out) for (const b of q.bend || []) most = Math.max(most, Math.abs(b.c));
    const semis = most > 200 ? Math.min(24, Math.ceil(most / 100)) : 2;
    for (const q of out) if (q.bend) q.bend = q.bend.map(b => ({t: b.t, v: Math.max(-8192, Math.min(8191, Math.round(b.c / (semis * 100) * 8192)))}));
    tracks.push(trackBytes(name, out, ch, semis > 2 ? [...cc, ...bendRangeMetas(ch, semis)] : cc));
  };
  // PS2 capture v2 (Sony SQ/HD/BD and Square's BGM/WD; a PS1 SEQ writes the
  // bytes it always did) — the notes are v1's, and around them what the
  // sequence and the driver do to the sounding voice (NIGHT-ROLL.md "PS2
  // capture v2"):
  //   bend   the channel's wheel, raw, at the driver's own range: SQ from the
  //          split the note plays (modhsyn.irx: range × wheel ÷ 8192, in
  //          128ths of a semitone, the down range below centre), BGM from
  //          0x5D (ffxpatch.irx: wheel × range ÷ 32, in 256ths); measured
  //          from each piece's own key, so a bend-born split piece (BGM's
  //          ±2 roll pitch, as v1) continues its predecessor's path
  //   lg     those split pieces: one note-on in the score, never re-keyed
  //   CC7/11/64/1  the channel's own controller stream (the console's
  //          default 127 at tick 0 where a channel sends any CC7/CC11)
  //   CC10   v1's note-on pan plus each change while a note sounds
  //   prog   the program each melodic note plays
  //   CC91   the voice's wet (effect) send: SQ the sample's SPU mix bits ×
  //          the ini's EVOL depth; BGM 0x60 on / 0x61 off
  const streams = new Map();
  if (ps2) {
    const S_ = c => streams.get(c) || streams.set(c, {cc: new Map(), off: [], rev: [], pbRaw: []}).get(c);
    const raw = new Map(), rng = new Map();
    for (const e of seq.events) {
      if (e.ch == null) continue;
      if (e.type === "cc") { const m = S_(e.ch).cc; (m.get(e.ctl) || m.set(e.ctl, []).get(e.ctl)).push({tick: e.tick, v: e.value}); }
      else if (e.type === "bend") S_(e.ch).pbRaw.push({tick: e.tick, v: e.value});
      else if (e.type === "reverb") S_(e.ch).rev.push({tick: e.tick, v: e.on ? 127 : 0});
      if (ps2.kind === "bgm" && (e.type === "bend" || e.type === "bendRange")) {
        if (e.type === "bend") raw.set(e.ch, e.value); else rng.set(e.ch, e.value);
        const r = rng.get(e.ch), v = raw.get(e.ch) || 0;
        S_(e.ch).off.push({tick: e.tick, c: r === undefined ? (v ? null : 0) : ((v * r) >> 5) / 256 * 100});
      }
    }
  }
  const at = (list, tick, dflt) => { let v = dflt; for (const q of list) { if (q.tick > tick) break; v = q.v !== undefined ? q.v : q.c; } return v; };
  const rv = ps2 && ps2.reverb || null;
  const wetSend = rv && rv.mode && rv.depth ? Math.round(Math.min(1, Math.abs(rv.depth) / 0x7FFF) * 127) : 0;
  const unknownRange = new Set();
  let clamped = 0;
  const emitPs2 = (name, evs, ch, offset, kit) => {
    const out = [], cc = [];
    if (offset) cc.push(offsetMetaEvent(offset));
    if (kit) cc.push(kitMetaEvent());
    const src = evs[0].ch, st = streams.get(src) || {cc: new Map(), off: [], rev: [], pbRaw: []};
    const pans = [];
    let lastPan = null, prevEnd = null, prevWhole = null;
    for (const n of splitSlides(evs)) {
      const p = n.drum ? (n.gm || n.key) : n.pitch;
      if (p < 0 || p > 127) continue;
      const t = T(n.tick);
      const d = Math.max(1, T(n.endTick) - t), v = Math.max(1, Math.min(127, n.vel));
      const ve = veOf(n);
      const o = ve !== undefined ? {t, d, p, v, ve} : {t, d, p, v};
      const n0 = n.whole || n, off = n.off || 0;
      if (!n.drum) {
        // a bend-born piece after the first: the same note-on, never re-keyed
        if (n.whole && n.tick > n0.tick && prevWhole === n0 && prevEnd === n.tick) o.lg = 1;
        // the wheel in cents from this piece's own key: its value at the
        // start, then each change while it sounds
        let cents = null;
        if (ps2.kind === "sq") {
          const tone = result.vab ? tonesFor(result.vab, n0.program, n0.key)[0] : null;
          if (tone && tone.bendLow != null) cents = q => Math.trunc((q.v >= 0 ? tone.bendHigh : tone.bendLow) * q.v / 8192) / 128 * 100;
        } else cents = q => q.c;
        const list = ps2.kind === "sq" ? st.pbRaw : st.off;
        if (cents && list.length) {
          const pts = [];
          let unknown = false;
          const add = (tick, q) => {
            let c = q ? cents(q) : 0;
            if (c === null) { unknown = true; return; }
            c = Math.round(c - off * 100);
            const qq = {t: T(tick) - t, c}, last = pts[pts.length - 1];
            if (last && last.t === qq.t) last.c = c; else if (last ? last.c !== c : c !== 0) pts.push(qq);
          };
          let held = null;
          for (const q of list) { if (q.tick > n.tick) break; held = q; }
          add(n.tick, held);
          for (const q of list) if (q.tick > n.tick && q.tick < n.endTick) add(q.tick, q);
          if (unknown) unknownRange.add(src); // the whole note: a path with a hole in it would be a guess
          else if (pts.length) o.bend = pts;
        }
        o.c0 = n0.cents || 0;
        if (n0.program >= 0 && n0.program <= 127) o.prog = n0.program;
        prevEnd = n.endTick; prevWhole = n0;
      }
      // the wet send
      if (ps2.kind === "sq") {
        const tone = result.vab ? tonesFor(result.vab, n0.program, n0.key)[0] : null;
        if (tone && tone.spuAttr != null) o.rev = [{t: 0, v: tone.spuAttr & 0xC ? wetSend : 0}];
      } else if (st.rev.length && st.rev[0].tick <= n.tick) {
        o.rev = [{t: 0, v: at(st.rev, n.tick, 0)}];
        for (const q of st.rev) if (q.tick > n.tick && q.tick < n.endTick) o.rev.push({t: T(q.tick) - t, v: q.v});
      }
      out.push(o);
      const pan = notePan(n);
      if (pan !== lastPan) { pans.push({t: lastPan === null ? 0 : t, o: -0.5, v: pan}); lastPan = pan; }
    }
    // pan while a note sounds (v1 wrote only note-on values)
    const cc10 = st.cc.get(10) || [];
    for (const q of cc10) if (evs.some(n => !n.drum && n.tick < q.tick && n.endTick > q.tick)) pans.push({t: T(q.tick), o: 1.25, v: q.v});
    pans.sort((a, b) => a.t - b.t || a.o - b.o);
    let pv = null;
    for (const q of pans) if (q.v !== pv) { cc.push({t: q.t, o: q.o, d: [0xB0 | ch, 10, q.v]}); pv = q.v; }
    // the channel's controllers over this track's span
    const first = evs.reduce((m, n) => Math.min(m, n.tick), Infinity), last = evs.reduce((m, n) => Math.max(m, n.endTick), 0); // no spread: a track can outgrow the stack
    for (const [c, dflt] of [[7, 127], [11, 127], [64, 0], [1, 0]]) {
      const list = st.cc.get(c) || [];
      if (!list.length) continue;
      let cur = at(list, first, dflt);
      cc.push({t: 0, o: -0.5, d: [0xB0 | ch, c, cur]});
      for (const q of list) if (q.tick > first && q.tick < last && q.v !== cur) { cc.push({t: T(q.tick), o: 0.75, d: [0xB0 | ch, c, q.v]}); cur = q.v; }
    }
    chainBends(out);
    let most = 0;
    for (const q of out) for (const b of q.bend || []) most = Math.max(most, Math.abs(b.c));
    const semis = most > 200 ? Math.min(24, Math.ceil(most / 100)) : 2;
    if (most > 2400) clamped++;
    for (const q of out) if (q.bend) q.bend = q.bend.map(b => ({t: b.t, v: Math.max(-8192, Math.min(8191, Math.round(b.c / (semis * 100) * 8192)))}));
    tracks.push(trackBytes(name, out, ch, semis > 2 ? [...cc, ...bendRangeMetas(ch, semis)] : cc));
  };
  for (const g of channelGroups(result)) emit(g.name, g.notes, g.kit ? 9 : midiCh.get(g.ch), !g.kit && offsets && offsets[g.name] ? offsets[g.name].offset : 0, g.kit);
  const warn = w => { const ws = seq.warnings || (seq.warnings = []); if (!ws.includes(w)) ws.push(w); };
  if (unknownRange.size) warn(`channel(s) ${[...unknownRange].map(c => c + 1).join(", ")} bend before their first bend range (0x5D): the driver's default range is not known, so those bends are not written`);
  if (clamped) warn(`${clamped} track(s) bend past ±24 semitones: their pitch bend is clipped at ±24 in the .mid`);
  const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const bytes = [0x4D, 0x54, 0x68, 0x64, ...u32(6), 0, 1, 0, tracks.length, PPQ >> 8, PPQ & 255];
  for (const t of tracks) { bytes.push(0x4D, 0x54, 0x72, 0x6B, ...u32(t.length)); for (const b of t) bytes.push(b); } // no spread: a track can outgrow the stack
  return new Uint8Array(bytes);
}
