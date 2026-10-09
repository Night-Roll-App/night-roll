// src/theory/facts/common.js — shared plumbing for the music-theory FACTS
// toolkit (docs/theory-toolkit.md). Layer 0, pure: no S, no DOM. Every
// function takes a `doc` and returns plain JSON-able data.
//
// doc shape (what tools/query-lib.mjs loadSong() returns; an in-app adapter
// builds the same from S.song/S.rollnotes — see docs/theory-toolkit.md):
//   { ppq, barTicks, beatTicks,
//     tracks: [{ name, notes: [{t, d, p, v}] }],     // ticks; gone notes already dropped
//     rollnotes?: [{ chord, section, keydir, start, end, text, ... }] }
//
// Learning mode is the law (CLAUDE.md): nothing here names a key, a chord,
// a roman numeral or a meter. Pitches are spelled with the app's key-neutral
// sharps unless the caller passes a signed-fifths `sf` — which may only ever
// be the user's OWN declared key (factsDeclaredSf reads his key: annotation),
// never an estimate. barTicks/beatTicks come from the app's effective-meter
// helpers (model/grid.js effTs) via the doc; the toolkit never declares one.
import { keySpelling } from "../chords.js";

export const FACTS_SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function factsPc(p) { return ((p % 12) + 12) % 12; }
export function factsPcName(pc, sf = null) {
  if (sf === null || sf === undefined) return FACTS_SHARP_NAMES[factsPc(pc)];
  const s = keySpelling(sf)[factsPc(pc)];
  return s.letter + (s.acc || "");
}
export function factsPitch(p, sf = null) { return factsPcName(p, sf) + (Math.floor(p / 12) - 1); }

// "bar.beat" — beat is 1-based in the doc's beat unit, at most two decimals
export function factsBQ(doc, tick) {
  const bar = Math.floor(tick / doc.barTicks) + 1;
  const beat = (tick - (bar - 1) * doc.barTicks) / doc.beatTicks + 1;
  const r = Math.round(beat * 100) / 100;
  return bar + "." + r;
}
export function factsTick(doc, bar, beat = 1) { return (bar - 1) * doc.barTicks + (beat - 1) * doc.beatTicks; }
// "2.4" / "2.4.5" (bar 2, beat 4.5) — the same grammar tools/query-lib.mjs parseBQ reads
export function factsParseBQ(doc, s) {
  const parts = String(s).split(".");
  const bar = parseInt(parts[0], 10);
  const beat = parts.length > 1 ? parseFloat(parts.slice(1).join(".")) || 1 : 1;
  return factsTick(doc, bar, beat);
}
export function factsQuarters(doc, ticks) { return Math.round(ticks / doc.ppq * 1000) / 1000; }

// model/grid.js trackIsDrums, rule for rule: an audio take is never a kit,
// a track already flagged `drums` wins, else the name or MIDI channel 10
// (tools/query-lib.mjs isDrumTrack knows the name and the "kit:1" marker — its docs carry
// `ch` so the channel rule holds there too)
export function factsIsDrums(track) {
  if (!track) return false;
  if (track.kind === "audio") return false;
  if (track.drums !== undefined) return !!track.drums;
  return /drum|percussion|kit|noise|dpcm/i.test(track.name || "") || (track.notes || []).some(n => n.ch === 9);
}

export function factsEndTick(doc) {
  let end = 0;
  for (const tr of doc.tracks) for (const n of tr.notes) if (n.t + n.d > end) end = n.t + n.d;
  return end;
}
export function factsBarCount(doc) { return Math.max(1, Math.ceil(factsEndTick(doc) / doc.barTicks)); }
// bars up to the last ONSET — a final note ringing past a bar line does not
// make an empty trailing bar (form's units would otherwise end in "-")
export function factsOnsetBarCount(doc) {
  let last = 0;
  for (const tr of doc.tracks) for (const n of tr.notes) if (n.t > last) last = n.t;
  return Math.max(1, Math.floor(last / doc.barTicks) + 1);
}

