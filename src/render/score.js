import { LETTER_PC } from "../theory/chords.js";
import { S, prof } from "../state.js";
import { barTicks } from "../model/rollnotes.js";
import { sfAt } from "../model/song.js";
import { trackIsDrums } from "../model/grid.js";
import { trackShown } from "./roll.js";
import { isComposition } from "../model/provenance.js";
import { trackColor } from "./roll.js";
import { SF_MAJOR } from "../theory/chords.js";
import { pxPerTick } from "./roll.js";
import { sfDeclaredAt } from "../model/song.js";
import { SHARP_SPELL } from "../theory/chords.js";
import { spellFor } from "../theory/chords.js";
import { effTs } from "../model/grid.js";
import { drawRangeTints } from "./roll.js";
import { ctx } from "./roll.js";
import { css } from "./roll.js";
import { drawLasso } from "./roll.js";
import { secToTick } from "../midi/parse.js";
import { playSec } from "../audio/transport.js";
import { beatsPerBarDisp } from "../model/grid.js";

// ---------------------------------------------------------------- score view
export const VF = (() => {
  try { return Vex.Flow.Stave ? Vex.Flow : Vex; } catch (e) { return null; }
})();
// cached clef/key/time column
export const STAVE_H = 100, SCORE_TOP = 18, SCORE_PAD = 50, SCORE_INTRO_W = 100;
// Drum-chart conventions (handoff spec): staff positions are ROLES, not
// pitches — kick bottom space, snare 3rd space, toms by size, hats above the
// top line; x-heads for metal; stems up = hands, down = feet.
export const DRUM_SCORE = {
  35: {key: "f/4", x: false, hand: false}, 36: {key: "f/4", x: false, hand: false}, // kicks
  44: {key: "d/4", x: true,  hand: false},                                          // hat pedal
  37: {key: "c/5", x: true,  hand: true},                                           // side stick
  38: {key: "c/5", x: false, hand: true}, 40: {key: "c/5", x: false, hand: true},   // snares
  41: {key: "a/4", x: false, hand: true}, 43: {key: "a/4", x: false, hand: true},   // floor toms
  45: {key: "d/5", x: false, hand: true}, 47: {key: "d/5", x: false, hand: true},   // mid toms
  48: {key: "e/5", x: false, hand: true}, 50: {key: "e/5", x: false, hand: true},   // high toms
  42: {key: "g/5", x: true,  hand: true}, 46: {key: "g/5", x: true,  hand: true},   // hats
  49: {key: "a/5", x: true,  hand: true},                                           // crash
  51: {key: "f/5", x: true,  hand: true},                                           // ride
};
export function drumScoreRole(gm) { return DRUM_SCORE[gm] || {key: "c/5", x: true, hand: true}; }
export function vexKey(pitch, spell) {
  const s = spell[pitch % 12];
  const naturalPc = LETTER_PC[s.letter];
  const accSemis = s.acc === "#" ? 1 : s.acc === "b" ? -1 : s.acc === "##" ? 2 : s.acc === "bb" ? -2 : 0;
  // octave of the *letter*: derive from the letter's natural pitch nearest this note
  const letterMidi = pitch - accSemis;
  const octave = Math.floor(letterMidi / 12) - 1;
  return s.letter.toLowerCase() + (s.acc || "") + "/" + octave;
}
// duration decomposition: ticks -> notated pieces (greedy, tied)
export function durationPieces(ticks, ppq) {
  const table = [
    [4 * ppq, "w", 0], [3 * ppq, "h", 1], [2 * ppq, "h", 0], [1.5 * ppq, "q", 1],
    [ppq, "q", 0], [0.75 * ppq, "8", 1], [0.5 * ppq, "8", 0],
    [0.375 * ppq, "16", 1], [0.25 * ppq, "16", 0],
  ];
  const out = [];
  let rem = ticks;
  let guard = 0;
  while (rem >= 0.25 * ppq - 1 && guard++ < 32) {
    const hit = table.find(([tk]) => tk <= rem + 1);
    if (!hit) break;
    out.push({dur: hit[1], dots: hit[2], ticks: hit[0]});
    rem -= hit[0];
  }
  return out.length ? out : [{dur: "16", dots: 0, ticks: 0.25 * ppq}];
}
export function buildScoreModelImpl() {
  S.scoreModel = null;
  S.scoreCache.clear();
  S.scoreIntro = null;
  if (!VF || !S.song) return;
  const bt = barTicks();
  const grid = S.song.ppq / 4; // 16th grid
  let lastTick = 0;
  S.song.tracks.forEach(tr => tr.notes.forEach(n => { if (!n.gone) lastTick = Math.max(lastTick, n.t + n.d); }));
  const nMeasures = Math.max(1, Math.ceil(lastTick / bt - 0.05));
  const sf0 = sfAt(0);
  const staves = [];
  S.song.tracks.forEach((tr, ti) => {
    if (trackIsDrums(ti) || !trackShown(ti) || tr.kind === "audio") return; // no staff for a clip
    // compositions keep empty tracks visible — the stave must exist before
    // its first note can be entered on it
    if (!tr.notes.length && !isComposition()) return;
    // quantize + chord-group
    const byStart = new Map();
    for (let ni = 0; ni < tr.notes.length; ni++) {
      const n = tr.notes[ni];
      if (n.gone) continue;
      const qt = Math.round(n.t / grid) * grid;
      const qd = Math.max(grid, Math.round(n.d / grid) * grid);
      const cur = byStart.get(qt);
      if (cur) {
        if (!cur.pitches.includes(n.p)) { cur.pitches.push(n.p); cur.refs.push({ti, ni}); }
        cur.dur = Math.max(cur.dur, qd);
      } else byStart.set(qt, {start: qt, dur: qd, pitches: [n.p], refs: [{ti, ni}]});
    }
    const evs = [...byStart.values()].sort((a, b) => a.start - b.start);
    for (let k = 0; k + 1 < evs.length; k++) {
      if (evs[k].start + evs[k].dur > evs[k+1].start) evs[k].dur = evs[k+1].start - evs[k].start;
    }
    const clean = evs.filter(e => e.dur > 0);
    // avg pitch -> clef (empty track: guess from the voice name)
    const avg = clean.reduce((a, e) => a + e.pitches[0], 0) / (clean.length || 1);
    const clef = clean.length ? (avg < 58 ? "bass" : "treble")
               : (/tri|bass/i.test(tr.name || "") ? "bass" : "treble");
    // split into measures, fragments tied across barlines, gaps become rests
    const measures = Array.from({length: nMeasures}, () => []);
    let pos = 0; // rest-fill position
    const pushRest = (from, to) => {
      let f = from;
      while (f < to - 1) {
        const mi = Math.floor(f / bt);
        if (mi >= nMeasures) break;
        const mEnd = Math.min(to, (mi + 1) * bt);
        for (const p of durationPieces(mEnd - f, S.song.ppq)) {
          measures[mi].push({rest: true, start: f, dur: p.dur, dots: p.dots});
          f += p.ticks;
          if (f >= mEnd - 1) break;
        }
        f = Math.max(f, mEnd);
      }
    };
    for (const e of clean) {
      if (e.start > pos) pushRest(pos, e.start);
      let f = e.start;
      const endT = e.start + e.dur;
      let prevPiece = null;
      while (f < endT - 1) {
        const mi = Math.floor(f / bt);
        if (mi >= nMeasures) break;
        const mEnd = Math.min(endT, (mi + 1) * bt);
        for (const p of durationPieces(mEnd - f, S.song.ppq)) {
          const piece = {rest: false, start: f, dur: p.dur, dots: p.dots,
                         pitches: e.pitches.slice().sort((a, b) => a - b), refs: e.refs,
                         tieFrom: prevPiece};
          measures[mi].push(piece);
          prevPiece = piece;
          f += p.ticks;
          if (f >= mEnd - 1) break;
        }
        f = Math.max(f, mEnd);
      }
      pos = Math.max(pos, endT);
    }
    staves.push({ti, clef, color: trackColor(ti), measures});
  });
  // the kit staff — ALWAYS at the bottom (Josh's ruling), percussion clef,
  // hands and feet as separate voices so stems read up/down at a glance
  S.song.tracks.forEach((tr, ti) => {
    if (!trackIsDrums(ti) || !trackShown(ti)) return;
    if (!tr.notes.length) return;
    const streams = {hands: new Map(), feet: new Map()};
    for (let ni = 0; ni < tr.notes.length; ni++) {
      const n = tr.notes[ni];
      if (n.gone) continue;
      const role = drumScoreRole(n.p);
      const qt = Math.round(n.t / grid) * grid;
      const lane = role.hand ? streams.hands : streams.feet;
      const cur = lane.get(qt);
      const key = role.key + (role.x ? "/x2" : "");
      if (cur) { if (!cur.keys.includes(key)) { cur.keys.push(key); cur.refs.push({ti, ni}); } }
      else lane.set(qt, {start: qt, dur: grid, keys: [key], refs: [{ti, ni}]});
    }
    const toMeasures = (lane, fillRests) => {
      const evs = [...lane.values()].sort((a, b) => a.start - b.start);
      for (let k = 0; k + 1 < evs.length; k++)
        if (evs[k].start + evs[k].dur > evs[k + 1].start) evs[k].dur = evs[k + 1].start - evs[k].start;
      const ms = Array.from({length: nMeasures}, () => []);
      let pos = 0;
      for (const e of evs) {
        const mi = Math.floor(e.start / bt);
        if (mi >= nMeasures) break;
        if (fillRests && e.start > pos) { // rests in the hands voice keep the meter legible
          let f = pos;
          while (f < e.start - 1) {
            const rmi = Math.floor(f / bt);
            if (rmi >= nMeasures) break;
            const rEnd = Math.min(e.start, (rmi + 1) * bt);
            for (const p of durationPieces(rEnd - f, S.song.ppq)) {
              ms[rmi].push({rest: true, start: f, dur: p.dur, dots: p.dots});
              f += p.ticks;
              if (f >= rEnd - 1) break;
            }
            f = Math.max(f, rEnd);
          }
        }
        const cap = Math.min(e.dur, (mi + 1) * bt - e.start); // hits never tie across barlines
        for (const p of durationPieces(cap, S.song.ppq)) {
          ms[mi].push({rest: false, start: e.start, dur: p.dur, dots: p.dots, keys: e.keys, refs: e.refs});
          break; // one engraved piece per hit
        }
        pos = Math.max(pos, e.start + e.dur);
      }
      return ms;
    };
    staves.push({ti, clef: "percussion", drums: true, color: trackColor(ti),
                 measures: toMeasures(streams.hands, true),
                 measuresFeet: toMeasures(streams.feet, true)}); // feet rests engrave invisibly — they only space the voice
  });
  // zoom floor from the densest measure: VexFlow treats the justify width as
  // a suggestion, so a bar needs ~20px per glyph or it spills past its barline
  let maxEv = 1;
  for (const st of staves) for (let k = 0; k < st.measures.length; k++) {
    const n = st.measures[k].length + (st.measuresFeet ? st.measuresFeet[k].length : 0);
    maxEv = Math.max(maxEv, n);
  }
  const quartersPerBar = bt / S.song.ppq;
  const pxqMin = Math.min(140, Math.max(24, Math.ceil((maxEv * 24 + 72) / quartersPerBar)));
  S.scoreModel = {nMeasures, bt, sf: sf0, keyName: SF_MAJOR[sf0] || "C", staves, pxqMin};
}
buildScoreModelImpl = prof("buildScoreModel", buildScoreModelImpl); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()

