// Dump every FF1 song from the NSF into albums/nes/final-fantasy-i/songs/:
// <song>.mid (the album Night Roll plays), <song>.notes.txt (text dump for
// LLM reading), and a measured loop: directive when a song's rollnotes file
// doesn't exist yet (existing rollnotes are NEVER touched — they hold
// Josh's analysis). Compare each run's printout against ../CUTS.md.
// Track numbers from the Zophar m3u; meter read from the existing song file;
// tempo loop-calibrated from verified PERIOD_BARS (or grid-fitted).
// Run: node tools/nsf/dump-all.mjs <ff1.nsf> [--out <dir>] [--only a,b]
// --out writes the .mid/.notes.txt there instead (tools/recapture.mjs:
// /tmp/recap/out/nes/final-fantasy-i/) and never writes a loop directive;
// the meter is still read from the published song in the repo. The rip is
// the archive's nes/ff1.nsf (gitignored ROM music, never in the repo).
import "../vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseNSF, runNSF } from "./nsf.mjs";
import { reconstruct, toNotesTxt, fitBpm, detectLoop, backportTiming } from "./notes.mjs";
import { makeMidi } from "./midi-write.mjs";
import { createApp } from "../../tests/harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const FF1_SONGS = path.join(ROOT, "albums/nes/final-fantasy-i/songs");

// Verified loop lengths IN BARS (Josh's analyses + earlier MIDI trims): the
// chip's frame-exact period ÷ this count gives the TRUE tempo. Songs absent
// here fall back to the grid fit.
const PERIOD_BARS = {
  prelude: 16, prologue: 24, overworld: 16, ship: 24,
  airship: 16, town: 8, "cornelia-castle": 8,
  "gurgu-volcano": 20, // NOT the transcription's 21 — at 20 the period gives
                       // exactly 150bpm (the driver's tempo family); the
                       // 21st MIDI bar was the arranger's, like gameover's
  "matoyas-cave": 20, cave: 30, "chaos-temple": 16,
  "underwater-palace": 16,
  shop: 28, // 3/4 per Josh's meter determination (2026-08-05) — the
            // inherited 4/4 was the first confirmed fossil error; same
            // loop seconds, re-barred: 28 bars of 3/4 at 200
  battle: 26, menu: 8,
  "game-over": 8,
  victory: 8, // NOT 6 — snap-residual audit picks 150bpm (8 bars) over
                 // 112.5 (6 bars) decisively; same driver family as the rest
};

// no loop to calibrate from (through-composed), but the blind grid fit lands
// within a hair of a known driver tempo — snap to it (integer frames per 16th)
const FIXED_BPM = { epilogue: 112.5 };
// meters determined by Josh that override the .mid's inherited (fossil)
// meta — see the analysis docs for the derivations
const METER_OVERRIDE = { shop: [3, 4] };
// don't grid-snap these: through-composed with tempo changes/fermatas a
// single grid can't follow — keep raw hardware timing (bar labels approximate)
const NO_SNAP = { epilogue: true };

export const TRACKS = [ // [nsf track, repo name, seconds to capture — ≥ intro + 2 loops]
  [1,  "prelude", 170],
  [2,  "prologue", 85],
  [3,  "epilogue", 270], // through-composed, ~256s of music + final held chord — no loop to trim
  [4,  "overworld", 60],
  [5,  "ship", 90],
  [6,  "airship", 45],
  [7,  "town", 45],
  [8,  "cornelia-castle", 40],
  [9,  "gurgu-volcano", 65],
  [10, "matoyas-cave", 65],
  [11, "cave", 50],           // the chip has ONE track for cave/dungeon
  [12, "chaos-temple", 55],
  [13, "floating-castle", 65],
  [14, "underwater-palace", 55],
  [15, "shop", 55],
  [16, "battle", 90],
  [17, "menu", 35],
  [18, "game-over", 45],
  [19, "victory", 30],
];

