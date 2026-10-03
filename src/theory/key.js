import { S } from "../state.js";

export const TONIC_SPELL = [["C"], ["C#", "Db"], ["D"], ["D#", "Eb"], ["E"], ["F"],
                     ["F#", "Gb"], ["G"], ["G#", "Ab"], ["A"], ["A#", "Bb"], ["B"]];
export const FIFTHS_POS = {F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5};
export const MODE_FIFTHS = {major: 0, ionian: 0, dorian: 2, phrygian: 4, lydian: -1,
                     mixolydian: 1, minor: 3, aeolian: 3, locrian: 5};
export function trueSf(spelling, mode) { // real signature for this exact spelling (no enharmonic folding)
  const pos = FIFTHS_POS[spelling[0]] + (spelling[1] === "#" ? 7 : spelling[1] === "b" ? -7 : 0);
  const sf = pos - MODE_FIFTHS[mode];
  return Math.abs(sf) <= 6 ? sf : null; // beyond 6 accidentals the enharmonic twin always wins
}
export function keyNameFor(pc, mode) { // pick the spelling that lands on a real signature
  const suffix = mode === "major" ? "" : mode === "minor" ? "m" : " " + mode;
  let best = null;
  for (const sp of TONIC_SPELL[pc]) {
    const sf = trueSf(sp, mode);
    if (sf !== null && (!best || Math.abs(sf) < Math.abs(best.sf))) best = {name: sp + suffix, sf, tonic: sp};
  }
  return best;
}
export function pearsonCorr(a, b) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const xa = a[i] - ma, xb = b[i] - mb; num += xa * xb; da += xa * xa; db += xb * xb; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
// ---- checkKeyVsFile / checkMeterVsFile (docs/declared-vs-learner-spec.md
// C6) — pure. HIS declared answer only (never the estimate, never run in
// Learning: CLAUDE.md, "Learning mode is the law") against the file's OWN
// label (song.source — see parseMidi). states: match | differs |
// partial-match | noanswer | nofile. A tonic-only partial (keypartial)
// compares tonic pitch class only, never mode (item C6). No source, or a
// source with an empty list (no 0x58/0x59 in the file) is "nofile" — a game
// capture and a song made here always land here, since they carry no source
// at all.
export function fileKeyAt(tick) { // the file's own declared key at a tick, or null
  if (!S.song || !S.song.source || !S.song.source.keysigs || !S.song.source.keysigs.length) return null;
  let cur = S.song.source.keysigs[0];
  for (const k of S.song.source.keysigs) { if (k.tick <= tick) cur = k; else break; }
  const pcMajor = ((7 * cur.sf) % 12 + 12) % 12;
  const pc = cur.minor ? (((pcMajor - 3) % 12) + 12) % 12 : pcMajor;
  const full = keyNameFor(pc, cur.minor ? "minor" : "major");
  return {pc, minor: cur.minor, sf: full ? full.sf : cur.sf, name: full ? full.name : null};
}
export function checkMeterVsFile() {
  if (!S.song || !S.song.source || !S.song.source.timesigs || !S.song.source.timesigs.length) return {state: "nofile"};
  const list = S.song.source.timesigs;
  const file = {num: list[0].num, den: list[0].den};
  if (!S.declaredTs) return {state: "noanswer", file}; // Normal still states the file's value here — see runMeterCheck
  const same = ts => ts.num === S.declaredTs[0] && ts.den === S.declaredTs[1];
  if (list.every(same)) return {state: "match", file};
  if (list.some(same)) return {state: "partial-match", file};
  return {state: "differs", file};
}

// modes: semitones from the relative major up to the tonic — the signature
// engraved is always the relative major's; the stored name keeps tonic+mode
export const MODE_OFFSET = {major: 0, ionian: 0, dorian: 2, phrygian: 4, lydian: 5,
                     mixolydian: 7, minor: 9, aeolian: 9, locrian: 11};
// Each natural letter's own circle-of-fifths position (F..B, no accidental);
// an accidental shifts it by a further ±7 (one "lap" of fifths per semitone
// of chromatic alteration — e.g. Eb = E's +4 minus the flat's 7 = -3).
export const LETTER_SF = {F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5};
// Modal brightness, in fifths, relative to the SAME tonic held major (2026-10
// fix — pitch-class math here lost the flat/sharp spelling the user typed,
// e.g. keyNameToSf("Ebm") came out sf=+6 (F#, sharps) instead of sf=-6 (Gb,
// flats): computing the relative major's PITCH CLASS and re-deriving sf from
// that pc alone is ambiguous at the F#/Gb tritone and silently prefers the
// sharp spelling. Working entirely in fifths-space from the typed letter
// keeps the sign the user intended for every key, not just the lucky ones).
export const MODE_SF_OFFSET = {lydian: 1, major: 0, ionian: 0, mixolydian: -1,
                        dorian: -2, minor: -3, aeolian: -3, phrygian: -4, locrian: -5};
export function keyNameToSf(name) {
  let mode = "major", base = name;
  const m = name.match(/^(\S+)\s+([a-z]+)$/i); // "D dorian" style
  if (m && m[2].toLowerCase() in MODE_OFFSET) { base = m[1]; mode = m[2].toLowerCase(); }
  else if (/m$/.test(name) && name.length > 1) { base = name.slice(0, -1); mode = "minor"; }
  const L = base[0] ? base[0].toUpperCase() : "";
  if (!(L in LETTER_SF)) return null;
  const acc = base[1] === "#" ? 1 : base[1] === "b" ? -1 : 0;
  let sf = LETTER_SF[L] + acc * 7 + MODE_SF_OFFSET[mode];
  while (sf > 7) sf -= 12;  // fold only extreme enharmonics (SF_MAJOR runs -7..7)
  while (sf < -7) sf += 12;
  return sf;
}
