// src/theory/facts/pattern.js — the pattern finder (docs/theory-toolkit.md
// §1). A pattern is a list of signed semitone intervals (and optionally the
// inter-onset rhythm, in quarters) — never pitches, so every transposition
// matches. Searched over every monophonic line factsLines() yields: a
// monophonic track as one line, a polyphonic track as its rank voices.
// Pure; reports WHERE a figure recurs, nothing about what it means.
import { factsLines, factsBQ, factsPitch, factsTopLine, factsVoices, factsSpan, factsParseBQ, factsTracks } from "./common.js";

// collapse: a repeated pitch is one event (so "G G D" and "G D" are the same
// contour); the merged event keeps the first onset
export function factsCollapseRepeats(line) {
  const out = [];
  for (const n of line) if (!out.length || out[out.length - 1].p !== n.p) out.push(n);
  return out;
}

// Build a pattern from a line of notes: intervals (n−1 signed semitones) and
// rhythm (n−1 inter-onset intervals in quarters, 3-decimal).
export function factsPatternOf(line, ppq, {collapseRepeats = false} = {}) {
  const src = collapseRepeats ? factsCollapseRepeats(line) : line;
  const intervals = [], rhythm = [];
  for (let i = 1; i < src.length; i++) {
    intervals.push(src[i].p - src[i - 1].p);
    rhythm.push(Math.round((src[i].t - src[i - 1].t) / ppq * 1000) / 1000);
  }
  return {intervals, rhythm, pitches: src.map(n => n.p), anchorPitch: src.length ? src[0].p : null};
}

// The pattern a span of the song itself states — "where does THIS come
// back?": the top line of `track` between from/to ("bar.beat" strings or
// ticks), optionally one rank voice.
export function factsPatternFromSpan(doc, {track, voice = null, from, to, collapseRepeats = false}) {
  const t0 = typeof from === "number" ? from : factsParseBQ(doc, from);
  const t1 = typeof to === "number" ? to : factsParseBQ(doc, to);
  const tr = factsTracks(doc, {track})[0]; // no track named → the first non-drum track
  const line = voice === null ? factsTopLine(tr.notes) : (factsVoices(tr.notes)[Number(voice)] || []);
  const notes = factsSpan(line, t0, t1);
  if (notes.length < 2) throw new Error("the span " + factsBQ(doc, t0) + "–" + factsBQ(doc, t1) + " holds " + notes.length + " note(s) on that line — a pattern needs at least two");
  return {...factsPatternOf(notes, doc.ppq, {collapseRepeats}), source: {track: tr.name, trackIndex: tr.ti, voice, from: factsBQ(doc, t0), to: factsBQ(doc, t1)}};
}

export function factsIntervalMatches(d, want, octaveEquiv) {
  return d === want || (octaveEquiv && ((d - want) % 12) === 0);
}

// opts: intervals (required unless rhythm given), rhythm (quarters, optional),
// track/voice/drums (factsLines selection), collapseRepeats, octaveEquiv
// (an interval may differ by whole octaves — octave displacement),
// rhythmScale (rhythm matches by proportion — augmentation/diminution),
// tolerance (quarters), anchorPitch (transposition is reported relative to
// it — the source excerpt's first pitch), sf (spelling only).
export function findPattern(doc, opts = {}) {
  const intervals = opts.intervals || null, rhythm = opts.rhythm || null;
  if (!intervals && !rhythm) throw new Error("findPattern needs intervals and/or rhythm");
  const n = (intervals || rhythm).length; // events − 1
  if (intervals && rhythm && rhythm.length !== n) throw new Error("intervals and rhythm must have the same length (events − 1)");
  const tol = opts.tolerance === undefined ? 1e-3 : opts.tolerance;
  const sf = opts.sf === undefined ? null : opts.sf;
  const hits = [];
  const lines = factsLines(doc, {track: opts.track, voice: opts.voice, drums: !!opts.drums});
  for (const ln of lines) {
    const line = opts.collapseRepeats ? factsCollapseRepeats(ln.notes) : ln.notes;
    for (let i = 0; i + n < line.length; i++) {
      let ok = true;
      for (let k = 0; k < n && ok; k++) {
        const a = line[i + k], b = line[i + k + 1];
        if (intervals && !factsIntervalMatches(b.p - a.p, intervals[k], !!opts.octaveEquiv)) ok = false;
        if (ok && rhythm) {
          const ioi = (b.t - a.t) / doc.ppq;
          if (opts.rhythmScale) {
            const ioi0 = (line[i + 1].t - line[i].t) / doc.ppq;
            if (!rhythm[0] || !ioi0 || Math.abs(ioi / ioi0 - rhythm[k] / rhythm[0]) > tol) ok = false;
          } else if (Math.abs(ioi - rhythm[k]) > tol) ok = false;
        }
      }
      if (!ok) continue;
      const first = line[i], last = line[i + n];
      hits.push({
        track: ln.track, trackIndex: ln.ti, voice: ln.voice, tick: first.t,
        at: factsBQ(doc, first.t), endAt: factsBQ(doc, last.t + last.d),
        startPitch: factsPitch(first.p, sf), startMidi: first.p,
        transposition: typeof opts.anchorPitch === "number" ? first.p - opts.anchorPitch : null,
        pitches: line.slice(i, i + n + 1).map(x => factsPitch(x.p, sf)),
      });
    }
  }
  // song order reads better than per-line order
  hits.sort((a, b) => a.tick - b.tick || a.trackIndex - b.trackIndex || (a.voice || 0) - (b.voice || 0));
  return {
    pattern: {intervals, rhythm, collapseRepeats: !!opts.collapseRepeats, octaveEquiv: !!opts.octaveEquiv, rhythmScale: !!opts.rhythmScale},
    linesSearched: lines.map(l => l.track + (l.voice === null ? "" : "/v" + (l.voice + 1))),
    hits,
  };
}

// a hit list summarised per distinct transposition — "comes back 4× at the
// same pitch, 2× a step up"; `shift` is the semitones from the anchor, or
// the start MIDI when the search had no anchor
export function factsHitsByTransposition(hits) {
  const by = new Map();
  for (const h of hits) {
    const k = h.transposition === null ? h.startMidi : h.transposition;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(h);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([k, hs]) => ({shift: k, count: hs.length, at: hs.map(h => h.at)}));
}
