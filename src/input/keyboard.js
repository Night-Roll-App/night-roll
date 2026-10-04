import { guitarGeom } from "../render/instrument.js";
import { GTR_FRETS } from "../render/instrument.js";
import { GTR_TUNING } from "../render/instrument.js";
import { ensureAudio } from "../audio/engine.js";
import { resumeAudio } from "../audio/engine.js";
import { openMaster } from "../audio/engine.js";
import { makeOsc } from "../audio/engine.js";
import { S } from "../state.js";
import { instCanvas } from "../render/instrument.js";
import { instWrap } from "../render/instrument.js";
import { pianoHit } from "../render/instrument.js";
import { degreeOf } from "../render/instrument.js";
import { keyNameShownAt } from "../ui/chrome.js";
import { curTick } from "../render/roll.js";
import { GTR_NAMES } from "../render/instrument.js";
import { pitchName } from "../theory/chords.js";
import { sfShownAt } from "../model/song.js";
import { drawInst } from "../render/instrument.js";
import { inputNoteOff } from "./record.js";
import { INST_CHEVRON_W } from "../render/instrument.js";
import { instRevealPitch } from "../render/instrument.js";
import { inputNoteOn } from "./record.js";
import { instScrollBy } from "../render/instrument.js";
import { applyInstBar } from "../ui/chrome.js";
import { instResize } from "../render/instrument.js";
import { instOctave } from "../render/instrument.js";
import { instbtn } from "../ui/chrome.js";
import { applyInst } from "../ui/chrome.js";
import { drawImpl as draw } from "../ui/chrome.js";
import { instFallBtn } from "../ui/chrome.js";

