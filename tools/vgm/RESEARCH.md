# VGM / Sega Genesis (Mega Drive) import — format research

What a VGM is, what the two Genesis sound chips expose, and the formulas the
importer in this directory relies on. Companion to tools/nsf/ (NES): the NSF
pipeline has to *run the game's code* on a 6502 to discover the register
writes; a VGM already **is** the register write log, timestamped at 44100 Hz.
No CPU emulation, no play-routine cadence, no frame guessing.

Sources (consulted from memory of the documents; re-verify a detail against
the live page before relying on it for something new):

- VGM specification 1.71 (vgmrips wiki): https://vgmrips.net/wiki/VGM_Specification
- GD3 tag specification: https://vgmrips.net/wiki/GD3_Specification
- "Sega2" — *Genesis Software Manual*, Sega's own YM2612 register
  description (the "sega2f" file); mirrored with commentary by Maxim at
  https://www.smspower.org/maxim/Documents/YM2612 and scanned at
  https://segaretro.org/Genesis_Software_Manual
- SN76489 (smspower development wiki):
  https://www.smspower.org/Development/SN76489
- Plutiedev register summaries (a clearer modern restatement of Sega2):
  https://plutiedev.com/ym2612-registers and https://plutiedev.com/psg
- Nemesis' YM2612 hardware research thread (envelope/TL/operator truths the
  official doc gets vague on): http://gendev.spritesmind.net/forum/viewtopic.php?t=386

## 1. The VGM container

Little-endian throughout. Files may be gzip-compressed (`.vgz`, magic
`1F 8B`); inflate first, then parse. Plain files start with `"Vgm "`.

### Header (offsets; "rel" = value is relative to its own field offset)

| off  | size | field | notes |
|------|------|-------|-------|
| 0x00 | 4 | `"Vgm "` | magic |
| 0x04 | 4 | EOF offset (rel) | file length = 0x04 + value |
| 0x08 | 4 | version, BCD | 0x00000150 = 1.50, 0x00000171 = 1.71 |
| 0x0C | 4 | SN76489 clock, Hz | 0 = chip absent. Genesis: 3579545 |
| 0x10 | 4 | YM2413 clock | SMS FM unit; 0 on Genesis rips |
| 0x14 | 4 | GD3 offset (rel) | 0 = no tag |
| 0x18 | 4 | total samples | length of the whole log in 44100 Hz samples |
| 0x1C | 4 | loop offset (rel) | 0 = no loop; else the command where the loop restarts sits at absolute offset 0x1C + value |
| 0x20 | 4 | loop samples | length of one loop pass; total − loop = intro |
| 0x24 | 4 | rate (1.01+) | 50/60 Hz refresh hint; informational |
| 0x28 | 2 | SN76489 feedback pattern (1.10+) | Genesis: 0x0009 |
| 0x2A | 1 | SN76489 shift-register width (1.10+) | Genesis: 16 |
| 0x2B | 1 | SN76489 flags (1.51+) | bit 0 frequency-0 is 0x400, bit 1 negate output, bit 2 stereo off, bit 3 /8 clock divider off |
| 0x2C | 4 | YM2612 clock (1.10+) | Genesis NTSC: 7670454 (= 53693175 / 7); PAL: 7600489. Bit 31 = two chips, bit 30 (1.51+) = YM3438 variant |
| 0x30 | 4 | YM2151 clock (1.10+) | |
| 0x34 | 4 | VGM data offset (rel) (1.50+) | data starts at 0x34 + value; **for versions < 1.50 the data starts at 0x40** and this field is 0 |
| 0x38… | | further chip clocks, one u32 each: Sega PCM 0x38 (+interface reg 0x3C), RF5C68 0x40, YM2203 0x44, YM2608 0x48, YM2610 0x4C, YM3812 0x50, YM3526 0x54, Y8950 0x58, YMF262 0x5C, YMF278B 0x60, YMF271 0x64, YMZ280B 0x68, RF5C164 0x6C, PWM 0x70, AY8910 0x74 (+type/flags 0x78–0x7B), volume modifier / loop base / loop modifier 0x7C–0x7F (1.51/1.60), GB DMG 0x80, NES APU 0x84, MultiPCM 0x88, uPD7759 0x8C, OKIM6258 0x90, flags 0x94–0x97, OKIM6295 0x98, K051649 0x9C, K054539 0xA0, HuC6280 0xA4, C140 0xA8, K053260 0xAC, Pokey 0xB0, QSound 0xB4, SCSP 0xB8 (1.71), extra-header offset 0xBC (1.70), WonderSwan 0xC0, VSU 0xC4, SAA1099 0xC8, ES5503 0xCC, ES5506 0xD0, ES channels 0xD4, X1-010 0xD8, C352 0xDC, GA20 0xE0 (1.71) | none matter for Genesis; the header grows with the version, and a field past the header's own length reads as 0 |

