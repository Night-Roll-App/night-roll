# Note movement — how DAWs do it, where Night Roll differs, what to build

Advisor plan, 2026-10-10. Source: Josh, Terminal #352/#353/#355/#358/#359
("I really hate our movement ... review how the DAWs do it"). Quick fixes
already shipped today: b24f139, b13cae7, aa02b1e. Status: step 1 (M2 —
keep its spot, but lines pull — for moves and both edges) is built; the rest is not.
Under half a step of sideways motion the point stays put (not "by construction":
on a fine grid a wobble is nearer a line than the note's own spot).

## 1. How other DAWs do it

Confidence tags: **[doc]** checked in the vendor's manual today;
**[known]** long-standing behaviour I'm confident of; **[unsure]** my memory, verify before relying on it.

| Topic | Logic Pro (Mac) | Logic Pro (iPad) | GarageBand (iPad) | FL Studio | Ableton Live | Cubasis (iPad) |
|---|---|---|---|---|---|---|
| Snap value vs note length | Separate: Snap menu (Smart/Bar/Beat/Division/Ticks) vs the length you draw [known] | Separate Snap pop-up with a "Snap to Grid" switch [doc] | No length picker; drawn length follows the grid [unsure] | Separate: Snap menu vs the "last note length" you draw with [known] | Separate: grid vs drawn length = one grid cell [known] | Separate: Snap grid (bars to 1/64) [doc]; separate Quantize value [doc] |
| Relative or absolute when moving | **Relative by default**: a note keeps its distance from the grid; "Snap Notes to Absolute Value" turns absolute on [doc] | Same engine, I believe same default [unsure] | Unsure [unsure] | Unsure; I believe it snaps relative to where you grabbed [unsure] | **Both**: a note snaps to grid lines *and* to its own offset from the grid ("preserves a groove") [doc] | Unsure [unsure] |
| Resizing | Length changes in snap steps, same relative rule [known] | Same [unsure] | Grid-follows-zoom [unsure] | Snap applies to the end [known] | Same as moving [known] | Snap applies to lengths too [doc] |
| Grid follows zoom | "Smart" snap follows zoom [known] | Smart available [unsure] | Yes — zoom in, the grid gets finer [known] | Grid lines follow zoom; snap is a chosen value [known] | "Adaptive" (follows zoom) or "Fixed" grid; ⌘1/⌘2 narrower/wider [known] | Unsure [unsure] |
| Bypass snap for a moment | Hold Ctrl while dragging (Ctrl+Shift = ticks) [known] | Hold a note still ~1 s: the view **zooms in** under your finger for precision [doc]; Snap off in the pop-up [doc]; type a position in the Inspector [doc] | Pinch to max zoom, pinch again: "Snap to Grid off" banner; zoom out to turn it back on [doc] | Hold Alt while dragging [known] | Hold ⌘ (Mac) / Alt (Win) while dragging [doc]; ⌘4 toggles snap [known] | Snap on/off button [doc]; no hold gesture I know of [unsure] |
| Axis lock (only up/down, only sideways) | Preference "Limit Dragging to One Direction" (off by default) [known] | Unsure [unsure] | Unsure | None I know of [unsure] | None I know of [unsure] | Its Move tool moves horizontally only [doc] |
| Nudge with keys/buttons | ⌥←/→ by a "nudge value"; ⌥↑/↓ semitone, ⌥⇧↑/↓ octave [known] | Nudge buttons in the Inspector/edit menu [unsure] | — | Arrow keys by snap; Shift/Ctrl variants [unsure on exact keys] | ←/→ by grid, ↑/↓ semitone, ⇧↑/↓ octave, ⇧←/→ length [known] | Nudge in the editor toolbar [unsure] |
| Triplets | Pick a triplet Division (1/12, 1/24) — a grid choice, not a note-length choice [known] | Same [unsure] | Unsure | Snap menu lists triplet values ("1/3 beat", "1/6 step") [known] | ⌘3 toggles the triplet grid [known] | Grid menu lacked triplet values (forum reports, Cubasis 2/3); you quantize afterwards [doc-ish] |

What they all share: **the grid is its own setting, separate from the length
you draw**; moving a note with **no sideways motion never moves it in time**;
**some way to go off the grid** for one drag; on touch, **precision comes from
zooming in** (GarageBand's adaptive grid, Logic iPad's hold-to-zoom).

## 2. What Night Roll does today, and the root causes

1. **Five grids, two of them chosen by the length buttons.**
   - Moves: `moveSnapTicks()` at src/model/grid.js:23-32. It reads `S.pencilDur`, the
     *length you'd draw*: T → 16th-triplets, 32 → 32nds, else 16ths (32nds once the song has any).
   - Edges: a separate "fine" grid, src/input/gestures.js:1321 and :1339 (32nds, or 16th-triplets with T on).
   - Pencil tap: `pencilGridTicks()`, grid.js:73-76. Pencil stretch: gestures.js:1267.
   - Cursor: `cursorTapSnapTicks`/`cursorDragSnapTicks`, grid.js:36-40.

   Josh can't see which grid a drag will use.
2. **Touching a note silently changes the buttons.** `gridFollowNote()`
   (src/ui/note-editor.js:700-712) runs on every grab (gestures.js:1059). It flips
   T and the length to match the note. That is #352's "it reselected the T
   automatically". b24f139's `S.tripletOffByHand` flag patches one direction of it.
3. **Moves snap to absolute grid lines; DAWs default to relative.** The roll move
   snaps the grabbed note to the nearest line (`snapTickAbs`, gestures.js:1298-1308;
   the rule dates from 2026-08-24). So a note *between* lines jumps to a line on the
   first step. This caused #352 (triplets wouldn't step by 16ths) and #358
   (a straight-down drag shifted sideways). aa02b1e adds a half-step dead zone
   (:1308), but a drag past half a step still jumps.
   - Night Roll is inconsistent with itself: the tracks-view move (:1277, :1286) and
     the arrow keys (note-editor.js:1765-1766) are *relative*.
4. **Edges have the same absolute snap and no dead zone** (gestures.js:1322, :1340).
   - Grab the end of an off-grid note (a triplet with T off) and wobble it: it snaps
     to a 32nd line. This is the same class of bug as #358, not yet fixed.
   - #355 ("goes farther than I want") is the same cause: from an end that sits
     between lines, a step is not one 16th.
5. **The grid ignores zoom.** The default zoom `pxq: 56` (src/state.js:41) works out to:
   - a 16th = 14 px
   - a 32nd = 7 px
   - a 16th-triplet ≈ 9 px

   These are all narrower than a fingertip, which also hides the note. The edge grab
   zone is ±8 px (gestures.js:1067-1068), and notes under 24 px wide have no edges at all (:1066).
6. **No way off the grid for one drag.**
   - No modifier is read in the move code. Option is "duplicate" (:1060).
   - A second finger *cancels* the drag and puts the notes back (gestures.js:1004-1017),
     because two fingers mean pan/zoom.
7. **No axis lock**, apart from aa02b1e's dead zone.

**Root cause:** the grid isn't one visible thing. It is derived from the
draw-length buttons, changed behind Josh's back by `gridFollowNote`, and
different for moves and edges. On top of that, snapping is absolute, which
fights any note that isn't on the current grid. Every fix today was a patch
on one of those two facts.

## 3. Recommended model (touch-first; keyboard/trackpad too)

- **M1. One grid, visible.** One value, shown on the ▦ chip (it already exists
  for the custom grid). Everything uses it: moves, both edges, arrow-key nudges
  and the pencil stretch.
  - The value is **Auto** (default) or a picked 1/4, 1/8, 1/16, 1/32, with a **T** on the grid itself.
  - The draw-length buttons only set the length of new notes (but see Q3: Josh asked for the coupling on 2026-10-03).
  - The custom grid (`S.gridDiv`) stays and still outranks everything.
- **M2. "Keep its spot, but lines pull."** This is Ableton's documented rule. While
  dragging, the note may land on either of:
  - (a) any grid line, or
  - (b) its original spot plus whole grid steps.

  It takes whichever is nearest the finger, with the same rule for left and right edges.
  - No sideways motion means no time change, by construction. That replaces aa02b1e's special case.
  - A triplet with T off slides by exact 16ths and stays a triplet.
  - An off-phase note can still reach the "and of 1", so the 2026-08-24 rule and its tests
    (tests/gestures.test.mjs:379, :431) keep passing.
  - An end grows by exactly one grid step (#355).
- **M3. Auto grid follows zoom.** Use the finest of 1/4…1/32 (or the T step) whose
  step is at least ~16 px for a finger or ~8 px for the Pencil, mouse or trackpad.
  To place finer, zoom in, as in GarageBand and Ableton's adaptive grid. The ▦
  chip shows the live value ("▦ 16 auto").
- **M4. Off the grid for one drag.**
  - Trackpad/mouse: hold ⌘ while dragging (Ableton's key; Ctrl is right-click on a Mac trackpad).
  - Touch: while a note is **already grabbed and moving**, a second finger resting
    anywhere turns snapping off until it lifts. Before a grab, two fingers still pan/zoom.
  - Ticks are the step in this mode. The info line says "free".
- **M5. Axis lock, light.** Decide once, after the first ~12 px:
  - mostly vertical (|dy| > 2|dx|) → the drag only changes pitch;
  - otherwise both.

  With M2, this is only a guard against wobble.
- **M6. Nudge buttons for touch.** ◀ ▶ (one grid step) and ▲ ▼ go in the note menu
  (the hold menu, `openNoteMenu`) or the edit row. The keyboard keeps today's keys
  (←/→ step, ⌥←/→ length, ↑/↓, ⇧ octave), all on the M1 grid.

## 4. First step to build (small, no UI change)

**M2 alone**, for moves and both edges in the roll:
- Add `snapKeepSpot(orig, rawDelta, g)` to src/model/grid.js. It returns the
  delta to the nearest of {grid lines near orig+rawDelta} ∪ {orig + k·g}, where g
  is the cell (and respects the custom-grid anchor, `gridAnchorTick`).
- Use it at gestures.js:1308 (move), :1322 (left edge) and :1340 (right edge).
  Keep today's grids (`moveSnapTicks` for moves, the fine grid for edges); only the rule changes.
- Delete aa02b1e's dead-zone special case. M2 covers it.
- Tests in tests/gestures.test.mjs:
  - (a) off-grid note, straight-down drag → t unchanged;
  - (b) a triplet with T off, dragged one 16th → t + 120 (ppq 480), still between lines;
  - (c) off-phase move and edge still land on the beat (existing :379, :431);
  - (d) an off-grid end, wobbled 3 px → unchanged;
  - (e) an off-grid end, dragged one 32nd → d + 60.
- Help: rewrite the Grid entry's move/edge sentences (help/help.html:35), then
  `node tools/build_help.mjs`. Ask action: not applicable (drag behaviour).

Then, in order and each one push: M4 touch + ⌘ (needs the pinch hand-off at
gestures.js:1004 changed for an armed `noteEdit`) → M1 + M3 together (after Q2–Q4) → M6 → M5 if wobble is still reported.

## 5. Trade-offs / the case against

- **The case against M2:** absolute snap was Josh's own rule (2026-08-24). Mixing
  two kinds of target can feel jumpy when a line and an offset spot are 1–2 px apart.
  - Mitigation: ignore offset spots within ¼ step of a line (the line wins).
  - Alternative: Logic's plain relative rule plus an "absolute" switch. It's simpler,
    but it loses one-gesture reach to the line.
- **The case against M1/M3:** the coupled length→grid was asked for (2026-10-03,
  "with 32nd selected, notes still drag only in 16ths"), and `gridFollowNote` was
  asked for (2026-09-12).
  - Decoupling means one more control.
  - Auto grid means the step changes when he zooms. Some players hate that; Ableton and Logic both offer Fixed for that reason.
- **The case against M4 on touch:** it changes what a second finger means mid-drag.
  - Today it cancels the move. After M4 it can't be used to pan away mid-drag.
  - Logic iPad's hold-to-zoom avoids that but costs a second of waiting. That's the alternative if Q5 is no.

## 6. Questions for Josh (plain words, one example each)

- **Q1. When you slide a note that sits between grid lines, should it keep its in-between spot?**
  Example: a triplet note a little after beat 2. Slide it right one step:
  - (a) it lands a little after the next 16th — same feel, just later;
  - (b) it snaps onto the 16th line.

  Suggested: (a), but a line still "catches" it if your finger stops right on one.
- **Q2. Should the grid get finer as you zoom in?**
  Example: zoomed out, a drag moves in 8ths; zoom in on one bar and it moves in 32nds.
  Or should it always move by what you picked until you pick something else?
- **Q3. Should the note-length buttons still decide how far a drag moves?**
  Example: today, picking "32" to draw short notes also makes every drag step in 32nds,
  and picking T makes drags step in triplets. The other way: a separate grid button (▦) for drag steps,
  with the length buttons only for drawing.
- **Q4. When you grab a triplet note, should T switch on by itself?**
  Example: you tap a triplet and the T button lights up, so the next drag goes in triplet steps.
  Keep that, or never change your buttons unless you tap them?
- **Q5. Is "second finger down = no grid" OK, only while a note is already being dragged?**
  Example: drag a note with one finger, rest a second finger anywhere, and the note slides freely to any spot.
  Today a second finger cancels the drag and zooms instead.
- **Q6. If you start a drag straight up or down, should it lock to pitch only?**
  Example: you drag a note down a fifth, your finger drifts sideways a little, and it still doesn't move in time.
