# Night Roll

A single-file web app for studying game soundtracks: piano roll + engraved
score over one shared timeline, NES-voiced playback, and a beat-anchored
annotation system for writing analysis directly onto the music.

**Live:** https://joshcough.github.io/night-roll/ — no build step; `git push`
is deployment. Built for iPad-in-bed ergonomics, works anywhere.

## What it does

- **Two views, one timeline** — canvas piano roll and VexFlow-engraved score,
  sharing the bar ruler, sections, cursor, playhead, and pinch gestures.
- **Playback** — WebAudio NES voices (pulse/pulse/triangle + drum kit),
  per-track mute/solo, loop directives with mid-song jump points, 25–200%
  speed, smooth notehead-to-notehead score playhead.
- **Annotations (`.rollnotes`)** — plain-text sidecar per song: beat-anchored
  notes, section bands, key changes, loop points. Edited in-app (with
  dictation), synced to this repo via the GitHub Contents API.
- **✦ Ask (AI tutor)** — a chat sheet that sees the song, your cursor, your
  annotations, and the bars in view, talking to any OpenAI-compatible model
  server you point it at. House rules: hints before answers, never names a
  key you haven't set. On request it acts: "put an F#m chord annotation on
  21.1" writes exactly that; "compare this to ambush" reads that song. On
  your own songs, **✦ Fill** asks it to write notes into a range —
  validated, applied as one undo step exactly like the Bassist. Design in
  `local-llm-design.md`.
- **The AI bridge** (`npm run bridge`, `tools/claude-bridge.mjs`, no
  dependencies) — one small server in front of whatever models you have:
  LM Studio and Ollama are found automatically when running, any other
  OpenAI server with `--upstream name=url`, and **Claude Code** if the
  `claude` CLI is installed (read-only by default; `--claude full` lets it
  edit, test and push under the repo's rules). Point Settings at the
  bridge, tap Test, pick a model from what it lists. Every turn is a job
  that survives your phone or iPad suspending the tab: leave, come back,
  the answer is there. `--token` protects it; put TLS in front (Tailscale
  Serve, Caddy) to reach it from a device that opens Night Roll over https.
- **Composing** — it grew into a small DAW (2026-08): pencil/drag note entry
  on a 16th/triplet grid, multi-note selection editing (move, resize, split,
  join, velocity), chord & progression insertion, a drum kit with its own
  lane and pattern fill, per-track volume/voice/rename, record from the
  on-screen piano, and one-button Save & Commit of .mid + annotations +
  a text dump web sessions can read.
- **Audio tracks** — a guitar take, a vocal, a phone memo as a track next
  to the chip voices: waveform in the Tracks view, plays and loops with
  the song, nudge-to-align, saved beside the .mid (branch `audio-tracks`).
- **Save to a folder, no GitHub** — Settings → Choose folder… (Chrome/Edge
  on a computer): every Save writes into a folder laid out like this repo,
  the song picker lists what's there, and no account or token is needed.
- **Query tools** — `tools/*.mjs` answer factual questions (what sounds at
  bar 2.4, pitch-class census, song diffs, annotation anomalies) through
  the app's own parser. Facts only; findings stay the analyst's.
- **Analysis-first design** — the app never reveals keys or chords on its
  own; signatures and spellings render only what the analyst has recorded.
  Discovery is the point.
- **Chip-true data** — the NSF pipeline in `tools/nsf/` (a 6502 emulator +
  APU register logger + note reconstruction) extracts songs from the actual
  cartridge sound data: real channels, real tempos, frame-exact loops.

## The music

- **[albums/final-fantasy-i/](albums/final-fantasy-i/)** — the FF1 (NES)
  soundtrack, extracted from the NSF, with the analysis work: song docs,
  chord charts, the key sweep, and the verified loop-cut table
  ([CUTS.md](albums/final-fantasy-i/CUTS.md)).
- **[albums/compositions/](albums/compositions/)** — original pieces written
  during the study.

## The learning workflow

Analysis happens in dialogue, not in bulk — see each album's README. Working
docs at the root: [open-items.md](open-items.md) (questions and owed
exercises), [quizzes.md](quizzes.md) (spaced-recall bank),
[supplemental-learning.md](supplemental-learning.md) (session log).

## Development

`make serve` → http://localhost:8000 · `make test` → Node's built-in runner
over `tests/` (the harness runs the app's inline script in a vm, so the app
stays one file). Technical reference: [NIGHT-ROLL.md](NIGHT-ROLL.md).
