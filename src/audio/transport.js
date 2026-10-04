import { tickToSec } from "../midi/parse.js";
import { S } from "../state.js";
import { clipLen } from "../model/song.js";
import { chip } from "./chip.js";
import { gameVoicesInSong } from "./voices.js";
import { sf2VoicesInSong } from "./voices.js";
import { gamePreloadTokens } from "./voices.js";
import { sfFileFor } from "./voices.js";
import { trackVoice } from "./voices.js";
import { sfBank } from "./voices.js";
import { forEachClip } from "./clips.js";
import { audioBufCache } from "./clips.js";
import { audioCacheKey } from "./clips.js";
import { setPlayBtn } from "../ui/controls.js";
import { logDebug } from "../hooks.js";
import { setInfo } from "../hooks.js";
import { updateChipBtn } from "../hooks.js";
import { ensureAudio } from "./engine.js";
import { audioSessionType } from "../platform/native.js";
import { resumeAudio } from "./engine.js";
import { logErr } from "../hooks.js";
import { openMaster } from "./engine.js";
import { stretchEnsureAll } from "./clips.js";
import { sfWaitForSong } from "./voices.js";
import { gameWaitForSong } from "./voices.js";
import { met } from "./metronome.js";
import { ensureMetGain } from "./metronome.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { secToTick } from "../midi/parse.js";
import { beatTicks } from "../model/grid.js";
import { metClick } from "./metronome.js";
import { recOpenEnded } from "../model/song.js";
import { updateTrackGains } from "./engine.js";
import { trackGain } from "./engine.js";
import { chipActive } from "./chip.js";
import { chipStreamStart } from "./chip-stream.js";
import { chipStart } from "./chip.js";
import { trackIsDrums } from "../model/grid.js";
import { scheduleNote } from "./voices.js";
import { clipClamp } from "./clips.js";
import { srAnnounce } from "../hooks.js";
import { songTitleOf } from "../hooks.js";
import { chipStreamPump } from "./chip-stream.js";
import { albumAdvance } from "../hooks.js";
import { pxPerTick } from "../render/roll.js";
import { wrap } from "../render/roll.js";
import { updateSubtitle } from "../hooks.js";
import { playbackFrame } from "../hooks.js";
import { recFinish } from "../hooks.js";
import { draw } from "../hooks.js";
import { chipStopSrcs } from "./chip.js";
import { setControl } from "../ui/controls.js";

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

