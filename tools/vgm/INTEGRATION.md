# VGM import — how it slots into Night Roll

Status: the Node pipeline in this directory works end to end
(`tools/vgm/dump.mjs`); nothing in index.html knows about VGM yet. This
note is the plan for wiring it in, written against the NSF import flow
documented in NIGHT-ROLL.md ("Import", "Chip audio") so the two consoles
share one shape. index.html is untouched by this branch.

## 1. What the pipeline produces

| module | in | out |
|--------|----|-----|
| `vgm.mjs` `parseVGM(bytes)` | inflated VGM bytes | `{version, clocks, gd3, totalSamples, loopSample, loopSamples, endSample, log, dac, dacStreams, pcm}` |
| `vgm.mjs` `inflateVGM(bytes)` | .vgm or .vgz bytes | plain bytes (DecompressionStream in the browser, node:zlib in Node) |
| `notes.mjs` `reconstruct(vgm, {endSample})` | the parse | NSF-shaped events `{channel, startFrame, endFrame, midi, vel, velEnd, …}` with the 44100 Hz sample as the frame (`FRAME_SEC = 1/44100`) |
| `notes.mjs` `toNotesTxt(events, opts)` | events | the repo's `.notes.txt` text |
| `midi-write.mjs` `makeMidi(events, {bpm, tsNum, tsDen, snap, loopSample})` | events | type-1 SMF bytes, one track per chip channel |

Channels: `fm1`–`fm6`, `psg1`–`psg3`, `noise`, `dac`. MIDI channels 0–5,
6–8, and 9 for both unpitched tracks (`MIDI_CHANNELS` in midi-write.mjs).

FM events carry `fnum`/`block` (the raw registers), `mul` (the carrier
multiplier the pitch was taken through — see RESEARCH.md §2 "Pitch") and
`mulHi` when the carriers disagree; `vgm.dac` carries a `seek` flag per
write (the drum re-trigger marker) beside `t`/`v`. `trackFromFileName`
in vgm.mjs parses the packs' `NN - Title.vgm` names.

Every module is browser-safe (no Node imports at top level; `inflateVGM`
imports `node:zlib` lazily only when `DecompressionStream` is missing), so
they can be dynamically imported off Pages exactly like `tools/nsf/*.mjs`.

## 2. Import flow (File → Import…)

The NSF flow: byte-sniff → capture panel → per-track run → reconstruct →
loop-detect/trim → grid-fit bpm → `makeMidi` → `parseMidi` → local draft
under `albums/imports/<album-slug>/track-NN.mid` → Commit import. VGM
follows it with three simplifications and one complication.

**Sniff.** Add two magics to the import sniffer: `"Vgm "` and gzip
`1F 8B` (then inflate and re-sniff — a .vgz is the common wild form).
One VGM = one track, so the "capture panel" for a single file is a
one-row list; dropping several files at once (a whole soundtrack from
vgmrips is a zip of ~30 .vgz) should fill the panel with one row per
file, GD3 track name pre-filled as the row title (the GD3 *is* the tune's
real name — no recognition step needed).

**No emulation step.** `parseVGM` + `reconstruct` run in milliseconds for a
3-minute song. No seconds field, no auto-doubling, no progress yield — but
keep `await microYield()` between files when importing a batch so the tab
paints.

**No loop detection.** `vgm.loopSample` is the hardware loop point and the
file already holds intro + one pass. Stash it as the local `loop:` note the
NSF flow writes (convert samples → bar.beat with the fitted bpm, the same
way `toNotesTxt` does). Files with `loopSample == null` are jingles: no
`loop:` note.

**Tempo.** VGM carries none. Seed 120 in 4/4 and run the NSF `fitBpm`
(`tools/nsf/notes.mjs`) with `frameSec = 1/44100` — dump.mjs's `--fit`
already does this, and the chip-native family in that fitter (integer
frames per 16th at 60 Hz) applies to Genesis drivers too since they tick
on 0x62 waits. Meter/tempo stay re-derivable by annotation, as for NSF.

