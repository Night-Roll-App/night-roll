# Genesis (Mega Drive) — plan

Follows docs/adding-a-console.md. Genesis is next in queue (Josh, open-items
"CONSOLE ORDER + GENESIS PARKED", 2026-09-28): capture→notes (step 3)
already exists in tools/vgm/; nothing after step 3 does. This is the most
detailed of the three plans because it's the one we actually build next.

## 1. Verdict

Night Roll can show Genesis music as real notes AND play it back in the
console's own FM/PSG voice — this is the best-case console, better-posed
than PS1/N64 were at the same stage, because a VGM file already **is** the
register-write log timestamped at 44100 Hz: no CPU emulation, no play-routine
guessing, ever (tools/vgm/RESEARCH.md §1). Steps 1–3 (rips, and a
capture→notes reader) are done and shipped in the app (NIGHT-ROLL.md
"Genesis import" — wired via File → Import; see also open-items.md
"Genesis (VGM) — IN THE APP 2026-09-27"). This makes the checklist status
below (§4) different from what tools/vgm/INTEGRATION.md §2 describes as an
unimplemented plan — that document predates the actual wiring; treat this
plan's step 3/4 status as current. What's left is steps 4–9: chip audio (a real YM2612 model,
not trivial — see §3), persistence/instruments, terminal import, listening
pass, docs.

Size: roughly 8–12 sessions to a full ship (chip audio is the long pole).
A first hearable/readable milestone (roll + notes, no chip audio, songs
audible only in synth voices as today) is already true — Josh can already
import and read Genesis songs. The next real milestone (§6) is chip audio
for one game, which is 2–4 sessions if the "staged" FM approximation
(INTEGRATION.md §3) is used, or a multi-day job if a faithful port
(Nuked-OPN2 or ymfm) is done first.

Biggest risk: the YM2612 is an FM synthesizer, not a sampler — unlike every
other console done so far (NES/GB pulse+noise, SNES/PS1/N64 sample
playback), there is no "instrument = a sample + pitch ratio" shortcut. Getting
recognizable Genesis timbre requires either a real operator/envelope model
(correct but slow to write and to verify by ear) or an approximation that
risks sounding like a cheap FM plugin instead of the real chip Josh knows
from these games. The second risk, smaller: DAC drums only give rhythm, not
a kit (INTEGRATION.md §2 "the complication: the DAC" — one drum number for
every hit; binning by seek offset is queued but unbuilt).

## 2. Rip formats

