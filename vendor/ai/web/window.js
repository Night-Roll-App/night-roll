// web/window.js — the chat window's mechanics, in ADOPT mode: it binds the
// app's EXISTING markup by element id (host.ids, defaulting to the ask*
// ids below) and draws into it — the log of bubbles, the live stream, the
// compose box that grows with its text, the three chat tabs, the unsent
// draft that survives a relaunch. No markup or CSS of its own yet (that is
// the plan's step 7); every sentence a user reads comes from the host.
//
// Host, beyond the earlier modules':
//   ids        → {sheet, log, input, status, send, stop, tabSong, tabGeneral, tabTerminal, spanRow} (defaults: today's ask* ids)
//   css        → {msg: "askmsg", copy: "askcopy", other: "othermode", earlier: "earlier"}
//   copyText(text, btn)          · onDraftChange(hasText)   (composing notice)
//   shotPaths() / restoreShots(paths)   (the attachment list the draft keeps)
//   tabLabel(tab) · placeholder(tab) · onTabsChanged()   (song title, the box's hint, the app's own follow-ups)
//   greeting(tab) → text|null · renderEarlier(div)   (an empty chat; a trimmed one)
//   msgTag(m) → {tag, dim} · noteLabel(from) · clock(t)
//   send() · abort()   (the window's Send and Stop)
import { aiStoreGet, aiDraftRead, aiDraftWrite, aiDraftClear } from "./store.js";
import { aiPartial, aiResumeSoon, aiText } from "./client.js";

export const AI_WINDOW_IDS = {sheet: "asksheet", log: "asklog", input: "askinput", status: "askstatus", send: "asksend", stop: "askstop", tabSong: "askmodesong", tabGeneral: "askmodegen", tabTerminal: "askmodeterm", spanRow: "askspanrow"};
export const AI_WINDOW_CSS = {msg: "askmsg", copy: "askcopy", other: "othermode", earlier: "earlier"};
export function aiEl(host, which) { const ids = Object.assign({}, AI_WINDOW_IDS, host.ids || {}); return document.getElementById(ids[which]); }
export function aiCss(host, which) { return Object.assign({}, AI_WINDOW_CSS, host.css || {})[which]; }
export function aiTab(host) { return host.state.askTerminal ? "terminal" : host.state.askGeneral ? "general" : "song"; }
export function aiClock(t) { // when a note (or a terminal message) was sent — today: HH:MM; earlier: "Sep 30 HH:MM"
  if (!t) return "";
  const d = new Date(t), now = new Date(), hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  return (d.toDateString() === now.toDateString() ? hm : d.toLocaleDateString(undefined, {month: "short", day: "numeric"}) + " " + hm) + " · ";
}
// ---- the compose box
export function aiGrow(host) { // size the box to its text (CSS caps it) and keep the end in view
  const input = aiEl(host, "input");
  input.style.height = "auto";
  input.style.height = input.scrollHeight + "px";
  input.scrollTop = input.scrollHeight;
  aiDraftSaveSoon(host); // typing and dictation both land here
}
export function aiScrollEnd(host) { const log = aiEl(host, "log"); if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); else log.scrollTop = log.scrollHeight; }
export function aiFocusIfKeyboard(host) { // a touch screen's keyboard would take half the window on every open; focus only where a real keyboard is likely
  if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) return;
  aiEl(host, "input").focus();
}
// ---- the unsent draft: per chat, device-local, cleared on send
export function aiDraftSaveNow(host) {
  const st = host.state;
  clearTimeout(st.askDraftTimer); st.askDraftTimer = null;
  if (!st.askDraftKey) return;
  aiDraftWrite(host, st.askDraftKey, {text: aiEl(host, "input").value, shots: host.shotPaths ? host.shotPaths() : []});
}
export function aiDraftSaveSoon(host) {
  const st = host.state;
  clearTimeout(st.askDraftTimer); st.askDraftTimer = setTimeout(() => aiDraftSaveNow(host), 300);
  if (host.onDraftChange) host.onDraftChange(!!aiEl(host, "input").value.trim());
}
export function aiDraftLoad(host) { // the window now shows a different chat: its own unsent message comes back
  const st = host.state, key = host.chatKey();
  if (key === st.askDraftKey) return;
  if (st.askDraftKey) aiDraftSaveNow(host); // the chat we're leaving keeps what was in the box
  st.askDraftKey = key;
  const d = aiDraftRead(host, key);
  aiEl(host, "input").value = d.text;
  if (host.restoreShots) host.restoreShots(d.shots);
  aiGrow(host);
}
export function aiDraftDrop(host) { const st = host.state; clearTimeout(st.askDraftTimer); st.askDraftTimer = null; aiDraftClear(host, host.chatKey()); }
// ---- bubbles
export function aiFillBubble(host, div, text) { // the words, web addresses tappable, a copy button at the end
  div.textContent = text;
  // links only where the DOM can rebuild children (a test harness's fake
  // elements keep textContent as a plain string, so they get the text alone)
  const re = /https?:\/\/[^\s<>"'`]+/g;
  if (re.test(text) && typeof div.replaceChildren === "function") {
    const nodes = []; let last = 0, m; re.lastIndex = 0;
    while ((m = re.exec(text))) {
      let url = m[0]; const trail = url.match(/[.,;:!?)\]]+$/); if (trail) url = url.slice(0, -trail[0].length);
      nodes.push(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement("a"); a.href = url; a.textContent = url; a.target = "_blank"; a.rel = "noopener";
      nodes.push(a);
      last = m.index + url.length;
    }
    nodes.push(document.createTextNode(text.slice(last)));
    div.replaceChildren(...nodes);
  }
  if (text.trim() && text !== "…" && host.copyText) {
    const b = document.createElement("button");
    b.className = aiCss(host, "copy"); b.type = "button"; b.setAttribute("aria-label", "Copy this message"); b.title = "copy";
    b.addEventListener("click", ev => { ev.stopPropagation(); host.copyText(text, b); });
    div.appendChild(b);
  }
}
export function aiBubble(host, role, text) {
  const log = aiEl(host, "log");
  const div = document.createElement("div");
  div.className = aiCss(host, "msg") + " " + role;
  aiFillBubble(host, div, text);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}
