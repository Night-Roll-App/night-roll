// A chip-music rip with MORE than one file of a one-file-per-album kind
// (Zophar's Game Boy Tetris: DMG-TRA-0.gbs v1.0 + DMG-TRA-1.gbs v1.1, with
// one of 18 playlist lines naming the second file). The importer used to
// take the first file alone and apply every line to it — the second file's
// line overwrote slot 2's title and the file was never captured or
// archived (docs/investigations/2026-10-04-gb-tetris-korobeiniki.md). The
// fix, docs/plans/2026-10-04-multi-file-chip-sets.md: parseM3u keeps each
// line's file; the session holds every picked file (row id = offset + slot);
// a track of a non-first file keeps that file's archive path in
// nsf.tracks[base].vault (chipExtraVault) and its bytes in its own entry;
// chipSource reads either. Synthetic NSFs stand in for the two .gbs files —
// nothing here is Game Boy-specific, and no rip bytes travel in the repo.
import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./harness.mjs";
import { makeTestNSF, makeTestNSFVibratoPad } from "../tools/nsf/make-test-nsf.mjs";

const app = await createApp();
const run = (code) => app.run(code);
const val = (code) => JSON.parse(app.run(`JSON.stringify(${code})`));
// the vm has no dynamic import(): the real NSF modules, imported here and
// handed to chipModules.cache (the same seam tests/night-roll.test.mjs uses)
app.context.__M = {
  ...(await import("../tools/nsf/nsf.mjs")),
  ...(await import("../tools/nsf/notes.mjs")),
  ...(await import("../tools/nsf/midi-write.mjs")),
  ...(await import("../tools/nsf/apu-render.mjs")),
};
run(`chipModules.cache = Object.assign(chipModules.cache || {}, {nsf: __M});`);
const enc = (s) => new TextEncoder().encode(s);
const TUNE = makeTestNSF(), PAD = makeTestNSFVibratoPad();

test("chipExtraVault / chipVaultFileSlug: a non-first file's archive name, and the file slug read back from it", () => {
  assert.equal(val(`chipExtraVault({vault: "game-boy/tetris.gbs", chip: "gbs"}, "DMG-TRA-1.gbs")`), "game-boy/tetris.dmg-tra-1.gbs");
  assert.equal(val(`chipExtraVault({vault: "nes/mega-man-2.nsf"}, "Mega Man 2 (Rev A).nsf")`), "nes/mega-man-2.mega-man-2-rev-a.nsf", "the file's name slugified, the album's extension kept");
  assert.equal(val(`chipVaultFileSlug("game-boy/tetris.dmg-tra-1.gbs")`), "dmg-tra-1");
  assert.equal(val(`chipVaultFileSlug("game-boy/tetris.gbs")`), null, "the album's own file: no file slug");
  assert.equal(val(`chipVaultFileSlug("snes/chrono-trigger/")`), null, "a per-file folder vault: none either");
  assert.equal(val(`chipVaultFileSlug(undefined)`), null);
});

test("parseM3u keeps each line's file; m3uTrackKeys/m3uTrackFor resolve a line to the album track of ITS file", () => {
  assert.equal(val(`parseM3u("DMG-TRA-1.gbs::GBS,1,A-Type Music (version 1.1) - Hirokazu Tanaka - Tetris v1.1 - ©1989,0:01:17,,0")[0].file`), "DMG-TRA-1.gbs");
  assert.equal(val(`parseM3u("::NSF,1,Game - Artist - Title,0:01:00,,0")[0].file`), null, "a line with no file part");
  assert.deepEqual(val(`m3uFileSlug("DMG-TRA-1.gbs")`), "dmg-tra-1");
  run(`__keys = m3uTrackKeys({"a": {n: 1}, "b": {n: 2}, "c": {n: 2, vault: "game-boy/g.game-1.gbs"}, "d": 3});`);
  assert.deepEqual(val(`__keys`), {byN: {1: "a", 2: "b", 3: "d"}, byFile: {"game-1::2": "c"}});
  assert.equal(val(`m3uTrackFor(__keys, {file: "GAME-0.gbs", n: 2})`), "b", "the album's own file: by slot");
  assert.equal(val(`m3uTrackFor(__keys, {file: "GAME-1.gbs", n: 2})`), "c", "the other file: the vaulted track with that file's slug");
  assert.equal(val(`m3uTrackFor(__keys, {file: null, n: 2})`), "b");
  assert.equal(val(`m3uTrackFor(__keys, {file: "GAME-1.gbs", n: 3})`), "d", "no vaulted track at that slot: the plain one");
  assert.equal(val(`m3uTrackFor(__keys, {file: "GAME-1.gbs", n: 9})`), null);
});

