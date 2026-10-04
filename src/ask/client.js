import { askPartial } from "./sheet.js";
import { askStoreKey } from "./sheet.js";
import { askSentCommit } from "./context.js";
import { askSeenCommit } from "./bridge.js";
import { askStore } from "./bridge.js";
import { askPendingIndex } from "./bridge.js";
import { askModelName } from "./bridge.js";
import { appMode } from "../platform/mode.js";
import { askSave } from "./bridge.js";
import { askSentDrop } from "./context.js";
import { askSeenDrop } from "./bridge.js";
import { askSessionRefresh } from "./bridge.js";
import { asksheet } from "./sheet.js";
import { askRenderImpl as askRender } from "./sheet.js";
import { songTitleOfImpl as songTitleOf } from "./context.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { askBudget } from "./context.js";
import { askEstimate } from "./context.js";
import { askSys } from "./context.js";
import { askstatus } from "./sheet.js";
import { S } from "../state.js";
import { askJobsSupported } from "./bridge.js";
import { aiProvider } from "./backend.js";
import { askShowThinking } from "./sheet.js";
import { askToolsNow } from "./bridge.js";
import { askRunTool } from "./tools.js";
import { askFillBubble } from "./sheet.js";
import { ASK_TERMINAL_KEY } from "./bridge.js";
import { askTerminalContext } from "./context.js";
import { askMicOff } from "./sheet.js";
import { askinput } from "./sheet.js";
import { askShotClearAll } from "./shots.js";
import { askDraftClear } from "./sheet.js";
import { askGrow } from "./sheet.js";
import { askComposing } from "./bridge.js";
import { askBubble } from "./sheet.js";
import { askClock } from "./sheet.js";
import { askShotDisplayText } from "./shots.js";
import { aiUrl } from "./backend.js";
import { aiHeaders } from "./backend.js";
import { askInboxPoll } from "./bridge.js";
import { askStatusPoll } from "./bridge.js";
import { askShotOutgoing } from "./shots.js";
import { cfg } from "../platform/storage.js";
import { aiHostOk } from "./backend.js";
import { askSpan } from "./context.js";
import { askSpanLabel } from "./context.js";
import { askLoad } from "./bridge.js";
import { askContext } from "./context.js";
import { askBuildMessages } from "./context.js";
import { askJobId } from "./bridge.js";
import { askPendingAll } from "./bridge.js";
import { asklog } from "./sheet.js";

