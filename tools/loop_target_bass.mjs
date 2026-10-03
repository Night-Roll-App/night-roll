// Score the key-sweep hypothesis (strong form): the bass note at the loop
// target is the tonic. SPOILER-SAFE by design — a song is only scored if
// Josh has already recorded its key in the rollnotes; unswept songs are
// counted but never have their pitches printed, so this can't leak a tonic
// he hasn't discovered. Run: node tools/loop_target_bass.mjs
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createApp } from "../tests/harness.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SONGS = path.join(ROOT, "albums/nes/final-fantasy-i/songs");
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LETTER_PC = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};

let unswept = 0;
for (const f of readdirSync(SONGS).filter(f => f.endsWith(".mid")).sort()) {
  const base = f.replace(/\.mid$/, "");
  const rn = path.join(SONGS, base + ".rollnotes.json");
  const text = existsSync(rn) ? readFileSync(rn, "utf8") : "";
  const key = (text.match(/^key:\s*(\S+(?:\s+[a-z]+)?)\s*$/mi) || [])[1];
  if (!key) { unswept++; continue; } // no recorded key -> say nothing at all

  // loop target in beats-from-zero (loop: B.Q directive, else top of song)
  const lm = text.match(/^loop:\s*(\d+)(?:\.(\d+(?:\.\d+)?))?/m);
  const tb = lm ? [+lm[1], lm[2] ? +lm[2] : 1] : [1, 1];

  const app = await createApp();
  app.context.midiBytes = [...readFileSync(path.join(SONGS, f))];
  const bass = JSON.parse(app.run(`JSON.stringify((() => {
    const r = parseMidi(new Uint8Array(midiBytes).buffer);
    const bpb = r.timesig[0] * 4 / r.timesig[1];
    const t = ((${tb[0]} - 1) * bpb + (${tb[1]} - 1)) * r.ppq;
    let best = null; // lowest pitch sounding at (or nearest onset after) the target
    r.tracks.forEach(tr => tr.notes.forEach(n => {
      if (n.ch === 9) return;
      const sounding = n.t <= t + r.ppq / 4 && n.t + n.d > t;
      if (sounding && (best === null || n.p < best)) best = n.p;
    }));
    return best;
  })())`));
  if (bass === null) { console.log(base.padEnd(18) + "key " + key.padEnd(10) + " — no note at loop target"); continue; }
  const tonicLetter = key[0].toUpperCase();
  const tonicPc = (LETTER_PC[tonicLetter] + (key[1] === "#" ? 1 : key[1] === "b" ? -1 : 0) + 12) % 12;
  const hit = bass % 12 === tonicPc;
  console.log(base.padEnd(18) + "key " + key.padEnd(10) + " bass@loop " +
              NAMES[bass % 12].padEnd(3) + (hit ? " HIT" : " MISS"));
}
console.log("(" + unswept + " songs without a recorded key — not shown, keys are Josh's to find)");
