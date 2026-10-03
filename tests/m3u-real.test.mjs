// Real .m3u playlists (open-items.md "IMPORT TESTS AGAINST REAL RIPS"):
// Zophar-style rips shipped one album m3u (NES) or one m3u PER TRACK (Game
// Boy) — and the Game Boy files are Latin-1, 0-based track numbers, while
// NES files are UTF-8-compatible ASCII, 1-based. The fixtures under
// tests/fixtures/m3u/<console>-<game>/ are the REAL playlist text copied out
// of real rips (no chip bytes — CLAUDE.md: only .m3u files travel here); no
// SNES/PS1/N64 rip in hand ships an .m3u (those consoles' tags live inside
// the chip files themselves), so this corpus is NES + Game Boy, the two
// consoles that actually use the format.
//
// Every assertion below is a fact read straight off the fixture text through
// the app's own parseM3u/decodeM3u (tests/harness.mjs createApp) — nothing
// about "is this song right" is asserted, only what the playlist itself says.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./harness.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIXDIR = path.join(ROOT, "fixtures", "m3u");

const app = await createApp();
const val = (code) => JSON.parse(app.run(`JSON.stringify(${code})`));

// Mirrors openPickedFiles' merge (index.html): every picked .m3u, sorted by
// file name, parsed and concatenated in that order — one m3u for the whole
// album (NES) or one m3u per track (Game Boy) both fall out of the same code.
function loadFixture(name) {
  const dir = path.join(FIXDIR, name);
  const files = readdirSync(dir).filter((f) => /\.m3u8?$/i.test(f)).sort();
  let rows = [];
  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(path.join(dir, f)));
    const list = val(`parseM3u(decodeM3u(Uint8Array.from(${JSON.stringify([...bytes])})))`);
    rows = rows.concat(list);
  }
  return { files, rows };
}

test("fixture corpus: only .m3u files travel in the repo (no chip bytes)", () => {
  for (const name of readdirSync(FIXDIR)) {
    const dir = path.join(FIXDIR, name);
    for (const f of readdirSync(dir)) assert.match(f, /\.m3u8?$/i, `${name}/${f}`);
  }
});

// ---- NES: one m3u for the whole album, 1-based tracks, UTF-8 (plain ASCII
// in these rips, so the strict-UTF-8 branch of decodeM3u is what runs) ----

test("real rip: NES Contra — one album m3u, 1-based, decimal seconds", () => {
  const { files, rows } = loadFixture("nes-contra");
  assert.equal(files.length, 1, "one m3u for the whole album");
  assert.equal(rows.length, 11);
  assert.deepEqual(rows[0], { n: 1, title: "Title Screen", len: 5.5 });
  assert.deepEqual(rows[rows.length - 1], { n: 11, title: "Game Over", len: 6 });
  // a title with an escaped comma inside it (artist/stage list) survives whole
  assert.ok(rows.some((r) => r.title.includes(",")), "an unescaped comma made it into a title");
});

test("real rip: NES Castlevania — parenthetical subtitles, H:MM:SS lengths", () => {
  const { rows } = loadFixture("nes-castlevania");
  assert.equal(rows.length, 15);
  assert.deepEqual(rows[0], { n: 1, title: "Introduction (Castle Gate)", len: 7 });
  assert.deepEqual(rows[rows.length - 1], { n: 15, title: "Game Over", len: 5 });
  assert.ok(rows.some((r) => /\(.+\)/.test(r.title)), "a parenthetical subtitle");
});

test("real rip: NES Gimmick! — dashes in the file name, playlist order != track order", () => {
  const { rows } = loadFixture("nes-gimmick");
  assert.equal(rows.length, 20);
  // the playlist is not sorted by track number — row order is playlist order
  assert.deepEqual(rows[0], { n: 18, title: "Good Morning", len: 76 });
  assert.notDeepEqual(rows.map((r) => r.n), [...rows.map((r) => r.n)].sort((a, b) => a - b));
});

test("real rip: NES Lagrange Point — VRC7 expansion-chip set, fractional seconds", () => {
  const { rows } = loadFixture("nes-lagrange-point");
  assert.equal(rows.length, 31);
  assert.deepEqual(rows[0], { n: 1, title: "Theme of Isis", len: 104.40899999999999 }); // 1*3600+44*60+5.409 in fp
  const last = rows[rows.length - 1];
  assert.equal(last.n, 23);
  assert.equal(last.title, "Defeated");
});

// ---- Game Boy: one m3u PER TRACK, Latin-1, 0-based tracks (+1 in the app) ----

test("real rip: Game Boy Pokemon Red — 51 per-track m3us, Latin-1 (c) symbol, 0-based+1", () => {
  const { files, rows } = loadFixture("game-boy-pokemon-red");
  assert.equal(files.length, 51, "one m3u per track");
  assert.equal(rows.length, 51);
  assert.deepEqual(rows[0], { n: 1, title: "Opening (part 1)", len: 12 });
  assert.deepEqual(rows[rows.length - 1], { n: 51, title: "Pokedex Fanfare 2", len: 2 });
  assert.ok(rows.every((r) => r.n >= 1), "0-based GBS track numbers landed on 1-based rows");
});

test("real rip: Game Boy Tetris — M:SS lengths with fractional seconds", () => {
  const { rows } = loadFixture("game-boy-tetris");
  assert.equal(rows.length, 18);
  assert.deepEqual(rows[0], { n: 1, title: "Title", len: 40.009 });
  assert.deepEqual(rows[rows.length - 1], { n: 13, title: "Unknown Jingle #02", len: 7.512 });
});

test("real rip: Game Boy Donkey Kong Land — dashes+commas in credits, not titles", () => {
  const { rows } = loadFixture("game-boy-donkey-kong-land");
  assert.equal(rows.length, 20);
  assert.deepEqual(rows[0], { n: 1, title: "Main Theme", len: 62 });
  assert.deepEqual(rows[rows.length - 1], { n: 8, title: "Lose Life", len: 3 });
});

test("real rip: Game Boy Link's Awakening — 96 per-track m3us, a title with a colon", () => {
  const { files, rows } = loadFixture("game-boy-links-awakening");
  assert.equal(files.length, 96);
  assert.equal(rows.length, 96);
  assert.deepEqual(rows[0], { n: 26, title: "Prologue", len: 51 });
  const last = rows[rows.length - 1];
  assert.equal(last.title, "Hidden Track: MOYSE (German Version)", "the title itself carries a colon");
  assert.equal(last.n, 60);
  assert.equal(last.len, 51);
});

test("real rip: Latin-1 bytes really are not valid UTF-8 (the fixture earns its name)", () => {
  const dir = path.join(FIXDIR, "game-boy-pokemon-red");
  const f = readdirSync(dir).sort()[0];
  const bytes = new Uint8Array(readFileSync(path.join(dir, f)));
  assert.throws(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes));
});
