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
- **Installable** — Safari → Share → Add to Home Screen (or the install
  icon in Chrome/Edge): own icon, full screen, works offline with the songs
  you have opened; instrument sounds are kept as first used. Nothing to
  install on a computer, updates arrive on the next launch with a network.
- **The AI bridge** (`npm run bridge`, `tools/claude-bridge.mjs`, no
  dependencies) — one small server in front of whatever models you have:
  LM Studio and Ollama are found automatically when running, any other
  OpenAI server with `--upstream name=url`, and **Claude Code** if the
  `claude` CLI is installed (read-only by default; `--claude full` lets it
  edit, test and push under the repo's rules). Point Settings at the
  bridge, tap Test, pick a model from what it lists. Every turn is a job
  that survives your phone or iPad suspending the tab: leave, come back,
  the answer is there. With Claude Code, each song's chat is one
  long-running session that remembers earlier turns, can carry a message
  to the Claude Code sessions in your terminal, and shows the terminal's
  notes back in ✦ Ask (`node tools/claude-bridge.mjs --say "…"`). `--token` protects it; put TLS in front (Tailscale
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

<!-- night-roll:songs -->
## Songs — open in Night Roll

**Final Fantasy I**

- [Airship](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/airship)
- [Battle Scene](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/battle)
- [Cornelia Castle](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/cornelia-castle)
- [Dead Music](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/game-over)
- [Dungeon](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/cave)
- [Ending Theme](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/epilogue)
- [Floating Castle](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/floating-castle)
- [Gurgu Volcano](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/gurgu-volcano)
- [Matoya's Cave](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/matoyas-cave)
- [Menu Screen](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/menu)
- [Opening Theme](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/prologue)
- [Overworld](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/overworld)
- [Prelude](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/prelude)
- [Ship](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/ship)
- [Shop](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/shop)
- [Temple of Chaos](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/chaos-temple)
- [Town](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/town)
- [Undersea Shrine](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/underwater-palace)
- [Victory](https://joshcough.github.io/night-roll/albums/final-fantasy-i/songs/victory)

**My Compositions**

- [Baseball / Beach Song](https://joshcough.github.io/night-roll/albums/compositions/CM6-G7b9)
- [Cool B Maj With B Part](https://joshcough.github.io/night-roll/albums/compositions/cool-b-maj-with-b-part)
- [Threnody](https://joshcough.github.io/night-roll/albums/compositions/threnody)

**Night Roll Sketches**

- [Ambush](https://joshcough.github.io/night-roll/albums/compositions/nightroll/ambush)
- [Ambush 2 Saving B Part For Another Song](https://joshcough.github.io/night-roll/albums/compositions/nightroll/ambush-2-saving-b-part-for-another-song)
- [Carnival](https://joshcough.github.io/night-roll/albums/compositions/nightroll/carnival)
- [Cool Bmaj Progression](https://joshcough.github.io/night-roll/albums/compositions/nightroll/cool-bmaj-progression)
- [Fanfare](https://joshcough.github.io/night-roll/albums/compositions/nightroll/fanfare)
- [Graveyard](https://joshcough.github.io/night-roll/albums/compositions/nightroll/graveyard)
- [Graveyard 2](https://joshcough.github.io/night-roll/albums/compositions/nightroll/graveyard-2)
- [Graveyard 3](https://joshcough.github.io/night-roll/albums/compositions/nightroll/graveyard-3)
- [Key Change Test (07-26)](https://joshcough.github.io/night-roll/albums/compositions/nightroll/KeyChangeTest-07-26)
- [Majorly Dim](https://joshcough.github.io/night-roll/albums/compositions/nightroll/majorly-dim)
- [Night Black](https://joshcough.github.io/night-roll/albums/compositions/nightroll/night-black)
- [Running With The Runs](https://joshcough.github.io/night-roll/albums/compositions/nightroll/running-with-the-runs)
- [Sus](https://joshcough.github.io/night-roll/albums/compositions/nightroll/sus)
- [Threnody 2](https://joshcough.github.io/night-roll/albums/compositions/nightroll/threnody-2)

**Mega Man 2**

- [Air Man](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/air-man)
- [Boss Battle](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/boss-battle)
- [Bubble Man](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/bubble-man)
- [Crash Man](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/crash-man)
- [Credits](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/credits)
- [Dr. Wily Defeated!](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/dr-wily-defeated)
- [Dr. Wily's Castle](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/dr-wily-s-castle)
- [Dr. Wily's Castle II](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/dr-wily-s-castle-ii)
- [Dr. Wily's Map](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/dr-wily-s-map)
- [Enemy Chosen](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/enemy-chosen)
- [Epilogue](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/epilogue)
- [Flash Man](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/flash-man)
- [Get Your Weapons Ready](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/get-your-weapons-ready)
- [Heat Man](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/heat-man)
- [Introduction](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/introduction)
- [Metal Man](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/metal-man)
- [Password Screen](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/password-screen)
- [Quick Man](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/quick-man)
- [Stage Select](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/stage-select)
- [Title Screen](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/title-screen)
- [Track 20](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/track-20)
- [Track 23](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/track-23)
- [Victory](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/victory)
- [Wood Man](https://joshcough.github.io/night-roll/albums/imports/mega-man-2/wood-man)

**TMNT 2**

- [Boss A](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/boss-a)
- [Boss B](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/boss-b)
- [Boss C](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/boss-c)
- [Credits](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/credits)
- [Cutscene A](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/cutscene-a)
- [Cutscene B](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/cutscene-b)
- [Cutscene C](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/cutscene-c)
- [Cutscene D](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/cutscene-d)
- [Cutscene E](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/cutscene-e)
- [Cutscene F](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/cutscene-f)
- [Epilogue](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/epilogue)
- [Game Over](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/game-over)
- [Scene 1](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/scene-1)
- [Scene 2A](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/scene-2a)
- [Scene 2B](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/scene-2b)
- [Scene 3A](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/scene-3a)
- [Scene 3B & 5](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/scene-3b-5)
- [Scene 4A](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/scene-4a)
- [Scene 4B](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/scene-4b)
- [Scene 6](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/scene-6)
- [Scene 7](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/scene-7)
- [Scene Cleared A](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/scene-cleared-a)
- [Scene Cleared B](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/scene-cleared-b)
- [Selection](https://joshcough.github.io/night-roll/albums/imports/tmnt-2/selection)

Made in [Night Roll](https://joshcough.github.io/night-roll/). Links open the song in the player, from this repo.
<!-- /night-roll:songs -->

## License

The app (index.html, tools, tests, docs) is under the [PolyForm Noncommercial License 1.0.0](LICENSE): use it, study it, change it and share it for noncommercial purposes; selling it or publishing it on a store needs permission. The music under `albums/` is not covered: Josh's compositions are his, and the game transcriptions belong to their publishers and are here for private study.
