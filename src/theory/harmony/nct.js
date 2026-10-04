// src/theory/harmony/nct.js — non-chord tones: each note against the chord
// band the user wrote over it. The band is the user's own reading, so
// "chord tone" here means "a member of the chord he named", never a guess
// from the notes. Melodic context is the same track's previous and next
// onsets (monophonic lines; a chord track gets the nearest-pitch neighbour).
// Pure (layer 0).
import { hmBQ, hmKeyAt, hmKeyContext, hmChordFromLabel, hmPitchName } from "./roman.js";

export const HM_STEP = 2; // semitones: a step is 1-2, a leap is more

export function hmBandAt(bands, tick) { // the band sounding at a tick (the latest-starting one when they nest)
  let best = null;
  for (const b of bands) if (b.start <= tick && tick < b.end && (!best || b.start > best.start)) best = b;
  return best;
}
export function hmNeighbours(notes, i) { // the previous and next onset in the same track; ties pick the pitch nearest this note
  const n = notes[i];
  let prev = null, next = null;
  for (let j = i - 1; j >= 0; j--) {
    if (notes[j].t >= n.t) continue;
    if (prev && notes[j].t < prev.t) break;
    if (!prev || Math.abs(notes[j].p - n.p) < Math.abs(prev.p - n.p)) prev = notes[j];
  }
  for (let j = i + 1; j < notes.length; j++) {
    if (notes[j].t <= n.t) continue;
    if (next && notes[j].t > next.t) break;
    if (!next || Math.abs(notes[j].p - n.p) < Math.abs(next.p - n.p)) next = notes[j];
  }
  return {prev, next};
}
export function hmClassify(n, prev, next, ctx) { // -> {type, detail}
  const stepIn = prev && Math.abs(n.p - prev.p) > 0 && Math.abs(n.p - prev.p) <= HM_STEP;
  const stepOut = next && Math.abs(next.p - n.p) > 0 && Math.abs(next.p - n.p) <= HM_STEP;
  const leapIn = prev && Math.abs(n.p - prev.p) > HM_STEP, leapOut = next && Math.abs(next.p - n.p) > HM_STEP;
  const dIn = prev ? Math.sign(n.p - prev.p) : 0, dOut = next ? Math.sign(next.p - n.p) : 0;
  if (prev && next && prev.p === n.p && next.p === n.p) return {type: "pedal", detail: "the same pitch before and after, held through a chord it does not belong to"};
  if (next && next.p === n.p && ctx.nextIsChordTone && ctx.nextBand !== ctx.band) return {type: "anticipation", detail: "arrives early: it belongs to the next chord (" + ctx.nextBand.text + ")"};
  if (prev && prev.p === n.p && ctx.prevIsChordTone) {
    if (stepOut && dOut < 0) return {type: "suspension", detail: "prepared at " + ctx.prevAt + ", resolves down by step at " + ctx.nextAt};
    if (stepOut && dOut > 0) return {type: "retardation", detail: "prepared at " + ctx.prevAt + ", resolves up by step at " + ctx.nextAt};
    return {type: "held over", detail: "prepared at " + ctx.prevAt + " but not resolved by step"};
  }
  if (stepIn && stepOut && dIn === dOut) return {type: "passing", detail: (ctx.accented ? "accented, " : "") + (dIn > 0 ? "rising" : "falling") + (ctx.chromatic ? ", chromatic" : "")};
  if (stepIn && stepOut && dIn !== dOut) return {type: "neighbor", detail: (dIn > 0 ? "upper" : "lower") + (ctx.chromatic ? ", chromatic" : "")};
  if (leapIn && stepOut) return {type: "appoggiatura", detail: "leap in, step " + (dOut > 0 ? "up" : "down") + " out" + (ctx.accented ? "" : " (unaccented)")};
  if (stepIn && leapOut) return {type: "escape", detail: "step in, leap " + (dOut > 0 ? "up" : "down") + " out"};
  if (!prev && stepOut) return {type: "incomplete neighbor", detail: "no preparation, resolves by step"};
  if (!next) return {type: "unresolved", detail: "the line's last note"};
  return {type: "free tone", detail: "leap in and leap out"};
}

