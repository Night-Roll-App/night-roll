// Gesture-layer specs: real pointer events through the real canvas — the
// territory where the lasso-drag, id-collision, and off-screen-fill bugs
// lived. Chromium = desktop; webkit ≈ iPad Safari.
import { test, expect } from "@playwright/test";
import { openApp, newComposition, seedChord, selectAll, noteXY, drag, notes, cleanup } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await newComposition(page);
  await seedChord(page);
});
test.afterEach(async ({ page }) => cleanup(page));

test("drag moves the whole selection as a chord (lasso mode stays on) @smoke", async ({ page }) => {
  await selectAll(page);
  await page.evaluate(() => { lassoMode = true; draw(); });
  const from = await noteXY(page, 240, 64);
  const up3 = await page.evaluate(() => view.rowH * 3);
  await drag(page, from, { x: from.x, y: from.y - up3 });
  expect((await notes(page)).map(n => n.p).sort((a, b) => a - b)).toEqual([63, 67, 70]);
});

test("dragging a selected note's right edge resizes every selected note", async ({ page }) => {
  await page.evaluate(() => document.querySelector('#modeseg button[data-mode="select"]').click());
  await selectAll(page);
  const edge = await noteXY(page, 470, 64); // within the 8px-in-ticks grab zone of t+d=480
  const px16 = await page.evaluate(() => (240 / song.ppq) * view.pxq);
  await drag(page, edge, { x: edge.x - px16, y: edge.y });
  expect((await notes(page)).map(n => n.d)).toEqual([240, 240, 240]);
});

test("with no tool armed (the default), dragging over a note only pans", async ({ page }) => {
  const from = await noteXY(page, 240, 64);
  const before = await page.evaluate(() => view.x);
  await drag(page, from, { x: from.x - 90, y: from.y });
  expect(await page.evaluate(() => view.x)).not.toBe(before);
  expect((await notes(page)).map(n => n.t)).toEqual([0, 0, 0]); // untouched
});

test("pencil tap places one grid unit; pencil drag stretches the note @smoke", async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector('#modeseg button[data-mode="pencil"]').click();
    pencilDur = 0.25;
  });
  const at = await noteXY(page, 960, 72);
  await page.mouse.click(at.x, at.y);
  const stretchFrom = await noteXY(page, 1440, 76);
  const px480 = await page.evaluate(() => (480 / song.ppq) * view.pxq);
  await drag(page, stretchFrom, { x: stretchFrom.x + px480, y: stretchFrom.y });
  const added = (await notes(page)).slice(3);
  expect(added[0]).toMatchObject({ t: 960, d: 120, p: 72 });
  expect(added[1].p).toBe(76);
  expect(added[1].d).toBeGreaterThanOrEqual(480);
});

test("🗑 deletes the selection; ⟲ restores it @smoke", async ({ page }) => {
  await selectAll(page);
  await page.click("#delbtn");
  expect(await notes(page)).toHaveLength(0);
  await page.click("#undobtn");
  expect(await notes(page)).toHaveLength(3);
});

test("⧉ copies, 📋 pastes at the cursor — surviving a dead selection, never stacking @smoke", async ({ page }) => {
  await selectAll(page);
  await page.click("#copybtn");
  expect(await notes(page)).toHaveLength(3); // a real copy adds nothing
  await page.evaluate(() => { clearMultiSel(); playCursor = 960; }); // selection dies (the scroll case)
  await page.click("#pastebtn");
  const pasted = (await notes(page)).filter(n => n.t === 960);
  expect(pasted.map(n => n.p).sort((a, b) => a - b)).toEqual([60, 64, 67]);
  expect(await page.evaluate(() => playCursor)).toBe(1440); // paste walks the cursor to the pasted notes' end
  await page.evaluate(() => { playCursor = 960; }); // back on top of them: an identical paste refuses to stack
  await page.click("#pastebtn");
  expect(await notes(page)).toHaveLength(6);
});

