import { tickToSec } from "../midi/parse.js";
import { S } from "../state.js";

// audio export: play ONCE, whole song, no loop
export function currentLoop() { // "loop: B.Q" = at the anchor (jump point), return to B.Q
  // `looped` says whether this segment is a REAL loop body (a loop:
  // annotation was found) as opposed to just the whole through-composed
  // song — album play (below) uses it to decide whether repeating the
  // segment for extra passes means anything, or would just replay a
  // non-looping jingle and call it "two bars" (Josh, 2026-09-29)
  const whole = {start: 0, end: tickToSec(S.song, S.songEndTick), looped: false};
  if (S.exporting) return whole;
  const dir = S.rollnotes.find(n => n.loopTo !== undefined);
  if (!dir) return whole;
  const start = tickToSec(S.song, dir.loopTo);
  // anchor past the target = the jump point; an anchor at/before the target
  // (e.g. auto-written files anchored at [1.1]) means jump at song end
  const end = dir.start > dir.loopTo
    ? Math.min(tickToSec(S.song, dir.start), whole.end) : whole.end;
  return start < end ? {start, end, looped: true} : whole;
}
export function audioStopSrcs() {
  for (const s of S.audioSrcs) { try { s.stop(); } catch (err) { /* already done */ } }
  S.audioSrcs = [];
}
// ---------------------------------------------------------------- album play
// The album is a STRIP, the transport is the song (advisor's ruling after Josh
// found the first version confusing, 2026-09-14). Start from File → Open… →
// album → 💿 Play album; a tinted strip appears under the track row for exactly
// as long as the run lasts: 3/19, the song, what's next, ⏮ Prev, ⏭ Next, ✕.
// The transport never changes meaning: ⏮ is bar 1, ▶/■/Space start and stop
// THIS song — inside a run ■ is a pause and ▶ resumes, the album carries on.
// Every song here loops forever on its own, so the run decides the ending:
// the intro plus ALBUM_PASSES of the loop body (the OST-CD convention), a
// fade, then the next song; the list wraps forever (no repeat control — "this
// song forever" is ✕, since plain ▶ already loops). Leaving happens only on
// actions that change WHAT is loaded: ✕, picking a song, ●, Download audio.
// Nothing pops mid-run — a newer repo save is kept out of the way, not asked about.
export const ALBUM_PASSES = 2, ALBUM_CAP_SEC = 300, ALBUM_FADE = 1.5, ALBUM_MAX_FAILS = 3;
// session only: no autoplay without a gesture — a reload with ?album= re-arms the run (armAlbumLink), never plays it
export function albumNextIdx(idx, len) { return ((idx % len) + len) % len; }
// wraps both ways
export function albumPrevIdx(idx, len) { return albumNextIdx(idx - 1, len); }
export function albumEndSec(seg, wholeEnd, hasMaterial, passes = ALBUM_PASSES, cap = ALBUM_CAP_SEC) {
  const len = seg.end - seg.start;
  const end = hasMaterial && len > 0 ? seg.end + (passes - 1) * len : wholeEnd; // pass 1 = intro + body; each further pass = the body again
  return Math.min(end, cap);
}
