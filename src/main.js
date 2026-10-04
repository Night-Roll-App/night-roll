// src/main.js — entry point (docs/split-plan.md §1/§4 step 15, docs/
// split-phase2-plan.md §4). Wiring only: install the upcall ports, run every
// module's init*() in the ORIGINAL top-level order of the one-file app
// (tests/boot-order.test.mjs holds that order, statement by statement),
// then boot(). The devtools mirror is gated so production never pays for it
// (§3.4). Nothing else in src/ has a top-level side effect (check.mjs rule 4).
import { installHooks } from "./wire.js";
import { exposeGlobals } from "./devtools.js";
import { initBase1, initBase2 } from "./platform/base.js";
import { initMode1 } from "./platform/mode.js";
import { initSw1 } from "./platform/sw.js";
import { initRoll1 } from "./render/roll.js";
import { initEngine1, initEngine2 } from "./audio/engine.js";
import { initTransport1 } from "./audio/transport.js";
import { initGestures1, initGestures2 } from "./input/gestures.js";
import { initRecord1 } from "./input/record.js";
import { initKeyboard1, initKeyboard2 } from "./input/keyboard.js";
import {
  initChrome1, initChrome2, initChrome3, initChrome4, initChrome5, initChrome6, initChrome7, initChrome8,
  initChrome9, initChrome10, initChrome11, initChrome12, initChrome13, initChrome14, initChrome15, initChrome16,
} from "./ui/chrome.js";
import { initTrackbar1 } from "./ui/trackbar.js";
import { initVoiceMenu1 } from "./ui/voice-menu.js";
import { initNotes1, initNotes2, initNotes3 } from "./ui/notes.js";
import { initNoteEditor1, initNoteEditor2, initNoteEditor3, initNoteEditor4, initNoteEditor5, initNoteEditor6 } from "./ui/note-editor.js";
import { initSheets1, initSheets2, initSheets3, initSheets4, initSheets5, initSheets6, initSheets7, initSheets8, initSheets9 } from "./ui/sheets.js";
import { initWm1, initWm2 } from "./ui/wm.js";
import { initVellane1 } from "./ui/vellane.js";
import { initPerf1, initPerf2 } from "./ui/perf.js";
import { initHub1 } from "./import/hub.js";
import { initCapture1 } from "./import/capture.js";
import { initPublish1, initPublish2, initPublish3 } from "./sync/publish.js";
import { initBackend1 } from "./ask/backend.js";
import { initSheet1, initSheet2, initSheet3 } from "./ask/sheet.js";
import { initBridge1, initBridge2 } from "./ask/bridge.js";
import { initAlbum1 } from "./session/album.js";
import { initBoot1, boot } from "./session/boot.js";

installHooks(); // docs/split-phase2-plan.md §1 M1: before any init*() / top-level effect — every S.hooks port throws if called first
initBase1();
initBoot1();
initMode1();
initPerf1();
initRoll1();
initBase2();
initChrome2();
initTrackbar1();
initNoteEditor1();
initSheets1();
initChrome3();
initGestures1();
initEngine1();
initPerf2();
initEngine2();
initChrome4();
initVoiceMenu1();
initTransport1();
initAlbum1();
initChrome5();
initChrome1();
initChrome6();
initNotes1();
initSheets2();
initGestures2();
initNotes2();
initChrome7();
initNotes3();
initChrome8();
initNoteEditor2();
initHub1();
initNoteEditor3();
initChrome9();
initRecord1();
initKeyboard1();
initSheets3();
initChrome10();
initKeyboard2();
initVellane1();
initNoteEditor4();
initPublish1();
initSheets4();
initChrome11();
initPublish2();
initChrome12();
initCapture1();
initChrome13();
initNoteEditor5();
initSheets5();
initNoteEditor6();
initChrome14();
initBackend1();
initSheet1();
initChrome15();
initBridge1();
initSheet2();
initBridge2();
initWm1();
initSheet3();
initSheets6();
initWm2();
initSheets7();
initPublish3();
initSheets8();
initChrome16();
initSw1();
initSheets9();
boot();

if (typeof window !== "undefined" && window.__NR_EXPOSE) exposeGlobals();
