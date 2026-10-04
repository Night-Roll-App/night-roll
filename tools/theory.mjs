// tools/theory.mjs <song> <command> [opts] [--json]
// The music-theory FACTS toolkit (src/theory/facts/, docs/theory-toolkit.md)
// on a song loaded through the app's own parser (tools/query-lib.mjs, the
// same loader as at.mjs/span.mjs) with its rollnotes. Facts only: where a
// figure recurs, which bars repeat, ranges, densities, bass motion,
// parallel intervals — never a key, a chord name, a numeral or a meter.
//
//   pattern  --intervals "2,2,-1" [--rhythm "1,1,2"] | --from <bar.beat> --to <bar.beat> [--track T] [--voice N]
//            [--collapse] [--octave] [--with-rhythm] [--scale] [--drums] [--library <dir>]   (library: every .mid under dir)
//   form     [--track T] [--from --to] [--half] [--phrase N] [--min-statements N] [--onsets-only]
//   melody   [--track T] [--from --to] [--leap N]
//   rhythm   [--track T] [--from --to]
//   bass     [--track T] [--from --to] [--pedal-beats N]
//   voices   [--track T] [--from --to] [--leap N]
// <song> = a bare name (resolved under albums/) or a path, with or without .mid.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { loadSong, ROOT, outJson } from "./query-lib.mjs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { findPattern, factsPatternFromSpan } from "../src/theory/facts/pattern.js";
import { formFacts } from "../src/theory/facts/form.js";
import { melodyFacts } from "../src/theory/facts/melody.js";
import { rhythmFacts } from "../src/theory/facts/rhythm.js";
import { bassFacts } from "../src/theory/facts/bass.js";
import { voiceFacts } from "../src/theory/facts/voices.js";
import { formatFacts, formatPattern } from "../src/theory/facts/format.js";

const argv = process.argv.slice(2);
const flags = {}, positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) { positional.push(a); continue; }
  const key = a.slice(2);
  const BOOL = ["json", "collapse", "octave", "scale", "with-rhythm", "drums", "half", "onsets-only"];
  if (BOOL.includes(key)) flags[key] = true; else flags[key] = argv[++i];
}
const [songArg, command] = positional;
const COMMANDS = ["pattern", "form", "melody", "rhythm", "bass", "voices"];
if (!songArg || !COMMANDS.includes(command)) {
  console.error("usage: theory.mjs <song> <" + COMMANDS.join("|") + "> [opts] [--json]  (see the header of tools/theory.mjs)");
  process.exit(1);
}
const nums = s => s === undefined ? null : String(s).split(/[,\s]+/).filter(Boolean).map(Number);
const trackOpt = flags.track === undefined ? undefined : flags.track;
const span = {from: flags.from, to: flags.to};

const doc = await loadSong(songArg);
let result, text;
if (command === "pattern") {
  let pat;
  if (flags.intervals || flags.rhythm) pat = {intervals: nums(flags.intervals), rhythm: nums(flags.rhythm), anchorPitch: null};
  else if (flags.from && flags.to) pat = factsPatternFromSpan(doc, {track: trackOpt, voice: flags.voice === undefined ? null : Number(flags.voice), from: flags.from, to: flags.to, collapseRepeats: !!flags.collapse});
  else { console.error("pattern needs --intervals (and/or --rhythm), or --from/--to to lift the pattern from the song itself"); process.exit(1); }
  // a lifted span matches by intervals alone unless --with-rhythm (exact
  // inter-onset times) or --scale (the same proportions) asks for its rhythm too
  const rhythm = flags.rhythm ? nums(flags.rhythm) : (flags["with-rhythm"] || flags.scale) ? pat.rhythm : null;
  const opts = {intervals: pat.intervals, rhythm, collapseRepeats: !!flags.collapse, octaveEquiv: !!flags.octave,
    rhythmScale: !!flags.scale, drums: !!flags.drums, anchorPitch: pat.anchorPitch};
  if (flags.library) {
    // every .mid under the directory (compositions are READ here, never written)
    const dir = path.isAbsolute(flags.library) ? flags.library : path.join(ROOT, flags.library);
    const files = [];
    (function walk(d) { for (const f of readdirSync(d, {withFileTypes: true})) { if (f.isDirectory()) walk(path.join(d, f.name)); else if (f.name.endsWith(".mid")) files.push(path.join(d, f.name)); } })(dir);
    result = {pattern: opts, source: pat.source || null, songs: []};
    text = "";
    for (const f of files.sort()) {
      let d2;
      try { d2 = f === path.join(ROOT, doc.path) ? doc : await loadSong(f); } catch (e) { continue; }
      const r = findPattern(d2, opts);
      if (!r.hits.length) continue;
      result.songs.push({song: d2.path, hits: r.hits});
      text += d2.path + ": " + r.hits.length + " hit" + (r.hits.length === 1 ? "" : "s") + "  " + r.hits.slice(0, 12).map(h => h.at + " " + h.track + (h.voice === null ? "" : "/v" + (h.voice + 1))).join(", ") + (r.hits.length > 12 ? " …" : "") + "\n";
    }
    if (!result.songs.length) text = "no hits in " + files.length + " songs under " + flags.library + "\n";
  } else {
    result = {...findPattern(doc, opts), source: pat.source || null};
    text = formatPattern(result);
  }
} else if (command === "form") {
  result = formFacts(doc, {track: trackOpt, ...span, half: !!flags.half, phraseBars: flags.phrase, minStatements: flags["min-statements"] ? Number(flags["min-statements"]) : undefined, onsetsOnly: !!flags["onsets-only"]});
} else if (command === "melody") {
  result = melodyFacts(doc, {track: trackOpt, ...span, leap: flags.leap ? Number(flags.leap) : undefined});
} else if (command === "rhythm") {
  result = rhythmFacts(doc, {track: trackOpt, ...span});
} else if (command === "bass") {
  result = bassFacts(doc, {track: trackOpt, ...span, pedalBeats: flags["pedal-beats"] ? Number(flags["pedal-beats"]) : undefined});
} else if (command === "voices") {
  result = voiceFacts(doc, {track: trackOpt, ...span, leap: flags.leap ? Number(flags.leap) : undefined});
}
if (text === undefined) text = formatFacts(command, result);
outJson(!!flags.json, {song: doc.path, command, ...result}, () => doc.path + " " + command + "\n" + text);
