import { barTicks } from "../model/rollnotes.js";
import { visibleNotes } from "../model/rollnotes.js";
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
export function drFillStep(qt) { // a fill's 16th: ppq/4 in simple meters; in a compound
  // meter (beat = 8th) the beat's quarter, so eight steps still fit the two beats a fill owns
  return Math.min(S.song.ppq / 4, qt / 4);
}
// fill vocabulary — curated by what Josh keeps; each entry owns its window
// (offsets in beats from bar start) and the skeleton yields inside it.
// Contract: hits(rng, qt, beats, ctx) → [{off, p, v, d}], off in ticks from the
// bar start; rng is the FILL substream (run/negative/flam draw nothing — their
// output is frozen by golden tests); ctx = {bs, onsets} where onsets are the
// other tracks' note starts inside the window, relative to the bar. Every fill
// is one idea in one direction on the 16th grid, landing on the next 1
// (docs/plans/2026-10-05-drum-generation-review.md).
export const DR_FILLS = [ // minE: the softest energy this fill may appear at — a
  // full-bar kick/snare riser at energy 1 is wrong (Josh, field report)
  {name: "run", len: 2, minE: 2, maxE: 5, weight: 2, hits: (rng, qt, beats) => { // 16th snare run, crescendo
    const out = [];
    for (let i = 0; i < 8; i++) out.push({off: (beats - 2 + i / 4) * qt, p: 38, v: Math.round(70 + (115 - 70) * i / 7), d: 50});
    return out;
  }},
  {name: "tomdescent", len: 2, minE: 3, maxE: 5, weight: 2, hits: (rng, qt, beats) => { // two per drum down the kit, crescendo, kick under the floor tom
    // (replaced tomdrop, whose 5-over-2-beats spacing was off every grid line)
    const s = drFillStep(qt), w = (beats - 2) * qt;
    const seq = [38, 38, 48, 48, 47, 47, 43, 43];
    if (rng() < 0.5) seq[6] = seq[7] = 41;
    const out = seq.map((p, i) => ({off: w + i * s, p, v: Math.round(84 + 32 * i / 7), d: 45}));
    out.push({off: w + 7 * s, p: 36, v: 104, d: 50});
    return out;
  }},
  {name: "threes", len: 2, minE: 3, maxE: 5, weight: 2, hits: (rng, qt, beats) => { // 3+3+2 over 16ths: accents fight the beat, then resolve on 1
    const s = drFillStep(qt), w = (beats - 2) * qt;
    return [38, 48, 36, 38, 45, 36, 38, 38].map((p, i) =>
      ({off: w + i * s, p, v: i === 7 ? 118 : i % 3 === 0 ? 112 : 86, d: 45}));
  }},
  {name: "accel", len: 99, minE: 4, maxE: 5, weight: 2, hits: (rng, qt, beats) => { // the riser: quarters → 8ths → 16ths, kick under the 8ths
    // (replaced buildup: flat-velocity kick/snare machine-gun that erased the backbeat)
    const s = drFillStep(qt), end = beats * qt - s, out = [];
    const snare = off => {
      const v = Math.round(80 + 40 * off / end);
      out.push({off, p: 38, v, d: 45});
      if (off > 0 && Math.abs(off % (qt / 2)) < 1) out.push({off, p: 36, v, d: 50}); // the skeleton kicks the 1 itself
    };
    for (let b = 0; b < beats - 2; b++) snare(b * qt);
    for (let i = 0; i < 2; i++) snare((beats - 2) * qt + i * qt / 2);
    for (let i = 0; i < 4; i++) snare((beats - 1) * qt + i * s);
    return out;
  }},
  {name: "stabs", len: 2, minE: 2, maxE: 5, weight: 1, hits: (rng, qt, beats, ctx) => { // the band hit: kick + snare together where the other tracks start notes
    const s = drFillStep(qt), w = (beats - 2) * qt, grid = new Set();
    for (const o of (ctx && ctx.onsets) || []) { // on-grid onsets only (8ths, 16ths) — a stray tick is not a hit to play
      const q = Math.round(o / s) * s;
      if (Math.abs(o - q) <= 5 && q >= w && q < beats * qt) grid.add(q);
    }
    let at = [...grid].sort((a, b) => a - b);
    if (at.length < 2 || at.length > 6) at = [w + 2 * s, w + qt]; // nothing to hit with: the "and" of the window's first beat, then its last beat
    const out = [];
    at.forEach((off, i) => {
      const v = Math.round(106 + 12 * i / Math.max(1, at.length - 1));
      out.push({off, p: 36, v, d: 50}, {off, p: 38, v, d: 50});
    });
    return out;
  }},
  {name: "negative", len: 2, minE: 1, maxE: 2, weight: 1, hits: (rng, qt, beats) => // hats drop, one snare, silence into the downbeat
    [{off: (beats - 1) * qt, p: 38, v: 102, d: 60}]},
  {name: "flam", len: 1, minE: 1, maxE: 3, weight: 1, hits: (rng, qt, beats) =>
    [{off: beats * qt - 30 - qt / 4, p: 38, v: 96, d: 40}, {off: beats * qt - qt / 4, p: 38, v: 112, d: 50}]},
  // — the metal tier (fills 4-5): 16th-rate, kit-wide, DENSER than the groove
  // they interrupt (advisor: an 8th-rate tom fill under busy-5 16th hats read
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
  {name: "kitfall", len: 99, minE: 4, maxE: 5, weight: 2, hits: (rng, qt, beats) => { // full bar, crash in, walk the toms down
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
  {name: "doublekick", len: 2, minE: 4, maxE: 5, weight: 1, hits: (rng, qt, beats) => { // the staple
    const out = [];
    for (let i = 0; i < 8; i++) out.push({off: (beats - 2) * qt + i * qt / 4, p: 36,
                                          v: Math.round(100 + (116 - 100) * i / 7), d: 40});
    out.push({off: (beats - 2) * qt, p: 38, v: 112, d: 50});
    out.push({off: (beats - 1) * qt, p: 38, v: 112, d: 50});
    return out;
  }},
];
// phrase fills (fills 3-5): the "small details" inside a section — ≤ 1 beat,
// never a crash after. flam and negative are the SAME objects as above.
export const DR_SMALL_FILLS = [
  DR_FILLS.find(f => f.name === "flam"), DR_FILLS.find(f => f.name === "negative"),
  {name: "pickup", len: 1, minE: 3, maxE: 5, weight: 1, hits: (rng, qt, beats) => { // snare on the last beat and its "a"
    const s = drFillStep(qt), w = (beats - 1) * qt;
    return [{off: w, p: 38, v: 100, d: 50}, {off: w + 3 * s, p: 38, v: 112, d: 50}];
  }},
  {name: "tomlick", len: 1, minE: 3, maxE: 5, weight: 1, hits: (rng, qt, beats) => { // four 16ths, high tom to mid
    const s = drFillStep(qt), w = (beats - 1) * qt;
    return [48, 48, 45, 45].map((p, i) => ({off: w + i * s, p, v: 90 + 6 * i, d: 45}));
  }},
];
export const DR_MEDIUM_FILLS = DR_FILLS.filter(f => ["run", "tomdescent", "threes"].includes(f.name)); // 8th-bar phrase fills at fills 4-5 may be these too
export function drPickFill(frng, fillAmt, pool, prevName) { // weighted at the top of the knob, even below; never the same fill twice running
  if (!pool.length) return null;
  let fill = null;
  if (fillAmt >= 4) {
    const total = pool.reduce((a, f) => a + (f.weight || 1), 0);
    let roll = frng() * total;
    for (const f of pool) { roll -= (f.weight || 1); if (roll <= 0) { fill = f; break; } }
    if (!fill) fill = pool[pool.length - 1];
  } else fill = pool[Math.floor(frng() * pool.length)];
  if (fill.name === prevName && pool.length > 1) fill = pool[(pool.indexOf(fill) + 1) % pool.length];
  return fill;
}
export function drDeepestSection(bar) { // the shortest declared section holding the bar's downbeat, or null
  const t = (bar - 1) * barTicks();
  let best = null;
  for (const n of visibleNotes()) { // visibleNotes: the Drummer keys on no Learning-hidden ✦ AI section (model/rollnotes.js)
    if (!n.section || !(n.end > n.start)) continue;
    if (n.start <= t && n.end > t && (!best || (n.end - n.start) < (best.end - best.start))) best = n;
  }
  return best;
}
export function drSectionPos(bar) { // {base, k}: the section's label hash (one constant when unsectioned) + the bar's 1-based offset in it
  const best = drDeepestSection(bar);
  if (!best) return {base: 0x2545F491, k: bar};
  return {base: fnv1a32(best.text), k: bar - Math.floor(best.start / barTicks())};
}
export function sectionLane(bar) { // same label = same substream, bar-for-bar (Drummer + Bassist)
  const best = drDeepestSection(bar);
  if (!best) return bar;
  return (fnv1a32(best.text) + (bar - (Math.floor(best.start / barTicks()) + 1))) >>> 0;
}
export function drBoundaries(t0, t1) { // section starts + loop target inside (t0, t1]
  const bt = barTicks(), out = new Set();
  for (const n of visibleNotes()) {
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
  const breakSpans = visibleNotes().filter(n => n.section && /break/i.test(n.text))
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
  // phrase bars (every 4th bar of a section) are fill scope whatever the knob
  // says, so a fills-only reroll with fills off strips old phrase fills too
  for (let bar = fromBar; bar <= toBar; bar++) if (drSectionPos(bar).k % 4 === 0) fillBarSet.add(bar);
  const crashTicks = new Set([...boundaries].map(b => (b - 1) * bt));
  if (boundaries.has(fromBar)) crashTicks.add((fromBar - 1) * bt);
  const inFillScope = t => fillBarSet.has(Math.floor(t / bt) + 1) || crashTicks.has(t);
  const chordStarts = new Set(visibleNotes().filter(n => n.chord && !n.section).map(n => n.start));
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
  const melodic = S.song.tracks.filter((mtr, ti) => ti !== di && !trackIsDrums(ti) && mtr.kind !== "audio");
  const onsetsIn = (a, b) => { // sorted unique note starts of every non-drum track in [a, b) — what a stabs fill hits with
    const set = new Set();
    for (const mtr of melodic) for (const n of mtr.notes) if (!n.gone && n.t >= a && n.t < b) set.add(n.t);
    return [...set].sort((x, y) => x - y);
  };
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
  const put = (t, p, v, d, floor) => {
    if (t < t0 || t >= t1) return;
    if (scopePcs && !scopePcs.has(p) && !(fillsOn && inFillScope(t))) return; // out-of-scope pieces are KEPT
    if (inLabeledBreak(t)) return; // a declared Break silences its exact span
    let vv = v + HARD_DELTA; // hard: one uniform shift, applied nowhere else
    if (p === 42) vv = Math.max(40, vv); // hats never fall back into the inaudible zone
    if (floor) vv = Math.max(floor, vv); // ghosts: hard may not push them to nothing
    hits.push({t, p, v: Math.max(1, Math.min(127, Math.round(vv))), d});
  };
  // a boundary AT the range start: this generation owns the arrival — crash it
  // (section-at-a-time workflow: the intro pass plays the fill, this pass lands)
  if (boundaries.has(fromBar) && !isBreak(fromBar)) {
    const arng = drumRng(seed, fromBar * 7919 + 47);
    put((fromBar - 1) * bt, 49, 100 + arng() * 12, 120);
  }
  let prevFill = null; // the last fill chosen in THIS take, in bar order — two in a row never match
  for (let bar = fromBar; bar <= toBar; bar++) {
    if (scopePcs && scopePcs.size === 0 && fillsOn && !fillBarSet.has(bar)) continue; // fills-only: touch fill bars alone
    if (isBreak(bar)) continue; // his breaks are sacred: the drummer lays out
    const lane = grooveLane(bar);
    const rng = drumRng(seed, lane);
    const bs = (bar - 1) * bt;
    // fill window (the fill owns its beats; skeleton and hats yield inside it).
    // Fill substreams key on the ABSOLUTE bar, apart from the groove: a fill
    // is commentary on what comes next, and widening the range never re-rolls
    // a fill in a bar already liked.
    let fill = null, frng = null;
    if (boundaries.has(bar + 1)) { // section fill: before a declared boundary, crash on the arrival
      if (fillAmt > 0) {
        frng = drumRng(seed, bar * 7919 + 13);
        // the FILLS knob (not energy) picks the band and the odds — Logic's
        // Fill Amount/Complexity split, collapsed to one knob (Josh, 2026-08-22)
        const pool = DR_FILLS.filter(f => fillAmt >= f.minE && fillAmt <= f.maxE);
        if (frng() < 0.35 + 0.12 * fillAmt) fill = drPickFill(frng, fillAmt, pool, prevFill);
      }
    } else if (fillAmt >= 3) { // phrase fill: a small lift on the 8th (fills 3) or 4th (fills 4-5) bar of a section, no crash
      const k = drSectionPos(bar).k;
      if (k % 8 === 0 || (fillAmt >= 4 && k % 4 === 0)) {
        frng = drumRng(seed, bar * 7919 + 29);
        if (frng() < 0.25 + 0.1 * fillAmt) {
          const pool = fillAmt >= 4 && k % 8 === 0 ? DR_SMALL_FILLS.concat(DR_MEDIUM_FILLS) : DR_SMALL_FILLS;
          fill = drPickFill(frng, 3, pool, prevFill); // even pick: no fill dominates the middle of a section
        }
      }
    }
    if (fill) prevFill = fill.name;
    const fillStart = fill ? bs + (beats - Math.min(fill.len, beats)) * qt : Infinity;
    // skeleton: kick on 1 (fixed in every feel) — knobs never move the anchor
    put(bs, 36, 104 + rng() * 8, 70);
    let barSnareV = 0; // tracked PRE-delta: the hats-under-snare discipline shifts uniformly
    const backs = feel === "half" ? [Math.floor(beats / 2) + 1] : drBackbeats(beats);
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
    // ghost notes: soft snares on the 16th either side of a backbeat — the
    // motion busy promises. Their own substream, keyed like the groove so
    // they repeat with it; none in a fill window, none under double (every
    // slot is owned); a floor of 18 so hard 1 can't erase them
    if (feel !== "double" && busy >= 3) {
      const g = drumRng(seed ^ 0x5BD1E995, lane);
      const prob = [0, 0, 0.5, 0.6, 0.7][busy - 1], cap = [0, 0, 1, 2, 3][busy - 1];
      let ghosts = 0;
      for (const b of backs) for (const sl of [(b - 1) * 4 - 1, (b - 1) * 4 + 1]) {
        if (sl < 1 || sl >= beats * 4 || ghosts >= cap || g() >= prob) continue;
        ghosts++;
        const t = bs + sl * qt / 4;
        if (t < fillStart) put(t, 38, 28 + g() * 12, 30, 18);
      }
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
        if (n.d >= qt * 1.5 && !backs.some(b => Math.abs(n.t - (bs + (b - 1) * qt)) < 5))
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
    if (fill) for (const h of fill.hits(frng, qt, beats, {bs, onsets: onsetsIn(fillStart, bs + bt).map(t => t - bs)}))
      put(bs + h.off, h.p, h.v, h.d);
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