test("buttons gray out when they can't act", async ({ page }) => {
  const dis = id => page.evaluate(i => document.getElementById(i).disabled, id);
  await page.evaluate(() => { clearMultiSel(); noteClipboard = null; editUndo = []; editRedo = []; draw(); });
  expect(await dis("copybtn")).toBe(true);
  expect(await dis("pastebtn")).toBe(true);
  expect(await dis("delbtn")).toBe(true);
  expect(await dis("undobtn")).toBe(true);
  expect(await dis("redobtn")).toBe(true);
  await selectAll(page);
  await page.evaluate(() => draw());
  expect(await dis("copybtn")).toBe(false);
  await page.click("#copybtn");
  expect(await dis("pastebtn")).toBe(false);
  await page.click("#delbtn"); // delete pushes undo
  expect(await dis("undobtn")).toBe(false);
  await page.click("#undobtn"); // undo fills redo
  expect(await dis("redobtn")).toBe(false);
});

test("help sheet: tabs switch sections and remember the last one", async ({ page }) => {
  // openHelp fetches help/help.html on the first open (docs/plans/2026-10-04-
  // help-out.md); awaiting it means the sections are injected before the
  // visibility check below, which would otherwise race the fetch
  await page.evaluate(() => openHelp("editor"));
  await expect(page.locator('.hsec[data-hsec="editor"]')).toBeVisible();
  await page.click('#helptabs button[data-hs="playback"]');
  await expect(page.locator('.hsec[data-hsec="playback"]')).toBeVisible();
  await expect(page.locator('.hsec[data-hsec="editor"]')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("ff1roll-helptab"))).toBe("playback");
  await page.click("#helpsheet .sheetx");
});

test("insert dialog stamps a chord and walks the cursor", async ({ page }) => {
  await page.evaluate(() => { playCursor = 1920; }); // empty bar — inserts skip notes that already exist
  await page.evaluate(() => { const w = document.getElementById("morewrap"); if (w.style.display === "none") document.getElementById("morebtn").click(); });
  await page.click("#insbtn");
  await page.click('#chquals button[data-qual="maj7"]');
  await page.click("#chinsert");
  const added = (await notes(page)).slice(3);
  expect(added).toHaveLength(4); // maj7 = four notes
  expect(await page.evaluate(() => playCursor)).toBeGreaterThan(1920);
  await page.click("#chordsheet .sheetx");
});

test("drum fill creates the kit and fills a backbeat; lane renders", async ({ page }) => {
  await page.evaluate(() => { const w = document.getElementById("morewrap"); if (w.style.display === "none") document.getElementById("morebtn").click(); });
  await page.click("#drumfillbtn");
  await page.click("#dpfill");
  const kit = await page.evaluate(() => {
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return { di, n: song.tracks[di].notes.length, laneTop: kitLaneTop() };
  });
  expect(kit.di).toBeGreaterThan(0);
  expect(kit.n).toBeGreaterThan(0);
  expect(kit.laneTop).toBeLessThan(60); // docked under the C-major chord's low C
});

test("Edit menu: undo and redo round-trip a delete", async ({ page }) => {
  await selectAll(page);
  await page.click("#delbtn");
  expect(await notes(page)).toHaveLength(0);
  await page.click("#editsheetbtn");
  await page.click("#emUndo");
  expect(await notes(page)).toHaveLength(3);
  await page.click("#editsheetbtn");
  await page.click("#emRedo");
  expect(await notes(page)).toHaveLength(0);
});

test("track volume fader: live gain, persists as a vol= annotation", async ({ page }) => {
  await page.evaluate(() => {
    ensureAudio();
    song.tracks.forEach((_, ti) => trackGain(ti));
    openVoiceMenu(1, document.querySelector("#trackrow .chip"));
  });
  const fader = page.locator('#voicemenu input[aria-label="Track volume"]');
  await fader.fill("0.5");
  await fader.dispatchEvent("input");
  await fader.dispatchEvent("change");
  const res = await page.evaluate(() => ({
    gain: trackGains[1].gain.value,
    json: JSON.parse(serializeRollnotes()).notes.find(n => n.type === "track" && n.track === "pulse2"),
  }));
  expect(res.gain).toBeCloseTo(0.5, 5);
  expect(res.json.vol).toBeCloseTo(0.5, 5);
  await page.evaluate(() => document.getElementById("voicemenu").classList.remove("on"));
});

