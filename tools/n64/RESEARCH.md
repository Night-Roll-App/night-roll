# Nintendo 64 music import — research notes (2026-09-26)

Facts only; each claim names its source. Where a statement is an
inference from a tool's configuration rather than a documented fact it
says so. Nothing here has been run against a real ROM yet — see
`INTEGRATION.md` for what that would take and `seq-libultra.mjs` for the
prototype parser this research produced.

## 0. Why the N64 is not the NES

The NES pipeline works because every NES game's music ends up as writes to
the same five APU registers; emulate the CPU, log the writes, and the notes
fall out with channel identity intact. The N64 has no sound chip. Audio is
software: the RSP (a vector coprocessor) runs an "audio microcode" that
mixes PCM sample buffers under CPU control. What reaches the hardware is
already-mixed 16-bit stereo PCM — the note level exists only as data
structures inside each game's own audio library. There is therefore no
console-wide register log to reconstruct from; notes must come from the
sequenced music format each game ships, and there are several.

## 1. USF / miniUSF — the playback format

**What it is.** USF ("Ultra 64 Sound Format", Adam Gashlin / hcs) is a
PSF-family container. Facts from the spec (hcs64.com/usf/usf.txt):

- PSF version byte `0x21`.
- The reserved section holds, in order, an optional **SR64 sparse ROM
  image** ("stored as little endian 4 byte words", chunks of
  `length, offset, data` until a zero-length chunk) and an optional
  **Project64 v1.4 save state** (CPU/FPU/COP0 registers, RDRAM, RSP
  DMEM/IMEM, all hardware register banks).
- Sets are usually many `.miniusf` files plus one `.usflib` referenced by
  a `_lib` tag; the lib carries the code and sample data common to all
  songs, the mini carries per-song differences.
- Tags `_enablecompare` (Count/Compare exception handling) and
  `_enableFIFOfull` (audio FIFO timing) tune the emulation per game.
- The player emulates the **R4300 CPU and the RSP**. 64th Note (the
  original Winamp plugin) was "based on Project64 1.6 by Zilmar and Jabo
  and Azimer's HLE Audio Plugin"; LazyUSF (kode54) is the maintained
  library core, "a minimal Nintendo (Ultra) 64 emulator library designed
  for the sole purpose of playing back music files in the USF or
  MINIUSF/USFLIB format".

Sources: https://hcs64.com/usf/ · https://hcs64.com/usf/usf.txt ·
https://github.com/kode54/lazyusf · https://www.vgmpf.com/Wiki/index.php?title=USF