export function aiShowThinking(host, live, raw) { // Qwen-style <think> blocks stay out of the bubble; the words so far are kept per job
  const vis = raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/^\s+/, "");
  if (live && live.dataset && live.dataset.job && vis) aiPartial(host)[live.dataset.job] = vis;
  live.textContent = vis || "…";
  if (vis && host.status) host.status("");
  const log = aiEl(host, "log"); log.scrollTop = log.scrollHeight;
}
// ---- tabs: song / general / terminal. The choice is a device preference (host.keys.mode).
export function aiTabSet(host, tab) { // "terminal" | "song" | "general" (a boolean still means general/song)
  if (tab === true) tab = "general"; else if (tab === false) tab = "song";
  const st = host.state;
  st.askTerminal = tab === "terminal"; st.askGeneral = st.askTerminal || tab === "general";
  try { (host.storage || globalThis.localStorage).setItem(host.keys.mode, tab); } catch (err) { /* private mode */ }
  aiTabButtons(host);
}
export function aiTabRestore(host) { // at boot: the tab this device had open
  const st = host.state;
  try { const m = (host.storage || globalThis.localStorage).getItem(host.keys.mode); st.askTerminal = m === "terminal"; st.askGeneral = st.askTerminal || m === "general"; } catch (err) { st.askGeneral = st.askTerminal = false; }
}
export function aiTabButtons(host) {
  const a = aiEl(host, "tabSong"), b = aiEl(host, "tabGeneral"), c = aiEl(host, "tabTerminal");
  if (!a || !b) return;
  const st = host.state, gen = st.askGeneral && !st.askTerminal;
  a.classList.toggle("active", !st.askGeneral); b.classList.toggle("active", gen);
  a.setAttribute("aria-selected", String(!st.askGeneral)); b.setAttribute("aria-selected", String(gen));
  if (c) { c.classList.toggle("active", st.askTerminal); c.setAttribute("aria-selected", String(st.askTerminal)); }
  if (host.tabLabel) { try { a.textContent = host.tabLabel("song"); } catch (err) { /* the host's label failed: keep what's there */ } }
  const spanrow = aiEl(host, "spanRow"); if (spanrow) spanrow.style.display = st.askGeneral ? "none" : "";
  const input = aiEl(host, "input"); if (input && host.placeholder) input.placeholder = host.placeholder(aiTab(host));
  if (host.onTabsChanged) host.onTabsChanged();
}
// ---- the log
export function aiRenderLog(host) {
  aiDraftLoad(host);
  const log = aiEl(host, "log");
  log.innerHTML = "";
  const st = aiStoreGet(host);
  const msgs = st.msgs;
  if (st.trimmed && host.renderEarlier) { const div = aiBubble(host, "ai", ""); div.classList.add(aiCss(host, "earlier")); host.renderEarlier(div); }
  let pendingSeen = false;
  if (!msgs.length && !st.trimmed && host.greeting) { const g = host.greeting(aiTab(host)); if (g) aiBubble(host, "ai", g); }
  for (const m of msgs) {
    const info = host.msgTag ? host.msgTag(m) : {tag: "", dim: false}; // a turn the app wants marked (shown here, it is the on-device log, not a request)
    const tag = info && info.tag || "";
    const note = m.role === "note";
    const body = note ? aiClock(m.t) + (host.noteLabel ? host.noteLabel(m.m) : "") + m.content
                      : (host.state.askTerminal && m.role === "user" ? aiClock(m.t) : "") + (host.showText ? host.showText(m.content) : m.content);
    const div = aiBubble(host, m.role === "user" ? "user" : note ? "note" : "ai", tag + body);
    if (info && info.dim) div.classList.add(aiCss(host, "other"));
    if (m.pending) { const part = aiPartial(host)[m.pending]; aiBubble(host, "ai", part ? part + "\n\n" + aiText(host, "stillWriting") : aiText(host, "pendingHere")).dataset.job = m.pending; pendingSeen = true; }
  }
  if (pendingSeen) aiResumeSoon(host, 200);
}
// ---- wiring for the controls the library draws into: Send, Stop, the box, the tabs
export function aiWindowBind(host) {
  const input = aiEl(host, "input");
  aiEl(host, "send").addEventListener("click", () => host.send());
  aiEl(host, "stop").addEventListener("click", () => { if (host.state.askBusy) host.state.askBusy.abort(); });
  input.addEventListener("input", () => aiGrow(host));
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); host.send(); } });
  for (const [which, tab] of [["tabSong", "song"], ["tabGeneral", "general"], ["tabTerminal", "terminal"]]) {
    const el = aiEl(host, which);
    if (el) el.addEventListener("click", () => { if (aiTab(host) === tab) return; aiTabSet(host, tab); if (host.onTabPicked) host.onTabPicked(tab); });
  }
}
