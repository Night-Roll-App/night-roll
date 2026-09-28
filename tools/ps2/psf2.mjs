// PSF2 container (Corlett, version 0x02): same 16-byte PSF header as PS1's
// PSF (tools/psx/psf.mjs) — "PSF" + version + reservedSize + programSize +
// crc32 + reserved bytes + [TAG] — but PSF2's "program" (the compressed
// EXE) is always empty; the whole payload lives in the "reserved" area,
// which is a small virtual filesystem: a directory tree of 48-byte entries
// (name[36] + offset u32 + uncompressed-size u32 + block-size u32), files
// stored as a table of per-block zlib-compressed sizes followed by the
// zlib blocks themselves. Confirmed against three real PSF2 sets (Final
// Fantasy X, Dark Cloud, and — not a PSF2 at all — Ico's/XIII's Zophar
// "EMU" packs, which are GENH/SS2 raw-stream dumps; see docs/plans/ps2.md
// "Findings (milestone 1)"). Spec cross-checked against the reference
// decoder kode54/psflib's psf2fs.c (makearchivedir), not copied from it.
//
// No top-level node import: like psx/psf.mjs, the browser will dynamic-
// import this and inflate with DecompressionStream("deflate") per block.
import { crc32 } from "../psx/psf.mjs";

export function isPSF2(buf) {
  const d = new Uint8Array(buf);
  return d.length >= 16 && d[0] === 0x50 && d[1] === 0x53 && d[2] === 0x46 && d[3] === 0x02; // "PSF" + v2
}

// Same header + [TAG] shape as psx/psf.mjs's parsePSF; kept separate
// because PSF2's "program" is always 0 bytes (the payload is `reserved`,
// a filesystem, not a compressed EXE) and PSF2 uses _lib the same way PSF1
// does (one shared .psf2lib per set).
export function parsePSF2(buf) {
  const d = new Uint8Array(buf);
  if (!isPSF2(d)) throw new Error("not a PSF2 file (version byte is not 0x02)");
  const u32 = o => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  const reservedSize = u32(4), programSize = u32(8), crc = u32(12);
  const reserved = d.subarray(16, 16 + reservedSize);
  const program = d.subarray(16 + reservedSize, 16 + reservedSize + programSize);
  const tags = {};
  const tagAt = 16 + reservedSize + programSize;
  if (d.length >= tagAt + 5 && String.fromCharCode(...d.subarray(tagAt, tagAt + 5)) === "[TAG]") {
    const text = new TextDecoder("utf-8").decode(d.subarray(tagAt + 5));
    for (const line of text.split("\n")) {
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
      tags[k] = k in tags ? tags[k] + "\n" + v : v;
    }
  }
  const libs = Object.keys(tags).filter(k => /^_lib\d*$/.test(k)).sort().map(k => tags[k]);
  return {version: d[3], reserved, program, programSize, crc, crcOk: crc32(program) === crc, tags, libs};
}

// Directory entry layout (48 bytes), from psf2fs.c's makearchivedir:
//   name[36] (nul-padded ASCII), o (u32), u (u32 uncompressed size),
//   b (u32 block size) — all relative to the start of `reserved`.
// u==0 && b==0 && o!=0  -> subdirectory at offset o
// u==0 || b==0 || o==0  -> empty file (no data)
// else                  -> real file: ceil(u/b) block-compressed-size u32s
//                          at o, then that many zlib streams back to back
const DIRENT = 48, NAME_LEN = 36;

