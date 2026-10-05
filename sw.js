// sw.js — Night Roll's service worker (Phase 0 of the iPad app plan, 2026-09-26).
//
// Job: make Add-to-Home-Screen a real app — launch offline, keep working
// without a network, never serve a stale index.html when a network exists.
//
// Strategy, by request type (same-origin only; every other origin — GitHub's
// API, model servers, the WebLLM CDN — passes straight through untouched):
//   navigations (the page itself)      network-first, 4 s, else the cached
//                                      index.html — so a path-form song link
//                                      opens offline too
//   src/**, css/app.css, help/**        network-first, 4 s, HTTP cache bypassed;
//                                      the entry modules, the stylesheet and
//                                      the Help sheet's body precached so an
//                                      offline launch styles, boots and can
//                                      open Help (see the src/ note below)
//   vendor/vexflow.js, manifest, icons  cache-first, precached at install
//   vendor/ai/web/*.js                  cache-first, precached at install —
//                                      pinned by tools/ai-sync.mjs (AI_LIB),
//                                      unlike src/ below: a vendored library
//                                      file never changes without a new sync,
//                                      which bumps AI_LIB and so the cache
//                                      name, so cache-first can't go stale
//   vendor/soundfonts/*                 cache-first, cached ON FIRST USE
//                                      (83 MB — never precached; iOS quota)
//   albums/** and albums/manifest.json  network-first with cache fallback,
//                                      the ?t= cache-buster ignored; EVERY
//                                      catalog song is warmed into the cache
//                                      after activate and on each online boot
//                                      (~1.2 MB), so any song opens offline
//   sw.js / 404.html                    never intercepted
//
// One cache, versioned by SW_VERSION; activating a new version drops the old
// cache. The page can kill the whole thing with ?sw=0 (unregister + clear).
// A stale-index footgun is avoided by design: index.html is only ever served
// from cache when the network failed or timed out.

