// PS1 capture v2 (NIGHT-ROLL.md "PS1 capture v2"): what an AKAO capture's
// .mid now carries on top of v1 — glide links (CC84) from the driver's own
// no-key-on rule, slide/portamento paths as pitch bend, in-note level shapes,
// ADSR overrides, program per note, reverb send (CC91), pan fades — with
// every note (track, start, pitch, length) exactly where v1 put it.
// Synthetic scores are our own bytes (tools/psx/make-test-seq.mjs); the
// real-rip test runs only when the FF7 rip itself is on disk.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { makeTestAKAO, makeTestSEQ } from "../tools/psx/make-test-seq.mjs";
import { parseSEQ } from "../tools/psx/seq.mjs";
import { parseAKAO, akaoNotes } from "../tools/psx/akao.mjs";
import { makeMidi, seqNotes } from "../tools/psx/notes.mjs";
import { readSmf, captureDiff } from "../tools/capture-diff.mjs";
import { loadPSFChain, assembleRam } from "../tools/psx/psf.mjs";
import { psfSong } from "../tools/psx/capture.mjs";

const N = (deg, i) => deg * 11 + i, TIE = i => 0x84 + i, REST = i => 0x8F + i; // i: 2 = quarter (48 ticks), 1 = half
const song = (v0, opts = {}) => akaoNotes(parseAKAO(makeTestAKAO({voices: {0: v0, ...(opts.more || {})}})), opts.instr ? {instr: opts.instr} : {});
const OPEN = [0xA5, 0x05, 0xA3, 0x7F, 0xA8, 0x7F]; // octave 5 (C = 60), full volume
// the .mid as v1 wrote it: the same result with the AKAO marker off
const v1Midi = r => makeMidi({...r, source: {...r.source, kind: "akao-v1"}});
const mel = r => r.notes.filter(n => n.ch === 0);
const track = (bytes, i = 0) => readSmf(bytes).tracks[i];
const kinds = (tr, k) => tr.other.filter(e => e.kind === k);
const bendVal = e => +e.key.split(":")[1] - 8192;

test("slur (0xCC): the notes after the first are not keyed on; a rest or 0xCD keys the next one; legato (0xD0) notes re-key", () => {
  const r = song([...OPEN, 0xCC, N(0, 2), N(2, 2), N(4, 2), REST(2), N(5, 2), N(7, 2),
    0xCC, N(0, 2), N(2, 2), 0xCD, N(4, 2),
    N(0, 2), 0xCC, N(2, 2), N(4, 2),
    0xD0, N(0, 2), N(2, 2), 0xA0]);
  assert.deepEqual(mel(r).map(n => !!n.lg), [
    false, true, true, /* rest */ false, false,
    false, true, /* 0xCD: the look-ahead clears before the note */ false,
    /* 0xCC after a note: that note was not under slur */ false, false, true,
    /* 0xD0 sets legato only after the note before it carried the slur over */ true,
    /* legato itself only cancels the early key-off: it re-keys */ false]);
  // in the .mid: CC84 = the key it continues from, just before its note-on
  const tr = track(makeMidi(r), 0);
  const cc84 = kinds(tr, "cc84");
  assert.equal(cc84.length, 5);
  assert.deepEqual(cc84.slice(0, 2).map(e => [e.t, e.key]), [[480, "0:60"], [960, "0:62"]]);
  // notes where v1 had them
  assert.equal(captureDiff(readSmf(v1Midi(r)), readSmf(makeMidi(r))).verdict, "VELOCITY");
});

test("slide (0xA4): the landed pitch is its own note, linked, bending from the old pitch along a straight line in the pitch register", () => {
  const r = song([...OPEN, N(2, 2), 0xA4, 0x03, 0x07, TIE(2), 0xA0]); // D held 96 ticks, +7 over 3 ticks at 48
  const tr = track(makeMidi(r), 0);
  assert.deepEqual(tr.notes.map(n => [n.t, n.d, n.p]), [[0, 480, 62], [480, 480, 69]]);
  assert.equal(kinds(tr, "cc84").length, 1);
  // range: RPN 0 = 7 semitones (the furthest the track bends)
  assert.deepEqual(kinds(tr, "cc6").map(e => e.key), ["0:7"]);
  const b = kinds(tr, "bend").map(e => [e.t, bendVal(e)]);
  assert.equal(b[0][0], 480);
  assert.equal(b[0][1], -8192, "starts at the old pitch: −7 semitones");
  // one tick in: 1/3 of the way in frequency, not in cents (−467 c)
  const cents = 100 * (12 * Math.log2(1 + (2 ** (7 / 12) - 1) / 3) - 7);
  assert.ok(Math.abs(b[1][1] - Math.round(cents / 700 * 8192)) <= 1, `${b[1][1]} vs ${cents} cents`);
  assert.equal(b[b.length - 1][1], 0, "lands on its own key");
  assert.ok(b.every(([t]) => t < 960));
});

