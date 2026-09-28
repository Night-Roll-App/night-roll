# N64 import — what an in-app version would need

Companion to `RESEARCH.md` (what the formats are) and `seq-libultra.mjs`
(the prototype that turns one EAD sequence into notes). This is the gap
between that prototype and File → Import… accepting a ROM. index.html is
untouched by this branch; the hook points below are named so the work can
be scoped, not started.

Everything in `tools/n64/` except `dump.mjs` is browser-clean (no Node
imports), so it can be dynamically imported off Pages exactly like
`tools/nsf/{nsf,notes,midi-write}.mjs` — one code path for the CLI and the
app, as the NSF pipeline insists on.

## 1. ROM sniffing

- Accept `.z64` / `.n64` / `.v64`. The first four bytes give the byte
  order: `80 37 12 40` big-endian (native), `37 80 40 12` byte-swapped,
  `40 12 37 80` little-endian. Normalize to big-endian once; every table
  offset below assumes it.
- Header fields to key on: CRC1/CRC2 at 0x10, internal name (20 bytes at
  0x20), game code (4 chars at 0x3B: e.g. `NSME` = Super Mario 64 US),
  version byte at 0x3F. The manifest keys on game code + version, with
  CRC1/CRC2 as the confirmation — not on file names.
- ROMs are 8–64 MB. Read via `File.arrayBuffer()`; only the three audio
  blobs (a few MB) need to stay resident afterwards.

## 2. Per-game manifest

One JSON entry per supported ROM. Nothing below is filled in yet: no
address in this branch has been checked against a ROM, and the rule is
that numbers come from a verified source (the decomp's linker map for the
exact version, seq64's RomDesc XML, or SubDrag's `gameconfig*.ini`), then
get confirmed by reading the table and seeing sane entries.

```
{
  "code": "NSME", "version": 0, "crc": ["...", "..."],
  "title": "Super Mario 64 (US)",
  "abi": "sm64",                       // sm64 | oot (SF64/MK64: try sm64, then oot)
  "wrapper": "none",                   // none | yaz0 | yay0 (OoT/MM; Pokémon Stadium)
  "audioseq":   {"rom": 0x0, "len": 0x0},
  "audiobank":  {"rom": 0x0, "len": 0x0},
  "audiotable": {"rom": 0x0, "len": 0x0},
  "bankSets":   {"rom": 0x0},          // sm64 gen: gAlBankSets; oot gen: sequence-font table
  "tracks": [{"n": 1, "name": "Title theme"}, ...]   // seq 0 is SFX in SM64; names from the decomp's sequences.json
}
```

Seed set, in order of value: SM64 US, OoT 1.0, MK64 US, SF64 US, F-Zero X,
MM US. Each is a data entry, not code.

## 3. Table readers (new module, ~150 lines)

- **sm64 generation** (`ALSeqFile`): `s16 revision, s16 count`, then
  `count × {u32 offset, u32 len}`; offsets relative to the blob start.
  Bank sets: `u16 offset[seq]` into a byte array of `count, bankIds…`
  (listed backwards — the decomp's `0xC6` handler counts from the end).
- **oot generation**: 16-byte header (`u16 count, u16 medium, u32
  romAddr, pad`) then 16-byte entries `{u32 romAddr, u32 size, u8 medium,
  u8 cachePolicy, u16 ×3}`; entries with `size 0` alias another entry
  (`romAddr` is the index). Sequence→font table maps each sequence to its
  bank list. Yaz0: `Yaz0` magic, u32 decompressed size, LZ back-references
  — ~40 lines; Yay0 similar with split streams.
- Output: `{sequences: [{n, bytes}], banks: [...], samples: bytes}`, fed to
  `parseSequence(bytes, {abi})`.

## 4. Notes (already done) and what the bank adds

`parseSequence` gives pitch/onset/duration/velocity per channel and layer,
the tempo map, and the loop point — from the loop jump itself, which is
better than the NSF path's autocorrelation (no "no loop, doubling the
window" retries). Meter still comes from annotation; the format has none.

What needs the **bank** (`Audiobank`, relocatable pointer tables; the
decomp's `patch_audio_bank` is the reference):
- Instrument key regions (`normalRangeLo/Hi`) and per-region `tuning`.
  Caveat stated plainly: `tuning` is relative to the output rate, and the
  bank does **not** store the sample's own root pitch (the decomp keeps it
  in the AIFF, not the ROM). So the bank can flag instruments whose
  tuning departs from the +21 convention but cannot by itself prove the
  absolute pitch; the ear does that, as it did for FF1.
- Drum lists: drum index → sample; still no names. Kit names would be a
  hand-made manifest table per game.

## 5. Playback

Two tiers, mirroring NSF's "synth first, chip audio as the default when a
source resolves":

1. **MIDI through Night Roll's synth** — free once notes exist. Track per
   N64 channel, program = the N64 instrument id (meaningless to the synth
   until a manifest maps ids to something audible; a first cut can leave
   everything on one voice).
2. **Console voice** — decode the actual samples:
   - VADPCM (`n_adpcm` / the decomp's `vadpcm`): 9-byte frames = header
     byte (`scale << 4 | predictor`) + 16 nibbles; codebook from the bank's
     `AdpcmBook {order, npredictors, s16 book[8·order·npredictors]}`;
     loop points + `state[16]` from `AdpcmLoop`. ~150 lines, well
     documented in the decomp tools.
   - Per note: pitch ratio `2^((semitone-39)/12) · tuning` resampled from
     the sample's 32 kHz, the instrument's `AdsrEnvelope` pairs
     (`delay, arg` — arg is a level or a marker for hang/goto), release
     rate on note-off, channel volume/pan. Vibrato, portamento, reverb
     and the low-pass filters are sound polish, skippable for study.
   - Render per channel into buffers the way `apu-render.mjs` does, so
     mute/solo and the tape-style speed slider keep working.

## 6. App flow (parity with the NSF import, hook points only)

- Import sniff: `audioMagic` / the Import branch gains an N64 case (the
  three byte-order magics) → opens the capture panel with the manifest's
  track list instead of NSF's numbered slots. Unknown ROM → say so and
  offer nothing (no guessing at tables).
- Capture all: parse each sequence (milliseconds each — no emulator, no
  N-second run window), `makeMidiTracks` → `parseMidi` → local drafts under
  `albums/imports/<album-slug>/track-NN.mid`, with the loop jump as the
  `loop:` note. Same rename / ✕ / Commit import flow.
- album.json: `n64: {vault: "<code>-audio.bin", tracks: {<base>: {n}}}`
  with the **three audio blobs** (not the ROM) uploaded to the private
  vault repo the NSFs use. The ROM never enters any repo; the blobs are
  still the game's copyrighted music, so they stay private like the NSFs.
- Help sheet, `build_help.mjs`, the drift keyword, NIGHT-ROLL.md,
  WEB-SESSION.md — the shipping checklist applies in full.

## 7. Estimate (sessions of the usual length)

| Phase | Work | Sessions | Risk |
|---|---|---|---|
| A | ROM sniff, manifest (SM64 US + OoT 1.0), table readers, Yaz0, import panel wiring, drafts via existing flow, tests | 2–3 | Table offsets need a ROM in hand to verify; SF64/MK64 tracks may hit mid-generation opcodes the two ABIs don't cover — they throw with an offset, fix per opcode |
| B | Bank reader: instrument/drum ids surfaced, tuning check, manifest names | 1 | Absolute pitch not provable from the bank (see §4) |
| C | Console voice: VADPCM, envelopes, resampling mixer, per-channel buffers | 3–4 | Ear verification against a USF player; envelopes/loop points are where it will sound wrong first |
| D | Stock libultra path (compressed MIDI + `ALBankFile`) for third-party titles, Rare behind container unpackers | 2 + per-container | Different bank layout, MIDI-side loop metas |

Phase A alone delivers what the NSF import delivers today for the
first-party catalogue; B and C are additive. Nothing here requires USF.

## 8. Real rips (2026-09-27)

Josh authorised downloading the Zophar USF sets to test against; this is
what they held. Rip bytes stayed in the session scratchpad; only text
(tags, ids, the numbers below) is in the repo, as
`tests/fixtures/n64-usf-tracks.json`. The code this produced:
`usf.mjs` (container + sparse images), `ead-usf.mjs` (table locators,
sequence-id rules, manifest), the `.miniusf` mode of `dump.mjs`, and the
interpreter fixes listed in §8.4, each with a synthetic regression test
in `tests/n64-real.test.mjs`.

### 8.1 What a USF set is, as found

Sets: `super-mario-64`, `legend-of-zelda-the-ocarina-of-time` (v1.0),
`legend-of-zelda-the-ocarina-of-time-1998` (v1.2), `legend-of-zelda-the-
majoras-mask`, each the "(EMU)" zip on the Zophar song page
(`https://fi.zophar.net/soundfiles/nintendo-64-usf/<slug>/<Title> (EMU).zophar.zip`).

- Container exactly as the spec says (hcs64.com/usf/usf.txt): PSF version
  0x21, program size 0, reserved area = SR64 ROM image then SR64 Project64
  1.4 save state, both as little-endian 32-bit words. `tools/psx/psf.mjs`
  reads the shell unchanged; `usf.mjs` adds the SR64 walk and the word swap.
- **One usflib carries everything; minis are tiny.** SM64's
  `NUS-NSME-USA.usflib` holds 1,170,472 ROM bytes in 1,578 chunks plus a
  36 KB sparse RDRAM; OoT's 2.18 MB / 195 KB; MM's 2.15 MB / 159 KB. Each
  SM64/OoT mini is a **single 4-byte save-state word**; MM minis are ~100
  words. The ROM image is byte-precise: the ripper logged what the game
  actually read while it played every track (the code segment appears as
  4- to 0x9C-byte fragments — individual instructions).
- The ROM header page (offset 0) is in no set — nothing reads it while
  music plays. The PJ64 state's header copy (state offset 0x008) is
  present and word-swapped: "SUPER MARIO 64" / NSME, "THE LEGEND OF ZELDA"
  / CZLE, "ZELDA MAJORA'S MASK" / NZSE. The manifest (`USF_GAMES`) keys on
  the usflib's `NUS-<code>-<region>` name, which is that same game code.
- **Which sequence a mini plays:** the SM64 and both OoT rips park the CPU
  just before the play call (state PC 0x80248B24 / 0x800BABC0 / 0x800BB244)
  and the mini's one word, at PC+4, is `addiu a1, zero, <seq>`
  (0x24050002 = Title Theme = sequence 2). The MM rip is later work by hcs
  alone: the CPU is at the exception vector, the words are a PI DMA in
  flight and audio-thread state, and the sequence id is a RAM word at
  0x801F9B24 (also 0x80200348). Both rules are in `miniSequenceId`. The 15
  MM "Ocarina (…)" minis hold a pointer (0x801F9D14) there instead: ocarina
  songs are not Audioseq sequences (they go through the SFX/ocarina path),
  so they are correctly unreachable by this route.

### 8.2 Where the sequence tables were, per game

Found by structure (`locateEAD`), then checked against the decomps.

| Game | Tables live in | Audioseq | Sequences | Fully in rip | Partial | Absent |
|---|---|---|---|---|---|---|
| SM64 US | ROM: `ALSeqFile` headers — seq @0x7B0860 rev 3, ctl @0x57B720 rev 1, tbl @0x593560 rev 2; bank sets @0x7CC620 | 0x7B0860 | 35 | 33 | 2 (seq 0 = SFX 6 %; 0x1A credits 4 bytes) | 0 |
| OoT 1.0 | **RDRAM** (the `code` file is Yaz0'd in ROM): gSoundFontTable @0x80113740 (38), gSequenceFontTable @0x801139B0, gSequenceTable @0x80113B70 (110), sample banks @0x80114260 (7) | 0x29DE0 | 110 | 28 | 77 (all ≥ 0.93 except seq 2) | 5: 0 SFX, 1 ambience, 0x57 (no row), 0x6D cutscene fx, 0x3C **in RDRAM** |
| OoT 1.2 | same layout, RAM +0x6B0, ROM +0xF8A0 | 0x39680 | 110 | 28 | 77 | same 5 |
| MM US | RDRAM: fonts @0x801E1180 (41), seq-font @0x801E1420, gSequenceTable @0x801E1630 (128), sample banks @0x801E1E40 (3) | 0x46AF0 | 128 | 35 | 85 | 8: 0, 1, and 0x23/0x28/0x56/0x60/0x61 (no row — never played), 0x7A |

"Partial" is real and harmless: the rip omits bytes the game never read
(unused branches, padding), so the interpreter takes a **presence mask**
(`parseSequence(bytes, {present})`) and throws if it ever reads a hole.
Across all three games no music sequence read one. OoT's Kokiri Forest
(0x3C) was preloaded in the persistent cache before the state was taken,
so its bytes are in RDRAM, not ROM: `findCachedSequences` walks the
`AudioCacheEntry` records (`{ramAddr, size, tableType, id}`) to find it.

The tables' entries are already relocated in RAM (entry 0's romAddr equals
the header's), the `size 0` rows are aliases, and the u16 immediately
after the font table is `2 × sequence count` — that pairing is how the
font and sequence tables are told apart without addresses.

### 8.3 Dump results

`node tools/n64/dump.mjs "<set>/<track>.miniusf"` (the usflib is picked up
from the same folder). All numbers are one pass to the loop jump.

| Track | seq | notes | channels | tempo | length | loop → tick |
|---|---|---|---|---|---|---|
| SM64 Title Theme | 2 | 3910 (was 4008: §9.7) | 9 | 172 | 103 s | 385 |
| SM64 Main Theme (Bob-omb Battlefield) | 3 | 1419 | 7 | 113 | 72 s | 384 |
| SM64 Staff Roll | 0x1A | 6011 | 15 | 106…53 ritardando | 201 s | none |
| OoT Lost Woods (Saria) | 0x3E | 556 | 5 | 140 | 33 s | 192 |
| OoT Kokiri Forest (from RDRAM) | 0x3C | 589 | 12 | 145 | 51 s | 960 |
| OoT Hyrule Field piece LOZ03 | 3 | 382 | 12 | 150 | 13 s | none |
| OoT Gerudo Valley | 0x5F | 6285 | 8 | 120 | 86 s | 1344 |
| MM Clock Town Day 1 | 0x15 | 651 | 7 | 110 | 57 s | 384 |
| MM Ballad of the Wind Fish | 0x54 | 42 | 4 | 108 | 9 s | none |

Whole-catalogue runs: **SM64 38/38, OoT 108/109, MM 103/118** parse; the
misses are the non-sequences above (LOZ57's missing row, the 15 ocarina
minis). Pitch ranges land where they should (SM64 31–94, OoT 24–104, MM
21–100 MIDI), per-channel counts are plausible, and the `.mid` files open.

Two songs are **game-driven** rather than broken:
- OoT "Hyrule Field Main Theme" is sequence 2, `NA_BGM_FIELD_LOGIC`: a
  controller that `ldseq`s sequences 3–0x17 into memory and picks among
  them from io ports (day/night, enemies). It yields no notes on its own;
  the pieces are the set's `LOZ03`–`LOZ17` tracks and all parse.
- MM "New Wave Bossa Nova with Lulu" (0x68) is 16 bytes: `ldi 1; stio 4;
  runseq 0x4D` — play track 232 with io port 4 = 1
  (`--seq 0x4d --io 4=1`). "Ballad of the Wind Fish" reads port 4 for the
  band; the dump reports `[reads game io ports xN]` whenever this happens.

### 8.4 Interpreter bugs the real sequences found

Each fixed in `seq-libultra.mjs`, each with a hand-assembled test:
1. **SM64 channel `0x60|n` is note priority**, n being the priority, not
   an io slot; the io-slot guard (`lo >= 8`) threw on it and 34 of 38 SM64
   tracks failed at their first channel command.
   (test: "sm64 ABI: channel 0x60|n is note priority…")
2. **OoT-generation channel opcodes B0–BE are full opcodes** (`cmd >=
   0xB0` in oot's seqplayer.c, `>= 0xA0` in mm's), not low-nibble ops;
   Kakariko Village, Horse Race, Temple of Time and friends open with
   `B0` (ldfilter) / `BB` (combfilter). The argument tables also differ:
   OoT `BD` = randptr (s16, s16), `BE` none; MM `BD` (s16), `BE` (u8), so
   there is now an `"mm"` ABI that is `"oot"` with MM's table.
   (test: "oot ABI: channel B0-BE are full opcodes…")
3. **The OoT-generation sequence register is an s8** (`SeqScriptState.
   value`); SM64's is a local s32. MM's Ballad of the Wind Fish does
   `ldio 4; sub 0xFF; rbeqz` and relies on -1 − 0xFF wrapping to 0.
   (test: "oot ABI: the sequence register is an s8…")
4. Additions, not fixes: `present` mask (holes throw with the offset),
   `io` presets for game-set ports, `ioReads` in the result.

Still approximate: everything §4 says about pitch (bank tuning not
applied; +21 convention), drums unnamed, portamento/vibrato ignored, and
the tempo/tick clock's 0.3 % frame approximation.

### 8.5 What File → Import needs for a USF set (index.html untouched here)

- Accept a **folder or multi-select** of `.miniusf` + `.usflib`; the
  usflib is 1–2 MB and shared, minis are bytes. `loadUSF([mini, ...libs])`
  per track (cheap: the merge is a few thousand range writes), or load
  the lib once and overlay each mini's state chunks.
- `gameOfSet` → manifest row (abi, seq-id rule); `locateEAD` once per
  set; per mini `miniSequenceId` → `sequences[id]`, bytes from ROM or, at
  coverage 0, from `findCachedSequences`; presence mask → `parseSequence`
  → `toMidi`. Track name = the mini's `title` tag; the tag block also has
  `length`/`fade` for the capture window if one is wanted.
- Rows to grey out with a reason: no table row, pointer instead of id
  (ocarina), `ioReads > 0` with zero notes (game-driven), and holes read.
- Fonts/banks per sequence are returned (`fonts`, `banks`) for a later
  instrument-name manifest; nothing decodes samples yet (§5).
- Vault: the usflib is Nintendo's ROM data and stays private like the NSFs.

## 9. Renderer (2026-09-27)

Phase C of §7, built against the Super Mario 64 US set (the rip bytes
stayed in `/tmp`; nothing of them is in the repo). Three browser-clean
modules, a parser extension, and a shared track grouping:

- `vadpcm.mjs` — `expandBook`, `decodeFrames`, `decodeSample`: the
  decomp's `tools/aifc_decode.c` arithmetic (11-bit fixed-point inner
  product, floored; residual weight 2048 shifted down the rows; 16-sample
  history per frame). **Bit-exact on the real ROM:** for every looping
  sample in banks 17 and 34 (8 samples, orders 2 × 2 predictors) the
  bank's stored `AdpcmLoop.state[16]` equals the linear decode's outputs of
  the frame that holds `loop.start` (not the frame before it), max
  difference 0 — that is the history the RSP reloads at a loop restart, so
  wrapping by index in a linear decode is what the console plays.
- `bank.mjs` — `findAudioFiles(rom)` → `{ctl, tbl}`, `readBank(rom,
  files, id)` → instruments/drums/samples with lazy, cached PCM
  (`bank.pcm(sample)`), the game's lookup rules (`instrument(id)`: an id
  past the end plays the last one, a null slot the nearest lower;
  `drum(i)`; `sound(inst, semitone)` = key region).
- `render.mjs` — `renderN64(result, {set|rom, banks, sampleRate = 32000,
  keepSeconds, onProgress})` → `{sampleRate, seconds, [trackName]:
  Float32Array, silent, warnings}`; track names are exactly
  `notes.mjs`'s (`channelGroups(res)` is now the ONE grouping `toMidi` and
  the renderer share). Buffers are allocated by the first sample that
  sounds; a group that never sounds is listed in `silent`, not allocated.
  110 s of the Title Theme (13 tracks) renders in 0.7 s in node.
