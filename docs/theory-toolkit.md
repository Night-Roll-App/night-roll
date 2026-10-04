# Theory FACTS toolkit — src/theory/facts/ (2026-10-04)

Index: this file is the FACTS half (Learning-safe, the CLI is live).
docs/theory-harmony.md is the VERDICT half (roman numerals, cadences,
non-chord tones, modulations — Normal-only by design, not wired). The
review of both: docs/reviews/2026-10-04-theory-toolkit-review.md.

Why (Josh, 2026-10-04): "We rely a lot on Claude to help with doing
analysis, but maybe we can build it and Claude can delegate to that."
Deterministic functions give Claude (and, once wired, the app) reliable
facts about a song instead of Claude eyeballing raw note dumps.

**Facts only — Learning mode is the law (CLAUDE.md).** Nothing in this
toolkit names a key, a chord, a roman numeral or a meter, and nothing
volunteers a verdict ("this is a cadence"). It reports WHERE a figure
recurs, WHICH bars repeat and by what interval, ranges, densities, bass
motion, parallel intervals. Pitches are spelled with the app's key-neutral
sharps unless the user's OWN `key:` annotation is in force (then by its
signature — spelling only, never an estimate: `factsDeclaredSf`). The beat
grid is the doc's effective ruler (model/grid.js `effTs`: his declared
meter or the neutral default) — the toolkit never declares one. Form
labels skip the letters i, v and x so "I V" can never read as numerals.
tests/theory.test.mjs sweeps every formatter's text AND JSON on real songs
for key names, chord names, numerals, meters and verdict words.

