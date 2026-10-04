import { S } from "../state.js";
import { noteToJSON } from "./rollnotes.js";
import { prof } from "../state.js";
import { notesStoreKey } from "./rollnotes.js";
import { updateSyncBtn } from "../hooks.js";
import { updateSongBtn } from "../hooks.js";
import { editableSong } from "./song.js";
import { scheduleBackupFlush } from "../hooks.js";

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
      cnote: n.cnote || undefined, keydir: n.keydir}));
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
