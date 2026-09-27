// Stage 2: APU register log -> note events, channel identity intact.
// Discovery-mode rules: pitch, time, duration, channel. Nothing interpretive.
import { snapBeat } from "./midi-write.mjs";

// unthrottled yield (background tabs clamp setTimeout to ~1/sec; MessageChannel is not throttled)
let _mc = null;
function microYield() {
  if (typeof MessageChannel === "undefined") return new Promise(r => setTimeout(r, 0));
  if (!_mc) _mc = new MessageChannel();
  return new Promise(r => { _mc.port1.onmessage = () => r(); _mc.port2.postMessage(0); });
}
const CLOCK = 1_789_773; // NTSC CPU Hz

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function pitchName(midi) { return NAMES[midi % 12] + (Math.floor(midi / 12) - 1); }

function midiFromFreq(f) { return Math.round(69 + 12 * Math.log2(f / 440)); }

// Reconstruct per-channel note events from the write log.
// A channel sounds when: enabled in $4015, its volume is audible, and its
// period is in range. A new note begins when the derived MIDI pitch changes
// or the channel comes back from silence.
export function reconstruct(apuLog, frames, frameSec) {
  const ch = {
    pulse1: {base: 0x4000, on: false, midi: null, vol: 0, period: 0, enabled: false},
    pulse2: {base: 0x4004, on: false, midi: null, vol: 0, period: 0, enabled: false},
    triangle: {base: 0x4008, on: false, midi: null, vol: 1, period: 0, enabled: false, linear: 0},
    noise: {base: 0x400C, on: false, midi: null, vol: 0, period: 0, enabled: false},
  };
  const events = []; // {channel, startFrame, endFrame|null, midi, periodValue}
  const open = {};   // channel -> event

  const freqOf = (name, c) => {
    if (name === "triangle") return CLOCK / (32 * (c.period + 1));
    return CLOCK / (16 * (c.period + 1)); // pulses
  };
  const audible = (name, c) => {
    if (!c.enabled) return false;
    if (name === "triangle") return c.linear > 0 && c.period > 1;
    if (name === "noise") return c.vol > 0;
    return c.vol > 0 && c.period > 7 && c.period < 0x800;
  };

  const update = (name, c, frame) => {
    const isOn = audible(name, c);
    let midi = null, freq = null;
    if (isOn && name !== "noise") { freq = freqOf(name, c); midi = midiFromFreq(freq); }
    if (isOn && name === "noise") midi = c.period & 0x0F; // noise "pitch" = period index, not a MIDI note
    const cur = open[name];
    // vibrato guard (MM2 bug 2026-08-16): drivers wobble the period every
    // frame for vibrato; when the wobble crosses a semitone's rounding
    // boundary a strict midi comparison shredded held notes into 1-frame
    // confetti. Judge against the note's STARTING frequency: within ±70
    // cents it's the same note singing; a real slide or step exceeds it.
    if (cur && isOn && name !== "noise" && cur.midi !== midi &&
        frame > cur.startFrame && // same-frame changes are note SETUP (vol lands before period), not vibrato
        cur.freq0 && Math.abs(1200 * Math.log2(freq / cur.freq0)) < 70) return;
    if (cur && (!isOn || cur.midi !== midi)) { cur.endFrame = frame; delete open[name]; }
    if (isOn && !open[name]) {
      // vol: the 4-bit level at note start — accent data straight from the
      // ROM. Only meaningful in constant-volume mode (else the field is the
      // envelope period) and never on the triangle (no volume control).
      const vol = name !== "triangle" && c.constVol ? c.vol : null;
      const duty = (name === "pulse1" || name === "pulse2") ? c.duty : undefined; // pulse timbre at note start
      open[name] = {channel: name, startFrame: frame, endFrame: null, midi, periodValue: c.period, vol, volEnd: vol, duty, freq0: freq};
      events.push(open[name]);
    }
  };

  for (const w of apuLog) {
    const {addr, value, frame} = w;
    if (addr === 0x4015) {
      ch.pulse1.enabled = !!(value & 1);
      ch.pulse2.enabled = !!(value & 2);
      ch.triangle.enabled = !!(value & 4);
      ch.noise.enabled = !!(value & 8);
      for (const [name, c] of Object.entries(ch)) update(name, c, frame);
      continue;
    }
    for (const [name, c] of Object.entries(ch)) {
      const r = addr - c.base;
      if (r < 0 || r > 3) continue;
      if (r === 0) {
        if (name === "triangle") c.linear = value & 0x7F;
        else {
          c.vol = value & 0x0F; c.constVol = !!(value & 0x10); c.duty = (value >> 6) & 3; // bits 6-7: duty = the chip's TIMBRE
          // software envelope: drivers walk vol down DURING a note (MM2
          // decays 14→7); record where it lands so playback can ramp too.
          // Only non-increasing writes: a same-frame RISE is the next note's
          // attack landing before its period write, not this note's fade
          if (open[name] && c.constVol && c.vol > 0 && open[name].volEnd !== null &&
              c.vol <= open[name].volEnd) open[name].volEnd = c.vol;
        }
      } else if (r === 2) {
        c.period = (c.period & 0x700) | value;
      } else if (r === 3) {
        if (name !== "noise") c.period = (c.period & 0xFF) | ((value & 7) << 8);
        // length-counter load also (re)starts the note; treat as potential boundary
        if (open[name]) { open[name].endFrame = frame; delete open[name]; }
      } else if (r === 1 && name === "noise") {
        c.period = value & 0x0F;
      }
      update(name, c, frame);
    }
  }
  for (const name of Object.keys(open)) open[name].endFrame = frames;
  for (const e of events) if (e.endFrame === null) e.endFrame = frames;
  return collapseSlides(events);
}

