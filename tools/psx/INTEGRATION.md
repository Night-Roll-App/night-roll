# PS1 import — how it slots into Night Roll

Nothing in index.html changes on this branch. This is the plan for the
wiring, written against the code as it stands (function names are the
app's; line references will drift, names less so).

## 1. Byte-sniff in File → Import…

The picker handler (`#fileinput` change listener, "NSF import" section)
already sorts picked files by magic: `NESM\x1a` → `openNsfImport`,
`audioMagic()` → audio tracks, everything else → `parseMidi` (MThd
found anywhere). Three more sniffs, in the same `rest.filter` style:

| bytes 0..3 | file | route |
|------------|------|-------|
| `pQES` (70 51 45 53) | SEQ (u32BE at 4 == 1) or SEP (u16BE at 4 == 0) | `openSeqImport` |
| `pBAV` (70 42 41 56) | VAB or VH | bank for the SEQ import session |
| `PSF` + 0x01 (50 53 46 01) | PSF1 / minipsf | inflate, scan, then `openSeqImport` on what is found |

`tools/psx/{seq,vab,psf}.mjs` export `isSEQ`, `isVAB`, `isPSF` for
exactly this. `.VB` bodies have no magic; a picked `.vb` is recognised
by extension and by being picked together with a `.vh` (the same
"pick both together" rule the m3u playlist already uses).

A SEQ needs no bank to import — pitch is then the SEQ key as written,
which is right more often than not (RESEARCH.md §3). The panel should
say when no bank is loaded and let one be added later, re-deriving the
drafts, the way re-capture already overwrites NSF drafts.

## 2. The import session

Mirror `nsfSess`: `seqSess = {M, seq: parsed, vab, bytes, rows}`.
Modules load like `nsfModules()` — dynamic `import()` off Pages with the
`?v=` cache-buster, one code path with the CLI:

    import("./tools/psx/seq.mjs"), ("./tools/psx/vab.mjs"),
    ("./tools/psx/notes.mjs"), ("./tools/psx/psf.mjs")

(`notes.mjs` itself imports `../nsf/notes.mjs` for `pitchName` and
`../nsf/midi-write.mjs` for `trackBytes`; both are already served.)

Per row (one per SEP sequence; a SEQ is one row), the recipe is
`dump.mjs` minus the files:

    const seq = M.parseSEQ(bytes).sequences[i];
    const result = M.seqNotes(seq, {vab});
    const mid = M.makeMidi(result);                  // Uint8Array
    stash parseMidi(mid.buffer) as albums/imports/<slug>/track-NN.mid

What the SEQ gives that the NSF path had to fit: **tempo map, meter
map, program per note, exact ticks** — so no `fitBpm`, no snap gate,
no loop detector. The SEQ's own CC99 loop markers become the `loop:`
directive note (`seq.loop.start/end` in ticks → bar/beat via
`M.barBeat(seq, tick)`), same as `loopAnchor`/`loopTarget` today.
Bars are already right: `makeMidi` writes every time signature into
the conductor track, and the app's `parseMidi` returns `timesig` and
`tempos` tables (verified in the vm harness: the psx .mid parses to
`{ppq: 480, tracks: [ch 1 prog 0 ×6 notes, ch 2 prog 1 ×2], tempos,
timesig}`).

Naming: SEQ files carry no title; the row name defaults to the file
name (or `name-N` for SEP blocks) and the panel's rename-in-place
works unchanged. PSF tags supply `title`/`game`/`artist` when the
source was a PSF.

Commit is `commitImports` as-is: .mid + loop rollnotes + album.json +
manifest. album.json's `nsf:` vault block gets a sibling for PS1 data
(see §3) — or nothing, if chip playback is deferred.

## 3. Playback through the decoded bank (the "chip" equivalent)

The NSF path renders the console's own sound (`chipRender` →
`renderApu`) into per-channel `AudioBuffer`s. The PS1 analogue is a
**sample player**, not a register-log DSP, because the SEQ is a score
and the bank is samples:

