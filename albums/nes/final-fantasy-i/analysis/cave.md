# Cave (FF1) — Analysis

**Status: opening key determined (2026-08-01, key sweep). Note:
`ff1dungeon.mid` is the same piece — see below.**

## Opening key: C minor

Two independent legs, doing different jobs — this is the derivation:

- **Bass → tonic.** Bass opens on C; alternates between C and F regions,
  with a G region later — read as I–IV–V root motion around C.
- **Melody → mode.** With the Strings (chord) track deliberately hidden as
  "cheating," the melody line repeatedly lands on the **flat 3rd, flat 6th,
  and flat 7th** above C — exactly the degrees that separate minor from
  major. (Opening chromatic ascents reach the b6 and b7.)

Neither leg alone is sufficient: root motion tells you the tonic, not the
mode; the flat-degree collection settles the mode but sits equally well in
several related keys (the relative-major trap from Overworld). Together
they're conclusive.

For the record, the first stated reasoning — "the two dances begin on Bb and
Eb, which indicates C minor" — was superseded, and why is instructive: those
notes are each the first note of a chromatic descent, which by Josh's own
principle (below) are governed by continuity rather than key membership; and
the two dances are strict transpositions of each other, so they are one fact
stated twice, not two observations.

Method note: first song in the sweep where Josh caught his own unverified
assumption mid-sentence — reasoning from chord roots (I, IV, V) toward
"major" without confirming a third. Keeper: **root motion tells you the
tonic, not the mode.**

## The bass "dance" — compound line

Two six-note descending figures in the bass, one delivering to G, one to C —
the same figure both times (strict transposition; the interval between them
is the up-a-fourth/down-a-fifth relationship worth noting explicitly).

Josh's structural read, arrived at independently:

- The figure is **two interleaved strands**, not one line — a compound/
  polyphonic line: one bass part implying two voices.
- Odd positions (1, 3, 5) plus the target form an unbroken **chromatic
  descent** onto the goal tone. The out-of-key note in that strand is
  licensed by *chromatic continuity* — the line's job is unbroken half-step
  descent; key membership is not the governing constraint.
- Even positions (2, 4, 6) form a second descending strand aiming at the
  same goal. Its final note is the step above the goal rather than a third
  above because the strand needs a **stepwise (conjunct) approach** into its
  target — Josh's instinct ("the leap would be too far away from the G"),
  which just needed the term.

## Open Questions

**The even strand.** The odd strand is fully understood; the even strand is
not. It contains a note outside the key that isn't explained by chromatic
continuity — the strand isn't a pure half-step descent. What governs it?

Questions to bring to it (not answers):
- The six-note figure as an unordered pitch set, descending — does that set
  have a name?
- Do the two strands stay a constant interval apart, or does the gap change
  as they descend? If it changes, where and by how much?
- Does the even strand have its own target, or converge on the odd strand's?
- Is it better heard as a line in its own right, or decoration on the odd
  strand?

## ff1dungeon is the same song

Verified: Cave (2/4, 30 bars) and Dungeon (4/4, 15 bars) are two
transcriptions of one piece — same tempo, identical total length, melodies
match note for note (two cave bars fold into one dungeon bar). They differ
only in arrangement decisions: cave folds a pedal tone into the melody track
(the compound line above); dungeon splits it out. Dungeon's key is Cave's
key, and it is excluded from the sweep tally as a duplicate.

## Arrangement fidelity caveat

The Strings track carries full chords the NES could not produce — this file
peaks at 6 simultaneous pitched voices against the chip's ceiling of 3.
**This file is an arrangement, not a capture.** Key determination is largely
unaffected; voice-leading conclusions would measure the arranger, not
Uematsu. (Project-wide audit and fix: see reference/nsf-pipeline-plan.md.)
