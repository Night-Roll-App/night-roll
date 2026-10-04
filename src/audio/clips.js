import { S } from "../state.js";
import { secToTick } from "../midi/parse.js";
import { tickToSec } from "../midi/parse.js";
import { idbAudioGet } from "../platform/storage.js";
import { readData } from "../platform/folder.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { effTs } from "../model/grid.js";
import { clipLen } from "../model/song.js";
import { pushUndo } from "../model/edits.js";
import { annoSnapshot } from "../model/edits.js";
import { tombstone } from "../model/edits.js";
import { audioDirText } from "../model/rollnotes.js";
import { setAnchorBQ } from "../hooks.js";
import { resolveNote } from "../model/rollnotes.js";
import { deriveNoteTypes } from "../model/rollnotes.js";
import { finalizeNotes } from "../hooks.js";
import { saveLocalNotes } from "../model/edits.js";
import { computeSongEnd } from "../model/song.js";
import { buildSchedule } from "./transport.js";
import { draw } from "../hooks.js";
import { clipEndTick } from "../model/song.js";
import { setInfo } from "../hooks.js";
import { playSec } from "./transport.js";
import { trackGain } from "./engine.js";
import { isComposition } from "../model/provenance.js";
import { isLocalDraft } from "../model/edits.js";
import { ownFolderPath } from "../model/provenance.js";
import { addTrackUndoable } from "../model/edits.js";
import { playGateKick } from "./transport.js";
import { fmtBarBeat } from "../gen/drummer.js";
import { barTicks } from "../model/rollnotes.js";
import { stop } from "./transport.js";
import { play } from "./transport.js";
import { updateSubtitle } from "../hooks.js";
import { clipLabel } from "../render/tracks.js";

