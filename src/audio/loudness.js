// src/audio/loudness.js — the loudness model (docs/plans/2026-10-07-console-loudness.md §4A).
// Pure: no imports, no state. The app (audio/levels.js), the measuring tool
// (tools/measure-loudness.mjs) and the tests share these exact functions, so a
// stored measurement and an in-app one are the same number.
//
// One gain per song brings the console voice to LOUD_TARGET (ITU-R BS.1770
// integrated loudness), never past LOUD_PEAK_CAP. Every gain comes from the
// file being played or from a chip's own full scale — never from a per-game
// table (CLAUDE.md "No one-time hacks in capture engines").

export const LOUD_TARGET = -16;   // LUFS: Apple Sound Check's level; streaming sits at −14
export const LOUD_PEAK_CAP = -1;  // dBFS: the song gain never lifts the loudest sample past this
export const LOUD_GAIN_MIN = -12, LOUD_GAIN_MAX = 24; // dB: a broken measurement can't blow the speakers or vanish
export const LOUD_VERSION = 1;    // album.json loud.v / the device cache key: bump when the measurement itself changes

// A song with no console voice (compositions, imported .mid): one synth level
// that puts a typical 3–4-voice synth song near the target. §3's synth renders
// sit around −11.5 LUFS at unity (median of ten songs), so −4.5…−5 dB lands
// them near −16 while a hot four-square chord still peaks under 0 dBFS; the
// limiter covers the rest. Replaces the July MASTER_VOL 0.22 as the synth's headroom.
export const SYNTH_LEVEL = 0.55;
// Instrument auditions (game-voice / sf2 pickers): each is peak-normalised to
// 0.9 before it plays, so this is its peak (≈ −7 dBFS), next to a song at −16 LUFS.
export const AUDITION_LEVEL = 0.5;

// "Hear the MIDI" on a captured song: the synth plays at the song's gain plus
// this per-console offset, so toggling console ↔ MIDI keeps the level. The
// capture writes velocity = the chip's level / its full scale × 127, and one
// full-velocity default synth voice is a ±0.5 square (voices.js VOICE_AMP), so
// the offset is (one full-level chip channel) ÷ (that square), both measured as
// they leave the renderer. A song whose album.json carries its synth loudness
// (loud.synth, tools/measure-loudness.mjs) uses that exact difference instead.
//   NES: pulse at volume 15 = 95.88/(8128/15+100) × 2 (apu-render.mjs) = 0.298
//        peak-to-peak, ±0.149 after the 90 Hz high-pass → 20·log10(0.149/0.5) = −10.5 dB
//   GB:  one channel's DAC ±1 × 0.25·(8+8)/16 (apu-render.mjs gain) = ±0.25 → −6.0 dB
//   SNES, PS1, PS2, N64: the capture's velocity carries only the voice's
//        volume register — the sample's own level and the envelope are not in
//        it — so the chip's full scale says nothing about what a velocity-127
//        note sounds like. These use the median measured difference across every
//        album of the console (tools/measure-loudness.mjs --limit 4, 2026-10-07:
//        SNES 52 songs, PS1 24, PS2 8, N64 32 — the spread inside a console is
//        several dB, which is why a stored loud.synth wins whenever there is one;
//        a per-console figure, never a per-game one).
export const SYNTH_MATCH_DB = {nsf: -10.5, gbs: -6.0, spc: -9.2, psf: -13.9, psf2: -18.4, usf: -5.8};

export function dbToLin(db) { return Math.pow(10, db / 20); }
export function linToDb(x) { return x > 0 ? 20 * Math.log10(x) : -Infinity; }
const round1 = x => Number.isFinite(x) ? Math.round(x * 10) / 10 : x;

