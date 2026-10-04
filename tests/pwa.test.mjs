// tests/pwa.test.mjs — the installable layer: manifest, icons, service worker.
// Static checks only (the worker itself runs in a browser); they catch the
// footguns: a precache entry that does not exist, a manifest that is not JSON,
// the two manifests confused, the page not pointing at either.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {appSource} from "./harness.mjs";

const root = new URL("../", import.meta.url);
const read = p => readFileSync(new URL(p, root), "utf8");

test("PWA: app.webmanifest is valid, its icons exist, and it is not the song catalog", () => {
  const m = JSON.parse(read("app.webmanifest"));
  assert.equal(m.name, "Night Roll"); assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "./"); assert.equal(m.scope, "./"); // relative: the app lives under /night-roll/ on Pages
  assert.ok(m.icons.length >= 3);
  for (const i of m.icons) assert.ok(existsSync(new URL(i.src, root)), "icon exists: " + i.src);
  assert.ok(m.icons.some(i => i.purpose === "maskable"));
  assert.ok(!("version" in m) && !("notes" in m), "not albums/manifest.json's shape");
});

test("PWA: index.html links the manifest and the apple metadata", () => {
  const html = read("index.html");
  assert.match(html, /<link rel="manifest" href="app\.webmanifest">/);
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  // the registration code itself lives in src/platform/sw.js (docs/
  // split-phase2-plan.md step 12): appSource() is index.html plus every
  // src/**/*.js concatenated, so this finds it wherever it lives.
  const js = appSource();
  assert.match(js, /serviceWorker\.register\(new URL\("sw\.js", S\.APP_BASE\)/);
  assert.match(js, /PERF_FLAGS\.get\("sw"\) === "0"/, "kill switch present");
});

test("PWA: the stylesheet ships offline — index.html links css/app.css (its only stylesheet, no inline <style> left; docs/split-plan.md §4 step 16), sw.js precaches it and routes css/ network-first like src/, and the file is the real CSS", () => {
  const html = read("index.html");
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
  assert.deepEqual(links, ["css/app.css"]);
  assert.doesNotMatch(html, /<style[\s>]/, "no inline <style> block — every rule lives in css/app.css");
  assert.ok(html.indexOf('href="css/app.css"') < html.indexOf("<script"), "the stylesheet is linked before the first script, so it is render-blocking and nothing paints unstyled");
  assert.ok(existsSync(new URL("css/app.css", root)));
  const css = read("css/app.css");
  assert.match(css, /^\s*:root \{/, "starts with the :root token block index.html's <style> did");
  assert.match(css, /\.sheet\.help \.hsec\.on\{display:block\}\s*$/, "ends where the old <style> block ended");
  const sw = read("sw.js");
  const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/\s+/g, " "));
  assert.ok(list.includes("css/app.css"), "precached, so an offline launch is styled");
  assert.match(sw, /rel\.startsWith\("src\/"\) \|\| rel\.startsWith\("css\/"\) \|\| rel\.startsWith\("help\/"\)/, "css/ and help/ take the src/ branch: network-first, HTTP cache bypassed, never cache-first");
});

test("PWA: the Help sheet opens offline — help/help.html (docs/plans/2026-10-04-help-out.md) is the file the loader fetches, precached, and routed network-first like src/", () => {
  assert.ok(existsSync(new URL("help/help.html", root)));
  assert.match(appSource(), /HELP_URL = "help\/help\.html"/, "src/ui/notes.js fetches exactly the precached path");
  const sw = read("sw.js");
  const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/\s+/g, " "));
  assert.ok(list.includes("help/help.html"), "precached, so Help opens offline on a fresh install");
  assert.match(sw, /rel\.startsWith\("help\/"\)/, "help/ is network-first with cache fallback, never cache-first");
});

test("PWA: sw.js parses, precaches only files that exist, never the soundfonts", () => {
  const r = spawnSync(process.execPath, ["--check", new URL("sw.js", root).pathname], {encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr);
  const sw = read("sw.js");
  const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/\s+/g, " "));
  for (const p of list) assert.ok(p === "./" || existsSync(new URL(p, root)), "precache entry exists: " + p);
  assert.ok(!list.some(p => p.includes("soundfonts")), "soundfonts are cached on first use, never precached");
  assert.match(sw, /req\.mode === "navigate"/);
  assert.match(sw, /url\.origin !== self\.location\.origin\) return/, "cross-origin passes through");
  assert.match(sw, /function warmSongs/, "every catalog song is warmed into the cache");
  assert.match(sw, /const copy = r\.clone\(\);[\s\S]*await r\.json\(\)/, "the manifest response is cloned before it is read");
  assert.match(sw, /e\.data === "warm"/, "the page can ask for a warm pass");
});
