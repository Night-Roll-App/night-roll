// tests/import-set.test.mjs — the terminal importer (tools/import-set.mjs)
// runs the app's own Import → Capture all → Publish over the synthetic NSF
// and leaves the album folder the app would have published: the .mid per
// track, album.json with the nsf: vault + track map, the m3u's title, and
// nothing of the chip file itself. Expansion-chip NSFs are refused by the
// parser and the refusal is the import error.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { makeTestNSF, makeTestNSFVibratoPad } from "../tools/nsf/make-test-nsf.mjs";
import { parseNSF } from "../tools/nsf/nsf.mjs";
import { importSet, parseArgs } from "../tools/import-set.mjs";

test("import-set: a synthetic NSF with its playlist becomes albums/nes/<slug>/ as the app publishes it", async () => {
  const src = mkdtempSync(path.join(tmpdir(), "nr-set-")), out = mkdtempSync(path.join(tmpdir(), "nr-out-"));
  writeFileSync(path.join(src, "test.nsf"), makeTestNSF());
  writeFileSync(path.join(src, "test.m3u"), "test.nsf::NSF,1,Night Roll test tune - Nobody - Test Tune,0:08\n"); // a jingle: sized to the tag, no 300 s retry
  const lines = [];
  const res = await importSet({src, slug: "test-tune", out, publish: false}, s => lines.push(s));
  const dir = path.join(out, "albums", "nes", "test-tune");
  // no rollnotes.json: makeTestNSF()'s tune stops writing registers after its
  // 4th note (the triangle pedal is written once, at init, and never again)
  // — the no-loop tail trim (2026-09-29, tools/nsf/notes.mjs's
  // trimSustainedTail) now correctly reads that as the music ending, not a
  // deliberately long pad, and cuts the capture to a short ring-out instead
  // of riding the tag's 8s-derived ~24s ceiling. A genuinely sustained pad
  // (register writes that keep differing, e.g. real vibrato) is NOT cut —
  // see "no-loop tail trim, synthetic NSF: a held note with real vibrato…"
  // in tests/nsf.test.mjs and the "vibrato pad" case below.
  assert.deepEqual(readdirSync(dir).sort(), ["album.json", "test-tune.mid"], "the .mid named by the playlist, album.json — no chip file, no loop/pad notes for this held-forever tune");
  assert.equal(readFileSync(path.join(dir, "test-tune.mid")).subarray(0, 4).toString("latin1"), "MThd");
  const meta = JSON.parse(readFileSync(path.join(dir, "album.json"), "utf8"));
  assert.equal(meta.title, "Test Tune");
  assert.deepEqual(meta.songs, {}, "the filename spells the title: no override");
  assert.equal(meta.nsf.vault, "test-tune.nsf");
  assert.equal(meta.nsf.tracks["test-tune"].n, 1);
  assert.ok(meta.nsf.tracks["test-tune"].secs > 0 && meta.nsf.tracks["test-tune"].secs < 5, "the tail trim keeps this short, not riding the ~24s tag-derived ceiling");
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].st, "done");
  assert.equal(res.rows[0].title, "Test Tune");
  assert.ok(res.rows[0].notes >= 5, "the tune's notes (4 pulse + a triangle pedal), got " + res.rows[0].notes);
  assert.deepEqual(res.uploads, ["test-tune.nsf"], "the archive path chipVaultFile reads");
  assert.ok(lines.some(l => /^  1  Test Tune/.test(l)), "one report line per track");
  assert.ok(!existsSync(path.join(out, "albums", "manifest.json")), "the manifest is build_manifest.mjs's, not the batch's");
  rmSync(src, {recursive: true, force: true}); rmSync(out, {recursive: true, force: true});
});

