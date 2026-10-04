# claude-bridge

AI support shared by Night Roll and future iPad apps: the Mac bridge server
(Claude Code relay, terminal queue, notes, status, screenshots), the
OpenAI-compatible remote path (LM Studio, Ollama), the in-browser model path
(WebLLM), and the AI window.

Plain browser ES modules (`web/`) and a Node server (`bridge/`) — no build
step, no dependencies. Apps vendor a pinned copy (Night Roll:
`node tools/ai-sync.mjs --ref <tag>` → `vendor/ai/`), so whatever ships in an
app is public even though this repo is private. Never put secrets here.

App-specific behaviour (system prompts, context, tools, modes) enters only
through the host adapter an app passes in. `tests/lint.test.mjs` keeps app
vocabulary out of the library.

Plan: Night Roll's `docs/ai-library-plan.md`.

Status: v0.5 — `aiSSE` (the streaming parser, v0.1), `bridge/server.mjs`
(the Mac/Node bridge server and its CLI, v0.2), `web/backends.js` (the
remote and in-browser backends, the connection probe, per-host consent,
v0.3), `web/store.js` + `web/ctx-cache.js` + `web/bridge-client.js` +
`web/attach.js` (the chat record and its cursors/drafts, the sent-context
cache, the bridge's own routes, attachments, v0.4), `web/client.js` (the
exchange: store-first send, tool rounds, abort, resume of a cut stream,
the terminal send, v0.5), `web/window.js` (the window's mechanics in adopt
mode — it binds an app's existing markup by id, v0.6). Next (the plan's
step 7, deferred until a second app needs it): the library's own markup +
CSS and a `mountAiSettings`.

## web/

Every function takes the app's `host` adapter as its first argument — the
library holds no global of its own, so one page may run several hosts and a
test builds one in a line (`tests/helpers/fake-host.mjs`). What a host
provides, by module:

`web/backends.js`
- `settings()` → `{url, model, backend: "remote"|"browser", browserModel, window}`
- `apiKey()` → bearer token or null
- `sessionName()` → the chat-session key the bridge keeps one session per (sent as `x-nr-song`)
- `state` → a plain object the library keeps runtime fields on (`askModelCache`, `aiWebllm`, `aiEngine`, `aiEngineModel`)
- `storage` → localStorage-like; default `globalThis.localStorage`
- `keys.hosts` → storage key of the consented-hosts list
- `confirmHost(name)` → `Promise<boolean>` — the app's own consent sheet, in its own words (the library never phrases what the payload is)
- `onSessionEpoch(epoch)` → optional; the bridge's `x-nr-session-epoch` response header on every completion
- `url()`, `headers()` → optional overrides of `aiBaseUrl`/`aiReqHeaders`; an app whose tests stub its own delegate names points these at them so every library call follows the stub

Exports: `aiRemoteBackend(host)` / `aiBrowserBackend(host)` / `aiPickBackend(host)`
(each `{id, listModels(), chat({system, messages, signal, onDelta, schema,
onStatus, tools, onTool, job, onOpen, onRound, onNote})}`), `aiProbe(host,
url, {timeoutMs})` → `{kind: bad-url|mixed-content|http|empty|ok|timeout|cors|unreachable, …}`
(a KIND, never a sentence: the wording is the app's), `aiPickModel`,
`aiHostConsent(host, url)` / `aiHostAllowed(host, url)`, `aiBrowserProbe(host,
modelId, statusFn)`, `AI_BROWSER_MODELS`, `AI_WEBLLM_URL`.

`web/store.js` — the on-device chat record, read and written under the
HOST'S key names (an app with chats already on devices hands in its
existing names; nothing migrates):
- `keys.store` → the prefix every chat store key starts with; `keys.seenMax`, `keys.draft` (prefix) the rest
- `chatKey()` → the open chat's store key
- `logCursor()` → `{err, status}`: the newest ids of the app's own log lines (what "seen up to" records)
- `status(text)` → a one-line notice (storage full); `onStoreChanged(key)` optional; `jobPrefix` optional (default `"nr_"`)

Exports: `aiStoreGet/aiStoreSave/aiUnsavedCount/aiRevertToSaved/aiEvictOthers`
(shape `{msgs, saved, trimmed, lastUsed}`; caps `AI_LOCAL_SOFT`/`AI_TOTAL_CAP`;
eviction touches only clean chat stores, never a cursor), `aiPendingAll/
aiPendingIndex/aiJobId`, the seen cursor (`aiSeenGet/Set/Max/Advance`,
`aiSeenStage/Commit/Drop` — success-only), the draft (`aiDraftRead/Write/Clear`),
`aiLogMarkdown(msgs, {user, note, ai})`, `aiStripContext`.

