import { S } from "../state.js";
import { albumEffectiveOrder } from "../model/album-order.js";
import { ALBUM_PASSES } from "../audio/transport.js";
import { albumStrip } from "../audio/transport.js";
import { reflectSongURL } from "./song.js";
import { playSec } from "../audio/transport.js";
import { openMaster } from "../audio/engine.js";
import { chipActive } from "../audio/chip.js";
import { songHasAudio } from "../model/song.js";
import { stop } from "../audio/transport.js";
import { play } from "../audio/transport.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { albumPrevIdx } from "../audio/transport.js";
import { albumNextIdx } from "../audio/transport.js";
import { rememberLastSong } from "../platform/base.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { loadSong } from "./song.js";
import { ALBUM_MAX_FAILS } from "../audio/transport.js";
import { updateChipBtnImpl as updateChipBtn } from "../ui/chrome.js";
import { chip } from "../audio/chip.js";
import { audioReady } from "../audio/clips.js";
import { playGateWait } from "../audio/transport.js";

export function albumPos(path) { // which album holds this song, and where
  for (const [album, list] of Object.entries(S.CATALOG)) {
    const idx = list.findIndex(([, p]) => p === path);
    if (idx >= 0) return {album, list, idx};
  }
  return null;
}
export function armAlbumLink(album, path) { // ?album= at boot: arm the run WITHOUT playing (no autoplay
  // without a tap) — an unknown album, or a song not actually in its list, is a
  // silent no-op (the song still opens). play() reads albumRun however it got
  // set, so the first ▶ counts passes and advances exactly like albumStart's.
  if (!album || !S.CATALOG[album]) return;
  const list = albumEffectiveOrder(album); // the shown order (game or A–Z) — WYSIWYG
  const idx = list.findIndex(([, p]) => p === path);
  if (idx < 0) return;
  S.albumRun = {album, list, idx, passes: ALBUM_PASSES, gen: 0};
  albumStrip();
}
export function albumClear() { // the run is over; whatever is playing keeps playing
  if (!S.albumRun) return;
  S.albumRun = null; S.albumEndAbs = null;
  try { localStorage.removeItem("ff1roll-lastalbum"); } catch (err) { /* private mode */ }
  albumStrip();
  reflectSongURL(S.currentPath); // the link drops the album param — just this song again
}
export function albumLeave() { // ✕: keep this song, drop its ending
  if (!S.albumRun) return;
  const at = S.playing ? playSec() : null;
  albumClear();
  if (at === null) return;
  if (S.albumFading) { S.albumFading = false; openMaster(); }
  if (chipActive() || songHasAudio()) { stop(); play(at, {noCountIn: true}); } // the chip source (and any clip) has a stop() scheduled it can't unschedule: restart in place
  setInfo("left the album — this song loops on its own now");
}
export async function albumStart(album, idx) {
  const list = S.CATALOG[album] && albumEffectiveOrder(album); // the shown order (game or A–Z) — WYSIWYG
  if (!list || !list[idx]) return;
  S.albumRun = {album, list, idx, passes: ALBUM_PASSES, gen: 0};
  albumStrip();
  await albumPlayIdx(idx);
}
export function albumNext() { if (S.albumRun) albumPlayIdx(S.albumRun.idx + 1); }
export function albumPrev() { if (S.albumRun) albumPlayIdx(albumPrevIdx(S.albumRun.idx, S.albumRun.list.length)); }
export async function albumPlayIdx(idx) {
  const run = S.albumRun;
  if (!run) return;
  idx = albumNextIdx(idx, run.list.length); // past either end: wrap
  run.idx = idx;
  const gen = ++run.gen; // any later start/skip supersedes this one
  const [title, path] = run.list[idx];
  S.currentPath = path;
  rememberLastSong(path);
  reflectSongURL(path);
  updateSongBtn();
  albumStrip();
  const stale = () => S.albumRun !== run || run.gen !== gen;
  try { await loadSong(path); }
  catch (err) {
    // a failed load skips, but only so far: when every load fails (offline, a
    // rate-limited fetch) the skips cascaded through the whole album in a
    // second with nothing playing (Josh, 2026-09-28, Chrono Trigger)
    run.failures = (run.failures || 0) + 1;
    if (stale()) return;
    if (run.failures >= ALBUM_MAX_FAILS) {
      albumClear();
      setInfo("⚠ album stopped: " + ALBUM_MAX_FAILS + " songs in a row wouldn't load — last: " + title + ": " + err.message);
      return;
    }
    setInfo("couldn't load " + title + " — skipping: " + err.message);
    return albumPlayIdx(idx + 1);
  }
  if (stale()) return;
  run.failures = 0;
  if (S.song && S.song.notesReady) await S.song.notesReady; // the loop: directive must be in before play() reads it
  if (stale()) return;
  await updateChipBtn(); // kicks the console render when there is one
  if (chip.rendering === S.songKey && chip.renderPromise) { // worth the wait: the chip is the real sound
    setInfo("rendering the console's voice for " + title + "…");
    await Promise.race([chip.renderPromise, new Promise(r => setTimeout(r, 15000))]);
    if (stale()) return;
  }
  if (songHasAudio()) { // same wait for a take's decode, or its first pass plays silent
    await Promise.race([audioReady(), new Promise(r => setTimeout(r, 15000))]);
    if (stale()) return;
  }
  await playGateWait(15000); // instruments too: the same gate ▶ shows
  if (stale()) return;
  await play(0, {noCountIn: true});
}
export function albumAdvanceImpl() { // from the scheduler timer, once the pass count is spent; idempotent
  const run = S.albumRun;
  if (!run || run.advancing) return;
  run.advancing = true;
  stop();
  run.advancing = false;
  if (S.albumRun === run) albumPlayIdx(run.idx + 1);
}

export function initAlbum1() {
  document.getElementById("albumprev").addEventListener("click", albumPrev);
  document.getElementById("albumnext").addEventListener("click", albumNext);
  document.getElementById("albumleave").addEventListener("click", albumLeave);
}
