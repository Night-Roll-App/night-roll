// Names by measurement (Josh, 2026-09-28: "you should be able to name them").
// A best guess, stored as `nameGuess` beside the numbers it came from
// (`features`), so a rename later keeps the facts. No per-game tables.
//
// Measured on the note as the extracted library plays it (play.mjs, 32 kHz,
// velocity 100, key held 2 s) at the key the album plays it at most (its
// median played key; an unused instrument: the middle of its first region;
// a kit slot: the slot):
//   attack      s   start → 90% of the loudest 5 ms frame
//   t20         s   loudest frame → first frame below 20% (−14 dB); null = never within the 2 s hold
//   sustain     0..1 level over the hold's last 100 ms / the peak
//   centroid    Hz  spectral centroid, 4096 points after the attack
//   brightness      centroid / the played pitch's frequency (≈ which harmonic the energy sits on)
//   harmonicity 0..1 the normalized autocorrelation's best peak between 1/2000 s and 1/30 s
//   flatness    0..1 spectral flatness 100 Hz–10 kHz (1 = white noise)
//   oneShot         the sample has no loop; loopSeconds the loop's length, sampleSeconds the sample's (native rate)
//   keyMedian / keySpan  the keys the album played (MIDI), medianNote s  how long it held them
//   kit             a drum-kit slot, or an instrument the album plays at one key over ≥ 8 notes
// Rules, first match wins:
//   noisy = harmonicity < 0.5 or flatness > 0.12 (a looped noise sample is periodic at its loop,
//   so flatness decides there); short = t20 ≤ 0.35 s
//   1. drums (kit, or noisy and short or decaying): centroid < 150 Hz → Kick;
//      noisy: centroid ≥ 3500 Hz → Hi-hat when t20 < 0.25 s, else Cymbal;
//      centroid ≥ 1500 Hz and t20 < 0.1 s → Hi-hat; noisy otherwise → Snare; pitched: centroid < 250 Hz and t20 ≤ 0.12 s → Kick,
//      centroid < 1000 Hz → Tom, else Mallet
//   2. noisy and sustaining → Noise/FX
//   3. bass (median key < 45 and highest ≤ 64): decaying or short → Plucked bass, else Synth bass
//   4. decaying (sustain < 0.3): t20 < 0.25 s → Pluck; rings past 0.8 s with
//      harmonicity < 0.85 or brightness > 6 at key ≥ 60 → Bell; brightness < 3 → Mallet; else Piano-like
//   5. sustaining, slow attack (≥ 80 ms): brightness 3–6 at keys 55–79 with harmonicity < 0.9 →
//      Choir-like; brightness < 4 → Soft pad; else String pad
//   6. sustaining, fast attack: flat (sustain ≥ 0.97, attack ≤ 10 ms), periodic (harmonicity ≥ 0.98),
//      a short loop (< 30 ms: a few cycles) and brightness 1.5–6 → Organ-like;
//      median note < 0.35 s and brightness > 5 → Brass stab; else Lead
// Register word: "Low …" under key 48, "High …" over 76, for rules 4–6 only
// (bass and drums say their register already). Two instruments with one
// name are told apart by a number in order of use: "Soft pad", "Soft pad 2".
import { playNote, regionFor } from "./play.mjs";
import { round } from "./model.mjs";

const RATE = 32000, HOLD = 2;

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

// one label from the features (the header's rules)
export function label(f) {
  if (!f.measured) return "Noise/FX";
  const noisy = f.harmonicity < 0.5 || f.flatness > 0.12;
  const short = f.t20 != null && f.t20 <= 0.35;
  const decaying = f.sustain < 0.3;
  if (f.kit || (noisy && (short || decaying))) {
    if (f.centroid < 150) return "Kick";
    if (noisy) {
      if (f.centroid >= 3500) return f.t20 != null && f.t20 < 0.25 ? "Hi-hat" : "Cymbal";
      return f.centroid >= 1500 && f.t20 != null && f.t20 < 0.1 ? "Hi-hat" : "Snare";
    }
    if (f.centroid < 250 && f.t20 != null && f.t20 <= 0.12) return "Kick";
    return f.centroid < 1000 ? "Tom" : "Mallet";
  }
  if (noisy) return "Noise/FX";
  if (f.keyMedian != null && f.keyMedian < 45 && (f.keyHi == null || f.keyHi <= 64)) return decaying || short ? "Plucked bass" : "Synth bass";
  let name;
  if (decaying) {
    if (f.t20 != null && f.t20 < 0.25) name = "Pluck";
    else if ((f.t20 == null || f.t20 > 0.8) && (f.harmonicity < 0.85 || f.brightness > 6) && (f.keyMedian == null || f.keyMedian >= 60)) name = "Bell";
    else if (f.brightness < 3) name = "Mallet";
    else name = "Piano-like";
  } else if (f.attack >= 0.08) {
    if (f.brightness >= 3 && f.brightness <= 6 && f.keyMedian >= 55 && f.keyMedian <= 79 && f.harmonicity < 0.9) name = "Choir-like";
    else name = f.brightness < 4 ? "Soft pad" : "String pad";
  } else {
    if (f.sustain >= 0.97 && f.attack <= 0.01 && f.harmonicity >= 0.98 && f.loopSeconds != null && f.loopSeconds < 0.03 && f.brightness >= 1.5 && f.brightness <= 6) name = "Organ-like";
    else if (f.medianNote != null && f.medianNote < 0.35 && f.brightness > 5) name = "Brass stab";
    else name = "Lead";
  }
  if (f.keyMedian != null && f.keyMedian < 48) return "Low " + name.toLowerCase();
  if (f.keyMedian != null && f.keyMedian > 76) return "High " + name.toLowerCase();
  return name;
}

