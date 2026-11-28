import { beatsPerBarEff } from "./grid.js";
import { S } from "../state.js";
import { fileKey } from "../midi/parse.js";
import { keyNameToSf } from "../theory/key.js";
import { romanPretty } from "../theory/chords.js";
import { beatTicks } from "./grid.js";
import { beatsPerBarDisp } from "./grid.js";
import { snapBeat } from "./grid.js";
import { pickupTicks, frameBQ, hasEnd } from "./grid.js";
import { tombKeyFor, tombstone } from "./edits.js";
import { noteIdentity } from "./edits.js";
import { retireEdited } from "./edits.js";
import { saveLocalNotes } from "./edits.js";
import { LINK_SONGS } from "../platform/base.js";
import { readData } from "../platform/folder.js";
import { setAnchorBQ } from "../hooks.js";
import { appMode } from "../platform/mode.js";

// ---------------------------------------------------------------- rollnotes
export function barTicks() { return beatsPerBarEff() * S.song.ppq; }
export function applyChop(cStart, cEnd) { // docs/split-plan.md §4 step 1 deviation: params
  // were named S/E pre-split, a coincidental collision with the state
  // container's name promote-state.mjs introduces — renamed here (pure local
  // rename, no behavior change) so `S.song`/`S.appliedChop`/etc. below
  // resolve to the real state object instead of being shadowed by this
  // function's own parameter. See "Deviations (1)" in docs/split-plan.md.
  if (!S.song || !S.song.rawNotes) return false;
  const sig = cStart + ":" + (cEnd === null ? "" : cEnd);
  if (S.appliedChop === sig) return false;
  if (S.cmp && S.cmp.showing === "repo") return false; // comparing: the roll is the published copy; carve once his version is back
  syncRawNotes(); // the old view's edits go back first, or the new carve drops them
  const oldViews = S.song.tracks.map(tr => tr.notes), uncarved = S.appliedChop === null;
  S.appliedChop = sig; S.chopS = cStart; S.chopE = cEnd;
  S.song.tracks.forEach((tr, ti) => {
    let notes = S.song.rawNotes[ti].map((n, ri) => ({...n, ri})); // ri: raw index, keeps edit ids stable
    if (cStart || cEnd !== null) {
      notes = notes.filter(n => n.t + n.d > cStart && (cEnd === null || n.t < cEnd));
      for (const n of notes) {
        if (n.t < cStart) { n.d -= cStart - n.t; n.t = cStart; } // clip notes straddling the cut
        n.t -= cStart;
        if (cEnd !== null && n.t + n.d > cEnd - cStart) n.d = cEnd - cStart - n.t;
      }
    }
    tr.notes = notes;
    delete tr.kitSwapped; // fresh from rawNotes: the file's keys again; finalizeNotes swaps them back if "Not drums" still says so
  });
  remapNoteRefs(oldViews, uncarved);
  return true;
}
// A carve rebuilds every track's notes array, so a {ti, ni} kept across it
// (undo/redo entries, the selection, a record take) named whatever note now
// sits at that index — ⌘Z after a chop change hit the wrong note. Each ref
// learns its note's ri (the identity a carve keeps) and its ni follows it;
// a note outside the new window gets ni -1 (every reader skips a missing
// note) and keeps its ri, so the carve that brings it back finds it again.
// uncarved: setSong's view, not yet linked — there view index = raw index.
export function remapNoteRefs(oldViews, uncarved) {
  const where = S.song.tracks.map(tr => { const m = new Map(); tr.notes.forEach((n, ni) => m.set(n.ri, ni)); return m; });
  const fix = it => {
    if (!it || typeof it.ti !== "number" || typeof it.ni !== "number") return;
    if (it.ri === undefined) { const o = oldViews[it.ti] && oldViews[it.ti][it.ni]; it.ri = o && o.ri !== undefined ? o.ri : uncarved && o ? it.ni : undefined; }
    const ni = where[it.ti] && it.ri !== undefined ? where[it.ti].get(it.ri) : undefined;
    it.ni = ni === undefined ? -1 : ni;
  };
  const walk = e => {
    if (!e) return;
    if (e.kind === "group") { (e.entries || []).forEach(walk); return; }
    if (e.kind === "trackInsert" || e.kind === "trackRemove" || e.kind === "trackReorder" || e.kind === "anno") return;
    if (e.items) e.items.forEach(fix); else fix(e);
  };
  S.editUndo.forEach(walk); S.editRedo.forEach(walk); walk(S.editInFlight);
  S.multiSel.forEach(fix); S.multiSel = S.multiSel.filter(m => m.ni >= 0);
  S.multiSelKey = new Set(S.multiSel.map(m => m.ti + ":" + m.ni));
  if (S.selNote) { fix(S.selNote); if (S.selNote.ni < 0) S.selNote = null; }
  (S.recTake || []).forEach(fix);
}
// rawNotes is the chop's source; a re-carve (applyChop) and Save As
// (forkCurrentSong) read it, so first it takes back every edit made to the
// view since the last carve — not every edit site mirrors through ri
// (velocity lane, shapes, …), and a note pushed without addSongNote has no
// ri at all. Linked notes overwrite their twin (t/d only when they differ
// from what the carve made of it, so an untouched note straddling a cut
// isn't clipped for good); unlinked ones join raw; a raw note inside the
// window that no view note claims was spliced out of the view: gone.
export function syncRawNotes() {
  if (!S.song || !S.song.rawNotes || S.appliedChop === null) return; // setSong → first finalizeNotes (loadNotes is async): the view isn't carved, so nothing on it carries ri — an edit in that window has no twin to write to and is lost to the first carve (a known gap)
  if (S.cmp && S.cmp.showing === "repo") return; // comparing: the roll holds the published notes (cmpShow's clones), not his — writing them back would bury his
  const cs = S.chopS || 0, ce = S.chopE === undefined ? null : S.chopE;
  S.song.tracks.forEach((tr, ti) => {
    if (!S.song.rawNotes[ti]) { // a track with no raw list: its view is all there is
      S.song.rawNotes[ti] = tr.notes.map((n, ri) => { n.ri = ri; return rawTwin(n, n.t + cs, n.d, tr); });
      return;
    }
    const raw = S.song.rawNotes[ti], claimed = new Set();
    for (const n of tr.notes) {
      const r = n.ri !== undefined && !claimed.has(n.ri) ? raw[n.ri] : null; // a {...n} clone shares its source's ri: the first one keeps it
      if (!r) { n.ri = raw.push(rawTwin(n, n.t + cs, n.d, tr)) - 1; claimed.add(n.ri); continue; }
      claimed.add(n.ri);
      let t = r.t, d = r.d; // what applyChop made of r
      if (t < cs) { d -= cs - t; t = cs; }
      t -= cs;
      if (ce !== null && t + d > ce - cs) d = ce - cs - t;
      const same = n.t === t && n.d === d;
      const twin = rawTwin(n, same ? r.t : n.t + cs, same ? r.d : n.d, tr);
      for (const k of Object.keys(r)) delete r[k];
      Object.assign(r, twin);
    }
    raw.forEach((r, ri) => { if (!claimed.has(ri) && !r.gone && r.t + r.d > cs && (ce === null || r.t < ce)) r.gone = true; });
  });
}
export function rawTwin(n, t, d, tr) { // a view note as rawNotes keeps it: raw ticks, the file's GM key, no link, its own shape arrays
  const r = {...n, t, d, p: fileKey(tr, n)};
  delete r.ri; delete r.pKit;
  if (n.env) r.env = n.env.map(q => ({...q}));
  if (n.duties) r.duties = n.duties.map(q => ({...q}));
  return r;
}
export function notesBase() { return S.songKey ? S.songKey.replace(/\.midi?$/i, "") : null; }
// path minus extension
export function baseName() { return notesBase() ? notesBase().split("/").pop() : "notes"; }
export function notesStoreKey() { return S.songKey ? "ff1roll-notes-" + S.songKey : null; }
// .rollnotes is JSON (version 1, 2026-08-15 — see NIGHT-ROLL.md). The legacy
// text grammar parses forever: both formats reduce to the same raw shape and
// run through the SAME directive derivation, so they cannot disagree.
export function parseRollnotes(text) {
  if ((text || "").trimStart().startsWith("{")) return parseRollnotesJSON(text);
  const out = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\[\s*(\d+)(?:\.(\d+(?:\.\d+)?))?\s*(?:-\s*(\d+)(?:\.(\d+(?:\.\d+)?))?\s*)?\]/);
    if (m) {
      if (cur) out.push(cur);
      cur = {b1: +m[1], q1: m[2] ? +m[2] : 1, b2: m[3] ? +m[3] : null, q2: m[4] ? +m[4] : null, text: ""};
    } else if (cur && !line.startsWith("#")) {
      cur.text += (cur.text ? "\n" : "") + line;
    }
  }
  if (cur) out.push(cur);
  return deriveNoteTypes(out);
}
// Every per-note field this build's writer (noteToJSONBase/noteToJSON) can
// produce. Anything else on an entry is a field a NEWER build wrote (or an
// older one spelled differently): jsonToRawNote keeps it on n.extra and
// noteToJSON writes it back, so a stale client (an iPad bundle not yet
// rebuilt, a service-worker-cached tab) that publishes never strips it.
// Same for a whole TYPE this build doesn't know — kept verbatim as
// n.opaque (docs/annotations-v2.md "Forward compatibility", review of the
// analysis-sheet plan 2026-10-05: the old default: branch read j.text,
// got "", and deriveNoteTypes dropped the entry — a silent delete).
export const ROLLNOTES_FIELDS = new Set(["at", "to", "type", "text", "note", "label", "chord", "key", "timesig", "bpm",
  "track", "voice", "color", "vol", "pan", "mute", "solo", "hide", "loop", "file", "offset", "len", "local", "chop", "lane",
  "until", "item", "done", "ai", "title", "kind", "roman", "no5", "layer", "pedal", "drums", "topic", "pickup"]);
