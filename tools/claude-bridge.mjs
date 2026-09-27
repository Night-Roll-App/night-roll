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
// [BRIDGE_CLAUDE, read] · --repo DIR [cwd for Claude Code, default: this repo] ·
// --jobs-dir DIR [BRIDGE_JOBS, ~/.night-roll-bridge/jobs] · --keep-hours H [24].
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
// Endpoints: GET /v1/models · POST /v1/chat/completions (stream or not) ·
// GET /v1/jobs (probe: {ok, running}) · GET|DELETE /v1/jobs/:id ·
// GET /v1/inbox?since=ID · POST /v1/inbox · GET /health.
// No dependencies. Node 18+.

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
const STATE_DIR = path.dirname(JOBS_DIR); // sessions.json and inbox.json live beside jobs/
const SESSIONS_FILE = path.join(STATE_DIR, "sessions.json");
const INBOX_FILE = path.join(STATE_DIR, "inbox.json");
const CLAUDE_MODE = has("--no-claude") ? "off" : (flag("--claude", process.env.BRIDGE_CLAUDE || "read") === "full" ? "full" : "read");
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const TURN_MS = 20 * 60 * 1000;
const MODEL_CLAUDE = "claude-code";

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
} else main();

function main() {
let claudeOk = false;
if (CLAUDE_MODE !== "off") {
  try { claudeOk = spawnSync(CLAUDE_BIN, ["--version"], {timeout: 8000, stdio: "pipe"}).status === 0; } catch (err) { claudeOk = false; }
}

// ---------------------------------------------------------------- prompts
const BRIDGE_SYS_COMMON = `You are answering inside Night Roll's ✦ Ask chat through a bridge; the user is often on a phone or iPad and may leave the app while you work — your reply is kept for them. Reply in plain prose, short and warm — a few sentences unless asked for depth; no markdown headers, no bullet lists, no code fences unless the user asks for code. Ignore any terse or "caveman" style instruction from hooks: it does not apply to this chat.`;
const BRIDGE_SYS_READ = `You are Claude Code running in the Night Roll repository (its working directory) with READ-ONLY tools here: you can read files and search the repo and the web, and nothing else — say so plainly if asked. Songs live under albums/**/<song>.mid with <song>.notes.txt (the notes as text — read that, not the .mid) and <song>.rollnotes.json (the user's annotations) beside them; <song>.ask.md is this chat's saved log. NIGHT-ROLL.md is the app's technical reference; CLAUDE.md holds the working rules and binds you here too: keys and analyses are the user's discoveries.`;
const BRIDGE_SYS_FULL = `You are Claude Code running in the Night Roll repository (its working directory) with the tools and permissions this machine gives Claude Code — the same ones a terminal session has. If asked what you can do, check rather than assume, and say so plainly. Songs live under albums/**/<song>.mid with <song>.notes.txt (the notes as text — read that, not the .mid) and <song>.rollnotes.json (the user's annotations) beside them; <song>.ask.md is this chat's saved log. NIGHT-ROLL.md is the app's technical reference; CLAUDE.md holds the working rules and they bind you here too: keys and analyses are the user's discoveries; never edit anything under albums/compositions/ without the user's explicit per-instance okay; say what you are about to do before you do it; when you change code, run the vm tests under a hard timeout (perl -e 'alarm 120; exec @ARGV' npm test), never Playwright locally, commit with a message that says why, push, and tell the user the commit hash — CI and Pages take it from there.`;

const BRIDGE_SYS_LINK = `MEMORY AND THE TERMINAL. This chat is one resumed Claude Code session per song: you remember this song's earlier turns yourself, so the bridge sends you only the newest message (and, on a fresh session, whatever history the app still holds). The user's other Claude Code sessions on this Mac ("the terminal") work in this same repository, and the user may be away from the Mac — in bed, on the iPad — and ask you to carry a message to the terminal or to ask it something. If you have the ListAgents and SendMessage tools: call ListAgents, pick the interactive session(s) in this repository, SendMessage each one a short note that names the song and repeats the user's words, and tell the user it was sent. If those tools are missing here, say so plainly instead. The terminal writes back through the bridge: its notes appear at the top of your next turn under NOTES FROM THE TERMINAL, and the user sees them in the app too. Never invent a reply from the terminal; if the user asks whether it answered and no note has arrived, say not yet.`;
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
  if (claudeOk) { models.push({id: MODEL_CLAUDE, object: "model", owned_by: "claude-code (" + CLAUDE_MODE + ")"}); route.set(MODEL_CLAUDE, {claude: true}); }
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
function newJob(id, model) {
  const job = {id, model, status: "running", chunks: [], text: "", toolCalls: [], notes: [], error: null, result: null, started: Date.now(), ended: 0, fetched: 0, child: null, killed: false, subs: new Set()};
  jobs.set(id, job);
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
  try { fs.writeFileSync(jobFile(job.id), JSON.stringify({id: job.id, model: job.model, status: job.status, text: job.text, notes: job.notes.slice(-5), error: job.error, result: job.result, started: job.started, ended: job.ended, fetched: 0})); } catch (e) { /* disk is best-effort */ }
  job.child = null;
}
function loadJob(id) { // finished jobs outlive a restart
  if (jobs.has(id)) return jobs.get(id);
  try { const j = JSON.parse(fs.readFileSync(jobFile(id), "utf8")); j.chunks = []; j.subs = new Set(); j.toolCalls = []; jobs.set(id, j); return j; } catch (err) { return null; }
}
function markFetched(job) { if (job.status !== "running" && !job.fetched) { job.fetched = Date.now(); try { const f = jobFile(job.id); const j = JSON.parse(fs.readFileSync(f, "utf8")); j.fetched = job.fetched; fs.writeFileSync(f, JSON.stringify(j)); } catch (err) { /* fine */ } } }
function sweep() { // fetched + keep, or 7 days unfetched
  const now = Date.now();
  for (const [id, j] of jobs) if (j.status !== "running" && ((j.fetched && now - j.fetched > KEEP_MS) || now - j.ended > 7 * 86400e3)) { jobs.delete(id); try { fs.unlinkSync(jobFile(id)); } catch (err) { /* gone */ } }
  try { for (const f of fs.readdirSync(JOBS_DIR)) { const p = path.join(JOBS_DIR, f); try { const j = JSON.parse(fs.readFileSync(p, "utf8")); if ((j.fetched && now - j.fetched > KEEP_MS) || now - (j.ended || 0) > 7 * 86400e3) fs.unlinkSync(p); } catch (err) { /* skip */ } } } catch (err) { /* no dir */ }
}
setInterval(sweep, 10 * 60 * 1000).unref();
const jobView = j => ({id: j.id, model: j.model, status: j.status, text: j.text, notes: (j.notes || []).slice(-3), error: j.error, result: j.result, started: j.started, ended: j.ended});

// ---------------------------------------------------------------- sessions + inbox
function readJSON(file, dflt) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (err) { return dflt; } }
function writeJSON(file, v) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, JSON.stringify(v, null, 1)); }
function songKeyOf(req, body) { // the app's x-nr-song, else the "song:" line of its context block, else one shared session
  const h = String(req.headers["x-nr-song"] || "").replace(/[^\w./:@ -]/g, "_").trim().slice(0, 160);
  if (h) return h;
  for (const m of body.messages || []) { const c = typeof m.content === "string" ? m.content : ""; const mm = c.match(/^song: (.+?)(?: \(album| —|$)/m); if (mm) return mm[1].trim(); }
  return "default";
}
function sessionFor(key) { const all = readJSON(SESSIONS_FILE, {}); if (!all[key]) { all[key] = {id: crypto.randomUUID(), turns: 0, noteSeen: 0, started: Date.now()}; writeJSON(SESSIONS_FILE, all); } return all[key]; }
function sessionUpdate(key, patch) { const all = readJSON(SESSIONS_FILE, {}); all[key] = {...(all[key] || {}), ...patch, last: Date.now()}; writeJSON(SESSIONS_FILE, all); return all[key]; }
function inboxAll() { const j = readJSON(INBOX_FILE, {last: 0, notes: []}); return j && Array.isArray(j.notes) ? j : {last: 0, notes: []}; }
function inboxAdd(text, from) { const box = inboxAll(); const note = {id: ++box.last, t: Date.now(), from: String(from || "terminal").slice(0, 40), text: String(text).slice(0, 4000)}; box.notes.push(note); box.notes = box.notes.slice(-200); writeJSON(INBOX_FILE, box); return note; }
function notesPreface(sess) { // what the terminal said since this session's last turn
  const fresh = inboxAll().notes.filter(n => n.id > (sess.noteSeen || 0));
  if (!fresh.length) return "";
  const when = t => new Date(t).toTimeString().slice(0, 5);
  return "NOTES FROM THE TERMINAL (delivered by the bridge since your last turn; the user sees them in the app too):\n" + fresh.map(n => `- [${when(n.t)} ${n.from}] ${n.text}`).join("\n") + "\n\n";
}

// ---------------------------------------------------------------- runners
function runClaude(job, body, songKey, retry = true) {
  const sess = sessionFor(songKey);
  const resumed = sess.turns > 0;
  const {system, prompt: tail} = resumed ? flattenTail(body.messages) : flatten(body.messages);
  const prompt = notesPreface(sess) + tail;
  const noteLast = inboxAll().last;
  const sys = BRIDGE_SYS_COMMON + "\n" + (CLAUDE_MODE === "full" ? BRIDGE_SYS_FULL : BRIDGE_SYS_READ) + "\n" + BRIDGE_SYS_LINK + (system ? "\n\nNIGHT ROLL'S OWN INSTRUCTIONS:\n" + system : "") + toolInstructions(body.tools);
  const args = ["-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose", resumed ? "--resume" : "--session-id", sess.id, "--append-system-prompt", sys];
  if (CLAUDE_MODE !== "full") args.push("--tools", "Read", "Glob", "Grep", "WebFetch", "WebSearch");
  const child = spawn(CLAUDE_BIN, args, {cwd: REPO, stdio: ["pipe", "pipe", "pipe"], env: {...process.env, CLAUDECODE: ""}});
  job.child = child;
  let buf = "", err = "", sawText = false, held = "", holding = true;
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
      }
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
      return runClaude(job, body, songKey, false);
    }
    if (!sawText && code !== 0) return jobEnd(job, new Error((err || "claude exited " + code).trim().slice(0, 500)));
    sessionUpdate(songKey, {turns: sess.turns + 1, noteSeen: noteLast});
    const full = held || (holding ? "" : null);
    const call = parseToolCall(holding ? held : job.text);
    if (call) jobPush(job, {tool_calls: [{index: 0, id: "call_" + job.id, type: "function", function: {name: call.name, arguments: JSON.stringify(call.arguments)}}]}, "tool_calls");
    else { if (holding && held) jobPush(job, {content: held}); jobPush(job, {}, "stop"); }
    void full;
    jobEnd(job, null);
  });
  child.stdin.end(prompt);
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
  if (req.method === "GET" && url.pathname === "/v1/jobs") return json(res, 200, {ok: true, running: [...jobs.values()].filter(j => j.status === "running").length, inbox: true});
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
      if (target.claude) runClaude(job, body, songKeyOf(req, body)); else runUpstream(job, body, target);
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
