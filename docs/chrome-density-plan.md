# Chrome density pass — plan (advisor, 2026-10-01)

Josh (screenshot 2026-10-01 14:37): 🎓 too small; the Claude pill crowds the
header; H makes track chips wide; the readout row costs roll height — "bring
an advisor to ask how Logic shows all of its tools".

Logic's pattern: rows hold only what's constantly used (customizable control
bar); modes are lit, legible controls, never tiny glyphs; track headers show
M/S by default and Hide only while hiding is in use (with one global "something
is hidden" indicator); selection info lives in an inspector; background work
shows in its own panel, not the main bar.

## Recommendations
1. 🎓 → a gold "🎓 Learning" tag at the header's right end (#modepill, where
   #nowchip was); only in Learning mode; tap opens View ▾ (never toggles);
   collapses to 🎓 under ~860 px. #lcdmode removed. Alt: "🎓 View ▾" label.
2. Claude status out of the header: remove #nowchip; the AI window already has
   #asknowstrip (allow 2 lines); ✦ AI gets a pulsing dot (::before) + aria-label
   while Claude works. Alt: keep the chip only while the AI window is closed.
3. Track chips: dot, name, M, S. Hide moves into the chip's voice menu (#vmhide;
   the Mixer keeps H); while hidden, the chip shows a lit gold H (one tap
   unhides). ~24 px narrower per chip. Tracks on their own row NOT recommended
   (−52 px of roll). Alt: only the selected chip shows M/S/H.
4a. ☰ Notes and + Note merge: one "☰ Notes ▴" button → a popover right above it
   with "+ New note" and "☰ All notes" (ids kept). ~90 px saved. Alt: split pill
   [☰ Notes │ +] (one tap each, ~45 px saved).
4b. The readout returns to the button row between the left and right groups,
   guaranteed ≥ 300 px (flex 1 1 300px); fitReadline() moves it back to its own
   row (.ownrow, today's layout) whenever the bar is too full (✦ reply, Clear
   edits) — never crushed. ~+26 px of roll in the usual case.

## Build order (each shippable)
1. DONE 2026-10-01 — Claude status out of the header (tests ~6277–6292; help
   "What Claude Code is doing now" keyword kept). 2. DONE 2026-10-01 — 🎓 tag
   (help "🎓 Learning mode" dd). 3. DONE 2026-10-01 — H off the chip (VoiceOver
   chip test ~7912 split hidden/not; help "H hides the track" keyword kept).
   See NIGHT-ROLL.md "Chrome density pass (2026-10-01)" for what shipped.