test("velocity slider live-adjusts a selection with one undo step", async ({ page }) => {
  await page.evaluate(() => document.querySelector('#modeseg button[data-mode="select"]').click());
  await selectAll(page);
  await page.evaluate(() => {
    const sl = document.getElementById("velslider");
    sl.value = 112;
    sl.dispatchEvent(new Event("input"));
    sl.dispatchEvent(new Event("change"));
  });
  expect((await notes(page)).map(n => n.v)).toEqual([112, 112, 112]);
  await page.click("#undobtn");
  expect((await notes(page)).map(n => n.v)).toEqual([80, 80, 80]);
});

test("cycle parks on ruler tap, re-arms on tap inside, double-tap deletes it; ⏮ goes to an armed cycle's start, bar 1 when parked", async ({ page }) => {
  const rulerXY = tk => page.evaluate(t => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + RULER_W + (t / song.ppq) * view.pxq - view.x, y: r.top + 10 };
  }, tk);
  await drag(page, await rulerXY(480), await rulerXY(1920)); // drag arms the cycle
  expect(await page.evaluate(() => ({ a: rangeSel.a, cyc: !!rangeSel.cycle, off: !!rangeSel.off })))
    .toEqual({ a: 480, cyc: true, off: false });
  await page.evaluate(() => document.getElementById("rwbtn").click());
  expect(await page.evaluate(() => playCursor)).toBe(480); // ⏮ honors the armed cycle
  const away = await rulerXY(240); // plain tap outside the span: parks, doesn't destroy
  await page.mouse.click(away.x, away.y);
  expect(await page.evaluate(() => rangeSel && rangeSel.off)).toBe(true);
  await page.evaluate(() => document.getElementById("rwbtn").click());
  expect(await page.evaluate(() => playCursor)).toBe(0); // a switched-off span no longer owns ⏮ — bar 1 (Josh, 2026-10-05, #470)
  const inside = await rulerXY(960); // tap the dimmed span: re-armed, same bounds
  await page.mouse.click(inside.x, inside.y);
  expect(await page.evaluate(() => ({ a: rangeSel.a, b: rangeSel.b, off: !!rangeSel.off })))
    .toEqual({ a: 480, b: 1920, off: false });
  await page.waitForTimeout(400); // past the double-tap window
  await page.mouse.dblclick(inside.x, inside.y); // double-tap the span: deleted (Josh, 2026-10-05, #150)
  expect(await page.evaluate(() => rangeSel)).toBe(null);
});

test("full-song move drags sections and the loop along (intro-cut workflow)", async ({ page }) => {
  await page.evaluate(() => {
    rollnotes = deriveNoteTypes([
      { b1: 1, q1: 1, b2: 1, q2: 2, text: "section: A", added: true },
      { b1: 1, q1: 3, text: "loop: 1.2", added: true },
    ]).map(resolveNote);
    finalizeNotes();
  });
  await selectAll(page);
  await page.evaluate(() => nudgeSelection(song.ppq, 0)); // whole song right one beat
  const rn = await page.evaluate(() => rollnotes.map(n => ({ q1: n.q1, text: n.text, sec: !!n.section })));
  expect(rn.find(n => n.sec).q1).toBe(2);
  expect(rn.find(n => n.text.startsWith("loop")).text).toBe("loop: 1.3");
});

test("left edge of a selected note drags the start; the end stays put", async ({ page }) => {
  await page.evaluate(() => document.querySelector('#modeseg button[data-mode="select"]').click());
  await selectAll(page);
  const edge = await noteXY(page, 8, 64); // near t=0, inside the left grab zone
  const px16 = await page.evaluate(() => (240 / song.ppq) * view.pxq);
  await drag(page, edge, { x: edge.x + px16, y: edge.y });
  expect((await notes(page)).map(n => ({ t: n.t, d: n.d }))).toEqual([
    { t: 240, d: 240 }, { t: 240, d: 240 }, { t: 240, d: 240 }]); // t+d unchanged at 480
});

test("dragging a section band's right edge moves its boundary and persists", async ({ page }) => {
  await page.evaluate(() => {
    rollnotes = deriveNoteTypes([
      { b1: 1, q1: 1, b2: 1, q2: 2, text: "section: A", added: true },
    ]).map(resolveNote);
    finalizeNotes(); draw();
  });
  const bandXY = tk => page.evaluate(t => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + RULER_W + (t / song.ppq) * view.pxq - view.x,
             y: r.top + BASE_RULER_H + LANE_H / 2 };
  }, tk);
  const end = await page.evaluate(() => rollnotes[0].end);
  await drag(page, await bandXY(end), await bandXY(end + 960)); // out two beats
  expect(await page.evaluate(() => ({ q2: rollnotes[0].q2, added: rollnotes[0].added })))
    .toEqual({ q2: 4, added: true });
});

