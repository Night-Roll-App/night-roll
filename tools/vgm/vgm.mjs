// VGM loader: file bytes -> a sample-timestamped register log for the two
// Genesis chips (YM2612 FM, SN76489 PSG) plus the loop point and GD3 tags.
// Unlike the NSF path there is no CPU to run: the file IS the write log.
// Format notes and sources: tools/vgm/RESEARCH.md.
//
// parseVGM(bytes) -> {version, clocks, totalSamples, loopSample, loopSamples,
//                     gd3, log, dac, dacStreams, pcm}
//   log:  [{t, chip: "ym"|"psg", port?, addr?, value}]   t in 44100 Hz samples
//   dac:  {t: Float64Array, v: Uint8Array}  every DAC sample write (compact —
//         a 3-minute drum track is ~10^6 of these; objects would not fit)
//   dacStreams: [{t, stream, peak, samples}]  0x93/0x95 stream starts
//   pcm:  the concatenated type-0 data blocks (the DAC bank)
//
// Gzip (.vgz): parseVGM refuses compressed bytes (pure sync, browser-safe);
// inflateVGM() handles both via DecompressionStream or node:zlib.

export const SAMPLE_RATE = 44100;
export const YM2612_NTSC = 7670454;
export const SN76489_NTSC = 3579545;

export function isGzip(bytes) {
  const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return d.length > 2 && d[0] === 0x1F && d[1] === 0x8B;
}

