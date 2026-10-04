// Gesture-decode tests driven headlessly: plain event objects through the
// REAL canvas pointer handlers (see harness.mjs event injection). These are
// vm ports of e2e specs — while both exist, the e2e twin is the referee;
// after a port proves itself green-for-green, the e2e copy can retire.
// Coordinates are canvas-space (the stubbed rect sits at 0,0).
import test from "node:test";
import assert from "node:assert/strict";
import { createApp, pev } from "./harness.mjs";

async function boot(name) {
  const app = await createApp();
  // New is Untitled until Save names it (2026-09-27); the tests take the sync road to the same key
  app.run(`createComposition(120, 4, 4); renameLocalKeys(songKey, "albums/compositions/nightroll/" + ${JSON.stringify(name)} + ".mid");`);
  app.run(`
    song.tracks[0].notes.push(
      {t: 0, d: 480, p: 60, v: 80}, {t: 0, d: 480, p: 64, v: 80}, {t: 0, d: 480, p: 67, v: 80});
    draw();
  `);
  return app;
}

const selectAll = (app) => app.run(`
  multiSel = song.tracks[0].notes.map((_, ni) => ({ti: 0, ni}));
  multiSelKey = new Set(multiSel.map(s => "0:" + s.ni));
  draw();
`);

const notes = (app) => JSON.parse(app.run(
  `JSON.stringify(song.tracks[0].notes.filter(n => !n.gone).map(n => ({t: n.t, d: n.d, p: n.p})))`));

// canvas-pixel position of a tick/pitch on the roll (mirror of e2e noteXY)
const noteXY = (app, tick, pitch, ti = 0) => JSON.parse(app.run(`JSON.stringify({
  x: RULER_W + (${tick} / song.ppq) * view.pxq - view.x,
  y: RULER_H + (topRow() - noteRow(${ti}, ${pitch})) * view.rowH - view.y + view.rowH / 2,
})`));

function drag(app, from, to, props = {}, steps = 8) {
  app.dispatch("roll", pev("pointerdown", { clientX: from.x, clientY: from.y, ...props }));
  for (let i = 1; i <= steps; i++) {
    app.dispatch("roll", pev("pointermove", {
      clientX: from.x + ((to.x - from.x) * i) / steps,
      clientY: from.y + ((to.y - from.y) * i) / steps, ...props }));
  }
  app.dispatch("roll", pev("pointerup", { clientX: to.x, clientY: to.y, ...props }));
}

test("gesture: right-edge drag resizes every selected note", async () => {
  const app = await boot("vm-gest-resize");
  app.run(`mode = "select"`);
  selectAll(app);
  const edge = noteXY(app, 470, 64); // within the 8px-in-ticks grab zone of t+d=480
  const px16 = app.run(`(240 / song.ppq) * view.pxq`);
  drag(app, edge, { x: edge.x - px16, y: edge.y });
  assert.deepEqual(notes(app).map(n => n.d), [240, 240, 240]);
});

test("gesture: full-song move drags sections and the loop along", async () => {
  const app = await boot("vm-gest-move");
  app.run(`
    rollnotes = deriveNoteTypes([
      {b1: 1, q1: 1, b2: 1, q2: 2, text: "section: A", added: true},
      {b1: 1, q1: 3, text: "loop: 1.2", added: true},
    ]).map(resolveNote);
    finalizeNotes();
  `);
  selectAll(app);
  app.run(`nudgeSelection(song.ppq, 0)`); // whole song right one beat
  const rn = JSON.parse(app.run(
    `JSON.stringify(rollnotes.map(n => ({q1: n.q1, text: n.text, sec: !!n.section})))`));
  assert.equal(rn.find(n => n.sec).q1, 2);
  assert.equal(rn.find(n => n.text.startsWith("loop")).text, "loop: 1.3");
});

test("gesture: second finger flips pencil into pan — note rolled back, view scrolls", async () => {
  const app = await boot("vm-gest-pinch");
  app.run(`mode = "pencil"; view.pxq = 600; clampView(); draw();`);
  const before = JSON.parse(app.run(
    `JSON.stringify({x: view.x, n: song.tracks[0].notes.filter(n => !n.gone).length})`));
  const f = (type, id, x, y) => app.dispatch("roll",
    pev(type, { pointerId: id, clientX: x, clientY: y, pointerType: "touch", isPrimary: id === 1 }));
  f("pointerdown", 1, 300, 200);
  f("pointerdown", 2, 300, 300); // second finger: the gesture becomes pinch/pan
  for (let i = 1; i <= 6; i++) { f("pointermove", 1, 300 - i * 20, 200); f("pointermove", 2, 300 - i * 20, 300); }
  f("pointerup", 1, 180, 200); f("pointerup", 2, 180, 300);
  const after = JSON.parse(app.run(
    `JSON.stringify({x: view.x, n: song.tracks[0].notes.filter(n => !n.gone).length})`));
  assert.ok(after.x > before.x, `fingers left -> view scrolled right (${before.x} -> ${after.x})`);
  assert.equal(after.n, before.n); // the pencil's finger-down note was rolled back
});

test("gesture: cycle highlight stretches by its edges, both directions", async () => {
  const app = await boot("vm-gest-cycle");
  const xy = tk => JSON.parse(app.run(
    `JSON.stringify({x: RULER_W + (${tk} / song.ppq) * view.pxq - view.x, y: 10})`));
  drag(app, xy(480), xy(960)); // arm a one-beat cycle
  const b0 = JSON.parse(app.run(`JSON.stringify({a: rangeSel.a, b: rangeSel.b})`));
  drag(app, xy(b0.b), xy(1440)); // right edge further right
  assert.equal(app.run(`rangeSel.b`), 1440);
  drag(app, xy(480), xy(240)); // left edge further left
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify({a: rangeSel.a, b: rangeSel.b})`)),
                   { a: 240, b: 1440 });
  drag(app, xy(240), xy(720)); // left edge back right (shrink)
  assert.equal(app.run(`rangeSel.a`), 720);
});

test("gesture: finger fast stroke pans; a dwell cold-grabs; selected = instant", async () => {
  const app = await boot("vm-gest-dwell");
  app.run(`mode = "select"; view.pxq = 600; clampView(); draw();`);
  const start = noteXY(app, 240, 64);
  // a finger dwells; the Apple Pencil grabs at once (2026-09-29 — next test)
  const pen = (type, x, y) => app.dispatch("roll",
    pev(type, { pointerId: 7, pointerType: "touch", clientX: x, clientY: y }));
  // fast stroke over an unselected note: pans, nothing moves, no selection churn
  pen("pointerdown", start.x, start.y);
  for (let i = 1; i <= 5; i++) pen("pointermove", start.x - i * 30, start.y);
  pen("pointerup", start.x - 150, start.y);
  assert.deepEqual(notes(app).map(n => n.t), [0, 0, 0]);
  assert.equal(app.run(`multiSel.length`), 0, "pan never reshuffles selection");
  // cold dwell with pen jitter: 12px wobble must NOT kill the hold (slop 20)
  const s2 = noteXY(app, 240, 64);
  pen("pointerdown", s2.x, s2.y);
  pen("pointermove", s2.x + 6, s2.y + 6); // jitter inside the slop
  app.tick(160);
  const px16 = app.run(`(240 / song.ppq) * view.pxq`);
  for (let i = 1; i <= 4; i++) pen("pointermove", s2.x + (px16 / 4) * i, s2.y);
  pen("pointerup", s2.x + px16, s2.y);
  assert.deepEqual(notes(app).map(n => n.t), [0, 240, 0], "cold grab moves ONLY the grabbed note");
  // the grab selected what it grabbed; a SELECTED note now drags with NO dwell
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify([...multiSelKey])`)), ["0:1"]);
  const s3 = noteXY(app, 480, 64);
  pen("pointerdown", s3.x, s3.y);
  for (let i = 1; i <= 4; i++) pen("pointermove", s3.x + (px16 / 4) * i, s3.y);
  pen("pointerup", s3.x + px16, s3.y);
  assert.deepEqual(notes(app).map(n => n.t), [0, 480, 0], "instant grab, zero dwell");
});

