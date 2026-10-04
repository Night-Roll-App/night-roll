// src/theory/harmony/roman.js — roman numerals read FROM the user's own
// declarations: a declared key (key: annotation) and the user's own chord
// bands. Nothing here looks at raw notes to guess a key or name a chord —
// Learning mode is the law (CLAUDE.md): the key and the chords are his
// findings; this turns the two he has already written down into a numeral.
// Pure (layer 0): no S, no DOM, and nothing from key.js (it imports state.js)
// — the key-name helpers come from chords.js. docs/theory-harmony.md says where each
// function would be wired in and the Normal-only gate that must guard it.
import { LETTERS, LETTER_PC, MAJ_STEP, MIN_STEP, CHORD_TEMPLATES, parseChordSym, chordQualParse, spellPc, tonicPcOfName, modeOfName, MODE_OFFSET } from "../chords.js";

export const HM_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
export const HM_ACC = {"-2": "𝄫", "-1": "♭", "0": "", "1": "♯", "2": "𝄪"};
// semitone offsets of a chord's named members (the slash bass picks the figure)
export const HM_FIGURES = {triad: {third: "6", fifth: "6/4"}, seventh: {third: "6/5", fifth: "4/3", seventh: "4/2"}};
// numeral spelling per label suffix (the chord widget's vocabulary, CHORD_TEMPLATES)
export const HM_QUAL_TEXT = {
  "": ["U", ""], m: ["L", ""], dim: ["L", "°"], aug: ["U", "+"],
  "7": ["U", "7"], maj7: ["U", "maj7"], m7: ["L", "7"], m7b5: ["L", "ø7"], dim7: ["L", "°7"],
  "6": ["U", "(add6)"], m6: ["L", "(add6)"], sus4: ["U", "sus4"], sus2: ["U", "sus2"],
  "7b9": ["U", "7♭9"], "5": ["U", "(no 3rd)"], "9": ["U", "9"], m9: ["L", "9"], maj9: ["U", "maj9"], add9: ["U", "(add9)"],
};
export const HM_EXT_IV = {"6": 9, "7": 10, maj7: 11, "9": 2, maj9: 11, "11": 5, maj11: 11, "13": 9, maj13: 11,
                          add9: 2, add11: 5, add13: 9, b5: 6, "#5": 8, b9: 1, "#9": 3, "#11": 6, b13: 8};
export const HM_AUG6 = [["It+6", [8, 0, 6]], ["Fr+6", [8, 0, 2, 6]], ["Ger+6", [8, 0, 3, 6]]];

export function hmBQ(grid, tick) { // "bar.beat" from a tick, the query tools' format
  const bar = Math.floor(tick / grid.barTicks) + 1;
  const beat = Math.round(((tick % grid.barTicks) / grid.beatTicks + 1) * 100) / 100;
  return bar + "." + beat;
}
export function hmPitchName(p, sf) { return spellPc(((p % 12) + 12) % 12, sf) + (Math.floor(p / 12) - 1); }

