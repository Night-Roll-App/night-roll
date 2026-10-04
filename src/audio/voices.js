import { S } from "../state.js";
import { trackGain } from "./engine.js";
import { pluckBuffer } from "./engine.js";
import { makeOsc } from "./engine.js";
import { setInfo } from "../hooks.js";
import { albumMetaFor } from "../model/provenance.js";
import { titleCompare } from "../model/catalog.js";
import { vaultFetch } from "./chip.js";
import { idbSf2Get } from "../platform/storage.js";
import { idbSf2Put } from "../platform/storage.js";
import { playGateKick } from "./transport.js";
import { logErr } from "../hooks.js";
import { scheduleClip } from "./clips.js";
import { chipActive } from "./chip.js";
import { chip } from "./chip.js";
import { chipHas } from "./chip.js";
import { trackIsDrums } from "../model/grid.js";
import { drumHit } from "./engine.js";
import { prof } from "../state.js";
import { ensureAudio } from "./engine.js";
import { audioSessionType } from "../platform/native.js";
import { met } from "./metronome.js";
import { resumeAudio } from "./engine.js";
import { openMaster } from "./engine.js";
import { chipPreviewBuffer } from "./chip.js";
import { chipNoteSlice } from "./chip-stream.js";

export function voiceType(ti) {
  if (S.song.tracks[ti] && S.song.tracks[ti].kind === "audio") return "sine"; // never sounds: the clip is the voice
  // "last track = triangle" counts MIDI tracks only, or adding an audio take
  // would silently turn the bass into a pulse
  let last = -1, count = 0;
  S.song.tracks.forEach((tr, i) => { if (tr.kind !== "audio") { last = i; count++; } });
  if (ti === last && count > 1) return "triangle"; // bass-ish
  return ti % 2 === 0 ? "square" : "square25";
}
// per-track voice override (Josh, 2026-08-15): tap the selected chip again to
// pick. "auto" = the classic NES assignment above. Persists per song+device.
// Sampled voices: FluidR3_GM per-note MP3s (vendor/soundfonts/*.json, MIT —
// see LICENSE.md there). Fetched ONLY when a track uses one (~2MB each,
// browser-cached); only the pitches the song actually plays get decoded.
export const SF_VOICES = [ // [voice id, menu label, soundfont file]
  ["sf-piano", "piano", "acoustic_grand_piano"],
  ["sf-rhodes", "electric piano", "electric_piano_1"],
  ["sf-harpsichord", "harpsichord", "harpsichord"],
  ["sf-celesta", "celesta", "celesta"],
  ["sf-musicbox", "music box", "music_box"],
  ["sf-vibes", "vibraphone", "vibraphone"],
  ["sf-marimba", "marimba", "marimba"],
  ["sf-glock", "glockenspiel", "glockenspiel"],
  ["sf-guitar", "guitar (nylon)", "acoustic_guitar_nylon"],
  ["sf-steel", "guitar (steel)", "acoustic_guitar_steel"],
  ["sf-eguitar", "electric guitar", "electric_guitar_clean"],
  ["sf-banjo", "banjo", "banjo"],
  ["sf-abass", "upright bass", "acoustic_bass"],
  ["sf-ebass", "electric bass", "electric_bass_finger"],
  ["sf-violin", "violin", "violin"],
  ["sf-viola", "viola", "viola"],
  ["sf-cello", "cello", "cello"],
  ["sf-contrabass", "contrabass", "contrabass"],
  ["sf-strings", "strings (section)", "string_ensemble_1"],
  ["sf-pizz", "pizzicato strings", "pizzicato_strings"],
  ["sf-harp", "harp", "orchestral_harp"],
  ["sf-flute", "flute", "flute"],
  ["sf-piccolo", "piccolo", "piccolo"],
  ["sf-clarinet", "clarinet", "clarinet"],
  ["sf-oboe", "oboe", "oboe"],
  ["sf-altosax", "alto sax", "alto_sax"],
  ["sf-tenorsax", "tenor sax", "tenor_sax"],
  ["sf-trumpet", "trumpet", "trumpet"],
  ["sf-trombone", "trombone", "trombone"],
  ["sf-horn", "french horn", "french_horn"],
  ["sf-tuba", "tuba", "tuba"],
  ["sf-brass", "brass section", "brass_section"],
  ["sf-organ", "church organ", "church_organ"],
  ["sf-organ2", "drawbar organ", "drawbar_organ"],
  ["sf-accordion", "accordion", "accordion"],
  ["sf-choir", "choir", "choir_aahs"],
];
export function sfPick(ids) {
  return ids.map(id => { const e = SF_VOICES.find(x => x[0] === id); return [e[0], e[1]]; });
}
// the menu shows FAMILIES first (Josh 2026-08-15: one flat list got too long),
// each opening its instruments; the flat VOICES list keeps every lookup working
export const VOICE_GROUPS = [
  ["NES / waves", [["auto", "auto (NES)"], ["square", "pulse 50%"], ["square25", "pulse 25%"],
                   ["square12", "pulse 12.5%"], ["triangle", "triangle"], ["sine", "sine"], ["sawtooth", "saw"]]],
  ["Keys & mallets", sfPick(["sf-piano", "sf-rhodes", "sf-harpsichord", "sf-celesta", "sf-musicbox", "sf-vibes", "sf-marimba", "sf-glock"])],
  ["Guitar & bass", sfPick(["sf-guitar", "sf-steel", "sf-eguitar", "sf-banjo", "sf-abass", "sf-ebass"])],
  ["Strings", sfPick(["sf-violin", "sf-viola", "sf-cello", "sf-contrabass", "sf-strings", "sf-pizz", "sf-harp"])],
  ["Winds", sfPick(["sf-flute", "sf-piccolo", "sf-clarinet", "sf-oboe", "sf-altosax", "sf-tenorsax"])],
  ["Brass", sfPick(["sf-trumpet", "sf-trombone", "sf-horn", "sf-tuba", "sf-brass"])],
  ["Organ & choir", sfPick(["sf-organ", "sf-organ2", "sf-accordion", "sf-choir"])],
];
export const VOICES = VOICE_GROUPS.flatMap(([, vs]) => vs);
// the 2026-08-15 synth patches (piano/pluck/strings/organ/bell) stay playable
// for any annotation that saved them, but the menu now offers samples instead
export const VOICE_AMP = {square: 0.5, square25: 0.5, square12: 0.5, triangle: 0.9, sine: 0.85, sawtooth: 0.33,
                   piano: 0.8, pluck: 0.9, strings: 0.42, organ: 0.5, bell: 0.6};