// "File under" chips (docs/plans/2026-10-05-analysis-sheet.md §3b): the
// Analysis-sheet prompts a bar note can be listed under — the located ones
// (form, harmony, melody; the song-level prompts take an answer instead).
// `id` is a STUDY_GROUPS prompt id (a test holds the two tables together).
export const FILE_UNDER = [
  {id: "form.sections", label: "Sections"}, {id: "form.phrases", label: "Phrases"}, {id: "form.pairing", label: "Pairing"},
  {id: "harmony.chords", label: "Chords"}, {id: "harmony.numerals", label: "Numerals"}, {id: "harmony.cadences", label: "Cadences"},
  {id: "harmony.bass", label: "Bass"}, {id: "harmony.tension", label: "Tension"},
  {id: "melody.degrees", label: "Degrees"}, {id: "melody.shape", label: "Shape"}, {id: "melody.motifs", label: "Motifs"},
];
export const ROLLNOTES_TYPES = new Set(["section", "chord", "key", "timesig", "tempo", "track", "loop", "audio", "chop", "lane", "analysis", "songnote", "pickup"]);
// `pickup` (Josh #1190–#1192, docs/plans/2026-11-27-pickup-bar.md): ONE entry
// per song, {"at":[1,1],"type":"pickup","pickup":P} — P = the pickup's length
// in the ruler's counted beats (0 < P ≤ beats per bar; fractions on the 16th
// grid). It DEFINES the frame every other anchor is written in: bar 1 starts
// at tick P·beatTicks, the notes before it are bar 0 (model/grid.js). Anchored
// at [1,1] like the song-level entries and treated like them by every bar
// edit (isSongLevelAnno): a frame directive, not a thing at a place. Legacy
// text form `pickup: 1`, parsed forever. A file holding one is version 4.
export const PICKUP_RE = /^pickup:\s*(\d+(?:\.\d+)?)\s*$/i;
export function pickupDirText(p) { return "pickup: " + (+(+p).toFixed(4)); }
export function declaredPickupOf(list) { // the pickup the LIST declares (last wins, as dedupedNotesWithIndex keeps it), else null
  let p = null;
  for (const n of list) if (n.pickup !== undefined && n.pickup !== null) p = n.pickup;
  return p;
}
export function isChopAnno(n) { return !!(n.chopdir || /^chop:\s*(start|end)\s*$/i.test(n.text || "")); } // chopdir is derived in finalizeNotes; a not-yet-finalized list is read by its text
// A chord band's own fields beside its symbol (Josh, Terminal #228/#230):
// `roman` — the Roman numeral HE entered, a string as typed; `no5` — his
// "no fifth" mark. Absent = none. Only ever what he (or the AI on his
// dictation) wrote: nothing derives either from the notes or a key.
// `layer` (docs/plans/2026-11-27-layered-chords.md, #1159–#1162): an
// integer ≥ 1 on a chord he wrote OVER another chord with the identical
// span — "chords within chords". Absent = layer 0 = every chord before it.
// The number is an identity, never a position: deleting a layer renumbers
// nothing, and the ruler row comes from the layers present (finalizeNotes).
// `pedal` (Josh #1177): true on a chord band that marks a bass pedal point —
// label "<root> ped." (theory/chords.js pedalLabel). Absent = an ordinary
// chord. No version bump: an older build ignores the field and draws a chord
// band; here it draws on its own row(s) UNDER every chord row (finalizeNotes),
// never supersedes a chord nor is superseded by one (dropSupersededBy), spells
// only its root and yields to any chord covering the note (chordBandAt), and
// the Bassist, the Drummer and Check labels pass it by.
export function chordExtrasFrom(o) {
  const x = {};
  const r = typeof o.roman === "string" ? o.roman.trim() : "";
  if (r) x.roman = r;
  if (o.no5 === true || o.no5 === 1) x.no5 = true;
  if (Number.isInteger(o.layer) && o.layer >= 1) x.layer = o.layer;
  if (o.pedal === true || o.pedal === 1) x.pedal = true;
  return x;
}
export function isPedal(n) { return !!(n && n.chord && n.pedal === true); }
export function chordLayer(n) { return n.layer > 0 ? n.layer : 0; }
// the layer "Another chord here" / Ask's stack:true gives a chord written
// over `fresh`'s exact span: one above the highest already there; undefined
// (= layer 0, no field) when no chord sits on that span yet
export function nextChordLayer(fresh) {
  let top = -1;
  for (const n of S.rollnotes) if (n.chord && sameChordSpan(n, fresh)) top = Math.max(top, chordLayer(n));
  return top >= 0 ? top + 1 : undefined;
}
export function sameChordSpan(n, fresh) {
  return n.b1 === fresh.b1 && (n.q1 || 1) === (fresh.q1 || 1) && (hasEnd(n) ? n.b2 : null) === (hasEnd(fresh) ? fresh.b2 : null) && (n.q2 || null) === (fresh.q2 || null) &&
         (n.until ? n.until.join() : "") === (fresh.until ? fresh.until.join() : ""); // #1179: an exact end is part of the span
}
export function chordBandText(n) { // the band's readout everywhere it is shown: "F# · ♭VII · no5"
  return n.text + (n.chord && n.roman ? " · " + romanPretty(n.roman) : "") + (n.chord && n.no5 ? " · no5" : "");
}
// Does a list of schema entries declare a pickup (#1192)? Read BEFORE the
// entries are converted: it decides whether bar 0 in an anchor means anything.
export function jsonListDeclaresPickup(entries) {
  return entries.some(e => e && typeof e === "object" && (e.type === "pickup" ? +e.pickup > 0 : typeof e.text === "string" && PICKUP_RE.test(e.text.split("\n")[0])));
}
// bar0 (#1192, review C1 + the web/native reconcile): bar 0 is a real anchor
// ONLY in a list that declares a pickup — then `at`, `to` and `until` may all
// name the pickup bar, and `to: [0, q]` is a real end. Without a pickup the
// reading is the one every build before had: `at` bar 0 → 1, `to` bar 0 → no
// end, an `until` in bar 0 dropped — so no file written without a pickup
// changes meaning (its writer could never produce bar 0 on purpose). Native
// `Rollnotes.raw(_:bar0:)` is the same rule.
export function jsonToRawNote(j, bar0 = false) { // schema entry -> the raw shape the deriver expects
  const at = Array.isArray(j.at) ? j.at : [1];
  const minBar = bar0 ? 0 : 1;
  const b1 = +at[0], b2 = j.to ? +j.to[0] : NaN;
  const n = {b1: Number.isFinite(b1) && (b1 !== 0 || bar0) ? b1 : 1, q1: at[1] !== undefined ? +at[1] : 1,
             b2: Number.isFinite(b2) && (b2 !== 0 || bar0) ? b2 : null,
             q2: j.to && j.to[1] !== undefined ? +j.to[1] : null, text: ""};
  if (n.b2 === null) n.q2 = null;
  // `until` (Josh #1179): the band's EXCLUSIVE end, [bar, beat], written only
  // when the end is off a whole beat; `to` beside it is the beat the end falls
  // in, for a build that doesn't read this. Present → the end is that exact
  // tick (resolveNote); absent → today's inclusive-`to` rule.
  if (Array.isArray(j.until) && j.until.length === 2 && Number.isFinite(+j.until[0]) && Number.isFinite(+j.until[1]) && +j.until[0] >= minBar && +j.until[1] >= 1) {
    n.until = [+j.until[0], +j.until[1]];
    if (!hasEnd(n)) { n.b2 = n.until[0]; n.q2 = Math.max(1, Math.floor(n.until[1])); } // `until` without `to`: derive the fallback, so every b2 reader still sees a span
  }
  if (typeof j.type === "string" && j.type && !ROLLNOTES_TYPES.has(j.type)) {
    // a type from a newer build: the whole entry rides along untouched and
    // is written back as-is (noteToJSONBase); the text is only a label for
    // All notes — isDirective keeps it off the roll and out of the subtitle
    n.opaque = JSON.parse(JSON.stringify(j));
    const v = j[j.type];
    n.text = j.type + ":" + (typeof v === "string" || typeof v === "number" ? " " + v : "");
    return n;
  }
  const att = j.note ? "\n" + j.note : "";
  switch (j.type) {
    case "section": n.text = "section: " + (j.label || "") + att; break;
    case "chord": n.text = "chord: " + (j.chord || "") + att; Object.assign(n, chordExtrasFrom(j)); break;
    case "key": n.text = "key: " + (j.key || "") + att; break;
    case "timesig": n.text = "timesig: " + (j.timesig || "") + att; break;
    case "tempo": n.text = "tempo: " + j.bpm + att; break;
    case "track": n.text = trackDirText({name: j.track || "", voice: j.voice, color: j.color, vol: j.vol, pan: j.pan, mute: j.mute, solo: j.solo, hide: j.hide, drums: j.drums === true || j.drums === 1 ? true : j.drums === false || j.drums === 0 ? false : undefined}) + att; break;
    case "loop": n.text = "loop: " + (j.loop || "") + att; break;
    case "audio": n.text = audioDirText({track: j.track || "", file: j.file || "", offset: j.offset || 0, len: j.len || null, local: !!j.local}) + att; break;
    case "chop": n.text = "chop: " + (j.chop || ""); break;
    case "lane": n.text = "lane: " + j.lane; break;
    case "pickup": n.text = pickupDirText(Number.isFinite(+j.pickup) ? +j.pickup : 0) + att; break; // a junk value reads "pickup: 0" — the deriver drops it below, never a frame from garbage
    // the Analysis sheet's entry (docs/plans/2026-10-05-analysis-sheet.md §3a):
    // item + tick, body in `note` — tolerated in `text` too, so an entry
    // from a build that spelled the body the other way is never read as
    // empty and dropped
    case "analysis": n.text = studyDirText({item: j.item || "", done: j.done === true || j.done === 1 || j.done === "1"}) +
                              (j.note ? att : j.text ? "\n" + j.text : ""); break;
    case "songnote": n.text = songNoteDirText(songNoteCleanTitle(j.title) || "untitled", songNoteCleanKind(j.kind)) + (j.note ? att : j.text ? "\n" + j.text : ""); break;
    default: n.text = j.text || "";
  }
  if (j.ai && typeof j.ai === "object") n.ai = {model: String(j.ai.model || ""), at: String(j.ai.at || "")}; // ✦ Annotate this song: the AI-estimate tag rides the file, the local store and the undo snapshot (src/ask/annotate.js)
  if (typeof j.topic === "string" && j.topic) n.topic = j.topic; // "File under": the Analysis-sheet prompt this note is listed under (an unknown id rides along, listed nowhere)
  for (const k of Object.keys(j)) {
    if (ROLLNOTES_FIELDS.has(k)) continue;
    (n.extra || (n.extra = {}))[k] = JSON.parse(JSON.stringify(j[k])); // a newer build's field (e.g. a future filing tag): carried, written back, never interpreted
  }
  return n;
}
// .rollnotes v2 (docs/annotations-v2.md, P3 2026-10-01): same top-level
// shape as v1 ({version, song, notes}) plus a header carried as extra top-
// level fields — format, origin, stamp. Only the header is new; "notes" is
// the SAME per-entry schema v1 already writes (noteToJSON/jsonToRawNote), so
// a v2 file runs through the exact same deriver as v1 — this function below
// returns identical in-memory notes for a v1/v2 twin. origin.from/movedFrom
// is where a v2 file states what a "forked from"/"moved from" NOTE used to
// (hasProvenanceNote/originOf, below, read it off the returned array).
// Writer is v2 as of P4 (docs/provenance-plan.md) — serializeNotesList below.
export const ROLLNOTES_FORMAT = "night-roll-annotations";
export const ROLLNOTES_MAX_VERSION = 4;
// highest version this app can read/write; higher = refuse to publish/overwrite (the version guard)
// v3 = v2 + a chord's `layer` (2026-11-27). The writer says 3 ONLY for a list
// that holds a layered chord (rollnotesVersionFor): every un-layered song keeps
// writing version 2 byte-for-byte, and an older build — whose dropSupersededBy
// would silently delete the sibling chord — locks a layered song instead of
// corrupting it (docs/plans/2026-11-27-layered-chords.md §2.1).
// v4 = a `pickup` entry (2026-11-27, #1192): every anchor in such a file is
// in the pickup frame (bar 0 allowed), so an older build would show them all
// T early and write new ones in the wrong frame — it locks instead. The
// version stays a pure function of the list: pickup → 4, else layer → 3,
// else 2 (native RollnotesWriter.version(for:) agrees, byte for byte).
export function rollnotesVersionFor(list) { return declaredPickupOf(list) !== null ? 4 : list.some(n => n.chord && chordLayer(n) > 0) ? 3 : 2; }
export const ROLLNOTES_LOCK_MSG = "⚠ this song's annotations were written by a newer Night Roll — update the app before editing";
export function parseRollnotesJSON(text) {
  let doc;
  try { doc = JSON.parse(text); } catch (err) { return []; }
  if (!doc || typeof doc !== "object") return [];
  const version = typeof doc.version === "number" ? doc.version : 1;
  // v2+ declares its format explicitly; an unrecognized format at version 2+
  // is exactly as untrustworthy as a too-high version number — both lock it.
  // Checked BEFORE the notes-array shape (below), so a future format that
  // doesn't even carry a "notes" array still locks instead of silently
  // reading as empty.
  const unknownFormat = version >= 2 && doc.format !== undefined && doc.format !== ROLLNOTES_FORMAT;
  const tooNew = version > ROLLNOTES_MAX_VERSION || unknownFormat;
  const bar0 = Array.isArray(doc.notes) && jsonListDeclaresPickup(doc.notes); // bar 0 means the pickup bar only in a list that has one (jsonToRawNote)
  const out = Array.isArray(doc.notes) ? deriveNoteTypes(doc.notes.map(e => jsonToRawNote(e, bar0))) : [];
  out.version = version;
  out.origin = (doc.origin && typeof doc.origin === "object") ? doc.origin : null;
  out.readOnly = tooNew;
  out.lockReason = tooNew ? ROLLNOTES_LOCK_MSG : null;
  return out;
}
export function deriveNoteTypes(out) {
  out.forEach(n => {
    n.text = n.text.trim();
    // EVERY typed annotation may carry an attached note: first line is the
    // value, remaining lines are the note — where doubt and reasoning live
    // (web-handoff 2026-08-18; generalizes what chords always had)
    const typed = /^(section|chord|key|timesig|tempo|track|loop|audio|analysis|pickup|songnote(?:\([^)\n]*\))?):/i.test(n.text);
    if (typed && n.text.includes("\n")) {
      const body = n.text.split("\n");
      n.text = body[0].trim();
      const note = body.slice(1).join("\n").trim();
      if (note) n.cnote = note;
    }
    const m = n.text.match(/^section:\s*(.+)/s);
    if (m) { n.section = true; n.text = m[1].trim(); }
    const cm = n.text.match(/^chord:\s*(.+)/s);
    if (cm) {
      n.chord = true;
      n.text = cm[1].trim();
    }
    const kp = n.text.match(/^key:\s*([A-G][#b]?(?:\/[A-G][#b]?)?)\s*\?\s*$/i);
    if (kp) { // partial: tonic stored, mode pending — never applied to the staff
      n.keypartial = kp[1];
      n.text = "key: " + kp[1] + "?";
    } else {
      const km = n.text.match(/^key:\s*(\S+(?:\s+[a-z]+)?)/i); // "Gm" or "D dorian"
      if (km) {
        const sf = keyNameToSf(km[1].trim());
        if (sf !== null) { n.keydir = sf; n.text = "key: " + km[1].trim(); }
      }
    }
    const tm = n.text.match(/^timesig:\s*(\d+)\s*\/\s*(\d+)/i);
    if (tm) { n.tsdir = [+tm[1], +tm[2]]; n.text = "timesig: " + tm[1] + "/" + tm[2]; }
    else delete n.tsdir;
    const bm = n.text.match(/^tempo:\s*(\d+(?:\.\d+)?)\s*$/i);
    if (bm) { n.tempodir = +bm[1]; n.text = "tempo: " + bm[1]; }
    else delete n.tempodir;
    const pm = n.text.match(PICKUP_RE); // `pickup: P` — a positive length only; 0 or junk is no directive (the entry is dropped as empty text would be)
    if (pm && +pm[1] > 0) { n.pickup = +pm[1]; n.text = pickupDirText(n.pickup); n.b1 = 1; n.q1 = 1; n.b2 = null; n.q2 = null; delete n.until; }
    else if (pm) { n.text = ""; delete n.pickup; }
    else delete n.pickup;
    const trm = n.text.match(/^track:\s*(.+?)((?:\s+\w+=\S+)*)\s*$/i); // name may contain spaces
    if (trm) {
      const d = {name: trm[1].trim()};
      for (const kv of trm[2].trim().split(/\s+/).filter(Boolean)) {
        const [k, v] = kv.split("=");
        if (k === "voice") d.voice = v;
        if (k === "color") d.color = v;
        if (k === "vol") d.vol = Math.min(1.5, Math.max(0, parseFloat(v)));
        if (k === "pan") d.pan = Math.min(1, Math.max(-1, parseFloat(v))); // −1 left … +1 right; overrides the .mid's CC10
        if (k === "mute" || k === "solo" || k === "hide") d[k] = v === "1"; // saved with the song, the DAW way (2026-09-29)
        if (k === "drums" && (v === "1" || v === "0")) d.drums = v === "1"; // These are drums (1) / Not drums (0); absent = what the .mid says
      }
      n.trackdir = d;
      n.text = trackDirText(d);
    } else delete n.trackdir;
    // "audio: <track> file=<slug> offset=<sec> local=1" — a clip on a named
    // track; the anchor is where file second `offset` sounds (see NIGHT-ROLL.md
    // "Audio tracks"). local=1 = someone else's recording: never uploaded.
    const am = n.text.match(/^audio:\s*(.+?)((?:\s+\w+=\S+)*)\s*$/i);
    if (am) {
      const d = {track: am[1].trim(), file: "", offset: 0, len: null, local: false};
      for (const kv of am[2].trim().split(/\s+/).filter(Boolean)) {
        const [k, v] = kv.split("=");
        if (k === "file") d.file = v;
        if (k === "offset") d.offset = parseFloat(v) || 0;
        if (k === "len") { const l = parseFloat(v); d.len = isFinite(l) && l > 0 ? l : null; }
        if (k === "local") d.local = v === "1" || v === "true";
      }
      n.audiodir = d;
      n.text = audioDirText(d);
    } else delete n.audiodir;
    const st = studyFromText(n.text);
    if (st) { n.study = st; n.text = studyDirText(st); } else delete n.study;
    const sn = songNoteFromText(n.text);
    if (sn) { n.songnote = sn; n.text = songNoteDirText(sn.title, sn.kind); } else delete n.songnote;
  });
  return out.filter(n => n.text);
}
// ---- the Analysis sheet's own note type (docs/plans/2026-10-05-analysis-
// sheet.md §3a; stored as type "analysis", text line "analysis: <item>
// done=1", body as the attached note). Code names use the `study` stem on
// purpose: `analysis*` in src/ is the Normal-only ESTIMATE layer
// (S.analysisOn, analysisAvailable, gen/analysis.js) and these entries are
// the opposite thing — his own answers, in every mode. One entry per item;
// anchored at 1.1 only because a note needs an anchor: never drawn, never
// a subtitle, never moved by bar edits, never counted by hasNotes.
export function studyDirText(d) { return "analysis: " + d.item + (d.done ? " done=1" : ""); }
export function studyFromText(text) { // {item, done} or null — the ONE parser (deriveNoteTypes, mergeLocalAdditions)
  const m = (text || "").match(/^analysis:\s*(\S+)((?:\s+\w+=\S+)*)\s*$/i);
  if (!m) return null;
  const d = {item: m[1], done: false};
  for (const kv of m[2].trim().split(/\s+/).filter(Boolean)) {
    const [k, v] = kv.split("=");
    if (k === "done") d.done = v === "1" || v === "true";
  }
  return d;
}
export function studyEntryFor(item) { return S.rollnotes.find(n => n.study && n.study.item === item) || null; }
// The sheet's one write path (S2 ticks/answers, S5's Ask kind): replaces
// this item's entry, RETIRING a synced one with a tombstone — dropping it
// from S.rollnotes alone brought the old answer back on reload, and
// mergeLocalAdditions then skipped the new one (review finding 1). An
// unticked entry with nothing to say is removed, not written as an empty
// line. Undo is the caller's: snapshot (annoSnapshot) before calling.
export function putStudyEntry(item, {done = false, text = ""} = {}) {
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); // version guard, docs/annotations-v2.md P3
  const body = (text || "").trim();
  const st = {item, done: !!done};
  const fresh = {b1: 1, q1: 1, b2: null, q2: null, text: studyDirText(st), study: st, added: true};
  if (body) fresh.cnote = body;
  dropSupersededBy(fresh);
  if (st.done || body) S.rollnotes.push(resolveNote(fresh));
  saveLocalNotes();
  return st.done || body ? fresh : null;
}
// ---- song notes (Josh, 2026-10-06; docs/plans/2026-10-06-song-notes-many-
// vs-one.md): his own titled ideas about the whole song ("Sway"), many per
// song. Stored as type "songnote" {at:[1,1], title, note}; in memory the
// text line is "songnote: <title>" and the body is the attached note
// (cnote) — the same shape as `analysis`, with a free title where that has a
// fixed prompt id. The title is the identity: unique per song, compared
// without case. Anchored at 1.1 only because a note needs an anchor: never
// drawn, never a subtitle, never moved by bar edits (isSongLevelAnno).
export function songNoteCleanTitle(t) { return String(t === undefined || t === null ? "" : t).replace(/\s+/g, " ").trim(); }
// What a song note IS (Josh, Terminal #225): a field inside the note, not a
// new type. Absent = general — notes written before kinds existed are never
// rewritten. Adding a kind is one row here; a kind this build doesn't list
// (a newer build's) is kept and written back, shown with its id as label.
export const SONGNOTE_KINDS = [
  {id: "general", label: "General", glyph: ""},
  {id: "question", label: "Open question", glyph: "?"},
];
export function songNoteCleanKind(k) { // "" for general/absent/junk, else the kind id
  const v = String(k === undefined || k === null ? "" : k).trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{0,31}$/.test(v) && v !== "general" ? v : "";
}
export function songNoteKind(n) { return (n && n.songnote && n.songnote.kind) || "general"; }
export function songNoteKindInfo(kind) {
  const id = songNoteCleanKind(kind) || "general";
  return SONGNOTE_KINDS.find(k => k.id === id) || {id, label: id, glyph: ""};
}
// the in-memory text line carries the kind (the unsynced store and the
// deriver only see text): "songnote: T" for general, "songnote(question): T"
export function songNoteDirText(title, kind) { const k = songNoteCleanKind(kind); return "songnote" + (k ? "(" + k + ")" : "") + ": " + title; }
export function songNoteFromText(text) { // {title, kind?} or null — the ONE parser (deriveNoteTypes, mergeLocalAdditions)
  const m = (text || "").match(/^songnote(?:\(([^)\n]*)\))?:[ \t]*([^\n]*\S)[ \t]*$/i);
  if (!m) return null;
  const d = {title: songNoteCleanTitle(m[2])};
  const k = songNoteCleanKind(m[1]);
  if (k) d.kind = k;
  return d;
}
export function songNoteKey(title) { return songNoteCleanTitle(title).toLowerCase(); }
export function songNoteFor(title, list) { // the song note with this title (any case), or null
  const k = songNoteKey(title);
  return (list || S.rollnotes).find(n => n.songnote && songNoteKey(n.songnote.title) === k) || null;
}
export function isSongLevelAnno(n) { return !!(n.study || n.songnote || n.pickup !== undefined); } // bar edits, chop shifts and re-barring leave these at 1.1 (the pickup is the frame itself, #1192)
// The one write path for song notes (the editor's Song chip, Ask's
// song_note): `prev` is the note being edited (any type — a text note
// switched to Song is retired too), null for a new one. A title already
// used by ANOTHER song note throws, nothing changed. The old note is RETIRED
// (tombstoned if synced) — dropping it alone brought it back on reload, the
// analysis entries' finding 1. Undo is the caller's: snapshot first.
export function putSongNote(prev, {title, text = "", kind} = {}) { // kind undefined = keep prev's (general for a new note)
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); // version guard, docs/annotations-v2.md P3
  const t = songNoteCleanTitle(title);
  if (!t) throw new Error("a song note needs a title");
  const clash = S.rollnotes.find(n => n !== prev && n.songnote && songNoteKey(n.songnote.title) === songNoteKey(t));
  if (clash) throw new Error("this song already has a song note called \u201c" + clash.songnote.title + "\u201d — pick another title, or edit that one");
  const k = songNoteCleanKind(kind === undefined ? (prev && prev.songnote && prev.songnote.kind) : kind);
  if (prev) retireEdited(prev);
  const sn = {title: t};
  if (k) sn.kind = k;
  const fresh = {b1: 1, q1: 1, b2: null, q2: null, text: songNoteDirText(t, k), songnote: sn, added: true};
  const body = String(text || "").trim();
  if (body) fresh.cnote = body;
  S.rollnotes.push(resolveNote(fresh));
  saveLocalNotes();
  return fresh;
}
// one PIECE of a recording: anchor = where it starts in the song; offset = where
// in the file it starts; len = how much of the file it plays (absent = the rest)
export function audioDirText(d) {
  return "audio: " + d.track + " file=" + d.file + (d.offset ? " offset=" + (+(+d.offset).toFixed(3)) : "") +
    (d.len ? " len=" + (+(+d.len).toFixed(3)) : "") + (d.local ? " local=1" : "");
}
export function noteToJSON(n) { // enriched-or-stashed note -> schema entry (text prefixes are truth)
  const j = noteToJSONBase(n);
  if (n.extra) for (const k of Object.keys(n.extra)) if (!(k in j)) j[k] = n.extra[k]; // a newer build's fields, back where they were (jsonToRawNote)
  if (n.ai) j.ai = {model: String(n.ai.model || ""), at: String(n.ai.at || "")}; // the ✦ AI tag on every type alike (jsonToRawNote reads it back)
  if (n.topic) j.topic = n.topic; // the "File under" tag, same reasoning (docs/plans/2026-10-05-analysis-sheet.md §3b)
  return j;
}
export function noteToJSONBase(n) {
  const j = {at: n.q1 !== 1 ? [n.b1, n.q1] : [n.b1, 1]};
  if (hasEnd(n)) j.to = (n.q2 !== null && n.q2 !== undefined) ? [n.b2, n.q2] : [n.b2];
  if (hasEnd(n) && Array.isArray(n.until)) j.until = [n.until[0], n.until[1]]; // #1179: the exact end, after `to` (its fallback), before type
  if (n.opaque) { // a type this build doesn't know: the stashed entry verbatim, only the anchors re-read (bar edits may have moved it)
    const o = {};
    for (const k of Object.keys(n.opaque)) o[k] = k === "at" ? j.at : k === "to" ? (j.to || n.opaque.to) : n.opaque[k];
    return o;
  }
  const t = n.text || "";
  let m;
  const withNote = j2 => { if (n.cnote) j2.note = n.cnote; return j2; };
  if (n.study || studyFromText(t)) {
    const st = n.study || studyFromText(t);
    j.type = "analysis"; j.item = st.item;
    if (st.done) j.done = true;
    return withNote(j);
  }
  if (n.songnote || songNoteFromText(t)) {
    const sn = n.songnote || songNoteFromText(t);
    j.type = "songnote"; j.title = sn.title;
    if (sn.kind) j.kind = sn.kind; // absent = general: old notes stay byte-identical
    return withNote(j);
  }
  if (n.section) { j.type = "section"; j.label = t; return withNote(j); }
  if (n.chord) { j.type = "chord"; j.chord = t; Object.assign(j, chordExtrasFrom(n)); return withNote(j); }
  if ((m = t.match(/^key:\s*(.+)$/is))) { j.type = "key"; j.key = m[1].trim(); return withNote(j); }
  if ((m = t.match(/^timesig:\s*(.+)$/is))) { j.type = "timesig"; j.timesig = m[1].trim(); return withNote(j); }
  if ((m = t.match(/^tempo:\s*(\d+(?:\.\d+)?)\s*$/i))) { j.type = "tempo"; j.bpm = +m[1]; return withNote(j); }
  if ((m = t.match(/^track:\s*(.+?)((?:\s+\w+=\S+)*)\s*$/i))) {
    j.type = "track"; j.track = m[1].trim();
    for (const kv of m[2].trim().split(/\s+/).filter(Boolean)) {
      const [k, v] = kv.split("=");
      if (k === "voice") j.voice = v;
      if (k === "color") j.color = v;
      if (k === "vol") j.vol = parseFloat(v);
      if (k === "pan") j.pan = parseFloat(v);
      if ((k === "mute" || k === "solo" || k === "hide") && v === "1") j[k] = true;
      if (k === "drums" && (v === "1" || v === "0")) j.drums = v === "1";
    }
    return withNote(j);
  }
  if ((m = t.match(/^loop:\s*(.+)$/is))) { j.type = "loop"; j.loop = m[1].trim(); return withNote(j); }
  if ((m = t.match(/^audio:\s*(.+?)((?:\s+\w+=\S+)*)\s*$/i))) {
    j.type = "audio"; j.track = m[1].trim();
    for (const kv of m[2].trim().split(/\s+/).filter(Boolean)) {
      const [k, v] = kv.split("=");
      if (k === "file") j.file = v;
      if (k === "offset") j.offset = parseFloat(v) || 0;
      if (k === "len" && parseFloat(v) > 0) j.len = parseFloat(v);
      if (k === "local" && (v === "1" || v === "true")) j.local = true;
    }
    return withNote(j);
  }
  if ((m = t.match(/^chop:\s*(start|end)\s*$/i))) { j.type = "chop"; j.chop = m[1].toLowerCase(); return j; }
  if ((m = t.match(/^lane:\s*(-?\d+)\s*$/))) { j.type = "lane"; j.lane = +m[1]; return j; }
  if ((m = t.match(PICKUP_RE))) { j.type = "pickup"; j.pickup = +m[1]; return withNote(j); } // #1192: the length in beats, a number
  j.text = t;
  return j;
}
export function resolveNote(n) { // anchors → ticks in the open song's frame (meter + pickup, #1192: T = pickupTicks(), bar 0 lands before it)
  const bt = barTicks(), qt = beatTicks(), T = pickupTicks();
  n.start = T + (n.b1 - 1) * bt + (n.q1 - 1) * qt;
  n.end = n.until ? T + (n.until[0] - 1) * bt + (n.until[1] - 1) * qt // #1179: the exclusive end, exactly
        : hasEnd(n) ? T + (n.b2 - 1) * bt + (n.q2 || beatsPerBarDisp()) * qt : null;
  return n;
}
// Duplicate track: directives are dropped HERE, on the write side, last-wins
// per track name. finalizeNotes has done the same on the read side since
// 2026-08-18, but the repo file kept accumulating anyway (Josh found
// sf-organ2 and square25 both live for pulse2, 2026-09-06) — the resurrection
// path was never pinned down. Deduping at serialization makes the mechanism
// moot: every writer goes through here (commit, Move, Copy, Download, and
// annotationsFor, which merges another song's repo copy with local notes
// and is itself a plausible source), so no path can emit two. Factored out
// (P5, 2026-09-30) so the ✦ AI context block can list this SAME set, each
// entry tagged with its index into `list` — askFindAnnotation's id.
export function dedupedNotesWithIndex(list) {
  const lastFor = new Map();
  for (const n of list) if (n.trackdir) lastFor.set(n.trackdir.name.toLowerCase(), n);
  const lastStudy = new Map(); // one Analysis-sheet entry per item, last wins — same safety net as track:
  for (const n of list) if (n.study) lastStudy.set(n.study.item, n);
  const lastSongNote = new Map(); // one song note per title (any case), last wins — the same net
  for (const n of list) if (n.songnote) lastSongNote.set(songNoteKey(n.songnote.title), n);
  const seenAudio = new Set(); // audio: pieces — many per track; only an exact twin drops
  let lastPickup = null; // one pickup per song, last wins (#1192) — the frame cannot be two things
  for (const n of list) if (n.pickup !== undefined) lastPickup = n;
  return list.map((n, i) => ({n, i})).filter(({n}) => {
    if (n.pickup !== undefined) return lastPickup === n;
    if (n.trackdir) return lastFor.get(n.trackdir.name.toLowerCase()) === n;
    if (n.study) return lastStudy.get(n.study.item) === n;
    if (n.songnote) return lastSongNote.get(songNoteKey(n.songnote.title)) === n;
    if (n.audiodir) { const k = n.b1 + ":" + n.q1 + ":" + n.text; if (seenAudio.has(k)) return false; seenAudio.add(k); }
    return true;
  });
}
// ✦ Annotate this song (src/ask/annotate.js) writes Normal-mode estimates
// INTO rollnotes, tagged n.ai. CLAUDE.md: nothing from Normal mode may leak
// into Learning mode's UI, AI context or repo files — so in Learning those
// entries are HIDDEN, never deleted. Every reader that PRESENTS or FORWARDS
// annotations goes through here (band/flag drawing, All notes, the
// subtitle/LCD/key lookups via finalizeNotes' lanes and keyRegions, the
// ✦ Ask context and tools, the generators, the lasso clipboard); storage,
// sync, undo and the anchor-moving edits read S.rollnotes whole, so flipping
// back to Normal shows them again. Reads appMode() live — nothing cached to
// refresh on a flip beyond what applyMode already re-derives (finalizeNotes
// + draw). annoShown is the per-note form for readers that must keep
// S.rollnotes indices (askAnnotationsText's ids).
export function annoShown(n) { return !n.ai || appMode() === "normal"; }
export function visibleNotes() { return appMode() === "normal" ? S.rollnotes : S.rollnotes.filter(n => !n.ai); }
// P4 (docs/annotations-v2.md): the writer. Always v2 now — format + version
// + an optional origin header, same per-note "notes" array v1 always wrote
// (byte-identical per-entry shape; only the header is new). `origin`, when
// given, is written verbatim as the header's "origin" field — callers pass
// the open song's rollnotesOrigin (serializeRollnotes/Stamped, below) or
// whatever publishSong resolved for a not-open song (annotationsFor's own
// disk-read origin, falling back to a locally-pending one — see originFor).
// Pure function: same list/stamp/origin in, byte-identical JSON out, every
// time (round-trip tests, docs/annotations-v2.md "byte stability") — no
// comparison against any previously-published file happens here or in any
// caller, same as v1's "saved" stamp always was.
export function serializeNotesList(list, beatsPerBar, base, stamp, origin) {
  // one note per line: valid JSON that git-diffs like the old text format.
  // stamp (epoch ms) marks WHEN this state was saved — the cross-device
  // freshness beacon (Josh, 2026-08-16); omitted for pure serialization.
  const rows = dedupedNotesWithIndex(list).map(({n}) => "  " + JSON.stringify(noteToJSON(n)));
  return '{ "format": ' + JSON.stringify(ROLLNOTES_FORMAT) + ', "version": ' + rollnotesVersionFor(list) + ', "song": ' + JSON.stringify(base) +
         (origin ? ', "origin": ' + JSON.stringify(origin) : "") +
         (stamp ? ', "stamp": ' + stamp : "") + ', "notes": [\n' +
         rows.join(",\n") + "\n] }\n";
}
export function serializeRollnotes() { return serializeNotesList(S.rollnotes, beatsPerBarDisp(), baseName(), undefined, S.rollnotesOrigin); }
export function serializeRollnotesStamped(stamp) { return serializeNotesList(S.rollnotes, beatsPerBarDisp(), baseName(), stamp, S.rollnotesOrigin); }
// the one spelling of a "track:" directive — parse, JSON import, rename and
// save all build it here, so a new field can't be dropped by one of them
export function trackDirText(d) {
  return "track: " + d.name + (d.voice && d.voice !== "auto" ? " voice=" + d.voice : "") + (d.color ? " color=" + d.color : "") +
    (d.vol !== undefined && isFinite(d.vol) ? " vol=" + d.vol : "") + (d.pan !== undefined && isFinite(d.pan) ? " pan=" + d.pan : "") +
    (d.mute ? " mute=1" : "") + (d.solo ? " solo=1" : "") + (d.hide ? " hide=1" : "") +
    (d.drums === true ? " drums=1" : d.drums === false ? " drums=0" : "");
}

