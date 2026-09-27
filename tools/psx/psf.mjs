// PSF container (Corlett): header, zlib'd PS-X EXE, [TAG] block. This does
// NOT play a PSF — that needs an R3000 + SPU (RESEARCH.md §5). It gets the
// EXE out and scans it for SEQ/VAB data, which libsnd-based games carry
// verbatim in RAM; those feed the SEQ pipeline with no emulation at all.
// No top-level node import: the browser dynamic-imports this file like the
// NSF modules and inflates with DecompressionStream("deflate") instead.

export function isPSF(buf) {
  const d = new Uint8Array(buf);
  return d.length >= 16 && d[0] === 0x50 && d[1] === 0x53 && d[2] === 0x46; // "PSF"
}

export function parsePSF(buf) {
  const d = new Uint8Array(buf);
  if (!isPSF(d)) throw new Error("not a PSF file");
  const u32 = o => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  const reservedSize = u32(4), programSize = u32(8), crc = u32(12);
  const program = d.subarray(16 + reservedSize, 16 + reservedSize + programSize);
  const tags = {};
  const tagAt = 16 + reservedSize + programSize;
  if (d.length >= tagAt + 5 && String.fromCharCode(...d.subarray(tagAt, tagAt + 5)) === "[TAG]") {
    const text = new TextDecoder("utf-8").decode(d.subarray(tagAt + 5));
    for (const line of text.split("\n")) {
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
      tags[k] = k in tags ? tags[k] + "\n" + v : v; // repeated keys = multi-line
    }
  }
  const libs = Object.keys(tags).filter(k => /^_lib\d*$/.test(k)).sort().map(k => tags[k]);
  return {
    version: d[3], // 0x01 PS1, 0x02 PS2, others: RESEARCH.md §5
    reserved: d.subarray(16, 16 + reservedSize),
    program, programSize, crc, crcOk: crc32(program) === crc,
    tags, libs,
  };
}

// PSF1 program -> PS-X EXE header fields + text bytes
export function parseExe(bytes) {
  const d = new Uint8Array(bytes);
  if (String.fromCharCode(...d.subarray(0, 8)) !== "PS-X EXE") throw new Error("PSF program is not a PS-X EXE");
  const u32 = o => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  let region = "";
  for (let i = 0x4C; i < 0x800 && d[i]; i++) region += String.fromCharCode(d[i]);
  return {pc: u32(0x10), gp: u32(0x14), textStart: u32(0x18), textSize: u32(0x1C), sp: u32(0x30), region, text: d.subarray(0x800, 0x800 + u32(0x1C))};
}

// inflate: (Uint8Array zlib stream) -> Uint8Array | Promise<Uint8Array>;
// defaults to Node's zlib, loaded only when needed
export async function inflatePSF(psf, inflate = null) {
  if (!inflate) { const z = await import("node:zlib"); inflate = b => z.inflateSync(b); }
  return new Uint8Array(await inflate(psf.program));
}

// offsets of every "pQES" (SEQ/SEP) and "pBAV" (VAB) in a byte range
export function scanMagic(bytes) {
  const d = new Uint8Array(bytes);
  const seq = [], vab = [];
  for (let i = 0; i + 4 <= d.length; i++) {
    if (d[i] !== 0x70) continue;
    if (d[i + 1] === 0x51 && d[i + 2] === 0x45 && d[i + 3] === 0x53) seq.push(i);
    else if (d[i + 1] === 0x42 && d[i + 2] === 0x41 && d[i + 3] === 0x56) vab.push(i);
  }
  return {seq, vab};
}

let TABLE = null;
export function crc32(bytes) {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
