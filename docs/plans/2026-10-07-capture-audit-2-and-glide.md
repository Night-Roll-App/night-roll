# Capture audit 2 + glide: what the chips still do that our .mid drops (advisor, 2026-10-07)

Josh (Terminal #180–#183), listening to FF7 "You Can Hear the Cry of the
Planet": the game's slides sound great, "in the midi we have the actual
notes and we don't hear any of these bends… Are we missing all types of
bending?" Then: build it on everything, and "double check anything else
that could possibly be missing so that we don't have to do this import all
over again."

**Short answer.** Yes, every kind of bend is missing somewhere, and the
first audit (docs/plans/2026-10-06-capture-fidelity-audit.md) had one blind
spot that runs through all six consoles: it treated **a split note as the
sound**. When a chip changes pitch *without restarting the note* (a slide, a
slur, a legato step), every capture writes the pieces as ordinary notes.
Each piece gets a fresh note-on, so the synth re-attacks it, and the pitch
movement *between* the pieces is thrown away. This audit was adversarial on
that point, and it found these other gaps:

- **PS1, PS2 and N64 never got capture v2.** Their published .mid files
  carry no bend, no program, no CC7, no CC91 and no in-note loudness at all
  (readSmf over albums/ps1, ps2, n64 and /tmp/recap/out). The first audit's
  §4 items 3–4 were never built.
- **SNES has phantom notes.** About 8% of melodic notes in the sampled songs
  are notes shorter than 10 ms that the capture invents. Most are in Mega Man
  X and Street Fighter II. They become 40-tick stacked notes in the roll.
- **The NES triangle notes run long.** The capture ignores the triangle's
  linear counter and length counter: in Zelda, 439 of 511 triangle notes are
  longer than what plays.
- **Some things are lost in the console voice too, not only in the .mid.**
  - PS1 slur and legato re-attack, and PS1 vibrato and reverb are missing.
  - Dark Cloud's 9,713 bends are dropped.
  - N64 EAD channel bends are read only at the note-on.
  - SNES has no echo, and it plays in mono.

Josh's rule from §8 of the first audit stays: **slides remain separate notes
on screen**. The fix is that a continued note **plays as one sound**: no
re-attack, and its pitch bends into the next note. §2 is the one rule for
every console.

Evidence: file:line from the capture code on main (b8585bc7). Counts come
from real rips in /tmp/recap/rips/<console>, read with the repo's own
capture code and `readSmf` (tools/capture-diff.mjs:30). The scratch scripts
are in /tmp/glideaudit, /tmp/snesaudit, /tmp/ps-audit and /tmp/n64audit.
Nothing under albums/ was written.

Legend: **kept** · **partly** · **dropped** · **wrong** (the capture
invents something). "Console" says whether the console voice (the
re-render of the rip) has it. Console fixes need no re-capture, because the
renderer re-reads the rip every time.

---

## 0. The blind spot, shown once per console

| Console | What the chip/driver did | What the .mid holds | Evidence |
|---|---|---|---|
| NES | Mega Man 2 "Air Man", pulse1: one smooth fall of about 30 cents per frame. No $4003 write, so the note never restarts. | p95, p94, p93, p92… each a new note-on at v102. The bend dips about 40 cents and then **snaps back to centre at every note-on**, so a smooth fall plays as a sawtooth with a fresh attack every 50 ms. | notes.mjs:73–76 (a move of 70 cents or more opens a new note); midi-write.mjs:77–79 (each note's bend starts from 0); collapseSlides (notes.mjs:164–197) merges only steps of 2 frames or less |
| Game Boy | A period change without NRx4 bit 7 (the trigger) is one continuing note. | A new note with no flag. | gbs/notes.mjs:114–119, :128 |
| SNES | A PITCH change with no KON bit set: the envelope runs on and the sample does not restart. | `start(v, …, true)` marks the event `legato: true`, then **makeMidi drops the flag**. Note-off and note-on land at one tick, and the velocity is the full attack peak even mid-decay. 3,094 of 36,090 melodic notes (8.6%) in 52 sampled songs. | spc/notes.mjs:313–314, :274, :286, :235; midi-write.mjs:297–300 |
| PS1 | Cry of the Planet: AKAO `0xA4 len, semitones` bends one held D (879 slides, `len` = 3 ticks each) with no key-on. | `splitSlides` cuts the note at each slide's *start*. That gives 294 notes per track, 293 of them touching end to end, with no bend and no continuation mark. `len` is discarded. | akao.mjs:430, :628–637; psx/notes.mjs:113–127 |
| PS1 | Slur and legato `0xCC/CD`, `0xD0/D1`: the next note changes pitch with no new attack. | `n.legato` is computed and **read nowhere**, in the .mid *and* in the console voice (each note gets `new Envelope`). FF7: 16,423 notes, `0xCC` in 56 of 90 songs. | akao.mjs:371; spu-render.mjs:300 |
| PS2 | FFX BGM `0x5C` bends under one note-on. Dark Cloud SQ `0xE0` bends. | FFX: rounded to semitones, so 6,421 sub-semitone points vanish and 131 notes are split. Dark Cloud: **all 9,713 bends dropped**, in the .mid and the console voice. | bgm.mjs:209–231; psx/notes.mjs:119; sq.mjs:119; psx/notes.mjs:58; ps2/capture.mjs:84 |
| N64 | Rare's pitch wheel `0xE0` inside a note; EAD channel bend `D3/DE` under a held note. | Rare: split into re-attacked notes (Banjo-Kazooie: 5,258 bent notes become 21,658 extra notes) and sub-semitone wobble dropped. EAD: dropped, and the **console voice also reads the bend only at the note-on**. | rare.mjs:283–298; n64/notes.mjs:19–33; seq-libultra.mjs:439–440, :348; render.mjs:247, :502 |

This is more than slides. NES legato phrases (Castlevania II: 1,030–1,269
chip-continuous note boundaries over 10 tracks × 40 s) and SNES pitch steps
without a KON are steps, not glides, and they also re-attack today. **One
rule covers both cases: when the chip did not restart the note, playback
does not restart it.** A glide is just the case where the pitch path between
the two notes is a ramp instead of a step.

---

## 1. Per console: everything audible, and what the capture keeps

### NES (tools/nsf/), capture v2 on main (888d93e2)

| Capability | .mid | Console | Evidence | Measured (8–10 tracks × 40 s) |
|---|---|---|---|---|
| Slide or legato of 70 cents or more, steps longer than 2 frames | **dropped** as one sound (split, re-attacked, bend snaps back) | kept | notes.mjs:73–76; midi-write.mjs:77–79 | touching notes / chip-continuous / already ramping into the next note: MM2 275/79–88/45; Castlevania II 2652/1030–1269/30; Ninja Gaiden II 1338/756–1024/32; Shatterhand –/1763/19; Kirby and Punch-Out 0 |
| Slide with steps of 2 frames or less | kept (merged into one note plus bend) | kept | notes.mjs:175–190 | |
| Vibrato and detune under 70 cents | kept (bend from the note's own start frequency; static detune dropped on purpose) | kept | notes.mjs:61–75 | MM2 8,972 bend events |
| Hardware sweep ($4001/$4005) moving the period | **dropped** (only its mute rule is kept) | kept | notes.mjs:40–43, :144–145 | FF3 52 sweep-enable writes |
| Constant-volume level steps | kept (velocity, `ve`, shape on rises) | kept | notes.mjs:116–129; midi-write.mjs:148 | |
| **Hardware envelope mode** ($4000 bit 4 = 0) | **dropped**: volume reads as null, so velocity 96, no `ve`, no shape | kept | notes.mjs:82, :92; midi-write.mjs:283 | Zelda 101 notes |
| **Triangle linear counter and length counter (when the note is cut off)** | **dropped**: the counter's reload value is read, the countdown is not. Notes run long. | kept | notes.mjs:46, :113 vs apu-render.mjs:204–228 | too long: Zelda 439/511 (3,378 frames ≈ 56 s), SMB3 136/155, Castlevania II 423/499, MM2 126/1154 |
| Pulse length-counter expiry | dropped | kept | not modelled | Zelda 4 notes |
| Duty at the attack, and inside a note | kept (CC70); the synth doesn't switch the wave mid-note | kept | notes.mjs:130–134 | Kirby 12,010 CC70 |
| Noise period | partly (3 GM drums) | kept | midi-write.mjs:112 | |
| Noise short (metallic) mode, $400E bit 7 | **dropped** (`& 0x0F`) | kept | notes.mjs:55, :137 | DuckTales 901 writes |
| DPCM hits | kept (last "dpcm" track, velocity 96) | kept | notes.mjs:230–253 | |
| **$4011 raw PCM streams** | **dropped** | kept | notes.mjs:228 | Castlevania II 622 writes, FF3 376 |
| DMC loop flag and rate | partly | kept | notes.mjs:237, :247 | |
| Tempo changes | dropped (one fitted bpm) | n/a | src/import/capture.js:341 | |
| Expansion chips (VRC6, FDS, …) | warning only | — | nsf.mjs:14 | no album uses one |

Console renderer: no gaps found.

### Game Boy (tools/gbs/): still v1, with 0 bends and 0 shapes in every published file

| Capability | .mid | Console | Evidence | Measured |
|---|---|---|---|---|
| Vibrato and detune under 70 cents | **dropped** (no bend series) | kept | gbs/notes.mjs:118–119 | Pokémon Red 12,988 period writes for 3,328 notes |
| Slide or legato without a trigger | **dropped** as one sound | kept | :114, :128 | none in the sample: these drivers retrigger every note |
| Sweep (NR10) | **dropped** | kept | :179 | |
| Envelope down | partly (`ve` only) | kept | :124 | |
| Envelope **up** | **dropped** | kept | :124 | Pokémon 8, Link's Awakening 2 |
| Wave level (NR32) | partly (start level plus falls) | kept | :65, :124 | about 1,350 writes per game |
| Duty at the attack | kept | kept | :135 | |
| Duty inside a note | **dropped** | kept | :181 | |
| **Wave RAM (the wave channel's timbre)** | **dropped** (used only to fix the octave) | kept | :167–172 | Pokémon 21,760 writes |
| Noise 7-bit mode | **dropped** (on the event, never written) | kept | :137 | Pokémon 166 |
| Noise shift | partly (3 GM drums) | kept | :218 | |
| **NR51 stereo** | **dropped** | **mono** | :160–165; apu-render.mjs:11, :147–151 | Pokémon 1,028 changes |
| NR50 master volume and fades | **dropped** | kept | :166 | Pokémon 16 |
| Length counter | kept | kept | :86–87 | |

### SNES (tools/spc/), capture v2 on main (4fbd7ce4)

| Capability | .mid | Console | Evidence | Measured (52 songs × 40 s) |
|---|---|---|---|---|
| **Glide or legato across notes (PITCH with no KON)** | **dropped**: split and re-attacked; the `legato` flag exists but makeMidi drops it | kept | notes.mjs:313–314, :286; midi-write.mjs:297–300 | 3,094 / 36,090 (8.6%). EarthBound 860/2,807, MMX 807, SF2 321, SMW 268, FF4 224 |
| **Phantom notes**: the driver preloads the next PITCH during a GAIN release | **wrong** (notes shorter than 10 ms, stretched to 40 ticks, stacked on the real note) | — | notes.mjs:313 (no check of the envelope stage); midi-write.mjs:277 | 3,026 (8.4%): MMX 1,328, SF2 1,546. Published MMX "Armored Armadillo": 690 same-tick stacks in one-voice tracks |
| Velocity of a continuation note | **wrong** (full attack peak, plays as an accent) | — | notes.mjs:235, :279 | every continuation |
| Vibrato and bends under 70 cents | kept | kept | notes.mjs:315 | |
| Static fine tune | dropped (on purpose: the root is an estimate) | kept | notes.mjs:284 | |
| PMON pitch modulation | dropped | kept | apu-render.mjs:184 | CT Last Battle 1,001 writes |
| ADSR and GAIN envelope, all modes | kept (`n.env`) | kept | notes.mjs:343; dsp-state.mjs:101–128 | |
| KOFF release | kept (note end; the tail is not in the length) | kept | notes.mjs:361 | |
| VOL L/R level | kept | kept | | |
| MVOL master volume | **dropped** | kept | apu-render.mjs:177 | fixed per song in the sample |
| **Surround (negative VOL or MVOL)** | dropped (absolute value) | **wrong: cancels to silence** in the mono fold | notes.mjs:234, :243; apu-render.mjs:190–198 | 4/52 songs (EarthBound, SMW ×2, Super Metroid) |
| Pan | kept (CC10) | **mono** | apu-render.mjs:198 | |
| Sample (SRCN) | kept (program) | kept | midi-write.mjs:297 | |
| BRR loop or one-shot | partly (a one-shot's end is the note's end) | kept | dsp-state.mjs:149 | |
| Noise on/off (NON) changing mid-note | partly (read at KON only) | kept | notes.mjs:276, :309 | CT Last Battle 936 NON writes |
| Noise clock | partly (3 GM drums) | kept | notes.mjs:168, :283 | |
| Echo send (EON × EVOL) | kept (CC91) | **no echo at all** | notes.mjs:252, :364; apu-render.mjs:30–32, :194–197 | |
| Echo character (EDL, EFB, FIR, EVOL) | **dropped** | **dropped** | not read | EDL 64–176 ms, EFB 70–101 in every Square, Nintendo and Rare song sampled |
| FLG mute (bit 6) | dropped | — | not read | rare |
| Tempo changes | partly (one fitted bpm) | n/a | capture.js:325–341 | |

### PS1 (tools/psx/, all six albums are AKAO): the .mid is v1

The writer `makeMidi` (psx/notes.mjs:259–338) writes only pitch, length,
velocity, `ve`, and a CC10 when the pan at a note-on changes.

| Capability | .mid | Console | Evidence | Measured |
|---|---|---|---|---|
| **Pitch slide `0xA4`** | **partly**: split at the slide's start, re-attacked, glide time lost | kept (linear in semitones over `len`; driver curve unverified) | akao.mjs:430, :628–637; notes.mjs:113–127; spu-render.mjs:227–237 | FF7 164 events in 12 songs; Chrono Cross 18,672 unrolled |
| **Slur and legato `0xCC/CD`, `0xD0/D1`** | **dropped** | **dropped** | akao.mjs:371 (read nowhere); spu-render.mjs:300 | FF7 16,423 notes; SaGa 2,297; FF8 1,501; FF9 1,226 |
| Portamento `0xDA/DB` | **dropped** | **dropped** | akao.mjs:514 (`default:`) | FF9 8, SaGa 10 |
| **Vibrato `0xB4–B6`, `0xDD`** | **dropped** | **dropped** | akao.mjs:514 | FF7 in 88 of 90 songs; FF9 181; SaGa 132 |
| Tremolo `0xB8–BA`, `0xDE` | dropped | dropped | :514 | FF7 25 |
| Pan LFO `0xBC–BE`, `0xDF` | dropped | dropped | :514 | FF9 90 |
| Fine tuning `0xD8/D9` | partly (rounded) | kept | :436–437 | Chrono Cross 3,150 |
| Volume, expression, fades (`0xA3/A8/A9`) under a held note | partly (velocity at the note-on; `n.gain` never written) | kept | :423–429, :524–532 | FF7 `0xA9` 7,603 |
| Instrument ADSR | partly (`ve` only) | kept | notes.mjs:277–287 | |
| ADSR overrides `0xAD–B3` | dropped | **dropped** | :514 | FF7 `0xAD` 235; SaGa `0xB2` 950 |
| Program per note (`0xA1/F2/F4`, key splits) | **dropped** (track name only) | kept | :404–420; notes.mjs:242 | |
| Channel volume (`chVol`) | **dropped** | kept | notes.mjs:65–66 | |
| Pan `0xAA` | partly (note-on changes) | partly | notes.mjs:328 | |
| Pan fade `0xAB` | dropped | dropped | :514 | FF7 276 |
| **Reverb `0xC2/C3`, depth `0xEA/EB`, header reverbType** | **dropped** | **dropped** (dry render) | :514, :227; spu-render.mjs:16, :189 | `0xC2` in every song of every PS1 album |
| Noise, FM and pitch mod | dropped | dropped | :514 | 3 or fewer per album |
| Drum map, tempo plus tempo slide, loop | kept | kept | :486–513 | |

### PS2 (FFX = BGM, Dark Cloud = SQ; same writer as PS1)

| Capability | .mid | Console | Evidence | Measured |
|---|---|---|---|---|
| BGM bend `0x5C` | partly (rounded; sub-semitone dropped; splits re-attack) | kept | bgm.mjs:119–124, :209–231 | FFX 2,170 bends; 6,421 points dropped |
| **SQ bend `0xE0`** | **dropped** | **dropped** | sq.mjs:119; notes.mjs:58 | Dark Cloud 9,713 in 59 songs |
| Bend range | assumed ±2; the bank's `pbmin/pbmax` is parsed but never used | | bgm.mjs:196; vab.mjs:37 | |
| **CC7 and CC11** | **dropped** | partly (note-on only) | notes.mjs:54–55, :65–66; spu-render.mjs:180 | FFX 29,741 changes inside a sounding note; Dark Cloud 23,435 |
| Program | dropped | kept | | FFX 2,148 |
| Pan | partly (note-on) | partly | | Dark Cloud 8,009 |
| CC64 sustain, CC1 mod | dropped | dropped | notes.mjs:54 | Dark Cloud 104 / 1 |
| Reverb | dropped | dropped | spu-render.mjs:189 | |
| Bank vibrato and portamento fields (`vibW/porW`) | dropped | dropped | vab.mjs:36 | unverified whether the driver uses them |
| **Unidentified BGM ops, skipped as no-ops** | dropped | dropped | bgm.mjs:72–75 | FFX: `0x60` ×940, `0x3C` ×524, `0x7F` ×359, `0x0A` ×95, `0x5D` ×68, … |

### N64 (tools/n64/): fully v1

Published files carry notes, CC10, the sounding meta and the tempo map. They
have **zero** bends, programs, CC7, CC91 or `ve`.

| Capability | .mid | Console | Evidence | Measured (989 songs) |
|---|---|---|---|---|
| **EAD channel bend `D3/DE` under a held note** | **dropped** | **dropped** (read at the note-on only) | seq-libultra.mjs:439–440, :348; render.mjs:247, :502 | OoT 481 notes / 4,160 writes; MM 572 / 6,613; SM64 97 |
| EAD bend already in force at the note-on | dropped (the roll shows the unbent pitch) | kept | :348; notes.mjs:141 | off by 50 cents or more: SM64 35, OoT 237, MM 290 |
| **Rare wheel `0xE0`** | partly (split into re-attacked notes; sub-semitone dropped) | kept | rare.mjs:283–298; notes.mjs:19–33 | Banjo-Kazooie 5,258 bent notes become 21,658 extra notes; JFG 409 multi-step glides, up to 24 semitones |
| Rare wheel off-centre at the note-on | dropped | kept | rare.mjs:350 | Goldeneye 332, JFG 507 off by 50 cents or more |
| Rare controllers that are never read (CC65, 32–35, 106–109) | dropped | dropped | rare.mjs:339–342 | CC65: DK64 1,128, JFG 974 |
| EAD portamento `C7`, legato `C4` | partly / dropped | dropped (C4) | seq-libultra.mjs:303, :298, :622 | 0 uses today (future games on the engine) |
| EAD vibrato `D7/D8/E1–E3` | dropped | kept | :432–438 | OoT 335, MM 537 notes |
| Channel volume × scale × fade (the mix) | **dropped** | kept | :348; notes.mjs:141 | every note |
| Volume under a held note | **dropped** | kept | n.gain :623–624; rare.mjs:307 | OoT 5,138, MM 7,264 notes |
| ADSR and release (bank, `DA/D9/CB`) | dropped | kept | :349 | all |
| Program | partly (first per track; programs changing within a channel lost) | kept | notes.mjs:142 | DKR 149 channels change |
| Pan under a held note | dropped | **dropped** | notes.mjs:138; render.mjs:32 | |
| **Reverb send** | **dropped** | kept | seq-libultra.mjs:420; rare.mjs:341 | nonzero on 23k–77k notes per game |
| OoT note filter `B0/B3`, comb `BB` | dropped | kept | :442–445 | OoT 1,662 / 321 |
| Tempo map, loop | kept | kept | notes.mjs:146 | |

### What we skip on purpose (so "missed" is never a surprise)

- **Tempo changes inside frame-chip songs** (NES, Game Boy, SNES). Writing
  them moves bars, which the first audit ruled out. The notes' seconds are
  already right.
- **NES expansion chips.** No album uses one; the capture warns.
- **SNES PMON, NES noise short mode, Game Boy noise 7-bit mode,
  pitch-modulation and FM ops on PS1.** Rare, and their sound stays in the
  console voice. Each could later become a CC71 before the hit, but there is
  no payoff for study.
- **N64 OoT filter and comb.** Console voice only; MIDI has no standard
  equivalent.

---

## 2. Glide design: one rule for every console

### The rule

A note that the hardware did **not** restart is a **continuation** of the
note before it on the same voice. It stays a separate note on screen, with
its own start, pitch and length unchanged. It plays as one sound with the
note before it: no new attack, the level carried over, and the pitch moving
along the chip's real path.

The capture decides which notes are continuations from the hardware's own
re-key signal, read the same way for every game:

| Chip/driver | Continuation (no re-attack) | Re-attack |
|---|---|---|
| NES pulse | pitch moves through $4002/$4006 only, with no $4003/$4007 write in that frame, no silent frame before it, and (constant volume) no level rise | a $4003/$4007 write (resets phase, envelope, length) or any silence |
| NES triangle | any boundary with no silent frame (the hardware never resets its phase) | silence: linear or length counter at 0, period ≤ 1, channel off |
| Game Boy | NRx3/NRx4 period writes without bit 7 | NRx4 bit 7 (trigger) |
| SNES | PITCH moves with no KON bit for that voice, and the voice is **not fading** (see phantoms below) | KON |
| PS1 AKAO | `0xA4` slide pieces; notes under slur or legato `0xCC/0xD0` (semantics to verify, §3.0); `0xDA` portamento notes | every other key-on |
| PS2 BGM/SQ | bend-born split pieces under one note-on | key-on |
| N64 Rare | split pieces flagged `slid` after the first (notes.mjs:29/32) | `0x90` |
| N64 EAD | `C4` continuous-notes layer note-ons; split pieces of `D3/DE` bends | layer note-on |

**Never detect continuations from touching notes alone.** Ordinary repeated
notes touch too: in Cry ch 13, 15 of 16 notes touch the one before. The
flag comes from the register or opcode, and only from that.

### How it is stored in the .mid

The chosen design is **CC84 (Portamento Control) before the continuation's
note-on, plus the pitch path as pitch bend that joins up across the
boundary.**

1. **The notes are unchanged.** Same tick, pitch, length and velocity as
   today. capture-diff's note key (track, tick, pitch, length) is untouched,
   so adding links can only give a VELOCITY verdict, never MOVED
   (capture-diff.mjs:180–206 counts the CC84s as "other events").
2. **The link.** CC84 = the previous note's key, written at the
   continuation's own tick on its channel, sorted just before its note-on
   (sort order 0.9: after the offs at 0 and the duty at 0.5, before the
   on at 1). Standard meaning, from Roland GS and GM2: "the next note-on
   glides from this key." In the app, a note field `n.lg = 1`. The writer
   computes the value from the note on that track that actually ends at
   `n.t`; if none does (the notes were edited), the link is not written.
3. **The path.** Pitch bend (0xE0) on the note's channel, as NES and SNES v2
   already write it. One change makes it join up: **a continuation's bend is
   measured from its MIDI key, with the chain head's static offset
   removed.** The head keeps v2's rule (0 at its own start, static detune
   dropped). Every later note in the chain is bent by (real pitch − chain
   head's start pitch) − 100 × (its key − head's key) cents. So the pitch is
   continuous across every link and still never plays a static detune.
   - Example (NES Air Man): the second note no longer snaps to centre. It
     starts at the cents the first note had reached.
   - This is root-free, so SNES's "never against the estimated root" rule
     holds.
   - A sequence-driver glide gets its ramp from the opcode's own data. For
     AKAO `0xA4 len`, the new piece starts bent at −Δ×100 cents and ramps to
     0 over `len` ticks, along the driver's curve (§3.0).
   - Range: RPN 0 at tick 0 sized to the largest bend the track uses (12 or
     24 semitones; Cry's steps reach +12). This is NES v2's existing
     mechanism.
4. **A step without a glide** (slur, legato, an SNES pitch step) is the link
   alone, with no ramp: the pitch jumps and the sound carries on.
5. **Velocity of a continuation** is the level the chip actually had at that
   moment (SNES: VOL × env/ENV_MAX, not the attack peak). The synth reaches
   it with a 15 ms ramp, never an attack.

### Why not the alternatives

- **One long note with a bend.** Breaks Josh's §8 rule: he wants start and
  target pitch visible as notes.
- **Overlapping legato notes** (the next note-on a tick before the last
  note-off). This changes lengths, so capture-diff calls it MOVED. The
  harmony and query tools would also see a two-note chord at every link.
- **CC65 portamento on plus CC5 time.** That is a channel *mode*, not
  per-note. It glides at a fixed time instead of the chip's curve, and most
  synths need the notes to overlap anyway.
- **CC68 legato footswitch.** It needs overlap and a mono mode.
- **A text meta per note.** Non-standard, DAWs ignore it, and it clutters
  the event list. Night Roll already owns two metas (`sounding:` and the
  `source:file` marker); a per-note one would be the first of its kind.

### What a DAW shows if the .mid is exported

- **The notes** look exactly like Night Roll's roll.
- **A "Portamento Control" (CC84) lane** shows a tick at each continued
  note.
- **The pitch-bend lane** shows the real slide curves.
- **Playback.** A GS or XG player (Roland, Yamaha, many GM soft synths)
  reads CC84 as "glide from that key". With the default portamento time of
  0, that is an instant pitch change, so the bend draws the path. A plain GM
  synth ignores CC84: it re-attacks each note but still follows the bends,
  so the slide is audible.
- Nothing is invented, and nothing names a key or a gesture (Learning mode).

### App: parse, draft, write

- **parse.js.** A non-foreign CC84 at tick t on channel ch marks the next
  note-on at tick t on ch: `n.lg = 1`. This uses the same "attaches to the
  note-on at this tick" logic as CC70 (parse.js:116–119). A foreign file's
  CC84 stays a raw phase-2 event, as today.
- **Hops.** Copy `lg` wherever `duties` is copied:
  - versions.js:52;
  - import/hub.js:441 and :698;
  - import/capture.js:544;
  - session/files.js:204;
  - publishSong's re-encode.
  Extend the existing hop-count test.
- **Writers.** Both `writeMidi` (src/midi/write.js:101–121) and
  `writeSongMidi`/`trackBytes` (tools/nsf/midi-write.mjs) must change, and
  stay byte-identical (the pinning test). Also change the raw capture
  writers: makeMidi (NES/GB/SNES), psx makeMidi (PS1/PS2), and
  makeMidiTracks (N64).
- **Edits.** A dragged, deleted or split note whose predecessor no longer
  ends at its tick plays as a normal attack. The writer drops the link, and
  there is no prompt. A user split or paste makes plain notes.
- **Catalog test.** Every published .mid still reads and writes back
  byte-identical, because none carries CC84 today.

### Synth playback (src/audio/voices.js)

Playback joins the linked notes onto the voice that is already sounding,
and the scheduler stays per-note:

1. In `playSynthVoice`, when the next note on this track is a valid
   continuation:
   - the current note schedules **no release**: its gain holds through its
     end and ramps to 0 only 10 ms after it;
   - it registers a live handle `S.chainVoice[ti] = {srcs, g, endSec,
     stopAt, ch}`;
   - the oscillator's `stop()` is provisional.
2. When the continuation is scheduled and the handle is alive and ends
   within 5 ms of the note's `when`, the existing node takes over:
   - `cancelScheduledValues(when)` on its gain and detune;
   - a `setValueAtTime` frequency step to the new key, at exactly `when`;
   - `ctlPitch` for the new note from `when`;
   - a 15 ms ramp to the new velocity × shape;
   - `stop()` called again with the new end (Web Audio uses the last
     `stop`).
   Because the bend is chain-relative, the frequency step and the detune
   jump cancel out, and the pitch stays continuous.
3. Otherwise (playback starts on the continuation, it is scheduled late, or
   a loop wrap falls inside the chain), it plays as a normal attack. So the
   worst case is today's sound.
4. Scope:
   - **First release:** oscillator voices (chip waves, organ, patches) and
     soundfont samples (bend through `playbackRate` on the head's buffer).
   - **Later:** game and sf2 instruments (`scheduleGameNote` renders each
     note with its envelope baked in). They keep re-attacking until a
     render-the-chain pass exists.
   - **Drums:** never.
   - **The console voice:** does not use this path; it replays the rip.
5. **Display.** The notes stay separate. An optional faint connector
   between linked notes is a question for Josh (Q4).

Ask parity (CLAUDE.md item 5): playing captured data is not a user action,
so the commit says "not applicable: playback of captured data". If Josh
later wants to link and unlink notes by hand, that edit gets an `act`
action.

---

## 3. Build list: one more re-capture covers everything

### 3.0 Ground-truth spikes first (each about an hour, no app code)

Settle these against the reference players before any capture code is
written. A wrong guess here is exactly what would force a third
re-capture.

1. **PS1 slur and legato.** Render an FF7 passage with `0xCC` and one with
   `0xD0` on the PSF player. Does the next note re-key? Does `0xD0` only
   cancel the 2-tick early key-off?
2. **AKAO `0xA4` curve.** Is it linear in semitones (what spu-render does)
   or in the pitch register? Test on Cry of the Planet.
3. **FFX BGM unknown ops** (`0x60`, `0x3C`, `0x7F`, `0x0A`, `0x5D`, `0x61`,
   `0x35`, `0x40/47`, `0x50`). Check them against VGMTrans or the PSF2
   player. Some may be vibrato, volume or reverb.
4. **Rare CC65** (and CC32–35, 106–109). Find out what Rare's sequence
   player does with them.
5. **SNES phantom rule.** On the MMX and SF2 write traces, confirm that "no
   new note while GAIN is decreasing, in release, or KOFF is set" removes
   only phantoms. Test on 4 albums with no Capcom songs, where the count of
   removed notes must be about 0.

### 3.1 App layer first (no re-capture, ships before any capture)

1. **The continuation link.**
   - parse, hops and both writers, the catalog round-trip test;
   - capture-diff lists `cc84` as a gain.
2. **Synth chain voice.** §2 "Synth playback", tested on a synthetic linked
   file.
3. **Bend range per track.** Already shared (NES v2's RPN writer). Check
   that it allows ±24.
4. **Two new owned metas, needed before SNES and Game Boy capture them.**
   Otherwise publish drops them, as the SNES v2 `echo:` meta would have
   been.
   - SNES `echo:` (conductor track: EDL, EFB, 8 FIR taps, EVOL);
   - Game Boy `wave:<32 hex>` per waveform.
5. **SHORTENED verdict in capture-diff.** Starts and pitches are the same,
   and only lengths got shorter. For the NES triangle fix (Q1).

### 3.2 Per-console capture changes, ranked, all landing before the one re-capture

**NES (v3)**
1. Continuation link plus chain-relative bend (NES table in §2).
2. Triangle linear and length counter: the real note end (Q1).
3. Hardware envelope mode: a volume series from period and loop flag,
   giving velocity, `ve` and shape.
4. Hardware sweep as bend inside the note. It never splits a note.
5. $4011 PCM streams as hits on the dpcm track (a stream starts at the
   first $4011 change after the channel has been idle).

**SNES (v3)**
1. Write the `legato` flag that already exists as the link; continuation
   velocity = VOL × env/ENV_MAX.
2. **Phantom suppression:** a PITCH move while the voice fades bends the
   dying note instead of opening a new one (Q2).
3. The `echo:` meta.
4. MVOL as CC7.
5. NON toggles mid-note (low).

**PS1 (v2: the whole first-audit list was never built, plus the glide)**
1. `0xA4`: the link, plus a bend ramp over `len`. Slur and legato as links
   (after spike 1). `0xDA` portamento as a link plus a ramp from the
   previous pitch.
2. `n.gain` → `n.env`; ADSR overrides `0xAD–B3` folded into the per-note
   envelope; `chVol` → CC7.
3. Program per note (`pg`).
4. Reverb `0xC2/C3` × depth `0xEA/EB` → CC91 (every song uses it).
5. Vibrato `0xB4–B6/DD` → bend points; tremolo → shape; pan LFO plus fades
   `0xAB` → CC10 timeline.
6. Tuning `0xD8/D9` → a bend offset (chain-relative rule).

**PS2 (v2, same writer)**
1. BGM `0x5C` and SQ `0xE0` → raw bend points, with no rounding.
   Semitone-crossing splits become links. Range comes from `pbmin/pbmax`
   when the bank has it, else ±2.
2. CC7, CC11 and CC64 → `tr.ctl` (the synth already plays them); program
   per change; CC1.
3. Whatever spike 3 finds in the unknown FFX ops.
4. FFX is still held for Josh's ear; it goes after that.

**N64 (v2)**
1. EAD `D3/DE`: a per-channel bend series, including the offset at the
   note-on. This fixes the 562 EAD notes whose roll pitch is off by 50
   cents or more as bend; the written pitch stays the key. Rare `0xE0`:
   raw wheel × the instrument's range. Split pieces become links. RPN ±12
   or ±24.
2. `n.vol` and `n.gain` → CC7 timeline; ADSR → `n.env`.
3. Reverb send → CC91; programs per change; pan timeline.
4. Vibrato → bend points (the render's own Vibrato class, thinned).
5. `C4` legato and `C7` portamento flags (0 uses today; there for the next
   game on the engine). Rare CC65 per spike 4.

**Game Boy (v2: the whole list)**
1. Bend series plus the link.
2. Volume series including rises; duty series; NR50 → CC7.
3. NR51 → CC10 timeline.
4. Wave RAM → program plus the `wave:` meta.
5. Sweep as bend.
6. Noise 7-bit (low).

### 3.3 Console-voice fixes (no re-capture: the renderer reads the rip live)

One console per push, each with an ear check:
- **PS1:**
  - slur and legato with no re-attack (spike 1);
  - `0xDA` portamento;
  - vibrato, tremolo and pan LFOs;
  - ADSR overrides;
  - pan fades;
  - SPU reverb from reverbType and `0xC2/EA`.
- **PS2:**
  - SQ bends (Dark Cloud's 9,713);
  - CC7 and CC11 under held notes;
  - reverb.
- **N64:**
  - EAD `D3/DE` live in render.mjs:247/502;
  - pan under held notes;
  - `C4` no re-attack.
- **SNES:**
  - stereo output, which also fixes surround cancelling to silence;
  - the echo ring buffer (EDL, EFB, FIR, EVOL) at apu-render.mjs:194.
- **Game Boy:** stereo (NR51).
- **NES:** none needed.

### 3.4 Order

1. Spikes (§3.0).
2. App layer (§3.1): link plus chain voice, then the metas and SHORTENED.
   Hear it on one hand-made file.
3. Console-voice fixes (§3.3) in this order: PS1 → N64 → PS2 → SNES → Game
   Boy. These are independent of capture work and can run in parallel.
4. Capture changes in this order: PS1 → SNES → NES → N64 → PS2 → Game Boy.
   PS1 comes first because Cry of the Planet is the ear test; SNES second
   because of the phantoms.
5. **One dry run of all consoles** (tools/recapture.mjs → /tmp/recap3).
   Before applying, the report shows, per console, a count for every row
   of §1 marked dropped. A row still at 0 where the rip has the feature
   blocks the apply.
6. Apply one album per push under the 2026-10-07 rule. CAPTURE_VERSION 3
   for NES and SNES, 2 for the rest.

### 3.5 Josh's ear checks after it lands

1. FF7 Cry of the Planet on an instrument voice with Hear the MIDI: one
   held D gliding, separate notes on screen.
2. Mega Man 2 Air Man pulse1: a smooth fall, no machine-gun attacks.
3. MMX Armored Armadillo: the stacked ghost notes are gone.
4. Zelda (NES) triangle: notes stop where the game stops them.
5. FF7 with the console voice: slurred phrases with no re-attack, and
   reverb present.

---

## 4. Questions for Josh (each has a default)

- **Q1.** The NES triangle notes run longer than they sound (Zelda: 439 of
  511). Fixing that shortens notes. Starts, pitches and bars stay the same.
  *Default: shorten them, under a new SHORTENED verdict that replaces in
  place like VELOCITY.*
- **Q2.** SNES phantom notes (MMX, SF2, a few elsewhere) are notes the game
  never played. Removing them changes the note list. *Default: remove them.
  Songs with your annotations get the "(re-capture)" copy beside the old
  song, as with moved beats.*
- **Q3.** Continuation notes on screen look exactly like today. *Default:
  no visual change.*
- **Q4.** Optionally, a faint line joining linked notes so you can see
  which ones play as one sound. *Wording and look are your call; default:
  off until you ask.*
