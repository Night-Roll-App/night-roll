# Overworld (FF1) — Harmonic & Melodic Analysis

**Status: in progress.** Bass track complete (2026-07-21 session). Melody + counter tracks not yet analyzed.

Key: G major · 4/4 · ~130 BPM · One looping section (16 bars per pass)
Tracks in this MIDI (unnamed): tr1 = melody, tr2 = second melody/counter, tr3 = bass. Only these three contain notes. No chord reference track — harmony being derived track by track.

**Method note:** this analysis was done bass-first — deriving the full harmonic skeleton from the bass alone before opening the other tracks. NES bass gives only dyads (root+5th, or inversions), so chord qualities come from context accumulation and get verified against the upper tracks later. Josh: "I really like just focusing on one track at a time like this, especially the bass."

---

## Chord Progression (from the bass; thirds pending verification)

| Bar | Bass notes | Chord | Roman | Notes |
|-----|-----------|-------|-------|-------|
| 1–2 | G + D | G | I | Root position. G+D alone is ambiguous; major confirmed by context that follows |
| 3–4 | F# + D | D/F# | V | **First inversion.** F# in bass = 3rd. (Whether it's D7 — pending: listen for a C natural in tr2 near the end of bar 4) |
| 5–6 | A + E | Am | ii | Root position. Minor assumed from the one-sharp context the F# established |
| 7–8 | G# + E | E/G# | V/ii | **First inversion.** G# = out of key = the giveaway. Secondary dominant pointing at Am |
| 9 | C + G | C | IV | E7's promise deferred — it aimed at Am but landed here |
| 10 | D + A | D(?) | V(?) | Major or minor third unknown from bass. **Prediction to verify in upper tracks** |
| 11 | B + F | Bdim | iiø/ii | B–F tritone in the bass itself — instability audible |
| 12 | E + B | E | V/ii | Major/minor unknown from bass. **Prediction: E major — the pull into Am needs the G# leading tone. Verify.** |
| 13 | A + E | Am | ii | The promised Am finally lands |
| 14 | F octaves | F | bVII | Borrowed from G minor. Doubles as V of the coming Bb |
| 15 | Bb octaves | Bb | bIII | Borrowed from G minor. Spelled Bb, not A# |
| 16 | D–C–B–A quarters | D (walking) | V | Gallop stops; walking line delivers to G at the restart |

---

## Bass Track — Findings (Josh's session, in order of discovery)

### The gallop and the line underneath

Rhythm per bar: strong-beat note twice, then a dip. First four chords, the strong-beat notes are:

**G → F# → A → G#**

Two descending half-step pairs — chromatic motion, same family as Cornelia Castle's D→C#→B→A# staircase. And pair 2 (A→G#) is pair 1 (G→F#) moved up a whole step: "the same exact movement, just transposed" (Josh, who spotted this before being told).

This **verifies the Cornelia doc's hypothesis** about driving basslines: the bass here is the rhythmic engine of the song (Josh: "the bass is really serving as the energy or tempo of the song much more than last song") AND it's still a stepwise line underneath — the gallop is rhythm applied to a line, not a different way of choosing notes. Line-first bass, confirmed in both roles.

### Inversions serve the line (again)

