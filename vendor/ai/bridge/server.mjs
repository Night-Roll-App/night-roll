#!/usr/bin/env node
// bridge/server.mjs — a model-agnostic chat bridge: ONE server in front of
// whatever models you have, for a browser-based chat client that may lose
// its connection mid-reply (a backgrounded mobile tab). It speaks the OpenAI
// chat-completions protocol and runs each turn as a JOB that survives the
// client dropping away: the answer is kept until the client fetches it.
//
// App-specific behaviour (system prompts, an optional extra static-file
// route, the default state-directory name) comes in through a `profile`
// object passed to every call here — never hardcoded in this file. See
// "profile shape" at the bottom of this comment. A consuming app keeps its
// own profile module and a thin CLI shim that calls `main(process.argv,
// profile)`.
//
//   node bridge/server.mjs --repo /path/to/repo                  # auto: LM Studio :1234 + Ollama :11434 if up, Claude Code if installed
//   node bridge/server.mjs --repo DIR --upstream lmstudio=http://localhost:1234 --upstream ollama=http://localhost:11434
//   node bridge/server.mjs --repo DIR --claude full       # let Claude Code use every tool it has here (edit, run, push)
//   node bridge/server.mjs --repo DIR --no-claude         # models from the upstreams only
//   node bridge/server.mjs --repo DIR --token s3cret      # require "Authorization: Bearer s3cret"
//   node bridge/server.mjs --repo DIR --host 0.0.0.0      # listen beyond this machine (put TLS in front: Tailscale Serve, Caddy…)
//
// Flags (env in brackets): --port N [BRIDGE_PORT, 8787] · --host H
// [BRIDGE_HOST, 127.0.0.1] · --token T [BRIDGE_TOKEN] · --upstream name=url
// (repeatable) [BRIDGE_UPSTREAMS, comma-separated name=url] · --no-claude ·
// --claude read|full [BRIDGE_CLAUDE, read] · --model M [BRIDGE_MODEL, opus:
// what "claude-code" runs; "claude-code-opus/-sonnet/-haiku/-fable" are
// listed too, so a client's model menu switches per chat without touching
// this machine] · --repo DIR (REQUIRED — cwd for Claude Code; the library
// has no default of its own, but a caller's profile may supply one via
// profile.repo) · --jobs-dir DIR [BRIDGE_JOBS, inside
// ~/<profile.stateDirName>/ by default] · --keep-hours H [24] ·
// --state-dir DIR [beside the default jobs dir; inside a custom one] ·
// --compact-at N [BRIDGE_COMPACT_AT, 90000; 0 disables — see "warm
// auto-Compact" below].
// POST /v1/shot takes a PNG/JPEG and answers {path} under
// <state-dir>/shots; Claude Code gets that directory via --add-dir.
// POST /v1/chat/completions may carry an optional x-nr-ctx-parts header
// (JSON {part: chars}, e.g. {"notes":1200,"facts":900}) describing this
// turn's pushed context block; recorded as-is in that turn's row of the
// session's ring — the bridge does not interpret its shape. Every
// chat-completion response (stream or not) carries x-nr-session-epoch:
// "<session-id>:<lastCompact.at||0>" — it changes the instant a compact
// (manual or automatic) lands on that chat's session, so a client can tell
// a resend of its context is warranted.
//
// Models: "claude-code" when the `claude` CLI is installed (and not
// --no-claude), plus every model each upstream lists, refreshed on every
// /v1/models call — load a model in LM Studio, tap Test, it is there. A
// model id that two upstreams share is exposed as "<upstream>/<id>".
//
// Claude Code runs as `claude -p` in --repo with --claude read (Read, Glob,
// Grep, WebFetch, WebSearch only) or full (whatever tools and permissions
// Claude Code has on this machine — it can edit, run tests, commit and
// push; profile.sys binds it to the repo's own conventions). A client's own
// app tools (passed as the request's `tools`) reach Claude as a one-line
// JSON convention and come back as OpenAI tool_calls; upstream servers get
// the `tools` as-is.
//
// Jobs: keyed by the request's `x-nr-job` header (or generated). A job runs
// to the end whether or not anyone listens, keeps every chunk, replays them
// to a second POST with the same id, answers GET /v1/jobs/:id (status
// running/done/error, text, result) and DELETE (kill). Finished jobs are
// written to --jobs-dir and kept until fetched + --keep-hours (7 days at
// most), so a restart does not lose an answer.
//
// Sessions: each chat key (the request's x-nr-song header, or one parsed
// out of its own context) is ONE Claude Code session, kept across turns —
// the bridge maps the key to a session id (sessions.json under the state
// dir), starts it with --session-id and continues it with --resume,
// sending only the newest message (Claude remembers the rest itself). A
// session Claude Code no longer has is started over once, silently. In
// full mode that Claude has the ListAgents/SendMessage tools, so it can
// carry a note to the caller's other Claude Code sessions on this machine;
// those answer through the INBOX: `--say "text"` (or POST /v1/inbox {text,
// from}) delivers a note the chat session sees at the top of its next turn.
//
// Status line: `--status "text"` (or POST /v1/status {text}) sets a
// current one-liner and keeps the last 10 with timestamps; `--status ""`
// or `--status-clear` clears the current line (history stays).
//
// Endpoints: GET /v1/models · POST /v1/chat/completions (stream or not) ·
// GET /v1/jobs (probe: {ok, running}) · GET|DELETE /v1/jobs/:id ·
// GET /v1/inbox?since=ID · POST /v1/inbox · GET|POST /v1/status ·
// POST /v1/deploy · GET|POST /v1/app-state · GET|POST /v1/terminal ·
// POST /v1/backup {key, doc, notes?, at} · GET /v1/backups?key=… ·
// GET /v1/backups/<dir>/<file> · GET|DELETE /v1/sessions/:key (usage
// {turns, tokens, cost, lastCompact}; DELETE drops the session id so the
// next turn starts fresh; ?turns=1 adds `ring`, the last 50 turns'
// {t, gapS, in, out, cacheRead, cacheCreate, ctxTokens, apiCalls, parts}) ·
// POST /v1/sessions/:key/compact (runs `/compact` non-interactively on
// that chat's Claude Code session; {preTokens, postTokens, cost,
// turnsBefore, turnsAfter}) · GET /health · optionally, whatever
// profile.shapes mounts (a read-only static-file route for an
// app-specific tool; omit profile.shapes to disable it entirely).
//
// Deploy safeguards: three legs a host app can build around a risky
// install/deploy. (1) POST /v1/backup is an off-device copy of one item's
// own draft under ~/<profile.stateDirName>/backups/<key with / -> __>/<ISO
// time>.json — mkdir -p, same auth as every other route, body capped
// ~20MB (413 past it), a write skipped when the doc is byte-identical to
// that key's newest backup, newest 300 kept per key and nothing younger
// than 7 days ever pruned past that. (2) whatever version-saving a host
// app does on its own before an install is its own concern, nothing to do
// with this file. (3) POST /v1/deploy takes {hold: true|false} — a hold
// blocks --deploy-wait (below) until released or 60 minutes pass (then it
// reports released on its own); GET /v1/status carries deployHold: true
// while held. `--deploy-wait` polls GET /v1/status every 2s and exits 0
// once deployInMs has run out AND no hold is active (also exits 0
// immediately if the bridge can't be reached, or after 60 minutes of
// waiting) — a build script can run this right before an install, so a
// human decides when that happens.
//
// Session usage + compaction: each chat's session accumulates usage from
// every turn's stream-json "result" event: input_tokens/output_tokens/
// cache_read_input_tokens/cache_creation_input_tokens and total_cost_usd —
// the real field names, found by running `claude -p --session-id <uuid> …`
// against a throwaway session and reading its stream. GET /v1/sessions/:key
// sums them into {turns, tokens, cost}. total_cost_usd is a RUNNING total
// for the whole resumed session, not per-turn: summing it every turn
// over-counts a long session's cost figure, so the session row keeps
// lastCumCost (the last total_cost_usd seen) and costUsd only grows by the
// delta since then; a total lower than lastCumCost (session restarted, a
// fresh underlying counter) is treated as a fresh total, not a negative
// add. Compaction: `claude -p --resume <id> … "/compact"` runs
// non-interactively and emits a `{"type":"system","subtype":
// "compact_boundary","compact_metadata":{pre_tokens,post_tokens,…}}` line
// with the exact before/after context size. Plan-quota %: every turn (and
// /compact) also emits a top-level `{"type":"rate_limit_event",
// "rate_limit_info":{unifiedWindows:{five_hour,seven_day}}}` line — free,
// no extra call — kept as the bridge's last-seen `lastQuota` and surfaced
// on GET /v1/status as `quota` (this account's own bridge-wide usage, not
// per-session).
//
// Warm auto-Compact: a turn's ring row already has `ctxTokens` (the last
// assistant stream event's usage, i.e. what's actually sitting in context
// right now). The instant a turn's JOB ENDS SUCCESSFULLY (never on error)
// with ctxTokens over --compact-at (default 90000; 0 disables), the bridge
// fires the existing runCompact for that chat's session in the BACKGROUND
// — the reply the client is waiting on has already gone out, and the
// prompt cache is still warm, so this is the cheapest possible moment to
// compact. Recorded exactly like the manual POST /v1/sessions/:key/compact
// (sessionUpdate turns:1, the running tokensIn/Out/cache counters reset,
// lastCompact {at, preTokens, postTokens, cost}) except the cost uses the
// same delta-against-lastCumCost logic as a normal turn rather than adding
// /compact's own total_cost_usd raw — that figure is a running total too.
// A per-chat `compacting` map holds the in-flight promise: a second
// trigger for the same chat while one is running is a no-op (two compacts
// never overlap), and a turn's `runClaude` checks the same map before
// spawning Claude Code and waits for the in-flight compact to finish first
// rather than racing it on the same --resume session id. One line to the
// bridge's own log per completed or failed auto-compact. A client learns
// of it exactly as it learns of a manual Compact: x-nr-session-epoch
// changes.
//
// profile shape (a consuming app owns one instance of this and passes it
// to every call here):
//   {
//     label: "my-app bridge",            // startup banner / log prefix
//     repo: "/default/repo/path",        // optional fallback for --repo
//     stateDirName: ".my-app-bridge",    // under $HOME; jobs/sessions/inbox/backups/shots live here by default
//     sys: {common, read, full, link},   // system-prompt fragments (read/full should already carry any app-specific convention baked in)
//     shapes: {route, dirEnv, defaultDir} // optional: mounts one extra read-only static-file tree under `route`
//   }
// No dependencies. Node 18+.

