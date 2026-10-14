// A REAL SNES rip through the capture pipeline (SPC700 emulation -> reconstruct
// -> the app's rebin -> makeMidi -> the app's parser): FF5 "The Battle", whose
// drums were pitched G4/C5/D#3 notes (Josh #415/#426). Skipped when the rip is
// absent: it is fetched (size- and magic-checked) by tools/recapture.mjs into
// /tmp/recap/rips/snes/, or point SPC_RIPS at a folder holding
// final-fantasy-5/the-battle.spc. spc-real.test.mjs stays "no emulation".
// Run: node tools/run-tests.mjs spc-rip
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseSPC, runSPC } from "../tools/spc/spc.mjs";
import { reconstruct, spcRebin, SPC_SHAPE, SAMPLE_RATE } from "../tools/spc/notes.mjs";
import { makeMidi } from "../tools/nsf/midi-write.mjs";
import { readSmf } from "../tools/capture-diff.mjs";
import { createApp } from "./harness.mjs";

const RIPS = process.env.SPC_RIPS || "/tmp/recap/rips/snes";
const rip = RIPS + "/final-fantasy-5/the-battle.spc";
const skip = existsSync(rip) ? false : "no rip at " + rip;

test("FF5 The Battle: voice5/voice7 are kits on channel 10 with GM keys, the melodic voices stay put", {skip, timeout: 120000}, async () => {
  const spc = parseSPC(readFileSync(rip));
  const r = reconstruct(runSPC(spc, spc.tags.seconds || 63), {});
  const k = 5;
  const bytes = makeMidi(spcRebin(r.events, k), {bpm: 120, frameSec: r.frameSec * k, snap: true, volMax: 127, shape: SPC_SHAPE});
  const app = await createApp();
  app.context._b = [...bytes];
  const song = JSON.parse(app.run(`JSON.stringify(parseMidi(new Uint8Array(_b).buffer, {trust: true}))`));
  const tr = n => song.tracks.find(t => t.name === n);
  for (const n of ["voice5", "voice7"]) {
    assert.equal(tr(n).kit, true, n + " kit:1");
    assert.ok(tr(n).notes.every(x => x.p >= 35 && x.p <= 81), n + " keys are GM percussion");
    assert.ok(!tr(n).notes.some(x => [51, 67, 72].includes(x.p) && !Object.keys(tr(n).kitFrom).includes(String(x.p))), n + ": no captured key left");
    assert.ok(Object.values(tr(n).kitFrom).some(c => [51, 67, 72].includes(c)), n + " kitmap names the captured keys: " + JSON.stringify(tr(n).kitFrom));
  }
  const gms = [...tr("voice5").notes, ...tr("voice7").notes].map(x => x.p);
  assert.ok(new Set([...Object.keys(tr("voice5").kitFrom), ...Object.keys(tr("voice7").kitFrom)]).size === 4, "four kit sounds, four distinct keys");
  for (const n of ["voice6", "voice0", "voice1"]) assert.ok(!tr(n).kit, n + " stays melodic");
  assert.ok(gms.length > 400);
  // track numbers: the published file (old or re-captured) has the same voice order
  const pub = readSmf(readFileSync(new URL("../albums/snes/final-fantasy-5/the-battle.mid", import.meta.url)));
  assert.deepEqual(song.tracks.map(t => t.name), pub.tracks.map(t => t.name), "no track number moved");
});

// Q20: SNES phantom notes. Mega Man X "Armored Armadillo": the driver preloads
// the next PITCH while a voice fades on GAIN; the capture used to open a note
// for each (7,082 notes, 2,406 of them legato splits under 10 ms). Songs with
// no phantoms keep every note (counts taken before the fix, unchanged by it).
const notesOf = f => { const spc = parseSPC(readFileSync(RIPS + "/" + f)); return reconstruct(runSPC(spc, spc.tags.seconds || 63), {}).events; };
const have = f => existsSync(RIPS + "/" + f) ? false : "no rip at " + RIPS + "/" + f;
test("MMX Armored Armadillo: the phantom legato splits are gone", {skip: have("mega-man-x/armored-armadillo.spc"), timeout: 120000}, () => {
  const ev = notesOf("mega-man-x/armored-armadillo.spc");
  const phantoms = ev.filter(e => e.legato && (e.endSample - e.startSample) / SAMPLE_RATE < 0.01);
  assert.ok(phantoms.length < 50, "legato notes under 10 ms: " + phantoms.length + " (was 2406)");
  assert.ok(ev.length < 5000 && ev.length > 4000, "notes: " + ev.length + " (was 7082)");
});
for (const [f, n] of [["chrono-trigger/a-shot-of-crisis.spc", 3289], ["donkey-kong-country/aquatic-ambiance.spc", 2851], ["final-fantasy-5/the-battle.spc", 1659]])
  test("no phantoms, nothing removed: " + f, {skip: have(f), timeout: 120000}, () => assert.equal(notesOf(f).length, n));

// Q27: FF5 "The Battle" voice 6 sample 35 plays one key 11 times on a held sound (median 1.3 s) — a pedal tone. It stays pitched,
// while the same song's one-key drum samples (voice 5 s38/s39, voice 7 s36/s37) are kit.
test("pedal tone, real rip: FF5 The Battle voice6 s35 is not a kit; voices 5 and 7 are", {skip, timeout: 120000}, () => {
  const spc = parseSPC(readFileSync(rip));
  const ev = reconstruct(runSPC(spc, spc.tags.seconds || 63), {}).events;
  const grp = (v, s) => ev.filter(e => e.voice === v && e.srcn === s && e.noiseClock === undefined);
  const pedal = grp(6, 35);
  assert.ok(pedal.length >= 8 && new Set(pedal.map(e => e.midi)).size === 1, "one key, many hits: " + pedal.length);
  assert.ok(pedal.every(e => !e.kit && !e.unpitched), "pitched, not kit");
  for (const [v, s] of [[5, 38], [5, 39], [7, 36], [7, 37]]) assert.ok(grp(v, s).length && grp(v, s).every(e => e.kit), `voice${v} s${s} still kit`);
});
