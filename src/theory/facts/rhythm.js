// src/theory/facts/rhythm.js — rhythm facts (docs/theory-toolkit.md §4):
// attack density per bar, where attacks fall against the beat grid (on the
// beat / off-beat eighth / sixteenth / off the sixteenth grid) and how many
// off-beat notes are held across the next beat line, the extreme durations,
// and harmonic rhythm = how often the user's OWN chord bands change. The
// beat grid is the doc's effective ruler (model/grid.js effTs: declared or
// the neutral default); the toolkit never names the meter. Chord-band text
// is never read — only spans. Pure.
import { factsTracks, factsSpan, factsBQ, factsPitch, factsQuarters, factsChordSpans, factsDeclaredSf, factsBarCount } from "./common.js";
import { factsSpanTicks } from "./melody.js";

export function factsRhythmOfTrack(doc, notes, {sf = null} = {}) {
  if (!notes.length) return {notes: 0};
  const beat = doc.beatTicks, eighth = beat / 2, sixteenth = beat / 4;
  const onGrid = (t, g) => Math.abs(t / g - Math.round(t / g)) < 1e-6;
  const attacks = [...new Set(notes.map(n => n.t))].sort((a, b) => a - b);
  const grid = {onBeat: 0, downbeat: 0, offBeatEighth: 0, sixteenth: 0, offGrid: 0};
  for (const t of attacks) {
    if (onGrid(t, doc.barTicks)) grid.downbeat++;
    if (onGrid(t, beat)) grid.onBeat++;
    else if (onGrid(t, eighth)) grid.offBeatEighth++;
    else if (onGrid(t, sixteenth)) grid.sixteenth++;
    else grid.offGrid++;
  }
  const heldAcross = [];
  for (const n of notes) {
    if (onGrid(n.t, beat)) continue;
    const nextBeat = Math.ceil(n.t / beat - 1e-6) * beat;
    if (n.t + n.d > nextBeat + 1e-6) heldAcross.push({at: factsBQ(doc, n.t), pitch: factsPitch(n.p, sf), quarters: factsQuarters(doc, n.d)});
  }
  const perBar = [];
  for (const t of attacks) {
    const bar = Math.floor(t / doc.barTicks) + 1;
    const row = perBar[perBar.length - 1];
    if (row && row.bar === bar) row.attacks++; else perBar.push({bar, attacks: 1});
  }
  const counts = perBar.map(r => r.attacks);
  const densest = perBar.reduce((m, r) => (!m || r.attacks > m.attacks ? r : m), null);
  const sparsest = perBar.reduce((m, r) => (!m || r.attacks < m.attacks ? r : m), null);
  let longest = notes[0], shortest = notes[0];
  const durHist = {};
  for (const n of notes) {
    if (n.d > longest.d) longest = n;
    if (n.d < shortest.d) shortest = n;
    const q = factsQuarters(doc, n.d);
    durHist[q] = (durHist[q] || 0) + 1;
  }
  const offBeat = attacks.length - grid.onBeat;
  return {
    notes: notes.length, attacks: attacks.length,
    density: {perBar, mean: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length * 100) / 100,
      max: densest ? {bar: densest.bar, attacks: densest.attacks} : null, min: sparsest ? {bar: sparsest.bar, attacks: sparsest.attacks} : null,
      barsWithAttacks: perBar.length},
    grid,
    syncopation: {offBeatAttacks: offBeat, offBeatFraction: Math.round(offBeat / attacks.length * 1000) / 1000,
      heldAcrossBeat: heldAcross.length, heldAcrossBeatAt: heldAcross.slice(0, 12), offGridAttacks: grid.offGrid},
    durations: {longest: {quarters: factsQuarters(doc, longest.d), at: factsBQ(doc, longest.t), pitch: factsPitch(longest.p, sf)},
      shortest: {quarters: factsQuarters(doc, shortest.d), at: factsBQ(doc, shortest.t), pitch: factsPitch(shortest.p, sf)},
      histogram: durHist},
  };
}

// chord-band change rate over [t0, t1): bands that START in the span
export function factsHarmonicRhythm(doc, t0 = 0, t1 = null) {
  const spans = factsChordSpans(doc).filter(s => s.start >= t0 && (t1 === null || s.start < t1));
  if (!spans.length) return {bands: 0, note: "no chord bands annotated in this span — harmonic rhythm needs the user's own chord bands"};
  const starts = [...new Set(spans.map(s => s.start))].sort((a, b) => a - b);
  const changes = starts.map((t, i) => {
    const s = spans.find(x => x.start === t);
    return {at: factsBQ(doc, t), beats: Math.round((s.end - s.start) / doc.beatTicks * 100) / 100, gapToNext: i + 1 < starts.length ? Math.round((starts[i + 1] - t) / doc.beatTicks * 100) / 100 : null};
  });
  const hist = {};
  for (const c of changes) hist[c.beats] = (hist[c.beats] || 0) + 1;
  const perBar = {};
  for (const t of starts) { const b = Math.floor(t / doc.barTicks) + 1; perBar[b] = (perBar[b] || 0) + 1; }
  const barsCovered = Math.max(1, Math.ceil(((t1 === null ? factsBarCount(doc) * doc.barTicks : t1) - t0) / doc.barTicks));
  const barHist = {};
  for (let b = Math.floor(t0 / doc.barTicks) + 1; b <= Math.floor(t0 / doc.barTicks) + barsCovered; b++) { const k = perBar[b] || 0; barHist[k] = (barHist[k] || 0) + 1; }
  return {bands: spans.length, changes: starts.length, changesPerBar: Math.round(starts.length / barsCovered * 100) / 100,
    meanBeatsPerBand: Math.round(changes.reduce((a, c) => a + c.beats, 0) / changes.length * 100) / 100,
    bandLengthHistogram: hist, changesPerBarHistogram: barHist, changesAt: changes};
}

// opts: track (default every track, drums included — rhythm is theirs too),
// from/to, sf (spelling only)
export function rhythmFacts(doc, opts = {}) {
  const [t0, t1] = factsSpanTicks(doc, opts);
  const sf = opts.sf !== undefined ? opts.sf : factsDeclaredSf(doc, t0);
  return {
    span: {from: factsBQ(doc, t0), to: t1 === null ? null : factsBQ(doc, t1)},
    beatTicks: doc.beatTicks, barTicks: doc.barTicks,
    tracks: factsTracks(doc, {track: opts.track, drums: true}).map(tr => ({track: tr.name, trackIndex: tr.ti, drums: tr.drums, ...factsRhythmOfTrack(doc, factsSpan(tr.notes, t0, t1), {sf})})),
    harmonicRhythm: factsHarmonicRhythm(doc, t0, t1),
  };
}
