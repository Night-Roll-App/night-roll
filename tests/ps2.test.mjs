// End-to-end test of the PS2 milestone-1 pipeline against synthetic files
// (tools/ps2/make-test-sq.mjs — our own bytes): PSF2 container round trip
// (nested directories, lib merge, psf2.ini song-picking), SQ parse ->
// notes (reusing tools/psx/notes.mjs's seqNotes/toNotesTxt/makeMidi
// unmodified), HD/BD -> a VAB-shaped bank (reusing tools/psx/vab.mjs's
// tonesFor/vagPcm), and the dump CLI.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeTestSQ, makeTestHD, makePSF2, buildPSF2Fs, fileNode, dirNode,
  TEST_SQ_NOTES, TEST_SQ_END,
} from "../tools/ps2/make-test-sq.mjs";
import { isPSF2, parsePSF2, listPSF2, readPSF2File, loadPSF2Chain, mergePSF2, findPSF2 } from "../tools/ps2/psf2.mjs";
import { isSQ, parseSQ } from "../tools/ps2/sq.mjs";
import { parseHD, toBank, isHD } from "../tools/ps2/hd.mjs";
import { ps2Song } from "../tools/ps2/capture.mjs";
import { seqNotes, toNotesTxt, makeMidi } from "../tools/psx/notes.mjs";
import { bpmOf, secondsAt } from "../tools/psx/seq.mjs";
import { pitchName } from "../tools/nsf/notes.mjs";
import { renderSpu } from "../tools/psx/spu-render.mjs";
import { estimateRoot, tonesFor } from "../tools/psx/vab.mjs";

test("PSF2 container: header, nested directories, per-block zlib, [TAG]", async () => {
  const inner = new TextEncoder().encode("hello psf2 filesystem");
  const tree = [
    dirNode("music", [dirNode("data", [fileNode("SONG001.DAT", inner)])]),
    fileNode("README.TXT", new TextEncoder().encode("not a song")),
  ];
  const reserved = buildPSF2Fs(tree);
  const bytes = makePSF2(reserved, {game: "Test Game", _lib: "test.psf2lib"});
  assert.ok(isPSF2(bytes));
  const psf = parsePSF2(bytes);
  assert.equal(psf.version, 2);
  assert.equal(psf.programSize, 0, "PSF2's program is always empty; the payload is the reserved-area filesystem");
  assert.equal(psf.crcOk, true);
  assert.deepEqual(psf.tags, {game: "Test Game", _lib: "test.psf2lib"});
  assert.deepEqual(psf.libs, ["test.psf2lib"]);
  const files = listPSF2(psf.reserved);
  assert.deepEqual(files.map(f => f.path).sort(), ["/README.TXT", "/music/data/SONG001.DAT"]);
  const song = files.find(f => f.path === "/music/data/SONG001.DAT");
  const decoded = await readPSF2File(psf.reserved, song);
  assert.deepEqual(decoded, inner);
});

test("PSF2: not a PSF2 file at all (a GENH/SS2-style stream dump) is reported false, not thrown", () => {
  const genh = new TextEncoder().encode("GENH\x02\x00\x00\x00");
  assert.equal(isPSF2(genh), false);
});

