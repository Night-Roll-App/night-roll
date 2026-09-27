# Airship (FF1) — Analysis

**Status: keys determined for both sections (2026-08-25). Chord layer
complete for the whole song. Several questions still open — see below.**

## Keys: F mixolydian (A section), B♭ mixolydian (B section)

Josh's, 2026-08-25. This **supersedes** the 2026-08-01 key sweep, which
recorded F major and stated that the closing E♮ "rules out F Mixolydian."

The sweep's problem was that it treated one key as governing the whole
song, so the vamp's E♭ and the descent's E♮ had to be reconciled against
each other. They can't be:

- the vamp's E♭ can't be explained from F major
- the closing descent's E♮ can't be explained from F mixolydian

Josh resolved it by **scope** rather than by picking a winner: the vamp
and the descent are different sections, and each gets its own key. The A
section is F mixolydian from 1.1; the B section is B♭ mixolydian from 9.1.

### The census that settles it

Pitch-class counts straight from the capture (`tools/at.mjs`):

| | bars 1–8 (A) | bars 9–16 (B) |
|---|---|---|
| E♮ | **absent** | 7 |
| E♭ (D♯) | 19 | 12 |

E♮ does not occur anywhere in the A section. It first appears in the B
section and again in the closing descent at 15–16. So it is a later
event, not a counterexample to F mixolydian — which is exactly the scope
argument, confirmed on the data.

Two small things the census shows that are worth recording rather than
smoothing over: bars 1–8 do contain D (×2) and one G♯. The 08-25 handoff
reported no D in the A section; that is off by two. Neither affects the
E♮ argument.

**On the derivation path.** The tutor initially flagged Josh's F
mixolydian as a definitional error, on the strength of the stale line in
this very file. Josh pushed back and the census settled it in his favor.
Worth noting because the verdict was reached *against* the prior, not
with it — a stale doc came very close to overriding correct analysis.

## Open Questions

**The E♭ — what is it doing?**

Partly answered by the key work above: E♭ is ♭7, a modal degree of the
declared mode, in both sections. That removes the need for a "borrowed
from somewhere" story to explain its *presence*.

The **function** question from the 2026-08-01 sweep still stands, and is
not answered by naming the mode. What does ♭7 pull against here, where
does it want to go, why is that the colour the composer wanted?

The sweep's earlier reasoning is still worth keeping, because the
question it dismantles will recur:

1. *Sourcing vs. function.* "Borrowed from X" says where a note might
   have come from, not what it does. A sourcing label answers none of
   the questions worth answering.
2. *E♭ isn't uniquely indicated by B♭.* It belongs equally to E♭ major,
   A♭ major, C minor, G minor, F minor. Circle-of-fifths adjacency alone
   isn't a reason.

To bring to it on the return: Josh has named source keys for borrowing
twice before — overworld.md ("key visit vs. borrowing," bars 14–15) and
cornelia-castle.md — and in both cases the source key stood in the *same*
relationship to home, which is not "circle-of-fifths neighbour."

**Also open, from the 2026-08-25 session:**

- D♭ vs C♯ spelling at 14.3, and what the D♭→G tritone root motion is
  doing.
- Whether the bar-14 third-dyads are a substitution or an omission.
- Whether the F♯–C tritone thread in the prologue and this song's
  B♭–E tritone are the same device.
- **Not Josh's, unruled:** that the B section is the A section's
  two-chord shape transposed (B♭↔A♭ where A had F↔E♭). Offered to him in
  the 2026-08-19 session; he has not ruled on it. Recorded here so it is
  not mistaken for a finding.

## Verified facts (measurements, not readings)

- **15.3 is the B♭–E tritone.** Triangle E4 sustains a quarter; pulse2
  lands A♯4 on the second half of the beat. An annotation had this at
  14.3, which sounds D♯5 / G♯4 / C♯4 — no B♭ and no E. Corrected
  2026-08-26.
- The closing bass walk is a stepwise scalar descent of a full octave, G
  down to G — eight even quarters over two bars, delivering to F on the
  loop restart. Same turnaround device as Overworld bar 16; second
  sighting.
- The opening vamp alternates root+5th dyads on two roots, F–C then
  E♭–B♭, the same NES bass idiom as Overworld.
- The song has **three channels** — triangle, pulse1, pulse2 — because
  that is what the 2A03 has. (An earlier note in this file promised a
  fourth "chord track" as cheap independent verification. No such track
  exists in the capture; it belonged to a pre-migration arrangement MIDI.
  Removed 2026-08-26.)
