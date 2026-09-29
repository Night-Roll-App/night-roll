# Release sweep — 2026-09-29

The automatic half of open-items.md's RELEASE GATE. Every set below was run
through the app's own import path via `tools/import-set.mjs` (no `--publish`,
`--out` pointing at a scratch directory), one at a time, under a 900 s hard
timeout each (`perl -e 'alarm 900; exec @ARGV' node tools/import-set.mjs
...`). Nothing landed under `albums/`; the scratch output was discarded
after this report was written. 56 sets were attempted across the rips under
`/tmp/claude-501/rips/`: every NES/Game Boy/SNES zip in `nes/`, `nes2/`,
`game-boy/`, `snes/`; every PS1 minipsf/psf directory (`ff7`, `chrono-cross`,
`final-fantasy-viii`, `final-fantasy-ix`, `parasite-eve`, `saga-frontier`);
every N64 miniusf directory (`sm64`, `oot`, `mm`, `n64-banjo-kazooie`,
`n64-diddy-kong-racing`, `n64-donkey-kong-64`, `n64-ge`,
`n64-jet-force-gemini`); and the two PS2 zips (`darkcloud.zip` as
ps2-darkcloud, `ffx.zip` as ps2-ffx — no `ps2-darkcloud`/`ps2-ffx`
directories existed, the task said to use what exists). Genesis (VGM) had no
rip corpus under `/tmp/claude-501/rips/` and is not covered here. Total wall
time for the sweep: about 77 minutes, almost all of it N64 (each N64 set
renders a one-note sample per instrument group to measure sounding-pitch
offsets, which is real DSP work, not I/O).

Every fact below is read straight off `tools/import-set.mjs`'s own capture
log for each set — status per track (`ok`/`silent`/`failed`), note count,
capture length, loop info, and the app's own `⚠` warnings. Nothing here is
a guess at cause beyond what a log line or a source-read of index.html's
`CHIPS` table states outright; where I don't know the cause I say so.

## Summary table

| Console | Sets attempted | Sets refused outright | Songs listed | Captured ok | Individual capture failures | Silent (engine-flagged) | Empty/near-empty (0-2 notes) |
|---|---|---|---|---|---|---|---|
| NES | 21 | 5 | 465 | 451 | 0 | 14 | 37 |
| Game Boy | 9 | 0 | 318 | 318 | 0 | 0 | 0 |
| SNES | 10 | 0 | 642 | 641 | 0 | 1 | 3 |
| PS1 | 6 | 0 | 471 | 471 | 0 | 0 | 0 |
| N64 | 8 | 0 | 940 | 875 | 65 | 0 | 4 |
| PS2 | 2 | 0 | 151 | 151 | 0 | 0 | 16 |
| **Total** | **56** | **5** | **2987** | **2907** | **65** | **15** | **60** |

("Sets attempted" counts every zip/directory run, including the 3
expansion-chip NES games and 2 mp3-only zips that were refused before any
track was listed, hence 0 songs for those 5.)

CHIPS render path (console audio), read-only from index.html's `CHIPS`
table and confirmed against the files on disk:

| Console | Chip kind | Render module | Exists |
|---|---|---|---|
| NES | nsf | tools/nsf/apu-render.mjs | yes |
| Game Boy | gbs | tools/gbs/apu-render.mjs | yes |
| SNES | spc | tools/spc/apu-render.mjs | yes |
| Genesis | vgm | (none) | **no — synth only, "No renderer yet" per the code comment; not exercised in this sweep** |
| PS1 | psf | tools/psx/spu-render.mjs | yes |
| PS2 | psf2 | tools/psx/spu-render.mjs (shared with PS1) | yes |
| N64 | usf | tools/n64/render.mjs | yes |

## Problem class: sets refused outright (5)

All five are the app's own `parseNSF`/picker refusing before any track was
listed — no silent synth fallback, each with a sentence naming the reason,
matching the RELEASE GATE's requirement ("Every unsupported case must fail
with a sentence that names the chip/driver, never a silent synth
fallback"):

- `nes/gimmick.zip` — "expansion sound chip Sunsoft 5B not supported"
- `nes/just-breed.zip` — "expansion sound chip MMC5 not supported"
- `nes/lagrange-point.zip` — "expansion sound chip VRC7 not supported"
- `nes/smb3-mp3.zip`, `nes/zelda-mp3.zip` — these are mp3 rips, not chip
  files ("no chip-music file recognized among N files"). This is
  `tools/import-set.mjs`'s own message, not the in-app picker's — the
  script only drives the chip-import path, so it doesn't try the picker's
  separate "streamed audio" or "import as audio tracks" branches the way
  the real UI would. Not a chip-music regression; these two zips aren't
  chip-music sets at all.

