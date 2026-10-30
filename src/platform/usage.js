// src/platform/usage.js — the on-device usage counter (Josh #1083: "a list of
// what things get used the most"). Counts per action id with the first and
// last time seen; never content (no notes, song names or text). Device-local
// like any UI pref: localStorage "nr.usage", no network, never in a song,
// Publish, a repo file or Export everything. Read it with Settings → Other →
// Copy usage; tools/usage-report.mjs merges it with the native app's list.
// Ids are shared with the native app (note.add, edit.paste, transport.play…).
import { S } from "../state.js";
import { setInfo } from "../hooks.js";

export const USAGE_KEY = "nr.usage";
export const USAGE_SAVE_MS = 2000;
// An id is a dotted lower-case name — the shape alone keeps a title or a
// piece of text from ever becoming one.
export const USAGE_ID_RE = /^[a-z0-9_]+(\.[a-z0-9_]+){0,3}$/;

// pushUndo entry kind -> action id
export const USAGE_UNDO_KIND = {
  add: "note.add", erase: "note.delete", mod: "note.edit", addBatch: "note.addbatch",
  eraseBatch: "note.deletebatch", anno: "anno.edit", trackInsert: "track.add",
  trackRemove: "track.delete", trackReorder: "track.reorder", group: "edit.group",
};

function usageLoad() {
  if (S.usage) return S.usage;
  S.usage = {};
  try {
    const o = JSON.parse(localStorage.getItem(USAGE_KEY) || "{}");
    if (o && o.counts) for (const [id, v] of Object.entries(o.counts))
      if (id.length <= 48 && USAGE_ID_RE.test(id) && v && v.n > 0) S.usage[id] = {n: v.n | 0, first: +v.first || 0, last: +v.last || 0};
  } catch (e) { /* private mode / bad JSON: start empty */ }
  return S.usage;
}
export function usageDoc() { return {app: "web", v: 1, counts: usageLoad()}; }
export function usageFlush() {
  clearTimeout(S.usageTimer); S.usageTimer = 0;
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(usageDoc())); } catch (e) { /* storage denied */ }
}
export function countUsage(id) {
  if (typeof id !== "string" || id.length > 48 || !USAGE_ID_RE.test(id)) return;
  const u = usageLoad(), now = Math.floor(Date.now() / 1000), c = u[id];
  if (c) { c.n++; c.last = now; } else u[id] = {n: 1, first: now, last: now};
  if (!S.usageTimer) S.usageTimer = setTimeout(usageFlush, USAGE_SAVE_MS);
}
export function countUndoKind(kind) { const id = USAGE_UNDO_KIND[kind]; if (id) countUsage(id); }
export function usageReset() { S.usage = {}; usageFlush(); }

const TEXTY = /^(INPUT|TEXTAREA|SELECT)$/;
// One delegated listener for every button / menu item (the id is the action:
// ui.<element id>) and for keyboard shortcuts outside text fields (the key
// name only — typed text in a field is never looked at).
export function initUsage1() {
  document.addEventListener("click", e => {
    const el = e.target && e.target.closest ? e.target.closest("button,[role=button],.fitem,input[type=checkbox]") : null;
    if (!el || !el.id) return;
    const id = "ui." + el.id.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    countUsage(id);
  }, true);
  document.addEventListener("keydown", e => {
    if (e.repeat || e.isComposing) return;
    const t = e.target;
    if (t && (TEXTY.test(t.tagName) || t.isContentEditable)) return;
    const k = e.key;
    let name = null;
    if (e.code === "Space") name = "space";
    else if (k === "Enter" || k === "Escape" || k === "Backspace" || k === "Delete" || k.startsWith("Arrow")) name = k.toLowerCase();
    else if (/^[a-z0-9]$/i.test(k) && (e.metaKey || e.ctrlKey || (!e.altKey))) name = k.toLowerCase();
    if (!name) return;
    countUsage("key." + (e.metaKey || e.ctrlKey ? "cmd_" : "") + (e.shiftKey && name.length > 1 ? "shift_" : "") + name);
  }, true);
  window.addEventListener("pagehide", usageFlush);
  const cp = document.getElementById("cfgusagecopy"); // Settings → Other → Copy usage: the dev's way to read it
  if (cp) cp.addEventListener("click", async () => {
    const text = JSON.stringify(usageDoc(), null, 1);
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (err) {
      try { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove(); } catch (e2) { ok = false; }
    }
    setInfo(ok ? "usage copied: " + Object.keys(usageLoad()).length + " actions" : "⚠ couldn't copy the usage");
  });
}