export function isDirective(n) { // anything that isn't a plain text note
  return !!(n.section || n.chord || n.chopdir || n.keydir !== undefined || n.study || n.songnote || n.opaque || n.pickup !== undefined ||
            n.loopTo !== undefined || n.tempodir !== undefined || n.trackdir || n.audiodir || /^(timesig|key|tempo|track|lane|audio|analysis|pickup|songnote(?:\([^)\n]*\))?):/i.test(n.text));
}
// Song-level entries never draw: no ruler flag (render/roll.js), no flag
// tap (input/gestures.js — a 1.1 entry otherwise shadowed the key marker's
// tap there), and no subtitle (isDirective above). One predicate so the two
// loops can't drift apart. The pickup's mark is the bar-1 line itself (#1192).
export function isUndrawnAnno(n) { return !!(n.study || n.songnote || n.opaque || n.pickup !== undefined); }
// {t0, t1, y0, y1} when the last lasso reached INTO the ruler — only then are its bands "lasso'd"
export const isCopyableAnno = n => n.chord || n.section || !isDirective(n);

export function setEndBQ(n, tick) { setEndUnits(n, tick, barTicks(), beatTicks(), pickupTicks()); }
// A band's end from its EXCLUSIVE end tick, to the 16th. q2 is the INCLUSIVE
// end beat (resolveNote adds one). A CHORD band whose end is off a whole beat
// (Josh #1179: an Am7 meant for 4.3.5 to 4.4 drew to 4.4.5 — `to` always adds
// the whole beat) gets `until` = [bar, beat] of the exact end, and `to` = the
// beat that end falls in, the fallback an older build draws; an end on a beat
// clears `until`, so such a band is written byte-for-byte as before. Sections
// keep the inclusive rule alone (native does the same). T = where bar 1 starts
// (#1192 C5): an end inside the pickup bar is written as bar 0, never clamped.
// the earliest end a frame can write: one beat after the frame's first bar
// starts (bar 1 without a pickup, bar 0 with one) — a band is at least a beat
// long from there, and never a bar before bar 0
export function minEndTick(T, bt, qt) { return T > 0 ? T - bt + qt : qt; }
export function setEndUnits(n, tick, bt, qt, T = 0) {
  const e = Math.max(minEndTick(T, bt, qt), tick);
  const [ub, uqRaw] = frameBQ(e, T, bt, qt), uq = snapBeat(uqRaw);
  if (n.chord && Math.abs(uq - Math.round(uq)) > 1e-9) {
    n.until = [ub, uq];
    n.b2 = ub; n.q2 = Math.max(1, Math.floor(uq));
    return;
  }
  delete n.until;
  const [b2, q2] = frameBQ(e - qt, T, bt, qt);
  n.b2 = b2;
  n.q2 = snapBeat(q2);
}
// Editing an annotation used to leave the old one sitting beside the new one:
// airship ended up with two keys at 1.1, two chord bands on 15.1–15.4, and the
// same tritone note at two anchors — invisible in the roll, because duplicate
// bands draw on top of each other (Josh, 2026-08-26: "something feels wrong
// with the annotation sometimes"). Call this before pushing a new annotation.
// Josh's rules, per type:
//   chord — one band per exact span. A new band REPLACES whatever was on that
//           span, whatever its label; that is what re-labelling a bar means.
//   note  — several notes at one anchor are legitimate and stay. Only a
//           byte-identical text at the same anchor is a duplicate.
//   key   — handled by dropLocalKeyAt (anchor-level).
// Sections are deliberately left alone: nesting is by containment and he has
// not asked for a rule there.
//   analysis — one entry per item (the sheet's prompt id), whatever its
//           anchor. The old one is RETIRED (tombstoned if synced), not just
//           filtered: filtering alone resurrected it on reload (review 2026-
//           10-05 finding 1). putStudyEntry is the write path; this is the
//           net under any other caller.
export function dropSupersededBy(fresh) {
  const sameAnchor = n => n.b1 === fresh.b1 && (n.q1 || 1) === (fresh.q1 || 1);
  // chords: the identical span AND the same layer — a chord he stacked over
  // another (layer ≥ 1) stands beside it, never in its place (#1159–#1162);
  // a pedal and a chord never replace each other either (#1177) — only a
  // pedal replaces a pedal on the exact span
  const sameSpan = n => sameChordSpan(n, fresh) && chordLayer(n) === chordLayer(fresh) && isPedal(n) === isPedal(fresh);
  if (fresh.study) { for (const n of S.rollnotes.filter(x => x.study && x.study.item === fresh.study.item)) retireEdited(n); return; }
  if (fresh.songnote) { for (const n of S.rollnotes.filter(x => x.songnote && songNoteKey(x.songnote.title) === songNoteKey(fresh.songnote.title))) retireEdited(n); return; } // one per title; putSongNote refuses a clash before it gets here
  if (fresh.chord) S.rollnotes = S.rollnotes.filter(n => !(n.chord && sameSpan(n)));
  else if (!isDirective(fresh)) {
    const t = (fresh.text || "").trim();
    S.rollnotes = S.rollnotes.filter(n => !(!isDirective(n) && sameAnchor(n) && (n.text || "").trim() === t));
  }
}