test("gesture: custom grid — pencil taps land on 10ths-of-a-bar cells", async () => {
  const app = await boot("vm-gest-grid");
  app.run(`mode = "pencil"; gridDiv = 10; draw();`);
  // ppq 480, 4/4: bar = 1920, cell = 192. Tap mid-bar-2 between lines.
  const bt = app.run(`barTicks()`), cell = bt / 10;
  const xy = app.run(`JSON.stringify({
    x: RULER_W + ((${bt} + ${cell} * 3.6) / song.ppq) * view.pxq - view.x,
    y: RULER_H + (topRow() - noteRow(0, 62)) * view.rowH - view.y + view.rowH / 2})`);
  const p = JSON.parse(xy);
  app.dispatch("roll", pev("pointerdown", { clientX: p.x, clientY: p.y }));
  app.dispatch("roll", pev("pointerup", { clientX: p.x, clientY: p.y }));
  const placed = notes(app).find(n => n.t >= bt);
  assert.ok(placed, "a note landed");
  assert.equal(placed.t, bt + cell * 3, "floored into the 0.4-beat cell");
  assert.equal(placed.d, cell, "tap under a custom grid = one cell");
  // snapping seam: moves use the same cell
  assert.equal(app.run(`moveSnapTicks()`), cell);
  // off restores the meter grid
  app.run(`gridDiv = null;`);
  assert.equal(app.run(`moveSnapTicks()`), app.run(`Math.round(song.ppq / 4)`));
});

test("gesture: uneven grid divisions keep one exact phase from the anchor", async () => {
  const app = await boot("vm-gest-grid7");
  app.run(`gridDiv = 7; gridAnchor = {b: 5, q: 1};`);
  // cells are exact bt/7 floats from the anchor — no per-cell rounding drift
  const bt = app.run(`barTicks()`);
  const want = Math.round(4 * bt + 3 * (bt / 7));
  assert.equal(app.run(`gridCellStart(${4 * bt + 3 * (bt / 7) + 20})`), want);
});

test("grid sheet: chip tap applies instantly; off chip restores the meter", async () => {
  const app = await boot("vm-gest-gridmenu");
  app.el("vwGrid").click(); // opens the sheet (View menu item)
  const chips = app.el("gridchips").children;
  assert.equal(chips.length, 9, "preset chips rendered");
  const ten = [...chips].find(c => c.textContent === "10");
  ten.dispatchEvent({ type: "click" });
  assert.equal(app.run(`gridDiv`), 10);
  assert.ok(app.el("gridanchor").textContent.includes("Lines run from 1.1"), "anchor explained");
  app.el("gridoff").click();
  assert.equal(app.run(`gridDiv`), null);
  app.el("gridclose").click();
});

test("gesture: grid anchor typed in the sheet — 14.2 phase, bar line not a snap target", async () => {
  const app = await boot("vm-gest-gridanchor");
  const bt = app.run(`barTicks()`), qt = app.run(`beatTicks()`);
  const a = 13 * bt + qt; // 14.2
  app.el("vwGrid").click(); // open the sheet
  app.el("gridab").value = "14"; app.el("gridaq").value = "2";
  app.el("gridab").dispatchEvent({ type: "input" });
  app.run(`gridDiv = 10;`);
  assert.equal(app.run(`gridAnchorTick()`), a, "anchor from the sheet inputs");
  const cell = bt / 10;
  // ten cells between 14.2 and 15.2, running on the anchor's phase
  assert.equal(app.run(`gridCellStart(${a + 3 * cell + 20})`), a + 3 * cell);
  // bar 15's line sits 7.5 cells in — snapping must NOT land there
  assert.equal(app.run(`gridCellStart(${14 * bt + 1})`), a + 7 * cell);
  // phase continues across the bar: 15.2 is exactly cell 10
  assert.equal(app.run(`gridCellStart(${a + 10 * cell + 5})`), a + 10 * cell);
  // default anchor 1.1 = plain bar phase (10 divides the bar evenly)
  app.run(`gridAnchor = {b: 1, q: 1};`);
  assert.equal(app.run(`gridCellStart(${13 * bt + 3 * cell + 20})`), 13 * bt + 3 * cell);
});

test("gesture: off-phase note's edge snaps TO the beat line (10-grid then 4-4)", async () => {
  const app = await boot("vm-gest-offphase");
  // a note penciled on the 10-grid: starts at cell 6.5*192=1248, 192 long,
  // ending 1440-ish? no: 1248+192=1440 exactly... use start 1152+96 off 16ths:
  // t=1056 (not a multiple of 120), d=192 -> end 1248; drag end to beat 4 (1440)
  app.run(`song.tracks[0].notes = [{t: 1056, d: 192, p: 64, v: 80}]; multiSel = [{ti:0,ni:0}];
           multiSelKey = new Set(["0:0"]); mode = "select"; draw();`);
  const edge = noteXY(app, 1248, 64);
  const target = noteXY(app, 1440, 64);
  drag(app, edge, { x: target.x, y: target.y });
  const n = notes(app)[0];
  assert.equal(n.t + n.d, 1440, "edge landed ON the beat, phase notwithstanding");
});

