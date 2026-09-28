// What the real USF rips taught the N64 path (2026-09-27, tools/n64/
// INTEGRATION.md "Real rips"), reproduced here without any rip data: the
// USF container and sparse-image reconstruction, the EAD table locators,
// the mini's sequence-id rules, and the interpreter bugs that Super Mario
// 64 / Ocarina of Time / Majora's Mask sequences exposed. Every fixture is
// bytes assembled below or text in tests/fixtures/n64-usf-tracks.json.
// With N64_USF_DIR set to a folder of unzipped sets the whole catalogue is
// run as an extra check; CI has no rips and skips that test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isUSF, parseUSF, parseSR64, loadUSF, SparseImage, swapWords, rdramOf, PJ64_RDRAM } from "../tools/n64/usf.mjs";
import { locateEAD, findALSeqFiles, findAudioTables, findCachedSequences, sequenceBytes,
         miniSequenceId, decodeLiA1, USF_GAMES, gameOfSet } from "../tools/n64/ead-usf.mjs";
import { parseSequence } from "../tools/n64/seq-libultra.mjs";
import { makeTestSeq } from "../tools/n64/make-test-seq.mjs";
import { makeTestPSF } from "../tools/psx/make-test-seq.mjs";
import { pitchName } from "../tools/nsf/notes.mjs";
import { findAudioFiles, readBank } from "../tools/n64/bank.mjs";
import { expandBook, decodeFrames } from "../tools/n64/vadpcm.mjs";
import { renderN64 } from "../tools/n64/render.mjs";
import { channelGroups } from "../tools/n64/notes.mjs";
import { tickSeconds } from "../tools/n64/seq-libultra.mjs";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/n64-usf-tracks.json", import.meta.url), "utf8"));

// ---- byte builders --------------------------------------------------------
const le32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
const be32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const be16 = v => [(v >> 8) & 255, v & 255];
const cat = (...xs) => Uint8Array.from(xs.flatMap(x => x instanceof Uint8Array ? [...x] : x));

// SR64: "SR64" then {u32le len, u32le offset, bytes} until len 0. The
// stored bytes are the file's (little-endian words for ROM and RDRAM).
function sr64(chunks) {
  return cat([0x53, 0x52, 0x36, 0x34], ...chunks.map(c => cat(le32(c.bytes.length), le32(c.offset), c.bytes)), le32(0));
}
// A USF: PSF v0x21, reserved = SR64 ROM (or 4 zero bytes) + SR64 state, no program, tags
function usf({rom = null, state = null, tags = {}}) {
  const reserved = cat(rom ? sr64(rom) : le32(0), state ? sr64(state) : le32(0));
  const tag = new TextEncoder().encode("[TAG]" + Object.entries(tags).map(([k, v]) => `${k}=${v}\n`).join(""));
  return cat([0x50, 0x53, 0x46, 0x21], le32(reserved.length), le32(0), le32(0), reserved, tag);
}
// Project64 1.4 state header page: id, RDRAM size, ROM header copy, PC; then
// RDRAM words at 0x75C + physical address (all little-endian words)
function pj64({pc, ram = {}, ramSize = 0x400000, header = new Uint8Array(0x40)}) {
  const hdr = new Uint8Array(0x50);
  hdr.set(le32(0x23D8A6C8), 0); hdr.set(le32(ramSize), 4); hdr.set(swapWords(header), 8); hdr.set(le32(pc), 0x4C);
  const chunks = [{offset: 0, bytes: hdr}];
  for (const [addr, bytes] of Object.entries(ram)) chunks.push({offset: PJ64_RDRAM + (+addr), bytes: swapWords(bytes)});
  return chunks;
}
const romChunk = (offset, bytes) => ({offset, bytes: swapWords(bytes)}); // big-endian in, file order out