// HIS declared meter for a song that may not be the one open right now
// (Publish all's other-song draft, the ✦ AI read_song tool) — NEVER the
// file's own label (docs/declared-vs-learner-spec.md C8: that leaked into
// notes.txt's header even in Learning). Preference: the "ff1roll-ts-<key>"
// stash setSong() writes at load (see there), else a stored "timesig:"
// annotation for that key; neither exists = undeclared, same as a fresh song.
export function declaredTsForKey(key) {
  if (!key) return null;
  const stash = localStorage.getItem("ff1roll-ts-" + key);
  if (stash) { const m = /^(\d+)\/(\d+)$/.exec(stash); if (m) return [+m[1], +m[2]]; }
  let local = null;
  try { local = JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "null"); } catch (err) { local = null; }
  if (Array.isArray(local)) {
    const tsNote = local.find(n => /^timesig:\s*\d+\s*\/\s*\d+/.test(n.text || ""));
    if (tsNote) { const m = /^timesig:\s*(\d+)\s*\/\s*(\d+)/.exec(tsNote.text); if (m) return [+m[1], +m[2]]; }
  }
  return null;
}
export function notesTxtFor(doc, key) { // defaults to the open song; Publish all passes another song's draft // the web-session dump: claude.ai reads text, not .mid binaries
  doc = doc || S.song; key = key || S.songKey;
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pn = p => NAMES[p % 12] + (Math.floor(p / 12) - 1);
  // the meter HE declared, never doc.timesig (the file's own raw label) —
  // the live variable for the song that's actually open, else the best
  // record this device has for a different one (see declaredTsForKey)
  const declared = (S.song && key === S.songKey) ? S.declaredTs : declaredTsForKey(key);
  const ts = declared || [4, 4];
  const tsLabel = declared ? declared[0] + "/" + declared[1] : "4/4? (not declared)";
  const bt = ts[0] * 4 / ts[1] * doc.ppq;
  let end = 0;
  doc.tracks.forEach(t => t.notes.forEach(n => { if (!n.gone) end = Math.max(end, n.t + n.d); }));
  const nBars = Math.ceil(end / bt - 0.05);
  const fmt = x => x.toFixed(2).replace(/\.?0+$/, "");
  const L = [];
  L.push("# " + (key || "song").split("/").pop() + " — " + tsLabel + ", " +
         Math.round(6e7 / doc.tempos[0].usq) + "bpm, " + nBars + " bars");
  L.push("# Format: bar N: beat pitch duration-in-quarter-notes");
  // gate-vs-notated: the 08-25 web session read 0.33 gates as triplets and
  // asserted it to Josh twice. Onset spacing is the evidence for rhythm.
  L.push("# duration is GATE TIME (how long the chip held the note), NOT a notated value.");
  L.push("# RHYTHM comes from ONSET SPACING (the beat column), never from duration:");
  L.push("# staccato eighths gate at ~0.33 and are still eighths, not triplets.");
  L.push("# Pitches use sharp spelling; the true key is Josh's to discover — this file states no key.");
  doc.tracks.forEach((tr, ti) => {
    L.push("");
    L.push("## track " + (ti + 1) + (tr.name ? " (" + tr.name + ")" : ""));
    for (let b = 0; b < nBars; b++) {
      const ns = tr.notes.filter(n => !n.gone && n.t >= b * bt && n.t < (b + 1) * bt);
      if (!ns.length) continue;
      L.push("bar " + (b + 1) + ": " + ns.map(n =>
        fmt((n.t - b * bt) / doc.ppq + 1) + " " + pn(n.p) + " " + fmt(n.d / doc.ppq)).join(", "));
    }
  });
  return L.join("\n") + "\n";
}

