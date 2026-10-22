#!/usr/bin/env node
// tools/verify-export.mjs <NightRoll-Export-folder> — checks a File → "Export everything…" dump against its
// manifest.json: every file's size + sha256, every song's .mid re-parsed with the app's OWN parseMidi (note
// count must equal the manifest's draft note count), every .rollnotes.json's item count against the stored
// list length. Prints PASS/FAIL per song and a total; exit 1 on any failure. Read-only.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = resolve(process.argv[2] || "");
if (!process.argv[2] || !existsSync(join(dir, "manifest.json"))) { console.error("usage: node tools/verify-export.mjs <NightRoll-Export-folder>   (needs manifest.json)"); process.exit(2); }
// parse.js imports state.js, which reads localStorage at load: give it an inert one
globalThis.localStorage ??= {getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0};
const { parseMidi } = await import(pathToFileURL(join(fileURLToPath(new URL("..", import.meta.url)), "src/midi/parse.js")).href);

const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const sha = b => createHash("sha256").update(b).digest("hex");
const fileFail = new Map(); // path -> why
for (const f of m.files) {
  const p = join(dir, f.path);
  if (!existsSync(p)) { fileFail.set(f.path, "missing"); continue; }
  const b = readFileSync(p);
  if (b.length !== f.size) fileFail.set(f.path, "size " + b.length + " != " + f.size);
  else if (sha(b) !== f.sha256) fileFail.set(f.path, "sha256 mismatch");
}
let pass = 0, fail = 0;
for (const s of m.songs) {
  const why = [...(s.problems || [])];
  if (s.mid) {
    if (fileFail.has(s.mid.path)) why.push(".mid " + fileFail.get(s.mid.path));
    else {
      try {
        const b = readFileSync(join(dir, s.mid.path));
        const got = parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)).tracks.reduce((a, t) => a + t.notes.length, 0);
        if (got !== s.mid.notes) why.push(".mid has " + got + " notes, the draft had " + s.mid.notes);
      } catch (err) { why.push(".mid does not parse: " + err.message); }
    }
  }
  if (s.rollnotes) {
    if (fileFail.has(s.rollnotes.path)) why.push(".rollnotes.json " + fileFail.get(s.rollnotes.path));
    else {
      try {
        const items = JSON.parse(readFileSync(join(dir, s.rollnotes.path), "utf8")).notes.length;
        if (items !== s.rollnotes.items) why.push(".rollnotes.json has " + items + " items, the manifest says " + s.rollnotes.items);
        const unique = s.rollnotes.unique ?? s.rollnotes.stored; // same dedupe rule as serializeNotesList
        if (s.rollnotes.items !== unique) why.push("rollnotes items " + s.rollnotes.items + " != unique stored entries " + unique + " (stored " + s.rollnotes.stored + "): an entry is missing");
      } catch (err) { why.push(".rollnotes.json does not parse: " + err.message); }
    }
  }
  if (why.length) { fail++; console.log("FAIL " + s.key + " — " + why.join("; ")); }
  else { pass++; console.log("PASS " + s.key + (s.mid ? " (" + s.mid.notes + " notes)" : "") + (s.rollnotes ? " (" + s.rollnotes.items + " rollnotes)" : "")); }
}
const songFiles = new Set(m.songs.flatMap(s => [s.mid && s.mid.path, s.rollnotes && s.rollnotes.path]));
const otherBad = [...fileFail].filter(([p]) => !songFiles.has(p));
for (const [p, why] of otherBad) console.log("FAIL file " + p + " — " + why);
for (const e of m.errors || []) console.log("FAIL export error — " + e.where + ": " + e.message);
const bad = fail + otherBad.length + (m.errors || []).length;
console.log("redacted: " + (m.redacted.length ? m.redacted.join(", ") : "none") + "; re-downloadable nsf tracks: " + m.redownloadable.length + "; skipped: " + m.skipped.length);
console.log((bad ? "FAIL" : "PASS") + " total: " + pass + "/" + m.songs.length + " songs ok, " + (m.files.length - fileFail.size) + "/" + m.files.length + " files hash-clean, " + bad + " failures");
process.exit(bad ? 1 : 0);
