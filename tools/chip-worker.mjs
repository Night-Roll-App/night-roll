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
//   postMessage({id, kind, files, shared, own, v, bytes, libs?, n, secs, rate, budget, title})
//     libs: {name: bytes} for a set's shared library (PS1); budget: the memory
//     budget in bytes (chipRenderBudget, index.html — the page knows EDITION,
//     the worker doesn't); title: the song name, for the one-line debug note
//   ← {id, progress}            0..1 while emulating (0–0.3) and rendering (0.3–1)
//   ← {id, debug: "message"}    the budget plan changed the render (rate/mono) — logDebug it on the page
//   ← {id, done: {pcm: {name: Float32Array}, sampleRate, leadSec, pan: {name: -1..1}}}
//   ← {id, error: "message"}
// Stopping a render = terminate() from the page; nothing to unwind here.
//
// Memory budget (2026-09-30; FFX "Challenge" reproduced on the iPad — PS2's
// own driver, 30 tracks, 163 s, stereo 48 kHz = 1.88 GB of Float32, killed
// the WKWebView content process). planChipRender/chipEstimateTracks/
// chipStaticPan/chipDownmixStatic mirror index.html's copy exactly (a worker
// can't import from the page's inline script) — keep the two in step.
const CHIP_RATE_STEPS = [48000, 32000, 24000, 22050]; // resampled by the renderer's own sampleRate option; 22050 is the floor
function planChipRender({tracks, seconds, sampleRate, channels, budget}) {
  const bytesAt = (rate, ch) => Math.ceil(tracks * ch * rate * seconds * 4);
  let rate = sampleRate, mono = false, ch = channels;
  let bytes = bytesAt(rate, ch);
  if (bytes <= budget) return {rate, mono, channels: ch, bytes};
  if (ch > 1) { mono = true; ch = 1; bytes = bytesAt(rate, ch); if (bytes <= budget) return {rate, mono, channels: ch, bytes}; }
  for (const step of CHIP_RATE_STEPS) {
    if (step >= rate) continue;
    rate = step; bytes = bytesAt(rate, ch);
    if (bytes <= budget) return {rate, mono, channels: ch, bytes};
  }
  return {rate, mono, channels: ch, bytes, refuse: true};
}
function chipEstimateTracksW(R, res) {
  const fixed = R.channels;
  if (fixed && fixed.length) return fixed.length;
  const notes = res && res.result && res.result.notes;
  if (Array.isArray(notes) && notes.length) return Math.max(1, new Set(notes.map(n => n.ch)).size);
  return 8;
}
function chipStaticPan(l, r) {
  const n = Math.min(l.length, r.length);
  if (!n) return 0;
  const win = 512, stride = Math.max(1, Math.floor(n / (win * 4000)));
  const pans = [];
  for (let start = 0; start + win <= n; start += win * stride) {
    let el = 0, er = 0;
    for (let i = start; i < start + win; i++) { el += l[i] * l[i]; er += r[i] * r[i]; }
    if (el < 1e-9 && er < 1e-9) continue;
    pans.push(Math.max(-1, Math.min(1, Math.atan2(Math.sqrt(er), Math.sqrt(el)) * 4 / Math.PI - 1)));
  }
  if (pans.length < 2) return 0;
  const lo = Math.min(...pans), hi = Math.max(...pans);
  return hi - lo > 0.08 ? null : pans.reduce((a, b) => a + b, 0) / pans.length;
}
function chipDownmixStatic(l, r, pan) {
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  const useL = gl >= gr, src = useL ? l : r, g = useL ? gl : gr, inv = g > 1e-6 ? 1 / g : 0;
  const mono = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) mono[i] = src[i] * inv;
  return mono;
}

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
    stereo: true, // renderSpu always returns {l, r} per track (tools/psx/spu-render.mjs)
  },
  psf2: { // PlayStation 2: Sony's SQ/HD/BD driver through the SAME spu-render.mjs as PS1 (an HD/BD bank reshapes into
          // a VAB-shaped bank, tools/ps2/hd.mjs toBank() — no PS2-specific render code); the set's lib arrives in `libs`
    parse: M => (b, libs) => ({bytes: b, libs: libs || {}}),
    run: async (M, parsed, n, secs, prog) => {
      const inflate = typeof DecompressionStream !== "undefined" ? async b => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer()) : null;
      const chain = await M.loadPSF2Chain(parsed.bytes, name => { const x = parsed.libs[name.toLowerCase()]; if (!x) throw new Error("missing library " + name); return x; }, {name: "song.minipsf2", inflate});
      const files = M.mergePSF2(chain);
      const mini = chain.find(s => s.name === "song.minipsf2");
      prog(0.3);
      const song = await M.ps2Song(files, mini, {inflate});
      if (song.kind === "bgm-unimplemented") throw new Error("Square's PS2 sequence format (BGM/WD) is not supported yet.");
      if (!song.renderable) throw new Error(song.why || "no HD/BD bank in this image");
      prog(1);
      return {result: song.result, seconds: secs};
    },
    lead: () => 0,
    render: (M, res, o) => M.renderSpu(res.result, {sampleRate: o.sampleRate, onProgress: o.onProgress, keepSeconds: res.seconds}),
    channels: null, // per song: every Float32Array the render returns
    stereo: true, // the same renderSpu as PS1
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
    stereo: true, // n64/render.mjs always returns {l, r} per track
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
// p: {track, midi, vel, ticks, seconds, offset, tick, ppq} → {pcm: Float32Array
// | {l, r} | null, prog} | null. The one-note-copy-through-the-console's-own-
// renderer recipe lives in tools/note-preview.mjs (M.renderOneNote), shared
// with tools/sounding.mjs's capture-time pitch probe (CHIPS.psf/usf.capture
// in index.html) — both load it the way every chip helper reaches this
// worker, listed in CHIPS[kind].shared.
// offset: the track's sounding-pitch shift (tools/sounding.mjs; a captured
// track's roll pitch = the renderer's own key + offset), so `p.midi` — the
// ROLL's pitch — converts back to the key the renderer needs.
// tick/ppq: the tapped note's own roll tick and the song's ppq (index.html's
// `song.ppq`) — M.seqTickOf (tools/note-preview.mjs) turns them into the
// SEQUENCE tick the template note must be sounding at, so a tap on a later
// note in a track whose program changes mid-track (Josh's ear: FF7 "You Can
// Hear the Cry of the Planet", 2026-09-30) hears that later program instead
// of the group's first, always. `prog` on the return is the template note's
// own program/instrument (psf: `program`; usf: `inst`), for the page's
// preview cache key — undefined when no tick was given or none resolved.
export async function previewOne(live, p) {
  if (!live || !live.res || !live.res.result || !live.res.result.notes) return null;
  const {M, R, res, rate, kind} = live;
  if (!M.renderOneNote) return null; // an older cached module set without sounding.mjs/note-preview.mjs: no preview rather than a crash
  const key = (p.midi || 0) - (p.offset || 0);
  const at = M.seqTickOf ? M.seqTickOf(kind, res.result, p.tick, p.ppq) : undefined;
  const renderFn = (one, o) => R.render(M, {...res, result: one, seconds: o.seconds}, {sampleRate: rate, onProgress: o.onProgress});
  const pcm = await M.renderOneNote(M, kind, res.result, p.track, renderFn, {key, vel: p.vel || 100, ticks: p.ticks, seconds: p.seconds || 1.5, at});
  let prog;
  if (at != null && M.findTemplateNote) {
    const t = M.findTemplateNote(M, kind, res.result, p.track, at);
    if (t) prog = t.program != null ? t.program : t.inst;
  }
  return {pcm, prog};
}
if (typeof self !== "undefined") self.onmessage = async e => {
  if (e.data && e.data.preview) { // one note through the game's instrument, from the last render's set
    const q = e.data.preview;
    try {
      const x = live && live.id === q.id ? await previewOne(live, q) : null;
      const pcm = x ? x.pcm : null;
      const transfer = pcm ? (pcm.l ? [pcm.l.buffer, pcm.r.buffer] : [pcm.buffer]) : [];
      self.postMessage({preview: {req: q.req, pcm, sampleRate: live ? live.rate : 0, prog: x ? x.prog : undefined}}, transfer);
    } catch (err) { self.postMessage({preview: {req: q.req, pcm: null, error: String(err && err.message || err)}}); }
    return;
  }
  const {id, kind, files, shared, own, v, bytes, libs, n, secs, rate, budget, title} = e.data;
  const post = m => self.postMessage(Object.assign({id}, m));
  try {
    const R = RUNNERS[kind];
    if (!R) throw new Error("no worker runner for " + kind);
    const loadOne = (f, opt) => { const path = "./" + (opt ? f.slice(1) : f) + ".mjs" + v;
      return import(path).catch(err => { if (opt) return {}; throw new Error("couldn't load module tools/" + (opt ? f.slice(1) : f) + ".mjs: " + (err && err.message || err)); }); };
    const parts = await Promise.all(files.map(f => loadOne(f, f.startsWith("?"))));
    const sh = await Promise.all(shared.map(f => loadOne(f, false)));
    const M = Object.assign({}, ...parts, ...sh);
    for (const k of own) for (const p of parts) if (p[k]) M[k] = p[k];
    if (!M.renderApu && !M.renderSpu && !M.renderN64) throw new Error("no renderer for " + kind);
    const parsed = R.parse(M)(bytes, libs);
    const res = await R.run(M, parsed, n, secs, p => post({progress: p * 0.3}));
    const leadSec = R.lead(M, res);
    // memory budget (planChipRender, above): the render's OWN sample rate/
    // channels, decided before it allocates anything — mirrors index.html's
    // inline path exactly (the worker can't call the page's copy)
    const plan = planChipRender({tracks: chipEstimateTracksW(R, res), seconds: secs, sampleRate: rate, channels: R.stereo ? 2 : 1, budget: budget || 2_000_000_000});
    if (plan.refuse) throw new Error("too big for this device's memory: " + Math.round(plan.bytes / 1e6) + " MB");
    if (plan.rate !== rate || plan.mono) post({debug: (title || id) + ": console voice rendered at " + (plan.rate / 1000) + " kHz" + (plan.mono ? " mono" : "") + " to fit memory (~" + Math.round(plan.bytes / 1e6) + " MB)"});
    const r = await R.render(M, res, {sampleRate: plan.rate, onProgress: p => post({progress: 0.3 + p * 0.7})});
    const pcm = {}, pan = {}, transfer = [];
    const isPcm = x => x instanceof Float32Array || !!(x && x.l instanceof Float32Array && x.r instanceof Float32Array); // mono, or a stereo pair from a renderer that pans
    const names = R.channels || Object.keys(r).filter(k => isPcm(r[k]));
    for (const name of names) {
      const x = r[name]; if (!x) continue;
      const parts = x.l ? [x.l, x.r] : [x];
      let live = false; for (const a of parts) { for (let i = 0; i < a.length && !live; i += 13) if (Math.abs(a[i]) > 1e-4) live = true; }
      if (!live) continue;
      if (plan.mono && x.l && x.r) { // downmix ONLY what the budget needed to shrink, and only where the pan holds still
        const p = chipStaticPan(x.l, x.r);
        if (p !== null) { const mono = chipDownmixStatic(x.l, x.r, p); pcm[name] = mono; pan[name] = p; transfer.push(mono.buffer); continue; }
      }
      pcm[name] = x; for (const a of parts) transfer.push(a.buffer);
    }
    live = (kind === "psf" || kind === "psf2" || kind === "usf") ? {id, kind, M, R, res, rate: plan.rate} : null; // kept for note previews
    post({done: {pcm, sampleRate: r.sampleRate, leadSec, pan}}, transfer);
  } catch (err) { post({error: String(err && err.message || err)}); }
};
