// tests/theory-harmony.test.mjs — the VERDICT toolkit (docs/theory-harmony.md):
// roman numerals, cadences, non-chord tones, modulations, chromatic chords,
// all read from a DECLARED key and the user's OWN chord bands. Synthetic
// fixtures throughout (never his compositions) plus two starter songs via
// the CLI's own loader. The last block proves the Learning-mode contract:
// the modules are present (reachable, so package.mjs ships them) but no
// Ask tool offers them yet, in either mode.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./harness.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// plain imports: the modules reach nothing that reads localStorage (no
// key.js → state.js chain), which the purity test at the end pins down
import * as R from "../src/theory/harmony/roman.js";
import { hmCadences, hmPhraseEnds, hmTopPitchAt } from "../src/theory/harmony/cadence.js";
import { hmNonChordTones, hmNeighbours } from "../src/theory/harmony/nct.js";
import { hmModulations, hmKeyRelation } from "../src/theory/harmony/modulation.js";

const PPQ = 480, GRID = {barTicks: 4 * PPQ, beatTicks: PPQ};
const bar = b => (b - 1) * GRID.barTicks;
const C = {start: 0, end: null, sf: 0, name: "C"};
const Am = {start: 0, end: null, sf: 0, name: "Am"};
const Fmix = {start: 0, end: null, sf: -1, name: "F mixolydian"};
const bandsOf = (...labels) => labels.map((text, i) => ({start: bar(i + 1), end: bar(i + 2), text})); // one bar each
const num = (label, key) => R.hmRomanNumeral(R.hmChordFromLabel(label), R.hmKeyContext(key));
const mel = (name, ...pairs) => ({name, notes: pairs.map(([t, p, d]) => ({t, p, d: d || PPQ, v: 80}))}); // [tick, pitch, dur?]

// ---- key context ------------------------------------------------------------
test("hmKeyContext: scale in degree order, diatonic set; minor adds the leading tone; a mode reads its own scale but spells against the parallel major", () => {
  const c = R.hmKeyContext(C);
  assert.deepEqual(c.scale, [0, 2, 4, 5, 7, 9, 11]);
  assert.equal(c.mode, "major"); assert.equal(c.tonicLetter, "C");
  const am = R.hmKeyContext(Am);
  assert.deepEqual(am.scale, [9, 11, 0, 2, 4, 5, 7]);
  assert.ok(am.diatonic.has(8), "G# (the raised 7th) counts as diatonic in minor");
  assert.ok(!am.diatonic.has(6), "F# does not");
  const f = R.hmKeyContext(Fmix);
  assert.deepEqual(f.scale, [5, 7, 9, 10, 0, 2, 3], "F G A Bb C D Eb");
  assert.equal(f.ref, R.hmKeyContext(C).ref, "modes spell degrees against MAJ_STEP (♭VII in mixolydian)");
  assert.equal(R.hmKeyContext(null), null);
  assert.equal(R.hmKeyContext({name: "", sf: 0}), null);
});
test("hmScaleDegree: diatonic degrees are exact; a chromatic pitch gets the nearest degree with its accidental", () => {
  const c = R.hmKeyContext(C);
  assert.equal(R.hmScaleDegree(c, 60).text, "1̂");
  assert.equal(R.hmScaleDegree(c, 71).text, "7̂");
  assert.equal(R.hmScaleDegree(c, 70).text, "♭7̂", "Bb in C");
  assert.equal(R.hmScaleDegree(c, 66).text, "♯4̂", "F# in C");
});

