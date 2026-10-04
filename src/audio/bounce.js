import { nativeCall } from "../platform/native.js";
import { S } from "../state.js";
import { chip } from "./chip.js";
import { sfWaitForSong } from "./voices.js";
import { gameWaitForSong } from "./voices.js";
import { forEachClip } from "./clips.js";
import { audioEnsureFile } from "./clips.js";
import { audioBufCache } from "./clips.js";
import { audioCacheKey } from "./clips.js";
import { keepPitch } from "./clips.js";
import { stretchEnsureAll } from "./clips.js";
import { stretchCache } from "./clips.js";
import { stretchKey } from "./clips.js";
import { stop } from "./transport.js";
import { tickToSec } from "../midi/parse.js";
import { MASTER_VOL } from "./engine.js";
import { buildSchedule } from "./transport.js";
import { updateTrackGains } from "./engine.js";
import { trackGain } from "./engine.js";
import { chipActive } from "./chip.js";
import { chipStart } from "./chip.js";
import { clipClamp } from "./clips.js";
import { scheduleNote } from "./voices.js";
import { ensureAudio } from "./engine.js";
import { setInfo } from "../hooks.js";
import { resumeAudio } from "./engine.js";
import { play } from "./transport.js";

export function midiBase64(bytes) { // btoa in chunks — big songs overflow the arg limit
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}
// -------------------------------------------------------- Download audio
// DAW convention (GarageBand, Cubasis, BandLab): bounce OFFLINE — faster
// than real time, straight to a WAV file, handed to the share sheet — not a
// real-time recording of the speaker output. renderSongOffline() drives the
// SAME voice/chip/sampled/game-instrument/clip code live playback uses
// (buildSchedule, scheduleNote, chipStart, drumHit, scheduleClip,
// scheduleGameNote all read `audio`/`master`/`trackGains` as globals — this
// just points those globals at an OfflineAudioContext for one synchronous
// pass instead of the live one) — see NIGHT-ROLL.md "Audio export". Every
// voice kind an OfflineAudioContext can build a node graph for renders this
// way; nothing in the engine is actually tied to the live context (it was
// already built context-agnostic for the no-user-gesture decode path — see
// decodeAudioBytes above). The one real hard case is a browser with no
// OfflineAudioContext at all — that falls back to today's real-time
// MediaRecorder capture (recordRealtimeAudio), never a silent track.
export function wavEncode(numChannels, sampleRate, channelData) { // channelData: [Float32Array, …], one per channel, equal length
  const numFrames = channelData[0] ? channelData[0].length : 0;
  const blockAlign = numChannels * 2, byteRate = sampleRate * blockAlign, dataSize = numFrames * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize), view = new DataView(buf);
  let p = 0;
  const wStr = s => { for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); };
  const wU32 = v => { view.setUint32(p, v, true); p += 4; };
  const wU16 = v => { view.setUint16(p, v, true); p += 2; };
  wStr("RIFF"); wU32(36 + dataSize); wStr("WAVE");
  wStr("fmt "); wU32(16); wU16(1) /* PCM */; wU16(numChannels); wU32(sampleRate); wU32(byteRate); wU16(blockAlign); wU16(16) /* bits/sample */;
  wStr("data"); wU32(dataSize);
  for (let i = 0; i < numFrames; i++) for (let c = 0; c < numChannels; c++) {
    const s = Math.max(-1, Math.min(1, channelData[c][i] || 0));
    view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true); p += 2;
  }
  return new Uint8Array(buf);
}
export function audioBufferToWav(buf) { // AudioBuffer (or the offline render's plain equivalent) -> 16-bit WAV bytes
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  return wavEncode(buf.numberOfChannels, buf.sampleRate, chans);
}
// hand the export to the iPad's native share sheet (the existing
// @capacitor/share plugin) via the Filesystem plugin's cache directory; a
// browser just downloads the file, same as Download .mid
export async function deliverAudioFile(blob, name) {
  const C = typeof window !== "undefined" && window.Capacitor;
  const native = !!(C && C.isNativePlatform && C.isNativePlatform());
  if (!native) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  const data = midiBase64(new Uint8Array(await blob.arrayBuffer())); // any bytes — chunked btoa, not MIDI-specific
  const wrote = await nativeCall("Filesystem", "writeFile", {path: name, data, directory: "CACHE", recursive: true});
  if (!wrote || !wrote.uri) throw new Error("couldn't write the export to the app's cache (no Plugins.Filesystem, no nativePromise)");
  await nativeCall("Share", "share", {title: name, files: [wrote.uri]});
}

