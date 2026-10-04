import { S, prof } from "../state.js";
import { audioSessionType } from "../platform/native.js";
import { logDebug } from "../hooks.js";
import { logErr } from "../hooks.js";
import { setInfo } from "../hooks.js";
import { met } from "./metronome.js";
import { sfPreloadForSong } from "./voices.js";

export function trackAudible(ti) { // what you HEAR: mute and solo (they never hide notes — DAW habit, 2026-09-29)
  const anySolo = S.trackState.some(s => s.solo);
  return anySolo ? S.trackState[ti].solo : !S.trackState[ti].muted;
}
// ---------------------------------------------------------------- audio (NES-ish voices)
export const MASTER_VOL = 0.22;
// user's master multiplier (🔊 button), device pref
export function warmContext() { // one silent sample: absorbs the fresh context's glitchy first quantum
  const src = S.audio.createBufferSource();
  src.buffer = S.audio.createBuffer(1, 1, S.audio.sampleRate);
  src.connect(S.master);
  src.start();
}
export async function clockAlive() { // don't trust the state string: prove the clock ticks
  if (!S.audio || S.audio.state !== "running") { S.clockProbe = {state: S.audio ? S.audio.state : "none"}; return false; }
  const t0 = S.audio.currentTime, s0 = performance.now();
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 50));
    if (!S.audio) break;
    if (S.audio.currentTime > t0) { S.clockProbe = null; return true; }
  }
  S.clockProbe = {state: S.audio ? S.audio.state : "none", t0, t1: S.audio ? S.audio.currentTime : null, ms: Math.round(performance.now() - s0)};
  return false;
}
export function clockProbeText() { // what the probe measured, for the log line
  const p = S.clockProbe || {};
  return "state " + (p.state || (S.audio ? S.audio.state : "none")) + (p.t0 != null ? ", clock " + p.t0.toFixed(3) + "s → " + p.t1.toFixed(3) + "s over " + p.ms + " ms" : "") +
    ", app " + (document.hidden ? "hidden" : "visible") + ", " + (S.playing ? "playing" : "stopped");
}
// The rebuild is the last resort and it is ONLY safe inside a tap. Josh,
// 2026-09-27, after importing on the iPad (Game Boy, then Chrono Trigger):
// the imported song's cursor moved with no sound, and every song after it
// was silent until a relaunch. Import's file picker interrupts the context;
// the visibility handler below then ran resumeAudio with a dead clock and
// rebuilt the context OUTSIDE a gesture — on iOS such a context runs its
// clock but never reaches the speaker, and resume() has nothing left to do.
// Now a dead clock outside a gesture only asks for a tap; play() (a tap)
// rebuilds for real. Every node the app keeps across the rebuild is reset.
export function gestureActive() { return !(typeof navigator !== "undefined" && navigator.userActivation) || navigator.userActivation.isActive; }
export function openMaster() { // declick: ramp the master up instead of snapping on
  const t = S.audio.currentTime;
  S.master.gain.cancelScheduledValues(t);
  S.master.gain.setValueAtTime(S.master.gain.value, t);
  S.master.gain.linearRampToValueAtTime(MASTER_VOL * S.masterVol, t + 0.03);
}
export function trackGain(ti) {
  if (!S.trackGains[ti]) {
    S.trackGains[ti] = S.audio.createGain();
    S.trackGains[ti].gain.value = trackAudible(ti) ? trackVol(ti) : 0; // faders survive the stop/play rebuild
    if (S.audio.createStereoPanner) { // gain → panner → master; a chip track's stereo render passes through a centred panner unchanged
      S.trackPanners[ti] = S.audio.createStereoPanner();
      S.trackPanners[ti].pan.value = trackPan(ti);
      S.trackGains[ti].connect(S.trackPanners[ti]);
      S.trackPanners[ti].connect(S.master);
    } else S.trackGains[ti].connect(S.master);
  }
  return S.trackGains[ti];
}
export function trackVol(ti) { const v = S.song.tracks[ti] && S.song.tracks[ti].vol; return v === undefined ? 1 : v; }
export function trackPan(ti) { // the track: directive's pan, else the .mid's own (CC10 — a chip capture's channel), else centre
  const tr = S.song.tracks[ti]; if (!tr) return 0;
  return tr.pan !== undefined ? tr.pan : (tr.midiPan !== undefined ? tr.midiPan : 0);
}
export function updateTrackGains() {
  if (!S.audio) return;
  S.song.tracks.forEach((_, ti) => {
    if (S.trackGains[ti]) S.trackGains[ti].gain.setValueAtTime(trackAudible(ti) ? trackVol(ti) : 0, S.audio.currentTime);
    if (S.trackPanners[ti]) S.trackPanners[ti].pan.setValueAtTime(trackPan(ti), S.audio.currentTime);
  });
}
updateTrackGains = prof("updateTrackGains", updateTrackGains); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function dutyWave(duty) {
  const N = 32, real = new Float32Array(N), imag = new Float32Array(N);
  for (let n = 1; n < N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return S.audio.createPeriodicWave(real, imag);
}
export function makeOsc(type) {
  const o = S.audio.createOscillator();
  if (type === "square25") {
    if (!S.pulse25) S.pulse25 = dutyWave(0.25);
    o.setPeriodicWave(S.pulse25);
  } else if (type === "square12") {
    if (!S.pulse12) S.pulse12 = dutyWave(0.125);
    o.setPeriodicWave(S.pulse12);
  } else if (type === "organ") { // drawbar-ish harmonic stack, flat sustain
    if (!S.organWave) {
      const real = new Float32Array([0, 1, 0.55, 0.28, 0.4, 0.1, 0.16, 0, 0.1]);
      S.organWave = S.audio.createPeriodicWave(real, new Float32Array(real.length));
    }
    o.setPeriodicWave(S.organWave);
  } else o.type = type;
  return o;
}
export function pluckBuffer(p) {
  if (S.pluckCache[p]) return S.pluckCache[p];
  if (Object.keys(S.pluckCache).length > 40) S.pluckCache = {}; // runaway-range guard
  const sr = S.audio.sampleRate;
  const f0 = 440 * Math.pow(2, (p - 69) / 12);
  const N = Math.max(2, Math.round(sr / f0));
  const buf = S.audio.createBuffer(1, Math.ceil(sr * 2), sr);
  const ch = buf.getChannelData(0);
  const dl = new Float32Array(N);
  for (let i = 0; i < N; i++) dl[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < ch.length; i++) {
    const cur = dl[idx], nxt = dl[(idx + 1) % N];
    ch[i] = cur;
    dl[idx] = (cur + nxt) * 0.5 * 0.997; // averaging = lowpass; 0.997 = string damping
    idx = (idx + 1) % N;
  }
  S.pluckCache[p] = buf;
  return buf;
}
export const pieceState = new Map();
// session audition: gm pitch -> "solo" | "mute" (tap a gutter label to cycle)
export function pieceAudible(p) { // any solo active = only solos play; else mutes are skipped
  let anySolo = false;
  for (const v of pieceState.values()) if (v === "solo") { anySolo = true; break; }
  const st = pieceState.get(p);
  return anySolo ? st === "solo" : st !== "mute";
}
export const drumNoise = {};
// len -> AudioBuffer (decay-shaped noise, reusable forever)
export function drumNoiseBuf(len) {
  const key = String(len);
  if (drumNoise[key] && drumNoise[key].sampleRate === S.audio.sampleRate) return drumNoise[key];
  const buf = S.audio.createBuffer(1, Math.ceil(S.audio.sampleRate * len), S.audio.sampleRate);
  const ch = buf.getChannelData(0);
  for (let k = 0; k < ch.length; k++) ch[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / ch.length, 1.5);
  return (drumNoise[key] = buf);
}
export const DRUM_LONG_SEC = 1;
// a captured hit this long or longer is a sustained noise voice (e.g. an SPC NON "wash" —
  // tools/spc/notes.mjs classifyNoiseVoices still calls a few genuinely busy/long voices drums), not a tick: sustain it
export const DRUM_SUSTAIN_CAP_SEC = 8;
// bound the noise buffer so a mis-tagged multi-minute hold can't allocate forever
export function drumHit(ti, p, when, vel, durSec) {
  if (!pieceAudible(p)) return; // audition state: the hit is skipped, notes untouched
  const g = S.audio.createGain();
  g.connect(trackGain(ti));
  // kit balance (Josh 2026-08-18: "the hi-hat was dominating" — noise reads
  // far louder than a sine thump at equal amplitude): kick/toms up, hats down
  const v = 0.75 * (0.3 + 0.7 * vel / 127);
  // a long captured duration (Josh, FF4 "Main Theme (Ocean)" voice 6, 2026-10-01):
  // collapsing a ~4s noise swell to the fixed 45ms tick below turned it into a
  // bright click at the swell's onset. Respect the duration instead — decay-shaped
  // noise (drumNoiseBuf already shapes it) sustained over the real length, same
  // highpass cue for the hat-register pitches, no oscillator thump for kick/toms
  // (a swell this long was never a beater hit). Real short hits are untouched —
  // this branch only fires once durSec clears DRUM_LONG_SEC.
  if (durSec != null && durSec >= DRUM_LONG_SEC) {
    const len = Math.min(durSec, DRUM_SUSTAIN_CAP_SEC);
    const buf = drumNoiseBuf(len);
    const src = S.audio.createBufferSource();
    src.buffer = buf;
    g.gain.value = v * 0.5;
    if (p === 42 || p === 44 || p === 46) { // hat-register clock: same brightness cue as a short hat
      const hp = S.audio.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 6500;
      src.connect(hp);
      hp.connect(g);
    } else src.connect(g);
    src.onended = () => { try { g.disconnect(); } catch (err) {} };
    src.start(when);
    src.stop(when + len + 0.05);
    return;
  }
  if (p <= 36 || (p >= 41 && p <= 47 && p !== 42 && p !== 44 && p !== 46)) { // kick & toms: pitched thump
    const o = S.audio.createOscillator();
    o.type = "triangle";
    // kick starts its sweep high (160Hz) so SOMETHING lives in the band small
    // speakers can reproduce — a pure 110→44Hz thump vanishes on an iPad
    // (Josh 2026-08-18: "I can't hear it at all. I should feel it or something")
    const f0 = p <= 36 ? 160 : 150 + (p - 41) * 18;
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(p <= 36 ? 45 : f0 * 0.4, when + 0.12);
    g.gain.setValueAtTime(v, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
    o.connect(g);
    o.onended = () => { try { g.disconnect(); } catch (err) {} };
    o.start(when); o.stop(when + 0.2);
    if (p <= 36) { // beater click: the transient that reads as "kick" on small speakers
      const buf = drumNoiseBuf(0.008); // cached — a fresh buffer per kick was a round-2 miss
      const click = S.audio.createBufferSource();
      click.buffer = buf;
      const cg = S.audio.createGain();
      cg.gain.value = v * 0.55;
      click.connect(cg);
      cg.connect(g);
      click.start(when);
    }
    return;
  }
  // snare / hats / cymbals: noise burst, length by GM pitch. Bursts are CACHED
  // per length — a fresh AudioBuffer noise-filled per hit was pure GC churn
  // (iPad degraded 120fps -> 52 with 75ms pauses as the graph aged, 2026-08-25)
  const len = p === 38 || p === 40 || p === 39 ? 0.11 : (p === 49 || p === 51 || p === 57 ? 0.3 : 0.045);
  const buf = drumNoiseBuf(len);
  const src = S.audio.createBufferSource();
  src.buffer = buf;
  g.gain.value = v * (len < 0.06 ? 0.5 : 0.62); // hats: the 6.5k highpass sheds most of the
  // noise's energy, so the gain compensates — still under snares (Josh: "still too quiet", 2026-08-22)
  if (len < 0.06) { // hats: highpass ABOVE the pulses' energy — masking, not level,
    // is why they vanish under regular instruments (Josh 2026-08-22, same
    // mechanism as the kick: cut through by brightness, not a volume war)
    const hp = S.audio.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500;
    src.connect(hp);
    hp.connect(g);
  } else src.connect(g);
  src.onended = () => { try { g.disconnect(); } catch (err) {} };
  src.start(when);
  src.stop(when + len + 0.05);
}
drumHit = prof("drumHit", drumHit); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()

export function ensureAudio() { // one context for the app's lifetime — iOS Safari
  // glitches the first render quantum of a fresh context. But a context iOS
  // has killed (state "closed") can never come back: rebuild + re-warm.
  if (S.audio && S.audio.state === "closed") { // iOS closes a context under pressure; rebuilding it OUTSIDE a tap gives a mute one until relaunch — leave it, play()'s tap rebuilds
    if (!gestureActive()) return;
    S.audio = null; S.master = null; S.pulse25 = null; S.pulse12 = null; S.trackGains = []; S.trackPanners = []; S.metGain = null; S.organWave = null;
  }
  if (S.audio) return;
  // WebKit picks the page's audio session itself: plain Web Audio gets an
  // "ambient" one, which iOS silences the moment the app leaves the screen
  // (the shell's AVAudioSession .playback and its audio background mode were
  // not enough — Josh, 2026-09-28, Chrono Trigger stopped on leaving).
  // "playback" is a music player's session: it keeps going off-screen.
  // …but only while Night Roll actually PLAYS (Josh, 2026-09-30: switching
  // in from YouTube stopped it at once — "playback" doesn't mix, and the
  // context is made on the first tap anywhere). Idle and note previews:
  // "ambient", which mixes; play() / the metronome ask for "playback".
  audioSessionType("ambient");
  S.audio = new (window.AudioContext || window.webkitAudioContext)();
  S.audio.onstatechange = () => { logDebug("audio state: " + (S.audio && S.audio.state) + (document.hidden ? " (app hidden)" : "")); if (S.audio && S.audio.state === "closed") logErr("audio engine closed by the system — tap ▶ to rebuild it"); };
  S.master = S.audio.createGain();
  S.master.gain.value = MASTER_VOL * S.masterVol;
  S.master.connect(S.audio.destination);
  S.trackGains = []; S.trackPanners = [];
  warmContext();
}
export function rebuildAudio(why) {
  try { if (S.audio) S.audio.close().catch(() => {}); } catch (err) { /* already closed */ }
  S.audio = null; S.master = null; S.pulse25 = null; S.pulse12 = null; S.trackGains = []; S.trackPanners = []; S.metGain = null; S.organWave = null;
  ensureAudio(); // rebuilds + re-warms (covers the first-quantum glitch)
  logDebug("audio engine rebuilt (" + why + "; gesture " + (gestureActive() ? "active" : "lapsed") + ")");
}
export async function resumeAudio() {
  if (!S.audio) return;
  const tapped = gestureActive(); // read NOW: transient activation lapses during the awaits below
  await S.audio.resume().catch(() => {});
  if (await clockAlive()) return;
  await S.audio.resume().catch(() => {});
  if (await clockAlive()) return;
  if (!tapped) { logDebug("audio clock not moving, no tap to wake it (" + clockProbeText() + ")"); return; } // never rebuild here: see above
  rebuildAudio("clock not moving inside a tap: " + clockProbeText());
  await S.audio.resume().catch(() => {});
  if (!(await clockAlive())) { // a real silence: rebuilt inside a tap and still dead — this one he can act on
    setInfo("audio asleep — tap ▶ again");
    logErr("audio asleep: rebuilt the engine inside your tap and its clock still doesn't move (" + clockProbeText() + ") — tap ▶ again; if it stays silent, relaunch the app");
  }
}

export function initEngine1() {
  if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("touchstart", () => {}, {passive: true});
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !S.audio || S.audio.state === "closed" || S.wakeInFlight) return; // a closed one waits for the tap
    if (S.playing && S.audio.state === "running") return;
    // idle: back to the mixing session BEFORE the wake. A tap, ▶ or the click
    // left "playback" behind if the app was hidden when it ended (every revert
    // skips a hidden page), and resuming the context under "playback" stopped
    // YouTube the moment Josh switched back in (2026-10-02)
    if (!S.playing && !S.albumRun && !met.on) audioSessionType("ambient");
    S.wakeInFlight = true;
    try { await resumeAudio(); } finally { S.wakeInFlight = false; }
  });
}

// The iOS silent-switch bypass is GONE (Josh, 2026-08-25). It looped a 2.0s
// silent <audio> forever to hold the tab in the "media playback" category the
// hardware mute switch does not silence. On WebKit every loop wrap is a seek,
// and his recordings put a stall burst on exactly that 2.0s beat — clean for
// 70s, then every other second after one note move, worsening until reload.
// It was added 2026-08-22 for a friend's "it won't play"; the perf collapse
// dates from 08-24. A comfort feature is not worth a third of the frame
// budget. If the mute switch bites someone again: say so in the UI, or hold
// the classification with a MUCH longer buffer so seeks are rare — do not
// re-introduce a 2-second loop.
export function initEngine2() {
  document.addEventListener("pointerdown", function warm() {
    document.removeEventListener("pointerdown", warm);
    ensureAudio();
    resumeAudio();
    if (S.sfPreloadPending) sfPreloadForSong(); // the boot-time preload deferred to this gesture
  }, {capture: true});
}