// ---- the user's chord label ----------------------------------------------------
test("hmChordFromLabel: root, bass, tones and quality text for the chord widget's vocabulary; free text is null", () => {
  const d = R.hmChordFromLabel("Dm7/C");
  assert.deepEqual([d.rootPc, d.bassPc, d.tones, d.caseHint, d.qualText, d.seventh], [2, 0, [2, 5, 9, 0], "L", "7", true]);
  const sus = R.hmChordFromLabel("G7sus4");
  assert.deepEqual(sus.tones.sort((a, b) => a - b), [0, 2, 5, 7], "G C D F: the fourth replaces the third");
  assert.equal(sus.qualText, "7sus4");
  const half = R.hmChordFromLabel("Bm7b5");
  assert.deepEqual([half.qualText, half.caseHint], ["ø7", "L"]);
  const dim7 = R.hmChordFromLabel("C#dim7/G");
  assert.deepEqual([dim7.rootPc, dim7.bassPc, dim7.seventh, dim7.qualText], [1, 7, true, "°7"]);
  const nine = R.hmChordFromLabel("Cm7add9");
  assert.deepEqual(nine.tones.sort((a, b) => a - b), [0, 2, 3, 7, 10], "chordQualParse fallback: m + 7 + add9");
  assert.equal(R.hmChordFromLabel("Xyz"), null);
  assert.equal(R.hmChordFromLabel("N.C."), null);
  assert.equal(R.hmChordFromLabel("C (no 5th)").rootPc, 0, "nameChord's trailing note is tolerated");
});
test("hmFigures: triads 6 / 6/4, sevenths 6/5 / 4/3 / 4/2; a bass outside the chord is named, not figured", () => {
  const f = l => R.hmFigures(R.hmChordFromLabel(l));
  assert.deepEqual(f("C/E"), {figures: "6", bassOutside: false});
  assert.deepEqual(f("C/G"), {figures: "6/4", bassOutside: false});
  assert.deepEqual(f("G7/B"), {figures: "6/5", bassOutside: false});
  assert.deepEqual(f("G7/D"), {figures: "4/3", bassOutside: false});
  assert.deepEqual(f("G7/F"), {figures: "4/2", bassOutside: false});
  assert.deepEqual(f("G7/C"), {figures: "", bassOutside: true});
  assert.deepEqual(f("C"), {figures: "", bassOutside: false});
});

