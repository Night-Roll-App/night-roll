import { S } from "../state.js";
import { isComposition } from "./provenance.js";
import { annoSnapshot } from "./edits.js";
import { barTicks } from "./rollnotes.js";
import { beatTicks } from "./grid.js";
import { setAnchorBQ } from "../hooks.js";
import { setEndBQ } from "./rollnotes.js";
import { snapBeat } from "./grid.js";
import { transposeChordLabel } from "../theory/chords.js";
import { keyNameToSf } from "../theory/key.js";
import { finalizeNotes } from "../hooks.js";
import { saveLocalNotes } from "./edits.js";
import { setInfo } from "../hooks.js";
import { trackIsDrums } from "./grid.js";
import { pushUndo } from "./edits.js";
import { saveEdits } from "./edits.js";
import { computeSongEnd } from "./song.js";
import { buildScoreModel } from "../hooks.js";
import { draw } from "../hooks.js";
import { prof } from "../state.js";
import { editableSong } from "./song.js";
import { drumStep } from "../hooks.js";
import { lassoedAnnos } from "../hooks.js";
import { annoInLasso } from "../hooks.js";
import { isCopyableAnno } from "./rollnotes.js";
import { isSongLevelAnno } from "./rollnotes.js";
import { noteToJSON } from "./rollnotes.js";
import { visibleNotes } from "./rollnotes.js";
import { ROLLNOTES_LOCK_MSG } from "./rollnotes.js";
import { jsonToRawNote } from "./rollnotes.js";
import { deriveNoteTypes } from "./rollnotes.js";
import { resolveNote } from "./rollnotes.js";
import { dropSupersededBy } from "./rollnotes.js";
import { moveSnapTicks } from "./grid.js";
import { tombstone } from "./edits.js";
import { saveDraft } from "./versions.js";
import { sfDeclaredAt } from "./song.js";
import { CHORD_QUALS } from "../theory/chords.js";
import { stampChordBand } from "./rollnotes.js";
import { chordSym } from "../theory/chords.js";
import { splitProgression } from "../theory/chords.js";
import { parseNumeral } from "../theory/chords.js";

// hearing the saved copy, or someone else's song = read-only
export function selEditItems() { // the notes an edit applies to: lasso selection, else the tapped note
  const out = [];
  if (S.multiSel.length) for (const {ti, ni} of S.multiSel) {
    const nn = S.song.tracks[ti] && S.song.tracks[ti].notes[ni];
    if (nn && !nn.gone) out.push({ti, ni, n: nn});
  }
  else if (S.selNote) {
    const nn = S.song.tracks[S.selNote.ti] && S.song.tracks[S.selNote.ti].notes[S.selNote.ni];
    if (nn && !nn.gone) out.push({ti: S.selNote.ti, ni: S.selNote.ni, n: nn});
  }
  return out;
}
// opts (Paste to…, Josh 2026-09-13): ti = every note onto this track instead
// of its source track; dP = semitone shift — the bass rhythm onto pulse2 an
// octave up, or up a third for a harmony, without the paste-move-retrack dance
export function clipboardHas() { return !!((S.noteClipboard && S.noteClipboard.length) || S.annoClipboard.length); }
export function clipSummary() { // "3 notes and 2 annotations"
  const n = S.noteClipboard ? S.noteClipboard.length : 0, a = S.annoClipboard.length;
  const parts = [];
  if (n) parts.push(n + " note" + (n === 1 ? "" : "s"));
  if (a) parts.push(a + " annotation" + (a === 1 ? "" : "s"));
  return parts.join(" and ") || "nothing";
}

