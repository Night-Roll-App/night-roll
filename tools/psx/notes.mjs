// SEQ events (+ optional VAB) -> note events per channel/program, then
// .notes.txt and MIDI. Discovery-mode rules as tools/nsf/notes.mjs: pitch,
// time, duration, channel, program. Nothing interpretive.
//
// Pitch has two readings. Without a bank the SEQ key is reported as-is:
// it is what the composer played, and banks are built so that key 60
// sounds C4 more often than not. With a bank the key goes through the
// tone: sounding = root + (key − center), root being the note the sample
// sounds at 44100 Hz — estimated from the decoded sample, assumed C4 when
// the sample has no clear period. Both readings are kept on the note.
import { secondsAt, barBeat, bpmOf } from "./seq.mjs";
import { tonesFor, vagPcm, estimateRoot } from "./vab.mjs";
import { pitchName } from "../nsf/notes.mjs";
import { trackBytes } from "../nsf/midi-write.mjs";

const PPQ = 480; // Night Roll's MIDI resolution; SEQ ticks are rescaled to it

// A kit: several one-key (or near) tones on different samples. A single
// sample spread across the keyboard is an instrument even if it is a drum.
export function isDrumProgram(prog) {
  if (!prog || prog.tones.length < 2) return false;
  const vags = new Set(prog.tones.map(t => t.vag));
  return vags.size >= 2 && prog.tones.every(t => t.max - t.min <= 3);
}

// -> {notes, channels, programs, seq, vab}
// notes: {tick, endTick, ch, key, vel, program, pitch, cents, drum, tone, root}
export function seqNotes(seq, {vab = null, drums = []} = {}) {
  const notes = [];
  const open = new Map();          // "ch:key" -> note
  const program = new Array(16).fill(0);
  const bends = new Array(16).fill(0);
  const roots = new Map();         // vag -> estimateRoot() | null
  const rootOf = vag => {
    if (!roots.has(vag)) roots.set(vag, estimateRoot(vagPcm(vab, vag)));
    return roots.get(vag);
  };
  const drumSet = new Set(drums);
  const programInfo = new Map();   // program -> {drum, tones seen}

  for (const e of seq.events) {
    if (e.type === "program") { program[e.ch] = e.program; continue; }
    if (e.type === "bend") { bends[e.ch]++; continue; }
    if (e.type !== "on" && e.type !== "off") continue;
    const id = e.ch + ":" + e.key;
    const prev = open.get(id);
    if (prev) { prev.endTick = e.tick; open.delete(id); } // retrigger closes the old one
    if (e.type === "off") continue;
    const p = program[e.ch];
    const n = {tick: e.tick, endTick: null, ch: e.ch, key: e.key, vel: e.vel, program: p, pitch: e.key, cents: 0, drum: false, tone: null, root: null};
    if (vab) {
      const prog = vab.programs[p];
      n.drum = drumSet.has(p) || isDrumProgram(prog);
      const tone = tonesFor(vab, p, e.key)[0] || null;
      if (tone) {
        n.tone = {center: tone.center, shift: tone.shift, vag: tone.vag};
        if (!n.drum) {
          const root = rootOf(tone.vag);
          n.root = root;
          // shift direction follows VGMTrans (+ = sharper); see RESEARCH.md §3
          const exact = (root ? root.midi + root.cents / 100 : 60) + (e.key - tone.center) + tone.shift / 128;
          n.pitch = Math.round(exact);
          n.cents = Math.round((exact - n.pitch) * 100);
        }
      }
      if (!programInfo.has(p)) programInfo.set(p, {program: p, drum: n.drum, tones: prog ? prog.tones.length : 0, missing: !prog});
    } else if (drumSet.has(p)) n.drum = true;
    open.set(id, n);
    notes.push(n);
  }
  for (const n of open.values()) n.endTick = seq.endTick;
  notes.sort((a, b) => a.tick - b.tick || a.ch - b.ch || a.key - b.key);
  const channels = [...new Set(notes.map(n => n.ch))].sort((a, b) => a - b);
  return {notes, channels, programs: [...programInfo.values()], bends, seq, vab};
}

