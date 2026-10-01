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
0. DONE (2026-09-30). Worker allocation tally (peak + kept) → logDebug "<title>:
   console audio held X MB (render peak Y MB, N tracks, R kHz,
   mono|stereo|mixed)" from `chipPublish` (both render paths: `tallyChipRender`,
   tools/chip-worker.mjs, and the inline fallback in index.html's `chipRender`,
   which mirrors it). `tools/chip-bench.mjs <kind> <file> [lib...] [--seconds
   N]` runs the SAME RUNNERS pipeline in plain Node and prints parse/render
   seconds, a sampled process.memoryUsage().arrayBuffers peak, and the tally.
   `chipEstimateTracks`/`chipEstimateTracksW` now count groups the way each
   chip's own `channelGroups` will (a channel can yield a melodic AND a kit
   group — the old distinct-channel count undercounted that); `chipPublish`'s
   debug line notes "(estimated N0)" if the two ever disagree.
   Sanity run (synthetic fixtures, tools/nsf/make-test-nsf.mjs and gbs/spc
   kin — NOT the real archive): a tiny 3 s render, peak/kept 2.0x (NES) /
   1.3x (GBS) / 8.0x (SPC, 6 of 8 voices silent in the test tune) — all
   plan.mono=false (too small to trip the budget), so these only exercise the
   "nothing downmixed, peak==render bytes" side; tests/chip-worker.test.mjs's
   fake-stereo-runner cases exercise the downmix side directly and confirm
   the plan's own hypothesis: stereo→mono, every group downmixed, peak ≈ 3×
   kept (stereo original 2× + the mono copy 1×, both held at once — not a
   measurement, a consequence of R.render returning all groups in one
   non-streamed call). Found in passing: tools/nsf/apu-render.mjs and
   tools/nsf/notes.mjs each carried a local `microYield` whose MessageChannel
   port was never ref/unref'd — harmless in a browser, but hung `node
   tools/chip-bench.mjs` forever after any render that yielded once; both now
   import the already-fixed `microYield` from tools/nsf/nsf.mjs.
1. Stream API per renderer (1a NES+GB, 1b SNES, 1c SPU, 1d N64 EAD+OoT,
   1e Rare): create…Stream → {render(frames), snapshot, restore}; the old
   whole renders become "stream over [0,N)". Tests: random chunk sizes
   concatenated == frozen old renderer, bit-exact. Josh: one song per console
   sounds identical.
   1c DONE (2026-09-30). tools/psx/spu-render.mjs's createSpuStream()
   (PS1 and PS2 — Challenge's BGM/WD→wd.mjs toBank()→vabVoices goes through
   this same function; no PS2-specific code needed). Confirmed by reading
   the renderer, not assumed: this chip carries NO cross-note state at all —
   no reverb (the file's own header comment already said so: dry), no voice
   stealing — every voice is an independent sum into its group's l/r, so a
   voice's own job (static: samples, ADSR record, pan, gain-ramp/pitch-slide
   breakpoints, i0/iOff) plus its own mutable state (Envelope, pos, ri/si
   cursors, step, vol) is everything streaming needs; nothing is shared
   between voices. renderSpu() is now exactly "stream the whole thing in one
   pass"; every caller (chip-worker's planChipRender/tally path, tools/psx
   sounding/preview helpers, the PS2 BGM/WD path) is unaffected — same
   signature, same {sampleRate, seconds, [track]: {l, r}} shape.
   seek(frame) uses the liveness bound the plan called for: per ADSR record,
   simulate Envelope.release() from the loudest possible level (0x7FFF,
   capped at the stream's own total length) once, cache it, and skip
   fast-forwarding any note whose release could not possibly still be
   sounding by `frame` — a real voice releases at or below whatever level it
   actually reached, so this is always a safe (never-too-short) bound.
   Perf: a naive per-sample function call (returning the sample or null)
   cost ~2x the old whole-buffer render on a synthetic 8-channel/60-note
   fixture — a "number | null" return kept V8 from unboxing the float math.
   Two fixes got it back in budget: (1) the shared per-sample step function
   now returns a plain boolean and writes directly into l/r when given them,
   instead of returning the sample; (2) render()'s own hot loop hoists the
   job's static fields and the voice's mutable ones into plain locals once
   per voice per CHUNK (not per sample) rather than calling that function
   per sample — matching the old code's own local-variable style. Measured
   on the synthetic fixture: whole-buffer-as-one-chunk ≈ 0.98x the old
   renderer, a realistic 2048-frame chunk ≈ 1.03x, renderSpu()'s own default
   4096-frame chunking ≈ 1.16x — under the 1.2x ceiling. (seek()'s
   fast-forward still calls the small shared function per sample since it's
   not the hot path; the bit-exact chunk/seek/restore tests are what keep
   the two copies of the arithmetic honest.) Tests: tests/psx-stream.test.mjs
   — a frozen copy of the pre-streaming renderSpu() as the oracle, over two
   synthetic fixtures (an INSTR.DAT/table rip with overlapping notes, a
   ~4096-sample linear release landing across the 4095 chunk-size boundary,
   a pitch slide, a gain ramp, two channels; and a VAB rip with two tones
   layered on every note, two channels): chunk sizes 1/4095/96000/mixed/
   random all equal the oracle bit-exact; renderSpu() itself equals the
   oracle; restore(snapshot(k)) and seek(k) each followed by render() equal
   the oracle's own tail from k, bit-exact; seeking past every voice's
   liveness bound renders pure silence (the skip path is actually exercised,
   not just its fallback). Existing tests (tests/psx-render.test.mjs,
   tests/ps2.test.mjs, tests/psx-real.test.mjs, tests/ps2-real.test.mjs)
   stayed green unmodified — renderSpu's signature and output never changed.
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
