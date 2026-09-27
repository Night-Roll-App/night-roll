# SPC / S-DSP research notes — what an SNES import has to know

Companion to `tools/nsf/` (the NES pipeline). Same job — run the game's
own sound driver in an emulator, log every sound-chip register write,
turn the log into notes — but the SNES chip plays **samples**, not tones,
and that one difference drives everything below: a NES period IS a pitch;
an SNES PITCH is a playback *rate* relative to a sample whose own pitch
nobody wrote down.

Sources (all consulted 2026-09-26):

- **fullsnes** (Martin Korth) — the densest single reference; sections
  "SNES APU SPC700 CPU …", "SNES APU DSP BRR Samples / BRR Pitch /
  ADSR-Gain Envelope / Volume / Control / Echo Registers", "SNES APU I/O
  Ports". https://problemkaputt.de/fullsnes.htm
- **SNESdev wiki**: https://snes.nesdev.org/wiki/S-SMP (CPU side, I/O
  map, timers), https://snes.nesdev.org/wiki/S-DSP_registers (every DSP
  register, envelope step rules), https://snes.nesdev.org/wiki/BRR_samples
  (block format, filters), https://snes.nesdev.org/wiki/SPC-700_instruction_set
  (mnemonics, cycles, flags).
- **Anomie's S-DSP Doc** — the original in-depth DSP write-up (envelope
  timing, interpolation, echo). https://www.romhacking.net/documents/191/
- **SPC file format spec** ("SNES-SPC700 Sound File Data v0.30", the
  SNESAmp/Alpha-II document): http://www.snesmusic.org/files/spc_file_format.txt
- Pitch detection: McLeod & Wyvill, "A Smarter Way to Find Pitch" (ICMC
  2005) — the normalized square difference function used for root
  estimation. http://www.cs.otago.ac.nz/tartini/papers/A_Smarter_Way_to_Find_Pitch.pdf

Everything in this document that the code relies on is also exercised by
`tests/spc.test.mjs` against a synthetic SPC we assemble ourselves.

---

## 1. The SPC file

An `.spc` is a **snapshot**, not a program: the entire 64 KB of sound RAM
plus CPU and DSP registers, frozen while the game was playing. Playing it
back means restoring that state and letting the CPU run. There is no
init/play entry point like NSF — the driver is already mid-loop, timers
armed, and it simply continues. (Consequence: a note that was already
sounding at dump time has no onset in our log; we see its ENVX > 0 and
treat it as "sounding since t = 0".)

Layout (offsets in hex; total 66,048 bytes minimum):

| Offset | Size | Content |
|---|---|---|
| 00000 | 33 | `"SNES-SPC700 Sound File Data v0.30"` |
| 00021 | 2 | 26, 26 |
| 00023 | 1 | 26 = ID666 tags present, 27 = absent |
| 00024 | 1 | minor version (30) |
| 00025 | 2 | **PC** (little-endian) |
| 00027 | 1 | **A** |
| 00028 | 1 | **X** |
| 00029 | 1 | **Y** |
| 0002A | 1 | **PSW** |
| 0002B | 1 | **SP** (low byte; the stack lives in page 1) |
| 0002C | 2 | reserved |
| 0002E | 32 | song title |
| 0004E | 32 | game title |
| 0006E | 16 | dumper |
| 0007E | 32 | comments |
| 0009E | 11 | dump date (text `MM/DD/YYYY`; binary variant: 4 bytes + 7 zero) |
| 000A9 | 3 | seconds to play before fade (text; binary variant 3 bytes) |
| 000AC | 5 | fade length in ms (text; binary variant 4 bytes + 1) |
| 000B1 | 32 | artist |
| 000D1 | 1 | default channel disables |
| 000D2 | 1 | emulator used (0 unknown, 1 ZSNES, 2 Snes9x) |
| 000D3 | 45 | reserved |
| **00100** | **65536** | **the 64 KB APU RAM image** |
| **10100** | **128** | **the 128 S-DSP registers** |
| 10180 | 64 | unused |
| 101C0 | 64 | "extra RAM": the bytes under `$FFC0-$FFFF` when the IPL ROM is mapped over them |
| 10200 | … | optional extended ID666 (`xid6` RIFF-style chunk: sub-chunks with id/type/size; carries long titles, loop lengths, OST info) |

