// One note through an extracted instrument (instruments.json + its samples),
// with no driver code: the region for the key, its sample at 2^((key −
// rootKey)/12) × native rate (linear interpolation, forward loop), the gain ×
// velocity curve, and the envelope's own breakpoints — held shape from
// key-on, then the release curve from wherever the level was. This is what
// the app plays a borrowed instrument with; tools/instruments/verify.mjs
// holds it against each driver's renderer. Standalone on purpose (no Node,
// no driver modules): the page and a worker can import it as it is.
//
//   playNote(inst, samples, {key, vel, hold, sampleRate, volume, tail})
//     inst:    an instruments.json instrument
//     samples: {hash: {rate, pcm: Float32Array (−1..1), loop: {start, end} | null}}
//     key:     MIDI key (kit: the slot); vel 1..127; hold: seconds the key is down
//     volume:  an extra linear factor (a track's level); tail: max seconds after release
//   -> Float32Array (mono; pan is the caller's: inst.pan / region.pan, −1..1)

export function regionFor(inst, key, vel = 100) {
  const rs = inst.keyRegions.filter(r => r.sample);
  if (!rs.length) return null;
  const inVel = r => (r.velLo == null || vel >= r.velLo) && (r.velHi == null || vel <= r.velHi);
  return rs.find(r => key >= r.keyLo && key <= r.keyHi && inVel(r))
    || rs.find(r => key >= r.keyLo && key <= r.keyHi)
    || rs.slice().sort((a, b) => dist(a, key) - dist(b, key))[0];
}
const dist = (r, k) => k < r.keyLo ? r.keyLo - k : k > r.keyHi ? k - r.keyHi : 0;

export function envLevel(points, t, repeat) {
  if (!points || !points.length) return 1;
  if (repeat && repeat.to > repeat.from && t > repeat.to) t = repeat.from + ((t - repeat.from) % (repeat.to - repeat.from));
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, l1] = points[i];
    if (t <= t1) { const [t0, l0] = points[i - 1]; return t1 > t0 ? l0 + (l1 - l0) * (t - t0) / (t1 - t0) : l1; }
  }
  return points[points.length - 1][1];
}
// where a falling curve first reaches `level` (its time), for "follow" releases
function timeAtLevel(points, level) {
  if (!points.length || level >= points[0][1]) return 0;
  for (let i = 1; i < points.length; i++) {
    const [t0, l0] = points[i - 1], [t1, l1] = points[i];
    if (l1 <= level) return l0 > l1 ? t0 + (t1 - t0) * (l0 - level) / (l0 - l1) : t1;
  }
  return points[points.length - 1][0];
}

export function playNote(inst, samples, {key = 60, vel = 100, hold = 0.5, sampleRate = 44100, volume = 1, tail = 6} = {}) {
  const r = regionFor(inst, key, vel);
  if (!r) return new Float32Array(0);
  const smp = samples[r.sample];
  if (!smp || !smp.pcm) return new Float32Array(0);
  const env = r.envelope || inst.envelope || {points: [[0, 1]], releaseCurve: {mode: "follow", points: [[0, 1], [0.01, 0]]}};
  const rc = env.releaseCurve || {mode: "follow", points: [[0, 1], [0.01, 0]]};
  const gain = (r.gain != null ? r.gain : inst.gain != null ? inst.gain : 1) * volume;
  const v = Math.max(0, Math.min(127, vel)) / 127;
  const velGain = inst.velocityCurve === "square" ? v * v : v;
  let ratio = Math.pow(2, (key - r.rootKey) / 12);
  if (r.fixedPitch) ratio = Math.pow(2, ((r.fixedKey != null ? r.fixedKey : r.keyLo) - r.rootKey) / 12);
  if (inst.maxRatio) ratio = Math.min(inst.maxRatio, ratio);
  const step = ratio * smp.rate / sampleRate;
  const relSecs = rc.mode === "exp-time" ? rc.seconds : (rc.points && rc.points.length ? rc.points[rc.points.length - 1][0] : 0);
  const N = Math.ceil((hold + Math.min(tail, relSecs + 0.01)) * sampleRate);
  const out = new Float32Array(N);
  const pcm = smp.pcm, loop = smp.loop && smp.loop.end > smp.loop.start ? smp.loop : null;
  const L = loop ? loop.end : pcm.length;
  const iOff = Math.round(hold * sampleRate);
  let pos = 0, relLevel = 0, relT0 = 0, floorRatio = 1;
  for (let i = 0; i < N; i++) {
    const t = i / sampleRate;
    let lv;
    if (i < iOff) lv = envLevel(env.points, t, env.repeat);
    else {
      if (i === iOff) {
        relLevel = envLevel(env.points, t, env.repeat);
        if (rc.mode === "exp-time") { const fl = rc.floor || 1 / 32767; floorRatio = relLevel > fl ? Math.log(fl / relLevel) : 0; }
        else relT0 = timeAtLevel(rc.points || [], relLevel);
      }
      const tr = (i - iOff) / sampleRate;
      if (rc.mode === "exp-time") lv = tr >= rc.seconds ? 0 : relLevel * Math.exp(floorRatio * tr / Math.max(1e-9, rc.seconds));
      else lv = envLevel(rc.points || [], relT0 + tr, null);
      if (lv <= 1e-6 && tr > 0) break;
    }
    if (pos >= L) { if (!loop) break; pos = loop.start + (pos - loop.start) % (L - loop.start); }
    const p0 = pos | 0, f = pos - p0, a = pcm[p0], b = p0 + 1 < L ? pcm[p0 + 1] : loop ? pcm[loop.start] : 0;
    out[i] = (a + (b - a) * f) * gain * velGain * lv;
    pos += step;
  }
  return out;
}

// the samples table from WAV files already parsed (model.mjs readWav) or from a Library
export function samplesFromLibrary(lib) {
  const out = {};
  for (const [h, s] of Object.entries(lib.samples)) out[h] = {rate: s.rate, loop: s.loop, pcm: s._f32};
  return out;
}
