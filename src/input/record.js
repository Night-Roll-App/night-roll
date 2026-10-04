import { moveSnapTicks } from "../model/grid.js";
import { S } from "../state.js";

// RAW by default (recSnapOn() off): the exact tick played, just rounded to
// an integer — no grid involved. recSnapOn() on: the old snap-to-grid
// behavior, for anyone who prefers it. Both recNoteOn's start and
// recNoteOff's end run through this SAME function, so a snapped take still
// can't land a zero-length note between two adjacent grid lines.
export function recSnap(t) {
  if (!recSnapOn()) return Math.max(0, Math.round(t));
  const g = moveSnapTicks();
  return Math.max(0, Math.round(t / g) * g);
}
// What ● can tell you about MIDI right now — the old path swallowed every
// failure, so a blocked permission, Safari, or an unplugged device all
// looked identical: nothing (Josh's MPK Mini, 2026-09-12)
export function midiStatusLine() {
  if (S.nativeMidiNames.length) return "MIDI in: " + S.nativeMidiNames.join(", ") + " — play, and ● records it";
  const C = typeof window !== "undefined" && window.Capacitor;
  if (C && C.isNativePlatform && C.isNativePlatform())
    return S.midiErr ? "MIDI blocked: " + (S.midiErr.message || S.midiErr)
                    : "no MIDI inputs found — plug a MIDI keyboard into the iPad";
  if (typeof navigator === "undefined" || !navigator.requestMIDIAccess)
    return "this browser has no Web MIDI (Safari) — use Chrome or Edge on the computer";
  if (S.midiErr) return "MIDI blocked: " + (S.midiErr.message || S.midiErr) + " — allow MIDI for this site from the icon in the address bar, then reload";
  if (!S.midiAccess) return "MIDI not ready yet — tap anywhere once, then try ●";
  const names = [...S.midiAccess.inputs.values()].map(i => i.name + (i.state === "connected" ? "" : " (" + i.state + ")"));
  return names.length ? "MIDI in: " + names.join(", ") + " — play, and ● records it"
                      : "no MIDI inputs found — plug the device in (or check chrome://settings/content/midiDevices)";
}
// OFF by default (2026-09-30, DAW convention — Logic/GarageBand/Cubasis: recording
// keeps what you played, no input snap; a Quantize command snaps afterward,
// undoably). On restores the old always-snapped recording input.
export function recSnapOn() { try { return localStorage.getItem("ff1roll-recsnap") === "1"; } catch (err) { return false; } }
