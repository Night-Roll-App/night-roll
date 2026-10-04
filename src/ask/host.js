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
