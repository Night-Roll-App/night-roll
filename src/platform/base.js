import { S } from "../state.js";
import { idbDraftMove } from "./storage.js";

/* ============================================================================
   NIGHT ROLL — one file, by design (tests extract this script; no build step).
   Rough chapter map (line numbers drift — grep the banner text):
     MIDI PARSE / WRITE ............ parseMidi, writeMidi, deriveNoteTypes
     ANNOTATION MODEL .............. noteToJSON, resolveNote, finalizeNotes
     SONG LOAD / SAVE / DRAFTS ..... loadSong, setSong, saveDraft, revert
     ROLL DRAWING .................. draw, drawRuler, drawRangeTints
     GESTURE LAYER ................. pointerdown/move/up, hold-to-grab, pinch
     SELECTION EDITING ............. selEditApply, nudge, copy/paste, divide
     AUDIO ENGINE .................. ensureAudio, play, scheduleNote, drumHit
     SCORE VIEW .................... buildScoreModel, drawScore, engraving
     INSTRUMENT PANEL .............. drawInst, guitar fretboard, fall
     UI CHROME ..................... menus (File/Edit/View), chips, sheets
     DRUMMER ....................... drGenerate, DR_FILLS, take chips
     SYNC / REPO ................... putRollnotes, commit, vault, catalog
   ========================================================================= */
