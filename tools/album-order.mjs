// tools/album-order.mjs [--write] [--rips <dir>] [slug-substring...]
//
// Josh wants albums playable in GAME order (the soundtrack's track order),
// not alphabetical. album.json's nsf.tracks[slug] carries {n, secs} but no
// track number — n is just the chip file's internal slot (for a perFile
// set like SPC/PSF/PSF2/USF it is ALWAYS 1, meaningless for order; for a
// single-file NSF/GBS set it is the in-file song index, which is NOT the
// soundtrack order either — see below). The real soundtrack order lives
// only in the ORIGINAL RIP's file names (perFile sets: "216 Rachel.spc",
// disc/track/part — tools/spc/spc.mjs's parseTrackName) or its .m3u
// playlist(s) (NSF/GBS: "playlist order IS album order", index.html's own
// comment on parseM3u). This tool reads a rip (filenames + the cheap
// container tags already used at import — never renders audio, never
// emulates a CPU) and writes that order into album.json as
// nsf.tracks[slug].track (plus .disc for a multi-disc perFile set),
// without touching anything else.
//
// Two pieces are reused as real imports, not copies: parseTrackName
// (tools/spc/spc.mjs — pure filename regex, console-agnostic despite the
// name) and the four container tag readers (parsePSF/isPSF, parsePSF2/
// isPSF2, parseUSF/isUSF, parseSPC — all header-only, no emulation) plus
// gatherFiles (tools/import-set.mjs — zip/dir/file -> [{name, bytes}], the
// same picker-equivalent the terminal importer uses).
//
// Three pieces exist only inside index.html's inline script, which is not
// an ES module and is READ-ONLY per this task — they are MIRRORED here
// (same algorithm, cited by line comment at the point of first discovery,
// 2026-09-30) and will drift if the original is ever changed without a
// matching edit here:
//   - chipTrackOrder's sort key (index.html ~18146): [unlisted, disc,
//     track, part] then a numeric filename compare.
//   - parseM3u (index.html ~13936) and decodeM3u (~13932): the NSF/GBS
//     playlist line format, "playlist order IS album order".
//   - slugify (index.html ~15933) and the per-import dedup suffix
//     ("-2", "-3", ... on a repeated slug, index.html ~18432) — the same
//     rule that turned Ocarina of Time's twenty "Hyrule Field"s into
//     distinct slugs at capture time.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { gatherFiles } from "./import-set.mjs";
import { parseTrackName } from "./spc/spc.mjs";
import { parsePSF, isPSF } from "./psx/psf.mjs";
import { parsePSF2, isPSF2 } from "./ps2/psf2.mjs";
import { parseUSF, isUSF } from "./n64/usf.mjs";
import { parseSPC } from "./spc/spc.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// album.json's nsf.chip -> the console folder under albums/ (same map as
// index.html's CONSOLE_OF, ~line 17864 — small and stable enough to not
// need importing the inline script).
const CONSOLE_OF = {nsf: "nes", gbs: "game-boy", spc: "snes", psf: "ps1", psf2: "ps2", usf: "n64"};
const PERFILE_KINDS = new Set(["spc", "psf", "psf2", "usf"]);

// ---- mirrors (see header) ------------------------------------------------

function slugify(s) { // index.html ~15933
  return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}
function titleCaseSlug(base) { // index.html ~15900 — display only, never written
  return base.split("-").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}