test("gesture: grabbing a note outside a stale selection moves ONLY that note", async () => {
  const app = await boot("vm-gest-stalesel");
  // three chord notes selected earlier (stale); a fourth note elsewhere
  app.run(`song.tracks[0].notes.push({t: 960, d: 480, p: 72, v: 80});
           multiSel = [{ti:0,ni:0},{ti:0,ni:1},{ti:0,ni:2}];
           multiSelKey = new Set(["0:0","0:1","0:2"]); mode = "select"; draw();`);
  const from = noteXY(app, 1100, 72);
  const px8 = app.run(`(240 / song.ppq) * view.pxq`);
  drag(app, from, { x: from.x + px8, y: from.y });
  const ns = notes(app);
  assert.deepEqual(ns.slice(0, 3).map(n => n.t), [0, 0, 0], "stale selection untouched");
  assert.equal(ns[3].t, 1200, "grabbed note moved alone");
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify([...multiSelKey])`)), ["0:3"],
    "selection reset to the grabbed note");
});

test("gesture: off-phase note MOVE lands ON the grid line (and-of-1)", async () => {
  const app = await boot("vm-gest-offmove");
  // a note born on the fives (t=1056, no 16th phase); drag toward beat 1.5 of
  // bar 2 (tick 2160) — must land exactly there, not 1056+n*120
  app.run(`song.tracks[0].notes = [{t: 1056, d: 240, p: 64, v: 80}]; multiSel = [{ti:0,ni:0}];
           multiSelKey = new Set(["0:0"]); mode = "select"; draw();`);
  const from = noteXY(app, 1056 + 120, 64); // grab mid-note
  const to = noteXY(app, 2160 + 120, 64);
  drag(app, from, to);
  assert.equal(notes(app)[0].t, 2160, "landed on the and of 1, phase gone");
});

test("insertTime: slide, stretch straddlers, leave exact-enders; one undo", async () => {
  const app = await boot("vm-gest-insert");
  // notes at bars 1 and 6; sections: one 1.1-5.4 (ends AT the point), one
  // 1.1-8.4 (straddles), one starting 6.1 (at the point); loop past it
  app.run(`
    song.tracks[0].notes = [{t: 0, d: 480, p: 60, v: 80}, {t: ${5*1920}, d: 480, p: 64, v: 80}];
    rollnotes = deriveNoteTypes([
      {b1: 1, q1: 1, b2: 5, q2: 4, text: "section: Ends", added: true},
      {b1: 1, q1: 1, b2: 8, q2: 4, text: "section: Straddle", added: true},
      {b1: 6, q1: 1, b2: 9, q2: 4, text: "section: At", added: true},
      {b1: 10, q1: 1, text: "loop: 2.1", added: true},
    ]).map(resolveNote);
    finalizeNotes(); editUndo = [];
  `);
  const k = app.run(`insertTime(${5 * 1920}, ${2 * 1920})`); // 2 bars at 6.1
  assert.ok(k >= 4, "moved things: " + k);
  const rn = JSON.parse(app.run(
    `JSON.stringify(rollnotes.filter(n => n.section || n.text.startsWith("loop")).map(n => ({s: n.text, b1: n.b1, b2: n.b2})))`));
  const by = t => rn.find(n => n.s.includes(t));
  assert.deepEqual([by("Ends").b1, by("Ends").b2], [1, 5], "exact-ender untouched");
  assert.deepEqual([by("Straddle").b1, by("Straddle").b2], [1, 10], "straddler stretched");
  assert.deepEqual([by("At").b1, by("At").b2], [8, 11], "at-point section slid");
  assert.equal(by("loop").b1, 12, "loop annotation slid");
  assert.deepEqual(notes(app).map(n => n.t), [0, 7 * 1920], "note after point slid 2 bars");
  app.run(`editUndoPop()`);
  assert.deepEqual(notes(app).map(n => n.t), [0, 5 * 1920], "one undo restores notes");
  const rn2 = JSON.parse(app.run(`JSON.stringify(rollnotes.filter(n => n.section).map(n => n.b2))`));
  assert.deepEqual(rn2.sort((a,b)=>a-b), [5, 8, 9], "one undo restores annotations");
});

test("gesture: with the setting on, the Apple Pencil grabs a note at once — no dwell (default off)", async () => {
  const app = await boot("vm-gest-pen");
  app.run(`mode = "select"; view.pxq = 600; clampView(); draw(); localStorage.setItem("ff1roll-peninstant", "1");`);
  const start = noteXY(app, 240, 64);
  const pen = (type, x, y) => app.dispatch("roll",
    pev(type, { pointerId: 9, pointerType: "pen", clientX: x, clientY: y }));
  const px16 = app.run(`(240 / song.ppq) * view.pxq`);
  const before = notes(app).map(n => n.t);
  pen("pointerdown", start.x, start.y);
  for (let i = 1; i <= 4; i++) pen("pointermove", start.x + (px16 / 4) * i, start.y); // fast, no dwell
  pen("pointerup", start.x + px16, start.y);
  assert.notDeepEqual(notes(app).map(n => n.t), before, "a pencil stroke on a note moves it");
});

test("gesture: a stale drag (a lift the canvas never heard) can't turn the next touch into a pinch (Josh, 2026-09-30: every drag zoomed)", async () => {
  const app = await boot("vm-gest-stale");
  app.run(`mode = "select"; view.pxq = 600; clampView(); draw();`);
  const f = (type, id, x, y, primary) => app.dispatch("roll",
    pev(type, { pointerId: id, clientX: x, clientY: y, pointerType: "touch", isPrimary: primary }));
  f("pointerdown", 1, 300, 200, true); // …and its pointerup never arrives
  const pxq0 = app.run(`view.pxq`);
  f("pointerdown", 2, 400, 200, true); // a NEW gesture's first finger
  for (let i = 1; i <= 4; i++) f("pointermove", 2, 400 - i * 30, 200, true);
  f("pointerup", 2, 280, 200, true);
  assert.equal(app.run(`!!pinch`), false, "no pinch");
  assert.equal(app.run(`view.pxq`), pxq0, "a one-finger drag doesn't zoom");
});

test("gesture: palm rejection — a touch while the Pencil is down is ignored, not a pinch", async () => {
  const app = await boot("vm-gest-palm");
  app.run(`mode = "select"; view.pxq = 600; clampView(); draw();`);
  const pxq0 = app.run(`view.pxq`);
  app.dispatch("roll", pev("pointerdown", { pointerId: 5, clientX: 300, clientY: 200, pointerType: "pen", isPrimary: true }));
  app.dispatch("roll", pev("pointerdown", { pointerId: 6, clientX: 600, clientY: 500, pointerType: "touch", isPrimary: true }));
  assert.equal(app.run(`drag && drag.id`), 5, "the Pencil's stroke survives the palm");
  app.dispatch("roll", pev("pointermove", { pointerId: 5, clientX: 250, clientY: 200, pointerType: "pen", isPrimary: true }));
  app.dispatch("roll", pev("pointerup", { pointerId: 5, clientX: 250, clientY: 200, pointerType: "pen", isPrimary: true }));
  assert.equal(app.run(`!!pinch`), false);
  assert.equal(app.run(`view.pxq`), pxq0);
});

test("gesture: a wobbly ruler tap (under 24px) places the cursor instead of arming a tiny cycle (Josh, 2026-10-02)", async () => {
  const app = await boot("vm-gest-ruler-tap");
  app.run(`view.pxq = 200; clampView(); rangeSel = null; draw();`);
  const xy = tk => JSON.parse(app.run(`JSON.stringify({x: RULER_W + (${tk} / song.ppq) * view.pxq - view.x, y: 10})`));
  const p = xy(960);
  drag(app, p, {x: p.x + 15, y: p.y}); // a finger tap that wobbles 15px — past the 8px "moved" mark
  assert.equal(app.run(`rangeSel`), null, "no 16th-note cycle");
  const cur = +app.run(`playCursor`);
  assert.ok(Math.abs(cur - 960) <= 240, "the cursor went where he tapped: " + cur);
  drag(app, xy(480), xy(1440)); // a real drag still selects
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify({a: rangeSel.a, b: rangeSel.b})`)), {a: 480, b: 1440});
});

// ---- playhead strip (Josh, 2026-10-03): a band under the ruler, right
// above the notes — tap moves the cursor, drag scrubs, and NEITHER ever
// touches rangeSel (that's the ruler's own job, above it, unchanged).
const stripXY = (app, tk) => JSON.parse(app.run(`JSON.stringify({
  x: RULER_W + (${tk} / song.ppq) * view.pxq - view.x, y: (STRIP_Y + RULER_H) / 2})`));

test("gesture: a tap on the playhead strip moves the cursor and leaves an ARMED cycle byte-identical", async () => {
  const app = await boot("vm-gest-strip-tap-armed");
  app.run(`view.pxq = 200; clampView(); rangeSel = {a: 480, b: 1440, cycle: true}; draw();`);
  const before = app.run(`JSON.stringify(rangeSel)`);
  const p = stripXY(app, 960);
  app.dispatch("roll", pev("pointerdown", { clientX: p.x, clientY: p.y }));
  app.dispatch("roll", pev("pointerup", { clientX: p.x, clientY: p.y }));
  assert.equal(app.run(`JSON.stringify(rangeSel)`), before, "rangeSel byte-identical — the strip never touches it");
  assert.equal(app.run(`playCursor`), 960, "cursor landed exactly where he tapped");
});

