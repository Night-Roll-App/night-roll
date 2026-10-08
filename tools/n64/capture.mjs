// One set → this mini's sequence, parsed. The three places that need it
// (the app's capture, its chip render, the worker's) used to carry their
// own copies of the locate/id/bytes/presence steps; one function now.
import { rdramOf } from "./usf.mjs";
import { gameOfSet, locateEAD, miniSequenceId, findCachedSequences, findSynthesisReverb, findOotReverbs } from "./ead-usf.mjs";
import { parseSequence } from "./seq-libultra.mjs";
import { findAudioFiles, readBank } from "./bank.mjs";
import { rareSequenceOfSet } from "./rare.mjs";

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

// The oot generation's SequencePlayer (oot include/audio.h, mm seqplayer.h: the same layout in both)
// — channels[16] at +0x38, seqScriptIO[8] (the io ports) at +0x158, 0x160 bytes; gAudioCtx.seqPlayers[]
// is an array of them. Engine-dialect data: it says WHERE the ports sit, not what they hold.
export const OOT_PLAYER = {channels: 0x38, io: 0x158, size: 0x160};

// The io ports of the player the mini starts, read from the rip's save state — the ripper picks a
// section by writing them (OoT Hyrule Field's three minis differ only in seqPlayers[1] port 2:
// 0 main, 1 battle, 2 waiting), and AudioLoad_SyncInitSeqPlayer does not reset them, so the song
// reads what the state holds. The player is the parked call's a0 (the instruction at the PC loads it:
// `lbu a0,1(s0)` before `jal AudioLoad_SyncInitSeqPlayer`). The array is found by its shape: a struct
// whose 16 channel pointers step evenly (AudioSeq_InitSequencePlayerChannels allocates them in a row),
// its neighbours 0x160 apart, the first one extended down over players whose channels all point at
// one struct (sequenceChannelNone). Returns {player, io: {port: s8}, at} or null (nothing changes then).
export function parkedPlayerIo(set, ram) {
  let player;
  try { player = parkedA0(set, ram); } catch { return null; }
  if (player == null || player > 7) return null;
  const L = OOT_PLAYER, k0 = v => (v >>> 24) === 0x80 && !(v & 3);
  const words = q => { if (ram.coverage(q, 64) < 1) return null; const w = []; for (let k = 0; k < 16; k++) w.push(ram.u32(q + 4 * k)); return w.every(k0) ? w : null; };
  const stepped = q => { const w = words(q); if (!w) return false; const st = w[1] - w[0]; return st > 0 && st <= 0x200 && w.every((v, k) => v === w[0] + st * k); };
  const bases = new Set();
  for (const r of ram.runs()) for (let q = (r.offset + 3) & ~3; q + 64 <= r.offset + r.length; q += 4) if (stepped(q)) bases.add(q - L.channels);
  let best = null;
  for (const b of bases) {
    if (bases.has(b - L.size)) continue; // not the first of its run
    let first = b, n = 0;
    while (bases.has(b + n * L.size)) n++;
    for (;;) { const w = words(first - L.size + L.channels); if (!w || !w.every(v => v === w[0])) break; first -= L.size; n++; }
    if (n >= 2 && (!best || n > best.n)) best = {first, n};
  }
  if (!best || player >= best.n) return null;
  const at = best.first + player * L.size + L.io;
  if (ram.coverage(at, 8) === 0) return null; // the rip keeps only non-zero bytes: a missing one is 0, a missing struct is unknown
  const b = ram.read(at, 8), io = {};
  b.forEach((x, i) => { io[i] = (x << 24) >> 24; });
  return {player, io, at};
}
// a0 at the parked PC: the instruction there sets it (a load from memory or an immediate), else the register
function parkedA0(set, ram) {
  const reg = r => { const b = set.state.read(0x50 + 8 * r, 4, {strict: true}); return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0; };
  const pcb = set.state.read(0x4c, 4, {strict: true});
  const pc = ((pcb[0] | (pcb[1] << 8) | (pcb[2] << 16) | (pcb[3] << 24)) >>> 0) & 0x1FFFFFFF;
  if (ram.coverage(pc, 4) === 1) {
    const w = ram.u32(pc), op = w >>> 26, rs = (w >>> 21) & 31, rt = (w >>> 16) & 31, imm = (w << 16) >> 16;
    if (rt === 4 && (op === 0x24 || op === 0x20)) { // lbu / lb a0, imm(rs)
      const a = ((reg(rs) + imm) >>> 0) & 0x1FFFFFFF;
      if (ram.coverage(a & ~15, 16) === 0) return null;
      const v = ram.read(a, 1)[0];
      return op === 0x20 ? (v << 24) >> 24 : v;
    }
    if (rt === 4 && rs === 0 && (op === 0x09 || op === 0x0D)) return op === 0x09 ? imm : w & 0xFFFF; // addiu / ori a0, zero, imm
  }
  return reg(4);
}
// sequence `id`'s bytes and presence mask from the rip: its ROM pages or the audio heap's RAM copy,
// whichever holds more of it; null when neither holds any (`cached`: findCachedSequences' map, if in hand)
export function sequenceImageOf(set, ram, loc, id, cached = null) {
  const q = loc.sequences[id];
  if (!q || !q.size) return null;
  const c = (cached || findCachedSequences(ram, loc.sequences)).get(id);
  const src = q.rom != null && q.coverage > 0 && (!c || q.coverage >= c.coverage) ? {img: set.rom, at: q.rom} : c && c.coverage > 0 ? {img: ram, at: c.ram} : null;
  if (!src) return null;
  const present = new Uint8Array(q.size);
  for (let i = 0; i < q.size; i++) present[i] = src.img.coverage(src.at + i, 1) ? 1 : 0;
  return {bytes: src.img.read(src.at, q.size), present};
}

