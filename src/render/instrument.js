import { LETTER_PC } from "../theory/chords.js";
import { S, prof } from "../state.js";
import { trackIsDrums } from "../model/grid.js";
import { playSec } from "../audio/transport.js";
import { trackAudible } from "../audio/engine.js";
import { css } from "./roll.js";
import { trackColor } from "./roll.js";
import { keyNameAt } from "../model/song.js";
import { curTick } from "./roll.js";
import { sfDeclaredAt } from "../model/song.js";
import { pitchName } from "../theory/chords.js";
import { spellPc } from "../theory/chords.js";
import { tickToSec } from "../midi/parse.js";
import { ctx } from "./roll.js";
import { barTicks } from "../model/rollnotes.js";
import { secToTick } from "../midi/parse.js";
import { trackShown } from "./roll.js";
import { drawLasso } from "./roll.js";

// {p, si, f, until} tap flash (si/f only for guitar)
export const instWrap = document.getElementById("instwrap");
export const instCanvas = document.getElementById("instcanvas");
export const ictx = instCanvas.getContext("2d");
export const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
export const GTR_TUNING = [64, 59, 55, 50, 45, 40];
// high e on top — tab convention
export const GTR_NAMES = ["e", "B", "G", "D", "A", "E"];
export const GTR_FRETS = 24;
export const DEGREE_LABEL = ["1", "♭2", "2", "♭3", "3", "4", "♭5", "5", "♭6", "6", "♭7", "7"];
export function degreeOf(pc, keyName) { // degree label vs the key's tonic (major-scale convention: ♭3 in minor)
  if (!keyName) return null;
  const m = keyName.match(/^([A-G])([#b]?)/i);
  if (!m) return null;
  const tonic = (LETTER_PC[m[1].toUpperCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
  return DEGREE_LABEL[(pc - tonic + 12) % 12];
}
export function instRange() { // the song's pitch extent, octave-aligned C..B
  let lo = 60, hi = 71;
  if (S.song) {
    let mn = Infinity, mx = -Infinity;
    S.song.tracks.forEach((tr, ti) => {
      if (trackIsDrums(ti)) return;
      for (const n of tr.notes) if (!n.gone) { if (n.p < mn) mn = n.p; if (n.p > mx) mx = n.p; }
    });
    if (mn <= mx) { lo = mn; hi = mx; }
  }
  return [Math.max(12, Math.floor(lo / 12) * 12), Math.min(107, Math.floor(hi / 12) * 12 + 11)];
}
export function instLitPitches() { // sel = lasso'd, live = sounding — both pitch → track index
  const sel = new Map(); // earliest track wins when the same pitch is selected twice
  if (S.song) for (const s of S.multiSel) {
    const p = S.song.tracks[s.ti].notes[s.ni].p;
    if (!sel.has(p) || s.ti < sel.get(p)) sel.set(p, s.ti);
  }
  const live = new Map();
  if (S.playing && S.audio) {
    const s = playSec();
    for (const e of S.schedEvents) {
      if (e.sec > s) break; // sorted by sec
      if (s < e.sec + e.dur && trackAudible(e.ti) && !(e.n.ch === 9 || trackIsDrums(e.ti)) && !live.has(e.n.p))
        live.set(e.n.p, e.ti);
    }
  }
  return {sel, live};
}
export function drawInst() {
  if (!S.instOpen) return;
  const W = instWrap.clientWidth, H = instWrap.clientHeight;
  if (!W || !H) return;
  ictx.fillStyle = css("--panel");
  ictx.fillRect(0, 0, W, H);
  if (S.instFlash && S.instFlash.until < performance.now()) S.instFlash = null;
  const lit = instLitPitches();
  if (S.instTab === "piano") drawPiano(W, H, lit);
  else drawGuitar(W, H, lit);
}
drawInst = prof("drawInst", drawInst); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function pianoGeom(W) {
  const [lo, hi] = instRange();
  const whites = [];
  for (let p = lo; p <= hi; p++) if (WHITE_PCS.includes(p % 12)) whites.push(p);
  const wW = W / whites.length;
  const wx = {};
  whites.forEach((p, i) => wx[p] = i * wW);
  return {lo, hi, whites, wW, wx};
}
export function instLitColor(p, lit) {
  if (S.instFlash && S.instFlash.p === p) return trackColor(S.selTrack); // tap flash wears the selected track's color
  if (lit.sel.has(p)) return trackColor(lit.sel.get(p)); // lasso'd: source track's color
  if (lit.live.has(p)) return trackColor(lit.live.get(p)); // sounding: its track's color
  return null;
}
export function drawPiano(W, H, lit) {
  const g = pianoGeom(W);
  const kn = keyNameAt(curTick()), sf = sfDeclaredAt(curTick());
  ictx.textAlign = "center";
  for (const p of g.whites) {
    const x = g.wx[p], c = instLitColor(p, lit);
    ictx.fillStyle = c || "#e8e4da";
    ictx.fillRect(x + 0.5, 0, g.wW - 1, H - 1);
    ictx.strokeStyle = "#333";
    ictx.strokeRect(x + 0.5, 0.5, g.wW - 1, H - 2);
    if (lit.live.has(p) && lit.sel.has(p)) { // a LASSO'D note sounding NOW: white ring
      ictx.strokeStyle = "#fff";
      ictx.lineWidth = 2.5;
      ictx.strokeRect(x + 2.5, 2, g.wW - 5, H - 5);
      ictx.lineWidth = 1;
    }
    if (c) {
      ictx.fillStyle = "#111";
      ictx.font = "bold 10px " + css("--mono");
      ictx.fillText(pitchName(p, sf), x + g.wW / 2, H - 18);
      const deg = degreeOf(p % 12, kn);
      if (deg) { ictx.font = "9px " + css("--mono"); ictx.fillText(deg, x + g.wW / 2, H - 6); }
    } else if (p % 12 === 0) { // C labels for orientation
      ictx.fillStyle = "#999";
      ictx.font = "9px " + css("--mono");
      ictx.fillText("C" + (p / 12 - 1), x + g.wW / 2, H - 6);
    }
  }
  const bw = g.wW * 0.6, bh = H * 0.6;
  for (let p = g.lo; p <= g.hi; p++) {
    if (WHITE_PCS.includes(p % 12)) continue;
    const x = g.wx[p - 1] + g.wW - bw / 2, c = instLitColor(p, lit);
    ictx.fillStyle = c || "#1a1a1a";
    ictx.fillRect(x, 0, bw, bh);
    ictx.strokeStyle = "#000";
    ictx.strokeRect(x + 0.5, 0.5, bw - 1, bh - 1);
    if (lit.live.has(p) && lit.sel.has(p)) {
      ictx.strokeStyle = "#fff";
      ictx.lineWidth = 2.5;
      ictx.strokeRect(x + 2, 1.5, bw - 4, bh - 4);
      ictx.lineWidth = 1;
    }
    if (c) {
      ictx.fillStyle = "#111";
      ictx.font = "bold 9px " + css("--mono");
      ictx.fillText(pitchName(p, sf), x + bw / 2, bh - 14);
      const deg = degreeOf(p % 12, kn);
      if (deg) { ictx.font = "8px " + css("--mono"); ictx.fillText(deg, x + bw / 2, bh - 4); }
    }
  }
}
drawPiano = prof("drawPiano", drawPiano); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function guitarGeom(W, H) {
  const nutX = 44, top = 14, bot = 24;
  return {nutX, top, bot, fw: (W - nutX - 6) / GTR_FRETS, sh: (H - top - bot) / (GTR_TUNING.length - 1)};
}
export function drawGuitar(W, H, lit) {
  const g = guitarGeom(W, H);
  const kn = keyNameAt(curTick()), sf = sfDeclaredAt(curTick());
  for (let f = 0; f <= GTR_FRETS; f++) {
    ictx.fillStyle = f === 0 ? css("--text") : css("--grid");
    ictx.fillRect(g.nutX + f * g.fw, g.top, f === 0 ? 3 : 1, H - g.top - g.bot);
  }
  ictx.font = "9px " + css("--mono");
  ictx.textAlign = "center";
  for (const f of [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]) { // inlay dots + fret numbers
    const cx = g.nutX + (f - 0.5) * g.fw, cy = g.top + (H - g.top - g.bot) / 2;
    ictx.fillStyle = css("--dim");
    ictx.globalAlpha = 0.35;
    ictx.beginPath();
    if (f % 12 === 0) { ictx.arc(cx, cy - g.sh, 4, 0, 7); ictx.arc(cx, cy + g.sh, 4, 0, 7); }
    else ictx.arc(cx, cy, 4, 0, 7);
    ictx.fill();
    ictx.globalAlpha = 1;
    ictx.fillText(String(f), cx, H - 6);
  }
  GTR_TUNING.forEach((open, si) => {
    const y = g.top + si * g.sh;
    ictx.fillStyle = css("--dim");
    ictx.fillRect(g.nutX, y, W - g.nutX - 6, si >= 4 ? 1.6 : 1); // wound strings thicker
    ictx.font = "10px " + css("--mono");
    ictx.textAlign = "right";
    ictx.fillText(GTR_NAMES[si], g.nutX - 8, y + 3);
    ictx.textAlign = "center";
  });
  const dots = [];
  const add = (p0, color) => {
    const {p, shift} = gtrFold(p0); // off-the-neck pitches fold to a playable octave
    GTR_TUNING.forEach((open, si) => {
      const f = p - open;
      if (f >= 0 && f <= GTR_FRETS) dots.push({si, f, p, p0, shift, color});
    });
  };
  lit.live.forEach((ti, p) => add(p, trackColor(ti)));
  lit.sel.forEach((ti, p) => add(p, trackColor(ti))); // lasso'd notes wear their track's color
  if (S.instFlash && S.instFlash.si !== undefined) dots.push({...S.instFlash, color: trackColor(S.selTrack)});
  // pitch-class echoes: EVERY same-named note on the neck gets a hollow ring
  // in its source note's track color — earliest track wins. Sounding notes get
  // the same treatment as the lasso (Josh, 2026-08-22: "the same algorithm
  // applied to the Play button")
  const selPcs = new Map();
  const echo = (ti, p) => {
    const pc = p % 12;
    if (!selPcs.has(pc) || ti < selPcs.get(pc)) selPcs.set(pc, ti);
  };
  lit.sel.forEach(echo);
  lit.live.forEach(echo);
  if (selPcs.size) {
    const taken = new Set(dots.map(d => d.si + ":" + d.f));
    GTR_TUNING.forEach((open, si) => {
      for (let f = 0; f <= GTR_FRETS; f++) {
        const pc = (open + f) % 12;
        if (!selPcs.has(pc) || taken.has(si + ":" + f)) continue;
        const cx = g.nutX + (f === 0 ? 2 : (f - 0.5) * g.fw), cy = g.top + si * g.sh;
        ictx.strokeStyle = trackColor(selPcs.get(pc));
        ictx.globalAlpha = 0.7;
        ictx.beginPath();
        ictx.arc(cx, cy, 9, 0, 7);
        ictx.stroke();
        ictx.fillStyle = css("--dim");
        ictx.font = "8px " + css("--mono");
        ictx.fillText(spellPc(pc, sf), cx, cy + 3);
        ictx.globalAlpha = 1;
      }
    });
  }
  for (const d of dots) {
    const cx = g.nutX + (d.f === 0 ? 2 : (d.f - 0.5) * g.fw), cy = g.top + d.si * g.sh;
    ictx.fillStyle = d.color;
    ictx.beginPath();
    ictx.arc(cx, cy, 11, 0, 7);
    ictx.fill();
    if (d.p0 !== undefined && lit.live.has(d.p0) && lit.sel.has(d.p0)) { // lasso'd AND sounding: white ring
      ictx.strokeStyle = "#fff";
      ictx.lineWidth = 2;
      ictx.beginPath();
      ictx.arc(cx, cy, 11.5, 0, 7);
      ictx.stroke();
      ictx.lineWidth = 1;
    }
    if (d.shift) { // folded octave: dashed ring + arrow toward the true pitch
      ictx.setLineDash([3, 2.5]);
      ictx.strokeStyle = d.color;
      ictx.beginPath();
      ictx.arc(cx, cy, 14, 0, 7);
      ictx.stroke();
      ictx.setLineDash([]);
      ictx.font = "8px " + css("--mono");
      ictx.fillText(d.shift < 0 ? "▴" : "▾", cx + 17, cy + 3);
    }
    ictx.fillStyle = "#111";
    ictx.font = "bold 9px " + css("--mono");
    ictx.fillText(spellPc(d.p % 12, sf), cx, cy - 1);
    const deg = degreeOf(d.p % 12, kn);
    if (deg) { ictx.font = "8px " + css("--mono"); ictx.fillText(deg, cx, cy + 8); }
  }
}
drawGuitar = prof("drawGuitar", drawGuitar); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function gtrFold(p) { // octave-fold a pitch into the fretboard's range; shift = octaves moved
  const lo = GTR_TUNING[GTR_TUNING.length - 1], hi = GTR_TUNING[0] + GTR_FRETS;
  let shift = 0;
  while (p > hi) { p -= 12; shift--; }
  while (p < lo) { p += 12; shift++; }
  return {p, shift};
}
export const FALL_WINDOW = 4.5; // seconds of upcoming music filling the drop
export function drawFall(W, H) {
  const nowSec = S.playing ? playSec() : tickToSec(S.song, S.playCursor);
  const pps = H / FALL_WINDOW;
  const secY = s => H - (s - nowSec) * pps;
  const g = pianoGeom(W);
  const bw = g.wW * 0.6;
  ctx.fillStyle = css("--grid-soft"); // black-key lanes banded like the roll
  for (let p = g.lo; p <= g.hi; p++) {
    if (WHITE_PCS.includes(p % 12)) continue;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(g.wx[p - 1] + g.wW - bw / 2, 0, bw, H);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  const bt = barTicks();
  for (let b = 0, last = Math.ceil(S.songEndTick / bt); b <= last; b++) {
    const y = secY(tickToSec(S.song, b * bt));
    if (y < -2 || y > H + 14) continue;
    ctx.fillStyle = css("--grid");
    ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = css("--dim");
    ctx.font = "10px " + css("--mono");
    ctx.fillText(String(b + 1), 4, y - 4);
  }
  for (const n of S.rollnotes) { // chord changes ride gold lines with their symbol
    if (!n.chord) continue;
    const y = secY(tickToSec(S.song, n.start));
    if (y < -2 || y > H + 14) continue;
    ctx.fillStyle = css("--gold");
    ctx.globalAlpha = 0.45;
    ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;
    ctx.font = "bold 11px " + css("--mono");
    ctx.fillText(n.text, 24, y - 4);
  }
  // window in ticks first: a 1500-note SNES song converted every note every
  // frame (9 ms median, 100 ms spikes on the Mac, worse on the iPad)
  const tick0 = secToTick(S.song, Math.max(0, nowSec - 0.5)), tick1 = secToTick(S.song, nowSec + FALL_WINDOW + 0.5);
  S.song.tracks.forEach((tr, ti) => {
    if (!trackShown(ti) || trackIsDrums(ti)) return;
    const color = trackColor(ti);
    tr.notes.forEach((n, ni) => {
      if (n.gone || n.t > tick1 || n.t + n.d < tick0) return;
      const yB = secY(tickToSec(S.song, n.t));       // bottom edge = note-on
      const yT = secY(tickToSec(S.song, n.t + n.d));
      if (yT > H || yB < 0) return;                // fully past / not yet in view
      const white = WHITE_PCS.includes(n.p % 12);
      const x = white ? g.wx[n.p] + 1 : g.wx[n.p - 1] + g.wW - bw / 2;
      const w = (white ? g.wW : bw) - 2;
      const sounding = yB >= H && yT < H;          // remainder sinks into the keys
      ctx.globalAlpha = 0.55 + 0.45 * (n.v / 127);
      if (S.findPc !== null && n.p % 12 !== S.findPc) ctx.globalAlpha *= 0.15; // finder dims non-matches
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, yT, w, Math.max(3, Math.min(yB, H) - yT - 1), 3);
      ctx.fill();
      if (sounding || S.multiSelKey.has(ti + ":" + ni) || (S.findPc !== null && n.p % 12 === S.findPc)) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = sounding ? "#fff" : S.multiSelKey.has(ti + ":" + ni) ? css("--gold") : css("--accent");
        ctx.stroke();
      }
    });
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = css("--accent"); // the "now" edge the notes land on
  ctx.fillRect(0, H - 2, W, 2);
  drawLasso();
}
drawFall = prof("drawFall", drawFall); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function instResize() {
  const dpr = window.devicePixelRatio || 1;
  instCanvas.width = instWrap.clientWidth * dpr;
  instCanvas.height = instWrap.clientHeight * dpr;
  ictx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawInst();
}
