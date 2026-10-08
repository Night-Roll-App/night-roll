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
import { findAudioFiles, readBank, readFont } from "../tools/n64/bank.mjs";
import { expandBook, decodeFrames } from "../tools/n64/vadpcm.mjs";
import { renderN64, Vibrato } from "../tools/n64/render.mjs";
import { channelGroups } from "../tools/n64/notes.mjs";
import { tickSeconds } from "../tools/n64/seq-libultra.mjs";
import { sequenceOfSet } from "../tools/n64/capture.mjs";
import { findMusicTable, findRareBankFile, readRareBank, miniOverrideWords, findFxParams } from "../tools/n64/rare.mjs";
import { toMidi, splitSlides } from "../tools/n64/notes.mjs";
import { soundingOffsets, applySoundingOffsets } from "../tools/sounding.mjs";
import { renderOneNote } from "../tools/note-preview.mjs";

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
    assert.ok(["sm64", "oot", "mm", "rare"].includes(g.abi));
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
    // B0/B1/B3/BB are the note filter and comb filter the renderer runs: B1 dropped the filter, BB's comb stands
    assert.ok(!res.stubbed.includes("channel oot 0xb0"), abi);
    assert.equal(res.notes[0].filter, null, abi);
    assert.deepEqual(res.notes[0].comb, {size: 1, gain: 0x60}, abi);
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
  const res = parseSequence(bytes, {abi: game.abi, present, maxSeconds: 600, stopAtLoop: true}); // variation 0: the game's, for these plain ids
  res.sequenceId = id; res.variation = 0;
  return {set, loc, seq, res, id};
}
const SM64 = sm64Dir();
const monoMix = p => { if (!p || !p.l) return p; const m = new Float32Array(p.l.length); for (let i = 0; i < m.length; i++) m[i] = p.l[i] + p.r[i]; return m; };
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
      const p = r[name];
      assert.ok(p && p.l instanceof Float32Array && p.r instanceof Float32Array && p.l.length === 320000 && p.r.length === 320000, mini + " " + name);
      const a = new Float32Array(p.l.length); for (let i = 0; i < a.length; i++) a[i] = p.l[i] + p.r[i];
      let s = 0, peak = 0; for (let i = 0; i < a.length; i++) { s += a[i] * a[i]; peak = Math.max(peak, Math.abs(a[i])); }
      const rms = Math.sqrt(s / a.length);
      assert.ok(rms > 0.001 && rms < 0.4 && peak <= 1.5, mini + " " + name + " rms " + rms.toFixed(4) + " peak " + peak.toFixed(3));
    }
    for (const name of r.silent) assert.ok(!early.includes(name), mini + ": " + name + " has notes before 9.5 s but rendered silent");
    assert.deepEqual(Object.keys(r).filter(k => r[k] && r[k].l instanceof Float32Array).sort(), groups.map(g => g.name).filter(n => !r.silent.includes(n)).sort(), "every buffer is a MIDI track name");
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
  const g = channelGroups(res).find(x => x.name === name), sr = r.sampleRate, buf = monoMix(r[name]);
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

// ---- the first listens (2026-09-27): Cave Dungeon's octave, Dire Docks' tails ----
// energy at one frequency (Goertzel), normalised by the window's energy
function toneEnergy(buf, from, to, sr, hz) {
  const w = 2 * Math.PI * hz / sr; let re = 0, im = 0, e = 0;
  for (let i = from; i < to; i++) { const v = buf[i]; re += v * Math.cos(w * i); im += v * Math.sin(w * i); e += v * v; }
  return e ? (re * re + im * im) / e : 0;
}
test("SM64 Cave Dungeon (real ROM): the intro instrument's recording sounds C3 at its 32 kHz tuning, so 'midi 60' renders C3 — the console's arithmetic, not a region or tuning slip", {skip: !SM64}, async () => {
  const CAVE = "14a Cave Dungeon.miniusf";
  const {set, loc, seq, res} = sm64Song(SM64, CAVE);
  assert.deepEqual(seq.banks, [21]);
  const bank = readBank(set.rom, findAudioFiles(set.rom, loc), 21);
  for (const id of [0, 6]) { // one key region each, tuning exactly 1.0, the same one-shot recording
    const i = bank.instrument(id);
    assert.deepEqual([i.normalRangeLo, i.normalRangeHi, i.low, i.high, i.normal.tuning], [0, 127, null, null, 1]);
    assert.equal(i.normal.sample, bank.instrument(0).normal.sample);
  }
  const rec = bank.instrument(0).normal.sample, pcm = bank.pcm(rec).pcm;
  assert.equal(pcm.length, 41952);
  // the recording itself, played 1:1 (freqScale 1.0 = semitone 39 = "C4"): fundamental at C3
  const c3 = toneEnergy(pcm, 2560, 15360, 32000, 130.81), c4 = toneEnergy(pcm, 2560, 15360, 32000, 261.63), c2 = toneEnergy(pcm, 2560, 15360, 32000, 65.41);
  assert.ok(c3 > 5 * c4 && c3 > 5 * c2, `sample energy C3 ${c3.toExponential(2)} C4 ${c4.toExponential(2)} C2 ${c2.toExponential(2)}`);
  // and the render of channel 0's first notes (written semitone 39/44/46/49 = midi 60/65/67/70, no transposition) lands an octave below midi
  const first = res.notes.filter(n => n.ch === 0).slice(0, 4);
  assert.deepEqual(first.map(n => n.midi), [60, 65, 67, 70]);
  assert.ok(first.every(n => n.rev === 0x1E && n.vol > 0.6), "channel 0: D4 0x1E reverb, DF 0x7F volume × DB");
  const r = await renderN64(res, {set, banks: seq.banks, keepSeconds: 3, reverb: null});
  const buf = monoMix(r["ch 0 inst 0"]), sr = r.sampleRate;
  for (const n of first) {
    const a = Math.floor((tickSeconds(res.tempos, n.tick) + 0.02) * sr), b = Math.floor((tickSeconds(res.tempos, n.tick + n.dur) + 0.08) * sr);
    const f = 440 * Math.pow(2, (n.midi - 69) / 12);
    const at = toneEnergy(buf, a, b, sr, f), below = toneEnergy(buf, a, b, sr, f / 2), above = toneEnergy(buf, a, b, sr, f * 2);
    assert.ok(below > 3 * at && below > 3 * above, `midi ${n.midi}: energy at f/2 ${below.toExponential(2)} f ${at.toExponential(2)} 2f ${above.toExponential(2)}`);
  }
  // the app's path stamps the sequence id, which picks the underground preset (level scripts: hmc/cotmc/sl/ssl/thi 0x0004)
  const viaApp = sequenceOfSet(set);
  assert.equal(viaApp.res.sequenceId, 12);
  // the reverb comes from the rip's RAM (gSynthesisReverb at 0x80220DB0): the ripper's one state, preset 0, for every song
  assert.deepEqual(viaApp.res.reverb, {at: 0x220DB0, useReverb: 8, gain: 0x2FFF, window: 0x0C00});
  assert.deepEqual((await renderN64(viaApp.res, {set, banks: seq.banks, keepSeconds: 1})).reverb, {window: 0x0C00, gain: 0x2FFF});
});

