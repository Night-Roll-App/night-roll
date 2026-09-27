// Stage 2 for VGM: register log -> note events per channel, channel identity
// intact. Discovery-mode rules as in tools/nsf/notes.mjs: pitch, time,
// duration, channel, loudness as the chip states it. Nothing interpretive.
//
// Events use the NSF event shape so the shared helpers apply, with the
// 44100 Hz sample as the "frame": {channel, startFrame, endFrame, midi,
// vel, velEnd, label?, drum?, ...}. frameSec = 1/44100.
import { snapBeat } from "../nsf/midi-write.mjs";
import { pitchName } from "../nsf/notes.mjs";
import { SAMPLE_RATE, YM2612_NTSC, SN76489_NTSC } from "./vgm.mjs";
export { pitchName };

export const FRAME_SEC = 1 / SAMPLE_RATE;
// chip order for output: FM 1-6, PSG 1-3, then the unpitched pair
export const CHANNEL_ORDER = ["fm1", "fm2", "fm3", "fm4", "fm5", "fm6", "psg1", "psg2", "psg3", "noise", "dac"];

export function fmFreq(fnum, block, clock = YM2612_NTSC) {
  return fnum * clock / (144 * 2 ** (21 - block));
}
export function psgFreq(period, clock = SN76489_NTSC) {
  return clock / (32 * (period || 1024)); // period 0 counts as 1024 on the Genesis PSG
}
const midiFromFreq = f => Math.round(69 + 12 * Math.log2(f / 440));
const cents = (f, f0) => Math.abs(1200 * Math.log2(f / f0));

// operator index (0..3 = op1..op4) for register slot k (address + 4k):
// the bus order is op1, op3, op2, op4 — swap this and carriers go wrong
const SLOT_OP = [0, 2, 1, 3];
// carrier operators per algorithm (Sega2 diagrams)
export const CARRIERS = [[3], [3], [3], [3], [1, 3], [1, 2, 3], [1, 2, 3], [0, 1, 2, 3]];

// TL (0.75 dB/step, 0 loudest) of the carriers -> MIDI velocity. Carriers
// add, so sum their amplitudes; sqrt because players apply a square-law
// velocity curve; clamp so four carriers at TL 0 don't exceed 127.
export function fmVelocity(tls, alg) {
  let amp = 0;
  for (const op of CARRIERS[alg & 7]) amp += 10 ** (-0.75 * tls[op] / 20);
  return Math.max(1, Math.min(127, Math.round(127 * Math.sqrt(Math.min(1, amp)))));
}
// PSG attenuation (2 dB/step, 15 = off) -> velocity, same curve
export function psgVelocity(att) {
  if (att >= 15) return 0;
  return Math.max(1, Math.round(127 * Math.sqrt(10 ** (-2 * att / 20))));
}

// GM drum numbers for the unpitched channels — a rendering choice, not a
// fact; .notes.txt keeps the raw label (N<rate><w|p>, DAC)
function noiseDrum(ctrl) { return [42, 38, 35, 38][ctrl & 3]; } // hat / snare / kick / tone-3 driven
const DAC_DRUM = 36;

