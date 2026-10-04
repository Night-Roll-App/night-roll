import { canvas } from "../render/roll.js";
import { S } from "../state.js";
import { pxPerTick } from "../render/roll.js";
import { topRow } from "../render/roll.js";
import { fallActive, stripPlayheadX, TAG_HIT } from "../render/roll.js";
import { scoreTickToX } from "../render/score.js";
import { barTicks } from "../model/rollnotes.js";
import { askBarsCount } from "../ask/tools.js";
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
import { wrap } from "../render/roll.js";
import { playSec } from "../audio/transport.js";
import { tickToSec } from "../midi/parse.js";
import { FALL_WINDOW } from "../render/instrument.js";
import { instGeom } from "../render/instrument.js";
import { trackAudible } from "../audio/engine.js";
import { trackIsDrums } from "../model/grid.js";
import { PIANO_LO } from "../ui/piano.js";
import { PIANO_HI } from "../ui/piano.js";
import { secToTick } from "../midi/parse.js";
import { trackLaneAt } from "../render/tracks.js";
import { trackShown } from "../render/roll.js";
import { noteRow } from "../render/roll.js";
import { refreshSelInfo } from "../ui/note-editor.js";
import { pianoIsWhite } from "../ui/piano.js";
import { laneGeom } from "../render/tracks.js";
import { tracksNoteY } from "../render/tracks.js";
import { clipSpanX } from "../render/tracks.js";
import { clearMultiSel } from "../model/selection.js";
import { cursorDragSnapTicks } from "../model/grid.js";
import { stop } from "../audio/transport.js";
import { play } from "../audio/transport.js";
import { editableSong } from "../model/song.js";
import { saveVoices } from "../ui/trackbar.js";
import { openVoiceMenu } from "../ui/voice-menu.js";
import { laneBotRow } from "../render/roll.js";
import { clampViewImpl as clampView } from "../ui/chrome.js";
import { kitSlots } from "../render/roll.js";
import { kitLaneTop } from "../render/roll.js";
import { pieceState } from "../audio/engine.js";
import { DRUM_LABELS } from "../render/roll.js";
import { resolveNote } from "../model/rollnotes.js";
import { visibleNotes } from "../model/rollnotes.js";
import { finalizeNotesImpl as finalizeNotes } from "../session/song.js";
import { saveLocalNotes } from "../model/edits.js";
import { computeSongEnd } from "../model/song.js";
import { moveClip } from "../audio/clips.js";
import { trimClip } from "../audio/clips.js";
import { moveSelectionToTrack } from "../model/selection.js";
import { selEditApply } from "../model/selection.js";
import { cursorTapSnapTicks } from "../model/grid.js";
import { deleteSelection } from "../model/selection.js";
import { gridFollowNote } from "../ui/note-editor.js";
import { deleteClip } from "../audio/clips.js";
import { selClipIs } from "../render/tracks.js";
import { clipLabel } from "../render/tracks.js";
import { BASE_RULER_H } from "../render/roll.js";
import { cycleSecDepth } from "../ui/chrome.js";
import { LANE_H } from "../render/roll.js";
import { openEditor } from "../ui/note-editor.js";
import { appMode } from "../platform/mode.js";
import { openAnalyzeSheet } from "../ui/sheets.js";
import { noteTapMovesCursor } from "../ui/sheets.js";
import { cofCanvas } from "../render/cof.js";
import { wrapSf } from "../render/cof.js";
import { drawCof } from "../render/cof.js";
import { logDebugImpl as logDebug } from "../ui/chrome.js";
import { setAnchorBQImpl as setAnchorBQ } from "../ui/note-editor.js";
import { setEndBQ } from "../model/rollnotes.js";
import { penInstant } from "../ui/sheets.js";
import { duplicateSelectionInPlace } from "../model/selection.js";
import { selEditItems } from "../model/selection.js";
import { trackToggle } from "../ui/trackbar.js";
import { songHasDrums } from "../render/roll.js";
import { inKitLane } from "../render/roll.js";
import { pencilTicks } from "../model/grid.js";
import { gridCellStart } from "../model/grid.js";
import { annoSnapshot } from "../model/edits.js";
import { minPxq } from "../ui/chrome.js";
import { PAN_TAIL_BARS } from "../ui/chrome.js";
import { songRegionRight } from "../ui/chrome.js";
import { editUndoPop, editRedoPop, updateEditButtons } from "../ui/note-editor.js";
import { duplicateSelection } from "../model/selection.js";
import { pxqFloor } from "../ui/chrome.js";
import { rowHFloor } from "../ui/chrome.js";
import { dispPitchExtent } from "../ui/chrome.js";
import { ROLL_AIR } from "../ui/chrome.js";
import { updateTrackGains } from "../audio/engine.js";
import { tracksLaneH } from "../render/tracks.js";
import { snapTickAbs } from "../model/grid.js";
import { drumStepImpl as drumStep } from "../render/roll.js";
import { sfShownAt } from "../model/song.js";
import { curTick } from "../render/roll.js";

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
  return rulerSnapTick((x - S.RULER_W + S.view.x) / pxPerTick());
}
// the same magnet for a tick that is NOT under the finger — a whole cycle
// slid by its middle (DAW F5) snaps by its START, so the span's length never
// changes while it rides the bar lines
export function rulerSnapTick(t) {
  const q = Math.round(S.song.ppq / 4);
  const fine = Math.max(0, Math.round(t / q) * q);
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

export function finalizeLasso() {
  const r = S.lassoRect;
  S.lassoRect = null;
  if (!r) return;
  const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1);
  const y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
  const ppt = pxPerTick();
  let t0 = (x0 - S.RULER_W + S.view.x) / ppt;
  const t1 = (x1 - S.RULER_W + S.view.x) / ppt;
  // the box reaching into the ruler is what makes its bands part of the copy —
  // and only the LANES it covers: a box up to the chord row takes chords, not
  // the section row above it (Josh, 2026-09-13)
  // S.STRIP_Y, not S.RULER_H: reaching into the playhead strip (its own
  // gesture zone, no annotation lanes of its own) must not count as "into
  // the ruler" — only the bands above it do.
  S.lassoAnno = S.viewMode === "roll" && !fallActive() && y0 < S.STRIP_Y ? {t0, t1, y0, y1} : null;
  // union: a new box ADDS to the selection (taps toggle individuals; an
  // empty-space tap clears) — rectangle-only couldn't isolate interleaved
  // targets like undersea-shrine's offbeat pedal (Josh, 2026-08-07)
  const addSel = (ti, ni) => {
    const k = ti + ":" + ni;
    if (!S.multiSelKey.has(k)) { S.multiSel.push({ti, ni}); S.multiSelKey.add(k); }
  };
  if (fallActive()) {
    // fall geometry: x = key column, y = time (bottom edge = now, later above)
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const nowSec = S.playing ? playSec() : tickToSec(S.song, S.playCursor);
    const pps = H / FALL_WINDOW;
    const sLo = nowSec + (H - y1) / pps, sHi = nowSec + (H - y0) / pps;
    const g = instGeom(W);
    S.song.tracks.forEach((tr, ti) => {
      if (!trackAudible(ti) || trackIsDrums(ti)) return;
      tr.notes.forEach((n, ni) => {
        if (n.gone || n.p < PIANO_LO || n.p > PIANO_HI) return;
        const nx0 = g.keyX(n.p);
        if (nx0 + g.keyW(n.p) < x0 || nx0 > x1) return;
        if (tickToSec(S.song, n.t) < sHi && tickToSec(S.song, n.t + n.d) > sLo) addSel(ti, ni);
      });
    });
    t0 = secToTick(S.song, Math.max(0, sLo)); // key context for spelling comes from the box's start
  } else if (S.viewMode === "tracks") {
    // arrange lasso: time span × lane span — a box across lanes selects
    // across tracks (the advisor's ruling: selection IS the arrange currency)
    const tiLo = trackLaneAt(y0), tiHi = trackLaneAt(y1);
    const lo = tiLo < 0 ? 0 : tiLo, hi = tiHi < 0 ? S.song.tracks.length - 1 : tiHi;
    for (let ti = lo; ti <= hi; ti++) {
      if (!trackShown(ti)) continue;
      S.song.tracks[ti].notes.forEach((n, ni) => {
        if (!n.gone && n.t < t1 && n.t + n.d > t0) addSel(ti, ni);
      });
    }
  } else if (S.viewMode === "score" && S.scoreModel) {
    // hit-test the engraved notehead boxes themselves — the roll's linear
    // x->tick map doesn't hold on a score (noteheads aren't engraved
    // proportionally), and selecting whole staff bands by time range grabbed
    // notes far outside a narrow lasso (Josh, on Town's bass)
    const topY = S.RULER_H + 4 - (S.view.y || 0);
    const mbt = S.scoreModel.bt * ppt;
    const mOrigin = k => S.RULER_W + k * mbt - S.view.x - SCORE_PAD;
    const mLo = Math.max(0, Math.floor((x0 - S.RULER_W + S.view.x) / mbt) - 1);
    const mHi = Math.min(S.scoreModel.nMeasures - 1, Math.ceil((x1 - S.RULER_W + S.view.x) / mbt) + 1);
    for (let k = mLo; k <= mHi; k++) {
      const entry = S.scoreCache.get(k) || renderMeasure(k);
      if (!entry) continue;
      for (const g of entry.geo) {
        const gx0 = mOrigin(k) + g.x0, gx1 = mOrigin(k) + g.x1;
        const gy0 = topY + g.y0, gy1 = topY + g.y1;
        if (gx1 < x0 || gx0 > x1 || gy1 < y0 || gy0 > y1) continue;
        for (const ref of g.refs) {
          if (S.song.tracks[ref.ti].notes[ref.ni].gone) continue;
          addSel(ref.ti, ref.ni);
        }
      }
    }
  } else {
    const rHi = topRow() - Math.floor((y0 - S.RULER_H + S.view.y) / S.view.rowH);
    const rLo = topRow() - Math.floor((y1 - S.RULER_H + S.view.y) / S.view.rowH);
    S.song.tracks.forEach((tr, ti) => {
      if (!trackShown(ti)) return;
      tr.notes.forEach((n, ni) => {
        const rw = noteRow(ti, n.p);
        if (!n.gone && rw >= rLo && rw <= rHi && n.t < t1 && n.t + n.d > t0) addSel(ti, ni);
      });
    });
  }
  refreshSelInfo();
}
export function toggleSel(hit) { // lasso-mode tap on a note: in/out of the selection
  const k = hit.ti + ":" + hit.ni;
  if (S.multiSelKey.has(k) || (S.selNote && S.selNote.ti === hit.ti && S.selNote.ni === hit.ni)) {
    S.multiSelKey.delete(k);
    S.multiSel = S.multiSel.filter(s => s.ti + ":" + s.ni !== k);
    if (S.selNote && S.selNote.ti === hit.ti && S.selNote.ni === hit.ni) S.selNote = null; // same gold ring, so tapping it out removes both
  } else {
    S.multiSel.push(hit);
    S.multiSelKey.add(k);
    previewNote(hit.ti, S.song.tracks[hit.ti].notes[hit.ni].p, S.song.tracks[hit.ti].notes[hit.ni].t);
  }
  refreshSelInfo();
}
export function fallHitNote(pos) { // reverse of drawFall's geometry
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const nowSec = S.playing ? playSec() : tickToSec(S.song, S.playCursor);
  const pps = H / FALL_WINDOW;
  const g = instGeom(W);
  let best = null;
  S.song.tracks.forEach((tr, ti) => {
    if (!trackAudible(ti) || trackIsDrums(ti)) return;
    tr.notes.forEach((n, ni) => {
      if (n.gone || n.p < PIANO_LO || n.p > PIANO_HI) return;
      const yB = H - (tickToSec(S.song, n.t) - nowSec) * pps;
      const yT = H - (tickToSec(S.song, n.t + n.d) - nowSec) * pps;
      if (pos.y < yT - 2 || pos.y > yB + 2) return;
      const white = pianoIsWhite(n.p);
      const x = g.keyX(n.p) + (white ? 1 : 0);
      if (pos.x < x - 1 || pos.x > x + g.keyW(n.p) - 1) return;
      if (!best || !white) best = {ti, ni}; // black columns overlay white ones: narrower wins
    });
  });
  return best;
}
export function hitTracksNote(pos) {
  const ti = trackLaneAt(pos.y);
  if (ti < 0 || pos.x < S.RULER_W) return null;
  const tick = (pos.x - S.RULER_W + S.view.x) / pxPerTick();
  const g = laneGeom(ti);
  const noteH = Math.max(3, (g.lh - 8) / Math.max(12, g.hi - g.lo));
  const tr = S.song.tracks[ti];
  for (let ni = tr.notes.length - 1; ni >= 0; ni--) {
    const n = tr.notes[ni];
    if (n.gone || tick < n.t - 8 / pxPerTick() || tick > n.t + n.d + 8 / pxPerTick()) continue;
    if (Math.abs(tracksNoteY(g, ti, n.p) - pos.y) <= Math.max(6, noteH)) return {ti, ni};
  }
  return null;
}
export function hitTracksClip(pos) { // {ti, ci, zone: "clip" | "clipL" | "clipR"} for the piece under the point, or null
  const ti = trackLaneAt(pos.y);
  if (ti < 0 || pos.x < S.RULER_W) return null;
  const tr = S.song.tracks[ti];
  if (tr.kind !== "audio" || !tr.clips.length) return null;
  for (let ci = tr.clips.length - 1; ci >= 0; ci--) {
    const {x0, x1} = clipSpanX(tr.clips[ci]);
    if (pos.x < x0 - 4 || pos.x > x1 + 4) continue;
    const edge = Math.max(8, Math.min(14, (x1 - x0) * 0.3)); // finger-sized edge zones, never the whole piece
    const zone = x1 - x0 < 24 ? "clip" : pos.x <= x0 + edge ? "clipL" : pos.x >= x1 - edge ? "clipR" : "clip";
    return {ti, ci, zone};
  }
  return null;
}
export function hitNote(pos) {
  const {tick, pitch} = posToTickPitch(pos);
  for (let ti = S.song.tracks.length - 1; ti >= 0; ti--) {
    if (!trackShown(ti)) continue;
    const tr = S.song.tracks[ti];
    for (let ni = 0; ni < tr.notes.length; ni++) {
      const n = tr.notes[ni];
      if (!n.gone && noteRow(ti, n.p) === pitch && tick >= n.t && tick <= n.t + Math.max(n.d, 8 / pxPerTick())) return {ti, ni};
    }
  }
  return null;
}
export function scoreLassoTap(pos) { // lasso-mode tap on the score: toggle the notehead under it
  if (!S.scoreModel) return;
  const x0 = pos.x - 7, x1 = pos.x + 7, y0 = pos.y - 7, y1 = pos.y + 7;
  const ppt = pxPerTick();
  const topY = S.RULER_H + 4 - (S.view.y || 0);
  const mbt = S.scoreModel.bt * ppt;
  const mOrigin = k => S.RULER_W + k * mbt - S.view.x - SCORE_PAD;
  const mLo = Math.max(0, Math.floor((x0 - S.RULER_W + S.view.x) / mbt) - 1);
  const mHi = Math.min(S.scoreModel.nMeasures - 1, Math.ceil((x1 - S.RULER_W + S.view.x) / mbt) + 1);
  for (let k = mLo; k <= mHi; k++) {
    const entry = S.scoreCache.get(k) || renderMeasure(k);
    if (!entry) continue;
    for (const g of entry.geo) {
      const gx0 = mOrigin(k) + g.x0, gx1 = mOrigin(k) + g.x1;
      const gy0 = topY + g.y0, gy1 = topY + g.y1;
      if (gx1 < x0 || gx0 > x1 || gy1 < y0 || gy0 > y1) continue;
      for (const ref of g.refs) {
        if (S.song.tracks[ref.ti].notes[ref.ni].gone) continue;
        toggleSel({ti: ref.ti, ni: ref.ni});
        return;
      }
    }
  }
  clearMultiSel();
  S.selNote = null;
  setInfo("lasso: cleared");
  draw();
}
export function scrubTo(pos) {
  const snap = cursorDragSnapTicks(); // 32nds (triplet/custom grid while active) — the fine path
  const tick = (pos.x - S.RULER_W + S.view.x) / pxPerTick();
  S.playCursor = Math.max(0, Math.round(tick / snap) * snap);
  updateSubtitle();
  draw();
}
// a ruler (or playhead strip) TAP's landing: while rolling, seek there like
// the transport does; at rest, just move the cursor. Shared so the strip's
// tap-to-move reuses exactly what the ruler's own tap already did.
export function seekOrMoveCursor(target, opts = {}) {
  if (S.playing) { stop(); play(tickToSec(S.song, target), opts).catch(() => {}); }
  else { S.playCursor = target; updateSubtitle(); draw(); }
}
// Go to bar (DAW F5, 2026-10-04 — docs/daw-inventory.md §4 #7, "go to bar 37
// without scrolling"): the LCD's bar segment opens #barjumpsheet with the
// current bar pre-filled; Go / Return seeks (or, while playing, restarts from
// there — the strip tap's own options), clamped to the song's bars. An in-app
// sheet, never prompt() (CLAUDE.md: native dialogs block the main thread).
export function openBarJump() {
  if (!S.song) return;
  const inp = document.getElementById("bjbar");
  const bars = askBarsCount();
  inp.value = String(Math.floor(curTick() / barTicks()) + 1);
  inp.max = String(bars);
  document.getElementById("bjof").textContent = "of " + bars;
  document.getElementById("barjumpsheet").classList.add("on");
  if (typeof inp.focus === "function") inp.focus();
  if (typeof inp.select === "function") inp.select(); // digits replace the old bar
}
export function barJumpGo() {
  if (!S.song) return false;
  const inp = document.getElementById("bjbar");
  const n = Math.round(Number(inp.value));
  if (inp.value === "" || !Number.isFinite(n)) { setInfo("type a bar number"); return false; }
  // your own song reaches PAN_TAIL_BARS past its end — the empty bars the roll
  // already pans into to write in (clampView); a song you can only read ends
  // where its music ends
  const bars = askBarsCount(), cap = bars + (editableSong() ? PAN_TAIL_BARS : 0);
  const bar = Math.max(1, Math.min(cap, n));
  const tick = (bar - 1) * barTicks();
  document.getElementById("barjumpsheet").classList.remove("on");
  seekOrMoveCursor(tick, {fromHere: true, noCountIn: true});
  // "without scrolling" is the point: bring an off-screen cursor into view a
  // third of the way in (the transport's own follow rule), and let auto-follow
  // re-latch if the song is rolling
  const x = tick * pxPerTick(), W = (canvas.clientWidth || 800) - S.RULER_W;
  if (x < S.view.x || x > S.view.x + W) { S.view.x = Math.max(0, x - W * 0.3); S.followFree = false; clampView(); draw(); }
  setInfo(bar === n ? "bar " + bar
        : n > cap ? "bar " + bar + " — the song has " + bars + " bar" + (bars === 1 ? "" : "s") + (cap > bars ? " (+" + PAN_TAIL_BARS + " to write in)" : "")
        : "bar 1");
  return true;
}
// Note menu (DAW F2, 2026-10-04 — docs/daw-inventory.md §4 #4). A grabbed
// note — after the 160 ms dwell, or an instant mouse / Pencil / already-
// selected grab — held STILL for NOTE_MENU_MS more opens #notemenu at the
// finger: Cut, Copy, Paste at cursor, Duplicate, Delete, Split at cursor,
// Quantize…, a velocity slider, Undo, Redo. Every item proxies the edit
// row's own button (or the ⌘D / ⌘Z handlers), so the guards, messages and
// undo entries are the row's — no edit logic lives here. Crossing the 8 px
// "moved" mark first cancels it (the hold became a drag); lifting first is
// today's tap. Once open the grab is over: the release commits nothing and
// runs no tap (S.drag.menuOpened), and a dismissing tap on the canvas is
// swallowed so it never seeks or deselects. Three-finger swipe undo/redo is
// deliberately NOT implemented: WebKit delivers iPadOS's undo gestures only
// to editable content (beforeinput historyUndo/historyRedo), never to a
// canvas page — Undo/Redo live in this menu instead.
export function armNoteMenu(d) {
  if (!d.noteEdit || /^clip/.test(d.noteEdit.kind)) return;
  clearTimeout(d.menuTimer);
  d.menuTimer = setTimeout(() => { if (S.drag === d && d.noteEdit && !d.moved && !d.menuOpened) openNoteMenu(d); }, NOTE_MENU_MS);
}
export function openNoteMenu(d) {
  const menu = document.getElementById("notemenu");
  const first = d.noteEdit.items[0] && d.noteEdit.items[0].n;
  const v = first && first.v !== undefined ? first.v : S.pencilVel;
  document.getElementById("nmvel").value = String(v);
  document.getElementById("nmvelval").textContent = String(v);
  // at the finger, kept inside the song region (an anchored menu clamped
  // against raw innerWidth can open under a docked window — see wm.js)
  const vw = (typeof window !== "undefined" && window.innerWidth) || 1024;
  const vh = (typeof window !== "undefined" && window.innerHeight) || 768;
  menu.style.left = Math.max(6, Math.min(d.x - 24, songRegionRight() - 236, vw - 236)) + "px";
  menu.style.top = Math.max(6, Math.min(d.y + 18, vh - 440)) + "px";
  menu.classList.add("on");
  d.menuOpened = true;
  updateEditButtons(); // the row's disabled states, mirrored onto the menu's items
  const k = d.noteEdit.items.length;
  setInfo("note menu — " + k + " note" + (k === 1 ? "" : "s") + " · tap away to close");
}
export function closeNoteMenu() {
  const menu = document.getElementById("notemenu");
  if (!menu.classList.contains("on")) return false;
  menu.classList.remove("on");
  return true;
}
export function placePencilNote(pp) { // deferred pencil: called by the dwell timer or a clean tap
  const tr = S.song.tracks[S.selTrack];
  if (tr.kind === "audio") { setInfo("that track is a recording — pick a MIDI track to pencil on"); return; }
  // a note already at this tick+pitch: tapping it again must not stack a twin
  // (Josh, 2026-09-12) — hand back the existing one so a drag still stretches it
  const dup = tr.notes.findIndex(n => !n.gone && n.t === pp.t && n.p === pp.pitch);
  if (dup >= 0) { previewNote(S.selTrack, pp.pitch, pp.t); return {ti: S.selTrack, ni: dup, t: pp.t, snap: pp.snap, existing: true}; }
  const added = !isComposition();
  tr.notes.push({t: pp.t, d: pp.snap, p: pp.pitch, v: S.pencilVel, added});
  if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: pp.t + S.chopS, d: pp.snap, p: pp.pitch, v: S.pencilVel, added});
  pushUndo({kind: "add", ti: S.selTrack, ni: tr.notes.length - 1});
  previewNote(S.selTrack, pp.pitch, pp.t);
  draw();
  return {ti: S.selTrack, ni: tr.notes.length - 1, t: pp.t, snap: pp.snap};
}
export function endPointer(e) {
  if (S.pinch && (S.pinch.a.id === e.pointerId || S.pinch.b.id === e.pointerId)) {
    // one finger lifted: hand control to the survivor as a fresh pan drag
    const survivor = S.pinch.a.id === e.pointerId ? S.pinch.b : S.pinch.a;
    S.drag = {id: survivor.id, x: survivor.x, y: survivor.y, sx: survivor.x, sy: survivor.y,
            moved: true, stripCursor: false, ruler: false};
    S.pinch = null;
    return;
  }
  if (!S.drag || S.drag.id !== e.pointerId) return;
  clearTimeout(S.drag.holdTimer);
  clearTimeout(S.drag.menuTimer);
  if (S.drag.menuOpened) { S.drag = null; draw(); return; } // the note menu is up: no commit, no tap — its items act next
  if (S.drag.trFader) { // persist the fader as the track: annotation (song truth)
    if (S.drag.moved && editableSong()) { S.voiceMenuTi = S.drag.trFader.ti; saveVoices(); }
    S.drag = null;
    draw();
    return;
  }
  if (S.drag.trHeader && !S.drag.moved) { // header tap: select; second tap = voice menu
    const ti = S.drag.trHeader.ti;
    if (S.selTrack === ti) {
      const g = laneGeom(ti);
      openVoiceMenu(ti, {getBoundingClientRect: () => ({left: 10, bottom: canvas.getBoundingClientRect().top + g.y0 + g.lh, top: canvas.getBoundingClientRect().top + g.y0, right: 130})});
    } else {
      S.selTrack = ti;
      renderTrackbar();
      setInfo((S.song.tracks[ti].name || "track " + (ti + 1)) + " selected — tap its header again for voice & volume");
    }
    S.drag = null;
    draw();
    return;
  }
  if (S.drag.trHeader) { S.drag = null; return; }
  if (S.drag.pendingPencil && !S.drag.moved && !S.drag.pencil) { // released before the dwell: a tap still pencils
    S.drag.pencil = placePencilNote(S.drag.pendingPencil);
    S.drag.pendingPencil = null;
  }
  if (S.drag.lane) { // pin the lane where it was dropped — as a synced lane: annotation
    if (!S.drag.moved) { // TAP a gutter label: normal -> SOLO -> mute -> normal (audition tool)
      const row = topRow() - Math.floor((S.drag.spos.y - S.RULER_H + S.view.y) / S.view.rowH);
      if (row === laneBotRow() - 1) { // the ⋯ row: toggle the full kit
        S.kitShowAll = !S.kitShowAll;
        localStorage.setItem("ff1roll-kitshowall", S.kitShowAll ? "1" : "0");
        S._kitSlots = null;
        setInfo(S.kitShowAll ? "full kit shown — pencil any piece, ⋯ hides the unused again"
                           : "unused pieces hidden — hat/snare/kick stay, plus whatever the song uses");
        clampView(); draw();
        S.drag = null;
        return;
      }
      const gm = kitSlots()[kitLaneTop() - row];
      if (gm !== undefined) {
        const st = pieceState.get(gm);
        if (st === undefined) pieceState.set(gm, "solo");
        else if (st === "solo") pieceState.set(gm, "mute");
        else pieceState.delete(gm);
        const solos = [...pieceState].filter(([, v]) => v === "solo").map(([k]) => DRUM_LABELS[k] || k);
        const mutes = [...pieceState].filter(([, v]) => v === "mute").map(([k]) => DRUM_LABELS[k] || k);
        setInfo((DRUM_LABELS[gm] || gm) + ": " + (pieceState.get(gm) || "normal") +
                (solos.length ? " · solo: " + solos.join(" ") : "") +
                (mutes.length ? " · muted: " + mutes.join(" ") : "") +
                " (tap cycles; session only — notes untouched)");
        draw();
      }
      S.drag = null;
      return;
    }
    if (S.drag.moved && S.songKey) {
      const old = S.rollnotes.find(n => /^lane:\s*-?\d+\s*$/.test(n.text));
      if (old) old.text = "lane: " + S.laneOverride;
      else S.rollnotes.push(resolveNote({b1: 1, q1: 1, b2: null, q2: null, text: "lane: " + S.laneOverride, added: true}));
      finalizeNotes();
      saveLocalNotes();
      setInfo("kit lane pinned (a lane: annotation — syncs with the song)");
    }
    S.drag = null;
    return;
  }
  if (S.drag.pencil) { // tap or stretch — either way the note exists; persist once
    const pn = S.drag.pencil;
    if (S.song.rawNotes && !pn.existing) { // late mirror: rawNotes index for undo/chop bookkeeping
      const rn = S.song.rawNotes[pn.ti][S.song.rawNotes[pn.ti].length - 1];
      if (rn) S.song.tracks[pn.ti].notes[pn.ni].ri = S.song.rawNotes[pn.ti].length - 1;
    }
    saveEdits();
    computeSongEnd();
    setInfo(noteLabel(pn.ti, pn.ni));
    draw();
  }
  else if (S.drag.lasso && S.drag.moved) finalizeLasso();
  else if (S.drag.noteEdit && /^clip/.test(S.drag.noteEdit.kind)) {
    const dT = S.drag.moved && S.tracksGhost ? S.tracksGhost.dT : 0;
    const zone = S.drag.noteEdit.kind;
    S.tracksGhost = null;
    if (dT === 0) draw();
    else if (zone === "clip") moveClip(S.drag.noteEdit.ti, S.drag.noteEdit.ci, dT);
    else trimClip(S.drag.noteEdit.ti, S.drag.noteEdit.ci, zone === "clipL" ? "L" : "R", dT);
  }
  else if (S.drag.noteEdit && S.drag.moved && S.viewMode === "tracks" && S.tracksGhost && S.drag.noteEdit.kind === "move") {
    const {dT, dLane} = S.tracksGhost;
    S.tracksGhost = null;
    if (dLane !== 0) { // retrack: the killer feature — one group undo, keeps pitch
      moveSelectionToTrack(S.drag.noteEdit.items[0].ti + dLane, dT);
    } else if (dT !== 0) {
      selEditApply(S.drag.noteEdit.items, n => { n.t = Math.max(0, n.t + dT); });
    } else draw();
  }
  else if (S.drag.noteEdit && S.drag.moved) { // commit the gesture: one undo entry, one save
    const o = S.drag.noteEdit.orig;
    const changed = S.drag.noteEdit.items.some((it, i) =>
      it.n.t !== o[i].t || it.n.d !== o[i].d || it.n.p !== o[i].p);
    if (changed) selEditApply(S.drag.noteEdit.items, () => {}, o);
  }
  else if (S.drag.rangeEdge === "mid" && !S.drag.rangeMoved) tap(S.drag.spos); // a press inside the band that never slid: today's park / re-arm tap
  else if (S.drag.rangeEdge && S.drag.moved && S.playing && S.rangeSel && S.rangeSel.cycle) {
    // new boundaries take effect NOW: the schedule pre-computes wrap passes, so
    // the cycle is rescheduled — from where the playhead IS when it's still
    // inside the new span (Josh, 2026-10-03: stretching the end while it plays
    // "should just go to the end of the selection", not jump back), from the
    // new top only when the stretch left the playhead outside it
    const at = secToTick(S.song, playSec());
    const inside = at >= S.rangeSel.a && at < S.rangeSel.b;
    const from = tickToSec(S.song, inside ? at : S.rangeSel.a);
    stop();
    play(from, {keepPos: inside, noCountIn: true}).catch(() => {});
  }
  else if (S.drag.bandEdge && S.drag.moved) {
    const n = S.drag.bandEdge.n;
    n.added = true; // edited spans must persist and sync
    pushUndo({kind: "anno", json: S.drag.bandEdge.pre}); // edge drags undo like any edit now
    finalizeNotes();
    saveLocalNotes();
    setInfo((n.chord ? "chord " : "section ") + n.text + " · bar " + n.b1 + "–" + (n.b2 || n.b1));
  }
  else if (S.drag.stripCursor) { // the playhead strip: tap moves the cursor, NEVER touches rangeSel
    if (!S.drag.moved) {
      if (!S.drag.onCursor) { // a grabbed-and-released playhead stays exactly where it is
        const tick = (S.drag.spos.x - S.RULER_W + S.view.x) / pxPerTick();
        const snap = cursorTapSnapTicks(); // a tap lands on the nearest 8th; drag for finer
        seekOrMoveCursor(Math.max(0, Math.round(tick / snap) * snap), {fromHere: true, noCountIn: true});
      }
    } else if (S.playing) seekOrMoveCursor(S.playCursor, {fromHere: true, noCountIn: true}); // a scrub while rolling: playback picks up where the finger lifted
  }
  else if (S.drag.ruler && !S.drag.rulerRange) tap(S.drag.spos); // a wobbly ruler tap still just places the cursor
  else if (!S.drag.moved) tap(evtPos(e));
  S.drag = null;
  if (S.viewMode === "score" && S.scoreModel && S.scoreZoom !== S.view.pxq) draw(); // re-engrave after pinch
}
export function tap(pos) {
  // lasso mode: taps EDIT the selection — tap a note to toggle it in/out,
  // tap empty space to clear. The box unions; taps are the precision tool.
  // Ruler taps keep their normal meaning (fall view has no ruler).
  if (S.lassoMode && S.song && (fallActive() || pos.y >= S.RULER_H)) {
    const hit = fallActive() ? fallHitNote(pos)
              : S.viewMode === "score" ? null : hitNote(pos);
    if (S.viewMode === "score" && !fallActive()) { scoreLassoTap(pos); return; }
    if (hit) { toggleSel(hit); return; }
    clearMultiSel();
    S.selNote = null; // a single selection from before lasso mode draws the same gold ring — "cleared" must clear it too (Josh, 2026-10-02)
    setInfo("lasso: cleared");
    draw();
    return;
  }
  if (S.viewMode === "tracks" && pos.y >= S.RULER_H && pos.x >= S.RULER_W && S.song) {
    const hit = hitTracksNote(pos);
    if (hit && S.mode === "erase" && editableSong()) {
      S.multiSel = [hit]; S.multiSelKey = new Set([hit.ti + ":" + hit.ni]);
      deleteSelection();
      return;
    }
    if (hit) {
      S.selNote = hit;
      S.multiSel = [hit]; S.multiSelKey = new Set([hit.ti + ":" + hit.ni]);
      S.selTrack = hit.ti;
      gridFollowNote(S.song.tracks[hit.ti].notes[hit.ni]);
      renderTrackbar();
      previewNote(hit.ti, S.song.tracks[hit.ti].notes[hit.ni].p, S.song.tracks[hit.ti].notes[hit.ni].t);
      setInfo(noteLabel(hit.ti, hit.ni));
      draw();
      return;
    }
    const ch = hitTracksClip(pos);
    if (ch) { // a piece: erase removes it; first tap selects (and says what it is), second tap plays from its start
      if (S.mode === "erase" && editableSong()) { deleteClip(ch.ti, ch.ci); return; }
      if (selClipIs(ch.ti, ch.ci) && editableSong()) {
        const from = tickToSec(S.song, S.song.tracks[ch.ti].clips[ch.ci].at);
        stop();
        play(from, {noCountIn: true}).catch(() => {});
        setInfo("playing from the piece's start");
      } else {
        S.selClip = {ti: ch.ti, ci: ch.ci}; S.selTrack = ch.ti;
        clearMultiSel();
        renderTrackbar();
        setInfo(clipLabel(ch.ti, ch.ci));
      }
      draw();
      return;
    }
    if (S.mode === "pencil") setInfo("pencil draws in Roll or Score — Tracks moves notes between tracks");
    const ti = trackLaneAt(pos.y);
    if (ti >= 0 && ti !== S.selTrack) { S.selTrack = ti; renderTrackbar(); }
    S.selClip = null;
    clearMultiSel();
    draw();
    return;
  }
  if (pos.y >= S.RULER_H) clearMultiSel(); // the ruler is NOT the background:
  // seeking/ranging must never cost the lasso (select -> range -> audition is ONE workflow)
  if (pos.y < S.RULER_H) { // section tap, marker tap, or seek
    if (S.rangeSel) {
      const {tick: rt} = posToTickPitch(pos);
      if (S.rangeSel.off && rt >= S.rangeSel.a && rt < S.rangeSel.b && pos.y < BASE_RULER_H) {
        S.rangeSel.off = false; // tap the dimmed span: it re-arms without redrawing it
        setInfo("cycle re-armed: " + "▶ loops the highlighted span again");
        draw();
        return;
      }
      // Logic-style: the first tap fades the highlight but it survives; a tap
      // OUTSIDE a faded one removes it (Josh, 2026-09-30: a stray range he
      // couldn't get rid of — it only ever dimmed)
      if (S.rangeSel.off && pos.y < BASE_RULER_H) { S.rangeSel = null; setInfo("range cleared"); }
      else S.rangeSel.off = true;
    }
    const {tick} = posToTickPitch(pos);
    const ppt = pxPerTick();
    if (pos.x < 18 && pos.y >= BASE_RULER_H && S.secMaxDepth > 1) { // ▸ chevron: cycle visible levels
      cycleSecDepth();
      return;
    }
    if (pos.y >= BASE_RULER_H) { // section lanes
      const lane = Math.floor((pos.y - BASE_RULER_H) / LANE_H);
      const sec = visibleNotes().find(n => (n.section || n.chord) && n.lane === lane && tick >= n.start && tick < n.end); // visibleNotes: Learning hides ✦ AI estimates (model/rollnotes.js)
      if (sec) {
        if (S.tapBand.n === sec && performance.now() - S.tapBand.t < 400) { // double-tap opens the annotation
          S.tapBand = {n: null, t: 0};
          openEditor(sec);
          return;
        }
        S.tapBand = {n: sec, t: performance.now()};
        S.rangeSel = {a: sec.start, b: sec.end};
        S.playCursor = sec.start;
        setInfo((sec.chord ? "chord " : "section ") + sec.text + " · bar " + sec.b1 + "–" + (sec.b2 || sec.b1) +
                (sec.cnote ? " · ✱ " + sec.cnote.split("\n")[0] : "") +
                (sec.stale ? " · notes here now read " + sec.stale + " — rename in ☰ Notes if you agree" : ""));
        if (sec.chord) { // arm the challenge — evidence only on request, never volunteered
          S.challengeSec = sec;
          const cb = document.getElementById("chordbtn");
          cb.textContent = "Challenge?";
          cb.style.display = "";
        }
        updateSubtitle(); draw();
        return;
      }
      // P6: the Analyze layer's own rows sit below the real section/chord
      // ones (never the same lane index) — a tap here opens the Adopt
      // sheet; it never touches rollnotes/rangeSel/tapBand itself.
      if (S.analysisOn && appMode() === "normal") {
        if (S.analysisChordLane !== null && lane === S.analysisChordLane) {
          const c = S.analysisBands.chords.find(b => tick >= b.start && tick < b.end);
          if (c) { openAnalyzeSheet({kind: "chord", start: c.start, end: c.end, text: c.text}); return; }
        }
        if (S.analysisKeyLane !== null && lane === S.analysisKeyLane && S.analysisBands.key &&
            tick >= S.analysisBands.key.start && tick < S.analysisBands.key.end) {
          openAnalyzeSheet({kind: "key", start: S.analysisBands.key.start, end: S.analysisBands.key.end, text: S.analysisBands.key.name});
          return;
        }
      }
    }
    let hitMark = null;
    for (const n of visibleNotes()) {
      if (Math.abs((n.start - tick) * ppt) < 14) { hitMark = n; break; }
    }
    if (hitMark && hitMark.keydir !== undefined && hitMark.added && !S.playing) {
      S.playCursor = hitMark.start;
      openEditor(hitMark); // key markers have no subtitle — flag tap opens the editor (Delete lives there)
      return;
    }
    const target = hitMark ? hitMark.start
                 : Math.max(0, Math.round(tick / cursorTapSnapTicks()) * cursorTapSnapTicks()); // nearest 8th
    seekOrMoveCursor(target);
    return;
  }
  if (S.viewMode === "score") {
    if (S.mode === "pencil") { scorePencil(pos); return; }
    if (S.mode === "erase") { scoreErase(pos); return; }
    scoreTap(pos);
    return;
  }
  if (S.mode === "pencil") { // reached only where pencil-drag isn't wired (fall view)
    const {tick, pitch} = posToTickPitch(pos);
    if (pitch < S.PMIN || pitch > S.PMAX || tick < 0) return;
    const {t, snap} = pencilCellAt(tick);
    const tr = S.song.tracks[S.selTrack];
    if (tr.kind === "audio") { setInfo("that track is a recording — pick a MIDI track to pencil on"); return; }
    if (tr.notes.some(n => !n.gone && n.t === t && n.p === pitch)) { previewNote(S.selTrack, pitch, t); return; } // no twins
    const added = !isComposition(); // in a composition the note IS the song, not an overlay
    tr.notes.push({t, d: snap, p: pitch, v: S.pencilVel, added});
    if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: t + S.chopS, d: snap, p: pitch, v: S.pencilVel, added});
    pushUndo({kind: "add", ti: S.selTrack, ni: tr.notes.length - 1});
    saveEdits();
    previewNote(S.selTrack, pitch, t);
    setInfo(noteLabel(S.selTrack, tr.notes.length - 1));
    draw();
    return;
  }
  const hit = hitNote(pos);
  if (S.mode === "erase") {
    if (hit) {
      const en = S.song.tracks[hit.ti].notes[hit.ni];
      en.gone = true;
      if (S.song.rawNotes && en.ri !== undefined && S.song.rawNotes[hit.ti][en.ri]) S.song.rawNotes[hit.ti][en.ri].gone = true;
      if (S.selNote && S.selNote.ti === hit.ti && S.selNote.ni === hit.ni) S.selNote = null;
      pushUndo({kind: "erase", ti: hit.ti, ni: hit.ni});
      saveEdits(); draw();
    }
    return;
  }
  S.selNote = hit;
  if (hit) {
    const n = S.song.tracks[hit.ti].notes[hit.ni];
    if (noteTapMovesCursor()) S.playCursor = n.t; // off by default: selecting never moves the playhead (DAW habit, 2026-09-29); + Note anchors at the tapped note either way
    setInfo(noteLabel(hit.ti, hit.ni));
    reflectSelVel(); // the vol slider doubles as the velocity readout
    previewNote(hit.ti, n.p, n.t);
    updateSubtitle();
  } else setInfo("—");
  draw();
}

