// VADPCM, the N64's sample codec: 9-byte frames (a header byte, scale in
// the high nibble and predictor index in the low, then 16 signed nibbles),
// predicted from the previous outputs through a codebook the bank carries
// per sample (AdpcmBook {s32 order; s32 npredictors; s16 book[8·order·
// npredictors]}). The reference is the sm64 decomp's tools/aifc_decode.c
// (readaifccodebook / my_decodeframe); the RSP ucode computes the same
// thing. Browser-clean: typed arrays only.
//
// The expanded table is the decomp's: for predictor p, row k (output k of
// the frame's 8-sample half) has `order` history columns from the book,
// then column `order` = 2048 (the residual itself, in 11-bit fixed point)
// shifted down the rows so later outputs see earlier residuals of the same
// half through the predictor. Column j of row k for j < order comes from
// book[p][j][k]; the first `order` rows of column `order` are the book's
// previous column (table[k][order] = table[k-1][order-1]).

export function expandBook(order, npredictors, book) {
  if (order < 1 || order > 8 || npredictors < 1 || npredictors > 16) throw new Error(`VADPCM book: order ${order}, ${npredictors} predictors is not a codebook`);
  if (book.length < 8 * order * npredictors) throw new Error(`VADPCM book: ${book.length} coefficients, need ${8 * order * npredictors}`);
  const W = order + 8;
  const table = new Int32Array(npredictors * 8 * W);
  for (let p = 0; p < npredictors; p++) {
    const T = (k, j) => p * 8 * W + k * W + j;
    for (let j = 0; j < order; j++) for (let k = 0; k < 8; k++) table[T(k, j)] = book[p * order * 8 + j * 8 + k];
    for (let k = 1; k < 8; k++) table[T(k, order)] = table[T(k - 1, order - 1)];
    table[T(0, order)] = 1 << 11;
    for (let k = 1; k < 8; k++) {
      let j = 0;
      for (; j < k; j++) table[T(j, k + order)] = 0;
      for (; j < 8; j++) table[T(j, k + order)] = table[T(j - k, order)];
    }
  }
  return {order, npredictors, table, W};
}

// Decode `frames` 9-byte frames at data[offset] into out (Int16Array, 16
// per frame) from a 16-sample history `state` (Int32Array(16), zeros at a
// sample's start, the loop's stored state at a loop restart). The state is
// updated in place so decoding can continue frame by frame.
export function decodeFrames(data, offset, frames, book, out, outAt = 0, state = new Int32Array(16)) {
  const {order, npredictors, table, W} = book;
  const ix = new Int32Array(16), inVec = new Int32Array(W);
  for (let f = 0; f < frames; f++) {
    const at = offset + f * 9;
    const header = at < data.length ? data[at] : 0;
    const scale = 1 << (header >> 4);
    let p = header & 0xF;
    if (p >= npredictors) p = npredictors - 1; // out-of-range predictor: the RSP reads past the book; clamp instead of reading garbage
    for (let i = 0; i < 16; i += 2) {
      const c = at + 1 + (i >> 1) < data.length ? data[at + 1 + (i >> 1)] : 0;
      ix[i] = c >> 4; ix[i + 1] = c & 0xF;
    }
    for (let i = 0; i < 16; i++) { if (ix[i] >= 8) ix[i] -= 16; ix[i] *= scale; }
    for (let half = 0; half < 2; half++) {
      const base = half === 0 ? 16 - order : 8 - order;
      for (let i = 0; i < order; i++) inVec[i] = state[base + i];
      for (let i = 0; i < 8; i++) {
        const k = half * 8 + i;
        inVec[order + i] = ix[k];
        // inner product over order + i terms, floored to 1/2048, plus the residual
        const row = p * 8 * W + i * W;
        let sum = 0;
        for (let j = 0; j < order + i; j++) sum += table[row + j] * inVec[j];
        let v = Math.trunc(sum / 2048);
        if (sum - v * 2048 < 0) v--;
        v += ix[k];
        state[k] = v;
      }
    }
    for (let i = 0; i < 16; i++) { const v = state[i]; out[outAt + f * 16 + i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v; }
  }
  return state;
}

// A whole sample: `samples` outputs (the loop's end, which is where the
// game stops reading), as Float32 in -1..1. `loop` is the bank's AdpcmLoop;
// the returned loop bounds are in samples, loopEnd == length when count is
// 0 (one-shot). The loop's stored state is not needed for a linear decode
// — it equals the history the linear pass produces (bank.test checks this
// on the real ROM) — so the sustain wraps by index.
export function decodeSample(data, offset, samples, book, loop = null) {
  const frames = Math.ceil(samples / 16);
  const pcm16 = new Int16Array(frames * 16);
  decodeFrames(data, offset, frames, book, pcm16, 0);
  const pcm = new Float32Array(samples);
  for (let i = 0; i < samples; i++) pcm[i] = pcm16[i] / 32768;
  const looping = !!(loop && loop.count !== 0 && loop.end > loop.start);
  return {pcm, loopStart: looping ? loop.start : null, loopEnd: looping ? Math.min(loop.end, samples) : samples, looping};
}
