// src/theory/harmony/cadence.js — cadences from the numeral rows (roman.js)
// and phrase ends. A cadence is a VERDICT about two adjacent chords the
// user has already written down, in a key he has declared: nothing here
// reads a key or a chord out of the notes. The notes are consulted for one
// fact only — the top sounding pitch at the goal chord — because PAC vs
// IAC turns on the soprano's scale degree. Pure (layer 0).
import { hmBQ, hmKeyAt, hmKeyContext, hmScaleDegree, hmPitchName } from "./roman.js";

export const HM_PHRASE_BARS = 4; // default phrase length when the user has marked no sections
export const HM_TONIC = /^[iI](?![iIvV])/; // I / i / Imaj7 / i7 — never ii or IV
export const HM_DOMINANT = /^V(?!I)/; // V / V7 / V9 — never VI/vi
export const HM_SUBDOMINANT = /^(IV|iv)(?![a-zA-Z])/;
export const HM_SUBMEDIANT = /^(♭?VI|♭?vi)(?![iI])/;

// phrase boundaries in ticks: every section edge, the song's end, and every
// `phraseBars` bars from bar 1 (a 4-bar default — stated in each cadence's
// `where`, so the verdict carries its own assumption)
export function hmPhraseEnds(grid, endTick, sections, phraseBars) {
  const bars = phraseBars || HM_PHRASE_BARS;
  const out = new Map(); // tick -> label
  for (let t = bars * grid.barTicks; t <= endTick; t += bars * grid.barTicks) out.set(t, "phrase end (" + bars + "-bar phrases)");
  if (endTick > 0) out.set(endTick, "song end");
  for (const s of sections || []) { // the user's own section edges name a boundary best
    if (s.start > 0) out.set(s.start, "section starts: " + s.text);
    if (s.end !== null && s.end !== undefined) out.set(s.end, "section ends: " + s.text);
  }
  return out;
}
export function hmTopPitchAt(tracks, t0, t1) { // the top voice at a chord: the highest pitch sounding at t0 or starting inside [t0, t1) — its first beat, so an arpeggiated chord reads its top, not its bass
  let top = null;
  for (const tr of tracks) for (const n of tr.notes) {
    if (n.gone) continue;
    if ((n.t <= t0 && n.t + n.d > t0) || (n.t >= t0 && n.t < t1)) { if (top === null || n.p > top) top = n.p; }
  }
  return top;
}
export function hmArrivalTicks(rows, grid) { // "held" means longer than this song's usual band: twice the median band, at least a bar
  const lens = rows.map(r => r.end - r.start).sort((a, b) => a - b);
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : grid.barTicks;
  return Math.max(grid.barTicks, 2 * median);
}

// rows: hmRomanNumerals' output; tracks: [{name, notes:[{t,d,p}]}] (drums
// already excluded by the caller); sections: [{start, end, text}];
// opts.phraseBars; opts.all lists mid-phrase dominant→tonic motions too.
export function hmCadences(rows, keys, tracks, grid, endTick, sections, opts = {}) {
  const ends = hmPhraseEnds(grid, endTick, sections, opts.phraseBars);
  const out = [];
  const rowsOk = rows.filter(r => r.numeral);
  const arrival = hmArrivalTicks(rowsOk, grid);
  for (let i = 1; i < rowsOk.length; i++) {
    const a = rowsOk[i - 1], b = rowsOk[i];
    if (a.key !== b.key) continue; // a key change between them is modulation.js's business
    if (b.start - a.end > grid.beatTicks) continue; // not adjacent: a gap longer than a beat between the bands
    const region = hmKeyAt(keys, b.start), key = hmKeyContext(region);
    if (!key) continue;
    const aBase = a.base, bBase = b.base;
    const aRoot = !a.figures && !a.bassOutside, bRoot = !b.figures && !b.bassOutside;
    let type = null, detail = "";
    const top = hmTopPitchAt(tracks, b.start, Math.min(b.end, b.start + grid.beatTicks));
    const sop = top === null ? null : hmScaleDegree(key, top);
    if (HM_DOMINANT.test(aBase) && !a.secondary && HM_TONIC.test(bBase)) {
      if (aRoot && bRoot && sop && sop.degree === 1 && sop.acc === 0) { type = "PAC"; detail = "V→I, both in root position, soprano on 1̂"; }
      else { type = "IAC"; detail = "V→I" + (!aRoot || !bRoot ? ", inverted" : "") + (sop && !(sop.degree === 1 && sop.acc === 0) ? ", soprano on " + sop.text : ""); }
    } else if (/^vii°/.test(aBase) && !a.secondary && HM_TONIC.test(bBase)) { type = "IAC"; detail = "vii°→I (leading-tone cadence)"; }
    else if (HM_SUBDOMINANT.test(aBase) && !a.secondary && HM_TONIC.test(bBase)) { type = "PC"; detail = "IV→I (plagal)"; }
    else if (HM_DOMINANT.test(aBase) && !a.secondary && HM_SUBMEDIANT.test(bBase)) { type = "DC"; detail = "V→" + bBase + " (deceptive)"; }
    else if (HM_DOMINANT.test(bBase) && !b.secondary && !(HM_DOMINANT.test(aBase) && !a.secondary)) { // V→V (G7sus4→G7) is one dominant, not a cadence
      type = "HC"; detail = aBase + "→V (half)";
      if (HM_SUBDOMINANT.test(aBase) && a.figures === "6" && (key.mode === "minor" || key.mode === "aeolian")) detail = "iv6→V (Phrygian half)";
    }
    if (!type) continue;
    // where it lands: the goal chord holds a phrase boundary's last beat, or is
    // held a full bar (an arrival); anything else is mid-phrase
    let where = null;
    for (const [t, label] of ends) if (b.start < t && t <= b.end) { where = label + " at " + hmBQ(grid, t); break; }
    if (!where && b.end - b.start >= arrival) where = "arrival (held " + Math.round((b.end - b.start) / grid.beatTicks) + " beats)";
    if (!where && type === "HC") continue; // a passing V mid-phrase is not a half cadence
    if (!where && !opts.all) continue;
    out.push({type, at: hmBQ(grid, b.start), from: {at: a.at, label: a.label, numeral: a.numeral}, to: {at: b.at, label: b.label, numeral: b.numeral},
              key: key.name, soprano: top === null ? null : {pitch: hmPitchName(top, key.sf), degree: sop.text}, detail, where: where || "mid-phrase"});
  }
  return out;
}
