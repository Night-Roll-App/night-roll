// src/theory/facts/form.js — repetition and form by SIMILARITY alone
// (docs/theory-toolkit.md §2): bar / half-bar units compared as event lists
// (track, offset, duration, pitch); exact, transposed (by a constant
// interval) and rhythm-only (same onsets+durations, pitches not a uniform
// shift) repeats; phrases labelled A, A′, B… by the same comparison; and
// sequences — a unit restated at successive transpositions. Letters are
// equivalence classes, not musical judgments. Pure.
import { factsTracks, factsBQ, factsOnsetBarCount, factsParseBQ } from "./common.js";

// no i, v or x: "I V" phrase labels would read as roman numerals, which
// this toolkit never writes
export const FACTS_LABEL_LETTERS = "abcdefghjklmnopqrstuwyz";
export function factsLetter(i, upper = false) {
  const N = FACTS_LABEL_LETTERS.length;
  let s = "";
  do { s = FACTS_LABEL_LETTERS[i % N] + s; i = Math.floor(i / N) - 1; } while (i >= 0);
  return upper ? s.toUpperCase() : s;
}

// the events of [start, end) across `tracks` (factsTracks output), offsets
// relative to start, sorted so two statements of one figure line up
export function factsUnitEvents(tracks, start, end) {
  const ev = [];
  for (const tr of tracks) for (const n of tr.notes) {
    if (n.t < start) continue;
    if (n.t >= end) break; // notes are sorted by onset
    ev.push({ti: tr.ti, off: n.t - start, d: n.d, p: n.p});
  }
  return ev.sort((a, b) => a.ti - b.ti || a.off - b.off || a.p - b.p);
}

// exact | transposed (every pitch shifted by the same non-zero interval) |
// rhythm (same track/onset/duration list, pitches not a uniform shift) | none
export function factsUnitRelation(a, b, {onsetsOnly = false} = {}) {
  if (a.length !== b.length) return {kind: "none", interval: null};
  if (!a.length) return {kind: "exact", interval: 0};
  let interval = null, uniform = true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].ti !== b[i].ti || a[i].off !== b[i].off || (!onsetsOnly && a[i].d !== b[i].d)) return {kind: "none", interval: null};
    const dp = b[i].p - a[i].p;
    if (interval === null) interval = dp; else if (dp !== interval) uniform = false;
  }
  if (uniform) return interval === 0 ? {kind: "exact", interval: 0} : {kind: "transposed", interval};
  return {kind: "rhythm", interval: null};
}

// the song cut into equal units of `unitTicks` from `from` to `to`
export function factsUnits(doc, tracks, unitTicks, from = 0, to = null) {
  const end = to === null ? factsOnsetBarCount(doc) * doc.barTicks : to;
  const units = [];
  for (let s = from, i = 0; s < end; s += unitTicks, i++)
    units.push({index: i, start: s, end: s + unitTicks, at: factsBQ(doc, s), events: factsUnitEvents(tracks, s, s + unitTicks)});
  return units;
}

// Letters by first appearance: exact → the letter; transposed → letter′;
// rhythm-only → letter″ (each compared to the class's FIRST statement);
// an empty unit is "-". `rel` keeps the kind and interval.
export function factsLabelUnits(units, {upper = false, onsetsOnly = false} = {}) {
  const classes = []; // exemplar events per letter
  return units.map(u => {
    if (!u.events.length) return {...u, label: "-", rel: {kind: "empty", interval: null, of: null}};
    let best = null;
    const rank = {exact: 0, transposed: 1, rhythm: 2};
    classes.forEach((ex, ci) => {
      const r = factsUnitRelation(ex.events, u.events, {onsetsOnly});
      if (r.kind === "none") return;
      if (!best || rank[r.kind] < rank[best.kind]) best = {...r, ci, of: ex.at}; // ties keep the earliest class
    });
    if (!best) { classes.push(u); return {...u, label: factsLetter(classes.length - 1, upper), rel: {kind: "new", interval: null, of: null}}; }
    const mark = best.kind === "exact" ? "" : best.kind === "transposed" ? "′" : "″";
    return {...u, label: factsLetter(best.ci, upper) + mark, rel: {kind: best.kind, interval: best.interval, of: best.of}};
  });
}

// every unit's EARLIEST earlier match (exact beats transposed beats rhythm)
export function factsRepeats(units, {onsetsOnly = false} = {}) {
  const out = [];
  const rank = {exact: 0, transposed: 1, rhythm: 2};
  units.forEach((u, i) => {
    if (!u.events.length) return;
    let best = null;
    for (let j = 0; j < i; j++) {
      const r = factsUnitRelation(units[j].events, u.events, {onsetsOnly});
      if (r.kind === "none") continue;
      if (!best || rank[r.kind] < rank[best.kind]) best = {at: u.at, of: units[j].at, kind: r.kind, interval: r.interval};
      if (best.kind === "exact") break;
    }
    if (best) out.push(best);
  });
  return out;
}