test("portamento (0xDA): each note after the first glides from the last one's pitch, linked; the note before a rest steps, and the rest ends it", () => {
  const r = song([...OPEN, 0xDA, 0x06, N(0, 2), N(4, 2), N(7, 2), REST(2), N(9, 2), 0xA0]);
  // G is linked but does not glide: the driver's look-ahead sees the rest
  // and clears the portamento before G's pitch is set
  assert.deepEqual(mel(r).map(n => [!!n.lg, n.porta ? n.porta.from : null]), [[false, null], [true, -4], [true, null], [false, null]]);
  const tr = track(makeMidi(r), 0);
  const b = kinds(tr, "bend").map(e => [e.t, bendVal(e)]);
  assert.equal(b[0][0], 480);
  assert.equal(Math.round(b[0][1] / 8192 * 400), -400, "E starts at C's pitch (range ±4)");
  assert.equal(b.find(([t]) => t === 480 + 60)[1], 0);
});

test("in-note level: an expression fade under a held note becomes the note's shape (poly aftertouch inside it)", () => {
  const r = song([...OPEN, N(0, 2), 0xA9, 0x30, 0x20, TIE(2), 0xA0]); // fade 127 → 32 over 48 ticks from tick 48
  const tr = track(makeMidi(r), 0);
  assert.equal(tr.notes.length, 1);
  const shape = kinds(tr, "shape").map(e => [e.t, +e.key.split(":")[2]]);
  assert.ok(shape.length >= 2, JSON.stringify(shape));
  assert.ok(shape.every(([t]) => t > 0 && t < 960));
  assert.ok(Math.abs(shape[shape.length - 1][1] - 32) <= 2, "ends near the faded level");
  assert.equal(kinds(track(v1Midi(r), 0), "shape").length, 0, "v1 wrote none");
});

// one INSTR.DAT-shaped record (program 0): no decay unless an override says so
function instrRam({dr = 0, sl = 15} = {}) {
  const ram = new Uint8Array(64);
  const dv = new DataView(ram.buffer);
  dv.setUint32(0, 0x1000, true); dv.setUint32(4, 0x1000, true);
  ram.set([0, dr, sl, 127, 0, 0, 0, 0], 8); // ar dr sl sr rr am sm rm
  for (let i = 0; i < 12; i++) dv.setUint32(16 + i * 4, 0x1000, true);
  return {ram, offset: 0};
}
test("ADSR overrides (0xAE/0xAF): the note's end level follows them; 0xB3 and a program change restore the instrument's", () => {
  const r = song([...OPEN, 0xA1, 0x00, N(0, 1), 0xAE, 0x0A, 0xAF, 0x00, N(0, 1), 0xB3, N(0, 1), 0xAE, 0x0A, 0xAF, 0x00, 0xA1, 0x00, N(0, 1), 0xA0], {instr: instrRam()});
  assert.deepEqual(mel(r).map(n => !!n.adsr), [false, true, false, false]);
  const tr = track(makeMidi(r), 0);
  const ve = kinds(tr, "ve").map(e => e.t);
  assert.deepEqual(ve, [960], "only the overridden note decays");
});

test("a continuation keeps the envelope running from the chain's key-on (velocity = the level it has)", () => {
  const r = song([...OPEN, 0xA1, 0x00, 0xAE, 0x08, 0xAF, 0x00, 0xCC, N(0, 1), N(2, 1), 0xA0], {instr: instrRam()});
  const tr = track(makeMidi(r), 0);
  assert.equal(tr.notes[0].v, 127);
  assert.ok(tr.notes[1].v < 127, "the slurred note starts where the decay has got to: " + tr.notes[1].v);
  const fresh = track(makeMidi(song([...OPEN, 0xA1, 0x00, 0xAE, 0x08, 0xAF, 0x00, N(0, 1), N(2, 1), 0xA0], {instr: instrRam()})), 0);
  assert.equal(fresh.notes[1].v, 127, "a re-keyed note starts fresh");
});

test("program per note: the articulation each melodic note plays, only where it changes", () => {
  const r = song([...OPEN, 0xA1, 0x05, N(0, 2), N(2, 2), 0xA1, 0x07, N(4, 2), 0xA0]);
  const tr = track(makeMidi(r), 0);
  assert.deepEqual(kinds(tr, "program").map(e => [e.t, e.key]), [[0, "0:5"], [960, "0:7"]]);
});

