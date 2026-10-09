import { PERF_FLAGS } from "../platform/base.js";
import { chip } from "./chip.js";
import { S } from "../state.js";
import { trackGain } from "./engine.js";
import { tickToSec } from "../midi/parse.js";
import { chipBuffers } from "./chip.js";
import { playSec } from "./transport.js";
import { chipWorkerAvailable } from "./chip.js";
import { CHIPS } from "./chip.js";
import { chipPreviewPending } from "./chip.js";
import { chipSource } from "./chip.js";
import { chipRenderBudget } from "./chip.js";
import { logDebug } from "../hooks.js";
import { songTitleOf } from "../hooks.js";
import { chipRender } from "./chip.js";
import { chipLoudPending } from "./chip.js";
import { loudStreamChunk } from "./levels.js";
import { loudCacheGet } from "./levels.js";
import { LOUD_VERSION } from "./loudness.js";

// -------------------------------------------- chip stream mode (step 3) ---
// docs/streamed-render-plan.md step 3 — a SECOND way to get console audio
// playing, added entirely behind a switch that defaults OFF. With the
// switch off, nothing above this comment runs any differently than before
// this step (chipRender/chipPublish/chipPcmToBuffers/chipStart/
// planChipRender are untouched and chip.stream stays null forever). On, for
// a song whose chip kind streams — today only psf/psf2
// (tools/chip-worker.mjs RUNNERS' own R.stream hook) — console audio arrives
// a couple of seconds at a time instead of being rendered (and held) whole
// up front; see the plan doc for why (FFX "Challenge" on PS2, 1.88 GB of
// Float32, killed the iPad's WKWebView). The page never hardcodes which
// kinds qualify (CLAUDE.md: no per-game/per-kind table in a capture engine)
// — it just tries, and the worker's own {stream:{error:"no stream for
// <kind>"}} reply for every other kind is the fallback signal.
//
// Settings → Other's three-way control (next to Debug log) persists
// ff1roll-chipstream: off|auto|on, overridden per-tab by ?chipstream=on|off
// (A/B — PERF_FLAGS, the same hand-rolled location.search reader ?dpr/
// ?scene already use, so this works in the vm test sandbox too, which has
// no real `location`). "auto" (step 5, 2026-10-01): streams a song ONLY
// where the whole-render path would itself downgrade (mono/a lower rate) or
// refuse — see chipAutoShouldStream/chipStreamOpen's own comments, right
// below. The DEFAULT stays "off" either way (Josh hasn't A/B-listened to
// stream mode yet — his weekend list has it) — this only changes what
// "auto" does once someone picks it.
export function chipStreamMode() {
  const u = PERF_FLAGS.get("chipstream");
  if (u === "on" || u === "off" || u === "auto") return u;
  try { const v = localStorage.getItem("ff1roll-chipstream"); if (v === "on" || v === "off" || v === "auto") return v; } catch (err) { /* private mode: the default */ }
  return "auto"; // default (Josh, 2026-10-01): auto touches only songs the whole path would downgrade or refuse, and falls back to it on any failure
}
// Step 5 (docs/streamed-render-plan.md): "auto" streams a song ONLY where
// the whole-render path would itself have to downgrade (mono, or a lower
// sample rate) or refuse — i.e. planChipRender's own verdict for THIS song,
// with the honest canStream:true peak estimate (planChipRender's own
// comment), says so. tools/chip-worker.mjs's handleStream computes that
// hypothetical plan (chipEstimateTracksW + planChipRender, the exact numbers
// the whole-render handler itself would use) whenever chipStreamOpen sends a
// `budget`, and returns it as {ready:{…, plan}} — chipStreamOpen(true) reads
// it right after a successful open and decides whether to KEEP the session
// (stream) or throw it away and fall back to chipRender() (whole), so a
// typical small/already-fitting song is untouched even with "auto" on,
// exactly as it was with the switch "off". A kind with no stream hook at
// all (today: everything but psf/psf2) never reaches this decision — the
// worker's own `{stream:{error:"no stream for <kind>"}}` reply (the SAME
// fallback "on" mode already relies on; the page still never hardcodes
// which kinds qualify) sends it straight to the whole path, logged by the
// existing error branch below.
export function chipAutoShouldStream(plan, nativeRate) { return !!plan && !!(plan.refuse || plan.mono || plan.rate !== nativeRate); }
export function chipAutoReason(plan, nativeRate) {
  if (!plan) return "no budget plan from the worker";
  if (plan.refuse) return "whole render would refuse (too big for this device's memory)";
  if (plan.mono || plan.rate !== nativeRate) {
    const bits = [];
    if (plan.rate !== nativeRate) bits.push(Math.round(plan.rate / 1000) + " kHz");
    if (plan.mono) bits.push("mono");
    return "whole render would drop to " + bits.join(" ");
  }
  return "whole render fits as-is";
}
export const CHIP_STREAM_CHUNK_SEC = 2;
// C in seconds of tape time (chunkFrames = this * the render's own sample rate — tools/chip-worker.mjs's own default chunk size)
export const CHIP_STREAM_OVERLAP = 256;
// O, in frames — tools/chip-worker.mjs's own default
export const CHIP_STREAM_HORIZON_VISIBLE = 7;
// seconds of context time chipStreamPump requests/schedules ahead
export const CHIP_STREAM_HORIZON_HIDDEN = 12;
// document.hidden: the OS throttles timers, so a hidden tab asks further ahead (same reasoning as the note scheduler's own 8s hidden lookahead)
export const CHIP_STREAM_PIN_LOOKAHEAD = 2;
// seconds of tape past loopSeg.start kept pinned so a wrap never waits

