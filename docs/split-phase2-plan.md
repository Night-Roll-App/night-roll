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
| 1 | H | **Done.** hooks.js + wire.js; ports setInfo, logErr, logDebug, appConfirm, updateJobsBtn; controls.js → layer 0; LAYERS gains session, hooks.js, wire.js | ~0 (15054→15056) |
| 2 | M | **Done, with two real exceptions (see §2 writeup): `chipRender`/`chipRenderInWorker` and `chipStreamOpen` stayed, blocked by `songTitleOf`, a NEW blocker, not `logErr`.** ensureAudio/resumeAudio/rebuildAudio → audio/engine; metStart → metronome; CHIPS, sonySeqCapture, psfInflater, PSX_SOUNDING_ON, chipExt, ~~chipRender~~, chipEstimateTracks, ~~chipRenderInWorker~~, chipCleanupAfterFailure, chipSource, chipVaultFile, chipModules → audio/chip; chipStreamOpenWorker (not ~~chipStreamOpen~~) → chip-stream; scheduleGameNote/gameVoiceWarn/gameNote*/resolveVoiceInstrument/gameLibSync/sf2Sync → audio/voices; idbDraftPut → platform/storage; jobsNotify → model/jobs | ~1,100 (actual: 571, 15056→14485) |
| 3 | H | **Done.** ports draw, playbackFrame, clampView, fitView, buildScoreModel, renderTrackbar, updateEditBtnVis, updateChipBtn, updateSongBtn, updateSyncBtn, updateSubtitle, askRender, finalizeNotes, recFinish, albumAdvance — plus songTitleOf (step 2's blocker) | ~0 (actual: +9, 14486→14495 — new import lines only) |
| 4 | M | **Done, with the transport/voices/clips clusters almost entirely blocked (see §2 writeup): only chipRender/chipRenderInWorker/chipPublish/chipStreamOpen/chipRenderAuto actually moved**, unblocked by step 3's songTitleOf port; play/stop/playGate*/buildSchedule/renderSongOffline/audioChaseNow → audio/transport; scheduleNote, previewNote, sf/game preload+wait → audio/voices; scheduleClip, stretchEnsure(All), applyAudioDirs, audioEnsureFile, applyBeatMap, setSongTempo, writeClips, setClipDir, splitClipAt, deleteClip → audio/clips all stayed, still blocked | ~1,150 (actual: 220, 14495→14275) |
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

**Step 1 — Done** (2026-10-04, terminal session). `src/hooks.js` (layer 0):
the five ports of §1 M1's code sketch, verbatim shape — `setInfo`, `logErr`,
`logDebug`, `appConfirm`, `updateJobsBtn`. `src/wire.js` (layer 5):
`installHooks()`, called as `app.js`'s first top-level statement.
`src/state.js` gained `hooks: {}`. `src/ui/chrome.js`: the five real bodies
renamed `XImpl`; the file imports the bare names back from `../hooks.js`
for its own internal call sites. `src/app.js` switched its five imports to
`./hooks.js`. `src/ui/sheets.js`/`src/ui/note-editor.js` — same layer as
`ui/chrome.js`, so no port needed — instead import `XImpl as X` directly
from `./chrome.js` (only the import specifier changed, never a call site);
confirmed by tests/modules.test.mjs's rule 10b/10c fixture, which still
flags a SAME-layer port caller as a violation by design — a port exists
only to legalize a genuinely lower layer's upcall. `src/ui/controls.js` →
layer 0 in `check.mjs`'s LAYERS table (file unmoved, imports only
`ui/icons.js`). Two real `check.mjs` rule-10 gaps found and fixed (both
documented in the rule's own comment): `ruleHooksPorts` didn't exempt the
port's own home file or app.js/main.js from its layer check (so chrome.js's
own self-import and app.js's pre-existing imports both failed);
`ruleNoTopLevelPortCalls` had no app.js/main.js exemption (rule 4 does),
flagging dozens of app.js listener/IIFE blocks that only call a port
inside a deferred callback, never at module-evaluation time. Dissolves the
three permanent blockers docs/split-plan.md's Deviations (7)/(8) found —
`ensureAudio`/`resumeAudio`/`rebuildAudio`, `CHIPS`/`chipRender`/
`chipSource`/etc., `jobsNotify` — none of which have moved yet (step 2).
Tests added: a port throws `hook X not installed` before `installHooks()`
runs; every port installed as a function once the real app boots;
reassigning the bare port name intercepts every importer, bypassing
`ui/chrome.js`'s impl entirely. `perl -e 'alarm 1200; exec @ARGV' npm
test`: only `ps2-real`/`instruments` fail (pre-existing). `check.mjs`:
clean except `oldBpb`. `check-e2e-globals.mjs`/`check-controls.mjs` clean.
`verbatim.mjs --hook setInfo,logErr,logDebug,appConfirm,updateJobsBtn
HEAD`: ✔. prof label set unchanged (29 entries). `test:e2e:smoke`: 8/8.
index.html/sw.js (`nr-v20`→`nr-v21`)/devtools.js gained hooks.js/wire.js;
fileCount 62→64 (66 w/ vendor/ai/web). `src/app.js`: 15054→15056 lines.
Full writeup: open-items.md's 2026-10-04 "module split phase 2 step 1"
entry and its three RESOLVED notes on the dissolved blockers.

**Step 2 — Done** (2026-10-04, terminal session). `blockers.mjs` run
before every cluster, real repo. Moved clean: `ensureAudio`/`resumeAudio`/
`rebuildAudio` → `audio/engine.js`; `metStart` → `audio/metronome.js`;
`CHIPS`/`sonySeqCapture`/`psfInflater`/`PSX_SOUNDING_ON`/`chipExt`/
`chipEstimateTracks`/`chipCleanupAfterFailure`/`chipSource`/
`chipVaultFile`/`chipModules` → `audio/chip.js`; `chipStreamOpenWorker` →
`audio/chip-stream.js`; `scheduleGameNote`/`gameVoiceWarn`/
`gameVoiceWarned`/`gameNoteBucket`/`gameNoteCache`/
`resolveVoiceInstrument`/`gameLibSync`/`sf2Sync` → `audio/voices.js`;
`idbDraftPut` → `platform/storage.js`, `jobsNotify` → `model/jobs.js`
(both FROM `ui/sheets.js`, not `app.js` — phase 1 misfiled them there;
`move.mjs` copied `ui/sheets.js`'s own same-layer `XImpl as X` import
alias verbatim, landing an illegal upward import each time — both
hand-fixed to import the port from `../hooks.js` instead; `app.js`'s own
stale `from "./ui/sheets.js"` import of each name also hand-fixed).
**A NEW, real permanent blocker this step surfaced, unrelated to `logErr`:
`chipRender`/`chipRenderInWorker`/`chipPublish`/`chipStreamOpen`/
`chipRenderAuto` all call `songTitleOf` (`ask/context.js`, layer 4)
directly — none of step 1's five ports cover it. All five stay in
app.js.** One real `check.mjs` gap found and fixed: `isPureLiteralish`
didn't recurse into object/array literals, so `CHIPS` (a plain table of
closures) tripped rule 10d even though `CHIPS.usf.capture`'s own `logErr`
reference never runs at module-eval time — same reasoning the existing
`FunctionExpression` case already rests on. Two real-repo test/tool
breaks fixed (not pre-existing): `tests/package.test.mjs` and `tools/
package.mjs`'s `chipTableModules()` both hardcoded reading `src/app.js`
for `CHIPS`'s `files:`/`shared:` lists — now scan the whole src/ tree
(the test via `appSource()`). `perl -e 'alarm 1200; exec @ARGV' npm
test`: only `ps2-real`/`instruments` fail (pre-existing). `check.mjs`:
clean except `oldBpb` (`regen-e2e-footer.mjs` re-run after every move —
skipping it once left 4 stale rule-2 findings, caught immediately).
`check-e2e-globals.mjs`/`check-controls.mjs` clean. prof label set
unchanged (29). `test:e2e:smoke`: 8/8. `src/app.js`: 15056 → 14485 lines
(571 out, under the ~1,100 estimate — the five `songTitleOf`-blocked
functions are among the cluster's largest). A fourth same-shape
`verbatim.mjs` false alarm (the `AUDIO_STRIP_H` class, Deviations (11)):
two original physical lines each held an unrelated pair of statements
(`PSX_SOUNDING_ON`/`HOLD_MS`; a top-level touchstart listener/
`ensureAudio`'s own declaration) — one moved, one stayed, hand-verified,
not fixed in the tool, same precedent. Full writeup: open-items.md's
2026-10-04 "module split phase 2 step 2" entry. **Browser-check needed**
(plan §3): ⚠ chip count + debug log, an NSF/SPC chip render, metronome.

**Step 3 — Done** (2026-10-04, terminal session). Sixteen ports, all by
the §1 M1 recipe: body renamed `XImpl` in its current home, `hooks.js`
gains the forwarder, `wire.js`'s `installHooks()` binds it, importers
re-pointed. Homes untouched — this step moves nothing, only renames +
rewires imports: `draw`/`playbackFrame`/`clampView`/`updateSongBtn`/
`updateSyncBtn` stay in `ui/chrome.js`; `buildScoreModel` stays in
`render/score.js`; `songTitleOf` stays in `ask/context.js` (step 2's own
`chipRender`/etc. blocker); `fitView`/`renderTrackbar`/`updateEditBtnVis`/
`updateChipBtn`/`updateSubtitle`/`askRender`/`finalizeNotes`/`recFinish`/
`albumAdvance` stay in `app.js` itself (so `wire.js` imports their `*Impl`
straight from `app.js` — a circular import with `app.js`'s own `import {
installHooks } from "./wire.js"`, safe because every name involved is a
hoisted function declaration, available before either module's top level
runs; the identical shape `app.js`↔`wire.js` already had since step 1).
Importers re-pointed per §1 M1's rule (impl layer strictly above every
port caller): `ui/sheets.js`/`ui/note-editor.js` (same `ui` layer as
`ui/chrome.js`) and `ui/sheets.js` (reading down into `render/score.js`'s
`buildScoreModelImpl`/`ask/context.js`'s `songTitleOfImpl`, both already
legal downward imports) got `XImpl as X` aliases; `ask/bridge.js`/
`ask/sheet.js` (same `ask` layer as `ask/context.js`) likewise;
`ui/chrome.js`'s own `songTitleOf` import became a same-layer alias too.
`app.js`'s five existing imports of `draw`/`playbackFrame`/`clampView`/
`updateSongBtn`/`updateSyncBtn`/`buildScoreModel`/`songTitleOf` switched to
`./hooks.js` (the impl's home no longer re-exports the bare name); nine
brand-new `import { X } from "./hooks.js";` lines added for the names
whose impl stayed IN `app.js` (needed so `app.js`'s own internal bare-name
callers — `finalizeNotes` calling `renderTrackbar()`/`fitView()`/
`updateEditBtnVis()`, `renderTrackbar` calling itself recursively plus
`buildScoreModel()`/`clampView()`/`draw()`, etc. — still resolve). Two
same-file self-import additions: `ui/chrome.js` imports `draw`/
`updateSongBtn`/`updateSyncBtn` back from `../hooks.js` for `resize()`'s
`draw()` call and `saveDraft()`'s `updateSongBtn()`/`updateSyncBtn()`
calls; `ask/context.js` imports `songTitleOf` back from `../hooks.js` for
`askViewCursorLine`'s own internal `songTitleOf(S.songKey)` call — same
pattern step 1 established for `ui/chrome.js`'s five original ports.
`updateChipBtn`'s own `.warned` memoization property (`updateChipBtn.warned
= S.songKey`, read/written only from the sibling `updateChipBtnInner`, not
itself renamed) now hangs off the `hooks.js` forwarder's function object
instead of the impl's — behaviorally identical, since every reference
(both inside `updateChipBtnInner`) resolves to the same singleton import.
`node tools/split/regen-e2e-footer.mjs --file src/app.js` re-run (the nine
app.js-resident names' setters in `__nrExpose$` would otherwise try to
assign to now-imported bindings — rule 2 — exactly step 2's "a move that
turns a declaration into an import" gotcha, here from a rename instead of
a move); after regen, the nine `XImpl` names get two-way accessors and the
bare names drop out of the footer entirely (an import, not a declaration
— `declaredNames()` returns `[]` for `ImportDeclaration`), matching step
1's `setInfo`/etc. precedent exactly. Two real-repo tests updated (not
newly broken — the task's own instruction to touch tests was expected):
`tests/modules.test.mjs`'s `installHooks()`/`every port throws` tests grew
from the original five names to all 21; its step-2-era `chipRender -> CLEAN`
negative test (asserting `songTitleOf` as the live blocker) now asserts the
opposite — `songTitleOf` dissolved, only `chipRenderInWorker`/`chipPublish`
(chipRender's own still-in-app.js siblings) remain in the closure, not a
permanent blocker. Two tests added per §3's own list: a port-before-install
throw test folded into the existing all-21 loop; a new rebinding test for
`draw` (sets `S.sceneValid = true`, reassigns the bare `draw` port,
confirms the real `drawImpl` — which unconditionally sets `sceneValid =
false` — never ran). `perl -e 'alarm 1200; exec @ARGV' npm test`: only
`ps2-real`/`instruments` fail (pre-existing). `check.mjs`: clean except
`oldBpb`. `check-e2e-globals.mjs`/`check-controls.mjs` clean. `verbatim.mjs
--hook <all 21 names> HEAD`: ✔, zero lost/extra. Sorted `prof("…")` LABEL
set unchanged (29 — three renamed bindings, `renderTrackbarImpl`/
`updateSubtitleImpl`/`finalizeNotesImpl`/`buildScoreModelImpl`/`drawImpl`/
`playbackFrameImpl`, keep their original label strings). `test:e2e:smoke`:
8/8. `node tools/package.mjs --out`: 181 files, unchanged (no file added or
removed this step). `src/app.js`: 14486 → 14495 lines (+9, the new
hooks.js imports for the app.js-resident names — no code moved).

**Step 4 — Done** (2026-10-04, terminal session). `blockers.mjs` run
against every named cluster before touching anything, per this step's own
instruction. **Overwhelmingly blocked, the same shape docs/split-plan.md's
phase-1 Deviations (7)/(8) already found for this exact code**:
`play`/`stop`/`playGate`/`playGateKick`/`playGateTick`/`playGateActive`/
`playGateWait`/`buildSchedule`/`renderSongOffline`/`audioChaseNow` →
`audio/transport.js` reports 45 still-in-app.js closure names (the album
system, the sf/game/instrument preload machinery, the tombstone/undo
helpers, `scheduleClip`/`stretchEnsure*`) plus 5 illegal-layer imports —
`recOpenEnded` (`input/record.js`), `srAnnounce`/`scheduleBackupFlush`
(`ui/chrome.js`), `computeSongEnd` (`ui/sheets.js`), `setAnchorBQ`
(`ui/note-editor.js`) — all layer 4, none covered by any port named in
this plan. `scheduleNote`/`previewNote`/sf+game preload+wait →
`audio/voices.js`: 37 closure names (the same play-gate/instrument-preload
web) plus 2 of the same illegal-layer imports (`recOpenEnded`/
`srAnnounce`). `scheduleClip`/`stretchEnsure(All)`/`applyAudioDirs`/
`audioEnsureFile`/`applyBeatMap`/`setSongTempo`/`writeClips`/`setClipDir`/
`splitClipAt`/`deleteClip` → `audio/clips.js`: every one of the ten names
checked individually (not just as a block) comes back blocked — the
smallest (`writeClips`/`setClipDir`/`splitClipAt`/`deleteClip`) by
`annoSnapshot`/`tombstone`/`saveLocalNotes`/`buildSchedule` (undo-log
helpers, still in app.js) plus the same 3 illegal-layer imports
(`setAnchorBQ`/`computeSongEnd`/`scheduleBackupFlush`); the larger ones
additionally pull in the whole transport/play-gate web. None of these five
illegal-layer imports (`recOpenEnded`, `srAnnounce`, `scheduleBackupFlush`,
`computeSongEnd`, `setAnchorBQ`) are covered by any existing port or named
by this plan's table for a port — adding one would be a sixth-plus H
commit this step's own scope ("step 4 = M commit(s)") doesn't authorize.
Per this step's own instruction ("leave anything still blocked, document")
all three clusters — `audio/transport.js`, `audio/voices.js`,
`audio/clips.js` — stay entirely in app.js, bit-for-bit, nothing moved.
**What step 3's `songTitleOf` port DID unblock, exactly as designed**:
`blockers.mjs chipRender,chipRenderInWorker,chipPublish --to
src/audio/chip.js` came back clean (their only blocker, per step 2's
writeup, was `songTitleOf`); moved by name, verbatim. That immediately
cleared `chipStreamOpen`/`chipRenderAuto --to src/audio/chip-stream.js`
too (their remaining blocker was `chipRender`/`chipRenderInWorker`/
`chipPublish` themselves, now real imports from `audio/chip.js`, a legal
same-layer reference) — moved the same way. `chipRender`/
`chipRenderInWorker` now import `songTitleOf` from `../hooks.js`;
`chipRenderAuto` now imports `chipRender` from `./chip.js` instead of a
bare app.js reference. `node tools/split/regen-e2e-footer.mjs --file
src/app.js` re-run. One real-repo test updated: `tests/modules.test.mjs`'s
step-3-era `chipRender -> audio/chip.js, still blocked by
chipRenderInWorker/chipPublish` test now asserts all five names report
clean (not even an empty closure — `blockers.mjs` finds nothing to chase
because none of the five is declared in app.js any more, the same
"isn't declared in app.js at all" shape the pre-existing `chipSource`
test already established). `perl -e 'alarm 1200; exec @ARGV' npm test`:
only `ps2-real`/`instruments` fail (pre-existing). `check.mjs`: clean
except `oldBpb`. `check-e2e-globals.mjs`/`check-controls.mjs` clean.
`verbatim.mjs HEAD`: ✔, zero lost/extra, no exceptions needed (a clean
`move.mjs --names` move, not a rename — nothing for `--hook` to tolerate).
Sorted `prof("…")` LABEL set unchanged (29 — none of the five moved names
are profiled). `test:e2e:smoke`: 8/8. `node tools/package.mjs --out`: 181
files, unchanged (no file added or removed — `audio/chip.js`/
`audio/chip-stream.js` already existed since step 2/phase-1 step 8).
`src/app.js`: 14495 → 14275 lines (220 out, well under the plan's ~1,150
estimate — almost the entire transport/voices/clips cluster stayed).
**iPad ear check still needed** (plan §3's step-4 list): synth, SF2, game
voice, NES + one streamed console, clip at 0.5×, note preview, album
auto-advance (iPad mute → revert first) — the chip-render/chip-stream path
this step actually touched is exactly the "NES + one streamed console"
and "note preview" (chip fallback) part of that list.

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
