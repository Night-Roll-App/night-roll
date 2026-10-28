// src/audio/seam.js — the loop-seam cycle's PURE half (Josh, 2026-10-27: "listen
// to the loop transitions … bars 25 through 27.3, then bars 3 through 5, over
// and over"). A seam is a LIST of spans played back to back, forever:
// S.loopSeg.spans = [{start, end}, …] in the scheduler's "sec" domain, with
// loopSeg.start/end mirroring spans[0] so single-span readers stay valid.
// Pass k plays spans[k % n]; there is no gap anywhere — pass k+1 starts at the
// context time pass k's last sample ends (transport.js pump; chip.js /
// chip-stream.js cut their rendered audio at the same boundaries).
// No imports: tests load it with the rest of src/ and the maths needs nothing.

export const SEAM_BARS = 2; // "hear the seam": this many bars before the jump and after the loop target

export function seamTotal(spans) { let t = 0; for (const s of spans) t += s.end - s.start; return t; }
// seconds from pass 0's start to pass k's start
export function seamPassStart(spans, k) {
  const n = spans.length, lap = seamTotal(spans);
  let t = Math.floor(k / n) * lap;
  for (let j = 0; j < k % n; j++) t += spans[j].end - spans[j].start;
  return t;
}
// where `elapsed` seconds after pass 0 began sits: {idx: span index, pass, pos: song seconds}
export function seamAt(spans, elapsed) {
  const n = spans.length, lap = seamTotal(spans);
  const e = Math.max(0, elapsed), laps = Math.floor(e / lap);
  let r = e - laps * lap, idx = 0;
  while (idx < n - 1 && r >= spans[idx].end - spans[idx].start) { r -= spans[idx].end - spans[idx].start; idx++; }
  return {idx, pass: laps * n + idx, pos: spans[idx].start + r};
}
// the span sounding now (loopSeg.spans, else the loop body itself)
export function seamSpanNow(loopSeg, ctxNow, playT0) {
  return loopSeg.spans ? loopSeg.spans[seamAt(loopSeg.spans, ctxNow - playT0).idx] : loopSeg;
}
// tick spans [{a, b}] -> sec spans, clamped to the song; zero-length ones dropped
export function seamSegFromTicks(tickSpans, tickToSecFn, endTick) {
  const spans = [];
  for (const sp of tickSpans) {
    const a = Math.max(0, sp.a), b = Math.min(sp.b, endTick);
    if (b > a) spans.push({start: tickToSecFn(a), end: tickToSecFn(b)});
  }
  return spans.length ? {start: spans[0].start, end: spans[0].end, looped: true, spans} : null;
}
// The seam of a loop: annotation (loopTo = the return bar, jump = the anchor).
// A = the `bars` before the jump point -> the jump point; B = the return point
// -> `bars` after it. A jump at/before the target means the song's end, as
// currentLoop() reads it. null when there is no loop to hear.
export function seamAroundLoop(loopTo, jump, barTicks, endTick, bars = SEAM_BARS) {
  if (loopTo === undefined || !(endTick > 0)) return null;
  const j = jump > loopTo ? Math.min(jump, endTick) : endTick;
  if (!(j > loopTo)) return null;
  const a = Math.max(0, j - bars * barTicks);
  return [{a, b: j}, {a: loopTo, b: Math.min(endTick, loopTo + bars * barTicks)}];
}
// "27.3" <-> ticks: the ruler's own bar.beat (bar from 1, counted beat from 1;
// a bare "27" is beat 1). null = not a position on the grid.
export function seamParsePos(text, barTicks, beatTicks) {
  const m = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(String(text));
  if (!m) return null;
  const bar = +m[1], beat = m[2] === undefined ? 1 : +m[2];
  if (bar < 1 || beat < 1 || beat > Math.floor(barTicks / beatTicks)) return null;
  return (bar - 1) * barTicks + (beat - 1) * beatTicks;
}
export function seamPosText(tick, barTicks, beatTicks) {
  const bar = Math.floor(tick / barTicks + 1e-9) + 1, beat = (tick - (bar - 1) * barTicks) / beatTicks + 1;
  return bar + "." + Math.round(beat * 100) / 100;
}
export function seamSpansText(spans, barTicks, beatTicks) {
  return spans.map(s => seamPosText(s.a, barTicks, beatTicks) + "–" + seamPosText(s.b, barTicks, beatTicks)).join(" then ");
}
// Drag one edge of one span (Josh, 2026-10-28: "three bars at the beginning and
// the end"): edge "a" | "b" moves to `tick`, kept at least `min` long and inside
// [0, end]. Spans may overlap each other in time (a loop's tail sits AFTER its
// head), so only the span itself is constrained. Returns a new list.
export function dragSeamEdge(spans, idx, edge, tick, limits) {
  const min = limits.min, end = limits.end;
  return spans.map((s, i) => {
    if (i !== idx) return s;
    if (edge === "a") return {a: Math.max(0, Math.min(tick, s.b - min)), b: s.b};
    return {a: s.a, b: Math.min(end, Math.max(tick, s.a + min))};
  });
}
// the grabbable edge nearest `x` within `slop` px: {i, edge} or null; xOf maps tick -> screen x
export function seamEdgeAt(spans, x, xOf, slop) {
  let best = null, bd = slop;
  spans.forEach((s, i) => { for (const edge of ["a", "b"]) {
    const d = Math.abs(x - xOf(s[edge]));
    if (d < bd || (d === bd && best && edge === "a")) { bd = d; best = {i, edge}; }
  } });
  return best;
}
