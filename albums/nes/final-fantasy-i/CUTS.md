# Chip capture cut points — the record

Hand-maintained source of truth for where each capture was cut and where
its loop returns. The pipeline re-derives these from frame data on every
regeneration and stamps them into each `.notes.txt` header — **compare a
fresh regen against this table; a mismatch is a flag to investigate, not
something to silently accept.** (A regen after tool changes may shift a
seam by a hair legitimately — but it should be explainable.)

"Cut at" = capture end (also the loop anchor in the song's .rollnotes when
the target isn't bar 1 beat 1). "Loops to" = where playback returns.
Verified 2026-08-02 (Josh by ear + frame-exact register data agreeing).

| Song | Cut at | Loops to | Loop length | Tempo |
| --- | --- | --- | --- | --- |
| prelude | 17.1 | 1.1 | 16 bars | 100 |
| prologue | 25.1 | 1.1 | 24 bars | 150 |
| epilogue | — through-composed, no cut (~256s of music) | — | — | 112.5 (driver family; raw timing, not grid-snapped) |
| overworld | 17.2 | 1.2 | 16 bars | 150 |
| ship | 25.3 | 1.3 | 24 bars | 150 | ✓ Josh: "100% perfect" (2026-08-02, in-app) |
| airship | 17.1 | 1.1 | 16 bars | 180 |
| town | 9.1 | 1.1 | 8 bars | 90 |
| corneliacastle | 9.1 | 1.1 | 8 bars | 100 |
| gurguvolcano | 21.1 | 1.1 | 20 bars | 150 |
| matouyascave | 21.1 | 1.1 | 20 bars | 150 |
| cave | 31.1 | 1.1 | 30 bars | 150 |
| chaostemple | 17.1 | 1.1 | 16 bars | 150 |
| floatingcastle | 14.1-ish | 1.1 | unverified (grid-fitted) | ~100 — SUSPECT: grid drifts across the song; true bar count needed |
| underwaterpalace | 17.1 | 1.1 | 16 bars | 150 |
| shop | 29.1 | 1.1 | 28 bars (3/4 — Josh's determination 2026-08-05; inherited 4/4 was a fossil error) | 200 |
| battle | 29.3.5 | 3.3.5 | 26 bars | 150 |
| menu | 9.1 | 1.1 | 8 bars | 90 |
| gameover | 9.3 | 1.3 | 8 bars | 90 |
| victory | 11.3 | 3.3 | 8 bars | 150 |

Notes:

- **ship** — bare pulse1 pickup once (A4, A#4 on beats 1–2), then on every
  loop pass the pickup returns with the body's accompaniment sustaining
  under it (hardware truth). The cut keeps the accompanied pickup.
- **battle** — bars 1–3.3 are a once-only intro; the descending run before
  the seam is the body's turnaround, played every pass.
- **gameover** — 2-beat once-only pickup, then a clean 8-bar loop.
- **victory** — 2.5-bar intro; articulation varies per pass (detector
  needs its period hint in dump-all.mjs HINTS). Tempo is 150 with an
  8-bar loop — the earlier 6-bar/112.5 reading mislabeled the same
  frame-exact seam (snap-residual audit settled it, 2026-08-02).
- **gurguvolcano** — the transcription has 21 bars but the chip loop is
  exactly 20 at 150; the 21st MIDI bar was the arranger's (same as
  gameover's extra bar).
- **epilogue** — through-composed with tempo changes/fermatas no single
  grid can follow: kept at raw hardware timing (only bar labels are
  approximate). All other songs are grid-snapped.
- Tempos are loop-calibrated (period ÷ verified bar count) except where
  marked grid-fitted.
