import { songPathFromURL } from "../platform/base.js";
import { setDocTitle } from "../platform/base.js";
import { titleCaseSlug } from "../model/catalog.js";
import { restoreFolder } from "../platform/folder.js";
import { renderFolderUI } from "../ui/sheets.js";
import { initCatalog } from "../model/catalog.js";
import { cfg } from "../platform/storage.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { S } from "../state.js";
import { folderOnly } from "../platform/folder.js";
import { armAlbumLink } from "./album.js";
import { albumParamFromURL } from "../platform/base.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { reflectSongURL } from "./song.js";
import { loadSong } from "./song.js";
import { nativeOpenHook } from "../import/hub.js";
// src/session/boot.js (layer 4) — docs/split-phase2-plan.md step 12/§4: the
// app's boot. boot() (the old top-level boot IIFE, last thing main.js
// calls) and the few first-launch helpers only it reads. Song-lifecycle
// orchestration proper lives in session/song.js; this file is the one
// place that decides WHICH song a fresh launch opens.
// The first song a fresh device sees. Overworld on the web; the app edition
// ships only the starter albums (FF1 rips are not ours to sell), so a
// hardcoded path would fail there (Josh, 2026-09-27: "Couldn't open
// Overworld. Load failed" on the packaged shell's first launch).
export function homeSong(all) {
  const ow = "albums/nes/final-fantasy-i/songs/overworld.mid";
  return all.includes(ow) ? ow : (all[0] || ow);
}

export function initBoot1() {
  try {
    const q = typeof location !== "undefined" && songPathFromURL(location.href);
    if (q) setDocTitle(titleCaseSlug(q.split("/").pop().replace(/\.midi?$/i, "")));
  } catch (e) {}
}

export function boot() {
  (async function boot() {
    // boot watchdog (docs/split-plan.md §4 step 0b): the inline classic
    // script in index.html's <head> arms a 10s failsafe before any module
    // runs, for a module 404/syntax error that would otherwise leave a blank
    // screen. Reaching here proves the module graph loaded and boot() is
    // running, so the dangerous window has passed — clear it now, not at the
    // end of boot(), so a slow catalog fetch can never trip a false alarm.
    if (typeof window !== "undefined" && window.__nrBoot) { clearTimeout(window.__nrBoot); window.__nrBoot = null; }
    await restoreFolder(); // where data lives decides what the catalog holds
    renderFolderUI();
    try { await initCatalog(); }
    catch (e) {
      const b = cfg().songsBase || "(this site)";
      setInfo("catalog failed to load from " + b + " — check File → Settings, or serve over http: " + e.message);
      return;
    }
    const all = Object.values(S.CATALOG).flat().map(([, p]) => p);
    const qsong = typeof location !== "undefined" ? songPathFromURL(location.href) : null; // shared link wins — ?song= (old) or the path form
    const last = localStorage.getItem("ff1roll-lastsong");
    // drafts aren't in the manifest but are perfectly loadable (draft-wins path)
    const loadable = p => all.includes(p) || (p && localStorage.getItem("ff1roll-draft-" + p));
    if (folderOnly() && !qsong && !loadable(last)) { // his list, not Overworld: first of his songs, or a fresh one
      if (all.length) S.currentPath = all[0];
      else {
        setInfo("your folder has no songs yet — name one below and it lands there");
        document.getElementById("filenewform").style.display = "";
        document.getElementById("filesheet").classList.add("on");
        return;
      }
    } else S.currentPath = qsong ? qsong
      : loadable(last) ? last : homeSong(all);
    // album links (2026-09-29): a shared link can arm an album too (armAlbumLink)
    armAlbumLink(typeof location !== "undefined" ? albumParamFromURL(location.href) : null, S.currentPath);
    updateSongBtn();
    reflectSongURL(S.currentPath); // the address bar is the share link from the first frame: path form, never ?song=
    // a dead link (moved/renamed song in ?song= or a stale last-song) must not
    // strand you on a blank page: warn, then fall back to something that exists
    const bootFallback = why => {
      const fb = loadable(last) && last !== S.currentPath ? last : homeSong(all);
      setInfo("⚠ " + why + " — opening " + fb.split("/").pop() + " instead (the song may have moved: use Open…)");
      S.currentPath = fb;
      updateSongBtn();
      reflectSongURL(fb);
      return loadSong(fb);
    };
    const first = (qsong && !loadable(S.currentPath))
      ? bootFallback("that link's song isn't in the catalog: " + S.currentPath)
          .catch(e => setInfo("load failed — open via a web server (GitHub Pages): " + e.message))
      : loadSong(S.currentPath).catch(e => {
          if (/fetch failed/.test(e.message)) return bootFallback("couldn't load " + S.currentPath).catch(() => setInfo("load failed: " + e.message));
          setInfo("load failed — open via a web server (GitHub Pages): " + e.message);
        });
    first.finally(nativeOpenHook); // a file handed to the iPad app at launch opens over the first song, not under it
  })();
}
