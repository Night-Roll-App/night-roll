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
import { fft, measure } from "./measure.mjs";
export { fft, measure };

const RATE = 32000, HOLD = 2;

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
