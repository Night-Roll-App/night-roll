// N64 capture v2 (NIGHT-ROLL.md "N64 capture v2"): what an N64 capture's
// .mid now carries on top of v1, for both drivers — the channel level as
// CC7, the bank's envelopes as volume shapes, channel bends / vibrato /
// portamento / Rare's wheel as pitch bend, wheel-split pieces and EAD
// continuous notes as glide links (CC84), reverb send as CC91, a program
// at every change, pan at every change — with every note (track, start,
// pitch, length) where v1 put it. Synthetic sequences are our own bytes;
// the real-rip test runs only when the rips are on disk.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseSequence } from "../tools/n64/seq-libultra.mjs";
import { toMidi, splitSlides } from "../tools/n64/notes.mjs";
import { Vibrato, noteEnvelopes } from "../tools/n64/render.mjs";
import { SparseImage } from "../tools/n64/usf.mjs";
import { parseCSeq, cseqNotes } from "../tools/n64/rare.mjs";
import { readSmf, captureDiff } from "../tools/capture-diff.mjs";
import { createApp } from "./harness.mjs";

// ---- a tiny EAD assembler: our own bytes, laid out per the sm64 decomp ----
// channels: [{setup: [...channel bytes before the layer starts], layer: [...layer bytes], then: [...channel bytes after]}]
function ead({channels, abi = "sm64", beats = 8, tempo = 120}) {
  const b = [], labels = {}, refs = [];
  const label = n => { labels[n] = b.length; };
  const ref = n => { refs.push([b.length, n]); b.push(0, 0); };
  const ldlayer = abi === "sm64" ? 0x90 : 0x88;
  const mask = (1 << channels.length) - 1;
  b.push(0xD3, 0x20, 0xD7, mask >> 8, mask & 0xFF);
  channels.forEach((_, i) => { b.push(0x90 | i); ref("ch" + i); });
  b.push(0xDD, tempo, 0xDB, 0x7F, 0xFD, ...cu(beats * 48), 0xD6, mask >> 8, mask & 0xFF, 0xFF);
  channels.forEach((c, i) => {
    label("ch" + i);
    b.push(...(c.setup || []), ldlayer); ref("ly" + i);
    b.push(...(c.then || [0xFD, ...cu(beats * 48)]), 0xFF);
    label("ly" + i);
    b.push(...c.layer, 0xFF);
  });
  for (const [at, n] of refs) { b[at] = labels[n] >> 8; b[at + 1] = labels[n] & 0xFF; }
  return new Uint8Array(b);
}
function cu(v) { return v < 0x80 ? [v] : [0x80 | (v >> 8), v & 0xFF]; }
const NOTE = (semi, delay, vel = 100, gate = 0) => [semi, ...cu(delay), vel, gate]; // large-note form (channel C4)
const DELAY = n => [0xFD, ...cu(n)];
const kinds = (tr, k) => tr.other.filter(e => e.kind === k);
const vals = (tr, k) => kinds(tr, k).map(e => [e.t, +e.key.split(":")[1]]);
const bendC = (e, semis = 2) => (+e.key.split(":")[1] - 8192) / 8192 * semis * 100;
// what v1 kept of a capture result: the notes, their pitches, lengths and velocities — none of v2's fields
const plain = res => ({...res, notes: res.notes.map(n => { const o = {...n}; for (const k of ["gain", "freqChanges", "vib", "vibChanges", "porta", "panChanges", "revChanges", "lg", "bendC0"]) delete o[k]; o.freq = 1; o.bend = 0; o.rev = 0; return o; })});
const sameNotes = (a, b) => { const r = captureDiff(readSmf(a), readSmf(b)); assert.notEqual(r.verdict, "MOVED", r.reasons.join("; ")); return r; };

