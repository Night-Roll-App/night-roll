// tests/capture-diff.test.mjs — the re-capture gate (tools/capture-diff.mjs)
// on synthetic pairs: each verdict, its first differing bar, and the
// recapture planner's action + write allowlist (tools/recapture.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readSmf, captureDiff, barOf, loopOfRollnotes } from "../tools/capture-diff.mjs";
import { planAction, assertWritable, annotationsOf, vaultFilesOf } from "../tools/recapture.mjs";

// a format-1 SMF: conductor (tempo, meter) + one MTrk per track
// track: {name, notes: [{t, d, p, v, ch?}], extra: [{t, bytes}]}
function smf({ppq = 480, tempos = [{tick: 0, usq: 500000}], ts = [{tick: 0, num: 4, den: 4}], tracks}) {
  const vl = n => { const o = [n & 0x7F]; while ((n >>= 7)) o.unshift((n & 0x7F) | 0x80); return o; };
  const chunk = evs => {
    evs.sort((a, b) => a.t - b.t || a.o - b.o);
    const body = []; let last = 0;
    for (const e of evs) { body.push(...vl(e.t - last), ...e.bytes); last = e.t; }
    body.push(0, 0xFF, 0x2F, 0);
    return [0x4D, 0x54, 0x72, 0x6B, body.length >>> 24, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body];
  };
  const cond = [...tempos.map(x => ({t: x.tick, o: 0, bytes: [0xFF, 0x51, 3, x.usq >> 16, (x.usq >> 8) & 255, x.usq & 255]})),
                ...ts.map(x => ({t: x.tick, o: 0, bytes: [0xFF, 0x58, 4, x.num, Math.log2(x.den), 24, 8]}))];
  const out = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length + 1, ppq >> 8, ppq & 255, ...chunk(cond)];
  for (const tr of tracks) {
    const evs = [{t: 0, o: 0, bytes: [0xFF, 0x03, tr.name.length, ...Buffer.from(tr.name)]}];
    for (const n of tr.notes) {
      evs.push({t: n.t, o: 2, bytes: [0x90 | (n.ch || 0), n.p, n.v]});
      evs.push({t: n.t + n.d, o: 1, bytes: [0x80 | (n.ch || 0), n.p, 0]});
    }
    for (const x of tr.extra || []) evs.push({t: x.t, o: 3, bytes: x.bytes});
    out.push(...chunk(evs));
  }
  return new Uint8Array(out);
}
const base = () => ({tracks: [
  {name: "pulse1", notes: [{t: 0, d: 240, p: 60, v: 100}, {t: 480, d: 240, p: 62, v: 100}, {t: 1920 * 2, d: 480, p: 64, v: 90}]},
  {name: "pulse2", notes: [{t: 0, d: 960, p: 48, v: 80}]},
]});
const diff = (a, b, o) => captureDiff(readSmf(smf(a)), readSmf(smf(b)), o);

test("capture-diff: identical files are SAME", () => {
  const r = diff(base(), base());
  assert.equal(r.verdict, "SAME");
  assert.equal(r.firstBar, null);
  assert.deepEqual(r.gained, {});
});

test("capture-diff: a changed velocity is VELOCITY, at its bar", () => {
  const b = base(); b.tracks[0].notes[2].v = 70;
  const r = diff(base(), b);
  assert.equal(r.verdict, "VELOCITY");
  assert.equal(r.firstBar, 3, "the third note sits in bar 3 (two 4/4 bars of 1920 ticks before it)");
});

test("capture-diff: added aftertouch (ve + a shape point) and a CC are VELOCITY, counted as gained", () => {
  const b = base();
  b.tracks[1].extra = [{t: 0, bytes: [0xA0, 48, 40]}, {t: 480, bytes: [0xA0, 48, 90]}, {t: 0, bytes: [0xB0, 91, 30]}];
  const r = diff(base(), b);
  assert.equal(r.verdict, "VELOCITY");
  assert.deepEqual(r.gained, {ve: 1, shape: 1, cc91: 1});
});