Chords 2 and 4 are first inversion (D/F#, E/G#) — roots sacrificed to keep the strong-beat bass notes on the chromatic pairs, exactly as Cornelia sacrificed roots to keep its staircase. Chords 1 and 3 anchor in root position.

### Dual-function dip notes

The dips are frozen across each chord pair: D under both G and D/F# (5th of G, root of D); E under both Am and E/G# (5th of Am, root of E). Same dual-function-note device Cornelia used in the *melody* (held A = root of A chord + 5th of D), here in the bass.

### The four chords as two pairs

- Pair 1: G → D/F# = I → V, bass drops a half step, shared dip note
- Pair 2: Am → E/G# = i → V (in Am's world), bass drops a half step, shared dip note

Pair 2 is pair 1 transposed up a whole step — the entire harmonic relationship transposes, not just the notes. Cornelia's transposed-repeat device, third sighting.

### Ambiguity and context accumulation (method finding)

Bass dyads can't prove chord quality on their own. The session's decoding chain: G+D ambiguous → F# arrives and locks D major, retroactively strengthening "G was I" → A+E assumed minor by diatonic logic → G# breaks the key, so it must be functional (secondary dominant). Thirds get confirmed later from the upper tracks; two predictions logged in the table above.

### The B section story: promise deferred, then delivered

E7 (bars 7–8) points at Am — but bar 9 lands on **C major** instead. The promise is deferred, not broken. Bars 11–13 finally deliver it with the three-chord deluxe version of the aiming move:

**Bdim → E → Am = ii → V → i in A minor** — the two-five-one. The E7's target arrives four bars late, with a stronger escort.

### Key visit vs. borrowing (the session's big concept)

- **Tonicization / key visit:** the target tonic actually lands. Bars 9–13 are a genuine visit to A minor — full ii-V-i, Am sits on the throne.
- **Borrowing (mixture):** chords stolen from the parallel minor's pantry, but its tonic never appears. Bars 14–15 take F (bVII) and Bb (bIII) from **G minor** — and no Gm chord ever sounds. Still G major, wearing borrowed dark clothes.

Cornelia comparison (settled after some healthy confusion): Cornelia's Gm bar was borrowed from **D minor** (parallel minor of its home D major), and D minor's tonic Dm never appeared either. Both songs: pure borrowing, no key change. Different doors into the pantry, though — Cornelia slipped one voice a half step (B→Bb on a shared root); Overworld walked in through a dominant (F→Bb, a real V→I resolution, giving Bb a one-blink tonicization *inside* the borrowing — the devices nest).

### The turnaround

Bar 16: the gallop rhythm stops for the first time in the song — bass walks D–C–B–A in even quarters, delivering onto G at the loop restart. Texture change marks the cadence (Cornelia device, confirmed: there the arpeggio dissolved into scale runs at the turnaround; here the bass itself does).

### Home key verdict

G major, decided from the bass alone: the loop starts on G, ends by walking to G, the strongest cadence is D→G (V–I), and there is **no Em chord anywhere in the song**. (Josh's initial E-minor hearing — revisit when the melody track opens; relative major/minor share all their notes, so the melody may genuinely emphasize E-minor colors.)

### Theory concepts unlocked this session

- **V/ii notation:** read the slash as "of." E7 = V/ii = "the dominant of Am." Every chord has a personal dominant: count up a fifth from its root.
- **Up a fourth = down a fifth:** one relationship, two directions. Up a fifth to *find* a chord's dominant; the dominant resolves home down a fifth / up a fourth (same landing, different octave). Root motion up a fourth is the signature of "dominant resolving home" — the most load-bearing move in tonal music.
- **ii–V–i:** the aiming move upgraded — aim at the aimer too.
- **Tonicization vs. modulation vs. borrowing:** a spectrum; the practical test is whether the target tonic lands (and what happens next).
- **Perceptual note:** missing the first two bass notes made the whole pattern read as inverted ("the pattern shifted in my mind") — when ear and MIDI grid disagree, check the grid.

---

## Song shape so far (bass-only draft)

**G major home (bars 1–8, two sequenced I→V pairs, with E7 winking at Am) → real visit to A minor (9–13, promise deferred through C and D, then ii–V–i lands it) → two bars borrowed from G minor (14–15, darkening, never landing there) → walking turnaround (16) → home.**

---

## Open Questions

1. Bar 10's D chord: major or minor third? (Bass says only D+A.)
2. Bar 12's E chord: is the predicted G# there, and in which track?
3. Does tr2 add a C natural late in bar 4, making the V chord a D7?
4. Josh's "melody sounds like E minor" instinct — what is the melody actually emphasizing?
5. Then: melody track (tr1) and counter track (tr2) from the top.
6. Reconstruct the key-derivation path from memory against the raw notes —
   Josh found he'd forgotten how G was determined a week later (this is what
   motivated the sweep-wide "record the path, not the verdict" rule).
