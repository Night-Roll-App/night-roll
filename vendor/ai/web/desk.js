// web/desk.js — the Front Desk tab: ONE shared Claude Code session (app
// "front-desk" on the bridge) that every app's ✦ tab talks to, instead of a
// per-app chat. Sending queues a terminal-style message with the asking app
// (src) and a one-line context (label); there is no model call in the app.
// The tab draws the thread from GET /v1/desk (the bridge's live window, polled
// like the inbox) and caches it on the device — NOT under the chat store
// keys: the cache has no `msgs` field, so eviction, pending-question scans
// and an app's Publish never mistake it for a chat.
//
// When the Front Desk session is not being read, the bridge says so at post
// time (`live:false`) and the app asks one quick one-off through the old chat
// path; the bridge itself writes that answer into the thread.
//
// Host, beyond the earlier modules':
//   keys.desk            → the cache's storage key (no desk without it)
//   deskOffered()        → the bridge's status says `desk: true` (an old bridge: the tab stays a per-app Ask)
//   deskLive()           → the bridge's status says `deskLive` (a watcher is reading the queue)
//   deskLabel()          → one line of the app's context ("Terra · bar 12"); deskContext() → the <context> facts
//                          (default: terminalContext()); appName() → "[Name · label] " in front of the words
//   deskAppName(id)      → optional display name for another app's id in the thread
//   deskSystemPrompt()   → optional one-off system prompt (default: systemPrompt())
//   deskChanged(fresh)   → optional: rows that arrived since the last poll (notes, a Worker's report) once the cache already held some — the app's "a reply is waiting" light
//   earlierChat()        → optional [{role, content, t?, m?}]: the old Ask chat, shown read-only above the thread, never written
//   app                  → this app's bridge id (default "night-roll"); also the `src` of what it sends
import { aiStorage } from "./backends.js";
import { aiStripContext, aiSeenCommit, aiSeenDrop, aiJobId } from "./store.js";
import { aiDeskFetch, aiDeskPost, aiDeskOneOff } from "./bridge-client.js";
import { aiText } from "./client.js";
import { aiWaitAfterFail } from "./reach.js";