// tracks [{name, notes:[{t,d,p}]}] (drums excluded by the caller), bands
// [{start,end,text}], keys, grid -> {items, summary, uncovered}
export function hmNonChordTones(tracks, bands, keys, grid, opts = {}) {
  const items = [];
  const summary = {chordTones: 0, nonChordTones: 0, byType: {}};
  let uncovered = 0;
  const chordOf = new Map(); // band -> parsed chord (null when the label is free text)
  const chordFor = b => { if (!chordOf.has(b)) chordOf.set(b, hmChordFromLabel(b.text)); return chordOf.get(b); };
  const isCT = (band, p) => { const c = band && chordFor(band); return !!c && c.tones.includes(((p % 12) + 12) % 12); };
  for (const tr of tracks) {
    const notes = tr.notes.filter(n => !n.gone).sort((a, b) => a.t - b.t || a.p - b.p);
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const band = hmBandAt(bands, n.t);
      if (!band || !chordFor(band)) { uncovered++; continue; }
      const key = hmKeyContext(hmKeyAt(keys, n.t));
      const sf = key ? key.sf : null;
      const {prev, next} = hmNeighbours(notes, i);
      const push = (type, detail, at, over) => {
        summary.nonChordTones++; summary.byType[type] = (summary.byType[type] || 0) + 1;
        items.push({track: tr.name, at, pitch: hmPitchName(n.p, sf), midi: n.p, type, detail, over: over.text, overAt: hmBQ(grid, over.start)});
      };
      if (isCT(band, n.p)) {
        summary.chordTones++;
        // a chord tone held past its band into one it does not belong to is
        // the classic suspension (4-3, 9-8): prepared by itself, resolved by the next onset
        const later = hmBandAt(bands, band.end);
        if (later && later !== band && n.t + n.d > band.end + grid.beatTicks / 4 && chordFor(later) && !isCT(later, n.p)) {
          const stepDown = next && n.p - next.p > 0 && n.p - next.p <= HM_STEP, stepUp = next && next.p - n.p > 0 && next.p - n.p <= HM_STEP;
          const at = hmBQ(grid, later.start);
          if (stepDown) push("suspension", "prepared at " + hmBQ(grid, n.t) + " (" + band.text + "), held into " + later.text + ", resolves down by step at " + hmBQ(grid, next.t), at, later);
          else if (stepUp) push("retardation", "prepared at " + hmBQ(grid, n.t) + " (" + band.text + "), held into " + later.text + ", resolves up by step at " + hmBQ(grid, next.t), at, later);
          else push("held over", "prepared at " + hmBQ(grid, n.t) + " (" + band.text + "), held into " + later.text + " without a step resolution", at, later);
        }
        continue;
      }
      const prevBand = prev ? hmBandAt(bands, prev.t) : null, nextBand = next ? hmBandAt(bands, next.t) : null;
      const ctx = {band, nextBand, prevIsChordTone: !!prev && isCT(prevBand, prev.p), nextIsChordTone: !!next && isCT(nextBand, next.p),
                   prevAt: prev ? hmBQ(grid, prev.t) : null, nextAt: next ? hmBQ(grid, next.t) : null,
                   accented: n.t % grid.beatTicks === 0, chromatic: !!key && !key.diatonic.has(((n.p % 12) + 12) % 12)};
      const c = hmClassify(n, prev, next, ctx);
      push(c.type, c.detail, hmBQ(grid, n.t), band);
    }
  }
  if (opts.track) { const t = String(opts.track).toLowerCase(); const keep = items.filter(x => x.track.toLowerCase() === t); return {items: keep, summary, uncovered}; }
  return {items, summary, uncovered};
}
