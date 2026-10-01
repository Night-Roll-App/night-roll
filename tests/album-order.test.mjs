// tests/album-order.test.mjs — tools/album-order.mjs's two pure, reusable
// pieces: parseTrackName (tools/spc/spc.mjs, imported — not duplicated)
// feeding chipTrackOrder's disc/track/part sort, and the slug-assignment +
// rip-name-matching logic the tool mirrors from index.html. No real rip
// bytes here (that needs real chip files — see docs/plans/ for how those
// are verified); synthetic names are enough for both.
import test from "node:test";
import assert from "node:assert/strict";
import { parseTrackName } from "../tools/spc/spc.mjs";
import {
  chipTrackOrder, assignSlugsAndTracks, slugify, namesMatch, keyOf, keyArabic, parseM3u, decodeM3u,
} from "../tools/album-order.mjs";

test("parseTrackName: 2-digit track, 3-digit disc+track, lettered part, unlisted (all-nines)", () => {
  assert.deepEqual(parseTrackName("05 Title.spc"), {disc: null, track: 5, part: "", unlisted: false, title: "Title"});
  assert.deepEqual(parseTrackName("314c Some Song.spc"), {disc: 3, track: 14, part: "c", unlisted: false, title: "Some Song"});
  // parseTrackName only strips a literal ".spc" (it predates the other
  // chip kinds reusing it for order — tools/album-order.mjs always prefers
  // the container's own tag title first, so this quirk rarely surfaces).
  assert.deepEqual(parseTrackName("410 Challenge.minipsf2"), {disc: 4, track: 10, part: "", unlisted: false, title: "Challenge.minipsf2"});
  const u = parseTrackName("99 Unused.spc");
  assert.equal(u.unlisted, true);
  assert.equal(u.disc, null); // all-nines never carries a disc, even at 3 digits
});

test("chipTrackOrder: disc, then track, then part, unlisted (99/999) last, unparsable names last of all", () => {
  const files = [
    {name: "205 Voyage.psf"}, {name: "101a Opening (1).psf"}, {name: "101b Opening (2).psf"},
    {name: "999 Hidden.psf"}, {name: "notes.txt"}, {name: "102 Narshe.psf"},
  ];
  const order = chipTrackOrder(files).map(f => f.name);
  assert.deepEqual(order, [
    "101a Opening (1).psf", "101b Opening (2).psf", "102 Narshe.psf", "205 Voyage.psf",
    "999 Hidden.psf", "notes.txt",
  ]);
});

test("assignSlugsAndTracks: sequential 1-based track numbers, and a repeated title gets -2/-3 (Ocarina's twenty Hyrule Fields)", () => {
  const entries = [
    {title: "Hyrule Field", disc: null}, {title: "Hyrule Field", disc: null},
    {title: "Gerudo Valley", disc: 1}, {title: "Hyrule Field", disc: null},
  ];
  const out = assignSlugsAndTracks(entries);
  assert.deepEqual(out.map(o => o.slug), ["hyrule-field", "hyrule-field-2", "gerudo-valley", "hyrule-field-3"]);
  assert.deepEqual(out.map(o => o.track), [1, 2, 3, 4]);
  assert.equal(out[2].disc, 1);
});

test("slugify matches index.html's rule (punctuation to hyphens, trimmed, lowercased)", () => {
  assert.equal(slugify("Spicy Food, Minty Leaf"), "spicy-food-minty-leaf");
  assert.equal(slugify("  Don't Be Afraid!  "), "don-t-be-afraid");
  assert.equal(slugify(""), "untitled");
});

test("namesMatch: exact, roman-numeral fold, alias, and whole-token-suffix containment", () => {
  assert.ok(namesMatch("final-fantasy-vi", "final-fantasy-6"), "SNES zip names keep the roman numeral; the album slug uses arabic");
  assert.ok(namesMatch("final-fantasy-viii", "final-fantasy-8"));
  assert.ok(namesMatch("ffx", "final-fantasy-x"), "the alias table covers this abbreviation");
  assert.ok(namesMatch("a-link-to-the-past", "legend-of-zelda-a-link-to-the-past"), "a rip that drops the franchise prefix");
  assert.ok(namesMatch("tetris", "tetris"));
});

test("namesMatch: a franchise name must never match its own sequel (the regression this tool shipped with once)", () => {
  assert.equal(namesMatch("ninja-gaiden-ii", "ninja-gaiden"), false);
  assert.equal(namesMatch("final-fantasy-ii", "final-fantasy-i"), false);
  assert.equal(namesMatch("final-fantasy-iii", "final-fantasy-ii"), false);
});

test("keyOf / keyArabic: normalization strips extension, console prefix and punctuation", () => {
  assert.equal(keyOf("Dark-Cloud.zip"), "darkcloud");
  assert.equal(keyOf("ps2-final-fantasy-x"), "finalfantasyx");
  assert.equal(keyArabic("final-fantasy-ix"), "finalfantasy9");
});

test("parseM3u: NSF is 1-based already, GBS is 0-based (+1) — playlist order IS album order", () => {
  const nsf = parseM3u("Game.nsf::NSF,1,The Prelude,0:01:16.827,,0:00:03.353\n");
  assert.deepEqual(nsf, [{n: 1, title: "The Prelude", len: 76.827}]);
  const gbs = parseM3u("DMG-KYJ.gbs::GBS,8,Spicy Food\\, Minty Leaf - Jun Ishikawa - Kirby's Dream Land,0:27,,0:10\n");
  assert.equal(gbs[0].n, 9, "GBS track 8 (0-based) is album slot n=9");
  assert.equal(gbs[0].title, "Spicy Food, Minty Leaf", "escaped comma restored, and the trailing artist/game fields dropped");
});

test("parseM3u: splits on ' - ' only outside brackets (Castlevania II's 'Bloody Tears (Street - Day time BGM)')", () => {
  const list = parseM3u("Game.nsf::NSF,2,Game - Artist - Bloody Tears (Street - Day time BGM),0:01:00,,0:00:03\n");
  assert.equal(list[0].title, "Bloody Tears (Street - Day time BGM)");
});

test("decodeM3u: falls back to windows-1252 for a Zophar-style latin-1 byte (the © in a date field)", () => {
  const bytes = new Uint8Array([0x41, 0xA9, 0x42]); // "A" + latin-1 © + "B"
  assert.equal(decodeM3u(bytes), "A©B");
});
