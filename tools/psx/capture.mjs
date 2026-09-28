// One PSF image → this song's parsed music and what its render needs. The
// app's capture, its chip render and the worker used to carry three copies
// of the find-the-song steps; one function now, as tools/n64/capture.mjs.
// The driver is recognised from the image (Sony's SEQ/VAB, or Square's AKAO
// in whichever header layout the file carries); the song is the one the mini
// names (pickAKAO: its own block, or the index its patch loads).
import { scanMagic } from "./psf.mjs";
import { firstSEQ } from "./seq.mjs";
import { parseVAB } from "./vab.mjs";
import { seqNotes, findInstrDat } from "./notes.mjs";
import { parseAKAO, akaoNotes, pickAKAO } from "./akao.mjs";
import { findSampleBank } from "./spu-render.mjs";

export function psfSong(ram, ranges, fileName) {
  const found = scanMagic(ram);
  const warnings = [];
  if (found.seq.length) {
    const f = firstSEQ(ram, found.seq);
    if (f && f.parsed) {
      const vab = found.vab.length ? parseVAB(ram.subarray(found.vab[0])) : null;
      const result = seqNotes(f.parsed.sequences[0], {vab});
      return {kind: "seq", result, renderable: !!vab, why: vab ? null : "a SEQ with no VAB bank in the image", warnings};
    }
  }
  const pick = pickAKAO(ram, ranges, fileName);
  if (!pick) throw new Error("no SEQ or AKAO music data in this file — a driver Night Roll cannot read yet");
  const table = findInstrDat(ram);
  const result = akaoNotes(parseAKAO(ram, pick.offset), {instr: {ram, offset: table ? table.offset : null}});
  if (pick.how) (result.seq.warnings || (result.seq.warnings = [])).push("song: " + pick.how);
  const bank = result.instr && result.instr.kind === "instr-dat" && table ? findSampleBank(ram, table) : null;
  const renderable = !!result.instr && !(result.instr.kind === "instr-dat" && !bank);
  return {kind: "akao", result, table, bank, renderable, why: renderable ? null : "no instrument table or sample bank in this rip", warnings};
}
