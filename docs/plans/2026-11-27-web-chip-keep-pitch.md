# Plan: web game songs keep their pitch when slowed (2026-11-27)

Josh (ear report 2026-10-25, again 2026-11-27): the speed slider on a GAME song
(NSF/GBS/SPC/PSF… console audio) lowers the pitch. Web chip audio was
tape-style: `src.playbackRate.value = S.playRate` in `chipPartSrc` (chip.js)
and `chipStreamScheduleChunk` (chip-stream.js). Recordings (audio tracks)
already keep pitch (WSOLA in a worker, `clips.js`); native already keeps pitch
on console songs (night-roll-ipad `AVAudioUnitTimePitch`, a measured lag table
so the cursor stays on the sound).

## Approach: chunked WSOLA ahead of the playhead, both paths

One stretcher, the existing WSOLA (`clips.js`), extended with a serialized
chunk form `wsolaChunk(input, rate, p)`: it renders the stretched output for an
ABSOLUTE output window `[m0, m1 + e)` from a raw window (absolute frame `base`)
and carries the grain chain (`prevIn`) across chunks, so adjacent chunks are
sample-coherent — chunk k's fade-out tail and chunk k+1's fade-in head are the
same grains × complementary ramps, and sum back to the stretched signal exactly
(the same shape tools/chip-worker.mjs gives its stream chunks: C frames + an
O-frame overlap, fades baked in). Stereo renders (SNES, PS1) stretch both
channels with ONE grain choice (correlation summed over both) so the image
holds.

New module `src/audio/chip-pitch.js` (layer 3, audio):
- `chipKeepPitch()` = `S.playRate !== 1 && keepPitch()` — the recording sheet's
  existing device toggle (`ff1roll-tapestyle`) now governs console audio too.
  Native has no console escape hatch (it ignores the pref there); the web keeps
  one because WSOLA on a pulse wave may grain where the AU does not, and Josh
  can A/B without a build. Settings › Other gains the same checkbox (a chip
  song has no recording sheet to reach it from); Ask `set_pref keep_pitch`.
- `kpM(k, rate, C)` = `round(k·C / rate)`: the absolute stretched frame where
  chunk k starts. Chunk k's stretched buffer = frames `[M(k), M(k+1) + E)`,
  fade-in over the first E (k > 0), fade-out over the last E, E = 256.
- `chipKpPlace(seg, idx, rate, sr)` → `{anchor, offset, dur}` in CONTEXT /
  stretched seconds: `anchor = seg.when + (M(k)/sr − seg.tapeFrom/rate)`,
  `offset = max(0, seg.tapeFrom/rate − M(k)/sr)`, `dur = seg.tapeTo/rate −
  max(seg.tapeFrom/rate, M(k)/sr)`. Tape seconds ÷ rate = stretched seconds —
  the identity scheduleClip already uses (`startAt / S.playRate`, rate 1).
- Whole-render path: `chipKpStart(fromSec)` opens `chip.kp = {key, rate,
  cache: Map(idx → {status, buffers, next, bytes}), srcs, scheduled}` and
  `chipKpPump(nowCtx)` (called first in play()'s pump, like chipStreamPump)
  walks `chipSegments(...)` exactly as the stream pump does, slices each
  needed chunk's raw window out of `chip.buffers`, stretches it in the stretch
  worker (chain order: chunk k posts only once k−1's `next` is known or k−1 is
  not wanted), schedules ready chunks with `playbackRate = 1`, evicts chunks
  behind the playhead except the loop-start pins. Loops, seams and album end
  all come from chipSegments, so they behave as stream mode already does.
- Stream path: `chipStreamScheduleChunk` at keep-pitch asks `chipKpStreamChunk
  (idx)` for the stretched buffers of a cached raw chunk (the raw window is
  rebuilt from chunks k−1, k, k+1 — summing their complementary fades gives the
  untouched raw); not ready → nothing is recorded for that anchor and the next
  tick retries. Placement comes from `chipKpPlace`.
- At rate 1 (or tape-style on) nothing new runs: `chip.kp` stays null,
  chipStart/chipSeamPump/chipStreamScheduleChunk take their existing branches
  byte-for-byte.

## Latency compensation

None needed: the stretch is done AHEAD of the playhead (chunks are rendered
up to the pump's 7 s / 12 s horizon), and the stretched buffers are placed by
absolute stretched frame, so a sample of the stretched chunk at index m sounds
at `playT0 + (m·rate/sr − lead)/rate` song seconds — the cursor's own clock.
Native needed a lag table because its unit is a real-time effect in the
signal path; here the effect is off-line per chunk. A chunk that is late (the
worker still busy when the playhead enters it) joins from the current position
(the same `when = max(seg.when, anchor)` / offset chase the stream pump has).

## Memory

Only chunks near the playhead exist in stretched form: ≤ (horizon/2 + 2) + pins
chunks × tracks × C/rate frames — at 50 % on a 14-track 48 kHz stereo N64 song
~ 9 chunks × 14 × 2 × 4 s × 48000 × 4 B ≈ 190 MB worst case… too much for the
iPad. So the kp cache is capped at CHIP_KP_CACHE_CHUNKS = 6 beyond the pins and
the raw window slices are transient (the worker gets a copy, the result is the
only thing kept). Typical (NES mono 44.1 kHz, 5 tracks, 50 %): 6 × 5 × 4 s ×
44100 × 4 B ≈ 21 MB. The stream path's raw cache is unchanged; its stretched
copies live on the same entries and die with them.

## Risks

- WSOLA grain on sustained pulse/triangle waves: quality below 50 % is grainier
  than the AU (same as for takes: "fine to ~40 %"). The toggle is the escape.
- Chunk joins: coherent by construction (shared chain + complementary fades);
  a fresh chain start (first chunk after a seek) that later gets a predecessor
  (seek backwards) is re-stretched so the boundary stays coherent.
- Loop wraps and seam joins are hard splices today and stay so.
- Hidden tab: the stretch worker keeps running; the pump's 12 s horizon covers
  the timer throttle as before.
- Bounce (Download audio) at keep-pitch: scheduled synchronously, inline
  stretch (no pump exists offline).
- Not verifiable here by ear: the join every 2 s (should be inaudible), pitch
  identity vs 100 %, and cursor alignment at 50 / 75 / 125 %.
