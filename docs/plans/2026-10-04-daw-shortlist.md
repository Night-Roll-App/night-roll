# Plan: DAW shortlist (docs/daw-inventory.md §4) — remaining items

Status: draft → **Fable-reviewed 2026-10-04 (this version)** → Fable build
(one feature per builder branch/commit, each with help entry + tests; main
merges ONE at a time and builds the iPad after each). Done already: #1
playhead tag, #2/#3 keyboard (+Sustain, `src/ui/piano.js`, `src/input/keyboard.js`,
`src/render/instrument.js`). Starts after the repo tidy (HELP.md moves to docs/).

Every feature: tests (vm; gestures in tests/gestures.test.mjs), help-sheet
entry in index.html (touch gesture first, keyboard after), `node
tools/build_help.mjs`, a FEATURES keyword (tests/night-roll.test.mjs L2774),
NIGHT-ROLL.md section, docs/daw-inventory.md §4 row marked done, open-items;
no native dialogs; buttons only via `setControl` (src/ui/controls.js); new
src/ files go in the three manifests + modules.test fileCount; browser check
by the main session; iPad build per feature.

## Features (verified against the code)

### F1 Keyboard key stretch on wide windows — S
Today `pianoKeyW(W)` (src/ui/piano.js L39) is fixed 36/44 px; `pianoGeom`,
`pianoMaxScroll`, `pianoVisibleWhites` all derive from it, so the change is
one function: when `W >= PIANO_WHITES.length * base` return `W /
PIANO_WHITES.length` (52 whites), else `base`. 44 px stays the minimum.
Tests: W=3440 → wW ≈ 66.15, `pianoMaxScroll` = 0, last white's right edge ≤ W;
W=1000 → 44; W=375 → 36; octave buttons no-op when everything fits. Help: one
sentence in the keyboard entry; keyword "fills the panel".
Files: src/ui/piano.js, tests/gestures.test.mjs (or where the keyboard geometry tests live), index.html help.

### F2 Touch-and-hold a note → context menu; undo/redo gesture — S–M
Verified conflict: a long press on a note is ALREADY "dwell-to-grab"
(`HOLD_MS = 160`, src/input/gestures.js L847; Pencil grabs at once). Decided:
the menu opens when a grabbed note is held STILL for a further 600 ms (timer
in `S.drag`, cleared once movement exceeds the grab slop); release without
moving before 600 ms stays today's tap. Menu = a small positioned `.fmenu`
(same markup family as View ▾) at the finger: Cut, Copy, Paste at cursor,
Duplicate (⌘D), Delete, Quantize…, Split at cursor, Velocity… (opens the
note editor), Undo, Redo — each dispatches the SAME handler the edit row uses
(no new edit logic; find them by their `CONTROLS` ids). Three-finger
swipe: WebKit delivers iPadOS undo/redo only to editable content
(`beforeinput` historyUndo/Redo), never to a canvas page — decided NOT
implemented; Undo/Redo live in the menu; two-finger double-tap rejected
(pinch/pan grammar). Document the reason in NIGHT-ROLL.md.
Tests (gestures): hold 600 ms still → menu open, no move; move after grab →
no menu; menu action → same undo entry as the edit row; Learning/Normal
irrelevant. Files: src/input/gestures.js, index.html (menu markup + help),
src/ui/note-editor.js (export the row handlers if not already), tests/gestures.test.mjs.

### F3 Capture MIDI ("Keep that") — M
Hook points verified: on-screen keys → `instTap` → `instPlay(p, ticket)` /
`instReleaseVoice` (src/input/keyboard.js L98–134, L73); MIDI-in →
`midiMessage` (src/input/record.js L95) which only records when
`S.recording && S.playing`. Add `S.captureBuf` (RAM only — a take is not song
state; never localStorage): `{at: performance.now(), p, vel, off}` on every
note-on/off while NOT recording; trim to the last 60 s. "Keep that" button in
`#instbar` (CONTROLS entry) + Edit ▾ item: converts wall-clock to ticks with
the song's tempo at the cursor (`tickToSec/secToTick`, src/midi/parse.js),
raw (no snap — same rule as Record, "keeps what you played"), writes at the
cursor on `S.selTrack` through the same commit path `recFinishImpl` uses
(one `addBatch` undo), then clears the buffer. Refuses on a locked capture
song (the Record gate), on an audio track, and when the buffer is empty
(status line). Tests: cap at 60 s; tick mapping at 120 and 90 bpm; one undo
removes all; gates. Files: src/input/keyboard.js, src/input/record.js,
src/state.js, src/ui/controls.js, index.html (button, Edit ▾, help), tests/night-roll.test.mjs.

