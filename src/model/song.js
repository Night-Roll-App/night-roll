import { S } from "../state.js";
import { LINK_SONGS } from "../platform/base.js";
import { canEditMusic } from "./provenance.js";
import { trackIsDrums } from "./grid.js";
import { beatTicks } from "./grid.js";
import { pearsonCorr } from "../theory/key.js";
import { keyNameFor } from "../theory/key.js";
import { SF_MAJOR } from "../theory/chords.js";
import { TONIC_SPELL } from "../theory/key.js";
import { fileKeyAt } from "../theory/key.js";
import { barTicks } from "./rollnotes.js";
import { appMode } from "../platform/mode.js";
import { secToTick } from "../midi/parse.js";
import { tickToSec } from "../midi/parse.js";
import { prof } from "../state.js";

// ------------------------------------------------ selection editing (Josh's
// requests, 2026-08-17: move lasso'd notes in pitch/time, resize many at
// once, copy chords). Works on editable songs; drag on the roll or arrow
// keys — keyboard covers everything, easier on the hands than dragging.
export function editableSong() { return !!S.song && !LINK_SONGS && canEditMusic(S.songKey) && !(S.cmp && S.cmp.showing === "repo"); }
// docs/theory-toolkit.md §3.0: the ONE adapter every in-app caller of the
// theory FACTS toolkit shares — live state, unsaved edits included (the same
// reason read_bars reads S.song rather than the repo file). Audio tracks
// have no notes and are left out; the drum flag is read BEFORE the filter so
// trackIsDrums sees the real track index.
export function factsDocFromState() {
  return {ppq: S.song.ppq, barTicks: barTicks(), beatTicks: beatTicks(),
    tracks: S.song.tracks.map((t, ti) => ({name: t.name, kind: t.kind, drums: trackIsDrums(ti), notes: t.notes.filter(n => !n.gone)})).filter(t => t.kind !== "audio"),
    rollnotes: S.rollnotes};
}

// ---- estimateKey (P3): Krumhansl-Schmuckler, Normal mode only ----
// Duration-weighted pitch-class census of non-drum, non-gone notes,
// correlated against the 24 major/minor key profiles; the best match wins.
// Normal-only by construction (every call site guards with appMode() ===
// "normal" — see sfShownAt/keyNameShownAt) so Learning never runs this at
// all (see the "estimateKey never called in Learning" spy test).
// Cached per song, invalidated whenever the note census changes (cheap
// signature recheck — no need to hook every edit site individually).
export const KS_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const KS_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export function keyEstimateSig() { // cheap census fingerprint — any note add/move/resize/delete changes it
  let n = 0, sum = 0;
  S.song.tracks.forEach((tr, ti) => {
    if (trackIsDrums(ti) || tr.kind === "audio") return; // audio tracks hold .clips, not .notes
    for (const note of tr.notes) { if (note.gone) continue; n++; sum += note.t * 131 + note.p * 7 + note.d; }
  });
  return n + ":" + sum;
}
// {songKey, sig, result}
export function estimateKey() {
  if (!S.song) return null;
  const sig = keyEstimateSig();
  if (S._keyEstCache && S._keyEstCache.songKey === S.songKey && S._keyEstCache.sig === sig) return S._keyEstCache.result;
  const dur = new Array(12).fill(0);
  S.song.tracks.forEach((tr, ti) => {
    if (trackIsDrums(ti) || tr.kind === "audio") return; // audio tracks hold .clips, not .notes
    for (const note of tr.notes) { if (note.gone) continue; dur[((note.p % 12) + 12) % 12] += note.d; }
  });
  let result = null;
  if (dur.some(x => x > 0)) {
    let best = null;
    for (let pc = 0; pc < 12; pc++) {
      for (const [mode, profile] of [["major", KS_MAJOR_PROFILE], ["minor", KS_MINOR_PROFILE]]) {
        const rot = profile.map((_, i) => profile[(i - pc + 12) % 12]); // profile rotated so index pc = tonic
        const corr = pearsonCorr(dur, rot);
        if (!best || corr > best.corr) best = {pc, mode, corr};
      }
    }
    const full = keyNameFor(best.pc, best.mode);
    result = {sf: full ? full.sf : 0, name: full ? full.name : SF_MAJOR[0], conf: best.corr};
  }
  S._keyEstCache = {songKey: S.songKey, sig, result};
  return result;
}
export function tonicPcFromName(name) { // reverses tonicLabel()/partialNameOf()'s stored string back to a pitch class
  for (let pc = 0; pc < 12; pc++) if (TONIC_SPELL[pc].join("/") === name || TONIC_SPELL[pc].includes(name)) return pc;
  return null;
}
export function checkKeyVsFile() {
  if (!S.song || !S.song.source || !S.song.source.keysigs || !S.song.source.keysigs.length) return {state: "nofile"};
  const partial = S.rollnotes.find(n => n.keypartial);
  if (!S.keyRegions.length) {
    if (!partial) return {state: "noanswer", file: fileKeyAt(0)}; // Normal still states the file's value here — see runKeyCheck
    const fk = fileKeyAt(partial.start);
    const pc = tonicPcFromName(partial.keypartial);
    const match = fk && pc !== null && fk.pc === pc;
    return {state: match ? "match" : "differs", tonicOnly: true, file: fk};
  }
  const bt = barTicks(), end = Math.max(bt, S.songEndTick);
  const sorted = [...S.keyRegions].sort((a, b) => a.start - b.start);
  let matched = 0;
  for (const r of sorted) { const fk = fileKeyAt(r.start); if (fk && fk.name === r.name) matched++; }
  // coverage: does a declared key actually govern the WHOLE song, with no
  // gap? An open region (no end) governs until the next one starts (or the
  // song's end, if it's the last); a ranged one must reach that same point.
  const coversAll = sorted[0].start <= 0 && sorted.every((r, i) => {
    const nextStart = i + 1 < sorted.length ? sorted[i + 1].start : end;
    return r.end === null || r.end >= nextStart;
  });
  const file = fileKeyAt(sorted[0].start);
  if (matched === sorted.length && coversAll) return {state: "match", file};
  if (matched === 0) return {state: "differs", file};
  return {state: "partial-match", file};
}

// ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
 
 // sfShownAt / sfAt (P3): what the roll SPELLS with, as opposed to sfDeclaredAt
// (what Josh actually declared — "the AI context spells by these", chord
// evidence, etc.). Learning never estimates: undeclared stays neutral (sf 0,
// the old default). Normal falls back to the Krumhansl-Schmuckler estimate
// so an unlabelled song still spells sensibly for someone not doing ear work.
export function sfShownAt(tick) { // declared (or key-dial preview), else the Normal estimate, else null
  const d = sfDeclaredAt(tick);
  if (d !== null) return d;
  if (appMode() === "normal") { const est = estimateKey(); if (est) return est.sf; }
  return null;
}
export function sfAt(tick) { const s = sfShownAt(tick); return s === null ? 0 : s; }
export function sfDeclaredAt(tick) { // sf if the user has declared a key governing this tick, else null
  if (S.previewSf !== null) return S.previewSf;
  return sfDeclaredAtRaw(tick);
}
export function sfDeclaredAtRaw(tick) { // committed declarations only — no key-dial preview (the AI context spells by these)
  let ranged = null, open = null;
  for (const r of S.keyRegions) {
    if (r.start > tick) continue;
    if (r.end !== null) {
      if (tick < r.end && (!ranged || r.start > ranged.start)) ranged = r;
    } else if (!open || r.start > open.start) open = r;
  }
  return ranged ? ranged.sf : open ? open.sf : null;
}
export function keyNameAt(tick) { // recorded key name governing this tick, or null
  let ranged = null, open = null;
  for (const r of S.keyRegions) {
    if (r.start > tick) continue;
    if (r.end !== null) { if (tick < r.end && (!ranged || r.start > ranged.start)) ranged = r; }
    else if (!open || r.start > open.start) open = r;
  }
  return ranged ? ranged.name : open ? open.name : null;
}

// pointerId → {p, tick}
// While ● is armed the transport must not wrap at the song's end: a new song is
// two bars, and Josh's son's arpeggiator take looped onto bars 1–2 instead of
// growing the song (2026-09-26). An open-ended segment keeps playSec() linear,
// the scheduler never re-arms a pass, and recFinish's computeSongEnd lets the
// song end where the take ended.
export function recOpenEnded(seg) { return {start: seg ? seg.start : 0, end: Infinity}; }

export function songHasAudio() { return !!S.song && S.song.tracks.some(tr => tr.kind === "audio" && tr.clips.length); }
export function clipLen(c) { return c.len || Math.max(0, c.dur - c.offset); }
// buffer seconds this piece plays
export function clipEndTick(c) { // rate-independent: both conversions carry playRate
  return secToTick(S.song, tickToSec(S.song, c.at) + clipLen(c) / S.playRate);
}

export function computeSongEnd() { // re-run whenever the effective meter changes
  let lastTick = 0;
  S.song.tracks.forEach(tr => tr.notes.forEach(n => { lastTick = Math.max(lastTick, n.t + n.d); }));
  S.song.tracks.forEach(tr => { // an audio piece can outlast every note (an audio-only song must not loop one bar)
    if (tr.kind === "audio") for (const c of tr.clips) if (c.dur) lastTick = Math.max(lastTick, clipEndTick(c));
  });
  const bt = barTicks();
  S.songEndTick = Math.max(bt, Math.ceil(lastTick / bt - 0.05) * bt);
  // extend (never shrink) the default C1..C7 pitch range to whatever this
  // song actually uses — see PMIN/PMAX's own comment
  let lo = 24, hi = 96;
  S.song.tracks.forEach(tr => tr.notes.forEach(n => {
    if (n.gone) return;
    if (n.p < lo) lo = n.p; if (n.p > hi) hi = n.p;
  }));
  S.PMIN = Math.max(0, lo); S.PMAX = Math.min(127, hi);
}
computeSongEnd = prof("computeSongEnd", computeSongEnd); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