test("minipsf2 -> psf2lib chain: the lib's files merge with the mini's; mini shadows on a name collision", async () => {
  const libTree = [fileNode("SHARED.BIN", new Uint8Array([1, 2, 3])), fileNode("ONLY_IN_LIB.BIN", new Uint8Array([9]))];
  const lib = makePSF2(buildPSF2Fs(libTree), {game: "lib"});
  const miniTree = [fileNode("SHARED.BIN", new Uint8Array([4, 5, 6])), fileNode("ONLY_IN_MINI.BIN", new Uint8Array([7]))];
  const mini = makePSF2(buildPSF2Fs(miniTree), {_lib: "shared.psf2lib"});
  const asked = [];
  const sources = await loadPSF2Chain(mini, name => { asked.push(name); return name === "shared.psf2lib" ? lib : null; }, {name: "tune.minipsf2"});
  assert.deepEqual(asked, ["shared.psf2lib"]);
  assert.deepEqual(sources.map(s => s.name), ["shared.psf2lib", "tune.minipsf2"], "load order: lib first, mini overlays");
  const merged = mergePSF2(sources);
  assert.deepEqual([...merged.keys()].sort(), ["/only_in_lib.bin", "/only_in_mini.bin", "/shared.bin"]);
  const shared = findPSF2(merged, "SHARED.BIN");
  const bytes = await readPSF2File(shared.source.psf.reserved, shared);
  assert.deepEqual(bytes, new Uint8Array([4, 5, 6]), "the mini's own SHARED.BIN shadows the lib's");
  // a missing lib is a named error, not a crash
  await assert.rejects(loadPSF2Chain(mini, () => null, {name: "tune.minipsf2"}), /missing library shared\.psf2lib/);
});

test("SQ header + score: chunk chain, tempo, loop, running status, the last-data-byte skip-delta trick", () => {
  const bytes = makeTestSQ();
  assert.ok(isSQ(bytes));
  const seq = parseSQ(bytes);
  assert.equal(seq.ppq, 480);
  assert.equal(bpmOf(seq.tempo), 120);
  assert.equal(seq.endTick, TEST_SQ_END);
  assert.deepEqual(seq.loop, {start: 0, end: TEST_SQ_END, count: 127}, "cc99 0/1 -> loop start/end; cc38 0 -> 127 (PS1's 'forever' sentinel)");
  assert.deepEqual(seq.warnings, ["no time-signature meta in SQ: 4/4 assumed"], "clean parse: no unknown-opcode or truncation warnings");
  const notes = seq.events.filter(e => e.type === "on" || e.type === "off");
  // the chord at tick 960 (keys 67 and 72) is encoded with the skip-delta
  // trick: the second note-on has NO delta byte in the file at all
  assert.deepEqual(notes.filter(e => e.tick === 960 && e.type === "on").map(e => e.key), [67, 72]);
  assert.deepEqual(notes.map(e => [e.tick, e.type, e.key]), [
    [0, "on", 60], [480, "off", 60], [480, "on", 64], [960, "off", 64],
    [960, "on", 67], [960, "on", 72], [1440, "off", 67], [1440, "off", 72],
    [1440, "on", 62], [TEST_SQ_END, "off", 62],
  ]);
});

test("SQ note-off is one data byte only (no velocity byte) — verified by an odd-length event stream still landing on the next status byte", () => {
  // regression guard: if note-off were mistakenly read as two data bytes
  // (PS1 SEQ's shape), the parser would desync and either throw or produce
  // a wrong key on notes after the very first note-off in the fixture.
  const seq = parseSQ(makeTestSQ());
  const secondNoteOn = seq.events.find(e => e.type === "on" && e.tick === 480);
  assert.equal(secondNoteOn.key, 64, "not desynced by the preceding one-byte note-off");
});

