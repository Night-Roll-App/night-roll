// Chip note events -> a type-1 MIDI file so Night Roll can play captures.
// Onsets/durations are QUANTIZED to the beat grid (nearest 16th or triplet
// third): the driver counts frames and a beat is a non-integer number of
// frames, so raw times sit ±1 frame off the grid — hardware clock jitter,
// not music. Musical analysis wants notes on the beats they mean. Raw frame
// data stays intact upstream (events/.notes internals) if ever needed.
export const PPQ = 480; // exported: tools/vgm/midi-write.mjs builds on the same track encoder

// snap a beat position to the nearest 16th (k/4) or triplet slot (k/6 —
// covers triplet 8ths AND triplet 16ths; the epilogue uses the latter)
export function snapBeat(b) {
  const s16 = Math.round(b * 4) / 4;
  const s6 = Math.round(b * 6) / 6;
  return Math.abs(b - s16) <= Math.abs(b - s6) ? s16 : s6;
}

export function vl(v) {
  // negative deltas never terminate (sign-preserving >>) — the loop
  // allocates unbounded memory and kills the tab. Fail loudly instead.
  if (v < 0) throw new Error("negative MIDI delta " + v + " — timing bug upstream");
  const out = [v & 0x7F];
  v >>= 7;
  while (v) { out.push((v & 0x7F) | 0x80); v >>= 7; }
  return out.reverse();
}

export function trackBytes(name, notes, ch, metas = []) {
  const evs = [];
  if (name) evs.push({t: 0, d: [0xFF, 0x03, name.length, ...[...name].map(c => c.charCodeAt(0))]});
  for (const m of metas) evs.push(m);
  let lastDuty = null;
  for (const n of notes) {
    // duty (chip timbre) rides as CC70 ahead of the note it changes on —
    // Night Roll's parser reads it back; other DAWs just see a sound ctrl
    if (n.duty !== undefined && n.duty !== lastDuty) {
      evs.push({t: n.t, o: 0.5, d: [0xB0 | ch, 70, n.duty]});
      lastDuty = n.duty;
    }
    evs.push({t: n.t, o: 1, d: [0x90 | ch, n.p, n.v]});
    // decay target as polyphonic aftertouch right after the on — Night
    // Roll reads it back as the note's end volume; DAWs see key pressure
    if (n.ve !== undefined) evs.push({t: n.t, o: 1.5, d: [0xA0 | ch, n.p, n.ve]});
    evs.push({t: n.t + n.d, o: 0, d: [0x80 | ch, n.p, 64]});
  }
  evs.sort((a, b) => a.t - b.t || (a.o || 0) - (b.o || 0));
  const out = [];
  let last = 0;
  for (const e of evs) { out.push(...vl(e.t - last), ...e.d); last = e.t; }
  out.push(0, 0xFF, 0x2F, 0);
  return out;
}

// NES noise has 16 period settings, not pitches; map to the app's drum kit
function noiseDrum(idx) { return idx < 6 ? 42 : idx < 12 ? 38 : 35; } // hat / snare / kick

