// tools/harmony.mjs <song> roman|cadences|nct|modulation|chromatic [--json] [--all] [--phrase N] [--track T]
// The VERDICT toolkit (docs/theory-harmony.md), as opposed to the fact tools
// beside it: every reading here is derived from what the user has already
// declared in the song's annotations — key: regions and his own chord bands.
// No key is estimated and no chord is named from the notes; a song with no
// declared key gets "no declared key governs this band" rows, not a guess.
// Learning mode is the law (CLAUDE.md): run this only when he asks for the
// specific reading, and say what it is — a reading of HIS declarations.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { loadSong, outJson } from "./query-lib.mjs";
import { factsIsDrums } from "../src/theory/facts/common.js";
import * as roman from "../src/theory/harmony/roman.js";
import { hmCadences } from "../src/theory/harmony/cadence.js";
import { hmNonChordTones } from "../src/theory/harmony/nct.js";
import { hmModulations } from "../src/theory/harmony/modulation.js";

const argv = process.argv.slice(2);
const json = argv.includes("--json"), all = argv.includes("--all");
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const phrase = opt("--phrase"), trackOpt = opt("--track");
const pos = argv.filter(a => !a.startsWith("--"));
const [songArg, what] = pos;
const WHAT = ["roman", "cadences", "nct", "modulation", "chromatic"];
if (!songArg || !WHAT.includes(what)) { console.error("usage: harmony.mjs <song> " + WHAT.join("|") + " [--json] [--all] [--phrase N] [--track T]"); process.exit(1); }

const doc = await loadSong(songArg);
const grid = {barTicks: doc.barTicks, beatTicks: doc.beatTicks};
const keys = roman.hmKeyRegionsFromNotes(doc.rollnotes);
const bands = roman.hmBandsFromNotes(doc.rollnotes);
const sections = doc.rollnotes.filter(n => n.section && n.b2).map(n => ({start: n.start, end: n.end, text: n.text})); // b2, not .end: a point section gets a drawn .end too
const tracks = doc.tracks.filter(tr => !factsIsDrums(tr)); // the app's drum rule (name, flag, channel 10)
const head = {song: doc.path, declaredKeys: keys.map(k => ({at: roman.hmBQ(grid, k.start), to: k.end === null ? null : roman.hmBQ(grid, k.end), name: k.name})), chordBands: bands.length};
const headText = o => `${o.song}\n  declared keys: ${o.declaredKeys.length ? o.declaredKeys.map(k => k.name + " @ " + k.at + (k.to ? "–" + k.to : "")).join(", ") : "NONE — nothing below can be read until a key: annotation exists"}\n  chord bands: ${o.chordBands}\n`;

if (what === "roman" || what === "chromatic") {
  const rows = roman.hmRomanNumerals(bands, keys, grid);
  if (what === "roman") {
    outJson(json, {...head, numerals: rows}, o => {
      let s = headText(o);
      for (const r of o.numerals)
        s += `  ${(r.at + "–" + r.to).padEnd(11)} ${r.label.padEnd(12)} ${r.numeral ? r.numeral.padEnd(14) : "?".padEnd(14)} ${r.key ? "in " + r.key : ""}${r.reason ? "  (" + r.reason + ")" : r.chromatic ? "  " + r.chromatic.kind + ": " + r.chromatic.detail : ""}${r.enharmonic ? "  [" + r.enharmonic + "]" : ""}\n`;
      if (!o.numerals.length) s += "  (no chord bands)\n";
      return s;
    });
  } else {
    const sum = roman.hmChromaticSummary(rows);
    outJson(json, {...head, chromatic: sum}, o => {
      let s = headText(o) + `  outside the key: ${o.chromatic.total} of ${o.chromatic.of} readable bands` +
        (o.chromatic.total ? " — " + Object.entries(o.chromatic.kinds).map(([k, n]) => n + " " + k).join(", ") : "") + "\n";
      for (const r of o.chromatic.items) s += `  ${(r.at + "–" + r.to).padEnd(11)} ${r.label.padEnd(12)} ${r.numeral.padEnd(14)} ${r.kind}: ${r.detail}${r.enharmonic ? " [" + r.enharmonic + "]" : ""}\n`;
      return s;
    });
  }
} else if (what === "cadences") {
  const rows = roman.hmRomanNumerals(bands, keys, grid);
  const songEnd = Math.ceil(doc.endTick / grid.barTicks) * grid.barTicks; // the last bar's end, so a section ending there names the boundary
  const cads = hmCadences(rows, keys, tracks, grid, songEnd, sections, {all, phraseBars: phrase ? +phrase : undefined});
  outJson(json, {...head, phraseBars: phrase ? +phrase : 4, cadences: cads}, o => {
    let s = headText(o) + `  phrase ends assumed every ${o.phraseBars} bars, at section edges and the song's end${all ? " (--all: mid-phrase motions included)" : ""}\n`;
    for (const c of o.cadences)
      s += `  ${c.type.padEnd(4)} @ ${c.at.padEnd(6)} ${c.from.numeral} → ${c.to.numeral}  (${c.from.label} → ${c.to.label}) in ${c.key}${c.soprano ? ", top voice " + c.soprano.pitch + " = " + c.soprano.degree : ""} — ${c.detail}; ${c.where}\n`;
    if (!o.cadences.length) s += "  (none found)\n";
    return s;
  });
} else if (what === "nct") {
  const res = hmNonChordTones(tracks, bands, keys, grid, {track: trackOpt});
  outJson(json, {...head, ...res}, o => {
    let s = headText(o) + `  chord tones ${o.summary.chordTones}, non-chord tones ${o.summary.nonChordTones}` +
      (o.summary.nonChordTones ? " — " + Object.entries(o.summary.byType).sort((a, b) => b[1] - a[1]).map(([k, n]) => n + " " + k).join(", ") : "") +
      `; ${o.uncovered} notes under no chord band\n`;
    for (const x of o.items) s += `  ${x.track.padEnd(9)} ${x.at.padEnd(6)} ${x.pitch.padEnd(4)} ${x.type.padEnd(19)} over ${x.over.padEnd(10)} ${x.detail}\n`;
    return s;
  });
} else if (what === "modulation") {
  const mods = hmModulations(keys, bands, grid);
  outJson(json, {...head, modulations: mods}, o => {
    let s = headText(o);
    for (const m of o.modulations) {
      s += `  @ ${m.at}: ${m.from} → ${m.to} (${m.relation.name}; ${m.relation.commonTones} common scale tones; new: ${m.newTones.join(" ") || "none"})\n    ${m.reading}\n`;
      for (const p of m.pivots) s += `      ${p.at.padEnd(6)} ${p.label.padEnd(10)} ${p.inFrom} in ${m.from} = ${p.inTo} in ${m.to}${p.before ? "" : "  (after the change)"}\n`;
      if (m.signal) s += `    first chord outside ${m.from}: ${m.signal.label} @ ${m.signal.at} = ${m.signal.inTo} in ${m.to}\n`;
    }
    if (!o.modulations.length) s += "  (no key change declared" + (o.declaredKeys.length ? "" : " — no key at all") + ")\n";
    return s;
  });
}