test("SM64 Dire, Dire Docks (real ROM): notes end by their own envelope (298 updates), no sustain op; the reverb (D4 0x32, water preset) is what carries the tail", {skip: !SM64}, async () => {
  const DDD = "09a Dire, Dire Docks.miniusf";
  const {set, loc, seq, res} = sm64Song(SM64, DDD);
  assert.deepEqual([seq.id, seq.banks, res.stubbed, res.variation], [5, [19], [], 0]); // DC (pan weight) became a fact with the stereo pass
  assert.equal(res.channels.length, 8, "the plain id (seqVariation 0) plays the full arrangement, not the harp + melody pair the old −1 default gave");
  const bank = readBank(set.rom, findAudioFiles(set.rom, loc), 19);
  assert.deepEqual(bank.instrument(15).envelope, [[3, 32700], [298, 0], [1, 0], [-1, 0]]);
  assert.equal(bank.instrument(15).releaseRate, 10);
  const n0 = res.notes.filter(n => n.ch === 15)[0];
  assert.deepEqual([n0.midi, n0.dur, n0.rev, n0.chEnv, n0.chRel, n0.lyAdsr], [43, 149, 0x32, null, null, null]);
  const dry = await renderN64(res, {set, banks: seq.banks, keepSeconds: 4, reverb: null});
  const wet = await renderN64(res, {set, banks: seq.banks, keepSeconds: 4});
  assert.deepEqual(wet.reverb, {window: 0x0C00, gain: 0x2FFF}, "read from the set's RAM when the result carries none");
  const sr = dry.sampleRate, t0 = tickSeconds(res.tempos, n0.tick);
  const rms = (a, s0, s1) => { let s = 0; for (let i = Math.floor(s0 * sr); i < Math.floor(s1 * sr); i++) s += a[i] * a[i]; return Math.sqrt(s / ((s1 - s0) * sr)); };
  const dryM = monoMix(dry["ch 15 inst 15"]), wetM = monoMix(wet["ch 15 inst 15"]);
  const peak = rms(dryM, t0, t0 + 0.3);
  const db = v => 20 * Math.log10(v / peak + 1e-12);
  // the envelope has run out 1.25 s after onset (301 updates at 240/s); the next note comes at +1.8 s
  const tailDry = db(rms(dryM, t0 + 1.55, t0 + 1.75)), tailWet = db(rms(wetM, t0 + 1.55, t0 + 1.75));
  assert.ok(tailDry < -60, "dry: silent once the envelope has run out: " + tailDry.toFixed(0) + " dB");
  assert.ok(tailWet > -60 && tailWet < -20, "wet: the 96 ms / ×0.375 comb still rings: " + tailWet.toFixed(0) + " dB");
});

test("SM64 Title Theme (real ROM): the plain id skips the ritardando intro and its extra channels, as the game does; the SEQ_VARIATION id plays it", {skip: !SM64}, () => {
  const {set, seq, res} = sm64Song(SM64, TITLE);
  const bytes = set.rom.read(seq.rom, seq.size);
  assert.deepEqual([...bytes.subarray(0x30, 0x36)], [0xFD, 0x01, 0x80, 0xF5, 0x00, 0x76], "delay 1; getvariation; bgez 0x76");
  const plain = sequenceOfSet(set).res;
  assert.deepEqual([plain.variation, plain.notes.length, plain.tempos.map(t => t.bpm), plain.loop.tick, plain.channels.length], [0, 3910, [172], 385, 9]);
  const varied = parseSequence(bytes, {abi: "sm64", variation: 0x80, maxSeconds: 600});
  assert.deepEqual([varied.notes.length, varied.tempos.map(t => t.bpm), varied.loop.tick, varied.channels.length], [4008, [172, 99, 90, 78, 119, 172], 769, 13]);
  assert.equal(res.notes.length, 3910, "sm64Song follows the game's default");
});

