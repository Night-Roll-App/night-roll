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
- **Done** (2026-10-03, Opus builder, worktree branch). `tools/split/move.mjs
  --names ICON,iconSvg --to src/ui/icons.js`, then `--names
  setVolBtn,setPlayBtn --to src/ui/controls.js`, both over src/app.js.
  `CONTROLS` ended up {icon, glyph, cls, label, prefix, aria} — `glyph`
  and `prefix` beyond the plan's {icon, label, aria} shorthand, because
  byte-identical output needed them (KEEP glyphs like 𝄞/◂/🎓 that never
  got a Material icon, and the ✓/space checkbox column View ▾'s rows and
  the Roll/Tracks/Score drop-up both share). `setControl` treats every
  field as an independent patch (an omitted field keeps its last value)
  rather than requiring the full {icon, label, aria} every call, so a
  tick-by-tick countdown (deployButtonTick) and an aria-only status update
  (askStatus) never clobber each other. 26 controls registered; migrated
  writers: setPlayBtn (+ playGateTick's loading-% display), setVolBtn,
  updateJobsBtn (#jobsbtn + #vwJobs), errChip (#errbtn + #vwMessages),
  deployButtonTick + askStatus's aria-label (#askbtn), applyViewMode +
  renderViewSwitch (#viewbtn, #vsRoll/#vsTracks/#vsScore), renderViewMenu's
  `set()` helper (14 rows) + #vwGrid. tests/controls.test.mjs's allowlist
  is empty — every writer this step touched was converted, not deferred.
  See "Deviations (2)" for the layer-table finding this step surfaced and
  the controls knowingly left unmigrated.

**3. `midi/parse.js`, `midi/write.js`.**
- Pure. Must not change: bytes out (the "writeMidi / writeSongMidi agree byte-for-byte" test).
- Optional follow-up in a separate push: replace `writeMidi`'s hand port with an import of `tools/nsf/midi-write.mjs`, now possible because the harness links static imports. Ship it only if that test stays green.
- **Done** (2026-10-03, Opus builder, worktree branch). `move.mjs --names
  parseMidi,tickToSec,secToTick --to src/midi/parse.js` then `--names
  writeMidi --to src/midi/write.js`, both over src/app.js, by name (not
  banner range — the "midi parse" banner's section runs to the NEXT banner,
  far past these three declarations, into unrelated grid/selection code; the
  table's other banner, "midi write", doesn't exist — writeMidi has no
  leading banner comment, just its own inline one). parse.js needed one
  import, `S` (for `S.playRate` inside tickToSec/secToTick) — a same-layer
  (layer 0) import, allowed by rule 5. write.js is fully self-contained, no
  imports. Neither function's body changed a byte (checked by re-running
  `node tools/dump_notes.mjs` against a copy of albums/starters/fur-elise.mid
  in scratch/ and diffing against the committed .notes.txt — identical).
  `regen-e2e-footer.mjs --file src/app.js` re-run; check.mjs clean except the
  pre-existing `oldBpb` finding; check-e2e-globals.mjs and check-controls.mjs
  clean. devtools.js gained `midiParse`/`midiWrite` namespace imports (GET-only,
  same as icons.js/controls.js). sw.js APP_MODULES gained both files,
  SW_VERSION bumped nr-v8 → nr-v9; index.html's modulepreload list gained
  both (ordered with the other layer-0 modules, before app.js). `node
  tools/package.mjs --out /tmp/nr-dist-s3` packages both files with no
  package.mjs changes needed — its reachability guard walks static imports
  generically from main.js, and app.js's new imports already reach them;
  47 runtime modules, matches pre-step count (midi/ carries no extra
  tools/-side runtime modules of its own). `tools/at.mjs`,
  `tools/span.mjs` and `tools/dump_notes.mjs` all re-verified against real
  songs in albums/starters/ (never albums/compositions/). See "Deviations (3)"
  below for the one real finding.

## Deviations (3, 2026-10-03)

- **No scope.mjs/move.mjs bugs surfaced this time** — unlike every prior
  step, this one hit nothing new: both functions are leaf code (parseMidi
  reads only browser globals + `d`/`opts`/locals; writeMidi reads only its
  own locals), so the free-identifier/hoisting edge cases steps 0b/1/2 found
  simply don't apply here. The only cross-module reference this step
  introduced — `tickToSec`/`secToTick` reading `S.playRate` — is the
  ordinary, already-proven S-field-via-import path step 1 established.
- **`midiBase64` (src/app.js, right after writeMidi) stayed put, not moved**:
  its own comment at one call site says "any bytes — chunked btoa, not
  MIDI-specific" (src/app.js, the audio-clip base64 caller), and a grep of
  every call site confirms it — SoundFont bytes, recorded-audio bytes, and
  MIDI bytes all go through it. It's a general base64-chunking helper that
  happens to sit textually next to writeMidi, not one of "its helpers" per
  §1's table; moving it would misfile a non-MIDI utility into midi/write.js.
  Left in app.js for a later step (platform/ or a small util module) to
  claim.

**4. `theory/chords.js`, `theory/key.js`.**
- Pure parts only; UI callers stay.
- Must not change: Learning-mode gating (estimateKey is never called in Learning; there's a test for this).
- **Done** (2026-10-03, Opus builder, worktree branch). `move.mjs --names
  SHARP_SPELL,spellMemo,spellFor,spellPc,pitchName,CHORD_TEMPLATES,nameChord,
  CHORD_FLAT,chordSym,NUM_DEG,MAJ_STEP,MIN_STEP,parseNumeral,
  splitProgression,CHORD_BASES,CHORD_EXTS,chordQualParse,chordQualCompose,
  parseChordSym,SF_MAJOR,LETTERS,LETTER_PC,keySpelling --to
  src/theory/chords.js`, then `move.mjs --names
  TONIC_SPELL,FIFTHS_POS,MODE_FIFTHS,trueSf,keyNameFor,pearsonCorr,fileKeyAt,
  checkMeterVsFile --to src/theory/key.js`, both over src/app.js, by name
  (banners don't cleanly bracket either cluster — the chord-naming functions
  and the key-check functions are each scattered across 2-3 separate
  sections hundreds of lines apart, interleaved with UI code that stays).
  `regen-e2e-footer.mjs --file src/app.js` re-run; check.mjs clean except
  the pre-existing `oldBpb` finding; check-e2e-globals.mjs and
  check-controls.mjs clean. devtools.js gained `theoryChords`/`theoryKey`
  namespace imports (GET-only). sw.js APP_MODULES gained both files,
  SW_VERSION bumped nr-v9 → nr-v10; index.html's modulepreload list gained
  both (ordered after midi/, before app.js — both layer 0). `node
  tools/package.mjs --out /tmp/nr-dist-s4` packages both files with no
  package.mjs changes needed; 47 runtime modules, same as post-step-3 (no
  tools/-side runtime module corresponds to theory/). `tools/at.mjs`,
  `tools/pitch-census.mjs`, `tools/annotations.mjs`, `tools/loop-targets.mjs`
  and `tools/dump_notes.mjs` all re-verified against real songs in
  albums/starters/ (never albums/compositions/) — `dump_notes.mjs`'s output
  on a scratch copy of fur-elise.mid is byte-identical to the committed
  .notes.txt. See "Deviations (4)" below for the two real findings: the
  `spellPc`/`sfShownAt` layering fix, and `estimateKey`/`checkKeyVsFile`
  staying in app.js.

## Deviations (4, 2026-10-03)

- **`spellPc`'s implicit-`sf` default called `sfShownAt()`, which couldn't
  travel with it**: `sfShownAt` (Learning/Normal mode's key-spelling gate —
  the exact function the "estimateKey never called in Learning" spy test
  watches) reads `appMode()` and calls `estimateKey()`; it belongs with
  platform/mode.js (§1's table), not theory, and it stays in app.js
  (LEGACY_CONTAINER, layer 5) until that step. `spellPc`'s old body was
  `if (sf === undefined) sf = sfShownAt(S.playCursor);` before the real
  spelling lookup — moving `spellPc` as-is would have made
  `src/theory/chords.js` (layer 0) import from `app.js` (layer 5), which
  check.mjs rule 5 forbids outright (and rightly: theory must never reach
  into the model/mode layer it's supposed to sit under). A repo-wide grep
  confirmed exactly ONE call site relies on the default — the roll ruler's
  pitch-class label (src/app.js, the row-label loop) — every other call
  site across app.js, tools/ and tests/ already passes `sf` explicitly.
  Fixed by moving the resolution to that one call site
  (`spellPc(pc, sfShownAt(S.playCursor))`) and deleting the default branch
  from `spellPc` itself. This is a one-line, value-identical change (the
  exact same `sfShownAt(S.playCursor)` is still computed, just by the
  caller instead of the callee) — not a byte-identical move for that one
  function, but the smallest edit that unblocks the move without
  misfiling `sfShownAt`/`appMode` into theory ahead of their own step. Every
  other moved function (`pitchName`, `nameChord`, `chordSym`, `parseNumeral`,
  `splitProgression`, `chordQualParse`/`Compose`, `parseChordSym`) had no
  such dependency and moved byte-identical.
- **`spellFor`/`keySpelling`/`SHARP_SPELL`/`spellMemo`/`SF_MAJOR`/`LETTERS`/
  `LETTER_PC` moved too, unlisted by §1's table**: `spellPc` calls
  `spellFor(sf)` (hence `keySpelling`/`spellMemo`) on every non-null `sf` —
  not just the default branch — so these aren't optional companions, they're
  load-bearing. All seven are pure (constants or S/DOM-free functions), so
  moving them is a plain extension of the same pattern step 3 set with
  `CHORD_TEMPLATES`/`CHORD_FLAT`/`CHORD_BASES`/`CHORD_EXTS`/`NUM_DEG`/
  `MAJ_STEP`/`MIN_STEP` (also moved, also unlisted, also load-bearing
  constants for the functions the plan DOES name). Every app.js call site
  that used any of these directly (`transposeChordLabel`'s `CHORD_FLAT`/
  `LETTER_PC`, the score renderer's `vexKey`/`SF_MAJOR` uses, `cofMajorName`,
  the key-dial, …) got an automatic back-import from move.mjs; none of
  those functions moved.
- **`estimateKey` and `checkKeyVsFile` did NOT move — the plan's two biggest
  named targets for this step stayed in app.js.** Both reach past theory's
  own layer into model-layer helpers that haven't been split out yet:
  `estimateKey` calls `keyEstimateSig()`, which calls `trackIsDrums(ti)`
  (decides whether a track's notes count toward the pitch-class census);
  `checkKeyVsFile` calls `barTicks()` (→ `beatsPerBarEff()` → `effTs()`).
  Both helpers are pure (S-only, no DOM) but are explicitly §1's table's
  future territory — `trackIsDrums` is a song/track-model predicate,
  `barTicks`/`effTs` are named for `model/grid.js` (step 5, "pencil/snap/grid
  helpers, effTs"). If `estimateKey`/`checkKeyVsFile` moved to
  `theory/key.js` as written, they'd need `trackIsDrums`/`barTicks` imported
  from app.js — a straight rule-5 violation (theory, layer 0, importing
  LEGACY_CONTAINER, layer 5) check.mjs would reject, not a style nit. The
  only ways around it were rejected: duplicating `trackIsDrums`'s/
  `barTicks`'s logic inline inside theory/key.js (diverges from the single
  source of truth the first time either changes — the same "no one-time
  hacks" reasoning CLAUDE.md states for capture engines, applied here to
  logic forks instead of per-game tables); or moving `trackIsDrums`/
  `barTicks` into theory now (misfiles a model concern into the pure-theory
  layer, exactly the kind of layer violation the table exists to prevent,
  and creates rework when step 5/9 has to move them back out of theory and
  into model/ anyway). Neither is a "move" — both are logic changes or
  architecture changes a tight single-step spec shouldn't make unilaterally.
  So both functions stay exactly where they were, under their original
  names, called the same way everywhere (including every "estimateKey is
  never called in Learning" spy test, which still passes unchanged — the
  gating itself never moved and was never at risk). Flagged as Q11 in
  open-items.md: step 5 (or whichever step moves `trackIsDrums`/`barTicks`)
  should complete `estimateKey`'s and `checkKeyVsFile`'s move to
  theory/key.js once their last blocking dependency lands, using the exact
  same `move.mjs --names estimateKey,checkKeyVsFile` (plus
  `keyEstimateSig`/`tonicPcFromName`, their own remaining non-S
  dependencies) once trackIsDrums/barTicks are themselves layer-0-or-lower.
- **`fileMeterAt` was NOT moved**, despite sitting textually right next to
  `fileKeyAt` and looking like its meter-side twin: `checkMeterVsFile`
  (which DID move) doesn't call it — it inlines the identical
  `list[0].num`/`.den` logic itself. Grepped for other callers of
  `fileMeterAt` in app.js; it has its own (UI) callers that stay, so moving
  it would have been scope creep with no caller in this step's two
  destination files to justify it.

**5. `model/rollnotes.js`, `model/grid.js`, `model/edits.js`, `model/catalog.js`.**
- Verify: `tests/migrate-rollnotes.test.mjs` and `node tools/dump_notes.mjs` output byte-identical on 3 FF1 songs.
- **Done** (2026-10-03, Opus builder, worktree branch). Four `move.mjs --names`
  invocations over src/app.js (plus one into the already-existing
  src/theory/key.js): `rollnotes.js` ← `barTicks,applyChop,notesBase,baseName,
  notesStoreKey,ROLLNOTES_FORMAT,ROLLNOTES_MAX_VERSION,ROLLNOTES_LOCK_MSG,
  parseRollnotes,jsonToRawNote,parseRollnotesJSON,deriveNoteTypes,
  audioDirText,noteToJSON,trackDirText,resolveNote,dedupedNotesWithIndex,
  serializeNotesList,serializeRollnotes,serializeRollnotesStamped`;
  `grid.js` ← `pencilTicks,isTripletDur,songHas32nds,moveSnapTicks,
  gridAnchorTick,snapTickAbs,pencilCellAt,gridCellStart,effTs,
  beatsPerBarEff,beatTicks,beatsPerBarDisp,secDepthCap,trackIsDrums`;
  `edits.js` ← `editsKey,isLocalDraft,overlayNoteSig,updateClearBtn`;
  `catalog.js` ← `groupOf,catalogHas,publishedPaths,folderOf,albumFolders,
  segTitle,folderTitle,titleCaseSlug,FOLDER_NAMES`; `theory/key.js` (not
  listed by this step's table, but the right home — see Deviations) ←
  `keyNameToSf,MODE_OFFSET,LETTER_SF,MODE_SF_OFFSET`. Order mattered:
  `rollnotes.js` was moved before `grid.js` so `barTicks`'s own back-import
  into app.js existed by the time `grid.js`'s movers needed it; this left
  `rollnotes.js` with three imports pointing at `../app.js` for
  `beatsPerBarEff`/`beatTicks`/`beatsPerBarDisp` (correct at the moment they
  were written, stale the instant `grid.js`'s move pulled those three out of
  app.js) — hand-corrected to `./grid.js` immediately after, an import-line-only
  fix within the plan's own §0 allowance ("the only allowed changes are
  import/export lines"). `regen-e2e-footer.mjs --file src/app.js` re-run
  (without it, rule 2 flagged 41 "assignment to imported binding" violations
  — the stale footer's generated setters for every name that just left
  app.js); after regen, check.mjs is clean except the pre-existing `oldBpb`
  finding. check-e2e-globals.mjs and check-controls.mjs clean.
  devtools.js gained `modelCatalog`/`modelGrid`/`modelEdits`/
  `modelRollnotes` namespace imports (GET-only). sw.js APP_MODULES gained
  all four, SW_VERSION bumped nr-v10 → nr-v11; index.html's modulepreload
  list gained all four (after theory/, before app.js — all layer 2).
  `node tools/package.mjs --out /tmp/nr-dist-s5` packages all four with no
  package.mjs changes needed; 47 runtime modules, unchanged from post-step-4
  (no tools/-side runtime module corresponds to model/). `tools/at.mjs`,
  `tools/span.mjs`, `tools/annotations.mjs`, `tools/loop-targets.mjs` and
  `tools/dump_notes.mjs` all re-verified against albums/starters/fur-elise.mid
  (never albums/compositions/) — `dump_notes.mjs`'s output on a scratch copy
  is byte-identical to the committed .notes.txt (this step's actual tool
  coverage, not the "3 FF1 songs" above: FF1 songs come from the NSF
  pipeline, tools/nsf/dump-all.mjs, which this step's moved code doesn't
  touch). `npm run test:e2e:smoke` run once: 8/8 passed. See "Deviations (5)"
  below for what each module actually ended up containing versus this
  section's letter, and why — most of it is the same story repeated four
  times: the plan's named "big" function for a module (`initCatalog`,
  `finalizeNotes`, the bulk of the edits store, and — for the leftover
  theory move below — `estimateKey`/`checkKeyVsFile` again) turned out to
  reach into layers this step cannot touch, so it stayed in app.js while the
  genuinely pure surrounding code moved.

**Leftover from step 4: `estimateKey`/`checkKeyVsFile` still did not move.**
Per this step's own assignment (finish moving them into `theory/key.js` once
`trackIsDrums`/`keyEstimateSig`/`barTicks` are importable from a lower
layer), `trackIsDrums` moved into `model/grid.js` and `barTicks` moved into
`model/rollnotes.js` above — but this does NOT unblock the theory move, and
can never. `theory/` is layer 0, the LOWEST layer in the table; a module may
only import its own layer or lower, which for layer 0 means layer 0 only,
full stop. `trackIsDrums`/`barTicks` are legitimately layer-2 (`model/`)
concepts — `trackIsDrums` reads a track's notes/kind (song-model), `barTicks`
multiplies a meter-derived beat count by `S.song.ppq` (grid-model) — moving
them anywhere in `model/` (this step's only available destination, since
`model/song.js` doesn't exist until step 9) leaves them at layer 2, which is
*higher* than layer 0, not lower. `theory/key.js` importing from `model/`
is exactly as forbidden by rule 5 as importing from `app.js`
(`LEGACY_CONTAINER`) was in step 4 — the violation just moves from one
layer-5-ish name to a real layer-2 one. The open-items.md entry that asked
for this retry assumed the blocker was merely "not yet carved out of
app.js"; it was actually a permanent structural one. The entry is corrected
below, not marked done, with a new QUEUED note describing the real
constraint for whoever next considers moving these two.

## Deviations (5, 2026-10-03)

- **Every named "big" function in this step's table stayed in app.js, same
  story each time: it reaches into a layer this step cannot touch.** The
  pattern repeats from step 4 (`estimateKey`/`checkKeyVsFile`) exactly:
  - `initCatalog` (model/catalog.js) calls `folderOnly`/`songsURL`/
    `folderScanAlbums` (platform/folder.js + platform/base.js, step 6) and
    `albumMetaFor` (audio/chip.js, step 8) — all four still in app.js. What
    DID move, under the table's own "album/group lookups" half of the same
    responsibility line, is the cluster of pure `S.CATALOG` readers:
    `groupOf`, `catalogHas`, `publishedPaths`, `folderOf`, `albumFolders`,
    `segTitle`, `folderTitle` (+ `titleCaseSlug`/`FOLDER_NAMES`, unlisted but
    load-bearing — `folderTitle`/`albumTitleFor`'s pattern, same as step 4's
    unlisted chord constants). `model/catalog.js` therefore exists but holds
    no `init*` function yet — the same shape `theory/key.js` had after step 4
    (real content, but not its headline name).
  - `finalizeNotes` (model/rollnotes.js) is the one case worse than
    estimateKey's: it calls a DOZEN not-yet-split functions across four
    future layers (`renderTrackbar` — ui, `updateTrackGains` — audio,
    `sfPreloadForSong`/`gamePreloadForSong` — audio, `fitView` — render,
    `applyAudioDirs`/`updateSongMeta`/`keyLabelState`/`bakesTempo` —
    model/ui, plus `document.getElementById` reads, which are fine anywhere).
    No subset of those is close to landing this step. Left in app.js
    verbatim; everything it calls that DID move this step (`resolveNote`,
    `barTicks`, `applyChop`) is now imported back in, which is the normal,
    allowed direction (layer 5 importing layer 2).
  - The edits store (model/edits.js) split down the middle: `editsKey`/
    `isLocalDraft`/`overlayNoteSig`/`updateClearBtn` have zero calls into
    unsplit code and moved verbatim. `loadEdits`/`saveEdits`/
    `foldOldOverlay`/`retireOldOverlay`/`updateEditBtnVis` — the actual
    2026-10-02-regression code CLAUDE.md and this task both flag by name —
    each hit a real rule-5 blocker (`isComposition`, `scheduleAnalysisRecompute`,
    `saveDraft`, `computeSongEnd`, `updateSongMeta`, `draftRead`,
    `updateChipBtn`, `editableSong`, `ownFolderPath`, `originOf`, `LINK_SONGS`
    — provenance/audio/versions/gen, steps 6/8/9/10) and stayed, bodies
    untouched. Per this task's SAFETY instruction, no subset of the
    SAFETY-named functions (`saveEdits`/`loadEdits`/retired-overlay handling)
    was forced across a layer boundary just to get partial credit on "edits
    store" — the whole cohesive unit either moves clean or doesn't move at
    all. Every "local song: …" regression test (tests/night-roll.test.mjs,
    the exact 2026-10-02 coverage) passes unchanged because the code it
    exercises is byte-identical and in the same file it started in.
  - `estimateKey`/`checkKeyVsFile` (theory/key.js, step 4's leftover) — see
    the "Leftover from step 4" note above the Done paragraph: this is now
    understood to be a permanent structural block (layer 0 can never import
    layer 2), not a temporary one step 5 could clear. `keyNameToSf` (+
    `MODE_OFFSET`/`LETTER_SF`/`MODE_SF_OFFSET`) moved to `theory/key.js`
    instead — unrelated to the estimateKey blocker, but a real finding of
    its own: it's `deriveNoteTypes`'s (model/rollnotes.js) `key:`-directive
    parser calling into pure theory (name → signed-fifths, the inverse of
    `keyNameFor`, already in theory/key.js), a textbook same-direction,
    layer-appropriate import, not a misfiling.
- **A forward-reference ordering problem between `model/rollnotes.js` and
  `model/grid.js`, resolved by sequencing + one hand-fix, not a tool
  change.** `barTicks` (destined for rollnotes.js) calls `beatsPerBarEff`
  (destined for grid.js), and three of grid.js's own functions
  (`moveSnapTicks`, `gridAnchorTick`, `snapTickAbs`, `gridCellStart`) call
  `barTicks` right back — a genuine same-layer mutual dependency between two
  files neither of which exists until this step creates them. `move.mjs`
  only ever looks at the CURRENT state of its `--from`/`--to` files, so
  whichever move runs first writes an import pointing at wherever its
  free names currently live — `app.js`, correctly, at that moment. Moving
  `rollnotes.js` first (so `grid.js`'s later move could correctly resolve
  `barTicks` via app.js's own freshly-added back-import) left `rollnotes.js`
  itself with three imports reading `beatsPerBarEff`/`beatTicks`/
  `beatsPerBarDisp` from `../app.js` — true when written, false the instant
  the second move pulled those three into `grid.js`. Caught immediately by
  check.mjs (rule 1: those three names are no longer in app.js, so its
  free-identifier set wouldn't have them either — rather, the broken
  imports would have surfaced as a link-time "module has no export named …"
  the first time a test loaded `rollnotes.js`). Fixed by hand-editing the
  three import lines to `./grid.js` — an import-specifier-only change, the
  one kind of edit §0's "a move commit only moves code" rule explicitly
  allows, confirmed by diffing: zero bytes of any function body changed.
  A future step chaining two new same-layer modules with a mutual
  dependency should expect this and budget for the same manual fix-up,
  OR move the shared leaf dependency (here, effectively `beatsPerBarEff`/
  `barTicks`) in a single combined step first if the tooling grows a
  multi-destination mode — out of scope to build for this step.
- **`regen-e2e-footer.mjs` is not optional busywork — skipping it produced
  41 real rule-2 violations**, not a false alarm: app.js's generated
  `__nrExpose$` footer (written once at cutover, regenerated by every step
  since step 1's Deviations established the rule) still had `set` closures
  doing `name = v` for every one of this step's ~41 moved names, which are
  now imports, not local bindings — exactly the "stale footer" failure mode
  Deviations (1) predicted for "a future move.mjs carving a module out of
  app.js." Re-running it after all four `--to model/*` moves (and the one
  `--to theory/key.js` move) cleared every one of them in a single pass.

**6. `platform/*`** (base, mode, storage, folder, native, sw).
- Verify:
  - browser check: Settings → data location, open a local-folder song
  - iPad: open a file from Files (`nativeOpenHook`)
- **Done** (2026-10-03, Opus builder, worktree branch). Five `move.mjs
  --names` invocations over src/app.js, in dependency order (base → mode →
  native → storage → folder, so each later file could resolve a cross-import
  against an already-moved earlier one instead of app.js): `base.js` ←
  `setDocTitle,linkSongsBase,LINK_SONGS,linkRepoLabel,rememberLastSong,
  RECENT_KEY,RECENT_MAX,recentSongs,saveRecentSongsRaw,clearRecentSongs,
  MOVED_DIRS,movedPath,songPathFromURL,songShareURL,albumParamFromURL,
  PERF_FLAGS,PERF_NOSCENE` (17); `mode.js` ←
  `hasExistingNightRollPrefs,appMode,setAppMode,analysisAvailable` (4);
  `native.js` ← `nativeCall,audioSessionType` (2); `storage.js` ←
  `cfg,saveCfg,baseJoin,draftStoreKey,readBase,songsURL,analysisURL,nsfURL,
  repoName,repoApi,apiError,idbOpen,idbAudioPut,idbAudioGet,idbAudioDelete,
  idbAudioMove,idbSf2Put,idbSf2Get,idbNsfPut,idbNsfPutNow,idbNsfGet,
  idbDraftOp,idbDraftGet,idbDraftDelete,idbDraftMove,idbFsGet,idbFsPut,
  IMP_DIR,CONSOLE_OF,draftInIdb` (30); `folder.js` ←
  `fsRoot,folderActive,folderOnly,folderSupported,nativeFs,nativeDirHandle,
  folderPermission,fsDirFor,folderRead,folderWrite,folderDelete,fsReadJSON,
  restoreFolder,readData,bundledPath` (15). All five by name, not banner
  range — like step 4's chord/key clusters, the areas this step's table
  names (data-location config, local folder backend, Learning/Normal mode,
  perf experiments) are each scattered across 1-3 sections hundreds of
  lines apart, interleaved with settings-sheet/sync/publish UI code that
  stays; a `--range` over any one banner would have swept up blocked code
  right alongside the movable code in the same section (see Deviations (6)
  for the settings/sync cluster this surfaced inside the "local folder
  backend" banner specifically). No unresolved free identifiers from any
  of the five invocations. `regen-e2e-footer.mjs --file src/app.js` re-run;
  check.mjs clean except the pre-existing `oldBpb` finding;
  check-e2e-globals.mjs and check-controls.mjs clean (26 registered
  controls, unchanged — this step touched no control). devtools.js gained
  `platformBase`/`platformMode`/`platformStorage`/`platformFolder`/
  `platformNative` namespace imports (GET-only, same as every prior
  module). sw.js APP_MODULES gained all five files, SW_VERSION bumped
  nr-v11 → nr-v12; index.html's modulepreload list gained all five (after
  model/, before app.js — all layer 1, correctly ordered below model's
  layer 2 despite app.js importing both). `node tools/package.mjs --out
  /tmp/nr-dist-s6` packages all five with no package.mjs changes needed; 47
  runtime modules (unchanged from post-step-5 — no tools/-side runtime
  module corresponds to platform/). `tools/at.mjs`, `tools/span.mjs`,
  `tools/annotations.mjs` all re-verified against albums/starters/
  fur-elise.mid (never albums/compositions/); `tools/dump_notes.mjs`
  re-run over the whole albums/starters/ directory — `git diff --stat`
  against the four committed .notes.txt files came back empty (byte-
  identical). Tests, each under `perl -e 'alarm 300; exec @ARGV'`: modules
  33/33 (fileCount bumped 15 → 20, same mechanical bump every prior step
  made for its own new files), night-roll 417 (416 pass + 1 pre-existing
  skip — EVERY "local song: …" SAFETY-regression test passes unchanged,
  since none of that code moved a byte), gestures 17/17, controls 3/3
  (unchanged), bridge 10/10, pwa 3/3, package 3/3, nsf 20/23 (3
  pre-existing vault-only skips, same gap as every prior step), chip-worker
  31/31, migrate-rollnotes 9/9. A full `npm test` run surfaced 4 pre-
  existing failures in tests/ps2-real.test.mjs (Zophar PSF2-rip fixtures
  absent from this environment, `skip: !has(slug)` only short-circuits
  when the whole rip directory is missing, not when it's merely
  incomplete) — unrelated to this step: no moved name is referenced by
  tools/ps2/*.mjs or that test file, confirmed by grep. `npm run
  test:e2e:smoke` run once: 8/8 passed. See "Deviations (6)" below for
  what did NOT move and why — this step's table named several "big"
  targets (`nativeOpenUrl`/`nativeOpenHook`, `sfShownAt`, `scheduleBackupFlush`/
  `flushBackupNow`, the whole SAFETY-named draft/edit-persistence path, and
  the service-worker registration itself) that turned out to reach into
  UI-chrome (layer 4), audio (layer 3), or model (layer 2) — the same
  "big-name-stays, leaves-move" pattern every step since 4 has found, here
  concentrated because platform/ (layer 1) sits just one layer above the
  lowest tier, so almost anything still UI-entangled is permanently out of
  reach for it, not just "not yet split."

**7. `audio/engine.js`, `audio/voices.js`, `audio/transport.js`**, plus the `prof()` fix (§2.4).
- Must not change: one byte of the engine. This is the iPad audio known-good engine, f733b42 + 8e1c72d.
- Verify:
  - vm transport tests
  - **iPad ear check: Josh plays a synth song, an SF2-voiced song, a game-voice song, and taps a note preview**
- If the iPad goes mute, revert the step first and then move again one module at a time.
- **Done** (2026-10-03, Opus builder, worktree branch). Three `move.mjs
  --names` invocations over src/app.js: `engine.js` ←
  `trackAudible,MASTER_VOL,warmContext,clockAlive,clockProbeText,
  gestureActive,openMaster,trackGain,trackVol,trackPan,updateTrackGains,
  dutyWave,makeOsc,pluckBuffer,pieceState,pieceAudible,drumNoise,
  drumNoiseBuf,DRUM_LONG_SEC,DRUM_SUSTAIN_CAP_SEC,drumHit`; `voices.js` ←
  `voiceType,trackVoice,SF_VOICES,sfPick,VOICE_GROUPS,VOICES,VOICE_AMP,
  SF_NOTE_NAMES,sfNoteName,sfFileFor,sfBank,sfEnsure,sfDecode,sfDecodeCtx,
  playSynthVoice,gameVoiceVault,parseGameVoice,parseSf2Voice,sf2VoiceId,
  gameVoiceId`; `transport.js` ←
  `audioStopSrcs,currentLoop,albumNextIdx,albumPrevIdx,albumEndSec,
  ALBUM_PASSES,ALBUM_CAP_SEC,ALBUM_FADE,ALBUM_MAX_FAILS` — all by name, not
  banner range, for the same reason steps 4-6 gave: the "audio (NES-ish
  voices)"/"game instrument voices" banners each run hundreds of lines
  through UI/chip/model code that stays. `regen-e2e-footer.mjs --file
  src/app.js` re-run; check.mjs clean except the pre-existing `oldBpb`
  finding; check-e2e-globals.mjs and check-controls.mjs clean (26 controls,
  unchanged). devtools.js gained `audioEngine`/`audioVoices`/
  `audioTransport` namespace imports (GET-only). sw.js APP_MODULES gained
  all three, SW_VERSION bumped nr-v12 → nr-v13; index.html's modulepreload
  list gained all three (after platform/, before app.js — all layer 3).
  `node tools/package.mjs --out /tmp/nr-dist-s7`: 47 runtime modules
  (unchanged — no tools/-side runtime module corresponds to audio/). Tests
  under `perl -e 'alarm N; exec @ARGV'`: modules 33/33 (fileCount 20→23),
  night-roll 418 (417 pass + 1 pre-existing skip), gestures 17/17, controls
  3/3, bridge 10/10, pwa 3/3, package 3/3, chip-worker 31/31, psx-stream
  9/9, sounding 12/12, nsf 20/23 (3 pre-existing vault-only skips),
  migrate-rollnotes 9/9 — all unchanged from pre-step-7 baselines.
  `npm run test:e2e:smoke` run once: 8/8 passed. **Byte-identity check**
  (tools/split/scope.mjs-based AST diff, source text of every function
  node, before vs. after): all 21 engine.js functions/consts, all 20
  voices.js functions/consts, all 9 transport.js functions/consts, AND the
  6 functions that did NOT move (`ensureAudio`, `resumeAudio`,
  `rebuildAudio`, `previewNote`, `play`, `stop`) plus the top-level
  `visibilitychange` listener and the `pointerdown` "warm" listener —
  every single one diffs empty against the pre-step app.js. See
  "Deviations (7)" for what did NOT move and why, and for the `?perf`
  profiler fix's own writeup.

## Deviations (7, 2026-10-03)

- **This step hit the sharpest version yet of the "named target stays, pure
  leaves move" pattern** — AUDIO IS FRAGILE (this task's own SAFETY
  instruction, echoing the iPad known-good-engine rule) meant every
  candidate was checked for free-identifier blockers individually, same
  discipline as steps 4-6, with an explicit extra rule this step's task
  added on top: a blocker is never "fixed" by restructuring the blocked
  function — it stays, bit-for-bit, full stop.
  - **`ensureAudio`/`resumeAudio`/`rebuildAudio` — this step's own named
    targets for engine.js — did NOT move**, and this is a NEW, PERMANENT
    kind of blocker, not a "not yet split" one: all three call
    `logDebug`/`logErr`/`setInfo`, and `logErr`/`logDebug` both resolve to
    `errChip()` (`document.getElementById`/`askSeenMax()` — UI-chrome,
    layer 4, forever). Every prior step's blocked headline function
    (`estimateKey`, `finalizeNotes`, `initCatalog`, `saveEdits`, `play`,
    …) was blocked by code that WILL eventually land at layer ≤3 once its
    own step runs; logging/status reporting never will — it is
    structurally a UI concern (writing to the error chip, the message
    sheet) in every app this split plan's layer table describes. The
    precedent is step 6's `idbDraftPut` ("the ONE member... that calls
    logErr... so it alone stays") — scaled up here to three of this
    step's six named functions at once. `clockAlive`/`clockProbeText`/
    `gestureActive`/`warmContext`/`openMaster` (no logging calls in any of
    them) moved clean; `ensureAudio`/`resumeAudio`/`rebuildAudio` import
    them back from `audio/engine.js`, a plain downward import, no behavior
    change.
  - **`scheduleNote`/`previewNote` — this step's two named targets for
    voices.js — did NOT move**, for the chip-audio equivalent of the same
    reason: both read `chip`/`chipActive()`/`chipHas()` directly (`chip`
    is `audio/chip.js`'s own future state, step 8, still bare in app.js
    today), a straight rule-5 LEGACY_CONTAINER import exactly like
    `estimateKey`'s `trackIsDrums` dependency in step 4 — except this one
    will resolve itself the moment step 8 lands `chip.js` (unlike
    `ensureAudio`'s blocker, this one genuinely IS "not yet split").
    Flagged as a QUEUED note in open-items.md: step 8 should retry
    `move.mjs --names scheduleNote,previewNote --to audio/voices.js` once
    `chip`/`chipActive`/`chipHas`/`chipPreviewBuffer`/`chipNoteSlice` exist
    in `audio/chip.js` (same layer, same file family — a legal import at
    that point). `playSynthVoice` — the actual oscillator/sample renderer
    `scheduleNote` calls on every non-chip, non-game-voice note — has NO
    such dependency and moved clean; `scheduleNote` (staying) imports it
    back.
  - **`play`/`stop`/the whole play-gate/album-orchestration system — this
    step's largest named content for transport.js — did NOT move, almost
    entirely.** `play()` alone touches `chip.*` (rendering/resolving/fail/
    stream/key), `stretchEnsureAll`/clip scheduling (audio/clips.js, step
    8), `met.*` (metronome, step 8), `document.getElementById`/`setInfo`/
    `setPlayBtn`-adjacent calls, `playbackFrame`/`draw` (render, step 11),
    and `scheduleNote` itself (staying, above) — more blockers in one
    function than any previous step's single headline target. `stop()`,
    `playGate()`/`playGateKick()`/`playGateTick()`/`playGateActive()`/
    `playGateWait()` (all read `chip.rendering`/`chip.progress`/
    `chip.resolving` directly), and the whole album system
    (`albumStart`/`albumPlayIdx`/`albumNext`/`albumPrev`/`albumAdvance`/
    `albumLeave`/`albumStrip`/`albumClear`/`armAlbumLink`/`albumPos`, all
    needing `document.getElementById`, `loadSong`, `S.CATALOG`/
    `albumEffectiveOrder`, or `chip.*`) are blocked the same way. What
    moved: `currentLoop` (the loop-segment math `play()` calls — pure,
    `S` + `tickToSec` only), `audioStopSrcs` (the clip-source stopper
    `stop()` calls — pure, `S.audioSrcs` only), and the album-math leaves
    `albumNextIdx`/`albumPrevIdx`/`albumEndSec` + their constants
    (`ALBUM_PASSES`/`ALBUM_CAP_SEC`/`ALBUM_FADE`/`ALBUM_MAX_FAILS`) — none
    of these five have a single blocked dependency, and nothing REQUIRED
    moving them (no mover target calls them), but they are genuinely,
    unambiguously transport/album content with zero risk, so they moved
    rather than being left stranded next to code that can't follow them
    yet. `audio/transport.js` is, by a wide margin, the thinnest of this
    step's three files — an honest reflection of how much of "the
    transport" is actually chip/clip/UI/model orchestration wearing a
    transport-shaped name, not transport logic itself. Queued in
    open-items.md for steps 8/9/11/14 to retry once chip.js/clips.js/
    metronome.js/model(song,catalog)/render/ui-chrome exist.
  - **`gameVoiceVault`/`parseGameVoice`/`parseSf2Voice`/`sf2VoiceId`/
    `gameVoiceId` moved despite having no caller among this step's own
    moved code** — same shape as step 4's unlisted spelling-table
    constants and step 6's `draftInIdb`: they're pure, self-contained, and
    they ARE the "game voices" content the plan's responsibility line
    names once the bulk of actual game-voice machinery (preload, caching,
    the picker UI) is excluded as blocked (see above) — moving them isn't
    required by anything, but leaving genuinely clean, on-topic leaf code
    behind for no structural reason would be the same over-caution
    CLAUDE.md's "no one-time hacks" principle warns against in the
    opposite direction. Their callers (`gameVoicesInSong`,
    `sf2VoicesInSong`, `gameVoiceWarn`, `gameVoiceLabel`/`sf2VoiceLabel`,
    `buildGameVoicePicker`/`buildSf2VoicePicker`, `resolveVoiceInstrument`)
    all stay in app.js and import them back.
  - **`pieceState`/`pieceAudible` moved with `drumHit`, unlisted by the
    plan's table**: `drumHit` calls `pieceAudible` (the solo/mute audition
    gate) on every call, and `pieceAudible` reads `pieceState` — both
    pure (a `Map` + a predicate over it), no DOM, no `chip`. app.js's
    render code (the roll ruler's gutter-label color) and its click
    handler (the tap-to-solo/mute cycle) now import both back from
    `audio/engine.js` — a plain downward import, zero behavior change.
  - **`trackAudible` moved alongside `trackGain`, unlisted by the plan's
    table**: `trackGain`'s gain-node setup reads `trackAudible(ti)` (mute/
    solo) directly; it's pure (`S.trackState` only) and has ~10 other call
    sites across app.js (render, note-dump tools, the debug log), all of
    which now import it back from `audio/engine.js`.
  - **`fileMeterAt`-style near-miss, this step's version: `gameNoteBucket`/
    `resolveVoiceInstrument`/`gameLibSync`/`sf2Sync`/`gameNoteCache` were
    checked and left behind on purpose**, not merely forgotten: they're
    pure-ish (no `chip`, no logging), but their only caller
    (`scheduleGameNote`) calls `gameVoiceWarn` → `setInfo` (UI-chrome) and
    stays blocked regardless, so nothing in this step's actual move set
    needs them. Moving orphaned pure leaves with no mover-side caller, on
    the theory that they might be useful later, is exactly the kind of
    speculative widening step 0a's own Deviations warned against for
    `browser-globals.txt` ("a seed, not an audit") — left for whichever
    step (8) actually lands `scheduleGameNote`'s blockers.
- **The `?perf=1` self-profiler fix (§2.4) — the one change this step made
  that is NOT a verbatim move, because the plan itself asks for a fix, not
  a move.** `wrap()` patched `globalThis[name]` for a fixed 29-name list (28
  distinct across the block's two `setTimeout` passes, not the plan's
  estimated 25 — same "the plan's count undercounted" shape as step 1's
  ~203-vs-257 `let`s); this had been silently producing EMPTY attribution
  since the moment the first name on that list (`secToTick`) left the inline
  script in step 3 — a module's top-level binding is not a `globalThis`
  property, so `wrap()`'s own `typeof globalThis[name] === "function"` check
  quietly failed closed, no error, ever since. Fixed at the root: each
  profiled function now wraps ITSELF at its own definition
  (`name = prof("name", name);`, immediately after the declaration),
  wherever that declaration currently lives — 26 still in app.js, plus
  `secToTick` (midi/parse.js, already moved in step 3) and `drumHit`/
  `updateTrackGains` (audio/engine.js, moved THIS step). `prof`, its gate,
  and the accumulators it reads/writes (`S.perfAcct`/`S.perfTotal`/
  `S.perfRec`, replacing the old closure locals `acct`/`total`/`rec`) live
  in **`state.js`, not `platform/base.js`** (where `PERF_FLAGS` already
  is) — a deliberate, load-bearing choice: `prof` must be callable from
  EVERY layer, including layer 0 itself (`midi/parse.js`'s `secToTick`),
  and a layer-0 module may only import layer 0 (rule 5) — `platform/` is
  layer 1, so a `prof` living there would make `midi/parse.js` (layer 0)
  import a higher layer the instant `secToTick` needed it, the identical
  shape of violation steps 4/5 found for `theory/key.js`/`estimateKey`.
  `state.js` has no imports and is the one file every layer may reach, so
  `prof`'s own `?perf` gate re-implements PERF_FLAGS's hand-rolled
  query-string parse rather than importing it — a small, deliberate
  duplication (the vm-sandbox-safety shape PERF_FLAGS's own comment already
  uses), not a missed shared-code opportunity. The HUD panel/report/record
  button (still in app.js, DOM-heavy, not audio) now reads/writes
  `S.perfAcct`/`S.perfTotal`/`S.perfRec` instead of its own closure
  locals — `acct`/`total` are aliased to the `S` objects they're mutated
  in place (identity-preserving, no further rewrite needed); `rec` is
  REASSIGNED (`= null`, `= {...}`), so every reference became `S.perfRec`
  (65 occurrences), including inside the one block that's still broken
  (see below) — a plain rename, confirmed by `node --check` + re-running
  every test this step's "Musts" list names. **The second, separate
  `globalThis`-patching wrapper (the "mark the timeline on an edit" pass
  over `saveEdits`/`selEditApply`/`insertTime`, immediately below the first
  in the same guarded block) was NOT fixed** — it's a different
  instrumentation (pushing an EDIT marker string into
  `S.perfRec.marks`, not timing), the plan's §2.4 names only "replace
  `wrap()` with `prof(name, fn)` wrappers", and inventing a second generic
  mechanism this step's task didn't ask for would be exactly the kind of
  unrequested "fix" the SAFETY instructions warn against. It remains
  silently broken, same as it's been since step 3 — queued in
  open-items.md, not fixed here.

**8. `audio/chip.js`, `chip-stream.js`, `clips.js`, `metronome.js`, `bounce.js`.**
- Verify:
  - chip-worker and psx-stream tests
  - **iPad ear check: a chip song (NES + one streamed console song), an audio-clip song at 0.5× (WSOLA worker), the metronome, and Download audio**
- **Done** (2026-10-03, Sonnet builder, worktree branch). Six `move.mjs
  --names` invocations over src/app.js, all by name (every one of this
  step's five target areas sits in a region laced with UI/import/model
  calls, the same "a banner's own span runs hundreds of lines past the
  movable content" shape steps 4-7 each found — a `--range` on any of the
  five banners here would have swept in the still-blocked `CHIPS` table,
  the play-gate cluster, or `play`/`stop` themselves). Order mattered:
  `playSec` moved into the EXISTING `audio/transport.js` first (step 7's
  file, untouched otherwise), because both `chip-stream.js`'s
  `chipStreamPump` and `metronome.js`'s `metPumpFollow` needed it and it
  was still bare in app.js — an unlisted, zero-risk pure leaf (`S` only),
  not named by any step's table, moved purely to unblock two OTHER files'
  real content.
  - `audio/chip.js` ← `chip,chipTrackNo,albumMetaCache,albumMetaFor,
    ghHeaders,vaultFetch,chipAlbumHasSource,CHIP_BUDGET_APP,CHIP_BUDGET_WEB,
    CHIP_RATE_STEPS,chipRenderBudget,planChipRender,chipStaticPan,
    chipDownmixStatic,chipSilent,chipIsPcm,CHIP_STREAMED_RENDER_CHUNK_SEC,
    chipRenderStreamed,chipWorkerAvailable,chipPreviewPending,
    chipPreviewCache,chipPreviewProgAt,chipPreviewBuffer,chipActive,
    chipHas,chipBuffers,chipPcmToBuffers,chipStopSrcs,chipStart` (29 names).
  - `audio/chip-stream.js` ← `chipStreamMode,chipAutoShouldStream,
    chipAutoReason,CHIP_STREAM_CHUNK_SEC,CHIP_STREAM_OVERLAP,
    CHIP_STREAM_HORIZON_VISIBLE,CHIP_STREAM_HORIZON_HIDDEN,
    CHIP_STREAM_PIN_LOOKAHEAD,CHIP_SEG_HORIZON_SEC,CHIP_SEG_MAX_SEGMENTS,
    chipSegments,chipStreamIdxForTapeSec,chipStreamOnChunk,
    chipStreamOnSilent,chipStreamRequestRange,chipStreamWaitFor,
    chipStreamPinLoopStart,chipStreamEvict,chipStreamScheduled,
    chipStreamScheduleChunk,chipNoteSlice,chipStreamPump,chipStreamStart`
    (23 names).
  - `audio/clips.js` ← `audioBufCache,PEAK_BUCKET,audioDirFor,
    audioCacheKey,songHasAudio,clipLen,clipEndTick,clipClamp,forEachClip,
    audioBytesFor,decodeAudioBytes,peaksOf,clipOnsetSec,tempoFromPeaks,
    onsetCurve,beatTrack,clipBeatMap,clipTempo,audioReady,wsolaStretch,
    stretchJobs,stretchInWorker,stretchCache,keepPitch,stretchKey,
    stretchPending` (26 names).
  - `audio/metronome.js` ← `met,metSave,metDefaultAccents,metBuildCells,
    metClick,metFollowBeatTicks,metFollowNum,metPumpFollow,metPump,
    ensureMetGain,metHalt,applyMetMode` (12 names).
  - `audio/bounce.js` ← `wavEncode,audioBufferToWav,midiBase64,
    deliverAudioFile` (4 names).

  Every invocation reported zero unresolved free identifiers.
  `regen-e2e-footer.mjs --file src/app.js` re-run; `check.mjs` clean except
  the pre-existing `oldBpb` finding (Q6); `check-e2e-globals.mjs` and
  `check-controls.mjs` clean (26 controls, unchanged — this step touched
  no control). devtools.js gained `audioChip`/`audioChipStream`/
  `audioClips`/`audioMetronome`/`audioBounce` namespace imports (GET-only).
  sw.js APP_MODULES gained all five files, SW_VERSION bumped nr-v13 →
  nr-v14; index.html's modulepreload list gained all five (after
  audio/transport.js, before app.js — all layer 3). `node
  tools/package.mjs --out /tmp/nr-dist-s8`: 47 runtime modules, unchanged
  from post-step-7 (no tools/-side runtime module corresponds to audio/).
  Tests, each under `perl -e 'alarm 240; exec @ARGV'`: night-roll 427
  (426 pass + 1 pre-existing vault-only skip — every "local song: …"
  SAFETY-regression test passes unchanged, since none of that code
  moved), modules 33/33
  (fileCount assertion bumped 23 → 28, the usual mechanical bump — see
  "Deviations (8)" for the one test-file edit this step made), gestures
  21/21, controls 3/3, pwa 3/3, package 3/3, nsf 20/23 (3 pre-existing
  vault-only skips, same gap as every prior step), chip-worker 31/31,
  bridge 10/10, migrate-rollnotes 9/9, psx-render 7/7, spc-render 5/5,
  instruments-export 4/4, sounding 8/8. `npm run test:e2e:smoke` run once:
  8/8 passed. See "Deviations (8)" below for everything that did NOT move
  and why — this step hit the sharpest version yet of the "one blocked
  table/function sinks the whole headline feature" pattern (`CHIPS`'s
  single `logErr` diagnostic call blocks `chipRender` itself, the actual
  "authentic chip render" entry point) — and for the two prior steps'
  QUEUED assumptions this step corrected (`initCatalog`/`albumMetaFor`,
  `scheduleNote`/`previewNote`).

## Deviations (8, 2026-10-03)

- **`CHIPS` — the single biggest finding this step made.** The per-console
  table (magic-byte sniff + parse/run/render/stream hooks, one entry per
  nsf/gbs/spc/vgm/psf/psf2/usf) is ENTIRELY pure data/closures except for
  ONE line: `CHIPS.usf.capture`'s own diagnostic
  (`if (typeof logErr === "function") logErr(line);`, a Mario-64-scrambling
  debug aid from 2026-09-27). That one guarded call — inside one chip
  kind's capture closure, never exercised by rendering — blocks the whole
  object (and `sonySeqCapture`/`psfInflater`/`PSX_SOUNDING_ON`, which sit
  beside it and share its only real external reference) from moving to
  `audio/chip.js`, the same "one `logErr` call sinks an otherwise-clean
  family" shape step 6 found for `idbDraftPut` — except this time the
  casualty is bigger: `chipEstimateTracks`, `chipRender` (the actual
  "authentic chip render" entry point this step's own name promises),
  `chipPublish`, `chipRenderInWorker`, and `chipCleanupAfterFailure` all
  read `CHIPS[kind]` directly and so stay blocked right along with it, as
  does `chipStreamOpenWorker`/`chipStreamOpen` in chip-stream.js. Splitting
  `CHIPS` by hand (moving only its `.render`/`.renderRate`/`.stream` fields,
  leaving `.parse`/`.run`/`.capture`/`.files` behind for import/capture.js,
  step 9) would be a structural edit a verbatim move must not make — not a
  byte-identical move of one name, but a rewrite of the table's own shape.
  All five stay bit-for-bit in app.js; every one of chip.js's/
  chip-stream.js's genuinely pure leaves (the memory-budget math, the
  live-playback surface, the preview cache, the stream-session bookkeeping)
  moved clean regardless, and now import back into app.js the same way
  every prior step's blocked headline function did. Queued in
  open-items.md for whichever step (9, when `import/capture.js` exists and
  can hold `CHIPS`'s import-side fields, or a dedicated pass that fully
  separates the table into a render-side and an import-side half) next
  considers this.
- **`isCaptureKey` was checked and deliberately left in app.js, NOT moved,
  even though its only blocker (`albumMetaCache`) moved to chip.js this
  step and nothing else stood in its way.** `isCaptureKey`'s other caller,
  `ownFolderPath`, is itself slated for `model/provenance.js` (layer 2,
  step 9) by the plan's own table. Moving `isCaptureKey` into `audio/chip.js`
  (layer 3) would have let `chipSource` move clean today, but would
  permanently deadlock `ownFolderPath` the moment it lands at layer 2 — a
  layer-2 module can never import a layer-3 one, the identical shape of
  mistake `estimateKey`/`theory/key.js` made (and had to live with) in
  steps 4-5. `ghHeaders` (also moved into chip.js this step, for
  `vaultFetch`) was checked against the SAME risk and cleared it: its other
  callers (`putRollnotes`/`markPublished`/`writeToken`, sync/publish.js,
  step 9) are layer 4, which may legally import layer 3. `chipSource`
  itself therefore stays in app.js, blocked by `isCaptureKey` alone,
  importing `chipTrackNo`/`albumMetaFor`/`vaultFetch`/`idbNsfGet`/
  `idbNsfPut` back from chip.js/platform/storage.js otherwise unchanged.
- **`scheduleNote`/`previewNote` (open-items.md's QUEUED retry from step 7)
  still did NOT move, and the reason is NOT the one the queued note named.**
  Landing `chip`/`chipActive`/`chipHas`/`chipPreviewBuffer`/`chipNoteSlice`
  in chip.js/chip-stream.js this step DID clear that original blocker
  exactly as predicted — but a free-identifier re-check surfaced a second,
  independent one the queued note hadn't anticipated: `scheduleNote`'s
  `n._clip` branch calls `scheduleClip` (audio/clips.js territory, this
  step), and `scheduleClip` itself stays in app.js (see the `audio/clips.js`
  finding below). `previewNote` falls through to `scheduleNote` as its
  non-chip-register fallback, so it inherits the block one level removed.
  Corrected in open-items.md and NIGHT-ROLL.md's `audio/voices.js` entry —
  the same "earlier step's assumption about what unblocks X was itself
  wrong, here's the real constraint" correction step 5 made for step 4's
  `estimateKey` note.
- **`scheduleClip`/`stretchEnsure`/`stretchEnsureAll`/`audioChaseNow`/
  `applyAudioDirs`/`audioEnsureFile`/`applyBeatMap`/`setSongTempo` — the
  functions that actually APPLY a decoded/stretched clip to the live
  song — did NOT move, despite `audio/clips.js` being this step's own
  target file.** `stretchEnsure`'s blocker is a single `draw()` call at the
  very end of its stretch-worker `.then()` callback (render, layer 3-ish
  but still entirely in app.js, step 11) — everything else in that
  function (`stretchKey`/`stretchCache`/`stretchInWorker`/`audioCacheKey`)
  is already pure and already moved. `scheduleClip` calls `stretchEnsure`
  directly, so it inherits the block; `audioChaseNow` calls `scheduleClip`,
  same inheritance. `applyAudioDirs`/`audioEnsureFile`/`applyBeatMap`/
  `setSongTempo` each separately need `isComposition`/`isLocalDraft`/
  `ownFolderPath`/`addTrackUndoable`/`computeSongEnd`/`finalizeNotes`/
  `playGateKick`/`draw`/`stop`/`play`/`setInfo` — provenance/model/UI/
  transport, none yet split. What moved instead is everything genuinely
  pure underneath these: the file/peak cache, the decode path, the tempo-
  from-a-take math (`tempoFromPeaks`/`onsetCurve`/`beatTrack`/
  `clipBeatMap`/`clipTempo`/`clipOnsetSec` — none of these read anything
  but a clip's own `.peaks`/`.buffer`/`.dur`/`.offset`), and the WSOLA
  algorithm itself (`wsolaStretch`, still `SERIALIZED` per rule 7 — moving
  which file defines it changes nothing about its own self-containment
  check) plus its worker plumbing. Every "WSOLA at 0.5×" ear check Josh
  runs still exercises byte-identical code, now split across two files
  instead of one.
- **`buildSchedule` was checked and found genuinely clean (pure `S` +
  `clipLen`/`tickToSec`) but was deliberately NOT moved.** It's not named
  by this step's table, moving it wouldn't have unblocked any of this
  step's actual blocked functions (`renderSongOffline`/`scheduleNote`/
  `scheduleClip` are each blocked by OTHER calls too — `stop()`/
  `scheduleClip`/`stretchEnsure` respectively — so `buildSchedule` moving
  alone buys nothing), and it belongs more to `audio/transport.js` (step
  7's file, the scheduler) than to any of this step's five targets —
  touching a different step's already-"Done" file for a dependency that
  wouldn't even pay for itself felt like scope creep in the wrong
  direction. Left in app.js for whichever step (9/11/14, once `play()`'s
  OWN blockers clear) actually needs to move it.
- **`metStart` (the metronome's own ▶ handler) did NOT move, despite
  `metHalt` — its exact mirror-image Stop handler — moving clean.**
  `metStart` calls `ensureAudio()`/`resumeAudio()` directly; both are the
  SAME permanently-blocked pair step 7 found for `audio/engine.js`
  (`logDebug`/`logErr`/`setInfo` inside each, `logErr`/`logDebug` both
  resolving to UI-chrome's `errChip()`) — not "not yet split," permanent,
  per step 7's own finding. `metHalt` has no such call (`audioSessionType`
  is already platform/native.js, layer 1). All 13 of the metronome panel's
  `addEventListener` wiring statements, plus the `#metnum`-populating IIFE,
  stayed in app.js as one block rather than being split by which handler
  happens to be movable (`#metbtn`/`#metgo` call the still-blocked
  `metStart`; the other 11 don't) — a partial-wiring move would have left
  near-identical-looking statements in two different files for no
  structural reason, which is its own kind of confusion.
- **`initCatalog` (open-items.md's QUEUED retry from step 5/6) still did
  NOT move, and — unlike `scheduleNote`/`previewNote` above — this is now
  understood to be a PERMANENT structural block, not a temporary one.**
  `albumMetaFor` landed in `audio/chip.js` this step exactly as the queued
  note asked, clearing `initCatalog`'s last NAMED blocker — but
  `model/catalog.js` is layer 2 and `audio/chip.js` is layer 3, and a
  layer-2 module may only import layer 2 or lower, forever, the identical
  shape of deadlock step 5 found for `estimateKey`/`theory/key.js` (layer 0
  importing layer 2) and corrected in its own QUEUED note. The earlier
  open-items.md entry assumed landing `albumMetaFor` anywhere would clear
  this; it doesn't — `initCatalog` can only ever move if `albumMetaFor`
  itself moves to a layer ≤2 module instead (a real option, since
  `albumMetaFor` has no blocker of its own — it was placed in chip.js this
  step because chip.js's OWN callers, `chipSource`/`chipAlbumHasSource`,
  needed it there, not because layer 2 was unreachable for it) — OR
  `initCatalog` itself moves to a layer ≥3 module, losing the "album/group
  lookups" cohesion with the rest of `model/catalog.js`. Corrected in
  open-items.md, same shape as step 5's correction of step 4's
  `estimateKey` note.
- **The `tests/modules.test.mjs` `fileCount` assertion needed a one-line
  edit** (23 → 28, plus the file-list string and the test's own title,
  `post-step-7` → `post-step-8`) — the same mechanical bump every step
  since step 3 has made for its own new files; not a logic change, just
  keeping the hard-coded expectation in step with `checkSrc()`'s real
  count.

**9. `model/song.js`, `selection.js`, `provenance.js`, `album-order.js`, `versions.js`, `jobs.js`; `import/*`; `sync/publish.js`.**
- Verify:
  - browser: Save As, versions sheet, an NSF import into a scratch composition (never Josh's songs), publish to a scratch path
- **Done** (2026-10-03, Sonnet builder, worktree branch). This step hit the
  "named target stays, pure leaves move" pattern harder than any step before
  it — of this step's own seven headline names (`loadSong`, `setSong`,
  `computeSongEnd`, `selEditApply`, `nudgeSelection`, `saveSongAs`,
  `saveDraft`/`publishSong`), only `editableSong` actually moved; every other
  one reaches `draw()`/`setInfo()`/`buildScoreModel()`/`finalizeNotes()`/
  `saveEdits()`/UI-button updates, none yet split (render step 11, ui/chrome
  step 14). What moved instead, by `move.mjs --names` (never `--range` — same
  reason as every step since 4: these areas are each laced hundreds of lines
  through UI/render/model-edits code a `--range` would sweep up alongside):
  - **Correction to step 8's `audio/chip.js` placement, first** (`move.mjs
    --from src/audio/chip.js --to src/model/provenance.js --names
    albumMetaCache,albumMetaFor`): step 8 put these in chip.js because
    chip.js's OWN callers (`chipSource`/`chipAlbumHasSource`) needed them
    there, flagging the risk explicitly ("isCaptureKey... stays in app.js,
    NOT moved, even though nothing else stood in its way" — its other
    caller `ownFolderPath` was slated for `model/provenance.js`, layer 2,
    which can never import chip.js's layer 3). Relocating `albumMetaCache`/
    `albumMetaFor` to `model/provenance.js` — itself a verbatim move, not a
    logic change — resolves that fork at the root: `audio/chip.js` (layer 3)
    now imports them back down from `model/provenance.js` (layer 2), legal
    in that direction, and BOTH `isCaptureKey` and the step-8/5 `initCatalog`
    deadlock clear at once (below). `chipAlbumHasSource` needed no change —
    it only called `albumMetaFor`, now an ordinary cross-file call.
  - `model/provenance.js` (new) ← `albumMetaCache`, `albumMetaFor` (from
    chip.js, above), then 27 names from app.js by `--names`: `NR_DIR`,
    `COMP_DIR`, `PROVENANCE_RE`, `READONLY_DIRS`, `isCaptureKey`,
    `ownFolderPath`, `isComposition`, `bakesTempo`, `hasProvenanceNote`,
    `originOf`, `pendingOriginKey`, `setOrigin`, `pendingOrigin`,
    `originFor`, `RULES`, `rulesFor`, `canEditMusic`, `bakesMeter`,
    `COMP_ALBUMS`, `albumTitleFor`, `slugify`, `untitledKey`, `isUnsaved`,
    `RESERVED_FOLDERS`, `folderFromInput`, `chosenFolder`, `isCompositionKey`
    (the last unlisted by the plan — `publishSong`'s own "is this song mine,
    for a key that isn't open" predicate, the natural twin of `isComposition`
    and blocker-free: `ownFolderPath` + `draftStoreKey`). Every one of these
    checked clean against `albumMetaCache`/`albumMetaFor`/`draftStoreKey`
    (platform, layer ≤1) — the whole "one origin per song, one rule table"
    P1 machinery (docs/provenance-plan.md) is now real layer-2 code.
    **`saveSongAs`/`renameLocalKeys`/`openSaveForm` did NOT move** — all
    three reach `finalizeNotes`/`draw`/`setInfo`/`updateSongBtn`/
    `updateEditBtnVis`, none yet split; `saveSongAs` additionally calls
    `finalizeNotes()` directly. They stay in app.js, now importing
    `isUnsaved`/`slugify`/`folderTitle`/`renameLocalKeys`'s own needs back
    from provenance.js/catalog.js unchanged.
  - `model/catalog.js` (existing, step 5) gained `initCatalog` AND
    `folderScanAlbums` — **both of step 5/6/8's own permanently-blocked
    findings, cleared by the chip.js correction above, not by this step
    re-trying the same thing twice.** `initCatalog`'s last blocker
    (`albumMetaFor`, layer 3 in chip.js per step 8) is now layer 2; its
    other three names (`folderOnly`/`songsURL`/`folderScanAlbums`) were
    already platform-or-lower. But moving `folderScanAlbums` itself (step
    6's own "Not moved" list: blocked by `albumTitleFor`, "still app.js" at
    the time) surfaced ONE more self-import bug from `move.mjs` (below) —
    `albumTitleFor` is model/provenance.js now, same layer 2 as catalog.js,
    so `folderScanAlbums` moved clean too, into `model/catalog.js` rather
    than `platform/folder.js` (its step-6-table destination): landing it in
    platform (layer 1) would need an UPWARD import of `albumTitleFor`
    (layer 2) the instant it moved, the identical shape of mistake
    `estimateKey`/`theory/key.js` made in steps 4-5 — `model/catalog.js`,
    already `folderOnly`'s/`initCatalog`'s own layer, is the only legal
    home now that `albumTitleFor` sits in provenance.js. Both functions
    import each other's needs down from platform/*/provenance.js exactly as
    step 5/6/8's "Done" notes already described for everything ELSE in
    those files; nothing about `initCatalog`'s or `folderScanAlbums`' own
    BODY changed.
  - **`estimateKey`/`checkKeyVsFile` placement, resolved** (open-items.md's
    "cannot move to theory/key.js, ever" note, steps 4-5): `theory/key.js`
    is layer 0 and can never import `trackIsDrums`(`model/grid.js`)/
    `barTicks`(`model/rollnotes.js`), both genuinely layer 2 — permanent,
    not "not yet split". With `model/song.js` now existing, `estimateKey`
    (+ its own `keyEstimateSig` cache-signature helper and the Krumhansl-
    Schmuckler profile tables `KS_MAJOR_PROFILE`/`KS_MINOR_PROFILE`) and
    `checkKeyVsFile` (+ `tonicPcFromName`) moved there instead by `move.mjs
    --names` — layer 2 importing `trackIsDrums`/`barTicks` (layer 2, same
    tier) and `pearsonCorr`/`keyNameFor`/`fileKeyAt`/`TONIC_SPELL`
    (theory/key.js, layer 0)/`SF_MAJOR` (theory/chords.js, layer 0) is
    legal in every direction. `fileMeterAt` — textually adjacent, looking
    like `fileKeyAt`'s meter-side twin — was checked again and still left
    alone: it has its own UI callers and nothing in `model/song.js` needs
    it, the identical finding step 4 made. Every "estimateKey is never
    called in Learning" spy test still passes unchanged — the gating
    itself never moved and nothing about either function's body changed a
    byte; `theory/key.js` is simply no longer their home.
  - `model/song.js` (new) ← `editableSong` (clean: `LINK_SONGS` + `canEditMusic`,
    both ≤ layer 2), then the `estimateKey`/`checkKeyVsFile` cluster above.
    **`loadSong`/`loadSongInner`/`setSong`/`computeSongEnd` — this step's
    four biggest named targets — did NOT move; not one of the four has a
    clean path.** `loadSong`/`loadSongInner`/`setSong` are each saturated
    with `stop()`/`play()`/`setInfo()`/`fitView()`/`renderTrackbar()`/
    `updateEditBtnVis()`/`buildScoreModel()`/`clampView()`/`draw()`/
    `askModeButtons()`/`askRender()` — audio/render/ui/ask, none yet split,
    more blockers in three functions than any previous step's single
    headline target. `computeSongEnd` has exactly one: `clipEndTick`
    (`audio/clips.js`, layer 3 — `model/song.js` is layer 2 and can never
    import it, a permanent block of the same shape as `estimateKey`'s old
    one, not a "not yet split" one — clip geometry genuinely belongs at the
    audio layer). All four stay in app.js, bare-name reachable, now
    importing `editableSong`/`canEditMusic`/`estimateKey`/`checkKeyVsFile`
    back from `model/song.js`/`model/provenance.js` unchanged.
  - `model/selection.js` (new) ← `selEditItems`, `clipboardHas`,
    `clipSummary` — the three selection-adjacent reads with no blocked call
    in their body. **`selEditApply`/`nudgeSelection`/`resizeSelection`/
    `quantizeSelection`/`splitSelectionAt`/`splitSelectionHalves`/
    `joinSelection`/`copySelection`/`cutSelection`/`pasteClipboard`/
    `pasteAnnotations` — every actual mutator this step's table names
    (`selEditApply`, `nudgeSelection`) or implies (quantize/split/join,
    copy/paste) — did NOT move.** All of them bottom out in `selEditApply`
    itself, which calls `saveEdits()` (model/edits.js's own SAFETY-blocked
    function, step 5 — still bare in app.js), `computeSongEnd()` (blocked,
    above), `buildScoreModel()`/`draw()` (render, step 11); `nudgeSelection`
    additionally needs `editableSong` (now cleared, see model/song.js) but
    still inherits `selEditApply`'s block. This is the plan's `selection.js`
    row almost entirely unmet by content — the three names that DID move
    are real, but none of them is the row's own headline.
  - `model/album-order.js` (new) ← `setAlbumOrderPref`, `slugOfPath`,
    `albumTrackMap`, `albumHasTrackData`, `albumOrder`, `albumEffectiveOrder`,
    `albumOrderControl` — this step's one FULLY clean file, matching the
    plan's table exactly: nothing here touches anything but `S`,
    `localStorage`, `document.createElement` (a plain browser global, not a
    cross-module import — `albumOrderControl` builds the Game order/A–Z
    segmented control), and `albumMetaCache`/`folderOf` (provenance/catalog,
    both layer 2). No named target was left behind.
  - `model/versions.js` (new) ← `autosaveOn`, `versionsStoreKey`,
    `readVersionsRaw`, `writeVersionsRaw`, `migrateVersions`, `readVersions`,
    `pushVersion`, `songDirtyFlag`, `songUnsaved`, `draftTracks`, `musicSig`,
    `draftDoc`, `draftKeys` — the whole LOCALSTORAGE-side version store
    (Model B: push/read/migrate the ring buffer, the draft fingerprint
    (`musicSig`/`draftDoc`/`draftTracks`), the "is this song ● unpublished"
    predicate). **`saveVersion` — the plan's own named headline
    (`saveDraft, saveDraft` appears twice in the table's one line; the
    actual button handler is `saveVersion`) — did NOT move**: it calls
    `openSaveForm`/`setInfo`/`saveDraft`/`filesMirror`, none yet split.
    **`saveDraft` itself also did NOT move** — unchanged from step 6's own
    finding for `platform/storage.js` (`isComposition`/`editableSong` are
    now real imports, cleared; `retireOldOverlay`/`logErr`/`setInfo`/
    `updateSongBtn`/`updateSyncBtn`/`filesMirrorSoon` are not). `draftRead`/
    `draftWrite`/`draftFingerprint`/`pubCompareDraft`/`fingerprintOldDrafts`/
    `markPublished` all stay too, each for its own already-documented or
    newly-confirmed UI/model-edits reason (`draftFingerprint` specifically
    because it calls `draftWrite`, itself permanently UI-blocked since step
    6). `draftKeys` moved here (versions/drafts is its natural home) rather
    than provenance.js; `localFolders`/`folderChoices` (provenance.js) import
    it back down, same layer.
  - `model/jobs.js` (new) ← the jobs store's PURE half (`JOB_KINDS`,
    `jobListeners`, `jobControls`, `jobsSave`, `jobsOnChange`, `jobProgress`,
    `jobFraction`, `JOBS_AUTOCLEAR_MS`, `jobBarSet`, `jobsList`, `jobsFind`)
    plus the debug-log's pure half (`appErrors`, `appDebug`, `debugLogOn`,
    `logPush`, `logLines`, `logLine`, `BENIGN_ERRORS`) — the plan's one line
    ("jobs (footer ⏳) and the debug log") covers both clusters, and both
    split the same way: **`jobsNotify` — the one function every job mutator
    funnels through — did NOT move, because its own body calls
    `updateJobsBtn()` (`document.getElementById`/`setControl`, UI-chrome,
    not yet split), and that is now understood to be PERMANENT, not "not
    yet split" — the same shape step 7 found for `ensureAudio`'s
    `logDebug`/`logErr`/`setInfo` calls: status/footer-button reporting is
    structurally a UI concern in this app's own layer table, forever. Every
    function that calls `jobsNotify` — `jobsLoad`, `jobStart`, `jobApi`,
    `jobCancel`, `jobsDismiss`, `jobsClearFinished`, `jobsAutoClear` —
    inherits the block transitively (importing `jobsNotify` from app.js,
    where it stays, is the same upward import every other blocked function
    in this split has hit), even though NONE of them individually touches
    UI.** `logErr`/`logDebug`/`errChip` similarly stay (both resolve to
    `errChip()`'s `setControl`/`document.getElementById`/`askSeenMax()` —
    `ask/`, layer 4, step 13 — the same permanent-logging-blocker shape).
    `renderJobs`/`openPubJobSheet`/`pubItemIcon`/`renderPubJob` (DOM-heavy
    UI) and the init-time `addEventListener` wiring block all stay with
    them. The split is clean and symmetric: read-only/pure-mutate-on-S
    functions moved, anything that notifies the UI or logs stayed, with no
    function straddling the line.
  - `import/hub.js` (new) ← `importHubLabel` only — the Import hub's single
    pure leaf (a lookup into `model/catalog.js`'s `FOLDER_NAMES`).
    `openPickedFiles` — the hub's real dispatcher — stays in app.js: it
    calls `CHIPS[kind]` (blocked, below), `setInfo`, `createComposition`,
    `importAudioFiles`, `openChipImport`, `importSf2File`,
    `applyM3uToAlbum`/`applyM3uNames`, none yet split. Every
    `addEventListener`/`dragover`/`drop` wiring statement for the hub's
    panel stays too (non-declaration top-level code `--names` never
    selects, and none of it is pure regardless).
  - `import/capture.js` (new) ← `impDirFor`, `importDraftKeys`,
    `impTrackKey`, `streamedAudioMagic`, `audioMagic`, `sf2Magic`,
    `impDisplayTitle`, `impTrackLabel` — format-identification (byte-magic
    sniffing: none of the three `*Magic` functions touch anything but their
    own byte array) and pure key/label helpers. `importDraftKeys` needed
    `draftKeys` (now `model/versions.js`, layer 2) and `isCaptureKey` (now
    `model/provenance.js`, layer 2) — both clean for `import/` (layer 4).
    **Everything else named or implied by "NSF/chip import, captures as
    jobs" stays**: `chipKindOf` needs `CHIPS` (below); `impCapture`/
    `captureJobStart`/`renameImportDraft` each reach `draftWrite`/`jobStart`/
    `updateSongBtn`/`updateChipBtn`, none yet split.
  - `sync/publish.js` (new) — the biggest new file this step wrote, despite
    its own headline (`publishSong`) staying blocked: `putMidAt`,
    `deleteRepoFile`, `audioDirFiles`, `declaredTsForKey`, `notesTxtFor`,
    `putSongsText`, `uploadAudioClips`, `uploadAudioClipsFor`, `putRollnotes`,
    `recordLastSync`, `writeToken`, `connected`, `takeToken`, `shareLinkFor`,
    `songsReadmeBlock`, `spliceReadme`, `writeSongsReadme`, `APP_REPO`,
    `PUBLIC_BASE`, `publicBase`, `README_OPEN`, `README_CLOSE` — every GitHub-
    Contents-API / local-folder write primitive, the share-link builder, and
    the README/manifest-text generators, all pure functions of their own
    arguments plus `S`/`platform/*`/`midi/write.js`/`audio/clips.js`/
    `audio/bounce.js` (all ≤ layer 4 for a `sync/` file). **`publishSong`,
    `markPublished`, `markCurrentSongSynced`, `publishOpenComposition` did
    NOT move** — `publishSong` alone reaches `saveDraft`/`draftRead`/
    `askCommitLog`/`filesMirror`/`filesMirrorFor`/`declaredTsForKey`'s
    sibling `notesTxtFor`'s own caller context (fine) but also
    `updateManifest`/`manifestPlace` (left in app.js — see below) and
    `markPublished` (blocked by `draw`/`updateSubtitle`/`saveDraft`/
    `draftWrite`); none of its blockers are this step's to clear.
    `updateManifest`/`manifestPlace`/`albumTitleFor`'s manifest-editing
    cousins were considered for provenance.js/sync/publish.js and left in
    app.js unchanged — `updateManifest` needs `folderActive` (fine) but
    nothing in it REQUIRES moving for anything above to work, and it reads
    more like catalog maintenance than either file's own charter; left for
    a later pass rather than guessed at.
  - **`chipSource` (step 8's leftover) still did NOT move, and the reason
    is not the one step 8 named.** Step 8 said `chipSource`'s only blocker
    was `isCaptureKey`; that cleared the moment `isCaptureKey` landed in
    `model/provenance.js` above. But `chipSource` also calls
    `chipVaultFile(meta.nsf, base)`, which calls `chipExt(kind)`, which
    reads `CHIPS[kind]` directly — the SAME permanently-blocked table step
    8 found for `chipRender` (`CHIPS.usf.capture`'s one guarded `logErr`
    call, which can never move until `errChip`/`askSeenMax` do, steps 13/14).
    `chipSource` inherits this exactly the way `scheduleNote` inherited a
    SECOND blocker from `scheduleClip` in step 8's own writeup — clearing
    the named blocker surfaced a real, independently-blocking one underneath
    it, not a false all-clear. Corrected in open-items.md.
  - `regen-e2e-footer.mjs --file src/app.js` re-run (three times total this
    step, after the provenance/song/selection/album-order/versions/jobs
    batch, after import/hub+capture+sync/publish, and after the
    estimateKey/initCatalog/folderScanAlbums follow-up); `check.mjs` clean
    except the pre-existing `oldBpb` finding; `check-e2e-globals.mjs` and
    `check-controls.mjs` clean (26 controls, unchanged — this step touched
    no control). **Two `move.mjs` self-import bugs, same shape as each
    other, both hand-fixed as an import-line-only edit (§0's own
    allowance):** moving `albumMetaCache`/`albumMetaFor` out of chip.js
    into provenance.js, and later `folderScanAlbums` into catalog.js
    alongside `titleCaseSlug`, each left behind a bogus self-referencing
    import line (`import { albumMetaCache } from "./provenance.js"` inside
    provenance.js itself; `import { titleCaseSlug } from "./catalog.js"`
    inside catalog.js itself) — `move.mjs`'s back-import logic resolves a
    selected node's free identifier against the FROM file's own top-level
    imports before checking whether the name is already a LOCAL declaration
    in the TO file, and in both cases the FROM file (app.js) already
    imported the name from the very file it was being moved into. A real,
    narrow tooling gap (worth fixing in move.mjs itself before a future
    step hits it again), not something a plan-level workaround should paper
    over; deleting the one bogus line each time was the whole fix, confirmed
    by re-running check.mjs clean immediately after.
    `devtools.js` gained `modelSong`/`modelSelection`/`modelProvenance`/
    `modelAlbumOrder`/`modelVersions`/`modelJobs`/`importHub`/`importCapture`/
    `syncPublish` namespace imports (GET-only). `sw.js` `APP_MODULES` gained
    all nine new files, `SW_VERSION` bumped nr-v14 → nr-v15; index.html's
    modulepreload list gained all nine (after `audio/bounce.js`, before
    `app.js`, grouped model/import/sync — same "append in step order, not
    strict layer order" convention every prior step used). `node
    tools/package.mjs --out /tmp/nr-dist-s9`: 47 runtime modules, unchanged
    from post-step-8 (no `tools/`-side runtime module corresponds to
    model/import/sync). `node tools/dump_notes.mjs` re-verified against a
    scratch copy of `albums/starters/fur-elise.mid` — byte-identical to the
    committed `.notes.txt`; `tools/at.mjs` re-verified against the same
    starter song. Tests, each under `perl -e 'alarm 240; exec @ARGV'`:
    night-roll 427 (426 pass + 1 pre-existing vault-only skip — every
    "local song: …" SAFETY-regression test passes unchanged, since none of
    that code moved a byte), modules 33/33 (fileCount bumped 28 → 37, the
    usual mechanical bump), gestures 21/21, controls 3/3, pwa 3/3, package
    3/3, nsf 20/23 (3 pre-existing vault-only skips), chip-worker 31/31,
    bridge 10/10, migrate-rollnotes 9/9, import-set 5/5, album-order 8/8,
    psx-render 6/6, spc-render 5/5, instruments-export 4/4, sounding 12/12 —
    all green. `npm run test:e2e:smoke` run twice (once mid-step, once
    after the estimateKey/initCatalog follow-up): 8/8 both times. See
    "Deviations (9)" below for the full per-cluster accounting and the
    `chipSource`/`model/edits.js` SAFETY-function re-checks this step's
    provenance.js/versions.js landings prompted.

## Deviations (9, 2026-10-03)

- **Three cross-step corrections, not new blockers**: `albumMetaCache`/
  `albumMetaFor` relocated out of `audio/chip.js` (step 8) into
  `model/provenance.js`; `initCatalog` (step 5) and `folderScanAlbums`
  (never moved, step 6's own "Not moved" list) both landed in
  `model/catalog.js`; `estimateKey`/`checkKeyVsFile` (steps 4-5, found
  permanently unable to reach `theory/key.js`) landed in `model/song.js`
  instead. None of these changed a function's body or logic — each is a
  verbatim move to a DIFFERENT destination than the step that first placed
  (or tried to place) the code, made possible because a later step's own
  new files changed which layer a dependency lives at. This is the same
  kind of correction step 5 made to step 4's `spellPc` and step 8 made to
  steps 5/7's `playSec`-needing callers, just with more of them landing in
  one step.
- **`model/edits.js`'s SAFETY functions (`loadEdits`/`saveEdits`/
  `foldOldOverlay`/`retireOldOverlay`/`updateEditBtnVis`, step 5) and
  `platform/storage.js`'s SAFETY functions (`saveDraft`/`draftWrite`/
  `draftRead`/`localDraftWrite`/`localDraftTracks`, step 6) were
  re-checked against this step's new `isComposition`/`editableSong` — both
  now real, legal imports — and BOTH STILL stay exactly where they were.**
  `saveEdits` needs `isComposition()` (now clear) but also
  `scheduleAnalysisRecompute` (gen/, step 10) and `saveDraft`/
  `computeSongEnd`/`updateSongMeta` (the latter two confirmed permanently
  model-layer-blocked-by-render/audio above, not step 9's to clear);
  `updateEditBtnVis` needs `editableSong` (now clear) but also
  `updateChipBtn` (still blocked, step 8) and `originOf` (now clear,
  unused alone). `saveDraft` needs `isComposition`/`editableSong` (both now
  clear) but also `retireOldOverlay`/`logErr`/`setInfo`/`updateSongBtn`/
  `updateSyncBtn`/`filesMirrorSoon` (none yet split). Real, partial
  progress — two of each function's blockers cleared — but every SAFETY
  function named by CLAUDE.md's 2026-10-02 regression stays bit-for-bit
  where it was, per the same "move it whole or not at all" discipline step
  5 set. Corrected in open-items.md (not re-opened as a fresh question —
  the existing QUEUED entries already anticipated re-checking after this
  step and are updated in place).
- **`chipSource` (step 8's own "still did NOT move" leftover) has a SECOND,
  independent blocker step 8 never saw, because its own named blocker
  (`isCaptureKey`) hid it**: `chipVaultFile` → `chipExt` → `CHIPS[kind]`,
  the exact table step 8 found permanently blocked by `CHIPS.usf.capture`'s
  one `logErr` call. Clearing `isCaptureKey` (this step) was necessary but
  not sufficient. `chipSource` stays in app.js, now blocked by `CHIPS`
  alone — the same open-items.md entry already tracks `CHIPS`'s own
  resolution (steps 13/14, once `errChip`/`askSeenMax` land), so no new
  entry was needed, only a correction to the existing one naming
  `chipSource` as a casualty of the SAME block, not a separate one.
- **`updateManifest`/`manifestPlace` were checked for both `model/
  provenance.js` and `sync/publish.js` and left in app.js on purpose, not
  overlooked.** Both are genuinely pure-ish (`folderActive`/`repoApi`/
  `apiError`/`albumTitleFor`/`titleCaseSlug`, all ≤ layer 2, no DOM) and
  nothing in either new file strictly requires them to move — `publishSong`
  (which calls `updateManifest`) stays blocked by other things regardless.
  Moving genuinely clean, unrequired code on spec, with no caller in
  either destination file to justify it, is exactly the "speculative
  widening" step 0a's own Deviations warned against; left for whichever
  step (likely 14, when the manifest-editing UI around it finally splits)
  actually needs them.
- **`fillFolderSelect`/`folderTree`/`nodeAt`/`nodeCount`/`parentFolder`/
  `subfolderKeys`/`songStatus`/`publishDest`/`publishLabel` were checked
  and left in app.js — some blocked, some simply not load-bearing for
  anything that moved.** `fillFolderSelect` itself has no blocked call
  (`folderChoices`/`folderTitle`, both now ≤ layer 2) but nothing in
  provenance.js calls it and it's DOM-UI shaped (builds `<option>`
  elements for a File-menu form) — left with its one caller, `openSaveForm`
  (blocked, stays). `songStatus`/`publishDest`/`publishLabel` each need
  `dirtySongs`/`fsRoot.mode` or are simple booleans with UI-only callers;
  none is this step's row to claim and none was required by anything that
  did move.
- **`move.mjs`'s self-import bug (see the Done note above) is a real,
  narrow tooling finding, not a one-off.** It triggers specifically when a
  node being moved OUT of `--from` references a name that `--from` itself
  already imports FROM `--to` (i.e., the name was moved to `--to` in an
  EARLIER, separate invocation, and `--from`'s import line was hand- or
  tool-updated to point there before this invocation ran). `move.mjs`'s
  `referenced` resolution checks `remainingDeclaredNames` (declarations
  left in `--from`) before `fromImports` (imports already in `--from`), so
  a name resolved via the second path can target `--to` itself and produce
  a same-file self-import. Both instances this step hit were caught
  immediately by `check.mjs` (a parse error, loud and immediate — never a
  silent wrong behavior) and fixed by deleting the one bogus line; flagged
  in open-items.md for whoever next touches `tools/split/move.mjs` to add a
  guard (skip emitting an import whose resolved specifier equals `--to`
  itself).
- **Browser verification is still owed by the main session** (this
  builder's task explicitly excludes it): Save As on a scratch local song,
  the Versions sheet open/restore, an NSF import into a scratch
  composition (never `albums/compositions/`), and a publish to a scratch
  path — the plan's own four checks for this step, none of which a vm test
  can stand in for completely (Publish's GitHub/folder write path and the
  Versions sheet's rendering are both UI-side).
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

## Deviations (6, 2026-10-03)

- **Every SAFETY-named function this step called out by name stayed in
  app.js, verbatim, for a real reason — not a blanket refusal to try.**
  Each was checked individually against its actual free identifiers:
  - `saveEdits`/`loadEdits`/`saveDraft`/`draftWrite`/`draftRead`/
    `localDraftWrite` all reach into `isComposition`/`editableSong`/
    `retireOldOverlay`/`setInfo`/`updateSongBtn`/`updateSyncBtn`/
    `filesMirrorSoon` (provenance/model/UI, layers 2+4) or, transitively,
    into `logErr` (one more UI-chrome call, inside `localDraftWrite`'s
    "too big to keep whole" warning and `localDraftTracks`'s crash-
    recovery log) — none of which has a lower-layer home yet. Left
    bit-for-bit where they were.
  - `idbDraftPut` is the ONE member of the otherwise entirely clean
    `idbDraftOp`/`idbDraftGet`/`idbDraftDelete`/`idbDraftMove` family that
    calls `logErr` (its own catch branch's "draft notes could not be
    stored for …" message) — so it alone stays in app.js while its three
    siblings moved to platform/storage.js. This is a narrower, more
    precise finding than treating "the draft IDB ops" as one all-or-
    nothing unit: the three siblings have zero risk of a logic change
    (their bodies don't change AT ALL, only their file), and leaving them
    behind just because one relative is blocked would have been exactly
    the over-caution CLAUDE.md's "no one-time hacks" principle argues
    against in the opposite direction — don't generalize a real, narrow
    constraint into a blanket one.
  - `draftInIdb` (also SAFETY-named, "decides whether a draft is big-draft
    IndexedDB or small-draft localStorage") turned out to be CLEANLY
    movable once its two load-bearing constants `IMP_DIR`/`CONSOLE_OF`
    (unlisted by the plan, same pattern as steps 4/5's unlisted spelling/
    chord tables) came with it — neither constant has any other blocker,
    and their one other app.js caller (`impDirFor`, capture-import territory,
    step 9) now just imports them back from platform/storage.js. Moving
    `draftInIdb` itself is a real, useful finding: it IS one of the
    functions this step's SAFETY paragraph named, and it moved with zero
    risk (pure string/Set membership test, no DOM, no `logErr`).
  - `scheduleBackupFlush`/`flushBackupNow` (the Mac-backup pair, also
    SAFETY-named) stayed together: `flushBackupNow` needs `editableSong`/
    `draftDoc` (model, layer 2), `serializeRollnotes` (model/rollnotes.js,
    layer 2 — ALREADY a real module, so this isn't even a "not yet split"
    situation, it's permanent, same shape as `estimateKey`/`theory/key.js`
    in step 4), `aiUrl`/`aiHeaders` (ask/, layer 4), and `logDebug`. No
    subset of this pair is free of a layer-2-or-higher call.
- **`sfShownAt` (named by this step for platform/mode.js) is blocked by the
  same fact step 4 already established, not a new one**: it calls
  `estimateKey` directly, and `estimateKey` is still bare in app.js
  (LEGACY_CONTAINER, layer 5) — stuck there because it needs `trackIsDrums`/
  `barTicks`-style model-layer (2) helpers, and `theory/key.js` (where
  `estimateKey` would otherwise belong) can never import layer 2, per step
  4/5's findings. Unlike that theory-vs-model deadlock, `platform/` (layer
  1) importing `estimateKey` would be perfectly legal IF `estimateKey`
  itself ever moved somewhere layer-1-or-lower — but it hasn't, and
  nothing in THIS step changes that. So `sfShownAt`'s blocker today is
  simply "app.js is layer 5, not layer 1-or-lower," re-confirmed rather
  than newly discovered; it stays with `estimateKey`, unmoved, same call
  site, same behavior.
- **`nativeOpenUrl`/`nativeOpenHook` (named for platform/native.js) turned
  out to be import-hub/UI code wearing a native-bridge name**, not thin
  bridge wrappers: `nativeOpenUrl` directly calls `setInfo`, `stop`,
  `closeFileMenus`, and `openPickedFiles` (the whole "a file was handed to
  the app, now actually open it" sequence) — layers 3/4, nowhere close to
  platform. Only the two Capacitor leaves with NO such calls
  (`nativeCall`, `audioSessionType`) are genuinely platform-layer; the
  plan's one-line description ("Capacitor bridges: audioSessionType,
  screenshot, share…") undersold how much of the REST of the Capacitor-
  touching code in this file is import/UI logic that merely reaches a
  bridge function partway through, not a bridge function itself. The 📷
  screenshot code (`askShotCapture` et al., ask/shots.js, step 13) and the
  Core MIDI glue (`initWebMidi`/`initCoreMidi`/`midiStatusLine`, input/
  record.js, step 12) are the same shape — `window.Capacitor` idiom, UI
  calls throughout — confirmed by inspection, not moved, not even
  attempted.
- **`platform/sw.js` could not be created at all** — see NIGHT-ROLL.md's
  module-map entry for the full reasoning (the registration code is one
  top-level `if`/`else` statement, not a declaration `--names` can select,
  and its `else` branch's `setInfo` call blocks even an `--range`-wrapped
  `initSw1()`). Queued in open-items.md, not asked as a question for
  Josh — this is a mechanical/layering fact, not a design decision.
- **The "local folder backend" banner (src/app.js, originally index.html
  ~line 22083) turned out to span far more than folder code** — reading
  the full section (through line 23102, right up to the service-worker
  banner) surfaced a dense, interleaved cluster of settings-sheet UI
  (`openSettingsSheet`, `cfgShowPane`, …), sync/pending-songs UI
  (`renderSyncPending`, `openSyncSheet`, `discardPending`, …), and GitHub
  publish/readme code (`writeSongsReadme`, `putRollnotes`, `markPublished`,
  `publishAllJobStart`, `writeToken`, …) — none of it folder-backend code,
  all of it UI-chrome or sync/publish (steps 9/14) that merely happens to
  sit in the same banner section as the real folder-FS code. This is the
  same "one banner, several future modules' worth of code" shape step 4
  found for the chord/key banners and step 5 found for "big drafts" — each
  checked individually by free-identifier, not swept by `--range`. Only
  the genuinely clean folder-FS and cfg-URL leaves moved; see NIGHT-ROLL.md
  for the exact list.

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

## Deviations (2, 2026-10-03)

- **check.mjs rule 4 needed a new exemption for app.js (LEGACY_CONTAINER),
  the same shape as main.js's existing one but for a narrower reason**: the
  first real code this step moved OUT of app.js (setVolBtn, now layer 4 —
  `ui/` — instead of a same-file local) immediately surfaced that app.js's
  own pre-existing boot code calls it at app.js's OWN top level (the
  master-volume init, `setVolBtn(Math.round(S.masterVol * 100))`, right
  beside `const volbtn = document.getElementById("volbtn")`), which rule 4
  (top-level initializers may reference only layer-0 imports) now flags —
  it couldn't before, because setVolBtn was a same-file local, not an
  import, and rule 4 only looks at imports. This isn't a real hazard:
  app.js sits at the SAME layer tier as main.js (the layer table), so
  nothing it imports — now or as later steps carve more of it out — can
  import app.js back (that would be a layer-5-importing-layer-5 violation
  rule 5 would catch on the OTHER module first), which means no cycle can
  reach app.js from anything it statically imports, which is exactly the
  hazard rule 4's layer-0-only restriction exists to rule out by
  construction. Fixed the same way as main.js: `checkSrc()`'s rule 4 call
  now also skips `LEGACY_CONTAINER`, with the reasoning written at the call
  site (tools/split/check.mjs) rather than a one-off per-callsite
  workaround. Narrower than main.js's exemption in one respect — app.js
  still can't safely read not-yet-initialized mutable STATE from a sibling
  at its own tier, there just aren't any to read from yet — but the
  underlying evaluation-order guarantee is identical. Deleted with
  LEGACY_CONTAINER itself in step 15.
- **`CONTROLS`' patch shape grew past the plan's {icon, label, aria}**: a
  `glyph` field (a literal character — 𝄞, ◂, 🎓, 💬, ┄ — for a KEEP control
  the Material icon audit never touched or exempted) and a `prefix` field
  (the ✓ /"   " checkbox column shared by every View ▾ radio/toggle row AND
  the footer's Roll/Tracks/Score drop-up, `#viewbtn`'s own switch menu).
  Both were required to reproduce the pre-split byte-for-byte HTML — the
  alternative (folding the checkmark into `label` as literal leading
  text) would have worked too, but splitting it out means a caller that
  only wants to flip the checkmark state (the common case, called on
  every `renderViewMenu()`/`renderViewSwitch()` render) doesn't have to
  reconstruct the whole label string to do it.
- **`setControl`'s patch fields are independent, not an all-or-nothing
  {icon, label, aria} triple**: the plan's wording ("writes innerHTML …,
  aria-label and title in one place") reads as one call doing all three
  every time, but two of this step's own migrated call sites need
  partial updates specifically: `deployButtonTick` rewrites only `label`
  every second (the countdown), and `askStatus` rewrites only `aria` when
  the bridge's working/idle state flips — if one call's omitted fields
  were treated as "clear it" rather than "leave it," the countdown and
  the aria-label would stomp each other's last write. An omitted field
  keeps the control's current value; `tests/controls.test.mjs` proves this
  explicitly (the aria-only / label-only independence case).
- **Not migrated to `setControl`, and not added to the allowlist** (no
  violation exists to allowlist — these simply have no registered control
  to write): `renderJobs()`'s and `fsubItem()`'s row-factory buttons, which
  build a fresh, non-persistent element per call (no fixed id — `CONTROLS`
  is keyed by id, so there's nothing to register); the mic/Speak button
  (`S.micBtn`/`#nmic`), whose target is one of two different elements
  chosen at runtime, not a single fixed id; `#askattach`/`#askshot`/
  `#askpick`, which are static markup with their icon/label/aria baked into
  index.html and NO JS writer at all (confirmed by grep — tests/
  night-roll.test.mjs's own static-markup regex assertions on `#askpick`'s
  `aria-label` attribute, and the `#askattachmenu` static div, would have
  had to change if these moved into the registry, for zero behavior gain).
  A future step that gives these a real dynamic writer should register
  them then, not before.
- **tests/controls.test.mjs's static scan (tools/split/check-controls.mjs)
  is per-top-level-statement, not file-wide, for its local `const b =
  document.getElementById(id)` → control-id map** — a file-wide map was
  tried first and produced ~60 false positives, because this codebase's
  actual convention is a short local name (`b`, almost always) reused
  across dozens of unrelated functions for a dozen unrelated buttons; a
  single flat map conflates all of them the moment any ONE declares
  `const b = document.getElementById("playbtn")` anywhere in the file.
  Scoping the map to each top-level `ast.body` entry (function
  declarations and top-level statements are already one-per-concern in
  this codebase) isolates them correctly with no accurate-scope walker
  needed; the real repo scan came back clean (0 violations) once rescoped.
- **tests/modules.test.mjs's `realModuleManifests()` helper needed to
  become recursive**: its `srcListing` was a plain, non-recursive
  `readdirSync(src).filter(...)` (accurate through step 1, when src/ had
  no subdirectories) — this step's `src/ui/` is the first one, and the
  flat listing would have silently stopped seeing `ui/icons.js`/
  `ui/controls.js`, failing rule 8's "same four manifests" check the
  moment index.html/sw.js/devtools.js (correctly) started listing them.
  Fixed to walk subdirectories, mirroring check.mjs's own `listJsFiles()`
  and package.mjs's `srcModules()`, both of which were already recursive
  (this gap was specific to the test's own manifest helper).
- **One hardcoded structural count needed bumping**: `checkSrc()`'s real-
  repo test asserted `fileCount === 5` (the five flat files through step
  1); this step's two new files under `src/ui/` make it 7 — updated along
  with the test's own description, the same mechanical bump step 1's
  Deviations section made for its own file-count assertion.

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
