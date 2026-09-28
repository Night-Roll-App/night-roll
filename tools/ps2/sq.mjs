// Sony's stock PS2 sequenced-audio format — SQ (community name; also
// called CSL). Registered by VGMTrans's own scanner as extensions
// {"sq","hd","bd"} (settles docs/plans/ps2.md's "SQ vs bq" question: it is
// "sq" — confirmed both from VGMTrans's ScannerRegistration and from real
// Dark Cloud filenames, e.g. "7A3A3752.SQ"). Read for byte layout from
// VGMTrans's SonyPS2Seq.cpp/.h (github.com/vgmtrans/vgmtrans) — a "basically
// standard MIDI with some minor space-saving tricks" format per the
// community's own description, confirmed against real Dark Cloud .SQ bytes
// (tests/ps2-real.test.mjs): a single interleaved multi-channel event
// stream with running status, exactly PS1 SEQ's shape (tools/psx/seq.mjs),
// so this module produces a `seq` object in SEQ's own shape and the PS1
// helpers (secondsAt, barBeat, bpmOf) and note pipeline (seqNotes,
// toNotesTxt, makeMidi in tools/psx/notes.mjs) run over it unmodified —
// no new event-loop or MIDI writer here. What differs from PS1 SEQ, byte
// for byte:
//   - note-off is ONE data byte (the key; no velocity byte at all)
//   - the LAST data byte of any event may have its top bit set as a
//     "the next event has no delta-time" flag (never ambiguous: every real
//     value here — key, velocity, program, CC, pitch-bend byte — is 7-bit)
//   - the tempo meta carries one padding byte before its 3-byte value
//     (FF 51 pad tt tt tt, not PS1's FF 51 tt tt tt)
//   - no time-signature meta exists in this driver; 4/4 is assumed
//   - loop points are CC99 (NRPN MSB) value 0 = start, value 1 = end (not
//     PS1's value 20/30 through CC6); CC38 carries the loop count, 0 =
//     forever (translated to PS1's own "127 = forever" sentinel so
//     tools/psx/notes.mjs's toNotesTxt needs no PS2-specific branch)

function tagAt(d, o, str) {
  if (d.length < o + 4) return false;
  for (let i = 0; i < 4; i++) if (d[o + i] !== str.charCodeAt(i)) return false;
  return true;
}

// The Version chunk's Creator+Type is literally the bytes "IECS" + "sreV"
// on disk (VGMTrans compares them as little-endian u32s against constants
// that, read as big-endian bytes, spell "SCEI"/"Vers" — i.e. each 4-byte
// field is written in the reverse order the ASCII name suggests; matters
// only for how you read the magic, not for anything downstream).
export function isSQ(buf) {
  const d = new Uint8Array(buf);
  return tagAt(d, 0, "IECS") && tagAt(d, 4, "sreV");
}

const PPQ_DEFAULT_USQ = 500000; // 120bpm: SQ carries no header tempo field; the stream's own FF 51 (almost always at tick 0) overwrites this

export function parseSQ(buf) {
  const d = new Uint8Array(buf);
  if (!isSQ(d)) throw new Error("not an SQ file (no IECS/Vers chunk)");
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const u32 = o => view.getUint32(o, true);
  const u16 = o => view.getUint16(o, true);

  const versChunkSize = u32(8);
  let off = versChunkSize; // Hdr chunk
  if (!tagAt(d, off, "IECS") || !tagAt(d, off + 4, "uqeS")) throw new Error("SQ: no Sequ header chunk where expected");
  const hdrChunkSize = u32(off + 8);
  off += hdrChunkSize; // VGMTrans navigates by chunkSize, not by the (redundant, sometimes 0xFFFFFFFF-sentineled) *ChunkAddr fields
  if (!tagAt(d, off, "IECS") || !tagAt(d, off + 4, "idiM")) throw new Error("SQ: no Midi chunk where expected");
  const midiOffsetAddr = u32(off + 16) + off;
  const sequenceOffset = u32(midiOffsetAddr);
  const ppq = u16(midiOffsetAddr + 4);
  const eventsStart = midiOffsetAddr + sequenceOffset;

  const seq = {
    id: 0, ppq, tempo: PPQ_DEFAULT_USQ, tsNum: 4, tsDen: 4,
    events: [], endTick: 0,
    tempoMap: [{tick: 0, usq: PPQ_DEFAULT_USQ}],
    timeSigs: [{tick: 0, num: 4, den: 4}],
    loop: null,
    warnings: ["no time-signature meta in SQ: 4/4 assumed"],
  };
  parseScore(d, eventsStart, seq);
  return seq;
}