**The complication: the DAC.** Genesis drums are PCM. `reconstruct` turns
DAC bursts into hits on `dac` (channel 10, note 36) with velocity from the
burst's peak — a burst ends at a 30 ms gap *or* at an 0xE0 seek, which is
the driver re-triggering a drum before the last one finished — so the
*rhythm* survives into the roll; the *kit* does not — every hit reads as
one drum. Acceptable for import (Josh reads the
rhythm; the kit is audible in chip audio, §3). An optional refinement is
to cluster bursts by length + peak into 2–3 bins and spread them over
35/38/42, still without naming them.

**album.json.** Mirror the NSF metadata block: `vgm: {tracks: {<base>:
{file: "<name>.vgz"}}}` and upload the .vgz files to the same private
archive repo the NSFs go to (the `*.nsf` gitignore rule needs `*.vgm` and
`*.vgz` beside it). GD3 game/system/composer can seed the album title and
a read-only credit line.

## 3. Chip audio (playback with the console's own voice)

The NSF flow renders the captured register log through a pure-JS 2A03
(`tools/nsf/apu-render.mjs`) into per-channel Float32Array buffers that the
transport plays with mute/solo gains. VGM wants the same: a
`tools/vgm/render.mjs` `renderVgm(vgm, {sampleRate, onProgress}) ->
{fm1..fm6, psg1..psg3, noise, dac}` fed by the same `log`/`dac` arrays the
reconstructor reads. Two synths:

### PSG — trivial

Three square waves + one LFSR, ~60 lines, mirroring apu-render's pulse and
noise units:

- tone: a counter decremented at clock/16 (3579545/16 = 223721.5 Hz);
  each time it hits 0 reload with the period and flip the output. Period 0
  → 1024. Period 1 → effectively DC; Genesis drivers use it for PSG
  "sample" tricks, render it as a flat line at the attenuator level.
- attenuation: 2 dB steps, `gain = 10^(-att/10)`, 15 = 0.
- noise: 16-bit LFSR, taps 0 and 3 (feedback pattern 0x0009, the header's
  value), white = XOR feedback, periodic = single-bit rotate; clocked at
  clock/16 divided by 16/32/64 or by tone-3's period; output = bit 0.
  Writing the control register resets the LFSR to 0x8000.
- output sum per channel, then the console's ~1st-order high-pass (the
  Genesis PSG line is AC-coupled, corner a few Hz) — the same shape
  apu-render applies for the NES RC filters.

### YM2612 — an operator model

The faithful way is a port of a known core (Nuked-OPN2 is cycle-exact and
~2000 lines of C; ymfm's OPN2 is cleaner to read). A 1:1 JS port is the
"do it right" route and matches apu-render's philosophy (the chip's own
DSP, not an approximation). It is a multi-day job. The staged route below
gets recognisable Genesis sound in an afternoon and can be swapped out.

**Operator model (per operator, 4 per channel, 24 total):**

1. *Phase generator.* `phaseInc = Fnum × 2^(block-1) × MUL × detune(DT1, keycode)`
   in the chip's 20-bit phase units per internal sample; the chip's sample
   rate is `clock / 144` (= 53267 Hz NTSC — render at that rate and
   resample, or run the envelope/phase at 53267 Hz and interpolate to
   44100). Channel 3 special mode: operators 1–3 read their own
   Fnum/block registers (0xA8–0xAE), operator 4 the channel's.
2. *Sine with log attenuation.* The real chip does `exp(-log(sin))` in
   quarter-wave tables; in JS `Math.sin` on the phase plus a gain in dB is
   audibly identical until you A/B with hardware.
3. *Envelope generator.* Four rates (AR, D1R, D2R, RR) + sustain level
   D1L, rate-scaled by keycode (RS), in 0.09375 dB attenuation units,
   10 bits (0..1023). Key-on: attack from the current level toward 0;
   attack curves are exponential-ish (the chip's attack is *not* linear —
   use the OPN table shape: level −= (level >> 4) + 1 per step, or a
   `1 − e^(−t)` approximation). Decay/sustain/release are linear in dB.
   Total level TL (0.75 dB/step) adds to the envelope attenuation. SSG-EG
   can be skipped at first (rare in game drivers; a few use it for
   percussive organs).
