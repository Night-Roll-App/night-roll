// tools/note-preview.mjs — one held note through a sequence chip's own
// console renderer (PS1 renderSpu, N64 renderN64/renderRare), 2026-09-28.
//
// Extracted from tools/chip-worker.mjs's previewOne (2026-09-27, the tap
// preview: "when I press notes on Dire Dire Docks it sounds them in our
// MIDI instrument sounds" — Josh wanted the game's own instrument), because
// tools/sounding.mjs's capture-time pitch probe (CHIPS.psf/usf.capture in
// index.html) needs the exact same "one-note copy of the parsed result,
// rendered by the console's own renderer" recipe. Both call sites load this
// module the same way every other chip helper reaches the app, the worker
// and tools/import-set.mjs: listed in CHIPS[kind].shared (index.html), so it
// rides in `M` — no separate import, no separate cache-busting story from
// the rest of a chip's modules.
//
// kind: "psf" | "usf" — which note shape to build (PS1: key/pitch/cents;
// N64: midi/key/semitone — EAD's renderer reads `semitone` (the +21
// convention), Rare's reads `key` directly; setting `key` to the wanted
// pitch AND `semitone` to `key − 21` lets either renderer pick the field it
// needs without this module knowing which driver produced `inner`).
import { TICKS_PER_BEAT } from "./n64/constants.mjs";

// The group's own template note: without `at`, its first non-drum note (a
// kit's keys are its own slot map, not a pitch — the caller's kit handles
// those taps/probes itself, or skips the group). With `at` (a SEQUENCE
// tick — the same space as a note's own `.tick`; see seqTickOf below for
// the roll/MIDI tick it comes from), the template is instead the group's
// note actually sounding at `at`, or the nearest one — several chip tracks
// change program mid-track (track names like "ch 1 prog 51,46"), and a tap
// on a later note must hear THAT program, not always the group's first
// (Josh's ear: FF7 "You Can Hear the Cry of the Planet", 2026-09-30 — a tap
// anywhere in such a track played the first program forever). null when
// the group/track is missing, empty, or is itself a kit (no non-drum note
// at any position).
export function findTemplateNote(M, kind, inner, groupName, at) {
  const groups = kind === "psf" ? M.channelGroups(inner) : M.channelGroups(inner, {tsNum: 4, tsDen: 4});
  const g = groups.find(x => x.name === groupName);
  if (!g || !g.notes.length) return null;
  if (at == null) {
    const t = g.notes.find(x => !x.drum) || g.notes[0];
    return t.drum ? null : t;
  }
  let best = null, bestDist = Infinity;
  for (const n of g.notes) {
    if (n.drum) continue;
    const end = n.endTick != null ? n.endTick : n.tick + (n.dur || 0);
    if (at >= n.tick && at < end) return n; // sounding exactly at `at`: the true answer, not just the closest
    const d = Math.min(Math.abs(at - n.tick), Math.abs(at - end));
    if (d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

// A roll/MIDI tick (a note's own `.t`, at the song's own ppq) -> the
// SEQUENCE tick findTemplateNote's `at` and a group's notes are in. PS1/PS2:
// makeMidi (tools/psx/notes.mjs) writes `T(tick) = round(tick * PPQ /
// seq.ppq)` with its own PPQ=480 — this is that scale inverted, using the
// CALLER's real ppq rather than assuming 480. N64: toMidi (tools/n64/
// notes.mjs) writes `tick * PPQ / TICKS_PER_BEAT` with the same PPQ=480 and
// a FIXED TICKS_PER_BEAT (48, the sequence format's own units — no seq.ppq
// to read), so this is that scale inverted the same way. undefined when
// there's nothing to convert with (no tick/ppq given, or a psf/psf2 `inner`
// with no seq.ppq).
export function seqTickOf(kind, inner, tick, ppq) {
  if (tick == null || !ppq) return undefined;
  if (kind === "usf") return tick * TICKS_PER_BEAT / ppq;
  const sppq = inner && inner.seq && inner.seq.ppq;
  return sppq ? tick * sppq / ppq : undefined;
}

// Builds a one-note copy of `inner` (the parsed sequence result: PSF's
// akao/seq result, or USF's sequenceOfSet result) at `key`, renders it
// through `renderFn(one, {sampleRate, seconds, onProgress}) -> {[name]:
// pcm}` (renderSpu / renderN64's own contract — the caller supplies it, so
// this module needs no chip-specific renderer knowledge), and returns just
// `groupName`'s PCM (Float32Array mono, or {l, r} stereo) — or null when the
// group has no note to build from, or the render carries none for it.
// at: a SEQUENCE tick (findTemplateNote's own space; see seqTickOf) naming
// which of the group's notes to copy the instrument from — unchanged (the
// group's first non-drum note) when absent, which is what tools/sounding.mjs's
// capture-time probe relies on.
export async function renderOneNote(M, kind, inner, groupName, renderFn, {key, vel = 100, ticks, seconds = 1, sampleRate, at} = {}) {
  const t = findTemplateNote(M, kind, inner, groupName, at);
  if (!t) return null;
  const dur = Math.max(1, Math.round(ticks || Math.min(48, kind === "psf" ? (t.endTick - t.tick) : t.dur)));
  const note = kind === "psf"
    ? {...t, tick: 0, endTick: dur, key, pitch: key, cents: 0, vel, gain: undefined, slide: undefined, unrolled: false}
    : {...t, tick: 0, dur, midi: key, key, semitone: key - 21, vel, slide: undefined, gain: undefined, bend: 0};
  // the renderer sizes its output from seq.loop too, not just the wrapper's loop — leaving it
  // made a tap on FFX Challenge render the whole 164 s song for one note (2026-09-30)
  const one = {...inner, notes: [note], endTick: dur, loop: null, ducked: [], ...(inner.seq ? {seq: {...inner.seq, loop: null}} : {})};
  const r = await renderFn(one, {sampleRate, seconds, onProgress: () => {}});
  return (r && r[groupName]) || null;
}