const SW_VERSION = "nr-v44"; // bumped: src/ask/actions.js joins APP_MODULES (the act tool); nr-v43 = src/ui/study-sheet.js joins APP_MODULES (the Analysis sheet); nr-v42 = src/ask/annotate.js joins APP_MODULES (✦ Annotate this song…); nr-v41 = src/ui/vellane.js (the velocity lane, DAW F4) joins APP_MODULES; nr-v40 = vendor/ai/web/window.js joins AI_MODULES (AI library step 6); nr-v39 = client.js (step 5); nr-v38 = store/ctx-cache/bridge-client/attach (step 4); nr-v37 = backends.js (step 3, docs/ai-library-plan.md §4); nr-v36 = src/theory/facts/* and src/theory/harmony/* join APP_MODULES (docs/theory-toolkit.md); nr-v35 = quiz/ + privacy.html bypass the worker; nr-v34 = help/help.html
const AI_LIB = "dfef7e7"; // vendor/ai's library sha, set by tools/ai-sync.mjs — turns the SW cache over whenever the library does
const CACHE = "night-roll-" + SW_VERSION + "-" + AI_LIB;
// APP_MODULES: every file under src/ (docs/split-plan.md §4 step 0b, §3.6
// rule 8) — index.html's modulepreload list, this list, devtools.js's
// mirrored-module imports, and the real src/ file listing must all describe
// the same set (tests/modules.test.mjs enforces it); a module missing here
// means a 404 offline instead of a silent fallback.
const APP_MODULES = ["src/edition.js", "src/devtools.js", "src/main.js", "src/state.js", "src/ui/icons.js", "src/ui/controls.js", "src/ui/piano.js", "src/midi/parse.js", "src/midi/write.js", "src/theory/chords.js", "src/theory/key.js", "src/theory/facts/common.js", "src/theory/facts/pattern.js", "src/theory/facts/form.js", "src/theory/facts/melody.js", "src/theory/facts/rhythm.js", "src/theory/facts/bass.js", "src/theory/facts/voices.js", "src/theory/facts/format.js", "src/theory/harmony/roman.js", "src/theory/harmony/cadence.js", "src/theory/harmony/nct.js", "src/theory/harmony/modulation.js", "src/model/catalog.js", "src/model/grid.js", "src/model/edits.js", "src/model/rollnotes.js", "src/platform/base.js", "src/platform/mode.js", "src/platform/storage.js", "src/platform/folder.js", "src/platform/native.js", "src/audio/engine.js", "src/audio/voices.js", "src/audio/transport.js", "src/audio/chip.js", "src/audio/chip-stream.js", "src/audio/clips.js", "src/audio/metronome.js", "src/audio/bounce.js", "src/model/song.js", "src/model/selection.js", "src/model/provenance.js", "src/model/album-order.js", "src/model/versions.js", "src/model/jobs.js", "src/import/hub.js", "src/import/capture.js", "src/sync/publish.js", "src/gen/drummer.js", "src/gen/bassist.js", "src/gen/analysis.js", "src/render/roll.js", "src/render/tracks.js", "src/render/score.js", "src/render/score-print.js", "src/render/instrument.js", "src/render/cof.js", "src/render/compare.js", "src/input/gestures.js", "src/input/record.js", "src/input/keyboard.js", "src/ask/backend.js", "src/ask/tools.js", "src/ask/actions.js", "src/ask/context.js", "src/ask/bridge.js", "src/ask/shots.js", "src/ask/sheet.js", "src/ask/client.js", "src/ask/host.js", "src/ask/annotate.js", "src/ui/chrome.js", "src/ui/trackbar.js", "src/ui/mixer.js", "src/ui/voice-menu.js", "src/ui/notes.js", "src/ui/note-editor.js", "src/ui/study-sheet.js", "src/ui/sheets.js", "src/ui/wm.js", "src/ui/vellane.js", "src/hooks.js", "src/wire.js", "src/session/song.js", "src/session/album.js", "src/session/files.js", "src/session/boot.js", "src/ui/perf.js", "src/platform/sw.js"];
// AI_MODULES: vendor/ai/web/*.js (docs/ai-library-plan.md §1) — every file
// tools/ai-sync.mjs vendored under vendor/ai/web/, kept equal to
// vendor/ai/files.json's web/ entries AND index.html's modulepreload ∩
// vendor/ai (tests/modules.test.mjs's extended rule 8). Precached (unlike
// src/, which is network-first) because it's pinned, not live-edited.
const AI_MODULES = ["vendor/ai/web/index.js", "vendor/ai/web/sse.js", "vendor/ai/web/backends.js", "vendor/ai/web/store.js", "vendor/ai/web/ctx-cache.js", "vendor/ai/web/bridge-client.js", "vendor/ai/web/attach.js", "vendor/ai/web/client.js", "vendor/ai/web/window.js"];
// AI_MODULES' entries are repeated here as literal strings rather than
// spread in, the same way APP_MODULES' entries above are: tests/pwa.test.mjs
// JSON.parses this array's own source text verbatim, which a spread
// (`...AI_MODULES`) isn't.
const PRECACHE = ["./", "index.html", "css/app.css", "help/help.html", "vendor/vexflow.js", "app.webmanifest",
                  "src/edition.js", "src/devtools.js", "src/main.js",
                  "vendor/ai/web/index.js", "vendor/ai/web/sse.js", "vendor/ai/web/backends.js", "vendor/ai/web/store.js", "vendor/ai/web/ctx-cache.js", "vendor/ai/web/bridge-client.js", "vendor/ai/web/attach.js", "vendor/ai/web/client.js", "vendor/ai/web/window.js",
                  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async p => { // one missing file must not fail the install
      try { const r = await fetch(new Request(p, {cache: "reload"})); if (r.ok) await c.put(p, r); } catch (err) { /* offline install: filled on first online run */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("night-roll-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
    warmSongs(); // in the background — never gates activation
  })());
});

// Every song in the catalog is small (all albums together: ~1.2 MB of .mid +
// .rollnotes.json + album.json). Josh installed the app, went into airplane
// mode, and a song he had not opened yet just hung (2026-09-26): songs must
// be there before they are opened. Fetch what the catalog lists and keep what
// is not cached yet; the page asks for another pass on every online boot.
let warming = null;
function warmSongs() {
  if (warming) return warming;
  warming = (async () => {
    try {
      const c = await caches.open(CACHE);
      const r = await fetch(new Request("albums/manifest.json", {cache: "no-cache"}));
      if (!r.ok) return;
      const copy = r.clone(); // clone BEFORE reading: a consumed body cannot be cloned
      const manifest = await r.json();
      await c.put("albums/manifest.json", copy).catch(() => {});
      const paths = new Set();
      (function walk(v) { if (typeof v === "string") { if (/\.midi?$/i.test(v) && v.startsWith("albums/")) paths.add(v); } else if (v && typeof v === "object") Object.values(v).forEach(walk); })(manifest);
      const wanted = new Set();
      for (const mid of paths) {
        wanted.add(mid); wanted.add(mid.replace(/\.midi?$/i, ".rollnotes.json"));
        const dir = mid.slice(0, mid.lastIndexOf("/")); wanted.add(dir + "/album.json"); wanted.add(dir.slice(0, dir.lastIndexOf("/")) + "/album.json");
      }
      let n = 0;
      for (const rel of wanted) {
        const key = new URL(rel, self.registration.scope).href;
        if (await c.match(key)) continue;
        try { const f = await fetch(new Request(key, {cache: "no-cache"})); if (f.ok) { await c.put(key, f); n++; } } catch (err) { /* offline mid-warm: next pass */ }
      }
    } catch (err) { /* offline at install: the page asks again when online */ }
    finally { warming = null; }
  })();
  return warming;
}

