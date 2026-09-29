# PS2 import — what's supported

Milestone 1 (container + note extraction, 2026-09-28) is docs/plans/ps2.md
§8 "Findings". This is milestone 2 (app wiring + chip audio, same day):
a PS2 set imports in the app exactly like a PS1 set — notes in the roll,
the console's own SPU2 sound where the driver is Sony's stock SQ/HD/BD.

## 1. What plays, what doesn't

- **Sony's stock driver (SQ + HD/BD, "CSL")** — the format every real Dark
  Cloud song uses, picked per-song from the mini's own `psf2.ini`
  (`-s=/-h=/-b=`, no per-game table). Notes AND chip audio. Confirmed on
  all 59 real Dark Cloud `.psf2` files.
- **Square Enix's own driver ("BGM"/"WD", Final Fantasy X and kin)** —
  identified (a mini carrying a `.bgm` file), refused at import with a
  named sentence: *"Square's PS2 sequence format (BGM/WD) is not supported
  yet."* Its opcode table is NOT AKAO-descended (docs/plans/ps2.md §8
  corrected the plan's own guess here) — a second reader, from scratch,
  is milestone 3's biggest item.
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
- `files`: `ps2/psf2`, `ps2/sq`, `ps2/hd`, `ps2/capture`, plus the PS1
  modules the SQ/HD path reuses unmodified — `psx/vab`, `psx/notes`,
  `psx/spu-render`. `shared`: `sounding`, `note-preview` (the same tap-to-
  hear + sounding-pitch-probe helpers every sequence chip loads).
- `capture` mirrors `CHIPS.psf.capture` almost line for line: build the
  merged PSF2 filesystem (`loadPSF2Chain`/`mergePSF2` — a virtual-
  filesystem merge, not PS1's flat-RAM overlay), call `ps2Song()`, then
  the SAME bar/beat/loop math PS1's capture uses (identical because
  `result.seq` is SEQ-shaped either way — tools/ps2/sq.mjs's own header
  comment). A `bgm-unimplemented` result throws the named sentence above,
  before any MIDI is written.
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

## 5. What milestone 3 needs

1. **Square Enix's BGM/WD reader** — a second, unrelated opcode table
   (VGMTrans's `SquarePS2Seq.cpp`: 0x10-0x1A note variants referencing a
   "previous key/velocity", 0x20 program change, 0x5C pitch bend, 0x08
   one-byte BPM — no AKAO-style degree/length-index encoding). Needed
   before Final Fantasy X/X-2/XII or Kingdom Hearts can be heard at all;
   the format is otherwise a straight, no-CPU-emulation parse exactly
   like SQ, per docs/plans/ps2.md §3.
2. **Instruments** — tools/instruments/ is another agent's territory this
   milestone; docs/plans/ps2.md §5 already argues VAG-in-HD/BD should
   need little beyond an HD reader template (tools/psx/vab.mjs's own
   tone-table reader is the closest match). NOT started here.
3. **The ear-check pass** (CLAUDE.md's release gate) — 3+ games, once BGM/
   WD exists so Final Fantasy X can be one of them; this is also the
   moment to settle §3's pan/rate findings against a real ear rather than
   only internal consistency, and to decide whether `PSX_SOUNDING_ON`
   should flip (for PS1 AND PS2 together — same flag).
4. **A second Sony-driver title beyond Dark Cloud** — every finding above
   came from ONE game; the panpot/rate fixes are strongly evidenced but a
   second `.SQ`/`.HD`/`.BD` title (this plan's own §7 open question,
   still open) would catch anything Dark Cloud's own authoring habits
   happen not to exercise (e.g. every real panpot value seen so far is
   comfortably within 0-127 — no byte has forced the signed/unsigned
   question to a real edge case yet).
5. **Ground truth** — still blocked exactly as PS1's is (a real Sony PS2
   BIOS dump for kode54's Highly Experimental / AOSDK's HLE core, plan
   §2/§4); until Josh has one, "internal consistency + ear" is this
   console's only verification path, same as PS1 today.
