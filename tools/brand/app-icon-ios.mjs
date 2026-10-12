#!/usr/bin/env node
// tools/brand/app-icon-ios.mjs — one candidate from docs/brand/mascots/app-icons.json as a
// single-size iOS AppIcon.appiconset: 1024x1024 opaque PNG (sprite at the largest integer
// scale within ~80% of the square, centred on #0D1120) plus Contents.json. Zero dependencies.
//   node tools/brand/app-icon-ios.mjs <id e.g. T1> <AppIcon.appiconset dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import zlib from "node:zlib";

const [id, dirArg] = process.argv.slice(2);
if (!id || !dirArg) { console.error("usage: app-icon-ios.mjs <id> <AppIcon.appiconset dir>"); process.exit(1); }
const list = JSON.parse(readFileSync(new URL("../../docs/brand/mascots/app-icons.json", import.meta.url), "utf8"));
const s = list.find(x => x.id === id);
if (!s) { console.error("no candidate " + id); process.exit(1); }
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const SIZE = 1024, N = 24, sc = Math.floor(SIZE * 0.8 / N), off = (SIZE - N * sc) / 2;
const buf = Buffer.alloc(SIZE * SIZE * 3);
for (let i = 0; i < SIZE * SIZE; i++) buf.set(hex("#0D1120"), i * 3);
s.px.forEach((row, y) => [...row].forEach((ch, x) => {
  if (ch === ".") return;
  const c = hex(s.pal[ch]);
  for (let j = 0; j < sc; j++) for (let i = 0; i < sc; i++) buf.set(c, ((off + y * sc + j) * SIZE + off + x * sc + i) * 3);
}));
const raw = Buffer.alloc((SIZE * 3 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) buf.copy(raw, y * (SIZE * 3 + 1) + 1, y * SIZE * 3, (y + 1) * SIZE * 3);
const table = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ih = Buffer.alloc(13); ih.writeUInt32BE(SIZE, 0); ih.writeUInt32BE(SIZE, 4); ih[8] = 8; ih[9] = 2; // 8-bit RGB: no alpha
const dir = resolve(dirArg);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "AppIcon-1024.png"), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
writeFileSync(join(dir, "Contents.json"), JSON.stringify({ images: [{ filename: "AppIcon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }], info: { author: "xcode", version: 1 } }, null, 2) + "\n");
console.log(join(dir, "AppIcon-1024.png"), SIZE + "px, sprite x" + sc);
