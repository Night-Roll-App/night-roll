import { S } from "../state.js";

export function updateTrackMore() {
  const bar = document.getElementById("trackbar");
  const more = document.getElementById("trackmore");
  const slide = document.getElementById("trackslide");
  bar.classList.toggle("collapsed", !S.trackExpand);
  // never measure while the cluster is hidden or mid-slide — a squeezed
  // width wraps every chip and poisons the disclosure state
  if (slide && (slide.classList.contains("off") || slide.clientWidth < 60)) return;
  // reading scrollHeight forces a fresh layout — measure synchronously
  const overflowing = bar.scrollHeight > bar.clientHeight + 2;
  more.style.display = overflowing || S.trackExpand ? "" : "none";
  more.textContent = S.trackExpand ? "▴" : "▾";
}
// chips too wide to sit beside the transport (the AI window docked wide cut
// them to "pu…" — Josh, 2026-10-02) move to their own full-width row. The
// decision reads ONLY the row's width against a threshold that stacking
// cannot change: the transport's buttons (their own widths, summed) plus the
// chips' full text widths (scrollWidth — the same squeezed or not). An
// earlier version also read the ▾ overflow signal, which the stacking itself
// flips; at some widths it toggled every frame and the iPad blinked nonstop
// (0692e13, reverted). Unstacking needs TRACK_ROW_SLACK more room, so a
// width right at the threshold can't flip back and forth either.
export const TRACK_ROW_SLACK = 60;
export function trackRowNeed() {
  const tp = document.getElementById("transport"), bar = document.getElementById("trackbar"), tog = document.getElementById("tracktoggle");
  const kids = el => [...el.children].filter(c => c.offsetParent !== null || c.style.display !== "none");
  const tc = document.getElementById("timectl");
  const tw = kids(tp).reduce((w, c) => w + c.offsetWidth + 8, 0) + (tc ? kids(tc).reduce((w, c) => w + c.offsetWidth + 8, 8) : 0); // the time controls ride the same row
  const cw = kids(bar).reduce((w, c) => w + Math.max(c.scrollWidth, c.offsetWidth) + 8, 0);
  return tw + cw + (tog ? tog.offsetWidth + 16 : 0) + 24;
}
export function fitTrackRow() {
  const row = document.getElementById("trackrow");
  if (!row || !row.clientWidth) return;
  const stacked = row.classList.contains("stacked"), need = trackRowNeed(), w = row.clientWidth;
  const stack = stacked ? w < need + TRACK_ROW_SLACK : w < need;
  if (stack !== stacked) { row.classList.toggle("stacked", stack); updateTrackMore(); }
}
export function scheduleFitTrackRow() { // a function property, not S: called from observers only
  if (scheduleFitTrackRow.pending) return;
  scheduleFitTrackRow.pending = true;
  requestAnimationFrame(() => { scheduleFitTrackRow.pending = false; fitTrackRow(); });
}