// Slide collapse (MM2 2026-08-16): drivers render glissandi as per-frame
// period steps — a chain of abutting ≤2-frame notes, pitch moving each
// step (Flash Man's falling bass: A G F Eb D, one frame each, restart).
// Chip-true but musical nonsense as separate notes. A chain sliding INTO
// a held note merges into that note (portamento — the target is the note);
// an all-tiny chain merges into its FIRST pitch (a fall-off ornament).
// Real fast runs are safe: their notes are ≥3 frames and retriggered.
// Shared with the Game Boy reconstructor (tools/gbs/notes.mjs) — same
// driver habit, same channel-agnostic rule.
export function collapseSlides(events) {
  const byCh = {};
  for (const e of events) (byCh[e.channel] = byCh[e.channel] || []).push(e);
  const dead = new Set();
  for (const [name, list] of Object.entries(byCh)) {
    if (name === "noise") continue;
    list.sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame);
    const tiny = e => e.endFrame - e.startFrame <= 2;
    let i = 0;
    while (i < list.length) {
      let j = i;
      while (j + 1 < list.length && tiny(list[j]) &&
             list[j + 1].startFrame - list[j].endFrame <= 0 &&
             list[j + 1].midi !== list[j].midi &&
             Math.abs(list[j + 1].midi - list[j].midi) <= 4) j++;
      if (j > i) {
        if (!tiny(list[j])) { // slid into a held note: the target absorbs the ramp
          list[j].startFrame = list[i].startFrame;
          for (let k = i; k < j; k++) dead.add(list[k]);
        } else {              // pure ornament: first pitch, whole span
          list[i].endFrame = list[j].endFrame;
          for (let k = i + 1; k <= j; k++) dead.add(list[k]);
        }
      }
      i = j + 1;
    }
  }
  return events.filter(e => !dead.has(e) && e.endFrame > e.startFrame);
}

