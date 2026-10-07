import { askModeButtons } from "./sheet.js";
import { askStoreKey } from "./sheet.js";
import { appErrors } from "../model/jobs.js";
import { appDebug } from "../model/jobs.js";
import { S } from "../state.js";
import { cfg } from "../platform/storage.js";
import { songTitleOfImpl as songTitleOf } from "./context.js";
import { baseName } from "../model/rollnotes.js";
import { appMode } from "../platform/mode.js";
import { ASK_TOOLS } from "./tools.js";
import { askActTool } from "./actions.js";
import { aiUrl } from "./backend.js";
import { setControl } from "../ui/controls.js";
import { askstatus } from "./sheet.js";
import { folderActive } from "../platform/folder.js";
import { folderRead } from "../platform/folder.js";
import { folderWrite } from "../platform/folder.js";
import { isCompositionKey } from "../model/provenance.js";
import { isComposition } from "../model/provenance.js";
import { repoApi } from "../platform/storage.js";
import { editableSong } from "../model/song.js";
import { saveDraft } from "../model/versions.js";
import { readVersions } from "../model/versions.js";
import { musicSig } from "../model/versions.js";
import { draftDoc } from "../model/versions.js";
import { pushVersion } from "../model/versions.js";
import { flushBackupNow } from "../ui/chrome.js";
import { logDebugImpl as logDebug } from "../ui/chrome.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { appConfirmImpl as appConfirm } from "../ui/chrome.js";
import { askShotShow } from "./shots.js";
import { asksheet } from "./sheet.js";
import { askBubble } from "./sheet.js";
import { askClock } from "./sheet.js";
import { askNoteLabel } from "./sheet.js";
import { askSetMode } from "./sheet.js";
import { askRenderImpl as askRender } from "./sheet.js";
import { askResume } from "./client.js";
import { askResumeSoon } from "./client.js";
import { askSentReset } from "./context.js";
import { askHost } from "./host.js";
// The store, the seen cursor, the pending markers and the bridge's own
// routes live in the AI library (vendor/ai/web/{store,bridge-client}.js,
// step 4) — under the same storage keys (askHost().keys) and the same wire.
// What stays here is Night Roll's: which lines count as "new" (askMaxErrId/
// askMaxStatusId), the repo log (askLog*/askCommitLog), and every render.
import { AI_LOCAL_SOFT, AI_TOTAL_CAP, aiStoreGet, aiStoreSave, aiUnsavedCount, aiRevertToSaved, aiEvictOthers, aiPendingAll, aiPendingIndex, aiJobId, aiSeenKey, aiSeenGet, aiSeenMax, aiSeenSet, aiSeenAdvance, aiSeenStage, aiSeenCommit, aiSeenDrop, aiLogMarkdown } from "../../vendor/ai/web/store.js";
import { aiJobsSupported, aiInboxFetch, aiStatusFetch, aiSessionGet, aiSessionCompact, aiTerminalPrefsGet, aiTerminalPrefsSet, aiAppState, aiDeploy } from "../../vendor/ai/web/bridge-client.js";
import { aiHostAllowed } from "../../vendor/ai/web/backends.js";

