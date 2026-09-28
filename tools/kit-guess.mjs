// Percussion keys guessed from rhythm. A sequence chip names its drums by an
// index into a bank the rip does not carry (PS1 drum-mode degrees, N64 drum
// indexes), so which sound each index makes is unknown; what IS known is
// when each one hits. The voice on the backbeats is the snare, the one on
// the downbeats the kick, the busiest the hats — the way a listener would
// place them. Shared by tools/psx/notes.mjs and tools/n64/notes.mjs; the
// PS1 real-rip tests pin the FF7 results.
//
// voices: [{key, notes: [{tick}]}] — mutated: count, down, back, one, on,
// then gm (General MIDI key) + label. beatTicks/barBeats describe the meter
// the ticks are read against. Returns the same list.
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