## Problem class: individual capture failures (65, all N64)

Two distinct, verified causes:

**"name taken" slug collisions (49 tracks, 3 games)** — when two different
songs in the same set carry the identical display title, the second one's
capture fails outright rather than landing under a disambiguated name:
- `oot`: 20 tracks, all "Hyrule Field" (#89–#108 in listing order)
- `n64-banjo-kazooie`: 18 tracks, all "Gruntilda's Lair (Normal)" and its
  per-area variants ("Gruntilda's Lair (Aquatic)", "... (Treasure Trove
  Cove)", etc.)
- `n64-donkey-kong-64`: 11 tracks — "Jungle Japes" (dup), "Creepy Castle
  Dungeons" (dup ×2), "Boss Unlock" (dup), "Unknown" (×7)

This is real data loss on real rips: every one of those 49 songs is simply
missing from the captured set, with no indication in the roll that
something was dropped short of reading this log. Not investigated further
(I did not read the code that builds the draft key from the title).

**Sequence-less song IDs, correctly refused with a named reason (16
tracks)**:
- `mm` (Majora's Mask), 15 tracks — "this song plays no sequence: the
  game's word is 0x801f9d14 (the ocarina / sound-effect path, not a music
  sequence)" — the game's 14 playable ocarina songs plus "Song of Frogs".
- `n64-banjo-kazooie` #252 "SFX Rare & Nintendo Logo (without Music)" —
  "song 14 of the game's 173 is not in this rip (its ROM pages were never
  read: the mini may play sound effects only)".

Both of these are correct, named refusals per the same CLAUDE.md policy —
not a bug, and not silent.

## Problem class: silent songs (15, engine-flagged `st: "silent"`)

The app's own capture engine marks these `silent` (a distinct status from
`ok`), not something I inferred from a 0-note count:
- `nes-legend-of-zelda` #14–#20 (7 tracks; these are unnamed slots — no
  m3u was picked with this loose .nsf, so titles show as `track-NN`)
- `nes-mike-tysons-punch-out` #69–#75 (7 tracks, all `(se) ...` sound
  effects: "Crowd Noise", "Opponent Laughing Out Loud", etc.)
- `snes-final-fantasy-vi` #79 "Rumbling"

All 15 are named as sound-effect or otherwise non-musical slots by their
own titles (where a title exists) — consistent with legitimately silent
NSF/GBS/SPC subsong slots, not a capture regression. Not investigated
further per track.

## Problem class: empty/near-empty songs, 1-2 notes (60)

By console: NES 37, SNES 3, N64 4, PS2 16 (0 in Game Boy/PS1).

- 30 of the NES 37 are `nes-mike-tysons-punch-out` `(se)` sound-effect
  slots (1-2 notes each, 12 s captures) — same shape as the silent ones
  above, just not literally zero.
- 7 are `nes-legend-of-zelda`/`nes-super-mario-bros-3` unnamed slots
  (`track-NN`, no m3u picked) and one `snes-earthbound` "Giygas' Static"
  (0 notes) plus `snes-street-fighter-ii` "Fight!" and
  `snes-super-mario-world` "Nintendo Logo" (2 notes each — jingles).
- `n64-mm` #116 "New Wave Bossa Nova with Lulu": 0 notes, and the log
  names why — `⚠ sound-shaping ops ignored: sequence runseq C4`. This
  song's sequence uses a `runseq` op the reader doesn't implement, so
  nothing gets captured. This is the one near-empty case in the sweep
  with an identified, specific cause rather than "it's a short jingle."
- The 16 PS2 `ps2-ffx` rows are all "Hymn/Hum of the Fayth ~ <summon>"
  tracks, 1 note each, 35-45 s — see "known-correct oddities" below.

## Problem class: missing loop (1803 of 2907 ok captures)

By console: NES 334/451, Game Boy 206/318, SNES 641/641 (100%), PS1
166/471, N64 399/875, PS2 57/151.

SNES's 100% is explained by the code itself, not a guess: `CHIPS.spc` is
marked `tagged: true`, and the comment on that entry says the loop scan is
deliberately skipped for SPC sets — "on the real Chrono Trigger set the
scan took 5-40 s per track... a 300 s retry doubled it" — so every SPC
capture uses the tag's stated length with no loop search at all. Every
other console's "no loop" count is a mix of genuinely loop-less
jingles/sound-effects and songs where the loop scan simply found nothing;
I did not listen to check which is which per song — that's Josh's ear, per
CLAUDE.md.

## Problem class: absurd lengths (34; >20 min or <1 s)

