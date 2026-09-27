// CLI: GBS -> .notes.txt + .mid (discovery mode: pitch/time/duration/channel only).
//   node tools/gbs/dump.mjs song.gbs --bpm 130 [--song 3] [--seconds 60]
//                                    [--ts 4/4] [--title overworld] [--out base]
// Writes <base>.notes.txt and <base>.mid (base defaults to the GBS's name
// plus the song number, in the current directory) and echoes the notes.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseGBS, runGBS } from "./gbs.mjs";
import { reconstruct, toNotesTxt, makeMidi } from "./notes.mjs";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))); // first positional
const opt = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : dflt;
};
if (!file || !opt("bpm")) {
  console.error("usage: node tools/gbs/dump.mjs song.gbs --bpm N [--song N] [--seconds N] [--ts 4/4] [--title name] [--out base]");
  process.exit(1);
}
const gbs = parseGBS(readFileSync(file));
console.error(`# ${gbs.name} — ${gbs.artist} (${gbs.songs} songs, ${gbs.timerMode ? "timer" : "v-blank"} ${gbs.playRateHz.toFixed(2)} Hz)`);
const song = +opt("song", gbs.startSong);
const seconds = +opt("seconds", 60);
const [tsNum, tsDen] = opt("ts", "4/4").split("/").map(Number);
const bpm = +opt("bpm");
const {apuLog, frames, frameSec} = runGBS(gbs, song, seconds);
const events = reconstruct(apuLog, frames, frameSec);
const title = opt("title", `${gbs.name} song ${song}`);
const base = opt("out", basename(file).replace(/\.gbs$/i, "") + "-" + song);
const txt = toNotesTxt(events, {frames, frameSec, bpm, tsNum, tsDen, title});
writeFileSync(base + ".notes.txt", txt);
writeFileSync(base + ".mid", makeMidi(events, {bpm, tsNum, tsDen, frameSec}));
process.stdout.write(txt);
console.error(`# wrote ${base}.notes.txt and ${base}.mid (${events.length} events)`);
