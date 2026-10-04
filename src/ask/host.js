import { S } from "../state.js";
import { askBadgeOff } from "./bridge.js";
import { askNoteSeen } from "./bridge.js";
import { askTabsApply } from "./bridge.js";
import { askInboxPoll } from "./bridge.js";
import { askStatusPoll } from "./bridge.js";
import { askSessionRefresh } from "./bridge.js";
import { askRenderImpl as askRender } from "./sheet.js";
import { askRefresh } from "./sheet.js";
import { askModeButtons } from "./sheet.js";
import { asksheet } from "./sheet.js";
import { wmLayoutAll } from "../ui/wm.js";
import { askGrow } from "./sheet.js";
import { askScrollEnd } from "./sheet.js";
import { askFocusIfKeyboard } from "./sheet.js";
import { deployActive } from "./bridge.js";
import { deployAskTap } from "./bridge.js";
import { cfg } from "../platform/storage.js";
import { askSessionName } from "./bridge.js";
import { askStoreKey } from "./sheet.js";
import { askEpochNote } from "./context.js";
import { appConfirmImpl as appConfirm } from "../ui/chrome.js";
import { aiUrl } from "./backend.js";
import { aiHeaders } from "./backend.js";
import { askMaxErrId } from "./bridge.js";
import { askMaxStatusId } from "./bridge.js";
import { askstatus } from "./sheet.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { askSys } from "./context.js";
import { askContext } from "./context.js";
import { askTerminalContext } from "./context.js";
import { askBuildMessages } from "./context.js";
import { askBudget } from "./context.js";
import { askEstimate } from "./context.js";
import { askSpan } from "./context.js";
import { askToolsNow } from "./bridge.js";
import { askModelName } from "./bridge.js";
import { askJobsSupported } from "./bridge.js";
import { askComposing } from "./bridge.js";
import { askRunTool } from "./tools.js";
import { aiProvider } from "./backend.js";
import { appMode } from "../platform/mode.js";
import { askBubble } from "./sheet.js";
import { askClock } from "./sheet.js";
import { askShowThinking } from "./sheet.js";
import { askFillBubble } from "./sheet.js";
import { asklog } from "./sheet.js";
import { askinput } from "./sheet.js";
import { askMicOff } from "./sheet.js";
import { askDraftClear } from "./sheet.js";
import { askShotClearAll } from "./shots.js";
import { askShotDisplayText } from "./shots.js";
import { askLanded } from "./client.js";
import { askSend } from "./client.js";
import { askShotRestore } from "./shots.js";
import { askCopyText } from "../ui/sheets.js";
import { askTermModelsLoad } from "./bridge.js";
import { askStatusRender } from "./bridge.js";
import { askStripContext } from "./context.js";
import { askTabLabel } from "./sheet.js";
import { askPlaceholder } from "./sheet.js";
import { askGreeting } from "./sheet.js";
import { askMsgTag } from "./sheet.js";
import { askNoteLabel } from "./sheet.js";
import { askRenderEarlier } from "./sheet.js";