export const SF_NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
export function sfNoteName(p) { return SF_NOTE_NAMES[p % 12] + (Math.floor(p / 12) - 1); }
export function sfFileFor(v) {
  const e = SF_VOICES.find(x => x[0] === v);
  return e ? e[2] : null;
}
export const sfBank = {};
// file -> {raw: name->dataURI, buffers: {midi->AudioBuffer}, pending: {midi->Promise}}
export function sfEnsure(file) {
  if (!sfBank[file]) {
    const bank = sfBank[file] = {raw: null, buffers: {}, pending: {}};
    bank.load = fetch("vendor/soundfonts/" + file + ".json")
      .then(r => { if (!r.ok) throw new Error("soundfont HTTP " + r.status); return r.json(); })
      .then(m => { bank.raw = m; });
  }
  return sfBank[file];
}
export function sfDecode(file, p) { // idempotent: one async decode per (instrument, pitch)
  const bank = sfEnsure(file);
  if (bank.buffers[p] || bank.pending[p]) return bank.pending[p] || Promise.resolve();
  bank.pending[p] = bank.load.then(() => {
    const uri = bank.raw[sfNoteName(p)];
    if (!uri) return;
    const b64 = uri.slice(uri.indexOf(",") + 1);
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const dctx = sfDecodeCtx();
    if (!dctx) return; // no decoder here (the vm harness): the triangle fallback carries it
    return new Promise((res, rej) =>
      dctx.decodeAudioData(arr.buffer, b => {
        // loudness-match to the chip voices (Josh 2026-08-18: "pulse 50% is way
        // louder than a violin — almost impossible to hear at the same
        // velocity"): RMS of the sample's first half-second vs the square
        // wave's RMS at its VOICE_AMP trim (0.5). Each note self-calibrates.
        // measured as the LOUDEST 50ms window of the first second, not the
        // average: plucked sounds (nylon guitar) have a loud attack and a
        // quiet tail, and averaging over-boosted them 5× (Josh's report)
        const ch = b.getChannelData(0);
        const win = Math.max(1, Math.ceil(b.sampleRate * 0.05));
        const lim = Math.min(ch.length, Math.ceil(b.sampleRate * 1.0));
        let peakRms = 0;
        for (let start = 0; start + win <= lim; start += win) {
          let sum = 0;
          for (let i = start; i < start + win; i++) sum += ch[i] * ch[i];
          peakRms = Math.max(peakRms, Math.sqrt(sum / win));
        }
        // cap raised 3.5→8 (2026-08-18): these samples need ~10× to reach the
        // chip voices' level — 3.5 left every sampled instrument ~4× under
        // the pulses, which no fader inside 0–150% could recover
        b._norm = Math.min(8, Math.max(0.4, 0.32 / Math.max(0.02, peakRms)));
        bank.buffers[p] = b;
        res();
      }, rej));
  }).catch(() => { /* missing note or bad fetch: the triangle fallback carries it */ });
  return bank.pending[p];
}
export function sfDecodeCtx() {
  if (S.audio) return S.audio;
  if (S.sfOfflineCtx) return S.sfOfflineCtx;
  const OAC = typeof window !== "undefined" && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!OAC) return null;
  try { S.sfOfflineCtx = new OAC(1, 1, 48000); } catch (err) { return null; }
  return S.sfOfflineCtx;
}
export function trackVoice(ti) {
  const v = S.song.tracks[ti] && S.song.tracks[ti].voice;
  return v && v !== "auto" ? v : voiceType(ti);
}
export function gameVoiceId(g, inst) { return "game:" + g.vault.replace(/\/$/, "") + ":" + inst.id; }
// ------------------------------------------------ game instrument voices
// A track's voice can be an instrument from any imported game with a library (File
// → 🎛 Instruments…'s libraries): "game:<vault folder>:<instrument id>",
// e.g. "game:goldeneye-007:rare:bank@0x2D1AB8:prog63" — assigned from the
// voice & color menu's "Game instruments ›" family (buildVoiceMenu). The id
// rides the existing voice= value of the track: directive, colons and all;
// the directive parser/serializer treat it as an opaque \S+ token already.
// finalizeNotes calls gamePreloadForSong (mirrors sfPreloadForSong) to fetch
// each game voice's library + the samples its track's notes actually need;
// play() gives that a short cap wait via gameWaitForSong (mirrors
// sfWaitForSong) before the transport starts. scheduleNote renders each note
// through tools/instruments/play.mjs's playNote and caches the PCM by
// (voice, pitch, velocity bucketed to 8, duration bucketed to 50ms; an LRU
// of ~300). A missing library/instrument/sample — or one still loading —
// NEVER goes silent: it falls back to the track's auto (NES) synth voice,
// with one ⚠ per (voice, reason) logged (setInfo also feeds the ⚠ button).
// Pan: ignored here — trackGain(ti) already sits behind trackPan(ti)'s
// panner, same as every other voice (NIGHT-ROLL.md "Stereo — pan per
// track"). Drum kits: a kit instrument plays its slot at the note's pitch —
// playNote/regionFor already handle a kit's keyRegions the same as a
// melodic instrument's, so no special case is needed here.
// the album's nsf.vault back from a voice id's vault part: gameVoiceId drops a
// folder vault's trailing "/" ("goldeneye-007"); a single-file NES/GB vault
// ("tetris.nsf") never had one and is already whole
export function gameVoiceVault(idVault) { return /\.(nsf|gbs)$/i.test(idVault) ? idVault : idVault + "/"; }
export function parseGameVoice(v) { // "game:<vaultFolder>:<instId>" -> {vault, instId} | null (instId itself may carry colons/@)
  if (typeof v !== "string" || !v.startsWith("game:")) return null;
  const rest = v.slice(5), i = rest.indexOf(":");
  return i < 0 ? null : {vault: rest.slice(0, i), instId: rest.slice(i + 1)};
}
// A loaded .sf2's preset: "sf2:<slug>:<bank>:<program>" (the slug is always a plain
// slugify() token — no colons — so a strict 3-part split is enough, unlike a game
// instrument id which can carry its own colons/@ and needs the "first colon only" split above).
export function parseSf2Voice(v) {
  if (typeof v !== "string" || !v.startsWith("sf2:")) return null;
  const parts = v.slice(4).split(":");
  if (parts.length !== 3) return null;
  const bank = +parts[1], program = +parts[2];
  return Number.isFinite(bank) && Number.isFinite(program) ? {slug: parts[0], bank, program} : null;
}
export function sf2VoiceId(slug, bank, program) { return "sf2:" + slug + ":" + bank + ":" + program; }
// the default NES/sampled voice path — used directly above, and as the
// fallback (with the track's auto voice) when a game instrument can't render
export function playSynthVoice(ti, n, when, durSec, v) {
  const g = S.audio.createGain();
  g.connect(trackGain(ti));
  const end = when + durSec;
  const file = sfFileFor(v);
  if (file) { // sampled instrument: the exact recorded pitch, gated to the note length
    const buf = sfEnsure(file).buffers[n.p];
    if (buf) {
      const src = S.audio.createBufferSource();
      src.buffer = buf;
      const vel = (n.v / 127) * (buf._norm || 1); // linear dynamics × loudness-match (see sfDecode)
      g.gain.setValueAtTime(vel, when);
      g.gain.setValueAtTime(vel, Math.max(when + 0.01, end - 0.04));
      g.gain.linearRampToValueAtTime(0, end + 0.09); // release past the gate
      src.connect(g);
      src.onended = () => { try { g.disconnect(); } catch (err) {} }; // free the chain as it dies
      src.start(when);
      src.stop(end + 0.12);
      return;
    }
    sfDecode(file, n.p); // not decoded yet: ready by the next loop pass —
    v = "triangle";      // meanwhile a quiet triangle holds the line
  }
  // velocity -> amplitude LINEAR, no floor: the chip's own ratios. The old
  // 0.25 floor squashed echo voices to ~70% loudness (flams); the ^1.6
  // overcorrection exaggerated gallop accents into pumping "tremolo"
  // (Josh, back-to-back vs the real track). Linear = vol 8-vs-13 renders
  // at exactly the hardware's 0.62.
  const amp = (n.v / 127) * (VOICE_AMP[v] || 0.5);
  const f0 = 440 * Math.pow(2, (n.p - 69) / 12);
  if (v === "pluck") { // a real vibrating string, not an oscillator
    const src = S.audio.createBufferSource();
    src.buffer = pluckBuffer(n.p);
    g.gain.setValueAtTime(amp, when);
    g.gain.setValueAtTime(amp, Math.max(when + 0.01, end - 0.02));
    g.gain.linearRampToValueAtTime(0, end + 0.03);
    src.connect(g);
    src.onended = () => { try { g.disconnect(); } catch (err) {} };
    src.start(when);
    src.stop(end + 0.06);
    return;
  }
  if (v === "piano") { // struck pair, slightly detuned (beating shimmer), exponential die-away
    const o1 = makeOsc("triangle"), o2 = makeOsc("triangle");
    o1.frequency.value = f0;
    o2.frequency.value = f0 * 1.0015;
    const tau = Math.max(0.35, Math.min(2.4, durSec * 1.2));
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.006);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, amp * Math.exp(-durSec / tau)), end);
    g.gain.linearRampToValueAtTime(0, end + 0.05);
    o1.connect(g); o2.connect(g);
    o2.onended = () => { try { g.disconnect(); } catch (err) {} };
    o1.start(when); o2.start(when);
    o1.stop(end + 0.1); o2.stop(end + 0.1);
    return;
  }
  if (v === "strings") { // bowed: saw through a lowpass, slow attack, vibrato easing in
    const o = makeOsc("sawtooth");
    o.frequency.value = f0;
    const lp = S.audio.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(3200, f0 * 6);
    lp.Q.value = 0.4;
    const lfo = makeOsc("sine"), lg = S.audio.createGain();
    lfo.frequency.value = 5.2;
    lg.gain.setValueAtTime(0, when);
    lg.gain.linearRampToValueAtTime(f0 * 0.006, when + 0.35);
    lfo.connect(lg); lg.connect(o.frequency);
    const atk = Math.min(0.12, durSec * 0.3);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + atk);
    g.gain.setValueAtTime(amp, Math.max(when + atk, end - 0.06));
    g.gain.linearRampToValueAtTime(0, end + 0.02);
    o.connect(lp); lp.connect(g);
    o.onended = () => { try { g.disconnect(); lg.disconnect(); } catch (err) {} };
    o.start(when); lfo.start(when);
    o.stop(end + 0.05); lfo.stop(end + 0.05);
    return;
  }
  if (v === "bell") { // FM strike: inharmonic partial whose brightness decays fast
    const o = makeOsc("sine"), mod = makeOsc("sine"), mg = S.audio.createGain();
    o.frequency.value = f0;
    mod.frequency.value = f0 * 3.53;
    mg.gain.setValueAtTime(f0 * 2.2, when);
    mg.gain.exponentialRampToValueAtTime(f0 * 0.02, when + Math.min(1.2, durSec + 0.4));
    mod.connect(mg); mg.connect(o.frequency);
    g.gain.setValueAtTime(amp, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + Math.max(0.25, durSec));
    g.gain.linearRampToValueAtTime(0, end + 0.08);
    o.connect(g);
    o.onended = () => { try { g.disconnect(); mg.disconnect(); } catch (err) {} };
    o.start(when); mod.start(when);
    o.stop(end + 0.12); mod.stop(end + 0.12);
    return;
  }
  const o = makeOsc(v); // chip waves + organ
  o.frequency.value = f0;
  // envelope scales with the note: fixed 8ms attack + 30ms release ATE most
  // of a 50ms note (MM2 runs at 300bpm sound "cut off" — 2026-08-17); the
  // chip itself is essentially gated square, so short notes stay mostly body
  const atk = Math.min(0.008, durSec * 0.15);
  const rel = Math.min(0.03, durSec * 0.25);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(amp, when + atk);
  if (n.ve !== undefined && n.ve < n.v) {
    // the chip's software envelope: ramp to the recorded decay target —
    // flat sustains against the echo voice beat like a tremolo (Josh's
    // back-to-back vs the record, 2026-08-17); the decay is the space
    g.gain.linearRampToValueAtTime(amp * (n.ve / n.v), Math.max(when + atk, end - rel));
  } else {
    g.gain.setValueAtTime(amp, Math.max(when + atk, end - rel));
  }
  g.gain.linearRampToValueAtTime(0, end);
  o.connect(g);
  // the DEFAULT voice path — the one every no-directive composition plays.
  // The 2026-08-25 cleanup missed it: ~750 leaked gains/min while looping,
  // WebKit never prunes them (the iPad's 120->11fps decay; advisor H1)
  o.onended = () => { try { g.disconnect(); } catch (err) {} };
  o.start(when);
  o.stop(end + 0.05);
}

