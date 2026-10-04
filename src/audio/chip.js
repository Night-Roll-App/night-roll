import { S } from "../state.js";
import { readData } from "../platform/folder.js";
import { nsfURL } from "../platform/storage.js";
import { repoApi } from "../platform/storage.js";
import { apiError } from "../platform/storage.js";
import { repoName } from "../platform/storage.js";
import { EDITION } from "../edition.js";
import { trackGain } from "./engine.js";

// ---------------------------------------------------- authentic chip audio
// The captured APU register log rendered through the 2A03's real DSP
// (tools/nsf/apu-render.mjs) — one pulse wave changing pitch instead of an
// oscillator per note, hardware envelopes, real noise. Available while the
// import session that captured the current draft is still open.
export const chip = {key: null, pcm: null, pcmRate: 0, buffers: null, buffersCtx: null, lead: 0, srcs: [], pan: null, stream: null};
// no toggle: chip audio is automatic wherever a source resolves
// stream: non-null only in stream mode (docs/streamed-render-plan.md step 3,
// chipStreamOpen) — {key, gen, rate, chunkFrames, overlap, tracks, seconds,
// frames, leadSec, silent:Set, cache:Map(idx->{buffers,bytes,pinned}),
// pinnedIdx:Set, scheduled:Set, waiters:Map(idx->[fn]), bytes, peakBytes,
// live, srcs:[]}. chip.pcm/chip.buffers stay null for a song playing from
// chip.stream — chipActive()/chipHas() read all three.
// pan: {name: -1..1}, set only for a track the memory budget (below) downmixed
// from a genuinely stereo render to mono — chipStart reapplies it so the
// audible result is unchanged; absent/null for every other track (normal pan
// — trackPan/trackPanners, the mixer's own per-track control — still applies).
export function chipTrackNo() { // NSF track number from the LIVE import session
  if (!S.songKey || !S.nsfSess) return null;
  for (let n = 1; n < S.nsfSess.rows.length; n++)
    if (S.nsfSess.rows[n] && S.nsfSess.rows[n].key === S.songKey) return n;
  return null;
}
// NSF vault: a PRIVATE repo (Josh's design, 2026-08-17) holding the NSFs the
// public repo must not — album.json links to it (vault file + track map, pure
// metadata) and the app fetches with the same token Sync uses. Chain:
// live import session → this device's IndexedDB cache → vault fetch (cached).
// NSF repo config lives in cfg() (nsfBase for reads, nsfRepo for writes)
export const albumMetaCache = {};
// album dir -> album.json contents (or null)
export async function albumMetaFor(key) {
  const m = key && key.match(/^(albums\/.+?)\/(?:songs\/)?[^/]+\.mid$/); // lazy: don't swallow /songs/
  if (!m) return null;
  const dir = m[1];
  if (!(dir in albumMetaCache)) {
    try {
      const r = await readData("songs", dir + "/album.json", true);
      // cache SUCCESS only: a 404 during CDN lag (album committed seconds ago)
      // must not poison the tab — it made committed songs silently play synth
      // while drafts played chip (Josh's side-by-side, 2026-08-17)
      if (r.ok) albumMetaCache[dir] = await r.json();
      else { if (r.status !== 404) albumMetaFor.lastFail = {dir, why: "HTTP " + r.status}; return null; } // 404 = no album.json (a composition): not a failure
    } catch (err) { albumMetaFor.lastFail = {dir, why: err.message || "offline"}; return null; }
  }
  return albumMetaCache[dir];
}
export async function vaultFetch(file) {
  // raw-first: a PUBLIC archive serves tokenless with open CORS — chip audio
  // needs zero setup. Private forks fall back to the API + token.
  try {
    const raw = await fetch(nsfURL(file) + "?t=" + Date.now(), {cache: "no-cache"});
    if (raw.ok) return new Uint8Array(await raw.arrayBuffer());
  } catch (err) { /* offline or blocked: try the API */ }
  const token = localStorage.getItem("ff1roll-ghtoken");
  if (!token) throw new Error("NSF not publicly reachable and no GitHub token on this device — add one in File → Settings");
  const r = await fetch(repoApi("nsf") + file + "?ref=main", {headers: ghHeaders(token)});
  if (!r.ok) throw apiError("nsf", r, file);
  let j = await r.json();
  // the contents API inlines files up to 1 MB only; above that it answers
  // with an empty content and the blob's sha — Mario 64's library is 1.2 MB,
  // so every other device fetched nothing and fell to synth. The blobs API
  // serves the same bytes, base64, to 100 MB.
  if (!j.content && j.sha) {
    const b = await fetch("https://api.github.com/repos/" + repoName("nsf") + "/git/blobs/" + j.sha, {headers: ghHeaders(token)});
    if (!b.ok) throw apiError("nsf", b, file);
    j = await b.json();
  }
  const bin = atob(j.content.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
// A render belongs to the song it started for. Two renders can be in flight
// (open a slow Game Boy song, get bored, open an FF1 song): each used to
// empty chip.buffers on the way in and stamp chip.key with whatever song was
// CURRENT on the way out, so the later finisher could hand an FF1 song the
// Game Boy's buffers (Josh, 2026-09-27: FFL songs silent, then FF1 silent
// too). Now: build aside, and only publish if this song is still open. A
// render whose every channel came out silent is refused with a ⚠ line
// naming the song — synth carries it, and the log says why.
// ---- console-render memory budget (2026-09-30; FFX "Challenge" reproduced:
// PS2's own driver, 30 tracks, 163 s, stereo 48 kHz = 1.88 GB of Float32 —
// the iPad's WKWebView killed the content process for it: black screen, fast
// reload). Generic across every chip (no per-game table, per CLAUDE.md): the
// plan only sees track count / seconds / sample rate / channels, picked
// BEFORE the render runs so the peak allocation itself never happens.
// Dropping entirely-silent tracks is the existing post-render step
// (chipSilent, below) — this only shapes what IS rendered.
export const CHIP_BUDGET_APP = 600_000_000;
// the iPad app (WKWebView) — measured well below what crashed Challenge
export const CHIP_BUDGET_WEB = 2_000_000_000;
// desktop/browser — GoldenEye (N64) on a phone crashed around here (chipPcmToBuffers' comment, 2026-09-28)
export const CHIP_RATE_STEPS = [48000, 32000, 24000, 22050];
// resampled by the renderer's own sampleRate option; 22050 is the floor — never lower
export function chipRenderBudget() { return (typeof EDITION !== "undefined" && EDITION === "app") ? CHIP_BUDGET_APP : CHIP_BUDGET_WEB; }
// Pure: the cheapest combination (mono, then a lower sample rate) that fits
// the budget, in the order CLAUDE.md's fix asked for — (a) drop silent
// tracks is handled elsewhere (this can't know which tracks are silent
// before they're rendered); (b) mono; (c) a lower rate, 48k→32k→24k→22050.
// {tracks, seconds, sampleRate, channels, budget, canStream} → {rate, mono, channels, bytes, refuse}
// canStream (2026-09-30, Aeon Battle crash — open-items.md "2026-09-30 21:40",
// mirrors tools/chip-worker.mjs's own copy — keep the two in step): a kind
// with a stream hook (CHIPS[kind].stream, today psf/psf2) renders mono
// straight into the final kept buffer chunk by chunk (chipRenderStreamed,
// below) — its peak is kept + one chunk. A kind with no stream hook still
// renders the WHOLE stereo pair in one call, THEN downmixes while that
// original is still referenced — its real peak for the mono step is the
// stereo pair (2x) + the mono copy (1x) ≈ 3x kept (step 0 measured the
// multiplier). The budget used to compare `budget` against kept alone for
// EVERY kind, so a "mono fits" verdict for a non-streaming kind could still
// crash for real; the mono step's admission check below uses the honest
// (3x-aware) estimate when canStream is falsy. `bytes` itself stays the kept
// estimate either way (what's reported/logged elsewhere).
export function planChipRender({tracks, seconds, sampleRate, channels, budget, canStream}) {
  const bytesAt = (rate, ch) => Math.ceil(tracks * ch * rate * seconds * 4);
  const monoFits = (rate, ch, keptBytes) => keptBytes + (canStream ? 0 : bytesAt(rate, ch)) <= budget; // + the stereo original a non-streaming render still holds
  let rate = sampleRate, mono = false, ch = channels;
  let bytes = bytesAt(rate, ch);
  if (bytes <= budget) return {rate, mono, channels: ch, bytes};
  if (ch > 1) { // (b) mono: half the bytes, no quality loss when the pan turns out static (chipStaticPan, at render time)
    mono = true; ch = 1;
    bytes = bytesAt(rate, ch);
    if (monoFits(rate, channels, bytes)) return {rate, mono, channels: ch, bytes};
  }
  for (const step of CHIP_RATE_STEPS) { // (c) lower the rate, never below 22050 (the last step)
    if (step >= rate) continue;
    rate = step;
    bytes = bytesAt(rate, ch);
    if (mono ? monoFits(rate, channels, bytes) : bytes <= budget) return {rate, mono, channels: ch, bytes};
  }
  return {rate, mono, channels: ch, bytes, refuse: true}; // floor hit and still over budget: the caller refuses the render, synth carries the song
}
// Downmix a stereo render pair to mono IF its pan is static across the whole
// track (varies < ~0.08 pan units between sampled windows) — null keeps it
// stereo (the fix's own rule: "if pan varies per note, keep stereo for that
// track only"). windows: rms energy per ~512-sample block, sampled every
// stride blocks so a multi-minute track doesn't scan every sample.
export function chipStaticPan(l, r) {
  const n = Math.min(l.length, r.length);
  if (!n) return 0;
  const win = 512, stride = Math.max(1, Math.floor(n / (win * 4000)));
  const pans = [];
  for (let start = 0; start + win <= n; start += win * stride) {
    let el = 0, er = 0;
    for (let i = start; i < start + win; i++) { el += l[i] * l[i]; er += r[i] * r[i]; }
    if (el < 1e-9 && er < 1e-9) continue; // silence here says nothing about pan
    pans.push(Math.max(-1, Math.min(1, Math.atan2(Math.sqrt(er), Math.sqrt(el)) * 4 / Math.PI - 1)));
  }
  if (pans.length < 2) return 0; // too little signal to tell: treat as centred
  const lo = Math.min(...pans), hi = Math.max(...pans);
  return hi - lo > 0.08 ? null : pans.reduce((a, b) => a + b, 0) / pans.length;
}
// The exact inverse of the equal-power law trackPanners (chipStart) applies
// at playback, so a static-pan track sounds identical after the round trip:
// mono = the louder channel divided back out by its own gain at this pan.
export function chipDownmixStatic(l, r, pan) {
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  const useL = gl >= gr, src = useL ? l : r, g = useL ? gl : gr, inv = g > 1e-6 ? 1 / g : 0;
  const mono = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) mono[i] = src[i] * inv;
  return mono;
}
export function chipSilent(chans) { // (Float32Array | {l, r})[] → true when nothing in any of them is above the noise floor
  for (const c of chans) for (const a of (c && c.l ? [c.l, c.r] : [c])) { if (!a) continue; for (let i = 0; i < a.length; i += 13) if (Math.abs(a[i]) > 1e-4) return false; }
  return true;
}
export function chipIsPcm(x) { return x instanceof Float32Array || !!(x && x.l instanceof Float32Array && x.r instanceof Float32Array); }
export async function chipAlbumHasSource() { // an SNES import has no console file at all: no warning is due
  try { const meta = await albumMetaFor(S.songKey); return !!(meta && meta.nsf); } catch (err) { return false; }
}
// 2026-09-30 (Aeon Battle crash, open-items.md "2026-09-30 21:40"): mirrors
// tools/chip-worker.mjs's own renderStreamed — keep the two in step (the
// worker can't import from this inline script). Used by chipRender() below
// INSTEAD of a plain CHIPS[kind].render() call whenever the kind has a
// `.stream` hook (today psf/psf2): renders into the FINAL kept buffers chunk
// by chunk, so a mono downmix copy never coexists with the whole stereo
// original for the whole song (peak ≈ kept + one chunk, not ~3x kept — see
// planChipRender's own comment for the budget-honesty half of this fix).
export const CHIP_STREAMED_RENDER_CHUNK_SEC = 1;
export async function chipRenderStreamed(M, kindDef, res, {sampleRate, plan, onProgress}) {
  const streamObj = kindDef.stream(M, res, {sampleRate});
  const names = streamObj.tracks;
  const total = streamObj.frames;
  const chunkFrames = Math.max(1, Math.round(sampleRate * CHIP_STREAMED_RENDER_CHUNK_SEC));
  const pan = {};
  if (plan.mono) {
    const acc = {}; for (const n of names) acc[n] = {pans: [], moved: false, sawAudio: false};
    for (let done = 0; done < total; ) {
      const n = Math.min(chunkFrames, total - done);
      const r = streamObj.render(n);
      for (const name of names) {
        const t = r[name];
        if (!t || !t.l || acc[name].moved) continue;
        if (chipSilent([t])) continue;
        const p = chipStaticPan(t.l, t.r);
        if (p === null) { acc[name].moved = true; continue; }
        acc[name].pans.push(p); acc[name].sawAudio = true;
      }
      done += n;
    }
    for (const name of names) {
      const a = acc[name];
      if (a.moved || !a.sawAudio) { pan[name] = null; continue; }
      if (a.pans.length < 2) { pan[name] = a.pans[0] || 0; continue; }
      const lo = Math.min(...a.pans), hi = Math.max(...a.pans);
      pan[name] = hi - lo > 0.08 ? null : a.pans.reduce((x, y) => x + y, 0) / a.pans.length;
    }
    streamObj.seek(0);
  }
  const outMono = {}, outL = {}, outR = {};
  let offset = 0, peakChunkBytes = 0;
  for (let done = 0; done < total; ) {
    const n = Math.min(chunkFrames, total - done);
    const r = streamObj.render(n);
    let chunkBytes = 0;
    for (const name of names) {
      const t = r[name]; if (!t) continue;
      if (t.l) {
        chunkBytes += t.l.byteLength + t.r.byteLength;
        if (plan.mono && pan[name] !== null && pan[name] !== undefined) {
          if (!outMono[name]) outMono[name] = new Float32Array(total);
          const m = chipDownmixStatic(t.l, t.r, pan[name]);
          outMono[name].set(m, offset);
          chunkBytes += m.byteLength;
        } else {
          if (!outL[name]) { outL[name] = new Float32Array(total); outR[name] = new Float32Array(total); }
          outL[name].set(t.l, offset); outR[name].set(t.r, offset);
        }
      } else {
        if (!outMono[name]) outMono[name] = new Float32Array(total);
        outMono[name].set(t, offset);
        chunkBytes += t.byteLength;
      }
    }
    peakChunkBytes = Math.max(peakChunkBytes, chunkBytes);
    offset += n; done += n;
    if (onProgress) onProgress(offset / total);
  }
  const pcm = {}, panOut = {}; let keptBytes = 0;
  for (const name of names) {
    const v = outMono[name] ? outMono[name] : (outL[name] ? {l: outL[name], r: outR[name]} : null);
    if (!v) continue;
    if (chipSilent([v])) continue;
    pcm[name] = v;
    keptBytes += v.l ? (v.l.byteLength + v.r.byteLength) : v.byteLength;
    if (outMono[name] && pan[name] !== null && pan[name] !== undefined) panOut[name] = pan[name];
  }
  return {pcm, pan: panOut, peakBytes: keptBytes + peakChunkBytes, keptBytes, sampleRate: streamObj.sampleRate, groups: names.length};
}
export function chipWorkerAvailable() { return typeof Worker !== "undefined" && typeof S.APP_BASE !== "undefined" && !!S.APP_BASE && !chipWorkerAvailable.broken; }
// one at a time; a new song terminates the old render; after a render it stays for previews (w.__key = its song)
export const chipPreviewPending = new Map();
// req → resolve, for one-note previews answered by the live worker
export const chipPreviewCache = new Map();
// "song|track|midi[|p<prog>]" → AudioBuffer, so a repeated tap is instant
export const chipPreviewProgAt = new Map();
// the game's own instrument for ONE note, or null (synth then). offset:
// tools/sounding.mjs — the roll's pitch minus this is the key the renderer
// needs. tick/ppq: the tapped note's own roll tick + song.ppq — several
// chip tracks change program mid-track ("ch 1 prog 51,46"), so a tap late
// in such a track must hear that later program, not always the track's
// first (Josh's ear: FF7 "You Can Hear the Cry of the Planet", 2026-09-30).
// Passed straight through to the worker (chip-worker.mjs previewOne), which
// resolves them to the right template note via M.seqTickOf/findTemplateNote
// (tools/note-preview.mjs) — this function stays kind-agnostic. Undefined
// tick (a piano-strip key press, live MIDI input — no note at all) keeps
// today's behavior exactly: the track's first program, keyed without a tick.
export async function chipPreviewBuffer(name, midi, offset = 0, tick, ppq) {
  if (!S.chipWorker || S.chipWorker.__key !== S.songKey || !S.audio) return null;
  const known = tick != null && chipPreviewProgAt.get(S.songKey + "|" + name + "|" + tick);
  const key = S.songKey + "|" + name + "|" + midi + (known ? "|p" + known : "");
  const hit = chipPreviewCache.get(key);
  if (hit && hit.ctx === S.audio) return hit.buf;
  const req = ++S.chipPreviewReq;
  const reply = await new Promise(res => {
    const t = setTimeout(() => { chipPreviewPending.delete(req); res(null); }, 400); // a slow answer loses to the synth: a tap must sound now
    chipPreviewPending.set(req, m => { clearTimeout(t); res(m); });
    try { S.chipWorker.postMessage({preview: {req, id: S.songKey, track: name, midi, vel: 100, offset, tick, ppq}}); } catch (err) { clearTimeout(t); chipPreviewPending.delete(req); res(null); }
  });
  if (!reply || !reply.pcm) return null;
  const x = reply.pcm, st = x.l ? x : null;
  const buf = S.audio.createBuffer(st ? 2 : 1, (st ? st.l : x).length, reply.sampleRate || S.audio.sampleRate);
  if (st) { buf.copyToChannel(st.l, 0); buf.copyToChannel(st.r, 1); } else buf.copyToChannel(x, 0);
  // key by the template's own program/instrument, not the raw tick: every
  // note under the same program shares one buffer, and a cached prog-51
  // buffer can never answer a prog-46 tap (the bug: findTemplateNote always
  // took the group's FIRST note, so every tick shared one wrong-program key)
  if (tick != null && reply.prog != null) chipPreviewProgAt.set(S.songKey + "|" + name + "|" + tick, reply.prog);
  const finalKey = S.songKey + "|" + name + "|" + midi + (reply.prog != null ? "|p" + reply.prog : "");
  if (chipPreviewCache.size > 300) { chipPreviewCache.clear(); chipPreviewProgAt.clear(); }
  chipPreviewCache.set(finalKey, {ctx: S.audio, buf});
  return buf;
}
export function chipActive() { return chip.key === S.songKey && !!(chip.pcm || chip.buffers || chip.stream); }
export function chipHas(name) { // this track name has console audio
  if (chip.stream) return chip.stream.tracks.includes(name) && !chip.stream.silent.has(name); // stream mode (step 3): listed and not reported silent by the idle sweep
  return !!((chip.pcm && chip.pcm[name]) || (chip.buffers && chip.buffers[name]));
}
export function chipBuffers() { // AudioBuffers for the live context, made from the render's PCM — called from play()'s tap only
  if (chip.buffers && chip.buffersCtx === S.audio) return chip.buffers;
  if (!chip.pcm || !S.audio) return chip.buffers || {};
  const out = {};
  for (const [name, data] of Object.entries(chip.pcm)) { // mono Float32Array, or a stereo pair {l, r} from a renderer that pans
    const st = data && data.l ? data : null;
    const buf = S.audio.createBuffer(st ? 2 : 1, (st ? st.l : data).length, chip.pcmRate || S.audio.sampleRate); // at the render's rate: the graph resamples on playback
    if (st) { buf.copyToChannel(st.l, 0); buf.copyToChannel(st.r, 1); } else buf.copyToChannel(data, 0);
    out[name] = buf;
  }
  chip.buffers = out; chip.buffersCtx = S.audio;
  return out;
}
// The render as AudioBuffers right away, each track's Float32 copy dropped
// as its buffer is made: holding both doubled the memory, and a 137 s N64
// song (GoldenEye "Archives": 14 stereo tracks, ~470 MB) crashed Safari on a
// phone (Josh, 2026-09-28). The AudioBuffer constructor needs no context, so
// this does not wait for the tap that makes one; without it (old engines),
// chipBuffers builds from pcm in the tap as before.
export function chipPcmToBuffers() {
  if (!chip.pcm || typeof AudioBuffer !== "function") return;
  const out = {};
  try {
    for (const name of Object.keys(chip.pcm)) {
      const data = chip.pcm[name], st = data && data.l ? data : null;
      const buf = new AudioBuffer({numberOfChannels: st ? 2 : 1, length: (st ? st.l : data).length, sampleRate: chip.pcmRate});
      if (st) { buf.copyToChannel(st.l, 0); buf.copyToChannel(st.r, 1); } else buf.copyToChannel(data, 0);
      out[name] = buf;
      delete chip.pcm[name]; // this track's Float32 copy is garbage now
    }
  } catch (err) { // put back what was already converted, so the tap can build every track
    for (const [name, buf] of Object.entries(out)) chip.pcm[name] = buf.numberOfChannels === 2 ? {l: buf.getChannelData(0), r: buf.getChannelData(1)} : buf.getChannelData(0);
    console.log("[chip] AudioBuffer constructor failed, building in the tap: " + err.message);
    return;
  }
  chip.buffers = out; chip.buffersCtx = null; chip.pcm = null; // chipBuffers returns these for any context
}
export function chipStopSrcs() {
  for (const s of chip.srcs) { try { s.stop(); } catch (err) { /* already done */ } }
  chip.srcs = [];
  // stream mode (docs/streamed-render-plan.md step 3): stop the per-chunk
  // sources chipStreamPump scheduled, but keep chip.stream.cache — the same
  // chunks are good for the next play() from anywhere already cached, and a
  // fresh render would throw away work for nothing. One call site (stop()
  // already calls chipStopSrcs) covers both paths.
  if (chip.stream) {
    for (const s of chip.stream.srcs) { try { s.stop(); } catch (err) { /* already done */ } }
    chip.stream.srcs = [];
    chip.stream.live = false;
  }
}
export function chipStart(fromSec) {
  chipStopSrcs();
  for (const [name, buffer] of Object.entries(chipBuffers())) {
    const ti = S.song.tracks.findIndex(tr => (tr.name || "") === name);
    if (ti < 0) continue;
    const vv = S.song.tracks[ti].voice;
    if (vv && vv !== "auto") continue; // explicit instrument choice overrides the chip for this track
    const src = S.audio.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = S.playRate; // speed slider = tape-style on chip audio
    if (S.loopSeg && S.loopSeg.end > S.loopSeg.start) {
      src.loop = true;
      src.loopStart = Math.min(chip.lead + S.loopSeg.start * S.playRate, buffer.duration);
      src.loopEnd = Math.min(chip.lead + S.loopSeg.end * S.playRate, buffer.duration);
    }
    // a track the memory budget downmixed from stereo to mono (planChipRender,
    // chip.pan) gets ITS OWN panner here, upstream of trackGain/trackPanners
    // (the mixer's own per-track pan, untouched) — bakes the console's
    // original static pan back in so the audible result is unchanged
    let node = src;
    if (chip.pan && chip.pan[name] !== undefined && S.audio.createStereoPanner) {
      const p = S.audio.createStereoPanner(); p.pan.value = chip.pan[name];
      src.connect(p); node = p;
    }
    node.connect(trackGain(ti));
    src.start(S.playT0, Math.min(chip.lead + fromSec * S.playRate, buffer.duration));
    if (S.albumEndAbs !== null) src.stop(S.playT0 + S.albumEndAbs); // the hardware loop still wraps; album play just ends it
    chip.srcs.push(src);
  }
}
export function ghHeaders(token) {
  return {Authorization: "Bearer " + token, Accept: "application/vnd.github+json"};
}