The text/binary ID666 ambiguity is real: the spec has no flag, so readers
sniff (if bytes `0xA9..0xAB` are ASCII digits it's text; a binary date has
a zero at `0xA2`). `spc.mjs` does the sniff and keeps the raw bytes too.

## 2. The machine: S-SMP (SPC700 core) + S-DSP

Two chips share the 64 KB RAM. The **SPC700** (in the S-SMP) runs the
game's sound driver at **1.024 MHz** (24.576 MHz / 24). The **S-DSP**
reads samples out of that RAM and mixes 8 voices at **32,000 Hz** — one
output sample every 32 CPU cycles. The CPU cannot touch the DSP except
through two memory-mapped bytes (`$F2` address, `$F3` data), which is what
makes logging every DSP write trivial: one bus address.

### 2.1 SPC700 memory map

| Range | What |
|---|---|
| `$0000-$00EF` | direct page 0 (fast `dp` addressing) |
| `$00F0-$00FF` | **I/O registers** (below) — reads/writes here never reach RAM for `$F0-$F7`; `$F8/$F9` are plain RAM |
| `$0100-$01FF` | direct page 1 (when PSW.P = 1) and the **stack** (`SP` indexes `$0100+SP`, growing down) |
| `$0200-$FFBF` | RAM — driver code, sequence data, sample directory, BRR samples, echo buffer, all of it |
| `$FFC0-$FFFF` | RAM, or the 64-byte **IPL boot ROM** when `CONTROL` bit 7 = 1 (reads only; writes still go to RAM) |

### 2.2 I/O registers `$F0-$FF`