// The host adapter (docs/ai-library-plan.md §2): the ONE object the AI
// library (vendor/ai/web) sees of this app. Every app-specific thing — the
// settings' field names, the storage keys (today's exact keys: no migration,
// no lost chats), the consent sheet's wording, and from step 5 on the
// Learning law itself (system prompt, context, tools) — enters here and
// nowhere else; the library knows no "mode". Built lazily, once: a top-level
// object literal would reference layer-4 imports at evaluation time (check.mjs
// rule 4), and every arrow below reads its import binding live, so a test
// that rebinds `aiUrl`/`appConfirm` by name is seen by the library too.
export function askHost() {
  if (S.aiHost) return S.aiHost;
  S.aiHost = {
    state: S, // the library keeps its runtime fields here (askModelCache, askCaps, askSeenPending, askSentPending, askJobsCache, …) — the same bag the tests read by bare name
    // today's exact storage keys — the chat stores (ff1roll-ask-<song> / -general / -terminal and their -seen/-sentctx/-epoch cursors), the drafts, the watermarks
    keys: {hosts: "ff1roll-ai-hosts", apiKey: "ff1roll-aikey", store: "ff1roll-ask-", seenMax: "ff1roll-ask-seen-max", inboxSeen: "ff1roll-ask-inbox-seen", draft: "ff1roll-askdraft-", mode: "ff1roll-ask-mode"},
    logCursor: () => ({err: askMaxErrId(), status: askMaxStatusId()}), // the newest ⚠/status line ids — what a landed send marks "seen up to"
    status: t => { askstatus.textContent = t; },
    onStoreChanged: () => updateSongBtn(), // the ● follows unsaved chat too
    settings: () => { const c = cfg(); return {url: c.aiUrl, model: c.aiModel, backend: c.aiBackend, browserModel: c.aiBrowserModel, window: c.aiWindow}; },
    apiKey: () => localStorage.getItem("ff1roll-aikey"),
    url: () => aiUrl(), // the library's fetches go through THIS app's delegates, so a test's `aiUrl = () => …` reaches every one of them
    headers: () => aiHeaders(),
    sessionName: () => askSessionName(), // one bridge session per song, split by mode (context.js owns the `#normal` suffix)
    chatKey: () => askStoreKey(),
    onSessionEpoch: epoch => askEpochNote(askStoreKey(), epoch), // the bridge's x-nr-session-epoch header (docs/ask-token-plan.md #4/#7)
    confirmHost: host => appConfirm("Send your notes to " + host + "?", // per-host consent: the payload is his annotations + notes
      "Every message sends this song's notes and your annotations to " + host + ". Only do this for a machine you trust. Asked once per machine.",
      "Send", "Cancel"),
    // ---- the exchange (step 5): what the model is told, which tools it has,
    // which earlier turns it may see — the Learning law lives in these three
    // (askSys / askContext / askBuildMessages), the library only carries them
    systemPrompt: () => askSys(),
    context: (sp, budget) => askContext(sp, budget),
    terminalContext: () => askTerminalContext(),
    buildMessages: (msgs, text, ctx, budget) => askBuildMessages(msgs, text, ctx, budget), // a different mode's turn never enters this request's history
    budget: () => askBudget(),
    estimate: (system, messages) => askEstimate(system, messages),
    tools: () => askToolsNow(),
    runTool: (name, args) => askRunTool(name, args),
    modelName: () => askModelName(),
    messageMeta: () => ({mode: appMode()}), // every stored message carries the mode it was pushed in (SAFETY 2026-10-01); the library stores it, never reads it
    backend: () => aiProvider(), // through this app's delegates, so a test's `aiProvider = …` / `askJobsSupported = …` reaches the loop
    jobsSupported: () => askJobsSupported(),
    canResume: () => !!S.song,
    resumeScope: () => S.askSpanFrozen || askSpan(),
    // the window: bubbles, the live stream, the box, the badge
    bubble: (role, text, meta) => askBubble(role, (meta && meta.terminal ? askClock(meta.t) : "") + askShotDisplayText(text)),
    showThinking: (live, raw) => askShowThinking(live, raw),
    fillBubble: (live, text) => askFillBubble(live, text),
    liveBubble: jobId => [...asklog.querySelectorAll(".askmsg.ai")].find(d => d.dataset.job === jobId) || null,
    busy: on => { document.getElementById("askstop").style.display = on ? "" : "none"; document.getElementById("asksend").disabled = on; },
    afterSend: () => { askMicOff(); askinput.value = ""; askShotClearAll(); askDraftClear(); askGrow(); askComposing(false); }, // a live 🎤 would write its transcript back into the box after we clear it
    restoreInput: text => { askinput.value = text; askGrow(); },
    render: () => askRender(),
    poll: () => { askInboxPoll(); askStatusPoll(); },
    landed: (key, failed) => askLanded(key, failed),
    text: key => ASK_TEXT[key], // this app's wording where it differs from the library's neutral default (it says "the Mac")
    // ---- the window (step 6, adopt mode: the library binds index.html's own
    // #ask* ids — AI_WINDOW_IDS are exactly this app's, no override needed)
    copyText: (text, btn) => askCopyText(text, btn),
    onDraftChange: has => askComposing(has), // the bridge's "composing" notice: a build may wait
    shotPaths: () => S.askShotPending.map(s => s.path),
    restoreShots: paths => askShotRestore(paths),
    tabLabel: () => askTabLabel(),
    placeholder: tab => askPlaceholder(tab),
    onTabsChanged: () => { askTermModelsLoad(); askStatusRender(); }, // the ⌨ model pickers and the "Now:" strip follow the tab
    onTabPicked: () => { askRender(); askRefresh(); askSessionRefresh(); },
    greeting: tab => askGreeting(tab),
    renderEarlier: div => askRenderEarlier(div),
    msgTag: m => askMsgTag(m), // which turns are "another mode's" is decided here (askMsgMode/appMode), never in the library
    noteLabel: from => askNoteLabel(from),
    showText: content => askStripContext(content),
    send: () => askSend(),
  };
  return S.aiHost;
}
export const ASK_TEXT = {
  streamCut: "the live stream was cut (Safari does that when the app leaves the screen) — the reply keeps cooking on the Mac; checking every few seconds",
  checkingDelivery: "… (checking whether the Mac got it)",
  errorHint: "check File → Settings… → AI model, and Test",
  jobGone: "the Mac no longer has this reply (its bridge restarted, or the question never reached it) — ask again",
  unreachableRetry: "… (can't reach the Mac right now — the reply is kept there; retrying)",
};

export function openAsk() {
  if (!S.song) return;
  askBadgeOff();
  askNoteSeen();
  askTabsApply(); // Settings may have changed the backend since
  askInboxPoll();
  askStatusPoll();
  askSessionRefresh();
  askRender();
  askRefresh();
  askModeButtons(); // sets the placeholder for the mode (and the "Now:" strip)
  asksheet.classList.add("on");
  wmLayoutAll(); // reopens docked if it was docked (open-items.md "a real windowing system")
  askGrow();
  askScrollEnd(); // the log was drawn while the sheet was display:none (scrollHeight 0), so every open landed at the top (Josh, 2026-09-27)
  askFocusIfKeyboard();
}
export function askBtnTap() { if (deployActive()) return deployAskTap(); openAsk(); } // a countdown or a hold in effect: the install sheet, not the chat
