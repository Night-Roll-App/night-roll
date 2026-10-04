import { parseChordSym } from "../theory/chords.js";
import { LETTER_PC } from "../theory/chords.js";
import { CHORD_TEMPLATES } from "../theory/chords.js";
import { chordQualParse } from "../theory/chords.js";
import { barTicks } from "../model/rollnotes.js";
import { beatTicks } from "../model/grid.js";
import { sfDeclaredAt } from "../model/song.js";
import { keyNameAt } from "../model/song.js";
import { modeOfName, tonicPcOfName } from "../theory/chords.js";
import { S } from "../state.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { editableSong } from "../model/song.js";
import { setInfo } from "../hooks.js";
import { trackIsDrums } from "../model/grid.js";
import { drumRng } from "./drummer.js";
import { sectionLane } from "./drummer.js";
import { isComposition } from "../model/provenance.js";
import { pushUndo } from "../model/edits.js";
import { saveEdits } from "../model/edits.js";
import { computeSongEnd } from "../model/song.js";
import { buildScoreModel } from "../hooks.js";
import { draw } from "../hooks.js";

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

export function bsGenerate(seed, opts) { // the Bassist: strictly monophonic, chord-driven
  const {style = "chug", busy = 3, oct = 2, follow = "auto", followTi, targetTi,
         fromBar, toBar} = opts;
  const bt = barTicks(), qt = beatTicks(), beats = beatsPerBarDisp();
  const t0 = opts.t0 !== undefined ? opts.t0 : (fromBar - 1) * bt;
  const t1 = opts.t1 !== undefined ? opts.t1 : toBar * bt;
  if (!editableSong()) { setInfo("the Bassist works on your own songs — captures are locked"); return 0; }
  if (S.rollnotes.some(n => n.tsdir && n.start > t0 && n.start < t1)) {
    setInfo("the range crosses a meter change — generate each meter's bars separately");
    return 0;
  }
  if (targetTi === undefined || !S.song.tracks[targetTi] || trackIsDrums(targetTi)) {
    setInfo("pick a target track for the bass");
    return 0;
  }
  // pitch truth ladder: declared chords > inferred-from-melody sketch > key root > refuse
  let tl = bsChordTimeline(t0, t1);
  let inferred = false;
  {
    const mels = S.song.tracks.map((tr2, ti) => ({tr2, ti}))
      .filter(({tr2, ti}) => ti !== targetTi && !trackIsDrums(ti) &&
        tr2.notes.some(n => !n.gone && n.t < t1 && n.t + n.d > t0))
      .map(({ti}) => ti); // ALL sounding voices — one voice alone misreads multi-voice songs
    if (mels.length) { // fill only the bars no band covers (mixed songs welcome)
      const declared = tl.filter(e => !e.lookahead);
      const inferredTl = bsInferTimeline(t0, t1, mels, drumRng(seed, 0xB055));
      const gaps = inferredTl.filter(g => !declared.some(d2 => d2.t < g.end && d2.end > g.t));
      if (gaps.length) { inferred = declared.length === 0; tl = [...declared, ...gaps, ...tl.filter(e => e.lookahead)].sort((a, b) => a.t - b.t); }
    }
    if (!tl.filter(e => !e.lookahead).length) {
      const kn = keyNameAt(t0), pc = kn && sfDeclaredAt(t0) !== null ? tonicPcOfName(kn) : null;
      if (pc === null || pc === undefined) {
        setInfo("no chords, no melody, no key declared in this range — the bassist has nothing to read");
        return 0;
      }
      tl = [{t: t0, end: t1, rootPc: pc, bassPc: pc, tones: [pc, (pc + 7) % 12], readable: true}];
    }
  }
  // NOTE: no Break silencing here — a Break is a drop to JUST BASS (his own
  // device, cool-b-maj + graveyard), so the bass is the one voice that plays through.
  // follow source for the riff style / accents
  const di = S.song.tracks.findIndex((_, ti) => trackIsDrums(ti));
  const fMode = follow === "auto" ? (di >= 0 ? "drums" : "chords") : follow;
  const srcOnsets = [];
  if (fMode === "drums" && di >= 0) {
    for (const n of S.song.tracks[di].notes)
      if (!n.gone && (n.p === 36 || n.p === 35) && n.t >= t0 && n.t < t1) srcOnsets.push(n.t);
  } else if (fMode.startsWith && fMode.startsWith("t")) {
    const ti = parseInt(fMode.slice(1), 10);
    if (S.song.tracks[ti]) for (const n of S.song.tracks[ti].notes)
      if (!n.gone && n.t >= t0 && n.t < t1) srcOnsets.push(n.t);
  } else if (fMode === "chords") {
    for (const e of tl) if (!e.lookahead && e.t >= t0 && e.t < t1) srcOnsets.push(e.t);
  }
  srcOnsets.sort((a, b) => a - b);
  const srcSet = new Set(srcOnsets.map(t => Math.round(t / (qt / 4)) * (qt / 4)));
  const place = (pc, o) => Math.max(24, Math.min(60, 12 * (o + 1) + pc));
  const hits = [];
  const put = (t, p, v, d) => {
    if (t < t0 || t >= t1) return;
    hits.push({t: Math.round(t), p, v: Math.max(1, Math.min(127, Math.round(v))), d: Math.max(20, Math.round(d))});
  };
  const vFor = (t, bs) => { // downbeat 96 / on-beat 88 / off 78; +8 on chord-change onsets (cap 110)
    const pos = (t - bs) / qt;
    let v = Math.abs(pos) < 0.01 ? 96 : Math.abs(pos - Math.round(pos)) < 0.01 ? 88 : 78;
    const c = chordAt(tl, t);
    if (c && Math.abs(c.t - t) < 5) v = Math.min(110, v + 8);
    return v;
  };
  for (let bar = fromBar; bar <= toBar; bar++) {
    const bs = (bar - 1) * bt;
    const rng = drumRng(seed, sectionLane(bar) ^ 0xBA55);
    const jit = []; // constant draw budget per bar per style (liked-bar stability)
    for (let i = 0; i < beats * 2; i++) jit.push(rng() * 8 - 4);
    const pops = [];
    for (let i = 0; i < beats; i++) pops.push(rng());
    const dirDraw = rng();
    const c0 = chordAt(tl, bs) || tl[0];
    if (!c0) continue;
    if (style === "chug") {
      for (let i = 0; i < beats * 2; i++) {
        const t = bs + i * qt / 2;
        const c = chordAt(tl, t) || c0;
        if (busy === 1 && i % 2) continue;
        if (busy === 2 && i === beats * 2 - 1) continue;
        let p = place(c.bassPc, oct);
        if (busy >= 4 && i % 2 && pops[i >> 1] < 0.25) p += 12;
        put(t, p, vFor(t, bs) + jit[i], busy === 1 ? qt * 0.9 : qt * 0.45);
        if (busy >= 5 && i === beats * 2 - 2) put(t + qt / 4, p, 74 + jit[i], qt * 0.2);
      }
    } else if (style === "pump") {
      const step = busy >= 4 ? qt / 2 : qt;
      for (let t = bs, i = 0; t < bs + bt; t += step, i++) {
        const c = chordAt(tl, t) || c0;
        if (busy === 1 && (t - bs) % (2 * qt) !== 0) continue;
        const root = place(c.bassPc, oct);
        const fifth = root + 7 <= 12 * (oct + 1) + 16 ? root + 7 : root - 5;
        put(t, (Math.floor((t - bs) / qt)) % 2 === 0 ? root : fifth,
            vFor(t, bs) + jit[Math.min(jit.length - 1, i)], busy === 1 ? qt * 2 : step * 0.85);
      }
    } else if (style === "arp") {
      const c = c0;
      const tones = c.tones.length >= 3 ? c.tones.slice(0, 4) : [...c.tones, (c.rootPc + 12) % 12];
      const step = busy <= 2 ? qt : busy <= 4 ? qt / 2 : qt / 4;
      const seq = [];
      const up = tones.map(pc => place(pc, oct) + (pc < c.bassPc ? 12 : 0)).sort((a, b) => a - b);
      if (dirDraw < 0.4) seq.push(...up);
      else if (dirDraw < 0.7) seq.push(...[...up].reverse());
      else seq.push(...up, ...[...up].reverse().slice(1, -1));
      let k = 0;
      for (let t = bs; t < bs + bt; t += step, k++) {
        const cc = chordAt(tl, t) || c;
        if (cc !== c && Math.abs(cc.t - t) < 5) { put(t, place(cc.bassPc, oct), vFor(t, bs) + jit[k % jit.length], step * 0.8); k = 0; continue; }
        put(t, seq[k % seq.length], vFor(t, bs) + jit[k % jit.length], step * 0.8);
      }
    } else if (style === "walk") {
      const nxt = nextChange(tl, bs + bt - qt);
      for (let b = 0; b < beats; b++) {
        const t = bs + b * qt;
        if (busy <= 2 && b !== 0 && b !== beats - 1) continue;
        const c = chordAt(tl, t) || c0;
        let p;
        if (b === 0) p = place(c.bassPc, oct);
        else if (b === beats - 1 && nxt) { // approach into the coming change
          const tgt = place(nxt.bassPc, oct);
          const r = pops[b];
          p = r < 0.4 ? tgt - 1 : r < 0.6 ? tgt + 1 : r < 0.8 ? tgt - 5 : tgt - 2;
        } else if (b === beats - 1) p = place(c.bassPc, oct) - 5; // turnaround fifth below
        else { // middle: nearest chord tone toward the target line
          const from = place(c.bassPc, oct);
          const tgt = nxt ? place(nxt.bassPc, oct) : from;
          const ideal = from + (tgt - from) * (b / (beats - 1));
          const opts2 = c.tones.map(pc => place(pc, oct) + (place(pc, oct) < from - 6 ? 12 : 0));
          opts2.sort((a2, b2) => Math.abs(a2 - ideal) - Math.abs(b2 - ideal) || (pops[b] < 0.5 ? a2 - b2 : b2 - a2));
          p = opts2[0];
        }
        put(t, p, vFor(t, bs) + jit[b * 2], qt * 0.9);
        if (busy >= 4 && pops[b] < 0.2) put(t + qt / 2, p, 74 + jit[b * 2 + 1], qt * 0.4);
      }
    } else if (style === "riff") {
      const ons = srcOnsets.filter(t => t >= bs && t < bs + bt)
        .map(t => Math.round(t / (qt / 4)) * (qt / 4)).filter((t, i, a) => a.indexOf(t) === i).slice(0, 8);
      if (!ons.length) { ons.push(bs, bs + 2 * qt); }
      ons.forEach((t, i) => {
        const c = chordAt(tl, t) || c0;
        const r = pops[i % pops.length];
        const pc = Math.abs(c.t - t) < 5 ? c.bassPc
                 : r < 0.6 ? c.bassPc : r < 0.85 ? c.tones[Math.min(2, c.tones.length - 1)] : c.tones[Math.min(1, c.tones.length - 1)];
        const next = ons[i + 1];
        put(t, place(pc, oct), (srcSet.has(Math.round(t / (qt / 4)) * (qt / 4)) ? 92 : 82) + jit[i % jit.length],
            Math.min(next !== undefined ? next - t : qt, qt));
      });
    }
  }
  hits.sort((a, b) => a.t - b.t);
  for (let i = 0; i < hits.length - 1; i++) hits[i].d = Math.min(hits[i].d, hits[i + 1].t - hits[i].t); // strict mono
  const n = applyTake(targetTi, t0, t1, hits);
  if (inferred) setInfo("no chords declared — harmony sketched from your melody (internal only; different seeds read it differently)");
  return n;
}
// The generators' shared apply: replace-in-range as ONE group undo. Erase is
// by ONSET (a note sustaining in from before the range survives), via the
// `gone` flag — never a splice, so `ni` indices stay stable for undo — with
// the rawNotes mirror through `ri`; adds mirror into rawNotes at + chopS.
// hits: [{t, d, p, v}] in display ticks. Extracted from the Bassist
// 2026-09-25 for ✦ Fill; tests/fixtures/bassist-golden.json pins its output.
export function applyTake(targetTi, t0, t1, hits) {
  const tr = S.song.tracks[targetTi], isAdd = !isComposition();
  const erased = [];
  tr.notes.forEach((n, ni) => {
    if (!n.gone && n.t >= t0 && n.t < t1) {
      n.gone = true;
      const rn = S.song.rawNotes && n.ri !== undefined && S.song.rawNotes[targetTi][n.ri];
      if (rn) rn.gone = true;
      erased.push({ti: targetTi, ni});
    }
  });
  const added = [];
  for (const h of hits) {
    if (h.d <= 0) continue;
    const v = Math.max(1, Math.min(127, Math.round(h.v))), d = Math.max(20, Math.round(h.d)), t = Math.round(h.t);
    tr.notes.push({t, d, p: h.p, v, added: isAdd});
    if (S.song.rawNotes) S.song.rawNotes[targetTi].push({t: t + S.chopS, d, p: h.p, v, added: isAdd});
    added.push({ti: targetTi, ni: tr.notes.length - 1});
  }
  pushUndo({kind: "group", entries: [{kind: "eraseBatch", items: erased}, {kind: "addBatch", items: added}]});
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return added.length;
}