export function reconstruct(vgm, opts = {}) {
  const ymClock = vgm.clocks.ym2612 || YM2612_NTSC;
  const psgClock = vgm.clocks.psg || SN76489_NTSC;
  const endT = opts.endSample ?? vgm.endSample;
  const events = [];
  const open = {};

  const close = (name, t) => {
    const cur = open[name];
    if (!cur) return;
    cur.endFrame = t;
    delete open[name];
  };
  const start = (name, t, ev) => {
    close(name, t);
    open[name] = {channel: name, startFrame: t, endFrame: null, velEnd: null, ...ev};
    events.push(open[name]);
  };

  // ---- YM2612 ------------------------------------------------------------
  const fm = [];
  for (let c = 0; c < 6; c++) fm.push({slots: 0, fnum: 0, block: 0, latch: 0, alg: 0, tl: [127, 127, 127, 127]});
  let ch3mode = 0, dacOn = false;
  const fmName = c => "fm" + (c + 1);
  const fmPitch = (c) => {
    const s = fm[c];
    if (!s.fnum) return null;
    const freq = fmFreq(s.fnum, s.block, ymClock);
    return {freq, midi: midiFromFreq(freq)};
  };
  const fmOnset = (c, t) => {
    const s = fm[c], p = fmPitch(c);
    if (!p) return; // Fnum 0 keys a DC level, not a note
    start(fmName(c), t, {
      midi: p.midi, freq0: p.freq, fnum: s.fnum, block: s.block, alg: s.alg,
      tl: Math.min(...CARRIERS[s.alg].map(op => s.tl[op])),
      vel: fmVelocity(s.tl, s.alg),
      special: c === 2 && ch3mode === 1 ? true : undefined, // op4's pitch reported; ops 1-3 may differ
    });
  };
  const fmPitchWrite = (c, t) => { // latched Fnum landed: vibrato, setup, or a real step
    const name = fmName(c), cur = open[name];
    if (!cur) return;
    const p = fmPitch(c);
    if (!p) { close(name, t); return; }
    if (t === cur.startFrame) { Object.assign(cur, {midi: p.midi, freq0: p.freq, fnum: fm[c].fnum, block: fm[c].block}); return; }
    if (p.midi === cur.midi || cents(p.freq, cur.freq0) < 70) return;
    fmOnset(c, t);
    open[name].legato = true; // pitch moved without a re-key: envelope not restarted
  };
  const fmLevelWrite = (c, t) => {
    const name = fmName(c), cur = open[name], s = fm[c];
    if (!cur) return;
    const vel = fmVelocity(s.tl, s.alg);
    if (t === cur.startFrame) { cur.vel = vel; cur.tl = Math.min(...CARRIERS[s.alg].map(op => s.tl[op])); return; }
    // a carrier fading under a held note (software release / song fade)
    if (vel < (cur.velEnd ?? cur.vel)) cur.velEnd = vel;
  };
  const ymWrite = (port, addr, value, t) => {
    if (port === 0) {
      if (addr === 0x27) { ch3mode = value >> 6; return; }
      if (addr === 0x2B) {
        const on = !!(value & 0x80);
        if (on && !dacOn) close("fm6", t); // channel 6 hands its output to the DAC
        dacOn = on;
        return;
      }
      if (addr === 0x28) {
        const code = value & 7;
        if (code === 3 || code === 7) return;
        const c = code < 3 ? code : code - 1;
        const s = fm[c], slots = value >> 4;
        if (slots && !s.slots) { if (!(c === 5 && dacOn)) fmOnset(c, t); }
        else if (!slots && s.slots) close(fmName(c), t);
        s.slots = slots;
        return;
      }
    }
    const c = (addr & 3);
    if (c === 3 || addr < 0x30) return;
    const ch = port * 3 + c, s = fm[ch];
    if (addr >= 0x40 && addr <= 0x4E) { s.tl[SLOT_OP[(addr >> 2) & 3]] = value & 0x7F; fmLevelWrite(ch, t); return; }
    if (addr >= 0xA0 && addr <= 0xA2) { // low byte commits the latched block/high bits
      s.fnum = ((s.latch & 7) << 8) | value;
      s.block = (s.latch >> 3) & 7;
      fmPitchWrite(ch, t);
      return;
    }
    if (addr >= 0xA4 && addr <= 0xA6) { s.latch = value; return; }
    if (addr >= 0xB0 && addr <= 0xB2) { s.alg = value & 7; return; }
  };

  // ---- SN76489 -----------------------------------------------------------
  const tone = [0, 1, 2].map(() => ({period: 0, att: 15}));
  const noise = {ctrl: 0, att: 15};
  let latch = {ch: 0, type: 1};
  let pending = null; // a tone latch byte whose data byte may still follow (same write pair)
  const psgName = c => "psg" + (c + 1);
  const toneUpdate = (c, t) => {
    const name = psgName(c), s = tone[c], cur = open[name];
    const isOn = s.att < 15 && (s.period >= 8 || s.period === 0); // ≥8: below ~14 kHz, the NES pulse guard's spirit
    let midi = null, freq = null;
    if (isOn) { freq = psgFreq(s.period, psgClock); midi = midiFromFreq(freq); }
    if (cur && isOn && midi !== cur.midi && t > cur.startFrame && cents(freq, cur.freq0) < 70) return;
    if (cur && isOn && midi !== cur.midi && t === cur.startFrame) { cur.midi = midi; cur.freq0 = freq; cur.period = s.period; return; }
    if (cur && (!isOn || cur.midi !== midi)) close(name, t);
    if (isOn && !open[name]) start(name, t, {midi, freq0: freq, period: s.period, att: s.att, vel: psgVelocity(s.att)});
  };
  const toneLevel = (c, t) => {
    const name = psgName(c), cur = open[name];
    toneUpdate(c, t);
    const now = open[name];
    if (!now || now !== cur) return;
    const vel = psgVelocity(tone[c].att);
    // software attack: the loudest level within the first 50 ms is the note's
    // velocity; anything quieter after that is its decay target
    if (t - now.startFrame <= 0.05 * SAMPLE_RATE) { if (vel > now.vel) { now.vel = vel; now.att = tone[c].att; } }
    else if (vel < (now.velEnd ?? now.vel)) now.velEnd = vel;
  };
  const noiseHit = (t) => start("noise", t, {
    midi: null, drum: noiseDrum(noise.ctrl), ctrl: noise.ctrl,
    label: "N" + (noise.ctrl & 3) + (noise.ctrl & 4 ? "w" : "p"),
    att: noise.att, vel: psgVelocity(noise.att),
  });
  const flushPending = () => {
    if (!pending) return;
    const {ch, t} = pending;
    pending = null;
    toneUpdate(ch, t);
  };
  const psgWrite = (value, t) => {
    if (value & 0x80) {
      flushPending();
      const ch = (value >> 5) & 3, type = (value >> 4) & 1, data = value & 15;
      latch = {ch, type};
      if (type) {
        if (ch < 3) { tone[ch].att = data; toneLevel(ch, t); }
        else {
          const was = noise.att < 15;
          noise.att = data;
          if (!was && data < 15) noiseHit(t);
          else if (was && data >= 15) close("noise", t);
          else if (open.noise && psgVelocity(data) < (open.noise.velEnd ?? open.noise.vel)) open.noise.velEnd = psgVelocity(data);
        }
      } else if (ch < 3) {
        tone[ch].period = (tone[ch].period & 0x3F0) | data;
        pending = {ch, t}; // wait for the high bits before judging the pitch
      } else {
        noise.ctrl = data & 7;
        if (noise.att < 15) noiseHit(t); // control write resets the LFSR: a re-attack
      }
      return;
    }
    const {ch, type} = latch;
    if (type) {
      if (ch < 3) { tone[ch].att = value & 15; toneLevel(ch, t); }
    } else if (ch < 3) {
      tone[ch].period = (tone[ch].period & 0x00F) | ((value & 0x3F) << 4);
      if (pending && pending.ch === ch) pending = null;
      toneUpdate(ch, t);
    } else {
      noise.ctrl = value & 7;
      if (noise.att < 15) noiseHit(t);
    }
  };

  for (const w of vgm.log) {
    if (w.t > endT) break;
    if (pending && (w.chip !== "psg" || (w.value & 0x80))) flushPending();
    if (w.chip === "ym") ymWrite(w.port, w.addr, w.value, w.t);
    else if (w.chip === "psg") psgWrite(w.value, w.t);
  }
  flushPending();
  for (const name of Object.keys(open)) close(name, endT);

  // ---- DAC: bursts of non-silent samples are the hits -------------------
  const GAP = Math.round(0.03 * SAMPLE_RATE), QUIET = 6;
  const dacEvents = [];
  let burst = null;
  const {t: dt, v: dv} = vgm.dac;
  for (let i = 0; i < dt.length; i++) {
    const t = dt[i];
    if (t > endT) break;
    const a = Math.abs(dv[i] - 0x80);
    if (a <= QUIET) continue;
    if (burst && t - burst.last > GAP) { burst.end = burst.last; dacEvents.push(burst); burst = null; }
    if (!burst) burst = {start: t, last: t, end: null, peak: 0};
    burst.last = t;
    if (a > burst.peak) burst.peak = a;
  }
  if (burst) { burst.end = burst.last; dacEvents.push(burst); }
  for (const s of vgm.dacStreams) {
    if (s.t > endT) continue;
    dacEvents.push({start: s.t, end: s.t + Math.max(1, s.samples), peak: s.peak});
  }
  for (const b of dacEvents) {
    events.push({
      channel: "dac", startFrame: b.start, endFrame: Math.max(b.start + 1, b.end),
      midi: null, drum: DAC_DRUM, label: "DAC", peak: b.peak, velEnd: null,
      vel: Math.max(1, Math.round(127 * Math.sqrt(b.peak / 127))),
    });
  }

  return events
    .filter(e => e.endFrame > e.startFrame)
    .sort((a, b) => a.startFrame - b.startFrame || a.channel.localeCompare(b.channel));
}

