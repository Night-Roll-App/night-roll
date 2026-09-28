// tools/import-set.mjs <zip|dir|file> --slug <slug> [--title "Game Title"]
//                      [--console nes|snes|game-boy] [--publish] [--secs N] [--out <root>]
//
// The app's Import → Capture all → Publish, from a terminal. Not a second
// pipeline: index.html's inline script runs in the vm harness
// (tests/harness.mjs) and THIS script only calls what a tap would —
// openPickedFiles (the picker's sniff: chip file + .m3u playlists, or a
// per-file .spc set), captureJobStart (one job, every listed track, the
// same impCapture per row) and commitImports (the .mid via writeMidi, the
// loop: rollnotes, album.json's nsf: block). Four seams are stubbed, and
// only because the vm has no browser: the chip modules are imported here
// and handed to chipModules.cache (the app dynamic-imports them off Pages),
// IndexedDB is a Map (idbNsfPutNow/idbNsfGet), fetch serves the local
// albums/ tree so a second batch merges album.json like the app's GET
// would, and batchCommit collects the batch instead of talking to GitHub.
// The fake clock is swapped for the real setTimeout (impCapture yields on
// it). Everything else — slugs, titles, loop notes, secs — is the app's.
//
// --publish uploads the chip files to the archive (cfg().nsfRepo, i.e.
// joshcough/nsf-archive) at the paths chipVaultFile would read them from,
// check-before-PUT, through `gh api` (no token handling here). Nothing is
// downloaded by this script and no chip file is ever written under the repo.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp } from "../tests/harness.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function parseArgs(argv) {
  const o = {src: null, slug: null, title: null, console: null, publish: false, secs: null, out: ROOT, quiet: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") o.slug = argv[++i];
    else if (a === "--title") o.title = argv[++i];
    else if (a === "--console") o.console = argv[++i];
    else if (a === "--publish") o.publish = true;
    else if (a === "--secs") o.secs = +argv[++i];
    else if (a === "--out") o.out = path.resolve(argv[++i]);
    else if (a === "--quiet") o.quiet = true;
    else if (!o.src) o.src = a;
    else throw new Error("unexpected argument " + a);
  }
  return o;
}

// The picker's list: [{name, bytes}] with bare file names (a zip's folders
// mean nothing to the app; the SPC set's order comes from the names).
export function gatherFiles(src) {
  const st = statSync(src);
  if (st.isFile() && /\.zip$/i.test(src)) {
    const tmp = mkdtempSync(path.join(tmpdir(), "nr-import-"));
    const r = spawnSync("unzip", ["-o", "-q", src, "-d", tmp], {encoding: "utf8"});
    if (r.status !== 0) throw new Error("unzip failed: " + (r.stderr || r.stdout));
    const files = gatherFiles(tmp);
    rmSync(tmp, {recursive: true, force: true});
    return files;
  }
  if (st.isFile()) return [{name: path.basename(src), bytes: new Uint8Array(readFileSync(src))}];
  const out = [];
  const walk = d => { for (const e of readdirSync(d).sort()) { const f = path.join(d, e); if (statSync(f).isDirectory()) walk(f); else if (!/^\./.test(e)) out.push({name: e, bytes: new Uint8Array(readFileSync(f))}); } };
  walk(src);
  return out;
}

// chipModules(kind) in the browser: CHIPS[kind].files (a "?" prefix means
// optional), then .shared merged last, then .own names re-won by the chip's
// module. The same assembly here, from the real modules on disk.
async function loadChipModules(app, kind) {
  const spec = JSON.parse(app.run("JSON.stringify({files: CHIPS[" + JSON.stringify(kind) + "].files, shared: CHIPS[" + JSON.stringify(kind) + "].shared, own: CHIPS[" + JSON.stringify(kind) + "].own})"));
  const imp = async (f, optional) => {
    const p = path.join(ROOT, "tools", f + ".mjs");
    if (optional && !existsSync(p)) return {};
    return {...(await import(pathToFileURL(p).href))};
  };
  const parts = await Promise.all(spec.files.map(f => f.startsWith("?") ? imp(f.slice(1), true) : imp(f, false)));
  const shared = await Promise.all(spec.shared.map(f => imp(f, false)));
  const M = Object.assign({}, ...parts, ...shared);
  for (const k of spec.own) for (const part of parts) if (part[k]) M[k] = part[k];
  return M;
}

