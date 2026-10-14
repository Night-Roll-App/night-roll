# SNES drums as drums + "Hear sound" / "These are drums" (plan, 2026-10-13)

Josh: #415 / #426 (FF5 "The Battle" drums are pitched notes, sharp on the
board, voiced as melodic instruments in MIDI: "sounds horrible") and #427
(auto-detect drums so they move out of the analysis's way; when detection
fails, a "▶ Hear sound" button in the track menu that plays one note in the
GAME's voice, and a way to mark a track as drums).

Status: plan → Fable review → Sonnet builds → Fable reviews code
(model pipeline). Nothing here is built.

## 0. Rulings already made (final, Josh #429)

- **Q28: one drum track per game voice.** "Absolutely."
- **Q29: drum notes are rewritten to GM drum keys.** Yes.

These are named constants in the code (`SPC_KIT_PER_VOICE = true`,
`SPC_KIT_GM_KEYS = true`, beside `DRUM_MIN_HITS` in tools/spc/notes.mjs),
with the ruling cited in the comment. They are not offered as switches.
When step 1 ships, mark open-items Q28 and Q29 answered: "Q28 answered
(#429): one per voice, final. Q29 answered (#429): GM keys, final."

## 1. What is wrong (diagnosis, proven)

- `tools/spc/notes.mjs:293` computes `unpitched` for a one-shot sample whose
  root is "none" or "low". Nothing reads it.
- `makeMidi` (`tools/nsf/midi-write.mjs:345,353,364`) uses channel 10 only
  for `e.drum`. SNES sets `e.drum` only for noise voices
  (`notes.mjs:187-198,287`). Every other hit is written at its PITCH
  relative to the default root C5 (`DEFAULT_ROOT_MIDI = 72`, `notes.mjs:25`).
  That produces The Battle's G4 / C5 / D#3.
- The app's import runs this path: `src/audio/chip.js:578` (CHIPS.spc.run →
  `reconstruct` → `spcRebin`) → `src/import/capture.js:343` (`makeMidi`).
- Step 3 of `docs/plans/2026-10-09-percussion-detection.md` §5 (SNES
  sampled drums) was never built.
- Census (scratchpad `census.jsonl`, 643 songs read): the rule in §2 finds
  kit groups in 308 songs, 34 of them FF5 (FF5 has no `.rollnotes`). It
  finds 564 kit voices. **308 of them play only kit samples, and 256 also
  play melodic samples.** The mixed voices drive the render-pairing design
  in §2.3.
- The Battle, measured: voice5 = sample 38 (143 hits, key 67, "none") +
  sample 39 (84 hits, key 51, "low"); voice7 = sample 36 (357 hits, key 72) +
  sample 37 (25 hits, key 72). Both voices are all-kit, so their track names
  and numbers stay the same. voice6 sample 35 (looped, 11 hits, median 1.33 s)
  and voice0/1 sample 32 (looped, high-confidence root, one key) must stay
  melodic.
- Only 3 SNES songs are annotated: FF4 cry-in-sorrow-part-1,
  cry-in-sorrow-part-2 and the-prelude. None of them has a `-recapture`
  file yet.

## 2. Design

### 2.1 The rule (generic, no game table)

A (voice, sample) group is a **kit group** when all of these hold:
- every note in the group is `unpitched` (one-shot, root confidence none/low);
- the group has at least `DRUM_MIN_HITS` (8) notes;
- the median note length is under `DRUM_MAX_MEDIAN_DUR_SEC` (0.5 s);
- the group plays at most 2 distinct keys (`SPC_KIT_MAX_KEYS = 2`).

The key guard keeps FF5 "What?" sample 32 and "The Fierce Battle" voice0
sample 32 melodic. Write the rule as a pure function,
`isSpcKitGroup({n, unpitched, medianSec, keys})`, so a text fixture can pin
it in CI without a rip. Each decision goes into the capture warnings as a
fact, for example `voice5 sample 38: one-shot, no clear pitch, 143 hits,
1 key → kit (snare)`. It shows in the row's ⓘ on demand only.

The existing noise-voice rule (`classifyNoiseVoices`) is unchanged
(see Q-C).

### 2.2 Where it lives

- `tools/spc/notes.mjs`: `markSpcKits(events)` runs after
  `classifyNoiseVoices` in `reconstruct`. It sets `e.kit = true` on the
  notes of kit groups and returns the warnings. `e.midi` keeps the captured
  key; GM keys are not known yet because they need the tempo.
- `tools/nsf/midi-write.mjs` `makeMidi`, kit pass:
  - Group the `e.kit` notes per voice.
  - Run `guessKit` (`tools/kit-guess.mjs`) once across the whole song. Each
    (voice, sample, key) is one kit voice, so two voices never both become
    "snare".
  - Make keys unique per song. Factor `dpcmKeys`' collision step into a
    shared `uniqueGmKeys` helper.
  - Write the result on channel 9.
  - The CLI (`tools/spc/dump.mjs`) and the app share `makeMidi`, so they
    agree.
- Track naming follows the PS1 precedent (`tools/psx/notes.mjs:411`):
  - **All-kit voice:** the name stays `voiceN`, plus the `kit:1` marker
    (`kitMetaEvent`, `midi-write.mjs:50`). The console render pairs by name,
    and the track number does not move.
  - **Mixed voice:** melodic notes stay on `voiceN`. Kit notes go to a new
    track, `voiceN kit`, with `kit:1`, placed right after `voiceN`.
- **Original keys are kept** in a second text meta,
  `kitmap:<gm>=<captured>,…` (for example `kitmap:38=67,40=51`).
  - `src/midi/parse.js` reads it into `tr.kitFrom`, next to the `kit:1`
    read at `:93`.
  - Both writers round-trip it: `src/midi/write.js:90` and `writeSongMidi`.
    They must stay byte-identical (the existing "writeMidi / writeSongMidi
    agree" test).
  - "Not drums" (§2.4) uses it to show the game's own keys again without
    touching the .mid.

### 2.3 The render pairing for mixed voices

The SPC renderer outputs one buffer per hardware voice (`voiceN`). A
`voiceN kit` track has no buffer of its own; its sound is inside `voiceN`'s
buffer.
- Add one resolver in `src/audio/chip.js`, `chipSourceName(name)`:
  `"voiceN kit"` → `"voiceN"`, used only for register chips.
- Use it for these checks only: the `chipHas` "this track's sound comes from
  the console" check in `scheduleNote` (`src/audio/voices.js:~974`), and
  `chipNoteSlice`. This keeps the kit track from also playing synth drums on
  top of the render.
- Never use it in `chipStart` source creation. Otherwise voiceN would start
  twice.
- Muting `voiceN kit` silences it only under Hear the MIDI. In game sound,
  its hits ride on voiceN (Q-A).

### 2.4 The drums mark (annotation, the only song state)

`track:` directive field `drums`: `drums=1` (These are drums) /
`drums=0` (Not drums) / absent = auto (what the .mid says).
- `src/model/rollnotes.js`: add `drums` to the known-field list (`:76`), the
  JSON `track` case (`:114`), the text parse (`:205-216`) and `trackDirText`
  (`:484`).
- `docs/annotations-v2.schema.json` + `docs/annotations-v2.md`: add the
  optional boolean `drums`.
- `src/session/song.js:140-163` (finalizeNotes):
  - Clear every track's cached `tr.drums` first. `trackIsDrums` caches it,
    and a stale cache would ignore an un-mark.
  - Then set `tr.drumsMark` from the directive.
- `src/ui/trackbar.js` `saveTrackDir`: carry `drumsMark` into `d`. It is one
  undo step, as every directive is.
- `trackIsDrums` (`src/model/grid.js:107`) and `factsIsDrums`
  (`src/theory/facts/common.js:50`): `drumsMark` wins over name/ch-9
  detection.
- `tools/query-lib.mjs:85` `isDrumTrack`: read the song's trackdir mark too,
  so web-session facts agree with the app.
- Every analysis consumer already goes through these gates, so the mark sets
  the track aside there with no per-feature code:
  - the roll's kit lane (`src/render/roll.js`);
  - the lasso/transposition skip (`src/model/selection.js:147,656`);
  - the chord readout and facts (`src/theory/facts/*`, `src/gen/analysis.js`);
  - Ask context (`src/ask/context.js:149,186`).
- Playback: `drumHit` on channel-10 semantics (`src/audio/voices.js:982`)
  when the synth plays the track (Hear the MIDI, or a synth voice). In game
  sound the render plays as before.
- **The .mid is never edited by a mark.**
  - A manually marked track still holds its captured pitches (G4…). Its
    drum sounds come from a play-time map: `guessKit` over the track's
    distinct pitches, derived at load and stored nowhere (Q-B).
  - "Not drums" on a detected kit track shows `tr.kitFrom`'s captured keys
    in memory. It never rewrites the file.

### 2.5 "▶ Hear sound"

The button sits in the voice menu (`src/ui/voice-menu.js` `buildVoiceMenu`
`:150`), next to Hide notes. It calls `hearTrackSound(ti)`, a new function
in `src/audio/voices.js` beside `previewNote` (`:996`).
- **Representative note.** Use the track's most common pitch, taken from a
  real note: the first non-gone, non-`added` note at that pitch, with its
  tick. A kit track's "pitch" is its most common GM key, with that note's
  tick.
- It does NOT apply previewNote's `!trackIsDrums(ti)` and explicit-voice
  gates (`:1002`). Hearing the game's drum is the whole point.
- **Paths by family:**
  - **PS1, N64 (and PS2 only if its worker answers `previewOne`; measure
    first):** `chipPreviewBuffer(name, pitch, offset, tick, ppq)`. The tick
    resolves the template note, so a kit key finds its real instrument.
  - **SNES, NES, Game Boy:** `chipNoteSlice` through `chipSourceName`. This
    is the note's own sound sliced from the song's render.
  - **A track with a `game:`/`sf2:` voice:** the existing `instAudition`.
  - **A synth track:** its synth voice, which is its real sound.
  - **Genesis (VGM, no renderer), a render still loading, or a stream-mode
    chunk not cached:** no game sound. Per Q-E's default, it shows a status
    line, "game sound not loaded yet — press ▶ once, then try again", and
    plays nothing.
- **Honest scope for step 3:** the game voice works for PS1/N64 while the
  worker holds the set, and for SNES/NES/GB once the song's audio has
  rendered. SNES without a render needs step 5.

## 3. Steps

Each step ships alone, with tests through `node tools/run-tests.mjs <names>`
only (check the `ℹ pass N` line). `npm run test:e2e:smoke` is allowed;
never run the full Playwright suite locally. UI steps get a Brave check
before the push: screenshot, and restore every pref touched. Push, then
check CI in the background.

### Step 1: SNES kit detection at capture (no UI)

Build §2.1 to §2.3: `markSpcKits`, the `makeMidi` kit pass, `kitmap`
read/write, `chipSourceName`. Bump `CAPTURE_VERSION` to 3
(`tools/recapture.mjs:57`).

Tests:
- `spc.test.mjs`, synthetic (`tools/spc/make-test-spc.mjs`):
  - one-shot noisy sample, one key ×16, short → `voiceN` with `kit:1`, ch 9,
    a GM key;
  - the same sample ×4 → melodic (hit guard);
  - looped pitched sample, one key ×16 → melodic;
  - one-shot unpitched sample on 3 keys → melodic (key guard);
  - a mixed voice → `voiceN` melodic + `voiceN kit` right after it.
- `tests/fixtures/spc-kit-groups.json` (text): the census facts of The
  Battle, What?, The Fierce Battle and FF4 Main Theme (Ocean). In CI,
  `isSpcKitGroup` must give voice5/voice7 kit, What? s32 and Fierce Battle
  voice0 s32 not kit, voice6 s35 not kit.
- `spc-real.test.mjs`, real rip (skipped when `SPC_RIP_DIR` is absent).
  The rip is `scratch/rips-snes/final-fantasy-5/the-battle.spc`: copy the
  scratchpad's `the-battle.spc`, or let `recapture.mjs` fetch it from
  nsf-archive (size-checked). Run it through the app's own import session
  (`openImportSession` → `runCaptureJob` → `commitImports`, as
  `recapture.mjs` does), then `parseMidi` the committed bytes and check:
  - voice5 and voice7 have `kit:1`, every note on ch 9, keys from the
    `guessKit` set;
  - no key 51/67/72 remains on them;
  - their track numbers are unchanged;
  - voice6 and voice0/1 are unchanged.
- The writer round-trip stays byte-identical with `kitmap`.
  `capture-diff.test.mjs` classifies a `kitmap`-only change.
- Mixed-voice playback: a vm test where `voiceN kit` does not reach
  `drumHit` while voiceN's render is live.

Acceptance:
- All of the above pass.
- The ear check, Josh's call: The Battle with Hear the MIDI on plays a kit,
  not G4/C5/D#3 tones.
- This step adds no UI. Ask/help: "not applicable: capture-side, no
  user-facing control" in the commit.
- Doc sweep:
  - NIGHT-ROLL.md "SNES capture v2" gets a "sampled drums" paragraph
    (rule, constants, naming, kitmap, render pairing);
  - `tools/spc/INTEGRATION.md`;
  - open-items: Q28/Q29 answered, and #415/#426 move to "ships with the
    re-capture".

### Step 2: Re-capture rollout, one album per push, FF5 first

1. Dry run over all 13 SNES albums:
   `node tools/recapture.mjs --console snes`. Each rip is fetched and
   checked by HTTP status + byte count vs Content-Length + SPC magic; never
   by a JSON field.
2. Read `report.md`. Expect MOVED on every kit song. Unannotated songs get
   `replace`. A changed loop point gets `hold-loop-changed`; list those in
   open-items.
3. `--apply --album snes/final-fantasy-5`, then push.
   - Afterwards, check the published `albums/snes/final-fantasy-5/the-battle.mid`
     in a CI test: voice5/voice7 `kit:1` on ch 10. The test reads the
     committed file, so it needs no rip.
   - Brave: open The Battle. The kit lane shows voice5/voice7. The chord
     readout ignores them.
   - Email + bridge note per the deploy rules.
4. The other 12 albums go one per push, in census order (most kit songs
   first).
   - FF4's three annotated songs come out as `<base>-recapture.mid`
     "(re-capture)". Old files are never touched.
   - Print each copy's loop line for Josh to add by hand.
   - Never write a `.rollnotes.json` (`assertWritable` already enforces it).
5. Acceptance:
   - per album: `git rev-parse HEAD origin/main` match;
   - every applied `.mid` sha matches the report;
   - the album.json `cap.v = 3`;
   - the manifest is rebuilt;
   - no stored song data is deleted.

### Step 3: "▶ Hear sound" in the track menu

Build §2.5 for the families that work today.

Tests (night-roll.test.mjs, with a fake worker as in "tap a note on a chip
song …"):
- A PS1 kit track asks the worker with the kit note's tick.
- A REGISTER-chip `voiceN kit` track slices voiceN's buffer at a kit note.
- A drum track reaches the game path, not `drumHit`.
- No render → the status line, and no sound.

Shipping checklist:
- help/help.html entry (tracks/voice menu section, tap first);
- `node tools/build_help.mjs`;
- drift keyword `Hear sound` in the FEATURES list;
- Ask action `hear_sound {track}` in `src/ask/actions.js`, then
  `node tools/build_ask_help.mjs && node tools/build_help.mjs`;
- docs/ai-parity.md row;
- NIGHT-ROLL.md "Tap a note: the game's instrument" gets a "Hear sound"
  paragraph.

Brave: FF5 The Battle (SNES), an FF7 song (PS1) and an NES song. Each
button plays the game's sound.

### Step 4: "These are drums" / "Not drums"

Build §2.4. In the voice menu, a row under Hear sound reads
`Drums: auto (detected)` / `These are drums` / `Not drums`. The labels are
Josh's words; the auto row's wording is Q-F.

Tests:
- The directive round-trips text ↔ JSON ↔ v2 (format-identity test).
- An unknown-field forward-compat test.
- Mark → the `trackIsDrums`/`factsIsDrums` cache refreshes, and un-mark
  undoes it.
- A marked track is out of the chord facts and the lasso transpose, and is
  `[drums]` in the Ask context.
- "Not drums" on a `kitFrom` track shows the captured keys, and the .mid
  bytes are unchanged on publish.
- One undo step per mark.
- `query-lib` `isDrumTrack` honors the mark.

Shipping checklist:
- help entry;
- HELP.md;
- drift keywords `These are drums`, `Not drums`;
- Ask action `mark_drums {track, drums: yes|no|auto}`;
- generated Ask help;
- ai-parity;
- NIGHT-ROLL.md ".rollnotes format" (the `drums` field);
- annotations-v2 doc + schema;
- WEB-SESSION.md (query tools read the mark).

Brave: mark an FF1 test track (never Josh's compositions), reload, check
that the mark persists, then restore it.

### Step 5: SNES "Hear sound" without a render (worker `previewOne` for spc)

The worker already holds the capture; its `instruments` carry decoded BRR
(`inst.pcm`, `tools/spc/brr.mjs`).
- Resample the template note's sample at its PITCH at 32 kHz.
- Apply its envelope with `dsp-state.mjs`.
- Return it like `previewOne`.

Check it against the render slice in a vm test:
- pitch within 3 cents;
- envelope correlation ≥ 0.99, the bar `tools/instruments/verify.mjs`
  already uses.

SNES never streams (no `stream:` in RUNNERS.spc), so this does not touch iPad stream mode; a render the memory budget refuses gets the status "game sound isn't available for this song". Doc sweep: NIGHT-ROLL.md.

### Step 6 (scope decision first, Q-D): PS1 looped cymbals with no root

Use `sampleFacts` (`tools/psx/notes.mjs:303`) to catch looped,
root-less samples played at one key. That is 199 songs. Start with a
facts-only census, hand-check 20 tracks, then decide. Do not build this
until Josh answers Q-D.

## 4. Guardrails

Must have:
- generic rules only;
- the captured keys preserved (`kitmap`);
- the mark lives in `.rollnotes` only;
- one album per push;
- the size-checked archive fetch;
- `-recapture` copies for annotated songs;
- in-app sheets, no native dialogs;
- Learning mode: kit guesses appear only in ⓘ (on demand) and never name a
  key or chord.

Must NOT have:
- a per-game table or a game-name branch in any capture engine;
- edits to Josh's `.rollnotes.json` or compositions;
- localStorage for the mark;
- any deletion of stored song data;
- local full Playwright runs;
- a synth fallback that pretends to be the game's sound.

## 5. Risks

- **Mixed voices (256) double-play or go silent.** The covers check uses
  `chipSourceName`, never `chipStart`. A vm test pins it.
- **The key guard misses a two-sample tom pair on one voice.** That is
  still kit (≤ 2 keys per sample group, not per voice).
- **A loop line shifts on re-capture.** `hold-loop-changed` holds those
  songs; nothing is overwritten.
- **The `drums` field on an older build** is kept by forward-compat
  (`n.extra`) and never stripped.

## 6. Questions for Josh (short, with examples)

- **Q-A.** When a voice plays both a melody and a drum, the drum gets its
  own "voice3 kit" track. With game sound on, its hits are inside voice 3's
  recording.
  - So: muting "voice3 kit" silences it only when Hear the MIDI is on.
  - Is that OK for now? The alternative is to split the game render per
    sample first, which is more work.
  - Example: FF6 song, voice 3 plays strings and also a crash.
- **Q-B.** You mark a track "These are drums", but its notes sit at G4 and
  C5. Should it play guessed drum sounds (snare, kick, worked out each time,
  file unchanged), or play those notes as they are on the drum kit?
  Default: guessed sounds.
- **Q-C.** Old SNES songs put noise-generator drums from several voices
  into one "drums" track. Should those split per voice too, matching Q28?
  - Example: an FF6 song with noise on voice 6 and voice 7 would become
    "voice6" + "voice7" kit tracks instead of one "drums".
  - Songs you annotated would get "(re-capture)" copies.
- **Q-D.** PS1 cymbals that hold a looped sound with no clear pitch show as
  one long held note (199 songs). Fix them in this round, or later?
  - Example: an FF7 crash cymbal shown as a held C5.
- **Q-E.** You press "▶ Hear sound" before the song's game audio has loaded.
  Should it stay silent with "game sound not loaded yet", or play our synth
  labelled "(synth)"? Default: silent + message.
- **Q-F.** Wording for the third state, when you haven't marked a track:
  "Drums: auto (detected)", "Drums: from the game", or "Drums: not set"?

## Fable plan-review amendments (2026-10-13) — BINDING

Reviewed against the code at de6bcb3b. Every file:line the plan cites was
opened; all of them hold. The census numbers (643 read, 308 songs, 34 FF5,
564 kit voices, 308 all-kit, 256 mixed) were recomputed from the scratchpad's
`census.jsonl` with the §2.1 rule and match exactly. The Battle's
measurements match. Only 3 SNES songs are annotated (FF4). 13 SNES albums.
Where an amendment below changes the plan, the amendment wins. Decisions are
defaults under CLAUDE.md "Decide; never park work on a question" — Josh
vetoes later.

### A. Josh's questions — decided now

- **Q-A — OK for now.** Muting `voiceN kit` silences it only under Hear the
  MIDI; in game sound its hits ride on `voiceN` (and muting `voiceN` also
  mutes them). Say so in the NIGHT-ROLL.md paragraph.
- **Q-B — guessed GM sounds.** A hand-marked track (`drums=1`, no `kit:1`)
  plays `guessKit` over its distinct pitches at play time. The .mid keeps its
  pitches; nothing is stored for a hand mark. The `kitmap` meta exists only
  on capture-detected kit tracks (§2.2). See D4 for where the map lives.
- **Q-C — yes.** Noise-generator drums split one kit track per voice, like
  Q28. Blast radius, measured: the census shows 2 songs with any noise drums
  (both one voice); 2 published SNES .mids carry a merged `drums` track. In
  `makeMidi` the SNES path stops folding `e.drum` onto `"drums"`: a noise
  voice's notes stay on `voiceN` with `kit:1`, channel 9. Check
  `tests/spc-undrum.test.mjs` and `tools/spc-undrum.mjs` still pass (they
  read the published files, which change only when re-captured).
- **Q-D — in scope.** Step 6 is not held. Run the facts-only census and the
  20 hand-checks after Step 5, then build. Change Step 6's last sentence to:
  "Build after the census, as step 6."
- **Q-E — silent + status.** The status line reads exactly:
  `game sound still loading — try again in a moment`. No synth stand-in (a
  synth note would mislead drum identification). This replaces §2.5's
  wording.
- **Q-F — two items.** The voice-menu rows read `These are drums` and
  `Not drums`; the active one shows a check. Tapping the checked item again
  returns the track to auto. There is no third "auto" row.

### B. Step 2 rollout — the plan's premise is wrong (CRITICAL, fixed here)

`tools/recapture.mjs:152-157` `planAction` returns `keep-old+add-new` for
EVERY `MOVED` song, `"annotated or not (Josh, 2026-10-07)"`. The header
comment at lines 31-33 is stale; the plan's Step 2.2 `"Unannotated songs
get replace"` was read from it. A kit rewrite is `MOVED` on every one of the
308 songs: `capture-diff.mjs:124` keys notes by pitch, so a G4→38 rewrite is
"old notes / new notes don't match". As written, Step 2 would add 308
`-recapture` copies (34 in FF5 alone) and double the album lists. The dry
run's `report.md` would show it before any apply, and git keeps every file —
but the plan cannot reach its own Step 2 acceptance without the change below.

**Decision (B1):** add a verdict `KIT` to `tools/capture-diff.mjs`, between
`SAME`/`VELOCITY` and `MOVED`: fold the new file first — every `voiceN kit`
track's notes go back onto `voiceN` with their `kitmap` captured keys, every
`kit:1`/`kitmap` meta and every channel-9 difference is dropped — and if the
folded pair is `SAME` or `VELOCITY`, the verdict is `KIT` (reasons list the
kit tracks). No beat moved, so Josh's 2026-10-07 ruling (about beats moving)
does not apply. `planAction`: `KIT` with no annotations → `replace`; `KIT`
with annotations → `keep-old+add-new` (FF4's three songs get their copies,
as Q29 says). Fix the stale header comment at lines 31-33 at the same time.
`capture-diff.test.mjs` pins: a kit-only rewrite → `KIT`; a kit rewrite plus
one moved note → `MOVED`; a `kitmap`-only change → `VELOCITY`.
Step 2.2's expectation becomes: `KIT` on every kit song, `replace` unless
annotated.

**B2.** Six SNES rows are already `-recapture` copies (FF4
main-theme-ocean, tranquil-beach; Chrono Trigger ×4). They are re-captured
as their own rows (`tr.rip`, recapture.mjs:122,171). Under `KIT` they are
replaced in place. Any `keep-old+add-new` on one of them would create
`<base>-recapture-recapture.mid`: hold such a row instead and list it in
open-items.

**B3.** Rollback for an applied album: `git revert <the album's commit>`,
then `node tools/build_manifest.mjs`, push with the hash check. Write this
in Step 2.5.

**B4.** The Step 2.3 CI test on the committed FF5 `the-battle.mid` reads
`album.json` `nsf.tracks["the-battle"].cap.v` and asserts the kit shape only
when `cap.v >= 3` (precedent: tests/nsf.test.mjs:923-928), so it passes
before and after the apply and never blocks a push.

### C. Step 1 — detection and the writer

- **C1. Fixture contradiction, FF5 "What?".** §2.1 says the key guard keeps
  "What?" sample 32 melodic. The census says otherwise: voice1 s32 has 2
  keys, 164 hits, median 0.128 s, all unpitched → kit under the rule; voice2
  s32 has 1 key, 136 hits, 0.275 s → kit; only voice0 s32 (median 0.541 s)
  stays melodic, and by the MEDIAN guard, not the key guard. The Fierce
  Battle voice0 s32 (10 keys) is correctly kept by the key guard. Fixture
  expectations in `tests/fixtures/spc-kit-groups.json`: What? voice0 s32 →
  not kit; What? voice1/voice2 s32 → kit. Add "What?" to Josh's ear check in
  Step 1's acceptance (if his ear says s32 is melodic, the rule needs a new
  guard, not a fixture edit; it becomes an open-items item, not a per-song
  table).
- **C2. Kit tracks are APPENDED, not inserted.** Prior art: the NES dpcm
  track — `"a song that uses it gains a LAST track, so no existing track
  number moves"` (tools/nsf/midi-write.mjs:184-185) — and capture-diff's own
  "track numbers are annotation anchors" (capture-diff.mjs:169). A mixed
  voice's `voiceN kit` track goes after the last voice track, kit tracks in
  voice order. §2.2's "placed right after voiceN" and the Step 1 test
  "`voiceN kit` right after it" change accordingly. The `KIT` fold (B1)
  matches kit tracks to their voice by name, not position.
- **C3. Channel and program.** Both `voiceN`-all-kit and `voiceN kit` tracks
  get `chans[name] = 9` before the channel loop at midi-write.mjs:393-402
  (today `voiceN` would take the next free non-9 channel). Kit notes write no
  `prog` (line 363-364 would write the SRCN as a program; on channel 9 a
  program change selects a GM kit).
- **C4. `uniqueGmKeys`.** `dpcmKeys` sorts by a numeric `key`
  (midi-write.mjs:316). Encode the (voice, srcn, captured key) kit voice as
  one number; the `kitmap` text is built from the same list.
- **C5. Synthetic tests use the DSP-log helpers, not `makeTestSPC`.**
  `tools/spc/make-test-spc.mjs` has one fixed looped-sine melody and no
  options. The kit cases (one-shot noisy sample ×16 / ×4, three keys, a mixed
  voice) are built with `dspCapture`, `voiceRegs`, `kon` and one-shot
  `encodeBRR(pcm)` (no `loopStart`) already in tests/spc.test.mjs:364-373 —
  the way `noiseVoiceCapture` (line 307) does. Step 1 reads
  "spc.test.mjs, synthetic (dspCapture)".
- **C6. The real-rip test.** `scratch/rips-snes/` does not exist and the
  scratchpad copy is session-local. The rip lives where recapture.mjs caches
  it: `/tmp/recap/rips/snes/final-fantasy-5/the-battle.spc` (66,156 bytes;
  fetched by `fetchVault`, size- and magic-checked). The test reads
  `process.env.SPC_RIPS || "/tmp/recap/rips/snes"` (precedent:
  tests/gbs.test.mjs:568) and skips when the file is absent. It goes in a NEW
  file `tests/spc-rip.test.mjs` — `spc-real.test.mjs`'s header says "No
  emulation here" and must stay true — and that name is added to `FILES` in
  tools/run-tests.mjs:12-20 (an explicit list; an unlisted file never runs).
- **C7. `CAPTURE_VERSION` = 3 is a label only.** Its sole reader is the
  `cap.v` stamp in `applyAlbum` (recapture.mjs:361); tests/nsf.test.mjs:928
  tests `>= 2` and is unaffected. Update the comment at recapture.mjs:57 to
  say what 3 means (SNES sampled kits, `kitmap`, per-voice noise kits).
- **C8. `chipSourceName` goes INSIDE `chipHas` and `chipNoteSlice`.** Resolve
  the name at the top of `chipHas` (chip.js:305-308, both the stream branch
  and the buffer branch) and at the buffer lookups in `chipNoteSlice`
  (chip-stream.js:308,315) and the `chip.pan[tr.name]` lookup
  (voices.js:1027). Then every caller agrees — `scheduleNote` (voices.js:974),
  `previewNote` (:1002), `autoVoiceLabel` (voice-menu.js:79). `chipStart`
  iterates the RENDER's buffers and finds a track by exact name through
  `chipPartTrack` (chip.js:368-378): a `voiceN kit` track never gets a
  source, so there is no double start. `chipPartTrack` must not resolve.
  The Step 1 vm test asserts both: `voiceN kit` never reaches `drumHit`
  while the render is live, and `chip.srcs.length` equals the number of
  rendered voices.
- **C9. Kit facts have no home in the app.** Capture warnings reach only the
  import row's ⓘ (`r.st.title`, capture.js:225) and recapture's `report.md`.
  For published albums nothing shows them. Acceptable for Step 1; add to
  open-items: "kit decision facts for published songs — where to show them".
  Learning mode: the facts name a drum, never a key or a chord.

### D. Step 4 — the drums mark

- **D1. Fifth site.** `noteToJSONBase` (src/model/rollnotes.js:384-393)
  lists the track fields key by key on the WRITE side; add `drums` there, or
  the JSON v2 file silently drops the mark. The plan's round-trip test
  catches it; this names the line.
- **D2. "Not drums" must beat the channel-9 short-circuit.**
  `scheduleNote` (voices.js:982) reads `if (n.ch === 9 || trackIsDrums(ti))
  drumHit(...)`: the mark alone cannot stop a kit track from drumming. The
  gate becomes `(n.ch === 9 && tr.drumsMark !== false) || trackIsDrums(ti)`.
- **D3. "Not drums" shows captured keys WITHOUT touching bytes — decided.**
  In `finalizeNotes`, a track with `drumsMark === false` and `tr.kitFrom`
  gets each note's `n.pKit = n.p` (the GM key) and `n.p = kitFrom[n.p]` (the
  captured key); clearing the mark restores `n.p` from `n.pKit` and deletes
  it. Both writers (`src/midi/write.js` and `writeSongMidi`) emit
  `n.pKit ?? n.p`, so a draft published while marked is byte-identical to
  one published unmarked; the "writeMidi / writeSongMidi agree" test adds a
  `pKit` case. Nothing in a `.mid` changes. (Alternative rejected: a
  display-time pitch map would touch every roll/score/facts/lasso reader.)
- **D4. Hand-marked kit key (Q-B) — one accessor.** `tr.kitPlay` (Map
  captured pitch → GM key, from `guessKit` over the track's distinct pitches)
  is set in `finalizeNotes` when `drumsMark === true && !tr.kit`, cleared
  otherwise. `kitKey(tr, n)` = `tr.kitPlay ? (tr.kitPlay.get(n.p) ?? n.p) :
  n.p`, used by `drumHit`'s caller (voices.js:982), the roll's kit lane
  (roll.js:29 `used.add(n.p)` and :60), and the Ask context's drum column
  (context.js:156 `String(n.p)`). Without it the lane shows rows at GM 67/72
  ("agogo", "long whistle") for The Battle's G4/C5. It is a track field, not
  on `S`.
- **D5. No new `S` fields.** Everything here is a track field (`kitFrom`,
  `drumsMark`, `kitPlay`) or a note field (`pKit`); `S` is created before any
  app code runs (src/state.js:3), so the boot-path TDZ class does not arise.
  If the builder does add an `S` field, it goes in src/state.js with the rest.
- **D6. Smoke test.** Steps 1 and 4 change the load/save path (parse.js,
  write.js, finalizeNotes): run `npm run test:e2e:smoke` before those pushes
  (CLAUDE.md allows it when Josh is not using the machine), plus the vm
  tests by name.

### E. Shipping checklist, per UI step (Steps 3 and 4)

Both steps list help entry, `build_help.mjs`, drift keyword, Ask action,
generated Ask help, ai-parity, NIGHT-ROLL. Add to BOTH: open-items (closed
items + decisions), the Brave check with every pref restored, the
`git rev-parse HEAD origin/main` match, and the explicit "not applicable"
lines for README/glossary/WEB-SESSION where they do not apply (Step 4 does
touch WEB-SESSION.md — keep that). Step 3's Ask action `hear_sound {track}`
and Step 4's `mark_drums {track, drums: yes|no|auto}` fit the registry shape
(`{name, args, gloss, quiet, example, say, spec, run}`, src/ask/actions.js).
Step 3's status line is the Q-E text above; its drift keyword stays
`Hear sound`.

### F. Out of scope, queued

Josh's open-items entry (2026-10-13, the-battle) also asks for "(2) one tap
to hide/isolate drum tracks". This plan removes drums from analysis by
detection (kit lane, lasso, facts, Ask context all gate on `trackIsDrums`);
a one-tap "Hide drum tracks" toggle is not in it. Queue it in open-items
with the default: a View-menu toggle that sets `hidden` on every
`trackIsDrums` track for the session. Not built here.

## Step 6 census and hand-checks (2026-10-14, builder; facts only, no ear)

Method: `tools/percussion-census.mjs --album ps1/<album> --json` over the six
PS1 albums (rips from the public archive, 470 songs captured; Chrono Cross
"Drowning Valley" is 404 in the archive), then every non-kit program that
plays at most two pitches SONG-WIDE (the way `kitify` groups) on a looped
sample with no root. A first, per-channel pass over-counted: it flagged FF9
"The Airship Hilda Garde" program 129, which looks like one hit per channel
but is a six-channel chord part in the whole song. The rule therefore reads
the program across the song, not the channel.

Census (rule: ≤ 2 pitches, < 12 notes, looped, root null, harmonicity < 0.6,
median note ≤ 6 s): 29 programs flip, one per song, in 29 of the 470 songs:
FF7 6 (cinco-de-chocobo, fanfare, fiddle-de-chocobo, hurry,
opening-bombing-mission, oppressed-people, …), FF8 2 (dead-end,
the-landing-demo), Chrono Cross 2 (magical-dreamers main + variation),
Parasite Eve 3, Saga Frontier 16 (one sample, program 21, a 0.17 s noise
loop). The earlier "199 songs" figure counted the one-pitch, no-root groups
without the song-wide and note-count tests.

20 hand-checks (first 20 of the 29, read as facts: hits, pitches, channels,
note lengths, sample length/harmonicity/flatness, beat positions): all 20
are sparse strikes on bar positions (beats 0, 2, 3 or 3.5) of a 0.08–1.1 s
noise loop with harmonicity 0.09–0.54, notes 0.05–5 s long (a looped crash's
ring-out) — the "held C5" shape Josh described. One doubtful: parasite-eve
"Urban Noise" prog 33 (5 notes of 4–8 s, all on beat 0, a street-noise bed);
it flips because the median is under 6 s. A noise bed has no pitch either, so
it stays a kit; if the ear says it is ambience, lower CYMBAL_MAX_SEC (named
constant, tools/pedal-tone.mjs). Not checked by ear: there is no listening
here.

Built: `isCymbalLoop` (tools/pedal-tone.mjs), `cymbalProgram` in kitify
(tools/psx/notes.mjs), tests in tests/psx.test.mjs (truth table, a synthetic
VAB with a looped noise sample via makeTestVAB({wash: true}), and a real-rip
test for FF8 Dead End, skipped without a rip; NR_PS1_RIPS points it at a rip
cache). Re-capture of published PS1/PS2 songs is NOT done here (KIT verdict,
one album per push, tools/recapture.mjs): queued in open-items.

### Step 6 follow-up: the ≥ 12-note branch (Fable review, 2026-10-14; facts only, no ear)

Bug: a looped, rootless, noise-like sample struck 12+ times at ONE pitch with
median ≥ 1 s went to `pedalProgram`, whose looped branch returns pedal
regardless of root and harmonicity, so a crash on every downbeat stayed a
"held C5". Fix: `kitify` tests `cymbalProgram` before `pedalProgram` in the
≥ 12 branch (`cymbalProgram(...) || !pedalProgram(...)`). The branch still
needs exactly one pitch, so a chord part (FF9 Hilda Garde 129, six pitches)
cannot reach it; tests/psx.test.mjs covers it synthetically and on the real rip.

Sizing, run BEFORE the code change: every PS1 album captured (rips from the
archive), every non-kit program of exactly one pitch, ≥ 12 notes, that
`pedalProgram` kept melodic, and whose first sample is looped / root null /
harmonicity < 0.6 (median approximated from ticks at the first tempo, so the
1 s and 6 s edges are approximate). Flips per album: FF7 4, FF8 1, FF9 0,
Chrono Cross 0, Parasite Eve 0, Saga Frontier 11. Total 16 programs in 16
songs, every one a single channel.

Hand-checks (hits, pitch, notes, loop/root/harmonicity, beat positions):
1. FF7 mako-reactor prog 7: 14 hits, one pitch, looped, no root, h 0.35, all on beat 0.
2. FF7 one-winged-angel prog 54: 16 hits, one pitch, looped, no root, h 0.51, beats 2 and 3.
3. FF7 still-more-fighting prog 65: 29 hits, one pitch, looped, no root, h 0.23, beats 0, 1, 3, 3.5.
4. FF8 the-landing-demo prog 68: 20 hits, one pitch, looped, no root, h 0.14, beats 1.5 and 3.5.
5. Saga Frontier battle-2 prog 21: 24 hits, one pitch, looped, no root, h 0.32 (the one 0.17 s noise loop shared by all 11), beats 0, 1, 2, 3.
Saga Frontier's 11 are all program 21, the same sample as the under-12 flips.
