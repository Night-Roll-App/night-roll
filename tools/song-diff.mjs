// tools/song-diff.mjs <old.mid> <new.mid> [--json]
// Per-track added / removed / changed notes, de-duplicated, grouped by bar.
// The hand-rolled diff from 2026-08-18, correct by default.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { loadSong, fmtBQ, pitchName, outJson } from "./query-lib.mjs";

const argv = process.argv.slice(2).filter(a => a !== "--json");
const json = process.argv.includes("--json");
const [oldArg, newArg] = argv;
if (!oldArg || !newArg) { console.error("usage: song-diff.mjs <old.mid> <new.mid> [--json]"); process.exit(1); }

const A = await loadSong(oldArg), B = await loadSong(newArg);
const key = n => n.t + ":" + n.p;
const out = {old: A.path, new: B.path, tracks: []};
const names = [...new Set([...A.tracks.map(t => t.name), ...B.tracks.map(t => t.name)])];
for (const name of names) {
  const ta = A.tracks.find(t => t.name === name), tb = B.tracks.find(t => t.name === name);
  const ma = new Map((ta ? ta.notes : []).map(n => [key(n), n]));
  const mb = new Map((tb ? tb.notes : []).map(n => [key(n), n]));
  const fmt = (doc, n) => `${pitchName(n.p)}@${fmtBQ(doc, n.t)}(${+(n.d / doc.ppq).toFixed(3)}q v${n.v})`;
  const added = [...mb.values()].filter(n => !ma.has(key(n))).map(n => fmt(B, n));
  const removed = [...ma.values()].filter(n => !mb.has(key(n))).map(n => fmt(A, n));
  const changed = [...mb.values()].filter(n => {
    const o = ma.get(key(n));
    return o && (o.d !== n.d || o.v !== n.v);
  }).map(n => fmt(A, ma.get(key(n))) + " → " + fmt(B, n));
  if (added.length || removed.length || changed.length || !ta || !tb)
    out.tracks.push({track: name, onlyIn: !ta ? "new" : !tb ? "old" : undefined, added, removed, changed});
}
outJson(json, out, o => {
  let s = `${o.old} → ${o.new}\n`;
  if (!o.tracks.length) return s + "  identical (by start+pitch, duration, velocity)\n";
  for (const tr of o.tracks) {
    s += `  ${tr.track}${tr.onlyIn ? " (only in " + tr.onlyIn + ")" : ""}:\n`;
    for (const x of tr.added) s += `    + ${x}\n`;
    for (const x of tr.removed) s += `    - ${x}\n`;
    for (const x of tr.changed) s += `    ~ ${x}\n`;
  }
  return s;
});
