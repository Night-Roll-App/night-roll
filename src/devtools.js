// src/devtools.js — e2e mirror (docs/split-plan.md §3.4). page.evaluate
// reads/calls bare names (song, draw(), …) that lived in the global lexical
// scope of the old classic <script>; a module's top-level bindings are NOT
// window properties, so without this an e2e spec written against the old
// app would throw ReferenceError on every one of those. exposeGlobals()
// defines a window accessor for every export of every real module (as new
// modules are carved out of app.js in later steps, add their "import * as"
// line here too — tests/modules.test.mjs's rule-8 check enforces this list
// stays complete).
//
// Plain named exports (edition.js, and any real module carved out of app.js
// in later steps) are GET only (§3.4): an ES module's exported `let` binding
// is a live READ reference to importers, but importers cannot assign it —
// only the declaring module can.
//
// `S` (step 1's promote-state.mjs, src/state.js) is two-way: every field gets
// BOTH get and set, mirroring tests/harness.mjs's scopeProxy (§3.2) — real
// e2e specs assign bare names too (`song = …`, `mode = …`), and since step 1
// those names are `S` fields, not app.js top-level bindings any more.
//
// app.js is STILL the legacy container (docs/split-plan.md §4 step 0b
// deviation): whatever top-level names it has left — mostly functions, plus
// a few consts — aren't `export`ed, so the plain loop below would see
// nothing for it. cutover.mjs (0b) / tools/split/regen-e2e-footer.mjs
// (step 1 on, re-run after any change to app.js's top-level names) append a
// generated `export const __nrExpose$ = {get, set}` to app.js (same mechanism
// tests/harness.mjs's own per-module footer already uses), which this file
// mirrors onto window with BOTH get and set — a function reassigned by an
// e2e spec (`loadSong = …`) needs that same two-way access app.js's own
// `let`s used to get. Deleted in step 15 along with app.js itself.
//
// Never touches production unless window.__NR_EXPOSE is set
// (tests/e2e/helpers.mjs sets it before navigation) — left off by default
// so an un-imported name fails loudly instead of silently resolving through
// window.
import * as app from "./app.js";
import * as edition from "./edition.js";
import * as icons from "./ui/icons.js";
import * as controls from "./ui/controls.js";
import * as midiParse from "./midi/parse.js";
import * as midiWrite from "./midi/write.js";
import * as theoryChords from "./theory/chords.js";
import * as theoryKey from "./theory/key.js";
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
import { S } from "./state.js";

export function exposeGlobals() {
  // built inside the function, not as a top-level initializer (check.mjs
  // rule 4): app.js is layer 5, same as this file, and nothing here is
  // actually evaluation-order-sensitive — but keeping the object literal
  // out of top-level init code is the same discipline §2.2 asks of every
  // other module, free to apply here too.
  const MODULES = { app, edition, icons, controls, midiParse, midiWrite, theoryChords, theoryKey,
                     modelCatalog, modelGrid, modelEdits, modelRollnotes,
                     platformBase, platformMode, platformStorage, platformFolder, platformNative,
                     audioEngine, audioVoices, audioTransport,
                     audioChip, audioChipStream, audioClips, audioMetronome, audioBounce,
                     modelSong, modelSelection, modelProvenance, modelAlbumOrder, modelVersions, modelJobs,
                     importHub, importCapture, syncPublish };
  for (const ns of Object.values(MODULES)) {
    for (const name of Object.keys(ns)) {
      if (name === "__nrExpose$") continue; // the accessor object itself, not a global
      if (name in window) continue; // never shadow a real browser global
      Object.defineProperty(window, name, { configurable: true, enumerable: true, get: () => ns[name] });
    }
  }
  // S's fields (src/state.js) — two-way, same as app.js's generated mirror
  // below, so `song = …`/`mode = …` in a page.evaluate() keep working after
  // step 1 moved those names off app.js and onto S.
  for (const name of Object.keys(S)) {
    if (name in window) continue; // never shadow a real browser global
    Object.defineProperty(window, name, {
      configurable: true, enumerable: true,
      get: () => S[name],
      set: (v) => { S[name] = v; },
    });
  }
  // app.js's generated accessor mirror (see the file-header comment above) —
  // read AND write every one of its remaining top-level bindings.
  if (app.__nrExpose$) {
    for (const name of Object.keys(app.__nrExpose$.get)) {
      if (name in window) continue; // never shadow a real browser global
      const setter = app.__nrExpose$.set[name];
      const desc = { configurable: true, enumerable: true, get: app.__nrExpose$.get[name] };
      if (setter) desc.set = setter;
      Object.defineProperty(window, name, desc);
    }
  }
}
