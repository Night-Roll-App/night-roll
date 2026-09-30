#!/usr/bin/env node
// tools/claude-bridge.mjs — the Night Roll AI bridge: ONE server in front of
// whatever models you have, for anyone (Josh, 2026-09-26: "I want to make sure
// everybody can run this with LM Studio or Claude Code or both, or Ollama").
//
// It speaks the OpenAI protocol, so Night Roll's Settings → "on a server"
// points at it like at any model server. It lists every model it can reach
// and runs each turn as a JOB that survives the phone or iPad dropping the
// connection (Safari suspends a backgrounded tab): the answer is kept until
// the app fetches it.
//
//   node tools/claude-bridge.mjs                       # auto: LM Studio :1234 + Ollama :11434 if up, Claude Code if installed
//   node tools/claude-bridge.mjs --upstream lmstudio=http://localhost:1234 --upstream ollama=http://localhost:11434
//   node tools/claude-bridge.mjs --claude full         # let Claude Code use every tool it has here (edit, run, push)
//   node tools/claude-bridge.mjs --no-claude           # models from the upstreams only
//   node tools/claude-bridge.mjs --token s3cret        # require "Authorization: Bearer s3cret" (Settings → key)
//   node tools/claude-bridge.mjs --host 0.0.0.0        # listen beyond this machine (put TLS in front: Tailscale Serve, Caddy…)
//   npm run bridge  (the same, from the repo)
//
// Flags (env in brackets): --port N [BRIDGE_PORT, 8787] · --host H [BRIDGE_HOST,
// 127.0.0.1] · --token T [BRIDGE_TOKEN] · --upstream name=url (repeatable)
// [BRIDGE_UPSTREAMS, comma-separated name=url] · --no-claude · --claude read|full
// [BRIDGE_CLAUDE, read] · --model M [BRIDGE_MODEL, opus: what "claude-code" runs;
// "claude-code-opus/-sonnet/-haiku/-fable" are listed too, so the app's model
// menu switches per chat without touching this Mac] · --repo DIR [cwd for Claude Code, default: this repo] ·
// --jobs-dir DIR [BRIDGE_JOBS, ~/.night-roll-bridge/jobs] · --keep-hours H [24] ·
// --state-dir DIR [beside the default jobs dir; inside a custom one].
// POST /v1/shot takes a PNG/JPEG (the app's 📷) and answers {path} under
// <state-dir>/shots; Claude Code gets that directory via --add-dir.
//
// Models: "claude-code" when the `claude` CLI is installed (and not --no-claude),
// plus every model each upstream lists, refreshed on every /v1/models call —
// load a model in LM Studio, tap Test, it is there. A model id that two
// upstreams share is exposed as "<upstream>/<id>".
//
// Claude Code runs as `claude -p` in --repo with --claude read (Read, Glob, Grep,
// WebFetch, WebSearch only) or full (whatever tools and permissions Claude Code
// has on this machine — it can edit, run tests, commit and push; the appended
// prompt binds it to the repo's CLAUDE.md). Night Roll's app tools
// (add_annotation, read_song, …) reach Claude as a one-line JSON convention and
// come back as OpenAI tool_calls; upstream servers get the `tools` as-is.
//
// Jobs: keyed by the app's `x-nr-job` header (or generated). A job runs to the
// end whether or not anyone listens, keeps every chunk, replays them to a
// second POST with the same id, answers GET /v1/jobs/:id (status running/done/
// error, text, result) and DELETE (kill). Finished jobs are written to
// --jobs-dir and kept until fetched + --keep-hours (7 days at most), so a
// bridge restart does not lose an answer.
//
// Sessions (2026-09-27, Josh: "I can't message you back without getting out
// of bed, which is why I want the bridge to be able to have the model then
// talk to you"): each song's chat is ONE Claude Code session, kept across
// turns — the app names the song in `x-nr-song`, the bridge maps it to a
// session id (~/.night-roll-bridge/sessions.json), starts it with
// --session-id and continues it with --resume, and sends only the newest
// message (Claude remembers the rest itself). A session Claude Code no
// longer has is started over once, silently. In full mode that Claude has
// the ListAgents/SendMessage tools, so it can carry a note to the user's
// terminal Claude Code sessions on this Mac; the terminal answers through
// the INBOX: `node tools/claude-bridge.mjs --say "text"` (or POST
// /v1/inbox {text, from}) — the app shows the note in ✦ Ask and the song's
// session sees it at the top of its next turn.
//
// Status line (2026-09-29, Josh: "I wish I had a way to see what Claude Code
// was working on from here; right now I just wait until it sends me a
// message"): `node tools/claude-bridge.mjs --status "text"` (or POST
// /v1/status {text}) sets a current one-liner and keeps the last 10 with
// timestamps; `--status ""` or `--status-clear` clears the current line
// (history stays) — the app shows it atop the general chat and in ⏳ Jobs.
//
// Endpoints: GET /v1/models · POST /v1/chat/completions (stream or not) ·
// GET /v1/jobs (probe: {ok, running}) · GET|DELETE /v1/jobs/:id ·
// GET /v1/inbox?since=ID · POST /v1/inbox · GET|POST /v1/status · GET|POST /v1/app-state · GET|POST /v1/terminal ·
// GET|DELETE /v1/sessions/:key (usage {turns, tokens, cost, lastCompact}; DELETE drops the
// session id so the next turn starts fresh — Clear chat's backend reset) ·
// POST /v1/sessions/:key/compact (runs `/compact` non-interactively on that
// song's Claude Code session; {preTokens, postTokens, cost, turnsBefore, turnsAfter}) · GET /health.
// No dependencies. Node 18+.
//
// AI session controls (2026-09-30, open-items.md "NEXT: AI SESSION CONTROLS",
// Josh via Ask: "the same Claude session keeps being resumed and growing").
// Each song's session (sessions.json) now also accumulates usage from every
// turn's stream-json "result" event: usage.input_tokens/output_tokens/
// cache_read_input_tokens/cache_creation_input_tokens and total_cost_usd —
// the real field names, found by running `claude -p --session-id <uuid> …`
// against a throwaway session and reading its stream. GET /v1/sessions/:key
// sums them into {turns, tokens, cost}, for the app's per-tab usage line.
// Compaction: `claude -p --resume <id> … "/compact"` DOES run non-interactively
// (confirmed against a live throwaway session) and emits a
// `{"type":"system","subtype":"compact_boundary","compact_metadata":{pre_tokens,
// post_tokens,…}}` line with the exact before/after context size, so no
// summarize-into-a-new-session fallback was needed. Plan-quota %: every turn
// (and /compact) also emits a top-level `{"type":"rate_limit_event",
// "rate_limit_info":{unifiedWindows:{five_hour,seven_day}}}` line — free,
// no extra call — kept as the bridge's last-seen `lastQuota` and surfaced on
// GET /v1/status as `quota` (this account's own bridge-wide usage, not
// per-session).

