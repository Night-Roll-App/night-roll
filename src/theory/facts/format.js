// src/theory/facts/format.js — the facts as short text (one formatter per
// result kind, plus formatFacts(kind, result)). Mirrors the query tools'
// text style: bar.beat locations, pitch names as the result spelled them.
// Nothing here may print a key name, a chord name, a roman numeral or a
// meter — tests/theory.test.mjs sweeps every formatter's output for those.
import { factsHitsByTransposition } from "./pattern.js";

export function factsSigned(n) { return n > 0 ? "+" + n : String(n); }
export function factsRows(list, fn, cap = 40) {
  const rows = list.slice(0, cap).map(fn);
  if (list.length > cap) rows.push("  … " + (list.length - cap) + " more (--json for all)");
  return rows;
}

export function formatPattern(r) {
  const p = r.pattern;
  const lines = [];
  lines.push("pattern: " + (p.intervals ? "intervals [" + p.intervals.map(factsSigned).join(" ") + "]" : "any intervals")
    + (p.rhythm ? ", rhythm [" + p.rhythm.join(" ") + "]q" + (p.rhythmScale ? " (proportional)" : "") : "")
    + (p.collapseRepeats ? ", repeated pitches collapsed" : "") + (p.octaveEquiv ? ", octave displacement allowed" : ""));
  if (r.source) lines.push("  from " + r.source.track + (r.source.voice !== null && r.source.voice !== undefined ? "/v" + (r.source.voice + 1) : "") + " " + r.source.from + "–" + r.source.to);
  lines.push("searched: " + r.linesSearched.join(", "));
  lines.push(r.hits.length + " hit" + (r.hits.length === 1 ? "" : "s"));
  for (const h of r.hits.slice(0, 60))
    lines.push("  " + h.at + "–" + h.endAt + "  " + h.track + (h.voice === null ? "" : "/v" + (h.voice + 1)) + "  from " + h.startPitch
      + (h.transposition === null ? "" : "  (" + (h.transposition === 0 ? "same pitch" : factsSigned(h.transposition) + " semitones") + ")"));
  if (r.hits.length > 60) lines.push("  … " + (r.hits.length - 60) + " more (--json for all)");
  if (r.hits.length > 1) {
    const by = factsHitsByTransposition(r.hits);
    lines.push("by transposition: " + by.map(g => (r.hits[0].transposition === null ? "from midi " + g.shift : g.shift === 0 ? "same pitch" : factsSigned(g.shift)) + " ×" + g.count).join(", "));
  }
  return lines.join("\n") + "\n";
}

export function formatForm(r) {
  const lines = [];
  lines.push("tracks: " + r.tracks.join(", "));
  lines.push("bars:    " + r.barString + "   (letter = same as its first statement; ′ transposed; ″ same rhythm, other pitches; - empty; no i/v/x)");
  if (r.halfBars) lines.push("half-bars: " + r.halfBars.map(h => h.label).join(" "));
  lines.push("phrases (" + r.phrases.phraseBars + " bars" + (r.phrases.auto ? ", auto" : "") + "): " + r.phrases.formString);
  for (const p of r.phrases.list) lines.push("  " + p.label.padEnd(3) + " bars " + p.bars + (p.rel.kind === "transposed" ? "  = " + p.rel.of + " " + factsSigned(p.rel.interval) + " semitones" : p.rel.kind === "exact" ? "  = " + p.rel.of : p.rel.kind === "rhythm" ? "  rhythm of " + p.rel.of : ""));
  const kinds = {exact: [], transposed: [], rhythm: []};
  for (const x of r.repeats) kinds[x.kind].push(x);
  lines.push("bar repeats: " + kinds.exact.length + " exact, " + kinds.transposed.length + " transposed, " + kinds.rhythm.length + " rhythm-only");
  lines.push(...factsRows(kinds.transposed, x => "  " + x.at + " = " + x.of + " " + factsSigned(x.interval) + " semitones", 24));
  lines.push(...factsRows(kinds.rhythm, x => "  " + x.at + " rhythm of " + x.of, 12));
  lines.push("sequences (≥3 statements at successive transpositions): " + (r.sequences.length || "none"));
  for (const s of r.sequences) lines.push("  " + s.from + "–" + s.to + "  unit " + s.unitBars + " bar" + (s.unitBars === 1 ? "" : "s") + ", " + s.statements + " statements, steps " + s.intervals.map(factsSigned).join(" "));
  return lines.join("\n") + "\n";
}

