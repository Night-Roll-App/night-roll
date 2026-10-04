import { ownFolderPath } from "../model/provenance.js";
import { S } from "../state.js";
import { folderOf } from "../model/catalog.js";
import { folderTitle } from "../model/catalog.js";
import { migrateVersions } from "../model/versions.js";
import { idbDraftMove } from "../platform/storage.js";
import { idbAudioMove } from "../platform/storage.js";
import { rememberLastSong } from "../platform/base.js";
import { reflectSongURL } from "./song.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { updateEditBtnVisImpl as updateEditBtnVis } from "../ui/chrome.js";
import { isUnsaved } from "../model/provenance.js";
import { slugify } from "../model/provenance.js";
import { draftStoreKey } from "../platform/storage.js";
import { appConfirmImpl as appConfirm } from "../ui/chrome.js";
import { songTitleOfImpl as songTitleOf } from "../ask/context.js";
import { idbDraftDelete } from "../platform/storage.js";
import { finalizeNotesImpl as finalizeNotes } from "./song.js";
import { updateSongMetaImpl as updateSongMeta } from "./song.js";
import { clampViewImpl as clampView } from "../ui/chrome.js";
import { drawImpl as draw } from "../ui/chrome.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { publishDest } from "../ui/sheets.js";
import { fsRoot } from "../platform/folder.js";
import { draftKeys } from "../model/versions.js";
import { isComposition } from "../model/provenance.js";
import { saveDraft } from "../model/versions.js";
import { readVersions } from "../model/versions.js";
import { pushVersion } from "../model/versions.js";
import { filesMirror } from "../model/versions.js";
import { EDITION } from "../edition.js";
import { NR_DIR } from "../model/provenance.js";
import { serializeRollnotes } from "../model/rollnotes.js";
import { effTs } from "../model/grid.js";
import { setSong } from "./song.js";
import { parseRollnotes } from "../model/rollnotes.js";
import { resolveNote } from "../model/rollnotes.js";
import { setOrigin } from "../model/provenance.js";
import { saveLocalNotes } from "../model/edits.js";
import { draftWrite } from "../model/versions.js";
import { draftDoc } from "../model/versions.js";
import { untitledKey } from "../model/provenance.js";
import { publishedPaths } from "../model/catalog.js";
import { originOf } from "../model/provenance.js";
import { askUnsavedCount } from "../ask/bridge.js";
import { draftDirtyState } from "../ui/chrome.js";
import { dropLocalSong } from "../ui/sheets.js";
import { askRevertToSaved } from "../ask/bridge.js";
import { pubCheck } from "../ui/sheets.js";
import { loadSong } from "./song.js";
import { updateSyncBtnImpl as updateSyncBtn } from "../ui/chrome.js";
import { renderSyncPending } from "../ui/sheets.js";
import { asksheet } from "../ask/sheet.js";
import { askStoreKey } from "../ask/sheet.js";
import { askRenderImpl as askRender } from "../ask/sheet.js";
import { fileStatus } from "../ui/chrome.js";
import { ROLLNOTES_LOCK_MSG } from "../model/rollnotes.js";
import { writeToken } from "../sync/publish.js";
import { catalogHas } from "../model/catalog.js";
import { ghHeaders } from "../audio/chip.js";
import { annotationsFor } from "../model/rollnotes.js";
import { publishSong } from "../sync/publish.js";
import { copyAudioClips } from "../sync/publish.js";
import { audioDirFor } from "../audio/clips.js";
import { deleteRepoFile } from "../sync/publish.js";
import { updateManifest } from "../sync/publish.js";
import { manifestPlace } from "../sync/publish.js";
import { initCatalog } from "../model/catalog.js";