test("EAD: channel volume under a held note is CC7 at its tick; pan under it is CC10; D4 is CC91; a C1 between notes is a program change there; a D3 bend is pitch bend with its RPN range", () => {
  const seq = ead({channels: [{
    setup: [0xC4, 0xC1, 0x05, 0xDF, 0x64, 0xDD, 0x40, 0xD4, 0x30],
    layer: [...NOTE(39, 96), ...NOTE(41, 96)],
    then: [...DELAY(48), 0xDF, 0x32, 0xDD, 0x70, ...DELAY(48), 0xC1, 0x06, ...DELAY(48), 0xD3, 0x7F, ...DELAY(48)],
  }]});
  const res = parseSequence(seq, {abi: "sm64"});
  assert.deepEqual(res.notes.map(n => [n.tick, n.dur, n.inst]), [[0, 96, 5], [96, 96, 6]]);
  assert.deepEqual(res.notes[0].panChanges, [{t: 48, pan: 0x70 / 128, panWeight: 1}], "the channel's pan while the note holds");
  const tr = readSmf(toMidi(res)).tracks[0];
  assert.deepEqual(vals(tr, "cc7"), [[0, 100], [480, 50]], "DF 100 → CC7 100, DF 50 under the held note → CC7 50 at its tick");
  assert.deepEqual(vals(tr, "cc10"), [[0, 64], [480, 111]], "pan 0x40, then 0x70 under the note");
  assert.deepEqual(vals(tr, "cc91"), [[0, 0x30]], "D4 0x30: the send");
  assert.deepEqual(vals(tr, "program"), [[0, 5], [960, 6]], "a program at the first note and where the channel's instrument changes");
  assert.deepEqual(vals(tr, "cc6"), [[0, 12]], "an octave bend: RPN 0 = ±12");
  assert.deepEqual(kinds(tr, "bend").map(e => [e.t, Math.round(bendC(e, 12))]), [[1440, 1200]], "D3 0x7F (×2) under the held note: +1200 cents at its tick");
  assert.deepEqual(tr.notes.map(n => [n.t, n.p, n.d, n.v]), [[0, 60, 960, 100], [960, 62, 960, 100]], "the notes are v1's");
  assert.equal(kinds(tr, "cc84").length, 0, "re-keyed notes: no link");
  const r = sameNotes(toMidi(plain(res)), toMidi(res));
  assert.equal(r.verdict, "VELOCITY");
});

test("EAD: a bend already in force at the note-on is written at the note's start; the roll keeps the key", () => {
  const seq = ead({channels: [{setup: [0xC4, 0xC1, 0x01, 0xDE, 0x40, 0x00], layer: [...NOTE(39, 96)]}]}); // DE 0x4000 = ×0.5: an octave down
  const res = parseSequence(seq, {abi: "sm64"});
  const tr = readSmf(toMidi(res)).tracks[0];
  assert.equal(tr.notes[0].p, 60);
  assert.deepEqual(kinds(tr, "bend").map(e => [e.t, Math.round(bendC(e, 12))]), [[0, -1200]]);
});

test("EAD vibrato (D8 extent, D7 rate) is a pitch-bend wobble under the one note, as the render's own Vibrato runs it (sm64 triangle; oot sine)", () => {
  for (const abi of ["sm64", "oot"]) {
    const seq = ead({abi, channels: [{setup: [0xC4, 0xC1, 0x01, 0xD7, 0x40, 0xD8, 0x40], layer: [...NOTE(39, 192)]}]});
    const res = parseSequence(seq, {abi});
    assert.ok(res.notes[0].vib, abi + ": the note carries the vibrato");
    const tr = readSmf(toMidi(res)).tracks[0];
    assert.equal(tr.notes.length, 1, abi + ": still one note");
    const c = kinds(tr, "bend").map(e => bendC(e));
    assert.ok(c.length > 20, abi + ": the wobble is written (" + c.length + " points)");
    // sm64: 1 + 512/4096·(2^(±120/127) − 1) → +190 / −107 cents at the curve's ends
    const v = new Vibrato({rateStart: 0x800, rateTarget: 0x800, rateDelay: 0, extStart: 512, extTarget: 512, extDelay: 0, delay: 0});
    const top = 1200 * Math.log2(v.scale(15)), bottom = 1200 * Math.log2(v.scale(47));
    if (abi === "sm64") {
      assert.ok(Math.abs(Math.max(...c) - top) < 6 && Math.abs(Math.min(...c) - bottom) < 6, `sm64 range ${Math.min(...c).toFixed(0)}…${Math.max(...c).toFixed(0)} vs ${bottom.toFixed(0)}…${top.toFixed(0)}`);
    } else assert.ok(Math.max(...c) > 50 && Math.min(...c) < -50, "oot: both sides of the pitch");
    sameNotes(toMidi(plain(res)), toMidi(res));
  }
});

