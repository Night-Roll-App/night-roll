// USF / miniUSF / usflib container (hcs64.com/usf/usf.txt, v1.2): a PSF
// (version 0x21) whose RESERVED area holds two SR64 sparse images — the
// ROM, then a Project64 1.4 save state. The program section is unused.
// This does not play a USF; it gets the ROM pages and RDRAM out so the
// EAD sequence tables can be looked up in them (see INTEGRATION.md,
// "Real rips"). Browser-clean: no Node imports, nothing here inflates.
import { parsePSF, isPSF } from "../psx/psf.mjs";

export const USF_VERSION = 0x21;

// SR64: "SR64", then chunks of {u32le length, u32le offset, bytes} until a
// zero length. A bare 4-byte zero means "no image".
export function parseSR64(d, at) {
  const u32 = o => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  if (at + 4 > d.length) throw new Error("SR64: reserved area ends early at " + at);
  if (u32(at) === 0) return {chunks: [], end: at + 4};
  if (String.fromCharCode(d[at], d[at + 1], d[at + 2], d[at + 3]) !== "SR64") throw new Error("SR64 magic missing at " + at);
  const chunks = [];
  let p = at + 4;
  for (;;) {
    if (p + 4 > d.length) throw new Error("SR64: chunk list runs off the end at " + p);
    const len = u32(p);
    if (len === 0) { p += 4; break; }
    const off = u32(p + 4);
    if (p + 8 + len > d.length) throw new Error(`SR64: chunk at ${p} (${len} bytes @ ${off}) runs off the end`);
    chunks.push({offset: off, bytes: d.subarray(p + 8, p + 8 + len)});
    p += 8 + len;
  }
  return {chunks, end: p};
}

export function isUSF(buf) {
  const d = new Uint8Array(buf);
  return isPSF(d) && d[3] === USF_VERSION;
}

export function parseUSF(buf) {
  const d = new Uint8Array(buf);
  if (!isPSF(d)) throw new Error("not a PSF file");
  const psf = parsePSF(d);
  if (psf.version !== USF_VERSION) throw new Error(`PSF version 0x${psf.version.toString(16)} is not USF (0x21)`);
  const r = psf.reserved;
  const rom = parseSR64(r, 0);
  const state = parseSR64(r, rom.end);
  return {tags: psf.tags, libs: psf.libs, rom: rom.chunks, state: state.chunks, programSize: psf.programSize};
}

// A sparse byte image: pages written in load order (lib first, then the
// mini, per the spec's "replacing any data with the same addresses").
export class SparseImage {
  constructor() { this.ranges = []; }
  write(offset, bytes) {
    // keep ranges sorted and non-overlapping; later writes win
    const end = offset + bytes.length;
    const kept = [];
    for (const r of this.ranges) {
      const rEnd = r.offset + r.bytes.length;
      if (rEnd <= offset || r.offset >= end) { kept.push(r); continue; }
      if (r.offset < offset) kept.push({offset: r.offset, bytes: r.bytes.subarray(0, offset - r.offset)});
      if (rEnd > end) kept.push({offset: end, bytes: r.bytes.subarray(end - r.offset)});
    }
    kept.push({offset, bytes});
    kept.sort((a, b) => a.offset - b.offset);
    this.ranges = kept;
  }
  // contiguous runs of present bytes (adjacent ranges merged) — the map of what the rip carries
  runs() {
    const out = [];
    for (const r of this.ranges) {
      const last = out[out.length - 1];
      if (last && last.offset + last.length === r.offset) last.length += r.bytes.length;
      else out.push({offset: r.offset, length: r.bytes.length});
    }
    return out;
  }
  get bytesPresent() { return this.ranges.reduce((a, r) => a + r.bytes.length, 0); }
  has(offset, length) { return this.coverage(offset, length) === 1; }
  // index of the first range ending after `offset` (ranges are sorted and
  // disjoint; table scans call this millions of times)
  firstAfter(offset) {
    let lo = 0, hi = this.ranges.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.ranges[mid].offset + this.ranges[mid].bytes.length <= offset) lo = mid + 1; else hi = mid; }
    return lo;
  }
  // bytes present within [offset, offset+length) as a fraction
  coverage(offset, length) {
    if (length <= 0) return 1;
    let n = 0;
    for (let i = this.firstAfter(offset); i < this.ranges.length && this.ranges[i].offset < offset + length; i++) {
      const r = this.ranges[i];
      const a = Math.max(offset, r.offset), b = Math.min(offset + length, r.offset + r.bytes.length);
      if (b > a) n += b - a;
    }
    return n / length;
  }
  // copy out a range; missing bytes come back as `fill` (default 0). Throws
  // when strict and anything is missing.
  read(offset, length, {strict = false, fill = 0} = {}) {
    const out = new Uint8Array(length).fill(fill);
    let got = 0;
    for (let i = this.firstAfter(offset); i < this.ranges.length && this.ranges[i].offset < offset + length; i++) {
      const r = this.ranges[i];
      const a = Math.max(offset, r.offset), b = Math.min(offset + length, r.offset + r.bytes.length);
      if (b <= a) continue;
      out.set(r.bytes.subarray(a - r.offset, b - r.offset), a - offset);
      got += b - a;
    }
    if (strict && got !== length) throw new Error(`0x${offset.toString(16)}+0x${length.toString(16)}: only ${got} of ${length} bytes present`);
    return out;
  }
  u8(o) { return this.read(o, 1, {strict: true})[0]; }
  u16(o) { const b = this.read(o, 2, {strict: true}); return (b[0] << 8) | b[1]; }
  u32(o) { const b = this.read(o, 4, {strict: true}); return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0; }
}

