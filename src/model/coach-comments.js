import { S } from "../state.js";

// Coach commentary (Q30-36, docs/plans/2026-10-09-coach-commentary.md option
// A). Her comments are HERS: a separate sidecar <song>.comments.json beside
// the song, never inside his .rollnotes, shown exactly as written (Learning
// mode: no analysis added), and kept out of the Ask context unless he asks.
// Device copy: localStorage "ff1roll-comments-<songKey>" (a JSON array);
// Publish writes the same list to <base>.comments.json. Merge is by id and
// append-only — an import can only add.
// Switched off 2026-10-29 (Josh #1068: not ready). One line turns it back on: the Notes entry, the ruler marks and the Ask action.
// Stored comments (localStorage + <song>.comments.json, Publish) are untouched either way.
export const COACH_ENABLED = false;
export const COACH_FORMAT = "night-roll-comments";
export function coachStoreKey(key) { return "ff1roll-comments-" + key; }
export function coachRepoPath(key) { return key.replace(/\.midi?$/i, "") + ".comments.json"; }
export function coachRead(key) {
  let v = null;
  try { v = JSON.parse(localStorage.getItem(coachStoreKey(key)) || "null"); } catch (err) { v = null; }
  return Array.isArray(v) ? v.filter(c => c && typeof c.text === "string") : [];
}
export function coachWrite(key, list) { localStorage.setItem(coachStoreKey(key), JSON.stringify(list)); }
export function coachCurrent() { // the open song's list, cached on S (the roll's draw reads it every frame)
  if (S.coachKey !== S.songKey) { S.coachKey = S.songKey; S.coachList = S.songKey ? coachRead(S.songKey) : []; }
  return S.coachList;
}
function coachHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function coachTime(v) { // number (ms) or a date string → ms, else null
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) { const t = Date.parse(v.trim()); if (isFinite(t)) return t; }
  return null;
}
function coachAt(bar, beat) { // → [bar, beat] or null (the whole song)
  const b = Math.floor(+bar);
  if (!(b >= 1)) return null;
  const q = +beat;
  return [b, q >= 1 ? Math.round(q * 100) / 100 : 1];
}
function coachMake(at, text, by, ts, on, id) {
  text = String(text).trim();
  if (!text) return null;
  const c = {id: id ? String(id) : "c-" + coachHash((by || "") + "|" + (at ? at.join(".") : "song") + "|" + text), at, by: by || "", ts, text};
  if (on && typeof on === "object") c.on = on;
  return c;
}
// Forgiving on purpose. Two shapes:
//  * lines — "bar 12: text", "12: text", "12.3 - text" (bar.beat), "bar 5
//    beat 3: text", "song: text" (the whole piece); a line that starts none
//    of these continues the comment above it. Header lines "from: Anna" and
//    "sent: 2026-10-14 10:20" name the coach and the time.
//  * JSON — {format:"night-roll-comments", by, comments:[{at:[bar,beat]|"5.3"|bar,beat, text, by?, ts?, on?, id?}]}
//    or a bare list of those.
// → {comments, skipped:[lines/items that were not comments]}. opts.now = import time; opts.by = fallback name.
export function coachParse(input, opts) {
  opts = opts || {};
  const now = opts.now !== undefined ? opts.now : Date.now();
  const text = String(input || "").trim();
  if (/^[[{]/.test(text)) {
    let j = null;
    try { j = JSON.parse(text); } catch (err) { j = null; }
    if (j) return coachParseJSON(j, opts, now);
  }
  const out = [], skipped = [];
  let by = opts.by || "", ts = null, last = null;
  const POS = /^(?:(?:bars?|m\.?|measure)\s*)?(\d+)(?:\.(\d+(?:\.\d+)?)|\s*,?\s*beat\s*(\d+(?:\.\d+)?))?\s*(?:[:\-–—)]\s*|\s+(?=\S))(.+)$/i;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { last = null; continue; }
    let m = /^(?:from|by|coach|name)\s*[:=]\s*(.+)$/i.exec(line);
    if (m) { by = m[1].trim(); continue; }
    m = /^(?:sent|time|date|ts)\s*[:=]\s*(.+)$/i.exec(line);
    if (m && coachTime(m[1]) !== null) { ts = coachTime(m[1]); continue; }
    m = /^(?:song|whole(?:\s+song)?|general|overall|piece)\s*[:\-–—]\s*(.+)$/i.exec(line);
    if (m) { last = coachMake(null, m[1], by, ts !== null ? ts : now); if (last) out.push(last); continue; }
    m = POS.exec(line);
    // "bar 5 text" needs the word bar; a bare "12 bars of tension" is not a position
    const explicit = m && (/^(?:bars?|m\.?|measure)\b/i.test(line) || /^\d+(?:\.\d+(?:\.\d+)?)?\s*[:\-–—)]/.test(line));
    if (m && explicit) {
      const at = coachAt(m[1], m[2] || m[3]);
      last = coachMake(at, m[4], by, ts !== null ? ts : now);
      if (last) out.push(last);
      continue;
    }
    if (last) { last.text += "\n" + line; last.id = coachMake(last.at, last.text, last.by, last.ts).id; continue; }
    skipped.push(line);
  }
  return {comments: out, skipped};
}
function coachParseJSON(j, opts, now) {
  const items = Array.isArray(j) ? j : Array.isArray(j.comments) ? j.comments : [];
  const topBy = (!Array.isArray(j) && (j.by || j.from || j.coach)) || opts.by || "";
  const topTs = Array.isArray(j) ? null : coachTime(j.ts !== undefined ? j.ts : j.sent);
  const out = [], skipped = [];
  for (const it of items) {
    if (!it || typeof it !== "object" || typeof it.text !== "string") { skipped.push(JSON.stringify(it)); continue; }
    let at = null;
    if (Array.isArray(it.at)) at = coachAt(it.at[0], it.at[1]);
    else if (typeof it.at === "string" || typeof it.at === "number") { const p = String(it.at).split("."); at = coachAt(p[0], p.slice(1).join(".")); }
    else if (it.bar !== undefined) at = coachAt(it.bar, it.beat);
    const ts = coachTime(it.ts !== undefined ? it.ts : it.time);
    const c = coachMake(at, it.text, String(it.by || it.from || topBy || ""), ts !== null ? ts : topTs !== null ? topTs : now, it.on, it.id);
    if (c) out.push(c); else skipped.push(JSON.stringify(it));
  }
  return {comments: out, skipped};
}
export function coachMerge(existing, incoming) { // → {list, added}; existing wins, never removes
  const seen = new Set(existing.map(c => c.id)), list = existing.slice();
  let added = 0;
  for (const c of incoming) if (!seen.has(c.id)) { seen.add(c.id); list.push(c); added++; }
  list.sort((a, b) => (a.at ? a.at[0] * 1000 + a.at[1] : -1) - (b.at ? b.at[0] * 1000 + b.at[1] : -1));
  return {list, added};
}
export function coachImport(key, input, opts) { // parse + merge + store → {added, found, skipped, total}
  const p = coachParse(input, opts);
  const m = coachMerge(coachRead(key), p.comments);
  if (m.added) { coachWrite(key, m.list); if (key === S.songKey) { S.coachKey = key; S.coachList = m.list; } }
  return {added: m.added, found: p.comments.length, skipped: p.skipped, total: m.list.length};
}
export function coachSerialize(list, title, stamp) { // the sidecar: one comment per line, like the rollnotes
  const head = {format: COACH_FORMAT, version: 1, title, saved: stamp};
  return "{" + JSON.stringify(head).slice(1, -1) + ",\"comments\":[\n" + list.map(c => JSON.stringify(c)).join(",\n") + "\n]}\n";
}
export function coachPosText(c) { return c.at ? c.at[0] + "." + c.at[1] : "song"; }
export function coachWhen(ts) { // "2026-10-14 10:20" local
  if (ts === null || ts === undefined) return "";
  const d = new Date(ts), p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
export function coachLine(c) { // her words as written, with who and when — what the sheet and Ask show
  return coachPosText(c) + " · " + (c.by || "coach") + (c.ts ? " · " + coachWhen(c.ts) : "") + ": " + c.text;
}
