# Gurgu Volcano

**Analyzed 2026-08-02 (chip capture, by ear + roll). Key work: DONE.**

Framing correction (Josh, same day): this is NOT "the first song that
modulates" — the sweep scoped opening keys only, so the other songs'
interiors are simply unexamined and several likely modulate too. Gurgu is
the first song whose **opening key resisted a quick read**, which is what
pulled the analysis into the whole piece.

## Structure (Josh's derivation)

**Bars 1–12 — D Dorian.**
- Tonic is D, not A: the bass sits on A but the triangle holds D above it —
  A is the 5th, not the tonic. (Same trap as Cornelia's arpeggio, and Josh
  recognized it as such.)
- Dorian, not natural minor: bars 1–12 contain **no Bb at all** — the 6th
  degree is B natural throughout.
- The C# at bar 5 (the song's first accidental) is the raised 7th: it turns
  the v chord (A minor) into a functioning V (A major). Not tonicization —
  aiming a dominant at your own tonic is just a cadence. **Second sighting
  of this device** (first: Battle's raised 7th, parked in battle.md).

**Bar 13 — the channels swap roles** (see Devices below). Structural, but
*not* the key change.

**Bars 13–16 — ♭III and IV7 of D:** F major alternating with G7, both
Josh's identifications. The G7 is the strongest confirmation of Dorian
available: natural minor's iv chord is G *minor* — **a major IV is the
Dorian fingerprint**, and its B natural is the same raised 6th heard from
bar 1.

**Bar 17 — the key change.** Josh located the seam and called the spelling:
the file's G# is functioning as Ab (mechanical sharp spelling, as
designed).

**Bars 17–20 — F Dorian:** the bars 13–16 vamp transposed up a minor
third. Ab major (♭III of F) alternating with Bb7 (IV7 of F). Same numerals,
new tonic, same mode. Then the loop returns to D.

Notable: **neither vamp ever states its tonic chord.** Both keys are
inferred entirely from two non-tonic chords — which is why this song was
hard.

**And the deeper reason it was hard: this song has no retransition.** In
many swept songs the final measures carry a descending bass or dominant
approach engineered to hand off to bar 1 — a loop is a closed circle, so
reading the ending to infer the opening key is using the one moment built
to prepare the beginning (Josh's method, and it stands — see key-sweep.md).
Here there was no signal to read: the ending sits in the new key with
nothing aimed back at the old one. **A hard splice, not a prepared
retransition** — working hypothesis: block transposition leaves no seam
material by construction. The absence was informative, but only legible in
hindsight; at the time it read as difficulty rather than data.

## Why the unannounced modulation works

Josh asked why the D Dorian ↔ F Dorian change succeeds with no pivot chord
and no dominant preparation in either direction.

Interval content (Claude supplied at Josh's request — fatigue, not a
knowledge gap):

```
D Dorian:  D  E   F  G  A   B   C
F Dorian:  F  G   Ab Bb C   D   Eb
```

- Shared: 4 of 7 (D, F, G, C); changed: 3 (E→Eb, A→Ab, B→Bb) — every
  changed tone moves down exactly one semitone.
- Each tonic lives inside the other's scale: F is ♭3 of D Dorian; D is the
  6th of F Dorian. Neither key is foreign to the other.

The structural reason (the main one) is something **Josh had already
discovered and not yet connected to the question**: the modulation is a
transposed block — same shape, same numerals, new pitch level. The
listener isn't tracking pitch content; they're tracking a **pattern**, and
a pattern returning at a new level parses as repetition, not disruption.
And the return home is easier still: twelve bars established D Dorian, so
coming back isn't a modulation the ear must parse — it's landing where the
listener already was.

Method note: Josh derived F Dorian's spelling (F G Ab Bb C D Eb) from the
tonic and interval pattern alone, from memory, catching two of his own
slips en route — including correcting Claude's mis-spelling of Eb major's
6th degree.

Help-level honesty: the structural pointer (compare bars 13–16 with 17–20)
was given repeatedly and was the unlock; everything downstream of it was
Josh's. This song asked four questions at once — what key, does it change,
where, and are the channels doing what you assumed — where every prior
sweep song asked one.

## Devices

- **Channel roles are reassigned mid-song** — first song in the corpus
  where the triangle is not the bass. Through bar 12 the triangle sits at
  D4/C4/B3 while pulse2 carries the bass below it (A3/G3); **at bar 13 they
  swap** — triangle drops to F3, pulse2 jumps to F4. Josh spotted the flip
  and named the bar. This undercuts an assumption baked into the project's
  framing (that each channel *has* a role): roles are assigned, and can be
  reassigned mid-piece. On hardware where the triangle has a fixed timbre
  and no dynamics, moving the bass to a pulse is an audible compositional
  choice. **First finding that only exists because of the chip captures**
  — the old arranged MIDI (Trumpet/Strings/Bass) had flattened it.
- **Modulation by transposing a whole section** — mode and numerals
  preserved, pitch level moved a fixed interval (up a minor 3rd). Third
  transposed-repeat sighting in the corpus, first where the transposition
  constitutes a key change. Cross-referenced in chord-charts.md.

## Open questions

- **What is the specific pivot pitch at each seam?** The pitch that
  carries the ear across at bar 17 (D→F Dorian), and separately at the
  return seam (F→D). The two directions may not use the same pivot.
  (Deferred by Josh — "good questions, my brain is too tired.")
- **Is the minor-third transposition related to the ♭III already in the
  vamp?** Coincidence, or is the transposition interval drawn from the
  harmony of the material being transposed? (Also deferred.)
- The final pitch center and the loop target sit a **half step** apart —
  unusual; worth a moment on a future pass.
- Sweep scoring: bass at the loop target is A under a D tonic — hit, miss,
  or hypothesis refinement? (Tracked in key-sweep.md.)
