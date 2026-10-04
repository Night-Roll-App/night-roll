import { S, prof } from "../state.js";
import { trackIsDrums } from "../model/grid.js";
import { secToTick } from "../midi/parse.js";
import { playSec } from "../audio/transport.js";
import { scoreTickToX } from "./score.js";
import { barTicks } from "../model/rollnotes.js";
import { beatTicks } from "../model/grid.js";
import { drawAudioStrip } from "./tracks.js";
import { appMode } from "../platform/mode.js";
import { isDirective } from "../model/rollnotes.js";
import { isCopyableAnno } from "../model/rollnotes.js";

export const DRUM_LABELS = {35: "kick2", 36: "kick", 37: "stick", 38: "snare", 40: "snar2",
  41: "tomF", 42: "hat", 43: "tomL", 44: "hatP", 45: "tom", 46: "hatO",
  47: "tomM", 48: "tomH", 49: "crash", 51: "ride"};
// GM kit rows, shown while a drum track is selected
export const DRUM_SLOTS = [42, 38, 36, 46, 44, 49, 51, 48, 47, 45, 43, 41, 40, 37, 35];
// cached with _laneTop (same reset points)
export function kitSlots() { // visible lane rows: the trio always, plus whatever the song USES —
  // unused pieces hide so the lane stays small ("I have no toms at all; hide those")
  if (S.kitShowAll) return DRUM_SLOTS;
  if (S._kitSlots) return S._kitSlots;
  const used = new Set();
  if (S.song) S.song.tracks.forEach((tr, ti) => {
    if (trackIsDrums(ti)) for (const n of tr.notes) if (!n.gone) used.add(n.p);
  });
  S._kitSlots = DRUM_SLOTS.filter((p, i) => i < 3 || used.has(p));
  return S._kitSlots;
}
export function songHasDrums() { return !!S.song && S.song.tracks.some((_, ti) => trackIsDrums(ti)); }
export function topRow() { return S.PMAX; }
// cached per edit/draw — kitLaneTop scans every note
export function computeLaneTop() { // the lane DOCKS just under the lowest melodic note
  // (Josh: an empty octave sat between his bass and the kick) — and slides
  // itself down if a lower note ever appears
  let lo = Infinity;
  S.song.tracks.forEach((tr, ti) => {
    if (trackIsDrums(ti)) return;
    for (const n of tr.notes) if (!n.gone && n.p < lo) lo = n.p;
  });
  if (lo === Infinity) lo = S.PMIN + kitSlots().length + 1; // empty song: lane at the floor
  return lo - 2; // one gap row between the bass and the hat
}
// Josh dragged the lane here — wins over auto-dock, saved per song
export function kitLaneTop() {
  if (S.laneOverride !== null) return S.laneOverride;
  if (S._laneTop === null) S._laneTop = computeLaneTop();
  return S._laneTop;
}
export function laneBotRow() { return kitLaneTop() - kitSlots().length + 1; }
export function botRow() { return songHasDrums() ? Math.min(S.PMIN, laneBotRow() - 3) : S.PMIN; }
// ⋯ expander row + two pitch rows of air under the kit (Josh: "show two more notes under the drums")
export function inKitLane(row) { return songHasDrums() && row <= kitLaneTop() + 1 && row >= laneBotRow() - 1; }
// -1: ⋯ row taps route through the lane gesture
export function noteRow(ti, p) { // display row: drums live in the docked lane
  if (!trackIsDrums(ti)) return p;
  const i = kitSlots().indexOf(p);
  return kitLaneTop() - (i < 0 ? 0 : i);
}
export function drumStep(p, d) { // vertical moves walk the VISIBLE kit slots, not semitones
  const ks = kitSlots();
  const i = ks.indexOf(p);
  return ks[Math.min(ks.length - 1, Math.max(0, (i < 0 ? 0 : i) + d))];
}
// Default track colors: farthest-point (max-min) selection (Josh 2026-10-02,
// replacing the fixed +150° walk — that only separated CONSECUTIVE indexes
// and still wrapped to 60° between the 1st and 3rd, "orange, blue, PINK").
// "There has to be some sort of algorithm that always picks the furthest
// color away from all the colors you currently have in a set." Candidates:
// 24 hues 15° apart, one fixed saturation/lightness (vivid enough to read as
// a chip at any hue), filtered by two hard rules — no black-ish or
// near-white candidate (near-white is excluded outright: on this dark theme
// it reads as the playhead/selection/highlight gold, never a track), and
// WCAG contrast >= 3 against the roll's own surfaces: --bg and the pitch-row
// shading drawn in drawFull (--grid-soft, --grid) — a chip must never blend
// into its own lane. All 24 candidates clear both bars after the lift (no
// dark/light theme split: there's only the one theme, see :root above).
export const AUTO_COLOR_S = 0.70, AUTO_COLOR_L = 0.50;
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3), g = hue2rgb(p, q, h), b = hue2rgb(p, q, h - 1 / 3);
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}
export function hueOf(hex) { // same formula tests use (and the only place in the app
  // that needs a hex→hue conversion), kept here so autoTrackColors and the
  // test can both check it against real song colors
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
export function hueDist(a, b) { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); }
export function relLuminance(hex) { // WCAG relative luminance
  const c = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(h => parseInt(h, 16) / 255);
  const lin = c.map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
export function contrastRatio(hexA, hexB) {
  const a = relLuminance(hexA), b = relLuminance(hexB);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}
// the roll's own surfaces a track chip is drawn over: --bg (the canvas fill)
// and the pitch-row shading drawFull paints over it (--grid-soft for black-key
// rows, --grid for the C/F orientation lines) — literal here (not css()
// lookups) because the candidate list is filtered once, before any canvas or
// computed style exists; keep these in sync with the :root values above if
// the theme ever changes
export const ROLL_SURFACE_COLORS = ["#0D1120", "#1A2138", "#242C48"];
export const TRACK_COLOR_CANDIDATES = (() => {
  const out = [];
  for (let h = 0; h < 360; h += 15) {
    // the old hand-picked palette's depth (L 0.50), lifted per hue only as far
    // as the contrast bar needs (blues/violets come out lighter) — a uniform
    // L 0.65 read pastel next to the colors Josh was used to
    let L = AUTO_COLOR_L, hex = hslToHex(h, AUTO_COLOR_S, L);
    while (L < 0.75 && ROLL_SURFACE_COLORS.some(s => contrastRatio(hex, s) < 3)) hex = hslToHex(h, AUTO_COLOR_S, L += 0.02);
    const l = relLuminance(hex);
    if (l < 0.08 || l > 0.85) continue; // black-ish / near-white band
    if (ROLL_SURFACE_COLORS.some(s => contrastRatio(hex, s) < 3)) continue; // must read against every roll surface
    out.push({ h, hex });
  }
  return out;
})();
// greedy max-min: the candidate whose MINIMUM circular hue distance to every
// hue already in play is the largest (an empty set has nothing to avoid —
// score is unbounded, so the tie-break alone decides: closest to orange).
// Ties prefer the candidate nearest 30° (orange — the very first pick always
// lands exactly there), then the lowest hue, so the walk is deterministic.
// returns the whole candidate ({h, hex}), not just hex — callers that just
// picked a color track its EXACT candidate hue, not hueOf(hex): the hex is
// quantized to 8-bit-per-channel, and recovering the hue from it can drift a
// few hundredths of a degree, enough to flip an exact tie (two candidates
// genuinely equidistant from everything in play) in iteration-order instead
// of by the tie-break rule below
export function pickFarthestColor(usedHues) {
  let best = null, bestScore = -1, bestTie = Infinity;
  for (const cand of TRACK_COLOR_CANDIDATES) {
    const score = usedHues.length ? Math.min(...usedHues.map(u => hueDist(cand.h, u))) : 360;
    const tie = hueDist(cand.h, 30);
    if (score > bestScore || (score === bestScore && (tie < bestTie || (tie === bestTie && cand.h < best.h)))) {
      best = cand; bestScore = score; bestTie = tie;
    }
  }
  return best;
}
// a plain categorical palette for things that just cycle through distinct
// colors (sectionColors below) — the same candidates, in the order the
// greedy walk would assign them to an all-auto track list
export const TRACK_COLORS = (() => {
  const used = [], out = [];
  for (let i = 0; i < TRACK_COLOR_CANDIDATES.length; i++) {
    const pick = pickFarthestColor(used);
    used.push(pick.h);
    out.push(pick.hex);
  }
  return out;
})();
export function autoTrackColors(tracks) {
  const key = tracks.map(t => t.color || "").join("|") + "#" + tracks.length;
  if (S._autoColorCache.key === key) return S._autoColorCache.colors;
  // S = every EXPLICIT color in the song, any index — Josh's own picks are
  // avoided even when they sit on a later track than the one being assigned.
  // An explicit color has no candidate h of its own, so it's the one place
  // hueOf(hex) is unavoidable.
  const used = [];
  tracks.forEach(t => { if (t.color) used.push(hueOf(t.color)); });
  const out = tracks.map(t => {
    if (t.color) return t.color;
    const pick = pickFarthestColor(used);
    used.push(pick.h);
    return pick.hex;
  });
  S._autoColorCache = { key, colors: out };
  return out;
}
// key dial preview override (null = follow regions)

export const canvas = document.getElementById("roll");
export const ctx = canvas.getContext("2d");
export const wrap = document.getElementById("rollwrap");
export const RULER_W_ROLL = 46, TRACKS_GUTTER = 148, BASE_RULER_H = 24, LANE_H = 15;
export const AUDIO_STRIP_H = 18;
// playhead/position strip (Josh, 2026-10-03): a band directly under the
// ruler, right above the notes — tap it to move the cursor WITHOUT parking
// or re-arming a cycle (the ruler itself keeps that behavior). Its own
// height matches the bar-number row. S.STRIP_Y (set alongside S.RULER_H,
// here and in finalizeNotes) is the strip's own top — the OLD meaning of
// RULER_H (ruler + section/chord/analysis rows + the audio strip, no
// playhead strip) — kept as its own field so the handful of call sites that
// mean "the ruler band, not the strip" (bandEdge grab, lassoAnno) still use
// it; everything that offsets the note area by RULER_H keeps working as-is
// because RULER_H now simply includes the strip too.
export const STRIP_H = BASE_RULER_H;
export function activeNoteAt(tick) {
  let best = null;
  for (const n of S.rollnotes) {
    if (isDirective(n)) continue; // directives aren't subtitles
    if (tick >= n.start && tick < n.end) best = n;
  }
  return best;
}
export function sectionPathAt(tick) {
  return S.rollnotes.filter(n => (n.section || n.chord) && tick >= n.start && tick < n.end)
                  .sort((a, b) => a.depth - b.depth).map(s => s.text).join(" › ");
}
export function curTick() {
  return S.playing ? secToTick(S.song, playSec()) : S.playCursor;
}
export function trackShown(ti) { return !(S.trackState[ti] && S.trackState[ti].hidden); }
export const cssCache = {};
// theme is static — cache so 60fps draw() skips getComputedStyle
export function css(name) {
  return cssCache[name] || (cssCache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim());
}
// on-demand highlight of the active note's span (⊙ in the subtitle strip)
// + ruler-drag selection tint (both views). Always-on ambient tints are
// gone: on a fully-annotated song they covered everything and meant nothing.
export function drawRangeTints(W, H) {
  const ppt = pxPerTick();
  const n = S.hlOn && S.song ? activeNoteAt(curTick()) : null;
  if (n && n.end > n.start) {
    const x = S.RULER_W + n.start * ppt - S.view.x;
    const w = (n.end - n.start) * ppt;
    if (x + w >= S.RULER_W && x <= W) {
      ctx.fillStyle = css("--gold");
      ctx.globalAlpha = 0.09;
      ctx.fillRect(x, S.RULER_H, w, H);
      ctx.globalAlpha = 1;
    }
  }
  if (S.rangeSel && !S.rangeSel.off) { // parked cycle: body tint hides with it, back on re-arm
    const x = S.RULER_W + S.rangeSel.a * ppt - S.view.x;
    ctx.fillStyle = css("--accent");
    ctx.globalAlpha = 0.12;
    ctx.fillRect(x, S.RULER_H, (S.rangeSel.b - S.rangeSel.a) * ppt, H);
    ctx.globalAlpha = 1;
  }
}
drawRangeTints = prof("drawRangeTints", drawRangeTints); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function pxPerTick() { return S.view.pxq / S.song.ppq; }
// each song's zoom + scroll, per view mode (roll / tracks), kept on this
// device so reopening it — or a relaunch — comes back to where he was (Josh,
// 2026-10-03: "remember what zoom level I was at"). Debounced: scrolling
// redraws every frame. A song never opened here still fits on open.
export function viewKey(k, mode) { return "ff1roll-view-" + mode + "-" + k; }
export function viewPersistSoon() {
  if (!S.songKey || !S.song || S.viewMode === "score") return;
  const v = S.view, sig = [S.songKey, S.viewMode, v.pxq, v.rowH, Math.round(v.x), Math.round(v.y)].join("|");
  if (sig === viewPersistSoon.last) return;
  viewPersistSoon.last = sig;
  clearTimeout(viewPersistSoon.t);
  const k = S.songKey, mode = S.viewMode, snap = {pxq: v.pxq, rowH: v.rowH, x: Math.round(v.x), y: Math.round(v.y)};
  viewPersistSoon.t = setTimeout(() => { try { localStorage.setItem(viewKey(k, mode), JSON.stringify(snap)); } catch (err) { /* private mode */ } }, 400);
}
export function viewRestore() {
  if (!S.songKey) return false;
  let v = null;
  try { v = JSON.parse(localStorage.getItem(viewKey(S.songKey, S.viewMode)) || "null"); } catch (err) { v = null; }
  if (!v || !(v.pxq > 0) || !(v.rowH > 0)) return false;
  S.view.pxq = v.pxq; S.view.rowH = v.rowH; S.view.x = v.x || 0; S.view.y = v.y || 0;
  return true; // clampView (the caller's next step) still enforces the floors and the song's bounds
}
// the ruler selection (cycle range) is view state, kept per song on this
// device so a relaunch — an install, a crash — comes back to the same loop
// and Play plays it (Josh, 2026-10-03: "after the app reboot I lose the
// selection that I had in the ruler"). Written from draw(), which every
// range edit ends with; only when it actually changed.
export function rangeSelKey(k) { return "ff1roll-range-" + k; }
export function rangeSelPersist() {
  if (!S.songKey) return;
  const r = S.rangeSel, sig = r ? r.a + ":" + r.b + ":" + (r.cycle ? 1 : 0) + ":" + (r.off ? 1 : 0) : "";
  if (sig === rangeSelPersist.last && S.songKey === rangeSelPersist.key) return;
  rangeSelPersist.last = sig; rangeSelPersist.key = S.songKey;
  try { if (r) localStorage.setItem(rangeSelKey(S.songKey), JSON.stringify({a: r.a, b: r.b, cycle: !!r.cycle, off: !!r.off})); else localStorage.removeItem(rangeSelKey(S.songKey)); } catch (err) { /* private mode: session only */ }
}
export function rangeSelRestore(k) {
  rangeSelPersist.key = k; rangeSelPersist.last = undefined;
  try { const r = JSON.parse(localStorage.getItem(rangeSelKey(k)) || "null"); if (r && r.b > r.a) { rangeSelPersist.last = r.a + ":" + r.b + ":" + (r.cycle ? 1 : 0) + ":" + (r.off ? 1 : 0); return {a: r.a, b: r.b, cycle: !!r.cycle, ...(r.off ? {off: true} : {})}; } } catch (err) { /* corrupt: none */ }
  return null;
}
// the dashed "added this session" outline — a device-local View toggle, off
// by default (Josh, 2026-10-02: "I just don't wanna see it all the time…
// writing a new song, of course I know they're all unpublished"). A function,
// not a top-level let: drawFull runs on the boot path, before later lets exist.
export function showAddedOutline() {
  if (showAddedOutline.v === undefined) {
    try { showAddedOutline.v = localStorage.getItem("ff1roll-added-outline") === "1"; } catch (err) { showAddedOutline.v = false; }
  }
  return showAddedOutline.v;
}
export function setAddedOutline(on) {
  showAddedOutline.v = !!on;
  try { localStorage.setItem("ff1roll-added-outline", on ? "1" : "0"); } catch (err) { /* private mode: session only */ }
}
export function drawLasso() {
  if (!S.lassoRect) return;
  const r = S.lassoRect;
  ctx.strokeStyle = css("--gold");
  ctx.fillStyle = css("--gold");
  ctx.globalAlpha = 0.08;
  ctx.fillRect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0));
  ctx.globalAlpha = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0));
  ctx.setLineDash([]);
}
drawLasso = prof("drawLasso", drawLasso); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
// playhead strip (Josh, 2026-10-03): a band under the ruler, right above the
// notes — x uses the same per-view geometry as every other playhead mark
// (linear ticks, except Score's engraved spacing).
export function stripPlayheadX() {
  const tick = S.playing ? secToTick(S.song, playSec()) : S.playCursor;
  return S.viewMode === "score" && S.scoreModel ? scoreTickToX(tick) : S.RULER_W + tick * pxPerTick() - S.view.x;
}
// drawn AFTER drawRuler (never baked into the scene cache, same discipline
// as the roll/tracks/score's own cursor marks) — drawRuler's opaque strip
// background would otherwise paint right over it.
export function drawStripPlayhead(x, color) {
  if (x < S.RULER_W) return;
  ctx.fillStyle = color;
  ctx.fillRect(x - 0.75, S.STRIP_Y, 1.5, S.RULER_H - S.STRIP_Y);
}
export function drawPlayheadStripBand(W) { // the strip's static look — RULER chrome,
  // not a roll row: the ruler's own panel background (drawRuler already
  // filled it), a line above, bar ticks full height and beat ticks short from
  // the bottom edge like a ruler's. A --grid-soft fill read as one of the
  // roll's light pitch rows (Josh, 2026-10-03: "it's just actually
  // confusing"). The moving playhead is drawStripPlayhead's, never here.
  const ppt = pxPerTick(), bt = barTicks(), beatT = beatTicks();
  const t0 = S.view.x / ppt, t1 = (S.view.x + W) / ppt;
  ctx.strokeStyle = css("--grid");
  ctx.beginPath(); ctx.moveTo(S.RULER_W, S.STRIP_Y + 0.5); ctx.lineTo(W, S.STRIP_Y + 0.5); ctx.stroke();
  ctx.fillStyle = css("--dim");
  for (let t = Math.floor(t0 / beatT) * beatT; t < t1; t += beatT) {
    const x = S.RULER_W + t * ppt - S.view.x;
    if (x < S.RULER_W) continue;
    const isBar = Math.round(t) % bt === 0;
    const h = isBar ? STRIP_H - 4 : Math.round(STRIP_H * 0.35);
    ctx.globalAlpha = isBar ? 0.8 : 0.5;
    ctx.fillRect(x, S.RULER_H - h, 1, h);
  }
  ctx.globalAlpha = 1;
}
export function drawRuler(W, H) {
  const ppt = pxPerTick();
  const bt = barTicks();
  const t0 = S.view.x / ppt, t1 = (S.view.x + W) / ppt;
  ctx.fillStyle = css("--panel");
  ctx.fillRect(0, 0, W, S.RULER_H);
  ctx.strokeStyle = css("--grid");
  ctx.beginPath(); ctx.moveTo(0, S.RULER_H - 0.5); ctx.lineTo(W, S.RULER_H - 0.5); ctx.stroke();
  drawAudioStrip(W);
  drawPlayheadStripBand(W);
  ctx.font = "10px " + css("--mono");
  ctx.textAlign = "left";
  // xFrom/xTo restrict the pass to a pixel span (the cycle strip's re-ink)
  const drawNumbers = (xFrom, xTo) => {
    for (let t = Math.floor(t0 / bt) * bt; t < t1; t += bt) {
      const x = S.RULER_W + t * ppt - S.view.x;
      if (x < S.RULER_W - 4 || x < xFrom || x >= xTo) continue;
      ctx.fillText(String(Math.round(t / bt) + 1), x + 4, 15);
    }
  };
  ctx.fillStyle = css("--text"); // bright like the octave labels — dim was hard to read
  drawNumbers(-Infinity, Infinity);
  // Logic-style subdivision ticks along the ruler's bottom edge: bars always,
  // beats when there's room, 16ths when zoomed right in — density-adaptive.
  // xFrom/xTo restrict the pass to a pixel span (the cycle strip's re-ink).
  const drawTicks = (xFrom, xTo) => {
    const qt = beatTicks();
    const step = qt * ppt >= 96 ? qt / 4 : qt * ppt >= 14 ? qt : bt;
    ctx.beginPath();
    for (let t = Math.floor(t0 / step) * step; t < t1; t += step) {
      const x = Math.round(S.RULER_W + t * ppt - S.view.x) + 0.5;
      if (x < S.RULER_W || x < xFrom || x >= xTo) continue;
      const onBar = Math.abs(t / bt - Math.round(t / bt)) < 1e-6;
      const onBeat = Math.abs(t / qt - Math.round(t / qt)) < 1e-6;
      const h = onBar ? 9 : onBeat ? 6 : 3;
      // ticks live in the number strip (BASE_RULER_H), above any section lanes
      ctx.moveTo(x, BASE_RULER_H - 1); ctx.lineTo(x, BASE_RULER_H - 1 - h);
    }
    ctx.stroke();
  };
  ctx.strokeStyle = css("--dim");
  ctx.globalAlpha = 0.7;
  drawTicks(-Infinity, Infinity);
  ctx.globalAlpha = 1;
  if (S.rangeSel) {
    // amber = Logic's cycle strip (▶ loops this); a band-tap selection keeps
    // the quiet accent tint — it feeds + Note but never hijacks playback
    const rsx = S.viewMode === "score" && S.scoreModel ? scoreTickToX(S.rangeSel.a) : S.RULER_W + S.rangeSel.a * ppt - S.view.x;
    const rse = S.viewMode === "score" && S.scoreModel ? scoreTickToX(S.rangeSel.b) : S.RULER_W + S.rangeSel.b * ppt - S.view.x;
    ctx.fillStyle = S.rangeSel.cycle ? "#E09A3E" : css("--accent");
    ctx.globalAlpha = (S.rangeSel.cycle ? 0.75 : 0.3) * (S.rangeSel.off ? 0.35 : 1); // dimmed = parked, tap to re-arm
    ctx.fillRect(rsx, 0, rse - rsx, BASE_RULER_H); // number strip only — lanes stay readable
    ctx.globalAlpha = 1;
    if (S.rangeSel.cycle && !S.rangeSel.off) { // the bright amber swallows the ticks and numbers: re-ink them black (Josh, 2026-09-07)
      ctx.strokeStyle = "#000";
      ctx.globalAlpha = 0.8;
      drawTicks(rsx, rse);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.font = "10px " + css("--mono"); // the tick pass doesn't touch it, but stay explicit
      drawNumbers(rsx, rse);
    }
  }
  // in score view, band edges follow the ENGRAVED positions (scoreTickToX,
  // the playhead's own map) — linear time put "A part" a hair off its notes
  const tickX = t => S.viewMode === "score" && S.scoreModel ? scoreTickToX(t) : S.RULER_W + t * ppt - S.view.x;
  // bands the lasso has taken (or is taking, mid-drag) get a gold outline —
  // the only sign that ⧉/✂ will carry them (Josh, 2026-09-13)
  let hl = S.lassoAnno;
  if (S.lassoRect && S.viewMode === "roll" && !fallActive() && Math.min(S.lassoRect.y0, S.lassoRect.y1) < S.STRIP_Y) {
    const xa = Math.min(S.lassoRect.x0, S.lassoRect.x1), xb = Math.max(S.lassoRect.x0, S.lassoRect.x1);
    hl = {t0: (xa - S.RULER_W + S.view.x) / ppt, t1: (xb - S.RULER_W + S.view.x) / ppt,
          y0: Math.min(S.lassoRect.y0, S.lassoRect.y1), y1: Math.max(S.lassoRect.y0, S.lassoRect.y1)};
  }
  const taken = n => annoInLasso(n, hl);
  for (const n of S.rollnotes) {
    if (!n.section && !n.chord) continue;
    if (n.lane === null) continue; // collapsed level: folded out of the ruler
    const x = tickX(n.start);
    const w = tickX(n.end) - x;
    if (x + w < S.RULER_W || x > W) continue;
    const y = BASE_RULER_H + n.lane * LANE_H;
    const color = S.sectionColors[n.text] || css("--accent");
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x + 1, y + 1, w - 2, LANE_H - 2);
    ctx.globalAlpha = 1;
    if (taken(n)) {
      ctx.strokeStyle = css("--gold");
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.max(x, S.RULER_W) + 1.5, y + 1.5, w - 3 - Math.max(0, S.RULER_W - x), LANE_H - 3);
      ctx.lineWidth = 1;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.max(x, S.RULER_W), y, w - 2 - Math.max(0, S.RULER_W - x), LANE_H);
    ctx.clip();
    ctx.fillStyle = css("--text");
    ctx.font = "10px " + css("--mono");
    ctx.fillText((n.stale ? "⚠ " : "") + n.text + (n.cnote ? " ✱" : ""), Math.max(x, S.RULER_W) + 5, y + 11);
    ctx.restore();
  }
  // P6: the Analyze layer draws AFTER the real section/chord bands, in its
  // own rows below them (analysisChordLane/analysisKeyLane, set by
  // finalizeNotes) — dashed/outlined so it never reads as a real annotation.
  if (S.analysisOn && appMode() === "normal") drawAnalysisLayer(tickX, W);
  for (const n of S.rollnotes) {
    if (n.section || n.chord || n.chopdir) continue; // chop anchors are raw-space: no flag
    const x = S.RULER_W + n.start * ppt - S.view.x;
    if (x < S.RULER_W - 8 || x > W) continue;
    if (taken(n)) { // lasso'd text note: a ring behind its flag
      ctx.strokeStyle = css("--gold");
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, BASE_RULER_H - 7, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.fillStyle = css("--gold");
    ctx.globalAlpha = n.added ? 0.6 : 1;
    ctx.beginPath();
    ctx.moveTo(x, S.STRIP_Y - 8); // bottom of the ruler/bands — above the playhead strip, same spot as before it existed
    ctx.lineTo(x + 8, S.STRIP_Y - 4.5);
    ctx.lineTo(x, S.STRIP_Y - 1);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
drawRuler = prof("drawRuler", drawRuler); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function annoInLasso(n, L) { // lane-precise: the band's own row must be inside the box, and its time
  if (!L || !isCopyableAnno(n)) return false;
  if (!(n.start < L.t1 && (n.b2 ? n.end : n.start + 1) > L.t0)) return false;
  if (n.section || n.chord) {
    if (n.lane === null || n.lane === undefined) return false; // folded out of the ruler
    const y = BASE_RULER_H + n.lane * LANE_H;
    return y < L.y1 && y + LANE_H > L.y0;
  }
  return L.y0 < BASE_RULER_H; // text-note flags live in the number strip
}
export function trackColor(ti) {
  if (!S.song || !S.song.tracks.length) return TRACK_COLORS[((ti % TRACK_COLORS.length) + TRACK_COLORS.length) % TRACK_COLORS.length];
  const n = S.song.tracks.length, i = ((ti % n) + n) % n; // wrap, same as the old modulo palette did
  const c = S.song.tracks[i].color;
  return c || autoTrackColors(S.song.tracks)[i];
}
// Fall view (Synthesia-style): the MAIN canvas turns into a vertical drop —
// notes fall down and land on the panel's piano keys the instant they sound
// (the keys light via the live-pitch set). Time maps through seconds, so
// tempo changes and the speed slider read truthfully. The view rides the
// playhead (or sits at the cursor when stopped); roll gestures are disabled
// while it's active. Piano-only: picking Guitar drops back to the roll/score.
export function fallActive() { return S.fallOn && S.instOpen && S.instTab === "piano" && !!S.song; }
export function drawAnalysisLayer(tickX, W) { // dashed/outlined — visually distinct from the solid section/chord bands
  const drawBand = (lane, start, end, text) => {
    if (lane === null) return;
    const x = tickX(start), w = tickX(end) - x;
    if (x + w < S.RULER_W || x > W) return;
    const y = BASE_RULER_H + lane * LANE_H;
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = css("--gold");
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.max(x, S.RULER_W) + 1, y + 1, w - 3 - Math.max(0, S.RULER_W - x), LANE_H - 3);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.rect(Math.max(x, S.RULER_W), y, w - 2 - Math.max(0, S.RULER_W - x), LANE_H);
    ctx.clip();
    ctx.fillStyle = css("--dim");
    ctx.font = "10px " + css("--mono");
    ctx.fillText("🔍 analysis: " + text, Math.max(x, S.RULER_W) + 5, y + 11);
    ctx.restore();
  };
  for (const c of S.analysisBands.chords) drawBand(S.analysisChordLane, c.start, c.end, c.text);
  if (S.analysisBands.key) drawBand(S.analysisKeyLane, S.analysisBands.key.start, S.analysisBands.key.end, S.analysisBands.key.name + "~");
}