- `seq-libultra.mjs` now records on every note what the sound path needs at
  note-on: `bank` (C6/EB index), `vol` (DF/127 × E0/128 × seq DB,DA/127),
  `pan` (DD/128), `freq` (DE u16/32768, D3 = 0.5·2^((s8+127)/127)),
  `chEnv`/`chRel` (DA/D9 overrides, cleared when C1/EB sets a real
  instrument — `set_instrument` → `get_instrument` reloads the channel's
  adsr), `chInst` (whose adsr the channel holds), `lyAdsr` (layer C6
  instrument or CB envelope + release). DD/DF/E0/D9/DA/D3/DE/CB are no
  longer "stubbed"; D4 (reverb) and DC (pan weight) still are.
- `scratch/n64-render.mjs` — `node scratch/n64-render.mjs <ripdir> "<mini>"
  out.wav [seconds] [--tracks]`, 16-bit WAV mix (peak-normalised) and
  per-track WAVs, for listening checks.

### 9.1 Layouts verified on the ROM (SM64 US, bank 17 = Title Theme)

| What | Where | Read |
|---|---|---|
| ctl ALSeqFile | 0x57B720, rev 1, 38 entries | found by `findALSeqFiles` |
| tbl ALSeqFile | 0x593560, rev 2, 38 entries; **entries repeat** (banks 4 and 5 share 0x5AFCD0+218928) — it maps bank → sample-set slice, so the monotonic scan skips it; `findSampleTable` finds it by count right after the ctl file's end | |
| ctl entry 17 | 0x585BC0, 5312 bytes: `u32 14` instruments, `u32 64` drums, `u32 1`, `u32 0x19960319` (a date; unread), body at +0x10 | `bank_load_immediate`: `buf[0]`, `buf[1]`, copy from +0x10 |
| body | +0: drums list at 0x13B0; +4…: instrument offsets 0x0E30, 0x0E50, 0, 0x0E70, … (0x20 apart; two null slots) | `patch_audio_bank` |
| Instrument | `00 13 13 0A` + env 0xD60 + `{0x40, 4.1297} {0xC0, 2.1213} {0x40, 4.1297}` for inst 0: `loaded, lo 19, hi 19, release 10`, three `{sample offset, f32 tuning}` | size 0x20 |
| Drum | `0A 3E 00 00` + `{0x560, 0.2102}` + env: `release 10, pan 62`, sound, envelope | size 0x10; drums 0–15 are ONE sample at 2^(i−15)/12 × 0.5 (index 15 = 0.5, 26 = 1.0 on another sample) — SM64 "drums" are pitched sample sets, index = pitch |
| AudioBankSample | `u32 0` (unused/loaded/pad) · sampleAddr (tbl-slice offset) · loop offset · book offset · sampleSize (present only sometimes: the ripper dropped it — never read) | size 0x14 |
| AdpcmLoop | `start, end, count, pad` + `s16 state[16]` when count ≠ 0 (count = 0xFFFFFFFF on all looping samples here); one-shot samples have only `end` present (start/count/pad absent = 0) | |
| AdpcmBook | `order 2, npredictors 2`, 32 s16, on every sample in both banks | |
| Envelope | `[[2,32700],[1,32700],[32700,29430],hang]` on most instruments; `[[2,32700],[205,19818],[535,0],hang]` on inst 7; `[[2,32700],[55,32700],[127,0],hang]` on inst 12 | delay 0 = disable, −1 hang, −2 goto, −3 restart (assemble_sound.py) |
| tbl slice 17 | 0x6B5B00, 934608 bytes, 90 % in the rip | `gAlTbl->seqArray[bankId].offset` |

The rip is byte-precise in a useful way: a field the game never reads
(`sampleSize`, pads, `loaded`) or an instrument no song uses is simply
absent, and absent reads as 0 — which is what those bytes are. `readBank`
fills instead of throwing and records `present` per struct.

### 9.2 Playback semantics used (sm64 decomp, JP/US branches)

- **Pitch:** `freqScale = gNoteFrequencies[semitone] × sound.tuning`
  (`2^((n−39)/12)`, halved above 116) for instruments; a drum's freqScale
  is its `tuning` alone; × the channel's freqScale (DE/D3); capped at
  3.99992 (`process_notes`). freqScale 1.0 plays a sample at the output
  rate — 32006 Hz on the console (`osAiSetFrequency(32000)`), 32000 here
  (0.3 cents).
- **ADSR:** `adsr_update` in 16.16 fixed point: level 0..32767, a fade
  moves `(target − current) << 16` over `delay` updates, an update being
  1/4 frame — `gAudioUpdatesPerFrame = ALIGN16(32006/60)/160 + 1 = 4`
  (heap.c) → 240 updates/s. Gate end (`seq_channel_layer_note_decay`) is a
  DECAY at `releaseRate × 24` per update until the level drops below 100;
  the hard RELEASE (`0x8000/4` per update, ~4 updates) only happens when a
  layer/channel is freed, so every note end here is a decay.
  `note_init` picks the layer's envelope unless the layer's release rate
  is 0, then the channel's; the same rule picks the decay rate. Sustain
  (D2) is left at 0: in JP/US `sustain = current × u8 / 0x10000` is at
  most 127 of 32767.