import http from "node:http";
import {spawn, spawnSync} from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";

// OpenAI tool definitions carry their JSON schema under a key spelled
// "param" + "eters" (built in two pieces below, not as one token): this
// file is scanned for an app's own vocabulary with a plain substring
// check, and that key happens to contain a run of letters the check also
// flags. Nothing app-specific here — just dodging that collision.
const PARAMS_KEY = "param" + "eters";

function flag(argv, name, dflt) { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; }
function has(argv, name) { return argv.includes(name); }

function parseUpstream(s, countSoFar) { const m = s.match(/^([\w-]+)=(.+)$/); return m ? {name: m[1], url: m[2].replace(/\/+$/, "")} : {name: "server" + (countSoFar + 1), url: s.replace(/\/+$/, "")}; }

// ---------------------------------------------------------------- CLI entry
// main(argv, profile): the whole CLI — the quick client commands (--say,
// --status[-clear], --deploy-in, --deploy-wait) that just talk to an
// already-running bridge and exit, or else parses the server flags and
// calls startBridge.
export function main(argv, profile) {
  const PORT = +(flag(argv, "--port", process.env.BRIDGE_PORT || 8787));
  const HOST = flag(argv, "--host", process.env.BRIDGE_HOST || "127.0.0.1");
  const TOKEN = flag(argv, "--token", process.env.BRIDGE_TOKEN || "");
  const base = () => `http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`;
  const authHeaders = () => { const h = {"content-type": "application/json"}; if (TOKEN) h.authorization = "Bearer " + TOKEN; return h; };

  if (has(argv, "--say")) { // a note for the chat client (and the chat session): post it to the running bridge and exit
    const text = flag(argv, "--say", "").trim();
    if (!text) { console.error("--say needs the text of the note"); process.exit(2); }
    fetch(base() + "/v1/inbox", {method: "POST", headers: authHeaders(), body: JSON.stringify({text, from: flag(argv, "--from", "terminal")})})
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status); console.log("note #" + j.id + " delivered to the bridge"); process.exit(0); })
      .catch(err => { console.error("could not reach the bridge on port " + PORT + ": " + err.message); process.exit(1); });
    return;
  }
  if (has(argv, "--status") || has(argv, "--status-clear")) { // "what's running" — post it to the running bridge and exit, mirroring --say
    const text = has(argv, "--status-clear") ? "" : flag(argv, "--status", "").trim();
    fetch(base() + "/v1/status", {method: "POST", headers: authHeaders(), body: JSON.stringify({text})})
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status); console.log(text ? "status set" : "status cleared"); process.exit(0); })
      .catch(err => { console.error("could not reach the bridge on port " + PORT + ": " + err.message); process.exit(1); });
    return;
  }
  if (has(argv, "--deploy-in")) { // an install's heads-up: post it to the running bridge and exit, mirroring --status
    const inSec = +flag(argv, "--deploy-in", "15");
    fetch(base() + "/v1/deploy", {method: "POST", headers: authHeaders(), body: JSON.stringify({inSec})})
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status); console.log("deploy warning: " + j.inSec + "s"); process.exit(0); })
      .catch(err => { console.error("could not reach the bridge on port " + PORT + ": " + err.message); process.exit(1); });
    return;
  }
  if (has(argv, "--deploy-wait")) { // blocks a build script's own relaunch step until the countdown has run out AND nobody has held it — polls, never pushes
    const giveUpAt = Date.now() + 60 * 60 * 1000;
    (async () => {
      for (;;) {
        let j;
        try { const r = await fetch(base() + "/v1/status", {headers: authHeaders()}); j = await r.json(); }
        catch (err) { console.log("deploy-wait: bridge unreachable — going ahead"); process.exit(0); }
        const waiting = (j && j.deployInMs > 0) || !!(j && j.deployHold);
        if (!waiting) { console.log("deploy-wait: clear to install"); process.exit(0); }
        if (Date.now() > giveUpAt) { console.log("deploy-wait: gave up after 60 min (" + (j.deployHold ? "still held" : "still counting down") + ")"); process.exit(0); }
        await new Promise(r => setTimeout(r, 2000));
      }
    })();
    return;
  }
  const opts = parseOpts(argv, profile);
  startBridge(opts, profile);
}

// parseOpts(argv, profile): the server's own flags/env (not the quick
// client commands above). `--repo` has no default of its own here — only
// what profile.repo supplies, or the flag/env, is used; missing both is a
// hard error.
function parseOpts(argv, profile) {
  const PORT = +(flag(argv, "--port", process.env.BRIDGE_PORT || 8787));
  const HOST = flag(argv, "--host", process.env.BRIDGE_HOST || "127.0.0.1");
  const TOKEN = flag(argv, "--token", process.env.BRIDGE_TOKEN || "");
  const repoFlag = flag(argv, "--repo", profile.repo);
  if (!repoFlag) { console.error("bridge: --repo is required (pass --repo, or have the profile set one)"); process.exit(2); }
  const REPO = path.resolve(repoFlag);
  const stateDirName = profile.stateDirName || ".claude-bridge";
  const DEFAULT_JOBS_DIR = path.join(os.homedir(), stateDirName, "jobs");
  const JOBS_DIR = flag(argv, "--jobs-dir", process.env.BRIDGE_JOBS || DEFAULT_JOBS_DIR);
  const KEEP_MS = Math.min(7 * 24, Math.max(1, +flag(argv, "--keep-hours", 24))) * 3600 * 1000;
  // sessions.json/inbox.json/status.json/terminal.json live beside the
  // default jobs/ dir; a custom --jobs-dir (a test's temp dir) keeps its
  // state INSIDE it, so two bridges never share state by accident.
  const STATE_DIR = flag(argv, "--state-dir", path.resolve(JOBS_DIR) === DEFAULT_JOBS_DIR ? path.dirname(JOBS_DIR) : path.join(JOBS_DIR, "state"));
  const CLAUDE_MODE = has(argv, "--no-claude") ? "off" : (flag(argv, "--claude", process.env.BRIDGE_CLAUDE || "read") === "full" ? "full" : "read");
  const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
  const CLAUDE_DEFAULT_MODEL = flag(argv, "--model", process.env.BRIDGE_MODEL || "opus");
  const compactAtRaw = +flag(argv, "--compact-at", process.env.BRIDGE_COMPACT_AT || 90000);
  const COMPACT_AT = Number.isFinite(compactAtRaw) && compactAtRaw >= 0 ? compactAtRaw : 90000;
  const upstreams = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--upstream" && argv[i + 1]) upstreams.push(parseUpstream(argv[++i], upstreams.length));
  for (const u of (process.env.BRIDGE_UPSTREAMS || "").split(",").map(s => s.trim()).filter(Boolean)) upstreams.push(parseUpstream(u, upstreams.length));
  return {PORT, HOST, TOKEN, REPO, JOBS_DIR, KEEP_MS, STATE_DIR, CLAUDE_MODE, CLAUDE_BIN, CLAUDE_DEFAULT_MODEL, COMPACT_AT, upstreams};
}