// ---- container -----------------------------------------------------------
test("USF container: SR64 ROM and PJ64 state parse out of the reserved area; lib loads first, mini overrides", () => {
  const seqBytes = makeTestSeq();
  const lib = {name: "NUS-TEST-USA.usflib", bytes: usf({
    rom: [romChunk(0x1000, seqBytes), romChunk(0x3000, Uint8Array.from([1, 2, 3, 4]))],
    state: pj64({pc: 0x80248B24, ram: {0x248B28: Uint8Array.from(be32(0x24050002)), 0x1000: Uint8Array.from([9, 9, 9, 9])}}),
  })};
  const mini = {name: "01 Song.miniusf", bytes: usf({
    state: [{offset: PJ64_RDRAM + 0x248B28, bytes: Uint8Array.from(le32(0x24050003))}],
    tags: {_lib: "NUS-TEST-USA.usflib", title: "Song", length: "1:23", fade: "5", game: "Test"},
  })};
  assert.ok(isUSF(mini.bytes) && isUSF(lib.bytes));
  const m = parseUSF(mini.bytes);
  assert.deepEqual(m.libs, ["NUS-TEST-USA.usflib"]);
  assert.equal(m.tags.title, "Song");
  assert.equal(m.rom.length, 0, "a mini carries no ROM of its own");
  assert.equal(m.state.length, 1);
  assert.equal(m.programSize, 0, "USF leaves the PSF program section empty");
  const l = parseUSF(lib.bytes);
  assert.equal(l.rom.length, 2);
  assert.equal(l.rom[1].offset, 0x3000);
  assert.deepEqual([...l.rom[1].bytes], [4, 3, 2, 1], "the file stores little-endian words");

  const set = loadUSF([mini, lib]);
  assert.deepEqual(set.order, ["NUS-TEST-USA.usflib", "01 Song.miniusf"]);
  assert.equal(set.tags.title, "Song");
  assert.deepEqual([...set.rom.read(0x3000, 4)], [1, 2, 3, 4], "ROM comes back big-endian");
  assert.deepEqual([...set.rom.read(0x1000, seqBytes.length, {strict: true})], [...seqBytes]);
  const {size, ram} = rdramOf(set.state);
  assert.equal(size, 0x400000);
  assert.equal(ram.u32(0x248B28), 0x24050003, "the mini's word replaced the lib's");
  assert.deepEqual([...ram.read(0x1000, 4)], [9, 9, 9, 9]);

  // a PSF that is not a USF is refused, a mini without its lib names it
  assert.throws(() => parseUSF(makeTestPSF()), /not USF/);
  assert.throws(() => loadUSF([mini]), /needs NUS-TEST-USA.usflib/);
  // SR64 sanity
  assert.deepEqual(parseSR64(Uint8Array.from(le32(0)), 0), {chunks: [], end: 4});
  assert.throws(() => parseSR64(Uint8Array.from([0x53, 0x52, 0x36, 0x34, 9, 0, 0, 0, 0, 0, 0, 0, 1]), 0), /runs off the end/);
});

test("SparseImage: later writes win, runs merge, coverage and strict reads see holes", () => {
  const img = new SparseImage();
  img.write(0x100, Uint8Array.from([1, 1, 1, 1]));
  img.write(0x104, Uint8Array.from([2, 2]));
  img.write(0x200, Uint8Array.from([3, 3, 3, 3]));
  img.write(0x102, Uint8Array.from([7, 7, 7]));
  assert.deepEqual(img.runs(), [{offset: 0x100, length: 6}, {offset: 0x200, length: 4}]);
  assert.deepEqual([...img.read(0x100, 6)], [1, 1, 7, 7, 7, 2]);
  assert.equal(img.coverage(0x100, 0x104), 10 / 0x104);
  assert.equal(img.has(0x100, 6), true);
  assert.equal(img.has(0x100, 7), false);
  assert.deepEqual([...img.read(0x105, 3, {fill: 0xEE})], [2, 0xEE, 0xEE]);
  assert.throws(() => img.read(0x105, 3, {strict: true}), /only 1 of 3 bytes present/);
  assert.equal(img.u16(0x200), 0x0303);
  assert.equal(img.bytesPresent, 10);
});

// ---- table locators ------------------------------------------------------
// sm64 generation: an ALSeqFile (rev 3) with three sequences and the bank-set
// table right after it, in a sparse ROM with a hole inside sequence 2
function sm64Rom() {
  const s0 = Uint8Array.from([0xFF, 0, 0, 0]), s1 = makeTestSeq(), s2 = makeTestSeq({loop: true});
  const count = 3, hdr = 4 + 8 * count, base = 0x7B0860;
  const off = [(hdr + 15) & ~15];
  off.push((off[0] + s0.length + 15) & ~15);
  off.push((off[1] + s1.length + 15) & ~15);
  const end = (off[2] + s2.length + 15) & ~15;
  const file = new Uint8Array(end);
  file.set(be16(3), 0); file.set(be16(count), 2);
  [s0, s1, s2].forEach((s, i) => { file.set(be32(off[i]), 4 + i * 8); file.set(be32(s.length), 8 + i * 8); file.set(s, off[i]); });
  // gAlBankSets: u16 offset per sequence, then {count, ids... (listed last-first)}
  const sets = cat(be16(6), be16(8), be16(11), [1, 0x11], [2, 0x22, 0x0E], [1, 0x13]);
  const rom = new SparseImage();
  rom.write(base, file.subarray(0, off[2] + 10));
  rom.write(base + off[2] + 14, file.subarray(off[2] + 14));   // 4-byte hole inside sequence 2
  rom.write(base + end, sets);
  return {rom, base, end, s1, s2, off};
}

