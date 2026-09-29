// Stage 2 for the Game Boy: APU register log -> note events, channel identity
// intact. Same event shape as tools/nsf/notes.mjs so everything downstream
// (loop detection, timing backport, bpm fit, .notes.txt, MIDI) is the NSF
// code, imported — only the chip semantics live here. Hardware facts:
// tools/gbs/RESEARCH.md §2 and §4.
import { pitchName, toNotesTxt as nsfToNotesTxt, collapseSlides,
         detectLoop, detectLoopAsync, backportTiming, fitBpm,
         lastRegisterChangeFrame, trimSustainedTail } from "../nsf/notes.mjs";
import { makeMidi as nsfMakeMidi } from "../nsf/midi-write.mjs";
import { GB_CLOCK } from "./gbs.mjs";

export { pitchName, detectLoop, detectLoopAsync, backportTiming, fitBpm,
         lastRegisterChangeFrame, trimSustainedTail };

function midiFromFreq(f) { return Math.round(69 + 12 * Math.log2(f / 440)); }

// The 32-sample wave RAM may hold one cycle of a waveform or several: two
// identical halves sound an octave up, four quarters two octaves up. That
// is a property of the bytes, not a guess — measure it. Returns 1, 2 or 4.
export function waveCycles(ram) { // ram: 32 nibbles
  for (const period of [8, 16]) {
    let same = true;
    for (let i = 0; i < 32 && same; i++) same = ram[i] === ram[(i + period) % 32];
    if (same) {
      let flat = true; // a constant table repeats at every period and is silent, not high
      for (let i = 1; i < 32 && flat; i++) flat = ram[i] === ram[0];
      return flat ? 1 : 32 / period;
    }
  }
  return 1;
}

