import { S } from "../state.js";
import { noteToJSON } from "./rollnotes.js";
import { prof } from "../state.js";
import { notesStoreKey } from "./rollnotes.js";
import { updateSyncBtn } from "../hooks.js";
import { updateSongBtn } from "../hooks.js";
import { editableSong } from "./song.js";
import { scheduleBackupFlush } from "../hooks.js";
import { logDebug } from "../hooks.js";
import { scheduleAnalysisRecompute } from "../gen/analysis.js";
import { isComposition } from "./provenance.js";
import { saveDraft } from "./versions.js";
import { computeSongEnd } from "./song.js";
import { updateSongMeta } from "../hooks.js";

// ---------------------------------------------------------------- edits
export function editsKey() { return S.songKey ? "ff1roll-edits-" + S.songKey : null; }
// Policy for an overlay found on a local/ song. No build writes one any more,
// so it is an old build's, with no stamp saying which draft it was built on —
// on Josh's iPad (2026-10-02) the draft was older than it; elsewhere the
// draft is newer and already holds it. So keep notes over guessing (a
// doubled note is recoverable, a lost one is not):
//  - an added note goes in unless the song already has a note on that track
//    with the same start, pitch and length (no doubling);
//  - a removed id ("ti:ni") is NOT replayed: it indexes the song as it was
//    then, and after Insert bars or a rewrite of the draft it names a
//    different note. Skipped ids go to the debug log;
//  - the overlay stays until the merged draft is written AND read back
//    holding every note it added; then it moves aside to
//    ff1roll-retired-edits-<key>@<ms> — never deleted.
export function overlayNoteSig(ti, n) { return ti + ":" + n.t + ":" + n.p + ":" + n.d; }
// Clear edits clears the overlay; on a local song the overlay is no edit
// store, only an old build's leftover waiting to be folded — never offered
export function updateClearBtn() {
  const has = editsKey() && !isLocalDraft() && localStorage.getItem(editsKey());
  document.getElementById("clearbtn").style.display = has ? "" : "none";
}
// imported local MIDIs live under local/ — draft-backed and editable on this
// device, but with no repo path: never synced, never committed
export function isLocalDraft() { return !!S.songKey && S.songKey.startsWith("local/"); }

export function pushUndo(entry) { S.editUndo.push(entry); S.editRedo = []; } // a fresh edit forks history
// Track add/delete are undo steps too (Josh, 2026-09-12: a deleted track was
// gone for good). Deleting used to wipe the history because entries hold track
// indexes; LIFO makes that unnecessary — nothing older can be reached until the
// delete itself is undone, which puts the track back at the same index.
export function addTrackUndoable(track) { // push a track and return its index; caller records the undo
  S.song.tracks.push(track);
  if (S.song.rawNotes) S.song.rawNotes.push([]);
  S.trackState.push({muted: false, solo: false});
  return S.song.tracks.length - 1;
}

export function annoSnapshot() { // full annotation-layer state, INCLUDING added flags
  return JSON.stringify(S.rollnotes.map(n => ({j: noteToJSON(n), a: !!n.added})));
}
annoSnapshot = prof("annoSnapshot", annoSnapshot); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
// tombstones (2026-08-19, handoff item): deletions of SYNCED annotations get
// a persistence path — identities recorded per song, subtracted at load,
// cleared when a Sync commits the post-deletion file as the new canon
export function tombKey() { return tombKeyFor(S.songKey); }
export function tombKeyFor(key) { return "ff1roll-tombs-" + key; } // parameterized: publishSong clears a not-open song's tombstones too (Bugs found, docs/provenance-plan.md)
export function noteIdentity(n) { return JSON.stringify(noteToJSON(n)); }
export function tombstone(n) {
  if (!S.songKey || n.added) return; // never-synced notes die with saveLocalNotes
  try {
    const t = JSON.parse(localStorage.getItem(tombKey()) || "[]");
    t.push(noteIdentity(n));
    localStorage.setItem(tombKey(), JSON.stringify(t));
  } catch (err) {}
}

export function saveLocalNotes() {
  if (!notesStoreKey()) return;
  const local = S.rollnotes.filter(n => n.added).map(n =>
    ({b1: n.b1, q1: n.q1, b2: n.b2, q2: n.q2, text: n.text,
      section: n.section || undefined, chord: n.chord || undefined,
      cnote: n.cnote || undefined, keydir: n.keydir, ai: n.ai || undefined})); // ai: the ✦ AI-estimate tag survives a reload like the rest of the note
  if (local.length) localStorage.setItem(notesStoreKey(), JSON.stringify(local));
  else localStorage.removeItem(notesStoreKey());
  updateSyncBtn();
  if (typeof updateSongBtn === "function") updateSongBtn(); // the ● counts unpublished annotations (songUnsaved)
  if (editableSong()) scheduleBackupFlush(); // off-device backup (2026-10-02 deploy safeguards)
}
saveLocalNotes = prof("saveLocalNotes", saveLocalNotes); // A new key at a bar REPLACES the key there — never two keys at one point

