// What the real Genesis packs look like, pinned without their bytes: Sonic
// the Hedgehog (19 tracks) and Sonic the Hedgehog 2 (31), the Zophar/vgmrips
// "(EMU)" zips, surveyed 2026-09-27 (tools/vgm/INTEGRATION.md "Real rips").
// Fixtures here are TEXT lifted from those files — GD3 fields, file names,
// header words, the register shapes their SMPS driver writes — and each test
// rebuilds the shape from our own bytes. No rip data is committed.
import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { wrapVGM } from "../tools/vgm/make-test-vgm.mjs";
import { parseVGM, inflateVGM, trackFromFileName } from "../tools/vgm/vgm.mjs";
import { reconstruct, toNotesTxt, pitchName, fmFreq, psgVelocity } from "../tools/vgm/notes.mjs";
import { makeMidi } from "../tools/vgm/midi-write.mjs";

// ---- fixtures ---------------------------------------------------------------
const SONIC1 = {
  game: "Sonic the Hedgehog", system: "Sega Mega Drive", author: "Masato Nakamura", date: "1991/06/23", ripper: "-DJSW-",
  // file name -> [GD3 track EN, GD3 track JP] (JP empty where the tag left it empty)
  tracks: {
    "01 - Title Theme.vgm": ["Title Theme", "タイトル"],
    "02 - Green Hill Zone.vgm": ["Green Hill Zone", "グリーンヒルゾーン"],
    "03 - Marble Zone.vgm": ["Marble Zone", "マーブルゾーン"],
    "04 - Spring Yard Zone.vgm": ["Spring Yard Zone", "スプリングヤードゾーン"],
    "05 - Labyrinth Zone.vgm": ["Labyrinth Zone", "ラビリンスゾーン"],
    "06 - Star Light Zone.vgm": ["Star Light Zone", "スターライトゾーン"],
    "07 - Scrap Brain Zone.vgm": ["Scrap Brain Zone", "スクラップブレインゾーン"],
    "08 - Special Stage.vgm": ["Special Stage", "スペシャルステージ"],
    "09 - Robotnik.vgm": ["Robotnik", ""],
    "10 - Final Zone.vgm": ["Final Zone", "ファイナルゾーン"],
    "11 - Stage Clear.vgm": ["Stage Clear", ""],
    "12 - Ending Theme.vgm": ["Ending Theme", ""],
    "13 - Staff Roll.vgm": ["Staff Roll", ""],
    "14 - Invincibility.vgm": ["Invincibility", "無敵"],
    "15 - 1-up.vgm": ["1-up", "1-up"],
    "16 - Chaos Emerald.vgm": ["Chaos Emerald", ""],
    "17 - Drowning.vgm": ["Drowning", ""],
    "18 - Continue.vgm": ["Continue?", "コンティニュー"],
    "19 - Game Over.vgm": ["Game Over", "ゲームオーバー"],
  },
  otherAuthor: {"16 - Chaos Emerald.vgm": "Yukifumi Makino", "17 - Drowning.vgm": "Yukifumi Makino"},
};
const SONIC2 = {
  game: "Sonic the Hedgehog 2", system: "Sega Mega Drive", author: "Masato Nakamura", date: "1992/11/21", ripper: "-DJSW-",
  tracks: {
    "01 - Opening Theme.vgm": ["Opening Theme", ""],
    "02 - Options.vgm": ["Options", ""],
    "03 - Emerald Hill Zone.vgm": ["Emerald Hill Zone", "エメラルドヒル"],
    "04 - Act Clear.vgm": ["Act Clear", ""],
    "05 - Chemical Plant Zone.vgm": ["Chemical Plant Zone", "ケミカルプラント"],
    "06 - Drowning.vgm": ["Drowning", ""],
    "07 - Aquatic Ruin Zone.vgm": ["Aquatic Ruin Zone", "アクアティックルーイン"],
    "08 - Casino Night Zone.vgm": ["Casino Night Zone", "カジノナイト"],
    "09 - Hill Top Zone.vgm": ["Hill Top Zone", "ヒルトップ"],
    "10 - Mystic Cave Zone.vgm": ["Mystic Cave Zone", "ミスティックケイブ"],
    "11 - Oil Ocean Zone.vgm": ["Oil Ocean Zone", "オイルオーシャン"],
    "12 - Metropolis Zone.vgm": ["Metropolis Zone", "メトロポリス"],
    "13 - Sky Chase Zone.vgm": ["Sky Chase Zone", "スカイチェイス"],
    "14 - Wing Fortress Zone.vgm": ["Wing Fortress Zone", "ウィングフォートレス"],
    "15 - Death Egg Zone.vgm": ["Death Egg Zone", "デスエッグ"],
    "16 - Robotnik.vgm": ["Robotnik", ""],
    "17 - Final Boss.vgm": ["Final Boss", "エッグロボ"],
    "18 - Continue.vgm": ["Continue?", ""],
    "19 - Ending Theme.vgm": ["Ending Theme", ""],
    "20 - Staff Roll.vgm": ["Staff Roll", ""],
    "21 - Game Over.vgm": ["Game Over", ""],
    "22 - Invincibility.vgm": ["Invincibility", "無敵"],
    "23 - Super Sonic.vgm": ["Super Sonic", "スーパーソニック"],
    "24 - 1-up.vgm": ["1-up", ""],
    "25 - 2 Player Results.vgm": ["2 Player Results", ""],
    "26 - Emerald Hill (2P).vgm": ["Emerald Hill (2 Player)", "エメラルドヒル(２人用)"],
    "27 - Casino Night (2P).vgm": ["Casino Night (2 Player)", "カジノナイト(２人用)"],
    "28 - Mystic Cave (2P).vgm": ["Mystic Cave (2 Player)", "ミスティックケイブ(２人用)"],
    "29 - Special Stage.vgm": ["Special Stage", "スペシャルステージ"],
    "30 - Chaos Emerald.vgm": ["Chaos Emerald", ""],
    "31 - Hidden Palace Zone.vgm": ["Unused (Sound Test 10)", ""],
  },
  otherAuthor: {"06 - Drowning.vgm": "Yukifumi Makino", "30 - Chaos Emerald.vgm": "Yukifumi Makino"},
  otherRipper: {"14 - Wing Fortress Zone.vgm": "kode54"},
};
// header words as the rips carry them (all fifty share the first row's shape)
const HEADER = {version: 0x150, dataOffsetField: 0x0C, psg: 3579545, ym2612: 7670453, rate: 60, feedback: 0x0009, srWidth: 16};
const LENGTHS = { // file -> [total samples, loop samples]; intro = total - loop
  "02 - Green Hill Zone.vgm": [2346090, 1693440],
  "03 - Marble Zone.vgm": [1697159, 1587600],
  "06 - Star Light Zone.vgm": [2010961, 1862490],
  "09 - Hill Top Zone.vgm": [1900539, 1900539],  // loops from the very top
  "15 - Death Egg Zone.vgm": [2257412, 2257412],
  "01 - Title Theme.vgm": [386610, 0],           // a jingle: no loop
};

