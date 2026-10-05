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
import { insertTime } from "../model/selection.js";
import { openGapShift } from "../model/selection.js";
import { pushUndo } from "../model/edits.js";
import { saveEdits } from "../model/edits.js";
import { computeSongEnd } from "../model/song.js";
import { saveDraft } from "../model/versions.js";
import { deleteTime } from "../model/selection.js";
import { drGenerate } from "../gen/drummer.js";
import { drBassTrack } from "../gen/drummer.js";
import { askAct } from "./actions.js"; // a cycle inside layer 4 (actions.js imports the gate/validators back) — legal (check.mjs §2.3), and neither side touches the other at module-eval time

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
export const ASK_TOOLS = [
  {type: "function", function: {name: "add_annotation", description: "Write ONE annotation into the open song at a bar and beat, exactly as the user asked. Only when the user explicitly asks you to annotate, mark, label or write something — never on your own initiative.",
    parameters: {type: "object", properties: {
      kind: {type: "string", enum: ["chord", "section", "key", "tempo", "loop", "note"], description: "chord = a chord symbol (e.g. F#m, G7/B, Cmaj7#11); section = a form label (Intro, A, B'); key = a key (F#m, Bb, A#/Bb? for tonic-only); tempo = bpm; loop = the return point as bar.beat, placed at the jump point; note = plain prose"},
      text: {type: "string", description: "the symbol, label, key, bpm, bar.beat, or prose — in the user's words"},
      bar: {type: "integer", minimum: 1}, beat: {type: "number", minimum: 1, description: "counted beat, 1 = downbeat; fractions allowed (2.5)"},
      end_bar: {type: "integer", minimum: 1, description: "optional: the last bar the annotation spans"}, end_beat: {type: "number", minimum: 1, description: "optional: the last beat it spans (omit = end of that bar)"},
      comment: {type: "string", description: "optional: a note attached to the annotation, in the user's words"}},
      required: ["kind", "text", "bar", "beat"]}}},
  {type: "function", function: {name: "edit_annotation", description: "Change an EXISTING annotation's text (and, optionally, where it sits). Only when the user explicitly asks you to edit, change, rename, move or correct one — never on your own initiative. Target it by id (from this turn's context block) or by its current bar+beat (+match_text if more than one annotation shares that bar.beat); an ambiguous target is an error, never a guess.",
    parameters: {type: "object", properties: {
      id: {type: "integer", minimum: 0, description: "the annotation's \"id\" exactly as the context block lists it — the surest target; stale after an earlier tool call in the SAME reply changes the annotations, so use bar/beat/match_text for a second edit in one turn"},
      bar: {type: "integer", minimum: 1, description: "the annotation's CURRENT bar — with beat, used to find it when id is omitted or stale"},
      beat: {type: "number", minimum: 1, description: "the annotation's CURRENT counted beat"},
      match_text: {type: "string", description: "the annotation's current text — disambiguates when more than one annotation shares that bar.beat"},
      text: {type: "string", description: "the new symbol, label, key, bpm, bar.beat, or prose — in the user's words"},
      comment: {type: "string", description: "optional: replaces the note attached to the annotation; omit to leave the existing one"},
      new_bar: {type: "integer", minimum: 1, description: "optional: moves the annotation to this bar"}, new_beat: {type: "number", minimum: 1, description: "optional: moves it to this beat"},
      new_end_bar: {type: "integer", minimum: 1, description: "optional: changes the last bar it spans"}, new_end_beat: {type: "number", minimum: 1, description: "optional: changes the last beat it spans"}},
      required: ["text"]}}},
  {type: "function", function: {name: "delete_annotation", description: "Remove ONE existing annotation. Only when the user explicitly asks you to delete, remove or take back one — never on your own initiative. Give id, or bar+beat (+match_text if more than one annotation shares that bar.beat); an ambiguous target is an error, never a guess.",
    parameters: {type: "object", properties: {
      id: {type: "integer", minimum: 0, description: "the annotation's \"id\" exactly as the context block lists it"},
      bar: {type: "integer", minimum: 1, description: "the annotation's current bar — with beat, used when id is omitted or stale"}, beat: {type: "number", minimum: 1, description: "the annotation's current counted beat"},
      match_text: {type: "string", description: "its current text — disambiguates when more than one annotation shares that bar.beat"}}}}},
  {type: "function", function: {name: "publish_song", description: "Publish the open song — the same Publish the footer button runs (song + annotations, or annotations only for a locked capture). Only when the user explicitly says to publish. Refuses, with a reason, when the device isn't connected or there is nothing here to publish.", parameters: {type: "object", properties: {}}}},
  {type: "function", function: {name: "list_songs", description: "List the songs available in this Night Roll (albums, titles, paths) — use when the user refers to another song.", parameters: {type: "object", properties: {}}}},
  {type: "function", function: {name: "read_song", description: "Read another song's notes (or a bar range of it) in the same text format as the context block. Use only when the user asks about another song.",
    parameters: {type: "object", properties: {path: {type: "string", description: "the song path from list_songs"}, from_bar: {type: "integer", minimum: 1}, to_bar: {type: "integer", minimum: 1}}, required: ["path"]}}},
  {type: "function", function: {name: "read_notes", description: "Read another song's annotations (the user's own analysis of it). Use only when the user asks about another song.",
    parameters: {type: "object", properties: {path: {type: "string", description: "the song path from list_songs"}}, required: ["path"]}}},
  {type: "function", function: {name: "read_bars", description: "Read bars of the OPEN song beyond what the context block's current window already shows — the same compact note rows, from LIVE app state (any unsaved edits included). Ask for this instead of guessing what an out-of-view bar holds, or claiming you cannot see it. The span is capped; a truncated reply says so and names where to continue from.",
    parameters: {type: "object", properties: {
      from_bar: {type: "integer", minimum: 1},
      to_bar: {type: "integer", minimum: 1, description: "inclusive; omit for just from_bar"},
      tracks: {type: "array", items: {type: "string"}, description: "optional: limit to these tracks, by number (\"1\") or name — omit for every track"}},
      required: ["from_bar"]}}},
  {type: "function", function: {name: "write_notes", description: "Write notes into THIS song on a track the user names. Only when the user explicitly asks you to write, insert, add, or fill in notes — their request is the per-instance approval for their own song; never on your own initiative, and never volunteer chords, keys, or any note they didn't dictate. Spell out every note individually — a shorthand term like \"gallop\" means nothing to the app; write it as the eighth note plus two sixteenths it stands for. track names an EXISTING track exactly as the user said it (e.g. \"triangle\", \"pulse1\") — matched against this song's own track names; never default to whichever track is selected in the app, and an unknown or ambiguous name is an error naming this song's actual track names, never a guess. Works only on the user's own editable songs — refuses on a locked/capture song, naming the fix (✎ Edit makes an editable copy). Every note is validated before anything is written; one bad note and nothing lands. The written notes land as ONE undo step, and the reply is one short line saying what was written.",
    parameters: {type: "object", properties: {
      track: {type: "string", description: "the track name as the user said it (e.g. \"triangle\", \"pulse1\") — matched case-insensitively against this song's track names"},
      notes: {type: "array", description: "every note to write, spelled out individually in the user's words", items: {type: "object", properties: {
        pitch: {type: "string", description: "scientific pitch like C4, F#3, Bb2 (C4 = middle C) — or a MIDI note number"},
        bar: {type: "integer", minimum: 1, description: "the ruler's bar number"},
        beat: {type: "number", minimum: 1, description: "counted beat, 1 = downbeat; fractions allowed (2.5)"},
        dur_beats: {type: "number", exclusiveMinimum: 0, description: "duration in beats"},
        vel: {type: "number", minimum: 1, maximum: 127, description: "optional: velocity 1–127 — omit for the app's own default"}},
        required: ["pitch", "bar", "beat", "dur_beats"]}},
      replace: {type: "object", description: "optional: a bar/beat range on the SAME track whose existing notes (by onset) are removed first", properties: {
        from_bar: {type: "integer", minimum: 1}, from_beat: {type: "number", minimum: 1},
        to_bar: {type: "integer", minimum: 1}, to_beat: {type: "number", minimum: 1}}}},
      required: ["track", "notes"]}}},
  {type: "function", function: {name: "copy_bars", description: "Repeat, duplicate or copy bars that already exist in THIS song. Inserts (to_bar − from_bar + 1) bars at at_bar on EVERY track — the same operation as Edit ▾ → Insert bars…, so every later note AND annotation (sections, chords, loop, key/tempo/meter) slides later to make room — then copies the notes of bars from_bar..to_bar (every track, drums included) into the new gap. Prefer this over write_notes whenever the request is to repeat or copy music that is already there, rather than dictate new notes. Only when the user explicitly asks to repeat, duplicate or copy bars — never on your own initiative. Annotations inside the copied range are never duplicated (they are the user's own analysis); only annotations after at_bar shift, same as Insert bars. Works only on the user's own editable songs — refuses on a locked/capture song, naming the fix. Lands as ONE undo step.",
    parameters: {type: "object", properties: {
      from_bar: {type: "integer", minimum: 1, description: "first bar to copy"},
      to_bar: {type: "integer", minimum: 1, description: "last bar to copy, inclusive"},
      at_bar: {type: "integer", minimum: 1, description: "where the copy lands (the gap opens here); to repeat bars 5–6 right after themselves, at_bar is 7"}},
      required: ["from_bar", "to_bar", "at_bar"]}}},
  {type: "function", function: {name: "insert_bars", description: "Insert empty bars into THIS song — the same operation as Edit ▾ → Insert bars…: every later note AND annotation (sections, chords, loop, key/tempo/meter) slides later to make room. Only when the user explicitly asks to insert, add or make room for blank/empty bars — for repeating or copying music that already exists, use copy_bars instead. Works only on the user's own editable songs — refuses on a locked/capture song, naming the fix. Lands as ONE undo step.",
    parameters: {type: "object", properties: {
      at_bar: {type: "integer", minimum: 1, description: "where the new bars go"},
      count: {type: "integer", minimum: 1, description: "how many empty bars to insert"}},
      required: ["at_bar", "count"]}}},
  {type: "function", function: {name: "delete_bars", description: "Delete bars that already exist in THIS song — the same operation as Edit ▾ → Delete bars…, and the inverse of insert_bars: removes count bars starting at from_bar on EVERY track (a note starting inside is deleted, one sustaining across the cut is clipped there) and everything after slides EARLIER to close the gap — annotations too (sections, chords, loop, key/tempo/meter). Annotations are never destroyed: one anchored inside the deleted span moves to the cut point instead, and one straddling the cut shrinks rather than being duplicated or orphaned. Only when the user explicitly asks to delete or remove bars — never on your own initiative. Works only on the user's own editable songs — refuses on a locked/capture song, naming the fix. Lands as ONE undo step.",
    parameters: {type: "object", properties: {
      from_bar: {type: "integer", minimum: 1, description: "first bar to delete"},
      count: {type: "integer", minimum: 1, description: "how many bars to delete"}},
      required: ["from_bar", "count"]}}},
  // Nothing new goes in this list (docs/ai-parity.md §2, Josh #435): a new
  // feature is an ACTION in src/ask/actions.js's registry, reached through
  // the one `act` tool askToolsNow appends — the menu above rides with every
  // message and must not grow. The drummer went that way first (2026-10-05).
];
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
export function askSongPath(p) { // accept a path, a title, or a bare name
  p = String(p || "").trim();
  if (!p) throw new Error("which song?");
  for (const songs of Object.values(S.CATALOG)) for (const [title, path] of songs) if (path === p || path === p + ".mid" || title.toLowerCase() === p.toLowerCase() || path.split("/").pop().replace(/\.midi?$/i, "") === p.toLowerCase()) return path;
  throw new Error("no song at " + p + " — use list_songs");
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
  const kind = String(a.kind || "note"), text = String(a.text || "").trim();
  if (!text) throw new Error("empty text");
  const line = (kind === "note" ? text : kind + ": " + text) + (a.comment ? "\n" + String(a.comment).trim() : "");
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
  return {ok: true, at: head, text: fresh.text, unsynced: true, note: "written on this device; Publish sends it with the song — the user can discard it in the Publish sheet"};
}
export function askEditAnnotation(a) {
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); // version guard, docs/annotations-v2.md P3
  a = a || {};
  const n = askFindAnnotation(a);
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
  if (askAnnotationStructural(n)) throw new Error("that annotation is a structural directive (meter/chop/track/audio/lane) — remove it in the app's own editor, not here");
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
export async function askRunTool(name, a) {
  if (name === "add_annotation") return askAddAnnotation(a || {});
  if (name === "edit_annotation") return askEditAnnotation(a || {});
  if (name === "delete_annotation") return askDeleteAnnotation(a || {});
  if (name === "publish_song") return askPublishSong();
  if (name === "list_songs") return Object.entries(S.CATALOG).map(([album, songs]) => ({album, songs: songs.map(([title, path]) => ({title, path}))}));
  if (name === "read_song") {
    const path = askSongPath(a && a.path);
    const res = await readData("songs", path);
    if (!res.ok) throw new Error("could not read " + path);
    const doc = parseMidi(await res.arrayBuffer());
    return notesTxtForDoc(doc, songTitleOf(path), a.from_bar, a.to_bar, 6000, path);
  }
  if (name === "read_notes") {
    const path = askSongPath(a && a.path);
    const res = await readData("analysis", path.replace(/\.midi?$/i, "") + ".rollnotes.json");
    if (!res.ok) return "(no annotations saved for " + path + ")";
    let j; try { j = JSON.parse(await res.text()); } catch (err) { return "(annotations unreadable)"; }
    const at = e => "[" + (e.at || [1, 1]).join(".") + (e.to ? " - " + e.to.join(".") : "") + "]";
    return (j.notes || []).filter(e => annoShown(e)).map(e => at(e) + " " + (e.type ? e.type + ": " + (e.chord || e.label || e.key || e.bpm || e.loop || e.timesig || e.track || e.chop || e.lane || "") : e.text || "") + (e.note ? " — " + e.note : "")).join("\n") || "(no annotations)";
  }
  if (name === "read_bars") return askReadBars(a || {});
  if (name === "write_notes") return askWriteNotes(a || {});
  if (name === "copy_bars") return askCopyBars(a || {});
  if (name === "insert_bars") return askInsertBars(a || {});
  if (name === "delete_bars") return askDeleteBars(a || {});
  if (name === "act") return askAct(a); // the whole argument object as sent — askActItems tolerates every shape a model emits (a string, one item, nested lists)
  throw new Error("unknown tool " + name);
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
export function askDrummerRange(a) { // → {fromBar, toBar}: whole bars, or ONE declared section label's span
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