test("gesture: a tap on the playhead strip leaves a PARKED cycle parked — it does not re-arm it", async () => {
  const app = await boot("vm-gest-strip-tap-parked");
  app.run(`view.pxq = 200; clampView(); rangeSel = {a: 480, b: 1440, cycle: true, off: true}; draw();`);
  const before = app.run(`JSON.stringify(rangeSel)`);
  // tapping this same span ON THE RULER would re-arm it (Josh's park/re-arm) — on the strip it must not
  const p = stripXY(app, 960);
  app.dispatch("roll", pev("pointerdown", { clientX: p.x, clientY: p.y }));
  app.dispatch("roll", pev("pointerup", { clientX: p.x, clientY: p.y }));
  assert.equal(app.run(`JSON.stringify(rangeSel)`), before, "still parked, byte-identical — no park, no clear, no re-arm");
  assert.equal(app.run(`playCursor`), 960, "the cursor still moved");
});

test("gesture: a drag on the playhead strip scrubs the cursor continuously, rangeSel untouched", async () => {
  const app = await boot("vm-gest-strip-drag");
  app.run(`view.pxq = 200; clampView(); rangeSel = {a: 480, b: 1440, cycle: true}; draw();`);
  const before = app.run(`JSON.stringify(rangeSel)`);
  drag(app, stripXY(app, 240), stripXY(app, 1920));
  assert.equal(app.run(`JSON.stringify(rangeSel)`), before, "rangeSel byte-identical through a strip drag");
  assert.equal(app.run(`playCursor`), 1920, "cursor scrubbed to the drag's end (reuses scrubTo)");
});

test("gesture: the ruler itself still parks an armed cycle on tap — the strip changes nothing about it", async () => {
  const app = await boot("vm-gest-ruler-still-parks");
  app.run(`view.pxq = 200; clampView(); rangeSel = {a: 480, b: 1440, cycle: true}; draw();`);
  const p = JSON.parse(app.run(`JSON.stringify({x: RULER_W + (960 / song.ppq) * view.pxq - view.x, y: 10})`));
  app.dispatch("roll", pev("pointerdown", { clientX: p.x, clientY: p.y }));
  app.dispatch("roll", pev("pointerup", { clientX: p.x, clientY: p.y }));
  assert.equal(app.run(`rangeSel.off`), true, "the ruler tap still parks the cycle, exactly as before");
});

// ---- the playhead's handle (Josh, 2026-10-04: "I don't like the way our
// triangle cursor looks and I don't like that it's not in that little strip"):
// one rounded tag INSIDE the strip, no triangle under the ruler, and the tag
// is the drag handle — in any mode, even while playing.
// Records every path point drawStripPlayhead lays down (ctx is the harness's
// settable no-op stub) and every path point of the whole frame.
const recordPaths = (app, view) => JSON.parse(app.run(`(() => {
  viewMode = ${JSON.stringify(view)}; applyViewMode();
  const pts = [], all = []; let inTag = false;
  const real = drawStripPlayhead;
  drawStripPlayhead = (x, c) => { inTag = true; real(x, c); inTag = false; };
  const log = (x, y) => { all.push([x, y]); if (inTag) pts.push([x, y]); };
  ctx.moveTo = log; ctx.lineTo = log; ctx.arcTo = (x1, y1, x2, y2) => { log(x1, y1); log(x2, y2); };
  draw();
  drawStripPlayhead = real; delete ctx.moveTo; delete ctx.lineTo; delete ctx.arcTo;
  return JSON.stringify({pts, all, x: stripPlayheadX(), STRIP_Y, RULER_H});
})()`));

test("gesture: the playhead's handle is a tag drawn INSIDE the strip — nothing hangs below RULER_H (Roll and Tracks)", async () => {
  const app = await boot("vm-gest-tag-draw");
  app.run(`view.pxq = 200; clampView(); playCursor = 960; mode = "select";`);
  for (const view of ["roll", "tracks"]) {
    const r = recordPaths(app, view);
    assert.ok(r.pts.length >= 6, view + ": the tag is a path (sides + rounded top), got " + r.pts.length + " points");
    for (const [x, y] of r.pts) {
      assert.ok(y >= r.STRIP_Y && y <= r.RULER_H, view + ": every tag point is inside the strip band, got y=" + y + " for [" + r.STRIP_Y + ", " + r.RULER_H + "]");
      assert.ok(Math.abs(x - r.x) <= 9, view + ": the tag is centred on the playhead (18 px wide), got dx=" + (x - r.x));
    }
    assert.ok(r.pts.some(([, y]) => y === r.RULER_H), view + ": the tag's bottom is flush with RULER_H, where the line through the notes starts");
    assert.ok(!r.all.some(([, y]) => y > r.RULER_H && y <= r.RULER_H + 16), view + ": no triangle tip under the ruler any more");
  }
  app.run(`viewMode = "roll"; applyViewMode();`);
});

test("gesture: a press on the tag is a grab, not a strip tap — released still, the cursor stays put; dragged, it scrubs in 32nds; rangeSel untouched", async () => {
  const app = await boot("vm-gest-tag-grab");
  // 540 sits on the 32nd grid (60 ticks) but NOT on an 8th: a strip TAP there would snap it to 480
  app.run(`view.pxq = 200; clampView(); playCursor = 540; rangeSel = {a: 480, b: 1440, cycle: true}; mode = "pencil"; draw();`);
  const before = app.run(`JSON.stringify(rangeSel)`);
  const p = stripXY(app, 540);
  app.dispatch("roll", pev("pointerdown", { clientX: p.x, clientY: p.y }));
  assert.equal(app.run(`!!(drag && drag.onCursor && drag.stripCursor)`), true, "the tag outranks the strip's tap-to-snap, in any mode (pencil here)");
  app.dispatch("roll", pev("pointerup", { clientX: p.x, clientY: p.y }));
  assert.equal(app.run(`playCursor`), 540, "let go without moving: the cursor did not jump to the nearest 8th");
  drag(app, p, stripXY(app, 1930));
  assert.equal(app.run(`playCursor`), 1920, "a drag on the tag scrubs on the 32nd grid, like a strip drag");
  assert.equal(app.run(`JSON.stringify(rangeSel)`), before, "rangeSel byte-identical — a cursor drag never touches it");
  // 20 px past the tag's edge is the plain strip again: a tap there still snaps to the 8th
  const q = stripXY(app, 1920); q.x += 20;
  app.dispatch("roll", pev("pointerdown", { clientX: q.x, clientY: q.y }));
  assert.equal(app.run(`!!drag.onCursor`), false, "off the tag: a strip tap");
  app.dispatch("roll", pev("pointerup", { clientX: q.x, clientY: q.y }));
  assert.equal(app.run(`playCursor`), 1920, "the strip's own tap still lands on the nearest 8th");
});

test("gesture: the tag drags while PLAYING too — the tag follows the finger, and release plays on from the new spot; a still tap does nothing", async () => {
  const app = await boot("vm-gest-tag-playing");
  app.run(`ensureAudio(); view.pxq = 200; clampView(); rangeSel = {a: 480, b: 1440, cycle: true};
           playing = true; loopSeg = null; playT0 = audio.currentTime; playOffset = tickToSec(song, 960); playCursor = 0;
           globalThis.__played = []; play = (sec, opts) => { __played.push({sec, opts}); playing = true; return Promise.resolve(); };
           stop = () => { playing = false; }; draw();`);
  const before = app.run(`JSON.stringify(rangeSel)`);
  const p = stripXY(app, 960); // the rolling playhead is at tick 960
  assert.ok(Math.abs(+app.run(`stripPlayheadX()`) - p.x) < 1, "the tag is drawn at the audio's position while rolling");
  app.dispatch("roll", pev("pointerdown", { clientX: p.x, clientY: p.y }));
  assert.equal(app.run(`!!(drag && drag.onCursor && drag.stripCursor)`), true, "the tag is grabbable while playing");
  app.dispatch("roll", pev("pointerup", { clientX: p.x, clientY: p.y }));
  assert.equal(app.run(`__played.length`), 0, "a still tap on the tag neither seeks nor restarts");
  assert.equal(app.run(`playing`), true);
  const to = stripXY(app, 1920);
  app.dispatch("roll", pev("pointerdown", { clientX: p.x, clientY: p.y }));
  app.dispatch("roll", pev("pointermove", { clientX: to.x, clientY: to.y }));
  assert.ok(Math.abs(+app.run(`stripPlayheadX()`) - to.x) < 1, "mid-scrub the tag follows the finger, not the audio");
  app.dispatch("roll", pev("pointerup", { clientX: to.x, clientY: to.y }));
  const played = JSON.parse(app.run(`JSON.stringify(__played)`));
  assert.equal(played.length, 1, "release plays on from the new spot");
  assert.equal(played[0].sec, +app.run(`tickToSec(song, 1920)`), "from exactly where the finger lifted");
  assert.equal(played[0].opts.fromHere, true, "like a strip drag's release: from here, no cycle restart");
  assert.equal(app.run(`JSON.stringify(rangeSel)`), before, "rangeSel byte-identical through a mid-play cursor drag");
});

