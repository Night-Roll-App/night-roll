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

// A track's sounding-pitch offset (tools/sounding.mjs, 2026-09-28): some
// PS1/N64 instruments' samples were recorded an octave — occasionally two —
// away from the written key, so the roll now shows the SOUNDING pitch,
// shifted from what the composer typed (Josh's ruling). The shift rides in
// the MIDI as a Text meta event (0xFF 0x01, unused anywhere else in this
// repo) — not the track name, which stays the renderer's own group name so
// tap-preview and the console render keep matching tracks by it. index.html's
// parseMidi reads it back into `track.offset`, so a tap can convert the
// roll's pitch back to the key the renderer needs (roll pitch − offset).
export function offsetMetaEvent(offset) {
  const text = "sounding:" + offset;
  const bytes = [...text].map(c => c.charCodeAt(0));
  return {t: 0, o: -2, d: [0xFF, 0x01, bytes.length, ...bytes]};
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

function fileBytes(tracks, ppq = PPQ) {
  const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const bytes = [0x4D, 0x54, 0x68, 0x64, ...u32(6), 0, 1, 0, tracks.length, ppq >> 8, ppq & 255];
  for (const t of tracks) bytes.push(0x4D, 0x54, 0x72, 0x6B, ...u32(t.length), ...t);
  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------- shared song writer
// The ONE SMF writer for the app's "song document" shape — index.html's live
// `song` object AND every on-device draft (compositions, pre-publish import
// captures): {ppq, timesig: [num, den], timesigs?: [{tick, num, den}, …],
// keysig?: {sf, minor}, tempos: [{tick, usq}], tracks: [{name, notes: [{t, d,
// p, v, gone?, duty?, ve?, ch?}], offset?, midiPan?}]}. open-items.md "FORMATS
// AUDIT" #1-2 (2026-09-29): index.html's OWN writeMidi used to be a separate,
// partial writer — commitImports re-encoded every capture through it and
// silently dropped CC10 pan, CC70 duty, the aftertouch envelope and per-note
// channel; it also wrote no key signature, a one-byte (not VLQ) track-name
// length, and masked names to &255 instead of UTF-8.
//
// index.html's writeMidi is a synchronous, byte-for-byte HAND PORT of this
// function, not a caller of it: writeMidi runs inside plain (non-async) click
// handlers and inside the vm test harness (tests/harness.mjs), which has no
// `importModuleDynamically` callback, so a real `import()` inside it throws —
// dynamic import is not an option here without giving up the one-file-app,
// no-build-step rule. tests/night-roll.test.mjs ("writeMidi / writeSongMidi
// agree byte-for-byte") pins the two together; touching this function without
// touching the port (and that test) reintroduces the drift the audit found.
//
// keysig is round-tripped ONLY when the song already carries one (read back
// by index.html's parseMidi from a file that already declared it, e.g. via
// tools/fix_keysigs.py) — never invented. Learning mode is the law: Josh's
// keys are his discoveries, not a tool's.
const NON_DRUM_CH = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]; // 15 melodic channels; 9 stays drums-only whatever the track count (the old ti<9?ti:(ti+1)&15 formula collided past 16 tracks)
export function isKitTrackName(name) { return /drum|percussion|kit|noise/i.test(name || ""); }
function trackChannel(ti, isKit) { return isKit ? 9 : NON_DRUM_CH[ti % NON_DRUM_CH.length]; }
function textMetaEvent(type, text) {
  const b = Array.from(new TextEncoder().encode(text)); // bytes are UTF-8 — the de-facto choice for MIDI text metas
  return [0xFF, type, ...vl(b.length), ...b]; // VLQ length: a >127-byte name no longer corrupts the file
}
export function writeSongMidi(song) {
  // phase 2 (docs/declared-vs-learner-spec.md "B"): a foreign file's raw
  // leftovers — matched back to the CURRENT track holding the same original
  // srcIndex (never by name, so a rename doesn't orphan them; a track the
  // catalog no longer has — deleted — simply gets no match, so its events
  // are dropped with it). An `empty: true` entry never had a Night Roll
  // track to delete (e.g. the conductor's own name/text) — it always
  // survives, merged into the meta/conductor track below. index.html's
  // writeMidi is the hand-port of this same split.
  const bySrcIndex = new Map();
  (song.tracks || []).forEach((tr, ti) => { if (tr.srcIndex !== undefined) bySrcIndex.set(tr.srcIndex, ti); });
  const extraByTrack = new Map(); // current track index -> [{t, o, d}]
  const metaEvs = [];
  for (const tp of song.tempos || []) metaEvs.push({t: tp.tick, o: 0, d: [0xFF, 0x51, 3, (tp.usq >> 16) & 255, (tp.usq >> 8) & 255, tp.usq & 255]});
  // song.source (docs/declared-vs-learner-spec.md C4): a foreign file's OWN
  // 0x58/0x59 history, kept verbatim at their original ticks — none if it had
  // none — with a "source:file" marker so a re-parse of this output round-
  // trips the distinction; song.timesig/song.keysig are ignored entirely in
  // this branch. No source: byte-identical to before (every chip capture,
  // every composition made here — nothing invented, Learning mode is the
  // law). index.html's writeMidi is the hand-port of this same split.
  if (song.source) {
    for (const ts of song.source.timesigs || []) metaEvs.push({t: ts.tick, o: 1, d: [0xFF, 0x58, 4, ts.num, Math.round(Math.log2(ts.den)), 24, 8]});
    for (const ks of song.source.keysigs || []) metaEvs.push({t: ks.tick, o: 2, d: [0xFF, 0x59, 2, ks.sf & 255, ks.minor ? 1 : 0]});
    metaEvs.push({t: 0, o: -1, d: textMetaEvent(0x01, "source:file")});
    for (const mt of song.source.metas || []) {
      if (mt.empty) {
        if (mt.name) metaEvs.push({t: 0, o: 3, d: textMetaEvent(0x03, mt.name)});
        for (const ev of mt.events) metaEvs.push({t: ev.t, o: 3, d: ev.bytes});
      } else {
        const ti = bySrcIndex.get(mt.index);
        if (ti === undefined) continue; // the track was deleted — its raw events go with it
        const list = extraByTrack.get(ti) || []; extraByTrack.set(ti, list);
        for (const ev of mt.events) list.push({t: ev.t, o: 0.75, d: ev.bytes});
      }
    }
  } else {
    const timesigs = song.timesigs && song.timesigs.length ? song.timesigs
      : [{tick: 0, num: (song.timesig || [4, 4])[0], den: (song.timesig || [4, 4])[1]}];
    for (const ts of timesigs) metaEvs.push({t: ts.tick, o: 1, d: [0xFF, 0x58, 4, ts.num, Math.round(Math.log2(ts.den)), 24, 8]});
    if (song.keysig) metaEvs.push({t: 0, o: 2, d: [0xFF, 0x59, 2, song.keysig.sf & 255, song.keysig.minor ? 1 : 0]});
  }
  metaEvs.sort((a, b) => a.t - b.t || a.o - b.o);
  const conductor = [];
  let lastT = 0;
  for (const e of metaEvs) { conductor.push(...vl(Math.max(0, e.t - lastT)), ...e.d); lastT = Math.max(lastT, e.t); }
  conductor.push(0, 0xFF, 0x2F, 0);
  const tracks = [conductor];
  (song.tracks || []).forEach((tr, ti) => {
    const isKit = isKitTrackName(tr.name);
    const ch0 = trackChannel(ti, isKit);
    const evs = [{t: 0, o: -3, d: textMetaEvent(0x03, tr.name || "track" + (ti + 1))}];
    // tools/sounding.mjs: the roll shows the sounding pitch, shifted from the
    // written key by tr.offset semitones — round-trips through every save
    if (tr.offset) evs.push({t: 0, o: -2, d: textMetaEvent(0x01, "sounding:" + tr.offset)});
    // CC10 = the .mid's OWN pan (a chip capture's channel); the "track:"
    // annotation's pan (tr.pan) overrides it at playback but lives in
    // rollnotes, never here — this is only what survives with no annotation
    if (tr.midiPan !== undefined) {
      const v = Math.max(0, Math.min(127, Math.round(tr.midiPan * 63 + 64)));
      evs.push({t: 0, o: -1, d: [0xB0 | ch0, 10, v]});
    }
    for (const ev of (extraByTrack.get(ti) || [])) evs.push(ev); // phase 2: this track's raw leftovers, verbatim
    let lastDuty = null;
    for (const n of tr.notes || []) {
      if (n.gone) continue;
      // channel 10 is the drum channel: only a kit track may use it, whatever
      // voice number a console capture carries (FFX / PS1, 2026-09-30)
      const ch = n.ch !== undefined && ((n.ch & 15) !== 9 || isKit) ? (n.ch & 15) : ch0;
      if (n.duty !== undefined && n.duty !== lastDuty) { evs.push({t: n.t, o: 0.5, d: [0xB0 | ch, 70, n.duty]}); lastDuty = n.duty; }
      evs.push({t: n.t, o: 1, d: [0x90 | ch, n.p & 127, (n.v || 80) & 127]});
      if (n.ve !== undefined) evs.push({t: n.t, o: 1.5, d: [0xA0 | ch, n.p & 127, n.ve & 127]});
      evs.push({t: n.t + n.d, o: 0, d: [0x80 | ch, n.p & 127, 64]});
    }
    evs.sort((a, b) => a.t - b.t || a.o - b.o);
    const body = [];
    let last = 0;
    for (const e of evs) { body.push(...vl(Math.max(0, e.t - last)), ...e.d); last = Math.max(last, e.t); }
    body.push(0, 0xFF, 0x2F, 0);
    tracks.push(body);
  });
  return fileBytes(tracks, song.ppq || PPQ);
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
    if (tr.offset) pre.push(offsetMetaEvent(tr.offset)); // tools/sounding.mjs: the roll shows the sounding pitch, this says by how much
    out.push(trackBytes(tr.name, tr.notes, tr.ch & 15, pre));
  }
  return fileBytes(out);
}