export function clearMultiSel() {
  if (typeof sweepStrandedClones === "function") sweepStrandedClones();
  S.challengeSec = null;
  S.lassoAnno = null;
  if (!S.multiSel.length && !S.lassoRect) {
    document.getElementById("chordbtn").style.display = "none";
    return;
  }
  S.multiSel = []; S.multiSelKey = new Set(); S.lassoRect = null;
  document.getElementById("chordbtn").style.display = "none";
}
export function ridealongChordBands(pre, post) { // Phase 1 (open-items plan): a rigid
  // move whose selection covers ALL sounding notes in a chord band's span
  // carries the band along — position slides, label transposes. Deterministic;
  // never runs on analysis songs (their bands are Josh's findings).
  if (!isComposition() || !pre.length) return;
  const dT = post[0].n.t - pre[0].t, dP = post[0].n.p - pre[0].p;
  if (dT === 0 && dP === 0) return;
  for (let i = 0; i < pre.length; i++) // rigid translation only
    if (post[i].n.t - pre[i].t !== dT || post[i].n.p - pre[i].p !== dP || post[i].n.d !== pre[i].d) return;
  const movedKeys = new Set(post.map(({ti, ni}) => ti + ":" + ni));
  // any annotation mutation below joins the move's OWN undo entry, so one ⟲
  // brings notes AND annotations back together (Josh hit the half-undo, 2026-08-20)
  const annoBefore = annoSnapshot();
  const mergeAnnoUndo = () => {
    const last = S.editUndo[S.editUndo.length - 1];
    const a = {kind: "anno", json: annoBefore};
    if (last) S.editUndo[S.editUndo.length - 1] = {kind: "group", entries: [last, a]};
    else S.editUndo.push(a);
  };
  // FULL-SONG carry (Josh's intro-cut workflow, 2026-08-19): a rigid move
  // that takes EVERY sounding note drags the whole annotation layer along —
  // sections, chords, loop (anchor AND target), plain notes. Global facts
  // pinned at 1.1 (meter, tempo, key, track, lane) keep their anchor; chord
  // labels transpose with dP; key labels transpose too (their signature
  // re-derives from the new name).
  let total = 0;
  S.song.tracks.forEach(tr => tr.notes.forEach(n => { if (!n.gone) total++; }));
  if (total > 0 && movedKeys.size >= total) {
    const bt = barTicks(), qt = beatTicks();
    for (const n of S.rollnotes) {
      const pinned = isSongLevelAnno(n) || n.start === 0 && (n.tsdir || n.trackdir || n.audiodir || n.tempodir !== undefined ||
        n.keydir !== undefined || n.keypartial || /^lane:/.test(n.text));
      if (!pinned && dT !== 0) {
        setAnchorBQ(n, n.start + dT);
        if (n.b2) setEndBQ(n, n.end + dT);
      }
      if (n.loopTo !== undefined && dT !== 0) {
        n.loopTo = Math.max(0, n.loopTo + dT);
        const lb = Math.floor(n.loopTo / bt) + 1, lq = snapBeat((n.loopTo % bt) / qt + 1);
        n.text = "loop: " + lb + "." + lq;
      }
      if (dP !== 0 && n.chord && !n.section) n.text = transposeChordLabel(n.text, dP);
      if (dP !== 0 && (n.keydir !== undefined || n.keypartial)) {
        const km = n.text.match(/^key:\s*(.+)$/i);
        if (km) {
          const moved = transposeChordLabel(km[1].trim(), dP);
          n.text = "key: " + moved;
          if (n.keypartial) n.keypartial = moved.replace(/\?$/, "");
          else { const sf2 = keyNameToSf(moved); if (sf2 !== null) n.keydir = sf2; }
        }
      }
      n.added = true; // carried annotations must persist and sync
    }
    mergeAnnoUndo();
    finalizeNotes();
    saveLocalNotes();
    setInfo("moved the whole song — every annotation came along" +
            (dP ? " (chords and keys transposed)" : ""));
    return;
  }
  let changed = false;
  for (const band of S.rollnotes) {
    if (!band.chord || band.section) continue;
    // every sounding melodic note in the band's ORIGINAL span must be in the selection
    let covered = false, any = false;
    outer: for (let ti = 0; ti < S.song.tracks.length; ti++) {
      if (trackIsDrums(ti)) continue;
      const tr = S.song.tracks[ti];
      for (let ni = 0; ni < tr.notes.length; ni++) {
        const n = tr.notes[ni];
        if (n.gone) continue;
        const preItem = pre.find((p, k) => post[k].ti === ti && post[k].ni === ni);
        const t = preItem ? preItem.t : n.t; // selected notes compare at their PRE position
        const d = preItem ? preItem.d : n.d;
        if (t >= band.end || t + d <= band.start) continue;
        any = true;
        if (!movedKeys.has(ti + ":" + ni)) { covered = false; break outer; }
        covered = true;
      }
    }
    if (!any || !covered) continue;
    const ns = band.start + dT, ne = band.end + dT;
    if (ns < 0) continue;
    setAnchorBQ(band, ns);
    setEndBQ(band, ne); // same inclusive-beat convention as the editor — the old last-tick math grew a beat per move
    if (dP !== 0) band.text = transposeChordLabel(band.text, dP);
    band.added = true; // the change must persist and sync
    changed = true;
  }
  if (changed) { mergeAnnoUndo(); finalizeNotes(); saveLocalNotes(); }
}
export function selEditApply(items, mutate, snapshot) { // mutate + undo + persist + redraw
  if (!items.length) return false;
  const pre = items.map(({ti, ni, n}) =>
    (snapshot && snapshot.find(x => x.ti === ti && x.ni === ni)) || {ti, ni, t: n.t, d: n.d, p: n.p, v: n.v});
  pushUndo({kind: "mod", items: pre});
  for (const it of items) {
    mutate(it.n);
    const rn = S.song.rawNotes && it.n.ri !== undefined && S.song.rawNotes[it.ti][it.n.ri];
    if (rn) {
      rn.t = it.n.t + S.chopS; rn.d = it.n.d; rn.p = it.n.p; rn.v = it.n.v;
      if (it.n.env) rn.env = it.n.env; else delete rn.env; // shape edits replace the array, never mutate it
      if (it.n.ve !== undefined) rn.ve = it.n.ve; else delete rn.ve;
    }
  }
  ridealongChordBands(pre, items);
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return true;
}
selEditApply = prof("selEditApply", selEditApply); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function nudgeSelection(dTicks, dPitch) {
  if (!editableSong()) return false;
  const items = selEditItems();
  if (items.some(({ti, n}) => n.t + dTicks < 0 ||
      (!trackIsDrums(ti) && (n.p + dPitch < S.PMIN || n.p + dPitch > S.PMAX)))) return false;
  let i = 0; // selEditApply mutates in item order — kit notes step slots, not semitones
  return selEditApply(items, nn => {
    const ti = items[i++].ti;
    nn.t += dTicks;
    nn.p = trackIsDrums(ti) ? drumStep(nn.p, -dPitch) : nn.p + dPitch; // lane rows run opposite to slot order
  });
}
export function resizeSelection(dTicks) { // same delta for every note — a chord shrinks as one
  if (!editableSong()) return false;
  const minD = Math.max(24, Math.round(S.song.ppq / 8));
  const items = selEditItems();
  if (!items.length) return false;
  return selEditApply(items, nn => { nn.d = Math.max(minD, nn.d + dTicks); });
}
// annoSpan (Ask's edit_notes copy, docs/ai-parity.md §5 batch 6): {t0, t1} —
// the bars the user named ARE the ruler reach a lasso box would need, so the
// copyable annotations whose time overlaps that span ride instead of the
// lane-precise box test; omitted (every UI caller) keeps the lasso rule.
export function copySelection(annoSpan) { // returns notes + annotations copied (0 = nothing to copy)
  const items = selEditItems();
  const lassoed = lassoedAnnos(); // bands alone are a copy too (Josh, 2026-09-13: ⧉ was gray with only chords lasso'd)
  if (!items.length && !lassoed.length) return 0;
  const t0 = items.length ? Math.min(...items.map(({n}) => n.t)) : Math.min(...lassoed.map(n => n.start));
  const tEnd = items.length ? Math.max(...items.map(({n}) => n.t + n.d)) : Infinity;
  S.noteClipboard = items.map(({ti, n}) => ({dt: n.t - t0, p: n.p, d: n.d, v: n.v || S.pencilVel, ti,
    ...(n.env ? {env: n.env.map(q => ({...q}))} : {}), ...(n.ve !== undefined ? {ve: n.ve} : {})})); // a volume shape moves and copies with its note
  // Josh's rule (2026-09-13): annotations ride only when the lasso itself
  // went over them — the box reached into the ruler and spans them in time.
  // A tap-built selection, or a box that stayed among the notes, copies none.
  const L = S.lassoAnno && S.lassoAnno.t1 > t0 && S.lassoAnno.t0 < tEnd ? S.lassoAnno : null;
  const inSpan = annoSpan ? n => isCopyableAnno(n) && n.start < annoSpan.t1 && (n.b2 ? n.end : n.start + 1) > annoSpan.t0 : null;
  S.annoClipboard = !L && !inSpan ? [] : visibleNotes() // visibleNotes: a Learning-hidden ✦ AI band cannot be copied out either
    .filter(n => inSpan ? inSpan(n) : annoInLasso(n, L))
    .map(n => ({dt: n.start - t0, len: n.b2 ? n.end - n.start : null, json: noteToJSON(n), src: n})); // b2 = a real end anchor; point notes get a synthetic end elsewhere
  return S.noteClipboard.length + S.annoClipboard.length;
}
export function cutSelection() { // ✂: copy, then delete — notes and lasso'd annotations, one undo (deleteSelection does both)
  const k = copySelection();
  if (!k) return 0;
  deleteSelection();
  return k;
}
export function pasteAnnotations(t0, dP) { // re-anchored copies; chord labels transpose with a pitch shift (band-ride rule)
  if (S.rollnotesReadOnly) { setInfo(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); return; } // P4 (docs/annotations-v2.md): closes P3's gap — lasso'd annotations never land locally on a locked song
  for (const a of S.annoClipboard) {
    if (t0 + a.dt < 0) continue; // a band that began before the first copied note, pasted at the very start
    const arr = [jsonToRawNote(a.json)];
    deriveNoteTypes(arr);
    const n = arr[0];
    setAnchorBQ(n, t0 + a.dt);
    if (a.len !== null) setEndBQ(n, t0 + a.dt + a.len); else { n.b2 = null; n.q2 = null; }
    if (dP && n.chord) n.text = transposeChordLabel(n.text, dP);
    n.added = true;
    resolveNote(n);
    dropSupersededBy(n); // same span, same band: replace, never double
    S.rollnotes.push(n);
  }
}
export function pasteClipboard(atTick, opts = {}) {
  if (!editableSong() || !clipboardHas()) return 0;
  const snap = moveSnapTicks(); // same grid as moves
  const t0 = Math.max(0, Math.round(atTick / snap) * snap);
  const dP = opts.dP || 0;
  const annoBefore = annoSnapshot(); // bands come along: one undo for both
  const added = [];
  for (const c of S.noteClipboard || []) {
    const ti = opts.ti !== undefined && S.song.tracks[opts.ti] ? opts.ti : S.song.tracks[c.ti] ? c.ti : S.selTrack;
    const tr = S.song.tracks[ti];
    const p = c.p + dP;
    if (p < S.PMIN || p > S.PMAX) continue; // shifted off the roll: skip, never wrap
    const isAdd = !isComposition();
    if (tr.notes.some(n => !n.gone && n.t === t0 + c.dt && n.p === p)) continue; // never stack an identical note
    const shape = {...(c.env ? {env: c.env.map(q => ({...q}))} : {}), ...(c.ve !== undefined ? {ve: c.ve} : {})};
    tr.notes.push({t: t0 + c.dt, d: c.d, p, v: c.v, added: isAdd, ...shape});
    if (S.song.rawNotes) S.song.rawNotes[ti].push({t: t0 + c.dt + S.chopS, d: c.d, p, v: c.v, added: isAdd, ...shape});
    added.push({ti, ni: tr.notes.length - 1});
  }
  if (!added.length && !S.annoClipboard.length) return 0; // nothing landed: no undo step, selection and cursor untouched
  let annoEnd = -1;
  if (S.annoClipboard.length) {
    pasteAnnotations(t0, dP);
    finalizeNotes();
    saveLocalNotes();
    annoEnd = Math.max(...S.annoClipboard.map(a => t0 + a.dt + (a.len || 0)));
    pushUndo(added.length ? {kind: "group", entries: [{kind: "anno", json: annoBefore}, {kind: "addBatch", items: added}]}
                          : {kind: "anno", json: annoBefore});
  } else pushUndo({kind: "addBatch", items: added});
  S.multiSel = added.slice();
  S.multiSelKey = new Set(added.map(({ti, ni}) => ti + ":" + ni));
  { // cursor to the end of what landed, on the grid: ⌘V again chains (Josh, 2026-09-12)
    const end = Math.max(annoEnd, ...added.map(({ti, ni}) => { const n = S.song.tracks[ti].notes[ni]; return n.t + n.d; }));
    S.playCursor = Math.ceil(end / snap) * snap;
  }
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return added.length + S.annoClipboard.length;
}
export function duplicateSelection() { // ⌘D: a copy right after the selection, the clipboard untouched (Logic's repeat)
  const items = selEditItems();
  if (!items.length || !editableSong()) return 0;
  const t0 = Math.min(...items.map(({n}) => n.t)), end = Math.max(...items.map(({n}) => n.t + n.d));
  // the repeat period: whole bars for anything longer than a beat ("repeat
  // this bar four times" is the loop-composing move), else whole beats
  const unit = end - t0 > beatTicks() ? barTicks() : beatTicks();
  const step = Math.max(unit, Math.ceil((end - t0) / unit) * unit);
  const keep = [S.noteClipboard, S.annoClipboard];
  copySelection(); S.annoClipboard = [];
  const k = pasteClipboard(t0 + step);
  [S.noteClipboard, S.annoClipboard] = keep;
  return k;
}
export function deleteSelection() { // notes AND the lasso'd annotations (Josh, 2026-09-13) — one undo step
  if (!editableSong()) return 0;
  const items = selEditItems();
  const annos = lassoedAnnos();
  if (!items.length && !annos.length) return 0;
  const before = annos.length ? annoSnapshot() : null;
  for (const it of items) {
    it.n.gone = true;
    const rn = S.song.rawNotes && it.n.ri !== undefined && S.song.rawNotes[it.ti][it.n.ri];
    if (rn) rn.gone = true;
  }
  const erase = {kind: "eraseBatch", items: items.map(({ti, ni}) => ({ti, ni}))};
  if (annos.length) {
    for (const n of annos) tombstone(n); // synced ones must stay gone across a reload
    S.rollnotes = S.rollnotes.filter(n => !annos.includes(n));
    finalizeNotes();
    saveLocalNotes();
    pushUndo({kind: "group", entries: [{kind: "anno", json: before}, erase]});
  } else pushUndo(erase);
  S.multiSel = []; S.multiSelKey = new Set(); S.selNote = null; S.lassoAnno = null;
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return items.length + annos.length;
}
// ⧉ clones awaiting a move — {clones, origs, entry}
export function sweepStrandedClones() { // a ⧉ that never got dragged left an invisible stack; it evaporates
  if (!S.dupPending) return;
  const {clones, origs, entry} = S.dupPending;
  S.dupPending = null;
  const stranded = clones.every(({ti, ni}, i) => {
    const n = S.song.tracks[ti] && S.song.tracks[ti].notes[ni];
    const o = origs[i];
    return n && !n.gone && n.t === o.t && n.d === o.d && n.p === o.p;
  });
  if (!stranded) return; // they moved (or died) — real notes now, leave them be
  for (const {ti, ni} of clones) {
    const n = S.song.tracks[ti].notes[ni];
    n.gone = true;
    const rn = S.song.rawNotes && n.ri !== undefined && S.song.rawNotes[ti][n.ri];
    if (rn) rn.gone = true;
  }
  const at = S.editUndo.indexOf(entry);
  if (at >= 0) S.editUndo.splice(at, 1); // their undo entry goes with them
  saveEdits();
  draw();
}
export function duplicateSelectionInPlace() { // option-drag: clones become the dragged selection
  sweepStrandedClones(); // a second ⧉ first clears the last one's stranded clones
  const items = selEditItems();
  if (!items.length) return false;
  const added = [];
  for (const {ti, n: nn} of items) {
    const tr = S.song.tracks[ti];
    const isAdd = !isComposition();
    tr.notes.push({t: nn.t, d: nn.d, p: nn.p, v: nn.v, added: isAdd});
    if (S.song.rawNotes) S.song.rawNotes[ti].push({t: nn.t + S.chopS, d: nn.d, p: nn.p, v: nn.v, added: isAdd});
    added.push({ti, ni: tr.notes.length - 1});
  }
  const entry = {kind: "addBatch", items: added};
  pushUndo(entry);
  S.dupPending = {clones: added.slice(),
                origs: added.map(({ti, ni}) => { const n = S.song.tracks[ti].notes[ni]; return {t: n.t, d: n.d, p: n.p}; }),
                entry};
  S.multiSel = added.slice();
  S.multiSelKey = new Set(added.map(({ti, ni}) => ti + ":" + ni));
  return true;
}
export function splitApply(items, cutFor) { // shared: cut each note at cutFor(note)
  if (!items.length) return 0;
  const mod = {kind: "mod", items: items.map(({ti, ni, n}) => ({ti, ni, t: n.t, d: n.d, p: n.p}))};
  const added = [];
  for (const {ti, n} of items) {
    const cut = cutFor(n);
    const tr = S.song.tracks[ti], isAdd = !isComposition();
    tr.notes.push({t: cut, d: n.t + n.d - cut, p: n.p, v: n.v, added: isAdd});
    if (S.song.rawNotes) S.song.rawNotes[ti].push({t: cut + S.chopS, d: n.t + n.d - cut, p: n.p, v: n.v, added: isAdd});
    added.push({ti, ni: tr.notes.length - 1});
    n.d = cut - n.t;
    const rn = S.song.rawNotes && n.ri !== undefined && S.song.rawNotes[ti][n.ri];
    if (rn) rn.d = n.d;
  }
  pushUndo({kind: "group", entries: [mod, {kind: "addBatch", items: added}]});
  if (S.multiSel.length) { // the new halves join the selection
    S.multiSel.push(...added);
    for (const {ti, ni} of added) S.multiSelKey.add(ti + ":" + ni);
  }
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return items.length;
}
// openGapShift: the CORE of Insert bars — every note and annotation at/after
// tick T slides later by delta ticks. Extracted out of insertTime (2026-10-02,
// open-items "repeat bars") so the copy_bars/insert_bars Ask tools can fold
// this same shift into a BIGGER undo group (their own addBatch of copied
// notes) instead of duplicating the shift logic beside it. Returns the raw
// pieces; callers push their own undo entry and run their own save/draw.
export function openGapShift(T, delta) {
  const annoBefore = annoSnapshot();
  const modItems = [];
  S.song.tracks.forEach((tr, ti) => tr.notes.forEach((n, ni) => {
    if (!n.gone && n.t >= T) {
      modItems.push({ti, ni, t: n.t, d: n.d, p: n.p, v: n.v});
      n.t += delta;
      const rn = S.song.rawNotes && n.ri !== undefined && S.song.rawNotes[ti][n.ri];
      if (rn) rn.t = n.t + S.chopS;
    }
  }));
  let touched = 0;
  for (const n of S.rollnotes) {
    if (isSongLevelAnno(n)) continue; // sheet answers and song notes sit at 1.1 by convention, not by music — bar edits leave them
    if (n.start >= T) { // at/after the point: the whole annotation slides
      setAnchorBQ(n, n.start + delta);
      if (n.end !== null && n.end !== undefined) setEndBQ(n, n.end + delta);
      resolveNote(n); touched++;
    } else if (n.end !== null && n.end !== undefined && n.end > T) {
      // straddler: started before, still open PAST the point — stretch; an
      // annotation ending exactly AT the point stays put (Josh's spec)
      setEndBQ(n, n.end + delta);
      resolveNote(n); touched++;
    }
  }
  return {modItems, annoBefore, touched};
}
// closeGap: the CORE of Delete bars — the inverse of openGapShift. Removes
// the time span [T, T+len) on every track: a note starting inside is
// deleted outright; one that sustains across T is clipped to stop there;
// everything at/after T+len shifts earlier by len. Annotations never die
// (Learning mode — they're Josh's own analysis): the tick mapper below
// leaves anything before T alone, collapses anything inside the span to T
// (so an anchor in the deleted range moves to the cut point instead of
// being destroyed), and shifts anything at/after T+len earlier by len — the
// SAME mapper applied to both start and end means a range straddling the
// cut (start < T, end inside or past the span) shrinks by exactly the
// overlap, mirroring openGapShift's straddle-stretch rule in reverse; one
// ending exactly at T (so unaffected either way) needs no special case, same
// as openGapShift's "ends exactly at the point stays put". Returns the raw
// pieces for ONE undo group; caller pushes undo and runs its own save/draw
// (same contract as openGapShift).
export function closeGap(T, len) {
  const clamp = x => x < T ? x : Math.max(T, x - len);
  const annoBefore = annoSnapshot();
  const modItems = [], erasedItems = [];
  S.song.tracks.forEach((tr, ti) => tr.notes.forEach((n, ni) => {
    if (n.gone) return;
    if (n.t >= T && n.t < T + len) { // starts inside the deleted span: gone
      n.gone = true;
      const rn = S.song.rawNotes && n.ri !== undefined && S.song.rawNotes[ti][n.ri];
      if (rn) rn.gone = true;
      erasedItems.push({ti, ni});
    } else if (n.t < T && n.t + n.d > T) { // sustains across T: clip, stop at T
      modItems.push({ti, ni, t: n.t, d: n.d, p: n.p, v: n.v});
      n.d = T - n.t;
      const rn = S.song.rawNotes && n.ri !== undefined && S.song.rawNotes[ti][n.ri];
      if (rn) rn.d = n.d;
    } else if (n.t >= T + len) { // after the span: shift earlier
      modItems.push({ti, ni, t: n.t, d: n.d, p: n.p, v: n.v});
      n.t -= len;
      const rn = S.song.rawNotes && n.ri !== undefined && S.song.rawNotes[ti][n.ri];
      if (rn) rn.t = n.t + S.chopS;
    }
  }));
  let touched = 0, movedToT = 0;
  for (const n of S.rollnotes) {
    if (isSongLevelAnno(n)) continue; // as in openGapShift: song-level entries are not in the music
    const wasInSpan = n.start >= T && n.start < T + len;
    const newStart = clamp(n.start);
    // a REAL declared range has n.b2 (resolveNote's own test); n.end alone
    // isn't safe here — chords/sections with no b2 still get a synthetic
    // one-bar n.end for the editor's depth-stacking (finalizeNotes, "secs"
    // below), and clamping THAT independently of the anchor would carve a
    // fake partial-bar range out of a plain point annotation that merely
    // got moved by the cut.
    const hasEnd = n.b2 !== undefined && n.b2 !== null;
    const newEnd = hasEnd ? clamp(n.end) : n.end;
    if (newStart !== n.start || newEnd !== n.end) {
      setAnchorBQ(n, newStart);
      if (hasEnd) setEndBQ(n, newEnd);
      resolveNote(n);
      touched++;
      if (wasInSpan) movedToT++; // anchored inside the deleted span — moved to T, not shifted
    }
  }
  return {modItems, erasedItems, annoBefore, touched, movedToT};
}
export function insertTime(T, delta) { // open a gap at tick T of delta ticks; ONE undo
  if (!editableSong() || delta <= 0) return 0;
  const {modItems, annoBefore, touched} = openGapShift(T, delta);
  pushUndo({kind: "group", entries: [{kind: "mod", items: modItems}, {kind: "anno", json: annoBefore}]});
  finalizeNotes();
  computeSongEnd();
  saveLocalNotes();
  saveDraft();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return modItems.length + touched;
}
insertTime = prof("insertTime", insertTime); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function deleteTime(T, len) { // close a gap at tick T of len ticks; ONE undo — closeGap's wrapper, mirrors insertTime
  if (!editableSong() || len <= 0) return null;
  const {modItems, erasedItems, annoBefore, touched, movedToT} = closeGap(T, len);
  pushUndo({kind: "group", entries: [{kind: "mod", items: modItems}, {kind: "eraseBatch", items: erasedItems}, {kind: "anno", json: annoBefore}]});
  finalizeNotes();
  saveEdits(); // persists the erased (gone) notes for an edited-capture song; drafts whole for a composition
  computeSongEnd();
  saveLocalNotes(); // the shifted annotation layer
  saveDraft();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return {erased: erasedItems.length, moved: modItems.length + touched, movedToT};
}
export function divideSelection(nParts) { // ➗: each selected note becomes N equal notes
  if (!editableSong()) return 0;
  const items = selEditItems().filter(({n}) => n.d >= nParts);
  if (!items.length) return 0;
  const mod = {kind: "mod", items: items.map(({ti, ni, n}) => ({ti, ni, t: n.t, d: n.d, p: n.p}))};
  const added = [];
  for (const {ti, n} of items) {
    const tr = S.song.tracks[ti], isAdd = !isComposition();
    // exact boundaries by rounding the ideal positions — a 480-tick quarter
    // divided by 3 gives 160/160/160; oddballs distribute the remainder
    const bounds = [];
    for (let i = 0; i <= nParts; i++) bounds.push(n.t + Math.round(n.d * i / nParts));
    for (let i = 1; i < nParts; i++) {
      tr.notes.push({t: bounds[i], d: bounds[i + 1] - bounds[i], p: n.p, v: n.v, added: isAdd});
      if (S.song.rawNotes) S.song.rawNotes[ti].push({t: bounds[i] + S.chopS, d: bounds[i + 1] - bounds[i], p: n.p, v: n.v, added: isAdd});
      added.push({ti, ni: tr.notes.length - 1});
    }
    n.d = bounds[1] - n.t;
    const rn = S.song.rawNotes && n.ri !== undefined && S.song.rawNotes[ti][n.ri];
    if (rn) rn.d = n.d;
  }
  pushUndo({kind: "group", entries: [mod, {kind: "addBatch", items: added}]});
  if (S.multiSel.length) {
    S.multiSel.push(...added);
    for (const {ti, ni} of added) S.multiSelKey.add(ti + ":" + ni);
  }
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return items.length;
}
// Q Quantize: a command on the SELECTION, separate from recording (DAW
// convention — Logic's Q). Snaps each note's start toward the current grid
// (the same grid Move/Pencil use); strength 1 = exactly on the line, 0.75/0.5
// = partway there (a soft nudge for a take that's close but not glued down).
// alsoEnds additionally quantizes each note's END the same way and resizes
// to match — off by default, since most raw takes want their durations kept
// and only the onsets straightened. One selEditApply call = one undo step for
// the whole selection, same mod/batch undo pattern as nudge/divide/transpose.
export function quantizeSelection(strength, alsoEnds) {
  if (!editableSong()) return 0;
  const items = selEditItems();
  if (!items.length) return 0;
  const g = moveSnapTicks();
  const snap = t => Math.max(0, Math.round(t / g) * g);
  const blend = (raw, target) => Math.round(raw + (target - raw) * strength);
  const ok = selEditApply(items, n => {
    const t0 = n.t, end0 = n.t + n.d;
    const newT = Math.max(0, blend(t0, snap(t0)));
    if (alsoEnds) n.d = Math.max(1, blend(end0, snap(end0)) - newT);
    n.t = newT;
  });
  return ok ? items.length : 0;
}
export function splitSelectionAt(tick) { // ✂ with the cursor inside: cut there
  if (!editableSong()) return 0;
  return splitApply(selEditItems().filter(({n}) => n.t < tick && tick < n.t + n.d), () => tick);
}
export function splitSelectionHalves() { // ✂ with the cursor elsewhere: cut each note in half
  if (!editableSong()) return 0;
  return splitApply(selEditItems().filter(({n}) => n.d >= 2), n => n.t + Math.round(n.d / 2));
}
export function joinSelection() { // ⁀: merge selected notes of the same track+pitch into one span
  if (!editableSong()) return 0;
  const groups = new Map();
  for (const it of selEditItems()) {
    const k = it.ti + ":" + it.n.p;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const mods = [], erased = [];
  let joined = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.n.t - b.n.t);
    const first = g[0], end = Math.max(...g.map(({n}) => n.t + n.d));
    mods.push({ti: first.ti, ni: first.ni, t: first.n.t, d: first.n.d, p: first.n.p});
    first.n.d = end - first.n.t;
    const rn = S.song.rawNotes && first.n.ri !== undefined && S.song.rawNotes[first.ti][first.n.ri];
    if (rn) rn.d = first.n.d;
    for (const it of g.slice(1)) {
      it.n.gone = true;
      const r2 = S.song.rawNotes && it.n.ri !== undefined && S.song.rawNotes[it.ti][it.n.ri];
      if (r2) r2.gone = true;
      erased.push({ti: it.ti, ni: it.ni});
    }
    joined += g.length;
  }
  if (!joined) return 0;
  pushUndo({kind: "group", entries: [{kind: "mod", items: mods}, {kind: "eraseBatch", items: erased}]});
  S.multiSel = S.multiSel.filter(({ti, ni}) => !S.song.tracks[ti].notes[ni].gone);
  S.multiSelKey = new Set(S.multiSel.map(({ti, ni}) => ti + ":" + ni));
  if (S.selNote && S.song.tracks[S.selNote.ti].notes[S.selNote.ni].gone) S.selNote = null;
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return joined;
}
export function transposeTrack(ti, dP) { // ±12 per tap from the voice menu
  if (!editableSong()) { setInfo("transposing works on your own songs — captures are locked"); return 0; }
  if (trackIsDrums(ti)) { setInfo("kit pitches are instruments, not notes — the drum track doesn't transpose"); return 0; }
  const items = S.song.tracks[ti].notes
    .map((n, ni) => ({ti, ni, n}))
    .filter(({n}) => !n.gone && n.p + dP >= S.PMIN && n.p + dP <= S.PMAX);
  if (!items.length) { setInfo("no notes can move that far — already at the range edge"); return 0; }
  selEditApply(items, n => { n.p += dP; }); // one undo step, chord-ride aware
  return items.length;
}
export function diatonicShift(dir) { // move each note dir scale degrees (±1 from the ⇅ sheet; any integer from Ask's edit_notes transpose) in the declared key
  const items = selEditItems();
  if (!items.length) { setInfo("select notes first"); return 0; }
  const MAJ = [0, 2, 4, 5, 7, 9, 11];
  let noKey = false;
  const shifted = selEditApply(items, n => {
    const sf = sfDeclaredAt(n.t); // DECLARED key only — the C default is not a ruling
    if (sf === null || sf === undefined) { noKey = true; n.p = Math.max(S.PMIN, Math.min(S.PMAX, n.p + dir)); return; }
    const tonic = ((sf * 7) % 12 + 12) % 12;
    const scale = MAJ.map(x => (x + tonic) % 12);
    const sgn = dir > 0 ? 1 : -1;
    let p = n.p, steps = dir, i = scale.indexOf(((p % 12) + 12) % 12);
    if (i < 0) { p += sgn; steps -= sgn; i = scale.indexOf(((p % 12) + 12) % 12); } // chromatic slide back toward the scale (a major scale's gaps are one semitone wide — this lands on it), then the rest in degrees
    const k = i + steps, j = ((k % 7) + 7) % 7; // degree arithmetic with octave carry: the old ±1 "if d <= 0 then +12" branches, for any count
    p += scale[j] - scale[i] + 12 * Math.floor(k / 7);
    n.p = Math.max(S.PMIN, Math.min(S.PMAX, p));
  });
  if (noKey) setInfo("no key declared at some notes — those moved chromatically");
  return shifted;
}
// notes stacked exactly on top of each other — same track, same start, same
// pitch — can only be heard once; the copy is a leftover (2026-10-02: the
// reload bug doubled untitled-1's triangle). The longer one stays. Goes
// through deleteSelection, so it is one ⟲ step like any delete.
// scope (Ask's edit_notes dedupe, docs/ai-parity.md §5 batch 5): {t0, t1,
// tis} restricts both which notes count as candidates AND which duplicates
// get removed to a bar range + named tracks, instead of the whole song —
// omitted (every existing caller) is the original whole-song sweep.
export function removeDuplicateNotes(scope) {
  const inScope = (ti, n) => !scope || ((!scope.tis || scope.tis.includes(ti)) && (scope.t0 === undefined || (n.t >= scope.t0 && n.t < scope.t1)));
  const seen = new Map(), dups = [];
  S.song.tracks.forEach((tr, ti) => tr.notes.forEach((n, ni) => {
    if (n.gone || !inScope(ti, n)) return;
    const k = ti + ":" + n.t + ":" + n.p, prev = seen.get(k);
    if (!prev) { seen.set(k, {ti, ni, d: n.d}); return; }
    if (n.d > prev.d) { dups.push({ti: prev.ti, ni: prev.ni}); seen.set(k, {ti, ni, d: n.d}); }
    else dups.push({ti, ni});
  }));
  if (!dups.length) return 0;
  S.multiSel = dups; S.multiSelKey = new Set(dups.map(x => x.ti + ":" + x.ni));
  return deleteSelection();
}
// setSelectionVelocity (Ask's edit_notes velocity, docs/ai-parity.md §5
// batch 5): the same selEditApply the velocity slider's "change" handler
// commits (src/ui/note-editor.js initNoteEditor5) — one mod undo entry for
// the whole selection. toVel is a value (every note set to it) or a
// function old -> new (relative deltas); clamped to the MIDI range.
export function setSelectionVelocity(toVel) {
  if (!editableSong()) return 0;
  const items = selEditItems();
  if (!items.length) return 0;
  const f = typeof toVel === "function" ? toVel : () => toVel;
  selEditApply(items, n => { n.v = Math.max(1, Math.min(127, Math.round(f(n.v)))); });
  return items.length;
}