export const cofAngle = e => {
  const r = cofCanvas.getBoundingClientRect();
  return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2);
};
export function cofRelease(e) {
  if (!S.cofPtr || S.cofPtr.id !== e.pointerId) return;
  if (S.cofPtr.moved) {
    S.cofRot = wrapSf(Math.round(S.cofDragRot));
    S.cofDragRot = null;
  } else { // plain tap: center the degree window on the tapped wedge
    let i = Math.round((cofAngle(e) + Math.PI / 2) / (Math.PI / 6));
    i = ((i % 12) + 12) % 12;
    S.cofSf = wrapSf(wrapSf(i > 6 ? i - 12 : i) + S.cofRot);
  }
  S.cofPtr = null;
  drawCof();
}

export const HOLD_MS = 160; // hold-to-grab dwell (was 230 — "way too damn hard", 2026-08-24)
export const NOTE_MENU_MS = 600; // a GRABBED note held still this much longer opens the note menu (DAW F2) — the constant Josh tunes by report
export const HOLD_SLOP = 20;                                                                                           // rollnote being edited, or null for new
export const RULER_RANGE_SLOP = 24;                                                           // An anchored menu/dropdown clamped against raw window.innerWidth could open

// iOS Safari ignores user-scalable=no: kill page-level pinch zoom explicitly,
// or a missed gesture zooms the whole page and hides the footer.
export function initGestures1() {
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(ev, e => e.preventDefault(), {passive: false});
  }
  document.addEventListener("touchmove", e => {
    if (e.touches.length > 1) e.preventDefault();
  }, {passive: false});
  document.addEventListener("touchend", e => {
    const now = Date.now();
    if (now - S.lastTapEnd < 350 && !e.target.closest("button, select, input, textarea, a"))
      e.preventDefault();
    S.lastTapEnd = now;
  }, {passive: false, capture: true});

  canvas.addEventListener("pointerdown", e => {
    if (fallActive() && !S.lassoMode) return; // fall rides the playhead — no pan/zoom; lasso still works
    // a PRIMARY pointer starts a new gesture: whatever an earlier one left
    // behind (a lift the canvas never heard) is gone. A stale drag made the next
    // touch a "second finger", so every drag zoomed (Josh, 2026-09-30, on his
    // iPad: "dragging only controls zoom"; couldn't lasso or range)
    // palm rejection: while the Pencil is down, a touch is the hand resting on
    // the glass, not a second finger for a pinch (checked first — a palm is
    // "primary" too: isPrimary is per pointer type)
    if (S.drag && S.drag.ptype === "pen" && e.pointerType === "touch") return;
    if (e.isPrimary && (S.pinch || (S.drag && S.drag.ptype === e.pointerType))) { logDebug("gesture: cleared a stale " + (S.pinch ? "pinch" : "drag") + " on a new touch"); clearTimeout(S.drag && S.drag.holdTimer); S.drag = null; S.pinch = null; }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {} // Safari can refuse mid-gesture
    if (S.pinch) return; // third finger: ignore
    if (S.drag && S.drag.id !== e.pointerId) {
      clearTimeout(S.drag.holdTimer);
      // the first finger wasn't a scroll after all — undo whatever it started
      // (a second finger means "pan/zoom", even with pencil or select armed)
      if (S.drag.pencil && !S.drag.pencil.existing) { // remove the just-penciled note and its undo entry
        const pn = S.drag.pencil;
        S.song.tracks[pn.ti].notes.splice(pn.ni, 1);
        if (S.song.rawNotes) S.song.rawNotes[pn.ti].pop();
        const u = S.editUndo[S.editUndo.length - 1];
        if (u && u.kind === "add" && u.ti === pn.ti && u.ni === pn.ni) S.editUndo.pop();
      }
      if (S.drag.noteEdit) { // put every grabbed note back where it was
        S.drag.noteEdit.items.forEach((it, i) => {
          const o = S.drag.noteEdit.orig[i];
          it.n.t = o.t; it.n.d = o.d; it.n.p = o.p;
        });
      }
      if (S.drag.bandEdge) { // restore the band's original span
        const be = S.drag.bandEdge;
        setAnchorBQ(be.n, be.s0);
        setEndBQ(be.n, be.e0);
        resolveNote(be.n);
      }
      S.lassoRect = null;
      S.pinch = {a: {id: S.drag.id, x: S.drag.x, y: S.drag.y},
               b: {id: e.pointerId, x: e.clientX, y: e.clientY},
               pxq: S.view.pxq, vx: S.view.x, rowH0: S.view.rowH, vy: S.view.y};
      S.pinch.dx0 = Math.abs(S.pinch.a.x - S.pinch.b.x);
      S.pinch.dy0 = Math.abs(S.pinch.a.y - S.pinch.b.y);
      S.pinch.mid0x = (S.pinch.a.x + S.pinch.b.x) / 2 - S.RULER_W; // fixed anchor: parallel fingers PAN
      S.pinch.mid0y = (S.pinch.a.y + S.pinch.b.y) / 2 - S.RULER_H;
      S.drag = null;
      return;
    }
    const p = evtPos(e);
    // a mouse press is deliberate; so is an Apple Pencil touch (iPadOS habit:
    // the pen draws, fingers navigate — 2026-09-29; device pref, default on).
    // A finger still dwells: a fast finger stroke pans
    const instantGrab = e.pointerType === "mouse" || (e.pointerType === "pen" && penInstant());
    let lasso = S.lassoMode && !!S.song && (fallActive() || p.y >= S.RULER_H); // the playhead's tag sits in the strip, above where a lasso can start
    let noteEdit = null, pendingEdit = null;
    // a drag that STARTS on a selected note moves the selection even in lasso
    // mode (drag from empty space still draws a box; a tap still toggles)
    if (editableSong() && (S.mode === "select" || lasso) && S.viewMode !== "score" && !fallActive() && p.y >= S.RULER_H) {
      const hit = S.viewMode === "tracks" ? hitTracksNote(p) : hitNote(p);
      const hitKey0 = hit ? hit.ti + ":" + hit.ni : null;
      const wasSelected = !!hit && S.multiSelKey.has(hitKey0);
      if (hit && !lasso && S.multiSel.length && !wasSelected) {
        // grabbing a note OUTSIDE the selection reselects just it (Logic
        // behavior) — but only when the grab actually ARMS (below), so a fast
        // pan across notes never churns the selection (Josh, 2026-08-24)
        S.selNote = hit;
      }
      if (hit && (wasSelected || !lasso)) {
        if (!S.multiSel.length) S.selNote = hit; // single note is draggable too
        gridFollowNote(S.song.tracks[hit.ti].notes[hit.ni]); // before any move math reads the grid
        if (e.altKey) duplicateSelectionInPlace(); // option-drag = drag out a copy
        const items = wasSelected || !S.multiSel.length ? selEditItems()
          : [{ti: hit.ti, ni: hit.ni, n: S.song.tracks[hit.ti].notes[hit.ni]}];
        if (items.length) {
          const hn = S.song.tracks[hit.ti].notes[hit.ni];
          const tickHere = posToTickPitch(p).tick;
          const edgeOk = hn.d * pxPerTick() >= 24 && !e.altKey; // tiny notes are all move handle
          const nearEnd = edgeOk && Math.abs(tickHere - (hn.t + hn.d)) < 8 / pxPerTick();
          const nearStart = edgeOk && !nearEnd && Math.abs(tickHere - hn.t) < 8 / pxPerTick();
          pendingEdit = {kind: nearEnd ? "resize" : nearStart ? "resizeL" : "move",
                         orig: items.map(({ti, ni, n: nn}) => ({ti, ni, t: nn.t, d: nn.d, p: nn.p})),
                         items, hitKey: hitKey0, reselect: !wasSelected};
          // a SELECTED note grabs instantly for every pointer — tap once, then
          // drag; the dwell is only for cold grabs (Josh: "way too damn hard")
          if (instantGrab || wasSelected) { armNoteEdit(pendingEdit); noteEdit = pendingEdit; pendingEdit = null; }
          lasso = false;
        }
      }
    }
    // a clip slides in time like a note — in Select mode only, like a note: with no
    // tool armed a drag over it pans (Josh, 2026-09-16: a pan moved his take to bar 5)
    if (editableSong() && S.mode === "select" && S.viewMode === "tracks" && !noteEdit && !pendingEdit && !lasso && p.y >= S.RULER_H && p.x >= S.RULER_W) {
      const ch = hitTracksClip(p); // selected = instant grab, cold = dwell; edges trim, the body moves
      if (ch) {
        const wasSel = selClipIs(ch.ti, ch.ci);
        pendingEdit = {kind: wasSel ? ch.zone : "clip", ti: ch.ti, ci: ch.ci, items: [], orig: [], reselect: false}; // edges only on a selected piece
        if (instantGrab || wasSel) { noteEdit = pendingEdit; pendingEdit = null; }
        S.selClip = {ti: ch.ti, ci: ch.ci};
      }
    }
    if (S.viewMode === "tracks" && p.x < S.RULER_W && p.y >= S.RULER_H && S.song) { // lane header column
      const ti = trackLaneAt(p.y);
      if (ti >= 0) {
        const g = laneGeom(ti);
        const ly = p.y - g.y0;
        if (ly >= 22 && ly <= 42 && p.x >= 8 && p.x <= 30) { // M
          trackToggle(ti, "muted");
          S.drag = null; return;
        }
        if (ly >= 22 && ly <= 42 && p.x >= 34 && p.x <= 56) { // S
          trackToggle(ti, "solo");
          S.drag = null; return;
        }
        if (g.lh >= 56 && ly >= 22 && ly <= 42 && p.x >= 56 && p.x <= 126) { // fader
          S.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
                  moved: false, trFader: {ti}, spos: p};
          return;
        }
        S.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
                moved: false, trHeader: {ti}, spos: p};
        return;
      }
    }
    if (S.viewMode === "roll" && p.x < S.RULER_W && p.y >= S.RULER_H && songHasDrums()) { // grab the lane by its gutter labels
      const row = topRow() - Math.floor((p.y - S.RULER_H + S.view.y) / S.view.rowH);
      if (inKitLane(row)) {
        S.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
                moved: false, lane: {y0: e.clientY, top0: kitLaneTop()}, spos: p};
        return;
      }
    }
    let pencil = null, pendingPencil = null; // pencil-drag: note at finger-down, stretch as you drag
    if (editableSong() && S.mode === "pencil" && S.viewMode === "roll" && !fallActive() && !lasso && p.y >= S.RULER_H) {
      const {tick, pitch: row} = posToTickPitch(p);
      const kit = trackIsDrums(S.selTrack);
      const li = kitLaneTop() - row; // lane slot index when the tap lands in the docked lane
      const pitch = kit ? (li >= 0 && li < kitSlots().length ? kitSlots()[li] : -1)
                        : (row >= S.PMIN && row <= S.PMAX && !inKitLane(row) ? row : -1);
      if (pitch >= (kit ? 0 : S.PMIN) && pitch <= 127 && tick >= 0) {
        const snap = S.gridDiv ? moveSnapTicks() : pencilTicks(); // custom grid: a tap = one cell
        const t = gridCellStart(tick); // the CELL you touch, not the nearest line —
        // tapping mid-gap between two notes lands the note IN the gap (rounding made only edges work)
        pendingPencil = {pitch, t, snap}; // created on dwell or a clean tap — never by a fast stroke
        if (instantGrab) pencil = placePencilNote(pendingPencil), pendingPencil = null;
      }
    }
    // Grab a section/chord band by its edge (roll view, any song). This used to
    // require editableSong(), which conflated "the MIDI is editable" with "this
    // annotation is mine" — so Josh could not adjust a section boundary on an
    // FF1 song, the songs he annotates most (2026-08-25). A band lives in the
    // .rollnotes sidecar; dragging it touches zero MIDI bytes, and the drop path
    // is the same finalizeNotes + saveLocalNotes his FF1 notes already use.
    let bandEdge = null;
    if (S.song && S.viewMode !== "score" && !fallActive() && !noteEdit && !pencil &&
        p.y >= BASE_RULER_H && p.y < S.STRIP_Y) { // the band rows only — not the playhead strip below them
      const laneAt = Math.floor((p.y - BASE_RULER_H) / LANE_H);
      const tk = posToTickPitch(p).tick, ppt = pxPerTick();
      const band = S.rollnotes.find(n => (n.section || n.chord) && n.lane === laneAt &&
        (Math.abs((n.start - tk) * ppt) < 10 || Math.abs((n.end - tk) * ppt) < 10));
      if (band) bandEdge = {n: band,
        side: Math.abs((band.end - tk) * ppt) <= Math.abs((band.start - tk) * ppt) ? "end" : "start",
        s0: band.start, e0: band.end, pre: annoSnapshot()};
    }
    let rangeEdge = null; // grab the cycle highlight by an END and stretch it
    if (!lasso && !noteEdit && !pendingEdit && !pencil && !pendingPencil && !bandEdge &&
        S.song && p.y < BASE_RULER_H && S.rangeSel && S.rangeSel.b > S.rangeSel.a && S.viewMode !== "score") {
      const ppt = pxPerTick();
      const ax = S.RULER_W + S.rangeSel.a * ppt - S.view.x, bx = S.RULER_W + S.rangeSel.b * ppt - S.view.x;
      if (Math.abs(p.x - bx) < 12) rangeEdge = "b";
      else if (Math.abs(p.x - ax) < 12) rangeEdge = "a";
      // inside the band, clear of both ends: the whole cycle slides (DAW F5,
      // Logic's drag-the-centre); the ends still stretch as before, and a
      // tap here still parks/re-arms — the slide only engages past
      // RULER_RANGE_SLOP (endPointer hands an unmoved press to tap())
      else if (p.x > ax + 12 && p.x < bx - 12) rangeEdge = "mid";
    }
    const plain = !lasso && !noteEdit && !pendingEdit && !pencil && !pendingPencil && !bandEdge && !rangeEdge;
    // a press ON the playhead (its tag in the strip, any mode, even while
    // playing; or its line through the notes at rest, select mode) — a cursor
    // drag, which is the strip's scrub with one difference: let go without
    // moving and the cursor stays put (a strip tap would snap it to an 8th)
    const onCursor = plain && cursorHit(p);
    S.drag = {id: e.pointerId, ptype: e.pointerType, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false,
            lasso, noteEdit, pencil, bandEdge, pendingEdit, pendingPencil, rangeEdge, onCursor,
            range0: rangeEdge ? {a: S.rangeSel.a, b: S.rangeSel.b} : null, // the span as grabbed — a "mid" slide keeps its length
            ruler: plain && !!S.song && p.y < BASE_RULER_H,
            // the playhead strip, between the ruler/bands and the notes (Josh,
            // 2026-10-03): tap moves the cursor, drag scrubs — NEVER touches
            // rangeSel (that's the whole point — the ruler above still parks
            // it). No viewMode exclusion: same linear-tick approximation the
            // ruler's own tap/drag already uses in Score. Also the flag for a
            // grabbed playhead (onCursor) — one scrub path, one follow rule.
            stripCursor: onCursor || (plain && !!S.song && !fallActive() && p.y >= S.STRIP_Y && p.y < S.RULER_H),
            spos: p};
    if (noteEdit) armNoteMenu(S.drag); // an instant grab: hold it still for the note menu (DAW F2)
    if (pendingEdit || pendingPencil) { // hold-to-grab: dwell arms the edit; a fast stroke pans
      const d = S.drag;
      d.holdTimer = setTimeout(() => {
        // pending survives small jitter (moved flips at 8px, pending dies at
        // HOLD_SLOP) — only a real swipe or a finished gesture cancels the arm
        if (S.drag !== d || (!d.pendingEdit && !d.pendingPencil)) return;
        if (d.pendingEdit) {
          armNoteEdit(d.pendingEdit);
          d.noteEdit = d.pendingEdit; d.pendingEdit = null;
          // the dwell armed — SAY so, or moving a beat early silently pans instead
          // (Josh, 2026-08-22: "sometimes I did [hold] and it was still difficult")
          const k = d.noteEdit.items.length;
          setInfo("✊ grabbed " + k + " note" + (k === 1 ? "" : "s") + " — drag to move");
          previewNote(d.noteEdit.items[0].ti, d.noteEdit.items[0].n.p, d.noteEdit.items[0].n.t); // audible arm cue
          armNoteMenu(d); // keep holding still → the note menu (DAW F2)
        }
        else if (d.pendingPencil) { d.pencil = placePencilNote(d.pendingPencil); d.pendingPencil = null; }
        draw();
      }, HOLD_MS);
    }
  });
  canvas.addEventListener("pointermove", e => {
    if (S.pinch) {
      const pt = S.pinch.a.id === e.pointerId ? S.pinch.a : S.pinch.b.id === e.pointerId ? S.pinch.b : null;
      if (!pt) return;
      pt.x = e.clientX; pt.y = e.clientY;
      // per-axis zoom: horizontal finger spread scales time, vertical spread
      // scales pitch rows (roll only). PAD damps the axis the fingers are
      // nearly aligned on, so a one-axis pinch doesn't wobble the other.
      const PAD = 40;
      const sx = (Math.abs(S.pinch.a.x - S.pinch.b.x) + PAD) / (S.pinch.dx0 + PAD);
      const midX = (S.pinch.a.x + S.pinch.b.x) / 2 - S.RULER_W;
      const floorX = S.viewMode === "score" ? minPxq() : pxqFloor();
      const newPxq = Math.min(400, Math.max(floorX, S.pinch.pxq * sx));
      // anchored at the gesture's STARTING midpoint: spreading zooms around it,
      // moving both fingers together pans — so two fingers always scroll, even
      // with pencil or select armed (Josh, 2026-08-19: sweeping scrolls misfired)
      S.view.x = (S.pinch.vx + S.pinch.mid0x) * (newPxq / S.pinch.pxq) - midX;
      S.view.pxq = newPxq;
      if (S.viewMode !== "score" && newPxq === floorX) S.view.x = 0; // flush: bar 1 at the left edge
      if (S.viewMode === "roll") { // roll rows only — score staves and tracks lanes are fixed-height
        const sy = (Math.abs(S.pinch.a.y - S.pinch.b.y) + PAD) / (S.pinch.dy0 + PAD);
        const midY = (S.pinch.a.y + S.pinch.b.y) / 2 - S.RULER_H;
        const floorY = rowHFloor();
        const newRowH = Math.min(32, Math.max(floorY, S.pinch.rowH0 * sy));
        S.view.y = (S.pinch.vy + S.pinch.mid0y) * (newRowH / S.pinch.rowH0) - midY;
        S.view.rowH = newRowH;
        if (newRowH === floorY) S.view.y = (topRow() - dispPitchExtent().hi - ROLL_AIR) * newRowH; // top row + air below the ruler
      }
      clampView(); draw();
      return;
    }
    if (!S.drag || S.drag.id !== e.pointerId) return;
    if (S.drag.menuOpened) return; // the note menu took over: the finger lifting is not a drag
    const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
    const trav = Math.abs(e.clientX - S.drag.sx) + Math.abs(e.clientY - S.drag.sy);
    if (trav > 8) S.drag.moved = true;
    if (S.drag.moved && S.drag.menuTimer) { clearTimeout(S.drag.menuTimer); S.drag.menuTimer = null; } // the hold became a drag: no menu
    if (trav > HOLD_SLOP && (S.drag.pendingEdit || S.drag.pendingPencil)) {
      S.drag.pendingEdit = S.drag.pendingPencil = null; // a real swipe, not pen jitter: it's a scroll
      clearTimeout(S.drag.holdTimer);
    }
    if (S.drag.moved) {
      if (S.drag.lasso) {
        const p = evtPos(e);
        S.lassoRect = {x0: S.drag.spos.x, y0: S.drag.spos.y, x1: p.x, y1: p.y};
        draw();
      }
      else if (S.drag.trFader) { // lane fader: live while dragging, persist on release
        const ti = S.drag.trFader.ti;
        const v = Math.max(0, Math.min(1.5, ((evtPos(e).x - 62) / 56) * 1.5));
        S.song.tracks[ti].vol = Math.abs(v - 1) < 0.04 ? undefined : Math.round(v * 100) / 100;
        updateTrackGains();
        draw();
      }
      else if (S.drag.lane) { // drag the kit lane anywhere; it pins there for this song
        const dRow = Math.round((S.drag.lane.y0 - e.clientY) / S.view.rowH);
        S.laneOverride = Math.min(S.PMAX - 4, Math.max(S.PMIN - 2, S.drag.lane.top0 + dRow));
        draw();
      }
      else if (S.drag.pencil && !S.drag.pencil.existing) { // stretch the just-penciled note under the finger, on the fine grid
        const pn = S.drag.pencil, nn = S.song.tracks[pn.ti].notes[pn.ni];
        const g = moveSnapTicks(); // 16ths (or triplet steps) — not the coarse tap length
        const tickHere = posToTickPitch(evtPos(e)).tick;
        nn.d = Math.max(g, Math.round((tickHere - pn.t) / g) * g);
        const rn = S.song.rawNotes && nn.ri !== undefined && S.song.rawNotes[pn.ti][nn.ri];
        if (rn) rn.d = nn.d;
        draw();
      }
      else if (S.drag.noteEdit) { // 16th grid — or triplet steps while a T duration is active
        const p = evtPos(e);
        const snap = moveSnapTicks();
        const dT = Math.round((p.x - S.drag.spos.x) / pxPerTick() / snap) * snap;
        if (S.drag.noteEdit.kind === "clip" || S.drag.noteEdit.kind === "clipL" || S.drag.noteEdit.kind === "clipR") {
          S.tracksGhost = {dT, dLane: 0, zone: S.drag.noteEdit.kind}; // ghost only; the annotation rewrites on release
          draw();
        }
        else if (S.drag.noteEdit.kind === "move" && S.viewMode === "tracks") {
          // arrange drag is a GHOST — commit on release (live retrack would churn
          // the {ti,ni} selection under our feet; advisor's structural ruling)
          const snap = moveSnapTicks();
          const dT = Math.round((p.x - S.drag.spos.x) / pxPerTick() / snap) * snap;
          let dLane = Math.round((p.y - S.drag.spos.y) / tracksLaneH());
          const fromTi = S.drag.noteEdit.items[0].ti;
          const tgt = fromTi + dLane;
          if (tgt < 0 || tgt >= S.song.tracks.length ||
              trackIsDrums(tgt) !== trackIsDrums(fromTi) ||
              S.song.tracks[tgt].kind === "audio") dLane = 0; // compatible lanes only; notes never land in a clip lane
          S.tracksGhost = {dT, dLane};
          draw();
        }
        else if (S.drag.noteEdit.kind === "move") {
          const dP = Math.round((S.drag.spos.y - p.y) / S.view.rowH);
          // absolute snap: the GRABBED note lands ON grid lines (an off-phase
          // note — born on a custom grid — could never reach the "and of 1" by
          // relative steps; Josh, 2026-08-24); mates keep their offsets
          const gi = S.drag.noteEdit.orig.findIndex((o, i) => {
            const it = S.drag.noteEdit.items[i]; return it.ti + ":" + it.ni === S.drag.noteEdit.hitKey;
          });
          const go = S.drag.noteEdit.orig[gi] || S.drag.noteEdit.orig[0];
          const dTr = (p.x - S.drag.spos.x) / pxPerTick();
          const dMove = snapTickAbs(go.t + dTr) - go.t;
          for (let i = 0; i < S.drag.noteEdit.items.length; i++) {
            const it = S.drag.noteEdit.items[i], o = S.drag.noteEdit.orig[i];
            it.n.t = Math.max(0, o.t + dMove);
            it.n.p = trackIsDrums(it.ti) ? drumStep(o.p, -dP) // lane rows run opposite to slot order
                                         : Math.min(S.PMAX, Math.max(S.PMIN, o.p + dP));
          }
        } else if (S.drag.noteEdit.kind === "resizeL") { // left edge: end stays put
          const minD = Math.max(24, Math.round(S.song.ppq / 8));
          const gi = S.drag.noteEdit.orig.findIndex((o, i) => {
            const it = S.drag.noteEdit.items[i]; return it.ti + ":" + it.ni === S.drag.noteEdit.hitKey;
          });
          const go = S.drag.noteEdit.orig[gi] || S.drag.noteEdit.orig[0];
          const edgeT = Math.round((go.t + dT) / snap) * snap; // absolute: land ON lines
          const dEdge = edgeT - go.t;
          for (let i = 0; i < S.drag.noteEdit.items.length; i++) {
            const it = S.drag.noteEdit.items[i], o = S.drag.noteEdit.orig[i];
            const nt = Math.max(0, Math.min(o.t + dEdge, o.t + o.d - minD));
            it.n.t = nt;
            it.n.d = o.d + (o.t - nt);
          }
        } else {
          const minD = Math.max(24, Math.round(S.song.ppq / 8));
          const gi = S.drag.noteEdit.orig.findIndex((o, i) => {
            const it = S.drag.noteEdit.items[i]; return it.ti + ":" + it.ni === S.drag.noteEdit.hitKey;
          });
          const go = S.drag.noteEdit.orig[gi] || S.drag.noteEdit.orig[0];
          const edgeT = Math.round((go.t + go.d + dT) / snap) * snap; // absolute: land ON lines
          const dEdge = edgeT - (go.t + go.d);
          for (let i = 0; i < S.drag.noteEdit.items.length; i++) {
            const it = S.drag.noteEdit.items[i], o = S.drag.noteEdit.orig[i];
            it.n.d = Math.max(minD, o.d + dEdge);
          }
        }
        draw();
      }
      else if (S.drag.rangeEdge === "mid") { // slide the whole cycle: length kept, start bar-magnetic, clamped at 0
        const x = evtPos(e).x;
        // the same finger-width allowance as a ruler tap: a wobble inside the
        // band is still the park/re-arm tap, not a 16th-note shove
        if (!S.drag.rangeMoved && Math.abs(x - S.drag.spos.x) < RULER_RANGE_SLOP) return;
        S.drag.rangeMoved = true;
        const len = S.drag.range0.b - S.drag.range0.a;
        const a = rulerSnapTick(S.drag.range0.a + (x - S.drag.spos.x) / pxPerTick());
        S.rangeSel.a = a; S.rangeSel.b = a + len;
        S.rangeSel.off = false; // sliding re-arms a parked cycle, like stretching
        draw();
      }
      else if (S.drag.rangeEdge) { // stretch the cycle by its end — bar-magnetic, stays armed
        const tk = rulerSnapX(evtPos(e).x);
        const min16 = Math.round(S.song.ppq / 4);
        if (S.drag.rangeEdge === "a") S.rangeSel.a = Math.max(0, Math.min(tk, S.rangeSel.b - min16));
        else S.rangeSel.b = Math.max(tk, S.rangeSel.a + min16);
        S.rangeSel.off = false; // stretching re-arms a parked cycle
        draw();
      }
      else if (S.drag.bandEdge) {
        const be = S.drag.bandEdge, n = be.n;
        const tk = tickAtX(evtPos(e).x, Math.round(S.song.ppq / 4)); // 16ths, like ruler selects
        if (be.side === "end") setEndBQ(n, Math.max(be.s0 + beatTicks(), tk));
        else setAnchorBQ(n, Math.min(Math.max(0, tk), be.e0 - beatTicks()));
        resolveNote(n);
        draw();
      }
      else if (S.drag.stripCursor) scrubTo(evtPos(e));
      else if (S.drag.ruler) { // drag along the ruler = select a beat range
        // a finger placing the cursor wobbles past the 8px "moved" mark; under
        // RULER_RANGE_SLOP it is still that tap, not a 16th-note cycle (Josh,
        // 2026-10-02: "I'm always accidentally selecting a 16th note … then
        // press play and it loops back-and-forth super fast")
        if (!S.drag.rulerRange && Math.abs(evtPos(e).x - S.drag.spos.x) < RULER_RANGE_SLOP) return;
        S.drag.rulerRange = true;
        const a = rulerSnapX(S.drag.spos.x);
        const b = rulerSnapX(evtPos(e).x);
        S.rangeSel = a === b ? null : {a: Math.min(a, b), b: Math.max(a, b), cycle: true}; // drags arm the cycle
        draw();
      }
      else { S.view.x -= dx; S.view.y -= dy; S.followFree = true; clampView(); draw(); }
    }
    S.drag.x = e.clientX; S.drag.y = e.clientY;
  });
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", () => { S.drag = null; S.pinch = null; draw(); });
  { // note menu (DAW F2): every item is the edit row's own button or handler
    const act = (id, fn) => document.getElementById(id).addEventListener("click", () => { closeNoteMenu(); fn(); });
    const press = bid => () => document.getElementById(bid).click();
    act("nmCut", press("cutbtn")); act("nmCopy", press("copybtn")); act("nmPaste", press("pastebtn"));
    act("nmDup", () => { if (duplicateSelection()) setInfo("duplicated — ⌘D again repeats it"); });
    act("nmDelete", press("delbtn")); act("nmSplit", press("splitbtn")); act("nmQuant", press("quantbtn"));
    act("nmUndo", editUndoPop); act("nmRedo", editRedoPop);
    // the velocity row drives the edit row's own slider: live while dragging, one undo on release
    const vs = document.getElementById("velslider"), nv = document.getElementById("nmvel");
    const forward = type => { vs.value = nv.value; document.getElementById("nmvelval").textContent = nv.value; vs.dispatchEvent(new Event(type)); };
    nv.addEventListener("input", () => forward("input"));
    nv.addEventListener("change", () => forward("change"));
    // tap-away closes it; a dismissing tap on the canvas is swallowed, so it never seeks or deselects
    document.addEventListener("pointerdown", e => {
      const m = document.getElementById("notemenu");
      if (!m.classList.contains("on") || (typeof m.contains === "function" && m.contains(e.target))) return;
      closeNoteMenu();
      if (e.target === canvas) { e.stopPropagation(); e.preventDefault(); }
    }, {capture: true});
  }
  // Go to bar (DAW F5): the LCD's bar segment, the sheet's Go, and Return in its field
  document.getElementById("lcdbarseg").addEventListener("click", openBarJump);
  document.getElementById("bjgo").addEventListener("click", barJumpGo);
  document.getElementById("bjclose").addEventListener("click", () => document.getElementById("barjumpsheet").classList.remove("on"));
  document.getElementById("bjbar").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); barJumpGo(); } });
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const mid = evtPos(e).x - S.RULER_W;
      const floorX = S.viewMode === "score" ? minPxq() : pxqFloor();
      const newPxq = Math.min(400, Math.max(floorX, S.view.pxq * (e.deltaY < 0 ? 1.1 : 0.9)));
      S.view.x = (S.view.x + mid) * (newPxq / S.view.pxq) - mid;
      S.view.pxq = newPxq;
      if (S.viewMode !== "score" && newPxq === floorX) S.view.x = 0;
    } else { S.view.x += e.deltaX; S.view.y += e.deltaY; }
    S.followFree = true;
    clampView(); draw();
  }, {passive: false});
}

