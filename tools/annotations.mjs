// tools/annotations.mjs <song> [--type section|chord|key|...] [--json] [--comments]
// Annotations resolved to bar.beat with spans — plus ANOMALY flags:
// duplicate track directives, spans past the song's end, and equal-span
// section/chord pairs. Reports; never interprets.
// --comments ALSO prints the coach's <song>.comments.json, verbatim (her words,
// her name and time) — only when asked; the default dump never reads that file.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { loadSong, fmtBQ, outJson, resolveSong } from "./query-lib.mjs";
import { existsSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const ti = argv.indexOf("--type");
const typeArg = ti >= 0 ? argv.splice(ti, 2)[1] : null;
const withComments = argv.includes("--comments");
const songArg = argv.filter(a => a !== "--json" && a !== "--comments")[0];
if (!songArg) { console.error("usage: annotations.mjs <song> [--type T] [--json] [--comments]"); process.exit(1); }

const doc = await loadSong(songArg);
const typeOf = n =>
  n.section ? "section" : n.chord ? "chord" :
  n.keydir !== undefined || n.keypartial ? "key" :
  n.tsdir ? "timesig" : n.tempodir !== undefined ? "tempo" :
  n.trackdir ? "track" : n.loopTo !== undefined ? "loop" :
  n.study ? "analysis" : // the Analysis sheet's entries: item + tick in `text`, his answer in `note`
  n.songnote ? "songnote" : // his titled song notes: "songnote: <title>" in `text`, the body in `note`
  /^lane:/.test(n.text) ? "lane" : /^chop:/.test(n.text) ? "chop" : "text";
const rows = doc.rollnotes.map(n => ({
  type: typeOf(n), at: n.b1 + "." + n.q1, to: n.b2 ? n.b2 + "." + (n.q2 ?? 1) : null,
  text: n.text, note: n.note || undefined,
})).filter(r => !typeArg || r.type === typeArg);

const anomalies = [];
const dirSeen = new Map();
for (const n of doc.rollnotes) {
  if (n.trackdir) {
    const k = n.trackdir.name.toLowerCase();
    if (dirSeen.has(k)) anomalies.push(`duplicate track: directive for "${n.trackdir.name}"`);
    dirSeen.set(k, 1);
  }
  if ((n.section || n.chord) && n.end > doc.endTick + doc.barTicks)
    anomalies.push(`"${n.text}" span ends past the song (${fmtBQ(doc, n.end)})`);
}
// (equal-span section/chord pairs used to collide in the ruler; the
// 2026-08-19 lane-group redesign made them structurally fine — not an anomaly)

let comments;
if (withComments) {
  const cp = resolveSong(songArg).replace(/\.mid$/, ".comments.json");
  comments = existsSync(cp) ? (JSON.parse(readFileSync(cp, "utf8")).comments || []) : [];
}
outJson(json, {song: doc.path, annotations: rows, anomalies, ...(comments ? {comments} : {})}, o => {
  let s = `${o.song}\n`;
  for (const r of o.annotations)
    s += `  ${r.type.padEnd(8)} ${r.at}${r.to ? "–" + r.to : ""}  ${r.text}${r.note ? "  ✱ " + r.note.split("\n")[0] : ""}\n`;
  s += o.anomalies.length ? "ANOMALIES:\n" + o.anomalies.map(a => "  ⚠ " + a).join("\n") + "\n" : "no anomalies\n";
  if (o.comments) {
    s += o.comments.length ? "COACH COMMENTS (hers, verbatim):\n" : "no coach comments\n";
    for (const c of o.comments) s += `  ${c.at ? c.at.join(".") : "song"}  ${c.by || "coach"}${c.ts ? " " + new Date(c.ts).toISOString() : ""}: ${c.text}\n`;
  }
  return s;
});
