// tools/instruments/verify.mjs — the extracted library against the drivers.
// For a song: its most-played instruments (and a kit slot when it has one),
// one real note each (its key, velocity and length), rendered twice — by the
// driver's own renderer (renderSpu / renderN64, the note alone, dry: no
// reverb, no volume ramps, slides or vibrato, channel volume 1, centred) and
// by play.mjs from instruments.json's data — then compared:
//   pitch   cents between the two renders' periods (autocorrelation), or their
//           spectral centroids for an unpitched sound
//   shape   Pearson correlation of the 5 ms RMS envelopes, key-on to silence
//   level   RMS over the note, dB
// The driver's stereo pair is folded back to the voice by its own pan law
// (PS1: l + r, linear; N64: (l + r) / (gL + gR), equal power).
//
//   node tools/instruments/verify.mjs <ripdir> <song regex> [--notes N]
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadPSFChain, assembleRam } from "../psx/psf.mjs";
import { psfSong } from "../psx/capture.mjs";
import { akaoArtOf } from "../psx/akao.mjs";
import { renderSpu } from "../psx/spu-render.mjs";
import { secondsAt } from "../psx/seq.mjs";
import { loadUSF } from "../n64/usf.mjs";
import { sequenceOfSet } from "../n64/capture.mjs";
import { renderN64, panGains as eadPanGains, ootPanGains, N64_RATE } from "../n64/render.mjs";
import { panGains as rarePanGains, findRareBanks, readRareBank } from "../n64/rare.mjs";
import { tickSeconds } from "../n64/seq-libultra.mjs";
import { rdramOf } from "../n64/usf.mjs";
import { parseSPC, runSPC } from "../spc/spc.mjs";
import { renderApu } from "../spc/apu-render.mjs";
import { resolveRoots } from "../spc/notes.mjs";
import { keyOnFacts, spcEnvelope, splitDrum, sampleKeyOf, SPC_RATE } from "./snes.mjs";
import { parseNSF, runNSF } from "../nsf/nsf.mjs";
import { reconstruct as nesReconstruct } from "../nsf/notes.mjs";
import { renderApu as renderApuNes } from "../nsf/apu-render.mjs";
import { parseGBS, runGBS, GB_CLOCK } from "../gbs/gbs.mjs";
import { reconstruct as gbReconstruct } from "../gbs/notes.mjs";
import { renderApu as renderApuGb } from "../gbs/apu-render.mjs";
import { traceReg, decodeVolReg, curveOf, pearson, meanAbsDiff, curveFromEnvelope, nesLevels, gbLevels, waveHashOf, NOISE_PERIODS, DUTY_FRAC,
         nesPeriodForKey, gbPulsePeriodForKey, gbWavePeriodForKey, pulseLevel, noiseLevel, CORR_MIN, MAD_MAX } from "./nes.mjs";
import { extractAlbum } from "./extract.mjs";
import { playNote, samplesFromLibrary } from "./play.mjs";
import { fft } from "./name.mjs";