// ---------------------------------------------------- audio tracks (clips)
// A recording as a track (Josh's son, 2026-09-15: "I wouldn't use it unless
// it supported waves"). Design + advisor review: docs/design/wave-tracks-design.md.
// The track itself is an ordinary empty track in the .mid; the "audio:"
// annotation names it and gives it ONE clip (file, bar.beat anchor, offset),
// derived here at finalizeNotes exactly as voice/color are. The bytes live in
// this device's IndexedDB until Save, then beside the .mid in
// <song>.audio/<file> (folder or repo). Playback is one buffer source per
// pass through the ordinary scheduler — chip audio's model, generalized.
export const audioBufCache = new Map();
// live buffer sources: stop() must kill them (MIDI nodes die on their own, a 3-min clip does not)
export const PEAK_BUCKET = 256;
// samples per min/max pair (~3 min = 31k pairs)
export function audioDirFor(key) { return (key || "").replace(/\.midi?$/i, "") + ".audio"; }
export function audioCacheKey(file) { return S.songKey + "|" + file; }
export function clipClamp(d, ...limits) { for (const l of limits) if (l < d) d = l; return d; }
export function forEachClip(fn) { // fn(clip, ti, ci)
  if (!S.song) return;
  S.song.tracks.forEach((tr, ti) => { if (tr.kind === "audio") tr.clips.forEach((c, ci) => fn(c, ti, ci)); });
}
export async function audioBytesFor(key, file) { // {bytes, where} or null
  const rec = await idbAudioGet(key + "|" + file);
  if (rec && rec.bytes) return {bytes: rec.bytes, where: "device"};
  try {
    const r = await readData("songs", audioDirFor(key) + "/" + file);
    if (r.ok) return {bytes: await r.arrayBuffer(), where: r.fromFolder ? "folder" : "repo"};
  } catch (err) { /* offline */ }
  return null;
}
// decode WITHOUT the main AudioContext: an OfflineAudioContext needs no user
// gesture (the main context can't be built at page load — see
// sfPreloadForSong), and an AudioBuffer plays in any context. Downmixed to
// mono inside the callback so the stereo copy never outlives it (~63MB for a
// 3-minute WAV on the iPad).
export function decodeAudioBytes(bytes) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return Promise.reject(new Error("no audio decoder"));
  const oac = new OAC(1, 1, 48000);
  return new Promise((res, rej) => oac.decodeAudioData(bytes.slice(0), b => {
    const len = b.length, chs = b.numberOfChannels || 1;
    const mono = oac.createBuffer(1, len, b.sampleRate);
    const out = mono.getChannelData(0);
    for (let c = 0; c < chs; c++) {
      const src = b.getChannelData(c);
      if (c === 0) out.set(src); else for (let i = 0; i < len; i++) out[i] += src[i];
    }
    if (chs > 1) for (let i = 0; i < len; i++) out[i] /= chs;
    res({buffer: mono, peaks: peaksOf(out), dur: b.duration});
  }, err => rej(err || new Error("decode failed"))));
}
export function peaksOf(data) { // min/max per bucket, interleaved
  const nb = Math.ceil(data.length / PEAK_BUCKET);
  const out = new Float32Array(nb * 2);
  for (let k = 0; k < nb; k++) {
    let lo = 1, hi = -1;
    const end = Math.min(data.length, (k + 1) * PEAK_BUCKET);
    for (let i = k * PEAK_BUCKET; i < end; i++) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    out[k * 2] = lo; out[k * 2 + 1] = hi;
  }
  return out;
}
export function clipOnsetSec(c) { // seconds into the file where sound starts (first peak bucket over the floor), or null
  if (!c.peaks || !c.buffer) return null;
  const nb = c.peaks.length / 2;
  let k = 0;
  while (k < nb && Math.max(-c.peaks[k * 2], c.peaks[k * 2 + 1]) < 0.02) k++;
  return +Math.min(c.dur, k * PEAK_BUCKET / c.buffer.sampleRate).toFixed(3);
}
// freshly imported clips: trim the lead-in once they decode
// Tempo from a take (Josh, 2026-09-16: Logic's "set the song's tempo from the
// wave"). Level 1: ONE steady tempo. The lane's peaks (min/max per 256
// samples, ~5 ms) become an onset curve (rises in the envelope); its
// autocorrelation over 40–240 BPM picks the strongest period, weighted
// toward the 60–180 range a detector otherwise confuses with its half or
// double. Nothing is written until a candidate is tapped. Returns
// {bpm, conf, alts} or {err}.
export function tempoFromPeaks(peaks, bucketSec, fromSec, toSec) {
  const nb = peaks.length / 2;
  const k0 = Math.max(0, Math.floor(fromSec / bucketSec)), k1 = Math.min(nb, Math.ceil(toSec / bucketSec));
  const n = k1 - k0;
  if (n * bucketSec < 4) return {err: "too short — a take needs about four seconds to read a tempo"};
  const env = new Float32Array(n);
  for (let k = 0; k < n; k++) env[k] = Math.max(-peaks[(k0 + k) * 2], peaks[(k0 + k) * 2 + 1]);
  const on = new Float32Array(n); // onset strength: rises only, lightly smoothed
  for (let k = 1; k < n; k++) on[k] = Math.max(0, env[k] - env[k - 1]);
  for (let k = 1; k < n - 1; k++) on[k] = (on[k - 1] + on[k] + on[k + 1]) / 3;
  let mean = 0; for (let k = 0; k < n; k++) mean += on[k]; mean /= n;
  let e0 = 0; for (let k = 0; k < n; k++) { on[k] -= mean; e0 += on[k] * on[k]; }
  if (e0 <= 1e-9) return {err: "no beats to read in this piece"};
  const Lmin = Math.floor(60 / 240 / bucketSec), Lmax = Math.min(n >> 1, Math.ceil(60 / 40 / bucketSec));
  const ac = new Float32Array(Lmax + 1);
  for (let L = Lmin; L <= Lmax; L++) { let s = 0; for (let k = L; k < n; k++) s += on[k] * on[k - L]; ac[L] = s / e0; }
  let best = -1, bestScore = -Infinity;
  for (let L = Lmin; L <= Lmax; L++) {
    const bpm = 60 / (L * bucketSec);
    const w = Math.exp(-Math.pow(Math.log(bpm / 110) / 0.55, 2) / 2); // soft preference, not a wall
    const score = ac[L] * (0.6 + 0.4 * w);
    if (score > bestScore) { bestScore = score; best = L; }
  }
  if (best < 0) return {err: "no beats to read in this piece"};
  let L = best; // parabolic refine across the neighbours
  if (best > Lmin && best < Lmax) {
    const a = ac[best - 1], b = ac[best], c = ac[best + 1], d = a - 2 * b + c;
    if (d < 0) L = best + 0.5 * (a - c) / d;
  }
  const bpm = 60 / (L * bucketSec), conf = ac[best];
  return {bpm: Math.round(bpm * 10) / 10, conf, level: conf >= 0.35 ? "strong" : conf >= 0.18 ? "fair" : "weak",
          alts: [Math.round(bpm * 5) / 10, Math.round(bpm * 20) / 10]};
}
// Level 2 — beat mapping (Josh, 2026-09-17: "Logic just figures out where the
// beats are"). The grid bends to the take: a dynamic-programming beat tracker
// (Ellis 2007) walks the onset curve choosing beat times that balance "an
// onset is here" against "this spacing matches the period"; downbeats come
// from the meter and accent; then ONE tempo: per bar makes every bar line
// land on a found downbeat. Nothing is written until Apply; the downbeat
// shift is the correction Logic also asks for now and then.
export function onsetCurve(peaks, bucketSec, fromSec, toSec) { // unit-variance onset strength for a window of a file
  const nb = peaks.length / 2;
  const k0 = Math.max(0, Math.floor(fromSec / bucketSec)), k1 = Math.min(nb, Math.ceil(toSec / bucketSec));
  const n = k1 - k0;
  const env = new Float32Array(n), on = new Float32Array(n);
  for (let k = 0; k < n; k++) env[k] = Math.max(-peaks[(k0 + k) * 2], peaks[(k0 + k) * 2 + 1]);
  // the first frame's rise counts too: a piece usually STARTS on a sound (auto-trim
  // put the first onset at the anchor), so compare it with the bucket before the
  // window, or with silence at the file's head — else beat one lands late
  const prev = k0 > 0 ? Math.max(-peaks[(k0 - 1) * 2], peaks[(k0 - 1) * 2 + 1]) : 0;
  on[0] = Math.max(0, env[0] - prev);
  for (let k = 1; k < n; k++) on[k] = Math.max(0, env[k] - env[k - 1]);
  for (let k = 1; k < n - 1; k++) on[k] = (on[k - 1] + on[k] + on[k + 1]) / 3;
  let mean = 0; for (let k = 0; k < n; k++) mean += on[k]; mean /= n;
  let v = 0; for (let k = 0; k < n; k++) v += (on[k] - mean) * (on[k] - mean); v = Math.sqrt(v / Math.max(1, n));
  if (v > 1e-9) for (let k = 0; k < n; k++) on[k] = (on[k] - mean) / v;
  return {on, n, k0};
}
export function beatTrack(on, period, tightness = 100) { // Ellis DP: beat frame indexes given a period in frames
  const n = on.length;
  if (n < period * 2) return [];
  const score = new Float32Array(n), back = new Int32Array(n).fill(-1);
  const pMin = Math.max(1, Math.round(period / 2)), pMax = Math.round(period * 2);
  const tx = new Float32Array(pMax + 1); // transition cost by gap: -tightness·(log(gap/period))²
  for (let g = pMin; g <= pMax; g++) tx[g] = -tightness * Math.pow(Math.log(g / period), 2);
  for (let t = 0; t < n; t++) {
    let best = -Infinity, bi = -1; // negative running scores are fine: the chain must reach the first beat
    for (let g = pMin; g <= pMax && g <= t; g++) {
      const s = score[t - g] + tx[g];
      if (s > best) { best = s; bi = t - g; }
    }
    score[t] = on[t] + (bi < 0 ? 0 : best);
    back[t] = bi;
  }
  let end = n - 1; // start the backtrace at the strongest recent beat
  for (let t = Math.max(0, n - pMax); t < n; t++) if (score[t] > score[end]) end = t;
  const beats = [];
  for (let t = end; t >= 0; t = back[t]) { beats.push(t); if (back[t] < 0) break; }
  return beats.reverse();
}
export function clipBeatMap(c, phaseShift = 0) { // {bars: [{bpm, sec}], beats, bpmRange, offBars, firstBeatSec, B} or {err}
  if (!c.peaks || !c.buffer || !c.dur) return {err: "not decoded yet"};
  const bucketSec = PEAK_BUCKET / c.buffer.sampleRate, from = c.offset, to = c.offset + clipLen(c);
  const t = tempoFromPeaks(c.peaks, bucketSec, from, to);
  if (t.err) return t;
  const period = 60 / t.bpm / bucketSec;
  const {on} = onsetCurve(c.peaks, bucketSec, from, to);
  const beats = beatTrack(on, period);
  const B = beatsPerBarDisp();
  if (beats.length < 2 * B + 1) return {err: "too few beats found for a bar map (need a few bars of steady playing)"};
  // downbeat phase: the beat class with the most accent; the first beat wins a tie
  const acc = [];
  for (let p = 0; p < B; p++) {
    let s = 0, k = 0;
    for (let i = p; i < beats.length; i += B) { s += on[beats[i]]; k++; }
    acc.push(k ? s / k : -Infinity);
  }
  let phase = 0; // the first beat is the downbeat unless another class is clearly more accented
  for (let p = 1; p < B; p++) if (acc[p] > Math.max(acc[0], 0) + 0.35 && acc[p] > acc[phase]) phase = p;
  phase = ((phase + phaseShift) % B + B) % B;
  const quartersPerBar = effTs()[0] * 4 / effTs()[1];
  const bars = [];
  const secAt = i => beats[i] * bucketSec; // seconds from the piece's start
  for (let i = phase; i + B < beats.length; i += B) {
    const D = secAt(i + B) - secAt(i);
    bars.push({sec: secAt(i), dur: D, bpm: Math.round(quartersPerBar * 60 / D * 100) / 100});
  }
  if (!bars.length) return {err: "not even one full bar found"};
  const bpms = bars.map(b => b.bpm).sort((a, b) => a - b);
  const median = bpms[bpms.length >> 1];
  const offBars = bars.filter(b => Math.abs(b.bpm - median) / median > 0.35).length; // a slipped beat shows as a wild bar
  return {bars, beats: beats.map(secAt), B, phase, firstBeatSec: bars[0].sec, bpmRange: [bpms[0], bpms[bpms.length - 1]], median, offBars, conf: t.level};
}
export function clipTempo(c) { // the estimate for one piece's window of its file
  if (!c.peaks || !c.buffer || !c.dur) return {err: "not decoded yet"};
  return tempoFromPeaks(c.peaks, PEAK_BUCKET / c.buffer.sampleRate, c.offset, c.offset + clipLen(c));
}
export function audioReady() { // resolves when every file in the song has settled (ready or not)
  const settled = e => !e || e.status === "ready" || e.status === "missing" || e.status === "undecodable";
  const files = new Set();
  forEachClip(c => { if (!settled(audioBufCache.get(audioCacheKey(c.file)))) files.add(c.file); });
  return Promise.all([...files].map(f => new Promise(res => {
    const t = setInterval(() => { if (settled(audioBufCache.get(audioCacheKey(f)))) { clearInterval(t); res(); } }, 100);
  })));
}
// ---- pitch-preserving slowdown (Josh, 2026-09-17: "Amazing Slow Downer keeps
// the pitches"). Plan B from the design talk: the take is re-rendered at the
// slider's rate with WSOLA (overlap-add of ~21 ms grains, each placed where it
// best continues the last one), in a worker so nothing freezes, cached per
// file × rate; playback then uses that buffer at rate 1 through the same
// per-pass scheduler, so loops, pieces, and the iPad behave unchanged.
// Tape-style (pitch follows) stays as a device toggle in the recording sheet.
export function wsolaStretch(input, rate) { // Float32Array mono → Float32Array, length ≈ input.length / rate, pitch kept
  const N = input.length;
  if (Math.abs(rate - 1) < 1e-6 || N < 4096) return input.slice();
  const frame = 1024, hop = frame >> 1, tol = 128;
  const outLen = Math.round(N / rate);
  const out = new Float32Array(outLen + frame), norm = new Float32Array(outLen + frame);
  const win = new Float32Array(frame);
  for (let i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / frame);
  let prevIn = 0;
  for (let outPos = 0, k = 0; outPos < outLen; outPos += hop, k++) {
    const target = Math.min(N - frame, Math.round(outPos * rate)); // nominal analysis position
    let best = target;
    if (k > 0) { // choose, near the target, the grain that best continues the previous one
      const natural = Math.min(N - frame, prevIn + hop);
      const lo = Math.max(0, target - tol), hi = Math.min(N - frame, target + tol);
      let bestScore = -Infinity;
      for (let cand = lo; cand <= hi; cand += 2) {
        let s = 0;
        for (let i = 0; i < frame; i += 4) s += input[cand + i] * input[natural + i];
        if (s > bestScore) { bestScore = s; best = cand; }
      }
    }
    best = Math.max(0, Math.min(N - frame, best));
    for (let i = 0; i < frame; i++) { out[outPos + i] += input[best + i] * win[i]; norm[outPos + i] += win[i]; }
    prevIn = best;
  }
  for (let i = 0; i < outLen; i++) if (norm[i] > 1e-6) out[i] /= norm[i];
  return out.slice(0, outLen);
}
export const stretchJobs = new Map();
export function stretchInWorker(data, rate) { // resolves with the stretched Float32Array; inline (no worker) where there is none
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function")
    return Promise.resolve(wsolaStretch(data, rate));
  if (!S.stretchWorker) {
    const src = wsolaStretch.toString() +
      ";onmessage=function(e){var d=e.data;var out=wsolaStretch(d.data,d.rate);postMessage({id:d.id,out:out},[out.buffer]);};";
    S.stretchWorker = new Worker(URL.createObjectURL(new Blob([src], {type: "text/javascript"})));
    S.stretchWorker.onmessage = e => { const res = stretchJobs.get(e.data.id); if (res) { stretchJobs.delete(e.data.id); res(e.data.out); } };
  }
  return new Promise(res => {
    const id = ++S.stretchJobId, copy = data.slice();
    stretchJobs.set(id, res);
    S.stretchWorker.postMessage({id, data: copy, rate}, [copy.buffer]);
  });
}
export const stretchCache = new Map();
// songKey|file|rate -> {status: "pending"|"ready", buffer}
export function keepPitch() { return localStorage.getItem("ff1roll-tapestyle") !== "1"; }
// default: keep pitch
export function stretchKey(file, rate) { return audioCacheKey(file) + "|" + rate; }
export function stretchPending(c) { // true while this piece's file is being re-rendered for the current rate
  if (S.playRate === 1 || !keepPitch() || !c.buffer) return false;
  const e = stretchCache.get(stretchKey(c.file, S.playRate));
  return !e || e.status !== "ready";
}

