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
// Apps: notes, terminal messages and status lines are per app. `--say` and
// `--status` take `--app <id>` (default "night-roll"; "guitar", "tuner", any
// string); POST bodies carry `app` (terminal also takes ?app= / x-nr-app);
// GET /v1/inbox, /v1/terminal and /v1/status take ?app=<id> and return only
// that app's rows. No app, or a legacy untagged row, means "night-roll".
//
// The Front Desk is app "front-desk": ONE shared session (not a per-app chat) that
// watches GET /v1/terminal?app=front-desk like a Worker does. POST /v1/terminal
// {app:"front-desk", src, label, text} answers {live}: false (nobody has polled that
// queue for 90 s) stores the row as a one-off the watcher never sees; the app then
// asks /v1/chat/completions with x-nr-desk: <row id>, and the bridge itself writes
// the answer into the thread as a note. GET /v1/desk?since=<t ms> is the thread's
// live window (front-desk rows + notes by time; read-only, never marks it live).
// A POST with fwd "front-desk" to a Worker also writes the hand-off note; app "all"
// fans out to night-roll, guitar and tuner. Rows trimmed from terminal.json and
// inbox.json go to archive/<file>-YYYY-MM.jsonl.
//
// One AI (#644 Phase 1): every POST /v1/terminal from an app (not a forward, not
// "all", not the front-desk) gets an INSTANT canned note in that row's own app
// (from "terminal", auto:true) and the same text as `ack` in the response —
// "Sent to Claude (#n)…" when the AI's watcher polled that app in the last 90 s
// (`live`), else an offline line, and the bridge starts a read-only quick answer
// itself (session `<app>-quick`; the row stays in the queue with quick:true).
// While the AI is live a plain question is judged by the same read-only helper
// (#681): it answers (note + done + an "ANSWERED #n" FYI row for the watcher) or
// says NEEDS_AI / errors / passes 60 s and the row goes to the AI as usual.
// The first time the watcher's GET returns the row the bridge adds "Claude has
// #n now." GET /v1/terminal?app=a,b,c&wait=25 watches several apps with one
// cursor and long-polls (wait capped at 25 s). POST /v1/ai-session {session,
// takeover?} registers the one AI (409 while another session polled within
// 90 s). POST /v1/terminal/done {id, text?} answers row id in ITS app; POST
// /v1/status {text, msg} takes the app from row msg. EVERY claude child is
// read-only (--tools Read,Glob,Grep,WebFetch,WebSearch) and gets
// NR_BRIDGE_CHILD=1; only the interactive terminal session writes code.
//
// Permission cards (#644 Phase 3): POST /v1/asks {id, kind: permission|blocked,
// session, tool, summary, detail, repo, agent_type, app, hash, expiresAt} opens a
// card (same id again = no second card); GET /v1/asks/:id?wait=N (<=25) long-polls
// it ({status: open|allowed|denied|expired, decision}); GET /v1/asks lists the
// open ones, and GET /v1/status carries them as `asks`. POST /v1/asks/:id
// {decision, app?} decides, and is taken ONLY on the decision listener
// (BRIDGE_DECIDE_ADDR, the Mac's tailnet address, e.g. 100.73.74.71:8788; never
// 127.0.0.1 or the ts.net proxy, where anything on this Mac can forge the
// headers): the socket's peer must be one of BRIDGE_APPROVER_IPS, none of this
// machine's own addresses (BRIDGE_SELF_IPS adds to the interface list), and
// `tailscale whois` on it must answer BRIDGE_APPROVER; else 403. Unset, every
// decision is 403. The first decision wins, a late one is 409 and creates
// nothing; anything but exactly "allow" is a deny. Allowing a `blocked` card
// stores a ten-minute one-time grant IN MEMORY (never a file) for that session,
// tool and input hash and queues a kind:"grant" terminal row so the watcher wakes
// the AI; GET /v1/grants?session=&tool=&hash=[&peek=1] consumes it. asks.jsonl is
// a log only.
//
// Endpoints: GET /v1/models · POST /v1/chat/completions (stream or not) ·
// GET /v1/jobs (probe: {ok, running}) · GET|DELETE /v1/jobs/:id ·
// GET /v1/inbox?since=ID · POST /v1/inbox · GET|POST /v1/status ·
// POST /v1/deploy · GET|POST /v1/app-state · GET|POST /v1/terminal ·
// POST /v1/backup {key, doc, notes?, at} · GET /v1/backups?key=… ·
// GET /v1/backups/<dir>/<file> · PUT /v1/takes/<app>/<id>/<name> (raw body,
// streamed to disk under takes/; 409 over a different-size file) ·
// GET /v1/takes/<app> · GET|DELETE /v1/sessions/:key (usage
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
// human decides when that happens. The countdown names its app
// (--deploy-in N --app guitar; the POST's {app}): only that app's GET
// /v1/status?app= carries deployInMs/deployHold, so a guitar install
// never counts down in another app. --deploy-wait takes the same --app.
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
    fetch(base() + "/v1/inbox", {method: "POST", headers: authHeaders(), body: JSON.stringify({text, from: flag(argv, "--from", "terminal"), app: flag(argv, "--app", "night-roll")})})
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status); console.log("note #" + j.id + " delivered to the bridge"); process.exit(0); })
      .catch(err => { console.error("could not reach the bridge on port " + PORT + ": " + err.message); process.exit(1); });
    return;
  }
  if (has(argv, "--forward")) { // hand a message to another app's session: a terminal message tagged for --app, marked as forwarded from --from-app
    const valued = new Set(["--app", "--from-app", "--port", "--host", "--token", "--forward"]);
    const after = flag(argv, "--forward", ""), last = argv[argv.length - 1], prev = argv[argv.length - 2];
    const text = (!after.startsWith("--") && after ? after : !last.startsWith("--") && !valued.has(prev) ? last : "").trim(); // the text follows --forward or ends the line
    const app = flag(argv, "--app", "");
    if (!text || !app) { console.error("--forward needs --app <id> and the text: --forward --app tuner \"text\""); process.exit(2); }
    fetch(base() + "/v1/terminal", {method: "POST", headers: authHeaders(), body: JSON.stringify({text, app, fwd: flag(argv, "--from-app", "night-roll")})})
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status); console.log(j.ids ? "forwarded to " + j.apps.join(", ") + " (#" + j.ids.join(", #") + ")" : "message #" + j.id + " forwarded to " + app); process.exit(0); })
      .catch(err => { console.error("could not reach the bridge on port " + PORT + ": " + err.message); process.exit(1); });
    return;
  }
  if (has(argv, "--done")) { // the AI answers terminal row n: the note lands in row n's OWN app, and the row is marked done:  --done 12 "text"
    const i = argv.indexOf("--done"), id = +argv[i + 1], text = (argv[i + 2] && !argv[i + 2].startsWith("--") ? argv[i + 2] : "").trim();
    if (!(id > 0)) { console.error("--done needs a row number: --done 12 \"text\""); process.exit(2); }
    fetch(base() + "/v1/terminal/done", {method: "POST", headers: authHeaders(), body: JSON.stringify({id, text, from: flag(argv, "--from", "terminal")})})
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status); console.log("#" + j.id + " done" + (j.note ? ", note #" + j.note + " delivered to " + j.app : "")); process.exit(0); })
      .catch(err => { console.error("could not finish #" + id + ": " + err.message); process.exit(1); });
    return;
  }
  if (has(argv, "--status") || has(argv, "--status-clear")) { // "what's running" — post it to the running bridge and exit, mirroring --say
    const text = has(argv, "--status-clear") ? "" : flag(argv, "--status", "").trim();
    fetch(base() + "/v1/status", {method: "POST", headers: authHeaders(), body: JSON.stringify({text, app: flag(argv, "--app", "night-roll"), ...(flag(argv, "--msg", "") ? {msg: +flag(argv, "--msg", "")} : {})})}) // --msg n: the app comes from terminal row n
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status); console.log(text ? "status set" : "status cleared"); process.exit(0); })
      .catch(err => { console.error("could not reach the bridge on port " + PORT + ": " + err.message); process.exit(1); });
    return;
  }
  if (has(argv, "--deploy-in")) { // an install's heads-up: post it to the running bridge and exit, mirroring --status (--app names the app being installed)
    const inSec = +flag(argv, "--deploy-in", "15");
    fetch(base() + "/v1/deploy", {method: "POST", headers: authHeaders(), body: JSON.stringify({inSec, app: flag(argv, "--app", "night-roll")})})
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status); console.log("deploy warning: " + j.inSec + "s"); process.exit(0); })
      .catch(err => { console.error("could not reach the bridge on port " + PORT + ": " + err.message); process.exit(1); });
    return;
  }
  if (has(argv, "--deploy-wait")) { // blocks a build script's own relaunch step until the countdown has run out AND nobody has held it — polls, never pushes (--app: the same app as its --deploy-in)
    const giveUpAt = Date.now() + 60 * 60 * 1000, statusUrl = base() + "/v1/status?app=" + encodeURIComponent(flag(argv, "--app", "night-roll"));
    (async () => {
      for (;;) {
        let j;
        try { const r = await fetch(statusUrl, {headers: authHeaders()}); j = await r.json(); }
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
// performance takes (an app's recorded run: audio + JSON sidecar), PUT one file at a time: takes/<app>/<id>/<name>. Never pruned.
const TAKES_DIR = path.join(STATE_DIR, "takes");
const TAKE_MAX = 300 * 1024 * 1024;
const TAKE_NAMES = ["audio.m4a", "take.json", "usage.json"];
const TAKE_REPLACEABLE = ["usage.json"]; // the app's daily control-use counts (#602): each upload replaces the last
const TAKE_SEG = /^[\w.-]{1,80}$/;
const TURN_MS = 20 * 60 * 1000;
const READ_TOOLS = ["Read", "Glob", "Grep", "WebFetch", "WebSearch"]; // every claude child the bridge starts gets exactly these (#644): the one AI in the terminal is the only writer
const childEnv = () => ({...process.env, CLAUDECODE: "", NR_BRIDGE_CHILD: "1"}); // the hooks (Phase 2) skip a session that carries NR_BRIDGE_CHILD
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
  const list = tools.map(t => { const f = t.function || {}; return `- ${f.name}: ${f.description || ""}\n  schema: ${JSON.stringify(f.parameters || {})}`; }).join("\n");
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
  for (const cand of [t, firstJSONObject(t), closeJSON(t)]) {
    try { const j = JSON.parse(cand); if (j && j.tool_call && j.tool_call.name) return {name: String(j.tool_call.name), arguments: j.tool_call.arguments || {}}; } catch (err) { /* prose */ }
  }
  return null;
}
// a long tool call (a large write) can come back one "}" short and fall
// through as prose — the client showed raw JSON and ran nothing. Close
// whatever brackets are still open (outside strings), in order.
// a model can write the call right and then trail junk after it (Josh,
// 2026-10-05: "</parameter></invoke>" after a write_notes call) — the first
// balanced object is the call; whatever follows it is ignored
function firstJSONObject(t) {
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return t.slice(0, i + 1);
  }
  return null;
}
// One "}" too MANY breaks it the same way (2026-10-11: a write_notes with a
// replace came back "…}}}]}}}" — a "}" where the "]" was open). A closer that
// doesn't match the bracket open there is dropped; the JSON.parse after it
// still decides whether what's left is a call.
function closeJSON(t) {
  const open = []; let inStr = false, esc = false, out = "";
  for (const ch of t) {
    if (inStr) { out += ch; if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") open.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") { if (open[open.length - 1] !== ch) continue; open.pop(); }
    out += ch;
  }
  return inStr ? t : out + open.reverse().join("");
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
    models.push({id: MODEL_CLAUDE, object: "model", owned_by: "claude-code (read-only, " + CLAUDE_DEFAULT_MODEL + ")"}); route.set(MODEL_CLAUDE, {claude: true, model: CLAUDE_DEFAULT_MODEL});
    for (const m of CLAUDE_MODELS) { const id = MODEL_CLAUDE + "-" + m; models.push({id, object: "model", owned_by: "claude-code (read-only, " + m + ")"}); route.set(id, {claude: true, model: m}); }
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
  if (job.route && !job.killed) routeEnd(job);
  if (job.desk && !job.killed) { // a Front Desk one-off: the bridge writes the answer into the thread, so it lands even if the app went to the background
    const text = job.status === "error" ? "\u26a0 one-off failed: " + job.error : String(job.text || "").trim();
    if (text && job.quick) { // an offline quick answer (#644): into the row's OWN app as a terminal note, so old and new builds both show it in the Worker tab
      const note = inboxAdd(job.status === "error" ? "Quick answer failed: " + job.error : "Quick answer (Claude is offline): " + text, "terminal", job.app, {auto: true, quick: true});
      terminalMark(job.desk, {answered: note.id});
    } else if (text) { const note = inboxAdd(text, "one-off", FRONT_DESK); terminalMark(job.desk, {answered: note.id}); }
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
// which app the install is for ("guitar", "night-roll"): the three apps share
// this bridge, and a guitar install must not count down in another app. Set by
// the countdown's own POST ({app}); null (a POST without one) = every app.
let deployApp = null;
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
// which app a note / terminal message / status line is for: "night-roll" (also what legacy untagged rows and requests mean), "guitar", "tuner", any string
const DEFAULT_APP = "night-roll";
const appIdOf = v => String(v == null || v === "" ? DEFAULT_APP : v).replace(/[^\w.-]/g, "_").slice(0, 40) || DEFAULT_APP;
const forApp = (row, app) => appIdOf(row.app) === app;
// rows trimmed off the live files (the last 200 stay) are appended to archive/<file>-YYYY-MM.jsonl, never dropped
function archiveRows(name, rows) { if (!rows.length) return; try { const dir = path.join(STATE_DIR, "archive"); fs.mkdirSync(dir, {recursive: true}); fs.appendFileSync(path.join(dir, name + "-" + new Date().toISOString().slice(0, 7) + ".jsonl"), rows.map(r => JSON.stringify(r)).join("\n") + "\n"); } catch (err) { console.error("archive " + name + ": " + err.message); } }
function inboxAdd(text, from, app, extra) { const box = inboxAll(); const note = {id: ++box.last, t: Date.now(), app: appIdOf(app), from: String(from || "terminal").slice(0, 40), text: String(text).slice(0, 4000), ...(extra || {})}; box.notes.push(note); archiveRows("inbox", box.notes.slice(0, -200)); box.notes = box.notes.slice(-200); writeJSON(INBOX_FILE, box); return note; }
// one current status line (null when idle) plus the last 10 it ever said,
// each with a timestamp. Clearing only blanks `now` — `recent` is history
// and never shrinks from a clear.
// a terminal-style tab (a queue a terminal session watches via GET
// ?since=), answered through the inbox (--say)
const TERMINAL_FILE = path.join(STATE_DIR, "terminal.json");
const terminalPolledAt = new Map(); // app id → when its watcher last GETed /v1/terminal (every few seconds): recent = someone is there to read it
let aiSeenAt = 0, aiSession = null; // the last poll of ANY app, and the one registered AI session {id, at} (POST /v1/ai-session)
const terminalWaiters = new Set(); // long-polls parked on GET /v1/terminal?wait=N: {apps, since, res, timer}
const terminalReachable = app => [...terminalPolledAt].some(([id, t]) => (app == null || id === appIdOf(app)) && Date.now() - t < 90000); // no app = any watcher
function terminalAll() { const j = readJSON(TERMINAL_FILE, {last: 0, msgs: []}); return j && Array.isArray(j.msgs) ? j : {last: 0, msgs: []}; }
// src/label: which app a Front Desk message came from and one line of its context; oneoff: the Front Desk was not being read, so the app asks for a one-off answer instead
function terminalAdd(text, shot, app, fwd, extra) { const box = terminalAll(); const e = extra || {}; const m = {id: ++box.last, t: Date.now(), app: appIdOf(app), ...(fwd ? {fwd: appIdOf(fwd)} : {}), ...(e.src ? {src: String(e.src).slice(0, 40)} : {}), ...(e.label ? {label: String(e.label).slice(0, 80)} : {}), ...(e.oneoff ? {oneoff: true} : {}), ...(e.acked ? {acked: true} : {}), ...(e.quick ? {quick: true} : {}), ...(e.hold ? {hold: e.hold} : {}), ...(e.kind ? {kind: String(e.kind).slice(0, 20)} : {}), text: String(text || "").slice(0, 8000), shot: shot ? String(shot).slice(0, 500) : null}; box.msgs.push(m); archiveRows("terminal", box.msgs.slice(0, -200)); box.msgs = box.msgs.slice(-200); writeJSON(TERMINAL_FILE, box); return m; }
const FRONT_DESK = "front-desk", WORKERS = ["night-roll", "guitar", "tuner"], workerName = id => id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "); // "guitar" -> "Guitar", a hyphenated id -> two capitalised words
function terminalMark(id, patch) { const box = terminalAll(); const m = box.msgs.find(x => x.id === id); if (m) { Object.assign(m, patch); writeJSON(TERMINAL_FILE, box); } }
// ---- one AI (#644 Phase 1): the instant reply, the watcher's multi-app long-poll, delivery marks
const appsOf = raw => { const ids = String(raw == null ? "" : raw).split(",").map(x => x.trim()).filter(Boolean).map(appIdOf); return ids.length ? [...new Set(ids)] : [DEFAULT_APP]; }; // ?app=a,b,c — split BEFORE appIdOf, which turns a comma into "_"
const clock = t => new Date(t).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"});
function stampPoll(apps) { const now = Date.now(); for (const a of apps) terminalPolledAt.set(a, now); aiSeenAt = now; }
// The canned replies. Live: the AI's watcher polled this app in the last 90 s. Offline: say so, say when it was last seen, and promise the quick answer only if the bridge can really give one.
function ackText(id, live, quickComing) {
  if (live) return `Sent to Claude (#${id}). It'll answer here.`;
  return `Claude isn't running on the Mac (${aiSeenAt ? "last seen " + clock(aiSeenAt) : "not seen since the bridge started"}). #${id} is saved and Claude will get it when it starts.` + (quickComing ? " A quick read-only answer is coming." : "");
}
function startQuickAnswer(row) { // the offline answer: one read-only one-off, written into the row's own app by jobEnd
  const job = newJob("quick_" + row.id + "_" + Date.now().toString(36), MODEL_CLAUDE);
  job.app = row.app; job.desk = row.id; job.quick = true;
  const sys = "The Claude session on the Mac that does the work is not running, so you are giving a QUICK, READ-ONLY answer from the repo files. You cannot change anything. If the message asks for a change or a build, say it is saved in the queue and Claude will do it when it starts.";
  runClaude(job, {messages: [{role: "system", content: sys}, {role: "user", content: row.text + (row.shot ? "\n(screenshot: " + row.shot + ")" : "")}]}, row.app + "-quick", CLAUDE_DEFAULT_MODEL);
}
// #681: a plain question from an app while the AI is live. The same read-only helper judges: it answers, or says NEEDS_AI.
const ROUTE_MS = +process.env.BRIDGE_ROUTE_MS || 25000; // BRIDGE_ROUTE_MS: tests only
const ROUTE_ROOT = process.env.BRIDGE_ROUTE_ROOT || path.join(os.homedir(), "work", "night-roll"), ROUTE_REPOS = {"night-roll": "night-roll-daw", guitar: "night-roll-guitar", tuner: "night-roll-tuner"}; // app → the repo the helper reads
const ROUTE_SYS = "You are a read-only helper deciding whether a message from an app can be answered right now without the main Claude session. Start your reply with exactly ANSWER: only if the message ONLY asks for information, and you can answer it confidently from files you read (Read, Glob, Grep) or from the commit list given with the message. Then answer in a few plain sentences. Questions about history (did we do X, when) are answered only from the given commit list or files you actually read; otherwise reply NEEDS_AI. Reply with exactly NEEDS_AI and nothing else when the message asks for anything to be built, changed, fixed, installed or decided, mixes a question with such a request, or you are not sure. You cannot reach the Worker, the terminal, open-items or the inbox: never say you forwarded, noted, queued or will do anything, because that is NEEDS_AI. You cannot change anything.";
function startRouter(row) {
  const job = newJob("route_" + row.id + "_" + Date.now().toString(36), MODEL_CLAUDE);
  const dir = path.join(ROUTE_ROOT, ROUTE_REPOS[appIdOf(row.app)] || "");
  const haveDir = ROUTE_REPOS[appIdOf(row.app)] && fs.existsSync(dir);
  let ctx = "";
  if (haveDir) {
    const g = spawnSync("git", ["log", "--oneline", "-20"], {cwd: dir, encoding: "utf8", timeout: 2000});
    if (g.status === 0 && g.stdout.trim()) ctx += "Recent commits (git log --oneline -20):\n" + g.stdout.trim() + "\n\n";
    if (fs.existsSync(path.join(dir, "open-items.md"))) ctx += "Open items file: " + path.join(dir, "open-items.md") + "\n\n";
  }
  job.app = row.app; job.route = {row, key: "route-" + row.id + "-" + Date.now().toString(36), ...(haveDir ? {dir} : {})};
  job.routeTimer = setTimeout(() => routeStop(job, "helper took longer than " + ROUTE_MS / 1000 + " s"), ROUTE_MS);
  job.subs.add(ev => { // the first words decide: anything but ANSWER: releases the row now, without waiting for the child to finish
    if (ev.type !== "chunk") return;
    const t = job.text.trimStart();
    if (t && !t.startsWith("ANSWER:") && !(t.length < 7 && "ANSWER:".startsWith(t))) routeStop(job, "not an answer");
  });
  runClaude(job, {messages: [{role: "system", content: ROUTE_SYS}, {role: "user", content: ctx + "Message:\n" + row.text + (row.shot ? "\n(screenshot: " + row.shot + ")" : "")}]}, job.route.key, "sonnet");
}
function routeStop(job, why) { if (job.status !== "running") return; try { job.child && job.child.kill("SIGKILL"); } catch (e) { /* gone */ } jobEnd(job, new Error(why)); }
function routeEnd(job) { // ANSWER: the app gets the note, the row is done, the AI gets an FYI line. Anything else: release the row to the AI as always
  const row = job.route.row; clearTimeout(job.routeTimer);
  try { const all = readJSON(SESSIONS_FILE, {}); if (all[job.route.key]) { delete all[job.route.key]; writeJSON(SESSIONS_FILE, all); } } catch (e) { /* best effort */ }
  const m = job.status === "done" ? /^ANSWER:\s*([\s\S]*\S)/.exec(String(job.text || "").trim()) : null;
  const text = m ? m[1].trim() : "";
  if (!text || /NEEDS_AI/.test(text)) { terminalMark(row.id, {hold: 0}); terminalNotify(); return; }
  const note = inboxAdd("Quick answer: " + text, "terminal", row.app, {auto: true, quick: true});
  terminalMark(row.id, {answered: note.id, helper: true, done: Date.now(), hold: 0});
  const one = (x, n) => String(x).replace(/\s+/g, " ").trim().slice(0, n);
  terminalAdd(`ANSWERED #${row.id} [${row.app}] by helper: ${one(row.text, 200)} \u2192 ${one(text, 400)}`, null, row.app, null, {kind: "fyi"});
  terminalNotify();
}
// What a watcher's GET answers: the rows after `since` for any of these apps (a one-off front-desk row is the bridge's own, never listed). The first time an acked row is listed it is "picked up": one "Claude has #n now." note, once.
function terminalPoll(apps, since) {
  const box = terminalAll(), now = Date.now();
  const heldAt = box.msgs.filter(m => m.hold && m.hold > now).map(m => m.id); // a row the read-only helper is still judging (#681): it and everything after it wait, so the cursor never skips it
  const cut = heldAt.length ? Math.min(...heldAt) : Infinity;
  const rows = box.msgs.filter(m => m.id > since && m.id < cut && apps.includes(appIdOf(m.app)) && !m.oneoff && !m.helper);
  const fresh = rows.filter(m => m.acked && !m.delivered);
  if (fresh.length) { for (const m of fresh) m.delivered = now; writeJSON(TERMINAL_FILE, box); for (const m of fresh) inboxAdd(`Claude has #${m.id} now.`, "terminal", m.app, {auto: true}); }
  return {last: Math.min(box.last, cut - 1), msgs: rows.map(m => ({...m, app: appIdOf(m.app)}))};
}
function terminalNotify() { // a row was just added: answer every parked long-poll it belongs to
  for (const w of [...terminalWaiters]) { const r = terminalPoll(w.apps, w.since); if (!r.msgs.length) continue; terminalWaiters.delete(w); clearTimeout(w.timer); stampPoll(w.apps); json(w.res, 200, r); }
}
// ---- one AI (#644 Phase 3): permission cards. In memory only: a restart loses the open cards (the hook re-POSTs the same id) and every grant (fail closed).
const asks = new Map(); // id → card {id, kind: "permission"|"blocked", session, tool, summary, detail, repo, agent_type, app, hash, createdAt, expiresAt, status: open|allowed|denied|expired, decision}
const grants = []; // {session, tool, hash, expires}: Josh's one-time OK for a blocked call. Never in a file the AI could write; consumed by GET /v1/grants
const asksWaiters = new Set(); // long-polls parked on GET /v1/asks/:id?wait=N: {id, res, timer}
const ASKS_LOG = path.join(STATE_DIR, "asks.jsonl"); // a log only, never read back
const ASK_MAX_MS = 31 * 60 * 1000, GRANT_MS = +process.env.BRIDGE_GRANT_MS || 10 * 60 * 1000; // BRIDGE_GRANT_MS: tests only
const csv = v => String(v || "").split(",").map(x => x.trim()).filter(Boolean);
const APPROVER = process.env.BRIDGE_APPROVER || "", APPROVER_IPS = csv(process.env.BRIDGE_APPROVER_IPS); // the tailnet login and device addresses a decision must come from
function asksLog(o) { try { fs.mkdirSync(STATE_DIR, {recursive: true}); fs.appendFileSync(ASKS_LOG, JSON.stringify({t: Date.now(), ...o}) + "\n"); } catch (err) { console.error("asks.jsonl: " + err.message); } }
function asksSweep() {
  const now = Date.now();
  for (const a of asks.values()) {
    if (a.status === "open" && now >= a.expiresAt) { a.status = "expired"; a.decision = null; asksLog({ev: "expired", id: a.id, kind: a.kind, tool: a.tool}); }
    if (a.status !== "open" && now - a.expiresAt > 3600000) asks.delete(a.id);
  }
  for (let i = grants.length - 1; i >= 0; i--) if (grants[i].expires <= now) grants.splice(i, 1);
}
const askCard = a => ({id: a.id, kind: a.kind, tool: a.tool, summary: a.summary, detail: a.detail, repo: a.repo, agent_type: a.agent_type, app: a.app, createdAt: a.createdAt, expiresAt: a.expiresAt});
const openAsks = () => { asksSweep(); return [...asks.values()].filter(a => a.status === "open").map(askCard); };
const askReply = a => ({id: a.id, status: a.status, decision: a.decision || null});
function asksNotify(a) { for (const w of [...asksWaiters]) if (w.id === a.id) { asksWaiters.delete(w); clearTimeout(w.timer); json(w.res, 200, askReply(a)); } }
const normIp = v => { let x = String(v).trim().replace(/^\[|\]$/g, "").replace(/^::ffff:/i, ""); if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(x)) x = x.slice(0, x.lastIndexOf(":")); return x; };
// Who may decide. Headers prove nothing: the AI runs on this Mac, which reaches 127.0.0.1 directly (any header it
// likes) and the ts.net proxy with a GENUINE Tailscale-User-Login (the Mac is one of Josh's devices). So decisions are
// taken only on the decision listener bound to the tailnet address, where the peer address is the one WireGuard
// authenticated: a local process connecting there arrives as the Mac itself and is refused; 127.0.0.1 is not bound.
// `tailscale whois` then ties the device to the approver's login (BRIDGE_WHOIS names the CLI; a .mjs path is a fake
// for tests; empty skips the lookup). BRIDGE_TESTS_PEER_HEADER (tests only) reads the peer from a header instead.
const DECIDE_ADDR = /^(.+):(\d+)$/.exec(process.env.BRIDGE_DECIDE_ADDR || ""), WHOIS = process.env.BRIDGE_WHOIS == null ? "tailscale" : process.env.BRIDGE_WHOIS, PEER_HEADER = String(process.env.BRIDGE_TESTS_PEER_HEADER || "").toLowerCase();
function peerOf(req) { return normIp((PEER_HEADER && req.headers[PEER_HEADER]) || (req.socket && req.socket.remoteAddress) || ""); }
function whoisLogin(ip) {
  if (!WHOIS) return APPROVER;
  try {
    const r = /\.m?js$/.test(WHOIS) ? spawnSync(process.execPath, [WHOIS, "whois", "--json", ip], {encoding: "utf8", timeout: 5000}) : spawnSync(WHOIS, ["whois", "--json", ip], {encoding: "utf8", timeout: 5000});
    if (r.status !== 0) return "";
    const j = JSON.parse(r.stdout);
    return String((j && j.UserProfile && j.UserProfile.LoginName) || "");
  } catch (err) { return ""; }
}
function approverError(req) {
  if (!req.decideListener) return "decisions are taken only on the tailnet decision listener";
  if (!APPROVER || !APPROVER_IPS.length) return "this bridge is not set up to take decisions (BRIDGE_APPROVER and BRIDGE_APPROVER_IPS)";
  const ip = peerOf(req);
  const self = new Set(["127.0.0.1", "::1", ...csv(process.env.BRIDGE_SELF_IPS).map(normIp), ...Object.values(os.networkInterfaces()).flat().filter(Boolean).map(i => normIp(i.address))]);
  if (!ip || self.has(ip)) return "a decision cannot come from the Mac itself";
  if (!APPROVER_IPS.includes(ip)) return "a decision must come from the approved device";
  if (whoisLogin(ip).toLowerCase() !== APPROVER.toLowerCase()) return "a decision needs the approver's tailnet login (whois " + ip + ")";
  return null;
}
// status.json: the night-roll line at the top level (legacy shape), every other app's under .apps[id]
function statusFile() { const j = readJSON(STATUS_FILE, {now: null, recent: []}); return j && typeof j === "object" && Array.isArray(j.recent) ? j : {now: null, recent: []}; }
function statusAll(app) { const j = statusFile(), id = appIdOf(app); if (id === DEFAULT_APP) return j; const b = j.apps && j.apps[id]; return b && Array.isArray(b.recent) ? b : {now: null, recent: []}; }
function statusSet(text, app) {
  const file = statusFile(), id = appIdOf(app);
  let box = file;
  if (id !== DEFAULT_APP) { file.apps = file.apps || {}; box = file.apps[id] = statusAll(id); }
  const trimmed = String(text || "").trim();
  if (trimmed) { const entry = {text: trimmed.slice(0, 4000), t: Date.now()}; box.now = entry; box.recent.push(entry); box.recent = box.recent.slice(-10); }
  else box.now = null;
  writeJSON(STATUS_FILE, file);
  return {now: box.now, recent: box.recent};
}
function notesPreface(sess, app) { // what the terminal said since this session's last turn, to this chat's app only
  const fresh = inboxAll().notes.filter(n => n.id > (sess.noteSeen || 0) && forApp(n, appIdOf(app)) && !n.auto); // canned acks and quick answers are the bridge's own words, never a model's input
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
  const prompt = (job.route ? "" : notesPreface(sess, job.app)) + tail; // a route judge sees no inbox history
  const noteLast = inboxAll().last;
  // the request's optional x-nr-ctx-parts header (JSON part→chars) — stored
  // as-is in this turn's ring row, no parsing of its shape beyond valid
  // JSON (a bad/missing header just means no parts).
  let ctxParts = null;
  if (ctxPartsHeader) { try { ctxParts = JSON.parse(String(ctxPartsHeader)); } catch (err) { ctxParts = null; } }
  const sys = (job.route ? profile.sys.common : profile.sys.common + "\n" + profile.sys.read + "\n" + profile.sys.link) + (system ? "\n\nTHE APP'S OWN INSTRUCTIONS:\n" + system : "") + toolInstructions(body.tools);
  const args = ["-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose", resumed ? "--resume" : "--session-id", sess.id, "--model", model || CLAUDE_DEFAULT_MODEL, "--append-system-prompt", sys];
  args.push("--tools", ...(job.route ? ["Read", "Glob", "Grep"] : READ_TOOLS)); // always read-only, whatever --claude says (#644): the terminal session is the one writer
  args.push("--add-dir", SHOTS_DIR, ...(job.route && job.route.dir ? [job.route.dir] : [])); // an uploaded screenshot sits outside the repo; Read needs the directory allowed
  // a lean base: no MCP servers (browser/Gmail/Drive tool definitions) and
  // no skills list — the chat client uses neither.
  args.push("--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--disable-slash-commands");
  const child = spawn(CLAUDE_BIN, args, {cwd: job.route && job.route.dir || REPO, stdio: ["pipe", "pipe", "pipe"], env: childEnv()});
  job.child = child;
  let buf = "", err = "", sawText = false, held = "", holding = true, pend = "", turnUsage = null, lastAssistantUsage = null, apiCalls = 0;
  const text = t => { // hold the first characters back: a one-line tool call must not stream as prose
    if (!holding) { pend += t; return flushProse(); }
    held += t; const lead = held.trimStart();
    if (lead.length && !lead.startsWith("{") && !lead.startsWith("`")) { holding = false; pend = held; held = ""; flushProse(); }
  };
  // a sentence before the JSON line (Josh, 2026-10-05) streamed the call as
  // chat text and ran nothing — the current line stays back while it could
  // still be a trailing tool call
  const flushProse = () => {
    const call = pend.search(/(^|\n)[ \t]*\{\s*"tool_call"/); // a tool-call line already seen stays back to the end, junk after it included
    if (call >= 0) { const at = pend[call] === "\n" ? call + 1 : call; if (at) jobPush(job, {content: pend.slice(0, at)}); pend = pend.slice(at); return; }
    const cur = pend.slice(pend.lastIndexOf("\n") + 1), lead = cur.trimStart();
    const keep = !lead.length || lead.startsWith("{") || lead.startsWith("`") ? cur : "";
    const out = pend.slice(0, pend.length - keep.length);
    if (out) jobPush(job, {content: out});
    pend = keep;
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
    // a first turn stopped before Claude answered leaves the session file behind with turns still 0,
    // so every later --session-id is "already in use": start the chat over under a new id, once
    if (!sawText && code !== 0 && retry && (resumed ? /session|conversation|resume/i.test(err) : /already in use/i.test(err))) { // Claude Code lost the session (cleaned up, another machine): start this chat over, once
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
    if (!job.route) sessionUpdate(songKey, {
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
    const call = parseToolCall(holding ? held : pend);
    if (call) jobPush(job, {tool_calls: [{index: 0, id: "call_" + job.id, type: "function", function: {name: call.name, arguments: JSON.stringify(call.arguments)}}]}, "tool_calls");
    else {
      if (holding && held) jobPush(job, {content: held});
      if (!holding && pend) jobPush(job, {content: pend});
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
    if (!job.route && COMPACT_AT > 0 && ctxTokens != null && ctxTokens > COMPACT_AT) startAutoCompact(songKey, model, ctxTokens);
  });
  child.stdin.on("error", () => {}); // a child that exits at once (bad session) closes the pipe: EPIPE here crashed the whole bridge
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
    const args = ["-p", "--resume", sessionId, "--output-format", "stream-json", "--include-partial-messages", "--verbose", "--tools", READ_TOOLS.join(","), "--model", model || CLAUDE_DEFAULT_MODEL, "/compact"]; // --tools is variadic: it eats every bare word after it, "/compact" included (checked on the CLI 2026-10-20: `--tools a,b Bash` lists Bash as a tool) — a flag must sit between it and the positional
    const child = spawn(CLAUDE_BIN, args, {cwd: REPO, stdio: ["pipe", "pipe", "pipe"], env: childEnv()});
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
    child.stdin.on("error", () => {});
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
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
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
  if (req.method === "GET" && url.pathname === "/v1/jobs") return json(res, 200, {ok: true, running: [...jobs.values()].filter(j => j.status === "running").length, inbox: true, terminal: true, terminalLive: terminalReachable(), desk: true, sessions: true});
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
    if (req.method === "GET") { const since = +(url.searchParams.get("since") || 0) || 0; const app = appIdOf(url.searchParams.get("app")); const box = inboxAll(); return json(res, 200, {last: box.last, notes: box.notes.filter(n => n.id > since && forApp(n, app))}); }
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      if (!b || !String(b.text || "").trim()) return json(res, 400, {error: {message: "a note needs text"}});
      const note = inboxAdd(String(b.text).trim(), b.from, b.app);
      console.log(`inbox #${note.id} [${note.app}] from ${note.from}: ${note.text.slice(0, 80)}`);
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
  if (url.pathname === "/v1/terminal/done" && req.method === "POST") { // {id, text?}: the AI answers row id — the note goes to THAT row's app (#413 by code) and the row is marked done
    let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
    const row = terminalAll().msgs.find(x => x.id === +(b && b.id));
    if (!row) return json(res, 404, {error: {message: "no terminal row #" + (b && b.id) + " (older than the last 200?)"}});
    const text = String(b.text || "").trim();
    if (row.helper) return json(res, 409, {error: {message: "#" + row.id + " was already answered by the helper; nothing to do"}});
    const note = text ? inboxAdd(text, b.from || "terminal", row.app) : null;
    terminalMark(row.id, {done: Date.now(), ...(note ? {answered: note.id} : {})});
    console.log(`terminal #${row.id} [${appIdOf(row.app)}] done${note ? ", note #" + note.id : ""}`);
    return json(res, 200, {id: row.id, app: appIdOf(row.app), ...(note ? {note: note.id} : {})});
  }
  if (url.pathname === "/v1/asks" || url.pathname.startsWith("/v1/asks/")) { // permission cards: the hook POSTs one, long-polls it; the approver's device decides
    const id = url.pathname.slice("/v1/asks/".length);
    if (url.pathname === "/v1/asks" && req.method === "GET") return json(res, 200, {asks: openAsks()});
    if (url.pathname === "/v1/asks" && req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      const aid = String(b && b.id || "");
      if (!/^[\w-]{8,64}$/.test(aid)) return json(res, 400, {error: {message: "an ask needs an id of 8-64 letters, digits, - or _"}});
      if (!b || (b.kind !== "permission" && b.kind !== "blocked")) return json(res, 400, {error: {message: "kind must be permission or blocked"}});
      asksSweep();
      const had = asks.get(aid);
      if (had) return json(res, 200, askReply(had)); // the same hook re-POSTing (a restart, a retry): not a second card
      const now = Date.now(), str = (v, n) => String(v == null ? "" : v).slice(0, n);
      const a = {id: aid, kind: b.kind, session: str(b.session, 80), tool: str(b.tool, 80), summary: str(b.summary, 1000), detail: str(b.detail, 1000), repo: str(b.repo, 120), agent_type: str(b.agent_type, 80), app: appIdOf(b.app), hash: str(b.hash, 80), createdAt: now,
        expiresAt: Math.min(now + ASK_MAX_MS, Math.max(now + 100, +b.expiresAt || now + 600000)), status: "open", decision: null};
      asks.set(aid, a);
      asksLog({ev: "ask", id: aid, kind: a.kind, tool: a.tool, summary: a.summary.slice(0, 200), repo: a.repo, agent_type: a.agent_type});
      console.log(`ask ${aid} [${a.kind}] ${a.tool}: ${a.summary.slice(0, 80)}`);
      return json(res, 200, askReply(a));
    }
    if (id && !id.includes("/") && req.method === "GET") { // long-poll one card: answers at once when decided or expired, else after ?wait=N (≤25 s) with status "open"
      asksSweep();
      const a = asks.get(id);
      if (!a) return json(res, 404, {error: {message: "no such ask (the bridge may have restarted)"}});
      const wait = Math.min(25, Math.max(0, +(url.searchParams.get("wait") || 0) || 0));
      if (a.status !== "open" || !wait) return json(res, 200, askReply(a));
      const w = {id, res, timer: null};
      w.timer = setTimeout(() => { asksWaiters.delete(w); asksSweep(); json(res, 200, askReply(a)); }, Math.min(wait * 1000, Math.max(0, a.expiresAt - Date.now()) + 50));
      asksWaiters.add(w);
      res.on("close", () => { clearTimeout(w.timer); asksWaiters.delete(w); });
      return;
    }
    if (id && !id.includes("/") && req.method === "POST") { // {decision: "allow"|"deny", app?}: only the approver's device. First decision wins, a late one gets 409 and creates nothing
      const why = approverError(req);
      if (why) { asksLog({ev: "refused", id, why}); return json(res, 403, {error: {message: why}}); }
      asksSweep();
      const a = asks.get(id);
      if (!a) return json(res, 404, {error: {message: "no such ask"}});
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      if (a.status !== "open") return json(res, 409, {error: {message: "already " + a.status}, status: a.status});
      const decision = b && b.decision === "allow" ? "allow" : "deny"; // anything but exactly "allow" is a deny
      a.status = decision === "allow" ? "allowed" : "denied"; a.decision = decision;
      const tapped = appIdOf(b && b.app || a.app);
      if (decision === "allow" && a.kind === "blocked") {
        if (a.hash) grants.push({session: a.session, tool: a.tool, hash: a.hash, expires: Date.now() + GRANT_MS});
        terminalAdd(`Josh allowed this on the iPad: ${a.summary.slice(0, 300)}. Retry it exactly as before.`, null, tapped, null, {kind: "grant"}); // the watcher prints it as GRANT #n and wakes the AI
        terminalNotify();
      }
      const verb = decision === "allow" ? "allowed" : a.kind === "blocked" ? "left blocked" : "denied";
      inboxAdd(`Josh ${verb}: ${a.tool} ${a.summary.slice(0, 120)}`, "terminal", tapped, {auto: true});
      asksLog({ev: "decision", id, decision, kind: a.kind, tool: a.tool, app: tapped});
      console.log(`ask ${id} ${decision}`);
      asksNotify(a);
      return json(res, 200, askReply(a));
    }
  }
  if (url.pathname === "/v1/grants" && req.method === "GET") { // ?session=&tool=&hash=[&peek=1]: is there a live one-time OK for exactly this call? Consumes it unless peek
    asksSweep();
    const q = k => url.searchParams.get(k) || "";
    const i = grants.findIndex(g => g.session === q("session") && g.tool === q("tool") && g.hash === q("hash") && q("hash"));
    if (i >= 0 && !q("peek")) grants.splice(i, 1);
    return json(res, 200, {granted: i >= 0});
  }
  if (url.pathname === "/v1/ai-session") { // the one AI registers itself; a second session is refused (409) while the first polled in the last 90 s, unless it says takeover or comes from the same terminal (a /clear: same tab, new id)
    if (req.method === "GET") return json(res, 200, {session: aiSession && aiSession.id, registeredAt: aiSession && aiSession.at, aiLive: terminalReachable(), aiSeenAt: aiSeenAt || null});
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      const id = String(b && b.session || "").replace(/[^\w.:-]/g, "").slice(0, 80), term = String(b && b.terminal || "").slice(0, 120);
      const live = aiSession && aiSeenAt && Date.now() - aiSeenAt < 90000, sameTerm = !!(term && aiSession && aiSession.terminal === term);
      const refuse = () => json(res, 409, {error: {message: "another AI session is live (started " + clock(aiSession.at) + ", last polled " + clock(aiSeenAt) + ")"}, registeredAt: aiSession.at, aiSeenAt});
      if (!id) { // {terminal} alone: the watcher checking it belongs to the registered session's terminal before it polls (it registers nothing)
        if (!term) return json(res, 400, {error: {message: "a registration needs a session id"}});
        if (live && !sameTerm) return refuse();
        return json(res, 200, {ok: true, session: aiSession && aiSession.id, registeredAt: aiSession && aiSession.at});
      }
      if (live && aiSession.id !== id && !(b && b.takeover) && !sameTerm) return refuse();
      aiSession = {id, at: aiSession && aiSession.id === id ? aiSession.at : Date.now(), terminal: term || (aiSession && aiSession.id === id ? aiSession.terminal : "")};
      console.log(`ai-session ${id} registered${b && b.takeover ? " (takeover)" : sameTerm ? " (same terminal)" : ""}`);
      return json(res, 200, {ok: true, session: id, registeredAt: aiSession.at});
    }
  }
  if (url.pathname === "/v1/terminal") { // POST from a client's own Terminal-style tab; GET ?since=ID&app=a,b,c[&wait=N] from the terminal session's watcher
    if (req.method === "GET") {
      const apps = appsOf(url.searchParams.get("app")), since = +(url.searchParams.get("since") || 0) || 0, wait = Math.min(25, Math.max(0, +(url.searchParams.get("wait") || 0) || 0));
      stampPoll(apps);
      const r = terminalPoll(apps, since);
      if (r.msgs.length || !wait) return json(res, 200, r);
      const w = {apps, since, res, timer: null}; // long-poll: parked until a row arrives or the wait runs out
      w.timer = setTimeout(() => { terminalWaiters.delete(w); stampPoll(apps); json(res, 200, terminalPoll(apps, since)); }, wait * 1000);
      terminalWaiters.add(w);
      res.on("close", () => { clearTimeout(w.timer); terminalWaiters.delete(w); });
      return;
    }
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      if (!b || (!String(b.text || "").trim() && !b.shot)) return json(res, 400, {error: {message: "a message needs text"}});
      const to = appIdOf(b.app || url.searchParams.get("app") || req.headers["x-nr-app"]), fromDesk = b.fwd != null && appIdOf(b.fwd) === FRONT_DESK;
      if (to === "all") { // a broadcast: one row per Worker (never the Front Desk itself, never a row for "all" that nothing would read)
        const rows = WORKERS.map(w => terminalAdd(b.text, b.shot, w, b.fwd));
        if (fromDesk) inboxAdd("\u2192 handed to every Worker: " + String(b.text || "").slice(0, 120), FRONT_DESK, FRONT_DESK);
        console.log(`terminal #${rows.map(r => r.id).join(", #")} [all]${b.fwd ? " (forwarded from " + appIdOf(b.fwd) + ")" : ""}: ${String(b.text || "").slice(0, 80)}`);
        terminalNotify();
        return json(res, 200, {ids: rows.map(r => r.id), app: "all", apps: WORKERS});
      }
      const fromApp = to !== FRONT_DESK && !b.fwd; // a person's message from an app (not a hand-off, not the web's Front Desk): it gets the instant canned reply
      const live = to === FRONT_DESK || fromApp ? terminalReachable(to) : undefined; // decided here, once, so a message is answered exactly once
      const quick = fromApp && live === false && claudeOk; // nobody is watching: the bridge answers read-only itself
      const route = fromApp && live === true && claudeOk; // the AI is live: the read-only helper first judges question vs work (#681)
      const m = terminalAdd(b.text, b.shot, to, b.fwd, {src: b.src, label: b.label, oneoff: to === FRONT_DESK && live === false, acked: fromApp, quick, hold: route ? Date.now() + ROUTE_MS + 5000 : 0});
      let ack;
      if (fromApp) { ack = ackText(m.id, live, quick); inboxAdd(ack, "terminal", m.app, {auto: true}); } // BEFORE anything slow, in the row's own app, from "terminal": every build already shows it in the Worker tab
      if (quick) startQuickAnswer(m);
      if (route) startRouter(m);
      if (fromDesk && to !== FRONT_DESK) inboxAdd("\u2192 handed to the " + workerName(to) + " Worker: " + m.text.slice(0, 120), FRONT_DESK, FRONT_DESK);
      console.log(`terminal #${m.id} [${m.app}]${m.fwd ? " (forwarded from " + m.fwd + ")" : ""}${m.src ? " (from " + m.src + (m.label ? " \u00b7 " + m.label : "") + ")" : ""}${m.oneoff ? " (one-off)" : ""}${fromApp ? live ? " (live)" : " (offline" + (quick ? ", quick answer" : "") + ")" : ""}: ${m.text.slice(0, 80)}`);
      terminalNotify();
      return json(res, 200, {...m, now: statusAll(m.app).now, ...(live === undefined ? {} : {live}), ...(ack ? {ack} : {})});
    }
  }
  if (url.pathname === "/v1/desk" && req.method === "GET") { // the Front Desk thread's live window: its queue rows and its notes, by time. Read-only: never marks the Front Desk live. since is a timestamp (t >= since); clients de-duplicate by kind + id
    const since = +(url.searchParams.get("since") || 0) || 0;
    const rows = [
      ...terminalAll().msgs.filter(m => appIdOf(m.app) === FRONT_DESK).map(m => ({kind: "msg", id: m.id, t: m.t, app: FRONT_DESK, src: m.src, label: m.label, fwd: m.fwd, text: m.text, oneoff: m.oneoff, answered: m.answered})),
      ...inboxAll().notes.filter(n => appIdOf(n.app) === FRONT_DESK).map(n => ({kind: "note", id: n.id, t: n.t, app: FRONT_DESK, from: n.from, text: n.text})),
    ].filter(r => r.t >= since).sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id - b.id));
    return json(res, 200, {last: rows.length ? rows[rows.length - 1].t : since, rows});
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
      const app = appIdOf(url.searchParams.get("app")), box = statusAll(app);
      if (deployHold && Date.now() - deployHoldAt > 60 * 60 * 1000) { deployHold = false; deployHoldAt = 0; } // a hold nobody released: report it over on its own after 60 min
      const deployInMs = Math.max(0, deployUntil - Date.now()), deployMine = !deployApp || deployApp === app; // another app's install: not this one's countdown
      return json(res, 200, {now: box.now, recent: box.recent, terminal: true, terminalLive: terminalReachable(app), desk: true, deskLive: terminalReachable(FRONT_DESK), aiLive: terminalReachable(), aiSeenAt: aiSeenAt || null, asks: openAsks(), ...(DECIDE_ADDR ? {decideUrl: `http://${DECIDE_ADDR[1]}:${DECIDE_ADDR[2]}`} : {}), sessions: true, quota: lastQuota, ...(deployMine && deployInMs ? {deployInMs} : {}), ...(deployMine && deployHold ? {deployHold: true} : {})});
    } // terminal/sessions/quota: gates a client's Terminal UI, Compact button, usage line, and plan-quota chip
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      let app = b && b.app;
      if (b && b.msg != null) { const row = terminalAll().msgs.find(x => x.id === +b.msg); if (!row) return json(res, 404, {error: {message: "no terminal row #" + b.msg + " (older than the last 200?)"}}); app = row.app; } // --msg n: the app comes from row n, so a status can't be tagged to the wrong one
      const box = statusSet(b && b.text, app);
      console.log(box.now ? `status [${appIdOf(app)}]: ${box.now.text.slice(0, 80)}` : "status cleared");
      return json(res, 200, {now: box.now, recent: box.recent});
    }
  }
  if (req.method === "POST" && url.pathname === "/v1/deploy") { // {inSec, hold?, app?}: an install relaunches the client app in inSec seconds (0 cancels); hold:true/false pauses/releases "Not now" — independent of inSec, so a {hold:true} alone doesn't need to also know the countdown; app names the one app it is for (absent: leaves it as it was)
    let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
    if (b && typeof b.hold === "boolean") { deployHold = b.hold; deployHoldAt = b.hold ? Date.now() : 0; }
    const sec = Math.max(0, Math.min(120, +(b && b.inSec) || 0));
    deployUntil = sec ? Date.now() + sec * 1000 : 0;
    if (!sec && !deployHold) deployApp = null; // cancelled and not held: nothing is pending for anyone
    else if (b && typeof b.app === "string" && b.app) deployApp = appIdOf(b.app);
    console.log((sec ? `deploy: ${deployApp || "every app"} relaunches in ${sec}s` : "deploy: cancelled") + (deployHold ? " (held — \"Not now\")" : ""));
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
  const tkPut = url.pathname.match(/^\/v1\/takes\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (req.method === "PUT" && tkPut) { // raw bytes → takes/<app>/<id>/<name>; streamed to <name>.part, renamed when complete
    let app, id, name;
    try { [app, id, name] = tkPut.slice(1).map(decodeURIComponent); } catch (err) { return json(res, 400, {error: {message: "bad path"}}); }
    if (![app, id].every(seg => TAKE_SEG.test(seg) && seg !== "." && seg !== "..") || !TAKE_NAMES.includes(name)) return json(res, 400, {error: {message: "bad app, id or name"}});
    const dir = path.join(TAKES_DIR, app, id), dest = path.join(dir, name), part = dest + ".part";
    fs.mkdirSync(dir, {recursive: true});
    const out = fs.createWriteStream(part);
    let n = 0, werr = null;
    out.on("error", err => { werr = err; });
    const drop = () => { // unlink once the stream has closed (it may still be opening the file)
      const rm = () => { try { fs.unlinkSync(part); } catch (err) { /* never created */ } };
      if (out.closed) rm(); else { out.once("close", rm); out.destroy(); }
    };
    try {
      for await (const c of req) {
        n += c.length;
        if (n > TAKE_MAX) { drop(); return json(res, 413, {error: {message: "take too big"}}); }
        if (werr) throw werr;
        if (!out.write(c)) await new Promise(r => out.once("drain", r));
      }
      await new Promise(r => out.end(r));
      if (werr) throw werr;
    } catch (err) { drop(); return json(res, 400, {error: {message: "upload broke off"}}); }
    let have = -1; try { have = fs.statSync(dest).size; } catch (err) { /* a new file */ }
    if (have === n) { drop(); return json(res, 200, {path: dest, skipped: true}); }
    if (have >= 0 && !TAKE_REPLACEABLE.includes(name)) { drop(); return json(res, 409, {error: {message: "a different " + name + " is already stored"}}); }
    fs.renameSync(part, dest);
    console.log(`take ${app}/${id}/${name} (${n} bytes)`);
    return json(res, 200, {path: dest});
  }
  const tkList = url.pathname.match(/^\/v1\/takes\/([^/]+)$/);
  if (req.method === "GET" && tkList) { // diagnostics: what is stored for this app
    let app; try { app = decodeURIComponent(tkList[1]); } catch (err) { return json(res, 400, {error: {message: "bad path"}}); }
    if (!TAKE_SEG.test(app) || app === "." || app === "..") return json(res, 400, {error: {message: "bad app"}});
    const root = path.join(TAKES_DIR, app), takes = [];
    let ids = []; try { ids = fs.readdirSync(root).sort(); } catch (err) { /* none yet */ }
    for (const id of ids) {
      const files = [];
      try { for (const f of fs.readdirSync(path.join(root, id)).sort()) { try { files.push({name: f, bytes: fs.statSync(path.join(root, id, f)).size}); } catch (err) { /* gone mid-list */ } } } catch (err) { continue; }
      if (!files.length) continue; // a PUT that broke off or was too big left only its empty folder
      takes.push({id, files});
    }
    return json(res, 200, {takes});
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
      job.app = appIdOf(req.headers["x-nr-app"]);
      const deskRow = +req.headers["x-nr-desk"]; if (deskRow > 0) job.desk = deskRow; // the Front Desk queue row this one-off answers
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

// The decision listener (#644): only POST /v1/asks/:id, only on the tailnet address (see approverError). Bound late and
// retried, because tailscaled's interface may come up after launchd starts the bridge at login.
let decideServer = null;
if (DECIDE_ADDR) {
  const [, dHost, dPort] = DECIDE_ADDR;
  decideServer = http.createServer((req, res) => {
    if (req.method === "POST" && /^\/v1\/asks\/[\w-]+$/.test(req.url)) { req.decideListener = true; return server.emit("request", req, res); }
    json(res, 404, {error: {message: "the decision listener takes only POST /v1/asks/:id"}});
  });
  const bindDecide = () => decideServer.listen(+dPort, dHost, () => console.log(`decisions: http://${dHost}:${dPort} (approver ${APPROVER || "UNSET"} from ${APPROVER_IPS.join(", ") || "NO DEVICE"}${WHOIS ? ", whois via " + WHOIS : ", no whois"})`));
  decideServer.on("error", err => { console.error(`decision listener ${dHost}:${dPort}: ${err.message}; retrying in 15 s`); setTimeout(bindDecide, 15000).unref(); });
  bindDecide();
  if (PEER_HEADER) console.error(`WARNING: BRIDGE_TESTS_PEER_HEADER=${PEER_HEADER}: the decision peer comes from a header. Tests only.`);
} else console.log("decisions: OFF (set BRIDGE_DECIDE_ADDR=<tailnet ip>:<port>); every POST /v1/asks/:id is 403");

server.listen(PORT, HOST, async () => {
  const {models} = await listModels();
  console.log(`${profile.label || "claude-bridge"}: http://${HOST}:${PORT}` + (TOKEN ? " (token required)" : "") +
    `\n  claude code: ${claudeOk ? "yes (read-only, repo " + REPO + ")" : CLAUDE_MODE === "off" ? "off" : "not installed"}` +
    `\n  upstreams:   ${(upstreams.length ? upstreams : AUTO_UPSTREAMS).map(u => u.name + "=" + u.url).join(", ")}${upstreams.length ? "" : " (auto: listed only while running)"}` +
    `\n  models now:  ${models.map(m => m.id).join(", ") || "(none reachable)"}` +
    `\n  jobs:        ${JOBS_DIR}, kept ${KEEP_MS / 3600000}h after fetch` +
    `\n  takes:       ${TAKES_DIR} (PUT /v1/takes/<app>/<id>/<name>, never pruned)` +
    `\n  sessions:    ${SESSIONS_FILE} (one Claude Code session per chat) · inbox: ${INBOX_FILE} (--say "text")`);
});
return server;
} // startBridge
