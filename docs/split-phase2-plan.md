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
| 4 | M | **Done, with the transport/voices/clips clusters almost entirely blocked (see §2 writeup): only chipRender/chipRenderInWorker/chipPublish/chipStreamOpen/chipRenderAuto actually moved**, unblocked by step 3's songTitleOf port; play/stop/playGate*/buildSchedule/renderSongOffline/audioChaseNow → audio/transport; scheduleNote, previewNote, sf/game preload+wait → audio/voices; scheduleClip, stretchEnsure(All), applyAudioDirs, audioEnsureFile, applyBeatMap, setSongTempo, writeClips, setClipDir, splitClipAt, deleteClip → audio/clips all stayed, still blocked. **Finished in step 4c (worktree agent, 2026-10-04): the whole cluster is out — see the 4c write-up.** | ~1,150 (actual: 220, 14495→14275; 4c: 836 more, 14179→13343) |
| 5 | M | **Done (worktree agent, 2026-10-04; 18 commits — 14 M + 3 H carrying 4 ports; see write-up; retireOldOverlay landed in model/versions beside saveDraft, its only caller).** saveEdits/loadEdits/foldOldOverlay/retireOldOverlay → model/edits; selEditApply + selection mutators, insertTime/deleteTime, ridealongChordBands, transposeTrack, closeGap → model/selection; scheduleAnalysisRecompute/adopt* → gen/analysis; drGenerate/bsGenerate/applyTake → gen/*; M2's misfiled ones down out of ui/* | ~1,400 (actual: 1,204, 13343→12139) |
| 6 | M | **Done (worktree agent, 2026-10-04; 7 commits; see write-up — revertSongToRepo/moveComposition wait for step 8's sync web; bakeMeter/bakeTempos landed in model/rollnotes, not session).** session/song.js: finalizeNotes, bakeMeter, bakeTempos, loadNotes, updateSongMeta, fitView, loadSong*, setSong, openDraft*; session/album.js: albumStart/PlayIdx/Advance…; session/files.js: saveSongAs, openSaveForm, forkCurrentSong, revertSongToRepo, moveComposition, renameLocalKeys | ~1,000 (actual: 808, 12139→11331) |
| 7 | M | **Done (worktree agent, 2026-10-04; 9 commits + a step 0 addendum; see write-up — the Instruments sheet web landed in ui/sheets.js, reorderTrack in ui/mixer.js).** voice menu/pickers/buildClipControls → ui/voice-menu; renderTrackbar/trackToggle/saveTrackDir/saveVoices/renameTrack → ui/trackbar; mixer cluster → ui/mixer; wm actions → ui/wm; renderNoteList → ui/notes; updateChipBtn/updateSubtitle/updateLCD → ui/chrome; drummer/bassist sheets → ui/sheets | ~1,700 (actual: 1,971, 11331→9360) |
| 8 | M | **Done (worktree agent, 2026-10-04; 12 M commits + 1 harness commit; see write-up — jobStart landed in ui/sheets.js beside jobApi, askSave/askCommitLog pulled forward into ask/bridge.js).** commitImports, impCapture, openChipImport, captureChipTrack, fsub*, batchCommit, importAudioFiles, openPickedFiles, m3u → import/*; publishSong, renderSyncPending, openSyncSheet, fingerprintOldDrafts, discardPending, sweepStrandedClones, renameRepoTitles, manifest* → sync/publish (sheets → ui/sheets) | ~1,350 (actual: 1,903, 9360→7457) |
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

**Step 4b — Done** (2026-10-04, worktree agent). Finished what step 4
couldn't: its own 5 illegal-layer imports (`recOpenEnded`, `srAnnounce`,
`scheduleBackupFlush`, `computeSongEnd`, `setAnchorBQ` — all layer 4,
none covered by a port this plan had named) plus the clips cluster's
own smallest sub-move (`writeClips`/`setClipDir`/`splitClipAt`/
`deleteClip`). Nine commits, each verified independently:

1. **M** `recOpenEnded` (`input/record.js`) → `model/song.js`. Pure
   ({start, end: Infinity} from a seg), zero cross-module calls — a
   re-home, not a port, per §1 M1's rule ("a name may be a port only
   if its body lives at a higher layer than every caller" — the
   inverse holds too: nothing here needs layer 4 at all). Landed
   beside `computeSongEnd`, which its own comment already named as
   the function that later closes the segment it creates.
2. **M** `computeSongEnd` (`ui/sheets.js`) + the "pure clip geometry"
   M2 already called out — `clipLen`/`clipEndTick`/`songHasAudio`
   (`audio/clips.js`) — → `model/song.js`, together. Moving
   `computeSongEnd` alone would have just relocated the blocker onto
   `clipEndTick` (model importing audio is as illegal as ui importing
   audio); moving the geometry down too clears it for good —
   `audio/clips.js` now imports `clipLen` back from `model/song.js`,
   a legal downward reference. Four external importers hand-fixed
   (move.mjs only rewires `--from`/`--to`): `app.js` (stale
   `./audio/clips.js` and `./ui/sheets.js` specifiers), `ui/notes.js`,
   `render/tracks.js`; `ui/sheets.js`'s own now-dead `clipEndTick`
   import deleted.
3. **H** `srAnnounce` (`ui/chrome.js`) — genuinely layer 4 (the
   `#srlive` DOM node + debounce state are presentation, not song
   model): ported, not re-homed. `srAnnounceImpl` + hooks.js forwarder
   + wire.js binding, the usual shape.
4. **H** `scheduleBackupFlush` (`ui/chrome.js`) — its own body is
   trivial, but what it schedules (`flushBackupNow`: draftDoc,
   serializeRollnotes, the bridge's aiUrl/aiHeaders/fetch) is
   genuinely layer 4; porting the trampoline alone, without moving
   its target, keeps the body where `flushBackupNow` already lives.
5. **H** `setAnchorBQ` (`ui/note-editor.js`) — pure on its own
   (barTicks/beatTicks/snapBeat + Math), but `snapBeat` lives in the
   same file and is still called from a dozen app.js sites unrelated
   to this step's 5 named blockers; re-homing both would have
   expanded scope well past what step 4 actually named. Ported
   instead — the one case in this step where "pure" didn't win out
   over "named blocker only."

With all 5 cleared, `blockers.mjs` on the clips cluster's smallest
sub-move dropped from "5 illegal-layer imports + 7 closure names" to
"0 illegal-layer imports + 7 closure names" — the real remaining work
was never the 5 named blockers alone, it was what they were hiding:

6. **M** `buildSchedule` (independently clean once `clipLen` was
   model-layer) → `audio/transport.js` (already existed from an
   earlier step — a plain addition, not a new file).
7. **M** `annoSnapshot`/`tombKey`/`tombKeyFor`/`noteIdentity`/
   `tombstone` (the "tombstones (2026-08-19, handoff item)" undo/
   sync-identity helpers, all pure JSON + localStorage) → `model/
   edits.js`.
8. **M** `saveLocalNotes` (blocked only by `scheduleBackupFlush` until
   step 4b's own commit 4 ported it) → `model/edits.js`.
9. **M** `writeClips`/`setClipDir`/`splitClipAt`/`deleteClip` →
   `audio/clips.js` — clean, zero closure, zero illegal imports. The
   clips cluster's own line in step 4's table (originally 10 names,
   "every one... blocked") is now 4/10 moved; the other 6
   (`scheduleClip`/`stretchEnsure(All)`/`applyAudioDirs`/
   `audioEnsureFile`/`applyBeatMap`/`setSongTempo`) pull straight into
   the play-gate/instrument-preload web below and stay blocked (see
   "What's still blocked").

Each M commit: plain `verbatim.mjs <sha>` (or `git show`-equivalent —
note the tool compares `rev~1..rev`, so verification must name the
actual commit, not a bare `HEAD` typed before committing) ✔, no
exceptions; one recurring real `check.mjs` rule-2 gap, not a false
positive: every move that turns a former app.js *declaration* into an
*import* leaves app.js's generated `__nrExpose$` e2e footer still
trying to assign it — `node tools/split/regen-e2e-footer.mjs --file
src/app.js` re-run after every M commit (same gotcha steps 2/3 already
documented). Each H commit: `verbatim.mjs --hook <name>` ✔;
`tests/modules.test.mjs`'s `ALL_PORTS` grew 21→24 (the two re-homes
don't add ports); one new rebinding test per port (3 added). `perl -e
'alarm 1200; exec @ARGV' npm test`: only `ps2-real`/`instruments` fail
throughout (pre-existing); `tests/modules.test.mjs` itself grew
78→81 (3 rebinding tests + 1 new `blockers.mjs` CLI regression test
for the finished clips cluster, matching the existing chipRender
precedent) and stayed green start to finish. `check.mjs`: clean except
`oldBpb` throughout. `check-e2e-globals`/`check-controls`: clean
throughout (e2e-globals' known-name count crept 1877→1880 as
`srAnnounceImpl`/`scheduleBackupFlushImpl`/`setAnchorBQImpl` joined
devtools' window mirror — expected, not a regression). Sorted
`prof("…")` label set unchanged across all nine commits (29 — none of
the moved/ported names were profiled). `test:e2e:smoke`: 8/8
throughout. `node tools/package.mjs --out`: 181 files, unchanged (no
file added — `audio/transport.js`/`model/edits.js`/`model/song.js`/
`audio/clips.js` all already existed). `src/app.js`: 14275 → 14179
lines (96 out — modest next to steps 2/4's hundreds, because this
step's job was clearing blockers, not bulk code motion; the clips
cluster's own 4 functions were ~90 of those lines).

**What's still blocked** (left for a future step, not attempted here):
the transport cluster (`play`/`stop`/`playGate*`/`renderSongOffline`/
`audioChaseNow` → `audio/transport.js`) and voices cluster
(`scheduleNote`/`previewNote`/preload+wait → `audio/voices.js`) both
still pull in the SAME ~37-name app.js closure — the play-gate ticker,
the whole SF2/game-voice/instrument preload machinery
(`sfWaitForSong`/`gameVoicesInSong`/`instLibrary`/`INST_CHIPS`/etc.),
and album playback (`albumStrip`). Checked directly with blockers.mjs
(not assumed): zero illegal-layer imports remain anywhere in this web
— every one of the 37 names is a same-cluster interdependency, not a
blocker this step's tools (ports/re-homes) can clear one at a time.
Moving it means moving essentially the whole play-gate/instrument-
preload system together, in one (large, audio-fragile) move — a step
11-sized undertaking, not a step-4b fix. The remaining clips-cluster
names (`scheduleClip`/`stretchEnsure(All)`/`applyAudioDirs`/
`audioEnsureFile`/`applyBeatMap`/`setSongTempo`) are blocked by the
exact same web (confirmed: all six pull in 46 of its names when
checked together). Per this step's own instruction ("if something is
truly not portable, leave that cluster and document") — left bit-for-
bit in app.js.

**Step 4c — Done** (2026-10-04, worktree agent). The transport/voices/
clips cluster step 4b left — the "step 11-sized undertaking" above — is
out of app.js, verbatim, in seven M commits. The key finding: the 50-name
closure `blockers.mjs` reported was NOT one strongly-connected component.
Read function by function, 28 of the 50 hang off the real SCC in one
direction only (the SCC calls down into them, nothing in them calls back
up), so they each move as their own linking commit, and the SCC itself is
22 names. Order and placement (docs/split-plan.md §1's table, not this
file's step-4 row, decides where a name lands — one deviation, noted):

1. **M** `romanValue`/`titleSortKey`/`titleCompare` → `model/catalog.js`.
   Pure album-title ordering, only caller `instAlbums`; landed at layer 2
   ("album lookups") rather than beside their caller at layer 3 — the
   `albumMetaFor`-in-chip.js lesson of phase 1 step 9 (a pure leaf parked
   one layer too high deadlocks the next lower-layer caller). Clean.
2. **M** the instrument-library layer → `audio/voices.js`: `instLibs`/
   `instWavs`/`instPlayer`/`instDecodeWav`/`instAlbums`/`INST_CHIPS`/
   `instFolder`/`instLibrary`/`instSamples`/`sf2Module`/`sf2Fonts`/
   `sf2Bytes`/`sf2Font`/`resolveGameVault`/`instPlayerReady`/
   `gameVoicesInSong`/`sf2VoicesInSong` (17). Clean after commit 1.
3. **M** `albumStrip` → `audio/transport.js`. Clean. After it,
   `blockers.mjs` on the 22-name SCC: closure (none), illegal (none).
4. **M, the SCC, one commit, three `move.mjs` invocations** — no ordering
   of smaller commits leaves rule 5 clean in between (play → sfWaitForSong
   → sfPreloadForSong → playGateKick → playGateTick → play; scheduleNote →
   scheduleClip → stretchEnsure → audioChaseNow → scheduleClip; play →
   scheduleNote/stretchEnsureAll). `audio/clips.js` ← `scheduleClip`/
   `stretchEnsure`/`stretchEnsureAll`/`audioChaseNow`; `audio/voices.js` ←
   `sfPreloadForSong`/`sfWaitForSong`/`gamePreloadTokens`/
   `gamePreloadForSong`/`gameWaitForSong`/`scheduleNote`;
   `audio/transport.js` ← `PLAY_GATE_GRACE`/`PLAY_GATE_MAX`/`gateSettled`/
   `gateWatched`/`gatePending`/`playGate`/`playGateWait`/`playGateKick`/
   `playGateActive`/`playGateTick`/`play`/`stop`. Invoked in that order
   (clips first — nothing it needs was still in app.js; voices second —
   one need, `playGateKick`, still in app.js; transport last — everything
   it needs now real), so exactly ONE specifier needed the §0 import-line
   hand fix: voices.js's `import { playGateKick } from "../app.js"` →
   `"./transport.js"`. The three files now form a layer-3 cycle (legal,
   §2.3; every crossing name is a hoisted function or a const read only
   inside one). `play.gen = 0;` — a top-level property write on play's
   function object — stays in app.js (evaluates after transport.js) and
   picked up two leading spaces from the indented `  function
   stretchEnsure` line cut from its `function` token onward (whitespace
   only; verbatim.mjs ✔).
5. **M** `previewNote` → `audio/voices.js` (a consumer of scheduleNote,
   not a member of the SCC). Clean.
6. **M** `applyAudioDirs`/`audioEnsureFile`/`applyBeatMap`/`setSongTempo`
   → `audio/clips.js` (the clips cluster's last four; each reaches the
   SCC one way). Clean.
7. **M** `offlineWaitForAssets`/`renderSongOffline` → **`audio/bounce.js`,
   not `audio/transport.js`** as this file's step-4 row said:
   docs/split-plan.md §1 gives bounce.js "Download audio: wav encode,
   offline render", and bounce.js already holds the wavEncode/
   audioBufferToWav/deliverAudioFile the same click handler feeds the
   rendered buffer to. Same layer either way. Clean once `audioEnsureFile`
   (commit 6) had moved.

Per commit: `verbatim.mjs <sha>` ✔ with zero exceptions all seven times
(no same-line split this time — `PLAY_GATE_GRACE, PLAY_GATE_MAX`,
`gateSettled, gateWatched`, `instLibs, instWavs` are each ONE declaration
with two declarators, moved whole); `regen-e2e-footer.mjs` after every
move; `check.mjs` clean except `oldBpb`; `check-e2e-globals`/
`check-controls` clean; sorted `prof("…")` label set unchanged (29 —
`scheduleNote`'s wrap travelled with it, label string untouched). After
the group: `perl -e 'alarm 1200; exec @ARGV' npm test` — only `ps2-real`/
`instruments` fail (pre-existing local-rip gap); modules 81/81, controls
3/3, ai/bridge/gestures/chip-worker/sounding/night-roll green;
`test:e2e:smoke` 8/8; `node tools/package.mjs --out`: 181 files, list
identical to before the step (no file added — all five targets already
existed). `src/app.js`: 14179 → 13343 (836 out). Learning-mode gates
untouched. No port added, no logic edit anywhere. **iPad ear check now
owed in full** (plan §3's step-4 list, no longer narrowed — this IS the
engine): synth, SF2, game voice, NES + one streamed console, clip at
0.5×, note preview, album auto-advance, metronome. See open-items Q9.

**Step 5 — Done** (2026-10-04, worktree agent). Eighteen commits. The
row's four clusters were each held at layer 2 by the same two things:
the M2 "misfiled upward" names still sitting in ui/* (saveDraft and
friends), and a handful of helpers at layers 3–4 that model code calls.
`blockers.mjs` first, every cluster, before anything moved; then the
unblocking in dependency order, then the clusters:

1–7. **M, re-homes** (each `blockers.mjs` clean, each importer re-pointed
   by hand, import lines only): `isDirective`/`isCopyableAnno`
   (render/roll.js → model/rollnotes.js — annotation predicates, not
   drawing); `snapBeat` (ui/note-editor.js → model/grid.js — the reason
   4b ported setAnchorBQ instead of re-homing it); `setEndBQ`/
   `dropSupersededBy` (ui/note-editor.js → model/rollnotes.js);
   `notesTxtFor`/`declaredTsForKey` (sync/publish.js → model/rollnotes.js
   — filesMirror's ONE layer-4 dependency, which was what kept saveDraft
   out of model); `undoTrackAdd` (ui/sheets.js → model/edits.js);
   `draftWrite`/`localDraftWrite` (ui/sheets.js → model/versions.js);
   `saveDraft`/`retireOldOverlay`/`filesMirrorSoon`/`draftRead`/
   `filesMirror`/`localDraftTracks` (ui/chrome.js) + `filesMirrorFor`
   (app.js) → model/versions.js — M2's own "back down once ports exist",
   done. `flushBackupNow` stays in ui/chrome.js (aiUrl/aiHeaders, layer 4;
   reached only through the scheduleBackupFlush port). Step 2's move.mjs
   gotcha recurred once (a copied same-layer `logErrImpl as logErr` alias
   landing in versions.js, rule 5) — hand-fixed to the hooks.js port.
8–9, 14. **H, three commits, four ports** — the model/gen clusters' upcalls
   with no layer-2 home, all by §1 M1's recipe: `updateSongMeta` (the bpm
   label; saveEdits calls it; impl stays in app.js, wire.js imports it
   from there — step 3's shape), `lassoedAnnos` + `drumStep` (the lasso's
   pixel-box annotation query in ui/note-editor.js; the kit-lane row walk
   in render/roll.js), `annoInLasso` (copySelection filters with it
   directly). **check.mjs rule 10 earned its keep**: the first annoInLasso
   attempt pointed ui/note-editor.js (layer 4) at the port whose impl is
   layer 3 — flagged; fixed with step 3's downward `annoInLassoImpl as
   annoInLasso` alias. ALL_PORTS 24 → 28, a rebinding test per port.
10–13. **M**: `transposeChordLabel` → theory/chords.js (LETTER_PC/
   CHORD_FLAT live there); `dropLocalKeyAt` → model/rollnotes.js;
   `scheduleAnalysisRecompute`/`adoptChordBand`/`adoptAllChords`/
   `adoptKeyRegion` → gen/analysis.js (Normal-mode gate inside the bodies,
   untouched); `saveEdits`/`loadEdits`/`foldOldOverlay` → model/edits.js
   (the 2026-10-02 SAFETY slice — verbatim, prof wrap travelled).
15–18. **M**: the selection cluster → model/selection.js, 26 names — the
   row's list plus the neighbours blockers.mjs showed held only by the
   set itself (`duplicateSelection(InPlace)`, `divideSelection`,
   `diatonicShift`, `removeDuplicateNotes`, `sweepStrandedClones`,
   `clearMultiSel`; left: `selectAllNotes` (render+ui), the undo log's
   apply side `invertEdit`/`applyEditEntry`/`editUndoPop`/`editRedoPop`
   (reaches the mixer UI — step 11), the sheet openers); `moveClip`/
   `trimClip`/`splitSelectedClipAtCursor` → audio/clips.js (they surfaced
   as "blocked by layer 3" — i.e. clips-cluster members); `drGenerate` →
   gen/drummer.js; `bsGenerate`/`applyTake` → gen/bassist.js.

Per commit: `verbatim.mjs <sha>` ✔ (M) / `--hook <names>` ✔ (H), zero
exceptions in all eighteen; regen-e2e-footer after every app.js move;
check.mjs clean except `oldBpb`; e2e-globals/controls clean; prof set
29, unchanged (saveDraft/saveEdits/selEditApply/insertTime wraps all
travelled). Group: `perl -e 'alarm 1200; exec @ARGV' npm test` — only
`ps2-real`/`instruments` fail (pre-existing); modules 86/86; smoke 8/8;
`package.mjs`: 181 files, list identical. `src/app.js`: 13343 → 12139
(1,204 out, ~the row's estimate). Learning-mode gates untouched.
**Device check owed** (plan §3 step 5): edit/undo, quantize/split/join,
copy/paste, a drummer/bassist take, and — because saveDraft/saveEdits/
draftWrite moved file — a real-browser edit → reload → compare on a
scratch local song before this ships (memory: persistence needs a
device test).

**Step 6 — Done** (2026-10-04, worktree agent). Seven commits; the
layer-4 `src/session/` directory check.mjs's LAYERS reserved in step 0
now exists. `blockers.mjs` on the row's three sets first: song.js was
held by nine more app.js names, album.js by song.js, files.js by the
sync/publish web. So:

1–4. **M, re-homes** (each clean): `subtractTombstones`/
   `mergeLocalAdditions`/`annotationsFor`/`resolveNoteWith` →
   model/rollnotes.js (how a not-necessarily-open song's annotations are
   read — the P3/P4 version guard lives in annotationsFor); `bakeTempos`/
   `bakeMeter` → **model/rollnotes.js, not session/song.js as this row
   said** — pure by their own comment, and `draftFingerprint` (layer 2)
   bakes too; `draftFingerprint` → model/versions.js; `cmpBar` →
   ui/chrome.js and `syncDurSeg` → ui/note-editor.js (DOM-only leaves
   setSong/loadSong reach).
5. **M, new `session/song.js`** (463 lines): `finalizeNotesImpl`,
   `loadNotes`, `loadSong`/`loadSongInner`/`setSong`, `openDraft`/
   `openDraftDoc`, `fitViewImpl`, `updateSongMetaImpl` (step 5's port
   body, per the row), plus `rememberRecentSong`/`reflectSongURL`
   (session-level, carried along). wire.js imports the three `*Impl`
   from here now.
6. **M, new `session/album.js`** (119 lines): `albumStart`/
   `albumPlayIdx`/`albumNext`/`albumPrev`/`albumAdvanceImpl`/`albumLeave`/
   `albumClear`/`armAlbumLink`/`albumPos` — the part of album play that
   loads songs; the pure math and the strip stay in audio/transport.js.
7. **M, new `session/files.js`** (200 lines): `saveSongAs`,
   `openSaveForm` (+ `fillFolderSelect`/`folderChoices`/`localFolders`),
   `saveVersion`, `forkCurrentSong`, `renameLocalKeys`.
   **`revertSongToRepo`/`moveComposition` stay in app.js**: both are held
   by publishSong/updateManifest/markPublished/askCommitLog/discardPending/
   openSyncSheet/renderSyncPending/fingerprintOldDrafts/jobStart/
   clearTombstonesFor/copyAudioClips/fileStatus — step 8's sync web, not
   forced here.

Two findings worth the tooling queue. (a) **move.mjs's `profWrapName`
does not match a renamed port body's wrap**: `finalizeNotesImpl =
prof("finalizeNotes", finalizeNotesImpl)` — identifier `XImpl`, label
still `"X"` since step 3 — so the line stayed in app.js, assigning to an
import; hand-moved after the function in song.js, byte-identical, with a
`prof` import (the Deviations 11/14 prof-orphan precedent). Every later
move of `renderTrackbarImpl`/`updateSubtitleImpl`/`drawImpl`/
`playbackFrameImpl`/`buildScoreModelImpl` hits this until profWrapName
accepts `XImpl = prof("X", XImpl)`. (b) **session/ is layer 4, the same
layer as ui/*, ask/* and above render/*** — so a session file may not
call setInfo/draw/clampView/appConfirm/updateSongBtn/updateSyncBtn/
songTitleOf/buildScoreModel/finalizeNotes/updateSongMeta through their
ports (rule 10 flagged song.js on the first run, correctly); each such
import line became step 1/3's `XImpl as X` alias from the impl's home,
and only ports whose impl is still app.js (renderTrackbar,
updateEditBtnVis, updateChipBtn, updateSubtitle, askRender) stay
hooks.js imports. Expect the same rewrite in every later layer-4 move.

Per commit: `verbatim.mjs <sha>` ✔ ×7, zero exceptions (the hand-moved
prof line is identical text, so it matches); regen-e2e-footer after each
app.js move; check.mjs clean except `oldBpb` (66 → 69 files); e2e-
globals/controls clean; prof set 29 unchanged; rule 8's manifests kept
in step: index.html modulepreload + sw.js APP_MODULES (SW_VERSION nr-v21
→ nr-v24, one bump per file added) + devtools.js namespaces +
modules.test fileCount 64 → 67 (66 → 69 with vendor/ai/web). Group:
`perl -e 'alarm 1200; exec @ARGV' npm test` — only `ps2-real`/
`instruments` fail (pre-existing); modules 86/86; smoke 8/8;
`package.mjs`: 184 files = 181 + the three session files, nothing else.
`src/app.js`: 12139 → 11331 (808 out). **Device check owed** (plan §3
step 6): load, draft, Save As, fork, revert (scratch only).

**Step 7 — Done** (2026-10-04, worktree agent). Nine M commits, all into
files step 14 already created — no manifest, SW_VERSION or fileCount
change. `blockers.mjs` on every row cluster first: the voice menu, the
trackbar and File → Instruments… were ONE web (the menu's async label
fills call `buildVoiceMenu` back; `renderTrackbar` opens the menu; the
game-voice picker shares `renderGameInstNav` with the Instruments sheet;
`trackToggle`/`saveVoices` are the menu's own save path), the Mixer hung
off it through `trackToggle`/`saveTrackDir`, and everything else was a
leaf once `songRegionRight` (every popup's right edge) had a home. Order
chosen so each commit is blockers-clean on its own, leaves first:

1. **M** `songRegionRight`/`placeLassoBtn`/`toggleHl`/`updateLCD` + the
   port bodies `updateEditBtnVisImpl`/`updateSubtitleImpl`/
   `updateChipBtnImpl` (+`updateChipBtnInner`) → ui/chrome.js. wire.js
   imports the three impls from there; rule 10 then flagged the layer-4
   session/ callers exactly as step 6 predicted — song.js/files.js/
   album.js switched to `XImpl as X` aliases, gen/ and audio/ stay on
   hooks.js.
2. **M** `renderNoteList`/`openNoteList`/`updateChordStale`/`useFileKey` →
   ui/notes.js (five aliases: setInfo/draw/updateSubtitle, buildScoreModel,
   finalizeNotes).
3. **M** the Instruments web (`INST_SYS_ORDER`, `gameInstUsedBySong`,
   `gameSongRows`, `songInstrumentRows`, `currentSongGameContext`,
   `instKeys`, `sf2Registry`/`sf2RegistryAdd`, `instAudition`,
   `usedInstruments`/`usedInstrumentRows`, `renderGameInstNav`,
   `renderInstSheet`) → **ui/sheets.js** — not named by split-plan §1; it
   is a sheet, and the voice menu is its consumer, so sheets over
   voice-menu. No port touched.
4. **M** `openBassist`/`openDrummer`/`bsBuildControls`/`bsRefresh`/
   `drRefresh`/`drBuildControls` → ui/sheets.js.
5. **M** `wmLayoutSide`/`wmLayoutTabs`/`wmCloseWindow`/`wmLayoutAll`/
   `wmDockSide`/`wmSetSideModeFor`/`wmDockBottomWindow`/`wmFloat`/
   `makeWindow`/`wmOpenMenu`/`wmSideDividerize` → ui/wm.js (the phase-1
   "wmLayoutAll calls resize()" worry was a same-layer import all along).
   The `S.wm` migration block and the `makeWindow(...)` registrations are
   top-level statements and stay for step 12.
6. **M** `trackToggle`/`saveTrackDir`/`saveVoices`/`renameTrack` →
   ui/trackbar.js.
7. **M** `renderMixer`/`mixerStripEl`/`mixerStripDragize`/`openMixer`/
   `closeMixer`/`toggleMixer` + `reorderTrack` → ui/mixer.js
   (`reorderTrack`'s only caller is the strip drag and it re-renders the
   Mixer; left behind it kept the cluster blocked).
8. **M** the voice menu, one commit (a strongly-connected set):
   `gameVoiceLabels`/`gameVoiceLabel`/`sf2VoiceLabels`/`sf2VoiceLabel`/
   `openVoiceMenu`/`buildVoiceMenu`/`buildGameVoicePicker`/
   `openGameVoiceMenuTo`/`renderSf2Nav`/`sf2AuditionPreset`/
   `buildSf2VoicePicker`/`buildClipControls`/`gameVaultResolved`/
   `resolvedGameVaultSync` → ui/voice-menu.js.
9. **M** `renderTrackbarImpl` → ui/trackbar.js, last (needed
   `openVoiceMenu` real). Its `renderTrackbarImpl = prof("renderTrackbar",
   renderTrackbarImpl)` wrap travelled by itself — the first real use of
   the step 0 addendum below. wire.js now imports from app.js only
   `askRenderImpl`/`recFinishImpl`.

**Step 0 addendum** (first commit of this pass): move.mjs's
`profWrapName` accepts `XImpl = prof("X", XImpl)` (label = identifier
minus `Impl`; any other mismatch is still not a self-wrap) — step 6's
finding (a), with two fixture tests (modules 86 → 88).

Per commit: `verbatim.mjs <sha>` ✔ ×9, zero exceptions (one false start:
collapsing wire.js's multi-line `from "./app.js"` import onto one line
lost its `}` line to the checker — restored to the multi-line form,
amended, ✔); regen-e2e-footer after every move; check.mjs clean except
`oldBpb`; e2e-globals/controls clean; sorted prof label set unchanged (30
by `prof("…")` grep across src/ — the earlier write-ups' "29" counted the
same set before `updateLCD`'s own wrap was in scope; the set is what the
check compares, and it never changed). Rule 10 at layer 4 bit on every
ui/* commit but one, each time an `import { X } from "../hooks.js"`
move.mjs copied from app.js for a port whose impl is at layer ≤ 4 — all
rewritten to the `XImpl as X` alias (step 6 finding (b), now the rule for
every ui/session move); only `renderTrackbar` stayed a hooks.js import
until commit 9 made trackbar.js its home. Group: `perl -e 'alarm 1200;
exec @ARGV' npm test` — only `ps2-real`/`instruments` fail (pre-existing
local-rip gap), 878 pass; modules 88/88; `test:e2e:smoke` 8/8;
`package.mjs`: 184 files, list identical. `src/app.js`: 11331 → 9360
(1,971 out, ~the row's ~1,700). Learning-mode gates untouched
(`updateChordStale`'s and `useFileKey`'s bodies moved verbatim). Not
moved: `askRenderImpl` (not in this row — step 9's ask/* cluster) and
`recFinishImpl` (step 10, input/). **Browser check owed** (plan §3 step
7): chips M/S/H, voice audition, mixer, wm dock/float/close, phone width.
**Step 8 — Done** (2026-10-04, worktree agent, same pass as step 7).
Twelve M commits + one harness commit (the finding below), no new files. `blockers.mjs` first on the row's two
clusters: the import side was held by 33 app.js names, the sync side by
11, and both by each other in one direction only — `publishJobStart`
(sync) commits pending imports through `commitImports` (import), so import
goes first; and `renderSyncPending` (the sync sheet) wires `revertSongToRepo`
/`discardPending`/`cmpEnter` rows while `revertSongToRepo`, `discardPending`,
`publishOpenComposition`, `publishAllJobStart` and `fingerprintOldDrafts`
each re-render the open sheet — one SCC across sync/publish.js,
ui/sheets.js and session/files.js. Unblockers in dependency order, each
clean on its own, then the clusters:

1. **M** `folderTree`/`nodeAt`/`nodeCount`/`parentFolder`/`subfolderKeys`/
   `publishedLabel` → model/catalog.js (pure catalog walks; platform reads
   only). `songStatus`/`fileStatus` stayed for chrome.js — `dirtySongs` is
   layer 4.
2. **M** `retireEdited`/`pruneTombstones`/`clearTombstones`/
   `clearTombstonesFor` → model/edits.js (no new import at all).
3. **M** `jobsLoad`/`jobStart`/`jobsClearFinished` → **ui/sheets.js, not
   model/jobs.js**: `jobApi` (the per-job driver table) lives beside the
   jobs sheet at layer 4, and `jobStart` resumes stored jobs through it.
4. **M** `cmpEnter`/`cmpExit`/`cmpShow` → ui/chrome.js (beside step 6's
   `cmpBar`).
5. **M** `askSave`/`askCommitLog` → ask/bridge.js — two step-9 names pulled
   forward (`publishSong` appends the unsaved chat through `askCommitLog`);
   they belong with `askStore`/`askLogKey`, not ask/tools.js.
6. **M** `createComposition`/`editHereNow`/`forkClashTitle`/`makeItMine` →
   session/files.js (the rest of step 6's fork family).
7. **M** `updateManifest`/`manifestPlace` → sync/publish.js (both halves
   need them).
8. **M** the import leaves → import/capture.js: `slugFile`/`monoWavBytes`/
   `AUDIO_SIZE_GATE`/`SF2_SIZE_WARN`/`SF2_SIZE_REFUSE`/`importSf2File`/
   `chipTrackOrder`/`chipKindOf`/`chipVaultMeta`/`nsfModules`/
   `computeImportAlbumJson`/`impStatus`/`impRename`/`renameImportDraft`.
9. **M** the File-menu shell → ui/chrome.js: `songsheet`/`filesheet`/
   `filesub` (DOM handles), `closeFileMenus`/`openDropUp`, `fileStatus`,
   `songStatus`, `draftRow`.
10. **M** the capture/commit cluster → import/capture.js:
   `captureChipTrack`/`impCapture`/`captureJobStart`/`openChipImport`/
   `openNsfImport`/`batchCommit`/`commitImports`.
11. **M, the SCC, one commit, three `move.mjs` invocations** (the 4c
   precedent): sync/publish.js ← `publishSong`/`copyAudioClips`/
   `markPublished`/`markCurrentSongSynced`/`publishOpenComposition`/
   `publishUnsavedSong`/`publishAllJobStart`/`publishJobStart`/
   `fingerprintOldDrafts`/`discardPending`/`renameRepoTitle`/
   `renameRepoTitles`; ui/sheets.js ← `openSyncSheet`/`renderSyncPending`
   (the row's "sheets → ui/sheets"); session/files.js ←
   `revertSongToRepo`/`moveComposition` (step 6's two leftovers). Invoked
   in that order, so exactly two specifiers needed the §0 hand fix
   (publish.js's `renderSyncPending` → `../ui/sheets.js`, sheets.js's
   `revertSongToRepo` → `../session/files.js`). `sweepStrandedClones` was
   already in model/selection.js since step 5.
12. **M** the Import hub → import/hub.js: `openPickedFiles`/
   `importAudioFiles`/`localMidiOpen`/`nativeOpenUrl`/`nativeOpenHook`/
   `createGameFilesRepo`, the m3u four (`decodeM3u`/`parseM3u`/
   `applyM3uNames`/`applyM3uToAlbum`), and the `fsub*` submenu builders
   (`fsubItem`/`fsubHeader`/`fsubAlbums`/`fsubFolder`/`fsubSongs`/
   `fsubLocalFolder`/`fsubImportAlbum` — the Open and Import submenus share
   them, and the row files them under import/*).

Per commit: `verbatim.mjs <sha>` ✔ ×12, zero exceptions; regen-e2e-footer
after every move; check.mjs clean except `oldBpb`; e2e-globals/controls
clean; prof label set unchanged. Rule 10 at layer 4 fired on seven of the
twelve (import/, sync/, ask/ and session/ are all layer 4) — every copied
`../hooks.js` port import whose impl is at layer ≤ 4 rewritten to the
`XImpl as X` alias, 29 lines in all. Group: `perl -e 'alarm 1200; exec
@ARGV' npm test` — only `ps2-real`/`instruments` fail (pre-existing);
modules 89/89; `test:e2e:smoke` 8/8; `package.mjs`: 184 files, list
identical to step 7's. `src/app.js`: 9360 → 7457 (1,903 out, ~the row's
~1,350 plus the unblockers). Learning-mode gates untouched. **Device
check owed** (plan §3 step 8): an NSF import into scratch, a publish to
scratch — and, because `revertSongToRepo`/`discardPending`/
`moveComposition` moved file, one revert and one discard on a scratch
song (never his compositions).

**Step 8 finding — test rebinding vs rule 10 (fixed in the harness, own
commit).** The first full `npm test` after the twelve moves hung in the
m3u playlist test and node's `--test-force-exit` cancelled the 208 tests
behind it ("Promise resolution is still pending"). Cause: the test stubs
`appConfirm = async () => true` through `run()`, which rebinds the
DECLARING module's binding — hooks.js's port — and `applyM3uToAlbum` now
lives in import/hub.js, a layer-4 caller that rule 10 obliges to import
`appConfirmImpl as appConfirm` from ui/chrome.js directly; the stub never
reached it and the real confirm sheet awaited a tap forever. Sixteen
tests stub `appConfirm` this way (two `setInfo`, two `draw`), and every
future layer-4 move repeats the shape, so neither rule 10 (the plan's
design) nor the tests were the thing to change: `tests/harness.mjs`'s
`scopeProxy.set` now also rebinds `<name>Impl` whenever the assigned name
is one of hooks.js's own declarations — exactly §1 M1's stated property
("every test's `run("setInfo = …")` rebinds the port and all importers see
it"), restored for alias importers. The reverse needed nothing (wire.js
forwards through the live import binding, so `XImpl = f` already reaches
port callers). Fixture test in tests/modules.test.mjs (88 → 89); the
night-roll suite alone 427/427 afterwards; then the whole group re-run.
Not touched: the browser-side devtools mirror (hooks.js is GET-only there;
S.hooks is the only writable path) — grepped tests/e2e/: no Playwright
test stubs `appConfirm` or `S.hooks`, so nothing to add; if one ever
does on an import/sync flow, the same two-binding rule belongs in
devtools.js.
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