test("EAD oot generation: CC7 is the level squared, as its volume law has it", () => {
  const seq = ead({abi: "oot", channels: [{setup: [0xC4, 0xC1, 0x01, 0xDF, 0x64], layer: [...NOTE(39, 96)]}]});
  const tr = readSmf(toMidi(parseSequence(seq, {abi: "oot"}))).tracks[0];
  assert.deepEqual(vals(tr, "cc7"), [[0, Math.round(127 * (100 / 127) ** 2)]]);
});

test("EAD continuous notes (layer C4): a note-on while the last still sounds is a glide link (CC84 = that key); a rest re-keys", () => {
  const seq = ead({channels: [{setup: [0xC4, 0xC1, 0x01], layer: [0xC4, ...NOTE(39, 48), ...NOTE(41, 48), ...NOTE(43, 48), 0xC0, ...cu(48), ...NOTE(44, 48)]}]});
  const res = parseSequence(seq, {abi: "sm64"});
  assert.deepEqual(res.notes.map(n => !!n.lg), [false, true, true, false]);
  const tr = readSmf(toMidi(res)).tracks[0];
  assert.deepEqual(vals(tr, "cc84"), [[480, 60], [960, 62]]);
  const a = sameNotes(toMidi(plain(res)), toMidi(res));
  assert.equal(a.gained.cc84, 2);
});

test("EAD portamento (layer C7): the glide is a bend ramp from the start pitch, measured from the written note; mode 2 lands on the target as its own note", () => {
  // mode 1, plain time 48 updates: from target (note − 2) up to the note
  const s1 = ead({channels: [{setup: [0xC4, 0xC1, 0x01], layer: [0xC7, 0x01, 37, 48, ...NOTE(39, 96)]}]});
  const r1 = parseSequence(s1, {abi: "sm64"});
  const t1 = readSmf(toMidi(r1)).tracks[0];
  assert.equal(t1.notes[0].p, 60, "the written note");
  const c1 = kinds(t1, "bend").map(e => [e.t, Math.round(bendC(e))]);
  assert.ok(c1[0][0] === 0 && c1[0][1] <= -190, "starts two semitones under: " + JSON.stringify(c1.slice(0, 3)));
  assert.equal(c1[c1.length - 1][1], 0, "lands on the note");
  assert.ok(c1.every((q, k) => !k || q[1] >= c1[k - 1][1]), "a rise");
  // mode 2: from the note to the target (+2): the roll shows the landed pitch; the bend starts 200 cents under it
  const s2 = ead({channels: [{setup: [0xC4, 0xC1, 0x01], layer: [0xC7, 0x02, 41, 48, ...NOTE(39, 96)]}]});
  const r2 = parseSequence(s2, {abi: "sm64"});
  const t2 = readSmf(toMidi(r2)).tracks[0];
  assert.equal(t2.notes[0].p, 62);
  const c2 = kinds(t2, "bend").map(e => Math.round(bendC(e)));
  assert.ok(c2[0] <= -190 && c2[c2.length - 1] === 0, JSON.stringify(c2));
  assert.equal(kinds(t2, "cc84").length, 0, "one key-on");
});

