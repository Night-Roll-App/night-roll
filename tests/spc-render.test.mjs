// The S-DSP renderer (tools/spc/apu-render.mjs) against the synthetic SPC
// and hand-built captures — no copyrighted data. What is checked is SOUND:
// the frequency each quarter sings, that the release tail decays, that the
// other voices stay silent, that resampling keeps the pitch; plus the two
// chip tables on known bytes (Gaussian interpolation, noise LFSR).
// Run: perl -e 'alarm 120; exec @ARGV' node --test tests/spc-render.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { makeTestSPC, TEST_MELODY_MIDI } from "../tools/spc/make-test-spc.mjs";
import { parseSPC, runSPC } from "../tools/spc/spc.mjs";
import { encodeBRR } from "../tools/spc/brr.mjs";
import { renderApu, GAUSS, gaussInterp, noiseStep, NOISE_SEED, DSP_RATE } from "../tools/spc/apu-render.mjs";

const hz = m => 440 * 2 ** ((m - 69) / 12);
// dominant frequency by zero crossings over [a, b) seconds (a sine's crossings = 2 per period)
const zcHz = (buf, sr, a, b) => {
  let n = 0;
  for (let i = Math.floor(a * sr) + 1; i < Math.floor(b * sr); i++) if ((buf[i - 1] < 0) !== (buf[i] < 0)) n++;
  return n / 2 / (b - a);
};
const rms = (buf, sr, a, b) => {
  let e = 0, n = 0;
  for (let i = Math.floor(a * sr); i < Math.min(buf.length, Math.floor(b * sr)); i++) { e += buf[i] * buf[i]; n++; }
  return n ? Math.sqrt(e / n) : 0;
};
const peak = buf => { let m = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; } return m; };

test("Gaussian interpolation: the 512-entry table and the chip's arithmetic on known inputs", () => {
  assert.equal(GAUSS.length, 512);
  assert.equal(GAUSS[0], 0); assert.equal(GAUSS[511], 0x519);
  for (let i = 1; i < 512; i++) assert.ok(GAUSS[i] >= GAUSS[i - 1], "monotonic at " + i);
  for (let f = 0; f < 256; f++) { // the four weights of any fraction sum to the unity gain (2048), ±1
    const sum = GAUSS[255 - f] + GAUSS[511 - f] + GAUSS[256 + f] + GAUSS[f];
    assert.ok(sum >= 2047 && sum <= 2049, "weights at f=" + f + " sum to " + sum);
  }
  // an impulse on the newest sample comes out weighted by GAUSS[f] alone (×0x4000 >> 11 = ×8)
  for (const f of [0, 1, 77, 128, 200, 255]) assert.equal(gaussInterp(0, 0, 0, 0x4000, f), (GAUSS[f] * 8) & ~1);
  // DC 4096 at f = 0: (370 + 1305 + 374) × 4096 >> 11 = 4098, low bit clear
  assert.equal(gaussInterp(4096, 4096, 4096, 4096, 0), 4098);
  // at f = 0 the weight sits on the second sample; at f = 255 it has moved to the third
  assert.ok(gaussInterp(0, 10000, 0, 0, 0) > gaussInterp(0, 0, 10000, 0, 0));
  assert.ok(gaussInterp(0, 0, 10000, 0, 255) > gaussInterp(0, 10000, 0, 0, 255));
  // the chip's overflow quirk: at f = 0 the weights sum to 2049, so four
  // full-scale positives wrap negative after the third term (this is on
  // hardware too — blargg and Anomie both note it); at f = 128 they sum to
  // 2048 and the result clamps cleanly
  assert.ok(gaussInterp(32767, 32767, 32767, 32767, 0) < 0, "int16 wrap after the third term");
  const full = ((GAUSS[127] * 32767) >> 11) + ((GAUSS[383] * 32767) >> 11) + ((GAUSS[384] * 32767) >> 11) + ((GAUSS[128] * 32767) >> 11);
  assert.equal(gaussInterp(32767, 32767, 32767, 32767, 128), full & ~1);
  assert.equal(gaussInterp(-32768, -32768, -32768, -32768, 128), -32768);
});