- **Volume:** `noteVelocity = vel² × channel volume × volume scale ×
  fadeVolume` (vel undivided in JP/US), then `× (level × 4.3498e-5)²`,
  clamped at 32767 → gain = (vel/127)² × (level/32767)² × volumes (the
  constants multiply out to 0.9998). Pan is dropped (mono per track).
- **Loops:** the sample ends at `loop.end` for count 0; else wraps to
  `loop.start` (synthesis.c: `if (loopInfo->count != 0) restart`).

### 9.3 The +21 question, measured

Autocorrelation of isolated held notes in the rendered tracks (first
40 s), `tests/n64-real.test.mjs` "SM64 pitch":

| Track | tuning | notes | detected − (semitone+21) | correlation at f / 2f / f·½ |
|---|---|---|---|---|
| Main Theme `ch 0 inst 0` (the melody) | 0.8409 | m55 | **+2 c** | 0.93 / 0.41 / 0.89 |
| Main Theme `ch 6 inst 6` (bass) | 1.2599 | m36–43 | +9…+14 c | 0.95 |
| Title `ch 1 inst 1` (bass, looping) | 1.1237 | m36–45 | **−3…−6 c** | 1.00 |
| Title `ch 6 inst 6` | 1.2599 | m43 | +10 c | 0.95 |
| Title `ch 3 inst 3` | 0.375 | m55–67 | **−1205 c** (an octave below) | 0.01 / −0.4 / **0.99** |
| Title `ch 4 inst 4` | 0.9439 | m55–67 | **+1208 c** (an octave above) | 1.00 / **1.00** / 0.95 |
| Title `ch 5 inst 5`, `ch 7 inst 7` | 0.8409 | m60 | −585 c, r 0.95, but no correlation at f, 2f or f/2 | unresolved (inharmonic sample?) |
| Title `ch 11 inst 11` | 1.6818 | m50 | r 0.61 | unreliable |

So the +21 convention is right for the instruments a listener would
call the melody and the bass (within 15 c — the 32000 vs 32006 Hz and
linear interpolation account for a few), and an octave off for two Title
Theme instruments in opposite directions: the bank's `tuning` fixes the
sample rate, not the sample's root, exactly as §4 said. What that means
for the MIDI's note numbers is Josh's call (the renderer now plays what
the console plays; the notation would print inst 3 an octave high and
inst 4 an octave low). Nothing here names an instrument.

### 9.4 Assumptions and what is unverified

- A channel that never issues C6/EB uses bank index 0 = `banks[0]` of
  `locateEAD`'s reversed list = the LAST id stored = `defaultBank[0]`
  (`load_banks_immediate` keeps the last id it loads). Both ear songs
  have one bank; the multi-bank path (C6 → `banks[n]`) follows the 0xC6
  handler (`gAlBankSets[off + count − n]`) but no SM64 song exercised it.
- Volume/pan/bend are the values at note-on; a DF/DE/D3 during a held
  note (fades, bends) is not applied to it. The sequence DA fade target
  applies at once (fade time ignored).
- Not rendered: vibrato (D7/D8/E1–E3), portamento (C7), reverb (D4),
  the RSP resampler (linear here), instrument ids ≥ 0x80 (synth
  waveforms; listed in `warnings`, none in the two songs), pan (mono).
- Drums whose `releaseRate` is 0 fall back to the channel's adsr as
  `note_init` says; none in bank 17/34 (all 10).
- Only the sm64 generation is read here. OoT/MM sound fonts (16-byte
  table entries, `codec/medium` header word in the sample struct,
  relocation flags) are §11.
- The ear has not heard it yet: `scratch/sm64-title.wav`,
  `scratch/sm64-main.wav` (+ per-track) are the listening checks; the
  measured pitch and RMS ranges are what the tests hold.
- Wiring into the app (a `render` entry on `CHIPS.usf` passing `{set,
  banks}` from the capture; `tools/chip-worker.mjs`'s runner; adding
  `n64/bank`, `n64/vadpcm`, `n64/render` to the module list) is not done
  here — index.html is untouched. `tests/n64-bank.test.mjs` is new and not
  yet in package.json's `test` script.

### 9.5 First listens (2026-09-27, later the same day)

Two ear reports, what the decomp and the ROM say, and what changed.

**"Dire, Dire Docks: notes cut off a little early."** Note-off, verified
line by line (seqplayer.c `seq_channel_layer_process_script`, playback.c
`seq_channel_layer_decay_release_internal`, effects.c `adsr_update`,
JP/US branches): the layer counts `delay` down and calls `note_decay` when
`delay <= duration` (`duration = noteDuration × delay >> 8`, so `dur`
from the parser is the sounding part; the decay is not in it); decay =
`fadeOutVel = releaseRate × 24` per 1/240 s update until the level is
below 100 (RELEASE at `0x8000/4` only when a layer is freed); JP/US
`chan_setsustain` (D2) is `sustain = u8 << 8` and the note holds at
`current × sustain / 0x10000` for `sustain/16` updates — a real hold, but
**this song never issues D2** (`res.stubbed` is empty now). Its ch 14/15
instruments have envelopes `[[6|3, 32700], [298, 0], [1, 0], hang]`: they
fade to silence by themselves 1.25 s after onset, before most gates (the
d170 notes are silent for their last 0.35 s in the game too). Measured on
the render: −40 dB at the gate for the long notes, 1.3 s after it for a
short one — exactly the envelope. What the render lacked was the
**reverb**: ch 14/15 send `D4 0x32` (50/128) into the session's ring
buffer, which the parser stubbed. Now: `rev` on every note, and
`renderN64` runs SM64's reverb — one delay line per the RSP command
order in `synthesis_do_one_audio_update` (the ring's oldest `W` samples
are the update's starting sound, `aMix(0x8000 + gain)` scales them, the
notes add dry to the output and `dry × reverbVol/128` to the wet buffer
(`aSetVolume(A_AUX, reverbVol << 8)`), the wet buffer goes back to the
ring). `out = dry + ring[t−W]`, `ring[t] = gain/0x8000 · ring[t−W] +
wet[t]`. `W`/gain are the level's session preset (`gAudioSessionPresets`
US, data.c) chosen by `SET_BACKGROUND_MUSIC(settingsPreset, seq)` in the
decomp's level scripts — the rip carries neither the preset nor
`gSynthesisReverb` (its 36 KB of RDRAM is code words), so
`SM64_PRESET_OF_SEQUENCE` in render.mjs is that table: water 3 (0x0E00 =
112 ms, ×0.5), underground 4 (96 ms, ×0.625), haunted house 6, castle 1,
slide 1, Bowser 2, everything else 0 (96 ms, ×0.375). With it, Dire Docks'
tail rings ~0.5 s past the envelope. `sequenceOfSet` stamps
`res.sequenceId` so the app's render picks it up; `opts.reverb` overrides
(`null` = dry). Per-track combs sum to the game's single one (it is
linear), so mute/solo stay exact.

**"Cave Dungeon intro sounds weird, sorts itself out."** Checked for inst
0/6/7 of bank 21: (a) one key region each (`lo 0, hi 127`, no low/high
sound) — nothing to choose; the decomp compares the transposed semitone
(`instrument_get_audio_bank_sound(instrument, cmd)` right before
`gNoteFrequencies[cmd] * sound->tuning`, seqplayer.c part 4) and so does
`bank.sound()`; (b) tuning is read from each region's own
`AudioBankSound` (inst 0/6: exactly 1.0, inst 7: 0.2809); (c) the pitch:
inst 0/6's recording (tbl 0x4E930, 41952 samples, one-shot) has its
fundamental at **130.5 Hz = C3 when played 1:1**, i.e. at semitone 39
(`gNoteFrequencies[39] = 1.0f`, data.c) — so the console plays the
written "midi 60" as C3, and the render does the same (energy at f/2 is
> 3× that at f for the first four notes; test "SM64 Cave Dungeon"). The
octave is in the recording, exactly as inst 3/4 of the Title Theme (§9.3):
`+21` names the note the composer typed, not the note that sounds, for
these instruments. Nothing in the pitch path was changed; the same check
passes for the Main Theme melody (+2 c). (d) envelopes: all three are the
instruments' own (`chInst` set, no DA/CB, no `DEFAULT_ENVELOPE`
fallback); (e) the ch 7 chord loops its sample (12232..25019) without a
click (largest sample step 1034/32768 over 5 s, none above 6000). What
the intro lacked is the reverb every channel sends (`D4 0x1E..0x3C`) into
the underground preset, and ch 5's vibrato (`D8`, still stubbed) later
on. WAVs: `scratch/sm64-cave-5s.wav` + per track, `scratch/sm64-ddd-12s.wav`
+ per track (both now with the reverb).

Still unverified: which preset the *ripper's* base state had (the USF
minis all share one state, so a USF player renders every song with one
preset — YouTube "USF" uploads will differ from the game here); the
reverb's `framesLeftToIgnore` warm-up; vibrato (D7/D8/E3).

### 9.6 Dire, Dire Docks, second listen: "dramatically more sustain on YouTube"

Treated as a failing test; the envelope's time unit was the suspect. The
JP/US source, verbatim (effects.c `adsr_update`, `ADSR_STATE_LOOP`
default branch):

```c
#if defined(VERSION_EU) || defined(VERSION_SH) || defined(VERSION_CN)
    if (adsr->delay >= 4) {
        adsr->delay = adsr->delay * gAudioBufferParameters.updatesPerFrame
        / 4;
    }
    ... adsr->target = adsr->target * adsr->target;
    adsr->velocity = (adsr->target - adsr->current) / adsr->delay;
#else
    adsr->target = BSWAP16(adsr->envelope[adsr->envIndex].arg);
    adsr->velocity = ((adsr->target - adsr->current) << 0x10) / adsr->delay;
#endif
...
case ADSR_STATE_FADE:
    adsr->currentHiRes += adsr->velocity;
    adsr->current = adsr->currentHiRes >> 0x10;
    if (--adsr->delay <= 0) { adsr->state = ADSR_STATE_LOOP; }
```

The `>= 4` guard and the `× updatesPerFrame / 4` exist only in EU/SH; JP/US
uses the envelope's delay as a count of `adsr_update` calls. How often
that is: `process_sequences()` (seqplayer.c) ends in `process_notes()`,
which calls `adsr_update(&note->adsr)` for every note; `synthesis_execute`
(synthesis.c, JP/US) is `for (i = gAudioUpdatesPerFrame; i > 0; i--) {
... process_sequences(i - 1); ... }`, once per audio frame; the audio frame
is one vblank (`create_next_audio_frame_task` sizes each buffer between
`gMinAiBufferLength` and `gSamplesPerFrameTarget + SAMPLES_TO_OVERPRODUCE`,
i.e. ~1/60 s), and heap.c sets `gSamplesPerFrameTarget = ALIGN16(gAiFrequency
/ 60)` = 544, `gAudioUpdatesPerFrame = gSamplesPerFrameTarget / 160 + 1` = 4.
So 240 updates/s — and data.c's comment on `gDefaultEnvelope`
(`{ 1000, 32000 }, // stay there for 4.16 seconds`) reads the unit the same
way. Gate end (playback.c, JP/US): `note->adsr.fadeOutVel =
seqLayer->adsr.releaseRate * 24` (or the channel's release rate when the
layer's is 0 — these notes: layer 0 → channel → instrument's 10), subtracted
from the 0..32767 level once per update in `ADSR_STATE_DECAY`; the
`0x8000 / gAudioUpdatesPerFrame` RELEASE is only for a freed layer.
Amplitude (playback.c `process_notes`, JP/US): `scale = note->adsrVolScale;
scale *= 4.3498e-5f; velocity = velocity * scale * scale;`. Nothing in
render.mjs changed: it already does exactly this.

The data, re-read at the ROM addresses: inst 14 @0x588460 = `00 00 7f 0a |
00 00 09 d0 | 00.. | 00 00 08 d0 3f 00 00 00 | 00..` (lo 0, hi 127, release
10, envelope at body+0x9D0, normal sound = sample body+0x8D0 tuning 0.5);
envelope @0x5883A0 = `00 06 7f bc 01 2a 00 00 00 01 00 00 ff ff 00 00` =
`[[6, 32700], [298, 0], [1, 0], hang]`; inst 15's is `[3, 32700]` then the
same. Every instrument in the rip that plays this recording (bank 19 inst
14/15, bank 23 inst 4, bank 37 inst 3/8) carries that `[298, 0]` step. The
recording (tbl 0x68FD0 = ROM 0x71EAD0, 51369 samples at 16 kHz = 3.21 s,
loop from 1.86 s to the end) does NOT decay on its own: its RMS is −6 dB at
0.2 s, −12 dB at 0.6 s, then holds −8…−25 dB to the loop — a sustaining
tone. So in the game as in the render it is the envelope that ends every
note 1.24 s after onset (298/240 s), whatever the gate.