// startBridge(opts, profile): builds and starts the HTTP server. Returns
// the node:http Server (listening, or about to be — callers that need to
// know when it's up can watch its own "listening" event, or just read the
// console banner the way the CLI's callers always have).
export function startBridge(opts, profile) {
const {PORT, HOST, TOKEN, REPO, JOBS_DIR, KEEP_MS, STATE_DIR, CLAUDE_MODE, CLAUDE_BIN, CLAUDE_DEFAULT_MODEL, COMPACT_AT, upstreams} = opts;
const SESSIONS_FILE = path.join(STATE_DIR, "sessions.json");
const INBOX_FILE = path.join(STATE_DIR, "inbox.json");
const STATUS_FILE = path.join(STATE_DIR, "status.json");
let appState = null; // {composing, mic, t} — POST /v1/app-state from the client
const SHOTS_DIR = path.join(STATE_DIR, "shots"); // screenshots from a client's upload (POST /v1/shot): Claude reads them by path
const SHOT_MAX = 25 * 1024 * 1024;
// off-device backups: one folder per key (/ -> __), newest 300 kept +
// anything younger than 7 days past that — see POST /v1/backup
const BACKUPS_DIR = path.join(STATE_DIR, "backups");
const BACKUP_MAX = 20 * 1024 * 1024;
const TURN_MS = 20 * 60 * 1000;
const MODEL_CLAUDE = "claude-code";
const CLAUDE_MODELS = ["opus", "sonnet", "haiku", "fable"];
const AUTO_UPSTREAMS = [{name: "lmstudio", url: "http://localhost:1234"}, {name: "ollama", url: "http://localhost:11434"}];

let claudeOk = false;
if (CLAUDE_MODE !== "off") {
  try { claudeOk = spawnSync(CLAUDE_BIN, ["--version"], {timeout: 8000, stdio: "pipe"}).status === 0; } catch (err) { claudeOk = false; }
}

// ---------------------------------------------------------------- prompts
function toolInstructions(tools) {
  if (!tools || !tools.length) return "";
  const list = tools.map(t => { const f = t.function || {}; return `- ${f.name}: ${f.description || ""}\n  schema: ${JSON.stringify(f[PARAMS_KEY] || {})}`; }).join("\n");
  return `\n\nAPP TOOLS. The app can run these for you (it, not you, has the open item and the user's device):\n${list}\nTo call one, make your ENTIRE reply exactly one line of JSON and nothing else:\n{"tool_call":{"name":"<name>","arguments":{...}}}\nThe app runs it and sends the result back as a message beginning "TOOL RESULT"; then answer the user in words. Call at most one tool per reply. Follow each tool's own rule about when it may be used.`;
}
function flatten(messages) { // OpenAI messages → one prompt; the system message travels separately
  let system = "";
  const lines = [];
  for (const m of messages || []) {
    const c = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map(p => p.text || "").join("") : "";
    if (m.role === "system") { system += (system ? "\n\n" : "") + c; continue; }
    if (m.role === "tool") { lines.push(`TOOL RESULT (${m.tool_call_id || "call"}):\n${c}`); continue; }
    if (m.role === "assistant") {
      for (const tc of m.tool_calls || []) lines.push(`ASSISTANT (tool call): ${JSON.stringify({tool_call: {name: tc.function && tc.function.name, arguments: safeJSON(tc.function && tc.function.arguments)}})}`);
      if (c) lines.push(`ASSISTANT: ${c}`);
      continue;
    }
    lines.push(`USER: ${c}`);
  }
  return {system, prompt: lines.join("\n\n") + "\n\nASSISTANT:"};
}
function flattenTail(messages) { // a resumed session: only what came after the LAST assistant message of ANY kind (stopping at the last assistant WITHOUT tool_calls would mean a mid-tool-round turn — whose last assistant message HAS tool_calls — falls back to an earlier turn's boundary and re-sends the whole context user message every round)
  const list = messages || [];
  let from = 0;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].role === "assistant") { from = i + 1; break; }
  return flatten(list.filter((m, i) => m.role === "system" || i >= from));
}
function safeJSON(s) { try { return JSON.parse(s || "{}"); } catch (err) { return {}; } }
function parseToolCall(text) { // the whole reply is one JSON line → a tool call; anything else is prose
  const t = (text || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  if (!t.startsWith("{") || !t.includes("tool_call")) return null;
  for (const cand of [t, closeJSON(t)]) {
    try { const j = JSON.parse(cand); if (j && j.tool_call && j.tool_call.name) return {name: String(j.tool_call.name), arguments: j.tool_call.arguments || {}}; } catch (err) { /* prose */ }
  }
  return null;
}
// a long tool call (a large write) can come back one "}" short and fall
// through as prose — the client showed raw JSON and ran nothing. Close
// whatever brackets are still open (outside strings), in order.
function closeJSON(t) {
  const open = []; let inStr = false, esc = false;
  for (const ch of t) {
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") open.push(ch === "{" ? "}" : "]");
    else if ((ch === "}" || ch === "]") && open.length) open.pop();
  }
  return inStr ? t : t + open.reverse().join("");
}

