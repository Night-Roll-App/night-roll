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
    state: S, // the library keeps its runtime fields here (askModelCache, askCaps, …) — the same bag the tests read by bare name
    keys: {hosts: "ff1roll-ai-hosts", apiKey: "ff1roll-aikey"},
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
  };
  return S.aiHost;
}

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