// Pure tape-time mapping for stream-mode scheduling (chipStreamPump, below)
// — the same "tape time = chip.lead + songSec × playRate" chipStart already
// uses for one native-looping AudioBuffer's src.start()/loopStart/loopEnd,
// generalized to a RUN of small per-chunk buffers. fromSec/loopSeg.start/
// loopSeg.end are in the scheduler's own "sec" domain (play()'s playSec(),
// tickToSec — already divided by playRate), NOT native/tape seconds; a
// context-time span therefore equals the SAME span in this "sec" domain
// (the /playRate baked into "sec" and the ×playRate baked into tape time
// cancel — the identity chipStart's single looping source already relies on
// via a constant playbackRate), while tape position itself is `lead +
// sec × playRate`.
// Returns [{when, tapeFrom, tapeTo}, …] — `when` is CONTEXT time, in the
// domain the `playT0` argument is given in (the caller supplies whatever
// anchor is current: a fresh audio.currentTime each pump tick, or a fixed
// playT0 for a one-shot computation/test). Segment 0 runs from `fromSec`
// (so a resume mid-loop plays its own remainder — the existing note
// scheduler's own chase behavior) to loopSeg.end; every segment after
// repeats the WHOLE loop body [loopSeg.start, loopSeg.end) — a hard splice
// at the wrap, no crossfade between passes, same as src.loop today. A
// through-composed song (loopSeg.looped falsy) gets exactly one segment.
// albumEndAbs (seconds after `playT0`, or null) truncates the last segment
// and drops anything past it — same rule play()'s own pump already applies
// to note scheduling. Stops once CHIP_SEG_HORIZON_SEC of context time
// beyond `playT0` is covered: generous margin over the pump's own largest
// lookahead (12s hidden), so one call always returns enough for one pump
// tick even for a pathologically short loop (the FF1 triangle ear test);
// CHIP_SEG_MAX_SEGMENTS is a safety valve against a zero-length loop
// looping this function forever.
export const CHIP_SEG_HORIZON_SEC = 20;
export const CHIP_SEG_MAX_SEGMENTS = 512;
export function chipSegments(fromSec, loopSeg, playRate, lead, albumEndAbs, playT0) {
  const out = [];
  if (!loopSeg || !(loopSeg.end > loopSeg.start) || !(playRate > 0)) return out;
  let when = playT0, songFrom = fromSec;
  while (out.length < CHIP_SEG_MAX_SEGMENTS) {
    const songTo = loopSeg.end;
    if (songTo <= songFrom) break; // at/past the loop end with no wrap to reach from here
    let tapeFrom = lead + songFrom * playRate, tapeTo = lead + songTo * playRate;
    let segDur = songTo - songFrom; // context-time span (see the identity above)
    const absStart = when - playT0;
    if (albumEndAbs !== null) {
      if (absStart >= albumEndAbs - 1e-9) break; // the pass count is spent: nothing past the end
      if (absStart + segDur > albumEndAbs) { segDur = albumEndAbs - absStart; tapeTo = tapeFrom + segDur * playRate; }
    }
    if (segDur <= 0) break;
    out.push({when, tapeFrom, tapeTo});
    when += segDur;
    if (albumEndAbs !== null && when - playT0 >= albumEndAbs - 1e-9) break;
    if (!loopSeg.looped) break; // through-composed: one pass, no wrap (play()'s own rule)
    if (when - playT0 >= CHIP_SEG_HORIZON_SEC) break; // enough for one pump tick's lookahead
    songFrom = loopSeg.start; // every repeat after the first plays the WHOLE loop body
  }
  return out;
}
export function chipStreamIdxForTapeSec(tapeSec) { return Math.max(0, Math.floor(tapeSec / CHIP_STREAM_CHUNK_SEC)); }
// {chunk:{id, gen, idx, frames, tracks}} -> AudioBuffers in chip.stream.cache
// (the same "build the AudioBuffer once, drop the Float32" move
// chipPcmToBuffers makes for the whole-render path). A chunk for a superseded
// song or an old gen (a seek bumped it) is silently dropped — the worker may
// still have one in flight when either happens.
export function chipStreamOnChunk(c) {
  const st = chip.stream;
  if (!st || st.key !== c.id || st.gen !== c.gen) return;
  const buffers = {}; let bytes = 0;
  for (const [name, data] of Object.entries(c.tracks)) {
    const stereo = data && data.l ? data : null;
    const len = stereo ? stereo.l.length : (data ? data.length : 0);
    if (!len) continue;
    let buf = null;
    try { buf = (typeof AudioBuffer === "function") ? new AudioBuffer({numberOfChannels: stereo ? 2 : 1, length: len, sampleRate: st.rate})
      : (S.audio && S.audio.createBuffer(stereo ? 2 : 1, len, st.rate)); } catch (err) { buf = S.audio && S.audio.createBuffer(stereo ? 2 : 1, len, st.rate); }
    if (!buf) continue;
    if (stereo) { buf.copyToChannel(stereo.l, 0); buf.copyToChannel(stereo.r, 1); bytes += stereo.l.byteLength + stereo.r.byteLength; }
    else { buf.copyToChannel(data, 0); bytes += data.byteLength; }
    buffers[name] = buf;
  }
  st.cache.set(c.idx, {buffers, bytes, pinned: st.pinnedIdx.has(c.idx)});
  loudStreamChunk(c.idx, buffers, st.rate); // an unmeasured song: its first chunks stand in for the whole (audio/levels.js)
  st.bytes = 0; for (const e of st.cache.values()) st.bytes += e.bytes;
  st.peakBytes = Math.max(st.peakBytes, st.bytes);
  const waiters = st.waiters.get(c.idx);
  if (waiters) { st.waiters.delete(c.idx); waiters.forEach(fn => fn()); }
}
// {silent:{id, names}} -> chip.stream.silent, a live Set — chipHas() (and so
// scheduleNote's chip guard) reads it the instant it updates: a track the
// idle sweep found never audible lets the synth voice back in, same as the
// whole-render path dropping a silent track from chip.pcm entirely.
export function chipStreamOnSilent(s) {
  const st = chip.stream;
  if (!st || st.key !== s.id) return;
  st.silent = new Set(s.names);
}
export function chipStreamRequestRange(from, to) {
  const st = chip.stream;
  if (!st || !S.chipWorker) return;
  const need = [];
  for (let i = from; i <= to; i++) if (!st.cache.has(i)) need.push(i);
  if (!need.length) return;
  let i = 0;
  while (i < need.length) { // contiguous runs in one {want} call
    let j = i; while (j + 1 < need.length && need[j + 1] === need[j] + 1) j++;
    S.chipWorker.postMessage({want: {id: st.key, gen: st.gen, from: need[i], to: need[j]}});
    i = j + 1;
  }
}
export function chipStreamWaitFor(idx) {
  const st = chip.stream;
  if (!st) return Promise.resolve();
  if (st.cache.has(idx)) return Promise.resolve();
  return new Promise(resolve => { if (!st.waiters.has(idx)) st.waiters.set(idx, []); st.waiters.get(idx).push(resolve); });
}
// Pins the chunks covering [loopSeg.start, loopSeg.start + lookahead] (and
// requests them if they aren't cached yet) so a loop wrap never has to wait
// on the worker; un-pins everything when there's no loop to wrap to. Cheap
// to call every pump tick — it only touches the pin set, not the network/
// worker traffic, beyond the one request for chunks not yet on hand.
export function chipStreamPinLoopStart() {
  const st = chip.stream;
  if (!st) return;
  const idxSet = new Set();
  if (S.loopSeg && S.loopSeg.looped) {
    const tapeStart = chip.lead + S.loopSeg.start * S.playRate;
    const idxFrom = chipStreamIdxForTapeSec(tapeStart);
    const idxTo = chipStreamIdxForTapeSec(tapeStart + CHIP_STREAM_PIN_LOOKAHEAD * S.playRate);
    for (let idx = idxFrom; idx <= idxTo; idx++) idxSet.add(idx);
    chipStreamRequestRange(idxFrom, idxTo);
  }
  st.pinnedIdx = idxSet;
  for (const [idx, entry] of st.cache) entry.pinned = idxSet.has(idx);
}
// Frees cached chunks behind the playhead (never a pinned one) — the
// memory-bounded half of streaming: a long play never holds more than a few
// chunks' worth at once. One chunk of slack behind the current index: its
// overlap tail may still be sounding (the fade-out half of the crossfade).
export function chipStreamEvict(curSec) {
  const st = chip.stream;
  if (!st) return;
  const curIdx = chipStreamIdxForTapeSec(chip.lead + curSec * S.playRate);
  for (const [idx, entry] of st.cache) if (!entry.pinned && idx < curIdx - 1) st.cache.delete(idx);
  for (const idx of st.scheduled.keys()) if (idx < curIdx - 1 && !st.pinnedIdx.has(idx)) st.scheduled.delete(idx); // a played chunk's anchors (chipStreamScheduled)
  st.bytes = 0; for (const e of st.cache.values()) st.bytes += e.bytes;
}
// Keyed by the chunk's ANCHOR — the context time its first sample plays in
// this segment (past for the chunk under the playhead) — not by the clamped
// start: the playhead chunk's start is "now", new every tick, so a start-time
// key rescheduled it each tick and dozens of copies of one chunk played over
// each other (Josh, Terminal #292-294: FF7 on the iPad, the only device whose
// budget streams it). The tolerance absorbs playSec/currentTime jitter; a loop
// wrap's repeat lands a whole loop body later and still schedules.
export const CHIP_STREAM_ANCHOR_TOL = 0.05;
export function chipStreamScheduled(idx, anchor) { const a = chip.stream.scheduled.get(idx); return !!a && a.some(x => Math.abs(x - anchor) < CHIP_STREAM_ANCHOR_TOL); }
// Schedules one AudioBufferSourceNode per track for chunk `idx`'s buffer,
// wired EXACTLY like chipStart's own sources (src -> [chip.pan panner, if
// any] -> trackGain(ti)) so mute/solo/volume/pan and the Mixer meters all
// keep working unchanged. `when`/`offset`/`dur` are already resolved by the
// caller (chipStreamPump) to the exact slice of this chunk's buffer that
// belongs to the current segment — see the comment there for the formula.
export function chipStreamScheduleChunk(idx, entry, when, offset, dur, anchor) {
  const st = chip.stream;
  for (const [name, buffer] of Object.entries(entry.buffers)) {
    const ti = S.song.tracks.findIndex(tr => (tr.name || "") === name);
    if (ti < 0) continue;
    const vv = S.song.tracks[ti].voice;
    if (vv && vv !== "auto") continue; // explicit instrument choice overrides the chip for this track, same as chipStart
    const src = S.audio.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = S.playRate;
    let node = src;
    if (chip.pan && chip.pan[name] !== undefined && S.audio.createStereoPanner) { const p = S.audio.createStereoPanner(); p.pan.value = chip.pan[name]; src.connect(p); node = p; }
    node.connect(trackGain(ti));
    const startAt = Math.max(when, S.audio.currentTime + 0.003);
    if (dur > 0) src.start(startAt, offset, dur); else src.start(startAt, offset);
    src.onended = () => { const i = st.srcs.indexOf(src); if (i >= 0) st.srcs.splice(i, 1); };
    st.srcs.push(src);
  }
  const at = anchor === undefined ? when : anchor, a = st.scheduled.get(idx); if (a) a.push(at); else st.scheduled.set(idx, [at]);
}
// previewNote's register-chip path (nsf/gbs/spc — above, chipPreviewBuffer
// has no per-note renderer for these). Finds the tapped note — tick+pitch
// exact match, not erased, and not `added` (a pencil placement/MIDI-in note
// has nothing rendered where it now sits; `added` is unset only on notes
// the import itself captured — rollnotes.added's own convention) — and
// returns the slice of its track's render that sounds it: {buf, offset,
// dur}, all in BUFFER seconds (start()'s offset/duration are always
// seconds, whatever the buffer's sample rate — no resampling here).
// Native/"tape" position = chip.lead + tickToSec(song, tick) * playRate,
// same identity chipStart's own single looping source relies on (tickToSec
// already divides by playRate; this multiplies it back out). The slice runs
// from the note's own start to its end + a short release tail — up to the
// NEXT note on this track, or +250ms, whichever comes first.
// Stream mode (chip.stream): only answers from a chunk chipStreamPump has
// ALREADY cached — this never requests one from the worker. "else synth" is
// simpler, and the chunks around the playhead are usually already there.
export function chipNoteSlice(tr, pitch, tick) {
  if (tick == null) return null;
  const n = tr.notes.find(nn => !nn.gone && nn.t === tick && nn.p === pitch && !nn.added);
  if (!n) return null;
  const startTape = chip.lead + tickToSec(S.song, n.t) * S.playRate;
  const noteEndTape = chip.lead + tickToSec(S.song, n.t + n.d) * S.playRate;
  let next = null;
  for (const o of tr.notes) if (!o.gone && o !== n && o.t > n.t && (next === null || o.t < next.t)) next = o;
  const endTape = Math.min(noteEndTape + 0.25, next ? chip.lead + tickToSec(S.song, next.t) * S.playRate : Infinity);
  if (chip.stream) {
    const idx = chipStreamIdxForTapeSec(startTape);
    const entry = chip.stream.cache.get(idx);
    const buf = entry && entry.buffers[tr.name];
    if (!buf) return null; // not cached yet: the synth answers now, same as an unready whole render
    const chunkTapeStart = idx * CHIP_STREAM_CHUNK_SEC;
    const offset = Math.min(Math.max(0, startTape - chunkTapeStart), buf.duration);
    const dur = Math.max(0.02, Math.min(endTape - chunkTapeStart, buf.duration) - offset);
    return {buf, offset, dur};
  }
  const buf = chipBuffers()[tr.name];
  if (!buf) return null; // the render isn't done yet, or this track was dropped silent
  const offset = Math.min(startTape, buf.duration);
  const dur = Math.max(0.02, Math.min(endTape, buf.duration) - offset);
  return {buf, offset, dur};
}
// The ~60ms pump (play(), below) calls this FIRST, every tick, while
// chip.stream is this song's live session: requests chunks up to a horizon
// (visible/hidden — the OS throttles timers in a hidden tab, same reasoning
// as the note scheduler's own lookahead), schedules any newly-arrived ones
// that fall inside THIS tick's scheduling window, evicts played chunks, and
// keeps the loop's own start pinned. Safe to call when not playing or
// between songs — every real action below is gated on chip.stream actually
// being this song's live session.
export function chipStreamPump(nowCtx) {
  const st = chip.stream;
  if (!S.playing || !st || st.key !== S.songKey) return;
  const horizon = (typeof document !== "undefined" && document.hidden) ? CHIP_STREAM_HORIZON_HIDDEN : CHIP_STREAM_HORIZON_VISIBLE;
  const until = nowCtx + horizon;
  const curSec = playSec();
  const t0 = Math.max(nowCtx, S.playT0); // before playT0 (the start lead, a count-in) playSec holds at playOffset: the first segment starts AT playT0, not now
  const albumEndRel = S.albumEndAbs === null ? null : S.albumEndAbs - (t0 - S.playT0);
  const segs = chipSegments(curSec, S.loopSeg, S.playRate, chip.lead, albumEndRel, t0);
  let anyLive = false;
  for (const seg of segs) {
    if (seg.when >= until) break;
    const idxFrom = chipStreamIdxForTapeSec(seg.tapeFrom);
    const idxTo = chipStreamIdxForTapeSec(Math.max(seg.tapeFrom, seg.tapeTo - 1e-9));
    chipStreamRequestRange(idxFrom, idxTo);
    for (let idx = idxFrom; idx <= idxTo; idx++) {
      const entry = st.cache.get(idx);
      if (!entry) continue; // not back from the worker yet — the next tick retries
      const chunkTapeStart = idx * CHIP_STREAM_CHUNK_SEC;
      const anchor = seg.when + (chunkTapeStart - seg.tapeFrom) / S.playRate; // the same every tick (chipStreamScheduled says why)
      const when = Math.max(seg.when, anchor);
      if (when >= until) continue; // this tick's window doesn't reach it yet
      if (chipStreamScheduled(idx, anchor)) continue; // already scheduled on an earlier tick
      const offset = Math.max(0, seg.tapeFrom - chunkTapeStart); // mid-chunk resume (a seek that doesn't land on a chunk boundary)
      const dur = Math.max(0, seg.tapeTo - Math.max(seg.tapeFrom, chunkTapeStart)); // trims the LAST chunk of a segment at the loop wrap / album end: a hard splice, no bleed into the next segment
      chipStreamScheduleChunk(idx, entry, when, offset, dur, anchor);
      anyLive = true;
    }
  }
  if (anyLive) st.live = true;
  chipStreamEvict(curSec);
  chipStreamPinLoopStart();
}
// Replaces chipStart(fromSec) in stream mode: no new render, no `{stream}`
// message — the cache from chipStreamOpen keeps whatever it already has (a
// replay from a different spot can reuse cached chunks; chipStreamPump's own
// eviction keeps memory bounded going forward). Bumping gen cancels any
// `{want}`/`{idle}` still in flight for the position this is leaving.
export function chipStreamStart(fromSec) {
  const st = chip.stream;
  if (!st) return;
  for (const s of st.srcs) { try { s.stop(); } catch (err) { /* already done */ } }
  st.srcs = []; st.scheduled = new Map(); st.live = false;
  st.gen++;
  if (S.chipWorker) S.chipWorker.postMessage({seek: {id: st.key, gen: st.gen, idx: chipStreamIdxForTapeSec(chip.lead + fromSec * S.playRate)}});
  chipStreamPump(S.audio.currentTime);
}

