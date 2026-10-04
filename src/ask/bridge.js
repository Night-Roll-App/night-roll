import { askStoreKey } from "./sheet.js";
import { appErrors } from "../model/jobs.js";
import { appDebug } from "../model/jobs.js";
import { S } from "../state.js";
import { cfg } from "../platform/storage.js";
import { songTitleOfImpl as songTitleOf } from "./context.js";
import { askStripContext } from "./context.js";
import { baseName } from "../model/rollnotes.js";
import { appMode } from "../platform/mode.js";
import { ASK_TOOLS } from "./tools.js";
import { aiUrl } from "./backend.js";
import { aiHostKind } from "./backend.js";
import { setControl } from "../ui/controls.js";
import { aiHeaders } from "./backend.js";
import { askstatus } from "./sheet.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { folderActive } from "../platform/folder.js";
import { folderRead } from "../platform/folder.js";
import { folderWrite } from "../platform/folder.js";
import { isCompositionKey } from "../model/provenance.js";
import { isComposition } from "../model/provenance.js";
import { repoApi } from "../platform/storage.js";

// ---- history: per song, context stripped at SAVE time, capped so it can
// never crowd out saveDraft (drafts are the only copy of unsynced music)
export const ASK_LOCAL_SOFT = 256 * 1024, ASK_TOTAL_CAP = 512 * 1024;
// General chat (2026-09-27, Josh via the bridge: "some sort of main ask
// section that's not per song … I'm talking to you on the death song from
// Final Fantasy but nothing we're talking about has anything to do with
// that"). One more chat key, "general": its own store, its own resumed
// bridge session, no song context, no annotation tool, and a repo-level
// log at ask/general.ask.md that Publish ships like a song's chat. The
// toggle at the top of the sheet picks; the choice is a device preference.
export const ASK_GENERAL_KEY = "ff1roll-ask-general";
export const ASK_GENERAL_LOG = "ask/general.ask.md";
// Terminal (Josh, 2026-09-29: "can messages typed in the AI panel go
// straight into your terminal session?"): a third chat whose Send posts to
// the bridge's /v1/terminal queue, which the terminal's Claude Code watches;
// its replies come back as inbox notes and land in this tab. No song
// context, no model call here. An addition beside the Ask tabs, not the
// default (Josh is evaluating it: Ask answers at once while I build). It rides the general chat's
// UI (askGeneral stays true: no span row, no Fill), with its own store.
export const ASK_TERMINAL_KEY = "ff1roll-ask-terminal";
// ---- seen-cursor for the "New since your last message:" bridge context
// (2026-09-30). Per chat (song key / general / terminal — askStoreKey()
// already tells them apart, so its value doubles as the cursor's own key),
// "seen up to id" for both logs. Device-local localStorage is right: it's UI
// state (what THIS device has already told the bridge), not song state.
export function askSeenKey(key) { return (key || askStoreKey()) + "-seen"; }
export function askSeenGet(key) {
  try {
    const j = JSON.parse(localStorage.getItem(askSeenKey(key)) || "null");
    if (j && typeof j === "object") return {err: j.err || 0, status: j.status || 0};
  } catch (err) { /* corrupt: nothing seen yet */ }
  return {err: 0, status: 0};
}
export function askMaxErrId() { let m = 0; for (const l of appErrors) if (l.id > m) m = l.id; for (const l of appDebug) if (l.id > m) m = l.id; return m; }
export function askMaxStatusId() { return S.statusHistory.length ? S.statusHistory[S.statusHistory.length - 1].id : 0; }
// Mark-as-read watermark (2026-09-30): the HIGH-WATER MARK across every
// chat's own cursor — once a line has gone out in ANY chat's context block,
// it's "already sent" for the app's own ⚠ badge/sheet and Status window too
// (errChip, the #errsheet render, and #infosheet would use this), never only
// the chat Josh happens to have open.
export function askSeenMaxKey() { return "ff1roll-ask-seen-max"; }
export function askSeenMax() {
  try {
    const j = JSON.parse(localStorage.getItem(askSeenMaxKey()) || "null");
    if (j && typeof j === "object") return {err: j.err || 0, status: j.status || 0};
  } catch (err) { /* corrupt: nothing marked read yet */ }
  return {err: 0, status: 0};
}
export function askSeenSet(key, seen) {
  try { localStorage.setItem(askSeenKey(key), JSON.stringify(seen)); } catch (err) { /* private mode */ }
  const m = askSeenMax();
  const next = {err: Math.max(m.err, seen.err || 0), status: Math.max(m.status, seen.status || 0)};
  if (next.err !== m.err || next.status !== m.status) try { localStorage.setItem(askSeenMaxKey(), JSON.stringify(next)); } catch (err) { /* private mode */ }
}
// Sets the watermark immediately — what a successfully-landed send commits
// (below), and what some tests call directly to simulate that same effect.
export function askSeenAdvance(key) { askSeenSet(key, {err: askMaxErrId(), status: askMaxStatusId()}); }
export function askSeenStage(key, seen) { S.askSeenPending[key] = seen; }
export function askSeenCommit(key) { const p = S.askSeenPending[key]; delete S.askSeenPending[key]; if (p) askSeenSet(key, p); }
export function askSeenDrop(key) { delete S.askSeenPending[key]; }
// never landed: try the same "new since" lines again next time
// The chat is his session record (Josh, 2026-09-25): it lives here whole
// until the song's Save appends it to <song>.ask.md, and only messages the
// repo file already holds ever leave this device. `saved` counts those from
// the front; `trimmed` says some were let go, so askRender shows the file.
export function askStore(key) {
  try {
    const j = JSON.parse(localStorage.getItem(key || askStoreKey()) || "null");
    if (j && Array.isArray(j.msgs)) return {msgs: j.msgs, saved: Math.min(j.saved || 0, j.msgs.length), trimmed: !!j.trimmed, lastUsed: j.lastUsed || 0};
  } catch (err) { /* corrupt: start empty */ }
  return {msgs: [], saved: 0, trimmed: false, lastUsed: 0};
}
export function askLoad() { return askStore().msgs; }
export function askUnsavedCount(key) { const st = askStore(key); return st.msgs.length - st.saved; }
// Revert's chat leg (a Publish-row Revert drops EVERYTHING unpublished,
// chat included, Josh 2026-09-30): truncate back to exactly the messages
// already in <song>.ask.md — `saved` of them, from the front. No published
// chat (saved 0) means this empties the log, same as Clear chat.
export function askRevertToSaved(key) {
  const st = askStore(key);
  if (st.msgs.length <= st.saved) return; // nothing unsaved — no-op
  try { localStorage.setItem(key, JSON.stringify({lastUsed: Date.now(), msgs: st.msgs.slice(0, st.saved), saved: st.saved, trimmed: st.trimmed})); }
  catch (err) { /* private mode / quota: leave it, the song revert above already happened */ }
}
export function askEvictOthers(mine) { // other songs' logs go LRU-first when the total runs long — never one with unsaved messages
  try {
    const others = Object.keys(localStorage).filter(k => k.startsWith("ff1roll-ask-") && k !== askStoreKey())
      .map(k => { const st = askStore(k); return {k, lu: st.lastUsed, n: (localStorage.getItem(k) || "").length, clean: st.msgs.length === st.saved}; })
      .sort((a, b) => a.lu - b.lu);
    let total = mine + others.reduce((a, o) => a + o.n, 0);
    for (const o of others) {
      if (total <= ASK_TOTAL_CAP) break;
      if (!o.clean) continue;
      // an emptied log keeps its `trimmed` marker: askRender then loads the
      // repo file instead of greeting an empty chat (the messages were not lost)
      const had = askStore(o.k).msgs.length;
      if (had) localStorage.setItem(o.k, JSON.stringify({lastUsed: o.lu, msgs: [], saved: 0, trimmed: true})); else localStorage.removeItem(o.k);
      total -= o.n;
    }
  } catch (err) { /* enumeration failed: skip eviction */ }
}
export function askModelName() { const c = cfg(); return c.aiBackend === "browser" ? c.aiBrowserModel : (c.aiModel || (S.askModelCache && S.askModelCache.ids[0]) || "model"); }
export function askLogKey(keyArg) { // a store key ("ff1roll-ask-…"), a song key, or nothing (the open chat) → the store key
  if (!keyArg) return askStoreKey();
  return keyArg.startsWith("ff1roll-ask-") ? keyArg : "ff1roll-ask-" + keyArg;
}
export function askLogSong(storeKey) { return storeKey === ASK_GENERAL_KEY ? null : storeKey.slice("ff1roll-ask-".length); }
export function askLogPath(key) { const sk = askLogKey(key); if (sk === ASK_GENERAL_KEY) return ASK_GENERAL_LOG; const song = askLogSong(sk); return song && song !== "local" ? song.replace(/\.midi?$/i, "") + ".ask.md" : null; }
// beside the .mid (compositions) or the .rollnotes.json (analyzed); the general chat at the repo root
export function askLogHeader(key) {
  const sk = askLogKey(key);
  if (sk === ASK_GENERAL_KEY) return "# ✦ AI log — general\n\nThe chat that is not about one song (the app, the project, music in general, messages for the terminal). Night Roll appends the unsaved messages each time it is published from the PUBLISH sheet; Clear chat starts a new session on the device without touching this file.\n";
  return "# ✦ AI log — " + songTitleOf(askLogSong(sk)) + "\n\nOne file per song. Night Roll appends the chat since the last Save each time the song is saved; Clear chat starts a new session on the device without touching this file.\n";
}
export function askLogMarkdown(msgs) { // what Save appends: one heading per question (when, which bars), the reply under it
  const two = n => String(n).padStart(2, "0");
  const when = t => { const d = new Date(t); return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes()); };
  let out = "";
  for (const m of msgs) {
    const c = askStripContext(m.content).trim();
    if (m.role === "user") out += "\n### " + (m.t ? when(m.t) : "—") + (m.at ? " · " + m.at : "") + "\n\n**Josh:** " + c + "\n";
    else if (m.role === "note") out += "\n**Mac (" + (m.m || "terminal") + "):** " + c + "\n";
    else out += "\n**AI" + (m.m ? " (" + m.m + ")" : "") + ":** " + c + "\n";
  }
  return out;
}
// ---- Notes from the Mac (2026-09-27, Josh: "I can't message you back without
// getting out of bed"). The bridge keeps an inbox the terminal's Claude Code
// writes to (`node tools/claude-bridge.mjs --say "…"`); the app polls it,
// shows each note in ✦ AI as a "note" bubble, saves it with the chat (so it
// reaches <song>.ask.md), and lights ✉ on the Ask button until read. Only a
// host already allowed for Ask is polled; a server without /v1/inbox (LM
// Studio, Ollama) is asked once and left alone.
// Mode-separated sessions (2026-10-01, docs/ask-token-plan.md #2 — SAFETY):
// Learning is the law (CLAUDE.md) — a Normal-mode turn's content (a key/
// chord estimate, "mode: normal") must never leak into a Learning-mode
// chat's AI context, and the bridge's Claude Code is a RESUMED session that
// remembers every earlier turn verbatim. Without this, flipping the SAME
// song's chat between modes would resume the SAME bridge session either
// way, and a later Learning-mode turn would inherit Normal-mode content
// from the session's own memory — never caught by any check on what THIS
// turn's context carries, since the leak lives in the session, not the
// turn. A different mode is a different session, period.
export function askSessionName() { return (S.askGeneral ? "general" : String(S.songKey || "draft:" + (typeof baseName === "function" ? baseName() : "local")).replace(/[^\x20-\x7e]/g, "_").slice(0, 160)) + (appMode() === "normal" ? "#normal" : ""); }
export const ASK_SONG_ONLY_TOOLS = ["add_annotation", "edit_annotation", "delete_annotation", "publish_song", "read_bars", "write_notes", "copy_bars", "insert_bars", "delete_bars"];
// no open song in the general chat (these are all about THE open song, unlike read_song/read_notes, which name another one)
export function askToolsNow() { return S.askGeneral ? ASK_TOOLS.filter(t => !ASK_SONG_ONLY_TOOLS.includes(t.function.name)) : ASK_TOOLS; }
export function askInboxSeenKey() { return "ff1roll-ask-inbox-seen"; }
export function askInboxAllowed() {
  const url = aiUrl();
  if (!url || cfg().aiBackend === "browser" || S.askInboxNo === url) return false;
  if (aiHostKind(url) === "local") return true;
  try { return JSON.parse(localStorage.getItem("ff1roll-ai-hosts") || "[]").includes(new URL(url).host); } catch (err) { return false; }
}
export function askAgeText(t) { // "3m ago" — coarse, no need for seconds precision once past a minute
  const s = Math.max(0, Math.round((Date.now() - (t || 0)) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60); if (m < 60) return m + "m ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  return Math.round(h / 24) + "d ago";
}
export function deployButtonTick() {
  const b = document.getElementById("askbtn");
  if (!b) return;
  // setControl (src/ui/controls.js) rebuilds the whole innerHTML each tick —
  // same reasoning as setPlayBtn/updateJobsBtn: the vm harness's element
  // stubs have no querySelector, and it's the one place a control's icon
  // (autoAwesome, unchanged here) plus label gets written.
  const left = Math.ceil((S.deployAt - Date.now()) / 1000);
  deployBannerShow(S.deployHeld ? "Update waiting — install when you're ready" : left > 0 ? "Update installs in " + left + " s — the app will restart" : "Installing the update…", !S.deployHeld && left <= 0);
  if (S.deployHeld) { setControl("askbtn", {label: "AI · ⏸"}); b.style.color = "var(--gold)"; return; }
  if (left > 0) { setControl("askbtn", {label: "AI · " + left}); b.style.color = "var(--gold)"; return; }
  setControl("askbtn", {label: "AI · ⟳"});
  if (left < -90) { clearInterval(S.deployTimer); S.deployTimer = null; setControl("askbtn", {label: "AI"}); b.style.color = ""; deployBannerShow(null); } // the install never came: back to normal
}
export function deployBannerShow(text, installing) {
  const bn = document.getElementById("deploybanner");
  if (!bn) return;
  bn.style.display = text ? "" : "none";
  if (!text) return;
  document.getElementById("deploytext").textContent = text;
  document.getElementById("deploynotnow").style.display = installing || S.deployHeld ? "none" : "";
  document.getElementById("deploynow").style.display = installing ? "none" : "";
}
export function deployActive() { return !!S.deployTimer || S.deployHeld; }
// which chat tabs this setup can use (Josh, 2026-09-29: "not everyone can
// support the new tabs"). Detected, never a setting: ⌨ Terminal only while
// the bridge says a terminal session is reading its queue (the store app's
// users have no bridge, so it never shows for them — EDITION can't tell,
// Josh's own iPad runs the store build); ✦ Ask (the song-free chat) for any configured
// backend; ♪ song as ever. A tab that disappears falls back to ♪ — each
// chat keeps its own unsent draft, so nothing is lost.
export function askTabsVisible(c) { return {song: true, general: !!c.backend, terminal: !!(c.backend && c.bridge && c.terminal)}; }
// key → {turns, tokens, cost, lastCompact} | null (never fetched)
export function askSessionLine(u) {
  const k = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);
  let s = u.turns + " turn" + (u.turns === 1 ? "" : "s") + " · ~" + k(u.tokens) + " tokens" + (u.cost ? " · $" + u.cost.toFixed(2) : "");
  if (u.turns > 40) s += " — long, Compact saves tokens";
  return s;
}
export function askCompactModelName() { const m = /^claude-code-(opus|sonnet|haiku|fable)$/.exec(askModelName()); return m ? m[1] : undefined; }
// the bridge's compact runs the Claude CLI directly — it wants "opus", not "claude-code-opus"; plain "claude-code" omits it, so the bridge's own default model applies
export function askSessionRender() {
  const line = document.getElementById("asksessionline"), btn = document.getElementById("askcompact");
  const show = S.askCaps.bridge && S.askCaps.sessions && !S.askTerminal && S.song;
  if (line) line.style.display = show ? "" : "none";
  if (btn) btn.style.display = show ? "" : "none";
  if (!show) return;
  const u = S.askSessionCache[askSessionName()];
  if (line) line.textContent = u ? askSessionLine(u) : "";
  if (btn) btn.disabled = !u || !u.turns;
}
export async function askSessionRefresh() {
  if (!S.askCaps.bridge || !S.askCaps.sessions || S.askTerminal || !S.song) { askSessionRender(); return; }
  const key = askSessionName();
  try {
    const r = await fetch(aiUrl() + "/v1/sessions/" + encodeURIComponent(key), {headers: aiHeaders(), cache: "no-store"});
    if (!r.ok) return;
    S.askSessionCache[key] = await r.json();
  } catch (err) { return; } // unreachable right now: keep showing the last numbers we had
  askSessionRender();
}
export function askStatusIdle() { return !S.askStatusNow || !S.askStatusNow.text || /^idle\b/i.test(S.askStatusNow.text); }
export function askStatusLine() { // "working: …" or "idle", from the bridge's current line
  if (askStatusIdle()) return "idle" + (S.askStatusNow && S.askStatusNow.text && /^idle\W+(.+)/i.test(S.askStatusNow.text) ? " — " + S.askStatusNow.text.replace(/^idle\W+/i, "") : "");
  return "working: " + S.askStatusNow.text;
}
export function askStatusRender() {
  const strip = document.getElementById("asknowstrip");
  if (strip) { // every tab, whenever the bridge is there (was the song-free chat only)
    const show = S.askCaps.bridge;
    strip.style.display = show ? "" : "none";
    if (show) strip.textContent = (S.askTerminal && S.askCaps.terminal && !S.askCaps.terminalLive ? "queued — the terminal is busy; your message waits. " : "") +
      "Claude Code " + askStatusLine() + (S.askStatusNow && S.askStatusNow.t ? " · " + askAgeText(S.askStatusNow.t) : "");
    if (!show) askStatusRecentShow(false);
  }
  // Chrome density pass (2026-10-01): the header's own status chip is gone
  // — ✦ AI gets a small pulsing dot instead, same "bridge connected and not
  // idle" condition that used to show the chip; no bridge means no dot,
  // same as the chip used to disappear entirely without one.
  const abtn = document.getElementById("askbtn");
  if (abtn) {
    const working = S.askCaps.bridge && !askStatusIdle();
    abtn.classList.toggle("working", working);
    setControl("askbtn", {aria: working ? "Talk to the AI tutor — Claude Code is working: " + S.askStatusNow.text : "Talk to the AI tutor"});
  }
  const jobsnow = document.getElementById("jobsnow");
  if (jobsnow) {
    const showJ = !!(S.askStatusNow && S.askStatusNow.text);
    jobsnow.style.display = showJ ? "" : "none";
    if (showJ) jobsnow.textContent = "Now: " + S.askStatusNow.text;
  }
}
export function askStatusRecentShow(on) {
  S.askStatusRecentOpen = !!on;
  const strip = document.getElementById("asknowstrip"); if (strip) strip.classList.toggle("open", !!on); // tapped: the whole line, not the ellipsis
  const el = document.getElementById("asknowrecent");
  if (!el) return;
  el.style.display = on ? "" : "none";
  if (!on) return;
  el.innerHTML = "";
  if (S.askQuota && (S.askQuota.fiveHour || S.askQuota.sevenDay)) { // plan-quota %: this account's own usage, not this song's — shown once, in Recent
    const d = document.createElement("div");
    d.className = "asknowitem";
    const parts = [];
    if (S.askQuota.fiveHour) parts.push(S.askQuota.fiveHour.pct + "% this session");
    if (S.askQuota.sevenDay) parts.push(S.askQuota.sevenDay.pct + "% this week");
    d.textContent = "plan usage: " + parts.join(" · ");
    el.appendChild(d);
  }
  for (const n of S.askStatusRecent.slice().reverse()) {
    const d = document.createElement("div");
    d.className = "asknowitem";
    d.textContent = askAgeText(n.t) + " — " + n.text;
    el.appendChild(d);
  }
  for (const subj of S.askStatusCommits || []) {
    const d = document.createElement("div");
    d.className = "asknowitem";
    d.textContent = "commit: " + subj;
    el.appendChild(d);
  }
}
export function askStatusToggle() { askStatusRecentShow(!S.askStatusRecentOpen); if (S.askStatusRecentOpen) askStatusFetchCommits(); }
export async function askStatusFetchCommits() { // origin/main's last 3 subjects, public+unauthenticated, at most once per 5 min; silent on any failure
  if (S.askStatusCommits && Date.now() - S.askStatusCommitsAt < 5 * 60000) return;
  S.askStatusCommitsAt = Date.now();
  try {
    const r = await fetch("https://api.github.com/repos/Night-Roll-App/night-roll/commits?per_page=3");
    if (!r.ok) return;
    const j = await r.json();
    S.askStatusCommits = (Array.isArray(j) ? j : []).map(c => c && c.commit && c.commit.message ? c.commit.message.split("\n")[0] : "").filter(Boolean);
    if (S.askStatusRecentOpen) askStatusRecentShow(true);
  } catch (err) { /* silent — the strip still has the bridge's own Recent */ }
}
export function askComposing(on) {
  if (on && S.askComposingOn && Date.now() - S.askComposingAt < 20000) return;
  if (!on && !S.askComposingOn) return;
  S.askComposingOn = on; S.askComposingAt = Date.now();
  if (!askInboxAllowed() || S.askInboxNo === aiUrl()) return;
  const mic = typeof S.micBtn !== "undefined" && S.micBtn === document.getElementById("askmic");
  fetch(aiUrl() + "/v1/app-state", {method: "POST", headers: aiHeaders(), body: JSON.stringify({composing: on, mic})}).catch(() => {});
}
// {url, ok}
export async function askJobsSupported() {
  const url = aiUrl();
  if (cfg().aiBackend === "browser") return false;
  if (S.askJobsCache && S.askJobsCache.url === url) return S.askJobsCache.ok;
  let ok = false;
  try { const r = await fetch(url + "/v1/jobs", {headers: aiHeaders()}); ok = r.ok && !!(await r.json()).ok; }
  catch (err) { return null; } // unreachable right now is not "no jobs": a reload with Tailscale down must not fail every pending question
  S.askJobsCache = {url, ok};
  return ok;
}
export function askJobId() { return "nr_" + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 20) : Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); }
export function askPendingIndex(msgs, jobId) { return msgs.findIndex(m => m.pending === jobId); }
export function askBadgeOff() { document.getElementById("askreplybtn").style.display = "none"; }
// which model the terminal session gives its advisors (read-only reviews)
// and builders (implementation agents) — Josh, 2026-09-30: "change the
// advisor's model and any sub task models". Kept on the bridge, read by the
// terminal session before each launch. Its OWN model is Claude Code's /model.
export const TERM_MODELS = [["opus", "Opus"], ["sonnet", "Sonnet"], ["haiku", "Haiku"], ["fable", "Fable"]];
export async function askTermModelsLoad() {
  const row = document.getElementById("asktermmodels");
  if (!row) return;
  row.style.display = S.askTerminal && S.askCaps.terminal ? "" : "none";
  if (!S.askTerminal || !S.askCaps.terminal) return;
  let j = null; try { const r = await fetch(aiUrl() + "/v1/terminal-prefs", {headers: aiHeaders(), cache: "no-store"}); if (r.ok) j = await r.json(); } catch (err) { /* keep what's shown */ }
  for (const [id, k] of [["asktermadvisor", "advisor"], ["asktermbuilder", "builder"]]) {
    const sel = document.getElementById(id);
    if (!sel.children.length) for (const [v, label] of TERM_MODELS) { const o = document.createElement("option"); o.value = v; o.textContent = label; sel.appendChild(o); }
    if (j && j[k]) sel.value = j[k];
  }
}
export function askPendingAll() { // every pending question on this device, oldest first — across songs and the general chat
  const out = [];
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("ff1roll-ask-") || k === askInboxSeenKey()) continue;
      askStore(k).msgs.forEach((m, i) => { if (m.pending) out.push({key: k, jobId: m.pending, i, t: m.t || 0}); });
    }
  } catch (err) { /* enumeration failed: nothing to resume */ }
  return out.sort((a, b) => a.t - b.t);
}