**VGM / VGZ** (VGZ = gzip'd VGM, magic `1F 8B`) is the only format that
matters for Genesis and it's already fully understood in this repo:
tools/vgm/RESEARCH.md §1 documents the header, command stream, GD3 tag, and
loop convention byte-for-byte, checked against the VGM 1.71 spec and GD3 spec
(vgmrips.net/wiki). It is a **register-write log**, not a game executable —
there is no analogue to PSF/USF's "run an emulator over the whole game."
This is why Genesis is easier than PS1/N64 ever were.

Common where: [vgmrips.net](https://vgmrips.net) is the rip community's own
site (organizes packs by game, always VGM/VGZ); Zophar's Domain mirrors many
of the same packs under `sega-mega-drive-genesis`
(`https://www.zophar.net/music/sega-mega-drive-genesis/<slug>` — this repo
already downloaded and tested two packs from there, see §6 and
tools/vgm/INTEGRATION.md §4). No other rip format is in real circulation for
Genesis music; VGM won essentially by consensus in the 2000s rip scene.

## 3. Sound hardware / drivers

Two chips, both already fully mapped in tools/vgm/RESEARCH.md:

- **YM2612 (OPN2)** — 6-channel, 4-operator FM. Six independent voices, each
  built from 4 operators wired through one of 8 fixed algorithms (RESEARCH.md
  §2 "Algorithms and carriers"); channel 6 doubles as an 8-bit DAC output for
  PCM drum samples when register 0x2B bit 7 is set. Every register is a
  logged byte in the VGM stream (`0x52`/`0x53` commands) — **fully parseable
  from data**, no emulation needed to get pitch/onset/duration (already done,
  tools/vgm/notes.mjs). Only the **sound itself** (chip audio, step 4) needs
  actual synthesis, because turning "these registers were written" into "this
  is what it sounds like" requires running the FM math (phase generation,
  envelope generator, algorithm routing) — that's emulation of the DSP, not
  of a CPU.
- **SN76489 (PSG)** — 3 square-wave tone channels + 1 noise/LFSR channel, one
  write-only 8-bit interface (RESEARCH.md §3). Much simpler than the YM2612:
  a counter + divide-by-16 tone generator and a 16-bit LFSR for noise, both
  already implemented for NES/Game Boy-family consoles in this app's other
  renderers (the same shape as apu-render.mjs's pulse/noise units, per
  INTEGRATION.md §3 "PSG — trivial").
- **DAC** — not a chip of its own; it's channel 6 of the YM2612 repurposed to
  stream raw 8-bit PCM (drum samples baked into the VGM as a data block,
  `0x67` type 0). Parseable from data (the samples are literally in the
  file); reconstructing *which* drum sound plays at *which* pitch/kit slot is
  not separable from the sample bytes themselves (there's no register that
  names "kick" vs "snare" — see §5).

Both chips are **fully data-derivable for notes** (no emulation for step 3,
already shipped) but **need real synthesis for chip audio** (step 4, not a
shortcut like sample playback). This is the one console-specific fact that
makes Genesis's step 4 harder than PS1/N64/SNES's: those consoles' chip
audio is "play the console's own sample at a pitch ratio" (already built,
tools/psx/spu-render.mjs, tools/n64/render.mjs); Genesis's is "run a
synthesizer."

## 4. Checklist, step by step

**1. Real rips.** DONE. Two Zophar packs (Sonic the Hedgehog, Sonic the
Hedgehog 2 — 50 files total) tested against the parser with zero crashes;
findings pinned in tests/vgm-real.test.mjs. Held only in scratch, never
committed (tools/vgm/INTEGRATION.md §4).

**2. Ground truth.** NOT DONE — no reference player has been run against
these rips yet (unlike PS1's attempted cross-check and N64's confirmed one
against lazyusf2). Candidates, both open source:
  - **libvgm** ([github.com/ValleyBell/libvgm](https://github.com/ValleyBell/libvgm))
    — the maintained successor to the classic VGMPlay, CMake-based, includes
    a `vgm2wav` command-line tool (headless WAV renderer, no audio-device
    dependency) alongside `vgmtest`/`audiotest`. CMake projects generally
    build on arm64 macOS without special-casing, but this wasn't confirmed by
    fetching a macOS-specific build log — **try `vgm2wav` first** since it
    needs no libao/audio-driver plumbing, only file I/O.
  - **VGMPlay (legacy)** ([github.com/vgmrips/vgmplay-legacy](https://github.com/vgmrips/vgmplay-legacy))
    — the older C player; documented macOS build is
    `brew install libao && make install MACOSX=1 DISABLE_HWOPL_SUPPORT=1`
    (credited to "grauw" in its own docs). No arm64-specific instructions are
    documented, but it's a synchronous C build with no dynarec — the same
    shape as the PS1/N64 cores that already build clean on this Mac's arm64
    (see the PS1 ground-truth attempt below), so it likely just works.
  - Either gives a real YM2612+SN76489 emulator's WAV to check this app's own
    renderer's onsets/pitch/levels against, once step 4 exists. Until then,
    "ground truth" for the reconstructed *notes* (not audio) is the VGM
    spec itself plus the real-rip regression tests already pinned — there's
    no ambiguity in note extraction to check against a player for, only in
    audio quality.
  - Reusable precedent in this repo: scratch/Highly_Experimental/Core +
    scratch/build-psf.sh built kode54's Highly Experimental core (the engine
    behind foo_psf/Audio Overload, and per kode54's own aopsf project, the
    same lineage that also does PSF2/SPU2 — see docs/plans/ps2.md §4) cleanly
    on this Mac's arm64 with plain clang, no dynarec, no arch-specific code
    (open-items.md "PS1 ground truth is still unverified…"). Not usable for
    Genesis (it's an IOP/SPU core, not YM2612/PSG), but it's proof this kind
    of C emulator core builds here without drama, which is encouraging for
    libvgm/VGMPlay too.

**3. Capture → notes.** DONE, including the app wiring. tools/vgm/vgm.mjs
(`parseVGM`/`inflateVGM`), notes.mjs (`reconstruct`/`toNotesTxt`), MUL-aware
FM pitch and DAC-burst-to-drum-hit clustering (two real bugs found and fixed
against the Sonic rips — INTEGRATION.md §4 "Bugs found and fixed"). This IS
wired into `CHIPS.vgm` in index.html today (magic sniff for `"Vgm "` + gzip,
`perFile`, `tagged` loop/length from the header, `parseAsync`, `run` —
verified directly against the source, not just the docs) — File → Import
already takes .vgm/.vgz sets. tools/vgm/INTEGRATION.md §2's "Import flow" is
a written plan that reads as not-yet-implemented, but that's now stale
against the actual app; don't re-do this step. What `CHIPS.vgm` does NOT yet
have, unlike `spc`/`psf`, is `render`/`renderRate`/`lead` — that's step 4.

**4. Chip audio.** NOT DONE — the long pole. tools/vgm/INTEGRATION.md §3
already lays out the plan in detail:
  - PSG: trivial, ~60 lines, same shape as apu-render.mjs's existing
    pulse/noise units (tone counter + divide, LFSR noise, dB-stepped
    attenuation, DC high-pass).
  - YM2612: two options. (a) A faithful port of a known cycle-accurate core
    — **Nuked-OPN2** ([github.com/nukeykt/Nuked-OPN2](https://github.com/nukeykt/Nuked-OPN2),
    cycle-accurate YM3438/YM2612, ~2000 lines of C) or **ymfm**
    (MAME's cleaner-to-read OPN2 core) — a multi-day port to JS but "does it
    right" (matches this app's philosophy elsewhere: the chip's own DSP, not
    an approximation). (b) A staged approximation (phase generator + sine +
    simplified envelope + algorithm routing, INTEGRATION.md §3 walks through
    each of the 6 steps) gets recognizable Genesis sound in an afternoon and
    can be swapped later. **Recommendation: start with the staged
    approximation for the first milestone (§6), verify by ear against the
    reference player from step 2, then decide whether a full port is worth
    it** — the same "afternoon vs multi-day" tradeoff INTEGRATION.md already
    states. Render cost: ~40M ops/s of audio for a JS operator model,
    "well over 10× realtime in V8" per INTEGRATION.md's own estimate — fine
    for offline rendering into buffers (this app's existing pattern, not a
    live worklet).
  - Reuse: tools/chip-worker.mjs (the existing worker runner shape
    `CHIPS.<kind>.run/render/renderRate/lead`), the offline-buffer-into-gain-
    node pattern from tools/psx/spu-render.mjs and tools/n64/render.mjs.
  - Unknowns: how close the staged approximation sounds to hardware without
    A/B against real recordings (Josh's ear is the actual gate, per CLAUDE.md
    "ear reports are measurements"); LFO/vibrato and SSG-EG are explicitly
    deferred to "a second pass" in INTEGRATION.md.

**5. Persistence + publish.** NOT DONE. Same shape as PS1/N64: keepBytes per
track + a shared lib per album, uploaded to the archive at publish, vault
paths in album.json, `CONSOLE_OF` gets a Genesis entry, `albums/genesis/…`
folder. INTEGRATION.md §2 already specifies the album.json shape
(`vgm: {tracks: {<base>: {file: "<name>.vgz"}}}`) and the .gitignore addition
(`*.vgm`, `*.vgz`).

**6. Instruments.** NOT DONE — see §5 below, this is Genesis's hardest
"instrument" question of any console so far because FM patches aren't
samples.

**7. Terminal import.** tools/import-set.mjs needs a VGM branch (parallel to
its PSX/N64/GBS branches); import the two Sonic sets already downloaded,
publish one game per push (CLAUDE.md's shipping-checklist pattern).

**8. Listening pass.** Josh's ear on every song of 3+ games — the real gate.
Cannot be front-run; do not claim chip audio "works" before this happens
(CLAUDE.md "ear reports are measurements").

**9. Docs.** NIGHT-ROLL.md gets a "Genesis import" + "Genesis chip audio"
section (parallel to the existing PS1 sections); tools/vgm/INTEGRATION.md
already exists and is 90% of this (just needs updating as each step ships,
not written from scratch); WEB-SESSION.md gets tools/vgm/dump.mjs listed
beside tools/nsf/dump.mjs and tools/psx/dump.mjs; help sheet + HELP.md +
drift keyword (CLAUDE.md's standing rule); open-items entries as each step
closes. INTEGRATION.md §5 already has a checklist for this.

## 5. Instruments

An "instrument" on Genesis is fundamentally different from every sample-
based console done so far: it's a **4-operator FM patch** — a set of ~10
parameters per operator (DT1/MUL, TL, RS/AR, AM/D1R, D2R, D1L/RR, SSG-EG;
RESEARCH.md §2 "Per-operator registers") × 4 operators, plus per-channel
algorithm/feedback/pan (RESEARCH.md §2 "Per-channel registers"). There is no
sample to extract, hash, and dedupe the way tools/instruments/model.mjs does
for PS1 VAB/N64 banks — the "instrument" data already lives in the VGM's own
register writes (whatever program the driver wrote before a key-on), so
**extraction is actually easier than PS1/N64 in one sense** (no hunting for a
bank table in RAM — it's just "read the last written value of each operator
register on this channel before this note's key-on") but the *output* is
harder to make useful:

- A **playable FM voice** in the app means either (a) storing the raw
  operator parameters and re-running the chip-audio operator model
  per-note at arbitrary pitch (cheap to store, ties Josh's ability to hear
  a Genesis instrument to chip audio existing at all — so this can't ship
  before step 4), or (b) baking a few sample points (like a real synth
  patch does for a sampler) and treating it like every other console's
  sample-based instrument from then on — simpler for the instrument
  panel/library UI to reuse, but "flattens" the FM patch's real-time
  behavior (an FM patch's timbre can change with velocity/pitch in ways a
  frozen sample won't). **Recommendation: (a)** — it's more work up front
  but it's the only version that's honestly "the game's own instrument," the
  same principle as every other console's instrument feature
  (tools/instruments/model.mjs's Envelope/Region model already anticipates
  this with `raw: the driver's envelope record` as an escape hatch).
- Size: this is a genuinely new kind of instrument model for
  tools/instruments/ — not a drop-in extension of model.mjs's Sample/Region
  shape, since there's no sample. Estimate 2–3 sessions once chip audio (step
  4) exists to build on: a `genesisSong()` extractor (parallel to psx.mjs/
  n64.mjs) that reads distinct operator-parameter sets per channel across an
  album's songs, names them by measurement (name.mjs's existing "encountered,
  not demonstrated" naming philosophy still applies), and hands them to the
  chip-audio operator model at playback time instead of a sample player.
- **SF2 export does NOT make sense for FM patches as a first step** — SF2 is
  a sample format (SoundFont = samples + zones + envelopes over samples,
  which is exactly what tools/instruments/export.mjs already writes for the
  sample-based consoles). An FM patch could only become an SF2 by *baking* it
  into a rendered sample per pitch/velocity (defeating the "instrument =
  real hardware voice" principle above, and multiplying file size). If SF2
  export is wanted for Genesis, it's a second, explicitly-approximate step
  after the real in-app FM voice exists — flag this to Josh rather than
  assume it (§7).

## 6. First milestone

Reading Genesis notes is NOT the milestone — that part already shipped
(§1: `CHIPS.vgm` is live in index.html today, sniff/capture-panel/import all
working, verified directly against the source — the `vgm` entry in `CHIPS`
around index.html's `const CHIPS = {` block has `magic`, `parseAsync`,
`run`, `perFile`, `tagged`, everything a working import needs; it just has
no `render`/`renderRate` keys yet, unlike `spc`/`psf` which do). The real
first milestone is **hearing** the console's own voice: chip audio for one
game with the staged FM approximation (§4) — PSG first (an afternoon,
"trivial" per INTEGRATION.md), then the YM2612 approximation (another
afternoon to a day), tested by ear against one already-downloaded Sonic 1
track before committing to a fuller build.

Three test games for driver coverage (all real Genesis composers/drivers,
not just Sonic's SMPS again), verified present on Zophar:

- **Sonic the Hedgehog** — SMPS driver (Sega's own; already have this pack
  downloaded and tested, tools/vgm/INTEGRATION.md §4).
  [zophar.net/music/sega-mega-drive-genesis/sonic-the-hedgehog](https://www.zophar.net/music/sega-mega-drive-genesis/sonic-the-hedgehog)
- **Streets of Rage 2** — a wholly different driver lineage: Yuzo Koshiro
  composed on his own MUCOM88 tool (a Music Macro Language compiler for the
  NEC PC-88), converted through a modified SMPS variant maintained by
  Ancient/M.N.M. Software, with the on-console driver implementation
  credited to Mikito Ichikawa — heavy, idiomatic FM programming, a good
  stress test for the operator model. (Corrected here: an earlier draft of
  this plan named this a distinct "Music Love" engine — that name did not
  turn up in a follow-up check and looks unverified; MUCOM88 + the Ancient/
  M.N.M. SMPS variant is what the sources actually support.)
  [zophar.net/music/sega-mega-drive-genesis/streets-of-rage-2](https://www.zophar.net/music/sega-mega-drive-genesis/streets-of-rage-2)
- **Shining Force** or **Aladdin** — GEMS driver, used by ~221 Genesis/32X
  games (the most common third-party-friendly driver, created by Jonathan
  Miller/Sega for licensees); a different code shape again, and GEMS is
  reportedly rougher-sounding than SMPS (worth confirming or refuting by
  ear). Aladdin:
  [zophar.net/music/sega-mega-drive-genesis/aladdin](https://www.zophar.net/music/sega-mega-drive-genesis/aladdin);
  Shining Force:
  [zophar.net/music/sega-mega-drive-genesis/shining-force](https://www.zophar.net/music/sega-mega-drive-genesis/shining-force).
  (GEMS driver background:
  [vgmpf.com/Wiki/index.php?title=GEMS](https://www.vgmpf.com/Wiki/index.php?title=GEMS);
  a standalone GEMS player exists too —
  [github.com/ValleyBell/GEMSPlay](https://github.com/ValleyBell/GEMSPlay) —
  not needed since the VGM format is driver-agnostic, but useful if a GEMS
  rip ever needs cross-checking against something other than the VGM log
  itself.)

Whether Shining Force actually runs GEMS specifically (vs. its own driver)
wasn't verified by fetching a page that names it directly — flagged as
unconfirmed; Aladdin is the safer GEMS-confirmed pick if only one
non-SMPS/non-Koshiro title is wanted.

## 7. Open questions for Josh

- **Staged FM approximation first, or go straight for a Nuked-OPN2/ymfm
  port?** The afternoon-vs-multi-day tradeoff is real; starting with the
  approximation means possibly redoing chip audio later if it doesn't hold
  up by ear.
- **FM instruments as live operator models (a) vs. baked samples (b)** — (a)
  is more faithful but ties the instrument library to chip audio's
  correctness; (b) is simpler to slot into the existing sample-based
  instrument UI but is "not really" the instrument anymore. This changes
  what tools/instruments/ has to become for Genesis, so worth deciding
  before starting step 6 of the checklist.
- **DAC drum kit**: bin hits by seek offset into a real multi-drum kit (an
  open-items item already, "queued") — worth doing before or after the
  first chip-audio milestone? It changes how satisfying Sonic's drums sound
  but isn't blocking.
- **SF2 export for FM patches** — worth doing at all, given it can only ever
  be an approximation (baked samples) rather than the real thing? (§5)
- Is a real reference player (libvgm's `vgm2wav` or VGMPlay) worth building
  now, before chip audio exists, purely to have *something* to eventually
  A/B against — or is Josh's own ear against the real Sonic soundtrack (which
  he already knows well) enough ground truth, skipping a reference build
  entirely?