// (Josh's rule, 2026-08-25, after setting "F mixolydian" over airship's
// committed "key F" produced both). Two defects were in the old predicate:
//   n.added        — only this session's annotations carry it (it isn't
//                    serialized), so the dedupe was structurally unable to
//                    replace a key that had ever been synced. That is the
//                    exact case he hit.
//   n.keydir       — the tonic-only form stores keypartial and leaves keydir
//                    unset, so an "F?" marker survived a real key being set.
//                    Everywhere else in this file tests both forms.
// ANCHOR-level, not bar-level (Josh's ruling, 2026-08-26): a key at 3.1 and a
// key at 3.3 are two different keys and both stand — a modulation gets its
// true beat. Only an exact anchor collision is a replacement. The keyset
// button always sets q1:1, so it still replaces the bar's downbeat key.
export function dropLocalKeyAt(bar, q = 1) {
  const isHit = n => (n.keydir !== undefined || n.keypartial) && n.b1 === bar && (n.q1 || 1) === q;
  // a PUBLISHED key (no `added`) dropped without a tombstone came straight back
  // from the repo file on the next load/Publish — two keys at one anchor in a
  // real song. tombstone() skips never-synced notes (they die with saveLocalNotes).
  S.rollnotes.filter(isHit).forEach(tombstone);
  S.rollnotes = S.rollnotes.filter(n => !isHit(n));
}

