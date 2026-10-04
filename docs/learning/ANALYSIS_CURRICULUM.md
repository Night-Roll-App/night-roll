# Analysis Curriculum

A sequenced list of short analysis targets for building theory vocabulary in Night Roll.

**Status: PROPOSED, PARKED (filed 2026-08-26).** Produced in the 2026-08-23
web session alongside `handoffs/handoff-2026-08-23.md`. Josh: "there's a lot
of ideas in here that don't necessarily need to be implemented immediately."
Nothing in this document has been built or committed to. The parked backlog
it generates is tracked in `open-items.md`; the blocking dependency for the
whole curriculum is MIDI import (the existing importer is NSF-oriented, and
every target here is MIDI or Humdrum kern).

**Draft caveat:** draft v1. Bar numbers and phrase boundaries marked *(verify)* need to be
confirmed against the actual score/MIDI once imported — do not trust them blindly.

---

## Purpose

The existing FF1 analysis work covers one texture very well: three voices, mostly
diatonic, ostinato-driven, square four-bar phrasing, clear tonic/dominant motion.

This list is deliberately chosen to add textures *not* present in that corpus:

- four independent voices with real voice-leading constraints
- sustained imitative counterpoint (as opposed to imitative gestures)
- chromatic harmony: secondary dominants, applied chords, modal mixture
- non-square phrase structure
- cadence taxonomy beyond authentic/half

It is **not** chosen for prestige or canon coverage. Every target is short enough to
finish in one or two sessions.

---

## Working method

The unit of study is a **phrase**, not a piece. For chorales this is unambiguous:
Bach delimits phrases with fermatas. Each fermata is a cadence. That gives a natural
bounded target — "phrase 3 of BWV 269" is a complete, self-contained lesson.

For each target, the deliverable is a written analysis in the repo covering:

1. Key (derived, not assumed — same non-circular methodology as the FF1 sweep)
2. Roman numeral for every vertical sonority
3. Cadence type at the phrase end, with justification
4. Every non-chord tone labeled by category
5. One sentence: what this phrase teaches that the previous target didn't

---

## Prerequisite vocabulary

These terms appear throughout and should be defined in the repo before Unit 1, so
analyses can reference a shared glossary rather than re-explaining.

**Cadence types:** PAC (perfect authentic), IAC (imperfect authentic), HC (half),
DC (deceptive), Plagal, Phrygian HC.

**Non-chord tones:** passing tone, neighbor tone, suspension (with preparation /
suspension / resolution), retardation, appoggiatura, escape tone, anticipation,
pedal point.

**Voice-leading terms:** parallel fifths/octaves, contrary/oblique/similar/parallel
motion, voice crossing, voice overlap, doubling, leading-tone resolution.

**Harmonic terms:** secondary dominant (V/x), applied leading-tone chord (viio/x),
pivot chord, modal mixture, tonicization vs. modulation.

Note: several of these are almost certainly already happening in the FF1 analyses
under informal descriptions. Part of the value here is attaching the standard names
so the existing work becomes cross-referenceable.

---

# PART I — Four-part voice leading (Bach chorales)

Rationale: chorales are the single highest-density source of voice-leading
information per bar in the repertoire, they are 8–16 bars long, and there are 371 of
them so difficulty can be tuned precisely. Four voices maps directly onto Night
Roll's lane structure. This is the standard conservatory drill, and it is short.

## Unit 1 — BWV 269, "Aus meines Herzens Grunde"

**Target:** phrases 1 and 2 only (through the second fermata) *(verify)*
**Reveal policy:** key revealed (see Policy System below) — the point of this unit is
voice leading, not key derivation.

The conventional first chorale (Riemenschneider No. 1). Almost entirely diatonic,
root-position triads, stepwise soprano.

**Extract:**
- The bass line in isolation. Notice how much of it is leaps of a fourth/fifth and
  how little is stepwise compared to the soprano. This is the single biggest
  difference from NES bass writing, where the triangle usually arpeggiates or
  pedals.
- Count parallel fifths and octaves between any two voices. There should be zero.
  Confirming that by hand is the exercise.
- Which chord tone is doubled in each root-position triad, and whether there's a
  pattern.

**Why first:** establishes the four-voice baseline with no chromatic distractions.

## Unit 2 — BWV 269, remaining phrases

**Target:** phrases 3 through the end.

Same piece, so no new context to load. Adds: at least one internal cadence on a
non-tonic degree *(verify)*, and first-position inversions in the bass.

