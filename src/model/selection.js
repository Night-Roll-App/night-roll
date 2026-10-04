import { S } from "../state.js";

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
