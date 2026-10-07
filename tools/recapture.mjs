// tools/recapture.mjs — re-capture published chip albums from their archived
// rips and say, song by song, whether the new capture may replace the old
// (docs/plans/2026-10-06-capture-fidelity-audit.md §5 and §8).
//
//   node tools/recapture.mjs [--console nes] [--album <console>/<slug>|<slug>] [--out /tmp/recap] [--timeout 1800]
//       dry run (the default): fetch, capture, diff, report. Writes ONLY under
//       --out: rips/ (download cache — nothing downloads twice), out/<console>/
//       <album>/<base>.mid (the new captures), work/ (one JSON per album),
//       logs/, report.json + report.md (built from every album in work/).
//   node tools/recapture.mjs --apply --album <console>/<slug> [--out /tmp/recap]
//       copies one album's planned replacements from the report into albums/.
//
// The rip comes from where the app gets it: album.json's nsf block names the
// archive file(s) (chipVaultFile; a set's extra chip files and libraries),
// read from the public Night-Roll-App/nsf-archive. Each download is checked
// by its HTTP status, its byte count against Content-Length, and the chip's
// magic — never by a JSON field (a 404's body parses fine).
// The capture is the app's own: the import session tools/import-set.mjs
// opens in the vm (openImportSession → captureJobStart → commitImports), so
// the new .mid went through parse → draft → writeMidi exactly as a publish
// would. One row per album track, named by its published base; a playlist's
// lengths are not archived, so a NES/GB track gets the app's no-playlist
// sizing (75 s, one 300 s retry when no loop), except a published capture
// of 22 s or less, which is sized as the playlist jingle it was (len = its
// published secs: window ⌈2.5·len+4⌉, no retry). Tagged sets (SPC, PSF,
// PSF2, USF) size from the file's own tags, as in the app. FF1 is built by
// tools/nsf/dump-all.mjs (its verified bar counts), run with --out.
//
// Verdicts are tools/capture-diff.mjs's. Planned action per song:
//   SAME → skip · VELOCITY / ADDED-TRACK → replace · MOVED with no published
//   annotations → replace · MOVED with annotations → keep the old song and
//   add the new one as "<title> (re-capture)" (Josh, 2026-10-06, §8.3) ·
//   a changed loop point on a song without annotations → hold (its loop
//   line lives in the .rollnotes.json, which this tool never writes).
// Annotations = any .rollnotes.json entry other than the capture's loop.
//
// Hard allowlist: --apply writes only .mid/.notes.txt/album.json inside
// albums/{nes,game-boy,snes,ps1,ps2,n64}/<slug>/, never under compositions/
// or starters/, never a .rollnotes.json, never deletes, never overwrites a
// file it did not plan to (a published .mid must still be the one the
// report diffed — sha256 checked). Each replaced track gets album.json
// nsf.tracks[base].cap = {v, code}; git keeps every old file.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diffFiles, loopOfRollnotes } from "./capture-diff.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SELF = fileURLToPath(import.meta.url);
export const CONSOLES = ["nes", "game-boy", "snes", "ps1", "ps2", "n64"]; // capture albums; compositions/starters are Josh's and never listed
export const CAPTURE_VERSION = 1; // album.json cap.v stamped by --apply; raise with capture v2 (§4)
const ARCHIVE_RAW = "https://raw.githubusercontent.com/Night-Roll-App/nsf-archive/main/";
const EXT = {nsf: ".nsf", gbs: ".gbs", spc: ".spc", psf: ".psf", psf2: ".psf2", usf: ".usf", vgm: ".vgm"};
const MAGIC = {
  nsf: b => b.length > 5 && String.fromCharCode(...b.subarray(0, 5)) === "NESM\x1a",
  gbs: b => b.length > 4 && String.fromCharCode(...b.subarray(0, 3)) === "GBS",
  spc: b => b.length > 27 && String.fromCharCode(...b.subarray(0, 27)) === "SNES-SPC700 Sound File Data",
  psf: b => b.length > 4 && b[0] === 0x50 && b[1] === 0x53 && b[2] === 0x46,
};
MAGIC.psf2 = MAGIC.usf = MAGIC.psf;
const sha = b => createHash("sha256").update(b).digest("hex");
const titleCase = base => base.split("-").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
const PERFILE = new Set(["spc", "psf", "psf2", "usf", "vgm"]);

