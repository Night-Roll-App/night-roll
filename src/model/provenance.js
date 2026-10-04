import { readData } from "../platform/folder.js";
import { draftStoreKey } from "../platform/storage.js";
import { S } from "../state.js";
import { bundledPath } from "../platform/folder.js";
import { titleCaseSlug } from "./catalog.js";
import { folderOf } from "./catalog.js";

// NSF vault: a PRIVATE repo (Josh's design, 2026-08-17) holding the NSFs the
// public repo must not — album.json links to it (vault file + track map, pure
// metadata) and the app fetches with the same token Sync uses. Chain:
// live import session → this device's IndexedDB cache → vault fetch (cached).
// NSF repo config lives in cfg() (nsfBase for reads, nsfRepo for writes)
export const albumMetaCache = {};
// album dir -> album.json contents (or null)
export async function albumMetaFor(key) {
  const m = key && key.match(/^(albums\/.+?)\/(?:songs\/)?[^/]+\.mid$/); // lazy: don't swallow /songs/
  if (!m) return null;
  const dir = m[1];
  if (!(dir in albumMetaCache)) {
    try {
      const r = await readData("songs", dir + "/album.json", true);
      // cache SUCCESS only: a 404 during CDN lag (album committed seconds ago)
      // must not poison the tab — it made committed songs silently play synth
      // while drafts played chip (Josh's side-by-side, 2026-08-17)
      if (r.ok) albumMetaCache[dir] = await r.json();
      else { if (r.status !== 404) albumMetaFor.lastFail = {dir, why: "HTTP " + r.status}; return null; } // 404 = no album.json (a composition): not a failure
    } catch (err) { albumMetaFor.lastFail = {dir, why: err.message || "offline"}; return null; }
  }
  return albumMetaCache[dir];
}

