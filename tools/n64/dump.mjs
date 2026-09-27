// CLI: one N64 EAD sequence (raw .m64/.aseq bytes, already cut out of the
// ROM's Audioseq table) -> <base>.notes.txt + <base>.mid.
//   node tools/n64/dump.mjs sequence.bin [--seconds S] [--abi sm64|oot]
//                                         [--ts 4/4] [--title name] [--out base]
// Without --seconds the dump stops at the song's loop jump (intro + one
// pass), or at the end for songs that don't loop.
import { readFileSync, writeFileSync } from "node:fs";
import { parseSequence } from "./seq-libultra.mjs";
import { toNotesTxt, toMidi } from "./notes.mjs";

const args = process.argv.slice(2);
let file = null;
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) i++; // every option takes one value
  else file = args[i];
}
const opt = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
if (!file) {
  console.error("usage: node tools/n64/dump.mjs sequence.bin [--seconds S] [--abi sm64|oot] [--ts 4/4] [--title name] [--out base]");
  process.exit(1);
}
const seconds = opt("seconds", null);
const [tsNum, tsDen] = opt("ts", "4/4").split("/").map(Number);
const base = opt("out", file.replace(/\.[^./]+$/, ""));
const title = opt("title", base.split("/").pop());

const res = parseSequence(readFileSync(file), {
  abi: opt("abi", "sm64"),
  maxSeconds: seconds == null ? 600 : +seconds,
  stopAtLoop: seconds == null,
});
writeFileSync(base + ".notes.txt", toNotesTxt(res, {title, tsNum, tsDen}));
writeFileSync(base + ".mid", toMidi(res, {tsNum, tsDen}));
console.error(`# ${title}: ${res.notes.length} notes on channels [${res.channels.join(" ")}], ` +
  `tempo ${res.tempos.map(t => t.bpm + "@" + t.tick).join(" ")}, ${res.endTick} ticks (${res.seconds.toFixed(1)}s)` +
  (res.loop ? `, loop -> tick ${res.loop.tick} after ${res.loop.at}` : ", no loop") +
  (res.truncated ? " [truncated]" : "") + (res.selfModified ? " [self-modifying]" : ""));
if (res.stubbed.length) console.error("# ignored (sound-shaping) ops seen: " + res.stubbed.join("; "));
console.error(`# wrote ${base}.notes.txt and ${base}.mid`);