// Track selection. `track`: a name, a 0-based index (number or numeric
// string), or an array of those; undefined → every non-drum track
// (`drums: true` keeps them). Returns [{ti, name, notes, drums}].
export function factsTracks(doc, {track, drums = false} = {}) {
  const want = track === undefined || track === null ? null : (Array.isArray(track) ? track : [track]).map(String);
  const out = [];
  doc.tracks.forEach((tr, ti) => {
    const isDrum = factsIsDrums(tr);
    const picked = want ? want.includes(String(ti)) || want.includes(tr.name || "") : !isDrum || drums;
    if (picked) out.push({ti, name: tr.name || ("track " + ti), notes: factsSorted(tr.notes), drums: isDrum});
  });
  if (want && !out.length) throw new Error("no track named " + want.join("/") + " — tracks here: " + doc.tracks.map((t, i) => i + ":" + (t.name || "")).join(", "));
  return out;
}
export function factsSorted(notes) { return [...notes].sort((a, b) => a.t - b.t || b.p - a.p); }
// notes whose ONSET falls in [from, to) — ticks; null bounds are open
export function factsSpan(notes, from = null, to = null) {
  return notes.filter(n => (from === null || n.t >= from) && (to === null || n.t < to));
}
// onset stacks: notes sharing a start tick, highest first
export function factsStacks(notes) {
  const stacks = [];
  for (const n of factsSorted(notes)) {
    const last = stacks[stacks.length - 1];
    if (last && last[0].t === n.t) last.push(n); else stacks.push([n]);
  }
  return stacks;
}
// one note per onset, the highest — a chordal track's top line
export function factsTopLine(notes) { return factsStacks(notes).map(s => s[0]); }
export function factsBottomLine(notes) { return factsStacks(notes).map(s => s[s.length - 1]); }
// rank voices: voice 0 = the top note of every stack, voice 1 = the second
// from the top where a stack has one, … — a cheap but predictable
// separation (a sparse inner voice stays sparse rather than stealing notes)
export function factsVoices(notes) {
  const stacks = factsStacks(notes);
  const depth = stacks.reduce((m, s) => Math.max(m, s.length), 0);
  const voices = [];
  for (let k = 0; k < depth; k++) voices.push(stacks.filter(s => s.length > k).map(s => s[k]));
  return voices;
}
// every searchable monophonic line of the selected tracks: a monophonic
// track is one line; a polyphonic one yields its rank voices (voice 0 is
// the top line). `voice` restricts to one rank.
export function factsLines(doc, opts = {}) {
  const out = [];
  for (const tr of factsTracks(doc, opts)) {
    const voices = factsVoices(tr.notes);
    voices.forEach((notes, k) => {
      if (opts.voice !== undefined && opts.voice !== null && Number(opts.voice) !== k) return;
      out.push({ti: tr.ti, track: tr.name, voice: voices.length > 1 ? k : null, notes});
    });
  }
  return out;
}
// the pitch sounding at tick t in a (monophonic) line: the latest note that
// starts at or before t and is still ringing; null in a rest
export function factsSoundingAt(line, t) {
  let hit = null;
  for (const n of line) { if (n.t > t) break; if (n.t + n.d > t) hit = n; }
  return hit;
}
// the user's own declared key (a key: annotation's signed fifths) in effect
// at `tick` — spelling only; null when none, which means neutral sharps.
// Same precedence as model/song.js sfDeclaredAtRaw: a ranged key (b2 set)
// governs only inside its span and beats an open one there; otherwise the
// latest open key. `.end` alone cannot tell them apart — the lane layout
// gives every point annotation a drawn `.end` — so b2 decides.
export function factsDeclaredSf(doc, tick = 0) {
  if (!doc.rollnotes) return null;
  let ranged = null, open = null;
  for (const n of doc.rollnotes) {
    if (typeof n.keydir !== "number" || n.start > tick) continue;
    if (n.b2) { if (tick < n.end && (!ranged || n.start >= ranged.start)) ranged = n; }
    else if (!open || n.start >= open.start) open = n;
  }
  const cur = ranged || open;
  return cur ? cur.keydir : null;
}
// the user's chord bands, in time order — spans only; their text is never
// read by the toolkit (harmonic rhythm counts changes, never names chords).
// A band is a chord annotation WITH a range (b2): a point chord note gets a
// drawn `.end` from the lane layout too, and that is not a band.
export function factsChordSpans(doc) {
  if (!doc.rollnotes) return [];
  return doc.rollnotes.filter(n => n.chord && n.b2 && n.end !== null && n.end !== undefined && n.end > n.start)
    .map(n => ({start: n.start, end: n.end})).sort((a, b) => a.start - b.start || a.end - b.end);
}
export function factsAbsSemis(a, b) { return Math.abs(a - b); }
// repeated / step / leap by semitones — the vocabulary every facts module shares
export function factsMotionKind(semis) { return semis === 0 ? "repeated" : semis <= 2 ? "step" : "leap"; }