// ---------------------------------------------------------------- albums
export function listAlbums({consoleName = null, album = null} = {}) {
  const out = [];
  for (const c of CONSOLES) {
    if (consoleName && c !== consoleName) continue;
    const dir = path.join(ROOT, "albums", c);
    if (!existsSync(dir)) continue;
    for (const slug of readdirSync(dir).sort()) {
      const id = c + "/" + slug;
      if (album && album !== id && album !== slug) continue;
      const aj = path.join(dir, slug, "album.json");
      if (!existsSync(aj)) continue;
      const meta = JSON.parse(readFileSync(aj, "utf8"));
      if (!meta.nsf || !meta.nsf.vault || !meta.nsf.tracks) continue;
      out.push({id, console: c, slug, dir: path.join(dir, slug), meta, chip: meta.nsf.chip || (/\.gbs$/i.test(meta.nsf.vault) ? "gbs" : "nsf")});
    }
  }
  return out;
}
const songDirOf = a => existsSync(path.join(a.dir, "songs")) ? path.join(a.dir, "songs") : a.dir;

// ---------------------------------------------------------------- the archive
// {file, url, status, size, expected, cached, ok, why, path}
export async function fetchVault(file, cacheRoot, kind) {
  const dest = path.join(cacheRoot, file);
  const rec = {file, url: ARCHIVE_RAW + file.split("/").map(encodeURIComponent).join("/"), path: dest};
  const okMagic = b => !kind || !MAGIC[kind] || MAGIC[kind](b);
  if (existsSync(dest) && existsSync(dest + ".ok")) {
    const b = new Uint8Array(readFileSync(dest)), want = +readFileSync(dest + ".ok", "utf8");
    if (b.length > 0 && b.length === want && okMagic(b)) return {...rec, status: "cache", size: b.length, expected: want, cached: true, ok: true};
  }
  let r;
  try { r = await fetch(rec.url); } catch (err) { return {...rec, status: 0, size: 0, ok: false, why: "network: " + err.message}; }
  const b = new Uint8Array(await r.arrayBuffer());
  const expected = r.headers.get("content-length") != null ? +r.headers.get("content-length") : null;
  const out = {...rec, status: r.status, size: b.length, expected, cached: false};
  if (r.status !== 200) return {...out, ok: false, why: "HTTP " + r.status};
  if (!b.length) return {...out, ok: false, why: "empty file"};
  if (expected != null && expected !== b.length) return {...out, ok: false, why: "size " + b.length + " ≠ Content-Length " + expected};
  if (!okMagic(b)) return {...out, ok: false, why: "not a " + kind + " file (magic)"};
  mkdirSync(path.dirname(dest), {recursive: true});
  writeFileSync(dest, b);
  writeFileSync(dest + ".ok", String(b.length));
  return {...out, ok: true};
}

// what the picker would have been handed: [{name, bytes, base?, vault}]
export function vaultFilesOf(a) {
  const nsf = a.meta.nsf, files = [];
  if (PERFILE.has(a.chip)) {
    for (const [base, tr] of Object.entries(nsf.tracks)) {
      const v = tr && tr.vault ? tr.vault : nsf.vault + base + EXT[a.chip];
      files.push({vault: v, name: base + EXT[a.chip], base, kind: a.chip});
    }
    for (const l of nsf.libs || []) files.push({vault: nsf.vault + l.file, name: l.name, lib: true});
  } else {
    files.push({vault: nsf.vault, name: "0-" + nsf.vault.split("/").pop(), kind: a.chip, main: true}); // first by name: the album's vault
    const extra = new Set(Object.values(nsf.tracks).filter(t => t && t.vault).map(t => t.vault));
    for (const v of extra) files.push({vault: v, name: v.split("/").pop().replace(/^[^.]+\./, ""), kind: a.chip}); // "game-boy/tetris.dmg-tra-1.gbs" → "dmg-tra-1.gbs"
  }
  return files;
}