export function guitarHit(x, y, W, H) {
  const g = guitarGeom(W, H);
  const si = Math.max(0, Math.min(5, Math.round((y - g.top) / g.sh)));
  const f = x < g.nutX ? 0 : Math.min(GTR_FRETS, Math.floor((x - g.nutX) / g.fw) + 1);
  return {p: GTR_TUNING[si] + f, si, f};
}
// Sustain (2026-10-04, the piano's pedal): with it on, a tapped key rings on
// after the finger lifts — a slow decay, like a held piano string — until
// Sustain is turned off, which releases everything at once; restriking a
// ringing key replaces its voice. Off, a tap is the same half-second blip as
// always. Only the panel's own voices live in S.instHeld: song playback and
// a recording's note lengths (recNoteOff fires at the finger's release
// either way) never pass through here.
export async function instPlay(p, ticket) {
  ensureAudio();
  await resumeAudio();
  if (ticket && !ticket.live) return; // the finger was let go (a chord that became a scroll) while the engine woke: nothing sounds
  openMaster();
  const o = makeOsc(S.instTab === "guitar" ? "triangle" : "square25");
  o.frequency.value = 440 * Math.pow(2, (p - 69) / 12);
  const g = S.audio.createGain();
  const when = S.audio.currentTime + 0.01, dur = 0.5;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.35, when + 0.008);
  o.connect(g);
  g.connect(S.master); // master, not a track gain: mutes never silence the panel
  o.start(when);
  if (S.instSustain) {
    instReleaseHeld(p);
    g.gain.setValueAtTime(0.35, when + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, when + 7); // the string's own decay; inaudible well before the stop
    const v = {o, g};
    S.instHeld.set(p, v);
    o.stop(when + 7.1);
    o.onended = () => { if (S.instHeld.get(p) === v) S.instHeld.delete(p); };
    return;
  }
  g.gain.setValueAtTime(0.35, when + dur - 0.06);
  g.gain.linearRampToValueAtTime(0, when + dur);
  o.stop(when + dur + 0.05);
}
export function instReleaseVoice(v) { // a short fade, never a click
  const t = S.audio.currentTime;
  v.g.gain.cancelScheduledValues(t);
  v.g.gain.setValueAtTime(Math.max(0.001, v.g.gain.value || 0.001), t);
  v.g.gain.linearRampToValueAtTime(0, t + 0.08);
  v.o.stop(t + 0.1);
}
export function instReleaseHeld(p) {
  const v = S.instHeld.get(p);
  if (!v) return;
  S.instHeld.delete(p);
  instReleaseVoice(v);
}
export function instReleaseAll() {
  if (!S.audio) { S.instHeld.clear(); return; }
  for (const v of S.instHeld.values()) instReleaseVoice(v);
  S.instHeld.clear();
}
export function setInstInfo(s) { // linger 10s, then fade — a stale key name reads like a live one
  const el = document.getElementById("instinfo");
  el.textContent = s;
  el.style.opacity = "1";
  clearTimeout(S.instInfoTimer);
  S.instInfoTimer = setTimeout(() => { el.style.opacity = "0"; }, 10000);
}
export function instTap(e, dragging) {
  const r = instCanvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const W = instWrap.clientWidth, H = instWrap.clientHeight;
  let p, si, f;
  if (S.instTab === "piano") p = pianoHit(x, y, W, H);
  else ({p, si, f} = guitarHit(x, y, W, H));
  if (p === undefined || (dragging && p === S.instLastP)) return p;
  S.instLastP = p;
  S.instFlash = {p, si, f, until: performance.now() + 350};
  instPlay(p, instPtrTicket(e.pointerId));
  const deg = degreeOf(p % 12, keyNameShownAt(curTick()));
  const at = si !== undefined ? "  ·  " + GTR_NAMES[si] + " string" + (f ? ", fret " + f : ", open") : "";
  setInstInfo(pitchName(p, sfShownAt(curTick())) + (deg ? "  ·  degree " + deg : "") + at);
  drawInst();
  setTimeout(drawInst, 400); // clear the flash when idle (playback frames handle it otherwise)
  return p;
}
// Keyboard gestures (2026-10-04, docs/daw-inventory.md §1a — Josh: "it
// would play every note on the piano if you try to scroll on it"). The
// grammar, in order of precedence:
//   · a tap on an edge chevron scrolls to the lit key it points at;
//   · TWO fingers moving sideways together scroll the keys, in either mode,
//     and never sound — the same "two fingers moving together pan" the roll
//     teaches. Two fingers placed and held still are a chord (Play mode
//     plays both as before); the moment they travel past INST_PAN_SLOP the
//     chord lets go and the drag is a scroll;
//   · one finger in Play mode: today's behavior exactly — press plays,
//     sliding plays every new key (the glissando Record relies on);
//   · one finger in Scroll mode: a drag pans silently; a finger that lifts
//     without travelling was a tap and plays its key on release.
// The lock refuses every scroll inside instSetScroll, so no gesture branch
// needs to know about it. S.instPtrs tracks every finger on the canvas;
// a `dead` finger is one that has already been spent (it panned, or it
// belonged to a chord that became a scroll) and must not play on release.
export const INST_PAN_SLOP = 8;
export function instPtrXY(e) {
  const r = instCanvas.getBoundingClientRect();
  return {x: e.clientX - r.left, y: e.clientY - r.top};
}
export function instPtrMeanX() {
  let sum = 0, n = 0;
  for (const q of S.instPtrs.values()) { sum += q.x; n++; }
  return n ? sum / n : 0;
}
export function instLetGo(pid) { // a finger stops sounding/recording without lifting
  inputNoteOff(pid);
  const q = S.instPtrs.get(pid);
  if (q && q.p !== undefined) instReleaseHeld(q.p); // a chord that became a scroll must not ring on under Sustain
  if (q && q.ticket) q.ticket.live = false; // …nor may a voice still waking up park itself after this
  S.instPtrOn = false;
  S.instLastP = null;
  if (S.instFlash) S.instFlash = null;
}
export function instPtrPlayed(pid, p) { // remember the key each finger last sounded, for instLetGo
  const q = S.instPtrs.get(pid);
  if (q && p !== undefined) q.p = p;
}
// one ticket per finger: instPlay's awaits (resumeAudio's clock probes) can
// outlast the gesture that asked for the note, so the voice checks the
// ticket is still live before it sounds. A key played from no finger
// (MIDI, tests) has no ticket and always sounds.
export function instPtrTicket(pid) {
  const q = S.instPtrs.get(pid);
  if (!q) return null;
  return q.ticket || (q.ticket = {live: true});
}
export function instPointerDown(e) {
  instCanvas.setPointerCapture(e.pointerId);
  const {x, y} = instPtrXY(e);
  const W = instWrap.clientWidth;
  const piano = S.instTab === "piano";
  if (piano && S.instPtrs.size === 0 && S.instChevrons) {
    const ch = S.instChevrons;
    if (ch.left !== null && x < INST_CHEVRON_W) { instRevealPitch(ch.left); S.instPtrs.set(e.pointerId, {x, y, x0: x, y0: y, dead: true}); return; }
    if (ch.right !== null && x > W - INST_CHEVRON_W) { instRevealPitch(ch.right); S.instPtrs.set(e.pointerId, {x, y, x0: x, y0: y, dead: true}); return; }
  }
  S.instPtrs.set(e.pointerId, {x, y, x0: x, y0: y, dead: false, moved: false});
  if (piano && S.instPtrs.size === 2) { S.instGesture = "two"; S.instPanX = instPtrMeanX(); S.instPanX0 = S.instPanX; }
  if (piano && S.instGesture === "pan2") { S.instPtrs.get(e.pointerId).dead = true; S.instPanX = instPtrMeanX(); return; }
  if (piano && S.instMode === "scroll") return; // tap decided on release, drag on travel
  S.instPtrOn = true;
  const p = instTap(e);
  instPtrPlayed(e.pointerId, p);
  if (p !== undefined) inputNoteOn(e.pointerId, p);
}
export function instPointerMove(e) {
  const pt = S.instPtrs.get(e.pointerId);
  if (!pt) return;
  const {x, y} = instPtrXY(e);
  pt.x = x; pt.y = y;
  if (S.instGesture === "two" && S.instPtrs.size >= 2) { // the chord becomes a scroll once it travels
    const mean = instPtrMeanX();
    if (Math.abs(mean - S.instPanX0) > INST_PAN_SLOP) {
      S.instGesture = "pan2";
      for (const pid of S.instPtrs.keys()) { instLetGo(pid); S.instPtrs.get(pid).dead = true; }
      S.instPanX = mean;
      drawInst();
    }
    return;
  }
  if (S.instGesture === "pan2") {
    const mean = instPtrMeanX();
    instScrollBy(mean - S.instPanX);
    S.instPanX = mean;
    return;
  }
  if (pt.dead) return;
  if (S.instTab === "piano" && S.instMode === "scroll") {
    if (!pt.moved) {
      if (Math.abs(x - pt.x0) <= INST_PAN_SLOP) return;
      pt.moved = true;
      pt.panX = pt.x0;
    }
    instScrollBy(x - pt.panX);
    pt.panX = x;
    return;
  }
  if (!S.instPtrOn) return;
  const prevP = pt.p; // the key this finger last sounded: a wiggle on the same key is not a new note (Record would split it; the capture buffer would double it)
  const p = instTap(e, true);
  instPtrPlayed(e.pointerId, p);
  if (p !== undefined && p !== prevP) inputNoteOn(e.pointerId, p);
}
export function instPointerUp(e, cancelled) {
  const pt = S.instPtrs.get(e.pointerId);
  S.instPtrs.delete(e.pointerId);
  inputNoteOff(e.pointerId);
  if (S.instGesture === "pan2" || S.instGesture === "two") {
    if (S.instPtrs.size < 2) { // the remaining finger is spent: lifting one finger of a scroll must not start a note
      S.instGesture = null;
      for (const q of S.instPtrs.values()) q.dead = true;
      instScrollPersist();
    } else S.instPanX = instPtrMeanX();
  } else if (pt && !pt.dead && !pt.moved && !cancelled && S.instTab === "piano" && S.instMode === "scroll") {
    const p = instTap(e); // the Scroll-mode tap: one key, on release
    if (p !== undefined) { inputNoteOn(e.pointerId, p); inputNoteOff(e.pointerId); }
  } else if (pt && pt.moved) instScrollPersist();
  if (S.instPtrs.size === 0) { S.instPtrOn = false; S.instLastP = null; S.instGesture = null; }
}
// a drag scrolls transiently (no storage write per pointermove); the
// finger's lift records where it left the keys
export function instScrollPersist() {
  if (S.instScroll !== null) localStorage.setItem("ff1roll-inst-scroll-piano", String(S.instScroll));
}
export function instSetMode(m) {
  S.instMode = m === "scroll" ? "scroll" : "play";
  localStorage.setItem("ff1roll-inst-mode", S.instMode);
  applyInstBar();
}
export function instSetLock(on) {
  S.instLock = !!on;
  localStorage.setItem("ff1roll-inst-lock", S.instLock ? "1" : "0");
  applyInstBar();
}
export function instSetSustain(on) {
  S.instSustain = !!on;
  localStorage.setItem("ff1roll-inst-sustain", S.instSustain ? "1" : "0");
  if (!S.instSustain) instReleaseAll(); // the pedal comes up: everything ringing lets go
  applyInstBar();
}

