# Split plan: index.html → ES modules (no build step)

Decided by Josh on 2026-10-02 ("just whatever the advisor says for the plan, just do it").
Builders follow this file as a spec. The main session reviews and ships each step, browser-checks it, and builds the iPad app.
Line numbers come from index.html @ ce709b1e (26,739 lines). They drift, so find a section by its `// ----` banner text, not by line number.

## 0. Ground rules (apply to every step)

- **One step = one push.** After every push the app works, `npm test` is green, and the e2e suite runs in CI (never run it locally).
- **A move commit only moves code.** Function names, bodies and comments stay byte-identical. The only allowed changes are import/export lines, the `S.` prefix (step 1), and `initX()` call stubs. Logic fixes go in a separate commit. Review with `git diff --color-moved=dimmed-zebra`.
- **Every move is a re-runnable command** (`tools/split/move.mjs …`), and the commit message records it. If main moved underneath you, reset and re-run the command on the new base. Never merge a move by hand.
- **Serialize with feature work.** While a step is in flight, open-items.md carries one line: `SPLIT IN PROGRESS: step N, ranges …`. Other builders don't touch those ranges until the line is gone. Stage only your own paths, and don't use `pull --autostash` (see memory).
- **Names stay global-unique.** Every top-level name in src/ is unique across all modules, which is already true today because it's one script. Tests, Ask tools and e2e all call functions by bare name.
- The CLAUDE.md shipping checklist applies, but there is no user-facing change, so the help sheet, HELP.md and the drift keyword don't apply. The doc sweep does: each step adds its modules to the **Module map** in NIGHT-ROLL.md (one line per module).

## 1. Target layout

