// quiz/drills.js — generated drills, pure (no DOM, no audio): each generator
// returns a plain description the page renders and tone.js plays, and
// checkAnswer grades a tap. Everything here is GENERIC theory — a random
// interval, chord, key — never a song: Learning mode's rule (CLAUDE.md) is
// that keys, chords and meters in Josh's music are his to find, and this file
// cannot see any music at all. The only app imports are the two pure theory
// modules (docs/plans/2026-10-04-quiz.md, "Allowed imports").
//
// `rnd` is injectable (makeRng(seed)) so tests can draw 500 times and check
// coverage; the page passes Math.random.
import { spellPc, SF_MAJOR, CHORD_QUALS, LETTER_PC, MAJ_STEP, MIN_STEP } from "../src/theory/chords.js";
import { keyNameToSf } from "../src/theory/key.js";

export const MAX_LEVEL = 3;
export const INTERVALS = [
  {semis: 1, short: "m2", name: "minor 2nd"}, {semis: 2, short: "M2", name: "major 2nd"},
  {semis: 3, short: "m3", name: "minor 3rd"}, {semis: 4, short: "M3", name: "major 3rd"},
  {semis: 5, short: "P4", name: "perfect 4th"}, {semis: 6, short: "TT", name: "tritone"},
  {semis: 7, short: "P5", name: "perfect 5th"}, {semis: 8, short: "m6", name: "minor 6th"},
  {semis: 9, short: "M6", name: "major 6th"}, {semis: 10, short: "m7", name: "minor 7th"},
  {semis: 11, short: "M7", name: "major 7th"}, {semis: 12, short: "P8", name: "octave"},
];
// what each level ADDS; a level's working set is the union up to it
export const INTERVAL_LEVELS = [["M2", "M3", "P4", "P5", "P8"], ["m2", "m3", "m6", "M6"], ["TT", "m7", "M7"]];
export const CHORD_LEVELS = [["maj", "m"], ["dim", "aug"], ["7", "maj7", "m7"]];
export const CHORD_NAMES = {maj: "major", m: "minor", dim: "diminished", aug: "augmented", "7": "dominant 7th", maj7: "major 7th", m7: "minor 7th"};
export const KEYSIG_RANGE = [3, 5, 7]; // |sf| per level; level 3 adds minor keys
export const DRILLS = [
  {kind: "interval-ear", label: "Interval by ear", ear: true},
  {kind: "interval-staff", label: "Interval on the staff", sight: "staff"},
  {kind: "interval-keys", label: "Interval on the keys", sight: "keys"},
  {kind: "chord-ear", label: "Chord quality by ear", ear: true},
  {kind: "degree-ear", label: "Scale degree by ear", ear: true},
  {kind: "keysig", label: "Key signatures"},
  {kind: "spelling", label: "Spelling in a key"},
];
// the two names a pitch class can carry in a key (the second is the
// enharmonic twin a spelling drill offers as a distractor)
const PC_NAMES = [["C", "B#"], ["C#", "Db"], ["D"], ["D#", "Eb"], ["E", "Fb"], ["F", "E#"],
  ["F#", "Gb"], ["G"], ["G#", "Ab"], ["A"], ["A#", "Bb"], ["B", "Cb"]];

// mulberry32: a tiny seedable generator, so a test's 500 draws are repeatable
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi, rnd) => lo + Math.floor(rnd() * (hi - lo + 1)); // inclusive
function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function cumulative(levels, level) { return levels.slice(0, Math.max(1, Math.min(levels.length, level))).flat(); }
// five in a row at a level opens the next; a miss resets the streak (ui.js),
// so the level falls back on its own
export function levelFor(streak) { return Math.min(MAX_LEVEL, 1 + Math.floor(streak / 5)); }