// ---- declared keys and chord bands, from resolved annotations ------------
// `notes` is the resolved rollnotes list (S.rollnotes in the app, doc.rollnotes
// from tools/query-lib.mjs): .start/.end ticks, .keydir (sf), .chord, .text.
// A key with no `to` (b2) governs until the next one: `end` is null for it —
// read b2, not .end, because the lane layout gives every point annotation
// a drawn span in .end (S.keyRegions in session/song.js reads b2 the same way).
export function hmKeyRegionsFromNotes(notes) {
  return notes.filter(n => n.keydir !== undefined && n.keydir !== null && /^key:/i.test(n.text))
    .map(n => ({start: n.start, end: n.b2 && n.end !== undefined ? n.end : null, sf: n.keydir, name: n.text.replace(/^key:\s*/i, "").trim()}))
    .sort((a, b) => a.start - b.start);
}
export function hmBandsFromNotes(notes) {
  return notes.filter(n => n.chord && n.b2 && n.end !== null && n.end !== undefined && n.end > n.start)
    .map(n => ({start: n.start, end: n.end, text: n.text, note: n.cnote || n.note || undefined}))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
export function hmKeyAt(keys, tick) { // same precedence as model/song.js sfDeclaredAtRaw: a ranged region beats an open one, latest start wins
  let ranged = null, open = null;
  for (const r of keys) {
    if (r.start > tick) continue;
    if (r.end !== null && r.end !== undefined) { if (tick < r.end && (!ranged || r.start > ranged.start)) ranged = r; }
    else if (!open || r.start > open.start) open = r;
  }
  return ranged || open || null;
}

// ---- key context ----------------------------------------------------------
// {name, sf, tonicPc, tonicLetter, mode, scale (7 pcs, degree order),
//  diatonic (Set: the scale, plus the leading tone in minor), ref (the
//  degree reference: MIN_STEP in minor, MAJ_STEP otherwise — so minor reads
//  VI/VII and a mode reads against its parallel major: ♭VII in mixolydian)}
export function hmKeyContext(region) {
  if (!region || !region.name) return null;
  const tonicPc = tonicPcOfName(region.name);
  if (tonicPc === null) return null;
  const mode = modeOfName(region.name);
  const relMajor = ((tonicPc - (MODE_OFFSET[mode] || 0)) % 12 + 12) % 12;
  const scale = MAJ_STEP.map(x => (x + relMajor) % 12).sort((a, b) => ((a - tonicPc + 12) % 12) - ((b - tonicPc + 12) % 12));
  const diatonic = new Set(scale);
  if (mode === "minor" || mode === "aeolian") diatonic.add((tonicPc + 11) % 12); // the raised leading tone: V and vii° count as diatonic in minor
  return {name: region.name, sf: region.sf, tonicPc, tonicLetter: region.name[0].toUpperCase(), mode,
          scale, diatonic, ref: mode === "minor" || mode === "aeolian" ? MIN_STEP : MAJ_STEP};
}
export function hmParallel(key) { // the parallel mode's pc set (major ↔ minor; a mode gets both)
  const out = new Set();
  const add = steps => steps.forEach(x => out.add((x + key.tonicPc) % 12));
  if (key.mode === "major" || key.mode === "ionian") { add(MIN_STEP); out.add((key.tonicPc + 11) % 12); }
  else if (key.mode === "minor" || key.mode === "aeolian") add(MAJ_STEP);
  else { add(MAJ_STEP); add(MIN_STEP); }
  return out;
}
// chromatic degrees are flats of the degree above (♭2̂ ♭3̂ ♭6̂ ♭7̂) except the
// raised ones theory names as sharps: ♯4̂ in either mode; in minor also ♯3̂
// (Picardy), ♯6̂ and ♯7̂ (melodic/harmonic minor)
export const HM_SHARP_FIRST = {major: [6], minor: [4, 6, 9, 11]};
export function hmDegreeOfPc(key, pc) { // {degree 1..7, acc} — the nearest reference degree; a diatonic pc is exact
  const rel = ((pc - key.tonicPc) % 12 + 12) % 12;
  for (let d = 0; d < 7; d++) if (key.ref[d] === rel) return {degree: d + 1, acc: 0};
  const sharp = () => { for (let d = 0; d < 7; d++) if ((key.ref[d] + 1) % 12 === rel) return {degree: d + 1, acc: 1}; return null; };
  const flat = () => { for (let d = 0; d < 7; d++) if ((key.ref[d] + 11) % 12 === rel) return {degree: d + 1, acc: -1}; return null; };
  const sharpFirst = HM_SHARP_FIRST[key.ref === MIN_STEP ? "minor" : "major"].includes(rel);
  return (sharpFirst ? sharp() || flat() : flat() || sharp()) || {degree: 1, acc: rel};
}
export function hmScaleDegree(key, p) { // a pitch's scale degree in this key: {degree, acc, text: "1̂" / "♭7̂"}, built from pitch class
  const d = hmDegreeOfPc(key, ((p % 12) + 12) % 12);
  return {degree: d.degree, acc: d.acc, text: (HM_ACC[String(d.acc)] || "") + d.degree + "̂"};
}
export function hmDiatonicTriad(key, degree) { // the triad this key builds on a degree: {rootPc, quality: maj|m|dim|aug}
  const root = key.scale[degree - 1], third = key.scale[(degree + 1) % 7], fifth = key.scale[(degree + 3) % 7];
  const t3 = (third - root + 12) % 12, t5 = (fifth - root + 12) % 12;
  const quality = t3 === 4 ? (t5 === 8 ? "aug" : "maj") : t5 === 6 ? "dim" : "m";
  return {rootPc: root, quality};
}

// ---- the user's chord label -------------------------------------------------
// "Dm7/C" -> {rootPc, rootLetter, bassPc, tones (pcs), rel (intervals from
// the root), suffix, caseHint U|L, qualText, seventh (bool)} or null when the
// label is not a chord symbol (free text in a band stays free text).
export function hmChordFromLabel(label) {
  const m = parseChordSym(label);
  if (!m) return null;
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const rootPc = ((LETTER_PC[m[1]] + acc) % 12 + 12) % 12;
  const full = m[3] || "";
  const susM = full.match(/sus([24])/); // "G7sus4": the sus replaces the third of whatever the rest says
  const suffix = full.replace(/sus[24]/, "");
  let rel = null, caseHint = "U", qualText = "";
  const hit = CHORD_TEMPLATES.find(([suf]) => suf === suffix);
  if (hit) { rel = [...hit[1]]; [caseHint, qualText] = HM_QUAL_TEXT[suffix]; }
  else {
    const q = chordQualParse(suffix);
    if (!q) return null;
    rel = q.base === "m" ? [0, 3, 7] : q.base === "dim" ? [0, 3, 6] : q.base === "aug" ? [0, 4, 8]
        : q.base === "sus2" ? [0, 2, 7] : q.base === "sus4" ? [0, 5, 7] : q.base === "5" ? [0, 7] : [0, 4, 7];
    caseHint = q.base === "m" || q.base === "dim" ? "L" : "U";
    const sevenths = q.exts.filter(x => /^(maj)?(7|9|11|13)$/.test(x));
    const top = sevenths.length ? sevenths[sevenths.length - 1] : null;
    const hasMaj = sevenths.some(x => x.startsWith("maj"));
    for (const x of q.exts) {
      if (x in HM_EXT_IV) { // a 9/11/13 implies the (minor) seventh under it
        if (/^(9|11|13)$/.test(x) && !rel.includes(10) && !hasMaj) rel.push(10);
        if (/^maj(9|11|13)$/.test(x) && !rel.includes(11)) rel.push(11);
        if (!rel.includes(HM_EXT_IV[x] % 12)) rel.push(HM_EXT_IV[x] % 12);
      }
    }
    if (q.base === "dim" && rel.includes(10)) qualText = "ø" + (top || "7");
    else qualText = (q.base === "dim" ? "°" : q.base === "aug" ? "+" : q.base.startsWith("sus") ? q.base : "") +
                    (top ? top : "") + q.exts.filter(x => !sevenths.includes(x)).map(x => "(" + x + ")").join("");
  }
  if (susM) { rel = rel.filter(x => x !== 3 && x !== 4).concat(susM[1] === "4" ? [5] : [2]).sort((a, b) => a - b); caseHint = "U"; qualText += "sus" + susM[1]; }
  let bassPc = rootPc;
  if (m[4]) {
    const bm = m[4].match(/^([A-G])([#b]?)/);
    if (bm) bassPc = ((LETTER_PC[bm[1]] + (bm[2] === "#" ? 1 : bm[2] === "b" ? -1 : 0)) % 12 + 12) % 12;
  }
  const seventh = rel.includes(10) || rel.includes(11) || (rel.includes(9) && rel.includes(6) && rel.includes(3)); // dim7's 9 is a seventh
  return {label, rootPc, rootLetter: m[1], bassPc, rel, tones: rel.map(x => (x + rootPc) % 12), suffix: full, caseHint, qualText, seventh};
}
export function hmFigures(chord) { // inversion figures from the bass; "" in root position; bassOutside when the bass is no chord member
  const iv = (chord.bassPc - chord.rootPc + 12) % 12;
  if (iv === 0) return {figures: "", bassOutside: false};
  if (!chord.rel.includes(iv)) return {figures: "", bassOutside: true};
  const member = iv === 3 || iv === 4 ? "third" : iv === 6 || iv === 7 || iv === 8 ? "fifth" : (iv === 10 || iv === 11 || (iv === 9 && chord.seventh)) ? "seventh" : "other";
  if (member === "other") return {figures: "", bassOutside: false}; // a sus tone or an added sixth in the bass: inverted, but no standard figure
  const table = chord.seventh ? HM_FIGURES.seventh : HM_FIGURES.triad;
  return {figures: table[member] || "", bassOutside: false};
}
export function hmNumeralText(degree, acc, caseHint, qualText) {
  const base = HM_ROMAN[degree - 1];
  return (HM_ACC[String(acc)] || "") + (caseHint === "L" ? base.toLowerCase() : base) + qualText;
}
export function hmTargetNumeral(key, targetPc) { // a secondary function's target: a diatonic major/minor triad that is not the tonic, else null
  if (targetPc === key.tonicPc) return null;
  const d = key.scale.indexOf(targetPc);
  if (d < 0) return null;
  const tri = hmDiatonicTriad(key, d + 1);
  if (tri.quality === "dim" || tri.quality === "aug") return null;
  return hmNumeralText(d + 1, 0, tri.quality === "m" ? "L" : "U", "");
}

// ---- one chord in one key ------------------------------------------------------
// -> {numeral, base, figures, bassOutside, secondary, chromatic, diatonic,
//     degree, acc, rootPc, bassPc, tones, label, enharmonic?}
//  chromatic: null, or {kind, detail} with kind one of
//  "secondary dominant" | "secondary leading-tone" | "neapolitan" |
//  "augmented sixth" | "mode mixture" | "chromatic mediant" | "chromatic"
export function hmRomanNumeral(chord, key) {
  if (!chord || !key) return null;
  const {figures, bassOutside} = hmFigures(chord);
  const letterDeg = ((LETTERS.indexOf(chord.rootLetter) - LETTERS.indexOf(key.tonicLetter)) % 7 + 7) % 7;
  let acc = ((chord.rootPc - (key.tonicPc + key.ref[letterDeg])) % 12 + 12) % 12;
  if (acc > 6) acc -= 12;
  let degree = letterDeg + 1;
  if (Math.abs(acc) > 2) ({degree, acc} = hmDegreeOfPc(key, chord.rootPc)); // a spelling three steps off its degree: read by pitch class instead
  if (key.ref === MIN_STEP && degree === 7 && acc === 1) acc = 0; // minor's raised leading tone is plain vii°, not ♯vii°
  const diatonic = chord.tones.every(pc => key.diatonic.has(pc));
  const out = {label: chord.label, numeral: "", base: "", figures, bassOutside: bassOutside ? spellPc(chord.bassPc, key.sf) : null,
               secondary: null, chromatic: null, diatonic, degree, acc, rootPc: chord.rootPc, bassPc: chord.bassPc, tones: chord.tones};
  const isMajorish = chord.rel.includes(4) && !chord.rel.includes(8) && !chord.rel.includes(11); // major triad / dominant family
  const isDimish = chord.rel.includes(3) && chord.rel.includes(6);
  const dim7 = isDimish && chord.rel.includes(9);
  let numeralBase = null;
  if (!diatonic) {
    if (isMajorish && (chord.rootPc !== key.tonicPc || chord.seventh)) { // a major TRIAD on the tonic is the tonic (Picardy); its seventh is what makes it V7/IV
      const target = hmTargetNumeral(key, (chord.rootPc + 5) % 12);
      if (target) { out.secondary = target; out.chromatic = {kind: "secondary dominant", detail: "V" + chord.qualText + " of " + target}; numeralBase = "V" + chord.qualText; }
    }
    if (!out.chromatic && isDimish) {
      // a dim7 is symmetric: the user's spelling tries first, then its three
      // enharmonic roots, preferring the key's own vii°7 over a secondary
      const roots = dim7 ? [0, 3, 6, 9].map(x => (chord.rootPc + x) % 12) : [chord.rootPc];
      const ltRoot = (key.tonicPc + 11) % 12;
      if (dim7 && roots.includes(ltRoot)) { // the key's own vii°7 (its ♭6̂ is the one borrowed tone), however the user spelled it
        if (chord.rootPc !== ltRoot) out.enharmonic = "as " + spellPc(ltRoot, key.sf) + "dim7";
        numeralBase = hmNumeralText(7, 0, "L", "°7");
        out.chromatic = {kind: "mode mixture", detail: "vii°7 — its ♭6̂ comes from the parallel minor"};
      } else for (const r of roots) {
        const target = hmTargetNumeral(key, (r + 1) % 12);
        if (!target) continue;
        out.secondary = target;
        out.chromatic = {kind: "secondary leading-tone", detail: "vii" + (chord.rel.includes(10) ? "ø7" : dim7 ? "°7" : "°") + " of " + target};
        numeralBase = "vii" + (chord.rel.includes(10) ? "ø7" : dim7 ? "°7" : "°");
        if (r !== chord.rootPc) out.enharmonic = "as " + spellPc(r, key.sf) + "dim7";
        break;
      }
    }
    if (!out.chromatic) {
      const relSet = new Set(chord.tones.map(pc => (pc - key.tonicPc + 12) % 12));
      const aug6 = HM_AUG6.find(([, set]) => set.length === relSet.size && set.every(x => relSet.has(x)));
      if (aug6) { out.chromatic = {kind: "augmented sixth", detail: aug6[0] + " (spelled " + chord.label + ")"}; numeralBase = aug6[0]; }
    }
    if (!out.chromatic && isMajorish && !chord.seventh && (chord.rootPc - key.tonicPc + 12) % 12 === 1) { out.chromatic = {kind: "neapolitan", detail: "♭II" + (figures === "6" ? " in first inversion, the usual position" : "")}; }
    if (!out.chromatic) {
      const par = hmParallel(key);
      if (chord.tones.every(pc => par.has(pc))) out.chromatic = {kind: "mode mixture", detail: "borrowed from the parallel " + (key.mode === "major" || key.mode === "ionian" ? "minor" : key.mode === "minor" || key.mode === "aeolian" ? "major" : "major/minor") + (chord.rootPc === key.tonicPc && isMajorish && !chord.seventh && key.ref === MIN_STEP ? " — the tonic with a raised third (a Picardy third if it closes; V/iv if it moves to iv)" : "")};
      else if ((isMajorish || (chord.rel.includes(3) && chord.rel.includes(7))) && [3, 4, 8, 9].includes((chord.rootPc - key.tonicPc + 12) % 12)) out.chromatic = {kind: "chromatic mediant", detail: "a third from the tonic, outside the key"};
      else out.chromatic = {kind: "chromatic", detail: "outside the key (" + chord.tones.filter(pc => !key.diatonic.has(pc)).map(pc => spellPc(pc, key.sf)).join(" ") + " not in " + key.name + ")"};
    }
  }
  out.base = numeralBase || hmNumeralText(degree, acc, chord.caseHint, chord.qualText);
  let shown = out.base;
  if (figures && chord.seventh && /7$/.test(shown)) shown = shown.replace(/7$/, ""); // an inverted seventh chord carries its figures instead of the 7: V6/5, not V76/5
  out.numeral = shown + (figures ? figures : "") + (out.secondary ? "/" + out.secondary : "") + (out.bassOutside ? " (over " + out.bassOutside + ")" : "");
  return out;
}

// ---- every band -------------------------------------------------------------------
// bands [{start, end, text}], keys [{start, end|null, sf, name}], grid
// {barTicks, beatTicks} -> rows, one per band, in time order. A band with no
// declared key governing it, or a label that isn't a chord symbol, is kept
// with numeral null and a reason — the count of those is a fact worth
// reporting, never silently dropped.
export function hmRomanNumerals(bands, keys, grid) {
  return bands.map(b => {
    const region = hmKeyAt(keys, b.start);
    const key = hmKeyContext(region);
    const chord = hmChordFromLabel(b.text);
    const row = {start: b.start, end: b.end, at: hmBQ(grid, b.start), to: hmBQ(grid, b.end), label: b.text, key: key ? key.name : null, numeral: null, reason: null};
    if (!key) { row.reason = "no declared key governs this band"; return row; }
    if (!chord) { row.reason = "not a chord symbol"; return row; }
    return Object.assign(row, hmRomanNumeral(chord, key));
  });
}
export function hmChromaticSummary(rows) { // the rows hmRomanNumerals returned -> only the chords outside their key, grouped
  const items = rows.filter(r => r.numeral && r.chromatic);
  const kinds = {};
  for (const r of items) kinds[r.chromatic.kind] = (kinds[r.chromatic.kind] || 0) + 1;
  return {total: items.length, of: rows.filter(r => r.numeral).length, kinds,
          items: items.map(r => ({at: r.at, to: r.to, label: r.label, key: r.key, numeral: r.numeral, kind: r.chromatic.kind, detail: r.chromatic.detail, enharmonic: r.enharmonic}))};
}
