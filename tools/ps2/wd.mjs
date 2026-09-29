// Square Enix's PS2 instrument bank (WD) — the counterpart to tools/ps2/
// bgm.mjs's sequence reader (docs/plans/ps2.md milestone 3). Unlike Sony's
// stock HD+BD pair, a WD file is self-contained: header, an instrument
// pointer table, every instrument's key-split regions, then one sample
// section of concatenated PS-ADPCM (SPU-ADPCM — byte-identical to PS1's VAG,
// same as HD/BD; docs/plans/ps2.md §5) samples, all in the same file. Byte
// layout read from VGMTrans's WD.cpp/WD.h and its shared PSXSPU.cpp/h
// (PSXSampColl's sample-section scan, psxConvADSR's ADSR bit layout), then
// cross-checked against every one of 92 real Final Fantasy X .wd files
// (tests/ps2-real.test.mjs):
//   Header (0x10 bytes): "WD" (2) + bank id u16 LE (0x02) + sample-section
//   size u32 LE (0x04, some titles carry a bogus value here per VGMTrans's
//   own comment — not needed for decoding, see toBank() below) + instrument
//   count u32 LE (0x08) + total region count u32 LE (0x0C).
//   Instrument pointer table at 0x20: instrument count × u32 LE, each a
//   byte offset (from the WD's own start) to that instrument's first
//   region; a 0xFFFFFFFF entry is a padded unused slot (VGMTrans's own
//   "Bouncer" guard) and truncates the instrument count from there.
//   Regions, 0x20 bytes each, packed contiguously starting right after the
//   pointer table: instrument i's own regions run from its pointer to the
//   NEXT instrument's pointer (or, for the last instrument, to the sample
//   section's own start). The sample section's start is therefore
//   `instrument[0]'s own pointer + totalRegions * 0x20` — confirmed on all
//   92 real files: the 16 bytes there are always zero, the shape every real
//   PS-ADPCM sample starts with (tools/psx/vab.mjs's decodeAdpcm()).
//   Region fields: stereo/first/last-region flag bits (byte 0x00, 0x01) +
//   sample offset u32 LE (0x04, low nibble masked off — VGMTrans's own
//   comment: some real files, including FFX's, point to 0x----C offsets for
//   no explained reason) + ADSR1/ADSR2 u16 LE (0x0C, 0x0E — the SAME PSX
//   ADSR bit layout tools/psx/instr.mjs's adsrRecord() already decodes,
//   reused unmodified) + finetune byte (0x12) + unity-key byte (0x13, the
//   real key is 0x3A minus this byte) + key-high byte (0x14) + attenuation
//   byte (0x16, already a 0-127 volume, no scaling) + pan byte (0x17).
//   A region's own key-LOW isn't stored: it chains from the previous
//   region's key-high in the same instrument (VGMTrans's WDInstr::loadInstr:
//   the first-region flag resets to 0; two regions sharing the same
//   key-high share the same key-low too — real FFX instruments use this for
//   true stereo pairs, two regions with separate sample data covering the
//   identical key range, one panned each way — confirmed directly: "In
//   Zanarkand"'s solo-piano instrument pairs pan bytes 128/255 across
//   otherwise-identical key ranges).
//   "Loop Start" (u32 @ 0x08) is NOT used here: real playback takes the
//   loop point from the in-band ADPCM block flag (bit 2 of each block's
//   flag byte) exactly like PS1's own VAG/VAB (PSXSPU.cpp's own comment:
//   "in wd, this info is stored in the instrset" — the header field is a
//   secondary/legacy value its own decoder doesn't actually decode from),
//   and tools/psx/vab.mjs's decodeAdpcm() already reads that flag bit —
//   nothing PS2-specific needed.
//
// One field disagrees with VGMTrans's own conversion, found by reading real
// data, not by assumption (CLAUDE.md "the file wins"): WD.cpp's own pan
// conversion collapses EVERY raw byte 0-127 to a flat centre (0.5) and only
// treats bytes 128-255 as real pan data. But real FFX regions carry varied,
// non-default pan bytes across 0-127 too (measured across all 92 files: 0,
// 30, 40, 45, 50, 60, 64, 70, 84, 90, 100, 110 all appear, not just a lazy
// "centre or nothing"), and 128-255's own values are IDENTICAL to 0-127's
// once the top bit is masked off — 128->0, 192->64, 255->127, matching
// VGMTrans's own >127 formula exactly at every point it bothers to check.
// So this reader takes the pan byte as `raw & 0x7F` uniformly (0-127, 64 =
// centre — the same convention tools/psx/vab.mjs's tone.pan already uses),
// which keeps every real pan value VGMTrans's own reader would discard.
//
// toBank() reshapes a parsed WD into the SAME VAB-shaped object
// tools/ps2/hd.mjs's toBank() produces for Sony's HD/BD (programs[].tones[]
// with {min,max,vag,center,shift,adsr1,adsr2,vol,pan}, a 1-based vags[] with
// {offset,size}, .body, ._pcm) — one tone PER REGION (a stereo pair becomes
// two tones sharing a key range, hard-panned apart; tonesFor() layers both,
// so they sum to the real stereo image with no stereo-specific code at all).
// A region's `vag.size` is set to "everything from its own sample offset to
// the end of the sample section" — decodeAdpcm() already stops at the first
// end-flagged ADPCM block regardless of how generous the length it's given
// is (tools/psx/vab.mjs), so this reader never needs to know a sample's
// real length itself, matching how HD/BD's own last-VAG entry already works.

