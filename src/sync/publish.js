import { S } from "../state.js";
import { folderActive } from "../platform/folder.js";
import { folderWrite } from "../platform/folder.js";
import { repoApi } from "../platform/storage.js";
import { forEachClip } from "../audio/clips.js";
import { idbAudioGet } from "../platform/storage.js";
import { audioDirFor } from "../audio/clips.js";
import { audioBufCache } from "../audio/clips.js";
import { audioCacheKey } from "../audio/clips.js";
import { readData } from "../platform/folder.js";
import { writeMidi } from "../midi/write.js";
import { midiBase64 } from "../audio/bounce.js";
import { folderDelete } from "../platform/folder.js";
import { fsDirFor } from "../platform/folder.js";
import { songShareURL } from "../platform/base.js";
import { LINK_SONGS } from "../platform/base.js";
import { cfg } from "../platform/storage.js";
import { linkRepoLabel } from "../platform/base.js";
import { apiError } from "../platform/storage.js";
import { albumTitleFor } from "../model/provenance.js";
import { titleCaseSlug } from "../model/catalog.js";
import { importDraftKeys } from "../import/capture.js";
import { jobsFind } from "../model/jobs.js";
import { jobStart } from "../ui/sheets.js";
import { commitImports } from "../import/capture.js";
import { draftStoreKey } from "../platform/storage.js";
import { sweepStrandedClones } from "../model/selection.js";
import { saveDraft } from "../model/versions.js";
import { isComposition } from "../model/provenance.js";
import { isCompositionKey } from "../model/provenance.js";
import { annotationsFor } from "../model/rollnotes.js";
import { draftRead } from "../model/versions.js";
import { resolveNoteWith } from "../model/rollnotes.js";
import { bakeTempos } from "../model/rollnotes.js";
import { bakesMeter } from "../model/provenance.js";
import { bakeMeter } from "../model/rollnotes.js";
import { musicSig } from "../model/versions.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { declaredTsForKey } from "../model/rollnotes.js";
import { serializeNotesList } from "../model/rollnotes.js";
import { originFor } from "../model/provenance.js";
import { notesTxtFor } from "../model/rollnotes.js";
import { askCommitLog } from "../ask/bridge.js";
import { filesMirror } from "../model/versions.js";
import { filesMirrorFor } from "../model/versions.js";
import { finalizeNotesImpl as finalizeNotes } from "../session/song.js";
import { drawImpl as draw } from "../ui/chrome.js";
import { updateSyncBtnImpl as updateSyncBtn } from "../ui/chrome.js";
import { renderSyncPending } from "../ui/sheets.js";
import { clearTombstonesFor } from "../model/edits.js";
import { saveLocalNotes } from "../model/edits.js";
import { serializeRollnotes } from "../model/rollnotes.js";
import { draftWrite } from "../model/versions.js";
import { updateSubtitleImpl as updateSubtitle } from "../ui/chrome.js";
import { initCatalog } from "../model/catalog.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { fsRoot } from "../platform/folder.js";
import { saveSongAs } from "../session/files.js";
import { fileStatus } from "../ui/chrome.js";
import { songTitleOfImpl as songTitleOf } from "../ask/context.js";
import { ghHeaders } from "../audio/chip.js";
import { pendingSongs } from "../ui/chrome.js";
import { ASK_GENERAL_KEY } from "../ask/bridge.js";
import { draftKeys } from "../model/versions.js";
import { syncable } from "../ui/chrome.js";
import { pubCheck } from "../ui/sheets.js";
import { pubCompareDraft } from "../ui/sheets.js";
import { logDebugImpl as logDebug } from "../ui/chrome.js";
import { JOB_KINDS } from "../model/jobs.js";
import { openPubJobSheet } from "../ui/sheets.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";

