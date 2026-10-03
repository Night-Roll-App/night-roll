import { S } from "../state.js";

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