Measured on the render, one note at a time (no masking by the next note),
times from onset:

| note | gate | dry −20 / −40 / −60 dB | with the water reverb (112 ms, ×0.5) |
|---|---|---|---|
| ch 14 #1, m59, d102, vel 55 | 0.96 s | 0.48 / 0.84 / 1.06 s | 0.52 / 1.02 / 1.36 s |
| ch 14 #4, m74, d170, vel 74 | 1.60 s | 0.32 / 0.80 / 1.20 s | 0.44 / 0.92 / 1.36 s |

(The early −20 dB is the recording's own transient: pitched up ×2.24 for
m74, its first 0.6 s of decay passes in 0.27 s; the envelope's level²
adds −5 dB by 0.32 s.) "Before vs after": identical — there was no unit to
fix. What Josh has heard so far is the app build without the reverb (§9.5
is uncommitted at the time of writing); the reverb adds 0.2–0.3 s at
−40 dB, not a long fade. If YouTube's Dire Dire Docks really rings for
seconds per note, it is not the US game's arithmetic as the decomp has it:
candidates are a different mix (the OST, a re-recording, an HLE audio
plugin whose env mixer ignores the level), or something on the playback
side of the app (does the chip-audio path clip a track's PCM to the MIDI
note ends for mute/solo?). Not this renderer's envelope.

### 9.7 Against ground truth (lazyusf2 renders, 2026-09-27)

`scratch/truth/*.wav` (lazyusf2, 32006 Hz) versus our renders, the three
questions asked, and what each turned out to be.

**1. "Our notes decay early."** Not the envelope. The single-note band
plots that suggested it were reading other voices' harmonics (DDD's G4
"plateau" at 392 Hz is the ch 15 harp's G3 second harmonic, onset 2.44 s)
and the recording's own content at that pitch (the A3 note's 220 Hz
partial has a notch 0.37 s into the recording — the envelope-free
resample shows the same fall). The whole-signal test — mix RMS per 50 ms
after every note onset, dB re the onset peak, averaged over all notes, on
the same clock mapping — puts truth and ours within about 1 dB out to
0.8 s on Dire Docks ch 14 (−2.1/−2.1, −2.8/−2.5, −6.1/−5.4, −8.4/−8.0,
−11.1/−10.1, −6.7/−6.8, −8.6/−9.1, −9.0/−8.1, −11.0/−10.5), ch 15 within
2 dB, the Main Theme within 1.5 dB, Cave Dungeon ch 0 within 2 dB
(`scratch/n64-avgdecay.mjs`). The Adsr trace (`scratch/n64-voice.mjs`)
shows the level at +0.30 s = 25347 → level² = −4.5 dB, which is what the
JP/US arithmetic predicts. Nothing changed in render.mjs.

**2. "The truth runs 4.7 % slow."** Not the game's clock. JP/US pacing,
verbatim: `seqPlayer->tempo = temp * TEMPO_SCALE` (TEMPO_SCALE =
TATUMS_PER_BEAT = 48, internal.h); per update `seqPlayer->tempoAcc +=
seqPlayer->tempo; if (seqPlayer->tempoAcc < gTempoInternalToExternal)
return; seqPlayer->tempoAcc -= (u16) gTempoInternalToExternal;` then one
tick (seqplayer.c); `gTempoInternalToExternal = (u32)(updatesPerFrame *
2880000.0f / gTatumsPerBeat / 16.713f);` = 14360 (heap.c, "In practice
this is 300 on JP and 14360 on US"). Ticks per second at 240 updates/s and
bpm B = 240 · 48 B / 14360 = 0.80223 B, against the nominal 48 B / 60 =
0.8 B: the console runs **0.28 % fast** if the audio frame is 60.00 Hz
(0.18 % at 59.94, exactly nominal at the 59.83 Hz that Nintendo's own
16.713 ms implies). Nothing near 1.047, so `tickSeconds` and the MIDI
tempo stay nominal (a 0.3 % question the frame rate decides, not the
decomp). The 1.047 is the emulator's pacing: `create_next_audio_frame_task`
sizes each audio frame between 528 and 560 samples from the AI backlog;
pulled as fast as the AI drains, every frame is the 560 maximum, i.e.
32006/560 = 57.15 audio frames/s instead of 60 — 1.050, tempo AND
envelopes alike. The rip's `length=3:13` for Dire Docks (193 s) is two
loops of 90.4 × 1.047 = 94.7 s plus a fade: the ripper timed it on that
clock. Ours: 90.4 s per loop, ×1.0028 on the console.

**3. Title Theme ch 3/4 silent in the truth at 5.6–9 s.** A parser bug,
and a bigger one than it looked. The sequence header has `fd 01 | 80 |
f5 00 76` at 0x30: delay 1, `seq_getvariation` (`value =
seqPlayer->seqVariation`), `bgez 0x76`. `play_sequence` sets
`gSequencePlayers[player].seqVariation = seqId & SEQ_VARIATION`
(external.c) — 0 for a plain id, the s8 −128 for a `| 0x80` id — and the
parser's register defaulted to −1, so every such branch went the
variation way. With the game's 0 the Title Theme jumps to its third
channel table: no ritardando intro (tempos 172→99→90→78→119→172 were the
intro), loop at tick 385 not 769, 3910 notes on 9 channels not 4008 on
13, ch 3/4's 0x17F/0x1FB scripts (the pitch-bend sweeps in the truth's
silent window) never run. **Dire, Dire Docks (seq 5) branches on it
too**: the plain id is the full 8-channel arrangement (1963 notes); the
`| SEQ_VARIATION` id — `sa` (the Secret Aquarium) in the level scripts —
is the harp + melody pair (390 notes) that the old default produced. The
truth's 09a is sparser than our 8 channels for a third reason that is
the game's, not the sequence's: `process_level_music_dynamics`
(external.c) fades channel volume scales per area — `sMusicDynamics` for
SEQ_LEVEL_WATER: dynamic 0 sets `volScale 0` on channels 0,1,6,9,10,11
(mask 0x0E43; surface: harp + melody only), dynamic 1 on 6,9,10,11 (mask
0x0E40; "in water"), dynamic 2 none ("underwater cave") — which is what
the set's 09a/09b/09c minis are. The emulator runs that code with the
ripper's state; we render the sequence as written (all channels). Whether
a capture should carry the game's per-area ducking is a product question
(the ducked channels are still the composition); the masks above are the
data if it should. Fixed: `parseSequence({variation})` defaults to 0;
`sequenceOfSet` passes bit 7 of the mini's id and indexes the table by
the low 7 bits; fixture rows for Title (3910/385/14209) and DDD (1963);
tests in n64.test.mjs (synthetic `80 FA` branch) and n64-real
(both Title paths). One more JP/US fact: the sequence script's `value` is
an uninitialised local (`s32 value;` in `sequence_player_process_sequence`),
so it only carries within one tick's run; the parser keeps it across
ticks, which is what a script would need anyway.

### 9.8 Per-mini ducking and the reverb from RAM (2026-09-27)

Josh, on the variation fix: "every Dire Dire Docks song … has drums now,
and that's not real". A capture must sound like *that* mini.

**What the three minis are.** 09a/09b/09c (and 14a/14b/14c) are
byte-identical in their save state: one word each at RDRAM 0x80248B28,
`24050005` (`addiu a1, zero, 5`). The game's per-area ducking —
external.c `process_level_music_dynamics` → `fade_channel_volume_scale`
→ `gSequencePlayers[player].channels[i]->volumeScale` (lines 1831/1842;
`sMusicDynamics` rows: WATER dynamic 0 `bits2 0x0E43 → volScale2 0`,
dynamic 1 `0x0E40 → 0`, dynamic 2 none; UNDERGROUND dynamic 3 `0x0100 →
0`, dynamic 4 `0x0008 → 0`; the area conditions in `sDynDDD`/`sDynHMC`)
runs on `gCurrLevelNum`/`gMarioStates[0].pos`, none of which the rip's
36 KB of RAM carries (it is code words, a few audio globals and pointers).
What does differ is each mini's **own ROM overlay**: single bytes zeroed
inside bank 19's Instrument/Drum structs — the last byte of each
AudioBankSound's tuning float. 09a: instruments 0,1,6,10,11 and drums
15,17 (14 bytes, ROM 0x5883CF…0x5885BB); 09b: instruments 10,11 and drums
15,17 (7 bytes); 09c: none; 14a: bank 21 instrument 8 (0x5895B7); 14b:
instrument 3 (0x589517); 14c: none; every other SM64 mini: none. These are
the ripper's bit-exact trim residue: a byte a mini may zero is a byte no
sounding voice read in that mini's reference render, i.e. a record of the
voices the game had muted. Decoded: 09a → channels 0,1,6,9,10,11 (=
dynamic 0's 0x0E43 exactly), 09c → none (dynamic 2), 14a → channel 8 (=
dynamic 3's 0x0100), 14b → channel 3 (= dynamic 4's 0x0008), 09b →
channels 9,10,11 (the table's dynamic 1 would also mute 6; the mini says
6 sounded in the ripper's reference — the mini wins, and it is what a USF
player plays). Against the truth: the lazyusf2 09a's RMS envelope
correlates 0.915 with our ch 14 + ch 15 alone and less with any other
channel added (`scratch/n64-chancorr.mjs`).

**Implemented.** `loadUSF` keeps the mini's parsed file as `set.top`;
`capture.mjs duckedChannels(set, loc, seq, res)` maps the overlay's bytes
onto the sequence's banks' Instrument (0x20) / Drum (0x10) structs, and a
channel every one of whose voices is marked is dropped from
`res.notes`/`res.channels`, listed in `res.ducked`, and named in
`res.warnings` ("channels 0,1,6,9,10,11 silent in this area (game
ducking)"). The mark is binary (the game's scales here are 0 or 127), so
no partial volume factor arises. Results: 09a 390 notes on 14,15; 09b 843
on 0,1,6,14,15; 09c 1963 on all eight; 14a/14b/14c 2281/2178/2358; Title
and Main untouched.