// The ROM is "stored as little endian 4 byte words": swap each word back
// to the cartridge's big-endian order so decomp offsets apply directly.
export function swapWords(bytes) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i + 3 < bytes.length; i += 4) { out[i] = bytes[i + 3]; out[i + 1] = bytes[i + 2]; out[i + 2] = bytes[i + 1]; out[i + 3] = bytes[i]; }
  return out;
}

// Load a set: files = [{name, bytes}] with the mini FIRST; its _lib tags
// are resolved by name (case-insensitive, basename only) against the rest.
// Returns {rom: SparseImage (big-endian), state: SparseImage (PJ64 layout,
// still little-endian words), tags (mini's), order (files applied)}.
export function loadUSF(files) {
  const base = n => n.split(/[\\/]/).pop().toLowerCase();
  const byName = new Map(files.map(f => [base(f.name), f]));
  const rom = new SparseImage(), state = new SparseImage(), order = [];
  const seen = new Set();
  function apply(f) {
    const key = base(f.name);
    if (seen.has(key)) throw new Error("_lib cycle at " + f.name);
    seen.add(key);
    const u = f.parsed || (f.parsed = parseUSF(f.bytes));
    for (const lib of u.libs) {
      const L = byName.get(base(lib));
      if (!L) throw new Error(`${f.name} needs ${lib}, which is not among the files given`);
      apply(L);
    }
    for (const c of u.rom) rom.write(c.offset, swapWords(c.bytes));
    for (const c of u.state) state.write(c.offset, c.bytes);
    order.push(f.name);
    return u;
  }
  const top = apply(files[0]);
  return {rom, state, tags: top.tags, order};
}

// The PJ64 save state: RDRAM starts at 0x75C, "stored as DWORDs" (little
// endian words again). Returns a big-endian SparseImage addressed by
// physical RDRAM address, so 0x80xxxxxx symbols map with & 0x1FFFFFFF.
export const PJ64_RDRAM = 0x75C;
export function rdramOf(state) {
  let size = 0;
  try { const b = state.read(4, 4, {strict: true}); size = (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0; } catch { /* header page absent */ }
  const limit = PJ64_RDRAM + (size || 0x800000);
  const ram = new SparseImage();
  for (const r of state.ranges) {
    const a = Math.max(r.offset, PJ64_RDRAM), b = Math.min(r.offset + r.bytes.length, limit);
    if (b <= a) continue;
    ram.write(a - PJ64_RDRAM, swapWords(r.bytes.subarray(a - r.offset, b - r.offset)));
  }
  return {size, ram};
}
