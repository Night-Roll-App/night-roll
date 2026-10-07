// src/model/noteshape.js — a note's volume shape (docs/plans/2026-10-06-in-note-dynamics.md,
// option (b); NIGHT-ROLL.md "Volume inside a note"). `n.env = [{t, r}]`: t = ticks
// from the note's start (0 < t < n.d), r = level ÷ velocity. Relative on purpose
// (Josh, 2026-10-06): a velocity edit rescales the whole shape. Velocity stays the
// attack; the synth glides through the points on one sound, holding the last level
// to the end. In the .mid each point is poly aftertouch at its tick inside the note,
// level = r × velocity clamped to 0..127 (src/midi/write.js); aftertouch AT the
// note-on tick is still `ve`. A shape moves and copies with its note. Captures'
// shapes are facts from the chip's volume register; presets are tools Josh picks.
import { S } from "../state.js";
import { selEditItems } from "./selection.js";
import { selEditApply } from "./selection.js";
import { editableSong } from "./song.js";

export const SHAPE_PRESETS = {swell: "Swell", fade: "Fade", swell_fade: "Swell–fade", flat: "Flat"};
export const SHAPE_PEAK_R = 1.75, SHAPE_FADE_R = 0.25, SHAPE_TAIL_R = 0.5;

export function shapePoints(n) { // the points that sound: inside the note, in time order
  if (!n || !n.env || !n.env.length || !(n.d > 0)) return [];
  return n.env.filter(q => q.t > 0 && q.t < n.d).sort((a, b) => a.t - b.t);
}
export function shapeLevel(n, q) { return Math.max(0, Math.min(127, q.r * (n.v || 80))); } // what the file holds: 0..127
// gain relative to velocity at tick offset tt: a line from (0, 1) through the points, the last level held
export function shapeFactorAt(n, pts, tt) {
  let pt = 0, pf = 1;
  const v = n.v || 80;
  for (const q of pts) {
    const f = shapeLevel(n, q) / v;
    if (tt <= q.t) return q.t === pt ? f : pf + (f - pf) * (tt - pt) / (q.t - pt);
    pt = q.t; pf = f;
  }
  return pf;
}
// a preset's points scaled to this note's length; r capped so the stored level
// is what the file can hold (≤127) — null = Flat (no shape)
export function shapePreset(name, n) {
  const at = f => Math.max(1, Math.min(n.d - 1, Math.round(n.d * f)));
  const peak = Math.min(SHAPE_PEAK_R, 127 / (n.v || 80));
  if (name === "swell") return [{t: at(1), r: peak}];
  if (name === "fade") return [{t: at(1), r: SHAPE_FADE_R}];
  if (name === "swell_fade") return [{t: at(0.45), r: peak}, {t: at(1), r: SHAPE_TAIL_R}];
  return null;
}
// an undo snapshot's shape fields ("env" present = applyEditEntry restores them)
export function shapeSnap(n) {
  return {env: n.env ? n.env.map(q => ({...q})) : null, ve: n.ve !== undefined ? n.ve : null};
}
export function shapeRestore(nn, it) {
  if (it.env) nn.env = it.env.map(q => ({...q})); else delete nn.env;
  if (it.ve !== null && it.ve !== undefined) nn.ve = it.ve; else delete nn.ve;
}
// Shape ▾ / Ask edit_notes shape: every item gets envFor(n) (a preset by
// default) — one undo step for all of them. A shape replaces the old decay
// target (`ve`) so the note says one thing; Flat clears both.
export function setSelectionShape(name, items = selEditItems(), envFor = null) {
  if (!editableSong()) return 0;
  items = items.filter(({n}) => n.d >= 2);
  if (!items.length) return 0;
  const pre = items.map(({ti, ni, n}) => ({ti, ni, t: n.t, d: n.d, p: n.p, v: n.v, ...shapeSnap(n)}));
  selEditApply(items, n => {
    const env = envFor ? envFor(n) : shapePreset(name, n);
    if (env && env.length) n.env = env; else delete n.env;
    delete n.ve;
  }, pre);
  return items.length;
}
// one point of one note moved (the velocity lane's drag): level 0..127, t clamped inside the note
export function shapeMovePoint(n, k, t, level) {
  const pts = shapePoints(n).map(q => ({...q}));
  if (!pts[k]) return;
  const lo = k ? pts[k - 1].t + 1 : 1, hi = k + 1 < pts.length ? pts[k + 1].t - 1 : n.d - 1;
  pts[k].t = Math.max(lo, Math.min(hi, Math.round(t)));
  pts[k].r = Math.max(0, Math.min(127, level)) / (n.v || 80);
  n.env = pts;
}
export function shapeSummary(n) { // facts for Ask/at/span: "+0.78b→127 +1.67b→68" (beats from the note's start, absolute levels)
  const ppq = (S.song && S.song.ppq) || 480;
  return shapePoints(n).map(q => "+" + +(q.t / ppq).toFixed(2) + "b→" + Math.round(shapeLevel(n, q))).join(" ");
}