// BS.1770 K-weighting (shelf + RLB high-pass) for sample rate fs, as biquads
export function kWeights(fs) {
  let K = Math.tan(Math.PI * 1681.974450955533 / fs);
  const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let Q = 0.7071752369554196, a0 = 1 + K / Q + K * K;
  const shelf = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  K = Math.tan(Math.PI * 38.13547087602444 / fs); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K;
  const hp = [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  return [shelf, hp];
}

// {lufs, peak} of a stereo signal (L, R: arrays of equal length) at fs.
// Integrated loudness: 400 ms blocks on a 100 ms hop, −70 LUFS absolute gate,
// −10 LU relative gate. One pass, no copy of the signal (a 3-minute song on an iPad).
export function measureLoudness(L, R, fs) {
  const [s, h] = kWeights(fs), N = Math.min(L.length, R.length), hop = Math.max(1, Math.round(fs / 10));
  const seg = [];
  let peak = 0, acc = 0, cnt = 0;
  const st = new Float64Array(16); // per side: shelf x1 x2 y1 y2, hp x1 x2 y1 y2 → [0..7] L, [8..15] R
  const step = (x, o) => {
    const y1 = s[0] * x + s[1] * st[o] + s[2] * st[o + 1] - s[3] * st[o + 2] - s[4] * st[o + 3];
    st[o + 1] = st[o]; st[o] = x; st[o + 3] = st[o + 2]; st[o + 2] = y1;
    const y2 = y1 - 2 * st[o + 4] + st[o + 5] - h[3] * st[o + 6] - h[4] * st[o + 7];
    st[o + 5] = st[o + 4]; st[o + 4] = y1; st[o + 7] = st[o + 6]; st[o + 6] = y2;
    return y2;
  };
  for (let i = 0; i < N; i++) {
    const l = L[i], r = R[i];
    const al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
    if (al > peak) peak = al;
    if (ar > peak) peak = ar;
    const kl = step(l, 0), kr = step(r, 8);
    acc += kl * kl + kr * kr;
    if (++cnt === hop) { seg.push(acc / hop); acc = 0; cnt = 0; }
  }
  const blocks = [];
  for (let i = 0; i + 4 <= seg.length; i++) blocks.push((seg[i] + seg[i + 1] + seg[i + 2] + seg[i + 3]) / 4);
  const ld = z => -0.691 + 10 * Math.log10(z);
  const g1 = blocks.filter(z => z > 0 && ld(z) > -70);
  let lufs = -Infinity;
  if (g1.length) {
    const rel = ld(g1.reduce((a, b) => a + b, 0) / g1.length) - 10;
    const g2 = g1.filter(z => ld(z) > rel);
    lufs = ld(g2.reduce((a, b) => a + b, 0) / g2.length);
  }
  return {lufs: round1(lufs), peak: round1(linToDb(peak))};
}

// The console render mixed the way the app's graph mixes it, at unity: a mono
// track (Float32Array) through a centred StereoPanner gives 0.707 per side, a
// stereo pair ({l, r}) passes through. Trimmed at the capture's lead (song time
// zero) and to `secs`. tracks: {name: Float32Array | {l, r}}.
export function loudMix(tracks, fs, {lead = 0, secs = Infinity} = {}) {
  const s0 = Math.max(0, Math.round(lead * fs));
  let len = 0;
  for (const v of Object.values(tracks)) if (v) len = Math.max(len, (v.l ? v.l.length : v.length) - s0);
  len = Math.max(0, Math.min(len, Number.isFinite(secs) ? Math.round(secs * fs) : len));
  const L = new Float32Array(len), R = new Float32Array(len);
  for (const v of Object.values(tracks)) {
    if (!v) continue;
    if (v.l) { const n = Math.min(len, v.l.length - s0); for (let i = 0; i < n; i++) { L[i] += v.l[s0 + i]; R[i] += v.r[s0 + i]; } }
    else { const n = Math.min(len, v.length - s0); for (let i = 0; i < n; i++) { const x = v[s0 + i] * Math.SQRT1_2; L[i] += x; R[i] += x; } }
  }
  return {L, R};
}

// The song gain in dB for a measurement {lufs, peak}: up (or down) to the
// target, but never past the peak cap; 0 when there is no usable measurement.
export function songGainDb(loud) {
  if (!loud || !Number.isFinite(loud.lufs)) return 0;
  let g = LOUD_TARGET - loud.lufs;
  if (Number.isFinite(loud.peak)) g = Math.min(g, LOUD_PEAK_CAP - loud.peak);
  return Math.max(LOUD_GAIN_MIN, Math.min(LOUD_GAIN_MAX, g));
}
// the synth's offset from the console voice of the same song (see SYNTH_MATCH_DB)
export function synthMatchDb(kind, loud) {
  if (loud && Number.isFinite(loud.lufs) && Number.isFinite(loud.synth)) return Math.max(-30, Math.min(30, loud.lufs - loud.synth));
  return SYNTH_MATCH_DB[kind] !== undefined ? SYNTH_MATCH_DB[kind] : 0;
}

// The device's master volume pref (ff1roll-mastervol) was a boost over a
// −13 dB master; with songs now at a normal level, a stored 200% would be +6 dB
// on top. Reset anything above 100% to 100%, once (ff1roll-mastervol-v2 marks it).
export function migrateMasterVol(get, set) {
  if (get("ff1roll-mastervol-v2") === "1") return false;
  const v = +(get("ff1roll-mastervol") || 1);
  let changed = false;
  if (v > 1) { set("ff1roll-mastervol", "1"); changed = true; }
  set("ff1roll-mastervol-v2", "1");
  return changed;
}

// FNV-1a over the bytes (the device cache key of an unmeasured song's file)
export function loudFileHash(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0") + "-" + bytes.length.toString(36);
}