1. `M.vagPcm(vab, i)` → `{pcm: Int16Array, loopStart, loopEnd, oneShot}`
   per VAG, decoded once per session, into 44.1 kHz `AudioBuffer`s
   (`buf.copyToChannel(Float32 pcm/32768)`; `loop = !oneShot`,
   `loopStart/loopEnd` in seconds).
2. Per note: the tone (`M.tonesFor(vab, program, key)[0]`) gives the
   sample and `center`/`shift`; `playbackRate = 2 ** ((key − center +
   shift/128) / 12)` — exactly the SPU pitch register in ratio form,
   so **no root-pitch estimate is needed for playback**; the estimate
   only serves the notation. `AudioBufferSourceNode.playbackRate` is
   linear interpolation where the SPU is 4-point Gaussian; close enough
   for auditioning, and the same coarseness the app's oscillator voices
   already accept.
3. Envelope: ADSR1/ADSR2 are SPU register words (RESEARCH.md §5 has
   the bit layout); a `GainNode` with linear/exponential ramps derived
   from attack/decay/sustain/release shifts. First cut: attack from
   ADSR1, release from ADSR2, ignore sustain rate.
4. Volume/pan: tone `vol`, program `mvol`, `masterVol`, CC7/CC11 per
   channel, `pan`/CC10 → a `StereoPannerNode`. Reverb (`mode 4`)
   skipped.
5. Schedule from the note list, not from the MIDI, so the loop and the
   tempo map are honoured for free: `secondsAt(seq, tick)` is the
   clock; mute/solo per channel maps to per-channel gain, as the chip
   buffers do today. The transport's tape-style speed slider becomes a
   tempo scale (pitch does NOT follow — that is a difference from the
   NSF chip mode and the right one for a score).

Where the bytes live: like the NSF vault, the VH/VB (and SEQ) are game
data and stay out of the public songs repo — session → IndexedDB
(`ff1roll` store `audio`-style, keyed by slug) → the private archive
repo. album.json would carry `psx: {seq: "<file>", vab: "<file>",
tracks: {<base>: {seq: n}}}` beside `nsf:`.

Time to build: two evenings for the sample player without envelopes,
one more for ADSR. It is smaller than the 2A03 DSP was.

## 4. PSF

What `psf.mjs` does today: parse the container (header, tags, CRC,
`_lib` list), inflate the EXE (Node zlib in the CLI; the browser passes
its own inflate — `new Response(new Blob([bytes]).stream()
.pipeThrough(new DecompressionStream("deflate"))).arrayBuffer()`),
read the PS-X EXE header, and **scan the image for `pQES`/`pBAV`**.
libsnd-based games (Sony first-party, most licensed titles that did
not write their own driver) keep the SEQ and the whole VAB verbatim in
RAM, so for them a PSF is just a SEQ import with an odd wrapper and
`dump.mjs` already handles it. A **minipsf** needs its `_lib` picked
alongside (the bank is usually in the lib, the SEQ in the mini):
scan both images, take the SEQ from the mini and the VAB from
whichever has it. The panel should ask for the lib by name from the
tag.

What it does not do: play anything. When the scan finds no SEQ, the
driver is not libsnd (AKAO/Square, Konami, Capcom, Namco …) and the
options are a format-specific parser (VGMTrans has readers for several
— porting one is a day or two each and stays emulation-free) or the
R3000 + SPU logger. That logger is costed in RESEARCH.md §5: an R3000
interpreter with interrupts, a BIOS HLE, DMA, the SPU register file
and ENDX tracking; then note reconstruction by KON/KOFF with the
SNES-style root-pitch problem for pitch, tempo and meter *fitted* as
the NSF path fits them because the log has neither. Multi-week,
comparable to the whole NSF pipeline plus its DSP. Start it only for a
named soundtrack that neither the SEQ scan nor a ported parser reaches.

## 5. Shipping checklist items this would touch

