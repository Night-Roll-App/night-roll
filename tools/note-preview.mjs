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

// The group's own template note: its first non-drum note (a kit's keys are
// its own slot map, not a pitch — the caller's kit handles those taps/probes
// itself, or skips the group). null when the group/track is missing, empty,
// or is itself a kit.
export function findTemplateNote(M, kind, inner, groupName) {
  const groups = kind === "psf" ? M.channelGroups(inner) : M.channelGroups(inner, {tsNum: 4, tsDen: 4});
  const g = groups.find(x => x.name === groupName);
  if (!g || !g.notes.length) return null;
  const t = g.notes.find(x => !x.drum) || g.notes[0];
  return t.drum ? null : t;
}

// Builds a one-note copy of `inner` (the parsed sequence result: PSF's
// akao/seq result, or USF's sequenceOfSet result) at `key`, renders it
// through `renderFn(one, {sampleRate, seconds, onProgress}) -> {[name]:
// pcm}` (renderSpu / renderN64's own contract — the caller supplies it, so
// this module needs no chip-specific renderer knowledge), and returns just
// `groupName`'s PCM (Float32Array mono, or {l, r} stereo) — or null when the
// group has no note to build from, or the render carries none for it.
export async function renderOneNote(M, kind, inner, groupName, renderFn, {key, vel = 100, ticks, seconds = 1, sampleRate} = {}) {
  const t = findTemplateNote(M, kind, inner, groupName);
  if (!t) return null;
  const dur = Math.max(1, Math.round(ticks || Math.min(48, kind === "psf" ? (t.endTick - t.tick) : t.dur)));
  const note = kind === "psf"
    ? {...t, tick: 0, endTick: dur, key, pitch: key, cents: 0, vel, gain: undefined, slide: undefined, unrolled: false}
    : {...t, tick: 0, dur, midi: key, key, semitone: key - 21, vel, slide: undefined, gain: undefined, bend: 0};
  const one = {...inner, notes: [note], endTick: dur, loop: null, ducked: []};
  const r = await renderFn(one, {sampleRate, seconds, onProgress: () => {}});
  return (r && r[groupName]) || null;
}