function tagAt(d, o, str) {
  if (d.length < o + str.length) return false;
  for (let i = 0; i < str.length; i++) if (d[o + i] !== str.charCodeAt(i)) return false;
  return true;
}

export function isWD(buf) {
  const d = new Uint8Array(buf);
  return d.length >= 0x24 && tagAt(d, 0, "WD");
}

// finetune_table, verbatim from VGMTrans's WD.cpp (256 entries; index 0 =
// 0x10000 = unity, index 255 = 0x10F29, a fixed-point ratio table spanning
// one semitone). finetune_coeff there (0.025766555011594949755217727389848)
// is exactly 100/(table[255]-0x10000) = 100/3881 — precomputed for a fixed
// table, kept here as the exact fraction instead of the float literal.
const FINETUNE_TABLE = [
  0x10000, 0x1000E, 0x1001D, 0x1002C, 0x1003B, 0x10049, 0x10058, 0x10067, 0x10076, 0x10085,
  0x10094, 0x100A2, 0x100B1, 0x100C0, 0x100CF, 0x100DE, 0x100ED, 0x100FB, 0x1010A, 0x10119,
  0x10128, 0x10137, 0x10146, 0x10154, 0x10163, 0x10172, 0x10181, 0x10190, 0x1019F, 0x101AE,
  0x101BD, 0x101CC, 0x101DA, 0x101E9, 0x101F8, 0x10207, 0x10216, 0x10225, 0x10234, 0x10243,
  0x10252, 0x10261, 0x10270, 0x1027E, 0x1028D, 0x1029C, 0x102AB, 0x102BA, 0x102C9, 0x102D8,
  0x102E7, 0x102F6, 0x10305, 0x10314, 0x10323, 0x10332, 0x10341, 0x10350, 0x1035F, 0x1036E,
  0x1037D, 0x1038C, 0x1039B, 0x103AA, 0x103B9, 0x103C8, 0x103D7, 0x103E6, 0x103F5, 0x10404,
  0x10413, 0x10422, 0x10431, 0x10440, 0x1044F, 0x1045E, 0x1046D, 0x1047C, 0x1048B, 0x1049A,
  0x104A9, 0x104B8, 0x104C7, 0x104D6, 0x104E5, 0x104F5, 0x10504, 0x10513, 0x10522, 0x10531,
  0x10540, 0x1054F, 0x1055E, 0x1056D, 0x1057C, 0x1058B, 0x1059B, 0x105AA, 0x105B9, 0x105C8,
  0x105D7, 0x105E6, 0x105F5, 0x10604, 0x10614, 0x10623, 0x10632, 0x10641, 0x10650, 0x1065F,
  0x1066E, 0x1067E, 0x1068D, 0x1069C, 0x106AB, 0x106BA, 0x106C9, 0x106D9, 0x106E8, 0x106F7,
  0x10706, 0x10715, 0x10725, 0x10734, 0x10743, 0x10752, 0x10761, 0x10771, 0x10780, 0x1078F,
  0x1079E, 0x107AE, 0x107BD, 0x107CC, 0x107DB, 0x107EA, 0x107FA, 0x10809, 0x10818, 0x10827,
  0x10837, 0x10846, 0x10855, 0x10865, 0x10874, 0x10883, 0x10892, 0x108A2, 0x108B1, 0x108C0,
  0x108D0, 0x108DF, 0x108EE, 0x108FD, 0x1090D, 0x1091C, 0x1092B, 0x1093B, 0x1094A, 0x10959,
  0x10969, 0x10978, 0x10987, 0x10997, 0x109A6, 0x109B5, 0x109C5, 0x109D4, 0x109E3, 0x109F3,
  0x10A02, 0x10A12, 0x10A21, 0x10A30, 0x10A40, 0x10A4F, 0x10A5E, 0x10A6E, 0x10A7D, 0x10A8D,
  0x10A9C, 0x10AAB, 0x10ABB, 0x10ACA, 0x10ADA, 0x10AE9, 0x10AF8, 0x10B08, 0x10B17, 0x10B27,
  0x10B36, 0x10B46, 0x10B55, 0x10B64, 0x10B74, 0x10B83, 0x10B93, 0x10BA2, 0x10BB2, 0x10BC1,
  0x10BD1, 0x10BE0, 0x10BF0, 0x10BFF, 0x10C0F, 0x10C1E, 0x10C2E, 0x10C3D, 0x10C4D, 0x10C5C,
  0x10C6C, 0x10C7B, 0x10C8B, 0x10C9A, 0x10CAA, 0x10CB9, 0x10CC9, 0x10CD8, 0x10CE8, 0x10CF7,
  0x10D07, 0x10D16, 0x10D26, 0x10D35, 0x10D45, 0x10D55, 0x10D64, 0x10D74, 0x10D83, 0x10D93,
  0x10DA2, 0x10DB2, 0x10DC1, 0x10DD1, 0x10DE1, 0x10DF0, 0x10E00, 0x10E0F, 0x10E1F, 0x10E2F,
  0x10E3E, 0x10E4E, 0x10E5D, 0x10E6D, 0x10E7D, 0x10E8C, 0x10E9C, 0x10EAC, 0x10EBB, 0x10ECB,
  0x10EDB, 0x10EEA, 0x10EFA, 0x10F09, 0x10F19, 0x10F29,
];
const FINETUNE_COEFF = 100 / (FINETUNE_TABLE[255] - 0x10000);

