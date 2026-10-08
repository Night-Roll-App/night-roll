// Sony's stock PS2 instrument bank — HD (header: programs, key/velocity
// splits, sample params, ADSR) + BD (sample body: SPU-ADPCM, byte-identical
// to PS1's VAG format — docs/plans/ps2.md §5). Read for byte layout from
// VGMTrans's SonyPS2InstrSet.cpp/.h; every chunk offset below was cross-
// checked against a real Dark Cloud HD file (tests/ps2-real.test.mjs) —
// each chunk's "IECS"+type tag landed exactly where its header field said
// it would (Prog/Sset/Smpl/Vagi), and HD's bodySize field matched its
// paired .BD file's real size exactly.
//
// parseHD()'s job ends at "here is what the file says"; toBank() reshapes
// that into the exact object shape tools/psx/vab.mjs's parseVAB() returns
// (programs[].tones[] with {min,max,vag,center,shift,adsr1,adsr2,vol,pan},
// a 1-based vags[] with {offset,size}, .body, ._pcm) so vab.mjs's own
// tonesFor/vagPcm/estimateRoot/decodeAdpcm and psx/notes.mjs's seqNotes
// run over PS2 Sony-format data completely unmodified — no PS2-specific
// note or instrument code beyond this translation.
function tagAt(d, o, str) {
  if (d.length < o + 4) return false;
  for (let i = 0; i < 4; i++) if (d[o + i] !== str.charCodeAt(i)) return false;
  return true;
}

export function isHD(buf) {
  const d = new Uint8Array(buf);
  return tagAt(d, 0, "IECS") && tagAt(d, 4, "sreV");
}

export function parseHD(buf) {
  const d = new Uint8Array(buf);
  if (!isHD(d)) throw new Error("not an HD file (no IECS/Vers chunk)");
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const u32 = o => view.getUint32(o, true);
  const u16 = o => view.getUint16(o, true);
  const i8 = o => view.getInt8(o);
  const u8 = o => view.getUint8(o);

  const versChunkSize = u32(8);
  let off = versChunkSize;
  if (!tagAt(d, off, "IECS") || !tagAt(d, off + 4, "daeH")) throw new Error("HD: no Head chunk where expected");
  const bodySize = u32(off + 16);
  const progAddr = u32(off + 20), sampsetAddr = u32(off + 24), sampAddr = u32(off + 28), vagInfoAddr = u32(off + 32);

  if (!tagAt(d, progAddr, "IECS") || !tagAt(d, progAddr + 4, "gorP")) throw new Error("HD: no Prog chunk at the header's program address");
  const maxProgramNumber = u32(progAddr + 12);
  const programs = [];
  for (let i = 0; i <= maxProgramNumber; i++) {
    const paddr = u32(progAddr + 16 + i * 4);
    if (paddr === 0xFFFFFFFF) { programs.push(null); continue; }
    const base = progAddr + paddr;
    const splitBlockAddr = base + u32(base);
    const nSplit = u8(base + 4), sizeSplitBlock = u8(base + 5);
    const progVolume = u8(base + 6), progPanpot = u8(base + 7), progTranspose = i8(base + 8), progDetune = i8(base + 9);
    const splits = [];
    for (let s = 0; s < nSplit; s++) {
      const so = splitBlockAddr + s * sizeSplitBlock; // sizeSplitBlock is 20 in every real file seen (VGMTrans asserts this)
      splits.push({
        sampleSetIndex: u16(so), rangeLow: u8(so + 2), rangeHigh: u8(so + 4),
        // bend range down / up, 1/128 semitone (modhsyn.irx: a voice's bend
        // offset = range × wheel ÷ 8192, the down range for a wheel below
        // centre; libsd's sceSdNote2Pitch takes fine in 128ths)
        bendLow: u16(so + 6), bendHigh: u16(so + 8),
        panpot: u8(so + 17), transpose: i8(so + 18), detune: i8(so + 19),
      });
    }
    programs.push({index: i, volume: progVolume, panpot: progPanpot, transpose: progTranspose, detune: progDetune, splits});
  }

  if (!tagAt(d, sampsetAddr, "IECS") || !tagAt(d, sampsetAddr + 4, "tesS")) throw new Error("HD: no Sset chunk at the header's sampleset address");
  const maxSampleSetNumber = u32(sampsetAddr + 12);
  const sampleSets = [];
  for (let i = 0; i <= maxSampleSetNumber; i++) {
    const so = u32(sampsetAddr + 16 + i * 4);
    if (so === 0xFFFFFFFF) { sampleSets.push(null); continue; }
    const base = sampsetAddr + so;
    const nSample = u8(base + 3);
    const sampleIndex = [];
    for (let j = 0; j < nSample; j++) sampleIndex.push(u16(base + 4 + j * 2));
    sampleSets.push({velLow: u8(base + 1), velHigh: u8(base + 2), sampleIndex});
  }

  if (!tagAt(d, sampAddr, "IECS") || !tagAt(d, sampAddr + 4, "lpmS")) throw new Error("HD: no Smpl chunk at the header's sample address");
  // Sample and VAGInfo offset tables carry the same 0xFFFFFFFF "unused
  // slot" sentinel the Program/SampleSet tables do (VGMTrans's own reader
  // does not guard this — found by reading real Dark Cloud HD files, where
  // several sample slots between 0 and maxSampleNumber are sentineled).
  const maxSampleNumber = u32(sampAddr + 12);
  const samples = [];
  for (let i = 0; i <= maxSampleNumber; i++) {
    const rel = u32(sampAddr + 16 + i * 4);
    if (rel === 0xFFFFFFFF) { samples.push(null); continue; }
    const so = sampAddr + rel;
    samples.push({
      vagIndex: u16(so), velLow: u8(so + 2), velHigh: u8(so + 4),
      baseNote: u8(so + 11), detune: i8(so + 12), panpot: u8(so + 13),
      volume: u8(so + 16), adsr1: u16(so + 18), adsr2: u16(so + 20),
      // SPU mix bits, as modhsyn.irx sets a voice's switches from them: 1 dry
      // L, 2 dry R, 4 wet (effect send) L, 8 wet R
      spuAttr: u8(so + 41),
    });
  }

  if (!tagAt(d, vagInfoAddr, "IECS") || !tagAt(d, vagInfoAddr + 4, "igaV")) throw new Error("HD: no Vagi chunk at the header's VAG-info address");
  const maxVagInfoNumber = u32(vagInfoAddr + 12);
  const vagInfos = [];
  for (let i = 0; i <= maxVagInfoNumber; i++) {
    const rel = u32(vagInfoAddr + 16 + i * 4);
    if (rel === 0xFFFFFFFF) { vagInfos.push(null); continue; }
    const vo = vagInfoAddr + rel;
    vagInfos.push({offset: u32(vo), sampleRate: u16(vo + 4), oneShot: u8(vo + 6) === 0});
  }

  return {bodySize, programs, sampleSets, samples, vagInfos, warnings: []};
}

