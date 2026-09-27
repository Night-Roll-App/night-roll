// Sony VAB sound bank: header (VH) -> program/tone tables, body (VB) ->
// SPU-ADPCM samples. Layouts in tools/psx/RESEARCH.md §3. Little-endian.
// The header is enough for pitch bookkeeping (center note per tone); the
// body is decoded for root-pitch estimation now and WebAudio playback later.

export function isVAB(buf) {
  const d = new Uint8Array(buf);
  return d.length >= 0x20 && d[0] === 0x70 && d[1] === 0x42 && d[2] === 0x41 && d[3] === 0x56; // "pBAV"
}

// vh: a .VH or a whole .VAB; vb: the .VB body when split.
export function parseVAB(vh, vb = null) {
  const d = new Uint8Array(vh);
  if (!isVAB(d)) throw new Error("not a VAB header (no pBAV magic)");
  const u16 = o => d[o] | (d[o + 1] << 8);
  const u32 = o => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  const numPrograms = u16(0x12), numTones = u16(0x14), numVags = u16(0x16);
  const warnings = [];
  const programs = new Array(128).fill(null);
  let block = 0;
  for (let slot = 0; slot < 128; slot++) {
    const pa = 0x20 + slot * 16;
    const count = d[pa];
    if (!count) continue;
    // one 512-byte tone block per NON-EMPTY program, in slot order
    if (block >= numPrograms) { warnings.push(`program ${slot} has tones but the header counts only ${numPrograms} programs`); break; }
    const base = 0x820 + block++ * 0x200;
    if (base + 0x200 > d.length) { warnings.push("tone table runs past the header"); break; }
    const tones = [];
    for (let t = 0; t < Math.min(count, 16); t++) {
      const o = base + t * 32;
      tones.push({
        index: t,
        prior: d[o], mode: d[o + 1], vol: d[o + 2], pan: d[o + 3],
        center: d[o + 4], shift: d[o + 5], min: d[o + 6], max: d[o + 7],
        vibW: d[o + 8], vibT: d[o + 9], porW: d[o + 10], porT: d[o + 11],
        pbmin: d[o + 12], pbmax: d[o + 13],
        adsr1: u16(o + 16), adsr2: u16(o + 18),
        prog: u16(o + 20), vag: u16(o + 22), // vag is 1-based; 0 = none
      });
    }
    programs[slot] = {index: slot, tones, mvol: d[pa + 1], prior: d[pa + 2], mode: d[pa + 3], mpan: d[pa + 4], attr: u16(pa + 6)};
  }
  const vagTable = 0x820 + numPrograms * 0x200;
  const headerSize = vagTable + 0x200;
  const vags = [null]; // 1-based like the tone's vag field
  let off = 0;
  for (let i = 1; i <= Math.min(numVags, 255); i++) {
    const size = u16(vagTable + i * 2) * 8; // table stores size >> 3
    vags.push({index: i, offset: off, size});
    off += size;
  }
  const body = vb ? new Uint8Array(vb) : d.length > headerSize ? d.subarray(headerSize) : null;
  if (body && off > body.length) warnings.push(`VAG table wants ${off} body bytes, body has ${body.length}`);
  return {
    version: u32(4), vabId: u32(8), totalSize: u32(0x0C),
    numPrograms, numTones, numVags, masterVol: d[0x18], masterPan: d[0x19],
    programs, vags, body, headerSize, warnings, _pcm: new Map(),
  };
}

// tones of `program` that answer to `key` (layers overlap); [] if none
export function tonesFor(vab, program, key) {
  const p = vab.programs[program];
  return p ? p.tones.filter(t => t.vag > 0 && key >= t.min && key <= t.max) : [];
}

// SPU-ADPCM -> 16-bit PCM. Stops at the block carrying the end flag (bit 0),
// as the SPU does; loop points come back as sample indices.
const K0 = [0, 60, 115, 98, 122], K1 = [0, 0, -52, -55, -60];
export function decodeAdpcm(bytes, offset = 0, length = bytes.length - offset) {
  const blocks = Math.floor(length / 16);
  const pcm = new Int16Array(blocks * 28);
  let old = 0, older = 0, n = 0, loopStart = null, loopEnd = null, oneShot = true;
  for (let b = 0; b < blocks; b++) {
    const o = offset + b * 16;
    const shift = Math.min(bytes[o] & 0x0F, 12), filter = Math.min(bytes[o] >> 4, 4), flags = bytes[o + 1];
    if (flags & 4) loopStart = n;
    for (let i = 0; i < 28; i++) {
      const nib = (bytes[o + 2 + (i >> 1)] >> ((i & 1) * 4)) & 0x0F;
      let s = ((nib << 28) >> 28) * (1 << 12) >> shift; // sign-extend, then scale
      s += (old * K0[filter] + older * K1[filter] + 32) >> 6;
      s = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
      older = old; old = s;
      pcm[n++] = s;
    }
    if (flags & 1) { loopEnd = n; oneShot = !(flags & 2); break; }
  }
  return {pcm: n === pcm.length ? pcm : pcm.subarray(0, n), loopStart, loopEnd, oneShot};
}

