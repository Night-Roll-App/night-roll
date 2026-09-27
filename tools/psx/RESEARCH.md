# PlayStation 1 music formats — research notes

Two routes to note data on PS1:

- **Route A — Sony's sequenced formats (SEQ/SEP + VAB).** MIDI-shaped
  data; no CPU or sound-chip emulation needed. Implemented in this
  directory (`seq.mjs`, `vab.mjs`, `notes.mjs`, `dump.mjs`).
- **Route B — PSF rips.** A zlib'd PS-X EXE that must be *run* on an
  emulated R3000 + SPU; notes would be logged from SPU voice key-ons.
  Researched below; not implemented (cost assessment at the end).
  The container itself is parsed (`psf.mjs`) so the app can sniff it
  and scan its RAM image for embedded SEQ/VAB data.
- **Route A′ — Square's AKAO** (Final Fantasy VII; §6). A second
  sequenced format, read straight from the PSF's RAM image with no
  emulation (`akao.mjs`). Added 2026-09-27 from the real FF7 set.

Byte layouts below were checked against Sony's own *File Formats*
reference (Psy-Q SDK, 1998), the nocash/psx-spx spec, the VGMTrans
source, and loveemu's SEQ write-up. Where sources disagree the
disagreement is stated rather than resolved.

Sources:

- Sony, *File Formats* (Psy-Q DOCS/Devrefs/Filefrmt.pdf), ch. 4 Sound:
  SEQ (fig. 199), SEP (fig. 200), VAG (fig. 201), VAB (fig. 202, table
  4-1) — https://psx.arthus.net/sdk/Psy-Q/DOCS/Devrefs/Filefrmt.pdf
- psx-spx (nocash), CDROM File Audio: VAG / VAB+VH/VB / SEQ+SEP —
  https://psx-spx.consoledev.net/ps1/cdr/cdromfileformats/audio/
- psx-spx (nocash), Sound Processing Unit —
  https://psx-spx.consoledev.net/ps1/spu/soundprocessingunitspu/
- VGMTrans, PS1 format readers —
  https://github.com/vgmtrans/vgmtrans/blob/master/src/main/formats/PS1/PS1Seq.cpp
  https://github.com/vgmtrans/vgmtrans/blob/master/src/main/formats/PS1/Vab.cpp
- loveemu, *PlayStation SEQ Format Overview* —
  https://loveemu.hatenablog.com/entry/20060630/PSX_SEQ_Format
- Neill Corlett, *PSF format specification* (psf_format.txt) —
  https://gist.githubusercontent.com/SaxxonPike/a0b47f8579aad703b842001b24d40c00/raw/psf_format.txt
- PSXDEV / RetroReversing, official library overview (libsnd = SEQ+VAB
  player, libspu = raw SPU) — https://www.retroreversing.com/ps1-libs

## 1. SEQ — single sequence

Extension `.SEQ`. **Big-endian** header (the rest of the PS1 is
little-endian; SEQ was produced by a MIDI converter on the dev PC and
kept SMF byte order).

| off  | size | field |
|------|------|-------|
| 0x00 | 4 | ID `"pQES"` (`SEQp` read as a little-endian u32 = 0x70514553) |
| 0x04 | 4 | version, = 1 |
| 0x08 | 2 | resolution: ticks per quarter note (typ. 0x01E0 = 480, or 120/96) |
| 0x0A | 3 | initial tempo, microseconds per quarter note (0x07A120 = 120 bpm) |
| 0x0D | 1 | time-signature numerator |
| 0x0E | 1 | time-signature denominator as a power of two (2 → /4, 3 → /8) |
| 0x0F | … | score data |
| end  | 3 | `FF 2F 00` end of sequence |