test("noise LFSR: seed $4000, bit 14 = bit 0 xor bit 1, full 32767-step period", () => {
  assert.equal(NOISE_SEED, 0x4000);
  let n = NOISE_SEED;
  const first = [];
  for (let i = 0; i < 16; i++) { n = noiseStep(n); first.push(n); }
  // 13 plain right shifts, then bit 1 feeds back: $0002 -> $4001 -> $6000
  assert.deepEqual(first.slice(0, 13).map(x => x.toString(16)), ["2000", "1000", "800", "400", "200", "100", "80", "40", "20", "10", "8", "4", "2"]);
  assert.equal(first[13], 0x4001); assert.equal(first[14], 0x6000); assert.equal(first[15], 0x3000);
  n = NOISE_SEED;
  let period = 0;
  do { n = noiseStep(n); period++; } while (n !== NOISE_SEED && period <= 40000);
  assert.equal(period, 32767, "maximal 15-bit sequence");
  assert.equal(noiseStep(0), 0, "zero is the stuck state the seed avoids");
});

test("synthetic tune: voice 0 sings C4 E4 G4 C5, releases in 8 ms; voices 1-7 silent; length and 48 kHz pitch hold", async () => {
  const spc = parseSPC(makeTestSPC());
  const cap = runSPC(spc, 2.2);
  const progress = [];
  const r = await renderApu(cap, {sampleRate: 44100, onProgress: p => progress.push(p)});
  assert.equal(r.sampleRate, 44100);
  assert.equal(r.seconds, cap.seconds);
  assert.ok(Math.abs(r.voice0.length - r.seconds * 44100) <= 1, "length " + r.voice0.length + " vs " + r.seconds * 44100);
  for (let v = 1; v < 8; v++) assert.equal(r["voice" + v].length, r.voice0.length);
  assert.ok(progress.length >= 1 && progress[progress.length - 1] === 1, "onProgress ends at 1");
  const t0 = cap.dspLog.find(w => w.addr === 0x4C).sample / DSP_RATE; // the first KON (quarters every 0.5 s from here)
  assert.ok(peak(r.voice0) > 0.1, "voice 0 is audible");
  for (let v = 1; v < 8; v++) assert.equal(peak(r["voice" + v]), 0, "voice " + v + " never keyed on");
  for (let q = 0; q < 4; q++) {
    const a = t0 + q * 0.5, want = hz(TEST_MELODY_MIDI[q]);
    const got = zcHz(r.voice0, 44100, a + 0.1, a + 0.4);
    assert.ok(Math.abs(got / want - 1) < 0.03, `quarter ${q}: ${got.toFixed(1)} Hz vs ${want.toFixed(1)}`);
    const mid = rms(r.voice0, 44100, a + 0.1, a + 0.4), tail = rms(r.voice0, 44100, a + 0.481, a + 0.498);
    assert.ok(mid > 0.1, "sustain level " + mid);
    assert.ok(tail < 1e-3, `quarter ${q}: KOFF at 468.75 ms + 8 ms release leaves silence, got RMS ${tail}`);
    // the release is a ramp, not a cut: energy between KOFF and silence sits between the two
    const rel = rms(r.voice0, 44100, a + 0.469, a + 0.477);
    assert.ok(rel > tail && rel < mid, "release ramp " + rel);
  }
  // resampling: the same capture at 48 kHz and at the chip's own 32 kHz says the same pitch
  const r48 = await renderApu(cap, {sampleRate: 48000});
  const r32 = await renderApu(cap, {sampleRate: 32000});
  assert.ok(Math.abs(r48.voice0.length - r.seconds * 48000) <= 1);
  assert.equal(r32.voice0.length, cap.samples);
  for (let q = 0; q < 4; q++) {
    const a = t0 + q * 0.5, want = hz(TEST_MELODY_MIDI[q]);
    assert.ok(Math.abs(zcHz(r48.voice0, 48000, a + 0.1, a + 0.4) / want - 1) < 0.03, "48 kHz quarter " + q);
    assert.ok(Math.abs(zcHz(r32.voice0, 32000, a + 0.1, a + 0.4) / want - 1) < 0.03, "32 kHz quarter " + q);
  }
  // keepSamples trims the render
  const short = await renderApu(cap, {sampleRate: 44100, keepSamples: 32000});
  assert.equal(short.seconds, 1);
  assert.equal(short.voice0.length, 44100);
});