export function formatMelody(r) {
  const lines = ["span " + r.span.from + (r.span.to ? "–" + r.span.to : "–end")];
  for (const t of r.tracks) {
    lines.push(t.track + ":");
    if (!t.notes) { lines.push("  (no notes in span)"); continue; }
    lines.push("  " + t.notes + " notes (top line)  range " + t.range.low.pitch + "@" + t.range.low.at + " – " + t.range.high.pitch + "@" + t.range.high.at + " (" + t.range.semitones + " semitones)");
    lines.push("  tessitura (middle half by duration) " + t.tessitura.low + "–" + t.tessitura.high + ", median " + t.tessitura.median);
    const iv = t.intervals;
    lines.push("  motion: " + iv.repeated + " repeated, " + iv.steps + " steps, " + iv.leaps + " leaps (" + iv.up + " up, " + iv.down + " down); " + iv.largeLeaps + " of ≥" + iv.leapThreshold + " semitones");
    lines.push("  interval histogram (semitones×count): " + Object.keys(iv.histogram).map(Number).sort((a, b) => a - b).map(k => k + "×" + iv.histogram[k]).join(" "));
    if (iv.largest.length) lines.push("  largest: " + iv.largest.slice(0, 5).map(l => factsSigned(l.semitones) + " " + l.from + "→" + l.to + "@" + l.at).join(", "));
    lines.push("  contour: " + t.contour.runs.length + " runs, " + t.contour.turningPoints + " turning points"
      + (t.contour.longestUp ? "; longest up " + t.contour.longestUp.fromPitch + "→" + t.contour.longestUp.toPitch + " (" + t.contour.longestUp.from + "–" + t.contour.longestUp.to + ")" : "")
      + (t.contour.longestDown ? "; longest down " + t.contour.longestDown.fromPitch + "→" + t.contour.longestDown.toPitch + " (" + t.contour.longestDown.from + "–" + t.contour.longestDown.to + ")" : ""));
    lines.push("  " + t.contour.string);
    lines.push("  per bar: " + t.perBar.map(b => b.bar + ":" + b.low + "–" + b.high).join(" "));
  }
  return lines.join("\n") + "\n";
}

export function formatRhythm(r) {
  const lines = ["span " + r.span.from + (r.span.to ? "–" + r.span.to : "–end") + "  (beat = " + r.beatTicks + " ticks, bar = " + r.barTicks + " ticks)"];
  for (const t of r.tracks) {
    lines.push(t.track + (t.drums ? " (drums)" : "") + ":");
    if (!t.notes) { lines.push("  (no notes in span)"); continue; }
    lines.push("  " + t.attacks + " attacks / " + t.notes + " notes; per bar mean " + t.density.mean + ", max " + t.density.max.attacks + " (bar " + t.density.max.bar + "), min " + t.density.min.attacks + " (bar " + t.density.min.bar + ") over " + t.density.barsWithAttacks + " bars with attacks");
    lines.push("  grid (by the beat unit): " + t.grid.onBeat + " on the beat (" + t.grid.downbeat + " on bar lines), " + t.grid.halfBeat + " at half-beats, " + t.grid.quarterBeat + " at quarter-beats, " + t.grid.thirdBeat + " at triplet thirds, " + t.grid.offGrid + " off those grids");
    lines.push("  off the beat: " + t.syncopation.offBeatAttacks + " attacks (" + Math.round(t.syncopation.offBeatFraction * 100) + "%), " + t.syncopation.heldAcrossBeat + " held across the next beat line"
      + (t.syncopation.heldAcrossBeatAt.length ? " — " + t.syncopation.heldAcrossBeatAt.slice(0, 6).map(h => h.pitch + "@" + h.at).join(" ") : ""));
    lines.push("  durations: longest " + t.durations.longest.quarters + "q " + t.durations.longest.pitch + "@" + t.durations.longest.at + ", shortest " + t.durations.shortest.quarters + "q " + t.durations.shortest.pitch + "@" + t.durations.shortest.at
      + "; histogram " + Object.keys(t.durations.histogram).map(Number).sort((a, b) => a - b).map(k => k + "q×" + t.durations.histogram[k]).join(" "));
    lines.push("  attacks per bar: " + t.density.perBar.map(b => b.bar + ":" + b.attacks).join(" "));
  }
  const h = r.harmonicRhythm;
  if (!h.bands) lines.push("harmonic rhythm: " + h.why);
  else {
    lines.push("harmonic rhythm (the user's chord bands): " + h.changes + " changes over " + h.bands + " bands, " + h.changesPerBar + " per bar, mean " + h.meanBeatsPerBand + " beats per band");
    lines.push("  band lengths (beats×count): " + Object.keys(h.bandLengthHistogram).map(Number).sort((a, b) => a - b).map(k => k + "×" + h.bandLengthHistogram[k]).join(" ")
      + "; bars by change count: " + Object.keys(h.changesPerBarHistogram).map(Number).sort((a, b) => a - b).map(k => k + "→" + h.changesPerBarHistogram[k] + " bars").join(", "));
    lines.push("  changes at: " + h.changesAt.map(c => c.at).join(" "));
  }
  return lines.join("\n") + "\n";
}