export function askSave(msgs, meta, key) {
  key = key || askStoreKey();
  const prev = askStore(key);
  let saved = meta && meta.saved !== undefined ? Math.min(meta.saved, msgs.length) : Math.min(prev.saved, msgs.length);
  let trimmed = prev.trimmed;
  let keep = msgs.map(m => Object.assign({}, m, {content: askStripContext(m.content)}));
  const pack = () => JSON.stringify({lastUsed: Date.now(), msgs: keep, saved, trimmed});
  const dropSaved = () => { if (saved < 2) return false; keep = keep.slice(2); saved -= 2; trimmed = true; return true; };
  let str = pack();
  while (str.length > ASK_LOCAL_SOFT && dropSaved()) str = pack();
  askEvictOthers(str.length);
  const tryPut = () => { try { localStorage.setItem(key, pack()); return true; } catch (err) { return false; } };
  let ok = tryPut();
  while (!ok && dropSaved()) ok = tryPut(); // quota: shed what the repo already has
  while (!ok && keep.length > 2) { // nothing saved left to shed — the oldest unsaved go, and it says so
    keep = keep.slice(2); saved = 0;
    ok = tryPut();
    if (ok && typeof askstatus !== "undefined" && askstatus) askstatus.textContent = "chat storage is full — the oldest messages were dropped; Save the song to keep the rest";
  }
  if (typeof updateSongBtn === "function") updateSongBtn(); // the ● follows unsaved chat too
}
export async function askCommitLog(h, keyArg, comp) { // Publish's chat leg: append the unsaved messages to <song>.ask.md (or the general log); keyArg: another song's key for Publish all
  const key = askLogKey(keyArg || (S.askGeneral ? "ff1roll-ask-" + (S.songKey || "local") : null)); // a song's Publish ships the SONG's chat even while the general tab is showing
  const general = key === ASK_GENERAL_KEY;
  const sk = askLogSong(key);
  const path = askLogPath(key);
  const st = askStore(key);
  // never past a question still waiting for its reply: askFinish splices the
  // reply right after it, and a watermark already beyond that spot would
  // count the reply as published — then shed it from the device unpublished
  const stop = st.msgs.findIndex((m, k) => k >= st.saved && m.pending);
  const fresh = st.msgs.slice(st.saved, stop < 0 ? st.msgs.length : stop);
  if (!path || !fresh.length) return;
  const add = askLogMarkdown(fresh);
  if (folderActive()) {
    const f = await folderRead(path);
    await folderWrite(path, (f ? await f.text() : askLogHeader(key)) + add);
  } else {
    const repo = general || (comp !== undefined ? comp : (sk && typeof isCompositionKey === "function" ? isCompositionKey(sk) : isComposition())) ? "songs" : "analysis";
    const putOnce = async () => {
      let sha = null, old = askLogHeader(key);
      const g = await fetch(repoApi(repo) + path + "?ref=main", {headers: h, cache: "no-store"});
      if (g.ok) {
        const j = await g.json();
        sha = j.sha;
        if (j.content) old = decodeURIComponent(escape(atob(j.content.replace(/\n/g, ""))));
        else if (j.size) old = await (await fetch(j.download_url, {headers: h, cache: "no-store"})).text(); // >1 MB: contents API omits the body
      }
      const body = {message: "Ask log " + path + " from Night Roll", branch: "main",
                    content: btoa(unescape(encodeURIComponent(old + add)))};
      if (sha) body.sha = sha;
      return fetch(repoApi(repo) + path, {method: "PUT", headers: h, body: JSON.stringify(body)});
    };
    let r = await putOnce();
    if (r.status === 409) r = await putOnce();
    if (!r.ok) throw new Error(".ask.md HTTP " + r.status);
  }
  const now = askStore(key); // messages may have arrived meanwhile; only the snapshot is in the file
  askSave(now.msgs, {saved: now.saved + fresh.length}, key);
}
