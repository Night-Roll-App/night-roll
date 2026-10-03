// tools/at.mjs <song> <bar.beat> [--span <bar.beat>] [--json]
// Everything sounding at a moment (or across a span), per track — onsets
// distinguished from notes still ringing. Facts only.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { loadSong, parseBQ, fmtBQ, pitchName, outJson } from "./query-lib.mjs";

const args = process.argv.slice(2).filter(a => a !== "--json");
const json = process.argv.includes("--json");
const spanIdx = args.indexOf("--span");
const spanArg = spanIdx >= 0 ? args.splice(spanIdx, 2)[1] : null;
const [songArg, bqArg] = args;
if (!songArg || !bqArg) { console.error("usage: at.mjs <song> <bar.beat> [--span <bar.beat>] [--json]"); process.exit(1); }

const doc = await loadSong(songArg);
const t0 = parseBQ(doc, bqArg);
const t1 = spanArg ? parseBQ(doc, spanArg) : t0 + 1;
const out = {song: doc.path, at: bqArg, span: spanArg || null, tracks: []};
for (const tr of doc.tracks) {
  const hits = tr.notes.filter(n => n.t < t1 && n.t + n.d > t0)
    .map(n => ({pitch: pitchName(n.p), midi: n.p, onset: fmtBQ(doc, n.t),
                durQ: +(n.d / doc.ppq).toFixed(3), vel: n.v,
                startsHere: n.t >= t0 && n.t < t1, sustainsFromEarlier: n.t < t0}));
  if (hits.length) out.tracks.push({track: tr.name, notes: hits});
}
outJson(json, out, o => {
  let s = `${o.song} @ ${o.at}${o.span ? "–" + o.span : ""}\n`;
  for (const tr of o.tracks) {
    s += `  ${tr.track}:\n`;
    for (const n of tr.notes)
      s += `    ${n.pitch}  onset ${n.onset}  ${n.durQ}q  v${n.vel}  ${n.sustainsFromEarlier ? "SUSTAINS from earlier" : "starts here"}\n`;
  }
  if (!o.tracks.length) s += "  (silence)\n";
  return s;
});