test("sm64 tables: ALSeqFile found by structure and confirmed by the bank-set table; per-sequence coverage and banks", () => {
  const {rom, base, end, s1, off} = sm64Rom();
  const found = findALSeqFiles(rom);
  assert.equal(found.files.length, 1);
  assert.equal(found.seqFile.at, base);
  assert.equal(found.seqFile.revision, 3);
  assert.equal(found.bankSets, base + end);
  const loc = locateEAD({rom, state: new SparseImage()});
  assert.equal(loc.gen, "sm64");
  assert.equal(loc.sequences.length, 3);
  assert.equal(loc.sequences[1].rom, base + off[1]);
  assert.equal(loc.sequences[1].coverage, 1);
  assert.ok(loc.sequences[2].coverage < 1 && loc.sequences[2].coverage > 0.9, "the hole shows up as partial coverage");
  assert.deepEqual(loc.sequences[0].banks, [0x11]);
  assert.deepEqual(loc.sequences[1].banks, [0x0E, 0x22], "bank ids are stored last-first");
  assert.deepEqual([...sequenceBytes({rom}, loc.sequences[1])], [...s1]);
  assert.throws(() => sequenceBytes({rom}, loc.sequences[2]), /only .* bytes present/);
  // and the bytes play: the test melody comes out of the located sequence
  const res = parseSequence(sequenceBytes({rom}, loc.sequences[1]));
  assert.deepEqual(res.notes.filter(n => n.ch === 0).map(n => pitchName(n.midi)), ["C4", "E4", "G4", "C5", "C4", "C4"]);
});

// oot generation: gSoundFontTable, gSequenceFontTable and gSequenceTable in
// RDRAM (relocated: entry 0's romAddr equals the header's), one alias
// entry, and a persistent-cache entry pointing at a RAM copy of sequence 0
function ootImages() {
  const seq1 = makeTestSeq({abi: "oot"}), seq0 = makeTestSeq({abi: "oot", loop: true});
  const AUDIOBANK = 0xD390, AUDIOSEQ = 0x29DE0;
  const table = (count, romAddr, entries) => cat(be16(count), be16(0), be32(romAddr), new Uint8Array(8),
    ...entries.map(e => cat(be32(e.rom), be32(e.size), [2, e.cp ?? 2], new Uint8Array(6))));
  const fonts = table(2, AUDIOBANK, [{rom: AUDIOBANK, size: 0x3AA0, cp: 0}, {rom: AUDIOBANK + 0x3AA0, size: 0x17B0, cp: 0}]);
  const seqFonts = cat(be16(6), be16(8), be16(10), [1, 0x01], [1, 0x00], [1, 0x01], new Uint8Array(4)); // 3 sequences -> font lists, padded to 16 like the game's data
  const seqs = table(3, AUDIOSEQ, [{rom: AUDIOSEQ, size: seq0.length, cp: 1}, {rom: AUDIOSEQ + 0x100, size: seq1.length}, {rom: 1, size: 0}]);
  const cache = cat(be32(0x801C0BD0), be32(seq0.length), be16(0), be16(0));            // AudioCacheEntry {ramAddr, size, tableType, id}
  const ram = new SparseImage();
  ram.write(0x113740, fonts); ram.write(0x113740 + fonts.length, seqFonts); ram.write(0x113740 + fonts.length + seqFonts.length, seqs);
  ram.write(0x1C0BD0, seq0); ram.write(0x1AAD40, cache);
  const rom = new SparseImage();
  rom.write(AUDIOSEQ + 0x100, seq1);                                                     // sequence 0 was never read from ROM (preloaded)
  return {ram, rom, seq0, seq1, AUDIOSEQ, AUDIOBANK, seqTableAt: 0x113740 + fonts.length + seqFonts.length};
}

test("oot tables: font/sequence tables located in RDRAM, alias rows resolved, preloaded sequences found through the cache", () => {
  const {ram, rom, seq0, seq1, AUDIOSEQ, AUDIOBANK, seqTableAt} = ootImages();
  const tables = findAudioTables(ram);
  assert.deepEqual(tables.map(t => [t.at, t.count, t.romAddr]), [[0x113740, 2, AUDIOBANK], [seqTableAt, 3, AUDIOSEQ]]);
  const state = new SparseImage();
  for (const c of pj64({pc: 0x80000180})) state.write(c.offset, c.bytes);
  for (const r of ram.ranges) state.write(PJ64_RDRAM + r.offset, swapWords(r.bytes));
  const loc = locateEAD({rom, state});
  assert.equal(loc.gen, "oot");
  assert.equal(loc.audioseq, AUDIOSEQ);
  assert.equal(loc.audiobank, AUDIOBANK);
  assert.equal(loc.sequences.length, 3);
  assert.equal(loc.sequences[0].coverage, 0, "not in the ROM pages");
  assert.equal(loc.sequences[0].cachePolicy, 1);
  assert.equal(loc.sequences[1].coverage, 1);
  assert.equal(loc.sequences[2].aliasOf, 1);
  assert.equal(loc.sequences[2].rom, AUDIOSEQ + 0x100);
  assert.deepEqual(loc.sequences.map(s => s.fonts), [[1], [0], [1]]);
  const cached = findCachedSequences(ram, loc.sequences);
  assert.deepEqual([...cached.keys()], [0]);
  assert.equal(cached.get(0).ram, 0x1C0BD0);
  assert.equal(cached.get(0).coverage, 1);
  assert.deepEqual([...ram.read(cached.get(0).ram, cached.get(0).size)], [...seq0]);
  assert.deepEqual([...sequenceBytes({rom}, loc.sequences[1])], [...seq1]);
  assert.equal(parseSequence(seq1, {abi: "oot"}).notes.length, 7);
});

