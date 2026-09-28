// tools/sounding.mjs — sounding-pitch offsets for sequence-chip captures
// (PS1 AKAO/SEQ, N64 EAD and Rare), 2026-09-28.
//
// The roll shows the note the composer TYPED. Some instruments' samples
// were recorded an octave — occasionally two — away from that key, so what
// the listener HEARS is an octave off from the roll (measured ground
// truth: SM64 Cave Dungeon ch 0/6/7 and Title Theme inst 3 sound a written
// octave below, Title inst 4 a written octave above, FF7 "You Can Hear the
// Cry of the Planet" prog 62 an octave above — tools/n64/INTEGRATION.md
// §9.3, §9.6, §10.6). Josh's ruling: "the roll should show the sounding
// pitch." This module only MEASURES the offset; the caller (CHIPS.psf.capture
// / CHIPS.usf.capture in index.html) renders the held note, applies the
// shift to the notes the MIDI writer reads, and writes the capture warning.
//
// Method: for each non-kit group, render ONE held note at the group's
// median played key (1 s, velocity 100) through the console's OWN renderer
// (the same renderSpu/renderN64 that plays the song), then estimate its
// fundamental by normalized autocorrelation over the sustained part — the
// first 60 ms (attack, pre-roll) are skipped. A peak correlation below 0.8
// is not a clear pitch (noise, a drum sample, silence): offset 0, with why.
// A clear pitch converts to octaves ONLY — offset = 12 × round((measured −
// key) / 12) — a few cents or semitones of tuning drift is not this bug and
// rounds away; nothing here reports a non-octave difference.

const SKIP_S = 0.06;      // the attack transient is not periodic — skip it before autocorrelating
const WINDOW_S = 0.5;     // how much of the sustained part to analyze (bounds the autocorrelation cost)
const CORR_THRESHOLD = 0.8; // below this, the result is not a clear pitch
const MIN_HZ = 25;        // below the lowest note these consoles carry (≈ MIDI 15)
const MAX_HZ = 2000;      // above the highest melodic fundamental in these soundtracks (≈ MIDI 95) — a higher ceiling let ADPCM/VADPCM decode-filter artifacts at very short lags masquerade as a false high pitch

function toMono(pcm) {
  if (!pcm) return null;
  if (pcm instanceof Float32Array) return pcm;
  if (pcm.l instanceof Float32Array && pcm.r instanceof Float32Array) {
    const n = Math.min(pcm.l.length, pcm.r.length), out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = (pcm.l[i] + pcm.r[i]) * 0.5;
    return out;
  }
  return null;
}

// normalized autocorrelation, 0-lag energy as the denominator; picks the
// FIRST local-maximum peak at or above the threshold, scanning from the
// shortest lag (highest frequency) up — the standard guard against an
// autocorrelation-native octave error (a strong peak at 2× the true period
// is common in band-limited console samples, and this bug IS about octaves,
// so a detector prone to its own octave ambiguity would be self-defeating).
function autocorrelate(pcm, sampleRate) {
  const n = pcm.length;
  const minLag = Math.max(1, Math.floor(sampleRate / MAX_HZ));
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / MIN_HZ));
  if (maxLag <= minLag + 1) return null;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += pcm[i] * pcm[i];
  if (!(energy > 0)) return null;
  const span = maxLag - minLag + 1;
  const corr = new Float64Array(span);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += pcm[i] * pcm[i + lag];
    corr[lag - minLag] = sum / energy;
  }
  let bestIdx = -1;
  for (let k = 1; k < span - 1; k++) {
    if (corr[k] >= corr[k - 1] && corr[k] >= corr[k + 1] && corr[k] >= CORR_THRESHOLD) { bestIdx = k; break; }
  }
  if (bestIdx < 0) { // no qualifying peak — report the global max for the "why", still below threshold
    bestIdx = 0;
    for (let k = 1; k < span; k++) if (corr[k] > corr[bestIdx]) bestIdx = k;
  }
  let lag = bestIdx + minLag, corrVal = corr[bestIdx];
  // 2nd-harmonic guard (2026-09-28, the coordinator: 37% of FF7's groups
  // shifting was enough to ask whether this is real or a strong 2nd
  // harmonic winning): a bright/buzzy console sample's autocorrelation can
  // peak at HALF the true period (the 2nd harmonic) even after the
  // shortest-lag-first scan above, because the 2nd harmonic's own
  // periodicity is itself a clean, high-correlation peak — it is not noise,
  // it is just the wrong period. Test the octave below the pick: if lag×2
  // correlates within 0.1 of the pick, the true fundamental is at least as
  // plausibly there, and a real single-cycle tone's autocorrelation never
  // drops much from one period to the next, so prefer the longer period.
  const idx2 = lag * 2 - minLag;
  if (idx2 < span && corr[idx2] >= corrVal) { lag *= 2; corrVal = corr[idx2]; }
  return {lag, corr: corrVal, hz: sampleRate / lag};
}