// ---- the on-screen keyboard (2026-10-04, docs/daw-inventory.md §1a) ----
// The panel's stubbed box is 800×600 (harness makeEl): 44px keys, 18.18
// whites visible, black keys down to y = 372 — taps below that are whites.
// Sustain is the spy for "did a key sound": with it on, every key instPlay
// voices lands in S.instHeld, so a silent gesture leaves it empty.
async function pianoApp(name) {
  const app = await boot(name); // the booted song is C4 E4 G4 → home = C4 at the left edge
  app.run(`instOpen = true; instTab = "piano"; instScroll = null; instSetMode("play"); instSetLock(false); instSetSustain(false); applyInst();`);
  return app;
}
// instPlay awaits resumeAudio before voicing, and resumeAudio's clockAlive
// probes sleep on the harness's FAKE clock — tick it so they fire
const settle = async (app) => { for (let i = 0; i < 40; i++) { await Promise.resolve(); app.tick(20); await Promise.resolve(); await Promise.resolve(); } };
const held = (app) => JSON.parse(app.run(`JSON.stringify([...instHeld.keys()].sort((a, b) => a - b))`));
const KEYS_Y = 500;
function keysDrag(app, from, to, props = {}, steps = 6) {
  app.dispatch("instcanvas", pev("pointerdown", { clientX: from.x, clientY: from.y, ...props }));
  for (let i = 1; i <= steps; i++) {
    app.dispatch("instcanvas", pev("pointermove", {
      clientX: from.x + ((to.x - from.x) * i) / steps,
      clientY: from.y + ((to.y - from.y) * i) / steps, ...props }));
  }
  app.dispatch("instcanvas", pev("pointerup", { clientX: to.x, clientY: to.y, ...props }));
}
// two fingers (ids 1 and 2) landing `gap` px apart and travelling dx together
function twoFingerDrag(app, x, dx, steps = 5) {
  app.dispatch("instcanvas", pev("pointerdown", { pointerId: 1, clientX: x, clientY: KEYS_Y }));
  app.dispatch("instcanvas", pev("pointerdown", { pointerId: 2, clientX: x + 100, clientY: KEYS_Y }));
  for (let i = 1; i <= steps; i++) {
    const d = (dx * i) / steps;
    app.dispatch("instcanvas", pev("pointermove", { pointerId: 1, clientX: x + d, clientY: KEYS_Y }));
    app.dispatch("instcanvas", pev("pointermove", { pointerId: 2, clientX: x + 100 + d, clientY: KEYS_Y }));
  }
  app.dispatch("instcanvas", pev("pointerup", { pointerId: 1, clientX: x + dx, clientY: KEYS_Y }));
  app.dispatch("instcanvas", pev("pointerup", { pointerId: 2, clientX: x + 100 + dx, clientY: KEYS_Y }));
}

test("keyboard geometry: 88 fixed-width keys, black keys at their real offsets, scroll clamped to the piano", async () => {
  const app = await pianoApp("vm-keys-geom");
  const g = JSON.parse(app.run(`JSON.stringify((() => { const g = pianoGeom(800, 168, 23);
    return {wW: g.wW, bw: g.bw, bh: g.bh, scroll: g.scroll, c4: g.keyX(60), cs4: g.keyX(61), ds4: g.keyX(63), fs4: g.keyX(66), gs4: g.keyX(68), as4: g.keyX(70), c5: g.keyX(72)}; })())`));
  assert.equal(g.wW, 44, "a finger-sized key, not the panel width divided by the song's range");
  assert.equal(g.c4, 0); assert.equal(g.c5, 7 * 44);
  assert.ok(Math.abs(g.bw - 44 * 0.58) < 1e-9 && Math.abs(g.bh - 168 * 0.62) < 1e-9);
  const half = g.bw / 2;
  assert.ok(Math.abs(g.cs4 - (44 - 0.09 * 44 - half)) < 1e-9, "C♯ leans toward C");
  assert.ok(Math.abs(g.ds4 - (88 + 0.09 * 44 - half)) < 1e-9, "D♯ leans toward E");
  assert.ok(g.fs4 < 176 - half, "F♯ leans toward F");
  assert.ok(Math.abs(g.gs4 - (220 - half)) < 1e-9, "G♯ is centred on its seam");
  assert.ok(g.as4 > 264 - half, "A♯ leans toward B");
  assert.equal(app.run(`PIANO_WHITES.length`), 52, "A0..C8");
  assert.equal(app.run(`pianoKeyW(400)`), 36, "phone width: a little narrower, one more octave");
  assert.equal(app.run(`pianoClampScroll(-5, 800)`), 0);
  assert.ok(Math.abs(app.run(`pianoClampScroll(999, 800)`) - (52 - 800 / 44)) < 1e-9, "the last window ends on C8, never past it");
  // home = the song's lowest octave; the readout names the window's whites
  assert.equal(app.run(`instScrollNow(800)`), 23);
  assert.equal(app.run(`document.getElementById("instrange").textContent`), "C4 – F6");
  assert.equal(app.run(`pianoHit(40, 10, 800, 168)`), 61, "the black zone just left of the C/D seam is C♯");
  assert.equal(app.run(`pianoHit(40, 160, 800, 168)`), 60, "below the black keys the same x is C4");
});

test("keyboard: ‹ › step an octave, clamp at both ends, update the readout and the device pref", async () => {
  const app = await pianoApp("vm-keys-oct");
  app.el("instoctup").click();
  assert.equal(app.run(`instScroll`), 30);
  assert.equal(app.run(`document.getElementById("instrange").textContent`), "C5 – F7");
  assert.equal(app.run(`localStorage.getItem("ff1roll-inst-scroll-piano")`), "30", "where the keys are is a device pref");
  for (let i = 0; i < 10; i++) app.el("instoctup").click();
  assert.ok(Math.abs(app.run(`instScroll`) - (52 - 800 / 44)) < 1e-9, "clamped: the window ends at C8");
  assert.ok(app.run(`document.getElementById("instrange").textContent`).endsWith("C8"));
  for (let i = 0; i < 10; i++) app.el("instoctdn").click();
  assert.equal(app.run(`instScroll`), 0, "clamped: the window starts at A0");
  assert.ok(app.run(`document.getElementById("instrange").textContent`).startsWith("A0"));
});