// -> [{path, o, u, b}] for every real (non-empty, non-directory) file.
// Directories are walked but not themselves listed — matches "list files".
export function listPSF2(reserved, offset = 0, path = "") {
  const d = new Uint8Array(reserved);
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const num = view.getInt32(offset, true);
  if (num < 0) throw new Error(`PSF2 fs: bad entry count at 0x${offset.toString(16)}`);
  let pos = offset + 4;
  const out = [];
  for (let n = 0; n < num; n++) {
    if (pos + DIRENT > d.length) throw new Error(`PSF2 fs: directory entry ${n} runs past the reserved area`);
    let nameEnd = pos;
    while (nameEnd < pos + NAME_LEN && d[nameEnd]) nameEnd++;
    const name = new TextDecoder("latin1").decode(d.subarray(pos, nameEnd));
    const o = view.getInt32(pos + 36, true), u = view.getInt32(pos + 40, true), b = view.getInt32(pos + 44, true);
    pos += DIRENT;
    const full = path + "/" + name;
    if (u === 0 && b === 0 && o !== 0) out.push(...listPSF2(reserved, o, full));
    else if (u === 0 || b === 0 || o === 0) { /* zero-length file: nothing to read */ }
    else out.push({path: full, o, u, b});
  }
  return out;
}

// inflate: (Uint8Array zlib stream) -> Uint8Array | Promise<Uint8Array>;
// defaults to Node's zlib (each block is its own zlib stream, "78 da..."),
// loaded only when needed — same convention as psx/psf.mjs's inflatePSF.
export async function readPSF2File(reserved, entry, inflate = null) {
  if (!inflate) { const z = await import("node:zlib"); inflate = b => z.inflateSync(b); }
  const d = new Uint8Array(reserved);
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const {o, u, b} = entry;
  const blocks = Math.ceil(u / b);
  const sizes = [];
  for (let i = 0; i < blocks; i++) sizes.push(view.getUint32(o + 4 * i, true));
  let pos = o + 4 * blocks;
  const parts = [];
  let total = 0;
  for (const size of sizes) {
    const chunk = await inflate(d.subarray(pos, pos + size));
    parts.push(chunk);
    total += chunk.length;
    pos += size;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out.subarray(0, u);
}

// minipsf2 → psf2lib chain (mirrors psx/psf.mjs's loadPSFChain): load the
// named lib(s) first, recursively, then this file's own filesystem. Unlike
// PSF1 (one flat RAM image to overlay), PSF2's payload is a directory tree
// per source; the merge is a flat file list, own entries shadowing the
// lib's on a path collision (own files are typically disjoint song data;
// the lib holds shared driver modules + shared song data, per set — Dark
// Cloud keeps every .SQ/.HD/.BD in the lib and only a 106-byte psf2.ini
// per mini; Final Fantasy X keeps the song's .bgm/.wd IN the mini and the
// lib holds only IOP driver modules).
export async function loadPSF2Chain(bytes, readLib, {name = "", inflate = null, seen = new Set()} = {}) {
  const psf = parsePSF2(bytes);
  const key = name.toLowerCase();
  if (seen.has(key)) throw new Error(`_lib cycle at ${name}`);
  seen.add(key);
  const sources = [];
  const lib = async n => {
    const b = await readLib(n);
    if (!b) throw new Error(`missing library ${n} (named by ${name || "the minipsf2"}'s _lib tag)`);
    return loadPSF2Chain(b, readLib, {name: n, inflate, seen});
  };
  if (psf.libs[0]) sources.push(...await lib(psf.libs[0]));
  sources.push({name, psf, files: listPSF2(psf.reserved)});
  for (const n of psf.libs.slice(1)) sources.push(...await lib(n));
  return sources;
}

// {path -> {source, o, u, b}}, own (later-loaded, i.e. the mini) files
// shadowing the lib's — "one virtual filesystem" from the whole chain.
export function mergePSF2(sources) {
  const files = new Map();
  for (const src of sources) for (const f of src.files) files.set(f.path.toLowerCase(), {...f, source: src});
  return files;
}

export function findPSF2(files, name) {
  const key = ("/" + name.replace(/^\/+/, "")).toLowerCase();
  for (const [path, entry] of files) if (path === key || path.endsWith("/" + name.toLowerCase())) return entry;
  return null;
}
