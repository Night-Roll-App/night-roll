// BRR (bit-rate reduction) codec: the S-DSP's 9-byte, 16-sample blocks.
// Decoder follows the hardware arithmetic exactly (shift, the four fixed
// predictors, 16-bit clamp then 15-bit wrap) so decoded PCM is what the
// chip would have played — root-pitch estimation and any future sample
// playback both depend on that. The encoder exists for the synthetic test
// SPC (and is a real encoder: per-block best shift/filter search).

const clamp16 = v => v > 32767 ? 32767 : v < -32768 ? -32768 : v;

// one block -> 16 samples appended to out at off; state = [p1, p2] in the
// 15-bit domain (what the chip feeds its predictors)
export function decodeBlock(ram, addr, out, off, state) {
  const hdr = ram[addr];
  const shift = hdr >> 4, filter = (hdr >> 2) & 3;
  let [p1, p2] = state;
  for (let i = 0; i < 16; i++) {
    const byte = ram[(addr + 1 + (i >> 1)) & 0xFFFF];
    let n = (i & 1) ? (byte & 0x0F) : (byte >> 4);
    if (n >= 8) n -= 16;
    // shift 13-15 is out of spec: the chip collapses the nibble to its sign
    let s = shift <= 12 ? (n << shift) >> 1 : (n < 0 ? -0x800 : 0);
    switch (filter) {
      case 1: s += p1 + ((-p1) >> 4); break;
      case 2: s += p1 * 2 + ((-p1 * 3) >> 5) - p2 + (p2 >> 4); break;
      case 3: s += p1 * 2 + ((-p1 * 13) >> 6) - p2 + ((p2 * 3) >> 4); break;
    }
    s = clamp16(s);
    const s16 = ((s << 1) << 16) >> 16; // ×2 as int16: the 15-bit wrap
    out[off + i] = s16;
    p2 = p1; p1 = s16 >> 1;
  }
  state[0] = p1; state[1] = p2;
  return hdr;
}

// Decode a whole sample from its directory entry. Walks blocks from start
// to the first END flag; a LOOP+END whose loop address lies outside the
// walked range gets the loop segment decoded and appended, so loopStart is
// always an index into pcm (or null for one-shots). Bounded at the 64 KB
// wrap so a corrupt entry can't spin forever.
export function decodeBRR(ram, start, loop) {
  const MAX_BLOCKS = 0x10000 / 9;
  const walk = (addr, out) => { // -> {blocks, hdr} ; out receives Int16 values
    const state = [0, 0];
    let blocks = 0, hdr = 0;
    while (blocks < MAX_BLOCKS) {
      const off = out.length;
      out.length = off + 16;
      hdr = decodeBlock(ram, addr, out, off, state);
      blocks++;
      addr = (addr + 9) & 0xFFFF;
      if (hdr & 1) break;
    }
    return {blocks, hdr, endAddr: addr};
  };
  const samples = [];
  const first = walk(start, samples);
  const looped = !!(first.hdr & 2);
  let loopStart = null;
  let loopBlocks = 0;
  if (looped) {
    const inside = loop >= start && loop < start + first.blocks * 9 && (loop - start) % 9 === 0;
    if (inside) {
      loopStart = ((loop - start) / 9) * 16;
      loopBlocks = first.blocks - (loop - start) / 9;
    } else { // loop lives elsewhere (rare, but legal): decode it as a second segment
      loopStart = samples.length;
      loopBlocks = walk(loop, samples).blocks;
    }
  }
  return {
    pcm: Int16Array.from(samples),
    blocks: first.blocks,
    bytes: first.blocks * 9,
    looped,
    loopStart,                      // sample index the voice jumps back to
    loopLength: looped ? loopBlocks * 16 : 0,
    start, loop,
  };
}

// Encode int16 PCM to BRR. loopStart (sample index, multiple of 16) marks a
// looped sample: the final block gets LOOP+END and the loop-start block is
// forced to filter 0 so the loop decodes identically every pass (filters
// 1-3 depend on the previous block's state, which differs on re-entry).
export function encodeBRR(pcm, {loopStart = null} = {}) {
  const nBlocks = Math.ceil(pcm.length / 16);
  const out = new Uint8Array(nBlocks * 9);
  let p1 = 0, p2 = 0; // decoder state carried block to block (15-bit domain)
  const predict = (f, a, b) => f === 0 ? 0
    : f === 1 ? a + ((-a) >> 4)
    : f === 2 ? a * 2 + ((-a * 3) >> 5) - b + (b >> 4)
    : a * 2 + ((-a * 13) >> 6) - b + ((b * 3) >> 4);
  for (let blk = 0; blk < nBlocks; blk++) {
    const src = [];
    for (let i = 0; i < 16; i++) src.push((pcm[blk * 16 + i] || 0) >> 1); // 15-bit target
    // block 0 may predict from the zeroed initial state (the decoder starts
    // there too); only the loop-start block re-enters with a different state
    const filters = (loopStart !== null && blk * 16 === loopStart) ? [0] : [0, 1, 2, 3];
    let best = null;
    for (const f of filters) for (let shift = 0; shift <= 12; shift++) {
      let a = p1, b = p2, err = 0;
      const nibs = [];
      for (let i = 0; i < 16; i++) {
        const pred = predict(f, a, b);
        // decoded = ((n << shift) >> 1) + pred, so n ≈ (target - pred) / 2^(shift-1)
        let n = Math.round((src[i] - pred) / (2 ** shift / 2));
        n = n > 7 ? 7 : n < -8 ? -8 : n;
        let s = ((n << shift) >> 1) + pred;
        s = s > 16383 ? 16383 : s < -16384 ? -16384 : s; // stay clear of the 15-bit wrap
        err += (s - src[i]) ** 2;
        nibs.push(n & 0x0F);
        b = a; a = s;
      }
      if (!best || err < best.err) best = {err, f, shift, nibs, a, b};
    }
    const last = blk === nBlocks - 1;
    out[blk * 9] = (best.shift << 4) | (best.f << 2) | (last && loopStart !== null ? 2 : 0) | (last ? 1 : 0);
    for (let i = 0; i < 8; i++) out[blk * 9 + 1 + i] = (best.nibs[2 * i] << 4) | best.nibs[2 * i + 1];
    p1 = best.a; p2 = best.b;
  }
  return out;
}
