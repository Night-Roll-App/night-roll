// display spelling when NO key has been declared: all sharps, matching the
// captures' neutral spelling — the app never volunteers flats the user
// didn't derive (a mixed table once had Josh chasing a chord on Fb)
export const SHARP_SPELL = (() => {
  const N = [["C",""],["C","#"],["D",""],["D","#"],["E",""],["F",""],["F","#"],["G",""],["G","#"],["A",""],["A","#"],["B",""]];
  const m = {};
  N.forEach(([letter, acc], i) => m[i] = {letter, acc});
  return m;
})();
export const spellMemo = {};
export function spellFor(sf) { return spellMemo[sf] || (spellMemo[sf] = keySpelling(sf)); }
// ---------------------------------------------------------------- lasso / chord id
export function spellPc(pc, sf) {
  const s = sf === null ? SHARP_SPELL[pc] : spellFor(sf)[pc];
  return s.letter + (s.acc || "");
}
export function pitchName(p, sf) { return spellPc(p % 12, sf) + (Math.floor(p / 12) - 1); }
export const CHORD_TEMPLATES = [
  ["", [0,4,7]], ["m", [0,3,7]], ["dim", [0,3,6]], ["aug", [0,4,8]],
  ["7", [0,4,7,10]], ["maj7", [0,4,7,11]], ["m7", [0,3,7,10]],
  ["m7b5", [0,3,6,10]], ["dim7", [0,3,6,9]], ["6", [0,4,7,9]], ["m6", [0,3,7,9]],
  ["sus4", [0,5,7]], ["sus2", [0,2,7]], ["7b9", [0,4,7,10,1]], ["5", [0,7]],
  ["9", [0,4,7,10,2]], ["m9", [0,3,7,10,2]], ["maj9", [0,4,7,11,2]], ["add9", [0,4,7,2]],
];
export function nameChord(pitches, sf) {
  const pcs = [...new Set(pitches.map(p => p % 12))];
  if (pcs.length < 2) return pcs.length ? spellPc(pcs[0], sf) + " (one pitch class)" : "";
  const bassPc = pitches.reduce((a, b) => Math.min(a, b)) % 12;
  let best = null;
  const tryMatch = (allowNo5th) => {
    for (const root of pcs) {
      const rel = new Set(pcs.map(pc => (pc - root + 12) % 12));
      for (const [suffix, tmpl] of CHORD_TEMPLATES) {
        const need = allowNo5th ? tmpl.filter(iv => iv !== 7 || tmpl.length <= 2) : tmpl;
        if (!need.every(iv => rel.has(iv))) continue;
        if (![...rel].every(iv => tmpl.includes(iv))) continue;
        const score = tmpl.length + (root === bassPc ? 0.5 : 0) - (allowNo5th ? 0.4 : 0);
        if (!best || score > best.score) best = {score, root, suffix, no5: allowNo5th && !rel.has(7) && tmpl.includes(7)};
      }
    }
  };
  tryMatch(false);
  if (!best) tryMatch(true);
  if (!best) return "no standard chord match";
  const inv = best.root !== bassPc ? "/" + spellPc(bassPc, sf) : "";
  return spellPc(best.root, sf) + best.suffix + inv + (best.no5 ? " (no 5th)" : "");
}
// TOP clears the triangle handle: high ledger lines were kissing it

export const SF_MAJOR = {0:"C",1:"G",2:"D",3:"A",4:"E",5:"B",6:"F#",7:"C#","-1":"F","-2":"Bb","-3":"Eb","-4":"Ab","-5":"Db","-6":"Gb","-7":"Cb"};
export const LETTERS = "CDEFGAB";
export const LETTER_PC = {C:0, D:2, E:4, F:5, G:7, A:9, B:11};
// modes: semitones from the relative major up to the tonic — the signature
// engraved is always the relative major's; the stored name keeps tonic+mode
export const MODE_OFFSET = {major: 0, ionian: 0, dorian: 2, phrygian: 4, lydian: 5,
                     mixolydian: 7, minor: 9, aeolian: 9, locrian: 11};
