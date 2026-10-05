# tools/ — one line per script

Node scripts, no dependencies beyond Node itself (the vendored acorn is for
the split checker). The query tools load songs THROUGH the app's own parser
(the vm test harness) and report what IS in a file — never a chord name, a
key, or a classification: facts are the tools' job, findings are the
analyst's. Paths below are referenced from WEB-SESSION.md, NIGHT-ROLL.md,
`tools/package.mjs` and the chip worker, so scripts stay where they are.

## Query tools (facts only)

| Script | Does |
|---|---|
| `at.mjs <song> <bar.beat> [--span]` | Everything sounding at a moment or across a span, per track; onsets vs notes still ringing. |
| `span.mjs <song> <from> <to>` | All events in a range, per track, plus the span's pitch-class SET (not a chord name). |
| `pitch-census.mjs <song> [--track]` | Every pitch class present (count + sounding duration) and which are ABSENT. |
| `song-diff.mjs <old.mid> <new.mid>` | Per-track added / removed / changed notes, grouped by bar. |
| `annotations.mjs <song> [--type]` | Annotations resolved to bar.beat with spans, plus anomaly flags. |
| `loop-targets.mjs <song>\|--all` | Loop point, target, and what every track plays at the target. |
| `loop_target_bass.mjs` | Scores the "bass at the loop target is the tonic" hypothesis — only for songs whose key is already recorded (spoiler-safe). |
| `sounding.mjs` | Sounding-pitch offsets for sequence-chip captures (PS1, N64): typed note vs what the sample plays. |
| `kit-guess.mjs` | Guesses which drum index is kick / snare / hats from rhythm alone. |
| `query-lib.mjs` | The shared loader the query tools are built on. |
| `vm-flag.mjs` | Import first in any directly-run tool: re-execs Node with `--experimental-vm-modules`. |

## Repo and app maintenance

| Script | Does |
|---|---|
| `build_help.mjs` | Generates `docs/HELP.md` from `help/help.html` + the help tabs in index.html. Never edit the output. |
| `build_ask_help.mjs` | Writes Help → AI's "AI commands" rows into `help/help.html` (between the ask-commands markers) from the act registry (src/ask/actions.js); run it after adding an action, then `build_help.mjs`. A vm test fails while the rows are stale. |
| `build_manifest.mjs` | Builds `albums/manifest.json` by scanning `albums/*/` (titles from filenames + each `album.json`). |
| `dump_notes.mjs [dir ...]` | Writes `<song>.notes.txt` beside every .mid — plain-text dumps analysis sessions can read. |
| `album-order.mjs [--write]` | Orders an album's songs by the game's own track order instead of alphabetically. |
| `import-set.mjs <zip\|dir\|file> --slug` | The app's Import → Capture all → Publish, headless (the same code the app runs, in the vm harness). |
| `migrate-rollnotes-v2.mjs` | The one-time v1 → v2 batch migration of `*.rollnotes.json` (see `docs/annotations-v2.md`). |
| `spc-undrum.mjs` | One-time fix for SNES captures whose noise voice was merged into a drums track. |
| `package.mjs [--out <dir>]` | Assembles the product build (default `dist/night-roll-app/`) and refuses to ship anything that is not ours. |
| `run-tests.mjs` | `npm test`: every vm test file, one at a time, every file even after a failure. |
| `fix_keysigs.py`, `strip_tracks.py`, `trim_loops.py` | MIDI utilities: rewrite key-signature metas, delete tracks by app-visible index, trim a file to its first pass. |
| `icon-1024.swift` | Redraws the app icon at 1024 px. |

## Console audio

| Script | Does |
|---|---|
| `chip-worker.mjs` | The console render OFF the main thread: the Web Worker the app runs chip audio in (NES / Game Boy / SNES / PS1 / PS2 / N64). |
| `chip-bench.mjs <kind> <file>` | Runs that same per-chip pipeline in plain Node for one song and prints timings and peaks. |
| `note-preview.mjs` | One held note through a sequence chip's own renderer (the tap preview). |

## The AI bridge

| Script | Does |
|---|---|
| `claude-bridge.mjs` | Night Roll's shim onto the claude-bridge library in `vendor/ai/` — the server in front of local models and Claude Code, and its CLI (`--say`, `--status`, …). |
| `ai-profile.mjs` | Night Roll's profile for that library: the system prompts and names the server used to hardcode. |
| `ai-sync.mjs` | Vendors the library (`Night-Roll-App/claude-bridge`) into `vendor/ai/` as a plain copy. |
| `launchd/` | Keeps the bridge running on macOS as a launch agent (`install.sh`, README). |

## Per-console pipelines (capture engines)

Each folder is a complete offline pipeline — a CPU/driver emulator or
sequence parser, a note extractor, a `dump.mjs` CLI (`<rip> → .notes.txt +
.mid`), a test-file generator, and `RESEARCH.md` / `INTEGRATION.md` notes.
`docs/adding-a-console.md` is the checklist that produced them. A game's
identity may only choose WHERE to look; how the music sounds comes from the
file or the save state, never from a per-game table.

| Folder | Console, format |
|---|---|
| `nsf/` | NES — `.nsf` (6502 + APU register log; `LEARNING-6502.md` teaches the emulator). |
| `gbs/` | Game Boy — `.gbs` (SM83 + APU). |
| `spc/` | Super NES — `.spc` (SPC700 + DSP, BRR samples). |
| `vgm/` | Sega Genesis / Mega Drive — `.vgm` / `.vgz` (the file already is the register-write log). |
| `psx/` | PlayStation — SEQ/SEP + VAB, PSF (AKAO and the stock driver), SPU render. |
| `ps2/` | PlayStation 2 — PSF2/minipsf2 (Square BGM/WD, Sony SQ/HD/BD). |
| `n64/` | Nintendo 64 — USF (EAD and Rare drivers, VADPCM). |
| `instruments/` | The driver-neutral instrument library: extract from any rip, verify, play, export to SF2/SFZ. |

## Module-split tooling

| Folder | Does |
|---|---|
| `split/` | `check.mjs` enforces the module rules of `docs/split-plan.md` §3.6 (layers, no top-level `let`, port imports); `move.mjs` and friends did the split. |
| `vendor/` | acorn (parser) for the checker — Node-only, never shipped. |