// published annotations of one song: {count, types, loop}
export function annotationsOf(rnPath) {
  if (!existsSync(rnPath)) return {count: 0, types: {}, loop: null};
  const text = readFileSync(rnPath, "utf8");
  const types = {};
  try {
    const j = JSON.parse(text);
    for (const n of j.notes || []) if (n.type !== "loop") types[n.type || "note"] = (types[n.type || "note"] || 0) + 1;
  } catch (err) { // legacy text: every non-comment, non-anchor line that isn't the loop
    for (const l of text.split("\n")) { const s = l.trim(); if (s && !s.startsWith("#") && !/^\[.*\]$/.test(s) && !/^loop:/.test(s)) types.text = (types.text || 0) + 1; }
  }
  return {count: Object.values(types).reduce((x, y) => x + y, 0), types, loop: loopOfRollnotes(text)};
}

export function planAction(verdict, annotations, oldLoop, newLoop) {
  if (!verdict) return "none";
  if (verdict === "SAME") return "skip";
  if (verdict === "VELOCITY" || verdict === "ADDED-TRACK") return "replace";
  if (annotations > 0) return "keep-old+add-new";
  return (oldLoop || null) !== (newLoop || null) ? "hold-loop-changed" : "replace";
}

// ---------------------------------------------------------------- one album (child process)
async function captureGeneric(a, fetched, outDir, log) {
  const { openImportSession, runCaptureJob } = await import("./import-set.mjs");
  const loaded = fetched.filter(f => f.bytes).map(f => ({name: f.name, bytes: f.bytes}));
  const {app, C, batch} = await openImportSession(loaded, {out: path.join(outDir, ".import-root"), console: a.console});
  app.el("impslug").value = a.slug;
  const songDir = songDirOf(a);
  const tracks = Object.entries(a.meta.nsf.tracks).map(([base, tr]) => ({base, tr: typeof tr === "number" ? {n: tr} : tr}));
  // the row for each album track: per-file sets by the file itself, one-file
  // kinds by slot inside the file the track names
  C.__want = tracks.map(({base, tr}) => {
    const f = fetched.find(x => PERFILE.has(a.chip) ? x.base === base : (tr.vault ? x.vault === tr.vault : x.main));
    return {base, n: tr.n, fileName: f ? f.name : null, perFile: PERFILE.has(a.chip),
      len: !PERFILE.has(a.chip) && tr.secs && tr.secs <= 22 ? tr.secs : 0};
  });
  C.__loadedByName = Object.fromEntries(loaded.map(f => [f.name, f.bytes]));
  const rowIds = JSON.parse(app.run(`JSON.stringify(__want.map(w => {
    const rows = nsfSess.rows;
    for (let id = 1; id < rows.length; id++) {
      const r = rows[id]; if (!r) continue;
      const hit = w.perFile ? r.bytes === __loadedByName[w.fileName]
        : r.slot === w.n && (w.fileName && w.fileName.startsWith("0-") ? !r.srcName : r.srcName === w.fileName);
      if (hit) {
        r.name.value = w.base;
        const e = (nsfSess.trackList || []).find(x => x.n === id);
        if (e && !w.perFile) e.len = w.len;
        return id;
      }
    }
    return null;
  }))`));
  const ns = rowIds.filter(x => x != null);
  const t0 = Date.now();
  const items = ns.length ? await runCaptureJob(app, ns) : [];
  log(`  captured ${items.filter(i => i.st === "done").length}/${ns.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const rowInfo = JSON.parse(app.run(`JSON.stringify(${JSON.stringify(ns)}.map(id => { const r = nsfSess.rows[id]; return {id, key: r.key || null, secs: r.secs || null, st: r.st.textContent, warn: r.st.title || ""}; }))`));
  const keys = rowInfo.filter(r => r.key).map(r => r.key);
  if (keys.length) {
    C.__status = () => {};
    C.__keys = keys;
    await app.run("commitImports(__status, __keys)");
  }
  const songs = [];
  tracks.forEach(({base, tr}, i) => {
    const id = rowIds[i];
    const s = {base, n: tr.n, pubSecs: tr.secs ?? null};
    if (id == null) { songs.push({...s, capture: "no-row", why: "no import row matched this track (file " + (C.__want[i].fileName || "missing") + ", slot " + tr.n + ")"}); return; }
    const it = items[ns.indexOf(id)], ri = rowInfo[ns.indexOf(id)];
    s.capture = it ? it.st : "not-run"; s.warn = ri.warn || undefined; s.newSecs = ri.secs;
    if (it && it.msg) s.why = it.msg;
    if (!ri.key) { songs.push(s); return; }
    if (ri.key.split("/").pop() !== base + ".mid") s.renamedKey = ri.key; // the app chose a different base (collision)
    const f = batch.find(x => x.path === ri.key);
    if (!f) { songs.push({...s, capture: "no-file", why: "commitImports wrote no .mid for " + ri.key}); return; }
    const outMid = path.join(outDir, base + ".mid");
    writeFileSync(outMid, Buffer.from(f.b64, "base64"));
    s.newMid = outMid;
    // the loop annotation the publish would write, read back from that same file
    const rn = batch.find(x => x.path === ri.key.replace(/\.mid$/, ".rollnotes.json"));
    s.newLoop = rn ? loopOfRollnotes(rn.text) : null;
    songs.push(s);
  });
  return songs;
}

async function captureFF1(a, fetched, outDir, log) {
  const { dumpFF1 } = await import("./nsf/dump-all.mjs");
  const res = await dumpFF1({nsfPath: fetched.find(f => f.main).path, outDir, log});
  return Object.entries(a.meta.nsf.tracks).map(([base, tr]) => {
    const r = res.find(x => x.name === base);
    return r ? {base, n: tr.n, pubSecs: tr.secs ?? null, capture: "done", newMid: r.mid, newLoop: r.loop, pipeline: "dump-all (" + r.tempoSrc + " " + r.bpm + "bpm)"}
             : {base, n: tr.n, capture: "no-row", why: "not in dump-all's TRACKS"};
  });
}

export async function recaptureAlbum(a, outRoot, log = console.log) {
  const outDir = path.join(outRoot, "out", a.console, a.slug);
  mkdirSync(outDir, {recursive: true});
  const res = {id: a.id, console: a.console, slug: a.slug, chip: a.chip, title: a.meta.title || titleCase(a.slug), startedAt: new Date().toISOString(), fetch: [], songs: []};
  const want = vaultFilesOf(a);
  for (const f of want) {
    const r = await fetchVault(f.vault, path.join(outRoot, "rips"), f.lib ? null : f.kind);
    res.fetch.push({file: r.file, status: r.status, size: r.size, expected: r.expected, cached: r.cached, ok: r.ok, why: r.why});
    if (r.ok) { f.bytes = new Uint8Array(readFileSync(r.path)); f.path = r.path; }
  }
  const failed = res.fetch.filter(f => !f.ok);
  if (failed.length) log(`  ⚠ ${failed.length} file(s) failed to fetch: ${failed.map(f => f.file + " (" + f.why + ")").join(", ")}`);
  if (!want.some(f => f.bytes && !f.lib)) { res.error = "no rip fetched"; return res; }
  const songs = a.slug === "final-fantasy-i" && a.console === "nes" // the one album dump-all builds (§5: its verified bar counts decide FF1's bars)
    ? await captureFF1(a, want, outDir, log) : await captureGeneric(a, want, outDir, log);
  const songDir = songDirOf(a);
  for (const s of songs) {
    s.title = (a.meta.songs || {})[s.base] || titleCase(s.base);
    const oldMid = path.join(songDir, s.base + ".mid");
    const ann = annotationsOf(path.join(songDir, s.base + ".rollnotes.json"));
    s.annotations = ann.count; s.annotationTypes = ann.types; s.oldLoop = ann.loop;
    if (!existsSync(oldMid)) { s.verdict = null; s.action = "none"; s.why = (s.why ? s.why + "; " : "") + "no published .mid"; continue; }
    s.oldMid = path.relative(ROOT, oldMid); s.oldSha = sha(readFileSync(oldMid));
    if (!s.newMid) { s.verdict = null; s.action = "none"; continue; }
    try {
      const d = diffFiles(oldMid, s.newMid, {oldLoop: ann.loop, newLoop: s.newLoop || null});
      Object.assign(s, {verdict: d.verdict, reasons: d.reasons, firstBar: d.firstBar, bars: d.bars, gained: d.gained, lost: d.lost});
      s.newSha = sha(readFileSync(s.newMid));
    } catch (err) { s.verdict = null; s.why = "diff failed: " + err.message; }
    s.action = planAction(s.verdict, s.annotations, s.oldLoop, s.newLoop);
    if (s.action === "keep-old+add-new") { s.addBase = s.base + "-recapture"; s.addTitle = s.title + " (re-capture)"; }
  }
  res.songs = songs;
  res.code = (spawnSync("git", ["rev-parse", "--short", "HEAD"], {cwd: ROOT, encoding: "utf8"}).stdout || "").trim() || null;
  res.finishedAt = new Date().toISOString();
  return res;
}

// ---------------------------------------------------------------- report
const VERDICTS = ["SAME", "VELOCITY", "ADDED-TRACK", "MOVED"];
export function buildReport(works) {
  const byConsole = {};
  const problems = {fetch: [], crash: [], capture: []};
  for (const w of works) {
    const c = byConsole[w.console] = byConsole[w.console] || {albums: 0, songs: 0, SAME: 0, VELOCITY: 0, "ADDED-TRACK": 0, MOVED: 0, failed: 0, actions: {}};
    c.albums++;
    for (const f of w.fetch || []) if (!f.ok) problems.fetch.push({album: w.id, file: f.file, status: f.status, size: f.size, why: f.why});
    if (w.error) problems.crash.push({album: w.id, why: w.error});
    for (const s of w.songs || []) {
      c.songs++;
      if (s.verdict) c[s.verdict]++; else { c.failed++; problems.capture.push({album: w.id, song: s.base, capture: s.capture, why: s.why || ""}); }
      c.actions[s.action] = (c.actions[s.action] || 0) + 1;
    }
  }
  return {generatedAt: new Date().toISOString(), byConsole, problems, albums: works};
}

export function reportMarkdown(rep) {
  const L = ["# Re-capture dry run", "", "Generated " + rep.generatedAt + " by tools/recapture.mjs. Nothing under albums/ was written.", "",
    "| Console | Albums | Songs | SAME | VELOCITY | ADDED-TRACK | MOVED | no verdict |", "|---|---|---|---|---|---|---|---|"];
  for (const [c, x] of Object.entries(rep.byConsole)) L.push(`| ${c} | ${x.albums} | ${x.songs} | ${x.SAME} | ${x.VELOCITY} | ${x["ADDED-TRACK"]} | ${x.MOVED} | ${x.failed} |`);
  L.push("", "## Problems", "");
  if (!rep.problems.fetch.length && !rep.problems.crash.length && !rep.problems.capture.length) L.push("None.");
  for (const p of rep.problems.fetch) L.push(`- fetch ${p.album}: ${p.file} — ${p.why} (status ${p.status}, ${p.size} bytes)`);
  for (const p of rep.problems.crash) L.push(`- crash ${p.album}: ${p.why}`);
  for (const p of rep.problems.capture) L.push(`- no verdict ${p.album} ${p.song}: ${p.capture}${p.why ? " — " + p.why : ""}`);
  for (const w of rep.albums) {
    const cnt = {}; for (const s of w.songs || []) cnt[s.verdict || "none"] = (cnt[s.verdict || "none"] || 0) + 1;
    L.push("", `## ${w.id} — ${w.title} (${w.chip}${w.code ? ", code " + w.code : ""})`, "", Object.entries(cnt).map(([k, v]) => k + " " + v).join(" · ") || "no songs", "");
    for (const s of (w.songs || []).filter(s => s.verdict !== "SAME")) {
      L.push(`- **${s.base}** ${s.verdict || "—"} → ${s.action}${s.firstBar ? " (from bar " + s.firstBar + ")" : ""}${s.annotations ? " · " + s.annotations + " annotations" : ""}${s.addBase ? " · new song " + s.addBase + ".mid \"" + s.addTitle + "\"" : ""}`);
      for (const r of (s.reasons || []).slice(0, 4)) L.push(`  - ${r}`);
      if (s.why) L.push(`  - ${s.why}`);
    }
  }
  return L.join("\n") + "\n";
}

