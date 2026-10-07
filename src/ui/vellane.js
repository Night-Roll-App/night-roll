// src/ui/vellane.js — the velocity lane (2026-10-04, docs/daw-inventory.md
// §4 #6; Logic's velocity lane under the piano roll). A 72 px strip under
// the roll band (#vellane, between #songcenter and #editrow), View ▾ →
// Panels → Velocity lane, OFF by default and a device-local pref
// (ff1roll-vel-open): one stalk per visible note at the note's start x —
// the roll's own tick→x mapping (pxPerTick, S.view.x, S.RULER_W), offset by
// the roll's left edge so an inner left dock shifts the lane with it — its
// height the note's velocity 1..127 in the track's colour. Roll view only:
// drawVelLane() (called from drawFull every repaint) hides the strip in
// Tracks/Score and under Fall. Velocities are .mid data, so a drag edits
// S.song's notes through selEditApply — one "mod" undo per drag, the same
// entry the vol slider and Quantize push — never any lane-local state; the
// lane keeps only the in-flight drag (S.velDrag). Locked songs (captures,
// read-only) draw their stalks and refuse the drag with a status line:
// those velocities, and a chip note's software-envelope decay target
// (`n.ve`, drawn as a faint falling line), are facts from the capture.
// A note's volume shape (`n.env`, src/model/noteshape.js) draws as a line
// across its own width; with ONE note selected its points get handles, and
// dragging one moves it (time and level) — one undo per drag, the same
// selEditApply entry. Captures show their shape and refuse the drag.
import { S } from "../state.js";
import { drawImpl as draw } from "./chrome.js"; // same layer: the impl directly, not the hooks.js port (check.mjs rule 10)
import { setInfoImpl as setInfo } from "./chrome.js";
import { pxPerTick, trackColor, trackShown, fallActive, css, wrap as rollWrap } from "../render/roll.js";
import { selEditItems, selEditApply } from "../model/selection.js";
import { editableSong } from "../model/song.js";
import { isComposition } from "../model/provenance.js";
import { shapePoints } from "../model/noteshape.js";
import { shapeLevel } from "../model/noteshape.js";
import { shapeSnap } from "../model/noteshape.js";
import { shapeMovePoint } from "../model/noteshape.js";

export const velWrap = document.getElementById("vellane");
export const velCanvas = document.getElementById("velcanvas");
export const vctx = velCanvas.getContext("2d");
export const VEL_PAD_TOP = 8, VEL_PAD_BOT = 4; // room for the stalk head above 127 and a baseline below 1
export const VEL_STALK_W = 3, VEL_GRAB = 7; // drawn width; finger half-width either side of a stalk

