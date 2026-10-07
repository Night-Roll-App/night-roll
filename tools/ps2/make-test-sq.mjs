// Synthetic PSF2 / SQ / HD bytes — our own, no game data — so the PS2
// container + Sony stock-driver pipeline is tested end to end without a
// real rip. Mirrors tools/psx/make-test-seq.mjs's role and style.
import { deflateSync } from "node:zlib";
import { crc32 } from "../psx/psf.mjs";

const be32 = v => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
const le16 = v => [v & 255, (v >> 8) & 255];
const le32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
const ascii = s => [...s].map(c => c.charCodeAt(0));

// --- SQ score: channel 0 plays C4 E4 (G4+C5 chord, via the "skip next
// delta" bit trick) D4, looping the whole bar forever; ppqn 480, 120bpm. ---
export const TEST_SQ_NOTES = [ // [tick, key, duration ticks] — the chord (G4,C5) shares tick 960
  [0, 60, 480], [480, 64, 480], [960, 67, 480], [960, 72, 480], [1440, 62, 480],
];
export const TEST_SQ_END = 1920;

function scoreBytes() {
  // {tick, bytes, trick}: `trick` ORs 0x80 onto the event's LAST data byte,
  // meaning the very next event (same tick) is encoded with NO delta byte —
  // real Sony encoders use this to save space on simultaneous events.
  const ev = [];
  const at = (tick, bytes, trick = false) => ev.push({tick, bytes, trick});
  at(0, [0xC0, 0]);                 // program 0
  at(0, [0xB0, 99, 0]);             // loop start (cc99=0)
  at(0, [0x90, 60, 100]); at(480, [0x90, 60, 0]);
  at(480, [0x90, 64, 100]); at(960, [0x90, 64, 0]);
  at(960, [0x90, 67, 100], true);   // chord: trick flags the NEXT event as zero-delta
  at(960, [0x90, 72, 90]);
  at(1440, [0x90, 67, 0]); at(1440, [0x90, 72, 0]);
  at(1440, [0xE0, 0x00, 0x40]); at(1700, [0xE0, 0x7F, 0x3F]); // the wheel: centre (lsb 00, msb 40), then one step below it (lsb 7F, msb 3F)
  at(1440, [0x90, 62, 100]); at(TEST_SQ_END, [0x90, 62, 0]);
  at(TEST_SQ_END, [0xB0, 99, 1]);   // loop end (cc99=1)
  at(TEST_SQ_END, [0xB0, 38, 0]);   // forever
  at(TEST_SQ_END, [0xFF, 0x51, 0, 0x07, 0xA1, 0x20]); // re-affirm 120bpm (0x07A120 = 500000), exercising the tempo meta's padding byte
  at(TEST_SQ_END, [0xFF, 0x2F]);
  // stable sort keeps same-tick order (loop start before the first note, etc.)
  const order = ev.map((e, i) => i).sort((a, b) => ev[a].tick - ev[b].tick || a - b);
  const out = [];
  let last = 0, status = 0, skipNext = false;
  for (const i of order) {
    const e = ev[i];
    if (skipNext) { if (e.tick !== last) throw new Error("trick used across different ticks"); }
    else { let v = e.tick - last; const vl = [v & 0x7F]; while ((v >>= 7)) vl.unshift((v & 0x7F) | 0x80); out.push(...vl); }
    last = e.tick;
    skipNext = false;
    const bytes = e.bytes.slice();
    if (e.trick) bytes[bytes.length - 1] |= 0x80, skipNext = true;
    const [st, ...rest] = bytes;
    if (st !== status) out.push(st); // running status: same status byte as last time is omitted (0xFF never equals `status`, so a meta's own byte is always explicit)
    if (st !== 0xFF) status = st;    // 0xFF (meta) never becomes running status
    out.push(...rest);
  }
  return out;
}

const chunk = (creator, type, body) => [...ascii(creator), ...ascii(type), ...body];

// A single Vers+Hdr+Midi chunk trio around one score, matching every real
// Dark Cloud .SQ file's shape (tools/ps2/sq.mjs's header comment).
export function makeTestSQ({ppq = 480} = {}) {
  const sc = scoreBytes();
  const vers = chunk("IECS", "sreV", [...le32(16), ...le16(0), 1, 0]); // chunkSize=16, ver 1.0
  const HDR_CHUNK_SIZE = 32; // tag(8) + chunkSize + fileSize + songChunkAddr + midiChunkAddr + seSeq + seSong (6*4)
  // Hdr: chunkSize, fileSize, songChunkAddr(-1), midiChunkAddr (unused for navigation by the reader; filled in anyway), se*ChunkAddr(-1)
  const hdr = chunk("IECS", "uqeS", [...le32(HDR_CHUNK_SIZE), ...le32(0), ...le32(0xFFFFFFFF), ...le32(16 + HDR_CHUNK_SIZE), ...le32(0xFFFFFFFF), ...le32(0xFFFFFFFF)]);
  const MIDI_SUBHDR_SIZE = 20; // tag(8) + midiChunkSize + maxMidiNumber + midiOffsetAddr(rel)
  // Midi chunk: midiChunkSize, maxMidiNumber=0, midiOffsetAddr(rel to this chunk's own start)=MIDI_SUBHDR_SIZE (the Midi Data Block sits right after this sub-header)
  const midiHdr = chunk("IECS", "idiM", [...le32(6 + sc.length), ...le32(0), ...le32(MIDI_SUBHDR_SIZE)]);
  // Midi Data Block: sequenceOffset=6 (no compOption field, since 6 is the "no compression" sentinel), ppqn, then the score
  const midiData = [...le32(6), ...le16(ppq), ...sc];
  return new Uint8Array([...vers, ...hdr, ...midiHdr, ...midiData]);
}

