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
| SM64 Title Theme | 2 | 4008 | 13 | 172→99→90→78→119→172 | 110 s | 769 |
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
