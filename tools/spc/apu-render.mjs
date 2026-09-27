// S-DSP sample renderer: the captured DSP write log (the same dspLog the
// note reconstructor reads) played through the SNES sound chip's own voice
// pipeline — BRR streaming with loop/END, the chip's 4-point Gaussian
// interpolation (its 512-entry ROM table, embedded below: the low-pass
// roll-off that is most of "the SNES sound"), 14-bit PITCH with pitch
// modulation from the previous voice, ADSR/GAIN envelopes at 32 kHz, the
// 15-bit noise LFSR, per-voice VOL and main MVOL. Third in the family of
// tools/nsf/apu-render.mjs and tools/gbs/apu-render.mjs: the chip's own
// sound, not sample players approximating it.
//
// renderApu(capture, {sampleRate, onProgress, keepSamples})
//   -> {voice0..voice7: Float32Array, sampleRate, seconds}
// capture is runSPC/runSPCAsync's result. Per-voice mono buffers (L and R
// folded, MVOL applied) so the app's mute/solo gain nodes keep working;
// rendered at the chip's 32 kHz, then linearly resampled to sampleRate.
//
// Faithful (per blargg's SPC_DSP.cpp, Anomie's S-DSP doc, fullsnes — see
// RESEARCH.md §3 and §6): BRR decode arithmetic (brr.mjs), the Gaussian
// table and its >>11 / int16-wrap / clamp / &~1 arithmetic, envelope step
// rules and rate periods (dsp-state.mjs), KOFF release, END/LOOP handling,
// the noise LFSR and its rate clock, PMON's (OUTX >> 5) × pitch >> 10 term,
// VOL/MVOL >> 7 scaling with 16-bit clamps, FLG mute and soft reset.
// Approximate, on purpose: KON acts on the sample of its write (the chip
// polls KON every 2 samples and starts BRR decoding 5 samples later);
// envelope rate counters run per voice from KON, not from the chip's
// shared phase counter (dsp-state.mjs's documented ≤ one-period skew);
// a one-shot's envelope is zeroed when its END block finishes rather than
// when the chip pre-reads that block's header (~12 samples earlier); the
// resampler is linear; per-voice buffers cannot reproduce clipping of the
// SUMMED main output (each voice clamps on its own). Not done: the echo
// path (EDL/EFB/FIR ring buffer, EVOL) — hook marked below; the dry signal
// of echo-enabled voices is present, the wet return is not.
// BRR data comes from the END-of-capture RAM (what runSPC returns): a
// driver that streams or rewrites sample memory mid-song (rare — none of
// the five Square/Nintendo sets) renders the final contents for the whole
// capture. Voices mid-note at dump time without a KON bit stay silent, as
// in every SPC player (the dumped KON is replayed at sample 0 by spc.mjs).
import { microYield } from "../nsf/nsf.mjs";
import { decodeBlock } from "./brr.mjs";
import { DspVoices, RATE_PERIOD, OFF } from "./dsp-state.mjs";

export const DSP_RATE = 32000;