// ---- helpers ------------------------------------------------------------------
const gd3For = (album, file) => {
  const [en, jp] = album.tracks[file];
  return [en, jp, album.game, "", album.system, "", album.otherAuthor?.[file] || album.author, "",
          album.date, album.otherRipper?.[file] || album.ripper, ""];
};
const waitN = (data, n) => { while (n > 0) { const w = Math.min(n, 0xFFFF); data.push(0x61, w & 0xFF, w >> 8); n -= w; } };
const ym = (data, addr, val, port = 0) => data.push(0x52 | port, addr, val);
// a voice as SMPS writes it: alg/feedback, then per operator MUL|DT, TL — slot order op1 op3 op2 op4
const SLOT = [0, 8, 4, 12]; // op1..op4 -> register slot offset
const voice = (data, ch, {alg, fb = 0, mul, dt = [0, 0, 0, 0], tl}, port = 0) => {
  ym(data, 0xB0 + ch, (fb << 3) | alg, port);
  for (let op = 0; op < 4; op++) {
    ym(data, 0x30 + SLOT[op] + ch, (dt[op] << 4) | mul[op], port);
    ym(data, 0x40 + SLOT[op] + ch, tl[op], port);
    ym(data, 0x50 + SLOT[op] + ch, 0x1F, port); ym(data, 0x80 + SLOT[op] + ch, 0x0F, port);
  }
};
const note = (data, ch, fnum, block, hold, port = 0) => {
  ym(data, 0xA4 + ch, (block << 3) | (fnum >> 8), port); ym(data, 0xA0 + ch, fnum & 0xFF, port);
  ym(data, 0x28, 0xF0 | (port ? ch + 4 : ch));
  waitN(data, hold);
  ym(data, 0x28, port ? ch + 4 : ch);
};
const finish = (data, opts = {}) => { data.push(0x66); return parseVGM(wrapVGM(data, {totalSamples: 0, ymClock: HEADER.ym2612, ...opts})); };