test("SM64 per-mini ducking (real set): the three Dire Docks and three Cave Dungeon minis share one save state; the mini's own overlay marks the voices the game had muted", {skip: !SM64}, () => {
  const libs = readdirSync(SM64).filter(n => /\.usflib$/i.test(n)).map(n => ({name: n, bytes: new Uint8Array(readFileSync(join(SM64, n)))}));
  const cap = m => sequenceOfSet(loadUSF([{name: m, bytes: new Uint8Array(readFileSync(join(SM64, m)))}, ...libs]));
  const a = cap("09a Dire, Dire Docks.miniusf"), b = cap("09b Dire, Dire Docks (in water).miniusf"), c = cap("09c Dire, Dire Docks (underwater cave).miniusf");
  for (const x of [a, b, c]) { assert.equal(x.id, 5); assert.equal(x.res.variation, 0); }
  // the state word is the same in all three: one `addiu a1, zero, 5`
  assert.deepEqual([a, b, c].map(x => x.game.seqId.kind), ["li-a1", "li-a1", "li-a1"]);
  assert.deepEqual(a.res.channels, [14, 15]); assert.equal(a.res.notes.length, 390);
  assert.deepEqual(a.res.ducked, [0, 1, 6, 9, 10, 11], "= sMusicDynamics[0] for SEQ_LEVEL_WATER, mask 0x0E43");
  assert.deepEqual(a.res.warnings.filter(w => /ducking/.test(w)), ["channels 0,1,6,9,10,11 silent in this area (game ducking)"]);
  assert.deepEqual(a.ducked.marked, [{bank: 19, inst: 0}, {bank: 19, inst: 1}, {bank: 19, inst: 6}, {bank: 19, inst: 10}, {bank: 19, inst: 11}, {bank: 19, drum: 15}, {bank: 19, drum: 17}]);
  assert.deepEqual(b.res.channels, [0, 1, 6, 14, 15]); assert.deepEqual(b.res.ducked, [9, 10, 11]); assert.equal(b.res.notes.length, 843);
  assert.deepEqual(c.res.channels, [0, 1, 6, 9, 10, 11, 14, 15]); assert.deepEqual(c.res.ducked, []); assert.equal(c.res.notes.length, 1963);
  const ca = cap("14a Cave Dungeon.miniusf"), cb = cap("14b Cave Dungeon (Hazy Maze).miniusf"), cc = cap("14c Cave Dungeon (both variations).miniusf");
  assert.deepEqual([ca.res.ducked, cb.res.ducked, cc.res.ducked], [[8], [3], []], "= UNDERGROUND dynamics 3 (0x0100) and 4 (0x0008), and none");
  assert.deepEqual([ca.res.notes.length, cb.res.notes.length, cc.res.notes.length], [2281, 2178, 2358]);
  for (const m of [TITLE, MAIN]) { const x = cap(m); assert.deepEqual(x.res.ducked, [], m); assert.ok(!(x.res.warnings || []).some(w => /ducking/.test(w))); }
  assert.equal(cap(TITLE).res.notes.length, 3910); assert.equal(cap(MAIN).res.notes.length, 1419);
});

// ---- GoldenEye 007 (Rare's engine, tools/n64/rare.mjs) -----------------------
// The rip is not in the repo: N64_GE_DIR (or the scratch folder the work was
// done in) holds NUS-NGEE-USA.usflib and the 58 minis; without it these skip.
// The numbers are what INTEGRATION.md §10 records from the rip and from
// lazyusf2's renders of it.
const GE = [process.env.N64_GE_DIR, "/tmp/claude-501/rips/n64-ge"].find(d => d && existsSync(join(d, "NUS-NGEE-USA.usflib")));
const geSet = m => { const libs = readdirSync(GE).filter(n => /\.usflib$/i.test(n)).map(n => ({name: n, bytes: new Uint8Array(readFileSync(join(GE, n)))})); return loadUSF([{name: m, bytes: new Uint8Array(readFileSync(join(GE, m)))}, ...libs]); };

// ---- Ocarina of Time / Majora's Mask: sound fonts and the console voice ---
// N64_USF_DIR/oot and /mm (or the set itself). The level anchors are
// lazyusf's renders of these minis (scratch/usf2wav: kode54's lazyusf for
// OoT, whose set stalls lazyusf2; lazyusf2 and it agree on MM to 0.1 dB),
// mix RMS per side in windows of the sequence's clock — truth time =
// t × 1.047 + offset, the emulator's audio-frame pacing (INTEGRATION.md §11).
function zeldaDir(tag) {
  if (!RIPS) return null;
  const g = FIXTURE.games.find(x => x.dir === tag);
  for (const d of [join(RIPS, tag), RIPS]) if (existsSync(d) && readdirSync(d).some(n => n.toLowerCase() === g.usflib.toLowerCase())) return d;
  return null;
}
const OOT = zeldaDir("oot"), MM = zeldaDir("mm");
function zeldaSet(dir, mini) {
  const lib = readdirSync(dir).find(n => /\.usflib$/i.test(n));
  return loadUSF([{name: mini, bytes: new Uint8Array(readFileSync(join(dir, mini)))}, {name: lib, bytes: new Uint8Array(readFileSync(join(dir, lib)))}]);
}
const sideDb = (a, sr, t0, t1) => { let s = 0, n = 0; for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) { s += a[i] * a[i]; n++; } return 10 * Math.log10(s / n + 1e-20); };

for (const [tag, dir, cases] of [
  ["OoT", OOT, [{mini: "06 Kokiri Forest.miniusf", font: 15, source: "ram"}, {mini: "35 Lost Woods.miniusf", font: 5, source: "rom"}]],
  ["MM", MM, [{mini: "108 Clock Town - Day 1.miniusf", font: 25, source: "rom"}, {mini: "134 Termina Field.miniusf", font: 3, source: "ram"}]]]) {
  test(`${tag} fonts (real rip): a font the game loaded while ripping reads from the ROM pages, a resident one relocated from RDRAM; every note's voice resolves`, {skip: !dir && `no ${tag} rip`}, () => {
    for (const c of cases) {
      const set = zeldaSet(dir, c.mini), {loc, seq, res} = sequenceOfSet(set);
      assert.equal(loc.gen, "oot"); assert.deepEqual(seq.banks, [c.font], c.mini);
      const font = readFont(set, loc, c.font);
      assert.equal(font.source, c.source, c.mini);
      for (const n of res.notes) {
        const v = n.drum ? font.drum(n.semitone) : font.instrument(n.inst);
        assert.ok(v, `${c.mini}: ${n.drum ? "drum " + n.semitone : "instrument " + n.inst}`);
        const snd = n.drum ? v.sound : font.sound(v, n.semitone);
        assert.ok(snd && snd.sample.codec === 0 && snd.sample.dataPresent > 0.99 && snd.sample.book.order > 0, c.mini + " sample");
      }
    }
  });
}