export function initKeyboard1() {
  instCanvas.addEventListener("pointerdown", instPointerDown);
  instCanvas.addEventListener("pointermove", instPointerMove);
  instCanvas.addEventListener("pointerup", e => instPointerUp(e, false));
  instCanvas.addEventListener("pointercancel", e => instPointerUp(e, true));
  new ResizeObserver(instResize).observe(instWrap);
  document.getElementById("instplay").addEventListener("click", () => instSetMode("play"));
  document.getElementById("instscroll").addEventListener("click", () => instSetMode("scroll"));
  document.getElementById("instoctdn").addEventListener("click", () => instOctave(-1));
  document.getElementById("instoctup").addEventListener("click", () => instOctave(1));
  document.getElementById("instlock").addEventListener("click", () => instSetLock(!S.instLock));
  document.getElementById("instsustain").addEventListener("click", () => instSetSustain(!S.instSustain));
  instbtn.addEventListener("click", () => {
    S.instOpen = !S.instOpen;
    localStorage.setItem("ff1roll-inst-open", S.instOpen ? "1" : "0");
    if (!S.instOpen) instReleaseAll(); // nothing rings on from a closed panel
    applyInst();
    draw(); // closing the panel while Fall is active must restore the roll
  });
}

export function initKeyboard2() {
  instFallBtn.addEventListener("click", () => {
    S.fallOn = !S.fallOn;
    if (S.fallOn) { // fall is piano-only and needs the keys visible
      S.instTab = "piano";
      localStorage.setItem("ff1roll-inst-tab", "piano");
      if (!S.instOpen) { S.instOpen = true; localStorage.setItem("ff1roll-inst-open", "1"); }
    }
    localStorage.setItem("ff1roll-inst-fall", S.fallOn ? "1" : "0");
    applyInst();
    draw();
  });
  for (const tab of ["piano", "guitar"]) {
    document.getElementById("insttab-" + tab).addEventListener("click", () => {
      S.instTab = tab;
      localStorage.setItem("ff1roll-inst-tab", S.instTab);
      if (tab === "guitar" && S.fallOn) { // notes can only fall into piano keys
        S.fallOn = false;
        localStorage.setItem("ff1roll-inst-fall", "0");
      }
      applyInst();
      draw();
    });
  }
  S.instTab = localStorage.getItem("ff1roll-inst-tab") || "piano";
  S.instOpen = localStorage.getItem("ff1roll-inst-open") === "1";
  // the keyboard's device-local prefs (2026-10-04): gesture mode, lock,
  // Sustain, and where the keys were left (a white-key index — null = home)
  S.instMode = localStorage.getItem("ff1roll-inst-mode") === "scroll" ? "scroll" : "play";
  S.instLock = localStorage.getItem("ff1roll-inst-lock") === "1";
  S.instSustain = localStorage.getItem("ff1roll-inst-sustain") === "1";
  S.instScroll = (() => { const v = parseFloat(localStorage.getItem("ff1roll-inst-scroll-piano")); return Number.isFinite(v) ? v : null; })();
  // Fall is PARKED (Josh, 2026-09-27: opening it killed playback on the iPad — the
  // per-frame full redraw starves the note scheduler; "we can re-implement it
  // later"). The code stays; the button is hidden and the view never turns on.
  S.fallOn = false; // was: localStorage.getItem("ff1roll-inst-fall") === "1" && instTab === "piano"
  applyInst();
}
