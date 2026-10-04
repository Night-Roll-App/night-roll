import { S } from "../state.js";
import { MASTER_VOL } from "../audio/engine.js";
import { setVolBtn } from "./controls.js";
import { trackGain } from "../audio/engine.js";
import { editableSong } from "../model/song.js";
import { pushUndo } from "../model/edits.js";
import { saveDraft } from "../model/versions.js";
import { renderTrackbar } from "../hooks.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { updateTrackGains } from "../audio/engine.js";
import { clampViewImpl as clampView } from "./chrome.js";
import { drawImpl as draw } from "./chrome.js";
import { trackColor } from "../render/roll.js";
import { trackToggle } from "./trackbar.js";
import { trackVol } from "../audio/engine.js";
import { saveTrackDir } from "./trackbar.js";
import { trackPan } from "../audio/engine.js";

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

// Drag a strip (or, later, a track chip) left/right to move a track — the
// .mid's own track order, so this reorders song.tracks itself (unlike
// mute/solo/color/pan, which live in the name-keyed track: annotation and
// are untouched by where a track sits). ONE undo step: a full snapshot of
// every ti-indexed array this function's own strips touch (shallow — no
// note arrays are cloned, just the per-track SLOTS), the same LIFO trick
// trackRemove/trackInsert already rely on (addTrackUndoable's comment):
// nothing OLDER on the undo stack is reachable until this entry is undone
// first, so an older entry's own `ti`s are still valid once that happens.
// multiSel (transient lasso selection) is safely cleared, same as every
// other track-structure change (trackInsert/trackRemove do the same).
export function reorderTrack(from, to) {
  if (!S.song || !editableSong()) return false;
  const n = S.song.tracks.length;
  to = Math.max(0, Math.min(to, n - 1));
  if (from < 0 || from >= n || from === to) return false;
  pushUndo({kind: "trackReorder", tracks: S.song.tracks.slice(), trackState: S.trackState.slice(),
            trackGains: S.trackGains.slice(), trackPanners: S.trackPanners.slice(),
            rawNotes: S.song.rawNotes ? S.song.rawNotes.slice() : null,
            selTrack: S.selTrack, selNote: S.selNote ? {ti: S.selNote.ti, ni: S.selNote.ni} : null,
            selClip: S.selClip ? {ti: S.selClip.ti, ci: S.selClip.ci} : null});
  moveInSameOrder(S.song.tracks, from, to);
  moveInSameOrder(S.trackState, from, to);
  moveInSameOrder(S.trackGains, from, to);
  moveInSameOrder(S.trackPanners, from, to);
  if (S.song.rawNotes) moveInSameOrder(S.song.rawNotes, from, to);
  const remap = ti => { // where did the track that used to sit at `ti` end up?
    if (ti === from) return to;
    if (from < to) return (ti > from && ti <= to) ? ti - 1 : ti;
    return (ti >= to && ti < from) ? ti + 1 : ti;
  };
  S.selTrack = remap(S.selTrack);
  if (S.selNote) S.selNote = {ti: remap(S.selNote.ti), ni: S.selNote.ni};
  if (S.selClip) S.selClip = {ti: remap(S.selClip.ti), ci: S.selClip.ci};
  S.multiSel = []; S.multiSelKey = new Set();
  saveDraft(); // same call addTrackUndoable's own callers make — no-ops on anything but a composition/local draft
  renderTrackbar(); renderMixer(); buildScoreModel(); updateTrackGains(); clampView(); draw();
  return true;
}
export function renderMixer() {
  const wrap = document.getElementById("mixerstrips");
  if (!wrap) return;
  wrap.innerHTML = "";
  S.mixerMeterEls = []; S.mixerStripEls = [];
  if (!S.song) return;
  const canReorder = editableSong();
  S.song.tracks.forEach((tr, ti) => {
    const strip = mixerStripEl(tr, ti, canReorder);
    S.mixerStripEls[ti] = strip;
    wrap.appendChild(strip);
  });
  wrap.appendChild(mixerMasterStripEl());
}
export function mixerStripEl(tr, ti, canReorder) {
  const st = S.trackState[ti] || (S.trackState[ti] = {muted: false, solo: false});
  const strip = document.createElement("div");
  strip.className = "mixerstrip" + (ti === S.selTrack ? " selected" : "");
  strip.dataset.ti = String(ti);

  const name = document.createElement("div");
  name.className = "mixername";
  if (canReorder) name.title = "Drag to reorder";
  name.setAttribute("role", "button");
  name.tabIndex = 0;
  name.setAttribute("aria-label", "Select " + (tr.name || "track " + (ti + 1)) + (ti === S.selTrack ? " (selected)" : ""));
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = trackColor(ti);
  const label = document.createElement("span");
  label.textContent = (tr.name || "tr" + (ti + 1)).slice(0, 10);
  name.append(dot, label);
  name.addEventListener("click", () => {
    if (S.mixerDrag) return; // a drag's own pointerup already handled the tap
    S.selTrack = ti;
    renderTrackbar(); buildScoreModel(); updateTrackGains(); clampView(); draw(); renderMixer();
  });
  strip.appendChild(name);

  const btns = document.createElement("div");
  btns.className = "mixerbtns";
  const mkBtn = (txt, on, key, label2) => {
    const b = document.createElement("button");
    b.className = "solo" + (on ? " on" : "");
    b.textContent = txt;
    b.setAttribute("aria-label", label2 + " " + (tr.name || "track " + (ti + 1)));
    b.setAttribute("aria-pressed", String(on));
    b.addEventListener("click", e => { e.stopPropagation(); trackToggle(ti, key); renderMixer(); });
    return b;
  };
  btns.append(mkBtn("M", st.muted, "muted", "Mute"), mkBtn("S", st.solo, "solo", "Solo"), mkBtn("H", st.hidden, "hidden", "Hide"));
  strip.appendChild(btns);

  const fbox = document.createElement("div");
  fbox.className = "mixerfaderbox";
  const meter = document.createElement("div");
  meter.className = "mixermeter";
  const meterfill = document.createElement("div");
  meterfill.className = "mixermeterfill";
  meter.appendChild(meterfill);
  S.mixerMeterEls[ti] = meterfill;

  const faderwrap = document.createElement("div");
  faderwrap.className = "mixerfaderwrap";
  const fader = document.createElement("input");
  fader.type = "range"; fader.className = "mixerfader";
  fader.min = "0"; fader.max = "1.5"; fader.step = "0.05";
  fader.value = String(trackVol(ti));
  fader.setAttribute("aria-label", (tr.name || "Track " + (ti + 1)) + " volume");
  faderwrap.appendChild(fader);
  fbox.append(meter, faderwrap);
  strip.appendChild(fbox);

  const vlbl = document.createElement("div");
  vlbl.className = "mixervlbl";
  vlbl.textContent = Math.round(trackVol(ti) * 100) + "%";
  strip.appendChild(vlbl);
  fader.addEventListener("input", () => { // live while dragging — same semantics as the voice menu's own fader
    tr.vol = +fader.value === 1 ? undefined : +fader.value;
    vlbl.textContent = Math.round((+fader.value) * 100) + "%";
    updateTrackGains();
  });
  fader.addEventListener("change", () => { saveTrackDir(ti); }); // persist as the track: annotation, on release

  const pan = document.createElement("input");
  pan.type = "range"; pan.className = "mixerpan";
  pan.min = "-1"; pan.max = "1"; pan.step = "0.05";
  pan.value = String(trackPan(ti));
  pan.setAttribute("aria-label", (tr.name || "Track " + (ti + 1)) + " pan");
  const plbl = document.createElement("div");
  plbl.className = "mixerplbl";
  plbl.textContent = mixerPanLabel(trackPan(ti));
  pan.addEventListener("input", () => {
    tr.pan = Math.round((+pan.value) * 100) / 100;
    plbl.textContent = mixerPanLabel(+pan.value);
    updateTrackGains();
  });
  pan.addEventListener("change", () => { saveTrackDir(ti); });
  strip.append(pan, plbl);

  if (canReorder) mixerStripDragize(strip, name, ti);
  return strip;
}
// Pointer-drag reorder (sheetDrag/wmSideDividerize's own pattern: capture
// the pointer on down, read deltas on move, commit on up). Only wired when
// canReorder (editableSong()) — on a capture/published-not-local song the
// strip has no drag handler at all, so its order is read-only, as spec'd.
export function mixerStripDragize(strip, handle, ti) {
  const move = e => {
    if (!S.mixerDrag || e.pointerId !== S.mixerDrag.id || S.mixerDrag.from !== ti) return;
    if (Math.abs(e.clientX - S.mixerDrag.x0) < 6) return; // slop — a tap must not register as a drag
    let target = null, before = true;
    S.mixerStripEls.forEach(s => {
      if (!s || s === strip) return;
      const r = s.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right) { target = s; before = e.clientX < r.left + r.width / 2; }
    });
    S.mixerStripEls.forEach(s => s && s.classList.remove("dropbefore", "dropafter"));
    if (target && target.dataset.ti !== undefined && target.dataset.ti !== "") {
      target.classList.add(before ? "dropbefore" : "dropafter");
      S.mixerDrag.to = Number(target.dataset.ti);
      S.mixerDrag.before = before;
    } else S.mixerDrag.to = undefined;
  };
  const end = e => {
    if (!S.mixerDrag || (e && e.pointerId !== S.mixerDrag.id) || S.mixerDrag.from !== ti) return;
    strip.classList.remove("dragging");
    S.mixerStripEls.forEach(s => s && s.classList.remove("dropbefore", "dropafter"));
    const d = S.mixerDrag; S.mixerDrag = null;
    if (d.to !== undefined) {
      let toIdx = d.to - (d.from < d.to ? 1 : 0);
      if (!d.before) toIdx += 1;
      reorderTrack(d.from, toIdx);
    }
  };
  handle.addEventListener("pointerdown", e => {
    if (!editableSong()) return;
    if (e.button && e.button !== 0) return;
    S.mixerDrag = {from: ti, id: e.pointerId, x0: e.clientX, to: undefined};
    strip.classList.add("dragging");
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    e.preventDefault();
  });
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}
export function openMixer() {
  if (!S.song) return;
  renderMixer();
  const el = document.getElementById("mixersheet");
  if (el) el.classList.add("on");
  ensureMixerMeters();
  ensureMixerMeterLoop();
}
export function closeMixer() {
  const el = document.getElementById("mixersheet");
  if (el) el.classList.remove("on");
  teardownMixerMeters();
}
export function toggleMixer() { if (mixerIsOpen()) closeMixer(); else openMixer(); }
