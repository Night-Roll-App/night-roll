# Overworld (FF1) — Claude's Reference Draft

> **Note:** Claude wrote this solo before we established the real process. The actual analysis (`overworld.md`, top level) gets built through Josh's own listening and our conversation. Consult this afterward to check for anything we missed.

Key: G major · 4/4 · ~130 BPM · One looping section (16 bars per pass)
Tracks (unnamed in this MIDI): MELODY (tr1), COUNTER (tr2 — parallel-sixths countermelody in the A section, arpeggios in the B section), BASS (tr3). No chord reference track in this transcription; harmony derived from the three voices.

Beat numbers below are 0-indexed from the file start; bar N = beats (N−1)×4 to N×4. Melody enters on beat 1 (bar 1, beat 2) — same delayed entry as Cornelia Castle.

---

## Chord Progression (one full pass)

| Bar | Beats | Chord | Roman | Notes |
|-----|-------|-------|-------|-------|
| 1–2 | 0–8   | G     | I     | 8 beats |
| 3–4 | 8–16  | D7/F# | V7 (1st inv) | 3rd in bass. The b7 (C) arrives late — COUNTER hits C on beat 15, leaning into the Am |
| 5–6 | 16–24 | Am    | ii    | 8 beats |
| 7–8 | 24–32 | E/G#  | V/ii (1st inv) | Secondary dominant targeting Am. G# = leading tone to A |
| 9   | 32–36 | C     | IV    | Harmonic rhythm doubles here — B section |
| 10  | 36–40 | D7    | V7    | Melody supplies the C natural (beat 39). Sets up G... |
| 11  | 40–44 | Bø7   | iiø7/ii | ...denied. B–D–F in bass+arp, A in melody = half-diminished |
| 12  | 44–48 | E     | V/ii  | Arp omits G# — melody carries it in the pickup |
| 13  | 48–52 | Am    | ii    | iiø7 → V → i in A minor, fully tonicized |
| 14  | 52–56 | F     | bVII  | Borrowed from G minor. Also acts as V of the coming Bb |
| 15  | 56–60 | Bb    | bIII  | Borrowed. Spelled Bb (flat-side chord), MIDI shows A# |
| 16  | 60–64 | D7 (bass walks D–C–B–A) | V7 | Dominant with descending walking bass, delivers to G at loop restart |

**Two "almost home" fake-outs:** bars 9–10 set up IV–V7 → I, then sidestep into the tonicized ii (bars 11–13). Bars 14–15 darken with flat-side mixture. Only the bar-16 D7 actually resolves — at the loop seam. The whole B section is deferred resolution.

---

## The A section is one 4-bar block, sequenced up a step — in ALL THREE CHANNELS

Bars 5–8 are bars 1–4 transposed up a whole step, essentially exactly:

| Channel | Bars 1–4 | Bars 5–8 |
|---------|----------|----------|
| MELODY  | B–A–B–C–B–A–B–D → A held 6 beats | C–B–C–D–C–B–C–E → B held 6 beats |
| COUNTER | D–C–D–E–D–C–B–A → A held, then F#–E–D–C–A descent | E–D–E–F#–E–D–C–B → B held, then G#–F#–E–D descent |
| BASS    | G-gallop → F#-gallop (5th: D) | A-gallop → G#-gallop (5th: E) |
| Harmony | G → D7/F# (I → V7, 3rd in bass) | Am → E/G# (i → V7, 3rd in bass, in A minor) |

Cornelia Castle transposed a 2-bar melodic idea down a step. Here the **entire 4-bar unit — melody, countermelody, bass rhythm, and the harmonic relationship itself — is sequenced up a step.** Same device, bigger footprint. The harmonic relationship transposes exactly: "tonic → dominant-7th-in-first-inversion" restated in the ii's key.

**Dual-function landing notes (both phrases):**
- Phrase 1: melody's held A = 5th of D7 → becomes **root of Am** when bar 5 arrives.
- Cornelia parallel confirmed: landing note belongs to current chord AND the next one; the sequence works because the relationship (not just the shape) transposes.

---

## Melody Analysis

### Chord-tone-on-downbeat check — zero exceptions again

Every chord-arrival downbeat lands on a chord tone. Second song, same rule, no violations:

| Arrival | Melody note | Function |
|---------|-------------|----------|
| G (bar 1) | (rest; B on beat 1) | 3rd |
| D7/F# (bar 3) | D | root |
| Am (bar 5) | A (held over the barline) | root |
| E/G# (bar 7) | E | root |
| C (bar 9) | (B ending; E on beat 33) | 3rd |
| D7 (bar 10) | F# | 3rd |
| Bø7 (bar 11) | D | 3rd |
| E (bar 12) | B | 5th |
| Am (bar 13) | C | 3rd |
| F (bar 14) | C | 5th |
| Bb (bar 15) | D | 3rd |
| D7 walk (bar 16) | D (still held) | root |

