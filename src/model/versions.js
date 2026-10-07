import { S } from "../state.js";
import { isComposition } from "./provenance.js";
import { draftStoreKey } from "../platform/storage.js";
import { effTs } from "./grid.js";
import { draftInIdb } from "../platform/storage.js";
import { idbDraftPut } from "../platform/storage.js";
import { logErr } from "../hooks.js";
import { isLocalDraft } from "./edits.js";
import { editableSong } from "./song.js";
import { scheduleBackupFlush } from "../hooks.js";
import { baseName } from "./rollnotes.js";
import { setInfo } from "../hooks.js";
import { updateSongBtn } from "../hooks.js";
import { updateSyncBtn } from "../hooks.js";
import { prof } from "../state.js";
import { overlayNoteSig } from "./edits.js";
import { logDebug } from "../hooks.js";
import { updateClearBtn } from "./edits.js";
import { idbDraftGet } from "../platform/storage.js";
import { nativeFs } from "../platform/folder.js";
import { nativeDirHandle } from "../platform/folder.js";
import { folderWrite } from "../platform/folder.js";
import { writeMidi } from "../midi/write.js";
import { serializeRollnotesStamped } from "./rollnotes.js";
import { notesTxtFor } from "./rollnotes.js";
import { readData } from "../platform/folder.js";
import { parseMidi } from "../midi/parse.js";
import { bakesMeter } from "./provenance.js";
import { bakesTempo } from "./provenance.js";
import { annotationsFor } from "./rollnotes.js";
import { resolveNoteWith } from "./rollnotes.js";
import { bakeTempos } from "./rollnotes.js";
import { bakeMeter } from "./rollnotes.js";
import { ctlCopy } from "../midi/parse.js";