// keep notes that start before `seconds`; clip the rest
export function trimSeconds(result, seconds) {
  if (!(seconds > 0)) return result;
  const {seq} = result;
  const notes = result.notes.filter(n => secondsAt(seq, n.tick) < seconds);
  return {...result, notes};
}

const fmt = x => +x.toFixed(3);

// result.source (set by akao.mjs) names the format and its pitch caveat;
// absent, the result is a SEQ
export function toNotesTxt(result, {title = "seq"} = {}) {
  const {notes, seq, vab, bends, source} = result;
  const {num, den} = seq.timeSigs[0];
  const lastTick = notes.reduce((m, n) => Math.max(m, n.endTick), seq.endTick);
  const bars = barBeat(seq, Math.max(0, lastTick - 1)).bar;
  const L = [];
  L.push(`# ${title} — ${num}/${den}, ${bpmOf(seq.tempo)}bpm, ${bars} bars, ${seq.ppq} ticks/quarter (from ${source ? source.label : "PS1 SEQ"})`);
  // a tempo slide is many small steps; one line per distinct bar keeps it readable
  let lastTempoBar = -1;
  for (const t of seq.tempoMap.slice(1)) {
    const {bar, beat} = barBeat(seq, t.tick);
    if (bar === lastTempoBar) { L[L.length - 1] = L[L.length - 1].replace(/ → .*$|$/, ` → ${bpmOf(t.usq)}bpm by beat ${fmt(beat)}`); continue; }
    L.push(`# tempo ${bpmOf(t.usq)}bpm from bar ${bar} beat ${fmt(beat)}`);
    lastTempoBar = bar;
  }
  for (const t of seq.timeSigs.slice(1)) { const {bar} = barBeat(seq, t.tick); L.push(`# meter ${t.num}/${t.den} from bar ${bar}`); }
  if (seq.loop) {
    const a = barBeat(seq, seq.loop.start), b = barBeat(seq, seq.loop.end);
    L.push(`# loop: bar ${a.bar} beat ${fmt(a.beat)} → bar ${b.bar} beat ${fmt(b.beat)}${seq.loop.count === 127 ? " (forever)" : " ×" + seq.loop.count}`);
  }
  for (const w of seq.warnings || []) L.push(`# note: ${w}`);
  L.push("# Format: bar N: beat pitch duration-in-quarter-notes vN [= MIDI velocity 1-127]");
  L.push(source ? `# ${source.pitchNote}` : vab
    ? "# Pitch = sample root + (key − tone center); root detected from the sample, or C4 assumed where marked. Kits keep their key numbers."
    : "# Pitch is the SEQ key as written (no bank given: tone center notes unknown).");
  L.push("# Channel identity is file fact. Pitches use sharp spelling; no key is stated.");
  const byCh = new Map();
  for (const n of notes) (byCh.get(n.ch) || byCh.set(n.ch, []).get(n.ch)).push(n);
  for (const [ch, evs] of [...byCh].sort((a, b) => a[0] - b[0])) {
    L.push("");
    const progs = [...new Set(evs.map(n => n.program))];
    const voice = evs[0].voice !== undefined && evs[0].voice !== ch ? ` (voice ${evs[0].voice})` : "";
    L.push(`## channel ${ch + 1}${voice} program ${progs.join(",")}${evs.some(n => n.drum) ? " (kit)" : ""}`);
    if (bends[ch]) L.push(`# ${bends[ch]} pitch-bend events on this channel, not applied`);
    if (vab) for (const p of progs) {
      const sample = evs.find(n => n.program === p && n.tone);
      if (!sample) { L.push(`# program ${p}: no tone answers these keys`); continue; }
      if (sample.drum) continue;
      const r = sample.root;
      L.push(`# program ${p}: tone center ${pitchName(sample.tone.center)}, sample root ${r ? `${pitchName(r.midi)}${r.cents ? (r.cents > 0 ? "+" : "") + r.cents + "c" : ""} (detected, r=${r.confidence})` : "C4 assumed (no clear period)"}`);
    }
    const rows = {};
    for (const n of evs) {
      const {bar, beat} = barBeat(seq, n.tick);
      const dur = (n.endTick - n.tick) / seq.ppq;
      if (dur <= 0) continue;
      const label = n.drum ? "K" + n.key : pitchName(n.pitch) + (n.cents ? (n.cents > 0 ? "+" : "") + n.cents + "c" : "");
      (rows[bar] = rows[bar] || []).push(`${fmt(beat)} ${label} ${fmt(dur)} v${n.vel}`);
    }
    for (const bar of Object.keys(rows).map(Number).sort((a, b) => a - b)) L.push("bar " + bar + ": " + rows[bar].join(", "));
  }
  return L.join("\n") + "\n";
}

