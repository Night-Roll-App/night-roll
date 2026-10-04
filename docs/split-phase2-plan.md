# Module split, phase 2: the untangle pass

Josh, 2026-10-04 (Terminal #103): "How come the file is still 15,000 lines
is there a bunch more split to do". Phase 1 (docs/split-plan.md steps
0a–14) moved code VERBATIM; what remains in src/app.js is held by call
cycles and layer rules. Phase 2 may change code — behavior-preserving and
test-backed — to break them. Designed by an Opus planning agent against
module-split after step 14; this file is the spec.

## Why app.js is still ~15,000 lines

Measured read-only with tools/split/scope.mjs: ~963 import lines; 462
top-level declarations (~9,865 lines); 326 top-level non-declaration
statements — listener blocks, IIFEs, the ?perf HUD, boot (~3,408 lines);
the rest footer/comments/blanks.

- One strongly-connected component of 77 declarations (~2,640 lines):
  finalizeNotes ↔ renderTrackbar ↔ openVoiceMenu ↔ buildVoiceMenu ↔
  play/stop ↔ play-gate ↔ loadSong ↔ setSong ↔ saveEdits ↔ askRun ↔
  renderSyncPending ↔ … About 200 more depend on it, and no real module may
  import app.js.
- What holds it together is a small set of upcalls (lower layer calling
  higher): audio/model/platform → setInfo, logErr, logDebug, appConfirm,
  updateJobsBtn, draw, playbackFrame, clampView, fitView, renderTrackbar,
  updateEditBtnVis, updateChipBtn, updateSongBtn, updateSyncBtn,
  updateSubtitle, askRender; audio stop → recFinish (input); play →
  albumAdvance → loadSong; model/gen/audio → finalizeNotes (orchestration:
  audio preload, gains, renderTrackbar, render constants).
- Phase 1 misfiled some things upward to get them out at all:
  computeSongEnd (ui/sheets), saveDraft/draftRead (ui/chrome), jobsNotify
  (ui/sheets), songTitleOf (ask/context).

## 1. Cycle-breaking mechanisms (four, nothing else)

**M1. Upcall ports — `src/hooks.js` (layer 0), bodies on `S.hooks`.** A port
is a one-line forwarder that keeps the original name; call sites keep their
code, only the import line changes (moves stay verbatim-checkable; every
test's `run("setInfo = …")` rebinds the port and all importers see it). The
real body is renamed `XImpl` in its home module. Rule: a name may be a port
only if its body lives at a higher layer than every port caller. Dissolves
phase 1's "permanent" blockers (ensureAudio/resumeAudio/rebuildAudio; CHIPS
needs no table split — its `typeof logErr === "function"` guard stays
byte-identical; idbDraftPut; the render hub's callers; finalizeNotes's
callers). Not an event bus: implicit order, lost return values (appConfirm
returns a Promise), broken spy tests — a port is a 1:1 synchronous forward,
identical behavior by construction.

```js
// src/state.js (literal initial value)
  hooks: {},

// src/hooks.js — layer 0
import { S } from "./state.js";
const need = n => { throw new Error(`hook ${n} not installed`); }; // fail loud
export function setInfo(...a) { return (S.hooks.setInfo || need("setInfo"))(...a); }
export function logErr(...a)  { return (S.hooks.logErr  || need("logErr"))(...a); }
export function draw(...a)    { return (S.hooks.draw    || need("draw"))(...a); }

// src/ui/chrome.js — body renamed; internal callers import the port
import { draw, setInfo } from "../hooks.js";
export function drawImpl() { S.sceneValid = false; rangeSelPersist(); … }
drawImpl = prof("draw", drawImpl);          // perf label unchanged

// src/wire.js — layer 5, the composition root's only logic
import { S } from "./state.js";
import { drawImpl, setInfoImpl, logErrImpl } from "./ui/chrome.js";
export function installHooks() {
  Object.assign(S.hooks, {
    draw: (...a) => drawImpl(...a),          // live binding: survives re-wraps
    setInfo: (...a) => setInfoImpl(...a),
    logErr: (...a) => logErrImpl(...a),
  });
}
// app.js: `installHooks();` is its FIRST top-level statement (later main.js line 1)
```