4. *Algorithm routing.* Eight fixed graphs (RESEARCH.md §2). Modulation is
   phase modulation: a modulator's output (scaled) is added to the
   carrier's phase before the sine lookup. Operator 1 feeds back into
   itself by `feedback` (0 = off, 1..7 = π/16 … π, averaged over the last
   two outputs as the chip does). Carriers sum to the channel output.
5. *LFO.* One global LFO (0x22), 8 rates (3.98–72.2 Hz), applied as
   frequency vibrato (FMS per channel) and amplitude tremolo (AMS per
   channel, AM enable per operator). Second pass.
6. *Output.* Per channel: 14-bit signed, L/R enables from 0xB4. Channel 6
   in DAC mode: the 8-bit unsigned DAC byte (0x80 centred) replaces the FM
   output; write it straight into the `dac` buffer at the moment of the
   write (sample-and-hold until the next write — that *is* what the
   hardware does, and it is why the DAC sounds gritty). The real chip's
   9-bit "ladder effect" DAC crossover distortion is what the YM3438 flag
   toggles; ignore.

**Timing.** The register log is sample-timestamped: render by walking the
log and generating output until the next write's `t`, applying the write,
continuing — the same loop apu-render runs over frames. Fnum latch and
key-on ordering fall out of the log order.

**WebAudio vs JS core.** A native-node build (an OscillatorNode per
operator with `frequency` automation and GainNodes for PM) cannot do phase
modulation — WebAudio has no phase input — so FM must be synthesized in JS
(or an AudioWorklet). Offline rendering into buffers, as apu-render does,
keeps mute/solo/speed working with the existing transport code and avoids
worklet plumbing. Render cost for a JS operator model: 24 operators × 53
kHz × ~30 ops ≈ 40 M ops/s of audio — well over 10× realtime in V8; a
Nuked port is closer to realtime on an iPad, which is one argument for the
approximation first.

### Where it plugs in

Same seams as NSF chip audio: a `chip` source resolves (live import
session → IndexedDB cache → archive repo), the renderer fills per-channel
buffers, the transport's mute/solo gains address them by channel name, the
loop point comes from `vgm.loopSample` instead of the detector, and the
speed slider stays tape-style. Re-import invalidates the render.

## 4. Real rips (2026-09-27)

Josh authorised downloading real packs for testing. Two Genesis sets came
from Zophar's Domain (section slug `sega-mega-drive-genesis`, the
"(EMU)" zip on each song page, e.g.
`https://www.zophar.net/music/sega-mega-drive-genesis/sonic-the-hedgehog`):
**Sonic the Hedgehog** (19 files, 354 KB zipped / 4.6 MB flat) and
**Sonic the Hedgehog 2** (31 files, 903 KB / 11.8 MB). Bytes live only in
the session scratchpad; nothing from them is committed. The text they
carry (GD3 fields, file names, header words, register shapes) is pinned in
`tests/vgm-real.test.mjs`.

### Archive shape

- Plain `.vgm`, **not** `.vgz` — both packs are uncompressed. Every file
  is v1.50 with the data-offset field 0x0C (data at 0x40), PSG 3579545,
  YM2612 **7670453** (one under nominal; kept verbatim), rate 60, PSG
  feedback 0x0009 / width 16. No other chips, no dual-chip bits.
- One file per tune, named `NN - Title.vgm`, 1-based, zero-padded, in
  sound-test-ish order. **No m3u** or any other file in the zip. The GD3
  track name is the tune's name and differs from the file name where the
  file system could not carry it (`18 - Continue.vgm` → "Continue?") or
  where the pack renamed a tag (`31 - Hidden Palace Zone.vgm` → "Unused
  (Sound Test 10)"; `26 - Emerald Hill (2P).vgm` → "Emerald Hill (2
  Player)"). Ten titles repeat across the two games (1-up, Drowning,
  Robotnik…): an import that keys rows by title collides; key by album +
  number.