- Help sheet: the Import entry gains "PS1 SEQ/SEP (+VH/VB or VAB), PSF
  (libsnd games)"; drift keyword in `tests/night-roll.test.mjs`.
- NIGHT-ROLL.md: a "PS1 import" paragraph next to "Import" and "Chip
  audio"; WEB-SESSION.md: `node tools/psx/dump.mjs` beside the NSF
  dumper (it writes the same `.notes.txt` shape).
- Tests: `tests/psx.test.mjs` already covers the pipeline; the
  in-app wiring gets a vm test that feeds `makeTestSEQ()` bytes through
  the picker path, as the NSF import has.
- Approximations to state in the panel, not hide: with a bank, notated
  pitch depends on the sample-root estimate (marked "detected" or
  "C4 assumed" per program in the .notes.txt); kits are detected by
  shape (several one-key tones) and can be forced per program; pitch
  bends are counted, not applied.

## 6. Real rips (2026-09-27)

Josh's authorisation: "go out and download all those other games from
the web and try to import them". Set: **Final Fantasy VII** (PSF),
Zophar's Domain, `https://www.zophar.net/music/playstation-psf/final-fantasy-vii`
→ `Final Fantasy VII (EMU).zophar.zip` (835 KB). Rip bytes stayed in the
session scratchpad; nothing under `rips/` is in the repo. Everything
below was measured on those files; the synthetic reproductions live in
`tools/psx/make-test-seq.mjs` and the tests in `tests/psx-real.test.mjs`.

### Set shape

- 90 `.minipsf` (0.6–4.8 KB each) + one `Final Fantasy 7.psflib`
  (700 KB). No `.m3u`, no readme. Names are `NNN Title.minipsf` with
  disc-track numbering (101…123, 201…221, 301…323, 401…418, 901); a few
  carry suffixes (`102a`/`102b`, `305a`/`305b`, `412a`/`412b`/`412c`).
- Tags (Neill Corlett, 1997 rip): `utf8=1`, `_lib=Final Fantasy 7.psflib`,
  `game`, `artist=Nobuo Uematsu`, `psfby`, `year`, `copyright`,
  `volume=1`, `title`, `length` (`m:ss`, no fraction), `fade` (whole
  seconds), `genre=RPG`, sometimes `comment`. Key order varies file to
  file. The lib's `comment` is two `comment=` lines (parsePSF joins
  them with `\n`). Reserved area size 0 in every file; CRCs all match.
- **Lib chain**: every mini names the one lib; the lib names none.
  Load order (Corlett): lib first, mini on top. The lib's PS-X EXE is
  text `0x80010000 + 0x1E0000` (driver + sample bank), entry PC
  `0x800110C0`. Every mini's EXE is text `0x801D0000 + 0x8000` — **inside
  the lib's span** — with a placeholder PC `0x80010000`. So the RAM
  image is lib, then the mini overwriting one 32 KB page of it, and the
  entry point is the lib's. `psf.mjs` now has `loadPSFChain` +
  `assembleRam` for exactly this. One exception: `416 One-Winged
  Angel` is text `0x801C0000 + 0x18000`; the extra 64 KB below the
  sequence is zeros but for a `01 00 00 00` at `0x801C0000` — a flag the
  driver reads (the battle-instrument overlay), not sequence data.

### Sequence format: AKAO, not SEQ

`scanMagic` finds **0 SEQ, 0 VAB** in every mini and in the lib (RAM
scan of the assembled image, too). Each mini's text starts with `AKAO`:
Square's own driver format. Layout as measured (matches VGMTrans's
"version 1.0" and the Qhimm wiki):

    0x00  "AKAO"
    0x04  u16 song id        (0x60 Prelude, 0x23 Tifa, 0x0E Main Theme, 0x52 OWA)
    0x06  u16 length         (bytes after the 16-byte header)
    0x08  u16 reverb type    (1, 3, 4 seen; 2 on two jingles)
    0x0A  6 × BCD            yy mm dd hh mm ss — 1996-12-18 22:44:59 … 22:46:40
                             for 88 of 90 files (the export run), two
                             from 1996-11-29
    0x10  u32 voice mask     (bits 0..23; 0xFFFF = 16 voices, 0xFFFE0 =
                             voices 5..19, World Crisis uses all 24)
    0x14  u16 × popcount     per-voice offset, relative to the byte AFTER
                             the field
    then  one byte-code stream per voice; drum maps after the score

