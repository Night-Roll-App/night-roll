// The render worker is a module the page fetches at run time: a syntax
// error in it never fails a vm test but kills chip audio for EVERY console
// (2026-09-27: a stray brace shipped to the iPad; PS1 songs fell to synth
// because the inline fallback's parse threw too). So: the file must parse,
// and every chip that renders must parse its bytes inline without throwing.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createApp } from "./harness.mjs";
import { createStreamState, handleStream, handleWant, handleSeek, RUNNERS } from "../tools/chip-worker.mjs";
import { createSpuStream, renderSpu } from "../tools/psx/spu-render.mjs";
import { buildAkaoResult } from "./psx-stream.test.mjs";

test("tools/chip-worker.mjs parses as a module", () => {
  const r = spawnSync(process.execPath, ["--check", "tools/chip-worker.mjs"], {encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr);
});

test("every rendering chip has an inline parse that does not throw (the worker's fallback)", () => {
  const app = createApp();
  const kinds = JSON.parse(app.run(`JSON.stringify(Object.keys(CHIPS).filter(k => CHIPS[k].render))`));
  assert.ok(kinds.includes("psf") && kinds.includes("usf") && kinds.includes("spc"), "renderers: " + kinds.join(",")); // nsf/gbs render by the default apu path
  for (const k of ["psf", "usf"]) {
    const ok = app.run(`(() => { try { const p = CHIPS["${k}"].parse({})(new Uint8Array([1, 2, 3]), {libs: {"x.lib": new Uint8Array(1)}}); return !!p.bytes && !!p.libs; } catch (e) { return "threw: " + e.message; } })()`);
    assert.equal(ok, true, k + " parse: " + ok);
  }
});

test("tap preview: the one-note copy carries the tapped pitch in every field a renderer reads", async () => {
  // Rare's renderer pitches from `key`, EAD's from `semitone`, the MIDI from
  // `midi`: a copy that set only some of them played every tap on a Rare
  // song at the track's first pitch (Josh, 2026-09-28: taps "all sounded
  // exactly the same, like the lowest note"). previewOne now delegates the
  // one-note-copy recipe to tools/note-preview.mjs (M.renderOneNote) — the
  // shared helper tools/sounding.mjs's capture-time probe also uses.
  const { previewOne } = await import("../tools/chip-worker.mjs");
  const { renderOneNote } = await import("../tools/note-preview.mjs");
  let seen = null;
  const t = {ch: 5, inst: 63, drum: false, key: 41, midi: 41, semitone: 20, tick: 96, dur: 48, vel: 90};
  const live = {kind: "usf", rate: 32000,
    M: {channelGroups: () => [{name: "ch 5 inst 63", notes: [t], kit: false}], renderOneNote},
    R: {render: async (M, r) => { seen = r.result.notes[0]; return {"ch 5 inst 63": new Float32Array(4)}; }},
    res: {result: {notes: [t], tempos: [], endTick: 144}, seconds: 1}};
  await previewOne(live, {track: "ch 5 inst 63", midi: 72, vel: 100});
  assert.equal(seen.key, 72); assert.equal(seen.midi, 72); assert.equal(seen.semitone, 51);
  assert.equal(seen.tick, 0);
});

test("tap preview: a shifted track's offset converts the roll's pitch back to the renderer's key", async () => {
  // tools/sounding.mjs shifts a track's roll pitch away from the renderer's
  // own key (e.g. −12: the roll shows the sounding pitch, an octave above
  // what the console plays). A tap sends the ROLL's pitch — previewOne must
  // feed the renderer roll_pitch − offset, or the tap sounds an octave wrong.
  const { previewOne } = await import("../tools/chip-worker.mjs");
  const { renderOneNote } = await import("../tools/note-preview.mjs");
  let seen = null;
  const t = {ch: 0, inst: 0, drum: false, key: 60, midi: 60, semitone: 39, tick: 0, dur: 48, vel: 90};
  const live = {kind: "usf", rate: 32000,
    M: {channelGroups: () => [{name: "ch 0 inst 0", notes: [t], kit: false}], renderOneNote},
    R: {render: async (M, r) => { seen = r.result.notes[0]; return {"ch 0 inst 0": new Float32Array(4)}; }},
    res: {result: {notes: [t], tempos: [], endTick: 48}, seconds: 1}};
  await previewOne(live, {track: "ch 0 inst 0", midi: 72, offset: -12, vel: 100}); // roll shows 72 (sounding); the console's own key is 84
  assert.equal(seen.midi, 84); assert.equal(seen.key, 84); assert.equal(seen.semitone, 63);
});

// FF7 (PS1) "You Can Hear the Cry of the Planet" (Josh's ear, 2026-09-30):
// choir/voice tracks sound right in playback, but TAPPING a note plays the
// WRONG instrument. Several of this song's tracks change program mid-track
// ("ch 1 prog 51,46", "ch 2 prog 50,31", ...) — findTemplateNote always took
// the group's FIRST non-drum note, so a tap anywhere in such a track was
// rendered with the FIRST program forever, however far into the track the
// tapped note actually fell.
test("findTemplateNote: without `at`, the group's first note; with `at` in a later program's span, THAT note", async () => {
  const { findTemplateNote } = await import("../tools/note-preview.mjs");
  const early = {ch: 0, program: 51, drum: false, tick: 0, endTick: 400, key: 60, pitch: 60, vel: 90};
  const late  = {ch: 0, program: 46, drum: false, tick: 500, endTick: 900, key: 64, pitch: 64, vel: 90};
  const M = {channelGroups: () => [{name: "ch 1 prog 51,46", notes: [early, late], ch: 0, kit: false}]};
  const first = findTemplateNote(M, "psf", {}, "ch 1 prog 51,46");
  assert.equal(first.program, 51, "no `at`: unchanged — the group's first note");
  const inSecond = findTemplateNote(M, "psf", {}, "ch 1 prog 51,46", 600); // inside `late`'s [500,900) span
  assert.equal(inSecond.program, 46, "`at` inside the SECOND note's span: its program, not the first");
  const nearFirst = findTemplateNote(M, "psf", {}, "ch 1 prog 51,46", 50); // inside `early`'s span
  assert.equal(nearFirst.program, 51, "`at` inside the first note's own span still finds it (not just nearest-by-distance)");
});

test("seqTickOf: a roll tick converts to the sequence's own tick space — PS1 by seq.ppq, N64 by the fixed TICKS_PER_BEAT", async () => {
  const { seqTickOf } = await import("../tools/note-preview.mjs");
  // PS1: makeMidi writes T(tick) = round(tick * 480 / seq.ppq); inverted here
  assert.equal(seqTickOf("psf", {seq: {ppq: 48}}, 6000, 480), 600, "480-ppq roll tick 6000 at a 48-ppq sequence: tick 600");
  assert.equal(seqTickOf("psf", {seq: {}}, 6000, 480), undefined, "no seq.ppq to convert with: undefined, not a guess");
  assert.equal(seqTickOf("psf", {seq: {ppq: 48}}, undefined, 480), undefined, "no tick given: undefined");
  // N64: toMidi writes tick * 480 / TICKS_PER_BEAT (48, fixed) — same scale, no seq.ppq needed
  assert.equal(seqTickOf("usf", {}, 4800, 480), 480, "480-ppq roll tick 4800 at TICKS_PER_BEAT=48: tick 480");
});

// docs/streamed-render-plan.md step 0 (2026-09-30): FFX "Challenge" reproduced
// the worker's peak running far above what it KEEPS — renderSpu/renderN64
// always hand back a stereo pair, so the mono downmix copy briefly coexists
// with the stereo original. A fake stereo runner stands in for R.render's
// return (no real emulator needed to test the tally math itself).
test("tallyChipRender: stereo kept (plan.mono false) — peak equals kept, both at least the stereo bytes", async () => {
  const { tallyChipRender } = await import("../tools/chip-worker.mjs");
  const n = 4000;
  const l = new Float32Array(n).fill(0.5), r = new Float32Array(n).fill(0.1); // plan.mono=false never even asks chipStaticPan — stays stereo regardless of the pan
  const stereoBytes = l.byteLength + r.byteLength;
  const out = tallyChipRender({track: {l, r}}, ["track"], {mono: false});
  assert.equal(out.peakBytes, stereoBytes, "nothing downmixed: peak is exactly the stereo pair");
  assert.equal(out.keptBytes, stereoBytes, "kept the stereo pair whole");
  assert.ok(out.peakBytes >= stereoBytes);
  assert.ok(out.keptBytes <= out.peakBytes);
  assert.ok(out.pcm.track.l === l && out.pcm.track.r === r, "kept the ORIGINAL arrays, no copy made");
});

test("tallyChipRender: mono-downmix plan — peak counts BOTH the stereo original and the mono copy", async () => {
  const { tallyChipRender } = await import("../tools/chip-worker.mjs");
  const n = 4000;
  const l = new Float32Array(n).fill(0.5), r = new Float32Array(n).fill(0.5); // centred and static: chipStaticPan reports a stable pan, so this group downmixes
  const stereoBytes = l.byteLength + r.byteLength;
  const out = tallyChipRender({track: {l, r}}, ["track"], {mono: true});
  assert.ok(out.pcm.track instanceof Float32Array, "downmixed to one mono buffer");
  const monoBytes = out.pcm.track.byteLength;
  assert.equal(monoBytes, n * 4, "the mono copy is the track's own length");
  assert.equal(out.keptBytes, monoBytes, "kept = only the mono copy");
  assert.equal(out.peakBytes, stereoBytes + monoBytes, "peak = the stereo original (still held) + the mono copy made alongside it");
  assert.ok(out.peakBytes >= stereoBytes, "peak is at least the stereo bytes it was made from");
  assert.ok(out.keptBytes <= out.peakBytes, "kept never exceeds peak");
  assert.ok(out.peakBytes >= 2.9 * out.keptBytes && out.peakBytes <= 3.1 * out.keptBytes,
    "the plan's own hypothesis (docs/streamed-render-plan.md): stereo->mono peak ≈ 3× kept");
});

test("tallyChipRender: a silent group still counts toward peak (R.render already allocated it) but not toward kept", async () => {
  const { tallyChipRender } = await import("../tools/chip-worker.mjs");
  const n = 4000;
  const silent = new Float32Array(n); // all zero: below the noise floor
  const live = new Float32Array(n).fill(0.5);
  const out = tallyChipRender({quiet: silent, loud: live}, ["quiet", "loud"], {mono: false});
  assert.equal(out.peakBytes, silent.byteLength + live.byteLength, "both groups were allocated by the render, silent or not");
  assert.equal(out.keptBytes, live.byteLength, "only the live group is kept/posted");
  assert.ok(!("quiet" in out.pcm), "a silent voice keeps nothing");
});

test("tap preview: previewOne resolves the template's program/instrument for the page's cache key, from the tapped tick", async () => {
  const { previewOne } = await import("../tools/chip-worker.mjs");
  const { renderOneNote, findTemplateNote, seqTickOf } = await import("../tools/note-preview.mjs");
  const early = {ch: 0, program: 51, drum: false, tick: 0, endTick: 400, key: 60, pitch: 60, cents: 0, vel: 90};
  const late  = {ch: 0, program: 46, drum: false, tick: 500, endTick: 900, key: 64, pitch: 64, cents: 0, vel: 90};
  const live = {kind: "psf", rate: 44100,
    M: {channelGroups: () => [{name: "ch 1 prog 51,46", notes: [early, late], ch: 0, kit: false}], renderOneNote, findTemplateNote, seqTickOf},
    R: {render: async () => ({"ch 1 prog 51,46": new Float32Array(4)})},
    res: {result: {notes: [early, late], seq: {ppq: 48}, tempos: [], endTick: 900}, seconds: 1}};
  // roll tick 6000 at song ppq 480, seq.ppq 48 -> sequence tick 600, inside `late`'s span
  const reply = await previewOne(live, {track: "ch 1 prog 51,46", midi: 64, vel: 100, tick: 6000, ppq: 480});
  assert.ok(reply.pcm, "still renders audio");
  assert.equal(reply.prog, 46, "resolves the SECOND program from the tapped tick, not the first");
  const noTick = await previewOne(live, {track: "ch 1 prog 51,46", midi: 64, vel: 100}); // no tick: e.g. a piano-strip key press
  assert.equal(noTick.prog, undefined, "no tick given: no program resolved either (today's behavior)");
});

// ---- streamed protocol (docs/streamed-render-plan.md step 2) -------------
// A fake "fakestream" chip: parse/run are pure passthroughs (the test's
// `bytes` IS the fixture: {tracks, frames, sampleRate}), so no real module
// loading ever happens — handleStream's own loadM() sees empty files/shared/
// own lists and returns M={}, which the fake runner's `stream` hook doesn't
// touch. The signal is a pure function of absolute frame position (a sine
// per track, scaled by track index) so continuity (prepend-the-kept-tail)
// and a fresh seek+render always agree exactly, and the LAST track is wired
// permanently silent for the omission test.
function makeFakeStream({tracks, frames, sampleRate}) {
  let cursor = 0;
  const valueAt = (ti, f) => ti === tracks.length - 1 ? 0 : (0.2 + 0.05 * ti) * Math.sin((f + ti * 37) * 0.013 * (ti + 1));
  function render(n) {
    const end = Math.min(cursor + n, frames);
    const out = {};
    for (let ti = 0; ti < tracks.length; ti++) {
      const l = new Float32Array(n), r = new Float32Array(n);
      for (let i = 0; i < end - cursor; i++) { const v = valueAt(ti, cursor + i); l[i] = v; r[i] = v * 0.9; }
      out[tracks[ti]] = {l, r};
    }
    cursor = end;
    return out;
  }
  return {
    sampleRate, seconds: frames / sampleRate, frames, tracks: tracks.slice(), render,
    seek(f) { cursor = Math.max(0, Math.min(f, frames)); },
    snapshot() { return {cursor}; },
    restore(s) { cursor = s.cursor; },
  };
}
RUNNERS.fakestream = {
  parse: () => bytes => bytes,
  run: async (M, parsed) => parsed,
  lead: () => 0,
  stream: (M, res, o) => makeFakeStream({tracks: res.tracks, frames: res.frames, sampleRate: o.sampleRate || res.sampleRate}),
};
RUNNERS.fakenostream = { // same shape, deliberately no `stream` hook
  parse: () => bytes => bytes,
  run: async (M, parsed) => parsed,
  lead: () => 0,
};
const FAKE_MSG = (id, over = {}) => Object.assign({
  id, kind: "fakestream", files: [], shared: [], own: [], v: "",
  bytes: {tracks: ["a", "b", "c"], frames: 2000, sampleRate: 8000}, libs: null,
  secs: 2000 / 8000, rate: 8000, chunkFrames: 256, overlap: 32,
}, over);

test("stream protocol: overlap windows have complementary ramps — adjacent chunks summed over the overlap == the continuous render (within 1e-6)", async () => {
  const bytes = {tracks: ["a", "b", "c"], frames: 2000, sampleRate: 8000};
  const continuous = makeFakeStream(bytes).render(bytes.frames); // one shot, the oracle

  const streams = createStreamState();
  let ready; const chunks = [];
  const post = m => { if (m.ready) ready = m.ready; if (m.chunk) chunks.push(m.chunk); };
  await handleStream(streams, FAKE_MSG("c1", {bytes}), post);
  const total = Math.ceil(ready.frames / 256);
  await handleWant(streams, {id: "c1", gen: 1, from: 0, to: total - 1}, post);
  assert.equal(chunks.length, total, "one chunk per index, in order");

  const recon = {}; for (const name of ready.tracks) recon[name] = {l: new Float32Array(ready.frames), r: new Float32Array(ready.frames)};
  for (const c of chunks) {
    const S = c.idx * 256;
    for (const name of Object.keys(c.tracks)) {
      const t = c.tracks[name];
      for (let i = 0; i < c.frames; i++) { recon[name].l[S + i] += t.l[i]; recon[name].r[S + i] += t.r[i]; }
    }
  }
  for (const name of ready.tracks) {
    for (let i = 0; i < ready.frames; i++) {
      assert.ok(Math.abs(recon[name].l[i] - continuous[name].l[i]) < 1e-6, `${name}.l[${i}]`);
      assert.ok(Math.abs(recon[name].r[i] - continuous[name].r[i]) < 1e-6, `${name}.r[${i}]`);
    }
  }
});

test("stream protocol: out-of-order want triggers seek and still matches the sequential result", async () => {
  const msg = FAKE_MSG("seq");
  const seqStreams = createStreamState(); const seqChunks = [];
  await handleStream(seqStreams, msg, () => {});
  const total = Math.ceil(msg.bytes.frames / msg.chunkFrames);
  await handleWant(seqStreams, {id: "seq", gen: 1, from: 0, to: total - 1}, m => { if (m.chunk) seqChunks.push(m.chunk); });
  const seqChunk5 = seqChunks.find(c => c.idx === 5);

  const oooStreams = createStreamState(); let oooChunk5;
  await handleStream(oooStreams, FAKE_MSG("ooo"), () => {});
  await handleWant(oooStreams, {id: "ooo", gen: 1, from: 5, to: 5}, m => { if (m.chunk) oooChunk5 = m.chunk; }); // first want ever, straight to idx 5: must seek

  assert.equal(oooChunk5.frames, seqChunk5.frames);
  for (const name of Object.keys(seqChunk5.tracks)) {
    assert.deepEqual(Array.from(oooChunk5.tracks[name].l), Array.from(seqChunk5.tracks[name].l), name + ".l");
    assert.deepEqual(Array.from(oooChunk5.tracks[name].r), Array.from(seqChunk5.tracks[name].r), name + ".r");
  }

  // forward a bit (builds a kept tail), then jump BACKWARD — also not "next"
  const backStreams = createStreamState(); const backChunks = [];
  await handleStream(backStreams, FAKE_MSG("back"), () => {});
  await handleWant(backStreams, {id: "back", gen: 1, from: 2, to: 4}, m => { if (m.chunk) backChunks.push(m.chunk); });
  await handleWant(backStreams, {id: "back", gen: 1, from: 0, to: 0}, m => { if (m.chunk) backChunks.push(m.chunk); });
  const backChunk0 = backChunks.find(c => c.idx === 0);
  const seqChunk0 = seqChunks.find(c => c.idx === 0);
  assert.deepEqual(Array.from(backChunk0.tracks.a.l), Array.from(seqChunk0.tracks.a.l), "backward jump matches too");
});

test("stream protocol: a track that's silent in every window is omitted from every chunk", async () => {
  const msg = FAKE_MSG("sil");
  const streams = createStreamState(); const chunks = [];
  await handleStream(streams, msg, () => {});
  const total = Math.ceil(msg.bytes.frames / msg.chunkFrames);
  await handleWant(streams, {id: "sil", gen: 1, from: 0, to: total - 1}, m => { if (m.chunk) chunks.push(m.chunk); });
  assert.equal(chunks.length, total);
  for (const c of chunks) {
    assert.ok("a" in c.tracks && "b" in c.tracks, "live tracks present, idx " + c.idx);
    assert.ok(!("c" in c.tracks), "silent track omitted, idx " + c.idx);
  }
});

test("stream protocol: a stale gen is dropped — a seek mid-want cancels the rest of that want", async () => {
  const msg = FAKE_MSG("gen", {bytes: {tracks: ["a", "b"], frames: 20000, sampleRate: 8000}});
  const streams = createStreamState(); const chunks = [];
  await handleStream(streams, msg, () => {});
  const wantPromise = handleWant(streams, {id: "gen", gen: 1, from: 0, to: 50}, m => { if (m.chunk) chunks.push(m.chunk); });
  // handleWant runs synchronously up to its first yield (after posting chunk 0),
  // then suspends and returns a pending promise — so this runs before chunk 1.
  handleSeek(streams, {id: "gen", gen: 2, idx: 10}, () => {});
  await wantPromise;
  assert.equal(chunks.length, 1, "only the chunk posted before the seek arrived");
  assert.equal(chunks[0].idx, 0);
  assert.equal(chunks[0].gen, 1);
});

test("stream protocol: a preview queued during a long want is answered before the want finishes", async () => {
  const msg = FAKE_MSG("prev", {bytes: {tracks: ["a", "b"], frames: 100000, sampleRate: 8000}, chunkFrames: 2000, overlap: 100});
  const streams = createStreamState();
  const events = [];
  await handleStream(streams, msg, () => {});
  const total = Math.ceil(msg.bytes.frames / msg.chunkFrames); // many chunks -> many yields
  const wantPromise = handleWant(streams, {id: "prev", gen: 1, from: 0, to: total - 1}, m => { if (m.chunk) events.push("chunk:" + m.chunk.idx); });
  const previewPromise = (async () => { // a "preview" competing for the same event loop, one yield of its own
    await new Promise(resolve => setTimeout(resolve, 0));
    events.push("preview-done");
  })();
  await Promise.all([wantPromise, previewPromise]);
  const previewPos = events.indexOf("preview-done");
  assert.ok(previewPos >= 0, "preview resolved at all");
  assert.ok(previewPos < events.length - 1, "preview resolved before the want's very last chunk, not stuck behind the whole want");
});

test("stream protocol: a kind with no `stream` hook, or an unknown kind, replies the fallback error", async () => {
  const replies = [];
  const post = m => replies.push(m);
  await handleStream(createStreamState(), FAKE_MSG("nostream", {kind: "fakenostream"}), post);
  await handleStream(createStreamState(), FAKE_MSG("unknown", {kind: "doesnotexist"}), post);
  assert.deepEqual(replies[0], {stream: {id: "nostream", error: "no stream for fakenostream"}});
  assert.deepEqual(replies[1], {stream: {id: "unknown", error: "no worker runner for doesnotexist"}});
});

test("stream protocol: the REAL createSpuStream (PS1 fixture) assembled from windows == renderSpu's own output", async () => {
  const {result, opts} = buildAkaoResult();
  const oracle = await renderSpu(result, opts);
  RUNNERS.realpsx = {
    parse: () => () => ({}),
    run: async () => ({result, ram: opts.ram, table: opts.table, bank: opts.bank, seconds: oracle.seconds}),
    lead: () => 0,
    stream: (M, res, o) => createSpuStream(res.result, {sampleRate: o.sampleRate, ram: res.ram, table: res.table, bank: res.bank, keepSeconds: res.seconds}),
  };
  const streams = createStreamState();
  let ready; const chunks = [];
  const post = m => { if (m.ready) ready = m.ready; if (m.chunk) chunks.push(m.chunk); };
  const C = 4096, O = 256;
  await handleStream(streams, {id: "r1", kind: "realpsx", files: [], shared: [], own: [], v: "", bytes: null, libs: null, secs: oracle.seconds, rate: 44100, chunkFrames: C, overlap: O}, post);
  assert.ok(ready, "the real PS1 stream reports ready");
  const total = Math.ceil(ready.frames / C);
  await handleWant(streams, {id: "r1", gen: 1, from: 0, to: total - 1}, post);

  const recon = {}; for (const name of ready.tracks) recon[name] = {l: new Float32Array(ready.frames), r: new Float32Array(ready.frames)};
  for (const c of chunks) {
    const S = c.idx * C;
    for (const name of Object.keys(c.tracks)) {
      const t = c.tracks[name];
      for (let i = 0; i < c.frames; i++) { recon[name].l[S + i] += t.l[i]; recon[name].r[S + i] += t.r[i]; }
    }
  }
  for (const name of ready.tracks) {
    for (let i = 0; i < ready.frames; i++) {
      assert.ok(Math.abs(recon[name].l[i] - oracle[name].l[i]) < 1e-6, `${name}.l[${i}]`);
      assert.ok(Math.abs(recon[name].r[i] - oracle[name].r[i]) < 1e-6, `${name}.r[${i}]`);
    }
  }
});
