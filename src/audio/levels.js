// src/audio/levels.js — the song gain at playback (docs/plans/2026-10-07-console-loudness.md §4A).
// The console voice of a captured song plays at one gain that lands it at
// LOUD_TARGET; the synth on the same song gets that gain plus the console's
// synth match, so "Hear the MIDI" switches at equal loudness. The measurement
// comes from album.json (nsf.tracks[base].loud, tools/measure-loudness.mjs),
// else from this device's cache (by the rip's hash), else from the render
// itself the first time it is heard. engine.js reads S.levels per track.
import { S } from "../state.js";
import { chip } from "./chip.js";
import { chipActive } from "./chip.js";
import { chipPartTrack } from "./chip.js";
import { updateTrackGains } from "./engine.js";
import { logDebug } from "../hooks.js";
import { songGainDb } from "./loudness.js";
import { synthMatchDb } from "./loudness.js";
import { dbToLin } from "./loudness.js";
import { SYNTH_LEVEL } from "./loudness.js";
import { measureLoudness } from "./loudness.js";
import { loudMix } from "./loudness.js";
import { LOUD_VERSION } from "./loudness.js";

export function loudCacheSlot(key) { return "ff1roll-loud:" + LOUD_VERSION + ":" + key; } // a new measurement version never reads an old one
const LOUD_MEASURE_MAX_SEC = 300; // the in-app fallback reads at most this much of a render (a whole song in practice)

// {console, synth, chipTracks} for the song now open: linear gains
export function songLevels() {
  const loud = chip.key === S.songKey ? chip.loud : null;
  if (!loud || !Number.isFinite(loud.lufs)) return {console: 1, synth: SYNTH_LEVEL, chipTracks: new Set(), gainDb: null};
  const g = songGainDb(loud);
  return {console: dbToLin(g), synth: dbToLin(g + synthMatchDb(chip.kind, loud)), chipTracks: new Set(), gainDb: g};
}
// the tracks the console voice is sounding on right now — chipStart's own rule:
// a rendered channel's track (or its host, CHIP_PART_HOST), voice left on auto
export function chipSoundingTracks() {
  const out = new Set();
  if (!chipActive()) return out;
  const names = chip.stream ? chip.stream.tracks.filter(n => !chip.stream.silent.has(n)) : Object.keys(chip.buffers || chip.pcm || {});
  for (const name of names) {
    const ti = chip.stream ? S.song.tracks.findIndex(tr => (tr.name || "") === name) : chipPartTrack(name);
    if (ti < 0) continue;
    const vv = S.song.tracks[ti].voice;
    if (vv && vv !== "auto") continue;
    out.add(ti);
  }
  return out;
}
// set S.levels for the song and push it into every live track level node;
// play() and the offline bounce call this before scheduling anything
export function applyLevels() {
  const L = songLevels();
  L.chipTracks = S.song ? chipSoundingTracks() : new Set();
  S.levels = L;
  updateTrackGains();
  return L;
}

// device cache for a song album.json has no measurement for yet (an import,
// a draft, an album measured before its next --apply)
export function loudCacheGet(key) {
  if (!key) return null;
  try { const v = JSON.parse(localStorage.getItem(loudCacheSlot(key)) || "null"); return v && Number.isFinite(v.lufs) ? v : null; } catch (err) { return null; }
}
export function loudCachePut(key, loud) {
  if (!key || !loud || !Number.isFinite(loud.lufs)) return;
  try { localStorage.setItem(loudCacheSlot(key), JSON.stringify({lufs: loud.lufs, peak: loud.peak})); } catch (err) { /* full or private mode: measured again next time */ }
}
// the measurement for a render that just came in (chipPublish): the album's
// stored one, else this device's cache, else measured from the render's own
// PCM before it becomes AudioBuffers
export function loudForRender(pending, pcm, sampleRate, leadSec) {
  if (pending && pending.loud && Number.isFinite(pending.loud.lufs) && pending.loud.v === LOUD_VERSION) return {...pending.loud, src: "album"};
  const cached = pending && loudCacheGet(pending.cacheKey);
  if (cached) return {...cached, src: "cache"};
  if (!pcm || !Object.keys(pcm).length) return null;
  const t0 = Date.now();
  const {L, R} = loudMix(pcm, sampleRate, {lead: leadSec || 0, secs: LOUD_MEASURE_MAX_SEC});
  const loud = measureLoudness(L, R, sampleRate);
  if (!Number.isFinite(loud.lufs)) return null;
  if (pending) loudCachePut(pending.cacheKey, loud);
  logDebug("console loudness measured on this device: " + loud.lufs + " LUFS, peak " + loud.peak + " dBFS (" + (Date.now() - t0) + " ms)");
  return {...loud, src: "measured"};
}
// stream mode has no whole render: the chunks that arrive first stand in for
// the song (≈ STREAM_MEASURE_SEC). Applied from the next ▶ — never mid-play.
const STREAM_MEASURE_SEC = 20;
export function loudStreamChunk(idx, buffers, rate) {
  const st = chip.stream;
  if (!st || chip.loud || !st.loudAcc) return;
  const acc = st.loudAcc;
  if (idx !== acc.next) return; // in order only: a seek's chunks are not the song's opening
  acc.next++;
  const tracks = {};
  for (const [name, b] of Object.entries(buffers)) tracks[name] = b.numberOfChannels === 2 ? {l: b.getChannelData(0), r: b.getChannelData(1)} : b.getChannelData(0);
  acc.parts.push(loudMix(tracks, rate));
  acc.secs += Object.values(buffers)[0] ? Object.values(buffers)[0].duration : 0;
  if (acc.secs < STREAM_MEASURE_SEC) return;
  const n = acc.parts.reduce((a, p) => a + p.L.length, 0), L = new Float32Array(n), R = new Float32Array(n);
  let o = 0; for (const p of acc.parts) { L.set(p.L, o); R.set(p.R, o); o += p.L.length; }
  const loud = measureLoudness(L, R, rate);
  st.loudAcc = null;
  if (!Number.isFinite(loud.lufs)) return;
  chip.loud = {...loud, src: "measured (stream, first " + Math.round(acc.secs) + " s)"};
  loudCachePut(acc.cacheKey, loud);
}