// ---- Stage 3: the repo's .notes.txt format --------------------------------
export function toNotesTxt(events, {frames, bpm, tsNum = 4, tsDen = 4, title = "vgm", snap = true, loopSample = null, gd3 = null}) {
  const frameSec = FRAME_SEC;
  const beatSec = 60 / bpm;
  const beatsPerBar = tsNum * 4 / tsDen;
  const q = snap ? snapBeat : (x => Math.round(x * 100) / 100);
  const pos = (t) => { // sample -> [bar, beat], quantized first so no "beat 5" in 4/4
    const qb = q(t * frameSec / beatSec);
    const bar = Math.floor(qb / beatsPerBar + 1e-9) + 1;
    return [bar, +(qb - (bar - 1) * beatsPerBar + 1).toFixed(2)];
  };
  const L = [];
  L.push(`# ${title} — ${tsNum}/${tsDen}, ${bpm}bpm, ${Math.ceil(frames * frameSec / (beatSec * beatsPerBar))} bars (from VGM)`);
  if (gd3 && (gd3.game || gd3.author)) L.push(`# GD3: ${[gd3.track, gd3.game, gd3.system, gd3.author].filter(Boolean).join(" — ")}`);
  if (loopSample != null) { const [b, bt] = pos(loopSample); L.push(`# loop: returns to bar ${b} beat ${bt} (sample ${loopSample})`); }
  L.push("# Format: bar N: beat pitch duration-in-quarter-notes [tlN = FM carrier total level 0-127 (0 loudest); aN = PSG attenuation 0-15 (15 off); DAC pN = peak sample amplitude 0-127]");
  L.push("# Channel identity is hardware fact. Pitches use sharp spelling; no key is stated.");
  const byChannel = {};
  for (const e of events) (byChannel[e.channel] = byChannel[e.channel] || []).push(e);
  for (const name of CHANNEL_ORDER) {
    if (!byChannel[name]) continue;
    L.push("");
    L.push(`## channel ${name}`);
    const rows = {};
    for (const e of byChannel[name]) {
      const [bar, beat] = pos(e.startFrame);
      let durBeats = q((e.endFrame - e.startFrame) * frameSec / beatSec);
      // a drum hit is a few ms of samples — quantizing it to 0 would erase
      // the hit; print it as a 16th (the MIDI writer floors the same way)
      if (durBeats <= 0 && e.midi == null) durBeats = 0.25;
      if (durBeats <= 0) continue;
      const label = e.midi == null ? e.label : pitchName(e.midi);
      const level = e.tl != null ? " tl" + e.tl : e.att != null ? " a" + e.att : e.peak != null ? " p" + e.peak : "";
      (rows[bar] = rows[bar] || []).push(beat + " " + label + " " + (+durBeats.toFixed(2)) + level);
    }
    for (const bar of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
      L.push("bar " + bar + ": " + rows[bar].join(", "));
    }
  }
  return L.join("\n") + "\n";
}
