import { S } from "../state.js";
import { barTicks } from "./rollnotes.js";

// grid phase origin, set IN the grid sheet (bar.beat)
export function pencilTicks() { return Math.max(1, Math.round(S.song.ppq * S.pencilDur)); }
export function isTripletDur(d) { // 1/6, 1/3, 2/3 — *6 lands on an integer, *4 doesn't
  return Math.abs(d * 6 - Math.round(d * 6)) < 1e-3 && Math.abs(d * 4 - Math.round(d * 4)) > 1e-3;
}
// cached: does the song contain 32nd-resolution material?
export function songHas32nds() {
  if (S._has32 !== null) return S._has32;
  const q8 = Math.round(S.song.ppq / 8), q4 = Math.round(S.song.ppq / 4);
  S._has32 = S.song.tracks.some((tr, ti) => {
    const drums = trackIsDrums(ti); // a drum HIT's duration is synthesis detail,
    // not rhythm (the fill writes 60-tick hits) — only its onset counts
    return tr.notes.some(n => !n.gone &&
      ((n.t % q4 !== 0 && n.t % q8 === 0) ||
       (!drums && n.d % q4 !== 0 && n.d % q8 === 0 && n.d < q4 * 2)));
  });
  return S._has32;
}
export function moveSnapTicks() { // 16th grid normally; triplet steps while a T duration
  // is active; 32nds ONLY when the song actually CONTAINS them (Josh's final
  // spec: presence is the only trigger — to bootstrap, pencil a 32nd on the
  // beat and the whole grid upgrades so you can drag it to the offbeat)
  if (S.gridDiv) return Math.max(1, Math.round(barTicks() / S.gridDiv)); // custom grid outranks all
  if (isTripletDur(S.pencilDur)) return Math.max(1, Math.round(S.song.ppq / 6)); // the finest triplet step (a 16th-triplet), not the picked length: triplets slide a little at a time (Josh, Terminal #352)
  // picking the 32nd duration upgrades the grid too, same as triplets do
  // (Josh, 2026-10-03: "with 32nd selected, notes still drag only in 16ths")
  if (S.pencilDur > 0 && S.pencilDur <= 0.125 + 1e-6) return Math.max(1, Math.round(S.song.ppq * 0.125));
  return Math.max(1, Math.round(S.song.ppq * (songHas32nds() ? 0.125 : 0.25)));
}
// cursor placement on the ruler/strip (Josh, 2026-10-03): a TAP lands on the
// nearest 8th — the usual target; finer spots are reached by dragging, which
// steps in 32nds (or the triplet/custom grid while one is active)
export function cursorTapSnapTicks() { return Math.max(1, Math.round(S.song.ppq / 2)); }
export function cursorDragSnapTicks() {
  if (S.gridDiv || isTripletDur(S.pencilDur)) return moveSnapTicks();
  return Math.max(1, Math.round(S.song.ppq / 8));
}
export function gridAnchorTick() { // grid phase origin — typed into the grid sheet
  // (Josh's 14.2 case: the figure starts mid-bar, so the cells must run FROM
  // there — bar lines stay drawn but stop being snap targets)
  return Math.max(0, Math.round((S.gridAnchor.b - 1) * barTicks() + (S.gridAnchor.q - 1) * beatTicks()));
}
export function snapTickAbs(tick) { // nearest grid LINE, honoring a custom grid's anchor
  const g = moveSnapTicks();
  if (!S.gridDiv) return Math.max(0, Math.round(tick / g) * g);
  const cell = barTicks() / S.gridDiv, a = gridAnchorTick();
  return Math.max(0, Math.round(a + Math.round((tick - a) / cell) * cell));
}
// "Keep its spot, but lines pull" (Ableton's rule; docs/plans/2026-10-10-note-movement.md M2):
// a dragged point (note start, or an edge) lands on whichever is nearer the
// finger — the nearest grid line (custom grid: from its anchor) or its own
// spot plus whole steps of g. Under half a step of sideways motion it stays
// put: an off-grid point would otherwise jump to a line on a wobble (#358).
// Returns the delta in ticks.
export function snapKeepSpot(orig, rawDelta, g) {
  const k = Math.round(rawDelta / g);
  if (k === 0) return 0;
  const want = orig + rawDelta;
  let line;
  if (S.gridDiv) {
    const cell = barTicks() / S.gridDiv, a = gridAnchorTick();
    line = Math.round(a + Math.round((want - a) / cell) * cell);
  } else line = Math.round(want / g) * g;
  line = Math.max(0, line);
  return Math.abs(line - want) <= Math.abs(orig + k * g - want) ? line - orig : k * g;
}
// Pencil placement off the roll (fall view, score): under a custom grid a tap
// is one CELL — 6/bar gives quarter triplets, 12/bar eighth triplets — the
// same rule the roll pencil already followed (Josh, 2026-09-12)
export function pencilCellAt(tick) {
  if (S.gridDiv) return {t: gridCellStart(tick), snap: moveSnapTicks()};
  const snap = pencilTicks();
  return {t: Math.max(0, Math.round(tick / snap) * snap), snap};
}
// the pencil's own cell: the picked value's grid — 8th picked, taps land on
// 8ths even in a song whose move grid went 32nd-fine (Josh, 2026-10-04: "it's
// always shifted off by a bit"); dotted values use their plain value's grid,
// triplets their triplet step. Drags still fine-tune on moveSnapTicks.
export function pencilGridTicks() {
  if (isTripletDur(S.pencilDur)) return pencilTicks();
  return Math.max(1, Math.round(S.song.ppq * 4 / (S.pencilNV || 4 / S.pencilDur)));
}
export function gridCellStart(tick) { // pencil cell floor — one continuous phase from
  // the anchor, so cells never drift whatever the division
  const g = pencilGridTicks();
  if (!S.gridDiv) return Math.floor(tick / g) * g;
  const cell = barTicks() / S.gridDiv, a = gridAnchorTick();
  return Math.round(a + Math.floor((tick - a) / cell) * cell);
}
// [num, den] from a "timesig: N/D" directive; null = undeclared
// meter is analysis: until the user declares it, everything runs on a
// neutral 4/4 ruler — the MIDI's meter meta drives nothing visible
export function effTs() { return S.declaredTs || [4, 4]; }
export function beatsPerBarEff() { const t = effTs(); return t[0] * 4 / t[1]; }
// bar length in QUARTERS (tick math)
// the displayed/counted beat is the denominator note: eighths in 6/8, so
// anchors read [1.4] = fourth eighth — the way compound meters are counted
export function beatTicks() { return S.song.ppq * 4 / effTs()[1]; }
export function beatsPerBarDisp() { return effTs()[0]; }
export function secDepthCap() { // device pref, per song: how many section levels show
  const v = S.songKey ? localStorage.getItem("ff1roll-secdepth-" + S.songKey) : null;
  return v === null ? 99 : Math.max(0, +v);
}
export function trackIsDrums(ti) {
  const tr = S.song.tracks[ti];
  if (tr.kind === "audio") return false; // "drums-di.wav" is a take, not a kit
  if (tr.drums === undefined)
    // "noise" = the NES noise channel — percussion by hardware definition
    tr.drums = /drum|percussion|kit|noise|dpcm/i.test(tr.name) || tr.notes.some(x => x.ch === 9);
  return tr.drums;
}