**Status: built and tested, NOT wired into the app** (Josh: "We don't
have to integrate them just yet… Just tell me where it would be
integrated"). The CLI `tools/theory.mjs` is live for terminal and web
sessions. §3 below says exactly where each piece would plug in.

## 1. Layout and the input shape

Layer 0 (tools/split/check.mjs LAYERS "theory"), pure: no DOM, no `S`
reads or writes; every function takes a `doc` and returns plain JSON-able
data. The only import is `keySpelling` from `src/theory/chords.js`, so the
modules load in plain Node (the tests import them directly) and in the
browser alike. Registered in index.html modulepreload, sw.js APP_MODULES
and src/devtools.js like every src/ module (check.mjs rule 8).

```
doc = { ppq, barTicks, beatTicks,                      // ticks; the effective ruler (ONE meter per song)
        tracks: [{ name, kind?, drums?, notes: [{t, d, p, v, ch?}] }], // gone notes already dropped
        rollnotes?: [{ chord, section, keydir, start, end, b2, text }] }
```

`b2` matters: the lane layout gives EVERY annotation a drawn `.end`, so a
chord band is `chord && b2` (`factsChordSpans`) and a ranged key is
`keydir && b2` (`factsDeclaredSf` — same precedence as model/song.js
`sfDeclaredAtRaw`: a ranged key inside its span, else the latest open one).
The text of an annotation is never read (tests/theory.test.mjs pins this
statically: no `.text`/`.cnote`/`.note` in src/theory/facts).

`tools/query-lib.mjs loadSong()` returns exactly this (the app's own
parser via tests/harness.mjs). In-app, the adapter is three lines (see
§3.0) — `S.song.ppq`, `barTicks()`/`beatTicks()`, the tracks' live notes
and `S.rollnotes`.

| module | exports (public) |
|---|---|
| `common.js` | `factsPitch(p, sf)`, `factsPcName`, `factsBQ(doc, tick)` → "bar.beat", `factsParseBQ`, `factsTick`, `factsQuarters`, `factsIsDrums`, `factsTracks(doc, {track, drums})`, `factsSpan`, `factsStacks`, `factsTopLine`, `factsBottomLine`, `factsVoices` (rank voices), `factsLines` (every searchable monophonic line), `factsSoundingAt`, `factsDeclaredSf`, `factsChordSpans` (spans only, never text), `factsEndTick`, `factsBarCount`, `factsOnsetBarCount`, `factsMotionKind` |
| `pattern.js` | `findPattern(doc, {intervals, rhythm, track, voice, drums, collapseRepeats, octaveEquiv, rhythmScale, tolerance, anchorPitch, sf})` → `{pattern, linesSearched, hits:[{track, voice, at, endAt, startPitch, transposition, pitches}]}`; `factsPatternFromSpan(doc, {track, voice, from, to, collapseRepeats})` lifts a pattern from the song itself; `factsPatternOf`, `factsCollapseRepeats`, `factsHitsByTransposition` (→ `[{shift, count, at}]`) |
| `form.js` | `formFacts(doc, {track, from, to, half, phraseBars, minStatements, onsetsOnly})` → `{barString, bars:[{bar, label, rel:{kind, interval, of}}], halfBars, repeats:[{at, of, kind, interval}], phrases:{phraseBars, auto, list, formString}, sequences:[{unitBars, from, to, statements, intervals}]}`; building blocks `factsUnits`, `factsUnitRelation` (exact / transposed / rhythm / none), `factsLabelUnits`, `factsRepeats`, `factsSequences`, `factsPhraseBars`, `factsPhraseUnits`, `factsLetter` |
| `melody.js` | `melodyFacts(doc, {track, from, to, leap, sf})` → per track `{notes, range:{low, high, semitones}, tessitura (duration-weighted middle half + median), intervals:{histogram, repeated, steps, leaps, up, down, largest}, contour:{runs, turningPoints, longestUp, longestDown, string}, perBar}`; `factsMelodyOfLine`, `factsContourRuns`, `factsWeightedPitchPercentile`, `factsSpanTicks` |
| `rhythm.js` | `rhythmFacts(doc, {track, from, to, sf})` → per track `{attacks, density:{perBar, mean, max, min}, grid:{onBeat, downbeat, halfBeat, quarterBeat, thirdBeat, offGrid}` (positions named by the BEAT UNIT — under a 3/8 ruler the beat is an eighth — with a one-tick tolerance so triplets at 96 ppq still land on `thirdBeat`), `syncopation:{offBeatAttacks, offBeatFraction, heldAcrossBeat, heldAcrossBeatAt}, durations:{longest, shortest, histogram}}` + `harmonicRhythm` (how often HIS chord bands change: `{bands, changes, changesPerBar, meanBeatsPerBand, bandLengthHistogram, changesPerBarHistogram, changesAt}`, or `{bands: 0, why}` without bands); `factsRhythmOfTrack`, `factsHarmonicRhythm` |
| `bass.js` | `bassFacts(doc, {track, from, to, pedalBeats, sf})` → `{perBeat:[{at, pitch, midi, track, onset}], motion:{counts, list:[{at, from, to, semitones, kind}]}, pedals:[{pitchClass, from, to, beats, samePitch, how: held|repeated}], perChordBand}`; `factsLowestIn`, `factsPedals` |
| `voices.js` | `voiceFacts(doc, {track, voice, from, to, leap, sf})` → `{lines, pairs:[{voices, parallelFifths, parallelOctaves, crossings, overlaps}], leaps:{threshold, count, list}, totals}` — interval facts by interval class, named as intervals; `factsPairFacts`, `factsPairSamples`, `factsLineLeaps`, `factsLineName` |
| `format.js` | `formatFacts(kind, result)` + `formatPattern/Form/Melody/Rhythm/Bass/Voices`, `FACTS_FORMATTERS` — the short text the CLI prints and an AI tool would return |

Conventions shared by all: `track` = name, 0-based index, or an array of
those (default: every non-drum track; `rhythmFacts` includes drums);
`from`/`to` = "bar.beat" strings or ticks; a polyphonic track is searched
as rank voices (`track/v1` = the top note of every stack, `v2` the second
from the top where there is one). Drum tracks follow model/grid.js
`trackIsDrums` rule for rule (`factsIsDrums`): an audio take (`kind:
"audio"`) never; a `drums` flag wins; else the name
(`drum|percussion|kit|noise`) or MIDI channel 10 (`ch === 9` — query-lib's
docs carry `ch` for this). No result field is called key / chord / roman /
numeral / meter / mode (tests sweep the JSON keys too).

## 2. The CLI — tools/theory.mjs (live now)

    node tools/theory.mjs <song> pattern --intervals "2,2,-1" [--rhythm "1,1,2"] [--collapse] [--octave] [--scale]
    node tools/theory.mjs <song> pattern --from 1.1 --to 3.1 [--track T] [--voice N] [--with-rhythm] [--library albums/starters]
    node tools/theory.mjs <song> form   [--track T] [--half] [--phrase N] [--min-statements N] [--onsets-only]
    node tools/theory.mjs <song> melody [--track T] [--from --to] [--leap N]
    node tools/theory.mjs <song> rhythm [--track T] [--from --to]
    node tools/theory.mjs <song> bass   [--track T] [--from --to] [--pedal-beats N]
    node tools/theory.mjs <song> voices [--track T] [--from --to] [--leap N]
    … all take --json. <song> = bare name under albums/ or a path.

`--library <dir>` runs the pattern over every .mid under a directory
(reads only — compositions are never written).

## 3. Where each piece WOULD be integrated (nothing below is done)

### 3.0 The adapter every in-app caller shares (not written yet)

One function, say `factsDocFromState()` in `src/model/song.js` (layer 2 —
it reads `S`, so it cannot live in theory/):

```js
export function factsDocFromState() {
  return {ppq: S.song.ppq, barTicks: barTicks(), beatTicks: beatTicks(),
    tracks: S.song.tracks.filter(t => t.kind !== "audio").map((t, ti) => ({name: t.name, drums: trackIsDrums(ti), notes: t.notes.filter(n => !n.gone)})),
    rollnotes: S.rollnotes};
}
```

`barTicks` from `src/model/rollnotes.js`, `beatTicks`/`trackIsDrums` from
`src/model/grid.js`. Live state, unsaved edits included — the same reason
`read_bars` reads `S.song` rather than the repo file.

### 3.1 ✦ Ask tools — the primary target ("Ask the AI: where does this melody come back?")

- `src/ask/tools.js` `ASK_TOOLS`: six read-only entries beside
  `read_bars` — `find_pattern` {intervals | from_bar+from_beat+to_bar+to_beat, track, collapse, octave, with_rhythm}, `form_facts` {track, half, phrase_bars}, `melody_facts` {track, from_bar, to_bar, leap}, `rhythm_facts` {track, from_bar, to_bar}, `bass_facts` {track, from_bar, to_bar, pedal_beats}, `voice_facts` {track, from_bar, to_bar, leap}. Each description says "reports facts only — where and how much; never a key, chord, numeral or meter".
- `src/ask/tools.js` `askRunTool(name, a)`: dispatch the way
  `read_bars` → `askReadBars(a)` does: `if (name === "find_pattern") return formatPattern({...findPattern(factsDocFromState(), opts), source})` etc. — six one-liners returning `formatFacts(kind, result)` text, with bar/beat arguments converted by `factsTick`.
- `src/ask/context.js` `askSys()` / `ASK_SYS_BASE2`: one
  sentence telling the model these tools exist and to call them instead
  of counting intervals in the context block; `RULE_LEARNING` already
  forbids the model from naming keys/chords — the tools' output is
  already clean, so no new rule is needed.
- tests: `tests/ai.test.mjs` — run each tool through `askRunTool` on a
  loaded song and reuse `tests/theory.test.mjs`'s `assertFactsOnly` nets
  on the returned text (export the nets from a small shared helper, or
  copy the five regexes).
- Token budget (docs/ask-token-plan.md): formatted facts are 10–60 lines;
  `findPattern` caps hits at 60 in text, the JSON is never sent.

### 3.2 The CLI is already the web/terminal integration

`WEB-SESSION.md` and `NIGHT-ROLL.md` "Query tools" list it. Claude
sessions call it instead of reasoning over `.notes.txt`.

### 3.3 In-app views (later, and only on demand — Learning mode's corollary: fact reports are ON-DEMAND)

- **Pattern hits on the roll**: `src/render/roll.js` could highlight
  `findPattern` hits the way the lasso highlights a selection — a
  "Find similar" entry in the note-editor's menu (`src/ui/note-editor.js`,
  the lasso popover) lifting `factsPatternFromSpan` from the lasso span,
  results stored on `S` (e.g. `S.factsHits`, cleared on song change in
  `src/session/song.js setSong`) and drawn as outlines; Esc clears.
