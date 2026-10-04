// web/ctx-cache.js — what a resumed server session already holds. A bridge
// session (bridge/server.mjs) remembers every earlier turn verbatim, so a
// large, slow-changing section of the app's context block need not be sent
// again while it is unchanged: the app hashes each section, and the record
// of hashes the session has CONFIRMED receiving lives here, per chat key.
// Staged per turn (aiSentStage), committed only when the reply that answers
// that turn actually lands (aiSentCommit), dropped when it doesn't
// (aiSentDrop) — a failed send never pretends the server has anything.
// Reset when the session's memory changed under the app: a clear, a compact
// (the bridge names each session's identity in x-nr-session-epoch; a
// changed epoch resets the same way).
// Shapes, exactly as stored: <key>-sentctx {field: hash, …, bars: {n: hash}};
// <key>-epoch "<session-id>:<lastCompact.at>".
import { aiStorage } from "./backends.js";
import { aiChatKey } from "./store.js";

export function aiHash(str) { // FNV-1a 32 — only has to catch "identical to what the session already has", not resist tampering
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function aiSentKey(host, key) { return aiChatKey(host, key) + "-sentctx"; }
export function aiSentGet(host, key) {
  try {
    const j = JSON.parse(aiStorage(host).getItem(aiSentKey(host, key)) || "null");
    if (j && typeof j === "object") return j;
  } catch (err) { /* corrupt: nothing confirmed sent yet */ }
  return {};
}
export function aiSentPending(host) { return host.state.askSentPending || (host.state.askSentPending = {}); }
export function aiSentStage(host, key, field, hash) { key = aiChatKey(host, key); const pend = aiSentPending(host); (pend[key] || (pend[key] = {}))[field] = hash; }
// the "bars" field is a MAP (bar number → hash), not a scalar like every
// other field — a plain assignment would let a later call in the same turn
// clobber an earlier one's bars instead of accumulating them
export function aiSentStageBars(host, key, barsObj) { key = aiChatKey(host, key); const pend = aiSentPending(host); const p = pend[key] || (pend[key] = {}); p.bars = Object.assign(p.bars || {}, barsObj); }
export const AI_SENT_BARS_CAP = 2000; // a sensible bound on one chat's per-bar record; the LOWEST bar numbers drop first past it
export function aiSentCommit(host, key) { // the reply that answers THIS context actually landed
  key = aiChatKey(host, key);
  const pend = aiSentPending(host), p = pend[key]; delete pend[key];
  if (!p) return;
  const cur = aiSentGet(host, key);
  const merged = {...cur, ...p};
  if (p.bars) { // deep-merge, never overwrite: other bars this turn didn't touch must survive
    const bars = {...(cur.bars || {}), ...p.bars};
    const keys = Object.keys(bars);
    if (keys.length > AI_SENT_BARS_CAP) for (const k of keys.map(Number).sort((a, b) => a - b).slice(0, keys.length - AI_SENT_BARS_CAP)) delete bars[k];
    merged.bars = bars;
  }
  try { aiStorage(host).setItem(aiSentKey(host, key), JSON.stringify(merged)); } catch (err) { /* private mode */ }
}
export function aiSentDrop(host, key) { delete aiSentPending(host)[aiChatKey(host, key)]; } // never landed — the full text goes again next time
export function aiSentReset(host, key) { // the session's memory of this chat just changed under us
  key = aiChatKey(host, key);
  try { aiStorage(host).removeItem(aiSentKey(host, key)); } catch (err) { /* private mode */ }
  delete aiSentPending(host)[key];
}
export function aiEpochKey(host, key) { return aiChatKey(host, key) + "-epoch"; }
export function aiEpochGet(host, key) { try { return aiStorage(host).getItem(aiEpochKey(host, key)); } catch (err) { return null; } }
export function aiEpochSet(host, key, epoch) { try { aiStorage(host).setItem(aiEpochKey(host, key), epoch); } catch (err) { /* private mode */ } }
export function aiEpochNote(host, key, epoch) { // called wherever a completion's response headers are read
  if (!epoch) return;
  const prev = aiEpochGet(host, key);
  if (prev !== null && prev !== epoch) aiSentReset(host, key); // compacted or replaced under us: resend in full next time
  aiEpochSet(host, key, epoch);
}
// One large, slow-changing section: `label` names the one-line stand-in;
// `count`, if given, is its own "(N entries)". Only a backend with a
// session memory (host.state.askCaps.bridge) ever gets the stand-in.
export function aiCachedBlock(host, key, field, label, header, text, count) {
  const hash = aiHash(text);
  const caps = host.state.askCaps;
  if (caps && caps.bridge && aiSentGet(host, key)[field] === hash) return label + ": unchanged since your last message" + (count === undefined ? "" : " (" + count + " entries)");
  aiSentStage(host, key, field, hash);
  return header + ":\n" + text;
}