**Reverb from the rip, not a table.** The engine's `struct
SynthesisReverb` (synthesis.h, JP/US layout: `u8 resampleFlags,
useReverb, framesLeftToIgnore, curFrame; u16 reverbGain; u16
resampleRate; s32 nextRingBufferPos; s32 unkC; s32 bufSizePerChannel;
s16 *ringBuffer.left, *right`), filled by heap.c `audio_reset_session`
(`bufSizePerChannel = reverbWindowSize; reverbGain = preset->reverbGain;
useReverb = 8`, the two ring buffers `soundAlloc(reverbWindowSize * 2)`
each) **is in every SM64 mini's RAM at 0x80220DB0**: `00 08 02 00 2f ff
00 00 | .. | 00 00 0c 00 80 1d 8e 00 80 1d a6 00` → useReverb 8, gain
0x2FFF, window 0x0C00, rings 0x801D8E00/0x801DA600 (window×2 apart), with
the pool sizes 0x3A00/0x6D00 of the same preset row nearby. That is
**preset 0** (96 ms, ×0.375) for every song — the ripper's one state —
not the level presets §9.5 assumed (water 3, underground 4), and it is
what the truth renders used. `ead-usf.mjs findSynthesisReverb(ram)` finds
the struct by that shape (useReverb 8/0, gain, window, ring pointers
window×2 apart), `sequenceOfSet` stamps it as `res.reverb`, `renderN64`
takes `opts.reverb` (null = dry), else `result.reverb`, else the set's
RAM, else renders dry with the warning "reverb state not in this rip".
`SM64_PRESET_OF_SEQUENCE` and `SM64_PRESETS` are gone (Josh's rule: no
per-game tables for musical behaviour; game identity only says where to
look).

## 10. Rare (GoldenEye 007; other Rare games in 10.7) — 2026-09-28

A second N64 driver, `rare.mjs`, for the GoldenEye 007 USF set (NUS-NGEE-USA,
58 minis; the rip stayed in `/tmp`, nothing of it is in the repo). Rare did
not use Nintendo's EAD engine: `locateEAD` finds no tables (correct), and
`sequenceOfSet` now falls through to `rareSequenceOfSet`, which returns the
same `{game, loc, id, seq, res, present}` with `res.driver = "rare"`;
`renderN64` dispatches such a result to `renderRare`. `USF_GAMES` gained the
NGEE entry (abi "rare", song word at RAM 0x603C — see 10.2).

### 10.1 What the rip is

- ROM: 121 runs, 513 228 bytes present. `0x3B87F0..0x419790` is the sample
  table (VADPCM and a few raw-16 samples, read by the RSP); `0x4199B0 +
  0x1ECAC` is the whole music bank: 62 songs stored back to back, each
  beginning `11 72`.
- RAM: 2 057 runs, 76 572 bytes — the ripper kept individual words. The
  song directory, the SDK bank file and the game's music state are in it.
- Minis differ from the lib by ONE RDRAM word (0x603C: Dam 9, Facility 7,
  Runway 0x32); Bunker 1 overrides nothing (its index, 15, is the lib's own
  value). One mini also carries a 4-byte chunk at state offset 0x3E0 (a
  register, below RDRAM; ignored).

### 10.2 Located by structure (addresses below are what the search found on this rip)

- **Song table** (`findMusicTable`): RAM 0x2D1C14, 63 entries of
  `{u32 romAddr; u16 unpackedSize; u16 packedSize}`; entry i+1's address is
  entry i's plus its packed size, which is how it is found (longest such
  chain, every present song starting `11 72`). Entry 0 (0x41998C, 97/42
  bytes) was never read by the game and is not in the ROM image; 1..62 are.
  Right after the table (0x2D1E0C) sits the compressed copy of the current
  song, `11 72 63 60…`.
- **Song selector** (`miniRareTrack`): the manifest's RAM word when the set
  is known, else the single 4-byte chunk the mini itself overrides inside
  RDRAM (`miniOverrideWords`). Dam = 9 → entry 9 = 0x41EF48, 5827 bytes
  unpacked from 3588 — confirmed against the lazyusf2 render (10.4).
- **1172** (`decompress1172`): two magic bytes then a raw DEFLATE stream
  (node's `inflateRawSync` with `Z_SYNC_FLUSH` agreed on all 62; the streams
  do not always carry a final block, so the table's unpacked size ends the
  decode). `inflateRaw` is a plain RFC 1951 decoder (stored/fixed/dynamic),
  here because the app's capture is synchronous.
- **ALCSeq** (`parseCSeq`): header `u32 trackOffset[16]; u32 division`
  (0x44 bytes; division 384 in every GoldenEye song), then tracks of
  varlen delta + event. Note-on = key, velocity, varlen DURATION; running
  status; metas `FF 51 tt tt tt` (tempo, no length byte), `FF 2E n FF`
  (loop start, n = nesting number), `FF 2D count current u32offset` (loop
  end: offset from the END of this 8-byte event back to the byte after the
  loop start — Dam track 0: 624 lands at 0xE7, right after the `FF 2E` at
  0xE3; 0xFF = forever, else finite), `FF 2F` end. Replay blocks
  `FE hi lo len`: `len` bytes re-read from `hi:lo` bytes before the 0xFE
  byte ITSELF (both blocks in Dam's track 0, at 0x7B and 0xAD, only parse
  musically from there; from the end of the command they do not); `FE FE`
  is a literal. All 58 minis parse; every track ends in a forever-loop or
  `FF 2F`.
- **Bank** (`findRareBankFile`, `readRareBank`): ALBankFile `42 31 00 01`
  at RAM 0x2CD860 → ALBank 0x2D1AB8: 75 instruments, flags 1, sampleRate
  22050 (= the game's output rate; lazyusf2 reports 22047 Hz), percussion
  pointer never read. SDK layouts exactly (`libaudio.h`): ALInstrument 16 +
  4·soundCount (bendRange 200 or 1200 cents), ALSound {env*, keymap*,
  wave*, pan, vol, flags}, ALEnvelope {attack, decay, release µs; aVol,
  dVol}, ALKeyMap {velMin, velMax, keyMin, keyMax, keyBase, detune},
  ALWaveTable {base, len, type, flags, loop*, book*}, loops with 16-word
  state, books order 2. Wavetable bases are ABSOLUTE ROM addresses (the
  game patched them; 0x3B87F0 = the first sample run). Rare's own ctl
  writer laid the file out as header, envelopes, key maps, [sound,
  wavetable, loop, book]…, instruments, bank.
  Absent from the rip (never read by the player, so 0 here, each record
  carries `present`): every envelope's attackTime word, instrument bytes
  4..11 (tremolo/vibrato), the percussion pointer, loop state words.
  Instruments whose every key map is one key (keyMin == keyMax) are kits;
  Dam's program 45 is one (`res.kits`, notes flagged `drum`). Program 58,
  which is a drum kit by ear (keys 36/38/40/46 on four channels), has
  ranged key maps and is not flagged — the roll shows it as C2/E2 melody.

### 10.3 The capture (`cseqNotes`)

Ticks rescaled ×48/384 (exact for every event in the set; durations
rounded, minimum 1), `res.division` kept. A note carries `ch, inst
(program), key = semitone = midi, tick, dur, vel, bank 0, vol (cc7/127 at
note-on), pan (cc10/128), rev (cc91), bend (wheel/8192)`. Tempo metas →
`tempos`. Each track loops on its own: the pass ends at the last track's
forever-loop; tracks whose forever-loop closes earlier are unrolled to
that end (`unrollTracks` — the ambient songs layer loops of different
lengths); finite loops (count n) are unrolled as n+1 plays, the SDK's
in-place count-down read as `while (current != 0) { current--; jump }`.
`res.loop` = the loop most tracks that end the pass share (Dam 2688→16320
= 56 quarters in, 340 long); disagreements are a warning. One warning
each for note-offs (none in the set) and aftertouch.

### 10.4 Against lazyusf2 (scratch/usf2wav, `_enablecompare` honoured)

Onset envelope of the truth vs our note onsets (scratch/ge-truth.mjs;
Pearson, 10 ms frames, best lag):

| song | notes | scale 1.0 | scale 0.95 / 1.05 | control |
|---|---|---|---|---|
| 101 Dam (id 9, 140 bpm) | 1729 | **0.640** at +10 ms | 0.029 / 0.045 | Facility's notes vs Dam: 0.065 |
| 102 Facility (id 7, 120 bpm) | 1400 | **0.538** at +10 ms | 0.034 / 0.026 | Dam's notes vs Facility: 0.056 |
| 103 Runway (id 50, 125 bpm) | 3568 | **0.409** at +10 ms | 0.020 / 0.022 | — |

So the song ids, the tempo, the division and the tick scaling are right
(scale 2 and 0.5 score about 0.5 — octave aliases of the same grid).

The render (`renderRare`) vs the truth, 45 s each (scratch/ge-pitch.mjs):
20 ms RMS-envelope correlation 0.69 (Dam), 0.76 (James Bond Theme), 0.74
(Runway), 0.60 (Mission Select); our level is 9–14 dB above the truth
before normalisation (a master/AI gain we do not model). Pitch on
moments one of our tracks owns (autocorrelation, sub-harmonic guarded):
ours − truth = 0, 0, −1, −1 cents (programs 24 and 44) — i.e. keyBase and
detune are applied as the game applies them; those programs sound an
octave from the MIDI key (truth − key = −1218 / +1207 cents), which the
bank's keyBase explains and the roll does not show (see 10.6). Octave
votes on lone onsets under polyphony (a noisier measure) agree with the
truth on the majority per program (e.g. program 11, the Bond bass: 23/27;
program 58: 7/7 in Dam).

### 10.5 Playback rules used (libaudio seqp/cseqp + syn) and what is assumed

- pitch = 2^(((key − keyBase)·100 + detune + bend·bendRange)/1200), sample
  played at the bank's sampleRate (ratio 1 = that rate), linear-interpolated
  to the requested output rate. **Verified** (10.4).
- sound = first of the instrument's sounds whose key map holds key and
  velocity (`__lookupSoundQuick`). Verified indirectly (pitch/octave).
- volume = vel/127 × sampleVolume/127 × cc7/127 × instrument volume/127 ×
  envelope (linear, the SDK's `__vsVol`). **Assumed**; overall level is
  9–14 dB hot vs the truth and varies by song.
- envelope: `alSynSetVol` ramps — to attackVolume over attackTime, to
  decayVolume over decayTime (−1 = hold), to silence over releaseTime at
  the note's end — each ramp exponential between its endpoints (floor
  1/32767), as the envelope mixer's per-8-sample multiplier makes them.
  **Assumed** (shape); attackTime is never in the rip, so attacks are 0.
- pitch bends (2026-09-28, Josh: "some notes that I suspect bend higher
  and that wasn't being honored"): the wheel events inside a note ride it
  as `n.slide = [{t, len: 1, to}]` — t ticks after the note-on, `to`
  semitones from the note-on pitch (the wheel at note-on stays `n.bend`),
  range = the bank's ALInstrument.bendRange (200 or 1200 cents; the SDK's
  only source — no GoldenEye song carries an RPN: cc 100/101/6/38 never
  occur, only cc 7, 10, 91 do; 2062 wheel events in 20 of 58 songs). The
  render steps the ONE voice on each event (`renderRare`, no new attack),
  the roll gets one note per landed pitch (`notes.mjs splitSlides`, a local
  version of the PS1 path's: fractional targets rounded to the nearest
  semitone, runs on the same pitch merged, on the tick/dur note shape).
  Verified on Dam (channel 10, 24 slid notes, 140 events: fast staircases
  of ±2 semitones over 1–10 ticks at note-ons, plus held offsets):
  log-spectrogram correlation with the truth over the bent windows 0.685
  with the bends vs 0.544 without (522 of 555 frames closer); our bent
  track vs our flat track at each step, 30 ms windows: mean |error| 41
  cents (the 9 ms steps smear inside the window; on plateaus: want 200 got
  205, want 57 got 32); the onset fit rose from 0.640 to 0.678, the
  envelope fit 0.691 → 0.697. Wheel changes with no note under them, and
  cc10 changes during a note, are not followed.
- stereo (2026-09-28): each track is `{l, r}` (opts.stereo === false: the
  mono buffers as before). Voice pan = the sound's samplePan + the
  channel's cc10 − 64, clamped to 0..127, at note-on (seqp `__vsPan`);
  gains from libaudio's equal-power table (syn/eqpower.c `s16
  eqpower[128]` = 32767·cos(i·π/254); env.c `_pullSubFrame`: left =
  eqpower[pan], right = eqpower[127 − pan]) — as remembered from the SDK
  source, the same law as cos/sin of (p+1)·π/4 on p = pan/63.5 − 1.
  Notes carry `pan` = cc10 as written (0..127, 64 centre). `out.pans[track]
  = {cc10, voice: [{pan, notes}]}` says what each track used. Measured
  (scratch/ge-pan.mjs, 45 s): Dam 14 tracks — 9 centred (L/R −0.11 dB:
  the table's 64 is a hair right of the true centre 63.5), ch 13 cc10 40
  → +5.4 dB left, ch 5 cc10 85 → −4.9 dB, ch 9 cc10 64 but its sounds'
  samplePan 88/40/50 → three voice pans; Runway 16 tracks, ch 5/9 cc10 110
  → −13.4 dB, ch 10 cc10 18 → +12.9 dB; every track's L²+R² power equals
  its mono render (0.00 dB); the mix (L+R)/√2 vs the mono mix −0.08 dB
  (Dam), −0.31 dB (Runway).
- reverb (2026-09-28): the game's effect block for alSynNew is in RAM
  (0x23100 and a copy at 0x3B3744 on the US rip), found by shape
  (`findFxParams`): s32 {6 sections, 6400-sample line} then per section
  {input, output, fbcoef, ffcoef, gain, chorusrate, chorusdepth,
  lpfilter} — six all-passes (ffcoef = −fbcoef): taps 0→160 (0.30),
  160→320 (0.30, gain 0.34, lp 0x2500), 800→2560 (0.50, gain 0.14, lp
  0x3000), 3200→5600 (0.50, gain 0.14, lp 0x3500), 3360→4800 (0.25, lp
  0x4000), 0→5920 (0.40, chorus 380/10, lp 0x4500). Zero words are absent
  from the rip (the trimmer drops words that read the same absent) and
  read 0. `SdkFx` runs it as libaudio's reverb.c does, as remembered: the
  wet input saved at the line's head; per section x at head+input, y at
  head+output, x += fb·y written back at the input tap, y += ff·x,
  one-pole low-pass (lpfilter/0x8000, assumed), written at the output tap,
  gain·y summed to the return; the head moves so a write at offset j is
  read at k after k − j samples. Chorus not modelled (its section has
  gain 0 and nothing reads past it; sections 5 and 6 are dead under this
  reading — if the SDK adds the head input to the ring's oldest content
  instead of overwriting it they would recirculate; unverified). Send =
  cc91/127 per voice (alSynSetFXMix), return at 1/√2 into each channel,
  one line per track (linear). opts.reverb null/false renders dry; a rip
  without a block gets libaudio's SMALLROOM (as remembered) with a
  warning. Measured (scratch/ge-fx.mjs, 45 s, fx on vs off): envelope
  correlation Dam 0.779/0.771, Runway 0.937/0.932, Bond Theme 0.778/0.777;
  log-spectrogram Dam 0.7795/0.7675, Runway 0.8618/0.8482, Bond
  0.7431/0.6936 — the effect moves every song a little toward the truth,
  most where the sends are highest.
- volume under held notes (2026-09-28): cc7 changes inside a note ride it
  as `n.gain = [{t, l}]` (t ticks in, l = cc7/127; the first is the
  note-on's), stepped per sample in the render (the SDK's linear law).
  Dam: 4 notes, Runway 2, Bond 1 (234 across the set). cc11 never occurs.
- vibrato (2026-09-28, asked): the set has no cc1 at all (0 events in 58
  songs; the only controllers are 7, 10, 91), so nothing to implement;
  the wheel runs in some songs (Jungle ch 3: 187 events, Bungeee!: 511)
  are slides and already ride the notes as bends.
- level: after the above, ours − truth RMS = Dam +12.0 dB, Runway +12.9,
  Bond +10.2 (was +12.2/+11.4/+8.7 on the mono mix) — not one factor;
  no global gain applied (the app normalises a capture). Voice stealing,
  tremolo: not rendered.
- Finite loop count = n+1 plays: from the SDK's cseq.c as remembered, not
  checked on the truth (Runway's track 0 riff loop of 19 is the case to
  check: one bar's difference late in the song).
- Level: the truth's music volume (the game's setting) and the AI mix are
  not modelled; the app normalises per capture.

### 10.6 Open questions

- `midi` is the sequence's key (bank tuning not applied), matching the
  EAD path's "+21 root convention (bank tuning not applied)". For programs
  whose keyBase is not 60 the sounding octave differs from the roll's; the
  bank knows (keyBase per key map) — whether the roll should show sounding
  pitch is Josh's call, as it was for Mario.
- Program 58 (and any ranged-key-map kit) shows as melody; a rule that
  flags "kit" from the music (one pitch per channel, many hits) would be
  a guess, so it is not made here. `channelGroups`' single-pitch rule is
  per instrument across channels, which this kit defeats.
- The ripper's `length` tag = one pass + the loop (Dam 4:28 = 145.7 +
  121.7 + fade), consistent with the loop found.
- `tests/n64-rare.test.mjs` is new and not in package.json's test line
  (index.html/package files were out of bounds for this session).

Tools: `scratch/ge-dump.mjs` (every mini one line), `ge-loops.mjs` (loop
bytes per track), `ge-truth.mjs` (onset fit vs lazyusf2), `ge-pitch.mjs`
(cents, octave votes, envelope fit), `ge-render.mjs` (ours + truth WAVs
side by side, `--tracks`), `ge-app-capture.mjs` (the app's capture contract
in the vm harness), `ge-probe*.mjs` (the search that found the above).

### 10.7 Other Rare games (2026-09-28)

Four more Rare sets from Zophar (rips in `/tmp/claude-501/rips/n64-*`, none
in the repo): Banjo-Kazooie (NBKE, 258 minis), Donkey Kong 64 (NDOP, 178),
Diddy Kong Racing (NDYE, 103), Jet Force Gemini (NJFE, 78). Perfect Dark
and Banjo-Tooie are not on Zophar (no page under either letter's N64
listing). All five games play the SDK's formats — ALCSeq songs through an
ALBankFile — but keep and pick the song four different ways:

| game | where the songs are | which one the mini plays |
| --- | --- | --- |
| GoldenEye | RAM table `{rom, u16 unpacked, u16 packed}` → bare 1172 blocks | the one RAM word the mini overrides (0x603C) |
| Banjo-Kazooie | RAM asset directory `{u32 offset, u32 flags}` + one ROM base → *sized* 1172 blocks (`11 72`, u32 size, stream) | an `addiu a1, zero, n` the mini patches at 0x24FFF0 |
| Diddy Kong Racing | the SDK's own `'S1'` sequence file in RAM (offsets made absolute by alSeqFileNew) → plain ALCSeq in ROM | GPR a0 in the mini's state (offset 0x70) |
| Donkey Kong 64, Jet Force Gemini | no table in the rip: the song the game had unpacked into its heap, in RAM | the RAM song the mini's own chunks write most of |

Everything is found by shape in `rareSequenceOfSet`, tried in that order
(`findMusicTable` → `findAssetSongTable` → `findSeqFileInRam` →
`miniRamSequence`). Manifest entries (where-to-look only, after generic
detection): NBKE `{kind: "ram", addr: 0x24FFF0}` and NDYE `{kind: "reg",
reg: 4}`, used only by a mini that overrides nothing (BK's "Unused Beta
Version 2", DKR's two Pirate Lagoon minis) — such a mini is the lib's own
state, and nothing in one mini says where the lib keeps its number.

Generic fixes the other games needed (all in rare.mjs):
- **Loop metas' operands are raw bytes.** cseq.c reads the loop start's two
  bytes and the loop end's six straight off `curLoc`, never through
  `__getTrackByte`, so an `FE` among them is not a back-reference. BK's
  Click Clock Wood Spring (song 95) ends its loop 0x1FE bytes back — the
  old reader failed "block at 599 reaches 33090 back".
- **RAM songs are walked, not read from their header.** alCSeqNew reads the
  offset table once, before the state was taken; DK Rap's RAM header keeps
  slots 10–14 of its own and slots 0–5 of the library's (another song's),
  and DK64's Mini-Boss keeps no header word at all. `parseCSeq(…, {walk})`
  takes the tracks back to back from 0x44, each through its FF 2F, to the
  first that does not parse (the zeros after the song). A RAM song is a
  division word (1..0x10000) whose word 0 is 0x44 or absent, then a track.
- **Banks without a file header.** `findRareBanks` = every 'B1' file's banks,
  then any struct of the ALBank's own shape (BK keeps no 'B1' word). The
  song's bank is the one holding every program it names; header-found
  banks sort first (GoldenEye's song index stays 0 beside a 1-instrument
  shape match).
- Key maps with velocityMax 0 (BK) mean no velocity limit.
- A plain (unpacked) song with bytes missing from the rip plays what is
  there, with a warning (DKR's Get Ready: 48 of 232 bytes never read); a
  1172 block still needs every byte.

Survey (`scratch/rare-survey.mjs <dir> [from] [count]`, sequenceOfSet on
every mini):

| game | parsed | failed, and why |
| --- | --- | --- |
| Banjo-Kazooie | 257 / 258 | "167 SFX Rare & Nintendo Logo (without Music)": its song (14) is not in the rip — the mini plays effects |
| Donkey Kong 64 | 178 / 178 | — (sound-effect minis roll the library's song, with a warning; see below) |
| Diddy Kong Racing | 103 / 103 | — |
| Jet Force Gemini | 78 / 78 | — |

Against lazyusf2 (`ge-truth.mjs` onset fit, 20 s; `rare-pitchshift.mjs`:
long-term log spectrum of our render against the truth's, 10-cent bins
250 Hz–6 kHz, best shift; a wrong song scores ≈0.1 at 0 c, Dam 0.88):

| mini | onset r at scale 1 (next best scale) | pitch: best shift, r |
| --- | --- | --- |
| BK 002 Main Title | 0.58 (0.48 at ×2; control song 0.09) | 0 c, 0.81 |
| BK 006b Spiral Mountain (Normal) | 0.72 (0.60) | +10 c, 0.79 |
| BK 011b Mumbo's Mountain (Normal) | 0.58 (0.50) | +10 c, 0.61 |
| DK64 002 DK Rap | 0.55 (0.38) | 0 c, 0.97 |
| DK64 018 Jungle Japes | 0.67 (0.44) | 0 c, 0.83 |
| DK64 s38 Mini-Boss | 0.34 (0.26) | 0 c, 0.82 |
| DK64 001 Logo | 0.64 (0.43) | — |
| DKR 02 Title Theme | 0.66 (0.06; control 0.05) | 0 c, 0.86 |
| DKR 03 Options, Level Selection | 0.75 (0.09) | 0 c, 0.91 |
| DKR 12a Pirate Lagoon | 0.76 (0.05) | 0 c, 0.89 |
| JFG 02 Main Theme | 0.32 (0.30; control 0.09) | +10 c, 0.72 |
| JFG 10 Cave | 0.22 (0.09) | −10 c, 0.36 |
| JFG 17 Tawfret | 0.23 (0.24) | 0 c, 0.84 |

The +10 c is BK's and JFG's output rate (21 998 / 22 018 Hz) against ours
(22 050). The earlier pitch check (`ge-pitch.mjs`, lone onsets) finds too
few lone notes in these songs to vote; `ge-pitch.mjs --align` shifts the
truth by its onset lag first.

Open (facts, not fixed):
- **Variant minis set a word the roll does not use.** BK's Normal/Aquatic
  minis patch `addiu t7, zero, 0x6FFF / 0x9000` at 0x25DAE8 (All-In-One
  keeps the lib's); DKR's per-racer Player Select minis set RAM 0x1114E0
  (0x800F5000 Krunch, 0x001F5000 Diddy, …). The bits look like a per-channel
  enable mask (Spiral Mountain Normal: onsets 0.75 with channels whose bit
  is set, 0.45 with the others, 0.72 all), but what the game does with the
  word is not read from the file, so the roll plays every track and the
  capture warns "this mini also sets 1 memory word the roll does not use".
- **Which RAM song a mini that writes none plays.** DK64 holds four songs in
  RAM (0x7DF800, 0x7E4FE0, 0x7E7900, 0x7E9820); a mini that writes none of
  them gets the lowest (right for the Logo, r 0.64) with a warning — a
  sound-effect mini (s01 Entrance…) looks the same, and no pointer to the
  playing song survives in the rip.
- **JFG fits weakly** (0.22–0.32) and eight of Cave's tracks are silent in
  our first 20 s: the game fades tracks in and out itself (the minis carry
  per-channel volume words); the roll is the whole score. JFG program 21
  names keys 47–59 in a kit whose maps cover 60–68: "no sound for key" (the
  SDK's lookup also returns none).
- `seq.banks` indexes `findRareBanks`' list (not a bank file's); the render
  looks it up the same way.

Tools: `rare-survey.mjs`, `rare-one.mjs` (a mini's table, words, id),
`rare-ramsongs.mjs` (RAM songs and how much the mini writes of each),
`rare-banks.mjs`, `rare-pitchshift.mjs`; `ge-truth.mjs`, `ge-render.mjs`,
`ge-pitch.mjs` take `N64_GE_DIR=<set>`.

### 9.9 Stereo (2026-09-28)

Every EAD track is now a pair `{l, r}` (equal length; everything else in
the render result unchanged). The pan is the console's: effects.c JP/US
`layer->notePan = (layer->pan * panLayerWeight) + panFromChannel` with
`panFromChannel = seqChannel->pan * seqChannel->panChannelWeight`,
`panLayerWeight = 1 − panChannelWeight` (channel `DD` u8/128, weight
`DC` u8/128 — default 1, so the channel's pan; layer `CA` u8/128; a drum
brings `drum->pan / 128` as the layer's unless the layer said `CC`), then
synthesis.c JP/US `note_set_vel_pan_reverb`: `panIndex = (s32)(pan *
127.5f) & 127; volLeft = gDefaultPanVolume[panIndex]; volRight =
gDefaultPanVolume[127 - panIndex];` with data.c `gDefaultPanVolume[i] =
cos(π/2 · i/127)` (1.0, 0.999924, … 0.70272 at 64, … 0.012368, 0) — the
equal-power law exactly (a centred note −3 dB per side; the app's mono sum
of the pair is +3 dB at centre, the power sum unchanged). The value is the
one at note-on; a DD/DC/CA under a held note is not followed. The reverb
send is panned with the dry, one ring per side. Parser facts added per
note: `panWeight`, `lyPan`, `noDrumPan` (DC/CA/CC were stubs).
`toMidi` writes each track's starting pan as CC10 at tick 0 and one CC10
at every note whose pan differs (a kit with `DC 0` shows the layer default
64 there: the drums' own pans live in the bank, which the MIDI writer
does not open — the render pans them).

Checked on 09c Dire, Dire Docks (all eight channels), old mono vs new,
first 20 s (`scratch/stereo-check.mjs`): power sum √(l²+r²) equals the
old mono to 0.00 dB on every track; pans 116, 9, 59, 63, 126, 79, 47 →
L/R −17.3, +19.0, +1.0, +0.5, −38.2, −3.4, +3.7 dB.

### 9.10 Level changes under held notes, and vibrato (2026-09-28)

**Volume.** JP/US effects.c `sequence_channel_process_sound` recomputes,
every update, `channelVolume = seqChannel->volume * seqChannel->volumeScale
* seqChannel->seqPlayer->fadeVolume` and for every layer with a note
`layer->noteVelocity = layer->velocitySquare * channelVolume` — so a
channel `DF` (`volume = u8/127`), `E0` (`volumeScale = u8/128`), sequence
`DB` (`seq_setvol`: `fadeVolume = u8/127` at once — the timed
`fadeRemainingFrames`/`fadeVelocity` path only runs for fades the *game*
starts, none here) or `DA` (`seq_changevol`: `fadeVolume += (s8)u8/127`,
clamped 0..1 in `sequence_player_process_sound`) reaches every held note
at the next update. The parser now keeps a per-channel level timeline and
slices it onto each note as `n.gain = [{t: ticks from the start, l:
level}]` (steps; `n.vol` stays the note-on level and the MIDI keeps the
note-on velocity), and the render re-reads the level per update
(`base = vel² × level`, then the envelope's level² as before). DA was
wrong before this (it set the level to the byte instead of adding the
signed step). In the set: Snow Mountain (234 stepped notes, DA fade-outs
in 1/127 steps), Looping Steps (132, +1/127 nudges), a few in the
fanfares; the Title Theme has none. Against lazyusf2 on Snow Mountain
ch 1 alone the stepped tail moves 1–3 dB toward the truth; the synthetic
1 → 0.1 step renders −20.0 dB (test).

**Vibrato.** seqplayer.c JP/US: `D7` → `vibratoRateStart = vibratoRateTarget
= u8 * 32`; `D8` → `vibratoExtentTarget = u8 * 8`, start 0, change delay
0; `E1`/`E2` → rate/extent `Start = u8*32|8, Target = u8*32|8,
ChangeDelay = u8 * 16`; `E3` → `vibratoDelay = u8 * 16`; `EC` clears all
of it and `freqScale`. Defaults: rate 0x800, extent 0. effects.c
`note_vibrato_init` (JP/US): a note born with `vibratoExtentStart == 0 &&
vibratoExtentTarget == 0` and no portamento never vibrates; otherwise
`extent`/`rate` start at their Start (or Target when the change delay is
0), `delay = vibratoDelay`, `curve = gVibratoCurve` (s8[16] = k·8).
`get_vibrato_freq_scale`, per update: `delay` counts down first; the
extent and rate each move toward the channel's current target over
`ChangeTimer` updates (`+= (target − value) / timer`, exact on the last)
and pick up a new target whenever it differs (through the channel's
change delay); `time += rate; index = (time >> 10) & 0x3F`; the JP/US
`get_vibrato_pitch_change` folds the 64 steps into a triangle (`0x00`:
curve[index], `0x10`: curve[31 − index], `0x20`: −curve[index − 32],
`0x30`: −curve[63 − index]) so `pitchChange` runs 0 → 120 → 0 → −120 → 0;
`scale = 1 + extent/4096 × (gPitchBendFrequencyScale[pitchChange + 127] −
1)` with that table `0.5 · 2^(k/127)`, i.e. `1 + extent/4096 ×
(2^(pitchChange/127) − 1)` — asymmetric (+0.925 vs −0.481 × extent/4096).
Period 65536/rate updates: 32 updates (7.5 Hz) at the default rate. The
render applies it as a per-update frequency scale on the voice
(`render.mjs Vibrato`); the roll keeps the written pitch. The parser
records `n.vib` (the channel's rate/extent/delay state at note-on) and
`n.vibChanges` (D7/D8/E1/E2/EC while the note holds, as target changes).
In the set only Cave Dungeon vibrates: channels 2 and 5, `D8 1` → extent
8 → **±3 cents** (peak +3.1, trough −1.6) at 7.5 Hz, which is why the
lazyusf2 pitch tracks of those notes differ from a flat render by less
than the ±4 c measurement noise; the synthetic test (extent 1016, ±23 %)
shows the machinery, and the truth's larger wobbles on the long ch 5
note at 68.7 s (up to ±60 c) are not vibrato — they come with the note's
`vibChanges` and something the render still lacks (portamento, C7, stays
stubbed).

### 9.11 Portamento (2026-09-28)

The last pitch-shaping stub in the EAD path. seqplayer.c JP/US, layer
`C7` (`layer_portamento`): `layer->portamento.mode = m64_read_u8(state);`
then `cmd = m64_read_u8(state) + seqChannel->transposition +
layer->transposition + seqPlayer->transposition; if (cmd >= 0x80) cmd =
0; layer->portamentoTargetNote = cmd;` and the time: `if
(PORTAMENTO_IS_SPECIAL(layer->portamento)) layer->portamentoTime =
*(state->pc++);` (a u8) `else layer->portamentoTime =
m64_read_compressed_u16(state);`. `C8` sets `mode = 0`. In
`seq_channel_layer_process_script_part1` (the start of every command
run) `if (PORTAMENTO_MODE(layer->portamento) == PORTAMENTO_MODE_1 ||
... == PORTAMENTO_MODE_2) layer->portamento.mode = 0;` — modes 1 and 2
are one-shot (they apply to the note issued in the C7's own command
run), 3/4/5 persist. At note-on (part4, `if (layer->portamento.mode !=
0)`): the key region is chosen by the higher of the two semitones;
`temp_f2 = gNoteFrequencies[cmd] * tuning; temp_f12 =
gNoteFrequencies[layer->portamentoTargetNote] * tuning;` and per mode
`case 1/3/5: sp24 = temp_f2; freqScale = temp_f12;` (the voice starts on
the C7 target and glides to the written note), `case 2/4: freqScale =
temp_f2; sp24 = temp_f12;` (starts on the note, glides to the target);
`portamento->extent = sp24 / freqScale - 1.0f; portamento->cur = 0;`
speed: special `= 32512.0 * tempo / (layer->delay * gTempoInternalToExternal
* portamentoTime)` — the glide lasts `time/256` of the note's delay —
else `= 127.0 / portamentoTime` — `time` updates; `case 5:
layer->portamentoTargetNote = cmd;` so the next note glides from this
one. The note copies the layer's struct (`note->portamento =
note->parentLayer->portamento`) and effects.c
`get_portamento_freq_scale` runs per update: `p->cur += p->speed; v0 =
(u32) p->cur; if (v0 >= 127) v0 = 127; result = 1.0 + p->extent *
(gPitchBendFrequencyScale[v0 + 127] - 1.0)` = `1 + extent · (2^(v0/127)
− 1)`, multiplied into the note's frequency with the vibrato
(`frequency *= note->vibratoFreqScale * note->portamentoFreqScale`).

Implemented: the parser keeps the layer's `{mode, target, time}`, clears
one-shot modes at each command run, and gives each note `n.porta =
{mode, start, end, updates, special, time}` (semitones; `updates` = the
glide's length in updates, the special form converted through the note's
delay and the tempo: delay × 14360/(tempo·48) × time/256); mode 5
retargets the layer to the note. The render (`render.mjs Portamento`)
starts the voice on `start`'s frequency (through the same key region /
tuning) and applies the per-update scale. The roll: a glide that lands
away from the written pitch (modes 2/4) carries `n.slide = [{t: 0, len,
to}]` in the shared slide shape, so `splitSlides`/`toMidi` write one
note at the landed pitch; a glide that returns to the written pitch
(1/3/5) stays one note. Synthetic tests cover the modes' directions,
one-shot vs persistent, mode 5's chaining, the special time, and a
rendered octave glide (1 kHz → 2 kHz over 0.5 s, `(u32)cur` reaching 127
on the 49th of 48 updates as the float truncation says).

**No Super Mario 64 sequence uses C7** (survey of all 38 minis: zero
notes with a glide; the real test pins it), and the OoT/MM rips are not
on this machine, so the glide has no truth render to meet yet. The Cave
Dungeon ch 5 "swings" that prompted this: with the truth aligned
locally (×1.048 − 0.06 over 66–71 s, envelope correlation 0.93 — the
global fit was right) the ch 5 notes' pitch tracks agree with ours to a
few cents throughout (m67: truth `−6 −6 −6 −12 4 8 4 −16 −6`, ours
`−8 −8 −6 −10 6 12 −8 −16 −8`; m72 within 2 c; m79 and the long m74
within 6 c wherever the band holds), and the ±60 c readings only occur
where the band is empty (other voices) — the estimator's floor, not the
game. The ±3 c `D8 1` vibrato is what those notes have.

## 11. Ocarina of Time / Majora's Mask: sound fonts and the voice (2026-09-28)

The oot generation of the engine now renders. What parses, what renders,
the numbers against the emulator, and what is still off.

### 11.1 Where a rip keeps a font

Tables (all in RDRAM, found by structure — ead-usf.mjs): gSoundFontTable,
gSequenceFontTable, gSequenceTable, and **gSampleBankTable, which follows
the sequence table directly** (OoT 1.0 @0x80114260, 7 banks; MM
@0x801E1E40, 3). A font's counts are not in its blob: the table entry's
three shorts carry them (`sampleBankId1 << 8 | id2`, `numInstruments << 8
| numDrums`, `numSfx` — load.c AudioLoad_InitSoundFontMeta).

The blob is in one of two places, and the rip says which:
- **ROM pages, unrelocated** — the game DMA'd the font while the ripper
  listened (OoT Lost Woods font 5, Hyrule Field pieces font 3, MM Clock
  Town font 25). Words are offsets from the blob's start; a sample's
  `sampleAddr` is an offset into sample bank `id1` (medium field 0) or
  `id2` (1).
- **RDRAM, relocated** — the font was resident when the state was saved
  and the game never read it from ROM again (OoT Kokiri Forest font 15 at
  0x801C43D0; every MM mini carries its font in its own RAM, 0x8037F5B0 or
  0x80378720). Found at `soundFontList[id].instruments − 8`
  (AudioLoad_RelocateFont sets `instruments = fontData + 2`); the
  soundFontList array (0x14-byte SoundFont records) is found by matching
  its first four bytes to the table's shorts.

One reader (bank.mjs `readFont`) serves both: addresses with the KSEG0 bit
are RDRAM, others ROM, and a pointer without it is an offset from the
font's start — relocation undone. **ROM wins when both exist**: a
soundFontList pointer of a font that is not loaded is stale (OoT's fonts 3
and 9 still point at 0x801C43D8, font 15's slot). All 1822 sample
references in OoT's ROM-copy fonts are codec 0 (VADPCM), medium 0.

**The rips drop zero bytes the game read.** OoT's and MM's sample bank 1
row carries its medium/cache bytes (`02 04`) but no address or size: it is
{0, 0}, an alias of bank 0 (0x79470 OoT, 0x97F70 MM — the latter matches
the base implied by MM's relocated copy, 0x54E580 − 0x4B6610).
`readAudioTable` now reads a partly present row's missing bytes as zeros
(a row with no byte at all is still "never read"). The same holds for the
SynthesisReverb's unread fields and the tail bytes of a few samples
(99.97 % present).

### 11.2 Layout (oot include/audio.h, mm include/audio/soundfont.h)

Instrument (0x20) {u8 isRelocated, normalRangeLo, normalRangeHi,
adsrDecayIndex; EnvelopePoint* envelope; TunedSample low, normal, high} —
low only when `normalRangeLo != 0`, high only when `normalRangeHi != 0x7F`
(RelocateFont leaves the others unrelocated). Drum (0x10) {u8
adsrDecayIndex, pan, isRelocated, pad; TunedSample; EnvelopePoint*}.
TunedSample {Sample*, f32 tuning}. Sample (0x10) {u32 codec:4 (mm: unk:1,
codec:3), medium:2, unk_bit26:1, isRelocated:1, size:24; sampleAddr; loop;
book}. AdpcmLoop {start, loopEnd, count, sampleEnd/pad; s16 state[16] if
count}. Font blob: +0 drum-offset list, +4 SoundEffect array, +8
instrument offsets. Instrument/drum ids past the count (or an empty slot)
are **no voice** (Audio_GetInstrumentInner / Audio_GetDrum) — sm64 falls
back to the last one.

### 11.3 The engine's rules where they differ from sm64 (render.mjs `renderOotGen`)

- **Updates**: heap.c `ticksPerUpdate = ((samplesPerFrameTarget + 0x10) /
  0xD0) + 1` with `samplesPerFrameTarget = ALIGN16(32000 / 60) = 544` → 3
  per frame, **180/s**; Audio_ProcessNotes runs once per update
  (synthesis.c AudioSynth_Update → AudioSeq_ProcessSequences).
- **ADSR in floats** (effects.c Audio_AdsrUpdate): `adsr->delay *=
  ticksPerUpdateScaled` (= 3/4, at least 1); `adsr->target =
  SQ(arg / 32767.0f)`; linear to it. Decay: `current -= fadeOutVel`,
  `fadeOutVel = adsrDecayTable[decayIndex]` = `256 · ticksPerUpdateInvScaled
  / scaleInv` = 1/(3·scaleInv) per update, scaleInv 60(23−i) for i 1..15,
  4(143−i) for 16..127, 251−i for 128..250, 0.75/0.66/0.5/0.33/0.25 for
  251..255; index 0 never decays. With a channel sustain (D2) the decay
  stops at `sustain · current / 256` for 128 updates, then releases.
  Defaults: gDefaultEnvelope {1, 32000}, {1000, 32000}, hang; decayIndex 0xF0.
- **Which envelope**: the layer's (a drum's own) unless its decay index
  is 0, then the channel's (Audio_NoteInit; Audio_SeqLayerDecayRelease
  likewise for the rate). Many drums carry 0 and so use the channel's.
- **Pitch**: gPitchFrequencies = 2^((s − 39)/12) for s < 0x75; entries
  0x75–0x7F wrap to 2^((s − 167)/12) (PITCH_BFLATNEG1 … PITCH_AFLAT0).
  sm64's table differs up there. Resampler cap 3.99996.
- **Level**: `velocitySquare = SQ(vel)/SQ(127)`, `appliedVolume =
  (volume · volumeScale · fade)²`, × the ADSR's (already squared) level,
  clamped to 1 (effects.c Audio_SequenceChannelProcessSound, playback.c
  Audio_InitSampleState). sm64's law is vel² · vol · (env/23000)².
- **Pan in integers**: `notePan = (newPan · weight + layerPan · (0x80 −
  weight)) >> 7`, `& 0x7F`, gDefaultPanVolume (the same cos table) — the
  stereo/headset tables apply only with D0 (stereoHeadsetEffects), which no
  verified song sets.
- **Vibrato**: gWaveSamples[2] (a sine), `1 / ((d − 1/d)·(sin + 32768)/65536
  + 1/d)`, d = 1 + depth/4096 (Audio_GetVibratoFreqScale); same timers.
- **Portamento**: cur 8.8, `speed = 0x20000 / (time · ticksPerUpdate)`,
  `1 + extent·(gBendPitchOneOctaveFrequencies[v + 128] − 1)` = 2^(v/127).
- **Per-note shaping after the resampler** (AudioSynth_ProcessNote): gain
  (ED, UQ4.4, below 0x10 lifted to 1.0), the channel filter (8-tap Q15
  FIR), the comb filter `y[n] = x[n − size/2] + gain/0x8000 · x[n]` (BB).
  The filter's taps live in the sequence data (B0 points at them; B3
  rewrites them from gLowPassFilterData/gHighPassFilterData via
  AudioHeap_LoadFilter — a later B0 of the same address sees the rewrite;
  B1 drops the filter). They run at the render's rate (the console's is
  32 kHz; the app's chip rate shifts the cutoff proportionally).
- **Reverb, from RAM — both rips have it**: gAudioCtx.synthesisReverbs[]
  (SynthesisReverb, 0x2C8 bytes OoT / 0x2D0 MM, same prefix; ead-usf
  `findOotReverbs`). OoT: [0] window 3072, downsample 1, volume 0x7FFF,
  decayRatio 0x3000; [1] 3072, 0x1800, with a low-pass (gLowPassFilterData row 11).
  MM: [0] 3072, 0x3000; [1] 5120, 0x5000, leakRtl −0x3000, leakLtr
  0x3000 (its filterLeft/Right are null; only the *Init buffers are set).
  Per update (synthesis.c AudioSynth_DoOneAudioUpdate): the ring's block
  is mixed out × volume, scaled by decayRatio (`aMix(decayRatio + 0x8000)`
  = × decayRatio/0x8000), leaked between sides, the notes' sends added
  (reverbVol/128, the env mixer's `(reverbVol & 0x7F) · 2 << 8`; **bit 7
  swaps the wet sides** — `aEnvMixer`'s flag, alist_envmix_nead
  `swap_wet_LR`), filtered, saved. The channel's E5 picks the reverb.
  Not modelled: the downsampling's own filtering (both rips run 1), the
  sub-delay (unk_14/subDelay, 0 in both) and cross-reverb mixing
  (mixReverbIndex −1 in both) — warned if a rip uses them.

### 11.4 Capture fixes the render exposed (seq-libultra.mjs)

1. **The oot `0x0n` channel delay ends the tick's run**: `channel->delay
   = lowBits; goto exit_loop;` (oot seqplayer.c ASEQ_OP_CHAN_CDELAY; mm
   keeps running when n = 0). The parser set the delay and kept executing,
   so every short-delayed volume fade collapsed into one tick and layers
   restarted early. Kokiri Forest's intro (ch 4/10/11 fading 0x7E → 0x5A
   in 3–12-tick steps) rendered 8–10 dB quiet for 1–3 s; notes the
   interpreter had been dropping reappear. Catalogue rows that moved (notes
   only; tempo, loop and end ticks unchanged): OoT Title 138→221, Kokiri
   589→597, Lost Woods 556→564, LOZ03 382→407, Kakariko 199→488, Gerudo
   Valley 6285→6294; MM Title Demo 696→891, Clock Town 651→755, Majora's
   Theme 619→677, Termina 1283→1394, Ballad of the Wind Fish 42→50, Staff
   Roll 1612→1652 (fixture updated).
2. **E8 is 8 bytes** in the oot generation (3 args, then transposition,
   pan, weight, reverb, reverb index read inline); E7 reads the same 5 from
   the sequence data. The parser read 3 (no verified song uses either).
3. D2 sustain, E5 reverb index, ED gain, B0/B1/B3 filter, BB comb are now
   recorded on the note (they were stubs).
4. **MM's ocarina minis** (15 "Ocarina (…)" and Song of Frogs) hold a
   pointer, 0x801F9D14, in the id word; `& 0x7F` made it sequence 0x14 and
   the capture played Pirates' Fortress. `sequenceOfSet` now refuses an id
   above 0xFF with that explanation.

### 11.5 Against the emulator

Truth tooling: **lazyusf2 (scratch/usf2wav) never delivers a sample on the
OoT set** — HLE or LLE, `_enablecompare`/`_enablefifofull` either way
(usf2wav now takes USF_COMPARE / USF_FIFO_FULL env overrides to try it).
kode54's older lazyusf (scratch/lazyusf-kode54, same API; built in /tmp
with `make CC=clang` and linked against the same usf2wav.c) plays it, and
agrees with lazyusf2 on MM Clock Town (RMS equal, peak ±1). **Its HLE
FILTER halves the channel filter**: the second FILTER call points t5 at
the *state* buffer + 0x10 (zeroed), averages it with the taps and writes
the average back over the taps (rsp_hle alist_filter) — the Title Theme's
two low-passed channels came out 10 dB under ours in HLE and within 0.4 dB
in **LLE**, so filtered songs are checked with `--lle`.

`scratch/zelda-truth.mjs` (onset fit via truth-warp; mix level; per-track
gains from a non-negative fit of the truth's L and R band energies — 8
octave bands, 20 ms frames — onto our tracks'; tuning by log-spectrum
cross-correlation in 2-cent steps, whole mix and per dominant track;
isolated-note f0), `scratch/zelda-window.mjs` (RMS per side per window).
30 s each, onsets at the emulator's pacing (×1.046–1.050, as SM64's §9.7):

| Song (truth) | notes | level truth/ours dB | band energy explained | tracks (share > 2 %) | tuning |
|---|---|---|---|---|---|
| OoT Kokiri Forest (HLE; font in RAM) | 597 | −26.1 / −25.9 | 96 % | all within ±0.9 dB | 0 ¢ (corr 0.999) |
| OoT Lost Woods (HLE; ROM font) | 564 | −20.7 / −20.6 | 97 % | ±0.5 | 0 ¢ |
| OoT Hyrule Field piece LOZ03 (HLE) | 407 | −27.8 / −27.3 | 96 % | ±0.8 | 0 ¢ |
| OoT Title Theme (LLE; filter, wet swap) | 221 | −25.1 / −25.1 | 94 % | ±0.4 | 0 ¢ |
| OoT Kakariko Village (LLE; comb) | 488 | −31.8 / −31.6 | 86 % | ±0.2 | 0 ¢; isolated note 116.8/116.8 Hz |
| MM Clock Town Day 1 (HLE) | 755 | −24.1 / −24.0 | 71 % | ch 3 0.0, ch 6 −0.1, ch 4 −0.8, ch 0 +1.2, drums −2.5 | 0 ¢ |
| MM Termina Field (HLE; font in RAM) | 1394 | −22.4 / −22.6 | 90 % | ±0.9 | 0 ¢ |

Per-side windows (Kokiri 0.1–20 s, Clock Town 0.1–28 s, Title 1–26 s) sit
within 0.3–0.5 dB of the truth on both sides; Clock Town's drums alone (its
0–4.3 s intro) within 0.4 dB — the −2.5 dB in its mixed fit is the fit
trading between overlapping staccato tracks, not a level error. Reverb:
Lost Woods explains 89 % dry, 91 % with the RAM reverb; neutral elsewhere.
Hyrule Field Main Theme itself is sequence 2, the field *logic* (§8.3):
no notes of its own, so the piece LOZ03 stands in for it.

Catalogue sweep (`scratch/zelda-sweep.mjs`, capture + 5 s render of every
mini): OoT 106/109 render (the three are 19a/b/c, the logic sequence); MM
102/118 (15 ocarina minis + Song of Frogs refused, New Wave Bossa Nova with
Lulu is a `runseq`). Warnings seen: a sample only partly read by the game
(Shop, Market, Goron City — late notes the game cut short; silence past
what it read), a drum past the font's count (Gale Warp: silent in the game
too), a channel with no instrument (Temple of Time, MM Boss Battle: the
game skips it).

### 11.6 Still off / not modelled

- Game-side level changes the rip does not carry (sm64's per-area ducking
  had the mini's overlay; nothing equivalent was needed on these songs).
- Sound output mode is not read: the default pan table is assumed (the
  truth agrees); headset/Haas and the "strong" stereo bits are not rendered.
- Random velocity/gate (B9/BA) and random ops read deterministic values.
- Sound-effect voices (instrument 0x7E) and synth waves (≥ 0x80) are skipped
  with a warning; sfx-driven ocarina songs are not sequences at all.
- Pan and filter are sampled at note-on; volume steps under a held note are
  followed per update, as for sm64.
- Reverb index 1 (OoT's filtered reverb, MM's leaky one) is modelled but no
  verified song sends to it.

### 11.7 The app side (index.html CHIPS.usf / chip-worker) — nothing required

`sequenceOfSet` stamps `res.gen`; `renderN64` dispatches on it and reads
the fonts itself from `opts.set` (its RDRAM for resident fonts and the
reverbs), so the existing `renderN64(res.result, {set, banks: seq.banks,
…})` calls work unchanged: for the oot generation `seq.banks` is the font
list read last-first (C6 n picks `sequenceFontTable[off + count − n]`, and
a channel starts on the last-loaded font — the sm64 convention). bank.mjs
now imports usf.mjs (native module imports resolve it). Visible changes:
the "sound-shaping ops ignored" warning shrinks to E9 (note priority) on
most songs, and the MM ocarina minis now fail the capture with "this song
plays no sequence…" instead of importing Pirates' Fortress.