test("openPickedFiles: two chip files + playlists → every file in the session, rows per file, a foreign line skipped and named", async () => {
  app.context.__loaded = [
    {name: "b.nsf", bytes: PAD}, {name: "a.nsf", bytes: TUNE}, // picked b first: the set still orders by name
    {name: "01 Tune A.m3u", bytes: enc("a.nsf::NSF,1,Game - Nobody - Tune A,0:08\n")},
    {name: "02 Pad B.m3u", bytes: enc("B.NSF::NSF,1,Game - Nobody - Pad B,0:08\n")}, // case differs from the file's — still its line
    {name: "03 Stray.m3u", bytes: enc("c.nsf::NSF,1,Game - Nobody - Stray,0:08\n")}, // a file the pack has but was not picked
  ];
  const infos = [];
  app.context.__info = (s) => infos.push(String(s));
  run(`setInfo = s => __info(s);`);
  await run(`openPickedFiles(__loaded)`);
  assert.deepEqual(val(`nsfSess.files.map(f => [f.name, f.offset, f.parsed.songs])`), [["a.nsf", 0, 1], ["b.nsf", 1, 1]], "name order; the second file's rows start after the first file's slots");
  assert.equal(val(`nsfSess.bytes.length`), TUNE.length, "the session's own bytes stay the FIRST file's — today's single-file path untouched");
  assert.deepEqual(val(`nsfSess.trackList.map(e => [e.n, e.slot, e.file, e.title])`), [[1, 1, 0, "Tune A"], [2, 1, 1, "Pad B"]], "the stray line is not a row — it used to land on the first file's slot 1 over Tune A");
  assert.match(infos.join(" | "), /c\.nsf.*skipped/, "the status names the file the playlist wanted: " + infos.join(" | "));
  assert.deepEqual(val(`[nsfSess.rows[1].slot, nsfSess.rows[1].file, nsfSess.rows[1].bytes, nsfSess.rows[1].parsed]`), [1, 0, null, null], "a first-file row carries nothing of its own (capture falls through to nsfSess.nsf/.bytes as always)");
  assert.deepEqual(val(`[nsfSess.rows[2].slot, nsfSess.rows[2].file, nsfSess.rows[2].srcName, nsfSess.rows[2].bytes.length, !!nsfSess.rows[2].parsed]`), [1, 1, "b.nsf", PAD.length, true], "a second-file row carries its file: parsed, bytes, name");
  // impRowId: a playlist dropped mid-session names rows through its file; a foreign line names no row
  run(`__list = parseM3u("a.nsf::NSF,1,G - A - X,0:08\\nb.nsf::NSF,1,G - A - Y,0:08\\nc.nsf::NSF,1,G - A - Z,0:08");`);
  assert.deepEqual(val(`__list.map(e => impRowId(e, __list))`), [1, 2, -1]);
  assert.equal(val(`applyM3uNames(__list)`), 2, "two rows renamed, the foreign line skipped");
  assert.deepEqual(val(`[nsfSess.rows[1].name.value, nsfSess.rows[2].name.value]`), ["X", "Y"]);
  // chipSource, live session: the row's own file and slot, never the album's bytes with the row id
  run(`nsfSess.rows[2].key = "albums/nes/two/pad-b.mid"; nsfSess.rows[2].secs = 7; songKey = "albums/nes/two/pad-b.mid";`);
  let src = await run(`chipSource()`);
  assert.equal(src.n, 1, "slot 1 of ITS file, not row id 2");
  assert.equal(src.bytes.length, PAD.length, "the second file's bytes");
  run(`nsfSess.rows[1].key = "albums/nes/two/tune-a.mid"; songKey = "albums/nes/two/tune-a.mid";`);
  src = await run(`chipSource()`);
  assert.equal(src.n, 1); assert.equal(src.bytes.length, TUNE.length, "a first-file row: the session's bytes");
  run(`nsfSess = null; songKey = null;`);
});

