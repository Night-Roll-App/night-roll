// tools/loop-targets.mjs <song>|--all [--json]
// Loop point, target, and what every track plays AT the target — serves the
// loop-target tonic methodology. Facts only.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { loadSong, fmtBQ, pitchName, ROOT, outJson } from "./query-lib.mjs";
import { readdirSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const args = argv.filter(a => a !== "--json");
let songs = [];
if (args[0] === "--all") {
  const walk = dir => {
    for (const f of readdirSync(path.join(ROOT, dir), {withFileTypes: true})) {
      if (f.isDirectory()) walk(path.join(dir, f.name));
      else if (f.name.endsWith(".mid")) songs.push(path.join(dir, f.name));
    }
  };
  walk("albums");
} else if (args[0]) songs = [args[0]];
else { console.error("usage: loop-targets.mjs <song>|--all [--json]"); process.exit(1); }

const out = [];
for (const sArg of songs) {
  let doc;
  try { doc = await loadSong(sArg); } catch (e) { continue; }
  const loop = doc.rollnotes.find(n => n.loopTo !== undefined);
  if (!loop) { out.push({song: doc.path, loop: null}); continue; }
  const t = loop.loopTo;
  const atTarget = [];
  for (const tr of doc.tracks) {
    const hits = tr.notes.filter(n => n.t <= t && n.t + n.d > t)
      .map(n => pitchName(n.p) + (n.t === t ? "" : "(sustains)"));
    if (hits.length) atTarget.push({track: tr.name, pitches: hits});
  }
  out.push({song: doc.path, anchor: fmtBQ(doc, ((loop.b1 - 1) * doc.barTicks) + (loop.q1 - 1) * doc.beatTicks),
            target: fmtBQ(doc, t), atTarget});
}
outJson(json, out, list => list.map(o =>
  o.loop === null ? `${o.song}: no loop annotation\n`
  : `${o.song}: loop ${o.anchor} → ${o.target}\n` +
    o.atTarget.map(tr => `  ${tr.track}: ${tr.pitches.join(" ")}`).join("\n") + "\n").join(""));
