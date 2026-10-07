// Interpreter for Nintendo EAD's N64 sequence bytecode ("Audioseq" —
// .m64 in the sm64 decomp, .seq/aseq in oot/mm) -> note events.
//
// It runs the three script levels tick for tick the way the game does
// (sm64 decomp src/audio/seqplayer.c: sequence_player_process_sequence,
// sequence_channel_process_script, seq_channel_layer_process_script),
// because the format is a program, not a note list: durations only exist
// as "delay until this play head reads its next command", and pitch is
// note + three transpositions that can change mid-song. Static decoding
// would have to re-derive the same state machine.
//
// A tick is 1/48 of a beat (TATUMS_PER_BEAT). Tempo is BPM, set by the
// sequence script; the format carries no time signature.
//
// ABI: "sm64" = SM64 JP/US (also fine for Wave Race 64). "oot" = the
// OoT generation: relative branches F2-F4, remapped channel low-nibble
// ops, full channel opcodes from B0, layer CD-CF, an s8 sequence register.
// "mm" = "oot" with Majora's Mask's channel argument table (A0-AF exist,
// BD/BE differ). SF64/MK64 sit between; try "sm64" and fall back to "oot"
// if it throws on an opcode (the parser fails loudly).
//
// Options beyond the ABI: `present` (a byte mask from a USF rip: reading a
// missing byte throws with its offset), `io` ({port: value} the game would
// have written), `variation` (the id's SEQ_VARIATION bit: 0 or 0x80),
// `maxSeconds` / `maxTicks` / `stopAtLoop`. The result
// carries `ioReads` so a caller can tell a game-driven song from a broken
// one. Verified against the SM64 / OoT / MM catalogues (INTEGRATION.md §8).
//
// Implemented (state actually tracked, affects output):
//   all three levels: FF FD FE FC F8 F7 F6 FB FA F9 F5 (+ F4 F3 F2 in oot)
//   sequence: DF DE DD DC D7 D6 D2 D1 CC C9 C8 0x0n 0x5n 0x7n 0x8n 0x9n
//             oot: CD (dyncall) C6 (stop) 0x4n 0xAn
//   channel:  C1 C2 C3 C4 C5 C7 C8 C9 CB CC DB E4 EB, sm64 low ops
//             0x0n 0x1n 0x2n 0x3n 0x4n 0x5n 0x6n 0x7n 0x8n 0x9n 0xAn 0xBn,
//             oot low ops 0x0n 0x2n 0x3n 0x4n 0x5n 0x6n 0x7n 0x78 0x8n
//             0x88 0x9n 0x98, oot CD
//   layer:    notes 00-BF (large and short forms), C0 rest, C1 C2 C3 C4 C5
//             C6 C9 D0-DF E0-EF
//   sound facts the renderer (render.mjs) needs, recorded on each note as
//   the game would apply them at note-on (sm64 seqplayer.c / effects.c):
//   the channel's bank index (C6/EB), volume (DF /127) × volume scale
//   (E0 /128) × the player's volume (DB, DA /127), pan (DD /128) with its
//   weight (DC /128) and the layer's own pan (CA /128, CC = keep it over the
//   drum's), reverb send (D4), vibrato (D7/D8/E1/E2/E3/EC → `vib`, with
//   the channel's later target changes as `vibChanges`), level steps under
//   the note (DF/E0/DB/DA → `gain`), pitch
//   scale (DE u16/32768, D3 = 0.5·2^((s8+127)/127)), the channel's
//   envelope/release overrides (DA, D9 — an instrument set by C1/EB
//   replaces them, as get_instrument does) and the layer's own adsr
//   (C6 instrument, CB envelope + release). The oot generation adds, from
//   oot seqplayer.c: sustain (D2 → chSustain), reverb index (E5 → revIdx),
//   gain (ED → chGain, UQ4.4), the params blocks (E8 inline / E7 from the
//   data: transposition, pan, weight, reverb, reverb index), the note filter
//   (B0 taps in the sequence data, B3 rewrites them from the engine's
//   low/high-pass rows, B1 drops it → `filter`) and comb filter (BB → `comb`).
// Stubbed (arguments consumed, effect ignored — listed in result.stubbed
// when encountered): the mute machinery, note pools, the oot random ops
// (read as 0 so output is deterministic), oot ldsample (0x1n)
// and any opcode outside the tables, which throw with the offset.
import { TICKS_PER_BEAT, SEMITONE_TO_MIDI, DEFAULT_SHORT_VEL, DEFAULT_SHORT_GATE } from "./constants.mjs";
export { TICKS_PER_BEAT, SEMITONE_TO_MIDI };

const CHANNELS = 16;
const LAYERS = 4;
const SPIN_LIMIT = 100000; // commands one play head may run inside a single tick before we call it stuck

function state(pc) { return {pc, depth: 0, stack: [0, 0, 0, 0], loops: [0, 0, 0, 0]}; }

