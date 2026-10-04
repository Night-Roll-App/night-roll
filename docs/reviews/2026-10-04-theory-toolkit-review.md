# Review: theory toolkit (facts + harmony) — 2026-10-04

Reviewer: Claude (Fable), branch `theory-review` (off origin/main 9b498f2d).
Checklist: docs/plans/2026-10-04-theory-toolkit.md. Builders' branches:
facts `worktree-agent-a1bceef2f3d78280d` (3d22645a, d67f38a1), harmony
`worktree-agent-adf893af37ddee64d` (0d3155c4, 67ed4737).

## Merge

- 17c47892 — facts merged clean onto current main.
- 0d368f85 — harmony merged; conflicts in the seven shared manifest/doc
  places, all resolved "both": index.html modulepreload (facts then
  harmony), sw.js `APP_MODULES` (both sets) and `SW_VERSION` → `nr-v34`
  (main had already taken v33 for css/app.css; both builders had written
  v33), src/devtools.js imports + `MODULES` mirror, tests/modules.test.mjs
  `fileCount` 85 / 87 (the real counts: 81 + 4 and 83 + 4), tools/run-tests.mjs
  `FILES` gets both `theory` and `theory-harmony`, NIGHT-ROLL.md module map
  + query tools and WEB-SESSION.md keep both entries.

## Findings and fixes (7cb13ea0 unless noted)

Bugs — each has a regression test in tests/theory.test.mjs:

1. **Point chord notes counted as chord bands** (`factsChordSpans`). The lane
   layout gives every point annotation a drawn `.end` (verified on
   Overworld, Bach, Für Elise through tools/query-lib.mjs: every b2-less
   note has `end !== null`), so harmonic rhythm and `perChordBand` would
   have counted a `chord:` point note. Harmony's `hmBandsFromNotes` already
   required `b2`; facts now does too.
2. **Ranged keys never ended** (`factsDeclaredSf`). "Latest start wins"
   kept a ranged `key:` (b2) in force after its end; now the precedence of
   model/song.js `sfDeclaredAtRaw` (ranged inside its span beats open; else
   the latest open). Spelling only, but wrong spelling.
3. **Drum rule drifted from the app** (`factsIsDrums`): grid.js
   `trackIsDrums` also says audio takes are never kits and MIDI channel 10
   is; the facts rule had only the name and the flag. Now rule for rule;
   query-lib's docs carry `ch` so the CLI sees channel 10 too, and
   tools/harmony.mjs uses the same predicate instead of query-lib's
   name-only one.
4. **Crossed voices a fourth apart reported as parallel fifths**
   (voices.js): the interval class was `(upper − lower) mod 12`, which is 7
   for a fourth once the voices cross. Now the absolute distance.
5. **Rhythm grid mislabelled under non-quarter beats and triplets**: the
   buckets were called "off-beat eighths" / "sixteenth positions" although
   they are half- and quarter-BEATS (Für Elise is 3/8: its sixteenths sat
   in "off-beat eighths"); Moonlight's 536 triplet attacks were all "off
   the sixteenth grid" and 67 % "syncopation". Buckets are now
   `halfBeat`/`quarterBeat`/`thirdBeat`/`offGrid` with a one-tick tolerance
   (96-ppq triplets are not whole ticks), the text says "grid (by the beat
   unit)" and "off the beat" rather than "syncopation".
6. **Harmony's dependency on key.js** pulled state.js (whose field
   initialisers read localStorage) into "pure" modules, hence the
   `globalThis.localStorage` stubs in the CLI and the test. The three
   helpers it needed (`tonicPcOfName`, `modeOfName`, `MODE_OFFSET`) are
   pure and now live in chords.js (no imports at all); key.js and the four
   other callers import them from there; the stubs are gone and the
   harmony purity test allows only `../chords.js`.
7. tools/harmony.mjs chose section edges by `.end` (every point section
   has one — see 1); now `b2`.

Checklist B (field names): `pedals[].mode` → `how`,
`factsHitsByTransposition().key` → `shift`, `harmonicRhythm.note` → `why`;
a recursive JSON-key sweep (key/chord/roman/numeral/meter/mode/tonic/
scale/quality) now runs on Overworld and Bach results, and a static test
proves src/theory/facts never reads `.text`/`.cnote`/`.note` and imports
nothing but chords.js.

Tests added (checklist C): drum rule; point-chord band; ranged key; crossed
fourths; zero-length notes (attacks, never sounding); empty song and empty
track through every entry point and formatter; the 3/8 grid on Für Elise
and triplet thirds on Moonlight (real files); Korobeiniki (E B C D C B A A
C E D C B) lifted from a fixture, found a fourth up with one note displaced
an octave and the repeated A sung once ONLY with `collapseRepeats` +
`octaveEquiv`, and not in NES Tetris `music-2` (nor, by CLI, in any of the
seven NES Tetris rips — Nintendo's NES port has no Korobeiniki).

## Hand-checks against tools/at.mjs and span.mjs

- Overworld 12.1 crossing D4/E4: pulse2 D4 sustains from 11.4.5 under
  the triangle's E4 onset — true. 9.1 lowest C4 (triangle onset; the G3
  later in the beat does not sound at the beat start — by the documented
  rule). 3.2 "A3~": pulse2 A3 sustains from 3.1 — true. 15.1 Bb3: the
  triangle's A#3 spelled by his `key: G` through keySpelling (see limits).
