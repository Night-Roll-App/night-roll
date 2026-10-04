// src/session/boot.js (layer 4) — docs/split-phase2-plan.md step 12/§4: the
// app's boot. boot() (the old top-level boot IIFE, last thing main.js
// calls) and the few first-launch helpers only it reads. Song-lifecycle
// orchestration proper lives in session/song.js; this file is the one
// place that decides WHICH song a fresh launch opens.
// The first song a fresh device sees. Overworld on the web; the app edition
// ships only the starter albums (FF1 rips are not ours to sell), so a
// hardcoded path would fail there (Josh, 2026-09-27: "Couldn't open
// Overworld. Load failed" on the packaged shell's first launch).
export function homeSong(all) {
  const ow = "albums/nes/final-fantasy-i/songs/overworld.mid";
  return all.includes(ow) ? ow : (all[0] || ow);
}