// ---- roman numerals -------------------------------------------------------------
const TABLE = [ // label, key, numeral, chromatic kind (null = diatonic)
  ["C", C, "I", null], ["Dm7/C", C, "ii4/2", null], ["G7/B", C, "V6/5", null], ["Am/C", C, "vi6", null],
  ["D7/C", C, "V4/2/V", "secondary dominant"], ["Cmaj7/B", C, "Imaj4/2", null], ["C#dim7/G", C, "vii°4/3/ii", "secondary leading-tone"],
  ["Bdim7/F", C, "vii°4/3", "mode mixture"], ["C7", C, "V7/IV", "secondary dominant"], ["F#dim7", C, "vii°7/V", "secondary leading-tone"],
  ["Abdim7", C, "vii°7", "mode mixture"], ["G7sus4", C, "V7sus4", null], ["F/C", C, "IV6/4", null], ["G7/C", C, "V7 (over C)", null],
  ["Db", C, "♭II", "neapolitan"], ["Db/F", C, "♭II6", "neapolitan"], ["Ab7", C, "Ger+6", "augmented sixth"], ["Fm", C, "iv", "mode mixture"],
  ["Eb", C, "♭III", "mode mixture"], ["Bm7b5", C, "viiø7", null], ["E", C, "V/vi", "secondary dominant"], ["A7", C, "V7/ii", "secondary dominant"],
  ["Bb", C, "♭VII", "mode mixture"], ["Bdim", C, "vii°", null], ["F#m", C, "♯iv", "chromatic"],
  ["E7", Am, "V7", null], ["G", Am, "VII", null], ["Bb", Am, "♭II", "neapolitan"], ["F7", Am, "Ger+6", "augmented sixth"],
  ["Dm", Am, "iv", null], ["Bm7b5", Am, "iiø7", null], ["D7", Am, "V7/VII", "secondary dominant"], ["A", Am, "I", "mode mixture"], ["G#dim7", Am, "vii°7", null],
  ["F", Fmix, "I", null], ["Eb", Fmix, "♭VII", null], ["C", Fmix, "V", "mode mixture"], ["Cm", Fmix, "v", null], ["G7", Fmix, "V7/v", "secondary dominant"],
];
test("hmRomanNumeral: the reading table — case from quality, figures from the bass, V/x and vii°/x for secondary function, ♭/♯ from the user's own spelling", () => {
  for (const [label, key, want, kind] of TABLE) {
    const n = num(label, key);
    assert.equal(n.numeral, want, label + " in " + key.name);
    assert.equal(n.chromatic ? n.chromatic.kind : null, kind, label + " in " + key.name + " kind");
    assert.equal(n.diatonic, kind === null, label + " diatonic flag");
  }
});
test("hmRomanNumeral: a dim7 is read from the user's spelling first, then its enharmonic roots — the key's own vii°7 wins and says how it was re-spelled", () => {
  const a = num("Abdim7", C);
  assert.equal(a.enharmonic, "as Bdim7");
  assert.equal(num("Bdim7", C).enharmonic, undefined);
  const d = num("Ddim7", C); // D F Ab B = Bdim7
  assert.equal(d.numeral, "vii°7"); assert.equal(d.enharmonic, "as Bdim7");
  const s = num("Edim7", C); // E G Bb Db — no B: vii°7/? — E+1 = F → IV
  assert.equal(s.numeral, "vii°7/IV"); assert.equal(s.enharmonic, undefined);
});
test("hmRomanNumeral: secondary function never targets the tonic or a diminished degree", () => {
  assert.equal(num("G7", C).secondary, null, "V7 is just V7");
  const b = num("B7", C); // would be V7 of E… E is iii (minor) → V7/iii
  assert.equal(b.numeral, "V7/iii");
  const fs = num("F#7", C); // target B = vii° → not a secondary dominant
  assert.equal(fs.secondary, null);
  assert.equal(fs.chromatic.kind, "chromatic");
});
test("hmKeyAt: a ranged region beats an open one, the latest start wins, nothing before the first", () => {
  const keys = [{start: bar(1), end: null, sf: 0, name: "C"}, {start: bar(9), end: null, sf: 1, name: "G"}, {start: bar(5), end: bar(7), sf: -1, name: "F"}];
  assert.equal(R.hmKeyAt(keys, bar(1)).name, "C");
  assert.equal(R.hmKeyAt(keys, bar(6)).name, "F", "inside the ranged F region");
  assert.equal(R.hmKeyAt(keys, bar(7)).name, "C", "past its end the open C resumes");
  assert.equal(R.hmKeyAt(keys, bar(12)).name, "G");
  assert.equal(R.hmKeyAt([{start: bar(3), end: null, sf: 0, name: "C"}], bar(2)), null);
});
test("hmKeyRegionsFromNotes / hmBandsFromNotes: b2 (not .end) decides whether a key is open; a chord needs a real span", () => {
  const notes = [
    {text: "key: Am", keydir: 0, start: 0, end: GRID.barTicks, b1: 1, q1: 1, b2: null, q2: null}, // .end is the lane layout's drawn span, not a range
    {text: "key: C", keydir: 0, start: bar(5), end: bar(9), b1: 5, q1: 1, b2: 8, q2: 4},
    {text: "G7", chord: true, start: bar(2), end: bar(3), b1: 2, q1: 1, b2: 2, q2: 4, cnote: "the dominant"},
    {text: "C", chord: true, start: bar(3), end: bar(4), b1: 3, q1: 1, b2: null},
    {text: "a thought", start: bar(1), end: bar(2), b1: 1, q1: 1, b2: 1, q2: 4},
  ];
  const keys = R.hmKeyRegionsFromNotes(notes);
  assert.deepEqual(keys, [{start: 0, end: null, sf: 0, name: "Am"}, {start: bar(5), end: bar(9), sf: 0, name: "C"}]);
  const bands = R.hmBandsFromNotes(notes);
  assert.deepEqual(bands, [{start: bar(2), end: bar(3), text: "G7", note: "the dominant"}]);
});
test("hmRomanNumerals: rows carry bar.beat, the governing key, and a reason instead of a guess when no key governs or the band is free text; a key change switches the reading", () => {
  const keys = [{start: bar(2), end: null, sf: 0, name: "C"}, {start: bar(5), end: null, sf: 1, name: "G"}];
  const rows = R.hmRomanNumerals(bandsOf("C", "C", "Dm", "N.C.", "D", "Am"), keys, GRID);
  assert.equal(rows[0].numeral, null); assert.equal(rows[0].reason, "no declared key governs this band");
  assert.deepEqual([rows[1].at, rows[1].to, rows[1].numeral, rows[1].key], ["2.1", "3.1", "I", "C"]);
  assert.equal(rows[2].numeral, "ii");
  assert.equal(rows[3].numeral, null); assert.equal(rows[3].reason, "not a chord symbol");
  assert.deepEqual([rows[4].numeral, rows[4].key], ["V", "G"]);
  assert.deepEqual([rows[5].numeral, rows[5].key], ["ii", "G"]);
});
test("hmChromaticSummary: only chords outside their key, grouped by kind", () => {
  const rows = R.hmRomanNumerals(bandsOf("C", "A7", "Dm", "G7", "Fm", "C"), [C], GRID);
  const sum = R.hmChromaticSummary(rows);
  assert.equal(sum.total, 2); assert.equal(sum.of, 6);
  assert.deepEqual(sum.kinds, {"secondary dominant": 1, "mode mixture": 1});
  assert.deepEqual(sum.items.map(i => [i.at, i.numeral]), [["2.1", "V7/ii"], ["5.1", "iv"]]);
});

