import { nativeCall } from "../platform/native.js";

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