// oot generation: the channel filter's 8 Q15 taps as AudioHeap_LoadFilter (heap.c) writes them for
// ASEQ_OP_CHAN_FILTER's cutoffs — gLowPassFilterData[16][8] and gHighPassFilterData[15][8] (data.c),
// a low-pass row, a high-pass row, or their average (C division: truncation toward zero)
const LOW_PASS = [0, 0, 0, 32767, 0, 0, 0, 0, 3854, 4188, 4398, 4469, 4398, 4188, 3854, 3416, 3415, 4314, 4915, 5126, 4915, 4314, 3415, 2351, 2636, 4433, 5762, 6252, 5762, 4433, 2636, 849, 1334, 4196, 6646, 7609, 6646, 4196, 1334, -802, -265, 3421, 7292, 8944, 7292, 3421, -265, -1863, -1558, 2065, 7146, 9546, 7146, 2065, -1558, -1682, -2353, 726, 7441, 11028, 7441, 726, -2353, -697, -2252, -693, 7121, 11962, 7121, -693, -2252, 668, -1373, -1819, 6299, 12298, 6299, -1819, -1373, 1484, -213, -2740, 5843, 13680, 5843, -2740, -213, 1494, 980, -3081, 4883, 14286, 4883, -3081, 980, 590, 1769, -2973, 3866, 14981, 3866, -2973, 1769, -568, 2023, -2554, 2911, 16397, 2911, -2554, 2023, -1391, 1766, -1918, 2016, 19800, 2016, -1918, 1766, -1564, 841, -853, 863, 26829, 863, -853, 841, -820];
const HIGH_PASS = [-289, -291, -289, 30736, -289, -291, -289, -290, -464, -467, -467, 29506, -467, -467, -464, -463, -662, -670, -672, 28101, -672, -670, -662, -656, -839, -855, -861, 26830, -861, -855, -839, -822, -996, -1024, -1038, 25685, -1038, -1024, -996, -963, -1184, -1236, -1266, 24272, -1266, -1236, -1184, -1118, -1357, -1450, -1506, 22900, -1506, -1450, -1357, -1238, -1514, -1680, -1784, 21498, -1784, -1680, -1514, -1307, -1613, -1877, -2048, 20390, -2048, -1877, -1613, -1298, -1657, -2185, -2559, 18869, -2559, -2185, -1657, -1093, -1524, -2395, -3078, 18030, -3078, -2395, -1524, -739, -1253, -2504, -3621, 17642, -3621, -2504, -1253, -367, -525, -2367, -4732, 17517, -4732, -2367, -525, 0, -34, -1762, -5706, 17503, -5706, -1762, -34, -258, -772, -3, -6985, 17240, -6985, -3, -772, -3];
export function ootFilterTaps(lowPass, highPass) {
  const lp = LOW_PASS.slice(8 * lowPass, 8 * lowPass + 8), hp = highPass ? HIGH_PASS.slice(8 * (highPass - 1), 8 * highPass) : null;
  if (!hp) return lowPass ? lp : LOW_PASS.slice(0, 8);
  if (!lowPass) return hp;
  return lp.map((v, k) => Math.trunc((v + hp[k]) / 2));
}