test("double-tap a band opens its annotation editor", async ({ page }) => {
  await page.evaluate(() => {
    rollnotes = deriveNoteTypes([
      { b1: 1, q1: 1, b2: 1, q2: 2, text: "section: A", added: true },
    ]).map(resolveNote);
    finalizeNotes(); draw();
  });
  const mid = await page.evaluate(() => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + RULER_W + (rollnotes[0].start + rollnotes[0].end) / 2 / song.ppq * view.pxq - view.x,
             y: r.top + BASE_RULER_H + LANE_H / 2 };
  });
  await page.mouse.click(mid.x, mid.y);
  expect(await page.evaluate(() => document.getElementById("noteeditor").classList.contains("on"))).toBe(false);
  await page.mouse.click(mid.x, mid.y); // second tap within the window
  expect(await page.evaluate(() => document.getElementById("noteeditor").classList.contains("on"))).toBe(true);
});

test("LCD readouts open their annotations: tempo, meter, key", async ({ page }) => {
  const editorOn = () => page.evaluate(() => document.getElementById("noteeditor").classList.contains("on"));
  const editorType = () => page.evaluate(() => document.getElementById("ntype").value);
  const close = () => page.evaluate(() => document.getElementById("ncancel").click());
  await page.evaluate(() => document.getElementById("lcdtempo").click());
  expect(await editorOn()).toBe(true);
  expect(await editorType()).toBe("tempo");
  await close();
  await page.evaluate(() => document.getElementById("lcdmeter").click());
  expect(await editorType()).toBe("timesig");
  await close();
  await page.evaluate(() => document.getElementById("lcdkey").click());
  expect(await editorType()).toBe("key");
});

test("two-finger drag pans even with pencil armed (no note lands)", async ({ page }) => {
  await page.evaluate(() => document.querySelector('#modeseg button[data-mode="pencil"]').click());
  await page.evaluate(() => { view.pxq = 600; clampView(); draw(); }); // content wider than the viewport, so panning has room
  const before = await page.evaluate(() => ({ x: view.x, n: song.tracks[0].notes.filter(n => !n.gone).length }));
  await page.evaluate(() => {
    const r = canvas.getBoundingClientRect();
    const ev = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: id, clientX: r.left + x, clientY: r.top + y, isPrimary: id === 1, bubbles: true }));
    ev("pointerdown", 1, 300, 200);
    ev("pointerdown", 2, 300, 300); // second finger: the gesture becomes pinch/pan
    for (let i = 1; i <= 6; i++) { ev("pointermove", 1, 300 - i * 20, 200); ev("pointermove", 2, 300 - i * 20, 300); }
    ev("pointerup", 1, 180, 200); ev("pointerup", 2, 180, 300);
  });
  const after = await page.evaluate(() => ({ x: view.x, n: song.tracks[0].notes.filter(n => !n.gone).length }));
  expect(after.x).toBeGreaterThan(before.x); // fingers left -> view scrolled right
  expect(after.n).toBe(before.n); // the pencil's finger-down note was rolled back
});

test("pen: fast stroke over a note pans; a dwell grabs it (hold-to-drag)", async ({ page }) => {
  await page.evaluate(() => document.querySelector('#modeseg button[data-mode="select"]').click());
  await selectAll(page);
  await page.evaluate(() => { view.pxq = 600; clampView(); draw(); });
  const start = await noteXY(page, 240, 64);
  const pen = (type, x, y) => page.evaluate(([tp, px, py]) => {
    canvas.dispatchEvent(new PointerEvent(tp, { pointerId: 7, pointerType: "pen",
      clientX: px, clientY: py, isPrimary: true, bubbles: true }));
  }, [type, x, y]);
  // fast stroke: down, immediately sweep, up — the selection must not move
  await pen("pointerdown", start.x, start.y);
  for (let i = 1; i <= 5; i++) await pen("pointermove", start.x - i * 30, start.y);
  await pen("pointerup", start.x - 150, start.y);
  expect((await notes(page)).map(n => n.t)).toEqual([0, 0, 0]);
  // dwell: down, wait past the hold, then sweep — now it drags
  const s2 = await noteXY(page, 240, 64);
  await pen("pointerdown", s2.x, s2.y);
  await page.waitForTimeout(320);
  const px16 = await page.evaluate(() => (240 / song.ppq) * view.pxq);
  for (let i = 1; i <= 4; i++) await pen("pointermove", s2.x + (px16 / 4) * i, s2.y);
  await pen("pointerup", s2.x + px16, s2.y);
  expect((await notes(page)).map(n => n.t)).toEqual([240, 240, 240]);
});

