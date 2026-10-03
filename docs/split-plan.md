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

**1. All `let`s → `S`** (`promote-state.mjs` over src/app.js).
- Must not change: names, logic.
- Verify: npm test (the proxy keeps every `run()` working), check.mjs rule 3, browser check.
- After this step the main session retires the "boot-path TDZ" memory note.

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
