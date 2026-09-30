// Gesture-decode tests driven headlessly: plain event objects through the
// REAL canvas pointer handlers (see harness.mjs event injection). These are
// vm ports of e2e specs — while both exist, the e2e twin is the referee;
// after a port proves itself green-for-green, the e2e copy can retire.
// Coordinates are canvas-space (the stubbed rect sits at 0,0).
import test from "node:test";
import assert from "node:assert/strict";
import { createApp, pev } from "./harness.mjs";

function boot(name) {
  const app = createApp();
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

test("gesture: right-edge drag resizes every selected note", () => {
  const app = boot("vm-gest-resize");
  app.run(`mode = "select"`);
  selectAll(app);
  const edge = noteXY(app, 470, 64); // within the 8px-in-ticks grab zone of t+d=480
  const px16 = app.run(`(240 / song.ppq) * view.pxq`);
  drag(app, edge, { x: edge.x - px16, y: edge.y });
  assert.deepEqual(notes(app).map(n => n.d), [240, 240, 240]);
});

test("gesture: full-song move drags sections and the loop along", () => {
  const app = boot("vm-gest-move");
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

test("gesture: second finger flips pencil into pan — note rolled back, view scrolls", () => {
  const app = boot("vm-gest-pinch");
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

test("gesture: cycle highlight stretches by its edges, both directions", () => {
  const app = boot("vm-gest-cycle");
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

test("gesture: finger fast stroke pans; a dwell cold-grabs; selected = instant", () => {
  const app = boot("vm-gest-dwell");
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

test("gesture: custom grid — pencil taps land on 10ths-of-a-bar cells", () => {
  const app = boot("vm-gest-grid");
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

test("gesture: uneven grid divisions keep one exact phase from the anchor", () => {
  const app = boot("vm-gest-grid7");
  app.run(`gridDiv = 7; gridAnchor = {b: 5, q: 1};`);
  // cells are exact bt/7 floats from the anchor — no per-cell rounding drift
  const bt = app.run(`barTicks()`);
  const want = Math.round(4 * bt + 3 * (bt / 7));
  assert.equal(app.run(`gridCellStart(${4 * bt + 3 * (bt / 7) + 20})`), want);
});

test("grid sheet: chip tap applies instantly; off chip restores the meter", () => {
  const app = boot("vm-gest-gridmenu");
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

test("gesture: grid anchor typed in the sheet — 14.2 phase, bar line not a snap target", () => {
  const app = boot("vm-gest-gridanchor");
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

test("gesture: off-phase note's edge snaps TO the beat line (10-grid then 4-4)", () => {
  const app = boot("vm-gest-offphase");
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

test("gesture: grabbing a note outside a stale selection moves ONLY that note", () => {
  const app = boot("vm-gest-stalesel");
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

test("gesture: off-phase note MOVE lands ON the grid line (and-of-1)", () => {
  const app = boot("vm-gest-offmove");
  // a note born on the fives (t=1056, no 16th phase); drag toward beat 1.5 of
  // bar 2 (tick 2160) — must land exactly there, not 1056+n*120
  app.run(`song.tracks[0].notes = [{t: 1056, d: 240, p: 64, v: 80}]; multiSel = [{ti:0,ni:0}];
           multiSelKey = new Set(["0:0"]); mode = "select"; draw();`);
  const from = noteXY(app, 1056 + 120, 64); // grab mid-note
  const to = noteXY(app, 2160 + 120, 64);
  drag(app, from, to);
  assert.equal(notes(app)[0].t, 2160, "landed on the and of 1, phase gone");
});

test("insertTime: slide, stretch straddlers, leave exact-enders; one undo", () => {
  const app = boot("vm-gest-insert");
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

test("gesture: with the setting on, the Apple Pencil grabs a note at once — no dwell (default off)", () => {
  const app = boot("vm-gest-pen");
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

test("gesture: a stale drag (a lift the canvas never heard) can't turn the next touch into a pinch (Josh, 2026-09-30: every drag zoomed)", () => {
  const app = boot("vm-gest-stale");
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

test("gesture: palm rejection — a touch while the Pencil is down is ignored, not a pinch", () => {
  const app = boot("vm-gest-palm");
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
