import { parseChordSym } from "../theory/chords.js";
import { LETTER_PC } from "../theory/chords.js";
import { CHORD_TEMPLATES } from "../theory/chords.js";
import { chordQualParse } from "../theory/chords.js";
import { barTicks } from "../model/rollnotes.js";
import { beatTicks } from "../model/grid.js";
import { sfDeclaredAt } from "../model/song.js";
import { keyNameAt } from "../model/song.js";
import { modeOfName } from "../theory/key.js";
import { tonicPcOfName } from "../theory/key.js";
import { S } from "../state.js";

// ---- BASSIST: chord-driven bass generation (advisor-designed, 2026-08-23).
// Mirrors the Drummer's contract: seeded takes, replace-in-range as ONE group
// undo, per-bar substreams keyed by section label, declared structure first.
// Pitch truth: the chord bands. When none exist, an INTERNAL harmonic sketch
// is inferred from a melody track (duration+metric-weighted PC census — his
// own analysis method, automated). The sketch is never displayed and never
// written anywhere: naming chords is Josh's job; bass notes are the only
// output (his explicit melody-only "idea machine" ask, 2026-08-23). ----
export function bsChordTone(label) { // label -> {rootPc, bassPc, tones[] (pcs)} or null
  const m = parseChordSym(label);
  if (!m) return null;
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const rootPc = ((LETTER_PC[m[1]] + acc) % 12 + 12) % 12;
  let tones = null;
  const hit = CHORD_TEMPLATES.find(([suf]) => suf === (m[3] || ""));
  if (hit) tones = hit[1];
  else {
    const q = chordQualParse(m[3] || "");
    if (q) tones = q.base === "m" ? [0, 3, 7] : q.base === "dim" ? [0, 3, 6]
                 : q.base === "aug" ? [0, 4, 8] : q.base === "sus2" ? [0, 2, 7]
                 : q.base === "sus4" ? [0, 5, 7] : q.base === "5" ? [0, 7] : [0, 4, 7];
  }
  if (!tones) tones = [0, 7]; // unreadable quality: ride root+fifth
  let bassPc = rootPc;
  if (m[4]) {
    const bm = m[4].match(/^([A-G])([#b]?)/);
    if (bm) bassPc = ((LETTER_PC[bm[1]] + (bm[2] === "#" ? 1 : bm[2] === "b" ? -1 : 0)) % 12 + 12) % 12;
  }
  return {rootPc, bassPc, tones: tones.map(x => (x + rootPc) % 12), readable: !!hit || !!chordQualParse(m[3] || "")};
}
export function bsInferTimeline(t0, t1, melodyTis, seedRng) { // INTERNAL sketch only — never shown
  const bt = barTicks(), qt = beatTicks();
  const sf = sfDeclaredAt(t0);
  const tonic = sf === null || sf === undefined ? null : ((sf * 7) % 12 + 12) % 12;
  const MAJ = [0, 2, 4, 5, 7, 9, 11];
  const scale = tonic === null ? null : MAJ.map(x => (x + tonic) % 12);
  // candidate triads: diatonic to the declared key when there is one, else all
  // 24. A declared MINOR key also admits harmonic minor's V (major) and vii°
  // (raised 7th) — the graveyard-B failure: an E# over F#m had no candidate
  // that could hold it, so every seed shuffled equally-wrong diatonic picks.
  const cands = [];
  if (scale) {
    for (let i = 0; i < 7; i++)
      cands.push({rootPc: scale[i], tones: [scale[i], scale[(i + 2) % 7], scale[(i + 4) % 7]]});
    const kn = keyNameAt(t0);
    if (kn && modeOfName(kn) === "minor") {
      const mt = tonicPcOfName(kn);
      if (mt !== null) {
        cands.push({rootPc: (mt + 7) % 12, tones: [(mt + 7) % 12, (mt + 11) % 12, (mt + 2) % 12]});  // V major
        cands.push({rootPc: (mt + 11) % 12, tones: [(mt + 11) % 12, (mt + 2) % 12, (mt + 5) % 12]}); // vii°
      }
    }
  } else for (let pc = 0; pc < 12; pc++) {
    cands.push({rootPc: pc, tones: [pc, (pc + 4) % 12, (pc + 7) % 12]});
    cands.push({rootPc: pc, tones: [pc, (pc + 3) % 12, (pc + 7) % 12]});
  }
  const tis = Array.isArray(melodyTis) ? melodyTis : [melodyTis];
  const out = [];
  let prevRoot = null;
  for (let bs = Math.floor(t0 / bt) * bt; bs < t1; bs += bt) {
    const w = new Map(); // duration + metric weighted PC census (his own method)
    for (const ti of tis) for (const n of S.song.tracks[ti].notes) {
      if (n.gone || n.t + n.d <= bs || n.t >= bs + bt) continue;
      const dur = Math.min(n.t + n.d, bs + bt) - Math.max(n.t, bs);
      const onBeat = Math.abs(((n.t - bs) % qt)) < 5 ? 1.5 : 1;
      const pc = n.p % 12;
      w.set(pc, (w.get(pc) || 0) + dur * onBeat);
    }
    if (!w.size) { out.push(prevRoot ? {...prevRoot, t: bs, end: bs + bt} : null); continue; }
    let barMass = 0; for (const wt of w.values()) barMass += wt;
    const scored = cands.map(c => {
      let sc = 0;
      for (const [pc, wt] of w) sc += c.tones.includes(pc) ? wt : -wt * 0.35;
      const rw = w.get(c.rootPc); // a sounded root outranks an implied one
      if (rw) sc += rw * 0.15;
      // smoothness prior, additive and mass-scaled: a solo line prolonging one
      // harmony must not read as a new root every bar (multiplicative ×1.15
      // was too weak to hold a pedal, and AMPLIFIED negative scores)
      if (prevRoot && c.rootPc === prevRoot.rootPc && sc > 0) sc += barMass * 0.45;
      return {c, sc};
    }).sort((a, b) => b.sc - a.sc);
    // seeds vary the reading among PLAUSIBLE candidates only — a distant
    // third pick is how "none of the takes fit" happens on ambiguous bars
    const best = scored[0].sc;
    const top = scored.slice(0, 3).filter(x => x.sc > 0 && x.sc >= best * 0.55);
    // nothing positive = the bar reads as none of the candidates: ride the
    // previous chord (or yield nothing) rather than commit to a wrong root
    const pick = top.length ? top[Math.floor(seedRng() ** 2 * top.length)].c : null; // squared: biased to the best reading
    if (!pick) { out.push(prevRoot ? {...prevRoot, t: bs, end: bs + bt} : null); continue; }
    const entry = {t: bs, end: bs + bt, rootPc: pick.rootPc, bassPc: pick.rootPc, tones: pick.tones, readable: true};
    out.push(entry);
    prevRoot = entry;
  }
  return out.filter(Boolean);
}
export function bsChordTimeline(t0, t1) {
  const bands = S.rollnotes.filter(n => n.chord && !n.section && n.end > n.start &&
                                      n.start < t1 && n.end > t0)
    .sort((a, b) => a.start - b.start || (b.start - a.start));
  const after = S.rollnotes.filter(n => n.chord && !n.section && n.start >= t1)
    .sort((a, b) => a.start - b.start)[0];
  const tl = [];
  for (const b of bands) {
    if (/^N\.?C\.?$/i.test(b.text.trim())) { // his bar-7 "no chord" device: key-root pedal
      const kn = keyNameAt(b.start), pc = kn ? tonicPcOfName(kn) : null;
      if (pc !== null && pc !== undefined) tl.push({t: b.start, end: b.end, rootPc: pc, bassPc: pc, tones: [pc, (pc + 7) % 12], readable: true});
      continue;
    }
    const c = bsChordTone(b.text);
    if (c) tl.push({t: b.start, end: b.end, ...c});
  }
  if (after) {
    const c = bsChordTone(after.text);
    if (c) tl.push({t: after.start, end: after.end || after.start + barTicks(), ...c, lookahead: true});
  }
  tl.sort((a, b) => a.t - b.t);
  return tl;
}
export function chordAt(tl, t) {
  let cur = null;
  for (const e of tl) { if (e.t <= t && !e.lookahead) cur = e; if (e.t > t) break; }
  return cur;
}
export function nextChange(tl, t) {
  for (const e of tl) if (e.t > t && (e.bassPc !== (chordAt(tl, t) || {}).bassPc || e.lookahead)) return e;
  return null;
}
