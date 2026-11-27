import { S } from "../state.js";
import { askLogPath } from "./bridge.js";
import { readData } from "../platform/folder.js";
import { isComposition } from "../model/provenance.js";
import { asklog } from "./sheet.js";
import { askFillBubble } from "./sheet.js";
import { askRenderImpl } from "./sheet.js";

// ---- Earlier chats (Josh #1203: "what do I need to do to get my chat history
// back for the Ex Ex Battle Theme"). A song's chat lives on the device; every
// Publish appends it to <song>.ask.md beside the song (askCommitLog), and that
// file is the one copy that survives Clear chat, a new device or a lost store
// — but the app never showed it. This fold, at the top of the ♪ song chat,
// shows the published log read-only in the chat's own bubbles. It never
// writes the file, never puts a line into the live store (aiStoreGet) and
// nothing here reaches the model: the AI's context is built from the store.
export const ASK_HISTORY_OPEN_KEY = "ff1roll-ask-history-open"; // device-local UI state: the fold's open/closed
export const ASK_HISTORY_PAGE = 25; // blocks drawn per "show earlier" tap — a log with hundreds of exchanges must not freeze the panel

// The file as askLogMarkdown writes it: a "### <date>[ · bars …]" heading per
// question, "**Josh:** …" under it, then "**AI (model):** …" / "**Mac (…):** …"
// paragraphs. Tolerant on purpose — a block with no reply, the "⚠ the Mac no
// longer has this reply" line, a hand-edited file, CRLF, bold inside a reply:
// any line that is not a heading or a label just continues the current message.
export function askLogParse(md) {
  const blocks = [];
  if (typeof md !== "string" || !md) return blocks;
  let block = null, msg = null;
  const push = () => { if (msg) { msg.text = msg.text.trim(); if (msg.text) block.msgs.push(msg); msg = null; } };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    const head = /^###\s+(.*)$/.exec(line);
    if (head) { push(); block = {date: head[1].trim(), msgs: []}; blocks.push(block); continue; }
    if (/^#\s/.test(line) && !block) continue; // the file's own title
    const lab = /^\*\*([^*]{1,60}?):\*\*\s?(.*)$/.exec(line);
    if (lab && block) {
      push();
      const who = lab[1];
      const role = /^(Josh|You|User)\b/i.test(who) ? "user" : /^(Mac|Note|Terminal)\b/i.test(who) ? "note" : "ai";
      msg = {role, who, text: lab[2]};
      continue;
    }
    if (!block) continue; // the header paragraph before the first exchange
    if (!msg) { if (!line.trim()) continue; msg = {role: "ai", who: "", text: line}; continue; } // a line under a heading with no label at all
    msg.text += "\n" + line;
  }
  push();
  return blocks;
}
export function askHistoryEmpty() { return {key: null, path: null, state: "none", blocks: [], shown: ASK_HISTORY_PAGE}; }
export function askHistoryIsOpen() { try { return localStorage.getItem(ASK_HISTORY_OPEN_KEY) === "1"; } catch (err) { return false; } }
export function askHistorySetOpen(open) { try { localStorage.setItem(ASK_HISTORY_OPEN_KEY, open ? "1" : "0"); } catch (err) { /* private mode */ } }
// Which song's log the fold is for: the open ♪ chat's song, when it can have a
// published log. A local-only song (no key, "local", an import under local/)
// has no file in the repo — no fetch, no fold.
export function askHistoryPath() {
  if (S.askGeneral || S.askTerminal || !S.songKey || /^local(\/|$)/.test(S.songKey)) return null;
  return askLogPath(S.songKey);
}
// One fetch per song: the same read as the song's .rollnotes.json (readData —
// the linked folder first, else the published site, busting the cache so a
// Publish made a moment ago shows). A miss (404, offline) is "missing" and
// draws nothing; the next song, or the next open of the panel on a new song,
// asks again. Arrival redraws the chat so the fold appears without a tap.
export function askHistoryLoad() {
  const path = askHistoryPath();
  const h = S.askHistory;
  if (!path) { if (h.state !== "none") S.askHistory = askHistoryEmpty(); return; }
  if (h.path === path && h.key === S.songKey) return; // known (or still loading)
  const key = S.songKey;
  S.askHistory = {key, path, state: "loading", blocks: [], shown: ASK_HISTORY_PAGE};
  const which = isComposition() ? "songs" : "analysis";
  readData(which, path, true).then(async r => {
    const text = r && r.ok ? await r.text() : "";
    const blocks = askLogParse(text);
    return {state: blocks.length ? "ok" : "missing", blocks};
  }).catch(() => ({state: "missing", blocks: []})).then(res => {
    if (S.askHistory.key !== key || S.askHistory.path !== path) return; // another song meanwhile
    S.askHistory = Object.assign(S.askHistory, res);
    if (res.state === "ok" && S.songKey === key && !S.askGeneral && typeof document !== "undefined") { try { askRenderImpl(); } catch (err) { /* panel not built yet: openAsk renders */ } }
  });
}
// The fold itself, prepended to #asklog by askRenderImpl after the live chat
// is drawn. Closed: one summary line. Open: the last ASK_HISTORY_PAGE blocks
// (oldest first), a "show earlier" button above them for the rest, each
// block's date line then its bubbles — .askmsg user/ai/note like the chat's
// own, plus .hist so a style can tell them apart. Nothing here is live: no
// copy of a line lands in the store, no listener but the fold's own.
export function askHistoryBlock() {
  if (typeof asklog === "undefined" || !asklog || !asklog.prepend) return;
  askHistoryLoad();
  const h = S.askHistory;
  if (h.state !== "ok" || h.key !== S.songKey || !h.blocks.length) return;
  const det = document.createElement("details");
  det.className = "askhist";
  det.open = askHistoryIsOpen();
  // drawn on the first open only: a closed fold costs nothing however long the log
  det.addEventListener("toggle", () => { askHistorySetOpen(det.open); if (det.open && !det.dataset.filled) askHistoryFill(det, h); });
  const sum = document.createElement("summary");
  sum.textContent = "Earlier chats (" + h.blocks.length + ") — from the song's saved log, read only";
  det.appendChild(sum);
  if (det.open) askHistoryFill(det, h);
  asklog.prepend(det);
}
export function askHistoryFill(det, h) {
  det.dataset.filled = "1";
  const total = h.blocks.length, from = Math.max(0, total - h.shown);
  if (from > 0) {
    const more = document.createElement("button");
    more.className = "askhistmore";
    more.textContent = "Show earlier (" + from + " more)";
    more.addEventListener("click", () => { h.shown = Math.min(total, h.shown + ASK_HISTORY_PAGE); askRenderImpl(); });
    det.appendChild(more);
  }
  for (const b of h.blocks.slice(from)) {
    const d = document.createElement("div");
    d.className = "askhistdate";
    d.textContent = b.date;
    det.appendChild(d);
    for (const m of b.msgs) {
      const div = document.createElement("div");
      div.className = "askmsg hist " + m.role;
      askFillBubble(div, m.text);
      if (m.who && m.role !== "user") div.title = m.who; // which model answered ("AI (claude-code-sonnet)"), on hover
      det.appendChild(div);
    }
  }
}