// ---- cadences ---------------------------------------------------------------------
const cad = (labels, key, tracks, opts = {}, sections = []) => {
  const bands = opts.bands || bandsOf(...labels);
  const rows = R.hmRomanNumerals(bands, [key], GRID);
  return hmCadences(rows, [key], tracks, GRID, bar(labels.length + 1), sections, opts);
};
test("hmPhraseEnds: every N bars, section edges, the song end", () => {
  const ends = hmPhraseEnds(GRID, bar(9), [{start: bar(5), end: bar(9), text: "B"}], 4);
  assert.deepEqual([...ends.entries()], [[bar(5), "section starts: B"], [bar(9), "section ends: B"]], "a section edge outranks 'song end' and the N-bar grid at the same tick");
  assert.equal(hmPhraseEnds(GRID, bar(9), [], 2).get(bar(7)), "phrase end (2-bar phrases)");
});
test("hmTopPitchAt: the highest pitch sounding at the chord's start or starting in its first beat — an arpeggio reads its top, not its bass", () => {
  const tr = [mel("arp", [bar(2), 36, PPQ * 4], [bar(2), 48, PPQ / 4], [bar(2) + PPQ / 4, 64, PPQ / 4], [bar(2) + PPQ / 2, 67, PPQ / 4], [bar(2) + PPQ * 2, 84])];
  assert.equal(hmTopPitchAt(tr, bar(2), bar(2) + PPQ), 67, "C5 at beat 3 is outside the first beat");
  assert.equal(hmTopPitchAt([], bar(2), bar(3)), null);
});
test("PAC: V→I at a phrase end, both in root position, soprano on 1̂", () => {
  const out = cad(["C", "F", "G7", "C"], C, [mel("melody", [bar(3), 71], [bar(4), 72])]);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].type, out[0].at, out[0].from.numeral, out[0].to.numeral, out[0].soprano.degree, out[0].where],
                   ["PAC", "4.1", "V7", "I", "1̂", "song end at 5.1"]);
});
test("IAC: the same arrival with the soprano on 3̂, or either chord inverted", () => {
  const sop3 = cad(["C", "F", "G7", "C"], C, [mel("melody", [bar(4), 76])]);
  assert.deepEqual([sop3[0].type, sop3[0].soprano.degree], ["IAC", "3̂"]);
  const inv = cad(["C", "F", "G7/B", "C"], C, [mel("melody", [bar(4), 72])]);
  assert.equal(inv[0].type, "IAC"); assert.match(inv[0].detail, /inverted/);
});
test("HC ends a phrase on V; PC is IV→I; DC is V→vi; a Phrygian half is iv6→V in minor", () => {
  assert.equal(cad(["C", "F", "Dm", "G"], C, [])[0].type, "HC");
  const pc = cad(["C", "G", "F", "C"], C, [mel("m", [bar(4), 72])]); assert.equal(pc[0].type, "PC");
  const dc = cad(["C", "F", "G", "Am"], C, [])[0]; assert.equal(dc.type, "DC"); assert.equal(dc.to.numeral, "vi");
  const ph = cad(["Am", "Dm", "Dm/F", "E"], Am, [])[0]; assert.equal(ph.type, "HC"); assert.match(ph.detail, /Phrygian/);
});
test("not a cadence: V→V (G7sus4→G7), a secondary dominant resolving, a key change between the two chords, a gap longer than a beat", () => {
  assert.equal(cad(["C", "F", "G7sus4", "G7"], C, []).length, 0, "one dominant, not a half cadence");
  const sec = cad(["C", "Am", "D7", "G"], C, []); // D7→G at a phrase end: G is V → HC on the goal, but V7/V→V is not reported as PAC/IAC
  assert.deepEqual(sec.map(c => c.type), ["HC"]);
  const keys = [{start: 0, end: null, sf: 0, name: "C"}, {start: bar(4), end: null, sf: 1, name: "G"}];
  const rows = R.hmRomanNumerals(bandsOf("C", "F", "D7", "G"), keys, GRID);
  assert.equal(hmCadences(rows, keys, [], GRID, bar(5), []).length, 0, "D7 in C → G in G: modulation's business");
  const gap = [{start: bar(1), end: bar(2), text: "G7"}, {start: bar(3) + PPQ * 2, end: bar(4), text: "C"}];
  assert.equal(hmCadences(R.hmRomanNumerals(gap, [C], GRID), [C], [], GRID, bar(5), []).length, 0);
});
test("mid-phrase V→I is listed only with opts.all; a goal held longer than the usual band is an arrival; sections name the phrase end", () => {
  const labels = ["C", "G7", "C", "G7", "C", "F", "G7", "C"];
  const quiet = cad(labels, C, [mel("m", [bar(3), 72], [bar(8), 72])]);
  assert.deepEqual(quiet.map(c => [c.type, c.at]), [["HC", "4.1"], ["PAC", "8.1"]], "the V→I at 3.1 is mid-phrase");
  const all = cad(labels, C, [mel("m", [bar(3), 72], [bar(8), 72])], {all: true});
  assert.deepEqual(all[0] && [all[0].type, all[0].at, all[0].where], ["PAC", "3.1", "mid-phrase"]);
  const held = [{start: bar(1), end: bar(2), text: "G7"}, {start: bar(2), end: bar(4), text: "C"}, {start: bar(4), end: bar(5), text: "F"}, {start: bar(5), end: bar(6), text: "G7"}];
  const arr = hmCadences(R.hmRomanNumerals(held, [C], GRID), [C], [mel("m", [bar(2), 72])], GRID, bar(6), []);
  assert.equal(arr[0].where, "arrival (held 8 beats)");
  const sec = cad(["C", "G7", "C", "F", "G7", "C"], C, [mel("m", [bar(3), 72])], {phraseBars: 8}, [{start: bar(1), end: bar(3), text: "A"}]);
  assert.equal(sec[0].where, "section ends: A at 3.1");
});

