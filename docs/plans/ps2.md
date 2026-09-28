# PlayStation 2 — plan

Follows docs/adding-a-console.md. PS2 is not queued (Genesis is next,
docs/plans/genesis.md); this is forward research so a future "what's after
Genesis" conversation has real footing, written against the existing PS1
pipeline in tools/psx/ (SEQ/SEP+VAB, and Square's AKAO, both read directly
from a PSF's decompressed RAM image, no CPU emulation for note extraction —
tools/psx/RESEARCH.md, tools/psx/akao.mjs) since PS2 is PS1's direct
successor in every way that matters here.

## 1. Verdict

PS2 can plausibly get the same treatment as PS1: real notes in the roll,
and eventually the console's own SPU2 sample-based voice, because Sony's own
PS2 sequenced-audio format (SQ/HD/BD, sometimes called "CSL" by the rip
community) is close kin to PS1's SEQ/VH/VB — "SQ is basically standard MIDI
with some minor space-saving tricks" per a community documentation thread
([hcs64.com forum](https://hcs64.com/mboard/forum.php?showthread=63999)) —
and the container (PSF2/minipsf2) is the same "Neill Corlett PSF family"
shape as PS1's PSF, just wrapping an IOP RAM image formatted as a small
filesystem instead of a flat executable
([Portable Sound Format — Wikipedia](https://en.wikipedia.org/wiki/Portable_Sound_Format)).
But PS2 is one real step harder than PS1 in a way that matters for this
app's "no per-game tables, detect the driver from the file" rule
(CLAUDE.md): **Square Enix's biggest PS2 franchises (Final Fantasy X/X-2/
XII, Kingdom Hearts) kept their own AKAO-descended driver rather than Sony's
stock SQ/HD/BD** ([VGMTrans README](https://github.com/vgmtrans/vgmtrans/blob/master/README.md)
lists "SquareSoft's sequence and instrument formats (.bgm, .wd)" as a
*separate* PS2 entry from "Sony's sequence and instrument formats (.bq, .hd,
.bd)"), so this console needs at least two driver readers from day one, not
one with a game-count tail like PS1's SEQ vs. AKAO split already is.

Size: roughly 10–14 sessions to a first-hearable milestone (bigger than
Genesis, smaller than N64 was) — most of the cost is in step 2 (ground
truth) and step 3 (two driver families, both under-documented compared to
their PS1 ancestors) rather than step 4 (SPU2 chip audio should be a modest
extension of the existing PS1 SPU renderer, tools/psx/spu-render.mjs, once
VAG-in-HD/BD banks are read).

Biggest risk: **the SQ/BD/HD format is genuinely under-documented** — the
one community thread that discusses it in any depth says outright "there
seems to be almost zero information about SQ/BD/HD available compared to
their PS1 generic equivalents" and leaves open questions about track
interleaving across SPU2's two cores, per-core reverb, and exact silence
representation
([GitHub discussion #392](https://github.com/vgmtrans/vgmtrans/discussions/392)),
with no answers posted as of that thread. This repo would be doing some of
that reverse-engineering itself, the way tools/psx/akao.mjs's own header
comment describes finding Square's instrument table "by shape" rather than
by a documented offset. A second, smaller risk: the ground-truth player
(kode54's Highly Experimental core) needs a real Sony BIOS image to
synthesize its HLE BIOS from — the exact same blocker already hit and
recorded for the *PS1* ground-truth attempt in this repo (open-items.md,
scratch/psf2wav.c) — so PS2's version of that blocker should be assumed
present until proven otherwise (§4).

## 2. Rip formats

**PSF2 / minipsf2** is the PS2 equivalent of PSF: a zlib-compressed IOP
image, but structured as a tiny **virtual filesystem** rather than PSF's
flat executable+RAM blob, and running at PSF2's native 48,000 Hz vs. PSF's
44,100 Hz
([Portable Sound Format — Wikipedia](https://en.wikipedia.org/wiki/Portable_Sound_Format);
[PSF2 — VGMPF wiki](https://www.vgmpf.com/Wiki/index.php?title=PSF2)).
Like PSF, it must be **run** (on an emulated IOP — the PS2's MIPS-family
sound co-processor, architecturally descended from the whole PS1 CPU) to
produce audio; unlike PS1's SEQ, it's not a format this app can read note
data out of by parsing bytes alone (§3) — the IOP program has to execute far
enough to write its own sequence/bank data into a form worth reading, same
as PSF/PS1 (tools/psx/RESEARCH.md's "Route B" was researched and correctly
NOT implemented for exactly this cost).

Common where: [Zophar's Domain PS2 (PSF2) section](https://www.zophar.net/music/playstation2-psf2)
is large and active — verified by fetch, hundreds of titles (007 Agent
Under Fire through late-2000s JRPGs), including
[Final Fantasy X](https://www.zophar.net/music/playstation2-psf2/final-fantasy-x),
[Final Fantasy X-2](https://www.zophar.net/music/playstation2-psf2/final-fantasy-x-2),
[Kingdom Hearts](https://www.zophar.net/music/playstation2-psf2/kingdom-hearts),
[Kingdom Hearts II](https://www.zophar.net/music/playstation2-psf2/kingdom-hearts-ii),
[Ico](https://www.zophar.net/music/playstation2-psf2/ico), and
[XIII](https://www.zophar.net/music/playstation2-psf2/xiii) all present
(§6). vgmrips.net also has a PS2 section (not individually verified by
fetch here, but PSF2 is exactly the kind of format it organizes, same as
VGM).

## 3. Sound hardware / drivers

**SPU2** — the sound-generating hardware — is PS1's SPU doubled: two 24-voice
cores (48 voices total), each an ADPCM sample-playback engine, running at a
selectable 44.1 or 48 kHz
([PCSX2 wiki, "SPU2 is more than just sound!"](https://wiki.pcsx2.net/PCSX2_Documentation/SPU2_is_more_than_just_sound!);
voice count corroborated by multiple ps2dev.org threads, e.g.
[forums.ps2dev.org/viewtopic.php?t=4122](https://forums.ps2dev.org/viewtopic.php?t=4122)).
It's driven by the **IOP**, a MIPS R3000-family co-processor that runs a
whole separate program from the PS2's main Emotion Engine — structurally the
same arrangement PS1 already has (the PS1's entire CPU *is* an R3000; PS2
kept one as a dedicated audio/IO processor). Sony shipped official IOP
sound libraries (**libsd2**, and a lower-level **libspu2** — PS2SDK's
open-source reimplementation is documented at
[israpps.github.io/ps2sdk libspu2.h](https://israpps.github.io/ps2sdk/libspu2_8h_source.html))
that many games use as-is or nearly as-is.

**Driver families actually seen in the wild** (concretely named, not
guessed):
- **Sony's own CSL stack — SQ (sequence) + HD (instrument header) + BD
  (sample body)**, "basically standard MIDI with some minor space-saving
  tricks" for SQ, and BD/HD structurally parallel to PS1's VB/VH (a bunch of
  SPU-ADPCM samples pasted together; a header pointing into them plus
  ADSR/pitch-bend/portamento per instrument) per the community's own
  reverse-engineering thread
  ([hcs64.com/mboard](https://hcs64.com/mboard/forum.php?showthread=63999)).
  VGMTrans's own README names this driver's files as `.bq`/`.hd`/`.bd` (note
  the "bq" vs. the forum's "sq" — an inconsistency in what extension
  ripping tools expect; worth resolving against a real file rather than
  trusting either source blindly) —
  [VGMTrans README](https://github.com/vgmtrans/vgmtrans/blob/master/README.md).
  Games reported to use *some* form of sequenced CSL-style audio include the
  `.hack//` series ([.hack//Infection sound files](https://hcs64.com/mboard/forum.php?showthread=63999) references it by name) — not independently re-verified here beyond that thread's own claim.
- **Square Enix's AKAO-descended driver** carried forward from PS1 into
  Final Fantasy X/X-2/XII and the Kingdom Hearts series — VGMTrans documents
  this as a distinct PS2 format family from Sony's stock CSL
  ("SquareSoft's sequence and instrument formats (.bgm, .wd)" — same README
  as above), and calls out that its parser "automatically parses raw AKAO
  sequences and combines them with VAB sample banks into ready-to-play
  SoundFonts" for this family across platforms.
- A third, distinct-driver example for coverage: PS2 first-party titles like
  **Ico** (Team Ico / Sony Computer Entertainment) plausibly use Sony's own
  internal tooling — not confirmed here to be stock CSL vs. an in-house
  variant; flagged as an inference, not a verified claim (§7).
- Third-party publishers (Konami, Capcom, etc.) are known in general to run
  their own drivers on other consoles (vgmtrans's README lists Konami and
  Capcom sequence formats broadly, not PS2-specific entries verified here) —
  expect at least one more undocumented driver family to show up once real
  rips are gathered (step 1), the same way PS1 work here turned up AKAO
  as a second family beyond SEQ/VAB.

What's parseable from data vs. needs emulation: **SQ/HD/BD and AKAO-on-PS2,
if truly unpacked and readable the way PSF's minis often are, would be
parseable directly** (no CPU emulation) — same as PS1's SEQ/VAB and AKAO.
But getting from a **PSF2 file** to those bytes requires running the IOP
program far enough that it lays out its own sequence/bank data in RAM (the
same "Route A vs Route B" distinction tools/psx/RESEARCH.md draws for PS1) —
so step 2/3 below assume an IOP-capable emulator is needed as scaffolding
even though the *format itself*, once extracted, is a straightforward
parse.

## 4. Checklist, step by step

**1. Real rips.** Not started. Gather 3+ PSF2 sets spanning the driver
families in §3 before writing any reader (CLAUDE.md/adding-a-console.md
rule): Zophar's PSF2 section (§2, §6) has all three candidate games
verified present. Keep in `/tmp/claude-501/rips/ps2/`, never committed.

**2. Ground truth.** This is the step most likely to stall, based on this
repo's own recent PS1 experience. The reference player is **kode54's
Highly Experimental core** — confirmed real: Neill Corlett wrote the
original "Highly Experimental" Winamp plugin for PSF/PSF2 in 2003; kode54
(Christopher Snowhill) maintains the modern descendant (`aopsf`, the PSF
decoder behind foobar2000's `foo_input_psf`)
([Portable Sound Format — Wikipedia](https://en.wikipedia.org/wiki/Portable_Sound_Format);
[derselbst/aopsf, forked from kode54](https://github.com/derselbst/aopsf)).
kode54's aopsf "replaced PEOpS/PEOpS2 with Highly Experimental's SPU core,
which supports both SPU and SPU2 emulation" per the HCS forum thread on
aopsf ([hcs64.com/mboard/forum.php?showthread=42684](https://hcs64.com/mboard/forum.php?showthread=42684))
— i.e. the *same* core family already partially built in THIS repo's
scratch/ for PS1 ground truth (scratch/Highly_Experimental/Core,
scratch/build-psf.sh) very likely already contains, or is a short step from,
SPU2/PSF2 support, since it's the same upstream lineage. That PS1 attempt
compiled and booted cleanly on this Mac's arm64 with plain clang (no
dynarec, no arch-specific code — scratch/build-psf.sh's own comment: "same
recipe shape as lazyusf2's build") but was blocked on needing **a real,
copyrighted Sony BIOS dump** for its `mkhebios_create` HLE BIOS synthesizer
(open-items.md, "PS1 ground truth is still unverified against a real
player"). **Assume the PS2 version of this same blocker exists** — a PSF2
HLE BIOS likely needs real PS2 BIOS module bytes the same way — until an
attempt proves otherwise. The **Audio Overload SDK** (AOSDK,
[github.com/nmlgc/aosdk](https://github.com/nmlgc/aosdk)) is the other
concrete candidate: a portable C++ library bundling six engines including
`.PSF2 (Sony PlayStation 2)` explicitly — check whether its PSF2 engine
needs the same BIOS dump or ships its own HLE BIOS data before assuming
either path is blocked. No macOS arm64 build was confirmed by fetch for
either project in this research pass; both are plain C/C++ (no known
architecture-specific code), which is the same profile as the PS1 core that
already built here.

**3. Capture → notes.** New readers, at minimum two: `tools/ps2/sq.mjs`
(or wherever Sony's SQ/HD/BD format lands, parallel to tools/psx/seq.mjs +
vab.mjs) and `tools/ps2/akao2.mjs` (parallel to tools/psx/akao.mjs, since
Square's driver evolved rather than restarted — reuse akao.mjs's opcode
table as a starting point and diff against a real FFX rip rather than
assuming it's identical). Both need the PSF2 container reader first
(parallel to tools/psx/psf.mjs — parse the mini/lib chain, but unpack PSF2's
filesystem layout instead of PSF's flat blob). Unknowns: SQ/HD/BD's
per-core track assignment and reverb config are explicitly unresolved even
in the community's own documentation attempt (§1); expect to answer these
by inspection against a real ripped file, the way akao.mjs's own header
comment says its instrument table was found "by shape" with no header
naming it.

**4. Chip audio.** Should be the easiest step, if step 3 succeeds: SPU2 is
architecturally a doubled PS1 SPU (§3), and tools/psx/spu-render.mjs already
renders VAG/SPU-ADPCM sample playback with envelopes — extending it to two
cores (mainly for panning/reverb-routing purposes) should be a modest
addition, not new research, assuming HD/BD's ADSR fields map onto the same
math tools/psx/instr.mjs already implements for AKAO's envelope curves.

**5. Persistence + publish.** Same shape as every other console:
keepBytes/libs, album.json vault paths, `CONSOLE_OF` gets a `ps2` entry.
No PS2-specific unknowns expected here.

**6. Instruments.** See §5 below — should reuse tools/instruments/model.mjs
almost unchanged, since PS2's samples are VAG (identical format to PS1's).

**7. Terminal import.** tools/import-set.mjs gets a PS2 branch once readers
exist.

**8. Listening pass.** Josh's ear, 3+ games, per CLAUDE.md.

**9. Docs.** NIGHT-ROLL.md PS2 sections, tools/ps2/INTEGRATION.md +
RESEARCH.md (this plan is NOT that research doc — a real RESEARCH.md would
need to nail down the SQ/HD/BD byte layout against an actual unpacked file,
which nobody has done publicly in detail per §1's "almost zero information"
finding), help sheet/HELP.md/drift keyword, open-items.

## 5. Instruments

PS2 instruments should be the *simplest* part of this whole console, not the
hardest (opposite of Genesis): **VAG samples in HD+BD bank pairs are the
same 4-bit SPU-ADPCM sample format PS1's VAB already uses**, just split
across two files (HD = header/instrument table, BD = concatenated sample
bodies) instead of VAB's single combined VH+VB. tools/instruments/model.mjs's
existing Sample/Region/Envelope shape — built for exactly this — should
apply with little to no change; tools/psx/vab.mjs's tone-table reader
(center note, ADSR, pan, per-tone VAG index) is a close template for an
HD reader. Square Enix's AKAO-descended driver on PS2 similarly should still
be reading VAG samples under the hood (same as PS1 AKAO/instr.mjs), so a
single sample/instrument model likely covers both PS2 driver families —
unlike Genesis, where FM patches force an entirely new model.

SF2/SFZ export (tools/instruments/export.mjs) should apply basically as-is,
since it already handles sample+region+envelope libraries for PS1/N64/SNES.

## 6. First milestone

Smallest slice to hear/read something: pick the **least driver-diverse**
route in first — likely Sony's stock SQ/HD/BD on one small, well-behaved
title — get a PSF2 unpacked, notes extracted, and rendered through a
one-core SPU2 renderer (reusing spu-render.mjs almost unmodified) before
touching Square Enix's second driver family. Ground truth (step 2) may need
to be skipped or deferred exactly as it was for PS1, verifying instead
against internal consistency + Josh's ear on games he knows (CLAUDE.md "ear
reports are measurements") if the BIOS-dump blocker repeats.

Three test games for driver coverage, all verified present on Zophar's PSF2
section:
- **Final Fantasy X** — Square Enix's AKAO-descended driver.
  [zophar.net/music/playstation2-psf2/final-fantasy-x](https://www.zophar.net/music/playstation2-psf2/final-fantasy-x)
- **Ico** — Sony first-party (Team Ico / SCE); likely Sony's own tooling,
  possibly closer to stock CSL than a third-party publisher would be, but
  not confirmed (§3, §7).
  [zophar.net/music/playstation2-psf2/ico](https://www.zophar.net/music/playstation2-psf2/ico)
- **XIII** — third-party publisher (Ubisoft), a different code lineage
  again from either Sony or Square Enix.
  [zophar.net/music/playstation2-psf2/xiii](https://www.zophar.net/music/playstation2-psf2/xiii)

## 7. Open questions for Josh

- The SQ/HD/BD format is under-documented even by the rip community's own
  admission — is Josh willing to have a session spend real reverse-
  engineering time on it (matching akao.mjs's "found by shape" approach), or
  should PS2 wait for better public documentation to surface?
- The ground-truth BIOS-dump blocker that stopped PS1's cross-check
  (needs a real, legitimately-owned Sony BIOS image) will very likely repeat
  for PS2's Highly Experimental / AOSDK core. Does Josh have, or is he
  willing to obtain, a legitimate PS2 BIOS dump from hardware he owns? If
  not, PS2 ground truth stays approximate (internal-consistency + ear),
  same as PS1 today.
- Is Ico (Sony first-party) actually worth including as a driver-diversity
  example, or would a confirmed-CSL title (found once real rips are in
  hand) be a better third test game? This plan's Ico pick is an inference,
  not a verified-driver claim.
- Same SF2-export question as Genesis's, in reverse: since PS2 instruments
  ARE genuinely sample-based (unlike Genesis FM), is SF2/SFZ export wanted
  as part of the first instruments milestone, or held for later like the
  other consoles' rollout order (open-items: "SNES instruments next, then
  NES/GB/Genesis")?
