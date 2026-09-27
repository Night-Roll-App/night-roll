// Synthetic SEQ / SEP / VAB / PSF — our own bytes, no game data — so the
// PS1 pipeline is tested end to end. The tune: channel 1 plays C4 E4 G4 in
// a 3/4 bar at 120bpm, then the meter turns 4/4 and the tempo 90bpm for
// D4 (half) F4 G4; channel 2 is a two-drum kit. The score uses running
// status, velocity-0 note-offs, a meta event riding running status 0xFF,
// and the CC99/CC6 loop markers — every SEQ quirk the parser must survive.
import { deflateSync } from "node:zlib";

const PPQ = 480;

export const TEST_MELODY = [ // [tick, key, duration ticks]
  [0, 60, 480], [480, 64, 480], [960, 67, 480],
  [1440, 62, 960], [2400, 65, 480], [2880, 67, 480],
];
export const TEST_KIT = [[0, 36, 240], [480, 38, 240]];
export const TEST_END = 3360;

function score() {
  const ev = []; // {tick, bytes, meta}
  const at = (tick, ...bytes) => ev.push({tick, bytes});
  at(0, 0xC0, 0); at(0, 0xC1, 1);
  at(0, 0xB0, 99, 20);                       // loop start
  for (const [t, k, d] of TEST_MELODY) { at(t, 0x90, k, 100); at(t + d, 0x90, k, 0); }
  for (const [t, k, d] of TEST_KIT) { at(t, 0x91, k, 0x7F); at(t + d, 0x91, k, 0); }
  at(1440, 0xFF, 0x51, 0x0A, 0x2C, 0x2B);   // 666667 µs = 90bpm
  at(1440, 0xFF, 0x58, 4, 2);               // 4/4 — emitted under running status FF
  at(TEST_END, 0xB0, 99, 30);               // loop end
  at(TEST_END, 0xB0, 6, 127);               // forever
  at(TEST_END, 0xFF, 0x2F, 0);
  ev.sort((a, b) => a.tick - b.tick);       // stable: same-tick order kept
  const out = [];
  let last = 0, status = 0;
  for (const e of ev) {
    let v = e.tick - last; last = e.tick;
    const vl = [v & 0x7F];
    while ((v >>= 7)) vl.unshift((v & 0x7F) | 0x80);
    out.push(...vl);
    const [st, ...rest] = e.bytes;
    if (st !== status) out.push(st);
    status = st;
    out.push(...rest);
  }
  return out;
}

const be16 = v => [(v >> 8) & 255, v & 255];
const be24 = v => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
const be32 = v => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
const ID = [0x70, 0x51, 0x45, 0x53]; // "pQES"

export function makeTestSEQ() {
  return new Uint8Array([...ID, ...be32(1), ...be16(PPQ), ...be24(500000), 3, 2, ...score()]);
}

// two sequences: the tune, then a lone A4 quarter at 100bpm in 4/4
export function makeTestSEP() {
  const s0 = score();
  const s1 = [0, 0x90, 69, 100, 0x83, 0x60, 69, 0, 0, 0xFF, 0x2F, 0];
  return new Uint8Array([
    ...ID, ...be16(0),
    ...be16(0), ...be16(PPQ), ...be24(500000), 3, 2, ...be32(s0.length), ...s0,
    ...be16(1), ...be16(PPQ), ...be24(600000), 4, 2, ...be32(s1.length), ...s1,
  ]);
}

// SPU-ADPCM, filter 0 / shift 0: each nibble is sample/4096. Coarse, but a
// legal stream any decoder must reproduce exactly.
export function encodeAdpcm(samples, {loop = true} = {}) {
  const blocks = Math.ceil(samples.length / 28);
  const out = new Uint8Array((blocks + 1) * 16); // block 0 all zero, as Sony's tool emits
  for (let b = 0; b < blocks; b++) {
    const o = (b + 1) * 16;
    out[o] = 0;
    out[o + 1] = (b === 0 && loop ? 4 : 0) | (b === blocks - 1 ? (loop ? 3 : 1) : 0);
    for (let i = 0; i < 28; i++) {
      const s = samples[b * 28 + i] || 0;
      const nib = Math.max(-8, Math.min(7, Math.round(s / 4096))) & 0x0F;
      out[o + 2 + (i >> 1)] |= nib << ((i & 1) * 4);
    }
  }
  return out;
}

export function sine(hz, n, sampleRate = 44100, amp = 28000) {
  const s = new Int16Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.round(amp * Math.sin(2 * Math.PI * hz * i / sampleRate));
  return s;
}

function noise(n, seed = 1) {
  const s = new Int16Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7FFFFFFF; s[i] = (x % 56000) - 28000; }
  return s;
}

