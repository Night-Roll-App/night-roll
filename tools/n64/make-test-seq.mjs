// Builds a tiny synthetic EAD-style sequence — our own bytes laid out per
// the sm64 decomp, no game data — so the parser can be tested end to end.
//   channel 0, large notes, instrument 5: C4 E4 G4 C5 as quarters at 120,
//     a quarter rest, then a 2x loop of an eighth C4 with a 25% gate
//   channel 1, short notes, instrument 1, transposed -12: one C3 pedal
//     held for the whole 8 beats (velocity 80 via the short-note table)
// `loop: true` adds the usual song loop: a backward jump to the channel
// starts after the 8-beat delay. `abi: "oot"` emits the OoT ldlayer opcode.
// `bend: true` bends channel 1 an octave up (D3 0x7F) halfway through its
// held pedal, from the channel script — the pitch moves under a held note.
export function makeTestSeq({abi = "sm64", loop = false, bend = false} = {}) {
  const b = [], labels = {}, refs = [];
  const label = n => { labels[n] = b.length; };
  const ref = n => { refs.push([b.length, n]); b.push(0, 0); };
  const cu = v => v < 0x80 ? b.push(v) : b.push(0x80 | (v >> 8), v & 0xFF); // compressed u16
  const ldlayer = abi === "oot" ? 0x88 : 0x90;
  const EIGHT_BEATS = 48 * 8;

  // ---- sequence script (the "header": every EAD preamble looks like this)
  b.push(0xD3, 0x20);            // mute behaviour
  b.push(0xD7, 0x00, 0x03);      // init channels 0 and 1
  label("top");
  b.push(0x90); ref("ch0");      // start channel 0
  b.push(0x91); ref("ch1");      // start channel 1
  b.push(0xDD, 120);             // tempo, BPM
  b.push(0xDB, 0x7F);            // master volume
  b.push(0xFD); cu(EIGHT_BEATS);
  if (loop) { b.push(0xFB); ref("top"); }
  b.push(0xD6, 0x00, 0x03);      // free channels
  b.push(0xFF);

  // ---- channel 0
  label("ch0");
  b.push(0xC4);                  // large notes
  b.push(0xC1, 0x05);            // instrument 5
  b.push(0xDF, 0x64);            // volume
  b.push(0xDD, 0x40);            // pan
  b.push(ldlayer | 0); ref("ly0");
  b.push(0xFD); cu(EIGHT_BEATS);
  b.push(0xFF);
  label("ly0");
  for (const semi of [39, 43, 46, 51]) { b.push(semi); cu(48); b.push(100, 0); } // note0: delay, vel, gate
  b.push(0xC0); cu(48);          // rest
  b.push(0xF8, 2);               // loop 2x
  b.push(39); cu(24); b.push(80, 0x40); // eighth C4, gate 0x40 = last 25% released
  b.push(0xF7);
  b.push(0xFF);

  // ---- channel 1
  label("ch1");
  b.push(0xC3);                  // short notes (the default, stated anyway)
  b.push(0xC1, 0x01);            // instrument 1
  b.push(0xDB, 0xF4);            // transpose -12
  b.push(ldlayer | 0); ref("ly1");
  if (bend) { b.push(0xFD); cu(EIGHT_BEATS / 2); b.push(0xD3, 0x7F); b.push(0xFD); cu(EIGHT_BEATS / 2); } // D3 0x7F: 0.5 × 2^(254/127) = ×2
  else { b.push(0xFD); cu(EIGHT_BEATS); }
  b.push(0xFF);
  label("ly1");
  b.push(0xD0 | 7);              // velocity from the default short-note table: entry 7 = 76
  b.push(0xE0 | 15);             // gate from the default table: entry 15 = 0 (full length)
  b.push(39); cu(EIGHT_BEATS);   // short note0: semitone 39 - 12 = C3, 8 beats
  b.push(0xFF);

  for (const [at, n] of refs) { b[at] = labels[n] >> 8; b[at + 1] = labels[n] & 0xFF; }
  return new Uint8Array(b);
}