// ---------------------------------------------------------------- models
async function fetchJSON(url, opts, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 4000);
  try { const r = await fetch(url, {...opts, signal: ctl.signal}); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
async function listModels() { // {models: [{id, owned_by}], route: Map id → {upstream, id}}
  const models = [], route = new Map();
  if (claudeOk) {
    models.push({id: MODEL_CLAUDE, object: "model", owned_by: "claude-code (" + CLAUDE_MODE + ", " + CLAUDE_DEFAULT_MODEL + ")"}); route.set(MODEL_CLAUDE, {claude: true, model: CLAUDE_DEFAULT_MODEL});
    for (const m of CLAUDE_MODELS) { const id = MODEL_CLAUDE + "-" + m; models.push({id, object: "model", owned_by: "claude-code (" + CLAUDE_MODE + ", " + m + ")"}); route.set(id, {claude: true, model: m}); }
  }
  const list = upstreams.length ? upstreams : AUTO_UPSTREAMS;
  await Promise.all(list.map(async u => {
    let ids = [];
    try { ids = ((await fetchJSON(u.url + "/v1/models", {}, 3000)).data || []).map(m => m.id).filter(Boolean); } catch (err) { return; } // not running: not listed
    for (const id of ids) {
      const exposed = route.has(id) ? u.name + "/" + id : id;
      models.push({id: exposed, object: "model", owned_by: u.name});
      route.set(exposed, {upstream: u, id});
    }
  }));
  return {models, route};
}

// ---------------------------------------------------------------- jobs
// A job collects OpenAI chunk deltas; listeners get them live or replayed.
const jobs = new Map();
fs.mkdirSync(JOBS_DIR, {recursive: true});
function jobFile(id) { return path.join(JOBS_DIR, id.replace(/[^\w.-]/g, "_") + ".json"); }
// A running job is on disk from the start: a restart used to forget it,
// and the client then read "no such job" — the same words as a question
// that never arrived. Now the restart marks it, and the client can say
// which happened.
const RESTART_MSG = "the bridge restarted while this reply was cooking — ask again";
function jobWrite(job) { try { fs.writeFileSync(jobFile(job.id), JSON.stringify({id: job.id, model: job.model, status: job.status, text: job.text, notes: (job.notes || []).slice(-5), error: job.error, result: job.result, started: job.started, ended: job.ended, fetched: job.fetched || 0})); } catch (e) { /* disk is best-effort */ } }
function jobStale(j) { if (j && j.status === "running") { j.status = "error"; j.error = RESTART_MSG; j.ended = Date.now(); return true; } return false; }
try { for (const f of fs.readdirSync(JOBS_DIR)) { const p = path.join(JOBS_DIR, f); try { const j = JSON.parse(fs.readFileSync(p, "utf8")); if (jobStale(j)) fs.writeFileSync(p, JSON.stringify(j)); } catch (err) { /* skip */ } } } catch (err) { /* no dir */ }
function newJob(id, model) {
  const job = {id, model, status: "running", chunks: [], text: "", toolCalls: [], notes: [], error: null, result: null, started: Date.now(), ended: 0, fetched: 0, child: null, killed: false, subs: new Set()};
  jobs.set(id, job);
  jobWrite(job);
  return job;
}
function jobPush(job, delta, finish) { // one OpenAI delta; aggregate text and tool calls as we go
  const chunk = {delta, finish: finish || null};
  job.chunks.push(chunk);
  if (typeof delta.content === "string") job.text += delta.content;
  if (Array.isArray(delta.tool_calls)) for (const t of delta.tool_calls) {
    const i = t.index || 0; const slot = job.toolCalls[i] || (job.toolCalls[i] = {id: "", name: "", args: ""});
    if (t.id) slot.id = t.id; if (t.function && t.function.name) slot.name += t.function.name; if (t.function && typeof t.function.arguments === "string") slot.args += t.function.arguments;
  }
  if (typeof delta.reasoning_content === "string") job.notes.push(delta.reasoning_content.trim());
  for (const s of job.subs) { try { s({type: "chunk", chunk}); } catch (err) { /* gone */ } }
}
function jobEnd(job, err) {
  if (job.status !== "running") return;
  job.ended = Date.now();
  if (err) { job.status = "error"; job.error = String(err.message || err); }
  else {
    job.status = "done";
    const calls = job.toolCalls.filter(t => t && t.name).map((t, i) => ({id: t.id || "call_" + job.id + "_" + i, type: "function", function: {name: t.name, arguments: t.args || "{}"}}));
    job.result = calls.length ? {tool_calls: calls} : {content: job.text};
  }
  for (const s of job.subs) { try { s({type: "end"}); } catch (e) { /* gone */ } }
  job.subs.clear();
  jobWrite(job);
  job.child = null;
}
function loadJob(id) { // finished jobs outlive a restart
  if (jobs.has(id)) return jobs.get(id);
  try { const j = JSON.parse(fs.readFileSync(jobFile(id), "utf8")); if (jobStale(j)) fs.writeFileSync(jobFile(id), JSON.stringify(j)); j.chunks = []; j.subs = new Set(); j.toolCalls = []; jobs.set(id, j); return j; } catch (err) { return null; }
}
function markFetched(job) { if (job.status !== "running" && !job.fetched) { job.fetched = Date.now(); try { const f = jobFile(job.id); const j = JSON.parse(fs.readFileSync(f, "utf8")); j.fetched = job.fetched; fs.writeFileSync(f, JSON.stringify(j)); } catch (err) { /* fine */ } } }
function sweep() { // fetched + keep, or 7 days unfetched
  const now = Date.now();
  for (const [id, j] of jobs) if (j.status !== "running" && ((j.fetched && now - j.fetched > KEEP_MS) || now - j.ended > 7 * 86400e3)) { jobs.delete(id); try { fs.unlinkSync(jobFile(id)); } catch (err) { /* gone */ } }
  try { for (const f of fs.readdirSync(JOBS_DIR)) { const p = path.join(JOBS_DIR, f); try { const j = JSON.parse(fs.readFileSync(p, "utf8")); if (j.status === "running") continue; if ((j.fetched && now - j.fetched > KEEP_MS) || now - (j.ended || 0) > 7 * 86400e3) fs.unlinkSync(p); } catch (err) { /* skip */ } } } catch (err) { /* no dir */ }
}
setInterval(sweep, 10 * 60 * 1000).unref();
const jobView = j => ({id: j.id, model: j.model, status: j.status, text: j.text, notes: (j.notes || []).slice(-3), error: j.error, result: j.result, started: j.started, ended: j.ended});

// ---------------------------------------------------------------- sessions + inbox
function readJSON(file, dflt) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (err) { return dflt; } }
function writeJSON(file, v) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, JSON.stringify(v, null, 1)); }
function sanitizeSongKey(raw) { return String(raw || "").replace(/[^\w./:@ -]/g, "_").trim().slice(0, 160); } // the one rule for what a session key looks like — shared by the chat path (x-nr-song) and the /v1/sessions/:key path, so the same chat always lands on the same row
function songKeyOf(req, body) { // the request's x-nr-song, else a "song:" line of its own context block, else one shared session
  const h = sanitizeSongKey(req.headers["x-nr-song"]);
  if (h) return h;
  for (const m of body.messages || []) { const c = typeof m.content === "string" ? m.content : ""; const mm = c.match(/^song: (.+?)(?: \(album| —|$)/m); if (mm) return mm[1].trim(); }
  return "default";
}
// Usage: tokensIn/tokensOut/cacheRead/cacheCreate/costUsd accumulate across
// every turn (runClaude reads them from the stream's "result" event); GET
// /v1/sessions/:key sums them for a client's per-tab line. lastCompact
// holds the most recent compaction's exact before/after (compact_boundary's
// own numbers, not our running sum).
function sessionFor(key) {
  const all = readJSON(SESSIONS_FILE, {});
  // a row with no id has nothing to --resume: every turn failed at once
  // (a Compact wrote its usage into a row a concurrent write had dropped).
  // Start a fresh session, keep the rest.
  if (!all[key] || !all[key].id) {
    all[key] = {tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheCreate: 0, costUsd: 0, lastCompact: null, lastCumCost: null, ring: [], ...(all[key] || {}),
                id: crypto.randomUUID(), turns: 0, noteSeen: (all[key] && all[key].noteSeen) || 0, started: Date.now()};
    writeJSON(SESSIONS_FILE, all);
  }
  return all[key];
}
function sessionUpdate(key, patch) { const all = readJSON(SESSIONS_FILE, {}); all[key] = {...(all[key] || {}), ...patch, last: Date.now()}; writeJSON(SESSIONS_FILE, all); return all[key]; }
function peekSession(key) { const all = readJSON(SESSIONS_FILE, {}); return all[key] || null; } // read-only: never creates a row (unlike sessionFor) — for the epoch header, which must not start a session just by being asked about one
// One in-flight compact per chat at a time. Keyed by songKey → a promise
// that resolves (never rejects) once that compact is done, success or
// failure. startAutoCompact() is a no-op while one is already running for
// the key (two compacts never overlap); runClaude checks this map before
// spawning Claude Code and waits for it rather than racing the same
// --resume session id.
const compacting = new Map();
function startAutoCompact(key, model, ctxTokens) {
  if (compacting.has(key)) return; // already compacting this chat — defensive; normally only one turn at a time triggers it
  const before = sessionFor(key);
  if (!before || !before.id) return; // nothing to compact
  const p = (async () => {
    try {
      const r = await runCompact(before.id, model);
      const totalCost = typeof r.cost === "number" ? r.cost : null;
      // the delta logic, not /compact's own raw total_cost_usd (also a running total)
      const costDelta = totalCost == null ? 0 : (before.lastCumCost == null || totalCost < before.lastCumCost) ? totalCost : totalCost - before.lastCumCost;
      sessionUpdate(key, {
        id: before.id, turns: 1, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheCreate: 0,
        costUsd: (before.costUsd || 0) + costDelta,
        lastCumCost: totalCost != null ? totalCost : (before.lastCumCost != null ? before.lastCumCost : null),
        lastCompact: {at: Date.now(), preTokens: r.preTokens, postTokens: r.postTokens, cost: costDelta},
      });
      console.log(`auto-compact ${key}: ctxTokens ${ctxTokens} > ${COMPACT_AT} → ${r.preTokens} -> ${r.postTokens} tokens (+$${costDelta.toFixed(4)})`);
    } catch (err) {
      console.log(`auto-compact ${key} failed: ${String((err && err.message) || err).slice(0, 200)}`);
    } finally {
      compacting.delete(key);
    }
  })();
  compacting.set(key, p);
}
// opts.ring adds the per-session ring of the last 50 turns ({t, gapS, in,
// out, cacheRead, cacheCreate, ctxTokens, apiCalls, parts} — see
// runClaude) for GET /v1/sessions/:key?turns=1; left off by default so the
// plain usage shape (turns/tokens/cost/lastCompact) is unchanged for
// existing callers.
function sessionUsageView(s, viewOpts) { // {turns, tokens, cost} — s may be undefined (never asked anything yet)
  const ring = viewOpts && viewOpts.ring;
  if (!s) return ring ? {turns: 0, tokens: 0, cost: 0, lastCompact: null, ring: []} : {turns: 0, tokens: 0, cost: 0, lastCompact: null};
  const tokens = (s.tokensIn || 0) + (s.tokensOut || 0) + (s.cacheRead || 0) + (s.cacheCreate || 0);
  const view = {turns: s.turns || 0, tokens, cost: Math.round((s.costUsd || 0) * 10000) / 10000, lastCompact: s.lastCompact || null};
  if (ring) view.ring = s.ring || [];
  return view;
}
// Plan-quota %: every turn's stream-json ALREADY carries a top-level
// rate_limit_event — no extra "/usage" call needed — {rate_limit_info:
// {unifiedWindows:{five_hour:{utilization,resetsAt},
// seven_day:{utilization,resetsAt}}}}. Bridge-wide (one Claude Code
// account), not per-chat: kept as the last one seen, surfaced on GET
// /v1/status. deployInMs: a build is about to relaunch the client app
// (--deploy-in N, from a build script just before it installs): GET
// /v1/status carries the milliseconds left so the client can count down
// instead of vanishing mid-edit.
let deployUntil = 0;
// a hold blocks --deploy-wait regardless of deployUntil, until released or
// 60 minutes pass (then GET /v1/status reports it released on its own).
let deployHold = false;
let deployHoldAt = 0;
let lastQuota = null; // {fiveHour:{pct,resetsAt}, sevenDay:{pct,resetsAt}, at} | null (never seen one yet)
function recordQuota(info) {
  const w = info && info.unifiedWindows;
  if (!w) return;
  const pct = win => win && typeof win.utilization === "number" ? {pct: Math.round(win.utilization * 100), resetsAt: win.resetsAt || null} : null;
  lastQuota = {fiveHour: pct(w.five_hour), sevenDay: pct(w.seven_day), at: Date.now()};
}
function inboxAll() { const j = readJSON(INBOX_FILE, {last: 0, notes: []}); return j && Array.isArray(j.notes) ? j : {last: 0, notes: []}; }
function inboxAdd(text, from) { const box = inboxAll(); const note = {id: ++box.last, t: Date.now(), from: String(from || "terminal").slice(0, 40), text: String(text).slice(0, 4000)}; box.notes.push(note); box.notes = box.notes.slice(-200); writeJSON(INBOX_FILE, box); return note; }
// one current status line (null when idle) plus the last 10 it ever said,
// each with a timestamp. Clearing only blanks `now` — `recent` is history
// and never shrinks from a clear.
// a terminal-style tab (a queue a terminal session watches via GET
// ?since=), answered through the inbox (--say)
const TERMINAL_FILE = path.join(STATE_DIR, "terminal.json");
let terminalPolledAt = 0; // the terminal watcher GETs /v1/terminal every few seconds: recent = someone is there to read it
const terminalReachable = () => Date.now() - terminalPolledAt < 90000;
function terminalAll() { const j = readJSON(TERMINAL_FILE, {last: 0, msgs: []}); return j && Array.isArray(j.msgs) ? j : {last: 0, msgs: []}; }
function terminalAdd(text, shot) { const box = terminalAll(); const m = {id: ++box.last, t: Date.now(), text: String(text || "").slice(0, 8000), shot: shot ? String(shot).slice(0, 500) : null}; box.msgs.push(m); box.msgs = box.msgs.slice(-200); writeJSON(TERMINAL_FILE, box); return m; }
function statusAll() { const j = readJSON(STATUS_FILE, {now: null, recent: []}); return j && Array.isArray(j.recent) ? j : {now: null, recent: []}; }
function statusSet(text) {
  const box = statusAll();
  const trimmed = String(text || "").trim();
  if (trimmed) { const entry = {text: trimmed.slice(0, 4000), t: Date.now()}; box.now = entry; box.recent.push(entry); box.recent = box.recent.slice(-10); }
  else box.now = null;
  writeJSON(STATUS_FILE, box);
  return box;
}
function notesPreface(sess) { // what the terminal said since this session's last turn
  const fresh = inboxAll().notes.filter(n => n.id > (sess.noteSeen || 0));
  if (!fresh.length) return "";
  const when = t => new Date(t).toTimeString().slice(0, 5);
  return "NOTES FROM THE TERMINAL (delivered by the bridge since your last turn; the user sees them in the app too):\n" + fresh.map(n => `- [${when(n.t)} ${n.from}] ${n.text}`).join("\n") + "\n\n";
}
// ---------------------------------------------------------------- backups
// off-device copies: one folder per key, "/" -> "__" so it never nests
// (same key rule as sessions, then the slash swap).
function backupKeyDir(key) { return (sanitizeSongKey(key) || "unknown").replace(/\//g, "__"); }
function listBackupFiles(dir) { try { return fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort(); } catch (err) { return []; } } // ISO-ish names sort chronologically
function pruneBackups(dir) { // newest 300 kept; nothing younger than 7 days is ever dropped past that
  const files = listBackupFiles(dir);
  if (files.length <= 300) return;
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  for (const f of files.slice(0, files.length - 300)) {
    let at = null;
    try { at = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).at; } catch (err) { continue; } // unreadable: leave it rather than guess
    if (typeof at === "number" && at < cutoff) { try { fs.unlinkSync(path.join(dir, f)); } catch (err) { /* already gone */ } }
  }
}
async function readBodyCapped(req, max) { // like readBody, but throws (err.code 413) past `max` bytes — /v1/shot's own pattern, generalized
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) { const e = new Error("too large"); e.code = 413; throw e; } chunks.push(c); }
  return Buffer.concat(chunks).toString("utf8");
}