**Extract:**
- Every cadence, classified. This is the first real cadence-taxonomy exercise.
- The difference in effect between a phrase ending on I with soprano on scale
  degree 1 (PAC) vs. degree 3 or 5 (IAC). Directly relevant to why some Graveyard
  phrase endings feel final and others don't.

## Unit 3 — Passion Chorale, "O Haupt voll Blut und Wunden"

**Target:** first two phrases, then separately the final phrase.
**Note:** Bach harmonized this melody at least five times across the St Matthew
Passion and elsewhere, in different keys and with different harmonizations. Pick one
version and record which. *(verify which BWV/movement is being imported)*

Introduces the **Phrygian half cadence** — bass descending by semitone to scale
degree 5, characteristic of minor-mode phrase endings.

**Extract:**
- The Phrygian HC specifically. This is high-value for Graveyard: it is the standard
  way minor-key music arrives on a dominant without sounding like a major-key half
  cadence.
- Suspensions. This harmonization is dense with them.
- Compare two of Bach's different harmonizations of the same melody side by side in
  Night Roll if the importer makes that easy. Same tune, different harmony — an
  unusually direct lesson in what harmonization *is*.

## Unit 4 — A chorale with secondary dominants

**Target:** to be selected. Criteria: minor key, contains at least two applied
chords, under 16 bars.
**Candidates:** BWV 244.54, BWV 20.1, BWV 262 *(verify contents before committing)*

**Extract:**
- Every accidental in the score, and whether it is (a) part of the minor scale's
  raised 6/7, (b) an applied leading tone, or (c) modal mixture. Being able to make
  that three-way distinction reliably is the goal of this unit.
- Tonicization vs. modulation: does the applied chord resolve and move on, or does
  the music stay in the new key?

## Unit 5 — "Es ist genug," BWV 60.5

**Target:** first phrase only. Possibly first two bars only.
**Reveal policy:** key and spelling revealed. Deriving the key here without spelling
is a trap, not an exercise — the opening is deliberately disorienting.

The most harmonically extreme chorale Bach wrote, and the one Berg quoted in his
Violin Concerto. Reserved for late in Part I because it will not make sense earlier.

**Extract:**
- Just the opening ascent. What are those four soprano notes, and what is the bass
  doing underneath them.
- This is the unit that should make it obvious that "diatonic chorale" was a
  simplification.

---

# PART II — Imitative counterpoint (Bach Inventions)

Rationale: this directly answers the question that motivated the whole list — what
sustained imitative writing actually looks like, as opposed to a piece that starts
imitatively and then abandons it. Two voices only, so texture stays manageable.

Bach's own stated purpose for the collection was teaching students to play in two
voices cleanly and then handle three obbligato parts, which is close to the intent
here.

## Unit 6 — Invention No. 1 in C, BWV 772: exposition

**Target:** bars 1–7 *(verify)*
**Length:** the whole invention is roughly 22 bars.

**Extract:**
- Identify the subject precisely: where does it start, where does it end. This is
  harder than it sounds and is the actual skill being trained.
- The second voice's entry: at what interval, and at what time offset.
- Critically: does the first voice *keep going* with independent material while the
  second states the subject? That continuation is the countersubject, and its
  presence or absence is exactly the difference between real counterpoint and
  imitative gesture.

**Cross-reference:** once this is understood, revisit the Dancing Mad organ opening
and check whether the same conditions hold. That comparison is the payoff for this
whole unit and should be written up.

## Unit 7 — BWV 772: sequences and episodes

**Target:** bars 7–15 *(verify)*

**Extract:**
- Locate the sequences: a short pattern repeated at successively higher or lower
  pitch levels. Mark the interval of transposition and the number of repetitions.
- What key does the music arrive in at the midpoint, and by what mechanism.
- Sequential writing is directly transferable to the triplet-run material in
  Graveyard.

## Unit 8 — BWV 772: return and close

**Target:** bars 15–end *(verify)*

**Extract:**
- How the return to C is engineered.
- Voice exchange: places where the two voices swap material.
- The final cadence, classified.

## Unit 9 — Invention No. 4 in D minor, BWV 775

**Target:** exposition only.

Minor key, 3/8, running sixteenth-note subject. Chosen because it's minor-mode
imitative writing at speed, which is the closest classical analogue to what metal
riffing actually does.

**Extract:**
- Compare the subject's melodic contour to a Megadeth riff. This is not a joke —
  the running-subject-over-moving-bass texture is structurally the same object.
