import { S } from "../state.js";

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