// ---- measurements ------------------------------------------------------------------
export function rmsFrames(x, rate, ms = 5) {
  const F = Math.max(1, Math.round(rate * ms / 1000)), out = [];
  for (let i = 0; i < x.length; i += F) { let s = 0, n = 0; for (let k = i; k < Math.min(x.length, i + F); k++) { s += x[k] * x[k]; n++; } out.push(Math.sqrt(s / Math.max(1, n))); }
  return out;
}
export function correlation(a, b) {
  const n = Math.max(a.length, b.length);
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i] || 0; mb += b[i] || 0; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = (a[i] || 0) - ma, y = (b[i] || 0) - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : (saa === sbb ? 1 : 0);
}
const rms = x => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); };
// period by normalized autocorrelation (the first peak within 10% of the best: the octave
// guard); `near` searches only around another render's period
export function periodOf(x, rate, at, {W = 4096, near = null, minClarity = 0.8} = {}) {
  let minLag = Math.floor(rate / 3000), maxLag = Math.ceil(rate / 30);
  if (near) { minLag = Math.max(2, Math.floor(near * 0.97)); maxLag = Math.ceil(near * 1.03); }
  W = Math.min(W, x.length - maxLag - 2);
  if (W < 256) return null;
  if (at + W + maxLag + 1 > x.length) at = Math.max(0, x.length - W - maxLag - 1);
  let e0 = 0; for (let i = 0; i < W; i++) e0 += x[at + i] * x[at + i];
  if (e0 < 1e-12) return null;
  const r = new Float64Array(maxLag + 2);
  let best = 0;
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0, e1 = 0;
    for (let i = 0; i < W; i++) { const b = x[at + i + lag]; s += x[at + i] * b; e1 += b * b; }
    r[lag] = e1 > 0 ? s / Math.sqrt(e0 * e1) : 0;
    if (lag >= minLag && lag <= maxLag && r[lag] > best) best = r[lag];
  }
  if (best < minClarity) return null;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (r[lag] >= 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
      const a = r[lag - 1], b = r[lag], c = r[lag + 1], den = a - 2 * b + c;
      return {lag: den ? lag + 0.5 * (a - c) / den : lag, clarity: best};
    }
  }
  return null;
}
function centroid(x, rate, at) {
  const N = 4096, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[at + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  fft(re, im);
  let num = 0, den = 0;
  for (let k = 1; k < N / 2; k++) { const p = re[k] * re[k] + im[k] * im[k]; num += k * p; den += p; }
  return den ? num / den * rate / N : 0;
}
export function compare(driver, lib, rate, hold) {
  const n = Math.max(driver.length, lib.length);
  const a = new Float32Array(n), b = new Float32Array(n); a.set(driver); b.set(lib);
  const fa = rmsFrames(a, rate), fb = rmsFrames(b, rate);
  // the note's life: until both are 60 dB below their peaks
  const pk = Math.max(...fa, ...fb), end = Math.max(lastAbove(fa, pk * 1e-3), lastAbove(fb, pk * 1e-3)) + 1;
  const shape = correlation(fa.slice(0, end), fb.slice(0, end));
  const F = Math.round(rate * 0.005), len = end * F;
  const level = 20 * Math.log10(rms(a.subarray(0, len)) / Math.max(1e-12, rms(b.subarray(0, len))));
  const at = Math.min(Math.round(Math.max(0.03, Math.min(0.12, hold * 0.4)) * rate), Math.max(0, len - 4096));
  // the driver's period, then the library's searched near it (and the other way when the driver's is unclear)
  let pa = periodOf(a, rate, at), pb = pa ? periodOf(b, rate, at, {near: pa.lag, minClarity: 0.5}) : null;
  if (!pa || !pb) { pb = periodOf(b, rate, at); pa = pb ? periodOf(a, rate, at, {near: pb.lag, minClarity: 0.5}) : null; }
  let pitch, how;
  if (pa && pb) { pitch = 1200 * Math.log2(pa.lag / pb.lag); how = "period"; }
  else { const ca = centroid(a, rate, at), cb = centroid(b, rate, at); pitch = ca && cb ? 1200 * Math.log2(cb / ca) : NaN; how = "centroid"; }
  return {pitch, how, shape, level, seconds: len / rate};
}
const lastAbove = (f, t) => { for (let i = f.length - 1; i >= 0; i--) if (f[i] > t) return i; return 0; };

// ---- notes to check ------------------------------------------------------------------
function pickNotes(notes, keyOf, clean, max) {
  const by = new Map();
  for (const n of notes) { if (!clean(n)) continue; const k = keyOf(n); (by.get(k) || by.set(k, []).get(k)).push(n); }
  const groups = [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  const out = [], kit = groups.find(([k]) => /^kit/.test(k));
  for (const [k, ns] of groups.slice(0, max)) out.push([k, ns]);
  if (kit && !out.some(([k]) => k === kit[0])) out[out.length - 1] = kit;
  return out.map(([k, ns]) => { const s = ns.slice().sort((a, b) => a.len - b.len); return {group: k, n: s[s.length >> 1].n}; });
}

// each picked note as played, then the same note held 2 s (real notes are short; this exercises the held shape and the release)
function withHeld(picks, ticks2s, lengthen) {
  const out = [];
  for (const p of picks) out.push(p);
  for (const p of picks) out.push({...p, n: lengthen(p.n, ticks2s()), long: true});
  return out;
}

async function verifyPsx(dir, file, lib, maxNotes) {
  const bytes = readFileSync(join(dir, file));
  const chain = await loadPSFChain(bytes, n => { const p = join(dir, n); return existsSync(p) ? readFileSync(p) : null; }, {name: file});
  const {ram, ranges} = assembleRam(chain);
  const song = psfSong(ram, ranges, file);
  const r = song.result, seq = {...r.seq, loop: null};
  const samples = samplesFromLibrary(lib);
  const withLen = r.notes.filter(n => !n.unrolled).map(n => ({n, len: n.endTick - n.tick}));
  const picks = pickNotes(withLen.map(x => ({...x, n: x.n})), x => x.n.drum ? "kit" + x.n.key : "art" + (x.n.program >= 0x80 ? "s" + x.n.program : akaoArtOf(x.n)),
    x => x.len >= 6, maxNotes);
  const rows = [];
  const tickAt = secs => { let t = 1; while (secondsAt(seq, t) < secs) t++; return t; };
  for (const {group, n: n0, long} of withHeld(picks, () => tickAt(2), (n, t) => ({...n, endTick: n.tick + t}))) {
    const n = n0;
    const note = {...n, tick: 0, endTick: n.endTick - n.tick, gain: undefined, slide: undefined, unrolled: false};
    const one = {...r, notes: [note], seq, bends: []};
    const hold = secondsAt(seq, note.endTick);
    const out = await renderSpu(one, {ram, table: song.table, bank: song.bank, sampleRate: 44100, keepSeconds: hold + 8});
    const trk = Object.values(out).find(x => x && x.l);
    const drv = new Float32Array(trk.l.length); for (let i = 0; i < drv.length; i++) drv[i] = trk.l[i] + trk.r[i];
    const inst = findInstrument(lib, r.seq, n, "psx");
    if (!inst) { rows.push({group, error: "not in the library"}); continue; }
    const mine = playNote(inst, samples, {key: n.key, vel: n.vel, hold: Math.floor(hold * 44100) / 44100, sampleRate: 44100, tail: 30});
    rows.push({group, long, id: inst.id, name: inst.nameGuess, key: n.key, vel: n.vel, hold: +hold.toFixed(3), ...compare(drv, mine, 44100, hold)});
  }
  return rows;
}
// the library instrument a note plays: by the usage record (song + key), the driver's own identity
function findInstrument(lib, _seq, n, fam) {
  const cands = lib.instruments.filter(i => i.used);
  if (fam === "psx") {
    if (n.drum) return cands.find(i => i.kind === "drum-kit" && i.keyRegions.some(r => r.keyLo === n.key && r.raw && r.raw.art === n.tone.instrument && r.raw.key === n.tone.key));
    if (n.program >= 0x80 && n.tone) return cands.find(i => i.raw && i.raw.kind === "akao-key-split" && i.program === n.program);
    const a = akaoArtOf(n);
    return cands.find(i => i.driver === "akao" && i.bank !== "split" && i.bank !== "kit" && i.program === a);
  }
  return null;
}

function verifyN64(dir, file, lib, maxNotes) {
  const libs = readdirSync(dir).filter(f => /\.usflib$/i.test(f)).map(n => ({name: n, bytes: new Uint8Array(readFileSync(join(dir, n)))}));
  const set = loadUSF([{name: file, bytes: new Uint8Array(readFileSync(join(dir, file)))}, ...libs]);
  const {seq, res, loc} = sequenceOfSet(set);
  const rare = res.driver === "rare" || loc.gen === "rare";
  const gen = rare ? "rare" : loc.gen;
  const samples = samplesFromLibrary(lib);
  let rate = N64_RATE, bank = null;
  if (rare) { const list = findRareBanks(rdramOf(set.state).ram); bank = readRareBank(rdramOf(set.state).ram, set.rom, (list[seq.banks[0]] || list[0]).at); rate = bank.sampleRate; }
  const withLen = res.notes.map(n => ({n, len: n.dur}));
  const picks = pickNotes(withLen, x => x.n.drum ? "kit" + (rare ? x.n.inst + ":" + x.n.key : x.n.semitone) : "inst" + x.n.inst,
    x => x.len >= 6 && (x.n.drum || (x.n.inst != null && x.n.inst < 0x7E)), maxNotes); // slides, glides and vibrato are the song's: stripped below
  const rows = [];
  return (async () => {
    let t2 = 1; while (tickSeconds(res.tempos, t2) < 2) t2++;
    for (const {group, n, long} of withHeld(picks, () => t2, (x, t) => ({...x, dur: t}))) {
      const note = rare ? {...n, tick: 0, gain: undefined, slide: undefined, bend: 0, rev: 0, vol: 1, pan: 64}
        : {...n, tick: 0, gain: undefined, slide: undefined, vib: null, vibChanges: undefined, porta: null, rev: 0, freq: 1, vol: 1, pan: 0.5, panWeight: 1,
           chEnv: null, chRel: null, lyAdsr: null, chInst: n.drum ? n.chInst : n.inst, filter: null, comb: null, chGain: 0, chSustain: 0};
      const one = {...res, notes: [note], endTick: note.dur, ducked: []};
      const hold = tickSeconds(res.tempos, note.dur);
      const out = await renderN64(one, {set, banks: seq.banks, sampleRate: rate, keepSeconds: hold + 8, reverb: null, reverbs: null, meter: {tsNum: 4, tsDen: 4}, stereo: true});
      const trk = Object.entries(out).find(([k, x]) => x && x.l);
      if (!trk) { rows.push({group, error: "the driver rendered nothing"}); continue; }
      const {l, r: rr} = trk[1];
      let g;
      if (rare) { const snd = bank.sound(bank.instrument(n.inst), n.key, n.vel); const pg = rarePanGains(snd ? snd.samplePan : 64); g = pg.l + pg.r; }
      // EAD: channel pan 0.5 at weight 1 puts every voice (a drum's own pan too) at the centre
      else if (gen === "oot") { const [a, b] = ootPanGains(note, null); g = a + b; }
      else { const [a, b] = eadPanGains(0.5); g = a + b; }
      const drv = new Float32Array(l.length); for (let i = 0; i < drv.length; i++) drv[i] = (l[i] + rr[i]) / g;
      const inst = findN64(lib, seq, n, gen, rare ? bank : null);
      if (!inst) { rows.push({group, error: "not in the library"}); continue; }
      const key = rare ? n.key : n.drum ? n.semitone : n.midi;
      const mine = playNote(inst, samples, {key, vel: n.vel, hold, sampleRate: rate, tail: 30});
      rows.push({group, long, id: inst.id, name: inst.nameGuess, key, vel: n.vel, hold: +hold.toFixed(3), ...compare(drv, mine, rate, hold)});
    }
    return rows;
  })();
}
function findN64(lib, seq, n, gen, rareBank) {
  const used = lib.instruments;
  if (gen === "rare") { const at = "0x" + rareBank.at.toString(16); return used.find(i => i.driver === "rare" && i.bank === at && i.program === rareBank.instrument(n.inst).index); }
  const b = seq.banks[n.bank || 0];
  if (n.drum) return used.find(i => i.driver === "ead-" + gen && i.bank === b && i.kind === "drum-kit");
  return used.find(i => i.driver === "ead-" + gen && i.bank === b && i.program === n.inst) || used.find(i => i.driver === "ead-" + gen && i.bank === b && String(i.program) === String(n.inst));
}

// SNES: no driver to ask "what instrument is this" — the same per-song
// grouping snes.mjs uses before an instrument is built (a drum use and a
// melodic use of the same sample are separate candidates), picked by how
// often each one key-onned (a drum candidate guaranteed a slot, as
// psx/n64's pickNotes does), each rendered twice: apu-render.mjs from a
// synthetic one-voice DSP log (KON at sample 0, KOFF at the note's real
// hold, against the SAME song's captured ARAM — the real sample bytes),
// and play.mjs from the library. VOL L/R (0..127) doubles as velocity, so
// the synthetic render's VOL and playNote's vel are the same captured
// number. verifySong only ever extracts the ONE song under test, so the
// library's instrument identity (the sample's content hash, same as
// extraction — snes.mjs's `sampleKeyOf`) is resolved here the same way,
// not by this song's own SRCN numbers (which extraction no longer keys
// on at all). A picked note whose own (ADSR1, ADSR2, GAIN) is not the
// instrument's chosen envelope (chooseEnvelope's majority — see snes.mjs)
// is a "variant" note: play.mjs is given a copy of the instrument with
// THAT note's own envelope instead, so the comparison still holds
// pitch/level/shape to the note actually played, not to the envelope the
// library settled on; the row says so (`variant: true`) rather than
// silently failing shape.
async function verifySnes(dir, file, lib, maxNotes) {
  const bytes = readFileSync(join(dir, file));
  const spc = parseSPC(bytes);
  const seconds = Math.max(20, Math.min((spc.tags.seconds || 45) + (spc.tags.fadeMs || 0) / 1000, 90));
  const cap = runSPC(spc, seconds);
  const byKey = new Map(resolveRoots(cap.instruments).map(i => [i.key, i]));
  const facts = keyOnFacts(cap).filter(f => f.endSample - f.startSample >= SPC_RATE * 0.05);
  const bySrcn = new Map();
  for (const f of facts) (bySrcn.get(f.srcn) || bySrcn.set(f.srcn, []).get(f.srcn)).push(f);
  const candidates = []; // {group, isDrum, keyons}
  for (const [srcn, ks] of bySrcn) {
    const {drumKeyons, melodicKeyons} = splitDrum(ks);
    if (drumKeyons.length) candidates.push({group: `src${srcn} drum`, isDrum: true, keyons: drumKeyons});
    if (melodicKeyons.length) candidates.push({group: `src${srcn} melodic`, isDrum: false, keyons: melodicKeyons});
  }
  const ranked = candidates.sort((a, b) => b.keyons.length - a.keyons.length);
  const pick = c => { const s = c.keyons.slice().sort((a, b) => (a.endSample - a.startSample) - (b.endSample - b.startSample)); return {...c, n: s[s.length >> 1]}; };
  const picks = ranked.slice(0, maxNotes).map(pick);
  const drum = ranked.find(c => c.isDrum);
  if (drum && !picks.some(p => p.isDrum)) picks[picks.length - 1] = pick(drum);

  const samples = samplesFromLibrary(lib);
  const rows = [];
  const t2s = SPC_RATE * 2;
  for (const {group, isDrum, n, long} of [...picks.map(p => ({...p, long: false})), ...picks.map(p => ({...p, long: true}))]) {
    const holdSamples = long ? t2s : (n.endSample - n.startSample);
    const hold = holdSamples / SPC_RATE;
    const vel = Math.max(1, Math.min(127, Math.round((Math.abs(n.volL) + Math.abs(n.volR)) / 2)));
    const dsp0 = new Uint8Array(128);
    dsp0[0x5D] = n.dir; dsp0[4] = n.srcn; dsp0[5] = n.adsr1; dsp0[6] = n.adsr2; dsp0[7] = n.gain;
    dsp0[0] = vel; dsp0[1] = vel; dsp0[2] = n.pitch & 0xFF; dsp0[3] = (n.pitch >> 8) & 0x3F;
    dsp0[0x0C] = 127; dsp0[0x1C] = 127;
    const total = holdSamples + Math.round(2 * SPC_RATE);
    const dspLog = [{sample: 0, addr: 0x4C, value: 1}, {sample: holdSamples, addr: 0x5C, value: 1}];
    const out = await renderApu({dspLog, dsp0, ram: cap.ram, samples: total}, {sampleRate: SPC_RATE});
    const drv = out.voice0;
    // the library's own classification decides playback (fixedPitch or not), not this
    // function's locally re-derived `isDrum` — its note set (duration-filtered) can
    // disagree with extraction's at the margin. Matched by id, built from the sample's
    // content hash the same way extraction does (snes.mjs's sampleKeyOf + buildInstrument) —
    // a song's own SRCN number is not part of the instrument's identity, and
    // `keyRegions[0].sample` is model.mjs's OWN (separately computed) hash, not this one.
    const sample = byKey.get(n.srcn + "@" + n.start.toString(16));
    const expectedId = sample && `spc:${sampleKeyOf(sample).slice(4, 12)}:${isDrum ? "drum" : "inst"}`;
    const inst = expectedId && lib.instruments.find(i => i.id === expectedId);
    if (!inst) { rows.push({group, error: "not in the library"}); continue; }
    const variant = inst.raw.adsr1 !== n.adsr1 || inst.raw.adsr2 !== n.adsr2 || inst.raw.gain !== n.gain;
    const forPlay = variant ? {...inst, envelope: spcEnvelope(n.adsr1, n.adsr2, n.gain)} : inst;
    const key = inst.kind === "drum-kit" ? inst.keyRegions[0].keyLo : inst.keyRegions[0].rootKey + 12 * Math.log2(n.pitch / 4096);
    const mine = playNote(forPlay, samples, {key, vel, hold, sampleRate: SPC_RATE, tail: 2});
    rows.push({group, long, variant, id: inst.id, name: inst.nameGuess, key: Math.round(key), vel, hold: +hold.toFixed(3), ...compare(drv, mine, SPC_RATE, hold)});
  }
  return rows;
}

// NES/GB: unlike PS1/N64/SNES, renderApu already keeps every channel in
// its OWN buffer (no polyphonic mixing to undo), so the driver's honest
// render is just that ONE channel's captured onset registers replayed
// alone — no other channel is ever enabled, so no isolation trick beyond
// that is needed. A length-counter reload of index 1 (raw value 254,
// ~2.1s at the 120 Hz half-frame clock) keeps the channel enabled through
// both the as-played and the 2s-held variants without ever re-writing the
// envelope register (which would restart its decay). nes.mjs's own
// extraction clusters by a SIMILARITY merge (near-identical curves join
// one instrument, not just identical ones — see nes.mjs's header), so a
// freshly-picked note's expected instrument isn't a pure function of its
// own facts any more; instead `findChipInstrument` (below) does what
// extraction itself does — finds the candidate (same channel + groupKey)
// whose stored envelope curve correlates best with this note's own. Only
// track 1 of a multi-track .nsf/.gbs is checked — a spot check, not a
// full album re-derivation.
const NES_BASE = {pulse1: 0x4000, pulse2: 0x4004, triangle: 0x4008, noise: 0x400C};
const NES_ENABLE = {pulse1: 1, pulse2: 2, triangle: 4, noise: 8};
const NES_HOLD_LEN = 1 << 3; // r3 length-counter index 1 (value 254, ~2.1s) written once at onset only

// the library's own best match for a note's curve, among instruments sharing
// its (console, channel, groupKey) — the SAME two-part test clusterByShape
// merges with (correlation alone is not enough: it's undefined-by-convention
// (scored 1) whenever either curve is flat, so among several candidates a
// flat one can out-"correlate" a real close match — mean absolute difference,
// not correlation, breaks the tie). Candidates outside the merge bar entirely
// (this pick's own song plays a decay no library cluster is close enough to)
// still get the closest one by level, so the row reports a real comparison
// rather than "not in the library" for a note that legitimately has no twin.
function findChipInstrument(lib, console_, channel, groupKey, curve, frameSec) {
  const candidates = lib.instruments.filter(i => i.driver === console_ && i.raw && i.raw.channel === channel && i.raw.groupKey === groupKey);
  let best = null, bestMad = Infinity, fallback = null, fallbackMad = Infinity;
  for (const inst of candidates) {
    const instCurve = curveFromEnvelope(inst.envelope, frameSec);
    const c = pearson(curve, instCurve), m = meanAbsDiff(curve, instCurve);
    if (m < fallbackMad) { fallbackMad = m; fallback = inst; }
    if (c >= CORR_MIN && m <= MAD_MAX && m < bestMad) { bestMad = m; best = inst; }
  }
  return best || fallback;
}

async function verifyNes(dir, file, lib, maxNotes) {
  const nsf = parseNSF(readFileSync(join(dir, file)));
  const cap = runNSF(nsf, 1, 50);
  const events = nesReconstruct(cap.apuLog, cap.frames, cap.frameSec).filter(e => e.endFrame - e.startFrame >= 4);
  const groupOf = e => e.channel + (e.channel === "noise" ? ":p" + e.midi : e.channel === "triangle" ? "" : ":d" + e.duty);
  const picks = pickNotes(events.map(n => ({n, len: n.endFrame - n.startFrame})), x => groupOf(x.n), () => true, maxNotes);
  const capFrames16 = Math.round(2 / cap.frameSec);
  const rows = [];
  for (const kind of ["pulse1", "pulse2", "triangle", "noise"]) {
    const evs = events.filter(e => e.channel === kind);
    const volTr = traceReg(cap.apuLog, evs, () => (kind === "noise" ? 0x400C : NES_BASE[kind]));
    const ctlTr = kind === "noise" ? traceReg(cap.apuLog, evs, () => 0x400E) : null;
    for (const {group, n: n0} of picks) {
      if (n0.channel !== kind) continue;
      const i = evs.indexOf(n0);
      for (const long of [false, true]) {
        const hold = long ? 1.8 : Math.max(0.05, (n0.endFrame - n0.startFrame) * cap.frameSec);
        const holdSamples = Math.round(hold * 44100), tailSamples = Math.round(0.3 * 44100);
        const N = holdSamples + tailSamples;
        // "frame" = sample index throughout (frameSec = 1/44100), so a
        // release write at holdSamples lands exactly at key-off — without
        // it the driver channel never stops, while play.mjs's own release
        // curve always kicks in at `hold`, and comparing a still-sounding
        // driver against an already-releasing render is not a fair "shape"
        const release = {frame: holdSamples, addr: 0x4015, value: 0};
        let inst, key, vel, driverBuf;
        if (kind === "triangle") {
          const period = nesPeriodForKey(n0.midi, "triangle"); // the period for the ROUNDED key, not the raw captured one — see nes.mjs's header on nesPeriodForKey
          const log = [{frame: 0, addr: 0x4015, value: NES_ENABLE.triangle}, {frame: 0, addr: 0x4008, value: 0x7F},
            {frame: 0, addr: 0x400A, value: period & 0xFF}, {frame: 0, addr: 0x400B, value: ((period >> 8) & 7) | NES_HOLD_LEN}, release];
          driverBuf = renderApuNes(log, N, 1 / 44100, {sampleRate: 44100, keepFrames: N}).triangle;
          inst = findChipInstrument(lib, "nes", "triangle", "tri", curveOf(new Float64Array(capFrames16).fill(1)), cap.frameSec);
          key = n0.midi; vel = 100;
        } else {
          const onset = volTr[i].onset;
          const levels = nesLevels(kind === "noise" ? "noise" : "pulse", onset, volTr[i].during, capFrames16);
          const curve = curveOf(levels);
          const log = [{frame: 0, addr: 0x4015, value: NES_ENABLE[kind]}, {frame: 0, addr: NES_BASE[kind], value: onset}, release];
          let groupKey;
          if (kind === "noise") {
            const ctl = ctlTr[i].onset, period = NOISE_PERIODS[ctl & 0x0F], mode = (ctl >> 7) & 1;
            groupKey = "p" + period + "m" + mode;
            log.push({frame: 0, addr: 0x400E, value: ctl}, {frame: 0, addr: 0x400F, value: NES_HOLD_LEN});
          } else {
            groupKey = "duty" + DUTY_FRAC[decodeVolReg(onset).duty];
            const period = nesPeriodForKey(n0.midi, "pulse");
            log.push({frame: 0, addr: NES_BASE[kind] + 2, value: period & 0xFF},
              {frame: 0, addr: NES_BASE[kind] + 3, value: ((period >> 8) & 7) | NES_HOLD_LEN});
          }
          inst = findChipInstrument(lib, "nes", kind, groupKey, curve, cap.frameSec);
          driverBuf = renderApuNes(log, N, 1 / 44100, {sampleRate: 44100, keepFrames: N})[kind];
          key = kind === "noise" ? (inst ? inst.keyRegions[0].keyLo : n0.midi) : n0.midi;
          const dec = decodeVolReg(onset), law = kind === "noise" ? noiseLevel : pulseLevel;
          vel = Math.max(1, Math.min(127, Math.round((dec.constVol ? law(dec.val) : 1) * 127)));
        }
        if (!inst) { rows.push({group, long, error: "not in the library"}); continue; }
        const drv = driverBuf.subarray(0, N);
        const mine = playNote(inst, samplesFromLibrary(lib), {key, vel, hold, sampleRate: 44100, tail: 0.3});
        rows.push({group, long, id: inst.id, name: inst.nameGuess, key, vel, hold: +hold.toFixed(3), ...compare(drv, mine, 44100, hold)});
      }
    }
  }
  return rows;
}

const GB_ROUTE = {pulse1: 0x11, pulse2: 0x22, wave: 0x44, noise: 0x88};
function gbWaveRamAt(apuLog, atFrame) { // apuLog is frame-ordered — stop once past atFrame
  const ram = new Uint8Array(32);
  for (const w of apuLog) {
    if (w.frame > atFrame) break;
    if (w.addr < 0xFF30 || w.addr > 0xFF3F) continue;
    const i = (w.addr - 0xFF30) * 2;
    ram[i] = w.value >> 4; ram[i + 1] = w.value & 0x0F;
  }
  return ram;
}
async function verifyGb(dir, file, lib, maxNotes) {
  const gbs = parseGBS(readFileSync(join(dir, file)));
  const cap = runGBS(gbs, 1, 50);
  const events = gbReconstruct(cap.apuLog, cap.frames, cap.frameSec).filter(e => e.endFrame - e.startFrame >= 4);
  const groupOf = e => e.channel + (e.channel === "noise" ? ":s" + e.midi : e.channel === "wave" ? "" : ":d" + e.duty);
  const picks = pickNotes(events.map(n => ({n, len: n.endFrame - n.startFrame})), x => groupOf(x.n), () => true, maxNotes);
  const samples = samplesFromLibrary(lib);
  const capFrames16 = Math.round(2 / cap.frameSec);
  const rows = [];
  for (const kind of ["pulse1", "pulse2", "wave", "noise"]) {
    const evs = events.filter(e => e.channel === kind);
    const envAddr = kind === "pulse1" ? 0xFF12 : kind === "pulse2" ? 0xFF17 : kind === "noise" ? 0xFF21 : null;
    const tr = envAddr ? traceReg(cap.apuLog, evs, () => envAddr) : null;
    for (const {group, n: n0} of picks) {
      if (n0.channel !== kind) continue;
      const i = evs.indexOf(n0);
      for (const long of [false, true]) {
        const hold = long ? 1.8 : Math.max(0.05, (n0.endFrame - n0.startFrame) * cap.frameSec);
        const holdSamples = Math.round(hold * 44100), tailSamples = Math.round(0.3 * 44100);
        const renderSecs = (holdSamples + tailSamples) / 44100 + 0.02;
        // cycle (not frame) carries the release's exact timing — see nes.mjs's
        // header note on the same fair-comparison rule for NES's release write
        const release = {frame: 0, cycle: Math.round((holdSamples / 44100) * GB_CLOCK), addr: 0xFF25, value: 0};
        const log = [{frame: 0, addr: 0xFF26, value: 0x80}, {frame: 0, addr: 0xFF24, value: 0x77}, {frame: 0, addr: 0xFF25, value: GB_ROUTE[kind]}, release];
        let inst, key, vel;
        if (kind === "wave") {
          const w = gbWaveRamAt(cap.apuLog, n0.startFrame);
          const period = gbWavePeriodForKey(n0.midi, n0.waveCycles || 1); // rounded-key period — see nesPeriodForKey's header
          for (let b = 0; b < 16; b++) log.push({frame: 0, addr: 0xFF30 + b, value: (w[b * 2] << 4) | w[b * 2 + 1]});
          log.push({frame: 0, addr: 0xFF1A, value: 0x80}, {frame: 0, addr: 0xFF1C, value: 0x20},
            {frame: 0, addr: 0xFF1D, value: period & 0xFF}, {frame: 0, addr: 0xFF1E, value: 0x80 | ((period >> 8) & 7)});
          inst = findChipInstrument(lib, "gb", "wave", "wave:" + waveHashOf(w), curveOf(new Float64Array(capFrames16).fill(1)), cap.frameSec);
          key = n0.midi; vel = Math.max(1, Math.min(127, Math.round((n0.vol ?? 15) / 15 * 127)));
        } else if (kind === "noise") {
          const onset = tr[i].onset;
          log.push({frame: 0, addr: 0xFF20, value: 0}, {frame: 0, addr: 0xFF21, value: onset},
            {frame: 0, addr: 0xFF22, value: (n0.midi << 4) | ((n0.lfsr7 || 0) << 3)}, {frame: 0, addr: 0xFF23, value: 0x80});
          const curve = curveOf(gbLevels(onset, capFrames16, cap.frameSec));
          const groupKey = "s" + n0.midi + "w" + (n0.lfsr7 || 0);
          inst = findChipInstrument(lib, "gb", "noise", groupKey, curve, cap.frameSec);
          key = inst ? inst.keyRegions[0].keyLo : n0.midi;
          vel = Math.max(1, Math.min(127, Math.round((n0.vol ?? 15) / 15 * 127)));
        } else {
          const onset = tr[i].onset;
          const base = kind === "pulse1" ? 0xFF10 : 0xFF15;
          const period = gbPulsePeriodForKey(n0.midi); // rounded-key period — see nesPeriodForKey's header
          log.push({frame: 0, addr: base + 1, value: n0.duty << 6}, {frame: 0, addr: base + 2, value: onset},
            {frame: 0, addr: base + 3, value: period & 0xFF}, {frame: 0, addr: base + 4, value: 0x80 | ((period >> 8) & 7)});
          const curve = curveOf(gbLevels(onset, capFrames16, cap.frameSec));
          const groupKey = "duty" + DUTY_FRAC[n0.duty ?? 2];
          inst = findChipInstrument(lib, "gb", kind, groupKey, curve, cap.frameSec);
          key = n0.midi; vel = Math.max(1, Math.min(127, Math.round((onset >> 4) / 15 * 127)));
        }
        if (!inst) { rows.push({group, long, error: "not in the library"}); continue; }
        const out = await renderApuGb(log, 1, renderSecs, {sampleRate: 44100, keepFrames: 1});
        const drv = out[kind].subarray(0, holdSamples + tailSamples);
        const mine = playNote(inst, samples, {key, vel, hold, sampleRate: 44100, tail: 0.3});
        rows.push({group, long, id: inst.id, name: inst.nameGuess, key, vel, hold: +hold.toFixed(3), ...compare(drv, mine, 44100, hold)});
      }
    }
  }
  return rows;
}

export async function verifySong(dir, songRe, {maxNotes = 5} = {}) {
  const files = readdirSync(dir).filter(f => (/\.(mini)?(psf|usf)$/i.test(f) || /\.spc$/i.test(f) || /\.(nsf|gbs)$/i.test(f)) && songRe.test(f));
  if (!files.length) throw new Error("no song matching " + songRe + " in " + dir);
  const file = files[0];
  const lib = await extractAlbum(dir, {slug: path.basename(dir), only: new RegExp("^" + file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$")});
  const rows = /psf$/i.test(file) ? await verifyPsx(dir, file, lib, maxNotes) : /usf$/i.test(file) ? await verifyN64(dir, file, lib, maxNotes)
    : /nsf$/i.test(file) ? await verifyNes(dir, file, lib, maxNotes) : /gbs$/i.test(file) ? await verifyGb(dir, file, lib, maxNotes)
    : await verifySnes(dir, file, lib, maxNotes);
  return {file, rows};
}

export function formatRows(file, rows) {
  const lines = [`## ${file}`];
  for (const r of rows) {
    if (r.error) { lines.push(`  ${r.group}: ${r.error}`); continue; }
    const ok = Math.abs(r.pitch) <= 5 && r.shape > 0.95 && Math.abs(r.level) <= 1;
    lines.push(`  ${ok ? "ok  " : "FAIL"} ${r.long ? "held " : "as is"} ${r.name.padEnd(16)} ${r.id.padEnd(30)} key ${String(r.key).padStart(3)} vel ${String(r.vel).padStart(3)} hold ${r.hold.toFixed(3)}s  pitch ${r.pitch.toFixed(2)}¢ (${r.how})  shape ${r.shape.toFixed(4)}  level ${r.level.toFixed(2)} dB${r.variant ? "  [variant envelope]" : ""}`);
  }
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, re, ...rest] = process.argv.slice(2);
  const maxNotes = rest[0] === "--notes" ? +rest[1] : 5;
  verifySong(dir, new RegExp(re, "i"), {maxNotes}).then(({file, rows}) => console.log(formatRows(file, rows)), e => { console.error(e.stack || e); process.exit(1); });
}
