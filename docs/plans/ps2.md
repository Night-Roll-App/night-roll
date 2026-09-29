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

## 8. Findings (milestone 1, 2026-09-28)

Real rips: `/tmp/claude-501/rips/ps2-{ffx,ico,xiii,darkcloud}/` (never
committed). Zophar's "(EMU)" packs for **Final Fantasy X** and **Ico** were
downloaded first, per this plan's own §6 three-game list; Ico's and (a
third download, **XIII**, this plan's other §6 pick) both turned out NOT to
be PSF2 at all once inspected (below), so a fourth game — **Dark Cloud** —
was added once real-file evidence (a vgmtrans GitHub issue naming its
`.hd`/`.bd`/`.sq` files) resolved this plan's own §7 open question about
which third game is a confirmed Sony-stock title. Code: `tools/ps2/{psf2,
sq,hd,capture,dump,make-test-sq}.mjs`; tests: `tests/ps2.test.mjs` (12,
synthetic), `tests/ps2-real.test.mjs` (3, guarded on the rip dirs — all
real minis in all three usable sets, ~240 files total). `npm test`: 100%
green, `node --test tests/ps2.test.mjs tests/ps2-real.test.mjs` both 0
failures.

**Container (PSF2).** Confirmed byte-for-byte against real Final Fantasy X
and Dark Cloud files, and against the reference decoder kode54/psflib's
`psf2fs.c` (read for the spec, not copied — `tools/ps2/psf2.mjs` is fresh
code): same 16-byte PSF header as PS1's PSF, but `programSize` is always 0
— the whole payload is the "reserved" area, a directory tree of 48-byte
entries (`name[36]` + `o`/`u`/`b` triple, all `u32` LE, `o` relative to the
reserved area's own start): `u==0 && b==0 && o!=0` is a subdirectory at `o`;
`u==0 || b==0 || o==0` is an empty file; otherwise a real file, whose block-
compressed-size table (`ceil(u/b)` `u32`s at `o`) is followed immediately
by that many zlib streams back to back. `_lib` works exactly like PSF1's.

**Formats, settled from real files, not guessed:**
- **Final Fantasy X — Square Enix's own driver, "BGM"/"WD".** NOT AKAO-
  descended: reading VGMTrans's `SquarePS2Seq.cpp` shows a wholly different,
  simpler byte-code (0x10–0x1A note-on/off variants referencing a "previous
  key/velocity", 0x20 program change, 0x22/0x24 volume/expression, 0x5C
  pitch bend, 0x08 one-byte BPM) — no degree/length-index encoding, no
  per-song header block like AKAO's. This corrects the plan's §1 assumption
  ("Square's driver evolved rather than restarted... reuse akao.mjs's
  opcode table"): it didn't, so BGM was NOT implemented this milestone
  (identified only, `tools/ps2/capture.mjs`'s `"bgm-unimplemented"` path),
  per this plan's own §6 conditional. Every one of the 92 real `.minipsf2`
  files carries its song's `.bgm` (48 ticks/quarter, 2–37 tracks) AND its
  own `.wd` bank directly in the mini's own filesystem — the shared
  `.psf2lib` holds only IOP driver modules (`ffx.irx`, `libsd.irx`, …), a
  different split from Dark Cloud's (below).
- **Ico and XIII — not PSF2 at all.** Every file in Zophar's "(EMU)" packs
  for both titles fails `isPSF2` outright: Ico's are `GENH`-tagged (a
  vgmstream generic-header wrapper around a raw PCM/ADPCM stream — no
  filesystem, no sequence, just pre-rendered audio) and XIII's are Ubisoft's
  own `SShd`/`SSbd` stream container (same idea: cinematics and level music
  as literal decoded/decodable audio streams, one `.vag`-suffixed file
  loose in the set too). Settles this plan's §7 open question about Ico
  ("is Ico worth including… or would a confirmed-CSL title be a better
  third test game") the hard way: neither title sequences its music at
  all — both stream it — so neither could ever have been a driver-diversity
  example for this console's "read the score" approach, regardless of which
  driver family it nominally belongs to.
- **Dark Cloud — Sony's own stock driver, confirmed as literal `.SQ`/
  `.HD`/`.BD` files** inside its shared `DarkCloud.psf2lib` (169 files, all
  at the library's root — no subdirectories at all, unlike FFX's nested
  `music/data/` + `wave/` tree). Settles the plan's §1 "SQ vs bq" naming
  question from two independent real sources: VGMTrans's own scanner
  registers extensions `{"sq","hd","bd"}` (`SonyPS2Scanner.cpp`), and every
  real Dark Cloud filename ends literally in `.SQ`/`.HD`/`.BD` — it is
  **"sq"**, not "bq". Each mini (59 real `.psf2` files, 3+ songs' worth of
  a single set as the milestone asks) carries only a 106-byte `psf2.ini` —
  a literal plain-text command line, e.g. `sq.irx -r=3 -d=4096
  -s=7A3A3752.SQ -h=75A4397E.HD -b=7881E461.BD` — naming that song's
  triplet by filename. This is the driver-detection mechanism itself (no
  per-game table, CLAUDE.md): `tools/ps2/capture.mjs`'s `ps2Song()` reads
  the mini's own `psf2.ini`, parses `-s=/-h=/-b=`, and looks those names up
  in the merged (mini+lib) filesystem.

**SQ notes.** `tools/ps2/sq.mjs`, read for byte layout from VGMTrans's
`SonyPS2Seq.cpp`/`.h`: a single interleaved multi-channel event stream with
running status — exactly PS1 SEQ's shape — so it produces a `seq` object
in SEQ's own shape and **reuses PS1's helpers and note pipeline completely
unmodified**: `secondsAt`/`barBeat`/`bpmOf` (`tools/psx/seq.mjs`) and
`seqNotes`/`toNotesTxt`/`makeMidi`/`kitify`/`channelGroups`
(`tools/psx/notes.mjs`) all run over an SQ-parsed `seq` with zero PS2-
specific branches — the reuse the plan's §4 asked to check for. What
differs from PS1 SEQ, byte for byte (each with a regression test): note-off
is one data byte only (no velocity); the *last* data byte of any event may
carry a "next event has zero delta-time" flag in its top bit (always safe
— every real value here is 7-bit); the tempo meta has one padding byte
before its 3-byte value; there is no time-signature meta at all (4/4
assumed, warned once); loop points are CC99 value 0/1 (not PS1's 20/30),
translated to PS1's own "127 = forever" `loop.count` sentinel so
`toNotesTxt` needs no branch.

**HD/BD bank.** `tools/ps2/hd.mjs`, read for byte layout from VGMTrans's
`SonyPS2InstrSet.cpp`/`.h` — a genuinely well-documented format in the
*source*, if not in prose (the community thread's "almost zero
information" holds for the wikis, not for VGMTrans's own C++). Every chunk
tag (`Prog`/`Sset`/`Smpl`/`Vagi`) and address landed exactly where the
header said, verified against a real Dark Cloud HD file, and its
`bodySize` field matched its paired `.BD` file's real size exactly. One
correction found only by sweeping every real file (not in any doc):
**Sample and VAGInfo offset tables carry the same `0xFFFFFFFF` "unused
slot" sentinel** the Program/SampleSet tables do — VGMTrans's own C++
reader does not guard this, but real Dark Cloud files have unused slots in
both tables, and an unguarded reader throws (JS `DataView` — 40 of 59 real
songs failed until this was added). `toBank()` reshapes a parsed HD (+ the
BD bytes) into the exact object shape `tools/psx/vab.mjs`'s `parseVAB()`
returns, so **`tonesFor`/`vagPcm`/`estimateRoot`/`decodeAdpcm` all run
unmodified** over PS2 Sony-format data — BD samples are the same SPU-ADPCM
format as PS1's VAG/VAB (plan §5's prediction, confirmed).

**Verification (no reference player — plan §2's BIOS blocker applies here
too, untested this milestone).** Dark Cloud, every one of 59 real `.psf2`
files, `node --test tests/ps2-real.test.mjs`:
- 59/59 parse with zero warnings and zero thrown errors.
- 50/59 carry a found loop (CC99 0/1); the rest are one-shot jingles/short
  cues, consistent with the set's titles.
- Every note's key is in MIDI range; every tempo is 20–300 bpm.
- **Median tag-length ÷ measured-length ratio: 0.977** (measured = two full
  loop passes when a loop was found, else the last note's end) — the same
  quality bar PS1's AKAO work hit (INTEGRATION.md §7's per-game table:
  0.998–1.113 medians). One clear outlier (`99 Unknown 5.psf2`, ratio
  0.330) — a very short stinger where the two-pass model doesn't fit; not
  investigated further this milestone.
- Final Fantasy X: 92/92 real `.minipsf2` files' containers parse cleanly
  and yield a readable `BGM ` signature + 48 ticks/quarter, uniformly (no
  note extraction — identified-only, per this format's milestone-1 scope
  above).

**What milestone 2 (chip audio from BD samples) needs next:** the format
work here front-loads most of milestone 2's risk — `toBank()` already
produces a working, VAB-shaped bank whose samples decode with the existing
`decodeAdpcm` and estimate a root with the existing `estimateRoot`, both
unmodified. What remains: (1) extend `tools/psx/spu-render.mjs` (or a thin
`tools/ps2/spu2-render.mjs` wrapper) for SPU2's two 24-voice cores — mainly
panning/reverb routing, per docs/plans/ps2.md §3/§4's own prediction that
this should be "a modest addition, not new research"; (2) the `ProgParam`/
`SplitBlock` LFO and cross-fade fields `hd.mjs` parses but `toBank()`
currently ignores (vibrato, velocity-crossfade between sample-set members)
— optional polish, not required to hear something; (3) Square's BGM/WD
format is still unimplemented — a second, unrelated reader (not a variant
of AKAO) would need its own opcode table before FFX could be heard; (4) no
PS2 ground-truth player exists yet (same BIOS blocker as PS1's), so the
only cross-check available for a real render will be internal consistency
(this milestone's tag-ratio/pitch-range checks) plus Josh's ear, exactly as
PS1 shipped.

## 9. Milestone 2 — DONE 2026-09-28 (app wiring + chip audio)

A PS2 set now imports in the app exactly like a PS1 set: `CHIPS.psf2`
(index.html), a `psf2` worker runner (tools/chip-worker.mjs),
`tools/package.mjs`'s runtime manifest, Square's BGM/WD refused with a
named sentence, streamed-audio-only sets (Ico's GENH, XIII's SShd/SSbd)
refused by name at import. §8's prediction held: (1) above (two-core
voice handling) turned out to need NOTHING — `renderSpu()` never modeled
discrete hardware voices to begin with, so there was nothing to double;
`tools/psx/spu-render.mjs` runs over PS2 data with zero PS2-specific
branches, PS1's own tests unaffected. (2) (LFO/cross-fade) and (3)
(BGM/WD) are still open, per above. Two REAL bugs turned up only once
real Dark Cloud audio was actually rendered end to end, not from reading
format docs further: `toBank()` parsed each VAG's own native sample rate
(real files: 22050-44100 Hz) but dropped it before this milestone, always
assuming PS1's fixed 44100; and `toBank()`'s panpot fields were double-
offset (`64 + panpot` on top of values that were already absolute 0-127
pan, matching `vab.mjs`'s own `tone.pan` convention) — every real
program's panpot byte reads exactly 64, silencing/hard-panning nearly
every track until found and fixed. Both fixed, both have regression
tests. Verified on all 59 real Dark Cloud songs (tools/import-set.mjs, a
scratch dir, not published) and 3 songs' full render (per-track RMS > 0;
pitch checks inconclusive without a reference player — see
tools/ps2/INTEGRATION.md §4). Full account: tools/ps2/INTEGRATION.md.
Milestone 3: Square's BGM/WD reader (its own opcode table, VGMTrans's
`SquarePS2Seq.cpp` — confirmed NOT an AKAO variant, correcting this
plan's own §1 guess), PS2 instruments, the listening pass.