async function meterOf(repoName) { // meter + bpm seed + bar count from the transcription MIDI
  try {
    const app = await createApp();
    app.context.midiBytes = [...readFileSync(path.join(FF1_SONGS, repoName + ".mid"))];
    const info = JSON.parse(app.run(
      "JSON.stringify((() => { const r = parseMidi(new Uint8Array(midiBytes).buffer); const bt = r.timesig[0] * 4 / r.timesig[1] * r.ppq; let end = 0; r.tracks.forEach(t => t.notes.forEach(n => end = Math.max(end, n.t + n.d))); return {ts: r.timesig, bpm: Math.round(6e7 / r.tempos[0].usq), bars: Math.ceil(end / bt - 0.05)}; })())"));
    return {tsNum: info.ts[0], tsDen: info.ts[1], seedBpm: info.bpm, midiBars: info.bars};
  } catch (err) {
    return {tsNum: 4, tsDen: 4, seedBpm: 120, midiBars: null};
  }
}

// {nsfPath, outDir (default: the album), only: [names] | null, log} →
// [{name, track, mid, loop: "anchor>target" | null, bpm, tempoSrc}]
export async function dumpFF1({nsfPath, outDir = FF1_SONGS, only = null, log = console.log}) {
const intoAlbum = path.resolve(outDir) === FF1_SONGS;
mkdirSync(outDir, {recursive: true});
const nsf = parseNSF(readFileSync(nsfPath));
log(`${nsf.name} — ${nsf.artist}; ${nsf.songs} tracks in file`);
const results = [];

for (const [track, name, seconds] of TRACKS) {
  if (only && !only.includes(name)) continue;
  const {apuLog, frames, frameSec} = runNSF(nsf, track, seconds);
  let events = reconstruct(apuLog, frames, frameSec);
  // shift time zero to the first onset so chip bars line up with MIDI bars
  // (caveat: a pickup-intro song like ship starts its pickup at bar 1 beat 1)
  const t0 = Math.min(...events.map(e => e.startFrame));
  events = events.map(e => ({...e, startFrame: e.startFrame - t0, endFrame: e.endFrame - t0}));
  let {tsNum, tsDen, seedBpm, midiBars} = await meterOf(name);
  if (METER_OVERRIDE[name]) [tsNum, tsDen] = METER_OVERRIDE[name];

  // trim to intro + one loop pass, exactly as the transcriptions were.
  // victory varies articulation per pass; Josh verified its 6-bar period
  // by ear, so hint the detector at ~12.8s
  const HINTS = {victory: 768};
  const loop = detectLoop(events, frames - t0, HINTS[name] || null);
  let keptFrames = frames - t0;
  if (loop) {
    events = backportTiming(events, loop.period);
    keptFrames = loop.keep;
    // no pass-2 onsets — the guard absorbs accumulator jitter (a pass-2
    // downbeat can land a frame before the exact period boundary)
    events = events.filter(e => e.startFrame < loop.onsets - 3)
      .map(e => ({...e, endFrame: Math.min(e.endFrame, keptFrames)}));
  }

  // tempo: exact from the loop length when the transcription's bar count is
  // verified; otherwise fall back to the grid fit
  let bpm, tempoSrc;
  if (loop && PERIOD_BARS[name]) {
    const barSec = loop.period * frameSec / PERIOD_BARS[name];
    bpm = +(60 * (tsNum * 4 / tsDen) / barSec).toFixed(2);
    tempoSrc = "loop-calibrated";
    // sanity: a calibrated tempo wildly off the MIDI's means the detected
    // period disagrees with the verified bar count — flag rather than lie
    if (bpm < seedBpm * 0.65 || bpm > seedBpm * 1.5) {
      bpm = fitBpm(events, frameSec, seedBpm);
      tempoSrc = "grid-fitted (calibration REJECTED — check period)";
    }
  } else if (FIXED_BPM[name]) {
    bpm = FIXED_BPM[name];
    tempoSrc = "driver-tempo-family";
  } else {
    bpm = fitBpm(events, frameSec, seedBpm);
    tempoSrc = "grid-fitted";
  }
  const chipBars = keptFrames * frameSec / (60 / bpm * (tsNum * 4 / tsDen));
  const beatSec = 60 / bpm;
  const bpb = tsNum * 4 / tsDen;
  const q = x => Math.round(x * 4) / 4;
  const bq = beats => { // beats-from-zero -> "bar.beat" on the 16th grid
    const bar = Math.floor(q(beats) / bpb) + 1;
    const beat = q(beats) - (bar - 1) * bpb + 1;
    return bar + "." + beat;
  };
  // record the cut so it's never a mystery: where this capture ends and
  // where the loop returns (frame-exact repeat points, Josh-verified rules)
  const cutInfo = loop
    ? "cut at " + bq(loop.keep * frameSec / beatSec) +
      ", loops to " + bq((loop.keep - loop.period) * frameSec / beatSec)
    : "through-composed, no cut";

  const snap = !NO_SNAP[name];
  const txt = toNotesTxt(events, {
    frames: keptFrames, frameSec, bpm, tsNum, tsDen, snap,
    title: name + " (chip capture, NSF track " + track + ", " + tempoSrc + " " + bpm + "bpm; " + cutInfo + (snap ? "" : "; raw timing, grid approximate") + ")",
  });
  writeFileSync(path.join(outDir, name + ".notes.txt"), txt);
  writeFileSync(path.join(outDir, name + ".mid"), makeMidi(events, {bpm, tsNum, tsDen, frameSec, snap}));
  let loopNote = null;

  // when the loop returns somewhere other than the top, that's hardware fact:
  // record it as a loop: directive in the chip song's rollnotes (never
  // overwrite a file Josh may have edited)
  if (loop) {
    const backBeats = (loop.keep - loop.period) * frameSec / beatSec;
    if (backBeats > 0.4) {
      // anchor = the jump point (capture end), value = the jump target —
      // the player fires the loop at the anchor when it sits past the target
      const anchor = bq(loop.keep * frameSec / beatSec);
      const target = "loop: " + bq(backBeats);
      loopNote = anchor + ">" + bq(backBeats);
      const rn = path.join(outDir, name + ".rollnotes.json");
      if (intoAlbum && !existsSync(rn)) {
        writeFileSync(rn, "# " + name + " — chip capture (legacy text; app migrates on sync)\n\n[" + anchor + "]\n" + target + "\n");
        log("   wrote loop directive: [" + anchor + "] " + target);
      }
    }
  }
  results.push({name, track, mid: path.join(outDir, name + ".mid"), loop: loopNote, bpm, tempoSrc});
  log(name.padEnd(22) + "track " + String(track).padEnd(3) +
              (loop ? "keep " + (loop.keep * frameSec).toFixed(1) + "s (P=" +
                      (loop.period * frameSec).toFixed(1) + "s)" : "no-loop").padEnd(24) +
              bpm + "bpm (" + tempoSrc + ")  bars " + chipBars.toFixed(2) +
              (midiBars ? " vs midi " + midiBars : ""));
}
return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  let nsfPath = null, outDir = FF1_SONGS, only = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--out") outDir = path.resolve(a[++i]);
    else if (a[i] === "--only") only = a[++i].split(",");
    else nsfPath = a[i];
  }
  nsfPath = nsfPath || path.join(ROOT, "albums/nes/final-fantasy-i/reference/ff1.nsf");
  if (!existsSync(nsfPath)) { console.error("no NSF at " + nsfPath + " — pass the rip (the archive's nes/ff1.nsf; tools/recapture.mjs fetches it into /tmp/recap/rips/)"); process.exit(1); }
  await dumpFF1({nsfPath, outDir, only});
}