export function tonicPcOfName(name) { // "G#m" / "D dorian" / "Bb" -> pc
  const m = (name || "").match(/^([A-G])([#b]?)/);
  return m ? (LETTER_PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12 : null;
}
export function modeOfName(name) {
  const mm = (name || "").match(/\s([a-z]+)$/i);
  if (mm && mm[1].toLowerCase() in MODE_OFFSET) return mm[1].toLowerCase();
  return /m$/.test(name) && name.length > 1 ? "minor" : "major";
}
export function keySpelling(sf) {
  // map each pitch class -> {letter, acc} for this key signature
  const tonicName = SF_MAJOR[sf] || "C";
  const tonicLetter = tonicName[0];
  const tonicPc = (LETTER_PC[tonicLetter] + (tonicName[1] === "#" ? 1 : tonicName[1] === "b" ? -1 : 0) + 12) % 12;
  const steps = [2, 2, 1, 2, 2, 2, 1];
  const map = {};
  let letter = LETTERS.indexOf(tonicLetter), pc = tonicPc;
  for (let dg = 0; dg < 7; dg++) {
    const L = LETTERS[letter % 7];
    const natural = LETTER_PC[L];
    let diff = (pc - natural + 12) % 12;
    if (diff > 6) diff -= 12;
    map[pc] = {letter: L, acc: diff === 0 ? "" : diff === 1 ? "#" : diff === -1 ? "b" : diff === 2 ? "##" : "bb"};
    pc = (pc + steps[dg]) % 12;
    letter++;
  }
  // chromatic degrees: leading-tone-ish get sharps, borrowed-from-minor get flats
  const CHROM = {1: "#", 3: "b", 6: "#", 8: "#", 10: "b"};
  const SHARP = {0:["C",""],1:["C","#"],2:["D",""],3:["D","#"],4:["E",""],5:["F",""],6:["F","#"],7:["G",""],8:["G","#"],9:["A",""],10:["A","#"],11:["B",""]};
  const FLAT  = {0:["C",""],1:["D","b"],2:["D",""],3:["E","b"],4:["E",""],5:["F",""],6:["G","b"],7:["G",""],8:["A","b"],9:["A",""],10:["B","b"],11:["B",""]};
  for (let p = 0; p < 12; p++) {
    if (map[p]) continue;
    const rel = (p - tonicPc + 12) % 12;
    const pick = (CHROM[rel] === "#" ? SHARP : FLAT)[p];
    map[p] = {letter: pick[0], acc: pick[1]};
  }
  return map;
}
export const CHORD_FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
export function chordSym(rootPc, qual) { // flat-preferring: ♭VI in Cm is A♭, not G♯
  return CHORD_FLAT[rootPc] + (qual === "maj" ? "" : qual);
}
// Numeral → chord: major-scale-relative degrees, case = quality, suffix refines
export const NUM_DEG = {I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6};
export const MAJ_STEP = [0, 2, 4, 5, 7, 9, 11];
export const MIN_STEP = [0, 2, 3, 5, 7, 8, 10];
// natural minor: unaltered VI/VII sit a half-step lower
// Numerals read against the major scale unless minorScale: the mood library
// is written major-relative (♭VI, ♭VII), but a typed minor-key progression
// says i–VI–VII–V and means Em C D B (Josh, 2026-09-12). Case still sets
// quality, so V in minor is the major dominant and v the natural one.
export function parseNumeral(tok, minorScale) {
  const m = tok.match(/^([♭♯#b]?)(vii|vi|v|iv|iii|ii|i)(°|dim|maj7|7|6)?$/i);
  if (!m) return null;
  const acc = (m[1] === "♭" || m[1] === "b") ? -1 : m[1] ? 1 : 0;
  const minor = m[2] === m[2].toLowerCase();
  const suf = (m[3] || "").toLowerCase();
  let qual = minor ? "m" : "maj";
  if (suf === "°" || suf === "dim") qual = "dim";
  else if (suf === "maj7") qual = "maj7";
  else if (suf === "7") qual = minor ? "m7" : "7";
  else if (suf === "6") qual = minor ? "m6" : "6";
  const steps = minorScale ? MIN_STEP : MAJ_STEP;
  return {pcOff: (steps[NUM_DEG[m[2].toUpperCase()]] + acc + 12) % 12, qual};
}
// progStr separators: the library's " – ", or whatever a thumb types
// (hyphen, comma, arrow, spaces)
export function splitProgression(progStr) { return progStr.split(/[\s–—\-,→>|]+/).filter(Boolean); }
// chord widget: chips compose the symbol; typing in the box is equally valid
// (chips re-highlight to match). Vocabulary = the lasso chord namer's, so
// annotations and "Chord?" reveals always speak the same language.
// base quality (pick one) + extensions (stack as many as the chord needs):
// Cm7add9 = root C, base m, extensions 7 + add9 (Josh, 2026-08-19)
export const CHORD_BASES = ["maj", "m", "dim", "aug", "sus2", "sus4", "5"];
export const CHORD_EXTS = ["6", "7", "maj7", "9", "maj9", "11", "maj11", "13", "maj13",
                    "add9", "add11", "add13", "b5", "#5", "b9", "#9", "#11", "b13"];
export function chordQualParse(rest) { // "m7add9" -> {base, exts} or null if anything is left over
  let base = "maj";
  for (const b of CHORD_BASES) {
    if (b !== "maj" && rest.startsWith(b) && !rest.startsWith("maj")) { base = b; rest = rest.slice(b.length); break; }
  }
  const exts = [];
  const byLen = [...CHORD_EXTS].sort((a, c) => c.length - a.length);
  outer: while (rest.length) {
    for (const x of byLen) {
      if (rest.startsWith(x) && !exts.includes(x)) { exts.push(x); rest = rest.slice(x.length); continue outer; }
    }
    return null; // unknown token: chips stand down, the typed text stands
  }
  return {base, exts};
}
export function chordQualCompose(base, exts) {
  return (base === "maj" ? "" : base) + CHORD_EXTS.filter(x => exts.includes(x)).join("");
}
// The chord picker's primitives (Josh, Terminal #287): a seventh (pick one),
// tensions, alterations. chordQualParse keeps its {base, exts} shape because
// roman.js and the bassist read it; only the chord widget speaks this layer.
// With a seventh the tension is pick-one and names the chord (7+9 → "9",
// maj7+11 → "maj11"); without one tensions stack as adds, and 6+9 is "69"
// because parseChordSym reads "/" as a slash bass. Half-diminished stays
// "m7b5": ø never appears in a chord symbol.
export const CHORD_SEVENTHS = ["6", "7", "maj7"];
export const CHORD_TENSIONS = ["9", "11", "13"];
export const CHORD_ALTS = ["b5", "#5", "b9", "#9", "#11", "b13"];
const PICK_TOKENS = ["maj13", "maj11", "maj9", "maj7", "add13", "add11", "add9", "sus2", "sus4",
  "#11", "b13", "b5", "#5", "b9", "#9", "13", "11", "9", "7", "6"];
// an alteration needs something to alter: "C" + b5 would read back as a C♭ chord
export function chordAltsAllowed(base, sev) { return !!sev || (base !== null && base !== "maj"); }
export function chordPickParse(rest) { // "m7b5" → {base, sev, tens, alts}; anything the chips can't spell → null
  rest = rest || "";
  let base = "maj";
  for (const b of CHORD_BASES) {
    if (b !== "maj" && rest.startsWith(b) && !rest.startsWith("maj")) { base = b; rest = rest.slice(b.length); break; }
  }
  let sev = "", add = false;
  const tens = [], alts = [];
  const addTen = (t, picked) => { // a seventh's tension is pick-one; adds stack, once each
    if (tens.includes(t) || (picked && tens.length)) return false;
    tens.push(t); return true;
  };
  while (rest.length) {
    const tok = PICK_TOKENS.find(t => rest.startsWith(t));
    if (!tok) return null;
    rest = rest.slice(tok.length);
    if (tok === "6" || tok === "7" || tok === "maj7") { if (sev) return null; sev = tok; }
    else if (tok.startsWith("maj")) { if (sev || !addTen(tok.slice(3), true)) return null; sev = "maj7"; }
    else if (tok.startsWith("add")) { // under a seventh an add keeps its word: "7add9" is not "9" (Josh #289)
      if (sev === "7" || sev === "maj7") { if (add ? !addTen(tok.slice(3), false) : tens.length || !addTen(tok.slice(3), false)) return null; add = true; }
      else if (!addTen(tok.slice(3), false)) return null;
    }
    else if (tok.startsWith("sus")) { if (base !== "maj") return null; base = tok; }
    else if (CHORD_ALTS.includes(tok)) { if (alts.includes(tok)) return null; alts.push(tok); }
    else if (sev === "6") { if (tok !== "9" || !addTen("9", false)) return null; } // "69" only
    else if (sev) { if (!addTen(tok, true)) return null; } // "79" → 9
    else { sev = "7"; addTen(tok, true); } // a bare "9" is a ninth chord: 7 + 9
  }
  tens.sort((a, c) => a - c);
  alts.sort((a, c) => CHORD_ALTS.indexOf(a) - CHORD_ALTS.indexOf(c));
  return {base, sev, tens, alts, add};
}
export function chordPickCompose(base, sev, tens, alts, add) { // base · seventh-or-tension · sus · adds · alterations; add: tensions under a seventh stay "addN"
  const sus = base === "sus2" || base === "sus4";
  const t = [...(tens || [])].sort((a, c) => a - c);
  let core = "", adds = t;
  if ((sev === "7" || sev === "maj7") && add) {
    core = sev;
  } else if (sev === "7" || sev === "maj7") {
    const top = t[t.length - 1];
    core = (sev === "maj7" ? "maj" : "") + (top || "7");
    adds = [];
  } else if (sev === "6") {
    core = t.includes("9") ? "69" : "6";
    adds = t.filter(x => x !== "9");
  }
  const al = chordAltsAllowed(base, sev) ? CHORD_ALTS.filter(x => (alts || []).includes(x)) : [];
  return (base === "maj" || sus ? "" : base) + core + (sus ? base : "") + adds.map(x => "add" + x).join("") + al.join("");
}
export function parseChordSym(sym) {
  return (sym || "").trim().match(/^([A-G])([#b]?)([^/\s]*)(?:\/([A-G][#b]?))?(?:\s+\((.*)\))?$/);
}

export function transposeChordLabel(text, dP) { // "G#m" + 2 → "A#m"; spelling flat-preferred like inserts
  const m = text.match(/^([A-G])([#b♯♭]?)(.*)$/);
  if (!m) return text;
  const pc = (LETTER_PC[m[1]] + (m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0) + 1200 + dP) % 12;
  return CHORD_FLAT[pc] + m[3];
}

// fractional rotation while a finger is spinning the wheel
// Insert-chord (Josh, 2026-08-17): stamp a full chord at the cursor with the
// pencil duration, cursor walks forward — repeated inserts build a progression.
export const CHORD_QUALS = [
  ["maj", [0, 4, 7]], ["m", [0, 3, 7]], ["dim", [0, 3, 6]], ["aug", [0, 4, 8]],
  ["sus2", [0, 2, 7]], ["sus4", [0, 5, 7]], ["6", [0, 4, 7, 9]], ["m6", [0, 3, 7, 9]],
  ["7", [0, 4, 7, 10]], ["maj7", [0, 4, 7, 11]], ["m7", [0, 3, 7, 10]],
  ["m7♭5", [0, 3, 6, 10]], ["dim7", [0, 3, 6, 9]],
];

// A chord band's Roman numeral (Josh, Terminal #228) is HIS entry, stored as
// typed — ASCII b/# like the chord symbols, so "bVII" from a ✱ note and from
// the picker are the same string. Nothing here derives one from the music or
// a key; these only spell, read back and prettify what he entered.
export const ROMAN_DEGREES = ["I", "II", "III", "IV", "V", "VI", "VII"];
export const ROMAN_EXTS = ["7", "maj7", "ø7", "6"];
const ROMAN_DEG_RE = "VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i"; // one case per numeral: "Vii" is not a numeral
const ROMAN_ONE = new RegExp("^([b#♭♯]?)(" + ROMAN_DEG_RE + ")([°ø+]?)(maj7|7|6)?$");
export function romanCompose(sel) { // {acc, deg, qual: maj|min|dim|aug|null, ext} → "bVII", "ii°", "viiø7"; no degree → ""
  if (!sel || !sel.deg) return "";
  const half = sel.ext === "ø7";
  const lower = half || sel.qual === "min" || sel.qual === "dim";
  const q = half ? "" : sel.qual === "dim" ? "°" : sel.qual === "aug" ? "+" : "";
  return (sel.acc || "") + (lower ? sel.deg.toLowerCase() : sel.deg) + q + (sel.ext || "");
}
export function romanParse(str) { // the inverse of romanCompose for what the chips can spell; anything else (V/V, It+6) → null
  const m = String(str || "").trim().match(ROMAN_ONE);
  if (!m) return null;
  if (m[3] === "ø" && m[4] !== "7") return null;
  const acc = m[1] === "♭" ? "b" : m[1] === "♯" ? "#" : m[1];
  const lower = m[2] === m[2].toLowerCase();
  if (m[3] === "+" && lower) return null; // the chips spell augmented upper-case only
  const ext = m[3] === "ø" ? "ø7" : (m[4] || "");
  const qual = m[3] === "ø" ? null : m[3] === "°" ? "dim" : m[3] === "+" ? "aug" : lower ? "min" : "maj";
  return {acc, deg: m[2].toUpperCase(), qual, ext};
}
export function romanPretty(r) { // display only: a b/# in front of a numeral reads as ♭/♯ ("bVII" → "♭VII", "V/bVI" → "V/♭VI")
  return String(r || "").replace(new RegExp("(^|/)([b#])(?=" + ROMAN_DEG_RE + ")", "g"),
    (_, pre, a) => pre + (a === "b" ? "♭" : "♯"));
}
