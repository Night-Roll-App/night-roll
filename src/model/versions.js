import { S } from "../state.js";
import { isComposition } from "./provenance.js";
import { draftStoreKey } from "../platform/storage.js";
import { effTs } from "./grid.js";

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
        return on;
      })};
    if (tr.midiPan !== undefined) o.midiPan = tr.midiPan; // the .mid's own CC10 (a chip capture's channel) — writeMidi re-emits it
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