- GD3: all eleven fields present; EN names always, JP names (katakana,
  fullwidth digits) for most zone tunes and empty for the rest; system
  "Sega Mega Drive" (not "Genesis"); composer "Masato Nakamura" except
  Chaos Emerald / Drowning ("Yukifumi Makino"); ripper "-DJSW-" except
  Sonic 2's Wing Fortress ("kode54"); dates 1991/06/23 and 1992/11/21;
  notes empty.
- Loops: every non-jingle has one, and **intro + loop samples == total
  samples in all 50 files** (the vgmrips "intro + exactly one pass"
  convention holds). Hill Top and Death Egg loop from sample 0. Jingles
  (Title, Stage/Act Clear, 1-up, Chaos Emerald, Drowning, Continue, Game
  Over, both Ending Themes and Staff Rolls) have loop offset 0 = none.
- Command mix per file: 0x52/0x53 register writes, 0x50 PSG, 0x61 waits
  with a scattering of 0x62, the short 0x7n waits, one type-0 data block
  (1.3–36 KB, the DAC bank), 0xE0 seeks, and the 0x8n stream (up to 1.5 M
  commands in Sonic 2's Staff Roll). One or two **0x4F** bytes at the top
  of every file. No 0x90–0x95 DAC streams, no 0x67 blocks of other types,
  no unknown commands: the whole skip table went unexercised.
- The DAC bank is pre-written at time 0: each file opens with 0xE0 + a
  whole sample of 0x80 (wait-0) writes, sometimes several, before the
  first real wait. Special Stage (S1) and both Chaos Emeralds have no DAC
  at all and play FM on channel 6.

### What the dump produced

`node tools/vgm/dump.mjs <file> --bpm 120 --fit` on the four requested
Sonic 1 tracks, after the fixes below (events per channel):

| track | length / loop | fit (seed 120) | fm1 | fm2 | fm3 | fm4 | fm5 | psg1 | psg2 | noise | dac |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 Title Theme | 8.77 s, none | 120 | 16 | 21 | 17 | 17 | 16 | – | – | 24 | 29 |
| 02 Green Hill Zone | 53.20 s, loop 14.80 s (38.40 s pass) | 121.66; **seed 150 → 150 exactly** | 123 | 230 | 130 | 134 | 174 | 72 | 108 | 263 | 161 |
| 03 Marble Zone | 38.48 s, loop 2.48 s (36.00 s) | 133.3 | 65 | 151 | 65 | 80 | 80 | 72 | 72 | 148 | 88 |
| 06 Star Light Zone | 45.60 s, loop 3.37 s (42.23 s) | 124.96 | 69 | 124 | 95 | 95 | 126 | 95 | 95 | 279 | 184 |

Green Hill's grid is 6 frames a 16th (150 bpm, 34 bars, loop returns to
bar 10 beat 2); the fitter seeded at 120 lands on a neighbour, seeded at
150 it is exact — the seed matters, and tempo stays Josh's to set. All
four `.mid` files open in the app's own `parseMidi` (via the vm harness):
ppq 480, 4/4, one track per channel, pitch ranges 26–107. All 50 files
parse and reconstruct with no crash, silent channel, or unknown command;
per-file numbers are in the survey in this session's report.

Pitch ranges after the fixes are musical: Green Hill fm1 lead C5–G6, fm2
bass D1–F3, fm4/fm5 chord stabs D3–E7, psg1/psg2 counter-lines D4–C6; the
highest FM notes in the whole set (F#9 in Star Light / Staff Roll) are a
real high-MUL "tick" voice (Fnum 911 block 7 × MUL 4, echoing at falling
TL), and Oil Ocean's psg3 rings D8 (period 24, attenuation 7→8→9→off in
115 ms) as a PSG percussion tick while the noise channel, armed with
0xE7, stays at attenuation 15 the whole song.

### Bugs found and fixed (regression tests are synthetic, no rip bytes)

1. **FM pitch ignored MUL.** Sonic's chord voice (all operators MUL 4)
   printed two octaves low, its bass voice (carrier MUL 0 = ×½) an
   octave high — the roll came out inverted. Pitch is now base × the
   lowest carrier's MUL; carriers at different MULs record `mulHi`. A MUL
   written under a held note (SMPS writes the next voice ~1 ms before the
   key-off) does not re-pitch it. Tests: `FM pitch follows the carriers'
   MUL…` (vgm.test.mjs), `SMPS voices from the rips…` (vgm-real).