test("MM ocarina minis (real rip): the id word holds a pointer, not a sequence id — refused, not masked into sequence 0x14 (Pirates' Fortress)", {skip: !MM && "no MM rip"}, () => {
  for (const mini of ["127 Ocarina (Song of Time).miniusf", "212 Song of Frogs.miniusf"]) {
    assert.throws(() => sequenceOfSet(zeldaSet(MM, mini)), /plays no sequence: the game's word is 0x801f9d14/, mini);
  }
});

test("OoT/MM render (real rips): the RAM reverbs, tracks named as the MIDI's, and every side of every window within 1 dB of lazyusf's", {skip: !OOT && !MM && "no OoT/MM rip"}, async () => {
  const cases = [
    OOT && {dir: OOT, mini: "06 Kokiri Forest.miniusf", scale: 1.047, off: 0.025,
            reverbs: [[3072, 0x3000, 0, 0, false], [3072, 0x1800, 0, 0, true]],
            // truth L/R dB: the intro's fade (ch 4/10/11 under 0x0n delays), then the band
            windows: [[0.1, 1, -27.7, -22.4], [1, 2, -29.6, -24.9], [2, 3.2, -25.0, -20.2], [3.4, 5, -24.9, -24.4], [5, 9.9, null, null]]},
    MM && {dir: MM, mini: "108 Clock Town - Day 1.miniusf", scale: 1.050, off: 0.035,
           reverbs: [[3072, 0x3000, 0, 0, false], [5120, 0x5000, -0x3000, 0x3000, false]],
           windows: [[0.1, 4.3, -34.5, -34.8], [4.5, 8, -23.7, -23.5], [8, 9.9, null, null]]},
  ].filter(Boolean);
  for (const c of cases) {
    const set = zeldaSet(c.dir, c.mini), {seq, res} = sequenceOfSet(set);
    assert.deepEqual(res.reverbs.map(r => [r.window, r.decayRatio, r.leakRtl, r.leakLtr, !!r.filterLeft]), c.reverbs, c.mini);
    const r = await renderN64(res, {set, banks: seq.banks, keepSeconds: 10, meter: {tsNum: 4, tsDen: 4}});
    assert.deepEqual(r.warnings, [], c.mini);
    const names = Object.keys(r).filter(k => r[k] && r[k].l);
    assert.deepEqual(names, channelGroups(res, {tsNum: 4, tsDen: 4}).map(g => g.name).filter(n => !r.silent.includes(n)), c.mini);
    const L = new Float32Array(Math.ceil(r.seconds * r.sampleRate)), R = new Float32Array(L.length);
    for (const k of names) for (let i = 0; i < L.length; i++) { L[i] += r[k].l[i]; R[i] += r[k].r[i]; }
    for (const [t0, t1, tl, tr] of c.windows) {
      if (tl == null) { assert.ok(sideDb(L, r.sampleRate, t0, t1) > -40, c.mini + " sounds " + t0 + "-" + t1); continue; }
      const ol = sideDb(L, r.sampleRate, t0, t1), or = sideDb(R, r.sampleRate, t0, t1);
      assert.ok(Math.abs(ol - tl) < 1 && Math.abs(or - tr) < 1, `${c.mini} ${t0}-${t1}s: ours ${ol.toFixed(1)}/${or.toFixed(1)} dB, lazyusf ${tl}/${tr}`);
    }
  }
});

test("GoldenEye (real rip): no EAD tables; the RAM song table, the mini's word, 1172 + ALCSeq → Dam's notes, tempo, division and loop", {skip: !GE && "no GoldenEye rip"}, () => {
  const set = geSet("101 Dam.miniusf");
  assert.equal(gameOfSet(set).abi, "rare");
  assert.equal(locateEAD(set).gen, null);
  const {ram} = rdramOf(set.state);
  const table = findMusicTable(ram, set.rom);
  assert.equal(table.count, 63, "62 songs + the table's first entry (never read)");
  assert.equal(table.at, 0x2D1C14);
  assert.equal(table.entries[9].rom, 0x41EF48); assert.equal(table.entries[9].size, 5827); assert.equal(table.entries[9].packed, 3588);
  assert.ok(table.entries.slice(1).every(e => e.coverage === 1 && e.magic === true), "every song the ripper kept is whole and 1172-packed");
  assert.deepEqual(miniOverrideWords(set), [{addr: 0x603C, value: 9}], "the mini overrides exactly one RAM word: the song index");
  const out = sequenceOfSet(set);
  assert.equal(out.driver, "rare"); assert.equal(out.id, 9); assert.deepEqual(out.seq.banks, [0]); assert.equal(out.present.length, 3588);
  const res = out.res;
  assert.equal(res.driver, "rare"); assert.equal(res.division, 384); assert.equal(res.ticksPerBeat, 48);
  assert.deepEqual(res.tempos, [{tick: 0, bpm: 140}]);
  assert.equal(res.notes.length, 1729);
  assert.equal(res.channels.length, 15);
  assert.deepEqual(res.loop, {tick: 2688, at: 16320}, "56 quarters in, 340 quarters long: every track shares it");
  assert.equal(res.endTick, 16320);
  assert.ok(Math.abs(res.seconds - 145.71) < 0.01);
  assert.deepEqual(res.kits, [1, 8, 19, 39, 42, 45, 46, 47, 62], "the bank's single-key instruments");
  assert.ok(res.notes.filter(n => n.drum).length > 0 && res.notes.filter(n => n.drum).every(n => n.inst === 45 && n.ch === 4), "Dam plays one of them, program 45 on channel 4");
  assert.ok(toMidi(res, {tsNum: 4, tsDen: 4}).length > 10000);
  // pitch bends: Dam's channel 10 rides the wheel (140 events); every slid note is on it
  const slid = res.notes.filter(n => n.slide);
  assert.equal(slid.length, 24);
  assert.ok(slid.every(n => n.ch === 10 && n.slide.every(s => s.t > 0 && s.t < n.dur && Math.abs(s.to) <= 4.01)), "within the note, within twice the 200-cent range (relative to the note-on wheel)");
  assert.match(res.warnings.join(" "), /24 notes carry pitch bends/);
  assert.equal(res.notes.filter(n => n.gain).length, 4, "cc7 moves under four held notes");
  assert.match(res.warnings.join(" "), /4 notes change volume while held/);
  assert.ok(splitSlides(res.notes).length > res.notes.length, "the roll gets the landed pitches");
  // Facility and Runway: other ids, same shape
  const fac = sequenceOfSet(geSet("102 Facility.miniusf")).res, run = sequenceOfSet(geSet("103 Runway.miniusf")).res;
  assert.deepEqual([fac.sequenceId, fac.notes.length, fac.tempos[0].bpm, fac.loop], [7, 1400, 120, {tick: 0, at: 11520}]);
  assert.deepEqual([run.sequenceId, run.notes.length, run.tempos[0].bpm, run.loop], [50, 3568, 125, {tick: 1152, at: 15552}]);
  // Bunker 1 overrides nothing: its index is the lib's own word, read through the manifest address
  assert.deepEqual(miniOverrideWords(geSet("105 Bunker 1.miniusf")), []);
  assert.equal(sequenceOfSet(geSet("105 Bunker 1.miniusf")).id, 15);
});

test("GoldenEye (real rip): every mini parses; the bank in RAM reads through its pointers", {skip: !GE && "no GoldenEye rip"}, () => {
  const rows = [];
  for (const m of readdirSync(GE).filter(n => /\.miniusf$/i.test(n)).sort()) {
    const {id, res} = sequenceOfSet(geSet(m));
    rows.push([m, id, res.notes.length]);
    assert.ok(res.notes.length > 0, m);
    assert.equal(res.division, 384, m);
  }
  assert.equal(rows.length, 58, "the set: 101–120, 201–220 without 204, 301–319");
  assert.equal(new Set(rows.map(r => r[1])).size, 58, "58 different songs");
  const set = geSet("101 Dam.miniusf"), {ram} = rdramOf(set.state);
  const files = findRareBankFile(ram);
  assert.equal(files.length, 1);
  assert.deepEqual(files[0].banks, [{at: 0x2D1AB8, instCount: 75, sampleRate: 22050}]);
  const bank = readRareBank(ram, set.rom, files[0].banks[0].at);
  assert.equal(bank.instruments.filter(i => i).length, 75);
  assert.ok(bank.instruments.every(i => i.bendRange === 200 || i.bendRange === 1200));
  const i58 = bank.instrument(58);
  assert.ok(i58.sounds.length >= 2 && i58.sounds.every(s => s && s.keymap && s.wave && s.envelope));
  assert.ok(i58.sounds.every(s => s.envelope.attackTime === null), "attackTime is never in the rip");
  assert.ok(i58.sounds.every(s => s.wave.base >= 0x3B8000 && s.wave.base < 0x41A000), "wavetable bases are absolute ROM addresses in the sample region");
  assert.ok(bank.pcm(i58.sounds[0].wave).pcm.length > 100);
  // the effect block the game gave alSynNew: six all-pass sections over 6400 samples, found by shape
  const fx = findFxParams(ram);
  assert.equal(fx.at, 0x23100); assert.equal(fx.sections, 6); assert.equal(fx.length, 6400);
  assert.deepEqual(fx.delays.map(d => [d.input, d.output, d.fbcoef, d.gain, d.lpfilter]), [[0, 160, 9830, 0, 0], [160, 320, 9830, 11140, 0x2500], [800, 2560, 16384, 4587, 0x3000], [3200, 5600, 16384, 4587, 0x3500], [3360, 4800, 8192, 0, 0x4000], [0, 5920, 13000, 0, 0x4500]]);
  assert.ok(fx.delays.every(d => d.ffcoef === -d.fbcoef), "every section is an all-pass");
});

test("GoldenEye (real rip): Dam's onsets fit lazyusf2's render at time scale 1 and no other", {skip: !GE && "no GoldenEye rip"}, async () => {
  // the truth WAV is scratch/usf2wav's output (scratch/ge-render.mjs writes it); without it this only renders
  const wav = ["/tmp/claude-501/ge/truth-101_Dam-45s.wav", "/tmp/claude-501/ge/truth-101_Dam-60s.wav"].find(f => existsSync(f));
  const set = geSet("101 Dam.miniusf"), {seq, res} = sequenceOfSet(set);
  const r = await renderN64(res, {set, banks: seq.banks, sampleRate: 22050, keepSeconds: 20, meter: {tsNum: 4, tsDen: 4}});
  assert.equal(r.bankRate, 22050);
  assert.deepEqual(r.reverb, {at: 0x23100, sections: 6, length: 6400});
  const tracks = Object.keys(r).filter(k => r[k] && r[k].l instanceof Float32Array && r[k].r instanceof Float32Array && r[k].l.length === r[k].r.length);
  assert.ok(tracks.length >= 8, "stereo tracks sounded in the first 20 s");
  // Dam's channel 13 sets cc10 40 (left of centre); its track leans left, a centred track does not
  const rms = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); };
  const ch13 = tracks.find(k => k.startsWith("ch 13 "));
  assert.equal(r.pans[ch13].cc10, 40);
  assert.ok(rms(r[ch13].l) > 1.5 * rms(r[ch13].r), "cc10 40 leans left");
  const ch8 = tracks.find(k => k.startsWith("ch 8 "));
  assert.equal(r.pans[ch8].cc10, 64);
  assert.ok(Math.abs(rms(r[ch8].l) / rms(r[ch8].r) - 1) < 0.05, "centred");
  assert.ok(!r.warnings.some(w => /not in the bank|no sound/.test(w)), r.warnings.join("; "));
  if (!wav) return;
  const b = readFileSync(wav), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const rate = dv.getUint32(24, true), ch = dv.getUint16(22, true), n = (b.length - 44) / (2 * ch), mono = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += dv.getInt16(44 + (i * ch + c) * 2, true); mono[i] = s / (ch * 32768); }
  // onset strength: rises of the frame energy and of the high-passed energy (dB), 10 ms frames, 3-tap smoothed
  const hop = Math.round(rate / 100), frames = Math.floor(n / hop), raw = new Float32Array(frames);
  let pe = -90, ph = -90;
  for (let f = 0; f < frames; f++) {
    let e = 0, h = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) { e += mono[i] * mono[i]; const d = mono[i] - (i ? mono[i - 1] : 0); h += d * d; }
    const de = 10 * Math.log10(e / hop + 1e-9), dh = 10 * Math.log10(h / hop + 1e-9);
    raw[f] = Math.max(0, de - pe) + Math.max(0, dh - ph); pe = de; ph = dh;
  }
  const smooth = a => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = ((a[i - 1] || 0) + 2 * a[i] + (a[i + 1] || 0)) / 4; return o; };
  const flux = smooth(raw);
  const fit = scale => {
    const tr0 = new Float32Array(frames);
    for (const x of res.notes) { const f = Math.round(tickSeconds(res.tempos, x.tick) * scale * rate / hop); if (f < frames) tr0[f] += x.vel / 127; }
    const tr = smooth(tr0);
    let best = -1;
    for (let lag = -20; lag <= 100; lag++) { let k = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; for (let i = Math.max(0, lag); i < frames && i - lag < frames; i++) { const a = flux[i], c = tr[i - lag]; k++; sa += a; sb += c; saa += a * a; sbb += c * c; sab += a * c; } const cov = sab / k - (sa / k) * (sb / k), va = saa / k - (sa / k) ** 2, vb = sbb / k - (sb / k) ** 2; const rr = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0; if (rr > best) best = rr; }
    return best;
  };
  const r1 = fit(1), r95 = fit(0.95), r105 = fit(1.05);
  assert.ok(r1 > 0.4, "fit at scale 1: " + r1.toFixed(3));
  assert.ok(r1 > 4 * Math.max(r95, r105), `scale 1 ${r1.toFixed(3)} vs 0.95 ${r95.toFixed(3)} / 1.05 ${r105.toFixed(3)}`);
});