Opcodes: `tools/psx/akao.mjs` (`AKAO_OPLEN`), taken from VGMTrans
`AkaoSeq.cpp` (VERSION_1_0 event map) and the Qhimm page, then run over
all 90 songs: **no unimplemented opcode, no stream running off its end,
no event-budget overrun** — the byte lengths are right. Notes are
`degree × 11 + lengthIndex` (0x00..0x83), ties 0x84..0x8E, rests
0x8F..0x99, lengths `192 96 48 24 12 6 3 | 32 16 8 4` ticks at **48 per
quarter**; pitch = `octave × 12 + degree + transpose` (0xA5/A6/A7,
0xC0/C1), which VGMTrans treats as the MIDI key outright (FF7's
articulation table gives every instrument a per-degree base pitch with
unity at that key). Tempo 0xE8 is a u16 tick-accumulator increment;
`bpm = tempo × (33 868 800 / 8 / 0x43D1) / 65536 × 60 / 48` — see
RESEARCH.md §6 for why 0x43D1 and not the wiki's 0x44E8. Meter 0xFD is
`ticks-per-beat, beats-per-bar`. The song loop is an 0xEE jump back
into visited bytes, **one per voice**; 0xC8/C9/CA repeats nest four
deep and are unrolled.

What the real files do that a spec would not have told us:

- **Staggered loop starts.** The Prelude's three arpeggio voices are
  the same line 32 and 64 ticks apart (an echo): their jumps land 32/64
  ticks later. 35 of 90 songs stagger by a few ticks. One song loop for
  the app = latest start, one longest period long (that cut is seamless
  for every voice; the earliest start is not).
- **Nested periods.** `108 Lurking in the Darkness`: voice 1 is a
  96-tick drum ostinato looping forever under a 6336-tick form. Nine
  songs do this (periods 48…3072 under 1536…9216). Shorter voices are
  unrolled to the song loop, as the driver plays them.
- **Ties after rests and at repeat heads** (`c8 a5 04 86 …`): a tie
  with no sounding note just lets time pass — dotted rests, and "note +
  tie" written across the repeat boundary. 391 sites; not an error.
- **Tempo after an opening rest**: `316 Interrupted by Fireworks` sets
  tempo and 6/8 at tick 4 (after `a2 04 8f`); `414 Jenova Absolute` at
  tick 72, but one of its voices already sounds at tick 0. Before the
  first 0xE8 the driver runs at whatever the previous song left. Rule:
  a tempo/meter stated before any note belongs to tick 0; 414 keeps
  its warning and a 120 bpm assumption for 72 ticks.
- Ten songs (jingles, the ending) end with 0xA0 on every voice and do
  not loop: 203, 206 Waltz de Chocobo, 308, 410, 412a/b/c, 417 World
  Crisis, 418 Staff Roll, 901.
- Voice count outruns MIDI: World Crisis 24 voices, Staff Roll 20.

### Per-track results (`node tools/psx/dump.mjs "<mini>"`, lib beside it)

| track | id | voices | notes | tempo | meter | length → loop | app parse |
|-------|----|--------|-------|-------|-------|---------------|-----------|
| 101 The Prelude | 0x60 | 13 | 2836 | 81.49 | 4/4 | 53 bars; loop bar 17 b2.33 → 53 b2.33 (echo voices +32/+64 ticks) | 2836 |
| 105 Tifa's Theme | 0x23 | 13 | 536 | 81.49 | 4/4 | 49 bars; loops from bar 1 | 536 |
| 201 Main Theme | 0x0E | 16 | 2238 | 86.58, 11 tempo points (71.3 at bar 18, slide 83.5→74.4 in bar 70 …) | 4/4 | 124 bars; loop bar 19 → 125 | **2120** |
| 416 One-Winged Angel | 0x52 | 16 | 7842 | 120.2 | 4/4 with 7/8 (bar 21), 3/8 (bar 94) | 125 bars; loop tick 6648 → 23208 | 7842 |