export async function inflateVGM(bytes) {
  const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!isGzip(d)) return d;
  if (typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("gzip");
    const buf = await new Response(new Blob([d]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }
  const zlib = await import("node:zlib");
  return new Uint8Array(zlib.gunzipSync(d));
}

// operand counts for commands we skip (RESEARCH.md §1): unknown chips must
// not derail the parse, and the reserved ranges have spec-fixed widths
function skipLength(cmd) {
  if (cmd >= 0x30 && cmd <= 0x3F) return 1;
  if (cmd >= 0x40 && cmd <= 0x4E) return 2;
  if (cmd === 0x4F) return 1;
  if (cmd >= 0x51 && cmd <= 0x5F) return 2;
  if (cmd === 0x64) return 3;
  if (cmd === 0x68) return 11;
  if (cmd === 0x90 || cmd === 0x91) return 4;
  if (cmd === 0x92) return 5;
  if (cmd === 0x94) return 1;
  if (cmd >= 0xA0 && cmd <= 0xBF) return 2;
  if (cmd >= 0xC0 && cmd <= 0xDF) return 3;
  if (cmd >= 0xE1) return 4;
  return null;
}

function readGd3(d, off) {
  if (!off || off + 12 > d.length) return null;
  if (String.fromCharCode(d[off], d[off + 1], d[off + 2], d[off + 3]) !== "Gd3 ") return null;
  const len = d[off + 8] | (d[off + 9] << 8) | (d[off + 10] << 16) | (d[off + 11] << 24);
  const end = Math.min(d.length, off + 12 + len);
  const fields = [];
  let s = "", i = off + 12;
  while (i + 1 < end && fields.length < 11) {
    const c = d[i] | (d[i + 1] << 8);
    i += 2;
    if (c === 0) { fields.push(s); s = ""; } else s += String.fromCharCode(c);
  }
  const [track, trackJp, game, gameJp, system, systemJp, author, authorJp, date, ripper, notes] = fields;
  return {track, trackJp, game, gameJp, system, systemJp, author, authorJp, date, ripper, notes};
}

export function parseVGM(input) {
  const d = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (isGzip(d)) throw new Error("gzipped VGM (.vgz): inflate first (inflateVGM)");
  if (String.fromCharCode(d[0], d[1], d[2], d[3]) !== "Vgm ") throw new Error("not a VGM file");
  const u32 = o => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  const version = u32(0x08);
  const dataOff = version >= 0x150 && u32(0x34) ? 0x34 + u32(0x34) : 0x40;
  // a header field only exists if it lies before the data — older files'
  // headers stop at 0x40 and anything "past" them is really command bytes
  const field = o => (o + 4 <= dataOff ? u32(o) : 0);
  const clocks = {
    psg: field(0x0C),
    // pre-1.10 files carried the YM2612 clock in the YM2413 slot
    ym2612: (version >= 0x110 ? field(0x2C) : field(0x10)) & 0x3FFFFFFF,
  };
  const gd3Off = field(0x14) ? 0x14 + field(0x14) : 0;
  const totalSamples = field(0x18);
  const loopOff = field(0x1C) ? 0x1C + field(0x1C) : 0;
  const loopSamples = field(0x20);
  const gd3 = readGd3(d, gd3Off);

  const log = [];
  const dacT = [], dacV = [];
  const dacStreams = [];
  const blocks = [];        // every data block, by type — DAC streams index them
  let pcm = new Uint8Array(0); // type-0 blocks concatenated: the DAC bank
  let pcmPos = 0;
  let t = 0, loopSample = null, ymUsed = false;
  const streams = {};      // 0x90-0x95 state per stream id
  const peakOf = (bytes, from, len) => { // loudest excursion from DAC centre 0x80
    let peak = 0;
    const end = Math.min(bytes.length, from + len);
    for (let i = from; i < end; i++) { const a = Math.abs(bytes[i] - 0x80); if (a > peak) peak = a; }
    return peak;
  };

  let i = dataOff;
  const end = gd3Off && gd3Off > dataOff ? gd3Off : d.length;
  while (i < end) {
    if (loopOff && i === loopOff) loopSample = t;
    const cmd = d[i];
    if (cmd === 0x66) break;
    if (cmd === 0x50) { log.push({t, chip: "psg", value: d[i + 1]}); i += 2; continue; }
    if (cmd === 0x52 || cmd === 0x53) {
      const port = cmd & 1, addr = d[i + 1], value = d[i + 2];
      ymUsed = true;
      if (port === 0 && addr === 0x2A) { dacT.push(t); dacV.push(value); }
      else log.push({t, chip: "ym", port, addr, value});
      i += 3; continue;
    }
    if (cmd === 0x61) { t += d[i + 1] | (d[i + 2] << 8); i += 3; continue; }
    if (cmd === 0x62) { t += 735; i += 1; continue; }
    if (cmd === 0x63) { t += 882; i += 1; continue; }
    if (cmd >= 0x70 && cmd <= 0x7F) { t += (cmd & 15) + 1; i += 1; continue; }
    if (cmd >= 0x80 && cmd <= 0x8F) {
      // stream one bank byte to the DAC, then wait n
      if (pcmPos < pcm.length) { dacT.push(t); dacV.push(pcm[pcmPos]); }
      pcmPos++;
      t += cmd & 15;
      i += 1; continue;
    }
    if (cmd === 0x67) {
      const type = d[i + 2];
      const size = u32(i + 3) & 0x7FFFFFFF;
      let start = i + 7, len = size;
      if (type >= 0x80) { start += 8; len -= 8; } // ROM dumps carry size+addr first
      const data = d.subarray(start, start + Math.max(0, len));
      blocks.push({type, data});
      if (type === 0x00) {
        const joined = new Uint8Array(pcm.length + data.length);
        joined.set(pcm, 0); joined.set(data, pcm.length);
        pcm = joined;
      }
      i += 7 + size; continue;
    }
    if (cmd === 0xE0) { pcmPos = u32(i + 1); i += 5; continue; }
    if (cmd === 0x90) { // setup: which chip/port/register the stream feeds
      const id = d[i + 1];
      streams[id] = {...(streams[id] || {}), chip: d[i + 2], port: d[i + 3], reg: d[i + 4], freq: 0, bank: 0};
      i += 5; continue;
    }
    if (cmd === 0x91) { const id = d[i + 1]; (streams[id] = streams[id] || {}).bank = d[i + 2]; i += 5; continue; }
    if (cmd === 0x92) { const id = d[i + 1]; (streams[id] = streams[id] || {}).freq = u32(i + 2); i += 6; continue; }
    if (cmd === 0x93) { // start at bank offset; length by mode
      const id = d[i + 1], s = streams[id] || {};
      const off = u32(i + 2), mode = d[i + 6], len = u32(i + 7);
      const bank = s.bank === 0 ? pcm : (blocks.find(b => b.type === s.bank) || {data: new Uint8Array(0)}).data;
      const from = off === 0xFFFFFFFF ? 0 : off;
      let n = (mode & 3) === 1 ? len : (mode & 3) === 2 && s.freq ? Math.round(len * s.freq / 1000) : bank.length - from;
      if (s.chip === 0x02 || s.chip === undefined) // 0x02 = YM2612 in the VGM chip-id table
        dacStreams.push({t, stream: id, peak: peakOf(bank, from, n), samples: s.freq ? Math.round(n * SAMPLE_RATE / s.freq) : 0});
      i += 11; continue;
    }
    if (cmd === 0x95) { // fast start: the Nth block of the stream's bank type
      const id = d[i + 1], s = streams[id] || {};
      const idx = d[i + 2] | (d[i + 3] << 8);
      const typed = blocks.filter(b => b.type === (s.bank || 0));
      const blk = typed[idx];
      if (blk && (s.chip === 0x02 || s.chip === undefined))
        dacStreams.push({t, stream: id, peak: peakOf(blk.data, 0, blk.data.length),
                         samples: s.freq ? Math.round(blk.data.length * SAMPLE_RATE / s.freq) : 0});
      i += 5; continue;
    }
    const skip = skipLength(cmd);
    if (skip === null) throw new Error(`unknown VGM command 0x${cmd.toString(16)} at 0x${i.toString(16)}`);
    i += 1 + skip;
  }
  if (!clocks.ym2612 && ymUsed) clocks.ym2612 = YM2612_NTSC; // malformed rips: assume NTSC
  if (!clocks.psg && log.some(w => w.chip === "psg")) clocks.psg = SN76489_NTSC;
  return {
    version, clocks, gd3,
    totalSamples: totalSamples || t,
    loopSample, loopSamples,
    endSample: t,
    log,
    dac: {t: Float64Array.from(dacT), v: Uint8Array.from(dacV)},
    dacStreams,
    pcm,
  };
}