// ---- tests --------------------------------------------------------------------
test("GD3 as the Sonic packs carry it: EN + katakana JP names, eleven fields, round-trips plain and gzipped", async () => {
  for (const album of [SONIC1, SONIC2]) {
    for (const file of Object.keys(album.tracks)) {
      const fields = gd3For(album, file);
      const data = [0x52, 0x2B, 0x00, 0x62, 0x66];
      const bytes = wrapVGM(data, {totalSamples: 735, gd3Fields: fields});
      const g = parseVGM(bytes).gd3;
      assert.equal(g.track, fields[0], file);
      assert.equal(g.trackJp, fields[1], file + " (JP)");
      assert.equal(g.game, album.game);
      assert.equal(g.system, "Sega Mega Drive", "the tag says Mega Drive, not Genesis");
      assert.equal(g.author, album.otherAuthor?.[file] || album.author);
      assert.equal(g.date, album.date);
      assert.equal(g.ripper, album.otherRipper?.[file] || album.ripper);
      assert.equal(g.notes, "");
      if (file === "26 - Emerald Hill (2P).vgm") {
        assert.ok(g.trackJp.includes("２"), "fullwidth digits survive the UTF-16LE decode");
        const gz = parseVGM(await inflateVGM(gzipSync(bytes))).gd3; // the same file as a .vgz
        assert.deepEqual(gz, g);
      }
    }
  }
  assert.equal(SONIC1.tracks["18 - Continue.vgm"][0], "Continue?", "a file name cannot carry the tag's '?'");
  assert.equal(SONIC2.tracks["31 - Hidden Palace Zone.vgm"][0], "Unused (Sound Test 10)", "the tag, not the file name, is the tune's name");
});

test("track files: 'NN - Title.vgm', 1-based and gapless, no playlist in the zip", () => {
  for (const [album, count] of [[SONIC1, 19], [SONIC2, 31]]) {
    const names = Object.keys(album.tracks);
    assert.equal(names.length, count);
    const parsed = names.map(trackFromFileName);
    assert.deepEqual(parsed.map(p => p.n), names.map((_, i) => i + 1), "numbers run 1..N in file order");
    parsed.forEach((p, i) => assert.equal(p.title, names[i].replace(/^\d+ - /, "").replace(/\.vgm$/, "")));
  }
  assert.deepEqual(trackFromFileName("dir/02 - Green Hill Zone.vgz"), {n: 2, title: "Green Hill Zone"});
  assert.deepEqual(trackFromFileName("07_Scrap Brain.VGM"), {n: 7, title: "Scrap Brain"});
  assert.equal(trackFromFileName("Green Hill Zone.vgm"), null);
  assert.equal(trackFromFileName("readme.txt"), null);
  // both albums share names: a drop of both zips must key rows by album + number, not by title
  const shared = Object.values(SONIC1.tracks).map(t => t[0]).filter(t => Object.values(SONIC2.tracks).some(u => u[0] === t));
  assert.deepEqual(shared.sort(), ["1-up", "Chaos Emerald", "Continue?", "Drowning", "Ending Theme", "Game Over", "Invincibility", "Robotnik", "Special Stage", "Staff Roll"]);
});

