// One SNES note in the game's own voice, with no render: the "Hear sound" /
// tap preview for an SPC song (docs/plans/2026-10-13-snes-drums-and-track-tools.md
// step 5). The chip worker keeps a compact table instead of the whole DSP
// write log: for every reconstructed note, the 128 DSP registers as they
// stood when the note began. A preview is then a two-write capture (KON, and
// KOFF at the note's length) over THOSE registers and the song's RAM, played
// through the same S-DSP renderer the song uses (apu-render.mjs): the note's
// BRR sample resampled at its PITCH, its ADSR/GAIN envelope from dsp-state,
// its VOL and echo send. Nothing is approximated that the render does not
// approximate already.
import { TICK_SEC, SAMPLE_RATE } from "./notes.mjs";

export const PREVIEW_MAX_SEC = 1.5;   // a held pad is previewed this long, then keyed off
export const PREVIEW_MIN_SEC = 0.1;
export const PREVIEW_TAIL_SEC = 0.3;  // release + echo tail after the key-off

// cap: runSPC's result; events: reconstruct(cap).events (raw 2 ms ticks).
// -> {ram, lead, notes: [{v, start, end, midi, pitch, kit, noise, regs}]}
export function spcPreviewTable(cap, events) {
  const regs = Uint8Array.from(cap.dsp0);
  const log = cap.dspLog;
  const order = events.slice().sort((a, b) => a.startSample - b.startSample);
  const notes = [];
  let wi = 0, lead = Infinity;
  for (const e of order) {
    while (wi < log.length && log[wi].sample <= e.startSample) { // the same register rule reconstruct() applies
      const {addr, value} = log[wi++], col = addr & 0x0F;
      if (col !== 8 && col !== 9 && addr !== 0x7C) regs[addr] = value;
    }
    if (e.startFrame * TICK_SEC < lead) lead = e.startFrame * TICK_SEC;
    notes.push({v: e.voice, start: e.startSample, end: e.endSample, midi: e.midi, pitch: e.pitch,
      kit: e.kit === true, noise: e.noiseClock !== undefined, regs: regs.slice()});
  }
  return {ram: cap.ram, lead: lead === Infinity ? 0 : lead, notes};
}

// The template note for a track: its voice, kit or not by the track's name,
// nearest in time to the tapped note (the .mid's beats are snapped, so a
// pitch match breaks ties between neighbours). songSec: seconds since song
// zero (the first onset); null picks the voice's first note.
export function spcTemplateNote(table, track, key, songSec) {
  const m = /^voice(\d)( kit)?$/.exec(track || "");
  if (!m) return null;
  const v = +m[1];
  let pool = table.notes.filter(n => n.v === v);
  const kits = pool.filter(n => n.kit);
  if (m[2]) pool = kits;
  else if (kits.length < pool.length) pool = pool.filter(n => !n.kit);
  if (!pool.length) return null;
  if (songSec == null) return pool[0];
  const at = table.lead + songSec;
  let best = null, bestCost = Infinity;
  for (const n of pool) {
    const cost = Math.abs(n.start / SAMPLE_RATE - at) / 0.05 + (!n.kit && key != null && n.midi !== key ? 20 : 0);
    if (cost < bestCost) { bestCost = cost; best = n; }
  }
  return best;
}

// -> {pcm: {l, r}, prog} | null. p: {track, midi, offset, songSec}. renderApu is
// passed in (the worker reaches it through M, like every chip helper).
export async function previewSpcNote(renderApu, table, p) {
  const key = p.midi == null ? null : p.midi - (p.offset || 0);
  const t = spcTemplateNote(table, p.track, key, p.songSec);
  if (!t || !renderApu) return null;
  const v = t.v, bit = 1 << v, b = v * 16;
  const regs = Uint8Array.from(t.regs);
  regs[0x4C] = 0; regs[0x5C] = 0; regs[0x2D] = 0; // no key bits carried, no pitch modulation from a voice that is not playing
  regs[0x3D] &= bit;
  if (!t.kit && !t.noise && key != null && key !== t.midi) { // another pitch of the same instrument: scale PITCH by the interval
    const pitch = Math.max(1, Math.min(0x3FFF, Math.round(t.pitch * 2 ** ((key - t.midi) / 12))));
    regs[b + 2] = pitch & 0xFF; regs[b + 3] = pitch >> 8;
  }
  const hold = Math.round(Math.max(PREVIEW_MIN_SEC, Math.min(PREVIEW_MAX_SEC, (t.end - t.start) / SAMPLE_RATE)) * SAMPLE_RATE);
  const cap = {
    dsp0: regs, ram: table.ram,
    dspLog: [{sample: 0, addr: 0x4C, value: bit}, {sample: hold, addr: 0x5C, value: bit}],
    samples: hold + Math.round(PREVIEW_TAIL_SEC * SAMPLE_RATE),
  };
  const out = await renderApu(cap, {sampleRate: SAMPLE_RATE, stereo: true});
  const pcm = out["voice" + v];
  if (!pcm || !pcm.l) return null;
  let end = pcm.l.length; // drop the silent end of a one-shot that ran out
  while (end > 3200 && Math.abs(pcm.l[end - 1]) < 1e-5 && Math.abs(pcm.r[end - 1]) < 1e-5) end--;
  const cut = end < pcm.l.length ? {l: pcm.l.slice(0, end), r: pcm.r.slice(0, end)} : pcm;
  return {pcm: cut, prog: regs[b + 4] + ":" + regs[b + 5] + ":" + regs[b + 6] + ":" + regs[b + 7]};
}