test("keyboard: when the whole piano fits, the keys stretch to fill the panel (DAW F1); 44 px stays the floor", async () => {
  const app = await pianoApp("vm-keys-stretch");
  // pure geometry first: a 3440 px window holds all 52 whites with room to spare
  const wW = app.run(`pianoKeyW(3440)`);
  assert.ok(Math.abs(wW - 3440 / 52) < 1e-9, "52 whites share the width: " + wW);
  assert.equal(app.run(`pianoMaxScroll(3440)`), 0, "nothing left to scroll");
  const g = JSON.parse(app.run(`JSON.stringify((() => { const g = pianoGeom(3440, 168, 0);
    return {n: g.whites.length, first: g.whites[0], last: g.whites[g.whites.length - 1], right: g.keyX(108) + g.keyW(108), bw: g.bw}; })())`));
  assert.equal(g.n, 52); assert.equal(g.first, 21); assert.equal(g.last, 108);
  assert.ok(g.right <= 3440 + 1e-6 && g.right > 3440 - 1e-6, "C8's right edge lands on the panel's edge: " + g.right);
  assert.ok(Math.abs(g.bw - wW * 0.58) < 1e-9, "black keys scale with the whites");
  assert.deepEqual(app.run(`pianoRangeLabel(3440, 0)`), "A0 – C8");
  // the floor: narrower panels keep the finger size, exactly at the threshold the keys are still 44
  assert.equal(app.run(`pianoKeyW(1000)`), 44);
  assert.equal(app.run(`pianoKeyW(375)`), 36);
  assert.equal(app.run(`pianoKeyW(52 * 44)`), 44, "at exactly 2288 px the stretch is a no-op");
  assert.ok(app.run(`pianoKeyW(52 * 44 + 52)`) === 45, "one px per key past the threshold");
  assert.ok(app.run(`pianoMaxScroll(2000)`) > 0, "below the threshold the piano still scrolls");
  // a phone-width panel wide enough for 52 × 36 can't exist (480 > 1872 is false) — the 36 base never stretches
  assert.equal(app.run(`pianoKeyW(479)`), 36);
  // the live panel: octave buttons and swipes have nowhere to go, the readout names the whole piano
  app.run(`instWrap.clientWidth = 3440; instScroll = null; drawInst();`);
  assert.equal(app.run(`document.getElementById("instrange").textContent`), "A0 – C8");
  app.el("instoctup").click();
  assert.equal(app.run(`instScrollNow(3440)`), 0, "‹ › can't move a piano that already fits");
  app.run(`instScrollBy(-400)`);
  assert.equal(app.run(`instScrollNow(3440)`), 0, "nor can a swipe");
  assert.equal(app.run(`document.getElementById("instrange").textContent`), "A0 – C8");
  assert.equal(app.run(`pianoHit(3440 - 1, 160, 3440, 168)`), 108, "the last px of the panel is C8");
  assert.equal(app.run(`pianoHit(1, 160, 3440, 168)`), 21, "the first px is A0");
  app.run(`instWrap.clientWidth = 800; instScroll = null;`);
});

test("keyboard: one finger in Play mode is a glissando; in Scroll mode a drag pans silently and a tap plays on release", async () => {
  const app = await pianoApp("vm-keys-modes");
  app.run(`instSetSustain(true)`);
  keysDrag(app, { x: 10, y: KEYS_Y }, { x: 100, y: KEYS_Y });
  await settle(app);
  assert.deepEqual(held(app), [60, 62, 64], "Play mode: every key under the slide sounds (what Record relies on)");
  app.run(`instSetSustain(false)`);
  assert.deepEqual(held(app), [], "Sustain off releases them all");
  app.run(`instSetSustain(true); instSetMode("scroll")`);
  assert.equal(app.run(`localStorage.getItem("ff1roll-inst-mode")`), "scroll");
  assert.equal(app.run(`document.getElementById("instscroll").classList.contains("active")`), true);
  const before = app.run(`instScrollNow(800)`);
  keysDrag(app, { x: 300, y: KEYS_Y }, { x: 200, y: KEYS_Y });
  await settle(app);
  assert.deepEqual(held(app), [], "a Scroll-mode drag sounds nothing");
  assert.ok(app.run(`instScrollNow(800)`) > before, "…and pans the keys (finger left → higher keys come in)");
  assert.equal(app.run(`localStorage.getItem("ff1roll-inst-scroll-piano")`), String(app.run(`instScroll`)), "the lift stores where the keys were left");
  app.dispatch("instcanvas", pev("pointerdown", { clientX: 10, clientY: KEYS_Y }));
  app.dispatch("instcanvas", pev("pointermove", { clientX: 13, clientY: KEYS_Y })); // within the slop: still a tap
  await settle(app);
  assert.deepEqual(held(app), [], "nothing sounds while the finger is down — a tap is decided on release");
  app.dispatch("instcanvas", pev("pointerup", { clientX: 13, clientY: KEYS_Y }));
  await settle(app);
  assert.equal(held(app).length, 1, "the release plays its one key");
});

test("keyboard: a two-finger sideways drag scrolls in either mode and never sounds; the chord it began lets go", async () => {
  const app = await pianoApp("vm-keys-two");
  app.run(`instSetSustain(true)`);
  const before = app.run(`instScrollNow(800)`);
  twoFingerDrag(app, 300, -120);
  await settle(app);
  assert.deepEqual(held(app), [], "Play mode: the two landing keys were released the moment the fingers travelled");
  assert.ok(app.run(`instScrollNow(800)`) > before, "the keys scrolled");
  assert.equal(app.run(`instPtrs.size`), 0, "both fingers forgotten on lift");
  assert.equal(app.run(`instGesture`), null);
  app.run(`instSetMode("scroll")`);
  const mid = app.run(`instScrollNow(800)`);
  twoFingerDrag(app, 200, 150);
  await settle(app);
  assert.deepEqual(held(app), []);
  assert.ok(app.run(`instScrollNow(800)`) < mid, "Scroll mode too, the other way");
  // two fingers placed and held still are a chord, not a scroll
  app.run(`instSetMode("play")`);
  app.dispatch("instcanvas", pev("pointerdown", { pointerId: 1, clientX: 10, clientY: KEYS_Y }));
  app.dispatch("instcanvas", pev("pointerdown", { pointerId: 2, clientX: 100, clientY: KEYS_Y }));
  app.dispatch("instcanvas", pev("pointerup", { pointerId: 1, clientX: 10, clientY: KEYS_Y }));
  app.dispatch("instcanvas", pev("pointerup", { pointerId: 2, clientX: 100, clientY: KEYS_Y }));
  await settle(app);
  assert.equal(held(app).length, 2, "both notes of the chord ring");
  // a single finger afterwards still plays a run
  app.run(`instReleaseAll()`);
  keysDrag(app, { x: 10, y: KEYS_Y }, { x: 100, y: KEYS_Y });
  await settle(app);
  assert.equal(held(app).length, 3, "the glissando survives");
});

test("keyboard: the lock refuses every scroll — drag, two fingers, octave buttons — and disables ‹ ›", async () => {
  const app = await pianoApp("vm-keys-lock");
  app.el("instlock").click();
  assert.equal(app.run(`instLock`), true);
  assert.equal(app.run(`localStorage.getItem("ff1roll-inst-lock")`), "1");
  assert.equal(app.run(`document.getElementById("instoctup").disabled`), true);
  assert.equal(app.run(`document.getElementById("instlock").getAttribute("aria-pressed")`), "true");
  assert.ok(app.run(`document.getElementById("instlock").innerHTML`).includes("🔒"), "the glyph closes (via setControl)");
  const s0 = app.run(`instScrollNow(800)`);
  app.run(`instSetMode("scroll")`);
  keysDrag(app, { x: 300, y: KEYS_Y }, { x: 100, y: KEYS_Y });
  assert.equal(app.run(`instScrollNow(800)`), s0, "a one-finger Scroll-mode drag moves nothing");
  twoFingerDrag(app, 300, -150);
  assert.equal(app.run(`instScrollNow(800)`), s0, "two fingers move nothing");
  app.el("instoctup").click();
  app.run(`instOctave(1)`);
  assert.equal(app.run(`instScrollNow(800)`), s0, "the octave buttons move nothing");
  app.el("instlock").click();
  assert.equal(app.run(`document.getElementById("instoctup").disabled`), false);
  app.el("instoctup").click();
  assert.equal(app.run(`instScrollNow(800)`), s0 + 7, "unlocked: ‹ › work again");
});