export async function putSongsText(path, text, h) { // text sibling files in the songs repo
  if (folderActive()) { await folderWrite(path, text); return {ok: true, status: 200}; }
  const putOnce = async () => {
    let sha = null;
    const g = await fetch(repoApi("songs") + path + "?ref=main", {headers: h, cache: "no-store"});
    if (g.ok) sha = (await g.json()).sha;
    const body = {message: "Save " + path + " from Night Roll", branch: "main",
                  content: btoa(unescape(encodeURIComponent(text)))};
    if (sha) body.sha = sha;
    return fetch(repoApi("songs") + path, {method: "PUT", headers: h, body: JSON.stringify(body)});
  };
  let r = await putOnce();
  if (r.status === 409) r = await putOnce();
  return r;
}
// audio clips whose bytes exist only on this device go up with the song, to
// <song>.audio/<file> (folder or repo). Marked "someone else's recording"
// (local=1) = never — see wave-tracks-design.md §14 (DMCA: GitHub removes
// content on notice; a public Pages URL is distribution).
export async function uploadAudioClips(h, report) {
  if (!S.song) return;
  const files = new Map(); // one upload per file, however many pieces use it
  forEachClip(c => { if (!files.has(c.file)) files.set(c.file, c); });
  for (const [file, c] of files) {
    if (c.local) { report(file + ": kept local (someone else's recording)"); continue; }
    if (c.where === "folder" || c.where === "repo") continue; // already with the song
    const rec = await idbAudioGet(S.songKey + "|" + file);
    if (!rec || !rec.bytes) continue; // nothing on this device to send
    const bytes = new Uint8Array(rec.bytes);
    report((folderActive() ? "writing " : "uploading ") + file + " (" + (bytes.length / 1e6).toFixed(1) + " MB)…");
    const r = await putMidAt(audioDirFor(S.songKey) + "/" + file, h, bytes); // same PUT shape: any bytes
    if (!r.ok) throw new Error(file + " HTTP " + r.status);
    const where = folderActive() ? "folder" : "repo";
    forEachClip(x => { if (x.file === file) x.where = where; });
    const e = audioBufCache.get(audioCacheKey(file));
    if (e) e.where = where;
  }
}
// same job, for a song that is NOT open (Publish all's other-song leg —
// Bugs found, docs/provenance-plan.md: Publish all used to skip recordings
// entirely for a song that wasn't open). No live clip cache to consult for
// "already uploaded" here, so it asks the destination directly; `notes` is
// this song's annotations (annotationsFor(key)), read for their audio:
// directives instead of a live song's tracks.
export async function uploadAudioClipsFor(key, notes, h, report) {
  if (key === S.songKey && S.song) return uploadAudioClips(h, report);
  const files = new Map();
  for (const n of notes) if (n.audiodir && n.audiodir.file && !files.has(n.audiodir.file)) files.set(n.audiodir.file, n.audiodir);
  for (const [file, d] of files) {
    if (d.local) { report(file + ": kept local (someone else's recording)"); continue; }
    try { const r = await readData("songs", audioDirFor(key) + "/" + file, true); if (r.ok) continue; } // already with the song
    catch (err) { /* treat as not-yet-uploaded */ }
    const rec = await idbAudioGet(key + "|" + file);
    if (!rec || !rec.bytes) continue; // nothing on this device to send
    const bytes = new Uint8Array(rec.bytes);
    report((folderActive() ? "writing " : "uploading ") + file + " (" + (bytes.length / 1e6).toFixed(1) + " MB)…");
    const r2 = await putMidAt(audioDirFor(key) + "/" + file, h, bytes);
    if (!r2.ok) throw new Error(file + " HTTP " + r2.status);
  }
}
export async function putMidAt(path, h, bytes) { // PUT a .mid (current song unless bytes given), one stale-sha retry
  if (folderActive()) { await folderWrite(path, bytes || writeMidi(S.song)); return {ok: true, status: 200}; }
  const data = midiBase64(bytes || writeMidi(S.song));
  const putOnce = async () => {
    let sha = null;
    const g = await fetch(repoApi("songs") + path + "?ref=main", {headers: h, cache: "no-store"});
    if (g.ok) sha = (await g.json()).sha;
    const body = {message: "Save " + path + " from Night Roll", branch: "main",
                  content: data};
    if (sha) body.sha = sha;
    return fetch(repoApi("songs") + path, {method: "PUT", headers: h, body: JSON.stringify(body)});
  };
  let r = await putOnce();
  if (r.status === 409) r = await putOnce();
  return r;
}
// Returns true if the file is gone (deleted, or never there). A failed DELETE
// used to be invisible: Move reported "Moved ✓" while the old copy survived, so
// a half-move and a clean move looked identical from the UI. That happened to
// Josh on 2026-09-06 and left two copies of test-sad-progression in the repo.
export async function deleteRepoFile(path, h) { // tolerate absence: never-synced drafts have no repo file
  if (folderActive()) return folderDelete(path);
  const g = await fetch(repoApi("songs") + path + "?ref=main", {headers: h, cache: "no-store"});
  if (!g.ok) return true; // nothing there to delete
  const sha = (await g.json()).sha;
  const del = () => fetch(repoApi("songs") + path, {method: "DELETE", headers: h,
    body: JSON.stringify({message: "Move " + path + " from Night Roll", sha, branch: "main"})});
  let r = await del();
  if (r.status === 409) r = await del(); // same one-retry shape as putMidAt
  return r.ok;
}
// filenames under <key>.audio/, folder or repo; [] if the dir doesn't exist
// (a song with no clips, or one never published). fsDirFor is the existing
// folder helper — its "parent dir of a path's last segment" shape gives us
// the .audio/ dir handle itself when the path we hand it ends in a throwaway
// segment; repo mode reads the same GitHub contents API putMidAt/deleteRepoFile
// use, un-PUT/DELETEd, which lists a directory's entries when given one.
export async function audioDirFiles(key, h) {
  const dir = audioDirFor(key);
  if (folderActive()) {
    try {
      const {dir: dh} = await fsDirFor(dir + "/x", false);
      const out = [];
      for await (const [name, fh] of dh.entries()) if (fh.kind === "file") out.push(name);
      return out;
    } catch (err) { return []; } // no .audio/ dir yet
  }
  try {
    const r = await fetch(repoApi("songs") + dir + "?ref=main", {headers: h, cache: "no-store"});
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j.filter(e => e.type === "file").map(e => e.name) : [];
  } catch (err) { return []; }
}
// The link = this player + this song + where the song lives. Songs on this
// site need nothing more (the path form); a song from another repo — a link
// you followed, or your own Settings pointing elsewhere — carries songs=.
export const APP_REPO = "Night-Roll-App/night-roll";
// the repo this site is served from: its songs need no songs= in a link
// a link someone ELSE can open: inside the iPad app the page lives at
// capacitor://localhost, which is no address at all off this device
export const PUBLIC_BASE = "https://night-roll-app.github.io/night-roll/";
export function publicBase() { return /^https?:/.test(S.APP_BASE) ? S.APP_BASE : PUBLIC_BASE; }
export function shareLinkFor(path, repo) {
  const u = new URL(songShareURL(path, publicBase()));
  const base = LINK_SONGS || (cfg().songsBase ? cfg().songsBase.replace(/\/+$/, "") : null);
  const where = repo || (base ? linkRepoLabel(base) : (cfg().songsRepo !== APP_REPO ? cfg().songsRepo : null)); // published elsewhere → say where
  if (where && where !== APP_REPO) u.searchParams.set("songs", where);
  return u.href;
}
// The songs repo's README lists its songs as player links, so the repo page IS
// the share page (Josh, 2026-09-26: "people … go to that repo … hit the play
// button"). The app owns only the block between the markers: a README with no
// markers gets the block appended, one with them gets it replaced, and
// everything else in the file is left exactly as it was.
export const README_OPEN = "<!-- night-roll:songs -->", README_CLOSE = "<!-- /night-roll:songs -->";
export function songsReadmeBlock(albums, repo) {
  const L = [README_OPEN, "## Songs — open in Night Roll", ""];
  for (const a of albums || []) {
    if (!a.songs || !a.songs.length) continue;
    L.push("**" + a.title + "**", "");
    for (const s of a.songs) L.push("- [" + s.title + "](" + shareLinkFor(s.path, repo) + ")");
    L.push("");
  }
  L.push("Made in [Night Roll](" + S.APP_BASE + "). Links open the song in the player, from this repo.", README_CLOSE);
  return L.join("\n");
}
export function spliceReadme(existing, block) {
  if (!existing) return block + "\n";
  const i = existing.indexOf(README_OPEN), j = existing.indexOf(README_CLOSE);
  if (i >= 0 && j > i) return existing.slice(0, i) + block + existing.slice(j + README_CLOSE.length);
  return existing.replace(/\s*$/, "") + "\n\n" + block + "\n";
}
export async function writeSongsReadme(h) { // after the manifest is current; never fatal for the publish itself
  if (folderActive()) return;
  const repo = cfg().songsRepo;
  const g = await fetch(repoApi("songs") + "albums/manifest.json?ref=main", {headers: h, cache: "no-store"});
  if (!g.ok) return;
  const albums = JSON.parse(decodeURIComponent(escape(atob((await g.json()).content.replace(/\n/g, "")))));
  const block = songsReadmeBlock(albums, repo);
  const putOnce = async () => {
    let sha = null, existing = "";
    const r = await fetch(repoApi("songs") + "README.md?ref=main", {headers: h, cache: "no-store"});
    if (r.ok) { const j = await r.json(); sha = j.sha; existing = decodeURIComponent(escape(atob((j.content || "").replace(/\n/g, "")))); }
    const next = spliceReadme(existing, block);
    if (next === existing) return {ok: true};
    const body = {message: "Update the song list from Night Roll", branch: "main", content: btoa(unescape(encodeURIComponent(next)))};
    if (sha) body.sha = sha;
    return fetch(repoApi("songs") + "README.md", {method: "PUT", headers: h, body: JSON.stringify(body)});
  };
  let r = await putOnce();
  if (r.status === 409) r = await putOnce();
  if (!r.ok) throw new Error("README HTTP " + r.status);
}
export async function putRollnotes(path, content, headers) { // PUT with one stale-sha retry
  if (folderActive()) { await folderWrite(path, content); return {ok: true, status: 200}; }
  const putOnce = async () => {
    let sha = null;
    const g = await fetch(repoApi("analysis") + path + "?ref=main", {headers, cache: "no-store"});
    if (g.ok) sha = (await g.json()).sha;
    const body = {
      message: "Update " + path + " from Night Roll",
      content: btoa(unescape(encodeURIComponent(content))),
      branch: "main",
    };
    if (sha) body.sha = sha;
    return fetch(repoApi("analysis") + path, {method: "PUT", headers, body: JSON.stringify(body)});
  };
  let r = await putOnce();
  if (r.status === 409) r = await putOnce();
  return r;
}
// opts.keepDraft: annotations went up without the .mid
export function recordLastSync(key, text) {
  try { localStorage.setItem("ff1roll-lastsync-" + key, JSON.stringify({t: Date.now(), text})); }
  catch (err) { /* storage full: the bridge is best-effort */ }
}
// folder mode needs no token: the write helpers never reach GitHub. The
// placeholder keeps every guard and ghHeaders() call shape-compatible.
export function writeToken() { return localStorage.getItem("ff1roll-ghtoken") || (folderActive() ? "folder" : null); }
// "connected" (Model B, 2026-09-29): a GitHub token or a local folder —
// anything Publish could actually send to. Not connected: the footer
// Publish button and the ● both hide (a local-only user's work is always
// kept regardless; Versions are the save points), and File → Publish…
// still opens, explaining how to connect.
export function connected() { return !!writeToken(); }
export function takeToken(status) {
  const token = document.getElementById("ghtoken").value.trim() ||
                localStorage.getItem("ff1roll-ghtoken") || "";
  if (!token && folderActive()) return "folder";
  if (!token) { status.textContent = "No token — paste one in File → Settings first."; return null; }
  localStorage.setItem("ff1roll-ghtoken", token);
  return token;
}

