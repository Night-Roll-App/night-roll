# Plan: theory toolkit (facts + harmony) — tested, NOT integrated yet

Status: two Fable builders already implementing (briefed before the review rule) → Fable REVIEW of their output against this plan → fixes → merge.

## Josh
"We rely a lot on Claude to help with doing analysis … build it and Claude can delegate to that." / "make sure they're tested. We don't have to integrate them just yet … tell me where it would be integrated."

## Facts (src/theory facts modules, tools/theory.mjs, tests/theory.test.mjs)
pattern finder (any transposition, the Korobeiniki search), repetition/form (A/A′/B by similarity, sequences), melody facts (range, tessitura, steps/leaps, contour), rhythm facts (density, syncopation vs effective meter, harmonic rhythm from EXISTING chord bands only), bass facts (lowest note per beat, motion, pedals), voice-leading facts (parallel P5/P8, crossing, overlap, leaps — as interval facts). Output JSON + text with key-neutral spelling.

## Harmony / verdicts (src/theory/harmony…, tools/harmony.mjs, tests/theory-harmony.test.mjs)
roman numerals (from declared key + the user's chord bands), cadences, non-chord tones, modulation pivots (from declared keys), chromatic chords. Never estimates a key or names a chord from raw notes.

## Integration (documented, not wired): docs/theory-toolkit.md + docs/theory-harmony.md
Each function → exact file/function where it would plug in (AI tools in src/ask/tools.js; Normal-mode gate; UI panels). Learning-mode gate design written down for later.

## Review checklist (for the Fable reviewer)
Correctness on real songs (FF1, starters) and adversarial fixtures; test quality (behaviour, edge cases: empty tracks, ties, triplets, tempo/meter changes, drums excluded); pure + layer rules; no Learning-mode leakage in outputs (no key/chord/meter names from facts tools); docs accurate; no app integration slipped in.