Score data is SMF format-0 track data with these differences
(loveemu; confirmed by VGMTrans's reader):

- **Delta times** are standard MIDI variable-length quantities.
- **Running status** applies, *including after `0xFF` meta events*
  (SMF cancels running status on meta events; SEQ does not — a data
  byte < 0x80 after a meta event is another meta type byte).
- **Note off** is `9n key 00` (velocity 0). `8n` does not occur in
  Sony-converted files; our parser accepts it anyway.
- **Meta events carry no length byte.**
  - `FF 51 tt tt tt` — tempo, 3 bytes, µs per quarter (SMF would be
    `FF 51 03 tt tt tt`).
  - `FF 2F 00` — end of sequence.
  - `FF 58 …` — time signature. Neither VGMTrans (which stops on any
    meta other than 51/2F) nor loveemu documents its length. The header
    stores the signature as two bytes (numer, log2 denom), so our
    parser reads two bytes and then, only if the next two bytes are
    SMF's conventional `18 08` (24 clocks/click, 8 32nds/quarter),
    swallows those too. Flagged in the parse result so a real file that
    disagrees is visible rather than silently mis-timed.
- Channel messages are the MIDI ones: `9n` note on/off (2 data bytes),
  `An` poly pressure (2), `Bn` control change (2), `Cn` program change
  (1), `Dn` channel pressure (1), `En` pitch bend (2, LSB then MSB).
  Program numbers index the VAB's program table (0..127).
- **Loops** are NRPN controllers, on one channel only, not nested:
  `Bn 63 14` (CC 99 = 20) loop start, `Bn 63 1E` (CC 99 = 30) loop
  end, `Bn 06 nn` (CC 6) loop count where 127 = forever. libsnd jumps
  back to the loop-start position when it hits the end marker.
- Volume CC 7, pan CC 10, expression CC 11, reverb depth CC 91 appear
  as in MIDI. Pitch-bend range comes from the tone (`pbmin`/`pbmax`),
  not RPN 0.

## 2. SEP — several sequences in one file

Extension `.SEP`. Same ID; the version field shrinks to two bytes:

| off  | size | field |
|------|------|-------|
| 0x00 | 4 | ID `"pQES"` |
| 0x04 | 2 | version, = 0 (this is how SEP is told from SEQ) |
| 0x06 | … | sequence blocks, back to back |

Each block:

| off  | size | field |
|------|------|-------|
| 0x00 | 2 | sequence ID (0, 1, 2 … big-endian) |
| 0x02 | 2 | resolution |
| 0x04 | 3 | tempo |
| 0x07 | 2 | rhythm (numer, log2 denom) |
| 0x09 | 4 | data size, big-endian, counted from 0x0D |
| 0x0D | … | score data, ending in `FF 2F 00` |

(Sony's fig. 200 prints "Tempo 2" for the second block — a typo; the
psx-spx layout and real files use 3 bytes throughout.)

## 3. VAB — sound bank (VH header + VB body)

Sony's tool emits either one `.VAB` (header immediately followed by
the ADPCM body) or a `.VH`/`.VB` pair (header alone / body alone).
**Little-endian.** Up to 128 programs, 16 tones per program, 254 VAGs.

### VabHdr — 32 bytes