export function moveSelectionToTrack(target, dT = 0) { // ⇄ / tracks-view retrack: keeps pitch; dT slides time
  if (!editableSong() || !S.song.tracks[target] || S.song.tracks[target].kind === "audio") return 0;
  const items = selEditItems().filter(({ti}) => ti !== target &&
    (S.mvFromFilter === null || ti === S.mvFromFilter));
  if (!items.length) return 0;
  const tr = S.song.tracks[target], isAdd = !isComposition();
  const added = [], erased = [];
  for (const it of items) {
    const n = it.n;
    const nt = Math.max(0, n.t + dT);
    const shape = {...(n.env ? {env: n.env} : {}), ...(n.ve !== undefined ? {ve: n.ve} : {})}; // the volume shape rides along
    tr.notes.push({t: nt, d: n.d, p: n.p, v: n.v, duty: n.duty, added: isAdd, ...shape});
    if (S.song.rawNotes) S.song.rawNotes[target].push({t: nt + S.chopS, d: n.d, p: n.p, v: n.v, added: isAdd, ...shape});
    added.push({ti: target, ni: tr.notes.length - 1});
    n.gone = true;
    const rn = S.song.rawNotes && n.ri !== undefined && S.song.rawNotes[it.ti][n.ri];
    if (rn) rn.gone = true;
    erased.push({ti: it.ti, ni: it.ni});
  }
  pushUndo({kind: "group", entries: [{kind: "eraseBatch", items: erased}, {kind: "addBatch", items: added}]});
  S.multiSel = added.slice();
  S.multiSelKey = new Set(added.map(({ti, ni}) => ti + ":" + ni));
  S.selNote = null;
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return items.length;
}

