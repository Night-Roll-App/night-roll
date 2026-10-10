// The sound measurements tools/instruments/name.mjs names instruments by,
// apart from its node-only imports so the app's capture (tools/psx/notes.mjs
// kitify: a drum table used as a melodic bank) can measure a sample too.
// Definitions as name.mjs's header states them.
const RATE = 32000, HOLD = 2;
const round = (x, d = 4) => { const k = Math.pow(10, d); return Math.round(x * k) / k; }; // model.mjs's (it imports node:crypto)

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], xr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, xi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + xr; im[i + k] = ui + xi; re[i + k + len / 2] = ur - xr; im[i + k + len / 2] = ui - xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// the measurements of one rendered note
export function measure(x, {rate = RATE, hold = HOLD, key = 60} = {}) {
  const F = Math.round(0.005 * rate), frames = [];
  for (let i = 0; i + F <= x.length; i += F) { let s = 0; for (let k = 0; k < F; k++) s += x[i + k] * x[i + k]; frames.push(Math.sqrt(s / F)); }
  const peak = Math.max(1e-12, ...frames);
  if (peak <= 1e-9) return null;
  const pk = frames.indexOf(Math.max(...frames));
  const ia = frames.findIndex(f => f >= 0.9 * peak);
  const holdFrames = Math.floor(hold * rate / F);
  let i20 = null; for (let i = pk; i < Math.min(frames.length, holdFrames); i++) if (frames[i] < 0.2 * peak) { i20 = i; break; }
  const tail = frames.slice(Math.max(0, holdFrames - 20), holdFrames);
  const sustain = tail.length ? tail.reduce((a, b) => a + b) / tail.length / peak : 0;
  // spectrum just after the attack
  const N = 4096, at = Math.min(Math.max(0, x.length - N), ia * F);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[at + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  fft(re, im);
  let num = 0, den = 0, logSum = 0, lin = 0, cnt = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = k * rate / N, p = re[k] * re[k] + im[k] * im[k];
    num += f * p; den += p;
    if (f >= 100 && f <= 10000) { logSum += Math.log(p + 1e-20); lin += p + 1e-20; cnt++; }
  }
  const centroid = den > 0 ? num / den : 0;
  const flatness = cnt ? Math.exp(logSum / cnt) / (lin / cnt) : 0;
  // periodicity
  const W = 2048, a0 = Math.min(Math.max(0, x.length - W - rate / 30), at);
  const minLag = Math.floor(rate / 2000), maxLag = Math.ceil(rate / 30);
  let e0 = 0; for (let i = 0; i < W; i++) e0 += (x[a0 + i] || 0) ** 2;
  let harm = 0;
  if (e0 > 1e-12) for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0, e1 = 0;
    for (let i = 0; i < W; i++) { const b = x[a0 + i + lag] || 0; s += (x[a0 + i] || 0) * b; e1 += b * b; }
    const r = e1 > 0 ? s / Math.sqrt(e0 * e1) : 0;
    if (r > harm) harm = r;
  }
  const f0 = 440 * Math.pow(2, (key - 69) / 12);
  return {attack: round(ia * F / rate, 3), t20: i20 == null ? null : round((i20 - pk) * F / rate, 3), sustain: round(sustain, 3),
    centroid: Math.round(centroid), brightness: round(centroid / f0, 2), harmonicity: round(harm, 3), flatness: round(flatness, 3)};
}