| off  | size | field |
|------|------|-------|
| 0x00 | 4 | ID `"pBAV"` (`VABp` as a LE u32) |
| 0x04 | 4 | version (5, 6 or 7; 7 is usual) |
| 0x08 | 4 | VAB ID |
| 0x0C | 4 | total size of header + body (the `.VAB` size) |
| 0x10 | 2 | reserved (0xEEEE) |
| 0x12 | 2 | number of programs used (psx-spx wonders whether it is "minus 1"; VGMTrans and Sony's fig. 202 — "32 x 16 x number of programs" — treat it as the count, as do we) |
| 0x14 | 2 | number of tones |
| 0x16 | 2 | number of VAGs |
| 0x18 | 1 | master volume (0..127) |
| 0x19 | 1 | master pan (0..127, 64 centre) |
| 0x1A | 1 | bank attribute 1 (user) |
| 0x1B | 1 | bank attribute 2 (user) |
| 0x1C | 4 | reserved (0xFFFFFFFF) |

### ProgAtr — 16 bytes × 128 slots at 0x20 (always all 128)

| off | size | field |
|-----|------|-------|
| 0 | 1 | tones — number of tones in the program (0 = empty slot) |
| 1 | 1 | mvol — program volume |
| 2 | 1 | prior — priority |
| 3 | 1 | mode |
| 4 | 1 | mpan — program pan |
| 5 | 1 | reserved |
| 6 | 2 | attr (user) |
| 8 | 8 | reserved |

### VagAtr (tone) — 32 bytes × 16 per *used* program, at 0x820

The tone table has one 512-byte block per program **whose `tones` count
is non-zero**, in slot order; empty program slots get no block
(VGMTrans: "Number of tones can be 0. That's an empty instrument. We
need to ignore it."). So the tone block for program slot p is the
k-th block, where k = number of non-empty slots before p. All 16 tone
slots of a block are present even when the program uses fewer.

| off  | size | field |
|------|------|-------|
| 0x00 | 1 | prior — tone priority |
| 0x01 | 1 | mode — 0 normal, 4 reverb |
| 0x02 | 1 | vol (0..127) |
| 0x03 | 1 | pan (0..127) |
| 0x04 | 1 | **center** — centre note: the key at which the VAG plays at pitch 0x1000 = 44 100 Hz |
| 0x05 | 1 | **shift** — centre fine tune, 0..127, in 1/128 semitone |
| 0x06 | 1 | min — lowest key this tone answers to |
| 0x07 | 1 | max — highest key |
| 0x08 | 1 | vibW — vibrato width |
| 0x09 | 1 | vibT — vibrato time |
| 0x0A | 1 | porW — portamento width |
| 0x0B | 1 | porT — portamento time |
| 0x0C | 1 | pbmin — pitch-bend range down, semitones |
| 0x0D | 1 | pbmax — pitch-bend range up, semitones |
| 0x0E | 2 | reserved |
| 0x10 | 2 | ADSR1 — SPU voice register value (attack/decay/sustain level) |
| 0x12 | 2 | ADSR2 — SPU voice register value (sustain rate/release) |
| 0x14 | 2 | prog — owning program number |
| 0x16 | 2 | **vag** — VAG number, **1-based** (VGMTrans reads `readShort(+22) - 1`); 0 = none |
| 0x18 | 8 | reserved |

A key-on picks, within the program, the tone(s) whose `min..max`
contain the key (several tones may overlap: layered instruments).

**Pitch.** libsnd computes the voice pitch from
(key, fine) against (center, shift) so that key == center plays the
sample at 44 100 Hz:

    rate_semitones = (key − center) + (fine − shift)/128   (direction of shift: see below)
    SPU pitch      = round(0x1000 × 2^(rate_semitones / 12))

The **sounding** note is therefore `root + (key − center)` where `root`
is the note the raw sample sounds at 44 100 Hz — a property of the
recording, not stored anywhere. This is the SNES root-pitch problem
again, slightly kinder: a composer who wants key 60 to sound C4 sets
center so that it does, so the raw SEQ key is usually already the
musical pitch, and `center` mostly encodes the sample's rate/root
instead of a transposition. `vab.mjs` estimates `root` from the
decoded sample (autocorrelation) and falls back to C4 when the sample
has no clear period (drums, noise). See `notes.mjs` for how the two
pitch readings are reported.

**Direction of `shift`.** VGMTrans converts it to `+shift × 100/128`
cents on the region (sharper). The libsnd `note2pitch` decompilations
this author remembers add `shift` to the centre side, which would make
a positive shift *flatter*. It is below a semitone either way; we
follow VGMTrans and keep it as a `cents` field, never folded into the
integer MIDI note.

### VAG offset table — 512 bytes after the tone table

256 little-endian u16, entry i = size of VAG i **divided by 8**
(Sony: "3-bit right-shifted VAG data size"). Entry 0 is unused; VAG 1
starts at body offset 0, VAG i+1 at the running sum of the preceding
sizes. In a whole `.VAB` file the body starts right after this table:

    body = 0x20 + 0x800 + 0x200 × programsUsed + 0x200

### VB body — raw SPU-ADPCM

No per-sample header (that is what a standalone `.VAG` adds: `"VAGp"`,
big-endian version / size / sample rate at 0x0C/0x10, 16-byte name at
0x20, data from 0x30). Each VAG is a run of 16-byte SPU-ADPCM blocks;
Sony's tool emits an all-zero first block.

**SPU-ADPCM block** (psx-spx, SPU chapter):

| byte | meaning |
|------|---------|
| 0 | low nibble: shift (0..12); high nibble: filter (0..4) |
| 1 | flags: bit0 loop end (set ENDX, jump to loop address), bit1 loop repeat (if bit0: 0 = also force release → one-shot), bit2 loop start (latch this block as the loop address) |
| 2..15 | 28 four-bit samples, low nibble first |

Decode, per nibble `n` (sign-extended 4-bit):

    s = (n << 12) >> shift  +  (old × K0[f] + older × K1[f] + 32) >> 6
    K0 = [0, 60, 115, 98, 122]   K1 = [0, 0, −52, −55, −60]
    clamp to int16; older = old; old = s

(The two hidden filters 5..15 mirror lower ones on real hardware;
files never use them.)

## 4. How the files appear on discs

Almost never as loose `.SEQ`/`.VH`/`.VB` in the ISO root. Typical
shapes, in rough order of frequency:

1. **Loose, standard extensions** (early titles, Sony first-party,
   many Japanese RPGs): `SOUND/BGM01.SEQ`, `SOUND/BGM.VH`, `SOUND/BGM.VB`.
   Trivial: pick the SEQ, pair it with the bank the game loads with it.
2. **Inside a game-specific archive** with an offset/size table
   (`.BIN`, `.DAT`, `.PAK`, `.ARC`, one giant `DATA.BIN`) — the majority.
   The magic strings survive, so a **byte scan for `pQES` / `pBAV`**
   recovers them: a SEQ runs from `pQES` to the next `FF 2F 00`
   (mind that sequence isn't inside a bigger structure), a VH's length
   is computable from its own header (`0x820 + 0x200 × programs +
   0x200`), and its VB is usually adjacent (right after the VH, or at
   the next 2048-byte sector). VGMTrans works exactly this way: it
   scans any file for the signatures, then pairs each SEQ with the
   nearest VAB.
3. **Squaresoft, Konami, Capcom, Namco …** used their own drivers and
   sequence formats (AKAO, KDT1, Capcom's `.Q`, Namco's C352-style
   banks). Those need format-specific parsers (VGMTrans has several)
   or route B. Note: Final Fantasy VII–IX are AKAO, *not* SEQ.
4. **CD-DA / XA streaming** titles have no sequence data at all.

Compressed archives (LZS, custom LZ) hide the magic until unpacked.

## 5. PSF — Portable Sound Format (route B)

A PSF is a snapshot of the game's own sound driver: the PS-X EXE that
the ripper carved out, plus the data it needs, with the game's main
loop replaced by "play track N forever". Playing it means running it.

### Container (Corlett's spec)

| off | size | field |
|-----|------|-------|
| 0 | 3 | `"PSF"` |
| 3 | 1 | version: 0x01 PS1, 0x02 PS2, 0x11 Saturn, 0x12 Dreamcast, 0x21 USF, 0x41 GSF, … |
| 4 | 4 | reserved-area size R (LE) |
| 8 | 4 | compressed program size N (LE) |
| 12 | 4 | CRC-32 of the compressed program (LE) |
| 16 | R | reserved area (PSF1: unused; PSF2: a virtual filesystem) |
| 16+R | N | program, **zlib** stream |
| 16+R+N | … | optional `"[TAG]"` then `key=value` lines: `title`, `artist`, `game`, `year`, `genre`, `comment`, `copyright`, `psfby`, `length` (`mm:ss.ddd`), `fade`, `volume`, `_lib`, `_lib2` … `_libN`, `_refresh` (50/60) |

**minipsf / psflib.** A set's shared driver lives in one `.psflib`;
each `.minipsf` holds only the per-track data plus `_lib=driver.psflib`.
Load order: recurse into `_lib` first (it sets PC and SP), then overlay
this file's own text section on top, then `_lib2`.. `_libN` in order.
Executables are overlaid by their `text start / size`, never
relocated. *Confirmed on the FF7 set (2026-09-27):* the lib is text
`0x80010000 + 0x1E0000`, PC `0x800110C0`; every mini is text
`0x801D0000 + 0x8000` — inside the lib's span — with a placeholder PC
`0x80010000`, so "PC from the first file loaded" is load-bearing, not a
nicety. `psf.mjs` `loadPSFChain` / `assembleRam` implement this. Other
real-tag facts: `utf8=1`, `length` as `m:ss`, `fade` in whole seconds,
multi-line values as repeated keys, reserved area 0.

### PS1 program: PS-X EXE

2048-byte header, then the text section (must be padded to 2048):

| off | size | field |
|-----|------|-------|
| 0x000 | 8 | `"PS-X EXE"` |
| 0x010 | 4 | initial PC |
| 0x014 | 4 | initial GP |
| 0x018 | 4 | text start address (RAM, typically 0x80010000..) |
| 0x01C | 4 | text size |
| 0x030 | 4 | initial SP |
| 0x04C | … | region string ("Sony Computer Entertainment Inc. for Japan/North America/Europe area") — decides 60/50 Hz |

Max uncompressed size 2 033 664 bytes (2 MiB RAM minus the kernel).

### What the CPU is doing

The driver (libsnd or a house driver) runs off the **VBlank interrupt**
(or a root-counter timer): each tick it advances sequence positions,
writes SPU voice registers and key-ons. So a PSF player needs:

- an R3000 interpreter (MIPS I, no FPU; ~60 opcodes plus coprocessor
  0 for interrupts), 2 MiB RAM, the BIOS's memory map and — because
  drivers call BIOS syscalls for interrupt setup and sometimes
  `printf` — a HLE of the handful of BIOS/kernel calls PSF drivers use
  (Highly Experimental HLEs them; it does not run a BIOS image);
- root counters (0x1F801100..) and the interrupt controller
  (0x1F801070 I_STAT / 0x1F801074 I_MASK) so the VBlank actually fires;
- DMA channel 4 (0x1F8010C0..) for SPU RAM uploads, plus the manual
  FIFO path;
- the SPU register file below, and 512 KiB SPU RAM.

Not needed for note logging: GPU, CD-ROM, controllers, GTE, MDEC. But
a driver that waits for a GPU or CD flag will hang without a stub.

### SPU register map (psx-spx)

Base 0x1F801C00. Voice n (0..23) at `0x1F801C00 + n × 0x10`:

| +off | register |
|------|----------|
| 0x0 | volume left (16-bit; bit 15 set = sweep mode) |
| 0x2 | volume right |
| 0x4 | **pitch** — sample rate, 0x1000 = 44 100 Hz (0x0800 = 22 050, 0x2000 = 88 200), practical max 0x3FFF/0x4000 |
| 0x6 | **start address** ÷ 8 (SPU RAM byte address / 8) |
| 0x8 | ADSR1: bit15 attack mode, 14–10 attack shift, 9–8 attack step, 7–4 decay shift, 3–0 sustain level |
| 0xA | ADSR2: bit15 sustain mode, 14 sustain direction, 12–8 sustain shift, 7–6 sustain step, 5 release mode, 4–0 release shift |
| 0xC | ENVX — current envelope volume (read; writes accepted) |
| 0xE | repeat (loop) address ÷ 8 — set by hardware at a loop-start block, or by software |

Control block:

| addr | register |
|------|----------|
| 0x1F801D80/82 | main volume L/R |
| 0x1F801D84/86 | reverb output volume L/R |
| 0x1F801D88 | **KON** voices 0–15 (write 1 bits to key on) |
| 0x1F801D8A | **KON** voices 16–23 |
| 0x1F801D8C | **KOFF** voices 0–15 |
| 0x1F801D8E | **KOFF** voices 16–23 |
| 0x1F801D90/92 | pitch modulation enable (PMON) |
| 0x1F801D94/96 | noise mode enable (NON) — voice plays the noise generator instead of ADPCM |
| 0x1F801D98/9A | reverb enable (EON) |
| 0x1F801D9C/9E | ENDX — voice reached an end-flag block (read) |
| 0x1F801DA2 | reverb work area start |
| 0x1F801DA4 | IRQ address |
| 0x1F801DA6 | transfer start address ÷ 8 |
| 0x1F801DA8 | transfer FIFO (data written here lands in SPU RAM) |
| 0x1F801DAA | SPUCNT: bit15 enable, 14 unmute, 13–10 noise shift, 9–8 noise step, 7 reverb enable, 6 IRQ enable, 5–4 transfer mode (0 stop, 1 manual write, 2 DMA write, 3 DMA read), 3–0 external/CD input bits |
| 0x1F801DAC | transfer control (0x0004 normal) |
| 0x1F801DAE | SPUSTAT |
| 0x1F801DB0/B2 | CD input volume L/R |
| 0x1F801DB4/B6 | external input volume L/R |
| 0x1F801DB8/BA | current main volume L/R |
| 0x1F801DC0–DFF | reverb configuration |

Noise generator: SPUCNT bits 13–8 set its rate; a noise-mode voice's
pitch register is ignored — those voices map to a drum channel like
the 2A03's noise did.

### Note extraction from an SPU log

Record every write to the voice block and to KON/KOFF/NON. A note
starts on a KON bit with that voice's current `pitch`, `start
address`, volumes and ADSR; it ends on KOFF (release begins; ADSR2's
release shift tells how long the tail is) or when the voice's ADPCM
run hits an end block without a repeat flag (ENDX). Pitch changes on a
sounding voice are vibrato/bend/portamento — same "new note only when
the derived MIDI pitch changes and holds" rule the NSF reconstructor
uses. The MIDI note is

    midi = root(sample at start address) + 12 × log2(pitch / 0x1000)

with `root` the SNES-style root-pitch problem: what note the sample at
that SPU address sounds at 44 100 Hz. Options, in order of honesty:
(1) find the VAB in the PSF's RAM image (`pBAV` scan) and use its
tones' `center` — good when the driver is libsnd; (2) autocorrelate
the ADPCM at that address as `vab.mjs` does; (3) per-sample manual
root annotation. Most drivers upload the whole VB into SPU RAM at
start, so (1) recovers the exact tone table.

### Frank cost of route B

- **CPU:** an R3000 interpreter is roughly the 6502 job times four:
  ~60 instructions, 32 registers, delay slots (branch and load),
  coprocessor 0 exceptions for interrupts, unaligned load/store
  quirks. Two to three days to write and debug against a known-good
  reference (there is no `make-test-nsf`-style hand assembly; test
  programs need an assembler or hand-encoded MIPS). ~1500 lines.
- **System:** interrupt controller, root counters, DMA4, memory map
  with the kernel region mirrors (KUSEG/KSEG0/KSEG1), and a BIOS HLE
  for the syscalls drivers touch (`EnterCriticalSection`,
  `SysEnqIntRP`, `OpenEvent/EnableEvent`, `printf`, `memset`…). This
  is where PSF players spend their debugging life: every house driver
  finds a new syscall. Highly Experimental's HLE is ~2000 lines and
  has taken twenty years of edge cases. Budget a week for "libsnd
  games play", open-ended for the rest.
- **SPU:** for *logging* we need only the register file, RAM, the
  ADPCM decoder (done, in `vab.mjs`) and ENDX tracking — a day. For
  *audible* playback (the "chip" button equivalent) add ADSR envelopes,
  interpolation (4-point Gaussian), noise, pitch modulation and the
  reverb: another week to sound like the console.
- **Timing:** the driver runs on VBlank (16.7 ms) but note-on timing
  inside a tick is invisible; resolution is one frame, like the NSF.
  Tempo/meter are not in the log at all — they would be fitted as the
  NSF path fits them. Everything route A gets for free (tempo, meter,
  program per note, exact ticks) is *lost* in route B.
- **Data:** PSF rips exist for nearly every PS1 game, including the
  AKAO/Konami/Capcom titles route A cannot read. That is the
  argument for eventually doing it. The counter-argument: where a game
  is libsnd-based, its PSF contains the SEQ and VAB verbatim in RAM,
  so a `pQES`/`pBAV` scan of the *inflated EXE* feeds route A with no
  emulation at all. That scan is cheap and is the first thing to try
  on any PSF (`psf.mjs` inflates and scans).

Verdict: route A now (done here); a PSF **container** parser with an
in-RAM SEQ/VAB scan is the cheap 80% and is included; a real R3000 +
SPU logger is a multi-week project on the order of the whole NSF
pipeline plus its DSP, to be started only for a specific non-libsnd
soundtrack Josh wants. *Postscript:* the first soundtrack he wanted was
FF7, which is neither libsnd nor emulation-only — its AKAO score is a
byte code readable in place (§6), so the "ported parser" option in
INTEGRATION.md §4 was the one taken.

## 6. AKAO — Square's PS1 sequence format (FF7 flavour)

Measured on the real FF7 PSF set (INTEGRATION.md §6) against two
sources that mostly agree and disagree once:

- VGMTrans, `AkaoSeq.cpp` / `AkaoInstr.cpp` —
  https://github.com/vgmtrans/vgmtrans/blob/master/src/main/formats/Akao/AkaoSeq.cpp
  (event maps per "version": FF7 is VERSION_1_0)
- Qhimm wiki, *FF7/PSX/Sound/AKAO sequence* —
  https://wiki.ffrtt.ru/index.php/FF7/PSX/Sound/AKAO_sequence
  (opcode table with operand sizes and semantics)

**Header (16 bytes)**: `"AKAO"`, u16 id, u16 length (after the
header), u16 reverb type, six BCD bytes `yy mm dd hh mm ss`. Then u32
voice mask at 0x10 (bits 0..23) and one u16 per set bit at 0x14: the
voice's stream offset **relative to the byte after the field**. Later
AKAO (FF8/9, Chrono Cross) has a 0x40 header with the mask at 0x20 and
instrument pointers; `isAKAO` rejects it by shape (byte 0x13 non-zero).

**Score byte code**, one stream per voice, 48 ticks per quarter:

| op | meaning |
|----|---------|
| 0x00–0x83 | note: degree = op ÷ 11, length = `DELTA[op mod 11]` with DELTA = 192 96 48 24 12 6 3 32 16 8 4 (whole … 64th, then triplet half … triplet 16th) |
| 0x84–0x8E | tie: extend the sounding note by `DELTA[op − 0x84]` |
| 0x8F–0x99 | rest |
| 0xA0 | end of voice |
| 0xA1 / 0xF2 | instrument (0xF2: without attack sample) |
| 0xA2 n | next note/tie/rest lasts n ticks instead of its table length |
| 0xA3 / 0xA8 | master volume / volume (0..127); 0xA9 = volume slide (len, target) |
| 0xA5 n / 0xA6 / 0xA7 | octave set / +1 / −1 (masked to 4 bits) |
| 0xC0 / 0xC1 | transpose absolute / relative (s8 semitones) |
| 0xC8 / 0xC9 n / 0xCA | repeat start / until n times (0 = 256) / again; four levels |
| 0xF0 n s16 / 0xF1 n s16 | on the n-th pass jump / jump and leave the repeat |
| 0xEE s16 | jump (relative to the byte after the operand) — the song loop |
| 0xEF n s16 | jump if the game's condition byte == n |
| 0xE8 u16 / 0xE9 len u16 | tempo / tempo slide |
| 0xFD a b | meter: a ticks per beat, b beats per bar (0 0 = none) |
| 0xFE u16 | measure number (marker) |
| 0xEC s16 / 0xED | drum mode on (operand → 5-byte-per-degree map: instrument, key, vol u16, pan) / off; the octave is ignored, degree → key 24 + degree |
| 0xD8 / 0xD9 | tuning absolute / relative: multiplier 1 + n/128 (n ≥ 0) or 1 + n/256 |
| 0xCC / 0xCD, 0xD0 / 0xD1 | slur, legato: no key-off between notes |
| 0xDC s8 | fixed note length = last length + s8, for all following notes |
| rest of 0xA4–0xDF, 0xEA–0xEB, 0xF4–0xF9 | pitch-bend slide, pan, noise, ADSR, vibrato/tremolo/pan LFOs, reverb depth, overlay/alternate voice — operand counts in `AKAO_OPLEN`, no note effect except as noted |
| 0x9A–0x9F, 0xE0–0xE7, 0xF3, 0xFA–0xFC, 0xFF | unimplemented in FF7's driver; none occur in the 90 songs |

Pitch: `octave × 12 + degree + transpose`, taken as the MIDI key (so
octave 5 degree 0 = C4 = 60). FF7's INSTR.DAT articulation (64 bytes:
SPU sample address, loop address, 8 ADSR bytes, then twelve u32 base
pitches with 0x1000 = unity) is what makes that true — VGMTrans derives
`unityKey = 72 − coarse(basePitch[C])`, and the base pitches are set so
the written key sounds. Not verified per instrument here.

**Tempo.** The driver runs a tick accumulator off root counter 2
(sysclock ÷ 8 = 4 233 600 Hz) with a target it loads as an immediate;
each interrupt adds the u16 tempo to a 16.16 counter, one tick per
overflow:

    ticks/s = (4 233 600 / target) × tempo / 65536
    bpm     = ticks/s × 60 / 48

**The one disagreement.** The Qhimm page's prose formula uses
`target = 0x44E8` (exactly 240 Hz) "for FF7, different from other
games"; VGMTrans uses `0x43D1` for VERSION_1_0 (FF7) and `0x44E8` for
everything later. The FF7 psflib settles it: the driver code contains
`ori a1, zero, 0x43D1` (bytes `d1 43 05 34`, 34 occurrences of the
constant in the image) and no `0x44E8` anywhere. The page's own
numeric shortcut, `bpm = tempo / 214.998`, is the 0x43D1 figure (0x44E8
would give 218.45), and Corlett's `length` tags fit 0x43D1 (Tifa's
Theme: two passes = 4:48 exactly). So: FF7 = 0x43D1 = 243.86 Hz;
`TIMER_DIV_FF7` in `akao.mjs`, with `TIMER_DIV_LATER` for a future
FF8/9 reader.

**Loops** are per voice (each voice's own 0xEE), which the real files
exploit: echo voices offset by 32/64 ticks, ostinato voices with a
short period under a long form. The app wants one loop; the rule and
the evidence are in INTEGRATION.md §6.

**Where the data sits in a PSF.** The mini's text is the AKAO
sequence alone (32 KB page at 0x801D0000); the driver, INSTR.DAT and
INSTR.ALL are in the lib's 1.9 MB text. The lib has no AKAO block and
no VAB, so a `pQES`/`pBAV` scan is the right first test and its
emptiness the right cue to try `scanAKAO`.
