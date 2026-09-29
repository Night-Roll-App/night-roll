// Synthetic BGM + WD bytes — our own, no game data — so Square Enix's PS2
// pipeline (tools/ps2/bgm.mjs, tools/ps2/wd.mjs) is tested end to end
// without a real rip. Mirrors tools/ps2/make-test-sq.mjs's role and style.
const le16 = v => [v & 255, (v >> 8) & 255];
const le32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
const i8 = v => v < 0 ? v + 256 : v; // signed byte -> its unsigned wire representation
const ascii = s => [...s].map(c => c.charCodeAt(0));

function writeVL(v) {
  const bytes = [v & 0x7F]; v >>= 7;
  while (v > 0) { bytes.unshift((v & 0x7F) | 0x80); v >>= 7; }
  return bytes;
}

// --- BGM: track 0 is a conductor (tempo+meter, no notes); track 1 plays
// four notes exercising every note-on/off opcode variant, a pitch bend
// inside the third note, and a whole-track loop. ---
export const TEST_BGM_NOTES = [ // [tick, key, duration ticks] at ppq 48
  [0, 60, 48], [48, 60, 24], [72, 64, 48], [120, 64, 48],
];
export const TEST_BGM_LOOP = {start: 0, end: 168};
export const TEST_BGM_BEND_TICK = 96; // inside the third note (tick 72-120, key 64)

function track0Bytes() {
  const ev = [];
  ev.push(...writeVL(0), 0x08, 100);      // tempo 100bpm
  ev.push(...writeVL(0), 0x0C, 3, 4);     // time signature 3/4
  ev.push(...writeVL(0), 0x00);           // end of track
  return ev;
}

function track1Bytes() {
  const ev = [];
  let last = 0;
  const at = (tick, ...bytes) => { ev.push(...writeVL(tick - last), ...bytes); last = tick; };
  at(0, 0x20, 0);                          // program change 0
  at(0, 0x02);                             // loop begin
  at(0, 0x11, 60, 100);                    // note on, explicit key+vel
  at(48, 0x1A, 60);                        // note off, explicit key (also sets prevKey)
  at(48, 0x10);                            // note on, repeat previous key+vel (60,100)
  at(72, 0x18);                            // note off, previous key
  at(72, 0x12, 64);                        // note on, new key (64), previous vel (100)
  at(96, 0x5C, 0x00, 0x20);                // pitch bend: lsb=0, msb=0x20 -> ((0x20<<7)|0)-8192 = -4096 (-1 semitone at the assumed ±2 range)
  at(120, 0x18);                           // note off, previous key (64)
  at(120, 0x13, 90);                       // note on, previous key (64), new vel
  at(168, 0x1A, 64);                       // note off, explicit key
  at(168, 0x03);                           // loop end
  at(168, 0x00);                           // end of track
  return ev;
}

export function makeTestBGM({ppq = 48, seqID = 7, assocWDID = 7} = {}) {
  const t0 = track0Bytes(), t1 = track1Bytes();
  const header = [
    ...ascii("BGM "), ...le16(seqID), ...le16(assocWDID), 2 /* numTracks */,
    0, 0, 0, 0, 0, /* 0x09-0x0D unused */
    ...le16(ppq), ...le32(0) /* file length, filled below */,
    0, 0, 0, 0, /* 0x14 */ 0, 0, 0, 0, /* 0x18 */ 0, 0, 0, 0, /* 0x1C */
  ];
  const body = [...le32(t0.length), ...t0, ...le32(t1.length), ...t1];
  const bytes = new Uint8Array([...header, ...body]);
  const view = new DataView(bytes.buffer);
  view.setUint32(0x10, body.length, true);
  return bytes;
}

