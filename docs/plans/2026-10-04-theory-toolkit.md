# Plan: theory toolkit (facts + harmony) — tested, NOT integrated yet

Status: two Fable builders already implementing (briefed before the review
rule) → **this amended plan IS the review checklist for their output** (Fable
review 2026-10-04) → fixes → merge facts first, harmony rebases, then merge.

State at review time (verified in their worktrees, uncommitted):
- facts (agent-a1bceef2f3d78280d): src/theory/facts/{common,pattern,form,melody,rhythm,bass}.js — no voice-leading yet, no tools/theory.mjs, no tests, no docs/theory-toolkit.md yet.
- harmony (agent-adf893af37ddee64d): src/theory/harmony/roman.js (imports theory/chords.js + theory/key.js) — nothing else yet.
- NEITHER has touched index.html's modulepreload, sw.js `APP_MODULES`/`SW_VERSION`, src/devtools.js, or tests/modules.test.mjs's `fileCount` (73 at L349, 75 at L551). Rule 8 fails until they do, and both will edit the same four places → merge facts first; harmony rebases onto it.

## Josh
"We rely a lot on Claude to help with doing analysis … build it and Claude can delegate to that." / "make sure they're tested. We don't have to integrate them just yet … tell me where it would be integrated."

## Facts (src/theory/facts/*.js, tools/theory.mjs, tests/theory.test.mjs)
pattern finder (any transposition, the Korobeiniki search), repetition/form (A/A′/B by similarity, sequences), melody facts (range, tessitura, steps/leaps, contour), rhythm facts (density, syncopation vs effective meter, harmonic rhythm from EXISTING chord bands only), bass facts (lowest note per beat, motion, pedals), voice-leading facts (parallel P5/P8, crossing, overlap, leaps — as interval facts). Output JSON + text with key-neutral spelling.

