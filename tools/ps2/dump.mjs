// CLI: PSF2/minipsf2 -> <name>.notes.txt and <name>.mid, discovery mode.
// Mirrors tools/psx/dump.mjs, reusing its .notes.txt/MIDI writer entirely
// (tools/psx/notes.mjs's toNotesTxt/makeMidi — no PS2-specific version of
// either exists, or is needed: sq.mjs's `seq` shape matches PS1 SEQ's).
//   node tools/ps2/dump.mjs song.psf2 [--lib driver.psf2lib] [--seconds S]
//                                     [--title name] [--out path/base]
//   node tools/ps2/dump.mjs bank.SQ --hd bank.HD --bd bank.BD ...   (bare files, no PSF2 container)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { isPSF2, loadPSF2Chain, mergePSF2 } from "./psf2.mjs";
import { isSQ, parseSQ } from "./sq.mjs";
import { parseHD, toBank } from "./hd.mjs";
import { ps2Song } from "./capture.mjs";
import { seqNotes, toNotesTxt, makeMidi, trimSeconds } from "../psx/notes.mjs";
import { bpmOf } from "../psx/seq.mjs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const opt = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
if (!file) {
  console.error("usage: node tools/ps2/dump.mjs song.psf2 [--lib driver.psf2lib] [--seconds S] [--title name] [--out base]");
  console.error("       node tools/ps2/dump.mjs bank.SQ [--hd bank.HD --bd bank.BD] ...");
  process.exit(1);
}

let bytes = readFileSync(file);
let result, kindNote, tagTitle = null;

if (isPSF2(bytes)) {
  const dir = dirname(file);
  const readLib = name => {
    const explicit = opt("lib");
    const p = explicit && basename(explicit).toLowerCase() === name.toLowerCase() ? explicit : join(dir, name);
    return existsSync(p) ? readFileSync(p) : (explicit && existsSync(explicit) ? readFileSync(explicit) : null);
  };
  const sources = await loadPSF2Chain(bytes, readLib, {name: basename(file)});
  const mini = sources.find(s => s.name === basename(file));
  tagTitle = mini.psf.tags.title || null;
  console.error(`# PSF2 v${mini.psf.version} "${tagTitle || ""}"${mini.psf.libs.length ? ` + ${mini.psf.libs.join(", ")}` : ""}: ${sources.map(s => `${s.name || "self"} (${s.files.length} files)`).join(", ")}${sources.every(s => s.psf.crcOk) ? "" : " (CRC mismatch)"}`);
  const files = mergePSF2(sources);
  const song = await ps2Song(files, mini);
  if (song.kind === "bgm-unimplemented") {
    console.error(`# ${song.why} (${song.source.bgm})`);
    process.exit(2);
  }
  console.error(`# picked: -s=${song.source.sq}${song.source.hd ? ` -h=${song.source.hd} -b=${song.source.bd}` : " (no bank named)"}`);
  if (song.why) console.error("# " + song.why);
  result = song.result;
  kindNote = `${result.seq.ppq} ticks/quarter, ${bpmOf(result.seq.tempo)}bpm, ${result.seq.timeSigs[0].num}/${result.seq.timeSigs[0].den}${result.seq.loop ? ", loop" : ""}`;
} else if (isSQ(bytes)) {
  const seq = parseSQ(bytes);
  let bank = null;
  if (opt("hd")) {
    const hd = parseHD(readFileSync(opt("hd")));
    const bd = opt("bd") ? readFileSync(opt("bd")) : null;
    bank = toBank(hd, bd);
  }
  result = seqNotes(seq, {vab: bank});
  kindNote = `${seq.ppq} ticks/quarter, ${bpmOf(seq.tempo)}bpm, ${seq.timeSigs[0].num}/${seq.timeSigs[0].den}${seq.loop ? ", loop" : ""}`;
} else {
  console.error("not a PSF2 file, and not a bare SQ file");
  process.exit(1);
}

for (const w of result.seq.warnings) console.error("# warning: " + w);
console.error("# " + kindNote);
result = trimSeconds(result, +opt("seconds", 0));

const base = opt("out", file.replace(/\.[^.]+$/, ""));
const title = opt("title", tagTitle || basename(base));
writeFileSync(base + ".notes.txt", toNotesTxt(result, {title}));
writeFileSync(base + ".mid", makeMidi(result));
console.error(`# ${result.notes.length} notes on channels ${result.channels.map(c => c + 1).join(",")} -> ${base}.notes.txt, ${base}.mid`);
