// tools/spc-undrum.mjs: a synthetic published .mid with a misclassified
// "drums" track, un-drummed using a synthetic "re-capture" .mid as the
// source of truth for which voice/channel it really belongs on. No chip
// data here (synthetic MIDI only) — tests/spc.test.mjs covers the capture
// pipeline and classifyNoiseVoices() itself.
import test from "node:test";
import assert from "node:assert/strict";
import { writeSongMidi } from "../tools/nsf/midi-write.mjs";
import { planSong, gateCheck, matchDrumVoice, parseBytes } from "../tools/spc-undrum.mjs";

test("spc-undrum: rename case — the only source for a voice absent from the published file", () => {
  const pubSong = {
    ppq: 480, timesig: [4, 4], tempos: [{ tick: 0, usq: 500000 }],
    tracks: [
      { name: "drums", notes: [{ t: 0, d: 480, p: 42, v: 100 }] },
      { name: "voice1", notes: [{ t: 0, d: 480, p: 60, v: 90 }] },
    ],
  };
  const pubBytes = writeSongMidi(pubSong);
  const origPub = parseBytes(pubBytes);
  assert.equal(origPub.tracks.find(t => t.name === "drums").notes[0].ch, 9, "sanity: the drums track landed on channel 9");

  // the re-capture: no "drums" bucket at all, the same note sits in voice0
  // on channel 2 — the channel a real console capture would have given it
  const recSong = {
    ppq: 480, timesig: [4, 4], tempos: [{ tick: 0, usq: 500000 }],
    tracks: [{ name: "voice0", notes: [{ t: 0, d: 480, p: 42, v: 100, ch: 2 }] }],
  };
  const recBytes = writeSongMidi(recSong);

  const plan = planSong(origPub, recBytes);
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.report.voice, "voice0");
  assert.equal(plan.report.channel, 2);
  assert.equal(plan.report.merge, false);
  assert.deepEqual(plan.report.pitchDiffs, []);

  const newBytes = writeSongMidi(plan.song);
  const newParsed = parseBytes(newBytes);
  const gate = gateCheck(origPub, newParsed, plan);
  assert.equal(gate.ok, true, gate.reasons.join("; "));

  // notes identical: same total count, drums gone, renamed track carries
  // the exact same onset/duration/pitch, just off channel 9
  const total = t => t.tracks.reduce((s, tr) => s + tr.notes.length, 0);
  assert.equal(total(newParsed), total(origPub));
  assert.equal(newParsed.tracks.some(t => t.name === "drums"), false);
  const v0 = newParsed.tracks.find(t => t.name === "voice0");
  assert.equal(v0.notes.length, 1);
  assert.equal(v0.notes[0].t, 0);
  assert.equal(v0.notes[0].d, 480);
  assert.equal(v0.notes[0].p, 42);
  assert.equal(v0.notes[0].ch, 2);
  assert.equal(newParsed.tracks.some(t => t.notes.some(n => n.ch === 9)), false, "nothing left on channel 10");
  // the untouched track is byte-for-byte identical in note content
  const v1New = newParsed.tracks.find(t => t.name === "voice1").notes[0];
  const v1Old = origPub.tracks.find(t => t.name === "voice1").notes[0];
  assert.deepEqual(v1New, v1Old);
});

test("spc-undrum: merge case — the voice already has its own track in the published file", () => {
  const pubSong = {
    ppq: 480, timesig: [4, 4], tempos: [{ tick: 0, usq: 500000 }],
    tracks: [
      { name: "voice1", notes: [{ t: 0, d: 480, p: 60, v: 90, ch: 3 }, { t: 480, d: 480, p: 62, v: 90, ch: 3 }] },
      { name: "drums", notes: [{ t: 960, d: 480, p: 45, v: 100 }] },
    ],
  };
  const pubBytes = writeSongMidi(pubSong);
  const origPub = parseBytes(pubBytes);

  // re-capture: voice1 has all three notes merged, on its own channel (7) —
  // deliberately different from the published voice1's channel (3), to
  // prove the merge keeps the PUBLISHED channel, not the recapture's
  const recSong = {
    ppq: 480, timesig: [4, 4], tempos: [{ tick: 0, usq: 500000 }],
    tracks: [{ name: "voice1", notes: [
      { t: 0, d: 480, p: 60, v: 90, ch: 7 },
      { t: 480, d: 480, p: 62, v: 90, ch: 7 },
      { t: 960, d: 480, p: 45, v: 100, ch: 7 },
    ] }],
  };
  const recBytes = writeSongMidi(recSong);

  const plan = planSong(origPub, recBytes);
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.report.voice, "voice1");
  assert.equal(plan.report.merge, true);
  assert.equal(plan.report.channel, 3, "merge keeps the published track's own channel, not the recapture's");

  const newBytes = writeSongMidi(plan.song);
  const newParsed = parseBytes(newBytes);
  const gate = gateCheck(origPub, newParsed, plan);
  assert.equal(gate.ok, true, gate.reasons.join("; "));

  assert.equal(newParsed.tracks.length, 1);
  const v1 = newParsed.tracks[0];
  assert.equal(v1.name, "voice1");
  assert.equal(v1.notes.length, 3);
  assert.equal(v1.notes.every(n => n.ch === 3), true);
  const total = t => t.tracks.reduce((s, tr) => s + tr.notes.length, 0);
  assert.equal(total(newParsed), total(origPub));
});

test("matchDrumVoice: ambiguous surplus refuses rather than guessing", () => {
  const pubTracks = [{ name: "drums", notes: [{}, {}] }];
  const recTracks = [
    { name: "voice0", notes: [{}, {}] },
    { name: "voice2", notes: [{}, {}] },
  ];
  const m = matchDrumVoice(pubTracks, recTracks, 2);
  assert.equal(m.ok, false);
  assert.match(m.reason, /ambiguous/);
});

test("matchDrumVoice: no matching surplus refuses", () => {
  const pubTracks = [{ name: "drums", notes: [{}, {}, {}] }];
  const recTracks = [{ name: "voice0", notes: [{}] }];
  const m = matchDrumVoice(pubTracks, recTracks, 3);
  assert.equal(m.ok, false);
  assert.match(m.reason, /no recapture voice/);
});
