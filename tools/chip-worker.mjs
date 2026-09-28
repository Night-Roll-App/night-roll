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
      const akaos = M.scanAKAO(ram);
      if (!akaos.length) throw new Error("no AKAO music data (SEQ/VAB playback is not rendered yet)");
      const own = ranges.find(r => r.name === "song.minipsf");
      const inOwn = own ? akaos.filter(o => o >= (own.start & 0x1FFFFF) && o < (own.start & 0x1FFFFF) + own.size) : [];
      const table = M.findInstrDat(ram);
      const bank = table ? M.findSampleBank(ram, table) : null;
      if (!table || !bank) throw new Error("no instrument table or sample bank in this rip");
      const result = M.akaoNotes(M.parseAKAO(ram, (inOwn.length ? inOwn : akaos)[0]), {instr: {ram, offset: table.offset}});
      prog(1);
      return {result, ram, table, bank, seconds: secs};
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
export async function previewOne(live, p) { // p: {track, midi, vel, ticks, seconds} → Float32Array | {l, r} | null
  if (!live || !live.res || !live.res.result || !live.res.result.notes) return null;
  const {M, R, res, rate, kind} = live;
  const inner = res.result;
  const groups = kind === "psf" ? M.channelGroups(inner) : M.channelGroups(inner, {tsNum: 4, tsDen: 4});
  const g = groups.find(x => x.name === p.track);
  if (!g || !g.notes.length) return null;
  const t = g.notes.find(x => !x.drum) || g.notes[0];
  if (t.drum) return null; // a kit's keys are its own map: the synth's drums serve the tap
  const ticks = Math.max(1, Math.round(p.ticks || Math.min(48, kind === "psf" ? (t.endTick - t.tick) : t.dur)));
  const note = kind === "psf"
    ? {...t, tick: 0, endTick: ticks, key: p.midi, pitch: p.midi, cents: 0, vel: p.vel || 100, gain: undefined, slide: undefined, unrolled: false}
    : {...t, tick: 0, dur: ticks, midi: p.midi, semitone: p.midi - 21, vel: p.vel || 100, slide: undefined, gain: undefined, bend: 0};
  const one = {...inner, notes: [note], endTick: ticks, loop: null, ducked: []};
  const r = await R.render(M, {...res, result: one, seconds: p.seconds || 1.5}, {sampleRate: rate, onProgress: () => {}});
  return r[p.track] || null;
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
