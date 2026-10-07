import { S } from "../state.js";
import { readData } from "../platform/folder.js";
import { nsfURL } from "../platform/storage.js";
import { repoApi } from "../platform/storage.js";
import { apiError } from "../platform/storage.js";
import { repoName } from "../platform/storage.js";
import { EDITION } from "../edition.js";
import { trackGain } from "./engine.js";
import { albumMetaFor } from "../model/provenance.js";
import { isCaptureKey } from "../model/provenance.js";
import { slugify } from "../model/provenance.js";
import { idbNsfGet } from "../platform/storage.js";
import { idbNsfPut } from "../platform/storage.js";
import { logErr } from "../hooks.js";
import { logDebug } from "../hooks.js";
import { songTitleOf } from "../hooks.js";

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
// "Hear the MIDI" (Josh, 2026-10-06, #163): a device-local listening switch —
// the console voice stands down and every track plays the .mid on synth
// voices, so he hears exactly what the file holds. A function with its own
// cache, not a top-level let (module rules).
export function hearMidi() {
  if (hearMidi.v === undefined) { try { hearMidi.v = localStorage.getItem("ff1roll-hear-midi") === "1"; } catch (err) { hearMidi.v = false; } }
  return hearMidi.v;
}
export function setHearMidi(on) {
  hearMidi.v = !!on;
  try { localStorage.setItem("ff1roll-hear-midi", on ? "1" : "0"); } catch (err) { /* private mode: session only */ }
}
export function chipActive() { return !hearMidi() && chip.key === S.songKey && !!(chip.pcm || chip.buffers || chip.stream); }
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

