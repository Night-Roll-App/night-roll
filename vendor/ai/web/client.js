// web/client.js — one exchange with a backend, end to end: the question is
// stored FIRST with a pending marker (closing the window or losing the
// connection cannot lose it), the backend streams into a live bubble, tool
// rounds run the host's tools and continue under a new job id, the reply
// is spliced in after its question when it lands, and a question whose
// stream was cut is looked up on the bridge (bridge-client.js's job
// protocol) until a real answer — found, failed, or never there — settles
// it. The terminal send is the other path: no model call, the text is
// queued on the bridge and the answer comes back as a note.
//
// The library knows nothing of what the context says or which tools exist
// — the host builds the system prompt, the context block and the message
// list, names the tools and runs them, and tags every stored message with
// whatever it needs (host.messageMeta: fields merged into each message the
// library pushes). Host, beyond the earlier modules':
//   systemPrompt() · context(scope, budget) · terminalContext() · budget()
//   estimate(system, messages) · buildMessages(msgs, text, ctx, budget)
//   tools() · runTool(name, args) · modelName() · messageMeta()
//   backend() (default aiPickBackend) · jobsSupported() (default aiJobsSupported)
//   keys.terminal (the terminal chat's store key) · canResume() · resumeScope()
//   bubble(role, text, meta) → an element-like {textContent, dataset, classList}
//   showThinking(live, raw) · fillBubble(live, text) · liveBubble(jobId)
//   busy(on) · afterSend() · restoreInput(text) · render() · poll() · landed(key, failed)
//   text(key, ...args) → optional wording override (see AI_TEXT)
import { aiPickBackend } from "./backends.js";
import { aiStoreGet, aiStoreSave, aiPendingIndex, aiPendingAll, aiJobId, aiSeenCommit, aiSeenDrop, aiChatKey } from "./store.js";
import { aiSentCommit, aiSentDrop } from "./ctx-cache.js";
import { aiJobsSupported, aiJobGet, aiTerminalPost } from "./bridge-client.js";

export const AI_TEXT = { // every sentence the loop shows; a host overrides any by key
  noReply: () => "(no reply — try rephrasing)",
  stopped: () => "stopped",
  streamCut: () => "the live stream was cut (a backgrounded tab does that) — the reply keeps cooking on the server; checking every few seconds",
  stillWorking: () => "… (still working — reopen or come back to see it)",
  checkingDelivery: () => "… (checking whether the server got it)",
  errorHint: () => "check the AI settings",
  connectionDropped: () => "no reply came back (the connection dropped) — ask again",
  jobGone: () => "the bridge no longer has this reply (it restarted, or the question never reached it) — ask again",
  unreachableRetry: () => "… (can't reach the bridge right now — the reply is kept there; retrying)",
  terminalSending: () => "sending to the terminal…",
  terminalSentWorking: now => "sent — the terminal is working: " + now,
  terminalSent: () => "sent — the terminal will answer here",
  terminalNotSent: msg => "⚠ not sent — the bridge didn't answer (" + msg + "); your message is back in the box",
  stillWriting: () => "… (still writing)",
  pendingHere: () => "… (still working — the reply lands here)",
};
export function aiText(host, key, ...args) { const t = host.text ? host.text(key, ...args) : undefined; return t != null ? t : AI_TEXT[key](...args); }
export function aiPartial(host) { return host.state.askPartial || (host.state.askPartial = {}); } // job id → the words streamed so far: a reopened window redraws from storage, which only holds the marker
function aiMeta(host) { return host.messageMeta ? host.messageMeta() : {}; }
function aiBackendOf(host) { return host.backend ? host.backend() : aiPickBackend(host); }
function aiJobsOf(host) { return host.jobsSupported ? host.jobsSupported() : aiJobsSupported(host); }
function aiNotice(host, t) { if (host.status) host.status(t); }
function aiHidden() { return typeof document !== "undefined" && typeof document.hidden === "boolean" && document.hidden; }

