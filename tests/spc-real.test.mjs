// The real SPC sets (Zophar's Domain, 2026-09-27: Final Fantasy IV/V/VI,
// Chrono Trigger, A Link to the Past — 342 files) as TEXT: the ID666 header
// fields and xid6 tag values of every track live in
// tests/fixtures/spc-real-tags.json; no sample or code bytes are kept. These
// tests pin what File -> Import has to handle about those sets — the naming
// scheme, the tag formats, the length fields — and rebuild real headers from
// the text to run them through the parser. No emulation here; the pipeline
// itself is tested on synthetic bytes in tests/spc.test.mjs.
// Run: perl -e 'alarm 120; exec @ARGV' node --test tests/spc-real.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSPC, parseTrackName } from "../tools/spc/spc.mjs";
import { makeTestSPC } from "../tools/spc/make-test-spc.mjs";

const FIX = JSON.parse(readFileSync(new URL("./fixtures/spc-real-tags.json", import.meta.url), "utf8"));
const ALBUMS = ["ff4", "ff5", "ff6", "ct", "alttp"];
const COUNTS = {ff4: 65, ff5: 67, ff6: 82, ct: 92, alttp: 36};
const row = (line) => {
  const [file, title, seconds, fadeMs, dumper, ostDisc, ostTrack, ostChar, introTicks, fadeTicks, comment] = line.split(" | ");
  return {file, title, seconds: +seconds, fadeMs: +fadeMs, dumper, ostDisc: ostDisc === "" ? null : +ostDisc,
    ostTrack: ostTrack === "" ? null : +ostTrack, ostChar, introTicks: introTicks === "" ? null : +introTicks,
    fadeTicks: fadeTicks === "" ? null : +fadeTicks, comment};
};
const tracks = (a) => FIX[a].tracks.map(row);

test("every set is a flat zip of .spc files: one per track, no playlist, text-format ID666 + xid6 on all", () => {
  for (const a of ALBUMS) {
    assert.equal(tracks(a).length, COUNTS[a], a + " track count");
    assert.equal(FIX[a].textFormat, true, a + ": text-format tags");
    assert.equal(FIX[a].allXid6, true, a + ": every file carries an xid6 block");
    assert.deepEqual(FIX[a].emulatorByte, [48], a + ": emulator byte is ASCII '0' in text-format headers");
    for (const s of FIX[a].sizes) assert.ok(s >= 0x10200 && s <= 0x10200 + 512, a + ": 66048 + a small xid6 block, got " + s);
    assert.ok(tracks(a).every(t => t.seconds > 0), a + ": every track has a play length");
  }
});

test("file names carry the order: <disc><track><part> Title.spc, agreeing with the xid6 OST fields", () => {
  const exceptions = new Set(["999 Unknown Fanfare.spc", "999 Dancing Mad (Full).spc"]); // unlisted tracks tagged with an OST slot anyway
  for (const a of ALBUMS) {
    let prev = "";
    for (const t of tracks(a)) {
      const p = parseTrackName(t.file);
      assert.ok(p, a + ": unparseable name " + t.file);
      // the sets sort by the leading number (zip order == play order)
      assert.ok(t.file >= prev, a + ": fixture order is name order at " + t.file);
      prev = t.file;
      if (p.unlisted) { assert.ok(/^9+ /.test(t.file)); continue; }
      if (t.ostTrack != null && !exceptions.has(t.file)) {
        assert.equal(p.track, t.ostTrack, a + "/" + t.file + ": leading number vs xid6 OST track");
        if (p.disc != null) assert.equal(p.disc, t.ostDisc, a + "/" + t.file + ": disc digit vs xid6 OST disc");
      }
    }
    // multi-part tracks (101a/101b/101c) share one OST slot: the suffix lives in the file name only
    const parts = tracks(a).filter(t => parseTrackName(t.file).part);
    for (const t of parts) if (t.ostTrack != null) assert.equal(t.ostChar, "", a + "/" + t.file + ": xid6 has no part letter");
  }
  // multi-disc sets use 3 digits, single-disc sets 2; ALttP has no OST tags at all
  assert.ok(tracks("ff5").every(t => /^\d{3}/.test(t.file)));
  assert.ok(tracks("alttp").every(t => /^\d{2}[a-z]? /.test(t.file)));
  assert.ok(tracks("alttp").every(t => t.ostTrack == null));
  assert.equal(tracks("alttp").filter(t => parseTrackName(t.file).unlisted).length, 1);
  assert.equal(tracks("ct").filter(t => parseTrackName(t.file).unlisted).length, 22, "CT ships 22 tracks that are not on the OST");
});

test("the ID666 title is authoritative: file names mangle ? and \" to _", () => {
  const mangled = [];
  for (const a of ALBUMS) for (const t of tracks(a)) {
    const p = parseTrackName(t.file);
    if (p.title !== t.title) mangled.push([a, p.title, t.title]);
    else assert.equal(p.title, t.title);
  }
  assert.deepEqual(mangled, [["ff5", "What_", "What?"], ["ff6", "____", "\"??\""], ["ct", "Huh_!", "Huh?!"]]);
});