export function undoTrackAdd(ti, lenBefore) { // fold a generator's own entry (if it pushed one) into the same step
  const own = S.editUndo.length > lenBefore ? S.editUndo.pop() : null;
  pushUndo(own ? {kind: "group", entries: [{kind: "trackRemove", ti}, own]} : {kind: "trackRemove", ti});
}

// The removed/added overlay is the edit store of READ-ONLY songs (captures)
// only. A local/ song (Untitled, a local import) keeps ONE copy — its whole
// draft, rewritten by every edit (saveEdits → saveDraft; see "Local song
// persistence" in NIGHT-ROLL.md). Before 2026-10-02 it had both, they
// disagreed, and replaying the overlay onto a draft that already held it
// doubled notes; dropping it instead (6ad5eee) lost Josh's newest notes —
// on his iPad the draft was the OLDER copy. foldOldOverlay merges what an
// old build left behind.
export function loadEdits() {
  if (!editsKey()) return;
  if (isLocalDraft()) { foldOldOverlay(); updateClearBtn(); return; }
  try {
    const e = JSON.parse(localStorage.getItem(editsKey()) || "null");
    if (!e) return;
    for (const id of e.removed || []) {
      const [ti, ni] = id.split(":").map(Number);
      if (S.song.tracks[ti] && S.song.tracks[ti].notes[ni]) S.song.tracks[ti].notes[ni].gone = true;
    }
    for (const n of e.added || []) {
      if (S.song.tracks[n.ti]) S.song.tracks[n.ti].notes.push({t: n.t, d: n.d, p: n.p, v: 80, added: true});
    }
  } catch (err) { /* corrupted edits: ignore */ }
  updateClearBtn();
}
export function foldOldOverlay() {
  const raw = localStorage.getItem(editsKey());
  if (raw === null) return;
  let e = null; try { e = JSON.parse(raw); } catch (err) { logDebug("old edits on " + S.songKey + " are unreadable — left in place, not applied"); return; }
  if (!e) return;
  const have = new Set();
  S.song.tracks.forEach((tr, ti) => tr.notes.forEach(n => { if (!n.gone) have.add(overlayNoteSig(ti, n)); }));
  const need = [];
  let restored = 0, already = 0;
  for (const n of e.added || []) {
    if (!S.song.tracks[n.ti]) continue;
    const sig = overlayNoteSig(n.ti, n);
    need.push(sig);
    if (have.has(sig)) { already++; continue; }
    have.add(sig);
    S.song.tracks[n.ti].notes.push({t: n.t, d: n.d, p: n.p, v: 80, added: true});
    restored++;
  }
  const skipped = e.removed || [];
  logDebug("old edits on " + S.songKey + ": " + restored + " note(s) restored, " + already + " already in the draft, " +
    skipped.length + " deletion(s) not replayed (notes kept)" + (skipped.length ? ": " + skipped.join(" ") : ""));
  S.song.overlayFold = {key: S.songKey, raw, need};
}
export function saveEdits() {
  // label review is on-demand only (Josh, 2026-08-19: unsolicited verdicts are
  // not in the spirit of the project) — edits just retire any review flags
  S.rollnotes.forEach(n => { if (n.stale) delete n.stale; });
  scheduleAnalysisRecompute(); // P6: Normal-only view layer — recompute on note edits, debounced; no-op when off
  if (isComposition() || isLocalDraft()) { // composition or local song: the notes ARE the song — draft it whole
    saveDraft();
    computeSongEnd();
    updateSongMeta();
    return;
  }
  if (!editsKey()) return;
  const removed = [], added = [];
  S.song.tracks.forEach((tr, ti) => tr.notes.forEach((n, ni) => {
    // ticks stored raw (chop is a view); ri keeps ids stable across chops
    if (n.added) { if (!n.gone) added.push({ti, t: n.t + S.chopS, d: n.d, p: n.p}); }
    else if (n.gone) removed.push(ti + ":" + (n.ri !== undefined ? n.ri : ni));
  }));
  if (removed.length || added.length)
    localStorage.setItem(editsKey(), JSON.stringify({removed, added}));
  else localStorage.removeItem(editsKey());
  updateClearBtn();
}
saveEdits = prof("saveEdits", saveEdits); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()

// Editing a SYNCED annotation replaces it with a local copy; without a
// tombstone the repo original came back on reload underneath the rename
// (Josh, 2026-09-13: "renaming makes a new one over the top of the old one")
export function retireEdited(n) { tombstone(n); S.rollnotes = S.rollnotes.filter(x => x !== n); }
export function pruneTombstones() { // an undo put notes back: their tombstones must not re-kill them on reload
  if (!S.songKey) return;
  try {
    const t = JSON.parse(localStorage.getItem(tombKey()) || "[]");
    const live = new Set(S.rollnotes.filter(n => !n.added).map(noteIdentity));
    const keep = t.filter(id => !live.has(id));
    if (keep.length !== t.length) localStorage.setItem(tombKey(), JSON.stringify(keep));
  } catch (err) {}
}
export function clearTombstones() { clearTombstonesFor(S.songKey); }
export function clearTombstonesFor(key) { if (key) localStorage.removeItem(tombKeyFor(key)); }
