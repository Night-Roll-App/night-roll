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

Status: v0.2 — `aiSSE` (the streaming parser, v0.1) plus `bridge/server.mjs`
(the Mac/Node bridge server and its CLI, v0.2: `startBridge(opts, profile)`
+ `main(argv, profile)`, a launchd installer under `bridge/launchd/`). The
rest (the remote/browser backends, the chat store, the AI window) moves
over in the plan's steps 3–7.

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