test("finger pencil: fast stroke adds nothing; a tap or a dwell adds a note (the Apple Pencil draws at once — next test)", async ({ page }) => {
  await page.evaluate(() => document.querySelector('#modeseg button[data-mode="pencil"]').click());
  await page.evaluate(() => { view.pxq = 600; clampView(); draw(); });
  const spot = await noteXY(page, 480, 70); // empty row
  const pen = (type, x, y) => page.evaluate(([tp, px, py]) => {
    canvas.dispatchEvent(new PointerEvent(tp, { pointerId: 8, pointerType: "touch",
      clientX: px, clientY: py, isPrimary: true, bubbles: true }));
  }, [type, x, y]);
  await pen("pointerdown", spot.x, spot.y); // fast sweep: no note
  for (let i = 1; i <= 5; i++) await pen("pointermove", spot.x - i * 30, spot.y);
  await pen("pointerup", spot.x - 150, spot.y);
  expect(await notes(page)).toHaveLength(3);
  await pen("pointerdown", spot.x, spot.y); // clean tap: note lands on release
  await pen("pointerup", spot.x, spot.y);
  expect(await notes(page)).toHaveLength(4);
  const spot2 = await noteXY(page, 960, 70);
  await pen("pointerdown", spot2.x, spot2.y); // dwell: note lands via the timer, then stretches
  await page.waitForTimeout(320);
  await pen("pointerup", spot2.x, spot2.y);
  expect(await notes(page)).toHaveLength(5);
});

test("Apple Pencil pencil (setting on): a stroke places a note at once, no dwell", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("ff1roll-peninstant", "1"));
  await page.evaluate(() => document.querySelector('#modeseg button[data-mode="pencil"]').click());
  await page.evaluate(() => { view.pxq = 600; clampView(); draw(); });
  const spot = await noteXY(page, 480, 70); // empty row
  const pen = (type, x, y) => page.evaluate(([tp, px, py]) => {
    canvas.dispatchEvent(new PointerEvent(tp, { pointerId: 9, pointerType: "pen",
      clientX: px, clientY: py, isPrimary: true, bubbles: true }));
  }, [type, x, y]);
  await pen("pointerdown", spot.x, spot.y);
  for (let i = 1; i <= 3; i++) await pen("pointermove", spot.x + i * 10, spot.y);
  await pen("pointerup", spot.x + 30, spot.y);
  expect(await notes(page)).toHaveLength(4);
});

test("ruler taps keep the lasso; ➗ divides into triplets", async ({ page }) => {
  await selectAll(page);
  const r = await page.evaluate(() => canvas.getBoundingClientRect().left);
  await page.mouse.click(r + 500, await page.evaluate(() => canvas.getBoundingClientRect().top + 10));
  expect(await page.evaluate(() => multiSel.length)).toBe(3); // ruler tap kept the selection
  await page.evaluate(() => { const w = document.getElementById("morewrap"); if (w.style.display === "none") document.getElementById("morebtn").click(); });
  await page.click("#divbtn");
  await page.evaluate(() => { for (const b of document.querySelectorAll("#divchips button")) if (b.textContent === "3") b.click(); });
  expect((await notes(page)).length).toBe(9); // three quarters -> nine triplet eighths
  await page.click("#undobtn");
  expect((await notes(page)).length).toBe(3);
});

