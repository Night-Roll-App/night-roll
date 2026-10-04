import { S, prof } from "../state.js";
import { wrap } from "./roll.js";
import { trackIsDrums } from "../model/grid.js";
import { kitSlots } from "./roll.js";
import { pxPerTick } from "./roll.js";
import { clipEndTick } from "../model/song.js";
import { barTicks } from "../model/rollnotes.js";
import { clipLen } from "../model/song.js";
import { fmtBarBeat } from "../gen/drummer.js";
import { songHasAudio } from "../model/song.js";
import { AUDIO_STRIP_H } from "./roll.js";
import { ctx } from "./roll.js";
import { css } from "./roll.js";
import { forEachClip } from "../audio/clips.js";
import { trackColor } from "./roll.js";
import { tickToSec } from "../midi/parse.js";
import { stretchPending } from "../audio/clips.js";
import { drawRangeTints } from "./roll.js";
import { secToTick } from "../midi/parse.js";
import { playSec } from "../audio/transport.js";

// ---- TRACKS VIEW (advisor-designed, 2026-08-22): one lane per track, note
// thumbnails per-lane-normalized, headers with M/S/fader. Time axis is the
// roll's own map — ruler, cycle, bar magnet, playhead all shared. ----
export function tracksLaneH() {
  const n = S.song ? S.song.tracks.length : 1;
  return Math.max(44, Math.min(88, Math.floor((wrap.clientHeight - S.RULER_H) / Math.max(1, n))));
}
export function laneGeom(ti) { // screen box + pitch normalization for one track's lane
  const lh = tracksLaneH();
  const y0 = S.RULER_H + ti * lh - S.view.y;
  const tr = S.song.tracks[ti];
  let lo = Infinity, hi = -Infinity;
  if (trackIsDrums(ti)) { lo = 0; hi = Math.max(1, kitSlots().length - 1); }
  else {
    for (const n of tr.notes) if (!n.gone) { if (n.p < lo) lo = n.p; if (n.p > hi) hi = n.p; }
    if (lo === Infinity) { lo = 57; hi = 69; }
    if (hi - lo < 12) { const mid = (hi + lo) / 2; lo = mid - 6; hi = mid + 6; } // min one-octave span
  }
  return {y0, lh, lo, hi};
}
export function trackLaneAt(y) {
  const ti = Math.floor((y - S.RULER_H + S.view.y) / tracksLaneH());
  return S.song && ti >= 0 && ti < S.song.tracks.length ? ti : -1;
}
export function tracksNoteY(g, ti, p) { // y of a note's center inside its lane
  const inner = g.lh - 8;
  const frac = trackIsDrums(ti)
    ? (kitSlots().indexOf(p) < 0 ? 0.5 : kitSlots().indexOf(p) / Math.max(1, kitSlots().length - 1))
    : 1 - (p - g.lo) / Math.max(1, g.hi - g.lo);
  return g.y0 + 4 + frac * inner;
}
// ti of the selected audio clip (tracks view), or null
// selClip = {ti, ci} of the selected piece. A piece spans [at, at + len] in
// song time and plays the file from `offset`; nothing sounds before its anchor.
export function selClipIs(ti, ci) { return !!S.selClip && S.selClip.ti === ti && S.selClip.ci === ci; }
export function selClipObj() { return S.selClip && S.song.tracks[S.selClip.ti] && S.song.tracks[S.selClip.ti].clips ? S.song.tracks[S.selClip.ti].clips[S.selClip.ci] || null : null; }
export function clipSpanX(c) { // screen x0/x1 of the piece's body, ghost applied while it drags (move or a trim edge)
  const ppt = pxPerTick();
  const sel = selClipObj() === c && S.tracksGhost ? S.tracksGhost : null;
  let t0 = c.at, t1 = c.dur ? clipEndTick(c) : c.at + barTicks();
  if (sel) {
    if (sel.zone === "clip") { t0 += sel.dT; t1 += sel.dT; }
    else if (sel.zone === "clipL") t0 = Math.min(t1 - 1, t0 + sel.dT);
    else if (sel.zone === "clipR") t1 = Math.max(t0 + 1, t1 + sel.dT);
  }
  return {x0: S.RULER_W + t0 * ppt - S.view.x, x1: S.RULER_W + t1 * ppt - S.view.x};
}
export function clipStatusText(c) {
  return c.status === "ready" ? "" : c.status === "missing" ? "audio missing on this device"
       : c.status === "undecodable" ? "can't decode this file" : "decoding…";
}
export function clipLabel(ti, ci) {
  const tr = S.song.tracks[ti], c = tr.clips[ci];
  const where = c.where === "device" || !c.where ? "on this device only" : c.where === "folder" ? "in your folder" : "in the repo";
  return (tr.name || "track") + (tr.clips.length > 1 ? " · piece " + (ci + 1) + "/" + tr.clips.length : "") + " · " + c.file +
    (c.dur ? " · " + fmtSec(clipLen(c)) + " of " + fmtSec(c.dur) : "") +
    " · starts " + fmtBarBeat(c.at) + (c.offset ? " · from " + c.offset.toFixed(3) + "s in" : "") +
    " · " + (clipStatusText(c) || where) + (c.local ? " · someone else's recording — never uploaded" : "");
}
export function fmtSec(s) { const m = Math.floor(s / 60); return m + ":" + String(Math.floor(s - m * 60)).padStart(2, "0"); }
export function drawAudioStrip(W) { // every view: one bar per clip, "a recording plays here"
  if (!songHasAudio()) return;
  const y = S.STRIP_Y - AUDIO_STRIP_H; // bottom of the old ruler band — right above the playhead strip
  ctx.fillStyle = css("--grid-soft");
  ctx.fillRect(S.RULER_W, y, W - S.RULER_W, AUDIO_STRIP_H);
  ctx.font = "10px " + css("--mono");
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  forEachClip((c, ti) => {
    const {x0, x1} = clipSpanX(c);
    if (x1 < S.RULER_W || x0 > W) return;
    const l = Math.max(S.RULER_W, x0), r = Math.min(W, x1);
    ctx.fillStyle = trackColor(ti);
    ctx.globalAlpha = c.status === "ready" ? 0.55 : 0.25;
    ctx.fillRect(l, y + 3, Math.max(2, r - l), AUDIO_STRIP_H - 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = css("--text");
    const label = "∿ " + (S.song.tracks[ti].name || "audio") + (clipStatusText(c) ? " — " + clipStatusText(c) : "");
    if (r - l > 40) ctx.fillText(label.slice(0, Math.floor((r - l) / 6)), l + 4, y + AUDIO_STRIP_H / 2);
  });
  ctx.textBaseline = "alphabetic";
}
export function drawClipLane(ti, ci, g, W) { // tracks view: one piece's waveform (peaks per pixel column)
  const c = S.song.tracks[ti].clips[ci];
  const {x0, x1} = clipSpanX(c);
  if (x1 < S.RULER_W || x0 > W || x1 <= x0) return;
  const l = Math.max(S.RULER_W, x0), r = Math.min(W, x1);
  const mid = g.y0 + g.lh / 2, half = (g.lh - 10) / 2;
  ctx.fillStyle = trackColor(ti);
  if (!c.peaks || !c.dur) { // not decoded (yet): a dim bar that says why
    ctx.globalAlpha = 0.2;
    ctx.fillRect(l, g.y0 + 4, Math.max(2, r - l), g.lh - 8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = css("--dim");
    ctx.font = "11px " + css("--mono");
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(c.file + " — " + clipStatusText(c), l + 6, mid);
    return;
  }
  // pixel → file time: the piece shows file seconds [offset, offset + len] across [x0, x1]
  // (a trim-edge ghost stretches the visible window with it, so the sound stays put)
  const sel = selClipObj() === c && S.tracksGhost ? S.tracksGhost : null;
  let off = c.offset, len = clipLen(c);
  if (sel && sel.zone === "clipL") { const d = (tickToSec(S.song, c.at + sel.dT) - tickToSec(S.song, c.at)) * S.playRate; off += d; len -= d; }
  if (sel && sel.zone === "clipR") len += (tickToSec(S.song, c.at + sel.dT) - tickToSec(S.song, c.at)) * S.playRate;
  const nb = c.peaks.length / 2, bpsec = nb / c.dur; // buckets per file second
  ctx.globalAlpha = 0.75;
  for (let x = Math.floor(l); x < r; x++) {
    const f0 = off + ((x - x0) / (x1 - x0)) * len, f1 = off + ((x + 1 - x0) / (x1 - x0)) * len;
    const k0 = Math.floor(f0 * bpsec), k1 = Math.max(k0 + 1, Math.floor(f1 * bpsec));
    let lo = 1, hi = -1;
    for (let k = Math.max(0, k0); k < Math.min(nb, k1); k++) { const a = c.peaks[k * 2], b = c.peaks[k * 2 + 1]; if (a < lo) lo = a; if (b > hi) hi = b; }
    if (hi < lo) continue;
    const yTop = mid - hi * half, yBot = mid - lo * half;
    ctx.fillRect(x, yTop, 1, Math.max(1, yBot - yTop));
  }
  ctx.globalAlpha = 1;
  ctx.fillRect(l, g.y0 + 4, 1, g.lh - 8); // piece edges — also the trim handles in Select
  ctx.fillRect(r - 1, g.y0 + 4, 1, g.lh - 8);
  if (stretchPending(c)) { // the slowed copy is rendering: this piece is silent until it lands
    ctx.fillStyle = css("--dim");
    ctx.font = "11px " + css("--mono");
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("⏳ preparing " + Math.round(S.playRate * 100) + "% (pitch kept)…", l + 6, g.y0 + 12);
  }
  if (selClipIs(ti, ci)) {
    ctx.strokeStyle = css("--gold");
    ctx.strokeRect(l + 0.5, g.y0 + 3.5, r - l - 1, g.lh - 7);
    if (S.mode === "select") { // handle nubs so the edges read as grabbable
      ctx.fillStyle = css("--gold");
      ctx.fillRect(l, mid - 8, 3, 16);
      ctx.fillRect(r - 3, mid - 8, 3, 16);
    }
  }
}
export function drawTracks(W, H, skipCursor) {
  const ppt = pxPerTick();
  drawRangeTints(W, H);
  for (let ti = 0; ti < S.song.tracks.length; ti++) {
    const g = laneGeom(ti);
    if (g.y0 + g.lh < S.RULER_H || g.y0 > H) continue;
    // lane body
    if (ti === S.selTrack) {
      ctx.fillStyle = css("--accent");
      ctx.globalAlpha = 0.05;
      ctx.fillRect(S.RULER_W, g.y0, W - S.RULER_W, g.lh);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = css("--grid");
    ctx.beginPath(); ctx.moveTo(0, g.y0 + g.lh - 0.5); ctx.lineTo(W, g.y0 + g.lh - 0.5); ctx.stroke();
    // notes (thumbnail): per-lane normalized; ghost offset applies to the selection
    const tr = S.song.tracks[ti];
    if (tr.kind === "audio") tr.clips.forEach((c, ci) => drawClipLane(ti, ci, g, W));
    const noteH = Math.max(2, Math.min(8, (g.lh - 8) / Math.max(12, g.hi - g.lo)));
    tr.notes.forEach((n, ni) => {
      if (n.gone) return;
      const selHere = S.multiSelKey.has(ti + ":" + ni) || (S.selNote && S.selNote.ti === ti && S.selNote.ni === ni);
      const gdT = selHere && S.tracksGhost ? S.tracksGhost.dT : 0;
      const x = S.RULER_W + (n.t + gdT) * ppt - S.view.x;
      const w = Math.max(2, n.d * ppt);
      if (x + w < S.RULER_W || x > W) return;
      let y = tracksNoteY(g, ti, n.p);
      if (selHere && S.tracksGhost && S.tracksGhost.dLane) y += S.tracksGhost.dLane * g.lh;
      ctx.fillStyle = trackColor(ti);
      ctx.globalAlpha = (selHere && S.tracksGhost ? 0.6 : 0.55 + 0.45 * ((n.v || 80) / 127));
      ctx.fillRect(x, y - noteH / 2, w, noteH);
      ctx.globalAlpha = 1;
      if (selHere) {
        ctx.strokeStyle = css("--gold");
        ctx.strokeRect(x - 0.5, y - noteH / 2 - 0.5, w + 1, noteH + 1);
      }
    });
    // header column (over the notes' left edge)
    ctx.fillStyle = css("--panel");
    ctx.fillRect(0, g.y0, S.RULER_W, g.lh);
    ctx.strokeStyle = css("--grid");
    ctx.beginPath(); ctx.moveTo(S.RULER_W - 0.5, g.y0); ctx.lineTo(S.RULER_W - 0.5, g.y0 + g.lh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, g.y0 + g.lh - 0.5); ctx.lineTo(S.RULER_W, g.y0 + g.lh - 0.5); ctx.stroke();
    ctx.fillStyle = trackColor(ti);
    ctx.beginPath(); ctx.arc(12, g.y0 + 14, 4, 0, 7); ctx.fill();
    ctx.fillStyle = ti === S.selTrack ? css("--gold") : css("--text");
    ctx.font = "11px " + css("--mono");
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText((tr.name || "track " + (ti + 1)).slice(0, 10) + (tr.kind === "audio" ? " ∿" : ""), 22, g.y0 + 14);
    // M / S chips
    const st = S.trackState[ti] || {};
    const chip = (label, on, x0) => {
      ctx.fillStyle = on ? css("--gold") : css("--panel2");
      ctx.fillRect(x0, g.y0 + 24, 22, 16);
      ctx.fillStyle = on ? "#111" : css("--dim");
      ctx.textAlign = "center";
      ctx.fillText(label, x0 + 11, g.y0 + 32);
      ctx.textAlign = "left";
    };
    chip("M", !!st.muted, 8);
    chip("S", !!st.solo, 34);
    // fader (hidden when the lane is squeezed; vol% always shows)
    const vol = tr.vol === undefined ? 1 : tr.vol;
    if (g.lh >= 56) {
      const fx = 62, fw = 56, fy = g.y0 + 32;
      ctx.strokeStyle = css("--grid");
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + fw, fy); ctx.stroke();
      ctx.fillStyle = css("--accent");
      ctx.beginPath(); ctx.arc(fx + fw * Math.min(1, vol / 1.5), fy, 5, 0, 7); ctx.fill();
    }
    ctx.fillStyle = css("--dim");
    ctx.textAlign = "right";
    ctx.fillText(Math.round(vol * 100) + "%", S.RULER_W - 8, g.y0 + 14);
    ctx.textAlign = "left";
  }
  // playhead — never into the scene cache: playbackFrame lays the live one
  // over the cached scene, and a wheel scroll mid-play re-cached this view
  // WITH a playhead, so a frozen twin stood beside the moving one (Josh,
  // 2026-09-16, graveyard-2 in Tracks)
  if (skipCursor) return;
  const x = S.RULER_W + (S.playing ? secToTick(S.song, playSec()) : S.playCursor) * ppt - S.view.x;
  ctx.fillStyle = S.playing ? css("--gold") : css("--accent");
  ctx.fillRect(x - (S.playing ? 0 : 1), 0, S.playing ? 1.5 : 2.5, H);
  ctx.beginPath();
  ctx.moveTo(x - 11, S.RULER_H); ctx.lineTo(x + 11, S.RULER_H); ctx.lineTo(x, S.RULER_H + 14);
  ctx.fill();
}
drawTracks = prof("drawTracks", drawTracks); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