test("SM64 level steps and vibrato (real set): the facts the sequences carry, and what they come to in the render", {skip: !SM64}, async () => {
  const libs = readdirSync(SM64).filter(n => /\.usflib$/i.test(n)).map(n => ({name: n, bytes: new Uint8Array(readFileSync(join(SM64, n)))}));
  const cap = m => sequenceOfSet(loadUSF([{name: m, bytes: new Uint8Array(readFileSync(join(SM64, m)))}, ...libs]));
  // Snow Mountain: DA steps (seq_changevol, fadeVolume += s8/127) fade the held notes of channels 1/2 down in 1/127 steps
  const snow = cap("11 Snow Mountain.miniusf").res;
  const stepped = snow.notes.filter(n => n.gain);
  assert.equal(stepped.length, 234); assert.deepEqual([...new Set(stepped.map(n => n.ch))].sort(), [1, 2]);
  const n0 = stepped.find(n => n.ch === 1 && n.dur >= 48);
  assert.ok(n0.gain.length >= 3 && n0.gain[0].t === 0 && Math.abs(n0.gain[0].l - n0.vol) < 1e-9, "the first breakpoint is the note-on level");
  assert.ok(n0.gain.every((g, i) => i === 0 || g.l < n0.gain[i - 1].l), "and the steps go down: " + JSON.stringify(n0.gain.map(g => +g.l.toFixed(3))));
  assert.deepEqual(cap("02 Title Theme.miniusf").res.notes.filter(n => n.gain || n.vib).length, 0, "the Title Theme has neither");
  // Cave Dungeon: D8 on channels 2 and 5 → vibrato facts (extent 8 = D8 1, rate 0x800 = the channel default, no delay)
  const cave = cap("14a Cave Dungeon.miniusf").res;
  const vib = cave.notes.filter(n => n.vib);
  assert.equal(vib.length, 9); assert.deepEqual([...new Set(vib.map(n => n.ch))].sort(), [2, 5]);
  assert.deepEqual(vib[0].vib, {rateStart: 0x800, rateTarget: 0x800, rateDelay: 0, extStart: 0, extTarget: 8, extDelay: 0, delay: 0});
  assert.ok(vib.some(n => n.vibChanges && n.vibChanges.length), "a D8 lands under a held note and is carried as a change");
  assert.equal(cave.stubbed.length, 0, "D7/D8/E1/E2/E3 and DC are facts now");
  // what D8 1 comes to: 1 + 8/4096 × (2^(±120/127) − 1) = +3.1 cents at the peak, −1.6 at the trough, one cycle per 32 updates (7.5 Hz)
  const v = new Vibrato(vib[0].vib); const cyc = []; for (let i = 0; i < 32; i++) cyc.push(v.update());
  assert.ok(Math.abs(1200 * Math.log2(Math.max(...cyc)) - 3.13) < 0.05 && Math.abs(1200 * Math.log2(Math.min(...cyc)) + 1.63) < 0.05, "+3.1 / −1.6 cents: " + Math.max(...cyc) + " " + Math.min(...cyc));
  // portamento (layer C7): no Super Mario 64 sequence uses it — every note's porta is null, no note is split for a glide
  const all = readdirSync(SM64).filter(n => /\.miniusf$/i.test(n)).map(m => cap(m).res);
  assert.equal(all.reduce((k, r) => k + r.notes.filter(n => n.porta || n.slide).length, 0), 0);
  assert.ok(all.every(r => !r.stubbed.includes("layer portamento C7")));
});

