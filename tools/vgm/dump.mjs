// CLI: VGM/VGZ -> <name>.notes.txt + <name>.mid (discovery mode: pitch,
// time, duration, channel, chip level; nothing interpretive).
//   node tools/vgm/dump.mjs song.vgm --bpm 130 [--seconds 60] [--ts 4/4]
//                                    [--title name] [--out dir] [--fit]
// --fit grid-fits the tempo around --bpm (the NSF fitter) and reports it.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parseVGM, isGzip } from "./vgm.mjs";
import { reconstruct, toNotesTxt, FRAME_SEC } from "./notes.mjs";
import { makeMidi } from "./midi-write.mjs";
import { fitBpm } from "../nsf/notes.mjs";

const args = process.argv.slice(2);
const FLAGS = new Set(["fit"]); // options that take no value
const opt = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = name => args.includes("--" + name);
let file = null;
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) { if (!FLAGS.has(args[i].slice(2))) i++; continue; }
  file = args[i];
}
if (!file || !opt("bpm")) {
  console.error("usage: node tools/vgm/dump.mjs song.vgm --bpm N [--seconds N] [--ts 4/4] [--title name] [--out dir] [--fit]");
  process.exit(1);
}
let bytes = new Uint8Array(readFileSync(file));
if (isGzip(bytes)) bytes = new Uint8Array(gunzipSync(bytes));
const vgm = parseVGM(bytes);
const g = vgm.gd3 || {};
console.error(`# ${g.track || basename(file)} — ${g.game || "?"} (${g.system || "?"}) — ${g.author || "?"}`);
console.error(`# VGM ${(vgm.version >> 8).toString(16)}.${(vgm.version & 255).toString(16).padStart(2, "0")}, ` +
  `YM2612 ${vgm.clocks.ym2612 || "-"} Hz, PSG ${vgm.clocks.psg || "-"} Hz, ` +
  `${(vgm.totalSamples / 44100).toFixed(2)}s` +
  (vgm.loopSample != null ? `, loop at ${(vgm.loopSample / 44100).toFixed(2)}s (${(vgm.loopSamples / 44100).toFixed(2)}s pass)` : ", no loop"));

const seconds = opt("seconds") ? +opt("seconds") : null;
const endSample = seconds ? Math.min(vgm.endSample, Math.round(seconds * 44100)) : vgm.endSample;
const [tsNum, tsDen] = opt("ts", "4/4").split("/").map(Number);
const events = reconstruct(vgm, {endSample});
let bpm = +opt("bpm");
if (flag("fit")) {
  const fitted = fitBpm(events.filter(e => e.midi != null), FRAME_SEC, bpm);
  console.error(`# grid fit around ${bpm}: ${fitted}`);
  bpm = fitted;
}
const counts = {};
for (const e of events) counts[e.channel] = (counts[e.channel] || 0) + 1;
console.error("# events: " + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", "));

const title = opt("title", g.track || basename(file, extname(file)));
const outDir = opt("out", dirname(file));
mkdirSync(outDir, {recursive: true});
const base = join(outDir, basename(file, extname(file)));
const loopSample = vgm.loopSample != null && vgm.loopSample < endSample ? vgm.loopSample : null;
writeFileSync(base + ".notes.txt", toNotesTxt(events, {frames: endSample, bpm, tsNum, tsDen, title, loopSample, gd3: vgm.gd3}));
writeFileSync(base + ".mid", makeMidi(events, {bpm, tsNum, tsDen, loopSample}));
console.error(`# wrote ${base}.notes.txt and ${base}.mid`);
