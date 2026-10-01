// Streamed PS1/PS2 SPU render (docs/streamed-render-plan.md step 1c):
// createSpuStream() must reproduce renderSpu()'s whole-song output
// bit-for-bit at any chunk size, and seek()/snapshot()+restore() must land
// on exactly the state a continuous render would have reached.
//
// The oracle below is a FROZEN copy of the pre-streaming renderSpu() body
// (tools/psx/spu-render.mjs, before this change) — independent of the new
// createSpuStream/renderSpu implementation, so a bug in the new code can't
// hide behind a shared bug. It calls the module's own akaoVoices/vabVoices
// (exported for exactly this purpose) and Envelope, nothing else from the
// new code.
import test from "node:test";
import assert from "node:assert/strict";
import { INSTR_STRIDE, findInstrDat } from "../tools/psx/instr.mjs";
import {
  Envelope, akaoVoices, vabVoices, findSampleBank, createSpuStream, renderSpu,
} from "../tools/psx/spu-render.mjs";
import { channelGroups } from "../tools/psx/notes.mjs";
import { secondsAt } from "../tools/psx/seq.mjs";
import { parseVAB } from "../tools/psx/vab.mjs";
import { sine, encodeAdpcm } from "../tools/psx/make-test-seq.mjs";

// ---- frozen oracle: verbatim pre-streaming renderSpu() -------------------
async function oldRenderSpu(result, opts = {}) {
  const sampleRate = opts.sampleRate || 44100;
  const voicesOf = result.vab ? vabVoices(result, sampleRate) : akaoVoices(result, opts, sampleRate);
  const {notes, seq} = result;
  const groups = channelGroups(result);
  let endTick = seq.loop ? seq.loop.end : 0; for (const n of notes) endTick = Math.max(endTick, n.endTick || n.tick);
  const seconds = Math.min(opts.keepSeconds || Infinity, secondsAt(seq, endTick) + 2.5);
  const N = Math.ceil(seconds * sampleRate);
  const out = {sampleRate, seconds};
  for (const g of groups) {
    const l = new Float32Array(N), r = new Float32Array(N);
    for (const n of g.notes) {
      for (const layer of voicesOf(n)) {
        const {smp, ratio, env: rec} = layer;
        const pan = layer.pan, gL = (127 - pan) / 127, gR = pan / 127;
        const t0 = secondsAt(seq, n.tick), t1 = secondsAt(seq, n.endTick);
        const i0 = Math.floor(t0 * sampleRate), iOff = Math.floor(t1 * sampleRate);
        const toneVol = layer.gain;
        let vol = Math.max(0, Math.min(1, (n.vel || 0) / 127)) * toneVol;
        let ramp = null, ri = 0;
        if (n.gain && n.gain.length > 1) {
          ramp = n.gain.map(g => ({i: Math.floor(secondsAt(seq, n.tick + g.t) * sampleRate), l: g.l * toneVol}));
          vol = ramp[0].l;
        }
        let slide = null, si = 0, step = ratio;
        if (n.slide && n.slide.length) {
          slide = [{i: i0, s: 0}];
          for (const sl of n.slide) {
            const a = Math.floor(secondsAt(seq, n.tick + sl.t) * sampleRate), z = Math.floor(secondsAt(seq, n.tick + sl.t + Math.max(1, sl.len)) * sampleRate);
            slide.push({i: a, s: slide[slide.length - 1].s}); slide.push({i: Math.max(z, a + 1), s: sl.to});
          }
        }
        const env = new Envelope(rec);
        let pos = 0;
        const pcm = smp.pcm, L = pcm.length;
        for (let i = i0; i < N; i++) {
          if (i >= iOff && env.on) env.release();
          const lv = env.next();
          if (!env.on && lv <= 0) break;
          if (pos >= L) { if (smp.oneShot || smp.loopStart == null || smp.loopEnd <= smp.loopStart) break; pos = smp.loopStart + ((pos - smp.loopStart) % (smp.loopEnd - smp.loopStart)); }
          if (ramp) {
            while (ri + 1 < ramp.length && i >= ramp[ri + 1].i) ri++;
            const g = ramp[ri], nx = ramp[ri + 1];
            vol = nx && nx.i > g.i && i < nx.i ? g.l + (nx.l - g.l) * (i - g.i) / (nx.i - g.i) : g.l;
          }
          if (slide) {
            while (si + 1 < slide.length && i >= slide[si + 1].i) si++;
            const g = slide[si], nx = slide[si + 1];
            const semis = nx && nx.i > g.i && i < nx.i ? g.s + (nx.s - g.s) * (i - g.i) / (nx.i - g.i) : g.s;
            step = ratio * Math.pow(2, semis / 12);
          }
          const p0 = Math.floor(pos), f = pos - p0, a = pcm[p0], b = p0 + 1 < L ? pcm[p0 + 1] : (smp.oneShot ? a : pcm[smp.loopStart != null ? smp.loopStart : 0]);
          const v = (a + (b - a) * f) / 32768 * (lv / 0x7FFF) * vol * 0.5;
          l[i] += v * gL; r[i] += v * gR;
          pos += step;
        }
      }
    }
    out[g.name] = {l, r};
  }
  return out;
}

