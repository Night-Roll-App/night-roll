# PS2 import — what's supported

Milestone 1 (container + note extraction, 2026-09-28) is docs/plans/ps2.md
§8 "Findings". Milestone 2 (app wiring + chip audio, same day) added Sony's
stock SQ/HD/BD driver end to end. This is milestone 3 (same day): Square
Enix's own driver (BGM sequence + WD bank, Final Fantasy X and kin) now
gets the SAME treatment — notes in the roll, the console's own SPU2 sound —
through the exact same pipeline SQ/HD/BD already runs unmodified.

## 1. What plays, what doesn't

- **Sony's stock driver (SQ + HD/BD, "CSL")** — the format every real Dark
  Cloud song uses, picked per-song from the mini's own `psf2.ini`
  (`-s=/-h=/-b=`, no per-game table). Notes AND chip audio. Confirmed on
  all 59 real Dark Cloud `.psf2` files.
- **Square Enix's own driver ("BGM"/"WD", Final Fantasy X and kin)** —
  identified directly (a mini carrying a `.bgm` file, no ini needed).
  Notes AND chip audio, as of milestone 3 (`tools/ps2/bgm.mjs`,
  `tools/ps2/wd.mjs`). Its opcode table is NOT AKAO-descended (docs/plans/
  ps2.md §8 corrected the plan's own guess here) — a genuinely separate,
  much simpler opcode table (VGMTrans's `SquarePS2Seq.cpp`), cross-checked
  against all 92 real Final Fantasy X `.bgm` files by parsing every one to
  its own declared end with zero leftover bytes and zero unrecognized
  opcodes (§6).
- **Streamed-audio sets (no sequence data at all)** — Ico's Zophar pack is
  GENH-tagged (vgmstream's generic PCM/ADPCM wrapper), XIII's is Ubisoft's
  own SShd/SSbd stream container. Both are refused BY NAME at import
  (`streamedAudioMagic()`, index.html), before ever reaching a MIDI or
  chip parser: *"this is streamed audio, not note data …"*. Neither format
  could ever have shipped notes here regardless of driver-family work.

## 2. App wiring

`CHIPS.psf2` (index.html), modeled on `CHIPS.psf` (PS1) almost exactly:
- magic `"PSF"` + version byte `0x02`; ext `.psf2`; `perFile`/`tagged`/
  `keepBytes` — a mini per track + the set's `.psf2lib` persist like PS1's.
- `files`: `ps2/psf2`, `ps2/sq`, `ps2/hd`, `ps2/bgm`, `ps2/wd`,
  `ps2/capture`, plus the PS1 modules BOTH drivers reuse unmodified —
  `psx/vab`, `psx/notes`, `psx/spu-render`. `shared`: `sounding`,
  `note-preview` (the same tap-to-hear + sounding-pitch-probe helpers
  every sequence chip loads).
- `capture` mirrors `CHIPS.psf.capture` almost line for line: build the
  merged PSF2 filesystem (`loadPSF2Chain`/`mergePSF2` — a virtual-
  filesystem merge, not PS1's flat-RAM overlay), call `ps2Song()`, then
  the SAME bar/beat/loop math PS1's capture uses (identical because
  `result.seq` is SEQ-shaped either way — tools/ps2/sq.mjs's and
  tools/ps2/bgm.mjs's own header comments). `ps2Song()` never returns
  `bgm-unimplemented` any more (as of milestone 3) — the `if (song.kind
  === "bgm-unimplemented")` lines in index.html and tools/chip-worker.mjs
  are now dead code, left in place rather than removed (they simply never
  fire; docs/plans/ps2.md's own milestone-3 scope note: index.html gets
  no changes beyond the `files:` list above).
- Sounding-pitch offsets are held behind the SAME flag as PS1
  (`PSX_SOUNDING_ON`, still `false`) — no separate PS2 flag, per this
  milestone's own scope. Flip it (for both consoles at once) once Josh's
  ear confirms an octave on either.
- `CONSOLE_OF.psf2 = "ps2"` → `albums/ps2/<game>/`.
- File-input accept list + help sheet (`#helpsheet`'s File section) name
  `.psf2`/`.minipsf2`/`.psf2lib`, the BGM/WD gap, and the streamed-audio
  refusal in plain language. Drift keyword: "PlayStation 2".
- `tools/chip-worker.mjs`'s `RUNNERS.psf2` mirrors `RUNNERS.psf` (parse →
  `ps2Song` → `renderSpu`, no PS2-specific runner code); `previewOne`
  (tap-to-hear) works for PS2 the same way it does for PS1 — both are
  listed in the worker's `live` gate.
- `tools/package.mjs`'s `RUNTIME_ENTRIES` gained the four `ps2/*.mjs`
  modules (their own imports — `../psx/*` — are already listed).
- `tools/import-set.mjs` needed NO changes: it drives `CHIPS[kind]` and
  `CONSOLE_OF[kind]` generically. Verified on the real Dark Cloud set to a
  scratch `--out` dir (not published) — see §4.

## 3. Chip audio: reuse, not a fork

Per docs/plans/ps2.md §3/§4's own prediction, SPU2 chip audio needed NO
new render code: `ps2Song()` already folds an HD/BD bank into
`result.vab` (`seqNotes(seq, {vab: bank})`, tools/ps2/hd.mjs `toBank()`
reshaping it into the exact object `tools/psx/vab.mjs`'s `parseVAB()`
returns), so `tools/psx/spu-render.mjs`'s `renderSpu()` runs over PS2
Sony-format data with **zero PS2-specific branches** — same file, same
function, PS1's own tests unchanged (`tests/psx-render.test.mjs`,
`tests/psx-real.test.mjs` both still green).

**SPU2's two cores / 48 voices** (docs/plans/ps2.md §3): turned out to be
a non-issue — `renderSpu()` never modeled discrete hardware voices to
begin with (it's additive per-note synthesis, no voice-stealing
simulation), so there was nothing to double. Per-core reverb/routing is
still unmodeled, same as PS1's own reverb gap (spu-render.mjs's header
comment: "what is not [real] here: reverb (dry)").

**Two real, evidence-backed fixes found by rendering real Dark Cloud
audio** (not guessed — CLAUDE.md "no one-time hacks"):

1. **Per-VAG native sample rate.** Real Dark Cloud `.HD` files carry a
   genuine per-sample rate in `VAGInfoParam` (22050-44100 Hz across one
   set, not the one fixed 44100 Hz PS1's SPU always ran) — `hd.mjs`
   parsed it (`vagInfos[].sampleRate`) but `toBank()` dropped it, so every
   PS2 sample would have played at PS1's assumed 44100 Hz regardless of
   its own real rate. Fixed: `toBank()` carries it through as
   `vags[].rate`; `spu-render.mjs`'s `vabVoices()` now reads
   `vab.vags[t.vag].rate`, falling back to its own `SPU_RATE` constant
   when absent — PS1 VABs never set this field, so PS1 renders are
   provably unchanged (`tests/psx-render.test.mjs`/`psx-real.test.mjs`
   still green; a new regression test, `tests/ps2.test.mjs`, renders the
   SAME synthetic waveform with and without a `.rate` and confirms the
   two come out exactly one octave apart — 787.5 Hz vs 1575 Hz —
   demonstrating both that the fix works and what the bug would have
   sounded like).
2. **Pan double-offset.** `toBank()`'s first cut wrote
   `pan: 64 + split.panpot` / `mpan: 64 + prog.panpot`, treating the HD's
   panpot bytes as signed offsets-from-centre. Rendering real Dark Cloud
   audio end to end (scratch/ps2-app-render.mjs) came back silent on the
   LEFT channel for every note checked — because every real program's
   panpot byte reads **exactly 64** (a true per-program *offset* would
   default to 0, not a constant non-zero value) and split-level panpot
   values cluster symmetrically AROUND 64 across real songs (e.g.
   10/64/116), not around 0. These are the SAME absolute 0–127 values
   (64 = centre) `tools/psx/vab.mjs`'s own `tone.pan`/`program.mpan`
   already use with no added offset — so `toBank()` was double-applying
   the centre. Fixed: `pan: split.panpot`, `mpan: prog.panpot`, panpot
   reads switched from signed (`i8`) to unsigned (`u8`) throughout
   `hd.mjs` to match. A regression test (`tests/ps2.test.mjs`) pins
   panpot=0 → pan=0 (not 64). This is a genuinely new finding beyond
   VGMTrans's own field layout (which named the byte offsets correctly;
   the *meaning* of the value at that offset was the gap).

## 4. Verification (2026-09-28, no reference player — see §5)

`node scratch/ps2-app-render.mjs <dir> <song>` runs the APP's own
`CHIPS.psf2` path end to end (parseAsync → capture → parse → run →
render) in the vm harness, on real Dark Cloud files:

| song | notes | loop | tracks, all RMS > 0 | pitch checks (autocorrelation vs written key) |
|---|---|---|---|---|
| 01 Dark Cloud Main Theme (Broken) | 6084 | 43.4→19.4 | 8/8 (0.02–0.08) | 5/5 no clear period (a low, possibly percussive program) |
| 06 Open Your Eyes | 115 | 11.3→7.3 | 6/6 (0.01–0.08) | 4/5 no clear period; 1/5 measured 10 semitones below written (a very high, short note — C8) |
| 12 Battle!! | 273 | 21.4→5.4 | 3/3 (0.05–0.07) | 4/5 measured EXACTLY one octave below written (consistent, moderate confidence 0.66-0.67); 1/5 measured wildly high (a short percussive hit) |

Every track in every song produced real, non-silent audio (the pan bug
above is what made the FIRST attempt at this table come back all zeros —
left-channel-only RMS checks on hard-panned-right tracks). The pitch
checks are inconclusive on their own — `tools/psx/vab.mjs`'s own
`estimateRoot()` comment names its weak spot outright (an octave-down
alias: "2x period correlates as well as 1x"), and the consistent exact
-12-semitone reading on Battle!!'s program 2 across four different notes
matches that alias exactly rather than a rendering defect: the CONTROLLED
synthetic test in §3 (a known, clean square wave) already demonstrates
the rate math itself is exactly correct to <1%. Treat the real-file pitch
numbers as descriptive, not diagnostic, until an ear-check (§5) settles it.

Also ran: `node tools/import-set.mjs /tmp/claude-501/rips/ps2-darkcloud
--slug dark-cloud --title "Dark Cloud" --out <scratch dir>` (not
published) — 59/59 songs captured, `album.json`'s `nsf:` block came out
`{vault: "dark-cloud/", chip: "psf2", perFile: true, libs: [...]}`
with NO changes needed to `commitImports`/`chipVaultFile` (both are
already generic over `chip`/`perFile`/`libFile`); the archive-upload list
named 60 files (59 `.psf2` tracks + the shared `.psf2lib`) in the same
shape PS1/N64 sets use.

## 5. Milestone 3: Square Enix's own driver (BGM/WD)

`tools/ps2/bgm.mjs` (sequence) reads VGMTrans's `SquarePS2Seq.cpp` opcode
table directly — 0x10-0x1A note-on/off variants (some referencing a
"previous key/velocity", MIDI-style running state rather than SQ's
running-status byte), 0x20 program change, 0x22/0x24/0x26 volume/
expression/pan (mapped straight onto `seqNotes()`'s own generic CC7/11/10
handling), 0x5C pitch bend (standard MIDI lsb-then-msb order — and so is SQ's
0xE0: an earlier note here said hi-then-lo from VGMTrans's variable names,
but VGMTrans passes its `hi` as the `lo` parameter, and Dark Cloud's
at-rest bend is the bytes 00 40; fixed 2026-10-07),
0x08 one-byte BPM, 0x02/0x03 loop begin/end with NO count field at all
(VGMTrans's own C++ reader never actually uses these for looping — its
loop-tracking code is commented out, cosmetic UI labels only; this reader
assumes forever, the same sentinel PS1 SEQ/SQ use). One "channel" is one
TRACK (not a status-byte nibble); every track shares one tick clock, same
as a type-1 MIDI file. Two opcodes (0x29, 0x41) aren't in VGMTrans's own
table at all — found by testing every candidate operand length against
the two real files that use them (`110 Victory!.minipsf2`,
`201 Yuna's Theme.minipsf2`) until the WHOLE file parsed to its declared
end with zero leftover bytes: both take zero operand bytes.

`tools/ps2/wd.mjs` (bank) reads VGMTrans's `WD.cpp`: a self-contained file
(header, instrument pointer table, every instrument's key-split regions,
then one sample section of concatenated PS-ADPCM — unlike HD+BD's two
separate files). `toBank()` reshapes it into the same VAB-shaped object
`hd.mjs`'s `toBank()` produces, so it needs no separate render path
either. Two real bugs, found by rendering real Final Fantasy X audio end
to end (`scratch/ps2-app-render.mjs`), not by reading the format docs:

1. **Unity key must be read as a SIGNED byte.** VGMTrans's own field read
   implies unsigned; real FFX regions for higher key splits carry raw
   bytes past 127 (e.g. 230, 236) — read unsigned the derived unity key
   goes hugely negative, the note's pitch ratio explodes, and the voice
   decays to nothing within a handful of samples. Read signed, those same
   bytes land exactly on the top of their own region's key range (a
   plausible, intentional unity note). A whole track's RMS read `0.0`
   until this was found.
2. **Pan is `raw & 0x7F`, not VGMTrans's own `>127`-only formula.**
   WD.cpp's own conversion collapses every raw byte 0-127 to a flat
   centre and only treats 128-255 as real data. Measuring the pan byte
   across all 92 real FFX `.wd` files found genuine, varied values below
   128 too (0, 30, 40, 45, 50, 60, 70, 84, 90, 100, 110 — not just a
   default), and 128-255's own real values are IDENTICAL to 0-127's once
   the top bit is masked (128→0, 192→64, 255→127 — matching VGMTrans's
   own `>127` formula exactly). CLAUDE.md "the file wins": VGMTrans's
   own reader would have discarded real pan data.

One more bug lives in `tools/ps2/bgm.mjs` itself, not the format: a BGM
track past channel 15 that never sends its own 0x20 stayed `program:
undefined` in `seqNotes()`'s fixed `Array(16)` (which pre-fills only
channels 0-15 to program 0) — an undefined program renders silent
(`vab.programs[undefined]` is always falsy). `tools/psx/notes.mjs` stays
unmodified (this milestone's contract), so `bgm.mjs` now pushes an
implicit `program 0` event at tick 0 for every track, exactly the default
channels 0-15 already got; a real 0x20 later still overrides normally.
Caught on `410 Challenge.minipsf2` (37 tracks) — channels 30/31 read RMS
`0.0` until this was added.

Pitch bend (0x5C) is honored: `bgm.mjs`'s own `bgmNotes()` wraps
`seqNotes()` and turns each bend inside a held note into a `note.slide`
entry — the same representation `tools/psx/akao.mjs`'s pitch-slide
opcode already produces (`splitSlides()`/`renderSpu()` need nothing new).
Unlike AKAO's slide-BY-N-semitones opcode, a MIDI-style bend is already
an ABSOLUTE offset from centre, so each entry lands instantly (no ramp)
at that value — a real pitch-wheel glide is just many bend events in a
row, which this naturally reconstructs as a chain of snap points. The
slides (the roll's split, the console voice) use ±2 semitones. The real
range is opcode 0x5D (found 2026-10-07 in ffxpatch.irx's dispatch table;
NIGHT-ROLL.md "PS2 capture v2"), and the .mid's pitch bend uses it.
35 of 92 real FFX songs use 0x5C at least once.

## 6. Milestone 3 verification (2026-09-28, all 92 real Final Fantasy X songs)

`node scratch/ps2-sweep-ffx.mjs` (header sanity) and a full sweep through
the app's own `CHIPS.psf2` path (mirroring `scratch/ps2-app-render.mjs`,
one run per song): **92/92 parse, capture, and render with zero
failures.** 146,477 notes total; loop points found in 79/92 (the
remaining 13 either lack a loop-end marker in the file, or lack any loop
marker at all — a file fact, not a parser gap: `105c Other World
(Alternate 3).minipsf2` has a loop-begin with no matching end). Every
track in every song renders non-silent audio, with one caveat found and
confirmed a file fact, not a bug: 5 tracks (across 4 songs) render at
exactly RMS 0.0 because their own CC7 (channel volume) reads 0 for the
ENTIRE note at note-on time — the same "captured once at note-on, no
ramp" behavior the generic SEQ/SQ path already has (only AKAO's captures
carry a dynamic volume ramp, via `note.gain`); these channels are
genuinely silenced by the score's own automation, not by a rendering
defect.

