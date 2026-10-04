// tests/theory.test.mjs — the music-theory FACTS toolkit (src/theory/facts/,
// docs/theory-toolkit.md). Pure functions on synthetic docs (a note is
// [bar, beat, quarters, midi]) plus real songs through tools/query-lib.mjs
// (the app's own parser). The last block is the law: nothing any formatter
// or result emits may contain a key name, a chord name, a roman numeral or
// a meter declaration — Learning mode (CLAUDE.md) applies to tools too.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  factsPitch, factsBQ, factsParseBQ, factsTracks, factsTopLine, factsVoices, factsSoundingAt,
  factsDeclaredSf, factsChordSpans, factsLines, factsOnsetBarCount, factsBarCount,
} from "../src/theory/facts/common.js";
import { findPattern, factsPatternFromSpan, factsPatternOf, factsCollapseRepeats, factsHitsByTransposition } from "../src/theory/facts/pattern.js";
import { formFacts, factsLetter, factsUnitRelation } from "../src/theory/facts/form.js";
import { melodyFacts } from "../src/theory/facts/melody.js";
import { rhythmFacts } from "../src/theory/facts/rhythm.js";
import { bassFacts } from "../src/theory/facts/bass.js";
import { voiceFacts } from "../src/theory/facts/voices.js";
import { formatFacts, FACTS_FORMATTERS } from "../src/theory/facts/format.js";
import { loadSong } from "../tools/query-lib.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PPQ = 480;

// {trackName: [[bar, beat, quarters, midi], ...]} → a toolkit doc on the
// neutral 4/4 ruler (bar = 4 quarters, beat = 1 quarter), like query-lib's
function mkDoc(tracks, {rollnotes = [], beatsPerBar = 4} = {}) {
  const barTicks = PPQ * beatsPerBar, beatTicks = PPQ;
  const toTick = (bar, beat) => (bar - 1) * barTicks + (beat - 1) * beatTicks;
  return {
    ppq: PPQ, barTicks, beatTicks,
    tracks: Object.entries(tracks).map(([name, notes]) => ({name, notes: notes.map(([b, q, d, p]) => ({t: toTick(b, q), d: Math.round(d * PPQ), p, v: 100}))})),
    rollnotes: rollnotes.map(r => ({...r, start: toTick(r.b1, r.q1 || 1), end: r.b2 ? toTick(r.b2, (r.q2 || beatsPerBar) + 1) : null})),
  };
}
// a bar of eighths from a pitch list, starting at `bar`
const eighths = (bar, pitches) => pitches.map((p, i) => [bar, 1 + i / 2, 0.5, p]);

// ---- common --------------------------------------------------------------
test("facts/common: spelling is key-neutral sharps unless the user's own signed fifths are passed", () => {
  assert.equal(factsPitch(61), "C#4");
  assert.equal(factsPitch(70), "A#4");
  assert.equal(factsPitch(70, -1), "Bb4"); // his declared key spells it; never an estimate
  assert.equal(factsPitch(60), "C4");
  assert.equal(factsPitch(21), "A0");
});

test("facts/common: bar.beat formatting and parsing round-trip on the doc's ruler", () => {
  const doc = mkDoc({m: [[1, 1, 1, 60]]});
  assert.equal(factsBQ(doc, 0), "1.1");
  assert.equal(factsBQ(doc, PPQ * 5), "2.2");
  assert.equal(factsBQ(doc, PPQ / 2), "1.1.5");
  assert.equal(factsBQ(doc, PPQ * 4 + PPQ * 3 + PPQ / 4), "2.4.25");
  assert.equal(factsParseBQ(doc, "2.2"), PPQ * 5);
  assert.equal(factsParseBQ(doc, "1.1.5"), PPQ / 2);
  assert.equal(factsParseBQ(doc, "3"), PPQ * 8);
  const six = mkDoc({m: [[1, 1, 1, 60]]}, {beatsPerBar: 6});
  assert.equal(factsBQ(six, PPQ * 6), "2.1");
});

test("facts/common: track selection — non-drum by default, by name or index, drums on request, unknown throws naming the real tracks", () => {
  const doc = mkDoc({melody: [[1, 1, 1, 60]], "NES noise": [[1, 1, 0.25, 40]], Drums: [[1, 1, 0.25, 36]]});
  assert.deepEqual(factsTracks(doc).map(t => t.name), ["melody"]);
  assert.deepEqual(factsTracks(doc, {drums: true}).map(t => t.name), ["melody", "NES noise", "Drums"]);
  assert.deepEqual(factsTracks(doc, {track: "Drums"}).map(t => t.ti), [2]);
  assert.deepEqual(factsTracks(doc, {track: 1}).map(t => t.name), ["NES noise"]);
  assert.deepEqual(factsTracks(doc, {track: ["melody", "2"]}).map(t => t.ti), [0, 2]);
  assert.throws(() => factsTracks(doc, {track: "bass"}), /no track named bass.*0:melody/);
  assert.equal(factsBarCount(doc), 1);
});

