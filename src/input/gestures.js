import { canvas } from "../render/roll.js";
import { S } from "../state.js";
import { pxPerTick } from "../render/roll.js";
import { topRow } from "../render/roll.js";
import { fallActive, stripPlayheadX, TAG_HIT } from "../render/roll.js";
import { scoreTickToX } from "../render/score.js";
import { barTicks } from "../model/rollnotes.js";

// ---------------------------------------------------------------- hit test / coords
export function evtPos(e) {
  const r = canvas.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return {x: p.clientX - r.left, y: p.clientY - r.top};
}
export function posToTickPitch(pos) { // pitch is a DISPLAY ROW (kit lane rows sit above PMAX)
  const tick = (pos.x - S.RULER_W + S.view.x) / pxPerTick();
  const pitch = topRow() - Math.floor((pos.y - S.RULER_H + S.view.y) / S.view.rowH);
  return {tick, pitch};
}
export function cursorHandleHit(pos) { // the tag in the playhead strip — grabbable in
  // ANY mode and while PLAYING (the strip already scrubs mid-play; one rule
  // for both). It outranks the strip's own tap-to-snap: a finger ON the
  // handle is a grab, never a jump to the nearest 8th.
  if (!S.song || fallActive()) return false;
  return pos.y >= S.STRIP_Y && pos.y < S.RULER_H && Math.abs(pos.x - stripPlayheadX()) <= TAG_HIT;
}
export function cursorHit(pos) {
  if (cursorHandleHit(pos)) return true;
  if (S.playing || !S.song) return false;
  if (pos.y < S.RULER_H) return false; // ruler drags select a range instead
  const x = S.viewMode === "score" ? scoreTickToX(S.playCursor)
                                 : S.RULER_W + S.playCursor * pxPerTick() - S.view.x;
  return S.mode === "select" || S.mode === null ? Math.abs(pos.x - x) < 12 : false; // the line itself, at rest
}
export function rulerSnapX(x) { // bar lines are magnetic in SCREEN pixels (Pencil-friendly
  // at every zoom); away from a bar line, 16ths — finer is what zoom is for
  const fine = tickAtX(x, Math.round(S.song.ppq / 4));
  const bt = barTicks(), ppt = pxPerTick();
  const nearBar = Math.round(fine / bt) * bt;
  return Math.abs((nearBar - fine) * ppt) <= 14 ? Math.max(0, nearBar) : fine;
}
export function tickAtX(x, snap) {
  const t = (x - S.RULER_W + S.view.x) / pxPerTick();
  return Math.max(0, Math.round(t / snap) * snap);
}
export function armNoteEdit(pe) { // a grab became real: NOW selection may change
  if (pe.reselect) {
    const [ti, ni] = pe.hitKey.split(":").map(Number);
    S.multiSel = [{ti, ni}];
    S.multiSelKey = new Set([pe.hitKey]);
  }
}