test("Drummer: generate, reroll, take chips replay, one undo restores @smoke", async ({ page }) => {
  await page.evaluate(() => {
    song.tracks[0].notes.push({ t: 1920, d: 1920, p: 64, v: 80 }); // melody sounds in bar 2 too
    song.tracks.push({ name: "triangle", notes: [{ t: 0, d: 960, p: 45, v: 90 }, { t: 1920, d: 1440, p: 41, v: 90 }] });
    if (song.rawNotes) song.rawNotes.push([]);
    trackState.push({ muted: false, solo: false });
    renderTrackbar(); computeSongEnd();
  });
  await page.evaluate(() => openDrummer());
  await page.evaluate(() => { document.getElementById("drfrom").value = 1; document.getElementById("drto").value = 2;
    segSet("drbusy", 3); segSet("drhard", 4); });
  const kit = () => page.evaluate(() => {
    const di = song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    return di < 0 ? [] : song.tracks[di].notes.filter(n => !n.gone).map(n => ({ t: n.t, p: n.p, v: n.v }));
  });
  await page.click("#drgen");
  const take1 = await kit();
  expect(take1.length).toBeGreaterThan(8);
  expect(take1.find(h => h.t === 0 && h.p === 36)).toBeTruthy(); // kick on 1
  await page.click("#drgen"); // reroll: different take, still one generation live
  const take2 = await kit();
  expect(take2.map(h => h.v).join()).not.toBe(take1.map(h => h.v).join());
  await page.evaluate(() => { // tap take 1's chip: exact replay
    document.querySelector("#drtakes button").click();
  });
  expect(await kit()).toEqual(take1);
  await page.click("#drummersheet .sheetx");
  await page.click("#undobtn"); // one step back to take 2's state
  expect(await kit()).toEqual(take2);
});

test("cycle highlight stretches by its edges, both directions", async ({ page }) => {
  const xy = tk => page.evaluate(t => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + RULER_W + (t / song.ppq) * view.pxq - view.x, y: r.top + 10 };
  }, tk);
  await drag(page, await xy(480), await xy(960)); // arm a one-beat cycle
  const b0 = await page.evaluate(() => ({ a: rangeSel.a, b: rangeSel.b }));
  await drag(page, await xy(b0.b), await xy(1440)); // right edge further right
  expect(await page.evaluate(() => rangeSel.b)).toBe(1440);
  await drag(page, await xy(480), await xy(240)); // left edge further left
  expect(await page.evaluate(() => ({ a: rangeSel.a, b: rangeSel.b }))).toEqual({ a: 240, b: 1440 });
  await drag(page, await xy(240), await xy(720)); // left edge back right (shrink)
  expect(await page.evaluate(() => rangeSel.a)).toBe(720);
});

test("tracks view: lasso across lanes, ghost-drag retrack, fader persists", async ({ page }) => {
  await page.evaluate(() => {
    song.tracks.push({ name: "pulse2b", notes: [] });
    if (song.rawNotes) song.rawNotes.push([]);
    trackState.push({ muted: false, solo: false });
    renderTrackbar(); computeSongEnd();
    setViewMode("tracks");
  });
  await page.evaluate(() => { lassoMode = true; draw(); });
  const geom = await page.evaluate(() => {
    const g = laneGeom(0), r = canvas.getBoundingClientRect();
    return { top: r.top, left: r.left, y0: g.y0, lh: g.lh, ppt: pxPerTick() };
  });
  // lasso the first lane's whole first bar
  await drag(page, { x: geom.left + 200, y: geom.top + geom.y0 + 20 }, // clear of the playhead handle zone
                   { x: geom.left + 150 + 1920 * geom.ppt, y: geom.top + geom.y0 + geom.lh - 4 });
  expect(await page.evaluate(() => multiSel.length)).toBe(3);
  // hold-to-grab a selected note, then drag one lane down (pen = dwell first)
  const noteXYt = await page.evaluate(() => {
    const g = laneGeom(0), r = canvas.getBoundingClientRect();
    const n = song.tracks[0].notes[0];
    return { x: r.left + RULER_W + (n.t + 120) * pxPerTick() - view.x, y: r.top + tracksNoteY(g, 0, n.p) };
  });
  await page.mouse.move(noteXYt.x, noteXYt.y);
  await page.mouse.down();
  await page.waitForTimeout(300); // mouse grabs instantly; dwell for pens — either way armed by now
  await page.mouse.move(noteXYt.x, noteXYt.y + geom.lh, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => song.tracks[1].notes.filter(n => !n.gone).length)).toBe(3);
  expect(await page.evaluate(() => song.tracks[0].notes.filter(n => !n.gone).length)).toBe(0);
  await page.click("#undobtn"); // one step back
  expect(await page.evaluate(() => song.tracks[0].notes.filter(n => !n.gone).length)).toBe(3);
  await page.evaluate(() => setViewMode("roll"));
});

