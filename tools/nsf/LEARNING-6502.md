# Learning the 6502 (and the NSF pipeline) in this repo

A guided path through `tools/nsf/`, written to be worked rather than read.
Everything here is verifiable by running code in this repo — no answer keys,
because the emulator is the answer key.

Two different things get called "the 6502 code" here. Keep them apart:

- **The emulator** — our JavaScript that *pretends to be* a 6502.
  [cpu6502.mjs](cpu6502.mjs) (235 lines) and [nsf.mjs](nsf.mjs) (94). That's it.
  Learning these teaches you the machine model.
- **Uematsu's sound driver** — the actual 6502 *program* that plays FF1's music.
  Not in this repo as source. It lives as machine-code bytes inside
  `albums/final-fantasy-i/reference/ff1.nsf`. Reading it means disassembly
  (see "Projects", last section).

Everything else in this directory is downstream of the CPU and not part of it:
[notes.mjs](notes.mjs) (register writes → note events), [midi-write.mjs](midi-write.mjs)
(MIDI bytes), [dump.mjs](dump.mjs) / [dump-all.mjs](dump-all.mjs) (CLI drivers),
[meter_audit.mjs](meter_audit.mjs) (the barline-test audit), and
[make-test-nsf.mjs](make-test-nsf.mjs) (a hand-assembled toy NSF — our own code,
so the pipeline can be tested without shipping copyrighted data).

---

## 1. The machine, one page