// ---- ▶ waits for the song (Josh, 2026-09-29: "the play button should not
// even be enabled until everything is loaded … once it hits 100% it turns
// into the regular Play button"). playGate() is the one synchronous answer:
// null = ready, else {pct, what}. The ticker runs only while something loads
// and stops itself; ▶ is disabled only after PLAY_GATE_GRACE so a song with
// nothing to load never flashes, and never for longer than PLAY_GATE_MAX — a
// load that hangs must not strand him (synth carries it, and the log says so).
export const PLAY_GATE_GRACE = 150, PLAY_GATE_MAX = 30000;
export const gateSettled = new WeakSet(), gateWatched = new WeakSet();
export function gatePending(tok) { // a promise's state, synchronously, from the first time we see it
  if (!tok || gateSettled.has(tok)) return false;
  if (!gateWatched.has(tok)) { gateWatched.add(tok); Promise.resolve(tok).catch(() => {}).finally(() => gateSettled.add(tok)); }
  return true;
}
export function playGate() {
  if (!S.song || !S.songKey) return null;
  if (S.songLoading) return {pct: 0, what: "the song"};
  if (chip.rendering === S.songKey) return {pct: chip.progress || 0, what: "the console's voice"};
  if (chip.resolving && chip.resolving.key === S.songKey) return {pct: 0, what: "the console file"};
  let total = 0, waiting = 0;
  try {
    for (const {voice} of [...gameVoicesInSong(), ...sf2VoicesInSong()]) { total++; if (gatePending(gamePreloadTokens.get(voice))) waiting++; }
    S.song.tracks.forEach((tr, ti) => {
      const file = sfFileFor(trackVoice(ti)), bank = file && sfBank[file];
      if (!bank) return;
      const ps = new Set(tr.notes.filter(n => !n.gone).map(n => n.p));
      for (const p of ps) { total++; if (!bank.buffers[p] && bank.pending[p]) waiting++; }
    });
    forEachClip(c => { total++; const e = audioBufCache.get(audioCacheKey(c.file)); if (e && e.status === "decoding") waiting++; });
  } catch (err) { return null; } // a half-built song: never block ▶ on our own bookkeeping
  return waiting ? {pct: (total - waiting) / total, what: "instruments"} : null;
}
export async function playGateWait(capMs) { // album advance: the same gate, awaited
  playGateKick();
  const t0 = Date.now();
  while (playGate() && Date.now() - t0 < capMs) await new Promise(r => setTimeout(r, 200));
}
export async function play(fromSec = 0, opts = {}) {
  if (S.songLoading) { // starting a transport against a half-loaded song played
    S.pendingPlay = true; // a couple of chase notes then died (Josh, 2026-08-17)
    setPlayBtn("play", "…");
    return;
  }
  const gen = ++play.gen; // a later play() supersedes this one while it waits below
  if (chip.fail && chip.fail.key === S.songKey) { // the last attempt failed: ▶ is the retry
    logDebug("play: retrying the console voice (" + chip.fail.why + ")");
    setInfo("trying the console voice again…");
    chip.fail = null; updateChipBtn();
  }
  ensureAudio();
  audioSessionType("playback"); // now Night Roll is the music: other apps pause, and it keeps playing off-screen
  await resumeAudio(); // await: scheduling against a frozen clock builds a stale time base
  if (gen !== play.gen) return;
  // the console's voice is still rendering on this thread (Josh, 2026-09-27,
  // first Play on a Chrono Trigger song: "sounds weird … the cursor paused",
  // fine after Stop/⏮/Play): a synth pass under a render is starved and
  // garbled, so wait for the render instead — with its progress — and let a
  // second tap (Stop) during the wait win
  if (chip.resolving && chip.resolving.key === S.songKey && chip.rendering !== S.songKey) { // still finding the console file: the render hasn't started yet
    logDebug("play: waiting for the console file to resolve");
    setPlayBtn("play", "…");
    setInfo("loading the console's voice…");
    await Promise.race([chip.resolving.p.catch(() => {}), new Promise(r => setTimeout(r, 25000))]);
    if (gen !== play.gen || S.playing) return;
    setInfo("");
  }
  logDebug("play: " + (chip.rendering === S.songKey ? "waiting for the console render" : chip.key === S.songKey ? "console voice ready" : "synth voices (no console source)"));
  if (chip.rendering === S.songKey && chip.renderPromise) {
    setPlayBtn("play", "…");
    const t0 = Date.now();
    while (chip.rendering === S.songKey && Date.now() - t0 < 25000) {
      setInfo("rendering the console's voice… " + Math.round((chip.progress || 0) * 100) + "%");
      await new Promise(r => setTimeout(r, 200));
      if (gen !== play.gen || S.playing) return; // stopped or restarted meanwhile
    }
    if (chip.rendering === S.songKey) logErr("console render still running after 25 s (" + Math.round((chip.progress || 0) * 100) + "%) — playing synthesized voices; the chip joins at the next ▶");
    setInfo("");
  }
  openMaster();
  buildSchedule();
  stretchEnsureAll(); // takes at a non-native rate need their stretched copies (no-op at 100% / tape-style)
  await Promise.all([sfWaitForSong(1500), gameWaitForSong(1500)]); // sampled/game voices still decoding: a short wait beats a triangle (or the synth fallback) on beat 1
  if (gen !== play.gen) return; // superseded: only the newest play starts the transport
  S.playing = true;
  S.playOffset = fromSec;
  S.playT0 = S.audio.currentTime + 0.08; // small lead so the first notes are never in the past
  // count-in (Josh's rules, 2026-08-15): ONE bar of clicks, only when play
  // starts from 1.1 — never mid-song, and loops can't retrigger it because
  // wraps never re-enter play(). Implemented by pushing playT0 one bar out
  // and clicking the gap; playSec() clamps at 0, so the playhead waits.
  // ● counts in from wherever it starts (DAW habit, 2026-09-29: punch-in at
  // bar 17 had no lead-in); plain playback keeps the 1.1-only rule
  if (met.countIn && !opts.noCountIn && (fromSec < 1e-6 || S.recording) && S.song && S.songEndTick > 0) { // album tracks never count in
    ensureMetGain();
    const beats = beatsPerBarDisp();
    const t0 = secToTick(S.song, fromSec);
    const beatSec = tickToSec(S.song, t0 + beatTicks()) - tickToSec(S.song, t0); // the tempo where it starts
    S.playT0 += beats * beatSec;
    for (let b = 0; b < beats; b++)
      metClick(S.playT0 - (beats - b) * beatSec, b === 0 ? 2 : 1);
  }
  S.loopPass = 0;
  S.loopSeg = currentLoop();
  if (fromSec >= S.loopSeg.end - 0.01) S.loopSeg = {start: 0, end: tickToSec(S.song, S.songEndTick), looped: false};
  // only a DRAGGED ruler range cycles — tapping a section/chord band also sets
  // rangeSel (for + Note prefill) and silently outranked loop: annotations (Josh)
  // a playhead-strip tap plays from exactly where it landed (opts.fromHere —
  // Josh, 2026-10-03): inside the cycle it keeps looping; outside it, this
  // pass plays straight on and the cycle waits for the next ▶
  const cycleSet = !!(S.rangeSel && S.rangeSel.cycle && !S.rangeSel.off && S.rangeSel.b > S.rangeSel.a);
  const fromTick = opts.fromHere ? secToTick(S.song, fromSec) : 0;
  const cycling = cycleSet && !(opts.fromHere && (fromTick < S.rangeSel.a || fromTick >= S.rangeSel.b));
  if (cycling) { // Logic-style cycle: a ruler selection loops playback over just
    // that span and outranks any loop: annotation
    S.loopSeg = {start: tickToSec(S.song, S.rangeSel.a),
               end: tickToSec(S.song, Math.min(S.rangeSel.b, S.songEndTick))};
    // ▶ always replays from the cycle's top (Logic habit — Josh, 2026-08-19);
    // a reschedule mid-play (stretching the cycle) keeps the playhead when it
    // is still inside the span (opts.keepPos — Josh, 2026-10-03)
    if (!((opts.keepPos || opts.fromHere) && fromSec >= S.loopSeg.start && fromSec < S.loopSeg.end)) S.playOffset = fromSec = S.loopSeg.start;
  }
  if (S.recording) S.loopSeg = recOpenEnded(S.loopSeg); // ● : the tape rolls on past the end and the song grows with the take
  // album play: this song ends after its passes (2 of the loop body after the
  // intro; once through if nothing loops), then the next one loads
  S.albumEndAbs = null; S.albumFading = false;
  if (S.albumRun && !cycling) { // cycling: the song loops the cycle and the album waits
    const wi = S.schedEvents.findIndex(e => e.sec >= S.loopSeg.start);
    const hasMaterial = wi >= 0 && S.schedEvents[wi].sec < S.loopSeg.end;
    // extra passes only make sense for a REAL loop: annotation — a
    // through-composed song with no loop (loopSeg === the whole song) has
    // one pass, period. Gating on hasMaterial alone always extended it
    // (any song with notes "has material"), so a sub-bar jingle played all
    // the way through TWO bars of it — mostly silence — before the album
    // moved on (Josh, 2026-09-29). Real loops keep their OST-CD convention.
    S.albumEndAbs = albumEndSec(S.loopSeg, tickToSec(S.song, S.songEndTick), hasMaterial && !!S.loopSeg.looped, S.albumRun.passes) - S.playOffset;
  }
  updateTrackGains();
  S.song.tracks.forEach((_, ti) => trackGain(ti)); // pre-create so gains exist before first event
  if (chipActive()) { if (chip.stream) chipStreamStart(fromSec); else chipStart(fromSec); } // authentic audio rides the same transport
  S.schedIdx = S.schedEvents.findIndex(e => e.sec >= fromSec);
  if (S.schedIdx < 0) S.schedIdx = S.schedEvents.length;
  // chase: a note the cursor lands mid-way through still plays its remainder —
  // but never while cycling: the cycle is a strict window, and tails of notes
  // from before the range replayed as phantom chords on every wrap (Josh)
  for (let k = 0; k < S.schedIdx; k++) {
    const e = S.schedEvents[k];
    if (cycling && !e.n._clip) continue; // a clip is the track, not a tail: it chases even inside a cycle
    if (e.sec + e.dur > fromSec + 0.02 && !(e.n.ch === 9 || trackIsDrums(e.ti)))
      scheduleNote(e.ti, e.n, S.playT0, e.n._clip ? clipClamp(e.sec + e.dur - fromSec, S.loopSeg.end - fromSec) : e.sec + e.dur - fromSec);
  }
  const wrapIdx = S.schedEvents.findIndex(e => e.sec >= S.loopSeg.start);
  setPlayBtn("stop", "Stop");
  srAnnounce("Playing" + (S.albumRun && S.currentPath ? " — " + songTitleOf(S.currentPath) : ""));
  albumStrip(); // un-dims on resume
  const pump = () => {
    if (chip.stream) chipStreamPump(S.audio.currentTime); // first (docs/streamed-render-plan.md step 3): independent of schedEvents/loopSeg's note-scheduling below, and gated internally on `playing`/the open song, so it's safe even on a stray tick after stop()
    if (!S.playing) { clearInterval(S.schedTimer); return; } // a stopped transport schedules nothing, ends nothing
    const segLen = S.loopSeg.end - S.loopSeg.start;
    if (!S.schedEvents.length || segLen <= 0) return;
    const now = S.audio.currentTime - S.playT0;
    if (S.albumRun && S.albumEndAbs !== null) { // fade into the end of the last pass, then the next song.
      // Here, on the scheduler's timer, not the rAF tick: a background tab
      // gets no frames, and an album must keep going while Josh is in another tab
      if (!S.albumFading && now >= S.albumEndAbs - ALBUM_FADE) {
        S.albumFading = true;
        const at = S.audio.currentTime;
        S.master.gain.cancelScheduledValues(at);
        S.master.gain.setValueAtTime(S.master.gain.value, at);
        S.master.gain.linearRampToValueAtTime(0, at + ALBUM_FADE);
      }
      if (now >= S.albumEndAbs) { albumAdvance(); return; }
    }
    for (;;) {
      // every pass ends at the loop point; material past it (a written-out
      // repeat, e.g. ship's bar 25.5 seam) is shown but never played
      if (S.schedIdx >= S.schedEvents.length || S.schedEvents[S.schedIdx].sec >= S.loopSeg.end - 1e-9) {
        if (wrapIdx < 0 || !isFinite(S.loopSeg.end) || S.schedEvents[wrapIdx].sec >= S.loopSeg.end) break; // nothing inside the segment, or an open-ended take: no wrap
        S.loopPass++;
        S.schedIdx = wrapIdx;
        // chase across the wrap: a note straddling the loop target plays its
        // remainder (chip-capture ticks derive from real seconds, so ship's
        // C5 starts a hair before the 1.3 target and vanished on loop)
        const passAbs = S.loopSeg.end + (S.loopPass - 1) * segLen - S.playOffset;
        for (let k = 0; k < wrapIdx; k++) {
          const e = S.schedEvents[k];
          if (cycling && !e.n._clip) continue; // clips chase across a cycle wrap too
          if (e.sec + e.dur > S.loopSeg.start + 0.02 && !(e.n.ch === 9 || trackIsDrums(e.ti)))
            scheduleNote(e.ti, e.n, S.playT0 + passAbs, e.n._clip
              ? clipClamp(e.sec + e.dur - S.loopSeg.start, segLen, S.albumEndAbs === null ? Infinity : S.albumEndAbs - passAbs)
              : e.sec + e.dur - S.loopSeg.start);
        }
      }
      const e = S.schedEvents[S.schedIdx];
      const abs = (S.loopPass === 0 ? e.sec
                                  : S.loopSeg.end + (S.loopPass - 1) * segLen + (e.sec - S.loopSeg.start))
                  - S.playOffset; // seconds after playT0
      if (abs >= now + (document.hidden ? 8 : 0.6)) break; // hidden: the OS throttles this timer to a second or worse, so notes land "in the past" and skip (Josh, 2026-09-29, background play); schedule 8 s ahead instead. Visible: 0.6 s of lookahead: a long frame (Fall on a 1500-note SNES song, an iPad) must not starve the pump — at 0.2 s it dropped notes as "in the past" and went silent (Josh, 2026-09-27)
      if (S.albumEndAbs !== null && abs >= S.albumEndAbs) break; // the pass count is spent: nothing past the end
      if (abs >= -0.05) {
        let d = e.dur;
        if (e.n._clip) { // a clip must stop at the pass end and at the album's end: nothing
          // else does, because MIDI notes are short and ring past the loop harmlessly
          const passEnd = S.loopSeg.end + S.loopPass * segLen - S.playOffset;
          d = clipClamp(d, passEnd - abs, S.albumEndAbs === null ? Infinity : S.albumEndAbs - abs);
        }
        if (d > 0) scheduleNote(e.ti, e.n, S.playT0 + abs, d);
      }
      S.schedIdx++;
    }
  };
  // one scheduler, ever: two overlapping play() calls (the album's play and a
  // queued one) each started an interval, and the first was orphaned — stop()
  // cleared only the second, so the orphan kept "ending" the song while the
  // next one loaded and the album flashed through every song in a second
  // (Josh, 2026-09-28/29, Chrono Trigger on the iPad)
  clearInterval(S.schedTimer);
  S.schedTimer = setInterval(pump, 60);
  pump(); // schedule the first batch immediately — waiting one interval put beat 1 in the past
  S.followFree = false;
  const tick = () => {
    if (!S.playing) return;
    const x = secToTick(S.song, playSec()) * pxPerTick();
    const W = wrap.clientWidth - S.RULER_W;
    const handMidGesture = S.drag && (S.drag.ruler || S.drag.rangeEdge || S.drag.bandEdge || S.drag.stripCursor);
    if (S.followFree) {
      // user scrolled away: hands off until the playhead enters their view
      if (x >= S.view.x && x <= S.view.x + W) S.followFree = false;
    } else if (!handMidGesture) { // never yank the view out from under a ruler
      // drag (Josh: "I can't highlight when the thing moves")
      // auto-follow playhead (and snap back on loop wrap)
      if (x - S.view.x > W * 0.85) S.view.x = x - W * 0.3;
      else if (x < S.view.x) S.view.x = Math.max(0, x - W * 0.1);
    }
    updateSubtitle();
    playbackFrame();
    S.raf = requestAnimationFrame(tick);
  };
  S.raf = requestAnimationFrame(tick);
}
export function stop() {
  S.pendingPlay = false; // an explicit stop cancels a queued mid-load play
  if (S.recording) recFinish();
  clearInterval(S.schedTimer); // even when not "playing": a scheduler must never outlive a stop
  if (!S.playing) { draw(); return; }
  S.playCursor = secToTick(S.song, playSec());
  S.playing = false;
  // back to mixing — except mid-album (the next song's play() follows at once)
  // or off-screen (an "ambient" session is silenced there, and that is where
  // background album play lives), or while the click is running
  if (!S.albumRun && !document.hidden && !met.on) audioSessionType("ambient");
  chipStopSrcs();
  audioStopSrcs(); // a 3-minute clip would otherwise keep rendering into a disconnected gain
  clearInterval(S.schedTimer);
  cancelAnimationFrame(S.raf);
  setPlayBtn("play", "Play");
  albumStrip(); // dims while paused
  if (S.audio) { // fade out instead of tearing the context down — no stop click,
    const t = S.audio.currentTime; // and the next play reuses a warm context
    S.master.gain.cancelScheduledValues(t);
    S.master.gain.setValueAtTime(S.master.gain.value, t);
    S.master.gain.linearRampToValueAtTime(0, t + 0.03);
    const old = S.trackGains;
    S.trackGains = []; S.trackPanners = [];
    setTimeout(() => old.forEach(g => g && g.disconnect()), 400);
  }
  updateSubtitle();
  // same text the LCD just wrote (updateSubtitle -> updateLCD, above) — never
  // recomputed independently, so Learning mode's "nothing spoken the screen
  // doesn't already show" holds for the bar.beat readout too
  srAnnounce("Stopped at bar " + document.getElementById("lcdbar").textContent + " beat " + document.getElementById("lcdbeat").textContent);
  draw();
}
export function playGateKick() {
  if (S.playGateTimer || typeof document === "undefined") return;
  S.playGateSince = Date.now();
  playGateTick();
  if (S.playGateTimer === null && playGateActive()) S.playGateTimer = setInterval(playGateTick, 200);
}
export function playGateActive() { return !S.playing && !!playGate(); }
export function playGateTick() {
  const btn = document.getElementById("playbtn");
  const g = S.playing ? null : playGate(), late = Date.now() - S.playGateSince;
  const timedOut = g && late > PLAY_GATE_MAX;
  if (timedOut) { logErr("still loading " + g.what + " after " + PLAY_GATE_MAX / 1000 + " s — ▶ is on anyway (synthesized voices where it isn't ready)"); playGateTick.queued = false; }
  if (g && !timedOut) {
    if (late < PLAY_GATE_GRACE) return;
    // not .disabled: a tap while loading QUEUES the play (Josh, 2026-09-30:
    // "it should start by itself the moment loading finishes"); tap again to cancel
    btn.classList.add("loading");
    setControl("playbtn", {icon: "hourglassEmpty", label: Math.round(g.pct * 100) + "%" + (playGateTick.queued ? " · will play" : "")});
    btn.title = "loading " + g.what + (playGateTick.queued ? " — plays when ready (tap to cancel)" : " — tap to play when it's ready");
    S.playGateShown = true;
    return;
  }
  clearInterval(S.playGateTimer); S.playGateTimer = null;
  if (S.playGateShown) {
    S.playGateShown = false; btn.classList.remove("loading"); btn.title = ""; if (!S.playing) setPlayBtn("play", "Play");
    if (playGateTick.queued && !S.playing && S.song) { playGateTick.queued = false; play(S.playCursor > 0 ? tickToSec(S.song, S.playCursor) : 0); }
  }
  playGateTick.queued = false;
}

export function initTransport1() {
  play.gen = 0;
}