export function songDirtyFlag() { // the draft records dirty; a clean Save clears it
  if (!S.song || !isComposition()) return false;
  try {
    const d = JSON.parse(localStorage.getItem(draftStoreKey(S.songKey)) || "null");
    return !!(d && d.dirty);
  } catch (e) { return false; }
}
export function draftTracks(tracks) { // the notes as a draft stores them (and as the published fingerprint reads them)
  return tracks.map(tr => {
    const o = {name: tr.name,
      notes: tr.notes.filter(n => !n.gone).map(n => {
        const on = {t: n.t, d: n.d, p: n.p, v: n.v};
        if (n.ch !== undefined) on.ch = n.ch; // drum channel survives edit re-saves
        if (n.duty !== undefined) on.duty = n.duty;
        if (n.ve !== undefined) on.ve = n.ve;
        if (n.env) on.env = n.env.map(q => ({...q})); // volume shape survives
        if (n.duties) on.duties = n.duties.map(q => ({...q})); // duty changes inside the note survive
        if (n.lg) on.lg = 1; // glide link (CC84): plays on from the note before it
        return on;
      })};
    if (tr.midiPan !== undefined) o.midiPan = tr.midiPan; // the .mid's own CC10 (a chip capture's channel) — writeMidi re-emits it
    if (tr.ctl && tr.ctl.length) o.ctl = ctlCopy(tr).ctl; // channel controllers (bend, CC7/11/64/1/91, pan events, program)
    if (tr.offset) o.offset = tr.offset; // tools/sounding.mjs
    if (tr.srcIndex !== undefined) o.srcIndex = tr.srcIndex; // docs/declared-vs-learner-spec.md phase 2: how source.metas reattaches after edits
    return o;
  });
}
// The published music's fingerprint (pubSig): "edited since last save" is a
// comparison with it, not a flag that any edit sets for good — an added note
// then undone left songs "edited" that were not (Josh, 2026-09-29).
// Signs whatever tempo map it's given — it does NOT bake one itself (it has
// no notes to bake from). A caller comparing a draft's un-baked base against
// the published .mid's baked map must bake the base first (see
// draftFingerprint) or the two sides disagree about nothing that changed —
// that was the Cool B Major Progression bug (Josh, 2026-09-29): 60 in the
// draft's base vs 75 published and heard. Every OTHER caller here signs the
// SAME (un-baked) convention on both sides of its own comparison, so this
// stayed safe to widen to include tempo (docs/provenance-plan.md P2: a
// tempo-only edit must republish the .mid, which needs tempo IN the sig).
export function musicSig(d) { return JSON.stringify([d.ppq, d.tracks, d.tempos, d.timesigs]); }
export function draftDoc(clean) { // the song as this device stores it (the working copy, or a Save checkpoint)
  const d = {savedStamp: S.song.savedStamp || 0,
    ppq: S.song.ppq, timesig: S.song.timesig || effTs(), tempos: S.song.baseTempos || S.song.tempos,
    ...(S.song.source ? {source: S.song.source} : {}), // the file's OWN meter/key history rides along with every save (docs/declared-vs-learner-spec.md)
    tracks: draftTracks(S.song.tracks)};
  const sig = musicSig(d);
  if (clean) S.song.pubSig = sig; // clean = this IS the published music (a copy just made, or just published)
  d.dirty = clean ? false : S.song.pubSig ? sig !== S.song.pubSig : true; // no fingerprint yet: any edit counts, as before
  d.pubSig = S.song.pubSig || null;
  return d;
}
// ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
// ---- Versions (Model B, Josh picked 2026-09-29: "always kept, plus
// versions" — Logic/GarageBand style; A was "every single thing you do is
// always saved, that kind of sucks … not the way it works in Logic" turned
// into a smaller first step, then this). Autosave is no longer a choice —
// autosaveOn() stays only so a stray caller still reads "on". The working
// copy already follows every edit (crash-proof); File → Save Version (⌘S)
// additionally snapshots music AND annotations, dated, into this device's
// own history for the song; File → Versions… lists them (newest last on
// disk, newest FIRST on screen) plus the published copy; going back to any
// of them pushes the CURRENT state as a version first ("Before going back"),
// so nothing is ever thrown away. The gold ● means "not published yet" —
// only Publish clears it (songUnsaved, below); Save Version never does.
export function autosaveOn() { return true; }
export function versionsStoreKey(key) { return "ff1roll-versions-" + key; }
export function readVersionsRaw(key) {
  try { const v = JSON.parse(localStorage.getItem(versionsStoreKey(key)) || "[]"); return Array.isArray(v) ? v : []; }
  catch (err) { return []; }
}
export function writeVersionsRaw(key, list) { localStorage.setItem(versionsStoreKey(key), JSON.stringify(list.slice(-20))); }
// Migration (additive — nothing is dropped before it is copied over): the
// first time this device reads or writes a song's versions, an old Save
// checkpoint (ff1roll-save-<key>, MUSIC ONLY) becomes a version, and a
// stashed working copy (ff1roll-stash-<key>) becomes one too; then both
// retire. Runs every time (cheap: two localStorage reads when there is
// nothing left to migrate) so a key touched before Versions shipped is
// caught whenever it is next opened.
export function migrateVersions(key) {
  const list = readVersionsRaw(key);
  let changed = false;
  const saveRaw = localStorage.getItem("ff1roll-save-" + key);
  if (saveRaw !== null) {
    try {
      const d = JSON.parse(saveRaw);
      list.push({at: d.savedAt || Date.now(), label: "Saved (before versions)",
                 draft: {ppq: d.ppq, timesig: d.timesig, tempos: d.tempos, tracks: d.tracks}, notes: null});
    } catch (err) { /* corrupt checkpoint: nothing worth carrying over */ }
    localStorage.removeItem("ff1roll-save-" + key);
    changed = true;
  }
  const stashRaw = localStorage.getItem("ff1roll-stash-" + key);
  if (stashRaw !== null) {
    try {
      const st = JSON.parse(stashRaw);
      let draft = null; try { draft = st.draft ? JSON.parse(st.draft) : null; } catch (err) { draft = null; }
      if (draft) {
        let notes = null; try { notes = st.notes ? JSON.parse(st.notes) : null; } catch (err) { notes = null; }
        list.push({at: st.at || Date.now(), label: "Unsaved copy (before versions)", draft, notes});
      }
    } catch (err) { /* corrupt stash: nothing worth carrying over */ }
    localStorage.removeItem("ff1roll-stash-" + key);
    changed = true;
  }
  if (changed) writeVersionsRaw(key, list);
  return list;
}
export function readVersions(key) { return migrateVersions(key); }
// newest LAST (disk order); callers reverse for display
// snapshot THIS DEVICE's current draft + annotations for key, under label;
// false when there is nothing local to snapshot (no draft — an unedited
// published song, or a capture with no music draft at all)
export function pushVersion(key, label) {
  const list = migrateVersions(key); // legacy checkpoint/stash join the list first, so a fresh push never outranks or drops them
  const draftRaw = localStorage.getItem(draftStoreKey(key));
  if (draftRaw === null) return false;
  let draft = null; try { draft = JSON.parse(draftRaw); } catch (err) { return false; }
  let notes = null; try { const n = localStorage.getItem("ff1roll-notes-" + key); notes = n ? JSON.parse(n) : null; } catch (err) { notes = null; }
  list.push({at: Date.now(), label, draft, notes, ts: localStorage.getItem("ff1roll-ts-" + key) || null});
  writeVersionsRaw(key, list);
  return true;
}
export function songUnsaved() { // what the ● means: "not published yet" — only Publish clears it; Save Version never does
  if (!S.song || !isComposition()) return false;
  return songDirtyFlag() || localStorage.getItem("ff1roll-notes-" + S.songKey) !== null; // unpublished annotations count too: a tempo note changes what Publish bakes into the .mid
}
export function draftKeys() {
  return Object.keys(localStorage).filter(k => k.startsWith("ff1roll-draft-"))
    .map(k => k.slice("ff1roll-draft-".length)).sort();
}