export function scoreContentH() {
  return S.scoreModel ? SCORE_TOP + S.scoreModel.staves.length * STAVE_H + 30 : 0;
}
export function renderMeasure(mi) {
  const key = mi;
  if (S.scoreCache.has(key)) return S.scoreCache.get(key);
  const m = S.scoreModel;
  const ppt = pxPerTick();
  const mw = m.bt * ppt;
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.ceil((mw + SCORE_PAD * 2) * dpr);
  c.height = Math.ceil(scoreContentH() * dpr);
  const geo = [], timeMap = [];
  let noteStartXc = SCORE_PAD;
  const renderer = new VF.Renderer(c, VF.Renderer.Backends.CANVAS);
  const ctx2 = renderer.getContext();
  ctx2.scale(dpr, dpr);
  ctx2.setFillStyle("#C7D0E8");
  ctx2.setStrokeStyle("#C7D0E8");
  const sfM = sfAt(mi * m.bt);
  const spell = sfDeclaredAt(mi * m.bt) === null ? SHARP_SPELL : spellFor(sfM);
  const sfPrev = mi > 0 ? sfAt((mi - 1) * m.bt) : sfM;
  const keyChanged = mi > 0 && sfM !== sfPrev;
  const built = []; // per-stave build products, formatted together below
  m.staves.forEach((st, si) => {
    const y = SCORE_TOP + si * STAVE_H;
    const stave = new VF.Stave(SCORE_PAD, y, mw, {fill_style: "#3A4569"});
    if (keyChanged && !st.drums) {
      // cancelKey draws naturals for the outgoing signature (essential when
      // the new key is C, whose own signature is empty)
      try { stave.addKeySignature(SF_MAJOR[sfM] || "C", SF_MAJOR[sfPrev] || "C"); }
      catch (e) { stave.addKeySignature(SF_MAJOR[sfM] || "C"); }
    }
    stave.setContext(ctx2).draw();
    if (si === 0) noteStartXc = stave.getNoteStartX();
    const mkVoice = (events, stemDir, hideRests) => { // stemDir null = melodic auto
      const vnotes = [];
      for (const e of events) {
        let vn;
        // dots MUST ride the constructor: Dot.buildAndAttach draws the glyph but
        // adds NO ticks, so every dotted figure ran a beat ahead of its stave-
        // mates and the playhead (Josh: notes engraved well before 2.4)
        if (e.rest) {
          vn = new VF.StaveNote({clef: st.clef === "percussion" ? "percussion" : st.clef,
                                 keys: [st.clef === "bass" ? "d/3" : st.clef === "percussion" ? "f/4" : "b/4"],
                                 duration: e.dur + "r", dots: e.dots || 0});
          if (hideRests) { vn.setStyle({fillStyle: "rgba(0,0,0,0)", strokeStyle: "rgba(0,0,0,0)"}); e.hidden = true; }
        } else if (st.drums) {
          vn = new VF.StaveNote({clef: "percussion", keys: e.keys, duration: e.dur, stem_direction: stemDir, dots: e.dots || 0});
        } else {
          vn = new VF.StaveNote({clef: st.clef, keys: e.pitches.map(p => vexKey(p, spell)), duration: e.dur, auto_stem: true, dots: e.dots || 0});
        }
        if (!e.hidden) vn.setStyle({fillStyle: st.color, strokeStyle: st.color});
        for (let dd = 0; dd < e.dots; dd++) VF.Dot.buildAndAttach([vn], {all: true});
        e.vn = vn;
        vnotes.push(vn);
      }
      const voice = new VF.Voice({num_beats: effTs()[0], beat_value: effTs()[1]});
      voice.setMode(VF.Voice.Mode.SOFT);
      voice.addTickables(vnotes);
      return {voice, vnotes};
    };
    if (st.drums) { // hands (stems up) + feet (stems down), two voices, one staff
      const hands = st.measures[mi] || [], feet = (st.measuresFeet && st.measuresFeet[mi]) || [];
      if (!hands.length && !feet.length) { timeMap.push({tick: mi * m.bt, x: SCORE_PAD}); return; }
      const vH = mkVoice(hands, 1), vF = mkVoice(feet, -1, true);
      built.push({st, si, stave, voice: vH.voice, voice2: vF.voice,
                  vnotes: vH.vnotes, vnotes2: vF.vnotes, events: hands.concat(feet)});
      return;
    }
    const events = st.measures[mi] || [];
    if (!events.length) { timeMap.push({tick: mi * m.bt, x: SCORE_PAD}); return; }
    const {voice, vnotes} = mkVoice(events, null);
    VF.Accidental.applyAccidentals([voice], SF_MAJOR[sfM] || "C");
    built.push({st, si, stave, voice, vnotes, events});
  });
  // ONE formatter across every stave: shared tick contexts mean the same
  // beat gets the same x column on all staves — simultaneous notes line up
  // with each other, the playhead's anchors agree between staves, and note
  // geometry stops interleaving (which also confused the lasso)
  if (built.length) {
    // softmaxFactor > default skews spacing toward duration-proportional,
    // shrinking the playhead's crawl-then-sprint across dotted figures
    const fmt = new VF.Formatter({softmaxFactor: 10});
    for (const b of built) fmt.joinVoices(b.voice2 ? [b.voice, b.voice2] : [b.voice]);
    fmt.format(built.flatMap(b => b.voice2 ? [b.voice, b.voice2] : [b.voice]),
               mw - (built[0].stave.getNoteStartX() - SCORE_PAD) - 14);
  }
  for (const {st, si, stave, voice, voice2, vnotes, vnotes2, events} of built) {
    voice.draw(ctx2, stave);
    if (voice2) voice2.draw(ctx2, stave);
    // rests must break beams — beaming only the notes bridges beams straight
    // across rest gaps (spaghetti in syncopated 16th patterns)
    let beams;
    const beamOpts = st.drums ? {beam_rests: false, maintain_stem_directions: true} : {beam_rests: false};
    try { beams = VF.Beam.generateBeams(vnotes, beamOpts); }
    catch (e) { beams = VF.Beam.generateBeams(vnotes.filter(v => !v.isRest())); }
    if (vnotes2 && vnotes2.length) {
      try { beams = beams.concat(VF.Beam.generateBeams(vnotes2, beamOpts)); } catch (e) {}
    }
    beams.forEach(b => {
      b.setStyle({fillStyle: st.color, strokeStyle: st.color});
      b.setContext(ctx2).draw();
    });
    // ties within the measure
    for (const e of events) {
      if (!e.rest && e.tieFrom && e.tieFrom.vn && events.includes(e.tieFrom)) {
        const idx = e.pitches.map((_, k) => k);
        const tie = new VF.StaveTie({first_note: e.tieFrom.vn, last_note: e.vn, first_indices: idx, last_indices: idx});
        if (tie.setStyle) tie.setStyle({fillStyle: st.color, strokeStyle: st.color});
        tie.setContext(ctx2).draw();
      }
    }
    // geometry + time map
    for (const e of events) {
      if (!e.vn) continue;
      const bx = e.vn.getBoundingBox();
      if (!e.rest && bx) {
        geo.push({tick: e.start, x0: bx.x - 2, x1: bx.x + bx.w + 2, y0: bx.y - 2, y1: bx.y + bx.h + 2,
                  refs: e.refs, ti: st.ti,
                  pitches: e.pitches || e.refs.map(r => S.song.tracks[r.ti].notes[r.ni].p)});
      }
      if (si === 0 || !timeMap.some(tm => tm.tick === e.start)) {
        timeMap.push({tick: e.start, x: e.vn.getAbsoluteX()});
      }
      delete e.vn;
    }
  }
  timeMap.sort((a, b) => a.tick - b.tick);
  // noteheads from different staves/voices at nearby ticks can engrave a few
  // px out of order. The old fix clamped x flat, which froze the playhead
  // across the zero-width segment (Josh caught it stalling at dotted eighths).
  // Instead: dedupe same-tick anchors (leading stave's x), then force x
  // STRICTLY increasing — never backwards, never flat
  const dedup = [];
  for (const tm of timeMap) {
    const last = dedup[dedup.length - 1];
    if (last && last.tick === tm.tick) last.x = Math.min(last.x, tm.x);
    else dedup.push(tm);
  }
  let hx = -Infinity;
  const xCap = SCORE_PAD + mw - 4; // dense bars can engrave past their barline
  for (const tm of dedup) { tm.x = Math.min(Math.max(tm.x, hx + 0.5), xCap); hx = tm.x; }
  // the cap can flatten the tail; re-spread the flattened run backwards so
  // motion stays strictly forward into the next measure
  for (let i = dedup.length - 2; i >= 0; i--)
    if (dedup[i].x >= dedup[i + 1].x) dedup[i].x = dedup[i + 1].x - 0.5;
  const entry = {canvas: c, geo, timeMap: dedup, mw, noteStartX: noteStartXc, keyChanged};
  S.scoreCache.set(key, entry);
  if (S.scoreCache.size > 60) S.scoreCache.delete(S.scoreCache.keys().next().value);
  return entry;
}
export function renderIntro() { // pinned-at-start clef / key / time column
  if (S.scoreIntro) return S.scoreIntro;
  const m = S.scoreModel;
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.ceil(SCORE_INTRO_W * dpr);
  c.height = Math.ceil(scoreContentH() * dpr);
  const renderer = new VF.Renderer(c, VF.Renderer.Backends.CANVAS);
  const ctx2 = renderer.getContext();
  ctx2.scale(dpr, dpr);
  ctx2.setFillStyle("#C7D0E8");
  ctx2.setStrokeStyle("#C7D0E8");
  m.staves.forEach((st, si) => {
    const y = SCORE_TOP + si * STAVE_H;
    const stave = new VF.Stave(0, y, SCORE_INTRO_W, {fill_style: "#3A4569"});
    stave.addClef(st.clef);
    if (m.sf !== 0 && !st.drums) stave.addKeySignature(m.keyName); // roles, not pitches
    if (S.declaredTs) stave.addTimeSignature(S.declaredTs[0] + "/" + S.declaredTs[1]);
    stave.setContext(ctx2).draw();
  });
  S.scoreIntro = c;
  return c;
}
export function scoreTickToX(tick) {
  // piecewise-linear between engraved noteheads at their attack ticks — the
  // line touches each notehead exactly when it sounds and glides between
  // them, across barlines too, so pads and signature glyphs are absorbed
  // into the glide instead of hopped (notation-app style)
  if (!S.scoreModel) return S.RULER_W + tick * pxPerTick() - S.view.x;
  const m = S.scoreModel;
  const ppt = pxPerTick();
  const mOrigin = k => S.RULER_W + k * m.bt * ppt - S.view.x - SCORE_PAD;
  const mi = Math.min(m.nMeasures - 1, Math.max(0, Math.floor(tick / m.bt)));
  const entry = S.scoreCache.get(mi);
  if (!entry) return S.RULER_W + tick * ppt - S.view.x;
  let a = null, b = null; // surrounding anchors, screen coords
  for (const p of entry.timeMap) {
    if (p.tick <= tick) a = {tick: p.tick, x: mOrigin(mi) + p.x};
    else { b = {tick: p.tick, x: mOrigin(mi) + p.x}; break; }
  }
  if (!a) { // before this measure's first note: reach back to the previous one
    const prev = mi > 0 ? S.scoreCache.get(mi - 1) : null;
    const lp = prev && prev.timeMap.length ? prev.timeMap[prev.timeMap.length - 1] : null;
    a = lp ? {tick: lp.tick, x: mOrigin(mi - 1) + lp.x}
           : {tick: mi * m.bt, x: mOrigin(mi) + (entry.keyChanged ? entry.noteStartX : SCORE_PAD)};
  }
  if (!b) { // after this measure's last note: reach ahead to the next one
    const nxt = mi + 1 < m.nMeasures ? S.scoreCache.get(mi + 1) : null;
    const np = nxt && nxt.timeMap.length ? nxt.timeMap[0] : null;
    b = np ? {tick: np.tick, x: mOrigin(mi + 1) + np.x}
           : {tick: (mi + 1) * m.bt, x: mOrigin(mi) + SCORE_PAD + entry.mw};
  }
  const f = b.tick === a.tick ? 0 : (tick - a.tick) / (b.tick - a.tick);
  return a.x + f * (b.x - a.x);
}
export function scoreXToTick(x) { // inverse, coarse: linear within measure
  const t = (x - S.RULER_W + S.view.x) / pxPerTick();
  return Math.max(0, t);
}
export function drawScore(W, H, skipCursor) { // skipCursor: playbackFrame's cached scene — the overlay draws the playhead
  const m = S.scoreModel;
  const ppt = pxPerTick();
  const mw = m.bt * ppt;
  // during a pinch, keep the stale-zoom cache and blit it scaled — a full
  // VexFlow re-engrave per pointermove melts the iPad; rebuild once at gesture end
  if (S.scoreZoom !== S.view.pxq && !S.pinch) { S.scoreCache.clear(); S.scoreZoom = S.view.pxq; }
  const first = Math.max(0, Math.floor(S.view.x / mw) - 1);
  const last = Math.min(m.nMeasures - 1, Math.ceil((S.view.x + W) / mw) + 1);
  drawRangeTints(W, H);
  const dpr = window.devicePixelRatio || 1;
  for (let mi = first; mi <= last; mi++) {
    const entry = renderMeasure(mi);
    const s = (m.bt * ppt) / entry.mw; // ≠1 only mid-pinch (entry from old zoom)
    const x = S.RULER_W + mi * m.bt * ppt - S.view.x - SCORE_PAD * s;
    ctx.drawImage(entry.canvas, 0, 0, entry.canvas.width, entry.canvas.height,
                  x, S.RULER_H + 4 - (S.view.y || 0), entry.canvas.width / dpr * s, entry.canvas.height / dpr);
  }
  { // intro column (clef/key/time) lives just left of bar 1
    const intro = renderIntro();
    const x = S.RULER_W - SCORE_INTRO_W - S.view.x;
    if (x + SCORE_INTRO_W > S.RULER_W - 4) {
      ctx.drawImage(intro, 0, 0, intro.width, intro.height,
                    x, S.RULER_H + 4 - (S.view.y || 0), intro.width / dpr, intro.height / dpr);
    }
  }
  // lasso-selected noteheads (gold) + pitch-class finder hits (accent)
  if (S.multiSelKey.size || S.findPc !== null) {
    ctx.lineWidth = 2;
    for (let mi = first; mi <= last; mi++) {
      const entry = S.scoreCache.get(mi);
      if (!entry) continue;
      const mx = S.RULER_W + mi * m.bt * ppt - S.view.x - SCORE_PAD;
      const my = S.RULER_H + 4 - (S.view.y || 0);
      for (const g of entry.geo) {
        const sel = g.refs.some(rf => S.multiSelKey.has(rf.ti + ":" + rf.ni));
        const hit = S.findPc !== null &&
                    g.refs.some(rf => S.song.tracks[rf.ti].notes[rf.ni].p % 12 === S.findPc);
        if (sel || hit) {
          ctx.strokeStyle = sel ? css("--gold") : css("--accent");
          ctx.strokeRect(mx + g.x0, my + g.y0, g.x1 - g.x0, g.y1 - g.y0);
        }
      }
    }
    ctx.lineWidth = 1;
  }
  drawScorePencilGuides(W, H);
  drawLasso();
  // playhead / cursor — both interpolate notehead-to-notehead (scoreTickToX),
  // the line only, gold while rolling; the handle is the strip's tag
  // (drawStripPlayhead, drawn after drawRuler in drawFull)
  if (skipCursor) return; // a playhead baked into the cache stayed as a second gold line (Josh, 2026-09-29, score view)
  if (S.playing) {
    const x = scoreTickToX(secToTick(S.song, playSec()));
    ctx.fillStyle = css("--gold");
    ctx.fillRect(x, 0, 1.5, H);
  } else {
    const x = scoreTickToX(S.playCursor);
    ctx.fillStyle = css("--accent");
    ctx.fillRect(x - 1, 0, 2.5, H);
  }
}
drawScore = prof("drawScore", drawScore); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()