// Reconstruct per-channel note events from the write log.
// A note begins on a TRIGGER (NRx4 bit 7) with the DAC on and an audible
// level — the Game Boy's unambiguous note-on — or when a sounding channel's
// pitch moves by a real step without retrigger (legato/arpeggio). It ends on
// the next trigger, envelope-to-zero, length expiry, DAC off, unrouting
// (NR51), or power off. The 512 Hz frame sequencer (length 256 Hz, envelope
// 64 Hz) is advanced by wall-clock time between writes, which is why the
// log carries a cycle offset per write.
export function reconstruct(apuLog, frames, frameSec) {
  const mk = (base, kind) => ({
    base, kind, on: false, dac: false, routed: true,
    len: 0, lenMax: kind === "wave" ? 256 : 64, lenEnable: false,
    volInit: 0, envDir: 0, envPace: 0, envTimer: 0, vol: 0,
    period: 0, duty: 0, level: 0, shift: 0, width: 0, div: 0, cycles: 1,
  });
  const ch = {
    pulse1: mk(0xFF10, "pulse"),
    pulse2: mk(0xFF15, "pulse"),
    wave: mk(0xFF1A, "wave"),
    noise: mk(0xFF1F, "noise"),
  };
  const waveRam = new Uint8Array(32);
  let power = false;
  const events = []; // {channel, startFrame, endFrame|null, midi, periodValue, vol, volEnd, duty, freq0, waveCycles, lfsr7}
  const open = {};   // channel -> event

  const freqOf = (c) => {
    if (c.kind === "pulse") return 131072 / (2048 - c.period);
    return 65536 / (2048 - c.period) * c.cycles; // wave: an octave below, times what the RAM holds
  };
  const levelOf = (c) => { // the 0-15 "vol" the NES events carry; wave has 4 output levels
    if (c.kind !== "wave") return c.vol;
    return [0, 15, 8, 4][c.level];
  };
  const audible = (name, c) => {
    if (!power || !c.on || !c.dac || !c.routed) return false;
    if (c.kind === "noise") return c.vol > 0 && c.shift < 14; // shifts 14-15 stop the LFSR clock
    if (c.kind === "wave") return c.level > 0;
    return c.vol > 0;
  };

  // ---- frame sequencer: length at 256 Hz, envelope at 64 Hz
  let seqStep = 0;
  const frameAt = (t) => Math.max(0, Math.min(frames, Math.round(t / frameSec)));
  const advanceTo = (t) => {
    const target = Math.floor(t * 512);
    while (seqStep < target) {
      seqStep++;
      const k = seqStep & 7;
      const frame = frameAt(seqStep / 512);
      for (const [name, c] of Object.entries(ch)) {
        if (!c.on) continue;
        let changed = false;
        if ((k & 1) === 0 && c.lenEnable && c.len > 0) {
          if (--c.len === 0) { c.on = false; changed = true; } // length expiry silences the channel
        }
        if (k === 7 && c.kind !== "wave" && c.envPace && --c.envTimer <= 0) {
          c.envTimer = c.envPace;
          const v = c.vol + (c.envDir ? 1 : -1);
          if (v >= 0 && v <= 15) { c.vol = v; changed = true; } // the envelope stops at 0 / 15
        }
        if (changed) update(name, c, frame, false);
      }
    }
  };

  const update = (name, c, frame, trigger) => {
    const isOn = audible(name, c);
    let midi = null, freq = null;
    if (isOn && c.kind !== "noise") { freq = freqOf(c); midi = midiFromFreq(freq); }
    if (isOn && c.kind === "noise") midi = c.shift; // noise "pitch" = clock shift, not a MIDI note
    const cur = open[name];
    if (cur && isOn) {
      if (trigger) {
        // Retrigger at the same pitch: a repeated note, OR a driver stepping
        // volume down by rewriting NRx2 + trigger (software fade). The
        // hardware can't tell them apart; a LOWER initial volume than the
        // note currently has reads as the fade, anything else as a new note.
        if (cur.midi === midi && c.kind !== "wave" && c.volInit < cur.volNow) {
          cur.volNow = c.volInit; cur.volEnd = c.volInit; return;
        }
      } else if (cur.midi !== midi) {
        // vibrato guard (NSF, MM2 2026-08-16): a per-frame period wobble that
        // crosses a semitone's rounding boundary is the same note singing;
        // judge against the note's starting frequency, ±70 cents
        if (c.kind !== "noise" && frame > cur.startFrame && cur.freq0 &&
            Math.abs(1200 * Math.log2(freq / cur.freq0)) < 70) return;
      } else {
        // same note, still sounding: track where its level goes (hardware
        // envelope or NR32 level walk) so playback can ramp too
        const lv = levelOf(c);
        if (lv > 0 && lv <= cur.volNow) { cur.volNow = lv; cur.volEnd = lv; }
        return;
      }
    }
    if (cur && (!isOn || trigger || cur.midi !== midi)) {
      cur.endFrame = Math.max(frame, cur.startFrame); delete open[name];
    }
    if (isOn && !open[name]) {
      const vol = levelOf(c);
      const ev = {channel: name, startFrame: frame, endFrame: null, midi, periodValue: c.period,
                  vol, volEnd: vol, volNow: vol, freq0: freq};
      if (c.kind === "pulse") ev.duty = c.duty;
      if (c.kind === "wave") ev.waveCycles = c.cycles;
      if (c.kind === "noise") ev.lfsr7 = c.width;
      open[name] = ev;
      events.push(ev);
    }
  };

  const powerOff = (frame) => {
    for (const [name, c] of Object.entries(ch)) {
      c.on = false; c.dac = false; c.vol = 0; c.volInit = 0; c.envPace = 0; c.level = 0; c.period = 0; c.len = 0; c.lenEnable = false;
      update(name, c, frame, false);
    }
  };

  for (const w of apuLog) {
    const {addr, value, frame} = w;
    advanceTo(frame * frameSec + (w.cycle || 0) / GB_CLOCK);
    if (addr === 0xFF26) { // NR52: power. Off clears every register.
      const was = power;
      power = !!(value & 0x80);
      if (was && !power) powerOff(frame);
      continue;
    }
    if (!power) continue; // registers are read-only while the APU is off
    if (addr === 0xFF25) { // NR51 panning: both bits clear = mixed nowhere
      ch.pulse1.routed = !!(value & 0x11); ch.pulse2.routed = !!(value & 0x22);
      ch.wave.routed = !!(value & 0x44); ch.noise.routed = !!(value & 0x88);
      for (const [name, c] of Object.entries(ch)) update(name, c, frame, false);
      continue;
    }
    if (addr === 0xFF24) continue; // NR50 master volume: no pitch, no onset
    if (addr >= 0xFF30 && addr <= 0xFF3F) {
      const i = (addr - 0xFF30) * 2;
      waveRam[i] = value >> 4; waveRam[i + 1] = value & 0x0F;
      const c = ch.wave;
      if (c.on) { c.cycles = waveCycles(waveRam); update("wave", c, frame, false); } // table rewritten mid-note (CGB allows it)
      continue;
    }
    for (const [name, c] of Object.entries(ch)) {
      const r = addr - c.base;
      if (r < 0 || r > 4) continue;
      if (r === 0) {
        if (c.kind === "wave") { c.dac = !!(value & 0x80); if (!c.dac) c.on = false; }
        // pulse1 sweep (NR10): applied by the renderer; the note keeps its written pitch
      } else if (r === 1) {
        if (c.kind === "pulse") c.duty = value >> 6;
        c.len = c.lenMax - (value & (c.lenMax - 1));
      } else if (r === 2) {
        if (c.kind === "wave") c.level = (value >> 5) & 3;
        else {
          c.volInit = value >> 4; c.envDir = (value >> 3) & 1; c.envPace = value & 7;
          c.dac = (value & 0xF8) !== 0;
          if (!c.dac) c.on = false;
        }
      } else if (r === 3) {
        if (c.kind === "noise") { c.shift = value >> 4; c.width = (value >> 3) & 1; c.div = value & 7; }
        else c.period = (c.period & 0x700) | value;
      } else if (r === 4) {
        if (c.kind !== "noise") c.period = (c.period & 0xFF) | ((value & 7) << 8);
        c.lenEnable = !!(value & 0x40);
        if (value & 0x80 && c.dac) { // trigger
          c.on = true;
          if (c.len === 0) c.len = c.lenMax;
          c.vol = c.volInit; c.envTimer = c.envPace || 8; // pace 0: envelope never steps
          if (c.kind === "wave") c.cycles = waveCycles(waveRam);
          update(name, c, frame, true);
          break;
        }
      }
      update(name, c, frame, false);
      break;
    }
  }
  advanceTo(frames * frameSec);
  for (const name of Object.keys(open)) open[name].endFrame = frames;
  for (const e of events) { if (e.endFrame === null) e.endFrame = frames; delete e.volNow; }
  return collapseSlides(events);
}

// GB noise "index" is the LFSR clock shift s (0-15): LFSR rate 262144/(r·2^s).
// s ≤ 3 is hiss (hat), 4-6 mid crackle (snare), 7+ low rumble (kick).
export const GB_CHANNELS = {pulse1: 0, pulse2: 1, wave: 2, noise: 9};
export function gbNoiseDrum(s) { return s <= 3 ? 42 : s <= 6 ? 38 : 35; }

export function makeMidi(events, opts) {
  return nsfMakeMidi(events, {chans: GB_CHANNELS, drum: gbNoiseDrum, ...opts});
}
export function toNotesTxt(events, opts) {
  return nsfToNotesTxt(events, {
    source: "GBS capture",
    volNote: "vN = chip level 0-15: envelope start volume on pulse/noise; wave output level 15/8/4",
    ...opts,
  });
}
