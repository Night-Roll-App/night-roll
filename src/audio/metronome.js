import { S } from "../state.js";
import { effTs } from "../model/grid.js";
import { playSec } from "./transport.js";
import { secToTick } from "../midi/parse.js";
import { tickToSec } from "../midi/parse.js";
import { audioSessionType } from "../platform/native.js";

// ---------------------------------------------------------------- metronome (⏱)
// Standalone and feature-rich: any meter, per-beat accent editing (tap a cell:
// accent → normal → silent), subdivisions, tap tempo. Plays through its own
// gain straight to the destination, so it survives song stop()'s master fade
// and can click OVER a playing song — a poor man's meter audition.
export const met = Object.assign({bpm: 120, num: 4, den: 4, sub: 1, accents: [2, 1, 1, 1], on: false,
                           follow: "song", nudge: 0, countIn: false}, // follow the song by default (Josh, 2026-09-29: a free 120 clicked out of time with the song)
                          JSON.parse(localStorage.getItem("ff1roll-met") || "{}"));
export const metSave = () => localStorage.setItem("ff1roll-met",
  JSON.stringify({bpm: met.bpm, num: met.num, den: met.den, sub: met.sub, accents: met.accents,
                  follow: met.follow, nudge: met.nudge, countIn: met.countIn}));
export function metDefaultAccents() { // beat 1 accented; compound meters accent each group of 3
  return Array.from({length: met.num}, (_, i) =>
    i === 0 ? 2 : (met.den >= 8 && met.num % 3 === 0 && i % 3 === 0) ? 2 : 1);
}
export function metBuildCells() {
  const row = document.getElementById("metbeats");
  row.innerHTML = "";
  met.accents.forEach((lv, i) => {
    const b = document.createElement("button");
    b.className = "metbeat l" + lv;
    b.textContent = String(i + 1);
    b.addEventListener("click", () => {
      met.accents[i] = (met.accents[i] + 2) % 3; // 2 → 1 → 0 → 2
      metSave();
      metBuildCells();
    });
    row.appendChild(b);
  });
}
export function metClick(when, level) { // natural wood click: bandpassed noise tick.
  // v1 squares were squeaky; v2's pitch glide read as sci-fi (Josh) — the
  // fix is NO pitch movement at all, just a short filtered transient whose
  // ring dies on its own, like a physical metronome.
  const dur = 0.03;
  const buf = S.audio.createBuffer(1, Math.ceil(S.audio.sampleRate * dur), S.audio.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2);
  const src = S.audio.createBufferSource();
  src.buffer = buf;
  const bp = S.audio.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = level === 2 ? 1500 : level === 1 ? 1000 : 2000;
  bp.Q.value = 8;
  const g = S.audio.createGain();
  g.gain.value = (level === 2 ? 2.8 : level === 1 ? 1.8 : 0.8); // narrowband eats energy
  src.connect(bp);
  bp.connect(g);
  g.connect(S.metGain);
  src.start(when);
}
// Follow/trial modes (Josh, 2026-08-15): clicks derive from the SONG's own
// tick grid through tickToSec — phase-true by construction, tempo map and
// speed slider included, loop wraps handled by chasing the next beat inside
// the loop segment. Follow clicks the declared meter; trial clicks a meter
// of Josh's choosing over the real music (the honest meter audition:
// accents supplied, verdict his), with "shift accents" cycling the pattern's
// starting beat — a candidate meter can be right but offset.
export function metFollowBeatTicks() {
  const den = met.follow === "trial" ? met.den : effTs()[1];
  return S.song.ppq * 4 / den;
}
export function metFollowNum() { return met.follow === "trial" ? met.num : effTs()[0]; }
export function metPumpFollow() {
  if (!S.playing) return; // follow/trial click only while the song runs
  const tb = metFollowBeatTicks();
  const num = metFollowNum();
  const now = playSec();
  let bt = Math.ceil((secToTick(S.song, now) + 1) / tb) * tb;
  let delta;
  const sec = tickToSec(S.song, bt);
  if (S.loopSeg && S.loopSeg.end > S.loopSeg.start && sec >= S.loopSeg.end - 1e-4) {
    // next beat lies past the jump point: chase it into the next pass
    bt = Math.ceil((secToTick(S.song, S.loopSeg.start) - 1e-4) / tb) * tb;
    delta = (S.loopSeg.end - now) + (tickToSec(S.song, bt) - S.loopSeg.start);
  } else {
    delta = sec - now;
  }
  if (delta > 0.16) return;
  const when = S.audio.currentTime + Math.max(0.005, delta);
  if (S.metLastWhen >= 0 && Math.abs(when - S.metLastWhen) < 0.03) return; // this beat is scheduled
  S.metLastWhen = when;
  const k = Math.round(bt / tb);
  const idx = (((k + met.nudge) % num) + num) % num;
  const lv = met.accents[idx] !== undefined ? met.accents[idx] : 1;
  if (lv > 0) metClick(when, lv);
  setTimeout(() => {
    if (!met.on) return;
    document.querySelectorAll("#metbeats .metbeat").forEach((el, j) =>
      el.classList.toggle("now", j === idx));
  }, Math.max(0, (when - S.audio.currentTime) * 1000));
}
export function metPump() {
  if (met.follow !== "free") { metPumpFollow(); return; }
  const spb = 60 / met.bpm; // seconds per counted (denominator) beat
  while (S.metNext < S.audio.currentTime + 0.12) {
    const i = S.metIdx % met.num;
    const lv = met.accents[i];
    if (lv > 0) metClick(S.metNext, lv);
    for (let s = 1; s < met.sub; s++) metClick(S.metNext + spb * s / met.sub, 0); // sub-clicks, quiet
    const delay = Math.max(0, (S.metNext - S.audio.currentTime) * 1000);
    setTimeout(() => {
      if (!met.on) return;
      document.querySelectorAll("#metbeats .metbeat").forEach((el, k) =>
        el.classList.toggle("now", k === i));
    }, delay);
    S.metIdx++;
    S.metNext += spb;
  }
}
export function ensureMetGain() {
  if (!S.metGain || S.metGain.context !== S.audio) {
    S.metGain = S.audio.createGain();
    S.metGain.gain.value = 1;
    S.metGain.connect(S.audio.destination); // not master: song stop()'s fade can't silence the click
  }
}
export function metHalt() {
  met.on = false;
  if (!S.playing && !document.hidden) audioSessionType("ambient");
  clearInterval(S.metTimer);
  document.getElementById("metgo").textContent = "▶ Start";
  document.getElementById("metbtn").classList.remove("active");
  document.querySelectorAll("#metbeats .metbeat").forEach(el => el.classList.remove("now"));
}
export function applyMetMode() {
  const f = met.follow;
  document.getElementById("metnudgewrap").style.display = f === "trial" ? "" : "none";
  document.getElementById("metbpm").disabled = f !== "free";
  document.getElementById("metnum").disabled = f === "follow";
  document.getElementById("metden").disabled = f === "follow";
  document.getElementById("metsub").disabled = f !== "free"; // subs are free-run only
  if (f === "follow" && S.song) { // cells mirror the declared meter
    met.num = effTs()[0];
    met.den = effTs()[1];
    document.getElementById("metnum").value = String(met.num);
    document.getElementById("metden").value = String(met.den);
    met.accents = metDefaultAccents();
    metBuildCells();
  }
  S.metLastWhen = -1;
  metSave();
}
