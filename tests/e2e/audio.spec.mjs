// Audio tracks end to end, in the OPFS folder sandbox (?folder=opfs): import a
// recording, see it decode into a clip, schedule it, save it beside the .mid,
// and get it back after a reload. Chromium only (OPFS writable streams).
import { test, expect } from "@playwright/test";

const OPFS = "/index.html?folder=opfs";
const KEY = "albums/compositions/nightroll/e2e-audio.mid";

async function wipe(page) {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for await (const [n] of root.entries()) await root.removeEntry(n, { recursive: true });
    for (const k of Object.keys(localStorage)) if (k.includes("e2e-audio")) localStorage.removeItem(k);
    try { await idbAudioDelete("albums/compositions/nightroll/e2e-audio.mid|tone.wav"); } catch (e) {}
  });
}
async function open(page) {
  // pin Learning (P0): this spec predates modes; a fresh Playwright context
  // has empty localStorage, which would migrate to Normal otherwise.
  await page.addInitScript(() => { try { localStorage.setItem("ff1roll-mode", "learning"); } catch (e) {} });
  // module split (docs/split-plan.md §4 step 0b, §3.4, tests/e2e/helpers.mjs):
  // bare app globals in page.evaluate need devtools.js's window mirror.
  await page.addInitScript(() => { window.__NR_EXPOSE = true; });
  await page.route(/^(?!.*localhost)/, r => r.abort());
  await page.goto(OPFS);
  await page.waitForFunction(() => { try { return !!song; } catch (e) { return false; } }, null, { timeout: 15000 });
}