// ---- fixtures --------------------------------------------------------
const le32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
function record(addr, loop, adsr) {
  const p = []; for (let i = 0; i < 12; i++) p.push(...le32(Math.round(0x1000 * Math.pow(2, i / 12))));
  return [...le32(addr), ...le32(loop), ...adsr, ...p];
}
function block(flags, nibbles) { const b = [0x00, flags]; for (let i = 0; i < 28; i += 2) b.push((nibbles[i] & 15) | ((nibbles[i + 1] & 15) << 4)); return b; }
const square = []; for (let i = 0; i < 28; i++) square.push(i < 14 ? 7 : 9);

// table/bank fixture: program 2 = ordinary short release; program 3 = a
// long (~4096-sample at any rate — rr=11, linear/non-exponential release
// steps by a constant -8) release, deliberately landing across the 4095
// chunk-size boundary the task asks for.
function buildAkaoResult() {
  const ram = new Uint8Array(0x20000);
  const tableAt = 0x8000, bankAt = 0x10000, spuAddr = 0x1010;
  const normalAdsr = [0, 0x0f, 0x0f, 0x7f, 0x05, 1, 3, 3];
  const longReleaseAdsr = [0, 0x0f, 0x0f, 0x7f, 11, 1, 3, 0]; // rm=0: linear release
  for (let i = 0; i < 20; i++) {
    const adsr = i === 3 ? longReleaseAdsr : normalAdsr;
    ram.set(record(spuAddr + i * 0x30, spuAddr + i * 0x30, adsr), tableAt + i * INSTR_STRIDE);
  }
  for (let i = 0; i < 20; i++) {
    const o = bankAt + i * 0x30;
    ram.set(block(4, square), o); ram.set(block(0, square), o + 16); ram.set(block(3, square), o + 32);
  }
  const table = findInstrDat(ram);
  const bank = findSampleBank(ram, table);
  const seq = {ppq: 48, tempoMap: [{tick: 0, usq: 500000}], timeSigs: [{tick: 0, num: 4, den: 4}], loop: null, warnings: []};
  const mk = (tick, endTick, ch, key, vel, program, extra = {}) =>
    ({tick, endTick, ch, key, vel, program, pitch: key, cents: 0, drum: false, tone: null, ...extra});
  const notes = [
    mk(0, 96, 0, 72, 100, 2),
    mk(24, 72, 0, 74, 80, 2, {pan: 30}),
    mk(90, 300, 0, 69, 90, 2, {gain: [{t: 0, l: 0.05}, {t: 150, l: 1}]}),
    mk(0, 48, 1, 72, 100, 3),                                  // long linear release
    mk(150, 210, 1, 74, 80, 3, {slide: [{t: 0, len: 10, to: 12}, {t: 30, len: 10, to: 5}]}),
    mk(220, 260, 1, 70, 60, 3, {pan: 100}),
  ];
  return {result: {notes, seq}, opts: {ram, table, bank, sampleRate: 44100}};
}