export function vagPcm(vab, vagIndex) {
  if (vab._pcm.has(vagIndex)) return vab._pcm.get(vagIndex);
  const v = vab.vags[vagIndex];
  const out = v && vab.body && v.offset + v.size <= vab.body.length
    ? decodeAdpcm(vab.body, v.offset, v.size) : null;
  vab._pcm.set(vagIndex, out);
  return out;
}

// Root pitch of a sample by normalized autocorrelation: the note it sounds
// at 44100 Hz (SPU pitch 0x1000). Short looped instrument samples (one or
// two periods long) are tiled from their loop region first. null when no
// period stands out (drums, noise, silence) — callers then assume C4 and say
// so, rather than invent a pitch.
export function estimateRoot(decoded, sampleRate = 44100) {
  if (!decoded || !decoded.pcm.length) return null;
  let x = decoded.pcm;
  let first = 0;
  while (first < x.length && x[first] === 0) first++;
  x = x.subarray(first);
  if (decoded.loopStart != null && decoded.loopEnd != null && !decoded.oneShot && x.length < 4096) {
    const ls = Math.max(0, decoded.loopStart - first), le = decoded.loopEnd - first;
    if (le > ls) {
      const tiled = new Int16Array(4096);
      for (let i = 0; i < tiled.length; i++) tiled[i] = i < le ? x[i] : x[ls + ((i - ls) % (le - ls))];
      x = tiled;
    }
  }
  const maxLag = Math.min(1600, Math.floor(x.length / 2)); // ≥ 27.5 Hz
  const minLag = 20;                                        // ≤ 2205 Hz
  if (maxLag <= minLag) return null;
  const W = Math.min(2048, x.length - maxLag);
  const f = new Float64Array(W + maxLag);
  let mean = 0;
  for (let i = 0; i < f.length; i++) mean += x[i];
  mean /= f.length;
  for (let i = 0; i < f.length; i++) f[i] = x[i] - mean;
  let e0 = 0;
  for (let i = 0; i < W; i++) e0 += f[i] * f[i];
  if (e0 < 1) return null;
  const r = new Float64Array(maxLag + 1);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0, e1 = 0;
    for (let i = 0; i < W; i++) { s += f[i] * f[i + lag]; e1 += f[i + lag] * f[i + lag]; }
    r[lag] = e1 > 0 ? s / Math.sqrt(e0 * e1) : 0;
    if (r[lag] > best) best = r[lag];
  }
  if (best < 0.5) return null;
  // first lag that is a local max near the global max: guards the octave-
  // down error (2x period correlates as well as 1x)
  let lag = minLag;
  for (; lag <= maxLag; lag++) if (r[lag] >= 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= (r[lag + 1] || 0)) break;
  if (lag > maxLag) return null;
  let refined = lag;
  if (lag > minLag && lag < maxLag) { // parabolic peak
    const a = r[lag - 1], b = r[lag], c = r[lag + 1], den = a - 2 * b + c;
    if (den !== 0) refined = lag + 0.5 * (a - c) / den;
  }
  const hz = sampleRate / refined;
  const exact = 69 + 12 * Math.log2(hz / 440);
  const midi = Math.round(exact);
  return {midi, cents: Math.round((exact - midi) * 100), hz: Math.round(hz * 100) / 100, confidence: Math.round(best * 100) / 100};
}

// standalone .VAG (a VB sample with a 48-byte big-endian header)
export function parseVAG(buf) {
  const d = new Uint8Array(buf);
  if (String.fromCharCode(d[0], d[1], d[2], d[3]) !== "VAGp") throw new Error("not a VAG file");
  const u32 = o => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
  let name = "";
  for (let i = 0x20; i < 0x30 && d[i]; i++) name += String.fromCharCode(d[i]);
  return {version: u32(4), size: u32(0x0C), sampleRate: u32(0x10), name, data: d.subarray(0x30)};
}