- Harmonic rhythm: how many chords per bar, and how it changes at cadences.

---

# PART III — Chromatic VGM (bridge back to home territory)

Rationale: FF6 is meaningfully more chromatic and less square than FF1, while
staying in repertoire that's actually enjoyable to spend hours with. The point of
Parts I and II is to make this part *easy*.

## Unit 10 — "Terra's Theme" (FF6)

**Target:** the main melodic statement, first 16 bars *(verify)*

**Extract:**
- Full roman numeral analysis. Expect secondary dominants and at least one
  modulation.
- Phrase lengths: are they four bars, or does Uematsu extend/truncate?
- Compare directly to an FF1 track already analyzed. What is he doing here that he
  wasn't doing in 1987?

## Unit 11 — "Dancing Mad," Movement 3 (organ section)

**Target:** the opening imitative section only. Roughly the first 30 seconds.

The original motivating question. Deliberately last on the list.

**Extract:**
- Does the second voice enter at the fifth or the octave, and how many bars does it
  hold before abandoning strict imitation?
- Compare against the BWV 772 exposition analysis from Unit 6 point by point.
- Write a conclusion. Not "is it good" — that's a different question — but
  specifically: does it sustain imitative counterpoint, and for how long.

## Unit 12 — Own composition: Graveyard

**Target:** the V–V6–i progression and the triplet-run section.

Re-analyze existing original material using the vocabulary from Units 1–11.

**Extract:**
- Is the V6 functioning the way an inverted dominant functions in the chorales, and
  is the bass doing what a chorale bass would do there?
- Are there parallel fifths/octaves between the triangle and either pulse voice?
  Not necessarily a problem in NES writing, but worth knowing about deliberately
  rather than accidentally.
- Are the triplet runs sequential in the BWV 772 sense, or just fast?

---

# PROPOSED: Reveal Policy System

**Status: PROPOSED. Needs sign-off before anything is built.**

## The problem

`WEB-SESSION.md` rule 1 is currently absolute: never supply keys, chords, cadence
names, Roman numerals. That rule is correct for FF1, where key derivation *is* the
skill being trained.

It is wrong for parts of this curriculum. In Unit 1 the skill is four-voice voice
leading; spending a session deriving that BWV 269 is in G is time not spent counting
parallel fifths. In Unit 5 the harmony is deliberately disorienting and deriving the
key unaided is a trap rather than an exercise. In Unit 4 the spelling of an accidental
*is* the answer — asking for derivation there means reconstructing Bach's reasoning
and then checking it, which is a different exercise from learning how applied chords
behave.

Different constraint sets train different skills. The constraint should be a property
of the corpus, not a global rule.

## Proposal

A `policy` field, settable at song, album, or collection level, with song-level
overriding album-level. It declares which axes are **revealed** (tutor and tools may
state them freely) vs. **withheld** (derived by Josh; tutor checks and teaches only).

Withholdable axes:

| Axis | Withheld means |
|---|---|
| `key` | No tonic or mode from tutor or tools |
| `spelling` | Pitches given as pitch classes / register numbers only, never as C♯ vs D♭ |
| `phrase` | Fermatas and phrase boundaries hidden |
| `chords` | No chord identities or Roman numerals |
| `meter` | No time signature |
| `sections` | No form labels |

Default for anything with no policy set: **all withheld.** That preserves current FF1
behavior with no migration.

## Policy per unit in this curriculum