// subtract tombstoned deletions (docs/provenance-plan.md P2: factored out of
// loadNotes so publishSong can build the same merge for a song that is not
// open — Bugs found: Publish all re-published a deleted synced note because
// it never subtracted tombstones for a not-open song)
export function subtractTombstones(notes, key) {
  try {
    const tombs = new Set(JSON.parse(localStorage.getItem(tombKeyFor(key)) || "[]"));
    if (tombs.size) {
      const out = notes.filter(n => !tombs.has(noteIdentity(n)));
      // .filter returns a plain new array — carry the custom properties
      // parseRollnotesJSON hangs off the array (version/origin/readOnly/
      // lockReason) along with it, so a not-open annotationsFor(key) (P4,
      // docs/annotations-v2.md) still sees the file's own origin header
      // after tombstones are subtracted, not just when nothing was dropped.
      out.version = notes.version; out.origin = notes.origin;
      out.readOnly = notes.readOnly; out.lockReason = notes.lockReason;
      return out;
    }
  } catch (err) {}
  return notes;
}
// this device's local (never-synced) additions, merged onto `notes` in place
// (and returned) — factored out of loadNotes' local-notes loop, same re-
// derivation (track:/audio:/tempo:/timesig: directives, key: flag) so an
// unsynced audio: note isn't silently missing its clip when built for a
// song that isn't open
export function mergeLocalAdditions(notes, key, filePickup) {
  let local = [];
  try { local = LINK_SONGS ? [] : JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "[]"); }
  catch (err) { /* corrupted local notes */ }
  // The pickup frame (#1192 review C2). The published file's anchors are in
  // ITS pickup's frame (filePickup — the caller read it before tombstones
  // dropped a deleted pickup entry; absent = this list's own). The frame the
  // merged list must be in is the LOCAL store's pickup when it carries one,
  // else what survives in the published list. When they differ, the published
  // layer is reframed through absolute time BEFORE the (b1, q1, text) dedup
  // below, so every twin matches and nothing stands beside its old-frame
  // self — in beat units (bt = beats per bar, qt = 1): no ppq needed, so a
  // not-open song (annotationsFor) merges the same way. The local pickup entry
  // REPLACES the published one, as the study/songnote branches do.
  const fileP = filePickup !== undefined && filePickup !== null ? filePickup : (declaredPickupOf(notes) || 0);
  let localP = null;
  for (const n of local) { const m = (n.text || "").match(PICKUP_RE); if (m && +m[1] > 0) localP = +m[1]; }
  const targetP = localP !== null ? localP : (declaredPickupOf(notes) || 0);
  if (targetP !== fileP) {
    const tsOf = list => { for (const n of list) { const m = /^timesig:\s*(\d+)\s*\/\s*(\d+)/i.exec(n.text || ""); if (m) return [+m[1], +m[2]]; } return null; };
    const ts = tsOf(local) || tsOf(notes) || [4, 4];
    reframeAnchors(notes, fileP, targetP, ts[0], 1);
  }
  if (localP !== null) for (let i = notes.length - 1; i >= 0; i--) if (notes[i].pickup !== undefined) notes.splice(i, 1);
  for (const n of local) {
    const st = studyFromText(n.text);
    if (st) {
      // an Analysis-sheet entry: its text is the SAME for every answer to one
      // item ("analysis: summary.what done=1"), so the generic text match
      // below would call a re-dictated answer a duplicate of the published
      // one and drop it (review 2026-10-05 finding 1). The body counts; and
      // the local copy is by construction the newer answer, so it replaces
      // a published entry for the same item instead of standing beside it.
      const same = r => r.study && r.study.item === st.item;
      if (notes.some(r => same(r) && r.text === n.text && (r.cnote || "") === (n.cnote || ""))) continue;
      for (let i = notes.length - 1; i >= 0; i--) if (same(notes[i])) notes.splice(i, 1);
      notes.push(deriveNoteTypes([{...n, added: true}])[0] || {...n, added: true});
      continue;
    }
    const sn = songNoteFromText(n.text);
    if (sn) { // a song note: same reasoning as the sheet entry above, keyed by title — the local copy is the newer one
      const same = r => r.songnote && songNoteKey(r.songnote.title) === songNoteKey(sn.title);
      if (notes.some(r => same(r) && r.text === songNoteDirText(sn.title, sn.kind) && (r.cnote || "") === (n.cnote || ""))) continue;
      for (let i = notes.length - 1; i >= 0; i--) if (same(notes[i])) notes.splice(i, 1);
      notes.push(deriveNoteTypes([{...n, added: true}])[0] || {...n, added: true});
      continue;
    }
    if (notes.some(r => r.b1 === n.b1 && r.q1 === n.q1 && r.text === n.text)) continue;
    const km = (n.text || "").match(/^key:\s*(\S+(?:\s+[a-z]+)?)/i); // re-derive flag (older saves lack it)
    if (km && n.keydir === undefined) {
      const sf = keyNameToSf(km[1].trim());
      if (sf !== null) n.keydir = sf;
    }
    const derived = deriveNoteTypes([{...n, added: true}])[0] || {...n, added: true};
    notes.push(derived);
  }
  return notes;
}
// repo file + this device's local additions, minus tombstones — the same
// merge loadNotes does for the open song, for any key (docs/provenance-
// plan.md P2: publishSong builds every pending song's annotations this way,
// open or not). No CDN-bridge/stamp-adoption here (those only matter for
// the song actually being opened right now); a caller that needs those uses
// loadNotes instead.
// deploy-lag bridge: a publish from THIS device younger than 10 min beats a
// disagreeing CDN copy (Pages ~10 min, raw.githubusercontent ~5 min). Every
// reader of the repo file goes through it — loadNotes AND annotationsFor:
// publish read past it and wrote the stale copy back (ex-battle-theme,
// 2026-10-13: five sections lost two minutes after they were published)
export function lastSyncPrefer(key, text) {
  if (LINK_SONGS) return text;
  try {
    const ls = JSON.parse(localStorage.getItem("ff1roll-lastsync-" + key) || "null");
    if (!ls) return text;
    if (text === ls.text || Date.now() - ls.t > 10 * 60e3) { localStorage.removeItem("ff1roll-lastsync-" + key); return text; } // CDN caught up (or bridge expired)
    return ls.text;
  } catch (err) { return text; } // corrupt bridge: ignore
}
export async function annotationsFor(key) {
  const base = key.replace(/\.midi?$/i, "");
  let notes = [];
  try {
    let res = await readData("analysis", base + ".rollnotes.json", true);
    if (!res.ok) res = await readData("analysis", base + ".rollnotes", true); // legacy
    const text = lastSyncPrefer(key, res.ok ? await res.text() : null);
    if (text !== null) notes = parseRollnotes(text);
  } catch (err) { /* no sidecar yet */ }
  // version guard (docs/annotations-v2.md P3): this is the ONE place every
  // publish/move reads a not-necessarily-open song's existing annotations
  // before writing — refusing here, before any merge or write, is what
  // "refuses to publish/overwrite" means for a file a newer Night Roll wrote
  if (notes.readOnly) throw new Error(notes.lockReason || ROLLNOTES_LOCK_MSG);
  const filePickup = declaredPickupOf(notes) || 0; // the FILE's frame, read before a tombstoned pickup entry is subtracted (#1192 C2)
  notes = subtractTombstones(notes, key);
  notes = mergeLocalAdditions(notes, key, filePickup);
  notes.sort((a, b) => (a.b1 - b.b1) || (a.q1 - b.q1));
  return notes; // NOT resolved: resolveNote reads the OPEN song's meter (barTicks/beatTicks), which may not be key's own — a caller that needs .start (bakeTempos) resolves against key's own ppq/timesig itself (resolveNoteWith)
}
// resolveNote, but against an explicit ppq/timesig instead of the globally
// open song's — for filling in a NOT-open song's own .start/.end (bakeTempos
// needs it to place tempo: directives; annotationsFor itself never resolves,
// since serialization doesn't need ticks at all).
export function resolveNoteWith(n, ppq, ts, pickupBeats = 0) { // pickupBeats: that song's own `pickup` (declaredPickupOf its list, #1192 C9) — bar 1 starts P beats in
  const bt = ts[0] * 4 / ts[1] * ppq, qt = ppq * 4 / ts[1], T = (pickupBeats || 0) * qt;
  n.start = T + (n.b1 - 1) * bt + (n.q1 - 1) * qt;
  n.end = n.until ? T + (n.until[0] - 1) * bt + (n.until[1] - 1) * qt : hasEnd(n) ? T + (n.b2 - 1) * bt + (n.q2 || ts[0]) * qt : null;
  return n;
}

