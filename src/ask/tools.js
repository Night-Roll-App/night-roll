import { play } from "../audio/transport.js";
import { playSec } from "../audio/transport.js";
import { setHearMidi } from "../audio/chip.js";
import { dedupedNotesWithIndex } from "../model/rollnotes.js";
import { annoShown } from "../model/rollnotes.js";
import { visibleNotes } from "../model/rollnotes.js";
import { S } from "../state.js";
import { noteToJSON } from "../model/rollnotes.js";
import { baseName } from "../model/rollnotes.js";
import { LINK_SONGS } from "../platform/base.js";
import { declaredTsForKey } from "../model/rollnotes.js";
import { barTicks } from "../model/rollnotes.js";
import { beatTicks } from "../model/grid.js";
import { askKeySpellComment } from "./context.js";
import { trackIsDrums } from "../model/grid.js";
import { trackAudible } from "../audio/engine.js";
import { askBarRow } from "./context.js";
import { askSpanNotesCompact } from "./context.js";
import { LETTER_PC } from "../theory/chords.js";
import { editableSong } from "../model/song.js";
import { ROLLNOTES_LOCK_MSG } from "../model/rollnotes.js";
import { parseRollnotes } from "../model/rollnotes.js";
import { dropSupersededBy } from "../model/rollnotes.js";
import { resolveNote } from "../model/rollnotes.js";
import { finalizeNotesImpl as finalizeNotes } from "../session/song.js";
import { saveLocalNotes } from "../model/edits.js";
import { drawImpl as draw } from "../ui/chrome.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { updateSyncBtnImpl as updateSyncBtn } from "../ui/chrome.js";
import { setBeatSub, renderViewMenu } from "../ui/chrome.js";
import { setVolBtnShown } from "../ui/chrome.js";
import { dropLocalKeyAt } from "../model/rollnotes.js";
import { retireEdited } from "../model/edits.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { clampViewImpl as clampView } from "../ui/chrome.js";
import { updateSubtitleImpl as updateSubtitle } from "../ui/chrome.js";
import { tombstone } from "../model/edits.js";
import { connected } from "../sync/publish.js";
import { writeToken } from "../sync/publish.js";
import { ghHeaders } from "../audio/chip.js";
import { isComposition } from "../model/provenance.js";
import { publishSong } from "../sync/publish.js";
import { writeSongsReadme } from "../sync/publish.js";
import { initCatalog } from "../model/catalog.js";
import { renderSyncPending } from "../ui/sheets.js";
import { folderActive } from "../platform/folder.js";
import { fsRoot } from "../platform/folder.js";
import { readData } from "../platform/folder.js";
import { parseMidi } from "../midi/parse.js";
import { songTitleOfImpl as songTitleOf } from "./context.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { applyTake } from "../gen/bassist.js";
import { bsGenerate } from "../gen/bassist.js";
import { insertTime } from "../model/selection.js";
import { openGapShift } from "../model/selection.js";
import { pushUndo } from "../model/edits.js";
import { annoSnapshot } from "../model/edits.js";
import { putSongNote } from "../model/rollnotes.js";
import { songNoteFor } from "../model/rollnotes.js";
import { songNoteCleanTitle } from "../model/rollnotes.js";
import { saveEdits } from "../model/edits.js";
import { computeSongEnd } from "../model/song.js";
import { saveDraft } from "../model/versions.js";
import { draftKeys } from "../model/versions.js";
import { groupOf } from "../model/catalog.js";
import { folderOf } from "../model/catalog.js";
import { folderTitle } from "../model/catalog.js";
import { deleteTime } from "../model/selection.js";
import { drGenerate } from "../gen/drummer.js";
import { addTrackUndoable } from "../model/edits.js";
import { undoTrackAdd } from "../model/edits.js";
import { renderTrackbarImpl as renderTrackbar } from "../ui/trackbar.js"; // same layer as ask/tools.js — direct import, not the hooks.js port (that's for gen/drummer.js's lower-layer upcall)
import { deleteSelection } from "../model/selection.js";
import { quantizeSelection } from "../model/selection.js";
import { splitSelectionAt } from "../model/selection.js";
import { splitSelectionHalves } from "../model/selection.js";
import { joinSelection } from "../model/selection.js";
import { divideSelection } from "../model/selection.js";
import { removeDuplicateNotes } from "../model/selection.js";
import { setSelectionVelocity } from "../model/selection.js";
import { nudgeSelection } from "../model/selection.js";
import { diatonicShift } from "../model/selection.js";
import { copySelection } from "../model/selection.js";
import { pasteClipboard } from "../model/selection.js";
import { moveSelectionToTrack } from "../model/selection.js";
import { selEditItems } from "../model/selection.js";
import { setSelectionShape } from "../model/noteshape.js";
import { SHAPE_ROOM_V } from "../model/noteshape.js";
import { SHAPE_PRESETS } from "../model/noteshape.js";
import { sfDeclaredAtRaw } from "../model/song.js";
import { drBassTrack } from "../gen/drummer.js";
import { askAct } from "./actions.js";
import { askActTruthy } from "./actions.js"; // a cycle inside layer 4 (actions.js imports the gate/validators back) — legal (check.mjs §2.3), and neither side touches the other at module-eval time
import { askActGiven } from "./actions.js";
// ---- batch 7 (docs/ai-parity.md §5 row 7, 2026-10-05): tracks and albums.
// set_track/add_track/delete_track persist through the SAME functions the
// mixer/voice-menu/trackbar UI call (saveTrackDir, renameTrack, the
// addTrackUndoable/pushUndo({kind:"trackRemove"|"trackInsert"}) pair the ＋
// chip and the voice menu's ✕ Delete track already use) — never localStorage.
import { saveTrackDir } from "../ui/trackbar.js";
import { renameTrack } from "../ui/trackbar.js";
import { updateTrackGains } from "../audio/engine.js";
import { transposeTrack } from "../model/selection.js";
import { VOICES } from "../audio/voices.js";
import { PATCH_PRESETS } from "../model/patch.js";
import { PATCH_PARAMS } from "../model/patch.js";
import { PATCH_WAVES } from "../model/patch.js";
import { parsePatchVoice } from "../model/patch.js";
import { patchVoiceId } from "../model/patch.js";
import { patchLabel } from "../model/patch.js";
import { captureKeep } from "../input/record.js";
import { albumStart } from "../session/album.js";
import { albumNext } from "../session/album.js";
import { albumPrev } from "../session/album.js";
import { albumLeave } from "../session/album.js";
import { albumEffectiveOrder } from "../model/album-order.js";
// ---- batch 8 (docs/ai-parity.md §5 row 8, 2026-10-05): song files and
// device prefs. song_file reuses the File menu's own entry points
// (createComposition/saveSongAs, forkCurrentSong, renameImportDraft/
// renameRepoTitle, pushVersion/readVersions, shareLinkFor) — never a
// parallel path; set_pref reuses the Settings sheet's own setters
// (setAlbumOrderPref, settingsPersist) or, where none exists yet
// (octave_numbers), the #octbtn handler's own two lines, verbatim.
import { createComposition } from "../session/files.js";
import { saveSongAs } from "../session/files.js";
import { forkCurrentSong } from "../session/files.js";
import { isUnsaved } from "../model/provenance.js";
import { slugify } from "../model/provenance.js";
import { folderFromInput } from "../model/provenance.js";
import { renameImportDraft } from "../import/capture.js";
import { renameRepoTitle } from "../sync/publish.js";
import { shareLinkFor } from "../sync/publish.js";
import { catalogHas } from "../model/catalog.js";
import { draftStoreKey } from "../platform/storage.js";
import { readVersions } from "../model/versions.js";
import { pushVersion } from "../model/versions.js";
import { filesMirror } from "../model/versions.js";
import { stop } from "../audio/transport.js";
import { setAlbumOrderPref } from "../model/album-order.js";
import { refreshSelInfo } from "../ui/note-editor.js";
import { settingsPersist } from "../ui/sheets.js";

