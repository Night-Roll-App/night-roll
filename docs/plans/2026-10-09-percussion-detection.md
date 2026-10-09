# Percussion in game captures: kit tracks that stay kit tracks (plan, 2026-10-09)

Open item: "2026-10-09 Hear the MIDI: PS1 percussion plays as pitched notes".
Status: plan → advisor review → build. Nothing here is built yet.

## 1. What is actually wrong (measured 2026-10-09)

The PS1 detector already exists and ran on Racing Chocobos. The drums were
lost later, when the app re-wrote the capture.

- `tools/psx/notes.mjs:259-288` `kitify()` marks percussion. A note is
  percussion if it is in AKAO drum mode, if its program is a VAB kit
  (`isDrumProgram`, `:24-28`), or if its program plays one pitch over 12 or
  more notes. Each voice then gets a GM key from rhythm
  (`tools/kit-guess.mjs:12-45`).
- `channelGroups()` (`:293-305`) names a channel that is all kit
  `ch 8 prog 7`. Only a channel that is part melodic, part kit gets the
  " kit" suffix (`:302`).
- `makeMidi` writes every kit group on MIDI channel 10 (`:605`).
- The app's import then re-writes those bytes.
  - `src/import/capture.js:532-548` parses them into a draft and keeps `n.ch = 9`.
  - `commitImports` calls `writeMidi` (`src/import/capture.js:675`).
  - `writeMidi` (`src/midi/write.js:24,83-84`) and its twin `writeSongMidi`
    (`tools/nsf/midi-write.mjs:432-433,493,518-521`) decide kit-ness by
    track NAME only (`/drum|percussion|kit|noise|dpcm/`).
  - Since ed929059 (2026-09-30, "only a kit track may use MIDI channel 10"),
    a note's channel 9 is thrown away unless the name matches. The track
    then falls to `NON_DRUM_CH[trackIndex]`.
- Evidence from git history for FF7 Racing Chocobos:

  | Version | Where the five drum tracks land |
  |---|---|
  | b1b2ce81 (9/27), d6eb37e7 (9/30) and today | ch 8/9/11/12/13 |
  | 2c49891a (the withdrawn 9/30 re-capture, before ed929059) | ch 10 |

  The keys never changed: 38/36/42+51/41/46. Those are kit-guess outputs
  (snare, kick, hat+ride, low tom, open hat).
- Corpus scan of published files:

  | | PS1 | PS2 |
  |---|---|---|
  | One- or two-key tracks (8+ notes) off ch 10 | 1,349 | 318 |
  | …whose keys are all kit-guess GM outputs | 673 (in 249 songs) | 130 (in 59 songs) |
  | " kit"-named tracks that kept ch 10 | 43 | 12 |

  Because of the writer bug, the corpus is not a measure of what the detector
  misses; section 6, step 3 measures that at capture time.
- The app side needs nothing new.
  - `src/audio/voices.js:982` plays `n.ch === 9 || trackIsDrums(ti)` through
    `drumHit` (`src/audio/engine.js:235`), which is keyed by GM number.
  - `trackIsDrums` (`src/model/grid.js:89-95`), `theory/facts/common.js:54`
    and `tools/loudness-synth.mjs:33` all accept "any note on ch 9".
  - `tools/query-lib.mjs:85` checks the name only, so it needs the marker
    too (see 2b).

## 2. How a kit track is written: a marker, not a name

**Decision proposed: a per-track text meta `kit` (0xFF 0x01 "kit").** It works
like `sounding:N` (`src/midi/parse.js:88-93`).

Why not rename to `ch 8 prog 7 kit`:
- `tools/capture-diff.mjs:13-14,178` grades any rename as MOVED.
- Under the re-capture policy (`tools/recapture.mjs:29-36`), a MOVED song
  with annotations is kept as it is, beside a "(re-capture)" copy.
- A marker plus a channel change is a "soft" difference: text metas and
  channels (`capture-diff.mjs:8-10,187-189`). That grades VELOCITY, so the
  song is replaced in place and its annotations stay anchored.
- Names also pair each console-rendered track with its MIDI track
  (`tools/psx/spu-render.mjs:334` uses the same `channelGroups` names). The
  pairing is untouched.

Why not "all notes on ch 9 ⇒ kit" in the writer: that is exactly the case
ed929059's test forbids (`tests/night-roll.test.mjs:10448`, a melodic
`ch 12 prog 2` whose one note says ch 9). The capture must say "kit" itself.

What is written for a kit track:
- MIDI channel 10 (index 9).
- Each note's GM key (`n.gm`), with the guess reported in `result.kitGuess`
  and the capture warning ("kit guessed from rhythm: …").