| Unit | Revealed | Withheld |
|---|---|---|
| 1–2 (BWV 269) | key | spelling, phrase, chords, meter, sections |
| 3 (Passion Chorale) | key | spelling, phrase, chords, meter, sections |
| 4 (secondary dominants) | key, spelling | phrase, chords, meter, sections |
| 5 (BWV 60.5) | key, spelling | phrase, chords, meter, sections |
| 6–8 (BWV 772) | key | spelling, phrase, chords, meter, sections |
| 9 (BWV 775) | key | spelling, phrase, chords, meter, sections |
| 10 (Terra's Theme) | — | all |
| 11 (Dancing Mad) | — | all |
| 12 (Graveyard) | n/a — own composition | n/a |

## What makes this real rather than cosmetic

Two requirements, both load-bearing:

1. **The query tools must honor the policy.** `pitch-census.mjs` currently reports
   pitch classes; under a `spelling: withheld` policy it must not report spellings
   even if the source file has them. Same for any fermata data under
   `phrase: withheld`. If the tools leak, the policy is decorative.

2. **`WEB-SESSION.md` rule 1 must read from the policy.** Rewrite from "never supply
   his findings" to something like: "supply nothing on any axis the active policy
   marks withheld; axes marked revealed may be stated freely. Default policy is
   all-withheld." The spirit is unchanged — the tutor still never hands over
   anything Josh is meant to derive. What changes is that *what he's meant to derive*
   becomes explicit and per-corpus instead of implicit and global.

## Related: spelling-blind mode with reveal

Falls out of the same mechanism. For kern-sourced material, ground truth is present
in the file. So: withhold spelling, let Josh derive, then reveal and diff.

This is the first time the derivation methodology becomes **auditable** — FF1 has no
ground truth to check against, since NES register data has no spelling either. Worth
building as an actual feature: a diff view showing derived vs. actual spelling per
note.

---

# PROPOSED: kern → rollnotes mapping

**Status: PROPOSED.** Mapping is against the annotation types listed in
`WEB-SESSION.md` (keys, meters, sections, chords, loops, chops, tempo, track
voice/color). Verify against the current `NIGHT-ROLL.md` format spec before building.

| kern token | Meaning | rollnotes destination |
|---|---|---|
| `*k[f#c#]` | key signature | `key` — but this is the *signature*, not the tonic. Ambiguous between relative major/minor. Store as-is; don't infer mode. |
| `*M4/4` | meter | `meter` |
| `*I<name>` | instrument/voice name | `track voice` |
| `4c#` / `4d-` | duration + **spelled** pitch | note data. **No existing annotation type holds spelling.** See gap below. |
| `;` suffix | fermata | **No existing annotation type.** See gap below. |
| `=N` | barline number | existing bar numbering |
| `*^` / `*v` | spine split/join | voice divisi — check whether the note model supports a track splitting mid-piece |

## Gaps

**1. Per-note spelling.** Nothing in the current annotation set carries it. Two
options:

- *(a)* Add it to the note data itself, alongside pitch/duration. Cleaner
  conceptually — spelling is a property of the note, not an annotation about it.
  But it means the note model diverges between NES-sourced (no spelling available)
  and kern-sourced (spelling available) material.
- *(b)* New annotation type `spelling`. Keeps the note model uniform. Fits the
  existing pattern where annotations are the layer of interpretation over raw note
  data — and spelling genuinely *is* interpretive for NES material.

Leaning (b), partly because it makes the policy system trivial: withholding spelling
is just not resolving that annotation type.

**2. Fermatas / phrase boundaries.** Could be shoehorned into `sections`, but that
conflates "phrase ends here" with the existing structural-section marker, and
chorales have a fermata every two bars — that would flood the sections layer.
Suggest a new `phrase` annotation type.

**3. Conversion pipeline.** The `bach-371-chorales` repo Makefile already generates
MIDI from kern. So the path is: kern → MIDI (existing Makefile) for note data, plus
a small parser extracting the annotation layer (key sig, meter, spelling, fermatas)
into rollnotes JSON. The parser is the only new code.

**4. Voice count.** Night Roll's model is NES tri-voice plus drum lane. Chorales need
four independent pitched voices. Check whether that's already supported.

---

# PROPOSED: Transformation tools

**Status: PROPOSED, not scoped, not committed.** Josh's note: it's unclear whether
this belongs in Night Roll proper or somewhere adjacent, and the architecture
question should be settled before any of it gets built. Recorded here as a design
direction, not a work queue.

## Design principle

The value is in the transformation **failing in specific places**. A tool that
silently produces plausible output teaches nothing. A tool that flips a piece and
then flags every note it wasn't sure about turns each flag into a lesson: something
functional was happening there.

So the requirement for every tool below is the same — **surface the failures, don't
smooth them over.**

## Prior art in the corpus

Josh already ran a voice swap manually on `cool-b-maj-with-b-part` (the bass carries
the melody in that piece, so swapping moved it up). Finding: it didn't work — the
melodic motion that reads well in the bass register doesn't sit right up high.

That's exactly the intended outcome of one of these tools, arrived at by hand. Worth
writing up as an analysis doc regardless of whether the tooling gets built, and worth
revisiting later with vocabulary — the likely explanation involves register-dependent
interval perception and what bass lines are structurally *for*, but that's his
derivation to make.

## Tool list

### 1. Mode flip (minor ↔ major)

The motivating example. Naive implementation — lower/raise scale degrees 3, 6, 7 —
breaks in instructive ways:

- **Leading tone destroyed.** Minor's raised 7 is not part of the natural minor
  scale; flipping mechanically removes it and cadences stop functioning.
- **Secondary dominants collapse.** Applied chords depend on chromatic alterations
  that a blanket scale-degree rule flattens into diatonic chords.
- **Picardy thirds** and other deliberate mode mixture get mangled.
- **Melodic minor ascending/descending** asymmetry has no major-mode equivalent.

Requirement: flag every ambiguous note rather than resolving silently. The flag list
*is* the output.

### 2. Reharmonize the bass

Keep the soprano, strip the other three voices, Josh fills them in, diff against
Bach's original. This is the standard conservatory exercise, mechanically simple to
build, and directly reuses the diff view proposed for spelling-blind mode.

Grading is not "did you match Bach" — it's "where did you differ and was your version
defensible." Tool shows the diff; the judgment stays Josh's.

### 3. Voice swap

Melody to bass, bass to melody. See prior art above.

### 4. Voice removal

Delete one of four voices. Which can go while the harmony still reads? Teaches
doubling and which voices are structurally load-bearing vs. filling.

### 5. Squarify

Force irregular phrase lengths onto a 4-bar grid. Hear what's lost. Direct
counterpart to the FF1 corpus, which is square nearly throughout — this makes the
squareness audible as a choice rather than a default.

### 6. Non-chord-tone strip

Reduce to chord tones only, compare against the original. Makes ornamentation visible
by subtraction. Depends on chord annotations existing, so it comes after chord
analysis rather than assisting it — this is a *check your work* tool, not a discovery
tool.

### 7. Rhythm flatten

All notes to equal duration, pitch only. Isolates contour from rhythm. Useful for
comparing melodic shapes across pieces with different rhythmic surfaces.

---

# PROPOSED: Quiz generation

**Status: PROPOSED.**

`quizzes.md` currently holds a protocol and a hand-built question bank, maintained
outside the app. The upgrade is generating questions **from the annotation data**.

Example question types, all auto-generatable:

- "Here is a cadence from a chorale you haven't analyzed. Classify it."
- "Here are four bars with one voice hidden. Which voice is missing?"
- "This chord is annotated in song X. What is its Roman numeral?" (drawn from songs
  already analyzed — spaced repetition over his own findings)
- "Two of these four excerpts are in the same key. Which two?"

Where kern provides ground truth, grading is automatic. Where the corpus is
NES-sourced, questions are drawn from Josh's own confirmed annotations, so grading is
against his prior self — which is also a consistency check.

Volume matters: 371 chorales is effectively an infinite question bank for cadence and
voice-leading questions.

---

# PROPOSED: Generated textbook

**Status: PROPOSED, speculative.**

`glossary.md` already splits terms into ENCOUNTERED vs DEMONSTRATED. That's the
skeleton of a textbook table of contents.

The artifact: for each term, generate a page containing the definition plus **every
place in the corpus where Josh actually derived or encountered it**, with links to
the specific bars and the analysis docs. Generated from existing annotations and
analysis files, not hand-written.

What makes this worth doing rather than just reading an existing textbook: it is
indexed to his own discovery path. A term's page shows the FF1 song where he first
hit it, the chorale where it got formalized, and the spot in Graveyard where he used
it. No published textbook can do that.

Dependency: requires analysis docs to consistently tag which glossary terms they
exercise. Cheap if done as a convention from now on; expensive as a retrofit.

---

# Sources

## Bach chorales

**Best machine-readable source — kernScores (Humdrum \*\*kern format):**
- Browse: http://kernscores.stanford.edu/browse?l=371chorales
- Mirrors: http://kern.humdrum.org/browse?l=371chorales and
  http://kern.ccarh.org/browse?l=371chorales
- The site does dynamic conversion to other formats including MIDI and MusicXML.

**GitHub mirror (full corpus, Humdrum format, with a Makefile that generates MIDI,
MusicXML, MEI, LilyPond, and abc):**
- https://github.com/jthickstun/bach-371-chorales
- Also available as a submodule in the humdrum-data repository.
- Tools: https://github.com/humdrum-tools
- Referenced against the Breitkopf & Härtel 4th edition (Dörffel, c. 1875).

*Recommendation: this is the source to use.* Humdrum \*\*kern encodes voice
independence explicitly, which is exactly what a four-voice analysis needs and what
a flattened MIDI file loses. If Night Roll's importer can be pointed at kern rather
than MIDI for this corpus, that's worth the implementation cost.

**MIDI (if kern import is not viable):**
- https://www.bach-cantatas.com/Mus/Chorales-MIDI-1.htm — chorales from cantatas
  BWV 1–197, organized by BWV.

**Scores (PDF, for verification):**
- https://imslp.org/wiki/371_Vierstimmige_Choralges%C3%A4nge_(Bach,_Johann_Sebastian)
  — split into four parts (Nos. 1–101, 101–201, 202–300, 301–371) plus complete score.
- https://imslp.org/wiki/371_Harmonized_Chorales_and_69_Chorale_Melodies_(Bach,_Johann_Sebastian)
- https://archive.org/details/371ChoralesBach

**LilyPond + MIDI alternative:**
- https://gitlab.com/pub8/music/scores/bach/371-chorales

## Bach Inventions

- https://www.midiworld.com/bach.htm — Inventions BWV 772–786 and Sinfonias
  BWV 787–801, sequenced by John Sankey. Note: the page uses an old Flash-based
  player; the underlying .mid files should still be directly fetchable.
- https://bitmidi.com/bach_two_part_invention_bwv772-mid — BWV 772 direct.
- https://www.classicalarchives.com/prs/free.html — explicitly free-to-use MIDI,
  includes Two-Part Inventions No. 1 (BWV 772) and No. 8 (BWV 779). Requires
  displaying an attribution notice; check terms before bulk use.
- https://www.midishow.com/en/midi/87750.html — BWV 774 (example of their
  per-file pages; they have the full set).
