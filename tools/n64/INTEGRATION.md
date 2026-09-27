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