export function sequenceOfSet(set, {maxSeconds = 600} = {}) {
  const game = gameOfSet(set);
  const loc = locateEAD(set);
  // no EAD tables: Rare's engine (GoldenEye) keeps an SDK song table in RAM instead — rare.mjs
  if (!loc.gen) return rareSequenceOfSet(set, {game, maxSeconds});
  const raw = miniSequenceId(set, game ? game.seqId : undefined);
  // a sequence id is a byte (bit 7 the variation); MM's ocarina minis hold a pointer in that word
  // (0x801F9D14: the ocarina/sound-effect path, not an Audioseq sequence) — masking it would play sequence 0x14
  if (raw != null && raw > 0xFF) throw new Error("this song plays no sequence: the game's word is 0x" + raw.toString(16) + " (the ocarina / sound-effect path, not a music sequence)");
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
  // the oot generation: the io ports the save state holds for the starting player, and the other
  // sequences of the set for the script's ldseq B0 / runseq C4
  const parked = loc.gen === "oot" ? parkedPlayerIo(set, ram) : null;
  let cached = null;
  const loads = new Map(), loadSeq = n => {
    if (!loads.has(n)) loads.set(n, sequenceImageOf(set, ram, loc, n, cached || (cached = findCachedSequences(ram, loc.sequences))));
    return loads.get(n);
  };
  const res = parseSequence(seqBytes, {abi: game ? game.abi : loc.abi, present, io: parked ? parked.io : null, player: parked ? parked.player : null,
                                       loadSeq, variation, maxSeconds, stopAtLoop: true});
  res.io = parked;
  res.sequenceId = id; res.variation = variation;
  // which engine generation plays it: the renderer reads banks (sm64) or sound fonts (oot) by it
  res.gen = loc.gen;
  // the reverb the engine was running (from the rip's RAM; null / [] = not in this rip, the render says so):
  // sm64 has one SynthesisReverb, the oot generation an array a channel picks from (E5 reverb index)
  if (loc.gen === "oot") res.reverbs = findOotReverbs(ram);
  else res.reverb = findSynthesisReverb(ram);
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