Sanity that the numbers are music, not noise: the Prelude's voices
11–13 are the C-pentatonic arpeggio in 16ths (`C1 D1 E1 G1 C2 …` up
four octaves and back), 832 notes each, three voices 32 ticks apart;
One-Winged Angel's bass sits on E2 in 16ths under a 120 bpm 4/4;
Tifa's Theme's 9408 ticks at 81.49 bpm are 144.3 s, and Corlett's
`length=4:48` is exactly two passes — with the wiki's tempo constant it
would be 4:44. All 90 songs parse in ~100 ms total, zero crashes.

### Bugs fixed (regression tests in `tests/psx-real.test.mjs`)

- **dump.mjs scanned only the mini's own image** and never loaded the
  lib, so a minipsf could not be judged at all ("route B needed" for a
  libsnd game whose SEQ sits in the mini and VAB in the lib). Now:
  `loadPSFChain` → `assembleRam` → scan the whole image; lib found
  beside the file or via `--lib`; a missing lib is a named error
  (test: "dump CLI: a minipsf finds its lib beside it").
- **makeMidi channel bytes**: a melodic source channel 9 landed on GM
  drums, and channels ≥ 16 overflowed the status byte (`0x90 | 16 =
  0xA0`, poly aftertouch). Now channel 9 and voices past 15 take free
  MIDI channels, then share (test: "MIDI channels: …").
- **Mixed drum/melodic voices** (0xEC … 0xED mid-track) were written to
  one channel; the kit part now goes to its own channel-10 track
  (test: "AKAO score …", `ch 2 prog 16,17 kit`).
- AKAO reader itself (new): staggered starts, nested periods, ties
  without notes, late tempo — each has a test above.

### What remains approximate

- **Pitch is the written key.** FF7's INSTR.DAT gives each articulation
  twelve per-degree base pitches (`0x1000` = unity); VGMTrans derives
  `unityKey = 72 − coarse` from the C entry and its FF7 output is in
  tune, so the written key is the sounding note for melodic
  instruments. Kits (drum mode) and effect samples are not pitched. We
  do not read INSTR.DAT/INSTR.ALL from the lib yet (their RAM location
  is not in the AKAO header for this version; VGMTrans carries a
  per-game table), so no per-instrument confirmation.
- **Durations are written lengths**; the driver keys off 2 ticks
  early unless legato/slur. Tuning (0xD8/D9) is applied as cents.
  Since capture v2 (NIGHT-ROLL.md "PS1 capture v2") slides (0xA4),
  slur (0xCC) and portamento (0xDA) mark the notes the driver does not
  key on (CC84) and ride as pitch bend; ADSR overrides, reverb
  (0xC2/C3 × 0xEA/EB) and pan fades (0xAB) are written too.
  Vibrato/tremolo/pan LFOs and overlay/alternate voices are still
  ignored.
- **Velocity** is `master (0xA3) × volume (0xA8) / 127` at note-on,
  with 0xA9 slides interpolated; AKAO has no per-note velocity.
- **CPU-conditional jumps (0xEF)** follow VGMTrans: taken when the
  condition byte is 0. Songs the game varies at runtime (battle
  variants) read as their default form.
- Tempo slides are stepped every 6 ticks, not continuous.

### What File → Import in index.html would need (not done — another session owns it)

