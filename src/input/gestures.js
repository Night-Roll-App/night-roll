import { canvas } from "../render/roll.js";
import { S } from "../state.js";
import { pxPerTick } from "../render/roll.js";
import { topRow } from "../render/roll.js";
import { fallActive, stripPlayheadX, TAG_HIT } from "../render/roll.js";
import { scoreTickToX } from "../render/score.js";
import { barTicks } from "../model/rollnotes.js";
import { beatTicks } from "../model/grid.js";
import { pitchName } from "../theory/chords.js";
import { sfAt } from "../model/song.js";
import { renderMeasure } from "../render/score.js";
import { scoreXToTick } from "../render/score.js";
import { SCORE_PAD } from "../render/score.js";
import { SCORE_TOP } from "../render/score.js";
import { STAVE_H } from "../render/score.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { VF } from "../render/score.js";
import { LETTER_PC } from "../theory/chords.js";
import { pencilCellAt } from "../model/grid.js";
import { previewNote } from "../audio/voices.js";
import { isComposition } from "../model/provenance.js";
import { pushUndo } from "../model/edits.js";
import { saveEdits } from "../model/edits.js";
import { renderTrackbarImpl as renderTrackbar } from "../ui/trackbar.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { drawImpl as draw } from "../ui/chrome.js";
import { reflectSelVel } from "../ui/note-editor.js";
import { updateSubtitleImpl as updateSubtitle } from "../ui/chrome.js";
import { moveSnapTicks } from "../model/grid.js";

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

export function beatLabel(beat) {
  const base = Math.floor(beat + 0.03);
  const frac = beat - base;
  const SYL = [[0, ""], [0.25, "e"], [0.5, "&"], [0.75, "a"]];
  for (const [f, s] of SYL) if (Math.abs(frac - f) < 0.06) return base + s;
  return beat.toFixed(2);
}
export function noteLabel(ti, ni) {
  const n = S.song.tracks[ti].notes[ni];
  const bt = barTicks();
  const bar = Math.floor(n.t / bt) + 1;
  const beat = (n.t % bt) / beatTicks() + 1;
  const name = pitchName(n.p, sfAt(n.t));
  const tname = S.song.tracks[ti].name || "tr" + (ti+1);
  return name + " · bar " + bar + " beat " + beatLabel(beat) + " · " +
         (n.d / S.song.ppq).toFixed(2) + "q · vel " + n.v + " · " + tname + (n.added ? " · added" : "");
}

