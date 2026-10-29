// Loop seam: dragging the amber spans' edges on the ruler (Josh, 2026-10-28).
import { test, expect } from "@playwright/test";
import { openApp, newComposition, seedChord, drag, cleanup } from "./helpers.mjs";

test.beforeEach(async ({ page }) => { await openApp(page); await newComposition(page); await seedChord(page); });
test.afterEach(async ({ page }) => cleanup(page));

test("a seam clears the ruler selection and its span edges drag longer", async ({ page }) => {
  await page.evaluate(() => {
    const bt = barTicks();
    songEndTick = Math.max(songEndTick, 12 * bt);
    view.x = 0; view.pxq = 50; // a bar = 200 px: every edge on screen (an off-screen edge is not grabbable)
    rangeSel = {a: 0, b: 2 * bt, cycle: true};
    seamStart([{a: bt, b: 2 * bt}, {a: 4 * bt, b: 5 * bt}], "pair");
    draw();
  });
  expect(await page.evaluate(() => rangeSel)).toBeNull();
  const pt = await page.evaluate(() => { // the first span's right edge on the ruler
    const r = canvas.getBoundingClientRect(), bt = barTicks();
    return {x: r.left + RULER_W + (2 * bt / song.ppq) * view.pxq - view.x, y: r.top + 10, bx: (bt / song.ppq) * view.pxq};
  });
  await drag(page, {x: pt.x, y: pt.y}, {x: pt.x + pt.bx, y: pt.y});
  const spans = await page.evaluate(() => seam.spans);
  const bt = await page.evaluate(() => barTicks());
  expect(spans[0]).toEqual({a: bt, b: 3 * bt});
  expect(spans[1]).toEqual({a: 4 * bt, b: 5 * bt});
});