## Harmony / verdicts (src/theory/harmony/*.js, tools/harmony.mjs, tests/theory-harmony.test.mjs)
roman numerals (from declared key + the user's chord bands), cadences, non-chord tones, modulation pivots (from declared keys), chromatic chords. Never estimates a key or names a chord from raw notes.

## Integration (documented, not wired): docs/theory-toolkit.md + docs/theory-harmony.md
Each function → the exact plug-in point, by real name: `ASK_TOOLS` + `askRunTool` (src/ask/tools.js) for AI tools; `askToolsNow`/`ASK_SONG_ONLY_TOOLS` (src/ask/bridge.js) for the per-chat gate; `analysisAvailable()` (src/platform/mode.js) as the Normal-only gate for anything that names a key/chord/numeral; `renderViewMenu`'s Mode row (src/ui/chrome.js, beside `vwAnalyze`) for a panel; tools/query-lib.mjs `loadSong()` for the CLI doc shape. Learning-mode gate design written down for later.

## REVIEW CHECKLIST (the reviewer runs every line against each builder's branch)

### A. Layer rules + purity (docs/split-plan.md §1–§2; tools/split/check.mjs)
- [ ] `node tools/split/check.mjs` clean. src/theory/** is layer 0: imports only from state.js, edition.js, ui/icons.js, ui/controls.js, ui/piano.js, midi/, theory/, hooks.js. No model/grid.js (layer 2) — barTicks/beatTicks arrive in the `doc` (common.js already says so).
- [ ] Pure: `grep -n "import { S }\|S\.\|document\.\|localStorage\|window\." src/theory/facts src/theory/harmony` is empty. theory/key.js may be imported for its pure helpers only (tonicPcOfName, modeOfName, keyNameToSf, trueSf) — never fileKeyAt/checkMeterVsFile (they read S).
- [ ] Rule 6 (unique top-level names across src/): prefixes `facts*` / `hm*` throughout; no bare names like `letter`, `pitchName`.
- [ ] Rule 2.2: zero top-level side effects; top-level consts are literal tables only (rule 4). devtools.js imports every module at boot, so these evaluate on every app launch — cheap and silent.
- [ ] Rule 8 manifests: index.html modulepreload entries, sw.js `APP_MODULES` + `SW_VERSION` bump, src/devtools.js import list, tests/modules.test.mjs fileCount 73→73+N (L349) and 75→75+N (L551) with the names appended to the assertion message.
- [ ] Comment style: constraints, not narration (CLAUDE.md).

### B. Learning mode is the law (CLAUDE.md) — no leakage in outputs
- [ ] A test per facts entry point: run on a fixture with NO annotations and assert the serialized output has no keys named key/chord/roman/numeral/meter/mode and no strings matching `/\b(major|minor|dorian|ionian|aeolian|lydian|mixolydian|phrygian|locrian)\b/i`, no chord symbols (`/\b[A-G][#b♯♭]?(m|maj|min|dim|aug|sus)\d*\b/` outside pitch names with octave numbers).
- [ ] Spelling: sharps (common.js `FACTS_SHARP_NAMES`) unless `sf` comes from the user's own `key:` annotation (`factsDeclaredSf`); a test passes an sf and checks flats appear only then.
- [ ] rhythm.js harmonic rhythm reads chord bands from `doc.rollnotes` only; with none it reports "no chord bands" — never infers.
- [ ] Harmony: with no declared key in range → returns an explicit "no declared key" result (or empty), never an estimate; `hmKeyRegionsFromNotes` reads `key:` notes only; `hmBandsFromNotes` reads `chord:` notes only. A test feeds raw notes with no annotations and asserts no numeral is produced.
- [ ] Nothing imports src/theory/key.js `estimateKey` (it is not exported from there, but check no re-implementation exists).

### C. Correctness + test quality
- [ ] Drums excluded: `factsIsDrums` must match the app's rule in src/model/grid.js `trackIsDrums` (kind "audio" → false; `tr.drums` flag; the name heuristic) — compare line by line; a test with a track named "noise"/"drums"/`drums:true`.
- [ ] Edge cases, each a test: empty song; a track with no notes; `d = 0` notes; overlapping/ringing notes (ties across a beat/bar); triplet durations (ppq/3) in density and syncopation; a pickup (notes before bar 1's downbeat are impossible — `t ≥ 0` — but a short first bar via `doc.barTicks` offset?) — document the "one meter per song" limit (publish.js: "one meter per song today"); tempo changes are irrelevant (ticks) — say so; pitches > 127 absent.
- [ ] Pattern finder: fixture with the Korobeiniki interval string (E B C D C B A A C E) transposed, octave-displaced and with repeated notes collapsed → found; NES `albums/nes/tetris-nintendo/music-2.mid` → not found; parameters: any transposition, repeats collapsed on/off, rhythm ignored/required.
- [ ] Form: A/A′/B labels are equivalence classes; a test with exact repeat, transposed repeat, rhythm-only repeat, and a sequence (unit restated at +2, +4).
- [ ] Voice-leading: parallel P5/P8 between two named tracks across consecutive onsets; crossing/overlap; leaps > a 6th as interval facts (no "forbidden" language).
- [ ] Real songs, as tests with small assertions (facts, not verdicts): `albums/starters/*.mid` (Bach prelude: bass pedal fact in the opening bars; melody range), `albums/nes/final-fantasy-i/…` one song (track count, bar count, density > 0). Run through tools/query-lib.mjs `loadSong()`.
- [ ] CLI: `node tools/theory.mjs <song> <fact> [--from b.q --to b.q] [--track T] [--json]` and `node tools/harmony.mjs <song> <fact> …`, same conventions as tools/at.mjs; a test spawns each on a starter and parses the JSON. Add both to tests via tools/run-tests.mjs FILES (`"theory"`, `"theory-harmony"`).
- [ ] Behaviour tests, not snapshot dumps: each assertion names the musical fact it checks.

### D. No integration slipped in
- [ ] `grep -rn "theory/facts\|theory/harmony" src/ask src/ui src/gen src/render src/session src/import src/sync src/main.js src/wire.js` → only src/devtools.js (rule 8).
- [ ] index.html: no new markup, no help-sheet entry (nothing user-facing shipped).
- [ ] `node tools/package.mjs --check` passes (src/ is copied wholesale; the text scan exempts src/).

### E. Docs (doc sweep, CLAUDE.md)
- [ ] docs/theory-toolkit.md + docs/theory-harmony.md: function table (name → file → what it returns → where it would plug in, by the real names above → Learning/Normal gate).
- [ ] NIGHT-ROLL.md: Module map entries for theory/facts/* and theory/harmony/*; "Query tools" gets tools/theory.mjs and tools/harmony.mjs.
- [ ] WEB-SESSION.md: the two CLI lines added to the tool list (this was missed once — CLAUDE.md).
- [ ] glossary.md (docs/learning/ after the tidy): any new term (tessitura, pedal point, sequence, pivot chord) as ENCOUNTERED unless Josh has demonstrated it.
- [ ] open-items.md: an entry "theory toolkit — built, not wired; integration map in docs/…".

### F. Merge order + verification
1. Facts branch: `npm test` green (theory + modules + package + pwa), `node tools/split/check.mjs`, `node tools/package.mjs --check`. Merge.
2. Harmony branch rebases on main (resolves the four manifest places + run-tests FILES), same gates. Merge.
3. Both `**.js` pushes run CI; smoke not needed (no UI).

## Risks
- Both builders editing the same four manifest places — sequential merge (above).
- Harmony's roman numerals are the one place a chord symbol and a key meet: any path that reaches them without the user's own `key:` + `chord:` lines is a Learning violation — checklist B.
- The GB Tetris investigation wants the pattern finder (ORDER.md) — facts merges first.
