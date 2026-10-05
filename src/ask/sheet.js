import { S } from "../state.js";
import { songTitleOfImpl as songTitleOf } from "./context.js";
import { baseName } from "../model/rollnotes.js";
import { ASK_TERMINAL_KEY } from "./bridge.js";
import { ASK_GENERAL_KEY } from "./bridge.js";
import { askComposing } from "./bridge.js";
import { askSpan } from "./context.js";
import { askSpanLabel } from "./context.js";
import { cfg } from "../platform/storage.js";
import { AI_BROWSER_MODELS } from "./backend.js";
import { micStop } from "../ui/chrome.js";
import { appMode } from "../platform/mode.js";
import { askMsgMode } from "./context.js";
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
import { aiDraftKey } from "../../vendor/ai/web/store.js";
import { aiSessionDelete } from "../../vendor/ai/web/bridge-client.js";
import { aiClock, aiGrow, aiScrollEnd, aiFocusIfKeyboard, aiDraftSaveNow, aiDraftSaveSoon, aiDraftLoad, aiDraftDrop, aiFillBubble, aiBubble, aiShowThinking, aiTabSet, aiTabButtons, aiRenderLog } from "../../vendor/ai/web/window.js";
import { askSessionRender } from "./bridge.js";
import { askSend } from "./client.js";
import { SPEECH } from "../ui/note-editor.js";
import { micToggle } from "../ui/note-editor.js";

// The window's mechanics — tabs, the growing box, bubbles, the live stream,
// the draft, the log render — are the AI library's (vendor/ai/web/window.js,
// step 6, ADOPT mode: it binds THIS markup by id; index.html and the CSS are
// untouched). Every word it shows comes from askHost(): the tab label, the
// placeholders, the greetings, the mode tag, the ✉ label. These are Night
// Roll's bare names as delegates, same signatures.
export function askSetMode(mode) { aiTabSet(askHost(), mode); } // "terminal" | "song" | "general" (a boolean still means general/song); the choice is a device preference (ff1roll-ask-mode)
export function askModeButtons() { aiTabButtons(askHost()); } // active/aria, the song's name on its tab, the span row, the placeholder; then askTermModelsLoad + askStatusRender (host.onTabsChanged)
export function askTabLabel() { // the tab names the song: the sheet covers the title behind it (Josh, 2026-09-27)
  const t = S.songKey ? songTitleOf(S.songKey) : (typeof baseName === "function" ? baseName() : "");
  return "♪ " + (t && t.length > 22 ? t.slice(0, 21) + "…" : t || "this song");
}
export function askPlaceholder(tab) {
  if (tab === "terminal") return "Tell the terminal what to build or fix…";
  return tab === "general" ? "Anything — the app, the project, music in general" + (S.askCaps.bridge ? ", a message for the terminal…" : "…") : "Ask about what you're looking at…";
}
export function askGreeting(tab) { // an empty chat's first bubble — the Learning one leads with hints (CLAUDE.md), the Normal one answers
  if (tab === "terminal") return "This goes straight to Claude Code in the Mac's terminal — the session that builds Night Roll. Tell it what to build or fix; its answers come back here, and the Now: line above shows what it's doing.";
  if (tab === "general") return "This is the general chat — not about any one song. Ask about the app, the project, music in general, or say \"tell the terminal…\" to pass a message to the Claude Code sessions on your Mac.";
  return appMode() === "normal"
    ? "Ask me about what you're looking at — I can see the song, your cursor, your notes, and the bars in view. I'll answer directly — keys, chords, cadences, form — and say how sure I am."
    : "Ask me about what you're looking at — I can see the song, your cursor, your notes, and the bars in view. I'll point you toward things before I name them; say you give up and I'll just tell you.";
}
// a different mode's turn (askMsgMode/appMode, SAFETY 2026-10-01): still
// shown (this is the on-device log, not a model request) but dimmed and
// tagged, so Josh can tell it was never part of the current mode's AI
// context, not just missing from it. The library draws the tag; what counts
// as "other" is decided here, never there.
export function askMsgTag(m) {
  const otherMode = !S.askTerminal && askMsgMode(m) !== appMode();
  return {tag: otherMode ? "[" + (askMsgMode(m) === "normal" ? "Normal" : "Learning") + " mode] " : "", dim: otherMode};
}
export function askStoreKey() { return S.askTerminal ? ASK_TERMINAL_KEY : S.askGeneral ? ASK_GENERAL_KEY : "ff1roll-ask-" + (S.songKey || "local"); }
// ---- the sheet
export const asksheet = document.getElementById("asksheet");
export const asklog = document.getElementById("asklog");
export const askinput = document.getElementById("askinput");
export const askstatus = document.getElementById("askstatus");
// when each note from the Mac (and each Terminal message) was sent — Josh,
// 2026-09-30: "I want timestamps on the messages that you sent back to me"
export function askClock(t) { return aiClock(t); }
export function askNoteLabel(from) { return "✉ " + (from && from !== "terminal" ? from : "from the Mac") + ": "; }
// the unsent message survives a relaunch (Josh, 2026-09-29: five dictated
// paragraphs lost today to the app reinstalling under him). Per chat, device-
// local (a composer draft is not the song's state); cleared on Send. The
// record (ff1roll-askdraft-<chat>, {text, shots} — and the older {shot} shape
// it still reads) and the save/load mechanics are the library's.
export function askDraftStore(key) { return aiDraftKey(askHost(), key); }
export function askDraftSave() { aiDraftSaveNow(askHost()); }
export function askDraftSaveSoon() { aiDraftSaveSoon(askHost()); } // also the bridge's "composing" notice (host.onDraftChange → askComposing)
export function askDraftLoad() { aiDraftLoad(askHost()); } // the panel now shows a different chat: its own unsent message comes back
export function askDraftClear() { aiDraftDrop(askHost()); }
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
export const askPartial = S.askPartial; // the library's record (vendor/ai/web/client.js aiPartial), aliased for askRender/askShowThinking
// job id -> the words streamed so far: a closed-and-reopened sheet redraws from storage, which only holds the marker (Josh, 2026-09-27: "I don't see the first part of the response")
export function askShowThinking(live, raw) { aiShowThinking(askHost(), live, raw); } // Qwen-style <think> blocks stay out of the bubble
export function askScrollEnd() { aiScrollEnd(askHost()); }
export function askFocusIfKeyboard() { aiFocusIfKeyboard(askHost()); } // a touch screen's keyboard took half the sheet on every open, and Josh dictates (2026-09-27); focus only where a real keyboard is likely
export function askGrow() { aiGrow(askHost()); } // size the box to its text (CSS caps it) and keep the end in view; typing and dictation both land here

