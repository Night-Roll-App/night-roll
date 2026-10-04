import { barTicks } from "../model/rollnotes.js";
import { S } from "../state.js";
import { trackIsDrums } from "../model/grid.js";
import { beatTicks } from "../model/grid.js";

// ---- Drummer: context-aware kit generation (advisor-reviewed design, 2026-08-20) ----
// Constrained randomness: a fixed skeleton (kick on 1, meter-table backbeat) that
// seeds NEVER touch; variation only in the negotiable parts (hat texture, bass-
// following kicks, ghosts, fill choice). Every generation is the same idempotent
// operation — replace ALL kit notes in the bar range as ONE group undo — so a
// reroll can't clobber hand edits it can't see, and one undo restores Josh's drums.
export function drumRng(seed, lane) { // per-bar substream: range changes can't scramble liked bars
  let a = (seed ^ ((lane + 1) * 0x9E3779B9)) >>> 0;
  return function() { // mulberry32
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const DR_TOMS = [48, 47, 45, 43, 41];
export function fnv1a32(str) { // stable label hash for section-keyed substreams
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// fill vocabulary — curated by what Josh keeps; each entry owns its window
// (offsets in beats from bar start) and the skeleton yields inside it
export const DR_FILLS = [ // minE: the softest energy this fill may appear at — a
  // full-bar kick/snare buildup at energy 1 is wrong (Josh, field report)
  {name: "run", len: 2, minE: 2, maxE: 5, weight: 1, hits: (rng, qt, beats) => { // 16th snare run, crescendo
    const out = [];
    for (let i = 0; i < 8; i++) out.push({off: (beats - 2 + i / 4) * qt, p: 38, v: Math.round(70 + (115 - 70) * i / 7), d: 50});
    return out;
  }},
  {name: "tomdrop", len: 2, minE: 3, maxE: 5, weight: 1, hits: (rng, qt, beats) => { // snare -> toms down the slots
    const seq = [38, 48, 47, 45, 43, 41].slice(0, 4 + Math.floor(rng() * 3));
    return seq.map((p, i) => ({off: (beats - 2) * qt + i * (2 * qt / seq.length), p,
                               v: Math.round(88 + 20 * i / (seq.length - 1)), d: 60}));
  }},
  {name: "buildup", len: 4, minE: 4, maxE: 5, weight: 2, hits: (rng, qt, beats) => { // kick/snare 8ths tightening to 16ths
    const out = [];
    const half = Math.min(2, beats / 2);
    for (let i = 0; i < half * 2; i++) out.push({off: i * qt / 2, p: i % 2 ? 38 : 36, v: 90 + i * 2, d: 60});
    for (let i = 0; i < (beats - half) * 4; i++) out.push({off: half * qt + i * qt / 4, p: i % 2 ? 38 : 36, v: Math.round(96 + 18 * i / Math.max(1, (beats - half) * 4 - 1)), d: 50});
    return out;
  }},
  {name: "negative", len: 2, minE: 1, maxE: 2, weight: 1, hits: (rng, qt, beats) => // hats drop, one snare, silence into the downbeat
    [{off: (beats - 1) * qt, p: 38, v: 102, d: 60}]},
  {name: "flam", len: 1, minE: 1, maxE: 3, weight: 1, hits: (rng, qt, beats) =>
    [{off: beats * qt - 30 - qt / 4, p: 38, v: 96, d: 40}, {off: beats * qt - qt / 4, p: 38, v: 112, d: 50}]},
  // — the metal tier (fills 4-5): 16th-rate, kit-wide, DENSER than the groove
  // they interrupt (advisor: tomdrop at 8th-rate under busy-5 16th hats read
  // as a dropout, which is why max-settings fills felt lackluster)
  {name: "tomrun", len: 2, minE: 4, maxE: 5, weight: 2, hits: (rng, qt, beats) => { // eight 16ths down the kit
    const base = [38, 48, 47, 45, 43, 41];
    const d1 = Math.floor(rng() * 6), d2 = Math.floor(rng() * 6); // which two drums double
    const seq = [];
    base.forEach((p, i) => { seq.push(p); if (i === d1 || i === d2) seq.push(p); });
    while (seq.length < 8) seq.push(41);
    return seq.slice(0, 8).map((p, i) => ({off: (beats - 2) * qt + i * qt / 4, p,
                                           v: Math.round(92 + (118 - 92) * i / 7), d: 45}));
  }},
  {name: "kitfall", len: 99, minE: 4, maxE: 5, weight: 3, hits: (rng, qt, beats) => { // full bar, crash in, walk the toms down
    const out = [{off: 0, p: 49, v: 108, d: 120}]; // skeleton's kick-on-1 lands with it
    for (let sl = 1; sl < 4; sl++) out.push({off: sl * qt / 4, p: 38, v: 96 + sl * 2, d: 45});
    for (let b = 1; b < beats; b++) {
      const tom = DR_TOMS[Math.min(b - 1, DR_TOMS.length - 1)];
      const pat = [tom, tom, 38, tom];
      for (let sl = 0; sl < 4; sl++)
        out.push({off: b * qt + sl * qt / 4, p: pat[sl],
                  v: Math.round(96 + (122 - 96) * (b * 4 + sl) / (beats * 4 - 1)), d: 45});
    }
    return out;
  }},
  {name: "doublekick", len: 2, minE: 4, maxE: 5, weight: 2, hits: (rng, qt, beats) => { // the staple
    const out = [];
    for (let i = 0; i < 8; i++) out.push({off: (beats - 2) * qt + i * qt / 4, p: 36,
                                          v: Math.round(100 + (116 - 100) * i / 7), d: 40});
    out.push({off: (beats - 2) * qt, p: 38, v: 112, d: 50});
    out.push({off: (beats - 1) * qt, p: 38, v: 112, d: 50});
    return out;
  }},
];
export function sectionLane(bar) { // same label = same substream, bar-for-bar (Drummer + Bassist)
  const bt = barTicks();
  const t = (bar - 1) * bt;
  let best = null;
  for (const n of S.rollnotes) {
    if (!n.section || !(n.end > n.start)) continue;
    if (n.start <= t && n.end > t && (!best || (n.end - n.start) < (best.end - best.start))) best = n;
  }
  if (!best) return bar;
  return (fnv1a32(best.text) + (bar - (Math.floor(best.start / bt) + 1))) >>> 0;
}
export function drBoundaries(t0, t1) { // section starts + loop target inside (t0, t1]
  const bt = barTicks(), out = new Set();
  for (const n of S.rollnotes) {
    if (n.section && n.start >= t0 && n.start <= t1) out.add(Math.floor(n.start / bt) + 1);
    if (n.loopTo !== undefined && n.loopTo >= t0 && n.loopTo <= t1) out.add(Math.floor(n.loopTo / bt) + 1);
  }
  return out;
}
export function drNormParts(p) { // legacy string | array -> array; 4 groups = "all"
  if (Array.isArray(p)) return p.slice();
  if (!p || p === "all") return ["kick", "snare", "hats", "fills"];
  return [p]; // legacy single-group string: that group, fills off
}
export function drBassTrack() { // named bass/triangle wins; else lowest average pitch
  let byName = S.song.tracks.findIndex((tr, ti) => !trackIsDrums(ti) && tr.kind !== "audio" && /bass|tri/i.test(tr.name || ""));
  if (byName >= 0) return byName;
  let best = -1, bestAvg = 1e9;
  S.song.tracks.forEach((tr, ti) => {
    if (trackIsDrums(ti)) return;
    const live = tr.notes.filter(n => !n.gone);
    if (!live.length) return;
    const avg = live.reduce((a, n) => a + n.p, 0) / live.length;
    if (avg < bestAvg) { bestAvg = avg; best = ti; }
  });
  return best;
}
export function drBackbeats(beats) { // explicit meter table, not "adapted"
  if (beats === 4) return [2, 4];
  if (beats === 3) return [3];
  if (beats === 6) return [4];
  return [beats]; // anything else: last beat of the bar
}
export function fmtBarBeat(t) {
  const bt = barTicks(), qt = beatTicks();
  const q = Math.round(((t % bt) / qt + 1) * 100) / 100;
  return (Math.floor(t / bt) + 1) + (q !== 1 ? "." + q : "");
}
