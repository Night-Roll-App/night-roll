// tools/span.mjs <song> <from> <to> [--json]
// All events in a range, per track, plus the span's pitch-class set.
// Pitch-class set only — NOT a chord name. Facts only.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { loadSong, parseBQ, fmtBQ, pitchName, PC_NAMES, isDrumTrack, outJson } from "./query-lib.mjs";

const args = process.argv.slice(2).filter(a => a !== "--json");
const json = process.argv.includes("--json");
const [songArg, fromArg, toArg] = args;
if (!songArg || !fromArg || !toArg) { console.error("usage: span.mjs <song> <from bar.beat> <to bar.beat> [--json]"); process.exit(1); }

const doc = await loadSong(songArg);
const t0 = parseBQ(doc, fromArg), t1 = parseBQ(doc, toArg);
const pcs = new Set();
const out = {song: doc.path, from: fromArg, to: toArg, tracks: [], pitchClassSet: []};
for (const tr of doc.tracks) {
  const hits = tr.notes.filter(n => n.t < t1 && n.t + n.d > t0);
  if (!isDrumTrack(tr.name)) hits.forEach(n => pcs.add(n.p % 12)); // kit pieces aren't pitch classes
  if (hits.length) out.tracks.push({track: tr.name, notes: hits.map(n =>
    ({pitch: pitchName(n.p), onset: fmtBQ(doc, n.t), durQ: +(n.d / doc.ppq).toFixed(3), vel: n.v, ...(n.shape ? {shape: n.shape} : {})}))});
}
out.pitchClassSet = [...pcs].sort((a, b) => a - b).map(pc => PC_NAMES[pc]);
outJson(json, out, o => {
  let s = `${o.song} ${o.from}–${o.to}\npitch classes: {${o.pitchClassSet.join(" ")}}\n`;
  for (const tr of o.tracks) {
    s += `  ${tr.track}: ` + tr.notes.map(n => `${n.pitch}@${n.onset}(${n.durQ}q)` + (n.shape ? "[shape " + n.shape.map(([b, l]) => "+" + b + "b→" + l).join(" ") + "]" : "")).join(" ") + "\n";
  }
  return s;
});
