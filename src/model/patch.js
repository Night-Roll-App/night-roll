// src/model/patch.js — patches v1 (docs/plans/2026-10-06-envelopes-lfo-review.md
// §4.2; NIGHT-ROLL.md "Patches"). A patch is the instrument layer: a synth
// wave + an amplitude ADSR + a delayed vibrato, run by itself on every note
// of the track. It is song state, so it rides the track's own `track:`
// annotation as its voice token — no new annotation type, so undo, the local
// store, drafts, publish and older builds (which keep the token verbatim)
// all carry it unchanged:
//
//   track: lead voice=patch:chip-lead:square25:env0.005,0.1,0.75,0.08:vib6,0.25,0.25
//
// Segments after the name and wave are tagged by a prefix: env = attack s,
// decay s, sustain 0..1, release s; vib = rate Hz, depth semitones, delay s.
// A segment this build doesn't know (a later build's chip macros) is kept in
// `extra` and written back as-is. Never "=" or whitespace in the token: the
// track: parser splits on both, and an older build would truncate it.
export const PATCH_WAVES = [["square", "pulse 50%"], ["square25", "pulse 25%"], ["square12", "pulse 12.5%"],
                            ["triangle", "triangle"], ["sine", "sine"], ["sawtooth", "saw"], ["organ", "organ"]];
// [key, menu label, min, max, step] — the sheet's sliders and the clamp every reader applies
export const PATCH_PARAMS = [["a", "attack", 0, 2, 0.005], ["d", "decay", 0, 3, 0.01], ["s", "sustain", 0, 1, 0.01],
                             ["r", "release", 0, 3, 0.01], ["vd", "vibrato delay", 0, 2, 0.01],
                             ["vr", "vibrato rate", 0, 12, 0.1], ["vx", "vibrato depth", 0, 2, 0.01]];
// built into the code; picking one copies its numbers into the song, so a
// song never depends on a device's library
export const PATCH_PRESETS = [
  {name: "pluck", label: "Pluck", wave: "square", a: 0.003, d: 0.25, s: 0, r: 0.05, vr: 0, vx: 0, vd: 0},
  {name: "soft-pad", label: "Soft pad", wave: "triangle", a: 0.4, d: 0.6, s: 0.7, r: 0.6, vr: 4.5, vx: 0.1, vd: 0.5},
  {name: "lead-vib", label: "Lead + vibrato", wave: "square", a: 0.01, d: 0.2, s: 0.8, r: 0.12, vr: 5.5, vx: 0.3, vd: 0.3},
  {name: "bass", label: "Bass", wave: "triangle", a: 0.005, d: 0.15, s: 0.7, r: 0.06, vr: 0, vx: 0, vd: 0},
  {name: "chip-lead", label: "Chip lead", wave: "square25", a: 0.005, d: 0.1, s: 0.75, r: 0.08, vr: 6, vx: 0.25, vd: 0.25},
  {name: "organ", label: "Organ", wave: "organ", a: 0.01, d: 0, s: 1, r: 0.05, vr: 0, vx: 0, vd: 0},
];
export function patchNum(x) { return String(Math.round(x * 1000) / 1000); }
export function patchClamp(p) { // every field in range, missing ones from a flat gate
  const out = {name: patchSlug(p.name) || "patch", wave: PATCH_WAVES.some(([w]) => w === p.wave) ? p.wave : "square", extra: p.extra ? p.extra.slice() : []};
  for (const [k, , lo, hi] of PATCH_PARAMS) {
    const v = +p[k];
    out[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : k === "s" ? 1 : 0;
  }
  return out;
}
export function patchSlug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24); }
export function isPatchVoice(v) { return typeof v === "string" && v.startsWith("patch:"); }
export function patchVoiceId(p) {
  const c = patchClamp(p);
  return "patch:" + c.name + ":" + c.wave + ":env" + [c.a, c.d, c.s, c.r].map(patchNum).join(",") +
         (c.vx > 0 ? ":vib" + [c.vr, c.vx, c.vd].map(patchNum).join(",") : "") + c.extra.map(x => ":" + x).join("");
}
// "patch:…" -> {name, wave, a, d, s, r, vr, vx, vd, extra} | null
export function parsePatchVoice(v) {
  if (!isPatchVoice(v)) return null;
  const seg = v.slice(6).split(":");
  const p = {name: seg[0], wave: seg[1], extra: []};
  for (const x of seg.slice(2)) {
    const nums = s => s.split(",").map(Number);
    if (x.startsWith("env")) { const q = nums(x.slice(3)); [p.a, p.d, p.s, p.r] = q; }
    else if (x.startsWith("vib")) { const q = nums(x.slice(3)); [p.vr, p.vx, p.vd] = q; }
    else if (x) p.extra.push(x); // a later build's segment: carried, never interpreted
  }
  return patchClamp(p);
}
export function patchPreset(name) { return PATCH_PRESETS.find(q => q.name === name) || null; }
export function patchLabel(v) { // the menu's words for a patch voice
  const p = parsePatchVoice(v);
  if (!p) return v;
  const pre = patchPreset(p.name);
  const same = pre && patchVoiceId(pre) === patchVoiceId({...p, extra: []});
  return "patch " + (pre ? pre.label : p.name) + (pre && !same ? " (edited)" : "");
}
export const PATCH_MIN_ATTACK = 0.002, PATCH_MIN_RELEASE = 0.005, PATCH_VIB_FADE = 0.1;
// the ADSR's level (0..1) at t seconds after note-on, the key still down. No
// decay (d = 0) means the attack rises straight to the sustain level.
export function patchHeldLevel(p, t) {
  const a = Math.max(PATCH_MIN_ATTACK, p.a), peak = p.d > 0 ? 1 : p.s;
  if (t <= a) return Math.max(0, t / a) * peak;
  if (t <= a + p.d) return 1 + (p.s - 1) * (t - a) / p.d;
  return p.s;
}
// [{t, v}] gain breakpoints from note-on (t = 0) through the release; heldSec
// = how long the key (or the CC64 pedal) holds the note. The release ramps
// from wherever the envelope is when the key lifts — a note shorter than the
// attack lets go mid-rise.
export function patchEnvPoints(p, heldSec) {
  const a = Math.max(PATCH_MIN_ATTACK, p.a), r = Math.max(PATCH_MIN_RELEASE, p.r);
  const held = Math.max(0, heldSec);
  const pts = [{t: 0, v: 0}];
  if (held > a) pts.push({t: a, v: p.d > 0 ? 1 : p.s});
  if (p.d > 0 && held > a + p.d) pts.push({t: a + p.d, v: p.s});
  pts.push({t: held, v: patchHeldLevel(p, held)});
  pts.push({t: held + r, v: 0});
  return pts;
}
