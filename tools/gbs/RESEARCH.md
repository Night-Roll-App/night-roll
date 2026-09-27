# Game Boy chip music (GBS) — what the pipeline has to know

Companion to `tools/nsf/` (the NES pipeline this one mirrors). Everything
below is what `gbs.mjs`, `cpu-sm83.mjs`, `notes.mjs` and `apu-render.mjs`
assume about the hardware; each claim carries its source so a future
session can re-check it rather than trust it.

Sources (all fetched 2026-09-26):

- **GBS Format Specification v1.04** — <https://ocremix.org/info/GBS_Format_Specification>
  (the original spec; also mirrored in gbsplay's docs
  <https://github.com/mmitch/gbsplay>).
- **Pan Docs — Audio Registers** — <https://gbdev.io/pandocs/Audio_Registers.html>
- **Pan Docs — Audio Details** (DIV-APU / frame sequencer, trigger events,
  length/envelope/sweep timing, LFSR) — <https://gbdev.io/pandocs/Audio_details.html>
- **Pan Docs — Timer and Divider Registers** — <https://gbdev.io/pandocs/Timer_and_Divider_Registers.html>
- **Pan Docs — CPU Instruction Set** — <https://gbdev.io/pandocs/CPU_Instruction_Set.html>
- **gbdev opcode table** (every opcode with bytes, cycles, flags) — <https://gbdev.io/gb-opcodes/optables/>
- **RGBDS gbz80(7)** (instruction semantics incl. flag rules) — <https://rgbds.gbdev.io/docs/gbz80.7>
- **gbdev wiki — Gameboy sound hardware** (the older, obsessively detailed
  APU write-up: frame sequencer, obscure trigger behaviours) —
  <https://gbdev.gg8.se/wiki/articles/Gameboy_sound_hardware>

## 1. The GBS file

A GBS is a 112-byte header followed by raw code+data, exactly the NSF idea
(header, then a blob the player loads at a fixed address and drives by
calling INIT once and PLAY on a timer). All 16-bit values little-endian.

| offset | size | field |
|-------:|-----:|-------|
| 0x00 | 3 | identifier `"GBS"` (no terminator — the byte-sniff is 3 bytes, vs. 5 for `NESM\x1a`) |
| 0x03 | 1 | version (1) |
| 0x04 | 1 | number of songs (1–255) |
| 0x05 | 1 | first song (1-based, like NSF) |
| 0x06 | 2 | load address ($0400–$7FFF) |
| 0x08 | 2 | init address ($0400–$7FFF) |
| 0x0A | 2 | play address ($0400–$7FFF) |
| 0x0C | 2 | stack pointer |
| 0x0E | 1 | timer modulo (TMA) |
| 0x0F | 1 | timer control (TAC) |
| 0x10 | 32 | title |
| 0x30 | 32 | author |
| 0x50 | 32 | copyright |
| 0x70 | … | code and data, loaded at the load address |

**Calling convention.** INIT: song number in **A, zero-based** ("the first
song is 0" — the header's *first song* byte is 1-based, so subtract one,
exactly the NSF `A = song-1` step). SP is set from the header first ("many
ROMs don't use the default $FFFE, and the pointer must be set so that stack
operation does not interfere with memory used"). Both INIT and PLAY "must
end with a RET instruction" — so the NSF sentinel-return trick works
unchanged: push a sentinel address, run until PC lands on it.

**Play rate.** From TAC/TMA:

- TAC bit 2 = interrupt type: 0 → v-blank, 1 → timer.
- TAC bits 1-0 = counter rate: `00` 4096 Hz, `01` 262144 Hz, `10` 65536 Hz,
  `11` 16384 Hz (these are the real DMG timer rates from Pan Docs: 256/4/16/64
  M-cycles per tick at 1,048,576 M-cycles/s).
- timer rate = counter rate / (256 − TMA) — the hardware reloads TIMA from
  TMA on overflow, so a modulo of $FE halves the rate, etc.
- TAC bit 7 = CPU speed: 1 means Game Boy Color double speed, which doubles
  the timer rate (the play routine runs twice as often).
- TAC = TMA = 0 → v-blank at 4194304 / 70224 = **59.7275 Hz** (one LCD
  frame is 70224 dots). NSF's NTSC 60.0988 Hz becomes this. A "frame" in the
  register log is one PLAY call, whatever its rate; `frameSec` carries the
  actual period downstream, like the NSF pipeline's `playSpeedNTSC`.

A GBS never needs the emulated timer *hardware* to fire: the driver calls
PLAY at that rate itself. What some play routines do need is DIV ($FF04,
counts at 16384 Hz) for pseudo-random numbers, so the bus derives DIV from
the CPU's cycle counter.

**Banking.** ROM is 16 KiB pages: $0000–$3FFF is always page 0,
$4000–$7FFF is the switchable slot, and "a page is selected into bank 1 by
writing the page number as a byte value somewhere in $2000–$3FFF" (MBC1
style). The file's data is laid into a flat image starting at the load
address; for load addresses below $4000 the pages are "aligned relative to
the load address, and not absolute offsets in the file", i.e. flat ROM
offset = loadAddr + (fileOffset − 0x70), page k = flat[k·0x4000, (k+1)·0x4000).
Writing page 0 to the switch behaves like MBC1 (selects page 1) — gbsplay
does the same; few files depend on it either way. The spec asks players
to "disregard writes to $4000–$5FFF and $FF70" (RAM-bank/upper-bank
selects) "and just implement main RAM from $A000 to $DFFF".

**RST vectors.** "A GBS player vectors RSTs to an address relative to the
load address of the module": RST $xx jumps to loadAddr + $xx. Files that use
RST prepend a patch area so that loadAddr+$00…$38 hold their handlers. The
CPU core therefore treats RST n as CALL (loadAddr + n) when running a GBS.

**Memory the player must provide.** VRAM $8000–$9FFF (some drivers park
tables there), external RAM $A000–$BFFF, WRAM $C000–$DFFF (+ echo at
$E000–$FDFF), OAM $FE00–$FE9F, I/O $FF00–$FF7F, HRAM $FF80–$FFFE, IE $FFFF.
Only the APU range $FF10–$FF3F is *logged*; everything else is plain RAM or
ignored, mirroring nsf.mjs's "log $4000–$4017, RAM elsewhere".

## 2. The Game Boy APU (four channels, no expansion)

Register map (Pan Docs "Audio Registers"). Register names NRxy: x =
channel (1 pulse+sweep, 2 pulse, 3 wave, 4 noise, 5 global), y = 0 sweep /
1 length+duty / 2 volume+envelope / 3 period low / 4 period high+control.

| addr | name | bits |
|------|------|------|
| FF10 | NR10 | 6-4 sweep pace (128 Hz ticks per step; 0 = off), 3 direction (0 add, 1 subtract), 2-0 step: period′ = period ± (period >> step). Add-mode overflow past 2047 silences the channel. Pulse 1 only. |
| FF11 | NR11 | 7-6 duty (00 12.5 %, 01 25 %, 10 50 %, 11 75 %), 5-0 initial length timer (channel plays 64 − n ticks of 256 Hz when length is enabled) |
| FF12 | NR12 | 7-4 initial volume, 3 envelope direction (0 decrease, 1 increase), 2-0 envelope pace (64 Hz ticks per step; 0 = no envelope). **Bits 7-3 all zero = DAC off** = channel silent and cannot be triggered. |
| FF13 | NR13 | period low 8 bits (write-only) |
| FF14 | NR14 | 7 **trigger**, 6 length enable, 2-0 period high 3 bits |
| FF15 | — | unused |
| FF16-19 | NR21-24 | as NR11-14, no sweep |
| FF1A | NR30 | 7 DAC on/off (0 kills the channel at once) |
| FF1B | NR31 | initial length timer, 8 bits (plays 256 − n ticks of 256 Hz when enabled) |
| FF1C | NR32 | 6-5 output level: 00 mute, 01 100 %, 10 50 % (samples >> 1), 11 25 % (>> 2) |
| FF1D | NR33 | period low |
| FF1E | NR34 | 7 trigger, 6 length enable, 2-0 period high |
| FF30-3F | wave RAM | 16 bytes = 32 four-bit samples, high nibble first |
| FF20 | NR41 | 5-0 initial length timer (64 − n) |
| FF21 | NR42 | volume/envelope exactly like NR12 (bits 7-3 zero = DAC off) |
| FF22 | NR43 | 7-4 clock shift s, 3 LFSR width (0 = 15-bit, 1 = 7-bit), 2-0 clock divider code r |
| FF23 | NR44 | 7 trigger, 6 length enable |
| FF24 | NR50 | 7 VIN left, 6-4 left volume (0–7 → ×1…×8), 3 VIN right, 2-0 right volume |
| FF25 | NR51 | panning: bit 7/6 ch4 L/R, 5/4 ch3, 3/2 ch2, 1/0 ch1. Both bits clear = the channel is mixed nowhere (drivers use this as a mute). |
| FF26 | NR52 | 7 audio on/off (off clears every register and freezes them), 3-0 channel-active flags (read-only) |

**Timing (frame sequencer / "DIV-APU").** A 512 Hz clock derived from DIV
steps an 8-step sequencer: length timers tick on even steps (256 Hz), the
sweep on steps 2 and 6 (128 Hz), envelopes on step 7 (64 Hz). The note
reconstructor advances this sequencer between logged writes by wall-clock
time, which is why every write carries its cycle offset within the frame.

**Trigger (NRx4 bit 7 written 1).** The channel becomes active if its DAC
is on; the length timer reloads to its maximum if it had expired; the
envelope restarts at the initial volume with its pace counter reloaded; the
frequency timer reloads; the wave channel's sample index resets to 0; the
noise LFSR resets (all ones / all zeros depending on representation);
pulse 1 copies the period into the sweep shadow register and, if pace or
step are non-zero, recomputes once immediately (overflow there also
silences it). Writing the trigger while a note is already sounding restarts
it — the audible "retrigger". That is what makes a GB note-on unambiguous
compared to the NES, where a note begins whenever volume and period happen
to be valid.

**Channel off events** (Pan Docs "Channel activation"): length timer
expires with length enabled; sweep overflow (ch1); DAC turned off (NR12/
NR22/NR42 bits 7-3 cleared, NR30 bit 7 cleared); NR52 powered off. Note the
explicit statement that "envelope reaching 0 does NOT turn the channel off"
— the channel stays *active* (NR52 status bit set) but outputs a constant
DAC level, i.e. silence. For note reconstruction we treat envelope-to-zero
as the end of the note (nothing is heard), while the renderer keeps the
channel active as hardware does.

**Pitch.** The 11-bit period value x (0–2047) is a countdown *from* 2048:

- pulse: the duty sequencer steps at 1048576 / (2048 − x) Hz, eight steps
  per cycle → **f = 131072 / (2048 − x)**. x = 2047 is 131072 Hz (silent
  ultrasound); x = 0 is 64 Hz (C2 − 32 ¢). Lower x = lower pitch, the
  opposite sense from NES periods (where a bigger period is a lower note).
- wave: samples step at 2097152 / (2048 − x) Hz, 32 samples per pass →
  **f = 65536 / (2048 − x)** — one octave below a pulse at the same x,
  exactly as the NES triangle sits an octave below the pulses. Caveat that
  the NES has no equivalent of: the *heard* pitch depends on what is in
  wave RAM. Drivers routinely store two or four cycles of a waveform in the
  32 samples to get a brighter, higher tone; then the pitch is 2× or 4× the
  formula. `notes.mjs` measures the RAM's periodicity (does the 32-sample
  table repeat every 16? every 8?) and multiplies accordingly, reporting
  the multiplier as a fact (`waveCycles`) rather than guessing.
