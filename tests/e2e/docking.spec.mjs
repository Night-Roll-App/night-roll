// Docking layouts, measured (Josh, 2026-09-29: "this should be something that
// is easily testable" — after Left docking broke on his iPad and the ⏳ chip
// was clipped). Every dockable window is docked Left, Right (Full height and
// Beside the roll) and Bottom; the panel must sit at its edge, the roll must
// never overlap a dock, and the footer's last chip must be fully visible.
// Seeds a saved floating spot first: the gap bug came from one a fresh
// profile lacked. CI only (CLAUDE.md: never run the suite locally).
import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

// infosheet (Status) is registered but NOT dockable (Josh, 2026-09-29) — a
// one-shot reveal for a truncated status line, same as the import hub.
// moresheet was a real window too (footer v2 tweaks, 2026-09-30) — back to a
// drop-up, never dockable (chrome density pass, 2026-10-01, Josh: "a whole
// window popping up and it's just unnecessary"), so it's OUT of this list.
// pubjobsheet (the publish job dialog) left it 2026-10-04 (Terminal #111:
// "a very temporary window"); syncsheet (the Publish window) joined.
const WINDOWS = ["asksheet", "notelistsheet", "instsheet", "jobssheet", "syncsheet", "studysheet"];

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
      // footer v2 (2026-09-30) → chrome density pass (2026-10-01): #noteinfo
      // (the readout, #readline's growing cell) must not be squeezed down to
      // nothing by a narrowed #songregion — the bug a 6-note lasso chord hit
      // at ~1030px. #readline sits inline in the button row now (flex: 1 1
      // 300px) and only drops to its own full-width line (.ownrow) when
      // fitReadline() finds under 300px left for it — so the honest check is
      // either shape: a real 300px+ readout inline, OR its own full row at a
      // substantial share of the footer.
      const ni = await box(page, "#noteinfo"), foot = await box(page, "footer");
      const ownrow = await page.evaluate(() => document.getElementById("readline").classList.contains("ownrow"));
      const wide = ni.w >= 300;
      const ownRowWide = ownrow && ni.w >= foot.w * 0.6;
      expect(wide || ownRowWide, `${side}/${mode}: #noteinfo ≥ 300px, or its own row at ≥ 60% of the footer (ownrow=${ownrow}, ni.w=${ni.w}, foot.w=${foot.w})`).toBe(true);
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

// ---- Phase B: drag-to-dock (a real pointer drag) + tab groups + the
// widened divider ceiling (Josh, 2026-09-29, iPad: "drag the divider nearly
// all the way across to hide the roll for a minute, then drag back").

async function dragTitleTo(page, id, x, y) {
  const h2 = await page.locator(`#${id}-h2`).boundingBox();
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 }); // past both the 8px drag threshold and, usually, into a zone
  await page.waitForTimeout(50);
}

test("drag-to-dock: dragging the AI window's title into the left edge zone docks it left; dragging a docked window's title back into the middle floats it", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => document.getElementById("asksheet").classList.add("on"));
  await page.waitForTimeout(150);
  await dragTitleTo(page, "asksheet", 20, 512); // deep in the left 15% zone (1366*0.15≈205px), past its own half-boundary too: FULL height
  await expect(page.locator("#wmdropzone")).toHaveClass(/(^|\s)on(\s|$)/);
  await page.mouse.up();
  await page.waitForTimeout(150);
  await expect(page.locator("#wmdropzone")).not.toHaveClass(/(^|\s)on(\s|$)/);
  expect(await page.evaluate(() => wmWhereIs(wm, "asksheet"))).toEqual({dock: "left", mode: "full"});
  const p = await box(page, "#asksheet .sheet"), roll = await box(page, "#roll");
  expect(p.l).toBeLessThanOrEqual(1);
  expect(p.t).toBeLessThanOrEqual(1);
  expect(overlaps(p, roll)).toBe(false);

  // drag the now-DOCKED window's title back out into the middle: it undocks
  // and continues under the finger, then floats where it's released
  await dragTitleTo(page, "asksheet", 683, 512); // dead center — no zone
  expect(await page.evaluate(() => !!wm.left)).toBe(false); // undocked as soon as the drag crossed the threshold, before release
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => !!wmWhereIs(wm, "asksheet"))).toBe(false);
  const f = await box(page, "#asksheet .sheet");
  expect(Math.abs((f.l + f.r) / 2 - 683)).toBeLessThan(40); // landed roughly where it was dropped, not snapped back to its old spot
});