function readVL(d, pos) {
  let v = 0, b;
  do { b = d[pos++]; v = v * 128 + (b & 0x7F); } while (b & 0x80);
  return [v, pos];
}

function parseScore(d, start, seq) {
  const {events, tempoMap, warnings} = seq;
  let pos = start, tick = 0, status = 0, skipDelta = false, done = false;
  let loopStart = null, loopEnd = null, loopCount = null, sawTempoAtZero = false;
  const end = d.length;
  const need = n => { if (pos + n > end) throw new Error(`SQ: truncated at byte ${pos}`); };
  // the last data byte of an event: top bit is "next event has no delta
  // time" (never a real value bit — every field here is 7-bit at most)
  const dataByte = () => { need(1); const b = d[pos++]; skipDelta = !!(b & 0x80); return b & 0x7F; };
  while (pos < end && !done) {
    if (skipDelta) skipDelta = false;
    else { const [delta, p2] = readVL(d, pos); tick += delta; pos = p2; }
    if (pos >= end) break;
    need(1);
    let sb = d[pos];
    if (sb <= 0x7F) {
      // some SQ rips are missing their end-of-track meta; four zero bytes
      // in a row (a delta of 0 into a null status with no running status
      // yet, or simply padding) marks the end the same way VGMTrans treats it
      if (sb === 0 && pos + 4 <= end && (d[pos + 1] | d[pos + 2] | d[pos + 3]) === 0) { seq.endTick = tick; done = true; break; }
      sb = status;
    } else {
      pos++;
      if (sb !== 0xFF) status = sb;
    }
    const hi = sb & 0xF0, ch = sb & 0x0F;
    switch (hi) {
      case 0x80: { const key = dataByte(); events.push({tick, type: "off", ch, key, vel: 0}); break; }
      case 0x90: { need(1); const key = d[pos++]; const vel = dataByte(); events.push({tick, type: vel ? "on" : "off", ch, key, vel}); break; }
      case 0xB0: {
        need(1); const ctl = d[pos++]; const value = dataByte();
        events.push({tick, type: "cc", ch, ctl, value});
        if (ctl === 99) { if (value === 0) loopStart = tick; else if (value === 1) loopEnd = tick; }
        else if (ctl === 38) loopCount = value === 0 ? 127 : value; // 0 = forever; translate to PS1's sentinel
        break;
      }
      case 0xC0: { const program = dataByte(); events.push({tick, type: "program", ch, program}); break; }
      case 0xE0: { need(1); const hib = d[pos++]; const lob = dataByte(); events.push({tick, type: "bend", ch, value: ((hib << 7) | lob) - 8192}); break; }
      default:
        if (sb === 0xFF) {
          need(1);
          const type = d[pos++];
          if (type === 0x51) {
            need(4);
            const usq = ((d[pos + 1] << 16) | (d[pos + 2] << 8) | d[pos + 3]) >>> 0; // one padding byte, then the 3-byte value
            pos += 4;
            if (tick === 0 && !sawTempoAtZero) { tempoMap[0] = {tick: 0, usq}; sawTempoAtZero = true; }
            else tempoMap.push({tick, usq});
            seq.tempo = tempoMap[0].usq;
            continue;
          }
          if (type === 0x2F) { seq.endTick = tick; done = true; break; }
          warnings.push(`unknown meta 0x${type.toString(16)} at tick ${tick}: track ends here (no meta length byte to skip past it)`);
          seq.endTick = tick;
          done = true;
          break;
        }
        warnings.push(`unknown status 0x${sb.toString(16)} at tick ${tick}: track ends here`);
        seq.endTick = tick;
        done = true;
        break;
    }
  }
  if (!done && pos >= end) { warnings.push("no end-of-sequence meta; data ran out at tick " + tick); seq.endTick = tick; }
  if (loopStart !== null && loopEnd !== null) seq.loop = {start: loopStart, end: loopEnd, count: loopCount ?? 127};
}