- noise: LFSR clock = 262144 / (r · 2^s) Hz with r = 0 counting as 0.5
  (Pan Docs). Not a pitch; like the NES noise period index the pipeline
  reports an index and maps it onto the drum kit. 15-bit vs 7-bit width
  matters for timbre (7-bit is the metallic "tone" noise), so the event
  records it.

MIDI conversion is the NSF pipeline's: midi = round(69 + 12·log2(f/440)).

**Master volume / panning** (NR50/NR51) do not change pitch or onsets; the
reconstructor uses NR51 only as a mute (both bits clear = inaudible), and
the renderer applies both.

## 3. The CPU: Sharp SM83 (LR35902)

An 8080/Z80 hybrid: Z80 syntax and the Z80's CB-prefixed bit instructions,
the 8080's register file (no IX/IY, no shadow registers, no IN/OUT, no
block moves, no DJNZ, no EX/EXX), flags Z N H C only (bits 7-4 of F; the
low nibble always reads 0, so `POP AF` masks it), and a handful of Game
Boy-specific opcodes in the slots Z80 used for the removed ones
(<https://gbdev.io/pandocs/CPU_Instruction_Set.html>,
<https://gbdev.io/gb-opcodes/optables/>):

- `$08 LD (a16),SP` (Z80: EX AF,AF'), `$10 STOP` (DJNZ), `$D9 RETI` (EXX),
  `$E0 LDH (a8),A` / `$F0 LDH A,(a8)` — $FF00+a8, `$E2 LD (C),A` /
  `$F2 LD A,(C)` — $FF00+C, `$E8 ADD SP,e8`, `$F8 LD HL,SP+e8` (flags from
  the low-byte add, Z always 0), `$E9 JP HL`, `$EA LD (a16),A` /
  `$FA LD A,(a16)`, `$22/$2A LD (HL+),A / LD A,(HL+)`, `$32/$3A` the HL−
  pair, and `CB $30-$37 SWAP r` (nibble swap; Z80 had SLL there).
- Eleven opcodes are unused and lock the CPU: `$D3 $DB $DD $E3 $E4 $EB $EC
  $ED $F4 $FC $FD`. The core throws on them, like cpu6502.mjs on illegals.
- Register order in the opcode encodings is `B C D E H L (HL) A` (index
  0–7), which turns the $40–$BF block (LD r,r' / ALU A,r) and the whole CB
  page into table lookups. 16-bit pairs in `$x1/$x3/$x9/$xB` are
  `BC DE HL SP`; in `PUSH/POP` the fourth pair is `AF`.
- Flag rules that bite (RGBDS gbz80(7)): `INC r`/`DEC r` leave C; `ADD HL,rr`
  leaves Z, sets H from bit 11 and C from bit 15; `RLCA/RRCA/RLA/RRA` clear Z
  (their CB twins set it), `CPL` sets N and H; `SCF` sets C and clears N,H;
  `CCF` complements C and clears N,H; `DAA` is the BCD fixup with the
  8080's rules (adjust by $06/$60 based on N, H, C; sets C when the high
  adjust happens, clears H). H is half-carry out of bit 3 (bit 11 for the
  16-bit add).
- Cycles come in M-cycles of 4 T-states: everything is a multiple of 4,
  conditional jumps cost more when taken. The core carries the opcode
  table's T-state counts, coarse but proportional, so the register log has
  sub-frame timestamps and DIV advances plausibly.
- Interrupts: IME set by EI (takes effect after the following instruction)
  and RETI, cleared by DI; five sources in IF ($FF0F) / IE ($FFFF). A GBS
  play routine is invoked by the *player*, not by an interrupt, so the core
  only tracks IME/EI-delay and never dispatches. `HALT` waits for an
  interrupt that will never arrive in this model; the driver treats it as
  the end of the current call (the same collapse cpu6502.mjs makes of BRK).
  `STOP` likewise.

## 4. What "note on" means, per channel (for `notes.mjs`)

| channel | onset | pitch | end |
|---------|-------|-------|-----|
| pulse 1/2 | NRx4 trigger with DAC on and volume > 0; or a period change of ≥ 70 ¢ while sounding (a new pitch without retrigger — arpeggio/legato) | 131072/(2048−x) | trigger of the next note; envelope decays to 0; length expiry; DAC off (volume/envelope write with bits 7-3 = 0); NR51 unrouted; NR52 off |
| wave | NR34 trigger with NR30 bit 7 and NR32 level ≠ 0; pitch change | 65536/(2048−x) × waveCycles | as above, plus NR30 DAC off, NR32 mute |
| noise | NR44 trigger with DAC on | index = clock shift s (0–15), plus width flag | envelope-to-0 / length / DAC off |

Volume at onset (`vol`, 0–15) is the envelope's initial volume — accent
data straight from the ROM, as on the NES; `volEnd` records where the
hardware envelope (or a software volume walk) leaves it, so playback can
ramp. Duty rides as before (CC70). Sweep is applied to the pitch the
renderer plays but the reconstructor reports the *written* period plus a
`sweep` field; a sweep glide is one note, not a chain.
