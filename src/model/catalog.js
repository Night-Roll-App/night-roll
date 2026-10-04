import { S } from "../state.js";
import { folderOnly } from "../platform/folder.js";
import { songsURL } from "../platform/storage.js";
import { EDITION } from "../edition.js";
import { LINK_SONGS } from "../platform/base.js";
import { albumMetaFor } from "./provenance.js";
import { folderActive } from "../platform/folder.js";
import { fsRoot } from "../platform/folder.js";
import { fsReadJSON } from "../platform/folder.js";
import { albumTitleFor } from "./provenance.js";

export function titleCaseSlug(base) {
  return base.split("-").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}
// ---- folders: where a song IS is a section (LOCAL · this device / PUBLISHED ·
// the repo); what it is called is its folder path (docs/song-organization-
// proposal.md, Josh 2026-09-27: "just folders … nothing special about drafts
// or sketches or my compositions"). Nothing moves on disk here: the tree is
// derived from the paths songs already have. Album titles from the catalog
// name the leaf folder; parents fall back to their segment.
export const FOLDER_NAMES = {nes: "NES", snes: "Super NES", n64: "Nintendo 64", "game-boy": "Game Boy", genesis: "Genesis",
                      ps1: "PlayStation", ps2: "PlayStation 2", imports: "Imports", local: "Not saved yet"};
export function folderOf(path) { // "albums/compositions/nightroll/x.mid" → "compositions/nightroll"; FF1's songs/ level collapses
  const parts = path.split("/"); parts.pop();
  if (parts[0] === "albums") parts.shift();
  if (parts.length > 1 && parts[parts.length - 1] === "songs") parts.pop();
  return parts.join("/");
}
export function albumFolders() { // folder → album title, from the catalog
  const m = {};
  for (const [title, songs] of Object.entries(S.CATALOG)) if (songs.length) m[folderOf(songs[0][1])] = title;
  return m;
}
export function folderTitle(folder) { // "imports/mega-man-2" → "Imports › Mega Man 2"
  if (!folder) return "Unfiled";
  const names = albumFolders();
  return folder.split("/").map((seg, i, a) => names[a.slice(0, i + 1).join("/")] || FOLDER_NAMES[seg] || titleCaseSlug(seg)).join(" › ");
}
export function segTitle(folder) { const seg = folder.split("/").pop(); return albumFolders()[folder] || FOLDER_NAMES[seg] || titleCaseSlug(seg); }
export function publishedPaths() { return Object.values(S.CATALOG).flat().map(([, p]) => p); }
export function groupOf(path) { const g = Object.entries(S.CATALOG).find(([, songs]) => songs.some(([, p]) => p === path)); return g ? g[0] : null; }
export function catalogHas(path) { return Object.values(S.CATALOG).some(songs => songs.some(([, p]) => p === path)); }

// built from albums/manifest.json at boot — the dropdown
// mirrors the albums/ directory; run tools/build_manifest.mjs after adding music
export async function initCatalog() {
  // site manifest + a scan of the local folder's albums/ (folder mode): the
  // union by path, folder titles winning. Either source alone is enough —
  // a folder user offline still gets their own songs.
  let site = [], siteErr = null, bundle = [];
  if (!folderOnly()) { // "my folder only": the site's albums stay out of the list entirely
    try {
      const res = await fetch(songsURL("albums/manifest.json") + "?t=" + Date.now(), {cache: "no-cache"});
      if (!res.ok) throw new Error("manifest fetch failed");
      site = await res.json();
    } catch (err) { siteErr = err; }
    if (EDITION === "app" && !LINK_SONGS) { // the bundled starters list even with the repo unreachable (offline launch)
      try { const res = await fetch("albums/manifest.json", {cache: "no-cache"}); if (res.ok) bundle = await res.json(); } catch (err) { /* no bundle: dev server */ }
    }
  }
  const local = LINK_SONGS ? [] : await folderScanAlbums();
  if (siteErr && !local.length && !bundle.length) throw siteErr;
  const next = {};
  for (const a of site) next[a.title] = a.songs.map(x => [x.title, x.path]);
  for (const a of bundle) { // adds what the repo lacks; repo titles win
    const list = next[a.title] || (next[a.title] = []);
    for (const s of a.songs) if (!list.some(([, p]) => p === s.path)) list.push([s.title, s.path]);
    list.sort((x, y) => x[0].localeCompare(y[0]));
  }
  for (const a of local) {
    const list = next[a.title] || (next[a.title] = []);
    for (const s of a.songs) {
      const hit = list.find(([, p]) => p === s.path);
      if (hit) hit[0] = s.title; else list.push([s.title, s.path]);
    }
    list.sort((x, y) => x[0].localeCompare(y[0]));
  }
  S.CATALOG = next;
  // every album's album.json, warmed now: isCaptureKey() reads the cache
  // synchronously (a capture album offered as a Move target otherwise —
  // seen in a screenshot, 2026-09-27). One small fetch per album, cached.
  for (const songs of Object.values(next)) if (songs.length) albumMetaFor(songs[0][1]).catch(() => {});
}

export async function folderScanAlbums() { // same shape as albums/manifest.json (tools/build_manifest.mjs)
  const out = [];
  if (!folderActive()) return out;
  let albums;
  try { albums = await fsRoot.handle.getDirectoryHandle("albums"); } catch (err) { return out; }
  const addAlbum = async (dir, dirName, rel) => {
    const meta = (await fsReadJSON(dir, "album.json")) || {};
    let songDir = dir, songRel = rel;
    try { songDir = await dir.getDirectoryHandle("songs"); songRel = rel + "/songs"; } catch (err) { /* flat album */ }
    const songs = [];
    for await (const [name, h] of songDir.entries()) {
      if (h.kind !== "file" || !/\.mid$/i.test(name)) continue;
      const base = name.replace(/\.mid$/i, "");
      songs.push({title: (meta.songs || {})[base] || titleCaseSlug(base), path: songRel + "/" + name});
    }
    songs.sort((a, b) => a.title.localeCompare(b.title));
    // a fresh folder has no album.json yet: the app's own album names
    // (Night Roll Sketches / My Compositions / imports) still apply by path
    const title = meta.title || (songs.length && albumTitleFor(songs[0].path)) || titleCaseSlug(dirName);
    if (songs.length) out.push({title, order: meta.order ?? 99, songs});
  };
  for await (const [name, h] of albums.entries()) {
    if (h.kind !== "directory") continue;
    await addAlbum(h, name, "albums/" + name);
    for await (const [sub, sh] of h.entries()) { // a subdirectory with songs (or its own album.json) is its own album
      if (sh.kind !== "directory" || sub === "songs") continue;
      await addAlbum(sh, sub, "albums/" + name + "/" + sub);
    }
  }
  out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return out;
}