// VAB fixture: one program, two tones both covering the whole keyboard —
// every note is a genuine 2-layer voice.
function makeLayeredVAB() {
  const vagData = [encodeAdpcm(sine(220, 4000)), encodeAdpcm(sine(440, 4000))];
  const numPrograms = 1, numVags = vagData.length;
  const vh = new Uint8Array(0x820 + numPrograms * 0x200 + 0x200);
  const vb = new Uint8Array(vagData.reduce((n, v) => n + v.length, 0));
  const le16 = (o, v) => { vh[o] = v & 255; vh[o + 1] = (v >> 8) & 255; };
  const le32v = (o, v) => { le16(o, v & 0xFFFF); le16(o + 2, v >>> 16); };
  vh.set([0x70, 0x42, 0x41, 0x56], 0);
  le32v(4, 7); le32v(8, 0); le32v(0x0C, vh.length + vb.length);
  le16(0x10, 0xEEEE); le16(0x12, numPrograms); le16(0x14, 3); le16(0x16, numVags);
  vh[0x18] = 127; vh[0x19] = 64; le32v(0x1C, 0xFFFFFFFF);
  vh[0x20] = 2; vh[0x21] = 127; vh[0x24] = 64; // program 0: 2 tones
  const tone = (t, {vag, pan}) => {
    const o = 0x820 + t * 32;
    vh[o] = 127; vh[o + 2] = 127; vh[o + 3] = pan; vh[o + 4] = 60; vh[o + 5] = 0;
    vh[o + 6] = 0; vh[o + 7] = 127;
    le16(o + 16, 0x80FF); le16(o + 18, 0x5FC0); le16(o + 20, 0); le16(o + 22, vag);
  };
  tone(0, {vag: 1, pan: 40}); tone(1, {vag: 2, pan: 90});
  const table = 0x820 + numPrograms * 0x200;
  let off = 0;
  vagData.forEach((v, i) => { le16(table + (i + 1) * 2, v.length >> 3); vb.set(v, off); off += v.length; });
  const vab = new Uint8Array(vh.length + vb.length);
  vab.set(vh, 0); vab.set(vb, vh.length);
  return vab;
}

function buildVabResult() {
  const vab = parseVAB(makeLayeredVAB());
  const seq = {ppq: 48, tempoMap: [{tick: 0, usq: 500000}], timeSigs: [{tick: 0, num: 4, den: 4}], loop: null, warnings: []};
  const mk = (tick, endTick, ch, key, vel, extra = {}) =>
    ({tick, endTick, ch, key, vel, program: 0, pitch: key, cents: 0, drum: false, tone: null, ...extra});
  const notes = [
    mk(0, 96, 0, 60, 100),
    mk(24, 72, 0, 64, 80, {pan: 30}),
    mk(90, 300, 0, 67, 90, {gain: [{t: 0, l: 0.1}, {t: 120, l: 1}, {t: 210, l: 0.3}]}),
    mk(150, 180, 1, 72, 70, {slide: [{t: 0, len: 10, to: 7}, {t: 15, len: 5, to: -5}]}),
    mk(200, 260, 1, 55, 60, {pan: 100}),
  ];
  return {result: {notes, seq, vab}, opts: {sampleRate: 44100}};
}

// ---- helpers -----------------------------------------------------------
function concatRender(stream, sizes) {
  const out = {sampleRate: stream.sampleRate}; for (const name of stream.tracks) out[name] = {l: new Float32Array(stream.frames), r: new Float32Array(stream.frames)};
  let filled = 0, si = 0;
  while (filled < stream.frames) {
    const want = sizes[si % sizes.length]; si++;
    const n = Math.min(want, stream.frames - filled);
    const chunk = stream.render(n);
    for (const name of stream.tracks) { out[name].l.set(chunk[name].l, filled); out[name].r.set(chunk[name].r, filled); }
    filled += n;
  }
  return out;
}
function assertExact(a, b, msg) {
  assert.equal(a.sampleRate, b.sampleRate, msg + ": sampleRate");
  for (const name of Object.keys(b)) {
    if (!b[name] || !b[name].l) continue;
    assert.deepEqual(Array.from(a[name].l), Array.from(b[name].l), msg + ": " + name + ".l");
    assert.deepEqual(Array.from(a[name].r), Array.from(b[name].r), msg + ": " + name + ".r");
  }
}