test("openPickedFiles: a one-file pick with a playlist that also names a sibling file skips those lines instead of merging them", async () => {
  app.context.__loaded = [
    {name: "DMG-X-0.nsf", bytes: TUNE},
    {name: "02 Theme (v0).m3u", bytes: enc("DMG-X-0.nsf::NSF,1,Game - Nobody - Theme (v0),0:08\n")},
    {name: "03 Theme (v1).m3u", bytes: enc("DMG-X-1.nsf::NSF,1,Game - Nobody - Theme (v1),0:08\n")},
  ];
  const infos = [];
  app.context.__info = (s) => infos.push(String(s));
  run(`setInfo = s => __info(s);`);
  await run(`openPickedFiles(__loaded)`);
  assert.deepEqual(val(`nsfSess.trackList.map(e => [e.n, e.slot, e.title])`), [[1, 1, "Theme (v0)"]], "last write no longer wins: slot 1 keeps the picked file's title");
  assert.match(infos.join(" | "), /DMG-X-1\.nsf.*skipped/);
  // a playlist that names NONE of the picked files still applies to it (rips spell file names freely)
  app.context.__loaded = [{name: "renamed.nsf", bytes: TUNE}, {name: "01.m3u", bytes: enc("Original Name.nsf::NSF,1,Game - Nobody - Still Named,0:08\n")}];
  await run(`openPickedFiles(__loaded)`);
  assert.deepEqual(val(`nsfSess.trackList.map(e => [e.n, e.slot, e.title])`), [[1, 1, "Still Named"]]);
  run(`nsfSess = null;`);
});

test("openPickedFiles: two chip files and no playlist list each file's slots on their own, the second file's rows titled by it", async () => {
  app.context.__loaded = [{name: "a.nsf", bytes: TUNE}, {name: "b.nsf", bytes: PAD}];
  const infos = [];
  app.context.__info = (s) => infos.push(String(s));
  run(`setInfo = s => __info(s);`);
  await run(`openPickedFiles(__loaded)`);
  assert.deepEqual(val(`nsfSess.trackList.map(e => [e.n, e.slot, e.file, e.title])`), [[1, 1, 0, null], [2, 1, 1, "b track-01"]]);
  assert.deepEqual(val(`[nsfSess.rows[1].name.value, nsfSess.rows[2].name.value]`), ["track-01", "b track-01"], "no silent merge, no slug collision between the files' default names");
  assert.match(infos.join(" | "), /2 NSF files, no playlist/);
  run(`nsfSess = null;`);
});

test("chipSource: a published track with its own vault fetches THAT file, caches it in its entry, keeps its slot; its siblings fetch the album's", async () => {
  run(`nsfSess = null; songKey = "albums/game-boy/two/theme-v1.mid";
       __fetched = []; __put = [];
       albumMetaFor = async () => ({title: "Two", nsf: {vault: "game-boy/two.gbs", chip: "gbs", tracks: {"title": {n: 1, secs: 40}, "theme-v1": {n: 2, secs: 60, vault: "game-boy/two.game-1.gbs"}}}});
       vaultFetch = async f => { __fetched.push(f); return new Uint8Array([71, 66, 83, f.length]); };
       idbNsfGet = async () => null;
       idbNsfPut = (slug, bytes, patch, kind) => { __put.push([slug, bytes ? bytes.length : null, Object.keys(patch), kind]); };`);
  let src = await run(`chipSource()`);
  assert.ok(src, "resolves");
  assert.equal(src.n, 2, "the slot inside its own file — not 1 as a per-file track would be");
  assert.equal(src.chip, "gbs");
  assert.deepEqual(val(`__fetched`), ["game-boy/two.game-1.gbs"], "the track's own archive file, not the album's");
  assert.deepEqual(val(`__put`), [["game-boy/two.gbs", null, ["theme-v1"], "gbs"]], "cached in the track's entry of the album's record; the record's own bytes untouched");
  run(`songKey = "albums/game-boy/two/title.mid";`);
  src = await run(`chipSource()`);
  assert.equal(src.n, 1);
  assert.deepEqual(val(`__fetched`), ["game-boy/two.game-1.gbs", "game-boy/two.gbs"], "a plain sibling fetches the album's vault as always");
  // the device record already holding the vaulted entry (an earlier open, or the import itself): no fetch
  run(`__fetched = []; songKey = "albums/game-boy/two/theme-v1.mid";
       idbNsfGet = async () => ({chip: "gbs", bytes: new Uint8Array([1, 2, 3]), tracks: {"theme-v1": {n: 2, secs: 60, vault: "game-boy/two.game-1.gbs", bytes: new Uint8Array([9, 9])}}});`);
  src = await run(`chipSource()`);
  assert.deepEqual([...src.bytes], [9, 9], "the entry's own bytes, not the record's");
  assert.equal(src.n, 2);
  assert.deepEqual(val(`__fetched`), []);
  run(`songKey = null;`);
});