import http from "node:http";
import {spawn, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";

// ---------------------------------------------------------------- config
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; };
const has = name => argv.includes(name);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(flag("--port", process.env.BRIDGE_PORT || 8787));
const HOST = flag("--host", process.env.BRIDGE_HOST || "127.0.0.1");
const TOKEN = flag("--token", process.env.BRIDGE_TOKEN || "");
const REPO = path.resolve(flag("--repo", path.resolve(HERE, "..")));
const JOBS_DIR = flag("--jobs-dir", process.env.BRIDGE_JOBS || path.join(os.homedir(), ".night-roll-bridge", "jobs"));
const KEEP_MS = Math.min(7 * 24, Math.max(1, +flag("--keep-hours", 24))) * 3600 * 1000;
// sessions.json and inbox.json live beside the default jobs/ dir; a custom
// --jobs-dir (the tests' temp dir) keeps its state INSIDE it, so two bridges
// never share an inbox by accident (the test suite read the real one, 2026-09-27).
// Not in the jobs dir itself: sweep() treats every file there as a job.
const DEFAULT_JOBS_DIR = path.join(os.homedir(), ".night-roll-bridge", "jobs");
const STATE_DIR = flag("--state-dir", path.resolve(JOBS_DIR) === DEFAULT_JOBS_DIR ? path.dirname(JOBS_DIR) : path.join(JOBS_DIR, "state"));
const SESSIONS_FILE = path.join(STATE_DIR, "sessions.json");
const INBOX_FILE = path.join(STATE_DIR, "inbox.json");
const STATUS_FILE = path.join(STATE_DIR, "status.json");
let appState = null; // {composing, mic, t} — POST /v1/app-state from the app
const SHOTS_DIR = path.join(STATE_DIR, "shots"); // screenshots from the app's 📷 (POST /v1/shot): Claude reads them by path
const SHOT_MAX = 25 * 1024 * 1024;
const CLAUDE_MODE = has("--no-claude") ? "off" : (flag("--claude", process.env.BRIDGE_CLAUDE || "read") === "full" ? "full" : "read");
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const TURN_MS = 20 * 60 * 1000;
const MODEL_CLAUDE = "claude-code";
// Claude Code's own default model is whatever this Mac's settings say — the
// bridge always passes one, so a phone in bed can pick (2026-09-28: Ask was
// stuck on the Mac's default with no way to change it from the iPad)
const CLAUDE_DEFAULT_MODEL = flag("--model", process.env.BRIDGE_MODEL || "opus");
const CLAUDE_MODELS = ["opus", "sonnet", "haiku", "fable"];

