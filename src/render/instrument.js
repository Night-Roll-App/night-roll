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
import { PIANO_LO, PIANO_HI, pianoIsWhite, pianoGeom, pianoHitAt, pianoClampScroll, pianoScrollTo, pianoScrollCentering, pianoRangeLabel, pianoOffscreen } from "../ui/piano.js";

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
// The keyboard's scroll (src/ui/piano.js): a white-key index, null until
// the first scroll = "home", the song's own lowest octave (the old range
// start), so a song opens where its notes are. A device-local pref, like
// the panel's open/tab state — the song never carries it.
export function instScrollNow(W) {
  const w = W || instWrap.clientWidth || 800;
  return pianoClampScroll(S.instScroll === null ? pianoScrollTo(instRange()[0], w) : S.instScroll, w);
}
export function instGeom(W, H) { return pianoGeom(W, H || instWrap.clientHeight || 168, instScrollNow(W)); }
// every scroll goes through here: clamped, remembered, and the readout and
// keys repainted — the lock refuses ALL of them (Josh, 2026-10-04: a stray
// swipe must not move the keys), the octave buttons included
export function instSetScroll(v, opts) {
  if (S.instLock) return false;
  const W = instWrap.clientWidth || 800;
  const next = pianoClampScroll(v, W);
  if (S.instScroll !== null && next === S.instScroll) return false;
  S.instScroll = next;
  if (!(opts && opts.transient)) localStorage.setItem("ff1roll-inst-scroll-piano", String(next));
  drawInst();
  return true;
}
export function instScrollBy(dxPx) { // the finger drags the keys: moving right scrolls toward the bass
  const W = instWrap.clientWidth || 800;
  return instSetScroll(instScrollNow(W) - dxPx / instGeom(W).wW, {transient: true});
}
export function instOctave(dir) { return instSetScroll(instScrollNow() + dir * 7); }
// scroll so an off-screen lit key lands mid-window (the edge chevrons' tap)
export function instRevealPitch(p) { return instSetScroll(pianoScrollCentering(p, instWrap.clientWidth || 800)); }
export function instLitColor(p, lit) {
  if (S.instFlash && S.instFlash.p === p) return trackColor(S.selTrack); // tap flash wears the selected track's color
  if (lit.sel.has(p)) return trackColor(lit.sel.get(p)); // lasso'd: source track's color
  if (lit.live.has(p)) return trackColor(lit.live.get(p)); // sounding: its track's color
  return null;
}
// a canvas gradient, or the flat fallback where the context has none (the
// vm harness's 2d stub hands back no gradient object)
export function instGrad(x0, y0, x1, y1, stops, flat) {
  const gr = ictx.createLinearGradient && ictx.createLinearGradient(x0, y0, x1, y1);
  if (!gr || !gr.addColorStop) return flat;
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
}
export function instRoundBottom(x, y, w, h, r) { // a key's outline: square top, rounded bottom
  ictx.beginPath();
  ictx.moveTo(x, y);
  ictx.lineTo(x + w, y);
  ictx.lineTo(x + w, y + h - r);
  ictx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ictx.lineTo(x + r, y + h);
  ictx.quadraticCurveTo(x, y + h, x, y + h - r);
  ictx.closePath();
}
// Real-piano look (2026-10-04, after Logic's keyboard — Josh: "it looks like
// a real keyboard rather than ours just has the notes laid out"): fixed-width
// keys from src/ui/piano.js, whites with a soft top-to-bottom gradient,
// rounded bottom corners and a shadow lip over a dark gap; black keys at
// their true offsets with a lighter top face. Lit keys keep their track
// colors, labels and rings exactly as before — the lighting is Night Roll's,
// only the wood changed. Ivory and ebony are literal colors, not theme vars:
// a piano reads the same on any panel color.
export function drawPiano(W, H, lit) {
  const g = instGeom(W, H);
  const kn = keyNameAt(curTick()), sf = sfDeclaredAt(curTick());
  const pad = 3; // the dark rail the keys hang from
  ictx.fillStyle = "#15151a";
  ictx.fillRect(0, 0, W, H);
  ictx.textAlign = "center";
  const whiteH = H - 2;
  for (const p of g.whites) {
    const x = g.wx[p], c = instLitColor(p, lit);
    instRoundBottom(x + 0.75, pad, g.wW - 1.5, whiteH - pad, 3.5);
    ictx.fillStyle = c || instGrad(0, pad, 0, whiteH, [[0, "#f6f3ea"], [0.85, "#ebe7dc"], [1, "#d9d3c5"]], "#e8e4da");
    ictx.fill();
    if (!c) { // the lip: a shadow line where the key's front face would be
      ictx.fillStyle = "rgba(0,0,0,0.18)";
      ictx.fillRect(x + 1, whiteH - 3, g.wW - 2, 2.5);
    }
    if (lit.live.has(p) && lit.sel.has(p)) { // a LASSO'D note sounding NOW: white ring
      ictx.strokeStyle = "#fff";
      ictx.lineWidth = 2.5;
      ictx.strokeRect(x + 2.5, pad + 2, g.wW - 5, whiteH - pad - 5);
      ictx.lineWidth = 1;
    }
    if (c) {
      ictx.fillStyle = "#111";
      ictx.font = "bold 10px " + css("--mono");
      ictx.fillText(pitchName(p, sf), x + g.wW / 2, H - 18);
      const deg = degreeOf(p % 12, kn);
      if (deg) { ictx.font = "9px " + css("--mono"); ictx.fillText(deg, x + g.wW / 2, H - 6); }
    } else if (p % 12 === 0) { // C labels for orientation
      ictx.fillStyle = "#8d8778";
      ictx.font = "bold 10px " + css("--mono");
      ictx.fillText("C" + (p / 12 - 1), x + g.wW / 2, H - 8);
    }
  }
  const bw = g.bw, bh = g.bh;
  for (let p = g.lo; p <= g.hi; p++) {
    if (pianoIsWhite(p)) continue;
    const x = g.keyX(p), c = instLitColor(p, lit);
    instRoundBottom(x, 0, bw, bh, 2.5); // the body: dark sides and the bottom lip
    ictx.fillStyle = c || "#0b0b0d";
    ictx.fill();
    if (c) { // a lit black key keeps a darker lip so it still reads as raised
      ictx.fillStyle = "rgba(0,0,0,0.3)";
      ictx.fillRect(x, bh - 5, bw, 5);
    } else { // the lighter top face, with a highlight along its top edge
      ictx.fillStyle = instGrad(0, 0, 0, bh, [[0, "#4a4a50"], [0.12, "#2e2e33"], [1, "#1c1c20"]], "#26262b");
      instRoundBottom(x + 2, 0, bw - 4, bh - 6, 2);
      ictx.fill();
      ictx.fillStyle = "rgba(255,255,255,0.10)";
      ictx.fillRect(x + 2, 0, bw - 4, 1.5);
    }
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
  drawInstChevrons(W, H, lit, g);
  updateInstRange();
}
drawPiano = prof("drawPiano", drawPiano); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
// Edge chevrons: a lit key (sounding, lasso'd, or the one just tapped) that
// sits outside the window shows as a small ‹ or › at that edge in its
// track's color — the guitar's ▴/▾ octave-fold idea: a sounding note
// off-screen is still seen. S.instChevrons remembers which pitch each edge
// points at so a tap there (instPointerDown) scrolls to it.
export const INST_CHEVRON_W = 26;
export function drawInstChevrons(W, H, lit, g) {
  const pitches = new Set([...lit.sel.keys(), ...lit.live.keys()]);
  if (S.instFlash && S.instFlash.p !== undefined) pitches.add(S.instFlash.p);
  const off = pianoOffscreen(pitches, W, H, g.scroll);
  S.instChevrons = {left: off.left.length ? off.left[0] : null, right: off.right.length ? off.right[0] : null};
  const draw = (p, atLeft) => {
    const x = atLeft ? 4 : W - INST_CHEVRON_W + 4, y = H / 2 - 16, w = INST_CHEVRON_W - 8;
    ictx.fillStyle = "rgba(0,0,0,0.55)";
    ictx.beginPath();
    ictx.roundRect(x, y, w, 32, 6);
    ictx.fill();
    ictx.fillStyle = instLitColor(p, lit) || css("--gold");
    ictx.font = "bold 18px " + css("--sans");
    ictx.textAlign = "center";
    ictx.fillText(atLeft ? "‹" : "›", x + w / 2, y + 23);
  };
  if (S.instChevrons.left !== null) draw(S.instChevrons.left, true);
  if (S.instChevrons.right !== null) draw(S.instChevrons.right, false);
}
// the "C3 – E5" readout between ‹ ›: rewritten only when it changes, since
// drawPiano runs on every playback frame
export function updateInstRange() {
  const el = document.getElementById("instrange");
  const label = pianoRangeLabel(instWrap.clientWidth || 800, instScrollNow());
  if (el.textContent !== label) el.textContent = label;
}
export function pianoHit(x, y, W, H) { return pianoHitAt(x, y, W, H, instScrollNow(W)); }
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
  const g = instGeom(W);
  ctx.fillStyle = css("--grid-soft"); // black-key lanes banded like the roll
  for (let p = g.lo; p <= g.hi; p++) {
    if (pianoIsWhite(p)) continue;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(g.keyX(p), 0, g.bw, H);
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
      if (n.gone || n.t > tick1 || n.t + n.d < tick0 || n.p < PIANO_LO || n.p > PIANO_HI) return;
      const yB = secY(tickToSec(S.song, n.t));       // bottom edge = note-on
      const yT = secY(tickToSec(S.song, n.t + n.d));
      if (yT > H || yB < 0) return;                // fully past / not yet in view
      const white = pianoIsWhite(n.p);
      const x = g.keyX(n.p) + (white ? 1 : 0);
      const w = g.keyW(n.p) - 2;
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
