// CLI: SPC -> .notes.txt (discovery mode: pitch/time/duration/voice only),
// optionally a .mid. Mirrors tools/nsf/dump.mjs.
//   node tools/spc/dump.mjs song.spc --bpm 130 [--seconds 60] [--ts 4/4]
//        [--title name] [--root 3=C5 --root 7=A#3] [--mid out.mid] [--raw]
// --root takes the instrument number from the dump's header (or a sample
// number, or its key "srcn@addr") and the note the sample plays at
// PITCH=$1000; every note on that instrument moves together.
import { readFileSync, writeFileSync } from "node:fs";
import { parseSPC, runSPC } from "./spc.mjs";
import { reconstruct, toNotesTxt, SPC_SHAPE } from "./notes.mjs";
import { makeMidi } from "../nsf/midi-write.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const opt = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const opts = (name) => args.map((a, i) => a === "--" + name ? args[i + 1] : null).filter(Boolean);
if (!file || !opt("bpm")) {
  console.error("usage: node tools/spc/dump.mjs song.spc --bpm N [--seconds N] [--ts 4/4] [--title name] [--root k=NOTE ...] [--mid out.mid] [--raw]");
  process.exit(1);
}

const NAMES = {C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5, "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11};
function parseNote(s) { // "C5", "A#3", "Bb2", "60", "69.5"
  if (/^[\d.]+$/.test(s)) return +s;
  const m = /^([A-Ga-g][#b]?)(-?\d+)([+-]\d+c)?$/.exec(s.trim());
  if (!m) throw new Error("bad note: " + s);
  const cents = m[3] ? +m[3].slice(0, -1) / 100 : 0;
  return NAMES[m[1].toUpperCase()] + (+m[2] + 1) * 12 + cents;
}

const spc = parseSPC(readFileSync(file));
console.error(`# ${spc.name || file} — ${spc.game}${spc.artist ? " / " + spc.artist : ""}${spc.tags.seconds ? ` (${spc.tags.seconds}s before fade)` : ""}`);
const seconds = +opt("seconds", spc.tags.seconds || 60);
const [tsNum, tsDen] = opt("ts", "4/4").split("/").map(Number);
const roots = {};
for (const r of opts("root")) {
  const [k, note] = r.split("=");
  roots[/^\d+$/.test(k) ? +k : k] = parseNote(note);
}
// --root by instrument NUMBER (the header's "instrument N") needs the
// capture first; resolve ids to keys after the run
const cap = runSPC(spc, seconds);
if (cap.halted) console.error("# note: the SPC700 halted (SLEEP/STOP) — the driver stopped on its own");
const byId = new Map([...cap.instruments.values()].map(i => [i.id, i.key]));
for (const k of Object.keys(roots)) if (/^\d+$/.test(k) && byId.has(+k)) { roots[byId.get(+k)] = roots[k]; delete roots[k]; }
const r = reconstruct(cap, {roots});
console.error(`# ${cap.dspLog.length} DSP writes, ${cap.instruments.size} instruments, ${r.events.length} notes`);
for (const w of r.warnings || []) console.error("# warning: " + w);
const snap = !args.includes("--raw");
process.stdout.write(toNotesTxt(r, {bpm: +opt("bpm"), tsNum, tsDen, title: opt("title", spc.name || file), snap}));
if (opt("mid")) {
  writeFileSync(opt("mid"), makeMidi(r.events, {bpm: +opt("bpm"), tsNum, tsDen, frameSec: r.frameSec, snap, volMax: 127, shape: SPC_SHAPE}));
  console.error("# wrote " + opt("mid"));
}
