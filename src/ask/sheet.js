import { S } from "../state.js";
import { askTermModelsLoad } from "./bridge.js";
import { songTitleOfImpl as songTitleOf } from "./context.js";
import { baseName } from "../model/rollnotes.js";
import { askStatusRender } from "./bridge.js";
import { ASK_TERMINAL_KEY } from "./bridge.js";
import { ASK_GENERAL_KEY } from "./bridge.js";
import { askComposing } from "./bridge.js";
import { askShotRestore } from "./shots.js";
import { askSpan } from "./context.js";
import { askSpanLabel } from "./context.js";
import { cfg } from "../platform/storage.js";
import { AI_BROWSER_MODELS } from "./backend.js";
import { micStop } from "../ui/chrome.js";
import { askCopyText } from "../ui/sheets.js";
import { askStore } from "./bridge.js";
import { appMode } from "../platform/mode.js";
import { askMsgMode } from "./context.js";
import { askStripContext } from "./context.js";
import { askResumeSoon } from "./client.js";
import { askLogPath } from "./bridge.js";
import { folderActive } from "../platform/folder.js";
import { folderRead } from "../platform/folder.js";
import { isComposition } from "../model/provenance.js";
import { songsURL } from "../platform/storage.js";
import { analysisURL } from "../platform/storage.js";
import { closeFileMenus } from "../ui/chrome.js";
import { wmInnerHeight } from "../ui/wm.js";
import { closeDropUp } from "../ui/chrome.js";
import { askShotTake } from "./shots.js";
import { askShotClearAll } from "./shots.js";
import { askPickFiles } from "./shots.js";
import { askBtnTap } from "./host.js";
import { askRender } from "../hooks.js";
import { askSessionRefresh } from "./bridge.js";
import { askStatusToggle } from "./bridge.js";
import { openAsk } from "./host.js";
import { openSettingsSheet } from "../ui/sheets.js";
import { askUnsavedCount } from "./bridge.js";
import { appConfirmImpl as appConfirm } from "../ui/chrome.js";
import { askSentReset } from "./context.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { askSessionName } from "./bridge.js";
import { askHost } from "./host.js";
import { aiDraftKey, aiDraftRead, aiDraftWrite, aiDraftClear } from "../../vendor/ai/web/store.js";
import { aiSessionDelete } from "../../vendor/ai/web/bridge-client.js";
import { askSessionRender } from "./bridge.js";
import { askSend } from "./client.js";
import { SPEECH } from "../ui/note-editor.js";
import { micToggle } from "../ui/note-editor.js";

