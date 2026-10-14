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
import { reconstruct, spcRebin, SPC_SHAPE } from "../tools/spc/notes.mjs";
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
