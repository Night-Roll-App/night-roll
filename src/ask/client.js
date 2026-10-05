import { askStoreKey } from "./sheet.js";
import { songTitleOfImpl as songTitleOf } from "./context.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { asksheet } from "./sheet.js";
import { askRenderImpl as askRender } from "./sheet.js";
import { askstatus } from "./sheet.js";
import { S } from "../state.js";
import { askSessionRefresh } from "./bridge.js";
import { askinput } from "./sheet.js";
import { aiUrl } from "./backend.js";
import { cfg } from "../platform/storage.js";
import { aiHostOk } from "./backend.js";
import { askSpan } from "./context.js";
import { askSpanLabel } from "./context.js";
import { askShotOutgoing } from "./shots.js";
import { askShotDisplayText } from "./shots.js";
import { askShotClearAll } from "./shots.js";
import { askBudget } from "./context.js";
import { askContext } from "./context.js";
import { askBuildMessages } from "./context.js";
import { askLoad } from "./bridge.js";
import { askSave } from "./bridge.js";
import { askJobId } from "./bridge.js";
import { askComposing } from "./bridge.js";
import { appMode } from "../platform/mode.js";
import { askMicOff } from "./sheet.js";
import { askDraftClear } from "./sheet.js";
import { askGrow } from "./sheet.js";
import { askBubble } from "./sheet.js";
import { askHost } from "./host.js";
import { openRecentSong } from "../ui/chrome.js";
import { askSetMode } from "./sheet.js";
import { askDraftText } from "./sheet.js";
import { askStore } from "./bridge.js";
// The exchange itself — store-first send, tool rounds, abort, the resume of
// a cut stream, the terminal send — is the AI library's
// (vendor/ai/web/client.js, step 5). It reaches everything app-specific
// through askHost(): the system prompt (askSys — the Learning law), the
// context block (askContext), history selection by mode (askBuildMessages),
// the tools (askToolsNow/askRunTool), the message tag (mode: appMode()),
// and every bubble/status/badge it draws. These are Night Roll's bare
// names as delegates, same signatures as before.
import { aiFinish, aiFail, aiRun, aiTerminalSend, aiRepending, aiResumeSoon, aiResume } from "../../vendor/ai/web/client.js";

