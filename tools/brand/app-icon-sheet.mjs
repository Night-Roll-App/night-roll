#!/usr/bin/env node
// tools/brand/app-icon-sheet.mjs — contact sheet for the app-icon candidates in
// docs/brand/mascots/app-icons.json: each sprite at 180 px and 60 px on the
// app background, labelled G1-G4 / T1-T4. Zero dependencies (PNG writer copied
// from make-icons.mjs).
//   node tools/brand/app-icon-sheet.mjs
import { readFileSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";

const dir = new URL("../../docs/brand/mascots/", import.meta.url);
const list = JSON.parse(readFileSync(new URL("app-icons.json", dir), "utf8"));
const BG = "#0D1120", PANEL = "#161C30", TXT = "#C7D0E8";
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const N = 24, S180 = 180, S60 = 60, PAD = 16, LABEL = 22;
const cols = 4, cellW = S180 + PAD * 2, cellH = LABEL + S180 + 10 + S60 + PAD * 2;
const W = cols * cellW, H = 2 * cellH;
const buf = Buffer.alloc(W * H * 3);
const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) buf.set(c, (y * W + x) * 3); };
const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
rect(0, 0, W, H, hex("#080B16"));

// tiny 3x5 font for labels
const F = { G: "111100101101111", T: "111010010010010", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001" };
const glyph = (ch, x, y, sc, c) => { const g = F[ch]; if (!g) return; for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r * 3 + q] === "1") rect(x + q * sc, y + r * sc, sc, sc, c); };

function icon(s, x0, y0, size) {
  rect(x0, y0, size, size, hex(BG));
  const sc = Math.floor(size / N), off = Math.floor((size - N * sc) / 2);
  s.px.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") rect(x0 + off + x * sc, y0 + off + y * sc, sc, sc, hex(s.pal[ch])); }));
}
list.forEach((s, i) => {
  const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * cellH;
  rect(cx + 4, cy + 4, cellW - 8, cellH - 8, hex(PANEL));
  const lab = s.id || "";
  [...lab].forEach((ch, k) => glyph(ch, cx + PAD + k * 16, cy + PAD, 3, hex("#E4C36A")));
  icon(s, cx + PAD, cy + PAD + LABEL, S180);
  icon(s, cx + PAD, cy + PAD + LABEL + S180 + 10, S60);
});

const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
const table = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
writeFileSync(new URL("app-icons.png", dir), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
console.log("docs/brand/mascots/app-icons.png", W + "x" + H);