// roots the user cannot save into
export function folderChoices() { // the folders a Save can go to: this device's plus the repo's, own folders only, last used first
  const set = new Set();
  for (const f of Object.keys(localFolders())) if (f !== "local" && ownFolderPath("albums/" + f + "/x.mid")) set.add(f);
  for (const songs of Object.values(S.CATALOG)) if (songs.length && ownFolderPath(songs[0][1])) set.add(folderOf(songs[0][1]));
  const last = localStorage.getItem("ff1roll-lastfolder");
  const out = [...set].sort((a, b) => folderTitle(a).localeCompare(folderTitle(b)));
  if (last && out.includes(last)) { out.splice(out.indexOf(last), 1); out.unshift(last); }
  return out;
}
export function fillFolderSelect(sel, exclude, prefer) { // options: known folders + New folder…; prefer: a folder to guarantee an option for and preselect (✎ Edit's my-covers/lastFolder default — it may have no songs in it yet, so folderChoices() alone wouldn't offer it)
  sel.innerHTML = "";
  const choices = folderChoices();
  if (prefer && !choices.includes(prefer)) choices.unshift(prefer);
  for (const f of choices) {
    if (f === exclude) continue;
    const o = document.createElement("option"); o.value = f; o.textContent = folderTitle(f); sel.appendChild(o);
  }
  const o = document.createElement("option"); o.value = "__new__"; o.textContent = "New folder…"; sel.appendChild(o);
  if (prefer) sel.value = prefer;
  else if (!sel.options.length || sel.options[0].value === "__new__") sel.value = "__new__";
}
export function renameLocalKeys(oldKey, newKey) { // every per-song key on this device rides along; the open song follows
  migrateVersions(oldKey); // fold any pre-versions checkpoint/stash in under the OLD key first, so a rename can't strand them
  for (const pre of ["ff1roll-draft-", "ff1roll-notes-", "ff1roll-ts-", "ff1roll-edits-", "ff1roll-versions-",
                     "ff1roll-tombs-", "ff1roll-origin-", "ff1roll-range-"]) { // a deletion of a synced note must stay dead at the new path too (moveComposition); origin rides too (P4, docs/annotations-v2.md)
    const v = localStorage.getItem(pre + oldKey);
    if (v !== null) { localStorage.setItem(pre + newKey, v); localStorage.removeItem(pre + oldKey); }
  }
  idbDraftMove(oldKey, newKey);
  idbAudioMove(oldKey, newKey);
  if (S.songKey === oldKey) {
    S.songKey = newKey;
    S.currentPath = newKey;
    rememberLastSong(newKey);
    reflectSongURL(newKey);
    updateSongBtn();
    updateEditBtnVis();
  }
}
export async function saveSongAs(folder, name) { // first Save Version of an Untitled song: it gets a folder and a name, then its first version
  if (!S.song || !isUnsaved(S.songKey)) return false;
  const newKey = "albums/" + folder + "/" + slugify(name) + ".mid";
  if (localStorage.getItem(draftStoreKey(newKey)) !== null) { // Josh: "if you already have a local version, it could maybe overwrite that one"
    const ok = await appConfirm("REPLACE " + songTitleOf(newKey).toUpperCase() + "?", "A local copy with that name already exists in " + folderTitle(folder) + ". Replace it with this song?", "Replace", "Keep both");
    if (!ok) return false;
    for (const pre of ["ff1roll-draft-", "ff1roll-notes-", "ff1roll-ts-", "ff1roll-edits-", "ff1roll-versions-", "ff1roll-origin-"]) localStorage.removeItem(pre + newKey);
    idbDraftDelete(newKey);
  }
  renameLocalKeys(S.songKey, newKey);
  try { // the typed name is the title; the filename is its slug
    const d = JSON.parse(localStorage.getItem(draftStoreKey(newKey)) || "null");
    if (d) { d.title = name.trim(); localStorage.setItem(draftStoreKey(newKey), JSON.stringify(d)); }
  } catch (err) { /* the slug will do */ }
  localStorage.setItem("ff1roll-lastfolder", folder);
  saveVersion(true);
  // the song is now a composition and its tempo:/key:/meter: directives
  // resolve under that key's rules (bakesTempo …): re-derive them in place,
  // or the LCD kept the bare base tempo and no key until a reload, which
  // read as "it lost all its annotations" (Josh, 2026-10-03, lotion). Not a
  // reopen (openDraftDoc): that replaced S.song under callers still holding it.
  finalizeNotes(); updateSongMeta(); clampView(); draw();
  updateSongBtn();
  setInfo("saved as " + name.trim() + " in " + folderTitle(folder) + " — Publish sends it to " + (publishDest() === "folder" ? fsRoot.name : "GitHub"));
  return true;
}
export function openSaveForm(mode) { // "save" (name an Untitled song) | "fork" (Save As) | "editcopy" (✎ Edit — captures/starters) | "publish" (Publish on a no-folder-yet song, below): folder + name inside the File menu
  // open the File menu only if it isn't already: Save As is tapped FROM it,
  // and clicking the File button again toggled it shut, form and all (Josh,
  // 2026-10-03: "the file dialogue just disappears when I hit save as")
  if (!document.getElementById("filesheet").classList.contains("on")) document.getElementById("filesheetbtn").click();
  document.getElementById("filenewform").style.display = "none";
  document.getElementById("filerenameform").style.display = "none";
  const form = document.getElementById("filesaveasform");
  form.style.display = "";
  form.dataset.mode = mode;
  // ✎ Edit's default target: the same one makeItMine forked to with no form
  // (docs/provenance-plan.md) — lastFolder if you've used one, else My Covers
  const prefer = mode === "editcopy" ? (localStorage.getItem("ff1roll-lastfolder") || "my-covers") : null;
  fillFolderSelect(document.getElementById("fsfolder"), null, prefer);
  document.getElementById("fsnewfolder").style.display = document.getElementById("fsfolder").value === "__new__" ? "" : "none";
  const inp = document.getElementById("fsname");
  inp.value = mode === "editcopy" ? songTitleOf(S.songKey) // defaults to the title, editable (Josh's ruling)
            : mode === "fork" ? ""
            : (S.songKey && !/untitled-\d+\.mid$/.test(S.songKey) ? songTitleOf(S.songKey) : "");
  inp.placeholder = mode === "editcopy" ? "name for your copy" : mode === "fork" ? "name for the copy" : "song name";
  document.getElementById("fsgo").textContent = mode === "editcopy" ? "Copy & Edit" : mode === "fork" ? "Save copy" : mode === "publish" ? "Publish" : "Save";
  const title = document.getElementById("fstitle"), titleRow = document.getElementById("fstitlerow");
  // "publish" (lotion, 2026-10-03): Publish on a song with no folder yet
  // names it FIRST — this line says so up front, and doubles as the
  // reassurance that backing out (closing the File menu without tapping
  // Publish below) changes nothing, same as any other cancelled sheet.
  title.textContent = mode === "editcopy" ? "Edit a copy" : mode === "publish" ? "Name it, then Publish — closing this changes nothing" : "";
  titleRow.style.display = title.textContent ? "" : "none";
  inp.focus();
  if (mode === "editcopy") inp.select?.(); // select-all: retyping the defaulted title is one keystroke, not a manual clear first
}
export function localFolders() { // folder → this device's copies (draft keys), sorted
  const m = {};
  for (const k of draftKeys()) (m[folderOf(k)] || (m[folderOf(k)] = [])).push(k);
  return m;
}
export function saveVersion(quiet) { // File → Save Version / ⌘S
  if (S.song && isUnsaved(S.songKey)) { if (!quiet) openSaveForm("save"); return false; } // first Save Version of an Untitled song: folder + name first
  if (!S.song || !S.songKey || !isComposition()) { if (!quiet) setInfo("Save Version works on your own songs — this one is a capture; Save As forks it"); return false; }
  if (S.cmp && S.cmp.showing === "repo") { if (!quiet) setInfo("you're hearing the published copy — switch back to your version first"); return false; }
  saveDraft(false); // the working copy is what gets versioned; make sure it's current first
  const n = readVersions(S.songKey).length + 1;
  pushVersion(S.songKey, "Version " + n);
  filesMirror(); // the iPad app: the copy in Files follows every Save Version
  if (!quiet) setInfo("Version saved — only on this " + (EDITION === "app" ? "iPad" : "device"));
  return true;
}
export function forkCurrentSong(name, folder) { // Save As: a copy in the folder you chose (the last used one by default)
  const key = "albums/" + (folder || localStorage.getItem("ff1roll-lastfolder") || NR_DIR.slice(7, -1)) + "/" + slugify(name) + ".mid";
  if (folder) localStorage.setItem("ff1roll-lastfolder", folder);
  const notesText = serializeRollnotes(); // inherit — ruled 2026-08-14 (notes only; the copy's own origin is set below, never the source's)
  const origin = S.songKey || "local file";
  const parsed = {ppq: S.song.ppq, timesig: S.song.timesig || effTs(),
    ...(S.song.source ? {source: S.song.source} : {}), // Save As keeps the file's OWN meter/key history too (docs/declared-vs-learner-spec.md)
    tempos: S.song.tempos.map(t => ({...t})),
    tracks: S.song.tracks.map((tr, ti) => ({name: tr.name,
      ...(tr.midiPan !== undefined ? {midiPan: tr.midiPan} : {}), // a capture's own CC10 — Save As shouldn't silently strip it
      ...(tr.offset ? {offset: tr.offset} : {}),
      ...(tr.srcIndex !== undefined ? {srcIndex: tr.srcIndex} : {}), // docs/declared-vs-learner-spec.md phase 2: how source.metas reattaches after edits
      notes: (S.song.rawNotes ? S.song.rawNotes[ti] : tr.notes) // raw: chop stays a view
        .filter(n => !n.gone).map(n => {
          const o = {t: n.t, d: n.d, p: n.p, v: n.v};
          if (n.ch !== undefined) o.ch = n.ch;
          if (n.duty !== undefined) o.duty = n.duty;
          if (n.ve !== undefined) o.ve = n.ve;
          return o;
        })}))};
  setSong(parsed, key);
  S.currentPath = key;
  rememberLastSong(key);
  reflectSongURL(key);
  updateSongBtn();
  S.rollnotes = parseRollnotes(notesText).map(n => Object.assign(n, {added: true})).map(resolveNote);
  // P4 (docs/annotations-v2.md, Q8): provenance goes in the v2 header now,
  // not a "forked from <path>" note in the notes a person reads — stashed
  // locally (setOrigin) until the first Publish writes it for real (originFor).
  S.rollnotesOrigin = {kind: "copy", from: origin, at: new Date().toISOString()};
  setOrigin(key, S.rollnotesOrigin);
  finalizeNotes();
  saveLocalNotes();
  // Bug found (docs/provenance-plan.md, while building "Make it mine"): a
  // freshly forked key has no draft yet and isn't local/ either, so
  // saveDraft()'s own isComposition() gate silently no-ops on this very
  // first save — the fork would never actually become editable. Same
  // bootstrap "✎ Edit locally" (editHereNow) already needs for a published
  // song with no local copy; draftDoc(false) — not (true) — since this
  // fork has no published counterpart at its new path to call itself clean.
  draftWrite(key, draftDoc(false));
  saveDraft();
  updateSongBtn();
  draw();
}

