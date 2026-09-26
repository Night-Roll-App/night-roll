// tests/pwa.test.mjs — the installable layer: manifest, icons, service worker.
// Static checks only (the worker itself runs in a browser); they catch the
// footguns: a precache entry that does not exist, a manifest that is not JSON,
// the two manifests confused, the page not pointing at either.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {spawnSync} from "node:child_process";

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
  assert.match(html, /serviceWorker\.register\(new URL\("sw\.js", APP_BASE\)/);
  assert.match(html, /PERF_FLAGS\.get\("sw"\) === "0"/, "kill switch present");
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
});