test("mini sequence id: `addiu a1, zero, n` after the saved PC (SM64/OoT rips) or a RAM word (MM rip)", () => {
  assert.equal(decodeLiA1(0x24050002), 2);
  assert.equal(decodeLiA1(0x2405001E), 0x1E);
  assert.equal(decodeLiA1(0x24040002), null, "a0, not a1");
  assert.equal(decodeLiA1(0x8FA50010), null, "lw");
  const state = new SparseImage();
  for (const c of pj64({pc: 0x80248B24, ram: {0x248B28: Uint8Array.from(be32(0x24050003)), 0x1F9B24: Uint8Array.from(be32(0x15))}})) state.write(c.offset, c.bytes);
  assert.equal(miniSequenceId({state}), 3);
  assert.equal(miniSequenceId({state}, {kind: "ram", addr: 0x1F9B24}), 0x15);
  assert.equal(miniSequenceId({state}, {kind: "ram", addr: 0x1F9B30}), null, "word not in the rip");
  // the manifest keys on the usflib name the minis reference
  for (const [k, g] of Object.entries(USF_GAMES)) {
    assert.match(k, /^nus-[a-z0-9]{4}-[a-z]{3}\.usflib$/);
    assert.equal(g.code.toLowerCase(), k.slice(4, 8));
    assert.ok(["sm64", "oot", "mm"].includes(g.abi));
  }
  assert.equal(gameOfSet({order: ["NUS-NSME-USA.usflib", "x.miniusf"]}).abi, "sm64");
  assert.equal(gameOfSet({order: ["NUS-NZSE-USA.usflib", "x.miniusf"]}).abi, "mm");
  assert.equal(gameOfSet({order: ["NUS-XXXX-USA.usflib"]}), null);
});

// ---- interpreter regressions from the real sequences ----------------------
// a one-channel, one-layer song: sequence at 0, channel script at 0x20,
// layer at 0x40; `seqPrefix` runs before the channel starts, `chan` after
// the channel picks instrument 5 and before its layer starts
function song({abi = "sm64", seqPrefix = [], chan = [], layer = []}) {
  const b = new Uint8Array(0x80);
  const seq = cat(seqPrefix, [0xD7, 0x00, 0x01], [0x90, 0x00, 0x20], [0xFD, 0x30], [0xFF]);
  const ch = cat([0xC1, 0x05], chan, abi === "sm64" ? [0x90, 0x00, 0x40] : [0x88, 0x00, 0x40], [0xFD, 0x30], [0xFF]);
  const ly = cat(layer, [0x27, 0x30], [0xFF]);               // semitone 39 = C4, 48 ticks
  b.set(seq, 0); b.set(ch, 0x20); b.set(ly, 0x40);
  return b;
}

test("sm64 ABI: channel 0x60|n is note priority, not an io slot — every SM64 song opens with one", () => {
  // before the fix 0x6A threw "not in the sm64 ABI table" and 34 of 38 SM64 tracks failed
  const res = parseSequence(song({chan: [0x6A]}));
  assert.equal(res.notes.length, 1);
  assert.equal(pitchName(res.notes[0].midi), "C4");
  assert.equal(res.notes[0].inst, 5);
  // the io-slot guard still catches an OoT ldlayer fed to the sm64 table
  assert.throws(() => parseSequence(song({chan: [0x88, 0x00, 0x40]})), /channel opcode 0x88/);
});

test("oot ABI: channel B0-BE are full opcodes with argument tables, dispatched before the low-nibble ops", () => {
  // Kakariko Village etc. begin with B0 (ldfilter, s16) / BB (combfilter, u8 s16); they used to throw
  for (const abi of ["oot", "mm"]) {
    const res = parseSequence(song({abi, chan: [0xB0, 0x00, 0x60, 0xBB, 0x01, 0x00, 0x60, 0xB1, 0xB3, 0x02]}), {abi});
    assert.equal(res.notes.length, 1, abi);
    assert.equal(res.notes[0].inst, 5, abi);
    assert.ok(res.stubbed.includes("channel oot 0xb0"), abi);
  }
  // BD differs: OoT randptr takes two s16, MM's takes one — the bytes after it land differently
  const bytes = song({abi: "oot", chan: [0xBD, 0x00, 0x00, 0xC1, 0x09]});
  assert.equal(parseSequence(bytes, {abi: "mm"}).notes[0].inst, 9, "MM: BD ate 2 bytes, then C1 09 ran");
  assert.equal(parseSequence(bytes, {abi: "oot"}).notes[0].inst, 5, "OoT: BD ate 4 bytes (00 00 C1 09), instrument 5 stands");
  // OoT has no A0-AF channel ops; MM does (A0 = s16)
  assert.throws(() => parseSequence(song({abi: "oot", chan: [0xA0, 0x00, 0x00]}), {abi: "oot"}), /channel opcode 0xa0/);
  assert.equal(parseSequence(song({abi: "mm", chan: [0xA0, 0x00, 0x00]}), {abi: "mm"}).notes.length, 1);
});