test("keyboard: Sustain holds a tapped key until it is turned off; without it a tap is the old blip", async () => {
  const app = await pianoApp("vm-keys-sustain");
  app.dispatch("instcanvas", pev("pointerdown", { clientX: 10, clientY: KEYS_Y }));
  app.dispatch("instcanvas", pev("pointerup", { clientX: 10, clientY: KEYS_Y }));
  await settle(app);
  assert.deepEqual(held(app), [], "no pedal: nothing is held past the blip");
  app.el("instsustain").click();
  assert.equal(app.run(`instSustain`), true);
  assert.equal(app.run(`localStorage.getItem("ff1roll-inst-sustain")`), "1");
  assert.equal(app.run(`document.getElementById("instsustain").getAttribute("aria-pressed")`), "true");
  app.dispatch("instcanvas", pev("pointerdown", { clientX: 10, clientY: KEYS_Y }));
  app.dispatch("instcanvas", pev("pointerup", { clientX: 10, clientY: KEYS_Y }));
  app.dispatch("instcanvas", pev("pointerdown", { clientX: 100, clientY: KEYS_Y }));
  app.dispatch("instcanvas", pev("pointerup", { clientX: 100, clientY: KEYS_Y }));
  await settle(app);
  assert.deepEqual(held(app), [60, 64], "both ring on after the fingers lifted");
  app.dispatch("instcanvas", pev("pointerdown", { clientX: 10, clientY: KEYS_Y }));
  app.dispatch("instcanvas", pev("pointerup", { clientX: 10, clientY: KEYS_Y }));
  await settle(app);
  assert.deepEqual(held(app), [60, 64], "restriking a ringing key replaces its voice, never stacks");
  app.el("instsustain").click();
  assert.deepEqual(held(app), [], "pedal up: everything released");
  assert.equal(app.run(`localStorage.getItem("ff1roll-inst-sustain")`), "0");
});

test("keyboard: edge chevrons point at lit keys scrolled out of view, and a tap on one brings that key back", async () => {
  const app = await pianoApp("vm-keys-chevrons");
  selectAll(app); // C4 E4 G4 lasso'd = lit
  app.run(`drawInst()`);
  assert.deepEqual(app.run(`JSON.stringify(instChevrons)`), JSON.stringify({ left: null, right: null }), "home shows them all");
  app.run(`instSetScroll(33)`); // the top of the piano: the chord is off to the left
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify(instChevrons)`)), { left: 67, right: null }, "the nearest off-screen lit key (G4) is the left chevron's target");
  app.dispatch("instcanvas", pev("pointerdown", { clientX: 6, clientY: 300 }));
  app.dispatch("instcanvas", pev("pointerup", { clientX: 6, clientY: 300 }));
  const g = JSON.parse(app.run(`JSON.stringify((() => { const g = instGeom(800, 600); return {c4: g.keyX(60), g4: g.keyX(67)}; })())`));
  assert.ok(g.c4 >= 0 && g.g4 + 44 <= 800, "the tap scrolled the chord into view");
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify(instChevrons)`)), { left: null, right: null });
  assert.equal(app.run(`instFlash`), null, "the chevron tap played nothing");
  app.run(`instSetScroll(0)`); // A0 at the left: the chord is off to the right
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify(instChevrons)`)), { left: null, right: 60 });
  app.dispatch("instcanvas", pev("pointerdown", { clientX: 795, clientY: 300 }));
  app.dispatch("instcanvas", pev("pointerup", { clientX: 795, clientY: 300 }));
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify(instChevrons)`)), { left: null, right: null });
});

test("keyboard: a key tapped while nothing records goes to the Capture MIDI buffer (on at the press, off at the lift); while ● rolls it goes to Record instead", async () => {
  const app = await pianoApp("vm-keys-capture");
  app.run(`captureBuf = []; recording = false; playing = false; recPending = new Map();`);
  app.tick(500);
  app.dispatch("instcanvas", pev("pointerdown", { clientX: 10, clientY: KEYS_Y })); // C4, the home key at the left edge
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify(captureBuf.map(c => ({p: c.p, open: c.off === null})))`)), [{ p: 60, open: true }], "the press opens a buffered note");
  app.tick(300);
  app.dispatch("instcanvas", pev("pointerup", { clientX: 10, clientY: KEYS_Y }));
  assert.equal(app.run(`captureBuf[0].off - captureBuf[0].at`), 300, "the lift closes it with the real hold time");
  assert.equal(app.run(`recPending.size`), 0, "Record saw nothing");
  // a glissando: every new key is its own buffered note, the previous one closed
  keysDrag(app, { x: 10, y: KEYS_Y }, { x: 10 + 44 * 2, y: KEYS_Y });
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify(captureBuf.map(c => c.p))`)), [60, 60, 62, 64]);
  assert.equal(app.run(`captureBuf.filter(c => c.off === null).length`), 0, "all closed after the lift");
  // ● rolling: Record owns the key
  app.run(`captureBuf = []; recording = true; playing = true; recTake = []; playOffset = 0; playT0 = audio.currentTime;`);
  app.dispatch("instcanvas", pev("pointerdown", { clientX: 10, clientY: KEYS_Y }));
  assert.equal(app.run(`recPending.size`), 1);
  assert.equal(app.run(`captureBuf.length`), 0);
  app.dispatch("instcanvas", pev("pointerup", { clientX: 10, clientY: KEYS_Y }));
  app.run(`recording = false; playing = false; recTake = [];`);
});

// ---- the velocity lane (2026-10-04, docs/daw-inventory.md §4 #6) ----
// #vellane's stubbed box is 800×600; the lane's own geometry (velGeom) maps
// velocity ↔ y, so the tests ask it for coordinates instead of hardcoding.
async function velApp(name) {
  const app = await boot(name);
  app.run(`
    song.tracks[0].notes = [{t: 0, d: 480, p: 60, v: 80}, {t: 480, d: 480, p: 64, v: 80}, {t: 960, d: 480, p: 67, v: 100}];
    view.x = 0; view.pxq = 56; selTrack = 0; selNote = null; multiSel = []; multiSelKey = new Set(); editUndo = []; editRedo = [];
    setVelLane(true);
  `);
  return app;
}
const velXY = (app, tick, v) => JSON.parse(app.run(`JSON.stringify((() => { const g = velGeom();
  return {x: g.left + RULER_W + (${tick} / song.ppq) * view.pxq - view.x + 1.5, y: g.yOf(${v})}; })())`));
const vels = (app) => JSON.parse(app.run(`JSON.stringify(song.tracks[0].notes.map(n => n.v))`));
function velDrag(app, from, to, steps = 6) {
  app.dispatch("velcanvas", pev("pointerdown", { clientX: from.x, clientY: from.y }));
  for (let i = 1; i <= steps; i++) app.dispatch("velcanvas", pev("pointermove", { clientX: from.x, clientY: from.y + ((to.y - from.y) * i) / steps }));
  app.dispatch("velcanvas", pev("pointerup", { clientX: from.x, clientY: to.y }));
}

