#!/usr/bin/env node
// tools/brand/make-icons.mjs — draws every app icon size, and the header
// mark, from one mascot sprite in docs/brand/mascots/sprites.json (Josh,
// Terminal #283: "maestro first"; named Nocturno in #285/#286). Pixel art scales only
// by whole numbers, so each size picks the largest integer scale that fits
// its safe area and centres the sprite on the app background.
//   node tools/brand/make-icons.mjs [name=Nocturno] [--ios <AppIcon.appiconset dir>]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const iosAt = args.indexOf("--ios");
const iosDir = iosAt >= 0 ? args[iosAt + 1] : null;
const name = args.find((a, i) => !a.startsWith("--") && i !== iosAt + 1) || "Nocturno";
const sprites = JSON.parse(readFileSync(new URL("../../docs/brand/mascots/sprites.json", import.meta.url), "utf8"));
const s = sprites.find(x => x.name.toLowerCase() === name.toLowerCase());
if (!s) { console.error("no mascot named " + name + " in docs/brand/mascots/sprites.json"); process.exit(1); }
const BG = "#0D1120";
const N = s.px.length;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// a square PNG: the sprite at the largest whole scale that fits `inner` px, centred
function png(size, inner) {
  const sc = Math.floor(inner / N), off = Math.floor((size - N * sc) / 2), bg = hex(BG);
  const buf = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) buf.set(bg, i * 3);
  s.px.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    const c = hex(s.pal[ch]);
    for (let j = 0; j < sc; j++) for (let i = 0; i < sc; i++) buf.set(c, ((off + y * sc + j) * size + off + x * sc + i) * 3);
  }));
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) buf.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  const table = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(size, 0); ih.writeUInt32BE(size, 4); ih[8] = 8; ih[9] = 2; // 8-bit RGB: iOS icons may not be transparent
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw, {level: 9})), chunk("IEND", Buffer.alloc(0))]);
}
// the header mark: transparent, one rect per run of a colour
function svg() {
  const rects = [];
  s.px.forEach((row, y) => { for (let x = 0; x < N;) { let r = 1; while (x + r < N && row[x + r] === row[x]) r++; if (row[x] !== ".") rects.push(`<rect x="${x}" y="${y}" width="${r}" height="1" fill="${s.pal[row[x]]}"/>`); x += r; } });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">${rects.join("")}</svg>\n`;
}

const icons = new URL("../../icons/", import.meta.url).pathname;
const out = [
  ["icon-1024.png", 1024, 880], ["icon-512.png", 512, 440], ["icon-192.png", 192, 168],
  ["apple-touch-icon.png", 180, 168], ["icon-maskable-512.png", 512, 400], // maskable: inside the 80% safe circle
];
for (const [f, size, inner] of out) { writeFileSync(join(icons, f), png(size, inner)); console.log("icons/" + f, size + "px"); }
writeFileSync(join(icons, "mark.svg"), svg()); console.log("icons/mark.svg");
if (iosDir) { writeFileSync(join(iosDir, "AppIcon-512@2x.png"), png(1024, 880)); console.log(join(iosDir, "AppIcon-512@2x.png")); }
