// Parsed N64 sequence -> the repo's .notes.txt and a type-1 MIDI.
// Ticks are exact 48ths of a beat, so nothing is quantized here (the NSF
// path snaps because frame counts drift; sequence data has no drift).
// Meter is the caller's assumption: the format carries none.
import { pitchName } from "../nsf/notes.mjs";
import { makeMidiTracks, PPQ } from "../nsf/midi-write.mjs";
import { TICKS_PER_BEAT } from "./constants.mjs";

const label = n => n.drum ? "D" + n.semitone : pitchName(n.midi);

export function toNotesTxt(res, {title = "n64", tsNum = 4, tsDen = 4} = {}) {
  const beatsPerBar = tsNum * 4 / tsDen;
  const ticksPerBar = beatsPerBar * TICKS_PER_BEAT;
  const bars = Math.ceil(res.endTick / ticksPerBar);
  const tempo = res.tempos.map(t => t.bpm).join("→");
  const L = [];
  L.push(`# ${title} — ${tsNum}/${tsDen} (assumed; the sequence carries no meter), ${tempo}bpm, ${bars} bars (from N64 sequence, ${res.abi} ABI)`);
  L.push("# Format: bar N: beat pitch duration-in-quarter-notes vN [velocity 0-127 from the note command]. Drums are D<index> (bank not read; index is not a pitch).");
  L.push("# Channel identity is sequence fact. Pitches use sharp spelling and the +21 root convention (bank tuning not applied); no key is stated.");
  if (res.loop) L.push(`# loop: returns to tick ${res.loop.tick} (beat ${(res.loop.tick / TICKS_PER_BEAT + 1).toFixed(2)}) after tick ${res.loop.at}`);
  const byCh = new Map();
  for (const n of res.notes) { if (!byCh.has(n.ch)) byCh.set(n.ch, []); byCh.get(n.ch).push(n); }
  for (const ch of [...byCh.keys()].sort((a, b) => a - b)) {
    const evs = byCh.get(ch);
    const insts = [...new Set(evs.map(n => n.inst))].map(i => i === 0x7F ? "drums" : i == null ? "none" : i).join(",");
    L.push("");
    L.push(`## channel ${ch} (instrument ${insts})`);
    const rows = {};
    for (const n of evs) {
      const bar = Math.floor(n.tick / ticksPerBar) + 1;
      const beat = (n.tick - (bar - 1) * ticksPerBar) / TICKS_PER_BEAT + 1;
      (rows[bar] = rows[bar] || []).push(`${+beat.toFixed(2)} ${label(n)} ${+(n.dur / TICKS_PER_BEAT).toFixed(2)} v${n.vel}`);
    }
    for (const bar of Object.keys(rows).map(Number).sort((a, b) => a - b)) L.push("bar " + bar + ": " + rows[bar].join(", "));
  }
  return L.join("\n") + "\n";
}

// One MIDI track per N64 channel, MIDI channel = N64 channel (identity over
// GM conventions: a melodic N64 channel 9 stays on 9). Drum indexes land on
// GM percussion keys 35+ so a DAW plays something; that offset is arbitrary.
export function toMidi(res, {tsNum = 4, tsDen = 4} = {}) {
  const scale = PPQ / TICKS_PER_BEAT;
  const byCh = new Map();
  for (const n of res.notes) {
    if (!byCh.has(n.ch)) byCh.set(n.ch, []);
    const p = n.drum ? Math.min(127, 35 + n.semitone) : n.midi;
    if (p < 0 || p > 127) continue;
    byCh.get(n.ch).push({t: n.tick * scale, d: Math.max(1, n.dur * scale), p, v: Math.max(1, Math.min(127, n.vel))});
  }
  const tracks = [...byCh.keys()].sort((a, b) => a - b).map(ch => {
    const first = res.notes.find(n => n.ch === ch);
    const inst = first.drum ? "drums" : first.inst == null ? "" : "inst " + first.inst;
    return {name: `ch ${ch}${inst ? " " + inst : ""}`, ch, notes: byCh.get(ch),
            program: first.drum || first.inst == null ? undefined : first.inst & 0x7F};
  });
  return makeMidiTracks(tracks, {tempos: res.tempos.map(t => ({t: t.tick * scale, bpm: t.bpm})), tsNum, tsDen});
}