// The chip's true tempo rarely equals the MIDI transcription's round number
// (drivers count frames, not bpm). Fit it: sweep candidates, score how well
// note onsets snap to a 16th-note grid, keep the best.
// Chip loops are frame-exact (identical register writes each pass), so the
// loop is detectable precisely. For a candidate period P, find R = the first
// frame from which everything is pure repetition (every event at t ≥ R has an
// identical partner at t−P). Keep [0, R): intro + one full pass — the same
// cut rule used to trim the transcriptions. Returns {keep: R, period: P} in
// frames, or null (non-looping jingles like the epilogue).
function makeLoopScan(events, frames, hint) { // shared core: sync + async twins iterate it
  const evs = [...events].sort((a, b) => a.startFrame - b.startFrame);
  if (evs.length < 8) return null;
  const byKey = new Map(); // channel:midi:startFrame -> event
  for (const e of evs) byKey.set(e.channel + ":" + e.midi + ":" + e.startFrame, e);
  // fuzzy: driver tempo-accumulator jitter shifts a repeat by ±1 frame (and
  // first-pass init latency up to ~3) — exact-frame matching misclassifies
  const findAt = (e, frame) => {
    for (const off of [0, -1, 1, -2, 2, -3, 3]) {
      const hit = byKey.get(e.channel + ":" + e.midi + ":" + (frame + off));
      if (hit) return hit;
    }
    return null;
  };
  const partnerOk = (e, P) => {
    const partner = findAt(e, e.startFrame - P);
    return partner && (Math.abs((partner.endFrame - partner.startFrame) -
           (e.endFrame - e.startFrame)) <= 4 || e.endFrame >= frames - 2);
  };
  // cheap pre-filter: sample a handful of late events before the full scan
  const samples = evs.filter((_, i) => i % Math.ceil(evs.length / 12) === 0);
  const TOL = 3; // loop-boundary artifacts (restart attack vs shifted song start)
  const [pLo, pHi, maxBadRatio] = hint
    ? [hint - 8, hint + 8, 0.25]
    : [120, frames * 0.6, 0.15];

  const evaluate = (P) => { // full trim metrics at one candidate period
    const bad = [];
    let testable = 0;
    for (const e of evs) {
      if (e.startFrame < P) continue;
      testable++;
      if (!partnerOk(e, P)) bad.push(e);
    }
    if (testable < 20 || bad.length > testable * maxBadRatio) return null;
    bad.sort((a, b) => a.startFrame - b.startFrame);
    let cut = bad.length <= TOL ? 0 : bad[bad.length - TOL - 1].startFrame + 1; // allow TOL stragglers
    // a tight trailing cluster of "stragglers" is a loop-seam overlap (ship's
    // pickup replayed under sustained accompaniment, battle's turnaround run)
    // — real once-only material, so keep through it INCLUDING note tails
    if (cut && bad[bad.length - 1].startFrame - cut < 100) {
      cut = Math.max(...bad.filter(e => e.startFrame >= cut - 100)
                        .map(e => e.endFrame));
    }
    // the backward check is blind to a non-repeating intro SHORTER than P
    // (gameover's 2-beat pickup) — forward prefix walk finds it
    const badF = [];
    for (const e of evs) {
      if (e.startFrame >= P || e.startFrame >= frames - P - 2) break;
      if (findAt(e, e.startFrame + P)) break;
      badF.push(e);
    }
    const introEnd = badF.length
      ? Math.max(...badF.map(e => Math.min(e.endFrame, e.startFrame + P)))
      : 0;
    const onsets = Math.max(P + introEnd, cut); // no repetition before one full period
    // let notes straddling the boundary ring out — tails only, no new onsets
    const keep = Math.max(onsets, ...evs.filter(e =>
      e.startFrame < onsets && e.startFrame >= onsets - 100 && e.endFrame > onsets)
      .map(e => Math.min(e.endFrame, frames)));
    if (frames - keep < P) return null; // demand a full clean period after the cut
    return {keep, onsets, period: P, bad: bad.length};
  };
  // fuzzy matching lets the minimal-P scan land up to 3 frames short of the
  // true period — the true one has the most EXACT-frame twins; pick it
  const refine = (P0) => {
    let best = P0, hits = -1;
    for (let P = Math.max(120, P0 - 3); P <= P0 + 6; P++) {
      let exact = 0;
      for (const e of evs)
        if (e.startFrame >= P && byKey.get(e.channel + ":" + e.midi + ":" + (e.startFrame - P))) exact++;
      if (exact > hits) { hits = exact; best = P; }
    }
    return best;
  };

  const step = (P) => { // one candidate period: a full trim result or null
    let quickBad = 0;
    for (const s of samples) if (s.startFrame >= P && !partnerOk(s, P)) quickBad++;
    if (quickBad > samples.length / 2) return null;
    const r0 = evaluate(P);
    if (!r0) return null;
    return evaluate(refine(P)) || r0;
  };
  return {pLo, pHi, step};
}
export function detectLoop(events, frames, hint = null) {
  const scan = makeLoopScan(events, frames, hint);
  if (!scan) return null;
  let best = null;
  for (let P = scan.pLo; P <= scan.pHi; P++) {
    const r = scan.step(P);
    if (!r) continue;
    if (!hint) return r;
    if (!best || r.bad < best.bad) best = r;
  }
  return best;
}
// Same scan, but yields to the event loop periodically: a 300s no-loop
// capture sweeps ~10k candidate periods in one sync block, which froze the
// tab AFTER the (already-async) emulation hit 100% — Josh's beacon-adjacent
// sighting pinned it (2026-08-16). Identical iteration order = identical
// results to detectLoop.
export async function detectLoopAsync(events, frames, hint = null, budgetMs = 35) {
  // time-budget yields (not every-N): one candidate's cost varies 10-20x
  // between a desktop and an iPad — counting chunks re-froze the slow device
  const scan = makeLoopScan(events, frames, hint);
  if (!scan) return null;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let best = null, last = now();
  for (let P = scan.pLo; P <= scan.pHi; P++) {
    if (now() - last >= budgetMs) { await microYield(); last = now(); }
    const r = scan.step(P);
    if (!r) continue;
    if (!hint) return r;
    if (!best || r.bad < best.bad) best = r;
  }
  return best;
}