- **Form strip**: `formFacts().bars` labels as a read-only lane under
  the section lane in `src/render/roll.js`'s annotation lanes (`lane:`
  layout in `src/session/song.js finalizeNotesImpl`, reached through
  `src/hooks.js finalizeNotes`), toggled from
  View ▾ (`src/ui/chrome.js renderViewMenu`), never written as
  annotations unless he taps Adopt — the same Adopt pattern
  `src/gen/analysis.js adoptChordBand` uses for the Normal-mode Analyze layer, but these are facts, so allowed in Learning too.
- **Melody/rhythm/bass/voices sheets**: a "Facts…" sheet from the ✦ Ask
  panel or View ▾ rendering `formatFacts` text in a `<pre>` — a new
  opener beside `src/ui/sheets.js openAnalyzeSheet`/`openGridSheet` (each
  sheet has its own) — for the lasso span or the whole song.
- Help sheet entry (index.html `#helpsheet`, right tab section) + drift
  keyword in `tests/night-roll.test.mjs` FEATURES + `node tools/build_help.mjs`
  — the standard shipping checklist, once any of the above ships.

### 3.4 Not integration points

- `src/gen/analysis.js` (Normal-mode chord/key estimate): the toolkit
  must NOT feed it and it must NOT feed the toolkit — nothing from Normal
  mode may leak into Learning's UI/AI context (CLAUDE.md).