- No melodic CCs: no program changes, no pitch bends, no CC84 glide links.
  `makeMidi`'s `emitAkao`/`emitPs2` already skip these for `n.drum`.
- Pan stays (CC10).

### Changes, in order

a. `tools/nsf/midi-write.mjs`
   - Add `kitMetaEvent()` next to `offsetMetaEvent`.
   - `writeSongMidi`: `isKit = tr.kit === true || isKitTrackName(tr.name)`.
   - Write the `kit` meta when `tr.kit` is set, so it round-trips.
b. `src/midi/write.js`: the same change. It is the hand-port, pinned
   byte-for-byte by the "writeMidi / writeSongMidi agree" test.
c. `src/midi/parse.js`
   - The `kit` text meta sets `tr.kit = true`.
   - It is consumed, not pushed to `raw`, like `sounding:`.
d. `src/import/capture.js:536-548`: carry `...(tr.kit ? {kit: true} : {})` into
   the draft. Also check that every other draft→write path (see
   `ctlCopy`) carries it.
e. Capture writers emit the marker on every kit group:
   - `tools/psx/notes.mjs:605` (covers PS1 SEQ, AKAO and PS2 SQ/BGM)
   - `tools/n64/notes.mjs` `toMidi`. N64 names already carry "drums"/"kit";
     the marker is added for uniformity.
f. Read `tr.kit` first in:
   - `src/model/grid.js:94`
   - `src/theory/facts/common.js:54`
   - `tools/query-lib.mjs:85` (name-only today)
   - `tools/loudness-synth.mjs:33`

   One shared predicate is better than four regexes. Keep the existing
   name/ch-9 fallbacks so old files still read.

## 3. Percussion signals per engine (what the capture's own data says)

| Engine | Signal already in the data | Where (file:line) | Status |
|---|---|---|---|
| PS1 AKAO | Drum-mode opcodes (layouts 1/2 degree map; layout 3 header drum table), `drum` flag on each note | `tools/psx/akao.mjs:231,359-362,395-411,555-571` (0xED ends drum mode) | Used by kitify |
| PS1 SEQ/VAB, PS2 SQ | VAB program = several samples, each 1–3 keys wide → kit | `tools/psx/notes.mjs:24-28,70` | Used |
| PS1/PS2 all | Sample is one-shot (ADPCM end flag without the repeat bit) | `tools/psx/vab.mjs:74-89` (`oneShot`); AKAO sets: `tools/instruments/psx.mjs:88,101` (loop offset) | **Unused by kitify** |
| PS1/PS2 all | Sample has no clear pitch period (`estimateRoot` confidence) | `tools/psx/vab.mjs:106-154` | **Unused by kitify** |
| PS1 | ADSR decays to silence (instrument record; 0xAD–0xBF overrides) | `tools/psx/instr.mjs` `envelopeAt`; `notes.mjs:181-186` | **Unused** |
| PS1/PS2 | Program held at one pitch over ≥ 12 notes | `notes.mjs:265-269` | Used (key-count rule) |
| All sampled | Measured sound: harmonicity, spectral flatness (1 = noise), time to −14 dB, one-shot | `tools/instruments/name.mjs:1-40` (rule 1 "drums") | Library naming only; not used at capture |
| SNES | Noise-generator voice, ≥ 8 hits, median length < 0.5 s | `tools/spc/notes.mjs:178-198` | Used (shared "drums" track) |
| SNES | `unpitched`: one-shot BRR sample whose root is none or low confidence | `tools/spc/notes.mjs:289-293` | **Computed, never consumed** |
| N64 | Sequence drum notes; instrument held at one pitch ≥ 12× | `tools/n64/notes.mjs:89-125` | Used; already on ch 10 (531/957 songs) |

Proposed generic sample test, shared by every sampled engine:
- Rule: a sample/instrument is **percussive** when it is one-shot AND either
  (no confident root) or (flatness > 0.12 or harmonicity < 0.5, the
  `name.mjs` "noisy" thresholds) AND its envelope reaches silence within the
  note.
- Location: a new `tools/percussive.mjs`, computed on the decoded PCM. This
  is cheap and needs no rendering.
- Inputs: PCM plus loop flag plus root confidence. No game identity, no
  per-game table.

## 4. Detector changes (PS1/PS2 first)

1. Keep rule 1 (drum mode, VAB kit). These are the driver's own statements.
2. Rule 2 (one pitch over 12 or more notes) gets a sample guard.
   - Promote only if the sample is **percussive** (section 3), or if it is
     one-shot with a decaying ADSR.
   - A looped sample with a clear pitch played at one key stays melodic.
     These are the pedal tones and ostinato basses the open item warns about.