test("phone-size boot: song loads with the panel folded (no TDZ bricks) @smoke", async ({ browser }) => {
  // phones default the bottom panel folded, which runs the chrome/View-menu
  // path during boot — the exact path that bricked every iPhone (editOn TDZ)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => { /* fresh storage = phone-folded default */ });
  // module split (docs/split-plan.md §4 step 0b, §3.4, tests/e2e/helpers.mjs):
  // bare app globals in page.evaluate need devtools.js's window mirror.
  await page.addInitScript(() => { window.__NR_EXPOSE = true; });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => { try { return !!song; } catch (e) { return false; } }, null, { timeout: 15000 });
  expect(errors).toEqual([]);
  // footer v2 (2026-09-30): folding is a class now (footer.folded > :not(#readline)
  // {display:none}), not style.display="none" — it must hide only line 2, never
  // the #readline readout (listener mode's own !important rule hides the whole
  // footer here too, checked separately below once that's turned off).
  expect(await page.evaluate(() => document.querySelector("footer").classList.contains("folded"))).toBe(true); // folded
  // listener mode: phone boots as a PLAYER — chrome hidden, transport + Full app visible
  expect(await page.evaluate(() => document.body.classList.contains("listener"))).toBe(true);
  const vis = id => page.evaluate(i => {
    const el = document.getElementById(i);
    return !!el && getComputedStyle(el).display !== "none";
  }, id);
  expect(await vis("filesheetbtn")).toBe(false);
  expect(await vis("viewsheetbtn")).toBe(false);
  expect(await vis("playbtn")).toBe(true);
  expect(await vis("fullappbtn")).toBe(true);
  // annotations fold away: no section/chord band lanes, no subtitle strip —
  // RULER_H is just the number row + the playhead strip now (2026-10-03),
  // always present regardless of mode; STRIP_Y is the old "no bands" value.
  expect(await page.evaluate(() => STRIP_Y === BASE_RULER_H)).toBe(true);
  expect(await vis("subtitle")).toBe(false);
  // Full app escape: never strand — one tap restores the DAW, pref persists
  await page.click("#fullappbtn");
  expect(await page.evaluate(() => document.body.classList.contains("listener"))).toBe(false);
  expect(await vis("filesheetbtn")).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("ff1roll-listener"))).toBe("0");
  // footer v2: listener mode is off now, but the footer is still FOLDED (its
  // own separate pref) — line 2's buttons hide, but #readline/#noteinfo (the
  // readout) must stay up, same as ▴ #panelshow needing it to say why it's there.
  expect(await page.evaluate(() => document.querySelector("footer").classList.contains("folded"))).toBe(true);
  expect(await vis("noteinfo")).toBe(true);
  expect(await vis("lassobtn")).toBe(false);
  await ctx.close();
});

test("voice menu: tapping a different track's chip closes the menu instead of leaving it open on the old track (Josh, traced 2026-09-29)", async ({ page }) => {
  // a first tap on the ALREADY-selected track (track 0, the default) is a
  // "second tap" by the chip's own logic — it opens the voice menu directly
  // the chip's NAME: its middle is now the M/S/H buttons (H joined 2026-09-29)
  await page.click("#trackrow .chip:nth-child(1) > span:nth-child(2)");
  await expect(page.locator("#voicemenu")).toHaveClass(/(^|\s)on(\s|$)/);
  // a first tap on a DIFFERENT track's chip must close the stale menu, not
  // leave it open still pointing at track 0 (the tap-away closer used to
  // exempt every chip, not just the one the menu belongs to)
  await page.click("#trackrow .chip:nth-child(2) > span:nth-child(2)");
  await expect(page.locator("#voicemenu")).not.toHaveClass(/(^|\s)on(\s|$)/);
  expect(await page.evaluate(() => selTrack)).toBe(1);
});