- **4 genuinely long PS1 Chrono Cross tracks**, not investigated further:
  `61 "Into a Time of Darkness"` 2314 s (38.6 min), `66 "Birds Ambience"`
  1349.8 s (22.5 min), `67 "Cave Ambience"` 3769.4 s (62.8 min),
  `68 "Cave Ambience 2"` 2314 s. These four are plain `.psf` files (not
  minipsf — no external `.psflib`, no length tag the others have), and
  their capture ran to a length nobody has checked against the real game.
  Worth Josh's ear or a closer read of the PSF tags before release.
- **30 sub-1-second N64 tracks**, all correctly named as one-shot sound
  effects or jingles by their own titles ("Collect Honeycomb", "Silver
  Coin 1"-"8", "Furnace Fun ... Question", "SFX ..."). Not a defect.

## Distinct warning texts (375 normalized categories; top ones by count)

Warning text varies per song (channel/instrument numbers, tick values), so
counts below are after stripping numbers. Most of these are the app's own
documented diagnostic annotations working as designed, not failures:

| Count | Category (normalized) |
|---|---|
| 799 | `ch # inst #: written an octave below what sounds — the roll shows the sounding pitch (+#)` |
| 653 | `ch # inst #: written an octave above what sounds — the roll shows the sounding pitch (-#)` |
| 471 | `AKAO header layout # (#x# bytes); tick clock #x# (# Hz) read from the driver code` |
| 389 | `song: the song's own file` (PS1 informational: the mini names itself as its own `_lib`) |
| 279 | `# notes carry pitch bends (the roll writes each landed pitch as its own note; the render bends the voice)` |
| 261 | `ch # inst #: written two octaves below what sounds — the roll shows the sounding pitch (+#)` |
| 228 | `# notes change volume while held (cc#; the render follows)` |
| 187 | `sound-shaping ops ignored: channel sound-shaping #x#` |
| 151 | `ch # inst #: written two octaves above what sounds — the roll shows the sounding pitch (-#)` |
| 148 | `no instrument table found: long notes decay to #% by their end (a guess)` |
| 104 | `this mini also sets # memory word the roll does not use (...): the roll plays every track of the song` |
| 82 | `song: song number # loaded by the song's file: block id #, index # in header-id order` |
| 81 | `tracks loop at different points: ...(the roll's loop is the song's)` |
| 66 | `tracks start their loop at different ticks (...); loop start is the latest` |
| 59 | `no time-signature meta in SQ: #/# assumed` |
| 55/52/… | `kit guessed from rhythm: I# → kick` / `→ snare` / etc. (many variants) |
| 20 | `reads the game's io ports (#×) — the game would steer this song` |
| 18 | `# of the song's # bytes are not in the rip (the game never read them while it was ripped); the roll plays what is there` |

None of these were investigated for correctness beyond what the sentence
itself states; they're the capture engine narrating its own known
approximations (sounding-pitch offsets, drum-kit guesses, tempo/meter
defaults, multi-track loop disagreements), each already documented in
index.html's comments near the code that produces them.

## Known-correct oddities

- **FFX "The Prelude" (`ps2-ffx` #2)**: captured as 1 note, 48.1 s. This
  matches the closed open-items entry exactly ("The song IS one note...
  about 35 s of PS-ADPCM... the harp arpeggio is a recording inside the
  sample, not sequence data"). Confirmed by this sweep, not just asserted.
- **The other 15 `ps2-ffx` "Hymn of the Fayth ~ <summon>" / "Hum of the
  Fayth (...)" tracks**, 1 note each at 35-45 s, have the identical shape
  (one very long held note) as the confirmed Prelude case. I have not
  individually verified these are also single recorded samples — flagging
  as *likely* the same class, for Josh to confirm by ear, not asserting it.
- **Expansion-chip NES refusals** (Gimmick/Sunsoft 5B, Just Breed/MMC5,
  Lagrange Point/VRC7): expected, and each names its chip, per plan.
- PS1 "Anxious Heart" (`ff7` #104) and "You Can Hear the Cry of the
  Planet" (`ff7` #318) captured cleanly in this sweep with no thrown
  error — consistent with the fixes already landed 2026-09-27 (per-note
  gain breakpoints, pitch-slide splitting). I did not listen to either;
  that fix was already confirmed by Josh's ear per open-items.

## Not investigated

- Whether the "name taken" collisions are specific to N64 or a general
  capture-pipeline gap (I didn't read the code that builds draft keys).
- The actual audio content of any captured song (no ear checks were done;
  this is a read-of-the-log-and-code sweep only, per the task).
- The cause of the 4 long Chrono Cross "Ambience"/"Time of Darkness"
  lengths.
- Genesis/VGM: no rip corpus was available under `/tmp/claude-501/rips/`
  for this sweep.