// A chunk with an "offset table" body (Prog/Sset/Smpl/Vagi all share this
// shape, per SonyPS2InstrSet.cpp): tag(8) + chunkSize(4) + maxNumber(4) +
// (maxNumber+1) u32 offsets — each RELATIVE TO THIS CHUNK'S OWN START, a
// sentinel 0xFFFFFFFF meaning "unused slot" (real Dark Cloud HD files use
// this for both Program and Sample tables; tools/ps2/hd.mjs guards it) —
// followed by each entry's own param bytes, in order.
function offsetChunk(creator, type, paramBlocks) {
  const n = paramBlocks.length;
  const tableStart = 8 + 4 + 4;
  let pos = tableStart + n * 4;
  const offsets = [];
  const bodies = [];
  for (const blk of paramBlocks) {
    if (blk === null) { offsets.push(0xFFFFFFFF); continue; }
    offsets.push(pos);
    bodies.push(blk);
    pos += blk.length;
  }
  return chunk(creator, type, [...le32(pos), ...le32(n - 1), ...offsets.flatMap(le32), ...bodies.flat()]);
}

// --- HD: one program, one split covering the whole keyboard, one sample,
// one VAG-info entry pointing at offset 0 in a (synthetic, silent) BD. ---
export function makeTestHD({baseNote = 60, adsr1 = 0x80FF, adsr2 = 0x1FEE, sampleRate = 0} = {}) {
  const vers = chunk("IECS", "sreV", [...le32(16), ...le16(0), 1, 1]);

  // VAGInfoParam (8 bytes): vagOffsetAddr(u32) + sampleRate(u16) + attribute(u8) + reserved(u8)
  // sampleRate defaults to 0 (matching most of this fixture's existing
  // callers/tests): tools/ps2/hd.mjs's toBank() carries it through as each
  // vag's `rate`, and tools/psx/spu-render.mjs treats a falsy rate as "use
  // the renderer's own SPU_RATE" — so 0 here is "unspecified", not "silent".
  const vagInfoParam = [...le32(0), ...le16(sampleRate), 0 /* SCEHD_VAG_1SHOT */, 0];
  // SampleParam (42 bytes) — offsets cross-checked against SonyPS2InstrSet.cpp's addChild calls
  const sampleParam = [
    ...le16(0) /* vagIndex */, 0 /* velRangeLow */, 0 /* velCrossFade */, 127 /* velRangeHigh */,
    0, 0, 0, 0, 0, 0, /* vel/amp follow-pitch fields, unused */
    baseNote, 0 /* detune */, 0 /* panpot */, 0 /* group */, 0 /* priority */, 100 /* volume */, 0 /* reserved */,
    ...le16(adsr1), ...le16(adsr2),
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, /* key-follow ADSR fields, unused */
    ...le16(0), ...le16(0), ...le16(0), ...le16(0), /* LFO delay/fade fields, unused */
    0, 0, /* sampleLfoAttr, sampleSpuAttr */
  ];
  // SampSetParam (4-byte header + nSample u16s): velCurve, velLimitLow, velLimitHigh, nSample, sampleIndex[]
  const sampSetParam = [0, 0, 127, 1, ...le16(0)];
  // SplitBlock (20 bytes)
  const split = [...le16(0) /* sampleSetIndex */, 0 /* rangeLow */, 0 /* crossFade */, 127 /* rangeHigh */, 0 /* splitNumber */,
    ...le16(0), ...le16(0), 0, 0, 0, 0, 0, 0, 100 /* volume */, 0 /* panpot */, 0 /* transpose */, 0 /* detune */];
  // ProgParam (36 bytes) + its one SplitBlock appended right after (splitBlockAddr=36, relative to the ProgParam's own start)
  const progParam = [...le32(36), 1 /* nSplit */, 20 /* sizeSplitBlock */, 100 /* volume */, 0 /* panpot */, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le16(0), 0, 0, 0, 0,
    ...split];

  const vagi = offsetChunk("IECS", "igaV", [vagInfoParam]);
  const samp = offsetChunk("IECS", "lpmS", [sampleParam]);
  const sset = offsetChunk("IECS", "tesS", [sampSetParam]);
  const prog = offsetChunk("IECS", "gorP", [progParam]);

  // Hdr chunk: only the address fields are read (tools/ps2/hd.mjs never
  // navigates by chunkSize for HD, unlike SQ's Midi chunk) — addresses are
  // absolute from the HD file's own start (offset 0).
  const vagiAddr = 16 + 64; // Vers(16) + a conventional 64-byte Hdr chunk, matching real files
  const sampAddr = vagiAddr + vagi.length;
  const ssetAddr = sampAddr + samp.length;
  const progAddr = ssetAddr + sset.length;
  const bodySize = 32;
  const hdrCore = chunk("IECS", "daeH", [...le32(64), ...le32(0), ...le32(bodySize), ...le32(progAddr), ...le32(ssetAddr), ...le32(sampAddr), ...le32(vagiAddr)]);
  const hdr = new Uint8Array([...hdrCore, ...new Array(64 - hdrCore.length).fill(0)]); // pad to the conventional 64-byte Hdr chunk (reserved[8] in the real struct); vagiAddr above already assumes exactly 64
  return new Uint8Array([...vers, ...hdr, ...vagi, ...samp, ...sset, ...prog]);
}

