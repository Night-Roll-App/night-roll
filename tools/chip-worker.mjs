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
//   ← {id, done: {pcm: {name: Float32Array}, sampleRate, leadSec, pan: {name: -1..1},
//                 debug: {peakBytes, keptBytes, tracks, groups}}}  tally: peakBytes = the
//     most this render held at once (R.render's whole return, since nothing
//     streams yet, + any downmix copies made while their stereo originals
//     were still held); keptBytes = what's actually in `pcm` above; tracks =
//     chipEstimateTracksW's estimate (used for the budget plan); groups =
//     the render's real group count (tools/chip-bench.mjs, NIGHT-ROLL.md)
//   ← {id, error: "message"}
// Stopping a render = terminate() from the page; nothing to unwind here.
//
// Memory budget (2026-09-30; FFX "Challenge" reproduced on the iPad — PS2's
// own driver, 30 tracks, 163 s, stereo 48 kHz = 1.88 GB of Float32, killed
// the WKWebView content process). planChipRender/chipEstimateTracks/
// chipStaticPan/chipDownmixStatic mirror index.html's copy exactly (a worker
// can't import from the page's inline script) — keep the two in step.
//
// Streamed protocol (docs/streamed-render-plan.md step 2, 2026-09-30) — a
// SECOND, separate message shape beside the whole-render one above; a song
// still renders whole unless the page opts into this path. Only psf/psf2
// (tools/psx/spu-render.mjs's createSpuStream) implement the per-kind
// `R.stream` hook today; every other kind replies the fallback error below
// so the page can fall back to the whole-render path.
//   postMessage({stream: {id, kind, files, shared, own, v, bytes, libs?,
//                         secs, rate, chunkFrames, overlap}})
//     chunkFrames (C): frames per chunk, not counting the overlap tail.
//     overlap (O): frames of linear-crossfade overlap between adjacent
//     chunks (chunk k = raw frames [kC, (k+1)C+O)).
//   ← {ready: {id, tracks, seconds, sampleRate, frames, leadSec}}
//   ← {stream: {id, error: "no stream for <kind>"}}   no R.stream for this
//     kind, or parse/run itself threw — the page falls back to whole-render
//   postMessage({want: {id, gen, from, to}})   chunk indices [from, to],
//     inclusive; answered one at a time, yielding to the event loop between
//     chunks (so a preview request queued mid-want is never starved) and
//     re-checking `gen` at each yield so a newer want/seek for the same id
//     cancels the rest of this one without posting further chunks.
//   ← {chunk: {id, gen, idx, frames, tracks: {name: Float32Array | {l, r}}}}
//     (transferables; a track entirely silent in this window is omitted).
//     Chunk k's LAST `overlap` frames carry a linear fade-out (1 - q/O);
//     chunk k+1's FIRST `overlap` frames (the same absolute raw samples,
//     reproduced via a kept tail — see renderChunk below) carry the
//     complementary fade-in (q/O): (1-q/O)+(q/O) == 1 for every q, so
//     summing the two chunks over the overlap reproduces the untouched
//     continuous render exactly. The very first chunk has no fade-in; the
//     last chunk (reaches the stream's own end) has no fade-out.
//   postMessage({seek: {id, gen, idx}})   repositions for a future `want`
//     at chunk `idx` and bumps the session's gen, which cancels any
//     in-flight `want` loop for an older gen (above).
//   postMessage({idle: {id}})   a state-only sweep; replies the tracks that
//     have never produced an audible sample in any chunk rendered so far —
//     the per-chunk silence check (above) already does the work, this just
//     reports the accumulated complement. Per-chunk snapshot()s are kept in
//     `checkpoints` (not yet read back by anything — a restore-from-nearest-
//     checkpoint optimization is a todo, not needed for correctness today).
//   ← {silent: {id, names}}
const CHIP_RATE_STEPS = [48000, 32000, 24000, 22050]; // resampled by the renderer's own sampleRate option; 22050 is the floor
export function planChipRender({tracks, seconds, sampleRate, channels, budget}) {
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
// M: when given (and it exposes channelGroups — psx/notes.mjs or n64/notes.mjs,
// both loaded into M for psf/psf2/usf — tools/psx/notes.mjs's channelGroups
// can emit a melodic AND a kit group for the SAME channel, so a plain
// distinct-channel count undercounts) the real group count channelGroups
// itself will produce is used instead of the channel-count guess; kitify()
// underneath is idempotent (result.kitGuess memoizes it), so calling it here
// AND again inside R.render costs one extra O(notes) pass, not two full
// analyses. Falls back to the channel-count guess if M/channelGroups isn't
// there (register chips: fixed.length above already returned) or throws.
export function chipEstimateTracksW(R, res, M) {
  const fixed = R.channels;
  if (fixed && fixed.length) return fixed.length;
  if (M && M.channelGroups && res && res.result) {
    try { return Math.max(1, M.channelGroups(res.result, {tsNum: 4, tsDen: 4}).length); } catch (err) { /* fall through to the cheaper guess */ }
  }
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
// docs/streamed-render-plan.md step 0 (2026-09-30): the downmix/pack loop
// ALSO tallies the bytes this render held, cheaply — sums of `.byteLength`s
// already in hand, no new scanning (the per-group silence scan below already
// existed). PEAK: `r` (R.render's return) holds every group's stereo pair at
// once — it is one non-streamed return, not produced incrementally — so ALL
// of it (live or silent) is live memory the whole time this loop runs; a
// mono downmix copy is a SEPARATE allocation made while its stereo source is
// still referenced by `r`, so it adds to the peak rather than replacing
// anything in it. KEPT: only what ends up in `pcm`, posted to the page.
// Exported for tests/chip-worker.test.mjs (a fake stereo runner) — the real
// render path (onmessage, below) is the only caller otherwise.
export function tallyChipRender(r, names, plan) {
  const pcm = {}, pan = {}, transfer = [];
  let peakBytes = 0, keptBytes = 0;
  for (const name of names) {
    const x = r[name]; if (!x) continue;
    const parts = x.l ? [x.l, x.r] : [x];
    const xBytes = parts.reduce((s, a) => s + a.byteLength, 0);
    peakBytes += xBytes; // held by `r` for every group at once, live or not
    let live = false; for (const a of parts) { for (let i = 0; i < a.length && !live; i += 13) if (Math.abs(a[i]) > 1e-4) live = true; }
    if (!live) continue;
    if (plan.mono && x.l && x.r) { // downmix ONLY what the budget needed to shrink, and only where the pan holds still
      const p = chipStaticPan(x.l, x.r);
      if (p !== null) {
        const mono = chipDownmixStatic(x.l, x.r, p);
        peakBytes += mono.byteLength; // the copy coexists with x.l/x.r (still referenced by `r`) until the render returns
        pcm[name] = mono; pan[name] = p; transfer.push(mono.buffer);
        keptBytes += mono.byteLength;
        continue;
      }
    }
    pcm[name] = x; for (const a of parts) transfer.push(a.buffer);
    keptBytes += xBytes;
  }
  return {pcm, pan, transfer, peakBytes, keptBytes};
}

export const RUNNERS = { // parse / emulate / render per chip — the page's CHIPS table, minus the app
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
    stream: (M, res, o) => M.createSpuStream(res.result, {sampleRate: o.sampleRate, ram: res.ram, table: res.table, bank: res.bank, keepSeconds: res.seconds}),
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
    stream: (M, res, o) => M.createSpuStream(res.result, {sampleRate: o.sampleRate, keepSeconds: res.seconds}),
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

// ---- streamed protocol (docs/streamed-render-plan.md step 2) -------------
// Everything below is exported so tests/chip-worker.test.mjs can drive the
// protocol directly (no real Worker, no real module loading — a test's fake
// runner needs no `files`/`shared`/`own` at all; loadM() below handles an
// empty list fine) while the real self.onmessage (bottom of this file) is
// the only caller in the browser.

// Loads the same way the whole-render path does (same ?v-busted relative
// imports), but WITHOUT that path's own "no renderer for <kind>" sanity
// check — a fake test kind has no M.renderApu/renderSpu/renderN64 at all,
// and a stream kind doesn't need one either (R.stream is M.createSpuStream,
// called directly by RUNNERS.psf/psf2 above).
async function loadM(files, shared, own, v) {
  const loadOne = (f, opt) => { const path = "./" + (opt ? f.slice(1) : f) + ".mjs" + (v || "");
    return import(path).catch(err => { if (opt) return {}; throw new Error("couldn't load module tools/" + (opt ? f.slice(1) : f) + ".mjs: " + (err && err.message || err)); }); };
  const parts = await Promise.all((files || []).map(f => loadOne(f, f.startsWith("?"))));
  const sh = await Promise.all((shared || []).map(f => loadOne(f, false)));
  const M = Object.assign({}, ...parts, ...sh);
  for (const k of (own || [])) for (const p of parts) if (p[k]) M[k] = p[k];
  return M;
}

// A stream session's state, keyed by id. A plain Map so tests can make their
// own (createStreamState()) instead of sharing the module's real one.
export function createStreamState() { return new Map(); }

// Complementary linear crossfade weights for an O-frame overlap: wIn[q] +
// wOut[q] == 1 for every q (exactly, not just within tolerance), so a window
// that fades OUT its last O frames and the next window that fades IN its
// first O frames (the same absolute raw samples) sum back to the untouched
// continuous signal.
function fadeWeights(O) {
  const wIn = new Float32Array(O), wOut = new Float32Array(O);
  for (let q = 0; q < O; q++) { wIn[q] = q / O; wOut[q] = 1 - q / O; }
  return {wIn, wOut};
}
function trackChannels(t) { return t.l ? [t.l, t.r] : [t]; }
// Copies (never aliases a buffer that might later be transferred).
function tailOf(t, n) { return t.l ? {l: t.l.slice(t.l.length - n), r: t.r.slice(t.r.length - n)} : t.slice(t.length - n); }
function concatTrack(a, b) {
  if (a.l) {
    const l = new Float32Array(a.l.length + b.l.length), r = new Float32Array(a.r.length + b.r.length);
    l.set(a.l, 0); l.set(b.l, a.l.length); r.set(a.r, 0); r.set(b.r, a.r.length);
    return {l, r};
  }
  const out = new Float32Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out;
}
function fadeTrack(t, wIn, wOut, doIn, doOut, O) {
  for (const a of trackChannels(t)) {
    const len = a.length;
    if (doIn) { const n = Math.min(O, len); for (let q = 0; q < n; q++) a[q] *= wIn[q]; }
    if (doOut) { const n = Math.min(O, len); const base = len - n; for (let q = 0; q < n; q++) a[base + q] *= wOut[q]; }
  }
}
function isLiveTrack(t) {
  for (const a of trackChannels(t)) for (let i = 0; i < a.length; i += 13) if (Math.abs(a[i]) > 1e-4) return true;
  return false;
}
function transferOf(t, list) { if (t.l) list.push(t.l.buffer, t.r.buffer); else list.push(t.buffer); }

// Renders raw frames [idx*C, idx*C+C+O) (clipped to the stream's own
// length), applies this chunk's fades, drops silent tracks, and returns
// {frames, tracks, transfer}. "Continuous": when `idx` is the session's own
// expected next index AND a kept tail is on hand, this only renders the
// NEW `C` frames and prepends the kept O-frame tail from the previous
// chunk (the plan's own words: "keeps the O-frame tail to prepend") —
// bit-identical to a fresh render of the same window, since the tail is a
// verbatim (pre-fade) copy and the underlying stream's own arithmetic only
// ever depends on continuing from where it left off. Any other `idx`
// (out of order, or the very first want after a seek) reseeks and renders
// the whole window fresh.
function renderChunk(st, idx) {
  const {streamObj, C, O, totalFrames, tracks} = st;
  const S = idx * C;
  const E = Math.min(S + C + O, totalFrames);
  const len = Math.max(0, E - S);
  const isFirst = idx === 0;
  const isLast = E >= totalFrames;
  const raw = {};
  if (st.nextIdx === idx && st.tailBuf) {
    const tailLen = st.tailBuf.len;
    const newLen = Math.max(0, len - tailLen);
    const fresh = newLen > 0 ? streamObj.render(newLen) : null;
    for (const name of tracks) {
      const tail = st.tailBuf.data[name];
      raw[name] = fresh ? concatTrack(tail, fresh[name]) : tail;
    }
  } else {
    streamObj.seek(S);
    const r = streamObj.render(len);
    for (const name of tracks) raw[name] = r[name];
  }
  // Keep a RAW (pre-fade) copy of this window's own tail for the next
  // sequential want, computed before any fade or transfer touches `raw`.
  const tailLen = Math.min(O, len);
  const tailData = {};
  for (const name of tracks) tailData[name] = tailOf(raw[name], tailLen);
  st.tailBuf = {len: tailLen, data: tailData};
  st.nextIdx = idx + 1;
  st.checkpoints.set(idx, streamObj.snapshot()); // idle-sweep bookkeeping; not yet read back (todo: restore-from-nearest-checkpoint)

  const outTracks = {}, transfer = [];
  for (const name of tracks) {
    const t = raw[name];
    fadeTrack(t, st.wIn, st.wOut, !isFirst, !isLast, O);
    if (!isLiveTrack(t)) continue; // entirely silent in this window: omit it
    st.everNonSilent.add(name);
    outTracks[name] = t;
    transferOf(t, transfer);
  }
  return {frames: len, tracks: outTracks, transfer};
}

// {stream: {id, kind, files, shared, own, v, bytes, libs, secs, rate,
//           chunkFrames, overlap}} -> {ready: {...}} | {stream: {id, error}}
// Parses and runs exactly like the whole-render path (same R.parse/R.run),
// then asks the kind's own `R.stream` hook (only psf/psf2 have one) to
// build the chip's createSpuStream-shaped stream.
export async function handleStream(streams, data, post) {
  const {id, kind, files, shared, own, v, bytes, libs, secs, rate, chunkFrames, overlap} = data;
  try {
    const R = RUNNERS[kind];
    if (!R) { post({stream: {id, error: "no worker runner for " + kind}}); return; }
    const M = await loadM(files, shared, own, v);
    const parsed = R.parse(M)(bytes, libs);
    const res = await R.run(M, parsed, undefined, secs, () => {});
    if (!R.stream) { post({stream: {id, error: "no stream for " + kind}}); return; }
    const streamObj = R.stream(M, res, {sampleRate: rate});
    const leadSec = R.lead(M, res);
    const {wIn, wOut} = fadeWeights(overlap);
    streams.set(id, {
      kind, M, R, res, streamObj,
      C: chunkFrames, O: overlap, totalFrames: streamObj.frames, tracks: streamObj.tracks,
      gen: null, nextIdx: 0, tailBuf: null, wIn, wOut,
      checkpoints: new Map(), everNonSilent: new Set(),
    });
    // Tap-through-instrument preview (previewOne, below) keeps working in
    // stream mode too, same as after a whole render.
    live = {id, kind, M, R, res, rate: streamObj.sampleRate};
    post({ready: {id, tracks: streamObj.tracks, seconds: streamObj.seconds, sampleRate: streamObj.sampleRate, frames: streamObj.frames, leadSec}});
  } catch (err) {
    post({stream: {id, error: String(err && err.message || err)}});
  }
}

// {seek: {id, gen, idx}}: repositions for a future `want` at chunk `idx` and
// records `gen` as this session's current one — any in-flight `want` loop
// (below) for an OLDER gen notices at its next yield and cancels itself.
// Dropping the kept tail (rather than seeking the stream object right now)
// means a seek that's never followed by a `want` costs nothing.
export function handleSeek(streams, data, post) {
  const {id, gen, idx} = data;
  const st = streams.get(id);
  if (!st) return;
  st.gen = gen;
  st.nextIdx = idx;
  st.tailBuf = null;
}

// {want: {id, gen, from, to}} -> one {chunk: {...}} per idx in [from, to],
// in order. Yields to the event loop between chunks (never a long
// synchronous run) so a preview request or a seek queued mid-want is never
// starved and can take effect promptly; re-checks `gen` after every yield so
// a newer want/seek for this id (which overwrites st.gen) cancels the rest
// of this call without rendering or posting further chunks.
export async function handleWant(streams, data, post) {
  const {id, gen, from, to} = data;
  const st = streams.get(id);
  if (!st) return;
  st.gen = gen;
  for (let idx = from; idx <= to; idx++) {
    if (st.gen !== gen) return; // superseded while we were yielding
    const chunk = renderChunk(st, idx);
    post({chunk: {id, gen, idx, frames: chunk.frames, tracks: chunk.tracks}}, chunk.transfer);
    if (idx < to) await new Promise(resolve => setTimeout(resolve, 0));
  }
}

// {idle: {id}} -> {silent: {id, names}}: a state-only pass (no rendering)
// reporting every track that has not produced one audible sample in any
// chunk rendered so far (the complement of everNonSilent, built for free by
// renderChunk's own per-chunk silence check).
export function handleIdle(streams, data, post) {
  const {id} = data;
  const st = streams.get(id);
  if (!st) return;
  const names = st.tracks.filter(n => !st.everNonSilent.has(n));
  post({silent: {id, names}});
}

// After a render the worker stays alive with the set loaded: a tap on a note
// asks for that ONE note through its track's instrument (Josh, 2026-09-27:
// "when I press notes on Dire Dire Docks it sounds them in our MIDI
// instrument sounds"). Sequence chips only (PS1, N64): a one-note copy of
// the parsed result, rendered by the same path; NES/GB/SNES renders come
// from a register log and have no note to re-render, so the page keeps the
// synth for those.
let live = null; // {id, kind, M, R, res, rate} of the last successful render
const streamSessions = createStreamState(); // id -> streamed-protocol session (above)
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
  // Streamed protocol (docs/streamed-render-plan.md step 2) — a separate
  // message shape from the whole-render one below; dispatched first so it
  // never falls through into that path.
  if (e.data && e.data.stream) { await handleStream(streamSessions, e.data.stream, (m, t) => self.postMessage(m, t)); return; }
  if (e.data && e.data.want) { await handleWant(streamSessions, e.data.want, (m, t) => self.postMessage(m, t)); return; }
  if (e.data && e.data.seek) { handleSeek(streamSessions, e.data.seek, (m, t) => self.postMessage(m, t)); return; }
  if (e.data && e.data.idle) { handleIdle(streamSessions, e.data.idle, (m, t) => self.postMessage(m, t)); return; }
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
    const tracks = chipEstimateTracksW(R, res, M);
    const plan = planChipRender({tracks, seconds: secs, sampleRate: rate, channels: R.stereo ? 2 : 1, budget: budget || 2_000_000_000});
    if (plan.refuse) throw new Error("too big for this device's memory: " + Math.round(plan.bytes / 1e6) + " MB");
    if (plan.rate !== rate || plan.mono) post({debug: (title || id) + ": console voice rendered at " + (plan.rate / 1000) + " kHz" + (plan.mono ? " mono" : "") + " to fit memory (~" + Math.round(plan.bytes / 1e6) + " MB)"});
    const r = await R.render(M, res, {sampleRate: plan.rate, onProgress: p => post({progress: 0.3 + p * 0.7})});
    const isPcm = x => x instanceof Float32Array || !!(x && x.l instanceof Float32Array && x.r instanceof Float32Array); // mono, or a stereo pair from a renderer that pans
    const names = R.channels || Object.keys(r).filter(k => isPcm(r[k]));
    const {pcm, pan, transfer, peakBytes, keptBytes} = tallyChipRender(r, names, plan);
    live = (kind === "psf" || kind === "psf2" || kind === "usf") ? {id, kind, M, R, res, rate: plan.rate} : null; // kept for note previews
    post({done: {pcm, sampleRate: r.sampleRate, leadSec, pan, debug: {peakBytes, keptBytes, tracks, groups: names.length}}}, transfer);
  } catch (err) { post({error: String(err && err.message || err)}); }
};
