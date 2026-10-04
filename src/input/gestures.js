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
      const sec = S.rollnotes.find(n => (n.section || n.chord) && n.lane === lane && tick >= n.start && tick < n.end);
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
    for (const n of S.rollnotes) {
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
export const HOLD_SLOP = 20;                                                                                             // rollnote being edited, or null for new
export const RULER_RANGE_SLOP = 24;                                                           // An anchored menu/dropdown clamped against raw window.innerWidth could open