test("import-set: a genuinely sustained pad (real vibrato, no loop) keeps its full length and the app's pad annotation", async () => {
  const src = mkdtempSync(path.join(tmpdir(), "nr-set-")), out = mkdtempSync(path.join(tmpdir(), "nr-out-"));
  writeFileSync(path.join(src, "test.nsf"), makeTestNSFVibratoPad());
  writeFileSync(path.join(src, "test.m3u"), "test.nsf::NSF,1,Night Roll test tune - Nobody - Pad Tune,0:08\n");
  const res = await importSet({src, slug: "pad-tune", out, publish: false}, () => {});
  const dir = path.join(out, "albums", "nes", "pad-tune");
  assert.deepEqual(readdirSync(dir).sort(), ["album.json", "pad-tune.mid", "pad-tune.rollnotes.json"], "the vibrato pad is real, sustained music — the tail trim leaves it alone, and the app's pad rule still fires");
  assert.match(readFileSync(path.join(dir, "pad-tune.rollnotes.json"), "utf8"), /"track":"tr1","voice":"sine"/, "the app's pad rule: a long held note hums on a sine");
  const meta = JSON.parse(readFileSync(path.join(dir, "album.json"), "utf8"));
  assert.ok(meta.nsf.tracks["pad-tune"].secs > 15, "the vibrato pad's real length survives the no-loop trim, got " + meta.nsf.tracks["pad-tune"].secs);
  assert.equal(res.rows[0].st, "done");
  rmSync(src, {recursive: true, force: true}); rmSync(out, {recursive: true, force: true});
});

test("import-set: --title renames the album; a second batch merges into the same album.json", async () => {
  const src = mkdtempSync(path.join(tmpdir(), "nr-set-")), out = mkdtempSync(path.join(tmpdir(), "nr-out-"));
  writeFileSync(path.join(src, "test.nsf"), makeTestNSF());
  writeFileSync(path.join(src, "test.m3u"), "test.nsf::NSF,1,Night Roll test tune - Nobody - Dr. Wily's Tune,0:08\n");
  await importSet({src, slug: "test-tune", title: "The Test Tune", out}, () => {});
  const p = path.join(out, "albums", "nes", "test-tune", "album.json");
  let meta = JSON.parse(readFileSync(p, "utf8"));
  assert.equal(meta.title, "The Test Tune");
  assert.deepEqual(meta.songs, {"dr-wily-s-tune": "Dr. Wily's Tune"}, "a title the filename cannot spell rides album.json");
  await importSet({src, slug: "test-tune", out}, () => {}); // again, untitled: the app's GET-merge keeps the title and the override
  meta = JSON.parse(readFileSync(p, "utf8"));
  assert.equal(meta.title, "The Test Tune");
  assert.deepEqual(meta.songs, {"dr-wily-s-tune": "Dr. Wily's Tune"});
  rmSync(src, {recursive: true, force: true}); rmSync(out, {recursive: true, force: true});
});

test("parseNSF refuses expansion-chip files by name; the importer surfaces it", async () => {
  const bytes = makeTestNSF();
  const names = {0x01: "VRC6", 0x02: "VRC7", 0x04: "FDS", 0x08: "MMC5", 0x10: "Namco 163", 0x20: "Sunsoft 5B"};
  for (const [bit, name] of Object.entries(names)) {
    const b = new Uint8Array(bytes); b[0x7B] = +bit;
    assert.throws(() => parseNSF(b.buffer), new RegExp("expansion sound chip " + name + " not supported"), name);
    assert.equal(parseNSF(b.buffer, {expansion: true}).expansion.names.join(","), name, "opt-in parse names the chip");
  }
  const b = new Uint8Array(bytes); b[0x7B] = 0x22;
  assert.throws(() => parseNSF(b.buffer), /VRC7 \+ Sunsoft 5B/);
  assert.equal(parseNSF(bytes.buffer).expansion.mask, 0, "a 2A03 file parses as before");
  const src = mkdtempSync(path.join(tmpdir(), "nr-set-")), out = mkdtempSync(path.join(tmpdir(), "nr-out-"));
  writeFileSync(path.join(src, "vrc7.nsf"), new Uint8Array(bytes).map((x, i) => i === 0x7B ? 0x02 : x));
  await assert.rejects(importSet({src, slug: "vrc7", out}, () => {}), /expansion sound chip VRC7 not supported/);
  assert.ok(!existsSync(path.join(out, "albums")), "nothing written");
  rmSync(src, {recursive: true, force: true}); rmSync(out, {recursive: true, force: true});
});

test("import-set: argument parsing", () => {
  const o = parseArgs(["x.zip", "--slug", "s", "--title", "T", "--console", "nes", "--publish", "--secs", "30"]);
  assert.equal(o.src, "x.zip"); assert.equal(o.slug, "s"); assert.equal(o.title, "T"); assert.equal(o.console, "nes"); assert.equal(o.publish, true); assert.equal(o.secs, 30);
  assert.throws(() => parseArgs(["a", "b"]), /unexpected argument b/);
});