// The store key rides with the job: the reply belongs to the chat that asked,
// even if another is open by the time it lands.
export function aiFinish(host, jobId, text, key) { // the reply for a pending question landed: store it, drop the marker
  delete aiPartial(host)[jobId];
  key = aiChatKey(host, key);
  aiSentCommit(host, key); // this context reached (and was acted on by) the session — its cache entries are now confirmed
  aiSeenCommit(host, key); // same: the "new since" lines it carried are now confirmed seen
  const msgs = aiStoreGet(host, key).msgs;
  const i = aiPendingIndex(msgs, jobId);
  if (i < 0) return;
  delete msgs[i].pending;
  msgs.splice(i + 1, 0, {role: "assistant", content: text, m: host.modelName(), ...aiMeta(host)});
  aiStoreSave(host, msgs, undefined, key);
  host.landed(key, false);
}
export function aiFail(host, jobId, note, key) { // no reply will come: keep the question, say why
  delete aiPartial(host)[jobId];
  key = aiChatKey(host, key);
  aiSentDrop(host, key); // never confirmed landed — the full sections go again next time
  aiSeenDrop(host, key); // same: never mark a "new since" line seen that was never actually delivered
  const msgs = aiStoreGet(host, key).msgs;
  const i = aiPendingIndex(msgs, jobId);
  if (i < 0) return;
  delete msgs[i].pending;
  msgs.splice(i + 1, 0, {role: "assistant", content: "⚠ " + note, m: host.modelName(), ...aiMeta(host)});
  aiStoreSave(host, msgs, undefined, key);
  host.landed(key, true);
}
export async function aiRun(host, {msgs, text, scope, messages, jobId, live, key}) { // one exchange (tool rounds inside); the pending marker outlives a dropped connection
  const budget = host.budget();
  const est = host.estimate(host.systemPrompt(), messages);
  aiNotice(host, "thinking… (~" + (est >= 1000 ? (est / 1000).toFixed(1) + "k" : est) + " of " + Math.round(budget.win / 1000) + "k" + (budget.small ? ", small window — raise it in Settings if the server allows" : "") + ")");
  const ctl = typeof AbortController === "function" ? new AbortController() : {abort() {}, signal: undefined};
  host.state.askBusy = ctl;
  if (host.busy) host.busy(true);
  const jobs = await aiJobsOf(host); // true / false / null = unreachable this instant (the POST decides)
  let cur = jobId, delivered = false; // cur: the job id the marker carries now (tool rounds move it); delivered: the server took the question
  try {
    let out = await aiBackendOf(host).chat({system: host.systemPrompt(), messages, signal: ctl.signal, onDelta: raw => host.showThinking(live, raw), onStatus: t => aiNotice(host, t), tools: host.tools(), onTool: (name, args) => host.runTool(name, args), job: jobs !== false ? jobId : undefined,
      onOpen: () => { delivered = true; },
      onRound: id => { aiRepending(host, key, cur, id); cur = id; if (live) live.dataset.job = id; },
      onNote: n => { if (!live.textContent || /^…/.test(live.textContent)) live.textContent = "… (" + n + ")"; aiNotice(host, "working: " + n); }});
    out = out.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    if (!out) out = aiText(host, "noReply");
    host.fillBubble(live, out);
    aiFinish(host, cur, out, key);
    aiNotice(host, "");
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    const partial = live.textContent && !/^…/.test(live.textContent) ? live.textContent : ""; // a step note ("… (reading x)") is not an answer
    const http = !!(err && /^HTTP /.test(err.message));
    if (aborted) { if (partial) aiFinish(host, cur, partial, key); else aiFail(host, cur, aiText(host, "stopped"), key); aiNotice(host, aiText(host, "stopped")); if (!partial) { live.classList.add("err"); live.textContent = "⚠ " + aiText(host, "stopped"); } }
    else if (jobs !== false && !http && delivered) { // the connection died, not the job: the answer is still cooking on the server
      aiNotice(host, aiText(host, "streamCut"));
      live.textContent = aiText(host, "stillWorking");
      aiResumeSoon(host, 3000);
    } else if (jobs !== false && !http && !delivered) { // no sign it arrived — but a relaunch cuts the stream before the first byte even when the server HAS it: keep it pending and ask (aiResume: found → carries on, 404 → really not delivered)
      live.textContent = aiText(host, "checkingDelivery");
      aiNotice(host, "");
      aiResumeSoon(host, 2000);
    } else { live.classList.add("err"); live.textContent = "⚠ " + err.message + " — " + aiText(host, "errorHint"); aiFail(host, cur, err.message, key); aiNotice(host, ""); }
  } finally {
    host.state.askBusy = null;
    if (host.busy) host.busy(false);
  }
}
export async function aiSendText(host, text, opts) { // the chat send, after the host's own gating: stored now, asked now
  const scope = opts && opts.scope, at = opts && opts.at;
  const budget = host.budget();
  const key = host.chatKey();
  const msgs = aiStoreGet(host, key).msgs;
  const ctx = host.context(scope, budget); // may stage this turn's "new since" watermark — aiFinish commits it, aiFail drops it
  const messages = host.buildMessages(msgs, text, ctx, budget);
  const jobId = aiJobId(host);
  const t = Date.now();
  msgs.push({role: "user", content: text, t, at, pending: jobId, ...aiMeta(host)}); // saved NOW: closing the window or leaving the app cannot lose it
  aiStoreSave(host, msgs, undefined, key);
  host.afterSend();
  host.bubble("user", text, {t});
  const live = host.bubble("ai", "…", {t});
  live.dataset.job = jobId; // aiResume finds THIS bubble by job, never "the last ai bubble"
  await aiRun(host, {msgs, text, scope, messages, jobId, live, key});
}
export async function aiTerminalSend(host, text) { // queue it for the bridge's terminal session; the reply comes back as a note
  const key = host.keys.terminal, msgs = aiStoreGet(host, key).msgs;
  const ctx = host.terminalContext(); // may stage this turn's seen-watermark — committed below only if the POST actually lands
  const bodyText = ctx ? "<context>\n" + ctx + "\n</context>\n\n" + text : text;
  const t = Date.now();
  msgs.push({role: "user", content: text, t}); // stored/shown WITHOUT the context block, like every other chat
  aiStoreSave(host, msgs, undefined, key);
  host.afterSend();
  host.bubble("user", text, {t, terminal: true});
  aiNotice(host, aiText(host, "terminalSending"));
  try {
    const r = await aiTerminalPost(host, bodyText);
    const j = r.body || {};
    if (!r.ok) throw new Error(j.error && j.error.message || "HTTP " + r.status);
    aiSeenCommit(host, key); // the bridge actually got it: this turn's "new since" lines are now confirmed seen
    aiNotice(host, j.now && j.now.text ? aiText(host, "terminalSentWorking", j.now.text) : aiText(host, "terminalSent"));
    const st = host.state;
    st.askTerminalFast = Date.now() + 15 * 60000; // its answer shouldn't wait for the slow poll
    if (!st.askTerminalTimer) st.askTerminalTimer = setInterval(() => {
      if (Date.now() > st.askTerminalFast) { clearInterval(st.askTerminalTimer); st.askTerminalTimer = null; return; }
      if (!aiHidden()) host.poll();
    }, 5000);
  } catch (err) { // not queued: say so and give the words back, never lose them
    aiSeenDrop(host, key); // never delivered: the "new since" lines it carried are still unseen
    msgs.pop(); aiStoreSave(host, msgs, undefined, key); host.render();
    host.restoreInput(text);
    aiNotice(host, aiText(host, "terminalNotSent", err.message));
  }
}
export function aiRepending(host, key, from, to) { // a tool round continues under a new job id: the marker follows it (re-read, never a stale array)
  const msgs = aiStoreGet(host, key).msgs, i = aiPendingIndex(msgs, from);
  if (i < 0) return false;
  msgs[i].pending = to;
  aiStoreSave(host, msgs, undefined, key);
  return true;
}
export function aiResumeSoon(host, ms) { const st = host.state; clearTimeout(st.askResumeTimer); st.askResumeTimer = setTimeout(() => { st.askResumeTimer = null; aiResume(host); }, ms); }
// Resume: every pending question gets looked at, in every chat, not just
// the open one — and a look that cannot happen now (busy, backgrounded, the
// bridge unreachable) is rescheduled, never dropped. Only a real answer
// from the bridge ("no such job", "error") fails a question.
export async function aiResume(host) {
  const all = aiPendingAll(host);
  if (!all.length) return;
  if (host.state.askBusy || !host.canResume() || aiHidden()) { aiResumeSoon(host, 3000); return; }
  const cur = host.chatKey();
  const liveFor = jobId => (host.liveBubble ? host.liveBubble(jobId) : null);
  const sup = await aiJobsOf(host);
  if (sup === null) { // unreachable right now: the reply is kept on the bridge; say so where the bubble is, and look again
    for (const p of all) { const live = p.key === cur ? liveFor(p.jobId) : null; if (live) live.textContent = aiText(host, "unreachableRetry"); }
    aiResumeSoon(host, 5000); return;
  }
  if (!sup) { for (const p of all) aiFail(host, p.jobId, aiText(host, "connectionDropped"), p.key); return; }
  let again = false;
  for (const p of all) {
    const mine = p.key === cur, live = mine ? liveFor(p.jobId) : null;
    let j;
    try { const r = await aiJobGet(host, p.jobId); if (r.status === 404) { aiFail(host, p.jobId, aiText(host, "jobGone"), p.key); continue; } j = r.job || {}; }
    catch (err) { again = true; continue; }
    const step = ((j.notes || []).slice(-1)[0] || "working").replace(/^using /, "").replace(/…\s*$/, "");
    if (j.status === "running") { if (j.text) aiPartial(host)[p.jobId] = j.text; if (live) live.textContent = j.text ? j.text : "… (" + step + ")"; if (mine) aiNotice(host, "working: " + step); again = true; continue; }
    if (mine) aiNotice(host, ""); // the "stream was cut" line is over once the reply lands or fails
    if (j.status === "error") { aiFail(host, p.jobId, j.error || "the job failed", p.key); continue; }
    const calls = j.result && j.result.tool_calls;
    if (!calls || !calls.length) { aiFinish(host, p.jobId, (j.text || "").trim() || "(no reply)", p.key); continue; }
    if (!mine) { again = true; continue; } // a tool round acts on the OPEN chat's subject: it continues when that chat is opened again
    // the job ended in a tool call: run it here, then continue the exchange as a new job
    const msgs = aiStoreGet(host, p.key).msgs, i = aiPendingIndex(msgs, p.jobId);
    if (i < 0) continue;
    const pend = msgs[i];
    const scope = host.resumeScope();
    const budget = host.budget();
    const history = msgs.slice(0, i);
    const messages = host.buildMessages(history, pend.content, host.context(scope, budget), budget);
    messages.push({role: "assistant", content: "", tool_calls: calls});
    for (const c of calls) {
      let args = {}; try { args = JSON.parse(c.function.arguments || "{}"); } catch (err) { args = {}; }
      let result; try { result = await host.runTool(c.function.name, args); } catch (err) { result = {error: String(err.message || err)}; }
      messages.push({role: "tool", tool_call_id: c.id, content: typeof result === "string" ? result : JSON.stringify(result)});
    }
    const nextId = aiJobId(host);
    aiRepending(host, p.key, p.jobId, nextId);
    await aiRun(host, {msgs, text: pend.content, scope, messages, jobId: nextId, live: live || host.bubble("ai", "…", {}), key: p.key});
    aiResumeSoon(host, 500); return; // one exchange at a time; the others get their look after it
  }
  if (again) aiResumeSoon(host, 3000);
}
