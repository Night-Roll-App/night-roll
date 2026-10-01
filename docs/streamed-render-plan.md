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
2. DONE (2026-09-30). tools/chip-worker.mjs grows a SECOND message protocol
   beside the whole-render one (that path is untouched): `{stream:{id, kind,
   files, shared, own, v, bytes, libs, secs, rate, chunkFrames, overlap}}`
   parses/runs exactly like the whole path, then calls the kind's own
   `R.stream` hook — only `RUNNERS.psf`/`RUNNERS.psf2` have one (both just
   call `M.createSpuStream`, step 1c) — and replies `{ready:{id, tracks,
   seconds, sampleRate, frames, leadSec}}`, or `{stream:{id, error:"no
   stream for <kind>"}}` for every other kind (and for a parse/run failure),
   so the page falls back to whole-render. `{want:{id, gen, from, to}}`
   answers chunk indices `[from, to]` one at a time: chunk k is raw frames
   `[kC, (k+1)C+O)`; a sequential idx reuses the kept O-frame tail from the
   previous chunk (prepended to just the new C frames rendered by
   continuing the stream) instead of re-rendering the overlap, any other
   idx reseeks and renders the whole window fresh. Chunk k's LAST O frames
   get a linear fade-out (`1 - q/O`), chunk k+1's FIRST O frames (the same
   absolute raw samples) the complementary fade-in (`q/O`) — the two sum to
   exactly 1 for every q, so overlap-adding adjacent chunks reproduces the
   untouched continuous render. Replies `{chunk:{id, gen, idx, frames,
   tracks:{name: Float32Array | {l,r}}}}` (transferables; a track silent in
   that whole window is omitted). Between chunks the handler yields to the
   event loop (`await` a `setTimeout(0)`) and re-checks `gen`, so
   `{seek:{id, gen, idx}}` (which bumps the session's gen and drops the kept
   tail) cancels an in-flight `want` for an older gen without starving a
   `previewOne` tap queued in between. `{idle:{id}}` is the (simple, not a
   todo) sweep: replies `{silent:{id, names}}`, the tracks that have not
   produced one audible sample in any chunk rendered so far — the
   per-chunk silence check already tracks this for free; per-chunk
   `snapshot()`s are kept (`checkpoints`) but not yet read back by anything
   (a restore-from-nearest-checkpoint optimization is a real todo, not
   needed for correctness). Everything is exported
   (`createStreamState`/`handleStream`/`handleWant`/`handleSeek`/
   `handleIdle`, plus the existing `RUNNERS`) so tests drive the protocol
   directly — no real Worker, and a fake chip needs no real module loading
   either (`loadM`'s files/shared/own lists can be empty).
   Tests: tests/chip-worker.test.mjs — a fake "fakestream" chip (parse/run
   passthrough, `bytes` IS the fixture) whose signal is a pure function of
   absolute frame position (so continuity and a fresh seek+render always
   agree exactly): overlap-add of a whole want's chunks equals one
   continuous render within 1e-6; an out-of-order `want` (first-ever, and a
   backward jump after going forward) matches the sequential result
   bit-exact; a track wired permanently silent is omitted from every chunk;
   a `seek` mid-`want` (new gen) cancels the rest of that `want` (exactly
   the one chunk already in flight posts, confirmed by index and gen); a
   `preview`-shaped async op racing a long `want` resolves before the
   want's last chunk, not stuck behind it; a kind with no `stream` hook (or
   an unknown kind) replies the fallback error. Plus one test with the REAL
   `createSpuStream` on tests/psx-stream.test.mjs's AKAO/table fixture
   (exported from there for reuse) run through the full protocol
   (`handleStream` + `handleWant` over every chunk) — overlap-add of the
   replies equals `renderSpu`'s own whole-song output within 1e-6.

**Out-of-band fix (2026-09-30, before step 3 landed — Josh's iPad crashed on
FFX "Aeon Battle", PS2, then every console song failed to import until a
full restart; open-items.md "2026-09-30 21:40").** Two bugs, not numbered
steps here, fixed without touching the work above: (a) the memory budget
only checked KEPT bytes, but a non-streaming kind's mono step really peaks
at ~3x kept (step 0's own finding) — a stream-capable kind (psf/psf2, the
ones that crashed) now renders straight into the kept buffers chunk by
chunk (`renderStreamed`/`chipRenderStreamed`, peak ≈ kept + one chunk), and
`planChipRender` grew a `canStream` flag so a kind WITHOUT that yet gets the
honest (3x-aware) admission check instead of trusting kept bytes alone;
(b) `loadM`/`chipModules` each retry a failed module import once, inline,
with a fresh buster, before giving up — a transient post-crash failure no
longer needs a restart to clear. Full write-up: NIGHT-ROLL.md "Aeon Battle
crash + recovery".

