import { S } from "../state.js";
import { albumMetaCache } from "./provenance.js";
import { folderOf } from "./catalog.js";

// "game" the moment an album HAS track data (albumHasTrackData gates it)
export function setAlbumOrderPref(mode) {
  S.albumOrderPref = mode === "az" ? "az" : "game";
  localStorage.setItem("ff1roll-albumorder", S.albumOrderPref);
}
export function slugOfPath(path) { return path.split("/").pop().replace(/\.mid$/i, ""); }
export function albumTrackMap(album) { // slug -> {track, disc} for this album's songs, from the warmed album.json cache (albumMetaFor, at boot) — or null if it hasn't loaded yet / has none
  const songs = S.CATALOG[album];
  if (!songs || !songs.length) return null;
  const meta = albumMetaCache["albums/" + folderOf(songs[0][1])];
  return (meta && meta.nsf && meta.nsf.tracks) || null;
}
export function albumHasTrackData(album) { // gates the switch: hidden when the album has no track numbers at all
  const tracks = albumTrackMap(album);
  return !!tracks && Object.values(tracks).some(t => t && t.track != null);
}
// songs: [[title, path], ...] for ONE album; returns a NEW array, reordered.
// mode "game": disc, then track (tools/album-order.mjs's own sort key); a
// song with no track number sorts after every numbered one. mode "az" (or
// an album with no track data at all): alphabetical by title, same as before
// this feature shipped.
export function albumOrder(album, songs, mode) {
  const tracks = mode === "game" ? albumTrackMap(album) : null;
  const key = ([, p]) => {
    const t = tracks && tracks[slugOfPath(p)];
    return t && t.track != null ? [0, t.disc || 0, t.track] : [1, 0, 0];
  };
  return songs.slice().sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return a[0].localeCompare(b[0]); // ties (both untracked, or same track number) fall back to title
  });
}
export function albumEffectiveOrder(album) { // CATALOG[album], reordered per the current pref — "az" when the album has no track data, so the order never silently changes
  const songs = S.CATALOG[album];
  if (!songs) return songs;
  return albumOrder(album, songs, albumHasTrackData(album) ? S.albumOrderPref : "az");
}
export function albumOrderControl(album, onChange) { // the "Game order | A–Z" segmented switch — only built when albumHasTrackData(album) is true
  const seg = document.createElement("div");
  seg.className = "seg albumorderseg";
  seg.setAttribute("role", "radiogroup");
  seg.setAttribute("aria-label", "Song order");
  seg.style.margin = "6px 4px";
  for (const [mode, label] of [["game", "Game order"], ["az", "A–Z"]]) {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(S.albumOrderPref === mode));
    b.classList.toggle("active", S.albumOrderPref === mode);
    b.addEventListener("click", () => { if (S.albumOrderPref !== mode) { setAlbumOrderPref(mode); onChange(); } });
    seg.appendChild(b);
  }
  return seg;
}
