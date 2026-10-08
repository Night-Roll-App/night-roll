// Chip note events -> a type-1 MIDI file so Night Roll can play captures.
// Onsets/durations are QUANTIZED to the beat grid (nearest 16th or triplet
// third): the driver counts frames and a beat is a non-integer number of
// frames, so raw times sit ±1 frame off the grid — hardware clock jitter,
// not music. Musical analysis wants notes on the beats they mean. Raw frame
// data stays intact upstream (events/.notes internals) if ever needed.
import { guessKit } from "../kit-guess.mjs";
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

// ---------------------------------------------------------------- glide (CC84)
// NIGHT-ROLL.md "Glide (CC84)". A note with `lg` is a CONTINUATION: the chip
// did not re-key it, so it plays on from the note before it on the same voice
// (no new attack). The .mid carries CC84 (Portamento Control) = the key it
// continues from, at its own tick just before its note-on. The link is to the
// note on the same channel that ENDS at its start (the first such in note
// order); none (edited apart) = no CC84. src/midi/parse.js glidePreds is the
// same rule for writeMidi and the synth. Returns Map(note -> predecessor's
// key) or null when no note has `lg`.
export function glidePredKeys(notes, chOf) {
  if (!notes.some(n => n.lg && !n.gone)) return null;
  const endAt = new Map(), m = new Map();
  for (const q of notes) if (!q.gone && q.d > 0) { const k = chOf(q) + ":" + (q.t + q.d); if (!endAt.has(k)) endAt.set(k, q); }
  for (const n of notes) if (n.lg && !n.gone) { const q = endAt.get(chOf(n) + ":" + n.t); if (q && q !== n) m.set(n, q.p & 127); }
  return m;
}
// Chain-relative bend, for capture builders (docs/plans/2026-10-07-capture-
// audit-2-and-glide.md §2 "The path"). notes: ONE voice's notes in time order,
// each {t, lg?, c0?, bend?: [{t, c}]} — c0 = the note's static detune from its
// own key at its start, in cents (any constant reference: only differences
// between notes of one chain are used, so an estimated root cancels out);
// bend in cents from the note's own start, as bendFromSeries gives it. The
// chain head (a note without lg) keeps v2's rule (0 at its start, static
// detune dropped); every continuation is shifted by (its c0 − the head's c0),
// so pitch is continuous across each link once the synth steps to the new
// key. A continuation with no head before it is a head. Mutates bend in
// place (a shifted bend always opens with a t 0 point) and deletes c0.
export function chainBends(notes) {
  let head = null;
  for (const n of notes) {
    if (!n.lg || !head) { head = n; continue; }
    const off = Math.round((n.c0 || 0) - (head.c0 || 0));
    if (!off) continue;
    const pts = n.bend && n.bend.length ? n.bend : [];
    n.bend = [...(pts.length && pts[0].t === 0 ? [] : [{t: 0, c: 0}]), ...pts].map(q => ({t: q.t, c: q.c + off}));
  }
  for (const n of notes) delete n.c0;
  return notes;
}
// a capture event's static detune from its key at its start, in cents: the
// SNES's `cents` (against the sample's root estimate), else from the NES/GB
// starting frequency `freq0`; 0 when the event carries neither
export function glideCents(e) {
  if (e.cents !== undefined && e.cents !== null) return e.cents;
  if (e.freq0 > 0 && e.midi != null) return 1200 * Math.log2(e.freq0 / 440) + 6900 - 100 * e.midi;
  return 0;
}
export function trackBytes(name, notes, ch, metas = []) {
  const evs = [];
  if (name) evs.push({t: 0, d: [0xFF, 0x03, name.length, ...[...name].map(c => c.charCodeAt(0))]});
  for (const m of metas) evs.push(m);
  // in-note events (duty changes, bends) stop where the next note starts: a
  // note stretched to the 40-tick minimum may overlap its successor, and a
  // CC70 or bend there belongs to the successor
  const nextAt = new Map();
  const timed = notes.some(n => n.pan || n.rev || n.prog !== undefined);
  if (notes.some(n => n.bend || n.duties) || timed) {
    const byT = [...notes].sort((a, b) => a.t - b.t);
    byT.forEach((n, k) => nextAt.set(n, Math.min(n.t + n.d, k + 1 < byT.length ? byT[k + 1].t : Infinity)));
    // controller timelines (SNES capture v2): per-note [{t: ticks from its
    // start, v}] for pan (CC10) and the echo send (CC91), and a program per
    // note. The first note's value opens the track at tick 0; after that only
    // changes, at a note's start (before its note-on) or inside it, never
    // past the next note's start. A pan that never leaves centre and a send
    // that stays 0 write nothing (the defaults).
    if (timed) {
      const line = (get, bytes, idle) => {
        const pts = [];
        for (const n of byT) for (const q of get(n) || []) if (!q.t || n.t + q.t < nextAt.get(n)) pts.push({t: n.t + q.t, o: q.t ? 1.25 : 0.75, v: q.v});
        if (!pts.length || pts.every(q => q.v === idle)) return;
        let cur = null;
        pts.forEach((q, k) => { if (q.v !== cur) { evs.push({t: k ? q.t : 0, o: k ? q.o : 0.75, d: bytes(q.v)}); cur = q.v; } });
      };
      line(n => n.prog !== undefined ? [{t: 0, v: n.prog}] : null, v => [0xC0 | ch, v & 127], null);
      line(n => n.pan, v => [0xB0 | ch, 10, v], 64);
      line(n => n.rev, v => [0xB0 | ch, 91, v], 0);
    }
    // pitch bend (the chip's vibrato and absorbed slide steps, 14-bit signed
    // around 0): a note starts from its own first point or from centre
    let bendNow = 0;
    for (const n of byT) {
      const pts = n.bend || [], start = pts.length && pts[0].t === 0 ? pts[0].v : 0;
      const pb = v => { const x = Math.max(0, Math.min(16383, v + 8192)); return [0xE0 | ch, x & 127, x >> 7]; };
      if (start !== bendNow) { evs.push({t: n.t, o: 0.75, d: pb(start)}); bendNow = start; }
      for (const q of pts) if (q.t > 0 && n.t + q.t < nextAt.get(n) && q.v !== bendNow) { evs.push({t: n.t + q.t, o: 1.25, d: pb(q.v)}); bendNow = q.v; }
    }
  }
  let lastDuty = null;
  const preds = glidePredKeys(notes, () => ch);
  for (const n of notes) {
    // duty (chip timbre) rides as CC70 ahead of the note it changes on —
    // Night Roll's parser reads it back; other DAWs just see a sound ctrl
    if (n.duty !== undefined && n.duty !== lastDuty) {
      evs.push({t: n.t, o: 0.5, d: [0xB0 | ch, 70, n.duty]});
      lastDuty = n.duty;
    }
    // …and at each change while the note is held ({t: ticks from its start, v})
    if (n.duties) for (const q of n.duties) if (q.t > 0 && n.t + q.t < nextAt.get(n) && q.v !== lastDuty) { evs.push({t: n.t + q.t, o: 0.5, d: [0xB0 | ch, 70, q.v]}); lastDuty = q.v; }
    // glide link: CC84 = the key this note continues from, just before its on
    if (preds && preds.has(n)) evs.push({t: n.t, o: 0.9, d: [0xB0 | ch, 84, preds.get(n)]});
    evs.push({t: n.t, o: 1, d: [0x90 | ch, n.p, n.v]});
    // decay target as polyphonic aftertouch right after the on — Night
    // Roll reads it back as the note's end volume; DAWs see key pressure
    if (n.ve !== undefined) evs.push({t: n.t, o: 1.5, d: [0xA0 | ch, n.p, n.ve]});
    // volume shape: aftertouch at ticks INSIDE the note (never the note-on
    // tick, which stays `ve`), level = r × velocity — the chip's in-note
    // volume corners (makeMidi's shapeFromSeries)
    if (n.env) for (const q of n.env) if (q.t > 0 && q.t < n.d) evs.push({t: n.t + q.t, o: 1.5, d: [0xA0 | ch, n.p, Math.max(0, Math.min(127, Math.round(q.r * n.v)))]});
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
// dpcm (the sample channel, notes.mjs dpcmHits) comes after noise: a song
// that uses it gains a LAST track, so no existing track number moves
const NES_CHANS = {pulse1: 0, pulse2: 1, triangle: 2, noise: 9, dpcm: 9};

// A held note's volume series ([[frames from its start, vol]…], tools/nsf/notes.mjs) -> its
// volume shape [{t, r}] (src/model/noteshape.js): the level sampled every
// frame, thinned to its corners (Ramer–Douglas–Peucker, tolerance under one
// volume step, so a 2-frame staircase 8→15 becomes one line), t in ticks
// from the note's start, r = level ÷ velocity, the last level held to the end.
// Only for a series that RISES after the attack: a fall alone is still the
// one-number `ve` it always was, so a decaying capture writes the same bytes
// as before. Generic: it reads the chip's own volume writes, nothing per game.
// opts (SNES capture v2, whose series is the DSP's VOL × envelope on a
// 0–127 scale): falls — a shape for any movement, not only a rise (the
// ADSR decay IS the note's loudness curve); tol — the RDP tolerance in
// series units; floor — the lowest written level; attack — the series' own
// first level, when it differs from the velocity, is written one tick after
// the onset (the note-on tick itself is `ve`), so a slow attack starts low.
export function shapeFromSeries(e, v, d, ticksPerFrame, volMax = 15, {falls = false, tol = 0.75, floor = 8, attack = false} = {}) {
  const sr = e.volSeries, n = e.endFrame - e.startFrame;
  if (!sr || sr.length < 2 || n < 2 || e.vol == null) return undefined;
  const lv = [];
  for (let f = 0, k = 0, cur = sr[0][1]; f < n; f++) {
    while (k < sr.length && sr[k][0] <= f) cur = sr[k++][1];
    lv.push(cur);
  }
  if (!(falls ? lv.some(x => Math.abs(x - e.vol) > tol) : lv.some(x => x > e.vol))) return undefined;
  const keep = new Set([0, n - 1]);
  const rdp = (a, b) => {
    let best = -1, bestD = tol; // NES: < one 4-bit step
    for (let i = a + 1; i < b; i++) {
      const dv = Math.abs(lv[i] - (lv[a] + (lv[b] - lv[a]) * (i - a) / (b - a)));
      if (dv > bestD) { best = i; bestD = dv; }
    }
    if (best < 0) return;
    keep.add(best); rdp(a, best); rdp(best, b);
  };
  rdp(0, n - 1);
  const level = vol => Math.max(floor, Math.round(vol / volMax * 127)); // the velocity scale
  const pts = [];
  for (const i of [...keep].sort((a, b) => a - b)) {
    const t = i === 0 && attack && level(lv[0]) !== v ? 1 : Math.round(i * ticksPerFrame);
    if (t <= 0 || t >= d) continue;
    const l = level(lv[i]), prev = pts.length ? pts[pts.length - 1].l : v;
    if (l === prev && i === n - 1) continue; // flat to the end: the hold is implied
    if (pts.length && pts[pts.length - 1].t === t) { pts[pts.length - 1].l = l; continue; } // two corners on one tick: the later level
    pts.push({t, l});
  }
  return pts.length ? pts.map(q => ({t: q.t, r: q.l / v})) : undefined;
}
// A held note's pitch series ([[frames from its start, cents from its
// starting frequency]…], tools/nsf/notes.mjs bendSeries) -> bend points
// [{t, c}] (ticks from the note's start, cents): sampled every frame, thinned
// to its corners (RDP, 5 cents — under any audible vibrato depth), the
// note's own first point kept when it is not centre (an absorbed slide starts
// below or above its target). undefined when the pitch never moved.
export function bendFromSeries(e, d, ticksPerFrame) {
  const sr = e.bendSeries, n = e.endFrame - e.startFrame;
  if (!sr || n < 1 || !sr.some(([, c]) => c !== 0)) return undefined;
  const cv = [];
  for (let f = 0, k = 0, cur = sr[0][1]; f < n; f++) {
    while (k < sr.length && sr[k][0] <= f) cur = sr[k++][1];
    cv.push(cur);
  }
  const keep = new Set([0, n - 1]);
  const rdp = (a, b) => {
    let best = -1, bestD = 5;
    for (let i = a + 1; i < b; i++) {
      const dv = Math.abs(cv[i] - (cv[a] + (cv[b] - cv[a]) * (i - a) / (b - a)));
      if (dv > bestD) { best = i; bestD = dv; }
    }
    if (best < 0) return;
    keep.add(best); rdp(a, best); rdp(best, b);
  };
  rdp(0, n - 1);
  const pts = [];
  for (const i of [...keep].sort((a, b) => a - b)) {
    const t = Math.round(i * ticksPerFrame);
    if (t >= d) continue;
    const last = pts[pts.length - 1];
    if (last && last.t === t) { last.c = cv[i]; continue; }
    if ((last ? last.c : 0) === cv[i]) continue;
    pts.push({t, c: cv[i]});
  }
  return pts.length ? pts : undefined;
}
// A pulse note's duty series (notes.mjs dutySeries) -> [{t, v}] at each
// change inside the note, ticks from its start; undefined when it held still
export function dutiesFromSeries(e, d, ticksPerFrame) {
  const sr = e.dutySeries;
  if (!sr || sr.length < 2) return undefined;
  const pts = [];
  let cur = e.duty;
  for (const [f, v] of sr) {
    const t = Math.round(f * ticksPerFrame);
    if (f <= 0 || t <= 0 || t >= d) continue;
    const last = pts[pts.length - 1];
    if (last && last.t === t) { last.v = v; cur = v; continue; }
    if (v === cur) continue;
    pts.push({t, v}); cur = v;
  }
  const out = pts.filter((q, k) => q.v !== (k ? pts[k - 1].v : e.duty));
  return out.length ? out : undefined;
}
// A controller series ([[frames from the note's start, value]…], SNES
// capture v2's panSeries/echoSeries) -> [{t, v}] in ticks from the note's
// start: the value at the start (t 0), then every change inside the note,
// unthinned (the synth ramps 15 ms into each event, so dropping the points
// of a sweep would turn it into steps). undefined without a series.
export function ccFromSeries(sr, d, ticksPerFrame) {
  if (!sr || !sr.length) return undefined;
  const pts = [];
  for (const [f, v] of sr) {
    const t = f <= 0 ? 0 : Math.round(f * ticksPerFrame);
    if (t >= d && t > 0) continue;
    const last = pts[pts.length - 1];
    if (last && last.t === t) last.v = v;
    else if (!last || last.v !== v) pts.push({t, v});
  }
  return pts.length ? pts : undefined;
}
// DPCM samples -> drum keys, one per distinct sample (notes.mjs dpcmHits'
// `midi` = its first-use number): General MIDI keys guessed from rhythm
// (tools/kit-guess.mjs, the rules PS1/N64 drums use — backbeat = snare,
// downbeat = kick, busiest = hats), then any key two samples share moves to
// the next free percussion key, so distinct samples never merge.
const GM_PERC = Array.from({length: 47}, (_, k) => 35 + k); // 35…81
function dpcmKeys(notes, beatTicks, barBeats) {
  const by = new Map();
  for (const n of notes) { if (!by.has(n.sample)) by.set(n.sample, {key: n.sample, notes: []}); by.get(n.sample).notes.push({tick: n.t}); }
  const voices = guessKit([...by.values()], {beatTicks, barBeats});
  const taken = new Set(), out = new Map();
  for (const v of [...voices].sort((a, b) => a.key - b.key)) {
    let p = v.gm;
    if (taken.has(p)) p = GM_PERC.find(k => !taken.has(k) && k > v.gm) || GM_PERC.find(k => !taken.has(k));
    taken.add(p); out.set(v.key, p);
  }
  return out;
}
// RPN 0 (pitch bend sensitivity) on a channel: ±semis, then RPN null
export function bendRangeMetas(ch, semis) {
  return [[101, 0], [100, 0], [6, semis], [38, 0], [101, 127], [100, 127]].map(([c, v]) => ({t: 0, o: -0.5, d: [0xB0 | ch, c, v]}));
}
export function makeMidi(events, {bpm, tsNum = 4, tsDen = 4, frameSec, snap = true, chans = NES_CHANS, drum = noiseDrum, volMax = 15, shape = undefined}) {
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
  const linked = events.some(e => e.lg);
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
    const tpf = frameSec / (60 / bpm) * PPQ;
    const env = e.volSeries ? shapeFromSeries(e, v, d, tpf, volMax, shape) : undefined;
    const bend = e.bendSeries ? bendFromSeries(e, d, tpf) : undefined;
    const duties = e.dutySeries ? dutiesFromSeries(e, d, tpf) : undefined;
    // SNES capture v2: pan (VOL L/R), echo send, and the sample (SRCN) as
    // the program — a noise voice plays the noise generator, not its sample;
    // an SRCN past 127 has no program number (never folded onto another's)
    const pan = e.panSeries ? ccFromSeries(e.panSeries, d, tpf) : undefined;
    const rev = e.echoSeries ? ccFromSeries(e.echoSeries, d, tpf) : undefined;
    const prog = e.prog !== undefined ? e.prog // a chip's own timbre number (Game Boy wave table, capture v2)
      : e.srcn !== undefined && e.srcn <= 127 && e.drum == null && e.noiseClock === undefined ? e.srcn : undefined;
    (byCh[key] = byCh[key] || []).push({t, d, p, v, duty: e.duty, ve, ...(env ? {env} : {}), ...(bend ? {bend} : {}), ...(duties ? {duties} : {}),
      ...(pan ? {pan} : {}), ...(rev ? {rev} : {}), ...(prog !== undefined ? {prog} : {}),
      ...(e.channel === "dpcm" ? {sample: e.midi} : {}),
      ...(e.lg ? {lg: 1} : {}), ...(linked ? {c0: glideCents(e)} : {})});
  }
  // glide links (a capture marks e.lg from the chip's own no-re-key signal):
  // continuations' bends become chain-relative before the range is sized
  if (linked) for (const notes of Object.values(byCh)) chainBends([...notes].sort((a, b) => a.t - b.t));
  if (byCh.dpcm && byCh.dpcm.length) {
    const keys = dpcmKeys(byCh.dpcm, PPQ * 4 / tsDen, tsNum);
    for (const n of byCh.dpcm) { n.p = keys.get(n.sample); delete n.sample; }
  }
  // bend points in cents -> 14-bit values against the channel's range: ±2
  // (the GM default, nothing written) unless a slide reaches further, then
  // RPN 0 at tick 0 says how far (capped at ±24; beyond it clamps)
  const rangeOf = {};
  for (const [name, notes] of Object.entries(byCh)) {
    const most = Math.max(0, ...notes.flatMap(n => (n.bend || []).map(q => Math.abs(q.c))));
    if (!most) continue;
    const semis = most > 200 ? Math.min(24, Math.ceil(most / 100)) : 2;
    rangeOf[name] = semis;
    for (const n of notes) if (n.bend) n.bend = n.bend.map(q => ({t: q.t, v: Math.max(-8192, Math.min(8191, Math.round(q.c / (semis * 100) * 8192)))}));
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
    tracks.push(trackBytes(name, notes, chans[name], rangeOf[name] > 2 ? bendRangeMetas(chans[name], rangeOf[name]) : []));
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
// p, v, gone?, duty?, ve?, ch?, env?, duties?, lg?}], offset?, midiPan?, ctl?}]}. open-items.md "FORMATS
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
export function isKitTrackName(name) { return /drum|percussion|kit|noise|dpcm/i.test(name || ""); } // dpcm: the NES sample channel's hits (capture v2)
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
  // song.timesigs (plural, docs/provenance-plan.md Q9): publishSong's own
  // baked meter, present only on an import whose declared meter overrides
  // the file's own verbatim history for what's written (Q6: absent, the
  // file's own source.timesigs writes back verbatim) — same override tempo
  // already gets above. index.html's writeMidi mirrors this split too.
  if (song.source) {
    const timesigs = song.timesigs && song.timesigs.length ? song.timesigs : (song.source.timesigs || []);
    for (const ts of timesigs) metaEvs.push({t: ts.tick, o: 1, d: [0xFF, 0x58, 4, ts.num, Math.round(Math.log2(ts.den)), 24, 8]});
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
    // channel controllers tr.ctl [{t, ch, c, v}] (src/midi/parse.js "channel
    // controllers"): c = CC number, "pb" bend (signed) or "pg" program
    for (const e of tr.ctl || []) {
      const ch = e.ch !== undefined && ((e.ch & 15) !== 9 || isKit) ? (e.ch & 15) : ch0;
      let d;
      if (e.c === "pb") { const x = Math.max(0, Math.min(16383, Math.round(e.v) + 8192)); d = [0xE0 | ch, x & 127, x >> 7]; }
      else if (e.c === "pg") d = [0xC0 | ch, e.v & 127];
      else d = [0xB0 | ch, e.c & 127, Math.max(0, Math.min(127, Math.round(e.v)))];
      evs.push({t: e.t, o: 0.75, d});
    }
    let lastDuty = null;
    // channel 10 is the drum channel: only a kit track may use it, whatever
    // voice number a console capture carries (FFX / PS1, 2026-09-30)
    const chOf = n => n.ch !== undefined && ((n.ch & 15) !== 9 || isKit) ? (n.ch & 15) : ch0;
    const preds = glidePredKeys(tr.notes || [], chOf);
    for (const n of tr.notes || []) {
      if (n.gone) continue;
      const ch = chOf(n);
      if (n.duty !== undefined && n.duty !== lastDuty) { evs.push({t: n.t, o: 0.5, d: [0xB0 | ch, 70, n.duty]}); lastDuty = n.duty; }
      if (n.duties) for (const q of n.duties) if (q.t > 0 && q.t < n.d) { evs.push({t: n.t + q.t, o: 0.5, d: [0xB0 | ch, 70, q.v & 3]}); lastDuty = q.v & 3; } // duty changes inside the note (see trackBytes)
      if (preds && preds.has(n)) evs.push({t: n.t, o: 0.9, d: [0xB0 | ch, 84, preds.get(n)]}); // glide link (see glidePredKeys)
      evs.push({t: n.t, o: 1, d: [0x90 | ch, n.p & 127, (n.v || 80) & 127]});
      if (n.ve !== undefined) evs.push({t: n.t, o: 1.5, d: [0xA0 | ch, n.p & 127, n.ve & 127]});
      if (n.env) for (const q of n.env) if (q.t > 0 && q.t < n.d) evs.push({t: n.t + q.t, o: 1.5, d: [0xA0 | ch, n.p & 127, Math.max(0, Math.min(127, Math.round(q.r * ((n.v || 80) & 127))))]}); // volume shape (see trackBytes)
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