export function createComposition(bpm, num, den) { // Untitled until the first Save names it and picks its folder
  const key = untitledKey();
  const parsed = {ppq: 480, timesig: [num, den],
    tempos: [{tick: 0, usq: Math.round(60e6 / bpm), sec: 0}],
    tracks: [{name: "pulse1", notes: []}, {name: "pulse2", notes: []}, {name: "triangle", notes: []}]};
  setSong(parsed, key);
  S.currentPath = key;
  rememberLastSong(key);
  reflectSongURL(key);
  updateSongBtn();
  // the meter is HIS declaration (he chose it in the dialog) — record it
  S.rollnotes.push(resolveNote({b1: 1, q1: 1, b2: null, q2: null,
    text: "timesig: " + num + "/" + den, tsdir: [num, den], added: true}));
  // P4 (docs/annotations-v2.md): a new composition's origin, stored in the
  // v2 header from its first publish on — nothing to derive later, unlike
  // copy/import which read it back off a note or a draft's source today
  S.rollnotesOrigin = {kind: "composition", at: new Date().toISOString()};
  setOrigin(key, S.rollnotesOrigin);
  finalizeNotes();
  saveLocalNotes(); // async loadNotes rebuild re-reads this stash
  saveDraft();
  updateSongBtn(); // now that the draft exists, the crumb names its folder
  draw();
}
// ✎ Edit locally, no confirm (Josh, 2026-09-29 — Model B): editherebtn IS
// the "start editing" gesture on your own published song with no local
// copy yet (it sits where Edit ▾ would be — updateEditBtnVis hides the
// real edit row/tools until a local copy exists). Tapping it now makes the
// copy silently, with a footer notice instead of asking first.
export function editHereNow() {
  if (!S.song || !ownFolderPath(S.songKey) || isComposition()) return;
  draftWrite(S.songKey, draftDoc(true)); // clean: nothing changed yet; the first edit marks it
  updateEditBtnVis();
  updateSongBtn();
  setInfo("editing your copy on this device — Publish sends it");
}
// "Overworld" -> "Overworld 2", "Overworld 3"… on a name clash in the target
// folder — makeItMine() always runs this, default name or typed, unlike
// Save As's fork mode (Josh's ruling, docs/provenance-plan.md addendum).
export function forkClashTitle(folder, title) {
  const dir = "albums/" + folder + "/";
  const taken = new Set([...publishedPaths(), ...draftKeys()]
    .filter(p => p.startsWith(dir))
    .map(p => p.slice(dir.length).replace(/\.midi?$/i, "")));
  let n = 1, slug = slugify(title);
  while (taken.has(slug)) { n++; slug = slugify(title + " " + n); }
  return n === 1 ? title : title + " " + n;
}
// "✎ Edit" (Q4, docs/provenance-plan.md addendum, "your copy is yours"):
// forks a capture or starter, replacing the generic "read-only here — Save
// As…" message those used to get with no quick affordance of their own.
// Opens the "Edit a copy" sheet (openSaveForm("editcopy")) with the folder
// and name defaulted — name/folder here are what the sheet's confirm passes
// in; called with neither, it's the same one-tap default as before (straight
// to the last folder used, or my-covers/ the first time). Either way it's
// forkCurrentSong(title, folder) under the hood, clash-suffixed — the
// capture/starter itself is never touched.
export function makeItMine(name, folder) {
  if (!S.song || !S.songKey) return;
  const origin = originOf(S.songKey);
  if (origin !== "capture" && origin !== "starter") return; // everything else already has Edit locally/Save As
  folder = folder || localStorage.getItem("ff1roll-lastfolder") || "my-covers";
  const title = forkClashTitle(folder, (name || songTitleOf(S.songKey)).trim() || songTitleOf(S.songKey));
  forkCurrentSong(title, folder);
  setInfo("made your own copy — \"" + title + "\" in " + folderTitle(folder) + " — fully editable; Publish sends it.");
}