// PSF2 container: header + tags, mirroring tools/psx/psf.mjs's makePSF.
export function makePSF2(reserved, tags = {}) {
  const tagLines = Object.entries(tags).flatMap(([k, v]) => String(v).split("\n").map(vv => `${k}=${vv}`));
  const tagBytes = tagLines.length ? [...ascii("[TAG]"), ...ascii(tagLines.join("\n"))] : [];
  const program = []; // PSF2's program is always empty; the payload is `reserved`
  const crc = crc32(new Uint8Array(program));
  return new Uint8Array([...ascii("PSF"), 2, ...le32(reserved.length), ...le32(program.length), ...le32(crc), ...reserved, ...program, ...tagBytes]);
}

// One zlib block per file (block size == the file's own length, so every
// file is exactly one block — the simplest legal case psf2fs.c's makearchivedir
// supports, and enough to round-trip real-shaped trees).
function fileBody(data) {
  const z = deflateSync(Buffer.from(data));
  return {u: data.length, b: Math.max(1, data.length), sizes: [z.length], blocks: z};
}

// tree: [{name, data}] (a file) | [{name, children: tree}] (a directory) —
// builds the whole "reserved" area (directory tables first, then every
// file's block-size table + compressed bytes), matching the layout order
// measured in a real minipsf2 (tests/ps2-real.test.mjs).
export function buildPSF2Fs(tree) {
  const dirs = []; // {node, entries: [{name, kind, ref}]}
  const files = []; // {node, body}
  function walk(node) {
    const entries = node.map(e => {
      if (e.children) { const child = {node: e.children, entries: null}; dirs.push(child); return {name: e.name, kind: "dir", ref: child}; }
      const body = fileBody(e.data);
      const f = {node: e, body};
      files.push(f);
      return {name: e.name, kind: "file", ref: f};
    });
    return entries;
  }
  const root = {node: tree, entries: null};
  dirs.push(root);
  root.entries = walk(tree);
  for (let i = 1; i < dirs.length; i++) dirs[i].entries = walk(dirs[i].node); // BFS: walk() above only fills immediate children; recurse for nested dirs
  // sizes and offsets: all dir tables first, in BFS order, then every file's block-table+data
  let pos = 0;
  for (const d of dirs) { d.offset = pos; pos += 4 + 48 * d.entries.length; }
  for (const f of files) { f.offset = pos; pos += 4 * f.body.sizes.length + f.body.blocks.length; }
  const out = new Uint8Array(pos);
  const view = new DataView(out.buffer);
  for (const d of dirs) {
    view.setInt32(d.offset, d.entries.length, true);
    let p = d.offset + 4;
    for (const e of d.entries) {
      const nameBytes = ascii(e.name);
      out.set(nameBytes.slice(0, 36), p);
      if (e.kind === "dir") { view.setInt32(p + 36, e.ref.offset, true); view.setInt32(p + 40, 0, true); view.setInt32(p + 44, 0, true); }
      else { view.setInt32(p + 36, e.ref.offset, true); view.setInt32(p + 40, e.ref.body.u, true); view.setInt32(p + 44, e.ref.body.b, true); }
      p += 48;
    }
  }
  for (const f of files) {
    let p = f.offset;
    for (const sz of f.body.sizes) { view.setUint32(p, sz, true); p += 4; }
    out.set(f.body.blocks, p);
  }
  return out;
}

export function fileNode(name, data) { return {name, data}; }
export function dirNode(name, children) { return {name, children}; }
