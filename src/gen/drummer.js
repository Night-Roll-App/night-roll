import { barTicks } from "../model/rollnotes.js";
import { S } from "../state.js";
import { trackIsDrums } from "../model/grid.js";
import { beatTicks } from "../model/grid.js";
import { setInfo } from "../hooks.js";
import { editableSong } from "../model/song.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { addTrackUndoable } from "../model/edits.js";
import { saveDraft } from "../model/versions.js";
import { renderTrackbar } from "../hooks.js";
import { isComposition } from "../model/provenance.js";
import { pushUndo } from "../model/edits.js";
import { undoTrackAdd } from "../model/edits.js";
import { saveEdits } from "../model/edits.js";
import { computeSongEnd } from "../model/song.js";
import { buildScoreModel } from "../hooks.js";
import { clampView } from "../hooks.js";
import { draw } from "../hooks.js";

// ---- Drummer: context-aware kit generation (advisor-reviewed design, 2026-08-20) ----
// Constrained randomness: a fixed skeleton (kick on 1, meter-table backbeat) that
// seeds NEVER touch; variation only in the negotiable parts (hat texture, bass-
// following kicks, ghosts, fill choice). Every generation is the same idempotent
// operation — replace ALL kit notes in the bar range as ONE group undo — so a
// reroll can't clobber hand edits it can't see, and one undo restores Josh's drums.
export function drumRng(seed, lane) { // per-bar substream: range changes can't scramble liked bars
  let a = (seed ^ ((lane + 1) * 0x9E3779B9)) >>> 0;
  return function() { // mulberry32
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const DR_TOMS = [48, 47, 45, 43, 41];
export function fnv1a32(str) { // stable label hash for section-keyed substreams
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// fill vocabulary — curated by what Josh keeps; each entry owns its window
// (offsets in beats from bar start) and the skeleton yields inside it
export const DR_FILLS = [ // minE: the softest energy this fill may appear at — a
  // full-bar kick/snare buildup at energy 1 is wrong (Josh, field report)
  {name: "run", len: 2, minE: 2, maxE: 5, weight: 1, hits: (rng, qt, beats) => { // 16th snare run, crescendo
    const out = [];
    for (let i = 0; i < 8; i++) out.push({off: (beats - 2 + i / 4) * qt, p: 38, v: Math.round(70 + (115 - 70) * i / 7), d: 50});
    return out;
  }},
  {name: "tomdrop", len: 2, minE: 3, maxE: 5, weight: 1, hits: (rng, qt, beats) => { // snare -> toms down the slots
    const seq = [38, 48, 47, 45, 43, 41].slice(0, 4 + Math.floor(rng() * 3));
    return seq.map((p, i) => ({off: (beats - 2) * qt + i * (2 * qt / seq.length), p,
                               v: Math.round(88 + 20 * i / (seq.length - 1)), d: 60}));
  }},
  {name: "buildup", len: 4, minE: 4, maxE: 5, weight: 2, hits: (rng, qt, beats) => { // kick/snare 8ths tightening to 16ths
    const out = [];
    const half = Math.min(2, beats / 2);
    for (let i = 0; i < half * 2; i++) out.push({off: i * qt / 2, p: i % 2 ? 38 : 36, v: 90 + i * 2, d: 60});
    for (let i = 0; i < (beats - half) * 4; i++) out.push({off: half * qt + i * qt / 4, p: i % 2 ? 38 : 36, v: Math.round(96 + 18 * i / Math.max(1, (beats - half) * 4 - 1)), d: 50});
    return out;
  }},
  {name: "negative", len: 2, minE: 1, maxE: 2, weight: 1, hits: (rng, qt, beats) => // hats drop, one snare, silence into the downbeat
    [{off: (beats - 1) * qt, p: 38, v: 102, d: 60}]},
  {name: "flam", len: 1, minE: 1, maxE: 3, weight: 1, hits: (rng, qt, beats) =>
    [{off: beats * qt - 30 - qt / 4, p: 38, v: 96, d: 40}, {off: beats * qt - qt / 4, p: 38, v: 112, d: 50}]},
  // — the metal tier (fills 4-5): 16th-rate, kit-wide, DENSER than the groove
  // they interrupt (advisor: tomdrop at 8th-rate under busy-5 16th hats read
  // as a dropout, which is why max-settings fills felt lackluster)
  {name: "tomrun", len: 2, minE: 4, maxE: 5, weight: 2, hits: (rng, qt, beats) => { // eight 16ths down the kit
    const base = [38, 48, 47, 45, 43, 41];
    const d1 = Math.floor(rng() * 6), d2 = Math.floor(rng() * 6); // which two drums double
    const seq = [];
    base.forEach((p, i) => { seq.push(p); if (i === d1 || i === d2) seq.push(p); });
    while (seq.length < 8) seq.push(41);
    return seq.slice(0, 8).map((p, i) => ({off: (beats - 2) * qt + i * qt / 4, p,
                                           v: Math.round(92 + (118 - 92) * i / 7), d: 45}));
  }},
  {name: "kitfall", len: 99, minE: 4, maxE: 5, weight: 3, hits: (rng, qt, beats) => { // full bar, crash in, walk the toms down
    const out = [{off: 0, p: 49, v: 108, d: 120}]; // skeleton's kick-on-1 lands with it
    for (let sl = 1; sl < 4; sl++) out.push({off: sl * qt / 4, p: 38, v: 96 + sl * 2, d: 45});
    for (let b = 1; b < beats; b++) {
      const tom = DR_TOMS[Math.min(b - 1, DR_TOMS.length - 1)];
      const pat = [tom, tom, 38, tom];
      for (let sl = 0; sl < 4; sl++)
        out.push({off: b * qt + sl * qt / 4, p: pat[sl],
                  v: Math.round(96 + (122 - 96) * (b * 4 + sl) / (beats * 4 - 1)), d: 45});
    }
    return out;
  }},
  {name: "doublekick", len: 2, minE: 4, maxE: 5, weight: 2, hits: (rng, qt, beats) => { // the staple
    const out = [];
    for (let i = 0; i < 8; i++) out.push({off: (beats - 2) * qt + i * qt / 4, p: 36,
                                          v: Math.round(100 + (116 - 100) * i / 7), d: 40});
    out.push({off: (beats - 2) * qt, p: 38, v: 112, d: 50});
    out.push({off: (beats - 1) * qt, p: 38, v: 112, d: 50});
    return out;
  }},
];
export function sectionLane(bar) { // same label = same substream, bar-for-bar (Drummer + Bassist)
  const bt = barTicks();
  const t = (bar - 1) * bt;
  let best = null;
  for (const n of S.rollnotes) {
    if (!n.section || !(n.end > n.start)) continue;
    if (n.start <= t && n.end > t && (!best || (n.end - n.start) < (best.end - best.start))) best = n;
  }
  if (!best) return bar;
  return (fnv1a32(best.text) + (bar - (Math.floor(best.start / bt) + 1))) >>> 0;
}
export function drBoundaries(t0, t1) { // section starts + loop target inside (t0, t1]
  const bt = barTicks(), out = new Set();
  for (const n of S.rollnotes) {
    if (n.section && n.start >= t0 && n.start <= t1) out.add(Math.floor(n.start / bt) + 1);
    if (n.loopTo !== undefined && n.loopTo >= t0 && n.loopTo <= t1) out.add(Math.floor(n.loopTo / bt) + 1);
  }
  return out;
}
export function drNormParts(p) { // legacy string | array -> array; 4 groups = "all"
  if (Array.isArray(p)) return p.slice();
  if (!p || p === "all") return ["kick", "snare", "hats", "fills"];
  return [p]; // legacy single-group string: that group, fills off
}
export function drBassTrack() { // named bass/triangle wins; else lowest average pitch
  let byName = S.song.tracks.findIndex((tr, ti) => !trackIsDrums(ti) && tr.kind !== "audio" && /bass|tri/i.test(tr.name || ""));
  if (byName >= 0) return byName;
  let best = -1, bestAvg = 1e9;
  S.song.tracks.forEach((tr, ti) => {
    if (trackIsDrums(ti)) return;
    const live = tr.notes.filter(n => !n.gone);
    if (!live.length) return;
    const avg = live.reduce((a, n) => a + n.p, 0) / live.length;
    if (avg < bestAvg) { bestAvg = avg; best = ti; }
  });
  return best;
}
export function drBackbeats(beats) { // explicit meter table, not "adapted"
  if (beats === 4) return [2, 4];
  if (beats === 3) return [3];
  if (beats === 6) return [4];
  return [beats]; // anything else: last beat of the bar
}
export function fmtBarBeat(t) {
  const bt = barTicks(), qt = beatTicks();
  const q = Math.round(((t % bt) / qt + 1) * 100) / 100;
  return (Math.floor(t / bt) + 1) + (q !== 1 ? "." + q : "");
}

export function drGenerate(seed, energyOrOpts, fromBar, toBar, t0Override, t1Override, fillAmt) {
  // v2 (advisor spec): busy = density, hard = velocity, follow = what the kick
  // listens to, feel = backbeat rate. Legacy positional call maps energy ->
  // busy = hard = energy, and hard 3 / follow bass / feel normal is BIT-
  // IDENTICAL to v1 for the same seed (hard consumes zero rng draws).
  let busy, hard, follow, feel, parts;
  if (typeof energyOrOpts === "object" && energyOrOpts !== null) {
    const o = energyOrOpts;
    busy = o.busy ?? 3; hard = o.hard ?? busy;
    follow = o.follow ?? "bass"; feel = o.feel ?? "normal";
    parts = o.parts ?? "all";
    if (o.followTi !== undefined) follow = "bass"; // an explicit track uses the bass-follow engine
    fillAmt = o.fillAmt ?? 3;
    fromBar = o.fromBar; toBar = o.toBar;
    t0Override = o.t0; t1Override = o.t1;
  } else {
    busy = energyOrOpts; hard = energyOrOpts; follow = "bass"; feel = "normal"; parts = "all";
    if (fillAmt === undefined) fillAmt = 3;
  }
  // scoped reroll (Josh, 2026-08-22, advisor round 2): parts is a SET of
  // kick/snare/hats (pitch groups) + fills (a ROLE — fills contain snares and
  // kicks, so the fill layer scopes by BAR, not pitch). All four = the
  // literal v1 "all" path, bit-identical. ZERO new rng draws in any path.
  const PIECE_GROUPS = {kick: [36, 35], snare: [38, 40, 37], hats: [42, 44, 46]};
  const partsArr = drNormParts(parts);
  const isAllParts = ["kick", "snare", "hats", "fills"].every(g => partsArr.includes(g));
  const fillsOn = partsArr.includes("fills");
  const grooveGroups = partsArr.filter(g => g !== "fills");
  const scopePcs = isAllParts ? null
    : new Set(grooveGroups.flatMap(g => PIECE_GROUPS[g]));
  if (!fillsOn) fillAmt = 0;
  if (!isAllParts && !partsArr.length) { setInfo("pick at least one part"); return 0; }
  const HARD_DELTA = 7 * (hard - 3);
  const energy = busy; // density reads below
  if (!editableSong()) { setInfo("the Drummer works on your own songs — captures are locked"); return 0; }
  const bt = barTicks(), qt = beatTicks(), beats = beatsPerBarDisp();
  // sub-bar edges: bar loop still walks whole bars (per-bar substreams stay
  // stable), put() clamps every hit to [t0, t1) — a 2.4 start drops bar 2's
  // hits before beat 4, exactly the drums-enter-late workflow
  const t0 = t0Override !== undefined ? t0Override : (fromBar - 1) * bt;
  const t1 = t1Override !== undefined ? t1Override : toBar * bt;
  if (S.rollnotes.some(n => n.tsdir && n.start > t0 && n.start < t1)) {
    setInfo("the range crosses a meter change — generate each meter's bars separately");
    return 0;
  }
  let di = S.song.tracks.findIndex((_, ti) => trackIsDrums(ti));
  const madeTrack = di < 0, undoLen = S.editUndo.length;
  if (madeTrack) {
    di = addTrackUndoable({name: "drums", notes: []});
    saveDraft();
    renderTrackbar();
  }
  const tr = S.song.tracks[di], isAdd = !isComposition();
  const oFollowTi = typeof energyOrOpts === "object" && energyOrOpts !== null ? energyOrOpts.followTi : undefined;
  const bassTi = oFollowTi !== undefined && S.song.tracks[oFollowTi] ? oFollowTi : drBassTrack();
  // context per bar: break = nothing but bass (or nothing at all) SOUNDING there,
  // or a declared section label saying so — a sustained melody note is not a break
  // a break is a DROPOUT: bars where the texture thins to the followed track
  // alone. If no OTHER track plays anywhere in the range (a one-voice
  // passage), nothing dropped out — only a labeled "break" section counts.
  let rangeHasOthers = false;
  S.song.tracks.forEach((mtr, ti) => {
    if (ti === di || ti === bassTi || trackIsDrums(ti)) return;
    if (mtr.notes.some(n => !n.gone && n.t < t1 && n.t + n.d > t0)) rangeHasOthers = true;
  });
  // labeled "break" sections silence EXACTLY their span (a Break ending at
  // 14.1 must not mute all of bar 14 — Josh, 2026-08-22); put() enforces it
  const breakSpans = S.rollnotes.filter(n => n.section && /break/i.test(n.text))
    .map(n => ({s: n.start, e: n.end || n.start + bt}));
  const inLabeledBreak = t => breakSpans.some(sp => t >= sp.s && t < sp.e);
  const isBreak = bar => {
    const bs = (bar - 1) * bt, be = bar * bt;
    if (breakSpans.some(sp => sp.s <= bs && sp.e >= be)) return true; // fully covered bar
    if (!rangeHasOthers) return false;
    let melodic = false;
    S.song.tracks.forEach((mtr, ti) => {
      if (ti === di || ti === bassTi || trackIsDrums(ti)) return;
      if (mtr.notes.some(n => !n.gone && n.t < be && n.t + n.d > bs)) melodic = true;
    });
    return !melodic;
  };
  // boundaries inside the range: section starts + the loop target — the bar BEFORE gets the fill
  const boundaries = drBoundaries(t0, t1);
  // fill bars (role scope): the bar BEFORE each boundary; boundary/arrival
  // downbeat ticks carry the crash
  const fillBarSet = new Set([...boundaries].map(b => b - 1));
  const crashTicks = new Set([...boundaries].map(b => (b - 1) * bt));
  if (boundaries.has(fromBar)) crashTicks.add((fromBar - 1) * bt);
  const inFillScope = t => fillBarSet.has(Math.floor(t / bt) + 1) || crashTicks.has(t);
  const chordStarts = new Set(S.rollnotes.filter(n => n.chord && !n.section).map(n => n.start));
  // same label = same drums (the app's own same-label-same-color convention,
  // extended; advisor 2026-08-22): the GROOVE substream keys on (label hash +
  // bar offset within the section) so identically-labeled sections restate
  // bar-for-bar. EXACT label match — no stemming, that would be inference.
  // Fills and arrival crashes stay keyed on absolute bars: a fill is
  // commentary on what comes NEXT, and varied fills between identical grooves
  // is what a human drummer does. Bars outside any section keep absolute-bar
  // keying — unsectioned songs are bit-identical to the old engine.
  const grooveLane = bar => sectionLane(bar);
  const bass = bassTi >= 0 ? S.song.tracks[bassTi].notes.filter(n => !n.gone && n.t >= t0 && n.t < t1) : [];
  // ---- erase everything the kit holds in the range (idempotent replace) ----
  const erased = [];
  tr.notes.forEach((n, ni) => {
    if (!n.gone && n.t >= t0 && n.t < t1 &&
        (!scopePcs || scopePcs.has(n.p) || (fillsOn && inFillScope(n.t)))) {
      n.gone = true;
      const rn = S.song.rawNotes && n.ri !== undefined && S.song.rawNotes[di][n.ri];
      if (rn) rn.gone = true;
      erased.push({ti: di, ni});
    }
  });
  // ---- generate ----
  const hits = []; // {t, p, v, d}
  const put = (t, p, v, d) => {
    if (t < t0 || t >= t1) return;
    if (scopePcs && !scopePcs.has(p) && !(fillsOn && inFillScope(t))) return; // out-of-scope pieces are KEPT
    if (inLabeledBreak(t)) return; // a declared Break silences its exact span
    let vv = v + HARD_DELTA; // hard: one uniform shift, applied nowhere else
    if (p === 42) vv = Math.max(40, vv); // hats never fall back into the inaudible zone
    hits.push({t, p, v: Math.max(1, Math.min(127, Math.round(vv))), d});
  };
  // a boundary AT the range start: this generation owns the arrival — crash it
  // (section-at-a-time workflow: the intro pass plays the fill, this pass lands)
  if (boundaries.has(fromBar) && !isBreak(fromBar)) {
    const arng = drumRng(seed, fromBar * 7919 + 47);
    put((fromBar - 1) * bt, 49, 100 + arng() * 12, 120);
  }
  for (let bar = fromBar; bar <= toBar; bar++) {
    if (scopePcs && scopePcs.size === 0 && fillsOn && !fillBarSet.has(bar)) continue; // fills-only: touch fill bars alone
    if (isBreak(bar)) continue; // his breaks are sacred: the drummer lays out
    const rng = drumRng(seed, grooveLane(bar));
    const bs = (bar - 1) * bt;
    // fill window (the fill owns its beats; skeleton and hats yield inside it)
    let fill = null;
    if (boundaries.has(bar + 1) && fillAmt > 0) {
      const frng = drumRng(seed, bar * 7919 + 13);
      // the FILLS knob (not energy) picks the band and the odds — Logic's
      // Fill Amount/Complexity split, collapsed to one knob (Josh, 2026-08-22)
      const pool = DR_FILLS.filter(f => fillAmt >= f.minE && fillAmt <= f.maxE);
      if (frng() < 0.35 + 0.12 * fillAmt && pool.length) {
        if (fillAmt >= 4) { // weighted: big fills dominate at the top of the knob
          const total = pool.reduce((a, f) => a + (f.weight || 1), 0);
          let roll = frng() * total;
          for (const f of pool) { roll -= (f.weight || 1); if (roll <= 0) { fill = f; break; } }
          if (!fill) fill = pool[pool.length - 1];
        } else fill = pool[Math.floor(frng() * pool.length)];
      }
    }
    const fillStart = fill ? bs + (beats - Math.min(fill.len, beats)) * qt : Infinity;
    // skeleton: kick on 1 (fixed in every feel) — knobs never move the anchor
    put(bs, 36, 104 + rng() * 8, 70);
    let barSnareV = 0; // tracked PRE-delta: the hats-under-snare discipline shifts uniformly
    if (feel === "double") { // skank/D-beat: kick every beat, snare every offbeat 8th
      for (let k = 1; k < beats; k++) {
        const t = bs + k * qt;
        if (t < fillStart) put(t, 36, 96 + rng() * 8, 65);
      }
      for (let k = 0; k < beats; k++) {
        const t = bs + (k + 0.5) * qt;
        if (t >= fillStart) continue;
        const v = 100 + rng() * 16;
        barSnareV = Math.max(barSnareV, v);
        put(t, 38, v, 55);
      }
    } else {
      const backs = feel === "half" ? [Math.floor(beats / 2) + 1] : drBackbeats(beats);
      for (const b of backs) {
        const t = bs + (b - 1) * qt;
        if (t >= fillStart) continue;
        const v = 100 + rng() * 16;
        barSnareV = Math.max(barSnareV, v);
        put(t, 38, v, 60);
      }
    }
    if (!barSnareV) barSnareV = 108;
    if (scopePcs && !grooveGroups.includes("snare")) { // snares kept, not generated: cap under the REAL ones
      let kept = 0;
      for (const n of tr.notes) if (!n.gone && n.t >= bs && n.t < bs + bt && (n.p === 38 || n.p === 40)) kept = Math.max(kept, n.v || 0);
      if (kept) barSnareV = kept;
    }
    // hats: table by feel + busy; ceiling stays under the bar's snare
    const hatCap = Math.min(88, barSnareV - 12); // under the snare, but audible in the mix
    const hatStep = feel === "half" ? (busy <= 2 ? qt : qt / 2) : qt / 2; // half thins a notch
    for (let t = bs; t < bs + bt; t += hatStep) {
      if (t >= fillStart) break;
      const on = Math.abs((t - bs) % qt) < 1;
      put(t, 42, Math.min(hatCap, on ? 66 + rng() * 16 : 52 + rng() * 12), 40);
      const pairGate = feel === "half" ? busy >= 5 : busy >= 4;
      const pairProb = feel === "half" ? 0.12 * (busy - 1) : 0.12 * busy;
      if (pairGate && !on && rng() < pairProb) put(t + qt / 4, 42, Math.min(hatCap, 50 + rng() * 10), 35);
    }
    if (follow === "bass" && feel !== "double") { // double already owns every slot
      // bass-following kicks: offbeat bass onsets, probability by busy, capped 2/bar
      let extra = 0;
      for (const n of bass) {
        if (n.t < bs || n.t >= bs + bt || n.t >= fillStart) continue;
        const beatPos = (n.t - bs) / qt;
        if (Math.abs(beatPos - Math.round(beatPos)) < 0.01 && (Math.round(beatPos) === 0)) continue; // beat 1 covered
        if (extra >= 2) break;
        if (rng() < 0.12 + 0.1 * busy) { put(n.t, 36, 88 + rng() * 12, 60); extra++; }
      }
      // agogic snare on the bass's LONG notes (Josh's own device)
      for (const n of bass) {
        if (n.t < bs || n.t >= bs + bt || n.t >= fillStart) continue;
        if (n.d >= qt * 1.5 && !(feel === "double") &&
            !(feel === "half" ? [Math.floor(beats / 2) + 1] : drBackbeats(beats))
              .some(b => Math.abs(n.t - (bs + (b - 1) * qt)) < 5))
          put(n.t, 38, Math.min(120, barSnareV + 8), 60);
      }
    } else if (follow === "chords") { // declared chord starts get the kick — deterministic
      let ck = 0;
      for (const ct of chordStarts) {
        if (ct < bs || ct >= Math.min(bs + bt, fillStart)) continue;
        if (Math.abs(ct - bs) < 5) continue; // downbeat already kicked
        if (ck >= 4) break; // harmonic-rhythm-compression safety
        put(ct, 36, 92 + rng() * 12, 60);
        ck++;
      }
    }
    // the fill itself, then a crash lands on the boundary downbeat (next bar's put)
    if (fill) for (const h of fill.hits(rng, qt, beats)) put(bs + h.off, h.p, h.v, h.d);
    if (boundaries.has(bar + 1) && bar + 1 <= toBar && !isBreak(bar + 1)) {
      put(bs + bt, 49, 100 + rng() * 12, 120);
    }
  }
  // chord-change downbeat accents (+12, capped) — harmonic-rhythm compression
  // densifies these automatically, so his device is honored for free
  if (follow !== "off") for (const ct of chordStarts) {
    if (ct < t0 || ct >= t1) continue;
    for (const h of hits) if (h.t === ct && (h.p === 36 || h.p === 42)) h.v = Math.min(h.p === 42 ? 76 + HARD_DELTA : 127, h.v + 12);
  }
  hits.sort((a, b) => a.t - b.t || a.p - b.p);
  const added = [];
  for (const h of hits) {
    tr.notes.push({t: h.t, d: h.d, p: h.p, v: h.v, added: isAdd});
    if (S.song.rawNotes) S.song.rawNotes[di].push({t: h.t + S.chopS, d: h.d, p: h.p, v: h.v, added: isAdd});
    added.push({ti: di, ni: tr.notes.length - 1});
  }
  pushUndo({kind: "group", entries: [{kind: "eraseBatch", items: erased}, {kind: "addBatch", items: added}]});
  if (madeTrack) undoTrackAdd(di, undoLen); // a kit the Drummer made leaves with its take
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  S.view.y = 1e9;
  clampView();
  draw();
  return added.length;
}