test("velocity lane: a device pref, off by default; shown in roll view only; a boot with the pref set opens it", async () => {
  const app = await boot("vm-vel-pref");
  assert.equal(app.run(`vwVel`), false, "off by default");
  assert.equal(app.el("vellane").classList.contains("on"), false);
  app.run(`setVelLane(true)`);
  assert.equal(app.run(`localStorage.getItem("ff1roll-vel-open")`), "1");
  assert.equal(app.el("vellane").classList.contains("on"), true, "a song is open and the view is the roll");
  app.run(`setViewMode("tracks")`);
  assert.equal(app.el("vellane").classList.contains("on"), false, "the lane is the roll's: hidden in Tracks view");
  app.run(`setViewMode("roll")`);
  assert.equal(app.el("vellane").classList.contains("on"), true);
  app.run(`setVelLane(false)`);
  assert.equal(app.run(`localStorage.getItem("ff1roll-vel-open")`), "0");
  assert.equal(app.el("vellane").classList.contains("on"), false);
  const app2 = await createApp({ storage: { "ff1roll-mode": "learning", "ff1roll-vel-open": "1" } });
  assert.equal(app2.run(`vwVel`), true, "the pref survives a relaunch");
});

test("velocity lane: velGeom maps 1..127 onto the strip, velHit grabs within 7 px and prefers a selected note on a shared beat", async () => {
  const app = await velApp("vm-vel-geom");
  const g = JSON.parse(app.run(`JSON.stringify((() => { const g = velGeom(); return {H: g.H, top: g.top, bot: g.bot, y127: g.yOf(127), y1: g.yOf(1), vTop: g.vOf(g.top), vBot: g.vOf(g.bot), vAbove: g.vOf(-50), vBelow: g.vOf(g.H + 50)}; })())`));
  assert.equal(g.y127, g.top); assert.ok(Math.abs(g.y1 - (g.bot - (g.bot - g.top) / 127)) < 1e-9);
  assert.equal(g.vTop, 127); assert.equal(g.vAbove, 127, "above the strip clamps to 127");
  assert.equal(g.vBot, 1, "the baseline is 1, never 0"); assert.equal(g.vBelow, 1);
  const p = velXY(app, 480, 80);
  assert.deepEqual(JSON.parse(app.run(`JSON.stringify((h => h && {ti: h.ti, ni: h.ni})(velHit(${p.x})))`)), { ti: 0, ni: 1 });
  assert.equal(app.run(`velHit(${p.x} + 20)`), null, "20 px away is not a grab");
  // two notes on one beat: the lasso'd one wins the stalk
  app.run(`song.tracks[0].notes.push({t: 480, d: 480, p: 72, v: 60}); multiSel = [{ti: 0, ni: 3}]; multiSelKey = new Set(["0:3"]); draw();`);
  assert.equal(app.run(`velHit(${p.x}).ni`), 3);
  app.run(`multiSel = []; multiSelKey = new Set(); draw();`);
  assert.equal(app.run(`velHit(${p.x}).ni`), 1, "unselected: the first stalk at that x");
});

test("velocity lane: dragging a stalk sets that one note's velocity, clamped 1..127 — one undo step per drag, a still tap none", async () => {
  const app = await velApp("vm-vel-drag");
  velDrag(app, velXY(app, 480, 80), velXY(app, 480, 100));
  assert.deepEqual(vels(app), [80, 100, 100]);
  assert.equal(app.run(`editUndo.length`), 1, "one entry for the drag");
  assert.equal(app.run(`editUndo[0].kind`), "mod");
  assert.equal(app.run(`editUndo[0].items.length`), 1);
  assert.match(app.el("noteinfo").textContent, /velocity 100 \(undo restores 80\)/);
  velDrag(app, velXY(app, 0, 80), { y: -40 }); // far above the strip
  assert.deepEqual(vels(app), [127, 100, 100], "clamped at 127");
  velDrag(app, velXY(app, 960, 100), { y: 10000 }); // far below
  assert.deepEqual(vels(app), [127, 100, 1], "clamped at 1, never 0");
  assert.equal(app.run(`editUndo.length`), 3);
  const p = velXY(app, 480, 100);
  app.dispatch("velcanvas", pev("pointerdown", { clientX: p.x, clientY: p.y }));
  app.dispatch("velcanvas", pev("pointerup", { clientX: p.x, clientY: p.y }));
  assert.equal(app.run(`editUndo.length`), 3, "a still tap pushes nothing");
  app.run(`editUndoPop(); editUndoPop(); editUndoPop();`);
  assert.deepEqual(vels(app), [80, 80, 100], "three undos walk the three drags back");
  app.run(`editRedoPop()`);
  assert.deepEqual(vels(app), [80, 100, 100]);
  // a cancelled pointer (the system took the touch) puts the notes back and pushes nothing
  const q = velXY(app, 480, 100);
  app.dispatch("velcanvas", pev("pointerdown", { clientX: q.x, clientY: q.y }));
  app.dispatch("velcanvas", pev("pointermove", { clientX: q.x, clientY: velXY(app, 480, 30).y }));
  assert.equal(vels(app)[1], 30, "live while dragging");
  app.dispatch("velcanvas", pev("pointercancel", { clientX: q.x, clientY: q.y }));
  assert.deepEqual(vels(app), [80, 100, 100]);
  assert.equal(app.run(`editUndo.length`), 1);
});

test("velocity lane: dragging a stalk inside a multi-selection scales the whole selection proportionally (grabbed note follows the finger, ratios kept, clamped) — one undo", async () => {
  const app = await velApp("vm-vel-scale");
  selectAll(app); // v = [80, 80, 100]
  velDrag(app, velXY(app, 960, 100), velXY(app, 960, 50)); // the loud note halves → everything halves
  assert.deepEqual(vels(app), [40, 40, 50]);
  assert.equal(app.run(`editUndo.length`), 1);
  assert.equal(app.run(`editUndo[0].items.length`), 3, "one mod entry holds all three");
  assert.match(app.el("noteinfo").textContent, /scaled 3 notes' velocities by the grabbed note, 100 → 50/);
  velDrag(app, velXY(app, 0, 40), velXY(app, 0, 120)); // ×3: the 50 would be 150 → clamped
  assert.deepEqual(vels(app), [120, 120, 127]);
  app.run(`editUndoPop()`);
  assert.deepEqual(vels(app), [40, 40, 50]);
  app.run(`editUndoPop()`);
  assert.deepEqual(vels(app), [80, 80, 100], "the pre-drag values come back exactly, not a re-derived ratio");
  assert.equal(app.run(`velScaled(80, 100, 50)`), 40);
  assert.equal(app.run(`velScaled(1, 1, 127)`), 127);
  assert.equal(app.run(`velScaled(3, 100, 1)`), 1, "never below 1");
  // a stalk OUTSIDE the selection drags alone, leaving the selection untouched
  app.run(`multiSel = [{ti: 0, ni: 0}]; multiSelKey = new Set(["0:0"]); draw();`);
  velDrag(app, velXY(app, 960, 100), velXY(app, 960, 64));
  assert.deepEqual(vels(app), [80, 80, 64]);
});

test("velocity lane: a song that isn't yours draws its stalks but refuses the drag with a status line (capture velocities are facts)", async () => {
  const app = await velApp("vm-vel-locked");
  app.run(`__ownKey = songKey; songKey = "albums/final-fantasy-1/overworld.mid"; draw();`); // a catalog key with no draft of ours: editableSong() false, same as a read-only capture
  assert.equal(app.el("vellane").classList.contains("on"), true, "still shown — the facts are worth seeing");
  assert.equal(app.run(`velVisible(velGeom()).length`), 3, "all three stalks drawn");
  velDrag(app, velXY(app, 480, 80), velXY(app, 480, 120));
  assert.deepEqual(vels(app), [80, 80, 100], "nothing changed");
  assert.equal(app.run(`editUndo.length`), 0);
  assert.equal(app.run(`velDrag`), null, "no drag was started");
  assert.match(app.el("noteinfo").textContent, /velocity edits work on your own songs|facts from the capture/);
  app.run(`songKey = __ownKey;`);
});
