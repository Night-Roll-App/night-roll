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

test("Final Fantasy X WD banks: every instrument's key ranges partition the keyboard — no two ranges overlap unless identical (a stereo/layer pair), none inverted (the 'first' flag set on two regions layered a second sample under 109 Battle's kick)", { skip: !has("ps2-ffx") }, async () => {
  const { parseWD } = await import("../tools/ps2/wd.mjs");
  const dir = join(RIPS, "ps2-ffx");
  const seen = new Set();
  let instruments = 0;
  for (const name of readdirSync(dir).filter(f => f.endsWith(".minipsf2"))) {
    const {mini} = await loadOne(dir, name);
    const wdf = [...mini.files].find(f => f.path.endsWith(".wd"));
    if (!wdf || seen.has(wdf.path)) continue;
    seen.add(wdf.path);
    const wd = parseWD(await readPSF2File(mini.psf.reserved, wdf));
    for (const ins of wd.instruments) {
      instruments++;
      for (const r of ins.regions) assert.ok(r.keyLow <= r.keyHigh, `${wdf.path} instrument ${ins.index}: inverted ${r.keyLow}-${r.keyHigh}`);
      for (let a = 0; a < ins.regions.length; a++) for (let b = a + 1; b < ins.regions.length; b++) {
        const r = ins.regions[a], q = ins.regions[b];
        const same = r.keyLow === q.keyLow && r.keyHigh === q.keyHigh;
        assert.ok(same || r.keyHigh < q.keyLow || q.keyHigh < r.keyLow, `${wdf.path} instrument ${ins.index}: ${r.keyLow}-${r.keyHigh} overlaps ${q.keyLow}-${q.keyHigh}`);
      }
    }
  }
  assert.ok(instruments > 600, `read ${instruments} instruments`);
});

// ---- PS2 capture v2 on the real rips (NIGHT-ROLL.md "PS2 capture v2") ----
// The re-capture's download cache (tools/recapture.mjs → <out>/rips/ps2/<slug>/);
// skipped when the files are not there.
import { makeMidi } from "../tools/psx/notes.mjs";
import { readSmf, captureDiff } from "../tools/capture-diff.mjs";
const RECAP = process.env.PS2_RIPS || "/tmp/recap/rips/ps2";
const ripAt = (slug, base) => {
  const dir = join(RECAP, slug), lib = existsSync(dir) && readdirSync(dir).find(f => f.endsWith(".psf2lib"));
  return lib && existsSync(join(dir, base + ".psf2")) ? {dir, name: base + ".psf2"} : null;
};
async function v2Of(rip) {
  const {mini, files} = await loadOne(rip.dir, rip.name);
  const r = (await ps2Song(files, mini)).result;
  const v2 = readSmf(makeMidi(r)), v1 = readSmf(makeMidi({...r, ps2: undefined}));
  const count = k => v2.tracks.reduce((a, tr) => a + tr.other.filter(e => e.kind === k).length, 0);
  return {v1, v2, count, r};
}
const KING = ripAt("dark-cloud", "the-king-s-curse");
test("real rip (Dark Cloud, The King's Curse): the wheel's slow sags as bends at the split's ±2, the channel's own CC7/CC11, the wet send; no note moves", {skip: !KING && "Dark Cloud rip not on disk (PS2_RIPS or /tmp/recap/rips/ps2)"}, async () => {
  const {v1, v2, count} = await v2Of(KING);
  assert.equal(captureDiff(v1, v2).verdict, "VELOCITY");
  assert.deepEqual(v2.tracks.map(t => t.notes), v1.tracks.map(t => t.notes));
  assert.equal(count("bend"), 2270);
  assert.equal(count("cc6"), 0, "every bent split here is 256/256: ±2");
  assert.equal(count("cc84"), 0, "SQ notes are never split: nothing to link");
  assert.ok(count("cc91") > 0 && count("cc7") > 0 && count("cc11") > 0 && count("program") > 0);
  // ch 5's held G sags to −4352 (× 256 ÷ 8192 = −136 128ths = −106 cents) by its end
  const sag = v2.tracks.find(t => t.name === "ch 5 prog 3").other.filter(e => e.kind === "bend").map(e => +e.key.split(":")[1] - 8192);
  assert.equal(Math.min(...sag), Math.round(-106 / 200 * 8192));
});
const AURON = ripAt("final-fantasy-x", "auron-s-theme"), PURSUIT = ripAt("final-fantasy-x", "pursuit");
test("real rip (FFX, Auron's Theme): the bend-born split pieces are 26 glide links with the wheel's path; no note moves", {skip: !AURON && "FFX rip not on disk (PS2_RIPS or /tmp/recap/rips/ps2)"}, async () => {
  const {v1, v2, count} = await v2Of(AURON);
  assert.equal(captureDiff(v1, v2).verdict, "VELOCITY");
  assert.deepEqual(v2.tracks.map(t => t.notes), v1.tracks.map(t => t.notes));
  assert.equal(count("cc84"), 26);
  assert.equal(count("bend"), 65);
  assert.ok(count("cc91") > 0 && count("program") > 0);
});
test("real rip (FFX, Pursuit): 0x5D sets ±24, so the wheel's −8192 is two octaves — the .mid bends past the roll's ±2 split with RPN 22", {skip: !PURSUIT && "FFX rip not on disk"}, async () => {
  const {v1, v2} = await v2Of(PURSUIT);
  assert.equal(captureDiff(v1, v2).verdict, "VELOCITY");
  const tr = v2.tracks.find(t => t.name === "ch 2 prog 4");
  assert.equal(tr.other.find(e => e.kind === "cc6").key.split(":")[1], "22", "−24 semitones real, −2 in the roll: 22 more as bend");
});
