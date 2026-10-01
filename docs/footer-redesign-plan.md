# Footer redesign — plan (advisor, 2026-09-30)

Why: at ~1030 px (iPad, AI docked full-height right) the footer holds up to
20 children; `#noteinfo` (flex:1, min-width:0) absorbed all the squeeze and a
six-note lasso chord read "F#3 · A#3 ·…". Hotfix shipped (3d60818):
`#noteinfo { order:-1; flex:1 1 100% }` — the readout's own first line.

Josh's usage (2026-09-30): USED A LOT — ☰ Notes, + Note, Lasso + the readout.
RARELY — 8va, key: not set (C) (didn't know what it does), find:, the
Tracks/Roll/Score switch, ◯5, Publish, ⏳ jobs.

## Option A v2 (recommended, revised with Josh's usage)
- Line 1: the readout + [Chord?] at its right end (#readline wrapper; a folded
  footer hides only line 2, never the readout).
- Line 2: [⊞ Lasso][🎹] … [≡ Notes][+ Note][⚠*][✦ reply*][Clear edits*][⋯ More]
  (* only when they apply; ⋯ More shows a ⏳ badge while jobs run).
- ⋯ More sheet, labelled rows: VIEW (Roll/Tracks/Score segment) · 8va "Show
  octave numbers" · find: "Light up one pitch everywhere" · ◯5 · KEY SIGNATURE
  (picker + mode + Set, with: "Tells Night Roll how to spell sharps/flats, draw
  the signature and number scale degrees. Never changes the sound.") · Publish… ·
  ⏳ Jobs. All ids kept; editor.spec.mjs:458 fold assertion → class.

## Option A v1 (superseded)
- `#infobar` row between `#subtitle` and `<footer>`: [find chip when active]
  `#noteinfo` (same id, moved) [8va][Chord?] (same ids — they act on the
  readout). Own View ▾ toggle ("ⓘ Status line"), restored by ▴ #panelshow,
  hidden in listener mode.
- Footer: [⊞ Lasso][🎹][♯ Theory ▾] … [≡ Notes][+ Note] + ⚠/⏳/✦ reply/Clear
  edits only when they apply. Publish → File ▾ (Josh: rarely used).
- ♯ Theory ▾ popover (viewsheet styling): find select, key row (key select —
  relabelled so its purpose is clear — Set this key, mode?, Set), ◯5. Existing
  nodes move in, listeners keep working. Gold dot on the button while find is on.
- 💬 leaves the footer (View ▾ → Notes strip already has it; refactor
  subbtn's handler into toggleSubtitle()).
- Container query: < ~760 px labels → glyphs with a long-press tip (own
  element, never setInfo); < ~440 px ▤ hides. Touch targets 44 px.
Option B: today's hotfix only. Option C: readout row at the top under the
transport (fights the album strip; three top rows already).

## Build steps (each shippable)
1. Hotfix — DONE (3d60818). Add a docking e2e check: #noteinfo ≥ 60% of
   footer width in every dock mode.
2. #infobar + move #noteinfo/#octbtn/#chordbtn; applyChrome pref
   `ff1roll-infobar-hidden`; help dt "Status line (info bar)" + FEATURES
   keyword; fix help text that says "strip above the footer".
3. ♯ Theory ▾ + find chip; help entries for find:/key: picker/Circle of fifths.
4. Declutter: 💬 out, Publish → File ▾, glyph collapse + tips.
5. 44 px targets; re-check footerLastVisible in all four dock modes.
6. Docs + iPad browser check with the AI docked full-height and beside-the-roll.

Constraints: srlive must equal #noteinfo (tests ~7422/7484); drift keywords
"Lasso", "Chord?", "8va", "find:", "Circle of fifths", "key: picker",
"mode?", "💬", "⏳", "⚠", "Status line (footer)", "opens the whole message
in a sheet" (tests ~2643–2654) must stay in the help region. Learning mode:
the find chip shows only the pitch he picked, never a key or chord.
