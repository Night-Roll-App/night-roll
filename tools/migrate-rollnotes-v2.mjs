// P5 (docs/provenance-plan.md): the ONE-TIME batch migration of every
// albums/**/*.rollnotes.json from v1 to v2 (docs/annotations-v2.md). Josh's
// ruling: converting a file's FORMAT is not editing his songs — no
// per-song approval (see docs/provenance-plan.md's Addendum). Six of his
// files under albums/compositions/ carry a machine-written "forked from
// <path>"/"moved from <path>" NOTE (Q8, pre-v2) — those move into the v2
// header's origin.from/movedFrom and leave the notes list; he explicitly
// asked to fix those six.
//
// Harness-backed, same as tools/query-lib.mjs and tools/import-set.mjs: the
// app's OWN parseRollnotesJSON/serializeNotesList/originOf run in the vm
// (tests/harness.mjs) — this file has NO second implementation of the
// .rollnotes format or the origin rules. The only logic that's genuinely
// ours is (1) finding the provenance notes to extract (the same PROVENANCE_RE
// shape the app's own hasProvenanceNote scans for) and (2) the round-trip
// safety check.
//
// Usage:
//   node tools/migrate-rollnotes-v2.mjs                   # dry run, every album (default)
//   node tools/migrate-rollnotes-v2.mjs --dry-run [sub…]   # dry run, filtered to albums whose path includes a substring
//   node tools/migrate-rollnotes-v2.mjs --write [sub…]     # actually rewrite matching files
//
// SAFETY: for every file, after building the v2 text, we reparse it through
// the app's own parseRollnotesJSON and require the result to deepEqual the
// old parse MINUS the removed provenance notes (which must reappear exactly
// as origin.from/movedFrom) — canonicalized (key order doesn't matter) but
// otherwise exact. Any mismatch (the app's own serializeNotesList deduping a
// directive, an ambiguous provenance note count, invalid JSON, …) REFUSES
// that file: nothing is written for it, and the reason is reported. .mid
// files are never read or written by this tool.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../tests/harness.mjs";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ---- discovery -------------------------------------------------------

// Same shape isCaptureKey/albumMetaFor use for a .mid key, applied to a
// .rollnotes.json path: strips an optional trailing "songs/" segment (only
// albums/nes/final-fantasy-i/ uses one) plus the file's own base name.
export function albumDirFor(rnRelPath) {
  return rnRelPath.replace(/\/(?:songs\/)?[^/]+\.rollnotes\.json$/, "");
}

export function findRollnotesFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const rel = dir + "/" + e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".rollnotes.json")) out.push(rel);
    }
  };
  walk("albums");
  return out.sort();
}

// Legacy (pre-2026-08-15) bare ".rollnotes" text files — report-only, and
// converted ONLY if the app's own parser (parseRollnotes, the bracket-anchor
// grammar) actually reads them. NIGHT-ROLL.md: the format was renamed to
// .rollnotes.json the same day it became JSON, so none are expected to
// exist — this just makes that an observed fact, not an assumption.
export function findLegacyTextFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const rel = dir + "/" + e.name;
      if (e.isDirectory()) walk(rel);
      else if (/\.rollnotes$/.test(e.name)) out.push(rel); // bare, not .rollnotes.json
    }
  };
  walk("albums");
  return out.sort();
}

export function loadAlbumMeta(root, rnFiles) {
  const dirs = new Set(rnFiles.map(albumDirFor));
  const meta = {};
  for (const dir of dirs) {
    const p = path.join(root, dir, "album.json");
    if (existsSync(p)) {
      try { meta[dir] = JSON.parse(readFileSync(p, "utf8")); } catch (err) { /* malformed album.json: leave uncached, isCaptureKey just won't find nsf for this dir */ }
    }
  }
  return meta;
}

// ---- the vm-side migration (one file, no disk I/O here) -------------