export function askSetMode(mode) { // "terminal" | "song" | "general" (a boolean still means general/song)
  if (mode === true) mode = "general"; else if (mode === false) mode = "song";
  S.askTerminal = mode === "terminal"; S.askGeneral = S.askTerminal || mode === "general";
  try { localStorage.setItem("ff1roll-ask-mode", mode); } catch (err) { /* private mode */ }
  askModeButtons();
}
export function askModeButtons() {
  const a = document.getElementById("askmodesong"), b = document.getElementById("askmodegen"), c = document.getElementById("askmodeterm");
  if (!a || !b) return;
  const gen = S.askGeneral && !S.askTerminal;
  a.classList.toggle("active", !S.askGeneral); b.classList.toggle("active", gen);
  a.setAttribute("aria-selected", String(!S.askGeneral)); b.setAttribute("aria-selected", String(gen));
  if (c) { c.classList.toggle("active", S.askTerminal); c.setAttribute("aria-selected", String(S.askTerminal)); }
  if (typeof askTermModelsLoad === "function") askTermModelsLoad();
  // the tab names the song: the sheet covers the title behind it (Josh, 2026-09-27)
  try { const t = S.songKey ? songTitleOf(S.songKey) : (typeof baseName === "function" ? baseName() : ""); a.textContent = "♪ " + (t && t.length > 22 ? t.slice(0, 21) + "…" : t || "this song"); } catch (err) { a.textContent = "♪ this song"; }
  const spanrow = document.getElementById("askspanrow"); if (spanrow) spanrow.style.display = S.askGeneral ? "none" : "";
  if (typeof askinput !== "undefined" && askinput && S.askTerminal) askinput.placeholder = "Tell the terminal what to build or fix…";
  else if (typeof askinput !== "undefined" && askinput) askinput.placeholder = S.askGeneral ? "Anything — the app, the project, music in general" + (S.askCaps.bridge ? ", a message for the terminal…" : "…") : "Ask about what you're looking at…";
  if (typeof askStatusRender === "function") askStatusRender(); // the "Now:" strip shows only in general mode
}
export function askStoreKey() { return S.askTerminal ? ASK_TERMINAL_KEY : S.askGeneral ? ASK_GENERAL_KEY : "ff1roll-ask-" + (S.songKey || "local"); }
// ---- the sheet
export const asksheet = document.getElementById("asksheet");
export const asklog = document.getElementById("asklog");
export const askinput = document.getElementById("askinput");
export const askstatus = document.getElementById("askstatus");
// when each note from the Mac (and each Terminal message) was sent — Josh,
// 2026-09-30: "I want timestamps on the messages that you sent back to me"
export function askClock(t) {
  if (!t) return "";
  const d = new Date(t), now = new Date(), hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  return (d.toDateString() === now.toDateString() ? hm : d.toLocaleDateString(undefined, {month: "short", day: "numeric"}) + " " + hm) + " · ";
}
export function askNoteLabel(from) { return "✉ " + (from && from !== "terminal" ? from : "from the Mac") + ": "; }
// the unsent message survives a relaunch (Josh, 2026-09-29: five dictated
// paragraphs lost today to the app reinstalling under him). Per chat, device-
// local (a composer draft is not the song's state); cleared on Send.
// The record itself (its key, its {text, shots} shape — and the older {shot}
// shape it still reads) is the library's (vendor/ai/web/store.js, step 4).
export function askDraftStore(key) { return aiDraftKey(askHost(), key); }
export function askDraftSave() {
  clearTimeout(S.askDraftTimer); S.askDraftTimer = null;
  if (!S.askDraftKey) return;
  aiDraftWrite(askHost(), S.askDraftKey, {text: askinput.value, shots: S.askShotPending.map(s => s.path)});
}
export function askDraftSaveSoon() { clearTimeout(S.askDraftTimer); S.askDraftTimer = setTimeout(askDraftSave, 300); askComposing(!!askinput.value.trim()); }
export function askDraftLoad() { // the panel now shows a different chat: its own unsent message comes back
  const key = askStoreKey();
  if (key === S.askDraftKey) return;
  if (S.askDraftKey) askDraftSave(); // the chat we're leaving keeps what was in the box
  S.askDraftKey = key;
  const d = aiDraftRead(askHost(), key);
  askinput.value = d.text;
  askShotRestore(d.shots);
  askGrow();
}
export function askDraftClear() { clearTimeout(S.askDraftTimer); S.askDraftTimer = null; aiDraftClear(askHost(), askStoreKey()); }
export function askRefresh() { // span label + model line; called on open and after Settings
  if (!S.song) return;
  const sp = askSpan();
  document.getElementById("askspan").textContent = askSpanLabel(sp);
  const c = cfg();
  let host = c.aiUrl; try { host = new URL(c.aiUrl).host; } catch (err) { /* shown raw */ }
  document.getElementById("askmodel").textContent = c.aiBackend === "browser"
    ? (AI_BROWSER_MODELS.find(m => m[0] === c.aiBrowserModel) || [0, c.aiBrowserModel])[1].split(" · ")[0] + " · this browser"
    : (c.aiModel || (S.askModelCache && S.askModelCache.ids[0]) || "model") + " · " + host;
}
export const askPartial = {};
// job id -> the words streamed so far: a closed-and-reopened sheet redraws from storage, which only holds the marker (Josh, 2026-09-27: "I don't see the first part of the response")
export function askShowThinking(live, raw) { // Qwen-style <think> blocks stay out of the bubble
  const vis = raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/^\s+/, "");
  if (live && live.dataset && live.dataset.job && vis) askPartial[live.dataset.job] = vis;
  live.textContent = vis || "…";
  if (vis) askstatus.textContent = "";
  asklog.scrollTop = asklog.scrollHeight;
}
export function askScrollEnd() { if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => { asklog.scrollTop = asklog.scrollHeight; }); else asklog.scrollTop = asklog.scrollHeight; }
export function askFocusIfKeyboard() { // a touch screen's keyboard took half the sheet on every open, and Josh dictates (2026-09-27); focus only where a real keyboard is likely
  if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) return;
  askinput.focus();
}
export function askGrow() { // size the box to its text (CSS caps it) and keep the end in view
  askinput.style.height = "auto";
  askinput.style.height = askinput.scrollHeight + "px";
  askinput.scrollTop = askinput.scrollHeight;
  askDraftSaveSoon(); // typing and dictation both land here
}