function decodeM3u(bytes) { // index.html ~13932
  try { return new TextDecoder("utf-8", {fatal: true}).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}
function parseM3u(text) { // src/import/hub.js parseM3u — ordered [{file, n, title, len}]; playlist order IS album order
  const list = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.*?)::(?:NSF|GBS),(\d+),(.+?),(?:(\d+):)?(\d+):(\d\d(?:\.\d+)?)/);
    if (!m) continue;
    const raw = m[3].replace(/\\,/g, ",");
    const parts = []; let depth = 0, cur = "";
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
      if (depth === 0 && raw.startsWith(" - ", i)) { parts.push(cur); cur = ""; i += 2; continue; }
      cur += ch;
    }
    parts.push(cur);
    const gb = m[0].includes("::GBS,");
    const title = (gb && parts.length >= 2 ? parts[0] : parts.length >= 3 ? parts.slice(2).join(" - ") : parts[parts.length - 1]).trim();
    if (title) list.push({file: m[1].trim() || null, n: +m[2] + (gb ? 1 : 0), title, len: (+m[4] || 0) * 3600 + +m[5] * 60 + +m[6]});
  }
  return list;
}
// src/audio/chip.js chipVaultFileSlug + src/import/hub.js m3uFileSlug: a rip
// with several chip files (GB Tetris: DMG-TRA-0.gbs + DMG-TRA-1.gbs) keeps
// each non-first file in the archive as <slug>.<file slug><ext>, and a track
// captured from it carries that path in nsf.tracks[slug].vault. A playlist
// line naming such a file matches the track with that file's slug; any other
// line matches a track with no vault of its own — the same n can live once
// per file.
function vaultFileSlug(vault) { const m = (vault || "").split("/").pop().match(/^[^.]+\.([^.]+)\.[a-z0-9]+$/i); return m ? m[1] : null; }
function m3uFileSlug(file) { return file ? slugify(file.replace(/\.[a-z0-9]+$/i, "")) : null; }
// index.html's chipTrackOrder (~18146): a set's files in disc/track/part
// order, unlisted (99/999) last, anything unparsable-by-name last of all.
function chipTrackOrder(files) {
  const key = f => { const t = parseTrackName(f.name); return t ? [t.unlisted ? 1 : 0, t.disc || 0, t.track, t.part || ""] : [2, 0, 0, f.name]; };
  return files.slice().sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return a.name.localeCompare(b.name, undefined, {numeric: true}); });
}

// ---- cheap, header-only tag reads (never emulates, never renders) -------

function magicSPC(b) { return b.length >= 27 && Buffer.from(b.subarray(0, 27)).toString("latin1") === "SNES-SPC700 Sound File Data"; }
function isMember(kind, b) {
  if (b.length < 8) return false;
  if (kind === "spc") return magicSPC(b);
  if (kind === "psf") return isPSF(b) && b[3] === 1;
  if (kind === "psf2") return isPSF2(b);
  if (kind === "usf") return isUSF(b);
  return false;
}
function tagTitle(kind, b) {
  try {
    if (kind === "spc") return parseSPC(b).name || null;
    if (kind === "psf") return (parsePSF(b).tags || {}).title || null;
    if (kind === "psf2") return (parsePSF2(b).tags || {}).title || null;
    if (kind === "usf") return (parseUSF(b).tags || {}).title || null;
  } catch { return null; }
  return null;
}

// ---- rip name matching: normalize + roman-numeral folding + a small alias
// table for the few abbreviated rip names that neither of those reach ----

const ROMAN = {i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13};
function tokens(name) {
  return name.toLowerCase().replace(/\.(zip|nsf|gbs)$/, "").replace(/^(n64-|ps2-|ps1-)/, "").split(/[^a-z0-9]+/).filter(Boolean);
}
function keyOf(name) { return tokens(name).join(""); }
function keyArabic(name) { return tokens(name).map(t => ROMAN[t] !== undefined ? String(ROMAN[t]) : t).join(""); }
// Abbreviated/short rip names found by hand in this Mac's rip set
// (2026-09-30) that neither normalize() nor the roman-numeral fold
// resolves on their own — documented per entry, not a game-identity table
// (CLAUDE.md's "no one-time hacks" is about capture ENGINES; this is a
// filename lookup for a catalog tool, not how the music sounds).
const ALIASES = {
  ffx: "finalfantasyx",     // ffx.zip / ps2-ffx/ — PSF2 Final Fantasy X
  ff7: "finalfantasy7",     // ff7.zip / ff7/
  ge: "goldeneye007",       // n64-ge/ (n64- stripped) — GoldenEye 007
  mm: "majorasmask",        // mm.zip / mm/ — Majora's Mask (disambiguated from Mega Man by n64-only search scope)
  oot: "ocarinaoftime",     // oot.zip / oot/
  sm64: "supermario64",     // sm64.zip / sm64/
  mm2: "megaman2",          // nes/mm2.nsf, a bare file with no zip
};
function tokenSublist(small, big) { // whole-token containment, but never across a roman-numeral/digit boundary:
  // "ninja-gaiden" must not match "ninja-gaiden-ii" (a different, later game),
  // same as "final fantasy ii" must not match "final fantasy i".
  if (small.length < 2 || small.length > big.length) return false;
  const bad = t => ROMAN[t] !== undefined || /^\d+$/.test(t);
  for (let i = 0; i + small.length <= big.length; i++) {
    if (!small.every((t, j) => big[i + j] === t)) continue;
    const rest = [...big.slice(0, i), ...big.slice(i + small.length)];
    if (!rest.some(bad)) return true;
  }
  return false;
}
function namesMatch(candidate, albumSlug) {
  const a = keyOf(albumSlug), aArabic = keyArabic(albumSlug);
  const c = keyOf(candidate), cArabic = keyArabic(candidate);
  if (c === a || cArabic === a || c === aArabic || cArabic === aArabic) return true;
  if (ALIASES[c] === a || ALIASES[c] === aArabic) return true;
  // a rip sometimes drops a franchise prefix the album slug keeps (e.g.
  // "a-link-to-the-past.zip" for albums/snes/legend-of-zelda-a-link-to-
  // the-past) — whole-token containment only, so "final fantasy ii"
  // (tokens i, i, final, fantasy, ii) never matches "final fantasy i".
  const ct = tokens(candidate), at = tokens(albumSlug);
  return tokenSublist(ct, at) || tokenSublist(at, ct);
}