// The S-DSP's Gaussian interpolation ROM (512 × 11-bit), as tabulated by
// Anomie and blargg (SPC_DSP.cpp `gauss[]`; fullsnes "DSP Gaussian
// Interpolation"). For a fractional position f (0-255) the four weights
// are GAUSS[255-f], GAUSS[511-f], GAUSS[256+f], GAUSS[f] on the four
// newest decoded samples, oldest first; they sum to ~2048 (2049 at f = 0,
// hence the int16 wrap the chip applies after the third term).
export const GAUSS = Int16Array.from([
     0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
     1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   2,   2,   2,   2,   2,
     2,   2,   3,   3,   3,   3,   3,   4,   4,   4,   4,   4,   5,   5,   5,   5,
     6,   6,   6,   6,   7,   7,   7,   8,   8,   8,   9,   9,   9,  10,  10,  10,
    11,  11,  11,  12,  12,  13,  13,  14,  14,  15,  15,  15,  16,  16,  17,  17,
    18,  19,  19,  20,  20,  21,  21,  22,  23,  23,  24,  24,  25,  26,  27,  27,
    28,  29,  29,  30,  31,  32,  32,  33,  34,  35,  36,  36,  37,  38,  39,  40,
    41,  42,  43,  44,  45,  46,  47,  48,  49,  50,  51,  52,  53,  54,  55,  56,
    58,  59,  60,  61,  62,  64,  65,  66,  67,  69,  70,  71,  73,  74,  76,  77,
    78,  80,  81,  83,  84,  86,  87,  89,  90,  92,  94,  95,  97,  99, 100, 102,
   104, 106, 107, 109, 111, 113, 115, 117, 118, 120, 122, 124, 126, 128, 130, 132,
   134, 137, 139, 141, 143, 145, 147, 150, 152, 154, 156, 159, 161, 163, 166, 168,
   171, 173, 175, 178, 180, 183, 186, 188, 191, 193, 196, 199, 201, 204, 207, 210,
   212, 215, 218, 221, 224, 227, 230, 233, 236, 239, 242, 245, 248, 251, 254, 257,
   260, 263, 267, 270, 273, 276, 280, 283, 286, 290, 293, 297, 300, 304, 307, 311,
   314, 318, 321, 325, 328, 332, 336, 339, 343, 347, 351, 354, 358, 362, 366, 370,
   374, 378, 381, 385, 389, 393, 397, 401, 405, 410, 414, 418, 422, 426, 430, 434,
   439, 443, 447, 451, 456, 460, 464, 469, 473, 477, 482, 486, 491, 495, 499, 504,
   508, 513, 517, 522, 527, 531, 536, 540, 545, 550, 554, 559, 563, 568, 573, 577,
   582, 587, 592, 596, 601, 606, 611, 615, 620, 625, 630, 635, 640, 644, 649, 654,
   659, 664, 669, 674, 678, 683, 688, 693, 698, 703, 708, 713, 718, 723, 728, 732,
   737, 742, 747, 752, 757, 762, 767, 772, 777, 782, 787, 792, 797, 802, 806, 811,
   816, 821, 826, 831, 836, 841, 846, 851, 855, 860, 865, 870, 875, 880, 884, 889,
   894, 899, 904, 908, 913, 918, 923, 927, 932, 937, 941, 946, 951, 955, 960, 965,
   969, 974, 978, 983, 988, 992, 997,1001,1005,1010,1014,1019,1023,1027,1032,1036,
  1040,1045,1049,1053,1057,1061,1066,1070,1074,1078,1082,1086,1090,1094,1098,1102,
  1106,1109,1113,1117,1121,1125,1128,1132,1136,1139,1143,1146,1150,1153,1157,1160,
  1164,1167,1170,1174,1177,1180,1183,1186,1190,1193,1196,1199,1202,1205,1207,1210,
  1213,1216,1219,1221,1224,1227,1229,1232,1234,1237,1239,1241,1244,1246,1248,1251,
  1253,1255,1257,1259,1261,1263,1265,1267,1269,1270,1272,1274,1275,1277,1279,1280,
  1282,1283,1284,1286,1287,1288,1290,1291,1292,1293,1294,1295,1296,1297,1297,1298,
  1299,1300,1300,1301,1302,1302,1303,1303,1303,1304,1304,1304,1304,1304,1305,1305,
]);

// One interpolated sample from four decoded ones (s0 oldest .. s3 newest)
// at fraction f (0-255) — the chip's exact arithmetic: three products
// summed and wrapped to int16, the fourth added, clamp, low bit cleared.
export function gaussInterp(s0, s1, s2, s3, f) {
  let out = (GAUSS[255 - f] * s0) >> 11;
  out += (GAUSS[511 - f] * s1) >> 11;
  out += (GAUSS[256 + f] * s2) >> 11;
  out = (out << 16) >> 16;
  out += (GAUSS[f] * s3) >> 11;
  if (out > 32767) out = 32767; else if (out < -32768) out = -32768;
  return out & ~1;
}

// The noise generator: a 15-bit LFSR, new bit 14 = bit 0 XOR bit 1, seeded
// 0x4000, clocked at the FLG rate; NON voices play (int16)(noise << 1).
export function noiseStep(n) {
  const fb = (n << 13) ^ (n << 14);
  return (fb & 0x4000) ^ (n >> 1);
}
export const NOISE_SEED = 0x4000;