test("seqNotes (reused from tools/psx/notes.mjs, unmodified) over an SQ-shaped seq: pitch as written with no bank, tempo map and bar/beat both correct", () => {
  const seq = parseSQ(makeTestSQ());
  const r = seqNotes(seq);
  assert.deepEqual(r.notes.map(n => pitchName(n.pitch)), TEST_SQ_NOTES.map(([, k]) => pitchName(k)));
  assert.deepEqual(r.notes.map(n => [n.tick, n.key, n.endTick - n.tick]), TEST_SQ_NOTES);
  const txt = toNotesTxt(r, {title: "sq-test"});
  assert.match(txt, /^# sq-test — 4\/4, 120bpm, 1 bars, 480 ticks\/quarter \(from PS1 SEQ\)/, "toNotesTxt runs over an SQ seq with no PS2-specific branch");
  assert.match(txt, /loop: bar 1 beat 1 → bar 2 beat 1 \(forever\)/);
  const mid = makeMidi(r);
  assert.equal(String.fromCharCode(...mid.subarray(0, 4)), "MThd");
});

test("HD: header/program/sampleset/sample/vagInfo chunks parse; toBank() gives a VAB-shaped bank tools/psx/vab.mjs's tonesFor/vagPcm run over unmodified", async () => {
  const hd = makeTestHD({baseNote: 60});
  assert.ok(isHD(hd));
  const parsed = parseHD(hd);
  assert.equal(parsed.programs.length, 1);
  assert.equal(parsed.programs[0].splits.length, 1);
  assert.equal(parsed.samples[0].baseNote, 60);
  assert.equal(parsed.vagInfos[0].offset, 0);
  const {tonesFor, vagPcm} = await import("../tools/psx/vab.mjs");
  const bank = toBank(parsed, new Uint8Array(32));
  assert.equal(tonesFor(bank, 0, 60)[0].center, 60);
  assert.equal(tonesFor(bank, 0, 200).length, 0, "out of every split's key range");
  assert.equal(vagPcm(bank, 1).pcm.length > 0, true, "silent (all-zero) BD still decodes as valid ADPCM");
});

test("HD: a 0xFFFFFFFF sentinel in the Sample/VAGInfo offset tables (real Dark Cloud files have these) is an unused slot, not a crash", () => {
  // build a 2-slot Sample chunk where slot 0 is a real sample and slot 1 is sentineled
  const hd = makeTestHD();
  // sanity: parsing the ordinary fixture (no sentinels) still works, proving
  // the guard added nothing wrong for the common case (the sentinel path
  // itself is exercised end to end against real files in ps2-real.test.mjs)
  assert.doesNotThrow(() => parseHD(hd));
});

test("toBank(): pan/mpan are absolute 0-127 values (64 = centre, tools/psx/vab.mjs's own convention) — NOT an offset added to 64", () => {
  // regression guard for a real bug found against real Dark Cloud files: a
  // program's panpot byte reads exactly 64 in EVERY real program (a true
  // per-program OFFSET would default to 0, not a constant non-zero value),
  // and split panpot values cluster symmetrically AROUND 64 (e.g. 10/64/116
  // across real songs), not around 0 — this module's first cut added
  // another 64 on top, hard-panning nearly every note right.
  const hd = makeTestHD(); // the fixture's panpot bytes are 0 (program AND split)
  const bank = toBank(parseHD(hd), new Uint8Array(32));
  assert.equal(bank.programs[0].mpan, 0, "prog.panpot=0 must read as pan 0 (hard left), not 64+0=64 (centre)");
  assert.equal(tonesFor(bank, 0, 60)[0].pan, 0, "split.panpot=0 must read as pan 0, not 64");
});

test("toBank(): each VAG's own native sample rate (real Dark Cloud files carry 22050-44100 Hz, not one fixed rate) rides through to the VAB-shaped bank", () => {
  const hd = makeTestHD({sampleRate: 22050});
  const bank = toBank(parseHD(hd), new Uint8Array(32));
  assert.equal(bank.vags[1].rate, 22050);
  // the milestone-1 fixture (sampleRate omitted, i.e. 0 — an "unspecified"
  // HD file) must still fall back cleanly, not carry a bogus 0 Hz forward
  const bankNoRate = toBank(parseHD(makeTestHD()), new Uint8Array(32));
  assert.equal(bankNoRate.vags[1].rate, 0);
});

test("renderSpu (reused unmodified from PS1): a VAG's own native rate is honored for pitch — omitting it (a PS1-style bank) falls back to 44100 exactly as before, an octave off if the sample is really 22050 Hz", async () => {
  // a 3-block loop of one 28-sample square wave (14 samples high, 14 low —
  // the same fixture tools/psx/spu-render.mjs's own test suite (tests/
  // psx-render.test.mjs) uses to make a period the autocorrelator can find):
  // its DECODED period is 28 samples at whatever rate it is played back at —
  // `ratio` (native rate ÷ output rate) is what turns that into an output
  // frequency, so getting the native rate wrong shifts the measured pitch.
  const nib = []; for (let i = 0; i < 28; i++) nib.push(i < 14 ? 7 : 9); // shift0/filter0: 7 -> +28672, 9 -> -28672 (sign-extended)
  const block = flags => { const b = [0x00, flags]; for (let i = 0; i < 28; i += 2) b.push((nib[i] & 15) | ((nib[i + 1] & 15) << 4)); return b; };
  const bd = new Uint8Array([...block(4), ...block(0), ...block(3)]); // loop start, middle, end+loop-forever
  const bankShape = rate => ({
    programs: (() => { const p = new Array(128).fill(null); p[0] = {index: 0, tones: [{min: 0, max: 127, vag: 1, center: 60, shift: 0, vol: 127, pan: 64, adsr1: 0x80FF, adsr2: 0x1FEE}], mvol: 127, mpan: 64}; return p; })(),
    vags: [null, {index: 1, offset: 0, size: bd.length, rate}],
    body: bd, masterVol: 127, masterPan: 64, warnings: [], _pcm: new Map(),
  });
  const seq = {ppq: 48, tempoMap: [{tick: 0, usq: 500000}], timeSigs: [{tick: 0, num: 4, den: 4}], loop: null, warnings: []};
  const note = {tick: 0, endTick: 384, ch: 0, key: 60, vel: 100, program: 0, pitch: 60, cents: 0, drum: false, tone: null}; // 2s at 120bpm/48ppq
  const OUT_RATE = 44100;
  const hzOf = async rate => {
    const result = {notes: [note], seq, vab: bankShape(rate)};
    const r = await renderSpu(result, {sampleRate: OUT_RATE});
    const track = Object.values(r).find(v => v && v.l);
    const pcm = new Float32Array(track.l.length); for (let i = 0; i < pcm.length; i++) pcm[i] = track.l[i] + track.r[i];
    const root = estimateRoot({pcm, loopStart: null, loopEnd: null, oneShot: true}, OUT_RATE);
    assert.ok(root, "a period should be found: " + JSON.stringify(root));
    return root.hz;
  };
  const corrected = await hzOf(22050);   // this VAG's real native rate (< the 44100 output rate): ratio 0.5, period 56 samples
  const noRate = await hzOf(undefined);  // a PS1-style bank (vagPcm/vab.vags never carry `.rate`): falls back to spu-render.mjs's own SPU_RATE (44100), unchanged from before this milestone
  assert.ok(Math.abs(corrected - 787.5) / 787.5 < 0.05, "44100/56: " + corrected);
  assert.ok(Math.abs(noRate - 1575) / 1575 < 0.05, "the old, unmodified PS1 behavior: 44100/28: " + noRate);
  assert.ok(Math.abs(noRate / corrected - 2) < 0.05, "not threading the native rate through sounds a full octave sharp: " + noRate + " vs " + corrected);
});

test("ps2Song: Sony's stock driver via a mini's psf2.ini (-s=/-h=/-b=), the exact mechanism real Dark Cloud minis use", async () => {
  const sq = makeTestSQ();
  const hd = makeTestHD();
  const bd = new Uint8Array(32);
  const lib = makePSF2(buildPSF2Fs([fileNode("TESTSEQ.SQ", sq), fileNode("TESTBANK.HD", hd), fileNode("TESTBANK.BD", bd)]), {game: "Test"});
  const ini = "libsd.irx\r\nsq.irx -r=3 -d=4096 -s=TESTSEQ.SQ -h=TESTBANK.HD -b=TESTBANK.BD\r\n";
  const mini = makePSF2(buildPSF2Fs([fileNode("psf2.ini", new TextEncoder().encode(ini))]), {_lib: "test.psf2lib", title: "Test Tune", length: "0:04"});
  const sources = await loadPSF2Chain(mini, name => name === "test.psf2lib" ? lib : null, {name: "mini.psf2"});
  const files = mergePSF2(sources);
  const miniSource = sources.find(s => s.name === "mini.psf2");
  const song = await ps2Song(files, miniSource);
  assert.equal(song.kind, "sq");
  assert.equal(song.renderable, true);
  assert.deepEqual(song.source, {sq: "TESTSEQ.SQ", hd: "TESTBANK.HD", bd: "TESTBANK.BD"});
  assert.equal(song.result.notes.length, TEST_SQ_NOTES.length);
  assert.equal(bpmOf(song.result.seq.tempo), 120);
});

test("ps2Song: Square Enix's own driver (a .bgm file) is identified and reported, not parsed, per milestone-1 scope", async () => {
  const fakeBgm = makePSF2(buildPSF2Fs([fileNode("song001.bgm", new Uint8Array([0x42, 0x47, 0x4D, 0x20]))]), {});
  const sources = await loadPSF2Chain(fakeBgm, () => null, {name: "mini.psf2"});
  const files = mergePSF2(sources);
  const song = await ps2Song(files, sources[0]);
  assert.equal(song.kind, "bgm-unimplemented");
  assert.match(song.why, /Square Enix/);
});

test("ps2Song: no psf2.ini and no .bgm anywhere -> a clear, thrown error naming what Night Roll cannot read yet", async () => {
  const mini = makePSF2(buildPSF2Fs([fileNode("nonsense.dat", new Uint8Array([1]))]), {});
  const sources = await loadPSF2Chain(mini, () => null, {name: "mini.psf2"});
  const files = mergePSF2(sources);
  await assert.rejects(ps2Song(files, sources[0]), /no PS2 sequence data found/);
});

test("dump CLI writes .notes.txt and .mid for a real-shaped minipsf2+psf2lib pair", () => {
  const dir = mkdtempSync(join(tmpdir(), "ps2-"));
  const sq = makeTestSQ();
  const hd = makeTestHD();
  const bd = new Uint8Array(32);
  const lib = makePSF2(buildPSF2Fs([fileNode("TESTSEQ.SQ", sq), fileNode("TESTBANK.HD", hd), fileNode("TESTBANK.BD", bd)]), {game: "Test"});
  const ini = "sq.irx -s=TESTSEQ.SQ -h=TESTBANK.HD -b=TESTBANK.BD\r\n";
  const mini = makePSF2(buildPSF2Fs([fileNode("psf2.ini", new TextEncoder().encode(ini))]), {_lib: "test.psf2lib", title: "cli-song"});
  writeFileSync(join(dir, "test.psf2lib"), lib);
  writeFileSync(join(dir, "song.psf2"), mini);
  const run = (...a) => execFileSync(process.execPath, ["tools/ps2/dump.mjs", ...a], {stdio: ["ignore", "pipe", "pipe"]});
  run(join(dir, "song.psf2"));
  const txt = readFileSync(join(dir, "song.notes.txt"), "utf8");
  assert.match(txt, /^# cli-song — 4\/4, 120bpm, 1 bars/);
  assert.ok(existsSync(join(dir, "song.mid")));
  // bare SQ + --hd/--bd, no PSF2 container at all
  writeFileSync(join(dir, "bare.SQ"), sq);
  writeFileSync(join(dir, "bare.HD"), hd);
  writeFileSync(join(dir, "bare.BD"), bd);
  run(join(dir, "bare.SQ"), "--hd", join(dir, "bare.HD"), "--bd", join(dir, "bare.BD"), "--title", "bare");
  assert.match(readFileSync(join(dir, "bare.notes.txt"), "utf8"), /^# bare — 4\/4, 120bpm/);
});