// Program 0: one tone across the keyboard on a C4 sine, `center` decides the
// transposition (53 → a fifth up). Program 1: a two-key kit (36, 38).
export function makeTestVAB({center = 53} = {}) {
  const vagData = [
    encodeAdpcm(sine(261.63, 6748)),            // 40 periods of C4
    encodeAdpcm(noise(112, 7), {loop: false}),
    encodeAdpcm(noise(112, 99), {loop: false}),
  ];
  const numPrograms = 2, numVags = vagData.length;
  const vh = new Uint8Array(0x820 + numPrograms * 0x200 + 0x200);
  const vb = new Uint8Array(vagData.reduce((n, v) => n + v.length, 0));
  const le16 = (o, v) => { vh[o] = v & 255; vh[o + 1] = (v >> 8) & 255; };
  const le32 = (o, v) => { le16(o, v & 0xFFFF); le16(o + 2, v >>> 16); };
  vh.set([0x70, 0x42, 0x41, 0x56], 0);          // "pBAV"
  le32(4, 7); le32(8, 0); le32(0x0C, vh.length + vb.length);
  le16(0x10, 0xEEEE); le16(0x12, numPrograms); le16(0x14, 3); le16(0x16, numVags);
  vh[0x18] = 127; vh[0x19] = 64; le32(0x1C, 0xFFFFFFFF);
  const prog = (slot, tones) => { const o = 0x20 + slot * 16; vh[o] = tones.length; vh[o + 1] = 127; vh[o + 4] = 64; };
  const tone = (block, t, {center, min, max, vag, prog}) => {
    const o = 0x820 + block * 0x200 + t * 32;
    vh[o] = 127; vh[o + 2] = 127; vh[o + 3] = 64; vh[o + 4] = center; vh[o + 5] = 0;
    vh[o + 6] = min; vh[o + 7] = max; vh[o + 12] = 2; vh[o + 13] = 2;
    le16(o + 16, 0x80FF); le16(o + 18, 0x5FC0); le16(o + 20, prog); le16(o + 22, vag);
  };
  const p0 = [{center, min: 0, max: 127, vag: 1, prog: 0}];
  const p1 = [{center: 60, min: 36, max: 36, vag: 2, prog: 1}, {center: 60, min: 38, max: 38, vag: 3, prog: 1}];
  prog(0, p0); p0.forEach((t, i) => tone(0, i, t));
  prog(1, p1); p1.forEach((t, i) => tone(1, i, t));
  const table = 0x820 + numPrograms * 0x200;
  let off = 0;
  vagData.forEach((v, i) => { le16(table + (i + 1) * 2, v.length >> 3); vb.set(v, off); off += v.length; });
  const vab = new Uint8Array(vh.length + vb.length);
  vab.set(vh, 0); vab.set(vb, vh.length);
  return {vh, vb, vab};
}