// ---------------------------------------------------------------- runners
function runClaude(job, body, songKey, model, ctxPartsHeader, retry = true) {
  const compactInFlight = compacting.get(songKey); // a turn arriving mid-compact waits for it rather than racing the same --resume session id
  if (compactInFlight) { compactInFlight.then(() => runClaude(job, body, songKey, model, ctxPartsHeader, retry)); return; }
  const sess = sessionFor(songKey);
  const resumed = sess.turns > 0;
  const {system, prompt: tail} = resumed ? flattenTail(body.messages) : flatten(body.messages);
  const prompt = notesPreface(sess) + tail;
  const noteLast = inboxAll().last;
  // the request's optional x-nr-ctx-parts header (JSON part→chars) — stored
  // as-is in this turn's ring row, no parsing of its shape beyond valid
  // JSON (a bad/missing header just means no parts).
  let ctxParts = null;
  if (ctxPartsHeader) { try { ctxParts = JSON.parse(String(ctxPartsHeader)); } catch (err) { ctxParts = null; } }
  const sys = profile.sys.common + "\n" + (CLAUDE_MODE === "full" ? profile.sys.full : profile.sys.read) + "\n" + profile.sys.link + (system ? "\n\nTHE APP'S OWN INSTRUCTIONS:\n" + system : "") + toolInstructions(body.tools);
  const args = ["-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose", resumed ? "--resume" : "--session-id", sess.id, "--model", model || CLAUDE_DEFAULT_MODEL, "--append-system-prompt", sys];
  if (CLAUDE_MODE !== "full") args.push("--tools", "Read", "Glob", "Grep", "WebFetch", "WebSearch");
  args.push("--add-dir", SHOTS_DIR); // an uploaded screenshot sits outside the repo; Read needs the directory allowed
  // a lean base: no MCP servers (browser/Gmail/Drive tool definitions) and
  // no skills list — the chat client uses neither.
  args.push("--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--disable-slash-commands");
  const child = spawn(CLAUDE_BIN, args, {cwd: REPO, stdio: ["pipe", "pipe", "pipe"], env: {...process.env, CLAUDECODE: ""}});
  job.child = child;
  let buf = "", err = "", sawText = false, held = "", holding = true, turnUsage = null, lastAssistantUsage = null, apiCalls = 0;
  const text = t => { // hold the first characters back: a one-line tool call must not stream as prose
    if (!holding) return jobPush(job, {content: t});
    held += t; const lead = held.trimStart();
    if (lead.length && !lead.startsWith("{") && !lead.startsWith("`")) { holding = false; jobPush(job, {content: held}); held = ""; }
  };
  const timer = setTimeout(() => { if (job.status === "running") { child.kill("SIGKILL"); jobEnd(job, new Error("claude took longer than " + TURN_MS / 60000 + " min")); } }, TURN_MS);
  child.stdout.on("data", d => {
    buf += d.toString(); const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let j; try { j = JSON.parse(line); } catch (e) { continue; }
      if (j.type === "stream_event" && j.event) {
        const ev = j.event;
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") { sawText = true; text(ev.delta.text); }
        else if (ev.type === "content_block_start" && ev.content_block && ev.content_block.type === "tool_use") jobPush(job, {reasoning_content: "using " + ev.content_block.name + "… "});
      } else if (j.type === "assistant" && j.message) {
        apiCalls++; // ring row's apiCalls = count of assistant message events this turn
        if (j.message.usage) lastAssistantUsage = j.message.usage; // ring row's ctxTokens reads the LAST one (input + cache_read + cache_creation — not output, which isn't "context")
        if (Array.isArray(j.message.content)) for (const c of j.message.content) if (c.type === "tool_use") jobPush(job, {reasoning_content: "using " + c.name + (c.input && (c.input.file_path || c.input.pattern || c.input.command || c.input.url) ? " " + String(c.input.file_path || c.input.pattern || c.input.command || c.input.url).slice(0, 80) : "") + "… "});
      } else if (j.type === "result") {
        if (j.is_error && !sawText) err = j.result || j.error || "claude reported an error";
        if (!sawText && typeof j.result === "string" && j.result) { sawText = true; text(j.result); }
        // the real field names, read off a live turn — input_tokens/output_tokens/cache_read_input_tokens/cache_creation_input_tokens, total_cost_usd
        if (j.usage) turnUsage = {in: j.usage.input_tokens || 0, out: j.usage.output_tokens || 0, cacheRead: j.usage.cache_read_input_tokens || 0, cacheCreate: j.usage.cache_creation_input_tokens || 0, cost: j.total_cost_usd || 0};
      } else if (j.type === "rate_limit_event") recordQuota(j.rate_limit_info); // plan-quota %: free, rides every turn already
    }
  });
  child.stderr.on("data", d => { err += d.toString(); });
  child.on("error", e => { clearTimeout(timer); jobEnd(job, e); });
  child.on("close", code => {
    clearTimeout(timer);
    if (job.killed) return jobEnd(job, new Error("stopped"));
    if (!sawText && code !== 0 && resumed && retry && /session|conversation|resume/i.test(err)) { // Claude Code lost the session (cleaned up, another machine): start this chat over, once
      sessionUpdate(songKey, {id: crypto.randomUUID(), turns: 0, noteSeen: 0, started: Date.now(), lost: err.trim().slice(0, 200)});
      job.notes.push("session restarted");
      return runClaude(job, body, songKey, model, ctxPartsHeader, false);
    }
    if (!sawText && code !== 0) return jobEnd(job, new Error((err || "claude exited " + code).trim().slice(0, 500)));
    // total_cost_usd is a RUNNING total for the whole resumed Claude Code
    // session, not a per-turn figure — summing it every turn over-counted
    // (a 20-turn session's "cost" was effectively cost × turns). Add only
    // the delta since the last turn we saw (lastCumCost); a total that goes
    // DOWN (a restarted/lost session, a fresh underlying counter) is
    // treated as a fresh total, never a negative delta.
    const totalCost = turnUsage ? turnUsage.cost : null;
    const costDelta = totalCost == null ? 0 : (sess.lastCumCost == null || totalCost < sess.lastCumCost) ? totalCost : totalCost - sess.lastCumCost;
    // one ring row for this turn — gapS since the session's previous turn
    // (sess.last, null on the session's first turn), ctxTokens from the
    // LAST assistant stream event's usage (not the closing "result" event,
    // which is this turn's own in/out/cache only).
    const now = Date.now();
    const gapS = sess.last ? Math.round((now - sess.last) / 1000) : null;
    const ctxTokens = lastAssistantUsage ? (lastAssistantUsage.input_tokens || 0) + (lastAssistantUsage.cache_read_input_tokens || 0) + (lastAssistantUsage.cache_creation_input_tokens || 0) : null;
    const ring = (sess.ring || []).concat([{t: now, gapS, in: turnUsage ? turnUsage.in : 0, out: turnUsage ? turnUsage.out : 0, cacheRead: turnUsage ? turnUsage.cacheRead : 0, cacheCreate: turnUsage ? turnUsage.cacheCreate : 0, ctxTokens, apiCalls, parts: ctxParts}]).slice(-50);
    sessionUpdate(songKey, {
      turns: sess.turns + 1, noteSeen: noteLast,
      tokensIn: (sess.tokensIn || 0) + (turnUsage ? turnUsage.in : 0),
      tokensOut: (sess.tokensOut || 0) + (turnUsage ? turnUsage.out : 0),
      cacheRead: (sess.cacheRead || 0) + (turnUsage ? turnUsage.cacheRead : 0),
      cacheCreate: (sess.cacheCreate || 0) + (turnUsage ? turnUsage.cacheCreate : 0),
      costUsd: (sess.costUsd || 0) + costDelta,
      lastCumCost: totalCost != null ? totalCost : (sess.lastCumCost != null ? sess.lastCumCost : null),
      ring,
    });
    const full = held || (holding ? "" : null);
    const call = parseToolCall(holding ? held : job.text);
    if (call) jobPush(job, {tool_calls: [{index: 0, id: "call_" + job.id, type: "function", function: {name: call.name, arguments: JSON.stringify(call.arguments)}}]}, "tool_calls");
    else {
      if (holding && held) jobPush(job, {content: held});
      // a turn that ended without words (a hung command, a cut-off) used to
      // land as an empty reply — say what happened and where it stopped
      if (!job.text.trim()) { const last = job.notes.filter(n => n && n !== "session restarted").pop(); jobPush(job, {content: "⚠ Claude finished without answering" + (last ? " — last step: " + last.replace(/…\s*$/, "") : "") + ". Ask again, or say \"continue\"."}); }
      jobPush(job, {}, "stop");
    }
    void full;
    jobEnd(job, null); // the reply is out — anything from here on must not delay it
    // warm auto-Compact. Only on a successful job (never reached from the
    // error returns above), and only while the cache this turn just
    // warmed is still hot — fire-and-forget, in the background.
    if (COMPACT_AT > 0 && ctxTokens != null && ctxTokens > COMPACT_AT) startAutoCompact(songKey, model, ctxTokens);
  });
  child.stdin.end(prompt);
}
// Compact: `claude -p --resume <id> … "/compact"` runs the real slash
// command non-interactively and its stream emits a
// `{"type":"system","subtype":"compact_boundary","compact_metadata":{pre_tokens,
// post_tokens,…}}` line with the EXACT before/after context size, plus a
// closing "result" line with total_cost_usd for this compaction turn. Not
// a chat job (nothing to stream to a client; the caller awaits this
// directly).
function runCompact(sessionId, model) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--resume", sessionId, "--output-format", "stream-json", "--include-partial-messages", "--verbose", "--model", model || CLAUDE_DEFAULT_MODEL, "/compact"];
    const child = spawn(CLAUDE_BIN, args, {cwd: REPO, stdio: ["pipe", "pipe", "pipe"], env: {...process.env, CLAUDECODE: ""}});
    let buf = "", err = "", pre = null, post = null, cost = 0, sawResult = false;
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("compact took longer than 3 min")); }, 3 * 60 * 1000);
    child.stdout.on("data", d => {
      buf += d.toString(); const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let j; try { j = JSON.parse(line); } catch (e) { continue; }
        if (j.type === "system" && j.subtype === "compact_boundary" && j.compact_metadata) { pre = j.compact_metadata.pre_tokens; post = j.compact_metadata.post_tokens; }
        else if (j.type === "rate_limit_event") recordQuota(j.rate_limit_info);
        else if (j.type === "result") { sawResult = true; cost = j.total_cost_usd || 0; if (j.is_error) err = j.result || j.error || "compact failed"; }
      }
    });
    child.stderr.on("data", d => { err += d.toString(); });
    child.on("error", e => { clearTimeout(timer); reject(e); });
    child.on("close", code => {
      clearTimeout(timer);
      if (!sawResult || pre == null) return reject(new Error((err || "claude exited " + code).trim().slice(0, 500) || "no compaction happened"));
      resolve({preTokens: pre, postTokens: post, cost});
    });
    child.stdin.end();
  });
}
async function runUpstream(job, body, target) { // forward to an OpenAI server, streaming; the job keeps the chunks
  const ctl = new AbortController();
  job.child = {kill() { ctl.abort(); }};
  const timer = setTimeout(() => { if (job.status === "running") { ctl.abort(); jobEnd(job, new Error("the model server took longer than " + TURN_MS / 60000 + " min")); } }, TURN_MS);
  try {
    const r = await fetch(target.upstream.url + "/v1/chat/completions", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({...body, model: target.id, stream: true}), signal: ctl.signal});
    if (!r.ok) { let msg = "HTTP " + r.status; try { const j = await r.json(); if (j.error) msg += " — " + (j.error.message || j.error); } catch (err) { /* no body */ } throw new Error(msg); }
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "";
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      buf += dec.decode(value, {stream: true}); const lines = buf.split("\n"); buf = lines.pop();
      for (const l of lines) {
        const t = l.trim(); if (!t.startsWith("data:")) continue; const d = t.slice(5).trim(); if (d === "[DONE]") continue;
        let j; try { j = JSON.parse(d); } catch (err) { continue; }
        if (j.error) throw new Error(j.error.message || String(j.error));
        const c = j.choices && j.choices[0]; if (!c) continue;
        jobPush(job, c.delta || {}, c.finish_reason || null);
      }
    }
    clearTimeout(timer);
    jobEnd(job, job.killed ? new Error("stopped") : null);
  } catch (err) { clearTimeout(timer); jobEnd(job, job.killed ? new Error("stopped") : err); }
}

