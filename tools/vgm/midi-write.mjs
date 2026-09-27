// VGM note events -> a type-1 MIDI file, one track per chip channel. Same
// track encoder and beat quantization as the NSF writer (a Genesis driver
// ticks at 60 Hz too, so onsets sit ±1 tick off the grid, not off the beat).
import { snapBeat, trackBytes, PPQ } from "../nsf/midi-write.mjs";
import { FRAME_SEC, CHANNEL_ORDER } from "./notes.mjs";

// FM 1-6 and PSG 1-3 each get their own MIDI channel; the unpitched pair
// share channel 10 on separate tracks
export const MIDI_CHANNELS = {fm1: 0, fm2: 1, fm3: 2, fm4: 3, fm5: 4, fm6: 5, psg1: 6, psg2: 7, psg3: 8, noise: 9, dac: 9};
// the MIDI channel value 9 is the GM drum channel: it appears twice by design

export function makeMidi(events, {bpm, tsNum = 4, tsDen = 4, snap = true, loopSample = null}) {
  const usq = Math.round(6e7 / bpm);
  const toTick = t => {
    const b = t * FRAME_SEC / (60 / bpm);
    return Math.round((snap ? snapBeat(b) : b) * PPQ);
  };
  const byCh = {};
  for (const e of events) {
    const t = toTick(e.startFrame);
    const d = Math.max(40, toTick(e.endFrame) - t); // min = a quantized 12th
    const p = e.midi == null ? e.drum : e.midi;
    if (p == null || p < 0 || p > 127) continue;
    const v = Math.max(1, Math.min(127, e.vel ?? 96));
    const ve = e.velEnd != null && e.velEnd < v ? Math.max(1, e.velEnd) : undefined;
    (byCh[e.channel] = byCh[e.channel] || []).push({t, d, p, v, ve});
  }
  const metas = [
    {t: 0, d: [0xFF, 0x58, 4, tsNum, Math.round(Math.log2(tsDen)), 24, 8]},
    {t: 0, d: [0xFF, 0x51, 3, (usq >> 16) & 255, (usq >> 8) & 255, usq & 255]},
  ];
  if (loopSample != null) { // standard marker; readers that ignore it lose nothing
    const txt = [..."loop"].map(c => c.charCodeAt(0));
    metas.push({t: toTick(loopSample), d: [0xFF, 0x06, txt.length, ...txt]});
  }
  const tracks = [trackBytes("conductor", [], 0, metas)];
  for (const name of CHANNEL_ORDER) {
    if (byCh[name]) tracks.push(trackBytes(name, byCh[name], MIDI_CHANNELS[name]));
  }
  const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const bytes = [0x4D, 0x54, 0x68, 0x64, ...u32(6), 0, 1, 0, tracks.length, PPQ >> 8, PPQ & 255];
  for (const t of tracks) bytes.push(0x4D, 0x54, 0x72, 0x6B, ...u32(t.length), ...t);
  return new Uint8Array(bytes);
}