test("reverb (0xC2/0xC3 × depth 0xEA): CC91 = the switch × |depth| / 0x7FFF, changing inside a held note", () => {
  const r = song([...OPEN, 0xEA, 0x00, 0x40, 0xC2, N(0, 2), 0xC3, TIE(2), N(2, 2), 0xA0]);
  const tr = track(makeMidi(r), 0);
  assert.deepEqual(kinds(tr, "cc91").map(e => [e.t, e.key]), [[0, "0:64"], [480, "0:0"]]);
  assert.equal(kinds(track(makeMidi(song([...OPEN, N(0, 2), 0xA0])), 0), "cc91").length, 0, "no reverb: no CC91");
});

test("pan fade (0xAB): CC10 along the fade under a held note; the next note-on starts where it got to", () => {
  const r = song([...OPEN, 0xAA, 0x00, N(0, 2), 0xAB, 0x30, 0x7F, TIE(2), N(2, 2), 0xA0]);
  const tr = track(makeMidi(r), 0);
  const pan = kinds(tr, "cc10").map(e => [e.t, +e.key.split(":")[1]]);
  assert.deepEqual(pan[0], [0, 0]);
  assert.ok(pan.length > 10, "a step per value: " + pan.length);
  assert.ok(pan.every(([t], k) => !k || t > pan[k - 1][0]));
  assert.deepEqual(pan[pan.length - 1], [960, 127], "the next note-on, where the fade landed");
  assert.ok(pan.every(([, v], k) => !k || v >= pan[k - 1][1]), "rises");
});

test("unchanged notes: every v2 feature at once moves no note (VELOCITY against the v1 writer); a SEQ capture writes none of it", () => {
  const r = song([...OPEN, 0xEA, 0x00, 0x30, 0xC2, 0xA1, 0x03, 0xCC, N(0, 2), N(2, 2), 0xA4, 0x03, 0x05, TIE(2), REST(2),
    0xDA, 0x04, N(4, 2), N(7, 2), 0xDB, 0xAB, 0x20, 0x60, N(9, 1), 0xA9, 0x10, 0x40, TIE(2), 0xA0]);
  const d = captureDiff(readSmf(v1Midi(r)), readSmf(makeMidi(r)));
  assert.equal(d.verdict, "VELOCITY", d.reasons.join("\n"));
  for (const k of ["cc84", "bend", "cc91", "program", "cc10"]) assert.ok(d.gained[k] > 0, k + " gained");
  // the non-AKAO path (Sony SEQ, and PS2 through it) writes none of it
  const seq = seqNotes(parseSEQ(makeTestSEQ()).sequences[0]);
  const tr = readSmf(makeMidi(seq)).tracks;
  for (const k of ["cc84", "bend", "cc91", "program", "shape"]) assert.equal(tr.reduce((a, t) => a + kinds(t, k).length, 0), 0, k);
});

// ---- real rip: FF7 "You Can Hear the Cry of the Planet" (the ear test) ----
const RIPS = process.env.PS1_RIPS || "/tmp/recap/rips/ps1";
const CRY_DIR = join(RIPS, "final-fantasy-7"), CRY = join(CRY_DIR, "you-can-hear-the-cry-of-the-planet.psf");
const lib = () => existsSync(CRY_DIR) && readdirSync(CRY_DIR).find(f => f.endsWith(".psflib"));
const haveCry = existsSync(CRY) && !!lib();
test("real rip (FF7, Cry of the Planet): the held D's 879 slides are links with bends; reverb and programs present; no note moves", {skip: !haveCry && "FF7 rip not on disk (PS1_RIPS or /tmp/recap/rips/ps1)"}, async () => {
  const libBytes = readFileSync(join(CRY_DIR, lib()));
  const chain = await loadPSFChain(readFileSync(CRY), async () => libBytes, {name: "you-can-hear-the-cry-of-the-planet.psf", inflate: b => inflateSync(b)});
  const {ram, ranges} = assembleRam(chain);
  const r = psfSong(new Uint8Array(ram), ranges, "you-can-hear-the-cry-of-the-planet.psf").result;
  const v2 = readSmf(makeMidi(r)), v1 = readSmf(v1Midi(r));
  const count = k => v2.tracks.reduce((a, tr) => a + kinds(tr, k).length, 0);
  assert.equal(count("cc84"), 879);
  assert.ok(count("bend") > 879, "bend " + count("bend"));
  assert.ok(count("cc91") > 0);
  assert.ok(count("program") > 0);
  assert.equal(captureDiff(v1, v2).verdict, "VELOCITY");
});