// ---- non-chord tones ---------------------------------------------------------------
const nct = (tracks, labels, key = C, opts) => hmNonChordTones(tracks, bandsOf(...labels), [key], GRID, opts);
const types = r => r.items.map(i => i.type);
test("passing and neighbor tones: step in, step out — same direction passes, opposite returns; chromatic ones say so", () => {
  const r = nct([mel("m", [bar(1), 60], [bar(1) + PPQ, 62], [bar(1) + PPQ * 2, 64], [bar(1) + PPQ * 3, 65], [bar(2), 64])], ["C", "C"]);
  assert.deepEqual(types(r), ["passing", "neighbor"]);
  assert.deepEqual(r.items.map(i => [i.at, i.pitch, i.detail]), [["1.2", "D4", "accented, rising"], ["1.4", "F4", "upper"]]);
  assert.equal(r.summary.chordTones, 3);
  const chrom = nct([mel("m", [bar(1), 60], [bar(1) + PPQ, 61], [bar(1) + PPQ * 2, 62], [bar(1) + PPQ * 3, 64])], ["C"]);
  assert.deepEqual(types(chrom), ["passing", "passing"], "C–C#–D–E: two passing tones");
  assert.match(chrom.items[0].detail, /chromatic/); assert.doesNotMatch(chrom.items[1].detail, /chromatic/);
});
test("suspension: a chord tone held into the next band, resolving down by step (4-3); up by step is a retardation; no step is 'held over'", () => {
  const sus = nct([mel("m", [bar(1), 72, PPQ * 4 + PPQ], [bar(2) + PPQ, 71, PPQ * 3])], ["F", "G7"]);
  assert.deepEqual(types(sus), ["suspension"]);
  assert.deepEqual([sus.items[0].at, sus.items[0].over, sus.items[0].pitch], ["2.1", "G7", "C5"]);
  assert.match(sus.items[0].detail, /prepared at 1\.1 \(F\), held into G7, resolves down by step at 2\.2/);
  const ret = nct([mel("m", [bar(1), 71, PPQ * 5], [bar(2) + PPQ, 72])], ["G", "C"]); // B held over C, up to C
  assert.deepEqual(types(ret), ["retardation"]);
  const held = nct([mel("m", [bar(1), 72, PPQ * 5], [bar(2) + PPQ, 67])], ["F", "G7"]);
  assert.deepEqual(types(held), ["held over"]);
  // a re-struck preparation (same pitch, new onset) is the suspension's other shape
  const restruck = nct([mel("m", [bar(1), 72], [bar(2), 72], [bar(2) + PPQ, 71, PPQ * 3])], ["F", "G7"]);
  assert.deepEqual(types(restruck), ["suspension"]);
  assert.match(restruck.items[0].detail, /prepared at 1\.1, resolves down by step at 2\.2/);
});
test("anticipation, appoggiatura, escape tone, pedal, incomplete neighbor, unresolved, free tone", () => {
  const ant = nct([mel("m", [bar(1), 67, PPQ * 3], [bar(1) + PPQ * 3, 72], [bar(2), 72, PPQ * 4])], ["G7", "C"]);
  assert.deepEqual(types(ant), ["anticipation"]);
  const app = nct([mel("m", [bar(1), 60], [bar(1) + PPQ, 69], [bar(1) + PPQ * 2, 67, PPQ * 2])], ["C"]);
  assert.deepEqual(types(app), ["appoggiatura"]); assert.match(app.items[0].detail, /leap in, step down out/);
  const esc = nct([mel("m", [bar(1), 60], [bar(1) + PPQ, 62], [bar(1) + PPQ * 2, 55, PPQ * 2])], ["C"]);
  assert.deepEqual(types(esc), ["escape"]);
  const ped = nct([mel("bass", [bar(1), 48], [bar(2), 48], [bar(3), 48])], ["C", "G7", "C"]);
  assert.deepEqual(types(ped), ["pedal"]); assert.equal(ped.items[0].at, "2.1");
  const inc = nct([mel("m", [bar(1), 62], [bar(1) + PPQ, 60, PPQ * 3])], ["C"]);
  assert.deepEqual(types(inc), ["incomplete neighbor"]);
  const un = nct([mel("m", [bar(1), 60], [bar(1) + PPQ, 66, PPQ * 3])], ["C"]);
  assert.deepEqual(types(un), ["unresolved"]);
  const free = nct([mel("m", [bar(1), 60], [bar(1) + PPQ, 66], [bar(1) + PPQ * 2, 72, PPQ * 2])], ["C"]);
  assert.deepEqual(types(free), ["free tone"]);
});
test("hmNonChordTones: notes under no band (or a free-text band) are counted, never classified; a slash bass outside the chord is a pedal; --track filters", () => {
  const r = hmNonChordTones([mel("m", [bar(1), 60], [bar(2), 62]), mel("b", [bar(2), 50])], [{start: bar(2), end: bar(3), text: "N.C."}], [C], GRID);
  assert.equal(r.uncovered, 3); assert.equal(r.items.length, 0);
  const slash = nct([mel("bass", [bar(1), 48], [bar(2), 48], [bar(3), 48])], ["C", "G7/C", "C"]);
  assert.deepEqual(types(slash), ["pedal"], "the C under G7/C is in the label as the bass, but not a member of G7");
  const filt = nct([mel("m", [bar(1), 60], [bar(1) + PPQ, 62], [bar(1) + PPQ * 2, 64, PPQ * 2]), mel("b", [bar(1), 48], [bar(1) + PPQ, 50], [bar(1) + PPQ * 2, 52, PPQ * 2])], ["C"], C, {track: "b"});
  assert.deepEqual(filt.items.map(i => i.track), ["b"]);
  assert.equal(filt.summary.nonChordTones, 2, "the summary still counts every track");
});
test("hmNeighbours: previous/next onset in the same track; among simultaneous notes the nearest pitch", () => {
  const notes = [{t: 0, p: 60}, {t: 0, p: 72}, {t: 480, p: 62}, {t: 960, p: 64}, {t: 960, p: 76}];
  const {prev, next} = hmNeighbours(notes, 2);
  assert.equal(prev.p, 60); assert.equal(next.p, 64);
});

