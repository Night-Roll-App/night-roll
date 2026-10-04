import { S } from "../state.js";
import { trackIsDrums } from "../model/grid.js";
import { analysisAvailable } from "../platform/mode.js";
import { barTicks } from "../model/rollnotes.js";
import { bsInferTimeline } from "./bassist.js";
import { nameChord } from "../theory/chords.js";
import { sfShownAt } from "../model/song.js";
import { estimateKey } from "../model/song.js";

export function harmonyTrackIndices() { // non-drum, non-audio (.kind) tracks — chord evidence only, never the kit
  const out = [];
  S.song.tracks.forEach((tr, ti) => { if (!trackIsDrums(ti) && tr.kind !== "audio") out.push(ti); });
  return out;
}
export function computeAnalysisLayer() { // called on toggle-on and (debounced) on note edits — never per frame
  if (!S.song || !analysisAvailable()) { S.analysisBands = {chords: [], key: null}; return; }
  const bt = barTicks(), end = Math.max(bt, S.songEndTick);
  const tis = harmonyTrackIndices();
  const chords = [];
  if (tis.length) {
    // bsInferTimeline is the Bassist's own harmonic-sketch reader — reused
    // here for the same reason it exists there: a duration+metric-weighted
    // census restricted to plausible triads reads a melody line's implied
    // harmony far better than "whatever pitches are stacked on the downbeat".
    // seedRng always returns 0: the Bassist varies among equally-plausible
    // readings for a fresh take each roll; a displayed estimate has no
    // "roll again" and must be deterministic, so this always takes the
    // single best-scored candidate (top[0]).
    const timeline = bsInferTimeline(0, end, tis, () => 0);
    for (const entry of timeline) {
      const pcSet = new Set(entry.tones);
      const pitches = [], all = [];
      for (const ti of tis) for (const n of S.song.tracks[ti].notes) {
        if (n.gone || n.t >= entry.end || n.t + n.d <= entry.t) continue;
        all.push(n.p);
        if (pcSet.has(((n.p % 12) + 12) % 12)) pitches.push(n.p);
      }
      if (!pitches.length) continue;
      // when EVERY note in the bar is a clean chord by itself, that's the
      // answer: the Bassist's scoring ties relative major/minor (C after C
      // beats Am on smoothness), and filtering to its winner threw away the A
      // of a plain A–C–E bar, labelling it "C (no 5th)" (2026-09-30)
      const whole = nameChord(all, sfShownAt(entry.t));
      if (whole && !/no standard chord match|one pitch class|no 5th|\?/.test(whole)) { chords.push({start: entry.t, end: entry.end, text: whole}); continue; }
      // the REAL sounding pitches (not the candidate's bare pitch classes)
      // go through nameChord — the same namer the lasso/chord-evidence use —
      // so the label's inversion/bass reads off the actual notes, not an
      // assumed root position.
      const label = nameChord(pitches, sfShownAt(entry.t));
      if (label && !label.includes("no standard chord match")) chords.push({start: entry.t, end: entry.end, text: label});
    }
  }
  // Key: one region for the whole song (the documented "cheap" fallback —
  // a true per-8-bar window would need its own duration-weighted census per
  // window; one call reuses estimateKey() exactly as every other Normal
  // display site does, with its own cache, instead of a second K-S
  // implementation). estimateKey() is Normal-only by construction; this
  // function's own analysisAvailable() gate above means Learning never
  // reaches this line either (spy-tested alongside bsInferTimeline).
  const est = estimateKey();
  S.analysisBands = {chords, key: est ? {start: 0, end, name: est.name, sf: est.sf, conf: est.conf} : null};
}
