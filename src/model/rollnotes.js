import { beatsPerBarEff } from "./grid.js";
import { S } from "../state.js";
import { keyNameToSf } from "../theory/key.js";
import { beatTicks } from "./grid.js";
import { beatsPerBarDisp } from "./grid.js";
import { snapBeat } from "./grid.js";
import { tombKeyFor } from "./edits.js";
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
  });
  return true;
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
  "item", "done", "ai", "title", "kind"]);
export const ROLLNOTES_TYPES = new Set(["section", "chord", "key", "timesig", "tempo", "track", "loop", "audio", "chop", "lane", "analysis", "songnote"]);
export function jsonToRawNote(j) { // schema entry -> the raw shape the deriver expects
  const at = Array.isArray(j.at) ? j.at : [1];
  const n = {b1: +at[0] || 1, q1: at[1] !== undefined ? +at[1] : 1,
             b2: j.to ? +j.to[0] : null,
             q2: j.to && j.to[1] !== undefined ? +j.to[1] : null, text: ""};
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
    case "chord": n.text = "chord: " + (j.chord || "") + att; break;
    case "key": n.text = "key: " + (j.key || "") + att; break;
    case "timesig": n.text = "timesig: " + (j.timesig || "") + att; break;
    case "tempo": n.text = "tempo: " + j.bpm + att; break;
    case "track": n.text = trackDirText({name: j.track || "", voice: j.voice, color: j.color, vol: j.vol, pan: j.pan, mute: j.mute, solo: j.solo, hide: j.hide}) + att; break;
    case "loop": n.text = "loop: " + (j.loop || "") + att; break;
    case "audio": n.text = audioDirText({track: j.track || "", file: j.file || "", offset: j.offset || 0, len: j.len || null, local: !!j.local}) + att; break;
    case "chop": n.text = "chop: " + (j.chop || ""); break;
    case "lane": n.text = "lane: " + j.lane; break;
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
export const ROLLNOTES_MAX_VERSION = 2;
// highest version this app can read/write; higher = refuse to publish/overwrite (the version guard)
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
  const out = Array.isArray(doc.notes) ? deriveNoteTypes(doc.notes.map(jsonToRawNote)) : [];
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
    const typed = /^(section|chord|key|timesig|tempo|track|loop|audio|analysis|songnote(?:\([^)\n]*\))?):/i.test(n.text);
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
export function isSongLevelAnno(n) { return !!(n.study || n.songnote); } // bar edits, chop shifts and re-barring leave these at 1.1
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
  return j;
}
export function noteToJSONBase(n) {
  const j = {at: n.q1 !== 1 ? [n.b1, n.q1] : [n.b1, 1]};
  if (n.b2) j.to = (n.q2 !== null && n.q2 !== undefined) ? [n.b2, n.q2] : [n.b2];
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
  if (n.chord) { j.type = "chord"; j.chord = t; return withNote(j); }
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
  j.text = t;
  return j;
}
export function resolveNote(n) {
  const bt = barTicks();
  n.start = (n.b1 - 1) * bt + (n.q1 - 1) * beatTicks();
  n.end = n.b2 ? (n.b2 - 1) * bt + (n.q2 || beatsPerBarDisp()) * beatTicks() : null;
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
  return list.map((n, i) => ({n, i})).filter(({n}) => {
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
  return '{ "format": ' + JSON.stringify(ROLLNOTES_FORMAT) + ', "version": 2, "song": ' + JSON.stringify(base) +
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
    (d.mute ? " mute=1" : "") + (d.solo ? " solo=1" : "") + (d.hide ? " hide=1" : "");
}

export function isDirective(n) { // anything that isn't a plain text note
  return !!(n.section || n.chord || n.chopdir || n.keydir !== undefined || n.study || n.songnote || n.opaque ||
            n.loopTo !== undefined || n.tempodir !== undefined || n.trackdir || n.audiodir || /^(timesig|key|tempo|track|lane|audio|analysis|songnote(?:\([^)\n]*\))?):/i.test(n.text));
}
// Song-level entries never draw: no ruler flag (render/roll.js), no flag
// tap (input/gestures.js — a 1.1 entry otherwise shadowed the key marker's
// tap there), and no subtitle (isDirective above). One predicate so the two
// loops can't drift apart.
export function isUndrawnAnno(n) { return !!(n.study || n.songnote || n.opaque); }
// {t0, t1, y0, y1} when the last lasso reached INTO the ruler — only then are its bands "lasso'd"
export const isCopyableAnno = n => n.chord || n.section || !isDirective(n);

export function setEndBQ(n, tick) { // q2 is the INCLUSIVE end beat (resolveNote adds one)
  const bt = barTicks(), qt = beatTicks(), t = Math.max(qt, tick) - qt;
  n.b2 = Math.floor(t / bt) + 1;
  n.q2 = snapBeat((t % bt) / qt + 1);
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
  const sameSpan = n => sameAnchor(n) && (n.b2 || null) === (fresh.b2 || null) &&
                                         (n.q2 || null) === (fresh.q2 || null);
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
  S.rollnotes = S.rollnotes.filter(n =>
    !((n.keydir !== undefined || n.keypartial) && n.b1 === bar && (n.q1 || 1) === q));
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
export function mergeLocalAdditions(notes, key) {
  let local = [];
  try { local = LINK_SONGS ? [] : JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "[]"); }
  catch (err) { /* corrupted local notes */ }
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
export async function annotationsFor(key) {
  const base = key.replace(/\.midi?$/i, "");
  let notes = [];
  try {
    let res = await readData("analysis", base + ".rollnotes.json", true);
    if (!res.ok) res = await readData("analysis", base + ".rollnotes", true); // legacy
    if (res.ok) notes = parseRollnotes(await res.text());
  } catch (err) { /* no sidecar yet */ }
  // version guard (docs/annotations-v2.md P3): this is the ONE place every
  // publish/move reads a not-necessarily-open song's existing annotations
  // before writing — refusing here, before any merge or write, is what
  // "refuses to publish/overwrite" means for a file a newer Night Roll wrote
  if (notes.readOnly) throw new Error(notes.lockReason || ROLLNOTES_LOCK_MSG);
  notes = subtractTombstones(notes, key);
  notes = mergeLocalAdditions(notes, key);
  notes.sort((a, b) => (a.b1 - b.b1) || (a.q1 - b.q1));
  return notes; // NOT resolved: resolveNote reads the OPEN song's meter (barTicks/beatTicks), which may not be key's own — a caller that needs .start (bakeTempos) resolves against key's own ppq/timesig itself (resolveNoteWith)
}
// resolveNote, but against an explicit ppq/timesig instead of the globally
// open song's — for filling in a NOT-open song's own .start/.end (bakeTempos
// needs it to place tempo: directives; annotationsFor itself never resolves,
// since serialization doesn't need ticks at all).
export function resolveNoteWith(n, ppq, ts) {
  const bt = ts[0] * 4 / ts[1] * ppq, qt = ppq * 4 / ts[1];
  n.start = (n.b1 - 1) * bt + (n.q1 - 1) * qt;
  n.end = n.b2 ? (n.b2 - 1) * bt + (n.q2 || ts[0]) * qt : null;
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
  S.rollnotes = deriveNoteTypes(arr.map(e => jsonToRawNote(e.j))).map(resolveNote);
  S.rollnotes.forEach((n, i) => { n.added = arr[i].a; });
}
// two-tap confirmation for meter changes that move annotations
// re-express every annotation's anchors under a new meter so they stay glued
// to the MUSIC (bar.beat is a coordinate system; changing the meter re-bars)
// shift every non-chop annotation in DISPLAYED space (start-chop add/remove)
export function shiftAnchors(deltaTicks) {
  const bt = barTicks(), unit = beatTicks();
  for (const n of S.rollnotes) {
    if (n.chopdir || isSongLevelAnno(n)) continue; // song-level entries (sheet answers, song notes) have no place in the music to follow
    const conv = (b, q) => {
      const tick = Math.max(0, (b - 1) * bt + (q - 1) * unit + deltaTicks);
      return [Math.floor(tick / bt) + 1, (tick % bt) / unit + 1];
    };
    [n.b1, n.q1] = conv(n.b1, n.q1);
    if (n.b2) [n.b2, n.q2] = conv(n.b2, n.q2 || beatsPerBarDisp());
    const lm = n.text.match(/^loop:\s*(\d+)(?:\.(\d+(?:\.\d+)?))?/);
    if (lm) {
      const [lb, lq] = conv(+lm[1], lm[2] ? +lm[2] : 1);
      n.text = "loop: " + lb + (lq === 1 ? "" : "." + (+lq.toFixed(2)));
    }
  }
}
export function convertAnchors(oldTs, newTs) {
  const oldUnit = S.song.ppq * 4 / oldTs[1], newUnit = S.song.ppq * 4 / newTs[1];
  const oldBt = oldTs[0] * oldUnit, newBt = newTs[0] * newUnit;
  const conv = (b, q) => {
    const tick = (b - 1) * oldBt + (q - 1) * oldUnit;
    return [Math.floor(tick / newBt) + 1, (tick % newBt) / newUnit + 1];
  };
  for (const n of S.rollnotes) {
    if (isSongLevelAnno(n)) continue;
    [n.b1, n.q1] = conv(n.b1, n.q1);
    if (n.b2) [n.b2, n.q2] = conv(n.b2, n.q2 || oldTs[0]);
    const lm = n.text.match(/^loop:\s*(\d+)(?:\.(\d+(?:\.\d+)?))?/);
    if (lm) {
      const [lb, lq] = conv(+lm[1], lm[2] ? +lm[2] : 1);
      n.text = "loop: " + lb + (lq === 1 ? "" : "." + (+lq.toFixed(2)));
    }
  }
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