test("header words as Green Hill Zone has them: v1.50, data at 0x40, clock 7670453 kept verbatim, total = intro + one pass", () => {
  for (const [file, [total, loop]] of Object.entries(LENGTHS)) {
    const intro = total - loop;
    const data = [];
    data.push(0x4F, 0x00);                 // the Game Gear stereo byte every one of these rips opens with
    ym(data, 0x2B, 0x80);
    waitN(data, intro);
    const loopPos = data.length;
    waitN(data, loop);
    data.push(0x66);
    const bytes = wrapVGM(data, {totalSamples: total, loopSamples: loop, loopPos: loop ? loopPos : null,
                                 ymClock: HEADER.ym2612, psgClock: HEADER.psg, rate: HEADER.rate, version: HEADER.version});
    const dv = new DataView(bytes.buffer);
    assert.equal(dv.getUint32(0x34, true), HEADER.dataOffsetField, "relative data offset 0x0C -> data at 0x40");
    assert.equal(dv.getUint16(0x28, true), HEADER.feedback); assert.equal(bytes[0x2A], HEADER.srWidth);
    const vgm = parseVGM(bytes);
    assert.equal(vgm.version, 0x150, file);
    assert.equal(vgm.clocks.ym2612, 7670453, "one Hz under the nominal NTSC clock — reported as written, not 'corrected'");
    assert.equal(vgm.clocks.psg, 3579545);
    assert.equal(vgm.totalSamples, total);
    assert.equal(vgm.endSample, total, "the waits add up to the header's total");
    if (loop) {
      assert.equal(vgm.loopSample, intro, file + ": loop starts where the intro ends");
      assert.equal(vgm.loopSample + vgm.loopSamples, vgm.totalSamples, "intro + exactly one loop pass");
    } else assert.equal(vgm.loopSample, null, file + ": a jingle has no loop");
  }
  // SMPS's A: Fnum 1084 in block 4 at this clock is A4 within 3 cents
  const cents = 1200 * Math.log2(fmFreq(1084, 4, 7670453) / 440);
  assert.ok(Math.abs(cents) < 3, "SMPS A = 1084: " + cents.toFixed(1) + " cents");
});

