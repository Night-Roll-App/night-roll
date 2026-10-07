// src/state.js — every piece of mutable app state (docs/split-plan.md §2.1).
// No imports: this file evaluates first, so every S field exists before any
// app code runs (removes the boot-path TDZ class of bug for state).
export const S = {
  // docs/split-phase2-plan.md §1 M1: upcall ports' real bodies, installed by
  // src/wire.js's installHooks() before any init*() runs. src/hooks.js's
  // forwarders read this; never written anywhere else.
  hooks: {},
  APP_BASE: (() => { // let: the vm tests pin it (no location there)
  try { return new URL(".", location.href).href; } catch (e) { return ""; }
})(),
  APP_MODE: null,
  vwOpenGroup: null,
  helpLoad: null, // ui/notes.js ensureHelpLoaded: the one in-flight/settled fetch of help/help.html, null until Help first opens (and again after a failed load)
  fileOpenRecentOpen: false,
  CATALOG: {},
  kitShowAll: localStorage.getItem("ff1roll-kitshowall") === "1",
  _kitSlots: null,
  _laneTop: null,
  laneOverride: null,
  _autoColorCache: { key: "", colors: [] },
  playRate: 1,
  song: null,
  songKey: null,
  songViewRedraw: null,
  catalogRefreshedAt: 0,
  trackState: [],
  selTrack: 0,
  selNote: null,
  mode: null,
  pencilDur: 0.5,
  gridDiv: null,
  gridAnchor: {b: 1, q: 1},
  _has32: null,
  pencilVel: 80,
  pencilAcc: "key",
  editUndo: [],
  view: { x: 0, y: 0, pxq: 56, rowH: 13 },
  playing: false,
  playT0: 0,
  playOffset: 0,
  schedIdx: 0,
  schedEvents: [],
  raf: 0,
  schedTimer: 0,
  loopSeg: null,
  loopPass: 0,
  audio: null,
  master: null,
  trackGains: [],
  trackPanners: [],
  mixerMeterEls: [],
  mixerMasterMeterEl: null,
  mixerAnalysers: [],
  mixerMeterBufs: [],
  mixerMasterAnalyser: null,
  mixerMasterMeterBuf: null,
  mixerMeterRaf: 0,
  mixerMeterRunning: false,
  mixerMeterLastT: 0,
  mixerStripEls: [],
  mixerDrag: null,
  songEndTick: 0,
  rollnotes: [],
  rollnotesReadOnly: false,
  rollnotesLockReason: null,
  rollnotesOrigin: null,
  playCursor: 0,
  editingNote: null,
  rangeSel: null,
  tapBand: {n: null, t: 0},
  lassoMode: false,
  instOpen: false,
  fallOn: false,
  subOn: localStorage.getItem("ff1roll-sub") !== "0",
  lassoRect: null,
  cmp: null,
  multiSel: [],
  multiSelKey: new Set(),
  multiSelSf: 0,
  keyRegions: [],
  declaredTs: null,
  previewSf: null,
  RULER_W: null,
  RULER_H: null,
  STRIP_Y: null, // top of the playhead strip (old RULER_H meaning: ruler + section/chord/analysis rows + audio strip — no strip). RULER_H = STRIP_Y + STRIP_H, see app.js

  secMaxDepth: 0,
  analysisOn: false,
  analysisBands: {chords: [], key: null},
  analysisChordLane: null,
  analysisKeyLane: null,
  _analysisTimer: null,
  analyzeTarget: null,
  sectionColors: {},
  PMIN: 24,
  PMAX: 96,
  chopS: 0,
  chopE: null,
  appliedChop: null,
  lastSubtitle: null,
  _idbQueue: Promise.resolve(),
  hlOn: localStorage.getItem("ff1roll-hl") === "1",
  lcdCache: "",
  loadGen: 0,
  songLoading: false,
  pendingPlay: false,
  trackExpand: false,
  sceneCanvas: null,
  sceneValid: false,
  sceneVX: -1,
  sceneVY: -1,
  phLastX: null,
  challengeSec: null,
  selOctaves: localStorage.getItem("ff1roll-seloct") !== "0",
  tracksGhost: null,
  selClip: null,
  noteClipboard: null,
  annoClipboard: [],
  lassoAnno: null,
  dupPending: null,
  insUnit: "bars",
  infoCopyText: null,
  infoFull: "tap a note",
  jobs: [],
  pubJobShown: null,
  logSeq: 0,
  srLastText: "",
  srLastAt: -1e9,
  srTimer: null,
  statusHistory: [],
  statusSeq: 0,
  drag: null,
  pinch: null,
  followFree: false,
  lastTapEnd: 0,
  ntypePicked: false, // the + Note dialog's type was chosen (chip, preset, existing note): no guessing from the text (Josh #153)
  ntypeGuess: null, // {timer, from: the text a guess moved out of the text box}
  spanTapAt: 0, // the last tap inside the ruler span — a second within 350 ms deletes it (Josh #150)
  masterVol: 1,
  clockProbe: null,
  wakeInFlight: false,
  sfOfflineCtx: null,
  sfPreloadPending: false,
  pulse25: null,
  pulse12: null,
  organWave: null,
  pluckCache: {},
  voiceMenuTi: -1,
  voiceMenuRenderToken: 0,
  voiceMenuGroup: null,
  voiceMenuGameVault: null,
  voiceMenuGameSys: null,
  voiceMenuGameSub: null,
  voiceMenuSf2Slug: null,
  instPlaySync: null,
  exporting: false,
  playGateTimer: null,
  playGateSince: 0,
  playGateShown: false,
  chipWorker: null,
  chipPreviewReq: 0,
  audioSrcs: [],
  autoAlignFiles: new Set(),
  stretchWorker: null,
  stretchJobId: 0,
  albumRun: null,
  albumEndAbs: null,
  albumFading: false,
  editOn: false,
  listenerMode: false,
  viewMode: localStorage.getItem("ff1roll-view") || "roll",
  scoreModel: null,
  scoreCache: new Map(),
  scoreZoom: 0,
  scoreIntro: null,
  currentPath: null,
  _keyEstCache: null,
  metGain: null,
  metTimer: 0,
  metNext: 0,
  metIdx: 0,
  metLastWhen: -1,
  metTaps: [],
  cofSf: 0,
  cofRot: 0,
  cofDragRot: null,
  chordRoot: 0,
  chordQual: "maj",
  chordOct: 4,
  chordInsDur: 1,
  mvFromFilter: null,
  cofPtr: null,
  findPc: null,
  challengeCopy: "",
  editrowHidden: false,
  footerHidden: false,
  fitReadlineScheduled: false,
  pendingMidis: null,
  audioReplaceTi: null,
  pencilNV: 8,
  pencilMod: 1,
  instTab: "piano",
  instFlash: null,
  instPtrOn: false,
  instLastP: null,
  instInfoTimer: 0,
  // the on-screen keyboard (src/ui/piano.js + app.js's instrument block):
  // scroll is a white-key index, null = home (the song's lowest octave)
  instMode: "play",
  instLock: false,
  instSustain: false,
  instScroll: null,
  instPtrs: new Map(),   // pointerId → {x, y, x0, y0, dead, moved, panX}
  instGesture: null,     // "two" (chord that may become a scroll) | "pan2"
  instPanX: 0,
  instPanX0: 0,
  instHeld: new Map(),   // pitch → {o, g}: voices ringing under Sustain
  instChevrons: null,    // {left: pitch|null, right: pitch|null}, set by drawPiano
  recording: false,
  recTake: [],
  recPending: new Map(),
  // Capture MIDI (2026-10-04, DAW shortlist F3): the last ~60 s of notes
  // played on the keys / MIDI-in while NOT recording — {at, off, p, vel,
  // key}, wall-clock ms. RAM only: a take is not song state until "Keep
  // that" writes it, and setSong empties it.
  captureBuf: [],
  vwVel: false,  // the velocity lane (ui/vellane.js), device pref ff1roll-vel-open
  velDrag: null, // {pid, items, pre, v0, v, hit, moved}: a stalk drag in flight
  midiReady: false,
  midiAccess: null,
  midiErr: null,
  nativeMidiNames: [],
  micRec: null,
  micPrev: null,
  micBtn: null,
  rebarArmed: false,
  albumOrderPref: localStorage.getItem("ff1roll-albumorder") === "az" ? "az" : "game",
  pubCheckRunning: false,
  dropUpOpen: null,
  instPlayModule: null,
  sf2PlayModule: null,
  instNav: {sys: null, game: null, sub: null},
  instNavToken: 0,
  nsfSess: null,
  dpPattern: null,
  drTakes: [],
  drActive: -1,
  bsTakes: [],
  bsActive: -1,
  ptTarget: 0,
  editRedo: [],
  editBtnCache: "",
  askBusy: null,
  askPartial: {}, // job id → the words streamed so far (the AI library keeps it; sheet.js aliases it)
  aiHost: null, // the AI library's host adapter, built once by askHost() (src/ask/host.js)
  annotateBusy: false, // ✦ Annotate this song: one run at a time (src/ask/annotate.js)
  annotateLast: null, // the last run's {written, skipped, merged, windows, items} / {error} / {cancelled}
  askModelCache: null,
  askSpanFrozen: null,
  aiWebllm: null,
  aiEngine: null,
  aiEngineModel: null,
  askSentPending: {},
  askGeneral: false,
  askTerminal: false,
  askSwitch: null, // open_song (docs/ai-parity.md §4): {path, title, then, from, said} — queued by the action, run by askLanded once the reply that asked has landed
  askCarry: null, // a carried-over request waiting for a tap (the new chat had an unsent draft): {key, text}
  askHopKey: null, // the chat whose last message was carried over by open_song — it may not open another song (one hop only)
  askCaps: {bridge: false, terminal: false, sessions: false},
  askSeenPending: {},
  askInboxNo: "",
  askInboxTimer: null,
  askStatusNow: null,
  askStatusRecent: [],
  askStatusNo: "",
  askStatusRecentOpen: false,
  askStatusCommits: null,
  askStatusCommitsAt: 0,
  askQuota: null,
  backupFlushTimer: null,
  deployAt: 0,
  deployTimer: null,
  deployHeld: false,
  askSessionCache: {},
  askShotPending: [],
  askDraftKey: null,
  askDraftTimer: null,
  askComposingAt: 0,
  askComposingOn: false,
  askJobsCache: null,
  askTerminalFast: 0,
  askTerminalTimer: null,
  askResumeTimer: null,
  wm: null,
  wmOpeners: {},
  wmRestored: false,
  wmSideMembers: {left: [], right: []},
  wmBottomEls: [],
  filesMirrorT: 0,
  syncReturnToList: false,
  // the Analysis sheet (src/ui/study-sheet.js): the one open answer box
  // ({item, songKey, ta} — songKey so an album run can't land it in the next
  // song), the last Check coverage line (one-shot: cleared on open and on
  // song change), and which folds are open (device-session only, never stored)
  studyDraft: null,
  studyCheck: "",
  studyFolds: {},
  studyChordsOpen: false,
  studyBarNotesOpen: false,
  perfRec: null, // ?perf=1 HUD (step 7, docs/split-plan.md §2.4): null when idle,
  // else the in-flight recording session object. prof() below reads this to
  // decide whether a wrapped call accrues into perfTotal — was a
  // closure-local `rec` inside the old inline wrap()'s IIFE, which could not
  // survive the split (prof() runs from whichever module defines the
  // profiled function, not from app.js's HUD code).
  perfAcct: {},  // name -> ms this second, live even when not recording (was wrap()'s local `acct`)
  perfTotal: {}, // name -> {ms, calls} for the CURRENT recording session only (was wrap()'s local `total`)
};
// prof(name, fn) — step 7 (docs/split-plan.md §2.4 + §4 step 7). The
// self-profiler used to instrument functions from the OUTSIDE, after boot,
// by wrapping globalThis[name] for a fixed name list (NIGHT-ROLL.md "Perf
// HUD + session recorder"): a module's top-level function is a binding, not
// a globalThis property, so that stopped finding anything the moment a
// named function moved out of the inline script (0b) — attribution went
// quietly empty, no error. Fixed at the root instead of patched around:
// each profiled function wraps ITSELF at its own definition site
// (`name = prof("name", name);`, right after `function name(...) {...}`),
// wherever that definition now lives, so the split can keep moving function
// bodies between files without re-breaking this. Lives here, not next to
// PERF_FLAGS (platform/base.js), because EVERY layer must be able to call
// it — including layer-0 modules (e.g. midi/parse.js's secToTick) — and
// platform/ is layer 1: a layer-0 module may not import it (check.mjs rule
// 5). state.js is the one file every layer may import (layer 0, no
// imports of its own), so the query-string gate below is a small,
// deliberate duplicate of PERF_FLAGS's own hand-rolled parse (same
// vm-sandbox-safety shape), not a shared import.
const PERF_ON = (() => {
  try {
    const q = String(location.search || "").replace(/^\?/, "");
    for (const kv of q.split("&")) {
      const i = kv.indexOf("=");
      if ((i < 0 ? kv : kv.slice(0, i)) === "perf") return !!(i < 0 ? "" : decodeURIComponent(kv.slice(i + 1)));
    }
  } catch (err) { /* vm test sandbox: no location — perf is always off there */ }
  return false;
})();
export function prof(name, fn) {
  if (!PERF_ON) return fn; // off: `fn` goes back untouched — no closure, no timing, no cost
  return function (...args) {
    const t0 = performance.now();
    try { return fn.apply(this, args); }
    finally {
      const d = performance.now() - t0;
      S.perfAcct[name] = (S.perfAcct[name] || 0) + d;
      if (S.perfRec) {
        const e = S.perfTotal[name] || (S.perfTotal[name] = { ms: 0, calls: 0 });
        e.ms += d; e.calls++;
      }
    }
  };
}
