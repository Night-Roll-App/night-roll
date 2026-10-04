// src/theory/harmony/modulation.js — where the user's declared keys change,
// which of his chord bands around the change could be the pivot: a chord
// diatonic to BOTH keys, read as a numeral in each. Strictly from declared
// keys and declared bands — a song with one key: annotation has no
// modulations here, whatever the notes do. Pure (layer 0).
import { hmBQ, hmKeyContext, hmChordFromLabel, hmRomanNumeral } from "./roman.js";
import { spellPc } from "../chords.js";

export const HM_PIVOT_BARS = 2; // bands this many bars either side of the change are pivot candidates

export function hmKeyRelation(from, to) { // how two keys relate, by tonic interval and mode
  const iv = ((to.tonicPc - from.tonicPc) % 12 + 12) % 12;
  const fromMinor = from.mode === "minor" || from.mode === "aeolian", toMinor = to.mode === "minor" || to.mode === "aeolian";
  const common = from.scale.filter(pc => to.scale.includes(pc)).length;
  let name;
  if (iv === 0 && from.mode === to.mode) name = "same key";
  else if (iv === 0) name = "parallel " + to.mode;
  else if (iv === 9 && !fromMinor && toMinor) name = "relative minor";
  else if (iv === 3 && fromMinor && !toMinor) name = "relative major";
  else if (iv === 7) name = "to the dominant";
  else if (iv === 5) name = "to the subdominant";
  else if (iv === 2 || iv === 10) name = "a whole step " + (iv === 2 ? "up" : "down");
  else if (iv === 1 || iv === 11) name = "a half step " + (iv === 1 ? "up" : "down");
  else if (iv === 3 || iv === 4 || iv === 8 || iv === 9) name = "a third " + (iv < 6 ? "up" : "down") + " (mediant)";
  else name = "a tritone away";
  return {name, interval: iv, commonTones: common, closelyRelated: common >= 6};
}

// keys [{start, end|null, sf, name}] in time order, bands [{start,end,text}]
export function hmModulations(keys, bands, grid, opts = {}) {
  const win = (opts.pivotBars || HM_PIVOT_BARS) * grid.barTicks;
  const out = [];
  const sorted = [...keys].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const from = hmKeyContext(sorted[i - 1]), to = hmKeyContext(sorted[i]);
    if (!from || !to) continue;
    if (from.name === to.name) continue; // the same key re-declared is not a modulation
    const at = sorted[i].start;
    const near = bands.filter(b => b.start >= at - win && b.start < at + win);
    const pivots = [], firstForeign = [];
    for (const b of near) {
      const chord = hmChordFromLabel(b.text);
      if (!chord) continue;
      const inFrom = chord.tones.every(pc => from.diatonic.has(pc)), inTo = chord.tones.every(pc => to.diatonic.has(pc));
      const row = {at: hmBQ(grid, b.start), label: b.text, inFrom: hmRomanNumeral(chord, from).numeral, inTo: hmRomanNumeral(chord, to).numeral, before: b.start < at};
      if (inFrom && inTo) pivots.push(row);
      else if (!inFrom && inTo && b.start >= at - win) firstForeign.push(row);
    }
    out.push({at: hmBQ(grid, at), from: from.name, to: to.name, relation: hmKeyRelation(from, to),
              newTones: to.scale.filter(pc => !from.diatonic.has(pc)).map(pc => spellPc(pc, to.sf)),
              pivots, signal: firstForeign.length ? firstForeign[0] : null,
              reading: pivots.length ? "pivot-chord candidates: a chord diatonic to both keys" : "no common chord in the window: a direct (or chromatic) modulation, or the pivot sits outside ±" + (opts.pivotBars || HM_PIVOT_BARS) + " bars"});
  }
  return out;
}
