// src/theory/facts/voices.js — voice-leading facts between lines
// (docs/theory-toolkit.md §6): parallel perfect fifths and octaves/unisons
// by interval class, voice crossing, overlap, and each line's large leaps
// — every one with bar.beat and the two lines. These are interval facts
// (named as intervals), never "errors". Lines come from factsLines: a
// monophonic track is one line, a polyphonic track its rank voices. Pure.
import { factsLines, factsBQ, factsPitch, factsSoundingAt, factsDeclaredSf } from "./common.js";
import { factsSpanTicks } from "./melody.js";

export function factsLineName(ln) { return ln.track + (ln.voice === null ? "" : "/v" + (ln.voice + 1)); }

// samples at the union of both lines' onsets inside [t0, t1): the note each
// line is sounding then (null in a rest)
export function factsPairSamples(a, b, t0, t1) {
  const times = [...new Set([...a.notes, ...b.notes].map(n => n.t).filter(t => t >= t0 && (t1 === null || t < t1)))].sort((x, y) => x - y);
  return times.map(t => ({t, a: factsSoundingAt(a.notes, t), b: factsSoundingAt(b.notes, t)}));
}

export function factsPairFacts(doc, upper, lower, {t0 = 0, t1 = null, sf = null} = {}) {
  const samples = factsPairSamples(upper, lower, t0, t1);
  const out = {voices: [factsLineName(upper), factsLineName(lower)], parallelFifths: [], parallelOctaves: [], crossings: [], overlaps: []};
  const pair = s => factsPitch(s.a.p, sf) + "/" + factsPitch(s.b.p, sf);
  let crossing = null;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s.a || !s.b) { if (crossing) { out.crossings.push(crossing); crossing = null; } continue; }
    if (s.a.p < s.b.p) {
      if (crossing) crossing.to = factsBQ(doc, s.t); else crossing = {from: factsBQ(doc, s.t), to: factsBQ(doc, s.t), pitches: pair(s)};
    } else if (crossing) { out.crossings.push(crossing); crossing = null; }
    const p = i > 0 ? samples[i - 1] : null;
    if (!p || !p.a || !p.b) continue;
    const da = s.a.p - p.a.p, db = s.b.p - p.b.p;
    if (da && db && Math.sign(da) === Math.sign(db)) { // both move, same direction
      const ic1 = (((p.a.p - p.b.p) % 12) + 12) % 12, ic2 = (((s.a.p - s.b.p) % 12) + 12) % 12;
      const ev = {from: factsBQ(doc, p.t), to: factsBQ(doc, s.t), pitches: pair(p) + " → " + pair(s), direction: da > 0 ? "up" : "down"};
      if (ic1 === 7 && ic2 === 7) out.parallelFifths.push({...ev, interval: "perfect fifth" + (Math.abs(p.a.p - p.b.p) > 12 || Math.abs(s.a.p - s.b.p) > 12 ? " (compound)" : "")});
      else if (ic1 === 0 && ic2 === 0) out.parallelOctaves.push({...ev, interval: p.a.p === p.b.p && s.a.p === s.b.p ? "unison" : "octave"});
    }
    // overlap: a voice steps past where the OTHER voice just was, the two
    // uncrossed both before and after (a crossing is reported as one above)
    if (p.a.p >= p.b.p && s.a.p >= s.b.p && ((da && s.a.p < p.b.p) || (db && s.b.p > p.a.p)))
      out.overlaps.push({from: factsBQ(doc, p.t), to: factsBQ(doc, s.t), pitches: pair(p) + " → " + pair(s), mover: da && s.a.p < p.b.p ? out.voices[0] : out.voices[1]});
  }
  if (crossing) out.crossings.push(crossing);
  return out;
}

export function factsLineLeaps(doc, ln, leap, sf, t0, t1) {
  const out = [];
  for (let i = 1; i < ln.notes.length; i++) {
    const a = ln.notes[i - 1], b = ln.notes[i];
    if (b.t < t0 || (t1 !== null && b.t >= t1)) continue;
    const d = b.p - a.p;
    if (Math.abs(d) >= leap) out.push({line: factsLineName(ln), at: factsBQ(doc, b.t), from: factsPitch(a.p, sf), to: factsPitch(b.p, sf), semitones: d});
  }
  return out;
}

// opts: track (default every non-drum track; polyphonic tracks split into
// rank voices), from/to, leap (default 7 semitones), sf (spelling only)
export function voiceFacts(doc, opts = {}) {
  const [t0, t1] = factsSpanTicks(doc, opts);
  const sf = opts.sf !== undefined ? opts.sf : factsDeclaredSf(doc, t0);
  const leap = opts.leap || 7;
  const lines = factsLines(doc, {track: opts.track, voice: opts.voice});
  const mean = ln => ln.notes.length ? ln.notes.reduce((s, n) => s + n.p, 0) / ln.notes.length : 0;
  const pairs = [];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const [upper, lower] = mean(lines[i]) >= mean(lines[j]) ? [lines[i], lines[j]] : [lines[j], lines[i]];
    pairs.push(factsPairFacts(doc, upper, lower, {t0, t1, sf}));
  }
  const leaps = lines.flatMap(ln => factsLineLeaps(doc, ln, leap, sf, t0, t1));
  return {
    span: {from: factsBQ(doc, t0), to: t1 === null ? null : factsBQ(doc, t1)},
    lines: lines.map(factsLineName),
    pairs,
    leaps: {threshold: leap, count: leaps.length, list: leaps},
    totals: {parallelFifths: pairs.reduce((s, p) => s + p.parallelFifths.length, 0), parallelOctaves: pairs.reduce((s, p) => s + p.parallelOctaves.length, 0),
      crossings: pairs.reduce((s, p) => s + p.crossings.length, 0), overlaps: pairs.reduce((s, p) => s + p.overlaps.length, 0)},
  };
}