export const gameLibSync = new Map(); // vault folder -> {lib, samples: {hash: {rate, loop, pcm}}}, filled by gamePreloadForSong
export const sf2Sync = new Map(); // slug -> parsed font ({name, presets, samples}, tools/instruments/sf2.mjs), filled by gamePreloadForSong
// "voice|pitch|velBucket|durBucket" -> {ctx, buf: AudioBuffer} — the RENDERED
// buffer itself, same shape/eviction as chipPreviewCache: a repeated note is
// an instant replay, no re-render AND no re-copy; ctx guards a stale buffer
// across an ensureAudio() context rebuild (a fresh context can't play an old
// context's buffer)
export const gameNoteCache = new Map();
export function gameNoteBucket(vel, durSec) { // render at the bucket's own values so a cache hit is an exact repeat, not noise
  return {velB: Math.max(1, Math.min(127, Math.round(vel / 8) * 8)),
          durB: Math.max(50, Math.round((durSec * 1000) / 50) * 50)};
}
export const gameVoiceWarned = new Set(); // one ⚠ per (voice, reason) per session — a fixed connection warns again next Play
export function gameVoiceWarn(voice, why) {
  const key = voice + "|" + why;
  if (gameVoiceWarned.has(key)) return;
  gameVoiceWarned.add(key);
  if (typeof voice === "string" && voice.startsWith("sf2:")) {
    const info = parseSf2Voice(voice);
    setInfo("⚠ soundfont " + (info ? info.slug + " " + info.bank + ":" + info.program : voice) + " " + why + " — using the synth voice");
    return;
  }
  const info = parseGameVoice(voice);
  setInfo("⚠ game instrument " + (info ? info.vault + " · " + info.instId : voice) + " " + why + " — using the synth voice");
}
// {inst, samples} | {reason}: a "game:" voice's instrument (from gameLibSync) or an
// "sf2:" voice's preset (from sf2Sync, which already doubles as a play.mjs inst —
// tools/instruments/sf2.mjs) — the ONE thing scheduleGameNote actually needs, so it
// stays the one caching/scheduling function for both kinds of borrowed instrument
// (NIGHT-ROLL.md "Game instrument libraries" step 4: "reuse scheduleGameNote... by
// giving it a resolver for sf2: ids").
export function resolveVoiceInstrument(voice) {
  if (typeof voice === "string" && voice.startsWith("game:")) {
    const info = parseGameVoice(voice);
    if (!info) return {reason: "has a bad voice id"};
    const entry = gameLibSync.get(info.vault);
    if (!entry) return {reason: "couldn't load its library"};
    const inst = entry.lib.instruments.find(i => i.id === info.instId);
    if (!inst) return {reason: "instrument not found"};
    return {inst, samples: entry.samples};
  }
  if (typeof voice === "string" && voice.startsWith("sf2:")) {
    const info = parseSf2Voice(voice);
    if (!info) return {reason: "has a bad voice id"};
    const font = sf2Sync.get(info.slug);
    if (!font) return {reason: "couldn't load its soundfont"};
    const inst = font.presets.find(p => p.bank === info.bank && p.program === info.program);
    if (!inst) return {reason: "preset not found"};
    return {inst, samples: font.samples};
  }
  return {reason: "has a bad voice id"};
}
export function scheduleGameNote(ti, n, when, durSec, voice) {
  const {inst, samples, reason} = resolveVoiceInstrument(voice);
  const P = S.instPlaySync;
  if (!inst || !samples || !P) {
    gameVoiceWarn(voice, reason || "is still loading");
    playSynthVoice(ti, n, when, durSec, voiceType(ti)); // the track's own default — never silence
    return;
  }
  const {velB, durB} = gameNoteBucket(n.v, durSec);
  const key = voice + "|" + n.p + "|" + velB + "|" + durB;
  const hit = gameNoteCache.get(key);
  let buf = hit && hit.ctx === S.audio ? hit.buf : null;
  if (!buf) {
    const pcm = P.playNote(inst, samples, {key: n.p, vel: velB, hold: durB / 1000, sampleRate: S.audio.sampleRate, tail: 3});
    if (!pcm.length) { gameVoiceWarn(voice, "has no sample for that note"); playSynthVoice(ti, n, when, durSec, voiceType(ti)); return; }
    buf = S.audio.createBuffer(1, pcm.length, S.audio.sampleRate);
    buf.copyToChannel(pcm, 0);
    if (gameNoteCache.size > 300) gameNoteCache.clear();
    gameNoteCache.set(key, {ctx: S.audio, buf});
  }
  const src = S.audio.createBufferSource();
  src.buffer = buf;
  src.connect(trackGain(ti)); // pan lives on trackGain's own panner, same as every voice — never on the instrument's own pan/region.pan
  src.onended = () => { try { src.disconnect(); } catch (err) {} };
  src.start(when);
  src.stop(when + buf.length / S.audio.sampleRate + 0.05);
}