// rate cancels: chunkFrames/rate == CHIP_STREAM_CHUNK_SEC

// {id, kind, files, shared, own, v, bytes, libs, secs, rate} -> a Promise of
// {tracks, seconds, sampleRate, frames, leadSec} (ready) or {error}. Mirrors
// chipRenderInWorker's own lifecycle (one worker at a time in `chipWorker`,
// terminated on a song change, previews answered the same way afterward) —
// the difference is the message shape posted ({stream} instead of the whole
// payload) and that this worker KEEPS running after "ready": {chunk}/
// {silent} replies to later {want}/{idle} calls land on the SAME onmessage,
// installed once, for the rest of this song's stream session.
export function chipStreamOpenWorker(kind, src, secs, rate, forKey, budget) {
  return new Promise(resolve => {
    if (S.chipWorker) { try { S.chipWorker.terminate(); } catch (err) { /* gone */ } S.chipWorker = null; }
    let w, workerUrl;
    try { workerUrl = new URL("tools/chip-worker.mjs?v=" + Date.now(), S.APP_BASE).href; w = new Worker(workerUrl, {type: "module"}); }
    catch (err) { chipWorkerAvailable.broken = true; console.warn("[chip] no module worker (" + workerUrl + "): " + err.message + " — stream mode unavailable this render"); return resolve({error: String(err && err.message || err)}); }
    S.chipWorker = w;
    const c = CHIPS[kind];
    let settled = false;
    const watch = setInterval(() => { if (S.songKey !== forKey) finish({error: "stale render: " + forKey.split("/").pop()}); }, 250); // a song change ends this attempt at once, same as chipRenderInWorker
    const finish = out => {
      if (settled) return; settled = true;
      clearInterval(watch);
      if (!out || out.error) { if (S.chipWorker === w) S.chipWorker = null; try { w.terminate(); } catch (err) { /* gone */ } }
      else w.__key = forKey; // kept alive afterward for previews, same as a finished whole render
      resolve(out);
    };
    w.onmessage = e => { // installed once; handles the open reply AND every later {chunk}/{silent}/{preview} for this session's whole life
      const m = e.data || {};
      if (m.preview) { const cb = chipPreviewPending.get(m.preview.req); chipPreviewPending.delete(m.preview.req); if (cb) cb(m.preview); return; }
      if (m.ready) { finish(m.ready); return; }
      if (m.stream && m.stream.error) { finish({error: m.stream.error}); return; }
      if (m.chunk) { chipStreamOnChunk(m.chunk); return; }
      if (m.silent) { chipStreamOnSilent(m.silent); return; }
    };
    w.onerror = err => finish({error: String(err && err.message || "worker error")});
    const bytes = src.bytes instanceof Uint8Array ? src.bytes.slice() : new Uint8Array(src.bytes).slice(); // a copy: the record keeps its own
    const libs = {}, transfer = [bytes.buffer];
    for (const [name, b] of Object.entries(src.libs || {})) { const c2 = b instanceof Uint8Array ? b.slice() : new Uint8Array(b).slice(); libs[name] = c2; transfer.push(c2.buffer); }
    w.postMessage({stream: {id: forKey, kind, files: c.files, shared: c.shared || [], own: c.own || [], v: "?v=" + Date.now(), bytes, libs, secs, rate,
      chunkFrames: CHIP_STREAM_CHUNK_SEC * rate, overlap: CHIP_STREAM_OVERLAP, budget}}, transfer);
  });
}