1. Sniff `PSF\x01` as today, then read `_lib` from the tags and ask for
   the lib **by name** when it was not picked along (`Final Fantasy
   7.psflib`, 700 KB, one file for the whole set — the m3u-style "pick
   both together" rule fits). Cache the inflated lib per session; the
   mini is 32 KB.
2. In the browser, inflate with `DecompressionStream("deflate")` and
   pass that as `inflate` to `loadPSFChain`; `assembleRam` needs 2 MiB
   per song, so assemble, scan, drop.
3. `scanMagic(ram)` → existing SEQ path; else `scanAKAO(ram)` →
   `parseAKAO` → `akaoNotes` → `makeMidi`; prefer the AKAO inside the
   mini's own text range (`ranges` from `assembleRam`).
4. **parseMidi's 32-bar tacet guard truncates FF7 tracks.** The Main
   Theme's voice 2 rests 41 bars (ticks 2496 → 10368 at 48 ppq); the
   guard (`notes[k].t - notes[k-1].t > 32 × 4 × ppq` → cut) drops 118
   of its 2238 notes on the way in. Imports need the guard off (the
   guard exists for corrupt ff1 files, and an import of our own bytes
   is not one of those), or the import should hand notes to the album
   directly rather than round-trip through the .mid parser.
5. Warnings from `result.seq.warnings` belong in the panel, not
   hidden (staggered starts, unrolled periods, the 414 tempo
   assumption).
6. Row naming from `tags.title`; album from `tags.game`; the tag
   `length` is Corlett's two-passes-plus-fade, not the loop.
7. Help sheet / HELP.md / drift keyword / NIGHT-ROLL.md "PS1 import"
   paragraph as §5 lists, adding "PSF (libsnd or Square AKAO: FF7)".

## Stereo (2026-09-28)

`renderSpu` returns each track as a pair `{l, r}`. AKAO opcode `0xAA` (one
operand) is the voice's pan, 0 left .. 127 right, recorded on every note
as `n.pan` at note-on (64 when never set); a kit entry pans by its drum-map
byte (`n.tone.pan`) — `notePan(n)` in notes.mjs. The law is the SPU's two
linear volume registers: left = level × (127 − p)/127, right = level ×
p/127, so l + r equals the old mono exactly (Bombing Mission, first 20 s:
0.00 dB on all 16 tracks; a centred note is −6 dB per side, −3 dB in
power). A pan change under a held note is not followed. `makeMidi` writes
CC10 at tick 0 and at each note whose pan differs.

## 7. AKAO generations, sample sets, SEQ/VAB render (2026-09-28)

The AKAO reader no longer assumes FF7. What a rip is comes from its bytes
(CLAUDE.md "No one-time hacks in capture engines"):

- **Header layout by shape** (`akaoLayout`): 1 = 0x14 bytes (FF7, SaGa
  Frontier: mask at 0x10, BCD timestamp at 0x0A), 2 = 0x20 (Parasite Eve:
  zero word at 0x1C, year+month stamp), 3 = 0x40 (FF8, FF9, Chrono Cross:
  zero words at 0x2C/0x38/0x3C, masks at 0x20 [+0x24/0x28 inside it],
  up to 32 score channels, offsets relative to the field, length counts
  the whole block, sample-set id at 0x14, key-split/drum tables at
  0x30/0x34). Layouts 2/3 move 0xE0.. behind an escape byte (0xFC / 0xFE);
  layout 3 spends 0xF0..0xFD on notes with an explicit length byte.
- **Tick clock from the driver code** (`detectTimerDiv`): the root-counter
  set-up `li a1, DIV` followed by `jal` (SetRCnt(0xF2000002, DIV, 0x1000)
  in every set here). 0x43D1 in FF7; 0x44E8 (240 Hz) in SaGa Frontier,
  Parasite Eve, FF8, FF9, Chrono Cross. A bare immediate is not enough — an
  FF8 image holds a stray 0x43D1 in its data. When the image has no driver
  the clock is the layout's default and the capture says **"assumed"**.
  The first capture warning always names both, e.g. `AKAO header layout 3
  (0x40 bytes); tick clock 0x44e8 (240.00 Hz) read from the driver code`.
- **Which block** (`pickAKAO(ram, ranges, fileName)` → `{offset, how}`):
  the one inside the song's own file; else, when the file only patched the
  driver with a load immediate (SaGa Frontier's 4-byte minis: `li a0, N`),
  index N in header-id order (N is 0-based, ids 1-based: 75 of 82 tag
  lengths within 10%; reading N as the id matches a scatter); else the
  first block, said so.
- **Instruments** (`akaoInstrContext` → `result.instr`, plain data, read
  with `akaoRecord(ctx, note)`): AKAO sample sets found by shape in the
  image (`scanAkaoSampleSets`) — 0x10-byte articulations {sample off, loop
  off, s16 fine, u16 unity, ADSR1, ADSR2} (FF8/9, CC), INSTR.DAT-shaped
  0x40 records with absolute SPU addresses (SaGa Frontier, Parasite Eve),
  or the 0x40 base-pitch shape (VGMTrans's 3.0; read, not met in these
  sets) — the header's set first, then the set highest in SPU RAM; else
  INSTR.DAT (FF7). Pitch for the 0x10 shape: rate = fine × 2^((key −
  unity)/12); verified by autocorrelation on FF8 Blue Fields and FF9 Vivi's
  Theme: measured root × fine = unity within 0.3 semitone for every tonal
  articulation (percussion and octave-ambiguous samples aside).
- **Key splits** (0xFC in 1.1, FC 14 in 2, FE 14 in 3): 8-byte regions; a
  key outside every region plays the nearest region above, the last past
  the top (VGMTrans extends the edges the same way).

Score fixes found on the real sets (regression tests in psx-real):
- `FE 0B` takes one operand byte (Chrono Cross, 122 uses: `FE 0B a3 97`);
  read with none, `a3` ran as a volume opcode and ate the rest after it.
- Loop break (`0xF1`, FC/FE 09) drops the repeat layer **only when it
  leaves**. VGMTrans drops it every pass, which pops a running repeat;
  SaGa Frontier's Koorong and FF8's Mods de Chocobo then met an unmatched
  0xC9 and ran into the header ("unimplemented opcode 0xff at 0x10").
  Mods de Chocobo's bass now plays its first/second ending, so its loop is
  two of the other voices' periods (tag/2-pass 0.54: the tagger timed the
  shorter period).
- A branch/break that jumps back before the repeat it leaves, into played
  bytes, is the song loop (SaGa Frontier's Koorong ends a voice that way).

### Per-game results (every PSF in each downloaded set; `scratch/psx-sweep.mjs`)

| Set | Driver | Captured | Renders | Tag vs 2 passes | Notes |
|---|---|---|---|---|---|
| FF7 (90) | AKAO layout 1, 0x43D1 | 90 | 90 (INSTR.DAT) | median 0.999, 78 within 3% | unchanged |
| SaGa Frontier (83) | AKAO layout 1(.1), 0x44E8 | 83 | 83 (sets, `instr` shape) | median 0.998, 70 within 3% | song picked by the mini's `li a0, N` |
| Parasite Eve (38) | AKAO layout 2, 0x44E8 | 38 | 38 (sets) | median 1.107 | tags run a flat +10–15 s over two passes (fade in the length): not a clock error — integer loop lengths (Musica Mundana 12.0 + 48.0 s); 2 files have an articulation outside the sets |
| FF8 (84) | AKAO layout 3, 0x44E8 | 84 | 84 (sets) | median 0.998, 68 within 3% | 0x3FFFFFFF masks (Balamb Garden, The Landing) |
| FF9 (108) | AKAO layout 3, 0x44E8 | 108 | 108 (sets) | median 0.999, 88 within 3% | 1 file with one missing articulation |
| Chrono Cross (68) | AKAO layout 3, 0x44E8 | 68 | 68 (sets) | median 1.113 | same flat +10–15 s as Parasite Eve (the tagger's fade); 2 files with a missing articulation |
| SotN (2 PSFs) | libsnd SEQ + VAB | 2 | 2 (VAB) | — | the rest of the set is .XA streams |
| FF Tactics | "smds" sequences (VGMTrans FFTFormat) | 0 | 0 | — | `no SEQ or AKAO music data in this file — a driver Night Roll cannot read yet` |
| Suikoden II | Konami KCET/KDT sequences + VAB banks | 0 | 0 | — | same message (VAB present, no SEQ) |
| Wild Arms | own driver; "pQES" + version ebf00101 (not a Sony SEQ) + VAB | 0 | 0 | — | the app's current path throws `SEQ: unknown version ebf00101`; `firstSEQ` skips it and the message becomes the no-data one |
| Mega Man X4 | none: CD-XA audio streams only (no PSF in the set) | — | — | — | nothing sequenced to read |

### SEQ/VAB render

`renderSpu(result, opts)` takes a SEQ capture with its bank —
`seqNotes(seq, {vab})`, `result.vab` carrying the parsed VAB and its body —
and needs nothing else (no `ram`, `table`, `bank`). Per note, every tone of
the program whose key range holds the key (layers), each: its VAG decoded
from the VAB body (loop by block flags), the SPU envelope from the tone's
ADSR1/ADSR2 (`adsrRecord`, the envelope model the AKAO path uses), rate
0x1000 × 2^((key − center + shift/128)/12) — shift is 1/128 semitone
(VGMTrans Vab.cpp: cents = shift × 100 / 128) — level = velocity × tone
vol × program vol × bank master vol × the channel's CC7 × CC11 (all /127,
linear as the SPU's volume registers), pan = 64 + the tone's, the
program's and the channel's CC10 offsets from 64, clamped, split by the
same linear law as AKAO. `seqNotes` now records CC7/CC11 as `n.chVol` and
CC10 as `n.pan` (so the MIDI's CC10 follows it too). Not followed: pitch
bend, vibrato/portamento fields, reverb.

### App-side contract (index.html CHIPS.psf, tools/chip-worker.mjs — not done here)

`render` stays `M.renderSpu(res.result, {sampleRate, onProgress, ram:
res.ram, table: res.table, bank: res.bank, keepSeconds: res.seconds})`.
What `run` must return:

- **AKAO**: `const pick = M.pickAKAO(ram, ranges, <the name given to
  loadPSFChain>)`; `const table = M.findInstrDat(ram)`; `result =
  M.akaoNotes(M.parseAKAO(ram, pick.offset), {instr: {ram, offset: table ?
  table.offset : null}})`; `bank = result.instr && result.instr.kind ===
  "instr-dat" ? M.findSampleBank(ram, table) : null`; refuse only when
  `!result.instr || (result.instr.kind === "instr-dat" && !bank)`; return
  `{result, ram, table, bank, seconds}`. `result.instr.kind ===
  "akao-sets"` renders from the sets and ignores table/bank. (Today the
  app refuses FF8/FF9/CC/Parasite Eve with `no instrument table or sample
  bank in this rip — synthesized voices` and plays every SaGa Frontier
  song as the lib's first block.) Push `pick.how` into the warnings.
- **SEQ/VAB**: `const f = M.firstSEQ(ram, found.seq)`; when `f &&
  f.parsed`: `result = M.seqNotes(f.parsed.sequences[0], {vab:
  found.vab.length ? M.parseVAB(ram.subarray(found.vab[0])) : null})`;
  refuse without a VAB; return `{result, seconds}` (ram/table/bank
  unused). Replaces `SEQ/VAB playback is not rendered yet — synthesized
  voices`.
- The capture path (`CHIPS.psf.capture`) should use `pickAKAO` and
  `firstSEQ` the same way, and pass `{instr: {ram, offset: table ?
  table.offset : null}}` so envelopes come from the sets.
- Module list unchanged (`psx/psf, akao, seq, vab, notes, spu-render`);
  spu-render and notes now import akao.mjs.
