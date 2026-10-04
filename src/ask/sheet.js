import { S } from "../state.js";
import { askTermModelsLoad } from "./bridge.js";
import { songTitleOf } from "./context.js";
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
export function askDraftStore(key) { return "ff1roll-askdraft-" + key; }
export function askDraftSave() {
  clearTimeout(S.askDraftTimer); S.askDraftTimer = null;
  if (!S.askDraftKey) return;
  try {
    const text = askinput.value;
    if (!text.trim() && !S.askShotPending.length) localStorage.removeItem(askDraftStore(S.askDraftKey));
    else localStorage.setItem(askDraftStore(S.askDraftKey), JSON.stringify({text, shots: S.askShotPending.map(s => s.path)}));
  } catch (err) { /* storage full or private: the box itself still holds it */ }
}
export function askDraftSaveSoon() { clearTimeout(S.askDraftTimer); S.askDraftTimer = setTimeout(askDraftSave, 300); askComposing(!!askinput.value.trim()); }
export function askDraftLoad() { // the panel now shows a different chat: its own unsent message comes back
  const key = askStoreKey();
  if (key === S.askDraftKey) return;
  if (S.askDraftKey) askDraftSave(); // the chat we're leaving keeps what was in the box
  S.askDraftKey = key;
  let d = null; try { d = JSON.parse(localStorage.getItem(askDraftStore(key)) || "null"); } catch (err) { d = null; }
  askinput.value = d && d.text || "";
  // new shape is {shots: [path, …]}; an old draft saved before 2026-10-02 has
  // {shot: path} (singular) — restore that as a one-shot array
  askShotRestore(d && d.shots ? d.shots : d && d.shot ? [d.shot] : []);
  askGrow();
}
export function askDraftClear() { clearTimeout(S.askDraftTimer); S.askDraftTimer = null; try { localStorage.removeItem(askDraftStore(askStoreKey())); } catch (err) { /* nothing stored */ } }
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