// storage key (filename) or null for loaded files
export const PSX_SOUNDING_ON = false;
// A sequence chip (psf/psf2/usf: CHIPS[kind].channels === []) doesn't know its
// own track count until the sequence is parsed (res.result) — register chips
// (nsf/gbs/spc) have a fixed channel list. `.ch` is the note's source channel
// (channelGroups, tools/psx/notes.mjs and its N64/PS2 equivalents) — one
// output track per distinct channel, the same count the render will produce.
// M: when given (and it exposes channelGroups — tools/psx/notes.mjs or
// tools/n64/notes.mjs, both loaded into M for psf/psf2/usf) the real group
// count channelGroups itself will produce is used instead of the
// distinct-channel guess below — channelGroups can emit a melodic AND a kit
// group for the SAME channel (tools/psx/notes.mjs), so the guess undercounts
// a song with both. kitify() underneath is idempotent (result.kitGuess
// memoizes it), so calling it here AND again inside the render below costs
// one extra O(notes) pass, not two full analyses.
export function chipEstimateTracks(kind, res, M) {
  const fixed = CHIPS[kind] && CHIPS[kind].channels;
  if (fixed && fixed.length) return fixed.length;
  if (M && M.channelGroups && res && res.result) {
    try { return Math.max(1, M.channelGroups(res.result, {tsNum: 4, tsDen: 4}).length); } catch (err) { /* fall through to the cheaper guess */ }
  }
  const notes = res && res.result && res.result.notes;
  if (Array.isArray(notes) && notes.length) return Math.max(1, new Set(notes.map(n => n.ch)).size);
  return 8; // an unfamiliar per-song shape: a conservative guess — only shifts the rate a notch, never wrong-sizes the actual render
}
// A render that threw (module load, emulation, render, or the memory budget
// refusing) must not leave anything behind for the NEXT song to trip over —
// this is what a full app restart used to be needed for (2026-09-30: Challenge
// failed, then FF7 — a different chip entirely — failed the same
// "Importing a module script failed", until restart). Idempotent: safe to
// call with nothing to clean up (a second failure in a row, or a refuse with
// no worker ever started).
export function chipCleanupAfterFailure(kind) {
  chipStopSrcs();
  chip.pcm = null; chip.buffers = null; chip.buffersCtx = null; chip.pan = null;
  chipPreviewCache.clear(); chipPreviewProgAt.clear();
  if (S.chipWorker) { try { S.chipWorker.terminate(); } catch (err) { /* gone */ } S.chipWorker = null; } // the next render makes a fresh one
  if (kind && chipModules.cache) delete chipModules.cache[kind]; // re-import next time, never a once-rejected/partial module set
}
export async function chipSource() { // {bytes, n, secs} for the current song, or null
  if (chipTrackNo() !== null && (S.nsfSess.bytes || S.nsfSess.rows[chipTrackNo()].bytes)) {
    const n = chipTrackNo(), row = S.nsfSess.rows[n];
    const libs = {}; for (const [k, f] of Object.entries(S.nsfSess.libs || {})) libs[k] = f.bytes; // the set's shared library, by lower-cased name
    // a row's own file first: a per-file set's track, or a track of a set's
    // second chip file (both carry bytes); the row id is only the slot when
    // the row says nothing else (openChipImport sets slot on every row)
    return {bytes: row.bytes || S.nsfSess.bytes, n: row.slot != null ? row.slot : (S.nsfSess.bytes ? n : 1), secs: row.secs || 60, chip: S.nsfSess.chip || "nsf", libs};
  }
  if (!S.songKey) return null;
  const base = S.songKey.split("/").pop().replace(/\.mid$/, "");
  // this device already has the bytes? (import happened here, or vault cached)
  const im = S.songKey.match(/^albums\/imports\/([^/]+)\//);
  const meta = await albumMetaFor(S.songKey);
  const dir0 = (S.songKey.match(/^(albums\/.+?)\/(?:songs\/)?[^/]+\.mid$/) || [])[1];
  if (!meta && albumMetaFor.lastFail && albumMetaFor.lastFail.dir === dir0) chip.fail = {key: S.songKey, why: "the album's info didn't load (" + albumMetaFor.lastFail.why + ")"};
  // the record's slug: a published album names it (nsf.vault); an unpublished
  // capture has no album.json, so its folder IS the slug (impTrackKey builds
  // albums/<console>/<slug>/…). Only the legacy imports/ prefix was checked
  // once console folders came in — every unpublished PS1 song fell to synth
  // after a relaunch (Josh, 2026-09-27: "everything has reverted")
  const slug = im ? im[1] : (meta && meta.nsf && meta.nsf.vault) ||
    (isCaptureKey(S.songKey) ? S.songKey.replace(/\/[^/]+\.mid$/, "").split("/").pop() : null);
  if (!slug) return null;
  const metaTr = meta && meta.nsf && meta.nsf.tracks && meta.nsf.tracks[base];
  const rec = await idbNsfGet(slug);
  let tr = (rec && rec.tracks && rec.tracks[base]) || metaTr;
  if (tr === undefined || tr === null) return null;
  if (typeof tr === "number") tr = {n: tr};
  const vault = (meta && meta.nsf && meta.nsf.vault) || "";
  const kind = (rec && rec.chip) || (meta && meta.nsf && meta.nsf.chip) || (/\.gbs$/i.test(vault) ? "gbs" : "nsf");
  // a track of a set's non-first chip file (chipExtraVault) names its own
  // archive file and keeps its own bytes in its track entry — like a per-file
  // track, except its n is a real slot in that file, never 1
  const own = !!(tr && tr.vault);
  const perFile = !own && (!!(meta && meta.nsf && meta.nsf.perFile) || !!(tr && tr.bytes));
  let bytes = perFile || own ? tr.bytes : rec && rec.bytes;
  if (!bytes && (own || (meta && meta.nsf && meta.nsf.vault))) { // fall back to the vault, then cache
    console.log("[chip] fetching the console file from the archive…");
    try {
      if (own) { bytes = await vaultFetch(tr.vault); if (bytes) idbNsfPut(slug, null, {[base]: {...tr, bytes}}, kind); }
      else if (perFile) { bytes = await vaultFetch(chipVaultFile(meta.nsf, base)); if (bytes) idbNsfPut(slug, null, {[base]: {...tr, bytes}}, kind); }
      else { bytes = await vaultFetch(meta.nsf.vault); if (bytes) idbNsfPut(slug, bytes, meta.nsf.tracks || {}, kind); }
    } catch (err) { // say WHY and stand down to synthesized voices — never a stuck banner
      chip.fail = {key: S.songKey, why: "the console file didn't download (" + err.message + ")"};
      return null;
    }
  }
  if (!bytes) return null;
  let libs = (rec && rec.libs) || null; // a set's shared library (PS1): on the device, else from the archive, then cached
  if (!libs && meta && meta.nsf && Array.isArray(meta.nsf.libs) && meta.nsf.libs.length) {
    libs = {};
    try {
      for (const l of meta.nsf.libs) { const b = await vaultFetch(meta.nsf.vault + l.file); if (b) libs[l.name] = b; }
      if (Object.keys(libs).length) idbNsfPut(slug, null, {}, kind, libs);
    } catch (err) { chip.fail = {key: S.songKey, why: "the console's sound library didn't download (" + err.message + ")"}; return null; }
  }
  return {bytes, n: perFile ? 1 : tr.n, secs: tr.secs || 75, chip: kind, libs: libs || {}};
}
export function chipVaultFile(meta, base) { return meta.perFile ? meta.vault + base + chipExt(meta.chip) : meta.vault; }
// A one-file-per-album kind whose rip ships MORE than one file (Zophar's GB
// Tetris: DMG-TRA-0.gbs v1.0 + DMG-TRA-1.gbs v1.1): the first file by name is
// nsf.vault as always; each other file sits beside it as
// <console>/<slug>.<file slug><ext> ("game-boy/tetris.dmg-tra-1.gbs"), and a
// track captured from it carries that path in nsf.tracks[base].vault. The dot
// keeps the name from ever being another album's slug (slugs have no dots —
// "tetris-2.gbs" would be Tetris 2's), and the whole name stays unique under
// instrumentsFolder ("<vault>.instruments/"). chipVaultFileSlug reads the
// file slug back ("dmg-tra-1"; null for a plain vault) — what a playlist
// line's own file name is matched against (m3uFileSlug, album-order.mjs).
export function chipExtraVault(meta, fileName) {
  const ext = meta.vault.match(/\.[a-z0-9]+$/i);
  return meta.vault.replace(/\.[a-z0-9]+$/i, "") + "." + slugify(fileName.replace(/\.[a-z0-9]+$/i, "")) + (ext ? ext[0] : "");
}
export function chipVaultFileSlug(vault) { const m = (vault || "").split("/").pop().match(/^[^.]+\.([^.]+)\.[a-z0-9]+$/i); return m ? m[1] : null; }
export function chipExt(kind) { return (CHIPS[kind] || CHIPS.nsf).ext; }
// {chip, M: pipeline modules, nsf: parsed file, rows: [{st, open}]} — the name predates the second chip
// One chip per descriptor (2026-09-27, Game Boy joins the NES): the GB
// modules export the NSF names (parse/run/reconstruct/renderApu) with GB
// semantics, so everything after `reconstruct` is one code path. The vault
// file's extension is the chip id; album.json's `nsf:` key name stays for
// old albums (`nsf.chip` says which). `shared` are the NSF modules the chip
// builds on, loaded HERE with the ?v buster and merged last: a module's own
// nested import (gbs/notes → ../nsf/notes) carries no buster, and the
// browser handed the GB pipeline a stale midi-write from cache on the first
// try; `own` names what the chip's module must still win. `midiOpts` are
// the writer options that make the shared makeMidi speak the chip.
export const CHIPS = {
  nsf: {magic: b => String.fromCharCode(...b.subarray(0, 5)) === "NESM\x1a", ext: ".nsf", label: "NSF",
        channels: ["pulse1", "pulse2", "triangle", "noise"],
        files: ["nsf/nsf", "nsf/notes", "nsf/midi-write", "nsf/apu-render"], shared: [], own: [],
        parse: M => M.parseNSF, run: M => M.runNSFAsync, midiOpts: () => ({})},
  gbs: {magic: b => String.fromCharCode(...b.subarray(0, 3)) === "GBS" && b[3] === 1, ext: ".gbs", label: "GBS",
        channels: ["pulse1", "pulse2", "wave", "noise"],
        files: ["gbs/gbs", "gbs/notes", "gbs/apu-render"], shared: ["nsf/notes", "nsf/midi-write"], own: ["reconstruct", "toNotesTxt"],
        parse: M => M.parseGBS, run: M => M.runGBSAsync, midiOpts: M => ({chans: M.GB_CHANNELS, drum: M.gbNoiseDrum})},
  // Super Nintendo (2026-09-27, Josh from bed with the Chrono Trigger zip:
  // "can he just get the Super Nintendo stuff merged so I can test it").
  // ONE .spc PER TRACK (perFile): the picker takes the whole set, rows are
  // the files in disc/track order, titles from the tags. The SPC pipeline
  // returns its own events (8 voices as voice0-7, noise as drums, volumes
  // already 0-127) on 2 ms ticks; they are rebinned to 10 ms so the NES
  // loop/tempo stages see a frame count they were tuned for. No renderer
  // yet: synth voices carry these songs, and nothing goes to the archive.
  // tagged: the set's tags state each track's length (intro + one pass),
  // so the capture is that long and the loop scan is skipped — on the real
  // Chrono Trigger set the scan took 5–40 s per track, found nothing, and
  // then the 300 s retry doubled it (an iPad tab would not survive that).
  spc: {magic: b => String.fromCharCode(...b.subarray(0, 27)) === "SNES-SPC700 Sound File Data", ext: ".spc", label: "SPC", keepBytes: true,
        channels: ["voice0", "voice1", "voice2", "voice3", "voice4", "voice5", "voice6", "voice7"], perFile: true, tagged: true,
        files: ["spc/spc", "spc/notes", "?spc/apu-render"], shared: ["nsf/notes", "nsf/midi-write"], own: ["reconstruct", "toNotesTxt"], // "?" = optional: the S-DSP renderer lands separately; until then synth carries these songs
        render: (M, res, o) => M.renderApu(res.apuLog, o), // the SPC renderer takes the capture itself
        renderRate: 32000, // the chip's own rate: eight voices of a 3-minute song at 48 kHz were ~300 MB twice over
        parse: M => M.parseSPC,
        run: M => async (spc, n, seconds, onProgress) => {
          const cap = await M.runSPCAsync(spc, seconds, onProgress);
          const r = M.reconstruct(cap, {});
          const k = 5; // 2 ms ticks → 10 ms frames
          const events = r.events.map(e => { const a = Math.round(e.startFrame / k); return {...e, midi: Math.round(e.midi), startFrame: a, endFrame: Math.max(a + 1, Math.round(e.endFrame / k))}; });
          return {apuLog: cap, frames: Math.round(r.frames / k), frameSec: r.frameSec * k, events};
        },
        midiOpts: () => ({volMax: 127})},
  // Sega Genesis / Mega Drive (2026-09-27; Josh: "is it gonna download games
  // to test it with?" — tested on the real Sonic 1 + 2 sets). A VGM is a
  // register LOG, not a program: no emulation, reconstruct reads it straight.
  // One file per track (perFile, "NN - Title.vgm"), often gzipped (.vgz) —
  // the sniff needs the name for those. Header holds total and loop samples
  // (tagged), GD3 holds titles. Events arrive on 44100 Hz sample "frames"
  // with vel/velEnd 0-127; the adapter rebins to 10 ms and maps to the NSF
  // event shape; noise and DAC hits carry a drum number. No renderer yet.
  vgm: {magic: (b, name) => String.fromCharCode(...b.subarray(0, 4)) === "Vgm " || (b[0] === 0x1F && b[1] === 0x8B && /\.vg[mz]$/i.test(name || "")),
        ext: ".vgm", label: "VGM", channels: [], perFile: true, tagged: true,
        files: ["vgm/vgm", "vgm/notes"], shared: ["nsf/notes", "nsf/midi-write"], own: ["reconstruct", "toNotesTxt"],
        parseAsync: M => async bytes => { const v = M.parseVGM(await M.inflateVGM(bytes)); const g = v.gd3 || {}; v.name = g.track || ""; v.game = g.game || ""; v.artist = g.author || ""; v.tags = {seconds: Math.max(1, Math.round((v.endSample || v.totalSamples || 0) / 44100))}; return v; },
        parse: M => () => { throw new Error("VGM parses asynchronously"); },
        run: M => async (vgm, n, seconds, onProgress) => {
          const raw = M.reconstruct(vgm, {});
          const k = 441; // 44100 Hz samples → 10 ms frames
          const events = raw.filter(e => e.midi != null || e.drum != null).map(e => { const a = Math.round(e.startFrame / k); const o = {channel: e.channel, startFrame: a, endFrame: Math.max(a + 1, Math.round(e.endFrame / k)), midi: e.midi == null ? 0 : Math.round(e.midi), vol: e.vel == null ? 100 : e.vel}; if (e.velEnd != null) o.volEnd = e.velEnd; if (e.drum != null) o.drum = e.drum; return o; });
          if (onProgress) onProgress(1);
          const endSample = vgm.endSample || vgm.totalSamples || 0;
          return {apuLog: null, frames: Math.round(endSample / k), frameSec: k / 44100, events, loopFrame: vgm.loopSample != null && vgm.loopSamples ? Math.round(vgm.loopSample / k) : null};
        },
        midiOpts: () => ({volMax: 127})},
  // Sony PlayStation (2026-09-27; verified on the real Final Fantasy VII set).
  // A set is many .minipsf (one per song, a few KB) plus ONE .psflib (the
  // driver + samples) that every mini names in its _lib tag — pick them
  // together. A PSF is a program image, not a log: the chain is inflated
  // (DecompressionStream), overlaid into a 2 MiB RAM image, scanned for a
  // SEQ/VAB (libsnd games) or an AKAO sequence (Square: FF7), and the
  // sequence reader yields notes IN TICKS with a tempo map and meter — so
  // this chip has a `capture` of its own that writes the MIDI directly and
  // never goes through the frame/loop-scan/tempo-fit path. No renderer.
  psf: {magic: b => b[0] === 0x50 && b[1] === 0x53 && b[2] === 0x46 && b[3] === 0x01, ext: ".psf", label: "PSF",
        channels: [], perFile: true, tagged: true, keepBytes: true, // the mini per track + the set's lib (below): chip audio outlives the session
        libFile: name => /\.psflib$/i.test(name),
        files: ["psx/psf", "psx/akao", "psx/seq", "psx/vab", "psx/notes", "psx/spu-render", "psx/capture"], shared: ["sounding", "note-preview"], own: [],
        // chip audio (2026-09-27): the driver's own samples, pitched per the
        // instrument table, shaped by each instrument's envelope — spu-render.mjs.
        // parse/run/render mirror the SNES contract; the lib rides in src.libs.
        parse: M => (bytes, src) => ({bytes, libs: (src && src.libs) || {}}),
        run: M => async (parsed, n, secs, onProgress) => {
          const readLib = name => { const b = parsed.libs[name.toLowerCase()]; if (!b) throw new Error("this song needs its library file " + name + " — pick it together with the songs"); return b; };
          const chain = await M.loadPSFChain(parsed.bytes, readLib, {name: "song.minipsf", inflate: psfInflater()});
          const {ram, ranges} = M.assembleRam(chain);
          if (onProgress) onProgress(0.3);
          const song = M.psfSong(ram, ranges, "song.minipsf"); // SEQ/VAB or AKAO, the song the mini names — tools/psx/capture.mjs
          if (!song.renderable) throw new Error(song.why + " — synthesized voices");
          if (onProgress) onProgress(1);
          return {result: song.result, ram, table: song.table || null, bank: song.bank || null, seconds: secs};
        },
        lead: () => 0, // the capture's MIDI keeps the score's own rests: song time zero is tick 0
        render: (M, res, o) => M.renderSpu(res.result, {sampleRate: o.sampleRate, onProgress: o.onProgress, ram: res.ram, table: res.table, bank: res.bank, keepSeconds: res.seconds}),
        stream: (M, res, o) => M.createSpuStream(res.result, {sampleRate: o.sampleRate, ram: res.ram, table: res.table, bank: res.bank, keepSeconds: res.seconds}), // mirrors tools/chip-worker.mjs's RUNNERS.psf — chipRenderStreamed (the inline fallback's own copy) and stream mode (chipStreamOpen) both use this
        renderRate: 44100, stereo: true, // renderSpu always returns {l, r} per track (tools/psx/spu-render.mjs)
        parseAsync: M => async (bytes, name) => { const psf = M.parsePSF(bytes); const t = psf.tags || {}; const len = /^(\d+):(\d+)/.exec(t.length || ""); return {psf, fileName: name, bytes, name: t.title || "", game: t.game || "", artist: t.artist || "", libs: psf.libs || [], tags: {seconds: len ? +len[1] * 60 + +len[2] : 0}}; },
        capture: async (M, parsed, secs, onProgress, sess) => {
          const inflate = psfInflater(); // no browser inflater (the vm tests): loadPSFChain falls back to node:zlib
          const readLib = n => { const f = sess && sess.libs && sess.libs[n.toLowerCase()]; if (!f) throw new Error("this song needs its library file " + n + " — pick it together with the songs"); return f.bytes; };
          const chain = await M.loadPSFChain(parsed.bytes, readLib, {name: parsed.fileName, inflate});
          const {ram, ranges} = M.assembleRam(chain);
          if (onProgress) onProgress(0.4);
          const song = M.psfSong(ram, ranges, parsed.fileName); // the same resolver the render uses
          const result = song.result;
          // sounding-pitch offsets (2026-09-28): some instruments' samples were
          // recorded an octave — occasionally two — from the key the composer
          // typed, so the console sounds a different pitch than the roll shows
          // (tools/n64/INTEGRATION.md §9.3/§9.6; Josh: "the roll should show the
          // sounding pitch"). One held-note render per non-kit group, through
          // the same renderSpu the console audio uses; kit groups never shift.
          // HELD for PlayStation (2026-09-28): the N64 offsets were checked
          // against a real player (lazyusf2); no PS1 player runs here without a
          // Sony BIOS, so these are measured against OUR renderer only. Until
          // Josh's ear confirms that renderer's octave (Cry of the Planet vs a
          // recording), PS1 captures keep the written pitch — flip
          // PSX_SOUNDING_ON once confirmed.
          return sonySeqCapture(M, "psf", result, 44100, (one, o) => M.renderSpu(one, {sampleRate: o.sampleRate, onProgress: o.onProgress, ram, table: song.table || null, bank: song.bank || null, keepSeconds: o.seconds}), onProgress, []);
        }},
  // Sony PlayStation 2 (2026-09-28; milestone 3, verified on the real Dark
  // Cloud AND Final Fantasy X sets — docs/plans/ps2.md "Findings"). PS2's
  // PSF2/minipsf2 is PSF's container reshaped as a small virtual filesystem
  // (tools/ps2/psf2.mjs) instead of a flat RAM image, so there is no
  // assembleRam step here: the mini + its .psf2lib merge into one file
  // list, a mini's own psf2.ini (Sony's stock driver — "-s=/-h=/-b=" naming
  // its SQ/HD/BD triplet, e.g. every real Dark Cloud song) or ".bgm" (Square
  // Enix's own PS2 driver — Final Fantasy X and kin, its own separate
  // opcode table — tools/ps2/bgm.mjs) picks the format, and tools/ps2/
  // capture.mjs's ps2Song does the rest. Both drivers reuse PS1 SEQ's own
  // shape byte for byte (tools/ps2/sq.mjs, tools/ps2/bgm.mjs), so the note
  // pipeline (seqNotes/makeMidi/channelGroups, tools/psx/notes.mjs) and the
  // chip-audio renderer (renderSpu, tools/psx/spu-render.mjs — an HD/BD or
  // WD bank both reshape into a VAB-shaped bank, tools/ps2/hd.mjs's/
  // tools/ps2/wd.mjs's toBank(), so no PS2-specific render code exists) run
  // over either one completely unmodified.
  psf2: {magic: b => b[0] === 0x50 && b[1] === 0x53 && b[2] === 0x46 && b[3] === 0x02, ext: ".psf2", label: "PSF2",
        channels: [], perFile: true, tagged: true, keepBytes: true, // the mini per track + the set's lib: chip audio outlives the session, exactly as PS1's psf
        libFile: name => /\.psf2lib$/i.test(name),
        files: ["ps2/psf2", "ps2/sq", "ps2/hd", "ps2/bgm", "ps2/wd", "ps2/capture", "psx/vab", "psx/notes", "psx/spu-render"], shared: ["sounding", "note-preview"], own: [],
        parse: M => (bytes, src) => ({bytes, libs: (src && src.libs) || {}}),
        run: M => async (parsed, n, secs, onProgress) => {
          const readLib = name => { const b = parsed.libs[name.toLowerCase()]; if (!b) throw new Error("this song needs its library file " + name + " — pick it together with the songs"); return b; };
          const chain = await M.loadPSF2Chain(parsed.bytes, readLib, {name: "song.minipsf2", inflate: psfInflater()});
          const files = M.mergePSF2(chain);
          const mini = chain.find(s => s.name === "song.minipsf2");
          if (onProgress) onProgress(0.3);
          const song = await M.ps2Song(files, mini, {inflate: psfInflater()});
          if (!song.renderable) throw new Error((song.why || "no HD/BD bank in this image") + " — synthesized voices");
          if (onProgress) onProgress(1);
          return {result: song.result, seconds: secs};
        },
        lead: () => 0, // the capture's MIDI keeps the score's own rests: song time zero is tick 0
        // no ram/table/bank arguments (unlike CHIPS.psf's render): ps2Song
        // already folds the HD/BD bank into result.vab (seqNotes(seq, {vab:
        // bank})), the same field PS1's SEQ/VAB path uses — renderSpu's
        // vabVoices() branch needs nothing else.
        render: (M, res, o) => M.renderSpu(res.result, {sampleRate: o.sampleRate, onProgress: o.onProgress, keepSeconds: res.seconds}),
        stream: (M, res, o) => M.createSpuStream(res.result, {sampleRate: o.sampleRate, keepSeconds: res.seconds}), // mirrors tools/chip-worker.mjs's RUNNERS.psf2
        renderRate: 48000, // PSF2's own native rate (PSF1/PS1's is 44100 — docs/plans/ps2.md §3)
        stereo: true, // the same renderSpu as PS1 (FFX "Challenge" reproduced here — 30 tracks, 163 s, 1.88 GB at this rate)
        parseAsync: M => async (bytes, name) => { const psf = M.parsePSF2(bytes); const t = psf.tags || {}; const len = /^(\d+):(\d+)/.exec(t.length || ""); return {psf, fileName: name, bytes, name: t.title || "", game: t.game || "", artist: t.artist || "", libs: psf.libs || [], tags: {seconds: len ? +len[1] * 60 + +len[2] : 0}}; },
        capture: async (M, parsed, secs, onProgress, sess) => {
          const inflate = psfInflater(); // ps2/psf2.mjs's own default (node:zlib) covers the vm tests when this is null
          const readLib = n => { const f = sess && sess.libs && sess.libs[n.toLowerCase()]; if (!f) throw new Error("this song needs its library file " + n + " — pick it together with the songs"); return f.bytes; };
          const chain = await M.loadPSF2Chain(parsed.bytes, readLib, {name: parsed.fileName, inflate});
          const files = M.mergePSF2(chain);
          const mini = chain.find(s => s.name === parsed.fileName);
          if (onProgress) onProgress(0.3);
          const song = await M.ps2Song(files, mini, {inflate});
          const result = song.result;
          // the SAME sounding-pitch flag as PS1 (PSX_SOUNDING_ON), held off pending the same ear check
          return sonySeqCapture(M, "psf2", result, 48000, (one, o) => M.renderSpu(one, {sampleRate: o.sampleRate, onProgress: o.onProgress, keepSeconds: o.seconds}), onProgress, song.warnings || []);
        }},
  // Nintendo 64 (2026-09-27; verified on the real Super Mario 64 and Zelda
  // sets). A USF set is many .miniusf (a save-state word or two each) plus
  // ONE .usflib carrying the game's sparse ROM and RDRAM. The EAD sequence
  // tables are located in that image, the mini's save state names the
  // sequence id, and the libultra sequence interpreter yields notes in
  // 48-tick beats with a tempo map — another sequence chip: its own
  // capture, MIDI written directly. Chip audio (2026-09-27, evening): the
  // game's own sound bank — VADPCM samples, key regions, envelopes — through
  // n64/render.mjs; the mini per track + the lib once persist like the PS1's.
  usf: {magic: b => b[0] === 0x50 && b[1] === 0x53 && b[2] === 0x46 && b[3] === 0x21, ext: ".usf", label: "USF",
        channels: [], perFile: true, tagged: true, keepBytes: true,
        libFile: name => /\.usflib$/i.test(name),
        files: ["n64/usf", "n64/ead-usf", "n64/seq-libultra", "n64/notes", "n64/capture", "n64/vadpcm", "n64/bank", "n64/render", "n64/rare"], shared: ["sounding", "note-preview"], own: [], // rare: Rare's driver (GoldenEye) — sequenceOfSet falls back to it when no EAD tables are found
        parse: M => (bytes, src) => ({bytes, libs: (src && src.libs) || {}}),
        run: M => async (parsed, n, secs, onProgress) => {
          const files = [{name: "song.miniusf", bytes: parsed.bytes}];
          for (const [name, bytes] of Object.entries(parsed.libs)) files.push({name, bytes}); // the lib's NAME is the game's identity (USF_GAMES)
          const set = M.loadUSF(files);
          if (onProgress) onProgress(0.3);
          const {seq, res} = M.sequenceOfSet(set);
          if (onProgress) onProgress(1);
          return {result: res, set, banks: seq.banks, seconds: secs};
        },
        lead: () => 0,
        render: (M, res, o) => M.renderN64(res.result, {set: res.set, banks: res.banks, sampleRate: o.sampleRate, onProgress: o.onProgress, keepSeconds: res.seconds, meter: {tsNum: 4, tsDen: 4}}),
        renderRate: 32000, // the console's own output rate
        stereo: true, // n64/render.mjs always returns {l, r} per track (the GoldenEye crash this file already documents, chipPcmToBuffers below)
        parseAsync: M => async (bytes, name) => { const u = M.parseUSF(bytes); const t = u.tags || {}; const len = /^(\d+):(\d+)/.exec(t.length || ""); return {usf: u, fileName: name, bytes, name: t.title || "", game: t.game || "", artist: t.artist || "", libs: u.libs || [], tags: {seconds: len ? +len[1] * 60 + +len[2] : 0}}; },
        capture: async (M, parsed, secs, onProgress, sess) => {
          const libs = Object.values(sess && sess.libs || {}); // the lib objects persist across captures, so their parse is cached on them
          const set = M.loadUSF([{name: parsed.fileName, bytes: parsed.bytes, parsed: parsed.usf}, ...libs]);
          if (onProgress) onProgress(0.3);
          const {game, id, seq, res, present} = M.sequenceOfSet(set);
          // sounding-pitch offsets (2026-09-28), same as the PS1 path: EAD's
          // Title Theme inst 3/4 and Cave Dungeon inst 0/6/7, Rare's
          // keyBase-shifted programs (tools/n64/INTEGRATION.md §9.3/§9.6/§10.6)
          // — a held note per non-kit channel through the game's own bank/font
          // (renderN64, which dispatches to renderRare for a Rare driver),
          // before the MIDI is written. Kit groups never shift.
          const groups = M.channelGroups(res, {tsNum: 4, tsDen: 4});
          const offsets = await M.soundingOffsets(groups, (g, key) => M.renderOneNote(
            M, "usf", res, g.name,
            (one, o) => M.renderN64(one, {set, banks: seq.banks, sampleRate: o.sampleRate, onProgress: o.onProgress, keepSeconds: o.seconds, meter: {tsNum: 4, tsDen: 4}}),
            {key, vel: 100, ticks: 100000, seconds: 1, sampleRate: 32000}
          ), {sampleRate: 32000});
          const shiftWarnings = M.applySoundingOffsets(groups, offsets, "midi");
          if (onProgress) onProgress(0.6);
          const bytes = M.toMidi(res, {tsNum: 4, tsDen: 4, offsets});
          const tpb = res.ticksPerBeat || 48;
          { // diagnostic (2026-09-27: the iPad scrambles Mario 64 while the Mac, running this same code, does not): the facts of this capture, into ⚠ so Copy all carries them
            let cov = 0; for (let i = 0; i < present.length; i++) cov += present[i];
            const nn = (res.notes || []).length, chs = [...new Set((res.notes || []).map(n => n.ch))].join(" ");
            const line = "usf " + parsed.fileName + ": game " + (game ? game.id || game.abi : "?") + " seq " + id + " @" + (seq.rom != null ? "rom " + seq.rom.toString(16) : "ram") + " " + seq.size + "B cov " + cov +
                         " → " + nn + " notes ch[" + chs + "] tpb " + tpb + " ticks " + (res.ticks ?? res.endTick ?? "?") + " " + (res.seconds || 0).toFixed(1) + "s tempo " + (res.tempos && res.tempos[0] ? res.tempos[0].bpm : "?") + (res.loop ? " loop@" + res.loop.tick : " noloop") + " midi " + bytes.length + "B";
            if (typeof logErr === "function") logErr(line);
          }
          const bq = tick => { const b = tick / tpb; return [Math.floor(b / 4) + 1, Math.round((b - Math.floor(b / 4) * 4) * 4) / 4 + 1]; };
          const loops = !!res.loop;
          const warnings = [];
          if (res.truncated) warnings.push("stopped at the length cap");
          if (res.selfModified) warnings.push("the sequence rewrites itself while playing");
          if (res.ioReads) warnings.push("reads the game's io ports (" + res.ioReads + "×) — the game would steer this song");
          if (res.stubbed && res.stubbed.length) warnings.push("sound-shaping ops ignored: " + res.stubbed.join("; "));
          for (const w of res.warnings || []) warnings.push(w); // toMidi's kit guess: which drum index became which GM drum
          for (const w of shiftWarnings) warnings.push(w);
          if (onProgress) onProgress(1);
          return {bytes, bpm: res.tempos && res.tempos[0] ? res.tempos[0].bpm : 120, secs: res.seconds, looped: loops, snapped: true,
                  loopAnchor: loops && res.loop.tick > 0 ? bq(res.loop.at) : null, loopTarget: loops && res.loop.tick > 0 ? bq(res.loop.tick) : null, warnings};
        }},
};
// The shared back half of a Sony SEQ-shaped capture (PS1 SEQ/AKAO, PS2 SQ):
// sounding-pitch offsets rendered through the console's own renderSpu (held
// behind PSX_SOUNDING_ON), the MIDI, and the song's length and loop bars from
// its tempo map. renderOne(one, o) renders a one-note result for the offsets.
export async function sonySeqCapture(M, kind, result, rate, renderOne, onProgress, extraWarnings) {
  const groups = M.channelGroups(result);
  const offsets = !PSX_SOUNDING_ON ? {} : await M.soundingOffsets(groups, (g, key) => M.renderOneNote(
    M, kind, result, g.name, renderOne, {key, vel: 100, ticks: 100000, seconds: 1, sampleRate: rate}
  ), {sampleRate: rate});
  const shiftWarnings = M.applySoundingOffsets(groups, offsets, "pitch");
  if (onProgress) onProgress(0.7);
  const bytes = M.makeMidi(result, {offsets});
  const sq = result.seq, ppq = sq.ppq;
  const tm = sq.tempoMap && sq.tempoMap.length ? sq.tempoMap : [{tick: 0, usq: 500000}];
  const secAt = tick => { let sec = 0; for (let i = 0; i < tm.length; i++) { const next = i + 1 < tm.length ? Math.min(tm[i + 1].tick, tick) : tick; if (next > tm[i].tick) sec += (next - tm[i].tick) / ppq * tm[i].usq / 1e6; if (tick <= (i + 1 < tm.length ? tm[i + 1].tick : Infinity)) break; } return sec; };
  const endTick = Math.max(sq.loop ? sq.loop.end : 0, ...result.notes.map(n => n.endTick || n.tick));
  const ts = sq.timeSigs && sq.timeSigs[0] || {num: 4, den: 4};
  const beatTicks = ppq * 4 / ts.den, barBeats = ts.num;
  const bq = tick => { const b = tick / beatTicks; return [Math.floor(b / barBeats) + 1, Math.round((b - Math.floor(b / barBeats) * barBeats) * 4) / 4 + 1]; };
  const loops = !!sq.loop;
  if (onProgress) onProgress(1);
  return {bytes, bpm: Math.round(6e7 / tm[0].usq * 100) / 100, secs: secAt(endTick), looped: loops, snapped: true,
          loopAnchor: loops && sq.loop.start > 0 ? bq(sq.loop.end) : null, loopTarget: loops && sq.loop.start > 0 ? bq(sq.loop.start) : null,
          warnings: [...(sq.warnings || []), ...shiftWarnings, ...extraWarnings]};
}
export function psfInflater() { // a PSF program is zlib-deflated: the browser's inflater, or null (node:zlib in the vm tests)
  return typeof DecompressionStream !== "undefined" && typeof Response !== "undefined" && typeof Blob !== "undefined"
    ? async b => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer())
    : null;
}
// where a track's console file lives in the archive
export async function chipModules(kind, importFn) { // importFn: test-only override of real dynamic import() (tests/night-roll.test.mjs — no real file can be made to fail once then succeed)
  kind = kind || "nsf";
  chipModules.cache = chipModules.cache || {};
  if (!chipModules.cache[kind]) {
    const c = CHIPS[kind];
    const doImport = importFn || (path => import(path));
    // WebKit's own failure ("Importing a module script failed.") names
    // nothing — an iPad black-screen on FFX "Challenge" traced back to this
    // (Josh, 2026-09-30) with no file to blame. Name the path in the rethrow;
    // an optional file ("?" prefix — a renderer not shipped yet) still falls
    // back to {} silently, same as before. A rejection here never reaches
    // chipModules.cache[kind] below (the throw skips that assignment), so a
    // failed import is retried fresh next time, never cached as broken.
    // One retry, INLINE, with a fresh buster (2026-09-30, Aeon Battle crash —
    // open-items.md "2026-09-30 21:40": after the crash, EVERY console song
    // failed "Importing a module script failed" ×3 until a full app restart —
    // the content process was still recovering, so the first import after a
    // crash fails even for a kind never involved in it; a transient failure
    // shouldn't need a restart to clear). ?v busts the Pages CDN per page
    // load too — a stale pipeline module next to a fresh index.html
    // reintroduced fixed bugs (the sync-runner fallback froze Josh's iPad tab
    // an hour after the async fix shipped) — the retry's OWN buster must
    // differ from the first attempt's, never the identical (possibly still-
    // bad) URL.
    const loadOnce = async v => {
      const loadOne = (f, opt) => { const path = "./tools/" + (opt ? f.slice(1) : f) + ".mjs" + v;
        return doImport(path).catch(err => { if (opt) return {}; throw Object.assign(new Error("couldn't load module tools/" + (opt ? f.slice(1) : f) + ".mjs: " + (err && err.name ? err.name + ": " : "") + (err && err.message || err)), {_path: path}); }); };
      const parts = await Promise.all(c.files.map(f => loadOne(f, f.startsWith("?"))));
      const shared = await Promise.all(c.shared.map(f => loadOne(f, false)));
      return {parts, shared};
    };
    let got;
    try { got = await loadOnce("?v=" + Date.now()); }
    catch (err) {
      const heap = (typeof performance !== "undefined" && performance.memory && performance.memory.usedJSHeapSize) ? " · heap " + Math.round(performance.memory.usedJSHeapSize / 1e6) + " MB" : "";
      logDebug("module load failed (" + (err._path || "?") + "): " + err.message + heap + " — retrying once");
      got = await loadOnce("?v=" + Date.now() + "-r"); // a fresh buster — never the exact same (possibly still-failing) URL
    }
    const M = Object.assign({}, ...got.parts, ...got.shared);
    for (const k of c.own) for (const part of got.parts) if (part[k]) M[k] = part[k];
    chipModules.cache[kind] = M;
  }
  return chipModules.cache[kind];
}