export function dedupeSong() { // 🧹 back by demand (Josh 2026-08-18: old drafts keep
  // re-saving pre-guard stacks over the cleaned repo file — HE runs it, HE
  // saves). Whole song, every track; exact same start+pitch WITHIN one track
  // collapses to the longest; cross-track unisons untouched by construction.
  if (!editableSong()) return 0;
  const erased = [];
  S.song.tracks.forEach((tr, ti) => {
    const best = new Map();
    tr.notes.forEach((n, ni) => {
      if (n.gone) return;
      const k = n.t + ":" + n.p;
      const prev = best.get(k);
      if (!prev) { best.set(k, {ni, d: n.d}); return; }
      const loser = n.d > prev.d ? prev.ni : ni;
      if (n.d > prev.d) best.set(k, {ni, d: n.d});
      const ln = tr.notes[loser];
      ln.gone = true;
      const rn = S.song.rawNotes && ln.ri !== undefined && S.song.rawNotes[ti][ln.ri];
      if (rn) rn.gone = true;
      erased.push({ti, ni: loser});
    });
  });
  if (!erased.length) return 0;
  pushUndo({kind: "eraseBatch", items: erased});
  S.multiSel = []; S.multiSelKey = new Set(); S.selNote = null;
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return erased.length;
}
export function insertChordAt(tick, rootPc, qual, oct, durQ) {
  if (!editableSong()) return 0;
  // P4 (docs/annotations-v2.md): closes P3's gap — this tool writes a chord
  // BAND (an annotation, stampChordBand below) along with the notes; a
  // locked song refuses the whole gesture rather than leave the band out
  if (S.rollnotesReadOnly) { setInfo(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); return 0; }
  const annoBefore = annoSnapshot(); // the ruler band undoes with the notes (Josh, 2026-09-12)
  const ivs = (CHORD_QUALS.find(([q]) => q === qual) || CHORD_QUALS[0])[1];
  const snap = Math.max(1, Math.round(S.song.ppq * (durQ || S.pencilDur)));
  const t0 = Math.max(0, Math.round(tick / snap) * snap);
  const base = (oct + 1) * 12 + rootPc;
  const tr = S.song.tracks[S.selTrack], isAdd = !isComposition();
  const added = [];
  for (const iv of ivs) {
    const p = base + iv;
    if (p < S.PMIN || p > S.PMAX) continue;
    if (tr.notes.some(n => !n.gone && n.t === t0 && n.p === p)) continue; // never stack
    tr.notes.push({t: t0, d: snap, p, v: S.pencilVel, added: isAdd});
    if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: t0 + S.chopS, d: snap, p, v: S.pencilVel, added: isAdd});
    added.push({ti: S.selTrack, ni: tr.notes.length - 1});
  }
  if (!added.length) return 0;
  pushUndo({kind: "group", entries: [{kind: "anno", json: annoBefore}, {kind: "addBatch", items: added}]});
  S.multiSel = added.slice();
  S.multiSelKey = new Set(added.map(({ti, ni}) => ti + ":" + ni));
  S.selNote = null;
  stampChordBand(t0, snap, chordSym(rootPc, qual));
  finalizeNotes();
  saveLocalNotes();
  S.playCursor = t0 + snap; // walk forward: the next insert lands right after
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return added.length;
}
export function insertProgressionAt(tick, progStr, tonicPc, oct, durQ, minorScale) {
  if (!editableSong()) return 0;
  const chords = splitProgression(progStr).map(t => parseNumeral(t, minorScale));
  if (!chords.length || chords.some(c => !c)) return 0;
  const annoBefore = annoSnapshot(); // the bands undo with the notes (Josh, 2026-09-12: undo left them behind)
  const snap = Math.max(1, Math.round(S.song.ppq * (durQ || S.pencilDur)));
  let t0 = Math.max(0, Math.round(tick / snap) * snap);
  const tr = S.song.tracks[S.selTrack], isAdd = !isComposition();
  const added = [];
  for (const c of chords) {
    const ivs = CHORD_QUALS.find(([q]) => q === c.qual)[1];
    const base = (oct + 1) * 12 + ((tonicPc + c.pcOff) % 12);
    for (const iv of ivs) {
      const p = base + iv;
      if (p < S.PMIN || p > S.PMAX) continue;
      if (tr.notes.some(n => !n.gone && n.t === t0 && n.p === p)) continue; // never stack
      tr.notes.push({t: t0, d: snap, p, v: S.pencilVel, added: isAdd});
      if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: t0 + S.chopS, d: snap, p, v: S.pencilVel, added: isAdd});
      added.push({ti: S.selTrack, ni: tr.notes.length - 1});
    }
    stampChordBand(t0, snap, chordSym((tonicPc + c.pcOff) % 12, c.qual));
    t0 += snap;
  }
  if (!added.length) return 0;
  pushUndo({kind: "group", entries: [{kind: "anno", json: annoBefore}, {kind: "addBatch", items: added}]}); // notes + bands = one undo
  finalizeNotes();
  saveLocalNotes();
  S.multiSel = added.slice();
  S.multiSelKey = new Set(added.map(({ti, ni}) => ti + ":" + ni));
  S.selNote = null;
  S.playCursor = t0;
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return added.length;
}