export function parseWD(buf) {
  const d = new Uint8Array(buf);
  if (!isWD(d)) throw new Error('not a WD file (no "WD" signature)');
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const id = view.getUint16(2, true);
  const sampSectSizeRaw = view.getUint32(4, true);
  const sampSectSize = sampSectSizeRaw < 0x40 ? 0 : sampSectSizeRaw; // "some songs ... have bizarre values here" (VGMTrans's own guard); unused below regardless (see module header)
  let numInstrs = view.getUint32(8, true);
  const totalRegions = view.getUint32(0xC, true);
  const warnings = [];

  const instrPtrs = [];
  for (let i = 0; i < numInstrs; i++) {
    const ptr = view.getUint32(0x20 + i * 4, true);
    if (ptr === 0xFFFFFFFF) { numInstrs = i; break; } // padded/unused trailing slot
    instrPtrs.push(ptr);
  }
  if (!instrPtrs.length) throw new Error("WD: no instruments (empty pointer table)");
  const sampCollOff = instrPtrs[0] + totalRegions * 0x20;
  const body = d.subarray(Math.min(sampCollOff, d.length));
  if (sampCollOff >= d.length || d[sampCollOff] || d[sampCollOff + 1] || d[sampCollOff + 2] || d[sampCollOff + 3])
    warnings.push(`the computed sample-section offset (0x${sampCollOff.toString(16)}) isn't 16 zero bytes here — this file's layout may not match the reader's assumptions`);

  const instruments = [];
  for (let i = 0; i < instrPtrs.length; i++) {
    const start = instrPtrs[i];
    const end = i + 1 < instrPtrs.length ? instrPtrs[i + 1] : sampCollOff;
    const nRegions = Math.max(0, Math.floor((end - start) / 0x20));
    const regions = [];
    let prevKeyHigh = null, prevKeyLow = null;
    for (let k = 0; k < nRegions; k++) {
      const o = start + k * 0x20;
      const flagsByte = d[o + 1];
      const firstRegion = flagsByte & 1, lastRegion = (flagsByte >> 1) & 1;
      const sampOffset = view.getUint32(o + 4, true) & 0xFFFFFFF0; // relative to the sample section's own start (confirmed: instrument 0's first region always reads 0 here, landing exactly on sampCollOff's own 16 zero bytes)
      const adsr1 = view.getUint16(o + 0xC, true), adsr2 = view.getUint16(o + 0xE, true);
      const fineTuneByte = d[o + 0x12];
      // signed, not the plain unsigned byte VGMTrans's own read implies: real
      // FFX regions for higher key ranges carry raw bytes up to 236+ (e.g.
      // "In Zanarkand"'s own instrument, key range 79-84, raw 230) — read as
      // unsigned that formula lands a unity key around -172 (unplayable,
      // silent — the note's pitch ratio explodes and the voice runs off the
      // end of its sample in a handful of frames); read as signed i8 it lands
      // on 84, exactly the top of that same region's own key range. Found by
      // rendering real audio end to end (scratch/ps2-app-render.mjs came back
      // with one whole track's RMS at 0.0 until this fix).
      const unityByte = view.getInt8(o + 0x13);
      const unityKey = 0x3A - unityByte;
      let keyHigh = d[o + 0x14];
      const atten = d[o + 0x16];
      const panByte = d[o + 0x17];

      let keyLow;
      if (firstRegion) keyLow = 0;
      else if (prevKeyLow != null) keyLow = keyHigh === prevKeyHigh ? prevKeyLow : prevKeyHigh + 1;
      else keyLow = 0;
      if (lastRegion) keyHigh = 0x7F;
      prevKeyHigh = keyHigh; prevKeyLow = keyLow;

      const cents = (FINETUNE_TABLE[fineTuneByte] - 0x10000) * FINETUNE_COEFF - 50; // -50..+50 cents across the byte's full range
      regions.push({
        keyLow, keyHigh, sampOffset, adsr1, adsr2,
        unityKey, shift: Math.round(cents * 128 / 100), // tools/psx/vab.mjs's tone.shift unit: 1/128 semitone
        vol: atten, pan: panByte & 0x7F, // see module header: real data, not VGMTrans's own >127-only formula
        degenerate: keyLow > keyHigh || keyLow > 127,
      });
    }
    instruments.push({index: i, regions});
  }

  return {id, sampSectSize, numInstrs: instrPtrs.length, totalRegions, sampCollOff, instruments, body, warnings};
}

