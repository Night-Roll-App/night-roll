// src/wire.js (layer 5) — docs/split-phase2-plan.md §1 M1/§4. The
// composition root: the only place a lower layer's upcall port (src/
// hooks.js) binds to its higher-layer body. installHooks() runs before any
// init*(), as app.js's (later main.js's) FIRST top-level statement — every
// port throws `hook X not installed` if called before this.
import { S } from "./state.js";
import {
  setInfoImpl, logErrImpl, logDebugImpl, appConfirmImpl, updateJobsBtnImpl,
} from "./ui/chrome.js";

export function installHooks() {
  Object.assign(S.hooks, {
    setInfo: (...a) => setInfoImpl(...a),
    logErr: (...a) => logErrImpl(...a),
    logDebug: (...a) => logDebugImpl(...a),
    appConfirm: (...a) => appConfirmImpl(...a),
    updateJobsBtn: (...a) => updateJobsBtnImpl(...a),
  });
}