test("lengths: header seconds/fade are the xid6 intro/fade ticks (1/64000 s), rounded", () => {
  let withFade = 0;
  for (const a of ALBUMS) for (const t of tracks(a)) {
    assert.ok(t.introTicks != null, a + "/" + t.file + " has an intro length");
    assert.ok(Math.abs(t.introTicks / 64000 - t.seconds) < 1, a + "/" + t.file + ": intro ticks " + t.introTicks + " vs " + t.seconds + " s");
    if (t.fadeTicks != null) { withFade++; assert.ok(Math.abs(t.fadeTicks / 64 - t.fadeMs) < 1, a + "/" + t.file + ": fade ticks vs ms"); }
    else assert.equal(t.fadeMs, 0);
  }
  assert.ok(withFade > 250, "most tracks fade; " + withFade);
  // the range an import must budget for: 2 s jingles to an 11-minute medley
  const all = ALBUMS.flatMap(tracks).map(t => t.seconds);
  assert.equal(Math.min(...all), 2);
  assert.equal(Math.max(...all), 683);
});

test("real header text round-trips through parseSPC: seconds run into the fade field when 3 digits long", () => {
  // FF4 "07a Main Theme": the 3-byte seconds field "154" has no NUL before
  // the fade "6000" — a reader that scans to NUL would read 1546000
  const build = (fields) => {
    const out = makeTestSPC();
    out.fill(0, 0x2E, 0xD3);
    const put = (off, s) => { for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i); };
    put(0x2E, fields.title); put(0x4E, fields.game); put(0x6E, fields.dumper); put(0x7E, fields.comment);
    put(0xA9, fields.seconds); put(0xAC, fields.fade); put(0xB1, fields.artist); put(0xD2, "0");
    return parseSPC(out.buffer);
  };
  const ff4 = build({title: "Main Theme", game: "Final Fantasy 4", dumper: "Atlas", comment: "Overworld", seconds: "154", fade: "6000", artist: "Nobuo Uematsu"});
  assert.equal(ff4.tags.seconds, 154); assert.equal(ff4.tags.fadeMs, 6000);
  assert.equal(ff4.tags.textFormat, true); assert.equal(ff4.tags.emulator, 0);
  assert.equal(ff4.name, "Main Theme"); assert.equal(ff4.game, "Final Fantasy 4"); assert.equal(ff4.artist, "Nobuo Uematsu");
  assert.equal(ff4.tags.comment, "Overworld"); assert.equal(ff4.tags.dumper, "Atlas");
  const ct = build({title: "Gato's Song", game: "Chrono Trigger", dumper: "YK", comment: "Gato's Theme                    ", seconds: "19", fade: "10000", artist: "Yasunori Mitsuda"});
  assert.equal(ct.tags.seconds, 19); assert.equal(ct.tags.fadeMs, 10000);
  assert.equal(ct.tags.comment, "Gato's Theme", "32-byte comment field, space-padded by the dumper");
  const ff6 = build({title: "\"??\"", game: "Final Fantasy 6", dumper: "CzarDragon", comment: "", seconds: "5", fade: "0", artist: "Nobuo Uematsu"});
  assert.equal(ff6.name, "\"??\""); assert.equal(ff6.tags.fadeMs, 0);
});

test("games and credits as the sets carry them (what an import would slug an album from)", () => {
  assert.deepEqual(FIX.ff4.headerGame, ["Final Fantasy 4"]);
  assert.deepEqual(FIX.ff5.headerGame, ["Final Fantasy 5"]);
  assert.deepEqual(FIX.ff6.headerGame, ["Final Fantasy 6"]);
  assert.deepEqual(FIX.ct.headerGame, ["Chrono Trigger"]);
  assert.deepEqual(FIX.alttp.headerGame, ["Legend of Zelda: A Link to the P"], "32-byte field truncates");
  assert.deepEqual(FIX.alttp.xid6Game, ["Legend of Zelda: A Link to the Past"], "xid6 has the full name");
  assert.deepEqual(FIX.ff4.artists, ["Nobuo Uematsu"]);
  assert.deepEqual(FIX.alttp.artists, ["Koji Kondo"]);
  assert.ok(FIX.ct.artists.includes("Yasunori Mitsuda") && FIX.ct.artists.includes("Nobuo Uematsu"), "CT credits vary per track");
  assert.deepEqual(FIX.ff4.publisher, ["Square"]); assert.deepEqual(FIX.alttp.publisher, ["Nintendo"]);
  assert.deepEqual([FIX.ff4.year, FIX.ff5.year, FIX.ff6.year, FIX.ct.year, FIX.alttp.year].flat(), [1991, 1992, 1994, 1995, 1991]);
});