// Rewrite a track's audio: annotations from a list of pieces. Every change to a
// piece changes its note's identity, so old notes are tombstoned (or the repo
// copy resurrects them on the next load) and fresh added notes take their
// place. One undo step per call.
export function writeClips(ti, clips) {
  const tr = S.song.tracks[ti];
  if (!tr) return;
  const name = tr.name || "tr" + (ti + 1);
  pushUndo({kind: "anno", json: annoSnapshot()});
  for (const n of S.rollnotes) if (n.audiodir && n.audiodir.track.toLowerCase() === name.toLowerCase()) tombstone(n);
  S.rollnotes = S.rollnotes.filter(n => !(n.audiodir && n.audiodir.track.toLowerCase() === name.toLowerCase()));
  for (const c of clips) {
    if (!c.file) continue;
    const d = {track: name, file: c.file, offset: Math.max(0, c.offset || 0), len: c.len || null, local: !!c.local};
    const n = {b1: 1, q1: 1, b2: null, q2: null, text: audioDirText(d), added: true};
    setAnchorBQ(n, Math.max(0, c.at));
    S.rollnotes.push(resolveNote(deriveNoteTypes([n])[0]));
  }
  finalizeNotes();
  saveLocalNotes();
  computeSongEnd();
  if (S.playing) buildSchedule();
  draw();
}
export function setClipDir(ti, ci, patch) { // one piece changes; the others stand
  const tr = S.song.tracks[ti];
  if (!tr || tr.kind !== "audio" || !tr.clips[ci]) return;
  const next = tr.clips.map((c, i) => i === ci ? {...c, ...patch} : c);
  const moved = next[ci];
  writeClips(ti, next);
  // keep the selection on the same piece after the re-sort by anchor
  const nci = tr.clips.findIndex(c => c.at === Math.max(0, Math.round(moved.at)) && c.file === moved.file && Math.abs(c.offset - (moved.offset || 0)) < 1e-6);
  if (nci >= 0) S.selClip = {ti, ci: nci};
}
export function splitClipAt(ti, ci, tick) { // two pieces out of one, at a song tick strictly inside it
  const c = S.song.tracks[ti].clips[ci];
  if (!c || !c.dur) return false;
  const end = clipEndTick(c);
  if (tick <= c.at + 1 || tick >= end - 1) return false;
  const leftLen = +((tickToSec(S.song, tick) - tickToSec(S.song, c.at)) * S.playRate).toFixed(3);
  const total = clipLen(c);
  if (leftLen < 0.05 || total - leftLen < 0.05) return false;
  const left = {...c, len: leftLen};
  const right = {...c, at: tick, offset: +(c.offset + leftLen).toFixed(3), len: +(total - leftLen).toFixed(3)};
  const next = S.song.tracks[ti].clips.slice();
  next.splice(ci, 1, left, right);
  writeClips(ti, next);
  const nci = S.song.tracks[ti].clips.findIndex(x => x.at === tick && x.file === c.file);
  S.selClip = nci >= 0 ? {ti, ci: nci} : null;
  return true;
}
export function deleteClip(ti, ci) { // the piece goes; the track stays
  const tr = S.song.tracks[ti];
  if (!tr || !tr.clips[ci]) return;
  writeClips(ti, tr.clips.filter((_, i) => i !== ci));
  S.selClip = null;
  setInfo("piece removed — one undo brings it back" + (tr.clips && tr.clips.length ? "" : " (the track stays; ✕ Delete track removes it)"));
}

