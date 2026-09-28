// CLI: SEQ/SEP (+ VAB) or PSF -> <name>.notes.txt and <name>.mid, discovery mode.
//   node tools/psx/dump.mjs song.seq [--vh bank.vh --vb bank.vb | --vab bank.vab]
//                                    [--seq N] [--seconds S] [--title name]
//                                    [--drums 5,6] [--out path/base]
//   node tools/psx/dump.mjs track.minipsf [--lib driver.psflib] [--akao N] ...
// A .psf/.minipsf is inflated with its _lib chain (looked up beside it, or
// --lib) into a RAM image, which is scanned for SEQ/VAB (libsnd games) and
// then for AKAO (Square's driver, every generation). Other drivers need emulation —
// RESEARCH.md §5.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseSEQ, isSEQ, bpmOf, firstSEQ } from "./seq.mjs";
import { parseVAB, isVAB } from "./vab.mjs";
import { isPSF, parsePSF, loadPSFChain, assembleRam, scanMagic } from "./psf.mjs";
import { scanAKAO, parseAKAO, akaoNotes, pickAKAO } from "./akao.mjs";
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
  const fs = firstSEQ(ram, found.seq); // a pQES that does not parse is named and skipped (Wild Arms)
  if (fs) for (const k of fs.skipped) console.error(`# pQES at 0x${(0x80000000 + k.offset).toString(16)} is not a SEQ: ${k.error}`);
  if (fs && fs.parsed) {
    bytes = ram.subarray(fs.offset);
    if (found.vab.length) vab = parseVAB(ram.subarray(found.vab[0]));
  } else if (akaos.length) {
    // the sequence the mini carries, or the one its patched song number names
    // (akao.mjs pickAKAO); --akao N picks among the mini's own / all blocks
    let off;
    if (opt("akao") != null) {
      const own = mini ? ranges.find(r => r.name === mini.name) : null;
      const inOwn = own ? akaos.filter(o => o >= (own.start & 0x1FFFFF) && o < (own.start & 0x1FFFFF) + own.size) : [];
      const list = inOwn.length ? inOwn : akaos, pick = +opt("akao");
      if (!list[pick]) { console.error(`# ${list.length} AKAO sequence(s); --akao ${pick} is out of range`); process.exit(1); }
      off = list[pick];
    } else {
      const p = pickAKAO(ram, ranges, basename(file));
      console.error(`# picked: ${p.how}`);
      off = p.offset;
    }
    akao = parseAKAO(ram, off);
    instrTable = findInstrDat(ram); // the driver's instrument table, for envelopes
    instrTable = {ram, offset: instrTable ? instrTable.offset : null}; // the image too: later drivers keep AKAO sample sets instead
    console.error(`# AKAO layout ${akao.version} id ${akao.id} @0x${((off | 0x80000000) >>> 0).toString(16)}: ${akao.blockSize} bytes, ${akao.tracks.length} voices (mask 0x${akao.mask.toString(16)}), reverb ${akao.reverbType}${akao.timestamp ? ", written " + akao.timestamp : ""}`);
  } else { console.error("# no SEQ or AKAO data in RAM: this driver is neither libsnd nor Square's; route B needed"); process.exit(2); }
}

let result, kindNote, suffix = "";
if (akao) {
  result = akaoNotes(akao, {instr: instrTable});
  if (result.instr) console.error(result.instr.kind === "akao-sets" ? `# instruments: ${result.instr.sets.length} AKAO sample set(s) in the image (ids ${result.instr.sets.map(s => s.id).join(", ")})` : `# instrument table (INSTR.DAT) at 0x${(0x80000000 + result.instr.offset).toString(16)}: envelopes per instrument`);
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
