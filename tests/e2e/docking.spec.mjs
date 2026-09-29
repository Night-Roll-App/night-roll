// Docking layouts, measured (Josh, 2026-09-29: "this should be something that
// is easily testable" — after Left docking broke on his iPad and the ⏳ chip
// was clipped). Every dockable window is docked Left, Right (Full height and
// Beside the roll) and Bottom; the panel must sit at its edge, the roll must
// never overlap a dock, and the footer's last chip must be fully visible.
// Seeds a saved floating spot first: the gap bug came from one a fresh
// profile lacked. CI only (CLAUDE.md: never run the suite locally).
import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

const WINDOWS = ["asksheet", "notelistsheet", "instsheet", "jobssheet", "pubjobsheet", "infosheet"];

test.use({ viewport: { width: 1366, height: 1024 } });

async function setup(page) {
  await page.addInitScript(() => {
    localStorage.setItem("ff1roll-sheetpos-asksheet", JSON.stringify({tx: 120, ty: 180, w: "520px", h: "600px"}));
    localStorage.removeItem("ff1roll-wm");
  });
  await openApp(page);
}
const box = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return {l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height}; }, sel);
const overlaps = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;

async function footerLastVisible(page) {
  return page.evaluate(() => {
    const f = document.querySelector("footer"), fr = f.getBoundingClientRect();
    const kids = [...f.children].filter(k => k.offsetParent !== null && getComputedStyle(k).display !== "none");
    const last = kids[kids.length - 1], lr = last.getBoundingClientRect();
    return lr.left >= fr.left - 1 && lr.right <= fr.right + 1 && lr.top >= fr.top - 1 && lr.bottom <= fr.bottom + 1;
  });
}

for (const id of WINDOWS) {
  test(`${id}: docks at each edge without overlapping the roll`, async ({ page }) => {
    await setup(page);
    await page.evaluate(i => document.getElementById(i).classList.add("on"), id);
    const W = 1366, H = 1024;
    for (const [side, mode] of [["left", "full"], ["left", "inner"], ["right", "full"], ["right", "inner"]]) {
      await page.evaluate(([i, s, m]) => { wmFloat(i); wmDockSide(i, s, m); }, [id, side, mode]);
      await page.waitForTimeout(150);
      const p = await box(page, `#${id} .sheet`), roll = await box(page, "#roll");
      if (side === "left") expect(p.l, `${side}/${mode}: panel at the left edge`).toBeLessThanOrEqual(1);
      else expect(p.r, `${side}/${mode}: panel at the right edge`).toBeGreaterThanOrEqual(W - 1);
      if (mode === "full") { expect(p.t).toBeLessThanOrEqual(1); expect(p.b).toBeGreaterThanOrEqual(H - 1); }
      expect(p.w, `${side}/${mode}: a real width`).toBeGreaterThan(200);
      expect(overlaps(p, roll), `${side}/${mode}: roll and dock do not overlap`).toBe(false);
      expect(await footerLastVisible(page), `${side}/${mode}: the footer's last chip is fully visible`).toBe(true);
    }
    await page.evaluate(i => { wmFloat(i); wmDockBottomWindow(i); }, id);
    await page.waitForTimeout(150);
    const p = await box(page, `#${id} .sheet`), roll = await box(page, "#roll");
    expect(p.b, "bottom: panel at the bottom edge").toBeGreaterThanOrEqual(H - 1);
    expect(overlaps(p, roll), "bottom: roll and dock do not overlap").toBe(false);
    await page.evaluate(i => wmFloat(i), id);
    await page.waitForTimeout(150);
    const f = await box(page, `#${id} .sheet`), whole = await box(page, "#roll");
    expect(whole.w, "floating again: the roll gets its full width back").toBeGreaterThanOrEqual(W - 2);
    expect(f.w).toBeGreaterThan(0);
  });
}

test("moving a docked window Right → Left docks it left (it floated back, 2026-09-29)", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { document.getElementById("asksheet").classList.add("on"); wmDockSide("asksheet", "right", "full"); });
  await page.waitForTimeout(150);
  await page.evaluate(() => wmDockSide("asksheet", "left", "full"));
  await page.waitForTimeout(150);
  const p = await box(page, "#asksheet .sheet");
  expect(p.l).toBeLessThanOrEqual(1);
  expect(p.t).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => !!document.getElementById("asksheet").closest("#dockleft, #dockleftinner"))).toBe(true);
});

test("two windows share the bottom, side by side", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { for (const i of ["asksheet", "notelistsheet"]) { document.getElementById(i).classList.add("on"); wmDockBottomWindow(i); } });
  await page.waitForTimeout(150);
  const a = await box(page, "#asksheet .sheet"), n = await box(page, "#notelistsheet .sheet"), roll = await box(page, "#roll");
  expect(overlaps(a, n)).toBe(false);
  expect(overlaps(a, roll) || overlaps(n, roll)).toBe(false);
  expect(Math.abs(a.t - n.t)).toBeLessThanOrEqual(1);
});