const upstreams = []; // [{name, url}]
for (let i = 0; i < argv.length; i++) if (argv[i] === "--upstream" && argv[i + 1]) upstreams.push(parseUpstream(argv[++i]));
for (const u of (process.env.BRIDGE_UPSTREAMS || "").split(",").map(s => s.trim()).filter(Boolean)) upstreams.push(parseUpstream(u));
function parseUpstream(s) { const m = s.match(/^([\w-]+)=(.+)$/); return m ? {name: m[1], url: m[2].replace(/\/+$/, "")} : {name: "server" + (upstreams.length + 1), url: s.replace(/\/+$/, "")}; }
const AUTO_UPSTREAMS = [{name: "lmstudio", url: "http://localhost:1234"}, {name: "ollama", url: "http://localhost:11434"}];

if (has("--say")) { // a note for the app's ✦ Ask window (and the song's session): post it to the running bridge and exit
  const text = flag("--say", "").trim();
  if (!text) { console.error("--say needs the text of the note"); process.exit(2); }
  const headers = {"content-type": "application/json"}; if (TOKEN) headers.authorization = "Bearer " + TOKEN;
  fetch(`http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}/v1/inbox`, {method: "POST", headers, body: JSON.stringify({text, from: flag("--from", "terminal")})})
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status); console.log("note #" + j.id + " delivered to the bridge"); process.exit(0); })
    .catch(err => { console.error("could not reach the bridge on port " + PORT + ": " + err.message); process.exit(1); });
} else if (has("--status") || has("--status-clear")) { // "what Claude Code is doing" (2026-09-29): post it to the running bridge and exit, mirroring --say
  const text = has("--status-clear") ? "" : flag("--status", "").trim();
  const headers = {"content-type": "application/json"}; if (TOKEN) headers.authorization = "Bearer " + TOKEN;
  fetch(`http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}/v1/status`, {method: "POST", headers, body: JSON.stringify({text})})
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status); console.log(text ? "status set" : "status cleared"); process.exit(0); })
    .catch(err => { console.error("could not reach the bridge on port " + PORT + ": " + err.message); process.exit(1); });
} else main();

