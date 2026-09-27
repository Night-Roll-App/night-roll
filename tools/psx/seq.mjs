// Sony SEQ / SEP reader: the PS1's MIDI-shaped sequence format -> tick-
// stamped events with a tempo map and time signatures. No emulation: the
// file IS the score. Byte layouts and the SMF differences (no meta length
// byte, running status survives meta events, note-off = velocity 0) are in
// tools/psx/RESEARCH.md §1–2. Header fields are big-endian.

export function isSEQ(buf) {
  const d = new Uint8Array(buf);
  return d.length > 0x0F && d[0] === 0x70 && d[1] === 0x51 && d[2] === 0x45 && d[3] === 0x53; // "pQES"
}

// -> {kind: "seq"|"sep", sequences: [sequence]}; a SEQ yields one sequence.
// sequence: {id, ppq, tempo, tsNum, tsDen, events, endTick, tempoMap,
//            timeSigs, loop, warnings}
export function parseSEQ(buf) {
  const d = new Uint8Array(buf);
  if (!isSEQ(d)) throw new Error("not a SEQ/SEP file (no pQES magic)");
  const u16 = o => (d[o] << 8) | d[o + 1];
  const u32 = o => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
  const u24 = o => (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
  // SEQ: 32-bit version 1. SEP: 16-bit version 0, then the first block's
  // 16-bit sequence ID — a SEP whose first ID is 1 would read as a SEQ; Sony's
  // tools number from 0, so the collision does not arise in practice.
  if (u32(4) === 1) {
    const seq = header(0, u16(8), u24(0x0A), d[0x0D], d[0x0E]);
    parseScore(d, 0x0F, d.length, seq);
    return {kind: "seq", sequences: [seq]};
  }
  if (u16(4) !== 0) throw new Error("SEQ: unknown version " + u32(4).toString(16));
  const sequences = [];
  let pos = 6;
  while (pos + 13 <= d.length) {
    const size = u32(pos + 9);
    const seq = header(u16(pos), u16(pos + 2), u24(pos + 4), d[pos + 7], d[pos + 8]);
    const end = Math.min(d.length, pos + 13 + size);
    parseScore(d, pos + 13, end, seq);
    sequences.push(seq);
    pos = end;
  }
  return {kind: "sep", sequences};
}

function header(id, ppq, tempo, tsNum, tsDenPow) {
  const tsDen = 1 << tsDenPow;
  return {
    id, ppq, tempo, tsNum, tsDen,
    events: [], endTick: 0,
    tempoMap: [{tick: 0, usq: tempo}],   // microseconds per quarter
    timeSigs: [{tick: 0, num: tsNum, den: tsDen}],
    loop: null,                          // {start, end, count} ticks, CC99 20/30 + CC6
    warnings: [],
  };
}

function parseScore(d, start, end, seq) {
  let pos = start, tick = 0, status = 0;
  const {events, tempoMap, timeSigs, warnings} = seq;
  let loopStart = null, loopEnd = null, loopCount = null, lastNrpn = null;
  const need = n => { if (pos + n > end) throw new Error(`SEQ: truncated at byte ${pos}`); };
  const readVL = () => {
    let v = 0, b;
    do { need(1); b = d[pos++]; v = (v * 128) + (b & 0x7F); } while (b & 0x80);
    return v;
  };
  while (pos < end) {
    tick += readVL();
    need(1);
    if (d[pos] & 0x80) status = d[pos++];
    else if (!status) throw new Error(`SEQ: data byte 0x${d[pos].toString(16)} with no running status at ${pos}`);
    if (status === 0xFF) {
      need(1);
      const type = d[pos++];
      if (type === 0x2F) { pos++; seq.endTick = tick; return; }              // FF 2F 00
      if (type === 0x51) {                                                    // FF 51 tt tt tt
        need(3);
        tempoMap.push({tick, usq: (d[pos] << 16) | (d[pos + 1] << 8) | d[pos + 2]});
        pos += 3;
        continue;
      }
      if (type === 0x58) {                                                    // FF 58 nn dd [18 08]
        need(2);
        const num = d[pos++], den = 1 << d[pos++];
        // length undocumented: the header's rhythm is two bytes, SMF's is
        // four — take the SMF tail only when it is the conventional 24/8
        if (pos + 1 < end && d[pos] === 0x18 && d[pos + 1] === 0x08) { pos += 2; warnings.push(`4-byte time signature meta at tick ${tick}`); }
        timeSigs.push({tick, num, den});
        continue;
      }
      throw new Error(`SEQ: unknown meta 0x${type.toString(16)} at ${pos - 1}`);
    }
    const hi = status & 0xF0, ch = status & 0x0F;
    switch (hi) {
      case 0x90: { need(2); const key = d[pos++], vel = d[pos++]; events.push({tick, type: vel ? "on" : "off", ch, key, vel}); break; }
      case 0x80: { need(2); const key = d[pos++]; pos++; events.push({tick, type: "off", ch, key, vel: 0}); break; }
      case 0xA0: { need(2); events.push({tick, type: "poly", ch, key: d[pos++], value: d[pos++]}); break; }
      case 0xB0: {
        need(2);
        const ctl = d[pos++], value = d[pos++];
        events.push({tick, type: "cc", ch, ctl, value});
        if (ctl === 99) { lastNrpn = value; if (value === 20) loopStart = tick; else if (value === 30) loopEnd = tick; }
        else if (ctl === 6 && lastNrpn !== null) loopCount = value;
        break;
      }
      case 0xC0: { need(1); events.push({tick, type: "program", ch, program: d[pos++]}); break; }
      case 0xD0: { need(1); events.push({tick, type: "pressure", ch, value: d[pos++]}); break; }
      case 0xE0: { need(2); const lsb = d[pos++], msb = d[pos++]; events.push({tick, type: "bend", ch, value: ((msb << 7) | lsb) - 8192}); break; }
      default: throw new Error(`SEQ: unknown status 0x${status.toString(16)} at ${pos}`);
    }
    if (loopStart !== null && loopEnd !== null && !seq.loop) seq.loop = {start: loopStart, end: loopEnd, count: loopCount ?? 127};
  }
  warnings.push("no end-of-sequence meta; data ran out at tick " + tick);
  seq.endTick = tick;
}

// tick -> seconds through the tempo map
export function secondsAt(seq, tick) {
  const {tempoMap, ppq} = seq;
  let sec = 0;
  for (let i = 0; i < tempoMap.length; i++) {
    const cur = tempoMap[i], next = tempoMap[i + 1];
    const to = next && next.tick < tick ? next.tick : tick;
    if (to > cur.tick) sec += (to - cur.tick) / ppq * cur.usq / 1e6;
    if (!next || next.tick >= tick) break;
  }
  return sec;
}

// tick -> {bar, beat} (both 1-based; beats are quarter notes) through the
// meter map, so a 3/4 → 4/4 change keeps bar numbers honest
export function barBeat(seq, tick) {
  const {timeSigs, ppq} = seq;
  let bar = 1;
  for (let i = 0; i < timeSigs.length; i++) {
    const cur = timeSigs[i], next = timeSigs[i + 1];
    const bpb = cur.num * 4 / cur.den;
    if (next && next.tick <= tick) { bar += Math.ceil((next.tick - cur.tick) / ppq / bpb - 1e-9); continue; }
    const beats = (tick - cur.tick) / ppq;
    const into = Math.floor(beats / bpb + 1e-9);
    return {bar: bar + into, beat: beats - into * bpb + 1, beatsPerBar: bpb};
  }
  return {bar, beat: 1, beatsPerBar: 4};
}

export const bpmOf = usq => Math.round(6e7 / usq * 100) / 100;