// A capture built by hand (no CPU): RAM with a directory and one looped
// sine, the dumped registers, and a write log — the renderer's input
// contract, exercised for the paths the synthetic tune does not take.
function handCapture(setup, log, samples) {
  const ram = new Uint8Array(0x10000);
  const sine = new Int16Array(64);
  for (let i = 0; i < 64; i++) sine[i] = Math.round(12000 * Math.sin(2 * Math.PI * i / 64));
  ram.set(encodeBRR(sine, {loopStart: 0}), 0x1000);
  ram[0x200] = 0x00; ram[0x201] = 0x10; ram[0x202] = 0x00; ram[0x203] = 0x10; // directory: sample 0 at $1000, loops to itself
  const dsp0 = new Uint8Array(128);
  dsp0[0x5D] = 0x02; dsp0[0x0C] = 0x7F; dsp0[0x1C] = 0x7F; dsp0[0x6C] = 0x20;
  for (let v = 0; v < 8; v++) { dsp0[v * 16] = 0x7F; dsp0[v * 16 + 1] = 0x7F; dsp0[v * 16 + 2] = 0x00; dsp0[v * 16 + 3] = 0x10; dsp0[v * 16 + 7] = 0x7F; } // VOL max, PITCH $1000, GAIN direct full
  setup(dsp0, ram);
  const dspLog = log.map((w, i) => ({cycle: w.sample * 32, sample: w.sample, addr: w.addr, value: w.value, order: i}));
  return {dspLog, dsp0, ram, samples, seconds: samples / DSP_RATE, sampleRate: DSP_RATE, instruments: new Map(), voiceInstruments: [], halted: false};
}