// Pure: base tempo events (un-baked — the file's own, before any tempo:
// annotation) + resolved notes (only n.tempodir/n.start are read) + ppq ->
// a new tempo map with sec offsets filled in. Lifted out of finalizeNotes
// (docs/provenance-plan.md P2) so playback (finalizeNotes, below) and
// publish (publishSong) bake the SAME way from the SAME base every time —
// recomputed from scratch on every call, never accumulated, so removing a
// tempo: annotation removes its baked event instead of leaving it behind
// (the "ratchet" bug).
export function bakeTempos(base, notes, ppq) {
  const dirs = notes.filter(n => n.tempodir !== undefined).sort((a, b) => a.start - b.start);
  if (!dirs.length) return base.map(t => ({...t}));
  const evs = base.filter(t => t.tick < dirs[0].start).map(t => ({tick: t.tick, usq: t.usq}));
  if (!evs.length) evs.push({tick: 0, usq: Math.round(6e7 / dirs[0].tempodir)});
  for (const d of dirs) evs.push({tick: Math.max(0, Math.round(d.start)), usq: Math.round(6e7 / d.tempodir)});
  const byTick = new Map();
  for (const e of evs) byTick.set(e.tick, e); // same tick: the directive wins
  const sorted = [...byTick.values()].sort((a, b) => a.tick - b.tick);
  let sec = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) sec += (sorted[i].tick - sorted[i - 1].tick) / ppq * sorted[i - 1].usq / 1e6;
    sorted[i].sec = sec;
  }
  return sorted;
}
// Pure, same shape as bakeTempos (docs/provenance-plan.md Q9 — a declared
// meter bakes wherever tempo bakes): base timesig events (the file's own,
// un-declared) + resolved notes (only n.tsdir/n.start are read) -> a new
// [{tick, num, den}] list, baked fresh from the same base every publish,
// never accumulated. Today there's only ever ONE timesig: annotation (the
// editor keeps "one meter per song" — declaring a new one replaces it,
// re-barring), so in practice this returns either the base unchanged (no
// declaration: "written back verbatim", Q6) or one event at the
// declaration's own tick — written as a list, not a single pair, so a
// future multi-meter song and an import's own pre-declaration history
// (base) both round-trip correctly.
export function bakeMeter(base, notes) {
  const dirs = notes.filter(n => n.tsdir).sort((a, b) => a.start - b.start);
  if (!dirs.length) return base.map(t => ({...t}));
  const evs = base.filter(t => t.tick < dirs[0].start).map(t => ({tick: t.tick, num: t.num, den: t.den}));
  if (!evs.length) evs.push({tick: 0, num: dirs[0].tsdir[0], den: dirs[0].tsdir[1]});
  for (const d of dirs) evs.push({tick: Math.max(0, Math.round(d.start)), num: d.tsdir[0], den: d.tsdir[1]});
  const byTick = new Map();
  for (const e of evs) byTick.set(e.tick, e); // same tick: the directive wins
  return [...byTick.values()].sort((a, b) => a.tick - b.tick);
}