// ---- modulations -------------------------------------------------------------------
test("hmKeyRelation: dominant, subdominant, relative, parallel, mediant; common tones", () => {
  const k = n => R.hmKeyContext({name: n, sf: 0});
  assert.deepEqual(hmKeyRelation(k("C"), k("G")), {name: "to the dominant", interval: 7, commonTones: 6, closelyRelated: true});
  assert.equal(hmKeyRelation(k("C"), k("F")).name, "to the subdominant");
  assert.equal(hmKeyRelation(k("C"), k("Am")).name, "relative minor");
  assert.equal(hmKeyRelation(k("Am"), k("C")).name, "relative major");
  assert.equal(hmKeyRelation(k("C"), k("Cm")).name, "parallel minor");
  assert.equal(hmKeyRelation(k("C"), k("E")).name, "a third up (mediant)");
  assert.equal(hmKeyRelation(k("C"), k("F#")).name, "a tritone away");
  assert.equal(hmKeyRelation(k("F mixolydian"), k("Bb mixolydian")).name, "to the subdominant");
});
test("hmModulations: pivot candidates are bands diatonic to both keys within ±2 bars of the change, read in each key; the first foreign chord is the signal", () => {
  const keys = [{start: 0, end: null, sf: 0, name: "C"}, {start: bar(5), end: null, sf: 1, name: "G"}];
  const bands = bandsOf("C", "F", "Am", "D7", "G", "C", "D7", "G");
  const m = hmModulations(keys, bands, GRID);
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].at, m[0].from, m[0].to, m[0].relation.name, m[0].newTones], ["5.1", "C", "G", "to the dominant", ["F#"]]);
  assert.deepEqual(m[0].pivots.map(p => [p.at, p.label, p.inFrom, p.inTo, p.before]),
                   [["3.1", "Am", "vi", "ii", true], ["5.1", "G", "V", "I", false], ["6.1", "C", "I", "IV", false]]);
  assert.deepEqual([m[0].signal.at, m[0].signal.label, m[0].signal.inTo], ["4.1", "D7", "V7"]);
  assert.match(m[0].reading, /pivot-chord candidates/);
});
test("hmModulations: a re-declared same key is not a modulation; no key change means no modulations; no common chord says so", () => {
  assert.equal(hmModulations([{start: 0, end: null, sf: 0, name: "C"}, {start: bar(5), end: null, sf: 0, name: "C"}], bandsOf("C", "G"), GRID).length, 0);
  assert.equal(hmModulations([C], bandsOf("C", "G"), GRID).length, 0);
  const far = hmModulations([{start: 0, end: null, sf: 0, name: "C"}, {start: bar(5), end: null, sf: 6, name: "F#"}], bandsOf("C", "G", "C", "G", "F#", "C#"), GRID);
  assert.equal(far[0].pivots.length, 0); assert.match(far[0].reading, /no common chord/);
});