`index.html` keeps the markup, the `<style>` block, the pre-body `ts-boot` script, `vendor/vexflow.js`, a modulepreload list, a boot watchdog and `<script type="module" src="src/main.js">`.
`src/package.json` is `{"type":"module"}` so that Node treats src/*.js as ESM. Use the `.js` extension, not `.mjs`, so every static server sends the right MIME type.

**Layers.** A module may import only from its own layer or a lower one, and check.mjs enforces this. Cycles inside layers 3–5 are allowed (see §2.3).

| Layer | Directories |
|---|---|
| 0 | `state.js`, `edition.js`, `ui/icons.js`, `midi/`, `theory/` |
| 1 | `platform/` |
| 2 | `model/`, `gen/` |
| 3 | `audio/`, `render/` |
| 4 | `input/`, `ui/`, `ask/`, `import/`, `sync/` |
| 5 | `main.js`, `devtools.js` |

| Module | Responsibility | Main contents (approx. index.html lines) |
|---|---|---|
| `main.js` | Entry: imports everything, calls `init*()` in original file order, then `boot()` | boot IIFE 26690–end |
| `edition.js` | `export const EDITION = "web";`. This is the packager's one-line change | 2794 |
| `state.js` | `export const S = {…}`: every piece of mutable app state (§2) | all 203 top-level `let`s |
| `devtools.js` | e2e/console mirror of S and exports on `window`, gated (§3.4) | new |
| `ui/icons.js` | `ICON`, `iconSvg` | 2700–2766 |
| `ui/controls.js` | `CONTROLS`, `setControl()`: the only writer of button icon/label/aria (§4 step 2) | new, plus `setPlayBtn` 2767 |
| `platform/base.js` | APP_BASE/`<base>`, PERF_FLAGS, `setDocTitle`, song-path URL helpers, recent songs | 2776–2890, 2968–2996 |
| `platform/mode.js` | Learning/Normal mode | 2891–2967 |
| `platform/storage.js` | `cfg`/`saveCfg`/`baseJoin`, `idbOpen`, idb draft/nsf/audio ops | 25589–25639, 19800–20238 (idb parts), 11370 (idbAudio*) |
| `platform/folder.js` | Local folder backend (native FS, files mirror) | 25640–26666 |
| `platform/native.js` | Capacitor bridges: `nativeCall`, `nativeOpenUrl`, `nativeOpenHook`, Core MIDI glue | scattered (grep `native`) |
| `platform/sw.js` | Service-worker registration | 26667–26689 |
| `midi/parse.js` | `parseMidi`, `tickToSec`, `secToTick` | 3226–3434 |
| `midi/write.js` | `writeMidi` | ~17392 |
| `theory/chords.js` | `spellPc`, `pitchName`, `nameChord`, `chordSym`, `parseNumeral`, `splitProgression`, `chordQualParse/Compose`, `parseChordSym` | 5629–5700, 13783–13900, 16094–16300 (pure parts) |
| `theory/key.js` | `estimateKey`, `pearsonCorr`, `checkKeyVsFile`, `checkMeterVsFile`, `fileKeyAt` | 13210–13324 |
| `model/catalog.js` | `initCatalog`, album/group lookups | 2997–3100 |
| `model/grid.js` | pencil/snap/grid helpers, `effTs`, secDepth | 3435–3615 |
| `model/edits.js` | edits store | 3616–3691 |
| `model/rollnotes.js` | `parseRollnotes`, `serializeRollnotes`, `finalizeNotes`, `noteToJSON`, `resolveNote`, chop/barTicks | 3692–4682 |
| `model/song.js` | `loadSong`, `setSong`, `editableSong`, `computeSongEnd` | 4683–4810, 6348 |
| `model/selection.js` | `selEditApply`, `nudgeSelection`, quantize/split/join, copy/paste | 6344–6969 |
| `model/provenance.js` | compositions, origins/rules, folders, `saveSongAs` | 16695–17038 |
| `model/album-order.js` | album order (game vs A–Z) | 17039–17280 |
| `model/versions.js` | drafts, `saveDraft`, versions store | 17281–18238 |
| `model/jobs.js` | jobs (footer ⏳) and the debug log | 6970–7114, 7200–7348 |
| `gen/drummer.js` | `drGenerate` and helpers | 20659–21052 |
| `gen/bassist.js` | `bsInferTimeline`, `bsGenerate` (non-UI) | 21053–21179, bs* in 21277–22278 |
| `gen/analysis.js` | Analyze layer compute and adopt (Normal mode only) | 21180–21400 (non-UI) |
| `audio/engine.js` | `ensureAudio`, `resumeAudio`, `openMaster`, track gains/pans, oscillators, `drumHit` | 8185–8700, 8915–8980, 9612–9725 |
| `audio/voices.js` | `voiceType`, SF voices, game voices, `scheduleNote`, `previewNote` | 8693–8900, 9726–10193, 18239–18765 |
| `audio/transport.js` | `play`, `stop`, the play gate, album play | 10326–10441, 11906–12129, 12130–12264 |
| `audio/chip.js` | authentic chip render, memory budget, chip worker | 10194–10325, 10442–10942 |
| `audio/chip-stream.js` | chip stream mode | 10943–11369 |
| `audio/clips.js` | audio tracks (clips), WSOLA slowdown | 11370–11905 |
| `audio/metronome.js` | `met*` | 13538–13782 |
| `audio/bounce.js` | Download audio: wav encode, offline render | 18847–19068 |
| `render/roll.js` | `resize`, `draw`, `drawFull`, `playbackFrame`, ruler, tints, kit lanes | 3101–3225, 5300–5628 |
| `render/tracks.js` | Tracks view | 5869–6332 |
| `render/score.js` | `buildScoreModel`, `drawScore` | 12265–12929 |
| `render/instrument.js` | piano, fretboard, fall | 15420–15730 |
| `render/cof.js` | circle-of-fifths drawing | 13783–14291 (drawing parts) |
| `render/compare.js` | Compare with repo | 22279–22396 |
| `input/gestures.js` | `evtPos`, `posToTickPitch`, pointer/pinch/hold-to-grab, lasso | 5700–5868, 6333–6343, 7349–8184 |
| `input/record.js` | record and Web MIDI | 15731–16093 |
| `ui/chrome.js` | song button/list, `applyChrome`, view switch, find, `renderViewMenu` | 12930–13209, 14513–14976, ~17594 |
| `ui/trackbar.js`, `ui/mixer.js` | track chips; Mixer | 4811–4973; 4974–5299 |
| `ui/voice-menu.js` | voice and game-voice pickers, clip controls | 9014–9411 |
| `ui/notes.js` | notes list, key/meter check UI | 13325–13537, 14292–14512 |
| `ui/note-editor.js` | note editor and chord widget | 16094–16692 (UI parts) |
| `ui/sheets.js` | versions sheet, drummer/bassist sheets, publish dialog | 18766–18846, 21029–21052, 21400–22278, 7115–7199 |
| `ui/wm.js` | window manager, docks, dividers | 24741–25437 |
| `import/hub.js` | Import hub and audio import | 14977–15419 |
| `import/capture.js` | NSF/chip import, captures as jobs | 19069–19918 |
| `sync/publish.js` | `publishSong`, `putMidAt`, repo writes | 20239–20658 |
| `ask/backend.js` | `aiUrl`, providers, WebLLM | 22397–22707 |
| `ask/tools.js` | annotation tools and `write_notes` | 22708–23013, 25504–25588 |
| `ask/context.js` | span, bar cache, epoch, history | 23014–23511 |
| `ask/bridge.js` | seen-cursor, inbox, status, session controls | 23512–23994 |
| `ask/shots.js` | 📷 screenshots | 23995–24740 |
| `ask/sheet.js` | `openAsk`, chat sheet wiring | 25438–25503, 23714 |

Ranges are where to start. A function sitting in the "wrong" section goes to the module named in the table; for example `scheduleNote` lives at 9952 but belongs to `audio/voices.js`. The mover takes extra names with `--names`. CSS stays in index.html (optional step 16).

## 2. Shared state, hoisting, handlers

### 2.1 Decision: one state object `S`
Every top-level `let` (203 today) becomes a property of `export const S` in `src/state.js`, and every reference becomes `S.name`. The rename is a scope-aware codemod, so a local or parameter named `song` is left alone.

Why one object rather than `export let` plus setters:
- ES import bindings are read-only, so `song = x` in another module is a TypeError, and it is raised only when that line runs. With `S`, any module may assign and nothing ever has to move when ownership changes.
- `state.js` imports nothing, so it evaluates first. Every piece of state exists before any app code runs, which removes the boot-path TDZ class of bug for state by construction (the bricks of 2026-09-25 and b590306).
- It's the explicit list of the DAW's session state, and future undo, observers and persistence hook in here.

Constants stay as `export const` in their home module. Initial values in `state.js` must be literals, browser-global expressions, or `null`. An initializer that calls app code (`wm = wmLoad()`, ~5 cases) becomes `null` in `state.js` plus `S.wm = wmLoad()` at the original spot.

**Hard rule (check.mjs):** no top-level `let`/`var` anywhere in src/ except `state.js`.

### 2.2 No top-level side effects; `init*()` preserves order
About 290 top-level statements (listener wiring, IIFEs, migrations, first renders) can't run at module-evaluation time, because evaluation order follows the import graph rather than file order.

The mover puts a moved block's top-level statements into `export function init<Module><N>()` and leaves the call `init<Module><N>();` in app.js at the exact original position. Order is preserved precisely at every step. When app.js is empty, main.js is just that ordered call list followed by `boot()`.

The same applies to a top-level `const` whose initializer calls an app function or reads another module's binding: it becomes an `S` field assigned inside the init. Pure tables and `document.getElementById(...)` lookups stay `const`, because module scripts are deferred and the DOM is parsed by then.

### 2.3 Hoisting and cycles
- Inside a module, function hoisting is unchanged.
- Across modules, imported function declarations are bound at link time, before any module evaluates, so calls in any direction work once main.js runs the inits.
- Cycles (render ↔ model ↔ ui) are harmless under §2.1–2.2, because no top-level code reads an imported binding except from a layer-0 import.
- check.mjs flags any top-level initializer that references a non-layer-0 import.

### 2.4 HTML handlers, string dispatch, serialized functions
- **Inline handlers:** index.html has zero `on*=` attributes and zero `javascript:` URLs. Nothing to do. Keep it that way: a check in tests/modules.test.mjs fails on any `on[a-z]+="`.
- **Self-profiler** (`?perf`, index.html ~8355): it wraps `globalThis[name]`, which modules break, so after 0b attribution silently does nothing. In step 7, replace `wrap()` with `prof(name, fn)` wrappers at the 25 listed functions' definitions, gated by `PERF_FLAGS`.
- **`wsolaStretch`** is shipped to a Worker via `.toString()`. It and anything else serialized must have no free identifiers besides JS builtins. check.mjs has a `SERIALIZED = ["wsolaStretch"]` list and enforces this; the S-codemod must never touch it.

## 3. Tests: the harness loads modules (Step 0a, before anything moves)

### 3.1 Loader
Use `vm.SourceTextModule` in the same per-app `vm.createContext(sandbox)` the harness builds today (fake DOM, fake clock, fake audio, localStorage proxy are all unchanged). Each `createApp()` builds a fresh module graph, because tests hold several apps at once (`a`, `run2`), so Node's real ESM cache can't be used.

```js
// tests/harness.mjs (module mode — taken when index.html has <script type="module" src="src/main.js">)
export async function createApp(opts = {}) {
  const context = vm.createContext(makeSandbox(opts));        // today's sandbox, factored out
  const mods = new Map();                                      // file URL -> SourceTextModule
  const load = (abs) => mods.get(abs) || (mods.set(abs, new vm.SourceTextModule(
      sourceFor(abs, opts) + footerFor(abs),                  // edition swap + accessor footer (cached per file)
      { context, identifier: pathToFileURL(abs).href })), mods.get(abs));
  const entry = load(path.join(opts.root || ROOT, "src/main.js"));
  await entry.link((spec, ref) => load(fileURLToPath(new URL(spec, ref.identifier))));
  context.__nrScope = scopeProxy(mods);                        // §3.2
  entry.evaluate();          // synchronous for modules without top-level await; do NOT await (boot keeps going in microtasks, as today)
  return { context, run: code => vm.runInContext("with (__nrScope) {\n" + code + "\n}", context), store, tick, el, dispatch, docDispatch, winDispatch };
}
```

- **Async.** `link()` is async in Node 22/23, so `createApp` becomes async and the ~86 call sites become `await createApp(...)`. That covers 81 in night-roll.test.mjs plus gestures, nsf, chip-worker, m3u-real, migrate-rollnotes, and the tools listed under 3.5. This is mechanical.
- **Semantic shift.** A few boot microtasks (fetch rejections, for example) now settle before the test's first line, where before the test ran first. Fix any test that turns out to depend on the old ordering. Don't change the harness for it.
- **Flag.** `vm.SourceTextModule` needs `--experimental-vm-modules`. Put it on every `node --test` in package.json; `node --test` passes it on to its child processes. The harness throws a one-line instruction if `vm.SourceTextModule` is missing.
- **Dynamic imports.** Pass no `importModuleDynamically`, so `import()` keeps throwing in vm exactly as today. The `chipModules(kind, importFn)` and `instPlayModule` test seams keep working.
- **Edition.** `opts.edition` replaces the line in `src/edition.js`'s source text.
- **Root.** `opts.root` lets a test boot the packaged output (`dist/…`), which makes it the iPad-bundle boot test.

### 3.2 `run()` keeps all ~2,076 call sites working unedited
- **Footer.** `footerFor(file)` parses the module with vendored acorn, once per file per process, and appends:
  `;export const __nr$ = {get: {a: () => a, …}, set: {f: v => (f = v), …}};`
  This covers every top-level binding; setters cover functions and classes. Browsers never see it.
- **Rebinding works across modules.** Rebinding a function declaration inside its own module updates every importer's live binding. Test monkeypatches therefore work across modules with no app changes: about 35 functions are reassigned by tests, including `appConfirm`, `vaultFetch`, `putMidAt`, `loadSong`, `play`, `estimateKey` and `idbDraft*`.
- **`scopeProxy(mods)`:**
  - `has(n)` is true for S keys and for any module's top-level name, and false otherwise, so the name falls through to context globals (`fetch`, `localStorage`, `__wav`).
  - `get(n)` returns `S[n]` or the owning module's `__nr$.get[n]()`.
  - `set(n, v)` writes `S[n]`, or calls `__nr$.set[n](v)`, or throws `"<n> is const in <module>"`.
  - `Symbol.unscopables` returns `undefined`.
- **Existing patterns keep working.** `run("song = {...}")`, `run("parseMidi(bytes)")`, `run("appConfirm = async () => true")` and `app.context.X = …` all behave as before.
- **Known breaks.** Four test snippets declare `const`/`let` in one `run()` and read the name in a later one (block scope inside `with`). Change those to `globalThis.x = …`.

### 3.3 Source-text tests
Markup and CSS greps of index.html stay as they are. Tests that grep **JS** in index.html switch to a new `appSource()` export (index.html plus every src/**/*.js concatenated). That covers pwa.test (`serviceWorker.register…`, `PERF_FLAGS.get("sw")`) and the JS greps in night-roll.test (about 52 `html.` uses, mostly markup).