test("facts/common: top line, rank voices and sounding-at on a chordal track", () => {
  const doc = mkDoc({chords: [[1, 1, 1, 60], [1, 1, 1, 64], [1, 1, 1, 67], [1, 2, 1, 62], [1, 2, 1, 65], [1, 3, 1, 64]]});
  const notes = doc.tracks[0].notes;
  assert.deepEqual(factsTopLine(notes).map(n => n.p), [67, 65, 64]);
  const voices = factsVoices(notes);
  assert.equal(voices.length, 3);
  assert.deepEqual(voices[0].map(n => n.p), [67, 65, 64]);
  assert.deepEqual(voices[1].map(n => n.p), [64, 62]);
  assert.deepEqual(voices[2].map(n => n.p), [60]);
  assert.equal(factsSoundingAt(voices[0], PPQ + 10).p, 65);
  assert.equal(factsSoundingAt(voices[2], PPQ + 10), null);
  const lines = factsLines(doc);
  assert.deepEqual(lines.map(l => l.voice), [0, 1, 2]);
  const mono = factsLines(mkDoc({m: [[1, 1, 1, 60], [1, 2, 1, 62]]}));
  assert.deepEqual(mono.map(l => l.voice), [null]);
});

test("facts/common: the user's declared key is read for spelling only (latest at or before the tick); chord spans are spans, no text", () => {
  const doc = mkDoc({m: [[1, 1, 1, 60]]}, {rollnotes: [
    {b1: 1, q1: 1, keydir: 1, text: "key: G"}, {b1: 5, q1: 1, keydir: -2, text: "key: Bb"},
    {b1: 1, q1: 1, b2: 2, q2: 4, chord: true, text: "G"}, {b1: 3, q1: 1, chord: true, text: "no end"},
  ]});
  assert.equal(factsDeclaredSf(doc, 0), 1);
  assert.equal(factsDeclaredSf(doc, PPQ * 4 * 4), -2);
  assert.equal(factsDeclaredSf(mkDoc({m: []}), 0), null);
  assert.deepEqual(factsChordSpans(doc), [{start: 0, end: PPQ * 8}]);
  assert.equal(factsOnsetBarCount(mkDoc({m: [[1, 1, 8, 60]]})), 1); // the long note does not add an empty bar
});

// ---- pattern -------------------------------------------------------------
const PAT_DOC = mkDoc({
  lead: [...eighths(1, [60, 62, 64, 65, 67, 67, 65, 64]), ...eighths(2, [67, 69, 71, 72, 74, 72, 71, 69]), [3, 1, 2, 60], [3, 3, 2, 72]],
  harmony: [[1, 1, 2, 48], [1, 1, 2, 52], [1, 3, 2, 50], [1, 3, 2, 53], [2, 1, 2, 48], [2, 1, 2, 55]],
  Drums: [[1, 1, 0.25, 36], [1, 1.5, 0.25, 38], [1, 2, 0.25, 36]],
});

test("facts/pattern: an interval pattern is found at every transposition, with where and how far from the anchor", () => {
  const r = findPattern(PAT_DOC, {intervals: [2, 2, 1], anchorPitch: 60});
  assert.deepEqual(r.hits.map(h => [h.at, h.track, h.startPitch, h.transposition]), [["1.1", "lead", "C4", 0], ["2.1", "lead", "G4", 7]]);
  assert.equal(r.hits[0].endAt, "1.3"); // where the last matched note ENDS
  assert.deepEqual(r.hits[0].pitches, ["C4", "D4", "E4", "F4"]);
  assert.deepEqual(r.linesSearched, ["lead", "harmony/v1", "harmony/v2"]);
  assert.deepEqual(factsHitsByTransposition(r.hits).map(g => [g.key, g.count]), [[0, 1], [7, 1]]);
  assert.equal(findPattern(PAT_DOC, {intervals: [2, 2, 1], track: "harmony"}).hits.length, 0);
});

test("facts/pattern: octave displacement, collapsed repeats and drums are opt-in", () => {
  assert.equal(findPattern(PAT_DOC, {intervals: [12]}).hits.length, 1); // 3.1 C4→C5 only
  assert.equal(findPattern(PAT_DOC, {intervals: [0]}).hits.length, 1); // 1.3 G4 G4
  assert.equal(findPattern(PAT_DOC, {intervals: [-12]}).hits.length, 0);
  assert.equal(findPattern(PAT_DOC, {intervals: [0], octaveEquiv: true}).hits.length, 2); // + the C4→C5 octave
  // bar 1's "F G G F E" is +2 0 -2 -1; collapsing the repeated G makes it
  // +2 -2 -1 — the same figure bar 2's "C D C B" already states plainly
  assert.equal(findPattern(PAT_DOC, {intervals: [2, -2, -1]}).hits.length, 1);
  assert.deepEqual(findPattern(PAT_DOC, {intervals: [2, -2, -1], collapseRepeats: true}).hits.map(h => h.at), ["1.2.5", "2.2.5"]);
  assert.deepEqual(factsCollapseRepeats([{p: 1, t: 0}, {p: 1, t: 1}, {p: 2, t: 2}, {p: 1, t: 3}]).map(n => n.p), [1, 2, 1]);
  assert.equal(findPattern(PAT_DOC, {intervals: [2, -2]}).hits.filter(h => h.track === "Drums").length, 0);
  assert.equal(findPattern(PAT_DOC, {intervals: [2, -2], drums: true}).hits.filter(h => h.track === "Drums").length, 1);
});

