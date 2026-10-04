import { tickToSec } from "../midi/parse.js";
import { S } from "../state.js";
import { clipLen } from "../model/song.js";

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

export function playSec() { // current position on the song timeline, seconds
  const s = Math.max(0, S.audio.currentTime - S.playT0) + S.playOffset; // playT0 starts slightly ahead; a count-in holds the playhead at its start, even mid-song
  if (!S.loopSeg || S.loopSeg.end <= S.loopSeg.start) return s;
  return s < S.loopSeg.end ? s : S.loopSeg.start + (s - S.loopSeg.end) % (S.loopSeg.end - S.loopSeg.start);
}

export function buildSchedule() {
  // all tracks scheduled; per-track gain nodes apply mute/solo live
  S.schedEvents = [];
  S.song.tracks.forEach((tr, ti) => {
    for (const n of tr.notes) {
      if (n.gone) continue;
      S.schedEvents.push({ti, n, sec: tickToSec(S.song, n.t), dur: Math.max(0.04, tickToSec(S.song, n.t + n.d) - tickToSec(S.song, n.t))});
    }
    if (tr.kind === "audio") for (const c of tr.clips) { // one event per piece; sec/dur are WALL
      // seconds like every event (tickToSec already divides by playRate), the
      // file offset/len are buffer seconds. The stub n keeps the chase filters
      // and the transport-stopped guard shape-compatible.
      if (!c.dur || clipLen(c) <= 0) continue;
      S.schedEvents.push({ti, n: {ch: 0, v: 100, _clip: c}, sec: tickToSec(S.song, c.at), dur: clipLen(c) / S.playRate});
    }
  });
  S.schedEvents.sort((a, b) => a.sec - b.sec);
}

export function albumStrip() { // the run's one visible body — text, paused dimming, shown iff a run exists
  const el = document.getElementById("albumstrip");
  if (!el) return;
  if (!S.albumRun) { el.style.display = "none"; return; }
  const {list, idx} = S.albumRun;
  const cycling = !!(S.rangeSel && S.rangeSel.cycle && !S.rangeSel.off && S.rangeSel.b > S.rangeSel.a);
  document.getElementById("albumtext").textContent =
    (idx + 1) + "/" + list.length + " " + list[idx][0] +
    (cycling ? " · cycling — album waits" : " · next: " + list[albumNextIdx(idx + 1, list.length)][0]);
  el.classList.toggle("paused", !S.playing);
  el.style.display = "";
}
