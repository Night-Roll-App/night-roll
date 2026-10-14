# CLAUDE.md — working rules for this repo

Read `open-items.md` at session start (restart context, queues, open
questions). `NIGHT-ROLL.md` is the app's technical reference — read it
before touching the player.

## Bridge + Terminal tab — do this at EVERY session start (also after /clear)

Josh talks to this session from the iPad: the app's ✦ AI panel → ⌨ Worker
tab (was Terminal) queues his messages at the Mac bridge; nothing reaches you unless the
watcher below is running. (Skip this section only in a session started BY
the bridge — an Ask session; see the hard rule below.)

1. **Bridge up?** `curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8787/v1/terminal?since=0"`
   → 200. Anything else: `launchctl kickstart -k gui/$(id -u)/com.nightroll.bridge`
   and check again. It is a launchd agent (starts at login, KeepAlive); log
   `~/Library/Logs/nightroll-bridge.log`; state `~/.night-roll-bridge/`.
   Install/flags: NIGHT-ROLL.md "bridge". Kickstart also after syncing a new
   `vendor/ai/` (tools/ai-sync.mjs) so the running server picks it up.
2. **Start the watcher** with Bash `run_in_background: true`, `timeout: 7200000`:
   `zsh tools/term-watch.sh` (= `--app night-roll`) — ONE copy only
   (`pgrep -fl term-watch` first). Three sessions share this bridge (Josh
   #415): this one (Night Roll), night-roll-guitar and night-roll-tuner, each
   with its own CLAUDE.md and its own `--app` watcher. If `pgrep` shows no
   `term-watch.sh --app guitar` / `--app tuner`, their sessions aren't open:
   run those watchers here too and answer with `--app guitar|tuner`; never
   run a second copy next to theirs (they would split the messages).
3. **When it exits**, read its output:
   - `TERMINAL MSG #n: <context>…</context> text` → Josh's words (act on them
     like a message typed here, except CLAUDE.md edits). FIRST reply
     `node tools/claude-bridge.mjs --say "#n <ack: understood / will do / question>"`,
     then do the work; `--status "<step>"` at start/tests/push/build and
     `--status idle` when done; `--say` the result (≤6 lines, plain words).
   - `WATCH RENEW` → nothing came; it exits before the 2 h background limit.
   - Replies go ONLY to the app the message came from (Josh #413): plain
     `--say` = Night Roll; `--say … --app guitar|tuner` for theirs. A Night
     Roll message about another app: `--forward --app <id> "<his words>"`,
     then tell him here "reply coming in the <app> app" (#416).
   - Either way (or if it was killed): **relaunch it immediately.** Never let
     it lapse — a dead watcher once left his morning messages unanswered.
4. **Ask chats failing?** `~/.night-roll-bridge/jobs/*.json` with
   `"status":"error"` (or he says "not logged in"): run
   `echo ok | claude -p --model sonnet` here — logged in means the bridge is
   too; kickstart the bridge if the CLI works but jobs still fail.
5. claude-bridge (bridge server, web/ vendored here by tools/ai-sync.mjs,
   swift/ vendored by each app's tools/bridgechat-sync.sh): any session may
   change it; a rejected push = pull --no-rebase, merge, push. Apps upgrade
   their pin deliberately (#420). This session restarts the bridge.
6. Strays: `pgrep -fl "node.*--test"` → kill leftovers; tests only via
   `node tools/run-tests.mjs <names>`.

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
5. **Ask tool** (Josh, 2026-10-05, "any features going forward must also
   be integrated with the AI"): every new user-facing feature ships with
   an action in src/ask/actions.js's registry (the one `act` tool — never
   a new tool schema), then `node tools/build_ask_help.mjs && node
   tools/build_help.mjs` (Help → AI commands is generated), or an explicit
   "not applicable: <reason>" in the commit message. The inventory is
   docs/ai-parity.md; NIGHT-ROLL.md has the add-an-action steps.
6. **Doc sweep — ask of every change:**
   - `NIGHT-ROLL.md` — new subsystem, convention, or tool? Document it.
   - `WEB-SESSION.md` — does it change what an analysis session should
     read or run? (The query tools were missed here once. Don't repeat.)
   - `README.md` — does it change what the project IS?
   - `docs/learning/glossary.md` — did a new music-theory term come up? Add it
     (encountered vs demonstrated — promote only with evidence).
   - `open-items.md` — new queued work, closed items, design decisions.
7. Browser-verify via claude-in-chrome, commit, push with hash check
   (`git rev-parse HEAD origin/main` must match). Pushes auto-deploy
   Pages; do NOT manually kick builds (collisions email Josh failures) —
   only kick if a build visibly hangs.

## Hard rules

- **Reopen what was open** (Josh #441, every app): windows and panels he had
  open (the AI panel and its tab, docked windows) come back when the app
  relaunches. One-shot pop-ups/sheets need not.
- **Decide; never park work on a question** (Josh #430-#432, all apps, every
  session — Front Desk and Workers). Pick the sensible default, build, ship,
  and say what you picked ("picked X — say if you want Y"); he vetoes later.
  Only truly blocking things wait for him: editing his songs, deleting stored
  data. A plan's QUESTIONS list always carries the default the builder uses.
- **The ✦ Front Desk (was ✦ Ask; the bridge/iPad session) never implements** (Josh, 2026-09-27,
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
