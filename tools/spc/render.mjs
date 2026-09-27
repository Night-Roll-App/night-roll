// CLI: SPC -> WAV through the S-DSP renderer, with per-voice level facts.
//   node tools/spc/render.mjs song.spc --out mix.wav [--seconds 30] [--rate 44100] [--voice N]
// Writes a 16-bit mono WAV of the mix (or of one voice) and prints each
// voice's RMS and peak in dBFS — a measurement, so a render can be checked
// by number before anyone's ear is asked. Mirrors tools/spc/dump.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { parseSPC, runSPC } from "./spc.mjs";
import { renderApu } from "./apu-render.mjs";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const opt = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
if (!file || !opt("out")) {
  console.error("usage: node tools/spc/render.mjs song.spc --out mix.wav [--seconds N] [--rate 44100] [--voice N]");
  process.exit(1);
}

function wav16(buf, sampleRate) { // Float32 mono -> RIFF/WAVE PCM16 bytes
  const n = buf.length, out = new Uint8Array(44 + n * 2), dv = new DataView(out.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  str(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
  str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, "data"); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = buf[i] > 1 ? 1 : buf[i] < -1 ? -1 : buf[i];
    dv.setInt16(44 + i * 2, Math.round(x * 32767), true);
  }
  return out;
}

function levels(buf) { // {rms, peak} in dBFS (−Infinity for silence)
  let e = 0, p = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); e += a * a; if (a > p) p = a; }
  const db = x => x > 0 ? 20 * Math.log10(x) : -Infinity;
  return {rms: db(Math.sqrt(e / buf.length)), peak: db(p)};
}

const spc = parseSPC(readFileSync(file));
const seconds = +opt("seconds", spc.tags.seconds || 60);
const rate = +opt("rate", 44100);
console.error(`# ${spc.name || file} — ${spc.game}: ${seconds} s at ${rate} Hz`);
let t = performance.now();
const cap = runSPC(spc, seconds);
const tCap = performance.now() - t;
t = performance.now();
const r = await renderApu(cap, {sampleRate: rate});
const tRender = performance.now() - t;
console.error(`# capture ${tCap.toFixed(0)} ms, render ${tRender.toFixed(0)} ms, ${cap.dspLog.length} DSP writes`);
const mix = new Float32Array(r.voice0.length);
for (let v = 0; v < 8; v++) {
  const b = r["voice" + v], l = levels(b);
  for (let i = 0; i < mix.length; i++) mix[i] += b[i];
  console.error(`voice ${v}: rms ${l.rms.toFixed(1)} dBFS, peak ${l.peak.toFixed(1)} dBFS`);
}
const lm = levels(mix);
console.error(`mix: rms ${lm.rms.toFixed(1)} dBFS, peak ${lm.peak.toFixed(1)} dBFS${lm.peak > 0 ? " (clips: the voices' sum exceeds full scale; the chip would clamp the sum)" : ""}`);
const which = opt("voice") != null ? r["voice" + opt("voice")] : mix;
writeFileSync(opt("out"), wav16(which, rate));
console.error("# wrote " + opt("out"));
process.exit(0); // the yield channel would otherwise keep the process alive