test("facts/pattern: rhythm matches exactly in quarters, or by proportion (augmentation) with rhythmScale", () => {
  const doc = mkDoc({m: [[1, 1, 0.5, 60], [1, 1.5, 0.5, 62], [1, 2, 1, 64], [2, 1, 1, 60], [2, 2, 1, 62], [2, 3, 2, 64]]});
  assert.equal(findPattern(doc, {intervals: [2, 2], rhythm: [0.5, 0.5]}).hits.length, 1);
  assert.equal(findPattern(doc, {intervals: [2, 2]}).hits.length, 2);
  assert.equal(findPattern(doc, {intervals: [2, 2], rhythm: [0.5, 0.5], rhythmScale: true}).hits.length, 2);
  assert.equal(findPattern(doc, {rhythm: [1, 1]}).hits.length, 1); // rhythm alone, any pitches
  assert.throws(() => findPattern(doc, {}), /needs intervals/);
  assert.throws(() => findPattern(doc, {intervals: [2], rhythm: [1, 1]}), /same length/);
});

test("facts/pattern: polyphonic tracks are searched on every rank voice", () => {
  const r = findPattern(PAT_DOC, {intervals: [2], track: "harmony"});
  // v1 (top) E3 F3 G3 is +1 +2 → its +2 is at 1.3; v2 C3 D3 C3 has +2 at 1.1
  assert.deepEqual(r.hits.map(h => [h.voice, h.at, h.startPitch]), [[1, "1.1", "C3"], [0, "1.3", "F3"]]);
  assert.equal(findPattern(PAT_DOC, {intervals: [2], track: "harmony", voice: 1}).hits.length, 1);
});

test("facts/pattern: a span of the song lifts its own pattern — the search then finds the source and its transposed copy", () => {
  const pat = factsPatternFromSpan(PAT_DOC, {track: "lead", from: "1.1", to: "1.3"});
  assert.deepEqual(pat.intervals, [2, 2, 1]);
  assert.deepEqual(pat.rhythm, [0.5, 0.5, 0.5]);
  assert.equal(pat.anchorPitch, 60);
  assert.equal(pat.source.from, "1.1");
  const r = findPattern(PAT_DOC, {...pat, track: "lead"});
  assert.deepEqual(r.hits.map(h => h.transposition), [0, 7]);
  assert.throws(() => factsPatternFromSpan(PAT_DOC, {track: "lead", from: "3.1", to: "3.2"}), /at least two/);
  assert.deepEqual(factsPatternOf([{t: 0, p: 60}, {t: 480, p: 60}, {t: 960, p: 67}], 480, {collapseRepeats: true}).intervals, [7]);
});

// ---- form ----------------------------------------------------------------
const FIG = [60, 62, 64, 62];
const FORM_DOC = mkDoc({
  m: [
    ...eighths(1, FIG), ...eighths(2, FIG),                      // a, a (exact)
    ...eighths(3, FIG.map(p => p + 2)),                          // a′ (+2)
    ...eighths(4, [60, 64, 62, 67]),                             // a″ (same rhythm, other pitches)
    ...eighths(5, [55, 57]),                                     // b
    ...eighths(7, FIG.map(p => p + 5)),                          // a′ (+5)
    ...eighths(8, FIG.map(p => p + 7)),                          // a′ (+7)   7→8 +2
    ...eighths(9, FIG.map(p => p + 9)),                          // a′ (+9)   8→9 +2  → sequence of 3
  ],
});

test("facts/form: bar labels — letter, ′ transposed (with the interval), ″ rhythm-only, - empty", () => {
  const r = formFacts(FORM_DOC);
  assert.equal(r.barString, "a a a′ a″ b - a′ a′ a′");
  assert.deepEqual(r.bars.map(b => b.rel.kind), ["new", "exact", "transposed", "rhythm", "new", "empty", "transposed", "transposed", "transposed"]);
  assert.equal(r.bars[2].rel.interval, 2);
  assert.equal(r.bars[6].rel.interval, 5);
  assert.equal(r.bars[2].rel.of, "1.1");
  assert.equal(r.bars[1].bar, 2);
});

test("facts/form: repeats list each bar's earliest match, exact over transposed over rhythm-only", () => {
  const r = formFacts(FORM_DOC);
  assert.deepEqual(r.repeats, [
    {at: "2.1", of: "1.1", kind: "exact", interval: 0},
    {at: "3.1", of: "1.1", kind: "transposed", interval: 2},
    {at: "4.1", of: "1.1", kind: "rhythm", interval: null},
    {at: "7.1", of: "1.1", kind: "transposed", interval: 5},
    {at: "8.1", of: "1.1", kind: "transposed", interval: 7},
    {at: "9.1", of: "1.1", kind: "transposed", interval: 9},
  ]);
});

test("facts/form: sequences — a unit restated at successive non-zero transpositions, ≥ 3 statements", () => {
  const r = formFacts(FORM_DOC);
  const bars1 = r.sequences.filter(s => s.unitBars === 1);
  assert.deepEqual(bars1, [{unitBars: 1, from: "7.1", to: "10.1", statements: 3, intervals: [2, 2]}]);
  assert.equal(formFacts(FORM_DOC, {minStatements: 4}).sequences.filter(s => s.unitBars === 1).length, 0);
  // bars 1→2 is an EXACT repeat (interval 0): never a sequence step
  assert.equal(r.sequences.some(s => s.from === "1.1"), false);
});