test("oot ABI: the sequence register is an s8 — `ldio 4; sub 0xFF; rbeqz` wraps to zero (MM Ballad of the Wind Fish)", () => {
  // io port 4 is -1 when the game has not written it: -1 - 0xFF wraps to 0 in an s8, so the
  // branch over `stopseq` is taken and the band plays; as a JS number it never did
  const bytes = song({abi: "mm", seqPrefix: [0x84, 0xC8, 0xFF, 0xF3, 0x01, 0xC6]});
  const res = parseSequence(bytes, {abi: "mm"});
  assert.equal(res.notes.length, 1);
  assert.equal(res.ioReads, 1, "reads of game io ports are counted so the dump can say so");
  // a preset port value takes the other path
  assert.equal(parseSequence(bytes, {abi: "mm", io: {4: 3}}).notes.length, 0);
  assert.equal(parseSequence(bytes, {abi: "mm", io: {4: 0xFF}}).notes.length, 1);
  // SM64 keeps its s32 register: 0 - 0xFF is not zero there
  assert.equal(parseSequence(song({seqPrefix: [0xCC, 0x00, 0xC8, 0xFF, 0xFA, 0x00, 0x0A, 0xFF]})).notes.length, 0);
});

test("present mask: a byte the rip does not carry is an error with its offset, and a C7 write fills a hole", () => {
  const bytes = makeTestSeq();
  const present = new Uint8Array(bytes.length).fill(1);
  assert.equal(parseSequence(bytes, {present}).notes.length, 7);
  present[3] = 0;                // the D7 channel mask's high byte, read on tick 0
  assert.throws(() => parseSequence(bytes, {present}), /byte 0x03 is not in the rip \(tick 0\)/);
  present[3] = 1;
  const lyEnd = bytes.findIndex((v, k) => v === 0xF7 && bytes[k + 1] === 0xFF) + 1; // channel 0's layer FF, read after its 2x loop at beat 7
  present[lyEnd] = 0;
  assert.throws(() => parseSequence(bytes, {present}), new RegExp(`byte 0x${lyEnd.toString(16)} is not in the rip \\(tick 288\\)`));
  // a hole that the script writes before reading is fine: C7 v addr pokes seq[addr]
  const poke = new Uint8Array(0x30);
  poke.set([0xCC, 0x02, 0xC7, 0x00, 0x00, 0x11, 0xD7, 0x00, 0x01, 0x90, 0x00, 0x10, 0xFD, 0x10, 0xFF], 0);
  poke.set([0xC1, 0x00, 0x90, 0x00, 0x20, 0xFD, 0x10, 0xFF], 0x10);   // 0x11 (instrument) is written by the C7 above
  poke.set([0x27, 0x10, 0xFF], 0x20);
  const mask = new Uint8Array(0x30).fill(1); mask[0x11] = 0;
  const res = parseSequence(poke, {present: mask});
  assert.equal(res.notes[0].inst, 2);
  assert.equal(res.selfModified, true);
});

test("fixture text: tracks the real sets exposed, with sequence ids inside each game's table and decomp names attached", () => {
  for (const g of FIXTURE.games) {
    assert.ok(USF_GAMES[g.usflib.toLowerCase()], g.usflib + " is in the manifest");
    assert.equal(USF_GAMES[g.usflib.toLowerCase()].abi, g.abi);
    assert.ok(g.sequences > 0 && g.tracks.length > 0);
    const titles = new Set();
    for (const t of g.tracks) {
      assert.ok(t.seq >= 0 && t.seq < g.sequences, `${g.game}: ${t.title} seq ${t.seq}`);
      assert.match(t.file, /\.miniusf$/);
      assert.ok(!titles.has(t.file), "one row per file"); titles.add(t.file);
      if (t.decomp) assert.match(t.decomp, /^(NA_BGM_[A-Z0-9_]+|[0-9A-F]{2}_[a-z0-9_]+)$/, "zeldaret NA_BGM_* or sm64 sequences.json keys");
    }
  }
});

