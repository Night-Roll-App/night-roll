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
1. Library repo with `web/sse.js` only + its own tests/CI. Night Roll:
   `tools/ai-sync.mjs`, `vendor/ai/` v0.1.0, all §1 wiring, `aiSSE` imported.
   Proves Pages + package + harness + SW on one pure function; browser-check
   offline and the iPad package.
2. Bridge server → `bridge/server.mjs` + profile; bridge.test moves to the
   library; Night Roll keeps the shim + `tests/bridge-shim.test.mjs` (health,
   models, /shapes, Learning convention in the system prompt). launchd keeps
   running `tools/claude-bridge.mjs`; update = `ai-sync --ref vX` then
   `launchctl kickstart -k gui/$UID/com.nightroll.bridge` (not while the app
   says typing — reuse the deploy-hold check).
3. Backends via `host.settings`/`host.confirm`; tests/ai.test.mjs unchanged
   is the oracle; library gets client.test with ported fake servers.
4. Store, ctx-cache, bridge-client, attach — with a fixture test that today's
   `ff1roll-*` keys load identically.
5. The client loop through `host.systemPrompt/context/tools/runTool`; all
   Learning tests stay in Night Roll and must stay green unchanged.
6. Window in adopt mode (binds today's `#ask*` markup; e2e selectors unchanged).
7. (Optional, last) the library renders its own markup + CSS +
   `mountAiSettings` — what makes a second iPad app need no copied HTML.

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