export function askFinish(jobId, text, key) { aiFinish(askHost(), jobId, text, key); } // the reply for a pending question landed: store it, drop the marker
export function askFail(jobId, note, key) { aiFail(askHost(), jobId, note, key); } // no reply will come: keep the question, say why
// A reply landed. Sheet open on that song: redraw it (the live bubble may be
// a stale node — the sheet was closed and reopened mid-run). Otherwise the
// footer gets a gold ✦ badge, the ⚠ way: it stays until tapped, and the info
// strip says so once. Tapping opens Ask.
export function askLanded(key, failed) {
  askSessionRefresh(); // a turn just landed on the bridge: its usage/turns grew
  const sw = S.askSwitch;
  if (sw && sw.from === key) { // open_song's second half: only now, never inside the exchange (docs/ai-parity.md §4); a reply that failed or was stopped opens nothing
    S.askSwitch = null;
    if (!failed) setTimeout(() => { askSwitchRun(sw).catch(err => setInfo("couldn't open " + sw.title + " — " + (err && err.message || err))); }, 0); // after aiRun's own finally (askBusy clears there)
  }
  if (asksheet.classList.contains("on") && key === askStoreKey()) { askRender(); return; }
  const b = document.getElementById("askreplybtn");
  b.style.display = "";
  const other = key !== askStoreKey() ? " in " + songTitleOf(key.replace(/^ff1roll-ask-/, "")) : "";
  setInfo((failed ? "✦ AI: no reply" : "✦ AI replied") + other + " — tap ✦ reply to read it");
}
// The switch itself (docs/ai-parity.md §4 steps 3–5): the song opens the way
// File → Open Recent does (a local copy wins, the album run ends, the address
// bar follows, loadSong — and its own "NEWER SAVE EXISTS" sheet, if any, is
// awaited inside it); only once the song is really in does the ♪ tab show
// its chat, with a gold ↪ line quoting the request it came from, and the
// carried-over words go out as the user's next message there — unless that
// chat holds an unsent draft, which a send would wipe (afterSend clears the
// box): then it waits as a one-tap chip (S.askCarry, src/ask/sheet.js). A
// failed load stops everything: loadSong said why, the chat stays put.
export async function askSwitchRun(sw) {
  if (S.askBusy || S.songLoading) { sw.tries = (sw.tries || 0) + 1; if (sw.tries < 40) setTimeout(() => askSwitchRun(sw), 250); else setInfo("couldn't open " + sw.title + " — Ask stayed busy"); return; } // another chat's exchange, or a load, still in flight: never two at once
  const ok = sw.path === S.songKey || await openRecentSong(sw.path);
  if (!ok || S.songKey !== sw.path) return;
  if (S.askGeneral || S.askTerminal) askSetMode("song"); // the ♪ tab: the song's own history (setSong already re-rendered an open window for the new song)
  const key = askStoreKey();
  if (key !== sw.from && sw.said) { // Graveyard's AI does not remember Ambush's conversation — only this line
    const msgs = askStore(key).msgs;
    msgs.push({role: "note", content: "↪ from " + sw.fromTitle + ": " + sw.said, t: Date.now(), m: "handoff", mode: appMode()});
    askSave(msgs, undefined, key);
  }
  S.askCarry = null;
  if (sw.then) {
    if (askDraftText(key)) S.askCarry = {key, text: sw.then}; // sending would wipe the draft: the chip waits for a tap
    else { S.askHopKey = key; await askSend(sw.then); return; } // askSend renders its own bubbles
  }
  if (asksheet.classList.contains("on")) askRender();
}
export function askRun({msgs, text, sp, messages, jobId, live, key}) { return aiRun(askHost(), {msgs, text, scope: sp, messages, jobId, live, key}); } // one exchange (tool rounds inside); the pending marker outlives a dropped connection
export function askTerminalSend(text) { return aiTerminalSend(askHost(), text); } // the Terminal tab: queue it for the Mac's Claude Code; the reply comes back as a note
export async function askSend(carried) { // carried: open_song's carried-over request (or its chip), sent as the user's words — the box, its draft and the pending shots are left alone
  const typed = carried !== undefined ? String(carried).trim() : askinput.value.trim();
  if ((!typed && (carried !== undefined || !S.askShotPending.length)) || S.askBusy || !S.song) return;
  if (carried === undefined) { S.askSwitch = null; S.askCarry = null; S.askHopKey = null; } // a typed message: whatever the last one queued is over
  const text = carried !== undefined ? typed : askShotOutgoing(typed);
  if (S.askTerminal) return askTerminalSend(text);
  if (cfg().aiBackend !== "browser" && !(await aiHostOk(aiUrl()))) { askstatus.textContent = "not sent"; return; }
  const sp = askSpan();
  S.askSpanFrozen = sp;
  document.getElementById("askspan").textContent = askSpanLabel(sp);
  // the push itself stays here, not in the library's aiSendText: the mode
  // tag on it is this app's SAFETY rule (2026-10-01), and its test reads
  // this line from the source
  const budget = askBudget();
  const msgs = askLoad();
  const ctx = askContext(sp, budget); // stages this turn's "New since your last message:" watermark (askNewSinceLines) — askFinish commits it, askFail drops it
  const messages = askBuildMessages(msgs, text, ctx, budget);
  const jobId = askJobId();
  msgs.push({role: "user", content: text, t: Date.now(), at: askSpanLabel(sp), pending: jobId, mode: appMode()}); // saved NOW: closing the sheet or leaving the app cannot lose it
  askSave(msgs);
  if (carried === undefined) {
    askMicOff(); // a live 🎤 would write its transcript back into the box after we clear it
    askinput.value = "";
    askShotClearAll();
    askDraftClear();
    askGrow();
    askComposing(false);
  }
  askBubble("user", askShotDisplayText(text));
  const live = askBubble("ai", "…");
  live.dataset.job = jobId; // askResume finds THIS bubble by job, never "the last ai bubble"
  await askRun({msgs, text, sp, messages, jobId, live, key: askStoreKey()});
}
export function askRepending(key, from, to) { return aiRepending(askHost(), key, from, to); } // a tool round continues under a new job id: the marker follows it
export function askResumeSoon(ms) { aiResumeSoon(askHost(), ms); }
// Resume: every pending question gets looked at, in every chat, not just
// the open one — and a look that cannot happen now (busy, backgrounded, the
// Mac unreachable) is rescheduled, never dropped. Only a real answer from
// the bridge ("no such job", "error") fails a question.
export function askResume() { return aiResume(askHost()); }
