// Build albums/manifest.json by scanning albums/*/ for songs — the app's
// dropdown reads this, so adding music is: drop the file, run this, commit.
// Titles derive from filenames (kebab-case -> Title Case); an album's
// album.json supplies the album title, sort order, and per-song overrides
// for names the filename can't spell (apostrophes, custom labels).
// Run: node tools/build_manifest.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ALBUMS = path.join(ROOT, "albums");
const titleCase = base => base.split("-")
  .map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");

const albums = [];
function addAlbum(full, dirName) {
  const meta = existsSync(path.join(full, "album.json"))
    ? JSON.parse(readFileSync(path.join(full, "album.json"), "utf8")) : {};
  const songDir = existsSync(path.join(full, "songs")) ? path.join(full, "songs") : full;
  const rel = path.relative(ROOT, songDir);
  const songs = readdirSync(songDir).filter(f => f.endsWith(".mid")).map(f => {
    const base = f.replace(/\.mid$/, "");
    return {title: (meta.songs || {})[base] || titleCase(base), path: rel + "/" + f};
  }).sort((a, b) => a.title.localeCompare(b.title));
  if (songs.length) albums.push({title: meta.title || titleCase(dirName),
                                 order: meta.order ?? 99, songs});
}
// Any depth: every directory holding .mid files is an album (its songs/
// sub-folder, FF1's layout, counts as its own); nested folders are how the
// app groups things now ("just folders", docs/song-organization-proposal.md)
function walk(dir) {
  for (const sub of readdirSync(dir).sort()) {
    const full = path.join(dir, sub);
    if (!statSync(full).isDirectory() || sub === "songs") continue;
    addAlbum(full, sub);
    walk(full);
  }
}
walk(ALBUMS);
albums.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
for (const a of albums) delete a.order;
writeFileSync(path.join(ALBUMS, "manifest.json"), JSON.stringify(albums, null, 1) + "\n");
console.log("albums/manifest.json:", albums.map(a => a.title + " (" + a.songs.length + ")").join(", "));