// ---- Rare's other games (rare.mjs): the same SDK formats, kept differently ------
// Rips not in the repo: N64_BK_DIR / N64_DK64_DIR / N64_DKR_DIR / N64_JFG_DIR, or the
// scratch folders the work was done in; without them these skip. The numbers are
// INTEGRATION.md §10's, from the rips and from lazyusf2's renders of them.
const rareDir = (env, dir, lib) => [process.env[env], "/tmp/claude-501/rips/" + dir].find(d => d && existsSync(join(d, lib)));
const BK = rareDir("N64_BK_DIR", "n64-banjo-kazooie", "NUS-NBKE-USA.usflib"), DK64 = rareDir("N64_DK64_DIR", "n64-donkey-kong-64", "NUS-NDOP-USA.usflib");
const DKR = rareDir("N64_DKR_DIR", "n64-diddy-kong-racing", "NUS-NDYE-USA.usflib"), JFG = rareDir("N64_JFG_DIR", "n64-jet-force-gemini", "NUS-NJFE-USA.usflib");
const rareSet = (dir, m) => loadUSF([{name: m, bytes: new Uint8Array(readFileSync(join(dir, m)))}, ...readdirSync(dir).filter(n => /\.usflib$/i.test(n)).map(n => ({name: n, bytes: new Uint8Array(readFileSync(join(dir, n)))}))]);
const rareRenderSmoke = async (set, seq, res) => {
  const r = await renderN64(res, {set, banks: seq.banks, sampleRate: 22050, keepSeconds: 5, meter: {tsNum: 4, tsDen: 4}});
  assert.equal(r.bankRate, 22050);
  const tracks = Object.keys(r).filter(k => r[k] && r[k].l instanceof Float32Array);
  assert.ok(tracks.length >= 3, "tracks sound in the first 5 s");
  let peak = 0; for (const k of tracks) for (const v of r[k].l) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak > 0.01, "not silent");
  return r;
};