export async function updateManifest(h, mutate) { // GET manifest.json, mutate, PUT — keeps the dropdown honest
  if (folderActive()) return; // the folder has no manifest: initCatalog rescans it
  const path = "albums/manifest.json";
  const putOnce = async () => {
    const g = await fetch(repoApi("songs") + path + "?ref=main", {headers: h, cache: "no-store"});
    if (!g.ok) throw apiError("songs", g, "manifest GET");
    const j = await g.json();
    const albums = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, "")))));
    if (!mutate(albums)) return {ok: true};
    return fetch(repoApi("songs") + path, {method: "PUT", headers: h, body: JSON.stringify({
      message: "Update manifest from Night Roll", branch: "main", sha: j.sha,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(albums, null, 1) + "\n"))),
    })});
  };
  let r = await putOnce();
  if (r.status === 409) r = await putOnce();
  if (!r.ok) throw new Error("manifest PUT " + r.status);
}
export function manifestPlace(albums, dropPath, addPath) { // remove one path, add another; returns changed
  let changed = false;
  for (const a of albums) {
    const i = a.songs.findIndex(s => s.path === dropPath || s.path === addPath);
    if (i >= 0) { a.songs.splice(i, 1); changed = true; }
  }
  if (addPath) {
    const title = albumTitleFor(addPath);
    let album = albums.find(a => a.title === title);
    if (!album) { album = {title, songs: []}; albums.push(album); }
    album.songs.push({title: titleCaseSlug(addPath.split("/").pop().replace(/\.mid$/, "")), path: addPath});
    album.songs.sort((a, b) => a.title.localeCompare(b.title));
    changed = true;
  }
  return changed;
}

