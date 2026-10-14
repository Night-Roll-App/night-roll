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

// The other side of the same facts (docs/plans/2026-10-13-snes-drums-and-track-tools.md
// step 6, Josh Q-D): a program that plays at most CYMBAL_MAX_PITCHES pitches only a few times (under
// the ≥ 12-note rule's reach) on a looped sample with NO measured root and a
// noise-like spectrum (harmonicity under CYMBAL_HARM) is a cymbal wash, not a
// pitch: its loop keeps it ringing, so it showed as a long held note at the
// default pitch. A roll of minutes (an ambience bed) is a texture, left alone.
// Looped + no root + noisy + ≥ 12 notes stays the pedal guard's call above.
export const CYMBAL_HARM = 0.6;
export const CYMBAL_MAX_SEC = 6;
export const CYMBAL_MAX_PITCHES = 2; // two channels may strike the one wash at their own keys (FF9 Hilda Garde: 58 and 63); a rootless loop carries no melody anyway
export function isCymbalLoop({facts = null, medianSec}) {
  return !!facts && facts.oneShot === false && !facts.root && facts.harmonicity != null && facts.harmonicity < CYMBAL_HARM && medianSec <= CYMBAL_MAX_SEC;
}