export function scorePencilTick(x) {
  // scoreXToTick interpolates between engraved noteheads — fine when a bar
  // has them, wildly coarse when it's empty (a blank composition's default).
  // Sparse bars get a LINEAR map from the note-start edge instead, which is
  // exactly what the pencil beat guides draw.
  const ppt = pxPerTick();
  const mw = S.scoreModel.bt * ppt;
  const mi = Math.max(0, Math.floor((x - S.RULER_W + S.view.x) / mw));
  const entry = S.scoreCache.get(mi) || renderMeasure(mi);
  if (entry && entry.timeMap.length >= 2) return scoreXToTick(x);
  const nsx = entry ? entry.noteStartX : SCORE_PAD;
  const localX = x - (S.RULER_W + mi * mw - S.view.x - SCORE_PAD);
  const frac = Math.max(0, Math.min(0.999, (localX - nsx) / Math.max(1, mw + SCORE_PAD - nsx)));
  return mi * S.scoreModel.bt + frac * S.scoreModel.bt;
}
export function scoreStaveAt(pos) {
  const localY = pos.y - (S.RULER_H + 4 - (S.view.y || 0));
  const si = Math.max(0, Math.min(S.scoreModel.staves.length - 1,
    Math.floor((localY - SCORE_TOP) / STAVE_H)));
  return {si, sy: localY - (SCORE_TOP + si * STAVE_H)};
}
export function scorePencil(pos) {
  if (!S.scoreModel || !S.scoreModel.staves.length) return;
  const {si, sy} = scoreStaveAt(pos);
  const st = S.scoreModel.staves[si];
  if (st.drums) { setInfo("kit entry lives in the roll (its lane) — score shows the chart"); return; }
  const probe = new VF.Stave(0, 0, 100); // VexFlow's own line geometry
  const topLineY = probe.getYForLine(0);
  const step = (probe.getYForLine(1) - topLineY) / 2; // line-to-space distance
  const k = Math.round((sy - topLineY) / step); // diatonic steps below the top line
  if (k < -9 || k > 17) return; // past ~4 ledger lines: not a note tap
  const nTop = st.clef === "bass" ? 26 : 38; // diatonic index of the top line: A3 / F5
  const n = nTop - k;
  const letter = "CDEFGAB"[((n % 7) + 7) % 7];
  const octave = Math.floor(n / 7);
  const sf = sfAt(S.playCursor);
  const acc = S.pencilAcc === "key"
    ? (["F", "C", "G", "D", "A", "E", "B"].slice(0, Math.max(0, sf)).includes(letter) ? 1
       : ["B", "E", "A", "D", "G", "C", "F"].slice(0, Math.max(0, -sf)).includes(letter) ? -1 : 0)
    : +S.pencilAcc;
  const pitch = (octave + 1) * 12 + LETTER_PC[letter] + acc;
  if (pitch < 0 || pitch > 127) return;
  const {t, snap} = pencilCellAt(scorePencilTick(pos.x));
  S.selTrack = st.ti;
  const tr = S.song.tracks[st.ti];
  if (tr.notes.some(n => !n.gone && n.t === t && n.p === pitch)) { previewNote(st.ti, pitch, t); return; } // no twins
  const added = !isComposition();
  tr.notes.push({t, d: snap, p: pitch, v: S.pencilVel, added});
  if (S.song.rawNotes) S.song.rawNotes[st.ti].push({t: t + S.chopS, d: snap, p: pitch, v: S.pencilVel, added});
  pushUndo({kind: "add", ti: st.ti, ni: tr.notes.length - 1});
  saveEdits();
  previewNote(st.ti, pitch, t);
  renderTrackbar();
  buildScoreModel();
  setInfo(noteLabel(st.ti, tr.notes.length - 1));
  draw();
}
export function scoreErase(pos) {
  const m = S.scoreModel;
  if (!m) return;
  const ppt = pxPerTick();
  const mi = Math.floor((pos.x - S.RULER_W + S.view.x) / (m.bt * ppt));
  const entry = S.scoreCache.get(mi);
  if (!entry) return;
  const localX = pos.x - (S.RULER_W + mi * m.bt * ppt - S.view.x - SCORE_PAD);
  const localY = pos.y - (S.RULER_H + 4 - (S.view.y || 0));
  for (const g of entry.geo) {
    if (localX >= g.x0 && localX <= g.x1 && localY >= g.y0 && localY <= g.y1 && g.refs[0]) {
      const {ti, ni} = g.refs[0];
      const en = S.song.tracks[ti].notes[ni];
      en.gone = true;
      if (S.song.rawNotes && en.ri !== undefined && S.song.rawNotes[ti][en.ri]) S.song.rawNotes[ti][en.ri].gone = true;
      if (S.selNote && S.selNote.ti === ti && S.selNote.ni === ni) S.selNote = null;
      pushUndo({kind: "erase", ti, ni});
      saveEdits();
      buildScoreModel();
      draw();
      return;
    }
  }
}
export function scoreTap(pos) {
  const m = S.scoreModel;
  const ppt = pxPerTick();
  const mw = m.bt * ppt;
  const mi = Math.floor((pos.x - S.RULER_W + S.view.x) / mw);
  const entry = S.scoreCache.get(mi);
  if (entry) {
    const localX = pos.x - (S.RULER_W + mi * m.bt * ppt - S.view.x - SCORE_PAD);
    const localY = pos.y - (S.RULER_H + 4 - (S.view.y || 0));
    for (const g of entry.geo) {
      if (localX >= g.x0 && localX <= g.x1 && localY >= g.y0 && localY <= g.y1) {
        S.selNote = g.refs[0] ? {ti: g.refs[0].ti, ni: g.refs[0].ni} : null;
        S.playCursor = g.tick;
        if (S.selNote) {
          setInfo(noteLabel(S.selNote.ti, S.selNote.ni));
          reflectSelVel(); // the vol slider doubles as the velocity readout
          previewNote(g.ti, g.pitches[g.pitches.length - 1], g.tick);
        }
        updateSubtitle(); draw();
        return;
      }
    }
  }
  // empty area: move the cursor there, on the move grid
  const snap = moveSnapTicks();
  S.playCursor = Math.max(0, Math.round(scoreXToTick(pos.x) / snap) * snap);
  S.selNote = null;
  setInfo("—");
  updateSubtitle(); draw();
}