2. **DAC hits merged when samples overlapped.** Burst detection was gap
   only; a kick every 100 ms on a 100 ms sample never gaps. Sonic 2's
   Final Boss (340 seeks) was one hit; Final Zone 44 of 153; Scrap Brain
   104 of 363. An 0xE0 seek now ends the burst; the wait-0 prefill at
   time 0 (no span) is dropped. Tests: `DAC: an 0xE0 seek under a
   still-sounding sample…`, `SMPS DAC as logged…`.
3. **DAC peak printed 128** for sample byte 0x00 (`p128` against a
   documented 0–127 scale). Clamped. Same tests.
4. Pinned, not changed: 0x4F is skipped; loop offset at the first command
   gives `loopSample` 0 (the notes header and MIDI marker say bar 1 beat
   1); GD3 katakana/fullwidth decode; `.vgz` of the same shape inflates.

### What remains approximate

- **Chromatic slide-ins** (Mystic Cave's lead, Sonic 2 Special Stage's
  fm2, Drowning's siren): SMPS steps the Fnum a semitone a frame, which
  the ±70-cent guard rightly splits into 1-frame legato notes. The notes
  text drops the 16 ms grace notes and starts the held target where it
  landed (up to 50 ms late → the triplet slot); MIDI keeps them as 40-tick
  ghosts. The musical onset is the first grace note. A slide-aware merge
  (grace notes shorter than a 32nd fold into the target, which takes their
  onset) is queued in open-items.
- Multi-MUL voices report the lowest carrier; the fifth above it (Oil
  Ocean's bass) is in `mulHi`, not in the roll.
- Vibrato deeper than ±70 cents still splits; none of the 50 files showed
  it, but SMPS modulation can be set that deep.
- DT1 detune is ignored (cents, not semitones).
- One DAC drum number for every sample; Sonic 1 has kick / snare /
  timpani at 3–4 distinct seek offsets per song, so binning by seek
  offset (the bank position *is* the drum identity in these files) would
  give a real kit map without naming anything. Queued.
- Tempo: no field in the format; `fitBpm` seeded at 120 found 121.66 for
  a 150 bpm tune. SMPS ticks at 60 Hz with integer frames per note, so the
  chip-native family (6 frames a 16th = 150, 8 = 112.5, 9 = 100, 12 = 75)
  is the right seed set for Genesis; the import should try them all and
  offer the one with the fewest off-grid onsets, Josh confirming.

### What File → Import in index.html needs to handle

- Sniff `"Vgm "` **and** gzip `1F 8B` (the packs here were plain, vgmrips
  packs are `.vgz`); inflate with `inflateVGM`.
- A multi-file drop / zip: one row per file, ordered by
  `trackFromFileName(name).n`, titled by GD3 `track` (fall back to the
  file title), album from GD3 `game`, credit from `author`; key rows by
  album + number, not title.
- Loop: `vgm.loopSample` (0 is a valid value; `null` means jingle).
- The DAC row is rhythm only; say so in the row (one drum number).
- Tempo seed: offer the chip-native family before 120.
- A 1.5 M-command file (Staff Roll) parses in well under a second in
  Node; still `await microYield()` between files so the tab paints.

## 5. Repo housekeeping when this ships (the CLAUDE.md checklist)

- Help sheet entry (Import accepts .vgm/.vgz) + `node tools/build_help.mjs`.
- Drift keyword in `tests/night-roll.test.mjs` FEATURES.
- NIGHT-ROLL.md: a VGM paragraph next to the NSF one; note the DAC/kit
  limitation and the fixed loop point.
- WEB-SESSION.md: `tools/vgm/dump.mjs` beside `tools/nsf/dump.mjs`.
- .gitignore: `*.vgm`, `*.vgz`.
- glossary.md: FM synthesis terms if they come up in Josh's sessions
  (operator, carrier/modulator, algorithm, feedback) — encountered, not
  demonstrated, until he uses them.
- `npm test` already runs `tests/vgm.test.mjs` (synthetic file, no
  copyrighted data).