test("facts/form: phrases — explicit length, or auto (the length with the most phrase repeats)", () => {
  const two = formFacts(FORM_DOC, {phraseBars: 2});
  assert.equal(two.phrases.phraseBars, 2);
  assert.equal(two.phrases.auto, false);
  assert.equal(two.phrases.list[0].bars, "1–2");
  assert.equal(two.phrases.formString.split(" ")[0], "A");
  const song = mkDoc({m: [...eighths(1, FIG), ...eighths(2, [67, 65]), ...eighths(3, FIG), ...eighths(4, [60]),
                          ...eighths(5, FIG), ...eighths(6, [67, 65]), ...eighths(7, FIG), ...eighths(8, [60])]});
  const r = formFacts(song);
  assert.equal(r.phrases.phraseBars, 4);
  assert.equal(r.phrases.formString, "A A");
  assert.equal(r.phrases.list[1].rel.of, "1.1");
  const half = [...eighths(1, FIG), ...eighths(2, [67, 65]), ...eighths(3, FIG), ...eighths(4, [60])];
  const up = mkDoc({m: [...half, ...half.map(([b, q, d, p]) => [b + 4, q, d, p + 3])]}); // bars 5–8 = bars 1–4 a minor third up
  assert.equal(formFacts(up).phrases.formString, "A A′");
  assert.equal(formFacts(up).phrases.list[1].rel.interval, 3);
});

test("facts/form: half-bar labels, onsetsOnly comparison, track restriction, and the letter sequence", () => {
  const r = formFacts(FORM_DOC, {half: true});
  assert.equal(r.halfBars.length, 18);
  assert.equal(r.halfBars[0].label, "a");
  assert.equal(r.halfBars[2].label, "a"); // bar 2's first half = bar 1's first half
  const durs = mkDoc({m: [[1, 1, 1, 60], [1, 2, 1, 62], [2, 1, 0.5, 60], [2, 2, 0.5, 62]]});
  assert.equal(formFacts(durs).barString, "a b");
  assert.equal(formFacts(durs, {onsetsOnly: true}).barString, "a a");
  assert.equal(formFacts(PAT_DOC, {track: "lead"}).tracks.length, 1);
  // i, v and x are skipped — "I V" phrase labels would read as numerals
  assert.equal(factsLetter(0), "a"); assert.equal(factsLetter(8), "j"); assert.equal(factsLetter(22), "z"); assert.equal(factsLetter(23), "aa"); assert.equal(factsLetter(2, true), "C");
  assert.equal(/[ivx]/.test(Array.from({length: 60}, (_, i) => factsLetter(i)).join("")), false);
  assert.deepEqual(factsUnitRelation([], []), {kind: "exact", interval: 0});
  assert.equal(factsUnitRelation([{ti: 0, off: 0, d: 1, p: 60}], [{ti: 1, off: 0, d: 1, p: 60}]).kind, "none");
});

// ---- melody --------------------------------------------------------------
test("facts/melody: range with where, step/leap counts, histogram, largest leaps, contour runs and per-bar", () => {
  const doc = mkDoc({lead: [[1, 1, 1, 60], [1, 2, 1, 62], [1, 3, 1, 64], [1, 4, 1, 64], [2, 1, 1, 72], [2, 2, 1, 71], [2, 3, 1, 67], [2, 4, 1, 55]]});
  const t = melodyFacts(doc).tracks[0];
  assert.equal(t.track, "lead");
  assert.equal(t.notes, 8);
  assert.deepEqual(t.range, {low: {pitch: "G3", midi: 55, at: "2.4"}, high: {pitch: "C5", midi: 72, at: "2.1"}, semitones: 17});
  assert.equal(t.intervals.repeated, 1);
  assert.equal(t.intervals.steps, 3);   // +2 +2 -1
  assert.equal(t.intervals.leaps, 3);   // +8 -4 -12
  assert.equal(t.intervals.up, 3); assert.equal(t.intervals.down, 3);
  assert.deepEqual(t.intervals.histogram, {0: 1, 1: 1, 2: 2, 4: 1, 8: 1, 12: 1});
  assert.equal(t.intervals.largeLeaps, 2);
  assert.deepEqual(t.intervals.largest.map(l => [l.semitones, l.at, l.from, l.to]), [[-12, "2.4", "G4", "G3"], [8, "2.1", "E4", "C5"]]);
  // up run C4→C5 (the repeated E4 extends it), then one down run
  assert.deepEqual(t.contour.runs.map(r => [r.dir, r.notes, r.semitones, r.from, r.to]), [["up", 5, 12, "1.1", "2.1"], ["down", 4, 17, "2.1", "2.4"]]);
  assert.equal(t.contour.turningPoints, 1);
  assert.equal(t.contour.string, "↗5(+12) ↘4(-17)");
  assert.deepEqual(t.perBar, [{bar: 1, notes: 4, low: "C4", high: "E4"}, {bar: 2, notes: 4, low: "G3", high: "C5"}]);
  assert.equal(melodyFacts(doc, {leap: 4}).tracks[0].intervals.largeLeaps, 3);
});