// wd: parseWD()'s result. -> a VAB-shaped bank (see module header).
export function toBank(wd) {
  const {instruments, body, warnings} = wd;
  const vags = [null]; // 1-based, matching tools/psx/vab.mjs's convention
  const bankPrograms = new Array(128).fill(null);
  const bankWarnings = [...warnings];
  let degenerateCount = 0;
  for (const instr of instruments) {
    const tones = [];
    for (const r of instr.regions) {
      if (r.degenerate) { degenerateCount++; continue; }
      const vagIndex = vags.length;
      const size = body ? Math.max(0, body.length - r.sampOffset) : 0; // generous: decodeAdpcm() self-terminates at the real end-flagged block
      vags.push({index: vagIndex, offset: r.sampOffset, size});
      tones.push({
        min: r.keyLow, max: r.keyHigh, vag: vagIndex,
        center: r.unityKey, shift: r.shift,
        vol: r.vol, pan: r.pan, adsr1: r.adsr1, adsr2: r.adsr2,
      });
    }
    if (tones.length) bankPrograms[instr.index] = {index: instr.index, tones, mvol: 127, mpan: 64}; // WD has no per-instrument master vol/pan fields; each region's own vol/pan already carries the real value
  }
  if (degenerateCount) bankWarnings.push(`${degenerateCount} region(s) had an invalid key range from this file's own first/last-region chaining (not a guess this reader is making) and were dropped rather than played wrong`);
  return {programs: bankPrograms, vags, body: body || null, warnings: bankWarnings, _pcm: new Map()};
}