// ---------------------------------------------------------------- --apply (one album)
const WRITABLE = new RegExp("^albums/(" + CONSOLES.join("|") + ")/[a-z0-9][a-z0-9-]*/(songs/)?[^/]+\\.(mid|notes\\.txt)$|^albums/(" + CONSOLES.join("|") + ")/[a-z0-9][a-z0-9-]*/album\\.json$");
export function assertWritable(abs) {
  const rel = path.relative(ROOT, path.resolve(abs)).split(path.sep).join("/");
  if (/(^|\/)(compositions|starters|nightroll)(\/|$)/.test(rel)) throw new Error("refused: " + rel + " is Josh's music, not a capture");
  if (/\.rollnotes\.json$/.test(rel)) throw new Error("refused: " + rel + " — annotations are never written by this tool");
  if (!WRITABLE.test(rel)) throw new Error("refused: " + rel + " is outside the capture allowlist");
  return rel;
}

export function applyAlbum(rep, id, log = console.log) {
  const w = rep.albums.find(x => x.id === id || x.slug === id);
  if (!w) throw new Error("no album " + id + " in the report — dry-run it first");
  const [a] = listAlbums({album: w.id});
  if (!a) throw new Error("album " + w.id + " is not a capture album");
  const songDir = songDirOf(a);
  const aj = path.join(a.dir, "album.json");
  const meta = JSON.parse(readFileSync(aj, "utf8"));
  const cap = {v: CAPTURE_VERSION, code: w.code};
  const done = [], held = [];
  for (const s of w.songs) {
    if (s.action !== "replace" && s.action !== "keep-old+add-new") { if (s.action !== "skip") held.push(s.base + " (" + s.action + ")"); continue; }
    if (!s.newMid || !existsSync(s.newMid) || sha(readFileSync(s.newMid)) !== s.newSha) { held.push(s.base + " (new capture missing or changed since the report)"); continue; }
    const oldMid = path.join(songDir, s.base + ".mid");
    if (!existsSync(oldMid) || sha(readFileSync(oldMid)) !== s.oldSha) { held.push(s.base + " (published .mid changed since the report — dry-run again)"); continue; }
    const target = s.action === "replace" ? oldMid : path.join(songDir, s.addBase + ".mid");
    assertWritable(target);
    if (s.action === "keep-old+add-new" && existsSync(target)) { held.push(s.base + " (" + path.basename(target) + " already exists — not overwritten)"); continue; }
    copyFileSync(s.newMid, target);
    const txt = s.newMid.replace(/\.mid$/, ".notes.txt"); // FF1's dump-all writes one; app captures have none
    if (existsSync(txt)) { const t = target.replace(/\.mid$/, ".notes.txt"); assertWritable(t); copyFileSync(txt, t); }
    const tr = meta.nsf.tracks[s.base];
    if (s.action === "replace") meta.nsf.tracks[s.base] = {...(typeof tr === "number" ? {n: tr} : tr), cap};
    else {
      meta.nsf.tracks[s.addBase] = {...(typeof tr === "number" ? {n: tr} : tr), cap};
      meta.songs = {...(meta.songs || {}), [s.addBase]: s.addTitle};
      if (s.newLoop) log(`  ${s.addBase}: its loop is ${s.newLoop} — add the loop annotation in the app (this tool never writes .rollnotes.json)`);
    }
    done.push(s.action === "replace" ? "replaced " + s.base : "added " + s.addBase + " beside " + s.base);
  }
  if (done.length) { assertWritable(aj); writeFileSync(aj, JSON.stringify(meta, null, 1) + "\n"); }
  for (const d of done) log("  " + d);
  for (const h of held) log("  held: " + h);
  if (done.length) {
    const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "build_manifest.mjs")], {encoding: "utf8"});
    log(r.status === 0 ? "  manifest rebuilt" : "  ⚠ build_manifest failed: " + r.stderr);
  }
  return {done, held};
}