**Honest assessment of note extraction via USF.** A USF rip is a ROM
fragment plus a CPU snapshot; playing it means running the game's own
audio thread. To get notes out we would have to (a) port or bind a MIPS
R4300 interpreter plus RSP audio-microcode emulation to the browser
(LazyUSF is tens of thousands of lines of C — feasible as WASM, but a
separate project several times the size of the whole NSF pipeline), and
then (b) still have no notes: the emulated output is mixed PCM. The only
note-level signal would come from hooking the game's sequence player in
emulated RDRAM (e.g. SM64's `gSequencePlayers` / note structs), which
requires per-game symbol addresses and differs per audio library. That is
strictly more work than parsing the sequence data directly, with the
emulator as dead weight. Conclusion: USF is a listening format, not an
extraction format. It could serve one purpose later — audition audio for
an imported song without decoding banks ourselves — but not for notes.

## 2. What games actually sequence with

### 2a. Nintendo EAD's sequence player ("Audioseq" / Music Macro Language)

Nintendo's own in-house engine, not the SGI SDK library. seq64's README:
"Audioseq is a proprietary format for sequenced music commands, developed
by Nintendo in the mid-1990s for their N64 development kits, and was used
as the primary music format in several first-party N64 games, including
Super Mario 64, Mario Kart 64, and the two Zelda games." The sm64 decomp
calls the files `.m64` ("similar to MIDI, but Turing complete" —
sound/README.md); the oot/mm decomps call them `.seq`/aseq and assemble
them from `include/audio/aseq.h` macros.

Games (seq64 README, plus SubDrag's gameconfig `EADMario`/`EADStarFox`/
`EADZelda`/`Yaz0EADZelda`/`Yay0Sng` buckets): Super Mario 64, Wave Race 64,
Mario Kart 64, Star Fox 64 / Lylat Wars, F-Zero X, Yoshi's Story, 1080
Snowboarding, Ocarina of Time, Majora's Mask, Pokémon Stadium 1 & 2,
Animal Crossing / Doubutsu no Mori.

**The format, from the sm64 decomp (`src/audio/seqplayer.c`,
`internal.h`, `data.c`, `heap.c`):**

- Three script levels, each an independent play head: the **sequence**
  script (one), **channel** scripts (up to 16, `CHANNELS_MAX`), **layer**
  scripts (up to 4 per channel, `LAYERS_MAX`; each layer is monophonic).
  The sequence starts channels (`0x90|ch addr`), channels start layers
  (`0x90|layer addr` in SM64, `0x88|layer` in OoT/MM), layers play notes.
- **Timing:** `TATUMS_PER_BEAT 48` — 48 ticks per quarter note. Tempo is
  set in BPM by sequence command `0xDD n` (`0xDC ±n` adds). The tick clock
  is derived from the audio update rate: `gTempoInternalToExternal =
  updatesPerFrame * 2880000 / 48 / 16.713` ("in practice 300 on JP and
  14360 on US"), so ticks run at bpm·48/60 per second to within the
  16.713 ms frame approximation (~0.3 % fast). **There is no time-signature
  command** — meter is not carried in the data at all; only tempo is.
  (seq64's old V1 wiki says 24 ticks per quarter; the decomp constant and
  seq64 V2 say 48. The prototype uses 48.)
- **Delays** are ticks, encoded as a "compressed u16": one byte if < 0x80,
  else `0x80|hi, lo` (`m64_read_compressed_u16`).
- **Notes** (layer script, opcodes 0x00–0xBF): the low six bits are the
  semitone (0–63); the top two bits pick the argument shape. With
  *large notes* on (channel `0xC4`): `0x00|n delay vel gate`,
  `0x40|n delay vel` (gate 0), `0x80|n vel gate` (reuses last delay).
  With *short notes* (`0xC3`, the default): `0x00|n delay`, `0x40|n`
  (uses the layer's default delay, `0xC3 d`), `0x80|n` (last delay);
  velocity and gate come from layer state set by `0xC1 v`/`0xC9 g` or
  from the sequence's 16-entry short-note tables via `0xD0|i`/`0xE0|i`
  (defaults `gDefaultShortNoteVelocityTable` / `...DurationTable`).
  `0xC0 delay` is a rest.
- **Pitch:** the final semitone is `note + seqTranspose + chanTranspose +
  layerTranspose` (`0xDF/0xDE` seq, `0xDB` chan, `0xC2` layer); values
  ≥ 0x80 silence the note. `gNoteFrequencies[k] = 2^((k-39)/12)`, i.e.
  semitone **39 is the sample's root pitch**, which by convention (seq64,
  the decomp banks) is middle C — MIDI = semitone + 21, before any
  per-instrument tuning. Instrument 0x7F selects the bank's **drum** list,
  where the semitone is a drum index, not a pitch.
- **Gate:** each note carries `delay` (ticks until the layer reads its
  next command) and a `gate` byte; the layer releases the note when the
  remaining delay ≤ `gate·delay/256`, so gate 0 = legato full length,
  0x80 = half. `0xC4/0xC5` (legato on/off) keep a note ringing across
  the next command.
- **Control flow**, shared by all three levels: `FF` end/return, `FD n`
  delay, `FE` delay 1, `FC addr` call, `F8 n`…`F7` loop (0 = 256),
  `FB addr` jump, `FA/F9/F5 addr` branch on the script's `value`
  (== 0 / < 0 / ≥ 0), `F6` break out of a loop. Addresses are absolute
  offsets from the start of the sequence file (`seqPlayer->seqData +
  u16`). Song loops are plain backward `FB` jumps, usually at the
  sequence level around a `FD` delay, so the loop point is wherever that
  jump lands.
- **Sequence-level:** `D7 mask` init channels, `D6 mask` free,
  `DB v` master volume, `D3/D4/D5` mute behaviour, `D2/D1 addr`
  short-note tables, `CC/C9/C8` value ops, `0x00|ch` test channel.
- **Channel-level:** `C1 inst` (`EB bank inst`), `C6 bank`,
  `DF vol`, `E0 volexp`, `DD pan`, `DC pan weight`, `DE freqscale`,
  `D3 bend`, `DA addr` envelope, `D9` release, `D7/D8/E1/E2/E3` vibrato,
  `D4` reverb, `D2` sustain, `C2 addr` dyntable + `C5/E4/0xB0|l`
  data-driven dispatch, `C7 v addr` **writes into the sequence bytes**
  (self-modifying — the sound-effects sequence relies on it).
- **Generations.** SM64 JP/US → SM64 EU/Shindou → Star Fox 64 / MK64 →
  OoT / MM. Later ABIs added relative branches (`F4 rjump`, `F3 rbeqz`,
  `F2 rbltz` — displacing SM64's `F2/F1` reserve-notes), remapped the
  channel low-nibble ops (OoT: `0x00|n` short delay, `0x20|ch` start
  channel, `0x88|l` ldlayer, `0x90|l` dellayer, `0x98|l` dynldlayer),
  and added `0xA0–0xBE` channel ops (filters, random velocity/gate
  variance, pointer arithmetic) plus layer `CD stereo`, `CE bendfine`,
  `CF release`. mm's `audio_seqplayer.c` documents these with an
  args-size table per opcode. seq64 ships binary-accurate ABI definitions
  for SM64, SM64 EU, SF64 (= MK64), OoT; MM music plays with the OoT ABI.

**Where the data lives (sm64 decomp `load.c`, `libaudio.h`):** three ROM
blobs, each indexed by an `ALSeqFile` header — `s16 revision; s16 count;
{u32 offset; u32 len}[count]` with offsets relative to the blob:

- **Audioseq** (`sound/sequences.bin`): the sequence scripts, one entry
  per song; SM64 sequence 0 is the sound-effects sequence.
- **Audiobank** (`.ctl`, `sound_banks/*.json` in the decomp): per bank a
  relocatable pointer table of `Instrument {loaded, normalRangeLo,
  normalRangeHi, releaseRate, envelope*, low/normal/high AudioBankSound}`
  (three key regions, each `{sample*, f32 tuning}`), `Drum {releaseRate,
  pan, loaded, sound, envelope*}`, `AudioBankSample {…, sampleAddr,
  AdpcmLoop*, AdpcmBook*}`, `AdpcmLoop {start, end, count, state[16]}`,
  `AdpcmBook {order, npredictors, s16 book[8·order·npredictors]}` — the
  VADPCM predictor codebook. Pointers are stored as offsets and patched
  at load (`patch_audio_bank`).
- **Audiotable** (`.tbl`): raw VADPCM sample data. 9-byte frames encode
  16 samples (4-bit residues + scale/predictor header); decoding needs
  the bank's book.
- A **bank-set table** (`gAlBankSets`) maps each sequence to its list of
  banks (`u16 offset[seq]` → `count, bankIds…`, listed backwards).

OoT/MM use the same three blobs with 16-byte table entries
(`romAddr, size, medium, cachePolicy, 3×u16`) and a sequence→font table;
their files are Yaz0-compressed in the ROM (SubDrag's `Yaz0EADZelda`);
Pokémon Stadium's are Yay0 (`Yay0Sng`). The sequence bytecode itself is
never compressed — "compressed" in tool names refers to these wrappers
or, for the SGI library below, to compressed MIDI.

### 2b. The stock libultra audio library (SGI SDK, later "n_audio")

The other major family: Nintendo's official SDK `libaudio`, whose
sequence player takes **Type 0 Standard MIDI** (`alSeqPlayer`) or
**compressed MIDI** (`alCSPlayer`; `.cmf` from the `midicomp` tool —
running status plus loop meta events), packed into sequence banks
(`.sbk`) with `ALBankFile` instrument banks (`.ctl`/`.tbl` — the same
predictor-book VADPCM as above; the EAD structs are a relayout of these).
The N64 manual pages (ultra64.ca `alCSeqPlayer`) document the API.

Prevalence: SubDrag's N64 Midi Tool config (`gameconfigmidi.ini`, 1386
ROM entries including regional variants) files 532 entries under `Sng`
and 46 under `Midi`; the `Sng` titles are the third-party long tail
(Airboarder 64, Army Men, Asteroids Hyper 64, Batman Beyond, All-Star
Tennis '99, …). **Inference, not a documented fact:** `Sng` appears to
be SubDrag's name for the SDK sequence-bank path. Rare's games are on
this library too: the Banjo-Kazooie decomp carries
`src/core1/n_audio/n_csplayer.c` (the compressed-MIDI player) and
`include/n_audio/PR/n_libaudio.h`; Rare wrapped the data in their own
compressed asset containers (SubDrag types `BanjoKazooie`, `BanjoTooie`,
`DonkeyKong`, `GoldenEye`, `PerfectDark`), which is what seq64's README
means by "a Rare-specific sequence format which is completely different
from Music Macro Language" — different from EAD's, not from libultra.

Sources: https://github.com/n64decomp/banjo-kazooie ·
http://ultra64.ca/files/documentation/online-manuals/man-v5-2/allman52/n64man/al/alCSeqPlayer.htm ·
https://github.com/jombo23/N64-Tools (N64MidiTool/Release/gameconfigmidi.ini)

### 2c. Factor 5 MusyX

Factor 5's cross-platform middleware (its own macro-driven synth, songs +
"macros" + sample directories). N64 titles reported to use it: Star Wars
Rogue Squadron, Battle for Naboo, Indiana Jones and the Infernal Machine,
007: The World Is Not Enough, Resident Evil 2, Gauntlet Legends, San
Francisco Rush 2049, Hydro Thunder, Tarzan, NBA Showtime, Polaris
SnowCross, Rugrats in Paris (misterfpga.org thread "Which games uses
MusyX?"). SubDrag handles them as `Factor5Zlb*` (zlib-wrapped, GC-style
headers; 34 entries). Least publicly documented of the families; the
GameCube MusyX tools and the Metroid Prime decomp are the nearest
references. Not a first target.

### 2d. Konami, Midway, EA and other in-house drivers

SubDrag's config also names `Konami` (74 entries: Castlevania 64 /
Legacy of Darkness, Goemon series, Hybrid Heaven, Nagano '98), `SSEQ`
(Midway: Doom 64, Quake 64, MK Mythologies, Cruis'n USA, Rampage),
`MIDx` (EA Sports), `TitusMidi`, `PaperMario`, `MarioParty`, plus games
that ship tracker modules (`ImpulseTracker`, `MultipartZLibXMFastTracker2`).
Each is a separate reverse-engineering job; the tool's source is the
documentation.

## 3. Open-source extractors to learn from

- **seq64** (Sauraen, GPL-3) — https://github.com/sauraen/seq64 .
  Converts EAD sequences among binary (`.com`/`.aseq`/`.m64`), assembly
  (`.mus`) and MIDI, byte-exact round trips for SM64/SF64/OoT. The ABI
  XML files (`abi/`) are the most complete opcode reference outside the
  decomps; V1's RomDesc files hold table addresses per ROM.
- **N64 Midi Tool / N64 Sound Tool / N64 Soundbank Tool** (SubDrag with
  Ice Mario; open source) — https://github.com/jombo23/N64-Tools . The
  per-game `gameconfig*.ini` files are a ready-made ROM→offset manifest
  for ~1400 ROM entries across all the driver families above; the C++
  converters are the reference for every non-EAD format. Known gap the
  authors state: the VADPCM encoder "uses hardcoded predictors" — the
  decoder side (which is all we need) is complete.
- **sm64 decomp** — https://github.com/n64decomp/sm64 :
  `src/audio/seqplayer.c` (the interpreter this prototype follows),
  `src/audio/load.c` (table/bank loading), `include/seq_macros.inc`
  (assembler macros), `sound/README.md`, `tools/` (aiff/VADPCM
  codebook tooling).
- **oot / mm decomps** — https://github.com/zeldaret/oot ,
  https://github.com/zeldaret/mm : `include/audio/aseq.h` (opcode
  names/values, assembler), `src/audio/lib/seqplayer.c` (MM: includes the
  per-opcode args-size table), `tools/audio/` (sample/bank extractors).
- **AudiobankToC** (Sauraen) — https://github.com/sauraen/AudiobankToC :
  EAD bank binary → C.
- **LazyUSF** (kode54) — https://github.com/kode54/lazyusf ; **64th Note**
  — https://hcs64.com/usf/ . For audition only (see §1).
- **Banjo-Kazooie decomp** — https://github.com/n64decomp/banjo-kazooie :
  `src/core1/n_audio/` is a readable n_audio (compressed-MIDI) player.

## 4. Recommended path for Night Roll

1. **EAD sequences first**, via a per-game manifest. Best documented
   (three decomps + seq64), ~15 first-party titles, and the catalogue
   Josh is likeliest to want (SM64, MK64, SF64, F-Zero X, OoT, MM). The
   manifest keys on ROM (byte-swapped to big-endian, hashed) and gives:
   Audioseq/Audiobank/Audiotable offsets, the sequence→bank table, the
   ABI generation, the wrapper (none / Yaz0 / Yay0), and track names.
   seq64's RomDesc files and SubDrag's ini are the seed data.
2. **Notes before sound.** The parser in `seq-libultra.mjs` already
   yields pitch/onset/duration/velocity/channel from the sequence alone.
   Two things need the bank: exact pitch (the +21 convention holds for
   nearly all melodic instruments, but a bank's `tuning` can shift a
   whole instrument) and drum naming. Both are additive.
3. **Then the stock libultra path** (compressed MIDI + `ALBankFile`),
   which is a MIDI parser plus a bank parser, unlocking the third-party
   long tail and, behind container unpackers, Rare.
4. **Skip USF** for extraction; revisit only as an audition source.
5. MusyX / Konami / Midway: only if a specific song is asked for.
