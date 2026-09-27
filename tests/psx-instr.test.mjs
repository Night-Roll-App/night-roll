import test from "node:test";
import assert from "node:assert/strict";
import { findInstrDat, readInstr, envelopeAt, INSTR_STRIDE } from "../tools/psx/instr.mjs";

const le32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
function record(addr, adsr, pitch0 = 0x1000) {
  const p = []; for (let i = 0; i < 12; i++) p.push(...le32(Math.round(pitch0 * Math.pow(2, i / 12))));
  return [...le32(addr), ...le32(addr + 16), ...adsr, ...p];
}
const FF7_SUSTAIN = [0x00, 0x0f, 0x0f, 0x7f, 0x05, 0x01, 0x03, 0x03]; // most of FF7's table: sustains while held
const FF7_BELL = [0x00, 0x0f, 0x0f, 0x3b, 0x05, 0x01, 0x03, 0x03];    // instrument 47: falls while held

test("INSTR.DAT is found by shape in a RAM image; empty slots read as null", () => {
  const ram = new Uint8Array(0x10000);
  const at = 0x4000;
  let o = at;
  for (let i = 0; i < 20; i++) { const r = record(0x1000 + i * 0x800, i === 3 ? FF7_BELL : FF7_SUSTAIN); ram.set(r, o); o += INSTR_STRIDE; }
  // a stray plausible-looking single record elsewhere must not win
  ram.set(record(0x2000, FF7_SUSTAIN), 0x100);
  const t = findInstrDat(ram);
  assert.deepEqual(t, {offset: at, count: 20});
  assert.equal(readInstr(ram, at, 3).sr, 0x3b);
  assert.equal(readInstr(ram, at, 25), null, "beyond the data: empty");
  assert.equal(readInstr(ram, at, 0).pitches[0], 0x1000);
});

test("envelope: a sustaining instrument holds its level; a bell (sr 0x3b, exp decrease) is near silent after a few seconds", () => {
  const hold = {ar: 0, dr: 0x0f, sl: 0x0f, sr: 0x7f, rr: 5, am: 1, sm: 3, rm: 3};
  assert.ok(envelopeAt(hold, 10) > 0.99);
  const bell = {...hold, sr: 0x3b};
  const a = envelopeAt(bell, 0.5), b = envelopeAt(bell, 2.5), c = envelopeAt(bell, 8);
  assert.ok(a > 0.5 && a < 0.8, "half a second in: " + a);
  assert.ok(b > 0.05 && b < 0.25, "two and a half seconds: " + b);
  assert.ok(c < 0.01, "eight seconds: " + c);
  const bass = {...hold, sr: 0x40};
  assert.ok(envelopeAt(bass, 2) > 0.4 && envelopeAt(bass, 2) < 0.7, "slower fall: " + envelopeAt(bass, 2));
  assert.equal(envelopeAt(null, 3), 1, "no record: no decay claimed");
});