// A game: voice written before the archive-by-console reorganization
// (2026-09-29) has a vault with no console folder ("final-fantasy-7",
// "ff1.nsf") — game files then lived at the archive root. Every album's
// nsf.vault is now "<console>/<old vault>" (e.g. "ps1/final-fantasy-7/",
// "nes/ff1.nsf"), so the OLD idVault 404s against instLibrary. Never rewrite
// the annotation (Josh's picks are his) — resolve it to its album's CURRENT
// vault at read time instead: idVault itself when it already matches an
// album directly (already current, or simply unknown to instAlbums at all),
// else the vault of the instAlbums() entry whose vault, with its console
// prefix stripped, equals idVault (trailing "/" for a folder vault, the
// whole filename for a single-file one). Every caller that loads/labels/
// compares a game voice goes through this first.
export async function resolveGameVault(idVault) {
  const games = await instAlbums();
  if (games.some(g => g.vault.replace(/\/$/, "") === idVault)) return idVault;
  const hit = games.find(g => {
    const slash = g.vault.indexOf("/");
    return slash >= 0 && g.vault.slice(slash + 1).replace(/\/$/, "") === idVault;
  });
  return hit ? hit.vault.replace(/\/$/, "") : idVault;
}
// tools/instruments/play.mjs, once resolved — scheduleNote needs it synchronously
export async function instPlayerReady() { return (S.instPlaySync = S.instPlaySync || await instPlayer()); }
export function gameVoicesInSong() { // [{vault, instId, voice}] this song's tracks actually use, de-duped by voice id
  const out = [], seen = new Set();
  if (S.song) S.song.tracks.forEach(tr => {
    const info = parseGameVoice(tr.voice);
    if (info && !seen.has(tr.voice)) { seen.add(tr.voice); out.push({vault: info.vault, instId: info.instId, voice: tr.voice}); }
  });
  return out;
}
export function sf2VoicesInSong() { // [{slug, bank, program, voice}] this song's tracks actually use, de-duped by voice id
  const out = [], seen = new Set();
  if (S.song) S.song.tracks.forEach(tr => {
    const info = parseSf2Voice(tr.voice);
    if (info && !seen.has(tr.voice)) { seen.add(tr.voice); out.push({slug: info.slug, bank: info.bank, program: info.program, voice: tr.voice}); }
  });
  return out;
}
// ---------------------------------------------------- game instruments
// The instruments pulled from each published PS1/N64 game (tools/instruments/
// extract.mjs) live in the game files & instruments repo at <vault>instruments/:
// instruments.json + one WAV per sample. This sheet lists the games that have
// one, then a game's instruments by their measured name; a tap plays the
// instrument (root, fifth, octave around the keys its songs used; a kit plays
// its first slots) through tools/instruments/play.mjs — the same player the
// verification held against each driver. Step 2 of Josh's "use instruments
// from any game" (2026-09-28); assigning one to a track is step 3.
export const instLibs = new Map(), instWavs = new Map();
// the vm tests inject the module; the page imports it
export function instPlayer() { return S.instPlayModule || (S.instPlayModule = import(new URL("tools/instruments/play.mjs", S.APP_BASE).href)); }
export function instDecodeWav(u8) { // 16-bit PCM WAV → Float32Array (mono, first channel); loop points come from instruments.json
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 12, ch = 1, bits = 16;
  while (p + 8 <= u8.length) {
    const id = String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]), len = dv.getUint32(p + 4, true);
    if (id === "fmt ") { ch = dv.getUint16(p + 10, true); bits = dv.getUint16(p + 22, true); }
    if (id === "data") {
      if (bits !== 16) throw new Error("instrument sample is " + bits + "-bit; 16 expected");
      const n = Math.floor(len / 2 / ch), out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = dv.getInt16(p + 8 + i * 2 * ch, true) / 32768;
      return out;
    }
    p += 8 + len + (len & 1);
  }
  throw new Error("instrument sample has no data chunk");
}
export async function instAlbums() { // [{title, vault, songs: [[songTitle, path]] (CATALOG's own album order)}] of published albums whose game files carry an instrument library
  const out = [];
  for (const [title, songs] of Object.entries(S.CATALOG)) {
    if (!songs.length) continue;
    const meta = await albumMetaFor(songs[0][1]).catch(() => null);
    const n = meta && meta.nsf;
    if (n && typeof n.vault === "string" && INST_CHIPS.has(n.chip || "nsf")) out.push({title: meta.title || title, vault: n.vault, songs, sys: String(songs[0][1]).split("/")[1]});
  }
  return out.sort((a, b) => titleCompare(a.title, b.title));
}
// the album kinds tools/instruments/extract.mjs builds libraries for (an NES
// album.json names no chip: plain NSF is the default kind)
export const INST_CHIPS = new Set(["nsf", "gbs", "spc", "psf", "psf2", "usf"]);
// where an album's library sits in the archive — tools/instruments/model.mjs
// instrumentsFolder, the rule the extractor publishes by: a folder vault holds
// it inside ("goldeneye-007/instruments/"); a single-file vault beside the file
// under its whole name ("tetris.nsf.instruments/"), since tetris.nsf and
// tetris.gbs would collide without the extension
export function instFolder(vault) { return vault.endsWith("/") ? vault + "instruments/" : vault + ".instruments/"; }
export async function instLibrary(vault) {
  if (!instLibs.has(vault)) instLibs.set(vault, vaultFetch(instFolder(vault) + "instruments.json").then(b => JSON.parse(new TextDecoder().decode(b))));
  return instLibs.get(vault);
}
export async function instSamples(vault, lib, hashes) { // {hash: {rate, loop, pcm}} for the samples a play needs, fetched once each
  const out = {};
  for (const h of hashes) {
    const k = vault + h;
    if (!instWavs.has(k)) instWavs.set(k, vaultFetch(instFolder(vault) + lib.samples[h].file).then(instDecodeWav));
    out[h] = {rate: lib.samples[h].rate, loop: lib.samples[h].loop || null, pcm: await instWavs.get(k)};
  }
  return out;
}
export function sf2Module() { return S.sf2PlayModule || (S.sf2PlayModule = import(new URL("tools/instruments/sf2.mjs", S.APP_BASE).href)); }
export const sf2Fonts = new Map(); // slug -> Promise<parsed font> (tools/instruments/sf2.mjs's parseSf2 result), fetched/parsed once
// bytes: this device's IndexedDB first (an import, or a song that already loaded this
// font once), else the game files & instruments repo's soundfonts/<slug>.sf2 (cached
// to IndexedDB on success, same "works offline after the first load" contract as chip
// audio's vault fetch)
export async function sf2Bytes(slug) {
  const local = await idbSf2Get(slug);
  if (local) return local;
  const bytes = await vaultFetch("soundfonts/" + slug + ".sf2");
  idbSf2Put(slug, bytes).catch(() => {});
  return bytes;
}
export function sf2Font(slug) {
  if (!sf2Fonts.has(slug)) sf2Fonts.set(slug, sf2Bytes(slug).then(async b => (await sf2Module()).parseSf2(b)));
  return sf2Fonts.get(slug);
}

