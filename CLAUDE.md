# CLAUDE.md — working rules for this repo

Read `open-items.md` at session start (restart context, queues, open
questions). `NIGHT-ROLL.md` is the app's technical reference — read it
before touching the player.

## Shipping checklist — EVERY user-facing feature, no exceptions

1. **Code** + tests green: `npm test` (vm suite) locally. The FULL
   Playwright suite runs ONLY in GitHub Actions (push + nightly) —
   NEVER locally (Josh, 2026-08-23: headless browsers pinned his CPU
   and blocked his writing; this is a hard rule). After pushing, check
   the run with `gh run list/watch` instead. `test:e2e:smoke` (~5s)
   is allowed locally only when Josh isn't actively using the machine.
2. **Help sheet** entry in help/help.html (the sheet's body — one
   `.hsec` per tab; the tab buttons stay in index.html's #helpsheet);
   right tab section, touch gesture first, keyboard equivalent after.
3. **docs/HELP.md**: `node tools/build_help.mjs` — NEVER hand-edit it.
4. **Drift keyword** in tests/night-roll.test.mjs FEATURES list (must
   appear in the help-sheet region; the suite fails otherwise).
5. **Doc sweep — ask of every change:**
   - `NIGHT-ROLL.md` — new subsystem, convention, or tool? Document it.
   - `WEB-SESSION.md` — does it change what an analysis session should
     read or run? (The query tools were missed here once. Don't repeat.)
   - `README.md` — does it change what the project IS?
   - `docs/learning/glossary.md` — did a new music-theory term come up? Add it
     (encountered vs demonstrated — promote only with evidence).
   - `open-items.md` — new queued work, closed items, design decisions.
6. Browser-verify via claude-in-chrome, commit, push with hash check
   (`git rev-parse HEAD origin/main` must match). Pushes auto-deploy
   Pages; do NOT manually kick builds (collisions email Josh failures) —
   only kick if a build visibly hangs.

## Hard rules

- **The ✦ Ask (bridge/iPad) session never implements** (Josh, 2026-09-27,
  "that should be a rule, forever"): no code edits, commits, or pushes
  from a session started by tools/claude-bridge.mjs. It answers,
  diagnoses, relays to the terminal session (ListAgents → SendMessage),
  queues work in open-items.md, and edits songs only through the Ask
  tools when he asks. ALL implementation — and any design advisor for
  it — runs in the main terminal Claude Code session, which pushes and
  builds for the iPad. No terminal running? Queue it; don't do it.

- **Josh's songs are his.** Never edit files under
  albums/compositions/ (or any .mid/.rollnotes) without his explicit
  per-instance approval. Test against scratch compositions or FF1
  songs, never his music.
- **Keys/analyses are Josh's discoveries — Learning mode is the law.**
  In Learning mode (his devices' default) and in every Claude session
  with him: never pre-fill answers, name chords for him, or seed
  analysis; never tell him a key or a meter — not even an imported
  file's own (he reads the meter from the music; tempo may apply).
  Tools report facts; findings are his. Corollary (2026-08-19): even
  fact reports are ON-DEMAND — no Learning-mode feature volunteers
  verdicts about his annotations or music. Normal mode (other users, one
  device-local switch) may show keys, meters and chord names, labelled
  as estimates, never written as annotations without a tap, and nothing
  from Normal mode may leak into Learning mode's UI, AI context, or repo
  files. Claude sessions follow Learning rules with Josh regardless of
  which mode his app is in.
- **Annotations + the .mid are the only real state.** No feature state
  in localStorage that belongs to the song (lane pins, voices, volumes
  → track:/lane: annotations). Device-local prefs (UI toggles) may use
  localStorage.
- **No native dialogs** (alert/confirm/prompt): they hard-block the
  main thread and all automation. Use appConfirm()/in-app sheets.
- **Ear reports are measurements.** When Josh says something sounds
  wrong, it is a failing test; verified layers only narrow the search.
- **Plain git/grep for verification.** The rtk wrapper mangles
  `git show`, curl pipes, and some greps — use /usr/bin/git and
  /usr/bin/grep when the answer matters.
- **Handoffs: `mv` into `handoffs/` FIRST, then apply.** Move, never
  copy (Josh, 2026-08-25) — the move is what makes a duplicate
  detectable: hand the same file over twice and the second time the
  source path is gone and `handoffs/` already holds it. Refuse to
  overwrite an existing file of that name; say so instead.
- **No build step; ES modules, not one file** (Josh, 2026-10-02). index.html is
  markup only, its CSS is css/app.css (no inline `<style>`); the app is plain
  browser ES modules under src/ (entry src/main.js), served as-is — no
  bundler, transpiler or TypeScript. Map:
  NIGHT-ROLL.md "Module map"; rules: docs/split-plan.md §2. All mutable app
  state is on `S` (src/state.js) — no top-level `let` elsewhere; no top-level
  side effects (wiring goes in init*() called by main.js in order); top-level
  names stay unique across src/; buttons change only via setControl().
  A new module goes in index.html's modulepreload list and sw.js APP_MODULES
  (tests enforce); `node tools/split/check.mjs` must pass. Match the comment
  style — comments explain constraints, not narration.
- **No one-time hacks in capture engines** (Josh, 2026-09-27). A game's
  identity may only select WHERE to look (a manifest entry: engine
  dialect, where a rip keeps its song number) and only after generic
  detection has tried. How the music sounds — channels, volumes,
  reverb, envelopes, tempo — comes from the file or the save state,
  never from a per-game table. If a per-game table is the only way,
  it is a warning in the capture and an item in open-items, not a fix.
  Why: the goal is every game on an engine, not the one we listened
  to — a fix that needs to know the game means the next game with the
  same engine is still broken.

## Where things are

- Tests: tests/night-roll.test.mjs + tests/nsf.test.mjs (vm harness in
  tests/harness.mjs loads src/ as real ES modules (vm.SourceTextModule,
  --experimental-vm-modules); run("expr") sees S and every module's
  top-level names); tests/e2e/ (Playwright).
- Query tools: tools/*.mjs (at, span, pitch-census, song-diff,
  annotations, loop-targets) — harness-backed, facts only.
- Pipeline: tools/nsf/ (6502+APU capture), tools/dump_notes.mjs
  (.notes.txt for web sessions — commits also write it in-app).
- Docs: docs/README.md is the index — docs/HELP.md (generated manual),
  docs/design/ (shipped-feature design records), docs/learning/ (quizzes,
  glossary, session log), docs/plans/. tools/README.md: one line per script.
- Parked branch: `midi-input` (Web MIDI → record; awaiting Josh's test).