// Tab title and link preview name the song: "Threnody · Night Roll". Set
// synchronously from ?song= before any fetch, so a preview fetcher that runs
// scripts (Messages does) sees the song and not the app; refined once the
// catalog supplies the display title. The static <title> stays "Night Roll"
// for fetchers that don't run scripts (Josh, 2026-09-07).
export function setDocTitle(name) {
  const t = name ? name + " · Night Roll" : "Night Roll";
  document.title = t;
  const og = typeof document.querySelector === "function" && document.querySelector('meta[property="og:title"]');
  if (og) og.setAttribute("content", t);
}
// ?songs=owner/repo (or a full base URL) — a shared link to a song in someone
// ELSE's repo (Josh, 2026-09-26: "any of my users … publish their songs to
// GitHub and send links to people"). For this page load, songs and annotations
// are read from there; nothing is written, nothing is remembered: the link is
// a listening room, not a settings change. The player stays this site.
export function linkSongsBase(v) {
  if (!v) return null;
  v = String(v).trim();
  if (/^https?:\/\//.test(v)) return v.replace(/\/+$/, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(v)) return "https://raw.githubusercontent.com/" + v + "/main";
  return null;
}
export const LINK_SONGS = (() => { try { return linkSongsBase(new URL(location.href).searchParams.get("songs")); } catch (e) { return null; } })();
export function linkRepoLabel(base) { const m = /^https:\/\/raw\.githubusercontent\.com\/([\w.-]+\/[\w.-]+)\/main$/.exec(base || ""); return m ? m[1] : (base || ""); }
export function rememberLastSong(key) { if (!LINK_SONGS) localStorage.setItem("ff1roll-lastsong", key); }
// a linked song is not "where you left off"
// File ▾ → Open Recent (2026-10-01): a device-local "songs you've had open"
// list — {key, title} so the menu never needs the catalog just to show a
// title (title is read once, at push time, via songTitleOf — its own
// fallback to the filename already covers a catalog that hasn't loaded).
// Pushed once from setSong() (the one place every real open — loadSongInner,
// openDraftDoc, createComposition, forkCurrentSong — converges), same choke
// point rememberLastSong above already uses for "where you left off". A
// linked song (LINK_SONGS) or an unsaved/Untitled one (isUnsaved: key starts
// "local/") never joins the list — reopening one later makes no sense to
// "recent" into a menu meant for songs with a real home.
export const RECENT_KEY = "ff1roll-recent", RECENT_MAX = 10;
export function recentSongs() { // this device's list, newest first — never throws on a corrupt/missing value
  try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
export function saveRecentSongsRaw(list) { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); }
export function clearRecentSongs() { saveRecentSongsRaw([]); }
// "Just folders" (2026-09-27, docs/song-organization-proposal.md): the corpora
// moved under console folders in one batch. Old links and every per-song key
// on a device follow by prefix (boot, fourth wave). Keep this table forever:
// a device that never loaded this build still holds the old keys.
export const MOVED_DIRS = {"albums/final-fantasy-i/": "albums/nes/final-fantasy-i/",
                    "albums/imports/mega-man-2/": "albums/nes/mega-man-2/",
                    "albums/imports/tmnt-2/": "albums/nes/tmnt-2/",
                    "albums/imports/chrono-trigger/": "albums/snes/chrono-trigger/",
                    "albums/imports/final-fantasy-legend/": "albums/game-boy/final-fantasy-legend/"};
export function movedPath(p) { for (const [a, b] of Object.entries(MOVED_DIRS)) if (p.startsWith(a)) return b + p.slice(a.length); return null; }
export function songPathFromURL(href) { // "albums/…/x.mid" from ?song= (either form) or the path form; null if neither
  try {
    const u = new URL(href);
    let p = u.searchParams.get("song");
    if (!p && S.APP_BASE && u.href.startsWith(S.APP_BASE)) p = decodeURIComponent(u.href.slice(S.APP_BASE.length).split(/[?#]/)[0]);
    if (!p || !/^albums\/[\w\-./]+$/.test(p)) return null;
    p = /\.midi?$/i.test(p) ? p : p + ".mid";
    return movedPath(p) || p;
  } catch (e) { return null; }
}
export function songShareURL(path, base) { // the address-bar form for an albums/ path
  return new URL(path.replace(/\.midi?$/i, ""), base || S.APP_BASE).href;
}
export function albumParamFromURL(href) { // ?album=<CATALOG name> on a shared/boot link — null if absent or unparseable
  try { return new URL(href).searchParams.get("album"); } catch (e) { return null; }
}
// -------------------------------------------------------- perf experiments
// Two URL flags, off by default, that exist to ANSWER a question rather than
// to be features. Josh's iPad blocks the main thread ~100-220ms repeatedly
// while the app's own JS accounts for under 2% of wall clock and nothing in
// the heap grows — so the cost is not in our code, and the next suspects are
// both about how much canvas memory this page asks a WKWebView for.
//   ?dpr=1    render at 1x instead of the device's 2x. The roll canvas goes
//             from 2752x1294 (14MB of backing store) to a quarter of that.
//   ?scene=0  drop the playback scene cache — one canvas instead of two, at
//             the cost of a full redraw per frame. The cache was added as a
//             CPU win (39c551a); on a memory-tight browser that trade can
//             invert, which is exactly the kind of regression Josh remembers.
// Both report themselves in the perf report so a pasted report is never
// ambiguous about which build produced it.
export const PERF_FLAGS = (() => { // hand-rolled: the vm test sandbox has no
  try {                       // URLSearchParams and no location
    const q = String(location.search || "").replace(/^\?/, "");
    const map = {};
    for (const kv of q.split("&")) { if (!kv) continue; const i = kv.indexOf("="); 
      map[i < 0 ? kv : kv.slice(0, i)] = i < 0 ? "" : decodeURIComponent(kv.slice(i + 1)); }
    return {get: k => (k in map ? map[k] : null)};
  } catch (err) { return {get: () => null}; }
})();
export const PERF_NOSCENE = PERF_FLAGS.get("scene") === "0";

export function initBase1() {
  try {
    if (S.APP_BASE && document.head && !document.querySelector("base")) {
      const b = document.createElement("base"); b.href = S.APP_BASE;
      document.head.insertBefore(b, document.head.firstChild);
    }
  } catch (e) {}
}

export function initBase2() {
  (function migrateAlbumPaths() {
    const remap = v => v.replace(/^(ff1roll-(?:notes|edits|ts)-)?midi\//, "$1albums/final-fantasy-i/songs/")
                       .replace(/^(ff1roll-(?:notes|edits|ts)-)?compositions\//, "$1albums/compositions/");
    for (const k of Object.keys(localStorage)) {
      if (!/^ff1roll-(notes|edits|ts)-(midi|compositions)\//.test(k)) continue;
      const nk = remap(k);
      if (!localStorage.getItem(nk)) localStorage.setItem(nk, localStorage.getItem(k));
      localStorage.removeItem(k);
    }
    const last = localStorage.getItem("ff1roll-lastsong");
    if (last && /^(midi|compositions)\//.test(last))
      rememberLastSong(remap(last));
    // second wave (same day): ff1 filename prefix dropped, multiword names hyphenated
    const SONGS = "albums/final-fantasy-i/songs/";
    const RENAME = {ff1corneliacastle: "cornelia-castle", ff1gurguvolcano: "gurgu-volcano",
      ff1matouyascave: "matoyas-cave", ff1chaostemple: "chaos-temple",
      ff1floatingcastle: "floating-castle", ff1underwaterpalace: "underwater-palace",
      ff1gameover: "game-over"};
    const remap2 = v => v.replace(new RegExp("(" + SONGS.replace(/[/]/g, "\\/") + ")ff1([a-z]+)(\\.mid)"),
      (all, pre, base, ext) => pre + (RENAME["ff1" + base] || base) + ext);
    for (const k of Object.keys(localStorage)) {
      if (!/^ff1roll-(notes|edits|ts)-/.test(k) || !k.includes(SONGS + "ff1")) continue;
      const nk = remap2(k);
      if (nk !== k) {
        if (!localStorage.getItem(nk)) localStorage.setItem(nk, localStorage.getItem(k));
        localStorage.removeItem(k);
      }
    }
    const last2 = localStorage.getItem("ff1roll-lastsong");
    if (last2 && last2.includes(SONGS + "ff1"))
      rememberLastSong(remap2(last2));
    // third wave (2026-09-23, Josh's cleanup): two of his songs moved — every
    // per-song key rides along so no device shows an orphan draft
    const MOVED = {"albums/compositions/nightroll/town-theme.mid": "albums/compositions/nightroll/carnival.mid",
                   "albums/compositions/KeyChangeTest-07-26.mid": "albums/compositions/nightroll/KeyChangeTest-07-26.mid"};
    for (const k of Object.keys(localStorage)) {
      const m = k.match(/^(ff1roll-(?:notes|edits|ts|draft|tombs|lastsync)-)(.+)$/);
      if (!m || !MOVED[m[2]]) continue;
      const nk = m[1] + MOVED[m[2]];
      if (!localStorage.getItem(nk)) localStorage.setItem(nk, localStorage.getItem(k));
      localStorage.removeItem(k);
    }
    const last3 = localStorage.getItem("ff1roll-lastsong");
    if (last3 && MOVED[last3]) rememberLastSong(MOVED[last3]);
    // fourth wave (2026-09-27, "just folders"): whole folders moved under console
    // folders — every per-song key follows by prefix (MOVED_DIRS, defined with the
    // link parser); a capture's draft from imports/ is stamped as a capture so
    // it stays read-only (its new folder no longer says so by name)
    for (const k of Object.keys(localStorage)) {
      const m = k.match(/^(ff1roll-(?:notes|edits|ts|draft|tombs|lastsync|save|stash|ask)-)(.+)$/);
      if (!m) continue;
      const np = movedPath(m[2]);
      if (!np) continue;
      let v = localStorage.getItem(k);
      if (m[1] === "ff1roll-draft-" && m[2].startsWith("albums/imports/")) {
        try { const d = JSON.parse(v); if (d && typeof d === "object") { d.capture = true; v = JSON.stringify(d); } } catch (err) { /* keep as is */ }
        if (typeof idbDraftMove === "function") idbDraftMove(m[2], np); // big drafts keep their notes in IndexedDB
      }
      if (!localStorage.getItem(m[1] + np)) localStorage.setItem(m[1] + np, v);
      localStorage.removeItem(k);
    }
    const last4 = localStorage.getItem("ff1roll-lastsong");
    if (last4 && movedPath(last4)) rememberLastSong(movedPath(last4));
  })();
}