// Everything that needs the app's own parser/serializer/origin rules runs
// INSIDE this one script, in the harness's vm — never partially in Node and
// partially in the vm (that's how a second implementation creeps in).
const MIGRATE_CODE = `(() => {
  const text = __rn_text, midKey = __rn_key;
  function canon(v) { // key order doesn't matter for the round-trip check, content does
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === "object") return Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {});
    return v;
  }
  let raw;
  try { raw = JSON.parse(text); } catch (err) { return JSON.stringify({status: "refused", reason: "invalid JSON: " + err.message}); }
  if (!raw || typeof raw !== "object") return JSON.stringify({status: "refused", reason: "not a JSON object"});
  const parsed = parseRollnotesJSON(text); // the app's own reader
  const version = parsed.version;
  if (version >= 2) return JSON.stringify({status: "already-v2", version, readOnly: parsed.readOnly});

  // provenance notes: same shape PROVENANCE_RE (index.html) scans for —
  // "forked from <path>" (Save As) / "moved from <path>" (Move). A v2
  // header has exactly one from and one movedFrom slot; more than one of
  // either is ambiguous and refused rather than guessed at.
  const forkedIdx = [], movedIdx = [];
  parsed.forEach((n, i) => {
    const t = n.text || "";
    if (/^forked from /.test(t)) forkedIdx.push(i);
    else if (/^moved from /.test(t)) movedIdx.push(i);
  });
  if (forkedIdx.length > 1 || movedIdx.length > 1) {
    return JSON.stringify({status: "refused", reason:
      "ambiguous provenance: " + forkedIdx.length + " 'forked from' note(s) + " + movedIdx.length +
      " 'moved from' note(s) — a v2 header holds only one of each; refusing to drop one silently",
      notes: forkedIdx.concat(movedIdx).map(i => parsed[i].text)});
  }
  const fromPath = forkedIdx.length ? parsed[forkedIdx[0]].text.replace(/^forked from /, "").trim() : null;
  const movedFromPath = movedIdx.length ? parsed[movedIdx[0]].text.replace(/^moved from /, "").trim() : null;
  const removed = new Set(forkedIdx.concat(movedIdx));

  // A provenance note is plain text (never matches the typed section:/
  // chord:/key:/timesig:/tempo:/track:/loop:/audio: prefixes deriveNoteTypes
  // looks for), so it can never ALSO be carrying a timesig/tempo directive —
  // asserted here (not assumed) because that's the one thing that would
  // change notes.txt's output (notesTxtFor reads declaredTs's timesig: note
  // and the .mid's own tempo, nothing else from the notes list).
  for (const i of removed) {
    if (parsed[i].tsdir !== undefined || parsed[i].tempodir !== undefined)
      return JSON.stringify({status: "refused", reason: "a provenance note also parsed as a timesig/tempo directive — unexpected, needs a human look"});
  }

  // origin.kind via the app's OWN originOf, exactly as it would resolve for
  // this song if it were open right now: no stored header yet (rollnotesOrigin
  // = null, this IS the v1 file), so it falls through to the real path/
  // capture/starter/draft rules.
  songKey = midKey; song = true; rollnotesOrigin = null; rollnotes = parsed;
  const kind = originOf(midKey);
  const origin = {kind};
  if (fromPath) origin.from = fromPath;
  if (movedFromPath) origin.movedFrom = movedFromPath;

  const newList = parsed.filter((n, i) => !removed.has(i));
  const stamp = typeof raw.saved === "number" ? raw.saved : undefined; // v1 "saved" -> v2 "stamp", same meaning (docs/annotations-v2.md)
  const base = typeof raw.song === "string" ? raw.song : baseName();
  const newText = serializeNotesList(newList, 4, base, stamp, origin);

  // SAFETY: reparse the new text through the SAME reader and require it to
  // equal the old parse minus exactly the removed notes, origin included.
  const expectedKept = canon(parsed.filter((n, i) => !removed.has(i)).map(n => ({...n})));
  const reparsedNew = parseRollnotesJSON(newText);
  const gotKept = canon(reparsedNew.map(n => ({...n})));
  if (JSON.stringify(expectedKept) !== JSON.stringify(gotKept)) {
    return JSON.stringify({status: "refused", reason:
      "round-trip mismatch after conversion (" + expectedKept.length + " notes expected, " + gotKept.length +
      " came back — serializeNotesList likely deduped a directive) — refusing to lose data"});
  }
  if (JSON.stringify(canon(reparsedNew.origin)) !== JSON.stringify(canon(origin))) {
    return JSON.stringify({status: "refused", reason: "origin header did not round-trip"});
  }

  return JSON.stringify({status: "convert", origin, removedCount: removed.size, kind, newText});
})()`;

export function migrateText(app, text, midKey) {
  app.context.__rn_text = text;
  app.context.__rn_key = midKey;
  return JSON.parse(app.run(MIGRATE_CODE));
}

export function migrateOne(app, root, rnRelPath) {
  const text = readFileSync(path.join(root, rnRelPath), "utf8");
  const midKey = rnRelPath.replace(/\.rollnotes\.json$/, ".mid");
  return { ...migrateText(app, text, midKey), file: rnRelPath, midKey };
}

// ---- the batch run -----------------------------------------------------

