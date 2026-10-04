// src/hooks.js (layer 0) — docs/split-phase2-plan.md §1 M1. Upcall ports: a
// one-line synchronous forwarder per name, so a lower layer can call a
// higher layer's body without an illegal import. The real body (renamed
// `XImpl`) lives in whichever module actually needs it; src/wire.js's
// installHooks() is the only place that fills `S.hooks`. Every existing
// call site keeps calling the ORIGINAL bare name — only the import line at
// each call site changes, to import the port from here instead of the
// (former) home module — so a port never touches moved code, just where it
// resolves from. check.mjs rule 10 enforces this file's shape: nothing here
// but the `S` import, the `need` helper, and forwarders of this exact AST
// shape.
import { S } from "./state.js";
const need = n => { throw new Error(`hook ${n} not installed`); }; // fail loud
export function setInfo(...a) { return (S.hooks.setInfo || need("setInfo"))(...a); }
export function logErr(...a) { return (S.hooks.logErr || need("logErr"))(...a); }
export function logDebug(...a) { return (S.hooks.logDebug || need("logDebug"))(...a); }
export function appConfirm(...a) { return (S.hooks.appConfirm || need("appConfirm"))(...a); }
export function updateJobsBtn(...a) { return (S.hooks.updateJobsBtn || need("updateJobsBtn"))(...a); }
// docs/split-phase2-plan.md step 3: render/chrome/session upcalls + songTitleOf (step 2's blocker).
export function draw(...a) { return (S.hooks.draw || need("draw"))(...a); }
export function playbackFrame(...a) { return (S.hooks.playbackFrame || need("playbackFrame"))(...a); }
export function clampView(...a) { return (S.hooks.clampView || need("clampView"))(...a); }
export function fitView(...a) { return (S.hooks.fitView || need("fitView"))(...a); }
export function buildScoreModel(...a) { return (S.hooks.buildScoreModel || need("buildScoreModel"))(...a); }
export function renderTrackbar(...a) { return (S.hooks.renderTrackbar || need("renderTrackbar"))(...a); }
export function updateEditBtnVis(...a) { return (S.hooks.updateEditBtnVis || need("updateEditBtnVis"))(...a); }
export function updateChipBtn(...a) { return (S.hooks.updateChipBtn || need("updateChipBtn"))(...a); }
export function updateSongBtn(...a) { return (S.hooks.updateSongBtn || need("updateSongBtn"))(...a); }
export function updateSyncBtn(...a) { return (S.hooks.updateSyncBtn || need("updateSyncBtn"))(...a); }
export function updateSubtitle(...a) { return (S.hooks.updateSubtitle || need("updateSubtitle"))(...a); }
export function askRender(...a) { return (S.hooks.askRender || need("askRender"))(...a); }
export function finalizeNotes(...a) { return (S.hooks.finalizeNotes || need("finalizeNotes"))(...a); }
export function recFinish(...a) { return (S.hooks.recFinish || need("recFinish"))(...a); }
export function albumAdvance(...a) { return (S.hooks.albumAdvance || need("albumAdvance"))(...a); }
export function songTitleOf(...a) { return (S.hooks.songTitleOf || need("songTitleOf"))(...a); }
// docs/split-phase2-plan.md step 4b: the 5 blockers step 4 found behind
// play/stop's call into the screen-reader strip, the off-device backup
// timer, and the anchor-quantize setter — genuinely layer-4 bodies, ports
// not re-homes (see each's own commit for the "why a port" writeup).
export function srAnnounce(...a) { return (S.hooks.srAnnounce || need("srAnnounce"))(...a); }
export function scheduleBackupFlush(...a) { return (S.hooks.scheduleBackupFlush || need("scheduleBackupFlush"))(...a); }
export function setAnchorBQ(...a) { return (S.hooks.setAnchorBQ || need("setAnchorBQ"))(...a); }
// docs/split-phase2-plan.md step 5: the three upcalls the model/gen clusters
// make that have no layer-2 home — the bpm label (saveEdits), the lasso's
// pixel-box annotation query (cut/delete/copy), the kit-lane row walk
// (nudge on a drum track) — bodies stay in ui/chrome, ui/note-editor,
// render/roll.
export function updateSongMeta(...a) { return (S.hooks.updateSongMeta || need("updateSongMeta"))(...a); }
export function lassoedAnnos(...a) { return (S.hooks.lassoedAnnos || need("lassoedAnnos"))(...a); }
export function drumStep(...a) { return (S.hooks.drumStep || need("drumStep"))(...a); }
