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
import { updateEditBtnVis } from "../hooks.js";
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
