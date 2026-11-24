// web/ticks.js — read receipts on the Worker chat's own messages, WhatsApp
// style, the same as BridgeChat's (swift/ TerminalChat + AIWindow.ticks):
// one grey ✓ once the bridge stored the row (its POST answered), grey ✓✓
// once the AI's watcher printed it (deliveredAt), blue ✓✓ once the AI acted
// on it (readAt: a --say into this app, --done, a helper's answer). The
// bridge's canned acks ("Got it (#n).", "Claude has #n now.", flagged
// routine:true) say no more than the tick does, so they never become notes;
// the busy and offline lines carry real news and stay.
//
// State rides on the stored user message as {rowId, tick} — client.js sets
// both when the POST answers; GET /v1/inbox's `ticks` rows (the app's last
// 30 own messages) move `tick` forward, never back. Markup: one span in the
// bubble (host.css.tick, default "asktick") with the state as a second class
// and the row number in its text (Josh cites #n); the host's CSS draws it.
// The span is there, empty, from the send on, so the bubble never grows
// when the first tick lands.
import { aiStoreGet, aiStoreSave } from "./store.js";

export const AI_TICK_LABEL = {sent: "Sent", delivered: "Delivered", read: "Read"}; // the spoken label (aria-label), as TickState.label
const AI_TICK_RANK = {sent: 0, delivered: 1, read: 2};
const AI_TICK_SKEW_MS = 120000; // row ids restart when the bridge's file is reset: a tick applies only to a message sent at about the row's time
export const AI_ROUTINE_RE = /^(Got it \(#\d+\)\.|Claude has #\d+ now\.|Sent to Claude \(#\d+\)\.?( It'll answer here\.)?)$/; // what a bridge said before it flagged them (= swift TickText.isRoutine)
export function aiTickOf(row) { return !row ? null : row.readAt ? "read" : row.deliveredAt ? "delivered" : row.receivedAt ? "sent" : null; } // null: the bridge has not stored it (no tick)
export function aiNoteRoutine(n) { return !!n && (n.routine === true || AI_ROUTINE_RE.test(String(n.text || "").trim())); }
export function aiTickMark(host, key, t, rowId) { // the POST answered with the row: the message sent at t (the last one, unmarked) gets its number and one tick
  if (!rowId) return false;
  const msgs = aiStoreGet(host, key).msgs; // re-read: a note that landed during the POST may have replaced the array the send pushed to
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "user" || m.t !== t || m.rowId) continue;
    m.rowId = rowId; m.tick = "sent";
    aiStoreSave(host, msgs, undefined, key);
    return true;
  }
  return false;
}
export function aiTicksMerge(msgs, ticks) { // the bridge's rows onto the stored messages, forward only → the messages that changed
  const changed = [];
  for (const r of Array.isArray(ticks) ? ticks : []) {
    const s = aiTickOf(r);
    if (!s || r.id == null) continue;
    let i = msgs.length - 1;
    while (i >= 0 && !(msgs[i].role === "user" && msgs[i].rowId === r.id)) i--;
    if (i < 0) continue;
    const m = msgs[i];
    if (r.t && Math.abs(r.t - (m.t || 0)) >= AI_TICK_SKEW_MS) continue; // a reused row id after a bridge reset
    if (m.tick && AI_TICK_RANK[m.tick] >= AI_TICK_RANK[s]) continue;
    m.tick = s; changed.push(m);
  }
  return changed;
}
export function aiTickCss(host) { return (host.css && host.css.tick) || "asktick"; }
export function aiTickDraw(host, div, m) { // the band under a Worker-chat bubble of the user's: "#n ✓" / "#n ✓✓"; empty before the POST answers. Idempotent: redraws its own span
  if (!div || typeof div.appendChild !== "function" || typeof document === "undefined") return null; // a host whose bubbles are plain records draws no band
  const cls = aiTickCss(host);
  let span = Array.from(div.children || []).find(c => c && c.classList && c.classList.contains(cls)) || null;
  if (!span) { span = document.createElement("span"); span.className = cls; div.appendChild(span); }
  const state = m && m.tick, rid = m && m.rowId;
  span.className = cls + (state ? " " + state : "");
  span.textContent = (rid ? "#" + rid + (state ? " " : "") : "") + (state === "sent" ? "✓" : state ? "✓✓" : "");
  span.setAttribute("aria-label", state ? (rid ? "#" + rid + " · " : "") + AI_TICK_LABEL[state] : "");
  if (div.dataset) { if (rid) div.dataset.row = String(rid); } // aiTicksRedraw finds the bubble by its row
  return span;
}
export function aiTicksRedraw(host, log, changed) { // the bubbles on screen for the messages aiTicksMerge moved
  if (!log || !changed.length) return;
  const byRow = new Map(changed.map(m => [String(m.rowId), m]));
  for (const div of Array.from(log.children || [])) { const m = div && div.dataset && byRow.get(div.dataset.row); if (m) aiTickDraw(host, div, m); }
}
