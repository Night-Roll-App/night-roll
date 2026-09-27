// Builds a tiny synthetic VGM (v1.50, our own bytes — no copyrighted data):
// FM channel 1 plays C4 E4 G4 C5 as keyed quarter notes at 120bpm over a
// PSG channel 1 C3 pedal; one noise hit under the third note and one DAC
// burst under the fourth; a GD3 tag and a loop point after the setup wait.
// Exercises the 0xA4 latch, both wait families, data blocks + 0xE0 + 0x8n,
// so the whole pipeline can be tested end-to-end.
import { YM2612_NTSC, SN76489_NTSC } from "./vgm.mjs";

export const TEST_NOTES = [ // [block, fnum] — C4 E4 G4 C5 at the NTSC clock (RESEARCH.md §2)
  [4, 644], [4, 811], [4, 965], [5, 644],
];
export const TEST_TIMING = {setup: 1470, hold: 20580, gap: 1470, tail: 735 + 16};
export const TEST_PSG_PERIOD = 855; // C3
export const TEST_TL = {op1: 0x20, op2: 8, op3: 0x20, op4: 16}; // alg 4: op2 + op4 carry
export const TEST_DAC_PEAK = 100;

export function makeTestVGM() {
  const data = [];
  const ym = (addr, value) => data.push(0x52, addr, value);
  const psg = value => data.push(0x50, value);
  const wait = n => data.push(0x61, n & 0xFF, (n >> 8) & 0xFF);
  const {setup, hold, gap} = TEST_TIMING;

  // ---- DAC bank: 64 samples of a decaying sine, peak ±100 around 0x80
  const pcm = [];
  for (let i = 0; i < 64; i++) pcm.push(0x80 + Math.round(TEST_DAC_PEAK * Math.sin(2 * Math.PI * i / 16) * (1 - i / 64)));
  data.push(0x67, 0x66, 0x00, pcm.length & 0xFF, (pcm.length >> 8) & 0xFF, 0, 0, ...pcm);

  // ---- setup: channel 1 voice, PSG pedal, noise armed but silent
  ym(0x2B, 0x00); ym(0x27, 0x00); ym(0x28, 0x00);
  ym(0xB0, (3 << 3) | 4); // feedback 3, algorithm 4
  ym(0xB4, 0xC0);
  for (const slot of [0, 4, 8, 12]) { ym(0x30 + slot, 0x01); ym(0x50 + slot, 0x1F); ym(0x80 + slot, 0x0F); }
  ym(0x40, TEST_TL.op1); ym(0x44, TEST_TL.op3); ym(0x48, TEST_TL.op2); ym(0x4C, TEST_TL.op4); // bus slot order op1 op3 op2 op4
  psg(0x80 | (TEST_PSG_PERIOD & 0x0F)); psg(TEST_PSG_PERIOD >> 4); // tone 1 latch + data
  psg(0x90);                                                         // tone 1 attenuation 0
  psg(0xE4); psg(0xFF);                                              // noise: white, rate 0; off
  wait(setup);

  const loopPos = data.length; // the loop returns here, after the setup wait
  TEST_NOTES.forEach(([block, fnum], k) => {
    ym(0xA4, (block << 3) | (fnum >> 8)); // latch first...
    ym(0xA0, fnum & 0xFF);                 // ...low byte commits
    ym(0x28, 0xF0);                        // all four slots, channel 1
    if (k === 2) {                         // noise hit with a 3-step software decay
      psg(0xF0); wait(2205); psg(0xF4); wait(2205); psg(0xF8); wait(2205); psg(0xFF);
      wait(hold - 3 * 2205);
    } else if (k === 3) {                  // DAC burst: enable, seek, 64 writes with wait 5
      ym(0x2B, 0x80); data.push(0xE0, 0, 0, 0, 0);
      for (let i = 0; i < pcm.length; i++) data.push(0x85);
      ym(0x2B, 0x00);
      wait(hold - pcm.length * 5);
    } else wait(hold);
    ym(0x28, 0x00);
    wait(gap);
  });
  psg(0x9F);               // pedal off
  data.push(0x62, 0x7F);   // 735 + 16 samples via the short wait forms
  data.push(0x66);

  const loopSamples = TEST_TIMING.hold * 4 + TEST_TIMING.gap * 4 + TEST_TIMING.tail;
  const totalSamples = setup + loopSamples;

  // ---- GD3
  const gd3Fields = ["Night Roll test tune", "", "Night Roll", "", "Sega Mega Drive / Genesis", "",
                     "synthetic", "", "2026", "tools/vgm/make-test-vgm.mjs", ""];
  const gd3Body = [];
  for (const s of gd3Fields) { for (const c of s) gd3Body.push(c.charCodeAt(0) & 0xFF, c.charCodeAt(0) >> 8); gd3Body.push(0, 0); }
  const gd3 = [0x47, 0x64, 0x33, 0x20, 0x00, 0x01, 0x00, 0x00,
               gd3Body.length & 0xFF, (gd3Body.length >> 8) & 0xFF, 0, 0, ...gd3Body];

  // ---- header (0x40 bytes, v1.50, data at 0x40)
  const HEADER = 0x40;
  const out = new Uint8Array(HEADER + data.length + gd3.length);
  const dv = new DataView(out.buffer);
  out.set([0x56, 0x67, 0x6D, 0x20], 0);                       // "Vgm "
  dv.setUint32(0x04, out.length - 4, true);                   // EOF offset
  dv.setUint32(0x08, 0x00000150, true);                       // version
  dv.setUint32(0x0C, SN76489_NTSC, true);
  dv.setUint32(0x14, HEADER + data.length - 0x14, true);      // GD3 offset
  dv.setUint32(0x18, totalSamples, true);
  dv.setUint32(0x1C, HEADER + loopPos - 0x1C, true);          // loop offset
  dv.setUint32(0x20, loopSamples, true);
  dv.setUint32(0x24, 60, true);
  dv.setUint16(0x28, 0x0009, true); out[0x2A] = 16;
  dv.setUint32(0x2C, YM2612_NTSC, true);
  dv.setUint32(0x34, HEADER - 0x34, true);                    // data offset
  out.set(data, HEADER);
  out.set(gd3, HEADER + data.length);
  return out;
}
