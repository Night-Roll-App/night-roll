// SNES note preview without a render (tools/spc/preview.mjs; plan step 5):
// the worker's table of per-note registers + the song's RAM, played through
// the S-DSP renderer, must sound like the same note in the song's own render:
// pitch within 3 cents, envelope correlation >= 0.99 (tools/instruments/verify.mjs's bar).
import test from "node:test";
import assert from "node:assert/strict";
import { makeTestSPC } from "../tools/spc/make-test-spc.mjs";
import { parseSPC, runSPC } from "../tools/spc/spc.mjs";
import { reconstruct } from "../tools/spc/notes.mjs";
import { renderApu } from "../tools/spc/apu-render.mjs";
import { spcPreviewTable, previewSpcNote, spcTemplateNote } from "../tools/spc/preview.mjs";
import { rmsFrames, correlation } from "../tools/instruments/verify.mjs";
import { previewOne } from "../tools/chip-worker.mjs";

const RATE = 32000;
// frequency from interpolated rising zero crossings over [a, b) samples
function freqOf(x, a, b) {
  const ups = [];
  for (let i = Math.max(1, a); i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) ups.push(i - 1 + (-x[i - 1]) / (x[i] - x[i - 1]));
  return (ups.length - 1) * RATE / (ups[ups.length - 1] - ups[0]);
}
const cents = (a, b) => Math.abs(1200 * Math.log2(a / b));

// a song whose notes decay (SR rate 12 instead of 0), so the envelope has a shape to compare
async function fixture() {
  const cap = runSPC(parseSPC(makeTestSPC()), 2.2);
  for (const w of cap.dspLog) if (w.addr === 0x06) w.value = 0xEC;
  const { events } = reconstruct(cap, {});
  const full = await renderApu(cap, {sampleRate: RATE, stereo: true});
  return {cap, events, full, table: spcPreviewTable(cap, events)};
}

test("SNES preview: pitch within 3 cents and envelope correlation >= 0.99 against the song's own render", async () => {
  const { events, full, table } = await fixture();
  assert.ok(events.length >= 4);
  assert.equal(table.notes.length, events.length);
  for (const e of events.slice(0, 4)) {
    const songSec = e.startSample / RATE - table.lead;
    const r = await previewSpcNote(renderApu, table, {track: "voice0", midi: e.midi, offset: 0, songSec});
    assert.ok(r && r.pcm.l.length > 3000, "a preview came back");
    const a = e.startSample, len = Math.min(r.pcm.l.length, 12000);
    const win = full.voice0.l.subarray(a, a + len), pre = r.pcm.l.subarray(0, len);
    const f0 = freqOf(full.voice0.l, a + 800, a + 8000), f1 = freqOf(r.pcm.l, 800, 8000);
    assert.ok(cents(f0, f1) < 3, `note at ${e.midi}: ${f1.toFixed(2)} Hz vs the render's ${f0.toFixed(2)} Hz`);
    const corr = correlation(rmsFrames(win, RATE), rmsFrames(pre, RATE));
    assert.ok(corr >= 0.99, `note at ${e.midi}: envelope correlation ${corr.toFixed(4)}`);
    assert.ok(rmsFrames(pre, RATE)[0] >= 0 && Math.max(...rmsFrames(pre, RATE)) > 0.05, "audible");
  }
});

test("SNES preview: another pitch of the instrument scales PITCH by the interval; a kit name needs kit notes", async () => {
  const { events, table } = await fixture();
  const e = events[0];
  const songSec = e.startSample / RATE - table.lead;
  const same = await previewSpcNote(renderApu, table, {track: "voice0", midi: e.midi, offset: 0, songSec});
  const up = await previewSpcNote(renderApu, table, {track: "voice0", midi: e.midi + 12, offset: 0, songSec});
  assert.ok(cents(freqOf(up.pcm.l, 800, 6000), 2 * freqOf(same.pcm.l, 800, 6000)) < 3, "an octave up doubles the frequency");
  const off = await previewSpcNote(renderApu, table, {track: "voice0", midi: e.midi + 5, offset: 5, songSec}); // the roll's offset is the roll's, not the sample's
  assert.ok(cents(freqOf(off.pcm.l, 800, 6000), freqOf(same.pcm.l, 800, 6000)) < 3);
  assert.equal(await previewSpcNote(renderApu, table, {track: "voice0 kit", midi: 38, offset: 0, songSec}), null, "no kit hits on this voice");
  assert.equal(await previewSpcNote(renderApu, table, {track: "drums", midi: 38, offset: 0, songSec}), null, "not a voice track");
  assert.equal(spcTemplateNote(table, "voice0", e.midi, songSec), table.notes.find(n => n.start === e.startSample));
});

test("SNES preview: the worker's previewOne answers from the table, and tags the reply by instrument+envelope", async () => {
  const { events, table } = await fixture();
  const live = {kind: "spc", id: "x", rate: RATE, res: null, spc: table, M: {previewSpcNote, renderApu}};
  const e = events[1];
  const x = await previewOne(live, {track: "voice0", midi: e.midi, offset: 0, songSec: e.startSample / RATE - table.lead});
  assert.ok(x.pcm.l instanceof Float32Array && x.pcm.l.length > 3000);
  assert.match(x.prog, /^\d+:\d+:\d+:\d+$/);
  assert.equal(await previewOne({...live, M: {}}, {track: "voice0", midi: 60}), null, "an older cached module set: no preview, no crash");
});