// kept for the first-touch hook; the preload no longer waits for it
export function sfPreloadForSong() { // warm every pitch a sampled track actually plays
  if (!S.song) return;
  S.sfPreloadPending = false;
  S.song.tracks.forEach((tr, ti) => {
    const file = sfFileFor(trackVoice(ti));
    if (!file) return;
    const ps = new Set();
    for (const n of tr.notes) if (!n.gone) ps.add(n.p);
    ps.add(69); // the preview pitch
    ps.forEach(p => sfDecode(file, p));
  });
  playGateKick();
}
export async function sfWaitForSong(capMs) { // resolve when this song's sampled pitches are decoded, or at the cap
  if (!S.song) return;
  sfPreloadForSong(); // make sure every request exists
  const waits = [];
  let name = null;
  S.song.tracks.forEach((tr, ti) => {
    const v = trackVoice(ti), file = sfFileFor(v);
    if (!file) return;
    const bank = sfBank[file];
    for (const n of tr.notes) {
      if (n.gone || bank.buffers[n.p] || !bank.pending[n.p]) continue;
      waits.push(bank.pending[n.p]);
      if (!name) name = (VOICES.find(([id]) => id === v) || [, v])[1];
    }
  });
  if (!waits.length) return;
  setInfo("loading " + name + "…");
  await Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, capMs))]);
}
export const gamePreloadTokens = new Map(); // voice -> the in-flight/settled preload promise, for gameWaitForSong to await
export function gamePreloadForSong() { // warm every game/sf2 voice's library or font this song's tracks actually use
  if (!S.song) return;
  gameVoicesInSong().forEach(({vault, instId, voice}) => {
    if (gamePreloadTokens.has(voice)) return; // already loading/loaded this session
    gamePreloadTokens.set(voice, (async () => {
      const realVault = await resolveGameVault(vault); // an old, pre-reorg vault resolves to its album's current one — gameLibSync stays keyed by the ORIGINAL vault below, so every reader (resolveVoiceInstrument) keeps finding it under the id it parsed
      const lib = await instLibrary(gameVoiceVault(realVault));
      const inst = lib.instruments.find(i => i.id === instId);
      gameLibSync.set(vault, {lib, samples: (gameLibSync.get(vault) || {}).samples || {}});
      if (!inst) return; // scheduleGameNote falls back and warns — see above
      const P = await instPlayerReady();
      const pitches = new Set([60]); // a sane default even if a track has no notes yet
      S.song.tracks.forEach(tr => { if (tr.voice === voice) for (const nn of tr.notes) if (!nn.gone) pitches.add(nn.p); });
      const hashes = new Set();
      pitches.forEach(p => { const r = P.regionFor(inst, p, 100); if (r) hashes.add(r.sample); });
      const samples = await instSamples(gameVoiceVault(realVault), lib, [...hashes]);
      const entry = gameLibSync.get(vault);
      Object.assign(entry.samples, samples);
    })().catch(err => logErr("⚠ game instrument " + voice + " didn't load: " + err.message)));
  });
  // a soundfont is one self-contained file (unlike a game library's instruments.json
  // + many separate WAVs): sf2Font already fetches-and-parses-once (every sample it
  // could need, decoded), so there is no per-pitch lazy step here — just load it and
  // remember it under its slug (+ warm instPlaySync, same as the game loop above —
  // scheduleGameNote needs it regardless of which kind of voice got it going)
  sf2VoicesInSong().forEach(({slug, voice}) => {
    if (gamePreloadTokens.has(voice)) return;
    gamePreloadTokens.set(voice, Promise.all([sf2Font(slug), instPlayerReady()]).then(([font]) => { sf2Sync.set(slug, font); })
      .catch(err => logErr("⚠ soundfont " + voice + " didn't load: " + err.message)));
  });
  playGateKick(); // the tokens exist now: ▶ waits for them
}
export async function gameWaitForSong(capMs) { // resolve when this song's game/sf2 voices are ready, or at the cap
  if (!S.song) return;
  gamePreloadForSong(); // make sure every request exists
  const voices = [...gameVoicesInSong(), ...sf2VoicesInSong()];
  const waits = voices.map(({voice}) => gamePreloadTokens.get(voice)).filter(Boolean);
  if (!waits.length) return;
  setInfo("loading " + voices.length + " instrument voice" + (voices.length === 1 ? "" : "s") + "…");
  await Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, capMs))]);
}
export function scheduleNote(ti, n, when, durSec) {
  // transport-stopped guard: a pump/chase callback already in flight when Stop
  // hit could still land here, wiring fresh gains to the master — those notes
  // sat frozen in a suspended context and fired later when a pencil preview
  // reopened it (Josh: "it just started playing, the cursor's not even moving")
  if (!S.playing && !n._preview) return;
  // never start an envelope in the past — WebAudio would skip the attack
  // ramp and slam the oscillator on at full amplitude (audible click)
  const when0 = when;
  when = Math.max(when, S.audio.currentTime + 0.003);
  // an audio clip: the bump above must ADVANCE into the file, not delay it
  // (for a note 3ms late is nothing; for a take it is drift every pass)
  if (n._clip) { scheduleClip(ti, n._clip, when, durSec - (when - when0)); return; }
  // chip audio: the buffer IS this track's sound (auto voice only) — no oscillator doubles.
  // A PREVIEW is exempt (Josh, 2026-08-29: tapping a note in an FF1 or Mega Man
  // song made no sound). Nothing is sounding underneath a tap, so there is
  // nothing to double; and the chip buffer is a whole-track render, so there
  // is no way to sound one note from it. The preview uses the synth voice.
  // …and only while chip sources are actually sounding: a render that lands
  // MID-playback (the ▶ wait gave up, or the song was already rolling) set
  // chip.key, which muted the synth here while chipStart never ran — cursor
  // moving, nothing heard, on the SNES song and on the NES song after it
  // (review, 2026-09-27). chip.srcs is what chipStart made; no srcs, synth plays.
  if (!n._preview && chipActive() && (chip.stream ? chip.stream.live : chip.srcs.length) && S.song.tracks[ti] && chipHas(S.song.tracks[ti].name) &&
      (!S.song.tracks[ti].voice || S.song.tracks[ti].voice === "auto")) return;
  // a game instrument OR a loaded soundfont's preset (assigned from the voice &
  // color menu's Game instruments/Soundfonts families) renders through
  // tools/instruments/play.mjs instead — its own function, since it neither drums
  // nor uses the oscillator/sample path below (see "game instrument voices" above scheduleNote)
  const gvoice = S.song.tracks[ti] && S.song.tracks[ti].voice;
  if (typeof gvoice === "string" && (gvoice.startsWith("game:") || gvoice.startsWith("sf2:"))) { scheduleGameNote(ti, n, when, durSec, gvoice); return; }
  if (n.ch === 9 || trackIsDrums(ti)) { drumHit(ti, n.p, when, n.v, durSec); return; }
  let v = trackVoice(ti);
  // per-note chip timbre: NSF captures carry each pulse note's duty (the
  // chip's instrument choice — 12.5% thin, 25% classic, 50% hollow; 75%
  // mirrors 25%). Honored on auto voice; an explicit voice pick overrides.
  if (n.duty !== undefined && (!S.song.tracks[ti].voice || S.song.tracks[ti].voice === "auto"))
    v = ["square12", "square25", "square", "square25"][n.duty];
  playSynthVoice(ti, n, when, durSec, v);
}
scheduleNote = prof("scheduleNote", scheduleNote); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()

