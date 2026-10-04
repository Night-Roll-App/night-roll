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
