// web/store.js — the on-device chat record: one store per chat key, kept
// whole until the app's own save step appends it to a file, capped so it
// can never crowd out the app's own data; the per-chat "seen up to" cursor
// for lines the app feeds the model; the pending-question markers a job
// protocol resumes from; the unsent draft; the markdown an app appends to
// its log file.
//
// Keys are the HOST's (host.keys.store is the prefix every chat store key
// starts with; .seenMax, .draft, .inboxSeen name the rest) — an app that
// already has chats on devices hands in its existing names and nothing
// migrates. Shapes, exactly as stored:
//   <store key>            {lastUsed, msgs: [{role, content, t?, at?, m?, pending?, …}], saved, trimmed}
//   <store key>-seen       {err, status}        host.keys.seenMax: the same, the high-water mark across chats
//   host.keys.draft+<key>  {text, shots: [path]}  (an older {shot: path} still reads)
// Host, beyond backends.js's: keys.store/.seenMax/.draft, chatKey() (the
// open chat's store key), logCursor() → {err, status} (the newest ids of
// the app's own log lines), status(text) (a one-line notice), optional
// onStoreChanged(key), optional jobPrefix (default "nr_").
import { aiStorage } from "./backends.js";

export const AI_LOCAL_SOFT = 256 * 1024, AI_TOTAL_CAP = 512 * 1024;
export function aiStorageKeys(host) { const s = aiStorage(host); try { return typeof s.keys === "function" ? s.keys() : Object.keys(s); } catch (err) { return []; } }
export function aiChatKey(host, key) { return key || host.chatKey(); }
export function aiStripContext(text) { return (text == null ? "" : String(text)).replace(/^<context>[\s\S]*?<\/context>\s*/, ""); }
// `saved` counts the messages the app's file already holds, from the front;
// `trimmed` says some were let go after reaching it, so a renderer shows the file.
export function aiStoreGet(host, key) {
  try {
    const j = JSON.parse(aiStorage(host).getItem(aiChatKey(host, key)) || "null");
    if (j && Array.isArray(j.msgs)) return {msgs: j.msgs, saved: Math.min(j.saved || 0, j.msgs.length), trimmed: !!j.trimmed, lastUsed: j.lastUsed || 0};
  } catch (err) { /* corrupt: start empty */ }
  return {msgs: [], saved: 0, trimmed: false, lastUsed: 0};
}
export function aiIsChatStore(host, key) { // a cursor (-seen, -sentctx, -epoch) shares the prefix but is never a chat
  try { const j = JSON.parse(aiStorage(host).getItem(key) || "null"); return !!(j && Array.isArray(j.msgs)); } catch (err) { return false; }
}
export function aiChatKeys(host) { return aiStorageKeys(host).filter(k => k.startsWith(host.keys.store) && aiIsChatStore(host, k)); }
export function aiUnsavedCount(host, key) { const st = aiStoreGet(host, key); return st.msgs.length - st.saved; }
export function aiRevertToSaved(host, key) { // back to exactly the messages the file holds — `saved` of them, from the front
  key = aiChatKey(host, key);
  const st = aiStoreGet(host, key);
  if (st.msgs.length <= st.saved) return; // nothing unsaved — no-op
  try { aiStorage(host).setItem(key, JSON.stringify({lastUsed: Date.now(), msgs: st.msgs.slice(0, st.saved), saved: st.saved, trimmed: st.trimmed})); }
  catch (err) { /* private mode / quota: leave it */ }
}
export function aiEvictOthers(host, mine) { // other chats go LRU-first when the total runs long — never one with unsaved messages, never a cursor
  try {
    const s = aiStorage(host), cur = host.chatKey();
    const others = aiChatKeys(host).filter(k => k !== cur)
      .map(k => { const st = aiStoreGet(host, k); return {k, lu: st.lastUsed, n: (s.getItem(k) || "").length, clean: st.msgs.length === st.saved}; })
      .sort((a, b) => a.lu - b.lu);
    let total = mine + others.reduce((a, o) => a + o.n, 0);
    for (const o of others) {
      if (total <= AI_TOTAL_CAP) break;
      if (!o.clean) continue;
      // an emptied chat keeps its `trimmed` marker: a renderer then loads the
      // file instead of greeting an empty chat (the messages were not lost)
      const had = aiStoreGet(host, o.k).msgs.length;
      if (had) s.setItem(o.k, JSON.stringify({lastUsed: o.lu, msgs: [], saved: 0, trimmed: true})); else s.removeItem(o.k);
      total -= o.n;
    }
  } catch (err) { /* enumeration failed: skip eviction */ }
}
export function aiStoreSave(host, msgs, meta, key) {
  key = aiChatKey(host, key);
  const s = aiStorage(host);
  const prev = aiStoreGet(host, key);
  let saved = meta && meta.saved !== undefined ? Math.min(meta.saved, msgs.length) : Math.min(prev.saved, msgs.length);
  let trimmed = prev.trimmed;
  let keep = msgs.map(m => Object.assign({}, m, {content: aiStripContext(m.content)})); // the context block is never stored, only shown once on the wire
  const pack = () => JSON.stringify({lastUsed: Date.now(), msgs: keep, saved, trimmed});
  const dropSaved = () => { if (saved < 2) return false; keep = keep.slice(2); saved -= 2; trimmed = true; return true; };
  let str = pack();
  while (str.length > AI_LOCAL_SOFT && dropSaved()) str = pack();
  aiEvictOthers(host, str.length);
  const tryPut = () => { try { s.setItem(key, pack()); return true; } catch (err) { return false; } };
  let ok = tryPut();
  while (!ok && dropSaved()) ok = tryPut(); // quota: shed what the file already has
  while (!ok && keep.length > 2) { // nothing saved left to shed — the oldest unsaved go, and it says so
    keep = keep.slice(2); saved = 0;
    ok = tryPut();
    if (ok && host.status) host.status("chat storage is full — the oldest messages were dropped; save to keep the rest");
  }
  if (host.onStoreChanged) host.onStoreChanged(key);
}
// ---- pending questions (the job protocol in bridge-client.js): a user
// message carries `pending: <job id>` until its reply lands
export function aiPendingIndex(msgs, jobId) { return msgs.findIndex(m => m.pending === jobId); }
export function aiPendingAll(host) { // every pending question on this device, oldest first, across every chat
  const out = [];
  try {
    for (const k of aiChatKeys(host)) aiStoreGet(host, k).msgs.forEach((m, i) => { if (m.pending) out.push({key: k, jobId: m.pending, i, t: m.t || 0}); });
  } catch (err) { /* enumeration failed: nothing to resume */ }
  return out.sort((a, b) => a.t - b.t);
}
export function aiJobId(host) { return (host.jobPrefix || "nr_") + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 20) : Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); }
// ---- seen cursor: per chat, "seen up to id" for the app's own log lines
// it feeds the model as "new since last time" — staged per turn, committed
// only once the turn actually landed, dropped when it didn't. The max
// across chats is the app's own read watermark.
export function aiSeenKey(host, key) { return aiChatKey(host, key) + "-seen"; }
export function aiSeenGet(host, key) {
  try {
    const j = JSON.parse(aiStorage(host).getItem(aiSeenKey(host, key)) || "null");
    if (j && typeof j === "object") return {err: j.err || 0, status: j.status || 0};
  } catch (err) { /* corrupt: nothing seen yet */ }
  return {err: 0, status: 0};
}
export function aiSeenMax(host) {
  try {
    const j = JSON.parse(aiStorage(host).getItem(host.keys.seenMax) || "null");
    if (j && typeof j === "object") return {err: j.err || 0, status: j.status || 0};
  } catch (err) { /* corrupt: nothing marked read yet */ }
  return {err: 0, status: 0};
}
export function aiSeenSet(host, key, seen) {
  const s = aiStorage(host);
  try { s.setItem(aiSeenKey(host, key), JSON.stringify(seen)); } catch (err) { /* private mode */ }
  const m = aiSeenMax(host);
  const next = {err: Math.max(m.err, seen.err || 0), status: Math.max(m.status, seen.status || 0)};
  if (next.err !== m.err || next.status !== m.status) try { s.setItem(host.keys.seenMax, JSON.stringify(next)); } catch (err) { /* private mode */ }
}
export function aiSeenAdvance(host, key) { aiSeenSet(host, key, host.logCursor()); } // what a landed send commits
export function aiSeenPending(host) { return host.state.askSeenPending || (host.state.askSeenPending = {}); }
export function aiSeenStage(host, key, seen) { aiSeenPending(host)[aiChatKey(host, key)] = seen; }
export function aiSeenCommit(host, key) { key = aiChatKey(host, key); const pend = aiSeenPending(host), p = pend[key]; delete pend[key]; if (p) aiSeenSet(host, key, p); }
export function aiSeenDrop(host, key) { delete aiSeenPending(host)[aiChatKey(host, key)]; } // never landed: the same lines go again next time
// ---- the unsent draft: per chat, device-local, cleared on send. Reads the
// shape from before shots were a list ({shot: path}) as a one-item list.
export function aiDraftKey(host, key) { return host.keys.draft + aiChatKey(host, key); }
export function aiDraftRead(host, key) {
  let d = null; try { d = JSON.parse(aiStorage(host).getItem(aiDraftKey(host, key)) || "null"); } catch (err) { d = null; }
  return {text: d && d.text || "", shots: d && d.shots ? d.shots : d && d.shot ? [d.shot] : []};
}
export function aiDraftWrite(host, key, draft) {
  const text = draft && draft.text || "", shots = draft && draft.shots || [];
  try {
    if (!text.trim() && !shots.length) aiStorage(host).removeItem(aiDraftKey(host, key));
    else aiStorage(host).setItem(aiDraftKey(host, key), JSON.stringify({text, shots}));
  } catch (err) { /* storage full or private: the box itself still holds it */ }
}
export function aiDraftClear(host, key) { try { aiStorage(host).removeItem(aiDraftKey(host, key)); } catch (err) { /* nothing stored */ } }
// ---- what an app appends to its log file: one heading per question (when,
// where), the reply under it. `labels`: {user, note, ai} — the app's names.
export function aiLogMarkdown(msgs, labels) {
  const L = Object.assign({user: "You", note: "Note", ai: "AI"}, labels || {});
  const two = n => String(n).padStart(2, "0");
  const when = t => { const d = new Date(t); return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes()); };
  let out = "";
  for (const m of msgs) {
    const c = aiStripContext(m.content).trim();
    if (m.role === "user") out += "\n### " + (m.t ? when(m.t) : "—") + (m.at ? " · " + m.at : "") + "\n\n**" + L.user + ":** " + c + "\n";
    else if (m.role === "note") out += "\n**" + L.note + " (" + (m.m || "terminal") + "):** " + c + "\n";
    else out += "\n**" + L.ai + (m.m ? " (" + m.m + ")" : "") + ":** " + c + "\n";
  }
  return out;
}