// -------------------------------------- compositions (File: New / Save / Save As)
// A composition is a .mid + .rollnotes pair in albums/compositions/nightroll/ —
// Josh's scratch space (2026-08-15 rulings). The .mid is written IN the page;
// Save commits both via the GitHub API. Chip captures are locked: Save refuses
// anything outside nightroll/, Save As forks it there (rollnotes inherited
// verbatim + an origin note; drift is Josh's to own). Unsaved work lives in a
// full-song localStorage draft, keyed by path, listed in the song picker.
export const NR_DIR = "albums/compositions/nightroll/";
export const COMP_DIR = "albums/compositions/";
// Writable = the app's OWN songs only (2026-08-15 tightening), and since
// 2026-09-27 only the LOCAL COPY of one: the song this device holds a draft
// of. Provenance notes ("forked from" by Save As, "moved from" by Move) are
// kept as history but no longer unlock editing; nightroll/ is no longer
// editable by path alone either. "✎ Edit locally" makes the copy.
// The note is what makes promotion hold on OTHER devices: a draft is this
// machine's only, and Threnody, promoted by a git rename, was locked on
// the very machine that wrote it (Josh, 2026-09-07). Josh's Logic exports
// live under compositions/ too but have no regeneration path; writeMidi
// would also strip anything beyond notes/tempo/meter (CCs, programs), so
// they stay locked like chip captures. Save As forks them into nightroll/.
export const PROVENANCE_RE = /^(forked|moved) from /;
// "Just folders" (docs/song-organization-proposal.md, 2026-09-27): a song is
// editable when it sits in a folder of the user's own — any albums/ path
// outside the read-only corpora — and this device holds its local copy (or
// the song carries provenance). The FF1 corpus, chip captures and the
// bundled starters are annotate-only; Save As forks them into a folder.
export const READONLY_DIRS = ["albums/nes/final-fantasy-i/", "albums/starters/", "albums/imports/"];
// the FF1 corpus, the bundled starters, the pre-move imports folder
// A chip capture is read-only wherever its folder sits (Josh's "NES/My Covers"
// may live beside "nes/mega-man-2"): known by its draft's capture stamp on
// the device that made it, by album.json's nsf block anywhere else.
export function isCaptureKey(key) {
  if (!key || !key.startsWith("albums/")) return false;
  if (key.startsWith("albums/imports/")) return true;
  try { const d = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); if (d && d.capture) return true; } catch (err) { /* not a draft */ }
  const dir = key.replace(/\/(?:songs\/)?[^/]+\.mid$/, "");
  const meta = typeof albumMetaCache === "object" ? albumMetaCache[dir] : null;
  return !!(meta && meta.nsf);
}
export function ownFolderPath(key) { return !!key && key.startsWith("albums/") && !READONLY_DIRS.some(d => key.startsWith(d)) && !isCaptureKey(key); }
// A published copy is never edited in place (Josh, 2026-09-27: "you have to
// edit a local version … pull it down from the published to your local, and
// then start editing it"): editable = this device holds the local copy (the
// draft), or the song carries provenance. Sketches are no exception now.
export function isComposition() { // the local copy, nothing else (a "forked from"/"moved from" note is history, not a key — Josh, Graveyard 2, 2026-09-27)
  // P1 (docs/provenance-plan.md): left as-is on purpose, not routed through
  // originOf/RULES — this is also the "is this song's own note ARRAY the
  // song, not an overlay" test every `isAdd = !isComposition()` site relies
  // on, orthogonal to editability/origin; it happens to equal "a local draft
  // exists and RULES[originOf(key)].writesMid" for every key that reaches
  // here (ownFolderPath already excludes capture/starter), so no behavior
  // changes either way — rewriting the body would only add risk for it.
  return ownFolderPath(S.songKey) && localStorage.getItem(draftStoreKey(S.songKey)) !== null;
}
// Josh's ruling (2026-09-30, docs/provenance-plan.md): tempo: annotations
// bake into the .mid only for songs HE WROTE — compositions, copies, local
// drafts (Untitled songs count too, unlike isComposition()/isCompositionKey,
// which have no repo path for local/ and so don't apply here). Captures and
// starters never bake — their tempo is measured, not authored. This is
// today's predicate, built from the existing "his song" checks; P1's origin
// model (docs/provenance-plan.md) replaces it with a stored origin.
export function bakesTempo(key) {
  return !!key && (key.startsWith("local/") || ownFolderPath(key)) && localStorage.getItem(draftStoreKey(key)) !== null && rulesFor(key).bakeTempo;
}
// ---- P1 (docs/provenance-plan.md): one origin per song, one rule table ----
// composition (made in Night Roll) · copy (Save As/Move; carries a "forked
// from"/"moved from" note — Q8: still a plain annotation today, not a
// stored field, until the notes move into a v2 header) · import (a MIDI
// file brought in; its own labels kept in `source`, docs/declared-vs-
// learner-spec.md) · capture (game pipeline, FF1 included) · starter
// (bundled pieces). Built from what already exists (paths, draft fields,
// isCaptureKey, bundledPath) — P4 replaces this with a stored origin.
export function hasProvenanceNote(key) { // same "live vs stashed" pattern as declaredTsForKey
  // v2 (docs/annotations-v2.md): the open song's header.origin.from/movedFrom
  // says the same thing a "forked from"/"moved from" NOTE used to — checked
  // first so a v2 file needs no such note at all (P5 moves the real ones
  // there; today's files still carry the note, which the fallback below
  // still finds for a not-open key, where only local additions are stashed).
  if (S.song && key === S.songKey && S.rollnotesOrigin && (S.rollnotesOrigin.from || S.rollnotesOrigin.movedFrom)) return true;
  let list = (S.song && key === S.songKey) ? S.rollnotes : null;
  if (!list) { try { list = JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "null"); } catch (err) { list = null; } }
  return Array.isArray(list) && list.some(n => PROVENANCE_RE.test(n.text || ""));
}
export function originOf(key) {
  if (!key) return "composition"; // no key at all yet (songKey === null: a freshly loaded file with nowhere to live) — same footing as a fresh composition
  // P4 (docs/annotations-v2.md): the open song's stored header wins outright
  // when it says something — the whole point of moving provenance out of a
  // note players read is that the app can trust it directly, no more
  // sniffing paths/drafts/legacy notes for a song that already says what it is.
  if (S.song && key === S.songKey && S.rollnotesOrigin && S.rollnotesOrigin.kind) return S.rollnotesOrigin.kind;
  if (isCaptureKey(key)) return "capture";
  if (bundledPath(key)) return "starter";
  if (key.startsWith("local/") || ownFolderPath(key)) {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); } catch (err) { d = null; }
    if (d && d.source) return "import";
    if (hasProvenanceNote(key)) return "copy";
  }
  return "composition"; // default: his own — also an own-folder path with no local draft yet (nothing published-only can tell copy/import apart without fetching the file; a stored header settles it from here on)
}
// P4: this song's provenance, set once at creation (fork/move/compose) and
// carried locally until the first Publish writes it into the v2 header for
// real (annotationsFor's own disk-read origin then takes over — see
// originFor, used by publishSong/commitImports). renameLocalKeys carries the
// key along with every other per-song local state.
export function pendingOriginKey(key) { return "ff1roll-origin-" + key; }
export function setOrigin(key, origin) { if (key) try { localStorage.setItem(pendingOriginKey(key), JSON.stringify(origin)); } catch (err) {} }
export function pendingOrigin(key) { try { return JSON.parse(localStorage.getItem(pendingOriginKey(key)) || "null"); } catch (err) { return null; } }
// the origin to WRITE for `key` on this publish: the file's own stored
// origin if it already has one (never re-derived, so a prior fork/move's
// header rides forward unchanged through every later publish), else
// whatever this device stashed locally at creation time (a fork/move/
// composition never yet published) — `notes` is annotationsFor(key)'s
// return, whose .origin now survives subtractTombstones (above).
export function originFor(key, notes) { return (notes && notes.origin) || pendingOrigin(key) || null; }
// Rule table (docs/provenance-plan.md, Josh's rulings 2026-09-30 Q4/Q6/Q9):
// editNotes = pencil/track edits allowed; bakeTempo/bakeMeter = a tempo:/
// timesig: annotation writes into the published .mid; writesMid = Publish
// ever puts bytes at this key's .mid path at all (false for capture/
// starter: their .mid is written once, at capture commit, never again).
// composition/copy/import are identical today — Josh's "your copy is
// yours" alternative for captures was NOT taken; captures/starters stay
// locked and get "✎ Edit" instead (the addendum, below).
export const RULES = {
  composition: {editNotes: true, bakeTempo: true, bakeMeter: true, writesMid: true},
  copy: {editNotes: true, bakeTempo: true, bakeMeter: true, writesMid: true},
  import: {editNotes: true, bakeTempo: true, bakeMeter: true, writesMid: true},
  capture: {editNotes: false, bakeTempo: false, bakeMeter: false, writesMid: false},
  starter: {editNotes: false, bakeTempo: false, bakeMeter: false, writesMid: false},
};
export function rulesFor(key) { return RULES[originOf(key)]; }
// ONE editable test (P1): every "is this song mine to edit" check calls
// this now — it used to be three copies (updateEditBtnVis, editableSong,
// askContext) that disagreed on link mode and compare-repo mode (Bugs
// found, docs/provenance-plan.md).
export function canEditMusic(key) {
  if (!key) return true; // songKey === null: nothing saved yet, always editable
  if (key.startsWith("local/")) return true; // never published; this device's only copy — same as isLocalDraft(), no draft-exists gate (it's the only copy there IS)
  return localStorage.getItem(draftStoreKey(key)) !== null && rulesFor(key).editNotes;
}
export function bakesMeter(key) { // Q9: a declared meter bakes wherever tempo bakes — same domain as bakesTempo
  return !!key && (key.startsWith("local/") || ownFolderPath(key)) && localStorage.getItem(draftStoreKey(key)) !== null && rulesFor(key).bakeMeter;
}
// The two albums the app itself named; every other folder is titled by its
// last segment (album.json can override on the repo side)
export const COMP_ALBUMS = [["Night Roll Sketches", NR_DIR], ["My Compositions", COMP_DIR]];
export function albumTitleFor(path) {
  for (const [t, dir] of COMP_ALBUMS) if (path.startsWith(dir) && !(dir === COMP_DIR && path.startsWith(NR_DIR))) return t;
  if (path.startsWith("albums/")) return titleCaseSlug(folderOf(path).split("/").pop() || "albums"); // captures, corpora and own folders alike: the leaf folder
  return null;
}
export function slugify(s) {
  return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}