// ---- Rare ------------------------------------------------------------------
const be32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const varlen = v => { const out = [v & 0x7F]; while ((v >>= 7) > 0) out.unshift((v & 0x7F) | 0x80); return out; };
function cseq(tracks, division = 96) {
  const offsets = [], body = [];
  let at = 0x44;
  for (let i = 0; i < 16; i++) { const t = tracks[i]; if (!t) { offsets.push(0); continue; } offsets.push(at); body.push(...t); at += t.length; }
  return Uint8Array.from([...offsets.flatMap(be32), ...be32(division), ...body]);
}
const tempo = us => [0, 0xFF, 0x51, (us >> 16) & 255, (us >> 8) & 255, us & 255];
const note = (delta, ch, key, vel, dur) => [...varlen(delta), 0x90 | ch, key, vel, ...varlen(dur)];
const cc = (delta, ch, c, v) => [...varlen(delta), 0xB0 | ch, c, v];
const wheel = (delta, v, ch = 0) => { const w = v + 8192; return [...varlen(delta), 0xE0 | ch, w & 0x7F, (w >> 7) & 0x7F]; };
const END = [0, 0xFF, 0x2F];

test("Rare: cc10 is the channel's pan as written (0..127, v1 read it as 0..1 → hard right); cc7 / cc10 / cc91 under a held note land at their ticks; programs at each change", () => {
  // division 96: a quarter = 96. C4 for two quarters; a quarter in: cc7 50, cc10 96, cc91 80; then program 6 and D4
  const t0 = [...tempo(500000), 0, 0xC0, 5, ...cc(0, 0, 7, 100), ...cc(0, 0, 10, 32), ...cc(0, 0, 91, 40), ...note(0, 0, 60, 100, 192),
              ...cc(96, 0, 7, 50), ...cc(0, 0, 10, 96), ...cc(0, 0, 91, 80), 96, 0xC0, 6, ...note(0, 0, 62, 90, 96), ...END];
  const res = cseqNotes(parseCSeq(cseq([t0])));
  assert.deepEqual(res.notes[0].panChanges, [{t: 48, pan: 96}]);
  assert.deepEqual(res.notes[0].revChanges, [{t: 48, rev: 80}]);
  const tr = readSmf(toMidi(res)).tracks[0];
  assert.deepEqual(vals(tr, "cc10"), [[0, 32], [480, 96]]);
  assert.deepEqual(vals(tr, "cc7"), [[0, 100], [480, 50]]);
  assert.deepEqual(vals(tr, "cc91"), [[0, 40], [480, 80]]);
  assert.deepEqual(vals(tr, "program"), [[0, 5], [960, 6]]);
  assert.deepEqual(tr.notes.map(n => [n.t, n.p, n.d, n.v]), [[0, 60, 960, 100], [960, 62, 480, 90]]);
  sameNotes(toMidi(plain(res)), toMidi(res));
});

test("Rare: the wheel inside a note — a semitone step splits it (v1's pieces) and the pieces after the first are glide links; a sub-semitone wobble is bend from each piece's own key; a wheel off-centre at the note-on is bend at its start", () => {
  // range 200 cents: +4096 = +1 semitone, +1024 = +25 cents
  const t0 = [...tempo(500000), 0, 0xC0, 0, ...note(0, 0, 60, 100, 288), ...wheel(48, 1024), ...wheel(48, 4096), ...wheel(96, 4096 + 1024),
              ...wheel(96, -2048), ...note(0, 0, 64, 100, 96), ...END];
  const res = cseqNotes(parseCSeq(cseq([t0])));
  const pieces = splitSlides(res.notes);
  assert.deepEqual(pieces.map(n => [n.tick, n.midi, n.dur]), [[0, 60, 48], [48, 61, 96], [144, 64, 48]]);
  const tr = readSmf(toMidi(res)).tracks[0];
  assert.deepEqual(tr.notes.map(n => [n.t, n.p, n.d]), [[0, 60, 480], [480, 61, 960], [1440, 64, 480]]);
  assert.deepEqual(vals(tr, "cc84"), [[480, 60]], "the landed pitch plays on from the bent note");
  assert.deepEqual(kinds(tr, "bend").map(e => [e.t, Math.round(bendC(e))]), [[240, 25], [480, 0], [960, 25], [1440, -50]],
    "+25 cents, then 0 against C#4, +25 on it, then the next note starts a quarter-tone down (the wheel at its note-on)");
  sameNotes(toMidi(plain(res)), toMidi(res));
});

