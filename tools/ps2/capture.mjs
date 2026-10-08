// One PSF2 image (already loaded as a merged virtual filesystem via
// psf2.mjs's loadPSF2Chain/mergePSF2) → this song's parsed music, mirroring
// tools/psx/capture.mjs's psfSong. Which driver a set uses is read from
// the files themselves (CLAUDE.md "no one-time hacks in capture engines"):
//
// Sony's stock driver (SQ/HD/BD) names its song, per-mini, in a plain-text
// psf2.ini inside the MINI's own filesystem — literally a command line,
// e.g. Dark Cloud's "sq.irx -r=3 -d=4096 -s=7A3A3752.SQ -h=75A4397E.HD
// -b=7881E461.BD" — so the -s/-h/-b arguments are the file names to pull
// out of the merged (mini + lib) filesystem. No per-game table: any set
// whose mini carries a psf2.ini with -s/-h/-b names is read the same way.
//
// Square Enix's own driver (Final Fantasy X and kin) keeps a "BGM "-tagged
// sequence + a "WD" bank directly in the mini's own filesystem (no ini
// needed to find them — VGMTrans's SquarePS2Scanner just scans for the
// magic). Its opcode table is NOT AKAO's (confirmed by reading VGMTrans's
// SquarePS2Seq.cpp: entirely different, simpler byte codes — 0x10/0x11/
// 0x12/0x13 note-on variants, 0x20 program change, 0x5C pitch bend, no
// degree/length-index encoding at all) — tools/ps2/bgm.mjs and tools/ps2/
// wd.mjs (milestone 3) read it the same way this module reads SQ/HD/BD:
// bgmNotes() plays the same role seqNotes() does below, wd.mjs's toBank()
// the same role hd.mjs's does.
import { findPSF2, readPSF2File } from "./psf2.mjs";
import { parseSQ } from "./sq.mjs";
import { parseHD, toBank } from "./hd.mjs";
import { parseBGM, bgmNotes } from "./bgm.mjs";
import { parseWD, toBank as wdToBank } from "./wd.mjs";
import { seqNotes } from "../psx/notes.mjs";

async function readIni(files, miniSource, inflate) {
  for (const [, entry] of files) {
    if (entry.source !== miniSource) continue;
    if (!/(^|\/)psf2\.ini$/i.test(entry.path)) continue;
    const bytes = await readPSF2File(miniSource.psf.reserved, entry, inflate);
    return new TextDecoder("latin1").decode(bytes);
  }
  return null;
}

function iniArg(ini, flag) {
  const m = ini.match(new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=(\\S+)"));
  return m ? m[1] : null;
}

async function readNamed(files, name, inflate) {
  const entry = findPSF2(files, name);
  if (!entry) return null;
  return readPSF2File(entry.source.psf.reserved, entry, inflate);
}

export async function ps2Song(files, miniSource, {inflate = null} = {}) {
  const warnings = [];
  const ini = await readIni(files, miniSource, inflate);
  if (ini) {
    const sName = iniArg(ini, "-s"), hName = iniArg(ini, "-h"), bName = iniArg(ini, "-b");
    if (sName) {
      const sqBytes = await readNamed(files, sName, inflate);
      if (!sqBytes) throw new Error(`psf2.ini names -s=${sName} but no such file is in this image`);
      const seq = parseSQ(sqBytes);
      let bank = null;
      if (hName) {
        const hdBytes = await readNamed(files, hName, inflate);
        if (hdBytes) {
          const hd = parseHD(hdBytes);
          const bdBytes = bName ? await readNamed(files, bName, inflate) : null;
          if (!bdBytes) warnings.push(`psf2.ini names -h=${hName} but -b=${bName || "(none)"} did not resolve to a file: sample bank has no audio bytes`);
          bank = toBank(hd, bdBytes);
        } else warnings.push(`psf2.ini names -h=${hName} but no such file is in this image`);
      }
      const result = seqNotes(seq, {vab: bank});
      // PS2 capture v2 (tools/psx/notes.mjs makeMidi): the ini's -r/-d are
      // sq.irx's effect mode and depth — it hands them to libsd as the
      // effect mode and EVOL L/R (disassembly, NIGHT-ROLL.md "PS2 capture v2")
      const num = flag => { const v = iniArg(ini, flag); return v != null && /^-?\d+$/.test(v) ? +v : null; };
      result.ps2 = {kind: "sq", reverb: {mode: num("-r"), depth: num("-d")}};
      (result.seq.warnings || (result.seq.warnings = [])).push(...warnings);
      return {kind: "sq", result, bank, renderable: !!bank, why: bank ? null : "no HD/BD bank in this image", warnings, source: {sq: sName, hd: hName, bd: bName}};
    }
  }
  // Square Enix's own driver (see module header): a mini carrying a ".bgm"
  // names the sequence directly, no ini needed — the paired ".wd" bank is
  // found by extension too (usually exactly one per merged mini+lib set; if
  // more than one turns up, the one whose own header id matches the BGM's
  // assocWDID wins).
  for (const [path, entry] of files) {
    if (/\.bgm$/i.test(path)) {
      const bgmBytes = await readPSF2File(entry.source.psf.reserved, entry, inflate);
      const seq = parseBGM(bgmBytes);
      const wdCandidates = [...files.values()].filter(e => /\.wd$/i.test(e.path));
      let bank = null, wdName = null;
      if (!wdCandidates.length) {
        warnings.push(`this BGM names WD id ${seq.assocWDID} but no .wd file is in this image: sample bank has no audio bytes`);
      } else {
        let chosen = wdCandidates[0];
        if (wdCandidates.length > 1) {
          let matched = null;
          for (const c of wdCandidates) {
            const b = await readPSF2File(c.source.psf.reserved, c, inflate);
            if (b.length >= 4 && new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(2, true) === seq.assocWDID) { matched = c; break; }
          }
          chosen = matched || chosen;
          if (!matched) warnings.push(`${wdCandidates.length} .wd files in this image, none named WD id ${seq.assocWDID}: using ${chosen.path}`);
        }
        const wdBytes = await readPSF2File(chosen.source.psf.reserved, chosen, inflate);
        const wd = parseWD(wdBytes);
        if (wd.id !== seq.assocWDID) warnings.push(`this BGM names WD id ${seq.assocWDID}; ${chosen.path} is WD id ${wd.id} (used anyway: the only/best match in this image)`);
        bank = wdToBank(wd);
        wdName = chosen.path;
      }
      const result = bgmNotes(seq, {vab: bank});
      result.ps2 = {kind: "bgm"};
      (result.seq.warnings || (result.seq.warnings = [])).push(...warnings);
      return {kind: "bgm", result, bank, renderable: !!bank, why: bank ? null : "no WD bank in this image", warnings, source: {bgm: entry.path, wd: wdName}};
    }
  }
  throw new Error("no PS2 sequence data found in this image — a driver Night Roll cannot read yet");
}
