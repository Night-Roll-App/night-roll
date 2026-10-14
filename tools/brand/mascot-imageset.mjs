#!/usr/bin/env node
// tools/brand/mascot-imageset.mjs — one candidate from docs/brand/mascots/app-icons.json as an
// in-app Xcode image set: a transparent PNG (24×24 sprite at an integer scale, no background),
// so the mascot can stand in a header (Josh, Terminal #458). Zero dependencies.
//   node tools/brand/mascot-imageset.mjs <id e.g. G6> <Mascot.imageset dir> [scale=8]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import zlib from "node:zlib";

const [id, dirArg, scArg] = process.argv.slice(2);
if (!id || !dirArg) { console.error("usage: mascot-imageset.mjs <id> <Mascot.imageset dir> [scale]"); process.exit(1); }
const list = JSON.parse(readFileSync(new URL("../../docs/brand/mascots/app-icons.json", import.meta.url), "utf8"));
const s = list.find(x => x.id === id);
if (!s) { console.error("no candidate " + id); process.exit(1); }
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const N = 24, sc = Number(scArg) || 8, SIZE = N * sc;
const buf = Buffer.alloc(SIZE * SIZE * 4); // transparent
s.px.forEach((row, y) => [...row].forEach((ch, x) => {
  if (ch === ".") return;
  const c = [...hex(s.pal[ch]), 255];
  for (let j = 0; j < sc; j++) for (let i = 0; i < sc; i++) buf.set(c, ((y * sc + j) * SIZE + x * sc + i) * 4);
}));
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) buf.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
const table = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ih = Buffer.alloc(13); ih.writeUInt32BE(SIZE, 0); ih.writeUInt32BE(SIZE, 4); ih[8] = 8; ih[9] = 6; // 8-bit RGBA
const dir = resolve(dirArg);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "mascot.png"), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
writeFileSync(join(dir, "Contents.json"), JSON.stringify({ images: [{ filename: "mascot.png", idiom: "universal" }], info: { author: "xcode", version: 1 }, properties: { "template-rendering-intent": "original" } }, null, 2) + "\n");
console.log(join(dir, "mascot.png"), SIZE + "px, sprite x" + sc);