// ---- history: per song, context stripped at SAVE time, capped so it can
// never crowd out saveDraft (drafts are the only copy of unsynced music)
export const ASK_LOCAL_SOFT = AI_LOCAL_SOFT, ASK_TOTAL_CAP = AI_TOTAL_CAP;
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
// Its log lives beside the general one. Before 2026-10-04 askLogPath fell
// through the per-song branch and wrote terminal.ask.md at the repo ROOT, and
// pendingSongs took "terminal" for a song key, so Publish all ran publishSong
// on it (commits a25031e2, 88477702: a terminal.rollnotes.json with 0 notes).
export const ASK_TERMINAL_LOG = "ask/terminal.ask.md";
export const ASK_TERMINAL_LEGACY_LOG = "terminal.ask.md"; // folder mode seeds the new file from it; never deleted
export function askLogShared(storeKey) { return storeKey === ASK_GENERAL_KEY || storeKey === ASK_TERMINAL_KEY; } // the two chats that are no song's
// ---- seen-cursor for the "New since your last message:" bridge context
// (2026-09-30). Per chat (song key / general / terminal — askStoreKey()
// already tells them apart, so its value doubles as the cursor's own key),
// "seen up to id" for both logs. Device-local localStorage is right: it's UI
// state (what THIS device has already told the bridge), not song state.
export function askSeenKey(key) { return aiSeenKey(askHost(), key); }
export function askSeenGet(key) { return aiSeenGet(askHost(), key); }
export function askMaxErrId() { let m = 0; for (const l of appErrors) if (l.id > m) m = l.id; for (const l of appDebug) if (l.id > m) m = l.id; return m; }
export function askMaxStatusId() { return S.statusHistory.length ? S.statusHistory[S.statusHistory.length - 1].id : 0; }
// Mark-as-read watermark (2026-09-30): the HIGH-WATER MARK across every
// chat's own cursor — once a line has gone out in ANY chat's context block,
// it's "already sent" for the app's own ⚠ badge/sheet and Status window too
// (errChip, the #errsheet render, and #infosheet would use this), never only
// the chat Josh happens to have open.
export function askSeenMaxKey() { return askHost().keys.seenMax; }
export function askSeenMax() { return aiSeenMax(askHost()); }
export function askSeenSet(key, seen) { aiSeenSet(askHost(), key, seen); }
// Sets the watermark immediately — what a successfully-landed send commits
// (below), and what some tests call directly to simulate that same effect.
export function askSeenAdvance(key) { aiSeenAdvance(askHost(), key); }
export function askSeenStage(key, seen) { aiSeenStage(askHost(), key, seen); }
export function askSeenCommit(key) { aiSeenCommit(askHost(), key); }
export function askSeenDrop(key) { aiSeenDrop(askHost(), key); }
// never landed: try the same "new since" lines again next time
// The chat is his session record (Josh, 2026-09-25): it lives here whole
// until the song's Save appends it to <song>.ask.md, and only messages the
// repo file already holds ever leave this device. `saved` counts those from
// the front; `trimmed` says some were let go, so askRender shows the file.
export function askStore(key) { return aiStoreGet(askHost(), key); }
export function askLoad() { return askStore().msgs; }
export function askUnsavedCount(key) { return aiUnsavedCount(askHost(), key); }
// Revert's chat leg (a Publish-row Revert drops EVERYTHING unpublished,
// chat included, Josh 2026-09-30): truncate back to exactly the messages
// already in <song>.ask.md — `saved` of them, from the front. No published
// chat (saved 0) means this empties the log, same as Clear chat.
export function askRevertToSaved(key) { aiRevertToSaved(askHost(), key); }
// other songs' logs go LRU-first when the total runs long — never one with
// unsaved messages, never a -seen/-sentctx/-epoch cursor (they share the
// prefix; before step 4 they went too)
export function askEvictOthers(mine) { aiEvictOthers(askHost(), mine); }
export function askModelName() { const c = cfg(); return c.aiBackend === "browser" ? c.aiBrowserModel : (c.aiModel || (S.askModelCache && S.askModelCache.ids[0]) || "model"); }
export function askLogKey(keyArg) { // a store key ("ff1roll-ask-…"), a song key, or nothing (the open chat) → the store key
  if (!keyArg) return askStoreKey();
  return keyArg.startsWith("ff1roll-ask-") ? keyArg : "ff1roll-ask-" + keyArg;
}
export function askLogSong(storeKey) { return askLogShared(storeKey) ? null : storeKey.slice("ff1roll-ask-".length); }
export function askLogPath(key) { const sk = askLogKey(key); if (sk === ASK_GENERAL_KEY) return ASK_GENERAL_LOG; if (sk === ASK_TERMINAL_KEY) return ASK_TERMINAL_LOG; const song = askLogSong(sk); return song && song !== "local" ? song.replace(/\.midi?$/i, "") + ".ask.md" : null; }
// beside the .mid (compositions) or the .rollnotes.json (analyzed); the general and terminal chats under ask/
export function askLogHeader(key) {
  const sk = askLogKey(key);
  if (sk === ASK_GENERAL_KEY) return "# ✦ AI log — general\n\nThe chat that is not about one song (the app, the project, music in general, messages for the terminal). Night Roll appends the unsaved messages each time it is published from the PUBLISH sheet; Clear chat starts a new session on the device without touching this file.\n";
  if (sk === ASK_TERMINAL_KEY) return "# ✦ AI log — Terminal\n\nThe ⌨ Terminal chat — messages to and from the Mac's Claude Code (no song, no model call in the app). Night Roll appends the unsaved messages each time it is published from the PUBLISH sheet; Clear chat starts a new session on the device without touching this file.\n";
  return "# ✦ AI log — " + songTitleOf(askLogSong(sk)) + "\n\nOne file per song. Night Roll appends the chat since the last Save each time the song is saved; Clear chat starts a new session on the device without touching this file.\n";
}
export function askLogMarkdown(msgs) { return aiLogMarkdown(msgs, {user: "Josh", note: "Mac", ai: "AI"}); } // what Save appends: one heading per question (when, which bars), the reply under it
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
export function askToolsNow() { // the one `act` tool, its index built from the action registry — two variants only (song / general: an action's `song` flag decides, no list here since batch 3), byte-identical message to message; ASK_TOOLS (pure data, empty since 2026-10-05) would ride in front of it
  const act = askActTool(!!S.askGeneral);
  return act ? [...ASK_TOOLS, act] : [...ASK_TOOLS];
}
export function askInboxSeenKey() { return askHost().keys.inboxSeen; }
export function askInboxAllowed() { // a host already allowed for Ask (local, or consented once) — a poll never asks
  const url = aiUrl();
  if (!url || cfg().aiBackend === "browser" || S.askInboxNo === url) return false;
  return aiHostAllowed(askHost(), url);
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
    const r = await aiSessionGet(askHost(), key);
    if (!r.ok) return;
    S.askSessionCache[key] = r.body;
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
  aiAppState(askHost(), {composing: on, mic});
}
// true / false / null = unreachable right now (not "no jobs": a reload with Tailscale down must not fail every pending question); cached per URL on S.askJobsCache
export function askJobsSupported() { return aiJobsSupported(askHost()); }
export function askJobId() { return aiJobId(askHost()); }
export function askPendingIndex(msgs, jobId) { return aiPendingIndex(msgs, jobId); }
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
  const j = await aiTerminalPrefsGet(askHost()); // null when unreachable: keep what's shown
  for (const [id, k] of [["asktermadvisor", "advisor"], ["asktermbuilder", "builder"]]) {
    const sel = document.getElementById(id);
    if (!sel.children.length) for (const [v, label] of TERM_MODELS) { const o = document.createElement("option"); o.value = v; o.textContent = label; sel.appendChild(o); }
    if (j && j[k]) sel.value = j[k];
  }
}
export function askPendingAll() { return aiPendingAll(askHost()); } // every pending question on this device, oldest first — across songs and the general chat