export async function revertSongToRepo(key) { // a Publish row's Revert: any pending song, open or not.
  // Reverts EVERYTHING unpublished for this song, chat included (Josh,
  // 2026-09-30, ruling on the "N chat messages + Revert does nothing" bug) —
  // the confirm/button name what's dropped so a chat-only revert isn't silent.
  const chatKey = "ff1roll-ask-" + key;
  const chatN = askUnsavedCount(chatKey);
  const chatPhrase = chatN ? chatN + " chat message" + (chatN === 1 ? "" : "s") : "";
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "[]"); } catch (err) { /* corrupt: treat as none */ }
  const hasEdits = !!draftDirtyState(key) || notes.length > 0;
  const drops = hasEdits && chatPhrase ? "your edits and " + chatPhrase
              : hasEdits ? "your edits"
              : chatPhrase ? chatPhrase
              : "";
  const ok = await appConfirm("REVERT " + songTitleOf(key).toUpperCase() + "?",
    "Discards this device's unpublished changes to this song" + (hasEdits ? " — music, unsynced annotations, deletions" : "") +
    (chatPhrase ? (hasEdits ? ", and " + chatPhrase : " — " + chatPhrase) : "") + ". " +
    "The published copy becomes what you see. Your current state is kept as a version first — File → Versions… brings it back.",
    "Revert" + (drops ? " — drops " + drops : ""), "Cancel");
  if (!ok) return;
  dropLocalSong(key);
  askRevertToSaved(chatKey);
  pubCheck.delete(key);
  if (key === S.songKey) { S.editUndo = []; S.editRedo = []; S.songKey = null; await loadSong(key); }
  updateSyncBtn();
  updateSongBtn();
  if (document.getElementById("syncsheet").classList.contains("on")) renderSyncPending();
  if (typeof asksheet !== "undefined" && asksheet.classList.contains("on") && askStoreKey() === chatKey) askRender(); // chat sheet open on this song: reflect the drop live
  setInfo("reverted " + songTitleOf(key) + (chatPhrase ? " and dropped " + chatPhrase : "") + " — this device now has the published copy");
}
export async function moveComposition(destDir) {
  const oldKey = S.songKey;
  const newKey = destDir + oldKey.split("/").pop();
  if (newKey === oldKey) { fileStatus("Already there."); return; }
  // version guard (docs/annotations-v2.md P3): a Move republishes the
  // annotations at the new path (annotationsFor would refuse this itself,
  // below — checked here too, early, so the failure shows a clear message
  // instead of a silently-rejected promise)
  if (S.rollnotesReadOnly) { fileStatus(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG); return; }
  // Leaving nightroll/ loses the by-directory editability, so the song
  // carries its provenance with it (the draft rename below is device-local).
  // P4 (docs/annotations-v2.md, Q8): movedFrom goes in the v2 header now,
  // not a "moved from <path>" note — kind is kept as-is (a moved copy is
  // still a copy, a moved composition still a composition); only the FIRST
  // move out of nightroll/ is recorded, same as the note it replaces never
  // got overwritten by a later move either.
  if (oldKey.startsWith(NR_DIR) && !(S.rollnotesOrigin && S.rollnotesOrigin.movedFrom)) {
    S.rollnotesOrigin = {...(S.rollnotesOrigin || {kind: originOf(oldKey)}), movedFrom: oldKey, at: new Date().toISOString()};
    setOrigin(oldKey, S.rollnotesOrigin); // rides to newKey with every other per-song local key (renameLocalKeys, below)
  }
  const token = writeToken();
  const renameLocal = () => renameLocalKeys(oldKey, newKey); // every per-song key rides along
  if (!catalogHas(oldKey)) { // never published: the move is this device's alone; Publish will use the new path
    renameLocal();
    fileStatus("Moved to " + folderTitle(folderOf(newKey)) + ".");
    return;
  }
  if (!token) { // no token: draft-only move on this device
    renameLocal();
    fileStatus("Moved locally (draft only — no token stored; add one in File → Settings to enable repo moves).");
    return;
  }
  fileStatus("Moving to " + destDir + "…");
  try {
    const h = ghHeaders(token);
    // publishSong reads annotations from DISK at the given key (plus this
    // device's still-local additions) — the same merge for every song, open
    // or not. The old path's disk file is about to disappear from under it,
    // so snapshot its current, already-tombstone-filtered note set now,
    // while it's still readable at oldKey — otherwise a move would silently
    // drop every already-published annotation that wasn't still locally
    // pending (Bugs found in this refactor: annotationsFor(newKey) finds
    // nothing on disk at a path nothing has ever been published to yet).
    const priorNotes = await annotationsFor(oldKey);
    const origLocalNotes = localStorage.getItem("ff1roll-notes-" + oldKey); // restored verbatim if the publish below fails
    // every per-song key (draft, local notes, tombstones, midSig) rides to
    // newKey FIRST, so publishSong below is publishing the open song at its
    // new path — one publish function, no hand-written writes here (Josh's
    // ruling: a moved song is byte-identical to publishing it at the new path)
    renameLocal();
    // seed newKey's local-additions bucket with the COMPLETE snapshot above
    // (overwriting whatever renameLocal() just carried over, which was only
    // ever the still-unsynced subset) — mergeLocalAdditions re-derives each
    // one the same way a genuine unsynced note would be, so annotationsFor
    // (newKey) inside publishSong reproduces the full set.
    const seed = priorNotes.map(n => ({b1: n.b1, q1: n.q1, b2: n.b2, q2: n.q2, text: n.text,
      section: n.section || undefined, chord: n.chord || undefined, cnote: n.cnote || undefined, keydir: n.keydir}));
    if (seed.length) localStorage.setItem("ff1roll-notes-" + newKey, JSON.stringify(seed));
    else localStorage.removeItem("ff1roll-notes-" + newKey);
    try {
      const d = JSON.parse(localStorage.getItem(draftStoreKey(newKey)) || "null");
      // the rename carried the OLD path's midSig along; left alone,
      // publishSong would see "already matches" and skip writing the .mid
      // at newKey, leaving the move mid-less. Clearing it makes publishSong
      // treat the .mid as never-written here.
      if (d && d.midSig !== undefined) { delete d.midSig; localStorage.setItem(draftStoreKey(newKey), JSON.stringify(d)); }
    } catch (err) { /* no draft to clear */ }
    let clipFiles = [];
    try {
      await publishSong(newKey, h, m => fileStatus(m));
      clipFiles = await copyAudioClips(oldKey, newKey, h, m => fileStatus(m)); // clips ride along — still before any old file is deleted
    } catch (err) {
      renameLocalKeys(newKey, oldKey); // failed before any delete — the old files (and clips) are intact; undo the rename so the device still points at a path that has them
      // renameLocalKeys just carried the FULL snapshot back under "ff1roll-notes-" + oldKey (it followed the "ff1roll-notes-" prefix); oldKey's own disk file already had the ones that weren't local-only, so put back exactly what was there before this attempt, not the superset
      if (origLocalNotes === null) localStorage.removeItem("ff1roll-notes-" + oldKey); else localStorage.setItem("ff1roll-notes-" + oldKey, origLocalNotes);
      throw err;
    }
    // a delete that silently fails is how a Move becomes two copies of a song
    const left = [];
    for (const p of [oldKey,
                     oldKey.replace(/\.mid$/, ".rollnotes.json"),
                     oldKey.replace(/\.mid$/, ".notes.txt"),
                     oldKey.replace(/\.mid$/, ".rollnotes"), // last one: legacy, if any
                     ...clipFiles.map(f => audioDirFor(oldKey) + "/" + f)]) {
      if (!await deleteRepoFile(p, h)) left.push(p.split("/").pop());
    }
    await updateManifest(h, albums => manifestPlace(albums, oldKey, newKey));
    await initCatalog().catch(() => {});
    updateSongBtn();
    fileStatus(left.length
      ? "Moved → " + newKey + " — but the old copy could NOT be removed (" +
        left.join(", ") + "). Both paths now exist; clean up in the repo."
      : "Moved ✓ → " + newKey);
  } catch (err) { fileStatus("Move failed: " + err.message); }
}