// ---- the real starters, through the CLI's own loader ---------------------------------
test("tools/harmony.mjs on bach-prelude-in-c: 35 numerals in C, 9 chromatic, the final V7→I is an IAC over the tonic pedal (the top voice reaches 1̂)", async () => {
  const { loadSong } = await import("../tools/query-lib.mjs");
  const doc = await loadSong("bach-prelude-in-c");
  const grid = {barTicks: doc.barTicks, beatTicks: doc.beatTicks};
  const keys = R.hmKeyRegionsFromNotes(doc.rollnotes), bands = R.hmBandsFromNotes(doc.rollnotes);
  assert.deepEqual(keys, [{start: 0, end: null, sf: 0, name: "C"}]);
  const rows = R.hmRomanNumerals(bands, keys, grid);
  assert.equal(rows.length, 35);
  assert.ok(rows.every(r => r.numeral), "every band reads in C");
  assert.deepEqual(rows.slice(0, 4).map(r => r.numeral), ["I", "ii4/2", "V6/5", "I"]);
  assert.equal(R.hmChromaticSummary(rows).total, 9);
  const cads = hmCadences(rows, keys, doc.tracks, grid, doc.endTick, doc.rollnotes.filter(n => n.section && n.b2).map(n => ({start: n.start, end: n.end, text: n.text})));
  const last = cads[cads.length - 1];
  assert.deepEqual([last.type, last.at, last.from.label, last.to.label, last.soprano.degree], ["IAC", "35.1", "G7/C", "C", "1̂"]);
  assert.ok(cads.some(c => c.type === "PAC" && c.at === "19.1"), "the halfway home (G7 → C at 19) is the one PAC");
});
test("tools/harmony.mjs on airship (FF1): the declared F mixolydian → Bb mixolydian change lists Eb/Bb as pivots and Ab as the signal", async () => {
  const { loadSong } = await import("../tools/query-lib.mjs");
  const doc = await loadSong("albums/nes/final-fantasy-i/songs/airship");
  const grid = {barTicks: doc.barTicks, beatTicks: doc.beatTicks};
  const m = hmModulations(R.hmKeyRegionsFromNotes(doc.rollnotes), R.hmBandsFromNotes(doc.rollnotes), grid);
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].at, m[0].from, m[0].to, m[0].relation.name], ["9.1", "F mixolydian", "Bb mixolydian", "to the subdominant"]);
  assert.deepEqual(m[0].pivots.map(p => p.label + ":" + p.inFrom + "=" + p.inTo), ["Eb:♭VII=IV", "Eb:♭VII=IV", "Bb:IV=I", "Bb:IV=I"]);
  assert.equal(m[0].signal.label, "Ab");
});