// display: "Eb" → "E♭", "F#" → "F♯"; the theory modules speak ASCII
export function pretty(name) { return name.replace(/b(?=m?$|\s)/, "♭").replace("#", "♯"); }
// typed or tapped answers, in any of the spellings a person uses
export function normalizeNote(s) {
  const m = String(s || "").trim().match(/^([A-Ga-g])\s*(♭|b|♯|#|-)?/);
  if (!m) return null;
  return m[1].toUpperCase() + (m[2] === "♭" || m[2] === "b" || m[2] === "-" ? "b" : m[2] === "♯" || m[2] === "#" ? "#" : "");
}
export function notePc(name) {
  const n = normalizeNote(name);
  if (!n) return null;
  return (LETTER_PC[n[0]] + (n[1] === "#" ? 1 : n[1] === "b" ? -1 : 0) + 12) % 12;
}
export function sfLabel(sf) {
  if (!sf) return "no sharps or flats";
  const n = Math.abs(sf), w = sf > 0 ? "sharp" : "flat";
  return n + " " + w + (n === 1 ? "" : "s");
}
const majorTonicPc = sf => notePc(SF_MAJOR[sf]);
export function keyName(sf, mode) { // ASCII, keyNameToSf's own input shape
  return mode === "minor" ? spellPc((majorTonicPc(sf) + 9) % 12, sf) + "m" : SF_MAJOR[sf];
}
export function keyLabel(sf, mode) { return pretty(keyName(sf, mode).replace(/m$/, "")) + (mode === "minor" ? " minor" : " major"); }

function intervalDrill(kind, level, rnd) {
  const set = cumulative(INTERVAL_LEVELS, level);
  const short = pick(set, rnd);
  const iv = INTERVALS.find(i => i.short === short);
  // treble-staff friendly for the sight drills; a comfortable octave for the ear
  const lo = kind === "interval-keys" ? between(48, 72, rnd) : between(57, 72, rnd);
  const hi = lo + iv.semis;
  const harmonic = kind === "interval-ear" && level >= 3 && rnd() < 0.5;
  return {
    kind, level,
    prompt: kind === "interval-ear" ? (harmonic ? "Two notes together: what interval?" : "Two notes, low then high: what interval?")
      : "What interval is this?",
    notes: [lo, hi],
    play: harmonic ? [{at: 0, dur: 1.6, notes: [lo, hi]}] : [{at: 0, dur: 0.7, notes: [lo]}, {at: 0.8, dur: 0.9, notes: [hi]}],
    choices: set.map(s => { const d = INTERVALS.find(i => i.short === s); return {label: d.name, value: d.short}; }),
    answer: iv.short,
  };
}
function chordDrill(level, rnd) {
  const set = cumulative(CHORD_LEVELS, level);
  const qual = pick(set, rnd);
  const tmpl = CHORD_QUALS.find(([q]) => q === qual)[1];
  const root = between(48, 62, rnd);
  const notes = tmpl.map(iv => root + iv);
  return {
    kind: "chord-ear", level, prompt: "A chord, then its notes one by one: what quality?",
    notes,
    play: [{at: 0, dur: 1.4, notes}, ...notes.map((n, i) => ({at: 1.6 + i * 0.45, dur: 0.5, notes: [n]}))],
    choices: set.map(q => ({label: CHORD_NAMES[q], value: q})),
    answer: qual,
  };
}
function degreeDrill(level, rnd) {
  const mode = level >= 2 && rnd() < 0.5 ? "minor" : "major";
  const steps = mode === "minor" ? MIN_STEP : MAJ_STEP;
  const deg = between(1, 7, rnd);
  const tonic = between(48, 60, rnd);
  return {
    kind: "degree-ear", level, mode,
    prompt: "The tonic, then one more note: which degree of the " + mode + " scale?",
    notes: [tonic, tonic + steps[deg - 1]],
    play: [{at: 0, dur: 0.8, notes: [tonic]}, {at: 0.9, dur: 0.9, notes: [tonic + steps[deg - 1]]}],
    choices: [1, 2, 3, 4, 5, 6, 7].map(d => ({label: String(d), value: String(d)})),
    answer: String(deg),
  };
}
function sfRange(level) {
  const n = KEYSIG_RANGE[Math.min(KEYSIG_RANGE.length, Math.max(1, level)) - 1];
  const out = [];
  for (let sf = -n; sf <= n; sf++) out.push(sf);
  return out;
}
function keysigDrill(level, rnd) {
  const range = sfRange(level);
  const sf = pick(range, rnd);
  const mode = level >= 3 && rnd() < 0.5 ? "minor" : "major";
  const toKey = rnd() < 0.5;
  // distractors: three OTHER signatures from the same range, so every
  // choice is a real key (never an invented one)
  const others = shuffle(range.filter(x => x !== sf), rnd).slice(0, 3);
  const all = shuffle([sf, ...others], rnd);
  if (toKey) return {
    kind: "keysig", level, sf, mode,
    prompt: "Which " + mode + " key has " + sfLabel(sf) + "?",
    choices: all.map(x => ({label: keyLabel(x, mode), value: keyName(x, mode)})),
    answer: keyName(sf, mode),
  };
  return {
    kind: "keysig", level, sf, mode,
    prompt: "How many sharps or flats does " + keyLabel(sf, mode) + " have?",
    choices: all.map(x => ({label: sfLabel(x), value: String(x)})),
    answer: String(sf),
  };
}
function spellingDrill(level, rnd) {
  const sf = pick(sfRange(level), rnd);
  const mode = level >= 3 && rnd() < 0.5 ? "minor" : "major";
  const steps = mode === "minor" ? MIN_STEP : MAJ_STEP;
  const tonicPc = mode === "minor" ? (majorTonicPc(sf) + 9) % 12 : majorTonicPc(sf);
  const deg = between(2, 7, rnd); // degree 1 is in the question
  const scale = steps.map(s => spellPc((tonicPc + s) % 12, sf));
  const answer = scale[deg - 1];
  const twin = PC_NAMES[notePc(answer)].find(n => n !== answer);
  const distract = shuffle(scale.filter(n => n !== answer), rnd).slice(0, twin ? 2 : 3);
  const choices = shuffle([answer, ...(twin ? [twin] : []), ...distract], rnd);
  return {
    kind: "spelling", level, sf, mode, noteAnswer: true, enharmonicOk: false,
    prompt: "In " + keyLabel(sf, mode) + ", which note is scale degree " + deg + "?",
    choices: choices.map(n => ({label: pretty(n), value: n})),
    answer,
  };
}

export function genDrill(kind, level = 1, rnd = Math.random) {
  level = Math.max(1, Math.min(MAX_LEVEL, level | 0));
  switch (kind) {
    case "interval-ear": case "interval-staff": case "interval-keys": return intervalDrill(kind, level, rnd);
    case "chord-ear": return chordDrill(level, rnd);
    case "degree-ear": return degreeDrill(level, rnd);
    case "keysig": return keysigDrill(level, rnd);
    case "spelling": return spellingDrill(level, rnd);
    default: throw new Error("genDrill: unknown kind " + kind);
  }
}

// note answers compare as spellings; the enharmonic twin passes ONLY when the
// drill says so (a key-spelling question is exactly about which name — A♭ in
// E♭ major is not G♯)
export function checkAnswer(drill, value) {
  if (!drill.noteAnswer) return String(value) === String(drill.answer);
  const a = normalizeNote(value), b = normalizeNote(drill.answer);
  if (!a || !b) return false;
  if (a === b) return true;
  return !!drill.enharmonicOk && notePc(a) === notePc(b);
}

// the key a keysig/spelling drill is about, re-derived by the app's own
// reader — tests use it to prove every generated key is a real signature
export function drillKeySf(drill) { return drill.sf === undefined ? null : keyNameToSf(keyName(drill.sf, drill.mode)); }