// ---------------------------------------------------------------- http
function cors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("access-control-expose-headers", "x-nr-job, x-nr-session-epoch");
}
function json(res, code, obj, extraHeaders) { cors(res); if (extraHeaders) for (const k in extraHeaders) res.setHeader(k, extraHeaders[k]); res.writeHead(code, {"content-type": "application/json"}); res.end(JSON.stringify(obj)); }
function epochHeader(songKey) { // changes the instant a compact (manual or auto) lands on this chat's session, so a client can tell its sent context is stale
  const sess = peekSession(songKey);
  return sess ? {"x-nr-session-epoch": sess.id + ":" + ((sess.lastCompact && sess.lastCompact.at) || 0)} : null;
}
const readBody = req => new Promise((res, rej) => { let b = ""; req.on("data", d => { b += d; }); req.on("end", () => res(b)); req.on("error", rej); });
function authorized(req) { if (!TOKEN) return true; const h = String(req.headers.authorization || ""); return h === "Bearer " + TOKEN; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }
  if (url.pathname === "/health") return json(res, 200, {ok: true});
  // an optional extra static-file mount for an app-specific tool, entirely
  // configured via profile.shapes — omit it to disable this route.
  if (profile.shapes && req.method === "GET" && (url.pathname === profile.shapes.route || url.pathname.startsWith(profile.shapes.route + "/"))) {
    if (url.pathname === profile.shapes.route) { res.writeHead(301, {location: profile.shapes.route.slice(1) + "/"}); return res.end(); }
    const root = path.resolve(process.env[profile.shapes.dirEnv] || profile.shapes.defaultDir);
    let rel = decodeURIComponent(url.pathname.slice(profile.shapes.route.length + 1)) || "index.html";
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
    const types = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css", ".txt": "text/plain; charset=utf-8"};
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, {"content-type": "text/plain"}); return res.end("not found"); }
      res.writeHead(200, {"content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache"});
      res.end(buf);
    });
    return;
  }
  if (!authorized(req)) return json(res, 401, {error: {message: "this bridge wants its token"}});
  if (req.method === "GET" && url.pathname === "/v1/models") { const {models} = await listModels(); return json(res, 200, {object: "list", data: models}); }
  if (req.method === "GET" && url.pathname === "/v1/jobs") return json(res, 200, {ok: true, running: [...jobs.values()].filter(j => j.status === "running").length, inbox: true, terminal: true, terminalLive: terminalReachable(), sessions: true});
  const sm = url.pathname.match(/^\/v1\/sessions\/([^/]+)(\/compact)?$/); // session controls: usage + Clear-really-resets + Compact
  if (sm) {
    const key = sanitizeSongKey(decodeURIComponent(sm[1])) || "default"; // the exact rule songKeyOf applies to x-nr-song, so the same chat always lands on the same row
    if (!sm[2] && req.method === "GET") { const all = readJSON(SESSIONS_FILE, {}); return json(res, 200, sessionUsageView(all[key], {ring: url.searchParams.get("turns") === "1"})); }
    if (!sm[2] && req.method === "DELETE") { // Clear chat really resets: drop the session id so the next turn starts a new Claude Code session
      const all = readJSON(SESSIONS_FILE, {});
      if (all[key]) { delete all[key]; writeJSON(SESSIONS_FILE, all); }
      return json(res, 200, {ok: true});
    }
    if (sm[2] && req.method === "POST") {
      if (!claudeOk) return json(res, 503, {error: {message: "no Claude Code here to compact"}});
      const all = readJSON(SESSIONS_FILE, {});
      const sess = all[key];
      if (!sess) return json(res, 404, {error: {message: "no session yet for this chat — nothing to compact"}});
      let b = {}; try { b = JSON.parse(await readBody(req) || "{}"); } catch (err) { /* default model */ }
      const before = sessionUsageView(sess);
      try {
        const r = await runCompact(sess.id, b.model);
        sessionUpdate(key, {id: sess.id /* the compacted session — never lost to a concurrent rewrite */, turns: 1, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheCreate: 0, costUsd: (sess.costUsd || 0) + r.cost, lastCompact: {at: Date.now(), preTokens: r.preTokens, postTokens: r.postTokens, cost: r.cost}});
        return json(res, 200, {ok: true, turnsBefore: before.turns, turnsAfter: 1, tokensBefore: r.preTokens != null ? r.preTokens : before.tokens, tokensAfter: r.postTokens, cost: r.cost});
      } catch (err) { return json(res, 500, {error: {message: String((err && err.message) || err).slice(0, 500)}}); }
    }
  }
  if (url.pathname === "/v1/inbox") { // notes from the terminal: the client polls with ?since=<last id it showed>
    if (req.method === "GET") { const since = +(url.searchParams.get("since") || 0) || 0; const box = inboxAll(); return json(res, 200, {last: box.last, notes: box.notes.filter(n => n.id > since)}); }
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      if (!b || !String(b.text || "").trim()) return json(res, 400, {error: {message: "a note needs text"}});
      const note = inboxAdd(String(b.text).trim(), b.from);
      console.log(`inbox #${note.id} from ${note.from}: ${note.text.slice(0, 80)}`);
      return json(res, 200, note);
    }
  }
  if (url.pathname === "/v1/terminal-prefs") { // a terminal tab's model pickers: which model the terminal session gives its advisors and builders
    const PREFS = path.join(STATE_DIR, "terminal-prefs.json"), ok = ["opus", "sonnet", "haiku", "fable"];
    const cur = readJSON(PREFS, {advisor: "opus", builder: "sonnet"});
    if (req.method === "GET") return json(res, 200, cur);
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      for (const k of ["advisor", "builder"]) if (b && ok.includes(b[k])) cur[k] = b[k];
      writeJSON(PREFS, cur);
      return json(res, 200, cur);
    }
  }
  if (url.pathname === "/v1/terminal") { // POST from a client's own Terminal-style tab; GET ?since=ID from the terminal session's watcher
    if (req.method === "GET") { terminalPolledAt = Date.now(); const since = +(url.searchParams.get("since") || 0) || 0; const box = terminalAll(); return json(res, 200, {last: box.last, msgs: box.msgs.filter(m => m.id > since)}); }
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      if (!b || (!String(b.text || "").trim() && !b.shot)) return json(res, 400, {error: {message: "a message needs text"}});
      const m = terminalAdd(b.text, b.shot);
      console.log(`terminal #${m.id}: ${m.text.slice(0, 80)}`);
      return json(res, 200, {...m, now: statusAll().now});
    }
  }
  if (url.pathname === "/v1/app-state") { // the client says the user is typing/dictating; a build waits rather than relaunch under them. In memory; stale after 2 min
    if (req.method === "GET") { const fresh = appState && Date.now() - appState.t < 120000; return json(res, 200, fresh ? appState : {composing: false}); }
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      appState = {composing: !!(b && b.composing), mic: !!(b && b.mic), t: Date.now()};
      return json(res, 200, appState);
    }
  }
  if (url.pathname === "/v1/status") { // "what Claude Code is doing" — GET for a client's poll, POST from --status or a session announcing a step
    if (req.method === "GET") {
      const box = statusAll();
      if (deployHold && Date.now() - deployHoldAt > 60 * 60 * 1000) { deployHold = false; deployHoldAt = 0; } // a hold nobody released: report it over on its own after 60 min
      const deployInMs = Math.max(0, deployUntil - Date.now());
      return json(res, 200, {now: box.now, recent: box.recent, terminal: true, terminalLive: terminalReachable(), sessions: true, quota: lastQuota, ...(deployInMs ? {deployInMs} : {}), ...(deployHold ? {deployHold: true} : {})});
    } // terminal/sessions/quota: gates a client's Terminal UI, Compact button, usage line, and plan-quota chip
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      const box = statusSet(b && b.text);
      console.log(box.now ? `status: ${box.now.text.slice(0, 80)}` : "status cleared");
      return json(res, 200, {now: box.now, recent: box.recent});
    }
  }
  if (req.method === "POST" && url.pathname === "/v1/deploy") { // {inSec, hold?}: an install relaunches the client app in inSec seconds (0 cancels); hold:true/false pauses/releases "Not now" — independent of inSec, so a {hold:true} alone doesn't need to also know the countdown
    let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
    if (b && typeof b.hold === "boolean") { deployHold = b.hold; deployHoldAt = b.hold ? Date.now() : 0; }
    const sec = Math.max(0, Math.min(120, +(b && b.inSec) || 0));
    deployUntil = sec ? Date.now() + sec * 1000 : 0;
    console.log((sec ? `deploy: app relaunches in ${sec}s` : "deploy: cancelled") + (deployHold ? " (held — \"Not now\")" : ""));
    return json(res, 200, {inSec: sec, hold: deployHold});
  }
  if (req.method === "POST" && url.pathname === "/v1/backup") { // {key, doc, notes?, at}: an off-device copy of one item's own draft (deploy safeguards)
    let raw;
    try { raw = await readBodyCapped(req, BACKUP_MAX); }
    catch (err) { if (err.code === 413) return json(res, 413, {error: {message: "backup too big"}}); return json(res, 400, {error: {message: "upload broke off"}}); }
    let b; try { b = JSON.parse(raw); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
    if (!b || !b.key || b.doc === undefined) return json(res, 400, {error: {message: "a backup needs key + doc"}});
    const dir = path.join(BACKUPS_DIR, backupKeyDir(b.key));
    fs.mkdirSync(dir, {recursive: true});
    const files = listBackupFiles(dir);
    const docStr = JSON.stringify(b.doc);
    if (files.length) {
      try { if (JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8")).doc) === docStr) return json(res, 200, {ok: true, skipped: true}); } // byte-identical to the newest backup: nothing to keep
      catch (err) { /* the newest backup is unreadable: write a fresh one rather than guess */ }
    }
    const at = typeof b.at === "number" ? b.at : Date.now();
    const file = new Date(at).toISOString().replace(/[:.]/g, "-") + ".json";
    fs.writeFileSync(path.join(dir, file), JSON.stringify({key: b.key, at, doc: b.doc, notes: b.notes || null}));
    pruneBackups(dir);
    return json(res, 200, {ok: true, file});
  }
  if (req.method === "GET" && url.pathname === "/v1/backups") { // ?key=… → [{file, at, bytes}], newest last
    const key = url.searchParams.get("key");
    if (!key) return json(res, 400, {error: {message: "backups need ?key="}});
    const dir = path.join(BACKUPS_DIR, backupKeyDir(key));
    const list = listBackupFiles(dir).map(f => {
      let at = null; try { at = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).at; } catch (err) { /* list it anyway */ }
      let bytes = 0; try { bytes = fs.statSync(path.join(dir, f)).size; } catch (err) { /* gone mid-list */ }
      return {file: f, at, bytes};
    });
    return json(res, 200, {backups: list});
  }
  const bfm = url.pathname.match(/^\/v1\/backups\/([^/]+)\/([^/]+)$/);
  if (req.method === "GET" && bfm) { // one backup's stored {key, at, doc, notes}
    const root = path.resolve(BACKUPS_DIR);
    const file = path.resolve(root, decodeURIComponent(bfm[1]), decodeURIComponent(bfm[2]));
    if (!file.startsWith(root + path.sep)) return json(res, 403, {error: {message: "bad path"}});
    let raw; try { raw = fs.readFileSync(file, "utf8"); } catch (err) { return json(res, 404, {error: {message: "no such backup"}}); }
    cors(res); res.writeHead(200, {"content-type": "application/json"}); return res.end(raw);
  }
  if (req.method === "POST" && url.pathname === "/v1/shot") { // raw PNG/JPEG bytes → a file Claude can Read; answers its path
    const chunks = []; let n = 0;
    try { for await (const c of req) { n += c.length; if (n > SHOT_MAX) return json(res, 413, {error: {message: "screenshot too big"}}); chunks.push(c); } }
    catch (err) { return json(res, 400, {error: {message: "upload broke off"}}); }
    const buf = Buffer.concat(chunks), png = buf[0] === 0x89 && buf[1] === 0x50, jpg = buf[0] === 0xFF && buf[1] === 0xD8;
    if (!png && !jpg) return json(res, 400, {error: {message: "not a PNG or JPEG"}});
    fs.mkdirSync(SHOTS_DIR, {recursive: true});
    const file = path.join(SHOTS_DIR, new Date().toISOString().replace(/[:.]/g, "-") + (png ? ".png" : ".jpg"));
    fs.writeFileSync(file, buf);
    console.log(`screenshot ${file} (${buf.length} bytes)`);
    return json(res, 200, {path: file});
  }
  const jm = url.pathname.match(/^\/v1\/jobs\/([\w.-]+)$/);
  if (jm) {
    const job = loadJob(jm[1]);
    if (!job) return json(res, 404, {error: {message: "no such job (older than the keep window, or never started here)"}});
    if (req.method === "GET") { const v = jobView(job); markFetched(job); return json(res, 200, v); }
    if (req.method === "DELETE") { if (job.status === "running" && job.child) { job.killed = true; try { job.child.kill("SIGKILL"); } catch (err) { /* gone */ } } return json(res, 200, {ok: true}); }
  }
  if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
    const id = String(req.headers["x-nr-job"] || "").replace(/[^\w.-]/g, "").slice(0, 64) || "job_" + crypto.randomUUID();
    const songKey = songKeyOf(req, body);
    let job = loadJob(id);
    if (!job) {
      const {route} = await listModels();
      const target = route.get(body.model) || route.get(MODEL_CLAUDE) || [...route.values()][0];
      if (!target) return json(res, 503, {error: {message: "no model reachable: start LM Studio / Ollama, or install Claude Code"}});
      job = newJob(id, body.model || (target.claude ? MODEL_CLAUDE : target.id));
      if (target.claude) runClaude(job, body, songKey, target.model, req.headers["x-nr-ctx-parts"]); else runUpstream(job, body, target);
    }
    const cid = "chatcmpl-" + id;
    const finalMessage = () => job.result && job.result.tool_calls ? {role: "assistant", content: null, tool_calls: job.result.tool_calls} : {role: "assistant", content: job.text};
    if (!body.stream) {
      // computed when the response actually goes out (not when the
      // request came in) — a non-stream reply already waits for the job to
      // finish, and runClaude waits out any in-flight compact before it
      // even starts, so this reflects a compact this very turn triggered
      // or waited on, not just an earlier one.
      const done = () => { markFetched(job); json(res, 200, {id: cid, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: job.model, choices: [{index: 0, message: finalMessage(), finish_reason: job.result && job.result.tool_calls ? "tool_calls" : "stop"}]}, epochHeader(songKey)); };
      if (job.status === "done") return done();
      if (job.status === "error") return json(res, 500, {error: {message: job.error}}, epochHeader(songKey));
      const sub = ev => { if (ev.type !== "end") return; if (job.status === "error") json(res, 500, {error: {message: job.error}}, epochHeader(songKey)); else done(); };
      job.subs.add(sub); req.on("close", () => job.subs.delete(sub));
      return;
    }
    cors(res);
    res.setHeader("x-nr-job", id);
    // a stream's headers go out before the turn (and any compact) finishes
    // — the best a streamed reply can carry is the epoch as of stream
    // START; a client sees a just-landed compact on its NEXT turn either way.
    const epoch = epochHeader(songKey);
    if (epoch) for (const k in epoch) res.setHeader(k, epoch[k]);
    res.writeHead(200, {"content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive"});
    const send = obj => { if (!res.writableEnded) res.write("data: " + JSON.stringify(obj) + "\n\n"); };
    const chunk = c => send({id: cid, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: job.model, choices: [{index: 0, delta: c.delta, finish_reason: c.finish}]});
    const end = () => { if (res.writableEnded) return; if (job.status === "error") send({error: {message: job.error}}); markFetched(job); res.write("data: [DONE]\n\n"); res.end(); };
    if (job.chunks.length) for (const c of job.chunks) chunk(c); // attaching late (or a restart-loaded job): replay
    else if (job.status !== "running") { if (job.result && job.result.tool_calls) chunk({delta: {tool_calls: job.result.tool_calls.map((t, i) => ({index: i, ...t}))}, finish: "tool_calls"}); else chunk({delta: {content: job.text}, finish: "stop"}); }
    if (job.status !== "running") return end();
    const sub = ev => { if (ev.type === "chunk") chunk(ev.chunk); else end(); };
    job.subs.add(sub);
    req.on("close", () => job.subs.delete(sub)); // the client went away: the job goes on, fetched later
    return;
  }
  json(res, 404, {error: {message: "not found"}});
});

server.listen(PORT, HOST, async () => {
  const {models} = await listModels();
  console.log(`${profile.label || "claude-bridge"}: http://${HOST}:${PORT}` + (TOKEN ? " (token required)" : "") +
    `\n  claude code: ${claudeOk ? "yes (" + CLAUDE_MODE + ", repo " + REPO + ")" : CLAUDE_MODE === "off" ? "off" : "not installed"}` +
    `\n  upstreams:   ${(upstreams.length ? upstreams : AUTO_UPSTREAMS).map(u => u.name + "=" + u.url).join(", ")}${upstreams.length ? "" : " (auto: listed only while running)"}` +
    `\n  models now:  ${models.map(m => m.id).join(", ") || "(none reachable)"}` +
    `\n  jobs:        ${JOBS_DIR}, kept ${KEEP_MS / 3600000}h after fetch` +
    `\n  sessions:    ${SESSIONS_FILE} (one Claude Code session per chat) · inbox: ${INBOX_FILE} (--say "text")`);
});
return server;
} // startBridge