// context stripped at save time; over the soft cap the repo-held pairs shed
// first, then the oldest unsaved (and askHost().status says so); the ● follows via askHost().onStoreChanged
export function askSave(msgs, meta, key) { aiStoreSave(askHost(), msgs, meta, key); }
export async function askCommitLog(h, keyArg, comp) { // Publish's chat leg: append the unsaved messages to <song>.ask.md (or the general log); keyArg: another song's key for Publish all
  const key = askLogKey(keyArg || (S.askGeneral ? "ff1roll-ask-" + (S.songKey || "local") : null)); // a song's Publish ships the SONG's chat even while the general tab is showing
  const general = askLogShared(key); // general and terminal: the songs repo, no composition test
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
    let f = await folderRead(path);
    // a folder has no vcs mv: the terminal log's old root file, when the new
    // one does not exist yet, is copied forward and left where it was
    if (!f && key === ASK_TERMINAL_KEY) f = await folderRead(ASK_TERMINAL_LEGACY_LOG);
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

// ---- Deploy safeguard #2: a Version before every install. On deployWarn's
// FIRST tick of a cycle, if the open song is editable and its music/
// annotations differ from its newest Version, save one labelled "Before
// update HH:MM" (the same Versions store File → Versions… reads) and flush
// a backup right away too (#1) — belt and suspenders right before a relaunch.
export function deployBeforeInstall() {
  if (!S.song || !S.songKey || !editableSong()) return;
  try {
    saveDraft(false); // the working copy is what a Version snapshots — make sure it's current first
    const list = readVersions(S.songKey); // newest LAST
    const newest = list.length ? list[list.length - 1] : null;
    // musicSig (not a raw-blob compare): a local/ draft's own seq stamp bumps
    // on every saveDraft() (NIGHT-ROLL.md "Local song persistence") even when
    // the music itself hasn't changed — comparing the full stored JSON would
    // "detect" a change on every single tick. musicSig reads only ppq/tracks/
    // tempos/timesigs, same fields Save Version's own dirty check uses.
    const curSig = musicSig(draftDoc(false));
    let curNotes = null; try { const n = localStorage.getItem("ff1roll-notes-" + S.songKey); curNotes = n ? JSON.parse(n) : null; } catch (err) { curNotes = null; }
    const draftChanged = !newest || musicSig(newest.draft) !== curSig;
    const notesChanged = !newest || JSON.stringify(newest.notes || null) !== JSON.stringify(curNotes);
    if (draftChanged || notesChanged) {
      const now = new Date(), hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      pushVersion(S.songKey, "Before update " + hhmm);
      flushBackupNow();
    }
  } catch (err) { logDebug("deploy version: " + (err && err.message || err)); }
}
export async function deployInstallNow() {
  const wasHeld = S.deployHeld;
  try { await aiDeploy(askHost(), {hold: false, inSec: wasHeld ? 3 : 0}); }
  catch (err) { logDebug("deploy install-now: " + (err && err.message || err)); }
  deploySetHeld(false);
  if (wasHeld) deployWarn(3000); else { S.deployAt = Date.now(); deployButtonTick(); }
}
export async function deployHoldNow() {
  try { await aiDeploy(askHost(), {hold: true}); }
  catch (err) { logDebug("deploy hold: " + (err && err.message || err)); }
  deploySetHeld(true);
}
export function deployWarn(ms) {
  const first = !S.deployTimer;
  S.deployAt = Date.now() + ms;
  if (first) {
    setInfo("a new version installs in " + Math.ceil(ms / 1000) + " s — the app will restart");
    S.deployTimer = setInterval(deployButtonTick, 1000);
    deployBeforeInstall(); // safeguard #2 (+ a backup flush)
  }
  deployButtonTick();
}
export function deploySetHeld(on) {
  on = !!on;
  if (on === S.deployHeld) return;
  S.deployHeld = on;
  if (S.deployHeld) {
    if (!S.deployTimer) S.deployTimer = setInterval(deployButtonTick, 1000); // held with no local countdown running yet (e.g. a fresh poll after a reload)
    setInfo("update waiting — tap ✦ AI to install when you're ready");
  }
  deployButtonTick();
}
// a countdown or a hold is in effect: ✦ AI opens the install sheet, not the chat
export async function deployAskTap() { // the "Not now" / "Install now" sheet (appConfirm — no native dialogs)
  const yes = await appConfirm("Update ready", "A new version is ready. The app will restart.", "Install now", "Not now");
  if (yes) {
    await deployInstallNow();
  } else {
    await deployHoldNow();
  }
}

export async function askInboxPoll() {
  if (!askInboxAllowed() || !S.song) return;
  const url = aiUrl();
  let r;
  try { r = await aiInboxFetch(askHost(), localStorage.getItem(askInboxSeenKey()) || 0); } catch (err) { return; }
  if (r.status === 404) { S.askInboxNo = url; askShotShow(false); return; }
  if (!r.ok) return;
  askShotShow(true); // an inbox means the Mac's bridge: it takes 📷 screenshots too
  const j = r.body; if (!j) return;
  let notes = (j && j.notes || []).filter(n => n && n.text);
  // a device that has never polled (a fresh install: the Xcode shell,
  // 2026-09-27, got the whole night's 40 notes poured into Threnody II's
  // chat) takes only the last few hours, then keeps up like any other
  if (localStorage.getItem(askInboxSeenKey()) === null) { const cutoff = Date.now() - 6 * 3600e3; notes = notes.filter(n => (n.t || 0) >= cutoff); }
  if (!notes.length) { if (j && j.last) localStorage.setItem(askInboxSeenKey(), String(j.last)); return; }
  askNotesArrived(notes);
  localStorage.setItem(askInboxSeenKey(), String(j.last || notes[notes.length - 1].id));
}
export function askNotesArrived(notes) { // the terminal's notes go to the Terminal tab (its answers); others to the open chat — saved like any message; shown now if that chat is on screen, else the ✉ light
  const toTerm = n => !n.from || n.from === "terminal";
  for (const key of [ASK_TERMINAL_KEY, null]) {
    const mine = notes.filter(n => key ? toTerm(n) : !toTerm(n));
    if (!mine.length) continue;
    const k = key || askStoreKey(), msgs = askStore(k).msgs;
    for (const n of mine) msgs.push({role: "note", content: String(n.text), t: n.t || Date.now(), m: n.from || "terminal", mode: appMode()});
    askSave(msgs, undefined, k);
  }
  const shown = asksheet.classList.contains("on") ? notes.filter(n => (toTerm(n) ? ASK_TERMINAL_KEY : askStoreKey()) === askStoreKey()) : [];
  if (shown.length) { for (const n of shown) askBubble("note", askClock(n.t) + askNoteLabel(n.from) + String(n.text)); askNoteSeen(); }
  if (shown.length === notes.length) return;
  else { document.getElementById("askbtn").classList.add("hasnote"); setInfo("✉ a note from your Mac — tap ✦ AI to read it"); }
}
export async function askStatusPoll() {
  if (!askInboxAllowed() || !S.song) return; // same gate as the inbox: a host allowed for Ask, and a song open (Ask itself needs one)
  const url = aiUrl();
  if (S.askStatusNo === url) return;
  let r;
  try { r = await aiStatusFetch(askHost()); } catch (err) { S.askCaps = {...S.askCaps, terminalLive: false}; askStatusRender(); return; } // unreachable this moment: say so in the tab — never pull a tab out from under him (Josh, 2026-09-30: the Terminal tab vanished mid-conversation)
  if (r.status === 404) { S.askStatusNo = url; S.askStatusNow = null; S.askCaps = {bridge: false, terminal: false, sessions: false}; askStatusRender(); askTabsApply(); askSessionRender(); return; }
  if (!r.ok) return;
  const j = r.body; if (!j) return;
  S.askStatusNow = (j && j.now) || null;
  S.askStatusRecent = (j && j.recent) || [];
  S.askQuota = (j && j.quota) || null;
  if (j && j.deployInMs > 0) deployWarn(j.deployInMs);
  deploySetHeld(!!(j && j.deployHold));
  S.askCaps = {bridge: true, terminal: !!(j && j.terminal), terminalLive: !!(j && (j.terminalLive !== undefined ? j.terminalLive : j.terminal)), sessions: !!(j && j.sessions)};
  askStatusRender();
  askTabsApply();
  askSessionRefresh();
}
export function askTabsApply() {
  const v = askTabsVisible({backend: cfg().aiBackend === "browser" || !!aiUrl(), bridge: S.askCaps.bridge, terminal: S.askCaps.terminal});
  const g = document.getElementById("askmodegen"), t = document.getElementById("askmodeterm");
  if (g) g.style.display = v.general ? "" : "none";
  if (t) t.style.display = v.terminal ? "" : "none";
  askTermModelsLoad();
  // a tab that isn't offered (yet — the bridge's status poll hasn't answered
  // right after a launch) SHOWS the song tab but keeps the saved choice, and
  // comes back once it is offered: the Terminal tab used to be overwritten
  // with "song" on every relaunch (Josh, 2026-10-06, #174)
  let saved = null;
  try { saved = localStorage.getItem("ff1roll-ask-mode"); } catch (err) { /* private mode */ }
  const want = saved === "terminal" && v.terminal ? "terminal" : saved === "general" && v.general ? "general" : "song";
  const now = S.askTerminal ? "terminal" : S.askGeneral ? "general" : "song";
  if (want !== now) {
    S.askTerminal = want === "terminal"; S.askGeneral = want !== "song";
    askModeButtons();
    if (asksheet.classList.contains("on")) askRender();
  }
}
export function askInboxStart() { clearInterval(S.askInboxTimer); S.askInboxTimer = setInterval(() => { if (!document.hidden) { askInboxPoll(); askStatusPoll(); askResume(); } }, 60000); askInboxPoll(); askStatusPoll(); askResumeSoon(1500); }
export function askNoteSeen() { // the notes are on screen: the ✉ light and its footer line go (Josh, 2026-09-29: it stayed up with the panel open)
  document.getElementById("askbtn").classList.remove("hasnote");
  if (/^✉ a note from your Mac/.test(S.infoFull || "")) setInfo("");
}

export function initBridge1() {
  document.getElementById("deploynotnow").addEventListener("click", deployHoldNow);
  document.getElementById("deploynow").addEventListener("click", deployInstallNow);
     document.getElementById("askcompact").addEventListener("click", async () => {
    const key = askSessionName();
    const u = S.askSessionCache[key];
    if (!u || !u.turns) return;
    const yes = await appConfirm("Compact chat", "Summarize this chat's memory on the bridge and shrink it — " + askSessionLine(u) + " now. This can't be undone.", "Compact", "Cancel");
    if (!yes) return;
    const btn = document.getElementById("askcompact");
    btn.disabled = true;
    askstatus.textContent = "compacting…";
    try {
      const r = await aiSessionCompact(askHost(), key, askCompactModelName());
      const j = r.body || {};
      if (!r.ok) throw new Error((j.error && j.error.message) || "HTTP " + r.status);
      askSentReset(askStoreKey()); // the compacted session no longer holds the full text verbatim — resend in full next time
      const k = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);
      askstatus.textContent = "compacted: " + j.turnsBefore + " → " + j.turnsAfter + " turns · ~" + k(j.tokensBefore) + " → ~" + k(j.tokensAfter) + " tokens";
    } catch (err) { askstatus.textContent = "⚠ Compact failed — " + err.message; }
    await askSessionRefresh();
  });
  // live while the bridge is there and the app is on screen: every 10 s (the
  // inbox keeps its own 60 s pace)
  // (askStatusPoll asks only an allowed host, and never again after a 404 —
  // so for LM Studio or no AI at all this costs one request, then nothing)
  if (typeof window !== "undefined") setInterval(() => { if (!document.hidden) askStatusPoll(); }, 10000);
}

export function initBridge2() {
  for (const [id, k] of [["asktermadvisor", "advisor"], ["asktermbuilder", "builder"]]) document.getElementById(id).addEventListener("change", async e => {
    try { await aiTerminalPrefsSet(askHost(), {[k]: e.target.value}); askstatus.textContent = k + "s will use " + e.target.value; }
    catch (err) { askstatus.textContent = "⚠ couldn't reach the bridge: " + err.message; }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { askResumeSoon(300); askInboxPoll(); } });
  askInboxStart();
}
