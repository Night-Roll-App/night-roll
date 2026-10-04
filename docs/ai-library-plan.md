# Plan: Night Roll's AI support → its own library (`Night-Roll-App/claude-bridge`)

Josh, 2026-10-03 (Terminal #91/#93/#99): "extract all the code for the AI
interaction into its own library so that we can write other iPad apps and
just use this seamlessly … a new repo … pull it from there". Scope: ALL AI
support — the Mac bridge server, the in-browser model path (WebLLM), the
remote OpenAI-compatible path (LM Studio, Ollama via the bridge), and the AI
window UI. Repo name/visibility: Josh's (Q8) — private, rename later OK.

Designed by an Opus planning agent against module-split @ 4316dc7a (split
step 9 done). Prerequisite: split step 13 (verbatim move of the AI code into
`src/ask/{backend,tools,context,bridge,shots,sheet}.js`) — extraction then
works on six small modules, and the split's "a move commit only moves code"
rule never collides with extraction commits (which do change logic).

## 1. How Night Roll consumes it: a vendored copy synced by a script

Committed into the public night-roll repo at `vendor/ai/`, copied from the
library repo at a pinned tag/SHA by `tools/ai-sync.mjs`:

```
node tools/ai-sync.mjs --ref v0.3.0             # git archive from git@github.com:Night-Roll-App/claude-bridge.git
node tools/ai-sync.mjs --from ../claude-bridge  # local working copy, dev loop
node tools/ai-sync.mjs --check                  # npm test: hashes match vendor/ai/files.json
```

The sync copies only `web/`, `bridge/`, `LICENSE`, `README.md`; writes
`vendor/ai/VERSION` (tag + SHA) and `vendor/ai/files.json` (path → sha256);
rewrites `sw.js`'s `const AI_LIB = "<sha7>";` so the SW cache turns over
whenever the library does.

Why not the alternatives:
- **git submodule** — Pages and `actions/checkout` need credentials for a
  private submodule (Pages builds can't at all); fresh clones silently get an
  empty `vendor/ai/` and a dead AI window.
- **import map → CDN/raw URL** — can't serve a private repo without auth a
  browser can't send; breaks offline iPad, isn't precached, invisible to the
  package.mjs reachability guard.
- **vendored** — identical on Pages, in the Capacitor package and in the vm
  harness, zero tokens.

**Josh should know:** whatever ships is public (Pages serves it from the
public repo). "Private" protects the library's history/issues/tests, not the
shipped code. The library never contains secrets; license it like Night Roll.

Night Roll wiring (the step that introduces `vendor/ai/`): package.mjs
follows imports into `vendor/ai/web/`, guards reachability, excludes
`vendor/ai/bridge/**` from the product; sw.js `AI_MODULES` precached and
`CACHE = "night-roll-" + SW_VERSION + "-" + AI_LIB`; index.html modulepreload
gains the library modules; modules.test rule 8 extended (modulepreload =
AI_MODULES = files.json web entries; AI_LIB = VERSION sha7; `ai-sync --check`
so hand edits fail with "edit in claude-bridge, then sync"); check.mjs runs
rules 1–2 over `vendor/ai/web` and uniqueness across src/ + vendor/ai/web
(library top-level names prefixed `ai`, Night Roll keeps `ask*`).

## 2. Library layout and public API

```
claude-bridge/
  web/                     browser ES modules, no deps, no top-level side effects
    index.js               re-exports the public API
    sse.js                 aiSSE (OpenAI SSE → deltas, tool_calls, reasoning, finish)
    backends.js            aiRemoteBackend, aiBrowserBackend (WebLLM), aiPickBackend, aiProbe, aiHostConsent
    store.js               chat stores, seen cursors, drafts, eviction caps, log→markdown
    ctx-cache.js           sent/epoch block cache (stage/commit/drop per chat key)
    client.js              createAiClient(host): send / run (tool loop) / resume / jobs / stop / terminalSend
    bridge-client.js       inbox, status, sessions, terminal, terminal-prefs, app-state, deploy hold, backup
    attach.js              screenshot upload, image prep, file picker, shot list
    window.js              mountAiWindow(root, client, host): tabs, log, bubbles, mic, drafts, status
    window.css
  bridge/
    server.mjs             startBridge(opts, profile) + CLI (today's claude-bridge.mjs minus Night Roll text)
    launchd/install.sh, plist template (--entry, --label)
  tests/                   client (fake LM Studio/bridge servers + fake DOM), bridge, lint
  tools/check.mjs          same top-level rules as Night Roll's
```

```js
const ai = createAiClient(host);   // state on ai.state, never a host global
ai.send(text) / ai.terminalSend(text) / ai.stop() / ai.resume() / ai.setChat("song"|"general"|"terminal")
ai.backend(); ai.probe(statusFn)
mountAiWindow(rootEl, ai, host)    // v1 adopts today's #ask* markup; v2 renders its own
```

**Host adapter** (`src/ask/host.js`) — every app-specific behaviour enters here:
`storagePrefix: "ff1roll-"` (builds today's exact keys — no migration, no
lost chats), `settings()`, `chatKey()`/`sessionName()`, `systemPrompt(chat)`
(**the Learning law lives here**), `context(chat, cache)` (span notes,
annotations, open-song line, new-since lines, mode/key-state lines),
`tools(chat)`/`runTool(name, args)` (add/edit/delete_annotation, publish_song,
read/write notes, bars…), `confirm` (appConfirm — no native dialogs),
`setBadge`/`setButton` (setControl), `openWindow`/`closeWindow` (wm),
`jobs.*`, `log`, `diagnostics()`, `captureScreen()` (Capacitor plugin),
`persistLog` (`<song>.ask.md`), `songTitle`, `onTurnApplied()`.

The library knows no "mode": a lint test fails on
`/learning|annotation|rollnotes|chord|meter|night roll/i` in `web/` and
`bridge/` (allowlist: `x-nr-*` header names, kept for wire compatibility).
The bridge goes app-neutral through a profile: `startBridge(opts, profile)`
with the BRIDGE_SYS_* strings, the `/shapes` mount and the state dir as
Night Roll's profile; `--repo` required.

## 3. What goes where

**Step 13 landed** (docs/split-plan.md, 2026-10-04) — this section's
prerequisite move is done; here is where its own library-bound/adapter-bound
split actually ended up, one step before extraction can begin:
- Library-bound, landed in `src/ask/backend.js`: `aiSSE`, `aiHeaders`,
  `aiHostKind`, `aiRemote`, `aiSay`, `aiModelMenu`, `aiPickModel`, `aiTest`,
  `aiRunTest`, `aiBackendRows`, `aiBrowserMenu`, the WebLLM bits
  (`aiWebllmLoad`, `aiEngineFor`, `aiBrowserTest`, `aiBrowser`), `aiProvider`
  — every one of this table's row-1/row-2 library names except `aiHostOk`
  (stayed in app.js: its one `appConfirm()` call has no `host.confirm`
  adapter yet) and `aiUrl` (moved too, though this table calls it an
  adapter one-line wrapper — today it still reads `cfg()` directly, since
  the `host.settings` seam doesn't exist until extraction itself).
- Adapter-bound, landed in `src/ask/context.js`: `askSys`/`ASK_SYS_*`/
  `RULE_LEARNING`/`RULE_NORMAL` (moved verbatim — Learning law untouched),
  `askContext`'s own line builders (`askSpan*`, `askBarRow`/
  `askBarFingerprint`, `askLegendText`, `askAppState`, `askModeLine`,
  `askViewCursorLine`, `askOpenSongLine`, `askCapLines`,
  `askNewSinceLines`), `askTerminalContext`. **`askContext` itself did
  NOT move** (blocked by `askKeyStateLine` → `keyLabelState`, no home yet)
  — it stays in app.js, importing every line builder above back; this
  table's row "`askContext`, `askTerminalContext`, `askAnnotationsText*`...
  → adapter (context builder)" is therefore split: the builder FUNCTIONS
  moved, the top-level `askContext` ORCHESTRATOR did not, yet.
- Adapter-bound, landed in `src/ask/tools.js`: `ASK_TOOLS`'s schema,
  `askAnnotationsText`/`askAnnotationsTextCompact`, and the small per-field
  validators (`askFindAnnotation`/`askNoteKind`/`askNoteValue`/
  `askAnnotationStructural`/`askNormChip`/`askFindTrackIndex`/`askNoteVel`/
  `askWriteNotesValidate`/`askWritableGate`/`askBarsCount`/
  `askBarsValidate`). **`askRunTool` and every tool body that writes
  (`askAddAnnotation`/`askEditAnnotation`/`askDeleteAnnotation`/
  `askPublishSong`/`askWriteNotes`/`askInsertBars`/`askCopyBars`/
  `askDeleteBars`) did NOT move** — this table's "adapter (tool registry)"
  row is, like `askContext` above, split between moved field-helpers and
  an un-moved dispatcher + write bodies, still blocked by `draw`/
  `finalizeNotes`/`saveEdits`/`saveDraft`/`publishSong`/`insertTime`/
  `deleteTime`/`applyTake` (all `ui/*`-or-permanently blocked; see
  docs/split-plan.md's step 13 Deviations).
- `askCommitLog` (this table's own adapter/`host.persistLog` row) did NOT
  move — blocked by `askSave` → `updateSongBtn`.
- Everything else this table calls out (ctx-cache mechanics, `client.js`'s
  budget/build-messages/run/resume/jobs, `store.js`/`window.js`'s store,
  bridge-client's inbox/status/session/app-state, `attach.js`'s shot
  pipeline) landed across `src/ask/{context,bridge,shots,sheet}.js` per
  NIGHT-ROLL.md's Module map — that map is the accurate, current, per-name
  record; this bulleted summary only tracks the library-vs-adapter
  question this section itself asks, not a restatement of the full move.

| Today | Goes to |
|---|---|
| `aiSSE` | lib sse.js (pure; first) |
| `aiHeaders`, `aiHostKind`, `aiHostOk`, `aiRemote`, `aiBrowser`, `aiProvider`, WebLLM bits | lib backends.js (`cfg()`→`host.settings`, `appConfirm`→`host.confirm`) |
| `aiUrl` | adapter (one-line wrapper) |
| `aiSay`, `aiModelMenu`, `aiPickModel`, `aiTest`, `aiRunTest`, `aiBackendRows`, `aiBrowserMenu` | adapter in v1 (Settings DOM); lib `mountAiSettings` in v2 |
| `askSys`, `ASK_SYS_*`, `RULE_LEARNING`, `RULE_NORMAL` | **adapter** (Learning law) |
| `ASK_TOOLS`, `askRunTool` and every tool body | **adapter** (tool registry) |
| `askContext`, `askTerminalContext`, `askAnnotationsText*`, span/bar/key/mode lines, `askAppState` | **adapter** (context builder) |
| `askSent*`, `askEpoch*`, cache mechanics | lib ctx-cache.js |
| `askBudget`, `askEstimate`, `askBuildMessages`, `askStripContext`, model-name helpers | lib client.js |
| `askRun`, `askSend`, `askResume*`, pending/jobs, `askFinish`, `askFail`, `askTerminalSend` | lib client.js |
| `askStore*`, `askLoad`, `askSave`, seen cursors, logs, drafts, mode buttons | lib store.js / window.js |
| `askCommitLog` | adapter (`host.persistLog`) |
| inbox/status/session/tabs polling | lib bridge-client.js / window.js |
| `askShotCapture` native branch | adapter (`host.captureScreen`) |
| `askShotUpload`, `askShot*`, `askPrepImage`, `askPickFiles` | lib attach.js |
| render/bubble/mic/draft/status UI | lib window.js |
| `askBtnTap`, `openAsk` | adapter (wm + setControl) |
| `tools/claude-bridge.mjs` | lib bridge/server.mjs; Night Roll keeps a 20-line shim + `tools/ai-profile.mjs` |
| `tools/launchd/*` | lib bridge/launchd/; Night Roll's install.sh becomes a shim |

Night Roll's bare-name API stays as thin delegates in `src/ask/*`
(`askSend = t => S.ai.send(t)`, …) so every `run("askSend(…)")` in the tests
and the e2e mirror keeps working; `S.ai` is the client, old `S.ask*`/`S.ai*`
fields move to `S.ai.state` (test references rewritten in a separate
mechanical commit).

## 4. Ordered steps (one push each; `npm test` green after each)

0. Split step 13 (verbatim move into `src/ask/*`).
1. **DONE 2026-10-04 (branch module-split).** Library repo with `web/sse.js`
   only + its own tests/CI (`claude-bridge@v0.1.0`, 477ab79). Night Roll:
   `tools/ai-sync.mjs` (`--ref`/`--repo`, `--from` for the dev loop, `--check`);
   `vendor/ai/` populated (`web/{sse,index}.js`, `LICENSE`, `README.md`,
   `VERSION`, `files.json`); all §1 wiring (`sw.js` `AI_LIB`/`AI_MODULES`/
   `CACHE`, index.html modulepreload, `tools/package.mjs` reachability +
   never-ships-bridge guards, `tools/split/check.mjs` over `vendor/ai/web`,
   `tests/modules.test.mjs`'s extended rule 8); `src/ask/backend.js`'s
   `aiSSE` now imports from `vendor/ai/web/sse.js` and re-exports (every
   existing importer, and the vm harness's bare-name `aiSSE`, unchanged —
   no harness change needed: `scopeProxy` already resolves a bare name to
   whichever module's top level declares it, src/ or not). `npm test`
   green (ai/bridge/modules/package/pwa; only the pre-existing local-rip
   gaps ps2-real/instruments fail) and `npm run test:e2e:smoke` green.
   Proved Pages + package + harness + SW on one pure function, as intended.
2. **DONE 2026-10-04 (branch module-split).** Bridge server →
   `bridge/server.mjs` exporting `startBridge(opts, profile)` + `main(argv,
   profile)` (claude-bridge v0.2.0, library commit 900292b), carrying
   today's server logic verbatim except every Night Roll-specific value
   threaded through `profile` (`sys.{common,read,full,link}` — the system
   prompts, including the Learning-mode convention — `stateDirName`,
   `label`, the optional `shapes` static mount; `--repo` now required,
   with no HERE-relative default of the library's own). `tests/bridge.test.mjs`
   moved to the library against a neutral test profile
   (`tests/helpers/`); the library's `tests/lint.test.mjs` now also
   covers `bridge/`. `bridge/launchd/install.sh` + `template.plist` (generic,
   `--entry`/`--label`). Night Roll: `tools/ai-profile.mjs` (every moved
   string, verbatim) + `tools/claude-bridge.mjs` as a 4-line shim (`import
   {main} … import {profile} from "./ai-profile.mjs"; main(process.argv,
   profile);` — the file path, every flag, `npm run bridge`, and the
   launchd plist all keep working unchanged); `tools/launchd/install.sh`
   likewise shims to the library's installer with `--entry
   tools/claude-bridge.mjs --label com.nightroll.bridge` (its log file is
   now `~/Library/Logs/com.nightroll.bridge.log`, named after the label
   rather than hand-picked). Night Roll's `tests/bridge.test.mjs` is now
   the shim test (`/health`, `/v1/models`, `--repo`'s default, `/shapes`,
   and that the system prompt carries Night Roll's own Learning-mode
   text, not the library's neutral one) — `tests/ai.test.mjs` unchanged
   throughout. `node tools/ai-sync.mjs --ref v0.2.0` vendored
   `vendor/ai/bridge/`; `tools/package.mjs` already excluded
   `vendor/ai/bridge/**` from the product (step 1) — reverified. `npm
   test` green (only the pre-existing ps2-real/instruments local-rip gaps
   fail); `npm run test:e2e:smoke` green. Update flow going forward:
   `node tools/ai-sync.mjs --ref vX` then `launchctl kickstart -k
   gui/$UID/com.nightroll.bridge` — the terminal session's job, after
   Josh's merge, never a build/worktree session's.
3. **DONE 2026-10-04 (claude-bridge `v0.3.0`).** `web/backends.js`:
   `aiRemoteBackend`/`aiBrowserBackend`/`aiPickBackend` (the OpenAI-SSE and
   WebLLM paths, verbatim mechanics), `aiProbe` (the Test button's probe —
   answers a kind, never a sentence), `aiHostConsent`/`aiHostAllowed` (the
   consent list under `host.keys.hosts`, the sheet's words from
   `host.confirmHost`). Every library function takes `host` first (no
   library global, no "mode"); `src/ask/host.js`'s `askHost()` builds Night
   Roll's once (`S.aiHost`): `settings()` over `cfg()`, `apiKey()`,
   `url()`/`headers()` pointing back at the app's own `aiUrl`/`aiHeaders`
   delegates (so a test's by-name stub reaches every library fetch),
   `sessionName`, `onSessionEpoch`, `confirmHost`. `src/ask/backend.js` keeps
   every bare name as a one-line delegate (`aiTestWords` holds the Test
   wording). Library `tests/backends.test.mjs` ports tests/ai.test.mjs's fake
   servers (model listing, streaming, tool rounds with `-r1`, errors, the
   probe's kinds, consent); tests/ai.test.mjs itself unchanged, green.
4. **DONE 2026-10-04 (claude-bridge `v0.4.0`).** `web/store.js` (chat
   record, caps/eviction, pending markers + `aiJobId`, seen cursor, draft,
   `aiLogMarkdown(msgs, labels)`, `aiStripContext`), `web/ctx-cache.js`
   (`aiSent*`/`aiEpoch*`/`aiCachedBlock`/`aiHash` — FNV-1a 32, byte-
   compatible with the records devices hold), `web/bridge-client.js` (HTTP
   only, `{ok, status, body}`; Night Roll keeps polling/rendering),
   `web/attach.js` (upload, shot lines, image prep, tab capture). Keys come
   from `askHost().keys` (`store: "ff1roll-ask-"`, `seenMax`, `inboxSeen`,
   `draft: "ff1roll-askdraft-"`, `mode`); the host also gives `logCursor()`
   (askMaxErrId/askMaxStatusId), `status(text)`, `onStoreChanged`
   (updateSongBtn). `src/ask/{bridge,context,sheet,shots}.js` keep every
   bare name as delegates; `askLog*`/`askCommitLog` (the repo log) stay
   app-side. **Fixture: tests/ask-storage.test.mjs + tests/fixtures/
   ask-storage-2026-10-04.json** — today's shapes under the real key names
   read back identically; eviction never touches an unsaved chat or a
   non-store key (the one behaviour change: cursors used to be evicted
   with the chats because they share the prefix). Library tests:
   store/ctx-cache/attach (pure) + bridge-client (fake bridge).
5. **DONE 2026-10-04 (claude-bridge `v0.5.0`).** `web/client.js`:
   `aiSendText`/`aiRun`/`aiFinish`/`aiFail`/`aiRepending`/`aiResume`/
   `aiResumeSoon`/`aiTerminalSend`, verbatim mechanics, every app-specific
   thing through the host — `systemPrompt` (askSys), `context`
   (askContext), `terminalContext`, `buildMessages` (askBuildMessages: the
   mode filter stays app-side), `budget`/`estimate`, `tools`/`runTool`,
   `modelName`, `messageMeta` (`{mode: appMode()}`), `backend`/
   `jobsSupported` (the app's own delegates, stub-reachable), `canResume`/
   `resumeScope`, the window callbacks, and `text(key)` over neutral
   `AI_TEXT` defaults (host.js's `ASK_TEXT` keeps "the Mac" wording).
   `src/ask/client.js` keeps `askSend` whole — gating, consent, span, and
   the user push with its `mode: appMode()` tag (the mode-tag SAFETY test
   reads that line from the source; `aiSendText` is the library's send for
   other apps, Night Roll hands its built messages to `aiRun`) — and the
   delegates; `askPartial` → `S.askPartial`. Library `tests/client.test.mjs`
   (fake bridge + object bubbles: store-first send, tool round moves the
   marker, HTTP 500/abort, cut stream → resume running/done/404/no-jobs/
   unreachable, terminal send both ways). tests/ai.test.mjs and every
   Learning case in tests/night-roll.test.mjs unchanged, green. One
   library fix-up commit inside the step: the loop's status helper was
   named `aiSay`, which collided with Night Roll's Settings `aiSay`
   (check.mjs rule 6 across src/ + vendor/ai/web caught it) → `aiNotice`.
6. **DONE 2026-10-04 (claude-bridge `v0.6.0`).** `web/window.js` in adopt
   mode: `aiEl(host, which)` resolves `host.ids` (defaults `AI_WINDOW_IDS` =
   today's `ask*` ids, so Night Roll overrides nothing), `host.css` the
   class names (`askmsg`/`askcopy`/`othermode`/`earlier`). Mechanics moved:
   `aiGrow`/`aiScrollEnd`/`aiFocusIfKeyboard`, `aiBubble`/`aiFillBubble`
   (links; copy via `host.copyText`), `aiShowThinking`, the tabs
   (`aiTabSet`/`aiTabButtons`/`aiTabRestore`; `host.keys.mode`, `host.tabLabel`,
   `host.placeholder`, `host.onTabsChanged`/`onTabPicked`), the draft
   (`aiDraftLoad`/`SaveNow`/`SaveSoon`/`Drop`; `host.shotPaths`/`restoreShots`,
   `host.onDraftChange` → askComposing), `aiRenderLog` (`host.greeting`,
   `host.msgTag` → `{tag, dim}`, `host.noteLabel`, `host.showText`,
   `host.renderEarlier(div)`; pending bubbles from `aiPartial` with
   `AI_TEXT.stillWriting`/`pendingHere`), `aiWindowBind` (Send/Enter →
   `host.send`, Stop → `state.askBusy.abort()`, input → grow, tab clicks).
   Night Roll: sheet.js keeps every bare name as a delegate and holds the
   wording as plain functions (`askTabLabel`, `askPlaceholder`, `askGreeting`,
   `askMsgTag`, `askNoteLabel`, `askRenderEarlier(div)`); `initSheet1`'s
   tab restore and `initSheet3`'s five listeners stay as they were (each
   now a delegate call) so tests/boot-order.test.mjs's snapshot of main.js's
   expanded init sequence is byte-identical — `aiTabRestore`/`aiWindowBind`
   are for an app without wiring of its own; index.html/CSS/e2e selectors
   untouched. Library `tests/window.test.mjs` runs it over a tiny fake DOM.
7. **Deferred (decided 2026-10-04, Fable review): NOT this round.** What
   it would be, once a second app exists to need it: `web/window.css` +
   `aiMountWindow(root, host)` rendering today's `#asksheet` subtree
   (tabs row, span row, "Now:" strip, log, attach chip, compose row with
   📷/🖼/🎤/Send/Stop, status line, session line + Compact, the ⌨ model
   pickers) from a template string with the SAME ids/classes
   `AI_WINDOW_IDS`/`AI_WINDOW_CSS` already name, so `aiWindowBind` and
   every adopt-mode function work unchanged on a mounted window;
   `aiMountSettings(root, host)` rendering the Settings "AI model" rows
   (`#cfgaibackend`, `#cfgaiurl`+Test, `#cfgaimodel`, `#cfgaikey`,
   `#cfgaibrowsermodel`) with `aiProbe` + `aiBrowserProbe` behind the
   buttons and the app's `aiTestWords`-style wording from the host; the
   app-side bits that would then become host hooks: `askRefresh`'s model
   line, `askStatusRender`'s strip + the ✦ button's working dot,
   `askShotRender`'s chip, `askTermModelsLoad`'s pickers, `openAsk`'s
   window-manager calls (`wmLayoutAll`). Night Roll would keep its markup
   until the mounted window is pixel-checked against it in the real
   browser and on the iPad (memory: no unseen layout ships). Nothing is
   gained today: index.html is the only consumer, and the split just
   finished.

Dev loop: edit `../claude-bridge`, `ai-sync --from ../claude-bridge` (VERSION
"dirty" → modules.test fails, so it can't be pushed), then tag the library,
`ai-sync --ref`, push Night Roll.

## 5. Risks and guards

- iPad offline: library modules precached (AI_MODULES + rule-8 equality);
  WebLLM stays a CDN import (online only, as today).
- Stale library files in the SW cache: CACHE includes AI_LIB; test fails if
  AI_LIB ≠ VERSION.
- Private repo in CI/Pages: avoided by vendoring; only `ai-sync --ref` uses
  credentials (Josh's Mac, SSH).
- Hand edits to vendor/ai: files.json hash check fails npm test.
- package.mjs shipping node-only code: vendor/ai/bridge/** excluded + guard.
- Name collisions in the harness scopeProxy: uniqueness rule across src/ +
  vendor/ai/web; `ai` vs `ask` prefixes.
- Learning leaks: prompts/context host-owned; library lint forbids app
  vocabulary; Night Roll's Learning tests unchanged at steps 3–6.
- Storage key drift losing chats: storagePrefix reproduces exact keys;
  fixture test.
- Native screenshot plugin is Swift in Night Roll's shell: a second app needs
  it too — `bridge/ios/README` follow-up; canvas fallback stays in the library.
- One bridge, several apps: v1 = one profile per process (another port and
  launchd label per app).