export async function chipRender() {
  const forKey = S.songKey;
  const src = await chipSource();
  if (!src) return false;
  // NO ensureAudio here: this runs at song load, outside any tap. Creating or
  // rebuilding the AudioContext outside a gesture is the mute-until-relaunch
  // case (Josh, 2026-09-27, a committed Chrono Trigger song silenced
  // everything). The render only makes Float32 PCM; chipBuffers() turns it
  // into AudioBuffers inside play()'s tap, on whatever context is live then.
  const kind = src.chip || "nsf";
  const secs = Math.ceil(src.secs + 1);
  const rate = CHIPS[kind].renderRate || (S.audio ? S.audio.sampleRate : 44100);
  chip.progress = 0;
  // A failure past this point (module load, emulation, render, or the memory
  // budget refusing) must not poison the NEXT song's render (Josh's iPad,
  // 2026-09-30: Challenge crashed, then FF7 — a different chip kind —
  // failed the same way until a full app restart: whatever Challenge left
  // allocated was starving later dynamic import()s). Every real throw out of
  // this function goes through chipCleanupAfterFailure first. A "stale
  // render" (superseded by a song change) is NOT a failure — those are
  // caught inline below and return false without touching anything.
  try {
    const budget = chipRenderBudget();
    if (chipWorkerAvailable()) {
      // Off the main thread when the browser can (module workers: every
      // current Safari/Chrome): the page stays fluid, the first Play after
      // opening a song no longer plays over a render, and a song change just
      // terminates the worker. The inline path below is the fallback.
      const w = await chipRenderInWorker(kind, src, secs, rate, forKey, budget);
      if (w === "stale") return false;
      if (w) { return chipPublish(forKey, kind, w.pcm, w.sampleRate, w.leadSec, w.pan, w.debug); }
      // a worker failure falls through to the inline render, once, and says so
    }
    const M = await chipModules(kind);
    const nsfParsed = CHIPS[kind].parse(M)(src.bytes, src);
    if (!M.renderApu && !M.renderSpu) return false; // no renderer for this chip (yet): synth carries the song
    // a song opened on top of this one aborts the render at its next progress
    // tick — several quick opens used to leave several renders running to the
    // end (memory, and a starved audio thread: Josh, 2026-09-27)
    const alive = () => { if (S.songKey !== forKey) throw new Error("stale render: " + forKey.split("/").pop()); };
    let res;
    try {
      res = await CHIPS[kind].run(M)(nsfParsed, src.n, secs,
        p => { alive(); chip.progress = p * 0.3; console.log("[chip] emulating " + Math.round(p * 100) + "%"); });
    } catch (err) { if (/^stale render/.test(err && err.message)) { console.log("[chip] " + err.message); return false; } throw err; }
    const {frameSec} = res;
    // song time zero = first onset (the capture's trim) — find it the same way; a sequence chip says 0 itself
    let leadSec = 0;
    if (CHIPS[kind].lead) leadSec = CHIPS[kind].lead(M, res);
    else { const ev = res.events || M.reconstruct(res.apuLog, res.frames, frameSec); leadSec = (ev.length ? Math.min(...ev.map(e => e.startFrame)) : 0) * frameSec; }
    // the memory budget (planChipRender, above): known track count + this
    // chip's own channel count (stereo-capable chips only — CHIPS[kind].stereo)
    // decide the render's OWN sample rate/channels BEFORE it allocates anything
    const tracks = chipEstimateTracks(kind, res, M);
    const canStream = !!CHIPS[kind].stream;
    const plan = planChipRender({tracks, seconds: secs, sampleRate: rate, channels: CHIPS[kind].stereo ? 2 : 1, budget, canStream});
    if (plan.refuse) throw new Error("too big for this device's memory: " + Math.round(plan.bytes / 1e6) + " MB");
    if (plan.rate !== rate || plan.mono) logDebug(songTitleOf(forKey) + ": console voice rendered at " + (plan.rate / 1000) + " kHz" + (plan.mono ? " mono" : "") + " to fit memory (~" + Math.round(plan.bytes / 1e6) + " MB)");
    if (canStream) { // chunk by chunk, straight into the kept buffers (2026-09-30: peak ≈ kept + one chunk, not ~3x — chipRenderStreamed's own comment)
      let out;
      try {
        out = await chipRenderStreamed(M, CHIPS[kind], res, {sampleRate: plan.rate,
          plan, onProgress: p => { alive(); chip.progress = 0.3 + p * 0.7; console.log("[chip] rendering " + Math.round(p * 100) + "%"); }});
      } catch (err) { if (/^stale render/.test(err && err.message)) { console.log("[chip] " + err.message); return false; } throw err; }
      if (S.songKey !== forKey) { console.log("[chip] discarded: " + forKey + " is no longer open"); return false; }
      return chipPublish(forKey, kind, out.pcm, out.sampleRate, leadSec, out.pan, {peakBytes: out.peakBytes, keptBytes: out.keptBytes, tracks, groups: out.groups});
    }
    const render = CHIPS[kind].render || ((MM, rr, o) => MM.renderApu(rr.apuLog, rr.frames, rr.frameSec, o));
    let r;
    try {
      r = await render(M, res, {sampleRate: plan.rate,
        onProgress: p => { alive(); chip.progress = 0.3 + p * 0.7; console.log("[chip] rendering " + Math.round(p * 100) + "%"); }});
    } catch (err) { if (/^stale render/.test(err && err.message)) { console.log("[chip] " + err.message); return false; } throw err; }
    if (S.songKey !== forKey) { console.log("[chip] discarded: " + forKey + " is no longer open"); return false; }
    const pcm = {}, pan = {};
    const names = CHIPS[kind].channels.length ? CHIPS[kind].channels : Object.keys(r).filter(k => chipIsPcm(r[k])); // a sequence chip names its channels per song
    // docs/streamed-render-plan.md step 0: the same tally as chip-worker.mjs's
    // tallyChipRender — peakBytes = every group `r` holds at once (one
    // non-streamed return) + any downmix copy made while its stereo original
    // is still referenced; keptBytes = what ends up in `pcm`. Cheap: sums of
    // .byteLength already in hand; chipSilent's scan already existed.
    let peakBytes = 0, keptBytes = 0;
    for (const name of names) {
      const v = r[name]; r[name] = null;
      if (!v) continue;
      const vBytes = v.l ? (v.l.byteLength + v.r.byteLength) : v.byteLength;
      peakBytes += vBytes; // held by `r` for every group at once, live or not
      if (chipSilent([v])) continue; // a voice the song never uses keeps nothing
      if (plan.mono && v.l && v.r) { // downmix ONLY what the budget needed to shrink, and only where the pan holds still
        const p = chipStaticPan(v.l, v.r);
        if (p !== null) {
          const mono = chipDownmixStatic(v.l, v.r, p);
          peakBytes += mono.byteLength; // the copy coexists with v.l/v.r until this scope ends
          pcm[name] = mono; pan[name] = p;
          keptBytes += mono.byteLength;
          continue;
        }
      }
      pcm[name] = v;
      keptBytes += vBytes;
    }
    return chipPublish(forKey, kind, pcm, r.sampleRate, leadSec, pan, {peakBytes, keptBytes, tracks, groups: names.length});
  } catch (err) {
    chipCleanupAfterFailure(kind);
    throw err;
  }
}
export function chipPublish(forKey, kind, pcm, sampleRate, leadSec, pan, debug) { // the render is in: keep it for the song it was made for
  if (S.songKey !== forKey) { console.log("[chip] discarded: " + forKey + " is no longer open"); return false; }
  if (!Object.keys(pcm).length) {
    logErr("chip render came out silent for " + forKey.split("/").pop() + " (" + CHIPS[kind].label + ") — playing synthesized voices; tell Claude the song name");
    return false;
  }
  chip.pcm = pcm; chip.pcmRate = sampleRate;
  chip.buffers = null; chip.buffersCtx = null; // built from pcm in the tap (chipBuffers), unless chipPcmToBuffers can now
  chip.pan = pan && Object.keys(pan).length ? pan : null; // per-track static pan the memory budget downmixed to mono (planChipRender/chipStaticPan)
  // docs/streamed-render-plan.md step 0 "before" measurement — one line, every
  // render, both paths (the inline fallback above and chip-worker.mjs's
  // tallyChipRender hand this same shape through w.debug): held = keptBytes
  // (what chip.pcm/chip.buffers actually keeps); peak = the most this render
  // held at once. tracks vs groups can still differ if a renderer's own
  // channelGroups call ever diverges from chipEstimateTracks's early one
  // (both call the SAME idempotent channelGroups now, so a difference here
  // is a real discrepancy worth seeing, not the stale undercount this fixed).
  if (debug) {
    const mb = n => Math.round(n / 1e6);
    const kept = Object.values(pcm);
    const stereoCount = kept.filter(v => v && v.l).length;
    const mono = stereoCount === 0 ? "mono" : stereoCount === kept.length ? "stereo" : "mixed";
    const mismatch = debug.tracks !== debug.groups ? " (estimated " + debug.tracks + ")" : "";
    logDebug(songTitleOf(forKey) + ": console audio held " + mb(debug.keptBytes) + " MB (render peak " + mb(debug.peakBytes) + " MB, " + debug.groups + " tracks" + mismatch + ", " + Math.round(sampleRate / 1000) + " kHz, " + mono + ")");
  }
  chipPcmToBuffers();
  chip.lead = leadSec;
  chip.key = forKey;
  console.log("[chip] ready: " + forKey + " — playing the console's own sound");
  return true;
}
export function chipRenderInWorker(kind, src, secs, rate, forKey, budget) {
  return new Promise(resolve => {
    if (S.chipWorker) { try { S.chipWorker.terminate(); } catch (err) { /* gone */ } S.chipWorker = null; }
    let w, workerUrl;
    try { workerUrl = new URL("tools/chip-worker.mjs?v=" + Date.now(), S.APP_BASE).href; w = new Worker(workerUrl, {type: "module"}); }
    catch (err) { chipWorkerAvailable.broken = true; console.warn("[chip] no module worker (" + workerUrl + "): " + err.message + " — rendering inline"); return resolve(null); }
    S.chipWorker = w;
    const c = CHIPS[kind];
    const watch = setInterval(() => { if (S.songKey !== forKey) { finish("stale"); } }, 250); // a song change ends the render at once
    const finish = out => { // a finished render keeps its worker (and the loaded set) for note previews; anything else ends it
      clearInterval(watch);
      if (out && out.pcm) { w.__key = forKey; resolve(out); return; }
      if (S.chipWorker === w) S.chipWorker = null; try { w.terminate(); } catch (err) { /* gone */ }
      if (out === "stale") console.log("[chip] stale render stopped: " + forKey.split("/").pop());
      resolve(out);
    };
    w.onmessage = e => {
      const m = e.data || {};
      if (m.preview) { const cb = chipPreviewPending.get(m.preview.req); chipPreviewPending.delete(m.preview.req); if (cb) cb(m.preview); return; }
      if (typeof m.progress === "number") { chip.progress = m.progress; return; }
      if (m.debug) { logDebug(m.debug); return; } // the worker's own budget-plan line (planChipRender ran in there, not here)
      if (m.error) { console.warn("[chip] worker (" + workerUrl + "): " + m.error + " — rendering inline"); return finish(null); } // this render only: a latched flag sent every later song of the session onto the main thread (FF7 froze 90 s after Challenge's failure, 2026-09-30)
      if (m.done) return finish(m.done);
    };
    w.onerror = err => { console.warn("[chip] worker failed (" + workerUrl + "): " + (err && err.message || "error") + " — rendering inline"); finish(null); }; // this render only — only a constructor that throws (no module workers at all) latches
    const bytes = src.bytes instanceof Uint8Array ? src.bytes.slice() : new Uint8Array(src.bytes).slice(); // a copy: the record keeps its own
    const libs = {}, transfer = [bytes.buffer];
    for (const [name, b] of Object.entries(src.libs || {})) { const c2 = b instanceof Uint8Array ? b.slice() : new Uint8Array(b).slice(); libs[name] = c2; transfer.push(c2.buffer); } // a set's shared library (PS1, N64)
    w.postMessage({id: forKey, kind, files: c.files, shared: c.shared || [], own: c.own || [], v: "?v=" + Date.now(), bytes, libs, n: src.n, secs, rate, budget, title: songTitleOf(forKey)}, transfer);
  });
}
