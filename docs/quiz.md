# Quiz page (`quiz/`) — what it is, how to open it, where it would plug in

Built 2026-10-04 from docs/plans/2026-10-04-quiz.md (Fable-reviewed). Josh:
"build some quiz stuff too. Just keep it isolated" and "We don't have to
integrate them just yet … tell me where it would be integrated." So: a
standalone page, nothing in the app points at it, and this file says exactly
where it would go when he says so.

## What it is

Two things on one page, in the app's dark theme, touch-first (every button
44 px or more; works at phone and iPad widths):

1. **Bank** — the questions in `quizzes.md` (after the repo tidy,
   `docs/learning/quizzes.md`; the page tries that path first and falls back
   to the root copy). One at a time, lowest Leitner box first and then
   longest-since-asked — the pick order quizzes.md itself prescribes. Three
   grades: **Got it / Shaky / Missed** (Shaky is the file's `[~]`: re-ask
   fresh; it lands in box 1). Five boxes, rest intervals 0 / 1 / 3 / 7 / 21
   days. The file's `[ ]`/`[x]`/`[~]` marks set a question's starting box and
   are **never written back**; the page never writes any repo file. **No
   answers anywhere**: the bank has none on purpose, and a question whose
   list item ends in a logged "(Answered …)" note shows that note only after
   the grade and only on a tap.
2. **Drills** — generated, generic theory, never about a song: interval by
   ear / on the staff (VexFlow) / on the keys (the app's own piano geometry),
   chord quality by ear (maj, min → dim, aug → dom7, maj7, min7), scale degree
   by ear (tonic then a note; minor from level 2), key signatures (count ↔
   key, both directions; minors at level 3), spelling in a key (degree → the
   note, enharmonic twin offered as a distractor and **not** accepted — A♭ in
   E♭ major is not G♯). A wrong tap dims and says "not that one"; the answer
   is never revealed — keep going until you hit it. Five first-try hits in a
   row open the next level (three levels; a miss drops the streak, and the
   level with it).

Progress and prefs live on the device only, under `ff1roll-quiz-srs` and
`ff1roll-quiz-prefs` (JSON; every access in try/catch — with storage blocked
the page still works and the footer says progress will not be kept). The app
cannot evict or read them: `askEvictOthers` touches `ff1roll-ask-*`,
`hasExistingNightRollPrefs` checks lastsong/cfg/ghtoken/notes-/draft-.

## How to open it

- Locally: `make serve` (or `python3 -m http.server 8000`) at the repo root,
  then **http://localhost:8000/quiz/**.
- Deployed: **https://night-roll-app.github.io/night-roll/quiz/** (Pages
  serves the directory as-is; nothing to build). Online only — it is not
  precached and the service worker steps aside for it (below).
- iPad: Safari to the Pages URL above. Not in the iPad app (tools/package.mjs
  `TOP_DIRS` never copies `quiz/`; tests/quiz.test.mjs asserts it).

Ear drills need one tap on ▶ Hear it first (iOS creates the AudioContext
inside that tap). The staff drill needs `vendor/vexflow.js`; if that script
is missing the drill says so and the rest of the page is unaffected.

## Why it is where it is (isolation, verified)

- `quiz/` at the repo root, **not** `src/quiz/`: tools/split/check.mjs rule
  8 forces every file under src/ into index.html's modulepreload list, sw.js
  `APP_MODULES` and src/devtools.js — and devtools.js imports every module at
  app boot, so `src/quiz/` would have loaded with the app on every launch.
- Imports from the app are a whitelist the test enforces: `src/theory/
  chords.js` (pure), `src/theory/key.js` (pure functions; it imports `S` but
  the quiz calls nothing that reads it), `src/ui/piano.js` (DOM-free key
  geometry). Nothing from audio/, ui chrome, session/, ask/, model/, platform/.
  Sound is `quiz/tone.js`, a 40-line WebAudio oscillator.
- `quiz/quiz.css` **copies** the `:root` tokens from css/app.css instead of
  linking it; the test fails when they drift.