// type-1 MIDI: conductor (tempo map + meters) then one track per SEQ
// channel; kit programs land on MIDI channel 10 (index 9)
export function makeMidi(result) {
  const {notes, seq} = result;
  const scale = PPQ / seq.ppq;
  const T = tick => Math.round(tick * scale);
  const metas = [];
  for (const ts of seq.timeSigs) metas.push({t: T(ts.tick), d: [0xFF, 0x58, 4, ts.num, Math.round(Math.log2(ts.den)), 24, 8]});
  for (const tm of seq.tempoMap) metas.push({t: T(tm.tick), d: [0xFF, 0x51, 3, (tm.usq >> 16) & 255, (tm.usq >> 8) & 255, tm.usq & 255]});
  const tracks = [trackBytes("conductor", [], 0, metas)];
  const byCh = new Map();
  for (const n of notes) (byCh.get(n.ch) || byCh.set(n.ch, []).get(n.ch)).push(n);
  // MIDI channel per source channel: SEQ channels 0..15 keep their number
  // (file fact), except that a melodic channel 9 would land on GM drums;
  // AKAO voices run to 24, so those beyond 15 take free channels and then
  // share — a type-1 file keeps them apart as tracks either way
  const used = new Set([9]);
  const order = [...byCh].sort((a, b) => a[0] - b[0]);
  const midiCh = new Map();
  for (const [ch, evs] of order) if (!evs.every(n => n.drum) && ch < 16 && ch !== 9) { midiCh.set(ch, ch); used.add(ch); }
  let spare = 0;
  for (const [ch, evs] of order) {
    if (evs.every(n => n.drum)) midiCh.set(ch, 9);
    else if (!midiCh.has(ch)) {
      let c = [...Array(16).keys()].find(k => !used.has(k));
      if (c === undefined) { c = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15][spare++ % 15]; }
      midiCh.set(ch, c); used.add(c);
    }
  }
  // an AKAO voice can switch drum mode on and off mid-track; its kit notes
  // go to a second MIDI track on channel 10 so neither side lies about
  // what it is
  const emit = (name, evs, ch) => {
    const out = [];
    for (const n of evs) {
      const p = n.drum ? n.key : n.pitch;
      if (p < 0 || p > 127) continue;
      const t = T(n.tick);
      out.push({t, d: Math.max(1, T(n.endTick) - t), p, v: Math.max(1, Math.min(127, n.vel))});
    }
    tracks.push(trackBytes(name, out, ch));
  };
  const progsOf = evs => [...new Set(evs.map(n => n.program))].join(",");
  for (const [ch, evs] of order) {
    const kit = evs.filter(n => n.drum), mel = evs.filter(n => !n.drum);
    if (mel.length) emit(`ch ${ch + 1} prog ${progsOf(mel)}`, mel, midiCh.get(ch));
    if (kit.length) emit(`ch ${ch + 1} prog ${progsOf(kit)}${mel.length ? " kit" : ""}`, kit, 9);
  }
  const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const bytes = [0x4D, 0x54, 0x68, 0x64, ...u32(6), 0, 1, 0, tracks.length, PPQ >> 8, PPQ & 255];
  for (const t of tracks) bytes.push(0x4D, 0x54, 0x72, 0x6B, ...u32(t.length), ...t);
  return new Uint8Array(bytes);
}