- Annotations: the toolkit never writes `.rollnotes`; adoption is a tap.

## 4. Known limits (facts about the facts)

- Voice separation is by stack rank, predictable rather than clever: a
  sparse inner voice stays sparse; a track whose chords change size will
  put the same melodic line in different ranks across a bar boundary.
- `factsUnitRelation` compares exact ticks and durations (`onsetsOnly`
  relaxes durations); human-played captures need quantizing first.
- Phrase length is chosen among 8/4/2 bars by repeat proportion, falling
  back to 4 — a figure of 3-bar phrases needs `phraseBars` passed.
- Harmonic rhythm exists only where he has drawn chord bands; it counts
  their spans and never reads their text.
- One meter per song: `barTicks`/`beatTicks` are constants of the doc
  (the app's own limit — sync/publish.js "one meter per song today"), so a
  meter change mid-song is read on the first meter's ruler. Tempo changes
  are irrelevant: everything is in ticks. A pickup is bar 1 (tick 0 is the
  first downbeat; no anacrusis offset).
- Spelling under his declared key is the app's `keySpelling` (chords.js):
  it prefers the flat for a key's chromatic ♭3/♭6/♭7 (G major spells pc 10
  as Bb, C/Am spell pc 3 as Eb), so a lower neighbour D♯ in A minor prints
  as Eb5. Neutral sharps apply when no key: annotation is in force.
- Voice-leading samples at onsets of either line; a parallel unison between
  two lines that also moves "past" each other is reported under both
  headings (parallel unison AND overlap) — both are true of the pair.