test("facts/melody: tessitura is duration-weighted, spans restrict, the top line of a chordal track is read, empty spans say so", () => {
  const doc = mkDoc({m: [[1, 1, 3, 60], [1, 4, 0.5, 72], [1, 4.5, 0.5, 74]]});
  const t = melodyFacts(doc).tracks[0];
  assert.equal(t.tessitura.median, "C4"); // 3q of C4 outweighs two short high notes
  assert.equal(t.tessitura.low, "C4"); assert.equal(t.tessitura.high, "C4");
  assert.equal(t.tessitura.weightedBy, "duration");
  const s = melodyFacts(doc, {from: "1.4", to: "2.1"}).tracks[0];
  assert.equal(s.notes, 2);
  assert.equal(s.range.low.pitch, "C5");
  assert.deepEqual(melodyFacts(doc, {from: "1.4", to: "2.1"}).span, {from: "1.4", to: "2.1"});
  assert.equal(melodyFacts(PAT_DOC, {track: "harmony"}).tracks[0].notes, 3); // one note per onset
  assert.equal(melodyFacts(doc, {from: "5.1", to: "6.1"}).tracks[0].notes, 0);
  assert.equal(melodyFacts(PAT_DOC).tracks.some(t => t.track === "Drums"), false);
  assert.equal(melodyFacts(mkDoc({m: [[1, 1, 1, 70]]}, {rollnotes: [{b1: 1, q1: 1, keydir: -1}]})).tracks[0].range.low.pitch, "Bb4");
});

// ---- rhythm --------------------------------------------------------------
test("facts/rhythm: density per bar, the beat grid, held-across-beat syncopation and extreme durations", () => {
  const doc = mkDoc({m: [
    [1, 1, 1, 60], [1, 2, 0.5, 62], [1, 2.5, 1, 64],           // 2.5 off-beat eighth, held across beat 3
    [1, 4, 0.25, 65], [1, 4.25, 0.25, 67], [1, 4 + 1 / 3, 0.25, 69], // a sixteenth position and an off-grid triplet
    [2, 1, 3, 60],
  ], "Drum kit": [[1, 1, 0.25, 36], [1, 3, 0.25, 36]]});
  const r = rhythmFacts(doc);
  assert.deepEqual(r.tracks.map(t => t.track), ["m", "Drum kit"]); // drums count for rhythm
  const m = r.tracks[0];
  assert.equal(m.attacks, 7);
  assert.deepEqual(m.density.perBar, [{bar: 1, attacks: 6}, {bar: 2, attacks: 1}]);
  assert.equal(m.density.mean, 3.5);
  assert.deepEqual(m.density.max, {bar: 1, attacks: 6});
  assert.deepEqual(m.grid, {onBeat: 4, downbeat: 2, offBeatEighth: 1, sixteenth: 1, offGrid: 1});
  assert.equal(m.syncopation.offBeatAttacks, 3);
  assert.equal(m.syncopation.heldAcrossBeat, 1);
  assert.deepEqual(m.syncopation.heldAcrossBeatAt, [{at: "1.2.5", pitch: "E4", quarters: 1}]);
  assert.equal(m.durations.longest.quarters, 3); assert.equal(m.durations.longest.at, "2.1");
  assert.equal(m.durations.shortest.quarters, 0.25);
  assert.deepEqual(m.durations.histogram, {0.25: 3, 0.5: 1, 1: 2, 3: 1});
  assert.equal(r.tracks[1].drums, true);
  assert.equal(r.tracks[1].syncopation.offBeatAttacks, 0);
  assert.equal(rhythmFacts(doc, {track: "m", from: "2.1"}).tracks[0].attacks, 1);
  assert.equal(r.beatTicks, PPQ);
});

test("facts/rhythm: harmonic rhythm counts the user's own chord-band changes — and is absent without bands", () => {
  const none = rhythmFacts(mkDoc({m: [[1, 1, 1, 60]]})).harmonicRhythm;
  assert.equal(none.bands, 0);
  assert.match(none.note, /no chord bands/);
  const doc = mkDoc({m: [[1, 1, 16, 60]]}, {rollnotes: [
    {b1: 1, q1: 1, b2: 1, q2: 4, chord: true, text: "C"}, {b1: 2, q1: 1, b2: 2, q2: 2, chord: true, text: "F"},
    {b1: 2, q1: 3, b2: 2, q2: 4, chord: true, text: "G"}, {b1: 3, q1: 1, b2: 4, q2: 4, chord: true, text: "C"},
  ]});
  const h = rhythmFacts(doc).harmonicRhythm;
  assert.equal(h.bands, 4); assert.equal(h.changes, 4);
  assert.equal(h.changesPerBar, 1);
  assert.equal(h.meanBeatsPerBand, 4); // (4 + 2 + 2 + 8) / 4
  assert.deepEqual(h.bandLengthHistogram, {2: 2, 4: 1, 8: 1});
  assert.deepEqual(h.changesPerBarHistogram, {0: 1, 1: 2, 2: 1});
  assert.deepEqual(h.changesAt.map(c => [c.at, c.beats, c.gapToNext]), [["1.1", 4, 4], ["2.1", 2, 2], ["2.3", 2, 2], ["3.1", 8, null]]);
  assert.equal(JSON.stringify(h).includes('"C"'), false); // spans only, never the band's text
  assert.equal(rhythmFacts(doc, {from: "2.1", to: "3.1"}).harmonicRhythm.changes, 2);
});