- Scores: https://imslp.org — search BWV 772–786.

## Final Fantasy VI

- https://thefinalfantasy.net/ff6/music-midi.html — 25 files, curated index.
  Collection root: https://thefinalfantasy.net/site/midi-collection.html
- https://www.vgmusic.com/ — the long-standing VGM MIDI archive; FF6 section has
  multiple sequences of Terra's Theme with sequencer credits.
- https://bitmidi.com/final-fantasy-vi-terras-theme-mid
- http://www.midishack.net/ffmidi.htm — Aaron Walz's FF I–VII collection.
- https://archive.rpgamer.com/games/ff/ff6/ff6mid.html

**Caveat:** all FF6 MIDI is fan-sequenced by ear or from disassembly, not official.
Sequences vary in accuracy, sometimes substantially. Where an analysis depends on a
specific voicing, cross-check against the SPC or against Ichigo's sheet music
(https://ichigos.com/sheets/114) before drawing conclusions.

---

# Notes for implementation

## Open questions

1. **Does Night Roll's importer handle MIDI?** The existing importer is NSF-oriented.
   FF6 is SNES (SPC, not NSF), and everything in Parts I and II is MIDI or kern.
   If MIDI import doesn't exist yet, it's the blocking dependency for this entire
   curriculum and should be scoped first.

2. **Voice count.** See gap 4 in the kern mapping section above.

3. **Bar-range selection UI.** The whole method depends on isolating a phrase. If
   there's no way to select and analyze bars 7–15 of an imported piece without
   scrolling through the whole thing, that's a feature request.

## Build order

Dependency-ordered, most blocking first:

1. MIDI import (blocks everything)
2. kern annotation parser (blocks the chorale corpus specifically)
3. `spelling` and `phrase` annotation types
4. Policy system + tool enforcement
5. `WEB-SESSION.md` rule 1 rewrite
6. Spelling-blind diff view (nice-to-have, not blocking)

Units 1–3 only need steps 1–3. The policy system can be deferred if the first
sessions just operate under an informal "key is revealed for this corpus"
understanding — but it should land before Unit 4, where the reveal set changes.

## Suggested repo structure

```
analysis/
  chorales/
    bwv269/
      source.krn
      source.mid
      analysis.md
      notes.md
    bwv60-5/
      ...
  inventions/
    bwv772/
      source.mid
      analysis-exposition.md
      analysis-episodes.md
      analysis-return.md
  vgm/
    ff6-terras-theme/
    ff6-dancing-mad-mvt3/
  originals/
    graveyard/
  glossary.md
  progress.md
```

`glossary.md` holds the prerequisite vocabulary, defined once and linked from every
analysis. `progress.md` tracks which units are complete, following the existing
append-only handoff convention.

## Sequencing note

Units are ordered by dependency, not by difficulty alone. Unit 6 (invention
exposition) is the load-bearing one — Unit 11 (Dancing Mad) is only meaningful with
Unit 6 already done, and Unit 11 is the reason the list exists.

If time is short, the minimum viable path is: **1 → 2 → 6 → 11.**