// chains unit → unit at successive NON-ZERO transpositions, ≥ minStatements
// long, for each unit size in unitBars (fractions allowed: 0.5 = half bar)
export function factsSequences(doc, tracks, {unitBars = [2, 1, 0.5], minStatements = 3, from = 0, to = null, onsetsOnly = false} = {}) {
  const out = [];
  for (const ub of unitBars) {
    const unitTicks = Math.round(doc.barTicks * ub);
    if (unitTicks < 1) continue;
    const units = factsUnits(doc, tracks, unitTicks, from, to);
    let i = 0;
    while (i < units.length) {
      const intervals = [];
      let j = i;
      while (j + 1 < units.length && units[j].events.length) {
        const r = factsUnitRelation(units[j].events, units[j + 1].events, {onsetsOnly});
        if (r.kind !== "transposed") break;
        intervals.push(r.interval); j++;
      }
      const statements = j - i + 1;
      if (statements >= minStatements) out.push({unitBars: ub, from: units[i].at, to: factsBQ(doc, units[j].end), statements, intervals});
      i = statements > 1 ? j : i + 1; // a chain may end where the next begins
    }
  }
  return out;
}

// phrase length: the candidate (8, 4, 2 bars) whose phrases repeat (exact
// or transposed) in the largest PROPORTION; ties go to the longer (a 4-bar
// repeat is also two 2-bar repeats — the count alone would always pick 2).
// Falls back to 4 when nothing repeats at any length.
export function factsPhraseBars(doc, tracks, barUnits, {onsetsOnly = false} = {}) {
  const nb = barUnits.length;
  let best = null;
  for (const L of [8, 4, 2]) {
    if (L * 2 > nb) continue;
    const phrases = factsPhraseUnits(doc, barUnits, L);
    const score = factsRepeats(phrases, {onsetsOnly}).filter(r => r.kind !== "rhythm").length / phrases.length;
    if (!best || score > best.score) best = {L, score};
  }
  return best && best.score > 0 ? best.L : Math.min(4, Math.max(1, nb));
}
export function factsPhraseUnits(doc, barUnits, L) {
  const phrases = [];
  for (let i = 0; i < barUnits.length; i += L) {
    const group = barUnits.slice(i, i + L);
    const start = group[0].start;
    const events = [];
    for (const b of group) for (const e of b.events) events.push({...e, off: e.off + (b.start - start)});
    events.sort((a, b) => a.ti - b.ti || a.off - b.off || a.p - b.p);
    phrases.push({index: phrases.length, start, end: group[group.length - 1].end, at: group[0].at, bars: (Math.floor(start / doc.barTicks) + 1) + "–" + (Math.floor(group[group.length - 1].end / doc.barTicks)), events});
  }
  return phrases;
}

// opts: track (default every non-drum track together), from/to (bar.beat
// or ticks), half (also label half-bars), phraseBars (override auto),
// minStatements, onsetsOnly (ignore durations when comparing)
export function formFacts(doc, opts = {}) {
  const tracks = factsTracks(doc, {track: opts.track, drums: !!opts.drums});
  const t0 = opts.from === undefined ? 0 : typeof opts.from === "number" ? opts.from : factsParseBQ(doc, opts.from);
  const t1 = opts.to === undefined ? null : typeof opts.to === "number" ? opts.to : factsParseBQ(doc, opts.to);
  const cmp = {onsetsOnly: !!opts.onsetsOnly};
  const barUnits = factsUnits(doc, tracks, doc.barTicks, t0, t1);
  const bars = factsLabelUnits(barUnits, cmp).map(u => ({bar: Math.floor(u.start / doc.barTicks) + 1, at: u.at, label: u.label, rel: u.rel, notes: u.events.length}));
  const halfBars = opts.half ? factsLabelUnits(factsUnits(doc, tracks, doc.barTicks / 2, t0, t1), cmp).map(u => ({at: u.at, label: u.label, rel: u.rel, notes: u.events.length})) : null;
  const phraseBars = opts.phraseBars ? Number(opts.phraseBars) : factsPhraseBars(doc, tracks, barUnits, cmp);
  const phraseUnits = factsPhraseUnits(doc, barUnits, phraseBars);
  const phrases = factsLabelUnits(phraseUnits, {upper: true, ...cmp}).map(u => ({bars: u.bars, at: u.at, label: u.label, rel: u.rel, notes: u.events.length}));
  return {
    tracks: tracks.map(t => t.name),
    barString: bars.map(b => b.label).join(" "),
    bars, halfBars,
    repeats: factsRepeats(barUnits, cmp),
    phrases: {phraseBars, auto: !opts.phraseBars, list: phrases, formString: phrases.map(p => p.label).join(" ")},
    sequences: factsSequences(doc, tracks, {minStatements: opts.minStatements || 3, from: t0, to: t1, ...cmp}),
  };
}