export async function previewNote(ti, pitch, tick) { // tick: the tapped note's own .t, when there IS one (a roll/score tap, a pencil placement) — lets a chip tap hear the program actually playing there, not always the track's first (FF7 "You Can Hear the Cry of the Planet", 2026-09-30). Omit it for a bare pitch (piano strip, live MIDI in) — same as before.
  ensureAudio();
  // a tap is Night Roll making sound, like ▶: "playback" (audible with the iPad's silent switch
  // on — the idle "ambient" session silenced taps, Josh 2026-10-02), back to "ambient" 2 s after
  // the last tap unless something else is playing by then
  audioSessionType("playback");
  clearTimeout(previewNote.ambientTimer);
  previewNote.ambientTimer = setTimeout(() => { if (!S.playing && !S.albumRun && !document.hidden && !met.on) audioSessionType("ambient"); }, 2000);
  await resumeAudio(); // clock is frozen until the context actually runs
  openMaster(); // master may be faded out from the last stop
  const tr = S.song && S.song.tracks[ti];
  if (tr && chipActive() && chipHas(tr.name) && (!tr.voice || tr.voice === "auto") && !trackIsDrums(ti)) { // a chip song: the game's own instrument, if the worker still holds the set
    const buf = await chipPreviewBuffer(tr.name, pitch, tr.offset || 0, tick, S.song.ppq);
    if (buf) { const s = S.audio.createBufferSource(); s.buffer = buf; s.connect(trackGain(ti)); s.start(S.audio.currentTime + 0.01); return; }
    // register chips (nsf/gbs/spc): chipPreviewBuffer above always comes back
    // null — no per-note renderer, a register log has no note to re-render
    // (tools/chip-worker.mjs's own comment). But each track IS one hardware
    // voice, monophonic, so the song's own rendered track buffer already
    // holds exactly this note's sound — slice it instead of the generic
    // synth (Josh, FF4 SNES "Cry in Sorrow (part 1)", 2026-09-30: "tapping a
    // note plays the generic synth, not the game sound").
    const slice = chipNoteSlice(tr, pitch, tick);
    if (slice) {
      const src = S.audio.createBufferSource();
      src.buffer = slice.buf;
      const g = S.audio.createGain(); // ~5ms fade in/out: a slice starts/ends mid-waveform, not at a zero-crossing
      const when = S.audio.currentTime + 0.01;
      const fade = Math.min(0.005, slice.dur / 2);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(1, when + fade);
      g.gain.setValueAtTime(1, Math.max(when + fade, when + slice.dur - fade));
      g.gain.linearRampToValueAtTime(0, when + slice.dur);
      src.connect(g);
      // same path chipStart uses from here down: [chip.pan panner, if this
      // track was downmixed to mono] -> trackGain(ti), so volume/pan/mute match playback
      let node = g;
      if (chip.pan && chip.pan[tr.name] !== undefined && S.audio.createStereoPanner) { const p = S.audio.createStereoPanner(); p.pan.value = chip.pan[tr.name]; g.connect(p); node = p; }
      node.connect(trackGain(ti));
      src.onended = () => { try { src.disconnect(); g.disconnect(); if (node !== g) node.disconnect(); } catch (err) {} };
      src.start(when, slice.offset, slice.dur); // a lone extra source — never touches chip.srcs, so a tap mid-playback can't fight the playing sources
      return;
    }
  }
  scheduleNote(ti, {p: pitch, v: 90, ch: 0, _preview: true}, S.audio.currentTime + 0.01, 0.3);
}