// A running "Commit album" outlives the menu: the File menu is rebuilt on
// every open, so its progress must live outside the button (Josh,
// 2026-09-27, minutes into the Chrono Trigger commit: "I didn't know if I
// could click away"). The footer strip carries the same line everywhere.
// A publish of captures is a job too: one per folder at a time, its note is
// commitImports' status line, ↻ re-runs it for the drafts still there
// (commitImports deletes drafts only after success, so a retry is safe).
export function publishJobStart(slug, keys, statusFn) {
  keys = keys || importDraftKeys();
  if (!keys.length) { statusFn && statusFn("No captures to publish."); return null; }
  const live = jobsFind("publish", slug, true) || (slug ? null : jobsFind("publish", null, true));
  if (live) { statusFn && statusFn("a publish is running: " + live.title + " — tap ⏳"); return null; }
  const title = slug ? titleCaseSlug(slug) : keys.length + " tracks";
  return jobStart("publish", title, [{label: keys.length + " track" + (keys.length === 1 ? "" : "s")}], async api => {
    api.update(0, {st: "running"});
    await commitImports(s => { api.note(s); statusFn && statusFn(s); }, keys);
    const left = keys.filter(k => localStorage.getItem(draftStoreKey(k)) !== null && importDraftKeys().includes(k));
    api.update(0, {st: left.length ? "failed" : "done", msg: left.length ? left.length + " not published" : ""});
    if (left.length) throw new Error(left.length + " of " + keys.length + " not published");
  }, {slug, keys});
}
export async function renameRepoTitle(key, title, h) { return renameRepoTitles({[key]: title}, h); }
export async function renameRepoTitles(titles, h) { // {key: title} for songs of ONE album: album.json songs overrides + manifest entries, one write each
  const keys = Object.keys(titles);
  if (!keys.length) return;
  const key = keys[0];
  const parts = key.split("/");
  const file = parts.pop();
  if (parts[parts.length - 1] === "songs") parts.pop(); // FF1-style albums keep songs/ nested
  const path = parts.join("/") + "/album.json";
  const base = file.replace(/\.midi?$/i, "");
  let meta = {title: titleCaseSlug(parts[parts.length - 1]), songs: {}}, sha = null;
  if (folderActive()) { // folder: the album.json there (or the site's, copied in) gets the override
    const r = await readData("songs", path, true);
    if (r.ok) { try { meta = await r.json(); } catch (err) { /* rewrite */ } }
    if (Array.isArray(meta.songs)) meta.songs = {};
    for (const k of keys) meta.songs[k.split("/").pop().replace(/\.midi?$/i, "")] = titles[k];
    await folderWrite(path, JSON.stringify(meta, null, 1) + "\n");
    return;
  }
  const g = await fetch(repoApi("songs") + path + "?ref=main", {headers: h, cache: "no-store"});
  if (g.ok) { // preserve every existing field (FF1's album.json carries notes/order)
    const j = await g.json();
    sha = j.sha;
    try { meta = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, ""))))); } catch (err) { /* rewrite */ }
  }
  if (Array.isArray(meta.songs)) meta.songs = {}; // ancient shape guard
  meta.songs = {...(meta.songs || {})};
  for (const k of keys) meta.songs[k.split("/").pop().replace(/\.midi?$/i, "")] = titles[k];
  const body = {message: keys.length === 1 ? "Rename " + base + " to \"" + titles[key] + "\" from Night Roll" : "Name " + keys.length + " songs of " + (meta.title || base) + " from Night Roll", branch: "main",
    content: btoa(unescape(encodeURIComponent(JSON.stringify(meta, null, 1) + "\n")))};
  if (sha) body.sha = sha;
  const r = await fetch(repoApi("songs") + path, {method: "PUT", headers: h, body: JSON.stringify(body)});
  if (!r.ok) throw apiError("songs", r, "album.json");
  await updateManifest(h, albums => {
    let changed = false;
    for (const a of albums) {
      let hit = false;
      for (const k of keys) { const s = a.songs.find(x => x.path === k); if (s) { s.title = titles[k]; hit = true; } }
      if (hit) { a.songs.sort((x, y) => x.title.localeCompare(y.title)); changed = true; }
    }
    return changed;
  });
}
// ---- ONE publish function per song (Josh's ruling, 2026-09-30,
// docs/provenance-plan.md P2: "Publish all must behave exactly like
// publishing the open song — one publish function per song"). Both the
// Publish button (ghsave, below) and Publish all (publishAllJobStart) call
// this, for every song, open or not — it is the only place that writes a
// .mid or a .rollnotes.json for Publish. doc = the open song, after
// saveDraft flushes it to its draft (so both paths read the SAME shape back
// out of storage below) — or a not-open song's existing draft — or null for
// an analyzed song with no music draft to publish (annotations only; its
// .mid is never touched here, per Josh's ruling in the plan: captures and
// starters write their .mid once, at capture commit, never again).
export async function publishSong(key, h, report) {
  report = report || (() => {});
  const isOpen = key === S.songKey && !!S.song;
  if (isOpen) {
    if (S.cmp && S.cmp.showing === "repo") throw new Error("You are hearing the published copy — switch back to your version first (the compare bar).");
    sweepStrandedClones(); // never publish invisible stacks
    saveDraft(false); // the open song's edits land in its draft, same as any other song's, before it's read back below
  }
  const hisMusic = isOpen ? isComposition() : isCompositionKey(key); // never local/ — it has no repo path to publish a .mid to (bakesTempo, playback-only, is the wider one)
  const notes = await annotationsFor(key); // repo file + local additions, tombstones subtracted (Bugs found: a tombstoned note republished)
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); } catch (err) { stored = null; }

  let doc = null;
  if (hisMusic && stored) {
    const d = await draftRead(key); // whole draft, notes included (tracksRef drafts read through to IndexedDB)
    if (d && d.tracks) {
      const ts = d.timesig || [4, 4];
      const resolved = notes.map(n => resolveNoteWith({...n}, d.ppq, ts)); // d's OWN meter — never the globally open song's
      doc = {ppq: d.ppq, timesig: d.timesig, ...(d.source ? {source: d.source} : {}),
             tempos: bakeTempos(d.tempos, resolved, d.ppq), // d.tempos is the un-baked base (draftDoc's convention) — baked fresh every publish, never accumulated, so removing a tempo: note removes its baked event
             // Q9 (docs/provenance-plan.md): a declared meter bakes wherever
             // tempo bakes. Base = d's OWN [num,den] as a one-event list (the
             // file's own label, or his declared default on a fresh
             // composition — "one meter per song" today, so that's always
             // the whole un-baked base); bakeMeter returns it UNCHANGED when
             // there's no timesig: note (Q6: an import's own label written
             // back verbatim), or the declared meter's event otherwise —
             // baked fresh every publish, never accumulated, same as tempo.
             ...(bakesMeter(key) ? {timesigs: bakeMeter([{tick: 0, num: ts[0], den: ts[1]}], resolved)} : {}),
             tracks: d.tracks.map(tr => ({name: tr.name,
               ...(tr.midiPan !== undefined ? {midiPan: tr.midiPan} : {}),
               ...(tr.offset ? {offset: tr.offset} : {}),
               ...(tr.srcIndex !== undefined ? {srcIndex: tr.srcIndex} : {}), // docs/declared-vs-learner-spec.md phase 2: how source.metas reattaches after edits
               notes: tr.notes.map(n => ({...n}))}))};
    }
  }

  let wroteMid = false, midSig = null;
  const stamp = Date.now();
  if (doc) {
    midSig = musicSig(doc); // now includes the baked tempo map: a tempo-only change republishes (Bugs found)
    if (!stored.midSig || stored.midSig !== midSig) { // never published, or music/baked-tempo changed since
      report("writing the .mid…");
      const r1 = await putMidAt(key, h, writeMidi(doc));
      if (!r1.ok) throw new Error(".mid HTTP " + r1.status);
      wroteMid = true;
    }
  }

  const beats = isOpen ? beatsPerBarDisp() : ((declaredTsForKey(key) || [4])[0]);
  const base = key.replace(/\.midi?$/i, ""), title = base.split("/").pop();
  // P4 (docs/annotations-v2.md): the v2 header's origin — whatever's already
  // on disk for this song (never re-derived once set), else what this
  // device stashed at creation (fork/move/composition never yet published)
  const content = serializeNotesList(notes, beats, title, stamp, originFor(key, notes));
  report("publishing annotations…");
  const r2 = await putRollnotes(base + ".rollnotes.json", content, h);
  if (!r2.ok) throw new Error(".rollnotes.json HTTP " + r2.status);

  if (hisMusic && doc) {
    const r3 = await putSongsText(base + ".notes.txt", notesTxtFor(doc, key), h);
    if (!r3.ok) throw new Error(".notes.txt HTTP " + r3.status);
  }

  await askCommitLog(h, isOpen ? undefined : key, hisMusic); // the ✦ AI chat since the last save, appended to <song>.ask.md

  if (hisMusic) await uploadAudioClipsFor(key, notes, h, report); // recordings ride along, next to the .mid; "local" ones never (Bugs found: Publish all skipped this for a not-open song)
  if (wroteMid) await updateManifest(h, albums => manifestPlace(albums, null, key));
  if (hisMusic && doc) { if (isOpen) await filesMirror(); else await filesMirrorFor(key, doc, content).catch(() => {}); } // the iPad app: the Files copy follows every Publish, not just the open song's (Bugs found)

  markPublished(key, stamp, content, {midSig: doc ? midSig : undefined});
  return {wroteMid};
}
// clips are addressed only by filename — audioDirFor(key) derives WHERE they
// live from the song's own key, so a moved song's clips must physically move
// with it or every audio: reference resolves against an empty new directory
// (Bugs found 2026-09-30, moveComposition — the clip stayed at the old dir).
// Runs after publishSong, which may already have uploaded a locally-held clip
// straight to the new path (from this device's IndexedDB, via renameLocal's
// idbAudioMove) — skip those, never double-upload. Must throw on any failure
// BEFORE the caller's delete loop runs: the old clips are never removed out
// from under a song that still needs them (same "old song stays whole" rule
// as the publishSong failure path above).
export async function copyAudioClips(oldKey, newKey, h, report) {
  const files = await audioDirFiles(oldKey, h);
  for (const file of files) {
    try {
      const there = await readData("songs", audioDirFor(newKey) + "/" + file, true);
      if (there.ok) continue; // publishSong's uploadAudioClipsFor already put this one at the new path
    } catch (err) { /* not there yet — copy it below */ }
    const src = await readData("songs", audioDirFor(oldKey) + "/" + file, true);
    if (!src.ok) throw new Error(file + ": couldn't read the clip to copy it");
    const bytes = new Uint8Array(await src.arrayBuffer());
    report((folderActive() ? "writing " : "uploading ") + file + " (" + (bytes.length / 1e6).toFixed(1) + " MB)…");
    const r = await putMidAt(audioDirFor(newKey) + "/" + file, h, bytes); // same PUT shape: any bytes
    if (!r.ok) throw new Error(file + " HTTP " + r.status);
  }
  return files; // every clip that was at the old dir — the caller's delete loop removes them all next
}
export function discardPending(key, idx) { // drop one never-synced note from the stash
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "[]"); }
  catch (err) {}
  const [gone] = notes.splice(idx, 1);
  if (notes.length) localStorage.setItem("ff1roll-notes-" + key, JSON.stringify(notes));
  else localStorage.removeItem("ff1roll-notes-" + key);
  if (gone && key === S.songKey) { // it may be live in the open song — drop there too
    const k = S.rollnotes.findIndex(n => n.added && n.b1 === gone.b1 &&
      n.q1 === gone.q1 && n.text === gone.text);
    if (k >= 0) { S.rollnotes.splice(k, 1); finalizeNotes(); draw(); }
  }
  updateSyncBtn();
  renderSyncPending();
}
// The post-publish state update, for the open song and any other, alike
// (docs/provenance-plan.md P2 — Bugs found: Publish all never did any of
// this for a song that wasn't open, so its tombstones never cleared and its
// draft never learned it had been published). opts.keepDraft: annotations
// went up without the .mid (an analyzed song). opts.midSig: publishSong's
// baked signature of what it just wrote (or would have written) — stored
// separately from the legacy (un-baked) pubSig below, which several OTHER
// comparisons (draftDoc, pubCompareDraft, draftFingerprint) already agree on.
export function markPublished(key, stamp, content, opts) {
  opts = opts || {};
  clearTombstonesFor(key); // the pushed file IS the post-deletion state
  if (key === S.songKey && S.song) {
    S.rollnotes.forEach(n => n.added = false); // now canonical in the repo
    saveLocalNotes();
    // Pages deploys lag the commit by ~1 min; a reload in that window fetches
    // the PRE-sync file and the notes look gone. Keep the EXACT pushed content
    // as a bridge — loadNotes prefers it while fresh and the CDN disagrees.
    recordLastSync(key, content || serializeRollnotes());
    if (stamp) {
      S.song.savedStamp = stamp; // cross-device freshness beacon
      if (isComposition() && !opts.keepDraft) saveDraft(true); // draft now clean, based on this save
    }
    if (opts.midSig !== undefined) { // patch in the baked signature saveDraft(true) doesn't know about
      let d = null; try { d = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); } catch (err) { d = null; }
      if (d) { d.midSig = opts.midSig; try { draftWrite(key, d); } catch (err) {} }
    }
    S.lastSubtitle = undefined;
    updateSubtitle();
    draw();
  } else {
    recordLastSync(key, content || "");
    localStorage.removeItem("ff1roll-notes-" + key); // this device's local additions are now canonical in the repo file
    let d = null;
    try { d = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); } catch (err) { d = null; }
    if (d) {
      d.dirty = false;
      if (stamp) d.savedStamp = stamp;
      d.pubSig = musicSig({ppq: d.ppq, tracks: d.tracks, tempos: d.tempos}); // legacy, un-baked convention (see musicSig) — matters the next time this song is opened (openDraftDoc reads it)
      if (opts.midSig !== undefined) d.midSig = opts.midSig;
      try { draftWrite(key, d); } catch (err) { /* full: the next edit writes it */ }
    }
  }
}
export function markCurrentSongSynced(content, stamp, opts) { markPublished(S.songKey, stamp, content, opts); } // The ONE "ship everything" publish for the OPEN song, once it has a real
// folder path and hisMusic is true (isComposition()): ghsave's writing-mode
// branch below, and Publish-on-an-unsaved-song's continuation (fsgo, mode
// "publish", above) after saveSongAs has given it one. Returns the final
// status line; throws on failure (the .mid/annotations write itself) — the
// README/catalog refresh after are best-effort and never fail the publish.
export async function publishOpenComposition(h, report) {
  await publishSong(S.songKey, h, report);
  let readmeNote = "";
  try { await writeSongsReadme(h); } catch (err) { readmeNote = " (the repo's song list didn't update: " + err.message + ")"; } // the song is published either way
  await initCatalog().catch(() => {});
  updateSongBtn();
  renderSyncPending();
  return folderActive() ? "Published ✓ to " + fsRoot.name + " — song and annotations together."
                        : "Published ✓ — song and annotations together (Pages takes ~1 min)." + readmeNote;
}
// Publish on a song with no folder yet (lotion, 2026-10-03: Josh published
// "lotion" and only its annotations went anywhere — publishSong's hisMusic
// check is false for local/, which has no repo path to write a .mid to).
// Names it FIRST, via the SAME saveSongAs Save Version's first save already
// uses (renameLocalKeys carries the draft/notes/versions/origin — the one
// tested rename path, not a new one), THEN ships via publishOpenComposition
// — one publish function either way. A failure after the rename still
// leaves the song safely under its new name; Publish can just be tapped
// again. Called from fsgo's "publish"-mode branch (openSaveForm/below), and
// directly testable the same way saveSongAs already is.
export async function publishUnsavedSong(folder, name) {
  if (!(await saveSongAs(folder, name))) return false; // saveSongAs already explained why (e.g. a declined name clash) — nothing else happened, same as Save Version's own silent no-op here
  const token = writeToken(); // re-checked: openSyncSheet's gate already confirmed one before this sheet ever opened
  if (!token) { fileStatus("No GitHub token stored yet — add one in File → Settings. (Saved as " + songTitleOf(S.songKey) + " — Publish again once connected.)"); return false; }
  fileStatus("Publishing " + S.songKey + " (.mid + annotations)…");
  try {
    fileStatus(await publishOpenComposition(ghHeaders(token), m => fileStatus(m)));
    return true;
  } catch (err) {
    fileStatus("Publish failed: " + err.message + " (the song is saved under " + S.songKey + " — Publish again to retry)");
    return false;
  }
}
// sync every song with unsynced local notes, not just the loaded one — a key
// sweep touches many songs in one sitting and shouldn't strand work per-song.
// Publish all as a job (Josh's ask 4, 2026-09-29): one item per pending song
// (the general chat rides along as its own item, same as before) — the exact
// same per-song flow, just wrapped so it reports progress and can be
// cancelled between songs; the publish dialog is the same one folder
// publishes use. One Publish-all job at a time.
export function publishAllJobStart(statusFn, onlyKeys) { // onlyKeys: one row's Publish — the same flow for just those songs
  const pending = onlyKeys ? pendingSongs().filter(k => onlyKeys.includes(k)) : pendingSongs();
  if (!pending.length) { statusFn && statusFn("Nothing pending on this device."); return null; }
  if (jobsFind("publishall", null, true)) { statusFn && statusFn("A publish is already running — tap ⏳"); return null; }
  const items = pending.map(key => ({label: key === "general" ? "General chat" : songTitleOf(key), key}));
  const jobTitle = onlyKeys && pending.length === 1 ? "Publish " + items[0].label : "Publish all";
  return jobStart("publishall", jobTitle, items, async api => {
    const token = writeToken();
    if (!token) throw new Error("No GitHub token stored yet — add one in File → Settings.");
    const h = ghHeaders(token);
    let failed = 0, anyPublished = false;
    for (let i = 0; i < pending.length; i++) {
      if (api.aborted) { for (let j = i; j < pending.length; j++) api.update(j, {st: "cancelled"}); api.cancel(); return; }
      const key = pending[i], short = items[i].label;
      api.update(i, {st: "running", pct: 0});
      api.note("Publishing " + short + "…");
      try {
        if (key === "general") await askCommitLog(ghHeaders(token), ASK_GENERAL_KEY); // the general chat rides Publish all too — no song, so the one publish function doesn't apply
        else { await publishSong(key, h, m => api.note(short + ": " + m)); anyPublished = true; }
        api.update(i, {st: "done", pct: 1});
      } catch (err) {
        failed++;
        api.update(i, {st: "failed", msg: err.message});
      }
    }
    if (anyPublished) try { await writeSongsReadme(h); } catch (err) { /* never fatal for the publish itself — the README is best-effort */ } // once per job, not once per song (Bugs found, docs/provenance-plan.md)
    await initCatalog().catch(() => {});
    updateSyncBtn();
    updateSongBtn();
    renderSyncPending();
    const msg = failed ? failed + " of " + pending.length + " failed to publish" : "Published " + pending.length + " ✓";
    api.note(msg);
    statusFn && statusFn(msg);
    if (failed) throw new Error(msg);
  });
}
export async function fingerprintOldDrafts() {
  if (S.pubCheckRunning || LINK_SONGS) return;
  S.pubCheckRunning = true;
  let changed = false;
  const sheetOn = () => document.getElementById("syncsheet").classList.contains("on");
  if (sheetOn() && S.song) renderSyncPending(); // shows the "checking…" line
  try {
    for (const key of draftKeys()) {
      if (!syncable(key)) continue;
      let d = null; try { d = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); } catch (err) { d = null; }
      if (!d || !d.dirty) { pubCheck.delete(key); continue; }
      if (!d.tracks) { pubCheck.set(key, "not checked: its notes live in this device's database (an import)"); continue; }
      const r = await pubCompareDraft(key, d);
      changed = true;
      if (r.same) {
        pubCheck.delete(key);
        if (key === S.songKey && S.song) { S.song.pubSig = d.pubSig; S.song.savedStamp = d.savedStamp || S.song.savedStamp; updateSongBtn(); }
      } else pubCheck.set(key, r.text);
      logDebug("publish check " + key.split("/").pop() + ": " + (r.same ? "matches the published copy — off the list" : r.text));
    }
  } finally { S.pubCheckRunning = false; }
  updateSyncBtn();
  if (sheetOn() && S.song) renderSyncPending(); // the list as checked (and the "checking…" line gone)
}

// once per launch, a few seconds in (after the boot's own fetches): the
// Publish (N) count is right before the sheet is ever opened
export function initPublish1() {
  if (typeof window !== "undefined" && !LINK_SONGS) setTimeout(() => { fingerprintOldDrafts().catch(() => {}); }, 4000);
}

export function initPublish2() {
  JOB_KINDS.publish = {
    label: j => "Publish · " + j.title,
    open: j => openPubJobSheet(j), // the publish dialog (Josh, 2026-09-29: the old jump to File → Open → folder "brought me to a weird page")
    retry: j => { const keys = (j.keys || []).filter(k => importDraftKeys().includes(k)); if (!keys.length) { setInfo(j.title + ": nothing left to publish"); return; } const job = publishJobStart(j.slug, keys, setInfo); if (job) openPubJobSheet(job); },
  };
}

export function initPublish3() {
  JOB_KINDS.publishall = {
    label: j => j.title,
    open: j => openPubJobSheet(j),
    retry: j => { const job = publishAllJobStart(setInfo); if (job) openPubJobSheet(job); },
  };
}