// ---- the real thing, when the sets are on disk ---------------------------
const RIPS = process.env.N64_USF_DIR;
test("real USF sets (N64_USF_DIR): every music sequence in the fixture parses to the recorded numbers", {skip: !RIPS || !existsSync(RIPS)}, () => {
  for (const g of FIXTURE.games) {
    const dir = join(RIPS, g.dir);
    if (!existsSync(dir)) continue;
    const names = readdirSync(dir).filter(n => /\.(miniusf|usflib)$/i.test(n));
    const files = names.map(n => ({name: n, bytes: new Uint8Array(readFileSync(join(dir, n)))}));
    const lib = files.find(f => /usflib$/i.test(f.name));
    const set0 = loadUSF([files.find(f => !/usflib$/i.test(f.name)), lib]);
    const game = gameOfSet(set0), loc = locateEAD(set0);
    assert.equal(loc.sequences.length, g.sequences, g.game);
    const {ram} = rdramOf(set0.state);
    const cached = loc.gen === "oot" ? findCachedSequences(ram, loc.sequences) : new Map();
    for (const t of g.tracks) {
      const f = files.find(x => x.name === t.file);
      if (!f) continue;
      const set = loadUSF([f, lib]);
      assert.equal(miniSequenceId(set, game.seqId), t.seq, t.file);
      const seq = loc.sequences[t.seq];
      const src = seq.rom != null && seq.coverage > 0 ? {img: set.rom, at: seq.rom} : {img: ram, at: cached.get(t.seq).ram};
      const bytes = src.img.read(src.at, seq.size), present = new Uint8Array(seq.size);
      for (let i = 0; i < seq.size; i++) present[i] = src.img.coverage(src.at + i, 1) ? 1 : 0;
      const res = parseSequence(bytes, {abi: game.abi, present, maxSeconds: 600});
      assert.equal(res.notes.length, t.notes, t.file);
      assert.equal(res.tempos[0].bpm, t.bpm, t.file);
      assert.equal(res.loop ? res.loop.tick : null, t.loopTick, t.file);
      assert.equal(res.endTick, t.endTick, t.file);
    }
  }
});

// ---- the console voice on the real Super Mario 64 set --------------------
// N64_USF_DIR may be the folder of sets (as above) or the SM64 set itself.
function sm64Dir() {
  if (!RIPS) return null;
  const g = FIXTURE.games.find(x => /nsme/i.test(x.usflib));
  for (const d of [RIPS, g && join(RIPS, g.dir), join(RIPS, "sm64"), join(RIPS, "super-mario-64")]) {
    if (d && existsSync(d) && readdirSync(d).some(n => /^nus-nsme-usa\.usflib$/i.test(n))) return d;
  }
  return null;
}
function sm64Song(dir, mini) {
  const libs = readdirSync(dir).filter(n => /\.usflib$/i.test(n)).map(n => ({name: n, bytes: new Uint8Array(readFileSync(join(dir, n)))}));
  const set = loadUSF([{name: mini, bytes: new Uint8Array(readFileSync(join(dir, mini)))}, ...libs]);
  const loc = locateEAD(set), game = gameOfSet(set);
  const id = miniSequenceId(set, game.seqId), seq = loc.sequences[id];
  const bytes = set.rom.read(seq.rom, seq.size), present = new Uint8Array(seq.size);
  for (let i = 0; i < seq.size; i++) present[i] = set.rom.coverage(seq.rom + i, 1) ? 1 : 0;
  const res = parseSequence(bytes, {abi: game.abi, present, maxSeconds: 600, stopAtLoop: true});
  return {set, loc, seq, res, id};
}
const SM64 = sm64Dir();
const TITLE = "02 Title Theme.miniusf", MAIN = "05 Main Theme.miniusf";

