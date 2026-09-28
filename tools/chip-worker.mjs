// tools/chip-worker.mjs — the console render OFF the main thread (2026-09-27).
// A song's chip audio (NES / Game Boy / SNES) used to be emulated and
// rendered on the page's thread in 35 ms slices: the first Play after
// opening a song stuttered, the Fall view starved the scheduler, and on the
// iPad a long render could take the audio session down with it. This
// module worker does the same work with the same modules (imported relative
// to tools/, with the page's ?v buster) and posts back Float32 PCM per
// voice as transferables. The page keeps the old inline path as a fallback
// for browsers without module workers.
//
//   postMessage({id, kind, files, shared, own, v, bytes, libs?, n, secs, rate})   libs: {name: bytes} for a set's shared library (PS1)
//   ← {id, progress}            0..1 while emulating (0–0.3) and rendering (0.3–1)
//   ← {id, done: {pcm: {name: Float32Array}, sampleRate, leadSec}}
//   ← {id, error: "message"}
// Stopping a render = terminate() from the page; nothing to unwind here.

const RUNNERS = { // parse / emulate / render per chip — the page's CHIPS table, minus the app
  nsf: {
    parse: M => b => M.parseNSF(b),
    run: (M, parsed, n, secs, prog) => M.runNSFAsync(parsed, n, secs, prog),
    lead: (M, res) => { const ev = M.reconstruct(res.apuLog, res.frames, res.frameSec); return (ev.length ? Math.min(...ev.map(e => e.startFrame)) : 0) * res.frameSec; },
    render: (M, res, o) => M.renderApu(res.apuLog, res.frames, res.frameSec, o),
    channels: ["pulse1", "pulse2", "triangle", "noise"],
  },
  gbs: {
    parse: M => b => M.parseGBS(b),
    run: (M, parsed, n, secs, prog) => M.runGBSAsync(parsed, n, secs, prog),
    lead: (M, res) => { const ev = M.reconstruct(res.apuLog, res.frames, res.frameSec); return (ev.length ? Math.min(...ev.map(e => e.startFrame)) : 0) * res.frameSec; },
    render: (M, res, o) => M.renderApu(res.apuLog, res.frames, res.frameSec, o),
    channels: ["pulse1", "pulse2", "wave", "noise"],
  },
  psf: { // PlayStation: the driver's samples through spu-render.mjs; the set's lib arrives in `libs`
    parse: M => (b, libs) => ({bytes: b, libs: libs || {}}),
    run: async (M, parsed, n, secs, prog) => {
      const inflate = typeof DecompressionStream !== "undefined" ? async b => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer()) : null;
      const chain = await M.loadPSFChain(parsed.bytes, name => { const x = parsed.libs[name.toLowerCase()]; if (!x) throw new Error("missing library " + name); return x; }, {name: "song.minipsf", inflate});
      const {ram, ranges} = M.assembleRam(chain);
      prog(0.5);
      const song = M.psfSong(ram, ranges, "song.minipsf"); // tools/psx/capture.mjs: SEQ/VAB or AKAO, the song the mini names
      if (!song.renderable) throw new Error(song.why);
      prog(1);
      return {result: song.result, ram, table: song.table || null, bank: song.bank || null, seconds: secs};
    },
    lead: () => 0,
    render: (M, res, o) => M.renderSpu(res.result, {sampleRate: o.sampleRate, onProgress: o.onProgress, ram: res.ram, table: res.table, bank: res.bank, keepSeconds: res.seconds}),
    channels: null, // per song: every Float32Array the render returns
  },
  usf: { // Nintendo 64: the game's sound bank through n64/render.mjs; the set's lib arrives in `libs`
    parse: M => (b, libs) => ({bytes: b, libs: libs || {}}),
    run: async (M, parsed, n, secs, prog) => {
      const files = [{name: "song.miniusf", bytes: parsed.bytes}];
      for (const [name, bytes] of Object.entries(parsed.libs)) files.push({name, bytes});
      const set = M.loadUSF(files);
      prog(0.3);
      const {seq, res} = M.sequenceOfSet(set);
      prog(1);
      return {result: res, set, banks: seq.banks, seconds: secs};
    },
    lead: () => 0,
    render: (M, res, o) => M.renderN64(res.result, {set: res.set, banks: res.banks, sampleRate: o.sampleRate, onProgress: o.onProgress, keepSeconds: res.seconds, meter: {tsNum: 4, tsDen: 4}}),
    channels: null,
  },
  spc: {
    parse: M => b => M.parseSPC(b),
    run: async (M, parsed, n, secs, prog) => ({cap: await M.runSPCAsync(parsed, secs, prog)}),
    lead: (M, res) => { const r = M.reconstruct(res.cap, {}); return (r.events.length ? Math.min(...r.events.map(e => e.startFrame)) : 0) * r.frameSec; },
    render: (M, res, o) => M.renderApu(res.cap, o),
    channels: ["voice0", "voice1", "voice2", "voice3", "voice4", "voice5", "voice6", "voice7"],
  },
};

