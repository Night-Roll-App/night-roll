# Shop

**Opened 2026-08-05 (chip capture). METER DETERMINED — the project's first
from-scratch meter verdict, and the first confirmed fossil error in the
inherited metadata. Key: NOT determined.**

## Meter: 3/4 (fast, felt in one)

The inherited header said 4/4 at 200 — wrong, and Josh proved it:

1. **The barline test.** The triangle's dominant figure (quarter,
   eighth+rest, eighth+rest) is three quarter-notes long. Under 4/4 it
   phases across the barlines, realigning only every three bars — *a
   dominant repeating figure that doesn't align with the barline means
   the barline is wrong.*
2. **Re-barred to three-quarter bars**, the figure fits exactly, one per
   measure, no phasing. Correct barlines.
3. **3/4, not 6/8**: the grouping inside the bar is duple, not triple.
   Onsets fall at eighth-positions 1, 3, 5 — nothing marks position 4 as
   a second beat. Bar 1's pulses attack at quarters 1, 3, 4 with spans
   straddling the 3+3 boundary rather than respecting it; all three
   channels agree. The bass keeps the pattern for 22 of 28 bars.
4. Felt evidence agrees: one strong beat per bar — a fast 3/4 conducted
   in one.

Consequence for the data: shop is **28 bars of 3/4 at 200** (same loop,
same seconds — the 21-bars-of-4/4 numbering was the fossil). Pipeline and
CUTS.md corrected accordingly; `timesig: 3/4` recorded in shop.rollnotes
as Josh's settled finding.

## Method export

The barline test is mechanical: *find the dominant repeating figure and
check whether its period divides the bar length.* It became pass one of
the meter-audit tooling (see reference/nsf-pipeline-plan.md) — run across
the whole album, it should catch other fossils without any hand analysis.

## Open questions

- The key (untested — sweep pending).
- The remaining 6 of 28 bars where the bass pattern breaks: what happens
  there?