// mirrors play()'s preflight (sfWaitForSong/gameWaitForSong, the chip
// resolve/render wait) plus audio-clip decode and time-stretch, which play()
// leaves to catch up on a later loop pass — an offline bounce gets ONE pass,
// so a clip not ready in time would otherwise render silent (scheduleClip:
// "still stretching: silent this pass, it joins the next" — there is no next)
export async function offlineWaitForAssets(capMs) {
  if (!S.song) return;
  if (chip.resolving && chip.resolving.key === S.songKey && chip.rendering !== S.songKey)
    await Promise.race([chip.resolving.p.catch(() => {}), new Promise(r => setTimeout(r, capMs))]);
  if (chip.rendering === S.songKey && chip.renderPromise)
    await Promise.race([chip.renderPromise.catch(() => {}), new Promise(r => setTimeout(r, capMs))]);
  await Promise.all([sfWaitForSong(capMs), gameWaitForSong(capMs)]);
  const files = new Set();
  forEachClip(c => files.add(c.file));
  if (files.size) {
    for (const f of files) audioEnsureFile(f); // kicks off decode for anything not already cached
    const t0 = Date.now();
    while (Date.now() - t0 < capMs && [...files].some(f => { const e = audioBufCache.get(audioCacheKey(f)); return !e || e.status === "decoding"; }))
      await new Promise(r => setTimeout(r, 50));
    if (S.playRate !== 1 && keepPitch()) {
      stretchEnsureAll();
      const t1 = Date.now();
      while (Date.now() - t1 < capMs && [...files].some(f => { const e = stretchCache.get(stretchKey(f, S.playRate)); return !e || e.status !== "ready"; }))
        await new Promise(r => setTimeout(r, 50));
    }
  }
}
// {ok:true, buffer} | {ok:false, why} — why is shown to Josh when the
// real-time fallback also can't help (see the click handler)
export async function renderSongOffline() {
  if (!S.song) return {ok: false, why: "no song open"};
  const OAC = typeof window !== "undefined" && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!OAC) return {ok: false, why: "this browser has no OfflineAudioContext"};
  stop(); // export always starts from a clean stop — no live scheduler contends for the globals below
  await offlineWaitForAssets(8000);
  const durSec = tickToSec(S.song, S.songEndTick) / S.playRate + 1; // +1: the same tail pad the real-time capture always used, so a release isn't chopped
  if (!(durSec > 0)) return {ok: false, why: "song has no notes to render"};
  const rate = (S.audio && S.audio.sampleRate) || 44100;
  let oac;
  try { oac = new OAC(2, Math.max(1, Math.ceil(durSec * rate)), rate); }
  catch (err) { return {ok: false, why: "couldn't create an offline context (" + (err && err.message || err) + ")"}; }
  // Point the live engine's globals at the offline context for one
  // synchronous scheduling pass, the way ensureAudio()/rebuildAudio() point
  // them at a fresh live context — periodic waves (pulse25/pulse12/organWave)
  // are tied to the context that made them (the same reason those get reset
  // on every context rebuild), gain/panner nodes belong to one graph, and
  // chip.buffers is cached per context (chipBuffers). Nothing here is
  // awaited until startRendering(), so nothing else can see the swap.
  const saved = {audio: S.audio, master: S.master, trackGains: S.trackGains, trackPanners: S.trackPanners, pulse25: S.pulse25, pulse12: S.pulse12, organWave: S.organWave,
                 chipBuffers: chip.buffers, chipBuffersCtx: chip.buffersCtx,
                 playing: S.playing, playT0: S.playT0, playOffset: S.playOffset, loopPass: S.loopPass, loopSeg: S.loopSeg, albumEndAbs: S.albumEndAbs};
  S.audio = oac;
  S.master = oac.createGain();
  S.master.gain.value = MASTER_VOL * S.masterVol;
  S.master.connect(oac.destination);
  S.trackGains = []; S.trackPanners = [];
  S.pulse25 = null; S.pulse12 = null; S.organWave = null;
  // chip.buffers/buffersCtx are deliberately left as they are: chipBuffers()
  // already rebuilds against whichever context `audio` names when the two
  // disagree (that's how a live context REBUILD picks up a stale chip cache
  // today), and a chip.buffers made from AudioBuffer directly (chipPcmToBuffers,
  // the common case) has buffersCtx === null — "good in any context" — so
  // nulling it here would have thrown away the only copy of the console audio
  // once its Float32 source (chip.pcm) is already freed.
  S.playing = true; S.playT0 = 0; S.playOffset = 0; S.loopPass = 0; S.albumEndAbs = null;
  // the whole song, once, no loop: "Download audio" has always been
  // documented as loop-off regardless of an armed ruler cycle (HELP.md
  // "Download audio" says nothing about cycling), so this ignores rangeSel
  // deliberately rather than reading play()'s `cycling` branch
  S.loopSeg = {start: 0, end: tickToSec(S.song, S.songEndTick), looped: false};
  let renderedBuffer = null, renderErr = null;
  try {
    buildSchedule();
    updateTrackGains();
    S.song.tracks.forEach((_, ti) => trackGain(ti));
    if (chipActive()) chipStart(0);
    for (const e of S.schedEvents) {
      if (e.sec >= S.loopSeg.end) continue;
      const dur = e.n._clip ? clipClamp(e.dur, S.loopSeg.end - e.sec) : e.dur;
      if (dur > 0) scheduleNote(e.ti, e.n, e.sec, dur);
    }
  } catch (err) { renderErr = err; }
  // put the live globals back BEFORE the (seconds-long) render: the nodes are
  // already wired into the offline graph, and a note preview, a ▶ tap or the
  // playhead during the render must see the live context, not this one
  ({audio: S.audio, master: S.master, trackGains: S.trackGains, trackPanners: S.trackPanners, pulse25: S.pulse25, pulse12: S.pulse12, organWave: S.organWave,
    playing: S.playing, playT0: S.playT0, playOffset: S.playOffset, loopPass: S.loopPass, loopSeg: S.loopSeg, albumEndAbs: S.albumEndAbs} = saved);
  chip.buffers = saved.chipBuffers; chip.buffersCtx = saved.chipBuffersCtx;
  if (!renderErr) { try { renderedBuffer = await oac.startRendering(); } catch (err) { renderErr = err; } }
  if (renderErr) return {ok: false, why: "the offline render failed (" + (renderErr && renderErr.message || renderErr) + ")"};
  return {ok: true, buffer: renderedBuffer};
}