// Entry point for chip.renderPromise (replaces a bare chipRender() call):
// stream mode first when the switch is on, the existing whole-render path
// otherwise OR as the fallback from any stream failure — exactly the
// behavior before this step when the switch is off. chipStreamOpen resolves
// once {ready} has arrived AND the first window (the chunks covering the
// play-from position, +1) is cached, so playGate/album-play's wait on
// chip.renderPromise sees the same "worth waiting for" contract either path.
// `auto` (step 5): asks the worker for the hypothetical whole-render plan
// (a `budget` on the {stream} request) and, once {ready} answers, keeps this
// session only when that plan would downgrade or refuse — otherwise it
// terminates the worker it just opened and returns false, same shape as any
// other "fall back to chipRender()" exit (chipRenderAuto, below). Always one
// logDebug line either way, naming the song and the reason.
export async function chipStreamOpen(auto) {
  const forKey = S.songKey;
  const src = await chipSource();
  if (!src) return false;
  const kind = src.chip || "nsf";
  const secs = Math.ceil(src.secs + 1);
  const rate = CHIPS[kind].renderRate || (S.audio ? S.audio.sampleRate : 44100);
  const budget = auto ? chipRenderBudget() : undefined; // only "auto" needs the hypothetical whole-render plan back
  const w = await chipStreamOpenWorker(kind, src, secs, rate, forKey, budget);
  if (S.songKey !== forKey) return false; // stale: a later song is open now
  if (!w || w.error) { logDebug("chip stream: " + (w && w.error || "no worker") + " — falling back to the whole render"); return false; }
  if (auto) {
    const willStream = chipAutoShouldStream(w.plan, rate);
    logDebug(songTitleOf(forKey) + ": " + (willStream ? "streaming" : "whole") + " — " + chipAutoReason(w.plan, rate));
    if (!willStream) { // this song wouldn't downgrade/refuse under the whole path: leave it alone, same as "off"
      if (S.chipWorker) { try { S.chipWorker.terminate(); } catch (err) { /* gone */ } S.chipWorker = null; }
      return false;
    }
  }
  chip.stream = {
    key: forKey, gen: 0, rate: w.sampleRate, chunkFrames: CHIP_STREAM_CHUNK_SEC * w.sampleRate, overlap: CHIP_STREAM_OVERLAP,
    tracks: w.tracks, seconds: w.seconds, frames: w.frames, leadSec: w.leadSec,
    silent: new Set(), cache: new Map(), pinnedIdx: new Set(), scheduled: new Map(), waiters: new Map(),
    bytes: 0, peakBytes: 0, live: false, srcs: [],
  };
  chip.lead = w.leadSec; chip.key = forKey; chip.buffers = null; chip.pcm = null; chip.pan = null;
  const fromSec = (typeof S.song !== "undefined" && S.song && typeof S.playCursor !== "undefined" && S.playCursor > 0) ? tickToSec(S.song, S.playCursor) : 0;
  const idx0 = chipStreamIdxForTapeSec(chip.lead + fromSec * S.playRate);
  // the song gain's measurement: album.json's, else this device's cache, else
  // the chunks as they arrive in order from here (loudStreamChunk)
  const pend = chipLoudPending(forKey, src), cached = loudCacheGet(pend.cacheKey);
  chip.kind = kind;
  chip.loud = pend.loud && pend.loud.v === LOUD_VERSION ? {...pend.loud, src: "album"} : cached ? {...cached, src: "cache"} : null;
  chip.stream.loudAcc = chip.loud ? null : {next: idx0, parts: [], secs: 0, cacheKey: pend.cacheKey};
  chipStreamRequestRange(idx0, idx0 + 1);
  await chipStreamWaitFor(idx0);
  if (S.songKey !== forKey || !chip.stream || chip.stream.key !== forKey) return false; // superseded while waiting
  if (S.chipWorker) S.chipWorker.postMessage({idle: {id: forKey}}); // one state-only sweep so an all-silent track re-enables synth promptly, not only after it happens to fall inside a rendered window
  console.log("[chip] stream ready: " + forKey + " — playing the console's own sound (stream mode)");
  return true;
}
export async function chipRenderAuto() { // chip.renderPromise's entry point — see chipStreamOpen's own comment
  const mode = chipStreamMode();
  if (mode === "on" || mode === "auto") {
    const ok = await chipStreamOpen(mode === "auto");
    if (ok) return true;
  }
  return chipRender();
}