export function draftWrite(key, doc) { // synchronous for the caller; the notes follow through the queue
  if (key.startsWith("local/")) return localDraftWrite(key, doc);
  if (draftInIdb(key)) {
    const {tracks, ...stub} = doc;
    stub.tracksRef = 1;
    idbDraftPut(key, tracks);
    localStorage.setItem(draftStoreKey(key), JSON.stringify(stub));
  } else localStorage.setItem(draftStoreKey(key), JSON.stringify(doc));
}
// Local/ songs (2026-10-02 — see "Local song persistence" in NIGHT-ROLL.md):
// every edit rewrites the whole draft (saveEdits), and the app can be killed
// right after one (an install relaunch). The IndexedDB put is queued, so a
// stub alone in localStorage could claim notes that never landed. So a
// local draft is written WHOLE to localStorage — synchronous, the copy load
// reads — whenever it fits (500k chars; local songs are usually far
// smaller), and its notes go to IndexedDB too, so a song that later grows
// past the cap loses at most the edits in flight, not everything since it
// last fit. Every write carries seq (stored seq + 1); the IndexedDB record
// is {seq, tracks}. Past the cap, or when the store is full: stub + IDB as
// before, logged once — the last edit is crash-safe only once the put lands.
// Returns true (stored) or the put's promise (true once landed).
export function localDraftWrite(key, doc) {
  // seq is the LAST key written (below), so the last "seq": in the stored
  // JSON is it — no parse of a whole song on every edit (a "seq": inside a
  // string would be escaped, \"seq\")
  const old = localStorage.getItem(draftStoreKey(key)) || "", at = old.lastIndexOf('"seq":');
  const prev = at < 0 ? 0 : parseInt(old.slice(at + 6), 10) || 0;
  doc = {...doc, seq: prev + 1};
  const idb = typeof indexedDB !== "undefined";
  const landed = idb ? idbDraftPut(key, {seq: doc.seq, tracks: doc.tracks}) : true;
  const whole = JSON.stringify(doc);
  if (!idb || whole.length <= 500000) {
    try { localStorage.setItem(draftStoreKey(key), whole); return true; }
    catch (err) { if (!idb) throw err; } // full: the stub below is smaller
  }
  if (localDraftWrite.warned !== key) { localDraftWrite.warned = key; logErr(key.split("/").pop() + " is too big to keep whole on this device — its newest edit is safe only a moment after you make it (IndexedDB)"); }
  const {tracks, ...stub} = doc;
  stub.tracksRef = 1;
  localStorage.setItem(draftStoreKey(key), JSON.stringify(stub));
  return landed;
}