// ---- where the rips live --------------------------------------------------
// ~/work/ff/rips is the stable location; a session's /tmp/claude-<pid>/rips
// scratch copy is ephemeral (today's pid will not exist next session), so
// it is discovered by glob, never hardcoded.
function ripRoots() {
  const out = [];
  const home = path.join(os.homedir(), "work/ff/rips");
  if (existsSync(home)) out.push(home);
  if (process.env.ALBUM_ORDER_RIPS && existsSync(process.env.ALBUM_ORDER_RIPS)) out.push(process.env.ALBUM_ORDER_RIPS);
  try {
    for (const e of readdirSync("/tmp")) {
      if (!/^claude-/.test(e)) continue;
      const p = path.join("/tmp", e, "rips");
      if (existsSync(p)) out.push(p);
    }
  } catch { /* no /tmp access — fine, home or the env override still apply */ }
  return out;
}

// Candidates: every zip and every directory under the given scope, plus (for
// non-perFile consoles) a bare .nsf/.gbs file sitting loose beside the zips
// (e.g. nes/mm2.nsf, no zip at all).
function walkCandidates(root, scopeDirs) {
  const out = [];
  const bases = scopeDirs ? scopeDirs.map(d => path.join(root, d)).filter(existsSync) : [root];
  const EXCLUDE = new Set(["nes", "nes2", "snes", "game-boy"]); // other consoles' own subtrees, skipped when scope is the whole root
  const walk = (dir, depth, atRoot) => {
    if (depth > 5) return;
    let entries; try { entries = readdirSync(dir, {withFileTypes: true}); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (atRoot && !scopeDirs && EXCLUDE.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { out.push({path: full, name: e.name, isZip: false, isBare: false}); walk(full, depth + 1, false); }
      else if (/\.zip$/i.test(e.name)) out.push({path: full, name: e.name.replace(/\.zip$/i, ""), isZip: true, isBare: false});
      else if (/\.(nsf|gbs)$/i.test(e.name)) out.push({path: full, name: e.name.replace(/\.(nsf|gbs)$/i, ""), isZip: false, isBare: true});
    }
  };
  for (const b of bases) walk(b, 0, true);
  return out;
}

function countMatchingFiles(kind, perFile, candidate) {
  if (candidate.isBare) return 1; // a single loose chip file — gatherFiles would need its real extension, counted as one
  let files;
  try { files = gatherFiles(candidate.path); } catch { return 0; }
  if (!perFile) return files.some(f => /\.m3u8?$/i.test(f.name)) ? files.length : 0;
  let n = 0;
  for (const f of files) { try { if (isMember(kind, f.bytes)) n++; } catch { /* unreadable — not a member */ } }
  return n;
}

function locateRip(kind, perFile, slug) {
  const consoleDir = CONSOLE_OF[kind];
  const scopeDirs = consoleDir === "nes" ? ["nes", "nes2"] : consoleDir === "game-boy" ? ["game-boy"] : consoleDir === "snes" ? ["snes"] : null;
  let best = null, bestScore = -1;
  for (const root of ripRoots()) {
    for (const c of walkCandidates(root, scopeDirs)) {
      if (!namesMatch(c.name, slug)) continue;
      const score = countMatchingFiles(kind, perFile, c) + (c.isZip ? 0.5 : 0); // tie-break toward the zip (the distributable form) over an unpacked copy
      if (score > bestScore) { bestScore = score; best = c; }
    }
  }
  return bestScore > 0 ? best : null;
}

// ---- rip -> ordered file/track list --------------------------------------

function perFileFiles(kind, candidate) {
  if (candidate.isBare) return []; // a loose single perFile track makes no sense; never reached (perFile sets are always zips/dirs here)
  let files; try { files = gatherFiles(candidate.path); } catch { return []; }
  return files.filter(f => { try { return isMember(kind, f.bytes); } catch { return false; } });
}

// The slug-assignment half of an import, pulled out so it is testable on
// synthetic titles with no real chip bytes: slugify each title in sorted
// order, and — the same rule that turned Ocarina of Time's twenty "Hyrule
// Field"s into distinct slugs at capture time (index.html ~18432) — suffix
// a repeat with "-2", "-3", ... by the order it was seen in.
function assignSlugsAndTracks(entries) { // entries: [{title, disc}], already in soundtrack order
  const used = new Set();
  return entries.map((e, i) => {
    let base = slugify(e.title), slug = base;
    if (used.has(slug)) { let n = 2; while (used.has(base + "-" + n)) n++; slug = base + "-" + n; }
    used.add(slug);
    return {slug, title: e.title, track: i + 1, disc: e.disc != null ? e.disc : null};
  });
}

function orderPerFile(kind, candidate) {
  const members = perFileFiles(kind, candidate);
  const sorted = chipTrackOrder(members);
  const entries = sorted.map(f => {
    const t = parseTrackName(f.name);
    // parseTrackName only strips a literal ".spc" (it predates the other
    // chip kinds reusing it for order) — strip any remaining chip
    // extension here so an untagged file's fallback title never carries
    // one into the slug (e.g. "Challenge.minipsf2").
    const title = tagTitle(kind, f.bytes) || (t && t.title ? t.title.replace(/\.(spc|psf2?|minipsf2?|usf|miniusf)$/i, "") : null) || f.name.replace(/\.[a-z0-9]+$/i, "");
    return {title, disc: t && t.disc != null ? t.disc : null};
  });
  return assignSlugsAndTracks(entries);
}

function nonPerFileEntries(candidate) {
  if (candidate.isBare) {
    const nsfBytes = readFileSync(candidate.path);
    const files = [{name: path.basename(candidate.path), bytes: nsfBytes}];
    const m3u = candidate.path.replace(/\.(nsf|gbs)$/i, ".m3u");
    if (existsSync(m3u)) files.push({name: path.basename(m3u), bytes: readFileSync(m3u)});
    return files;
  }
  try { return gatherFiles(candidate.path); } catch { return []; }
}

function orderNonPerFile(candidate) {
  const files = nonPerFileEntries(candidate);
  const m3us = files.filter(f => /\.m3u8?$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
  if (!m3us.length) return null; // no playlist in this rip — no order source
  const order = [];
  for (const f of m3us) for (const e of parseM3u(decodeM3u(f.bytes))) order.push(e); // [{n, title, len}], position = soundtrack order
  return order;
}

// ---- album.json enumeration ------------------------------------------------

function findAlbumFiles() {
  const out = [];
  const walk = d => { for (const e of readdirSync(d)) { const f = path.join(d, e); if (statSync(f).isDirectory()) walk(f); else if (e === "album.json") out.push(f); } };
  walk(path.join(ROOT, "albums"));
  return out.filter(f => !f.includes(path.sep + "compositions" + path.sep) && !f.includes(path.sep + "imports" + path.sep));
}

function processAlbum(file) {
  const rel = path.relative(ROOT, file);
  const obj = JSON.parse(readFileSync(file, "utf8"));
  const nsf = obj.nsf;
  if (!nsf) return null;
  const kind = nsf.chip || "nsf";
  const perFile = !!nsf.perFile;
  const slug = path.basename(path.dirname(file));
  const trackSlugs = Object.keys(nsf.tracks || {});
  const candidate = locateRip(kind, perFile, slug);
  if (!candidate) return {file, rel, slug, kind, perFile, noRip: true, total: trackSlugs.length};

  const result = {file, rel, slug, kind, perFile, candidate: candidate.path, total: trackSlugs.length};
  if (perFile) {
    const order = orderPerFile(kind, candidate);
    const bySlug = new Map(order.map(o => [o.slug, o]));
    const matched = {}, unmatched = [];
    for (const s of trackSlugs) { const o = bySlug.get(s); if (o) matched[s] = {track: o.track, disc: o.disc}; else unmatched.push(s); }
    result.matched = matched; result.unmatched = unmatched;
    result.anyDisc = order.some(o => o.disc != null);
    result.ripSongCount = order.length;
  } else {
    const order = orderNonPerFile(candidate);
    if (order === null) { result.noOrderSource = true; result.unmatched = trackSlugs; result.matched = {}; return result; }
    const nToSlug = {}, byFile = {}; // n → slug for the album's own file; "<file slug>::n" → slug for a track of a non-first chip file
    for (const [s, t] of Object.entries(nsf.tracks)) {
      const n = typeof t === "number" ? t : t && t.n; if (n == null) continue;
      const fs = vaultFileSlug(t && t.vault);
      if (fs) { if (!((fs + "::" + n) in byFile)) byFile[fs + "::" + n] = s; }
      else if (!(n in nToSlug)) nToSlug[n] = s;
    }
    const matched = {}, unmatched = [];
    order.forEach((e, i) => { const fs = m3uFileSlug(e.file); const s = (fs && byFile[fs + "::" + e.n]) || nToSlug[e.n]; if (s && !(s in matched)) matched[s] = {track: i + 1, disc: null}; });
    for (const s of trackSlugs) if (!(s in matched)) unmatched.push(s);
    result.matched = matched; result.unmatched = unmatched;
    result.ripSongCount = order.length;
  }
  return result;
}

function firstFive(obj, result) {
  const bySlug = result.matched;
  const slugs = Object.keys(bySlug).sort((a, b) => bySlug[a].track - bySlug[b].track).slice(0, 5);
  return slugs.map(s => ({slug: s, track: bySlug[s].track, title: (obj.songs && obj.songs[s]) || titleCaseSlug(s)}));
}

function writeOrder(file, obj, result) {
  for (const [s, info] of Object.entries(result.matched)) {
    obj.nsf.tracks[s].track = info.track;
    if (result.anyDisc && info.disc != null) obj.nsf.tracks[s].disc = info.disc;
  }
  writeFileSync(file, JSON.stringify(obj, null, 1) + "\n");
}

// ---- CLI --------------------------------------------------------------

function main(argv) {
  const write = argv.includes("--write");
  const filterArgs = argv.filter(a => !a.startsWith("--"));
  const files = findAlbumFiles().filter(f => !filterArgs.length || filterArgs.some(s => f.includes(s)));

  const written = [], partial = [], noRip = [], noOrderSource = [];
  for (const file of files) {
    const obj = JSON.parse(readFileSync(file, "utf8"));
    if (!obj.nsf) continue;
    const result = processAlbum(file);
    if (!result) continue;
    if (result.noRip) { noRip.push(result); continue; }
    if (result.noOrderSource) { noOrderSource.push(result); continue; }
    const n = Object.keys(result.matched).length, m = result.total;
    console.log(`${result.rel}: matched ${n}/${m} against ${path.relative(ROOT, result.candidate)}`);
    if (result.unmatched.length) console.log(`  unmatched: ${result.unmatched.join(", ")}`);
    const f5 = firstFive(obj, result);
    if (f5.length) console.log(`  first 5 in game order: ${f5.map(x => `${x.track}. ${x.title}`).join(" | ")}`);
    if (n === m && m > 0) {
      written.push(result);
      if (write) writeOrder(file, obj, result);
    } else {
      partial.push(result);
    }
  }

  console.log("\n==== summary ====");
  console.log(`${written.length} album(s) fully matched${write ? " (written)" : " (dry-run — pass --write to apply)"}:`);
  for (const r of written) console.log(`  ${r.rel}`);
  console.log(`${partial.length} album(s) partially matched (left unwritten):`);
  for (const r of partial) console.log(`  ${r.rel} — ${Object.keys(r.matched).length}/${r.total}, unmatched: ${r.unmatched.join(", ")}`);
  console.log(`${noOrderSource.length} album(s) with a rip but no playlist to order by:`);
  for (const r of noOrderSource) console.log(`  ${r.rel} (${r.candidate ? path.relative(ROOT, r.candidate) : "?"})`);
  console.log(`${noRip.length} album(s) with no rip found on this machine:`);
  for (const r of noRip) console.log(`  ${r.rel}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

export { slugify, titleCaseSlug, parseM3u, decodeM3u, vaultFileSlug, m3uFileSlug, chipTrackOrder, namesMatch, keyOf, keyArabic, assignSlugsAndTracks, locateRip, processAlbum, findAlbumFiles, ripRoots };