export async function renderApu(capture, opts = {}) {
  const sampleRate = opts.sampleRate || 44100;
  const {dspLog, dsp0, ram} = capture;
  const keep = Math.min(opts.keepSamples || capture.samples, capture.samples);
  const seconds = keep / DSP_RATE;
  const N = Math.round(keep * sampleRate / DSP_RATE); // round, not ceil: 2.2 × 44100 is 97020.00000000001 in floating point
  const out = {sampleRate, seconds};
  const bufs = [];
  for (let v = 0; v < 8; v++) bufs.push(out["voice" + v] = new Float32Array(N));

  const regs = Uint8Array.from(dsp0);
  const dsp = new DspVoices(ram, regs);

  // ---- per-voice BRR decode-ahead: a 64-sample ring (four 16-sample
  // blocks) filled in playback order so the interpolation window at
  // position P (samples since KON) is ring[P..P+3]; the cursor walks the
  // same block chain dsp-state.mjs walks (END+LOOP -> loop address, END
  // alone -> the bytes that follow, as the chip pre-reads them too)
  const dec = [];
  for (let v = 0; v < 8; v++) dec.push({ring: new Int16Array(64), decoded: 0, addr: 0, loop: 0, state: [0, 0]});
  dsp.onKeyOn = (vc) => {
    const d = dec[vc.v];
    d.decoded = 0; d.addr = vc.start; d.loop = vc.loop; d.state[0] = 0; d.state[1] = 0;
  };
  const ensure = (d, upto) => { // decode until sample index `upto` exists
    while (d.decoded <= upto) {
      const hdr = decodeBlock(ram, d.addr, d.ring, d.decoded & 63, d.state);
      d.decoded += 16;
      d.addr = (hdr & 3) === 3 ? d.loop : (d.addr + 9) & 0xFFFF;
    }
  };

  // ---- register writes in sample order (the log is already chronological)
  const writes = dspLog;
  let wi = 0;
  const applyWrite = (reg, value) => {
    const col = reg & 0x0F;
    if (col !== 8 && col !== 9 && reg !== 0x7C) regs[reg] = value; // ENVX/OUTX/ENDX are the DSP's to write
    dsp.write(reg, value);
  };

  let noise = NOISE_SEED, noiseCounter = 0;
  const vol = new Int32Array(8); // scratch: this sample's post-envelope output per voice (PMON source)
  const CHUNK = 4096;            // 128 ms of chip time per slice
  const work = [];
  for (let v = 0; v < 8; v++) work.push(new Float32Array(CHUNK + 1)); // [0] = the previous slice's last sample
  const ratio = DSP_RATE / sampleRate;
  let j = 0; // next output sample to write
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let last = now();

  // voice v's output for this sample from the current position and envelope
  const voiceOut = (vc, non) => {
    let raw;
    if (non) raw = ((noise << 1) << 16) >> 16;
    else {
      const d = dec[vc.v], p = vc.pos;
      if (d.decoded <= p + 3) ensure(d, p + 3);
      raw = gaussInterp(d.ring[p & 63], d.ring[(p + 1) & 63], d.ring[(p + 2) & 63], d.ring[(p + 3) & 63], (vc.frac >> 4) & 0xFF);
    }
    return ((raw * vc.env) >> 11) & ~1;
  };

  for (let c0 = 0; c0 < keep; c0 += CHUNK) {
    const c1 = Math.min(keep, c0 + CHUNK);
    for (let s = c0; s < c1; s++) {
      while (wi < writes.length && writes[wi].sample <= s) { applyWrite(writes[wi].addr, writes[wi].value); wi++; }
      const flg = regs[0x6C], mute = flg & 0x40, non = regs[0x3D], pmon = regs[0x2D] & 0xFE;
      // noise clock: one LFSR step per RATE_PERIOD[FLG & 0x1F] samples, 0 = stopped
      const np = RATE_PERIOD[flg & 0x1F];
      if (np && ++noiseCounter >= np) { noiseCounter = 0; noise = noiseStep(noise); }
      const mvl = (regs[0x0C] << 24) >> 24, mvr = (regs[0x1C] << 24) >> 24;
      let prev = 0;
      for (let v = 0; v < 8; v++) {
        const vc = dsp.voices[v], bit = 1 << v, w = work[v];
        let o = 0;
        if (vc.stage !== OFF) {
          o = voiceOut(vc, non & bit);
          dsp.stepVoice(vc, (pmon & bit) ? (prev >> 5) : 0);
          if (mute) o = 0;
        }
        prev = o;
        if (o) {
          const b = v * 16;
          let l = ((o * ((regs[b] << 24) >> 24)) >> 7) * mvl >> 7;
          let r = ((o * ((regs[b + 1] << 24) >> 24)) >> 7) * mvr >> 7;
          if (l > 32767) l = 32767; else if (l < -32768) l = -32768;
          if (r > 32767) r = 32767; else if (r < -32768) r = -32768;
          // ECHO HOOK: an echo-enabled voice (EON bit) would also add
          // (o × VOL) into the echo input here; the ring buffer at
          // ESA×$100 of EDL×2 KB, 8-tap FIR, EFB feedback and EVOL return
          // are not implemented in this version.
          w[s - c0 + 1] = (l + r) * (0.5 / 32768);
        } else w[s - c0 + 1] = 0;
      }
      dsp.sample++;
    }
    // resample this slice: output j covers chip time t = j × ratio while both
    // neighbours t and t+1 are rendered (the last one waits for the next slice)
    const limit = c1 - 1;
    if (ratio === 1) {
      for (let v = 0; v < 8; v++) bufs[v].set(work[v].subarray(1, c1 - c0 + 1), c0);
      j = c1;
    } else {
      for (; j < N; j++) {
        const t = j * ratio;
        const i = Math.floor(t);
        if (i >= limit) break;
        const f = t - i, k = i - c0 + 1; // work index of chip sample i (k = 0 is c0 - 1, held over)
        for (let v = 0; v < 8; v++) { const w = work[v]; bufs[v][j] = w[k] + (w[k + 1] - w[k]) * f; }
      }
      for (let v = 0; v < 8; v++) work[v][0] = work[v][c1 - c0];
    }
    if (now() - last >= 35) {
      if (opts.onProgress) opts.onProgress(c1 / keep);
      await microYield();
      last = now();
    }
  }
  // the tail: the final chip sample has no right-hand neighbour; hold it
  for (; j < N; j++) for (let v = 0; v < 8; v++) bufs[v][j] = work[v][0];
  if (opts.onProgress) opts.onProgress(1);
  return out;
}