export function stretchEnsure(file) { // the current rate's stretched buffer for a file: cached, pending, or kicked off now
  const rate = S.playRate;
  const k = stretchKey(file, rate);
  let e = stretchCache.get(k);
  if (e) return e;
  const src = audioBufCache.get(audioCacheKey(file));
  if (!src || src.status !== "ready" || !src.buffer) return null; // not decoded yet: nothing to stretch from
  e = {status: "pending", buffer: null};
  stretchCache.set(k, e);
  const key = S.songKey;
  stretchInWorker(src.buffer.getChannelData(0), rate).then(out => {
    if (!stretchCache.has(k)) return; // rate moved on: this render was evicted
    const sr = src.buffer.sampleRate;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctxb = S.audio || (OAC ? new OAC(1, 1, sr) : null);
    if (!ctxb) { stretchCache.delete(k); return; }
    const b = ctxb.createBuffer(1, out.length, sr);
    b.getChannelData(0).set(out);
    e.buffer = b; e.status = "ready";
    if (S.songKey === key) { if (S.playing) { buildSchedule(); audioChaseNow(file); } draw(); }
  }).catch(() => { stretchCache.delete(k); });
  return e;
}
// a take whose buffer arrives MID-PASS (decode or stretch finished while
// playing) must not wait for the next wrap: schedule its remainder from now,
// the way a note the cursor lands inside gets its tail
export function audioChaseNow(file) {
  if (!S.playing || !S.song || !S.audio || !S.loopSeg) return;
  const now = playSec();
  forEachClip((c, ti) => {
    if (c.file !== file || !c.buffer) return;
    const start = tickToSec(S.song, c.at), end = Math.min(start + clipLen(c) / S.playRate, S.loopSeg.end);
    if (now < start - 0.05 || now >= end) return; // the pump will start it, or it is already over
    const lead = 0.06;
    scheduleClip(ti, c, S.audio.currentTime + lead, end - now - lead);
  });
}
export function stretchEnsureAll() { // every file in the song, for the current rate; other rates are dropped (RAM)
  if (!S.song || S.playRate === 1 || !keepPitch()) return;
  for (const k of [...stretchCache.keys()]) if (!k.endsWith("|" + S.playRate)) stretchCache.delete(k);
  const files = new Set();
  forEachClip(c => files.add(c.file));
  for (const f of files) stretchEnsure(f);
}
export function scheduleClip(ti, clip, when, durSec) { // durSec = WALL seconds left to play from `when`
  if (!clip.buffer || durSec <= 0.01) return;
  const off = clip.offset + clipLen(clip) - durSec * S.playRate; // buffer seconds: piece start + what has elapsed
  if (off >= clip.buffer.duration) return;
  let buffer = clip.buffer, startAt = Math.max(0, off), srcRate = S.playRate; // tape-style: pitch follows, like chip audio
  if (S.playRate !== 1 && keepPitch()) {
    const e = stretchEnsure(clip.file);
    if (!e || e.status !== "ready") return; // still stretching: silent this pass, it joins the next
    buffer = e.buffer; startAt = Math.max(0, off) / S.playRate; srcRate = 1; // the stretched copy runs at 1: pitch kept
  }
  const g = S.audio.createGain();
  g.connect(trackGain(ti));
  const R = 0.005, end = when + durSec; // 5ms ramps: a pass boundary cuts and restarts mid-waveform
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(1, when + R);
  g.gain.setValueAtTime(1, Math.max(when + R, end - R));
  g.gain.linearRampToValueAtTime(0, end);
  const src = S.audio.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = srcRate;
  src.connect(g);
  src.start(when, startAt);
  src.stop(end + 0.01);
  S.audioSrcs.push(src);
  src.onended = () => { // prune, or the list grows one node per pass forever
    const i = S.audioSrcs.indexOf(src);
    if (i >= 0) S.audioSrcs.splice(i, 1);
    try { g.disconnect(); } catch (err) { /* already gone */ }
  };
}