Rules of thumb:

- Read only fields that lie **before the data offset**: a 1.10 file's header
  is 0x40 bytes, a 1.50 file's is usually 0x40 too (data offset 0x0C), a
  1.60/1.70 file's is 0x80/0x100. Fields beyond are zero by definition.
- In files older than 1.10 the YM2612 (and YM2151) clock lives in the
  YM2413 field at 0x10 (the spec's compatibility note).
- If the YM2612 clock is 0 but 0x52/0x53 commands appear, assume NTSC
  7670454 Hz — enough malformed rips exist that a hard failure helps no one.
- The wild writes **7670453** (one Hz under the nominal 53693175/7 —
  every Sonic 1/2 file, 2026-09-27); keep it verbatim, the pitch effect is
  a hundredth of a cent.
- A loop offset that points at the first command (loop sample 0) is legal
  and common: the whole tune loops with no intro (Sonic 2's Hill Top,
  Death Egg). Consumers must test `loopSample != null`, not truthiness.
- Genesis rips open with one or two **0x4F** (Game Gear stereo) bytes —
  the logger's PSG init — despite the chip not existing on the console.
  Skip one operand; never treat the command set as a system fingerprint.
- Sonic-era loggers **pre-write whole DAC samples at time 0** with the
  wait-0 form (0x80 × 2500 between two 0xE0s before the first real wait).
  A burst with no time span is a logging artefact, not a drum hit.

### Command stream

Starts at the data offset, ends with `0x66`. Time advances **only** through
wait commands; every other command is instantaneous at the current sample.

| byte | operands | meaning |
|------|----------|---------|
| 0x4F | dd | Game Gear PSG stereo mask (SMS/GG only) |
| **0x50** | dd | **SN76489 PSG write** — one byte, the chip's whole interface |
| 0x51 | aa dd | YM2413 register write |
| **0x52** | aa dd | **YM2612 port 0 write** (register aa = dd; channels 1–3 + global regs) |
| **0x53** | aa dd | **YM2612 port 1 write** (channels 4–6) |
| 0x54–0x5F | aa dd | other FM chips (YM2151, YM2203, YM2608 ×2, YM2610 ×2, YM3812, YM3526, Y8950, YMZ280B, YMF262 ×2) |
| **0x61** | nn nn | **wait** n samples (u16) |
| **0x62** | — | **wait 735** samples (1/60 s — one NTSC frame; most Genesis drivers tick here) |
| **0x63** | — | **wait 882** samples (1/50 s) |
| 0x64 | cc nn nn | override the length of 0x62/0x63 (rare; treat as 3 operands) |
| **0x66** | — | **end of data** |
| **0x67** | 0x66 tt ss ss ss + data | **data block**: type tt, size ss (u32; mask bit 31, used for dual-chip). Type 0x00 = YM2612 PCM bank — the DAC samples the 0x8n commands stream from. Types 0x80+ carry a leading u32 ROM size + u32 start address before the data (not YM2612) |
| 0x68 | 0x66 cc oo oo oo dd dd dd ss ss ss | PCM RAM write (12 bytes total; RF5C68 etc., not Genesis) |
| **0x70–0x7F** | — | **wait (n & 15) + 1** samples (1..16) |
| **0x80–0x8F** | — | **YM2612 DAC write**: write the next byte of the PCM bank to port 0 reg 0x2A, then wait (n & 15) samples. This is how sampled drums live in a VGM: one command per output sample |
| 0x90 | ss tt pp cc | DAC stream: setup (stream id, chip type, port, command) |
| 0x91 | ss dd ll bb | DAC stream: set data bank (block type), step size, step base |
| 0x92 | ss ff ff ff ff | DAC stream: set frequency (u32 Hz) |
| 0x93 | ss aa aa aa aa mm ll ll ll ll | DAC stream: start at bank offset aa (0xFFFFFFFF = current), length mode mm (0 ignore, 1 commands, 2 msec, 3 play to end; bit 7 loop), length ll |
| 0x94 | ss | DAC stream: stop |
| 0x95 | ss bb bb ff | DAC stream: fast start of data block bb (u16 index among blocks of the stream's type); flags bit 0 loop, bit 4 reverse |
| 0xA0 | aa dd | AY8910 write |
| 0xB0–0xBF | aa dd | two-operand writes for the 1.61+ chips |
| 0xC0–0xDF | 3 operands | three-operand writes (Sega PCM, RF5C68 memory, etc.) |
| **0xE0** | oo oo oo oo | **seek** to absolute offset oo in the YM2612 PCM bank (u32) — the DAC pointer the 0x8n commands advance |
| 0xE1 | mm ll aa dd | C352 write |
| reserved: 0x30–0x3F (1 operand), 0x40–0x4E (2 operands since 1.60), 0xA1–0xAF (2), 0xC9–0xCF (3), 0xD7–0xDF (3), 0xE2–0xFF (4) | | skip by operand count so unknown chips don't derail the parse |

Dual-chip files (bit 31 of a clock) address the second chip with the command
byte + 0x50 (second PSG 0x30, second YM2612 0xA2/0xA3). Genesis has one of
each; the parser logs and ignores those.

The **loop**: when the parser's cursor reaches the absolute loop offset it
records the current sample time — that is the loop start. By vgmrips'
logging convention a file holds *intro + exactly one loop pass*, so total
samples = intro + loop samples, and the cut rule the NSF pipeline had to
discover by loop detection ("intro + one pass") is free here.

### GD3 tag

At the GD3 offset: `"Gd3 "`, u32 version (0x00000100), u32 payload length,
then eleven UTF-16LE strings, each `00 00`-terminated, in this order:
track name (EN), track name (JP), game (EN), game (JP), system (EN),
system (JP), composer (EN), composer (JP), release date, ripper, notes.

## 2. YM2612 (OPN2) — the FM chip

Six four-operator FM channels. Registers are addressed by (port, address):
port 0 holds the global registers and channels 1–3, port 1 repeats the
per-channel block for channels 4–6. Within a per-channel register the low two
bits of the address select the channel (0, 1, 2; 3 is unused), so
`reg + ch` for ch ∈ {0,1,2} on the right port.

Per-operator registers add `4 × slot`, and the slot order on the bus is
**op1, op3, op2, op4** (addresses +0, +4, +8, +12). So total level lives at
0x40 (op1), 0x44 (op3), 0x48 (op2), 0x4C (op4) for channel 1, plus ch for the
other channels. Getting this order wrong swaps op2 and op3, which matters for
which operators are *carriers* (see algorithms).

### Global registers (port 0 only)

| reg | field |
|-----|-------|
| 0x22 | LFO enable (bit 3) + frequency (bits 0–2) |
| 0x24/0x25/0x26 | timers A and B |
| 0x27 | bits 6–7: **channel 3 mode** — 00 normal, 01 *special* (each operator of ch3 has its own frequency), 10 CSM; bits 0–5 timer control |
| **0x28** | **key on/off**: bits 0–2 = channel code (0,1,2 → ch1–3; 4,5,6 → ch4–6; 3 and 7 unused), bits 4–7 = operator slots to key (bit 4 op1, bit 5 op2, bit 6 op3, bit 7 op4). Any non-zero slot mask from a zero mask is a note attack; writing 0 releases. Register 0x28 is *always* on port 0, even for channels 4–6 |
| 0x2A | **DAC data** (unsigned 8-bit, 0x80 = silence) |
| 0x2B | **DAC enable** (bit 7): when set, channel 6's FM output is replaced by the DAC byte — the drum channel on most Genesis soundtracks |

### Per-operator registers (`reg + 4×slot + ch`)

| reg | fields |
|-----|--------|
| 0x30 | DT1 (detune, bits 4–6), MUL (multiplier, bits 0–3; 0 = ×½) |
| **0x40** | **TL total level**, 7 bits, 0 = loudest, 127 = silent, **0.75 dB per step** (≈ −95 dB at 127) |
| 0x50 | RS rate scaling (bits 6–7), AR attack rate (bits 0–4) |
| 0x60 | AM enable (bit 7), D1R first decay rate |
| 0x70 | D2R second decay rate |
| 0x80 | D1L sustain level (bits 4–7), RR release rate (bits 0–3) |
| 0x90 | SSG-EG |

### Per-channel registers (`reg + ch`)

| reg | fields |
|-----|--------|
| **0xA0–0xA2** | **F-number low 8 bits** (channels 1–3 / 4–6 by port) |
| **0xA4–0xA6** | **block (bits 3–5) + F-number high 3 bits (bits 0–2)**. This register is a *latch*: the chip only takes the new block/high bits when the matching 0xA0–0xA2 low byte is written afterwards. Drivers therefore always write 0xA4 then 0xA0. The importer models exactly that |
| 0xA8–0xAA / 0xAC–0xAE | channel 3 special-mode frequencies for operators 3, 1, 2 respectively (0xA8/0xAC → op3, 0xA9/0xAD → op1, 0xAA/0xAE → op2); operator 4 keeps 0xA2/0xA6 |
| **0xB0–0xB2** | feedback (bits 3–5, op1 self-modulation), **algorithm (bits 0–2)** |
| 0xB4–0xB6 | L/R output enables (bits 7/6), AMS, FMS |

### Pitch

    f = Fnum × clock / (144 × 2^(21 − block))      clock = 7670454 Hz (NTSC)

11-bit Fnum (0–2047), 3-bit block (0–7, one octave each). Sanity anchor:
A4 = 440 Hz → block 4, Fnum ≈ 1082.7, and Sega2's own table lists A = 1081
at that clock (Sonic's SMPS driver uses 1084, +2 cents). C4 (261.63 Hz) is
block 4 / Fnum 644. Because Fnum is 11 bits, drivers keep one Fnum table
for every octave and only change block; equal-tempered pitches sit within
±1 cent of integer Fnums in block 4, coarser in low blocks (block 0
resolution ≈ 5 cents around C1).

**That formula is the channel's *base* frequency, not what you hear.**
Each operator runs at base × MUL (register 0x30, bits 0–3; MUL 0 = ×½),
so the sounding pitch is the *carriers'* multiple of it. This is not a
corner case (found 2026-09-27 against the real Sonic rips, RESEARCH was
wrong to leave it out): Sonic's chord-stab voice runs all four operators
at MUL 4 — its Fnums read two octaves below the notes — and its bass voice
has the carrier at MUL 0, an octave *below* its Fnum. Read Fnums alone and
the roll inverts. Rule the importer applies: pitch = base × MUL of the
lowest carrier; when carriers sit at different MULs (Oil Ocean's bass: op2
×6, op3/op4 ×4 — a fifth apart) the lowest is the note and the spread is
recorded on the event (`mul`, `mulHi`). Detune (DT1, ±a few cents to a
few dozen at low keycodes) is ignored. An unwritten MUL is treated as ×1:
the chip resets to 0 but every logged driver writes the voice before it
keys, so "unwritten" means "no information", not "half speed". A MUL
written under a held note is the *next* note's voice (SMPS sends it about
a millisecond before the key-off) and does not re-pitch the held one.

### Algorithms and carriers (what decides loudness)

Only *carrier* operators reach the output; modulators shape timbre. Per
algorithm (Sega2 diagram, op numbering 1–4):

| alg | carriers |
|-----|----------|
| 0–3 | op4 |
| 4 | op2, op4 |
| 5, 6 | op2, op3, op4 |
| 7 | op1, op2, op3, op4 (additive) |

So "how loud is this note" = the carriers' TL at key-on (plus the envelope,
which we do not model). The importer turns TL into MIDI velocity by summing
carrier amplitudes (10^(−0.75·TL/20)) and taking the square root (MIDI
players use a square-law velocity curve), clamped at 1.0 for multi-carrier
algorithms. A modulator's TL shifts brightness, not level — ignored.

### Channel 3 special mode

With 0x27 bits 6–7 = 01, channel 3's operators 1–3 get their own Fnum/block
(above) and operator 4 keeps the normal pair. Used for chords-on-one-channel
in algorithm 7, and for detuned bells. The importer reports channel 3's
pitch from operator 4 (always a carrier) and flags special mode on the
event; a chord spread across the other operators is an acknowledged
approximation.

### Channel 6 DAC mode

When 0x2B bit 7 is set the sixth channel becomes an 8-bit PCM output;
register 0x2A (or the 0x8n stream commands, or 0x90–0x95 streams) carries
the samples. There is no note-on: a drum hit is a *burst* of non-0x80
samples. The importer clusters DAC writes into bursts (a gap or a run of
near-0x80 silence ≥ 30 ms ends one, **and so does an 0xE0 seek** — the
sample pointer being reset is the driver re-triggering a drum, and dense
patterns never gap: Sonic 2's Final Boss keeps the DAC busy for 58 s
straight, 340 seeks, and read as one hit before the seek rule) and
reports one percussion onset per burst with velocity from the burst's
peak amplitude (sample byte 0x00 is 128 from centre; clamped to 127).

## 3. SN76489 — the PSG

Three square-wave tone channels plus one noise channel, each with a 4-bit
attenuator. Single 8-bit write interface (the VGM's 0x50 dd):

    1 cc t dddd   latch/data byte: channel cc (0–2 tone, 3 noise),
                  t = 1 → volume (attenuation dddd), t = 0 → tone/noise
                  (dddd = low 4 bits of the 10-bit period, or the 3-bit
                  noise control)
    0 - dddddd    data byte: high 6 bits of the *latched* tone channel's
                  period (or, for a latched volume/noise register, the low
                  bits again)

Tone: `f = clock / (32 × period)`, clock 3579545 Hz, period 1–1023 (period
0 acts like 1024 on Genesis/SMS — the "frequency 0 is 0x400" flag; either
way it is 109 Hz, not silence). C3 (130.81 Hz) → period 855; A4 → 254.
Only tone channel 3's period drives the noise channel in its "tone 3" mode.

Attenuation: 0 = full, 15 = off, 2 dB per step. A PSG "note" is: set period
(two bytes), attenuation < 15; the driver then walks the attenuation up as a
software envelope and finally writes 15.

Noise: 3-bit control `FB rr` — FB = 1 white noise, 0 periodic ("buzz");
rr = 00 clock/512 (highest), 01 /1024, 10 /2048, 11 the period of tone
channel 3. Writing the control register resets the shift register, which is
audible as a re-attack — the importer counts it as a new hit when the
channel is already audible. In the Genesis the PSG is inside the VDP, but
the register model is the plain SN76489.

## 4. What this means for reconstruction

- Time axis: samples at 44100 Hz. `t / 44100` = seconds. No frame rounding
  problem; drivers usually tick at 60 Hz (0x62) anyway.
- FM onset = 0x28 write with a non-zero slot mask on a channel whose mask
  was zero. Pitch = the channel's *latched* Fnum/block at that instant
  (0xA4 then 0xA0). Duration to the next 0x28 write with mask 0 (or to a
  re-key: some drivers key off and on within the same sample).
- FM pitch during a note: vibrato re-writes Fnum every tick; use the same
  ±70-cent rule the NSF importer uses (compare to the note's *starting*
  frequency) so held notes are not shredded and real steps still split.
- PSG tone onset = attenuation leaving 15, or a pitch step while audible.
- Noise/DAC are unpitched; they go to MIDI channel 10 with fixed drum
  numbers chosen by noise rate / burst — labels in .notes.txt keep the raw
  fact (`N1w` = white noise rate 1; `DAC`).
- The loop point is given, not detected; the file is already cut to
  intro + one pass.