test("drag-to-dock: dragging the AI window's title into the bottom edge zone docks it to the bottom", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => document.getElementById("asksheet").classList.add("on"));
  await page.waitForTimeout(150);
  await dragTitleTo(page, "asksheet", 683, 1010); // deep in the bottom 15% zone (1024*0.15≈154px)
  await expect(page.locator("#wmdropzone")).toHaveClass(/(^|\s)on(\s|$)/);
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => wmWhereIs(wm, "asksheet").dock)).toBe("bottom");
  const p = await box(page, "#asksheet .sheet"), roll = await box(page, "#roll");
  expect(p.b).toBeGreaterThanOrEqual(1024 - 1);
  expect(overlaps(p, roll)).toBe(false);
});

test("drag-to-dock: two windows dropped on the same side form a tab group; tapping a tab switches which one shows", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { document.getElementById("asksheet").classList.add("on"); wmDockSide("asksheet", "left", "full"); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.getElementById("notelistsheet").classList.add("on"); wmDockSide("notelistsheet", "left"); }); // dropped on the SAME (occupied) side: joins as a tab
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => wm.left.ids)).toEqual(["asksheet", "notelistsheet"]);
  expect(await page.evaluate(() => wm.left.active)).toBe("notelistsheet");
  const strip = page.locator("#dockleft-tabs");
  await expect(strip).toHaveClass(/(^|\s)on(\s|$)/);
  const tabs = strip.locator(".wmtab");
  await expect(tabs).toHaveCount(2);
  const nBefore = await box(page, "#notelistsheet .sheet"), rollBefore = await box(page, "#roll");
  expect(overlaps(nBefore, rollBefore)).toBe(false);
  // tap the OTHER (inactive) tab — asksheet's, first in ids order
  await tabs.nth(0).click();
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => wm.left.active)).toBe("asksheet");
  expect(await page.evaluate(() => document.getElementById("notelistsheet").classList.contains("on"))).toBe(false);
  const p = await box(page, "#asksheet .sheet"), roll = await box(page, "#roll");
  expect(p.l).toBeLessThanOrEqual(1);
  expect(overlaps(p, roll)).toBe(false);
});

test("the right dock's divider drags to a much higher ceiling than the old 60% (nearly hiding the roll, never quite to 0), and double-tapping it resets to the default width", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { document.getElementById("asksheet").classList.add("on"); wmDockSide("asksheet", "right", "full"); });
  await page.waitForTimeout(150);
  const divider = page.locator("#wmdivider-right-full");
  const db = await divider.boundingBox();
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2);
  await page.mouse.down();
  await page.mouse.move(10, db.y + db.height / 2, { steps: 12 }); // dragged nearly to the window's own left edge
  await page.mouse.up();
  await page.waitForTimeout(150);
  const w = await page.evaluate(() => wm.right.w);
  expect(w).toBeGreaterThan(1000); // far past the old 60%-of-1366 (≈820) ceiling
  const roll = await box(page, "#roll");
  expect(roll.w).toBeGreaterThan(10); // a grab strip of the roll survives — never fully hidden
  expect(await page.evaluate(() => document.getElementById("asksheet").getBoundingClientRect().width)).toBeGreaterThan(1000);
  // double-tap the divider (two quick taps, no drag in between): resets to the default width
  const db2 = await divider.boundingBox();
  const cx = db2.x + db2.width / 2, cy = db2.y + db2.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(100);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => wm.right.w)).toBe(380);
});