const hzToMidi = hz => 69 + 12 * Math.log2(hz / 440);

// group's own played key: the renderer's own field on each note (n.key for
// PS1, n.midi for N64 — see tools/psx/spu-render.mjs and tools/n64/render.mjs
// / rare.mjs; both already carry a `midi`-shaped field where PS1 carries
// `pitch`/`key` and N64 carries `midi`/`key`/`semitone` — pick whichever the
// note actually has)
function playedKey(n) { return n.pitch != null ? n.pitch : n.midi; }

// -> {[group.name]: {offset, measured, key, corr, reason}}, one entry per
// non-kit group (kit/drum groups are never measured — a kit's "pitch" is a
// slot index, not a note). renderOne(group, key) -> Float32Array | {l, r} |
// null, one held note (the caller renders 1 s at velocity 100 through the
// console's own renderer). sampleRate: the render's own rate (PS1 44100, N64
// 32000) — needed to turn the autocorrelation lag into Hz.
export async function soundingOffsets(groups, renderOne, {sampleRate = 44100} = {}) {
  const out = {};
  for (const g of groups) {
    if (g.kit || !g.notes || !g.notes.length) continue;
    const keys = g.notes.map(playedKey).filter(k => k != null).sort((a, b) => a - b);
    if (!keys.length) continue;
    const key = keys[Math.floor(keys.length / 2)]; // median played key
    let pcm = null, reason = null;
    try { pcm = await renderOne(g, key); } catch (err) { reason = "render failed: " + (err && err.message || err); }
    const mono = reason ? null : toMono(pcm);
    if (!reason && (!mono || !mono.length)) reason = "silent";
    if (reason) { out[g.name] = {offset: 0, measured: null, key, corr: 0, reason}; continue; }
    const skip = Math.round(sampleRate * SKIP_S);
    const winEnd = Math.min(mono.length, skip + Math.round(sampleRate * WINDOW_S));
    if (winEnd - skip < Math.round(sampleRate / MAX_HZ) * 3) { out[g.name] = {offset: 0, measured: null, key, corr: 0, reason: "too short to analyze"}; continue; }
    const window = mono.subarray(skip, winEnd);
    const peak = autocorrelate(window, sampleRate);
    if (!peak || peak.corr < CORR_THRESHOLD) {
      out[g.name] = {offset: 0, measured: null, key, corr: peak ? +peak.corr.toFixed(3) : 0, reason: "no clear pitch (corr " + (peak ? peak.corr.toFixed(2) : "0.00") + ")"};
      continue;
    }
    const measured = hzToMidi(peak.hz);
    const offset = (12 * Math.round((measured - key) / 12)) || 0; // || 0: normalize -0 (a measured pitch a hair under the written key) to a plain 0
    // ground truth never moves a note more than two octaves (tools/n64/
    // INTEGRATION.md §9.3/§9.6/§10.6) — a wider gap is autocorrelation
    // latching onto a harmonic/timbral peak, not the sample's root; report
    // it as unclear rather than apply an implausible shift
    if (Math.abs(offset) > 24) { out[g.name] = {offset: 0, measured: +measured.toFixed(2), key, corr: +peak.corr.toFixed(3), reason: "implausible offset (" + offset + "c at corr " + peak.corr.toFixed(2) + ") — treated as unclear"}; continue; }
    out[g.name] = {offset, measured: +measured.toFixed(2), key, corr: +peak.corr.toFixed(3), reason: null};
  }
  return out;
}

// Mutates `n[field] += offset` on every note of every shifted (non-kit,
// offset !== 0) group, and returns one capture warning per shifted group —
// "ch 0 inst 0: written an octave above what sounds — the roll shows the
// sounding pitch (−12)". field: "pitch" for PS1 (tools/psx/notes.mjs
// makeMidi reads it), "midi" for N64 (tools/n64/notes.mjs toMidi reads it).
// Called AFTER soundingOffsets, BEFORE the MIDI is written — the renderer's
// own fields (key, semitone) are never touched, so chip audio keeps
// rendering exactly as before.
export function applySoundingOffsets(groups, offsets, field) {
  const warnings = [];
  for (const g of groups) {
    if (g.kit) continue;
    const o = offsets[g.name];
    if (!o || !o.offset) continue;
    for (const n of g.notes) n[field] = (n[field] || 0) + o.offset;
    const octaves = Math.abs(o.offset) / 12;
    const word = octaves === 1 ? "an octave" : octaves === 2 ? "two octaves" : octaves + " octaves";
    const dir = o.offset < 0 ? "above" : "below";
    warnings.push(`${g.name}: written ${word} ${dir} what sounds — the roll shows the sounding pitch (${o.offset > 0 ? "+" : ""}${o.offset})`);
  }
  return warnings;
}
