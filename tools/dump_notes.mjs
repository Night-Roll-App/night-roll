// Generate <song>.notes.txt next to every .mid — plain-text note dumps so
// LLMs (e.g. the Claude app reading this repo) can analyze songs whose .mid
// binaries they can't parse. Uses the app's own parser via the test harness.
// Run: node tools/dump_notes.mjs [dir ...]   (default: every album dir)
// NB: the FF album's dumps are written by tools/nsf/dump-all.mjs with
// channel identity — this tool is for MIDIs with no NSF source (compositions,
// hand-me-down transcriptions).
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { createApp } from "../tests/harness.mjs";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIRS = process.argv.length > 2 ? process.argv.slice(2)
  : ["albums/compositions"]; // FF songs come from the NSF pipeline instead

for (const dir of DIRS)
for (const f of readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith(".mid")).sort()) {
  const MIDI = path.join(ROOT, dir);
  const app = await createApp();
  app.context.midiBytes = [...readFileSync(path.join(MIDI, f))];
  const text = app.run(`(() => {
    const NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const pn = p => NAMES[p % 12] + (Math.floor(p / 12) - 1);
    const r = parseMidi(new Uint8Array(midiBytes).buffer);
    const bt = r.timesig[0] * 4 / r.timesig[1] * r.ppq;
    let end = 0;
    r.tracks.forEach(t => t.notes.forEach(n => end = Math.max(end, n.t + n.d)));
    const nBars = Math.ceil(end / bt - 0.05);
    const L = [];
    L.push("# ${f} — " + r.timesig[0] + "/" + r.timesig[1] + ", " +
           Math.round(6e7 / r.tempos[0].usq) + "bpm, " + nBars + " bars");
    L.push("# Format: bar N: beat pitch duration-in-quarter-notes");
    L.push("# duration is GATE TIME (how long the chip held the note), NOT a notated value.");
    L.push("# RHYTHM comes from ONSET SPACING (the beat column), never from duration:");
    L.push("# staccato eighths gate at ~0.33 and are still eighths, not triplets.");
    L.push("# Pitches use sharp spelling; the true key is Josh's to discover — this file states no key.");
    r.tracks.forEach((tr, ti) => {
      L.push("");
      L.push("## track " + (ti + 1) + (tr.name ? " (" + tr.name + ")" : ""));
      for (let b = 0; b < nBars; b++) {
        const ns = tr.notes.filter(n => n.t >= b * bt && n.t < (b + 1) * bt);
        if (!ns.length) continue;
        L.push("bar " + (b + 1) + ": " + ns.map(n =>
          ((n.t - b * bt) / r.ppq + 1).toFixed(2).replace(/\\.?0+$/, "") + " " +
          pn(n.p) + " " +
          (n.d / r.ppq).toFixed(2).replace(/\\.?0+$/, "")).join(", "));
      }
    });
    return L.join("\\n") + "\\n";
  })()`);
  const out = f.replace(/\.mid$/, ".notes.txt");
  writeFileSync(path.join(MIDI, out), text);
  console.log(out, text.length + " bytes");
}
