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

Status: v0.1 — `aiSSE` (the streaming parser). The rest moves over in the
plan's steps 2–7.