function main() {
let claudeOk = false;
if (CLAUDE_MODE !== "off") {
  try { claudeOk = spawnSync(CLAUDE_BIN, ["--version"], {timeout: 8000, stdio: "pipe"}).status === 0; } catch (err) { claudeOk = false; }
}

// ---------------------------------------------------------------- prompts
const BRIDGE_SYS_COMMON = `You are answering inside Night Roll's ✦ Ask chat through a bridge; the user is often on a phone or iPad and may leave the app while you work — your reply is kept for them. Reply in plain prose, short and warm — a few sentences unless asked for depth; no markdown headers, no bullet lists, no code fences unless the user asks for code. Ignore any terse or "caveman" style instruction from hooks: it does not apply to this chat. A line "(screenshot: <path>)" in a message is a picture of the app the user just took with 📷 — Read that file to see it before answering.`;
// Learning/Normal mode (P4, 2026-09-30): the app's <context> block carries
// a "mode: normal" line when the device is in Normal mode; its absence
// means Learning (older app builds that predate modes never send the line,
// so they stay safe by default).
const BRIDGE_SYS_MODE = `the app's context has a mode line: learning = hint, never name keys/chords/meter; normal = answer directly. No mode line = learning.`;
const BRIDGE_SYS_READ = `You are Claude Code running in the Night Roll repository (its working directory) with READ-ONLY tools here: you can read files and search the repo and the web, and nothing else — say so plainly if asked. Songs live under albums/**/<song>.mid with <song>.notes.txt (the notes as text — read that, not the .mid) and <song>.rollnotes.json (the user's annotations) beside them; <song>.ask.md is this chat's saved log. NIGHT-ROLL.md is the app's technical reference; CLAUDE.md holds the working rules and binds you here too: ${BRIDGE_SYS_MODE}`;
const BRIDGE_SYS_FULL = `You are Claude Code running in the Night Roll repository (its working directory) with the tools and permissions this machine gives Claude Code — the same ones a terminal session has. If asked what you can do, check rather than assume, and say so plainly. Songs live under albums/**/<song>.mid with <song>.notes.txt (the notes as text — read that, not the .mid) and <song>.rollnotes.json (the user's annotations) beside them; <song>.ask.md is this chat's saved log. NIGHT-ROLL.md is the app's technical reference; CLAUDE.md holds the working rules and they bind you here too: ${BRIDGE_SYS_MODE} Never edit anything under albums/compositions/ without the user's explicit per-instance okay; say what you are about to do before you do it; when you change code, run the vm tests under a hard timeout (perl -e 'alarm 120; exec @ARGV' npm test), never Playwright locally, commit with a message that says why, push, and tell the user the commit hash — CI and Pages take it from there.`;

const BRIDGE_SYS_LINK = `MEMORY AND THE TERMINAL. This chat is one resumed Claude Code session per song: you remember this song's earlier turns yourself, so the bridge sends you only the newest message (and, on a fresh session, whatever history the app still holds). The user's other Claude Code sessions on this Mac ("the terminal") work in this same repository, and the user may be away from the Mac — in bed, on the iPad — and ask you to carry a message to the terminal or to ask it something. To reach it: (1) write the request into open-items.md under a dated heading, in the user's words (the terminal reads open-items at every pull); (2) post a one-line note with \`node tools/claude-bridge.mjs --say "<summary>" --from ask\` — the terminal watches the inbox for notes from "ask" and is woken by them; (3) if you also have ListAgents and SendMessage, SendMessage the interactive session(s) in this repository too. Never conclude from ListAgents that the terminal is down: a busy or non-interactive listing shows nothing even while it runs (2026-09-27: it was mid-implementation and you told the user it was down). Say what you did and that the terminal will pick it up. The terminal writes back through the bridge: its notes appear at the top of your next turn under NOTES FROM THE TERMINAL, and the user sees them in the app too. Never invent a reply from the terminal; if the user asks whether it answered and no note has arrived, say not yet.`;
function toolInstructions(tools) {
  if (!tools || !tools.length) return "";
  const list = tools.map(t => { const f = t.function || {}; return `- ${f.name}: ${f.description || ""}\n  parameters: ${JSON.stringify(f.parameters || {})}`; }).join("\n");
  return `\n\nAPP TOOLS. The app can run these for you (it, not you, has the open song and the user's device):\n${list}\nTo call one, make your ENTIRE reply exactly one line of JSON and nothing else:\n{"tool_call":{"name":"<name>","arguments":{...}}}\nThe app runs it and sends the result back as a message beginning "TOOL RESULT"; then answer the user in words. Call at most one tool per reply. Follow each tool's own rule about when it may be used.`;
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
function flattenTail(messages) { // a resumed session: only what came after the last reply it gave (the newest question, plus this round's tool call + results)
  const list = messages || [];
  let from = 0;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].role === "assistant" && !(list[i].tool_calls && list[i].tool_calls.length)) { from = i + 1; break; }
  return flatten(list.filter((m, i) => m.role === "system" || i >= from));
}
function safeJSON(s) { try { return JSON.parse(s || "{}"); } catch (err) { return {}; } }
function parseToolCall(text) { // the whole reply is one JSON line → a tool call; anything else is prose
  const t = (text || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  if (!t.startsWith("{") || !t.includes("tool_call")) return null;
  try { const j = JSON.parse(t); if (j && j.tool_call && j.tool_call.name) return {name: String(j.tool_call.name), arguments: j.tool_call.arguments || {}}; } catch (err) { /* prose */ }
  return null;
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
// A running job is on disk from the start (2026-09-26 audit): a restart used
// to forget it, and the app then read "no such job" — the same words as a
// question that never arrived. Now the restart marks it, and the app can say
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
function sanitizeSongKey(raw) { return String(raw || "").replace(/[^\w./:@ -]/g, "_").trim().slice(0, 160); } // the one rule for what a session key looks like — shared by the chat path (x-nr-song) and the /v1/sessions/:key path, so the same song always lands on the same row
function songKeyOf(req, body) { // the app's x-nr-song, else the "song:" line of its context block, else one shared session
  const h = sanitizeSongKey(req.headers["x-nr-song"]);
  if (h) return h;
  for (const m of body.messages || []) { const c = typeof m.content === "string" ? m.content : ""; const mm = c.match(/^song: (.+?)(?: \(album| —|$)/m); if (mm) return mm[1].trim(); }
  return "default";
}
// Usage (2026-09-30): tokensIn/tokensOut/cacheRead/cacheCreate/costUsd
// accumulate across every turn (runClaude reads them from the stream's
// "result" event); GET /v1/sessions/:key sums them for the app's per-tab
// line. lastCompact holds the most recent compaction's exact before/after
// (compact_boundary's own numbers, not our running sum).
function sessionFor(key) { const all = readJSON(SESSIONS_FILE, {}); if (!all[key]) { all[key] = {id: crypto.randomUUID(), turns: 0, noteSeen: 0, started: Date.now(), tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheCreate: 0, costUsd: 0, lastCompact: null}; writeJSON(SESSIONS_FILE, all); } return all[key]; }
function sessionUpdate(key, patch) { const all = readJSON(SESSIONS_FILE, {}); all[key] = {...(all[key] || {}), ...patch, last: Date.now()}; writeJSON(SESSIONS_FILE, all); return all[key]; }
function sessionUsageView(s) { // {turns, tokens, cost} — s may be undefined (never asked anything yet)
  if (!s) return {turns: 0, tokens: 0, cost: 0, lastCompact: null};
  const tokens = (s.tokensIn || 0) + (s.tokensOut || 0) + (s.cacheRead || 0) + (s.cacheCreate || 0);
  return {turns: s.turns || 0, tokens, cost: Math.round((s.costUsd || 0) * 10000) / 10000, lastCompact: s.lastCompact || null};
}
// Plan-quota % (open-items.md item 4): every turn's stream-json ALREADY
// carries a top-level rate_limit_event — no extra "/usage" call needed —
// {rate_limit_info:{unifiedWindows:{five_hour:{utilization,resetsAt},
// seven_day:{utilization,resetsAt}}}}. Bridge-wide (one Claude Code account),
// not per-song: kept as the last one seen, surfaced on GET /v1/status.
let lastQuota = null; // {fiveHour:{pct,resetsAt}, sevenDay:{pct,resetsAt}, at} | null (never seen one yet)
function recordQuota(info) {
  const w = info && info.unifiedWindows;
  if (!w) return;
  const pct = win => win && typeof win.utilization === "number" ? {pct: Math.round(win.utilization * 100), resetsAt: win.resetsAt || null} : null;
  lastQuota = {fiveHour: pct(w.five_hour), sevenDay: pct(w.seven_day), at: Date.now()};
}
function inboxAll() { const j = readJSON(INBOX_FILE, {last: 0, notes: []}); return j && Array.isArray(j.notes) ? j : {last: 0, notes: []}; }
function inboxAdd(text, from) { const box = inboxAll(); const note = {id: ++box.last, t: Date.now(), from: String(from || "terminal").slice(0, 40), text: String(text).slice(0, 4000)}; box.notes.push(note); box.notes = box.notes.slice(-200); writeJSON(INBOX_FILE, box); return note; }
// "what Claude Code is doing" (2026-09-29, Josh: "I wish I had a way to see
// what Claude Code was working on from here"): one current line (null when
// idle) plus the last 10 it ever said, each with a timestamp. Clearing only
// blanks `now` — `recent` is history and never shrinks from a clear.
// the app's Terminal tab (Josh, 2026-09-29: "can messages typed in the AI
// panel go straight into your terminal session?"): a queue the terminal's
// Claude Code watches (GET ?since=), answered through the inbox (--say)
const TERMINAL_FILE = path.join(STATE_DIR, "terminal.json");
let terminalPolledAt = 0; // the terminal session's watcher GETs /v1/terminal every few seconds: recent = someone is there to read the tab
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

// ---------------------------------------------------------------- runners
function runClaude(job, body, songKey, model, retry = true) {
  const sess = sessionFor(songKey);
  const resumed = sess.turns > 0;
  const {system, prompt: tail} = resumed ? flattenTail(body.messages) : flatten(body.messages);
  const prompt = notesPreface(sess) + tail;
  const noteLast = inboxAll().last;
  const sys = BRIDGE_SYS_COMMON + "\n" + (CLAUDE_MODE === "full" ? BRIDGE_SYS_FULL : BRIDGE_SYS_READ) + "\n" + BRIDGE_SYS_LINK + (system ? "\n\nNIGHT ROLL'S OWN INSTRUCTIONS:\n" + system : "") + toolInstructions(body.tools);
  const args = ["-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose", resumed ? "--resume" : "--session-id", sess.id, "--model", model || CLAUDE_DEFAULT_MODEL, "--append-system-prompt", sys];
  if (CLAUDE_MODE !== "full") args.push("--tools", "Read", "Glob", "Grep", "WebFetch", "WebSearch");
  args.push("--add-dir", SHOTS_DIR); // a 📷 screenshot sits outside the repo; Read needs the directory allowed
  const child = spawn(CLAUDE_BIN, args, {cwd: REPO, stdio: ["pipe", "pipe", "pipe"], env: {...process.env, CLAUDECODE: ""}});
  job.child = child;
  let buf = "", err = "", sawText = false, held = "", holding = true, turnUsage = null;
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
      } else if (j.type === "assistant" && j.message && Array.isArray(j.message.content)) {
        for (const c of j.message.content) if (c.type === "tool_use") jobPush(job, {reasoning_content: "using " + c.name + (c.input && (c.input.file_path || c.input.pattern || c.input.command || c.input.url) ? " " + String(c.input.file_path || c.input.pattern || c.input.command || c.input.url).slice(0, 80) : "") + "… "});
      } else if (j.type === "result") {
        if (j.is_error && !sawText) err = j.result || j.error || "claude reported an error";
        if (!sawText && typeof j.result === "string" && j.result) { sawText = true; text(j.result); }
        // usage (2026-09-30): the real field names, read off a live turn —
        // input_tokens/output_tokens/cache_read_input_tokens/cache_creation_input_tokens, total_cost_usd
        if (j.usage) turnUsage = {in: j.usage.input_tokens || 0, out: j.usage.output_tokens || 0, cacheRead: j.usage.cache_read_input_tokens || 0, cacheCreate: j.usage.cache_creation_input_tokens || 0, cost: j.total_cost_usd || 0};
      } else if (j.type === "rate_limit_event") recordQuota(j.rate_limit_info); // plan-quota %: free, rides every turn already
    }
  });
  child.stderr.on("data", d => { err += d.toString(); });
  child.on("error", e => { clearTimeout(timer); jobEnd(job, e); });
  child.on("close", code => {
    clearTimeout(timer);
    if (job.killed) return jobEnd(job, new Error("stopped"));
    if (!sawText && code !== 0 && resumed && retry && /session|conversation|resume/i.test(err)) { // Claude Code lost the session (cleaned up, another machine): start this song over, once
      sessionUpdate(songKey, {id: crypto.randomUUID(), turns: 0, noteSeen: 0, started: Date.now(), lost: err.trim().slice(0, 200)});
      job.notes.push("session restarted");
      return runClaude(job, body, songKey, model, false);
    }
    if (!sawText && code !== 0) return jobEnd(job, new Error((err || "claude exited " + code).trim().slice(0, 500)));
    sessionUpdate(songKey, {
      turns: sess.turns + 1, noteSeen: noteLast,
      tokensIn: (sess.tokensIn || 0) + (turnUsage ? turnUsage.in : 0),
      tokensOut: (sess.tokensOut || 0) + (turnUsage ? turnUsage.out : 0),
      cacheRead: (sess.cacheRead || 0) + (turnUsage ? turnUsage.cacheRead : 0),
      cacheCreate: (sess.cacheCreate || 0) + (turnUsage ? turnUsage.cacheCreate : 0),
      costUsd: (sess.costUsd || 0) + (turnUsage ? turnUsage.cost : 0),
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
    jobEnd(job, null);
  });
  child.stdin.end(prompt);
}
// Compact (open-items.md "NEXT: AI SESSION CONTROLS" #2): `claude -p --resume
// <id> … "/compact"` runs the real slash command non-interactively — verified
// against a live throwaway session (2026-09-30) — and its stream emits a
// `{"type":"system","subtype":"compact_boundary","compact_metadata":{pre_tokens,
// post_tokens,…}}` line with the EXACT before/after context size, plus a
// closing "result" line with total_cost_usd for this compaction turn. No
// summarize-into-a-new-session fallback needed. Not a chat job (nothing to
// stream to the app; the Compact button awaits this directly).
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
  res.setHeader("access-control-expose-headers", "x-nr-job");
}
function json(res, code, obj) { cors(res); res.writeHead(code, {"content-type": "application/json"}); res.end(JSON.stringify(obj)); }
const readBody = req => new Promise((res, rej) => { let b = ""; req.on("data", d => { b += d; }); req.on("end", () => res(b)); req.on("error", rej); });
function authorized(req) { if (!TOKEN) return true; const h = String(req.headers.authorization || ""); return h === "Bearer " + TOKEN; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }
  if (url.pathname === "/health") return json(res, 200, {ok: true});
  if (!authorized(req)) return json(res, 401, {error: {message: "this bridge wants its token — Settings → key"}});
  if (req.method === "GET" && url.pathname === "/v1/models") { const {models} = await listModels(); return json(res, 200, {object: "list", data: models}); }
  if (req.method === "GET" && url.pathname === "/v1/jobs") return json(res, 200, {ok: true, running: [...jobs.values()].filter(j => j.status === "running").length, inbox: true, terminal: true, terminalLive: terminalReachable(), sessions: true});
  const sm = url.pathname.match(/^\/v1\/sessions\/([^/]+)(\/compact)?$/); // AI session controls (open-items.md): usage + Clear-really-resets + Compact
  if (sm) {
    const key = sanitizeSongKey(decodeURIComponent(sm[1])) || "default"; // the exact rule songKeyOf applies to x-nr-song, so the same song always lands on the same row
    if (!sm[2] && req.method === "GET") { const all = readJSON(SESSIONS_FILE, {}); return json(res, 200, sessionUsageView(all[key])); }
    if (!sm[2] && req.method === "DELETE") { // Clear chat really resets: drop the session id so the next turn starts a new Claude Code session; .ask.md and the inbox are untouched
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
        sessionUpdate(key, {turns: 1, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheCreate: 0, costUsd: (sess.costUsd || 0) + r.cost, lastCompact: {at: Date.now(), preTokens: r.preTokens, postTokens: r.postTokens, cost: r.cost}});
        return json(res, 200, {ok: true, turnsBefore: before.turns, turnsAfter: 1, tokensBefore: r.preTokens != null ? r.preTokens : before.tokens, tokensAfter: r.postTokens, cost: r.cost});
      } catch (err) { return json(res, 500, {error: {message: String((err && err.message) || err).slice(0, 500)}}); }
    }
  }
  if (url.pathname === "/v1/inbox") { // notes from the terminal: the app polls with ?since=<last id it showed>
    if (req.method === "GET") { const since = +(url.searchParams.get("since") || 0) || 0; const box = inboxAll(); return json(res, 200, {last: box.last, notes: box.notes.filter(n => n.id > since)}); }
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      if (!b || !String(b.text || "").trim()) return json(res, 400, {error: {message: "a note needs text"}});
      const note = inboxAdd(String(b.text).trim(), b.from);
      console.log(`inbox #${note.id} from ${note.from}: ${note.text.slice(0, 80)}`);
      return json(res, 200, note);
    }
  }
  if (url.pathname === "/v1/terminal-prefs") { // the Terminal tab's model pickers (Josh, 2026-09-30): which model the terminal session gives its advisors and builders
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
  if (url.pathname === "/v1/terminal") { // POST from the app's Terminal tab; GET ?since=ID from the terminal session's watcher
    if (req.method === "GET") { terminalPolledAt = Date.now(); const since = +(url.searchParams.get("since") || 0) || 0; const box = terminalAll(); return json(res, 200, {last: box.last, msgs: box.msgs.filter(m => m.id > since)}); }
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      if (!b || (!String(b.text || "").trim() && !b.shot)) return json(res, 400, {error: {message: "a message needs text"}});
      const m = terminalAdd(b.text, b.shot);
      console.log(`terminal #${m.id}: ${m.text.slice(0, 80)}`);
      return json(res, 200, {...m, now: statusAll().now});
    }
  }
  if (url.pathname === "/v1/app-state") { // the app says Josh is typing/dictating in ✦ AI; a build waits rather than relaunch under him (2026-09-29). In memory; stale after 2 min
    if (req.method === "GET") { const fresh = appState && Date.now() - appState.t < 120000; return json(res, 200, fresh ? appState : {composing: false}); }
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      appState = {composing: !!(b && b.composing), mic: !!(b && b.mic), t: Date.now()};
      return json(res, 200, appState);
    }
  }
  if (url.pathname === "/v1/status") { // "what Claude Code is doing" — GET for the app's poll, POST from --status or a session announcing a step
    if (req.method === "GET") { const box = statusAll(); return json(res, 200, {now: box.now, recent: box.recent, terminal: true, terminalLive: terminalReachable(), sessions: true, quota: lastQuota}); } // terminal: the app shows ⌨ Terminal only while a session reads it; sessions/quota: gates Compact + the usage line + the plan-quota chip
    if (req.method === "POST") {
      let b; try { b = JSON.parse(await readBody(req)); } catch (err) { return json(res, 400, {error: {message: "bad JSON"}}); }
      const box = statusSet(b && b.text);
      console.log(box.now ? `status: ${box.now.text.slice(0, 80)}` : "status cleared");
      return json(res, 200, {now: box.now, recent: box.recent});
    }
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
    let job = loadJob(id);
    if (!job) {
      const {route} = await listModels();
      const target = route.get(body.model) || route.get(MODEL_CLAUDE) || [...route.values()][0];
      if (!target) return json(res, 503, {error: {message: "no model reachable: start LM Studio / Ollama, or install Claude Code"}});
      job = newJob(id, body.model || (target.claude ? MODEL_CLAUDE : target.id));
      if (target.claude) runClaude(job, body, songKeyOf(req, body), target.model); else runUpstream(job, body, target);
    }
    const cid = "chatcmpl-" + id;
    const finalMessage = () => job.result && job.result.tool_calls ? {role: "assistant", content: null, tool_calls: job.result.tool_calls} : {role: "assistant", content: job.text};
    if (!body.stream) {
      const done = () => { markFetched(job); json(res, 200, {id: cid, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: job.model, choices: [{index: 0, message: finalMessage(), finish_reason: job.result && job.result.tool_calls ? "tool_calls" : "stop"}]}); };
      if (job.status === "done") return done();
      if (job.status === "error") return json(res, 500, {error: {message: job.error}});
      const sub = ev => { if (ev.type !== "end") return; if (job.status === "error") json(res, 500, {error: {message: job.error}}); else done(); };
      job.subs.add(sub); req.on("close", () => job.subs.delete(sub));
      return;
    }
    cors(res);
    res.setHeader("x-nr-job", id);
    res.writeHead(200, {"content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive"});
    const send = obj => { if (!res.writableEnded) res.write("data: " + JSON.stringify(obj) + "\n\n"); };
    const chunk = c => send({id: cid, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: job.model, choices: [{index: 0, delta: c.delta, finish_reason: c.finish}]});
    const end = () => { if (res.writableEnded) return; if (job.status === "error") send({error: {message: job.error}}); markFetched(job); res.write("data: [DONE]\n\n"); res.end(); };
    if (job.chunks.length) for (const c of job.chunks) chunk(c); // attaching late (or a restart-loaded job): replay
    else if (job.status !== "running") { if (job.result && job.result.tool_calls) chunk({delta: {tool_calls: job.result.tool_calls.map((t, i) => ({index: i, ...t}))}, finish: "tool_calls"}); else chunk({delta: {content: job.text}, finish: "stop"}); }
    if (job.status !== "running") return end();
    const sub = ev => { if (ev.type === "chunk") chunk(ev.chunk); else end(); };
    job.subs.add(sub);
    req.on("close", () => job.subs.delete(sub)); // the client went away: the job goes on, the app fetches it later
    return;
  }
  json(res, 404, {error: {message: "not found"}});
});

server.listen(PORT, HOST, async () => {
  const {models} = await listModels();
  console.log(`night-roll bridge: http://${HOST}:${PORT}` + (TOKEN ? " (token required)" : "") +
    `\n  claude code: ${claudeOk ? "yes (" + CLAUDE_MODE + ", repo " + REPO + ")" : CLAUDE_MODE === "off" ? "off" : "not installed"}` +
    `\n  upstreams:   ${(upstreams.length ? upstreams : AUTO_UPSTREAMS).map(u => u.name + "=" + u.url).join(", ")}${upstreams.length ? "" : " (auto: listed only while running)"}` +
    `\n  models now:  ${models.map(m => m.id).join(", ") || "(none reachable)"}` +
    `\n  jobs:        ${JOBS_DIR}, kept ${KEEP_MS / 3600000}h after fetch` +
    `\n  sessions:    ${SESSIONS_FILE} (one Claude Code session per song) · inbox: ${INBOX_FILE} (--say "text")`);
});
} // main
