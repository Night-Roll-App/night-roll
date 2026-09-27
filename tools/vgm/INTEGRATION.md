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
burst's peak, so the *rhythm* survives into the roll; the *kit* does not —
every hit reads as one drum. Acceptable for import (Josh reads the
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

## 4. Repo housekeeping when this ships (the CLAUDE.md checklist)

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