A port can exist while its body is still in app.js (wire.js, layer 5,
imports it from there), so hook commits never move code.

**M2. Re-home to the layer the calls need (plain moves).** New `src/session/`
at LAYERS[4] for song-lifecycle orchestration (finalizeNotes, loadSong/
loadSongInner/setSong/openDraftDoc/openDraft, fitView, album playlist,
saveSongAs/fork/revert/moveComposition, boot). ui/controls.js → layer 0 next
to ui/icons.js (imports only icons), so setPlayBtn/setControl are reachable
from audio without a port. Misfiled things back down once ports exist:
computeSongEnd (+ pure clip geometry clipLen/clipEndTick/songHasAudio) →
model/song.js; saveDraft/draftRead/draftWrite/localDraftTracks/filesMirror*
→ model/versions.js; jobsNotify → model/jobs.js; songTitleOf/songWhereLabel
→ model.

**M3. `init<Module><N>()` for the 326 top-level statements**, original order
(§2.2 as written); contiguous same-module runs become one init (~40 calls in
main.js). Each run travels with its cluster in its own commit right after
the cluster's move.

**M4. Tooling first** (gaps from Deviations 9–14): move.mjs refuses
self-imports, carries `X = prof("X", X)` with its declaration, inserts
before the e2e footer marker (step 14's silent data-loss bug), gains
`--init` (wraps top-level statements, leaves a call stub). check.mjs rule 9:
every import specifier actually exports the name; rule 10: hooks.js holds
forwarders only, each port has exactly one `XImpl`, impl layer above every
caller's layer, no top-level initializer references a port. verbatim.mjs
tolerates init header/`}`/stub lines and gains `--hook X,Y`. New
`tools/split/blockers.mjs <names> --to <file>`: transitive app.js deps +
illegal-layer imports.

## 2. Ordered steps (each one commit, each green; H = hook, M = move, L = listener/init)

| # | Kind | What | app.js lines out (est.) |
|---|---|---|---|
| 0 | tool | M4, blockers.mjs, rule 9/10 tests | 0 |
| 1 | H | hooks.js + wire.js; ports setInfo, logErr, logDebug, appConfirm, updateJobsBtn; controls.js → layer 0; LAYERS gains session, hooks.js, wire.js | ~0 |
| 2 | M | ensureAudio/resumeAudio/rebuildAudio → audio/engine; metStart → metronome; CHIPS, sonySeqCapture, psfInflater, PSX_SOUNDING_ON, chipExt, chipRender, chipEstimateTracks, chipRenderInWorker, chipCleanupAfterFailure, chipSource, chipVaultFile, chipModules → audio/chip; chipStreamOpen* → chip-stream; scheduleGameNote/gameVoiceWarn/gameNote*/resolveVoiceInstrument/gameLibSync/sf2Sync → audio/voices; idbDraftPut → platform/storage; jobsNotify → model/jobs | ~1,100 |
| 3 | H | ports draw, playbackFrame, clampView, fitView, buildScoreModel, renderTrackbar, updateEditBtnVis, updateChipBtn, updateSongBtn, updateSyncBtn, updateSubtitle, askRender, finalizeNotes, recFinish, albumAdvance | ~0 |
| 4 | M | play, stop, playGate*, buildSchedule, renderSongOffline, audioChaseNow → audio/transport; scheduleNote, previewNote, sf/game preload+wait → audio/voices; scheduleClip, stretchEnsure(All), applyAudioDirs, audioEnsureFile, applyBeatMap, setSongTempo, writeClips, setClipDir, splitClipAt, deleteClip → audio/clips | ~1,150 |
| 5 | M | saveEdits/loadEdits/foldOldOverlay/retireOldOverlay → model/edits; selEditApply + selection mutators, insertTime/deleteTime, ridealongChordBands, transposeTrack, closeGap → model/selection; scheduleAnalysisRecompute/adopt* → gen/analysis; drGenerate/bsGenerate/applyTake → gen/*; M2's misfiled ones down out of ui/* | ~1,400 |
| 6 | M | session/song.js: finalizeNotes, bakeMeter, bakeTempos, loadNotes, updateSongMeta, fitView, loadSong*, setSong, openDraft*; session/album.js: albumStart/PlayIdx/Advance…; session/files.js: saveSongAs, openSaveForm, forkCurrentSong, revertSongToRepo, moveComposition, renameLocalKeys | ~1,000 |
| 7 | M | voice menu/pickers/buildClipControls → ui/voice-menu; renderTrackbar/trackToggle/saveTrackDir/saveVoices/renameTrack → ui/trackbar; mixer cluster → ui/mixer; wm actions → ui/wm; renderNoteList → ui/notes; updateChipBtn/updateSubtitle/updateLCD → ui/chrome; drummer/bassist sheets → ui/sheets | ~1,700 |
| 8 | M | commitImports, impCapture, openChipImport, captureChipTrack, fsub*, batchCommit, importAudioFiles, openPickedFiles, m3u → import/*; publishSong, renderSyncPending, openSyncSheet, fingerprintOldDrafts, discardPending, sweepStrandedClones, renameRepoTitles, manifest* → sync/publish (sheets → ui/sheets) | ~1,350 |
| 9 | M | askRun, askSend, askContext, askRunTool, askResume*, askFinish/Fail/Landed, ask*Annotation, askWriteNotes… → ask/* | ~720 |
| 10 | M | tap, endPointer, finalizeLasso, toggleSel, score pencil/tap/erase, instTap, recFinish, initCoreMidi/initWebMidi → input/*; cof drag → input/gestures | ~650 |
| 11 | M | remainder bucketed by blockers.mjs (settings/folder UI, chord/progression insert, compare, versions sheet…) | ~1,500 |
| 12a–f | L | top-level blocks → init functions, each with its cluster: canvas pointer listeners → input/gestures; editor/chord-widget/notes wiring → ui/note-editor + ui/notes; sheet/wm/modal wiring → ui/sheets + ui/wm; ask wiring → ask/sheet; ?perf HUD → ui/perf.js; migration IIFEs → model/*; boot IIFE → session/boot.js boot() | ~3,400 |
| 13 | final | app.js = imports + footer + init stubs → delete; stub list becomes main.js; drop LEGACY_CONTAINER + harness legacy path; doc sweep (§4 step 15) | ~1,000 |

**Step 0 — Done** (2026-10-04, tooling-only, no src/ edits). `move.mjs`:
(a) never emits an import of a file into itself — checks every name already
declared in `--to` before falling through to `--from`'s own imports, plus a
defensive drop when a resolved specifier equals `--to` itself (fixes the
self-import bug steps 8-10/13 hit five times); (b) a moved name's own
`X = prof("X", X);` statement now travels WITH its declaration (and only
then) — attached to the same group in `partitionGroups`, never left for the
generic init-wrapper path; (c) `assembleTo()` splits app.js's generated e2e
footer off, inserts new content before it, and reattaches the footer at the
true end, for every `--to src/app.js` move (fixes step 14's silent-loss
bug); (d) the actual root cause of the line-joining/comment-misattachment
bugs (steps 9-11) was `scope.mjs`'s `leadingComments` treating a trailing
same-line comment as the NEXT node's leading comment — fixed there (one
line-start check), which also fixes (b) for free; (e) `--init <InitName>`
mode (one non-declaration group only), and the synthesized call's own
import is now added to `--from` unconditionally, not by the ordinary
declared-name back-reference scan (fixes the gap step 12 hit).
`check.mjs`: rule 9 (every import specifier's target still exports the
name — zero findings on the real repo today); rule 10 (hooks.js's shape,
one `XImpl` per port strictly above every caller's layer, no top-level
initializer calling a port — all gated on `src/hooks.js` existing, so
nothing fires before step 1); LAYERS gained `hooks.js` (layer 0), `wire.js`
(layer 5), `session` (layer 4) now, ahead of steps 1/6 actually creating
them. `verbatim.mjs`: tolerates `--init`'s structural lines (header, call
stub unconditionally; the closing brace budgeted to exactly as many net new
headers, so an unrelated unmatched brace is still caught) and gains
`--hook X,Y` mode (hooks.js/wire.js changes unrestricted; `function X(` →
`function XImpl(` and the prof-wrap rename tolerated per listed name, label
string unchanged; a single `installHooks();` tolerated) — both ahead of
step 1 needing them. New `tools/split/blockers.mjs <names> --to <file>`:
transitive closure of still-app.js-declared dependencies + illegal-layer
imports + a one-line verdict; smoke-tested against the real repo
(`chipSource --to src/audio/chip.js` correctly reproduces docs/split-plan.md's
documented `CHIPS`/`logErr` blocker chain). 33 new fixture unit tests in
tests/modules.test.mjs (scope/check/move/verbatim/blockers), all green;
`npm test` on the real repo: only `ps2-real`/`instruments` fail (pre-existing
local-rip-fixture gap, unrelated). `node tools/split/check.mjs` on the real
repo: unchanged (one pre-existing `oldBpb` finding; rule 9 adds zero new
findings, so no allowlist was needed). `node tools/split/verbatim.mjs` on
868beff8/b92ec10d: still ✔. See open-items.md's two move.mjs QUEUED entries
(now RESOLVED) for the full before/after on each bug.

Steps 2 and 4 are the biggest wins per risk; step 4 touches the iPad audio
known-good engine (the one dangerous step). An unexpected blocker: run
blockers.mjs, then add one port (own H commit) or leave the name for step 11
— never revert the whole step.

## 3. Verifying behavior per step

Every commit: `perl -e 'alarm 1200; exec @ARGV' npm test` (ai.test links the
real module graph — stale specifiers / lost exports fail there); check.mjs
(with rules 9–10), check-e2e-globals, check-controls; the sorted
`prof("…")` label set across src/ unchanged; regen-e2e-footer once at the
end; rule-8 lists (modulepreload, sw APP_MODULES + SW_VERSION, devtools,
fileCount); `npm run test:e2e:smoke`; full Playwright in CI after push.

H commits: `verbatim.mjs --hook <ports>` clean — only new hooks/wire lines,
`function X(` → `function XImpl(` + its prof line (label unchanged), import
lines, the `installHooks();` stub, the LAYERS edit, tests. Each adds tests:
every port installed after createApp; port before install throws
`hook X not installed`; a rebinding test (`run("setInfo = m => …")` then a
lower-layer setInfo path is intercepted); same for draw from a model mutator.

M commits: plain `verbatim.mjs HEAD` ✔, no exceptions — a hook change and a
move never share a commit.

L commits: verbatim (init tolerance) + a boot-order test recording the init
order before/after.

Browser/device checks by the main session: step 2 ⚠ chip count + debug log,
an NSF/SPC chip render, metronome; **step 4 iPad ear check** (synth, SF2,
game voice, NES + one streamed console, clip at 0.5×, note preview, album
auto-advance — iPad mute → revert first); step 5 edit/undo,
quantize/split/join, copy/paste, a drummer/bassist take, local-song saves;
step 6 load, draft, Save As, fork, revert (scratch only); step 7 chips M/S/H,
voice audition, mixer, wm dock/float/close, phone width; step 8 NSF import
into scratch, publish to scratch; step 9 an Ask tool run (write_notes) +
resume; step 12 cold boot, ?perf=1 HUD, Learning vs Normal (estimateKey
never called in Learning).

## 4. End state

app.js deleted. The composition root is `src/wire.js` (the ~20-entry
S.hooks table, the only place a lower layer's call binds to a higher
layer's body) plus `src/main.js` (wiring only):

```js
import { installHooks } from "./wire.js";
import { exposeGlobals } from "./devtools.js";
import { boot } from "./session/boot.js";
import { initModel1 } from "./model/catalog.js"; /* … ~40 init imports … */
installHooks();                 // before ANY init — ports throw if missing
initModel1(); initGestures1(); /* … the old top-level order, verbatim … */
boot();
if (typeof window !== "undefined" && window.__NR_EXPOSE) exposeGlobals();
```

check.mjs: no LEGACY_CONTAINER, no allowlists, rules 9–10 permanent, the e2e
footer generator retired. Invariants: all state on S (incl. S.hooks); no
top-level side effects outside main.js; unique top-level names (XImpl keeps
them so); setControl the only button writer; Learning-mode gates (appMode,
sfShownAt, estimateKey) move verbatim and are never edited.