// chans: channel name -> MIDI channel (track order follows it); drum: noise
// index -> drum note. Defaults are the NES; the Game Boy pipeline passes its
// own (wave instead of triangle, its LFSR shift scale) and shares the rest.
// volMax: the chip's full-scale level for e.vol (NES 4-bit = 15; the SNES
// pipeline passes 127). Channels the map does not name (SNES voice0-7) get
// MIDI channels in order of appearance, skipping 9; an event with an
// explicit `drum` (a GM number) is a percussion hit on channel 9 whatever
// its channel name — SNES noise voices.
const NES_CHANS = {pulse1: 0, pulse2: 1, triangle: 2, noise: 9};
export function makeMidi(events, {bpm, tsNum = 4, tsDen = 4, frameSec, snap = true, chans = NES_CHANS, drum = noiseDrum, volMax = 15}) {
  chans = {...chans, drums: 9};
  const usq = Math.round(6e7 / bpm);
  // snap:false keeps raw hardware timing — for through-composed pieces with
  // tempo changes/fermatas (epilogue) that no single grid can follow
  const toTick = frames => {
    const b = frames * frameSec / (60 / bpm);
    return Math.round((snap ? snapBeat(b) : b) * PPQ);
  };
  const byCh = {};
  for (const name of Object.keys(chans)) byCh[name] = [];
  for (const e of events) {
    const t = toTick(e.startFrame);
    const d = Math.max(40, toTick(e.endFrame) - t); // min = a quantized 12th
    const p = e.drum != null ? e.drum : e.channel === "noise" ? drum(e.midi) : e.midi;
    if (p < 0 || p > 127) continue;
    // chip volume -> velocity (accent data from the ROM); triangle and
    // envelope-mode notes have no level, so they get a neutral 96
    const v = e.vol == null ? 96 : Math.max(8, Math.round(e.vol / volMax * 127));
    // end-volume of the software envelope rides along (0-127 like velocity)
    const ve = e.volEnd != null && e.vol != null && e.volEnd < e.vol
      ? Math.max(8, Math.round(e.volEnd / volMax * 127)) : undefined;
    const key = e.drum != null ? "drums" : e.channel;
    (byCh[key] = byCh[key] || []).push({t, d, p, v, duty: e.duty, ve});
  }
  const metas = [
    {t: 0, d: [0xFF, 0x58, 4, tsNum, Math.round(Math.log2(tsDen)), 24, 8]},
    {t: 0, d: [0xFF, 0x51, 3, (usq >> 16) & 255, (usq >> 8) & 255, usq & 255]},
  ];
  const tracks = [trackBytes("conductor", [], 0, metas)];
  const used = new Set(Object.entries(byCh).filter(([n, l]) => l.length && chans[n] != null).map(([n]) => chans[n]));
  let nextCh = 0;
  for (const [name, notes] of Object.entries(byCh)) {
    if (!notes.length) continue;
    if (chans[name] == null) { // SNES voices: first free channel in this file, never 9
      while (nextCh === 9 || used.has(nextCh)) nextCh++;
      chans[name] = nextCh; used.add(nextCh);
    }
    tracks.push(trackBytes(name, notes, chans[name]));
  }
  return fileBytes(tracks);
}

function fileBytes(tracks) {
  const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const bytes = [0x4D, 0x54, 0x68, 0x64, ...u32(6), 0, 1, 0, tracks.length, PPQ >> 8, PPQ & 255];
  for (const t of tracks) bytes.push(0x4D, 0x54, 0x72, 0x6B, ...u32(t.length), ...t);
  return new Uint8Array(bytes);
}


// Sources that already carry beat time (N64 sequences: exact 48ths) skip
// the frame->beat fit above. tracks: [{name, ch, program?, pan?, cc?, notes:
// [{t, d, p, v}]}] with t/d in PPQ ticks; tempos: [{t, bpm}] in PPQ ticks.
// pan (0..127, 64 centre) is written as CC10 at tick 0 before the first
// note; cc: [{t, cc, v}] are later control changes at their ticks.
export function makeMidiTracks(tracks, {tempos = [{t: 0, bpm: 120}], tsNum = 4, tsDen = 4} = {}) {
  const metas = [{t: 0, d: [0xFF, 0x58, 4, tsNum, Math.round(Math.log2(tsDen)), 24, 8]}];
  for (const {t, bpm} of tempos) {
    const usq = Math.round(6e7 / bpm);
    metas.push({t, d: [0xFF, 0x51, 3, (usq >> 16) & 255, (usq >> 8) & 255, usq & 255]});
  }
  const out = [trackBytes("conductor", [], 0, metas)];
  for (const tr of tracks) {
    const pre = tr.program == null ? [] : [{t: 0, o: -1, d: [0xC0 | (tr.ch & 15), tr.program & 0x7F]}];
    if (tr.pan != null) pre.push({t: 0, o: -0.5, d: [0xB0 | (tr.ch & 15), 10, Math.max(0, Math.min(127, Math.round(tr.pan)))]});
    for (const c of tr.cc || []) pre.push({t: c.t, o: -0.5, d: [0xB0 | (tr.ch & 15), c.cc & 0x7F, Math.max(0, Math.min(127, Math.round(c.v)))]});
    out.push(trackBytes(tr.name, tr.notes, tr.ch & 15, pre));
  }
  return fileBytes(out);
}
