import { S } from "../state.js";
import { noteToJSON } from "./rollnotes.js";
import { rawTwin } from "./rollnotes.js";
import { draftTracks } from "./versions.js";
import { isComposition } from "./provenance.js";
import { isLocalDraft } from "./edits.js";
import { idbUndoGet } from "../platform/storage.js";
import { idbUndoPut } from "../platform/storage.js";
import { idbUndoDelete } from "../platform/storage.js";
import { logDebug } from "../hooks.js";

// The undo history survives a relaunch, per song (Josh #1078: "the app
// reinstalls … then I can no longer undo"). Device-local editing history,
// next to the song's draft (IndexedDB "drafts" store, key "undo:<song key>");
// never annotations, never a repo file, never Publish. Saved debounced after
// every edit, newest UNDO_MAX_STEPS steps of each stack within UNDO_MAX_BYTES.
//
// An entry names notes by index and holds object references (a deleted
// track, a reorder's track list), and the draft drops erased ("gone") notes,
// so a reload cannot just replay it. The record therefore carries:
//   hash   — of the draft's music + annotation layer when it was written; a
//            reopen restores ONLY on an exact match (never undo steps onto a
//            state they were not made against), else drops it silently;
//   gone   — per live track, the erased ("gone") notes with their indexes
//            (len = the track's note count), so the reload can put them back
//            where the entries expect them;
//   pool   — tracks/raw arrays the entries refer to that are not live (a
//            deleted track); entries point at pool ids, not objects.
export const UNDO_MAX_STEPS = 200;
export const UNDO_MAX_BYTES = 5e6;
export const UNDO_SAVE_MS = 700;

function undoBad(why) { const e = new Error(why); e.undoBad = true; return e; }
export function undoHash(s) { // cyrb53: two 32-bit lanes, plenty for "did this change" over a few MB
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36) + ":" + s.length;
}
// The state the history was made against: exactly what the draft stores (the
// notes, tempos, meter) plus the whole annotation layer, order-independent.
export function undoStateHash() {
  const annos = S.rollnotes.map(n => JSON.stringify({j: noteToJSON(n), a: !!n.added})).sort();
  return undoHash(JSON.stringify([S.song.ppq, S.song.timesig || null, S.song.baseTempos || S.song.tempos, draftTracks(S.song.tracks), annos]));
}
export function undoPersistable() { // chopped and compare views index a different note list: refuse as the editor does
  return !!(S.song && S.songKey && (isComposition() || isLocalDraft()) && !(S.cmp && S.cmp.showing === "repo") && !S.chopE && !S.chopS);
}

// ---- encode: entries -> plain data
function pooler() {
  const live = S.song.tracks, liveRaw = S.song.rawNotes || [];
  const tMap = new Map(live.map((t, i) => [t, i])), rMap = new Map(liveRaw.map((r, i) => [r, i]));
  const tPool = [], rPool = [];
  const tid = t => {
    if (tMap.has(t)) return tMap.get(t);
    if (!t || t.kind === "audio" || t.clips) throw undoBad("audio track");
    const id = live.length + tPool.length; tMap.set(t, id); tPool.push(JSON.stringify(t)); return id; // JSON.stringify throws on a cycle: that step is dropped
  };
  const rid = r => {
    if (r === null || r === undefined) return null;
    if (rMap.has(r)) return rMap.get(r);
    const id = liveRaw.length + rPool.length; rMap.set(r, id); rPool.push(JSON.stringify(r)); return id;
  };
  return {tid, rid, tPool, rPool};
}
function encodeEntry(u, p) {
  if (u.kind === "group") return {kind: "group", entries: u.entries.map(e => encodeEntry(e, p))};
  if (u.kind === "trackInsert") return {...u, track: {$t: p.tid(u.track)}, raw: {$r: p.rid(u.raw)}};
  if (u.kind === "trackReorder") return {...u, tracks: u.tracks.map(t => ({$t: p.tid(t)})), rawNotes: u.rawNotes ? u.rawNotes.map(r => ({$r: p.rid(r)})) : null};
  return u; // note / anno / mod entries are data already
}
// A stack's entries, oldest first, as JSON strings; an entry that cannot be
// encoded cuts the stack there (everything older is reachable only through it).
function encodeStack(stack, p) {
  const out = [];
  stack.forEach(u => {
    try { out.push(JSON.stringify(encodeEntry(u, p))); }
    catch (err) { out.length = 0; }
  });
  return out;
}
export function undoEncode() { // the record to store, or null when there is nothing to keep
  let undo = S.editUndo.slice(-UNDO_MAX_STEPS), redo = S.editRedo.slice(-UNDO_MAX_STEPS);
  for (let round = 0; round < 40; round++) {
    if (!undo.length && !redo.length) return null;
    const p = pooler(), u = encodeStack(undo, p), r = encodeStack(redo, p); // fresh pool each round: dropped steps take their tracks with them
    const gone = S.song.tracks.map(tr => JSON.stringify(tr.notes.map((n, i) => n.gone ? [i, n] : null).filter(Boolean))), len = JSON.stringify(S.song.tracks.map(tr => tr.notes.length));
    const size = gone.reduce((n, s) => n + s.length, 0) + u.reduce((n, s) => n + s.length, 0) + r.reduce((n, s) => n + s.length, 0) + p.tPool.reduce((n, s) => n + s.length, 0) + p.rPool.reduce((n, s) => n + s.length, 0);
    if (size <= UNDO_MAX_BYTES) {
      if (!u.length && !r.length) return null;
      return "{\"v\":1,\"hash\":" + JSON.stringify(undoStateHash()) + ",\"at\":" + Date.now() + ",\"len\":" + len + ",\"gone\":[" + gone.join(",") + "],\"tPool\":[" + p.tPool.join(",") + "],\"rPool\":[" + p.rPool.join(",") + "],\"undo\":[" + u.join(",") + "],\"redo\":[" + r.join(",") + "]}";
    }
    // over the cap: drop the oldest steps first (a tenth of the longer stack per round)
    const cut = Math.max(1, Math.ceil(Math.max(undo.length, redo.length) / 10));
    if (undo.length >= redo.length) undo = undo.slice(cut); else redo = redo.slice(cut);
    if (u.length < undo.length) undo = undo.slice(undo.length - u.length); // an unencodable step already cut the stack
    if (r.length < redo.length) redo = redo.slice(redo.length - r.length);
  }
  return null;
}