export function isBD(buf) { return true; } // BD has no magic of its own; identified by pairing with an HD (psf2.ini's -b=)

// hd: parseHD() result; bd: the decompressed BD bytes. -> a VAB-shaped bank.
export function toBank(hd, bd) {
  const {programs, sampleSets, samples, vagInfos} = hd;
  // vags: 1-based (index 0 reserved, matching psx/vab.mjs's convention:
  // "vag is 1-based; 0 = none"). Length = (next VAG's offset − this one),
  // or to the end of BD for the last — same trick VGMTrans's SampColl uses.
  const vags = [null];
  for (let i = 0; i < vagInfos.length; i++) {
    const v = vagInfos[i];
    if (!v) { vags.push(null); continue; }
    // size = next REAL vagInfo's offset minus this one's (skipping sentineled
    // slots), or to the end of BD for the last real entry
    let next = null;
    for (let j = i + 1; j < vagInfos.length; j++) if (vagInfos[j]) { next = vagInfos[j]; break; }
    const size = (next ? next.offset : bd ? bd.length : v.offset) - v.offset;
    // rate: this VAG's own native sample rate (real Dark Cloud files carry
    // 22050-44100 Hz, not one fixed console rate) — tools/psx/spu-render.mjs's
    // vabVoices() reads it (falling back to its own SPU_RATE constant for
    // PS1 VABs, which have no such field) so pitch is correct per sample.
    vags.push({index: i + 1, offset: v.offset, size: Math.max(0, size), rate: v.sampleRate});
  }
  const bankPrograms = new Array(128).fill(null);
  for (const prog of programs) {
    if (!prog) continue;
    const tones = [];
    for (const split of prog.splits) {
      const set = sampleSets[split.sampleSetIndex];
      if (!set) continue;
      for (const si of set.sampleIndex) {
        const samp = samples[si];
        if (!samp) continue;
        const high = split.rangeHigh < split.rangeLow ? 127 : split.rangeHigh;
        tones.push({
          min: split.rangeLow, max: high, vag: samp.vagIndex + 1, // +1: this module's 1-based vags[]
          center: samp.baseNote, shift: (split.transpose + samp.detune / 100) * 128, // both are semitone-ish offsets folded into vab.mjs's 1/128-semitone `shift` unit
          // pan/mpan are ALREADY absolute 0-127 values, 64 = centre — the same
          // convention tools/psx/vab.mjs's own tone.pan/program.mpan use (a
          // raw byte, no added offset). Found by real data, not the field's
          // name: every real Dark Cloud program's panpot reads exactly 64 (a
          // genuine per-program offset would default to 0, not a constant
          // non-zero value), and split panpot values cluster symmetrically
          // AROUND 64 (e.g. 10/64/116), not around 0 — adding another 64 here
          // (this module's first cut) hard-panned nearly every note right.
          vol: samp.volume, pan: split.panpot, adsr1: samp.adsr1, adsr2: samp.adsr2,
          bendLow: split.bendLow, bendHigh: split.bendHigh, spuAttr: samp.spuAttr,
        });
      }
    }
    bankPrograms[prog.index] = {index: prog.index, tones, mvol: prog.volume, mpan: prog.panpot};
  }
  return {programs: bankPrograms, vags, body: bd || null, warnings: hd.warnings, _pcm: new Map()};
}
