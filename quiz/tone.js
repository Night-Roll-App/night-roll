// quiz/tone.js — the ear drills' sound: one WebAudio oscillator per note
// with a short envelope. Deliberately NOT the app's voices (src/audio/*
// imports the engine, the transport and S — docs/plans/2026-10-04-quiz.md,
// "Allowed imports"); a drill needs a clean pitch, not a game instrument.
//
// iOS: an AudioContext made (or resumed) outside a user gesture stays
// silent, so the context is created lazily inside the first tap and
// resumed on every play — ui.js only ever calls play() from a handler.
export function makeTone() {
  let ctx = null;
  const ensure = () => {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };
  function voice(midi, at, dur, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.012);
    g.gain.setTargetAtTime(0, at + Math.max(0.05, dur - 0.1), 0.06);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + dur + 0.4);
  }
  return {
    available: () => !!(globalThis.AudioContext || globalThis.webkitAudioContext),
    // events: [{at, dur, notes: [midi]}] — a chord is several notes at one `at`;
    // the gain is split so a seventh chord is no louder than a single note
    play(events) {
      const c = ensure();
      if (!c) return false;
      const t0 = c.currentTime + 0.03;
      for (const e of events) for (const m of e.notes) voice(m, t0 + e.at, e.dur, 0.22 / Math.sqrt(e.notes.length));
      return true;
    },
  };
}