4. DONE 2026-10-01 — Notes popover: one "☰ Notes ▴" button opens a **drop-up**
   (Josh's term, 2026-10-01: "the reverse of a drop-down menu like the File
   menu — it drops upwards") holding "+ New note" (#notebtn, ids/handlers
   kept) and "☰ All notes" (#notesall, openNoteList() extracted). Help "+
   Note"/"☰ Notes" dds merged into one "☰ Notes ▴" dd; FEATURES gained
   "+ New note". Scope grew mid-build (Josh, same session): the footer's
   view button (#viewbtn) and ⋯ More (#moresheet) became drop-ups too, same
   pattern, one shared `openDropUp()`/`closeDropUp()` helper —
   - #viewbtn: a drop-up (#viewswitchmenu: ▦ Roll / ▤ Tracks / 𝄞 Score,
     current one ✓) instead of a cycling button; its own label now names the
     CURRENT view ("▦ Roll ▴"), not the next one.
   - ⋯ More (#moresheet): back from the 2026-09-30 tweaks pass's dockable
     window to a drop-up — no title bar, no Dock button, not in
     makeWindow()/WM_WINDOWS/docking.spec's WINDOWS any more; a stale
     docked/tabbed "moresheet" id from a device that had it docked is
     purged from `wm` on load.
   See NIGHT-ROLL.md "Chrome density pass (2026-10-01)" for the full writeup.
5. DONE 2026-10-01 — Readout inline + fitReadline: #readline moved into the
   button row (flex: 1 1 300px; min-width: 300px), the #footerspacer div
   dropped (the readout's own flex-grow splits the left/right groups now).
   fitReadline() (ResizeObserver on #footer + a MutationObserver on its
   children's style/class, both guarded for the vm harness) adds `.ownrow`
   (today's own-row layout: order:-1; flex-basis:100%) whenever the leftover
   drops under 300px. docking.spec's readout check: #noteinfo ≥ 300px OR
   (#readline.ownrow AND #noteinfo ≥ 60% of the footer); editor.spec's
   folding assertions (~458/482) re-checked — unaffected (#readline's id and
   the `footer.folded > :not(#readline)` rule are unchanged).
6. Docs done (this file + NIGHT-ROLL.md); Josh's iPad check (6-note lasso,
   hidden track, Learning on/off, 1376 and ~1030 px) — open item.

## Follow-up (Josh, 2026-10-01 afternoon, after using the pass above)

Screenshot 2026-10-01T15-37-41-752Z + six rulings, same sitting as two more
fixes from his own use of the build (#asknowstrip height jump, a
ResizeObserver ⚠). See NIGHT-ROLL.md "Chrome density pass — follow-up" for
the full writeup; summary:

1. DONE — ⋯ More removed ENTIRELY (not just back to a drop-up — gone). Its
   groups fold into View ▾: HIGHLIGHT / READOUT (8va, find:, ◯5, same ids)
   between Panels and Display; a new BACKGROUND (⏳ Jobs, ⚠ Messages) between
   Display and Mode.
2. DONE — ⏳ Jobs back on the footer's right end (same #jobsbtn node),
   hidden with no jobs; View ▾ → BACKGROUND → ⏳ Jobs always reachable, with
   a running count, even at zero jobs (so a finished one stays reviewable).
3. DONE — ⚠ errbtn: footer shows only on UNREAD (not just non-empty log);
   View ▾ → BACKGROUND → ⚠ Messages always reachable regardless.
4. DONE — View ▾'s VIEW group collapsed from three permanent rows to one
   "▸ View type: <current>" expanding row (#vwViewType/#vwViewTypeRow) —
   #vwRoll/#vwTracksView/#vwScore keep their ids/handlers, just nested.
5. DONE — the header's gold "🎓 Learning" tag (#modepill) removed entirely;
   Learning mode stays in Settings and View ▾ → Mode only.
6. DONE — ✦ AI's pulsing dot (#askbtn.working::before/@keyframes
   asknowpulse) removed; the aria-label status text (and the "working"
   class it hangs off) is unchanged — VoiceOver still gets it, nothing
   visual remains.
7. DONE (same session, found mid-build) — #asknowstrip reserves a fixed
   2-line height (`min-height: calc(1.3em * 2)`) so a status crossing the
   1↔2-line boundary never shifts the chat log below it; only the tapped-
   open state is allowed to grow.
8. DONE (same session) — fitReadline's RO/MO callbacks go through a
   requestAnimationFrame-deferred `scheduleFitReadline()` instead of
   calling `fitReadline` (which writes to the observed subtree) directly,
   fixing the "ResizeObserver loop completed with undelivered
   notifications" warning at the source; a `BENIGN_ERRORS` filter in the
   `window.onerror` handler also drops that message (and its "limit
   exceeded" sibling) as belt-and-suspenders, since it's never actionable.

Tests: `tests/night-roll.test.mjs` updated throughout (footer order,
fitReadline's stub-width test, the View ▾ structure test, the jobs/⚠-log
tests, three new tests for #modepill/working-dot/asknowstrip/BENIGN_ERRORS);
FEATURES' "⋯ More" keyword → "View type"; `node tools/build_help.mjs` run.
Open item: Josh's iPad check, now against this build instead.
