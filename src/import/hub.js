import { FOLDER_NAMES } from "../model/catalog.js";

// ---- Import hub (docs/import-hub-design.md): File → Import… opens one screen,
// one section per format, instead of the old <label for="fileinput"> that just
// listed every extension in a row. Every section's Choose files… calls the SAME
// #fileinput.click() — a data-kind on the button only changes the status line's
// wording before the native picker opens; a file picked from the "wrong" section
// still falls through to openPickedFiles' own byte-sniff and routes correctly.
// a function, not a const object literal: FOLDER_NAMES is declared later in
// this same script (below the folders/save-form code) — evaluating its
// lookups here at top-level, at parse time, would hit the TDZ; a function
// body only reads FOLDER_NAMES once actually called, well after boot
export function importHubLabel(kind) {
  return {midi: "MIDI", nes: FOLDER_NAMES.nes, gb: FOLDER_NAMES["game-boy"],
    snes: FOLDER_NAMES.snes, genesis: FOLDER_NAMES.genesis, ps1: FOLDER_NAMES.ps1, ps2: FOLDER_NAMES.ps2,
    n64: FOLDER_NAMES.n64, sf2: "SoundFont", audio: "recording"}[kind];
}