### F4 Velocity lane — M
New panel `#vellane` (canvas, 72 px) between the roll and `#instwrap`, toggled
View ▾ → Panels → "Velocity lane" (`vwVel`, device pref `ff1roll-vel-open`),
hidden in Tracks/Score views. Draws one stalk per note visible in the roll,
using the roll's own tick→x mapping (export it from src/render/roll.js if it
is not already); selected notes highlighted. Drag a stalk → `v` 1..127; drag
with a multi-selection → scale all proportionally; one undo per drag (`mod`
items, as `selEditApply` does); read-only on locked songs (stalks drawn,
drag refused with the status line). Chip envelopes (`n.ve`) drawn as a faint
read-only curve — facts. Module: src/ui/vellane.js (new → manifests).
Tests: hit test, drag math (clamp, proportional scale), undo, locked gate,
pref persistence. Files: src/ui/vellane.js, src/render/roll.js (export),
src/ui/chrome.js (menu), src/ui/wm.js only if the panel must dock (it should
not — it is a strip under the roll), index.html (panel + menu + help), src/state.js, tests.

### F5 Typed bar jump + move the whole cycle — S
LCD: `#lcdbar` (index.html L1350) has no handler (tempo/meter/key do, src/ui/chrome.js
`initChrome2` L1610). Tap → `#barjump` sheet (one `<input type="number"
inputmode="numeric">`, Go; Enter works) → `seekOrMoveCursor(tick)`
(src/input/gestures.js L483) clamped to 1..`askBarsCount()`. Cycle: today
only the ends grab (`rangeEdge` "a"/"b" at ±12 px, gestures.js L1029–1035);
a drag that starts INSIDE the amber band and > 12 px from both ends
becomes `rangeMove`: `a` and `b` shift together, bar-magnetic (`rulerSnapX`),
clamped at 0, length preserved; the cycle stays armed. A drag starting
outside the band still draws a new range. Tests (gestures): move keeps
length; clamps at 0; ends still stretch; outside drag creates; bar jump
clamps and seeks; Enter. Files: src/ui/chrome.js, src/input/gestures.js, index.html (sheet + help), tests/gestures.test.mjs.

### F6 Score → print page — M
Verified: src/render/score.js draws with `VF.Renderer.Backends.CANVAS`
(L233) and builds the model per measure (`buildScoreModel`). Decided: a new
src/render/score-print.js renders the whole score into SVG pages (VexFlow's
SVG backend into an offscreen div; N systems per A4/Letter-ratio page; title
+ page numbers), wraps them in a standalone HTML document with `@page` CSS,
and hands it over without any native dialog: `navigator.share({files})`
where available (iPad → share sheet → Print/Save to Files as PDF), else an
`a.download` of `<song>-score.html` (the Download .mid path). No
`window.print()` (modal, unsupported in the WKWebView). No in-app PDF writer
(no library; out of scope — say so in help). File ▾ → "Print score…" beside
Download audio. Tests: page splitting (systems per page, last page partial),
the SVG contains every measure of a 3-track starter, file name, the HTML has
no external references (self-contained). Files: src/render/score-print.js
(new → manifests), src/render/score.js (export the model/engrave pieces
needed), src/ui/sheets.js (File ▾ entry), index.html (menu + help), tests.

## Lanes (disjoint files inside a lane are sequential; lanes run in parallel, each in its own worktree branch)
| Lane | Order | Shared hot spots at merge |
|---|---|---|
| A | F1 → F5 → F2 | gestures.js (F5, F2), chrome.js (F5), piano.js (F1) |
| B | F3 → F4 | keyboard.js/record.js (F3), state.js (both), roll.js (F4) |
| C | F6 | score.js, sheets.js |
Every feature touches index.html (help sheet + markup), tests/night-roll.test.mjs
FEATURES and often src/state.js — mechanical merge conflicts; main merges one
feature at a time, re-runs `npm test` + check.mjs, builds the iPad, waits for
Josh's gesture report before the next merge in that lane.

## Verification (each feature)
`npm test`; `node tools/split/check.mjs`; `node tools/package.mjs --check`;
`node tools/build_help.mjs` (docs/HELP.md after the tidy); smoke in CI; main
session: real-browser check (gestures F2/F5 by hand; F6's page opened and
printed to PDF from Safari once); iPad build per feature (memory: build by
default; ear/gesture report is the test).

## Risks
- F2 changes the feel of a held note — Josh vetoes by report ("way too damn hard" history); the 600 ms is a constant to tune.
- F3 wall-clock → ticks drifts across a tempo change — map through the tempo map, not one bpm.
- F4 is a new always-visible strip when on — a layout change: real-browser eyes before push (memory: no unseen layout ships); off by default.
- F6 share-sheet file support differs by iPadOS version — the download fallback must work in the WKWebView too (verify the existing Download audio path).
