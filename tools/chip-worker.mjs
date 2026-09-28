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

self.onmessage = async e => {
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
    const names = R.channels || Object.keys(r).filter(k => r[k] instanceof Float32Array);
    for (const name of names) { const a = r[name]; if (!a) continue; let live = false; for (let i = 0; i < a.length; i += 13) if (Math.abs(a[i]) > 1e-4) { live = true; break; } if (!live) continue; pcm[name] = a; transfer.push(a.buffer); }
    post({done: {pcm, sampleRate: r.sampleRate, leadSec}}, transfer);
  } catch (err) { post({error: String(err && err.message || err)}); }
};
