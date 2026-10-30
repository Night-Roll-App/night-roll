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
- `tools()`, `runTool(name, args)`, `modelName()`, `messageMeta()` → fields merged into every message the library stores (an app's own tags). A `runTool` result of the shape `{final: "text"}` ends the exchange: the text (after any words the model said before the call) is the reply and the model gets no further round — for tools whose one result line is the whole answer (`aiToolFinal`/`aiFinalText` in backends.js; both the live loop and `aiResume` honour it; a round where only some results are final goes back to the model as usual)
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

## swift/ (BridgeChat)

The Swift package the native apps (Night Roll Tuner, Night Roll Guitar) use for their AI window. It talks only to
`bridge/server.mjs` over routes Night Roll already uses; there is no WKWebView and no bridge change. Feature
parity with Night Roll's window (minus song features) is tracked row by row in `docs/ai-window-parity.md`;
**a new feature in Night Roll's AI window adds a parity row.**

- `AIWindow` (view) over `AIWindowModel`: Front Desk (✦, the old Ask) and Worker (⌨, the old Terminal) tabs (Worker appears only when the bridge offers it),
  greeting, drafts per tab, now strip and Recent list, terminal model pickers, unread dot and working pulse,
  session line, Compact behind the in-package `BridgeConfirmSheet` (no native dialogs), Clear chat in the header
  as a two-tap button (first tap arms "Tap again to clear" for 3 s; no card — Josh #1009/#1010), screenshot and
  picture attachments, paste, dictation, composing notice. `ChatPanel` is a thin wrapper.
- `BridgeMonitor` polls `GET /v1/status` and `GET /v1/inbox`; `TerminalChat` posts `POST /v1/terminal`.
- Routes used: `POST /v1/chat/completions`, `GET|DELETE /v1/jobs/:id`, `GET /v1/models`, `POST /v1/terminal`,
  `GET /v1/inbox`, `GET /v1/status`, `GET|POST /v1/terminal-prefs`, `GET|DELETE /v1/sessions/:key`,
  `POST /v1/sessions/:key/compact`, `POST /v1/shot`, `POST /v1/app-state`, `PUT /v1/takes/<app>/<id>/<name>`
  (a recorded run: `audio.m4a` then `take.json`, stored under `<state dir>/takes/<app>/<id>/`, never pruned; 409 if a
  different-size file is already there, 413 past 300 MB) and `GET /v1/takes/<app>` (what is stored).
- Fixtures in `tests/fixtures/parity/*.json` are shared: `swift test` (in `swift/`) and
  `tests/parity-text.test.mjs` both read them, so a format change breaks both suites.
- `tests/lint.test.mjs` also walks `swift/Sources` (skipping dot-directories): no app vocabulary, no `.alert(`,
  `.confirmationDialog(`, `UIAlertController`, or `UIPasteboard`. The one exemption is `CopyButton.swift`, which
  may name `UIPasteboard` because it only writes (Copy); Paste is the system `PasteButton`.
- The bridge has ONE inbox: a note sent from the terminal with `--say` shows in Night Roll and in both native apps.

## Front Desk and Worker (bridge side)

One shared **Front Desk** session (app id `front-desk`) plus one **Worker** per app. The Front Desk
watches `GET /v1/terminal?app=front-desk` like a Worker does. `POST /v1/terminal` accepts `src` and `label`
(the asking app and one line of its context) and, for `front-desk`, answers `live`: `false` means nobody has
polled that queue for 90 s, so the row is stored as a one-off the watcher never sees; the app then asks
`/v1/chat/completions` with `x-nr-desk: <row id>` and the bridge writes the answer into the thread itself.
`GET /v1/desk?since=<t ms>` is the thread's live window (read-only, never marks the desk live).
`--forward --app all --from-app front-desk "…"` fans out to the three Workers; a forward from the desk also
writes a "→ handed to the … Worker" note. `GET /v1/status` and `GET /v1/jobs` carry `desk: true`; status adds
`deskLive`. Rows trimmed from `terminal.json` / `inbox.json` (past 200) are appended to
`<state>/archive/<file>-YYYY-MM.jsonl`.

### Ask chats hand work to the Worker: `RELAY:`

Every claude child is read-only (#644), so an Ask chat (a claude job from an app, not the `route_` helper and
not a Front Desk one-off) cannot write a request down itself. The bridge adds a paragraph to its system prompt:
when the user asks for something to be built, changed, fixed or remembered, put one `RELAY: <request in his own
words + song/bars context>` line in the reply and say so in plain words. When the turn ends the bridge strips
those lines from the reply (streamed and non-streamed alike), adds one terminal row per line to **the job's own
app** (`src:"ask"`, `label:"app chat"`; no ack, no router, so the Worker's watcher prints it like any message)
and appends `→ passed to the Worker (#n)` to the reply. At most 3 rows per reply; `RELAY:` inside a ```
fence is ignored; a reply without it is untouched. Tests: `tests/relay.test.mjs`.

## One AI: the instant reply (bridge side, #644 Phase 1)

Every `POST /v1/terminal` from an app (not a `fwd` hand-off, not `app:"all"`, not the web's `front-desk`) is
answered at once, before anything slow, with a canned note in **that row's own app** (`from:"terminal"`,
`auto:true`; every build already shows it in the Worker tab). The same text comes back as `ack`, with `live`.
- AI live (its watcher polled that app within 90 s): `Got it (#712).` (`routine:true`: BridgeChat hides it and shows ticks instead).
- AI busy: `Claude is busy and will see #712 shortly.` (a real note, shown).
- AI offline: `Claude isn't running on the Mac (last seen 9:41 PM). #712 is saved and Claude will get it when it starts. A quick read-only answer is coming.`
  (`not seen since the bridge started` when no watcher has polled yet; the last sentence is left out under `--no-claude`.)
  The bridge then runs one read-only job itself (session `<app>-quick`) and writes `Quick answer (Claude is offline): …`
  (`auto:true`, `quick:true`) into the same app. The row stays in the queue with `quick:true`, so the AI still gets it.
- The first time the watcher's GET returns the row after an offline answer: `Claude has #712 now.` (once, `auto:true`, `routine:true`).

**Ticks (WhatsApp style).** Each terminal row from an app carries `receivedAt` (stored = one grey tick), `deliveredAt` (the watcher's GET printed it = two grey) and `readAt` (the AI acted on it: `--status --msg n`, `--done n`, a helper ANSWERED = two blue; read implies delivered). `GET /v1/inbox?app=` adds `ticks: [{id, receivedAt, deliveredAt, readAt}]` (that app's last 30 own messages; omitted when empty) to the poll BridgeChat already makes. Old rows without the fields show no ticks.

`notesPreface` never feeds an `auto:true` note to a model. **Every `claude` the bridge starts is read-only**
(`--tools Read,Glob,Grep,WebFetch,WebSearch`: chat turns, quick answers, manual and warm compact; `--claude full` is
accepted but moot, and the prompt is always `profile.sys.read`) and gets `NR_BRIDGE_CHILD=1`. Only the interactive
terminal session writes code.

- `GET /v1/terminal?since=ID&app=a,b,c&wait=25`: several apps at once (split on commas), one cursor; `wait` (max 25 s)
  parks the request until a row arrives. Each listed app is stamped as polled, so `terminalLive` is right for all.
  Rows may carry `kind:"grant"` (the bridge telling the AI Josh allowed a command; the watcher prints `GRANT #k [app]: …`).
- `POST /v1/ai-session {session, terminal?, takeover?}`: registers the one AI; `409` while a different session polled
  within 90 s unless `takeover` or the same `terminal` (the tab id the SessionStart hook sends; a `/clear` keeps it).
  `{terminal}` alone only checks (the watcher's start). `GET /v1/ai-session` reads it. `GET /v1/status` adds `aiLive`
  and `aiSeenAt`.
- `POST /v1/asks/:id {decision}` is taken only on the decision listener `BRIDGE_DECIDE_ADDR` (the Mac's tailnet
  address, e.g. `100.73.74.71:8788`), from a peer in `BRIDGE_APPROVER_IPS` that `tailscale whois` maps to
  `BRIDGE_APPROVER`; on 127.0.0.1 or the ts.net proxy it is always `403`.
- CLI: `--done <n> "text"` posts the note to row n's app and marks the row done; `--status "text" --msg <n>` takes
  the app from row n.
- `tools/term-watch.sh [--apps a,b | --app a] [--takeover]`: the watcher (default apps night-roll, guitar, tuner,
  front-desk; cursor `term-seen-ai`, starting at the bridge's last row when missing). `--app` keeps the old
  single-app form and cursor files. Registers `$CLAUDE_CODE_SESSION_ID` (not with `--app`: that form never
  registers); `WATCH REFUSED` (exit 3) on a 409.

## The Front Desk tab (library side)

`web/desk.js` and `swift/Sources/BridgeChat/DeskChat.swift`: the ✦ tab becomes the one thread every app shares.
Off by default: a host opts in (web `host.keys.desk` + `deskOffered()`; Swift `ChatHost.deskEnabled`), and only
while the bridge's status says `desk: true` (an old bridge keeps the per-app Ask).

- Send: `aiDeskSend` / `DeskChat.send` POST `{app: "front-desk", src: <this app>, label: <one line>, text}`; no model
  call here. `live: false` in the answer means nobody is reading the Front Desk: the row is cached as a one-off and
  the app asks ONE chat request (`x-nr-song: front-desk-oneoff`, `x-nr-app: front-desk`, `x-nr-desk: <row id>`, no
  tools) whose answer the bridge writes into the thread itself.
- Read: `aiDeskPoll` / `DeskChat.poll` fetch `GET /v1/desk?since=<t ms>` and merge by kind + id. The cache is
  `host.keys.desk` (web, `{last, rows}`, no `msgs` field so it is never a chat) and `<key>-desk.json` (Swift).
- Host (web): `keys.desk`, `deskOffered()`, `deskLive()`, `deskLabel()`, optional `deskContext()` (default
  `terminalContext()`), `appName()`, `deskAppName(id)`, `deskSystemPrompt()`, `deskChanged(rows)` (new notes/reports
  arrived: the app's light), `earlierChat()` (the old Ask chat, read-only above the thread). Host (Swift): `deskEnabled`, `deskLabel()`, `earlierSessionKey`.
- The Worker tab is the old Terminal tab, unchanged.

`BridgeChatTestSupport` (swift/) is test-only: the stub bridge and the shared AI panel UI tests; no app target depends on it.
