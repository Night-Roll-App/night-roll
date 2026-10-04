// src/devtools.js — e2e mirror (docs/split-plan.md §3.4). page.evaluate
// reads/calls bare names (song, draw(), …) that lived in the global lexical
// scope of the old classic <script>; a module's top-level bindings are NOT
// window properties, so without this an e2e spec written against the old
// app would throw ReferenceError on every one of those. exposeGlobals()
// defines a window accessor for every export of every module (a new module
// needs its "import * as" line here too — tests/modules.test.mjs's rule-8
// check enforces this list stays complete).
//
// Named exports are GET only (§3.4): an ES module's exported binding is a
// live READ reference to importers, but importers cannot assign it — only
// the declaring module can. tools/split/check-e2e-globals.mjs proves no
// spec needs more.
//
// `S` (step 1's promote-state.mjs, src/state.js) is two-way: every field gets
// BOTH get and set, mirroring tests/harness.mjs's scopeProxy (§3.2) — real
// e2e specs assign bare names too (`playCursor = …`, `rollnotes = …`), and
// since step 1 those names are `S` fields.
//
// Never touches production unless window.__NR_EXPOSE is set
// (tests/e2e/helpers.mjs sets it before navigation) — left off by default
// so an un-imported name fails loudly instead of silently resolving through
// window.
import * as edition from "./edition.js";
import * as icons from "./ui/icons.js";
import * as controls from "./ui/controls.js";
import * as piano from "./ui/piano.js";
import * as midiParse from "./midi/parse.js";
import * as midiWrite from "./midi/write.js";
import * as theoryChords from "./theory/chords.js";
import * as theoryKey from "./theory/key.js";
import * as theoryFactsCommon from "./theory/facts/common.js";
import * as theoryFactsPattern from "./theory/facts/pattern.js";
import * as theoryFactsForm from "./theory/facts/form.js";
import * as theoryFactsMelody from "./theory/facts/melody.js";
import * as theoryFactsRhythm from "./theory/facts/rhythm.js";
import * as theoryFactsBass from "./theory/facts/bass.js";
import * as theoryFactsVoices from "./theory/facts/voices.js";
import * as theoryFactsFormat from "./theory/facts/format.js";
import * as theoryHarmonyRoman from "./theory/harmony/roman.js";
import * as theoryHarmonyCadence from "./theory/harmony/cadence.js";
import * as theoryHarmonyNct from "./theory/harmony/nct.js";
import * as theoryHarmonyModulation from "./theory/harmony/modulation.js";
import * as modelCatalog from "./model/catalog.js";
import * as modelGrid from "./model/grid.js";
import * as modelEdits from "./model/edits.js";
import * as modelRollnotes from "./model/rollnotes.js";
import * as platformBase from "./platform/base.js";
import * as platformMode from "./platform/mode.js";
import * as platformStorage from "./platform/storage.js";
import * as platformFolder from "./platform/folder.js";
import * as platformNative from "./platform/native.js";
import * as audioEngine from "./audio/engine.js";
import * as audioVoices from "./audio/voices.js";
import * as audioTransport from "./audio/transport.js";
import * as audioChip from "./audio/chip.js";
import * as audioChipStream from "./audio/chip-stream.js";
import * as audioClips from "./audio/clips.js";
import * as audioMetronome from "./audio/metronome.js";
import * as audioBounce from "./audio/bounce.js";
import * as modelSong from "./model/song.js";
import * as modelSelection from "./model/selection.js";
import * as modelProvenance from "./model/provenance.js";
import * as modelAlbumOrder from "./model/album-order.js";
import * as modelVersions from "./model/versions.js";
import * as modelJobs from "./model/jobs.js";
import * as importHub from "./import/hub.js";
import * as importCapture from "./import/capture.js";
import * as syncPublish from "./sync/publish.js";
import * as genDrummer from "./gen/drummer.js";
import * as genBassist from "./gen/bassist.js";
import * as genAnalysis from "./gen/analysis.js";
import * as renderRoll from "./render/roll.js";
import * as renderTracks from "./render/tracks.js";
import * as renderScore from "./render/score.js";
import * as renderScorePrint from "./render/score-print.js";
import * as renderInstrument from "./render/instrument.js";
import * as renderCof from "./render/cof.js";
import * as renderCompare from "./render/compare.js";
import * as inputGestures from "./input/gestures.js";
import * as inputRecord from "./input/record.js";
import * as inputKeyboard from "./input/keyboard.js";
import * as askBackend from "./ask/backend.js";
import * as askTools from "./ask/tools.js";
import * as askContext from "./ask/context.js";
import * as askBridge from "./ask/bridge.js";
import * as askShots from "./ask/shots.js";
import * as askSheet from "./ask/sheet.js";
import * as askClient from "./ask/client.js";
import * as askHost from "./ask/host.js";
import * as askAnnotate from "./ask/annotate.js";
import * as uiChrome from "./ui/chrome.js";
import * as uiTrackbar from "./ui/trackbar.js";
import * as uiMixer from "./ui/mixer.js";
import * as uiVoiceMenu from "./ui/voice-menu.js";
import * as uiNotes from "./ui/notes.js";
import * as uiNoteEditor from "./ui/note-editor.js";
import * as uiSheets from "./ui/sheets.js";
import * as uiWm from "./ui/wm.js";
import * as uiVellane from "./ui/vellane.js";
import * as sessionSong from "./session/song.js";
import * as sessionAlbum from "./session/album.js";
import * as sessionFiles from "./session/files.js";
import * as sessionBoot from "./session/boot.js";
import * as uiPerf from "./ui/perf.js";
import * as platformSw from "./platform/sw.js";
import * as hooks from "./hooks.js";
import * as wire from "./wire.js";
import { S } from "./state.js";