// Backport steady-state timing: the first pass carries init latency (shop's
// bar-1 chord staggers ~2 frames) and jitter; the second pass is the driver
// in steady state. Every event with a twin one period later adopts the
// twin's timing shifted back — once-only material (intros, seams) keeps raw.
export function backportTiming(events, period) {
  const byKey = new Map();
  for (const e of events) byKey.set(e.channel + ":" + e.midi + ":" + e.startFrame, e);
  return events.map(e => {
    for (const off of [0, -1, 1, -2, 2, -3, 3]) {
      const twin = byKey.get(e.channel + ":" + e.midi + ":" + (e.startFrame + period + off));
      if (twin) {
        const s2 = twin.startFrame - period;
        // an event in the first ~3 frames can fuzzy-match a twin whose
        // backported start lands BEFORE frame 0 — a negative time that sent
        // the MIDI varint writer into an unbounded allocation loop and
        // killed the iPad tab every run (MM2 track 3, 2026-08-16). Keep
        // raw timing instead; frame-0 material is once-only anyway.
        if (s2 < 0) return e;
        return s2 === e.startFrame ? e
          : {...e, startFrame: s2, endFrame: twin.endFrame - period};
      }
    }
    return e;
  });
}

// Seeded ±15% around the transcription's bpm — an open sweep locks onto
// subharmonics (half tempo snaps the same grid), and matching the MIDI's
// bar numbering is the point.
export function fitBpm(events, frameSec, seedBpm) {
  const onsets = events.filter(e => e.channel !== "noise").map(e => e.startFrame * frameSec);
  if (onsets.length < 8) return seedBpm;
  const cands = [];
  const tryBpm = (bpm) => {
    const grid = 60 / bpm / 4; // a 16th
    let err = 0;
    for (const t of onsets) {
      const ph = (t / grid) % 1;
      err += Math.min(ph, 1 - ph);
    }
    cands.push({bpm: +bpm.toFixed(2), err});
  };
  for (let bpm = seedBpm * 0.85; bpm <= seedBpm * 1.15; bpm += 0.02) tryBpm(bpm);
  // A seed from a transcription lands in that window — but a COLD capture
  // seeds a guess, and the true tempo (MM2: 150/180) can sit far outside it.
  // NES drivers count in whole frames, so also test the chip-native family:
  // an integer number of frames per 16th (5 -> 180bpm, 6 -> 150, 8 -> 112.5
  // at 60.099Hz), plus half-steps for shuffle/24th drivers. The residual is
  // phase-fraction (grid-relative), so scores compare fairly across tempos.
  for (let u = 3; u <= 18; u += 0.5) {
    const bpm = 60 / (4 * u * frameSec);
    if (bpm >= 40 && bpm <= 320) tryBpm(bpm);
  }
  // near-ties are grid RELATIVES (double/half: 75 vs 150 over the same
  // onsets) — timing-identical, different note labels. Among them prefer the
  // bpm closest to the seed (the least extreme notation); a genuinely better
  // fit (a 6/8 song's triplet grid, a true 5-frame 16th) wins outright.
  const minErr = Math.min(...cands.map(c => c.err));
  const tol = minErr + onsets.length * 0.01; // ~1% avg phase = the jitter floor
  return cands.filter(c => c.err <= tol)
    .sort((a, b) => Math.abs(a.bpm - seedBpm) - Math.abs(b.bpm - seedBpm))[0].bpm;
}