const CAP = 400, SPACE_MS = 10 * 60000;
export const aiDeskApp = host => host.app || "night-roll";
export function aiDeskOn(host) { return !!(host.keys && host.keys.desk && host.deskOffered && host.deskOffered()); } // the bridge offers it and the host has somewhere to cache it
export function aiDeskMode(host) { return aiDeskOn(host) && !!host.state.askGeneral && !host.state.askTerminal; } // the ✦ tab is open and it is the Front Desk
export function aiDeskGet(host) {
  try { const j = JSON.parse(aiStorage(host).getItem(host.keys.desk) || "null"); if (j && Array.isArray(j.rows)) return {last: +j.last || 0, rows: j.rows}; } catch (err) { /* corrupt: start empty */ }
  return {last: 0, rows: []};
}
export function aiDeskSave(host, d) { try { aiStorage(host).setItem(host.keys.desk, JSON.stringify({last: d.last, rows: d.rows})); } catch (err) { /* private mode / quota: the bridge still has the window */ } }
const rowKey = r => r.kind + "#" + r.id;
export function aiDeskMerge(cur, incoming) { // de-duplicated by kind + id (the newer copy wins: `answered` arrives later), ordered by time, capped
  const by = new Map();
  for (const r of cur) if (r && r.kind) by.set(rowKey(r), r);
  for (const r of incoming) if (r && r.kind) by.set(rowKey(r), r);
  return [...by.values()].sort((a, b) => (a.t - b.t) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (a.id - b.id)).slice(-CAP);
}
const sig = rows => rows.map(r => rowKey(r) + ":" + (r.answered || "") + ":" + (r.oneoff ? 1 : 0)).join("|");
export async function aiDeskPoll(host) { // fetch what is new, merge it into the cache, redraw when the thread is on screen; true when something changed
  if (!aiDeskOn(host)) return false;
  const cur = aiDeskGet(host);
  const waiting = cur.rows.filter(r => r.kind === "msg" && r.oneoff && !r.answered).map(r => r.t); // an older row's `answered` can still change: ask from there
  let r;
  try { r = await aiDeskFetch(host, Math.min(cur.last, ...waiting)); } catch (err) { return false; }
  const rows = r.ok && r.body && Array.isArray(r.body.rows) ? r.body.rows : null;
  if (!rows) return false;
  const merged = aiDeskMerge(cur.rows, rows), changed = sig(merged) !== sig(cur.rows);
  const known = new Set(cur.rows.map(rowKey)), fresh = cur.rows.length ? rows.filter(r => !known.has(rowKey(r)) && (r.kind === "note" || r.fwd)) : [];
  aiDeskSave(host, {last: Math.max(cur.last, +r.body.last || 0), rows: merged});
  if (changed && aiDeskMode(host) && host.render) host.render();
  if (fresh.length && host.deskChanged) host.deskChanged(fresh);
  return changed;
}
// ---- the thread as lines for the window: [{role: "user"|"note"|"dim", text}]
function nameOf(host, id) {
  const n = host.deskAppName ? host.deskAppName(id) : null;
  return n || String(id).split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
export function aiDeskLines(host, clock) {
  const lines = [], now = Date.now(), me = aiDeskApp(host);
  const earlier = host.earlierChat ? host.earlierChat() : [];
  if (earlier && earlier.length) {
    lines.push({role: "dim", text: aiText(host, "deskEarlier")});
    for (const m of earlier) lines.push({role: m.role === "user" ? "user" : m.role === "note" ? "note" : "ai-dim", text: (m.role === "note" ? clock(m.t) : "") + aiStripContext(m.content)});
    lines.push({role: "dim", text: aiText(host, "deskDivider")});
  }
  for (const r of aiDeskGet(host).rows) {
    if (r.kind === "msg" && r.fwd) { lines.push({role: "note", text: clock(r.t) + "✉ " + nameOf(host, r.fwd) + " Worker: " + aiStripContext(r.text)}); continue; } // a Worker reporting back to the desk
    if (r.kind === "msg") {
      const words = aiStripContext(r.text).replace(/^\[[^\]]*\]\s*/, "");
      const foreign = r.src && r.src !== me;
      lines.push({role: "user", text: clock(r.t) + (foreign ? nameOf(host, r.src) + (r.label ? " · " + r.label : "") + ": " : "") + words});
      if (r.oneoff && !r.answered && now - r.t < SPACE_MS) lines.push({role: "dim", text: aiText(host, "deskOneOff")});
    } else {
      const label = r.from === "front-desk" ? "" : r.from === "one-off" ? "✉ one-off: " : "✉ Front Desk: "; // a hand-off line reads on its own
      lines.push({role: "note", text: clock(r.t) + label + r.text});
    }
  }
  if (host.deskLive && !host.deskLive()) lines.push({role: "dim", text: aiText(host, "deskNotRunning")});
  return lines;
}
// ---- sending: queue it for the Front Desk; the answer comes back as a note in the thread
export async function aiDeskSend(host, text) {
  const key = host.keys.desk, me = aiDeskApp(host);
  const ctx = host.deskContext ? host.deskContext() : host.terminalContext ? host.terminalContext() : ""; // may stage this turn's seen-watermark — committed only if the POST lands
  const label = host.deskLabel ? host.deskLabel() : "";
  const name = host.appName ? host.appName() : nameOf(host, me);
  const bodyText = (ctx ? "<context>\n" + ctx + "\n</context>\n\n" : "") + "[" + name + (label ? " · " + label : "") + "] " + text;
  host.afterSend();
  if (host.status) host.status(aiText(host, "deskSending"));
  try {
    const r = await aiDeskPost(host, bodyText, label);
    const j = r.body || {};
    if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status);
    aiSeenCommit(host, key); // the bridge got it: this turn's "new since" lines are confirmed seen
    const cur = aiDeskGet(host);
    const row = {kind: "msg", id: j.id, t: j.t || Date.now(), app: "front-desk", src: me, label, text: bodyText, ...(j.live === false ? {oneoff: true} : {})};
    aiDeskSave(host, {last: Math.max(cur.last, row.t), rows: aiDeskMerge(cur.rows, [row])});
    if (host.render) host.render();
    if (j.live === false) { // nobody is reading the Front Desk's queue: ask the one-off now (not awaited — the bridge keeps the job and writes the answer into the thread)
      if (host.status) host.status(aiText(host, "deskOneOff"));
      const system = host.deskSystemPrompt ? host.deskSystemPrompt() : host.systemPrompt();
      aiDeskOneOff(host, {system, text: bodyText, row: j.id, job: aiJobId(host), model: host.modelName()}).then(o => { if (!o.ok && host.status) host.status("⚠ " + (o.body && o.body.error && o.body.error.message || "HTTP " + o.status)); }).catch(() => {});
    } else if (host.status) host.status(aiText(host, "deskSent"));
    const st = host.state;
    st.askDeskFast = Date.now() + 15 * 60000; // the answer shouldn't wait for the slow poll
    if (!st.askDeskTimer) st.askDeskTimer = setInterval(() => {
      if (Date.now() > st.askDeskFast) { clearInterval(st.askDeskTimer); st.askDeskTimer = null; return; }
      if (!(typeof document !== "undefined" && document.hidden)) aiDeskPoll(host);
    }, 5000);
    return true;
  } catch (err) { // not queued: say so and give the words back, never lose them
    aiSeenDrop(host, key);
    host.restoreInput(text);
    if (host.status) host.status(aiText(host, "terminalNotSent", err.message));
    aiWaitAfterFail(host);
    return false;
  }
}