Pitch: autocorrelation vs. the written key on ISOLATED notes only (no
other note on the same channel overlapping in time — additive synthesis
sums a whole channel's notes into one buffer, so a busy arpeggio
underneath a long bass note pulls the naive "just pick the longest note"
check toward the arpeggio's own repetition rate, a methodology trap, not
a render bug, confirmed by re-testing with polyphony excluded) — 14/14
isolated notes checked across 2 songs measured EXACTLY the written pitch,
confidence 0.95-0.99. As with milestone 2, no reference player exists
(the Sony BIOS-dump blocker, plan §2/§4), so this is internal consistency
only, not proof against a real decoder.

Unverified / still open:
- **Ground truth** — still blocked exactly as PS1's is.
- **The ear-check pass** (CLAUDE.md's release gate) — not run this
  milestone; Final Fantasy X can now be one of the 3+ games once it
  happens, alongside settling `PSX_SOUNDING_ON` (PS1 and PS2 share the
  flag) and this milestone's own pan/unity-key findings against a real
  ear.
- **Instruments** (tools/instruments/) — VAG-in-WD should need little
  beyond the WD reader this milestone already wrote (same as HD/BD);
  NOT started here, another agent's territory.
- **A second Square-driver title beyond Final Fantasy X** — every finding
  above came from one game; a second BGM/WD title (Final Fantasy X-2/
  XII, Kingdom Hearts) would catch anything FFX's own authoring habits
  happen not to exercise.