export function formatBass(r) {
  const lines = ["span " + r.span.from + "–" + r.span.to + "  tracks: " + r.tracks.join(", ")];
  const sounding = r.perBeat.filter(b => b.midi !== null);
  lines.push("lowest per beat (" + sounding.length + " of " + r.perBeat.length + " beats sounding): " + r.perBeat.map(b => b.at + ":" + (b.pitch === null ? "·" : b.pitch + (b.onset ? "" : "~"))).join(" ") + "   (~ = ringing in from before the beat)");
  const c = r.motion.counts;
  lines.push("motion beat to beat: " + c.repeated + " repeated, " + c.step + " steps, " + c.leap + " leaps (" + c.up + " up, " + c.down + " down)");
  const leaps = r.motion.list.filter(m => m.kind === "leap");
  if (leaps.length) lines.push("  leaps: " + leaps.slice(0, 20).map(m => m.from + "→" + m.to + "(" + factsSigned(m.semitones) + ")@" + m.at).join(" ") + (leaps.length > 20 ? " …" : ""));
  lines.push("pedal points (one pitch class ≥ N beats): " + (r.pedals.length || "none"));
  for (const p of r.pedals) lines.push("  " + p.pitchClass + " " + p.from + "–" + p.to + " (" + p.beats + " beats, " + p.how + (p.samePitch ? "" : ", octave changes") + ")");
  if (r.perChordBand) lines.push("lowest under each chord band: " + r.perChordBand.map(b => b.at + ":" + (b.lowest || "·")).join(" "));
  return lines.join("\n") + "\n";
}

export function formatVoices(r) {
  const lines = ["span " + r.span.from + (r.span.to ? "–" + r.span.to : "–end") + "  lines: " + r.lines.join(", ")];
  const t = r.totals;
  lines.push("totals: " + t.parallelFifths + " parallel perfect fifths, " + t.parallelOctaves + " parallel octaves/unisons, " + t.crossings + " crossings, " + t.overlaps + " overlaps; " + r.leaps.count + " leaps ≥" + r.leaps.threshold + " semitones");
  for (const p of r.pairs) {
    if (!p.parallelFifths.length && !p.parallelOctaves.length && !p.crossings.length && !p.overlaps.length) continue;
    lines.push(p.voices[0] + " / " + p.voices[1] + ":");
    lines.push(...factsRows(p.parallelFifths, e => "  parallel " + e.interval + "s " + e.from + "→" + e.to + "  " + e.pitches + " (" + e.direction + ")", 16));
    lines.push(...factsRows(p.parallelOctaves, e => "  parallel " + e.interval + "s " + e.from + "→" + e.to + "  " + e.pitches + " (" + e.direction + ")", 16));
    lines.push(...factsRows(p.crossings, e => "  crossing " + e.from + (e.to !== e.from ? "–" + e.to : "") + "  " + e.pitches, 16));
    lines.push(...factsRows(p.overlaps, e => "  overlap " + e.from + "→" + e.to + "  " + e.pitches + " (" + e.mover + " moves past)", 16));
  }
  lines.push(...factsRows(r.leaps.list, l => "  leap " + l.line + " " + l.from + "→" + l.to + " (" + factsSigned(l.semitones) + ") @" + l.at, 24));
  return lines.join("\n") + "\n";
}

export const FACTS_FORMATTERS = {pattern: formatPattern, form: formatForm, melody: formatMelody, rhythm: formatRhythm, bass: formatBass, voices: formatVoices};
export function formatFacts(kind, result) {
  const f = FACTS_FORMATTERS[kind];
  if (!f) throw new Error("no formatter for " + kind + " — one of " + Object.keys(FACTS_FORMATTERS).join(", "));
  return f(result);
}
