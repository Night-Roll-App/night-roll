// Percussion keys guessed from rhythm. A sequence chip names its drums by an
// index into a bank the rip does not carry (PS1 drum-mode degrees, N64 drum
// indexes), so which sound each index makes is unknown; what IS known is
// when each one hits. The voice on the backbeats is the snare, the one on
// the downbeats the kick, the busiest the hats — the way a listener would
// place them. Shared by tools/psx/notes.mjs and tools/n64/notes.mjs; the
// PS1 real-rip tests pin the FF7 results.
//
// voices: [{key, notes: [{tick, dur?}]}] — mutated: count, down, back, one,
// on, len, then gm (General MIDI key) + label. beatTicks/barBeats describe
// the meter the ticks are read against. Returns the same list.
//
// `dur` (ticks) is optional and decides first when every note of a voice has
// one: a hit held for most of a beat or longer is let ring — a cymbal — while
// the drums that mark the beat are gated to a fraction of it. Rhythm alone
// got this wrong (#1134, FF4 Red Wings voice7: 53 hits of 1–4 beats, one of
// them on a backbeat, "snare" — over the real snare's row). The capture
// pipelines pass no `dur`: a sequence chip's drum length is its channel's
// gate until the next note, not the sound's, so their pinned guesses stand.
export const RING_BEATS = 0.75;
export function guessKit(voices, {beatTicks, barBeats = 4}) {
  for (const v of voices) {
    let down = 0, back = 0, one = 0, on = 0;
    for (const n of v.notes) {
      const beat = (n.tick / beatTicks) % barBeats, whole = Math.abs(beat - Math.round(beat)) < 0.05;
      if (!whole) continue;
      on++;
      const b = Math.round(beat) % barBeats;
      if (b === 0) one++;
      if (b % 2 === 0) down++; else back++;
    }
    v.count = v.notes.length; v.down = down / v.count; v.back = back / v.count; v.one = one / v.count; v.on = on / v.count;
    const durs = v.notes.map(n => n.dur).filter(d => d > 0).sort((a, b) => a - b);
    v.len = durs.length === v.count ? durs[durs.length >> 1] / beatTicks : null; // median held length in beats; null = lengths unknown
  }
  for (const v of voices) {
    if (v.len === null || v.len < RING_BEATS) continue;
    // let ring on the downbeats or for bars at a time = the crash; a ringing pattern = the ride
    if (v.one >= 0.5 || v.len >= 2) { v.gm = 49; v.label = "crash"; } else { v.gm = 51; v.label = "ride"; }
  }
  const pick = (score, gm, label) => {
    const c = voices.filter(v => !v.gm).sort((a, b) => score(b) - score(a))[0];
    if (c && score(c) > 0) { c.gm = gm; c.label = label; }
  };
  pick(v => v.count >= 4 ? v.back : 0, 38, "snare");
  pick(v => v.count >= 4 ? v.down : 0, 36, "kick");
  pick(v => v.count >= 8 ? v.count : 0, 42, "closed hat");
  pick(v => v.count >= 8 ? v.count : 0, 46, "open hat");
  pick(v => v.count >= 8 ? v.count : 0, 51, "ride");
  const rest = voices.filter(v => !v.gm).sort((a, b) => a.key - b.key);
  const toms = [41, 45, 47, 48, 50], tomNames = ["low tom", "tom", "mid tom", "high-mid tom", "high tom"];
  let ti = 0;
  for (const v of rest) {
    if (v.count < 8 && v.one >= 0.5) { v.gm = 49; v.label = "crash"; continue; }
    v.gm = toms[Math.min(ti, toms.length - 1)]; v.label = tomNames[Math.min(ti, toms.length - 1)]; ti++;
  }
  return voices;
}

// General MIDI percussion keys 35…81, and a guessKit result (voices with .gm)
// -> Map(key -> a General MIDI key unique in the song): any key two voices
// share moves to the next free percussion key, so distinct sounds never merge.
// `taken` pre-reserves keys already in use (the app: what the song's other
// drum tracks play, #1134); `pool` is where a moved key may land — the app
// passes the kit lane's rows (render/roll.js DRUM_SLOTS), since a key with no
// row would draw on the lane's first one; the pipelines take any GM key.
// (Moved here from tools/nsf/midi-write.mjs when the app needed it too — a
// hand-marked drum track guesses its sounds at play time.)
export const GM_PERC = Array.from({length: 47}, (_, k) => 35 + k);
export function uniqueGmKeys(voices, taken = new Set(), pool = GM_PERC) {
  const keys = [...pool].sort((a, b) => a - b);
  const free = from => keys.find(k => !taken.has(k) && k > from) || keys.find(k => !taken.has(k))
    || GM_PERC.find(k => !taken.has(k) && k > from) || GM_PERC.find(k => !taken.has(k));
  const out = new Map();
  for (const v of [...voices].sort((a, b) => a.key - b.key)) {
    let p = v.gm;
    if (taken.has(p)) p = free(v.gm);
    taken.add(p); out.set(v.key, p);
  }
  return out;
}