// After a render the worker stays alive with the set loaded: a tap on a note
// asks for that ONE note through its track's instrument (Josh, 2026-09-27:
// "when I press notes on Dire Dire Docks it sounds them in our MIDI
// instrument sounds"). Sequence chips only (PS1, N64): a one-note copy of
// the parsed result, rendered by the same path; NES/GB/SNES renders come
// from a register log and have no note to re-render, so the page keeps the
// synth for those.
let live = null; // {id, kind, M, R, res, rate} of the last successful render
// p: {track, midi, vel, ticks, seconds, offset} → Float32Array | {l, r} | null.
// The one-note-copy-through-the-console's-own-renderer recipe lives in
// tools/note-preview.mjs (M.renderOneNote), shared with tools/sounding.mjs's
// capture-time pitch probe (CHIPS.psf/usf.capture in index.html) — both load
// it the way every chip helper reaches this worker, listed in CHIPS[kind].shared.
// offset: the track's sounding-pitch shift (tools/sounding.mjs; a captured
// track's roll pitch = the renderer's own key + offset), so `p.midi` — the
// ROLL's pitch — converts back to the key the renderer needs.
export async function previewOne(live, p) {
  if (!live || !live.res || !live.res.result || !live.res.result.notes) return null;
  const {M, R, res, rate, kind} = live;
  if (!M.renderOneNote) return null; // an older cached module set without sounding.mjs/note-preview.mjs: no preview rather than a crash
  const key = (p.midi || 0) - (p.offset || 0);
  const renderFn = (one, o) => R.render(M, {...res, result: one, seconds: o.seconds}, {sampleRate: rate, onProgress: o.onProgress});
  return M.renderOneNote(M, kind, res.result, p.track, renderFn, {key, vel: p.vel || 100, ticks: p.ticks, seconds: p.seconds || 1.5});
}
if (typeof self !== "undefined") self.onmessage = async e => {
  if (e.data && e.data.preview) { // one note through the game's instrument, from the last render's set
    const q = e.data.preview;
    try {
      const x = live && live.id === q.id ? await previewOne(live, q) : null;
      const transfer = x ? (x.l ? [x.l.buffer, x.r.buffer] : [x.buffer]) : [];
      self.postMessage({preview: {req: q.req, pcm: x, sampleRate: live ? live.rate : 0}}, transfer);
    } catch (err) { self.postMessage({preview: {req: q.req, pcm: null, error: String(err && err.message || err)}}); }
    return;
  }
  const {id, kind, files, shared, own, v, bytes, libs, n, secs, rate} = e.data;
  const post = m => self.postMessage(Object.assign({id}, m));
  try {
    const R = RUNNERS[kind];
    if (!R) throw new Error("no worker runner for " + kind);
    const parts = await Promise.all(files.map(f => f.startsWith("?") ? import("./" + f.slice(1) + ".mjs" + v).catch(() => ({})) : import("./" + f + ".mjs" + v)));
    const sh = await Promise.all(shared.map(f => import("./" + f + ".mjs" + v)));
    const M = Object.assign({}, ...parts, ...sh);
    for (const k of own) for (const p of parts) if (p[k]) M[k] = p[k];
    if (!M.renderApu && !M.renderSpu && !M.renderN64) throw new Error("no renderer for " + kind);
    const parsed = R.parse(M)(bytes, libs);
    const res = await R.run(M, parsed, n, secs, p => post({progress: p * 0.3}));
    const leadSec = R.lead(M, res);
    const r = await R.render(M, res, {sampleRate: rate, onProgress: p => post({progress: 0.3 + p * 0.7})});
    const pcm = {}, transfer = [];
    const isPcm = x => x instanceof Float32Array || !!(x && x.l instanceof Float32Array && x.r instanceof Float32Array); // mono, or a stereo pair from a renderer that pans
    const names = R.channels || Object.keys(r).filter(k => isPcm(r[k]));
    for (const name of names) {
      const x = r[name]; if (!x) continue;
      const parts = x.l ? [x.l, x.r] : [x];
      let live = false; for (const a of parts) { for (let i = 0; i < a.length && !live; i += 13) if (Math.abs(a[i]) > 1e-4) live = true; }
      if (!live) continue;
      pcm[name] = x; for (const a of parts) transfer.push(a.buffer);
    }
    live = (kind === "psf" || kind === "usf") ? {id, kind, M, R, res, rate} : null; // kept for note previews
    post({done: {pcm, sampleRate: r.sampleRate, leadSec}}, transfer);
  } catch (err) { post({error: String(err && err.message || err)}); }
};