**Registers.** Three 8-bit registers and that's your whole world: `A`
(accumulator — the only one that does arithmetic), `X` and `Y` (index
registers, used to walk tables). Plus `PC` (16-bit program counter), `SP`
(8-bit stack pointer), and a flags byte. See
[cpu6502.mjs:8-11](cpu6502.mjs#L8-L11).

**Flags** (bits in `P`): `N` negative, `V` overflow, `D` decimal, `I`
interrupt disable, `Z` zero, `C` carry. Almost every instruction sets `N`/`Z`
as a side effect — that's what `nz()` does at
[cpu6502.mjs:24](cpu6502.mjs#L24). Branches read exactly one flag each;
comparisons exist only to set flags.

**Memory is 16-bit, 64 KB, little-endian.** Address `$B007` is stored as
`07 b0`. Two regions are special by hardware, not convention:

- `$0000-$00FF` — **zero page**. Addressable with a one-byte operand, so those
  instructions are shorter and faster. Drivers keep their hot state here.
- `$0100-$01FF` — **the stack**, fixed. `SP` is only 8 bits because the high
  byte is always `$01`. See `push`/`pop`,
  [cpu6502.mjs:22-23](cpu6502.mjs#L22-L23).

**No multiply, no divide.** Multiplying is shifts and adds — that's why `LSR`
(`$4A`, shift right) is the 6th hottest opcode in FF1's driver.

**No registers-to-spare, no stack frames, no types.** Loop counters live in
`X`/`Y` or zero page. Everything is bytes.

### The NES memory map, as this emulator sees it

[nsf.mjs:56-71](nsf.mjs#L56-L71) is the entire bus:

| Range | What |
|---|---|
| `$0000-$07FF` | 2 KB RAM (mirrored to `$1FFF`) |
| `$4000-$4017` | **APU registers** — every write here is logged, not executed |
| `$4015` | channel enable (read returns `$0F`: "all channels active") |
| `$5FF8-$5FFF` | NSF bank-switch registers (8 × 4 KB banks) |
| `$6000-$7FFF` | 8 KB cartridge SRAM |
| `$8000-$FFFF` | 32 KB program ROM (the NSF's data image) |

Note what's absent: no PPU, no controllers, no APU *emulation*. Nothing in this
repo synthesizes audio. The log of APU register writes **is** the output; the
music comes back out by reading those writes with the hardware's own frequency
formulas ([notes.mjs:25-34](notes.mjs#L25-L34)).

---

## 2. The NSF contract

An NSF is a 128-byte header plus a flat image of 6502 machine code and data
tables, loaded at `loadAddr`. Header parsing is
[nsf.mjs:7-33](nsf.mjs#L7-L33). Playback is a two-call contract
([nsf.mjs:87-92](nsf.mjs#L87-L92)):

1. Call `init` once, with `A` = song number (0-based) and `X` = 0 for NTSC.
2. Call `play` once per frame, forever. Each call advances the music by one
   tick and writes whatever APU registers that tick needs.

There's no operating system to return to, so calling a subroutine needs a
trick: push a **sentinel** return address, then run instructions until `PC`
lands on it ([nsf.mjs:74-85](nsf.mjs#L74-L85)). A 2,000,000-instruction guard
catches drivers that never return.

"One frame" = `playSpeedNTSC` microseconds from the header, normally 16639 µs
(≈60.1 Hz). Every timestamp downstream — note starts, tempo fitting, loop
detection — is counted in these frames.

---

## 3. Reading path

Do them in this order. Each stop says what to actually look at; skip the parts
not listed.

**Stop 1 — [dump.mjs](dump.mjs) (30 lines).** The whole pipeline in one
screen: `parseNSF` → `runNSF` → `reconstruct` → `toNotesTxt`. Read it first so
every later file has a slot to sit in.

**Stop 2 — [nsf.mjs](nsf.mjs) (94 lines).** The machine *around* the CPU. Three
things to understand: the bus (above), the init/play contract, and the sentinel
call. Then the banking reader at [nsf.mjs:48-54](nsf.mjs#L48-L54) — banked NSFs
map 4 KB windows of the data image into `$8000+`; FF1 doesn't use it, other
soundtracks will.

**Stop 3 — [make-test-nsf.mjs](make-test-nsf.mjs) (66 lines).** Real 6502, small
enough to hold in your head — a 4-note pulse melody over a triangle pedal, each
byte commented with its mnemonic. Study three techniques here, because FF1's
driver is made of the same three:

- **A frame counter in zero page.** `INC $00`, compare to 30, branch out if not
  equal ([make-test-nsf.mjs:21-23](make-test-nsf.mjs#L21-L23)). This is how a
  driver gets note durations out of a function called 60 times a second.
- **Table lookup with `X`.** `TAX` then `LDA table,X`
  ([make-test-nsf.mjs:27-31](make-test-nsf.mjs#L27-L31)) — indexed addressing is
  the 6502's only "array".
- **Branch offsets are relative and patched after the fact**
  ([make-test-nsf.mjs:42-43](make-test-nsf.mjs#L42-L43)): the operand is a
  signed byte counted from the byte *after* the operand. That's what an
  assembler does for you, done by hand.

**Stop 4 — [cpu6502.mjs](cpu6502.mjs), in four passes, not top to bottom.**

1. State and flags, [1-25](cpu6502.mjs#L1-L25).
2. **Addressing modes, [27-42](cpu6502.mjs#L27-L42) — the real 6502 lives here.**
   Thirteen ways to produce an address; every opcode is one operation paired
   with one mode. Once these are yours, the opcode list stops being a list.
   `ind()` reproduces the genuine `JMP ($xxxx)` page-wrap bug
   ([36-41](cpu6502.mjs#L36-L41)) — hardware defect, faithfully kept.
3. ALU helpers, [46-58](cpu6502.mjs#L46-L58). Two worth pausing on:
   `sbc(v) = adc(v ^ 0xFF)` (subtraction is addition of the complement, which
   is *why* you `SEC` before `SBC`), and the overflow rule in `adc`
   ([48](cpu6502.mjs#L48)) — signed overflow means the operands agreed in sign
   and the result disagreed.
4. `step()`, [62+](cpu6502.mjs#L62). **Skim; never read straight through.** It's
   a 150-case switch grouped by comment (loads, stores, transfers, stack, logic,
   arithmetic, inc/dec, shifts, bit, jumps, branches, flags). Look up single
   opcodes as they come at you. Illegal opcodes throw by design
   ([230-231](cpu6502.mjs#L230-L231)).

**Stop 5 — [notes.mjs](notes.mjs), first 84 lines.** Where the CPU hands off to
the sound chip. The APU state machine mirrors four channels of registers, and
`update()` decides a note started or ended
([notes.mjs:36-51](notes.mjs#L36-L51)). Frequency comes from the divider
period: pulses `CPU/(16·(t+1))`, triangle `CPU/(32·(t+1))` — one factor of two
apart, which is why the triangle's identical period sounds an octave lower.

That's the pipeline. `fitBpm` / `detectLoop` / `backportTiming` further down are
music-analysis logic, not machine learning material.

---

## 4. Exercises

Ordered by difficulty. None have written answers; each says how to check
yourself.

**1. Decode FF1's `init` by hand.** Its nine bytes are:

```
18 69 01 4c 07 b0
```

(then `ff` padding). Write the three instructions with their operands. Check
against the mnemonic table in [make-test-nsf.mjs](make-test-nsf.mjs) and the
`case` labels in `step()`. Then answer the design question: `runNSF` passes
`songIndex - 1` in `A` ([nsf.mjs:87](nsf.mjs#L87)) — what does the second
instruction tell you about what the driver expects, and does our caller agree?

**2. Predict, then verify, the toy tune.** From
[make-test-nsf.mjs](make-test-nsf.mjs), work out on paper: on which frame does
pulse 1's first note begin, and why does `init` store 29 rather than 0 into
`$00`? Verify by running `npm test` — the first test in
[tests/nsf.test.mjs](../../tests/nsf.test.mjs) asserts the exact frame numbers.

**3. Break something on purpose.** Delete the `^ 0xFF` from `sbc`
([cpu6502.mjs:52](cpu6502.mjs#L52)), run `npm test`, read which tests fail and
why. Restore it. Repeat with the page-wrap in `ind()` (make it a plain
`this.rd(a+1)`) — notice that nothing fails, and think about what that means
about test coverage vs. faithfulness. Then `git checkout tools/nsf/cpu6502.mjs`.

**4. Hand-assemble something.** Extend `makeTestNSF` so pulse 2 plays a second
voice a third above, or make the melody eight notes. You'll need to emit bytes,
patch a branch offset, and add a table. Verify by dumping it:

```sh
node -e 'import("./tools/nsf/make-test-nsf.mjs").then(async m => {
  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/test.nsf", m.makeTestNSF());
})'
node tools/nsf/dump.mjs /tmp/test.nsf --bpm 120
```

**5. Find the driver's footprint.** Monkeypatch `step()` from outside to count
opcodes and program counters, then run a real song. Script (put scratch scripts
in `tools/nsf/scratch/`, which is gitignored):

```js
// tools/nsf/scratch/trace.mjs — run from the repo root: node tools/nsf/scratch/trace.mjs
import { readFileSync } from "node:fs";
import { CPU6502 } from "../cpu6502.mjs";
import { parseNSF, runNSF } from "../nsf.mjs";

const opCount = new Map(), pcCount = new Map();
const orig = CPU6502.prototype.step;
CPU6502.prototype.step = function () {
  if (!this.halted) {
    const pc = this.pc, op = this.bus.read(pc);
    opCount.set(op, (opCount.get(op) || 0) + 1);
    pcCount.set(pc, (pcCount.get(pc) || 0) + 1);
  }
  return orig.call(this);
};

const nsf = parseNSF(readFileSync("albums/final-fantasy-i/reference/ff1.nsf"));
const { apuLog, frames } = runNSF(nsf, 2, 10);
console.log("frames", frames, "apu writes", apuLog.length);
console.log("distinct opcodes", opCount.size, "instructions",
  [...opCount.values()].reduce((a, b) => a + b, 0));
console.log("distinct addresses executed", pcCount.size, "of", nsf.data.length);
console.log([...pcCount].sort((a, b) => b[1] - a[1]).slice(0, 8)
  .map(([a, c]) => "$" + a.toString(16) + "×" + c).join(" "));
```

Ten seconds of song 2 executes ~81k instructions using **40 distinct opcodes**,
touching **295 of the 32,768 ROM bytes**. Sit with that ratio: the driver is
tiny and the cartridge is almost entirely music *data*. Hot addresses cluster
around `$b141-$b171`, just past `play` at `$B000` — the per-frame loop. Then
ask the follow-ups: which 40 opcodes (and which whole instruction families
never appear)? How does the executed-address count change across songs?

**6. Watch one channel get set up.** Filter `apuLog` to `addr` in
`$4000-$4003` for the first second and print `frame, addr, value`. Match what
you see against the register table below and against `reconstruct`'s state
machine. This is the raw material every analysis in this project is built on.

---

## 5. Reference tables

### Addressing modes

| Mode | Written | Operand bytes | In [cpu6502.mjs](cpu6502.mjs) |
|---|---|---|---|
| immediate | `LDA #$0F` | 1 (a literal) | `imm()` |
| zero page | `LDA $00` | 1 | `zp()` |
| zero page,X / ,Y | `LDA $10,X` | 1 (wraps in page 0) | `zpx()` `zpy()` |
| absolute | `LDA $B007` | 2 (little-endian) | `abs()` |
| absolute,X / ,Y | `LDA table,X` | 2 | `abx()` `aby()` |
| indirect | `JMP ($1000)` | 2 (page-wrap bug) | `ind()` |
| (indirect,X) | `LDA ($10,X)` | 1 | `izx()` |
| (indirect),Y | `LDA ($10),Y` | 1 | `izy()` |
| relative | `BNE label` | 1 signed byte | `rel()` |
| implied / accumulator | `TAX`, `LSR A` | 0 | — |

### Opcodes worth knowing cold

The ones that dominate real drivers, with FF1's hot list in brackets:

`LDA` `$A9` imm, `$A5` zp, `$B5` zp,X [hot], `$AD` abs, `$BD` abs,X ·
`STA` `$85` zp [hottest], `$95` zp,X [hot], `$8D` abs ·
`CMP` `$C9` imm [hot] · `LSR` `$4A` [hot] · `CLC` `$18` [hot] ·
`BCC` `$90` [hot] · `BNE` `$D0` · `BEQ` `$F0` · `INC` `$E6` zp ·
`TAX` `$AA` · `JSR` `$20` · `RTS` `$60` · `JMP` `$4C` · `NOP` `$EA`

Full official set: 56 instructions, 151 legal opcodes, all implemented here.

### APU registers ($4000-$4017)

| Addr | Channel | Register |
|---|---|---|
| `$4000` | pulse 1 | duty (bits 6-7), constant-volume flag (bit 4), volume/envelope (bits 0-3) |
| `$4001` | pulse 1 | sweep |
| `$4002` | pulse 1 | period low 8 bits |
| `$4003` | pulse 1 | period high 3 bits + length counter load (**restarts the note**) |
| `$4004-$4007` | pulse 2 | same layout |
| `$4008` | triangle | linear counter (nonzero = sounding; **no volume control at all**) |
| `$400A/$400B` | triangle | period low / high + length load |
| `$400C-$400F` | noise | volume, period index (4 bits — not a pitch), length load |
| `$4010-$4013` | DMC | sample playback (unused by FF1) |
| `$4015` | — | channel enable bitmask: 1=pulse1, 2=pulse2, 4=triangle, 8=noise |
| `$4017` | — | frame counter config |

Two consequences this project keeps running into: the triangle has no volume
register, so chip-volume/velocity data exists only for the pulses
([notes.mjs:46-47](notes.mjs#L46-L47)); and a write to `$4003`-style length
registers re-triggers a note even at unchanged pitch, which is how repeated
notes are detected ([notes.mjs:71-74](notes.mjs#L71-L74)).

### NSF header offsets

| Offset | Field |
|---|---|
| `$00-$04` | `"NESM\x1a"` magic |
| `$05` | version |
| `$06` | song count · `$07` starting song (1-based) |
| `$08-$09` | load address · `$0A-$0B` init · `$0C-$0D` play |
| `$0E-$2D` | name · `$2E-$4D` artist · `$4E-$6D` copyright |
| `$6E-$6F` | NTSC play speed, microseconds per frame |
| `$70-$77` | initial bank values (all zero = unbanked) |
| `$80+` | the code/data image |

### Our ff1.nsf

23 songs · load `$8000` · init `$FFD2` · play `$B000` · 32768 bytes · unbanked.
Note `*.nsf` is gitignored, so this file is local-only and not in the repo's
history.

---

## 6. Where this emulator is deliberately wrong

Know these before trusting it for anything new:

- **Timing is fake.** `step()` returns a constant 3 cycles
  ([cpu6502.mjs:62](cpu6502.mjs#L62), and the header comment says so). The
  pipeline needs the *order* of register writes within a frame, not cycle
  accuracy. Anything that depends on real cycle counts — raster effects, exact
  DMC timing, cycle-counted delay loops — would be wrong.
- **No APU.** No sweep units, no length counters, no envelopes are *simulated*;
  `reconstruct` interprets the register writes instead. A driver relying on
  envelope decay for its note shapes would still read as full-length notes.
- **Illegal opcodes throw** rather than emulating the undocumented behaviors.
  Fine for sound drivers; a real game ROM might use them.
- **`BRK` halts** ([cpu6502.mjs:229](cpu6502.mjs#L229)) — NSF drivers don't
  `BRK`, so hitting it means execution went somewhere wrong. It's a canary.
- **No decimal mode.** `adc` ignores the `D` flag, which matches the NES's
  2A03 (BCD was fused off) but *not* a stock 6502.
- **`$4015` reads always return `$0F`.** A driver polling channel status to
  decide when a note finished would get a lie. FF1 doesn't; something else
  might.

---

## 7. Projects, in increasing order of size

1. **Trace disassembler.** Log `PC` per step, then decode only executed
   addresses — the tracer from exercise 5 plus an opcode→mnemonic table
   (mechanically derivable from `step()`'s cases). Output: Uematsu's driver as
   readable assembly, with the ~99% of ROM that's music data excluded
   automatically. ~150 lines. This is the bridge from "learning the emulator" to
   "reading the actual FF1 code."
2. **Data-format archaeology.** With the driver disassembled, find the pattern
   tables: how a note is encoded, how durations and rests work, how each song's
   channels are indexed. That's the FF1 sound engine's file format, recovered.
3. **Cycle-accurate timing.** Replace the constant 3 with a real per-opcode
   cycle table plus page-cross penalties. Needed only if a future NSF depends on
   timing; a good exercise in how much the 6502's cost model shows through.
4. **Banked NSFs.** [nsf.mjs:48-54](nsf.mjs#L48-L54) implements bank switching
   but FF1 never exercises it. The first banked soundtrack you load will test
   it, so read that function before blaming the CPU.
5. **Expansion audio.** VRC6, MMC5, Namco 163, Sunsoft 5B write to registers
   outside `$4000-$4017`; our bus drops those writes. Any NSF using them plays
   silent channels. Relevant when the album list grows beyond plain 2A03 chips.

### External references

- **NESdev wiki** — <https://www.nesdev.org/wiki/APU> (register semantics, the
  frequency formulas used in `notes.mjs`) and
  <https://www.nesdev.org/wiki/CPU_addressing_modes>. The canonical source for
  both halves of this document.
- **6502 opcode matrix** — <https://www.masswerk.at/6502/6502_instruction_set.html>.
  Useful next to `step()` when decoding by hand.
- **NSF spec** — <https://www.nesdev.org/wiki/NSF>. Header layout, banking, the
  init/play contract.