3. DONE (2026-09-30). Settings → Other → Chip stream: off/auto/on
   (`ff1roll-chipstream`) + `?chipstream=` override (`PERF_FLAGS`); "auto" ==
   "off" until step 5. `chipRenderAuto` (chip.renderPromise's entry point)
   tries `chipStreamOpen()` first when on, falling back to the existing
   `chipRender()` on ANY failure — today's only path for every kind but
   psf/psf2 (the worker alone knows which kinds have a stream hook; the page
   never hardcodes it). `chipStreamOpen` opens/reuses `chipWorker`, posts
   `{stream}`, resolves once `{ready}` AND the first window (the chunks
   covering the play-from position + 1) are cached. `chipSegments(fromSec,
   loopSeg, playRate, lead, albumEndAbs, playT0)` is the pure tape-time
   mapping (generalizing chipStart's own "tape time = lead + songSec ×
   playRate" from one big loopable buffer to a run of small per-chunk ones):
   segment 0 plays the current pass's remainder, every segment after
   repeats the whole loop body (a hard splice at the wrap, no crossfade —
   same as `src.loop` today), album end truncates. `chip.stream = {key, gen,
   rate, chunkFrames, overlap, tracks, …, silent:Set, cache:Map(idx->
   {buffers,bytes,pinned}), pinnedIdx:Set, scheduled:Set, waiters:Map,
   bytes, peakBytes, live, srcs}`; `chipActive`/`chipHas` read it alongside
   chip.pcm/chip.buffers; the synth guard in `scheduleNote` reads
   `chip.stream.live` instead of `chip.srcs.length` in stream mode. The
   existing ~60ms pump calls `chipStreamPump(audio.currentTime)` first every
   tick: requests chunks up to a horizon (~7s visible/~12s hidden), schedules
   `AudioBufferSourceNode`s for any cached chunk inside the tick's window
   (`src -> [chip.pan panner] -> trackGain(ti)`, chipStart's own wiring),
   evicts played chunks (one chunk of slack), and keeps
   `[loopSeg.start, loopSeg.start+2s]` pinned so a wrap never waits.
   `chipStreamStart(fromSec)` replaces `chipStart` in stream mode — no new
   render, the cache is kept, just stops old sources, bumps `gen` (cancels
   in-flight `{want}`/`{idle}`, posts `{seek}`), and pumps once synchronously.
   `chipStopSrcs` (stop()'s existing call site) now also stops
   `chip.stream.srcs`/clears `.live`, keeping the cache.
   Tests: tests/night-roll.test.mjs — chipSegments' own boundary math
   (chunk-boundary crossing, loop wrap + back-to-back next pass, album-end
   truncation, count-in's playT0 shift, 50% speed, lead offset, degenerate
   inputs); chipStreamIdxForTapeSec (a seek to 90s is chunk 45); the synth
   guard reading chip.stream.live + a silent-track report re-enabling synth
   for that track; a full protocol exercise with a synchronous FAKE worker
   (switch off posts no {stream} message; a {stream:{error}} falls back to
   the whole render; a successful open's sources connect through
   trackGain(ti); the cache stays bounded, <30 chunks, over a simulated
   200s play; a seek to 90s posts its {seek}/first {want} at chunk 45).
   tests/harness.mjs's (and tests/e2e/helpers.mjs's, kept in step) fake
   AudioContext gained a `playbackRate` param on its buffer-source node —
   chipStart itself had never been exercised end-to-end through the harness
   before (existing chip tests stub chip.buffers/chip.srcs directly instead).
   Not covered yet (flagged for Josh before flipping the switch for real):
   overlap-add surviving REAL scheduling jitter (step 2's own tests only
   cover the chunk shape in isolation) and the {idle} sweep's re-check
   cadence (today: once, right after the first window — a track gone silent
   only much later in a long song isn't caught until a later step adds a
   periodic recheck). Josh still owes an A/B listen by link: FF1 triangle
   (ticks), FF7 pad, Frog's Theme loop, mute/solo mid-play, ruler seek,
   locked-screen album play, Challenge at full quality — none of that has
   happened yet, this step is page-logic + vm tests only.
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
