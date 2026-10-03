import { S } from "../state.js";
import { trackGain } from "./engine.js";
import { pluckBuffer } from "./engine.js";
import { makeOsc } from "./engine.js";

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
