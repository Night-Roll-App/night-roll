import { S } from "../state.js";
import { chip } from "./chip.js";
import { chipBuffers } from "./chip.js";
import { chipPartSrc } from "./chip.js";
import { chipPartTrack } from "./chip.js";
import { chipStopSrcs } from "./chip.js";
import { chipActive } from "./chip.js";
import { keepPitch } from "./clips.js";
import { stretchChunkInWorker } from "./clips.js";
import { stretchCache } from "./clips.js";
import { stretchEnsureAll } from "./clips.js";
import { playSec } from "./transport.js";
import { stop } from "./transport.js";
import { play } from "./transport.js";
import { chipSegments } from "./chip-stream.js";
import { chipStreamIdxForTapeSec } from "./chip-stream.js";
import { chipLoopPinRanges } from "./chip-stream.js";
import { CHIP_STREAM_CHUNK_SEC } from "./chip-stream.js";
import { CHIP_STREAM_HORIZON_VISIBLE } from "./chip-stream.js";
import { CHIP_STREAM_HORIZON_HIDDEN } from "./chip-stream.js";
import { CHIP_STREAM_ANCHOR_TOL } from "./chip-stream.js";
import { CHIP_STREAM_PIN_LOOKAHEAD } from "./chip-stream.js";

// ------------------------------------- console audio keeps its pitch -----
// Josh (ear report 2026-10-25, 2026-11-27): slowing a GAME song lowered it —
// chip audio was tape-style (playbackRate = the slider). Native keeps pitch
// (AVAudioUnitTimePitch); here the render is time-stretched with the SAME
// WSOLA the recordings use (clips.js wsolaStretch / wsolaChunk), 2 s of tape
// at a time ahead of the playhead, in the stretch worker, cached per chunk —
// so a 3-minute song never waits on a whole-song render and never holds a
// whole stretched copy (the iPad's memory). Both paths: the whole render
// (chipKpStart/chipKpPump replace chipStart's native-loop source and
// chipSeamPump while the speed is off 100 %) and stream mode (chipStreamPump
// asks chipKpBuffers for a cached raw chunk's stretched copy). At 100 %, or
// with the recording sheet's tape-style toggle on (keepPitch() false — the
// same device pref, ff1roll-tapestyle, now governs console audio too), none
// of this runs: chip.kp stays null and the old code paths are untouched.
// Plan: docs/plans/2026-11-27-web-chip-keep-pitch.md.
//
// Geometry. Raw chunk k = tape frames [k·C, (k+1)·C), C = CHIP_STREAM_CHUNK_SEC
// × the render's sample rate (the stream worker's own chunking, so one index
// serves both paths). Stretched chunk k = stretched frames [M(k), M(k+1) + E),
// M(k) = round(k·C / rate): its own span plus an E-frame tail fading out,
// while its first E frames fade in (k > 0) — complementary ramps over the
// SAME grains (wsolaChunk carries the grain chain from chunk to chunk), so
// adjacent chunks sum back to one continuous signal, exactly the shape the
// stream worker's raw chunks have (C + O frames, fades baked in). Placement
// is by absolute stretched frame: tape seconds ÷ rate = stretched seconds,
// the identity scheduleClip already relies on, so a sample of stretched chunk
// k at index m sounds at song second (m·rate/sr − lead)/rate — the cursor's
// own clock. No latency to compensate (unlike native's real-time unit): the
// stretch runs ahead of the playhead, a late chunk joins from the current
// position like a late stream chunk does.
export const CHIP_KP_FADE = 256;
// E: stretched frames of complementary ramp between adjacent chunks
export const CHIP_KP_CACHE_BYTES = 64 * 1024 * 1024;
// stretched chunks kept beyond the loop-start pins and the two under/after the playhead; the farthest-ahead go first
export const CHIP_KP_FRAME = 1024;
export const CHIP_KP_HOP = 512;
export const CHIP_KP_TOL = 128;
// wsolaChunk's own grain geometry (clips.js) — kpRawRange sizes the raw window it reads from these
export const CHIP_KP_FIRST_WAIT_MS = 1500;
// play() waits this long at most for the first chunk (a Mac stretches 2 s of one track in ~15 ms)

