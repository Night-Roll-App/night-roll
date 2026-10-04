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

Status: v0.3 — `aiSSE` (the streaming parser, v0.1), `bridge/server.mjs`
(the Mac/Node bridge server and its CLI, v0.2), `web/backends.js` (the
remote and in-browser backends, the connection probe, per-host consent,
v0.3). The rest (the chat store, the client loop, the AI window) moves over
in the plan's steps 4–6.

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
