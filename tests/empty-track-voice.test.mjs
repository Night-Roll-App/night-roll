// Cut every note from pulse1 of a 3-track chip-layout song (no pulse2): the
// emptied track must keep its slot — live, after a published .mid is
// re-parsed, and after a draft reopen — so the index-keyed auto voice
// (voiceType) and every channel/colour/annotation slot of the OTHER tracks
// stay put. Native bug 53159d8: the empty track was dropped and the voices
// shifted down one (triangle played as a pulse, noise as the triangle).
import nodeTest from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./harness.mjs";

const app = await createApp();
const run = (c) => app.run(c);
const val = (c) => JSON.parse(run(`JSON.stringify(${c})`));
const test = nodeTest;

const KEY = "albums/compositions/nightroll/cut-voice-scratch.mid";
function install() {
  run(`
    S.song = {ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000, sec: 0}],
      tracks: [
        {name: "pulse1", notes: [{t: 0, d: 240, p: 72, v: 90}, {t: 480, d: 240, p: 74, v: 90}, {t: 960, d: 240, p: 76, v: 90}]},
        {name: "triangle", notes: [{t: 0, d: 480, p: 48, v: 90}, {t: 480, d: 480, p: 50, v: 90}]},
        {name: "noise", kit: true, notes: [{t: 0, d: 120, p: 38, v: 90}, {t: 480, d: 120, p: 42, v: 90}]}]};
    S.songKey = ${JSON.stringify(KEY)}; localStorage.setItem("ff1roll-draft-" + S.songKey, "{}");
    S.song.rawNotes = null; S.chopS = 0; S.selTrack = 0; S.editUndo = []; S.editRedo = [];
    S.trackState = S.song.tracks.map(() => ({muted: false, solo: false}));
  `);
}
// name -> {voice, live pitches}: what the synth is told per track
const snap = () => val(`Object.fromEntries(S.song.tracks.map((tr, ti) => [tr.name, {
  ti, voice: trackVoice(ti), kit: !!tr.kit, pitches: tr.notes.filter(n => !n.gone).map(n => n.p)}]))`);

test("cutting all of pulse1 keeps every other track's voice and pitches", () => {
  install();
  const before = snap();
  run(`S.multiSel = S.song.tracks[0].notes.map((n, ni) => ({ti: 0, ni})); S.multiSelKey = new Set(S.multiSel.map(x => x.ti + ":" + x.ni));`);
  assert.equal(run(`deleteSelection()`), 3);
  const live = snap();
  assert.deepEqual(live.pulse1.pitches, []);
  for (const nm of ["triangle", "noise"]) assert.deepEqual(live[nm], before[nm], "live " + nm);

  // draft reopen (compositions/local songs): draftDoc -> JSON -> openDraftDoc
  run(`globalThis.__d = JSON.parse(JSON.stringify(draftDoc(false)))`);
  run(`openDraftDoc(globalThis.__d, S.songKey)`);
  const viaDraft = snap();
  assert.deepEqual(Object.keys(viaDraft), ["pulse1", "triangle", "noise"]);
  for (const nm of ["triangle", "noise"]) assert.deepEqual(viaDraft[nm], live[nm], "draft reopen " + nm);

  // Publish -> reopen: the .mid written, parsed, and opened as loadSongInner does
  const bytes = run(`Array.from(writeMidi(S.song))`);
  run(`setSong(parseMidi(new Uint8Array(${JSON.stringify(bytes)}).buffer), S.songKey)`);
  const viaMid = snap();
  assert.deepEqual(Object.keys(viaMid), ["pulse1", "triangle", "noise"], "empty pulse1 keeps its slot");
  for (const nm of ["pulse1", "triangle", "noise"]) assert.deepEqual(viaMid[nm], live[nm], "mid reopen " + nm);

  // channels in a second write are unchanged too (noise stays on 10)
  const again = run(`Array.from(writeMidi(S.song))`);
  assert.deepEqual(again, bytes, "re-save is byte-identical");
  run(`S.songKey = null; S.multiSel = []; S.multiSelKey = new Set(); S.editUndo = []; S.editRedo = [];`);
});

test("undo of the cut restores the notes after a reopen", () => {
  install();
  const before = snap();
  run(`S.multiSel = S.song.tracks[0].notes.map((n, ni) => ({ti: 0, ni})); S.multiSelKey = new Set(S.multiSel.map(x => x.ti + ":" + x.ni));`);
  run(`deleteSelection()`);
  run(`editUndoPop()`);
  assert.deepEqual(snap(), before);
  run(`S.songKey = null; S.multiSel = []; S.multiSelKey = new Set(); S.editUndo = []; S.editRedo = [];`);
});
