// One set → this mini's sequence, parsed. The three places that need it
// (the app's capture, its chip render, the worker's) used to carry their
// own copies of the locate/id/bytes/presence steps; one function now.
import { rdramOf } from "./usf.mjs";
import { gameOfSet, locateEAD, miniSequenceId, findCachedSequences } from "./ead-usf.mjs";
import { parseSequence } from "./seq-libultra.mjs";

export function sequenceOfSet(set, {maxSeconds = 600} = {}) {
  const game = gameOfSet(set);
  const loc = locateEAD(set);
  if (!loc.gen) throw new Error("no Nintendo sequence tables in this rip — a driver Night Roll cannot read yet");
  const id = miniSequenceId(set, game ? game.seqId : undefined);
  const seq = id == null ? null : loc.sequences[id];
  if (!seq) throw new Error("this song's sequence (id " + id + ") is not in the game's table");
  const {ram} = rdramOf(set.state);
  let img, at;
  if (seq.rom != null && seq.coverage > 0) { img = set.rom; at = seq.rom; }
  else {
    const c = findCachedSequences(ram, loc.sequences).get(id);
    if (!c) throw new Error("this song's sequence is not in the rip's ROM pages or memory");
    img = ram; at = c.ram;
  }
  const seqBytes = img.read(at, seq.size);
  const present = new Uint8Array(seq.size);
  for (let i = 0; i < seq.size; i++) present[i] = img.coverage(at + i, 1) ? 1 : 0;
  const res = parseSequence(seqBytes, {abi: game ? game.abi : loc.abi, present, io: null, maxSeconds, stopAtLoop: true});
  return {game, loc, id, seq, res, present};
}
