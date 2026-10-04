# Theory harmony — the VERDICT toolkit (2026-10-04)

Josh (2026-10-04): "We rely a lot on Claude to help with doing analysis, but
maybe we can build it and Claude can delegate to that." This is the
harmony half: roman numerals, cadences, non-chord tones, modulations and a
chromatic-chord summary. The fact tools (pattern/form/melody/rhythm facts)
are `src/theory/facts/*.js` + `tools/theory.mjs` — docs/theory-toolkit.md
is the index for both halves; the review of both is
docs/reviews/2026-10-04-theory-toolkit-review.md.

**Status: built, tested, NOT wired into the app** (Josh, same day: "make
sure they're tested. We don't have to integrate them just yet, but we can.
Just tell me where it would be integrated"). The modules ship in the
bundle (every src/ file must be reachable from main.js for `package.mjs`,
and rule 8 wants them in the manifests) — `src/devtools.js` mirrors them
like every other module, and that is their ONLY importer. No Ask tool, no
help-sheet entry, no UI. `tests/theory-harmony.test.mjs` ("not wired")
proves no tool offers them in either mode.

## The one rule these obey

CLAUDE.md: "Keys/analyses are Josh's discoveries — Learning mode is the
law." Every function here reads FROM what the user has already declared —
a `key:` annotation and his own chord bands — and turns those into a
reading. Nothing estimates a key or names a chord from raw notes. A band
with no declared key governing it comes back as `numeral: null, reason:
"no declared key governs this band"`; a free-text band is `"not a chord
symbol"`. The only place notes are read is for FACTS the verdict needs:
the top sounding pitch at a cadence chord (PAC vs IAC turns on the
soprano's degree) and each note's pitch vs the band it sounds under
(non-chord tones). The app's own Normal-mode estimators
(`model/song.js` `estimateKey`, `gen/analysis.js` `computeAnalysisLayer`)
are separate and untouched.

Even so, these are VERDICTS, not facts, and so they are Normal-mode
material in the app (see "The gate" below) and on-demand only in a
Claude session with Josh.

## Modules — `src/theory/harmony/` (layer 0, pure: no S, no DOM)

All names are `hm`-prefixed (check.mjs rule 6, unique top-level names).
The only import outside the folder is `theory/chords.js` — never
`theory/key.js`, whose `state.js` import reads localStorage at load, so
the key-name helpers (`tonicPcOfName`, `modeOfName`, `MODE_OFFSET`) moved
to chords.js (review, 2026-10-04); the modules, the CLI and the tests load
in plain Node with no stub. tests/theory-harmony.test.mjs pins the import
list.
Inputs are plain data; the adapters at the top of `roman.js` build them
from a resolved rollnotes list — `S.rollnotes` in the app, `doc.rollnotes`
from `tools/query-lib.mjs` — so the same code runs in both.

### `roman.js`
- `hmKeyRegionsFromNotes(notes)` → `[{start, end|null, sf, name}]` — the
  same shape as `S.keyRegions` (reads `b2`, not `.end`, to tell an open
  key from a ranged one; the lane layout gives point annotations a drawn
  `.end`).
- `hmBandsFromNotes(notes)` → `[{start, end, text, note}]` — chord bands.
- `hmKeyAt(keys, tick)` — same precedence as `sfDeclaredAtRaw`.
- `hmKeyContext(region)` → `{tonicPc, tonicLetter, mode, scale, diatonic,
  ref, sf}`. Minor's diatonic set includes the raised leading tone (V and
  vii° read as diatonic); a mode (`F mixolydian`) uses its own scale for
  "diatonic" but spells degrees against the parallel major (♭VII).
- `hmChordFromLabel("Dm7/C")` → root, slash bass, tones, quality text.
  Vocabulary = `CHORD_TEMPLATES` + `chordQualParse` (the chord widget's).
- `hmRomanNumeral(chord, key)` → `{numeral, base, figures, bassOutside,
  secondary, chromatic, diatonic, degree, acc, enharmonic?}`.
  - degree from the USER'S OWN root letter vs the tonic letter (so `Db`
    reads ♭II and `C#` ♯I); case from quality; figures 6, 6/4, 6/5, 4/3,
    4/2 from the slash bass; a bass outside the chord is "(over C)".
  - secondary function: a major/dominant chord a fifth above a diatonic
    major/minor degree (not I) is `V/x`; a diminished chord a half step
    below one is `vii°/x`; a dim7 tries the user's spelling first, then
    its enharmonic roots (the key's own vii°7 wins — `enharmonic: "as
    Bdim7"` says how it was re-spelled).
  - `chromatic.kind`: `secondary dominant` | `secondary leading-tone` |
    `neapolitan` | `augmented sixth` (It/Fr/Ger by pitch-class set) |
    `mode mixture` | `chromatic mediant` | `chromatic`.
- `hmRomanNumerals(bands, keys, grid)` → one row per band with bar.beat.
- `hmChromaticSummary(rows)` → `{total, of, kinds, items}`.
- `hmScaleDegree(key, pitch)` → `"1̂"`, `"♭7̂"`, `"♯4̂"`.
- `hmBQ(grid, tick)`, `hmPitchName(p, sf)` — spelled in the declared key
  via `keySpelling` (which prefers the flat for a key's chromatic ♭3/♭6/♭7:
  A minor's lower neighbour D♯ prints as Eb — the app's convention, not a
  reading).

### `cadence.js`
- `hmCadences(rows, keys, tracks, grid, endTick, sections, {phraseBars,
  all})` → `[{type: PAC|IAC|HC|PC|DC, at, from, to, key, soprano, detail,
  where}]`.
  - PAC: V→I, both root position, soprano on 1̂; IAC otherwise (or
    vii°→I); HC: a phrase ends on V (iv6→V in minor is named Phrygian);
    PC: IV→I; DC: V→vi/VI/♭VI. V→V (G7sus4→G7) is one dominant, not a
    cadence; a key change between the two chords is modulation's business.
  - phrase ends: section edges (best), the song end, every `phraseBars`
    bars (default 4 — stated in `where`). A goal chord held longer than
    twice the song's median band (at least a bar) is an "arrival".
    Mid-phrase V→I is listed only with `all`.
- `hmTopPitchAt(tracks, t0, t1)` — the top voice: highest pitch sounding
  at the chord's start or starting in its first beat (an arpeggio reads
  its top, not its bass).
- `hmPhraseEnds`, `hmArrivalTicks`.

### `nct.js`
- `hmNonChordTones(tracks, bands, keys, grid, {track})` → `{items,
  summary: {chordTones, nonChordTones, byType}, uncovered}`. Per note,
  against the band at its onset, from the same track's previous/next
  onset: passing (chromatic noted), neighbor, suspension (prepared by
  itself or re-struck, resolves down by step; a chord tone HELD into the
  next band is the 4-3 case), retardation, held over, anticipation,
  appoggiatura, escape, pedal, incomplete neighbor, unresolved, free
  tone. Notes under no band or a free-text band are COUNTED
  (`uncovered`), never classified. A slash bass outside the chord
  (`G7/C`'s C) reads as a pedal.

### `modulation.js`
- `hmModulations(keys, bands, grid, {pivotBars})` → per declared key
  change: `{at, from, to, relation: {name, interval, commonTones,
  closelyRelated}, newTones, pivots: [{at, label, inFrom, inTo, before}],
  signal, reading}`. Pivots = bands within ±2 bars diatonic to both keys,
  read as a numeral in each; `signal` = the first band in the window
  outside the old key. A re-declared same key is not a modulation; a song
  with one `key:` has none, whatever the notes do.
- `hmKeyRelation(from, to)` — dominant / subdominant / relative /
  parallel / mediant / tritone, common scale tones.

## CLI — `tools/harmony.mjs`

    node tools/harmony.mjs <song> roman|cadences|nct|modulation|chromatic [--json] [--all] [--phrase N] [--track T]

Same loader as the fact tools (`query-lib.mjs`, the app's own parser);
drums are excluded by the app's rule (`factsIsDrums`: audio never, the
`drums` flag, the name, MIDI channel 10); section edges are the ranged
section annotations (`b2` — a point section carries a drawn `.end` too).
`<song>` = a bare name under albums/ or a path. Needs a `key:` annotation
in the song — without one every row says so. Demonstrated on
`bach-prelude-in-c`, `fur-elise` (starters) and FF1's `airship`
(`albums/nes/final-fantasy-i/songs/airship`, two declared keys).

## Where each piece WOULD be integrated (not done)

| Function | File + function | How |
|---|---|---|
| `hmRomanNumerals` → tool `roman_numerals` | `src/ask/tools.js`: new entry in `ASK_TOOLS` (schema) + a branch in `askRunTool(name, a)` | body: `hmRomanNumerals(hmBandsFromNotes(S.rollnotes), S.keyRegions, {barTicks: barTicks(), beatTicks: beatTicks()})`, returned as the compact text rows the CLI prints (bar.beat, label, numeral, kind) |
| `hmCadences` → tool `find_cadences` | same two places | tracks = `harmonyTrackIndices()` (`gen/analysis.js`) mapped to `S.song.tracks`; sections = `S.rollnotes.filter(n => n.section && n.b2)`; endTick = `S.songEndTick`; `a.phrase_bars`, `a.all` as optional args |
| `hmNonChordTones` → tool `nonchord_tones` | same | `a.track` optional; reply = summary line + items (cap like `ASK_READ_BARS_MAX`; say where to continue) |
| `hmModulations` → tool `modulations` | same | `S.keyRegions` + bands |
| `hmChromaticSummary` → tool `chromatic_chords` | same | over `hmRomanNumerals` rows |
| ✦ Ask sheet / Analyze ▸ (optional, later) | `src/gen/analysis.js` next to `computeAnalysisLayer` | a Normal-only "Numerals" row under the chord lane, drawn like `analysisBands` — a VIEW, never written to rollnotes |
| Help sheet | `index.html` `#helpsheet`, ✦ Ask section: "Ask the AI: 'what are the cadences?' — Normal mode" | + `node tools/build_help.mjs`, + a drift keyword in `tests/night-roll.test.mjs` FEATURES |

Every tool is song-only: add the five names to `ASK_SONG_ONLY_TOOLS`
(`src/ask/bridge.js`) so the general chat never offers them.

## The gate (design — implement WITH the wiring, never after)

1. **Offered only in Normal mode.** `askToolsNow()` (`src/ask/bridge.js`)
   is the one place the tool list is built for a request (`client.js`
   `askSend` passes it as `tools:`). Add a `ASK_NORMAL_ONLY_TOOLS` list
   holding the five names and filter them out whenever
   `!analysisAvailable()` (`src/platform/mode.js` — the same gate the
   Analyze layer uses; it is `appMode() === "normal"`). The AI cannot call
   a tool it is not offered, so in Learning mode the gate is structural,
   not a prompt instruction.
2. **Dispatcher refuses too.** `askRunTool` branches for the five start
   with `if (!analysisAvailable()) throw new Error("… Normal mode
   only")` — belt and braces against a stale tool list (a request built
   in Normal and answered after a switch).
3. **Nothing leaks into a Learning-mode context.** Their replies travel as
   tool results inside a Normal-mode turn; `askBuildMessages` already
   drops every message tagged with a different mode (`askMsgMode`), and
   `askSessionName` gives Normal its own bridge session (`#normal`), so a
   later Learning turn never inherits them — the same mechanism that
   already keeps the Normal chord/key estimates out. Never write their
   output into `rollnotes`, the status log, or the `.notes.txt` dump.
4. **Learning mode, on request.** Josh can flip to Normal himself (View
   ▾ → 🎓, Settings → Other); there is no "explicit question unlocks it"
   path in Learning — simpler to prove, and matches "Learning volunteers
   nothing". (In a Claude session with Josh, the CLI is the on-demand
   path: run it only when he asks for that reading, and say it is a
   reading of his declarations.)
5. **Tests to ship with the wiring** (extend the "not wired" test):
   - Learning: `askToolsNow()` lacks the five; `askRunTool("roman_numerals")`
     throws; a wire request (tests/ai.test.mjs style, `startServer`)
     carries neither the tool schemas nor any numeral/cadence text.
   - Normal: offered; a mocked tool call returns numerals read from
     `S.keyRegions` + bands; switching to Learning and sending again shows
     none of it in the request (history filtered by mode).
   - A song with no declared key: the tool answers "no declared key" —
     never an estimate, even in Normal.