| Addr | Name | R/W | Meaning |
|---|---|---|---|
| `$F0` | TEST | W | test register; games leave it at `$0A` — ignore |
| `$F1` | CONTROL | W | bit 0-2: enable timer 0/1/2 (0→1 transition resets that timer's counters); bit 4: clear input ports 0-1; bit 5: clear ports 2-3; bit 7: map IPL ROM at `$FFC0` |
| `$F2` | DSPADDR | R/W | selects DSP register `$00-$7F` (bit 7 set = reads work, writes ignored) |
| `$F3` | DSPDATA | R/W | the selected DSP register |
| `$F4-$F7` | CPUIO0-3 | R/W | the four communication ports with the 65816. Read = what the main CPU last wrote; write = latch for the main CPU. In an SPC dump there is no main CPU: reads return the dumped RAM byte, forever. Drivers that wait for a handshake here will hang — a known class of "silent SPC". |
| `$F8-$F9` | — | R/W | plain RAM |
| `$FA-$FC` | T0DIV-T2DIV | W | timer target (0 means 256) |
| `$FD-$FF` | T0OUT-T2OUT | R | 4-bit tick counter; **reading clears it** |

### 2.3 Timers — the driver's metronome

Timers 0 and 1 count at **8,000 Hz** (CPU clock / 128), timer 2 at
**64,000 Hz** (clock / 16). An internal 8-bit stage counter increments
each tick; when it equals the target it resets and the 4-bit OUT
register increments. The driver polls `$FD` in its main loop
(`MOV A,$FD / BEQ` …) and advances its sequencer by the returned count.
Nearly every commercial driver (Nintendo's N-SPC, Square's, Konami's)
derives its tempo from timer 0 with a target between ~$10 and $FF, i.e.
a sequencer tick every 2–32 ms; the whole score lives on that grid.
This is why our note timestamps come out with jitter far below the NES's
16.7 ms frame: the "frame" of an SPC capture is whatever the timer says.

### 2.4 SPC700 CPU summary

Registers: `A`, `X`, `Y` (8-bit), `SP` (8-bit, page 1), `PC` (16-bit),
`PSW` = `N V P B H I Z C`. The 16-bit pair `YA` (Y high) is the operand of
the word instructions. The `P` flag switches the direct page between
`$00xx` and `$01xx`; `H` is the half-carry for BCD (`DAA`/`DAS`).

Addressing modes: `#imm`, `dp`, `dp+X`, `dp+Y`, `!abs`, `!abs+X`,
`!abs+Y`, `(X)`, `(X)+` (post-increment), `(Y)`, `[dp+X]` (indexed
indirect), `[dp]+Y` (indirect indexed), `[!abs+X]` (JMP only),
`dp.bit` and `mem.bit` (13-bit address + 3-bit bit number packed into a
word), and `rel` (signed 8-bit branch offset from the next instruction).

Instruction families (all 256 opcodes are defined; there are no illegal
opcodes):

- **MOV** in every register/memory direction (`MOV A,dp`, `MOV dp,A`,
  `MOV dp,dp`, `MOV dp,#imm`, `MOV (X)+,A`, …). Loads into A/X/Y set N/Z;
  stores set nothing.
- **ALU**: `OR AND EOR CMP ADC SBC`, each with the same operand shapes
  per row of the opcode matrix (`A,dp` / `A,dp+X` / `A,!abs` / `A,!abs+X`
  / `A,(X)` / `A,!abs+Y` / `A,[dp+X]` / `A,[dp]+Y` / `A,#imm` / `dp,#imm`
  / `dp,dp` / `(X),(Y)`). `ADC/SBC` set N V H Z C; `CMP` sets N Z C.
  `CMP X,…` and `CMP Y,…` exist for `#imm`, `dp`, `!abs`.
- **Shifts/rotates** `ASL ROL LSR ROR` on A, dp, dp+X, !abs.
- **INC/DEC** on A, X, Y, dp, dp+X, !abs; **INCW/DECW dp** on a word.
- **Word ops on YA**: `ADDW`, `SUBW`, `CMPW`, `MOVW YA,dp`, `MOVW dp,YA`,
  `MUL YA` (YA = Y×A), `DIV YA,X` (A = quotient, Y = remainder, with the
  chip's odd overflow behaviour when Y ≥ X).
- **Bit ops**: `SET1/CLR1 dp.bit`, `BBS/BBC dp.bit,rel`, `TSET1/TCLR1
  !abs` (mem |= A / mem &= ~A, flags from A−mem), and the carry-bit
  family `AND1 OR1 EOR1 MOV1 NOT1 C,mem.bit` (incl. inverted `/mem.bit`).
- **Branches**: `BRA BEQ BNE BCS BCC BVS BVC BMI BPL`, plus the
  compare-and-branch `CBNE dp,rel` / `CBNE dp+X,rel` and the loop
  primitives `DBNZ dp,rel` / `DBNZ Y,rel`.
- **Calls**: `CALL !abs`, `PCALL up` (to `$FF00+up`), `TCALL n` (vector
  at `$FFDE−2n`), `RET`, `RET1`/`RETI`, `BRK` (vector `$FFDE`).
- **Stack**: `PUSH/POP A X Y PSW`; `MOV SP,X` / `MOV X,SP`.
- **Flags**: `CLRC SETC NOTC CLRV CLRP SETP EI DI`.
- **Misc**: `NOP`, `XCN A` (swap nibbles), `DAA/DAS`, `SLEEP`, `STOP`.

Cycle counts (2–12 per instruction, branches +2 when taken) matter only
so the timers tick at the right rate relative to the code — the pipeline
wants the ORDER and the timestamps of DSP writes, not cycle-exact audio.
`cpu-spc700.mjs` uses the standard per-opcode table.

## 3. The S-DSP

128 byte-wide registers, addressed `$00-$7F`. High nibble = voice number
for the per-voice set; the `$xC/$xD/$xF` columns hold globals.

### 3.1 Per-voice registers (voice v at `$v0-$v9`)

| Reg | Name | Meaning |
|---|---|---|
| `$v0` | VOL(L) | left volume, signed 8-bit (negative = phase-inverted) |
| `$v1` | VOL(R) | right volume, signed |
| `$v2` | P(L) | pitch low byte |
| `$v3` | P(H) | pitch high 6 bits → **14-bit PITCH `$0000-$3FFF`** |
| `$v4` | SRCN | sample number: index into the directory (section 4) |
| `$v5` | ADSR(1) | bit 7 = use ADSR (else GAIN); bits 6-4 = DR; bits 3-0 = AR |
| `$v6` | ADSR(2) | bits 7-5 = SL (sustain level); bits 4-0 = SR |
| `$v7` | GAIN | bit 7 = 0: direct level (bits 6-0 → env = value << 4); bit 7 = 1: bits 6-5 mode, bits 4-0 rate |
| `$v8` | ENVX | **read-only**: current envelope, 7 bits (env >> 4) |
| `$v9` | OUTX | **read-only**: current output sample, signed 8 (after envelope, before VOL) |

### 3.2 Global registers

| Reg | Name | Meaning |
|---|---|---|
| `$0C/$1C` | MVOL(L/R) | main volume, signed |
| `$2C/$3C` | EVOL(L/R) | echo volume, signed |
| `$4C` | **KON** | write a 1 in bit v: key voice v on (restart sample, envelope from 0). The bits are edge-triggered: the DSP samples the register every 2 output samples and acts on newly-set bits; drivers write the mask, not individual bits |
| `$5C` | **KOFF** | bit v = 1: voice v enters release (−8/sample) — and stays in release for as long as the bit is set, so a KON with the KOFF bit still set is released immediately. Drivers write KOFF, wait, then clear it |
| `$6C` | FLG | bit 7 soft reset (all voices off, KON/KOFF cleared, mute), bit 6 mute, bit 5 ECEN (1 = echo buffer writes disabled), bits 4-0 **noise clock** (rate-table index, 0 = stopped … 31 = fastest) |
| `$7C` | ENDX | **read-only**: bit v set when voice v reaches a BRR block with the END bit; cleared by writing anything, and cleared for a voice on its KON. Drivers poll it to know a one-shot sample finished |
| `$0D` | EFB | echo feedback, signed |
| `$2D` | PMON | pitch-modulation enable (bit v: voice v's pitch is modulated by voice v−1's OUTX; bit 0 unused) |
| `$3D` | NON | noise enable (bit v: voice v plays the LFSR noise instead of its sample; PITCH is ignored, envelope still applies) |
| `$4D` | EON | echo enable per voice |
| `$5D` | **DIR** | sample directory page: directory base address = DIR × `$100` |
| `$6D` | ESA | echo buffer start page (× `$100`) |
| `$7D` | EDL | echo delay, 4 bits × 16 ms (buffer = EDL × 2 KB) |
| `$0F,$1F…$7F` | FIR C0-C7 | echo 8-tap FIR coefficients, signed |

Registers `$xA, $xB, $xE` are unused (read back what was written).

### 3.3 Pitch — the crux

The DSP steps through a voice's decoded sample by **PITCH / 4096 source
samples per output sample**, so a voice's *playback rate* is

```
rate = 32000 × PITCH / 4096   source-samples per second     (PITCH ≤ $3FFF → max 4× speed)
```

`PITCH = $1000` plays the sample at its recorded rate (32 kHz); `$0800`
an octave down; `$2000` an octave up. Semitone ratio: PITCH × 2^(1/12).
Pitch modulation (PMON) and the driver's own vibrato both show up as PITCH
writes during a note, exactly like NES period wobble.

What the chip does NOT know is the musical pitch of the sample itself. A
sample of a flute recorded with 64 source samples per period plays 500 Hz
at `$1000`; a bass sample with 400 per period plays 80 Hz at the same
PITCH. So a NOTE needs, per instrument, a **root**: the frequency (or
MIDI number) the sample produces at `$1000`. Then

```
midi(PITCH) = rootMidi + 12 × log2(PITCH / 4096)
```

Three ways to get a root, and the pipeline supports all three:

1. **Assume a convention.** Some drivers tune their samples so that a
   fixed PITCH is a fixed key (e.g. N-SPC's pitch table maps note numbers
   to PITCH values assuming each sample is recorded so `$1000` ≈ a
   particular C; many sample rips are tuned "to `$1000` = C"). This is
   driver-specific folklore, not a chip fact; wrong by octaves for
   instruments the sound designer detuned. We offer it only as the
   fallback when estimation fails (root = C5 at `$1000`, confidence
   "none").
2. **Estimate from the sample itself** (what `notes.mjs` does). Decode
   the BRR to PCM, find its fundamental period in source samples, root
   frequency = 32000 / period. Two signals make this far more reliable
   than generic pitch detection on music:
   - **Looped samples loop on a whole number of cycles.** A sustained
     instrument's loop region of L samples must contain an integer k
     periods, so the period is L / k for some small k — a discrete
     candidate set, not a continuous search. 16-sample single-cycle
     waveforms (pulse/triangle-style synth patches, extremely common in
     SNES soundtracks) are the degenerate case: period = 16 / k.
   - **Autocorrelation on the steady state** (McLeod's normalized square
     difference function, NSDF) picks k, and for one-shot samples finds
     the period on its own. The NSDF peak height is a natural confidence:
     ≥ 0.9 is a clean periodic tone, ≤ 0.5 is noise/percussion.
   Failure modes we mark rather than hide: octave errors (a peak at 2×
   the period when the timbre is hollow — the loop constraint mostly
   catches it), inharmonic samples (bells, drums: no meaningful root),
   very short samples (< 3 periods of anything below ~100 Hz).
3. **Leave notes relative and let the user set the root.** The dump's
   per-instrument header prints `root ≈ X (confidence)`; `--root k=NOTE`
   overrides it and every note on that sample shifts together. This is
   the honest path for anything below "high" confidence, and it fits the
   repo's rule that tools report facts and the person makes the call.

### 3.4 Envelope (ADSR / GAIN) — what "note off" means here

Envelope is 11 bits (`0-$7FF`); ENVX shows the top 7. Rates index a
32-entry period table (in output samples):

```
rate:   0    1     2     3     4     5    6    7    8    9   10   11   12   13  14  15
period: ∞  2048  1536  1280  1024  768  640  512  384  320  256  192  160  128  96  80
rate:  16   17    18    19    20    21   22   23   24   25   26   27   28   29  30  31
period: 64   48    40    32    24    20   16   12   10    8    6    5    4    3   2   1
```

- **Attack** (rate = 2·AR+1): +32 per period; AR = 15 → +1024 per sample
  (full scale in 2 samples). Reaching `$7FF` → decay.
- **Decay** (rate = 2·DR+16): `env −= ((env−1) >> 8) + 1` per period —
  exponential — until `env >> 8` = SL, then sustain.
- **Sustain** (rate = SR): the same exponential step; SR = 0 holds forever.
- **Release** (KOFF): −8 per sample, i.e. full scale to zero in 256
  samples = **8 ms**. So KOFF ≈ instant silence; a driver that wants a
  long release switches the voice to GAIN mode instead.
- **GAIN**, bit 7 = 0: env = (GAIN & $7F) << 4, set every sample (a level
  the driver can slide by rewriting). Bit 7 = 1, bits 6-5: `00` linear
  decrease −32, `01` exponential decrease (decay formula), `10` linear
  increase +32, `11` "bent" increase (+32 to `$600`, then +8); rate =
  bits 4-0.

Voice end conditions the note builder uses, in priority order: KOFF bit
(release starts — the note's end for scoring purposes), a re-KON (the
next note on that voice), the BRR END block on a non-looping sample (a
drum hit is over when its data is), or the envelope simulation falling
below an audibility floor (`$20`, about −36 dB) in a GAIN/sustain fade.
Timing of that last one is approximate: our envelope model steps per
voice on its own counters rather than the hardware's global phase
counter, which shifts events by at most one rate period.

### 3.5 Noise, echo, pitch modulation

- **NON** voices ignore PITCH; the LFSR clock in FLG bits 4-0 (same rate
  table) is the only "pitch". Like NES noise, that's a timbre index, not
  a note: the pipeline reports the clock and maps to a drum on export.
- **Echo** (EON/ESA/EDL/EFB/FIR) is a post-mix effect on the audio; it
  never creates notes, so the note pipeline ignores it. It matters only
  for a renderer (see INTEGRATION.md) — and for RAM: the echo buffer
  overwrites `ESA×$100 … + EDL×2 KB` continuously, so a sample stored
  there would be corrupted on real hardware.
- **PMON** modulates voice v's pitch by voice v−1's output: FM-style
  vibrato/growl. The driver's written PITCH is still the note; the
  modulation is timbre. Ignored for notes.

## 4. Sample directory and BRR

**Directory**: at `DIR × $100`, a table of 4-byte entries indexed by
SRCN: `start` (u16 LE), `loop` (u16 LE) — RAM addresses of the sample's
first BRR block and of the block to jump to after an END+LOOP block.

**BRR block** (9 bytes → 16 samples, 3.56 : 1 compression):

```
byte 0  header  SSSS FFLE   S = shift/range 0-12 (13-15 illegal: nibble
                            collapses to 0 / −$800), FF = filter,
                            L = loop flag, E = end flag
bytes 1-8       16 signed 4-bit nibbles, high nibble first
```

Decode of each nibble `n` (sign-extended −8..7), with `p1`, `p2` the two
previous decoded samples (15-bit domain):

```
s = (n << shift) >> 1
filter 0:  s += 0
filter 1:  s += p1 − p1/16            = p1 + ((−p1) >> 4)             (≈ 15/16)
filter 2:  s += 2·p1 − 3·p1/32 − p2 + p2/16                          (≈ 61/32, −15/16)
filter 3:  s += 2·p1 − 13·p1/64 − p2 + 3·p2/16                       (≈ 115/64, −13/16)
clamp to 16-bit signed, then wrap to 15 bits (the chip does s16 = (s × 2) as int16, and the
filter state keeps s16 >> 1)
```

The filters are first/second-order linear predictors; filters 1–3 depend
on decoder state, so a loop that jumps back to a block encoded with
filters ≠ 0 decodes slightly differently each pass (encoders avoid this
by making the loop-start block filter 0 — ours does).

**End of sample**: the DSP finishes the block, reads its header, and if
E = 1: sets the voice's ENDX bit and — L = 1 — continues at `loop`, else
— L = 0 — silences the voice (envelope to 0). A 9-byte block with
E = 1, L = 0, all-zero data is the conventional "silence" sample.

## 5. What we can and cannot recover

Solid: onsets (KON writes, timer-resolution), the PITCH at each onset and
every PITCH change during the note, which sample each note used, VOL and
envelope parameters, KOFF times, loop points in the score (the same
repetition scan as NSF works unchanged on any channel log). Approximate:
the note's absolute pitch (root estimation, §3.3), the end of fading
notes (§3.4), velocity (VOL × peak envelope is a proxy: the chip has no
velocity, only a level the driver chose). Not recoverable: any note that
started before the dump, the main-CPU side of a port handshake, and
tempo/meter (a grid fit, exactly as for NSF).