test("hand-built captures: NON plays the LFSR, PMON bends the pitch, VOL/MVOL scale, mute and KOFF silence", async () => {
  // voice 0 a plain 500 Hz sine at full VOL/MVOL: level = 12000/32768 × (GAIN $7F → env $7F0/$800)
  let r = await renderApu(handCapture(() => {}, [{sample: 0, addr: 0x4C, value: 0x01}], 16000), {sampleRate: 32000});
  assert.ok(Math.abs(zcHz(r.voice0, 32000, 0.1, 0.4) - 500) < 5, "500 Hz root at PITCH $1000");
  const full = peak(r.voice0);
  assert.ok(full > 0.33 && full < 0.38, "full scale ≈ 12000/32768, got " + full);
  // half VOL on both sides halves it; MVOL zero silences; VOL L only = half after the mono fold
  r = await renderApu(handCapture(d => { d[0] = 0x40; d[1] = 0x40; }, [{sample: 0, addr: 0x4C, value: 0x01}], 16000), {sampleRate: 32000});
  assert.ok(Math.abs(peak(r.voice0) / full - 0.5) < 0.03, "VOL $40 → half");
  r = await renderApu(handCapture(d => { d[1] = 0; }, [{sample: 0, addr: 0x4C, value: 0x01}], 16000), {sampleRate: 32000});
  assert.ok(Math.abs(peak(r.voice0) / full - 0.5) < 0.03, "hard-left → half in mono");
  r = await renderApu(handCapture(d => { d[0x0C] = 0; d[0x1C] = 0; }, [{sample: 0, addr: 0x4C, value: 0x01}], 16000), {sampleRate: 32000});
  assert.equal(peak(r.voice0), 0, "MVOL 0");
  // FLG mute bit
  r = await renderApu(handCapture(d => { d[0x6C] = 0x60; }, [{sample: 0, addr: 0x4C, value: 0x01}], 16000), {sampleRate: 32000});
  assert.equal(peak(r.voice0), 0, "FLG mute");
  // KOFF at 0.25 s: silent within 8 ms
  r = await renderApu(handCapture(() => {}, [{sample: 0, addr: 0x4C, value: 0x01}, {sample: 8000, addr: 0x5C, value: 0x01}], 16000), {sampleRate: 32000});
  assert.ok(rms(r.voice0, 32000, 0.1, 0.2) > 0.2);
  assert.equal(rms(r.voice0, 32000, 0.26, 0.5), 0, "released");
  // NON on voice 1 at clock 31 (every sample): broadband, no periodicity at the sample's 500 Hz
  r = await renderApu(handCapture(d => { d[0x3D] = 0x02; d[0x6C] = 0x3F; }, [{sample: 0, addr: 0x4C, value: 0x02}], 16000), {sampleRate: 32000});
  assert.ok(rms(r.voice1, 32000, 0, 0.5) > 0.1, "noise is loud");
  const crossings = zcHz(r.voice1, 32000, 0, 0.5);
  assert.ok(crossings > 4000, "white-ish: thousands of crossings per second, got " + crossings);
  assert.equal(peak(r.voice0), 0, "voice 0 not keyed");
  // the noise clock: rate 20 (period 24 samples) holds each value 24 samples → far fewer crossings
  r = await renderApu(handCapture(d => { d[0x3D] = 0x02; d[0x6C] = 0x20 | 20; }, [{sample: 0, addr: 0x4C, value: 0x02}], 16000), {sampleRate: 32000});
  assert.ok(zcHz(r.voice1, 32000, 0, 0.5) < 1000, "slow noise clock");
  // PMON: voice 1 modulated by voice 0 (a 500 Hz sine at full level) — its pitch swings, so its
  // zero-crossing rate stays near 500 Hz on average but the waveform is no longer the clean sine
  // (spectral spread shows as a lower correlation with a 500 Hz reference than the unmodulated voice)
  const corr = (buf, f, sr, a, b) => {
    let c = 0, e = 0;
    for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) { c += buf[i] * Math.sin(2 * Math.PI * f * i / sr); e += buf[i] * buf[i]; }
    return Math.abs(c) / Math.sqrt(e * (Math.floor(b * sr) - Math.floor(a * sr)) / 2);
  };
  const plain = await renderApu(handCapture(() => {}, [{sample: 0, addr: 0x4C, value: 0x03}], 16000), {sampleRate: 32000});
  const pm = await renderApu(handCapture(d => { d[0x2D] = 0x02; }, [{sample: 0, addr: 0x4C, value: 0x03}], 16000), {sampleRate: 32000});
  assert.ok(peak(pm.voice1) > 0.2, "modulated voice still sounds");
  const same = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  assert.ok(same(plain.voice0, pm.voice0), "the carrier is untouched");
  assert.ok(!same(plain.voice1, pm.voice1), "the modulated voice differs");
  const c0 = corr(plain.voice1, 500, 32000, 0.1, 0.4), c1 = corr(pm.voice1, 500, 32000, 0.1, 0.4);
  assert.ok(c1 < c0 * 0.9, `PMON spreads the spectrum: ${c1.toFixed(3)} vs plain ${c0.toFixed(3)}`);
  // PMON bit 0 is ignored: voice 0 cannot be modulated
  const pm0 = await renderApu(handCapture(d => { d[0x2D] = 0x01; }, [{sample: 0, addr: 0x4C, value: 0x01}], 16000), {sampleRate: 32000});
  assert.ok(same(pm0.voice0, plain.voice0));
});

test("60 s of the synthetic tune renders in under 3 s", async () => {
  const cap = runSPC(parseSPC(makeTestSPC()), 60);
  const t = performance.now();
  const r = await renderApu(cap, {sampleRate: 44100});
  const ms = performance.now() - t;
  assert.ok(Math.abs(r.voice0.length - 60 * 44100) <= 1);
  assert.ok(ms < 3000, "took " + ms.toFixed(0) + " ms");
});