test("capture-diff: a new track after the old ones is ADDED-TRACK, even with velocity changes on old tracks", () => {
  const b = base(); b.tracks.push({name: "dpcm", notes: [{t: 1920, d: 60, p: 36, v: 110, ch: 9}]});
  let r = diff(base(), b);
  assert.equal(r.verdict, "ADDED-TRACK");
  assert.equal(r.firstBar, 2);
  assert.match(r.reasons[0], /tr3 dpcm \(1 notes\)/);
  b.tracks[0].notes[0].v = 1;
  r = diff(base(), b);
  assert.equal(r.verdict, "ADDED-TRACK");
});

test("capture-diff: MOVED — a note's start, length or pitch", () => {
  for (const edit of [n => { n.t += 60; }, n => { n.d += 60; }, n => { n.p += 1; }]) {
    const b = base(); edit(b.tracks[0].notes[1]);
    const r = diff(base(), b);
    assert.equal(r.verdict, "MOVED");
    assert.equal(r.firstBar, 1);
    assert.equal(r.tracks[0].status, "moved");
  }
});

test("capture-diff: MOVED — tempo map, meter, ppq, a renamed or removed track, a new track inserted before old ones", () => {
  assert.equal(diff(base(), {...base(), tempos: [{tick: 0, usq: 400000}]}).verdict, "MOVED");
  assert.equal(diff(base(), {...base(), tempos: [{tick: 0, usq: 500000}, {tick: 1920, usq: 600000}]}).verdict, "MOVED");
  const m = diff(base(), {...base(), ts: [{tick: 0, num: 3, den: 4}]});
  assert.equal(m.verdict, "MOVED"); assert.match(m.reasons.join(), /meter/);
  assert.equal(diff(base(), {...base(), ppq: 96}).verdict, "MOVED");
  const ren = base(); ren.tracks[1].name = "triangle";
  assert.match(diff(base(), ren).reasons.join(), /renamed/);
  const rm = base(); rm.tracks.pop();
  assert.equal(diff(base(), rm).verdict, "MOVED");
  const ins = base(); ins.tracks.unshift({name: "dpcm", notes: [{t: 0, d: 60, p: 36, v: 100}]});
  assert.equal(diff(base(), ins).verdict, "MOVED", "a track inserted in front renumbers every old one");
});

test("capture-diff: a meta restating what is in force (4/4 late, a repeated tempo) moves nothing", () => {
  assert.equal(diff(base(), {...base(), ts: [{tick: 0, num: 4, den: 4}, {tick: 3840, num: 4, den: 4}]}).verdict, "SAME");
  assert.equal(diff({...base(), ts: [{tick: 3840, num: 4, den: 4}]}, base()).verdict, "SAME");
  assert.equal(diff(base(), {...base(), tempos: [{tick: 0, usq: 500000}, {tick: 1920, usq: 500000}]}).verdict, "SAME");
});

test("capture-diff: MOVED — the loop point, when either side states one", () => {
  assert.equal(diff(base(), base(), {oldLoop: "14.3>2.3", newLoop: "14.3>2.3"}).verdict, "SAME");
  assert.equal(diff(base(), base(), {oldLoop: "14.3>2.3", newLoop: "14.4>2.4"}).verdict, "MOVED");
  assert.equal(diff(base(), base(), {oldLoop: "14.3>2.3", newLoop: null}).verdict, "MOVED");
  assert.equal(diff(base(), base(), {oldLoop: "14.3>2.3", newLoop: "14.4>2.4"}).loopOnly, true, "notes identical: only the loop moved");
  assert.equal(diff(base(), {...base(), ts: [{tick: 0, num: 3, den: 4}]}, {oldLoop: "14.3>2.3", newLoop: "14.4>2.4"}).loopOnly, false, "a meter change moves bars too");
});

test("capture-diff: bars follow the old file's meter, through a meter change", () => {
  const s = readSmf(smf({...base(), ts: [{tick: 0, num: 3, den: 4}, {tick: 1440 * 2, num: 4, den: 4}]}));
  assert.equal(barOf(s, 0), 1);
  assert.equal(barOf(s, 1440), 2);
  assert.equal(barOf(s, 2880), 3);
  assert.equal(barOf(s, 2880 + 1920), 4);
});