test("SMPS voices from the rips: the chord voice sounds two octaves above its Fnum, the bass an octave below, Oil Ocean's carriers a fifth apart", () => {
  const data = [];
  ym(data, 0x2B, 0x00);
  // Green Hill Zone fm4 (port 1, ch 0): alg 4, MUL 4 4 4 4, DT 7 7 3 3, TL 22 29 23 29; E2's Fnum 813/2 is the E4 stab
  const Q = 17640; // one beat at 150 bpm (Green Hill's grid: 6 frames a 16th)
  voice(data, 0, {alg: 4, fb: 0, mul: [4, 4, 4, 4], dt: [7, 7, 3, 3], tl: [22, 29, 23, 29]}, 1);
  note(data, 0, 813, 2, Q, 1);
  note(data, 0, 644, 2, Q, 1);
  note(data, 0, 1084, 1, Q, 1);
  // Green Hill Zone fm2: alg 0, MUL 10 0 0 0, TL 36 45 19 11 — A2's Fnum 1084/2 is the A1 bass
  voice(data, 1, {alg: 0, mul: [10, 0, 0, 0], dt: [0, 7, 3, 0], tl: [36, 45, 19, 11]});
  note(data, 1, 1084, 2, Q);
  note(data, 1, 1084, 3, Q);
  // Oil Ocean Zone fm4: alg 6, MUL 6 6 4 4, TL 25 23 16 16 — F0's Fnum 860/0 sounds F2 + C3
  voice(data, 0, {alg: 6, mul: [6, 6, 4, 4], dt: [5, 1, 3, 1], tl: [25, 23, 16, 16]}, 1);
  note(data, 0, 860, 0, Q, 1);
  note(data, 0, 723, 1, Q, 1);
  const ev = reconstruct(finish(data));
  const fm4 = ev.filter(e => e.channel === "fm4"), fm2 = ev.filter(e => e.channel === "fm2");
  assert.deepEqual(fm4.slice(0, 3).map(e => pitchName(e.midi)), ["E4", "C4", "A3"]);
  assert.deepEqual(fm4.slice(0, 3).map(e => e.mul), [4, 4, 4]);
  assert.deepEqual(fm2.map(e => pitchName(e.midi)), ["A1", "A2"]);
  assert.equal(fm2[0].mul, 0.5);
  assert.deepEqual(fm4.slice(3).map(e => [pitchName(e.midi), e.mul, e.mulHi]), [["F2", 4, 6], ["D3", 4, 6]]);
  assert.equal(fm4.length, 5, "the voice change between notes adds no note");
  assert.equal(ev.filter(e => e.legato).length, 0);
  // the notes text lists the sounding pitches; tl is the carriers' lowest TL (op1's 22 is a modulator)
  const txt = toNotesTxt(ev, {frames: 8 * Q, bpm: 150, title: "t"});
  assert.match(txt, /## channel fm2\nbar 1: 4 A1 1 tl11\nbar 2: 1 A2 1 tl11/);
  assert.match(txt, /## channel fm4\nbar 1: 1 E4 1 tl29, 2 C4 1 tl29, 3 A3 1 tl29\nbar 2: 2 F2 1 tl16, 3 D3 1 tl16/);
});

test("SMPS DAC as logged: whole samples pre-written at frame 0 with wait 0, then one 0xE0 per drum, kicks back to back", () => {
  // Sonic 2 Final Boss: seek 0 / ~2166 writes at wait 2 every 100 ms with no
  // silence between — 340 seeks in 58 s, and one hit before the seek rule
  const kick = new Array(2547).fill(0).map((_, i) => 0x80 + Math.round(120 * Math.sin(i / 7) * (1 - i / 2547)));
  const data = [0x67, 0x66, 0x00, kick.length & 0xFF, kick.length >> 8, 0, 0, ...kick];
  ym(data, 0x2B, 0x80);
  data.push(0xE0, 0, 0, 0, 0); for (let i = 0; i < kick.length; i++) data.push(0x80); // prefill
  data.push(0x61, 0x3A, 0x02); // 570 samples ~ the 13 ms the real file waits
  for (let hit = 0; hit < 8; hit++) { data.push(0xE0, 0, 0, 0, 0); for (let i = 0; i < 2166; i++) data.push(0x82); }
  data.push(0x62);
  const vgm = finish(data);
  assert.equal(vgm.pcm.length, 2547);
  assert.equal(vgm.dac.t.length, 2547 + 8 * 2166);
  const dac = reconstruct(vgm).filter(e => e.channel === "dac");
  assert.equal(dac.length, 8, "one hit per seek");
  const step = 2166 * 2;
  // the sample's first byte is centre (sin 0): each hit is audible from its second write, 2 samples in
  dac.forEach((e, k) => { assert.equal(e.startFrame, 570 + 2 + k * step, "hit " + k); assert.ok(e.endFrame <= 570 + (k + 1) * step); });
  assert.ok(dac.every(e => e.peak >= 100 && e.peak <= 127));
  assert.ok(dac.every(e => e.vel >= 112), "velocity from the sample's peak, not from how long it was allowed to play");
  const mid = makeMidi(dac, {bpm: 150});
  assert.equal(String.fromCharCode(...mid.subarray(0, 4)), "MThd");
});

test("SMPS PSG tick (Oil Ocean): tone 3 at period 24 with a 7-8-9-off envelope is a psg3 hit; the armed noise channel never sounds", () => {
  // the rip: E7 (noise: white, tone-3 rate) + FF at init, then per hit
  // C8 01 (period 24) D7, +48 ms D8, +50 ms D9, +17 ms DF — noise att stays 15
  const data = [0x50, 0xE7, 0x50, 0xFF, 0x50, 0x9F, 0x50, 0xBF, 0x50, 0xDF];
  for (let k = 0; k < 3; k++) {
    data.push(0x50, 0xC8, 0x50, 0x01, 0x50, 0xD7); waitN(data, 2117);
    data.push(0x50, 0xD8); waitN(data, 2205);
    data.push(0x50, 0xD9); waitN(data, 750);
    data.push(0x50, 0xDF); waitN(data, 5953);
  }
  const ev = reconstruct(finish(data));
  assert.equal(ev.filter(e => e.channel === "noise").length, 0, "attenuation 15 on the noise channel: nothing to report");
  const psg3 = ev.filter(e => e.channel === "psg3");
  assert.equal(psg3.length, 3);
  psg3.forEach((e, k) => {
    assert.equal(pitchName(e.midi), "D8");
    assert.equal(e.period, 24);
    assert.equal(e.startFrame, k * 11025);
    assert.equal(e.endFrame - e.startFrame, 2117 + 2205 + 750);
    assert.equal(e.vel, psgVelocity(7));
    assert.equal(e.velEnd, psgVelocity(9), "the last audible step is the decay target");
  });
});

test("Special Stage shape: no DAC in the file, channel 6 plays FM; a chromatic slide-in splits as 1-frame legato grace notes", () => {
  const data = [];
  // fm6 (port 1, ch 2) keyed with code 6, 0x2B never written
  voice(data, 2, {alg: 4, mul: [1, 1, 1, 1], tl: [30, 20, 30, 20]}, 1);
  note(data, 2, 644, 5, 4410, 1);
  // Mystic Cave fm1: F#5 G5 G#5 for a frame each, then A5 held (Fnum 911, 965, 1023, 1084 in block 5)
  voice(data, 0, {alg: 4, mul: [1, 1, 1, 1], tl: [40, 20, 40, 20]});
  ym(data, 0xA4, (5 << 3) | (911 >> 8)); ym(data, 0xA0, 911 & 0xFF); ym(data, 0x28, 0xF0);
  for (const f of [965, 1023, 1084]) { waitN(data, 735); ym(data, 0xA4, (5 << 3) | (f >> 8)); ym(data, 0xA0, f & 0xFF); }
  waitN(data, 46305);
  ym(data, 0x28, 0x00);
  const vgm = finish(data);
  assert.equal(vgm.dac.t.length, 0);
  const ev = reconstruct(vgm);
  const fm6 = ev.filter(e => e.channel === "fm6");
  assert.equal(fm6.length, 1);
  assert.equal(pitchName(fm6[0].midi), "C5");
  const fm1 = ev.filter(e => e.channel === "fm1");
  assert.deepEqual(fm1.map(e => [pitchName(e.midi), e.endFrame - e.startFrame, !!e.legato]),
                   [["F#5", 735, false], ["G5", 735, true], ["G#5", 735, true], ["A5", 46305, true]]);
  // the 1-frame steps quantize away in the notes text and the held target
  // lands where it began — three frames (50 ms) after the slide started, which
  // the beat grid reads as the triplet slot. An acknowledged approximation:
  // the musical onset is the first grace note (INTEGRATION.md "Real rips")
  const txt = toNotesTxt(fm1, {frames: 60000, bpm: 150, title: "t"});
  assert.match(txt, /## channel fm1\nbar 1: 1\.33 A5 /);
  assert.doesNotMatch(txt, /F#5|G5|G#5/);
});
