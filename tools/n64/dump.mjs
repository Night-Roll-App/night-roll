// CLI: one N64 EAD sequence -> <base>.notes.txt + <base>.mid.
//   node tools/n64/dump.mjs sequence.bin [--seconds S] [--abi sm64|oot|mm]
//                                         [--ts 4/4] [--title name] [--out base]
//   node tools/n64/dump.mjs "song.miniusf" [--seq N] [...]
// A raw .m64/.aseq is parsed as given. A .miniusf is resolved against the
// .usflib in its directory: the game's audio tables are located in the
// rip's sparse ROM/RDRAM (ead-usf.mjs), the mini's sequence id read from
// its save state, and the bytes the rip carries are parsed with a
// presence mask, so a byte the game never read is an error, not a zero.
// Without --seconds the dump stops at the song's loop jump (intro + one
// pass), or at the end for songs that don't loop.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { parseSequence } from "./seq-libultra.mjs";
import { toNotesTxt, toMidi } from "./notes.mjs";
import { loadUSF, rdramOf } from "./usf.mjs";
import { locateEAD, miniSequenceId, gameOfSet, findCachedSequences } from "./ead-usf.mjs";

const args = process.argv.slice(2);
let file = null;
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) i++; // every option takes one value
  else file = args[i];
}
const opt = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
if (!file) {
  console.error("usage: node tools/n64/dump.mjs sequence.bin|song.miniusf [--seconds S] [--abi sm64|oot|mm] [--seq N] [--io 4=255,5=1] [--ts 4/4] [--title name] [--out base]");
  process.exit(1);
}
const seconds = opt("seconds", null);
const [tsNum, tsDen] = opt("ts", "4/4").split("/").map(Number);
const base = opt("out", file.replace(/\.[^./]+$/, ""));
let title = opt("title", base.split("/").pop());
let abi = opt("abi", null);
let bytes, present = null;

if (/\.(miniusf|usf)$/i.test(file)) {
  const dir = dirname(file);
  const libs = readdirSync(dir).filter(n => /\.usflib$/i.test(n)).map(n => ({name: n, bytes: new Uint8Array(readFileSync(join(dir, n)))}));
  const set = loadUSF([{name: basename(file), bytes: new Uint8Array(readFileSync(file))}, ...libs]);
  const game = gameOfSet(set);
  const loc = locateEAD(set);
  if (!loc.gen) { console.error("no EAD audio tables found in this rip"); process.exit(1); }
  const id = opt("seq", null) != null ? +opt("seq") : miniSequenceId(set, game ? game.seqId : undefined);
  const seq = id == null ? null : loc.sequences[id];
  if (!seq) { console.error(`sequence id ${id} not found (${loc.sequences.length} in the table)`); process.exit(1); }
  const {ram} = rdramOf(set.state);
  let img, at;
  if (seq.rom != null && seq.coverage > 0) { img = set.rom; at = seq.rom; }
  else {
    const c = findCachedSequences(ram, loc.sequences).get(id);
    if (!c) { console.error(`sequence ${id}: not in the rip's ROM pages or RDRAM caches`); process.exit(1); }
    img = ram; at = c.ram;
  }
  bytes = img.read(at, seq.size);
  present = new Uint8Array(seq.size);
  for (let i = 0; i < seq.size; i++) present[i] = img.coverage(at + i, 1) ? 1 : 0;
  abi = abi || (game ? game.abi : loc.abi);
  if (!opt("title", null) && set.tags.title) title = set.tags.title;
  const holes = present.reduce((a, b) => a + (b ? 0 : 1), 0);
  console.error(`# ${game ? game.title : "unknown game"} (${loc.gen} tables), sequence ${id} @ ${img === set.rom ? "ROM" : "RDRAM"} 0x${at.toString(16)} +${seq.size}` +
    (holes ? `, ${holes} bytes not in the rip` : "") + (seq.fonts ? `, fonts ${seq.fonts}` : seq.banks ? `, banks ${seq.banks}` : ""));
} else {
  bytes = readFileSync(file);
  abi = abi || "sm64";
}

// --io 4=255,5=1 : sequence io ports the game would have set (see seq-libultra.mjs)
const io = opt("io", null) ? Object.fromEntries(opt("io").split(",").map(kv => kv.split("=").map(Number))) : null;
const res = parseSequence(bytes, {
  abi, present, io,
  maxSeconds: seconds == null ? 600 : +seconds,
  stopAtLoop: seconds == null,
});
writeFileSync(base + ".notes.txt", toNotesTxt(res, {title, tsNum, tsDen}));
writeFileSync(base + ".mid", toMidi(res, {tsNum, tsDen}));
console.error(`# ${title}: ${res.notes.length} notes on channels [${res.channels.join(" ")}], ` +
  `tempo ${res.tempos.map(t => t.bpm + "@" + t.tick).join(" ")}, ${res.endTick} ticks (${res.seconds.toFixed(1)}s)` +
  (res.loop ? `, loop -> tick ${res.loop.tick} after ${res.loop.at}` : ", no loop") +
  (res.truncated ? " [truncated]" : "") + (res.selfModified ? " [self-modifying]" : "") +
  (res.ioReads ? ` [reads game io ports x${res.ioReads}]` : ""));
if (res.stubbed.length) console.error("# ignored (sound-shaping) ops seen: " + res.stubbed.join("; "));
console.error(`# wrote ${base}.notes.txt and ${base}.mid`);