// A new (or imported) song has no folder until its first Save: it lives under
// local/ as "Untitled N" — editable, never publishable — and Save asks for a
// folder and a name (Josh, 2026-09-27: "it's just unnamed until you save it.
// And then when you save it, you pick what folder it goes into and you give
// it a name").
export function untitledKey() { let n = 1; while (localStorage.getItem(draftStoreKey("local/untitled-" + n + ".mid"))) n++; return "local/untitled-" + n + ".mid"; }
export function isUnsaved(key) { return !!key && key.startsWith("local/"); }
export const RESERVED_FOLDERS = ["final-fantasy-i", "imports", "starters", "local", "albums"];
export function folderFromInput(text) { // "NES/My Covers" → "nes/my-covers"; null when empty or reserved
  const parts = (text || "").split("/").map(slugify).filter(x => x && x !== "untitled");
  if (!parts.length || RESERVED_FOLDERS.includes(parts[0])) return null;
  return parts.join("/");
}
export function chosenFolder(sel, inp) { // the select, or the typed folder; null = nothing valid
  if (sel.value !== "__new__") return sel.value || null;
  return folderFromInput(inp.value);
}
export function isCompositionKey(key) { // isComposition() for a song that is not open (no rollnotes to consult: the draft decides)
  return ownFolderPath(key) && localStorage.getItem(draftStoreKey(key)) !== null;
}
