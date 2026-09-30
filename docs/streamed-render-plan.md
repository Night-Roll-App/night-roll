# Streamed console render — plan (advisor, 2026-09-30)

Why: FFX "Challenge" (PS2) rendered whole-song, all-tracks, stereo, 48 kHz =
1.88 GB and got the iPad web view killed. The stopgap `planChipRender` drops
to mono/24 kHz — but it counts bytes KEPT, not the worker's PEAK: renderSpu /
renderN64 always allocate stereo per group, then the worker allocates mono
copies while the stereo pair is still held → Challenge's worker peak ≈ 1.4 GB
even on the stopgap plan. `chipEstimateTracks` also undercounts (a channel can
emit a melodic AND a kit group). Hypothesis until step 0 measures it.

## Findings per chip
The emulator/parse step (RUNNERS[kind].run) already produces a compact event
list up front; only the sample renderers cost gigabytes, and all can stream.
- NES / GB (apu-render): incremental; the RC / DC filters are whole-buffer
  post-passes → carry their IIR state across chunks. Seek = replay (fast) or a
  ~30-scalar snapshot.
- SNES (spc/apu-render): already chunked (CHUNK 4096); snapshot ~2 KB.
- PS1 / PS2 (psx/spu-render renderSpu — Challenge's path, no reverb, no
  voice stealing): restructure note-by-note into voice-per-chunk; keep the
  active list in note order so float sums stay bit-identical. Seek = fast-
  forward held notes' envelopes (ms).
- N64 EAD / OoT / Rare: same voice restructure; reverb rings stream by carrying
  state; seek pre-rolls the wet path (≤5 s) or checkpoints every ~10 s.

## Architecture
- Playback: scheduled AudioBufferSourceNodes from the existing 60 ms pump —
  same nodes/connections as the known-good chipStart (src → [pan] →
  trackGain). NOT AudioWorklet (async addModule inside the ▶ tap = the
  2026-09-27 mute pattern; SharedArrayBuffer needs COOP/COEP Pages can't set).
- Gapless: worker cuts overlapping windows (O = 256 frames) with baked
  complementary fades; overlap content is identical so the sum is continuous.
- Tape model: pure `chipSegments(fromSec, loopSeg, playRate, lead,
  albumEndAbs, playT0)`; loop-start chunks pinned so a wrap never waits.
- Mixer: per-track chunks ("stems in a window") so M/S/vol/pan stay instant
  and the Mixer meters keep working. Challenge ≈ 138 MB visible (1 playing +
  3 ahead + 2 pinned, 2 s chunks), ≈ 184 MB hidden (12 s ahead). Target
  < 300 MB at full 48 kHz stereo.
- Worker protocol: {stream} → {ready}; {want:{gen,from,to}} → {chunk}
  (transferred, silent tracks omitted); {seek}; an idle state-only sweep
  posts {silent:[names]} + checkpoints; {mix} for export. Previews answered
  between chunks.
- Switch: `ff1roll-chipstream` off/auto/on (device pref) + `?chipstream=`
  URL param for A/B. The whole-song path is NOT edited; any stream failure
  falls back to it for that song.

## Build steps (each one commit, shippable, ear-checkable)
0. Measure only: worker allocation tally (peak + kept) → logDebug "held X MB
   (worker peak Y MB)"; tools/chip-bench.mjs for a node peak. Gives "before".
1. Stream API per renderer (1a NES+GB, 1b SNES, 1c SPU, 1d N64 EAD+OoT,
   1e Rare): create…Stream → {render(frames), snapshot, restore}; the old
   whole renders become "stream over [0,N)". Tests: random chunk sizes
   concatenated == frozen old renderer, bit-exact. Josh: one song per console
   sounds identical.
2. Worker stream protocol + sweep (fake-runner tests).
3. Page scheduler behind the switch, default off. vm tests of chipSegments
   (boundaries, loop wrap + pin, album end, count-in, 50% speed, seek order,
   bounded cache, trackGain wiring). Josh A/B by link: FF1 triangle (ticks),
   FF7 pad, Frog's Theme loop, mute/solo mid-play, ruler seek, locked-screen
   album play, Challenge at full quality.
4. Offline export in stream mode (worker {mix}; StereoPanner formulas).
5. Default "auto": stream only where whole mode would downgrade/refuse.
6. (optional) bus mode while hidden / over budget.

## Risks
Boundary ticks (overlap covers; FF1 triangle is the ear test) · background /
lock screen stalls (12 s ahead hidden; step 6) · worker slower than realtime
on iPad (log the factor; < 1.5× → whole mode) · seek latency (short prime
chunk) · main-thread ingest cost (measure; 1 s chunks if needed).

## Measure before → after
Worker peak + held MB for Challenge (PS2), GoldenEye (N64), FF7 Cry of the
Planet (PS1), Frog's Theme (SNES); time to ▶-ready; realtime factor; ingest
ms/chunk; underruns per play; export peak.