test("capture-diff: loop annotations read from v2 JSON and from the legacy text", () => {
  assert.equal(loopOfRollnotes('{"format":"night-roll-annotations","version":2,"notes":[{"at":[14,3],"type":"loop","loop":"2.3"}]}'), "14.3>2.3");
  assert.equal(loopOfRollnotes("# x\n\n[29.3.5]\nloop: 3.3.5\n"), "29.3.5>3.3.5");
  assert.equal(loopOfRollnotes('{"notes":[{"at":[1,1],"type":"key","key":"C"}]}'), null);
});

test("recapture: planned action per verdict and annotations", () => {
  assert.equal(planAction("SAME", 5, null, null), "skip");
  assert.equal(planAction("VELOCITY", 5, null, null), "replace");
  assert.equal(planAction("ADDED-TRACK", 5, null, null), "replace");
  assert.equal(planAction("MOVED", 0, "4.1>2.1", "4.1>2.1"), "keep-old+add-new", "beats moved: always a copy beside the old (Josh, 2026-10-07)");
  assert.equal(planAction("MOVED", 0, "4.1>2.1", "4.2>2.2"), "keep-old+add-new");
  assert.equal(planAction("MOVED", 3, null, null), "keep-old+add-new");
  assert.equal(planAction(null, 0, null, null), "none");
  assert.equal(planAction("MOVED", 18, "17.1>1.1", "17.2>1.2", true), "replace", "loop point alone moved: the notes are identical, the song keeps its own loop annotation — no second song");
  assert.equal(planAction("MOVED", 0, "61.1>1.1", null, true), "replace");
});

test("recapture: annotations exclude the capture's own loop line", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "nr-recap-"));
  const p = path.join(dir, "x.rollnotes.json");
  writeFileSync(p, '{"format":"night-roll-annotations","version":2,"notes":[{"at":[9,4],"type":"loop","loop":"1.4"}]}');
  assert.deepEqual(annotationsOf(p), {count: 0, types: {}, loop: "9.4>1.4"});
  writeFileSync(p, '{"notes":[{"at":[9,4],"type":"loop","loop":"1.4"},{"at":[1,1],"type":"section","label":"A"}]}');
  assert.equal(annotationsOf(p).count, 1);
  assert.equal(annotationsOf(path.join(dir, "none.rollnotes.json")).count, 0);
});

test("recapture: the write allowlist refuses Josh's songs, annotations and anything outside a capture album", () => {
  const R = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  assert.equal(assertWritable(path.join(R, "albums/nes/super-mario-bros-3/track-01.mid")), "albums/nes/super-mario-bros-3/track-01.mid");
  assert.equal(assertWritable(path.join(R, "albums/nes/final-fantasy-i/songs/shop.mid")), "albums/nes/final-fantasy-i/songs/shop.mid");
  assert.ok(assertWritable(path.join(R, "albums/snes/final-fantasy-4/album.json")));
  assert.throws(() => assertWritable(path.join(R, "albums/compositions/x/y.mid")), /Josh's music/);
  assert.throws(() => assertWritable(path.join(R, "albums/starters/y.mid")), /Josh's music/);
  assert.throws(() => assertWritable(path.join(R, "albums/nes/final-fantasy-i/songs/shop.rollnotes.json")), /annotations/);
  assert.throws(() => assertWritable(path.join(R, "albums/manifest.json")), /allowlist/);
  assert.throws(() => assertWritable(path.join(R, "src/main.js")), /allowlist/);
  assert.throws(() => assertWritable(path.join(R, "albums/nes/../../src/x.mid")), /allowlist/);
});

test("recapture: a per-file \"(re-capture)\" copy (rip: <source base>) fetches no file of its own — it plays its source song's rip", () => {
  const a = {chip: "spc", meta: {nsf: {vault: "snes/x/", perFile: true, tracks: {"beach": {n: 1}, "beach-recapture": {n: 1, rip: "beach"}}}}};
  assert.deepEqual(vaultFilesOf(a).map(f => f.vault), ["snes/x/beach.spc"]);
});

test("recapture: a published song with no notes at all (OoT Hyrule Field) is replaced, not kept beside a copy — unless it carries annotations", () => {
  assert.equal(planAction("MOVED", 0, null, "49.1>17.1", false, true), "replace");
  assert.equal(planAction("MOVED", 2, null, "49.1>17.1", false, true), "keep-old+add-new");
});