export function velLaneWanted() { return S.vwVel && !!S.song && S.viewMode === "roll" && !fallActive(); }
export function setVelLane(on) {
  S.vwVel = !!on;
  try { localStorage.setItem("ff1roll-vel-open", S.vwVel ? "1" : "0"); } catch (err) { /* private mode: session only */ }
  applyVelLane();
  draw();
}
export function toggleVelLane() { setVelLane(!S.vwVel); }
export function applyVelLane() { // the strip's visibility; sizes the canvas the moment it appears (zero while display:none)
  const want = velLaneWanted(), was = velWrap.classList.contains("on");
  velWrap.classList.toggle("on", want);
  if (want && !was) velResize();
}
export function velResize() {
  const dpr = window.devicePixelRatio || 1;
  velCanvas.width = velWrap.clientWidth * dpr;
  velCanvas.height = velWrap.clientHeight * dpr;
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawVelLane();
}
export function velGeom() {
  const H = velWrap.clientHeight, top = VEL_PAD_TOP, bot = H - VEL_PAD_BOT;
  const left = rollWrap.getBoundingClientRect().left - velWrap.getBoundingClientRect().left;
  return {H, left, top, bot,
    yOf: v => bot - (bot - top) * (v / 127),
    vOf: y => velClamp(Math.round((bot - y) / (bot - top) * 127))};
}
export function velClamp(v) { return Math.max(1, Math.min(127, v)); }
export function velNoteX(n, g) { return g.left + S.RULER_W + n.t * pxPerTick() - S.view.x; }
export function velIsSel(it) {
  return (!!S.selNote && S.selNote.ti === it.ti && S.selNote.ni === it.ni) || S.multiSelKey.has(it.ti + ":" + it.ni);
}
// the stalks on screen, in paint order: other tracks first, the selected
// track last so it paints on top (and wins a tie in velHit)
export function velVisible(g) {
  const out = [], W = velWrap.clientWidth, x0 = g.left + S.RULER_W;
  const order = S.song.tracks.map((_, ti) => ti).filter(ti => ti !== S.selTrack);
  if (S.song.tracks[S.selTrack]) order.push(S.selTrack);
  for (const ti of order) {
    const tr = S.song.tracks[ti];
    if (!trackShown(ti) || tr.kind === "audio") continue;
    tr.notes.forEach((n, ni) => {
      if (n.gone) return;
      const x = velNoteX(n, g);
      if (x + VEL_STALK_W < x0 || x > W) return;
      out.push({ti, ni, n, x});
    });
  }
  return out;
}
// the stalk under a finger: within VEL_GRAB px of the stalk's centre; a
// selected note beats an unselected one, the selected track beats the rest,
// then the nearest — so a chord's stalks (one x) resolve to the one you lasso'd
export function velHit(x) {
  const g = velGeom();
  let best = null, bestKey = Infinity;
  for (const it of velVisible(g)) {
    const d = Math.abs(it.x + VEL_STALK_W / 2 - x);
    if (d > VEL_GRAB) continue;
    const key = (velIsSel(it) ? 0 : it.ti === S.selTrack ? 100 : 200) + d;
    if (key < bestKey) { best = it; bestKey = key; }
  }
  return best;
}
// proportional scaling: the grabbed note (pre-drag v0) follows the finger to
// v; every other note in the selection keeps its ratio to it, clamped 1..127
export function velScaled(preV, v0, v) { return velClamp(Math.round(preV * (v / Math.max(1, v0)))); }
export function velDragApply(v) {
  const d = S.velDrag;
  d.v = v;
  if (d.items.length === 1) d.items[0].n.v = v;
  else d.items.forEach((it, i) => { it.n.v = velScaled(d.pre[i].v, d.v0, v); });
}
export function velLockedLine() {
  return isComposition() ? "velocity edits work on your own songs"
    : "these velocities are facts from the capture — Edit a copy (File ▾) to shape them";
}
export function velPtrY(e) { return e.clientY - velCanvas.getBoundingClientRect().top; }
// the one selected note's shape points on screen: [{x, y, k}] (empty unless exactly one note is selected and it has a shape)
export function velShapeHandles(g) {
  const items = S.song ? selEditItems() : [];
  if (items.length !== 1) return null;
  const {ti, ni, n} = items[0], pts = shapePoints(n);
  if (!pts.length) return null;
  const x0 = velNoteX(n, g), ppt = pxPerTick();
  return {ti, ni, n, x0, ppt, handles: pts.map((q, k) => ({k, x: x0 + q.t * ppt, y: g.yOf(shapeLevel(n, q))}))};
}
export function velShapeHit(x, y) {
  const g = velGeom(), hs = velShapeHandles(g);
  if (!hs) return null;
  let best = null, bestD = Infinity;
  for (const h of hs.handles) {
    const d = Math.hypot(h.x - x, (h.y - y) * 0.6); // a finger is wider than it is tall here: the lane is 72 px
    if (d < 14 && d < bestD) { best = h; bestD = d; }
  }
  return best ? {...hs, k: best.k} : null;
}
export function velShapeMove(e) {
  const d = S.shapeDrag, g = velGeom(), r = velCanvas.getBoundingClientRect();
  const t = (e.clientX - r.left - d.x0) / d.ppt;
  const level = Math.max(0, Math.min(127, Math.round((g.bot - velPtrY(e)) / (g.bot - g.top) * 127)));
  shapeMovePoint(d.n, d.k, t, level);
  d.level = level;
}
export function velPointerDown(e) {
  if (!velLaneWanted()) return;
  const r = velCanvas.getBoundingClientRect();
  const sh = velShapeHit(e.clientX - r.left, velPtrY(e));
  if (sh) {
    if (!editableSong()) { setInfo(isComposition() ? "shape edits work on your own songs" : "this shape is a fact from the capture — Edit a copy (File ▾) to change it"); return; }
    velCanvas.setPointerCapture(e.pointerId);
    const {ti, ni, n} = sh;
    S.shapeDrag = {pid: e.pointerId, ti, ni, n, k: sh.k, x0: sh.x0, ppt: sh.ppt, level: null, moved: false,
      pre: [{ti, ni, t: n.t, d: n.d, p: n.p, v: n.v, ...shapeSnap(n)}]};
    setInfo("shape point " + (sh.k + 1) + " — drag to move it in time and level");
    return;
  }
  const hit = velHit(e.clientX - r.left);
  if (!hit) return;
  if (!editableSong()) { setInfo(velLockedLine()); return; }
  velCanvas.setPointerCapture(e.pointerId);
  const items = velIsSel(hit) ? selEditItems() : [hit];
  const pre = items.map(({ti, ni, n}) => ({ti, ni, t: n.t, d: n.d, p: n.p, v: n.v}));
  S.velDrag = {pid: e.pointerId, items, pre, v0: hit.n.v, v: hit.n.v, hit, moved: false};
  setInfo("velocity " + hit.n.v + (items.length > 1 ? " — drag scales all " + items.length + " selected notes together" : ""));
  drawVelLane();
}
export function velPointerMove(e) {
  const sd = S.shapeDrag;
  if (sd && sd.pid === e.pointerId) { sd.moved = true; velShapeMove(e); draw(); return; }
  const d = S.velDrag;
  if (!d || d.pid !== e.pointerId) return;
  const v = velGeom().vOf(velPtrY(e));
  if (d.moved && v === d.v) return;
  d.moved = true;
  velDragApply(v);
  draw(); // the roll's note brightness tracks the drag; drawFull repaints the lane too
}
export function velPointerUp(e, cancelled) {
  const sd = S.shapeDrag;
  if (sd && sd.pid === e.pointerId) {
    S.shapeDrag = null;
    const pre = sd.pre[0], now = JSON.stringify(shapeSnap(sd.n)), before = JSON.stringify({env: pre.env, ve: pre.ve});
    if (cancelled || !sd.moved || now === before) { // a lost pointer or a still tap: the shape goes back
      if (pre.env) sd.n.env = pre.env.map(q => ({...q})); else delete sd.n.env;
      draw();
      return;
    }
    selEditApply([{ti: sd.ti, ni: sd.ni, n: sd.n}], () => {}, sd.pre); // one undo step for the drag
    setInfo("shape point " + (sd.k + 1) + " → level " + sd.level + " (undo restores it)");
    return;
  }
  const d = S.velDrag;
  if (!d || d.pid !== e.pointerId) return;
  S.velDrag = null;
  const changed = d.items.some((it, i) => it.n.v !== d.pre[i].v);
  if (cancelled || !changed) { // a lost pointer puts the notes back; a still tap edits nothing
    d.items.forEach((it, i) => { it.n.v = d.pre[i].v; });
    draw();
    return;
  }
  selEditApply(d.items, () => {}, d.pre); // one undo step for the whole drag, as the vol slider's release does
  setInfo(d.items.length === 1 ? "velocity " + d.items[0].n.v + " (undo restores " + d.pre[0].v + ")"
                               : "scaled " + d.items.length + " notes' velocities by the grabbed note, " + d.v0 + " → " + d.v + " (one undo restores them)");
}
export function drawVelLane() {
  applyVelLane();
  if (!velLaneWanted()) return;
  const g = velGeom(), W = velWrap.clientWidth, H = g.H, x0 = g.left + S.RULER_W;
  vctx.fillStyle = css("--panel");
  vctx.fillRect(0, 0, W, H);
  vctx.fillStyle = css("--dim");
  vctx.font = "10px " + css("--mono");
  vctx.textAlign = "left";
  vctx.fillText("vel", g.left + 6, 12);
  vctx.strokeStyle = css("--grid-soft");
  vctx.lineWidth = 1;
  for (const v of [32, 64, 96]) { // quarter guides, like the roll's own pitch-row banding
    const y = Math.round(g.yOf(v)) + 0.5;
    vctx.beginPath(); vctx.moveTo(x0, y); vctx.lineTo(W, y); vctx.stroke();
  }
  vctx.save();
  vctx.beginPath(); vctx.rect(x0, 0, W - x0, H); vctx.clip();
  const ppt = pxPerTick();
  for (const it of velVisible(g)) {
    const sel = velIsSel(it), y = g.yOf(it.n.v);
    vctx.globalAlpha = sel ? 1 : it.ti === S.selTrack ? 0.85 : 0.4;
    vctx.fillStyle = trackColor(it.ti);
    vctx.fillRect(it.x, y, VEL_STALK_W, g.bot - y);
    vctx.fillRect(it.x - 1, y - 1.5, VEL_STALK_W + 2, 3); // the head: where the finger grabs
    if (sel) { vctx.strokeStyle = css("--gold"); vctx.strokeRect(it.x - 1.5, y - 2.5, VEL_STALK_W + 3, g.bot - y + 2.5); }
    const pts = shapePoints(it.n);
    if (pts.length) { // the volume shape: velocity, through each point, the last level held to the note's end
      vctx.globalAlpha = sel ? 0.95 : 0.5;
      vctx.strokeStyle = trackColor(it.ti);
      vctx.beginPath();
      vctx.moveTo(it.x + VEL_STALK_W, y);
      let ly = y;
      for (const q of pts) { ly = g.yOf(shapeLevel(it.n, q)); vctx.lineTo(it.x + q.t * ppt, ly); }
      vctx.lineTo(it.x + Math.max(VEL_STALK_W + 4, it.n.d * ppt), ly);
      vctx.stroke();
    } else if (it.n.ve !== undefined && it.n.ve < it.n.v) { // a chip note's envelope decay target (parse.js): a fact, falling across the note
      vctx.globalAlpha = 0.5;
      vctx.strokeStyle = trackColor(it.ti);
      vctx.beginPath();
      vctx.moveTo(it.x + VEL_STALK_W, y);
      vctx.lineTo(it.x + Math.max(VEL_STALK_W + 4, it.n.d * ppt), g.yOf(it.n.ve));
      vctx.stroke();
    }
  }
  vctx.globalAlpha = 1;
  const hs = velShapeHandles(g);
  if (hs) { // the selected note's points: grab handles
    vctx.fillStyle = css("--gold");
    for (const h of hs.handles) { vctx.beginPath(); vctx.arc(h.x, h.y, 4, 0, Math.PI * 2); vctx.fill(); }
  }
  if (S.shapeDrag && S.shapeDrag.level !== null && hs && hs.handles[S.shapeDrag.k]) { // the live level beside the grabbed point
    const h = hs.handles[S.shapeDrag.k], right = h.x + 40 > W;
    vctx.fillStyle = css("--text");
    vctx.font = "11px " + css("--mono");
    vctx.textAlign = right ? "right" : "left";
    vctx.fillText(String(S.shapeDrag.level), h.x + (right ? -8 : 8), Math.max(12, Math.min(H - 4, h.y + 4)));
  }
  if (S.velDrag) { // the live value beside the grabbed stalk
    const d = S.velDrag, y = g.yOf(d.hit.n.v), right = d.hit.x + 40 > W;
    vctx.fillStyle = css("--text");
    vctx.font = "11px " + css("--mono");
    vctx.textAlign = right ? "right" : "left";
    vctx.fillText(String(d.hit.n.v), d.hit.x + (right ? -6 : VEL_STALK_W + 6), Math.max(12, Math.min(H - 4, y + 4)));
  }
  vctx.restore();
}

export function initVellane1() {
  try { S.vwVel = localStorage.getItem("ff1roll-vel-open") === "1"; } catch (err) { S.vwVel = false; }
  velCanvas.addEventListener("pointerdown", velPointerDown);
  velCanvas.addEventListener("pointermove", velPointerMove);
  velCanvas.addEventListener("pointerup", e => velPointerUp(e, false));
  velCanvas.addEventListener("pointercancel", e => velPointerUp(e, true));
  new ResizeObserver(() => { if (velWrap.classList.contains("on")) velResize(); }).observe(velWrap);
  applyVelLane();
}