for (const [label, build] of [["AKAO/table (two programs, overlaps, long release, slide, gain ramp)", buildAkaoResult], ["VAB (two layered tones per note, two groups)", buildVabResult]]) {
  test(`createSpuStream: ${label} — chunked render equals the frozen whole-song oracle, bit-exact`, async () => {
    const {result, opts} = build();
    const oracle = await oldRenderSpu(result, opts);
    for (const sizes of [[1], [4095], [96000], [1, 4095, 96000], [17, 3, 9001, 1, 512]]) {
      const stream = createSpuStream(result, opts);
      const got = concatRender(stream, sizes);
      assertExact(got, oracle, "sizes " + JSON.stringify(sizes));
    }
    // random chunk sizes
    const stream = createSpuStream(result, opts);
    let seed = 12345; const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const sizes = []; for (let i = 0; i < 40; i++) sizes.push(1 + Math.floor(rand() * 5000));
    assertExact(concatRender(stream, sizes), oracle, "random sizes");
  });

  test(`createSpuStream: ${label} — renderSpu() itself (now stream-over-[0,N)) equals the frozen oracle`, async () => {
    const {result, opts} = build();
    const oracle = await oldRenderSpu(result, opts);
    const got = await renderSpu(result, opts);
    assertExact(got, oracle, "renderSpu");
  });

  test(`createSpuStream: ${label} — restore(snapshot(k)) then render == whole render from k, bit-exact`, async () => {
    const {result, opts} = build();
    const oracle = await oldRenderSpu(result, opts);
    const stream = createSpuStream(result, opts);
    const k = Math.floor(stream.frames * 0.37);
    stream.render(k); // run up to k
    const snap = stream.snapshot();
    const rest = stream.frames - k;
    const after = stream.render(rest); // continuing normally, our reference for "from k"
    const stream2 = createSpuStream(result, opts);
    stream2.render(k); // independent run, to be clobbered then restored
    stream2.render(1234); // diverge it
    stream2.restore(snap);
    const restored = stream2.render(rest);
    for (const name of stream.tracks) {
      assert.deepEqual(Array.from(restored[name].l), Array.from(after[name].l), "restore l: " + name);
      assert.deepEqual(Array.from(restored[name].r), Array.from(after[name].r), "restore r: " + name);
      // and matches the oracle's own tail from k
      assert.deepEqual(Array.from(after[name].l), Array.from(oracle[name].l.subarray(k, k + rest)), "oracle tail l: " + name);
      assert.deepEqual(Array.from(after[name].r), Array.from(oracle[name].r.subarray(k, k + rest)), "oracle tail r: " + name);
    }
  });

  test(`createSpuStream: ${label} — seek(k) then render == whole render from k, bit-exact`, async () => {
    const {result, opts} = build();
    const oracle = await oldRenderSpu(result, opts);
    for (const frac of [0.05, 0.37, 0.6, 0.9]) {
      const stream = createSpuStream(result, opts);
      const k = Math.floor(stream.frames * frac);
      stream.seek(k);
      const rest = stream.frames - k;
      const got = stream.render(rest);
      for (const name of stream.tracks) {
        assert.deepEqual(Array.from(got[name].l), Array.from(oracle[name].l.subarray(k, k + rest)), `seek ${frac} l: ${name}`);
        assert.deepEqual(Array.from(got[name].r), Array.from(oracle[name].r.subarray(k, k + rest)), `seek ${frac} r: ${name}`);
      }
    }
  });
}

test("createSpuStream: seek past every note's liveness bound returns pure silence (the optimization's skip path is exercised, not just its fallback)", async () => {
  const {result, opts} = buildAkaoResult();
  const stream = createSpuStream(result, opts);
  stream.seek(stream.frames - 10);
  const tail = stream.render(10);
  for (const name of stream.tracks) {
    for (const v of tail[name].l) assert.equal(v, 0);
    for (const v of tail[name].r) assert.equal(v, 0);
  }
});