export async function importSet(opts, log = console.log) {
  if (!opts.src) throw new Error("usage: import-set.mjs <zip|dir|file> --slug <slug> [--title T] [--console C] [--publish] [--secs N] [--out root]");
  if (!opts.slug) throw new Error("--slug is required");
  const loaded = gatherFiles(opts.src);
  if (!loaded.length) throw new Error("no files in " + opts.src);
  const app = createApp();
  const C = app.context;
  const kinds = JSON.parse(app.run("JSON.stringify(Object.keys(CHIPS))"));
  // the kind, sniffed as the picker would (the first chip file names it)
  C.__loaded = loaded;
  const kind = app.run("(() => { for (const f of __loaded) { const k = chipKindOf(f.bytes, f.name); if (k) return k; } return null; })()");
  if (!kind) throw new Error("no chip-music file recognized among " + loaded.length + " files (" + loaded.slice(0, 4).map(f => f.name).join(", ") + ")");
  if (!kinds.includes(kind)) throw new Error("unknown chip kind " + kind);
  const consoleName = JSON.parse(app.run("JSON.stringify(CONSOLE_OF)"))[kind];
  if (opts.console && opts.console !== consoleName) throw new Error("--console " + opts.console + " but the files are " + kind + " (" + consoleName + ")");

  // ---- the seams (see the header)
  C.setTimeout = setTimeout; C.clearTimeout = clearTimeout;
  const mods = {}; for (const k of [kind]) mods[k] = await loadChipModules(app, k);
  C.__mods = mods;
  app.run("chipModules.cache = Object.assign(chipModules.cache || {}, __mods)");
  const nsfStore = new Map();
  C.__nsfStore = nsfStore;
  app.run(`
    idbNsfPutNow = async (slug, bytes, trackPatch, chipKind, libs) => {
      const cur = __nsfStore.get(slug) || null;
      const rec = {bytes: bytes || (cur && cur.bytes), tracks: {...(cur ? cur.tracks : {}), ...(trackPatch || {})}, chip: chipKind || (cur && cur.chip) || "nsf"};
      if ((cur && cur.libs) || libs) rec.libs = {...((cur && cur.libs) || {}), ...(libs || {})};
      __nsfStore.set(slug, rec);
    };
    idbNsfGet = async slug => __nsfStore.get(slug) || null;
    initCatalog = async () => {};
    cfg().nsfRepo = ""; // the archive upload is this script's (gh api), not the app's fetch
    localStorage.setItem("ff1roll-ghtoken", "terminal");
  `);
  const infos = [];
  C.__info = s => infos.push(String(s));
  app.run("setInfo = s => __info(s)");
  C.__readRepo = p => { // the app's GETs of album.json and the manifest: the tree on disk (an empty manifest where none exists yet)
    const f = path.join(opts.out, p);
    if (existsSync(f)) return readFileSync(f).toString("base64");
    return p === "albums/manifest.json" ? Buffer.from("[]").toString("base64") : null;
  };
  app.run(`fetch = async (url) => {
    const m = /\\/contents\\/(.+?)\\?ref=main$/.exec(String(url));
    const b64 = m ? __readRepo(decodeURIComponent(m[1])) : null;
    if (b64 === null) return {ok: false, status: 404, json: async () => ({}), text: async () => ""};
    return {ok: true, status: 200, json: async () => ({content: b64, sha: "local"}), text: async () => atob(b64)};
  }`);
  const batch = [];
  C.__batch = files => batch.push(...files);
  app.run("batchCommit = async (which, files) => { __batch(files); }");

  // ---- Import…: the picker's sniff opens the capture panel
  await app.run("openPickedFiles(__loaded)");
  const sess = JSON.parse(app.run("JSON.stringify(nsfSess ? {chip: nsfSess.chip, name: nsfSess.nsf.name, artist: nsfSess.nsf.artist, songs: nsfSess.nsf.songs, list: nsfSess.trackList} : null)"));
  if (!sess) throw new Error("the app did not open an import session: " + (infos.filter(s => /⚠|could not/.test(s)).pop() || infos.pop() || "no message"));
  app.el("impslug").value = opts.slug;
  if (opts.secs) app.el("impsecs").value = String(opts.secs);
  log(`# ${sess.name || opts.slug}${sess.artist && sess.artist !== "<?>" ? " — " + sess.artist : ""} · ${sess.chip} · ${sess.list.length} track${sess.list.length === 1 ? "" : "s"} listed${sess.chip === "nsf" || sess.chip === "gbs" ? " of " + sess.songs + " slots" : ""} → albums/${consoleName}/${opts.slug}/`);

  // ---- Capture all: one job, in list order
  const t0 = Date.now();
  C.__statusLog = () => {};
  const jobId = app.run("(() => { const j = captureJobStart(nsfSess.trackList.map(x => x.n), __statusLog); return j ? j.id : null; })()");
  if (!jobId) throw new Error("captureJobStart refused (a job already live?)");
  const state = () => app.run("(jobs.find(j => j.id === " + JSON.stringify(jobId) + ") || {}).state");
  let lastDone = -1;
  const rows = [];
  while (state() === "running") {
    await new Promise(r => setTimeout(r, 200));
    const done = app.run("jobs.find(j => j.id === " + JSON.stringify(jobId) + ").items.filter(it => it.st !== 'queued' && it.st !== 'running').length");
    if (done !== lastDone) { lastDone = done; }
  }
  const items = JSON.parse(app.run("JSON.stringify(jobs.find(j => j.id === " + JSON.stringify(jobId) + ").items)"));
  const rowInfo = JSON.parse(app.run("JSON.stringify(nsfSess.trackList.map(e => { const r = nsfSess.rows[e.n]; return {n: e.n, title: r.name.value, st: r.st.textContent, warn: r.st.title || '', key: r.key || null, secs: r.secs || null}; }))"));
  for (let i = 0; i < rowInfo.length; i++) {
    const r = rowInfo[i], it = items[i];
    let notes = null;
    if (r.key) notes = app.run("(() => { const d = JSON.parse(localStorage.getItem(draftStoreKey(" + JSON.stringify(r.key) + ")) || 'null'); return d && d.tracks ? d.tracks.reduce((s, t) => s + t.notes.length, 0) : null; })()");
    const loop = r.key ? app.run("(() => { const a = JSON.parse(localStorage.getItem('ff1roll-notes-' + " + JSON.stringify(r.key) + ") || '[]'); const l = a.find(x => /^loop:/.test(x.text)); return l ? l.b1 + '.' + l.q1 + ' → ' + l.text.slice(6) : ''; })()") : "";
    const st = it.st === "done" ? "ok" : it.st;
    const line = `${String(r.n).padStart(3)}  ${(r.title || "").padEnd(40).slice(0, 40)}  ${st.padEnd(7)}  ${notes == null ? "" : String(notes).padStart(5) + " notes"}  ${r.secs ? r.secs.toFixed(1).padStart(6) + "s" : ""}  ${loop ? "loop " + loop : r.key ? "no loop" : ""}${it.st !== "done" && it.msg ? "  " + it.msg : ""}${r.warn ? "  ⚠ " + r.warn.split("\n").join(" · ") : ""}`;
    log(line.replace(/\s+$/, ""));
    rows.push({n: r.n, title: r.title, st: it.st, msg: it.msg, notes, secs: r.secs, loop, warn: r.warn, key: r.key});
  }
  const captured = rows.filter(r => r.st === "done");
  const capSecs = (Date.now() - t0) / 1000;
  log(`# captured ${captured.length}/${rows.length} in ${capSecs.toFixed(0)}s`);
  if (!captured.length) return {kind, console: consoleName, rows, files: [], published: [], captureSeconds: capSecs};

  // ---- Publish: commitImports assembles the batch, batchCommit (stubbed) hands it back
  const statuses = [];
  C.__status = s => statuses.push(String(s));
  await app.run("commitImports(__status, importDraftKeys().filter(k => k.split('/')[2] === " + JSON.stringify(opts.slug) + "))");
  const failed = statuses.find(s => /^Publish failed/.test(s));
  if (failed) throw new Error(failed);
  const written = [];
  for (const f of batch) {
    if (f.path === "albums/manifest.json") continue; // build_manifest.mjs is the manifest's writer on this side
    let text = f.text;
    if (f.path.endsWith("/album.json") && opts.title) { const meta = JSON.parse(text); meta.title = opts.title; text = JSON.stringify(meta, null, 1) + "\n"; }
    const full = path.join(opts.out, f.path);
    mkdirSync(path.dirname(full), {recursive: true});
    writeFileSync(full, f.b64 !== undefined ? Buffer.from(f.b64, "base64") : text);
    written.push(f.path);
  }
  log(`# wrote ${written.length} files under ${path.relative(process.cwd(), path.join(opts.out, "albums", consoleName, opts.slug)) || "."}`);

  // ---- the archive: the same paths the app reads chip audio from
  const published = [];
  const rec = nsfStore.get(opts.slug);
  const meta = JSON.parse(app.run("JSON.stringify(chipVaultMeta(" + JSON.stringify(opts.slug) + ", " + JSON.stringify(kind) + "))"));
  const uploads = [];
  if (rec && rec.bytes) uploads.push({file: meta.vault, bytes: rec.bytes});
  if (meta.perFile && rec && rec.tracks) for (const [base, t] of Object.entries(rec.tracks)) if (t && t.bytes && captured.some(r => r.key && r.key.endsWith("/" + base + ".mid"))) uploads.push({file: app.run("chipVaultFile(" + JSON.stringify(meta) + ", " + JSON.stringify(base) + ")"), bytes: t.bytes});
  if (opts.publish && uploads.length) {
    const repo = "joshcough/nsf-archive";
    for (const u of uploads) {
      const chk = spawnSync("gh", ["api", "repos/" + repo + "/contents/" + u.file, "--jq", ".sha"], {encoding: "utf8"});
      if (chk.status === 0) { published.push({file: u.file, st: "already there"}); continue; }
      const body = JSON.stringify({message: "archive: " + opts.slug, branch: "main", content: Buffer.from(u.bytes.buffer, u.bytes.byteOffset, u.bytes.byteLength).toString("base64")});
      const put = spawnSync("gh", ["api", "--method", "PUT", "repos/" + repo + "/contents/" + u.file, "--input", "-"], {input: body, encoding: "utf8"});
      published.push({file: u.file, st: put.status === 0 ? "uploaded" : "FAILED: " + (put.stderr || put.stdout).trim().split("\n")[0]});
    }
    for (const p of published) log(`# archive ${p.file}: ${p.st}`);
  } else if (uploads.length) log(`# archive: ${uploads.length} file${uploads.length === 1 ? "" : "s"} to upload with --publish (${uploads[0].file}${uploads.length > 1 ? ", …" : ""})`);
  return {kind, console: consoleName, rows, files: written, uploads: uploads.map(u => u.file), published, captureSeconds: capSecs, infos, statuses};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  importSet(opts).then(res => {
    if (opts.out === ROOT && res.files.length) {
      const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "build_manifest.mjs")], {encoding: "utf8"});
      process.stdout.write(r.stdout);
      if (r.status !== 0) { process.stderr.write(r.stderr); process.exitCode = 1; }
    }
    if (res.published.some(p => /FAILED/.test(p.st))) process.exitCode = 1;
  }, err => { console.error("import-set: " + (err && err.message || err)); process.exitCode = 1; });
}
