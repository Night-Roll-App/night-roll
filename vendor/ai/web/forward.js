// web/forward.js — a Worker message handed to a song's own chat (#1189).
// The bridge's kind:"chat" notes {text, song, songTitle, tag, row} carry a
// message the person sent in the Worker tab that belongs in that song's chat
// (the bridge's --to-chat, or its helper's CHAT verdict). This module keeps
// the bookkeeping: which notes this device already handled (idempotent by
// note id — a reload or a second poll never sends a message twice) and which
// still wait for their song to open. The host does the sending and draws the
// waiting list; this module only says what to do.
//
// Host: keys.forward (the one storage key), forwardChat(note, force) → true
// when the host took the message (its song is open — or, with `force`, the
// person tapped Send now and the host opens the song itself), false to keep
// it waiting; optional chatTag() → the "[App]" word this client prefixes to
// its Worker messages (null/undefined: none — a note tagged for another
// client is not this client's and is dropped, never shown or queued);
// optional onForwardsChanged(pending) after the waiting list changed.
import { aiStorage, aiDeviceId } from "./backends.js";

export const AI_FORWARD_DONE_CAP = 200;
export function aiForwardIsChat(n) { return !!n && n.kind === "chat" && typeof n.text === "string" && !!n.song; }
// Mine: sent from THIS device (the note's `device` is the id aiTerminalPost put on the row) — every device of an app polls the same inbox,
// and the words must run once. A note without a device (an older bridge, a row from before) falls back to the "[App]" tag rule.
export function aiForwardMine(host, n) { if (n.device) return n.device === aiDeviceId(host); const tag = host.chatTag ? host.chatTag() : null; return (n.tag || null) === (tag || null); }
export function aiForwardGet(host) {
  let st = null;
  try { st = JSON.parse(aiStorage(host).getItem(host.keys.forward) || "null"); } catch (err) { st = null; }
  return st && Array.isArray(st.pending) && Array.isArray(st.done) ? st : {pending: [], done: []};
}
export function aiForwardSave(host, st) {
  st.done = st.done.slice(-AI_FORWARD_DONE_CAP);
  try { aiStorage(host).setItem(host.keys.forward, JSON.stringify(st)); } catch (err) { /* storage full: the ids are lost, a repeat is then possible but harmless */ }
}
export function aiForwardPending(host) { return aiForwardGet(host).pending; }
const entryOf = n => ({id: n.id, text: String(n.text), song: String(n.song), songTitle: String(n.songTitle || n.song), t: n.t || Date.now(), ...(n.row ? {row: n.row} : {})});
function tryOne(host, st, e, force) { // the host's answer decides the entry's place: done, or (still) pending
  let took = false;
  try { took = !!host.forwardChat(e, force); } catch (err) { took = false; }
  if (took) { st.pending = st.pending.filter(p => p.id !== e.id); if (!st.done.includes(e.id)) st.done.push(e.id); }
  else if (!st.pending.some(p => p.id === e.id)) st.pending.push(e);
  return took;
}
export function aiForwardTake(host, notes) { // one poll's notes → the ones to show as notes; the chat hand-offs for this client are tried now or queued, by id, once
  const out = [];
  let st = null, changed = false;
  for (const n of Array.isArray(notes) ? notes : []) {
    if (!aiForwardIsChat(n)) { out.push(n); continue; }
    if (!aiForwardMine(host, n)) continue; // another client's hand-off (its own [App] tag): not shown here
    st = st || aiForwardGet(host);
    if (st.done.includes(n.id) || st.pending.some(p => p.id === n.id)) continue;
    tryOne(host, st, entryOf(n), false);
    changed = true;
  }
  if (changed) { aiForwardSave(host, st); if (host.onForwardsChanged) host.onForwardsChanged(st.pending); }
  return out;
}
export function aiForwardRetry(host) { // a song opened: every waiting message whose song it is goes out (the host says which, by answering true)
  const st = aiForwardGet(host);
  if (!st.pending.length) return 0;
  let sent = 0;
  for (const e of [...st.pending]) if (tryOne(host, st, e, false)) sent++;
  if (sent) { aiForwardSave(host, st); if (host.onForwardsChanged) host.onForwardsChanged(st.pending); }
  return sent;
}
export function aiForwardSendNow(host, id) { // the person's tap: the host opens the song itself (force)
  const st = aiForwardGet(host), e = st.pending.find(p => p.id === id);
  if (!e) return false;
  const took = tryOne(host, st, e, true);
  if (took) { aiForwardSave(host, st); if (host.onForwardsChanged) host.onForwardsChanged(st.pending); }
  return took;
}
export function aiForwardDismiss(host, id) {
  const st = aiForwardGet(host);
  if (!st.pending.some(p => p.id === id)) return false;
  st.pending = st.pending.filter(p => p.id !== id); if (!st.done.includes(id)) st.done.push(id);
  aiForwardSave(host, st); if (host.onForwardsChanged) host.onForwardsChanged(st.pending);
  return true;
}
