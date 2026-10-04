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
import { albumClear } from "../session/album.js";
import { stop } from "../audio/transport.js";
import { editableSong } from "../model/song.js";
import { applyInst } from "../ui/chrome.js";
import { play } from "../audio/transport.js";
import { tickToSec } from "../midi/parse.js";
import { curTick } from "../render/roll.js";

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
  recTakeNote(pend.tick, end, pend.p, pend.vel);
  draw();
}
// the take's minimum length: a snapped take's is one grid step (unchanged); a
// raw take's is the app's usual shortest-editable-note floor (resizeSelection
// uses the same number) — a very fast tap must not leave a zero/negative
// length note behind
export function recMinD() { return recSnapOn() ? moveSnapTicks() : Math.max(24, Math.round(S.song.ppq / 8)); }
// one note of a take onto the selected track, S.recTake remembering it for
// the batch undo — Record (recNoteOff) and Keep that (captureKeep) both land
// here, so a kept phrase is a recording in every way that matters
export function recTakeNote(tick, end, p, vel) {
  const d = Math.max(recMinD(), end - tick);
  const tr = S.song.tracks[S.selTrack], isAdd = !isComposition();
  const vv = vel !== undefined ? vel : S.pencilVel;
  tr.notes.push({t: tick, d, p, v: vv, added: isAdd});
  if (S.song.rawNotes) S.song.rawNotes[S.selTrack].push({t: tick + S.chopS, d, p, v: vv, added: isAdd});
  S.recTake.push({ti: S.selTrack, ni: tr.notes.length - 1});
}
// commit S.recTake as ONE undo step (+ save); `verb` names it in the status line
export function recCommitTake(verb) {
  if (S.recTake.length) {
    pushUndo({kind: "addBatch", items: S.recTake.slice()});
    saveEdits();
    if (isComposition() || isLocalDraft()) saveDraft(); // the take is part of the working copy, not just the undo stack
    computeSongEnd();
    if (S.viewMode === "score") buildScoreModel();
    setInfo(verb + " " + S.recTake.length + " note" + (S.recTake.length === 1 ? "" : "s") + " — one undo removes the take");
  }
  S.recTake = [];
}
export function recFinishImpl() { // called from stop(): close pendings, commit the take
  for (const pid of [...S.recPending.keys()]) recNoteOff(pid);
  S.recording = false;
  document.getElementById("recbtn").classList.remove("rec");
  recCommitTake("recorded");
}
// Capture MIDI (2026-10-04, docs/daw-inventory.md §4 #5 — Logic's Capture
// Recording, Ableton Note's retrospective record): every key or MIDI note
// played while NOT recording goes into S.captureBuf with its wall clock,
// the last CAPTURE_MS of them kept; "Keep that" (#instkeep, Edit ▾) writes
// the buffered phrase at the cursor on the selected track as one take.
// The keys and MIDI-in call inputNoteOn/Off and never choose: ● rolling
// means Record owns the note, otherwise the buffer does.
export const CAPTURE_MS = 60000;
export function inputNoteOn(key, p, vel) {
  if (S.recording && S.playing) recNoteOn(key, p, vel);
  else captureNoteOn(key, p, vel);
}
export function inputNoteOff(key) {
  recNoteOff(key);
  captureNoteOff(key);
}
export function captureTrim(now) {
  const cut = now - CAPTURE_MS;
  let i = 0;
  while (i < S.captureBuf.length && S.captureBuf[i].at < cut) i++;
  if (i) S.captureBuf.splice(0, i);
}
export function captureNoteOn(key, p, vel) {
  if (!S.song) return;
  captureNoteOff(key); // sliding to a new key closes the old one, as Record does
  const now = performance.now();
  captureTrim(now);
  S.captureBuf.push({at: now, off: null, p, vel, key});
}
export function captureNoteOff(key) {
  for (let i = S.captureBuf.length - 1; i >= 0; i--) {
    const c = S.captureBuf[i];
    if (c.key === key && c.off === null) { c.off = performance.now(); return; }
  }
}
// Keep that: the buffer → notes at the cursor. Wall-clock offsets from the
// phrase's first note map through the tempo map FROM THE CURSOR (tickToSec
// of the cursor, then secToTick of cursor-seconds + offset), so a tempo
// change inside the phrase lands where Record would have put it; the speed
// slider applies the same way it does to a recording. Raw unless the
// Snap-while-recording pref is on (recSnap), exactly Record's rule.
export function captureKeep() {
  if (!S.song || !editableSong()) { setInfo("Keep that works on your own songs"); return 0; }
  if (S.recording) { setInfo("Record is already taking this down — ● or ■ stops it first"); return 0; }
  const tr = S.song.tracks[S.selTrack];
  if (!tr || tr.kind === "audio") { setInfo("pick a note track to keep the phrase on (tap its chip)"); return 0; }
  const now = performance.now();
  captureTrim(now);
  const buf = S.captureBuf;
  if (!buf.length) { setInfo("nothing to keep yet — play on the keys (or a MIDI keyboard) while stopped, then Keep that"); return 0; }
  const cursor = curTick(), sec0 = tickToSec(S.song, cursor), t0 = buf[0].at;
  const at = ms => secToTick(S.song, sec0 + (ms - t0) / 1000);
  S.recTake = [];
  for (const c of buf) recTakeNote(recSnap(at(c.at)), recSnap(at(c.off === null ? now : c.off)), c.p, c.vel);
  const n = S.recTake.length;
  recCommitTake("kept");
  S.captureBuf = [];
  draw();
  return n;
}
// CoreMidi source names, once the iPad app has connected any
// One MIDI message's bytes (status, data1, data2?) — Web MIDI's
// MIDIMessageEvent.data is already exactly this shape; CoreMidiPlugin
// expands running status on the native side so its "midi" events are too.
export function midiMessage(data) {
  const [st, note, vel] = data;
  const cmd = st & 0xf0;
  if (cmd === 0x90 && vel > 0) {
    inputNoteOn("midi" + note + (st & 15), note, vel);
    previewNote(S.selTrack, note);
    S.instFlash = {p: note, until: performance.now() + 300}; // light the panel key
    if (S.instOpen) drawInst();
  } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
    inputNoteOff("midi" + note + (st & 15));
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

export function initRecord1() {
  document.addEventListener("pointerdown", function midiWarm() {
    document.removeEventListener("pointerdown", midiWarm);
    // the iPad app's native MIDI bridge starts only when ● asks for it — never
    // on the first touch, where an untested native path failing would cost
    // the whole app (2026-09-30, the plugin is new and unheard on a device)
    const C = typeof window !== "undefined" && window.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform()) return;
    initWebMidi(); // permission prompt wants a user gesture
  }, {capture: true});
  document.getElementById("instkeep").addEventListener("click", () => captureKeep());
  document.getElementById("recbtn").addEventListener("click", async () => {
    albumClear();
    if (S.recording || S.playing) { stop(); return; } // ● while rolling = stop (commits the take)
    if (!S.song || !editableSong()) { setInfo("recording works on your own songs"); return; }
    if (!S.instOpen) { S.instOpen = true; localStorage.setItem("ff1roll-inst-open", "1"); applyInst(); }
    S.recording = true;
    S.recTake = [];
    document.getElementById("recbtn").classList.add("rec");
    initWebMidi();
    setInfo("recording onto " + (S.song.tracks[S.selTrack].name || "track") + " — 🎹 keys or MIDI; ● or ■ stops · " + midiStatusLine());
    await play(S.playCursor > 0 ? tickToSec(S.song, S.playCursor) : 0);
    if (!S.recording && S.playing) stop(); // ● was released while play() was still waking the audio context
  });
}
