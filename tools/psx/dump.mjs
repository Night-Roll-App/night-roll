// CLI: SEQ/SEP (+ VAB) -> <name>.notes.txt and <name>.mid, discovery mode.
//   node tools/psx/dump.mjs song.seq [--vh bank.vh --vb bank.vb | --vab bank.vab]
//                                    [--seq N] [--seconds S] [--title name]
//                                    [--drums 5,6] [--out path/base]
// A .psf/.minipsf input is inflated and scanned for embedded SEQ/VAB data
// (works for libsnd-driven games; other drivers need emulation — RESEARCH.md).
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseSEQ, isSEQ, bpmOf } from "./seq.mjs";
import { parseVAB, isVAB } from "./vab.mjs";
import { isPSF, parsePSF, inflatePSF, scanMagic } from "./psf.mjs";
import { seqNotes, trimSeconds, toNotesTxt, makeMidi } from "./notes.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const opt = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
if (!file) {
  console.error("usage: node tools/psx/dump.mjs song.seq [--vh bank.vh --vb bank.vb | --vab bank.vab] [--seq N] [--seconds S] [--title name] [--drums 5,6] [--out base]");
  process.exit(1);
}

let bytes = readFileSync(file);
let vab = null;
if (isPSF(bytes)) {
  const psf = parsePSF(bytes);
  if (psf.libs.length) console.error(`# minipsf: needs ${psf.libs.join(", ")} — its driver and bank live there; scanning this file's own data only`);
  const exe = await inflatePSF(psf);
  const found = scanMagic(exe);
  console.error(`# PSF v${psf.version} "${psf.tags.title || ""}" — ${found.seq.length} SEQ/SEP, ${found.vab.length} VAB in the program image${psf.crcOk ? "" : " (CRC mismatch)"}`);
  if (!found.seq.length) { console.error("# no SEQ data in the image: this driver is not libsnd, or the sequence is in a lib; route B needed"); process.exit(2); }
  bytes = exe.subarray(found.seq[0]);
  if (found.vab.length) vab = parseVAB(exe.subarray(found.vab[0]));
}
if (!isSEQ(bytes)) { console.error("not a SEQ/SEP (or PSF) file"); process.exit(1); }

if (opt("vab")) vab = parseVAB(readFileSync(opt("vab")));
else if (opt("vh")) vab = parseVAB(readFileSync(opt("vh")), opt("vb") ? readFileSync(opt("vb")) : null);
if (vab) {
  console.error(`# VAB v${vab.version}: ${vab.numPrograms} programs, ${vab.numTones} tones, ${vab.numVags} samples${vab.body ? "" : " (header only — no sample roots)"}`);
  for (const w of vab.warnings) console.error("# VAB warning: " + w);
}

const parsed = parseSEQ(bytes);
const which = +opt("seq", 0);
const seq = parsed.sequences[which];
if (!seq) { console.error(`# ${parsed.kind} has ${parsed.sequences.length} sequences; --seq ${which} is out of range`); process.exit(1); }
if (parsed.kind === "sep") console.error(`# SEP with ${parsed.sequences.length} sequences (ids ${parsed.sequences.map(s => s.id).join(",")}); dumping --seq ${which}`);
for (const w of seq.warnings) console.error("# SEQ warning: " + w);
console.error(`# ${seq.ppq} ticks/quarter, ${bpmOf(seq.tempo)}bpm, ${seq.timeSigs[0].num}/${seq.timeSigs[0].den}, ${seq.events.length} events${seq.loop ? ", loop" : ""}`);

const drums = opt("drums", "").split(",").filter(Boolean).map(Number);
let result = seqNotes(seq, {vab, drums});
result = trimSeconds(result, +opt("seconds", 0));

const base = opt("out", file.replace(/\.[^.]+$/, "") + (parsed.kind === "sep" ? "-" + which : ""));
const title = opt("title", basename(base));
writeFileSync(base + ".notes.txt", toNotesTxt(result, {title}));
writeFileSync(base + ".mid", makeMidi(result));
console.error(`# ${result.notes.length} notes on channels ${result.channels.map(c => c + 1).join(",")} -> ${base}.notes.txt, ${base}.mid`);