// ---------------------------------------------------------------- CLI
function parseArgs(argv) {
  const o = {console: null, album: null, out: "/tmp/recap", timeout: 1800, apply: false, one: null};
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--console") o.console = argv[++i];
    else if (x === "--album") o.album = argv[++i];
    else if (x === "--out") o.out = path.resolve(argv[++i]);
    else if (x === "--timeout") o.timeout = +argv[++i];
    else if (x === "--apply") o.apply = true;
    else if (x === "--one") o.one = argv[++i];
    else throw new Error("unknown argument " + x);
  }
  if (path.resolve(o.out) === ROOT || path.resolve(o.out).startsWith(ROOT + path.sep)) throw new Error("--out must be outside the repo (default /tmp/recap)");
  return o;
}

function writeReport(outRoot) {
  const wd = path.join(outRoot, "work");
  const works = existsSync(wd) ? readdirSync(wd).filter(f => f.endsWith(".json")).sort().map(f => JSON.parse(readFileSync(path.join(wd, f), "utf8"))) : [];
  works.sort((x, y) => CONSOLES.indexOf(x.console) - CONSOLES.indexOf(y.console) || (x.slug === "final-fantasy-i" ? -1 : y.slug === "final-fantasy-i" ? 1 : x.slug.localeCompare(y.slug)));
  const rep = buildReport(works);
  writeFileSync(path.join(outRoot, "report.json"), JSON.stringify(rep, null, 1) + "\n");
  writeFileSync(path.join(outRoot, "report.md"), reportMarkdown(rep));
  return rep;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  const o = parseArgs(process.argv.slice(2));
  if (o.one) { // child: one album, its result to work/
    const [a] = listAlbums({album: o.one});
    if (!a) { console.error("no capture album " + o.one); process.exit(1); }
    mkdirSync(path.join(o.out, "work"), {recursive: true});
    let res;
    try { res = await recaptureAlbum(a, o.out); }
    catch (err) { res = {id: a.id, console: a.console, slug: a.slug, chip: a.chip, title: a.meta.title, fetch: [], songs: [], error: "crash: " + (err && err.stack || err)}; }
    writeFileSync(path.join(o.out, "work", a.console + "--" + a.slug + ".json"), JSON.stringify(res, null, 1) + "\n");
    process.exit(0); // the app's timers would keep node alive
  }
  if (o.apply) {
    if (!o.album) { console.error("--apply needs --album <console>/<slug> (one album per run, one album per push)"); process.exit(1); }
    const rep = JSON.parse(readFileSync(path.join(o.out, "report.json"), "utf8"));
    applyAlbum(rep, o.album);
    process.exit(0);
  }
  const albums = listAlbums({consoleName: o.console, album: o.album});
  albums.sort((x, y) => CONSOLES.indexOf(x.console) - CONSOLES.indexOf(y.console) || (x.slug === "final-fantasy-i" ? -1 : y.slug === "final-fantasy-i" ? 1 : x.slug.localeCompare(y.slug)));
  mkdirSync(path.join(o.out, "logs"), {recursive: true});
  mkdirSync(path.join(o.out, "work"), {recursive: true});
  for (const a of albums) {
    const t0 = Date.now();
    const logf = path.join(o.out, "logs", a.console + "--" + a.slug + ".log");
    const r = spawnSync(process.execPath, ["--experimental-vm-modules", "--no-warnings", SELF, "--one", a.id, "--out", o.out], {timeout: o.timeout * 1000, encoding: "utf8", maxBuffer: 256 << 20});
    writeFileSync(logf, (r.stdout || "") + (r.stderr || ""));
    const wf = path.join(o.out, "work", a.console + "--" + a.slug + ".json");
    if (r.status !== 0 || r.error) {
      const why = r.error && r.error.code === "ETIMEDOUT" ? "timeout after " + o.timeout + "s" : "exit " + r.status + (r.signal ? " " + r.signal : "") + ": " + (r.stderr || "").trim().split("\n").slice(-3).join(" ");
      writeFileSync(wf, JSON.stringify({id: a.id, console: a.console, slug: a.slug, chip: a.chip, title: a.meta.title, fetch: [], songs: [], error: why}, null, 1) + "\n");
    }
    const w = JSON.parse(readFileSync(wf, "utf8"));
    const cnt = {}; for (const s of w.songs) cnt[s.verdict || "none"] = (cnt[s.verdict || "none"] || 0) + 1;
    console.log(`${a.id.padEnd(44)} ${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s  ${w.error ? "ERROR " + w.error.split("\n")[0].slice(0, 120) : Object.entries(cnt).map(([k, v]) => k + " " + v).join(" · ")}`);
  }
  const rep = writeReport(o.out);
  for (const [c, x] of Object.entries(rep.byConsole)) console.log(`# ${c}: ${x.albums} albums, ${x.songs} songs — ` + VERDICTS.map(v => v + " " + x[v]).join(", ") + ", no verdict " + x.failed);
  console.log("# report: " + path.join(o.out, "report.md"));
}
