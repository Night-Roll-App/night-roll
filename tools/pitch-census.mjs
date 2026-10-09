// tools/pitch-census.mjs <song> [--track N|name] [--json]
// Every pitch class present: counts + total sounding duration, and which are
// ABSENT. Duration-weighted (six half-notes ≠ one 16th). Facts only.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { loadSong, PC_NAMES, isDrumTrack, outJson } from "./query-lib.mjs";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const ti = argv.indexOf("--track");
const trackArg = ti >= 0 ? argv.splice(ti, 2)[1] : null;
const songArg = argv.filter(a => a !== "--json")[0];
if (!songArg) { console.error("usage: pitch-census.mjs <song> [--track T] [--json]"); process.exit(1); }

const doc = await loadSong(songArg);
const tracks = doc.tracks.filter((tr, i) =>
  trackArg === null ? !isDrumTrack(tr) // kit pieces aren't pitch classes
  : (tr.name === trackArg || String(i) === trackArg));
const census = PC_NAMES.map(pc => ({pc, count: 0, quarters: 0}));
for (const tr of tracks) for (const n of tr.notes) {
  census[n.p % 12].count++;
  census[n.p % 12].quarters += n.d / doc.ppq;
}
census.forEach(c => c.quarters = +c.quarters.toFixed(2));
const present = census.filter(c => c.count);
const absent = census.filter(c => !c.count).map(c => c.pc);
outJson(json, {song: doc.path, track: trackArg, present, absent}, o => {
  let s = `${o.song}${o.track ? " track " + o.track : ""}\n`;
  for (const c of o.present) s += `  ${c.pc.padEnd(2)}  ×${String(c.count).padStart(3)}  ${c.quarters}q\n`;
  s += `  ABSENT: ${o.absent.join(" ") || "(none — full chromatic)"}\n`;
  return s;
});