// The store key rides with the job: the reply belongs to the song that asked,
// even if another song is open by the time it lands (Josh, 2026-09-26: "scroll
// away … work on a song … get a notification").
export function askFinish(jobId, text, key) { // the reply for a pending question landed: store it, drop the marker
  delete askPartial[jobId];
  key = key || askStoreKey();
  askSentCommit(key); // this context reached (and was acted on by) the bridge session — its cache entries are now confirmed
  askSeenCommit(key); // same: the "New since" lines it carried are now confirmed seen by the bridge
  const msgs = askStore(key).msgs;
  const i = askPendingIndex(msgs, jobId);
  if (i < 0) return;
  delete msgs[i].pending;
  msgs.splice(i + 1, 0, {role: "assistant", content: text, m: askModelName(), mode: appMode()});
  askSave(msgs, undefined, key);
  askLanded(key, false);
}
export function askFail(jobId, note, key) { // no reply will come: keep the question, say why
  delete askPartial[jobId];
  key = key || askStoreKey();
  askSentDrop(key); // never confirmed landed — the full sections go again next time, not a stand-in for content the bridge may never have gotten
  askSeenDrop(key); // same: never mark a "new since" line seen that was never actually delivered
  const msgs = askStore(key).msgs;
  const i = askPendingIndex(msgs, jobId);
  if (i < 0) return;
  delete msgs[i].pending;
  msgs.splice(i + 1, 0, {role: "assistant", content: "⚠ " + note, m: askModelName(), mode: appMode()});
  askSave(msgs, undefined, key);
  askLanded(key, true);
}
// A reply landed. Sheet open on that song: redraw it (the live bubble may be
// a stale node — the sheet was closed and reopened mid-run). Otherwise the
// footer gets a gold ✦ badge, the ⚠ way: it stays until tapped, and the info
// strip says so once. Tapping opens Ask.
export function askLanded(key, failed) {
  askSessionRefresh(); // a turn just landed on the bridge: its usage/turns grew
  if (asksheet.classList.contains("on") && key === askStoreKey()) { askRender(); return; }
  const b = document.getElementById("askreplybtn");
  b.style.display = "";
  const other = key !== askStoreKey() ? " in " + songTitleOf(key.replace(/^ff1roll-ask-/, "")) : "";
  setInfo((failed ? "✦ AI: no reply" : "✦ AI replied") + other + " — tap ✦ reply to read it");
}
export async function askRun({msgs, text, sp, messages, jobId, live, key}) { // one exchange (tool rounds inside); the pending marker outlives a dropped connection
  const budget = askBudget();
  const est = askEstimate(askSys(), messages);
  askstatus.textContent = "thinking… (~" + (est >= 1000 ? (est / 1000).toFixed(1) + "k" : est) + " of " + Math.round(budget.win / 1000) + "k" + (budget.small ? ", small window — raise it in Settings if the server allows" : "") + ")";
  const ctl = typeof AbortController === "function" ? new AbortController() : {abort() {}, signal: undefined};
  S.askBusy = ctl;
  document.getElementById("askstop").style.display = "";
  document.getElementById("asksend").disabled = true;
  const jobs = await askJobsSupported(); // true / false / null = unreachable this instant (the POST decides)
  let cur = jobId, delivered = false; // cur: the job id the marker carries now (tool rounds move it); delivered: the Mac took the question
  try {
    let out = await aiProvider().chat({system: askSys(), messages, signal: ctl.signal, onDelta: raw => askShowThinking(live, raw), onStatus: t => { askstatus.textContent = t; }, tools: askToolsNow(), onTool: askRunTool, job: jobs !== false ? jobId : undefined,
      onOpen: () => { delivered = true; },
      onRound: id => { askRepending(key, cur, id); cur = id; if (live) live.dataset.job = id; },
      onNote: n => { if (!live.textContent || /^…/.test(live.textContent)) live.textContent = "… (" + n + ")"; askstatus.textContent = "working: " + n; }});
    out = out.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    if (!out) out = "(no reply — try rephrasing)";
    askFillBubble(live, out);
    askFinish(cur, out, key);
    askstatus.textContent = "";
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    const partial = live.textContent && !/^…/.test(live.textContent) ? live.textContent : ""; // a step note ("… (reading x)") is not an answer
    const http = !!(err && /^HTTP /.test(err.message));
    if (aborted) { if (partial) askFinish(cur, partial, key); else askFail(cur, "stopped", key); askstatus.textContent = "stopped"; if (!partial) { live.classList.add("err"); live.textContent = "⚠ stopped"; } }
    else if (jobs !== false && !http && delivered) { // the connection died, not the job: the answer is still cooking on the server
      askstatus.textContent = "the live stream was cut (Safari does that when the app leaves the screen) — the reply keeps cooking on the Mac; checking every few seconds";
      live.textContent = "… (still working — reopen or come back to see it)";
      askResumeSoon(3000);
    } else if (jobs !== false && !http && !delivered) { // no sign it arrived — but a relaunch cuts the stream before the first byte even when the Mac HAS it (Josh, 2026-09-29): keep it pending and ask the bridge (askResume: found → carries on, 404 → really not delivered)
      live.textContent = "… (checking whether the Mac got it)";
      askstatus.textContent = "";
      askResumeSoon(2000);
    } else { live.classList.add("err"); live.textContent = "⚠ " + err.message + " — check File → Settings… → AI model, and Test"; askFail(cur, err.message, key); askstatus.textContent = ""; }
  } finally {
    S.askBusy = null;
    document.getElementById("askstop").style.display = "none";
    document.getElementById("asksend").disabled = false;
  }
}
export async function askTerminalSend(text) { // the Terminal tab: queue it for the Mac's Claude Code; the reply comes back as a note
  const key = ASK_TERMINAL_KEY, msgs = askStore(key).msgs;
  const ctx = askTerminalContext(); // stages this turn's seen-watermark (askNewSinceLines) — committed below only if the POST actually lands
  const bodyText = ctx ? "<context>\n" + ctx + "\n</context>\n\n" + text : text;
  msgs.push({role: "user", content: text, t: Date.now()}); // stored/shown WITHOUT the context block, like every other chat (askStripContext strips it back out of history elsewhere; the terminal's own store never carries it at all)
  askSave(msgs, undefined, key);
  askMicOff(); // a live 🎤 writes its transcript back after we clear the box (Josh, 2026-09-30: the text stayed after Send)
  askinput.value = ""; askShotClearAll(); askDraftClear(); askGrow(); askComposing(false);
  askBubble("user", askClock(Date.now()) + askShotDisplayText(text));
  askstatus.textContent = "sending to the terminal…";
  try {
    const r = await fetch(aiUrl() + "/v1/terminal", {method: "POST", headers: aiHeaders(), body: JSON.stringify({text: bodyText})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status);
    askSeenCommit(key); // the bridge actually got it: this turn's "new since" lines are now confirmed seen
    askstatus.textContent = j.now && j.now.text ? "sent — the terminal is working: " + j.now.text : "sent — the terminal will answer here";
    S.askTerminalFast = Date.now() + 15 * 60000; // its answer shouldn't wait for the 60 s poll
    if (!S.askTerminalTimer) S.askTerminalTimer = setInterval(() => {
      if (Date.now() > S.askTerminalFast) { clearInterval(S.askTerminalTimer); S.askTerminalTimer = null; return; }
      if (!document.hidden) { askInboxPoll(); askStatusPoll(); }
    }, 5000);
  } catch (err) { // not queued: say so and give the words back, never lose them
    askSeenDrop(key); // never delivered: the "new since" lines it carried are still unseen
    msgs.pop(); askSave(msgs, undefined, key); askRender();
    askinput.value = text; askGrow();
    askstatus.textContent = "⚠ not sent — the Mac's bridge didn't answer (" + err.message + "); your message is back in the box";
  }
}
export async function askSend() {
  const typed = askinput.value.trim();
  if ((!typed && !S.askShotPending.length) || S.askBusy || !S.song) return;
  const text = askShotOutgoing(typed);
  if (S.askTerminal) return askTerminalSend(text);
  if (cfg().aiBackend !== "browser" && !(await aiHostOk(aiUrl()))) { askstatus.textContent = "not sent"; return; }
  const sp = askSpan();
  S.askSpanFrozen = sp;
  document.getElementById("askspan").textContent = askSpanLabel(sp);
  const budget = askBudget();
  const msgs = askLoad();
  const ctx = askContext(sp, budget); // stages this turn's "New since your last message:" watermark (askNewSinceLines) — askFinish commits it, askFail drops it
  const messages = askBuildMessages(msgs, text, ctx, budget);
  const jobId = askJobId();
  msgs.push({role: "user", content: text, t: Date.now(), at: askSpanLabel(sp), pending: jobId, mode: appMode()}); // saved NOW: closing the sheet or leaving the app cannot lose it
  askSave(msgs);
  askMicOff(); // a live 🎤 would write its transcript back into the box after we clear it
  askinput.value = "";
  askShotClearAll();
  askDraftClear();
  askGrow();
  askComposing(false);
  askBubble("user", askShotDisplayText(text));
  const live = askBubble("ai", "…");
  live.dataset.job = jobId; // askResume finds THIS bubble by job, never "the last ai bubble"
  await askRun({msgs, text, sp, messages, jobId, live, key: askStoreKey()});
}
export function askRepending(key, from, to) { // a tool round continues under a new job id: the marker follows it (re-read, never a stale array)
  const msgs = askStore(key).msgs, i = askPendingIndex(msgs, from);
  if (i < 0) return false;
  msgs[i].pending = to;
  askSave(msgs, undefined, key);
  return true;
}
export function askResumeSoon(ms) { clearTimeout(S.askResumeTimer); S.askResumeTimer = setTimeout(() => { S.askResumeTimer = null; askResume(); }, ms); }
// Resume (2026-09-26 audit): every pending question gets looked at, in every
// chat, not just the open one — and a look that cannot happen now (busy,
// backgrounded, the Mac unreachable) is rescheduled, never dropped. Only
// a real answer from the bridge ("no such job", "error") fails a question.
export async function askResume() {
  const all = askPendingAll();
  if (!all.length) return;
  if (S.askBusy || !S.song || (typeof document.hidden === "boolean" && document.hidden)) { askResumeSoon(3000); return; }
  const liveFor = jobId => [...asklog.querySelectorAll(".askmsg.ai")].find(d => d.dataset.job === jobId) || null;
  const sup = await askJobsSupported();
  if (sup === null) { // unreachable right now: the reply is kept on the Mac; say so where the bubble is, and look again
    for (const p of all) { const live = p.key === askStoreKey() ? liveFor(p.jobId) : null; if (live) live.textContent = "… (can't reach the Mac right now — the reply is kept there; retrying)"; }
    askResumeSoon(5000); return;
  }
  if (!sup) { for (const p of all) askFail(p.jobId, "no reply came back (the connection dropped) — ask again", p.key); return; }
  let again = false;
  for (const p of all) {
    const mine = p.key === askStoreKey(), live = mine ? liveFor(p.jobId) : null;
    let j;
    try { const r = await fetch(aiUrl() + "/v1/jobs/" + encodeURIComponent(p.jobId), {headers: aiHeaders()}); if (r.status === 404) { askFail(p.jobId, "the Mac no longer has this reply (its bridge restarted, or the question never reached it) — ask again", p.key); continue; } j = await r.json(); }
    catch (err) { again = true; continue; }
    const step = ((j.notes || []).slice(-1)[0] || "working").replace(/^using /, "").replace(/…\s*$/, "");
    if (j.status === "running") { if (j.text) askPartial[p.jobId] = j.text; if (live) live.textContent = j.text ? j.text : "… (" + step + ")"; if (mine) askstatus.textContent = "working: " + step; again = true; continue; }
    if (mine) askstatus.textContent = ""; // the "stream was cut" line is over once the reply lands or fails
    if (j.status === "error") { askFail(p.jobId, j.error || "the job failed", p.key); continue; }
    const calls = j.result && j.result.tool_calls;
    if (!calls || !calls.length) { askFinish(p.jobId, (j.text || "").trim() || "(no reply)", p.key); continue; }
    if (!mine) { again = true; continue; } // a tool round acts on the OPEN song: it continues when that chat is opened again
    // the job ended in a tool call: run it here, then continue the exchange as a new job
    const msgs = askStore(p.key).msgs, i = askPendingIndex(msgs, p.jobId);
    if (i < 0) continue;
    const pend = msgs[i];
    const sp = S.askSpanFrozen || askSpan();
    const budget = askBudget();
    const history = msgs.slice(0, i);
    const messages = askBuildMessages(history, pend.content, askContext(sp, budget), budget);
    messages.push({role: "assistant", content: "", tool_calls: calls});
    for (const c of calls) {
      let args = {}; try { args = JSON.parse(c.function.arguments || "{}"); } catch (err) { args = {}; }
      let result; try { result = await askRunTool(c.function.name, args); } catch (err) { result = {error: String(err.message || err)}; }
      messages.push({role: "tool", tool_call_id: c.id, content: typeof result === "string" ? result : JSON.stringify(result)});
    }
    const nextId = askJobId();
    askRepending(p.key, p.jobId, nextId);
    await askRun({msgs, text: pend.content, sp, messages, jobId: nextId, live: live || askBubble("ai", "…"), key: p.key});
    askResumeSoon(500); return; // one exchange at a time; the others get their look after it
  }
  if (again) askResumeSoon(3000);
}