export function applyAudioDirs() { // called from finalizeNotes: every audio: note is one piece on its named track
  const seen = new Set(); // exact twins (same anchor + text) collapse; the rest all stand
  S.rollnotes = S.rollnotes.filter(n => {
    if (!n.audiodir) return true;
    const k = n.b1 + ":" + n.q1 + ":" + n.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  S.song.tracks.forEach(tr => { if (tr.kind === "audio") { delete tr.kind; delete tr.clips; } });
  const files = new Set();
  for (const n of S.rollnotes) {
    if (!n.audiodir || !n.audiodir.file) continue;
    let ti = S.song.tracks.findIndex((tr, i) =>
      (tr.name || "tr" + (i + 1)).toLowerCase() === n.audiodir.track.toLowerCase());
    if (ti < 0) {
      // parseMidi keeps only tracks that have notes, and a clip's track never
      // does — so a song reloaded from its saved .mid arrives without it.
      // Recreate it by name (the addTrackUndoable shape keeps trackState and
      // rawNotes in step); on a corpus song or a capture a stray directive
      // stays stray. A published song of the user's own rebuilds it even
      // with no local copy here: the recording is the song's, not the copy's
      // (2026-09-27, when published copies stopped being editable in place).
      if (!(isComposition() || isLocalDraft() || ownFolderPath(S.songKey)) || !S.trackState) continue;
      ti = addTrackUndoable({name: n.audiodir.track, notes: []});
    }
    const tr = S.song.tracks[ti];
    const cached = audioBufCache.get(audioCacheKey(n.audiodir.file));
    tr.kind = "audio";
    if (!tr.clips) tr.clips = [];
    tr.clips.push({file: n.audiodir.file, at: Math.max(0, Math.round(n.start)), offset: n.audiodir.offset || 0,
                   len: n.audiodir.len || null, local: !!n.audiodir.local, note: n,
                   buffer: cached ? cached.buffer : null, peaks: cached ? cached.peaks : null,
                   dur: cached ? cached.dur : 0, status: cached ? cached.status : "pending",
                   where: cached ? cached.where : null}); // device / folder / repo — the sheet's "where its bytes are"
    if (!cached) files.add(n.audiodir.file);
  }
  S.song.tracks.forEach(tr => { if (tr.kind === "audio") tr.clips.sort((a, b) => a.at - b.at); });
  for (const f of files) audioEnsureFile(f);
}
export async function audioEnsureFile(file) { // resolve + decode one file; every piece using it gets the buffer
  if (!S.song) return;
  const key = S.songKey, ck = audioCacheKey(file);
  if (audioBufCache.has(ck)) return;
  const entry = {buffer: null, peaks: null, dur: 0, status: "decoding", where: null};
  audioBufCache.set(ck, entry);
  playGateKick();
  const apply = () => { // the clip objects may have been rebuilt by a later finalizeNotes: find them by file
    if (S.songKey !== key || !S.song) return;
    forEachClip(c => { if (c.file === file)
      Object.assign(c, {buffer: entry.buffer, peaks: entry.peaks, dur: entry.dur, status: entry.status, where: entry.where}); });
    computeSongEnd();
    if (S.playing) buildSchedule();
    if (entry.status === "ready" && S.playRate !== 1) stretchEnsureAll(); // decoded while slowed: stretch it too
    else if (entry.status === "ready" && S.playing) audioChaseNow(file); // decoded mid-play: in from here, not the next pass
    draw();
    if (S.autoAlignFiles.has(file) && entry.status === "ready") { // a take almost always has a lead-in:
      // on import the first sound lands on the bar it was dropped at (Josh's export
      // had most of a bar of recorder silence, 2026-09-16). Re-alignable in the sheet.
      S.autoAlignFiles.delete(file);
      let hit = null;
      forEachClip((c, ti, ci) => { if (!hit && c.file === file) hit = {ti, ci, c}; });
      const sec = hit ? clipOnsetSec(hit.c) : null;
      if (sec !== null && sec > 0.005) {
        setClipDir(hit.ti, hit.ci, {offset: sec});
        S.editUndo.pop(); // part of the import, not a step of its own
        setInfo("added " + (S.song.tracks[hit.ti].name || file) + " ∿ — trimmed " + sec.toFixed(2) + "s of silence so the first sound sits on " +
                fmtBarBeat(hit.c.at) + " · tap its chip again to nudge or re-align");
      }
    }
  };
  const got = await audioBytesFor(key, file);
  if (!got) { entry.status = "missing"; apply(); return; }
  entry.where = got.where;
  try {
    const d = await decodeAudioBytes(got.bytes);
    Object.assign(entry, d, {status: "ready"});
  } catch (err) { entry.status = "undecodable"; }
  apply();
}
export function applyBeatMap(ti, ci, map) { // one tempo: per bar from the piece's anchor bar; one undo
  const tr = S.song.tracks[ti], c = tr && tr.clips[ci];
  if (!c) return "no piece";
  if (!(isComposition() || isLocalDraft())) return "captures keep their measured tempo — this works on your own songs";
  const bt = barTicks();
  if (c.at % bt !== 0) return "move the piece so it starts on a bar line first (its first downbeat = that bar)";
  const b0 = c.at / bt + 1;
  // the first found downbeat should sit at the piece's start; a late one (a pickup) shifts the map's origin
  // by whole beats only when it is small; otherwise the user shifts the downbeat
  const N = map.bars.length;
  pushUndo({kind: "anno", json: annoSnapshot()});
  S.rollnotes.forEach(n => { if (n.tempodir !== undefined && n.b1 >= b0 && n.b1 < b0 + N) tombstone(n); });
  S.rollnotes = S.rollnotes.filter(n => !(n.tempodir !== undefined && n.b1 >= b0 && n.b1 < b0 + N));
  map.bars.forEach((b, i) => {
    S.rollnotes.push(resolveNote({b1: b0 + i, q1: 1, b2: null, q2: null, text: "tempo: " + b.bpm, tempodir: b.bpm, added: true}));
  });
  finalizeNotes();
  saveLocalNotes();
  computeSongEnd();
  if (S.playing) { const at = playSec(); stop(); play(at, {noCountIn: true}).catch(() => {}); }
  updateSubtitle();
  draw();
  return null;
}
export function setSongTempo(bpm) { // the song's tempo at 1.1 — compositions author tempo through this annotation
  if (!(isComposition() || isLocalDraft())) { setInfo("captures keep their measured tempo — this works on your own songs"); return false; }
  bpm = Math.max(20, Math.min(400, Math.round(bpm * 10) / 10));
  pushUndo({kind: "anno", json: annoSnapshot()});
  S.rollnotes.forEach(n => { if (n.tempodir !== undefined && n.b1 === 1 && n.q1 === 1) tombstone(n); });
  S.rollnotes = S.rollnotes.filter(n => !(n.tempodir !== undefined && n.b1 === 1 && n.q1 === 1));
  S.rollnotes.push(resolveNote({b1: 1, q1: 1, b2: null, q2: null, text: "tempo: " + bpm, tempodir: bpm, added: true}));
  finalizeNotes();
  saveLocalNotes();
  computeSongEnd();
  if (S.playing) { const at = playSec(); stop(); play(at, {noCountIn: true}).catch(() => {}); } // the map changed under the transport
  updateSubtitle();
  draw();
  return true;
}

export function moveClip(ti, ci, dT) {
  const c = S.song.tracks[ti].clips[ci];
  setClipDir(ti, ci, {at: Math.max(0, c.at + dT)});
  if (S.selClip) setInfo(clipLabel(S.selClip.ti, S.selClip.ci) + " — one undo undoes the move");
}
// trim: drag an edge in Select. Left keeps the SOUND in place (anchor and
// file offset move together); right only changes how much plays.
export function trimClip(ti, ci, side, dT) {
  const c = S.song.tracks[ti].clips[ci];
  if (!c || !c.dur) return;
  const dSec = (tickToSec(S.song, c.at + dT) - tickToSec(S.song, c.at)) * S.playRate; // buffer seconds
  const len = clipLen(c);
  if (side === "L") {
    const d = Math.max(-c.offset, Math.min(len - 0.05, dSec));
    setClipDir(ti, ci, {at: c.at + secToTick(S.song, tickToSec(S.song, c.at) + d / S.playRate) - c.at, offset: +(c.offset + d).toFixed(3), len: +(len - d).toFixed(3)});
  } else {
    const nl = Math.max(0.05, Math.min(c.dur - c.offset, len + dSec));
    setClipDir(ti, ci, {len: +nl.toFixed(3)});
  }
  if (S.selClip) setInfo(clipLabel(S.selClip.ti, S.selClip.ci) + " — trimmed; one undo undoes it");
}
export function splitSelectedClipAtCursor() {
  if (!S.selClip) return false;
  const ok = splitClipAt(S.selClip.ti, S.selClip.ci, Math.round(S.playCursor));
  setInfo(ok ? "split at " + fmtBarBeat(S.playCursor) + " — two pieces now; one ⟲ rejoins them"
             : "put the cursor inside the piece to split it");
  return ok;
}