// ---- envelopes → volume shapes -----------------------------------------------
// a hand-laid sm64 ctl/tbl pair (tests/n64-bank.test.mjs's layout): one instrument whose envelope is `env`
const be16 = v => [(v >> 8) & 255, v & 255];
const f32 = v => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v); return [...new Uint8Array(d.buffer)]; };
function synthBank(env) {
  const body = new Uint8Array(0x100);
  const put = (at, bytes) => body.set(bytes, at);
  put(0x00, be32(0)); put(0x04, be32(0x20));
  put(0x20, [0, 0, 127, 208, ...be32(0xB0), ...be32(0), ...f32(0), ...be32(0x40), ...f32(1.0), ...be32(0), ...f32(0)]);
  put(0x40, [0, 0, 0, 0, ...be32(0), ...be32(0x60), ...be32(0x80), ...be32(36)]);
  put(0x60, [...be32(16), ...be32(64), ...be32(0xFFFFFFFF), ...be32(0), ...new Array(32).fill(0)]);
  put(0x80, [...be32(2), ...be32(1), ...new Array(32).fill(0)]);
  put(0xB0, env.flatMap(([d, v]) => [...be16(d & 0xFFFF), ...be16(v & 0xFFFF)]));
  const entry = Uint8Array.from([...be32(1), ...be32(0), ...be32(1), ...be32(0x19960319), ...body]);
  const frame = [0xB0, ...new Array(8).fill(0x77)];
  const tblData = Uint8Array.from([...frame, ...frame, ...frame, ...frame]);
  const rom = new SparseImage();
  const hdr = (rev, entries) => Uint8Array.from([...be16(rev), ...be16(entries.length), ...entries.flatMap(e => [...be32(e[0]), ...be32(e[1])])]);
  const second = (0x20 + entry.length + 15) & ~15;
  rom.write(0x1000, hdr(1, [[0x20, entry.length], [second, entry.length]]));
  rom.write(0x1020, entry); rom.write(0x1000 + second, entry);
  rom.write(0x3000, hdr(2, [[0x20, tblData.length], [0x20, tblData.length]]));
  rom.write(0x3020, tblData);
  return rom;
}

test("EAD envelopes: the bank's ADSR the note is held under becomes its volume shape (falls included); a flat envelope writes none", () => {
  const B = 48;
  const note = (env) => ({tick: 0, dur: 2 * B, ch: 0, layer: 0, semitone: 39, drum: false, midi: 60, vel: 100, inst: 0, bank: 0, vol: 1, pan: 0.5, freq: 1, chInst: 0});
  const res = {abi: "sm64", gen: "sm64", tempos: [{tick: 0, bpm: 120}], endTick: 2 * B, warnings: [], notes: [note()]};
  // attack in 2 updates, then down to 16000 over 240 updates (1 s), hang
  const falling = noteEnvelopes(res, {rom: synthBank([[2, 32700], [240, 16000], [-1, 0]]), banks: [0]});
  const e = falling.get(res.notes[0]);
  assert.ok(e && e.amp.length === 2 * B, "one level per sequence tick");
  assert.ok(Math.abs(e.peak - (32700 / 32767) ** 2) < 0.01, "the envelope's own top (sm64: level squared)");
  const tr = readSmf(toMidi(res, {envelopes: falling})).tracks[0];
  const shape = kinds(tr, "shape").map(x => [x.t, +x.key.split(":")[2]]);
  assert.ok(shape.length >= 2, JSON.stringify(shape));
  const last = shape[shape.length - 1];
  assert.ok(Math.abs(last[1] - 100 * (16000 / 32700) ** 2) < 4 && last[0] > 800, "falls to (16000/32700)² of the velocity by the note's end: " + JSON.stringify(last));
  assert.ok(shape.every((q, k) => !k || q[1] <= shape[k - 1][1]), "a fall");
  assert.equal(tr.notes[0].v, 100, "the velocity is the note command's");
  const flat = noteEnvelopes(res, {rom: synthBank([[2, 32700], [-1, 0]]), banks: [0]});
  assert.equal(kinds(readSmf(toMidi(res, {envelopes: flat})).tracks[0], "shape").length, 0, "attack within a tick, then held: no shape");
});

