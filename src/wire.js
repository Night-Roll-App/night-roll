// src/wire.js (layer 5) — docs/split-phase2-plan.md §1 M1/§4. The
// composition root: the only place a lower layer's upcall port (src/
// hooks.js) binds to its higher-layer body. installHooks() runs before any
// init*(), as app.js's (later main.js's) FIRST top-level statement — every
// port throws `hook X not installed` if called before this.
import { S } from "./state.js";
import {
  setInfoImpl, logErrImpl, logDebugImpl, appConfirmImpl, updateJobsBtnImpl,
  drawImpl, playbackFrameImpl, clampViewImpl, updateSongBtnImpl, updateSyncBtnImpl,
  srAnnounceImpl, scheduleBackupFlushImpl,
} from "./ui/chrome.js";
import { buildScoreModelImpl } from "./render/score.js";
import { songTitleOfImpl } from "./ask/context.js";
import { setAnchorBQImpl, lassoedAnnosImpl } from "./ui/note-editor.js";
import { drumStepImpl } from "./render/roll.js";
import {
  fitViewImpl, renderTrackbarImpl, updateEditBtnVisImpl, updateChipBtnImpl,
  updateSubtitleImpl, askRenderImpl, finalizeNotesImpl, recFinishImpl, albumAdvanceImpl,
  updateSongMetaImpl,
} from "./app.js";

export function installHooks() {
  Object.assign(S.hooks, {
    setInfo: (...a) => setInfoImpl(...a),
    logErr: (...a) => logErrImpl(...a),
    logDebug: (...a) => logDebugImpl(...a),
    appConfirm: (...a) => appConfirmImpl(...a),
    updateJobsBtn: (...a) => updateJobsBtnImpl(...a),
    // docs/split-phase2-plan.md step 3
    draw: (...a) => drawImpl(...a),
    playbackFrame: (...a) => playbackFrameImpl(...a),
    clampView: (...a) => clampViewImpl(...a),
    fitView: (...a) => fitViewImpl(...a),
    buildScoreModel: (...a) => buildScoreModelImpl(...a),
    renderTrackbar: (...a) => renderTrackbarImpl(...a),
    updateEditBtnVis: (...a) => updateEditBtnVisImpl(...a),
    updateChipBtn: (...a) => updateChipBtnImpl(...a),
    updateSongBtn: (...a) => updateSongBtnImpl(...a),
    updateSyncBtn: (...a) => updateSyncBtnImpl(...a),
    updateSubtitle: (...a) => updateSubtitleImpl(...a),
    askRender: (...a) => askRenderImpl(...a),
    finalizeNotes: (...a) => finalizeNotesImpl(...a),
    recFinish: (...a) => recFinishImpl(...a),
    albumAdvance: (...a) => albumAdvanceImpl(...a),
    songTitleOf: (...a) => songTitleOfImpl(...a),
    // docs/split-phase2-plan.md step 4b
    srAnnounce: (...a) => srAnnounceImpl(...a),
    scheduleBackupFlush: (...a) => scheduleBackupFlushImpl(...a),
    setAnchorBQ: (...a) => setAnchorBQImpl(...a),
    // docs/split-phase2-plan.md step 5
    updateSongMeta: (...a) => updateSongMetaImpl(...a),
    lassoedAnnos: (...a) => lassoedAnnosImpl(...a),
    drumStep: (...a) => drumStepImpl(...a),
  });
}