test.describe("audio tracks", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "OPFS + OfflineAudioContext decode: chromium only");
  test.afterEach(async ({ page }) => { await wipe(page); });

  test("import → clip decodes → schedules → saves beside the .mid → reloads @smoke", async ({ page }) => {
    await open(page);
    await wipe(page);
    await page.evaluate(async () => { localStorage.removeItem("ff1roll-ghtoken"); createComposition(120, 4, 4); await saveSongAs("compositions/nightroll", "e2e-audio"); });
    // import the fixture through the same path the ＋∿ chip uses
    await page.evaluate(async () => {
      const r = await fetch("/tests/e2e/fixtures/tone.wav");
      const bytes = new Uint8Array(await r.arrayBuffer());
      playCursor = barTicks(); // land at bar 2
      await importAudioFiles([{ name: "tone.wav", bytes, type: "audio/wav" }]);
    });
    const tr = await page.evaluate(() => { const t = song.tracks[song.tracks.length - 1]; return { name: t.name, kind: t.kind, at: t.clips && t.clips[0].at }; });
    expect(tr.name).toBe("tone");
    expect(tr.kind).toBe("audio");
    expect(tr.at).toBe(4 * 480);
    // the OfflineAudioContext decode lands without any user gesture
    await page.waitForFunction(() => song.tracks[song.tracks.length - 1].clips[0].status === "ready", null, { timeout: 10000 });
    const clip = await page.evaluate(() => { const c = song.tracks[song.tracks.length - 1].clips[0]; return { dur: c.dur, peaks: c.peaks.length, where: c.where, offset: c.offset }; });
    expect(clip.dur).toBeCloseTo(1.0, 1);
    expect(clip.peaks).toBeGreaterThan(100);
    expect(clip.where).toBe("device");
    // import trimmed the fixture's 250ms of leading silence on arrival: the first sound sits on bar 2
    const off = clip.offset;
    expect(off).toBeGreaterThan(0.2);
    expect(off).toBeLessThan(0.3);
    // one piece event in the schedule: it starts AT bar 2 (= 2s at 120bpm) and plays the file from `offset` to its end
    const ev = await page.evaluate(() => { buildSchedule(); return schedEvents.filter(e => e.n._clip).map(e => ({ sec: e.sec, dur: e.dur })); });
    expect(ev.length).toBe(1);
    expect(ev[0].sec).toBeCloseTo(2, 3);
    expect(ev[0].dur).toBeCloseTo(1 - off, 2);
    // re-align from the sheet is idempotent
    await page.evaluate(() => { const ti = song.tracks.length - 1; setClipDir(ti, 0, { offset: clipOnsetSec(song.tracks[ti].clips[0]) }); });
    expect(await page.evaluate(() => song.tracks[song.tracks.length - 1].clips[0].offset)).toBeCloseTo(off, 3);
    // split at bar 2 + one beat: two pieces, the right one picking the file up where the left stops
    const pieces = await page.evaluate(() => {
      const ti = song.tracks.length - 1;
      playCursor = 4 * 480 + 480;
      selClip = { ti, ci: 0 };
      splitSelectedClipAtCursor();
      return song.tracks[ti].clips.map(c => [c.at, +c.offset.toFixed(3), +c.len.toFixed(3)]);
    });
    expect(pieces.length).toBe(2);
    expect(pieces[0][0]).toBe(4 * 480);
    expect(pieces[1][0]).toBe(5 * 480);
    expect(pieces[1][1]).toBeCloseTo(off + 0.5, 2);
    expect(pieces[0][2] + pieces[1][2]).toBeCloseTo(1 - off, 2);
    // one undo rejoins them
    await page.evaluate(() => editUndoPop());
    expect(await page.evaluate(() => song.tracks[song.tracks.length - 1].clips.length)).toBe(1);
    // Save: the bytes land in <song>.audio/ next to the .mid, and the clip knows it
    await page.evaluate(async () => { await publishSong(songKey, ghHeaders("folder"), () => {}); }); // docs/provenance-plan.md P2: commitCompositionNow -> the one publish function
    const saved = await page.evaluate(async () => {
      const f = await folderRead("albums/compositions/nightroll/e2e-audio.audio/tone.wav");
      const rn = await folderRead("albums/compositions/nightroll/e2e-audio.rollnotes.json");
      return { size: f ? f.size : 0, hasDir: (await rn.text()).includes('"type":"audio"'), where: song.tracks[song.tracks.length - 1].clips[0].where };
    });
    expect(saved.size).toBeGreaterThan(1000);
    expect(saved.hasDir).toBe(true);
    expect(saved.where).toBe("folder");
    // forget the device copies, reload: the clip comes back from the folder and decodes again
    await page.evaluate(async () => {
      for (const k of Object.keys(localStorage)) if (k.includes("e2e-audio")) localStorage.removeItem(k);
      await idbAudioDelete("albums/compositions/nightroll/e2e-audio.mid|tone.wav");
    });
    await page.goto(OPFS);
    await page.waitForFunction(() => { try { return !!song && Object.keys(CATALOG).length > 0; } catch (e) { return false; } }, null, { timeout: 15000 });
    await page.evaluate(async k => { if (songKey !== k) await loadSong(k); if (song && song.notesReady) await song.notesReady; }, KEY);
    // the boot may still be loading the last song when we get here: wait for THIS song, with tracks, clip decoded
    const state = () => page.evaluate(k => ({ songKey, want: k, tracks: song ? song.tracks.map(t => ({ n: t.name, kind: t.kind, st: t.clips && t.clips[0] && t.clips[0].status, where: t.clips && t.clips[0] && t.clips[0].where })) : null,
      notes: rollnotes.map(n => n.text), folder: folderActive() }), KEY);
    for (let i = 0; i < 150; i++) { // ~15s, with the clip's state in the failure message
      const s = await state();
      const t = s.tracks && s.tracks[s.tracks.length - 1];
      if (s.songKey === KEY && t && t.kind === "audio" && t.st === "ready") break;
      if (i === 149) throw new Error("clip never came back from the folder: " + JSON.stringify(s));
      await page.waitForTimeout(100);
    }
    const again = await page.evaluate(() => { const c = song.tracks[song.tracks.length - 1].clips[0]; return { where: c.where, at: c.at, offset: c.offset }; });
    expect(again.where).toBe("folder");
    expect(again.at).toBe(4 * 480);
    expect(again.offset).toBeCloseTo(off, 3);
  });
});
