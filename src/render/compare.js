import { S } from "../state.js";
import { topRow } from "./roll.js";
import { noteRow } from "./roll.js";
import { ctx } from "./roll.js";
import { trackShown } from "./roll.js";
import { css } from "./roll.js";

// ---------------------------------------------------------------- Compare with repo
// Josh (2026-09-25): "I have seven songs where it says the notes are changed,
// but I don't know what things have changed." The open composition's notes
// against its last save: the roll outlines every difference and one tap swaps
// which version plays. Nothing is written — the draft stays the draft — and
// hearing the saved copy makes the song read-only until you swap back.
// `cmp` itself is declared with the other editor state near the top (setSong and
// editableSong read it, and a draft can open synchronously at boot — TDZ).
export function cmpTrackKey(t, i) { return t.name || "#" + i; }
// match tracks by name, unnamed ones by position
export function cmpDiff(repoTracks, curTracks) { // tick+pitch is a note's identity (tools/song-diff.mjs's rule); tombstones don't count
  const key = n => n.t + ":" + n.p;
  const out = {tracks: [], added: 0, removed: 0, changed: 0};
  const cur = new Map(curTracks.map((t, i) => [cmpTrackKey(t, i), {t, i}]));
  const rep = new Map(repoTracks.map((t, i) => [cmpTrackKey(t, i), t]));
  for (const k of new Set([...cur.keys(), ...rep.keys()])) {
    const c = cur.get(k), r = rep.get(k);
    const ma = new Map((r ? r.notes : []).filter(n => !n.gone).map(n => [key(n), n]));
    const mb = new Map((c ? c.t.notes : []).filter(n => !n.gone).map(n => [key(n), n]));
    const added = [...mb.values()].filter(n => !ma.has(key(n)));
    const removed = [...ma.values()].filter(n => !mb.has(key(n)));
    const changed = [...mb.values()].filter(n => { const o = ma.get(key(n)); return o && (o.d !== n.d || o.v !== n.v); })
      .map(n => ({now: n, was: ma.get(key(n))}));
    if (added.length || removed.length || changed.length) out.tracks.push({name: k, ti: c ? c.i : -1, added, removed, changed});
    out.added += added.length; out.removed += removed.length; out.changed += changed.length;
  }
  return out;
}
export function drawCompare(ppt, rowH, W, H) { // outlines only: red = the saved copy's note, gold = yours; dashed = absent from what you hear
  const rect = (n, ti) => {
    const x = S.RULER_W + n.t * ppt - S.view.x, w = Math.max(3, n.d * ppt - 1);
    if (x + w < S.RULER_W || x > W) return null;
    const y = S.RULER_H + (topRow() - noteRow(ti, n.p)) * rowH - S.view.y;
    if (y < S.RULER_H - rowH || y > H) return null;
    return [x, y + 1.5, w, rowH - 3];
  };
  const stroke = (n, ti) => { const r = rect(n, ti); if (!r) return; ctx.beginPath(); ctx.roundRect(r[0], r[1], r[2], r[3], 2.5); ctx.stroke(); };
  const mine = S.cmp.showing === "mine";
  ctx.globalAlpha = 1; ctx.lineWidth = 2;
  for (const t of S.cmp.diff.tracks) {
    if (t.ti < 0 || !trackShown(t.ti)) continue;
    ctx.strokeStyle = "#e66767"; ctx.setLineDash(mine ? [4, 3] : []);
    for (const n of t.removed) stroke(n, t.ti);
    for (const c of t.changed) stroke(c.was, t.ti);
    ctx.strokeStyle = css("--gold"); ctx.setLineDash(mine ? [] : [4, 3]);
    for (const n of t.added) stroke(n, t.ti);
    for (const c of t.changed) stroke(c.now, t.ti);
  }
  ctx.setLineDash([]); ctx.lineWidth = 1;
}
