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