export function exposeGlobals() {
  // built inside the function, not as a top-level initializer (check.mjs
  // rule 4): nothing here is evaluation-order-sensitive, but keeping the
  // object literal out of top-level init code is the same discipline §2.2
  // asks of every other module, free to apply here too.
  const MODULES = { edition, icons, controls, piano, midiParse, midiWrite, theoryChords, theoryKey,
                     theoryFactsCommon, theoryFactsPattern, theoryFactsForm, theoryFactsMelody, theoryFactsRhythm, theoryFactsBass, theoryFactsVoices, theoryFactsFormat,
                     theoryHarmonyRoman, theoryHarmonyCadence, theoryHarmonyNct, theoryHarmonyModulation,
                     modelCatalog, modelGrid, modelEdits, modelRollnotes,
                     platformBase, platformMode, platformStorage, platformFolder, platformNative,
                     audioEngine, audioVoices, audioTransport,
                     audioChip, audioChipStream, audioClips, audioMetronome, audioBounce,
                     modelSong, modelSelection, modelProvenance, modelAlbumOrder, modelVersions, modelJobs,
                     importHub, importCapture, syncPublish,
                     genDrummer, genBassist, genAnalysis,
                     renderRoll, renderTracks, renderScore, renderScorePrint, renderInstrument, renderCof, renderCompare,
                     inputGestures, inputRecord, inputKeyboard,
                     askBackend, askTools, askContext, askBridge, askShots, askSheet, askClient, askHost, askAnnotate,
                     uiChrome, uiTrackbar, uiMixer, uiVoiceMenu, uiNotes, uiNoteEditor, uiSheets, uiWm, uiVellane,
                     sessionSong, sessionAlbum, sessionFiles, sessionBoot, uiPerf, platformSw,
                     hooks, wire };
  for (const ns of Object.values(MODULES)) {
    for (const name of Object.keys(ns)) {
      if (name in window) continue; // never shadow a real browser global
      Object.defineProperty(window, name, { configurable: true, enumerable: true, get: () => ns[name] });
    }
  }
  // S's fields (src/state.js) — two-way, so `song = …`/`mode = …` in a
  // page.evaluate() keep working after step 1 moved those names onto S.
  for (const name of Object.keys(S)) {
    if (name in window) continue; // never shadow a real browser global
    Object.defineProperty(window, name, {
      configurable: true, enumerable: true,
      get: () => S[name],
      set: (v) => { S[name] = v; },
    });
  }
}