export async function runMigration({ root = ROOT, write = false, substrings = [] } = {}) {
  const allFiles = findRollnotesFiles(root);
  const files = substrings.length ? allFiles.filter((f) => substrings.some((s) => f.includes(s))) : allFiles;
  const albumMeta = loadAlbumMeta(root, allFiles); // preload every album's nsf meta, not just the filtered set — isCaptureKey needs it regardless of which subset we're touching
  const app = await createApp();
  app.context.__albumMetaPatch = albumMeta;
  app.run("Object.assign(albumMetaCache, __albumMetaPatch);");

  const byAlbum = new Map(); // album dir -> {files, convert, alreadyV2, refused}
  const moved = []; // {file, from, movedFrom}
  const refused = []; // {file, reason}
  const converted = []; // {file, kind, hasOrigin}
  let alreadyV2Count = 0;

  for (const rnRel of files) {
    const album = albumDirFor(rnRel);
    if (!byAlbum.has(album)) byAlbum.set(album, { files: 0, convert: 0, alreadyV2: 0, refused: 0 });
    const bucket = byAlbum.get(album);
    bucket.files++;
    const res = migrateOne(app, root, rnRel);
    if (res.status === "already-v2") { bucket.alreadyV2++; alreadyV2Count++; continue; }
    if (res.status === "refused") { bucket.refused++; refused.push({ file: rnRel, reason: res.reason }); continue; }
    bucket.convert++;
    converted.push({ file: rnRel, kind: res.kind, from: res.origin.from || null, movedFrom: res.origin.movedFrom || null });
    if (res.origin.from || res.origin.movedFrom) moved.push({ file: rnRel, from: res.origin.from || null, movedFrom: res.origin.movedFrom || null });
    if (write) writeFileSync(path.join(root, rnRel), res.newText);
  }

  const legacyFiles = findLegacyTextFiles(root).filter((f) => (substrings.length ? substrings.some((s) => f.includes(s)) : true));
  // .notes.txt never depends on a provenance note (see the vm code's own
  // assertion above) — no regen is ever needed by this migration.
  return { filesScanned: files.length, byAlbum, moved, refused, converted, alreadyV2Count, legacyFiles, write };
}

export function formatReport(result, { write }) {
  const L = [];
  L.push("# tools/migrate-rollnotes-v2.mjs " + (write ? "--write" : "--dry-run"));
  L.push("# " + new Date().toISOString());
  L.push("");
  const albums = [...result.byAlbum.keys()].sort();
  for (const album of albums) {
    const b = result.byAlbum.get(album);
    L.push("## " + album + " (" + b.files + " file" + (b.files === 1 ? "" : "s") + ")");
    L.push("  would-convert: " + b.convert + "   already-v2: " + b.alreadyV2 + "   refused: " + b.refused);
    const albumRefused = result.refused.filter((r) => albumDirFor(r.file) === album);
    for (const r of albumRefused) L.push("    REFUSED " + r.file + ": " + r.reason);
    const albumMoved = result.moved.filter((m) => albumDirFor(m.file) === album);
    for (const m of albumMoved) {
      const bits = [];
      if (m.from) bits.push("from: " + m.from);
      if (m.movedFrom) bits.push("movedFrom: " + m.movedFrom);
      L.push("    provenance note moved " + m.file + " → " + bits.join(", "));
    }
    L.push("");
  }
  L.push("## Totals");
  L.push("files scanned: " + result.filesScanned);
  L.push("would-convert: " + result.converted.length);
  L.push("already-v2 (skipped): " + result.alreadyV2Count);
  L.push("refused: " + result.refused.length);
  L.push("legacy (bare .rollnotes, non-JSON) files found: " + result.legacyFiles.length);
  if (result.legacyFiles.length) for (const f of result.legacyFiles) L.push("  " + f);
  L.push("");
  L.push("## origin.kind breakdown (converted files)");
  const kinds = new Map();
  for (const c of result.converted) kinds.set(c.kind, (kinds.get(c.kind) || 0) + 1);
  for (const [k, n] of [...kinds.entries()].sort()) L.push("  " + k + ": " + n);
  L.push("");
  L.push("## Provenance notes moved into origin.from/movedFrom (" + result.moved.length + ")");
  for (const m of result.moved) {
    const bits = [];
    if (m.from) bits.push("from: " + m.from);
    if (m.movedFrom) bits.push("movedFrom: " + m.movedFrom);
    L.push("  " + m.file + " → " + bits.join(", "));
  }
  if (result.refused.length) {
    L.push("");
    L.push("## Refused files (" + result.refused.length + ")");
    for (const r of result.refused) L.push("  " + r.file + ": " + r.reason);
  }
  return L.join("\n") + "\n";
}

// ---- CLI ----------------------------------------------------------------

export function parseArgs(argv) {
  const o = { write: false, substrings: [] };
  for (const a of argv) {
    if (a === "--write") o.write = true;
    else if (a === "--dry-run") o.write = false;
    else o.substrings.push(a);
  }
  return o;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  const result = await runMigration({ write: opts.write, substrings: opts.substrings });
  process.stdout.write(formatReport(result, { write: opts.write }));
  if (result.refused.length) process.exitCode = 0; // refusals are reported, not a tool failure
}
