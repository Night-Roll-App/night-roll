import { S } from "../state.js";
import { renderTrackbar } from "../hooks.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { updateTrackGains } from "../audio/engine.js";
import { clampViewImpl as clampView } from "./chrome.js";
import { drawImpl as draw } from "./chrome.js";
import { pushUndo } from "../model/edits.js";
import { annoSnapshot } from "../model/edits.js";
import { tombstone } from "../model/edits.js";
import { trackDirText } from "../model/rollnotes.js";
import { resolveNote } from "../model/rollnotes.js";
import { finalizeNotesImpl as finalizeNotes } from "../session/song.js";
import { saveLocalNotes } from "../model/edits.js";
import { updateSyncBtnImpl as updateSyncBtn } from "./chrome.js";
import { isComposition } from "../model/provenance.js";
import { isLocalDraft } from "../model/edits.js";
import { audioDirText } from "../model/rollnotes.js";
import { saveDraft } from "../model/versions.js";

export function updateTrackMore() {
  const bar = document.getElementById("trackbar");
  const more = document.getElementById("trackmore");
  const slide = document.getElementById("trackslide");
  bar.classList.toggle("collapsed", !S.trackExpand);
  // never measure while the cluster is hidden or mid-slide — a squeezed
  // width wraps every chip and poisons the disclosure state
  if (slide && (slide.classList.contains("off") || slide.clientWidth < 60)) return;
  // reading scrollHeight forces a fresh layout — measure synchronously
  const overflowing = bar.scrollHeight > bar.clientHeight + 2;
  more.style.display = overflowing || S.trackExpand ? "" : "none";
  more.textContent = S.trackExpand ? "▴" : "▾";
}
// chips too wide to sit beside the transport (the AI window docked wide cut
// them to "pu…" — Josh, 2026-10-02) move to their own full-width row. The
// decision reads ONLY the row's width against a threshold that stacking
// cannot change: the transport's buttons (their own widths, summed) plus the
// chips' full text widths (scrollWidth — the same squeezed or not). An
// earlier version also read the ▾ overflow signal, which the stacking itself
// flips; at some widths it toggled every frame and the iPad blinked nonstop
// (0692e13, reverted). Unstacking needs TRACK_ROW_SLACK more room, so a
// width right at the threshold can't flip back and forth either.
export const TRACK_ROW_SLACK = 60;
export function trackRowNeed() {
  const tp = document.getElementById("transport"), bar = document.getElementById("trackbar"), tog = document.getElementById("tracktoggle");
  const kids = el => [...el.children].filter(c => c.offsetParent !== null || c.style.display !== "none");
  const tc = document.getElementById("timectl");
  const tw = kids(tp).reduce((w, c) => w + c.offsetWidth + 8, 0) + (tc ? kids(tc).reduce((w, c) => w + c.offsetWidth + 8, 8) : 0); // the time controls ride the same row
  const cw = kids(bar).reduce((w, c) => w + Math.max(c.scrollWidth, c.offsetWidth) + 8, 0);
  return tw + cw + (tog ? tog.offsetWidth + 16 : 0) + 24;
}
export function fitTrackRow() {
  const row = document.getElementById("trackrow");
  if (!row || !row.clientWidth) return;
  const stacked = row.classList.contains("stacked"), need = trackRowNeed(), w = row.clientWidth;
  const stack = stacked ? w < need + TRACK_ROW_SLACK : w < need;
  if (stack !== stacked) { row.classList.toggle("stacked", stack); updateTrackMore(); }
}
export function scheduleFitTrackRow() { // a function property, not S: called from observers only
  if (scheduleFitTrackRow.pending) return;
  scheduleFitTrackRow.pending = true;
  requestAnimationFrame(() => { scheduleFitTrackRow.pending = false; fitTrackRow(); });
}

export function trackToggle(ti, what) { // M / S / H from a chip or a lane header: the song remembers it (track: annotation)
  const st = S.trackState[ti] || (S.trackState[ti] = {muted: false, solo: false});
  st[what] = !st[what];
  if (S.song && S.song.tracks[ti]) saveTrackDir(ti); // finalizeNotes re-applies it, then renders
  renderTrackbar(); buildScoreModel(); updateTrackGains(); clampView(); draw();
}
export function saveVoices() { saveTrackDir(S.voiceMenuTi); }
export function saveTrackDir(ti) { // upsert this track's "track:" directive — a normal
  // synced annotation (Josh, 2026-08-15): voice & color are song truths; so
  // are mute / solo / hide (2026-09-29: DAWs save them with the project)
  const tr = S.song.tracks[ti];
  const name = tr.name || "tr" + (ti + 1);
  const st = S.trackState[ti] || {};
  const d = {name, voice: tr.voice, color: tr.color, vol: tr.vol !== 1 ? tr.vol : undefined, pan: tr.pan,
             mute: !!st.muted, solo: !!st.solo, hide: !!st.hidden};
  // one undo step (DAW review, 2026-09-29: a stray fader drag or voice tap
  // couldn't be taken back): the directives as they were, before this change
  pushUndo({kind: "anno", json: annoSnapshot()});
  S.rollnotes.forEach(n => { if (n.trackdir && n.trackdir.name.toLowerCase() === name.toLowerCase()) tombstone(n); });
  S.rollnotes = S.rollnotes.filter(n => !(n.trackdir && n.trackdir.name.toLowerCase() === name.toLowerCase()));
  const text = trackDirText(d); // 0 pan is written too: it overrides a .mid's own pan
  if (text !== "track: " + name) S.rollnotes.push(resolveNote({b1: 1, q1: 1, b2: null, q2: null, text, trackdir: d, added: true}));
  finalizeNotes(); // re-applies (or reverts) voice/color/mute/solo/hide from the directives
  saveLocalNotes();
  updateSyncBtn();
}
// ti, or null = the whole selection
export function renameTrack(ti, newName) { // compositions/local drafts only — analysis songs regenerate from NSF
  newName = (newName || "").trim();
  if (!newName) return "name is empty";
  if (!isComposition() && !isLocalDraft()) return "captures are locked — track names come from the pipeline";
  if (S.song.tracks.some((t, i) => i !== ti && (t.name || "") .toLowerCase() === newName.toLowerCase()))
    return "another track is already called that";
  const oldName = S.song.tracks[ti].name || "tr" + (ti + 1);
  S.song.tracks[ti].name = newName;
  delete S.song.tracks[ti].drums; // drum-ness derives from the name; re-derive
  for (const n of S.rollnotes) { // migrate EVERY matching directive, stale dupes included
    if (n.audiodir && n.audiodir.track.toLowerCase() === oldName.toLowerCase()) { // the clip follows the name
      tombstone(n); // its identity changes with the text
      n.audiodir.track = newName;
      n.text = audioDirText(n.audiodir);
      n.added = true;
      continue;
    }
    if (!n.trackdir || n.trackdir.name.toLowerCase() !== oldName.toLowerCase()) continue;
    n.trackdir.name = newName;
    n.text = trackDirText(n.trackdir);
    n.added = true; // the migrated directive must persist and sync
  }
  finalizeNotes();
  saveLocalNotes();
  saveDraft(); // the .mid bakes the name on the next Save & Commit
  renderTrackbar();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return null;
}