// Same set serializeRollnotes would publish, each entry tagged with an "id"
// (its index into `rollnotes`) — edit_annotation/delete_annotation target by
// it. Only stable for the one Ask turn that reads this context block: an
// edit re-sorts rollnotes (finalizeNotes), so a SECOND tool call in the same
// reply should re-target by bar/beat/match_text instead of a now-stale id.
export function askAnnotationsText() {
  const rows = dedupedNotesWithIndex(S.rollnotes).filter(({n}) => annoShown(n)).map(({n, i}) => "  " + JSON.stringify(Object.assign({id: i}, noteToJSON(n)))); // annoShown, not visibleNotes: ids stay indices into S.rollnotes whole; a Learning-hidden ✦ AI estimate is simply absent
  return '{ "version": 1, "song": ' + JSON.stringify(baseName()) + ', "notes": [\n' + rows.join(",\n") + "\n] }\n";
}
// askAnnotationsTextCompact (step 5, docs/ask-token-plan.md): the SAME ids
// (dedupedNotesWithIndex's index into rollnotes — edit_annotation/
// delete_annotation's "id" either way), the .rollnotes TEXT grammar's own
// bar.beat span instead of JSON, and the kind/value split edit_annotation
// already computes (askNoteKind/askNoteValue — one place decides what an
// existing note "is", never duplicated). Structural track:/lane:/audio:
// directives (askAnnotationStructural — song-structure, not analysis, and
// out of scope for edit/delete_annotation already) are left out: the model
// never needs them to discuss the music, and the app's own editor is where
// they change. Sent to the BRIDGE only (askContext); local providers keep
// askAnnotationsText, full JSON, every turn.
export function askAnnotationsTextCompact() {
  const rows = dedupedNotesWithIndex(S.rollnotes).filter(({n}) => annoShown(n) && !askAnnotationStructural(n)).map(({n, i}) => {
    const kind = askNoteKind(n), value = askNoteValue(n, kind);
    const at = "[" + n.b1 + "." + (n.q1 || 1) + (n.b2 ? "-" + n.b2 + "." + (n.q2 || 1) : "") + "]";
    return i + " " + at + " " + kind + ": " + value + (n.cnote ? " — " + n.cnote : "");
  });
  return rows.length ? rows.join("\n") : "(no annotations)";
}
// ---- ✦ AI tools (Josh, 2026-09-26): "if I propose putting an F sharp minor
// chord annotation on 21.1, then it should just be able to do it" — and read
// other songs in the repo. The APP runs the tools (the model only asks), so
// they work the same against LM Studio, the Claude bridge, or anything else
// that speaks OpenAI tool calls. Annotations land as "added" (unsynced), like
// his own, with the ✕ in Save & Commit; the prompt limits writing to what he
// asked for in words.
export const ASK_TOOLS = []; // empty since 2026-10-05 (docs/ai-parity.md §5 batch 3): every one of the twelve became an action of `act` (src/ask/actions.js) — the same functions below, reached through the registry. Kept as the (pure-data) place a tool with a schema of its own would go, should one ever need one; askToolsNow appends act to it.
// edit_annotation/delete_annotation (2026-10-01, open-items): targeting for
// an EXISTING annotation, robust the way the issue asked — by id (this
// turn's context listing, dedupedNotesWithIndex's index into rollnotes) or
// by bar+beat+match_text. Never guesses: 0 or >1 candidates is an error.
export function askFindAnnotation(a) {
  if (!S.song || !S.songKey) throw new Error("no song open");
  if (LINK_SONGS) throw new Error("this song is being viewed from a link to another repo — read-only");
  a = a || {};
  if (a.id !== undefined && a.id !== null && a.id !== "") {
    const id = Math.round(+a.id);
    if (!(id >= 0 && id < S.rollnotes.length) || !annoShown(S.rollnotes[id])) throw new Error("no annotation with id " + a.id + " — it may be stale (another edit in this reply re-sorts them); use bar+beat instead"); // annoShown: a Learning-hidden ✦ AI estimate was never listed, so it is not addressable either
    return S.rollnotes[id];
  }
  if (a.bar === undefined || a.beat === undefined) throw new Error("say which annotation: its id from the context, or its bar and beat");
  const bar = Math.max(1, Math.round(+a.bar)), beat = Math.max(1, +a.beat);
  let cands = visibleNotes().filter(n => n.b1 === bar && Math.abs((n.q1 || 1) - beat) < 1e-6);
  if (a.match_text) {
    const t = String(a.match_text).trim().toLowerCase();
    const narrowed = cands.filter(n => (n.text || "").toLowerCase().includes(t));
    if (narrowed.length) cands = narrowed;
  }
  if (!cands.length) throw new Error("no annotation at bar " + bar + " beat " + beat + (a.match_text ? " matching \"" + a.match_text + "\"" : ""));
  if (cands.length > 1) throw new Error("more than one annotation at bar " + bar + " beat " + beat + ": " +
    cands.map(n => JSON.stringify((n.text || "").split("\n")[0])).join(", ") + " — say which (match_text, or its id from the context)");
  return cands[0];
}
export function askNoteKind(n) { // the add_annotation "kind" this existing note was written as
  if (n.section) return "section";
  if (n.chord) return "chord";
  if (n.keydir !== undefined || n.keypartial) return "key";
  if (n.tempodir !== undefined) return "tempo";
  if (n.loopTo !== undefined) return "loop";
  if (n.study) return "analysis"; // an Analysis-sheet entry (model/rollnotes.js putStudyEntry) — never a plain note to edit_annotation
  if (n.songnote) return "songnote"; // a titled song note: the context lists "songnote: <title> — <body>"; song_note edits it
  return "note";
}
export function askNoteValue(n, kind) { // the "text" add_annotation would need to reproduce n's own value — chord/section store the bare symbol/label; key/tempo/loop carry a "kind: " prefix
  if (kind === "note") return n.text || "";
  const m = (n.text || "").match(/^[a-z]+:\s*(.+)$/is);
  return m ? m[1].trim() : (n.text || "");
}
export function askAnnotationStructural(n) { // meter/chop/track/audio/lane: song-structure directives, not annotations — out of scope for edit/delete_annotation (see NIGHT-ROLL.md ✦ AI)
  return !!(n.tsdir || n.chopdir || n.trackdir || n.audiodir || /^lane:\s*-?\d+\s*$/i.test(n.text || ""));
}
export function notesTxtForDoc(doc, name, fromBar, toBar, maxChars, key) { // notesTxtFor's shape for ANOTHER song (no key stated, sharp spelling)
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pn = p => NAMES[p % 12] + (Math.floor(p / 12) - 1);
  // HIS declared meter, never doc.timesig (the file's own raw label) — see
  // declaredTsForKey and notesTxtFor's matching fix (C8)
  const declared = (S.song && key && key === S.songKey) ? S.declaredTs : declaredTsForKey(key);
  const ts = declared || [4, 4];
  const tsLabel = declared ? declared[0] + "/" + declared[1] : "4/4? (not declared)";
  const bt = ts[0] * 4 / ts[1] * doc.ppq;
  let end = 0;
  doc.tracks.forEach(t => t.notes.forEach(n => { if (!n.gone) end = Math.max(end, n.t + n.d); }));
  const nBars = Math.ceil(end / bt - 0.05);
  const b0 = Math.max(0, (fromBar || 1) - 1), b1 = Math.min(nBars, toBar || nBars);
  const fmt = x => x.toFixed(2).replace(/\.?0+$/, "");
  const L = ["# " + name + " — " + tsLabel + ", " + Math.round(6e7 / doc.tempos[0].usq) + "bpm, " + nBars + " bars" + (b0 || b1 < nBars ? " (bars " + (b0 + 1) + "–" + b1 + " shown)" : ""),
             "# Format: bar N: beat pitch duration-in-quarter-notes; duration is GATE TIME, rhythm comes from onset spacing; sharp spelling, no key stated"];
  let size = L.join("\n").length, cut = null;
  doc.tracks.forEach((tr, ti) => {
    const rows = [];
    for (let b = b0; b < b1; b++) {
      if (cut !== null && b + 1 > cut) break;
      const ns = tr.notes.filter(n => !n.gone && n.t >= b * bt && n.t < (b + 1) * bt);
      if (!ns.length) continue;
      const row = "bar " + (b + 1) + ": " + ns.map(n => fmt((n.t - b * bt) / doc.ppq + 1) + " " + pn(n.p) + " " + fmt(n.d / doc.ppq)).join(", ");
      if (maxChars && size + row.length + 40 > maxChars) { cut = b + 1; break; }
      rows.push(row); size += row.length + 1;
    }
    if (rows.length) { L.push("", "## track " + (ti + 1) + (tr.name ? " (" + tr.name + ")" : "")); L.push(...rows); }
  });
  if (cut !== null) L.push("# (cut at bar " + cut + " to fit — ask for a narrower range)");
  return L.join("\n");
}
// askSongMatches / askSongPath (rewritten 2026-10-05, docs/ai-parity.md §4):
// the catalog AND this device's drafts (local/ songs and local copies — the
// first version took the first catalog hit and never saw a draft), every
// match listed, never a guess: an exact path / title / file-name match wins
// outright; failing that, a title that contains the words; more than one
// survivor is an error naming each with where it lives, so the user says
// which. One path is one song even when a draft shadows its catalog entry.
export function askSongMatches(p) { // → [{path, title, where}] in catalog order, drafts after
  const q = String(p || "").trim().toLowerCase().replace(/\.midi?$/i, "");
  if (!q) return [];
  const all = [], seen = new Set();
  const add = (path, title, where) => { if (!seen.has(path)) { seen.add(path); all.push({path, title, where}); } };
  for (const [album, songs] of Object.entries(S.CATALOG)) for (const [title, path] of songs) add(path, title, album);
  for (const key of draftKeys()) add(key, songTitleOf(key), (groupOf(key) || folderTitle(folderOf(key))) + ", on this device");
  const file = s => s.path.split("/").pop().replace(/\.midi?$/i, "").toLowerCase();
  const exact = all.filter(s => s.path.toLowerCase() === q || s.path.toLowerCase() === q + ".mid" || s.title.toLowerCase() === q || file(s) === q);
  if (exact.length) return exact;
  return all.filter(s => s.title.toLowerCase().includes(q) || file(s).includes(q));
}
export function askSongPath(p) { // a path, a title, or a bare name → the one path; an ambiguous name is an error listing the candidates
  if (!String(p || "").trim()) throw new Error("which song?");
  const m = askSongMatches(p);
  if (m.length === 1) return m[0].path;
  if (!m.length) throw new Error("no song named " + JSON.stringify(String(p).trim()) + " — list_songs lists them");
  throw new Error("which one? " + m.map(s => s.title + " (" + s.where + ")").join(" or ") + " — say the title and album, or the path");
}
// askReadBars (step 6, docs/ask-token-plan.md): the OPEN song only (another
// song's bars are read_song's job) — LIVE state (song.tracks, not a reload),
// so an unsaved edit shows up immediately. Reuses askBarRow (the same per-
// bar math askSpanNotesCompact/askSpanNotesCompactCached build on) so a
// plain (no tracks filter) call is BYTE-IDENTICAL to askSpanNotesCompact for
// that span — one format, never a second one drifting beside it. Capped to
// ASK_READ_BARS_MAX bars: a deliberate "give me more" lookup should stay
// small, independent of the window budget's own (much larger) cap.
export const ASK_READ_BARS_MAX = 32;
export function askReadBars(a) {
  if (!S.song || !S.songKey) throw new Error("no song open");
  a = a || {};
  const bt = barTicks(), qt = beatTicks();
  const nBars = Math.max(1, Math.ceil(S.songEndTick / bt));
  let from = Math.max(1, Math.round(+a.from_bar || 1));
  let to = Math.max(from, Math.round(+(a.to_bar !== undefined ? a.to_bar : from)));
  to = Math.min(to, nBars);
  let truncated = false;
  if (to - from + 1 > ASK_READ_BARS_MAX) { to = from + ASK_READ_BARS_MAX - 1; truncated = true; }
  const t0 = (from - 1) * bt, t1 = to * bt;
  let text;
  if (Array.isArray(a.tracks) && a.tracks.length) {
    const want = new Set(a.tracks.map(x => String(x).toLowerCase()));
    const {est, line} = askKeySpellComment(t0, t1);
    const L = [line];
    S.song.tracks.forEach((tr, ti) => {
      if (!want.has(String(ti + 1)) && !(tr.name && want.has(tr.name.toLowerCase()))) return;
      const drums = trackIsDrums(ti);
      const head = "\nT" + (ti + 1) + (tr.name ? " " + tr.name : "") + (drums ? " [drums]" : "") + (trackAudible(ti) ? "" : " [muted]");
      const rows = [];
      for (let b = from - 1; b < to; b++) { const row = askBarRow(tr, ti, b, bt, qt, est); if (row) rows.push(row); }
      if (rows.length) { L.push(head); L.push(...rows); }
    });
    text = L.join("\n");
  } else {
    text = askSpanNotesCompact(t0, t1, 6000); // same cap read_song uses for another song's text
  }
  return text + (truncated ? "\n# (truncated to " + ASK_READ_BARS_MAX + " bars — read_bars again from bar " + (to + 1) + " for the rest)" : "");
}
// ---- write_notes (2026-10-02): replaces the removed ✦ Fill button — Josh
// found Fill's separate UI confusing and wanted plain chat instead ("type
// 'insert a gallop on C3 on the triangle' ... and have it just work",
// open-items.md 19:02/19:05). The model spells out every note itself (no
// shorthand expansion); the app only validates and lands them. Landing goes
// through the SAME applyTake (one ⟲ group step) Fill and the Bassist/
// Drummer generators already use — erase-by-onset within [t0, t1), never a
// splice. Gate = editableSong(), same as every other writing path; never
// drums, same as Fill never offered a drums track as a target.
export function askNormChip(s) { // common chip-name shorthand → the default track-name spelling, so "square 1"/"sq1" match a track literally named "pulse1"
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^square/, "pulse").replace(/^sq/, "pulse").replace(/^tri$/, "triangle");
}
export function askFindTrackIndex(name) { // never the selected track — an unmatched or ambiguous name is an error naming the song's own track names
  const names = S.song.tracks.map((tr, ti) => tr.name || "track " + (ti + 1));
  const want = String(name || "").trim();
  if (!want) throw new Error("say which track: " + names.join(", "));
  const lower = want.toLowerCase();
  let hits = names.map((n, ti) => ti).filter(ti => names[ti].toLowerCase() === lower);
  if (!hits.length) { const norm = askNormChip(want); hits = names.map((n, ti) => ti).filter(ti => askNormChip(names[ti]) === norm); }
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new Error("more than one track matches \"" + want + "\": " + hits.map(ti => names[ti]).join(", ") + " — say which");
  throw new Error("no track named \"" + want + "\" — this song's tracks: " + names.join(", "));
}
export function parsePitch(s) { // letter, up to two ASCII accidentals, octave — pitchName's convention (C4 = 60); or a MIDI number
  if (typeof s === "number") return Number.isInteger(s) ? s : null;
  const t = String(s).trim();
  if (/^\d{1,3}$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^([A-Ga-g])(##|bb|#|b|♯|♭|x)?(-?\d)$/);
  if (!m) return null;
  const acc = {"": 0, "#": 1, "♯": 1, "##": 2, x: 2, b: -1, "♭": -1, bb: -2}[m[2] || ""];
  return LETTER_PC[m[1].toUpperCase()] + acc + (parseInt(m[3], 10) + 1) * 12;
}
export function askNoteVel(t, bs) { return Math.abs(((t - bs) / beatTicks()) % 1) < 0.01 ? (Math.abs(t - bs) < 5 ? 96 : 88) : 78; }
// the Bassist's metric rule, no jitter — the write_notes default when the model omits vel
export function askWriteNotesValidate(notes, bt, qt, beats) { // → {hits} in display ticks, or {error} naming EVERY bad note (nothing written on any failure)
  if (!Array.isArray(notes) || !notes.length) return {error: "notes must be a non-empty array"};
  if (notes.length > 256) return {error: "more than 256 notes in one call — split it up"};
  const errs = [], hits = [];
  notes.forEach((n, i) => {
    const where = "note " + (i + 1) + " (" + JSON.stringify(n) + ")";
    if (!n || typeof n !== "object") { errs.push(where + ": not an object"); return; }
    if (!Number.isInteger(n.bar) || n.bar < 1) { errs.push(where + ": bar must be a whole number ≥ 1"); return; }
    if (typeof n.beat !== "number" || !(n.beat >= 1 && n.beat < beats + 1)) { errs.push(where + ": beat must be ≥ 1 and < " + (beats + 1) + " (" + beats + " beats per bar)"); return; }
    if (typeof n.dur_beats !== "number" || !(n.dur_beats > 0)) { errs.push(where + ": dur_beats must be > 0"); return; }
    const p = parsePitch(n.pitch);
    if (p === null) { errs.push(where + ": pitch must be like C4, F#3, Bb2 (C4 = middle C), or a MIDI number"); return; }
    if (p < 24 || p > 108) { errs.push(where + ": pitch out of playable range (C1–C8)"); return; }
    const bs = (n.bar - 1) * bt, t = bs + (n.beat - 1) * qt;
    const vel = n.vel !== undefined && n.vel !== null && n.vel !== "" ? Math.max(1, Math.min(127, Math.round(+n.vel))) : askNoteVel(t, bs);
    hits.push({t: Math.round(t), d: Math.max(20, Math.round(n.dur_beats * qt)), p, v: vel, bar: n.bar});
  });
  if (errs.length) return {error: errs.join("; ")};
  return {hits};
}
export function askWritableGate() { // write_notes' gate — Fill's rule, carried over: only the user's own editable songs
  if (!S.song) return "no song open";
  if (editableSong()) return null;
  if (LINK_SONGS) return "this song is being viewed from a link to another repo — read-only here";
  if (S.cmp && S.cmp.showing === "repo") return "you're hearing the saved copy in compare mode — swap back to your version first";
  return "this song is locked here (a capture or starter) — ✎ Edit (or Save As…) makes an editable copy, then ask again";
}
// ---- copy_bars / insert_bars (2026-10-02, open-items 21:50) — Josh via Ask
// asked to "repeat bars 5–6 after bar 6 and shift everything else over two
// bars"; the model tried a ~130-note write_notes and it came back one
// closing brace short. copy_bars is the dedicated call: ONE small tool
// instead of spelling out every note by hand. Built on openGapShift (the
// Insert bars… apply code, extracted above) so the shift is never
// duplicated — same notes+annotations sliding later, same straddling-
// annotation stretch rule. copy_bars folds that shift PLUS its own
// addBatch of copied notes into a single {kind:"group"} undo entry (one ⟲
// for the whole thing); insert_bars needs no extra fold and just calls
// insertTime directly. Gate = askWritableGate() (write_notes' rule).
// Annotations are NEVER duplicated into the copied range — Learning mode
// is the law, they're Josh's own analysis — only shifted, exactly as
// Insert bars already shifts them.
export function askBarsCount() { return Math.max(1, Math.ceil(S.songEndTick / barTicks())); }
// "this song has N bars" — same basis askReadBars uses
export function askBarsValidate(a, requireRange) { // → {fromBar, toBar, atBar} or {atBar}; throws naming the problem, nothing changed
  const nBars = askBarsCount();
  let fromBar, toBar;
  if (requireRange) {
    fromBar = Math.round(+a.from_bar || 0);
    toBar = Math.round(+a.to_bar || 0);
    if (!(fromBar >= 1)) throw new Error("from_bar must be ≥ 1");
    if (!(toBar >= fromBar)) throw new Error("to_bar must be ≥ from_bar");
    if (toBar > nBars) throw new Error("bars " + fromBar + "–" + toBar + " don't all exist — this song has " + nBars + " bar" + (nBars === 1 ? "" : "s"));
  }
  const atBar = Math.round(+a.at_bar || 0);
  if (!(atBar >= 1 && atBar <= nBars + 1)) throw new Error("at_bar must be between 1 and " + (nBars + 1) + " (this song has " + nBars + " bar" + (nBars === 1 ? "" : "s") + ")");
  return requireRange ? {fromBar, toBar, atBar} : {atBar};
}

export function askAddAnnotation(a) { // the same text grammar the editor and the files use: one line, parsed by parseRollnotes
  if (!S.song || !S.songKey) throw new Error("no song open");
  if (LINK_SONGS) throw new Error("this song is being viewed from a link to another repo — read-only");
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); // version guard, docs/annotations-v2.md P3
  const bar = Math.max(1, Math.round(+a.bar || 1)), beat = Math.max(1, +a.beat || 1);
  const eb = a.end_bar ? Math.max(bar, Math.round(+a.end_bar)) : null;
  const eq = eb && a.end_beat ? Math.max(1, +a.end_beat) : null;
  let kind = String(a.kind || "note").trim().toLowerCase();
  const text = String(a.text || "").trim();
  if (!text) throw new Error("empty text");
  if (kind === "meter" || kind === "timesig") { kind = "timesig"; if (!/^\d+\s*\/\s*\d+$/.test(text)) throw new Error("a meter is written like 3/4"); } // the .rollnotes grammar's own names (batch 3, 2026-10-05: the user's declared meter and chop, dictated like any other annotation)
  else if (kind === "chop") { if (!/^(start|end)$/i.test(text)) throw new Error("chop takes start or end — the bar.beat is where it sits"); }
  else if (!["chord", "section", "key", "tempo", "loop", "note"].includes(kind)) throw new Error("kind must be chord, section, key, tempo, loop, meter, chop or note");
  const line = (kind === "note" ? text : kind + ": " + (kind === "chop" ? text.toLowerCase() : text)) + (a.comment ? "\n" + String(a.comment).trim() : "");
  const head = "[" + bar + "." + beat + (eb ? " - " + eb + (eq ? "." + eq : "") : "") + "]";
  const parsed = parseRollnotes(head + "\n" + line);
  if (!parsed.length) throw new Error("could not parse that annotation");
  const fresh = parsed[0];
  fresh.added = true;
  const isLoop = n => n.loopTo !== undefined || /^loop:/i.test(n.text || "");
  if (isLoop(fresh)) S.rollnotes = S.rollnotes.filter(n => !(n.added && isLoop(n))); // one loop point per song, as the editor does (loopTo is derived later, in finalizeNotes)
  dropSupersededBy(fresh);
  S.rollnotes.push(resolveNote(fresh));
  finalizeNotes();
  saveLocalNotes();
  if (typeof draw === "function") draw();
  if (typeof updateSongBtn === "function") updateSongBtn();
  if (typeof updateSyncBtn === "function") updateSyncBtn();
  return {ok: true, at: head, text: fresh.text, unsynced: true, note: "written"};
}
export function askEditAnnotation(a) {
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); // version guard, docs/annotations-v2.md P3
  a = a || {};
  const n = askFindAnnotation(a);
  if (n.songnote) throw new Error("that is a song note — song_note {op: \"edit\", title} changes it");
  if (askAnnotationStructural(n)) throw new Error("that annotation is a structural directive (meter/chop/track/audio/lane) — change it in the app's own editor, not here");
  const kind = askNoteKind(n);
  const bar = a.new_bar !== undefined ? Math.max(1, Math.round(+a.new_bar)) : n.b1;
  const beat = a.new_beat !== undefined ? Math.max(1, +a.new_beat) : (n.q1 || 1);
  const eb = a.new_end_bar !== undefined ? Math.max(bar, Math.round(+a.new_end_bar)) : (n.b2 || null);
  const eq = eb !== null ? (a.new_end_beat !== undefined ? Math.max(1, +a.new_end_beat) : (eb === n.b2 ? (n.q2 || null) : null)) : null;
  const text = String(a.text || "").trim();
  if (!text) throw new Error("empty text");
  const comment = a.comment !== undefined ? String(a.comment).trim() : (n.cnote || "");
  const line = (kind === "note" ? text : kind + ": " + text) + (comment ? "\n" + comment : "");
  const head = "[" + bar + "." + beat + (eb ? " - " + eb + (eq ? "." + eq : "") : "") + "]";
  const parsed = parseRollnotes(head + "\n" + line);
  if (!parsed.length) throw new Error("could not parse that annotation");
  const fresh = parsed[0];
  fresh.added = true;
  if (kind === "key") dropLocalKeyAt(bar, beat); // anchor-level: only a key at the (possibly new) exact beat is replaced
  retireEdited(n); // tombstones a synced original (so it can't come back on reload) and drops it — same path the note editor's own Save uses on an edit
  const isLoop = nn => nn.loopTo !== undefined || /^loop:/i.test(nn.text || "");
  if (isLoop(fresh)) S.rollnotes = S.rollnotes.filter(nn => !(nn.added && isLoop(nn))); // one loop point per song
  dropSupersededBy(fresh);
  S.rollnotes.push(resolveNote(fresh));
  finalizeNotes();
  saveLocalNotes();
  if (typeof buildScoreModel === "function") buildScoreModel();
  if (typeof clampView === "function") clampView();
  S.lastSubtitle = undefined;
  if (typeof updateSubtitle === "function") updateSubtitle();
  if (typeof draw === "function") draw();
  if (typeof updateSongBtn === "function") updateSongBtn();
  if (typeof updateSyncBtn === "function") updateSyncBtn();
  return {ok: true, at: head, text: fresh.text, note: "edited in place"};
}
export function askDeleteAnnotation(a) {
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); // version guard, docs/annotations-v2.md P3
  const n = askFindAnnotation(a || {});
  if (n.songnote) throw new Error("that is a song note — song_note {op: \"delete\", title} removes it");
  if (askAnnotationStructural(n) && !n.tsdir && !n.chopdir) throw new Error("that annotation is a structural directive (track/audio/lane) — remove it in the app's own editor, not here"); // a meter or chop the user dictated can be taken back the same way (batch 3); track/audio/lane stay the editor's
  const at = "[" + n.b1 + "." + (n.q1 || 1) + (n.b2 ? " - " + n.b2 + (n.q2 ? "." + n.q2 : "") : "") + "]", text = (n.text || "").split("\n")[0];
  tombstone(n); // synced notes need the deletion to survive a reload — same path the note editor's own Delete uses
  S.rollnotes = S.rollnotes.filter(x => x !== n);
  finalizeNotes();
  saveLocalNotes();
  if (typeof buildScoreModel === "function") buildScoreModel();
  if (typeof clampView === "function") clampView();
  S.lastSubtitle = undefined;
  if (typeof updateSubtitle === "function") updateSubtitle();
  if (typeof draw === "function") draw();
  if (typeof updateSongBtn === "function") updateSongBtn();
  if (typeof updateSyncBtn === "function") updateSyncBtn();
  return {ok: true, at, text, note: "deleted"};
}
// song_note (Josh, 2026-10-06): his titled song notes, named by title (any
// case — titles are unique per song, so a name is never ambiguous). Same
// gate as the other annotation writes (a capture he is studying takes song
// notes like any annotation; a linked or newer-format song refuses); one
// undo step; putSongNote is the one write path (duplicate titles refused).
export function askSongNote(a) {
  if (!S.song || !S.songKey) throw new Error("no song open");
  if (LINK_SONGS) throw new Error("this song is being viewed from a link to another repo — read-only");
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG);
  a = a || {};
  const op = String(a.op || "").trim().toLowerCase();
  if (!["add", "edit", "delete"].includes(op)) throw new Error("op must be add, edit or delete");
  const title = songNoteCleanTitle(a.title);
  if (!title) throw new Error("say the song note's title");
  const given = v => v !== undefined && v !== null;
  const cur = op === "add" ? null : songNoteFor(title);
  if (op !== "add" && !(cur && annoShown(cur))) {
    const have = S.rollnotes.filter(n => n.songnote && annoShown(n)).map(n => "\u201c" + n.songnote.title + "\u201d");
    throw new Error("no song note called \u201c" + title + "\u201d — " + (have.length ? "this song has " + have.join(", ") : "this song has none yet"));
  }
  if (op === "edit" && !given(a.new_title) && !given(a.text)) throw new Error("edit needs text (the new body) and/or new_title");
  const before = annoSnapshot();
  let line;
  if (op === "delete") {
    tombstone(cur); // synced notes need the deletion to survive a reload
    S.rollnotes = S.rollnotes.filter(x => x !== cur);
    saveLocalNotes();
    line = "deleted the song note \u201c" + cur.songnote.title + "\u201d";
  } else {
    const newTitle = op === "edit" ? (given(a.new_title) ? songNoteCleanTitle(a.new_title) : cur.songnote.title) : title;
    const body = given(a.text) ? String(a.text) : (cur && cur.cnote) || "";
    const fresh = putSongNote(cur, {title: newTitle, text: body}); // throws on a clash or an empty title, nothing changed
    line = (op === "add" ? "added the song note \u201c" : "edited the song note \u201c") + fresh.songnote.title + "\u201d" +
           (cur && cur.songnote.title !== fresh.songnote.title ? " (was \u201c" + cur.songnote.title + "\u201d)" : "");
  }
  pushUndo({kind: "anno", json: before});
  finalizeNotes();
  if (typeof draw === "function") draw();
  if (typeof updateSongBtn === "function") updateSongBtn();
  if (typeof updateSyncBtn === "function") updateSyncBtn();
  return {ok: true, note: line};
}
// publish_song (2026-10-01): the exact per-song flow the footer's Publish
// button runs (#ghsave's "writing mode" branch for his own songs; the plain
// annotations-only branch otherwise) — never a parallel path, so a tool-run
// publish and a tapped one behave identically.
export async function askPublishSong() {
  if (!S.song || !S.songKey) throw new Error("no song open");
  if (LINK_SONGS) throw new Error("this song is being viewed from a link to another repo — read-only");
  if (!connected()) throw new Error("not connected — add a GitHub token, or choose a local folder, in File → Settings first");
  const token = writeToken();
  const h = ghHeaders(token);
  const hisMusic = isComposition();
  let status = "";
  await publishSong(S.songKey, h, m => { status = m; });
  if (hisMusic) {
    try { await writeSongsReadme(h); } catch (err) { status = "published, but the repo's song list didn't update: " + err.message; }
  }
  try { await initCatalog(); } catch (err) { /* best-effort refresh */ }
  if (typeof updateSongBtn === "function") updateSongBtn();
  if (typeof renderSyncPending === "function") renderSyncPending();
  const where = folderActive() ? ("to " + fsRoot.name) : "(GitHub Pages takes ~1 min to serve it)";
  return {ok: true, message: "Published " + S.songKey + " " + where + (hisMusic ? " — song and annotations together." : " — annotations.")};
}
export function askListSongs() { // the catalog AND this device's drafts, the way askSongPath sees them — one line per song, so an answer can name a path
  const L = [];
  for (const [album, songs] of Object.entries(S.CATALOG)) { L.push(album + ":"); for (const [title, path] of songs) L.push("  " + title + " — " + path); }
  const local = draftKeys().filter(k => !Object.values(S.CATALOG).some(songs => songs.some(([, p]) => p === k)));
  if (local.length) { L.push("on this device only:"); for (const k of local) L.push("  " + songTitleOf(k) + " — " + k); }
  return L.join("\n") || "(no songs listed yet)";
}
export async function askReadSong(a) { // another song's notes, notesTxtForDoc's shape, 6000 chars, optional bar range
  a = a || {};
  const path = askSongPath([a.path, a.song, a.title].find(v => v !== undefined && v !== null && v !== ""));
  const res = await readData("songs", path);
  if (!res.ok) throw new Error("could not read " + path);
  const doc = parseMidi(await res.arrayBuffer());
  return notesTxtForDoc(doc, songTitleOf(path), a.from_bar, a.to_bar, 6000, path);
}
export async function askReadNotes(a) { // another song's saved annotations as "[b.q - b.q] type: value — note" lines
  a = a || {};
  const path = askSongPath([a.path, a.song, a.title].find(v => v !== undefined && v !== null && v !== ""));
  const res = await readData("analysis", path.replace(/\.midi?$/i, "") + ".rollnotes.json");
  if (!res.ok) return "(no annotations saved for " + path + ")";
  let j; try { j = JSON.parse(await res.text()); } catch (err) { return "(annotations unreadable)"; }
  const at = e => "[" + (e.at || [1, 1]).join(".") + (e.to ? " - " + e.to.join(".") : "") + "]";
  return (j.notes || []).filter(e => annoShown(e)).map(e => at(e) + " " + (e.type ? e.type + ": " + (e.chord || e.label || e.key || e.bpm || e.loop || e.timesig || e.track || e.chop || e.lane || "") : e.text || "") + (e.note ? " — " + e.note : "")).join("\n") || "(no annotations)";
}
export async function askRunTool(name, a) { // the AI library's one door (host.runTool): since batch 3 the only tool is act — every action, the old twelve included, is a registry entry (src/ask/actions.js)
  if (name === "act") return askAct(a); // the whole argument object as sent — askActItems tolerates every shape a model emits (a string, one item, nested lists)
  throw new Error("unknown tool " + name + " — every app action is inside act; its description lists them");
}
export function askWriteNotes(a) {
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const ti = askFindTrackIndex(a.track);
  if (trackIsDrums(ti)) throw new Error("\"" + (S.song.tracks[ti].name || "track " + (ti + 1)) + "\" is a drum/noise track — write_notes doesn't write there");
  const bt = barTicks(), qt = beatTicks(), beats = beatsPerBarDisp();
  const v = askWriteNotesValidate(a.notes, bt, qt, beats);
  if (v.error) throw new Error(v.error);
  let t0 = 0, t1 = 0; // default: erase nothing (t0 === t1 never satisfies applyTake's "t >= t0 && t < t1")
  if (a.replace) {
    const r = a.replace;
    const fb = Math.max(1, Math.round(+r.from_bar || 1)), fq = Math.max(1, +(r.from_beat !== undefined ? r.from_beat : 1));
    const tb = Math.max(fb, Math.round(+(r.to_bar !== undefined ? r.to_bar : fb)));
    const tq = r.to_beat !== undefined ? Math.max(1, +r.to_beat) : beats + 1;
    t0 = (fb - 1) * bt + (fq - 1) * qt;
    t1 = Math.max(t0 + 1, (tb - 1) * bt + (tq - 1) * qt);
  }
  const hits = v.hits.sort((x, y) => x.t - y.t || x.p - y.p);
  const added = applyTake(ti, t0, t1, hits);
  const bars = a.notes.map(n => Math.round(+n.bar)), lo = Math.min(...bars), hi = Math.max(...bars);
  const where = lo === hi ? ("bar " + lo) : ("bars " + lo + "–" + hi);
  return {ok: true, note: "wrote " + added + " note" + (added === 1 ? "" : "s") + " on " + (S.song.tracks[ti].name || "track " + (ti + 1)) + ", " + where};
}
export function askInsertBars(a) { // {at_bar, count}: empty bars, same shift as Edit ▾ → Insert bars…
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const count = Math.round(+a.count || 0);
  if (!(count >= 1)) throw new Error("count must be ≥ 1");
  const {atBar} = askBarsValidate(a, false);
  const bt = barTicks();
  insertTime((atBar - 1) * bt, count * bt);
  return {ok: true, note: "inserted " + count + " empty bar" + (count === 1 ? "" : "s") + " at bar " + atBar + " — everything after moved " + count + " bar" + (count === 1 ? "" : "s") + " later"};
}
export function askCopyBars(a) { // {from_bar, to_bar, at_bar}: repeat/duplicate bars — insert + copy, one undo step
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const {fromBar, toBar, atBar} = askBarsValidate(a, true);
  const bt = barTicks(), count = toBar - fromBar + 1;
  const sourceStart = (fromBar - 1) * bt, sourceEnd = toBar * bt, T = (atBar - 1) * bt, delta = count * bt;
  // snapshot the source range (every track, drums included) BEFORE the
  // shift mutates live note objects — ticks stored relative to sourceStart
  // so the copy lands correctly at T regardless of where T falls relative
  // to the source (before, after, or overlapping it)
  const snapshot = [];
  S.song.tracks.forEach((tr, ti) => tr.notes.forEach(n => {
    if (!n.gone && n.t >= sourceStart && n.t < sourceEnd) snapshot.push({ti, t: n.t - sourceStart, d: n.d, p: n.p, v: n.v});
  }));
  const {modItems, annoBefore} = openGapShift(T, delta);
  const added = [];
  for (const h of snapshot) {
    const tr = S.song.tracks[h.ti], isAdd = !isComposition(), t = T + h.t;
    tr.notes.push({t, d: h.d, p: h.p, v: h.v, added: isAdd});
    if (S.song.rawNotes) S.song.rawNotes[h.ti].push({t: t + S.chopS, d: h.d, p: h.p, v: h.v, added: isAdd});
    added.push({ti: h.ti, ni: tr.notes.length - 1});
  }
  pushUndo({kind: "group", entries: [{kind: "mod", items: modItems}, {kind: "anno", json: annoBefore}, {kind: "addBatch", items: added}]});
  finalizeNotes();
  saveEdits(); // persists the copied (added:true) notes for an edited-capture song; drafts whole for a composition
  computeSongEnd();
  saveLocalNotes(); // the shifted annotation layer
  saveDraft();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  const fromLabel = fromBar === toBar ? ("bar " + fromBar) : ("bars " + fromBar + "–" + toBar);
  return {ok: true, note: "copied " + fromLabel + " to bar " + atBar + "; everything after moved " + count + " bar" + (count === 1 ? "" : "s") + " later"};
}
// delete_bars (2026-10-02, open-items 22:20) — Josh in the terminal: "Is
// there a way to delete a bar?" … "we have Insert bars in the Edit [menu],
// it would be next to that". The inverse of insert_bars/copy_bars: built on
// closeGap (closeGap is to openGapShift as this is to insertTime) so the
// same note-clip/shift and annotation-shrink/move-to-cut rules back both
// the menu's Delete bars… and this tool.
export function askDeleteBars(a) { // {from_bar, count}: removes bars — same gate/validation shape as copy_bars
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const nBars = askBarsCount();
  const fromBar = Math.round(+a.from_bar || 0);
  if (!(fromBar >= 1)) throw new Error("from_bar must be ≥ 1");
  const count = Math.round(+a.count || 0);
  if (!(count >= 1)) throw new Error("count must be ≥ 1");
  const toBar = fromBar + count - 1;
  if (toBar > nBars) throw new Error("bars " + fromBar + "–" + toBar + " don't all exist — this song has " + nBars + " bar" + (nBars === 1 ? "" : "s"));
  const bt = barTicks();
  const r = deleteTime((fromBar - 1) * bt, count * bt);
  const where = count > 1 ? ("bars " + fromBar + "–" + toBar) : ("bar " + fromBar);
  return {ok: true, note: where + " removed — everything after moved " + count + " bar" + (count === 1 ? "" : "s") + " earlier" +
    (r.movedToT ? "; " + r.movedToT + " annotation" + (r.movedToT === 1 ? "" : "s") + " moved to bar " + fromBar : "")};
}
// drummer (2026-10-05, open-items "Ask tool for the Drummer") — Josh via Ask
// on ambush: "rerun the A part with slightly less energy settings", "redo the
// intro, probably to match pulse one and pulse two rather than following the
// triangle". Ask speaks the request; the app runs the SAME drGenerate the
// Drummer sheet runs — never hand-written hits. Everything is validated before
// the one call: drGenerate itself makes the kit track when there is none
// (folded into its undo), erases only kit notes inside the range, and pushes
// exactly one group undo. Plan: docs/plans/2026-10-05-ask-drummer-tool.md.
// Reached as the `drummer` ACTION of the act tool (src/ask/actions.js) — its
// own ASK_TOOLS entry went the same day it landed: ~350 tokens on every
// message (Josh via Ask #449). A plain function either way.
// → {fromBar, toBar}: whole bars, or ONE declared section label's span.
// Despite the name this is generic (bar/section resolution only, nothing
// drum-specific) and is reused by askBassist and askSelectRange (batch 4/5).
export function askDrummerRange(a) {
  const bt = barTicks(), nBars = askBarsCount();
  if (a.section !== undefined && a.section !== null && String(a.section).trim()) {
    const want = String(a.section).trim().toLowerCase();
    const secs = visibleNotes().filter(n => n.section && String(n.text || "").trim().toLowerCase() === want); // visibleNotes: no Learning-hidden ✦ AI section
    const span = n => { // the Drummer sheet's own prefill convention: a point section is one bar, a ranged one ends where its last beat ends
      const from = Math.floor(n.start / bt) + 1, e = n.end || n.start + bt;
      return {fromBar: from, toBar: Math.max(from, Math.ceil(e / bt))};
    };
    if (secs.length === 1) return span(secs[0]);
    if (secs.length > 1) throw new Error("\"" + a.section + "\" labels " + secs.length + " spans (" + secs.map(n => { const r = span(n); return "bars " + r.fromBar + "–" + r.toBar; }).join(", ") + ") — say which bars");
    const labels = [...new Set(visibleNotes().filter(n => n.section).map(n => n.text))];
    throw new Error("no section labeled \"" + a.section + "\"" + (labels.length ? " — this song's sections: " + labels.join(", ") : " — this song has no section labels; say the bars"));
  }
  const fromBar = Math.round(+a.from_bar || 0), toBar = Math.round(+(a.to_bar !== undefined && a.to_bar !== null ? a.to_bar : a.from_bar) || 0);
  if (!(fromBar >= 1)) throw new Error("say the bars (from_bar, to_bar) or a section label");
  if (!(toBar >= fromBar)) throw new Error("to_bar must be ≥ from_bar");
  if (toBar > nBars) throw new Error("bars " + fromBar + "–" + toBar + " don't all exist — this song has " + nBars + " bar" + (nBars === 1 ? "" : "s"));
  return {fromBar, toBar};
}
export function askDrummer(a) { // {from_bar, to_bar | section, energy, busy, hard, fills, feel, parts, follow, seed}
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const {fromBar, toBar} = askDrummerRange(a);
  const knob = (v, lo, hi, name, def) => {
    if (v === undefined || v === null || v === "") return def;
    const n = Math.round(+v);
    if (!(n >= lo && n <= hi)) throw new Error(name + " must be " + lo + "–" + hi);
    return n;
  };
  const energy = knob(a.energy, 1, 5, "energy", 3); // the generator's own legacy mapping: energy → busy = hard
  const busy = knob(a.busy, 1, 5, "busy", energy), hard = knob(a.hard, 1, 5, "hard", energy);
  const fillAmt = knob(a.fills, 0, 5, "fills", 3);
  const feel = a.feel === undefined || a.feel === null || a.feel === "" ? "normal" : String(a.feel).trim().toLowerCase();
  if (!["normal", "half", "double"].includes(feel)) throw new Error("feel must be normal, half or double");
  let parts = "all";
  if (Array.isArray(a.parts) && a.parts.length) {
    parts = [...new Set(a.parts.map(x => String(x).trim().toLowerCase()))];
    const bad = parts.filter(x => !["kick", "snare", "hats", "fills"].includes(x));
    if (bad.length) throw new Error("parts: " + bad.join(", ") + " — the parts are kick, snare, hats, fills");
  }
  const trackName = ti => S.song.tracks[ti].name || "track " + (ti + 1);
  let follow = "bass", followTis, followTxt;
  let f = a.follow;
  if (typeof f === "string") f = f.trim() ? [f] : [];
  if (Array.isArray(f) && f.length) {
    const lower = f.map(x => String(x).trim().toLowerCase());
    if (lower.length === 1 && (lower[0] === "chords" || lower[0] === "off")) {
      follow = lower[0];
      followTxt = follow === "off" ? "following nothing" : "following chords";
    } else {
      followTis = [...new Set(f.map(name => askFindTrackIndex(name)))]; // an unknown name errors naming the song's tracks, nothing changed
      const drum = followTis.find(ti => trackIsDrums(ti));
      if (drum !== undefined) throw new Error("\"" + trackName(drum) + "\" is a drum/noise track — the drums can't follow themselves");
      followTxt = "following " + followTis.map(trackName).join("+");
    }
  } else {
    const bti = drBassTrack();
    followTxt = bti >= 0 ? "following " + trackName(bti) : "following nothing";
  }
  const bt = barTicks(), t0 = (fromBar - 1) * bt, t1 = toBar * bt;
  if (S.rollnotes.some(n => n.tsdir && n.start > t0 && n.start < t1)) // drGenerate's own refusal, raised BEFORE it erases anything
    throw new Error("bars " + fromBar + "–" + toBar + " cross a meter change — generate each meter's bars separately");
  const seed = a.seed !== undefined && a.seed !== null && a.seed !== "" ? (Math.round(+a.seed) >>> 0) : (Math.random() * 0xFFFFFFFF) >>> 0; // the ONLY nondeterminism, same as the sheet's Generate
  const opts = {busy, hard, fillAmt, feel, parts, follow, followTis, fromBar, toBar};
  const k = drGenerate(seed, opts);
  S.drTakes.push({seed, ...opts, from: fromBar, to: toBar + 1, q: [1, 1]}); // the sheet's take chips show and replay it (to = exclusive bar, as the sheet's own fields)
  if (S.drTakes.length > 8) S.drTakes.shift();
  S.drActive = S.drTakes.length - 1;
  const where = fromBar === toBar ? "bar " + fromBar : "bars " + fromBar + "–" + toBar;
  const recipe = "busy " + busy + " · hard " + hard + " · fills " + fillAmt + (feel !== "normal" ? " · " + feel : "") +
    (parts !== "all" ? " · " + parts.join("+") + " only" : "") + " · " + followTxt + " · seed " + seed;
  if (!k) return {ok: true, note: "Drummer: no hits in " + where + " — every bar there is a break (only the followed track plays, or a section labeled break) · " + recipe + " (one undo restores what was there)"};
  return {ok: true, note: "Drummer: " + k + " hit" + (k === 1 ? "" : "s") + " in " + where + " · " + recipe + " (one undo restores what was there)"};
}
// ---- bassist (docs/ai-parity.md §5 batch 4, 2026-10-05): Ask's "bass line
// for bars X–Y" — the drummer tool's shape, over bsGenerate (the Bassist
// sheet's own generator) + applyTake (same erase-by-onset, one group undo).
// askDrummerRange is reused as-is for bar/section resolution — it is
// generic over "whole bars, or one declared section label's span", not
// drummer-specific. track resolution mirrors the sheet's own default
// (src/ui/sheets.js openBassist/bsgen): an explicit name (or "new") wins;
// omitted picks the detected bass track when nothing of its own already
// sounds in the range, else a fresh "bass" track — created AND folded into
// the SAME undo step as undoTrackAdd does for the Drummer's kit. Learning
// mode is the law: the reply never states a chord or key — bsGenerate's own
// melody-inferred sketch is internal only and never printed (src/gen/
// bassist.js's own comment); the reply names only what it replaced and the
// seed, never the harmony it read.
export function askBassist(a) {
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const {fromBar, toBar} = askDrummerRange(a);
  const bt = barTicks(), t0 = (fromBar - 1) * bt, t1 = toBar * bt;
  if (S.rollnotes.some(n => n.tsdir && n.start > t0 && n.start < t1))
    throw new Error("bars " + fromBar + "–" + toBar + " cross a meter change — generate each meter's bars separately");
  const trackName = ti => S.song.tracks[ti].name || "track " + (ti + 1);
  const hasDrums = S.song.tracks.some((_, ti) => trackIsDrums(ti));
  const STYLES = ["chug", "pump", "arp", "walk", "riff"];
  let style = a.style === undefined || a.style === null || a.style === "" ? (hasDrums ? "riff" : "chug") : String(a.style).trim().toLowerCase();
  if (!STYLES.includes(style)) throw new Error("style must be one of " + STYLES.join(", "));
  const knob = (v, lo, hi, name, def) => {
    if (v === undefined || v === null || v === "") return def;
    const n = Math.round(+v);
    if (!(n >= lo && n <= hi)) throw new Error(name + " must be " + lo + "–" + hi);
    return n;
  };
  const busy = knob(a.busy, 1, 5, "busy", 3);
  const oct = knob(a.octave, 1, 3, "octave", 2);
  // follow: auto (default) | chords | drums | a named track (riff style's
  // rhythmic cue only — pitch always comes off the chord/key ladder above)
  let follow = "auto", followTxt = hasDrums ? "following the drums" : "following the chords";
  if (a.follow !== undefined && a.follow !== null && String(a.follow).trim() !== "") {
    const f = String(a.follow).trim().toLowerCase();
    if (f === "auto") { follow = "auto"; followTxt = hasDrums ? "following the drums" : "following the chords"; }
    else if (f === "chords") { follow = "chords"; followTxt = "following the chords"; }
    else if (f === "drums") { follow = "drums"; followTxt = "following the drums"; }
    else { const ti = askFindTrackIndex(a.follow); follow = "t" + ti; followTxt = "following " + trackName(ti); }
  }
  // track: an existing name, or "new"; omitted mirrors the sheet's own
  // default (openBassist) — never onto a track already sounding in range
  let targetTi, madeTrack = false;
  if (a.track !== undefined && a.track !== null && String(a.track).trim() !== "") {
    if (/^new$/i.test(String(a.track).trim())) madeTrack = true;
    else {
      targetTi = askFindTrackIndex(a.track);
      if (trackIsDrums(targetTi)) throw new Error("\"" + trackName(targetTi) + "\" is a drum/noise track — the bass needs its own track");
    }
  } else {
    const bi = drBassTrack();
    if (bi >= 0 && !S.song.tracks[bi].notes.some(n => !n.gone && n.t < t1 && n.t + n.d > t0)) targetTi = bi;
    else madeTrack = true;
  }
  const undoLen = S.editUndo.length;
  if (madeTrack) {
    targetTi = addTrackUndoable({name: "bass", notes: []});
    saveDraft();
    renderTrackbar();
  }
  const before = S.song.tracks[targetTi].notes.filter(n => !n.gone && n.t >= t0 && n.t < t1).length;
  const seed = a.seed !== undefined && a.seed !== null && a.seed !== "" ? (Math.round(+a.seed) >>> 0) : (Math.random() * 0xFFFFFFFF) >>> 0; // the ONLY nondeterminism, same as the sheet's Generate
  const opts = {style, busy, oct, follow, targetTi, fromBar, toBar};
  const k = bsGenerate(seed, opts);
  if (madeTrack) undoTrackAdd(targetTi, undoLen); // a bass track the Bassist made leaves with its take, same as the Drummer's kit
  const where = fromBar === toBar ? "bar " + fromBar : "bars " + fromBar + "–" + toBar;
  const recipe = "style " + style + " · busy " + busy + " · octave " + oct + " · " + followTxt + " · seed " + seed;
  if (!k) return {ok: true, note: "Bassist: no chords, melody or key declared in " + where + " — nothing to read · " + recipe + (madeTrack ? " (one undo removes the added bass track)" : " (nothing changed)")};
  S.bsTakes.push({seed, opts, style, busy, oct, followSel: follow, targetTi, from: fromBar, to: toBar + 1, q: [1, 1]}); // the sheet's take chips show and replay it (to = exclusive bar, as its own fields)
  if (S.bsTakes.length > 8) S.bsTakes.shift();
  S.bsActive = S.bsTakes.length - 1;
  return {ok: true, note: "Bassist: replaced " + before + " note" + (before === 1 ? "" : "s") + " with " + k + " on " + trackName(targetTi) + " in " + where + (madeTrack ? " (new track)" : "") + " · " + recipe + " (one undo restores what was there)"};
}
// ---- edit_notes (docs/ai-parity.md §5 batch 5, 2026-10-05): bulk ops over
// bars + named tracks, through the SAME functions the Edit menu / selection
// toolbar call (src/model/selection.js) — askSelectRange is the one new
// piece: bars+tracks -> S.multiSel, exactly what a lasso or ⌘A would leave,
// so selEditItems() (every op's own read of "the selection") sees it.
export function askSelectRange(a) { // -> {fromBar, toBar, t0, t1, tis, count}; throws naming the bad bar, a bad section or an unknown track, nothing changed
  const {fromBar, toBar} = askDrummerRange(a); // reused as-is: whole bars, or one declared section label's span
  const bt = barTicks(), t0 = (fromBar - 1) * bt, t1 = toBar * bt;
  let names = a.tracks;
  if (typeof names === "string") names = names.split(/\s*,\s*/).filter(Boolean);
  if (!Array.isArray(names)) names = names === undefined || names === null ? [] : [names];
  if (!names.length) throw new Error("say which track(s): " + S.song.tracks.map((tr, ti) => tr.name || "track " + (ti + 1)).join(", "));
  const tis = [...new Set(names.map(askFindTrackIndex))]; // unknown/ambiguous throws naming the song's own tracks
  const sel = [];
  for (const ti of tis) S.song.tracks[ti].notes.forEach((n, ni) => { if (!n.gone && n.t >= t0 && n.t < t1) sel.push({ti, ni}); });
  S.multiSel = sel; S.multiSelKey = new Set(sel.map(({ti, ni}) => ti + ":" + ni)); S.selNote = null;
  S.lassoAnno = null; // the selection is Ask's now, not a box: a leftover lasso box must not make deleteSelection/copySelection take annotations along
  return {fromBar, toBar, t0, t1, tis, count: sel.length};
}
const EDIT_NOTES_OPS = ["delete", "quantize", "velocity", "split", "join", "divide", "dedupe", "transpose", "move", "copy", "to_track", "shape"];
// op shape (docs/plans/2026-10-06-in-note-dynamics.md): a preset name, or
// points [[beats from the note's start, level 0–127]…] -> envFor(n) for
// setSelectionShape. Levels are stored relative to each note's velocity.
function askEditNotesShape(a) {
  let pts = a.points;
  if (typeof pts === "string") {
    try { pts = JSON.parse(pts); } catch (err) { throw new Error("points must be a list like [[0.75, 127], [1.5, 68]]"); }
  }
  if (Array.isArray(pts) && pts.length) {
    const ppq = S.song.ppq;
    const list = pts.map(pt => {
      const b = +(Array.isArray(pt) ? pt[0] : pt && pt.beat), l = +(Array.isArray(pt) ? pt[1] : pt && pt.level);
      if (!(b > 0) || !(l >= 0 && l <= 127)) throw new Error("each point is [beats after the note starts (> 0), level 0–127]");
      return {b, l};
    }).sort((x, y) => x.b - y.b);
    return {name: "points", label: "points " + list.map(q => "+" + q.b + "b→" + q.l).join(" "),
      envFor: n => list.map(q => ({t: Math.round(q.b * ppq), r: q.l / (n.v || 80)})).filter(q => q.t > 0 && q.t < n.d)};
  }
  const name = String(a.shape || "").trim().toLowerCase().replace(/[\s–-]+/g, "_");
  if (!SHAPE_PRESETS[name]) throw new Error("say shape: swell, fade, swell_fade or flat — or points [[beats, level]…]");
  return {name, label: SHAPE_PRESETS[name], envFor: null};
}
const askActNum = (v, name) => { // a signed number given as a number or a string ("+2", "-1", "1.5"); undefined when absent
  if (v === undefined || v === null || v === "") return undefined;
  const n = +String(v).trim();
  if (!Number.isFinite(n)) throw new Error(name + " must be a number");
  return n;
};
function askEditNotesShift(a) { // semitones + 12 × octaves -> one chromatic shift (Paste to…'s own ptoct/ptsemi sum), 0 when neither given
  const semi = askActNum(a.semitones, "semitones"), oct = askActNum(a.octaves, "octaves");
  if (semi !== undefined && !Number.isInteger(semi)) throw new Error("semitones must be a whole number");
  if (oct !== undefined && !Number.isInteger(oct)) throw new Error("octaves must be a whole number");
  return (semi || 0) + 12 * (oct || 0);
}
const askShiftText = dP => (dP > 0 ? "up " : "down ") + Math.abs(dP) + " semitone" + (Math.abs(dP) === 1 ? "" : "s");
function askEditNotesTarget(name) { // to_track -> index; an audio track can't hold notes (moveSelectionToTrack's own refusal, said out loud)
  const ti = askFindTrackIndex(name); // unknown/ambiguous throws naming the song's own tracks
  if (S.song.tracks[ti].kind === "audio") throw new Error("\"" + (S.song.tracks[ti].name || "track " + (ti + 1)) + "\" is an audio track — notes can't go there");
  return ti;
}
function askEditNotesGrid(spec) { // "1/16" or "16" -> 16 (S.gridDiv's own unit — moveSnapTicks' "custom grid outranks all")
  const m = String(spec).trim().match(/^1\s*\/\s*(\d+)$/) || String(spec).trim().match(/^(\d+)$/);
  const d = m && parseInt(m[1], 10);
  if (!d || ![1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64].includes(d)) throw new Error("grid must be like \"1/16\" (a power-of-two or triplet denominator)");
  return d;
}
function askEditNotesVel(spec) { // 80 -> every note to 80; "+10"/"-10" -> relative, clamped 1-127
  const s = String(spec).trim();
  const m = s.match(/^([+-])(\d+)$/);
  if (m) { const d = (m[1] === "+" ? 1 : -1) * parseInt(m[2], 10); return v => v + d; }
  const n = Math.round(+s);
  if (!(n >= 1 && n <= 127)) throw new Error("vel must be 1–127, or relative like +10 or -10");
  return () => n;
}
export function askEditNotes(a) {
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const op = String(a.op || "").trim().toLowerCase();
  if (!EDIT_NOTES_OPS.includes(op)) throw new Error("op must be one of " + EDIT_NOTES_OPS.join(", "));
  const sel = askSelectRange(a);
  const where = sel.fromBar === sel.toBar ? "bar " + sel.fromBar : "bars " + sel.fromBar + "–" + sel.toBar;
  const trackLabel = sel.tis.map(ti => S.song.tracks[ti].name || "track " + (ti + 1)).join("+");
  let k = 0, how = op, tail = "";
  if (op === "delete") { k = deleteSelection(); how = "deleted"; }
  else if (op === "quantize") {
    const hasGrid = a.grid !== undefined && a.grid !== null && a.grid !== "";
    const prevGrid = S.gridDiv;
    if (hasGrid) S.gridDiv = askEditNotesGrid(a.grid);
    let strength = 1;
    if (a.strength !== undefined && a.strength !== null && a.strength !== "") {
      const s = String(a.strength).trim();
      strength = s.endsWith("%") ? +s.slice(0, -1) / 100 : +s;
      if (!(strength > 0 && strength <= 1)) throw new Error("strength must be between 0 and 1 (or a percent like 75%)");
    }
    const ends = a.ends === true || a.ends === 1 || /^(true|yes|on|1)$/i.test(String(a.ends === undefined || a.ends === null ? "" : a.ends).trim());
    try { k = quantizeSelection(strength, ends); } finally { S.gridDiv = prevGrid; }
    how = "quantized" + (hasGrid ? " to " + String(a.grid).trim() : "");
  } else if (op === "velocity") {
    if (a.vel === undefined || a.vel === null || a.vel === "") throw new Error("say the velocity: an absolute 1–127, or relative like +10 or -10");
    k = setSelectionVelocity(askEditNotesVel(a.vel));
    how = "set velocity " + String(a.vel).trim() + " on";
  } else if (op === "split") {
    if (a.at_bar !== undefined && a.at_bar !== null && a.at_bar !== "") {
      const bar = Math.round(+a.at_bar), beat = a.at_beat !== undefined && a.at_beat !== null && a.at_beat !== "" ? +a.at_beat : 1;
      const tick = Math.round((bar - 1) * barTicks() + (beat - 1) * beatTicks());
      k = splitSelectionAt(tick);
      how = "split at " + bar + "." + beat;
    } else { k = splitSelectionHalves(); how = "split in half"; }
  } else if (op === "join") { k = joinSelection(); how = "joined"; }
  else if (op === "divide") {
    const n = Math.round(+a.into || 0);
    if (!(n >= 2)) throw new Error("say into how many equal parts (into: 2 or more)");
    k = divideSelection(n);
    how = "divided into " + n;
  } else if (op === "dedupe") { k = removeDuplicateNotes({t0: sel.t0, t1: sel.t1, tis: sel.tis}); how = "removed"; }
  // ---- batch 6 (docs/ai-parity.md §5 row 6): moving music — the same
  // functions the ⇅ Transpose sheet, arrow keys, Paste to… and ⇄ Move to
  // track call, over Ask's selection. Each is its own ONE undo step.
  else if (op === "transpose") {
    const steps = askActNum(a.scale_steps, "scale_steps"), dP = askEditNotesShift(a);
    if (steps !== undefined && !Number.isInteger(steps)) throw new Error("scale_steps must be a whole number");
    if (steps === undefined && !dP) throw new Error("say how far: semitones and/or octaves (chromatic), or scale_steps (in the declared key)");
    if (steps !== undefined && a.semitones !== undefined && a.semitones !== null && a.semitones !== "") throw new Error("say scale_steps OR semitones, not both (octaves may join scale_steps: an octave is 7 steps)");
    const drum = sel.tis.find(ti => trackIsDrums(ti));
    if (drum !== undefined) throw new Error("\"" + (S.song.tracks[drum].name || "track " + (drum + 1)) + "\" is a drum/noise track — kit pitches are instruments, not notes; it doesn't transpose");
    if (!sel.count) k = 0;
    else if (steps !== undefined) { // in key: the DECLARED key only (Learning mode is the law — nothing estimated, nothing named)
      const total = steps + 7 * (askActNum(a.octaves, "octaves") || 0);
      if (S.multiSel.some(({ti, ni}) => sfDeclaredAtRaw(S.song.tracks[ti].notes[ni].t) === null)) throw new Error("no key declared — semitones or octaves only until you declare one (add_annotation kind: key); nothing changed");
      if (!total) throw new Error("scale_steps must be a non-zero whole number (negative = down)");
      k = diatonicShift(total) ? sel.count : 0; // one mod undo entry, chord-ride aware, like the ⇅ sheet's in-key buttons (returns selEditApply's true/false, not a count)
      how = "transposed " + (total > 0 ? "up " : "down ") + Math.abs(total) + " scale step" + (Math.abs(total) === 1 ? "" : "s");
    } else {
      if (!nudgeSelection(0, dP)) throw new Error("can't transpose " + askShiftText(dP) + " — a note would leave the roll (" + S.PMIN + "–" + S.PMAX + "); nothing changed");
      k = sel.count; how = "transposed " + askShiftText(dP);
    }
  } else if (op === "move") {
    const bars = askActNum(a.bars, "bars"), beats = askActNum(a.beats, "beats");
    if (bars !== undefined && !Number.isInteger(bars)) throw new Error("bars must be a whole number (use beats for less than a bar)");
    const dT = Math.round((bars || 0) * barTicks() + (beats || 0) * beatTicks());
    if (!dT) throw new Error("say how far: bars and/or beats (negative = earlier)");
    if (!sel.count) k = 0;
    else {
      if (!nudgeSelection(dT, 0)) throw new Error("can't move that far — a note would land before the song's start; nothing changed");
      k = sel.count;
      how = "moved " + (dT > 0 ? "later" : "earlier") + " by " + (bars ? Math.abs(bars) + " bar" + (Math.abs(bars) === 1 ? "" : "s") : "") + (bars && beats ? " " : "") + (beats ? Math.abs(beats) + " beat" + (Math.abs(beats) === 1 ? "" : "s") : "") + ":";
    }
  } else if (op === "copy") {
    const toBar = Math.round(askActNum(a.at_bar, "at_bar") ?? 0), toBeat = askActNum(a.at_beat, "at_beat") ?? 1; // at_bar, as copy_bars names its destination — to_bar is the range's own end
    if (!(toBar >= 1)) throw new Error("say at_bar (where the copy starts; past the song's end is fine — it grows, as Paste to… does)");
    if (!(toBeat >= 1)) throw new Error("at_beat must be ≥ 1");
    const toTi = a.to_track === undefined || a.to_track === null || a.to_track === "" ? undefined : askEditNotesTarget(a.to_track);
    const dP = askEditNotesShift(a), labels = askActTruthy(a.labels);
    const at = Math.round((toBar - 1) * barTicks() + (toBeat - 1) * beatTicks());
    const barsBefore = askBarsCount(); // the reply mentions the length only when the copy grew the song
    const keep = [S.noteClipboard, S.annoClipboard]; // the user's own clipboard survives, as ⌘D's duplicateSelection keeps it
    let annos = 0;
    try {
      if (sel.count && copySelection(labels ? {t0: sel.t0, t1: sel.t1} : undefined)) { // labels: the chord/section/text annotations spanning the bars ride, chord labels transposed by the shift — Paste to…'s band-ride rule
        annos = S.annoClipboard.length;
        k = pasteClipboard(at, {ti: toTi, dP}); // Paste to…'s own call: skips a note already there, drops one shifted off the roll, bands land re-anchored, ONE undo for notes + bands
      }
    } finally { [S.noteClipboard, S.annoClipboard] = keep; }
    if (!k) return {ok: true, note: "nothing landed — " + (sel.count ? "every note was already there or shifted off the roll" : "no note on " + trackLabel + " in " + where) + "; nothing changed"};
    const notes = Math.max(0, k - annos);
    return {ok: true, note: "copied " + notes + " note" + (notes === 1 ? "" : "s") + (annos ? " + " + annos + " annotation" + (annos === 1 ? "" : "s") : "") + " from " + trackLabel + " in " + where + " to " + toBar + "." + toBeat + (toTi !== undefined ? " on " + (S.song.tracks[toTi].name || "track " + (toTi + 1)) : "") + (dP ? ", " + askShiftText(dP) : "") + (askBarsCount() > barsBefore ? " — the song grew to " + askBarsCount() + " bars" : "") + "; cursor at the copy's end (one undo restores what was there)"};
  } else if (op === "shape") {
    const sh = askEditNotesShape(a);
    const room = {lowered: 0};
    k = setSelectionShape(sh.name, selEditItems(), sh.envFor, room); // the Shape ▾ chip's own call: one undo
    how = sh.name === "flat" ? "cleared the volume shape (Flat) on" : "shaped (" + sh.label + ")";
    if (room.lowered) tail = "; " + room.lowered + " started too loud to rise, so velocity was lowered to " + SHAPE_ROOM_V + " to make room";
  } else if (op === "to_track") {
    if (a.to_track === undefined || a.to_track === null || a.to_track === "") throw new Error("say to_track: " + S.song.tracks.map((tr, ti) => tr.name || "track " + (ti + 1)).join(", "));
    const toTi = askEditNotesTarget(a.to_track);
    const prevFilter = S.mvFromFilter; S.mvFromFilter = null; // the ⇄ sheet's "from this track only" filter is its own; Ask named the tracks already
    try { k = moveSelectionToTrack(toTi); } finally { S.mvFromFilter = prevFilter; }
    const toName = S.song.tracks[toTi].name || "track " + (toTi + 1);
    if (!k) return {ok: true, note: "nothing to move — no note on " + trackLabel + " in " + where + (sel.tis.includes(toTi) ? " that isn't already on " + toName : "") + "; nothing changed"};
    return {ok: true, note: "moved " + k + " note" + (k === 1 ? "" : "s") + " from " + trackLabel + " to " + toName + " in " + where + " (one undo restores what was there)"};
  }
  if (!k) return {ok: true, note: "nothing to " + op + " — no note on " + trackLabel + " in " + where + " qualified"};
  return {ok: true, note: how + " " + k + " note" + (k === 1 ? "" : "s") + " on " + trackLabel + " in " + where + tail + " (one undo restores what was there)"};
}
// ---- set_track / add_track / delete_track / keep_that / album (docs/
// ai-parity.md §5 batch 7, 2026-10-05): tracks and albums. Settings land as
// the SAME "track:" annotation saveTrackDir already writes for the mixer
// fader, the M/S/H chips and the voice menu — never localStorage (CLAUDE.md
// "Annotations + the .mid are the only real state"). A call that touches
// more than one of {trackdir fields, octave} pushes more than one undo
// entry (saveTrackDir's own anno snapshot, transposeTrack's note mod) —
// askFoldUndo folds them into ONE group, the same shape undoTrackAdd uses
// to fold a generator's own entry into the track-add step.
function askFoldUndo(undoLen) {
  if (S.editUndo.length - undoLen > 1) { const entries = S.editUndo.splice(undoLen); S.editUndo.push({kind: "group", entries}); }
}
// voice by name from the voice menu's own list (VOICES, audio/voices.js —
// the built-in NES/waves + sampled families; game:/sf2: library voices need
// an async vault/font lookup the menu itself does interactively and are out
// of reach here, same M-effort scope cut as the Drummer's "follow" list).
export function askVoiceMatch(name) {
  const want = String(name === undefined || name === null ? "" : name).trim();
  if (!want) throw new Error("say a voice name");
  if (/^auto$/i.test(want)) return "auto";
  const lower = want.toLowerCase();
  const hit = VOICES.find(([id, label]) => id.toLowerCase() === lower || label.toLowerCase() === lower);
  if (hit) return hit[0];
  throw new Error("no voice named \"" + want + "\" — choices: auto, " + VOICES.map(([, label]) => label).join(", "));
}
function askVoiceLabel(id) {
  if (id === "auto") return "auto";
  const p = parsePatchVoice(id);
  if (p) return patchLabel(id) + " (" + p.wave + " env " + [p.a, p.d, p.s, p.r].join(",") + (p.vx > 0 ? " vib " + [p.vr, p.vx, p.vd].join(",") : "") + ")";
  return (VOICES.find(([v]) => v === id) || [, id])[1];
}
// set_track's patch (NIGHT-ROLL.md "Patches"): a preset by name ("chip lead"),
// or changes — "attack=0.02 vib_depth=0.4", "env=A,D,S,R vib=rate,depth,delay",
// a leading preset word, or an object of the same keys — applied on top of the
// preset, else the track's current patch, else a flat pulse. Every value is
// range-checked, never clamped quietly.
export const ASK_PATCH_KEYS = {wave: "wave", a: "a", attack: "a", d: "d", decay: "d", s: "s", sustain: "s", r: "r", release: "r",
  vr: "vr", vib_rate: "vr", vibrato_rate: "vr", vx: "vx", vib_depth: "vx", vibrato_depth: "vx", vd: "vd", vib_delay: "vd", vibrato_delay: "vd",
  preset: "preset", env: "env", vib: "vib"};