export function askMicOff() { // Send clears the box: a late result must not refill it
  if (S.micBtn === document.getElementById("askmic")) micStop(true);
  // ■ Stop leaves the stopped session's onresult attached (Safari's final
  // words arrive after stop) — a Send right after it must silence that too,
  // or the late transcript lands in the emptied box (Josh, 2026-09-30)
  if (S.micPrev) { S.micPrev.onresult = null; try { S.micPrev.abort(); } catch (err) { /* already gone */ } S.micPrev = null; }
}
export function askBubble(role, text) {
  const div = document.createElement("div");
  div.className = "askmsg " + role;
  askFillBubble(div, text);
  asklog.appendChild(div);
  asklog.scrollTop = asklog.scrollHeight;
  return div;
}
export function askFillBubble(div, text) { // the words, web addresses tappable, a ⧉ copy at the end
  div.textContent = text;
  // links only where the DOM can rebuild children (the test harness's fake
  // elements keep textContent as a plain string, so they get the text alone)
  const re = /https?:\/\/[^\s<>"'`]+/g;
  if (re.test(text) && typeof div.replaceChildren === "function") {
    const nodes = []; let last = 0, m; re.lastIndex = 0;
    while ((m = re.exec(text))) {
      let url = m[0]; const trail = url.match(/[.,;:!?)\]]+$/); if (trail) url = url.slice(0, -trail[0].length);
      nodes.push(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement("a"); a.href = url; a.textContent = url; a.target = "_blank"; a.rel = "noopener"; // the PWA hands _blank to Safari
      nodes.push(a);
      last = m.index + url.length;
    }
    nodes.push(document.createTextNode(text.slice(last)));
    div.replaceChildren(...nodes);
  }
  if (text.trim() && text !== "…") {
    const b = document.createElement("button");
    b.className = "askcopy"; b.type = "button"; b.setAttribute("aria-label", "Copy this message"); b.title = "copy";
    b.addEventListener("click", ev => { ev.stopPropagation(); askCopyText(text, b); });
    div.appendChild(b);
  }
}

export function askRenderImpl() {
  askDraftLoad();
  asklog.innerHTML = "";
  const st = askStore();
  const msgs = st.msgs;
  if (st.trimmed) askRenderEarlier();
  let pendingSeen = false;
  if (!msgs.length && !st.trimmed && S.askTerminal) askBubble("ai", "This goes straight to Claude Code in the Mac's terminal — the session that builds Night Roll. Tell it what to build or fix; its answers come back here, and the Now: line above shows what it's doing.");
  else if (!msgs.length && !st.trimmed && S.askGeneral) askBubble("ai", "This is the general chat — not about any one song. Ask about the app, the project, music in general, or say \"tell the terminal…\" to pass a message to the Claude Code sessions on your Mac.");
  else if (!msgs.length && !st.trimmed) askBubble("ai", appMode() === "normal"
    ? "Ask me about what you're looking at — I can see the song, your cursor, your notes, and the bars in view. I'll answer directly — keys, chords, cadences, form — and say how sure I am."
    : "Ask me about what you're looking at — I can see the song, your cursor, your notes, and the bars in view. I'll point you toward things before I name them; say you give up and I'll just tell you.");
  for (const m of msgs) {
    // a different mode's turn (askMsgMode/appMode, SAFETY 2026-10-01): still
    // shown here (this is the on-device log, not a model request) but dimmed
    // and tagged, so Josh can tell it was never part of the current mode's
    // AI context, not just missing from it.
    const otherMode = !S.askTerminal && askMsgMode(m) !== appMode();
    const tag = otherMode ? "[" + (askMsgMode(m) === "normal" ? "Normal" : "Learning") + " mode] " : "";
    const div = askBubble(m.role === "user" ? "user" : m.role === "note" ? "note" : "ai", tag + (m.role === "note" ? askClock(m.t) + askNoteLabel(m.m) + m.content : (S.askTerminal && m.role === "user" ? askClock(m.t) : "") + askStripContext(m.content)));
    if (otherMode) div.classList.add("othermode");
    if (m.pending) { const part = askPartial[m.pending]; askBubble("ai", part ? part + "\n\n… (still writing)" : "… (still working — the reply lands here)").dataset.job = m.pending; pendingSeen = true; }
  }
  if (pendingSeen) askResumeSoon(200);
}
export async function askRenderEarlier() { // what this device let go of after it reached the repo file
  const div = askBubble("ai", "loading the earlier messages from the repo file…");
  div.classList.add("earlier");
  const path = askLogPath();
  try {
    let text;
    if (folderActive()) { const f = await folderRead(path); text = f ? await f.text() : ""; }
    else {
      const r = await fetch((isComposition() ? songsURL : analysisURL)(path) + "?t=" + Date.now(), {cache: "no-cache"});
      if (!r.ok) throw new Error("HTTP " + r.status);
      text = await r.text();
    }
    div.textContent = text.trim() || "(the repo file is empty)";
  } catch (err) { div.textContent = "earlier messages are in " + path + " — couldn't load it (" + err.message + ")"; }
  askScrollEnd(); // the earlier block grows above the conversation: keep its end in view
}