export function askMicOff() { // Send clears the box: a late result must not refill it
  if (S.micBtn === document.getElementById("askmic")) micStop(true);
  // ■ Stop leaves the stopped session's onresult attached (Safari's final
  // words arrive after stop) — a Send right after it must silence that too,
  // or the late transcript lands in the emptied box (Josh, 2026-09-30)
  if (S.micPrev) { S.micPrev.onresult = null; try { S.micPrev.abort(); } catch (err) { /* already gone */ } S.micPrev = null; }
}
// 📋 Paste (Josh, Terminal #113–114; docs/plans/2026-10-04-ai-paste-button.md):
// Superwhisper on the iPad is only a keyboard, and its Control Center
// control leaves the transcript on the clipboard — one tap puts it in the
// box WITHOUT focusing it (the keyboard would take half the screen). The
// shell has no Capacitor clipboard plugin, so navigator.clipboard is the
// one path; readText() runs first thing in the tap (user activation — iOS
// shows its own Paste bubble). Every failure is a status line, never a
// dialog, and nothing here sends.
export async function askPaste() {
  const clip = typeof navigator !== "undefined" && navigator.clipboard;
  if (!clip || typeof clip.readText !== "function") { askstatus.textContent = "this browser can't read the clipboard — paste with the keyboard"; return; }
  let text;
  try { text = await clip.readText(); }
  catch (err) {
    askstatus.textContent = err && err.name === "NotAllowedError" ? "clipboard permission denied — allow it, or paste with the keyboard" : "couldn't read the clipboard (" + (err && err.message || err) + ")";
    return;
  }
  if (!text || !text.trim()) { askstatus.textContent = "nothing on the clipboard"; return; }
  askPasteInsert(text);
  askstatus.textContent = "";
}
export function askPasteInsert(text) { // at the caret when the box already has focus, else at the end; a space wherever the join would run words together; never focus()
  // a live dictation rebuilds the box from the base it captured at start on
  // every result — a paste under it would vanish on the next one. Stop it;
  // the words already in the box stay (same discard Send uses).
  askMicOff();
  const v = askinput.value, focused = typeof document !== "undefined" && document.activeElement === askinput;
  const s = focused && typeof askinput.selectionStart === "number" ? askinput.selectionStart : v.length;
  const e = focused && typeof askinput.selectionEnd === "number" ? askinput.selectionEnd : s;
  const before = v.slice(0, s), after = v.slice(e);
  const lead = before && !/\s$/.test(before) ? " " : "", trail = after && !/^\s/.test(after) ? " " : "";
  askinput.value = before + lead + text + trail + after;
  if (focused) { const at = (before + lead + text).length; try { askinput.setSelectionRange(at, at); } catch (err) { /* a box with no selection API */ } }
  askGrow(); // size, the composing notice, the library's draft timer
  askDraftSave(); // and the draft now: a relaunch right after the tap must still have it
}
export function askBubble(role, text) { return aiBubble(askHost(), role, text); }
export function askFillBubble(div, text) { aiFillBubble(askHost(), div, text); } // the words, web addresses tappable, a ⧉ copy at the end (host.copyText)

export function askRenderImpl() { aiRenderLog(askHost()); } // the draft, the greeting (askGreeting), each message with its mode tag (askMsgTag), pending bubbles, the earlier block (askRenderEarlier)
export async function askRenderEarlier(div) { // what this device let go of after it reached the repo file; `div` is the library's placeholder bubble (or none, when called alone)
  if (!div) { div = askBubble("ai", ""); div.classList.add("earlier"); }
  div.textContent = "loading the earlier messages from the repo file…";
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
// the tab this device had open (ff1roll-ask-mode) — the library's aiTabRestore
// does the same; kept as this statement so the boot-order snapshot
// (tests/boot-order.test.mjs) stays byte-identical
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
  // the window's own controls stay wired here (not the library's aiWindowBind,
  // which does the same for an app without wiring of its own): each handler
  // is a delegate into vendor/ai/web/window.js, and the boot-order snapshot
  // (tests/boot-order.test.mjs) keeps these statements as they were
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
  document.getElementById("askpaste").addEventListener("click", askPaste);
  askinput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askSend(); }
  });
}
