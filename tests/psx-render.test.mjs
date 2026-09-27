// The PlayStation renderer on a synthetic rip: an instrument table found by
// shape, a one-sample bank (a square wave in SPU-ADPCM), one note — the
// channel is named as the MIDI track, sounds while held, and is silent
// after its release.
import test from "node:test";
import assert from "node:assert/strict";
import { INSTR_STRIDE, findInstrDat } from "../tools/psx/instr.mjs";
import { findSampleBank, renderSpu } from "../tools/psx/spu-render.mjs";
import { channelGroups } from "../tools/psx/notes.mjs";

const le32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
function record(addr, loop, adsr) { // 64 bytes: addr, loop, 8 adsr, twelve base pitches (0x1000 for C, semitone steps up)
  const p = []; for (let i = 0; i < 12; i++) p.push(...le32(Math.round(0x1000 * Math.pow(2, i / 12))));
  return [...le32(addr), ...le32(loop), ...adsr, ...p];
}
// SPU-ADPCM: shift 0 filter 0 → sample = nibble << 12; a 28-sample square wave block (7 = +28672, 9 = −28672 sign-extended)
function block(flags, nibbles) { const b = [0x00, flags]; for (let i = 0; i < 28; i += 2) b.push((nibbles[i] & 15) | ((nibbles[i + 1] & 15) << 4)); return b; }
const square = []; for (let i = 0; i < 28; i++) square.push(i < 14 ? 7 : 9);

test("renderSpu: table by shape, bank by end flags, a held note sounds at the track's name and stops after release", async () => {
  const ram = new Uint8Array(0x20000);
  const tableAt = 0x8000, bankAt = 0x10000, spuAddr = 0x1010; // bank base B = bankAt − spuAddr
  for (let i = 0; i < 20; i++) ram.set(record(spuAddr + i * 0x30, spuAddr + i * 0x30, [0, 0x0f, 0x0f, 0x7f, 0x05, 1, 3, 3]), tableAt + i * INSTR_STRIDE);
  for (let i = 0; i < 20; i++) { // each instrument: three looping square blocks back to back, loop start on the first, loop end + repeat on the last
    const o = bankAt + i * 0x30;
    ram.set(block(4, square), o); ram.set(block(0, square), o + 16); ram.set(block(3, square), o + 32);
  }
  const table = findInstrDat(ram);
  assert.deepEqual(table, {offset: tableAt, count: 20});
  const bank = findSampleBank(ram, table);
  assert.ok(bank && bank.base === bankAt - spuAddr, "bank base from the end flags: " + JSON.stringify(bank));
  // one note on channel 4, program 2, key 72 (C5): the sample's own pitch (0x1000 at C, octave 6)
  const seq = {ppq: 48, tempoMap: [{tick: 0, usq: 500000}], timeSigs: [{tick: 0, num: 4, den: 4}], loop: null, warnings: []};
  const result = {notes: [{tick: 0, endTick: 48, ch: 4, key: 72, vel: 100, program: 2, pitch: 72, cents: 0, drum: false, tone: null}], seq};
  assert.equal(channelGroups(result)[0].name, "ch 5 prog 2");
  const r = await renderSpu(result, {ram, table, bank, sampleRate: 22050});
  const buf = r["ch 5 prog 2"];
  assert.ok(buf instanceof Float32Array, "the channel carries the track's name");
  const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += buf[i] * buf[i]; return Math.sqrt(s / (b - a)); };
  assert.ok(rms(1000, 9000) > 0.05, "sounds while held: " + rms(1000, 9000));       // 0.5 s note at 22050 = 11025 samples
  assert.ok(rms(11025 + 4000, 11025 + 8000) < 0.005, "silent after the release: " + rms(15025, 19025));
});