export function snapBeat(q) { return Math.round((q - 1) / 0.25) * 0.25 + 1; }
// Position words — one formatter for every readout (LCD, note status line,
// clip/Drummer/Bassist messages, annotation list), option B of
// docs/plans/2026-10-07-cursor-position-readout.md: bar, the counted beat
// ("2" "2e" "2&" "2a") and, only off that 16th grid, "+NN%" of the way into
// the 16th. Beat = beatTicks() (the meter's denominator), so 6/8's & is a 16th.
// Display only: stored anchors and file formats never change.
export const POS_SYL = ["", "e", "&", "a"];
export function posCount(u, perBar) { // u = 16ths since the song start; perBar = 16ths per bar
  let n = Math.floor(u + 1e-9), pct = Math.round((u - n) * 100);
  if (pct >= 100) { n++; pct = 0; }
  const k = n % perBar;
  return {bar: Math.floor(n / perBar) + 1, beat: Math.floor(k / 4) + 1, syl: POS_SYL[k % 4], pct};
}
export function posParts(t) {
  // per-file ppq: a 16th may be a fractional tick count; a captured note one
  // tick off the grid still reads on it (never "1a +99%")
  const sx = beatTicks() / 4, tol = Math.min(1, sx / 8);
  let u = Math.max(0, Math.round(t)) / sx;
  const near = Math.round(u);
  if (Math.abs(u - near) * sx <= tol + 1e-9) u = near;
  return posCount(u, 4 * effTs()[0]);
}
export function posAnchor(b, q) { return posCount(Math.max(0, (b - 1) * 4 * effTs()[0] + ((q || 1) - 1) * 4), 4 * effTs()[0]); }
export function posBeatWord(p) { return p.beat + p.syl + (p.pct ? " +" + p.pct + "%" : ""); }
export function posText(t) { const p = posParts(t); return "bar " + p.bar + " beat " + posBeatWord(p); }
export function posShort(p) { return "bar " + p.bar + (p.beat === 1 && !p.syl && !p.pct ? "" : " beat " + posBeatWord(p)); }
export function posAnchorText(n) { // an annotation's b1/q1(–b2/q2) — q2 is the inclusive end beat, absent = the whole bar
  const head = posShort(posAnchor(n.b1, n.q1));
  if (!n.b2) return head;
  if (n.q2 === null || n.q2 === undefined) return head + "–" + n.b2;
  const e = posAnchor(n.b2, n.q2);
  return head + "–" + e.bar + " beat " + posBeatWord(e);
}
