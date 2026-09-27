# Original vs regenerated captures — MIDI diff

**Verdict: all 19 pairs are note-for-note identical in timing, pitch, and
duration** — same tracks, same note counts, same first note on the same
beat, same length to the tick, same tempo. Every song starts and ends
exactly where its original does. Only two things changed: **velocities**
(old: every note uniform 96; new: the chip's own 3–7 dynamic levels per
song) and **shop's time-signature meta** (4/4 → 3/4, metadata only — the
app ignores MIDI meter meta by design, so this changes nothing visible).
A/B-ing should therefore sound identical in notes and differ only in
dynamics.

Old = `albums/final-fantasy-i/songs` (pre chip-volume). New = `albums/ff1-verify`
(regenerated 2026-08-05 with chip volume; shop re-barred to 3/4). Generated 2026-08-07
by parsing every .mid pair through the app's own parser.

Bar counts are in NEUTRAL 4/4 bars (quarters / 4) for comparability —
the app's own convention until a meter is declared. Menu counts differently
under its declared 6/8, shop under 3/4; the quarters column is meter-free truth.

| song | notes old→new | quarters old→new | 4/4 bars old→new | bpm old→new | first note old | first note new | timing/pitch identical? | vel distinct old→new |
|---|---|---|---|---|---|---|---|---|
| airship | 246→246 | 64.00→64.00 | 16.00→16.00 | 180→180 | F3 @q0.00 (triangle) | F3 @q0.00 (triangle) | yes | 1→5 |
| battle | 527→527 | 114.50→114.50 | 28.63→28.63 | 150→150 | D#3 @q0.00 (pulse1) | D#3 @q0.00 (pulse1) | yes | 1→5 |
| cave | 308→308 | 60.00→60.00 | 15.00→15.00 | 150→150 | C3 @q0.00 (triangle) | C3 @q0.00 (triangle) | yes | 1→3 |
| chaos-temple | 219→219 | 64.00→64.00 | 16.00→16.00 | 150→150 | E3 @q0.00 (triangle) | E3 @q0.00 (triangle) | yes | 1→6 |
| cornelia-castle | 109→109 | 32.00→32.00 | 8.00→8.00 | 100→100 | A3 @q0.00 (pulse2) | A3 @q0.00 (pulse2) | yes | 1→4 |
| epilogue | 942→942 | 506.14→506.14 | 126.53→126.53 | 112.5→112.5 | C3 @q0.00 (pulse1) | C3 @q0.00 (pulse1) | yes | 1→3 |
| floating-castle | 232→232 | 52.17→52.17 | 13.04→13.04 | 100→100 | A#2 @q0.00 (triangle) | A#2 @q0.00 (triangle) | yes | 1→3 |
| game-over | 89→89 | 34.00→34.00 | 8.50→8.50 | 90→90 | A4 @q0.00 (pulse1) | A4 @q0.00 (pulse1) | yes | 1→3 |
| gurgu-volcano | 320→320 | 80.00→80.00 | 20.00→20.00 | 150→150 | A3 @q0.00 (pulse2) | A3 @q0.00 (pulse2) | yes | 1→4 |
| matoyas-cave | 314→314 | 80.00→80.00 | 20.00→20.00 | 150→150 | B2 @q0.00 (triangle) | B2 @q0.00 (triangle) | yes | 1→5 |
| menu | 114→114 | 24.00→24.00 | 6.00→6.00 | 90→90 | A#3 @q0.00 (triangle) | A#3 @q0.00 (triangle) | yes | 1→4 |
| overworld | 221→221 | 65.00→65.00 | 16.25→16.25 | 150→150 | G3 @q0.00 (triangle) | G3 @q0.00 (triangle) | yes | 1→3 |
| prelude | 510→510 | 64.00→64.00 | 16.00→16.00 | 100→100 | A#3 @q0.00 (pulse1) | A#3 @q0.00 (pulse1) | yes | 1→3 |
| prologue | 213→213 | 96.00→96.00 | 24.00→24.00 | 150→150 | F3 @q0.00 (triangle) | F3 @q0.00 (triangle) | yes | 1→4 |
| ship | 413→413 | 98.00→98.00 | 24.50→24.50 | 150→150 | A4 @q0.00 (pulse1) | A4 @q0.00 (pulse1) | yes | 1→4 |
| shop | 174→174 | 84.00→84.00 | 21.00→21.00 | 200→200 | C3 @q0.00 (triangle) | C3 @q0.00 (triangle) | yes | 1→5 |
| town | 112→112 | 32.00→32.00 | 8.00→8.00 | 90→90 | C4 @q0.00 (triangle) | C4 @q0.00 (triangle) | yes | 1→5 |
| underwater-palace | 189→189 | 64.00→64.00 | 16.00→16.00 | 150→150 | G#3 @q0.00 (triangle) | G#3 @q0.00 (triangle) | yes | 1→7 |
| victory | 175→175 | 42.00→42.00 | 10.50→10.50 | 150→150 | D#3 @q0.00 (pulse1) | D#3 @q0.00 (pulse1) | yes | 1→4 |

## What actually differs

| song | velocities old | velocities new (min–max, distinct levels) | timesig meta old→new |
|---|---|---|---|
| airship | uniform 96 | 34–102, 5 levels | 4/4 |
| battle | uniform 96 | 34–127, 5 levels | 4/4 |
| cave | uniform 96 | 34–102, 3 levels | 2/4 |
| chaos-temple | uniform 96 | 34–102, 6 levels | 4/4 |
| cornelia-castle | uniform 96 | 34–102, 4 levels | 4/4 |
| epilogue | uniform 96 | 93–102, 3 levels | 4/4 |
| floating-castle | uniform 96 | 96–127, 3 levels | 4/4 |
| game-over | uniform 96 | 68–102, 3 levels | 4/4 |
| gurgu-volcano | uniform 96 | 93–127, 4 levels | 4/4 |
| matoyas-cave | uniform 96 | 68–127, 5 levels | 4/4 |
| menu | uniform 96 | 34–102, 4 levels | 6/8 |
| overworld | uniform 96 | 96–127, 3 levels | 4/4 |
| prelude | uniform 96 | 68–127, 3 levels | 4/4 |
| prologue | uniform 96 | 68–102, 4 levels | 4/4 |
| ship | uniform 96 | 68–102, 4 levels | 4/4 |
| shop | uniform 96 | 68–127, 5 levels | 4/4 → **3/4** |
| town | uniform 96 | 59–102, 5 levels | 4/4 |
| underwater-palace | uniform 96 | 34–127, 7 levels | 4/4 |
| victory | uniform 96 | 68–127, 4 levels | 4/4 |

## Divergent songs, in detail

None — every pair is timing/pitch identical.