// what the configured backend can do (askStatusPoll detects; askTabsApply shows). sessions: the bridge's Clear-really-resets/Compact/usage-line trio (askSessionRender gates on it)
export function initSheet1() {
  try { const m = localStorage.getItem("ff1roll-ask-mode"); S.askTerminal = m === "terminal"; S.askGeneral = S.askTerminal || m === "general"; } catch (err) { S.askGeneral = S.askTerminal = false; }
}

export function initSheet2() {
  document.getElementById("askattach").addEventListener("click", () => {
    const btn = document.getElementById("askattach"), menu = document.getElementById("askattachmenu");
    const was = S.dropUpOpen === menu && menu.classList.contains("on");
    closeFileMenus();
    if (was) return;
    const r = btn.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(r.right - 240, window.innerWidth - 246)) + "px"; // right-aligned to ＋: it sits at the AI window's right edge
    menu.style.bottom = (wmInnerHeight() - r.top + 6) + "px";
    menu.classList.add("on");
    S.dropUpOpen = menu;
  });
  document.getElementById("askattachmenu").addEventListener("click", () => closeDropUp(), {capture: true}); // the item's own handler still runs
  document.getElementById("askshot").addEventListener("click", askShotTake);
  document.getElementById("askshotx").addEventListener("click", () => { askShotClearAll(); askstatus.textContent = ""; });
  document.getElementById("askpick").addEventListener("click", () => document.getElementById("askpickfile").click());
  document.getElementById("askpickfile").addEventListener("change", e => {
    // copy BEFORE clearing: e.target.files is live, and WebKit empties it when
    // value is reset — the picker then "did nothing" (Josh, 2026-10-03, iPad)
    const files = Array.from(e.target.files || []); e.target.value = ""; askPickFiles(files);
  });
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", () => { if (document.hidden) askDraftSave(); });
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("pagehide", askDraftSave);
  }
}

export function initSheet3() {
  document.getElementById("askbtn").addEventListener("click", askBtnTap);
  for (const [id, mode] of [["askmodesong", "song"], ["askmodegen", "general"], ["askmodeterm", "terminal"]]) document.getElementById(id).addEventListener("click", () => {
    if ((S.askTerminal ? "terminal" : S.askGeneral ? "general" : "song") === mode) return;
    askSetMode(mode);
    askRender(); askRefresh(); askSessionRefresh();
  });
  document.getElementById("asknowstrip").addEventListener("click", askStatusToggle);
  document.getElementById("askreplybtn").addEventListener("click", openAsk);
  document.getElementById("askgear").addEventListener("click", () => { asksheet.classList.remove("on"); openSettingsSheet(); });
  document.getElementById("askclear").addEventListener("click", async () => { // Clear = new session; unsaved messages are the one thing it can destroy
    const n = askUnsavedCount();
    if (n && !(await appConfirm("Clear chat", n + " message" + (n === 1 ? " is" : "s are") + " not in the repo yet — Save the song first to keep " + (n === 1 ? "it" : "them") + ". Clear anyway?", "Clear", "Keep"))) return;
    localStorage.removeItem(askStoreKey()); askSentReset(askStoreKey()); askRender(); updateSongBtn();
    // Clear really resets (open-items.md "NEXT: AI SESSION CONTROLS" #1, Josh:
    // "the app's Clear chat only clears this device's log and never tells the
    // bridge, so the same Claude session keeps being resumed and growing"):
    // drop the bridge's session id too, when the backend is the bridge —
    // best-effort, never blocks the local clear above
    if (S.askCaps.bridge && S.askCaps.sessions && !S.askTerminal) {
      const key = askSessionName();
      delete S.askSessionCache[key];
      try { await aiSessionDelete(askHost(), key); } catch (err) { /* the local clear already happened; the bridge just keeps resuming the old one */ }
      askSessionRender();
    }
  });
  document.getElementById("asksend").addEventListener("click", askSend);
  document.getElementById("askstop").addEventListener("click", () => { if (S.askBusy) S.askBusy.abort(); });
  askinput.addEventListener("input", askGrow);
  askinput.addEventListener("blur", () => { if (!(typeof S.micBtn !== "undefined" && S.micBtn === document.getElementById("askmic"))) askComposing(false); }); // the draft is saved; a build may go ahead
  document.getElementById("askmic").addEventListener("click", () => {
    if (!SPEECH) { askstatus.textContent = "no speech recognition in this browser — the keyboard mic still works"; return; }
    micToggle(document.getElementById("askmic"), askinput, s2 => { askstatus.textContent = s2; });
  });
  askinput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askSend(); }
  });
}