test("Banjo-Kazooie (real rip): sized 1172 assets found through the asset directory; the li-a1 patch picks the song; the FE-in-a-loop-end song reads", {skip: !BK && "no Banjo-Kazooie rip"}, async () => {
  const set = rareSet(BK, "002 Main Title.miniusf");
  assert.equal(locateEAD(set).gen, null);
  const out = sequenceOfSet(set), res = out.res;
  assert.equal(out.driver, "rare");
  assert.deepEqual([out.id, out.loc.table.kind, out.loc.table.count], [8, "asset", 173]);
  assert.deepEqual([res.notes.length, res.tempos[0].bpm, res.division], [1588, 150, 384]);
  await rareRenderSmoke(set, out.seq, res);
  // Click Clock Wood Spring: a loop end reaching back 0x1FE bytes (its FE is a byte, not a back-reference)
  const ccw = sequenceOfSet(rareSet(BK, "060a Click Clock Wood (Spring All-In-One).miniusf"));
  assert.deepEqual([ccw.id, ccw.res.notes.length, ccw.res.loop], [95, 4376, {tick: 960, at: 12672}]);
  // the beta overrides nothing: the lib's own li-a1 at the manifest's address
  assert.equal(sequenceOfSet(rareSet(BK, "086 Click Clock Wood (Unused Beta Version 2).miniusf")).id, 73);
  // Normal/Aquatic differ from All-In-One only in a code word the roll does not use: said, not guessed at
  const sm = sequenceOfSet(rareSet(BK, "006b Spiral Mountain (Normal).miniusf"));
  assert.equal(sm.id, 16);
  assert.match(sm.res.warnings.join(" "), /also sets 1 memory word the roll does not use \(0x25dae8 = 0x240f6fff\)/);
  assert.throws(() => sequenceOfSet(rareSet(BK, "167 SFX Rare & Nintendo Logo (without Music).miniusf")), /song 14 of the game's 173 is not in this rip/);
});

test("Donkey Kong 64 (real rip): no song table — the song unpacked in RAM, its tracks walked (the header words are absent or another song's); the mini's own chunks pick the slot", {skip: !DK64 && "no Donkey Kong 64 rip"}, async () => {
  const set = rareSet(DK64, "002 DK Rap.miniusf"), out = sequenceOfSet(set);
  assert.deepEqual([out.id, out.seq.ram, out.loc.table.kind], [null, 0x7DF800, "mini"]);
  assert.deepEqual([out.res.notes.length, out.res.tempos[0].bpm, out.res.division, out.res.channels.length], [1856, 123.75, 384, 14]);
  assert.ok(out.seq.coverage < 1, "some header words are not in the rip");
  await rareRenderSmoke(set, out.seq, out.res);
  const boss = sequenceOfSet(rareSet(DK64, "s38 Mini-Boss.miniusf"));
  assert.deepEqual([boss.seq.ram, boss.res.notes.length, boss.res.tempos[0].bpm], [0x7E4FE0, 2234, 195]);
  const logo = sequenceOfSet(rareSet(DK64, "001 Logo.miniusf"));
  assert.deepEqual([logo.seq.ram, logo.res.notes.length], [0x7DF800, 436]);
  assert.match(logo.res.warnings.join(" "), /writes none of the 4 songs/);
});

test("Diddy Kong Racing (real rip): the SDK 'S1' sequence file in RAM, plain ALCSeq songs in ROM, the song in a0", {skip: !DKR && "no Diddy Kong Racing rip"}, async () => {
  const set = rareSet(DKR, "02 Title Theme.miniusf"), out = sequenceOfSet(set);
  assert.deepEqual([out.id, out.loc.table.kind, out.loc.table.at, out.loc.table.count], [7, "S1", 0x1C4460, 66]);
  assert.deepEqual([out.res.notes.length, out.res.tempos[0].bpm], [2881, 182]);
  await rareRenderSmoke(set, out.seq, out.res);
  assert.equal(sequenceOfSet(rareSet(DKR, "12a Pirate Lagoon, Treasure Caves.miniusf")).id, 65, "sets nothing: the lib's a0, by the manifest");
  const ready = sequenceOfSet(rareSet(DKR, "05 Get Ready.miniusf"));
  assert.deepEqual([ready.id, ready.res.notes.length], [30, 20]);
  assert.match(ready.res.warnings.join(" "), /48 of the song's 232 bytes are not in the rip/);
});

test("Jet Force Gemini (real rip): the song unpacked in RAM, as Donkey Kong 64's", {skip: !JFG && "no Jet Force Gemini rip"}, async () => {
  const set = rareSet(JFG, "02 Main Theme.miniusf"), out = sequenceOfSet(set);
  assert.deepEqual([out.seq.ram, out.res.notes.length, out.res.tempos[0].bpm], [0xB0B50, 2524, 125]);
  await rareRenderSmoke(set, out.seq, out.res);
});

// ---- sounding-pitch offsets (2026-09-28, tools/sounding.mjs): the roll
// shows the note the composer typed; some instruments' samples were
// recorded an octave (or two) away, so the console sounds a different
// pitch than the roll — INTEGRATION.md §9.3/§9.6/§10.6. Ground truth
// measured against these rips: Cave Dungeon ch 0/6/7 (bank 21 inst 0/6/7)
// sound an octave BELOW written, Title Theme inst 3 an octave below and
// inst 4 an octave above, Main Theme's melody (inst 0) and Dire Dire Docks
// are correct. soundingOffsets agrees with all of these except Cave
// Dungeon ch 7 — measured, at correlation 0.98, as NOT shifted (its sample
// differs from ch 0/6's: a different recording, tuning 0.281 not 1.0);
// INTEGRATION.md's own text only computed the fundamental for inst 0/6, so
// this is reported rather than forced (Josh's call: an ear check settles it).
async function measureSm64(mini) {
  const {set, seq, res} = sm64Song(SM64, mini);
  const groups = channelGroups(res, {tsNum: 4, tsDen: 4});
  const renderFn = (one, o) => renderN64(one, {set, banks: seq.banks, sampleRate: o.sampleRate, onProgress: o.onProgress, keepSeconds: o.seconds, meter: {tsNum: 4, tsDen: 4}});
  return soundingOffsets(groups, (g, key) => renderOneNote({channelGroups}, "usf", res, g.name, renderFn, {key, vel: 100, ticks: 100000, seconds: 1, sampleRate: 32000}), {sampleRate: 32000});
}
test("sounding offsets (real ROM): Cave Dungeon ch 0/6 an octave below written; ch 7 measures unshifted (disagrees with the summary — see comment above)", {skip: !SM64}, async () => {
  const offsets = await measureSm64("14a Cave Dungeon.miniusf");
  assert.equal(offsets["ch 0 inst 0"].offset, -12);
  assert.equal(offsets["ch 6 inst 6"].offset, -12);
  assert.equal(offsets["ch 7 inst 7"].offset, 0, "measured, not asserted as a bug — see the comment above this test");
});
test("sounding offsets (real ROM): Title Theme inst 3 an octave below written, inst 4 an octave above", {skip: !SM64}, async () => {
  const offsets = await measureSm64(TITLE);
  assert.equal(offsets["ch 3 inst 3"].offset, -12);
  assert.equal(offsets["ch 4 inst 4"].offset, 12);
});
test("sounding offsets (real ROM): Main Theme's melody (inst 0) is correct — offset 0", {skip: !SM64}, async () => {
  const offsets = await measureSm64(MAIN);
  assert.equal(offsets["ch 0 inst 0"].offset, 0);
});
test("sounding offsets (real ROM): Dire Dire Docks (09a) is correct on both its channels — offset 0", {skip: !SM64}, async () => {
  const offsets = await measureSm64("09a Dire, Dire Docks.miniusf");
  assert.equal(offsets["ch 14 inst 14"].offset, 0);
  assert.equal(offsets["ch 15 inst 15"].offset, 0);
});
test("applySoundingOffsets + toMidi (real ROM): Title Theme's shifted tracks carry the offset meta, and it round-trips through parseMidi's convention", {skip: !SM64}, async () => {
  const {set, seq, res} = sm64Song(SM64, TITLE);
  const groups = channelGroups(res, {tsNum: 4, tsDen: 4});
  const before3 = groups.find(g => g.name === "ch 3 inst 3").notes[0].midi;
  const offsets = await measureSm64(TITLE);
  const warnings = applySoundingOffsets(groups, offsets, "midi");
  assert.ok(warnings.some(w => /^ch 3 inst 3: written an octave above what sounds.*\(-12\)$/.test(w)), warnings.join("\n"));
  assert.ok(warnings.some(w => /^ch 4 inst 4: written an octave below what sounds.*\(\+12\)$/.test(w)), warnings.join("\n"));
  const after3 = groups.find(g => g.name === "ch 3 inst 3").notes[0].midi;
  assert.equal(after3, before3 - 12); // applySoundingOffsets mutated res.notes in place, through the shared group references
  const bytes = toMidi(res, {tsNum: 4, tsDen: 4, offsets});
  assert.ok(bytes.length > 100);
});

// Donkey Kong 64's Logo (Josh, 2026-10-07: "the drums are coming out as notes and they sound awful"):
// its hand-drum parts (inst 2, inst 3) are one-shot samples the synth held as tones. The capture keeps
// every note where it was and carries each sample's fade; the kits and the notes are what they were.
const DK64_ARCHIVE = [process.env.N64_USF_DIR && join(process.env.N64_USF_DIR, "donkey-kong-64"), "/tmp/recap/rips/n64/donkey-kong-64"]
  .find(d => d && existsSync(join(d, "logo.usf")) && existsSync(join(d, "nus-ndop-usa.usflib")));
test("DK64 Logo (real rip): one-shot drum samples fade inside their notes; pitches, lengths and kits unchanged", {skip: !DK64_ARCHIVE}, () => {
  const set = loadUSF(["logo.usf", "nus-ndop-usa.usflib"].map(n => ({name: n, bytes: new Uint8Array(readFileSync(join(DK64_ARCHIVE, n)))})));
  const {res} = sequenceOfSet(set);
  const part = (ch, inst) => res.notes.filter(n => n.ch === ch && n.inst === inst);
  const congas = part(1, 2), bongoA = part(3, 3), bongoB = part(4, 3);
  assert.deepEqual([congas.length, bongoA.length, bongoB.length], [100, 20, 20]);
  assert.deepEqual([...new Set(congas.map(n => n.midi))].sort(), [60, 65], "the written pitches stay");
  assert.ok([...congas, ...bongoA, ...bongoB].every(n => n.env && n.env.length), "every hit carries its sample's fade");
  // inst 3: one 0.48 s hit, keyBase 66 — key 60 plays it at 2^(−6/12) (0.68 s), key 55 at 2^(−11/12) (0.91 s);
  // each two-beat note falls silent where the sample ends at its own pitch, not at the note-off
  const tps = 48 * res.tempos[0].bpm / 60;
  for (const n of bongoA) {
    const end = 0.48 / Math.pow(2, (n.key - 66) / 12) * tps;
    assert.ok(n.dur === 96 && n.env.at(-1).r === 0 && Math.abs(n.env.at(-1).t - end) <= 3, `key ${n.key}: silent at ${n.env.at(-1).t} ticks, the sample ends at ${end.toFixed(1)}`);
  }
  assert.ok(res.notes.filter(n => n.drum).every(n => !n.env), "kit hits are the drum lane's");
  assert.ok(toMidi(res).length > 1000);
});