const stripBust = url => { const u = new URL(url); u.searchParams.delete("t"); return u.href; };

async function networkFirst(req, {timeout, key, fallback, noStore, revalidate}) {
  const c = await caches.open(CACHE);
  try {
    const ctl = new AbortController();
    const timer = timeout ? setTimeout(() => ctl.abort(), timeout) : null;
    // revalidate: the browser's own HTTP cache must not answer for the page
    // itself — it did, and a reload showed the previous build (2026-09-26)
    const r = await (revalidate ? fetch(req.url, {cache: "no-cache", credentials: "same-origin", signal: ctl.signal}) : fetch(req, {signal: ctl.signal}));
    if (timer) clearTimeout(timer);
    if (r.ok && key && !noStore) c.put(key, r.clone()).catch(() => {}); // a full quota must not fail the response
    return r;
  } catch (err) {
    const hit = (key && await c.match(key)) || (fallback ? await c.match(fallback) : null);
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req, key) {
  const c = await caches.open(CACHE);
  const hit = await c.match(key);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) c.put(key, r.clone()).catch(() => {});
  return r;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const rel = url.pathname.slice(scope.pathname.length);
  if (rel === "sw.js" || rel === "404.html") return;
  // quiz/ and privacy.html are their own pages, not the app: a navigation
  // to either must never take the branch below, whose c.put under the key
  // "index.html" would overwrite the cached APP SHELL with that page and the
  // app would open the quiz offline (docs/plans/2026-10-04-quiz.md, U3)
  if (rel === "privacy.html" || rel.startsWith("quiz/")) return;
  if (req.mode === "navigate") {
    // A path-form song link (…/albums/x/song) is served online by Pages'
    // 404.html, which redirects into the app as ?song=. Offline we must do
    // the same redirect ourselves: serving index.html AT that path would make
    // the app take the song's directory for its own (APP_BASE) and every
    // relative fetch would miss.
    const songForm = rel.startsWith("albums/") && !/\.[a-z0-9]+$/i.test(rel);
    e.respondWith((async () => {
      try { return await networkFirst(req, {timeout: NAV_TIMEOUT_MS, key: songForm ? null : "index.html", fallback: null, noStore: songForm, revalidate: true}); }
      catch (err) {
        if (songForm) { const q = new URLSearchParams(url.search); q.set("song", rel.replace(/\/+$/, "") + ".mid"); return Response.redirect(scope.href + "?" + q.toString() + url.hash, 302); }
        const c = await caches.open(CACHE);
        return (await c.match("index.html")) || (await c.match("./")) || Response.error();
      }
    })());
    return;
  }
  if (rel.startsWith("vendor/soundfonts/")) { e.respondWith(cacheFirst(req, stripBust(req.url))); return; }
  // vendor/ai/web/: cache-first, like vendor/vexflow.js — safe because AI_LIB
  // is part of CACHE's name, so a library sync always lands in a fresh cache
  // instead of serving a stale vendored file under the old one.
  if (rel.startsWith("vendor/ai/web/") || rel === "vendor/vexflow.js" || rel === "app.webmanifest" || rel.startsWith("icons/")) { e.respondWith(cacheFirst(req, rel)); return; }
  // src/ (docs/split-plan.md §4 step 0b): network-first like the page itself,
  // not cache-first like the other precached assets — Pages' max-age=600 on
  // index.html would otherwise let a browser serve a NEW index.html (which
  // always points at the same src/main.js URL) alongside STALE cached
  // modules from the previous deploy. revalidate bypasses the HTTP cache too
  // (the index.html navigation handler above hit the same bug once, 2026-09-26).
  // css/ (docs/split-plan.md §4 step 16) is the same case: index.html always
  // links the same css/app.css URL, so a stale cached sheet would style a new
  // page with the previous deploy's rules. help/ (docs/plans/2026-10-04-
  // help-out.md) likewise: the Help sheet's body is fetched by a fixed URL
  // and must describe THIS deploy's features.
  if (rel.startsWith("src/") || rel.startsWith("css/") || rel.startsWith("help/")) { e.respondWith(networkFirst(req, {timeout: NAV_TIMEOUT_MS, key: rel, revalidate: true})); return; }
  if (rel.startsWith("albums/")) { e.respondWith(networkFirst(req, {timeout: 0, key: stripBust(req.url)})); return; }
  // anything else same-origin (tools/nsf, docs): network, cache as a courtesy
  e.respondWith(networkFirst(req, {timeout: 0, key: stripBust(req.url)}));
});

self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
  if (e.data === "warm") warmSongs();
});