test("a continuation (wheel-split piece) does not restart the capture's shape (Rare's n.env, attachVoiceShapes): its velocity is the level the voice has, its shape carries on", () => {
  // the bank's fade as rare.mjs writes it: a straight fall to half by the note's end
  const n = {ch: 0, inst: 0, drum: false, key: 60, semitone: 60, midi: 60, tick: 0, dur: 96, vel: 100, bank: 0, vol: 1, pan: 64, rev: 0, bend: 0, slide: [{t: 48, len: 1, to: 1}], env: [{t: 96, r: 0.5}]};
  const res = {abi: "rare", driver: "rare", tempos: [{tick: 0, bpm: 120}], endTick: 96, warnings: [], notes: [n]};
  assert.equal(noteEnvelopes(res, {}).size, 0, "Rare: no second envelope — the capture's n.env already has it");
  const tr = readSmf(toMidi(res)).tracks[0];
  assert.deepEqual(tr.notes.map(x => [x.t, x.p, x.v]), [[0, 60, 100], [480, 61, 75]], "the head keeps its velocity; the piece starts at 75%");
  assert.deepEqual(vals(tr, "cc84"), [[480, 60]]);
  const sh = kinds(tr, "shape").map(x => [x.t, +x.key.split(":")[1], +x.key.split(":")[2]]);
  assert.ok(sh.some(([t, p, v]) => p === 61 && t > 900 && Math.abs(v - 50) <= 2), "the piece falls on to half: " + JSON.stringify(sh));
});

test("one shape source per note: a note that already carries n.env writes it as is, even when noteEnvelopes has an entry for it", () => {
  const n = {ch: 0, layer: 0, inst: 0, drum: false, semitone: 39, midi: 60, tick: 0, dur: 96, vel: 100, bank: 0, vol: 1, pan: 0.5, freq: 1, env: [{t: 48, r: 0.5}]};
  const res = {abi: "sm64", tempos: [{tick: 0, bpm: 120}], endTick: 96, warnings: [], notes: [n]};
  const amp = new Float32Array(96).fill(0.1);
  const tr = readSmf(toMidi(res, {envelopes: new Map([[n, {amp, peak: 1}]])})).tracks[0];
  assert.deepEqual(kinds(tr, "shape").map(x => [x.t, +x.key.split(":")[2]]), [[480, 50]]);
});

// ---- the app's parser and the publish hop ------------------------------------
test("the app reads it all back — CC7 / CC91 / bends / programs as tr.ctl, links as n.lg — and its writer keeps them through the publish re-encode", async () => {
  const seq = ead({channels: [{setup: [0xC4, 0xC1, 0x05, 0xDF, 0x64, 0xD4, 0x30], layer: [0xC4, ...NOTE(39, 48), ...NOTE(41, 48)],
                               then: [...DELAY(24), 0xD3, 0x10, ...DELAY(24), 0xC1, 0x07, ...DELAY(72)]}]});
  const res = parseSequence(seq, {abi: "sm64"});
  const app = await createApp();
  app.context._v2 = [...toMidi(res)];
  const p = JSON.parse(app.run(`JSON.stringify((() => {
    const a = parseMidi(new Uint8Array(_v2).buffer, {trust: true});
    const b = parseMidi(writeMidi({ppq: a.ppq, timesig: a.timesig, tempos: a.tempos, tracks: a.tracks.map(t => ({...t}))}).buffer, {trust: true});
    return {a, b};
  })())`));
  for (const s of [p.a, p.b]) {
    const tr = s.tracks[0];
    const c = k => tr.ctl.filter(e => e.c === k).map(e => [e.t, e.v]);
    assert.deepEqual(c(7), [[0, 100]]);
    assert.deepEqual(c(91), [[0, 0x30]]);
    assert.deepEqual(c("pg"), [[0, 5], [480, 7]]);
    assert.ok(c("pb").length >= 1 && c("pb")[0][0] === 240, JSON.stringify(c("pb")));
    assert.deepEqual(tr.notes.map(n => !!n.lg), [false, true]);
  }
});