// ---- bass ----------------------------------------------------------------
test("facts/bass: lowest sounding note per beat across tracks, ringing vs onset, silence, motion kinds", () => {
  const doc = mkDoc({
    lead: [[1, 1, 4, 72]],
    bass: [[1, 1, 2, 48], [1, 3, 1, 50], [2, 1, 1, 55], [2, 2, 1, 55], [2, 4, 1, 43]],
  });
  const r = bassFacts(doc);
  assert.deepEqual(r.perBeat.map(b => [b.at, b.pitch, b.onset]), [
    ["1.1", "C3", true], ["1.2", "C3", false], ["1.3", "D3", true], ["1.4", "C5", false] /* only the lead sounds, ringing since 1.1 */,
    ["2.1", "G3", true], ["2.2", "G3", true], ["2.3", null, false], ["2.4", "G2", true],
  ]);
  assert.equal(r.perBeat[1].track, "bass");
  assert.deepEqual(r.motion.list.map(m => [m.at, m.semitones, m.kind]), [["1.2", 0, "repeated"], ["1.3", 2, "step"], ["1.4", 22, "leap"], ["2.1", -17, "leap"], ["2.2", 0, "repeated"]]);
  assert.deepEqual(r.motion.counts, {repeated: 2, step: 1, leap: 2, up: 2, down: 1});
  assert.equal(r.perChordBand, null);
  assert.deepEqual(bassFacts(doc, {track: "bass", from: "1.3", to: "2.1"}).perBeat.map(b => b.pitch), ["D3", null]);
});

test("facts/bass: pedal points — held or repeated, pitch-class with octave changes noted, below N beats not reported", () => {
  const doc = mkDoc({bass: [[1, 1, 4, 48], [2, 1, 1, 48], [2, 2, 1, 48], [2, 3, 1, 60], [2, 4, 1, 48], [3, 1, 1, 50], [3, 2, 1, 50], [3, 3, 1, 50]]},
    {rollnotes: [{b1: 1, q1: 1, b2: 1, q2: 4, chord: true, text: "x"}, {b1: 2, q1: 1, b2: 3, q2: 4, chord: true, text: "y"}]});
  const r = bassFacts(doc);
  assert.deepEqual(r.pedals, [{pitch: "C3", pitchClass: "C", from: "1.1", to: "2.4", beats: 8, samePitch: false, mode: "repeated"}]);
  const held = bassFacts(mkDoc({b: [[1, 1, 6, 40]]})).pedals[0];
  assert.equal(held.mode, "held"); assert.equal(held.beats, 6); assert.equal(held.samePitch, true);
  assert.equal(bassFacts(doc, {pedalBeats: 3}).pedals.length, 2);
  assert.deepEqual(r.perChordBand, [{at: "1.1", to: "2.1", lowest: "C3", track: "bass"}, {at: "2.1", to: "4.1", lowest: "C3", track: "bass"}]);
});

// ---- voices --------------------------------------------------------------
test("facts/voices: parallel perfect fifths and octaves/unisons by interval class, in the same direction only", () => {
  const doc = mkDoc({
    upper: [[1, 1, 1, 60], [1, 2, 1, 62], [1, 3, 1, 64], [1, 4, 1, 65], [2, 1, 1, 67], [2, 2, 1, 69]],
    lower: [[1, 1, 1, 53], [1, 2, 1, 55], [1, 3, 1, 52], [1, 4, 1, 53], [2, 1, 1, 43], [2, 2, 1, 45]],
  });
  const r = voiceFacts(doc);
  assert.deepEqual(r.lines, ["upper", "lower"]);
  const p = r.pairs[0];
  assert.deepEqual(p.voices, ["upper", "lower"]);
  // 1.1→1.2 C4/F3 → D4/G3: fifths, both up; 1.3→1.4 E4/E3 → F4/F3: octaves; 2.1→2.2 G4/G2 → A4/A2: compound octaves
  assert.deepEqual(p.parallelFifths.map(e => [e.from, e.to, e.pitches, e.direction, e.interval]), [["1.1", "1.2", "C4/F3 → D4/G3", "up", "perfect fifth"]]);
  assert.deepEqual(p.parallelOctaves.map(e => [e.from, e.to, e.interval]), [["1.3", "1.4", "octave"], ["2.1", "2.2", "octave"]]);
  assert.equal(r.totals.parallelFifths, 1); assert.equal(r.totals.parallelOctaves, 2);
  // contrary motion through fifths is not parallel
  const contrary = voiceFacts(mkDoc({u: [[1, 1, 1, 60], [1, 2, 1, 62]], l: [[1, 1, 1, 53], [1, 2, 1, 43]]}));
  assert.equal(contrary.totals.parallelFifths, 0);
  // oblique (one voice holds) is not parallel; unison doubling is named so
  const uni = voiceFacts(mkDoc({u: [[1, 1, 1, 60], [1, 2, 1, 62]], l: [[1, 1, 1, 60], [1, 2, 1, 62]]}));
  assert.equal(uni.pairs[0].parallelOctaves[0].interval, "unison");
  const compound = voiceFacts(mkDoc({u: [[1, 1, 1, 72], [1, 2, 1, 74]], l: [[1, 1, 1, 53], [1, 2, 1, 55]]}));
  assert.equal(compound.pairs[0].parallelFifths[0].interval, "perfect fifth (compound)");
});