// a PSF1 whose "program" is a PS-X EXE carrying the SEQ and the VAB in its
// text section — the shape a libsnd-based rip has in RAM
export function makeTestPSF() {
  const seq = makeTestSEQ(), {vab} = makeTestVAB();
  const payload = new Uint8Array(Math.ceil((256 + seq.length + 256 + vab.length) / 2048) * 2048);
  payload.set(seq, 256);
  payload.set(vab, 256 + seq.length + 256);
  const exe = new Uint8Array(0x800 + payload.length);
  exe.set([...new TextEncoder().encode("PS-X EXE")], 0);
  const le32 = (o, v) => { exe[o] = v & 255; exe[o + 1] = (v >> 8) & 255; exe[o + 2] = (v >> 16) & 255; exe[o + 3] = (v >>> 24) & 255; };
  le32(0x10, 0x80010000); le32(0x18, 0x80010000); le32(0x1C, payload.length); le32(0x30, 0x801FFFF0);
  exe.set(new TextEncoder().encode("Sony Computer Entertainment Inc. for North America area"), 0x4C);
  exe.set(payload, 0x800);
  const program = new Uint8Array(deflateSync(exe));
  const tag = new TextEncoder().encode("[TAG]title=Night Roll test tune\nartist=us\nlength=0:04.167\n");
  const out = new Uint8Array(16 + program.length + tag.length);
  out.set([0x50, 0x53, 0x46, 1], 0);
  const w32 = (o, v) => { out[o] = v & 255; out[o + 1] = (v >> 8) & 255; out[o + 2] = (v >> 16) & 255; out[o + 3] = (v >>> 24) & 255; };
  w32(4, 0); w32(8, program.length); w32(12, crc32(program));
  out.set(program, 16); out.set(tag, 16 + program.length);
  return out;
}

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---- AKAO (Square's driver, FF7 flavour) and the minipsf/psflib pair ----
// Byte shapes copied from the real FF7 set (INTEGRATION.md "Real rips"):
// 0x10-byte header with a BCD timestamp, voice mask at 0x10, per-voice u16
// offsets relative to the byte after each field, the drum map after the
// score. `voices` maps voice number -> op bytes; `tail` follows the score.
export function makeTestAKAO({id = 0x60, reverb = 3, voices, tail = []}) {
  const nums = Object.keys(voices).map(Number).sort((a, b) => a - b);
  const mask = nums.reduce((m, v) => m | (1 << v), 0);
  const headerLen = 0x14 + 2 * nums.length;
  const bodies = nums.map(v => Uint8Array.from(voices[v]));
  const total = headerLen + bodies.reduce((a, b) => a + b.length, 0) + tail.length;
  const out = new Uint8Array(total);
  out.set([0x41, 0x4B, 0x41, 0x4F], 0);                         // "AKAO"
  out[4] = id & 255; out[5] = id >> 8;
  const len = total - 0x10; out[6] = len & 255; out[7] = len >> 8;
  out[8] = reverb; out[9] = 0;
  out.set([0x96, 0x12, 0x18, 0x22, 0x46, 0x34], 0x0A);           // 1996-12-18 22:46:34, as FF7's Prelude
  out[0x10] = mask & 255; out[0x11] = (mask >> 8) & 255; out[0x12] = (mask >> 16) & 255; out[0x13] = 0;
  let p = headerLen;
  nums.forEach((v, i) => {
    const field = 0x14 + 2 * i, rel = p - (field + 2);
    out[field] = rel & 255; out[field + 1] = rel >> 8;
    out.set(bodies[i], p); p += bodies[i].length;
  });
  out.set(tail, p);
  return out;
}

// A PS-X EXE with `text` at `textStart`; PC/SP as given (the FF7 lib says
// PC 0x800110C0, every mini a placeholder 0x80010000)
export function makeExe({textStart, text, pc = 0x80010000, sp = 0x801FFFF0}) {
  const size = Math.ceil(text.length / 2048) * 2048;
  const exe = new Uint8Array(0x800 + size);
  exe.set(new TextEncoder().encode("PS-X EXE"), 0);
  const le32 = (o, v) => { exe[o] = v & 255; exe[o + 1] = (v >> 8) & 255; exe[o + 2] = (v >> 16) & 255; exe[o + 3] = (v >>> 24) & 255; };
  le32(0x10, pc); le32(0x18, textStart); le32(0x1C, size); le32(0x30, sp);
  exe.set(new TextEncoder().encode("Sony Computer Entertainment Inc. for North America area"), 0x4C);
  exe.set(text, 0x800);
  return exe;
}

// wrap an EXE as PSF1 with a [TAG] block (tags: object, in order, or the
// raw text after "[TAG]" — real blocks repeat keys for multi-line values)
export function makePSF(exe, tags = {}) {
  const program = new Uint8Array(deflateSync(exe));
  const text = typeof tags === "string" ? tags : Object.entries(tags).map(([k, v]) => `${k}=${v}\n`).join("");
  const tag = new TextEncoder().encode("[TAG]" + text);
  const out = new Uint8Array(16 + program.length + tag.length);
  out.set([0x50, 0x53, 0x46, 1], 0);
  const w32 = (o, v) => { out[o] = v & 255; out[o + 1] = (v >> 8) & 255; out[o + 2] = (v >> 16) & 255; out[o + 3] = (v >>> 24) & 255; };
  w32(4, 0); w32(8, program.length); w32(12, crc32(program));
  out.set(program, 16); out.set(tag, 16 + program.length);
  return out;
}

// the FF7 pair in miniature: a lib whose text spans 0x80010000.. and a
// mini whose text lands INSIDE that span (0x801D0000), so overlay order
// decides what RAM holds. The lib carries a marker where the mini's text
// will land, to prove the mini overwrote it.
export const TEST_LIB_NAME = "Test Game.psflib";
export function makeTestMiniPSF(akaoBytes, {libName = TEST_LIB_NAME, title = "Test Tune"} = {}) {
  const libText = new Uint8Array(0x1C0800);          // 0x80010000 .. 0x801D0800 (overlaps the mini's page)
  libText.set(new TextEncoder().encode("DRIVER"), 0x10C0);
  libText.set(new TextEncoder().encode("LIBHERE!"), 0x1C0000);
  const lib = makePSF(makeExe({textStart: 0x80010000, text: libText, pc: 0x800110C0}),
    {comment: "Driver and soundbank data for Test Game.", game: "Test Game", psfby: "us"});
  const miniText = new Uint8Array(0x800);
  miniText.set(akaoBytes, 0);
  const mini = makePSF(makeExe({textStart: 0x801D0000, text: miniText}),
    {utf8: 1, _lib: libName, game: "Test Game", title, length: "0:10", fade: "2"});
  return {lib, mini, libName};
}