3. New rule 2b: a program on 2–3 pitches whose sample is percussive is
   percussion. Examples: an open/closed hat on one sample, a tom pair.
   Each pitch is its own kit voice for `guessKit`.
4. Write each decision into the capture warnings, by program, with its
   reason, for example: `prog 36: one-shot, no clear pitch → kit`.
   This is a fact report.

## 5. Per-engine scope and order

1. **PS1 + PS2: writer marker (section 2).** This fixes Racing Chocobos and
   about 250 PS1 / 59 PS2 songs with no detector change. Smallest step,
   biggest effect.
2. **PS1/PS2: sample-guarded detector (section 4).** Starts with the census
   in section 6, step 3.
3. **SNES: sampled drums.**
   - Route `unpitched` and percussive-sample events to kit voices, grouped
     by (voice, srcn), then GM keys from `guessKit`.
   - Design choice for Josh (Q-D): per-voice `voiceN kit` tracks vs the
     shared `drums` track.
   - Remember the `spc-undrum` episode (`tools/spc-undrum.mjs:1-30`): the
     noise classifier once folded a texture voice into drums. The
     ≥ 8 hits / < 0.5 s gate (`DRUM_MIN_HITS`) applies here too.
4. **N64: census only.** 338 songs have one- or two-key tracks off ch 10.
   Act only if the census finds percussive samples there.
5. **NES / Game Boy: no change.** Names already match, and 279/178 songs are
   on ch 10.

## 6. Test strategy

vm tests (`npm test`; never local Playwright):
1. **Round trip.**
   - A capture-shaped song whose kit track is named `ch 8 prog 7`, with the
     `kit` meta and notes on ch 9: parse → draft (capture.js map) →
     `writeMidi` and `writeSongMidi`. Notes stay on ch 9 and the meta
     survives. The two writers stay byte-identical (extend the existing
     test).
   - ed929059's test keeps passing: no marker, melodic name, a ch 9 note →
     not channel 10.
2. **psx-real** (`tests/psx-real.test.mjs`, `PSX_PSF_DIR`; rips in
   `scratch/rips-ff7/`: Prelude, Bombing Mission, Cry of the Planet).
   - Through the app's import (`tools/import-set.mjs` session): every
     `kitGuess` group lands on ch 10 in the committed bytes.
   - Bombing Mission's two-pitch bass (ch 16 prog 45) stays melodic.
   - Add Racing Chocobos' minipsf to `scratch/rips-ff7/`. `recapture.mjs`
     caches it under `--out .../rips/`.
3. **Census tool, facts only.** One line per track: source program/sample,
   one-shot, root confidence, flatness/harmonicity, note and pitch counts,
   decision and reason.
   - Run over every PS1/PS2 album through `recapture.mjs` dry-run output.
   - Before/after counts per console for the table in section 1.
   - Hand-check about 20 tracks per console; report pedal tones that were
     wrongly promoted and drums that were missed.
4. **Synthetic tests.**
   - VAB with a looped pitched sample at one key ×16 → melodic.
   - One-shot noise sample at two keys → kit.
   - (`tools/psx/make-test-seq.mjs`; `tools/spc/make-test-spc.mjs` for SNES.)
5. **ps2-real** (`PS2_RIPS`) and **spc-real**: the same ch-10 assertion where
   each step lands.
6. **Ear check (Josh)**: Racing Chocobos and Bombing Mission in Hear the MIDI.

## 7. Questions for Josh (plain language, one example each)

Q-A. **Fix the saved files in place?** Racing Chocobos' drums move to the
drum channel; no note moves in time or bar. The re-capture check calls that
a "velocity-only" change, so an annotated song is updated in place (no
"(re-capture)" copy). Default: yes.

Q-B. **Drum sounds are guessed from rhythm.** The sound on beats 2 and 4
becomes "snare", the one on 1 and 3 "kick", the busiest "hi-hat". In Racing
Chocobos, program 10 becomes a kick. The game's own sound still plays in
console mode. This guess has been live since 9/27 and is unchanged.
Default: keep.

Q-C. **One-note parts that aren't drums.** A part playing one note 16 times
on a smooth, sustained sound (a pedal tone) is treated as a drum today.
With the change it becomes a melodic part again. If that happens in a song
you annotated, it would get a "(re-capture)" copy. Default: yes, change it.

Q-D. **SNES sampled drums: one drum track or one per voice?** Example:
Chrono Trigger voice 5 plays snare and tom samples. Option 1 merges them
into the existing "drums" track (fewer tracks; changes track numbers, so
annotated songs get copies). Option 2 gives "voice5 kit" its own track
(track numbers stay). Default: option 2.