export function chipKeepPitch() { return S.playRate !== 1 && keepPitch(); }
// The device pref behind keepPitch() (clips.js, ff1roll-tapestyle absent =
// pitch kept) — ONE switch for takes and console audio: the recording sheet,
// Settings › Other and Ask set_pref keep_pitch all land here. A running play
// restarts in place so the change is heard at once.
export function setKeepPitch(on) {
  try { if (on) localStorage.removeItem("ff1roll-tapestyle"); else localStorage.setItem("ff1roll-tapestyle", "1"); } catch (err) { /* private mode: session only */ }
  const at = S.playing ? playSec() : null;
  if (at !== null) stop(); // first, while chip.kp still names the stretched sources chipStopSrcs must stop (review: nulled first, they played on under the restart)
  stretchCache.clear(); chip.kp = null;
  if (at !== null) play(at, {noCountIn: true}).catch(() => {}); else stretchEnsureAll();
}
export function kpM(k, rate, C) { return Math.round(k * C / rate); } // stretched frame where chunk k starts
// raw frames wsolaChunk may read for stretched output [m0, m1 + e): every
// candidate grain (±tol around round(m·rate)) and every "natural
// continuation" read (the previous grain + hop — up to hop past the last
// candidate when rate < 1), with a few frames of slack. Two chunks computing
// the same straddling grain must see the same raw at every read, or their
// choices differ and the join clicks; a read outside the window is NaN.
export function kpRawRange(m0, m1, e, rate) {
  return {from: Math.floor((m0 - CHIP_KP_FRAME - CHIP_KP_HOP) * rate - CHIP_KP_TOL) - 4, to: Math.ceil((m1 + e) * rate + CHIP_KP_TOL + CHIP_KP_FRAME + CHIP_KP_HOP) + 4};
}
// Where stretched chunk `idx` plays for a chipSegments segment, in CONTEXT
// seconds (`anchor`: where its first frame would sound, past for the chunk
// under the playhead) and stretched-buffer seconds (`offset` into the chunk
// for a mid-chunk resume, `dur` to the segment's end — a loop wrap / album
// end trims the last chunk, a hard splice as in stream mode).
export function chipKpPlace(seg, idx, rate, sr) {
  const C = Math.round(CHIP_STREAM_CHUNK_SEC * sr);
  const startS = kpM(idx, rate, C) / sr, fromS = seg.tapeFrom / rate, toS = seg.tapeTo / rate;
  return {anchor: seg.when + (startS - fromS), offset: Math.max(0, fromS - startS), dur: Math.max(0, toS - Math.max(fromS, startS))};
}
export function kpMakeBuffer(channels, length, sr) { // context-agnostic when the engine allows (chipStreamOnChunk's own move), else the live context's
  try { if (typeof AudioBuffer === "function") return new AudioBuffer({numberOfChannels: channels, length: Math.max(1, length), sampleRate: sr}); } catch (err) { /* falls through */ }
  return S.audio.createBuffer(channels, Math.max(1, length), sr);
}
// A zero-padded window of one channel's raw frames [from, to) out of a whole
// render buffer (frames outside [0, N) read as silence: before the lead, past
// the song's end).
export function kpWindowOf(data, from, to) {
  const w = new Float32Array(to - from), a = Math.max(0, from), b = Math.min(data.length, to);
  if (b > a) w.set(data.subarray(a, b), a - from);
  return w;
}
// The same window out of the stream cache: chunks k−1, k, k+1 summed where
// they overlap — their complementary fades (tools/chip-worker.mjs fadeWeights)
// add back to the untouched raw. A missing neighbour leaves its faded edge
// as is (a seek's first chunk fades in over 6 ms, as it does today).
export function kpStreamWindowOf(st, idx, name, ch, from, to) {
  const w = new Float32Array(to - from), C = st.chunkFrames;
  for (let k = idx - 1; k <= idx + 1; k++) {
    const ent = st.cache.get(k), buf = ent && ent.buffers[name];
    if (!buf || ch >= buf.numberOfChannels) continue;
    const data = buf.getChannelData(ch), a = Math.max(from, k * C), b = Math.min(to, k * C + data.length);
    for (let f = a; f < b; f++) w[f - from] += data[f - k * C];
  }
  return w;
}
// The session for this song × rate × path, made (or kept: a replay reuses its
// stretched chunks, as the stream cache does) by chipKpStart/chipStreamStart.
// mode "whole": raw from chipBuffers(); "stream": raw from chip.stream.cache.
export function chipKpOpen(mode) {
  const sr = mode === "stream" ? chip.stream.rate : (chip.pcmRate || (S.audio && S.audio.sampleRate) || 44100);
  const kp = chip.kp;
  if (kp && kp.key === S.songKey && kp.rate === S.playRate && kp.mode === mode && kp.sr === sr) return kp;
  chip.kp = {key: S.songKey, rate: S.playRate, mode, sr, cache: new Map(), srcs: [], scheduled: new Map(), pinnedIdx: new Set(), live: false, bytes: 0, peakBytes: 0};
  return chip.kp;
}
export function chipKpChunkNames(kp, idx) { // tracks a chunk has raw for — and that would sound (chipPartSrc's own test), so a part with no roll track or an explicit synth voice costs nothing
  const sounds = name => { const ti = kp.mode === "stream" ? S.song.tracks.findIndex(tr => (tr.name || "") === name) : chipPartTrack(name); return ti >= 0 && (!S.song.tracks[ti].voice || S.song.tracks[ti].voice === "auto"); };
  if (kp.mode === "stream") { const ent = chip.stream && chip.stream.cache.get(idx); return ent ? Object.keys(ent.buffers).filter(sounds) : null; }
  return Object.keys(chipBuffers()).filter(sounds);
}
export function chipKpRawChannel(kp, idx, name, ch, from, to) { // the window for one channel, or null when the chunk's raw is not there
  if (kp.mode === "stream") return kpStreamWindowOf(chip.stream, idx, name, ch, from, to);
  const buf = chipBuffers()[name];
  if (!buf || ch >= buf.numberOfChannels) return null;
  return kpWindowOf(buf.getChannelData(ch), from, to);
}
export function chipKpChannels(kp, idx, name) {
  const buf = kp.mode === "stream" ? (chip.stream.cache.get(idx) || {buffers: {}}).buffers[name] : chipBuffers()[name];
  return buf ? buf.numberOfChannels : 0;
}
// Stretches chunk `idx` (every track) in the worker. The chain: `prevIn` is
// the predecessor's `next` when that chunk is stretched, else a fresh start
// (chipKpWant only posts a chunk whose predecessor is ready or not wanted).
export function chipKpPost(kp, idx, pump) {
  const C = Math.round(CHIP_STREAM_CHUNK_SEC * kp.sr), rate = kp.rate;
  const m0 = kpM(idx, rate, C), m1 = kpM(idx + 1, rate, C), e = CHIP_KP_FADE;
  const {from, to} = kpRawRange(m0, m1, e, rate);
  const names = chipKpChunkNames(kp, idx);
  if (!names) return false;
  const prevEnt = kp.cache.get(idx - 1);
  const ent = {status: "pending", buffers: {}, next: {}, prev: {}, bytes: 0, left: 0, pinned: kp.pinnedIdx.has(idx)};
  kp.cache.set(idx, ent);
  for (const name of names) {
    const chans = chipKpChannels(kp, idx, name);
    if (!chans) continue;
    const l = chipKpRawChannel(kp, idx, name, 0, from, to), r = chans > 1 ? chipKpRawChannel(kp, idx, name, 1, from, to) : null;
    if (!l) continue;
    const prevIn = prevEnt && prevEnt.status === "ready" && prevEnt.next[name] !== undefined ? prevEnt.next[name] : null;
    ent.prev[name] = prevIn; ent.left++;
    stretchChunkInWorker(l, r, rate, {base: from, m0, m1, e, fadeIn: idx > 0, prevIn}).then(res => {
      if (kp.cache.get(idx) !== ent || chip.kp !== kp) return; // evicted, or the rate moved on
      const buf = kpMakeBuffer(res.aux ? 2 : 1, res.out.length, kp.sr);
      buf.copyToChannel(res.out, 0); if (res.aux) buf.copyToChannel(res.aux, 1);
      ent.buffers[name] = buf; ent.next[name] = res.next; ent.bytes += res.out.byteLength * (res.aux ? 2 : 1);
      if (--ent.left > 0) return;
      ent.status = "ready";
      kp.bytes = 0; for (const x of kp.cache.values()) kp.bytes += x.bytes; kp.peakBytes = Math.max(kp.peakBytes, kp.bytes);
      kp.chunkBytes = Math.max(kp.chunkBytes || 0, ent.bytes); // what one chunk costs: the pin trim (chipKpPinSet) sizes itself by this
      chipKpCoherence(kp, idx, ent);
      if (chip.kp === kp && pump) pump(S.audio.currentTime); // a chunk the playhead is about to reach must not wait for the next tick (the pumps gate on `playing` themselves; the bounce's chain continues here)
    }).catch(() => { if (kp.cache.get(idx) === ent) kp.cache.delete(idx); });
  }
  if (!ent.left) { // no raw for any track here
    if (kp.mode !== "stream") { kp.cache.delete(idx); return false; } // whole render: chipBuffers() is {} before the tap makes the context — nothing to cache, nothing to call live (review item 6)
    ent.status = "ready"; // a stream's silent stretch: nothing to play, the chain goes on fresh
  }
  return true;
}
// A successor stretched on a fresh chain before this chunk existed (a seek
// backwards) would meet it with a different grain choice at the join: redo it
// from this chunk's state — unless it is already sounding, where one join
// click beats a restart.
export function chipKpCoherence(kp, idx, ent) {
  const nxt = kp.cache.get(idx + 1);
  if (!nxt || nxt.status !== "ready" || kp.scheduled.has(idx + 1)) return;
  for (const name of Object.keys(nxt.prev)) if (nxt.prev[name] !== (ent.next[name] === undefined ? null : ent.next[name])) { kp.cache.delete(idx + 1); return; }
}
// `wanted`: chunk indices in PLAY order for this tick's horizon. A chunk is
// posted once its predecessor is ready (chain) or not wanted at all (a fresh
// start: the first chunk after a seek, the far side of a loop wrap). In
// stream mode a chunk also waits for its successor's raw (its tail grains
// read into it; computed once from a faded edge plus silence and once, by
// the successor, from the full raw, the two renderings of the join would
// not sum — review item 3) unless it is segment-final (`finals`: its tail
// is trimmed by dur) or the song's last chunk.
export function chipKpWant(kp, wanted, pump, finals = new Set()) { // true when a job was posted
  const want = new Set(wanted);
  let posted = false;
  for (let i = 0; i < wanted.length; i++) {
    const idx = wanted[i];
    if (kp.cache.has(idx)) continue;
    const prev = kp.cache.get(idx - 1);
    if (want.has(idx - 1) && (!prev || prev.status !== "ready")) continue; // chained: its turn comes when the predecessor lands
    if (kp.mode === "stream") {
      const st = chip.stream;
      if (!st.cache.has(idx)) continue;
      const last = st.frames ? chipStreamIdxForTapeSec((st.frames - 1) / st.rate) : Infinity;
      if (!finals.has(idx) && idx < last && !st.cache.has(idx + 1)) continue;
    }
    if (chipKpPost(kp, idx, pump)) posted = true;
  }
  return posted;
}
export function chipKpScheduled(kp, idx, anchor) { const a = kp.scheduled.get(idx); return !!a && a.some(x => Math.abs(x - anchor) < CHIP_STREAM_ANCHOR_TOL); }
export function chipKpBuffers(kp, idx) { const ent = kp.cache.get(idx); return ent && ent.status === "ready" ? ent.buffers : null; }
// The chunks a loop wrap lands in, pinned against eviction (chipLoopPinRanges:
// loop start + CHIP_STREAM_PIN_LOOKAHEAD, or a short seam's whole spans) —
// unless the pins alone would overrun the byte cap (a PS2 stereo seam at
// 50 %: over 100 MB), where each span keeps only its first chunks (review
// items 2/5). Sized by the biggest chunk seen so far.
export function chipKpPinSet(kp, ranges) {
  const perSpan = Math.ceil(CHIP_STREAM_PIN_LOOKAHEAD / CHIP_STREAM_CHUNK_SEC) + 1;
  const build = trim => { const s = new Set(); for (const [a, b] of ranges) for (let i = a; i <= (trim ? Math.min(b, a + perSpan - 1) : b); i++) s.add(i); return s; };
  const full = build(false);
  return full.size * (kp.chunkBytes || 0) > CHIP_KP_CACHE_BYTES ? build(true) : full;
}
// Drops stretched chunks behind the playhead (never a pinned one, never one
// this tick still wants — the far side of a coming loop wrap sits behind the
// playhead — never the chunk under it or the next), then the farthest-ahead
// ones nobody wants while the cache is over its byte cap — the horizon
// shrinks on a huge song, memory does not. `scheduled` anchors go only with
// chunks behind the playhead: a wanted chunk's sources are live, and
// forgetting its anchor would start it again (review item 2).
export function chipKpEvict(kp, curTapeSec, wanted = []) {
  const curIdx = chipStreamIdxForTapeSec(curTapeSec), want = new Set(wanted);
  for (const [idx, ent] of kp.cache) { ent.pinned = kp.pinnedIdx.has(idx); if (!ent.pinned && !want.has(idx) && idx < curIdx - 1) kp.cache.delete(idx); }
  for (const idx of kp.scheduled.keys()) if (idx < curIdx - 1 && !kp.pinnedIdx.has(idx) && !want.has(idx)) kp.scheduled.delete(idx);
  let bytes = 0; for (const x of kp.cache.values()) bytes += x.bytes;
  const ahead = [...kp.cache.keys()].filter(i => !kp.pinnedIdx.has(i) && !want.has(i) && i > curIdx + 1).sort((a, b) => b - a);
  for (const idx of ahead) { if (bytes <= CHIP_KP_CACHE_BYTES) break; bytes -= kp.cache.get(idx).bytes; kp.cache.delete(idx); }
  kp.bytes = bytes;
}
// ---- the whole-render path --------------------------------------------
// Replaces chipStart's native-loop source (and chipSeamPump) while the speed
// is off 100 % with pitch kept: play() calls this, its pump calls chipKpPump
// first every tick, the same shape as stream mode.
export function chipKpStart(fromSec) {
  chipStopSrcs();
  const kp = chipKpOpen("whole");
  kp.scheduled = new Map(); kp.live = false;
  chipKpPump(S.audio.currentTime);
}
// Before play() starts the transport: the chunk under `fromSec` (and the
// next) stretched, so beat 1 is the console's, not the synth's — the same
// contract chipStreamOpen's first window gives stream mode. Resolves early
// when nothing needs doing; never waits past the cap.
export function chipKpWaitFirst(fromSec, capMs = CHIP_KP_FIRST_WAIT_MS) {
  if (!chipActive() || chip.stream || !chipKeepPitch()) return Promise.resolve();
  const kp = chipKpOpen("whole");
  const idx0 = chipStreamIdxForTapeSec(chip.lead + fromSec * S.playRate);
  chipKpWant(kp, [idx0, idx0 + 1], () => {});
  if (chipKpBuffers(kp, idx0)) return Promise.resolve();
  return new Promise(res => {
    const t0 = Date.now();
    const t = setInterval(() => { if (chip.kp !== kp || chipKpBuffers(kp, idx0) || Date.now() - t0 >= capMs) { clearInterval(t); res(); } }, 10);
  });
}
export function chipKpPump(nowCtx) {
  const kp = chip.kp;
  if (!S.playing || !kp || kp.mode !== "whole" || kp.key !== S.songKey || kp.rate !== S.playRate || !chipKeepPitch() || !chipActive()) return; // chipActive: "Hear the MIDI" flipped mid-song leaves the session but silences it, as chipStart's sources are stopped
  const horizon = (typeof document !== "undefined" && document.hidden) ? CHIP_STREAM_HORIZON_HIDDEN : CHIP_STREAM_HORIZON_VISIBLE;
  const until = nowCtx + horizon;
  const curSec = playSec();
  const t0 = Math.max(nowCtx, S.playT0); // before playT0 (a count-in) playSec holds at playOffset: the first segment starts AT playT0
  const albumEndRel = S.albumEndAbs === null ? null : S.albumEndAbs - (t0 - S.playT0);
  const segs = chipSegments(curSec, S.loopSeg, S.playRate, chip.lead, albumEndRel, t0, t0 - S.playT0);
  const wanted = [];
  for (const seg of segs) {
    if (seg.when >= until) break;
    const idxFrom = chipStreamIdxForTapeSec(seg.tapeFrom), idxTo = chipStreamIdxForTapeSec(Math.max(seg.tapeFrom, seg.tapeTo - 1e-9));
    for (let idx = idxFrom; idx <= idxTo; idx++) {
      const {anchor, offset, dur} = chipKpPlace(seg, idx, S.playRate, kp.sr);
      const when = Math.max(seg.when, anchor);
      if (when >= until) continue; // this tick's window doesn't reach it yet
      wanted.push(idx);
      const buffers = chipKpBuffers(kp, idx);
      if (!buffers || chipKpScheduled(kp, idx, anchor)) continue;
      for (const [name, buffer] of Object.entries(buffers)) {
        const src = chipPartSrc(name, buffer, 1); // the stretched copy runs at 1: pitch kept
        if (!src) continue;
        const startAt = Math.max(when, S.audio.currentTime + 0.003);
        if (dur > 0) src.start(startAt, offset, dur); else src.start(startAt, offset);
        src.onended = () => { const i = kp.srcs.indexOf(src); if (i >= 0) kp.srcs.splice(i, 1); };
        kp.srcs.push(src);
        kp.live = true; // only a source that really started mutes the synth (review item 6: an empty chunk is not console audio)
      }
      const a = kp.scheduled.get(idx); if (a) a.push(anchor); else kp.scheduled.set(idx, [anchor]);
    }
  }
  kp.pinnedIdx = chipKpPinSet(kp, chipLoopPinRanges(S.loopSeg, S.playRate, chip.lead));
  chipKpWant(kp, wanted, chipKpPump);
  chipKpEvict(kp, chip.lead + curSec * S.playRate, wanted);
}
// ---- stream mode -------------------------------------------------------
// chipStreamPump's keep-pitch half: the stretched buffers for raw chunk `idx`
// (null until the worker has them — the pump records nothing for that
// anchor and retries next tick), then the chunks it will want, in play order.
export function chipKpStreamBuffers(idx) { const kp = chipKpOpen("stream"); return chipKpBuffers(kp, idx); }
export function chipKpStreamWant(wanted, pump, curTapeSec, finals) {
  const kp = chipKpOpen("stream");
  kp.pinnedIdx = chipKpPinSet(kp, chipLoopPinRanges(S.loopSeg, S.playRate, chip.lead)); // the raw cache's own pins, trimmed to the stretched cap where they would overrun it
  chipKpWant(kp, wanted, pump, finals);
  chipKpEvict(kp, curTapeSec, wanted);
}
// ---- Download audio (offline bounce) ----------------------------------
// The offline render has no pump, and its graph exists only inside
// renderSongOffline's synchronous sweep, so every chunk of the one pass is
// stretched BEFORE the sweep (chipKpPrepareAll: the chain continues from each
// chunk's own completion, no time cap, progress on the status line) and held
// until chipKpScheduleAll places them. Holding a whole stretched song is the
// memory cost of that; a render whose stretched copy would pass
// CHIP_KP_BOUNCE_BYTES is not attempted — the download is tape-style for it
// and the status line says so (review item 4).
export const CHIP_KP_BOUNCE_BYTES = 160 * 1024 * 1024;
export function chipKpBounceBytes() { // the stretched copy's size for the whole render at this rate
  let n = 0;
  for (const buf of Object.values(chipBuffers())) n += buf.length * buf.numberOfChannels * 4;
  return n / S.playRate;
}
export function chipKpPrepareAll(endSec, progress = () => {}) { // resolves true when every chunk is ready, false when the bounce must fall back to tape-style
  if (!chipActive() || chip.stream || !chipKeepPitch()) return Promise.resolve(false);
  if (chipKpBounceBytes() > CHIP_KP_BOUNCE_BYTES) return Promise.resolve(false);
  const kp = chipKpOpen("whole");
  const idx0 = chipStreamIdxForTapeSec(chip.lead), idx1 = chipStreamIdxForTapeSec(chip.lead + endSec * S.playRate);
  const all = []; for (let i = idx0; i <= idx1; i++) all.push(i);
  kp.pinnedIdx = new Set(all); // nothing is evicted under a bounce
  return new Promise(res => {
    const step = () => {
      if (chip.kp !== kp) return res(false); // the song or the rate moved on
      const ready = all.filter(i => chipKpBuffers(kp, i)).length;
      progress(ready / all.length);
      if (ready === all.length) return res(true);
      if (!chipKpWant(kp, all, step) && !all.some(i => { const e = kp.cache.get(i); return e && e.status === "pending"; })) res(false); // nothing posted and nothing in flight: no raw to stretch
    };
    step();
  });
}
export function chipKpScheduleAll(endSec) { // true when every chunk of the pass was placed; false (nothing placed) when one is missing, so the caller can fall back whole
  const kp = chip.kp;
  if (!kp || kp.mode !== "whole") return false;
  const seg = {when: 0, tapeFrom: chip.lead, tapeTo: chip.lead + endSec * S.playRate};
  const idx0 = chipStreamIdxForTapeSec(seg.tapeFrom), idx1 = chipStreamIdxForTapeSec(Math.max(seg.tapeFrom, seg.tapeTo - 1e-9));
  for (let idx = idx0; idx <= idx1; idx++) if (!chipKpBuffers(kp, idx)) return false;
  for (let idx = idx0; idx <= idx1; idx++) {
    const {anchor, offset, dur} = chipKpPlace(seg, idx, S.playRate, kp.sr);
    for (const [name, buffer] of Object.entries(chipKpBuffers(kp, idx))) {
      const src = chipPartSrc(name, buffer, 1);
      if (!src) continue;
      src.start(Math.max(0, anchor), offset, dur);
    }
  }
  chip.kp = null; // the whole song's chunks were pinned for the bounce: the next play rebuilds the lean cache
  return true;
}