// ---- the Learning-mode contract (docs/theory-harmony.md) ------------------------------
test("purity: src/theory/harmony/* import only theory/chords.js (layer 0; never key.js, whose state.js import reads localStorage) — no S, no model/gen/ask, no DOM", () => {
  const dir = path.join(ROOT, "src/theory/harmony");
  for (const f of readdirSync(dir)) {
    const src = readFileSync(path.join(dir, f), "utf8").replace(/\/\/.*$/gm, ""); // comments may NAME S.rollnotes; code may not read it
    for (const m of src.matchAll(/^import[^\n]*from "([^"]+)"/gm)) assert.match(m[1], /^\.\/|^\.\.\/chords\.js$/, f + " imports " + m[1]);
    assert.doesNotMatch(src, /\bS\./, f + " reads S");
    assert.doesNotMatch(src, /\b(document|window|localStorage)\s*[.[(]/, f + " touches the DOM/storage");
  }
});
test("not wired: the modules are reachable (devtools mirror, so package.mjs ships them) but no Ask tool offers roman_numerals/find_cadences/nonchord_tones/modulations/chromatic_chords in EITHER mode — wiring them must come with the Normal-only gate the doc specifies", async () => {
  const PLANNED = ["roman_numerals", "find_cadences", "nonchord_tones", "modulations", "chromatic_chords"];
  for (const mode of ["learning", "normal"]) {
    const app = await createApp({storage: {"ff1roll-mode": mode}});
    assert.equal(app.run(`typeof hmRomanNumeral`), "function", "loaded in the vm (" + mode + ")");
    assert.equal(app.run(`appMode()`), mode);
    const offered = app.run(`JSON.stringify(askActList(!!askGeneral).map(d => d.name))`);
    for (const name of PLANNED) assert.ok(!JSON.parse(offered).includes(name), name + " is not offered in " + mode + " mode");
    const sys = app.run(`askSys()`);
    assert.doesNotMatch(sys, /roman numeral|cadence tool|hm[A-Z]/, "the system prompt says nothing about them (" + mode + ")");
  }
});