test("SM64 bank (real ROM): ctl/tbl located, the Title Theme's bank parses to the decomp's layout, every sample decodes, loop states are bit-exact", {skip: !SM64}, () => {
  const {set, loc, seq} = sm64Song(SM64, TITLE);
  const files = findAudioFiles(set.rom, loc);
  assert.deepEqual([files.ctl.at, files.ctl.count, files.tbl.at, files.tbl.count], [0x57B720, 38, 0x593560, 38]);
  assert.deepEqual(seq.banks, [17]);
  const bank = readBank(set.rom, files, 17);
  assert.deepEqual([bank.numInstruments, bank.numDrums, bank.instruments.filter(Boolean).length, bank.drums.filter(Boolean).length], [14, 64, 12, 64]);
  assert.deepEqual([bank.ctl.rom, bank.tbl.rom], [0x585BC0, 0x6B5B00]);
  const i0 = bank.instruments[0];
  assert.deepEqual([i0.normalRangeLo, i0.normalRangeHi, i0.releaseRate], [19, 19, 10]);
  assert.deepEqual(i0.envelope, [[2, 32700], [1, 32700], [32700, 29430], [-1, 0]]);
  assert.equal(i0.low.sample, i0.high.sample, "the same sample below and above the one-key normal range");
  assert.ok(Math.abs(bank.instruments[3].normal.tuning - 0.375) < 1e-6, "12000 Hz / 32000");
  assert.deepEqual(bank.instruments[7].envelope, [[2, 32700], [205, 19818], [535, 0], [-1, 0]]);
  assert.equal(bank.instrument(2), bank.instruments[1], "a missing slot falls back to the nearest lower instrument");
  // drums: one sample at semitone-spaced tunings (index 15 = 0.5, 26 = 1.0)
  assert.ok(Math.abs(bank.drums[15].sound.tuning - 0.5) < 1e-6 && Math.abs(bank.drums[26].sound.tuning - 1) < 1e-6);
  assert.equal(bank.drums[3].sound.sample, bank.drums[15].sound.sample);
  assert.ok(Math.abs(bank.drums[3].sound.tuning / bank.drums[15].sound.tuning - Math.pow(2, -1)) < 1e-3);
  // every referenced sample: decodes to loop.end samples, finite, loud; the
  // loop's stored state[16] equals the linear decode's frame at loop.start
  const recs = new Map();
  for (const i of bank.instruments) if (i) for (const so of [i.low, i.normal, i.high]) if (so) recs.set(so.sample.addr, so.sample);
  for (const d of bank.drums) if (d && d.sound) recs.set(d.sound.sample.addr, d.sound.sample);
  assert.equal(recs.size, 25);
  let looping = 0;
  for (const rec of recs.values()) {
    assert.deepEqual([rec.book.order, rec.book.npredictors], [2, 2]);
    assert.ok(rec.dataPresent > 0.97, "sample bytes in the rip: " + rec.dataPresent);
    const dec = bank.pcm(rec);
    assert.equal(dec.pcm.length, rec.loop.end);
    assert.ok(dec.pcm.length > 1000);
    let peak = 0; for (const v of dec.pcm) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > 0.3 && peak <= 1, "peak " + peak);
    if (rec.loop.count) {
      looping++;
      const fs = Math.floor(rec.loop.start / 16), out = new Int16Array(rec.frames * 16);
      decodeFrames(set.rom.read(rec.rom, rec.frames * 9), 0, rec.frames, expandBook(2, 2, rec.book.book), out, 0);
      assert.deepEqual([...out.subarray(fs * 16, fs * 16 + 16)], [...rec.loop.state], "sample " + rec.addr.toString(16));
      assert.ok(dec.looping && dec.loopStart === rec.loop.start && dec.loopEnd === rec.loop.end);
    }
  }
  assert.equal(looping, 5);
});

test("SM64 render (real ROM): the first 10 s of the Title Theme and the Main Theme sound on tracks named as the MIDI's, RMS in range", {skip: !SM64}, async () => {
  for (const mini of [TITLE, MAIN]) {
    const {set, seq, res} = sm64Song(SM64, mini);
    const groups = channelGroups(res);
    const r = await renderN64(res, {set, banks: seq.banks, keepSeconds: 10});
    assert.equal(r.sampleRate, 32000); assert.equal(r.seconds, 10);
    assert.deepEqual(r.warnings, [], mini);
    const early = groups.filter(g => g.notes.some(n => tickSeconds(res.tempos, n.tick) < 9.5)).map(g => g.name);
    assert.ok(early.length >= 6, mini + ": " + early.join(", "));
    for (const name of early) {
      const a = r[name];
      assert.ok(a instanceof Float32Array && a.length === 320000, mini + " " + name);
      let s = 0, peak = 0; for (let i = 0; i < a.length; i++) { s += a[i] * a[i]; peak = Math.max(peak, Math.abs(a[i])); }
      const rms = Math.sqrt(s / a.length);
      assert.ok(rms > 0.001 && rms < 0.4 && peak <= 1.5, mini + " " + name + " rms " + rms.toFixed(4) + " peak " + peak.toFixed(3));
    }
    for (const name of r.silent) assert.ok(!early.includes(name), mini + ": " + name + " has notes before 9.5 s but rendered silent");
    assert.deepEqual(Object.keys(r).filter(k => r[k] instanceof Float32Array).sort(), groups.map(g => g.name).filter(n => !r.silent.includes(n)).sort(), "every buffer is a MIDI track name");
  }
});