// ---- real rips (guarded: the files must be on disk) ------------------------
const RIPS = process.env.N64_RIPS || "/tmp/recap/rips/n64";
const ripOf = (slug, base) => {
  const dir = join(RIPS, slug), mini = join(dir, base + ".usf");
  if (!existsSync(mini)) return null;
  const libs = readdirSync(dir).filter(n => /\.usflib$/i.test(n));
  return libs.length ? {dir, mini, libs} : null;
};
const SONGS = [["diddy-kong-racing", "title-theme"], ["ocarina-of-time", "gerudo-valley"], ["super-mario-64", "main-theme"]];
const HAVE = SONGS.every(([s, b]) => ripOf(s, b));
test("real rips: Diddy Kong Racing Title Theme, Ocarina of Time Gerudo Valley, Super Mario 64 Main Theme — each feature the rip has is in the .mid, and no note moved", {skip: !HAVE && "rips not on disk (" + RIPS + ")"}, async () => {
  const { loadUSF } = await import("../tools/n64/usf.mjs");
  const { sequenceOfSet } = await import("../tools/n64/capture.mjs");
  const { noteEnvelopes } = await import("../tools/n64/render.mjs");
  const got = {};
  for (const [slug, base] of SONGS) {
    const {dir, mini, libs} = ripOf(slug, base);
    const set = loadUSF([{name: base + ".usf", bytes: new Uint8Array(readFileSync(mini))}, ...libs.map(n => ({name: n, bytes: new Uint8Array(readFileSync(join(dir, n)))}))]);
    const {res, seq} = sequenceOfSet(set);
    const envelopes = noteEnvelopes(res, {set, banks: seq.banks});
    const v2 = readSmf(toMidi(res, {envelopes}));
    const k = {};
    for (const t of v2.tracks) for (const e of t.other) k[e.kind] = (k[e.kind] || 0) + 1;
    got[slug] = k;
    const r = captureDiff(readSmf(toMidi(plain(res))), v2);
    assert.notEqual(r.verdict, "MOVED", slug + ": " + r.reasons.join("; "));
    // the gate: a feature the rip has is never missing from the .mid
    const has = f => res.notes.some(f);
    assert.ok(k.cc7 > 0 && k.program > 0, slug + ": channel level and programs");
    if (has(n => n.rev)) assert.ok(k.cc91 > 0, slug + ": reverb send");
    if (has(n => n.slide || n.vib || n.freqChanges || (n.freq && Math.abs(n.freq - 1) > 1e-3) || n.bendC0)) assert.ok(k.bend > 0, slug + ": bends");
    if (has(n => n.slide && !n.drum)) assert.ok(k.cc84 > 0, slug + ": wheel-split pieces are glide links");
  }
  assert.ok(got["diddy-kong-racing"].cc84 > 100 && got["diddy-kong-racing"].bend > 1000 && got["diddy-kong-racing"].program > 20, JSON.stringify(got["diddy-kong-racing"]));
  assert.ok(got["ocarina-of-time"].bend > 0, "Gerudo Valley's vibrato and channel bends");
  assert.ok(got["super-mario-64"].shape > 0, "Main Theme's decaying envelopes");
});