- Bach bar 23: C4 reported as a passing tone under his Abdim7 — the
  arpeggio is B3 C4 D4 and Abdim7 has no C — true. Bar 28 and 34 pedals
  G2/C2 under F#dim7/G and G7/C — true.
- Bach numerals: ii4/2 (Dm7/C), V6/5 (G7/B), vii°4/3/ii (C#dim7/G),
  V7 (over C) for G7/C, Abdim7 read as the key's own vii°7 "as Bdim7" —
  all as a textbook would. Cadences: the one PAC at 19.1, IAC at 35.1 over
  the tonic pedal (top voice C5 = 1̂).
- Für Elise: HC at 4.1/8.1/12.1/16.1 on his E/G# bands, IAC at 9.1 and
  17.1 and 31.1 at section edges; non-chord tones: the D♯ lower neighbours
  (printed Eb, see limits), the appoggiaturas at 8.3/16.3/30.3.
- Moonlight: ♭II6 Neapolitan at 3.3, V6/5/iv at 20.1, the PAC at 60.1.
- Airship: F mixolydian → Bb mixolydian "to the subdominant", pivots Eb
  (♭VII = IV) and Bb (IV = I), signal Ab — matches the test.

## Checklist status

- A (layers/purity): check.mjs clean except the known `oldBpb`; no S/DOM/
  localStorage in either folder; facts import only chords.js, harmony now
  only chords.js; rule 6 prefixes `facts*`/`hm*`; manifests + fileCount
  reconciled; comments explain constraints.
- B (Learning): facts text + JSON nets pass on Overworld and Bach; the
  harmonic-rhythm reads spans only; harmony with no key → "no declared key
  governs this band"; nothing re-implements a key estimate.
  **Decision on the nets' blind spot "G7"/"E6"**: kept. A bare
  letter+digit IS the pitch name of MIDI 103/88 and the toolkit must print
  pitches; a chord symbol could only enter a facts output through
  annotation text, which the static test now proves no facts module reads.
  The one text that is user-authored and does appear is a TRACK NAME
  (`track:` fields, the "no track named" error) — a track called "Am" would
  print "Am"; that is his own file's label, not a finding.
- C (correctness/tests): above. Behavioural assertions throughout; the
  real-song tests assert counts and places (bar 7 = bar 3 +2, 4 pedals,
  35 bands, 9 chromatic, pivots by label).
- D (no integration): `grep theory/facts|theory/harmony src/` → only
  devtools.js; no index.html markup, no help entry, no drift keyword, no
  Ask tool (tests/theory-harmony.test.mjs "not wired" checks both modes);
  `node tools/package.mjs --out <tmp>` builds.
- E (docs): integration tables re-pointed at CURRENT names (`askRunTool(name, a)`,
  `askReadBars(a)`, `finalizeNotesImpl` in session/song.js via hooks.js,
  the per-sheet openers in ui/sheets.js, `analysisAvailable()` as the
  Normal gate); line numbers dropped. docs/theory-toolkit.md is the index,
  linking docs/theory-harmony.md and this log. NIGHT-ROLL module map +
  query tools, WEB-SESSION CLI lines, open-items (harmony entry + review
  pointer), glossary (tessitura; parallel fifths/octaves — `encountered`).

## Residual risks (known, documented, not fixed)

- Spelling under a declared key is the app's `keySpelling`, which prefers
  the flat for chromatic ♭3/♭6/♭7 (A minor's D♯ lower neighbour prints Eb5;
  G major's A# prints Bb). An app-wide convention, not the toolkit's; noted
  in both docs.
- A parallel unison between two lines is also an "overlap" by the
  overlap rule (both statements are true of the pair); Overworld bar 12
  shows it. Documented, not suppressed.
- Form phrase length is picked among 8/4/2 bars; a 3-bar phrase needs
  `phraseBars`. Voice separation is by stack rank. One meter per song
  (the app's own limit), a pickup reads as bar 1. All in the doc's limits.
- `factsLowestIn` ranks a note sounding AT the beat start over one entering
  later in the beat (documented; Overworld 9.1 shows the consequence).
- Harmony cadence verdicts follow his labels literally (Moonlight 22.3
  F#m/C# → C# reads as a plagal cadence although the C# major chord is V
  of the F# minor theme that follows) — by design "a reading of HIS
  declarations", on demand, Normal-only.
- Both CLIs load a song through the vm harness (~1 s each); `--library`
  over a big album is slow but read-only.
