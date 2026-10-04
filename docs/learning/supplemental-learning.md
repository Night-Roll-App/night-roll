# Supplemental Learning Plan

The song analyses in this repo are the core of the project, but they touch concepts from every level of a college theory sequence at once. This is the supporting practice around them.

## The stack

| Resource | What it's for | Cost |
|----------|--------------|------|
| [Artusi](https://www.artusimusic.com/) | The main workbook substitute: interactive Theory I–IV curriculum with auto-graded exercises, including harmony and part-writing. Used by real college programs. Free for individual self-learners ([pricing](https://www.artusimusic.com/pricing/), [demo](https://www.artusimusic.com/assignments/demo/)). | Free |
| [musictheory.net exercises](https://www.musictheory.net/exercises) | Daily 5-minute drills on fundamentals: intervals, key signatures, chord spelling. For patching potholes (e.g. the up-a-fourth = down-a-fifth confusion from the Overworld bass session). | Free |
| Claude sessions (this repo) | Applied analysis of real Uematsu tracks; each session starts with ~5 retrieval questions from the previous session. Custom problem sets on request. | — |
| [Hooktheory Books I & II](https://www.hooktheory.com/books/pricing) | Optional later addition: interactive books built around melody-over-Roman-numeral-chords in popular music, with self-checking exercises. Closest match to the end goal (writing songs). | ~$35 one-time |
| [8-bit Music Theory](https://www.youtube.com/@8bitMusicTheory) (YouTube) | Companion viewing: deep analyses of video game music, including Uematsu/FF. Good calibration check after finishing a song's own analysis. | Free |

## On textbooks (decision: skipped, mostly)

*Tonal Harmony* (Kostka & Payne) is the standard college text, but the exercise workbook has an instructor-only answer key — bad for self-study — and used copies are often filled in. Decision: do exercises online where they grade themselves. If a reading copy ever feels useful, a used 6th/7th edition (~$10) is equivalent to the $114 current hardcover for these purposes.

## Session log — concepts covered (quiz source material)

**2026-07-21 (Overworld bass):** see "Theory concepts unlocked" in overworld.md — V/ii notation, up-a-fourth = down-a-fifth, ii–V–i, tonicization vs. modulation vs. borrowing.

**2026-07-22 (theory conversation):** secondary dominants can target any diatonic major/minor triad (not diminished); resolution is the payment, deferral allowed but must pay off. Modulation recipe = introduce the new key's dominant, resolve, and stay; pivot chords (C is IV of G *and* V of F) make it smooth; the dominant 7th is unambiguous (C7 exists only in F) while a plain triad is not. V7 resolves equally to major or minor tonic — the dominant is identical either way (promise of destination, not the weather). Key-signature distance predicts melodic difficulty (G→F = 2 steps; G→Fm = 5). Shared opening template found in both songs: home → dominant → minor chord → secondary dominant aiming at a minor target (see chord-charts.md).

**2026-07-22 late (KeyChangeTest analysis):** deceptive resolution — a dominant resolving somewhere unpromised (C7→Bb instead of F); lands soft when the destination is a near relative (C7 = V/V in Bb). Retroactive reinterpretation: the F chord expected to be tonic got demoted to V of Bb by what followed — melody decides the king (phrase endings + emphasis outrank the chart). Key fingerprint test: F major has E♮, Bb major has Eb — one accidental class settles which key. Bare-octave arrivals hide chord quality (Bb octaves = major/minor unproven; **open quiz question: which added note makes it Bb minor?**). Riff vs. melody: stepwise notes don't make a melody — a repeating one-bar cell is an ostinato; a melody needs a phrase arc (build, peak, resolve). Leading tone in the melody sells a turnaround (F#5 over the D chord).

**The seventh-side resolution (Josh's coinage — his to rename):** resolving a dominant 7th to the key of its own *seventh* instead of its promised tonic (C7 → Bb rather than C7 → F). Why it works: the seventh of any V7 is the tonic two stations down the circle of fifths (C → F → Bb), so the destination note is already sounding inside the dominant — pre-planted in the ear, a common-tone modulation in disguise. Official theory has no name for it; it files the move retrospectively as V/V → I and lists it among the stock deceptive resolutions (V7 down a whole step). Discovered by ear in KeyChangeTest-07-26: "the Bb is in there — let's just go to Bb." Caveat from the same discovery: the common tone opens the door, but the melody must then feed the new tonic (phrase endings, emphasis) or the throne doesn't hold. Every V7 carries this secret second destination.

**2026-07-29 (tooling night + Baseball/Beach first look):** built the Night
Roll player up into a real analysis tool (see open-items.md for the feature
list). New piece CM6-G7b9 ("Baseball / Beach Song") parsed but not analyzed
together yet — first-look observations logged as quiz-source concepts:
**extended tonic chord** (C6 = C-E-G-A, the ballpark-organ chord), **altered
dominant** (G7♭9 — the ♭9 Ab as the melody's semitone color), **rootless
voicing** (Josh's chord track spells B-D-F-Ab, no G — which is a **fully
diminished 7th**, symmetric stack of minor 3rds), **chromatic bass creep**
instead of a root pedal under the dominant, and a melody that outlines the
dim7 arpeggio (bars 13–14) before a stepwise scale resolution. Questions
awaiting Josh in open-items.md.

**2026-07-30 (overnight build):** live sheet-music view in Night Roll (see
docs/design/score-view-plan.md); every MIDI's key signature corrected in the file itself
(detected + analysis-pinned); Battle's corrupted MIDI repaired (was hiding 4
of its 5 music tracks — and its key is **G minor**, quiz-worthy: what's the
relative major?).

**2026-07-31 (tooling evening + engraving concepts):** score view shipped and
polished; key-discovery system built (Josh's design: keys hidden until he
finds them — "having the key set for me is cheating"). Concepts learned
through the tool's own behavior, quiz-source worthy: **cancellation
naturals** (readers can't see absence — revoked flats are announced with
explicit naturals, essential for returns to C); **reprint rules differ per
symbol** (clefs and time signatures print once until changed; key signatures
reprint at every change, with cancellation); **enharmonic spelling by
direction** (Josh derived raise-ascending/flatten-descending himself from
his own both-ways melody); **signature ink is not musical time** (playhead
hops glyphs); pivot-chord ambiguity (IV of G = V of F — answered instantly;
the *why* re-banked for retrieval). Also: quizzes.md created (protocol +
bank), notes manager, ranged key changes with automatic revert.

**2026-08-01 late (key sweep, songs 1–6):** Josh swept opening keys solo
(Claude iPad app as tutor, notes.txt dumps as data). Verdicts his own:
Airship F, Battle Gm, Cave Cm, Chaos Temple Em (+ prior Overworld G,
Cornelia D). Quiz-source concepts, all his: **bass → tonic, melody → mode**
(root motion can't settle mode; the b3/b6/b7 collection can't settle tonic —
two legs, different jobs); **compound/polyphonic lines** — one monophonic
track carrying two interleaved strands (three sightings in one night: Cave
bass dance, Cave melody pedal, Chaos Temple arpeggio) as a workaround for
the 3-voice ceiling; **chromatic continuity licenses out-of-key notes** (a
chromatic line's job is unbroken half-step motion, not key membership) — and
its corollary, that the first note of a chromatic descent is the *least*
able to testify about key; **conjunct approach** — a strand wants stepwise
entry into its target; **emphasis as tonic evidence** (hammered vs visited);
**genre priors aren't evidence** ("battle themes are minor" — correct here,
logged as a prior); first-bass-note rule at 6/6 → usable weak evidence, with
the evidence-vs-confirmation and genre-convention caveats. Open concept
parked in battle.md: raised 7th as chord-byproduct vs scale. Sweep tracker:
key-sweep.md.

**2026-08-01 (catalog cleanup + ship loop discovery):** MIDIs trimmed to
their first pass; GM arranger padding stripped so tracks ≈ NES voices
(Shop turned out to be 3 real parts triplicated across 9 instrument
tracks). Quiz-source concepts from the session: **loop point ≠ song
start** — Josh discovered by ear that Ship returns to bar 2, not bar 1
(verified: bars 26+ = bars 2+ note-for-note): the two-note **pickup**
(A, Bb on beats 3–4 of bar 1) plays once, then the 24-bar loop excludes
it — and the same pickup notes recur melodically at the end of bar 25 to
lead the ear back in. New `loop:` annotation type records such
discoveries per song. **Arrangement vs. composition:** octave doublings,
unison copies, and pad chords in downloaded MIDIs are arranger additions
the NES (2 pulses + triangle + noise) could never play — spotting them
is itself ear training. Also: unit tests exist now (`make test`, today `npm test`),
fit-to-screen on load, vertical pinch zoom, note chasing on play.

**2026-09-19→22 (composition session — Night Black, Carnival; web
handoff, filed 2026-09-23):** Josh's work, feedback-only session. Night
Black is structurally done: intro vamp E ↔ C, A section melody from
bar 5, B section C♯m/G♯ | G♯ | A | F♯m–D♯°–E ×2, bar-20 cadence
C → B13 → loop to E. Concepts he named or used: **chromatic mediant**
(the vamp), **hocket** (B-section pulse2 vs bass interlock), **Lydian
♯4 / C(♯11)**, **13th chord** (B13 vs B6 = the 7th), **accented passing
tone** vs **neighbor tone** (bar 20 G♯ is a neighbor), **Phrygian
cadence** (♭II→i). His own rules from the session: every important
move is a half-step sag; a seam that works on guitar but not in Night
Roll is missing what the guitar was doing (usually rhythm — bar 12's
pulse2 cell one bar early fixed the A→B seam); guitar accents become
pitch, length, or the noise/triangle channel; B-section checklist —
change harmonic rhythm, start off-tonic, change texture/register, carry
one A element across, real cadence in the last bar. Carnival (files
still town-theme.*) rebuilt as a six-bar loop F–F–Gm–Am–B♭–C7 with a
new melodic arc; drums to be penciled by hand.

## Current composition exercise (in progress)

Two 8-bar loops: chords from G-land → C7 → F **major** + melody; then the same but resolving to F **minor**. Guidelines agreed: introduce C as plain IV before it returns as C7 (furniture, then door); melody crosses the seam on common tones (C, F, G); chord tone on every chord-arrival downbeat; in the minor version let one prominent note (Ab on the Fm downbeat) carry the darkness; sing before playing; save both versions (MIDI or recording) and bring them back for analysis with the same tools used on Uematsu.

**2026-07-26 attempt (KeyChangeTest-07-26.mid, analyzed 2026-07-22 session):** Josh's first-ever secondary dominant, played in live. What he wrote: G–Am–G/B–C7 twice (bass walks G-A-B-C, line-first), then a deceptive swerve — C7 resolved to **Bb**, not F. Josh heard the section as Bb before the analysis confirmed it (pitch collection = Bb major exactly, zero E naturals; melody phrase-endings crown Bb). Section reads Bb: I–V–IV, then D major (V of G) as an **intentional turnaround** — F# leading tone placed in the melody, Eb→D half-step squeeze against it. Melody verdict: bars 1–3 are a melodic ostinato (riff — one-bar cell, stepwise, only the downbeat anchor changes); bars 11–12 are a real phrase arc (climb, peak F#5, resolve to held D). Still owed: the F-minor half (both halves currently identical), and a revision pass after analyzing Uematsu's Overworld melody track.

## Where the song sessions have placed me so far (2026-07-21)

Material covered in the Cornelia Castle and Overworld (bass) sessions spans Theory I–IV: Roman numerals and chord spelling (I), inversions and bass-line logic (II), secondary dominants and tonicization (III), mode mixture / borrowed chords (IV) — plus the by-ear analysis skill that classrooms teach separately as aural skills. Known weak spot to drill: interval direction arithmetic (fifths vs. fourths).

**2026-08-02 (overnight sweep on chip captures — from session notes):**
Dead Music D minor called cold (Dm→Gm→F path, non-circular hit). Ending
Theme G major; "designed to end, not loop" → the anacrusis insight that
generalized the sweep hypothesis to the loop-target/structural-downbeat
form. Floating Castle parked: Bb tonic (full-chip unison, unique), mode
resists — Lydian proposed and correctly abandoned when the natural 4th
appeared. Gurgu Volcano fully cracked over an hour: D Dorian (no Bb in
bars 1–12; major IV = Dorian fingerprint), raised-7th cadence device
(second sighting after Battle), channel role swap at bar 13 (first
chip-only finding), modulation by transposing the whole vamp up a m3 to
F Dorian — spelling derived from first principles, catching Claude's Eb
major slip en route. Feature born from it: seven-mode key picker.
Quiz-worthy concepts: Dorian's major IV; raised 7th as dominant-maker,
not scale change; anacrusis vs structural downbeat; tonic ≠ lowest note
(the fifth-in-the-bass trap, now with script data behind it).

**2026-08-02 (late evening — town + menu, from the handoff):** Town done
end-to-end solo: C major (diatonic set → C-vs-Am tiebreak via opening C +
G7 pointing home), full 15-chord map, sections, and a textbook **4–3
suspension** identified at bar 8 (C prepared in bar 7, held over the
third's slot, resolving to B). Passing-tone discipline now a named
three-test routine (duration, metrical position, approached/left by
step) applied consistently (bar 6's B, bar 7's C). Inverted chords
distinguished purely by bass under identical arpeggio figures (G/B,
G7/F). Seam typology: Town = prepared (Gsus4→G7 retransition). Menu
opened: compound-meter arpeggio figure parsed into two-chords-per-bar
harmonic rhythm; mid-flight thread = E7's tritone into bar 4.
Quiz-worthy: the three passing-tone tests; what makes a 4–3 suspension
(preparation, dissonance on the beat, downward resolution); why a full
quarter on the beat makes D7 vs D; inversion identification from bass
alone.

**2026-08-03 (theory exchange — 6/8 vs 3/4, prompted by the new meter
feature):** Josh's initial frame: "the composer counts to six rather
than three." Sharpened: both meters hold the same six eighths; the
difference is grouping — 3/4 = 2+2+2 (three beats, square insides),
6/8 = 3+3 (TWO beats, triplet insides) — so 6/8 counts lower, not
higher. Ear test: pulse spacing — strong points every three eighths =
6/8, every two = 3/4; bass placement and harmonic-rhythm alignment are
the fingerprints. Hemiola = regrouping the same six eighths mid-piece
(Bernstein's "America"). Application to Menu deliberately withheld —
his determination. Josh then pushed to the deep version: what separates
6/8@100 from 3/4@200 when the sound streams are identical? Answer:
nothing acoustic — meter is a CLAIM about grouping, not a property of
the wave. 6/8 writes the strong-weak pairing of triple groups into the
bar; fast 3/4 (waltz "in one", Beethoven scherzos) leaves pairing to
unnotated hypermeter (cf. ritmo di tre battute). His original
"changes on the sixes" instinct = the right evidence: harmonic rhythm
aligning with paired groups argues 6/8. Quiz-worthy: 2+2+2 vs 3+3; why
6/8 is felt in two; the ear test; hemiola; meter-as-claim vs acoustics;
hypermeter.

**2026-08-05 (prologue chords + shop meter):** Prologue: eleven chords
verified, four corrected through the work — and a method upgrade fell
out: reading only a chord's ONSET beat is a heuristic that broke at 5.3
(the D arrives on beat 4 → D/A, not F#m); read the full span, weight
what's long and metrically strong. Two chords deliberately left open
(6.1 Gm-vs-C7, 6.3 span split). Shop: the project's first from-scratch
meter determination and first confirmed fossil error — inherited 4/4
disproved by the barline test (dominant triangle figure of three
quarters phases across 4/4 barlines; realigns only every 3 bars),
re-barred clean, then 3/4-vs-6/8 settled by onset grouping (positions
1,3,5 = duple insides; spans straddle the 3+3 boundary) plus the felt
one-beat-per-bar. Fast 3/4 in one — the exact category from the 08-03
hypermeter discussion, now found in the wild. Quiz-worthy: the barline
test; onset-position evidence for 3/4 vs 6/8; full-span chord reading.
