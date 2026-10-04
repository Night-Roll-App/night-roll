// src/theory/facts/bass.js — bass facts (docs/theory-toolkit.md §5): the
// lowest sounding note at every beat (a note ringing into the beat beats
// one that starts later in it), motion between consecutive beats as
// repeated/step/leap with direction, pedal points (one pitch class holding
// or repeating ≥ N beats — `how`: held | repeated), and the lowest note under each of the user's own
// chord bands. Which tracks count is the caller's choice (default: every
// non-drum track together). Pure.
import { factsTracks, factsBQ, factsPitch, factsPc, factsMotionKind, factsChordSpans, factsDeclaredSf, factsEndTick } from "./common.js";
import { factsSpanTicks } from "./melody.js";

// a note sounding AT the beat's start (ringing in, or starting right on it)
// outranks one that enters later in the beat; lowest pitch among equals
export function factsLowestIn(pool, start, end) {
  let best = null;
  for (const n of pool) {
    if (n.t >= end || n.t + n.d <= start) continue;
    const atStart = n.t <= start;
    if (!best || (atStart && !best.atStart) || (atStart === best.atStart && n.p < best.n.p)) best = {n, atStart, ringing: n.t < start};
  }
  return best;
}

export function factsPedals(doc, perBeat, pedalBeats, sf) {
  const pedals = [];
  let run = null;
  const close = () => { if (run && run.beats >= pedalBeats) pedals.push({pitch: factsPitch(run.firstMidi, sf), pitchClass: factsPitch(run.firstMidi, sf).replace(/-?\d+$/, ""), from: run.from, to: run.to, beats: run.beats, samePitch: run.samePitch, how: run.newOnsets ? "repeated" : "held"}); run = null; };
  for (const b of perBeat) {
    if (b.midi === null) { close(); continue; }
    if (run && factsPc(b.midi) === run.pc) {
      run.beats++; run.to = b.at; run.samePitch = run.samePitch && b.midi === run.firstMidi; run.newOnsets = run.newOnsets || b.onset;
    } else { close(); run = {pc: factsPc(b.midi), firstMidi: b.midi, from: b.at, to: b.at, beats: 1, samePitch: true, newOnsets: false}; }
  }
  close();
  return pedals;
}

// opts: track (default all non-drum tracks pooled), from/to, pedalBeats
// (default 4), sf (spelling only)
export function bassFacts(doc, opts = {}) {
  const [t0, t1raw] = factsSpanTicks(doc, opts);
  const t1 = t1raw === null ? factsEndTick(doc) : t1raw;
  const sf = opts.sf !== undefined ? opts.sf : factsDeclaredSf(doc, t0);
  const tracks = factsTracks(doc, {track: opts.track});
  const pool = [];
  for (const tr of tracks) for (const n of tr.notes) pool.push({...n, track: tr.name});
  pool.sort((a, b) => a.t - b.t);
  const perBeat = [];
  for (let b = t0; b < t1; b += doc.beatTicks) {
    const hit = factsLowestIn(pool, b, b + doc.beatTicks);
    perBeat.push(hit ? {at: factsBQ(doc, b), pitch: factsPitch(hit.n.p, sf), midi: hit.n.p, track: hit.n.track, onset: !hit.ringing}
                     : {at: factsBQ(doc, b), pitch: null, midi: null, track: null, onset: false});
  }
  const motion = [];
  const counts = {repeated: 0, step: 0, leap: 0, up: 0, down: 0};
  for (let i = 1; i < perBeat.length; i++) {
    const a = perBeat[i - 1], b = perBeat[i];
    if (a.midi === null || b.midi === null) continue;
    const d = b.midi - a.midi, kind = factsMotionKind(Math.abs(d));
    counts[kind]++;
    if (d > 0) counts.up++; else if (d < 0) counts.down++;
    motion.push({at: b.at, from: a.pitch, to: b.pitch, semitones: d, kind});
  }
  const bands = factsChordSpans(doc).filter(s => s.start >= t0 && s.start < t1).map(s => {
    let lowest = null;
    for (const n of pool) if (n.t < s.end && n.t + n.d > s.start && (!lowest || n.p < lowest.p)) lowest = n;
    return {at: factsBQ(doc, s.start), to: factsBQ(doc, s.end), lowest: lowest ? factsPitch(lowest.p, sf) : null, track: lowest ? lowest.track : null};
  });
  return {
    span: {from: factsBQ(doc, t0), to: factsBQ(doc, t1)},
    tracks: tracks.map(t => t.name),
    perBeat,
    motion: {counts, list: motion},
    pedals: factsPedals(doc, perBeat, opts.pedalBeats || 4, sf),
    perChordBand: bands.length ? bands : null,
  };
}