### 3.4 e2e: devtools mirror
e2e specs call bare names in `page.evaluate` (`song`, `wm`, `createComposition(…)`, `draw()`, …). `src/devtools.js` exports `exposeGlobals()`, and main.js calls it first when `window.__NR_EXPOSE` is set. tests/e2e/helpers.mjs sets that flag in its existing `addInitScript`.

`exposeGlobals()` defines window accessors:
- every S key gets get/set
- every export of every module (devtools.js does `import * as` on all of them) gets get

Rule: every top-level function is exported (the mover does this), so specs need no edits. Leave the mirror off in production: an un-imported name must fail loudly, not resolve through `window`.

### 3.5 Node tools
query-lib, dump_notes, import-set, loop_target_bass, migrate-rollnotes-v2, spc-undrum, nsf/dump-all and nsf/meter_audit all use `createApp`. Each gets `await`. Add `tools/vm-flag.mjs`, imported first by each tool: if `vm.SourceTextModule` is missing, it re-execs `process.execPath --experimental-vm-modules <argv>` with stdio inherited and exits with the child's code. `node tools/at.mjs …` keeps working as written in WEB-SESSION.md.

### 3.6 Checks, all run by `npm test` as tests/modules.test.mjs
`tools/split/check.mjs`, using vendored `tools/vendor/acorn.mjs` and `acorn-walk.mjs` (node-only, never shipped, so CI's vm job needs no `npm ci`). It enforces:
1. Every free identifier in a module is a local, an import, or in `tools/split/browser-globals.txt`. This catches forgotten imports and strict-mode implicit globals statically; in a module they would only throw when the line runs.
2. No assignment to an imported binding.
3. No top-level `let`/`var` outside state.js, and no top-level non-declaration statements.
4. Top-level initializers reference only layer-0 imports.
5. Layer table respected.
6. Top-level names unique across src/.
7. `SERIALIZED` functions are self-contained.
8. The modulepreload list in index.html, `APP_MODULES` in sw.js, the devtools import list and the src/ file listing are all equal.

## 4. Steps

Each step below gives: what moves, what must not change, how to verify. Every step also needs `npm test` green (under the `perl -e 'alarm 120'` wrapper, per memory), check.mjs clean, a browser check by the main session (load a song, play, edit a note, open the moved feature's UI), and CI e2e green after the push.

**0a. Harness and tooling (no app change).**
- Add §3.1–3.6 with a legacy path: index.html still has the inline script, so `createApp` evaluates it as today, but async.
- Vendor acorn.
- Write `tools/split/{scope,check,move,promote-state}.mjs` with unit tests on small fixtures. `move.mjs --from src/app.js --to <file> --range "<banner text>|<a-b>" [--names f,g]` cuts whole top-level nodes with their leading comments, exports what moved, writes imports both ways, and leaves `initX()` stubs.
- Make all `createApp` call sites async and add the package.json flag.
- Must not change: any test assertion.
- Verify: npm test; `node tools/at.mjs <song> 1` still prints.
- **Done** (2026-10-02, Sonnet builder). tools/split/scope.mjs (AST utilities:
  parseModule, leadingComments/isBanner, declaredNames, freeIdentifiers,
  topLevelImports, topLevelMutableNames, patternNames/hoistedNames/
  blockScopedNames), check.mjs (all 8 rules + CLI + browser-globals.txt),
  move.mjs (the mover + CLI), promote-state.mjs (the S-codemod + CLI), all
  with fixture unit tests in tests/modules.test.mjs. harness.mjs's module
  mode (§3.1-3.4) is implemented and self-tested against
  tests/split-fixtures/tiny-app/ (a hand-written tiny module app) since
  index.html hasn't cut over yet — that fixture is 0a-only scaffolding, not
  part of the shipped app. See "Deviations" below for where reality diverged
  from this section's letter, and what 0b should know going in.

**0b. Cutover to modules: the whole script becomes one module.**
- Add `tools/split/cutover.mjs`, a deterministic re-runnable script: it extracts the inline `<script>` into `src/app.js` verbatim, moves the EDITION line into `src/edition.js` (app.js imports it), writes `src/main.js` (`import "./app.js"`, plus the devtools hook), `src/devtools.js` and `src/package.json`, and replaces the script tag. The whole script already parses as a strict-mode module (checked).
- Add the boot watchdog, an inline classic script in index.html. It sets `window.__nrBoot = setTimeout(nrBootFail, 10000)` and listens for `error` until boot. main.js clears it at the end of `boot()`. `nrBootFail` shows an in-page panel, never a native dialog: the error text, a Reload button, and a "Reset cache" button that goes to `?sw=0`.
- sw.js:
  - add `APP_MODULES` (src files) to PRECACHE
  - route `src/` network-first with `NAV_TIMEOUT_MS` and `revalidate: true`; Pages' max-age=600 would otherwise mix new html with stale modules
  - bump `SW_VERSION`
- package.mjs:
  - copy `src/**`
  - the one-line EDITION diff moves to `src/edition.js`; index.html must now be byte-identical
  - exempt `src/**/*.js` from the FORBIDDEN prose scan, like index.html today
  - new guard: every static `import` and literal `import()` in src/ resolves to a file in the output, and every src file is reachable from main.js
- package.test:
  - update the edition assertions
  - add a test that boots the packaged output with `createApp({root: out})`
- Must not change: behavior (the e2e suite is the judge).
- Verify:
  - npm test
  - browser on localhost and on Pages after deploy
  - **iPad build launches and plays one song**, which proves module loading in the WKWebView
  - offline relaunch on the iPad, which proves the precache
- **Done** (2026-10-02, Opus builder, worktree branch). `tools/split/cutover.mjs`
  did the extraction; src/{app,edition,main,devtools}.js + src/package.json
  written, index.html now `<script type="module" src="src/main.js">` plus a
  modulepreload list and the boot watchdog. sw.js bumped to nr-v6 with
  APP_MODULES + src/ routing. package.mjs rewrites src/edition.js (not
  index.html) and gained a reachability guard. See "Deviations (0b)" below
  for where this diverged from the letter above, including two check.mjs
  exemptions this step needed (app.js the legacy container; main.js's
  top-level init() calls) and three real, narrow scope.mjs bugs this step's
  first real-code run surfaced and fixed. npm test: night-roll.test.mjs 417
  (416 pass + 1 pre-existing environment skip, ff1.nsf vault-only), bridge
  10/10, pwa 3/3, package 3/3 (new boot-from-dist test included), modules 32
  (was 30; +1 real-repo checkSrc assertion, +1 rule-8 wiring test) — all
  unchanged from before 0b apart from the counts noted. instruments.test.mjs's
  7 "real rip" failures are the known vault-only-fixture gap, untouched by
  this step. `node tools/split/check.mjs` is clean except one PRE-EXISTING
  app bug this step's first real scan surfaced (not fixed — out of scope for
  a verbatim move): `convertAnchors()` (src/app.js, originally index.html
  ~13996) references an undeclared `oldBpb` — queued in open-items.md.

**1. All `let`s → `S`** (`promote-state.mjs` over src/app.js).
- Must not change: names, logic.
- Verify: npm test (the proxy keeps every `run()` working), check.mjs rule 3, browser check.
- After this step the main session retires the "boot-path TDZ" memory note.
- **Done** (2026-10-03, Opus builder, worktree branch). `promote-state.mjs
  --file src/app.js --state src/state.js --all` promoted 257 top-level
  `let`/`var` names (the plan's ~203 estimate undercounted multi-declarator
  lines, e.g. `let stretchWorker = null, stretchJobId = 0;`) into
  `export const S` in the new src/state.js (no imports, evaluates first, per
  §2.1). index.html's modulepreload list and sw.js's `APP_MODULES` (bumped to
  `nr-v7`) gained `src/state.js`; src/devtools.js's `exposeGlobals()` now
  mirrors every `S` field onto `window` with BOTH get and set (not just
  app.js's remaining top-level names), so an e2e spec's `song = …`/
  `mode = …` keeps working — it now sets `S.song`/`S.mode`. tests/
  harness.mjs's vm-test scopeProxy needed NO change: it already resolved `S`
  fields ahead of per-module footer accessors (§3.2, written during 0a in
  anticipation of this step). See "Deviations (1)" below for the two real
  bugs this step's first real-code run surfaced (both fixed in the shared
  tooling, not worked around per-callsite) and the one genuine pre-existing
  name collision it exposed. The "boot-path TDZ" class of bug for STATE is
  now eliminated by construction (NIGHT-ROLL.md "Module map" says so); the
  main session should retire its "boot-path TDZ check" memory note per the
  plan — this builder does not touch memory files.

**2. `ui/icons.js` and `ui/controls.js`.**
- Move ICON, `iconSvg` and `setPlayBtn`.
- Add the `CONTROLS` table: id → {el, icon, label, aria}.
- Add `setControl(id, {icon, label, aria})`, which writes innerHTML (icon via `iconSvg` + label), `aria-label` and `title` in one place.
- Migrate the first users:
  - Play ▶/■ (setPlayBtn becomes a wrapper)
  - ⏳/⚠ counters
  - ✦ AI countdown
  - View ▾ ✓ column
  - menu items
- Add tests/controls.test.mjs: it fails when src/ writes `.textContent`/`.innerHTML`/`aria-label` on any element listed in CONTROLS outside controls.js. It starts with an allowlist of the remaining offenders, which only shrinks; each later step migrates the controls it moves.
- Help sheet and status strings name controls through `CONTROLS[id].label`.
- Verify: browser check of every migrated button, iPad look.

**3. `midi/parse.js`, `midi/write.js`.**
- Pure. Must not change: bytes out (the "writeMidi / writeSongMidi agree byte-for-byte" test).
- Optional follow-up in a separate push: replace `writeMidi`'s hand port with an import of `tools/nsf/midi-write.mjs`, now possible because the harness links static imports. Ship it only if that test stays green.

**4. `theory/chords.js`, `theory/key.js`.**
- Pure parts only; UI callers stay.
- Must not change: Learning-mode gating (estimateKey is never called in Learning; there's a test for this).

**5. `model/rollnotes.js`, `model/grid.js`, `model/edits.js`, `model/catalog.js`.**
- Verify: `tests/migrate-rollnotes.test.mjs` and `node tools/dump_notes.mjs` output byte-identical on 3 FF1 songs.

**6. `platform/*`** (base, mode, storage, folder, native, sw).
- Verify:
  - browser check: Settings → data location, open a local-folder song
  - iPad: open a file from Files (`nativeOpenHook`)

**7. `audio/engine.js`, `audio/voices.js`, `audio/transport.js`**, plus the `prof()` fix (§2.4).
- Must not change: one byte of the engine. This is the iPad audio known-good engine, f733b42 + 8e1c72d.
- Verify:
  - vm transport tests
  - **iPad ear check: Josh plays a synth song, an SF2-voiced song, a game-voice song, and taps a note preview**
- If the iPad goes mute, revert the step first and then move again one module at a time.

**8. `audio/chip.js`, `chip-stream.js`, `clips.js`, `metronome.js`, `bounce.js`.**
- Verify:
  - chip-worker and psx-stream tests
  - **iPad ear check: a chip song (NES + one streamed console song), an audio-clip song at 0.5× (WSOLA worker), the metronome, and Download audio**

**9. `model/song.js`, `selection.js`, `provenance.js`, `album-order.js`, `versions.js`, `jobs.js`; `import/*`; `sync/publish.js`.**
- Verify:
  - browser: Save As, versions sheet, an NSF import into a scratch composition (never Josh's songs), publish to a scratch path

**10. `gen/drummer.js`, `gen/bassist.js`, `gen/analysis.js`.**
- Verify: drummer/bassist tests; Analyze is Normal-mode only and nothing leaks into Learning (test).

**11. `render/*`.**
- Verify: **browser screenshots** of roll, tracks, score, instrument, circle of fifths and compare at desktop and phone width, compared to before the step.

**12. `input/gestures.js`, `input/record.js`.**
- Verify: gestures.test; e2e editor/docking specs in CI; on the iPad, draw a note, hold-to-grab, pinch.

**13. `ask/*`.**
- Verify: bridge.test; on the iPad, send one Ask message, attach a screenshot, see the "Now:" status.

**14. `ui/*`** (chrome, trackbar, mixer, voice-menu, notes, note-editor, sheets, wm).
- app.js empties into main.js, which becomes the ordered `init*()` list plus `boot()`.
- Verify: full browser pass over every menu and sheet, wm docking, phone width.

**15. Finish.**
- Delete app.js.
- check.mjs with no allowlists, and the controls allowlist empty.
- Remove the legacy path from the harness.
- Doc sweep: NIGHT-ROLL.md module map, CLAUDE.md (§6), WEB-SESSION.md (src/ layout; tools still `node tools/x.mjs`), README.

**16. Optional: CSS → `css/app.css`** (`<link>`, precached, the 4 CSS-grepping tests use `appSource()`).

## 5. Risks and guardrails

| Risk | Guardrail |
|---|---|
| Boot TDZ / evaluation order | S for all state (§2.1). No top-level side effects; `init*()` at original positions (§2.2). check.mjs rule 4. Every `createApp()` boots the real module graph with browser semantics, so a TDZ brick fails `npm test` immediately. |
| Forgotten import → ReferenceError on a rare path | check.mjs rule 1 (static, whole file), not runtime. |
| Module missing on iPad = silent fallback | package.mjs reachability guard. Boot-from-dist vm test. Boot watchdog panel shows the error instead of a dead screen. The iPad launch check is in 0b. |
| SW serves stale/mixed versions | `src/` network-first with revalidate. Precache `APP_MODULES` (test-enforced). Bump `SW_VERSION` whenever `APP_MODULES` changes (pwa.test asserts the version string changed when the list did, via a hash comment in sw.js). Watchdog offers Reset cache. |
| Circular imports | Allowed in layers 3–5 and harmless under §2.2. Layer table stops pure code from importing UI. |
| Many small files are slow on iPad | On the iPad, files come from the local app bundle, so ~55 local reads cost nothing measurable. On Pages, `<link rel="modulepreload">` for every module flattens the request waterfall to one round, over HTTP/2. Total parse bytes are unchanged. No bundler needed. Re-check only if Josh reports slower launch: a measurement, so compare `?perf=1` before/after. |
| Strict mode changes runtime behavior | The whole script already parses as a module. Implicit globals are caught by rule 1. Sloppy `this` use is limited to the profiler (§2.4). |
| Merge conflicts with concurrent features | SPLIT IN PROGRESS line; re-runnable move commands; one step per push. |
| Tests pass but the e2e suite (CI only) fails | The main session watches the run in the background after each push, and the next step waits for green. Never run Playwright locally. |
| Ask/bridge code relying on bare names | No change: functions keep their names. The bridge talks over HTTP, not page-eval. |

## 6. CLAUDE.md change

Replace the line `- One-file app: index.html, no build step. Match its comment style — comments explain constraints, not narration.` with:

```
- **No build step; ES modules, not one file** (Josh, 2026-10-02). index.html is
  markup + CSS; the app is plain browser ES modules under src/ (entry
  src/main.js), served as-is — no bundler, transpiler or TypeScript. Map:
  NIGHT-ROLL.md "Module map"; rules: docs/split-plan.md §2. All mutable app
  state is on `S` (src/state.js) — no top-level `let` elsewhere; no top-level
  side effects (wiring goes in init*() called by main.js in order); top-level
  names stay unique across src/; buttons change only via setControl().
  A new module goes in index.html's modulepreload list and sw.js APP_MODULES
  (tests enforce); `node tools/split/check.mjs` must pass. Match the comment
  style — comments explain constraints, not narration.
```

In "Where things are", replace the Tests bullet's harness clause with: `vm harness in tests/harness.mjs loads src/ as real ES modules (vm.SourceTextModule, --experimental-vm-modules); run("expr") sees S and every module's top-level names`.

## Deviations (0a, 2026-10-02)

Where step 0a's implementation diverged from this document's letter, smallest-working-alternative style, each still meeting the step's intent:

- **acorn's comment shape.** `onComment` (array form) gives `{type, value,
  start, end}` — the field is `.value`, not `.text` as an early draft of
  scope.mjs/move.mjs assumed. Fixed; `isBanner()` and `findBannerSection()`
  are the only places that read it, so this is invisible to 0b.
- **move.mjs's init-function grouping.** §1's "a moved block's top-level
  statements" (plural) go into ONE `init<Module><N>()` per *maximal run* of
  consecutive non-declaration nodes within a single mover invocation's
  selection, not one function per statement. The call stub sits at the
  first statement's original position; the rest of the run is deleted
  outright. This is behaviorally identical to calling each separately at its
  own spot, because every declaration between them is side-effect-free at
  module-eval time (§2.2) — nothing observable happens in the gap either
  way. 0b's cutover and later `move.mjs` invocations should expect this
  grouping, not per-statement init functions.
- **tools/split/browser-globals.txt is a seed, not an audit.** Populated
  from the ECMAScript/Web-API standard sets plus a quick grep of index.html
  for distinctive globals (Capacitor, navigator.*, indexedDB, …) — not a
  line-by-line pass over all 26,739 lines. check.mjs rule 1 will surface
  real gaps the first time a section actually moves (step 2+); add the
  missing name there rather than widening the allowlist speculatively.
- **check.mjs rule 8 (manifest equality) exists but isn't wired into the
  CLI/npm-test path yet.** `ruleManifestsEqual()` is implemented and unit-
  tested, but `checkSrc()` doesn't call it, because none of the four lists
  it compares (index.html's modulepreload list, sw.js's `APP_MODULES`,
  devtools.js's `import * as` list, the real src/ file listing) exist
  before step 0b. 0b should call `ruleManifestsEqual()` from
  tests/modules.test.mjs (or check.mjs's own CLI) once it creates those four
  things, and keep it there for every later step.
- **promote-state.mjs refuses a destructured top-level binding** (`let {a,
  b} = x;`) with a clear error rather than promoting it, since none exist
  in index.html today (confirmed by grep). If step 1 hits one, rewrite it
  to simple bindings first (the error message says so), rather than teaching
  the tool a destructuring-aware rename.
- **The module-mode harness is unexercised by the real app through all of
  0a** — index.html has no `<script type="module">` yet, so `createApp()`
  always takes the legacy branch for every real test and tool. Its loader,
  footer/accessor mechanism, and `scopeProxy` (S-fields + per-module
  rebinding, including the `with`-scope `Symbol.unscopables` and const-write
  guard) are proven against tests/split-fixtures/tiny-app/ instead. Step
  0b's own verify list ("browser on localhost", "iPad build launches and
  plays one song") is where this machinery first meets the real 26,739-line
  app — budget real attention there, not rubber-stamp time.
- **vm.SourceTextModule needs `--experimental-vm-modules` on this Node
  (23.5.0)** — confirmed by direct test, not assumed from the plan's "Node
  22/23" phrasing. `tools/vm-flag.mjs`'s re-exec and package.json's flag
  both depend on that being true; if a future Node ships it unflagged,
  both become harmless no-ops (vm-flag.mjs's `typeof` check short-circuits).

## Deviations (0b, 2026-10-02)

- **check.mjs needed two exemptions this step's real code discovered, both
  now in the tool, not worked around in the test:**
  - **`app.js` (the "legacy container") is in the layer table at the same
    tier as main.js/devtools.js**, and exempt from rule 3 (top-level
    mutable), via a new `LEGACY_CONTAINER` export (same pattern as
    `SERIALIZED`). It still holds ~203 top-level `let`s until step 1, and it
    doesn't fit the layer table like a real module — layering it with
    main.js/devtools.js means main.js importing it, and it importing any
    real module as later steps carve pieces out, both pass rule 5 without
    further changes. Deleted in step 15, along with this exemption.
  - **`main.js` is exempt from rule 4** (top-level-initializer-references-
    layer-0-only): its entire job, per §1's table, is top-level calls into
    every layer ("calls init*() in original file order, then boot()"), and
    ES module evaluation order (dependencies before dependents) already
    guarantees everything it calls has finished evaluating — rule 4 exists
    to stop an ORDINARY module from depending on not-yet-ready state, a
    hazard main.js can't hit by construction. (`src/devtools.js` hit the
    same rule for a top-level `{app, edition}` object literal; fixed by
    moving that literal inside `exposeGlobals()` instead of exempting the
    file — the cleaner fix where the call site allows it.)
- **Three narrow, pre-existing scope.mjs bugs, surfaced by this step being
  the first real code `freeIdentifiers`/`hoistedNames` ever ran against**
  (0a's unit tests used small fixtures that didn't happen to hit these):
  labeled statements (`outer: for (...) { break outer; }`) were walked as if
  `break`/`continue`'s label were a variable reference; a non-arrow
  function's implicit `arguments` wasn't treated as bound; and `hoistedNames`
  only collected `var`/function declarations directly in a block, not
  recursively through nested if/for/while/switch/try/labeled blocks (`var`
  hoists through all of them to the nearest function). All three are fixed
  in scope.mjs itself (shared by check.mjs/move.mjs/promote-state.mjs), not
  worked around per-callsite. Reducing `check.mjs`'s real-repo violation
  count from 16 to the one genuine app bug below is what surfaced the first
  two; the third (`libFiles`, src/app.js ~17010) only showed up after.
- **package.mjs's `chipTableModules()` must read `src/app.js`, not
  index.html** — it scans the CHIPS table's `files:`/`shared:` literals,
  which are JS and moved with everything else. Missing this would have
  silently dropped `sounding.mjs`/`note-preview.mjs` from the runtime module
  list again — the exact bug a 2026-09-28 comment in that function already
  warns about ("every console render on the iPad fell to synth"). Caught by
  diffing the runtime module count (45 broken → 47 fixed) against a
  `git show HEAD:index.html` baseline before trusting the cutover.
- **~24 night-roll.test.mjs/pwa.test.mjs assertions switched from reading
  index.html to `appSource()`** (§3.3's "about 52 html. uses, mostly
  markup" — that estimate undercounted the assertions that are genuinely JS,
  not markup/CSS, mixed into otherwise-markup tests). `appSource()` is a
  strictly safe superset (index.html's text is an unchanged PREFIX of it,
  so every markup/CSS assertion keeps matching at the same positions; a JS
  assertion that used to find its pattern inline now finds the identical
  bytes in src/app.js instead) — confirmed by running the full suite twice:
  once classifying each site by hand (missed one — the import-hub test's
  trailing `addEventListener("drop"`/`makeWindow(` checks, not caught until
  the test run itself failed), once blanket-switching everything except the
  one site that must stay on raw index.html (`tests/build_help.mjs` parity,
  which reads index.html directly itself). The second pass is what's
  shipped; don't re-narrow it by hand in a later step without re-running the
  full suite.
- **One pre-existing app bug found, not fixed**: `convertAnchors()`
  (src/app.js, originally index.html ~13996) has
  `n.q2 || oldBpb`, and `oldBpb` is never declared anywhere — a real,
  one-occurrence `ReferenceError` waiting for `n.b2` truthy + `n.q2` falsy
  at runtime. check.mjs rule 1's first real-code scan found it; a verbatim
  move must not fix app logic, so it's queued in open-items.md instead.
- **One test fixed for a real module-boundary difference, not a false
  positive**: the chip-stream-mode test monkeypatched `trackGain` via
  `globalThis.trackGain = …`. That only works in the legacy (classic-script)
  harness mode, where a top-level function declaration's binding and its
  `globalThis` property are the same slot; a module's top-level bindings are
  never `globalThis` properties (true in a real browser too, not just the
  vm harness), so the patch silently stopped reaching the real `trackGain`
  callers use. Fixed to a bare `trackGain = …` inside the `run()` string,
  which the harness's `with`-scope `scopeProxy` already routes to the
  declaring module's real setter (§3.2) — the same mechanism ~35 other
  monkeypatched functions (`appConfirm`, `loadSong`, `play`, …) already use
  correctly. Checked the rest of tests/*.mjs for the same pattern (every
  `globalThis.NAME =` site cross-referenced against app.js's top-level
  declared names): `trackGain` was the only real hit — every other
  `globalThis.X` assignment is either a `__`-prefixed test-only sentinel or
  an actual browser global (`fetch`, `location`, `Worker`, …), both
  unaffected by the cutover.
- **The boot watchdog clears at the START of `boot()`, not "the end of
  `boot()`"** as this document's step-0b bullet says. The risk the watchdog
  guards against is module 404/syntax failure — if that happens, `boot()`
  never starts running at all, so reaching its first line already proves
  the module graph loaded. Clearing at the end instead would risk a false
  alarm from a slow catalog fetch (no network, a cold CDN, …), which is an
  existing, unrelated condition `loadSong`/`setInfo` already handle with a
  message in the UI, not a reason to show the boot-failure panel.

## Deviations (1, 2026-10-03)

- **A 4th narrow, pre-existing scope.mjs bug, same family as 0b's three**:
  `for (let ti = EXPR; …)` — EXPR, the loop variable's OWN initializer —
  was never walked by `freeIdentifiers` (scope.mjs, used by check.mjs rule 1)
  or by promote-state.mjs's own (separate, parallel) `collectUses`. Both
  only collected the declared loop-variable NAME into the bound set and
  skipped the initializer expression entirely, so a free reference inside it
  — `song` in `for (let ti = song.tracks.length - 1; ti >= 0; ti--)`
  (`hitNote`, src/app.js) — was silently never seen: not renamed to
  `S.song`, and not flagged as a free identifier either (both tools share
  the blind spot, so check.mjs's rule 1 didn't catch its own tool's miss).
  This surfaced as a real `ReferenceError: song is not defined` the first
  time a test exercised that path, not as a check.mjs finding — a gap this
  step's real-code run exposed for both tools at once, the same way 0b's
  three scope.mjs bugs were first exposed by real code rather than the 0a
  fixtures. Fixed in both `freeIdentifiers` (scope.mjs) and `collectUses`
  (promote-state.mjs): the declarator's `init` is now walked in the OUTER
  scope, same as `VariableDeclarator`'s handling one case up. app.js was
  reset to its pre-step-1 (HEAD) text and promote-state.mjs re-run in full
  against the fixed tool, rather than hand-patching the one site found —
  cheaper and safer than trying to prove by inspection that this was the
  only occurrence in a 24,000-line file (an AST-level sweep afterward
  confirmed no further `S`/`E` binding collisions remained — see the next
  item — but the for-loop-init bug itself could in principle have hit any
  number of call sites; a full re-run is the only way to be sure all of them
  were caught by the SAME fixed pass).
- **One genuine pre-existing name collision, not a tool bug**: `S` (and `E`)
  already existed as ordinary parameter/local names in two places —
  `function applyChop(S, E) { … }` and a `const S = …; const E = …;` block
  inside `finalizeNotes` — purely coincidental (chop Start/End tick
  shorthand), predating any notion of a state container. promote-state.mjs's
  scope-aware renamer correctly left these scopes' own bare `S`/`E` uses
  alone (they're legitimately bound there), but every OTHER promoted name
  it rewrote to `S.name` inside those same scopes (`song` → `S.song`,
  `appliedChop` → `S.appliedChop`, `chopS` → `S.chopS`, `chopE` → `S.chopE`)
  then resolved to the wrong `S` — the local parameter/const, not the
  imported state object — a silent correctness bug (`applyChop` always
  returned `false`) rather than a crash, caught by the vm test suite, not by
  check.mjs (both bindings are legitimately bound in their scope; nothing
  about them is a free-identifier violation). Fixed by renaming ONLY the
  local `S`/`E` to `cStart`/`cEnd` in both spots (pure local rename, zero
  behavior change — confirmed against the pre-promotion source, which never
  read a `.property` off either) — the smallest working alternative to
  teaching promote-state.mjs to detect every possible collision between its
  fixed container name and an arbitrary pre-existing identifier anywhere in
  a 24,000-line file. An AST sweep for any other local/param/catch binding
  literally named `S` or `E` (including destructuring patterns) found none
  remaining. A future step moving code out of app.js should keep this in
  mind if it ever renames/relocates a block containing a local `S`/`E`.
- **~4 night-roll.test.mjs assertions, 1 pwa.test.mjs assertion, and 2
  tests/modules.test.mjs assertions needed updating**, all for the same
  reason: they pattern-match literal JS SOURCE TEXT (via `appSource()` or
  `Function#toString()`), not behavior, so a promoted name's text changing
  from `foo` to `S.foo` breaks a hardcoded bare-name regex even though
  nothing about the app's behavior changed. Fixed by updating each regex to
  expect `S.`-prefixed text (`forKey = S.songKey`, `S.audio = new`,
  `S.rangeSel`, `S.APP_BASE`, …) — mechanical, one-to-one with the actual
  diff, not a loosening of what's asserted. The two modules.test.mjs fixes
  are structural, not textual: `checkSrc`'s real-repo file count moved from
  4 to 5 (src/state.js is a genuinely new file), and rule 8's real-repo
  manifest check needed `realModuleManifests()`'s devtools-import regex
  broadened from `import \* as \w+` to any `import … from "./X"` — state.js
  is deliberately imported as `import { S }` (a two-way per-field mirror),
  not `import * as` (a GET-only whole-namespace mirror, right for app.js/
  edition.js but wrong for S, per §3.4's own distinction between the two).
- **tools/split/cutover.mjs's footer-generation code moved to a new shared
  module, tools/split/e2e-footer.mjs** (`stripFooter`/`topLevelAccessorNames`/
  `addAccessorFooter`), not duplicated: step 0b's `addAccessorFooter` ran
  ONCE, when cutover.mjs first wrote app.js; from step 1 on, EVERY change to
  app.js's top-level names (promote-state.mjs here; a future move.mjs
  carving a module out of app.js in steps 2-14) must regenerate the footer
  from the file's CURRENT body, or it goes stale — a stale footer's
  generated accessor closures reference a name no longer declared in app.js,
  which is exactly what check.mjs's rule 1 caught on the first attempt (the
  pre-fix footer still mirrored `song`, `mode`, etc. as bare identifiers
  after they'd moved to `S`). New `tools/split/regen-e2e-footer.mjs --file
  src/app.js` does the regeneration (idempotent: strips any existing footer
  first); cutover.mjs now imports the same `addAccessorFooter` instead of
  keeping its own copy. No test imports cutover.mjs's internals directly, so
  this refactor is invisible to tests/modules.test.mjs.

## 7. Estimates (Sonnet builder hours, excluding review and CI wait)

| Step | h | Step | h |
|---|---|---|---|
| 0a harness and tooling | 8 | 8 audio part 2 | 4 |
| 0b cutover | 4 | 9 model/import/sync | 4 |
| 1 S codemod | 3 | 10 gen | 2.5 |
| 2 icons and controls | 3 | 11 render | 4 |
| 3 midi | 1.5 | 12 input | 4 |
| 4 theory | 2 | 13 ask | 3 |
| 5 model core | 3 | 14 ui and main | 6 |
| 6 platform | 3 | 15 finish and docs | 2 |
| 7 audio part 1 | 4 | 16 CSS (optional) | 1.5 |

The total is about 62 h. Step 0a is the highest-risk piece (scope analysis plus the mover); every later step is mostly running the mover plus verification.
