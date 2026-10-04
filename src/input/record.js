import { moveSnapTicks } from "../model/grid.js";
import { S } from "../state.js";
import { secToTick } from "../midi/parse.js";
import { playSec } from "../audio/transport.js";
import { isComposition } from "../model/provenance.js";
import { drawImpl as draw } from "../ui/chrome.js";
import { pushUndo } from "../model/edits.js";
import { saveEdits } from "../model/edits.js";
import { isLocalDraft } from "../model/edits.js";
import { saveDraft } from "../model/versions.js";
import { computeSongEnd } from "../model/song.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { previewNote } from "../audio/voices.js";
import { drawInst } from "../render/instrument.js";

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

export function recNoteOn(pid, p, vel) {
  recNoteOff(pid); // sliding to a new key closes the old one
  S.recPending.set(pid, {p, vel, tick: recSnap(secToTick(S.song, playSec()))});
}
export function recNoteOff(pid) {
  const pend = S.recPending.get(pid);
  if (!pend) return;
  S.recPending.delete(pid);
  const end = recSnap(secToTick(S.song, playSec()));
  // a snapped take's minimum is one grid step (unchanged); a raw take's
  // minimum is the app's usual shortest-editable-note floor (resizeSelection
  // uses the same number) — a very fast tap must not leave a zero/negative
  // length note behind.
  const minD = recSnapOn() ? moveSnapTicks() : Math.max(24, Math.round(S.song.ppq / 8));
  const d = Math.max(minD, end - pend.tick);
  const tr = S.song.tracks[S.selTrack], isAdd = !isComposition();
  const vv = pend.vel !== undefined ? pend.vel : S.pencilVel;
  tr.notes.push({t: pend.tick, d, p: pend.p, v: vv, added: isAdd});
  if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: pend.tick + S.chopS, d, p: pend.p, v: vv, added: isAdd});
  S.recTake.push({ti: S.selTrack, ni: tr.notes.length - 1});
  draw();
}
export function recFinishImpl() { // called from stop(): close pendings, commit the take
  for (const pid of [...S.recPending.keys()]) recNoteOff(pid);
  S.recording = false;
  document.getElementById("recbtn").classList.remove("rec");
  if (S.recTake.length) {
    pushUndo({kind: "addBatch", items: S.recTake.slice()});
    saveEdits();
    if (isComposition() || isLocalDraft()) saveDraft(); // the take is part of the working copy, not just the undo stack
    computeSongEnd();
    if (S.viewMode === "score") buildScoreModel();
    setInfo("recorded " + S.recTake.length + " note" + (S.recTake.length === 1 ? "" : "s") + " — one undo removes the take");
  }
  S.recTake = [];
}
// CoreMidi source names, once the iPad app has connected any
// One MIDI message's bytes (status, data1, data2?) — Web MIDI's
// MIDIMessageEvent.data is already exactly this shape; CoreMidiPlugin
// expands running status on the native side so its "midi" events are too.
export function midiMessage(data) {
  const [st, note, vel] = data;
  const cmd = st & 0xf0;
  if (cmd === 0x90 && vel > 0) {
    if (S.recording && S.playing) recNoteOn("midi" + note + (st & 15), note, vel);
    previewNote(S.selTrack, note);
    S.instFlash = {p: note, until: performance.now() + 300}; // light the panel key
    if (S.instOpen) drawInst();
  } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
    recNoteOff("midi" + note + (st & 15));
  }
}
export function initWebMidi() {
  if (S.midiReady) return;
  const C = typeof window !== "undefined" && window.Capacitor;
  if (C && C.isNativePlatform && C.isNativePlatform()) { initCoreMidi(C); return; }
  if (!navigator.requestMIDIAccess) return;
  S.midiReady = true;
  navigator.requestMIDIAccess({sysex: false}).then(access => {
    S.midiAccess = access;
    const hook = input => input.addEventListener("midimessage", e => midiMessage(e.data));
    for (const input of access.inputs.values()) hook(input);
    access.addEventListener("statechange", e => {
      if (e.port.type === "input" && e.port.state === "connected") hook(e.port);
      setInfo("MIDI " + e.port.state + ": " + e.port.name);
    });
    const names = [...access.inputs.values()].map(i => i.name);
    if (names.length || S.recording) setInfo(midiStatusLine()); // silence at first tap unless there's a device or ● is waiting
  }).catch(err => { S.midiErr = err; S.midiReady = false; setInfo(midiStatusLine()); }); // retry on the next tap
}
// The iPad app: WKWebView has no Web MIDI, so a keyboard reaches this page
// through the shell's own CoreMidi plugin instead (registered next to 📷's
// Screenshot in MainViewController.capacitorDidLoad — same mechanism, see
// askShotCapture's comment). Capacitor auto-generates Plugins.CoreMidi
// (addListener + start/stop/list) once a plugin is registered natively, so
// that's the normal path; Capacitor.addListener/nativePromise underneath it
// is the same primitive the generated wrapper itself calls, so it's a real
// fallback (not a guess) if the wrapper object is ever missing.
export function initCoreMidi(C) {
  if (S.midiReady) return;
  S.midiReady = true;
  const plugin = C.Plugins && C.Plugins.CoreMidi;
  const listen = (name, cb) => plugin && plugin.addListener ? plugin.addListener(name, cb)
    : C.addListener ? C.addListener("CoreMidi", name, cb) : null;
  const call = (method, opts) => plugin && plugin[method] ? plugin[method](opts || {})
    : C.nativePromise ? C.nativePromise("CoreMidi", method, opts || {})
    : Promise.reject(new Error("no CoreMidi bridge"));
  if (!(plugin && plugin.addListener) && !C.addListener) { S.midiReady = false; return; } // truly nothing to call: leave midiReady false so a later tap retries
  listen("midi", e => {
    if (!e || !Array.isArray(e.data)) return;
    if (e.source && !S.nativeMidiNames.includes(e.source)) {
      S.nativeMidiNames.push(e.source);
      setInfo("MIDI keyboard connected: " + e.source);
    }
    midiMessage(e.data);
  });
  call("start").then(() => call("list")).then(r => {
    const names = r && r.sources || [];
    if (names.length) {
      S.nativeMidiNames = names;
      setInfo("MIDI keyboard connected: " + names.join(", "));
    }
  }).catch(err => { S.midiErr = err; setInfo(midiStatusLine()); });
}