test("facts/voices: crossing spans, overlaps, large leaps per line, polyphonic tracks as rank voices", () => {
  const doc = mkDoc({
    upper: [[1, 1, 1, 64], [1, 2, 1, 55], [1, 3, 1, 57], [1, 4, 1, 67], [2, 1, 1, 60]],
    lower: [[1, 1, 1, 60], [1, 2, 1, 60], [1, 3, 1, 60], [1, 4, 1, 62], [2, 1, 1, 48]],
  });
  const p = voiceFacts(doc).pairs[0];
  assert.deepEqual(p.crossings, [{from: "1.2", to: "1.3", pitches: "G3/C4"}]); // consecutive crossed beats merge
  // 1.4→2.1: both uncrossed, the upper lands (C4) below where the lower just was (D4)
  assert.deepEqual(p.overlaps.map(o => [o.from, o.to, o.mover, o.pitches]), [["1.4", "2.1", "upper", "G4/D4 → C4/C3"]]);
  const ov = voiceFacts(mkDoc({u: [[1, 1, 1, 67], [1, 2, 1, 62]], l: [[1, 1, 1, 64], [1, 2, 1, 60]]})).pairs[0]; // upper lands below lower's E4
  assert.deepEqual(ov.overlaps.map(o => [o.from, o.to, o.mover]), [["1.1", "1.2", "u"]]);
  const r = voiceFacts(doc, {leap: 9});
  assert.deepEqual(r.leaps.list.map(l => [l.line, l.at, l.semitones]), [["upper", "1.2", -9], ["upper", "1.4", 10], ["lower", "2.1", -14]]);
  assert.equal(r.leaps.threshold, 9);
  assert.equal(voiceFacts(doc).leaps.count, 4);
  const poly = voiceFacts(PAT_DOC, {track: ["harmony"]});
  assert.deepEqual(poly.lines, ["harmony/v1", "harmony/v2"]);
  assert.equal(voiceFacts(doc, {from: "2.1"}).leaps.list.length, 2); // both lines leap into 2.1
});

// ---- format --------------------------------------------------------------
test("facts/format: every formatter renders its result as text; an unknown kind throws", () => {
  const pat = findPattern(PAT_DOC, {intervals: [2, 2, 1], anchorPitch: 60});
  const t = formatFacts("pattern", pat);
  assert.match(t, /intervals \[\+2 \+2 \+1\]/); assert.match(t, /2 hits/); assert.match(t, /2\.1–2\.3  lead  from G4  \(\+7 semitones\)/); assert.match(t, /by transposition: same pitch ×1, \+7 ×1/);
  const f = formatFacts("form", formFacts(FORM_DOC));
  assert.match(f, /bars: {4}a a a′ a″ b - a′ a′ a′/); assert.match(f, /3\.1 = 1\.1 \+2 semitones/); assert.match(f, /7\.1–10\.1  unit 1 bar, 3 statements, steps \+2 \+2/);
  const m = formatFacts("melody", melodyFacts(PAT_DOC, {track: "lead"}));
  assert.match(m, /lead:\n  18 notes \(top line\)  range C4@1\.1 – D5@2\.3 \(14 semitones\)/); assert.match(m, /per bar: 1:C4–G4/);
  const r = formatFacts("rhythm", rhythmFacts(PAT_DOC));
  assert.match(r, /Drums \(drums\):/); assert.match(r, /harmonic rhythm: no chord bands/);
  const b = formatFacts("bass", bassFacts(PAT_DOC));
  assert.match(b, /lowest per beat/); assert.match(b, /1\.1:C3/);
  const v = formatFacts("voices", voiceFacts(PAT_DOC));
  assert.match(v, /totals: \d+ parallel perfect fifths/);
  assert.throws(() => formatFacts("harmony", {}), /no formatter for harmony/);
  assert.deepEqual(Object.keys(FACTS_FORMATTERS), ["pattern", "form", "melody", "rhythm", "bass", "voices"]);
});