`web/ctx-cache.js` — what a resumed bridge session already holds, per chat
key (`<key>-sentctx`, `<key>-epoch`): `aiSentGet/Stage/StageBars/Commit/Drop/
Reset`, `aiEpochGet/Set/Note`, `aiCachedBlock(host, key, field, label, header,
text, count)` (the stand-in line only when `host.state.askCaps.bridge`),
`aiHash` (FNV-1a 32, stable).

`web/bridge-client.js` — HTTP only, the bridge's own routes: `aiJobsSupported`
(true/false/null = unreachable), `aiJobGet` (`{status, job}`, null on 404),
`aiJobKill`, `aiInboxFetch`, `aiStatusFetch`, `aiSessionGet/Delete/Compact`,
`aiTerminalPost`, `aiTerminalPrefsGet/Set`, `aiAppState`, `aiDeploy` — each
`{ok, status, body}`; a network error throws. The app owns polling and rendering.

`web/attach.js` — `aiShotUpload(host, bytes, mime)` → path, `aiShotLine/
aiShotOutgoing(text, paths)/aiShotDisplayText`, `aiPrepImage(file)`,
`aiShotCaptureTab()` (getDisplayMedia), `AI_SHOT_MAX`. The pending list and
a native shell's capture plugin are the app's.

`web/client.js` — the exchange. The library never sees what the context
says or which tools exist; the host builds and runs all of it:
- `systemPrompt()`, `context(scope, budget)`, `terminalContext()`, `budget()`, `estimate(system, messages)`, `buildMessages(msgs, text, ctx, budget)` (history selection is the app's — e.g. which earlier turns may enter this request)
- `tools()`, `runTool(name, args)`, `modelName()`, `messageMeta()` → fields merged into every message the library stores (an app's own tags)
- `backend()` (default `aiPickBackend`), `jobsSupported()` (default `aiJobsSupported`) — overridable so an app's tests can stub one name
- `keys.terminal`, `canResume()`, `resumeScope()`
- `bubble(role, text, meta)` → an element-like `{textContent, dataset, classList}`; `showThinking(live, raw)`; `fillBubble(live, text)`; `liveBubble(jobId)`
- `busy(on)`, `afterSend()`, `restoreInput(text)`, `render()`, `poll()`, `landed(key, failed)`
- `text(key, ...args)` → optional wording override, keys in `AI_TEXT`

Exports: `aiSendText(host, text, {scope, at})`, `aiTerminalSend(host, text)`,
`aiRun(host, {msgs, text, scope, messages, jobId, live, key})`, `aiFinish`/`aiFail`
(`host, jobId, text|note, key`), `aiRepending`, `aiResume(host)`/`aiResumeSoon(host, ms)`,
`aiPartial(host)` (job id → words streamed so far). Runtime fields on
`host.state`: `askBusy`, `askPartial`, `askResumeTimer`, `askTerminalTimer`,
`askTerminalFast`.

`web/window.js` — the window, in ADOPT mode: it binds the app's existing
elements by id (`host.ids`, defaulting to `AI_WINDOW_IDS`: `asksheet asklog
askinput askstatus asksend askstop askmodesong askmodegen askmodeterm
askspanrow`) and draws into them; class names from `host.css`
(`AI_WINDOW_CSS`). Every sentence a user reads is the host's:
- `copyText(text, btn)`, `onDraftChange(hasText)`, `shotPaths()`/`restoreShots(paths)`
- `tabLabel(tab)`, `placeholder(tab)`, `onTabsChanged()`, `onTabPicked(tab)`, `keys.mode`
- `greeting(tab)` → text|null, `renderEarlier(div)` (a chat trimmed to its file), `msgTag(m)` → `{tag, dim}`, `noteLabel(from)`, `showText(content)`
- `send()` (the window's Send/Enter), `state.askBusy.abort()` is Stop

Exports: `aiGrow/aiScrollEnd/aiFocusIfKeyboard`, `aiBubble/aiFillBubble/
aiShowThinking`, `aiTabSet/aiTabButtons/aiTabRestore/aiTab`, `aiDraftLoad/
aiDraftSaveNow/aiDraftSaveSoon/aiDraftDrop`, `aiRenderLog`, `aiWindowBind`,
`aiClock`. Runtime fields on `host.state`: `askGeneral`, `askTerminal`,
`askDraftKey`, `askDraftTimer`.

## bridge/

`bridge/server.mjs` exports `startBridge(opts, profile)` and `main(argv,
profile)`. A consuming app keeps a thin shim that imports both `main` and
its own `profile` module and calls `main(process.argv, profile)` — see the
big comment at the top of `bridge/server.mjs` for the full flag/endpoint
reference and the `profile` shape (system-prompt fragments, the state
directory name, an optional extra static-file route, the startup-banner
label). `--repo` is required; the library has no default of its own, only
whatever `profile.repo` supplies.

`bridge/launchd/install.sh --entry <shim> --label <launchd label>
[bridge flags…]` installs a macOS launch agent that runs the given shim at
login and restarts it if it crashes (`--uninstall` removes it). See
`bridge/launchd/README.md`.