// Score-side note entry (2026-08-15, the promised follow-up to composition
// mode): the tapped STAVE picks the track, the vertical position picks the
// staff step (calibrated from VexFlow's own line geometry — no magic
// constants), the key signature supplies the accidental unless the ♮♯♭
// segment overrides it, and x snaps to the pencil-duration grid.
export function scoreMeasureAnchors(mi) { // how many real x→time anchors this measure has
  const entry = S.scoreCache.get(mi) || renderMeasure(mi);
  return entry ? entry.timeMap.length : 0;
}
export function drawScorePencilGuides(W, H) { // faint beat lines wherever the linear map governs
  if (!S.editOn || S.mode !== "pencil" || !S.scoreModel) return;
  const ppt = pxPerTick();
  const mw = S.scoreModel.bt * ppt;
  const first = Math.max(0, Math.floor(S.view.x / mw));
  const last = Math.min(S.scoreModel.nMeasures - 1, Math.ceil((S.view.x + W) / mw));
  const bpb = beatsPerBarDisp();
  ctx.fillStyle = css("--accent");
  for (let mi = first; mi <= last; mi++) {
    if (scoreMeasureAnchors(mi) >= 2) continue; // engraved anchors govern there
    const entry = S.scoreCache.get(mi);
    const nsx = entry ? entry.noteStartX : SCORE_PAD;
    const x0 = S.RULER_W + mi * mw - S.view.x - SCORE_PAD;
    const usable = mw + SCORE_PAD - nsx;
    ctx.globalAlpha = 0.25;
    for (let b = 0; b < bpb; b++) {
      const bx = x0 + nsx + (b / bpb) * usable;
      ctx.fillRect(bx, S.RULER_H + 4, 1, scoreContentH());
    }
    ctx.globalAlpha = 1;
  }
}