// features for an instrument (or one kit slot) as played
function featuresOf(inst, samples, {key, keyMedian, keyLo, keyHi, keySpan, medianNote, kit}) {
  const r = regionFor(inst, key, 100);
  const smp = r && samples[r.sample];
  const base = {keyMedian, keyLo, keyHi, keySpan, medianNote: medianNote != null ? round(medianNote, 3) : null, kit: !!kit,
    oneShot: smp ? !smp.loop : null, loopSeconds: smp && smp.loop ? round((smp.loop.end - smp.loop.start) / smp.rate, 4) : null, sampleSeconds: smp ? round(smp.pcm.length / smp.rate, 3) : null,
    release: (r && r.envelope || inst.envelope || {}).release ?? null};
  if (!smp) return {...base, measured: false};
  const x = playNote(inst, samples, {key, vel: 100, hold: HOLD, sampleRate: RATE, tail: 0.5});
  const m = measure(x, {rate: RATE, hold: HOLD, key: r.fixedPitch ? key : key});
  return m ? {...base, ...m, measured: true} : {...base, measured: false};
}

// names every instrument of a finished Library (and every slot of its kits)
export function nameAll(lib, samples) {
  const counts = new Map();
  const numbered = base => { const n = (counts.get(base) || 0) + 1; counts.set(base, n); return n === 1 ? base : base + " " + n; };
  const order = lib.instruments.slice().sort((a, b) => (b.used - a.used) || (b.noteCount - a.noteCount) || a.id.localeCompare(b.id));
  for (const inst of order) {
    const st = inst._stats || {};
    if (inst.kind === "drum-kit") {
      const slotUse = new Map(st.slots || []);
      const kitCounts = new Map();
      // the slots the album played most are named first ("Tom", then "Tom 2" …)
      const byUse = inst.keyRegions.slice().sort((a, b) => (slotUse.get(b.keyLo) || 0) - (slotUse.get(a.keyLo) || 0) || a.keyLo - b.keyLo);
      for (const r of byUse) {
        const key = r.keyLo;
        const single = {...inst, keyRegions: [r]};
        const f = featuresOf(single, samples, {key, keyMedian: key, keyLo: key, keyHi: key, keySpan: 0, medianNote: st.medianSeconds, kit: true});
        const base = label(f);
        const n = (kitCounts.get(base) || 0) + 1; kitCounts.set(base, n);
        r.nameGuess = n === 1 ? base : base + " " + n;
        r.features = {...f, notes: slotUse.get(key) || 0};
      }
      inst.nameGuess = numbered("Drum kit");
      inst.features = {kit: true, slots: inst.keyRegions.length, slotsPlayed: [...slotUse.keys()].length};
      continue;
    }
    const kp = inst.keysPlayed;
    const first = inst.keyRegions.find(r => r.sample);
    const key = kp ? kp.median : first ? Math.round((first.keyLo + first.keyHi) / 2) : 60;
    const oneKey = kp && kp.lo === kp.hi && inst.noteCount >= 8;
    const f = featuresOf(inst, samples, {key, keyMedian: kp ? kp.median : null, keyLo: kp ? kp.lo : null, keyHi: kp ? kp.hi : null, keySpan: kp ? kp.hi - kp.lo : null, medianNote: st.medianSeconds, kit: oneKey});
    inst.features = f;
    inst.nameGuess = numbered(label(f));
  }
}
