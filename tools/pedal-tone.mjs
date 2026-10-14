// tools/pedal-tone.mjs — the guard behind every "few distinct keys = kit" rule
// (docs/plans/2026-10-09-percussion-detection.md §7 Q-C, Josh 2026-10-14: yes).
// A part that plays ONE note many times on a smooth held sound (a pedal tone)
// is a normal pitched part, not a drum. Facts only, no game names. The notes
// must be HELD (median PEDAL_LONG_SEC or more — a drum median is under 0.5 s,
// tools/spc/notes.mjs DRUM_MAX_MEDIAN_DUR_SEC, so this is twice that) on a
// sound that sustains or has a clear pitch:
//   a looped sample    its envelope holds, whatever its root; or
//   a one-shot with a  measured root (estimateRoot clarity ≥ PEDAL_CLARITY)
//   clear pitch        and harmonicity ≥ PEDAL_HARM — notes outlast the sample.
// A root alone is not enough: Saga Frontier's rooted, harmonic one-shots of
// 0.1–0.3 s hit 650 times are tonal drums (census, 2026-10-14); a short or
// unrooted one-shot stays a drum however long its notes.
// No sample facts (N64: the capture has no samples to measure): notes alone,
// a median of PEDAL_LONG_NOFACTS_SEC or more.
// facts = tools/psx/notes.mjs sampleFacts (oneShot, root{confidence},
// harmonicity) or null; medianSec = the group's median note length.
export const PEDAL_CLARITY = 0.9;
export const PEDAL_HARM = 0.8;
export const PEDAL_LONG_SEC = 1.0;
export const PEDAL_LONG_NOFACTS_SEC = 2.0;

export function isPedalTone({facts = null, medianSec}) {
  if (!facts) return medianSec >= PEDAL_LONG_NOFACTS_SEC;
  if (medianSec < PEDAL_LONG_SEC) return false;
  return !facts.oneShot || !!(facts.root && facts.root.confidence >= PEDAL_CLARITY && facts.harmonicity >= PEDAL_HARM);
}
