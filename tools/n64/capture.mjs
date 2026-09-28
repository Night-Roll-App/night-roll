// One set → this mini's sequence, parsed. The three places that need it
// (the app's capture, its chip render, the worker's) used to carry their
// own copies of the locate/id/bytes/presence steps; one function now.
import { rdramOf } from "./usf.mjs";
import { gameOfSet, locateEAD, miniSequenceId, findCachedSequences, findSynthesisReverb } from "./ead-usf.mjs";
import { parseSequence } from "./seq-libultra.mjs";
import { findAudioFiles, readBank } from "./bank.mjs";

// Which channels the game had ducked to silence when this mini was ripped.
// The three "Dire, Dire Docks" minis (surface / in water / underwater cave)
// and the three Cave Dungeon ones are byte-identical in their save state
// (one word each, the sequence id): the game's per-area ducking
// (external.c process_level_music_dynamics → fade_channel_volume_scale →
// seqChannel->volumeScale) is nowhere in RAM. What does differ is the
// mini's own ROM overlay: the ripper's bit-exact trim left, per mini, the
// trailing byte of each AudioBankSound (the tuning's last byte) zeroed for
// every instrument and drum that never sounded in that mini's reference
// render — a record of exactly the voices the game had muted. 09a marks
// instruments 0,1,6,10,11 and the kit's drums = channels 0,1,6,9,10,11 =
// sMusicDynamics[0]'s mask 0x0E43; 14a marks instrument 8 = dynamic 3's
// 0x0100, 14b instrument 3 = dynamic 4's 0x0008; 09b marks 10,11 + drums
// (channels 9,10,11; the table's dynamic 1 would also mute 6 — the mini
// says 6 sounded). A channel is dropped when every voice it plays is
// marked; nothing else about a mini is inferred. A mini without an overlay
// (Title Theme, Main Theme, 09c, 14c) keeps every channel.
export function duckedChannels(set, loc, seq, res) {
  const chunks = set.top && set.top.rom ? set.top.rom : [];
  if (!chunks.length || !seq.banks || !seq.banks.length) return {channels: [], marked: []};
  let files; try { files = findAudioFiles(set.rom, loc); } catch { return {channels: [], marked: []}; }
  const marked = new Set(), voices = [];
  for (const b of seq.banks) {
    let bank; try { bank = readBank(set.rom, files, b); } catch { continue; }
    for (const c of chunks) for (let k = 0; k < c.bytes.length; k++) {
      const p = c.offset + k;
      const i = bank.instruments.find(x => x && p >= x.at && p < x.at + 0x20);
      const d = !i && bank.drums.find(x => x && p >= x.at && p < x.at + 0x10);
      if (i && !marked.has("i" + b + ":" + i.index)) { marked.add("i" + b + ":" + i.index); voices.push({bank: b, inst: i.index}); }
      if (d && !marked.has("d" + b + ":" + d.index)) { marked.add("d" + b + ":" + d.index); voices.push({bank: b, drum: d.index}); }
    }
  }
  if (!marked.size) return {channels: [], marked: voices};
  const byCh = new Map();
  for (const n of res.notes) {
    const key = n.drum ? "d" + seq.banks[n.bank || 0] + ":" + n.semitone : "i" + seq.banks[n.bank || 0] + ":" + n.inst;
    (byCh.get(n.ch) || byCh.set(n.ch, new Set()).get(n.ch)).add(key);
  }
  const channels = [...byCh].filter(([, keys]) => [...keys].every(k => marked.has(k))).map(([ch]) => ch).sort((a, b) => a - b);
  return {channels, marked: voices};
}

export function sequenceOfSet(set, {maxSeconds = 600} = {}) {
  const game = gameOfSet(set);
  const loc = locateEAD(set);
  if (!loc.gen) throw new Error("no Nintendo sequence tables in this rip — a driver Night Roll cannot read yet");
  const raw = miniSequenceId(set, game ? game.seqId : undefined);
  // bit 7 of a play_sequence id is SEQ_VARIATION: the same script, steered (SM64's title
  // theme plays its intro only with it); the table is indexed by the low 7 bits
  const id = raw == null ? null : raw & 0x7F, variation = raw == null ? 0 : raw & 0x80;
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
  const res = parseSequence(seqBytes, {abi: game ? game.abi : loc.abi, present, io: null, variation, maxSeconds, stopAtLoop: true});
  res.sequenceId = id; res.variation = variation;
  // the reverb the engine was running (from the rip's RAM; null = not in this rip, the render says so)
  res.reverb = findSynthesisReverb(ram);
  // the game's per-area ducking for this mini: those channels never sound here, so they leave the capture
  const ducked = loc.gen === "sm64" ? duckedChannels(set, loc, seq, res) : {channels: [], marked: []};
  res.ducked = ducked.channels;
  if (ducked.channels.length) {
    res.notes = res.notes.filter(n => !ducked.channels.includes(n.ch));
    res.channels = res.channels.filter(c => !ducked.channels.includes(c));
    (res.warnings || (res.warnings = [])).push("channels " + ducked.channels.join(",") + " silent in this area (game ducking)");
  }
  return {game, loc, id, seq, res, present, ducked};
}
