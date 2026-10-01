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

## Build steps (each shippable) — v1's list, superseded by v2 below once
Josh picked A = Option A v2 (2026-09-30):
1. Hotfix — DONE (3d60818). Add a docking e2e check: #noteinfo ≥ 60% of
   footer width in every dock mode.
2. #infobar + move #noteinfo/#octbtn/#chordbtn; applyChrome pref
   `ff1roll-infobar-hidden`; help dt "Status line (info bar)" + FEATURES
   keyword; fix help text that says "strip above the footer".
3. ♯ Theory ▾ + find chip; help entries for find:/key: picker/Circle of fifths.
4. Declutter: 💬 out, Publish → File ▾, glyph collapse + tips.
5. 44 px targets; re-check footerLastVisible in all four dock modes.
6. Docs + iPad browser check with the AI docked full-height and beside-the-roll.

## Build steps v2 (Option A v2) — 1-5 DONE (2026-09-30), not yet pushed
1. **#readline** — DONE. #noteinfo (flex:1 1 0, same 2-line clamp) +
   #chordbtn at its right end, order:-1/flex:1 1 100% on the wrapper, not
   #noteinfo directly. Replaces the 3d60818 hotfix CSS.
2. **Footer line 2 trimmed to what's USED A LOT** — DONE. ⊞ Lasso, 🎹,
   ☰ Notes, + Note, then ⚠/✦ reply/Clear edits only when they apply, ⋯ More
   always last (gold ⏳N badge mirrors #jobsbtn while a job runs).
3. **#moresheet** — DONE. VIEW (viewseg 3-way, replaces the cycling
   #viewbtn) · SELECTION READOUT (8va, now always-visible — no more
   show/hide in refreshSelInfo) · HIGHLIGHT (find:, ◯5) · KEY SIGNATURE
   (picker + mode + Set + the fixed "never changes the sound" line) · SONG
   (Publish, ⏳ Jobs). Styled/positioned like #viewsheet (JS-anchored
   dropdown, clamped by songRegionRight()) on tablet/desktop; a phone
   (≤480px) gets a full-width bottom sheet instead. Outside-tap close
   exempts a native `<select>` so iOS's own picker can't close it mid-pick.
   All ids kept — every handler and test still fires where it always did.
4. **💬 out of the footer** — DONE. #subbtn is a hidden, inert node; View ▾
   → 💬 Notes strip calls the extracted `toggleSubtitle()` directly.
5. **Folding + sizing** — DONE. `footer.folded > :not(#readline)` (a class,
   not `footer.style.display="none"`) — editor.spec.mjs:458 now asserts the
   class, plus a new check that #noteinfo stays visible while folded.
   `footer button, footer select { min-height: 44px; }`. A container query
   on `footer` (`@container (max-width: 420px)`) drops the "⊞ Lasso"/
   "⋯ More" labels (a `.ftxt` span) to bare glyphs, aria-labels unchanged.
   docking.spec.mjs: #noteinfo ≥ 60% of the footer's width, all four dock
   modes (was already step 1's ask — folded in here since it's the same
   "narrow footer" guard).
6. Not done yet: Josh's own browser check (1376px and ~1030px/AI docked
   right, a 6-note lasso) — this session doesn't run Playwright or
   claude-in-chrome for its own verification pass; NIGHT-ROLL.md/
   open-items.md are updated, HELP.md rebuilt (`node tools/build_help.mjs`).

Constraints: srlive must equal #noteinfo (tests ~7422/7484); drift keywords
"Lasso", "Chord?", "8va", "find:", "Circle of fifths", "key: picker",
"mode?", "💬", "⏳", "⚠", "Status line (footer)", "opens the whole message
in a sheet" (tests ~2643–2654) must stay in the help region. Learning mode:
the find chip shows only the pitch he picked, never a key or chord.
