// tools/musicxml-dump.mjs <song.mid> [--rollnotes <file>] [--out <file>] [--parts shown|all] [--tab] [--txt]
// Export score / tab's MusicXML (and, with --txt, its ASCII tab files)
// written headless, through the app's own loader and writers in the vm
// harness — the same bytes the File ▾ sheet makes, for the ship checklist:
//   node tools/musicxml-dump.mjs albums/nes/final-fantasy-i/songs/airship.mid --out /tmp/airship.musicxml
//   tools/musicxml-check.sh /tmp/airship.musicxml          (W3C XSD)
// and for the guitar app's round-trip fixture (docs/plans/2026-11-27-score-
// tab-export.md §7). Facts only: the file carries exactly what the export
// does — a key only where the song's own rollnotes declare one. The
// .rollnotes.json beside the .mid is read unless --rollnotes names another
// (or `--rollnotes none`). Node-only, never shipped.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createApp } from "../tests/harness.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const flag = name => args.includes(name);
const mid = args.find(a => !a.startsWith("--") && a.endsWith(".mid"));
if (!mid) { console.error("usage: node tools/musicxml-dump.mjs <song.mid> [--rollnotes <file>|none] [--out <file>] [--parts shown|all] [--txt]"); process.exit(2); }
const rnArg = opt("--rollnotes", null);
const rnPath = rnArg === "none" ? null : rnArg || mid.replace(/\.midi?$/i, ".rollnotes.json");
const out = opt("--out", mid.replace(/\.midi?$/i, ".musicxml"));
const parts = opt("--parts", "all");

const app = await createApp({storage: {"ff1roll-mode": "learning"}});
app.context.midiBytes = [...readFileSync(mid)];
app.context.rollnotesText = rnPath && existsSync(rnPath) ? readFileSync(rnPath, "utf8") : null;
app.context.songKeyArg = mid.replace(/^.*?(albums\/)/, "$1");
app.context.partsArg = parts;
app.context.wantTxt = flag("--txt");
const files = JSON.parse(app.run(`(() => {
  const parsed = parseMidi(new Uint8Array(midiBytes).buffer);
  song = parsed; songKey = songKeyArg; keyRegions = []; previewSf = null; declaredTs = null;
  rollnotes = rollnotesText === null ? [] : parseRollnotes(rollnotesText).map(resolveNote);
  trackState = song.tracks.map(() => ({muted: false, solo: false}));
  finalizeNotes(); computeSongEnd();
  const files = buildExportFiles({parts: partsArg, split: "together", formats: {musicxml: true, tab: wantTxt}, tab_for: "melodic"}, {engrave: () => []});
  return JSON.stringify(files.map(f => ({name: f.name, data: f.data})));
})()`));
for (const f of files) {
  const dest = f.name.endsWith(".musicxml") ? out : path.join(path.dirname(out), f.name);
  writeFileSync(dest, f.data);
  console.log("wrote " + dest + " (" + f.data.length + " chars)");
}
