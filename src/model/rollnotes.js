import { beatsPerBarEff } from "./grid.js";
import { S } from "../state.js";
import { keyNameToSf } from "../theory/key.js";
import { beatTicks } from "./grid.js";
import { beatsPerBarDisp } from "./grid.js";
import { snapBeat } from "./grid.js";

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
export function jsonToRawNote(j) { // schema entry -> the raw shape the deriver expects
  const at = Array.isArray(j.at) ? j.at : [1];
  const n = {b1: +at[0] || 1, q1: at[1] !== undefined ? +at[1] : 1,
             b2: j.to ? +j.to[0] : null,
             q2: j.to && j.to[1] !== undefined ? +j.to[1] : null, text: ""};
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
    default: n.text = j.text || "";
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
    const typed = /^(section|chord|key|timesig|tempo|track|loop|audio):/i.test(n.text);
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
  });
  return out.filter(n => n.text);
}
// one PIECE of a recording: anchor = where it starts in the song; offset = where
// in the file it starts; len = how much of the file it plays (absent = the rest)
export function audioDirText(d) {
  return "audio: " + d.track + " file=" + d.file + (d.offset ? " offset=" + (+(+d.offset).toFixed(3)) : "") +
    (d.len ? " len=" + (+(+d.len).toFixed(3)) : "") + (d.local ? " local=1" : "");
}
export function noteToJSON(n) { // enriched-or-stashed note -> schema entry (text prefixes are truth)
  const j = {at: n.q1 !== 1 ? [n.b1, n.q1] : [n.b1, 1]};
  if (n.b2) j.to = (n.q2 !== null && n.q2 !== undefined) ? [n.b2, n.q2] : [n.b2];
  const t = n.text || "";
  let m;
  const withNote = j2 => { if (n.cnote) j2.note = n.cnote; return j2; };
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
  const seenAudio = new Set(); // audio: pieces — many per track; only an exact twin drops
  return list.map((n, i) => ({n, i})).filter(({n}) => {
    if (n.trackdir) return lastFor.get(n.trackdir.name.toLowerCase()) === n;
    if (n.audiodir) { const k = n.b1 + ":" + n.q1 + ":" + n.text; if (seenAudio.has(k)) return false; seenAudio.add(k); }
    return true;
  });
}
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
  return !!(n.section || n.chord || n.chopdir || n.keydir !== undefined ||
            n.loopTo !== undefined || n.tempodir !== undefined || n.trackdir || n.audiodir || /^(timesig|key|tempo|track|lane|audio):/i.test(n.text));
}
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
export function dropSupersededBy(fresh) {
  const sameAnchor = n => n.b1 === fresh.b1 && (n.q1 || 1) === (fresh.q1 || 1);
  const sameSpan = n => sameAnchor(n) && (n.b2 || null) === (fresh.b2 || null) &&
                                         (n.q2 || null) === (fresh.q2 || null);
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