3rd remains the favorite (6 of 12), roots at phrase starts/sequence anchors, 5ths twice.

### Note-by-note highlights

**Bars 1–2, G:** B–A–B–C | B–A–B–D. Neighbor figure around B (the 3rd), C and A as neighbors resolved by step; the D at the end leaps up to launch the held note. Quarter-note pulse — this melody is scalar/stepwise almost throughout.

**Bars 3–4, D7/F#:** D (2 beats) → A held 6 beats. Root then 5th, pure chord tones on the long notes — exactly the "hold on chord tones, move on scale" split from Cornelia Castle.

**Bars 9–10, C → D7:** E–F#–G–F# | E–D–C–D. The big scalar arch of the B section. F# = passing tone between E and G over C major, off the strong beat, resolved by step, and it lands as the 3rd when D7 arrives — pivot note. C natural on beat 39 = the 7th of D7, supplied by the melody (bass/arp don't have it).

**Bar 11, Bø7:** D | A–B–C. A = the half-diminished 7th, on beat 2. Melody supplies the 7th of the chord again.

**Bar 12, E + pickup:** B held (5th), then **G#–A–B eighth-note pickup** (beats 46.5–48) targeting the C that lands on Am. The G# is the money note of the whole E chord — the arpeggio omits it (plays B–E–B), the bass doesn't have it (E+B gallop)... the **melody** carries the chromatic note this time, inside a pickup line, and resolves it G#→A on the way up. Allocation flipped from Cornelia Castle (where the melody avoided A# and inner voices doubled it): whichever voice has room takes the money note.

**Bars 14–16, the long D:** melody walks down C–B–A–G over F, then lands **D5 and holds it ~7 beats** across Bb → D7-walkdown → loop restart. Triple-function common tone: **3rd of Bb → root of D7 → (resolving as) 5th of G.** The loop seam is welded with one held note in the melody while the bass does all the walking — the exact inverse of Cornelia Castle's seam (melody still, accompaniment runs; there the arpeggio ran the scale, here the bass walks D–C–B–A).

---

## COUNTER Track (tr2) — two jobs, one per section

### A section (bars 1–8): parallel sixths + complementary motion

While the melody moves (B–A–B–C...), COUNTER shadows it a sixth below (D–C–D–E...) — parallel sixths, the classic "harmonize a melody in 3rds/6ths" move, NES-style. Then the moment the melody parks on its 6-beat held note, COUNTER breaks off and walks: F#–E–D–C–A under held A; G#–F#–E–D under held B.

**Complementary motion confirmed as a core device: when the melody moves, COUNTER parallels; when the melody holds, COUNTER becomes the moving line.** Same trade-off law as Cornelia Castle's melody/arpeggio pair, executed with a different texture (sixths instead of arpeggios).

Note the G#–F#–E–D descent under the held B: it opens on G# — the money note of E/G# — doubling the bass's G# gallop at the point of maximum chromatic drama. Inner voices carry the accidental; melody floats above on common tones (B = 5th of E, shared with the surrounding Am world). That's the Cornelia F#-bar allocation, reproduced note-for-note in function.

### B section (bars 9–16): switches to arpeggios

Texture change marks the section boundary (Cornelia device, confirmed). Pattern is a 3-against-the-beat rocking figure per 2 beats: X–Y–X on the off-beat grid, mostly **3–5–3** relative to each chord:

| Chord | Pattern | Degrees |
|-------|---------|---------|
| C  | E–G–E | 3–5–3 |
| D7 | F#–A–F# | 3–5–3 |
| Bø7 | D–F–D | b3–b5–b3 (completes the half-dim spelling) |
| E  | B–E–B | **5–1–5 — no G#** (melody claims it) |
| Am | C–E–C | 3–5–3 |
| F  | A–C–A | 3–5–3 |
| Bb | D–F alternating, continuous 8ths | 3–5 |
| D7 walk | D–F# alternating, continuous 8ths | 1–3 |

- Channel allocation: E-major bar strips to 5–1–5 because the melody's pickup owns the 3rd (G#). Chord spelled jointly across channels — same law as Cornelia's B7 bar.
- **F → F# between bars 15 and 16 is the whole harmonic turn in one voice:** the alternating figure changes exactly one note (F natural over Bb → F# over D7) — "isolate the chromatic event," third confirmed instance (Cornelia: B→Bb in the arp; A# doubling at F#-major).
- Bars 15–16 go to continuous eighths (no rests) — accompaniment at its busiest under the melody's stillest note. Trade-off maximized at the cadence/seam, exactly like Cornelia's turnaround.

---

## Bass Track — the rhythmic-engine hypothesis, verified

Cornelia Castle's doc hypothesized: *"even galloping basslines are still stepwise lines underneath, chopped into repeated rhythmic notes."* This track is the proof.

