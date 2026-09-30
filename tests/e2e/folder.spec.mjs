// Local folder mode, driven through the browser's Origin Private File System
// (?folder=opfs): the same FileSystemDirectoryHandle interface the picker
// hands out, minus the native dialog Playwright can't click. Chromium only —
// webkit's OPFS lacks createWritable.
import { test, expect } from "@playwright/test";

const OPFS = "/index.html?folder=opfs";
const KEY = "albums/compositions/nightroll/e2e-folder.mid";

async function wipe(page) { // OPFS + this song's localStorage, so runs never see each other
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for await (const [n] of root.entries()) await root.removeEntry(n, { recursive: true });
    for (const k of Object.keys(localStorage)) if (k.includes("e2e-folder")) localStorage.removeItem(k);
  });
}
async function open(page) {
  // pin Learning (P0): this spec predates modes; a fresh Playwright context
  // has empty localStorage, which would migrate to Normal otherwise.
  await page.addInitScript(() => { try { localStorage.setItem("ff1roll-mode", "learning"); } catch (e) {} });
  await page.route(/^(?!.*localhost)/, r => r.abort()); // no NSF/APU render mid-test
  await page.goto(OPFS);
  await page.waitForFunction(() => { try { return !!song; } catch (e) { return false; } }, null, { timeout: 15000 });
}

test.describe("local folder mode", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "OPFS writable streams: chromium only");
  test.afterEach(async ({ page }) => { await wipe(page); });

  test("Save writes into the folder; a reload lists and opens the song from it @smoke", async ({ page }) => {
    await open(page);
    await wipe(page);
    expect(await page.evaluate(() => folderActive() && fsRoot.mode)).toBe("opfs");
    // a new composition with one note, saved with NO token stored
    await page.evaluate(async () => {
      localStorage.removeItem("ff1roll-ghtoken");
      createComposition(120, 4, 4);
      await saveSongAs("compositions/nightroll", "e2e-folder");
      song.tracks[0].notes.push({ t: 0, d: 480, p: 60, v: 80 });
      saveDraft();
      await commitCompositionNow({ textContent: "" });
    });
    const written = await page.evaluate(async k => {
      const mid = await folderRead(k);
      const rn = await folderRead(k.replace(/\.mid$/, ".rollnotes.json"));
      const txt = await folderRead(k.replace(/\.mid$/, ".notes.txt"));
      return { mid: mid ? mid.size : 0, rn: rn ? JSON.parse(await rn.text()).version : null, txt: !!txt };
    }, KEY);
    expect(written.mid).toBeGreaterThan(20);
    expect(written.rn).toBe(1);
    expect(written.txt).toBe(true);
    // forget the device draft, come back: the catalog scan finds the folder copy
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes("e2e-folder")) localStorage.removeItem(k); });
    await page.goto(OPFS);
    await page.waitForFunction(() => { try { return !!song && Object.keys(CATALOG).length > 0; } catch (e) { return false; } }, null, { timeout: 15000 });
    const listed = await page.evaluate(k => Object.values(CATALOG).flat().some(([, p]) => p === k), KEY);
    expect(listed).toBe(true);
    await page.evaluate(async k => { await loadSong(k); }, KEY);
    await page.waitForFunction(k => songKey === k, KEY);
    expect(await page.evaluate(() => song.tracks[0].notes.length)).toBe(1);
  });
});