// --- WD: one instrument, three regions —
//   region0: key 0-60, a signed-byte unity-key test (raw 246 = -10 signed;
//     read unsigned this would derail to a nonsense unity key), pan 192
//     (masks to 64 = centre — the same value literal byte 64 gives)
//   region1: key 61-127 (lastRegion forces its own stored keyHigh to 0x7F),
//     pan 10 (kept as-is: VGMTrans's own >127-only pan formula would have
//     collapsed this to a flat centre; real FFX files carry values like
//     this — see tools/ps2/wd.mjs's own header comment)
//   region2: a THIRD region that does NOT reset "first", so it chains off
//     region1's already-forced keyHigh (0x7F) and lands keyLow=128 — the
//     exact degenerate shape found in a real FFX file ("Blitz Ball
//     Gamblers"), which toBank() must drop (not guess a nonsense range)
// Two 32-byte samples in the section (a silent, all-zero one-block-plus-
// end-flag VAG each — the same "silent BD still decodes" shape
// tools/ps2/make-test-sq.mjs's makeTestHD() uses).
function sample32() {
  return [...new Array(16).fill(0), 0x00, 0x01, ...new Array(14).fill(0)]; // block0: silent, not terminal; block1: silent, end-flagged
}

export function makeTestWD({unityByteSigned = -10, fineTuneByte = 0} = {}) {
  const HEADER = 0x10, PTR_TABLE = 0x20, REGION = 0x20;
  const numInstrs = 1, totalRegions = 3;
  const firstInstrPtr = PTR_TABLE + 4 * numInstrs; // right after the (1-entry) pointer table
  const sampCollOff = firstInstrPtr + totalRegions * REGION;

  const region = ({firstRegion, lastRegion, sampOffset, adsr1, adsr2, fineTune, unityByte, keyHigh, atten, pan}) => [
    (firstRegion ? 1 : 0), (lastRegion ? 2 : 0), 0, 0, // 0x00-0x03: stereo/first-last/unknown flag bytes
    ...le32(sampOffset),                              // 0x04-0x07
    ...le32(0) /* loop start: unused here, see module header */, // 0x08-0x0B
    ...le16(adsr1), ...le16(adsr2),                    // 0x0C-0x0F
    0, 0,                                              // 0x10-0x11: unnamed gap (VGMTrans's own field list skips straight from ADSR2 to Finetune)
    fineTune, unityByte, keyHigh, 0 /* unknown */, atten, pan, // 0x12-0x17
    0, 0, 0, 0, 0, 0, 0, 0,                            // 0x18-0x1F: padding to the region's own 0x20-byte stride
  ];

  const r0 = region({firstRegion: true, lastRegion: false, sampOffset: 0, adsr1: 0x80FF, adsr2: 0x1FEE, fineTune: fineTuneByte, unityByte: i8(unityByteSigned), keyHigh: 60, atten: 127, pan: 192});
  const r1 = region({firstRegion: false, lastRegion: true, sampOffset: 32, adsr1: 0x80FF, adsr2: 0x1FEE, fineTune: 0, unityByte: i8(-30), keyHigh: 90 /* forced to 0x7F by lastRegion */, atten: 100, pan: 10});
  const r2 = region({firstRegion: false, lastRegion: false, sampOffset: 32, adsr1: 0x80FF, adsr2: 0x1FEE, fineTune: 0, unityByte: i8(-30), keyHigh: 100, atten: 100, pan: 64}); // degenerate: chains off r1's forced 0x7F

  // header, padded out to PTR_TABLE (0x20): only bytes 0x00-0x0F are named
  // fields (VGMTrans's own WD.cpp never reads 0x10-0x1F); real files carry
  // the same gap before the instrument pointer table begins.
  const header = new Array(PTR_TABLE).fill(0);
  header.splice(0, 2, ...ascii("WD"));
  header[2] = 7; header[3] = 0; // id = 7 (LE u16)
  const sampSectSize = 64;
  [4, 5, 6, 7].forEach((o, i) => header[o] = le32(sampSectSize)[i]);
  [8, 9, 10, 11].forEach((o, i) => header[o] = le32(numInstrs)[i]);
  [12, 13, 14, 15].forEach((o, i) => header[o] = le32(totalRegions)[i]);

  const ptrTable = le32(firstInstrPtr);
  const samples = [...sample32(), ...sample32()];
  const bytes = new Uint8Array([...header, ...ptrTable, ...r0, ...r1, ...r2, ...samples]);
  return bytes;
}
