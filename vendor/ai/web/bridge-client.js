// web/bridge-client.js — the browser side of bridge/server.mjs's own routes
// (everything beyond the OpenAI pair): the job protocol a cut stream
// resumes from, the inbox of notes, the status line, sessions, the terminal
// queue and its prefs, the composing notice, deploy hold, screenshots. HTTP
// only — no state of its own beyond the one jobs-support cache, no DOM, no
// polling; an app decides when to ask and what to show. Every call goes
// through host.url()/host.headers() (backends.js's aiUrlOf/aiHeadersOf).
// Results are {ok, status, body} so a caller can tell a 404 ("this server
// has no such route — stop asking") from a network error (thrown).
import { aiUrlOf, aiHeadersOf } from "./backends.js";

async function aiBody(r) { try { return await r.json(); } catch (err) { return null; } }
async function aiResult(r) { return {ok: r.ok, status: r.status, body: await aiBody(r)}; }
export function aiBridgeGet(host, path, opts) { return fetch(aiUrlOf(host) + path, Object.assign({headers: aiHeadersOf(host)}, opts || {})); }
export function aiBridgePost(host, path, body, opts) { return fetch(aiUrlOf(host) + path, Object.assign({method: "POST", headers: aiHeadersOf(host), body: JSON.stringify(body)}, opts || {})); }

// ---- jobs: GET /v1/jobs answers {ok:true} on a bridge; the answer is
// cached per URL. true / false / null = unreachable this instant (a reload
// with the VPN down must not fail every pending question).
export async function aiJobsSupported(host) {
  const url = aiUrlOf(host);
  if (host.settings().backend === "browser") return false;
  const st = host.state;
  if (st.askJobsCache && st.askJobsCache.url === url) return st.askJobsCache.ok;
  let ok = false;
  try { const r = await aiBridgeGet(host, "/v1/jobs"); ok = r.ok && !!(await r.json()).ok; }
  catch (err) { return null; }
  st.askJobsCache = {url, ok};
  return ok;
}
export async function aiJobGet(host, id) { // → {status, job}; job null on 404 (the server no longer has it); throws when unreachable
  const r = await aiBridgeGet(host, "/v1/jobs/" + encodeURIComponent(id));
  if (r.status === 404) return {status: 404, job: null};
  return {status: r.status, job: await aiBody(r)};
}
export function aiJobKill(host, id) { return fetch(aiUrlOf(host) + "/v1/jobs/" + encodeURIComponent(id), {method: "DELETE", headers: aiHeadersOf(host)}).catch(() => {}); }
// ---- inbox + status (polled by the app)
export async function aiInboxFetch(host, since) { return aiResult(await aiBridgeGet(host, "/v1/inbox?since=" + (+since || 0), {cache: "no-store"})); }
export async function aiStatusFetch(host) { return aiResult(await aiBridgeGet(host, "/v1/status", {cache: "no-store"})); }
// ---- sessions (one per chat key on the bridge)
export async function aiSessionGet(host, key) { return aiResult(await aiBridgeGet(host, "/v1/sessions/" + encodeURIComponent(key), {cache: "no-store"})); }
export function aiSessionDelete(host, key) { return fetch(aiUrlOf(host) + "/v1/sessions/" + encodeURIComponent(key), {method: "DELETE", headers: aiHeadersOf(host)}); }
export async function aiSessionCompact(host, key, model) { return aiResult(await aiBridgePost(host, "/v1/sessions/" + encodeURIComponent(key) + "/compact", {model})); }
// ---- the terminal queue (another Claude Code session on the Mac reads it) and its prefs
export async function aiTerminalPost(host, text) { return aiResult(await aiBridgePost(host, "/v1/terminal", {text})); }
export async function aiTerminalPrefsGet(host) { try { const r = await aiBridgeGet(host, "/v1/terminal-prefs", {cache: "no-store"}); return r.ok ? await aiBody(r) : null; } catch (err) { return null; } }
export function aiTerminalPrefsSet(host, patch) { return aiBridgePost(host, "/v1/terminal-prefs", patch); }
// ---- app state (composing / mic) and the deploy hold: fire-and-forget or caller-handled
export function aiAppState(host, body) { return aiBridgePost(host, "/v1/app-state", body).catch(() => {}); }
export function aiDeploy(host, body) { return aiBridgePost(host, "/v1/deploy", body); }
