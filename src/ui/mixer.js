import { S } from "../state.js";
import { MASTER_VOL } from "../audio/engine.js";
import { setVolBtn } from "./controls.js";
import { trackGain } from "../audio/engine.js";

// what you SEE and can select: H on the chip

// ---------------------------------------------------------------- Mixer
// DAW CONVENTIONS REVIEW item 11 (open-items.md, 2026-09-29 advisor round):
// "a mixer with every channel side by side (fader, pan, M/S, a level meter)
// and drag-to-reorder tracks." #mixersheet is a dockable window
// (makeWindow, below) built fresh (renderMixer) every time it opens; a
// strip's fader/pan/M/S/H write the SAME track: annotation the voice &
// color menu and the track chips already write (saveTrackDir) — nothing
// new to persist, no new state shape.
export function mixerIsOpen() {
  const el = document.getElementById("mixersheet");
  return !!(el && el.classList && el.classList.contains("on"));
}
export function mixerPanLabel(v) { return Math.abs(v) < 0.025 ? "C" : (v < 0 ? "L" : "R") + Math.round(Math.abs(v) * 100); }
// splice-move: remove at `from`, reinsert at `to` (both already valid
// indexes into arr) — self-inverse via moveInSameOrder(arr, to, from), the
// fact reorderTrack()'s undo/redo entries lean on
export function moveInSameOrder(arr, from, to) {
  if (!arr || from === to || from < 0 || from >= arr.length) return;
  const [v] = arr.splice(from, 1);
  arr.splice(Math.max(0, Math.min(to, arr.length)), 0, v);
}
export function mixerMasterStripEl() {
  const strip = document.createElement("div");
  strip.className = "mixerstrip mixermaster";
  const label = document.createElement("div");
  label.className = "mixername";
  label.textContent = "MASTER";
  strip.appendChild(label);

  const fbox = document.createElement("div");
  fbox.className = "mixerfaderbox";
  const meter = document.createElement("div");
  meter.className = "mixermeter";
  const meterfill = document.createElement("div");
  meterfill.className = "mixermeterfill";
  meter.appendChild(meterfill);
  S.mixerMasterMeterEl = meterfill;

  const faderwrap = document.createElement("div");
  faderwrap.className = "mixerfaderwrap";
  const fader = document.createElement("input");
  fader.type = "range"; fader.className = "mixerfader";
  fader.min = "10"; fader.max = "200"; fader.step = "5";
  fader.value = String(Math.round(S.masterVol * 100));
  fader.setAttribute("aria-label", "Master volume");
  faderwrap.appendChild(fader);
  fbox.append(meter, faderwrap);
  strip.appendChild(fbox);

  const vlbl = document.createElement("div");
  vlbl.className = "mixervlbl";
  vlbl.textContent = Math.round(S.masterVol * 100) + "%";
  strip.appendChild(vlbl);
  fader.addEventListener("input", () => { // same device pref the header's own 🔊 slider writes — kept in sync both ways
    S.masterVol = (+fader.value) / 100;
    vlbl.textContent = fader.value + "%";
    localStorage.setItem("ff1roll-mastervol", String(S.masterVol));
    if (S.audio && S.master) S.master.gain.setValueAtTime(MASTER_VOL * S.masterVol, S.audio.currentTime);
    const volsl = document.getElementById("volsl"), vollbl = document.getElementById("vollbl"), volbtn = document.getElementById("volbtn");
    if (volsl) volsl.value = fader.value;
    if (vollbl) vollbl.textContent = fader.value + "%";
    if (volbtn) setVolBtn(+fader.value);
  });
  return strip;
}
// Meters: an AnalyserNode per track, tapped AFTER trackGains[ti] (a second
// destination — connect() doesn't remove the node's existing route to its
// panner/master, so tapping never touches what you hear), built lazily only
// while the Mixer is open. ensureMixerMeters is idempotent and safe to call
// any time (song load, a track added mid-session, ensureAudio() finally
// firing on the first tap) — it only fills in gaps.
export function ensureMixerMeters() {
  if (!S.audio || !S.song) return;
  S.song.tracks.forEach((tr, ti) => {
    if (S.mixerAnalysers[ti]) return;
    trackGain(ti); // every strip gets a meter the moment the Mixer opens, not only the tracks that have already played
    const an = S.audio.createAnalyser();
    an.fftSize = 256;
    S.trackGains[ti].connect(an);
    S.mixerAnalysers[ti] = an;
    S.mixerMeterBufs[ti] = new Uint8Array(an.fftSize);
  });
  if (S.master && !S.mixerMasterAnalyser) {
    S.mixerMasterAnalyser = S.audio.createAnalyser();
    S.mixerMasterAnalyser.fftSize = 256;
    S.master.connect(S.mixerMasterAnalyser);
    S.mixerMasterMeterBuf = new Uint8Array(S.mixerMasterAnalyser.fftSize);
  }
}
export function teardownMixerMeters() { // Mixer closed: drop every analyser — zero cost while closed, per spec
  S.mixerAnalysers.forEach(an => { try { an && an.disconnect(); } catch (err) { /* already gone */ } });
  S.mixerAnalysers = []; S.mixerMeterBufs = [];
  if (S.mixerMasterAnalyser) { try { S.mixerMasterAnalyser.disconnect(); } catch (err) { /* already gone */ } S.mixerMasterAnalyser = null; S.mixerMasterMeterBuf = null; }
  if (S.mixerMeterRunning) cancelAnimationFrame(S.mixerMeterRaf);
  S.mixerMeterRunning = false; S.mixerMeterRaf = 0;
}
export function mixerMeterRms(an, buf) {
  an.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
  return Math.sqrt(sum / buf.length);
}
export function mixerMeterLoop(ts) {
  if (!mixerIsOpen()) { S.mixerMeterRunning = false; S.mixerMeterRaf = 0; return; } // closed mid-flight: stop, don't reschedule — no cost while closed
  S.mixerMeterRaf = requestAnimationFrame(mixerMeterLoop);
  if (ts !== undefined && ts - S.mixerMeterLastT < 30) return; // ~30fps cap
  S.mixerMeterLastT = ts || 0;
  ensureMixerMeters(); // covers ensureAudio() firing after the Mixer was already open (the first tap anywhere)
  if (S.song) S.song.tracks.forEach((tr, ti) => {
    const an = S.mixerAnalysers[ti], el = S.mixerMeterEls[ti];
    if (!an || !el) return;
    el.style.height = Math.min(100, Math.round(mixerMeterRms(an, S.mixerMeterBufs[ti]) * 140)) + "%";
  });
  if (S.mixerMasterAnalyser && S.mixerMasterMeterEl)
    S.mixerMasterMeterEl.style.height = Math.min(100, Math.round(mixerMeterRms(S.mixerMasterAnalyser, S.mixerMasterMeterBuf) * 140)) + "%";
}
// mixerMeterRunning (not "is mixerMeterRaf truthy") is the source of truth for
// "is the loop scheduled": requestAnimationFrame's own id can legitimately be
// 0 (the vm harness's inert stub always returns 0), so treating id-as-boolean
// would re-schedule a duplicate loop every call
export function ensureMixerMeterLoop() {
  if (S.mixerMeterRunning) return;
  S.mixerMeterRunning = true;
  S.mixerMeterRaf = requestAnimationFrame(mixerMeterLoop);
}