export function annoRestore(str) {
  const arr = JSON.parse(str);
  const bar0 = jsonListDeclaresPickup(arr.map(e => e.j));
  S.rollnotes = deriveNoteTypes(arr.map(e => jsonToRawNote(e.j, bar0))).map(resolveNote);
  S.rollnotes.forEach((n, i) => { n.added = arr[i].a; });
}
// Re-express every bar-anchored entry of `list` from the frame whose bar 1
// starts at oldT to the one starting at newT, through absolute time: the
// music under each annotation does not move by one tick, only its number
// changes (#1192 §3.2). PURE over the list it is given (review C2: the merge
// reframes a published list before it meets the local store), with bt/qt
// passed in so a not-open song can be reframed in beat units (bt = beats per
// bar, qt = 1). Skips the chop directives (RAW coordinates) and the song-level
// entries (the pickup itself among them); opaque entries MOVE — an unknown
// type is a thing at a place (web shiftAnchors already moved them; native's
// reframe drops its opaque skip for this function only). A chord's end goes
// through setEndUnits (#1179's one to/until rule); loop text is rewritten and
// may name bar 0 (C8: a loop back to the pickup is `loop: 0.4`). Round trip
// is exact: T is on the 16th grid and beats may be fractional.
export function reframeAnchors(list, oldT, newT, bt, qt) {
  if (oldT === newT) return list;
  return remapAnchors(list, oldT, newT, bt, qt, t => t);
}
// the one anchor rewrite: each entry's ticks in the OLD frame → f(tick) in
// absolute time → [bar, beat] in the NEW frame (reframeAnchors: f = identity;
// shiftAnchors: f = a clamped shift)
export function remapAnchors(list, oldT, newT, bt, qt, f) {
  const beats = bt / qt;
  const tickOf = (b, q) => oldT + (b - 1) * bt + (q - 1) * qt;
  const conv = (b, q) => frameBQ(f(tickOf(b, q)), newT, bt, qt);
  const fmtQ = q => +q.toFixed(4);
  for (const n of list) {
    if (isChopAnno(n) || isSongLevelAnno(n)) continue;
    const endTick = hasEnd(n) ? (n.until ? tickOf(n.until[0], n.until[1]) : tickOf(n.b2, (n.q2 || beats) + 1)) : null; // the EXCLUSIVE end
    const [b1, q1] = conv(n.b1, n.q1 || 1);
    n.b1 = b1; n.q1 = fmtQ(q1);
    if (hasEnd(n) && n.chord) setEndUnits(n, f(endTick), bt, qt, newT); // #1179: a chord's end slides exactly and is re-expressed as to/until by the one rule
    else if (hasEnd(n)) { const [b2, q2] = frameBQ(Math.max(minEndTick(newT, bt, qt), f(endTick)) - qt, newT, bt, qt); n.b2 = b2; n.q2 = fmtQ(q2); } // inclusive last beat, as `to` stores it
    const lm = (n.text || "").match(/^loop:\s*(\d+)(?:\.(\d+(?:\.\d+)?))?/);
    if (lm) {
      const [lb, lq] = conv(+lm[1], lm[2] ? +lm[2] : 1);
      n.text = "loop: " + lb + "." + (+lq.toFixed(2)); // always the explicit B.Q the editor writes, so set → remove gives the bytes back
    }
  }
  return list;
}
// Two-tap confirmation for meter changes that move annotations: re-express
// every annotation's anchors under a new meter so they stay glued to the
// MUSIC (bar.beat is a coordinate system; changing the meter re-bars).
// shiftAnchors: shift every non-chop annotation in DISPLAYED space (start-chop
// add/remove). The downbeat Josh marked is a place in the music like every
// other anchor (#1192 review C4): the pickup LENGTH is re-derived so bar 1
// stays on the same music — P' = (T + delta) / qt. A P' that falls to ≤ 0
// (the chop ate the pickup) or past one bar (the chop's removal put more than
// a bar before the downbeat) removes the pickup; the caller's warning names
// it (pickupAfterShift, below, is what the warning reads).
export function pickupAfterShift(deltaTicks) { // → the pickup length (beats) a shift leaves, or 0 = removed
  const qt = beatTicks(), P = (pickupTicks() + deltaTicks) / qt;
  return P > 1e-9 && P <= beatsPerBarDisp() + 1e-9 ? +P.toFixed(4) : 0;
}
export function shiftAnchors(deltaTicks) {
  const bt = barTicks(), unit = beatTicks(), oldT = pickupTicks();
  const P = S.declaredPickup ? pickupAfterShift(deltaTicks) : 0;
  remapAnchors(S.rollnotes, oldT, P * unit, bt, unit, t => Math.max(0, t + deltaTicks)); // an anchor shifted before the song's start lands on it, as before
  if (S.declaredPickup && P) for (const n of S.rollnotes) if (n.pickup !== undefined) { n.pickup = P; n.text = pickupDirText(P); }
  if (S.declaredPickup && !P) { for (const n of S.rollnotes) if (n.pickup !== undefined) tombstone(n); S.rollnotes = S.rollnotes.filter(n => n.pickup === undefined); }
  S.declaredPickup = P || null; // resolveNote reads it; finalizeNotes re-derives it from the list the same way
}
// The meter changes, the downbeat does not (#1192 §3.3): the pickup is
// rewritten so T in TICKS is preserved (P' = T / qt'). A P' longer than the
// new bar is the caller's refusal (meterFitsPickup) — nothing moves then.
export function meterFitsPickup(newTs) { // null = fine, else the plain reason the re-bar is refused
  if (!S.declaredPickup) return null;
  const newUnit = S.song.ppq * 4 / newTs[1], P = pickupTicks() / newUnit;
  return P <= newTs[0] + 1e-9 ? null : "the pickup is longer than a " + newTs[0] + "/" + newTs[1] + " bar — remove the pickup first";
}
export function convertAnchors(oldTs, newTs) {
  const oldUnit = S.song.ppq * 4 / oldTs[1], newUnit = S.song.ppq * 4 / newTs[1];
  const oldBt = oldTs[0] * oldUnit, newBt = newTs[0] * newUnit;
  const T = (S.declaredPickup || 0) * oldUnit; // bar 1's tick, kept
  const conv = (b, q) => frameBQ(T + (b - 1) * oldBt + (q - 1) * oldUnit, T, newBt, newUnit);
  for (const n of S.rollnotes) {
    if (isSongLevelAnno(n)) continue;
    const endTick = hasEnd(n) ? (n.until ? T + (n.until[0] - 1) * oldBt + (n.until[1] - 1) * oldUnit : T + (n.b2 - 1) * oldBt + (n.q2 || oldTs[0]) * oldUnit) : null;
    [n.b1, n.q1] = conv(n.b1, n.q1);
    if (hasEnd(n) && n.chord) setEndUnits(n, endTick, newBt, newUnit, T); // #1179: re-barred, still exact, same to/until rule
    else if (hasEnd(n)) [n.b2, n.q2] = conv(n.b2, n.q2 || oldTs[0]);
    const lm = n.text.match(/^loop:\s*(\d+)(?:\.(\d+(?:\.\d+)?))?/);
    if (lm) {
      const [lb, lq] = conv(+lm[1], lm[2] ? +lm[2] : 1);
      n.text = "loop: " + lb + "." + (+lq.toFixed(2)); // the explicit B.Q form (the editor's), stable across conversions
    }
  }
  if (S.declaredPickup) { // the length in the NEW counted beat; T itself did not move
    const P = +(T / newUnit).toFixed(4);
    for (const n of S.rollnotes) if (n.pickup !== undefined) { n.pickup = P; n.text = pickupDirText(P); }
    S.declaredPickup = P;
  }
}
// "The song start" for a directive (#1192 review C3): tick 0 — [0, beats − P + 1]
// with a pickup, [1, 1] without — so a meter/key/tempo declared "at the start"
// governs the pickup too and bakeMeter keeps writing its one event at tick 0.
export function songStartAnchor(ts) { // ts: the meter the anchor is written in (a re-bar passes the NEW one — effTs() still holds the old until finalizeNotes)
  const unit = ts ? S.song.ppq * 4 / ts[1] : beatTicks(), bt = ts ? ts[0] * unit : barTicks();
  const [b, q] = frameBQ(0, (S.declaredPickup || 0) * unit, bt, unit);
  return {b1: b, q1: +q.toFixed(4)};
}
// The pickup's one write path (the note editor, the Go to bar sheet, Ask):
// P = the new length in counted beats (0 = remove). Re-expresses every other
// anchor through absolute time (reframeAnchors), replaces the entry (a synced
// one is retired with a tombstone), returns the fresh entry (null on remove).
// No two-tap here — the callers own the warning (pickupOthersCount is its N)
// and the undo step (annoSnapshot before, one `anno` entry). Throws in plain
// words on a bad length; nothing changed then.
export function pickupOthersCount() { return S.rollnotes.filter(n => !isChopAnno(n) && !isSongLevelAnno(n)).length; }
export function pickupCheck(P) { // → the snapped length, or throws
  const beats = beatsPerBarDisp();
  if (!Number.isFinite(P) || P < 0) throw new Error("a pickup is a length in beats — 1, 1.5, 0.5…");
  const snapped = Math.round(P * 4) / 4; // the editor's 16th grid
  if (snapped > beats + 1e-9) throw new Error("a pickup is less than a bar — for a longer intro, label it a section");
  return snapped;
}
export function applyPickup(P, cnote) {
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); // version guard, docs/annotations-v2.md P3
  const Pn = pickupCheck(+P);
  const bt = barTicks(), qt = beatTicks(), oldT = pickupTicks(), newT = Pn * qt;
  reframeAnchors(S.rollnotes, oldT, newT, bt, qt);
  for (const n of S.rollnotes.filter(n => n.pickup !== undefined)) retireEdited(n); // one per song; a synced one needs the tombstone to stay gone
  S.declaredPickup = Pn || null;
  if (!Pn) { S.rollnotes.forEach(resolveNote); return null; }
  const fresh = {b1: 1, q1: 1, b2: null, q2: null, text: pickupDirText(Pn), pickup: Pn, added: true};
  if (cnote) fresh.cnote = cnote;
  S.rollnotes.push(fresh);
  S.rollnotes.forEach(resolveNote);
  return fresh;
}

export function stampChordBand(tick, durTicks, sym) { // the matching ruler annotation
  // end via setEndBQ (inclusive last beat): deriving it from the last tick
  // rounded every band up a beat, so bar-long chords overlapped (Josh, 2026-09-12)
  const fresh = {text: sym, chord: true, added: true};
  setAnchorBQ(fresh, tick);
  setEndBQ(fresh, tick + durTicks);
  dropSupersededBy(fresh); // one band per span, same as the dialog path
  S.rollnotes.push(resolveNote(fresh));
}