export function initGestures2() {
  document.getElementById("cofbtn").addEventListener("click", () => {
    const g = S.song ? sfShownAt(curTick()) : null;
    S.cofSf = g !== null ? wrapSf(g) : 0;
    S.cofRot = S.cofSf; // the song's key rides at 12 o'clock
    document.getElementById("cofsheet").classList.add("on");
    drawCof();
  });
  // Undo/Redo spin the WHEEL a fifth at a time; the degree window moves by tapping wedges
  document.getElementById("cofcw").addEventListener("click", () => { S.cofRot = wrapSf(S.cofRot - 1); drawCof(); });
  document.getElementById("cofccw").addEventListener("click", () => { S.cofRot = wrapSf(S.cofRot + 1); drawCof(); });
  cofCanvas.addEventListener("pointerdown", e => {
    cofCanvas.setPointerCapture(e.pointerId);
    S.cofPtr = {id: e.pointerId, a0: cofAngle(e), rot0: S.cofRot, moved: false};
  });
  cofCanvas.addEventListener("pointermove", e => {
    if (!S.cofPtr || S.cofPtr.id !== e.pointerId) return;
    let d = cofAngle(e) - S.cofPtr.a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) > 0.06) S.cofPtr.moved = true;
    if (S.cofPtr.moved) {
      S.cofDragRot = S.cofPtr.rot0 - d / (Math.PI / 6); // wheel follows the finger
      drawCof();
    }
  });
  cofCanvas.addEventListener("pointerup", cofRelease);
  cofCanvas.addEventListener("pointercancel", () => { S.cofPtr = null; S.cofDragRot = null; drawCof(); });
}
