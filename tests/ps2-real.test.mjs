// What three real PSF2 sets taught the PS2 milestone-1 pipeline (Zophar's
// Domain, 2026-09-28 — docs/plans/ps2.md "Findings (milestone 1)"). No rip
// bytes live here or anywhere in the repo: these tests read from
// /tmp/claude-501/rips/ps2-<slug>/ and skip cleanly (not fail) when that
// directory is absent, the same convention tests/psx-real.test.mjs uses.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadPSF2Chain, mergePSF2, readPSF2File, isPSF2 } from "../tools/ps2/psf2.mjs";
import { ps2Song } from "../tools/ps2/capture.mjs";
import { bpmOf, secondsAt } from "../tools/psx/seq.mjs";

const RIPS = "/tmp/claude-501/rips";
const has = slug => existsSync(join(RIPS, slug));

async function loadOne(dir, name) {
  const bytes = readFileSync(join(dir, name));
  const readLib = n => { try { return readFileSync(join(dir, n)); } catch { return null; } };
  const sources = await loadPSF2Chain(bytes, readLib, {name: basename(name)});
  const mini = sources.find(s => s.name === basename(name));
  return {sources, mini, files: mergePSF2(sources)};
}

test("Final Fantasy X: real minipsf2/psf2lib container parses cleanly for every file; Square's own driver (BGM/WD) now parses into notes + a renderable bank (milestone 3)", {skip: !has("ps2-ffx")}, async () => {
  const dir = join(RIPS, "ps2-ffx");
  const names = readdirSync(dir).filter(f => f.endsWith(".minipsf2"));
  assert.ok(names.length >= 80, `expected the full set, saw ${names.length}`);
  let bgmCount = 0, totalNotes = 0, withLoop = 0;
  for (const name of names) {
    const {sources, mini, files} = await loadOne(dir, name);
    assert.ok(isPSF2(readFileSync(join(dir, name))));
    // every set song is entirely self-contained: BGM sequence + WD bank
    // both live in the MINI's own filesystem (the shared .psf2lib only
    // carries IOP driver modules) — matches docs/plans/ps2.md's finding
    const bgm = [...mini.files].find(f => f.path.endsWith(".bgm"));
    const wd = [...mini.files].find(f => f.path.endsWith(".wd"));
    assert.ok(bgm, `${name}: no .bgm in the mini's own filesystem`);
    assert.ok(wd, `${name}: no .wd in the mini's own filesystem`);
    const data = await readPSF2File(mini.psf.reserved, bgm);
    assert.equal(String.fromCharCode(...data.subarray(0, 4)), "BGM ", `${name}: not Square's BGM signature`);
    const view = new DataView(data.buffer, data.byteOffset);
    const ppqn = view.getUint16(0xE, true);
    assert.equal(ppqn, 48, `${name}: every FFX track uses 48 ticks/quarter`);
    const song = await ps2Song(files, mini);
    assert.equal(song.kind, "bgm", `${name}: expected Square's driver to parse, not just be identified`);
    assert.equal(song.renderable, true, `${name}: expected a WD bank`);
    const {seq, notes} = song.result;
    assert.ok(notes.length > 0, `${name}: no notes captured`);
    assert.ok(bpmOf(seq.tempo) > 20 && bpmOf(seq.tempo) < 300, `${name}: implausible tempo ${bpmOf(seq.tempo)}`);
    const keys = notes.map(n => n.key);
    assert.ok(Math.min(...keys) >= 0 && Math.max(...keys) <= 127, `${name}: key out of MIDI range`);
    if (seq.loop) withLoop++;
    totalNotes += notes.length;
    bgmCount++;
  }
  assert.equal(bgmCount, names.length);
  assert.ok(totalNotes > 100000, `expected well over 100k notes across the whole set, got ${totalNotes}`);
  assert.ok(withLoop > names.length / 2, `expected most songs to carry a loop, got ${withLoop}/${names.length}`);
});

test("Ico and XIII: the Zophar 'PSF2' packs for these two titles are not PSF2 containers at all (GENH / SS2 raw-stream dumps)", {skip: !has("ps2-ico") || !has("ps2-xiii")}, () => {
  for (const [slug, magic] of [["ps2-ico", "GENH"], ["ps2-xiii", "SShd"]]) {
    const dir = join(RIPS, slug);
    const names = readdirSync(dir).slice(0, 10);
    assert.ok(names.length > 0);
    for (const name of names) {
      const bytes = readFileSync(join(dir, name));
      assert.equal(isPSF2(bytes), false, `${slug}/${name}: expected NOT a PSF2 container`);
      assert.equal(String.fromCharCode(...bytes.subarray(0, magic.length)), magic, `${slug}/${name}: expected the ${magic} stream-dump magic`);
    }
  }
});

test("Dark Cloud: Sony's stock SQ/HD/BD driver, picked per-song from a plain-text psf2.ini (-s=/-h=/-b=) — every song parses, loop found where present, tag-length ratio near 1.0", {skip: !has("ps2-darkcloud")}, async () => {
  const dir = join(RIPS, "ps2-darkcloud");
  const names = readdirSync(dir).filter(f => f.endsWith(".psf2"));
  assert.ok(names.length >= 50, `expected the full set, saw ${names.length}`);
  const ratios = [];
  let withLoop = 0;
  for (const name of names) {
    const {mini, files} = await loadOne(dir, name);
    const song = await ps2Song(files, mini);
    assert.equal(song.kind, "sq");
    assert.equal(song.renderable, true, `${name}: expected an HD/BD bank`);
    assert.equal(song.warnings.length, 0, `${name}: ${JSON.stringify(song.warnings)}`);
    const {seq, notes} = song.result;
    assert.ok(notes.length > 0, `${name}: no notes captured`);
    assert.ok(bpmOf(seq.tempo) > 20 && bpmOf(seq.tempo) < 300, `${name}: implausible tempo ${bpmOf(seq.tempo)}`);
    const keys = notes.map(n => n.key);
    assert.ok(Math.min(...keys) >= 0 && Math.max(...keys) <= 127, `${name}: key out of MIDI range`);
    if (seq.loop) withLoop++;
    const tag = mini.psf.tags.length;
    const m = tag && tag.match(/(\d+):(\d+(?:\.\d+)?)/);
    if (m) {
      const tagSec = (+m[1]) * 60 + +m[2];
      const lastTick = notes.reduce((mx, n) => Math.max(mx, n.endTick), seq.endTick);
      const measured = seq.loop
        ? secondsAt(seq, seq.loop.start) + 2 * (secondsAt(seq, seq.loop.end) - secondsAt(seq, seq.loop.start))
        : secondsAt(seq, lastTick);
      if (measured > 0) ratios.push(tagSec / measured);
    }
  }
  assert.ok(withLoop > names.length / 2, `expected most songs to carry a loop, got ${withLoop}/${names.length}`);
  ratios.sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  assert.ok(median > 0.9 && median < 1.1, `median tag/measured ratio out of range: ${median} (n=${ratios.length})`);
});