export function saveDraft(clean) { // clean=true right after a successful Publish; the working copy follows every edit regardless (crash recovery)
  if (!isComposition() && !isLocalDraft()) return;
  if (S.cmp && S.cmp.showing === "repo") return; // the saved copy is swapped in: writing it over the draft would destroy his edits
  try {
    const landed = draftWrite(S.songKey, draftDoc(clean));
    if (S.song.overlayFold) retireOldOverlay(S.song.overlayFold, landed);
    if (editableSong()) scheduleBackupFlush(); // off-device backup (2026-10-02 deploy safeguards) — only an actual write schedules one
  } catch (err) { // a full localStorage must never throw out of an edit: say so, loudly, once per song
    if (saveDraft.warned !== S.songKey) { saveDraft.warned = S.songKey; logErr("this device's storage is full — the last edit to " + baseName() + " is NOT saved. Publish, or ✕ some drafts under Open → drafts, then edit again."); }
    setInfo("⚠ storage full — edit not saved (see ⚠)");
  }
  updateSongBtn(); // the unsaved dot tracks every edit
  updateSyncBtn(); // and the Publish (N) count: an undo back to the published music takes a song off it
  filesMirrorSoon(); // the Files copy follows, once the edits settle — every edit is kept, always (Model B)
}
saveDraft = prof("saveDraft", saveDraft);
// saveDraft calls this after a write while song.overlayFold is pending;
// landed is draftWrite's answer (true, or the IndexedDB put's promise)
export function retireOldOverlay(f, landed) {
  return Promise.resolve(landed).then(ok => ok ? draftRead(f.key) : null).then(d => {
    if (!d || !d.tracks) return false;
    const have = new Set();
    d.tracks.forEach((tr, ti) => tr.notes.forEach(n => have.add(overlayNoteSig(ti, n))));
    const missing = f.need.filter(sig => !have.has(sig)).length;
    if (missing) { logDebug("old edits on " + f.key + " kept: the saved draft lacks " + missing + " of their notes"); return false; }
    const live = "ff1roll-edits-" + f.key;
    if (localStorage.getItem(live) !== f.raw) return false; // changed since the load: not ours to move
    localStorage.setItem("ff1roll-retired-edits-" + f.key + "@" + Date.now(), f.raw); // a full store throws here: the overlay stays
    localStorage.removeItem(live);
    if (S.song && S.song.overlayFold === f) delete S.song.overlayFold;
    updateClearBtn();
    return true;
  }).catch(err => { logDebug("old edits on " + f.key + " kept: " + (err && err.message || err)); return false; });
}
export function filesMirrorSoon() { clearTimeout(S.filesMirrorT); S.filesMirrorT = setTimeout(filesMirror, 2000); }
export async function draftRead(key) { // the whole draft, notes included, or null
  const raw = localStorage.getItem(draftStoreKey(key));
  if (raw === null) return null;
  let d = null; try { d = JSON.parse(raw); } catch (err) { return null; }
  if (d && d.tracksRef && !d.tracks) {
    if (key.startsWith("local/")) return localDraftTracks(key, d);
    d.tracks = (await idbDraftGet(key)) || [];
  }
  return d;
}
export async function filesMirror() {
  const fs = nativeFs();
  if (!fs || !S.song || !S.songKey || !isComposition()) return false;
  const root = nativeDirHandle(fs, "");
  const base = S.songKey.replace(/\.mid$/, "");
  try {
    await folderWrite(S.songKey, writeMidi(S.song), root);
    await folderWrite(base + ".rollnotes.json", serializeRollnotesStamped(Date.now()), root);
    await folderWrite(base + ".notes.txt", notesTxtFor(), root);
    return true;
  } catch (err) {
    if (filesMirror.warned !== S.songKey) { filesMirror.warned = S.songKey; setInfo("⚠ couldn't write the song into Files: " + err.message); }
    return false;
  }
}
// a local draft whose localStorage copy is only the stub: its notes from the
// IndexedDB record ({seq, tracks}; an old build's is the bare tracks array).
// A whole localStorage copy never consults IndexedDB — it was written
// synchronously with the newest seq.
export async function localDraftTracks(key, d) {
  const v = await idbDraftGet(key);
  const tracks = v ? (Array.isArray(v) ? v : v.tracks) : null, seq = v && !Array.isArray(v) ? v.seq || 0 : 0;
  if (d.seq && seq < d.seq) logErr(key.split("/").pop() + ": the app closed before its last edit was stored — opening the copy before it");
  d.tracks = tracks || [];
  return d;
}