### A section: gallop rhythm, chromatic line underneath

Pattern per 2 beats: root (short) – root – rest – 5th. Strip the rhythm and octave-fill and the bass line is:

**G → F# → A → G#** (bars 1–2 → 3–4 → 5–6 → 7–8)

Two descending half-step pairs, the second pair a whole step up from the first — the bass participates in the same sequence as everything else. Both accidentals (F#-as-bass, G#) exist because the secondary-dominant chords are in **first inversion**: roots sacrificed to keep the bass stepwise around the tonic/ii anchors. Line-first bass, confirmed in a driving track: the gallop is rhythm applied to a line, not a different way of choosing notes.

### B section: root motion, then a walking cadence

Bars 9–15 move to root-position gallop (C, D, B, E, A, F, Bb-in-octaves) — root motion takes over when the harmonic rhythm doubles and the chords themselves are the story. Then bar 16 drops the gallop entirely: **D–C–B–A in quarter notes**, a plain walking descent delivering to G on the restart downbeat. The bass becomes the moving voice at the seam because the melody is frozen on its common-tone D — role swap at the cadence, mirror image of Cornelia (where the arpeggio ran and the bass held).

Bb bar rhythm detail: octave alternation (Bb2–Bb3) — pedal-point energy under the borrowed chord, everything static except the harmony color itself.

---

## Form Summary

| Bars | Function | Chords |
|------|----------|--------|
| 1–4  | A phrase (I → V7/3rd-in-bass) | G · D7/F# |
| 5–8  | A phrase sequenced up a whole step, in the ii | Am · E/G# |
| 9–10 | B section launch, double-time harmony, fake cadence setup | C · D7 |
| 11–13 | Deceptive re-route: full ii–V–i into the ii | Bø7 · E · Am |
| 14–15 | Flat-side mixture darkening | F · Bb |
| 16   | Real dominant + walking bass → loop | D7 (D–C–B–A) → G |

Same skeleton philosophy as Cornelia Castle: simple diatonic frame, every joint upgraded — inverted secondary dominants, a tonicized ii (twice!), borrowed bVII/bIII, and a loop seam welded by common tone + scale delivery.

**Cornelia Castle vs Overworld, structural rhyme:**

| Device | Cornelia Castle | Overworld |
|--------|----------------|-----------|
| Sequence | 2-bar idea, down a step | 4-bar block, up a step, all channels |
| Tonicized chord | vi (F#→Bm), ii (B7→Em) | ii, twice (E/G#; Bø7–E–Am) |
| Borrowed color | iv (Gm) | bVII, bIII (F, Bb) |
| Bass character | held notes, chromatic staircase | gallop, chromatic pairs underneath |
| Money-note carrier | bass+arp (A#), arp (Bb) | counter+bass (G#), then melody (G# pickup) |
| Loop seam | melody resolves onto opening note; arp scale-run delivers | melody holds triple-function common tone; bass walks down to deliver |

---

## Devices Log Delta

**Confirmed from Cornelia Castle (2 for 2):**
- Chord tone on every chord-arrival downbeat; 3rd favored — zero exceptions in either song
- Transposed repeat where the *harmonic relationship* transposes with the melody
- Dual-function landing notes (5th of old chord = root of next)
- Complementary motion / trade-off law — here as parallel-sixths-until-melody-holds
- Pickup lines targeting the next chord's downbeat (G#–A–B → C)
- Isolate the chromatic event; lead with the information (F→F# in one voice; G# handoffs)
- Cross-channel chord spelling / accompaniment covers what the melody doesn't claim (E bar: arp 5–1–5, melody takes G#)
- Line-first bass; inversions serve the line (D7/F#, E/G#)
- Texture change marks section boundaries (sixths → arpeggios at bar 9; gallop → walking quarters at bar 16)
- Trade-off maximized at the cadence (busiest accompaniment under stillest melody)
- Loop seam welding via common tone + stepwise delivery to the restart downbeat

**New in this song:**
- Whole-block sequencing: a 4-bar unit transposed up a step across melody, counter, bass, and harmony simultaneously
- Gallop bass = a held-note bass line chopped into root–root–5th rhythm (rhythmic-engine hypothesis verified)
- Parallel sixths as the counter-voice's "melody is moving" mode
- Full iiø7–V–i tonicization of the ii (richer than a bare secondary dominant)
- Deceptive re-route: set up IV–V7→I, resolve into the tonicized ii instead — deferred resolution as B-section engine
- Flat-side mixture pair bVII→bIII (F→Bb, locally V→I of Bb) as pre-cadence darkening
- Triple-function common tone across the seam (3rd of Bb → root of D7 → 5th of G)
- Melody as money-note carrier (chromatic note in a pickup, resolved by step) — allocation is opportunistic, not fixed per voice
- Walking-bass cadence: accompaniment rhythm dissolves to quarter-note scale descent at the seam
