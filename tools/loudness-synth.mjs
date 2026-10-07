// tools/loudness-synth.mjs — a sample-level model of the app's DEFAULT synth
// path (src/audio/voices.js playSynthVoice + engine.js drumHit) for loudness
// measurement only: the same VOICE_AMP, velocity, duty → wave choice,
// attack/release/`ve` decay, CC7/CC11 and equal-power pan, noise drums.
// Leaves out the hat high-pass, the sustain pedal and voice/patch
// annotations (all-default voices) — small next to the gaps it measures
// (docs/plans/2026-10-07-console-loudness.md §3). Deterministic: the noise
// is a fixed LCG, so a dry run and --apply store the same number.
const VOICE_AMP = {square: 0.5, square25: 0.5, square12: 0.5, triangle: 0.9};
const T = 4096;
function table(kind) { // one band-limited period (32 harmonics), peak-normalised like a WebAudio PeriodicWave
  const w = new Float64Array(T);
  for (let h = 1; h <= 32; h++) {
    let a;
    if (kind === "triangle") a = h % 2 ? 8 / (Math.PI * Math.PI * h * h) * ((h - 1) / 2 % 2 ? -1 : 1) : 0;
    else { const duty = kind === "square" ? 0.5 : kind === "square25" ? 0.25 : 0.125; a = 2 / (h * Math.PI) * Math.sin(h * Math.PI * duty); }
    if (!a) continue;
    for (let i = 0; i < T; i++) w[i] += a * (kind === "triangle" ? Math.sin(2 * Math.PI * h * i / T) : Math.cos(2 * Math.PI * h * i / T));
  }
  let pk = 0; for (const v of w) pk = Math.max(pk, Math.abs(v));
  return w.map(v => v / pk);
}
let TABLES = null;
// song: parseMidi's result; tickToSec: src/midi/parse.js's. Returns {L, R, fs}.
export function synthMix(song, tickToSec, secs, fs = 44100) {
  if (!TABLES) { TABLES = {}; for (const k of Object.keys(VOICE_AMP)) TABLES[k] = table(k); }
  const N = Math.max(0, Math.round(secs * fs)), L = new Float32Array(N), R = new Float32Array(N);
  const tracks = song.tracks.filter(t => t.kind !== "audio");
  const last = tracks.length - 1;
  let seed = 22222;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 2147483648 - 1; };
  tracks.forEach((tr, ti) => {
    const drums = /drum|percussion|kit|noise|dpcm/i.test(tr.name || "") || tr.notes.some(x => x.ch === 9);
    const ctl = tr.ctl || [];
    const at = (c, ch, tick, d) => { let v = d; for (const e of ctl) if (e.c === c && (e.ch === undefined || e.ch === ch) && e.t <= tick) v = e.v; return v; };
    const has = c => ctl.some(e => e.c === c);
    for (const n of tr.notes) {
      const t0 = tickToSec(song, n.t), t1 = tickToSec(song, n.t + n.d);
      if (t0 >= secs) continue;
      const dur = t1 - t0;
      const lvl = (has(7) ? at(7, n.ch, n.t, 100) : 127) / 127 * (has(11) ? at(11, n.ch, n.t, 127) : 127) / 127;
      const pan = has(10) ? Math.max(-1, Math.min(1, (at(10, n.ch, n.t, 64) - 64) / 63)) : (tr.midiPan !== undefined ? tr.midiPan : 0);
      const x = (pan + 1) / 2, gL = Math.cos(x * Math.PI / 2) * lvl, gR = Math.sin(x * Math.PI / 2) * lvl;
      const i0 = Math.round(t0 * fs);
      if (n.ch === 9 || drums) {
        const v = 0.75 * (0.3 + 0.7 * n.v / 127), p = n.p;
        const kick = p <= 36 || (p >= 41 && p <= 47 && p !== 42 && p !== 44 && p !== 46);
        const len = dur >= 1 ? Math.min(dur, 8) : kick ? 0.16 : (p === 38 || p === 40 || p === 39 ? 0.11 : (p === 49 || p === 51 || p === 57 ? 0.3 : 0.045));
        const g = dur >= 1 ? v * 0.5 : kick ? v : v * (len < 0.06 ? 0.5 : 0.62), M = Math.round(len * fs);
        let ph = 0;
        for (let k = 0; k < M && i0 + k < N; k++) {
          let s;
          if (kick && dur < 1) { const f = (p <= 36 ? 160 : 150) * Math.pow(p <= 36 ? 45 / 160 : 0.4, Math.min(1, k / fs / 0.12)); ph += f / fs; s = TABLES.triangle[Math.floor((ph % 1) * T)] * Math.pow(0.001, k / M); }
          else s = rnd() * Math.pow(1 - k / M, 1.5);
          L[i0 + k] += s * g * gL; R[i0 + k] += s * g * gR;
        }
        continue;
      }
      const wave = n.duty !== undefined ? ["square12", "square25", "square", "square25"][n.duty] : (ti === last && tracks.length > 1 ? "triangle" : ti % 2 === 0 ? "square" : "square25");
      const amp = n.v / 127 * VOICE_AMP[wave], f0 = 440 * Math.pow(2, (n.p - 69) / 12), tab = TABLES[wave];
      const atk = Math.min(0.008, dur * 0.15), rel = Math.min(0.03, dur * 0.25), endAmp = n.ve !== undefined && n.ve < n.v ? amp * n.ve / n.v : amp;
      const M = Math.round(dur * fs);
      let ph = 0;
      for (let k = 0; k < M && i0 + k < N; k++) {
        const t = k / fs;
        let e;
        if (t < atk) e = amp * t / atk; else if (t < dur - rel) e = amp + (endAmp - amp) * (t - atk) / Math.max(1e-9, dur - rel - atk); else e = endAmp * (dur - t) / rel;
        ph += f0 / fs;
        const s = tab[Math.floor((ph % 1) * T)] * e;
        L[i0 + k] += s * gL; R[i0 + k] += s * gR;
      }
    }
  });
  return {L, R, fs};
}