// today's path — kept as the fallback for a browser with no
// OfflineAudioContext, or an offline render that failed: m4a on Safari, webm
// on Chrome, both shareable everywhere. True MP3 would need a bundled
// encoder; the recorder route is dependency-free. Resolves null (after
// saying why) if this browser can record neither way.
export function recordRealtimeAudio() {
  return new Promise(resolve => {
    ensureAudio();
    const dest = S.audio.createMediaStreamDestination();
    S.master.connect(dest);
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) { setInfo("this browser can't record audio — use Download .mid instead"); resolve(null); return; }
    const rec = new MediaRecorder(dest.stream, {mimeType: mime, audioBitsPerSecond: 192000});
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const ext = mime.startsWith("audio/mp4") ? "m4a" : "webm";
    const name = (S.songKey ? S.songKey.split("/").pop().replace(/\.mid$/, "") : "song") + "." + ext;
    rec.onstop = () => { S.master.disconnect(dest); resolve({blob: new Blob(chunks, {type: mime}), name, mime}); };
    stop();
    resumeAudio().then(() => {
      rec.start();
      setInfo("recording " + name + " — plays the song through once, hands off the transport");
      const lenSec = tickToSec(S.song, S.songEndTick) / S.playRate + 1;
      play(0, {noCountIn: true}).then(() => { // a count-in bar recorded as silence (Josh's re-imported export, 2026-09-16)
        setTimeout(() => { if (!S.exporting) return; stop(); rec.stop(); }, Math.min(600, lenSec) * 1000);
      });
    });
  });
}
