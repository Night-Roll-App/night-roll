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
//   postMessage({id, kind, files, shared, own, v, bytes, n, secs, rate})
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
  spc: {
    parse: M => b => M.parseSPC(b),
    run: async (M, parsed, n, secs, prog) => ({cap: await M.runSPCAsync(parsed, secs, prog)}),
    lead: (M, res) => { const r = M.reconstruct(res.cap, {}); return (r.events.length ? Math.min(...r.events.map(e => e.startFrame)) : 0) * r.frameSec; },
    render: (M, res, o) => M.renderApu(res.cap, o),
    channels: ["voice0", "voice1", "voice2", "voice3", "voice4", "voice5", "voice6", "voice7"],
  },
};

self.onmessage = async e => {
  const {id, kind, files, shared, own, v, bytes, n, secs, rate} = e.data;
  const post = m => self.postMessage(Object.assign({id}, m));
  try {
    const R = RUNNERS[kind];
    if (!R) throw new Error("no worker runner for " + kind);
    const parts = await Promise.all(files.map(f => f.startsWith("?") ? import("./" + f.slice(1) + ".mjs" + v).catch(() => ({})) : import("./" + f + ".mjs" + v)));
    const sh = await Promise.all(shared.map(f => import("./" + f + ".mjs" + v)));
    const M = Object.assign({}, ...parts, ...sh);
    for (const k of own) for (const p of parts) if (p[k]) M[k] = p[k];
    if (!M.renderApu) throw new Error("no renderer for " + kind);
    const parsed = R.parse(M)(bytes);
    const res = await R.run(M, parsed, n, secs, p => post({progress: p * 0.3}));
    const leadSec = R.lead(M, res);
    const r = await R.render(M, res, {sampleRate: rate, onProgress: p => post({progress: 0.3 + p * 0.7})});
    const pcm = {}, transfer = [];
    for (const name of R.channels) { const a = r[name]; if (!a) continue; let live = false; for (let i = 0; i < a.length; i += 13) if (Math.abs(a[i]) > 1e-4) { live = true; break; } if (!live) continue; pcm[name] = a; transfer.push(a.buffer); }
    post({done: {pcm, sampleRate: r.sampleRate, leadSec}}, transfer);
  } catch (err) { post({error: String(err && err.message || err)}); }
};
