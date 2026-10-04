// src/theory/facts/melody.js — melody facts (docs/theory-toolkit.md §3) per
// track, over a bar span: range and where it is reached, tessitura (the
// duration-weighted middle half), interval histogram with step/leap counts,
// the largest leaps and where, contour as up/down runs with turning points,
// and a per-bar low/high. Read off a track's TOP line (one note per onset).
// Pure; counts and places, no judgments.
import { factsTracks, factsTopLine, factsSpan, factsBQ, factsPitch, factsParseBQ, factsMotionKind, factsDeclaredSf } from "./common.js";

export function factsSpanTicks(doc, opts) {
  const t0 = opts.from === undefined || opts.from === null ? 0 : typeof opts.from === "number" ? opts.from : factsParseBQ(doc, opts.from);
  const t1 = opts.to === undefined || opts.to === null ? null : typeof opts.to === "number" ? opts.to : factsParseBQ(doc, opts.to);
  return [t0, t1];
}

// duration-weighted percentile of pitch: the pitch below which `q` of the
// line's sounding time lies
export function factsWeightedPitchPercentile(line, q) {
  const sorted = [...line].sort((a, b) => a.p - b.p);
  const total = sorted.reduce((s, n) => s + n.d, 0);
  let acc = 0;
  for (const n of sorted) { acc += n.d; if (acc >= total * q) return n.p; }
  return sorted.length ? sorted[sorted.length - 1].p : null;
}

export function factsContourRuns(doc, line, sf) {
  const runs = [];
  let cur = null;
  for (let i = 1; i < line.length; i++) {
    const d = line[i].p - line[i - 1].p;
    if (d === 0) { if (cur) cur.notes++; continue; } // a repeated pitch extends the run without turning it
    const dir = d > 0 ? "up" : "down";
    if (cur && cur.dir === dir) { cur.notes++; cur.semitones += Math.abs(d); cur.toTick = line[i].t; cur.toMidi = line[i].p; }
    else {
      if (cur) runs.push(cur);
      cur = {dir, fromTick: line[i - 1].t, toTick: line[i].t, fromMidi: line[i - 1].p, toMidi: line[i].p, notes: 2, semitones: Math.abs(d)};
    }
  }
  if (cur) runs.push(cur);
  return runs.map(r => ({dir: r.dir, from: factsBQ(doc, r.fromTick), to: factsBQ(doc, r.toTick),
    fromPitch: factsPitch(r.fromMidi, sf), toPitch: factsPitch(r.toMidi, sf), notes: r.notes, semitones: r.semitones}));
}

export function factsMelodyOfLine(doc, line, {leap = 7, sf = null} = {}) {
  if (!line.length) return {notes: 0};
  let lo = line[0], hi = line[0];
  for (const n of line) { if (n.p < lo.p) lo = n; if (n.p > hi.p) hi = n; }
  const hist = {};
  const kinds = {repeated: 0, step: 0, leap: 0}, dirs = {up: 0, down: 0};
  const leaps = [];
  for (let i = 1; i < line.length; i++) {
    const d = line[i].p - line[i - 1].p, a = Math.abs(d);
    hist[a] = (hist[a] || 0) + 1;
    kinds[factsMotionKind(a)]++;
    if (d > 0) dirs.up++; else if (d < 0) dirs.down++;
    if (a >= leap) leaps.push({at: factsBQ(doc, line[i].t), from: factsPitch(line[i - 1].p, sf), to: factsPitch(line[i].p, sf), semitones: d});
  }
  leaps.sort((x, y) => Math.abs(y.semitones) - Math.abs(x.semitones));
  const runs = factsContourRuns(doc, line, sf);
  const longest = dir => runs.filter(r => r.dir === dir).sort((x, y) => y.semitones - x.semitones || y.notes - x.notes)[0] || null;
  const perBar = [];
  for (const n of line) {
    const bar = Math.floor(n.t / doc.barTicks) + 1;
    let row = perBar[perBar.length - 1];
    if (!row || row.bar !== bar) { row = {bar, notes: 0, lowMidi: n.p, highMidi: n.p}; perBar.push(row); }
    row.notes++; row.lowMidi = Math.min(row.lowMidi, n.p); row.highMidi = Math.max(row.highMidi, n.p);
  }
  return {
    notes: line.length,
    range: {low: {pitch: factsPitch(lo.p, sf), midi: lo.p, at: factsBQ(doc, lo.t)}, high: {pitch: factsPitch(hi.p, sf), midi: hi.p, at: factsBQ(doc, hi.t)}, semitones: hi.p - lo.p},
    tessitura: {low: factsPitch(factsWeightedPitchPercentile(line, 0.25), sf), median: factsPitch(factsWeightedPitchPercentile(line, 0.5), sf), high: factsPitch(factsWeightedPitchPercentile(line, 0.75), sf), weightedBy: "duration"},
    intervals: {histogram: hist, repeated: kinds.repeated, steps: kinds.step, leaps: kinds.leap, up: dirs.up, down: dirs.down, leapThreshold: leap, largeLeaps: leaps.length, largest: leaps.slice(0, 8)},
    contour: {runs, turningPoints: Math.max(0, runs.length - 1), longestUp: longest("up"), longestDown: longest("down"),
      string: runs.map(r => (r.dir === "up" ? "↗" : "↘") + r.notes + "(" + (r.dir === "up" ? "+" : "-") + r.semitones + ")").join(" ")},
    perBar: perBar.map(r => ({bar: r.bar, notes: r.notes, low: factsPitch(r.lowMidi, sf), high: factsPitch(r.highMidi, sf)})),
  };
}

// opts: track, from/to, leap (semitones that count as a large leap, default
// 7), sf (spelling; default the user's own declared key at the span start)
export function melodyFacts(doc, opts = {}) {
  const [t0, t1] = factsSpanTicks(doc, opts);
  const sf = opts.sf !== undefined ? opts.sf : factsDeclaredSf(doc, t0);
  const leap = opts.leap || 7;
  return {
    span: {from: factsBQ(doc, t0), to: t1 === null ? null : factsBQ(doc, t1)},
    tracks: factsTracks(doc, {track: opts.track}).map(tr => ({track: tr.name, trackIndex: tr.ti, ...factsMelodyOfLine(doc, factsTopLine(factsSpan(tr.notes, t0, t1)), {leap, sf})})),
  };
}