// auto-save: after the edits settle
// same job, for a song that is NOT open (Publish all's other-song leg —
// Bugs found, docs/provenance-plan.md: Publish all skipped the iPad Files
// mirror for every song but the open one). doc/content are what publishSong
// just built and wrote to the repo — reused here rather than rebuilt so the
// two copies can't drift. Best-effort like filesMirror, but quietly: this
// runs inside a batch job, not a single song's own status line.
export async function filesMirrorFor(key, doc, content) {
  const fs = nativeFs();
  if (!fs || !key) return false;
  const root = nativeDirHandle(fs, "");
  const base = key.replace(/\.mid$/, "");
  try {
    await folderWrite(key, writeMidi(doc), root);
    await folderWrite(base + ".rollnotes.json", content, root);
    await folderWrite(base + ".notes.txt", notesTxtFor(doc, key), root);
    return true;
  } catch (err) { return false; }
}

// d.timesigs: Q9's baked meter (docs/provenance-plan.md) — undefined on anything that doesn't bake one, so this widens musicSig exactly the way adding tempos did (Bugs found): a meter-only change now republishes the .mid too
// A draft from before the fingerprint: read the published .mid once and let
// "edited" follow the comparison — "edited" means "differs from what is
// published". Not when the repo is NEWER than the draft's base (that is the
// newer-save question, asked elsewhere). The first cut also demanded equal
// stamps, and Threnody's never were: it stayed "edited" with Compare showing
// +0 −0 ~0 (Josh, 2026-09-29). true when the draft changed.
export async function draftFingerprint(path, d, repoStamp) {
  if (!d || !d.dirty || d.pubSig || !repoStamp || !d.tracks) return false;
  const unstamped = !d.savedStamp; // "never saved" on a song the repo HAS (Carnival, Josh 2026-09-29)
  if (!unstamped && repoStamp > d.savedStamp) return false;
  let sig;
  try {
    const r = await readData("songs", path);
    if (!r.ok) return false;
    const pub = parseMidi(await r.arrayBuffer());
    // pub.timesig is parseMidi's singular field (the FIRST 0x58 event) — for
    // a non-foreign file that's the whole story, since a composition/copy/
    // import bakes at most one meter for the whole song (bakeMeter's own
    // comment: "one meter per song"); same one-event shape bakeMeter
    // produces, so it lines up with dTimesigs below. Only compared when
    // this song's origin bakes a meter at all (bakesMeter) — the same gate
    // publishSong itself uses for whether timesigs gets written.
    sig = musicSig({ppq: pub.ppq, tempos: pub.tempos, tracks: draftTracks(pub.tracks),
      ...(bakesMeter(path) ? {timesigs: [{tick: 0, num: pub.timesig[0], den: pub.timesig[1]}]} : {})});
  } catch (err) { return false; } // offline: stays "edited" until later
  // pub.tempos is already baked (it's what's in the file); d.tempos is the
  // draft's un-baked base (see draftDoc) — bake it the same way before
  // comparing, or a song with an active tempo: annotation always disagrees
  // with itself here (the Cool B Major Progression bug, one level up). Same
  // idea for meter (Q9, docs/provenance-plan.md): d.timesig is the draft's
  // un-baked base pair — bake it with the SAME notes fetch (bakesTempo and
  // bakesMeter always agree per RULES, so one annotationsFor covers both).
  let dTempos = d.tempos, dTimesigs;
  if (bakesTempo(path) || bakesMeter(path)) {
    try {
      const ts = d.timesig || [4, 4];
      const notes = (await annotationsFor(path)).map(n => resolveNoteWith({...n}, d.ppq, ts));
      if (bakesTempo(path)) dTempos = bakeTempos(d.tempos, notes, d.ppq);
      if (bakesMeter(path)) dTimesigs = bakeMeter([{tick: 0, num: ts[0], den: ts[1]}], notes);
    } catch (err) { /* fetch hiccup: compare on the un-baked base — worst case, the newer-save question gets asked once more */ }
  }
  const same = musicSig({ppq: d.ppq, tracks: d.tracks, tempos: dTempos, timesigs: dTimesigs}) === sig;
  // an unstamped draft adopts the repo's stamp only when its music IS the
  // published music; otherwise which is newer is unknown, and the newer-save
  // question must still be asked — nothing here may mask another device's save
  if (unstamped) { if (!same) return false; d.savedStamp = repoStamp; }
  d.pubSig = sig;
  d.dirty = !same;
  try { draftWrite(path, d); } catch (err) { /* full: the next edit writes it */ }
  return true;
}