// The +21 question (INTEGRATION.md §4): autocorrelate isolated held notes
// in the rendered track and compare with 440·2^((semitone+21−69)/12).
function detectF0(buf, from, to, sr, fMin = 60, fMax = 2500) {
  const n = to - from, x = buf.subarray(from, to);
  if (n < sr / fMin * 2) return null;
  let mean = 0; for (let i = 0; i < n; i++) mean += x[i]; mean /= n;
  const minLag = Math.floor(sr / fMax), maxLag = Math.min(Math.floor(sr / fMin), n >> 1);
  let e0 = 0; for (let i = 0; i < n; i++) e0 += (x[i] - mean) * (x[i] - mean);
  if (e0 === 0) return null;
  const r = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) { let s = 0; for (let i = 0; i + lag < n; i++) s += (x[i] - mean) * (x[i + lag] - mean); r[lag] = s / e0 * n / (n - lag); }
  let best = -1, bestV = -Infinity;
  for (let lag = minLag + 1; lag <= maxLag; lag++) if (r[lag] > bestV) { bestV = r[lag]; best = lag; }
  if (best < 0 || bestV < 0.3) return null;
  let pick = best;
  for (let lag = minLag + 1; lag < best; lag++) if (r[lag] > 0.85 * bestV && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) { pick = lag; break; }
  const a = r[pick - 1], b = r[pick], c = r[pick + 1], den = a - 2 * b + c;
  return {hz: sr / (pick + (den ? 0.5 * (a - c) / den : 0)), corr: b, at: hz => r[Math.round(sr / hz)]};
}
function isolatedCents(res, r, name, keep, max = 6) {
  const g = channelGroups(res).find(x => x.name === name), sr = r.sampleRate, buf = r[name];
  const notes = g.notes.filter(n => tickSeconds(res.tempos, n.tick) < keep - 1).sort((a, b) => a.tick - b.tick);
  const rows = [];
  for (const n of notes) {
    if (rows.length >= max || n.dur < 24) continue;
    const t0 = tickSeconds(res.tempos, n.tick), t1 = tickSeconds(res.tempos, n.tick + n.dur);
    if (notes.some(m => m !== n && tickSeconds(res.tempos, m.tick) < t1 && tickSeconds(res.tempos, m.tick + m.dur) + 0.15 > t0)) continue;
    const det = detectF0(buf, Math.floor((t0 + 0.06) * sr), Math.floor(t1 * sr), sr);
    const want = 440 * Math.pow(2, (n.midi - 69) / 12);
    if (det) rows.push({midi: n.midi, want, hz: det.hz, cents: 1200 * Math.log2(det.hz / want), rAtF: det.at(want), rAtHalf: det.at(want / 2), rAt2f: det.at(want * 2)});
  }
  return rows;
}
test("SM64 pitch (real ROM): the Main Theme melody and the Title Theme's bass sound at semitone + 21; two Title instruments are an octave off it", {skip: !SM64}, async () => {
  const keep = 40;
  const main = sm64Song(SM64, MAIN), title = sm64Song(SM64, TITLE);
  const rm = await renderN64(main.res, {set: main.set, banks: main.seq.banks, keepSeconds: keep});
  const rt = await renderN64(title.res, {set: title.set, banks: title.seq.banks, keepSeconds: keep});
  const median = rows => rows.map(x => x.cents).sort((a, b) => a - b)[rows.length >> 1];
  // the melody (instrument 0 of bank 34, tuning 0.8409): within a few cents
  const melody = isolatedCents(main.res, rm, "ch 0 inst 0", keep);
  assert.ok(melody.length >= 1, "an isolated held melody note in 40 s");
  for (const x of melody) assert.ok(Math.abs(x.cents) < 100, "melody midi " + x.midi + ": " + x.hz.toFixed(1) + " Hz, " + x.cents.toFixed(0) + " c");
  assert.ok(Math.abs(median(melody)) < 25, "melody median " + median(melody).toFixed(0) + " c");
  // the Title Theme's bass (instrument 1 of bank 17, a looping sample, tuning 1.1237): within 10 c
  const bass = isolatedCents(title.res, rt, "ch 1 inst 1", keep).filter(x => x.rAtF > 0.5);
  assert.ok(bass.length >= 4, "bass notes: " + bass.length);
  assert.ok(Math.abs(median(bass)) < 25, "bass median " + median(bass).toFixed(0) + " c");
  // instrument 3 (tuning 0.375): no period at the written pitch, a clean one an octave below
  const i3 = isolatedCents(title.res, rt, "ch 3 inst 3", keep);
  assert.ok(i3.length >= 4);
  for (const x of i3) assert.ok(Math.abs(x.cents + 1200) < 60 && x.rAtHalf > 0.9 && x.rAtF < 0.5, "inst 3 midi " + x.midi + ": " + x.cents.toFixed(0) + " c, r@f " + x.rAtF.toFixed(2) + " r@f/2 " + x.rAtHalf.toFixed(2));
  // instrument 4 (tuning 0.9439): the waveform's period is the octave above's
  const i4 = isolatedCents(title.res, rt, "ch 4 inst 4", keep);
  assert.ok(i4.length >= 4);
  for (const x of i4) assert.ok(Math.abs(x.cents - 1200) < 60 && x.rAt2f > 0.9, "inst 4 midi " + x.midi + ": " + x.cents.toFixed(0) + " c, r@2f " + x.rAt2f.toFixed(2));
});