// ---- save (debounced) / flush / clear
export function scheduleUndoSave() {
  if (!S.song || !S.songKey) return;
  clearTimeout(S.undoSaveT);
  S.undoSaveT = setTimeout(undoFlush, UNDO_SAVE_MS);
}
export function undoFlush() { // writes now (a pending timer is cancelled); safe to call any time
  clearTimeout(S.undoSaveT); S.undoSaveT = null;
  if (!undoPersistable() || S.undoRestoring === S.songKey) return null; // not yet restored: writing the empty stack would erase the saved one
  const key = S.songKey;
  let rec = null;
  try { rec = undoEncode(); } catch (err) { logDebug("undo history not saved: " + (err && err.message || err)); return null; }
  return rec === null ? idbUndoDelete(key) : idbUndoPut(key, rec);
}
export function undoClear(key) { // Revert / Go back / opening the published copy: that song's history is void
  if (key === S.songKey) { clearTimeout(S.undoSaveT); S.undoSaveT = null; }
  return idbUndoDelete(key);
}

// ---- restore (resolves true when it brought a history back: the caller refreshes the Undo/Redo buttons)
export async function undoRestore(key) { // after a draft opened: bring its saved history back if it still fits the song
  S.undoRestoring = key;
  const song = S.song;
  try {
    const raw = await idbUndoGet(key);
    await song.notesReady; // the annotation layer (and any chop) is part of the state the hash covers: wait for it
    if (!raw || S.song !== song || S.songKey !== key || !undoPersistable() || S.editUndo.length || S.editRedo.length) return false;
    let rec; try { rec = JSON.parse(raw); } catch (err) { rec = null; }
    if (!rec || rec.v !== 1 || rec.hash !== undoStateHash()) { idbUndoDelete(key); return false; } // the song is not what the steps were made against: gone, silently
    const tracks = S.song.tracks;
    if (rec.len.length !== tracks.length || rec.gone.length !== tracks.length) { idbUndoDelete(key); return false; }
    for (let i = 0; i < tracks.length; i++) if (rec.len[i] - rec.gone[i].length !== tracks[i].notes.length) { idbUndoDelete(key); return false; } // every track lines up BEFORE any is touched
    // put the erased notes back at their old indexes (the entries index by position);
    // rawNotes keeps the same order — a chop re-carve rebuilds the notes from it
    tracks.forEach((tr, i) => {
      const raw = S.song.rawNotes && S.song.rawNotes[i], oldRaw = raw ? raw.slice() : null, at = new Map(rec.gone[i]), live = tr.notes;
      let k = 0;
      tr.notes = Array.from({length: rec.len[i]}, (_, j) => {
        if (at.has(j)) return {...at.get(j)};
        return live[k++];
      });
      if (raw) {
        raw.length = 0;
        tr.notes.forEach((n, j) => {
          const twin = at.has(j) ? {...rawTwin(n, n.t + S.chopS, n.d, tr), gone: true} : (oldRaw[n.ri] || rawTwin(n, n.t + S.chopS, n.d, tr));
          n.ri = raw.push(twin) - 1;
        });
      }
    });
    const T = id => id < tracks.length ? tracks[id] : rec.tPool[id - tracks.length];
    const rawLive = S.song.rawNotes || [];
    const R = id => id === null ? null : id < rawLive.length ? rawLive[id] : rec.rPool[id - rawLive.length];
    const dec = u => {
      if (u.kind === "group") return {kind: "group", entries: u.entries.map(dec)};
      if (u.kind === "trackInsert") return {...u, track: T(u.track.$t), raw: R(u.raw.$r)};
      if (u.kind === "trackReorder") return {...u, tracks: u.tracks.map(t => T(t.$t)), rawNotes: u.rawNotes ? u.rawNotes.map(r => R(r.$r)) : null};
      return u;
    };
    S.editUndo = rec.undo.map(dec); S.editRedo = rec.redo.map(dec);
    logDebug("undo history restored for " + key + ": " + S.editUndo.length + " undo / " + S.editRedo.length + " redo");
    return true;
  } catch (err) { logDebug("undo history not restored: " + (err && err.message || err)); return false; }
  finally { if (S.undoRestoring === key) { S.undoRestoring = null; scheduleUndoSave(); } } // an edit made while the history was loading is saved now
}