export function askPatchPreset(word) {
  const slug = x => String(x).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const w = slug(word);
  return PATCH_PRESETS.find(q => q.name === w || slug(q.label) === w) || null;
}
export function askPatchMatch(val, curVoice) {
  const presets = () => PATCH_PRESETS.map(q => q.label).join(", ");
  let kv = {};
  if (val && typeof val === "object") kv = {...val};
  else {
    const str = String(val === undefined || val === null ? "" : val).trim();
    if (!str) throw new Error("say a patch: a preset (" + presets() + ") or changes like attack=0.02 vib_depth=0.4");
    if (!str.includes("=")) {
      const pre = askPatchPreset(str);
      if (!pre) throw new Error("no patch preset named \"" + str + "\" — presets: " + presets());
      return patchVoiceId(pre);
    }
    const words = [];
    for (const tok of str.split(/\s+/)) { const i = tok.indexOf("="); if (i < 0) words.push(tok); else kv[tok.slice(0, i)] = tok.slice(i + 1); }
    if (words.length) kv.preset = words.join(" ");
  }
  const raw = {};
  for (const [k0, v] of Object.entries(kv)) {
    const k = ASK_PATCH_KEYS[k0.toLowerCase()];
    if (!k) throw new Error("unknown patch setting \"" + k0 + "\" — use preset, wave, attack, decay, sustain, release, vib_rate, vib_depth, vib_delay (or env=A,D,S,R / vib=rate,depth,delay)");
    if (k === "env") { const q = String(v).split(","); ["a", "d", "s", "r"].forEach((x, i) => { if (q[i] !== undefined && q[i] !== "") raw[x] = q[i]; }); }
    else if (k === "vib") { const q = String(v).split(","); ["vr", "vx", "vd"].forEach((x, i) => { if (q[i] !== undefined && q[i] !== "") raw[x] = q[i]; }); }
    else raw[k] = v;
  }
  let base = parsePatchVoice(curVoice) || {name: "patch", wave: "square", a: 0.005, d: 0, s: 1, r: 0.03, vr: 0, vx: 0, vd: 0};
  if (raw.preset !== undefined) {
    const pre = askPatchPreset(raw.preset);
    if (!pre) throw new Error("no patch preset named \"" + raw.preset + "\" — presets: " + presets());
    base = {...pre, extra: []};
  }
  const p = {...base};
  if (raw.wave !== undefined) {
    const w = String(raw.wave).trim().toLowerCase();
    const hit = PATCH_WAVES.find(([id, label]) => id === w || label === w || (w === "saw" && id === "sawtooth") || (w === "pulse" && id === "square"));
    if (!hit) throw new Error("wave must be one of: " + PATCH_WAVES.map(([, l]) => l).join(", "));
    p.wave = hit[0];
  }
  for (const [k, label, lo, hi] of PATCH_PARAMS) {
    if (raw[k] === undefined) continue;
    const v = +raw[k];
    if (!(Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(label + " must be " + lo + "–" + hi + (k === "s" ? " (0..1 of the peak)" : k === "vr" ? " Hz" : k === "vx" ? " semitones" : " seconds"));
    p[k] = v;
  }
  return patchVoiceId(p);
}
export function askSetTrack(a) {
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  a = a || {};
  const ti = askFindTrackIndex(a.track);
  const tr = S.song.tracks[ti];
  const trackName = () => tr.name || "track " + (ti + 1);
  const given = k => askActGiven(a[k]);
  if (!["mute", "solo", "hide", "volume", "pan", "voice", "patch", "color", "name", "octave"].some(given))
    throw new Error("say what to change: mute, solo, hide, volume, pan, voice, patch, color, name, or octave");
  if (given("voice") && given("patch")) throw new Error("say voice or patch, not both — a patch IS the track's voice");
  // every value is checked before anything changes: a bad one used to land
  // the earlier settings in S.trackState without their track: annotation,
  // and the next successful call then wrote them (2026-10-05 browser check)
  let vol, pan, color, voice, oct;
  if (given("volume")) {
    const m = String(a.volume).trim().match(/^(-?[\d.]+)\s*(%?)$/);
    let v = m ? +m[1] : NaN;
    if (m && (m[2] || v > 1.5) && v <= 150) v = v / 100; // "70" or "70%" — people say percent
    if (!(Number.isFinite(v) && v >= 0 && v <= 1.5)) throw new Error("volume must be 0–150% (100% = unity, the mixer fader's own range)");
    vol = v;
  }
  if (given("pan")) {
    const v = +a.pan;
    if (!(Number.isFinite(v) && v >= -1 && v <= 1)) throw new Error("pan must be -1 (left) to 1 (right)");
    pan = Math.round(v * 100) / 100;
  }
  if (given("color")) {
    color = String(a.color).trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("color must be a hex code like #4488ff (the voice menu's own color picker)");
  }
  if (given("voice")) voice = askVoiceMatch(a.voice);
  if (given("patch")) voice = askPatchMatch(a.patch, tr.voice);
  if (given("octave")) {
    oct = String(a.octave).trim();
    if (oct !== "1" && oct !== "+1" && oct !== "-1") throw new Error("octave must be 1 or -1 (up or down one octave)");
    if (trackIsDrums(ti)) throw new Error("\"" + trackName() + "\" is a drum/noise track — kit pitches are instruments, not notes; it doesn't transpose");
  }
  const notes = [];
  const undoLen = S.editUndo.length;
  if (given("name")) { // the one step that can still refuse — it runs before anything else lands
    const err = renameTrack(ti, String(a.name));
    if (err) throw new Error(err);
    notes.push("renamed to \"" + String(a.name).trim() + "\"");
  }
  const st = S.trackState[ti] || (S.trackState[ti] = {muted: false, solo: false});
  let touchedDir = false;
  if (given("mute")) { st.muted = askActTruthy(a.mute); touchedDir = true; notes.push(st.muted ? "muted" : "unmuted"); }
  if (given("solo")) { st.solo = askActTruthy(a.solo); touchedDir = true; notes.push(st.solo ? "solo" : "solo off"); }
  if (given("hide")) { st.hidden = askActTruthy(a.hide); touchedDir = true; notes.push(st.hidden ? "hidden" : "unhidden"); }
  if (vol !== undefined) { tr.vol = vol === 1 ? undefined : vol; touchedDir = true; notes.push("volume " + Math.round(vol * 100) + "%"); }
  if (pan !== undefined) {
    tr.pan = pan; touchedDir = true;
    notes.push("pan " + (Math.abs(tr.pan) < 0.025 ? "center" : (tr.pan < 0 ? "L" : "R") + Math.round(Math.abs(tr.pan) * 100)));
  }
  if (color !== undefined) { tr.color = color; touchedDir = true; notes.push("color " + color); }
  if (voice !== undefined) { tr.voice = voice === "auto" ? undefined : voice; touchedDir = true; notes.push("voice " + askVoiceLabel(voice)); }
  if (touchedDir) saveTrackDir(ti);
  if (oct !== undefined) {
    const k = transposeTrack(ti, oct === "-1" ? -12 : 12);
    if (k) notes.push("octave " + (oct === "-1" ? "down" : "up") + " (" + k + " note" + (k === 1 ? "" : "s") + ")");
    else notes.push("octave unchanged — a note would leave the roll");
  }
  askFoldUndo(undoLen);
  renderTrackbar(); buildScoreModel(); updateTrackGains(); clampView(); draw();
  return {ok: true, note: trackName() + ": " + notes.join(", ") + (S.editUndo.length > undoLen ? " (one undo restores it)" : "")};
}
// add_track / delete_track (compositions only — a track structurally
// growing or shrinking is the same isComposition() gate the ＋ chip and the
// voice menu's ✕ Delete track use; local drafts of a capture/import can
// rename and reconfigure a track through set_track but not add or remove
// one, exactly as those two chips are hidden there today).
export function askAddTrack(a) {
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  if (!isComposition()) throw new Error("adding a track works on your own songs — this is an import or capture; song_file save_as makes an editable copy first");
  a = a || {};
  const name = String(a.name || "").trim();
  if (!name) throw new Error("say a name for the new track");
  if (S.song.tracks.some(tr => (tr.name || "").toLowerCase() === name.toLowerCase())) throw new Error("a track named \"" + name + "\" already exists");
  let voice;
  if (askActGiven(a.voice)) voice = askVoiceMatch(a.voice); // validated before anything is created
  const undoLen = S.editUndo.length;
  const ti = addTrackUndoable({name, notes: []});
  pushUndo({kind: "trackRemove", ti});
  if (voice !== undefined) { S.song.tracks[ti].voice = voice === "auto" ? undefined : voice; saveTrackDir(ti); }
  askFoldUndo(undoLen);
  saveDraft();
  renderTrackbar(); buildScoreModel(); updateTrackGains(); draw();
  return {ok: true, note: "added track \"" + name + "\"" + (voice !== undefined ? " — voice " + askVoiceLabel(voice) : "") + " (one undo removes it)"};
}
export function askDeleteTrack(a) {
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  if (!isComposition()) throw new Error("deleting a track works on your own songs — this is an import or capture");
  a = a || {};
  if (S.song.tracks.length <= 1) throw new Error("can't delete the last track — a song needs at least one");
  const ti = askFindTrackIndex(a.track);
  const name = S.song.tracks[ti].name || "track " + (ti + 1);
  const live = S.song.tracks[ti].notes.filter(n => !n.gone).length;
  pushUndo({kind: "trackInsert", ti, track: S.song.tracks[ti], raw: S.song.rawNotes ? S.song.rawNotes[ti] : null, state: S.trackState[ti]});
  S.song.tracks.splice(ti, 1);
  if (S.song.rawNotes) S.song.rawNotes.splice(ti, 1);
  S.trackState.splice(ti, 1);
  S.selTrack = Math.max(0, Math.min(S.selTrack, S.song.tracks.length - 1));
  S.multiSel = []; S.multiSelKey = new Set(); S.selNote = null;
  saveDraft();
  renderTrackbar(); buildScoreModel(); updateTrackGains(); computeSongEnd(); draw();
  return {ok: true, note: "deleted \"" + name + "\"" + (live ? " (" + live + " note" + (live === 1 ? "" : "s") + ")" : "") + " — one undo brings it back"};
}
// keep_that (🎹 Keep that — src/input/record.js's captureKeep, the SAME
// rolling 60s buffer and recTakeNote/recCommitTake path ● Record itself
// uses, so a kept phrase is a recording in every way that matters). No args
// of its own beyond which track; captureKeep always targets S.selTrack.
export function askKeepThat(a) {
  const gate = askWritableGate();
  if (gate) throw new Error(gate);
  if (S.recording) throw new Error("Record is already taking this down — ● or ■ stops it first, then ask again");
  a = a || {};
  if (askActGiven(a.track)) S.selTrack = askFindTrackIndex(a.track);
  const tr = S.song.tracks[S.selTrack];
  if (!tr || tr.kind === "audio") throw new Error("pick a note track to keep the phrase on — say which: " + S.song.tracks.map((t, ti) => t.name || "track " + (ti + 1)).join(", "));
  const n = captureKeep();
  if (!n) throw new Error("nothing to keep yet — Josh needs to have played something on the keys (or a MIDI keyboard) in the last minute, with nothing recording");
  const name = S.song.tracks[S.selTrack].name || "track " + (S.selTrack + 1);
  return {ok: true, note: "kept " + n + " note" + (n === 1 ? "" : "s") + " on " + name + " at the cursor (one undo restores what was there)"};
}
// album (src/session/album.js's own play/next/prev/leave — the SAME
// albumStart/albumNext/albumPrev/albumLeave the Play-album control and the
// ◂ ▸ ✕ album strip buttons call). Quiet: like play/select, the result line
// is the whole reply. next/prev/leave need no album name; play does, and an
// optional song picks where in it — albumEffectiveOrder, the shown
// game-or-A–Z order, so the index matches what the strip would show.
export async function askAlbum(a) {
  a = a || {};
  const action = String(a.op || a.action || "").trim().toLowerCase(); // op, as edit_notes names it; `action` would collide with act's own item key (still read, for the args wrapper)
  if (!["play", "next", "prev", "leave"].includes(action)) throw new Error("op must be play, next, prev or leave");
  if (action === "leave") {
    if (!S.albumRun) return {ok: true, note: "no album is playing"};
    const album = S.albumRun.album;
    albumLeave();
    return {ok: true, note: "left " + album + " — this song loops on its own now"};
  }
  if (action === "next" || action === "prev") {
    if (!S.albumRun) return {ok: true, note: "no album is playing"};
    if (!S.audio) throw new Error("sound isn't unlocked yet — the browser only starts audio from a tap: tap Play once, then ask again");
    if (action === "next") albumNext(); else albumPrev();
    const [title] = S.albumRun.list[S.albumRun.idx];
    return {ok: true, note: "▶ " + title + " (" + (S.albumRun.idx + 1) + "/" + S.albumRun.list.length + ") — " + S.albumRun.album};
  }
  const albumArg = [a.album, a.name].find(askActGiven);
  if (!albumArg) throw new Error("say which album");
  const names = Object.keys(S.CATALOG);
  const want = String(albumArg).trim().toLowerCase();
  let hits = names.filter(n => n.toLowerCase() === want);
  if (!hits.length) hits = names.filter(n => n.toLowerCase().includes(want));
  if (!hits.length) throw new Error("no album named \"" + albumArg + "\" — albums here: " + names.join(", "));
  if (hits.length > 1) throw new Error("more than one album matches \"" + albumArg + "\": " + hits.join(", ") + " — say which");
  const album = hits[0];
  const list = albumEffectiveOrder(album);
  let idx = 0;
  if (askActGiven(a.song)) {
    const sq = String(a.song).trim().toLowerCase();
    let sHits = list.map((s, i) => i).filter(i => list[i][0].toLowerCase() === sq || list[i][1].toLowerCase().includes(sq));
    if (!sHits.length) sHits = list.map((s, i) => i).filter(i => list[i][0].toLowerCase().includes(sq));
    if (!sHits.length) throw new Error("no song named \"" + a.song + "\" in " + album);
    if (sHits.length > 1) throw new Error("more than one song in " + album + " matches \"" + a.song + "\": " + sHits.map(i => list[i][0]).join(", ") + " — say which");
    idx = sHits[0];
  }
  if (!S.audio) throw new Error("sound isn't unlocked yet — the browser only starts audio from a tap: tap Play once, then ask again");
  albumStart(album, idx).catch(() => {}); // not awaited, like the play action — the result line is the intent, loadSong's own status lines cover the rest
  return {ok: true, note: "▶ playing " + album + " from " + list[idx][0] + " (" + (idx + 1) + "/" + list.length + ")"};
}
// ---- song_file (docs/ai-parity.md §5 batch 8, 2026-10-05): new, save
// version, versions (list), save as, rename, share link. Every sub-action
// is the File menu's own function — never a parallel path. No native
// dialogs: a name collision that would otherwise pop appConfirm() (Save As
// of an Untitled song) is checked BEFORE calling it, so the action errors
// instead of hanging on a tap that will never come; Versions… RESTORE and
// the export/download sheets need a real tap and are the not-yet-built
// `show` action's job (docs/ai-parity.md §1), not song_file's.
const SONG_FILE_ACTIONS = ["new", "save_version", "versions", "save_as", "rename", "share_link"];
export async function askSongFile(a) {
  a = a || {};
  const action = String(a.op || a.action || "").trim().toLowerCase(); // op, as edit_notes names it; `action` would collide with act's own item key (still read, for the args wrapper)
  if (!SONG_FILE_ACTIONS.includes(action)) throw new Error("op must be one of " + SONG_FILE_ACTIONS.join(", "));
  if (action === "new") {
    const title = String(a.title || "").trim();
    if (!title) throw new Error("say a title for the new song");
    const folder = askActGiven(a.folder) ? folderFromInput(String(a.folder)) : (localStorage.getItem("ff1roll-lastfolder") || "my-covers");
    if (!folder) throw new Error("\"" + a.folder + "\" isn't a usable folder name — pick another");
    const newKey = "albums/" + folder + "/" + slugify(title) + ".mid";
    if (localStorage.getItem(draftStoreKey(newKey)) !== null) throw new Error("a local copy named \"" + title + "\" already exists in " + folder + " — pick a different title (saveSongAs would ask to replace it, a tap this can't make)");
    if (S.playing) stop();
    createComposition(120, 4, 4); // the form's own defaults — bpm/meter aren't in this action's args
    const ok = await saveSongAs(folder, title);
    if (!ok) throw new Error("could not save the new song — try again");
    return {ok: true, note: "new song \"" + title + "\" in " + folder + " — Edit → Pencil to write"};
  }
  if (action === "save_version") {
    if (!S.song || !S.songKey) throw new Error("no song open");
    if (isUnsaved(S.songKey)) throw new Error("name this song first — song_file {action:\"new\"} or {action:\"save_as\"}");
    if (!isComposition()) throw new Error("Save Version works on your own songs — this one is a capture; save_as forks it");
    if (S.cmp && S.cmp.showing === "repo") throw new Error("you're hearing the published copy — swap back to your version first");
    saveDraft(false); // the working copy is what gets versioned; make sure it's current first
    const label = askActGiven(a.label) ? String(a.label).trim() : "Version " + (readVersions(S.songKey).length + 1);
    pushVersion(S.songKey, label);
    await filesMirror(); // best-effort, like Save Version itself — the iPad's Files copy follows
    return {ok: true, note: "Version saved: " + label + " — only on this device"};
  }
  if (action === "versions") {
    if (!S.song || !S.songKey) throw new Error("no song open");
    const list = readVersions(S.songKey).slice().reverse(); // newest first, as the sheet shows them
    if (!list.length) return {ok: true, note: "no saved versions for this song yet"};
    return {ok: true, note: list.map((v, i) => (i + 1) + ". " + v.label + " — " + new Date(v.at).toLocaleString()).join("\n")};
  }
  if (action === "save_as") {
    const title = String(a.title || "").trim();
    if (!title) throw new Error("say a title for the copy");
    if (!S.song || !S.songKey) throw new Error("no song open");
    let folder;
    if (askActGiven(a.folder)) { folder = folderFromInput(String(a.folder)); if (!folder) throw new Error("\"" + a.folder + "\" isn't a usable folder name — pick another"); }
    if (S.playing) stop();
    forkCurrentSong(title, folder); // folder undefined: forkCurrentSong's own default (the last-used folder)
    return {ok: true, note: "saved a copy as \"" + title + "\"" + (folder ? " in " + folder : "") + " — fully editable"};
  }
  if (action === "rename") {
    const title = String(a.title || "").trim();
    if (!title) throw new Error("say the new name");
    if (!S.song || !S.songKey) throw new Error("no song open");
    const hasDraft = localStorage.getItem(draftStoreKey(S.songKey)) !== null;
    if (hasDraft && !(S.song && S.song.savedStamp)) { // never committed: renames the file itself, like the File menu's own form
      const newKey = renameImportDraft(S.songKey, title);
      if (newKey === null) throw new Error("a draft named \"" + slugify(title) + "\" already exists");
      updateSongBtn();
      return {ok: true, note: "renamed to \"" + title + "\" (a local draft — the name commits with it)"};
    }
    const token = writeToken(); // a repo song: a title override in album.json/the manifest, filename untouched
    if (!token) throw new Error("no GitHub token stored yet — add one in File → Settings first");
    await renameRepoTitle(S.songKey, title, ghHeaders(token));
    try { await initCatalog(); } catch (err) { /* CDN lag; the next boot catches up */ }
    for (const songs of Object.values(S.CATALOG)) { const hit = songs.find(([, p]) => p === S.songKey); if (hit) hit[0] = title; } // the refetch can be CDN-stale for ~10 min — patch the in-memory catalog now
    updateSongBtn();
    return {ok: true, note: "renamed to \"" + title + "\" everywhere the dropdown shows it"};
  }
  // share_link
  if (!S.song || !S.songKey) throw new Error("no song open");
  if (!catalogHas(S.songKey)) return {ok: true, note: "this song only lives on this device — Publish it first, then ask again"};
  return {ok: true, note: "Share link: " + shareLinkFor(S.songKey)};
}
// ---- set_pref (docs/ai-parity.md §5 batch 8, 2026-10-05): device prefs —
// localStorage, same layer the Settings sheet's own checkboxes/selects use
// (CLAUDE.md: device-local UI toggles, never song state). Learning mode is
// deliberately NOT on the whitelist (CLAUDE.md "Learning mode is the law"
// — Ask must never switch Josh into Normal; that switch is what keeps
// answers his); the check runs before the whitelist lookup so a model that
// guesses a learning-flavored name gets the real reason, not a generic one.
const SET_PREF_NAMES = ["album_order", "octave_numbers", "debug_log", "chip_stream", "text_size", "sound", "beat_subdivisions", "volume_slider"];
export function askSetPref(a) {
  a = a || {};
  const name = String(a.name || "").trim().toLowerCase();
  if (/learn/.test(name)) throw new Error("Learning mode is a setting only Josh can flip himself (Settings → Learning mode, or the View menu) — never through Ask");
  if (!SET_PREF_NAMES.includes(name)) throw new Error("name must be one of " + SET_PREF_NAMES.join(", "));
  if (!askActGiven(a.value)) throw new Error("say the value");
  const value = a.value;
  if (name === "album_order") {
    const v = String(value).trim().toLowerCase();
    if (!["game", "az", "a-z", "alphabetical"].includes(v)) throw new Error("album_order must be game or az");
    const mode = v === "game" ? "game" : "az";
    setAlbumOrderPref(mode);
    return {ok: true, note: "album order set to " + (mode === "az" ? "A–Z" : "game order")};
  }
  if (name === "octave_numbers") {
    const on = askActTruthy(value);
    S.selOctaves = on; // #octbtn's own two lines, verbatim — no dedicated setter exists yet
    try { localStorage.setItem("ff1roll-seloct", on ? "1" : "0"); } catch (err) { /* private mode */ }
    refreshSelInfo();
    return {ok: true, note: "8va octave numbers " + (on ? "on" : "off")};
  }
  if (name === "debug_log") {
    document.getElementById("cfgdebuglog").checked = askActTruthy(value);
    settingsPersist("cfgdebuglog"); // the Settings sheet's own dispatcher — reads the checkbox it just set
    return {ok: true, note: "debug log " + (askActTruthy(value) ? "on" : "off")};
  }
  if (name === "beat_subdivisions") { // View › Display "Beat subdivisions" (Josh #189): the LCD's e/&/a and +NN%
    const on = askActTruthy(value);
    setBeatSub(on);
    renderViewMenu();
    return {ok: true, note: "beat subdivisions " + (on ? "shown" : "hidden") + " on the counter"};
  }
  if (name === "volume_slider") { // View › Display "Volume slider" (Josh #187): the top bar's 🔊, hidden by default
    const on = askActTruthy(value);
    setVolBtnShown(on);
    renderViewMenu();
    return {ok: true, note: "volume slider " + (on ? "shown in" : "hidden from") + " the top bar"};
  }
  if (name === "sound") { // the View ▾ → Mode "Hear the MIDI" switch (Josh #163): chip = the console voice, midi = the .mid on synth voices
    const v = String(value).trim().toLowerCase();
    if (!["chip", "midi"].includes(v)) throw new Error("sound must be chip or midi");
    setHearMidi(v === "midi");
    if (S.playing) { const at = playSec(); stop(); play(at, {noCountIn: true}); }
    return {ok: true, note: v === "midi" ? "hearing the MIDI — every track on synth voices" : "hearing the console voice where the song has one"};
  }
  if (name === "chip_stream") {
    const v = String(value).trim().toLowerCase();
    if (!["on", "off", "auto"].includes(v)) throw new Error("chip_stream must be on, off, or auto");
    document.getElementById("cfgchipstream").value = v;
    settingsPersist("cfgchipstream");
    return {ok: true, note: "chip audio streaming set to " + v};
  }
  // text_size
  const TS = {small: "0.9", default: "1", normal: "1", large: "1.15", larger: "1.3"};
  const raw = String(value).trim().toLowerCase();
  const v = ["0.9", "1", "1.15", "1.3"].includes(raw) ? raw : TS[raw];
  if (!v) throw new Error("text_size must be small, default, large or larger (or 0.9, 1, 1.15, 1.3)");
  document.getElementById("cfgtextsize").value = v;
  settingsPersist("cfgtextsize");
  return {ok: true, note: "text size set to " + v};
}