export function parseSequence(input, opts = {}) {
  const {abi = "sm64", maxTicks = TICKS_PER_BEAT * 4 * 2000, maxSeconds = Infinity,
         maxNotes = 250000, stopAtLoop = true, present = null, io = null, variation = 0} = opts;
  if (abi !== "sm64" && abi !== "oot" && abi !== "mm") throw new Error("abi must be sm64, oot or mm, got " + abi);
  const oot = abi === "oot" || abi === "mm"; // the OoT generation; "mm" differs only in the channel A0-BE table
  const mm = abi === "mm";
  // copy: channel C7 / sequence C7 write into the sequence bytes
  const seq = input instanceof ArrayBuffer ? new Uint8Array(input.slice(0)) : Uint8Array.from(input);
  // `present[i]` falsy = byte i is a hole (a USF rip carries only the bytes
  // the game read); reading one is an error, not a zero
  const have = present ? Uint8Array.from(present) : null;
  const notes = [], tempos = [], stubbed = new Set();
  // what reaches a held note at the next update (effects.c sequence_channel_process_sound recomputes
  // every layer's noteVelocity = velocitySquare × volume × volumeScale × fadeVolume each update; a
  // note's vibrato reads the channel's rate/extent targets live): per channel, the level and the
  // vibrato targets over time, sliced onto each note at the end as n.gain / n.vibChanges; the same
  // function recomputes noteFreqScale = layer freqScale × the channel's (D3/DE/EC) for every held
  // note (OoT's AudioEffects_SequenceChannelProcessSound too, on changes.s.freqScale) → n.freqChanges
  const levelEvents = [], vibEvents = [], bendEvents = [];
  const levelOf = C => C.volume * C.volumeScale * player.volume;
  const noteLevel = C => { levelEvents.push({tick, ch: C.idx, level: levelOf(C)}); };
  const noteVib = C => { vibEvents.push({tick, ch: C.idx, ...C.vib}); };
  const noteBend = C => { bendEvents.push({tick, ch: C.idx, freq: C.freqScale}); };
  // io ports are how the game steers a sequence (which section, which
  // band member); we never write them, so a song that reads them is
  // running a path the game would not necessarily take — count the reads
  let tick = 0, seconds = 0, loop = null, selfModified = false, ioReads = 0;

  const hex = v => "0x" + v.toString(16).padStart(2, "0");
  const fail = (level, cmd, at) => new Error(`${level} opcode ${hex(cmd)} at ${hex(at)}: not in the ${abi} ABI table (tick ${tick})`);
  const stub = name => { stubbed.add(name); };

  // ---- byte readers (m64_read_u8 / _s16 / _compressed_u16)
  const at = a => {
    if (a >= seq.length) throw new Error(`script ran off the end at ${hex(a)} (tick ${tick})`);
    if (have && !have[a]) throw new Error(`byte ${hex(a)} is not in the rip (tick ${tick})`);
    return seq[a];
  };
  const poke = (a, v) => { seq[a] = v; if (have) have[a] = 1; selfModified = true; };
  const u8 = s => at(s.pc++);
  const s8 = s => (u8(s) << 24) >> 24;
  const u16 = s => (u8(s) << 8) | u8(s);
  const s16 = s => (u16(s) << 16) >> 16;
  const cu16 = s => { let v = u8(s); if (v & 0x80) v = ((v & 0x7F) << 8) | u8(s); return v; };
  const u16at = a => (at(a) << 8) | at(a + 1);
  const byteAt = a => at(a); // (channelOp shadows `at` with the opcode's offset)
  const filters = new Map();   // oot: filter taps by sequence address — the game's filter memory is the sequence's own bytes
  // (a byte the rip lacks is a zero: the game writes this memory with B3 before it ever reads it)
  const soft = a => a < seq.length && (!have || have[a]) ? seq[a] : 0;
  const filterAt = a => { if (!filters.has(a)) filters.set(a, Array.from({length: 8}, (_, k) => (((soft(a + 2 * k) << 8) | soft(a + 2 * k + 1)) << 16) >> 16)); return filters.get(a); };
  const push = (s, pc) => { if (s.depth >= 4) throw new Error(`call stack overflow at ${hex(s.pc)}`); s.stack[s.depth++] = pc; };

  // ---- control flow shared by all three levels. `o.value` is the level's
  // register (s32 on the sequence, s8 on channels). Returns true if handled.
  function flow(o, s, cmd, level) {
    switch (cmd) {
      case 0xFC: { const a = u16(s); push(s, s.pc); s.pc = a; return true; }
      case 0xF8: { s.loops[s.depth] = u8(s); push(s, s.pc); return true; }
      case 0xF7: {
        const i = s.depth - 1;
        s.loops[i] = (s.loops[i] - 1) & 0xFF; // u8 counter: F8 00 loops 256 times
        if (s.loops[i] !== 0) s.pc = s.stack[i]; else s.depth--;
        return true;
      }
      case 0xF6: s.depth--; return true;
      case 0xFB: case 0xFA: case 0xF9: case 0xF5: {
        const a = u16(s);
        if (level === "layer" && cmd !== 0xFB) throw fail(level, cmd, s.pc - 3);
        if (cmd === 0xFA && o.value !== 0) return true;
        if (cmd === 0xF9 && o.value >= 0) return true;
        if (cmd === 0xF5 && o.value < 0) return true;
        if (level === "sequence" && cmd === 0xFB) noteLoop(a, s);
        s.pc = a;
        return true;
      }
      case 0xF4: { const r = s8(s); if (level === "sequence" && r < 0) noteLoop(s.pc + r, s); s.pc += r; return true; }
      case 0xF3: case 0xF2: {
        if (!oot) return false; // sm64: F3 chan_hang / F2 reservenotes, handled per level
        const r = s8(s);
        if (level === "layer") throw fail(level, cmd, s.pc - 2);
        if (cmd === 0xF3 && o.value !== 0) return true;
        if (cmd === 0xF2 && o.value >= 0) return true;
        s.pc += r;
        return true;
      }
    }
    return false;
  }

  // Song loops are backward jumps at the top level of the sequence script.
  // The first one seen is the loop; its target's first-visit tick is where
  // the music returns to (the target may be the mid-song FD delay itself).
  const firstVisit = new Map();
  function noteLoop(target, s) {
    if (loop || s.depth !== 0 || !firstVisit.has(target)) return;
    loop = {tick: firstVisit.get(target), at: tick, offset: target};
  }

  // ---- notes
  function noteOff(L) {
    if (!L.note) return;
    L.note.dur = Math.max(1, tick - L.note.tick);
    L.note = null;
  }
  function noteOn(L, ev) {
    noteOff(L);
    if (notes.length >= maxNotes) throw new Error("more than " + maxNotes + " notes — runaway sequence?");
    L.note = ev;
    notes.push(ev);
  }

  // ---- player / channels / layers
  // seqVariation: play_sequence sets it to `seqId & SEQ_VARIATION` (external.c) — 0 for a
  // plain id, 0x80 read back as the s8 −128 for a "| SEQ_VARIATION" id. Scripts test it with
  // 0x80 (getvariation) + a branch to pick a section: SM64's Title Theme skips its ritardando
  // intro table when it is 0. The old default −1 played every such intro (2026-09-27).
  const player = {enabled: true, delay: 0, tempo: 120, transposition: 0, value: 0, variation: (variation << 24) >> 24, volume: 1,
                  io: new Array(8).fill(-1), shortVel: -1, shortGate: -1, channels: new Array(CHANNELS).fill(null),
                  st: state(0)};
  // opts.io = {port: value}: what the game would have written before the
  // song started (MM's Ballad of the Wind Fish reads port 4 for the band)
  if (io) for (const [k, v] of Object.entries(io)) { const p = +k; if (p >= 0 && p < 8) player.io[p] = (v << 24) >> 24; }
  const shortVel = i => player.shortVel < 0 ? DEFAULT_SHORT_VEL[i] : at(player.shortVel + i);
  const shortGate = i => player.shortGate < 0 ? DEFAULT_SHORT_GATE[i] : at(player.shortGate + i);

  function newChannel(idx) {
    return {idx, enabled: false, finished: false, stopScript: false, delay: 0, value: 0, transposition: 0,
            largeNotes: false, instr: null, bank: 0, dynTable: -1, io: new Array(8).fill(-1),
            // sequence_channel_init: full volume, centre pan, no bend; adsr = the default envelope until an instrument is set
            volume: 1, volumeScale: 1, pan: 0.5, panWeight: 1, freqScale: 1, envelope: null, release: null, adsrInst: null, reverb: 0,
            // oot generation: adsr.sustain (D2) and the synthesis reverb the notes feed (E5; AudioSeq_InitSequenceChannel zeroes both)
            sustain: 0, reverbIndex: 0,
            // oot: the note filter (B0/B1/B3: 8 taps living in the sequence data), comb filter (BB) and gain (ED, UQ4.4)
            filter: null, comb: null, gain: 0,
            // sequence_channel_init: vibrato rate 0x800, no extent, no delay
            vib: {rateStart: 0x800, rateTarget: 0x800, rateDelay: 0, extStart: 0, extTarget: 0, extDelay: 0, delay: 0},
            layers: new Array(LAYERS).fill(null), st: null};
  }
  function enableChannel(i, pc) {
    const C = player.channels[i];
    if (!C) return; // sequence_channel_enable on an un-initialised channel: no-op
    C.enabled = true; C.finished = false; C.delay = 0; C.stopScript = false; C.st = state(pc);
    for (let l = 0; l < LAYERS; l++) freeLayer(C, l);
  }
  function disableChannel(C) {
    if (!C) return;
    for (let l = 0; l < LAYERS; l++) freeLayer(C, l);
    C.enabled = false; C.finished = true;
  }
  function initChannels(mask) {
    for (let i = 0; i < CHANNELS; i++) if (mask & (1 << i)) { disableChannel(player.channels[i]); player.channels[i] = newChannel(i); }
  }
  function freeChannels(mask) {
    for (let i = 0; i < CHANNELS; i++) if (mask & (1 << i)) { disableChannel(player.channels[i]); player.channels[i] = null; }
  }
  function setLayer(C, l, pc) {
    // seq_channel_layer_init defaults; note the 0x80 gate and instrument
    // 0xFF = "use the channel's"
    C.layers[l] = {ch: C, idx: l, enabled: true, finished: false, delay: 0, gate: 0, stop: false, continuous: false,
                   transposition: 0, noteDuration: 0x80, playPct: 0, shortDefault: 0, vel: 0, instr: 0xFF, adsr: null, pan: 0.5, noDrumPan: false, porta: null,
                   note: null, st: state(pc)};
  }
  function freeLayer(C, l) {
    const L = C.layers[l];
    if (!L) return;
    noteOff(L); L.enabled = false; L.finished = true; C.layers[l] = null;
  }
  const dynAddr = (C, slot) => u16at(C.dynTable + slot * 2);
  const envs = new Map();
  const envAt = a => {
    if (!envs.has(a)) {
      const pairs = [];
      for (let i = 0; i < 64; i++) { const d = (u16at(a + i * 4) << 16) >> 16, v = (u16at(a + i * 4 + 2) << 16) >> 16; pairs.push([d, v]); if (d <= 0) break; }
      envs.set(a, pairs);
    }
    return envs.get(a);
  };

  // seq_channel_layer_process_script_part4, JP/US: with a portamento mode set the voice starts on one
  // semitone and glides to the other — modes 1/3/5 from the C7 target to the written note, 2/4 from the
  // note to the target; `cur += speed` per update, scale = 1 + extent·(2^(min(cur,127)/127) − 1) with
  // extent = f(end)/f(start) − 1. Special (mode & 0x80): speed = 32512·tempo / (delay·gTempoInternalToExternal·time),
  // i.e. the glide takes time/256 of the note's delay; plain: speed = 127/time, the glide takes `time` updates.
  function portaFor(L, semitone, delay) {
    const P = L.porta;
    if (!P || (P.mode & 0x7F) === 0) return null;
    const m = P.mode & 0x7F, toNote = m === 1 || m === 3 || m === 5;
    const start = toNote ? P.target : semitone, end = toNote ? semitone : P.target;
    const special = !!(P.mode & 0x80);
    // updates the glide lasts: special → delay ticks × (14360 / (tempo·48)) updates × time/256; plain → time
    const updates = special ? delay * 14360 / (player.tempo * 48) * P.time / 256 : P.time;
    return {mode: P.mode, start, end, updates: Math.max(1e-9, updates), special, time: P.time};
  }
  function layerTick(L) {
    if (!L.enabled) return;
    if (L.delay > 1) {
      L.delay--;
      // the gate: release once the remaining delay is inside the gate portion
      if (!L.stop && L.delay <= L.gate) { noteOff(L); L.stop = true; }
      return;
    }
    if (!L.continuous) noteOff(L);
    // seq_channel_layer_process_script_part1: portamento modes 1 and 2 are one-shot (the C7 applies to the note of its own command run)
    if (L.porta && ((L.porta.mode & 0x7F) === 1 || (L.porta.mode & 0x7F) === 2)) L.porta = null;
    const s = L.st, C = L.ch;
    let cmd, guard = 0;
    for (;;) {
      if (++guard > SPIN_LIMIT) throw new Error(`layer ${C.idx}.${L.idx} spins without a delay near ${hex(s.pc)}`);
      cmd = u8(s);
      if (cmd <= 0xC0) break;
      if (cmd === 0xFF) {
        if (s.depth === 0) { noteOff(L); L.enabled = false; L.finished = true; return; }
        s.pc = s.stack[--s.depth];
        continue;
      }
      if (flow(L, s, cmd, "layer")) continue;
      switch (cmd) {
        case 0xC1: L.vel = u8(s); break;                       // short-note velocity
        case 0xC2: L.transposition = s8(s); break;
        case 0xC3: L.shortDefault = cu16(s); break;            // short-note default delay
        case 0xC4: L.continuous = true; noteOff(L); break;     // legato on
        case 0xC5: L.continuous = false; noteOff(L); break;
        case 0xC6: L.instr = u8(s); if (L.instr < 0x7F) L.adsr = {inst: L.instr}; break; // get_instrument: the layer takes that instrument's envelope + release
        // layer_portamento (seqplayer.c JP/US): mode byte (bit 0x80 = "special": the time is a u8 fraction of the
        // note, else a compressed u16 of updates), the target semitone (transposed like a note; >= 0x80 → 0)
        case 0xC7: { const mode = u8(s); let target = u8(s) + C.transposition + L.transposition + player.transposition; if (target >= 0x80) target = 0;
                     const time = mode & 0x80 ? u8(s) : cu16(s); L.porta = {mode, target, time}; break; }
        case 0xC8: L.porta = null; break;                      // layer_disableportamento
        case 0xC9: L.noteDuration = u8(s); break;              // short-note gate
        case 0xCA: L.pan = u8(s) / 128; break;                  // layer pan
        case 0xCB: { const a = u16(s); L.adsr = {envelope: envAt(a), releaseRate: u8(s)}; break; }
        case 0xCC: L.noDrumPan = true; break;                  // ignore drum pan: the layer's pan instead of the drum's
        case 0xCD: if (!oot) throw fail("layer", cmd, s.pc - 1); u8(s); stub("layer stereo CD"); break;
        case 0xCE: if (!oot) throw fail("layer", cmd, s.pc - 1); u8(s); stub("layer bendfine CE"); break;
        case 0xCF: if (!oot) throw fail("layer", cmd, s.pc - 1); u8(s); stub("layer release CF"); break;
        case 0xF0: if (!oot) throw fail("layer", cmd, s.pc - 1); u16(s); stub("layer F0"); break;
        case 0xF1: if (!oot) throw fail("layer", cmd, s.pc - 1); u8(s); stub("layer F1"); break;
        default:
          if ((cmd & 0xF0) === 0xD0) { L.vel = shortVel(cmd & 0xF); break; }
          if ((cmd & 0xF0) === 0xE0) { L.noteDuration = shortGate(cmd & 0xF); break; }
          throw fail("layer", cmd, s.pc - 1);
      }
    }
    if (cmd === 0xC0) { L.delay = cu16(s); L.stop = true; noteOff(L); return; } // rest
    L.stop = false;
    let delay;
    if (C.largeNotes) {
      switch (cmd & 0xC0) {
        case 0x00: delay = cu16(s); L.vel = u8(s); L.noteDuration = u8(s); L.playPct = delay; break;
        case 0x40: delay = cu16(s); L.vel = u8(s); L.noteDuration = 0; L.playPct = delay; break;
        case 0x80: delay = L.playPct; L.vel = u8(s); L.noteDuration = u8(s); break;
      }
    } else {
      switch (cmd & 0xC0) {
        case 0x00: delay = cu16(s); L.playPct = delay; break;
        case 0x40: delay = L.shortDefault; break;
        case 0x80: delay = L.playPct; break;
      }
    }
    L.delay = delay;
    L.gate = (L.noteDuration * delay) >> 8;
    const instr = L.instr === 0xFF ? C.instr : L.instr;
    const drum = instr === 0x7F;
    const semi = cmd & 0x3F;
    // drums skip the sequence-level transposition (get_drum path)
    const pitch = drum ? semi + C.transposition + L.transposition
                       : semi + player.transposition + C.transposition + L.transposition;
    if (!drum && (pitch < 0 || pitch >= 0x80)) { L.stop = true; return; } // out of range = silent, like the game
    noteOn(L, {tick, dur: 0, ch: C.idx, layer: L.idx, semitone: pitch, drum,
               midi: drum ? null : pitch + SEMITONE_TO_MIDI, vel: L.vel, inst: instr, gate: L.noteDuration,
               bank: C.bank, vol: C.volume * C.volumeScale * player.volume, pan: C.pan, panWeight: C.panWeight, lyPan: L.pan, noDrumPan: L.noDrumPan, freq: C.freqScale, rev: C.reverb,
               chEnv: C.envelope, chRel: C.release, chInst: C.adsrInst, lyAdsr: L.adsr, chSustain: C.sustain, revIdx: C.reverbIndex,
               filter: C.filter ? [...C.filter] : null, comb: C.comb, chGain: C.gain,
               // note_vibrato_init: a note born with no extent (start and target 0) never vibrates
               vib: C.vib.extStart || C.vib.extTarget ? {...C.vib} : null,
               porta: drum ? null : portaFor(L, pitch, delay)});
    // mode 5: the next note glides from this one (layer->portamentoTargetNote = cmd)
    if (!drum && L.porta && (L.porta.mode & 0x7F) === 5) L.porta.target = pitch;
  }

  function channelTick(C) {
    if (!C.enabled) return;
    if (!C.stopScript) {
      if (C.delay !== 0) C.delay--;
      const s = C.st;
      if (C.delay === 0) {
        let guard = 0;
        for (;;) {
          if (++guard > SPIN_LIMIT) throw new Error(`channel ${C.idx} spins without a delay near ${hex(s.pc)}`);
          const cmd = u8(s);
          if (cmd === 0xFF) {
            if (s.depth === 0) { disableChannel(C); break; }
            s.pc = s.stack[--s.depth];
            continue;
          }
          if (cmd === 0xFE) break;
          if (cmd === 0xFD) { C.delay = cu16(s); break; }
          if (!oot && cmd === 0xF3) { C.stopScript = true; break; } // chan_hang
          if (oot && cmd === 0xEA) { C.stopScript = true; break; }
          // OoT dispatches full opcodes from 0xB0 (seqplayer.c "cmd >= 0xB0"), MM
          // from 0xA0; below that the low nibble/3 bits select a layer or io slot
          if (cmd > 0xC0 || (oot && cmd >= (mm ? 0xA0 : 0xB0))) { if (!flow(C, s, cmd, "channel")) channelOp(C, s, cmd); continue; }
          if (channelLow(C, s, cmd)) break; // a short delay ends this tick's run, like FD
        }
      }
    }
    for (const L of C.layers) if (L) layerTick(L);
  }

  // set_instrument: a real instrument (< 0x7F) loads its envelope and release
  // into the channel, replacing any DA/D9 override; 0x7F (drums) and >= 0x80
  // (the synth waveforms) leave the channel's adsr as it was
  function chanParams(C, [tr, pan, weight, rev, revIdx]) {
    C.transposition = (tr << 24) >> 24; C.pan = pan / 128; C.panWeight = weight / 128; C.reverb = rev; C.reverbIndex = revIdx;
  }
  function setInstr(C, id) {
    C.instr = id;
    if (id < 0x7F) { C.adsrInst = id; C.envelope = null; C.release = null; }
  }
  const wrap8 = v => (v << 24) >> 24;
  const seqVal = v => oot ? wrap8(v) : v;
  function channelOp(C, s, cmd) {
    const at = s.pc - 1;
    switch (cmd) {
      case 0xF2: if (oot) throw fail("channel", cmd, at); u8(s); break;            // sm64 reservenotes
      case 0xF1: if (oot) u8(s); break;                                            // sm64 unreserve / oot allocnotelist
      case 0xF0: if (!oot) throw fail("channel", cmd, at); break;                  // oot freenotelist
      case 0xC1: setInstr(C, u8(s)); break;
      case 0xC2: C.dynTable = u16(s); break;
      case 0xC3: C.largeNotes = false; break;
      case 0xC4: C.largeNotes = true; break;
      case 0xC5: if (C.value !== -1) C.dynTable = dynAddr(C, C.value); break;
      case 0xC6: C.bank = u8(s); break;
      case 0xC7: { const v = u8(s), a = u16(s); poke(a, (C.value + v) & 0xFF); break; }
      case 0xC8: C.value = wrap8(C.value - u8(s)); break;
      case 0xC9: C.value = wrap8(C.value & u8(s)); break;
      case 0xCC: C.value = wrap8(u8(s)); break;
      case 0xCA: u8(s); break;                                                     // mute behaviour
      case 0xCB: { const a = (u16(s) + C.value) & 0xFFFF; C.value = wrap8(at(a)); break; }
      case 0xCD: if (!oot) throw fail("channel", cmd, at); disableChannel(player.channels[u8(s)]); break;
      case 0xCE: if (!oot) throw fail("channel", cmd, at); u16(s); stub("channel ldptr CE"); break;
      case 0xCF: if (!oot) throw fail("channel", cmd, at); u16(s); stub("channel stptrtoseq CF"); break;
      case 0xD4: C.reverb = u8(s); break;                                          // chan_setreverb: the wet send, 0..127
      case 0xD2: if (oot) { C.sustain = u8(s); break; } u8(s); stub("channel sound-shaping " + hex(cmd)); break;   // oot: adsr.sustain
      case 0xE5: if (oot) { C.reverbIndex = u8(s); break; } u8(s); stub("channel sound-shaping " + hex(cmd)); break; // oot: reverbIndex
      case 0xED: if (oot) { C.gain = u8(s); break; } u8(s); stub("channel sound-shaping " + hex(cmd)); break;        // oot: gain (UQ4.4)
      case 0xD0: case 0xD1: case 0xD5: case 0xD6:
      case 0xE6: case 0xE9:
        u8(s); stub("channel sound-shaping " + hex(cmd)); break;
      case 0xD9: C.release = u8(s); break;
      case 0xDD: C.pan = u8(s) / 128; break;
      case 0xDC: C.panWeight = u8(s) / 128; break;                                 // chan_setpanmix: how much of the pan is the channel's (rest: the layer's / the drum's)
      case 0xDF: C.volume = u8(s) / 127; noteLevel(C); break;
      case 0xE0: C.volumeScale = u8(s) / 128; noteLevel(C); break;
      // vibrato (seqplayer.c JP/US): D7 rate = u8·32 (start = target, no ramp), D8 extent target = u8·8
      // (start 0, no ramp), E1/E2 rate/extent start, target, ramp = u8·16 updates, E3 delay = u8·16 updates
      case 0xD7: { const r = u8(s) * 32; C.vib = {...C.vib, rateStart: r, rateTarget: r, rateDelay: 0}; noteVib(C); break; }
      case 0xD8: C.vib = {...C.vib, extTarget: u8(s) * 8, extStart: 0, extDelay: 0}; noteVib(C); break;
      case 0xE1: C.vib = {...C.vib, rateStart: u8(s) * 32, rateTarget: u8(s) * 32, rateDelay: u8(s) * 16}; noteVib(C); break;
      case 0xE2: C.vib = {...C.vib, extStart: u8(s) * 8, extTarget: u8(s) * 8, extDelay: u8(s) * 16}; noteVib(C); break;
      case 0xE3: C.vib = {...C.vib, delay: u8(s) * 16}; break;
      case 0xD3: C.freqScale = 0.5 * Math.pow(2, (s8(s) + 127) / 127); noteBend(C); break; // gPitchBendFrequencyScale
      case 0xDE: C.freqScale = s16(s) / 32768; noteBend(C); break;
      case 0xEE: if (!oot) throw fail("channel", cmd, at); u8(s); stub("channel bendfine EE"); break;
      case 0xDA: C.envelope = envAt(u16(s)); break;
      case 0xDB: C.transposition = s8(s); break;
      // oot ASEQ_OP_CHAN_PARAMS / LDPARAMS: muteBehavior, noteAllocPolicy, priority, then transposition, pan,
      // pan weight, reverb send, reverb index — inline (E8, 8 bytes) or from the sequence data at a u16 (E7)
      case 0xE8: if (oot) { u8(s); u8(s); u8(s); chanParams(C, [u8(s), u8(s), u8(s), u8(s), u8(s)]); break; } u8(s); u8(s); u8(s); stub("channel " + hex(cmd)); break;
      case 0xE7: if (oot) { const a = u16(s); chanParams(C, [3, 4, 5, 6, 7].map(k => byteAt(a + k))); break; } u16(s); stub("channel ldparams E7"); break;
      case 0xE4: if (C.value !== -1) { const a = dynAddr(C, C.value); push(s, s.pc); s.pc = a; } break;
      case 0xEB: C.bank = u8(s); setInstr(C, u8(s)); break;
      case 0xEC: C.vib = {rateStart: 0, rateTarget: 0, rateDelay: 0, extStart: 0, extTarget: 0, extDelay: 0, delay: 0}; C.freqScale = 1; noteVib(C); noteBend(C); break; // chan_reset: vibrato off, bend cleared
      default: {
        // OoT B0-BD / MM A0-BE: argument widths from each decomp's
        // sSeqInstructionArgsTable (oot src/audio/internal/seqplayer.c, mm
        // src/audio/lib/seqplayer.c). They disagree at BD (OoT randptr s16,s16;
        // MM s16) and BE (OoT none; MM u8); OoT has no A0-AF at all.
        if (!oot || cmd < 0xA0 || cmd > 0xBE) throw fail("channel", cmd, at);
        // the note filter: B0 points the channel at 8 s16 taps in the sequence data, B3 rewrites them
        // there (so a later B0 of the same address sees the rewrite), B1 drops it; BB sets the comb filter
        if (cmd === 0xB0) { const a = u16(s); C.filter = filterAt(a); break; }
        if (cmd === 0xB1) { C.filter = null; break; }
        if (cmd === 0xB3) { const v = u8(s); if (C.filter) C.filter.splice(0, 8, ...ootFilterTaps((v >> 4) & 0xF, v & 0xF)); break; }
        if (cmd === 0xBB) { const size = u8(s), gain = s16(s); C.comb = size && gain ? {size, gain} : null; break; }
        const sizes = mm
          ? {0xA0: [2], 0xA1: [], 0xA2: [2], 0xA3: [], 0xA4: [1], 0xA5: [], 0xA6: [1, 2], 0xA7: [1], 0xA8: [2, 2],
             0xA9: [], 0xAA: [], 0xAB: [], 0xAC: [], 0xAD: [], 0xAE: [], 0xAF: [],
             0xB0: [2], 0xB1: [], 0xB2: [2], 0xB3: [1], 0xB4: [], 0xB5: [], 0xB6: [], 0xB7: [2], 0xB8: [1],
             0xB9: [1], 0xBA: [1], 0xBB: [1, 2], 0xBC: [2], 0xBD: [2], 0xBE: [1]}
          : {0xB0: [2], 0xB1: [], 0xB2: [2], 0xB3: [1], 0xB4: [], 0xB5: [], 0xB6: [], 0xB7: [2], 0xB8: [1],
             0xB9: [1], 0xBA: [1], 0xBB: [1, 2], 0xBC: [2], 0xBD: [2, 2], 0xBE: []};
        const sz = sizes[cmd];
        if (!sz) throw fail("channel", cmd, at);
        for (const n of sz) n === 2 ? u16(s) : u8(s);
        if (cmd === 0xB8 || cmd === 0xB7) C.value = 0; // random: pinned so output is reproducible
        stub("channel oot " + hex(cmd));
      }
    }
  }

  function channelLow(C, s, cmd) {
    const at = s.pc - 1;
    if (!oot) {
      const lo = cmd & 0xF;
      // soundScriptIO has 8 slots; a higher index is an OoT opcode (0x88 ldlayer) fed to the wrong table.
      // 0x60|n is note priority (n is the priority, 2..15 in every SM64 song), not an io op.
      if (lo >= 8 && (cmd & 0xF0) >= 0x50 && (cmd & 0xF0) <= 0x80 && (cmd & 0xF0) !== 0x60) throw fail("channel", cmd, at);
      switch (cmd & 0xF0) {
        case 0x00: if (C.layers[lo]) C.value = C.layers[lo].finished ? 1 : 0; break;
        case 0x10: enableChannel(lo, u16(s)); break;
        case 0x20: disableChannel(player.channels[lo]); break;
        case 0x30: { const io = u8(s); const T = player.channels[lo]; if (T) T.io[io] = C.value; break; }
        case 0x40: { const io = u8(s); const T = player.channels[lo]; C.value = T ? T.io[io] : -1; ioReads++; break; }
        case 0x50: C.value = wrap8(C.value - C.io[lo]); ioReads++; break;
        case 0x60: break;                                                          // note priority
        case 0x70: C.io[lo] = C.value; break;
        case 0x80: C.value = C.io[lo]; if (lo < 4) C.io[lo] = -1; ioReads++; break;
        case 0x90: setLayer(C, lo & 3, u16(s)); break;
        case 0xA0: freeLayer(C, lo & 3); break;
        case 0xB0: if (C.value !== -1) setLayer(C, lo & 3, dynAddr(C, C.value)); break;
        default: throw fail("channel", cmd, at);
      }
      return;
    }
    const lo = cmd & 0xF, l = cmd & 7;
    switch (cmd & 0xF8) {
      // cdelay: `channel->delay = lowBits; goto exit_loop` (oot seqplayer.c); mm keeps running on a 0
      case 0x00: case 0x08: C.delay = lo; return !(mm && lo === 0);
      case 0x10: case 0x18: throw fail("channel (ldsample)", cmd, at);
      case 0x20: case 0x28: enableChannel(lo, u16(s)); return;
      case 0x30: case 0x38: { const io = u8(s); const T = player.channels[lo]; if (T) T.io[io] = C.value; return; }
      case 0x40: case 0x48: { const io = u8(s); const T = player.channels[lo]; C.value = T ? T.io[io] : -1; ioReads++; return; }
      case 0x50: case 0x58: C.value = wrap8(C.value - C.io[lo]); ioReads++; return;
      case 0x60: case 0x68: C.value = C.io[lo]; if (lo < 2) C.io[lo] = -1; ioReads++; return;
      case 0x70: C.io[l] = C.value; return;
      case 0x78: { const r = s16(s); setLayer(C, l & 3, s.pc + r); return; }
      case 0x80: if (C.layers[l]) C.value = C.layers[l].finished ? 1 : 0; return;
      case 0x88: setLayer(C, l & 3, u16(s)); return;
      case 0x90: freeLayer(C, l & 3); return;
      case 0x98: if (C.value !== -1) setLayer(C, l & 3, dynAddr(C, C.value)); return;
    }
    throw fail("channel", cmd, at);
  }

  function setTempo(bpm) {
    player.tempo = Math.max(1, bpm);
    const last = tempos[tempos.length - 1];
    if (last && last.tick === tick) last.bpm = player.tempo; else tempos.push({tick, bpm: player.tempo});
  }

  function seqTick() {
    const s = player.st;
    if (player.delay > 1) { player.delay--; return; }
    let guard = 0;
    for (;;) {
      if (++guard > SPIN_LIMIT) throw new Error(`sequence script spins without a delay near ${hex(s.pc)}`);
      if (s.depth === 0 && !firstVisit.has(s.pc)) firstVisit.set(s.pc, tick);
      const cmd = u8(s);
      const at = s.pc - 1;
      if (cmd === 0xFF) {
        if (s.depth === 0) { player.enabled = false; freeChannels(0xFFFF); return; }
        s.pc = s.stack[--s.depth];
        continue;
      }
      if (cmd === 0xFD) { player.delay = cu16(s); return; }
      if (cmd === 0xFE) { player.delay = 1; return; }
      if (cmd >= 0xC0) {
        if (flow(player, s, cmd, "sequence")) { if (loop && stopAtLoop) return; continue; }
        switch (cmd) {
          case 0xF2: if (oot) throw fail("sequence", cmd, at); u8(s); break;
          case 0xF1: if (oot) u8(s); break;
          case 0xF0: if (!oot) throw fail("sequence", cmd, at); break;
          case 0xDF: player.transposition = s8(s); break;
          case 0xDE: player.transposition += s8(s); break;
          case 0xDD: setTempo(u8(s)); break;
          case 0xDC: setTempo(player.tempo + s8(s)); break;
          // seq_setvol: fadeVolume = u8/127 at once (a game-started fade would instead retarget it — none run here);
          // seq_changevol: fadeVolume += (s8)/127, clamped by sequence_player_process_sound. Both reach every
          // held note at the next update, so the channels' level timelines take a step.
          case 0xDB: player.volume = u8(s) / 127; for (const C of player.channels) if (C) noteLevel(C); break;
          case 0xDA: if (oot) { u8(s); u16(s); stub("sequence volume change DA"); } else { player.volume = Math.max(0, Math.min(1, player.volume + s8(s) / 127)); for (const C of player.channels) if (C) noteLevel(C); } break;
          case 0xD9: u8(s); break;
          case 0xD7: initChannels(u16(s)); break;
          case 0xD6: freeChannels(u16(s)); break;
          case 0xD5: case 0xD3: case 0xD0: u8(s); break;                           // mute scale / behaviour, note alloc
          case 0xD4: break;                                                        // mute
          case 0xD2: player.shortVel = u16(s); break;
          case 0xD1: player.shortGate = u16(s); break;
          // the sequence register is an s8 in the OoT generation (SeqScriptState.value;
          // MM's Ballad of the Wind Fish does `ldio 4; sub 0xFF; rbeqz` and relies on the
          // wrap) but a local s32 in SM64 (sequence_player_process_sequence)
          case 0xCC: player.value = seqVal(u8(s)); break;
          case 0xC9: player.value = seqVal(player.value & u8(s)); break;
          case 0xC8: player.value = seqVal(player.value - u8(s)); break;
          case 0xCE: if (!oot) throw fail("sequence", cmd, at); u8(s); player.value = 0; stub("sequence random CE"); break;
          case 0xCD: if (!oot) throw fail("sequence", cmd, at); { const t = u16(s); if (player.value !== -1) { push(s, s.pc); s.pc = u16at(t + player.value * 2); } } break;
          case 0xC7: { const v = u8(s), a = u16(s); poke(a, (player.value + v) & 0xFF); break; }
          case 0xC6: if (!oot) throw fail("sequence", cmd, at); player.enabled = false; freeChannels(0xFFFF); return;
          case 0xC5: case 0xC3: case 0xC2: if (!oot) throw fail("sequence", cmd, at); u16(s); stub("sequence " + hex(cmd)); break;
          case 0xC4: if (!oot) throw fail("sequence", cmd, at); u8(s); u8(s); stub("sequence runseq C4"); break;
          case 0xEF: if (!oot) throw fail("sequence", cmd, at); u16(s); u8(s); stub("sequence EF"); break;
          default: throw fail("sequence", cmd, at);
        }
        continue;
      }
      const lo = cmd & 0xF;
      switch (cmd & 0xF0) {
        case 0x00: { const C = player.channels[lo]; if (C) player.value = C.finished ? 1 : 0; break; }
        case 0x40: if (!oot) throw fail("sequence", cmd, at); disableChannel(player.channels[lo]); break;
        case 0x50: player.value = seqVal(player.value - (oot ? player.io[lo] : player.variation)); if (oot) ioReads++; break;
        case 0x60: if (!oot) throw fail("sequence", cmd, at); u8(s); u8(s); stub("sequence ldres 0x6n"); break;
        case 0x70: if (oot) player.io[lo] = player.value; else player.variation = player.value; break;
        case 0x80: if (oot) { player.value = player.io[lo]; if (lo < 2) player.io[lo] = -1; ioReads++; } else player.value = player.variation; break;
        case 0x90: enableChannel(lo, u16(s)); break;
        case 0xA0: if (!oot) throw fail("sequence", cmd, at); { const r = s16(s); enableChannel(lo, s.pc + r); } break;
        case 0xB0: if (!oot) throw fail("sequence", cmd, at); u8(s); u16(s); stub("sequence ldseq 0xBn"); break;
        default: throw fail("sequence", cmd, at);
      }
    }
  }

  // ---- the clock. Order per tick matches process_sequences: sequence
  // script, then each channel (its script, then its layers).
  let truncated = false;
  for (;;) {
    if (!player.enabled) break;
    if (tick >= maxTicks || seconds >= maxSeconds) { truncated = true; break; }
    seqTick();
    if (!player.enabled) break;
    if (loop && stopAtLoop && loop.at === tick) break; // the jump was taken this tick: stop before pass two starts
    for (const C of player.channels) if (C) channelTick(C);
    seconds += 60 / (player.tempo * TICKS_PER_BEAT);
    tick++;
  }
  for (const C of player.channels) if (C) for (const L of C.layers) if (L) noteOff(L);
  notes.sort((a, b) => a.tick - b.tick || a.ch - b.ch || a.layer - b.layer);
  // each note carries the level steps and vibrato-target changes that land while it sounds
  // (offsets in ticks from its start); n.vol stays the level at note-on
  const byCh = m => { const o = new Map(); for (const e of m) (o.get(e.ch) || o.set(e.ch, []).get(e.ch)).push(e); return o; };
  const lv = byCh(levelEvents), vb = byCh(vibEvents), bd = byCh(bendEvents);
  for (const n of notes) {
    // the roll: a glide that lands on another pitch is one note at the landed pitch (n.slide, the shared shape);
    // one that returns to the written pitch stays one note
    if (n.porta && n.porta.end !== n.semitone) n.slide = [{t: 0, len: Math.max(1, Math.round(n.porta.updates * player.tempo * 48 / 14360)), to: n.porta.end - n.semitone}];
    const end = n.tick + n.dur;
    const steps = (lv.get(n.ch) || []).filter(e => e.tick > n.tick && e.tick < end);
    if (steps.length) { n.gain = [{t: 0, l: n.vol}]; for (const e of steps) if (e.level !== n.gain[n.gain.length - 1].l) n.gain.push({t: e.tick - n.tick, l: e.level}); if (n.gain.length === 1) delete n.gain; }
    if (n.vib) { const ch = (vb.get(n.ch) || []).filter(e => e.tick > n.tick && e.tick < end); if (ch.length) n.vibChanges = ch.map(e => ({t: e.tick - n.tick, rateTarget: e.rateTarget, rateDelay: e.rateDelay, extTarget: e.extTarget, extDelay: e.extDelay})); }
    // the channel bend while the note holds (n.freq is its value at the note-on): {t ticks from the start, f}
    const bends = (bd.get(n.ch) || []).filter(e => e.tick > n.tick && e.tick < end);
    if (bends.length) { let f = n.freq; const fc = []; for (const e of bends) if (e.freq !== f) { fc.push({t: e.tick - n.tick, f: e.freq}); f = e.freq; } if (fc.length) n.freqChanges = fc; }
  }
  if (!tempos.length || tempos[0].tick !== 0) tempos.unshift({tick: 0, bpm: 120}); // init_sequence_player default

  return {abi, ticksPerBeat: TICKS_PER_BEAT, notes, tempos, endTick: tick, seconds, loop,
          truncated, selfModified, ioReads, stubbed: [...stubbed].sort(),
          channels: [...new Set(notes.map(n => n.ch))].sort((a, b) => a - b)};
}

// seconds elapsed at `tick` under a tempo map [{tick, bpm}] (ticks at 48/beat)
export function tickSeconds(tempos, tick) {
  let sec = 0;
  for (let i = 0; i < tempos.length; i++) {
    const from = tempos[i].tick, to = i + 1 < tempos.length ? Math.min(tempos[i + 1].tick, tick) : tick;
    if (to > from) sec += (to - from) * 60 / (tempos[i].bpm * TICKS_PER_BEAT);
    if (tick <= to) break;
  }
  return sec;
}