- **sw.js** (`SW_VERSION` nr-v35): every in-scope navigation used to go
  through `networkFirst(req, {key: "index.html"})`, whose `c.put` would have
  overwritten the cached **app shell** with whatever page was visited — a
  trip to quiz/ (or privacy.html, same latent bug) would have made the app
  open the quiz offline. One early return before the navigate branch
  (`rel === "privacy.html" || rel.startsWith("quiz/")`); tests/pwa.test.mjs
  pins it before that branch.
- Learning mode: the quiz never opens a song, never reads
  `ff1roll-notes-*`/`ff1roll-draft-*`, never fetches albums/ (source scan in
  the test). Drills name qualities of stacks the page itself generated,
  never anything in his music.

Files: `quiz/index.html` (own doctype/viewport, no manifest, no SW
registration), `quiz.css`, `main.js` (wiring), `bank.js` (parser),
`srs.js` (Leitner), `drills.js` (generators + grading), `tone.js`,
`ui.js` (the only file that touches `document`). Tests:
tests/quiz.test.mjs (vm-loaded modules, 500 draws per drill kind and level,
a stub-DOM smoke of every view, the isolation scans) — `npm test` runs it
(`"quiz"` in tools/run-tests.mjs FILES).

## Where it WOULD be integrated (not wired — nothing below exists yet)

1. **View ▾ → Tools → Quiz** (opens quiz/ in a new tab).
   - Markup: index.html, inside `<div id="vwToolsRow">` — a
     `<button class="fitem" id="quizbtn" aria-label="Quiz">` after `#cofbtn`
     (◯5 Circle of fifths), so it sits in the Tools group that 8va / find: /
     ◯5 share (tests/night-roll.test.mjs's "8va/find:/◯5 sit in the Tools
     group" case would gain `quizbtn`).
   - Wiring: `src/input/gestures.js` → `initGestures2()`, right where
     `#cofbtn`'s click listener is added (line ~1259): `window.open(new
     URL("quiz/", S.APP_BASE).href, "_blank", "noopener")`. No state, so
     `renderViewMenu()` (src/ui/chrome.js, `groups.tools`) needs no ✓ column
     entry — but the button must be registered in `CONTROLS`
     (src/ui/controls.js) like every other button, per CLAUDE.md.
   - Edition: in the iPad app (`EDITION === "app"`, src/edition.js) the
     entry should open the Pages URL, since quiz/ is not in the package.
2. **Help sheet entry** — index.html `#helpsheet`, section
   `<div class="hsec" data-hsec="explore">`: a `<dt>Quiz</dt><dd>…</dd>` pair
   after "◯5 Circle of fifths" (touch gesture first, keyboard after, as the
   checklist says); then `node tools/build_help.mjs` regenerates HELP.md
   (never hand-edited); then the drift keyword `"Quiz"` goes into the
   `FEATURES` list in tests/night-roll.test.mjs (line ~2774) so the suite
   fails if the help text ever loses it.
3. **AI "quiz me" hook** — two options, cheapest first:
   - *Context only:* the general chat's context block, built in
     `src/ask/context.js` → `askContext(sp, budget)` under the `S.askGeneral`
     branch (line ~530). When the user's message matches /quiz me/i, append
     the bank's due questions (fetch `docs/learning/quizzes.md` → `../
     quiz/bank.js`'s `parseBank` is importable from src/ since it is pure —
     or move the parser under src/ask/ at that point) so the tutor can run
     the session-start quiz in chat under RULE_LEARNING (never hand over the
     answer; `askSys()` already carries that rule).
   - *A tool:* `src/ask/tools.js` → `ASK_TOOLS` (line 89) gains
     `read_quiz_bank` (no parameters; returns sections + questions + marks,
     nothing else) and `askRunTool(name, a)` (line ~470) gains the branch
     next to `list_songs`. The system prompt's tool paragraph in
     `ASK_SYS_BASE2` (src/ask/context.js) lists it as "only when the user
     asks to be quizzed". Device-local SRS state would NOT be readable from
     the app without crossing the isolation line — if the chat should know
     what is due, that is a separate ruling (sync progress into a repo file,
     the "Quiz platform" entry in open-items.md).

Out of scope until Josh says otherwise: linking into the app, AI-graded
answers, syncing progress across devices, offline/precache, the iPad package.