// ---- real songs through the app's own parser ------------------------------
// Learning mode is the law: none of these may ever surface. Pitch names
// carry an octave digit (G4, Bb3), chord/key names and numerals a quality
// word or suffix — so the nets look for the suffixes. The one blind spot is
// a bare "G7"/"E6": that IS the pitch name of MIDI 103/88 and the toolkit
// must be free to print it, so digit-only suffixes are not in CHORD_NAME.
const KEY_NAME = /\b[A-G][#b♯♭]?\s?(major|minor|maj|min|dorian|phrygian|lydian|mixolydian|aeolian|ionian|locrian)\b|\bkey\s*[:=]|\b[A-G][#b]?m\b/i;
const CHORD_NAME = /\b[A-G][#b♯♭]?\d{0,2}(maj7|maj9|m7|m9|m6|dim7?|aug|sus[24]?|add\d|°|ø)(?![0-9])\b|\b[A-G][#b]?\/[A-G]\b|\bN\.C\./;
const ROMAN = /(^|[\s(–\-])(I|II|III|IV|V|VI|VII|i|ii|iii|iv|v|vi|vii)(°|ø|7|\b)(?=[\s).,;:–\-]|$)/;
const METER = /\b\d{1,2}\/(1|2|4|8|16|32)\b/;
const VERDICT = /\b(cadence|tonic|dominant|subdominant|leading[- ]tone|resolv|modulat|secondary|borrowed|deceptive|plagal)\w*/i;
function assertFactsOnly(label, text) {
  for (const [name, re] of [["key name", KEY_NAME], ["chord name", CHORD_NAME], ["roman numeral", ROMAN], ["meter", METER], ["verdict word", VERDICT]]) {
    const m = text.match(re);
    assert.equal(m, null, label + " leaks a " + name + ": " + JSON.stringify(m && m[0]) + " …" + (m ? text.slice(Math.max(0, m.index - 40), m.index + 40) : ""));
  }
}
function allFacts(doc) {
  const first = doc.tracks.find(t => !/drum|noise|percussion|kit/i.test(t.name));
  const lifted = factsPatternFromSpan(doc, {track: first.name, from: "1.1", to: "3.1"});
  return {
    pattern: {...findPattern(doc, lifted), source: lifted.source},
    form: formFacts(doc, {half: true}),
    melody: melodyFacts(doc),
    rhythm: rhythmFacts(doc),
    bass: bassFacts(doc),
    voices: voiceFacts(doc),
  };
}

test("facts: the nets themselves catch what they must (and let pitch names through)", () => {
  assert.throws(() => assertFactsOnly("x", "this is in G major"), /key name/);
  assert.throws(() => assertFactsOnly("x", "bar 3 is Am"), /key name/);
  assert.throws(() => assertFactsOnly("x", "Dm7/C here"), /chord name|key name/);
  assert.throws(() => assertFactsOnly("x", "G7sus4 at 2.1"), /chord name/);
  assert.throws(() => assertFactsOnly("x", "Bdim here"), /chord name/);
  assert.throws(() => assertFactsOnly("x", "a ii–V–I turnaround"), /roman numeral/);
  assert.throws(() => assertFactsOnly("x", "V7 then I"), /roman numeral/);
  assert.throws(() => assertFactsOnly("x", "the meter is 6/8"), /meter/);
  assert.throws(() => assertFactsOnly("x", "a deceptive cadence"), /verdict/);
  assertFactsOnly("ok", "G4@1.1 – Bb3@2.2 (7 semitones) arpeggio/v1 C4/E4 → D4/F4 1.1.75 40 attacks / 40 notes E6@22.2 a b c′ d″ j k A A′ B″");
});

test("facts: FF1 Overworld through the app's parser — every command runs, reports facts, and nothing in text or JSON names a key, chord, numeral or meter", async () => {
  const doc = await loadSong("albums/nes/final-fantasy-i/songs/overworld");
  assert.equal(doc.rollnotes.some(n => typeof n.keydir === "number"), true); // his key: annotation spells, nothing more
  const all = allFacts(doc);
  assert.ok(all.pattern.hits.length >= 1 && all.pattern.hits.some(h => h.transposition === 0), "the lifted span finds at least itself");
  assert.equal(all.form.bars.length, 16);
  assert.equal(all.form.bars[6].rel.kind, "transposed"); // bar 7 = bar 3 a step up (the file's own event lists say so)
  assert.equal(all.form.bars[6].rel.interval, 2);
  assert.deepEqual(all.melody.tracks.map(t => t.track), ["pulse1", "pulse2", "triangle"]);
  assert.equal(all.melody.tracks[0].range.semitones, 12);
  assert.equal(all.rhythm.harmonicRhythm.bands, 0); // no chord bands in that file
  assert.equal(all.bass.perBeat.length, 65);
  assert.equal(all.bass.pedals.length, 4);
  assert.ok(all.voices.pairs.length === 3);
  for (const [kind, result] of Object.entries(all)) {
    const text = formatFacts(kind, result);
    assert.ok(text.length > 40, kind + " text");
    assertFactsOnly("overworld " + kind + " text", text);
    assertFactsOnly("overworld " + kind + " json", JSON.stringify(result));
  }
});

test("facts: Bach Prelude starter (chord bands annotated, polyphonic arpeggio) — harmonic rhythm counts his bands without naming one; nothing leaks", async () => {
  const doc = await loadSong("albums/starters/bach-prelude-in-c");
  const bands = doc.rollnotes.filter(n => n.chord).length;
  assert.ok(bands >= 30, "the starter ships chord bands");
  const all = allFacts(doc);
  assert.equal(all.rhythm.harmonicRhythm.bands, bands);
  assert.equal(all.rhythm.harmonicRhythm.changesPerBar, 1);
  assert.equal(all.bass.perChordBand.length, bands);
  assert.equal(all.form.bars[1].rel.kind, "rhythm"); // every bar breaks its chord the same way
  assert.equal(all.form.bars[3].rel.kind, "exact");  // bar 4 restates bar 1's notes
  assert.ok(all.voices.lines.some(l => /\/v2$/.test(l)), "the arpeggio's overlapping notes split into rank voices");
  for (const [kind, result] of Object.entries(all)) {
    assertFactsOnly("bach " + kind + " text", formatFacts(kind, result));
    assertFactsOnly("bach " + kind + " json", JSON.stringify(result));
  }
});

test("facts: tools/theory.mjs runs end to end (--json) on a starter", () => {
  const r = spawnSync(process.execPath, ["--experimental-vm-modules", "tools/theory.mjs", "albums/starters/fur-elise", "melody", "--json"], {cwd: ROOT, encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr);
  // the harness's own "[debug] song open" console line shares stdout
  const stdout = r.stdout.split("\n").filter(l => !l.startsWith("[debug]")).join("\n");
  const out = JSON.parse(stdout);
  assert.equal(out.command, "melody");
  assert.equal(out.song, "albums/starters/fur-elise.mid");
  assert.ok(out.tracks.length >= 1 && out.tracks[0].range.semitones > 0);
  assertFactsOnly("cli melody json", stdout);
  const usage = spawnSync(process.execPath, ["--experimental-vm-modules", "tools/theory.mjs", "albums/starters/fur-elise", "harmony"], {cwd: ROOT, encoding: "utf8"});
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /usage: theory.mjs/);
});
