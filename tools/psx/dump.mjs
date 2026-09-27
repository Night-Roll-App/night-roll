// CLI: SEQ/SEP (+ VAB) or PSF -> <name>.notes.txt and <name>.mid, discovery mode.
//   node tools/psx/dump.mjs song.seq [--vh bank.vh --vb bank.vb | --vab bank.vab]
//                                    [--seq N] [--seconds S] [--title name]
//                                    [--drums 5,6] [--out path/base]
//   node tools/psx/dump.mjs track.minipsf [--lib driver.psflib] [--akao N] ...
// A .psf/.minipsf is inflated with its _lib chain (looked up beside it, or
// --lib) into a RAM image, which is scanned for SEQ/VAB (libsnd games) and
// then for AKAO (Square's driver: FF7). Other drivers need emulation —
// RESEARCH.md §5.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseSEQ, isSEQ, bpmOf } from "./seq.mjs";
import { parseVAB, isVAB } from "./vab.mjs";
import { isPSF, parsePSF, loadPSFChain, assembleRam, scanMagic } from "./psf.mjs";
import { scanAKAO, parseAKAO, akaoNotes } from "./akao.mjs";
import { findInstrDat } from "./instr.mjs";
import { seqNotes, trimSeconds, toNotesTxt, makeMidi } from "./notes.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const opt = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
if (!file) {
  console.error("usage: node tools/psx/dump.mjs song.seq|track.psf [--vh bank.vh --vb bank.vb | --vab bank.vab] [--lib x.psflib] [--seq N] [--akao N] [--seconds S] [--title name] [--drums 5,6] [--out base]");
  process.exit(1);
}

let bytes = readFileSync(file);
let vab = null, akao = null, tagTitle = null, instrTable = null;
if (isPSF(bytes)) {
  const dir = dirname(file);
  const readLib = name => {
    const explicit = opt("lib");
    const p = explicit && basename(explicit).toLowerCase() === name.toLowerCase() ? explicit : join(dir, name);
    return existsSync(p) ? readFileSync(p) : (explicit && existsSync(explicit) ? readFileSync(explicit) : null);
  };
  const chain = await loadPSFChain(bytes, readLib, {name: basename(file)});
  const mini = chain.find(c => c.name === basename(file));
  const psf = mini.psf;
  tagTitle = psf.tags.title || null;
  const {ram, pc, ranges} = assembleRam(chain);
  console.error(`# PSF v${psf.version} "${tagTitle || ""}"${psf.libs.length ? ` + ${psf.libs.join(", ")}` : ""}: ${ranges.map(r => `${r.name || "self"} @0x${r.start.toString(16)}+0x${r.size.toString(16)}`).join(", ")}; entry 0x${pc.toString(16)}${chain.every(c => c.psf.crcOk) ? "" : " (CRC mismatch)"}`);
  const found = scanMagic(ram);
  const akaos = scanAKAO(ram);
  console.error(`# RAM scan: ${found.seq.length} SEQ/SEP, ${found.vab.length} VAB, ${akaos.length} AKAO`);
  if (found.seq.length) {
    bytes = ram.subarray(found.seq[0]);
    if (found.vab.length) vab = parseVAB(ram.subarray(found.vab[0]));
  } else if (akaos.length) {
    // prefer the sequence the mini itself carries over any in the lib
    const own = mini ? ranges.find(r => r.name === mini.name) : null;
    const inOwn = own ? akaos.filter(o => o >= (own.start & 0x1FFFFF) && o < (own.start & 0x1FFFFF) + own.size) : [];
    const pick = +opt("akao", 0);
    const list = inOwn.length ? inOwn : akaos;
    if (!list[pick]) { console.error(`# ${list.length} AKAO sequence(s); --akao ${pick} is out of range`); process.exit(1); }
    akao = parseAKAO(ram, list[pick]);
    instrTable = findInstrDat(ram); // the driver's instrument table, for envelopes
    if (instrTable) instrTable = {ram, offset: instrTable.offset};
    console.error(`# AKAO id ${akao.id} @0x${((list[pick] | 0x80000000) >>> 0).toString(16)}: ${akao.length} bytes, ${akao.tracks.length} voices (mask 0x${akao.mask.toString(16)}), reverb ${akao.reverbType}, written ${akao.timestamp}`);
  } else { console.error("# no SEQ or AKAO data in RAM: this driver is neither libsnd nor Square's; route B needed"); process.exit(2); }
}

let result, kindNote, suffix = "";
if (akao) {
  if (instrTable) console.error(`# instrument table (INSTR.DAT) at 0x${(0x80000000 + instrTable.offset).toString(16)}: envelopes per instrument`);
  result = akaoNotes(akao, {instr: instrTable});
  kindNote = `${result.seq.ppq} ticks/quarter, ${bpmOf(result.seq.tempo)}bpm, ${result.seq.timeSigs[0].num}/${result.seq.timeSigs[0].den}${result.seq.loop ? ", loop" : ""}`;
} else {
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
  if (parsed.kind === "sep") { suffix = "-" + which; console.error(`# SEP with ${parsed.sequences.length} sequences (ids ${parsed.sequences.map(s => s.id).join(",")}); dumping --seq ${which}`); }
  kindNote = `${seq.ppq} ticks/quarter, ${bpmOf(seq.tempo)}bpm, ${seq.timeSigs[0].num}/${seq.timeSigs[0].den}, ${seq.events.length} events${seq.loop ? ", loop" : ""}`;
  const drums = opt("drums", "").split(",").filter(Boolean).map(Number);
  result = seqNotes(seq, {vab, drums});
}
for (const w of result.seq.warnings) console.error("# warning: " + w);
console.error("# " + kindNote);
result = trimSeconds(result, +opt("seconds", 0));

const base = opt("out", file.replace(/\.[^.]+$/, "") + suffix);
const title = opt("title", tagTitle || basename(base));
writeFileSync(base + ".notes.txt", toNotesTxt(result, {title}));
writeFileSync(base + ".mid", makeMidi(result));
console.error(`# ${result.notes.length} notes on channels ${result.channels.map(c => c + 1).join(",")} -> ${base}.notes.txt, ${base}.mid`);
