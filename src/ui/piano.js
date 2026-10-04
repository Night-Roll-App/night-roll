// src/ui/piano.js — the on-screen keyboard's geometry, DOM-free (2026-10-04,
// docs/daw-inventory.md §1a: Josh, "you can scroll it left and right … ours
// would play every note on the piano if you try to scroll on it"). The
// keyboard is the whole 88-key piano at a FIXED finger-sized key width, and
// a scroll offset (in white keys, so a phone and an iPad share one pref)
// picks the window — the keys never squeeze to the song's range any more.
// Everything here is pure arithmetic over (W, scroll) so the drawing, the
// hit-test, the Fall view and the vm tests all agree on where a key is.
export const PIANO_LO = 21;  // A0
export const PIANO_HI = 108; // C8
export const PIANO_WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
// black keys sit at their real offsets, not centred on the seam: the C♯/D♯
// pair leans apart (toward C and E), F♯/A♯ lean outward, G♯ is centred —
// fractions of a white key's width, measured from the seam to the key's
// centre. Negative = toward the lower white.
export const PIANO_BLACK_OFF = {1: -0.09, 3: 0.09, 6: -0.13, 8: 0, 10: 0.13};
export const PIANO_BLACK_W = 0.58; // of a white key's width
export const PIANO_BLACK_H = 0.62; // of the panel's height

export function pianoIsWhite(p) { return PIANO_WHITE_PCS.includes(((p % 12) + 12) % 12); }

// index of a white key counted from A0 = 0 (B0 = 1, C1 = 2, …); a black
// pitch returns the white below it — the seam it hangs from is that white's
// right edge
export function pianoWhiteIndex(p) {
  const oct = Math.floor(p / 12), pc = p - oct * 12;
  let i = 0;
  while (i < 6 && PIANO_WHITE_PCS[i + 1] <= pc) i++;
  return (oct - 1) * 7 + i - 5; // C1 (p=24, oct 2) → 2; A0 (p=21, oct 1, i=5) → 0
}
export const PIANO_WHITES = (() => {
  const a = [];
  for (let p = PIANO_LO; p <= PIANO_HI; p++) if (pianoIsWhite(p)) a.push(p);
  return a;
})();

// a finger needs ~44 CSS px (Apple's minimum target); a phone-width panel
// trades a little of that for one more visible octave. Once the panel is
// wide enough for all 52 whites at that size (≥ 2288 px) the keys stretch
// to fill it instead of leaving the right third empty (2026-10-04, a 3440
// px window) — the finger size is a floor, never a ceiling, and with
// everything in view there is nothing left to scroll.
export function pianoKeyW(W) {
  const base = W < 480 ? 36 : 44;
  return W >= PIANO_WHITES.length * base ? W / PIANO_WHITES.length : base;
}
export function pianoVisibleWhites(W) { return W / pianoKeyW(W); }
// a stretched piano divides W by W/52: the float residue must not become a
// one-billionth-of-a-key scroll range
export function pianoMaxScroll(W) { const n = PIANO_WHITES.length - pianoVisibleWhites(W); return n < 1e-6 ? 0 : n; }
export function pianoClampScroll(scroll, W) {
  const s = Number.isFinite(scroll) ? scroll : 0;
  return Math.min(pianoMaxScroll(W), Math.max(0, s));
}
// the scroll that puts white key `p` at the left edge, clamped
export function pianoScrollTo(p, W) {
  return pianoClampScroll(pianoWhiteIndex(Math.max(PIANO_LO, Math.min(PIANO_HI, p))), W);
}
// the scroll that centres pitch `p` in the window
export function pianoScrollCentering(p, W) {
  return pianoClampScroll(pianoWhiteIndex(p) + 0.5 - pianoVisibleWhites(W) / 2, W);
}

// {lo, hi, whites, wW, wx, bw, scroll, keyX(p), keyW(p)}: `whites` are the
// white pitches that touch the window (the ones a draw loop needs), `wx[p]`
// each one's left edge in panel px; `keyX(p)` is any key's left edge,
// black keys included, defined for every pitch on the piano
export function pianoGeom(W, H, scroll) {
  const wW = pianoKeyW(W);
  const s = pianoClampScroll(scroll, W);
  const bw = wW * PIANO_BLACK_W, bh = H * PIANO_BLACK_H;
  const first = Math.max(0, Math.floor(s)), last = Math.min(PIANO_WHITES.length - 1, Math.ceil(s + W / wW));
  const whites = PIANO_WHITES.slice(first, last + 1);
  const wx = {};
  for (const p of whites) wx[p] = (pianoWhiteIndex(p) - s) * wW;
  const keyX = p => pianoIsWhite(p) ? (pianoWhiteIndex(p) - s) * wW
    : (pianoWhiteIndex(p) + 1 - s) * wW + PIANO_BLACK_OFF[((p % 12) + 12) % 12] * wW - bw / 2;
  const keyW = p => pianoIsWhite(p) ? wW : bw;
  // lo..hi: every pitch that can touch the window, the black keys hanging
  // off either end included — a draw loop walks this and skips the whites
  return {lo: Math.max(PIANO_LO, whites[0] - 1), hi: Math.min(PIANO_HI, whites[whites.length - 1] + 1),
          whites, wW, wx, bw, bh, scroll: s, keyX, keyW};
}

// the key under (x, y): black keys claim their zone first, then the white
// under x — undefined past either end of the piano
export function pianoHitAt(x, y, W, H, scroll) {
  const g = pianoGeom(W, H, scroll);
  if (y <= g.bh) {
    for (let p = g.lo; p <= g.hi; p++) {
      if (pianoIsWhite(p)) continue;
      const bx = g.keyX(p);
      if (x >= bx && x <= bx + g.bw) return p;
    }
  }
  const i = Math.floor(x / g.wW + g.scroll);
  return PIANO_WHITES[Math.max(0, Math.min(PIANO_WHITES.length - 1, i))];
}

// "C3 – E5": the lowest and highest white keys at least half in the window
export function pianoVisibleRange(W, scroll) {
  const wW = pianoKeyW(W), s = pianoClampScroll(scroll, W);
  const lo = PIANO_WHITES[Math.max(0, Math.min(PIANO_WHITES.length - 1, Math.round(s)))];
  const hi = PIANO_WHITES[Math.max(0, Math.min(PIANO_WHITES.length - 1, Math.ceil(s + W / wW - 0.5) - 1))];
  return [lo, hi];
}
export function pianoWhiteName(p) { // whites spell themselves: C4 = 60
  return "CDEFGAB"[PIANO_WHITE_PCS.indexOf(((p % 12) + 12) % 12)] + (Math.floor(p / 12) - 1);
}
export function pianoRangeLabel(W, scroll) {
  const [lo, hi] = pianoVisibleRange(W, scroll);
  return pianoWhiteName(lo) + " – " + pianoWhiteName(hi);
}
// which lit pitches lie off-screen: {left: [p…], right: [p…]} (nearest first)
export function pianoOffscreen(pitches, W, H, scroll) {
  const g = pianoGeom(W, H, scroll);
  const left = [], right = [];
  for (const p of pitches) {
    if (p < PIANO_LO || p > PIANO_HI) continue;
    const x = g.keyX(p);
    if (x + g.keyW(p) <= 0) left.push(p); else if (x >= W) right.push(p);
  }
  left.sort((a, b) => b - a); right.sort((a, b) => a - b);
  return {left, right};
}