Q-E. **SNES drum notes change pitch to drum keys.** A snare written today as
"G#5" becomes kit key 38. Annotated songs get a "(re-capture)" copy beside
the old one. Default: yes.

## 8. Re-capture / rollout

1. Ship the writer marker with its tests. New captures are right from then on.
2. `node tools/recapture.mjs --console ps1 --out /tmp/recap` (dry run), then
   ps2. Expected verdicts:
   - **VELOCITY:** songs where only kit channels and the marker changed.
   - **MOVED:** songs with other drift since the 10/07 v2 re-capture.
3. Check the report before any `--apply`:
   - Scan every new file for melodic notes on ch 10. This is the 9/30
     lesson: the re-capture was withdrawn after melodic parts landed on the
     drum channel.
   - Josh listens to Racing Chocobos.
   - One album per push: FF7 first.
4. `--apply` keeps its allowlist: never `albums/compositions/`, never a
   `.rollnotes.json`.
   - MOVED + annotated → "(re-capture)" copy, as now.
   - The existing "(re-capture)" copies are capture files and get replaced
     like any other.
5. The detector step (section 4) and SNES (Q-D/Q-E) each repeat this
   dry-run → report → Josh → apply cycle.
6. Docs:
   - NIGHT-ROLL.md "PlayStation captures: percussion by rhythm" and the
     writer section (line ~450, "drums stay on channel 10").
   - open-items.md: close the item, queue the census findings.
   - tools/README.md: one line for the census tool.
   - Ask tool: "not applicable: capture data, no new user action".

## 9. Risks

- **A third MIDI writer path that drops `tr.kit`.** Candidates: draft
  save/read in `model/versions.js`, publish re-serialise, spc-undrum. Grep
  every `writeMidi(`/`writeSongMidi(` caller and every draft track map.
- **Marker reaches a foreign file.** A kit track exported to another DAW
  carries a harmless text event.
- **The sample test needs decoded PCM at capture time.** AKAO sample sets
  are read from RAM (`akaoRecord`), so measure the cost on a big set (FFX)
  against the capture time.
- **Rhythm guessing in odd meters.** `guessKit` reads beats from the first
  time signature only. A 3/4 or mixed-meter song may swap kick and snare.
  This is visible in the warning; no change is proposed.
- **Learning mode.** Kit labels name drum sounds, not keys or chords, so
  they are allowed. The census reports facts only.

## 10. Advisor review (2026-10-09, Opus — Fable was at its usage limit)

ACCEPT-WITH-RESERVATIONS for fix 1. Confirmed: the writer drops ch 9 for
kit groups not named kit/drum (ed929059); Racing Chocobos HEAD → 2c49891a
grades VELOCITY (channel/CC/text-meta are soft); the app already plays ch-9
notes as drums (voices.js:982, grid.js:89-95), so §2f is deferred except
tools/query-lib.mjs:85.

Changes to the plan:
- **Seven track-map sites rebuild tracks field by field and would drop
  `kit`** — all must carry it, in the same key position (musicSig is
  JSON.stringify; order matters): src/import/capture.js:536,
  src/model/versions.js:45-60 (draftDoc), src/sync/publish.js:431,
  src/import/hub.js:430 and :688, src/session/files.js:197 (Save As),
  src/session/song.js:465 (openDraftDoc). Check setSong keeps parsed track
  objects (folder-mode writeMidi at versions.js:260,294).
- **Namespaced marker** (`kit:1`, like `sounding:N`) so a foreign file's
  own "kit" text event isn't consumed.
- **N64 (§2e) out of fix 1** — its names already match.
- **Q-A caveat:** the dry run only stays VELOCITY when nothing else drifted
  since 10/07 (CC91/CC84/program drift → MOVED → annotated songs get copies).
- **Adjacent existing bug:** a foreign GM .mid whose drum track isn't named
  drum/kit loses ch 10 on its first save (hub → draft → writeMidi). Option:
  non-trust parses set `tr.kit` when every note is on ch 9. Queued.

Fix 1 build checklist: (1) midi-write.mjs kitMetaEvent + isKit uses tr.kit;
(2) src/midi/write.js identical; (3) parse.js consumes the marker → tr.kit;
(4) the seven maps; (5) psx/notes.mjs trackBytes/emit pass g.kit;
(6) query-lib isDrumTrack reads tr.kit; (7) vm tests: extend :783 with a
kit "ch 8 prog 7" track, a parse→draft→openDraftDoc→draftDoc→both-writers
round trip, :10448 stays green, a foreign "kit" text stays untouched;
(8) split check + run-tests; (9) NIGHT-ROLL :450 + open-items; (10) only then
the recapture dry run, FF7 first.