// Stage 3: events -> the repo's .notes.txt format. Bars need a tempo the
// chip doesn't carry — bpm/timesig come from the caller (known per song).
// source/volNote name the chip: the Game Boy pipeline reuses this writer
// with its own wording (the wave channel HAS a level, the triangle doesn't)
export function toNotesTxt(events, {frames, frameSec, bpm, tsNum = 4, tsDen = 4, title = "nsf", snap = true,
                                    source = "NSF capture",
                                    volNote = "vN = chip volume 0-15; pulse/noise only — the triangle has no volume control"}) {
  const beatSec = 60 / bpm;
  const beatsPerBar = tsNum * 4 / tsDen;
  // snapped to the grid like the MIDI writer — or, for snap:false songs
  // (tempo changes the grid can't follow), raw time shown to 0.01 beat
  const q = snap ? snapBeat : (x => Math.round(x * 100) / 100);
  const byChannel = {};
  for (const e of events) (byChannel[e.channel] = byChannel[e.channel] || []).push(e);
  const L = [];
  L.push(`# ${title} — ${tsNum}/${tsDen}, ${bpm}bpm, ${Math.ceil(frames * frameSec / (beatSec * beatsPerBar))} bars (from ${source})`);
  L.push(`# Format: bar N: beat pitch duration-in-quarter-notes [${volNote}]`);
  L.push("# Channel identity is hardware fact. Pitches use sharp spelling; no key is stated.");
  for (const [name, evs] of Object.entries(byChannel)) {
    L.push("");
    L.push(`## channel ${name}`);
    const rows = {};
    for (const e of evs) {
      const qb = q(e.startFrame * frameSec / beatSec); // quantize FIRST, then
      const durBeats = q((e.endFrame - e.startFrame) * frameSec / beatSec);
      if (durBeats <= 0) continue;
      const bar = Math.floor(qb / beatsPerBar + 1e-9) + 1; // ...assign the bar,
      const beat = qb - (bar - 1) * beatsPerBar + 1; // so no "beat 5" in 4/4
      const label = name === "noise" ? "N" + e.midi : pitchName(e.midi);
      (rows[bar] = rows[bar] || []).push(
        (+beat.toFixed(2)) + " " + label + " " + (+durBeats.toFixed(2)) +
        (e.vol != null ? " v" + e.vol : ""));
    }
    for (const bar of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
      L.push("bar " + bar + ": " + rows[bar].join(", "));
    }
  }
  return L.join("\n") + "\n";
}
